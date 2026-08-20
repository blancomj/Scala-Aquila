<script setup lang="ts">
// Modal crear/editar tercero (PROMPT_MANTENIMIENTO_TERCEROS.md §5-§7). El
// modo no es un prop aparte: esCreacion = !terceroId (mismo criterio que
// InmuebleFicha.vue, PROMPT_FICHA_INMUEBLE.md §6.2). tipo_persona se
// bloquea en edición por decisión de UI (§7.4, §8.1 — la base no lo
// impide todavía). calcularDVNit copiado tal cual del mockup (§7.3,
// algoritmo DIAN) — no reinventado.
const props = defineProps<{ terceroId?: string }>()
const emit = defineEmits<{ cerrar: []; guardado: [] }>()

const tenantStore = useTenantStore()
const tercerosStore = useTercerosStore()

const esCreacion = computed(() => !props.terceroId)

const tipoPersona = ref<'natural' | 'juridica'>('natural')
const tipoIdentificacionId = ref<number | null>(null)
const numeroDocumento = ref('')
const digitoVerificacion = ref('')
const primerNombre = ref('')
const segundoNombre = ref('')
const primerApellido = ref('')
const segundoApellido = ref('')
const razonSocial = ref('')
const representanteLegalId = ref('')
const pagadorId = ref('')
const email = ref('')
const telefono = ref('')
const direccion = ref('')
const estadoId = ref<number | null>(null)

const guardando = ref(false)
const error = ref<string | null>(null)
let tercerosNaturalesCargados = false

const tipoSeleccionado = computed(() =>
  tercerosStore.tiposIdentificacion.find((t) => t.id === tipoIdentificacionId.value),
)
const esNit = computed(() => tipoSeleccionado.value?.codigo === 'nit')

// ── Dígito de verificación (algoritmo DIAN, docs/mockups/terceros.html) ──
function calcularDVNit(nit: string): string {
  const pesos = [71, 67, 59, 53, 47, 43, 41, 37, 29, 23, 19, 17, 13, 7, 3]
  const limpio = (nit || '').replace(/\D/g, '')
  if (!limpio) return ''
  const digitos = limpio.split('').map(Number)
  const n = digitos.length
  let suma = 0
  for (let i = 0; i < n; i++) {
    const peso = pesos[pesos.length - n + i]
    if (peso === undefined) continue
    suma += (digitos[i] ?? 0) * peso
  }
  const resto = suma % 11
  return String(resto === 0 || resto === 1 ? resto : 11 - resto)
}

watch([esNit, numeroDocumento], () => {
  digitoVerificacion.value = esNit.value ? calcularDVNit(numeroDocumento.value) : ''
})

const opcionesRepresentantePagador = computed(() =>
  tercerosStore.tercerosNaturales.filter((t) => t.id !== props.terceroId),
)

const opcionesTipoIdentificacion = computed(() =>
  tercerosStore.tiposIdentificacion.map((t) => ({ valor: t.id, etiqueta: t.nombre })),
)
function opcionesPersona(etiquetaVacia: string): { valor: string; etiqueta: string }[] {
  return [
    { valor: '', etiqueta: etiquetaVacia },
    ...opcionesRepresentantePagador.value.map((t) => ({
      valor: t.id,
      etiqueta: t.nombre_completo ?? t.numero_documento,
    })),
  ]
}
const opcionesRepresentanteLegal = computed(() =>
  opcionesPersona('Seleccionar representante legal'),
)
const opcionesPagador = computed(() => opcionesPersona('Seleccionar pagador'))
const opcionesEstado = computed(() =>
  tercerosStore.estadosGenerales.map((e) => ({ valor: e.id, etiqueta: e.nombre })),
)

async function alSeleccionarJuridica(): Promise<void> {
  const tenantId = tenantStore.activeTenant?.id
  if (!tenantId || tercerosNaturalesCargados) return
  await tercerosStore.cargarTercerosNaturales(tenantId)
  tercerosNaturalesCargados = true
}

watch(tipoPersona, (tipo) => {
  if (tipo === 'juridica') void alSeleccionarJuridica()
})

function precargar(): void {
  const tercero = tercerosStore.terceros.find((t) => t.id === props.terceroId)
  if (!tercero) return
  tipoPersona.value = tercero.tipo_persona
  tipoIdentificacionId.value = tercero.tipo_identificacion_id
  numeroDocumento.value = tercero.numero_documento
  digitoVerificacion.value = tercero.digito_verificacion ?? ''
  primerNombre.value = tercero.primer_nombre ?? ''
  segundoNombre.value = tercero.segundo_nombre ?? ''
  primerApellido.value = tercero.primer_apellido ?? ''
  segundoApellido.value = tercero.segundo_apellido ?? ''
  razonSocial.value = tercero.razon_social ?? ''
  representanteLegalId.value = tercero.representante_legal_id ?? ''
  pagadorId.value = tercero.pagador_id ?? ''
  email.value = tercero.email ?? ''
  telefono.value = tercero.telefono ?? ''
  direccion.value = tercero.direccion ?? ''
  estadoId.value = tercero.estado_id
  if (tercero.tipo_persona === 'juridica') void alSeleccionarJuridica()
}

watchEffect(async () => {
  const tenantId = tenantStore.activeTenant?.id
  if (!tenantId) return
  await tercerosStore.cargarCatalogos(tenantId)
  if (estadoId.value === null) {
    estadoId.value = tercerosStore.estadosGenerales.find((e) => e.codigo === 'activo')?.id ?? null
  }
  if (props.terceroId) precargar()
})

function validar(): string | null {
  if (tipoIdentificacionId.value === null) return 'Elige el tipo de identificación.'
  if (!numeroDocumento.value.trim()) return 'El documento es obligatorio.'
  if (estadoId.value === null) return 'Elige un estado.'
  if (tipoPersona.value === 'natural') {
    if (!primerNombre.value.trim() || !primerApellido.value.trim()) {
      return 'Primer nombre y primer apellido son obligatorios.'
    }
  } else if (!razonSocial.value.trim()) {
    return 'La razón social es obligatoria.'
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
      if (tipoPersona.value === 'natural') {
        await tercerosStore.crearTercero({
          tenantId,
          tipoPersona: 'natural',
          tipoIdentificacionId: tipoIdentificacionId.value as number,
          numeroDocumento: numeroDocumento.value.trim(),
          digitoVerificacion: esNit.value ? digitoVerificacion.value : undefined,
          primerNombre: primerNombre.value.trim(),
          segundoNombre: segundoNombre.value.trim() || undefined,
          primerApellido: primerApellido.value.trim(),
          segundoApellido: segundoApellido.value.trim() || undefined,
          email: email.value.trim() || undefined,
          telefono: telefono.value.trim() || undefined,
          direccion: direccion.value.trim() || undefined,
          estadoId: estadoId.value as number,
        })
      } else {
        await tercerosStore.crearTercero({
          tenantId,
          tipoPersona: 'juridica',
          tipoIdentificacionId: tipoIdentificacionId.value as number,
          numeroDocumento: numeroDocumento.value.trim(),
          digitoVerificacion: esNit.value ? digitoVerificacion.value : undefined,
          razonSocial: razonSocial.value.trim(),
          representanteLegalId: representanteLegalId.value || undefined,
          pagadorId: pagadorId.value || undefined,
          email: email.value.trim() || undefined,
          telefono: telefono.value.trim() || undefined,
          direccion: direccion.value.trim() || undefined,
          estadoId: estadoId.value as number,
        })
      }
    } else if (props.terceroId) {
      await tercerosStore.actualizarTercero(props.terceroId, tenantId, {
        tipoIdentificacionId: tipoIdentificacionId.value as number,
        numeroDocumento: numeroDocumento.value.trim(),
        digitoVerificacion: esNit.value ? digitoVerificacion.value || null : null,
        primerNombre: tipoPersona.value === 'natural' ? primerNombre.value.trim() : null,
        segundoNombre: tipoPersona.value === 'natural' ? segundoNombre.value.trim() || null : null,
        primerApellido: tipoPersona.value === 'natural' ? primerApellido.value.trim() : null,
        segundoApellido:
          tipoPersona.value === 'natural' ? segundoApellido.value.trim() || null : null,
        razonSocial: tipoPersona.value === 'juridica' ? razonSocial.value.trim() : null,
        representanteLegalId: tipoPersona.value === 'juridica' ? representanteLegalId.value || null : null,
        pagadorId: tipoPersona.value === 'juridica' ? pagadorId.value || null : null,
        email: email.value.trim() || null,
        telefono: telefono.value.trim() || null,
        direccion: direccion.value.trim() || null,
        estadoId: estadoId.value as number,
      })
    }
    emit('guardado')
  } catch (excepcion) {
    error.value = mensajeError(excepcion, 'No se pudo guardar el tercero.')
  } finally {
    guardando.value = false
  }
}
</script>

<template>
  <UiDrawer
    :abierto="true"
    :titulo="esCreacion ? 'Nuevo tercero' : 'Editar tercero'"
    :subtitulo="esCreacion ? 'Ingresa los datos del nuevo tercero' : 'Actualiza los datos del tercero'"
    @cerrar="emit('cerrar')"
  >
    <div class="segmented">
      <button type="button" :class="{ 'is-active': tipoPersona === 'natural' }" :disabled="!esCreacion" @click="tipoPersona = 'natural'">
        Natural
      </button>
      <button type="button" :class="{ 'is-active': tipoPersona === 'juridica' }" :disabled="!esCreacion" @click="tipoPersona = 'juridica'">
        Jurídica
      </button>
    </div>

    <div class="form-grid">
      <div class="field">
        <label for="t-tipo-id">Tipo identificación</label>
        <UiSelectorBuscable
          id="t-tipo-id"
          v-model="tipoIdentificacionId"
          variante="ficha"
          :opciones="opcionesTipoIdentificacion"
          placeholder="Seleccione"
        />
      </div>
      <div class="field">
        <label for="t-documento">Documento</label>
        <input id="t-documento" v-model="numeroDocumento" type="text" placeholder="Ingrese el documento">
      </div>
      <div v-if="esNit" class="field">
        <label for="t-dv">Dígito de verificación</label>
        <input id="t-dv" :value="digitoVerificacion" type="text" placeholder="Se calcula solo" readonly>
        <span class="field-hint">Calculado con el algoritmo de la DIAN — no editable.</span>
      </div>

      <template v-if="tipoPersona === 'natural'">
        <div class="field span-2">
          <label for="t-primer-nombre">Primer nombre</label>
          <input id="t-primer-nombre" v-model="primerNombre" type="text" placeholder="Primer nombre">
        </div>
        <div class="field">
          <label for="t-segundo-nombre">Segundo nombre</label>
          <input id="t-segundo-nombre" v-model="segundoNombre" type="text" placeholder="Segundo nombre">
        </div>
        <div class="field">
          <label for="t-primer-apellido">Primer apellido</label>
          <input id="t-primer-apellido" v-model="primerApellido" type="text" placeholder="Primer apellido">
        </div>
        <div class="field">
          <label for="t-segundo-apellido">Segundo apellido</label>
          <input id="t-segundo-apellido" v-model="segundoApellido" type="text" placeholder="Segundo apellido">
        </div>
      </template>

      <template v-else>
        <div class="field span-2">
          <label for="t-razon-social">Razón social</label>
          <input id="t-razon-social" v-model="razonSocial" type="text" placeholder="Ingrese la razón social">
        </div>
        <div class="field span-2">
          <label for="t-rep-legal">Representante legal</label>
          <UiSelectorBuscable
            id="t-rep-legal"
            v-model="representanteLegalId"
            variante="ficha"
            :opciones="opcionesRepresentanteLegal"
          />
          <span class="field-hint">Solo personas naturales ya registradas como tercero.</span>
        </div>
        <div class="field span-2">
          <label for="t-pagador">Pagador (contacto de facturación por defecto)</label>
          <UiSelectorBuscable
            id="t-pagador"
            v-model="pagadorId"
            variante="ficha"
            :opciones="opcionesPagador"
          />
          <span class="field-hint">Default de esta empresa — se puede sobrescribir por inmueble.</span>
        </div>
      </template>

      <div class="field">
        <label for="t-email">Email</label>
        <input id="t-email" v-model="email" type="text" placeholder="Ingrese el email">
      </div>
      <div class="field">
        <label for="t-telefono">Teléfono</label>
        <input id="t-telefono" v-model="telefono" type="text" placeholder="Ingrese el teléfono">
      </div>
      <div class="field span-2">
        <label for="t-direccion">Dirección</label>
        <input id="t-direccion" v-model="direccion" type="text" placeholder="Dirección de correspondencia">
      </div>
      <div class="field">
        <label for="t-estado">Estado</label>
        <UiSelectorBuscable id="t-estado" v-model="estadoId" variante="ficha" :opciones="opcionesEstado" />
      </div>
    </div>

    <p v-if="error" class="note" style="color: var(--ladrillo-text)">{{ error }}</p>

    <template #foot>
      <button type="button" class="btn btn--ghost" @click="emit('cerrar')">Cancelar</button>
      <button type="button" class="btn btn--primary" :disabled="guardando" @click="guardar">
        {{ guardando ? 'Guardando…' : 'Guardar' }}
      </button>
    </template>
  </UiDrawer>
</template>
