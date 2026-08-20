<script setup lang="ts" generic="T">
// Tabla genérica y headless — centraliza <table>/<thead>/<tbody> + estado
// vacío + las dos variantes visuales de la app (mismo criterio que
// UiSelectorBuscable.vue/UiDrawer.vue). Headless en el contenido de cada
// celda a propósito: cada tabla existente tiene su propia lógica de celda
// (badges, botones de acción, montos formateados) — un data-grid 100%
// genérico sería más complicado que las tablas actuales, no menos. El
// consumidor pasa un slot por columna (#celda-<clave>); sin slot, se
// muestra fila[columna.clave] tal cual (suficiente para columnas de texto
// plano).
export interface ColumnaTabla {
  clave: string
  etiqueta: string
  alinear?: 'derecha'
  /** Clase(s) extra para el <td> — p. ej. "mono" para columnas monoespaciadas. */
  claseCelda?: string
}

withDefaults(
  defineProps<{
    columnas: ColumnaTabla[]
    filas: readonly T[]
    claveFila: (fila: T, indice: number) => string | number
    variante?: 'ficha' | 'tailwind'
    vacio?: string
  }>(),
  {
    variante: 'tailwind',
    vacio: 'Sin registros.',
  },
)

function valorCelda(fila: T, clave: string): unknown {
  return (fila as Record<string, unknown>)[clave]
}
</script>

<template>
  <table
    v-if="filas.length > 0"
    :class="variante === 'tailwind' ? 'w-full text-sm' : undefined"
  >
    <thead>
      <tr
        :class="
          variante === 'tailwind' ? 'text-left text-gray-500 border-b border-gray-200 dark:border-gray-800' : undefined
        "
      >
        <th
          v-for="col in columnas"
          :key="col.clave"
          :class="[
            col.alinear === 'derecha' && variante === 'ficha' ? 'num' : '',
            variante === 'tailwind' ? ['py-1 px-3 font-medium', col.alinear === 'derecha' ? 'text-right' : ''] : '',
          ]"
        >
          <slot :name="`encabezado-${col.clave}`">{{ col.etiqueta }}</slot>
        </th>
      </tr>
    </thead>
    <tbody>
      <tr
        v-for="(fila, indice) in filas"
        :key="claveFila(fila, indice)"
        :class="variante === 'tailwind' ? 'border-b border-gray-100 dark:border-gray-900' : undefined"
      >
        <td
          v-for="col in columnas"
          :key="col.clave"
          :class="[
            col.alinear === 'derecha' && variante === 'ficha' ? 'num' : '',
            variante === 'tailwind' ? ['py-1.5 px-3', col.alinear === 'derecha' ? 'text-right' : ''] : '',
            col.claseCelda,
          ]"
        >
          <slot :name="`celda-${col.clave}`" :fila="fila" :indice="indice">{{ valorCelda(fila, col.clave) }}</slot>
        </td>
      </tr>
    </tbody>
  </table>
  <p v-else :class="variante === 'ficha' ? 'empty-state' : 'text-gray-500 text-sm'">
    <slot name="vacio">{{ vacio }}</slot>
  </p>
</template>
