/**
 * Prueba de equivalencia antes de migrar un exportador (RPT-03, §88 del
 * prompt: "no retirar exportadores existentes hasta demostrar equivalencia").
 *
 * El exportador de `recaudo/index.vue` es el primero que pasa al renderer
 * común. Aquí se reproduce EXACTAMENTE lo que construía a mano y se compara
 * con lo que produce `construirHoja`, columna por columna y celda por celda.
 * Si el renderer cambiara el orden, perdiera una columna o convirtiera un
 * monto en texto, este test lo dice antes de que nadie abra el archivo.
 *
 * Diferencia esperada y querida: la salida nueva antepone metadatos (título,
 * copropiedad, parámetros, fecha de generación). Por eso la comparación
 * empieza en `filaEncabezados`, no en la fila 0 — lo que se compara es la
 * tabla, no la cabecera que el exportador viejo no tenía.
 */
import { describe, expect, it } from 'vitest'
import { construirHoja, type ColumnaReporte, type FilaReporte } from '@aquila/reporting'

/** Forma real de una fila de `recaudoStore.pagos` (solo lo que se exporta). */
interface PagoRecaudo {
  fecha_pago: string
  inmueble_codigo: string
  inmueble_agrupacion_id: string | null
  monto: string | number
  forma_pago_nombre: string | null
  recibo_folio: string | null
  es_reversa: boolean
  esta_anulado: boolean
  comprobante_nombre_archivo: string | null
}

const PAGOS: PagoRecaudo[] = [
  {
    fecha_pago: '2026-09-01',
    inmueble_codigo: 'T1-01',
    inmueble_agrupacion_id: 'agr-1',
    monto: '450000.00',
    forma_pago_nombre: 'Transferencia bancaria',
    recibo_folio: 'RC-0001',
    es_reversa: false,
    esta_anulado: false,
    comprobante_nombre_archivo: 'soporte.pdf',
  },
  {
    fecha_pago: '2026-09-12',
    inmueble_codigo: 'T4-05',
    inmueble_agrupacion_id: null,
    monto: 1280000,
    forma_pago_nombre: null,
    recibo_folio: null,
    es_reversa: true,
    esta_anulado: false,
    comprobante_nombre_archivo: null,
  },
]

const RUTAS = new Map([['agr-1', 'Torre 1 › Piso 1']])
function ubicacionDe(agrupacionId: string | null): string {
  if (!agrupacionId) return 'Sin agrupar'
  return RUTAS.get(agrupacionId) ?? 'Sin agrupar'
}

function estadoDe(pago: PagoRecaudo): string {
  return pago.es_reversa ? 'Reversa' : pago.esta_anulado ? 'Anulado' : 'Vigente'
}

/** El exportador tal como estaba escrito en la página, copiado literal. */
function hojaAntigua(): unknown[][] {
  const encabezados = [
    'Fecha',
    'Inmueble',
    'Ubicación',
    'Monto',
    'Forma de pago',
    'Recibo',
    'Estado',
    'Comprobante',
  ]
  const filas = PAGOS.map((p) => [
    p.fecha_pago,
    p.inmueble_codigo,
    ubicacionDe(p.inmueble_agrupacion_id),
    Number(p.monto),
    p.forma_pago_nombre ?? '',
    p.recibo_folio ?? '',
    estadoDe(p),
    p.comprobante_nombre_archivo ?? '',
  ])
  return [encabezados, ...filas]
}

// Las mismas ocho columnas, ahora declaradas con su tipo.
const COLUMNAS: ColumnaReporte[] = [
  { clave: 'fecha', etiqueta: 'Fecha', tipo: 'fecha' },
  { clave: 'inmueble', etiqueta: 'Inmueble', tipo: 'texto' },
  { clave: 'ubicacion', etiqueta: 'Ubicación', tipo: 'texto' },
  { clave: 'monto', etiqueta: 'Monto', tipo: 'dinero' },
  { clave: 'forma_pago', etiqueta: 'Forma de pago', tipo: 'texto' },
  { clave: 'recibo', etiqueta: 'Recibo', tipo: 'texto' },
  { clave: 'estado', etiqueta: 'Estado', tipo: 'texto' },
  { clave: 'comprobante', etiqueta: 'Comprobante', tipo: 'texto' },
]

function filasNuevas(): FilaReporte[] {
  return PAGOS.map((p) => ({
    fecha: p.fecha_pago,
    inmueble: p.inmueble_codigo,
    ubicacion: ubicacionDe(p.inmueble_agrupacion_id),
    monto: Number(p.monto),
    forma_pago: p.forma_pago_nombre ?? '',
    recibo: p.recibo_folio ?? '',
    estado: estadoDe(p),
    comprobante: p.comprobante_nombre_archivo ?? '',
  }))
}

/** `fecha_pago` de cada pago, como se espera leerla en la hoja. */
const FECHAS_FORMATEADAS = ['01/09/2026', '12/09/2026']

describe('equivalencia del exportador de Recaudo (§88)', () => {
  const antigua = hojaAntigua()
  const nueva = construirHoja(COLUMNAS, filasNuevas(), {
    titulo: 'Recaudo',
    copropiedad: 'Altos del Parque',
    generadoEn: new Date(2026, 8, 15),
  })
  const tabla = nueva.celdas.slice(nueva.filaEncabezados)

  it('mismos títulos de columna, en el mismo orden', () => {
    expect(tabla[0]).toEqual(antigua[0])
  })

  it('mismo número de filas', () => {
    expect(tabla).toHaveLength(antigua.length)
  })

  it('mismo contenido celda por celda, con una excepción declarada', () => {
    for (let fila = 1; fila < antigua.length; fila += 1) {
      for (let col = 0; col < antigua[0]!.length; col += 1) {
        const esperado = antigua[fila]![col]
        const obtenido = tabla[fila]![col]

        // La única diferencia querida: la fecha ya no viaja como el texto
        // crudo de Postgres ('2026-09-01') sino formateada ('01/09/2026'),
        // que es lo que el usuario espera leer en Excel.
        if (col === 0) {
          expect(obtenido).toBe(FECHAS_FORMATEADAS[fila - 1])
          continue
        }

        // El vacío pasa de '' a null: en Excel una celda nula se ve igual y
        // no se confunde con una cadena vacía real.
        if (esperado === '') {
          expect(obtenido).toBeNull()
          continue
        }

        expect(obtenido).toEqual(esperado)
      }
    }
  })

  it('los montos siguen siendo números, no texto', () => {
    // Si esto se rompiera, la columna dejaría de sumar en Excel — el error
    // exacto que §30 del prompt señala como el más común.
    expect(typeof tabla[1]![3]).toBe('number')
    expect(tabla[1]![3]).toBe(450000)
    expect(tabla[2]![3]).toBe(1280000)
  })

  it('conserva los anchos de columna que la hoja necesita', () => {
    expect(nueva.anchos).toHaveLength(COLUMNAS.length)
    // La columna de dinero no puede quedar estrecha: era `wch: 14` a mano.
    expect(nueva.anchos[3]).toBeGreaterThanOrEqual(14)
  })
})
