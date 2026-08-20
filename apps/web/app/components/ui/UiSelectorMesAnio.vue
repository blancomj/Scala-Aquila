<script setup lang="ts">
// Selector de mes/año — variante `type="month"` de UCalendar (Nuxt UI v4,
// MonthPicker de reka-ui por debajo). Se usa donde el dominio pide "a partir
// de"/"inicia en" un mes concreto, no un día (conceptos.tipo_recurrencia,
// Fase 2 conceptos avanzados) — dos <input type="number"> para año/mes no
// valida el rango del mes ni impide un estado a medio llenar; este selector
// siempre produce (año, mes) juntos o nada.
import { CalendarDate, getLocalTimeZone, today } from '@internationalized/date'

const props = withDefaults(
  defineProps<{
    anio: number | null
    mes: number | null
    placeholder?: string
    disabled?: boolean
  }>(),
  { placeholder: 'Seleccionar mes', disabled: false },
)
const emit = defineEmits<{ 'update:anio': [number]; 'update:mes': [number] }>()

const MESES_ABREV = [
  'Ene',
  'Feb',
  'Mar',
  'Abr',
  'May',
  'Jun',
  'Jul',
  'Ago',
  'Sep',
  'Oct',
  'Nov',
  'Dic',
]

const valor = computed<CalendarDate | null>(() =>
  props.anio !== null && props.mes !== null ? new CalendarDate(props.anio, props.mes, 1) : null,
)

const etiqueta = computed(() =>
  valor.value ? `${MESES_ABREV[valor.value.month - 1]} ${valor.value.year}` : props.placeholder,
)

function alSeleccionar(fecha: CalendarDate | null, cerrar: () => void): void {
  if (!fecha) return
  emit('update:anio', fecha.year)
  emit('update:mes', fecha.month)
  cerrar()
}
</script>

<template>
  <UPopover>
    <UButton
      :label="etiqueta"
      icon="i-lucide-calendar"
      color="neutral"
      variant="outline"
      :disabled="disabled"
      block
    />
    <template #content="{ close }">
      <UCalendar
        type="month"
        :model-value="valor ?? undefined"
        :default-placeholder="valor ?? today(getLocalTimeZone())"
        @update:model-value="(fecha) => alSeleccionar(fecha as CalendarDate | null, close)"
      />
    </template>
  </UPopover>
</template>
