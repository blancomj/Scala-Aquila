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
const canalNotificacion = ref('')

const guardando = ref(false)
const error = ref<string | null>(null)

watch(
  () => copropiedadStore.tenant,
  (t) => {
    if (!t) return
    moneda.value = t.moneda
    zonaHoraria.value = t.zona_horaria
    diaFacturacion.value = t.dia_facturacion
    canalNotificacion.value = t.canal_notificacion ?? ''
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
</script>

<template>
  <div>
    <div class="form-grid">
      <div class="field-row-2" style="grid-column: span 1">
        <div class="field">
          <label for="f-moneda">Moneda</label>
          <select id="f-moneda" v-model="moneda">
            <option value="COP">COP — Peso colombiano</option>
          </select>
          <span class="field-hint">Sin más monedas habilitadas.</span>
        </div>
        <div class="field">
          <label for="f-zona-horaria">Zona horaria</label>
          <select id="f-zona-horaria" v-model="zonaHoraria">
            <option value="America/Bogota">América/Bogotá (UTC-5)</option>
          </select>
        </div>
      </div>
      <div class="field-row-2" style="grid-column: span 1">
        <div class="field">
          <div style="display: flex; align-items: baseline; gap: 8px">
            <label for="f-dia-facturacion">Día de facturación</label>
            <span class="field-hint">Día del mes de corte (1-28).</span>
          </div>
          <input id="f-dia-facturacion" v-model.number="diaFacturacion" type="number" min="1" max="28">
        </div>
        <div class="field">
          <label for="f-canal-notificacion">Canal de notificación</label>
          <select id="f-canal-notificacion" v-model="canalNotificacion">
            <option value="">— Sin definir —</option>
            <option value="email">Email</option>
            <option value="sms">SMS</option>
            <option value="whatsapp">WhatsApp</option>
          </select>
        </div>
      </div>
      <div class="field span-2">
        <label>Logo</label>
        <div class="dropzone">
          <img
            v-if="logoUrl"
            :src="logoUrl"
            alt="Logo de la copropiedad"
            style="width: 48px; height: 48px; object-fit: contain; border: 1px solid var(--line); flex-shrink: 0"
          >
          <div v-else style="font-size: 22px; color: var(--ink-faint)">⇧</div>
          <div class="dropzone-text">
            <p>{{ archivoLogo ? archivoLogo.name : logoUrl ? 'Reemplazar logo' : 'Selecciona un archivo desde tu equipo' }}</p>
            <span>PNG, JPG, SVG o WEBP · hasta 2 MB</span>
          </div>
          <input type="file" accept=".png,.jpg,.jpeg,.svg,.webp" style="max-width: 180px" @change="elegirLogo">
          <button
            type="button"
            class="btn btn--primary"
            style="font-size: 12.5px; padding: 8px 14px"
            :disabled="subiendoLogo || !archivoLogo"
            @click="subirLogo"
          >
            {{ subiendoLogo ? 'Subiendo…' : 'Subir' }}
          </button>
        </div>
        <p v-if="errorLogo" class="note" style="color: var(--ladrillo-text)">{{ errorLogo }}</p>
      </div>
    </div>
    <p v-if="error" class="note" style="color: var(--ladrillo-text)">{{ error }}</p>
    <div style="margin-top: 12px">
      <button type="button" class="btn btn--primary" :disabled="guardando" @click="guardar">
        {{ guardando ? 'Guardando…' : 'Guardar cambios' }}
      </button>
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
