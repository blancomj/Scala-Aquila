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
  // El concepto tipo_recurrencia='novedad' es el singleton que NovedadesEditor exige para
  // novedades permanentes/prorrateables — guard_concepto_transicion rechaza archivarlo a nivel
  // de base de datos (CONCEPTO_NOVEDAD_PROTEGIDO); esto solo evita mostrar un botón que fallaría.
  if (concepto.tipo_recurrencia === 'novedad') return false
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
      <div class="flex items-center gap-4">
        <NuxtLink to="/conceptos/dependencias" class="text-sm text-primary hover:underline">
          Dependencias e impacto →
        </NuxtLink>
        <NuxtLink
          to="/politicas"
          class="text-sm text-primary hover:underline"
          title="Los conceptos definen qué y cuánto se cobra — las reglas de intereses y mora (cómo se imputa un pago atrasado) viven en Políticas financieras."
        >
          Reglas de intereses y mora →
        </NuxtLink>
      </div>
      <UButton size="sm" @click="nuevo">Nuevo concepto</UButton>
    </div>

    <div class="flex flex-wrap items-center gap-3">
      <div
        class="flex flex-wrap gap-0.5 p-0.5 rounded-md bg-neutral-100 dark:bg-neutral-800 text-sm"
      >
        <button
          v-for="opcion in FILTROS"
          :key="opcion.clave"
          type="button"
          class="px-3 py-1 rounded transition-colors whitespace-nowrap"
          :aria-pressed="filtro === opcion.clave"
          :class="
            filtro === opcion.clave
              ? 'bg-white dark:bg-neutral-900 shadow-sm font-medium'
              : 'text-neutral-500 hover:text-neutral-700 dark:hover:text-neutral-300'
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
        :ui="{ trailing: 'pr-8' }"
      >
        <template v-if="busqueda" #trailing>
          <button
            type="button"
            class="absolute right-1 top-1/2 -translate-y-1/2 rounded p-0.5 text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-300"
            @click="busqueda = ''"
          >
            <UIcon name="i-lucide-x" class="size-3.5" />
          </button>
        </template>
      </UInput>
    </div>

    <UAlert v-if="error" color="error" variant="soft" :title="error" />

    <div v-if="cargando && conceptoStore.conceptos.length === 0" class="space-y-2">
      <USkeleton v-for="i in 5" :key="i" class="h-10 w-full" />
    </div>
    <div v-else-if="conceptoStore.conceptos.length === 0" class="space-y-3">
      <p class="text-neutral-500 text-sm">
        Esta copropiedad todavía no tiene conceptos registrados.
      </p>
      <p class="text-xs text-neutral-400">
        Los conceptos definen <strong>qué</strong> se cobra (expensa, agua, parqueadero…),
        <strong>cómo se calcula</strong> (fórmula o monto fijo) y <strong>a quién aplica</strong>
        (todos los inmuebles o solo los que cumplan condiciones).
      </p>
      <UButton size="sm" variant="soft" @click="nuevo">Crear primer concepto</UButton>
    </div>
    <p v-else-if="conceptosFiltrados.length === 0" class="text-neutral-500 text-sm">
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
        <span :class="fila.estado === 'archivado' ? 'text-neutral-400 dark:text-neutral-600' : ''">
          {{ fila.codigo }}
        </span>
      </template>
      <template #celda-nombre="{ fila }">
        <div class="flex items-center gap-1.5">
          <UIcon
            :name="fila.alcance === 'todos' ? 'i-lucide-users' : 'i-lucide-filter'"
            class="shrink-0 size-3.5 text-neutral-400"
            :title="fila.alcance === 'todos' ? 'Aplica a todos los inmuebles' : 'Aplica solo a los inmuebles que cumplen una condición'"
          />
          <span :class="fila.estado === 'archivado' ? 'text-neutral-400 dark:text-neutral-600' : ''">
            {{ fila.nombre }}
          </span>
        </div>
      </template>
      <template #celda-calculo="{ fila }">
        <div class="leading-tight">
          <span class="text-neutral-500">{{ fila.modo_calculo }}</span>
          <p class="text-xs text-neutral-400">{{ recurrenciaTexto(fila) }}</p>
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
          <UButton
            size="xs"
            variant="soft"
            icon="i-lucide-pencil"
            aria-label="Editar"
            @click="editar(fila.id)"
          />
          <UButton
            v-if="esArchivable(fila)"
            size="xs"
            variant="ghost"
            color="error"
            icon="i-lucide-archive"
            aria-label="Archivar"
            :loading="cambiandoEstadoId === fila.id"
            @click="pedirConfirmacionArchivar(fila)"
          />
          <UIcon
            v-else-if="fila.tipo_recurrencia === 'novedad'"
            name="i-lucide-shield-check"
            class="size-4 text-neutral-400 shrink-0"
            title="Protegido: es el concepto que exige NovedadesEditor para novedades permanentes o prorrateables — no se puede archivar."
          />
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
          <p class="text-neutral-500">
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
