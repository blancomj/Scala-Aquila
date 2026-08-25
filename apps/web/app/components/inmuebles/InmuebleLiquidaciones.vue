<script setup lang="ts">
// Tab Liquidaciones — historial por periodo de este inmueble
// (PROMPT_FICHA_INMUEBLE.md §1.1 I7). Solo lectura vía
// liquidacion.ts::cargarLineasPorInmueble (extendido en T2) — el motor de
// liquidación en sí queda fuera de alcance (§1.2), esta ficha solo lo
// consume.
//
// Los 7 estados vienen de L0 (20260830570000, liquidación en dos tiempos):
// antes eran 2 ('completada'|'fallida') y bastaba un ternario. Aquí solo se
// traduce estado → color/etiqueta; el flujo que los produce vive en la
// pantalla de liquidación, no en la ficha del inmueble.
import type { Database } from '@aquila/shared'

type LiquidacionEstado = Database['public']['Enums']['liquidacion_estado_t']

const COLOR_ESTADO: Record<LiquidacionEstado, 'success' | 'error' | 'warning' | 'info' | 'neutral'> = {
  aplicada: 'success',
  pendiente_aprobacion: 'info',
  pre_liquidada: 'warning',
  rechazada: 'warning',
  anulada: 'error',
  fallida: 'error',
  descartada: 'neutral',
}

const ETIQUETA_ESTADO: Record<LiquidacionEstado, string> = {
  aplicada: 'Aplicada',
  pendiente_aprobacion: 'Pendiente de aprobación',
  pre_liquidada: 'Pre-liquidada',
  rechazada: 'Rechazada',
  anulada: 'Anulada',
  fallida: 'Fallida',
  descartada: 'Descartada',
}

const props = defineProps<{ inmuebleId: string }>()

const tenantStore = useTenantStore()
const liquidacionStore = useLiquidacionStore()

watchEffect(async () => {
  const tenantId = tenantStore.activeTenant?.id
  if (!tenantId) return
  await liquidacionStore.cargarLineasPorInmueble(tenantId, props.inmuebleId)
})
</script>

<template>
  <div>
    <div class="panel-head">
      <div>
        <h2>Liquidaciones</h2>
        <p class="panel-sub">Historial de liquidación de este inmueble por periodo.</p>
      </div>
    </div>
    <UiTabla
      :columnas="[
        { clave: 'periodo', etiqueta: 'Periodo', claseCelda: 'mono' },
        { clave: 'estado', etiqueta: 'Estado' },
        { clave: 'monto', etiqueta: 'Monto liquidado', alinear: 'derecha', claseCelda: 'mono' },
        { clave: 'fecha', etiqueta: 'Fecha', claseCelda: 'mono' },
      ]"
      :filas="liquidacionStore.lineasPorInmueble"
      :clave-fila="(l) => l.id"
      vacio="Sin liquidaciones registradas para este inmueble."
    >
      <template #celda-periodo="{ fila }">{{ fila.liquidacion.periodo.anio }}-{{ String(fila.liquidacion.periodo.mes).padStart(2, '0') }}</template>
      <template #celda-estado="{ fila }">
        <UBadge :color="COLOR_ESTADO[fila.liquidacion.estado]" variant="subtle">
          {{ ETIQUETA_ESTADO[fila.liquidacion.estado] }}
        </UBadge>
      </template>
      <template #celda-monto="{ fila }">$ {{ Number(fila.monto).toLocaleString('es-CO') }}</template>
      <template #celda-fecha="{ fila }">{{ fila.created_at?.slice(0, 10) }}</template>
    </UiTabla>
    <p class="text-sm text-neutral-500 mt-3">
      Un cierre solo se revierte mediante <strong>reversión auditada</strong> — nunca editando la
      liquidación directamente.
    </p>
  </div>
</template>
