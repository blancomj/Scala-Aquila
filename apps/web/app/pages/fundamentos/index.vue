<script setup lang="ts">
// Fundamentos normativos — listado principal con drawer de detalle/edición.
// D-29: platform admin escribe globales; tenant solo ve + propone.
// D-30: propuestas vía fundamento_propuesta.
//
// Reconstruida para seguir los mismos componentes que el resto de la app (UiTabla, USelect,
// UBadge, UiDrawer vía components/fundamentos/FundamentosDrawer.vue) — antes tenía su propio
// sistema de estilos
// (var(--c-*), <table>/<select> a mano, iconos i-heroicons-*) que no se usaba en ningún otro
// lugar del proyecto, y un UDrawer suelto sin botón de cierre visible en modo solo lectura.
// /fundamentos/[id].vue (duplicado exacto del formulario, sin ningún enlace hacia él) se borró.
import {
  COLOR_ESTADO_PROPUESTA,
  COLOR_TIPO_FUNDAMENTO,
  ETIQUETA_ESTADO_PROPUESTA,
  ETIQUETA_TIPO_FUNDAMENTO,
  TIPO_FUNDAMENTO,
  TIPO_FUNDAMENTO_ITEMS,
} from '~/utils/fundamento-labels'
import type { FundamentoConTenant } from '~/stores/fundamentoNormativo'

definePageMeta({ layout: 'default', middleware: ['tenant', 'rbac'], permiso: 'data:create' })

const authStore = useAuthStore()
const fundamentoStore = useFundamentoNormativoStore()
const toast = useToast()

const esPlataforma = computed(() => authStore.isPlatformAdmin)

// ── Descripciones expandidas (click para toggle) ──
const descripcionesExpandidas = reactive(new Set<number>())
function toggleDescripcion(id: number): void {
  if (descripcionesExpandidas.has(id)) {
    descripcionesExpandidas.delete(id)
  } else {
    descripcionesExpandidas.add(id)
  }
}

// ── Drawer de detalle/edición ──
const fundamentoSeleccionadoId = ref<number | null>(null)

function alEditarFundamento(): void {
  fundamentoSeleccionadoId.value = null
  toast.add({ title: 'Fundamento actualizado.', color: 'success' })
}

// ── Propuesta de cambio (modal inline) ──
const propuestaAbierta = ref(false)
const propuestaOriginal = ref<{ id: number; norma: string; tipo: string; articulo: string | null; descripcion: string | null; referencia: string | null; fuente_url: string | null } | null>(null)
const propTipo = ref<string>('ley')
const propNorma = ref('')
const propArticulo = ref('')
const propDescripcion = ref('')
const propReferencia = ref('')
const propFuenteUrl = ref('')
const propEnviando = ref(false)

// ── Rechazo (modal inline) ──
const propuestaRechazoId = ref<number | null>(null)
const propuestaRechazoMotivo = ref('')

// USelect no acepta '' como value de un item (lo reserva para "sin selección" / placeholder) —
// se usa el sentinel 'todos' y se traduce a '' al leer/escribir el filtro del store.
const SENTINEL_TODOS = 'todos'
const filtroTipoItems = [{ value: SENTINEL_TODOS, label: 'Todos' }, ...TIPO_FUNDAMENTO]
const filtroEstadoItems = [
  { value: SENTINEL_TODOS, label: 'Todos' },
  { value: 'activo', label: 'Activo' },
  { value: 'propuesto', label: 'Propuesto' },
  { value: 'rechazado', label: 'Rechazado' },
]
const filtroTipoModelo = computed({
  get: () => fundamentoStore.filtroTipo || SENTINEL_TODOS,
  set: (v: string) => { fundamentoStore.filtroTipo = (v === SENTINEL_TODOS ? '' : v) as never },
})
const filtroEstadoModelo = computed({
  get: () => fundamentoStore.filtroEstado || SENTINEL_TODOS,
  set: (v: string) => { fundamentoStore.filtroEstado = v === SENTINEL_TODOS ? '' : v },
})

const columnasCatalogo = [
  { clave: 'tipo', etiqueta: 'Tipo', ordenar: (f: FundamentoConTenant) => f.tipo },
  { clave: 'norma', etiqueta: 'Norma', ordenar: (f: FundamentoConTenant) => f.norma },
  { clave: 'articulo', etiqueta: 'Artículo' },
  { clave: 'descripcion', etiqueta: 'Descripción' },
  { clave: 'fuente', etiqueta: 'Fuente' },
  { clave: 'accion', etiqueta: '' },
]

const columnasPropuestas = [
  { clave: 'norma', etiqueta: 'Norma propuesta' },
  { clave: 'articulo', etiqueta: 'Artículo' },
  { clave: 'estado', etiqueta: 'Estado' },
  { clave: 'fecha', etiqueta: 'Fecha' },
  { clave: 'acciones', etiqueta: '' },
]

// El handler debe devolver un valor (NUXT_E3006): sin eso, useAsyncData no tiene payload que
// serializar para la hidratación y el cliente vuelve a ejecutar el handler al montar — mientras
// esa segunda carga está en vuelo, fundamentoStore.loading pasa a true en el cliente aunque el
// servidor ya lo había dejado en false, y el v-if/v-else de abajo (skeleton vs. contenido)
// renderiza distinto en cada lado — exactamente el "Hydration node mismatch" que se veía en la
// consola justo después del div de filtros.
await useAsyncData('fundamentos-normativos', async () => {
  const fundamentos = await fundamentoStore.cargarFundamentos()
  if (esPlataforma.value) {
    await fundamentoStore.cargarPropuestas()
  }
  return fundamentos
})

function abrirPropuesta(fundamento: { id: number; norma: string; tipo: string; articulo: string | null; descripcion: string | null; referencia: string | null; fuente_url: string | null }): void {
  propuestaOriginal.value = fundamento
  propTipo.value = fundamento.tipo
  propNorma.value = fundamento.norma
  propArticulo.value = fundamento.articulo ?? ''
  propDescripcion.value = fundamento.descripcion ?? ''
  propReferencia.value = fundamento.referencia ?? ''
  propFuenteUrl.value = fundamento.fuente_url ?? ''
  propuestaAbierta.value = true
}

function cerrarPropuesta(): void {
  propuestaAbierta.value = false
  propuestaOriginal.value = null
}

async function enviarPropuesta(): Promise<void> {
  const tenantId = useTenantStore().activeTenant?.id
  if (!tenantId || !propuestaOriginal.value || !propNorma.value) return
  propEnviando.value = true
  try {
    await fundamentoStore.crearPropuesta({
      fundamentoOriginalId: propuestaOriginal.value.id,
      tenantId,
      tipo: propTipo.value as never,
      norma: propNorma.value,
      articulo: propArticulo.value || undefined,
      descripcion: propDescripcion.value || undefined,
      referencia: propReferencia.value || undefined,
      fuenteUrl: propFuenteUrl.value || undefined,
    })
    cerrarPropuesta()
    toast.add({ title: 'Propuesta enviada. Esperando revisión del administrador.', color: 'success' })
  } catch (excepcion) {
    toast.add({ title: 'Error al enviar propuesta.', description: mensajeError(excepcion, 'No se pudo enviar la propuesta.'), color: 'error' })
  } finally {
    propEnviando.value = false
  }
}

async function aprobar(propuestaId: number): Promise<void> {
  try {
    await fundamentoStore.aprobarPropuesta(propuestaId)
    toast.add({ title: 'Propuesta aprobada y agregada al catálogo.', color: 'success' })
  } catch (excepcion) {
    toast.add({ title: 'Error al aprobar.', description: mensajeError(excepcion, 'No se pudo aprobar la propuesta.'), color: 'error' })
  }
}

function abrirRechazo(propuestaId: number): void {
  propuestaRechazoId.value = propuestaId
  propuestaRechazoMotivo.value = ''
}

async function confirmarRechazo(): Promise<void> {
  if (!propuestaRechazoId.value || !propuestaRechazoMotivo.value) return
  try {
    await fundamentoStore.rechazarPropuesta(propuestaRechazoId.value, propuestaRechazoMotivo.value)
    propuestaRechazoId.value = null
    toast.add({ title: 'Propuesta rechazada.', color: 'warning' })
  } catch (excepcion) {
    toast.add({ title: 'Error al rechazar.', description: mensajeError(excepcion, 'No se pudo rechazar la propuesta.'), color: 'error' })
  }
}
</script>

<template>
  <div class="space-y-6">
    <!-- Encabezado -->
    <div>
      <h1 class="text-xl font-semibold mb-1">Fundamentos normativos</h1>
      <p class="text-sm text-neutral-500 dark:text-neutral-400">
        Referencias legales reutilizables asociables a reglas del sistema.
      </p>
    </div>

    <!-- Búsqueda, filtros y acción -->
    <div class="flex flex-wrap gap-3 items-end">
      <UFormField label="Buscar" name="busqueda" class="flex-1 min-w-[160px]">
        <UInput
          v-model="fundamentoStore.busqueda"
          placeholder="Norma, artículo, descripción..."
          icon="i-lucide-search"
          class="w-full"
        >
          <template v-if="fundamentoStore.busqueda" #trailing>
            <UButton
              size="xs"
              variant="ghost"
              icon="i-lucide-x"
              aria-label="Limpiar búsqueda"
              title="Limpiar búsqueda"
              @click="fundamentoStore.busqueda = ''"
            />
          </template>
        </UInput>
      </UFormField>
      <UFormField label="Tipo" name="filtroTipo">
        <USelect v-model="filtroTipoModelo" :items="filtroTipoItems" value-key="value" class="w-48" />
      </UFormField>
      <UFormField v-if="esPlataforma" label="Estado" name="filtroEstado">
        <USelect v-model="filtroEstadoModelo" :items="filtroEstadoItems" value-key="value" class="w-40" />
      </UFormField>
      <UButton to="/fundamentos/nuevo" class="shrink-0">Nuevo fundamento</UButton>
    </div>

    <div v-if="fundamentoStore.loading" class="space-y-2">
      <USkeleton v-for="i in 6" :key="i" class="h-10 w-full" />
    </div>

    <template v-else>
      <section>
        <div class="flex items-center gap-2 mb-3">
          <h2 class="text-lg font-semibold">Fundamentos</h2>
          <UBadge color="neutral" variant="subtle">{{ fundamentoStore.fundamentosFiltrados.length }}</UBadge>
        </div>
        <UiTabla
          :columnas="columnasCatalogo"
          :filas="fundamentoStore.fundamentosFiltrados"
          :clave-fila="(f) => f.id"
          :vacio="fundamentoStore.busqueda || fundamentoStore.filtroTipo ? 'Sin resultados.' : 'Ningún fundamento registrado.'"
        >
          <template #celda-tipo="{ fila }">
            <UBadge :color="COLOR_TIPO_FUNDAMENTO[fila.tipo] ?? 'neutral'" variant="subtle">
              {{ ETIQUETA_TIPO_FUNDAMENTO[fila.tipo] ?? fila.tipo }}
            </UBadge>
          </template>
          <template #celda-norma="{ fila }">
            <span class="font-medium cursor-pointer hover:underline" @click="fundamentoSeleccionadoId = fila.id">
              {{ fila.norma }}
            </span>
          </template>
          <template #celda-articulo="{ fila }">
            <span class="text-neutral-500 dark:text-neutral-400">{{ fila.articulo ?? '—' }}</span>
          </template>
          <template #celda-descripcion="{ fila }">
            <div
              class="max-w-xs cursor-pointer hover:underline text-neutral-800 dark:text-neutral-200"
              @click="toggleDescripcion(fila.id)"
            >
              <span v-if="!descripcionesExpandidas.has(fila.id)" class="truncate block">{{ fila.descripcion ?? '—' }}</span>
              <span v-else class="whitespace-pre-wrap">{{ fila.descripcion ?? '—' }}</span>
            </div>
          </template>
          <template #celda-fuente="{ fila }">
            <UTooltip v-if="fila.fuente_url" :text="fila.fuente_url">
              <UButton size="xs" variant="ghost" icon="i-lucide-link" aria-label="Abrir fuente externa" :to="fila.fuente_url" target="_blank" rel="noopener noreferrer" />
            </UTooltip>
            <span v-else class="text-neutral-500 dark:text-neutral-400">—</span>
          </template>
          <template #celda-accion="{ fila }">
            <UTooltip v-if="!fila._es_plataforma" text="Ver detalle / Editar">
              <UButton size="xs" variant="ghost" icon="i-lucide-pencil" aria-label="Ver detalle / Editar" @click="fundamentoSeleccionadoId = fila.id" />
            </UTooltip>
            <UTooltip v-else-if="!esPlataforma" text="Proponer cambio a este fundamento">
              <UButton size="xs" variant="ghost" icon="i-lucide-pencil" aria-label="Proponer cambio" @click="abrirPropuesta(fila)" />
            </UTooltip>
          </template>
        </UiTabla>
      </section>

      <!-- Propuestas pendientes (solo platform admin) -->
      <section v-if="esPlataforma && fundamentoStore.propuestas.length > 0">
        <h2 class="text-lg font-semibold mb-3">Propuestas pendientes</h2>
        <UiTabla :columnas="columnasPropuestas" :filas="fundamentoStore.propuestas" :clave-fila="(p) => p.id">
          <template #celda-norma="{ fila }">
            <span class="font-medium">{{ fila.norma }}</span>
          </template>
          <template #celda-articulo="{ fila }">
            <span class="text-neutral-500 dark:text-neutral-400">{{ fila.articulo ?? '—' }}</span>
          </template>
          <template #celda-estado="{ fila }">
            <UBadge :color="COLOR_ESTADO_PROPUESTA[fila.estado] ?? 'neutral'" variant="subtle">
              {{ ETIQUETA_ESTADO_PROPUESTA[fila.estado] ?? fila.estado }}
            </UBadge>
          </template>
          <template #celda-fecha="{ fila }">
            <span class="text-xs text-neutral-500 dark:text-neutral-400">{{ new Date(fila.creado_at).toLocaleDateString('es-CO') }}</span>
          </template>
          <template #celda-acciones="{ fila }">
            <div v-if="fila.estado === 'pendiente'" class="flex justify-end gap-2">
              <UButton size="xs" color="success" @click="aprobar(fila.id)">Aprobar</UButton>
              <UButton size="xs" color="error" variant="soft" @click="abrirRechazo(fila.id)">Rechazar</UButton>
            </div>
          </template>
        </UiTabla>
      </section>
    </template>

    <!-- Drawer detalle/edición -->
    <FundamentosDrawer
      v-if="fundamentoSeleccionadoId !== null"
      :fundamento-id="fundamentoSeleccionadoId"
      :es-plataforma-admin="esPlataforma"
      @cerrar="fundamentoSeleccionadoId = null"
      @editado="alEditarFundamento"
    />

    <!-- Modal propuesta -->
    <UModal v-model:open="propuestaAbierta" title="Proponer cambio">
      <template #body>
        <p class="text-sm text-neutral-500 dark:text-neutral-400 mb-4">
          Propones un cambio al fundamento: <strong>{{ propuestaOriginal?.norma }}</strong>
          {{ propuestaOriginal?.articulo ? `(${propuestaOriginal.articulo})` : '' }}
        </p>
        <form class="space-y-3" @submit.prevent="enviarPropuesta">
          <UFormField label="Tipo" name="propTipo">
            <USelect v-model="propTipo" :items="TIPO_FUNDAMENTO_ITEMS" value-key="value" class="w-full" />
          </UFormField>
          <UFormField label="Norma" name="propNorma"><UInput v-model="propNorma" required class="w-full" /></UFormField>
          <UFormField label="Artículo" name="propArticulo"><UInput v-model="propArticulo" class="w-full" /></UFormField>
          <UFormField label="Descripción" name="propDescripcion"><UTextarea v-model="propDescripcion" class="w-full" :rows="5" autoresize :maxrows="14" /></UFormField>
          <UFormField label="Referencia" name="propReferencia"><UInput v-model="propReferencia" class="w-full" /></UFormField>
          <UFormField label="Fuente URL" name="propFuenteUrl"><UInput v-model="propFuenteUrl" class="w-full" placeholder="https://..." /></UFormField>
          <div class="flex justify-end gap-2 pt-2">
            <UButton variant="soft" @click="cerrarPropuesta">Cancelar</UButton>
            <UButton type="submit" :loading="propEnviando">Enviar propuesta</UButton>
          </div>
        </form>
      </template>
    </UModal>

    <!-- Modal rechazo -->
    <UModal title="Rechazar propuesta" :open="propuestaRechazoId !== null" @update:open="(v: boolean) => { if (!v) propuestaRechazoId = null }">
      <template #body>
        <UFormField label="Motivo del rechazo" name="motivo">
          <UTextarea v-model="propuestaRechazoMotivo" class="w-full" placeholder="Indica por qué se rechaza..." :rows="3" autoresize />
        </UFormField>
        <div class="flex justify-end gap-2 pt-4">
          <UButton variant="soft" @click="propuestaRechazoId = null">Cancelar</UButton>
          <UButton color="error" :disabled="!propuestaRechazoMotivo" @click="confirmarRechazo">Rechazar</UButton>
        </div>
      </template>
    </UModal>
  </div>
</template>
