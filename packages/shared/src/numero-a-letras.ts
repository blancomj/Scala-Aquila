/**
 * Monto en letras, español/Colombia — RC-3 (recibo de caja). El mockup
 * oficial (recibo_caja.html) lo exige tal cual: "Cien mil pesos M/CTE".
 * No existía ninguna utilidad de este tipo en el repo (verificado por
 * búsqueda antes de escribirla) — se investigó el algoritmo estándar de
 * conversión número→letras en español y se implementó desde cero, sin
 * dependencia externa (una librería de terceros para esto es una superficie
 * de auditoría injustificada para ~150 líneas de reglas fijas).
 *
 * Puro, sin Supabase — mismo nivel de pureza que packages/liquidation-engine
 * (D-14). Cubre 0 a 999.999.999.999 (novecientos noventa y nueve mil
 * millones), más que suficiente para cualquier monto de una copropiedad.
 */

const UNIDADES = [
  '',
  'un',
  'dos',
  'tres',
  'cuatro',
  'cinco',
  'seis',
  'siete',
  'ocho',
  'nueve',
] as const

const DIEZ_A_QUINCE = [
  'diez',
  'once',
  'doce',
  'trece',
  'catorce',
  'quince',
] as const

// 16-29: "dieci-"/"veinti-" se escriben pegados (RAE) — casos especiales
// fuera del patrón "X y Y" que rige de 31 en adelante.
const DIECISEIS_A_VEINTINUEVE: Record<number, string> = {
  16: 'dieciséis',
  17: 'diecisiete',
  18: 'dieciocho',
  19: 'diecinueve',
  20: 'veinte',
  21: 'veintiún',
  22: 'veintidós',
  23: 'veintitrés',
  24: 'veinticuatro',
  25: 'veinticinco',
  26: 'veintiséis',
  27: 'veintisiete',
  28: 'veintiocho',
  29: 'veintinueve',
}

const DECENAS: Record<number, string> = {
  3: 'treinta',
  4: 'cuarenta',
  5: 'cincuenta',
  6: 'sesenta',
  7: 'setenta',
  8: 'ochenta',
  9: 'noventa',
}

// 100 exacto es "cien"; 101-199 es "ciento X" (apócope clásico del español).
const CENTENAS: Record<number, string> = {
  1: 'ciento',
  2: 'doscientos',
  3: 'trescientos',
  4: 'cuatrocientos',
  5: 'quinientos',
  6: 'seiscientos',
  7: 'setecientos',
  8: 'ochocientos',
  9: 'novecientos',
}

/** Convierte 0-999 a letras. Recibe siempre un entero en ese rango. */
function grupoATresDigitos(n: number): string {
  if (n === 0) return ''
  if (n === 100) return 'cien'

  const centena = Math.floor(n / 100)
  const resto = n % 100
  const partes: string[] = []

  if (centena > 0) partes.push(CENTENAS[centena] as string)

  if (resto > 0) {
    if (resto <= 9) {
      partes.push(UNIDADES[resto] as string)
    } else if (resto <= 15) {
      partes.push(DIEZ_A_QUINCE[resto - 10] as string)
    } else if (resto <= 29) {
      partes.push(DIECISEIS_A_VEINTINUEVE[resto] as string)
    } else {
      const decena = Math.floor(resto / 10)
      const unidad = resto % 10
      const textoDecena = DECENAS[decena] as string
      partes.push(unidad === 0 ? textoDecena : `${textoDecena} y ${UNIDADES[unidad]}`)
    }
  }

  return partes.join(' ')
}

/** "un"/"veintiún" pierden la tilde/apócope cuando anteceden un sustantivo
 * femenino ("una casa"), pero mil/millón son masculinos — sin cambios aquí.
 * Se deja como función propia por si un futuro llamador necesita el caso
 * femenino; hoy no aplica (pesos es masculino). */
function conMil(grupo: number, texto: string): string {
  if (grupo === 1) return 'mil'
  // "veintiún mil", "un mil" no se dice — mil no lleva "un" salvo compuesto
  // con centenas/decenas (veintiún mil sí es correcto: 21.000).
  return `${texto} mil`
}

/**
 * Entero no negativo → letras en español. `numeroEnteroALetras(1000000)`
 * → "un millón". Lanza si `n` no es un entero no negativo o excede el
 * rango soportado.
 */
export function numeroEnteroALetras(n: number): string {
  if (!Number.isInteger(n) || n < 0) {
    throw new Error(`numeroEnteroALetras: se esperaba un entero no negativo, recibido ${n}`)
  }
  if (n > 999_999_999_999) {
    throw new Error(`numeroEnteroALetras: ${n} excede el rango soportado (hasta 999.999.999.999)`)
  }
  if (n === 0) return 'cero'

  const millones = Math.floor(n / 1_000_000)
  const restoMillones = n % 1_000_000
  const miles = Math.floor(restoMillones / 1000)
  const centenas = restoMillones % 1000

  const partes: string[] = []

  if (millones > 0) {
    const textoMillones = grupoATresDigitos(millones)
    partes.push(millones === 1 ? 'un millón' : `${textoMillones} millones`)
  }

  if (miles > 0) {
    partes.push(conMil(miles, grupoATresDigitos(miles)))
  }

  if (centenas > 0) {
    partes.push(grupoATresDigitos(centenas))
  }

  return partes.join(' ')
}

/**
 * Monto en pesos colombianos, en letras, formato "moneda legal" — el mismo
 * que exige el mockup del recibo de caja: "Cien mil pesos M/CTE",
 * "Cien mil pesos con cincuenta centavos M/CTE" cuando hay centavos.
 * Redondea a centavos (2 decimales) antes de convertir — el ledger nunca
 * expone más precisión que esa (numeric(18,2) en toda la base).
 */
export function montoEnLetras(monto: number): string {
  if (!Number.isFinite(monto) || monto < 0) {
    throw new Error(`montoEnLetras: se esperaba un monto no negativo, recibido ${monto}`)
  }
  // Evita el error de coma flotante de 0.1+0.2: se opera en centavos enteros.
  const centavosTotal = Math.round(monto * 100)
  const pesos = Math.floor(centavosTotal / 100)
  const centavos = centavosTotal % 100

  const primera = numeroEnteroALetras(pesos)
  const textoPesos = `${primera[0]!.toUpperCase()}${primera.slice(1)} ${pesos === 1 ? 'peso' : 'pesos'}`

  if (centavos === 0) {
    return `${textoPesos} M/CTE`
  }
  const textoCentavos = numeroEnteroALetras(centavos)
  return `${textoPesos} con ${textoCentavos} ${centavos === 1 ? 'centavo' : 'centavos'} M/CTE`
}
