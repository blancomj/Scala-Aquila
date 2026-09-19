<script setup lang="ts">
// Puente de mando §4.2 — la tira del ciclo: siete pasos del periodo
// (presupuesto → conceptos → liquidación → aplicación → recaudo →
// conciliación → cierre), derivados de datos reales (nunca plegable: es el
// instrumento de orientación de la pantalla). El paso "actual" tiene que
// coincidir con la acción primaria de "Estado del periodo" — lo garantiza
// quien arma `pasos`, no este componente.
export type EstadoPaso = 'hecho' | 'actual' | 'pendiente' | 'bloqueado'

export interface PasoCiclo {
  id: string
  nombre: string
  estado: EstadoPaso
  detalle: string
}

defineProps<{ pasos: PasoCiclo[] }>()
</script>

<template>
  <ol class="grid grid-cols-2 gap-x-2 gap-y-5 sm:grid-cols-4 lg:grid-cols-7 lg:gap-x-0">
    <li v-for="(paso, indice) in pasos" :key="paso.id" class="relative flex flex-col items-start gap-1.5 pr-2">
      <!-- Conector: línea horizontal hacia el siguiente paso, solo en la fila de 7 columnas. -->
      <span
        v-if="indice < pasos.length - 1"
        aria-hidden="true"
        class="absolute left-[calc(0.6rem+1px)] top-[0.6rem] hidden h-px w-[calc(100%-0.6rem)] lg:block"
        :class="paso.estado === 'hecho' ? 'bg-success opacity-45' : 'bg-neutral-200 dark:bg-neutral-800'"
      />
      <span class="relative flex items-center gap-2">
        <span
          aria-hidden="true"
          class="flex size-[1.2rem] shrink-0 items-center justify-center rounded-full"
          :class="{
            'bg-success': paso.estado === 'hecho',
            'bg-warning': paso.estado === 'bloqueado',
            'bg-default ring-4 ring-primary': paso.estado === 'actual',
            'border-2 border-neutral-300 dark:border-neutral-700': paso.estado === 'pendiente',
          }"
        >
          <UIcon
            v-if="paso.estado === 'hecho'"
            name="i-lucide-check"
            class="size-3 text-inverted"
          />
          <UIcon
            v-else-if="paso.estado === 'bloqueado'"
            name="i-lucide-x"
            class="size-3 text-inverted"
          />
        </span>
        <span
          class="text-sm font-display"
          :class="{
            'text-highlighted font-semibold': paso.estado === 'actual',
            'text-dimmed': paso.estado === 'pendiente',
            'text-warning font-semibold': paso.estado === 'bloqueado',
            'text-default': paso.estado === 'hecho',
          }"
        >
          {{ paso.nombre }}
        </span>
      </span>
      <span
        class="pl-[1.85rem] text-xs"
        :class="paso.estado === 'bloqueado' ? 'text-warning font-semibold' : 'text-dimmed'"
      >
        {{ paso.detalle }}
      </span>
    </li>
  </ol>
</template>
