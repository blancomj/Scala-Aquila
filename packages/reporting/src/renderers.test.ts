import { describe, expect, it } from 'vitest'
import { aCsv, escaparCampo } from './csv.js'
import { construirDocumento, orientacionSugerida } from './documento.js'
import { formatearFecha, formatearValor, selloDeGeneracion, valorParaHoja } from './formato.js'
import { construirHoja, nombreArchivo, nombreHojaValido, totalesDe } from './hoja.js'
import {
  definicionEjecutable,
  parametrosSinValor,
  resolverFiltros,
  type DefinicionReporte,
} from './definicion.js'
import type { ColumnaReporte, EncabezadoReporte, FilaReporte } from './tipos.js'

const COLUMNAS: ColumnaReporte[] = [
  { clave: 'inmueble', etiqueta: 'Inmueble', tipo: 'texto' },
  { clave: 'fecha_pago', etiqueta: 'Fecha de pago', tipo: 'fecha' },
  { clave: 'monto', etiqueta: 'Valor recaudado', tipo: 'dinero' },
  { clave: 'dias', etiqueta: 'Días de mora', tipo: 'numero' },
  { clave: 'anulado', etiqueta: 'Anulado', tipo: 'booleano' },
]

const FILAS: FilaReporte[] = [
  { inmueble: 'T1-01', fecha_pago: '2026-09-01', monto: 450000, dias: 5, anulado: false },
  { inmueble: 'T4-05', fecha_pago: '2026-09-12', monto: 1280000, dias: 97, anulado: true },
]

const ENCABEZADO: EncabezadoReporte = {
  titulo: 'Recaudos del período',
  copropiedad: 'Altos del Parque',
  version: 3,
  generadoEn: new Date(2026, 8, 15, 10, 30),
  parametros: { Desde: '01/09/2026', Hasta: '15/09/2026' },
}

describe('formato', () => {
  it('formatea según el tipo declarado, no según lo que parezca el valor', () => {
    // Un código de inmueble que parece número sigue siendo texto: si se
    // tratara como número perdería el cero de la izquierda.
    expect(formatearValor('0102', 'texto')).toBe('0102')
    expect(formatearValor(450000, 'dinero')).toContain('450.000')
    expect(formatearValor(97, 'numero')).toBe('97')
    expect(formatearValor(12.5, 'porcentaje')).toBe('12,5 %')
    expect(formatearValor(true, 'booleano')).toBe('Sí')
    expect(formatearValor(false, 'booleano')).toBe('No')
  })

  it('muestra un guion para los vacíos, pero no para el cero ni para false', () => {
    expect(formatearValor(null, 'dinero')).toBe('—')
    expect(formatearValor(undefined, 'texto')).toBe('—')
    expect(formatearValor('', 'texto')).toBe('—')
    // Un saldo de cero es información, no ausencia de dato.
    expect(formatearValor(0, 'dinero')).toContain('0')
    expect(formatearValor(false, 'booleano')).toBe('No')
  })

  it('no retrocede un día al formatear una fecha de Postgres', () => {
    // Con `new Date('2026-09-01')` y hora local de Bogotá (UTC-5), esto
    // imprimiría 31/08/2026. Es el bug clásico de fechas sin hora.
    expect(formatearFecha('2026-09-01')).toBe('01/09/2026')
    expect(formatearFecha('2026-01-31')).toBe('31/01/2026')
  })

  it('manda los números a la hoja como números, no como texto formateado', () => {
    // Exportar «$ 450.000» produce una columna que Excel no suma.
    expect(valorParaHoja(450000, 'dinero')).toBe(450000)
    expect(valorParaHoja('97', 'numero')).toBe(97)
    expect(valorParaHoja(null, 'dinero')).toBeNull()
    expect(valorParaHoja('T1-01', 'texto')).toBe('T1-01')
  })
})

describe('csv', () => {
  it('escapa separador, comillas y saltos de línea (RFC 4180)', () => {
    expect(escaparCampo('simple', ';')).toBe('simple')
    expect(escaparCampo('con;separador', ';')).toBe('"con;separador"')
    expect(escaparCampo('con "comillas"', ';')).toBe('"con ""comillas"""')
    expect(escaparCampo('dos\nlíneas', ';')).toBe('"dos\nlíneas"')
  })

  it('lleva BOM y separador que Excel en español entiende', () => {
    const csv = aCsv(COLUMNAS, FILAS)
    expect(csv.startsWith('﻿')).toBe(true)
    expect(csv).toContain('Inmueble;Fecha de pago;Valor recaudado')
    expect(csv).toContain('\r\n')
  })

  it('exporta el dato, no su presentación', () => {
    const csv = aCsv(COLUMNAS, FILAS)
    expect(csv).toContain('450000')
    expect(csv).not.toContain('$ 450.000')
  })

  it('respeta un separador distinto si se pide', () => {
    const csv = aCsv(COLUMNAS, FILAS, { separador: ',', bom: false })
    expect(csv.startsWith('﻿')).toBe(false)
    expect(csv.split('\r\n')[0]).toBe('Inmueble,Fecha de pago,Valor recaudado,Días de mora,Anulado')
  })
})

describe('hoja', () => {
  it('pone los metadatos antes de la tabla y dice dónde empieza', () => {
    const hoja = construirHoja(COLUMNAS, FILAS, ENCABEZADO)
    expect(hoja.celdas[0]).toEqual(['Recaudos del período'])
    expect(hoja.celdas[1]).toEqual(['Copropiedad: Altos del Parque'])
    expect(hoja.celdas.some((f) => String(f[0]).startsWith('Desde:'))).toBe(true)
    expect(hoja.celdas[hoja.filaEncabezados]).toEqual([
      'Inmueble',
      'Fecha de pago',
      'Valor recaudado',
      'Días de mora',
      'Anulado',
    ])
  })

  it('puede omitir el encabezado para un archivo que solo lleva datos', () => {
    const hoja = construirHoja(COLUMNAS, FILAS, ENCABEZADO, { incluirEncabezado: false })
    expect(hoja.filaEncabezados).toBe(0)
    expect(hoja.celdas[0]?.[0]).toBe('Inmueble')
  })

  it('recorta el nombre de hoja a lo que Excel admite', () => {
    expect(nombreHojaValido('Cartera: por/inmueble*')).toBe('Cartera  por inmueble')
    expect(nombreHojaValido('x'.repeat(50))).toHaveLength(31)
    expect(nombreHojaValido('   ')).toBe('Reporte')
  })

  it('nombra el archivo sin acentos y con la fecha', () => {
    expect(nombreArchivo('Cartera por antigüedad', 'xlsx', new Date(2026, 8, 15))).toBe(
      'cartera-por-antiguedad-2026-09-15.xlsx',
    )
  })

  it('totaliza solo lo que tiene sentido sumar', () => {
    const totales = totalesDe(COLUMNAS, FILAS)
    expect(totales.monto).toBe(1730000)
    expect(totales.dias).toBe(102)
    // Sumar fechas, textos o booleanos no significa nada.
    expect(totales.inmueble).toBeUndefined()
    expect(totales.fecha_pago).toBeUndefined()
    expect(totales.anulado).toBeUndefined()
  })
})

describe('documento', () => {
  it('gira a horizontal cuando hay columnas de sobra', () => {
    expect(orientacionSugerida(4)).toBe('portrait')
    expect(orientacionSugerida(9)).toBe('landscape')
  })

  it('identifica la ejecución en el encabezado (§95)', () => {
    const doc = construirDocumento(COLUMNAS, FILAS, ENCABEZADO)
    const textos = JSON.stringify(doc.content)
    expect(textos).toContain('Recaudos del período')
    expect(textos).toContain('Altos del Parque')
    expect(textos).toContain('Versión del reporte: 3')
    expect(textos).toContain('Desde: 01/09/2026')
  })

  it('cierra la tabla con los totales de las columnas numéricas', () => {
    const doc = construirDocumento(COLUMNAS, FILAS, ENCABEZADO)
    const tabla = doc.content.find(
      (bloque): bloque is { table: { body: unknown[][] } } =>
        typeof bloque === 'object' && bloque !== null && 'table' in bloque,
    )
    const ultima = tabla!.table.body.at(-1) as { text: string }[]
    expect(ultima[0]!.text).toBe('Total')
    expect(ultima[2]!.text).toContain('1.730.000')
  })

  it('no inventa una fila de totales cuando no hay filas', () => {
    const doc = construirDocumento(COLUMNAS, [], ENCABEZADO)
    const tabla = doc.content.find(
      (bloque): bloque is { table: { body: unknown[][] } } =>
        typeof bloque === 'object' && bloque !== null && 'table' in bloque,
    )
    expect(tabla!.table.body).toHaveLength(1)
    expect(JSON.stringify(doc.content)).toContain('0 registros')
  })
})

describe('resolución de parámetros (RPT-05)', () => {
  const DEFINICION: DefinicionReporte = {
    fuente: 'recaudos',
    campos: [{ campo: 'fecha_pago' }, { campo: 'monto' }],
    filtros: [
      { campo: 'fecha_pago', operador: 'entre', parametro_desde: 'desde', parametro_hasta: 'hasta' },
      { campo: 'forma_pago', operador: 'igual', parametro: 'forma' },
      { campo: 'es_anulacion', operador: 'igual', valor: false },
    ],
    parametros: [
      { codigo: 'desde', etiqueta: 'Desde', tipo: 'fecha', requerido: true },
      { codigo: 'hasta', etiqueta: 'Hasta', tipo: 'fecha', requerido: true },
      { codigo: 'forma', etiqueta: 'Forma de pago', tipo: 'texto', requerido: false },
    ],
  }

  const VALORES = { desde: '2026-01-01', hasta: '2026-12-31', forma: 'Efectivo' }

  // Este es el caso que se escapó: el despachador mandaba la definición
  // cruda y el compilador, que solo entiende `desde`/`hasta`, no devolvía
  // ninguna fila. No fallaba: entregaba un informe vacío.
  it('un rango convierte sus referencias en valores', () => {
    const [rango] = resolverFiltros(DEFINICION, VALORES)
    expect(rango).toEqual({
      campo: 'fecha_pago',
      operador: 'entre',
      desde: '2026-01-01',
      hasta: '2026-12-31',
    })
    expect(rango).not.toHaveProperty('parametro_desde')
  })

  it('un filtro de un solo valor también', () => {
    expect(resolverFiltros(DEFINICION, VALORES)[1]).toEqual({
      campo: 'forma_pago',
      operador: 'igual',
      valor: 'Efectivo',
    })
  })

  it('un filtro fijo se devuelve intacto', () => {
    expect(resolverFiltros(DEFINICION, VALORES)[2]).toEqual({
      campo: 'es_anulacion',
      operador: 'igual',
      valor: false,
    })
  })

  it('la definición ejecutable conserva todo lo demás', () => {
    const lista = definicionEjecutable(DEFINICION, VALORES)
    expect(lista.fuente).toBe('recaudos')
    expect(lista.campos).toEqual(DEFINICION.campos)
    expect(lista.filtros?.[0]).toHaveProperty('desde', '2026-01-01')
  })

  it('delata los parámetros obligatorios sin valor', () => {
    expect(parametrosSinValor(DEFINICION, { forma: 'Efectivo' })).toEqual(['desde', 'hasta'])
    expect(parametrosSinValor(DEFINICION, VALORES)).toEqual([])
  })
})

describe('sello de generación con zona horaria (RPT-05)', () => {
  // Un instante fijo: 16/09/2026 04:25 UTC = 15/09/2026 23:25 en Bogotá.
  const INSTANTE = new Date('2026-09-16T04:25:00Z')

  // Es el fallo que se vio en la primera entrega programada real: el
  // servidor corre en UTC y el archivo salió sellado «4:25 a. m.» cuando en
  // la copropiedad eran las 11:25 de la noche anterior. El mismo reporte
  // decía una hora en el navegador y otra por correo.
  it('sella la hora de la copropiedad, no la del servidor', () => {
    const enBogota = selloDeGeneracion(INSTANTE, 'America/Bogota')
    expect(enBogota).toContain('15/9/2026')
    expect(enBogota).toContain('11:25')
  })

  it('sin zona usa la del entorno, que es el comportamiento del navegador', () => {
    expect(selloDeGeneracion(INSTANTE)).toBe(INSTANTE.toLocaleString('es-CO'))
  })

  it('la hoja lleva ese sello al encabezado', () => {
    const hoja = construirHoja(COLUMNAS, FILAS, {
      titulo: 'Recaudos',
      copropiedad: 'QA',
      generadoEn: INSTANTE,
      zonaHoraria: 'America/Bogota',
    })
    const generado = hoja.celdas.flat().find((c) => String(c).startsWith('Generado:'))
    expect(generado).toContain('15/9/2026')
  })
})
