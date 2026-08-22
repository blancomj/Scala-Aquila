<script setup lang="ts">
// Catálogo de Conceptos — lista + editar/archivar + nuevo. Vivió como
// pestaña "Conceptos" dentro de /presupuesto (PresupuestoTabConceptos.vue);
// movida a página propia en /estado-cuenta/conceptos (ver
// pages/estado-cuenta/conceptos.vue) porque el catálogo alimenta cuenta
// corriente/novedades, no solo presupuesto. El editor de fórmulas AEL
// (texto/bloques/IR, pruebas, versiones) no cabe razonablemente aquí —
// vive en páginas propias (/conceptos/nuevo, /conceptos/[id]), ver
// ConceptosEditor.vue. El flujo completo de maker-checker (enviar a
// revisión/aprobar/rechazar/volver a borrador — AEL-004 Fase 4) también
// se movió a esas páginas, ligado al concepto que se está editando; aquí
// solo queda la acción rápida "Archivar" (disponible en borrador/activo,
// mismo criterio que conceptoEsSeleccionable() en la versión anterior de
// esta pantalla). Las acciones en lote (selección múltiple) se
// retiraron: no tenían sentido ya con la lista reducida a
// editar/archivar/nuevo.
//
// Rediseño: filtro "En uso / Archivados / Todos" + búsqueda por
// código/nombre (mismo problema de fondo que 300 inmuebles/coeficientes —
// el catálogo crece con el tiempo y los archivados no deberían dominar la
// vista por defecto). Estado como UBadge de color (antes texto plano,
// inconsistente con la columna Valor que ya usaba badge). Confirmación
// antes de archivar (mismo patrón que activar presupuesto): archivar es
// una transición terminal — guard_concepto_transicion no admite ningún
// estado de salida desde 'archivado'.
import {
  COLOR_ESTADO_CONCEPTO,
  ETIQUETA_ESTADO_CONCEPTO,
  DESCRIPCION_ESTADO_CONCEPTO,
  ETIQUETA_TIPO_RECURRENCIA,
  ETIQUETA_PERIODICIDAD,
} from '~/utils/concepto-labels'

const tenantStore = useTenantStore()
const conceptoStore = useConceptoStore()

const cargando = ref(false)
const cambiandoEstadoId = ref<string | null>(null)
const error = ref<string | null>(null)

onMounted(async () => {
  const tenantId = tenantStore.activeTenant?.id
  if (!tenantId) return
  cargando.value = true
  try {
    await conceptoStore.cargarConceptos(tenantId)
  } finally {
    cargando.value = false
  }
})

type Concepto = (typeof conceptoStore.conceptos)[number]

const FILTROS = [
  { clave: 'en_uso', etiqueta: 'En uso' },
  { clave: 'archivados', etiqueta: 'Archivados' },
  { clave: 'todos', etiqueta: 'Todos' },
] as const
type ClaveFiltro = (typeof FILTROS)[number]['clave']

const filtro = ref<ClaveFiltro>('en_uso')
const busqueda = ref('')

const conteoPorFiltro = computed<Record<ClaveFiltro, number>>(() => ({
  en_uso: conceptoStore.conceptos.filter((c) => c.estado !== 'archivado').length,
  archivados: conceptoStore.conceptos.filter((c) => c.estado === 'archivado').length,
  todos: conceptoStore.conceptos.length,
}))

const conceptosFiltrados = computed<Concepto[]>(() => {
  const porEstado = conceptoStore.conceptos.filter((c) => {
    if (filtro.value === 'en_uso') return c.estado !== 'archivado'
    if (filtro.value === 'archivados') return c.estado === 'archivado'
    return true
  })
  const texto = busqueda.value.trim().toLowerCase()
  if (!texto) return porEstado
  return porEstado.filter(
    (c) => c.codigo.toLowerCase().includes(texto) || c.nombre.toLowerCase().includes(texto),
  )
})

function recurrenciaTexto(concepto: Concepto): string {
  const base = ETIQUETA_TIPO_RECURRENCIA[concepto.tipo_recurrencia] ?? concepto.tipo_recurrencia
  const periodicidad = concepto.periodicidad ? ETIQUETA_PERIODICIDAD[concepto.periodicidad] : null
  return periodicidad ? `${base} · ${periodicidad}` : base
}

function editar(id: string): void {
  navigateTo(`/conceptos/${id}`)
}

function nuevo(): void {
  navigateTo('/conceptos/nuevo')
}

function esArchivable(concepto: Concepto): boolean {
  return concepto.estado === 'borrador' || concepto.estado === 'activo' || concepto.estado === 'en_revision'
}

const conceptoAArchivar = ref<Concepto | null>(null)

function pedirConfirmacionArchivar(concepto: Concepto): void {
  conceptoAArchivar.value = concepto
}

async function confirmarArchivar(): Promise<void> {
  const concepto = conceptoAArchivar.value
  if (!concepto) return
  conceptoAArchivar.value = null

  error.value = null
  const tenantId = tenantStore.activeTenant?.id
  if (!tenantId) return

  cambiandoEstadoId.value = concepto.id
  try {
    await conceptoStore.cambiarEstado(concepto.id, 'archivado', tenantId)
  } catch (excepcion) {
    error.value = mensajeError(excepcion, 'No se pudo archivar.')
  } finally {
    cambiandoEstadoId.value = null
  }
}
</script>

<template>
  <div class="space-y-4">
    <div class="flex items-center justify-between">
      <NuxtLink to="/conceptos/dependencias" class="text-sm text-primary hover:underline">
        Dependencias e impacto →
      </NuxtLink>
      <UButton size="sm" @click="nuevo">Nuevo concepto</UButton>
    </div>

    <div class="flex flex-wrap items-center justify-between gap-3">
      <div class="grid grid-flow-col auto-cols-fr gap-0.5 p-0.5 rounded-md bg-gray-100 dark:bg-gray-800 text-sm">
        <button
          v-for="opcion in FILTROS"
          :key="opcion.clave"
          type="button"
          class="px-3 py-1 rounded transition-colors"
          :aria-pressed="filtro === opcion.clave"
          :class="
            filtro === opcion.clave
              ? 'bg-white dark:bg-gray-900 shadow-sm font-medium'
              : 'text-gray-500 hover:text-gray-700 dark:hover:text-gray-300'
          "
          @click="filtro = opcion.clave"
        >
          {{ opcion.etiqueta }} ({{ conteoPorFiltro[opcion.clave] }})
        </button>
      </div>

      <UInput
        v-model="busqueda"
        icon="i-lucide-search"
        placeholder="Buscar por código o nombre…"
        size="sm"
        class="w-64"
      />
    </div>

    <UAlert v-if="error" color="error" variant="soft" :title="error" />

    <p v-if="cargando && conceptoStore.conceptos.length === 0" class="text-gray-500 text-sm">
      Cargando…
    </p>
    <p v-else-if="conceptoStore.conceptos.length === 0" class="text-gray-500 text-sm">
      Esta copropiedad todavía no tiene conceptos registrados.
    </p>
    <p v-else-if="conceptosFiltrados.length === 0" class="text-gray-500 text-sm">
      Ningún concepto coincide con este filtro.
    </p>
    <UiTabla
      v-else
      :columnas="[
        { clave: 'codigo', etiqueta: 'Código' },
        { clave: 'nombre', etiqueta: 'Nombre' },
        { clave: 'calculo', etiqueta: 'Cómo se calcula' },
        { clave: 'valor', etiqueta: 'Valor' },
        { clave: 'estado', etiqueta: 'Estado' },
        { clave: 'acciones', etiqueta: '' },
      ]"
      :filas="conceptosFiltrados"
      :clave-fila="(concepto) => concepto.id"
    >
      <template #celda-codigo="{ fila }">
        <span :class="fila.estado === 'archivado' ? 'text-gray-400 dark:text-gray-600' : ''">
          {{ fila.codigo }}
        </span>
      </template>
      <template #celda-nombre="{ fila }">
        <div class="flex items-center gap-1.5">
          <UIcon
            :name="fila.alcance === 'todos' ? 'i-lucide-users' : 'i-lucide-filter'"
            class="shrink-0 size-3.5 text-gray-400"
            :title="fila.alcance === 'todos' ? 'Aplica a todos los inmuebles' : 'Aplica solo a los inmuebles que cumplen una condición'"
          />
          <span :class="fila.estado === 'archivado' ? 'text-gray-400 dark:text-gray-600' : ''">
            {{ fila.nombre }}
          </span>
        </div>
      </template>
      <template #celda-calculo="{ fila }">
        <div class="leading-tight">
          <span class="text-gray-500">{{ fila.modo_calculo }}</span>
          <p class="text-xs text-gray-400">{{ recurrenciaTexto(fila) }}</p>
        </div>
      </template>
      <template #celda-valor="{ fila }">
        <UBadge :color="fila.modo_valor === 'fijo' ? 'warning' : 'neutral'" variant="subtle">
          {{ fila.modo_valor === 'fijo' ? 'Fijo' : 'Formulado' }}
        </UBadge>
      </template>
      <template #celda-estado="{ fila }">
        <UBadge
          :color="COLOR_ESTADO_CONCEPTO[fila.estado] ?? 'neutral'"
          variant="subtle"
          :title="DESCRIPCION_ESTADO_CONCEPTO[fila.estado] ?? ''"
        >
          {{ ETIQUETA_ESTADO_CONCEPTO[fila.estado] ?? fila.estado }}
        </UBadge>
      </template>
      <template #celda-acciones="{ fila }">
        <div class="flex justify-end gap-2">
          <UButton size="xs" variant="soft" @click="editar(fila.id)">Editar</UButton>
          <UButton
            v-if="esArchivable(fila)"
            size="xs"
            variant="ghost"
            color="error"
            :loading="cambiandoEstadoId === fila.id"
            @click="pedirConfirmacionArchivar(fila)"
          >
            Archivar
          </UButton>
        </div>
      </template>
    </UiTabla>

    <UModal
      :open="conceptoAArchivar !== null"
      title="¿Archivar este concepto?"
      @update:open="(abierto) => { if (!abierto) conceptoAArchivar = null }"
    >
      <template #body>
        <div v-if="conceptoAArchivar" class="space-y-2 text-sm">
          <p>
            Vas a archivar <strong>{{ conceptoAArchivar.codigo }} — {{ conceptoAArchivar.nombre }}</strong>.
          </p>
          <p class="text-gray-500">
            <template v-if="conceptoAArchivar.estado === 'activo'">
              Deja de generar cargos nuevos desde el próximo periodo; los cargos y liquidaciones
              ya generados no se modifican.
            </template>
            <template v-else>
              Todavía no genera cargos, así que archivarlo no afecta cuenta corriente ni
              liquidaciones existentes.
            </template>
            Es una transición terminal — una vez archivado no hay forma de reactivarlo desde aquí;
            si necesitas el mismo cobro más adelante, crea un concepto nuevo.
          </p>
        </div>
      </template>
      <template #footer>
        <div class="flex justify-end gap-2">
          <UButton variant="ghost" @click="conceptoAArchivar = null">Cancelar</UButton>
          <UButton
            color="error"
            :loading="cambiandoEstadoId === conceptoAArchivar?.id"
            @click="confirmarArchivar"
          >
            Archivar
          </UButton>
        </div>
      </template>
    </UModal>
  </div>
</template>
