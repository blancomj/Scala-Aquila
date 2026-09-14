<script setup lang="ts">
// Panel del administrador: bandeja de transacciones de pasarela (§8.3 del
// prompt de fase 2). Solo lectura — intenciones_pago no tiene política de
// escritura para authenticated (ver su COMMENT ON TABLE); toda transición de
// estado la maneja crear-intencion-pago/webhook-pasarela/el job de
// expiración, nunca esta pantalla.
definePageMeta({ layout: 'default', middleware: ['tenant', 'rbac'], permiso: 'data:read' })

const tenantStore = useTenantStore()
const pasarelasStore = usePasarelasStore()

// `watch: [...]`: activeTenant puede no estar resuelto en el instante exacto
// de este setup en la carga en frío — la opción reintenta sola en cuanto el
// id esté disponible (mismo espíritu que configuracion/ia.vue).
await useAsyncData(
  'pasarela-transacciones',
  async () => {
    const tenantId = tenantStore.activeTenant?.id
    if (!tenantId) return []
    await pasarelasStore.cargarIntenciones(tenantId)
    return pasarelasStore.intenciones
  },
  { watch: [() => tenantStore.activeTenant?.id] },
)

const ETIQUETA_ESTADO: Record<string, { texto: string; color: 'neutral' | 'info' | 'success' | 'error' | 'warning' }> = {
  creada: { texto: 'Creada', color: 'neutral' },
  pendiente: { texto: 'Pendiente', color: 'info' },
  aprobada: { texto: 'Aprobada', color: 'success' },
  rechazada: { texto: 'Rechazada', color: 'error' },
  expirada: { texto: 'Expirada', color: 'warning' },
}

const filtroEstado = ref<string | null>(null)
const opcionesEstado = [
  { value: null, label: 'Todos los estados' },
  { value: 'pendiente', label: 'Pendiente' },
  { value: 'aprobada', label: 'Aprobada' },
  { value: 'rechazada', label: 'Rechazada' },
  { value: 'expirada', label: 'Expirada' },
  { value: 'creada', label: 'Creada' },
]

const filas = computed(() =>
  filtroEstado.value
    ? pasarelasStore.intenciones.filter((i) => i.estado === filtroEstado.value)
    : pasarelasStore.intenciones,
)

function formatoFechaHora(iso: string): string {
  return new Date(iso).toLocaleString('es-CO', { dateStyle: 'short', timeStyle: 'short' })
}
</script>

<template>
  <div class="space-y-6 max-w-5xl">
    <UiTituloDescripcion>
      <template #titulo>
        <h1 class="text-xl font-semibold">Transacciones de pasarela</h1>
      </template>
      <template #descripcion>
        Cada fila es una intención de pago iniciada desde el estado de cuenta público o registrada
        en nombre de un residente. El pago real y su recibo de caja solo existen cuando el estado es
        «Aprobada» — el resto son intentos en curso o que no se completaron.
      </template>
    </UiTituloDescripcion>

    <USelect
      v-model="filtroEstado"
      :items="opcionesEstado"
      value-key="value"
      class="w-full sm:w-64"
    />

    <UiTabla
      :columnas="[
        { clave: 'created_at', etiqueta: 'Fecha', claseCelda: 'mono' },
        { clave: 'inmuebleCodigo', etiqueta: 'Inmueble' },
        { clave: 'proveedor', etiqueta: 'Proveedor' },
        { clave: 'metodo', etiqueta: 'Método' },
        { clave: 'monto', etiqueta: 'Monto', alinear: 'derecha', claseCelda: 'mono' },
        { clave: 'estado', etiqueta: 'Estado' },
        { clave: 'referencia', etiqueta: 'Referencia' },
      ]"
      :filas="filas"
      :clave-fila="(f) => f.id"
      :cargando="pasarelasStore.cargandoIntenciones"
      vacio="Sin transacciones de pasarela todavía."
    >
      <template #celda-created_at="{ fila }">
        <span class="text-xs">{{ formatoFechaHora(fila.created_at) }}</span>
      </template>
      <template #celda-proveedor="{ fila }">
        <span class="capitalize">{{ fila.proveedor }}</span>
      </template>
      <template #celda-metodo="{ fila }">
        <span v-if="fila.metodo" class="text-xs">{{ fila.metodo }}</span>
        <span v-else class="text-neutral-400 text-xs">—</span>
      </template>
      <template #celda-monto="{ fila }">
        {{ formatoMoneda(fila.monto) }}
      </template>
      <template #celda-estado="{ fila }">
        <UBadge :color="ETIQUETA_ESTADO[fila.estado]?.color ?? 'neutral'" variant="subtle" size="sm">
          {{ ETIQUETA_ESTADO[fila.estado]?.texto ?? fila.estado }}
        </UBadge>
      </template>
      <template #celda-referencia="{ fila }">
        <span class="font-mono text-xs text-neutral-500">{{ fila.referencia }}</span>
      </template>
    </UiTabla>
  </div>
</template>
