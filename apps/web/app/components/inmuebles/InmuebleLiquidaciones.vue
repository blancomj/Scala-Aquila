<script setup lang="ts">
// Tab Liquidaciones — historial por periodo de este inmueble
// (PROMPT_FICHA_INMUEBLE.md §1.1 I7). Solo lectura vía
// liquidacion.ts::cargarLineasPorInmueble (extendido en T2) — el motor de
// liquidación en sí queda fuera de alcance (§1.2), esta ficha solo lo
// consume. liquidaciones.estado es 'completada'|'fallida' (D-14) — no el
// borrador/cerrada de 4 estados que muestra el mockup, que no corresponde
// a ninguna decisión real del esquema (gana el esquema, §2).
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
    <table v-if="liquidacionStore.lineasPorInmueble.length > 0">
      <thead><tr><th>Periodo</th><th>Estado</th><th class="num">Monto liquidado</th><th>Fecha</th></tr></thead>
      <tbody>
        <tr v-for="l in liquidacionStore.lineasPorInmueble" :key="l.id">
          <td class="mono">
            {{ l.liquidacion.periodo.anio }}-{{ String(l.liquidacion.periodo.mes).padStart(2, '0') }}
          </td>
          <td>
            <span class="badge" :class="l.liquidacion.estado === 'completada' ? 'badge--sello' : 'badge--ladrillo'">
              {{ l.liquidacion.estado }}
            </span>
          </td>
          <td class="num mono">$ {{ Number(l.monto).toLocaleString('es-CO') }}</td>
          <td class="mono">{{ l.created_at?.slice(0, 10) }}</td>
        </tr>
      </tbody>
    </table>
    <p v-else class="empty-state">Sin liquidaciones registradas para este inmueble.</p>
    <p class="note">
      Un cierre solo se revierte mediante <strong>reversión auditada</strong> — nunca editando la
      liquidación directamente.
    </p>
  </div>
</template>
