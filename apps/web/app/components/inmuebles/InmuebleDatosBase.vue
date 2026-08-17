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

type TipoInmuebleRow = Database['public']['Tables']['lista_tipos']['Row']
const tiposInmueble = shallowRef<TipoInmuebleRow[]>([])
const estadosLegales = shallowRef<TipoInmuebleRow[]>([])
const habitabilidades = shallowRef<TipoInmuebleRow[]>([])
const tiposIdentificacion = shallowRef<TipoInmuebleRow[]>([])

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

const errorEdicion = ref<string | null>(null)
const guardandoEdicion = ref(false)

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
    errorEdicion.value =
      excepcion instanceof Error ? excepcion.message : 'No se pudieron guardar los cambios.'
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
  })
  editando.value = false
  return props.inmuebleId
}

defineExpose({ guardar, alternarEdicion })

// ── carga inicial ────────────────────────────────────────────────────
watchEffect(async () => {
  const tenantId = tenantStore.activeTenant?.id
  if (!tenantId) return
  ;[tiposInmueble.value, estadosLegales.value, habitabilidades.value, tiposIdentificacion.value] =
    await Promise.all([
      cargarListaTipos(tenantId, 'TIPO_INMUEBLE'),
      cargarListaTipos(tenantId, 'ESTADO_LEGAL_PREDIO'),
      cargarListaTipos(tenantId, 'HABITABILIDAD_PREDIO'),
      cargarListaTipos(tenantId, 'TIPO_IDENTIFICACION'),
    ])
  await tercerosStore.cargarRolesPersonaPredio(tenantId)

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
    <div v-if="esCreacion">
      <div class="section-title" style="margin-top: 0"><h2>Datos generales</h2></div>
      <div class="form-grid">
        <div class="field">
          <label for="f-codigo">Código del inmueble</label>
          <input id="f-codigo" v-model="codigo" type="text" placeholder="AP-501">
          <span class="field-hint">Debe ser único dentro de la copropiedad.</span>
        </div>
        <div class="field">
          <label for="f-tipo">Tipo</label>
          <UiSelectorBuscable
            id="f-tipo"
            v-model="tipoId"
            variante="ficha"
            :opciones="opcionesTipoInmueble"
            placeholder="— Elegir —"
          />
        </div>
        <div class="field">
          <label for="f-matricula">Matrícula inmobiliaria</label>
          <input id="f-matricula" v-model="matricula" type="text" placeholder="060-987654">
        </div>
        <div class="field">
          <label for="f-estado">Estado</label>
          <select id="f-estado" v-model="estado">
            <option value="activo">Activo</option>
            <option value="inactivo">Inactivo</option>
          </select>
        </div>
        <div class="field">
          <label for="f-area-priv">Área privada (m²)</label>
          <input id="f-area-priv" v-model.number="areaPrivada" type="number" step="0.01" placeholder="78.40">
        </div>
        <div class="field">
          <label for="f-area-com">Área común asignada (m²)</label>
          <input id="f-area-com" v-model.number="areaComun" type="number" step="0.01" placeholder="6.20">
        </div>
        <div class="field">
          <label for="f-habitabilidad">Habitabilidad</label>
          <UiSelectorBuscable
            id="f-habitabilidad"
            v-model="habitabilidadId"
            variante="ficha"
            :opciones="opcionesHabitabilidad"
          />
        </div>
        <div class="field">
          <label for="f-estado-legal">Estado legal</label>
          <UiSelectorBuscable
            id="f-estado-legal"
            v-model="estadoLegalId"
            variante="ficha"
            :opciones="opcionesEstadoLegal"
          />
        </div>
        <div v-if="estadoLegalId !== null" class="field span-2">
          <label for="f-estado-legal-obs">Observaciones</label>
          <input id="f-estado-legal-obs" v-model="estadoLegalObservaciones" type="text" placeholder="Radicado, juzgado, fecha…">
        </div>
      </div>
    </div>

    <div v-else class="grid-2">
      <div>
        <div class="section-title" style="margin-top: 0">
          <p class="card-title" style="margin: 0">Ficha técnica</p>
          <button type="button" class="btn btn--ghost" style="font-size: 12px; padding: 5px 11px" @click="alternarEdicion">
            Editar
          </button>
        </div>
        <dl class="ledger">
          <div class="ledger-row"><dt>Código</dt><dd>{{ inmueblesStore.inmuebleActivo?.codigo }}</dd></div>
          <div class="ledger-row">
            <dt>Tipo</dt>
            <dd>{{ tiposInmueble.find((t) => t.id === inmueblesStore.inmuebleActivo?.tipo_id)?.nombre ?? '—' }}</dd>
          </div>
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
        </dl>
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
              <span>{{ z.nombre }}</span>
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
      <div class="form-grid">
        <div class="field">
          <label for="fe-codigo">Código del inmueble</label>
          <input id="fe-codigo" v-model="codigo" type="text" placeholder="AP-501">
          <span class="field-hint">Debe ser único dentro de la copropiedad.</span>
        </div>
        <div class="field">
          <label for="fe-tipo">Tipo</label>
          <UiSelectorBuscable
            id="fe-tipo"
            v-model="tipoId"
            variante="ficha"
            :opciones="opcionesTipoInmueble"
            placeholder="— Elegir —"
          />
        </div>
        <div class="field">
          <label for="fe-matricula">Matrícula inmobiliaria</label>
          <input id="fe-matricula" v-model="matricula" type="text" placeholder="060-987654">
        </div>
        <div class="field">
          <label for="fe-estado">Estado</label>
          <select id="fe-estado" v-model="estado">
            <option value="activo">Activo</option>
            <option value="inactivo">Inactivo</option>
          </select>
        </div>
        <div class="field">
          <label for="fe-area-priv">Área privada (m²)</label>
          <input id="fe-area-priv" v-model.number="areaPrivada" type="number" step="0.01" placeholder="78.40">
        </div>
        <div class="field">
          <label for="fe-area-com">Área común asignada (m²)</label>
          <input id="fe-area-com" v-model.number="areaComun" type="number" step="0.01" placeholder="6.20">
        </div>
        <div class="field">
          <label for="fe-habitabilidad">Habitabilidad</label>
          <UiSelectorBuscable
            id="fe-habitabilidad"
            v-model="habitabilidadId"
            variante="ficha"
            :opciones="opcionesHabitabilidad"
          />
        </div>
        <div class="field">
          <label for="fe-estado-legal">Estado legal</label>
          <UiSelectorBuscable
            id="fe-estado-legal"
            v-model="estadoLegalId"
            variante="ficha"
            :opciones="opcionesEstadoLegal"
          />
        </div>
        <div v-if="estadoLegalId !== null" class="field span-2">
          <label for="fe-estado-legal-obs">Observaciones</label>
          <input id="fe-estado-legal-obs" v-model="estadoLegalObservaciones" type="text" placeholder="Radicado, juzgado, fecha…">
        </div>
      </div>
      <p v-if="errorEdicion" class="note" style="color: var(--ladrillo-text)">{{ errorEdicion }}</p>
      <template #foot>
        <button type="button" class="btn btn--ghost" @click="editando = false">Cancelar</button>
        <button type="button" class="btn btn--primary" :disabled="guardandoEdicion" @click="guardarEdicion">
          {{ guardandoEdicion ? 'Guardando…' : 'Guardar cambios' }}
        </button>
      </template>
    </UiDrawer>

    <!-- Personas asociadas: en creación quedan en espera hasta guardar el
         inmueble; en ficha ya están persistidas. -->
    <template v-if="esCreacion">
      <div class="section-title">
        <h2>Personas asociadas</h2>
        <button type="button" class="btn btn--ghost" style="font-size: 12px; padding: 5px 11px" @click="mostrarFormPersona = true">
          Agregar otra persona
        </button>
      </div>
      <InmueblesInmueblePersonaForm v-if="mostrarFormPersona" :roles="rolesDisponibles" @guardar="agregarPersona" @cancelar="mostrarFormPersona = false" />
      <UiTabla
        variante="ficha"
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
          <button type="button" class="icon-btn-sm reject" @click="quitarPersonaEnEspera(indice)">✕</button>
        </template>
      </UiTabla>
    </template>

    <template v-else>
      <div class="section-title">
        <div>
          <h2>Personas asociadas</h2>
          <p class="panel-sub">Cualquier persona natural o jurídica con una relación vigente con este inmueble.</p>
        </div>
        <button type="button" class="btn btn--ghost" style="font-size: 12.5px; padding: 6px 12px" @click="mostrarFormPersona = true">
          Agregar persona
        </button>
      </div>
      <UiDrawer
        :abierto="mostrarFormPersona"
        titulo="Agregar persona"
        subtitulo="Asocia una persona natural o jurídica a este inmueble."
        @cerrar="mostrarFormPersona = false"
      >
        <InmueblesInmueblePersonaForm :roles="rolesDisponibles" @guardar="agregarPersona" @cancelar="mostrarFormPersona = false" />
      </UiDrawer>
      <div class="chips">
        <button type="button" class="chip" :class="{ 'is-active': filtroRol === 'todas' }" @click="filtroRol = 'todas'">Todas</button>
        <button v-for="r in rolesDisponibles" :key="r.id" type="button" class="chip" :class="{ 'is-active': filtroRol === r.codigo }" @click="filtroRol = r.codigo">
          {{ r.nombre }}
        </button>
      </div>
      <UiTabla
        variante="ficha"
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
      >
        <template #celda-nombre="{ fila }">{{ fila.tercero.nombre_completo }}</template>
        <template #celda-documento="{ fila }">{{ nombreTipoIdentificacion(fila.tercero.tipo_identificacion_id) }} {{ fila.tercero.numero_documento }}</template>
        <template #celda-rol="{ fila }"><span class="badge badge--gris">{{ fila.rol.nombre }}</span></template>
        <template #celda-participacion="{ fila }">{{ fila.porcentaje ? `${fila.porcentaje} %` : '—' }}</template>
        <template #celda-pagador="{ fila }">
          <div style="text-align: center">
            <button
              type="button"
              class="icon-btn-sm"
              :class="{ approve: fila.es_pagador }"
              :title="fila.es_pagador ? 'Recibe la factura' : 'Marcar como pagador'"
              @click="marcarPagador(fila.id)"
            >
              {{ fila.es_pagador ? '✓' : '✕' }}
            </button>
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
