<script setup lang="ts">
// Drawer crear/editar miembro — mismo criterio que TerceroModal.vue
// (esCreacion = !membresiaId, no un prop aparte). A diferencia de
// TerceroModal, los dos modos muestran campos DISTINTOS, no la misma forma
// con menos datos precargados: crear = invitación (correo + rol, el
// profile del invitado no existe todavía); editar = correo de solo lectura
// + nombre/teléfono/estado/rol de un miembro que ya existe.
//
// Las reglas .drawer-*/.form-grid/.field de ficha-inmueble.css están
// scopeadas bajo el selector ".ficha-inmueble" (incluida la posición fixed
// del backdrop y las variables --sheet/--ink/etc.) — sin ese ancestro, el
// drawer se renderiza sin ningún estilo (bug real, visto en producción:
// "la edición y creación no aparece en un drawer"). usuarios/index.vue es
// una página Tailwind que no envuelve en .ficha-inmueble, así que este
// componente envuelve SU PROPIO contenido en un <div class="ficha-inmueble">
// (mismo patrón que TerceroModal.vue) en vez de tocar la página entera o el
// CSS compartido.
const props = defineProps<{ membresiaId?: string }>()
const emit = defineEmits<{ cerrar: []; guardado: [] }>()

const tenantStore = useTenantStore()
const membersStore = useMembersStore()
const invitationsStore = useInvitationsStore()

const esCreacion = computed(() => !props.membresiaId)

const email = ref('')
const role = ref<'agent' | 'auditor'>('auditor')
const rolOriginal = ref<'agent' | 'auditor'>('auditor')
const correoActual = ref('')
const fullName = ref('')
const phone = ref('')
const status = ref<'active' | 'suspended'>('active')

const guardando = ref(false)
const error = ref<string | null>(null)

function precargar(): void {
  const miembro = membersStore.miembros.find((m) => m.id === props.membresiaId)
  if (!miembro) return
  correoActual.value = miembro.profile?.email ?? ''
  fullName.value = miembro.profile?.full_name ?? ''
  phone.value = miembro.profile?.phone ?? ''
  status.value = miembro.profile?.status ?? 'active'
  role.value = miembro.role as 'agent' | 'auditor'
  rolOriginal.value = role.value
}

watchEffect(() => {
  if (props.membresiaId) precargar()
})

function validar(): string | null {
  if (esCreacion.value) {
    if (!email.value.trim()) return 'El correo es obligatorio.'
  } else if (!fullName.value.trim()) {
    return 'El nombre es obligatorio.'
  }
  return null
}

async function guardar(): Promise<void> {
  const tenantId = tenantStore.activeTenant?.id
  if (!tenantId) return
  const mensajeValidacion = validar()
  if (mensajeValidacion) {
    error.value = mensajeValidacion
    return
  }
  error.value = null
  guardando.value = true
  try {
    if (esCreacion.value) {
      await invitationsStore.invitar(tenantId, email.value.trim(), role.value)
    } else if (props.membresiaId) {
      await membersStore.actualizarPerfil(
        props.membresiaId,
        { fullName: fullName.value.trim(), phone: phone.value.trim(), status: status.value },
        tenantId,
      )
      if (role.value !== rolOriginal.value) {
        await membersStore.cambiarRol(props.membresiaId, role.value, tenantId)
      }
    }
    emit('guardado')
  } catch (excepcion) {
    error.value = excepcion instanceof Error ? excepcion.message : 'No se pudo guardar.'
  } finally {
    guardando.value = false
  }
}
</script>

<template>
  <div class="ficha-inmueble">
    <UiDrawer
      :abierto="true"
      :titulo="esCreacion ? 'Invitar usuario' : 'Editar miembro'"
      :subtitulo="esCreacion ? 'Se le envía un correo con el enlace de invitación' : 'Nombre, teléfono, rol y estado'"
      @cerrar="emit('cerrar')"
    >
      <div class="form-grid">
        <template v-if="esCreacion">
          <div class="field span-2">
            <label for="m-email">Correo electrónico</label>
            <input id="m-email" v-model="email" type="email" placeholder="correo@ejemplo.com">
            <span class="field-hint">
              El nombre y el teléfono los completa el usuario al aceptar la invitación.
            </span>
          </div>
        </template>

        <template v-else>
          <div class="field span-2">
            <label for="m-correo">Correo electrónico</label>
            <input id="m-correo" :value="correoActual" type="text" readonly>
          </div>
          <div class="field span-2">
            <label for="m-nombre">Nombre</label>
            <input id="m-nombre" v-model="fullName" type="text" placeholder="Nombre completo">
          </div>
          <div class="field">
            <label for="m-telefono">Teléfono</label>
            <input id="m-telefono" v-model="phone" type="text" placeholder="Teléfono">
          </div>
          <div class="field">
            <label for="m-estado">Estado</label>
            <select id="m-estado" v-model="status">
              <option value="active">Activo</option>
              <option value="suspended">Inactivo</option>
            </select>
          </div>
        </template>

        <div class="field">
          <label for="m-rol">Rol</label>
          <select id="m-rol" v-model="role">
            <option value="agent">Administrador (agent)</option>
            <option value="auditor">Auditor (auditor)</option>
          </select>
        </div>
      </div>

      <p v-if="error" class="note" style="color: var(--ladrillo-text)">{{ error }}</p>

      <template #foot>
        <button type="button" class="btn btn--ghost" @click="emit('cerrar')">Cancelar</button>
        <button type="button" class="btn btn--primary" :disabled="guardando" @click="guardar">
          {{ guardando ? 'Guardando…' : esCreacion ? 'Invitar' : 'Guardar' }}
        </button>
      </template>
    </UiDrawer>
  </div>
</template>
