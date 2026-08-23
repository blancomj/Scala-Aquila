<script setup lang="ts">
// Tab Datos base — ficha técnica, coeficiente (lectura), zonas comunes de
// uso exclusivo, personas asociadas (PROMPT_FICHA_INMUEBLE.md §1.1 I4,
// §7.1, §7.2). El tab más grande a propósito (§10, T4): rol condicional +
// pagador atómico es donde más vale detectar un gap temprano.
//
// En modo creación, las personas quedan en una lista local (`personasEnEspera`)
// hasta que se guarda el inmueble — recién ahí se crean de verdad (§7.1).
// En modo ficha, cada alta/edición de persona persiste de inmediato.
import type { Database } from '@aquila/shared'
import type { PersonaFormPayload } from './InmueblePersonaForm.vue'

const props = defineProps<{ inmuebleId?: string; esCreacion: boolean }>()

const tenantStore = useTenantStore()
const inmueblesStore = useInmueblesStore()
const tercerosStore = useTercerosStore()
const agrupacionesStore = useAgrupacionesStore()

type TipoInmuebleRow = Database['public']['Tables']['lista_tipos']['Row']
const tiposInmueble = shallowRef<TipoInmuebleRow[]>([])
const estadosLegales = shallowRef<TipoInmuebleRow[]>([])
const habitabilidades = shallowRef<TipoInmuebleRow[]>([])
const usosPredio = shallowRef<TipoInmuebleRow[]>([])
const tiposIdentificacion = shallowRef<TipoInmuebleRow[]>([])
const tiposZonaComun = shallowRef<TipoInmuebleRow[]>([])
const tiposGravamen = shallowRef<TipoInmuebleRow[]>([])

function nombreTipoZonaComun(id: number): string {
  return tiposZonaComun.value.find((t) => t.id === id)?.nombre ?? '—'
}

function nombreTipoIdentificacion(id: number | null): string {
  return tiposIdentificacion.value.find((t) => t.id === id)?.nombre ?? '—'
}

const opcionesTipoInmueble = computed(() =>
  tiposInmueble.value.map((t) => ({ valor: t.id, etiqueta: t.nombre })),
)
const opcionesHabitabilidad = computed(() => [
  { valor: null, etiqueta: '— Sin especificar —' },
  ...habitabilidades.value.map((h) => ({ valor: h.id, etiqueta: h.nombre })),
])
const opcionesEstadoLegal = computed(() => [
  { valor: null, etiqueta: '— Sin novedad —' },
  ...estadosLegales.value.map((e) => ({ valor: e.id, etiqueta: e.nombre })),
])
const opcionesUsoPredio = computed(() => [
  { valor: null, etiqueta: '— Sin especificar —' },
  ...usosPredio.value.map((u) => ({ valor: u.id, etiqueta: u.nombre })),
])
// Sin sentinela null propio: TIPO_GRAVAMEN ya trae "ninguno" sembrado
// (20260814180000) como su propio valor — ese es el "sin gravamen", no NULL.
const opcionesTipoGravamen = computed(() =>
  tiposGravamen.value.map((g) => ({ valor: g.id, etiqueta: g.nombre })),
)
// Solo agrupaciones activas: una desactivada sigue mostrándose en los
// inmuebles que ya la tienen, pero no se ofrece para asignaciones nuevas.
// La etiqueta es la ruta completa ("Edificio A / Piso 3") para que dos
// pisos con el mismo nombre en torres distintas sean distinguibles.
const opcionesAgrupacion = computed(() => [
  { valor: null, etiqueta: '— Sin agrupar —' },
  ...agrupacionesStore.arbolPlano
    .filter((a) => a.activa || a.id === agrupacionId.value)
    .map((a) => ({ valor: a.id, etiqueta: a.ruta })),
])

/** Ruta legible de la agrupación vigente — para la ficha de solo lectura,
 * que antes no la mostraba (solo el formulario de edición la capturaba). */
const rutaAgrupacionActual = computed(() => {
  const id = inmueblesStore.inmuebleActivo?.agrupacion_id
  if (!id) return 'Sin agrupar'
  return agrupacionesStore.arbolPlano.find((a) => a.id === id)?.ruta ?? 'Sin agrupar'
})

// ── formulario "Datos generales" (creación y edición) ──────────────────
const editando = ref(false)
const codigo = ref('')
const tipoId = ref<number | null>(null)
const matricula = ref('')
const estado = ref<Database['public']['Enums']['inmueble_estado_t']>('activo')
const areaPrivada = ref<number | null>(null)
const areaComun = ref<number | null>(null)
const estadoLegalId = ref<number | null>(null)
const estadoLegalObservaciones = ref('')
const habitabilidadId = ref<number | null>(null)
const usoPredioId = ref<number | null>(null)
const agrupacionId = ref<string | null>(null)
const referenciaCatastral = ref('')
const gravamenTipoId = ref<number | null>(null)

const errorEdicion = ref<string | null>(null)
const guardandoEdicion = ref(false)

function codigoGravamen(id: number | null | undefined): string | undefined {
  return tiposGravamen.value.find((g) => g.id === id)?.codigo
}

/** true cuando el gravamen elegido en el formulario no es "ninguno" — en ese
 * caso la ficha exige un tercero asociado con rol Locatario (un inmueble
 * hipotecado o en leasing tiene un ocupante distinto del propietario
 * registrado). Se usa para validar `guardar()` y para el aviso dentro del
 * formulario (creación y drawer de edición mientras está abierto). */
const gravamenRequiereLocatario = computed(() => {
  const codigo = codigoGravamen(gravamenTipoId.value)
  return codigo !== undefined && codigo !== 'ninguno'
})

/** Mismo chequeo pero sobre el dato ya guardado (inmuebleActivo), no sobre
 * el formulario de edición — para el aviso en la ficha de solo lectura,
 * que debe verse sin necesidad de abrir "Editar" primero. */
const gravamenPersistidoRequiereLocatario = computed(() => {
  const codigo = codigoGravamen(inmueblesStore.inmuebleActivo?.gravamen_tipo_id)
  return codigo !== undefined && codigo !== 'ninguno'
})

function tieneLocatarioCapturado(): boolean {
  const rolLocatarioId = rolesDisponibles.value.find((r) => r.codigo === 'locatario')?.id
  if (props.esCreacion) {
    return personasEnEspera.value.some((p) => p.rolId === rolLocatarioId)
  }
  return tercerosStore.tercerosAsociados.some(
    (p) => p.rol.codigo === 'locatario' && !p.vigente_hasta,
  )
}

const locatarioFaltante = computed(() => gravamenRequiereLocatario.value && !tieneLocatarioCapturado())
const locatarioFaltantePersistido = computed(
  () => gravamenPersistidoRequiereLocatario.value && !tieneLocatarioCapturado(),
)

function precargarFormulario(): void {
  const inm = inmueblesStore.inmuebleActivo
  if (!inm) return
  codigo.value = inm.codigo
  tipoId.value = inm.tipo_id
  matricula.value = inm.matricula_inmobiliaria ?? ''
  estado.value = inm.estado
  areaPrivada.value = inm.area_privada
  areaComun.value = inm.area_comun
  estadoLegalId.value = inm.estado_legal_id
  estadoLegalObservaciones.value = inm.estado_legal_observaciones ?? ''
  habitabilidadId.value = inm.habitabilidad_id
  usoPredioId.value = inm.uso_predio_id
  agrupacionId.value = inm.agrupacion_id
  referenciaCatastral.value = inm.referencia_catastral ?? ''
  gravamenTipoId.value = inm.gravamen_tipo_id
}

function alternarEdicion(): void {
  if (!editando.value) precargarFormulario()
  errorEdicion.value = null
  editando.value = !editando.value
}

// Antes no había forma de guardar este formulario en modo ficha (el botón
// "Editar ficha" solo togglaba `editando`, sin acción de guardado propia —
// `guardar()` ya existía y cubría ambas ramas, pero nadie la invocaba desde
// aquí). El drawer necesita un botón "Guardar cambios" real, así que se
// expone este wrapper con manejo de error.
async function guardarEdicion(): Promise<void> {
  errorEdicion.value = null
  guardandoEdicion.value = true
  try {
    await guardar()
  } catch (excepcion) {
    errorEdicion.value = mensajeError(excepcion, 'No se pudieron guardar los cambios.')
  } finally {
    guardandoEdicion.value = false
  }
}

// ── personas asociadas ──────────────────────────────────────────────────
const mostrarFormPersona = ref(false)
const personasEnEspera = ref<PersonaFormPayload[]>([])
const filtroRol = ref<string>('todas')

const rolesDisponibles = computed(() => tercerosStore.rolesPersonaPredio)

const personasAsociadasFiltradas = computed(() => {
  if (filtroRol.value === 'todas') return tercerosStore.tercerosAsociados
  return tercerosStore.tercerosAsociados.filter((p) => p.rol.codigo === filtroRol.value)
})

function nombreRol(rolId: number): string {
  return rolesDisponibles.value.find((r) => r.id === rolId)?.nombre ?? 'Rol'
}

async function agregarPersona(payload: PersonaFormPayload): Promise<void> {
  mostrarFormPersona.value = false
  const tenantId = tenantStore.activeTenant?.id
  if (!tenantId) return

  if (props.esCreacion) {
    personasEnEspera.value = [...personasEnEspera.value, payload]
    return
  }
  if (!props.inmuebleId) return
  await tercerosStore.asociarTerceroInmueble({
    tenantId,
    inmuebleId: props.inmuebleId,
    ...payload,
  })
}

function quitarPersonaEnEspera(indice: number): void {
  personasEnEspera.value = personasEnEspera.value.filter((_, i) => i !== indice)
}

async function marcarPagador(personaRolId: string): Promise<void> {
  const tenantId = tenantStore.activeTenant?.id
  if (!tenantId || !props.inmuebleId) return
  await tercerosStore.marcarPagador(personaRolId, tenantId, props.inmuebleId)
}

// ── guardar (expuesto al padre para creación; en modo ficha lo invoca
//    guardarEdicion desde el drawer de edición) ─────────────────────────
async function guardar(): Promise<string> {
  const tenantId = tenantStore.activeTenant?.id
  if (!tenantId) throw new Error('No hay copropiedad activa.')
  if (!codigo.value.trim()) throw new Error('El código del inmueble es obligatorio.')
  if (tipoId.value === null) throw new Error('Elige un tipo de inmueble.')
  if (gravamenRequiereLocatario.value && !tieneLocatarioCapturado()) {
    throw new Error('El inmueble tiene un gravamen registrado — agrega un tercero con rol Locatario.')
  }

  if (props.esCreacion) {
    if (personasEnEspera.value.length === 0) {
      throw new Error('Agrega al menos una persona asociada antes de guardar.')
    }
    const nuevo = await inmueblesStore.crearInmueble({
      tenantId,
      codigo: codigo.value.trim(),
      tipoId: tipoId.value,
      estado: estado.value,
      matriculaInmobiliaria: matricula.value.trim() || undefined,
      areaPrivada: areaPrivada.value ?? undefined,
      areaComun: areaComun.value ?? undefined,
      estadoLegalId: estadoLegalId.value,
      estadoLegalObservaciones: estadoLegalObservaciones.value.trim() || undefined,
      habitabilidadId: habitabilidadId.value,
      usoPredioId: usoPredioId.value,
      agrupacionId: agrupacionId.value,
      referenciaCatastral: referenciaCatastral.value.trim() || undefined,
      gravamenTipoId: gravamenTipoId.value,
    })
    for (const persona of personasEnEspera.value) {
      await tercerosStore.asociarTerceroInmueble({ tenantId, inmuebleId: nuevo.id, ...persona })
    }
    return nuevo.id
  }

  if (!props.inmuebleId) throw new Error('Inmueble inválido.')
  await inmueblesStore.actualizarInmueble({
    id: props.inmuebleId,
    codigo: codigo.value.trim(),
    tipoId: tipoId.value,
    estado: estado.value,
    matriculaInmobiliaria: matricula.value.trim() || undefined,
    areaPrivada: areaPrivada.value ?? undefined,
    areaComun: areaComun.value ?? undefined,
    estadoLegalId: estadoLegalId.value,
    estadoLegalObservaciones: estadoLegalObservaciones.value.trim() || undefined,
    habitabilidadId: habitabilidadId.value,
    usoPredioId: usoPredioId.value,
    agrupacionId: agrupacionId.value,
    referenciaCatastral: referenciaCatastral.value.trim() || undefined,
    gravamenTipoId: gravamenTipoId.value,
  })
  editando.value = false
  return props.inmuebleId
}

defineExpose({ guardar, alternarEdicion })

// ── carga inicial ────────────────────────────────────────────────────
watchEffect(async () => {
  const tenantId = tenantStore.activeTenant?.id
  if (!tenantId) return
  ;[
    tiposInmueble.value,
    estadosLegales.value,
    habitabilidades.value,
    usosPredio.value,
    tiposIdentificacion.value,
    tiposZonaComun.value,
    tiposGravamen.value,
  ] = await Promise.all([
    cargarListaTipos(tenantId, 'TIPO_INMUEBLE'),
    cargarListaTipos(tenantId, 'ESTADO_LEGAL_PREDIO'),
    cargarListaTipos(tenantId, 'HABITABILIDAD_PREDIO'),
    cargarListaTipos(tenantId, 'USO_PREDIO'),
    cargarListaTipos(tenantId, 'TIPO_IDENTIFICACION'),
    cargarListaTipos(tenantId, 'TIPO_ZONA_COMUN'),
    cargarListaTipos(tenantId, 'TIPO_GRAVAMEN'),
  ])
  await tercerosStore.cargarRolesPersonaPredio(tenantId)
  // El árbol de agrupaciones alimenta el selector "Agrupación"; se carga
  // entero porque es chico y la ruta legible se deriva en el cliente.
  await Promise.all([
    agrupacionesStore.cargarTiposAgrupacion(tenantId),
    agrupacionesStore.cargarAgrupaciones(tenantId),
  ])

  if (props.inmuebleId) {
    await Promise.all([
      inmueblesStore.cargarZonasExclusivas(tenantId, props.inmuebleId),
      inmueblesStore.cargarCoeficienteVigente(tenantId, props.inmuebleId),
      tercerosStore.cargarTercerosAsociados(tenantId, props.inmuebleId),
    ])
  }
})
</script>

<template>
  <div>
    <div v-if="esCreacion" class="w-1/2">
      <div class="section-title" style="margin-top: 0"><h2>Datos generales</h2></div>
      <div class="space-y-4 text-sm">
        <div class="grid grid-cols-[2fr_3fr] gap-4">
          <UFormField label="Código" name="codigo" help="Único en la copropiedad.">
            <UInput v-model="codigo" type="text" placeholder="AP-501" class="w-full" />
          </UFormField>
          <UFormField label="Tipo" name="tipo_id">
            <UiSelectorBuscable v-model="tipoId" :opciones="opcionesTipoInmueble" placeholder="— Elegir —" />
          </UFormField>
        </div>
        <div class="grid grid-cols-[3fr_2fr] gap-4">
          <UFormField label="Matrícula inmobiliaria" name="matricula">
            <UInput v-model="matricula" type="text" placeholder="060-987654" class="w-full" />
          </UFormField>
          <UFormField label="Estado" name="estado">
            <USelect
              v-model="estado"
              :items="[
                { label: 'Activo', value: 'activo' },
                { label: 'Inactivo', value: 'inactivo' },
              ]"
              value-key="value"
              class="w-full"
            />
          </UFormField>
        </div>
        <div class="grid grid-cols-2 gap-4">
          <UFormField label="Área privada (m²)" name="area_privada">
            <UInput v-model.number="areaPrivada" type="number" step="0.01" placeholder="78.40" class="w-full" />
          </UFormField>
          <UFormField label="Área común (m²)" name="area_comun">
            <UInput v-model.number="areaComun" type="number" step="0.01" placeholder="6.20" class="w-full" />
          </UFormField>
        </div>
        <div class="grid grid-cols-2 gap-4">
          <UFormField label="Habitabilidad" name="habitabilidad_id">
            <UiSelectorBuscable v-model="habitabilidadId" :opciones="opcionesHabitabilidad" />
          </UFormField>
          <UFormField label="Uso del predio" name="uso_predio_id">
            <UiSelectorBuscable v-model="usoPredioId" :opciones="opcionesUsoPredio" />
          </UFormField>
        </div>
        <div class="grid gap-4" :class="estadoLegalId === null ? 'grid-cols-1' : 'grid-cols-[2fr_3fr]'">
          <UFormField label="Estado legal" name="estado_legal_id">
            <UiSelectorBuscable v-model="estadoLegalId" :opciones="opcionesEstadoLegal" />
          </UFormField>
          <UFormField v-if="estadoLegalId !== null" label="Observaciones" name="estado_legal_observaciones">
            <UInput v-model="estadoLegalObservaciones" type="text" placeholder="Radicado, juzgado, fecha…" class="w-full" />
          </UFormField>
        </div>
        <UFormField label="Agrupación" name="agrupacion_id" help="Se definen en Ajustes › Agrupaciones.">
          <UiSelectorBuscable v-model="agrupacionId" :opciones="opcionesAgrupacion" />
        </UFormField>
        <div class="grid grid-cols-[3fr_2fr] gap-4">
          <UFormField label="Referencia catastral" name="referencia_catastral">
            <UInput v-model="referenciaCatastral" type="text" placeholder="00-01-0001-0001-000000000000" class="w-full" />
          </UFormField>
          <UFormField label="Tipo de gravamen" name="gravamen_tipo_id">
            <UiSelectorBuscable v-model="gravamenTipoId" :opciones="opcionesTipoGravamen" placeholder="— Elegir —" />
          </UFormField>
        </div>
        <UAlert
          v-if="locatarioFaltante"
          color="warning"
          variant="soft"
          title="Falta el locatario"
          description="Este inmueble tiene un gravamen registrado — agrega un tercero con rol Locatario en Personas asociadas."
        />
      </div>
    </div>

    <div v-else class="grid-2">
      <div>
        <div class="section-title" style="margin-top: 0">
          <p class="card-title" style="margin: 0">Ficha técnica</p>
          <UButton variant="outline" color="neutral" size="xs" @click="alternarEdicion">Editar</UButton>
        </div>
        <dl class="ledger">
          <div class="ledger-row"><dt>Código</dt><dd>{{ inmueblesStore.inmuebleActivo?.codigo }}</dd></div>
          <div class="ledger-row">
            <dt>Tipo</dt>
            <dd>{{ tiposInmueble.find((t) => t.id === inmueblesStore.inmuebleActivo?.tipo_id)?.nombre ?? '—' }}</dd>
          </div>
          <div class="ledger-row"><dt>Agrupación</dt><dd>{{ rutaAgrupacionActual }}</dd></div>
          <div class="ledger-row"><dt>Estado</dt><dd>{{ inmueblesStore.inmuebleActivo?.estado }}</dd></div>
          <div class="ledger-row">
            <dt>Matrícula inmobiliaria</dt><dd>{{ inmueblesStore.inmuebleActivo?.matricula_inmobiliaria ?? '—' }}</dd>
          </div>
          <div class="ledger-row"><dt>Área privada</dt><dd>{{ inmueblesStore.inmuebleActivo?.area_privada ?? '—' }} m²</dd></div>
          <div class="ledger-row"><dt>Área común asignada</dt><dd>{{ inmueblesStore.inmuebleActivo?.area_comun ?? '—' }} m²</dd></div>
          <div class="ledger-row">
            <dt>Habitabilidad</dt>
            <dd>{{ habitabilidades.find((h) => h.id === inmueblesStore.inmuebleActivo?.habitabilidad_id)?.nombre ?? '—' }}</dd>
          </div>
          <div class="ledger-row">
            <dt>Estado legal</dt>
            <dd>{{ estadosLegales.find((e) => e.id === inmueblesStore.inmuebleActivo?.estado_legal_id)?.nombre ?? 'Sin novedad' }}</dd>
          </div>
          <div class="ledger-row">
            <dt>Uso del predio</dt>
            <dd>{{ usosPredio.find((u) => u.id === inmueblesStore.inmuebleActivo?.uso_predio_id)?.nombre ?? '—' }}</dd>
          </div>
          <div class="ledger-row">
            <dt>Referencia catastral</dt>
            <dd>{{ inmueblesStore.inmuebleActivo?.referencia_catastral ?? '—' }}</dd>
          </div>
          <div class="ledger-row">
            <dt>Tipo de gravamen</dt>
            <dd>
              {{ tiposGravamen.find((g) => g.id === inmueblesStore.inmuebleActivo?.gravamen_tipo_id)?.nombre ?? '—' }}
            </dd>
          </div>
        </dl>
        <UAlert
          v-if="locatarioFaltantePersistido"
          color="warning"
          variant="soft"
          title="Falta el locatario"
          description="Este inmueble tiene un gravamen registrado — agrega un tercero con rol Locatario en Personas asociadas."
          class="mt-3"
        />
      </div>

      <div>
        <div class="card">
          <p class="card-title">Coeficiente de copropiedad</p>
          <div v-if="inmueblesStore.coeficienteVigente" class="coef-row">
            <span class="coef-value">{{ inmueblesStore.coeficienteVigente.valor }}</span>
            <span class="coef-version">versión {{ inmueblesStore.coeficienteVigente.set.version }}</span>
          </div>
          <p v-else class="empty-state">Sin coeficiente vigente asignado.</p>
        </div>

        <div class="card">
          <p class="card-title">Zonas comunes de uso exclusivo</p>
          <ul v-if="inmueblesStore.zonasExclusivas.length > 0" class="exclusive-list">
            <li v-for="z in inmueblesStore.zonasExclusivas" :key="z.id">
              <span>
                {{ z.nombre }}
                <span class="field-hint">({{ nombreTipoZonaComun(z.tipo_id) }})</span>
              </span>
              <span class="area">{{ z.area ?? '—' }} m²</span>
            </li>
          </ul>
          <p v-else class="empty-state">Sin zonas de uso exclusivo.</p>
        </div>
      </div>
    </div>

    <UiDrawer
      :abierto="editando"
      titulo="Editar ficha técnica"
      subtitulo="Datos generales del inmueble."
      @cerrar="editando = false"
    >
      <div class="space-y-4 text-sm">
        <div class="grid grid-cols-[2fr_3fr] gap-4">
          <UFormField label="Código" name="codigo" help="Único en la copropiedad.">
            <UInput v-model="codigo" type="text" placeholder="AP-501" class="w-full" />
          </UFormField>
          <UFormField label="Tipo" name="tipo_id">
            <UiSelectorBuscable v-model="tipoId" :opciones="opcionesTipoInmueble" placeholder="— Elegir —" />
          </UFormField>
        </div>
        <div class="grid grid-cols-[3fr_2fr] gap-4">
          <UFormField label="Matrícula inmobiliaria" name="matricula">
            <UInput v-model="matricula" type="text" placeholder="060-987654" class="w-full" />
          </UFormField>
          <UFormField label="Estado" name="estado">
            <USelect
              v-model="estado"
              :items="[
                { label: 'Activo', value: 'activo' },
                { label: 'Inactivo', value: 'inactivo' },
              ]"
              value-key="value"
              class="w-full"
            />
          </UFormField>
        </div>
        <div class="grid grid-cols-2 gap-4">
          <UFormField label="Área privada (m²)" name="area_privada">
            <UInput v-model.number="areaPrivada" type="number" step="0.01" placeholder="78.40" class="w-full" />
          </UFormField>
          <UFormField label="Área común (m²)" name="area_comun">
            <UInput v-model.number="areaComun" type="number" step="0.01" placeholder="6.20" class="w-full" />
          </UFormField>
        </div>
        <div class="grid grid-cols-2 gap-4">
          <UFormField label="Habitabilidad" name="habitabilidad_id">
            <UiSelectorBuscable v-model="habitabilidadId" :opciones="opcionesHabitabilidad" />
          </UFormField>
          <UFormField label="Uso del predio" name="uso_predio_id">
            <UiSelectorBuscable v-model="usoPredioId" :opciones="opcionesUsoPredio" />
          </UFormField>
        </div>
        <div class="grid gap-4" :class="estadoLegalId === null ? 'grid-cols-1' : 'grid-cols-[2fr_3fr]'">
          <UFormField label="Estado legal" name="estado_legal_id">
            <UiSelectorBuscable v-model="estadoLegalId" :opciones="opcionesEstadoLegal" />
          </UFormField>
          <UFormField v-if="estadoLegalId !== null" label="Observaciones" name="estado_legal_observaciones">
            <UInput v-model="estadoLegalObservaciones" type="text" placeholder="Radicado, juzgado, fecha…" class="w-full" />
          </UFormField>
        </div>
        <UFormField label="Agrupación" name="agrupacion_id" help="Se definen en Ajustes › Agrupaciones.">
          <UiSelectorBuscable v-model="agrupacionId" :opciones="opcionesAgrupacion" />
        </UFormField>
        <div class="grid grid-cols-[3fr_2fr] gap-4">
          <UFormField label="Referencia catastral" name="referencia_catastral">
            <UInput v-model="referenciaCatastral" type="text" placeholder="00-01-0001-0001-000000000000" class="w-full" />
          </UFormField>
          <UFormField label="Tipo de gravamen" name="gravamen_tipo_id">
            <UiSelectorBuscable v-model="gravamenTipoId" :opciones="opcionesTipoGravamen" placeholder="— Elegir —" />
          </UFormField>
        </div>
        <UAlert
          v-if="locatarioFaltante"
          color="warning"
          variant="soft"
          title="Falta el locatario"
          description="Este inmueble tiene un gravamen registrado — agrega un tercero con rol Locatario en Personas asociadas."
        />
      </div>
      <UAlert v-if="errorEdicion" color="error" variant="soft" :title="errorEdicion" class="mt-4" />
      <template #foot>
        <UButton variant="ghost" @click="editando = false">Cancelar</UButton>
        <UButton :loading="guardandoEdicion" @click="guardarEdicion">Guardar cambios</UButton>
      </template>
    </UiDrawer>

    <!-- Personas asociadas: en creación quedan en espera hasta guardar el
         inmueble; en ficha ya están persistidas. -->
    <template v-if="esCreacion">
      <div class="section-title">
        <h2>Personas asociadas</h2>
        <UButton variant="outline" color="neutral" size="xs" @click="mostrarFormPersona = true">
          Agregar otra persona
        </UButton>
      </div>
      <div v-if="mostrarFormPersona" class="w-1/2">
        <InmueblesInmueblePersonaForm :roles="rolesDisponibles" @guardar="agregarPersona" @cancelar="mostrarFormPersona = false" />
      </div>
      <UiTabla
        :columnas="[
          { clave: 'nombre', etiqueta: 'Persona' },
          { clave: 'documento', etiqueta: 'Documento', claseCelda: 'mono' },
          { clave: 'rol', etiqueta: 'Rol' },
          { clave: 'participacion', etiqueta: 'Participación', alinear: 'derecha', claseCelda: 'mono' },
          { clave: 'acciones', etiqueta: '' },
        ]"
        :filas="personasEnEspera"
        :clave-fila="(_p, i) => i"
        vacio="Todavía no hay personas agregadas."
      >
        <template #celda-documento="{ fila }">{{ nombreTipoIdentificacion(fila.tipoIdentificacionId) }} {{ fila.numeroDocumento }}</template>
        <template #celda-rol="{ fila }">{{ nombreRol(fila.rolId) }}</template>
        <template #celda-participacion="{ fila }">{{ fila.porcentaje ? `${fila.porcentaje} %` : '—' }}</template>
        <template #celda-acciones="{ indice }">
          <UButton variant="ghost" color="error" size="xs" @click="quitarPersonaEnEspera(indice)">✕</UButton>
        </template>
      </UiTabla>
    </template>

    <template v-else>
      <div class="section-title">
        <div>
          <h2>Personas asociadas</h2>
          <p class="panel-sub">Cualquier persona natural o jurídica con una relación vigente con este inmueble.</p>
        </div>
      </div>
      <UiDrawer
        :abierto="mostrarFormPersona"
        titulo="Agregar persona"
        subtitulo="Asocia una persona natural o jurídica a este inmueble."
        @cerrar="mostrarFormPersona = false"
      >
        <InmueblesInmueblePersonaForm :roles="rolesDisponibles" @guardar="agregarPersona" @cancelar="mostrarFormPersona = false" />
      </UiDrawer>
      <div class="mt-4 mb-6 flex items-center justify-between gap-4 flex-wrap">
        <UButtonGroup size="xs">
          <UButton
            :color="filtroRol === 'todas' ? 'primary' : 'neutral'"
            :variant="filtroRol === 'todas' ? 'solid' : 'outline'"
            @click="filtroRol = 'todas'"
          >
            Todas
          </UButton>
          <UButton
            v-for="r in rolesDisponibles"
            :key="r.id"
            :color="filtroRol === r.codigo ? 'primary' : 'neutral'"
            :variant="filtroRol === r.codigo ? 'solid' : 'outline'"
            @click="filtroRol = r.codigo"
          >
            {{ r.nombre }}
          </UButton>
        </UButtonGroup>
        <UButton variant="outline" color="neutral" size="sm" @click="mostrarFormPersona = true">
          Agregar persona
        </UButton>
      </div>
      <UiTabla
        :columnas="[
          { clave: 'nombre', etiqueta: 'Persona' },
          { clave: 'documento', etiqueta: 'Documento', claseCelda: 'mono' },
          { clave: 'rol', etiqueta: 'Rol' },
          { clave: 'participacion', etiqueta: 'Participación', alinear: 'derecha', claseCelda: 'mono' },
          { clave: 'pagador', etiqueta: 'Pagador' },
          { clave: 'notificaciones', etiqueta: 'Notificaciones' },
          { clave: 'vigencia', etiqueta: 'Vigencia', claseCelda: 'mono' },
          { clave: 'contacto', etiqueta: 'Contacto' },
        ]"
        :filas="personasAsociadasFiltradas"
        :clave-fila="(p) => p.id"
        vacio="Sin personas asociadas todavía."
        encabezado-alto
      >
        <template #celda-nombre="{ fila }">{{ fila.tercero.nombre_completo }}</template>
        <template #celda-documento="{ fila }">{{ nombreTipoIdentificacion(fila.tercero.tipo_identificacion_id) }} {{ fila.tercero.numero_documento }}</template>
        <template #celda-rol="{ fila }"><UBadge color="neutral" variant="subtle">{{ fila.rol.nombre }}</UBadge></template>
        <template #celda-participacion="{ fila }">{{ fila.porcentaje ? `${fila.porcentaje} %` : '—' }}</template>
        <template #celda-pagador="{ fila }">
          <div class="text-center">
            <UButton
              :color="fila.es_pagador ? 'success' : 'neutral'"
              variant="ghost"
              size="xs"
              :title="fila.es_pagador ? 'Recibe la factura' : 'Marcar como pagador'"
              @click="marcarPagador(fila.id)"
            >
              {{ fila.es_pagador ? '✓' : '✕' }}
            </UButton>
          </div>
        </template>
        <template #celda-notificaciones="{ fila }">
          <div style="text-align: center">{{ fila.recibe_notificaciones ? '✓' : '✕' }}</div>
        </template>
        <template #celda-vigencia="{ fila }">
          desde {{ fila.vigente_desde }}<template v-if="fila.vigente_hasta"> → {{ fila.vigente_hasta }}</template>
        </template>
        <template #celda-contacto="{ fila }">
          <span style="color: var(--ink-faint); font-size: 12.5px">{{ fila.tercero.email ?? '—' }}<br>{{ fila.tercero.telefono ?? '' }}</span>
        </template>
      </UiTabla>
      <p class="note">
        Los roles (copropietario, inquilino, apoderado, codeudor…) vienen de un catálogo
        <strong>por copropiedad, ampliable sin despliegue</strong> — cada administradora puede
        agregar un rol propio desde Configuración → Catálogos.
      </p>
    </template>
  </div>
</template>
