/**
 * Generación del calendario de cuotas de un acuerdo de pago (CAR §12.3) —
 * puro, sin Supabase, para poder probarlo sin fixtures de base de datos.
 *
 * Decisión de modelado (no está en el rector, documentada aquí): cuota_inicial
 * es un abono aparte que se paga al firmar y NO forma parte de las
 * numero_cuotas cuotas del calendario — numero_cuotas cubre exactamente
 * (monto_total - cuota_inicial). El residuo de centavos que deja la
 * división entera se acumula en la ÚLTIMA cuota (mismo criterio que un
 * plan de amortización convencional), no se reparte centavo a centavo.
 *
 * Las fechas se interpolan linealmente por conteo de días entre fecha_inicio
 * y fecha_fin, de forma que la cuota numero_cuotas SIEMPRE vence exactamente
 * en fecha_fin — el resto del calendario queda derivado, no inventado.
 */

export interface CuotaGenerada {
  numeroCuota: number
  fechaVencimiento: string
  monto: number
}

function soloFecha(iso: string): Date {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso)
  if (!m) throw new Error(`Fecha inválida: ${iso}`)
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]))
}

function aISO(fecha: Date): string {
  return `${String(fecha.getFullYear())}-${String(fecha.getMonth() + 1).padStart(2, '0')}-${String(fecha.getDate()).padStart(2, '0')}`
}

const MS_POR_DIA = 24 * 60 * 60 * 1000

function distribuirFechas(fechaInicio: string, fechaFin: string, numeroCuotas: number): string[] {
  const inicio = soloFecha(fechaInicio)
  const fin = soloFecha(fechaFin)
  const totalDias = Math.round((fin.getTime() - inicio.getTime()) / MS_POR_DIA)
  if (totalDias < numeroCuotas) {
    throw new Error('El período del acuerdo es más corto que el número de cuotas — al menos un día por cuota.')
  }
  return Array.from({ length: numeroCuotas }, (_, i) => {
    const numeroCuota = i + 1
    const dias = Math.round((totalDias * numeroCuota) / numeroCuotas)
    return aISO(new Date(inicio.getTime() + dias * MS_POR_DIA))
  })
}

export function generarCuotasAcuerdo(params: {
  montoTotal: number
  cuotaInicial: number
  numeroCuotas: number
  fechaInicio: string
  fechaFin: string
}): CuotaGenerada[] {
  if (params.numeroCuotas <= 0) throw new Error('numero_cuotas debe ser mayor a cero.')
  const saldoAFinanciar = params.montoTotal - params.cuotaInicial
  if (saldoAFinanciar <= 0) {
    throw new Error('La cuota inicial no puede ser mayor o igual al monto total del acuerdo.')
  }

  // Centavos enteros: evita que la división en punto flotante pierda o
  // invente un centavo al repartir entre las cuotas.
  const totalCentavos = Math.round(saldoAFinanciar * 100)
  const centavosBase = Math.floor(totalCentavos / params.numeroCuotas)
  const residuoCentavos = totalCentavos - centavosBase * params.numeroCuotas

  const fechas = distribuirFechas(params.fechaInicio, params.fechaFin, params.numeroCuotas)

  return fechas.map((fechaVencimiento, i) => {
    const numeroCuota = i + 1
    const centavos = numeroCuota === params.numeroCuotas ? centavosBase + residuoCentavos : centavosBase
    return { numeroCuota, fechaVencimiento, monto: centavos / 100 }
  })
}
