<script setup lang="ts">
// Tab "Datos básicos" — Información general + contacto, Cuentas bancarias,
// Personas vinculadas (PROMPT_FICHA_COPROPIEDAD.md §6.2, §7.1-7.3).
// nit_digito_verificacion nunca se envía en el update — es columna
// generada, se relee después de guardar (§7.1). "Guardar cambios" es
// propio de este tab (partial update de sus columnas) — no un botón
// global compartido con Configuración: ambos llaman a actualizarTenant
// con sus propios campos, mismo resultado en base, menos acoplamiento
// entre componentes que forward-ear un ref de guardado (adaptación
// deliberada del masthead de un solo botón del mockup, §5).
const tenantStore = useTenantStore()
const copropiedadStore = useCopropiedadStore()
const tercerosStore = useTercerosStore()
const supabase = useSupabaseClient()

const name = ref('')
const nit = ref('')
const tipoDivisionId = ref<number | null>(null)
const direccion = ref('')
const ciudad = ref('')
const telefono1 = ref('')
const telefono2 = ref('')
const email = ref('')
const contactoNombre = ref('')
const contactoTelefono = ref('')
const contactoEmail = ref('')

const guardando = ref(false)
const error = ref<string | null>(null)

const modalCuentaAbierto = ref(false)
const modalPersonaAbierta = ref(false)

// ── logo ─────────────────────────────────────────────────────────────
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

function poblarDesdeTenant(): void {
  const t = copropiedadStore.tenant
  if (!t) return
  name.value = t.name
  nit.value = t.nit ?? ''
  tipoDivisionId.value = t.tipo_division_id
  direccion.value = t.direccion ?? ''
  ciudad.value = t.ciudad ?? ''
  telefono1.value = t.telefono_1 ?? ''
  telefono2.value = t.telefono_2 ?? ''
  email.value = t.email ?? ''
  contactoNombre.value = t.contacto_nombre ?? ''
  contactoTelefono.value = t.contacto_telefono ?? ''
  contactoEmail.value = t.contacto_email ?? ''
}

watch(() => copropiedadStore.tenant, poblarDesdeTenant, { immediate: true })

async function guardar(): Promise<void> {
  const tenantId = tenantStore.activeTenant?.id
  if (!tenantId || !name.value.trim() || !nit.value.trim() || tipoDivisionId.value === null) return

  error.value = null
  guardando.value = true
  try {
    await copropiedadStore.actualizarTenant(tenantId, {
      name: name.value.trim(),
      nit: nit.value.trim(),
      tipo_division_id: tipoDivisionId.value,
      direccion: direccion.value.trim() || null,
      ciudad: ciudad.value.trim() || null,
      telefono_1: telefono1.value.trim() || null,
      telefono_2: telefono2.value.trim() || null,
      email: email.value.trim() || null,
      contacto_nombre: contactoNombre.value.trim() || null,
      contacto_telefono: contactoTelefono.value.trim() || null,
      contacto_email: contactoEmail.value.trim() || null,
    })
  } catch (excepcion) {
    error.value = mensajeError(excepcion, 'No se pudo guardar.')
  } finally {
    guardando.value = false
  }
}

async function marcarRecaudo(cuentaId: string): Promise<void> {
  const tenantId = tenantStore.activeTenant?.id
  if (!tenantId) return
  await copropiedadStore.marcarCuentaRecaudo(cuentaId, tenantId)
}

async function alGuardarCuenta(): Promise<void> {
  modalCuentaAbierto.value = false
}

async function alGuardarPersona(): Promise<void> {
  modalPersonaAbierta.value = false
}

async function finalizarPersona(id: string): Promise<void> {
  const tenantId = tenantStore.activeTenant?.id
  if (!tenantId) return
  await tercerosStore.finalizarRelacionTenant(id, tenantId, new Date().toISOString().slice(0, 10))
}

const TIPO_CUENTA_LABEL: Record<string, string> = {
  ahorros: 'Ahorros',
  corriente: 'Corriente',
  billetera: 'Billetera digital',
}

const opcionesTipoDivision = computed(() =>
  copropiedadStore.tiposDivision.map((t) => ({ valor: t.id, etiqueta: t.nombre })),
)

function nombreEntidadFinanciera(id: number): string {
  return copropiedadStore.entidadesFinancieras.find((e) => e.id === id)?.nombre ?? '—'
}

watchEffect(async () => {
  const tenantId = tenantStore.activeTenant?.id
  if (!tenantId) return
  await copropiedadStore.cargarEntidadesFinancieras(tenantId)
})
</script>

<template>
  <div>
    <div class="form-grid">
      <div>
        <p class="card-title">Información general</p>
        <div class="form-grid" style="grid-template-columns: 1fr">
          <div class="field">
            <label for="f-nombre">Nombre de la copropiedad</label>
            <input id="f-nombre" v-model="name" type="text">
          </div>
          <div class="field-row-2">
            <div class="field">
              <label for="f-nit">NIT</label>
              <input id="f-nit" v-model="nit" type="text">
            </div>
            <div class="field field-dv">
              <label for="f-dv">DV</label>
              <input id="f-dv" :value="copropiedadStore.tenant?.nit_digito_verificacion ?? ''" type="text" readonly>
            </div>
          </div>
          <div class="field">
            <label for="f-tipo-division">Tipo de división</label>
            <UiSelectorBuscable
              id="f-tipo-division"
              v-model="tipoDivisionId"
              variante="ficha"
              :opciones="opcionesTipoDivision"
              placeholder="— Elegir —"
            />
            <span class="field-hint">Ley 675 de 2001 — clasificación de la propiedad horizontal.</span>
          </div>
          <div class="field">
            <label for="f-direccion">Dirección</label>
            <input id="f-direccion" v-model="direccion" type="text">
          </div>
          <div class="field">
            <label for="f-ciudad">Ciudad</label>
            <input id="f-ciudad" v-model="ciudad" type="text">
          </div>
          <div class="field-row-2">
            <div class="field">
              <label for="f-tel1">Teléfono 1</label>
              <input id="f-tel1" v-model="telefono1" type="text">
            </div>
            <div class="field">
              <label for="f-tel2">Teléfono 2</label>
              <input id="f-tel2" v-model="telefono2" type="text">
            </div>
          </div>
          <div class="field">
            <label for="f-email">Correo electrónico</label>
            <input id="f-email" v-model="email" type="text">
          </div>
        </div>
      </div>

      <div>
        <p class="card-title">Información de contacto</p>
        <div class="form-grid" style="grid-template-columns: 1fr">
          <div class="field">
            <label for="f-contacto-nombre">Nombre del contacto</label>
            <input id="f-contacto-nombre" v-model="contactoNombre" type="text">
          </div>
          <div class="field">
            <label for="f-contacto-tel">Teléfono del contacto</label>
            <input id="f-contacto-tel" v-model="contactoTelefono" type="text">
          </div>
          <div class="field">
            <label for="f-contacto-email">Correo del contacto</label>
            <input id="f-contacto-email" v-model="contactoEmail" type="text">
          </div>
          <div class="field">
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
      </div>
    </div>

    <p v-if="error" class="note" style="color: var(--ladrillo-text)">{{ error }}</p>
    <div style="margin-top: 12px">
      <button type="button" class="btn btn--primary" :disabled="guardando" @click="guardar">
        {{ guardando ? 'Guardando…' : 'Guardar cambios' }}
      </button>
    </div>

    <div class="section-title">
      <div>
        <h2>Cuentas bancarias</h2>
        <p class="panel-sub" style="margin-top: 2px">
          Pueden ser varias — exactamente una es la cuenta de recaudo.
        </p>
      </div>
      <button type="button" class="btn btn--ghost" style="font-size: 12.5px; padding: 6px 12px" @click="modalCuentaAbierto = true">
        Agregar cuenta
      </button>
    </div>
    <UiTabla
      variante="ficha"
      :columnas="[
        { clave: 'banco', etiqueta: 'Banco' },
        { clave: 'tipo', etiqueta: 'Tipo' },
        { clave: 'numero', etiqueta: 'Número', claseCelda: 'mono' },
        { clave: 'titular', etiqueta: 'Titular' },
        { clave: 'recaudo', etiqueta: 'Recaudo' },
      ]"
      :filas="copropiedadStore.cuentasBancarias"
      :clave-fila="(c) => c.id"
      vacio="Sin cuentas bancarias registradas."
    >
      <template #celda-banco="{ fila }">{{ nombreEntidadFinanciera(fila.entidad_financiera_id) }}</template>
      <template #celda-tipo="{ fila }">{{ TIPO_CUENTA_LABEL[fila.tipo_cuenta] ?? fila.tipo_cuenta }}</template>
      <template #celda-numero="{ fila }">{{ fila.numero_cuenta }}</template>
      <template #celda-titular="{ fila }">{{ fila.titular ?? '—' }}</template>
      <template #celda-recaudo="{ fila }">
        <span v-if="fila.es_recaudo" class="badge badge--sello">Recaudo</span>
        <button v-else type="button" class="btn btn--ghost" style="font-size: 11.5px; padding: 4px 10px" @click="marcarRecaudo(fila.id)">
          Marcar como recaudo
        </button>
      </template>
    </UiTabla>
    <p class="note">
      Cambiar la cuenta de recaudo es un swap atómico (<code>fn_marcar_cuenta_recaudo</code>) —
      nunca dos cuentas marcadas a la vez.
    </p>

    <div class="section-title">
      <div>
        <h2>Personas vinculadas</h2>
        <p class="panel-sub" style="margin-top: 2px">
          Roles sobre la copropiedad misma — administrador, contador, abogado, revisor fiscal.
        </p>
      </div>
      <button type="button" class="btn btn--primary" style="font-size: 12.5px; padding: 7px 14px" @click="modalPersonaAbierta = true">
        Agregar persona
      </button>
    </div>
    <UiTabla
      variante="ficha"
      :columnas="[
        { clave: 'tercero', etiqueta: 'Tercero' },
        { clave: 'rol', etiqueta: 'Rol' },
        { clave: 'vigenteDesde', etiqueta: 'Vigente desde', claseCelda: 'mono' },
        { clave: 'notificaciones', etiqueta: 'Notificaciones' },
        { clave: 'acciones', etiqueta: '' },
      ]"
      :filas="tercerosStore.personasTenant"
      :clave-fila="(p) => p.id"
      vacio="Sin personas vinculadas."
    >
      <template #celda-tercero="{ fila }">{{ fila.tercero.nombre_completo }}</template>
      <template #celda-rol="{ fila }"><span class="badge badge--gris">{{ fila.rol.nombre }}</span></template>
      <template #celda-vigenteDesde="{ fila }">{{ fila.vigente_desde }}</template>
      <template #celda-notificaciones="{ fila }">{{ fila.recibe_notificaciones ? 'Sí' : 'No' }}</template>
      <template #celda-acciones="{ fila }">
        <button
          v-if="!fila.vigente_hasta"
          type="button"
          class="btn btn--ghost"
          style="font-size: 11.5px; padding: 4px 10px"
          @click="finalizarPersona(fila.id)"
        >
          Finalizar
        </button>
        <span v-else class="badge badge--gris">Finalizada</span>
      </template>
    </UiTabla>
    <p class="note">
      Se elige entre terceros ya registrados en <strong>Terceros</strong> — natural o jurídico,
      sin restricción.
    </p>

    <CopropiedadCuentaBancariaForm
      v-if="modalCuentaAbierto"
      @cerrar="modalCuentaAbierto = false"
      @guardado="alGuardarCuenta"
    />
    <CopropiedadPersonaVinculadaForm
      v-if="modalPersonaAbierta"
      @cerrar="modalPersonaAbierta = false"
      @guardado="alGuardarPersona"
    />
  </div>
</template>
