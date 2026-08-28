/**
 * Parsers de extracto bancario — funciones puras, sin Supabase, mismo nivel
 * de pureza que cartera.ts/cartera-escalamiento.ts (D-14, REC-CAR-009).
 *
 * §5.1 del prompt de Fase 3 pide "empieza por uno o dos bancos reales" y
 * fixtures reales en los tests. NO TENGO UN EXTRACTO REAL DE BANCOLOMBIA NI
 * DE DAVIVIENDA — el usuario, preguntado explícitamente, eligió construir
 * `parserBancolombia` contra el formato CSV público típico (columnas
 * Fecha/Descripción/Valor) con un fixture SINTÉTICO, marcado aquí y en
 * DECISIONES.md como NO VERIFICADO contra un archivo real. Mismo criterio
 * que los descriptores de PayU/ePayco/Bold en fases previas: la mecánica
 * (detección, hash, idempotencia) queda probada; el formato exacto de
 * columnas queda pendiente de confirmar antes de producción.
 */
import { createHash } from 'node:crypto'

export interface LineaCruda {
  readonly fechaMovimiento: string // YYYY-MM-DD
  readonly monto: number // positivo = crédito, negativo = débito — en pesos, no centavos
  readonly descripcionBanco: string
  readonly referenciaBanco: string | null
}

export interface ParserExtracto {
  /** Código de lista_tipos ENTIDAD_FINANCIERA (20260822170000) al que corresponde este parser. */
  readonly entidadCodigo: string
  readonly nombre: string
  /** ¿Este contenido es de este banco? Debe ser barato — se llama contra
   *  cada parser registrado hasta encontrar uno que reconozca el archivo. */
  detecta(contenido: string): boolean
  parsea(contenido: string): readonly LineaCruda[]
}

const PATRON_FECHA_DDMMYYYY = /^(\d{2})\/(\d{2})\/(\d{4})$/

function fechaAIso(fecha: string): string {
  const m = PATRON_FECHA_DDMMYYYY.exec(fecha.trim())
  if (!m) throw new Error(`Fecha de extracto no reconocida: "${fecha}" (se esperaba DD/MM/AAAA).`)
  const [, dia, mes, anio] = m
  return `${anio}-${mes}-${dia}`
}

/** Parseo de una línea CSV con comillas dobles opcionales — sin dependencia
 *  externa: el formato es simple (sin comas dentro de campos citados que
 *  contengan comillas escapadas), así que no se justifica una librería. */
function parsearLineaCsv(linea: string): string[] {
  const campos: string[] = []
  let actual = ''
  let dentroDeComillas = false
  for (let i = 0; i < linea.length; i++) {
    const c = linea[i]
    if (c === '"') {
      dentroDeComillas = !dentroDeComillas
    } else if (c === ',' && !dentroDeComillas) {
      campos.push(actual.trim())
      actual = ''
    } else {
      actual += c
    }
  }
  campos.push(actual.trim())
  return campos
}

/**
 * TODO(verificar antes de producción): formato ASUMIDO, no confirmado contra
 * un extracto real de Bancolombia. Se asume CSV con encabezado
 * "Fecha,Descripción,Referencia,Valor" (o variantes de mayúsculas/acentos),
 * fecha DD/MM/AAAA, valor con separador de miles "." y decimal ",", como es
 * convención colombiana — un débito viene con signo negativo o entre
 * paréntesis.
 */
export const parserBancolombia: ParserExtracto = {
  entidadCodigo: 'bancolombia',
  nombre: 'Bancolombia',
  detecta(contenido) {
    const primeraLinea = (contenido.split(/\r?\n/)[0] ?? '').toLowerCase()
    return (
      primeraLinea.includes('fecha') &&
      primeraLinea.includes('descripci') &&
      primeraLinea.includes('valor')
    )
  },
  parsea(contenido) {
    const lineas = contenido.split(/\r?\n/).filter((l) => l.trim().length > 0)
    if (lineas.length < 2) return []

    const encabezado = parsearLineaCsv(lineas[0] as string).map((h) => h.toLowerCase())
    const idxFecha = encabezado.findIndex((h) => h.includes('fecha'))
    const idxDescripcion = encabezado.findIndex((h) => h.includes('descripci'))
    const idxReferencia = encabezado.findIndex((h) => h.includes('referencia'))
    const idxValor = encabezado.findIndex((h) => h.includes('valor'))

    if (idxFecha === -1 || idxDescripcion === -1 || idxValor === -1) {
      throw new Error(
        'Extracto de Bancolombia sin las columnas esperadas (Fecha/Descripción/Valor). ' +
          `Encabezado encontrado: ${encabezado.join(', ')}.`,
      )
    }

    return lineas.slice(1).map((linea, indice): LineaCruda => {
      const campos = parsearLineaCsv(linea)
      const crudoValor = (campos[idxValor] ?? '').replace(/[."]/g, '').replace(',', '.')
      const monto = Number(crudoValor)
      if (!Number.isFinite(monto)) {
        throw new Error(
          `Línea ${indice + 2} del extracto: valor no numérico "${campos[idxValor] ?? ''}".`,
        )
      }
      return {
        fechaMovimiento: fechaAIso(campos[idxFecha] ?? ''),
        monto,
        descripcionBanco: campos[idxDescripcion] ?? '',
        referenciaBanco: idxReferencia !== -1 ? (campos[idxReferencia]?.trim() || null) : null,
      }
    })
  },
}

const PARSERS_REGISTRADOS: readonly ParserExtracto[] = [parserBancolombia]

/** Agregar un banco nuevo es agregar un archivo al array de arriba, no un
 *  cambio estructural (§5.1). */
export function detectarParser(contenido: string): ParserExtracto | null {
  return PARSERS_REGISTRADOS.find((p) => p.detecta(contenido)) ?? null
}

export function formatosSoportados(): readonly string[] {
  return PARSERS_REGISTRADOS.map((p) => p.nombre)
}

// ── Idempotencia: dos niveles de hash ───────────────────────────────────

/** SHA-256 del contenido crudo completo del archivo — reimportar el mismo
 *  archivo no hace nada (extracto_bancario_hash_unico). */
export function hashArchivo(contenidoCrudo: string): string {
  return createHash('sha256').update(contenidoCrudo, 'utf8').digest('hex')
}

/**
 * SHA-256 de EXACTAMENTE estos 4 campos, en este orden, normalizados:
 * fecha_movimiento + monto (con 2 decimales fijos, nunca notación float) +
 * descripción (trim + colapso de espacios, sin tocar mayúsculas para no
 * perder información) + referencia (o cadena vacía si no hay).
 *
 * Esta definición está documentada aquí Y en el COMMENT ON COLUMN de
 * extracto_linea.hash_linea (20260904170000) a propósito: si alguien la
 * cambia, los hashes viejos dejan de coincidir y un extracto ya importado se
 * duplica por completo la próxima vez que se suba. Cambiarla es una decisión
 * que hay que poder auditar, no un refactor silencioso.
 */
export function hashLinea(linea: LineaCruda): string {
  const descripcionNormalizada = linea.descripcionBanco.trim().replace(/\s+/g, ' ')
  const montoNormalizado = linea.monto.toFixed(2)
  const clave = [
    linea.fechaMovimiento,
    montoNormalizado,
    descripcionNormalizada,
    linea.referenciaBanco ?? '',
  ].join('|')
  return createHash('sha256').update(clave, 'utf8').digest('hex')
}
