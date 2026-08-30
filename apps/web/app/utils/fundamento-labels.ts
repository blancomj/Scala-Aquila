// Etiquetas/colores de fundamento_normativo — mismo criterio que concepto-labels.ts /
// novedad-labels.ts: un solo lugar para el vocabulario que hoy vive duplicado en
// fundamentos/index.vue, fundamentos/[id].vue y fundamentos/nuevo.vue (los 3 selects de
// tipo repetían la misma lista a mano).

export const TIPO_FUNDAMENTO = [
  { value: 'ley', label: 'Ley' },
  { value: 'decreto', label: 'Decreto' },
  { value: 'orientacion_tecnica', label: 'Orientación técnica' },
  { value: 'reglamento_ph', label: 'Reglamento PH' },
  { value: 'decision_asamblea', label: 'Decisión de asamblea' },
  { value: 'otra', label: 'Otra' },
] as const

// Mismos datos que TIPO_FUNDAMENTO, como array mutable de `string` planos — el `as const` de
// arriba da un tuple readonly de literales, que USelect's `items` (tipado mutable) rechaza, y que
// además forzaría los `ref<string>` de tipo/propTipo en las 3 pantallas que seleccionan un tipo de
// fundamento a angostarse al union literal. Un solo lugar que ensancha el tipo, en vez de un cast
// repetido en cada `<USelect :items="...">`.
export const TIPO_FUNDAMENTO_ITEMS: { value: string; label: string }[] = TIPO_FUNDAMENTO.map((t) => ({
  value: t.value,
  label: t.label,
}))

export const ETIQUETA_TIPO_FUNDAMENTO: Record<string, string> = Object.fromEntries(
  TIPO_FUNDAMENTO.map((t) => [t.value, t.label]),
)

export const COLOR_TIPO_FUNDAMENTO: Record<
  string,
  'info' | 'primary' | 'success' | 'warning' | 'secondary' | 'neutral'
> = {
  ley: 'info',
  decreto: 'primary',
  orientacion_tecnica: 'success',
  reglamento_ph: 'warning',
  decision_asamblea: 'secondary',
  otra: 'neutral',
}

export const ESTADO_FUNDAMENTO = [
  { value: 'activo', label: 'Activo' },
  { value: 'propuesto', label: 'Propuesto' },
  { value: 'rechazado', label: 'Rechazado' },
] as const

export const COLOR_ESTADO_FUNDAMENTO: Record<string, 'success' | 'warning' | 'error' | 'neutral'> = {
  activo: 'success',
  propuesto: 'warning',
  rechazado: 'error',
}

export const ETIQUETA_ESTADO_PROPUESTA: Record<string, string> = {
  pendiente: 'Pendiente',
  aprobada: 'Aprobada',
  rechazada: 'Rechazada',
}

export const COLOR_ESTADO_PROPUESTA: Record<string, 'warning' | 'success' | 'error' | 'neutral'> = {
  pendiente: 'warning',
  aprobada: 'success',
  rechazada: 'error',
}
