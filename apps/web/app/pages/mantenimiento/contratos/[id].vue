<script setup lang="ts">
// MANT-5 §4.3/§4.6: ficha de contrato. El comprometido/ejecutado se lee SIEMPRE de
// mant_contrato_ejecucion() (fuente explícita en pantalla, nunca un total propio) y la
// transición de estado respeta la FSM de guard_mant_contrato (borrador→vigente→
// suspendido/terminado; terminado es inmutable).
import type { Database } from '@aquila/shared'

definePageMeta({ layout: 'default', middleware: ['tenant', 'rbac'], permiso: 'data:read' })

type ContratoEstado = Database['public']['Enums']['contrato_estado_t']

const route = useRoute()
const contratoId = route.params.id as string

const tenantStore = useTenantStore()
const contratosStore = useMantenimientoContratosStore()
const tercerosStore = useTercerosStore()
const activosStore = useActivosStore()
const documentosStore = useDocumentosStore()

const estadoVisible = ref<string | null>(null)

async function cargar(): Promise<void> {
  const tenantId = tenantStore.activeTenant?.id
  if (!tenantId) return
  await Promise.all([
    contratosStore.cargarContrato(tenantId, contratoId),
    tercerosStore.cargarTerceros(tenantId),
    activosStore.cargarActivos(tenantId),
  ])
  const cliente = useSupabaseClient<Database>()
  const { data } = await cliente.rpc('mant_contrato_estado_visible', { p_contrato_id: contratoId }).single<string>()
  estadoVisible.value = data
}
onMounted(cargar)
onBeforeUnmount(() => contratosStore.limpiarActual())

const contrato = computed(() => contratosStore.contratoActual)
const nombreTercero = computed(() => new Map(tercerosStore.terceros.map((t) => [t.id, t.nombre_completo])))

const ESTADO_COLOR: Record<string, 'success' | 'warning' | 'error' | 'neutral'> = {
  borrador: 'neutral', vigente: 'success', por_vencer: 'warning', suspendido: 'warning',
  vencido: 'error', terminado: 'error',
}

const errorAccion = ref<string | null>(null)

const TRANSICIONES: Record<ContratoEstado, ContratoEstado[]> = {
  borrador: ['vigente'], vigente: ['suspendido', 'terminado'], suspendido: ['vigente', 'terminado'], terminado: [],
}
const transicionesDisponibles = computed(() => contrato.value ? TRANSICIONES[contrato.value.estado] : [])

async function cambiarEstado(nuevo: ContratoEstado): Promise<void> {
  if (!contrato.value) return
  errorAccion.value = null
  try {
    await contratosStore.actualizarContrato(contrato.value.id, { estado: nuevo })
    const cliente = useSupabaseClient<Database>()
    const { data } = await cliente.rpc('mant_contrato_estado_visible', { p_contrato_id: contratoId }).single<string>()
    estadoVisible.value = data
  } catch (excepcion) {
    errorAccion.value = mensajeError(excepcion, 'No se pudo cambiar el estado del contrato.')
  }
}

// ── Activos cubiertos ──
const activoSeleccionado = ref<string | null>(null)
const opcionesActivo = computed(() =>
  activosStore.activos
    .filter((a) => !contratosStore.activosCubiertos.some((ac) => ac.activo_id === a.id))
    .map((a) => ({ valor: a.id, etiqueta: `${a.codigo} — ${a.nombre}` })),
)
const nombreActivo = computed(() => new Map(activosStore.activos.map((a) => [a.id, `${a.codigo} — ${a.nombre}`])))

async function agregarActivo(): Promise<void> {
  const tenantId = tenantStore.activeTenant?.id
  if (!tenantId || !activoSeleccionado.value || !contrato.value) return
  errorAccion.value = null
  try {
    await contratosStore.agregarActivoCubierto({ tenant_id: tenantId, contrato_id: contrato.value.id, activo_id: activoSeleccionado.value })
    activoSeleccionado.value = null
  } catch (excepcion) {
    errorAccion.value = mensajeError(excepcion, 'No se pudo agregar el activo.')
  }
}
async function quitarActivo(id: string): Promise<void> {
  if (!contrato.value) return
  await contratosStore.quitarActivoCubierto(id, contrato.value.id)
}

// ── Cláusulas ──
const archivoClausula = ref<File | null>(null)
const formClausula = reactive({ titulo: '', texto: '', orden: 0 })
function elegirArchivoClausula(evento: Event): void {
  archivoClausula.value = (evento.target as HTMLInputElement).files?.[0] ?? null
}
async function agregarClausula(): Promise<void> {
  const tenantId = tenantStore.activeTenant?.id
  if (!tenantId || !contrato.value || !formClausula.titulo.trim() || !formClausula.texto.trim()) return
  errorAccion.value = null
  try {
    let documentoId: string | null = null
    if (archivoClausula.value) {
      const tipoDoc = await cargarListaTipos(tenantId, 'TIPO_DOCUMENTO')
      const tipoDocContrato = tipoDoc.find((t) => t.codigo === 'contrato_servicio')
      if (!tipoDocContrato) throw new Error('No se encontró el tipo de documento "contrato_servicio".')
      const documento = await documentosStore.subirDocumento({
        tenantId, inmuebleId: null, tipoDocumentoId: tipoDocContrato.id, archivo: archivoClausula.value,
      })
      documentoId = documento.id
    }
    await contratosStore.agregarClausula({
      tenant_id: tenantId, contrato_id: contrato.value.id, titulo: formClausula.titulo.trim(),
      texto: formClausula.texto.trim(), orden: formClausula.orden, documento_id: documentoId,
    })
    formClausula.titulo = ''; formClausula.texto = ''; formClausula.orden = 0
    archivoClausula.value = null
  } catch (excepcion) {
    errorAccion.value = mensajeError(excepcion, 'No se pudo agregar la cláusula.')
  }
}
</script>

<template>
  <div v-if="contrato" class="space-y-6">
    <div>
      <UButton variant="link" icon="i-lucide-arrow-left" to="/mantenimiento/contratos" class="px-0 mb-1">
        Contratos
      </UButton>
      <div class="flex items-center gap-3 flex-wrap">
        <h1 class="text-xl font-semibold">{{ contrato.codigo }} · {{ nombreTercero.get(contrato.tercero_id) ?? '—' }}</h1>
        <UBadge :color="ESTADO_COLOR[estadoVisible ?? contrato.estado] ?? 'neutral'" variant="soft" class="capitalize">
          {{ (estadoVisible ?? contrato.estado).replace(/_/g, ' ') }}
        </UBadge>
      </div>
      <p class="text-sm text-muted max-w-2xl">{{ contrato.objeto }}</p>
    </div>

    <UAlert v-if="errorAccion" color="error" variant="soft" :title="errorAccion" />

    <div class="grid grid-cols-1 lg:grid-cols-3 gap-6">
      <div class="lg:col-span-2 space-y-6">
        <!-- Ejecución presupuestal — fuente explícita (§4.6) -->
        <section class="rounded-lg border border-default p-4 space-y-2">
          <h2 class="font-medium">Ejecución</h2>
          <div class="grid grid-cols-2 gap-4">
            <div>
              <p class="text-xs text-muted">Comprometido (valor_total del contrato)</p>
              <p class="text-lg font-semibold">{{ contratosStore.ejecucion?.comprometido ?? '—' }}</p>
            </div>
            <div>
              <p class="text-xs text-muted">Ejecutado (suma de presupuesto_ejecucion vinculada)</p>
              <p class="text-lg font-semibold">{{ contratosStore.ejecucion?.ejecutado ?? 0 }}</p>
            </div>
          </div>
        </section>

        <!-- Transición de estado -->
        <section class="rounded-lg border border-default p-4 space-y-2">
          <h2 class="font-medium">Estado del contrato</h2>
          <p class="text-xs text-muted">
            {{ estadoVisible === contrato.estado
              ? 'Estado real, sin ajuste de presentación.'
              : `Presentación calculada (${estadoVisible}); el estado real guardado es "${contrato.estado}".` }}
          </p>
          <div class="flex gap-2 pt-1">
            <UButton
              v-for="siguiente in transicionesDisponibles" :key="siguiente" variant="outline"
              :loading="contratosStore.guardando" @click="cambiarEstado(siguiente)"
            >
              Pasar a {{ siguiente.replace(/_/g, ' ') }}
            </UButton>
            <p v-if="transicionesDisponibles.length === 0" class="text-sm text-muted">Estado terminal — sin transiciones disponibles.</p>
          </div>
        </section>

        <!-- Activos cubiertos -->
        <section class="rounded-lg border border-default p-4 space-y-3">
          <h2 class="font-medium">Activos cubiertos</h2>
          <div class="divide-y divide-default">
            <div v-for="ac in contratosStore.activosCubiertos" :key="ac.id" class="flex items-center justify-between py-2">
              <p class="text-sm">{{ nombreActivo.get(ac.activo_id) ?? '—' }}</p>
              <UButton variant="ghost" color="error" icon="i-lucide-x" size="sm" @click="quitarActivo(ac.id)" />
            </div>
            <p v-if="contratosStore.activosCubiertos.length === 0" class="py-4 text-sm text-muted text-center">
              Sin activos cubiertos por este contrato.
            </p>
          </div>
          <div class="flex gap-2 pt-2 border-t border-default">
            <UiSelectorBuscable v-model="activoSeleccionado" :opciones="opcionesActivo" placeholder="Selecciona un activo" class="flex-1" />
            <UButton :disabled="!activoSeleccionado" :loading="contratosStore.guardando" @click="agregarActivo()">Agregar</UButton>
          </div>
        </section>

        <!-- Cláusulas -->
        <section class="rounded-lg border border-default p-4 space-y-3">
          <h2 class="font-medium">Cláusulas</h2>
          <div class="divide-y divide-default">
            <div v-for="cl in contratosStore.clausulas" :key="cl.id" class="py-2">
              <p class="text-sm font-medium">{{ cl.titulo }}</p>
              <p class="text-sm text-muted">{{ cl.texto }}</p>
            </div>
            <p v-if="contratosStore.clausulas.length === 0" class="py-4 text-sm text-muted text-center">
              Sin cláusulas registradas.
            </p>
          </div>
          <div class="space-y-2 pt-2 border-t border-default">
            <UInput v-model="formClausula.titulo" placeholder="Título de la cláusula" class="w-full" />
            <UTextarea v-model="formClausula.texto" placeholder="Texto de la cláusula" class="w-full" />
            <div class="flex items-center gap-2">
              <input type="file" accept=".pdf,.jpg,.jpeg,.png" class="text-sm flex-1" @change="elegirArchivoClausula">
              <UButton
                :loading="contratosStore.guardando" :disabled="!formClausula.titulo.trim() || !formClausula.texto.trim()"
                @click="agregarClausula()"
              >
                Agregar cláusula
              </UButton>
            </div>
          </div>
        </section>
      </div>

      <div class="space-y-3">
        <section class="rounded-lg border border-default p-4 space-y-2 text-sm">
          <h2 class="font-medium mb-1">Términos</h2>
          <p><span class="text-muted">Inicio:</span> {{ contrato.fecha_inicio }}</p>
          <p><span class="text-muted">Fin:</span> {{ contrato.fecha_fin ?? 'sin fecha de fin' }}</p>
          <p><span class="text-muted">Valor total:</span> {{ contrato.valor_total ?? '—' }}</p>
          <p><span class="text-muted">Valor periódico:</span> {{ contrato.valor_periodico ?? '—' }}</p>
          <p><span class="text-muted">Forma de pago:</span> {{ contrato.forma_pago ?? '—' }}</p>
          <p><span class="text-muted">SLA respuesta:</span> {{ contrato.sla_respuesta_horas ?? '—' }} h</p>
          <p><span class="text-muted">SLA solución:</span> {{ contrato.sla_solucion_horas ?? '—' }} h</p>
        </section>
      </div>
    </div>
  </div>
  <p v-else class="text-sm text-muted p-6 text-center">Cargando…</p>
</template>
