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

// Validación inline ligera — solo feedback visual bajo el campo, no bloquea
// "Guardar cambios": son datos administrativos, no un contrato con la base
// (que si rechaza el NIT, por ejemplo, ya muestra su propio error).
const RE_EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const RE_TELEFONO = /^[\d\s+()-]{7,20}$/
const nitError = computed(() =>
  nit.value.trim().length > 0 && !/^\d{5,15}$/.test(nit.value.trim()) ? 'Solo dígitos, 5 a 15.' : null,
)
const emailError = computed(() =>
  email.value.trim().length > 0 && !RE_EMAIL.test(email.value.trim()) ? 'Correo inválido.' : null,
)
const contactoEmailError = computed(() =>
  contactoEmail.value.trim().length > 0 && !RE_EMAIL.test(contactoEmail.value.trim()) ? 'Correo inválido.' : null,
)
const telefono1Error = computed(() =>
  telefono1.value.trim().length > 0 && !RE_TELEFONO.test(telefono1.value.trim()) ? 'Teléfono inválido.' : null,
)
const telefono2Error = computed(() =>
  telefono2.value.trim().length > 0 && !RE_TELEFONO.test(telefono2.value.trim()) ? 'Teléfono inválido.' : null,
)
const contactoTelefonoError = computed(() =>
  contactoTelefono.value.trim().length > 0 && !RE_TELEFONO.test(contactoTelefono.value.trim())
    ? 'Teléfono inválido.'
    : null,
)

const modalCuentaAbierto = ref(false)

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
      <div class="card">
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
              <span v-if="nitError" class="field-hint" style="color: var(--ladrillo-text)">{{ nitError }}</span>
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
              <span v-if="telefono1Error" class="field-hint" style="color: var(--ladrillo-text)">{{ telefono1Error }}</span>
            </div>
            <div class="field">
              <label for="f-tel2">Teléfono 2</label>
              <input id="f-tel2" v-model="telefono2" type="text">
              <span v-if="telefono2Error" class="field-hint" style="color: var(--ladrillo-text)">{{ telefono2Error }}</span>
            </div>
          </div>
          <div class="field">
            <label for="f-email">Correo electrónico</label>
            <input id="f-email" v-model="email" type="text">
            <span v-if="emailError" class="field-hint" style="color: var(--ladrillo-text)">{{ emailError }}</span>
          </div>
        </div>
      </div>

      <div class="card">
        <p class="card-title">Información de contacto</p>
        <div class="form-grid" style="grid-template-columns: 1fr">
          <div class="field">
            <label for="f-contacto-nombre">Nombre del contacto</label>
            <input id="f-contacto-nombre" v-model="contactoNombre" type="text">
          </div>
          <div class="field">
            <label for="f-contacto-tel">Teléfono del contacto</label>
            <input id="f-contacto-tel" v-model="contactoTelefono" type="text">
            <span v-if="contactoTelefonoError" class="field-hint" style="color: var(--ladrillo-text)">{{ contactoTelefonoError }}</span>
          </div>
          <div class="field">
            <label for="f-contacto-email">Correo del contacto</label>
            <input id="f-contacto-email" v-model="contactoEmail" type="text">
            <span v-if="contactoEmailError" class="field-hint" style="color: var(--ladrillo-text)">{{ contactoEmailError }}</span>
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

    <CopropiedadPersonasVinculadas
      familia-rol="PERSONA_COPROPIEDAD"
      titulo="Personas vinculadas"
      subtitulo="Roles sobre la copropiedad misma — administrador, contador, abogado, revisor fiscal."
      nota-ayuda="Se elige entre terceros ya registrados en Terceros — natural o jurídico, sin restricción."
    />

    <CopropiedadCuentaBancariaForm
      v-if="modalCuentaAbierto"
      @cerrar="modalCuentaAbierto = false"
      @guardado="alGuardarCuenta"
    />
  </div>
</template>
