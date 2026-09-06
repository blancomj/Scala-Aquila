<script setup lang="ts">
// MANT-1 §3.4: configuración del esquema de atributos por tipo de activo (con aviso de cuántos
// activos se verán afectados antes de guardar) y de los criterios/bandas de criticidad
// (versionados — mismo patrón que coeficiente_sets). MANT-2: requisitos de cumplimiento
// normativo, predefinidos por copropiedad y 100% editables (ver sección al final del archivo).
import type { Database } from '@aquila/shared'

definePageMeta({ layout: 'default', middleware: ['tenant', 'rbac'], permiso: 'settings:manage' })

const tenantStore = useTenantStore()
const configStore = useMantenimientoConfiguracionStore()

// ── Atributos por tipo de activo ────────────────────────────────────────
const tipos = ref<Awaited<ReturnType<typeof cargarListaTipos>>>([])
const unidades = ref<Awaited<ReturnType<typeof cargarListaTipos>>>([])
const tipoSeleccionadoId = ref<number | undefined>(undefined)

const TIPOS_DATO = [
  { label: 'Número', value: 'numero' },
  { label: 'Texto', value: 'texto' },
  { label: 'Booleano', value: 'booleano' },
  { label: 'Fecha', value: 'fecha' },
  { label: 'Opción', value: 'opcion' },
]

const modalDefinicion = ref(false)
const definicionEditando = ref<{
  id?: string; codigo: string; nombre: string; tipoDato: string
  unidadId: number | undefined; opciones: string; obligatorio: boolean
} | null>(null)
const avisoActivosAfectados = ref<number | null>(null)

async function cargarTipos(): Promise<void> {
  const tenantId = tenantStore.activeTenant?.id
  if (!tenantId) return
  const [t, u] = await Promise.all([
    cargarListaTipos(tenantId, 'TIPO_ACTIVO'),
    cargarListaTipos(tenantId, 'UNIDAD_MEDIDA'),
  ])
  tipos.value = t
  unidades.value = u
  tipoSeleccionadoId.value ??= t[0]?.id
}

async function cargarDefiniciones(): Promise<void> {
  const tenantId = tenantStore.activeTenant?.id
  if (!tenantId || tipoSeleccionadoId.value == null) return
  await configStore.cargarDefiniciones(tenantId, tipoSeleccionadoId.value)
}

watch(tipoSeleccionadoId, cargarDefiniciones)
onMounted(async () => { await cargarTipos(); await cargarDefiniciones() })

function nuevaDefinicion(): void {
  definicionEditando.value = { codigo: '', nombre: '', tipoDato: 'numero', unidadId: undefined, opciones: '', obligatorio: false }
  avisoActivosAfectados.value = null
  modalDefinicion.value = true
}

async function editarDefinicion(id: string): Promise<void> {
  const def = configStore.definiciones.find((d) => d.id === id)
  if (!def) return
  definicionEditando.value = {
    id: def.id, codigo: def.codigo, nombre: def.nombre, tipoDato: def.tipo_dato,
    unidadId: def.unidad_id ?? undefined, opciones: (def.opciones ?? []).join(', '), obligatorio: def.obligatorio,
  }
  const tenantId = tenantStore.activeTenant?.id
  if (tenantId && tipoSeleccionadoId.value != null) {
    avisoActivosAfectados.value = await configStore.contarActivosConAtributo(tenantId, tipoSeleccionadoId.value, def.codigo)
  }
  modalDefinicion.value = true
}

async function guardarDefinicion(): Promise<void> {
  const tenantId = tenantStore.activeTenant?.id
  const d = definicionEditando.value
  if (!tenantId || !d || tipoSeleccionadoId.value == null) return
  await configStore.guardarDefinicion({
    id: d.id,
    tenant_id: tenantId,
    tipo_activo_id: tipoSeleccionadoId.value,
    codigo: d.codigo,
    nombre: d.nombre,
    tipo_dato: d.tipoDato as 'numero' | 'texto' | 'booleano' | 'fecha' | 'opcion',
    unidad_id: d.unidadId ?? null,
    opciones: d.tipoDato === 'opcion' ? d.opciones.split(',').map((o) => o.trim()).filter(Boolean) : null,
    obligatorio: d.obligatorio,
  })
  modalDefinicion.value = false
}

async function eliminarDefinicion(id: string): Promise<void> {
  const tenantId = tenantStore.activeTenant?.id
  if (!tenantId || tipoSeleccionadoId.value == null) return
  await configStore.eliminarDefinicion(tenantId, tipoSeleccionadoId.value, id)
}

const modalHuerfanos = ref(false)
async function verHuerfanos(): Promise<void> {
  const tenantId = tenantStore.activeTenant?.id
  if (!tenantId) return
  await configStore.cargarHuerfanos(tenantId)
  modalHuerfanos.value = true
}

// ── Criticidad ───────────────────────────────────────────────────────
const setSeleccionadoId = ref<string | undefined>(undefined)
const setSeleccionado = computed(() => configStore.sets.find((s) => s.id === setSeleccionadoId.value) ?? null)
const sumaPesos = computed(() => configStore.criterios.reduce((acc, c) => acc + Number(c.peso), 0))

async function cargarCriticidad(): Promise<void> {
  const tenantId = tenantStore.activeTenant?.id
  if (!tenantId) return
  await configStore.cargarSets(tenantId)
  setSeleccionadoId.value ??= configStore.sets[0]?.id
}

watch(setSeleccionadoId, async (id) => { if (id) await configStore.cargarHijosDeSet(id) })
onMounted(cargarCriticidad)

async function nuevaVersion(): Promise<void> {
  const tenantId = tenantStore.activeTenant?.id
  if (!tenantId) return
  const siguiente = Math.max(0, ...configStore.sets.map((s) => s.version)) + 1
  const nuevo = await configStore.crearSet(tenantId, siguiente)
  setSeleccionadoId.value = nuevo.id
}

async function retirarActual(): Promise<void> {
  const tenantId = tenantStore.activeTenant?.id
  const vigente = configStore.sets.find((s) => s.estado === 'vigente')
  if (!tenantId || !vigente) return
  await configStore.retirarSet(tenantId, vigente.id)
}

async function activarSeleccionado(): Promise<void> {
  const tenantId = tenantStore.activeTenant?.id
  if (!tenantId || !setSeleccionadoId.value) return
  await configStore.activarSet(tenantId, setSeleccionadoId.value)
}

const modalCriterio = ref(false)
const criterioEditando = ref<{ id?: string; codigo: string; nombre: string; peso: number; escalaTexto: string } | null>(null)
const errorEscala = ref<string | null>(null)

function nuevoCriterio(): void {
  criterioEditando.value = { codigo: '', nombre: '', peso: 0, escalaTexto: '{\n  "bajo": 0,\n  "alto": 100\n}' }
  errorEscala.value = null
  modalCriterio.value = true
}

function editarCriterio(id: string): void {
  const c = configStore.criterios.find((x) => x.id === id)
  if (!c) return
  criterioEditando.value = { id: c.id, codigo: c.codigo, nombre: c.nombre, peso: Number(c.peso), escalaTexto: JSON.stringify(c.escala, null, 2) }
  errorEscala.value = null
  modalCriterio.value = true
}

async function guardarCriterio(): Promise<void> {
  const tenantId = tenantStore.activeTenant?.id
  const c = criterioEditando.value
  if (!tenantId || !c || !setSeleccionadoId.value) return
  let escala: Record<string, number>
  try {
    escala = JSON.parse(c.escalaTexto) as Record<string, number>
  } catch {
    errorEscala.value = 'La escala debe ser un objeto JSON válido, p. ej. {"bajo": 0, "alto": 100}'
    return
  }
  await configStore.guardarCriterio({
    id: c.id, tenant_id: tenantId, set_id: setSeleccionadoId.value,
    codigo: c.codigo, nombre: c.nombre, peso: c.peso, escala,
  })
  modalCriterio.value = false
}

async function eliminarCriterio(id: string): Promise<void> {
  if (!setSeleccionadoId.value) return
  await configStore.eliminarCriterio(setSeleccionadoId.value, id)
}

const modalBanda = ref(false)
const bandaEditando = ref<{ id?: string; etiqueta: string; puntajeDesde: number; puntajeHasta: number | undefined; orden: number } | null>(null)

function nuevaBanda(): void {
  bandaEditando.value = { etiqueta: '', puntajeDesde: 0, puntajeHasta: undefined, orden: (configStore.bandas.length + 1) * 10 }
  modalBanda.value = true
}

function editarBanda(id: string): void {
  const b = configStore.bandas.find((x) => x.id === id)
  if (!b) return
  bandaEditando.value = { id: b.id, etiqueta: b.etiqueta, puntajeDesde: Number(b.puntaje_desde), puntajeHasta: b.puntaje_hasta == null ? undefined : Number(b.puntaje_hasta), orden: b.orden }
  modalBanda.value = true
}

async function guardarBanda(): Promise<void> {
  const tenantId = tenantStore.activeTenant?.id
  const b = bandaEditando.value
  if (!tenantId || !b || !setSeleccionadoId.value) return
  await configStore.guardarBanda({
    id: b.id, tenant_id: tenantId, set_id: setSeleccionadoId.value,
    etiqueta: b.etiqueta, puntaje_desde: b.puntajeDesde, puntaje_hasta: b.puntajeHasta ?? null, orden: b.orden,
  })
  modalBanda.value = false
}

async function eliminarBanda(id: string): Promise<void> {
  if (!setSeleccionadoId.value) return
  await configStore.eliminarBanda(setSeleccionadoId.value, id)
}

// ── MANT-2: requisitos de cumplimiento normativo ────────────────────────
// Un solo drawer para editar cualquier requisito, predefinido o propio (§ Plan del corte:
// "la pantalla de edición es la misma para todos"). frecuencia_meses vive siempre en meses en
// la base de datos; la unidad (meses/años) es pura conveniencia del formulario.
type FrecuenciaUnidad = 'meses' | 'anios'
const FREQ_UNIDADES = [{ label: 'Meses', value: 'meses' }, { label: 'Años', value: 'anios' }]

const drawerRequisitoAbierto = ref(false)
const requisitoEditando = ref<{
  id?: string; tipoFundamento: string; nombre: string; normaReferencia: string; fuenteUrl: string
  frecuenciaValor: number | undefined; frecuenciaUnidad: FrecuenciaUnidad
  detalle: string; requiereTercero: boolean
} | null>(null)
const errorGuardarRequisito = ref<string | null>(null)

async function cargarRequisitos(): Promise<void> {
  const tenantId = tenantStore.activeTenant?.id
  if (!tenantId) return
  await configStore.cargarRequisitos(tenantId)
}
onMounted(cargarRequisitos)

function frecuenciaTexto(mesesTotal: number | null): string {
  if (mesesTotal == null) return 'no periódico'
  if (mesesTotal % 12 === 0 && mesesTotal >= 12) return `cada ${mesesTotal / 12} año(s)`
  return `cada ${mesesTotal} mes(es)`
}

function abrirNuevoRequisito(): void {
  requisitoEditando.value = {
    tipoFundamento: 'interno', nombre: '', normaReferencia: '', fuenteUrl: '',
    frecuenciaValor: undefined, frecuenciaUnidad: 'meses', detalle: '', requiereTercero: false,
  }
  errorGuardarRequisito.value = null
  drawerRequisitoAbierto.value = true
}

function editarRequisito(id: string): void {
  const r = configStore.requisitos.find((x) => x.id === id)
  if (!r) return
  const meses = r.frecuencia_meses
  const unidad: FrecuenciaUnidad = meses != null && meses >= 12 && meses % 12 === 0 ? 'anios' : 'meses'
  requisitoEditando.value = {
    id: r.id, tipoFundamento: r.tipo_fundamento, nombre: r.nombre,
    normaReferencia: r.norma_referencia ?? '', fuenteUrl: r.fuente_url ?? '',
    frecuenciaValor: meses == null ? undefined : (unidad === 'anios' ? meses / 12 : meses),
    frecuenciaUnidad: unidad, detalle: r.detalle ?? '', requiereTercero: r.requiere_tercero_acreditado,
  }
  errorGuardarRequisito.value = null
  drawerRequisitoAbierto.value = true
}

async function guardarRequisitoDrawer(): Promise<void> {
  const tenantId = tenantStore.activeTenant?.id
  const r = requisitoEditando.value
  if (!tenantId || !r) return
  errorGuardarRequisito.value = null
  try {
    await configStore.guardarRequisito({
      id: r.id,
      tenant_id: tenantId,
      nombre: r.nombre,
      tipo_fundamento: r.tipoFundamento as Database['public']['Enums']['requisito_tipo_t'],
      norma_referencia: r.normaReferencia.trim() || null,
      fuente_url: r.fuenteUrl.trim() || null,
      frecuencia_meses: r.frecuenciaValor ? (r.frecuenciaUnidad === 'anios' ? r.frecuenciaValor * 12 : r.frecuenciaValor) : null,
      detalle: r.detalle.trim() || null,
      requiere_tercero_acreditado: r.requiereTercero,
    })
    drawerRequisitoAbierto.value = false
  } catch (e) {
    errorGuardarRequisito.value = e instanceof Error ? e.message : 'No se pudo guardar'
  }
}

async function quitarRequisitoDrawer(): Promise<void> {
  const tenantId = tenantStore.activeTenant?.id
  const r = requisitoEditando.value
  if (!tenantId || !r?.id) return
  await configStore.quitarRequisito(tenantId, r.id)
  drawerRequisitoAbierto.value = false
}

const pestanaActiva = ref<'atributos' | 'criticidad' | 'cumplimiento'>('atributos')
const PESTANAS = [
  { label: 'Atributos por tipo de activo', value: 'atributos' as const },
  { label: 'Criterios de criticidad', value: 'criticidad' as const },
  { label: 'Cumplimiento normativo', value: 'cumplimiento' as const },
]
</script>

<template>
  <div class="space-y-8">
    <UiTituloDescripcion clase-descripcion="text-sm text-muted mt-1 max-w-2xl">
      <template #titulo>
        <h1 class="text-xl font-semibold">Configuración de mantenimiento</h1>
      </template>
      <template #descripcion>
        Esquema de atributos técnicos por tipo de activo y criterios de criticidad (MANT-1). Sin
        ningún valor sembrado por defecto — cada copropiedad define los suyos.
      </template>
    </UiTituloDescripcion>

    <UTabs
      :items="PESTANAS" :model-value="pestanaActiva" variant="link" :content="false" class="w-full"
      @update:model-value="(v) => (pestanaActiva = v as typeof pestanaActiva)"
    />

    <!-- Atributos por tipo de activo -->
    <section v-if="pestanaActiva === 'atributos'" class="space-y-4 rounded-lg border border-default p-4">
      <div class="flex items-center justify-end flex-wrap gap-2">
        <div class="flex items-center gap-2">
          <UButton variant="ghost" size="sm" @click="verHuerfanos()">Ver atributos huérfanos</UButton>
          <UButton size="sm" icon="i-lucide-plus" :disabled="tipoSeleccionadoId == null" @click="nuevaDefinicion()">
            Nuevo atributo
          </UButton>
        </div>
      </div>

      <UFormField label="Tipo de activo" name="tipo">
        <USelect
          v-model="tipoSeleccionadoId"
          :items="tipos.map((t) => ({ label: t.nombre, value: t.id }))"
          class="w-64"
        />
      </UFormField>

      <div class="rounded-lg border border-default divide-y divide-default">
        <div v-for="d in configStore.definiciones" :key="d.id" class="flex items-center justify-between gap-4 p-3">
          <div>
            <p class="text-sm font-medium">
              {{ d.nombre }} <span class="text-muted">({{ d.codigo }})</span>
              <UBadge v-if="d.obligatorio" color="warning" variant="soft" size="sm" class="ml-2">obligatorio</UBadge>
            </p>
            <p class="text-xs text-muted capitalize">{{ d.tipo_dato }}</p>
          </div>
          <div class="flex items-center gap-2">
            <UButton variant="ghost" size="sm" @click="editarDefinicion(d.id)">Editar</UButton>
            <UButton variant="ghost" color="error" size="sm" @click="eliminarDefinicion(d.id)">Eliminar</UButton>
          </div>
        </div>
        <p v-if="configStore.definiciones.length === 0" class="p-4 text-sm text-muted text-center">
          Sin atributos definidos para este tipo.
        </p>
      </div>
    </section>

    <!-- Criticidad -->
    <section v-else-if="pestanaActiva === 'criticidad'" class="space-y-4 rounded-lg border border-default p-4">
      <div class="flex items-center justify-end flex-wrap gap-2">
        <UButton size="sm" icon="i-lucide-plus" @click="nuevaVersion()">Nueva versión</UButton>
      </div>

      <div class="flex items-center gap-2 flex-wrap">
        <USelect
          v-model="setSeleccionadoId"
          :items="configStore.sets.map((s) => ({ label: `Versión ${s.version} (${s.estado})`, value: s.id }))"
          class="w-64"
        />
        <UButton
          v-if="setSeleccionado?.estado === 'borrador'" size="sm" color="primary"
          :disabled="sumaPesos !== 100" @click="activarSeleccionado()"
        >
          Activar (suma de pesos: {{ sumaPesos }})
        </UButton>
        <UButton
          v-if="setSeleccionado?.estado === 'vigente'" size="sm" variant="soft" color="warning"
          @click="retirarActual()"
        >
          Retirar a histórica
        </UButton>
      </div>

      <template v-if="setSeleccionado">
        <div class="flex items-center justify-between">
          <h3 class="text-sm font-medium">Criterios</h3>
          <UButton
            v-if="setSeleccionado.estado === 'borrador'" variant="ghost" size="sm" icon="i-lucide-plus"
            @click="nuevoCriterio()"
          >
            Nuevo criterio
          </UButton>
        </div>
        <div class="rounded-lg border border-default divide-y divide-default">
          <div v-for="c in configStore.criterios" :key="c.id" class="flex items-center justify-between gap-4 p-3">
            <div>
              <p class="text-sm font-medium">{{ c.nombre }} <span class="text-muted">peso {{ c.peso }}</span></p>
              <p class="text-xs text-muted">{{ JSON.stringify(c.escala) }}</p>
            </div>
            <div v-if="setSeleccionado.estado === 'borrador'" class="flex items-center gap-2">
              <UButton variant="ghost" size="sm" @click="editarCriterio(c.id)">Editar</UButton>
              <UButton variant="ghost" color="error" size="sm" @click="eliminarCriterio(c.id)">Eliminar</UButton>
            </div>
          </div>
          <p v-if="configStore.criterios.length === 0" class="p-4 text-sm text-muted text-center">Sin criterios.</p>
        </div>

        <div class="flex items-center justify-between">
          <h3 class="text-sm font-medium">Bandas</h3>
          <UButton
            v-if="setSeleccionado.estado === 'borrador'" variant="ghost" size="sm" icon="i-lucide-plus"
            @click="nuevaBanda()"
          >
            Nueva banda
          </UButton>
        </div>
        <div class="rounded-lg border border-default divide-y divide-default">
          <div v-for="b in configStore.bandas" :key="b.id" class="flex items-center justify-between gap-4 p-3">
            <p class="text-sm">{{ b.etiqueta }}: [{{ b.puntaje_desde }}, {{ b.puntaje_hasta ?? '∞' }}]</p>
            <div v-if="setSeleccionado.estado === 'borrador'" class="flex items-center gap-2">
              <UButton variant="ghost" size="sm" @click="editarBanda(b.id)">Editar</UButton>
              <UButton variant="ghost" color="error" size="sm" @click="eliminarBanda(b.id)">Eliminar</UButton>
            </div>
          </div>
          <p v-if="configStore.bandas.length === 0" class="p-4 text-sm text-muted text-center">Sin bandas.</p>
        </div>
      </template>
    </section>

    <!-- Cumplimiento normativo (MANT-2) -->
    <section v-else class="space-y-4 rounded-lg border border-default p-4">
      <div class="flex items-center justify-between flex-wrap gap-2">
        <p class="text-xs text-muted max-w-2xl">
          Predefinidos desde la creación de tu copropiedad, con la evidencia que verificamos —
          desde ese momento son 100% tuyos: edítalos, cámbiales la frecuencia o quítalos. Ninguno
          se aplica ni se revisa solo desde afuera.
        </p>
        <UButton size="sm" icon="i-lucide-plus" @click="abrirNuevoRequisito()">Agregar requisito propio</UButton>
      </div>

      <div class="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <div v-for="r in configStore.requisitos" :key="r.id" class="rounded-lg border border-default p-3 space-y-2">
          <div class="flex items-start justify-between gap-2">
            <p class="text-sm font-medium">{{ r.nombre }}</p>
            <UBadge
              :color="r.tipo_fundamento === 'legal_nacional' || r.tipo_fundamento === 'legal_territorial' ? 'primary' : 'neutral'"
              variant="soft" size="sm"
            >
              {{ r.tipo_fundamento === 'legal_territorial' ? 'Depende del municipio'
                : r.tipo_fundamento === 'legal_nacional' ? 'Normativo' : 'Propio' }}
            </UBadge>
          </div>
          <p v-if="r.norma_referencia" class="text-xs text-muted">
            {{ r.norma_referencia }}
            <a v-if="r.fuente_url" :href="r.fuente_url" target="_blank" rel="noopener" class="text-primary">↗</a>
          </p>
          <p v-else class="text-xs text-warning italic">Norma por definir — depende de tu municipio</p>
          <p class="text-xs">
            <span class="text-muted">Frecuencia:</span> {{ frecuenciaTexto(r.frecuencia_meses) }}
          </p>
          <div class="flex justify-end">
            <UButton variant="ghost" size="sm" @click="editarRequisito(r.id)">Editar</UButton>
          </div>
        </div>
        <p v-if="configStore.requisitos.length === 0" class="text-sm text-muted text-center col-span-full py-4">
          Sin requisitos — deberían haberse predefinido al crear la copropiedad.
        </p>
      </div>
    </section>

    <!-- Drawer: requisito de cumplimiento — la misma pantalla para predefinidos y propios -->
    <UiDrawer
      :abierto="drawerRequisitoAbierto"
      :titulo="requisitoEditando?.id ? 'Editar requisito' : 'Nuevo requisito propio'"
      @cerrar="drawerRequisitoAbierto = false"
    >
      <div v-if="requisitoEditando" class="space-y-3">
        <UAlert v-if="errorGuardarRequisito" color="error" variant="soft" :title="errorGuardarRequisito" />
        <UFormField label="Nombre del requisito" name="nombre">
          <UInput v-model="requisitoEditando.nombre" class="w-full" />
        </UFormField>
        <UFormField label="Norma, decreto o resolución (origen de esta obligación)" name="norma">
          <UInput
            v-model="requisitoEditando.normaReferencia" class="w-full"
            placeholder="ej. Decreto 554 de 2015, o el manual del fabricante"
          />
        </UFormField>
        <UFormField label="Enlace a la fuente" name="fuente">
          <UInput v-model="requisitoEditando.fuenteUrl" class="w-full" placeholder="https://..." />
        </UFormField>
        <UFormField label="Frecuencia" name="frecuencia">
          <div class="flex gap-2">
            <UInput v-model.number="requisitoEditando.frecuenciaValor" type="number" :min="1" class="w-24" />
            <USelect v-model="requisitoEditando.frecuenciaUnidad" :items="FREQ_UNIDADES" class="flex-1" />
          </div>
          <p class="text-xs text-muted mt-1">Déjala vacía si no es periódico (ej. un plan de seguridad permanente).</p>
        </UFormField>
        <UFormField label="Detalle adicional" name="detalle">
          <UInput v-model="requisitoEditando.detalle" class="w-full" placeholder="Acreditador, evidencia exigida..." />
        </UFormField>
        <UCheckbox v-model="requisitoEditando.requiereTercero" label="Requiere tercero acreditado" />
      </div>
      <template #foot>
        <div class="flex items-center justify-between w-full">
          <UButton
            v-if="requisitoEditando?.id" variant="ghost" color="error" size="sm"
            @click="quitarRequisitoDrawer()"
          >
            Quitar de mi copropiedad
          </UButton>
          <div v-else />
          <div class="flex gap-2">
            <UButton variant="ghost" @click="drawerRequisitoAbierto = false">Cancelar</UButton>
            <UButton :loading="configStore.guardando" @click="guardarRequisitoDrawer()">Guardar</UButton>
          </div>
        </div>
      </template>
    </UiDrawer>

    <!-- Modal: definición de atributo -->
    <UModal v-model:open="modalDefinicion" title="Atributo técnico">
      <template #body>
        <div v-if="definicionEditando" class="space-y-3">
          <UAlert
            v-if="avisoActivosAfectados"
            color="warning" variant="soft"
            :title="`${avisoActivosAfectados} activo(s) ya tienen este atributo cargado — el cambio no borra esos valores.`"
          />
          <UFormField label="Código" name="codigo"><UInput v-model="definicionEditando.codigo" /></UFormField>
          <UFormField label="Nombre" name="nombre"><UInput v-model="definicionEditando.nombre" /></UFormField>
          <UFormField label="Tipo de dato" name="tipoDato">
            <USelect v-model="definicionEditando.tipoDato" :items="TIPOS_DATO" class="w-full" />
          </UFormField>
          <UFormField v-if="definicionEditando.tipoDato === 'opcion'" label="Opciones (separadas por coma)" name="opciones">
            <UInput v-model="definicionEditando.opciones" />
          </UFormField>
          <UFormField label="Unidad" name="unidad">
            <USelect
              v-model="definicionEditando.unidadId"
              :items="[{ label: 'Sin unidad', value: undefined }, ...unidades.map((u) => ({ label: u.nombre, value: u.id }))]"
              class="w-full"
            />
          </UFormField>
          <UCheckbox v-model="definicionEditando.obligatorio" label="Obligatorio antes de pasar a en_servicio" />
        </div>
      </template>
      <template #footer>
        <UButton variant="ghost" @click="modalDefinicion = false">Cancelar</UButton>
        <UButton :loading="configStore.guardando" @click="guardarDefinicion()">Guardar</UButton>
      </template>
    </UModal>

    <!-- Modal: criterio -->
    <UModal v-model:open="modalCriterio" title="Criterio de criticidad">
      <template #body>
        <div v-if="criterioEditando" class="space-y-3">
          <UFormField label="Código" name="codigo"><UInput v-model="criterioEditando.codigo" /></UFormField>
          <UFormField label="Nombre" name="nombre"><UInput v-model="criterioEditando.nombre" /></UFormField>
          <UFormField label="Peso" name="peso"><UInput v-model.number="criterioEditando.peso" type="number" /></UFormField>
          <UFormField label="Escala (valor → puntaje, JSON)" name="escala">
            <UTextarea v-model="criterioEditando.escalaTexto" :rows="4" class="w-full font-mono text-xs" />
          </UFormField>
          <UAlert v-if="errorEscala" color="error" variant="soft" :title="errorEscala" />
        </div>
      </template>
      <template #footer>
        <UButton variant="ghost" @click="modalCriterio = false">Cancelar</UButton>
        <UButton :loading="configStore.guardando" @click="guardarCriterio()">Guardar</UButton>
      </template>
    </UModal>

    <!-- Modal: banda -->
    <UModal v-model:open="modalBanda" title="Banda de criticidad">
      <template #body>
        <div v-if="bandaEditando" class="space-y-3">
          <UFormField label="Etiqueta" name="etiqueta"><UInput v-model="bandaEditando.etiqueta" /></UFormField>
          <UFormField label="Puntaje desde" name="desde"><UInput v-model.number="bandaEditando.puntajeDesde" type="number" /></UFormField>
          <UFormField label="Puntaje hasta (vacío = sin tope)" name="hasta">
            <UInput v-model.number="bandaEditando.puntajeHasta" type="number" />
          </UFormField>
          <UFormField label="Orden" name="orden"><UInput v-model.number="bandaEditando.orden" type="number" /></UFormField>
        </div>
      </template>
      <template #footer>
        <UButton variant="ghost" @click="modalBanda = false">Cancelar</UButton>
        <UButton :loading="configStore.guardando" @click="guardarBanda()">Guardar</UButton>
      </template>
    </UModal>

    <!-- Modal: huérfanos -->
    <UModal v-model:open="modalHuerfanos" title="Atributos huérfanos">
      <template #body>
        <p class="text-sm text-muted mb-2">
          Valores guardados cuya clave ya no está definida para el tipo del activo — no se borran solos.
        </p>
        <ul class="text-sm space-y-1">
          <li v-for="(h, i) in configStore.huerfanos" :key="i">
            {{ h.activo_codigo }} — <span class="font-mono">{{ h.clave }}</span>: {{ JSON.stringify(h.valor) }}
          </li>
        </ul>
        <p v-if="configStore.huerfanos.length === 0" class="text-sm text-muted">Sin huérfanos.</p>
      </template>
    </UModal>
  </div>
</template>
