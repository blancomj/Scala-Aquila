<script setup lang="ts">
// Puente de mando §4.5/§4.5b — una fila de "espera tu decisión", sobre
// `Situacion` (fn_mis_asuntos). Un botón por fila que NAVEGA al módulo: la
// función ya trae `accion`/`enlace`, no se inventan ni se aprueba en línea
// desde el dashboard (§4.5b — cada módulo tiene sus propias reglas de
// rechazo/aprobación). Si la fila llegó, el usuario puede actuar sobre
// ella (regla 3 de la cabecera de fn_mis_asuntos) — no hay gate de permiso
// aquí, a propósito.
import type { Situacion } from '@aquila/shared'
import { relativoConVencimiento, relativoCorto } from '~/utils/fecha-relativa'

const props = defineProps<{
  asunto: Situacion
  etiquetaOrigen: string
  esTuyo: boolean
  /** Timestamp (ms) del "ahora" del reloj compartido de la pantalla — no
   * `new Date()` local, para que este texto se recalcule con el mismo
   * intervalo de 30s que el sello de frescura (§6.7 caso 6), sin que cada
   * fila lleve su propio reloj desincronizado. */
  ahora: number
}>()

const vencimiento = computed(() =>
  props.asunto.venceAt !== null ? relativoConVencimiento(props.asunto.venceAt, new Date(props.ahora)) : null,
)
const vencido = computed(() => vencimiento.value?.vencido ?? false)

const metadato = computed(() => {
  if (vencimiento.value) return vencimiento.value.texto
  return `sin atender ${relativoCorto(props.asunto.createdAt, new Date(props.ahora))}`
})
</script>

<template>
  <li class="flex flex-col gap-2 py-3 sm:flex-row sm:items-start sm:justify-between sm:gap-3">
    <div class="min-w-0 space-y-0.5">
      <div class="flex flex-wrap items-center gap-x-2 gap-y-1">
        <span class="text-[11px] font-medium uppercase tracking-wide text-dimmed">{{ etiquetaOrigen }}</span>
        <span v-if="esTuyo" class="rounded-full bg-primary/10 px-1.5 py-0.5 text-[11px] font-medium text-primary">
          Asignado a ti
        </span>
      </div>
      <p class="text-[15px] text-highlighted">{{ asunto.titulo }}</p>
      <p v-if="asunto.resumen" class="truncate text-sm text-muted">{{ asunto.resumen }}</p>
      <p class="text-xs" :class="vencido ? 'font-medium text-warning' : 'text-dimmed'">
        {{ metadato }}
      </p>
    </div>
    <UButton :to="asunto.enlace" size="sm" variant="outline" color="neutral" class="shrink-0 self-start">
      {{ asunto.accion }}
    </UButton>
  </li>
</template>
