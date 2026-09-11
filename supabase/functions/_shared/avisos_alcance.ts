// ADC-01 — agrupa los AvisoAlcanceSinDato del motor (uno por inmueble
// excluido) en un aviso por CONCEPTO, mismo shape {codigo, titulo, detalle}
// que fn_liquidacion_prevuelo. Sin esto, un periodo con 500 unidades y un
// concepto segmentado produciría 500 filas en una pantalla pensada para un
// puñado de hallazgos — la cabecera de LiquidacionPrevuelo.vue asume eso.
//
// Compartido entre simular-liquidacion (muestra en vivo, sin persistir) y
// aplicar-liquidacion (congela en avisos_aceptados) — un solo lugar para no
// desincronizar el agrupado entre los dos momentos.

interface AvisoAlcanceCrudo {
  readonly conceptoCodigo: string
  readonly inmuebleId: string
  readonly campos: readonly string[]
}

export interface HallazgoAvisoAlcance {
  readonly codigo: string
  readonly titulo: string
  readonly detalle: string
}

export function agruparAvisosAlcance(avisos: readonly AvisoAlcanceCrudo[]): HallazgoAvisoAlcance[] {
  const porConcepto = new Map<string, { inmuebles: Set<string>; campos: Set<string> }>()
  for (const aviso of avisos) {
    const entrada = porConcepto.get(aviso.conceptoCodigo) ?? { inmuebles: new Set(), campos: new Set() }
    entrada.inmuebles.add(aviso.inmuebleId)
    for (const campo of aviso.campos) entrada.campos.add(campo)
    porConcepto.set(aviso.conceptoCodigo, entrada)
  }

  return [...porConcepto.entries()]
    .sort(([a], [b]) => (a < b ? -1 : 1))
    .map(([conceptoCodigo, { inmuebles, campos }]) => ({
      codigo: `ALCANCE_DATO_SIN_CLASIFICAR_${conceptoCodigo}`,
      titulo: `${inmuebles.size} inmueble(s) sin ${inmuebles.size === 1 ? 'el dato' : 'los datos'} que "${conceptoCodigo}" necesita para aplicar`,
      detalle:
        `No recibieron este concepto porque les falta clasificar: ${[...campos].sort().join(', ')}. ` +
        'No es un error de cálculo — el reparto entre los demás inmuebles es exacto — pero conviene ' +
        'revisar si esos inmuebles debían quedar fuera antes de aplicar.',
    }))
}
