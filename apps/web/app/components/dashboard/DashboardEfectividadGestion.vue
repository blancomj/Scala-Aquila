<script setup lang="ts">
// Puente de mando §6.4 — figura 4: efectividad de la gestión de cobranza.
// NO es un gráfico (cualquier barra/anillo sobre "5 de 6" es decoración):
// lista de tres columnas, concepto/fracción cruda/razón. Las razones vienen
// de `calcularIndicadoresGestion()` (packages/liquidation-engine,
// REC-CAR-004) — nunca una división a mano aquí. Denominador cero =
// "indeterminado", nunca 0% (comment on function de fn_indicadores_gestion).
//
// El ancho de la columna de razón usa `rem` (no `em`): con `em` se mide
// contra el tamaño de fuente de CADA variante (la razón va a 17px,
// "indeterminado" a 12.5px) y la palabra se corta — ya mordió en la
// maqueta.
export interface FilaEfectividad {
  concepto: string
  numerador: number
  denominador: number
  pct: number | null
}

defineProps<{
  filas: FilaEfectividad[]
  recuperado: string
}>()
</script>

<template>
  <div class="space-y-3">
    <ul class="divide-y divide-default">
      <li v-for="fila in filas" :key="fila.concepto" class="grid grid-cols-[1fr_5rem_6rem] items-center gap-3 py-2">
        <span class="text-sm text-muted">{{ fila.concepto }}</span>
        <span class="text-right text-xs tabular-nums text-dimmed">
          {{ fila.numerador }} de {{ fila.denominador }}
        </span>
        <span
          class="text-right font-display tabular-nums"
          :class="fila.pct === null ? 'text-sm text-dimmed' : 'text-[17px] font-semibold text-highlighted'"
        >
          {{ fila.pct === null ? 'indeterminado' : `${fila.pct.toFixed(1)}%` }}
        </span>
      </li>
    </ul>
    <p class="text-sm text-muted">
      Recuperado por gestión de cobranza este periodo:
      <b class="font-display font-semibold tabular-nums text-highlighted">{{ recuperado }}</b>
    </p>
  </div>
</template>
