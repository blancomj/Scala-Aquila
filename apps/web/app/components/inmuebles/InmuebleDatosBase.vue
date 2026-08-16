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

const mostrarFormulario = computed(() => props.esCreacion || editando.value)

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
  editando.value = !editando.value
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

// ── guardar (expuesto al padre — solo se usa en modo creación) ─────────
async function guardar(): Promise<string> {
  const tenantId = tenantStore.activeTenant?.id
  if (!tenantId) throw new Error('No hay copropiedad activa.')
  if (!codigo.value.trim()) throw new Error('El código del inmueble es obligatorio.')
  if (tipoId.value === null) throw new Error('Elige un tipo de inmueble.')
  if (personasEnEspera.value.length === 0) {
    throw new Error('Agrega al menos una persona asociada antes de guardar.')
  }

  if (props.esCreacion) {
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
    <div v-if="!mostrarFormulario" class="grid-2">
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

    <div v-else>
      <div class="section-title" style="margin-top: 0"><h2>Datos generales</h2></div>
      <div class="form-grid">
        <div class="field">
          <label for="f-codigo">Código del inmueble</label>
          <input id="f-codigo" v-model="codigo" type="text" placeholder="AP-501">
          <span class="field-hint">Debe ser único dentro de la copropiedad.</span>
        </div>
        <div class="field">
          <label for="f-tipo">Tipo</label>
          <select id="f-tipo" v-model.number="tipoId">
            <option :value="null" disabled>— Elegir —</option>
            <option v-for="t in tiposInmueble" :key="t.id" :value="t.id">{{ t.nombre }}</option>
          </select>
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
          <select id="f-habitabilidad" v-model.number="habitabilidadId">
            <option :value="null">— Sin especificar —</option>
            <option v-for="h in habitabilidades" :key="h.id" :value="h.id">{{ h.nombre }}</option>
          </select>
        </div>
        <div class="field">
          <label for="f-estado-legal">Estado legal</label>
          <select id="f-estado-legal" v-model.number="estadoLegalId">
            <option :value="null">— Sin novedad —</option>
            <option v-for="e in estadosLegales" :key="e.id" :value="e.id">{{ e.nombre }}</option>
          </select>
        </div>
        <div v-if="estadoLegalId !== null" class="field span-2">
          <label for="f-estado-legal-obs">Observaciones</label>
          <input id="f-estado-legal-obs" v-model="estadoLegalObservaciones" type="text" placeholder="Radicado, juzgado, fecha…">
        </div>
      </div>
    </div>

    <!-- Personas asociadas: en creación quedan en espera hasta guardar el
         inmueble; en ficha (viendo o editando datos generales) ya están
         persistidas — independiente de si mostrarFormulario está activo. -->
    <template v-if="esCreacion">
      <div class="section-title">
        <h2>Personas asociadas</h2>
        <button type="button" class="btn btn--ghost" style="font-size: 12px; padding: 5px 11px" @click="mostrarFormPersona = true">
          Agregar otra persona
        </button>
      </div>
      <InmueblesInmueblePersonaForm v-if="mostrarFormPersona" :roles="rolesDisponibles" @guardar="agregarPersona" @cancelar="mostrarFormPersona = false" />
      <table v-if="personasEnEspera.length > 0">
        <thead><tr><th>Persona</th><th>Documento</th><th>Rol</th><th class="num">Participación</th><th /></tr></thead>
        <tbody>
          <tr v-for="(p, i) in personasEnEspera" :key="i">
            <td>{{ p.nombre }}</td>
            <td class="mono">{{ nombreTipoIdentificacion(p.tipoIdentificacionId) }} {{ p.numeroDocumento }}</td>
            <td>{{ nombreRol(p.rolId) }}</td>
            <td class="num mono">{{ p.porcentaje ? `${p.porcentaje} %` : '—' }}</td>
            <td><button type="button" class="icon-btn-sm reject" @click="quitarPersonaEnEspera(i)">✕</button></td>
          </tr>
        </tbody>
      </table>
      <p v-else class="empty-state">Todavía no hay personas agregadas.</p>
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
      <InmueblesInmueblePersonaForm v-if="mostrarFormPersona" :roles="rolesDisponibles" @guardar="agregarPersona" @cancelar="mostrarFormPersona = false" />
      <div class="chips">
        <button type="button" class="chip" :class="{ 'is-active': filtroRol === 'todas' }" @click="filtroRol = 'todas'">Todas</button>
        <button v-for="r in rolesDisponibles" :key="r.id" type="button" class="chip" :class="{ 'is-active': filtroRol === r.codigo }" @click="filtroRol = r.codigo">
          {{ r.nombre }}
        </button>
      </div>
      <table v-if="personasAsociadasFiltradas.length > 0">
        <thead>
          <tr>
            <th>Persona</th><th>Documento</th><th>Rol</th><th class="num">Participación</th><th>Pagador</th><th>Notificaciones</th><th>Vigencia</th><th>Contacto</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="p in personasAsociadasFiltradas" :key="p.id">
            <td>{{ p.tercero.nombre_completo }}</td>
            <td class="mono">{{ nombreTipoIdentificacion(p.tercero.tipo_identificacion_id) }} {{ p.tercero.numero_documento }}</td>
            <td><span class="badge badge--gris">{{ p.rol.nombre }}</span></td>
            <td class="num mono">{{ p.porcentaje ? `${p.porcentaje} %` : '—' }}</td>
            <td style="text-align: center">
              <button
                type="button"
                class="icon-btn-sm"
                :class="{ approve: p.es_pagador }"
                :title="p.es_pagador ? 'Recibe la factura' : 'Marcar como pagador'"
                @click="marcarPagador(p.id)"
              >
                {{ p.es_pagador ? '✓' : '✕' }}
              </button>
            </td>
            <td style="text-align: center">{{ p.recibe_notificaciones ? '✓' : '✕' }}</td>
            <td class="mono">
              desde {{ p.vigente_desde }}<template v-if="p.vigente_hasta"> → {{ p.vigente_hasta }}</template>
            </td>
            <td style="color: var(--ink-faint); font-size: 12.5px">
              {{ p.tercero.email ?? '—' }}<br>{{ p.tercero.telefono ?? '' }}
            </td>
          </tr>
        </tbody>
      </table>
      <p v-else class="empty-state">Sin personas asociadas todavía.</p>
      <p class="note">
        Los roles (copropietario, inquilino, apoderado, codeudor…) vienen de un catálogo
        <strong>por copropiedad, ampliable sin despliegue</strong> — cada administradora puede
        agregar un rol propio desde Configuración → Catálogos.
      </p>
    </template>
  </div>
</template>
