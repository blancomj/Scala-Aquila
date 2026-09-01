<script setup lang="ts">
// Tab "Configuración" — moneda + zona horaria (PROMPT_FICHA_COPROPIEDAD.md
// §7.4 v1), ampliado a pedido del usuario con: día de facturación + canal
// de notificación (campos nuevos en tenants, informativos por ahora, sin
// consumidor todavía — 20260830350000), logo (movido desde "Datos
// básicos" — ya estaba construido, solo vivía en el tab equivocado) y
// Consejo de administración (activa el catálogo ROL_CONCEJO_COPROPIEDAD,
// sembrado sin consumidor hasta ahora, reutilizando
// CopropiedadPersonasVinculadas.vue con otra familia de rol).
const tenantStore = useTenantStore()
const copropiedadStore = useCopropiedadStore()
const supabase = useSupabaseClient()

const moneda = ref('COP')
const zonaHoraria = ref('America/Bogota')
const diaFacturacion = ref<number | null>(null)
const canalNotificacion = ref<string | null>(null)
const compositorCorreoActivo = ref(false)

const guardando = ref(false)
const guardandoCompositor = ref(false)
const error = ref<string | null>(null)

watch(
  () => copropiedadStore.tenant,
  (t) => {
    if (!t) return
    moneda.value = t.moneda
    zonaHoraria.value = t.zona_horaria
    diaFacturacion.value = t.dia_facturacion
    canalNotificacion.value = t.canal_notificacion ?? null
    compositorCorreoActivo.value = (t as Record<string, unknown>).compositor_correo_activo === true
  },
  { immediate: true },
)

async function guardar(): Promise<void> {
  const tenantId = tenantStore.activeTenant?.id
  if (!tenantId) return

  error.value = null
  guardando.value = true
  try {
    await copropiedadStore.actualizarTenant(tenantId, {
      moneda: moneda.value,
      zona_horaria: zonaHoraria.value,
      dia_facturacion: diaFacturacion.value || null,
      canal_notificacion: canalNotificacion.value || null,
    })
  } catch (excepcion) {
    error.value = mensajeError(excepcion, 'No se pudo guardar.')
  } finally {
    guardando.value = false
  }
}

// ── logo — movido desde CopropiedadDatosBasicos.vue, sin cambios de lógica ──
const MIME_LOGO_PERMITIDOS = new Set(['image/png', 'image/jpeg', 'image/svg+xml', 'image/webp'])
const TAMANO_MAXIMO_LOGO = 2 * 1024 * 1024
const archivoLogo = ref<File | null>(null)
const subiendoLogo = ref(false)
const errorLogo = ref<string | null>(null)
const logoVersion = ref(0)

const logoUrl = computed(() => {
  const path = copropiedadStore.tenant?.logo_path
  if (!path) return null
  const { data } = supabase.storage.from('logo-copropiedad').getPublicUrl(path)
  return `${data.publicUrl}?v=${logoVersion.value}`
})

function elegirLogo(evento: Event): void {
  const input = evento.target as HTMLInputElement
  const archivo = input.files?.[0] ?? null
  errorLogo.value = null
  if (archivo && (!MIME_LOGO_PERMITIDOS.has(archivo.type) || archivo.size > TAMANO_MAXIMO_LOGO)) {
    errorLogo.value = 'Solo PNG, JPG, SVG o WEBP, hasta 2 MB.'
    archivoLogo.value = null
    input.value = ''
    return
  }
  archivoLogo.value = archivo
}

async function subirLogo(): Promise<void> {
  const tenantId = tenantStore.activeTenant?.id
  if (!tenantId || !archivoLogo.value) return
  errorLogo.value = null
  subiendoLogo.value = true
  try {
    await copropiedadStore.subirLogo(tenantId, archivoLogo.value)
    archivoLogo.value = null
    logoVersion.value += 1
  } catch (excepcion) {
    errorLogo.value = mensajeError(excepcion, 'No se pudo subir el logo.')
  } finally {
    subiendoLogo.value = false
  }
}

async function toggleCompositor(): Promise<void> {
  const tenantId = tenantStore.activeTenant?.id
  if (!tenantId) return
  guardandoCompositor.value = true
  try {
    const cliente = useSupabaseClient()
    const { error: errorFn } = await cliente.functions.invoke('toggle-compositor-correo', {
      body: { tenant_id: tenantId, activo: compositorCorreoActivo.value },
    })
    if (errorFn) throw await extraerErrorFuncion(errorFn)
    // El botón flotante depende del tenant activo del selector global.
    tenantStore.actualizarTenantActivo({ compositor_correo_activo: compositorCorreoActivo.value })
  } catch (excepcion) {
    compositorCorreoActivo.value = !compositorCorreoActivo.value
    error.value = mensajeError(excepcion, 'No se pudo cambiar el compositor de correo.')
  } finally {
    guardandoCompositor.value = false
  }
}
</script>

<template>
  <div>
    <div class="space-y-4 text-sm max-w-2xl">
      <div class="grid grid-cols-2 gap-4">
        <UFormField label="Moneda" name="moneda" help="Sin más monedas habilitadas.">
          <USelect v-model="moneda" :items="[{ label: 'COP — Peso colombiano', value: 'COP' }]" value-key="value" class="w-full" />
        </UFormField>
        <UFormField label="Zona horaria" name="zona_horaria">
          <USelect
            v-model="zonaHoraria"
            :items="[{ label: 'América/Bogotá (UTC-5)', value: 'America/Bogota' }]"
            value-key="value"
            class="w-full"
          />
        </UFormField>
      </div>
      <div class="grid grid-cols-2 gap-4">
        <UFormField label="Día de facturación" name="dia_facturacion" help="Día del mes de corte (1-28).">
          <UInput v-model.number="diaFacturacion" type="number" min="1" max="28" class="w-full" />
        </UFormField>
        <UFormField label="Canal de notificación" name="canal_notificacion">
          <USelect
            v-model="canalNotificacion"
            :items="[
              { label: '— Sin definir —', value: null },
              { label: 'Email', value: 'email' },
              { label: 'SMS', value: 'sms' },
              { label: 'WhatsApp', value: 'whatsapp' },
            ]"
            value-key="value"
            class="w-full"
          />
        </UFormField>
      </div>
      <UFormField label="Compositor de correo" name="compositor_correo_activo" help="Botón flotante para enviar correos rápidos a terceros.">
        <div class="flex items-center gap-3">
          <USwitch v-model="compositorCorreoActivo" :disabled="guardandoCompositor" @update:model-value="toggleCompositor" />
          <span class="text-sm text-neutral-500">{{ compositorCorreoActivo ? 'Activo' : 'Inactivo' }}</span>
        </div>
      </UFormField>
      <UFormField label="Logo" name="logo">
        <div class="flex items-center gap-3 border border-neutral-200 rounded-sm p-3">
          <img
            v-if="logoUrl"
            :src="logoUrl"
            alt="Logo de la copropiedad"
            class="w-12 h-12 object-contain border border-neutral-200 shrink-0"
          >
          <div v-else class="text-xl text-neutral-400">⇧</div>
          <div class="flex-1 min-w-0">
            <p class="truncate">{{ archivoLogo ? archivoLogo.name : logoUrl ? 'Reemplazar logo' : 'Selecciona un archivo desde tu equipo' }}</p>
            <span class="text-xs text-neutral-500">PNG, JPG, SVG o WEBP · hasta 2 MB</span>
          </div>
          <UInput type="file" accept=".png,.jpg,.jpeg,.svg,.webp" class="max-w-[180px]" @change="elegirLogo" />
          <UButton :loading="subiendoLogo" :disabled="!archivoLogo" @click="subirLogo">Subir</UButton>
        </div>
        <UAlert v-if="errorLogo" color="error" variant="soft" :title="errorLogo" class="mt-2" />
      </UFormField>
    </div>
    <UAlert v-if="error" color="error" variant="soft" :title="error" class="mt-3 max-w-2xl" />
    <div class="mt-3">
      <UButton :loading="guardando" @click="guardar">Guardar cambios</UButton>
    </div>

    <CopropiedadPersonasVinculadas
      style="margin-top: 2.5rem"
      familia-rol="ROL_CONCEJO_COPROPIEDAD"
      titulo="Consejo de administración"
      subtitulo="Presidente, vicepresidente, secretario, vocales y suplentes del consejo."
      nota-ayuda="Se elige entre terceros ya registrados en Terceros — natural o jurídico, sin restricción."
      :mostrar-tarjeta-profesional="false"
      texto-boton-agregar="Agregar miembro"
    />
  </div>
</template>
