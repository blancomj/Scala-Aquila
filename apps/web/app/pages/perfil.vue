<script setup lang="ts">
// "Mi perfil" (menú de usuario, 2026-08-26) — datos de la cuenta, no de una
// copropiedad: sin middleware tenant/rbac (auth.global.ts ya exige sesión).
// Solo full_name/phone/avatar_url son auto-editables (authStore.
// actualizarPerfil/subirAvatar, SEC-06) — email es espejo de auth.users,
// is_platform_admin/status quedan fuera por diseño.
import { ROL_LABEL } from '~/utils/rol-labels'
import { useShortcuts } from '~/composables/useShortcuts'

definePageMeta({ layout: 'default' })

const usuario = useSupabaseUser()
const authStore = useAuthStore()
const tenantStore = useTenantStore()
const cliente = useSupabaseClient()
const router = useRouter()
const toast = useToast()

const fullName = ref('')
const phone = ref('')
const guardando = ref(false)
const error = ref<string | null>(null)

function poblarDesdePerfil(): void {
  fullName.value = authStore.profile?.full_name ?? ''
  phone.value = authStore.profile?.phone ?? ''
}

await useAsyncData('mi-perfil', () => authStore.cargarPerfil())
poblarDesdePerfil()
watch(() => authStore.profile, poblarDesdePerfil)

const iniciales = computed(() => {
  const nombre = fullName.value.trim() || usuario.value?.email || 'Usuario'
  const partes = nombre.trim().split(/\s+/)
  const letras =
    partes.length >= 2 ? partes[0]!.charAt(0) + partes[1]!.charAt(0) : nombre.slice(0, 2)
  return letras.toUpperCase()
})

async function guardar(): Promise<void> {
  error.value = null
  guardando.value = true
  try {
    await authStore.actualizarPerfil({
      fullName: fullName.value.trim() || null,
      phone: phone.value.trim() || null,
    })
    toast.add({ title: 'Guardado.', color: 'success' })
  } catch (excepcion) {
    error.value = mensajeError(excepcion, 'No se pudo guardar el perfil.')
  } finally {
    guardando.value = false
  }
}

// ── Avatar — mismo patrón de validación que CopropiedadConfiguracion.vue
// (subir logo), MIME/tamaño distintos porque es una foto, no un logo con SVG.
const MIME_AVATAR_PERMITIDOS = new Set(['image/png', 'image/jpeg', 'image/webp'])
const TAMANO_MAXIMO_AVATAR = 2 * 1024 * 1024
const archivoAvatar = ref<File | null>(null)
const subiendoAvatar = ref(false)
const errorAvatar = ref<string | null>(null)

function elegirAvatar(evento: Event): void {
  const input = evento.target as HTMLInputElement
  const archivo = input.files?.[0] ?? null
  errorAvatar.value = null
  if (archivo && (!MIME_AVATAR_PERMITIDOS.has(archivo.type) || archivo.size > TAMANO_MAXIMO_AVATAR)) {
    errorAvatar.value = 'Solo PNG, JPG o WEBP, hasta 2 MB.'
    archivoAvatar.value = null
    input.value = ''
    return
  }
  archivoAvatar.value = archivo
}

async function subirAvatar(): Promise<void> {
  if (!archivoAvatar.value) return
  errorAvatar.value = null
  subiendoAvatar.value = true
  try {
    await authStore.subirAvatar(archivoAvatar.value)
    archivoAvatar.value = null
    toast.add({ title: 'Foto actualizada.', color: 'success' })
  } catch (excepcion) {
    errorAvatar.value = mensajeError(excepcion, 'No se pudo subir la foto.')
  } finally {
    subiendoAvatar.value = false
  }
}

// ── Contraseña — sin campo de contraseña actual: la sesión ya autentica
// (mismo criterio que reset-password.vue, único lugar del app que ya
// llamaba updateUser antes de esta página).
const nuevaPassword = ref('')
const confirmarPassword = ref('')
const cambiandoPassword = ref(false)
const errorPassword = ref<string | null>(null)

async function cambiarPassword(): Promise<void> {
  errorPassword.value = null
  if (nuevaPassword.value.length < 8) {
    errorPassword.value = 'La contraseña debe tener al menos 8 caracteres.'
    return
  }
  if (nuevaPassword.value !== confirmarPassword.value) {
    errorPassword.value = 'Las contraseñas no coinciden.'
    return
  }
  cambiandoPassword.value = true
  try {
    const { error: errorUpdate } = await cliente.auth.updateUser({ password: nuevaPassword.value })
    if (errorUpdate) {
      errorPassword.value = errorUpdate.message
      return
    }
    nuevaPassword.value = ''
    confirmarPassword.value = ''
    toast.add({ title: 'Contraseña actualizada.', color: 'success' })
  } finally {
    cambiandoPassword.value = false
  }
}

// ── Cerrar sesión en todos los dispositivos — scope 'global' de GoTrue
// invalida todas las sesiones (no solo la de esta pestaña), así que
// termina echando también a quien lo pide.
const cerrandoTodo = ref(false)
const errorCerrarTodo = ref<string | null>(null)

async function cerrarTodasLasSesiones(): Promise<void> {
  errorCerrarTodo.value = null
  cerrandoTodo.value = true
  try {
    const { error: errorSignOut } = await cliente.auth.signOut({ scope: 'global' })
    if (errorSignOut) {
      errorCerrarTodo.value = errorSignOut.message
      return
    }
    authStore.limpiar()
    tenantStore.limpiar()
    // Mismo criterio que NavUsuarioMenu.vue: un login nuevo debe volver a
    // preguntar con cuál copropiedad trabajar.
    useCookie<boolean>('copropiedad-confirmada-sesion').value = false
    await router.push('/login')
  } finally {
    cerrandoTodo.value = false
  }
}

// ── Autenticación en dos pasos (TOTP) — auth.mfa.* de supabase-js, sin
// tabla propia: GoTrue guarda los factores. Un factor recién creado queda
// 'unverified' hasta confirmar el código del autenticador (challengeAndVerify);
// solo 'verified' cuenta como "2FA activo".
interface FactorTotp {
  id: string
  friendlyName: string | null
}

const factorActivo = ref<FactorTotp | null>(null)
const cargandoFactores = ref(true)
const inscripcion = ref<{ factorId: string; qrCode: string; secret: string } | null>(null)
const codigoVerificacion = ref('')
const verificando = ref(false)
const desactivando = ref(false)
const errorMfa = ref<string | null>(null)

async function cargarFactores(): Promise<void> {
  cargandoFactores.value = true
  try {
    const { data, error: errorFactores } = await cliente.auth.mfa.listFactors()
    if (errorFactores) throw errorFactores
    const verificado = data.totp.find((f) => f.status === 'verified')
    factorActivo.value = verificado
      ? { id: verificado.id, friendlyName: verificado.friendly_name ?? null }
      : null
  } catch (excepcion) {
    errorMfa.value = mensajeError(excepcion, 'No se pudo consultar el estado de 2FA.')
  } finally {
    cargandoFactores.value = false
  }
}
await cargarFactores()

async function iniciarInscripcionMfa(): Promise<void> {
  errorMfa.value = null
  try {
    const { data, error: errorEnroll } = await cliente.auth.mfa.enroll({ factorType: 'totp' })
    if (errorEnroll) throw errorEnroll
    inscripcion.value = { factorId: data.id, qrCode: data.totp.qr_code, secret: data.totp.secret }
  } catch (excepcion) {
    errorMfa.value = mensajeError(excepcion, 'No se pudo iniciar la activación de 2FA.')
  }
}

function cancelarInscripcionMfa(): void {
  inscripcion.value = null
  codigoVerificacion.value = ''
  errorMfa.value = null
}

async function verificarInscripcionMfa(): Promise<void> {
  if (!inscripcion.value || codigoVerificacion.value.trim().length !== 6) {
    errorMfa.value = 'Ingresa el código de 6 dígitos de tu app de autenticación.'
    return
  }
  errorMfa.value = null
  verificando.value = true
  try {
    const { error: errorVerify } = await cliente.auth.mfa.challengeAndVerify({
      factorId: inscripcion.value.factorId,
      code: codigoVerificacion.value.trim(),
    })
    if (errorVerify) throw errorVerify
    inscripcion.value = null
    codigoVerificacion.value = ''
    await cargarFactores()
    toast.add({ title: 'Autenticación en dos pasos activada.', color: 'success' })
  } catch (excepcion) {
    errorMfa.value = mensajeError(excepcion, 'Código incorrecto o expirado.')
  } finally {
    verificando.value = false
  }
}

async function desactivarMfa(): Promise<void> {
  if (!factorActivo.value) return
  errorMfa.value = null
  desactivando.value = true
  try {
    const { error: errorUnenroll } = await cliente.auth.mfa.unenroll({ factorId: factorActivo.value.id })
    if (errorUnenroll) throw errorUnenroll
    factorActivo.value = null
    toast.add({ title: 'Autenticación en dos pasos desactivada.', color: 'success' })
  } catch (excepcion) {
    errorMfa.value = mensajeError(excepcion, 'No se pudo desactivar 2FA.')
  } finally {
    desactivando.value = false
  }
}

// ── Copropiedades — tenantStore.memberships ya está poblado por
// layouts/default.vue (useAsyncData('memberships', ...) corre en todo el
// layout, incluido acá) — sin consulta propia.
const membresias = computed(() =>
  tenantStore.memberships.filter((m) => m.status === 'active'),
)

// Solo tiene sentido elegir "predeterminada" si hay más de una entre las
// que elegir — con una sola no se muestra nada (spec 2026-09-04).
const guardandoPredeterminada = ref(false)
const errorPredeterminada = ref<string | null>(null)

async function elegirPredeterminada(tenantId: string): Promise<void> {
  if (tenantId === tenantStore.tenantPredeterminadoId) return
  errorPredeterminada.value = null
  guardandoPredeterminada.value = true
  try {
    await tenantStore.actualizarTenantPredeterminado(tenantId)
    toast.add({ title: 'Copropiedad predeterminada actualizada.', color: 'success' })
  } catch (excepcion) {
    errorPredeterminada.value = mensajeError(excepcion, 'No se pudo actualizar la predeterminada.')
  } finally {
    guardandoPredeterminada.value = false
  }
}

// ── Accesos directos del sidebar ──────────────────────────────────
const {
  shortcuts: shortcutsUsuario,
  itemsDisponibles: shortcutsDisponibles,
  puedeAgregar: puedeAgregarShortcut,
  iconoPath: shortcutIconoPath,
  agregar: agregarShortcut,
  eliminar: eliminarShortcut,
  mover: moverShortcut,
  MAX_SHORTCUTS,
} = useShortcuts()

const busquedaShortcut = ref('')
const guardandoShortcut = ref(false)
const modalShortcutAbierto = ref(false)

const shortcutsFiltrados = computed(() => {
  const q = busquedaShortcut.value.toLowerCase()
  return shortcutsDisponibles.value.filter(
    (item) => item.label.toLowerCase().includes(q) || item.to.toLowerCase().includes(q),
  )
})

async function agregarShortcutPerfil(item: { to: string; label: string; icono: string }): Promise<void> {
  guardandoShortcut.value = true
  try {
    await agregarShortcut(item)
    modalShortcutAbierto.value = false
    busquedaShortcut.value = ''
    toast.add({ title: 'Acceso directo agregado.', color: 'success' })
  } catch (excepcion) {
    toast.add({ title: mensajeError(excepcion, 'No se pudo agregar.'), color: 'error' })
  } finally {
    guardandoShortcut.value = false
  }
}

async function eliminarShortcutPerfil(to: string): Promise<void> {
  guardandoShortcut.value = true
  try {
    await eliminarShortcut(to)
    toast.add({ title: 'Acceso directo eliminado.', color: 'success' })
  } finally {
    guardandoShortcut.value = false
  }
}
</script>

<template>
  <div class="max-w-lg space-y-8">
    <div>
      <h1 class="text-xl font-semibold mb-2">Mi perfil</h1>
      <p class="text-sm text-muted">Datos de tu cuenta. Visibles para los demás miembros de tus copropiedades.</p>
    </div>

    <h2 class="flex items-center gap-3 text-lg font-semibold">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="w-8 h-8 text-muted shrink-0">
        <path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2" />
        <circle cx="12" cy="7" r="4" />
      </svg>
      Datos personales
    </h2>

    <div class="flex items-start gap-4">
      <img
        v-if="authStore.profile?.avatar_url"
        :src="authStore.profile.avatar_url"
        alt=""
        class="w-16 h-16 rounded-full object-cover shrink-0 border border-default"
      >
      <span
        v-else
        class="w-16 h-16 rounded-full bg-neutral-200 dark:bg-neutral-800 text-muted text-lg font-semibold flex items-center justify-center shrink-0"
      >
        {{ iniciales }}
      </span>
      <div class="flex-1 min-w-0 space-y-2">
        <p class="text-sm truncate">
          {{ archivoAvatar ? archivoAvatar.name : 'PNG, JPG o WEBP · hasta 2 MB' }}
        </p>
        <div class="flex items-center gap-2">
          <UInput type="file" accept=".png,.jpg,.jpeg,.webp" size="sm" @change="elegirAvatar" />
          <UButton size="sm" :loading="subiendoAvatar" :disabled="!archivoAvatar" @click="subirAvatar">
            Subir foto
          </UButton>
        </div>
        <UAlert v-if="errorAvatar" color="error" variant="soft" :title="errorAvatar" />
      </div>
    </div>

    <form class="space-y-4" @submit.prevent="guardar">
      <UFormField label="Correo" name="email">
        <UInput :model-value="usuario?.email ?? ''" disabled class="w-full" />
      </UFormField>

      <UFormField label="Nombre completo" name="fullName">
        <UInput v-model="fullName" class="w-full" />
      </UFormField>

      <UFormField label="Teléfono" name="phone">
        <UInput v-model="phone" class="w-full" />
      </UFormField>

      <UAlert v-if="error" color="error" variant="soft" :title="error" />

      <UButton type="submit" :loading="guardando">Guardar cambios</UButton>
    </form>

    <div class="border-t border-default pt-6 space-y-6">
      <h2 class="flex items-center gap-3 text-lg font-semibold">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="w-8 h-8 text-muted shrink-0">
          <path d="M20 13c0 5-3.5 7.5-7.35 8.95a1 1 0 0 1-.6.01C8.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z" />
        </svg>
        Seguridad
      </h2>

      <div>
        <h3 class="flex items-center gap-2.5 text-sm font-medium mb-2">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="w-6 h-6 text-muted shrink-0">
            <rect width="18" height="11" x="3" y="11" rx="2" ry="2" />
            <path d="M7 11V7a5 5 0 0 1 10 0v4" />
          </svg>
          Cambiar contraseña
        </h3>
        <form class="space-y-4" @submit.prevent="cambiarPassword">
          <UFormField label="Nueva contraseña" name="nuevaPassword">
            <UInput
              v-model="nuevaPassword"
              type="password"
              autocomplete="new-password"
              minlength="8"
              class="w-full"
            />
          </UFormField>

          <UFormField label="Confirmar contraseña" name="confirmarPassword">
            <UInput
              v-model="confirmarPassword"
              type="password"
              autocomplete="new-password"
              minlength="8"
              class="w-full"
            />
          </UFormField>

          <UAlert v-if="errorPassword" color="error" variant="soft" :title="errorPassword" />

          <UButton type="submit" size="sm" :loading="cambiandoPassword">Cambiar contraseña</UButton>
        </form>
      </div>

      <div class="border-t border-default pt-6">
        <h3 class="flex items-center gap-2.5 text-sm font-medium mb-1">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="w-6 h-6 text-muted shrink-0">
            <path d="M20 13c0 5-3.5 7.5-7.35 8.95a1 1 0 0 1-.6.01C8.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z" />
            <path d="m9 12 2 2 4-4" />
          </svg>
          Autenticación en dos pasos
        </h3>
        <p class="text-xs text-muted mb-3">
          Pide un código de tu app de autenticación (Google Authenticator, Authy, etc.) al iniciar sesión.
        </p>

        <USkeleton v-if="cargandoFactores" class="h-9 w-32" />

        <template v-else-if="factorActivo">
          <div class="flex items-center gap-2 mb-3">
            <UBadge color="success" variant="soft">Activada</UBadge>
          </div>
          <UButton size="sm" color="error" variant="soft" :loading="desactivando" @click="desactivarMfa">
            Desactivar
          </UButton>
        </template>

        <template v-else-if="inscripcion">
          <div class="rounded-md border border-default p-4 space-y-3 max-w-xs">
            <p class="text-xs text-muted">
              Escanea este código con tu app de autenticación, o ingresa la clave manualmente:
            </p>
            <img :src="inscripcion.qrCode" alt="Código QR para activar 2FA" class="w-40 h-40 mx-auto">
            <p class="text-xs font-mono text-center break-all text-muted">{{ inscripcion.secret }}</p>
            <UFormField label="Código de 6 dígitos" name="codigoVerificacion">
              <UInput
                v-model="codigoVerificacion"
                inputmode="numeric"
                maxlength="6"
                placeholder="123456"
                class="w-full"
              />
            </UFormField>
            <div class="flex items-center gap-2">
              <UButton size="sm" :loading="verificando" @click="verificarInscripcionMfa">
                Verificar y activar
              </UButton>
              <UButton size="sm" color="neutral" variant="ghost" @click="cancelarInscripcionMfa">
                Cancelar
              </UButton>
            </div>
          </div>
        </template>

        <UButton v-else size="sm" color="neutral" variant="subtle" @click="iniciarInscripcionMfa">
          Activar 2FA
        </UButton>

        <UAlert v-if="errorMfa" color="error" variant="soft" :title="errorMfa" class="mt-3 max-w-xs" />
      </div>

      <div class="border-t border-default pt-6">
        <h3 class="flex items-center gap-2.5 text-sm font-medium mb-1">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="w-6 h-6 text-muted shrink-0">
            <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
            <polyline points="16 17 21 12 16 7" />
            <line x1="21" y1="12" x2="9" y2="12" />
          </svg>
          Cerrar sesión en todos los dispositivos
        </h3>
        <p class="text-xs text-muted mb-3">
          Termina cualquier otra sesión activa con tu cuenta, incluida esta.
        </p>
        <UButton size="sm" color="error" variant="soft" :loading="cerrandoTodo" @click="cerrarTodasLasSesiones">
          Cerrar todas las sesiones
        </UButton>
        <UAlert v-if="errorCerrarTodo" color="error" variant="soft" :title="errorCerrarTodo" class="mt-3" />
      </div>
    </div>

    <div v-if="membresias.length > 0" class="border-t border-default pt-6">
      <h2 class="flex items-center gap-3 text-lg font-semibold mb-2">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="w-8 h-8 text-muted shrink-0">
          <rect width="16" height="20" x="4" y="2" rx="2" ry="2" />
          <path d="M9 22v-4h6v4" />
          <path d="M8 6h.01" />
          <path d="M16 6h.01" />
          <path d="M12 6h.01" />
          <path d="M12 10h.01" />
          <path d="M12 14h.01" />
          <path d="M16 10h.01" />
          <path d="M16 14h.01" />
          <path d="M8 10h.01" />
          <path d="M8 14h.01" />
        </svg>
        Tus copropiedades
      </h2>
      <p v-if="membresias.length > 1" class="text-xs text-muted mb-3">
        La predeterminada es la que se preselecciona al iniciar sesión cuando tienes más de una.
      </p>
      <ul class="divide-y divide-default border border-default rounded-md">
        <li
          v-for="membresia in membresias"
          :key="membresia.id"
          class="px-3 py-2.5 flex items-center justify-between gap-3 text-sm"
        >
          <span class="truncate">{{ membresia.tenant.name }}</span>
          <div class="flex items-center gap-2 shrink-0">
            <UBadge color="neutral" variant="subtle">{{ ROL_LABEL[membresia.role] }}</UBadge>
            <UBadge v-if="membresias.length === 1" color="primary" variant="subtle">
              Predeterminada
            </UBadge>
            <UButton
              v-else-if="membresia.tenant_id === tenantStore.tenantPredeterminadoId"
              size="xs"
              color="primary"
              variant="subtle"
              disabled
            >
              Predeterminada
            </UButton>
            <UButton
              v-else
              size="xs"
              color="neutral"
              variant="ghost"
              :loading="guardandoPredeterminada"
              @click="elegirPredeterminada(membresia.tenant_id)"
            >
              Hacer predeterminada
            </UButton>
          </div>
        </li>
      </ul>
      <UAlert v-if="errorPredeterminada" color="error" variant="soft" :title="errorPredeterminada" class="mt-3" />
    </div>

    <div class="border-t border-default pt-6">
      <h2 class="flex items-center gap-3 text-lg font-semibold mb-2">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="w-8 h-8 text-muted shrink-0">
          <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
        </svg>
        Accesos directos
      </h2>
      <p class="text-xs text-muted mb-3">
        Atajos en el sidebar para llegar rápido a las páginas que más usas. Máximo {{ MAX_SHORTCUTS }}.
      </p>

      <ul v-if="shortcutsUsuario.length > 0" class="divide-y divide-default border border-default rounded-md mb-3">
        <li
          v-for="shortcut in shortcutsUsuario"
          :key="shortcut.to"
          class="px-3 py-2.5 flex items-center justify-between gap-3 text-sm"
        >
          <div class="flex items-center gap-2.5 min-w-0">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" class="w-4 h-4 shrink-0 text-muted">
              <path :d="shortcutIconoPath(shortcut.icono)" />
            </svg>
            <span class="truncate">{{ shortcut.label }}</span>
            <span class="text-xs text-muted truncate hidden sm:inline">{{ shortcut.to }}</span>
          </div>
          <div class="flex items-center gap-1 shrink-0">
            <UButton
              size="xs"
              color="neutral"
              variant="ghost"
              icon="i-heroicons-arrow-up"
              aria-label="Mover arriba"
              :disabled="shortcutsUsuario.indexOf(shortcut) === 0 || guardandoShortcut"
              @click="moverShortcut(shortcut.to, 'arriba')"
            />
            <UButton
              size="xs"
              color="neutral"
              variant="ghost"
              icon="i-heroicons-arrow-down"
              aria-label="Mover abajo"
              :disabled="shortcutsUsuario.indexOf(shortcut) === shortcutsUsuario.length - 1 || guardandoShortcut"
              @click="moverShortcut(shortcut.to, 'abajo')"
            />
            <UButton
              size="xs"
              color="error"
              variant="ghost"
              icon="i-heroicons-trash"
              aria-label="Eliminar acceso directo"
              :disabled="guardandoShortcut"
              @click="eliminarShortcutPerfil(shortcut.to)"
            />
          </div>
        </li>
      </ul>
      <p v-else class="text-xs text-muted mb-3">No tienes accesos directos configurados.</p>

      <UModal v-model:open="modalShortcutAbierto" title="Agregar acceso directo">
        <UButton
          size="sm"
          color="neutral"
          variant="subtle"
          :disabled="!puedeAgregarShortcut"
          icon="i-heroicons-plus"
          @click="modalShortcutAbierto = true"
        >
          Agregar
        </UButton>
        <template #content>
          <div class="p-4">
            <UInput
              v-model="busquedaShortcut"
              placeholder="Buscar página..."
              class="w-full mb-3"
              autofocus
              :ui="{ trailing: 'pr-8' }"
            >
              <template v-if="busquedaShortcut" #trailing>
                <button
                  type="button"
                  class="absolute right-1 top-1/2 -translate-y-1/2 rounded p-0.5 text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-300"
                  @click="busquedaShortcut = ''"
                >
                  <UIcon name="i-lucide-x" class="size-3.5" />
                </button>
              </template>
            </UInput>
            <ul class="max-h-64 overflow-y-auto space-y-0.5">
              <li v-if="shortcutsFiltrados.length === 0" class="text-sm text-muted py-2">
                Sin resultados
              </li>
              <li
                v-for="item in shortcutsFiltrados"
                :key="item.to"
              >
                <button
                  type="button"
                  class="w-full text-left text-sm px-3 py-2 rounded-md hover:bg-default flex items-center gap-3"
                  :disabled="guardandoShortcut"
                  @click="agregarShortcutPerfil(item)"
                >
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" class="w-4 h-4 shrink-0 text-muted">
                    <path :d="shortcutIconoPath(item.icono)" />
                  </svg>
                  <div class="min-w-0">
                    <p class="truncate">{{ item.label }}</p>
                    <p class="text-xs text-muted truncate">{{ item.to }}</p>
                  </div>
                </button>
              </li>
            </ul>
            <p class="text-xs text-muted mt-2">
              {{ shortcutsUsuario.length }}/{{ MAX_SHORTCUTS }}
            </p>
          </div>
        </template>
      </UModal>
    </div>
  </div>
</template>
