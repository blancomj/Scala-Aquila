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
const procedenciaStore = useTercerosContactoProcedenciaStore()
// El store es un singleton (Pinia) pero cada apertura del modal es una
// instancia nueva del componente (v-if en el padre) — limpia el historial
// del tercero anterior para no mostrarlo mientras carga el de este.
procedenciaStore.limpiar()

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

// ── Procedencia del dato de contacto (CJ-9, sin decidir licitud — solo
// registra el hecho si el usuario declara un origen). Se compara contra
// el valor cargado para no reabrir la pregunta cuando nada cambió.
const emailOriginal = ref('')
const telefonoOriginal = ref('')
const origenContactoId = ref<number | null>(null)
const origenesContacto = shallowRef<{ id: number; codigo: string; nombre: string }[]>([])

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
  emailOriginal.value = email.value
  telefonoOriginal.value = telefono.value
  if (tercero.tipo_persona === 'juridica') void alSeleccionarJuridica()
}

watchEffect(async () => {
  const tenantId = tenantStore.activeTenant?.id
  if (!tenantId) return
  await tercerosStore.cargarCatalogos(tenantId)
  if (estadoId.value === null) {
    estadoId.value = tercerosStore.estadosGenerales.find((e) => e.codigo === 'activo')?.id ?? null
  }
  origenesContacto.value = await cargarListaTipos(tenantId, 'ORIGEN_CONTACTO_TERCERO')
  if (props.terceroId) {
    precargar()
    await procedenciaStore.cargarProcedencia(tenantId, props.terceroId)
  }
})

const opcionesOrigenContacto = computed(() =>
  origenesContacto.value.map((o) => ({ valor: o.id, etiqueta: o.nombre })),
)

/** true = email o teléfono quedaron distintos de lo que había al abrir el modal
 * (o, en creación, hay un valor nuevo) — es cuando tiene sentido preguntar el origen. */
const contactoCambio = computed(
  () =>
    email.value.trim() !== emailOriginal.value || telefono.value.trim() !== telefonoOriginal.value,
)

function nombreOrigen(id: number): string {
  return origenesContacto.value.find((o) => o.id === id)?.nombre ?? '—'
}

/** Una fila por campo que cambió y tiene valor — nunca se inventa procedencia
 * para un campo que el usuario no tocó. Best-effort: si falla, no revierte el
 * guardado del tercero (que ya ocurrió) — solo se ve reflejado en error. */
async function registrarProcedenciaSiAplica(tenantId: string, terceroId: string): Promise<void> {
  if (origenContactoId.value === null) return
  const cambios: { campo: 'email' | 'telefono'; valor: string }[] = []
  if (email.value.trim() && email.value.trim() !== emailOriginal.value) {
    cambios.push({ campo: 'email', valor: email.value.trim() })
  }
  if (telefono.value.trim() && telefono.value.trim() !== telefonoOriginal.value) {
    cambios.push({ campo: 'telefono', valor: telefono.value.trim() })
  }
  for (const cambio of cambios) {
    await procedenciaStore.registrarProcedencia(tenantId, {
      terceroId,
      campo: cambio.campo,
      valor: cambio.valor,
      origenId: origenContactoId.value,
    })
  }
}

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
      const creado =
        tipoPersona.value === 'natural'
          ? await tercerosStore.crearTercero({
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
          : await tercerosStore.crearTercero({
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
      await registrarProcedenciaSiAplica(tenantId, creado.id)
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
      await registrarProcedenciaSiAplica(tenantId, props.terceroId)
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
    <UButtonGroup class="mb-4">
      <UButton
        :color="tipoPersona === 'natural' ? 'primary' : 'neutral'"
        :variant="tipoPersona === 'natural' ? 'solid' : 'outline'"
        :disabled="!esCreacion"
        @click="tipoPersona = 'natural'"
      >
        Natural
      </UButton>
      <UButton
        :color="tipoPersona === 'juridica' ? 'primary' : 'neutral'"
        :variant="tipoPersona === 'juridica' ? 'solid' : 'outline'"
        :disabled="!esCreacion"
        @click="tipoPersona = 'juridica'"
      >
        Jurídica
      </UButton>
    </UButtonGroup>

    <div class="space-y-4 text-sm">
      <div class="grid grid-cols-2 gap-4">
        <UFormField label="Tipo identificación" name="tipo_identificacion_id">
          <UiSelectorBuscable
            v-model="tipoIdentificacionId"
            :opciones="opcionesTipoIdentificacion"
            placeholder="Seleccione"
          />
        </UFormField>
        <UFormField label="Documento" name="numero_documento">
          <UInput v-model="numeroDocumento" type="text" placeholder="Ingrese el documento" class="w-full" />
        </UFormField>
      </div>
      <UFormField
        v-if="esNit"
        label="Dígito de verificación"
        name="digito_verificacion"
        help="Calculado con el algoritmo de la DIAN — no editable."
      >
        <UInput :model-value="digitoVerificacion" type="text" placeholder="Se calcula solo" readonly class="w-full" />
      </UFormField>

      <template v-if="tipoPersona === 'natural'">
        <UFormField label="Primer nombre" name="primer_nombre">
          <UInput v-model="primerNombre" type="text" placeholder="Primer nombre" class="w-full" />
        </UFormField>
        <div class="grid grid-cols-2 gap-4">
          <UFormField label="Segundo nombre" name="segundo_nombre">
            <UInput v-model="segundoNombre" type="text" placeholder="Segundo nombre" class="w-full" />
          </UFormField>
          <UFormField label="Primer apellido" name="primer_apellido">
            <UInput v-model="primerApellido" type="text" placeholder="Primer apellido" class="w-full" />
          </UFormField>
        </div>
        <UFormField label="Segundo apellido" name="segundo_apellido">
          <UInput v-model="segundoApellido" type="text" placeholder="Segundo apellido" class="w-full" />
        </UFormField>
      </template>

      <template v-else>
        <UFormField label="Razón social" name="razon_social">
          <UInput v-model="razonSocial" type="text" placeholder="Ingrese la razón social" class="w-full" />
        </UFormField>
        <UFormField
          label="Representante legal"
          name="representante_legal_id"
          help="Solo personas naturales ya registradas como tercero."
        >
          <UiSelectorBuscable v-model="representanteLegalId" :opciones="opcionesRepresentanteLegal" />
        </UFormField>
        <UFormField
          label="Pagador (contacto de facturación por defecto)"
          name="pagador_id"
          help="Default de esta empresa — se puede sobrescribir por inmueble."
        >
          <UiSelectorBuscable v-model="pagadorId" :opciones="opcionesPagador" />
        </UFormField>
      </template>

      <div class="grid grid-cols-2 gap-4">
        <UFormField label="Email" name="email">
          <UInput v-model="email" type="text" placeholder="Ingrese el email" class="w-full" />
        </UFormField>
        <UFormField label="Teléfono" name="telefono">
          <UInput v-model="telefono" type="text" placeholder="Ingrese el teléfono" class="w-full" />
        </UFormField>
      </div>

      <UFormField
        v-if="contactoCambio"
        label="Origen del dato de contacto"
        name="origen_contacto_id"
        help="Opcional — de dónde salió este email o teléfono (portería, asamblea, lo actualizó el propio tercero…). Queda en un registro aparte, no cambia si el dato se usa para cobranza."
      >
        <UiSelectorBuscable
          v-model="origenContactoId"
          :opciones="opcionesOrigenContacto"
          placeholder="Sin declarar"
        />
      </UFormField>

      <div v-if="!esCreacion && procedenciaStore.procedencias.length > 0" class="text-xs text-gray-500 space-y-1">
        <p class="font-medium text-gray-600">Procedencia registrada</p>
        <ul class="space-y-0.5">
          <li v-for="p in procedenciaStore.procedencias" :key="p.id">
            {{ p.campo === 'email' ? 'Email' : 'Teléfono' }} «{{ p.valor }}» — {{ nombreOrigen(p.origen_id) }} ·
            {{ new Date(p.created_at).toLocaleDateString('es-CO') }}
          </li>
        </ul>
      </div>
      <UFormField label="Dirección" name="direccion">
        <UInput v-model="direccion" type="text" placeholder="Dirección de correspondencia" class="w-full" />
      </UFormField>
      <UFormField label="Estado" name="estado_id">
        <UiSelectorBuscable v-model="estadoId" :opciones="opcionesEstado" />
      </UFormField>
    </div>

    <UAlert v-if="error" color="error" variant="soft" :title="error" class="mt-4" />

    <template #foot>
      <UButton variant="ghost" @click="emit('cerrar')">Cancelar</UButton>
      <UButton :loading="guardando" @click="guardar">Guardar</UButton>
    </template>
  </UiDrawer>
</template>
