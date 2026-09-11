import { assertEquals } from 'jsr:@std/assert@^1'
import { agruparAvisosAlcance } from './avisos_alcance.ts'

Deno.test('agruparAvisosAlcance(): sin avisos, arreglo vacío', () => {
  assertEquals(agruparAvisosAlcance([]), [])
})

Deno.test('agruparAvisosAlcance(): un solo aviso produce un solo hallazgo con ese inmueble contado', () => {
  const resultado = agruparAvisosAlcance([
    { conceptoCodigo: 'VIGILANCIA_COMERCIAL', inmuebleId: 'inm-1', campos: ['uso_predio'] },
  ])
  assertEquals(resultado.length, 1)
  assertEquals(resultado[0]?.codigo, 'ALCANCE_DATO_SIN_CLASIFICAR_VIGILANCIA_COMERCIAL')
  assertEquals(resultado[0]?.titulo.startsWith('1 inmueble(s)'), true)
  assertEquals(resultado[0]?.detalle.includes('uso_predio'), true)
})

Deno.test('agruparAvisosAlcance(): varios inmuebles del mismo concepto se cuentan, no se listan uno a uno', () => {
  const resultado = agruparAvisosAlcance([
    { conceptoCodigo: 'ASEO_RESIDENCIAL', inmuebleId: 'a', campos: ['tipo_inmueble'] },
    { conceptoCodigo: 'ASEO_RESIDENCIAL', inmuebleId: 'b', campos: ['tipo_inmueble'] },
    { conceptoCodigo: 'ASEO_RESIDENCIAL', inmuebleId: 'c', campos: ['tipo_inmueble'] },
  ])
  assertEquals(resultado.length, 1)
  assertEquals(resultado[0]?.titulo.startsWith('3 inmueble(s)'), true)
})

Deno.test('agruparAvisosAlcance(): conceptos distintos producen hallazgos separados, ordenados por código', () => {
  const resultado = agruparAvisosAlcance([
    { conceptoCodigo: 'VIGILANCIA_COMERCIAL', inmuebleId: 'a', campos: ['agrupacion'] },
    { conceptoCodigo: 'ASEO_RESIDENCIAL', inmuebleId: 'b', campos: ['tipo_inmueble'] },
  ])
  assertEquals(resultado.length, 2)
  assertEquals(resultado[0]?.codigo, 'ALCANCE_DATO_SIN_CLASIFICAR_ASEO_RESIDENCIAL')
  assertEquals(resultado[1]?.codigo, 'ALCANCE_DATO_SIN_CLASIFICAR_VIGILANCIA_COMERCIAL')
})

Deno.test('agruparAvisosAlcance(): un inmueble sin datos en dos campos distintos los une sin duplicar', () => {
  const resultado = agruparAvisosAlcance([
    { conceptoCodigo: 'C1', inmuebleId: 'a', campos: ['uso_predio', 'tipo_inmueble'] },
    { conceptoCodigo: 'C1', inmuebleId: 'b', campos: ['uso_predio'] },
  ])
  assertEquals(resultado.length, 1)
  assertEquals(resultado[0]?.detalle.includes('tipo_inmueble'), true)
  assertEquals(resultado[0]?.detalle.includes('uso_predio'), true)
  // sin duplicar "uso_predio" — cuenta las comas, no solo si el texto aparece.
  const ocurrencias = (resultado[0]?.detalle.match(/uso_predio/g) ?? []).length
  assertEquals(ocurrencias, 1)
})
