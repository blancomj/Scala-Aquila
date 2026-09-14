import { describe, expect, it } from 'vitest'
import { money } from '@aquila/financial-kernel'
import * as fos from '@aquila/financial-kernel'
import { calcularVariacionCartera, explicarVariacionCartera, type FilaVariacionCartera } from './cartera-variacion.js'

/**
 * Las filas imitan lo que fn_variacion_cartera devuelve: un inmueble ya
 * comparado entre los dos cortes. El FULL OUTER JOIN y el conteo de
 * eventos son responsabilidad de SQL (DB-first), así que aquí no se
 * prueban dos listas de cortes sino el armado sobre filas ya comparadas.
 */
function fila(over: Partial<FilaVariacionCartera> & { inmuebleId: string }): FilaVariacionCartera {
  const cero = money(0, 'COP')
  return {
    codigo: over.inmuebleId,
    vencidaAnterior: cero,
    vencidaActual: cero,
    totalAnterior: cero,
    totalActual: cero,
    corrienteAnterior: cero,
    corrienteActual: cero,
    sinVencimientoAnterior: cero,
    sinVencimientoActual: cero,
    interesAnterior: cero,
    interesActual: cero,
    diasMoraMaximo: 0,
    etapaCobranza: 'preventiva',
    eventosEnPeriodo: 0,
    ...over,
  }
}

describe('calcularVariacionCartera', () => {
  it('sin filas: todo en cero y el porcentaje es null, no 0%', () => {
    const resultado = calcularVariacionCartera([], 'COP')

    expect(resultado.vencida.delta).toEqual(money(0, 'COP'))
    // REC-CAR-004: sin base de comparación es indeterminado, no "no cambió".
    expect(resultado.vencida.pctCambio).toBeNull()
    expect(resultado.contribuyentes).toHaveLength(0)
    expect(resultado.concentracion.pctDelIncremento).toBeNull()
    expect(resultado.inmueblesComparados).toBe(0)
  })

  it('el delta total es la suma de los deltas por inmueble', () => {
    const resultado = calcularVariacionCartera(
      [
        fila({
          inmuebleId: 'i1',
          vencidaAnterior: money(100_000, 'COP'),
          vencidaActual: money(180_000, 'COP'),
        }),
        fila({
          inmuebleId: 'i2',
          vencidaAnterior: money(50_000, 'COP'),
          vencidaActual: money(20_000, 'COP'),
        }),
        fila({ inmuebleId: 'i3', vencidaActual: money(30_000, 'COP') }),
      ],
      'COP',
    )

    // 150.000 → 230.000
    expect(resultado.vencida.anterior).toEqual(money(150_000, 'COP'))
    expect(resultado.vencida.actual).toEqual(money(230_000, 'COP'))
    expect(resultado.vencida.delta).toEqual(money(80_000, 'COP'))
  })

  it('separa incremento bruto de reducción bruta: el neto esconde el movimiento real', () => {
    const resultado = calcularVariacionCartera(
      [
        fila({
          inmuebleId: 'sube',
          vencidaAnterior: money(10_000, 'COP'),
          vencidaActual: money(60_000, 'COP'),
        }),
        fila({
          inmuebleId: 'baja',
          vencidaAnterior: money(90_000, 'COP'),
          vencidaActual: money(40_000, 'COP'),
        }),
      ],
      'COP',
    )

    // Neto 0, pero se movieron 50.000 en cada dirección.
    expect(resultado.vencida.delta).toEqual(money(0, 'COP'))
    expect(resultado.incrementoBruto).toEqual(money(50_000, 'COP'))
    expect(resultado.reduccionBruta).toEqual(money(50_000, 'COP'))
  })

  it('clasifica nuevo, empeoró, mejoró y resuelto', () => {
    const resultado = calcularVariacionCartera(
      [
        fila({ inmuebleId: 'nuevo', vencidaActual: money(25_000, 'COP') }),
        fila({
          inmuebleId: 'empeoro',
          vencidaAnterior: money(10_000, 'COP'),
          vencidaActual: money(40_000, 'COP'),
        }),
        fila({
          inmuebleId: 'mejoro',
          vencidaAnterior: money(80_000, 'COP'),
          vencidaActual: money(30_000, 'COP'),
        }),
        fila({ inmuebleId: 'resuelto', vencidaAnterior: money(40_000, 'COP') }),
      ],
      'COP',
    )

    expect(resultado.conteos).toEqual({
      nuevos: 1,
      empeoraron: 1,
      mejoraron: 1,
      resueltos: 1,
      sinCambio: 0,
    })
    // Solo los que subieron entran en la tabla de contribuyentes.
    expect(resultado.contribuyentes.map((c) => c.inmuebleId)).toEqual(['empeoro', 'nuevo'])
  })

  it('variación negativa: la cartera baja y el porcentaje es negativo', () => {
    const resultado = calcularVariacionCartera(
      [
        fila({
          inmuebleId: 'i1',
          vencidaAnterior: money(200_000, 'COP'),
          vencidaActual: money(150_000, 'COP'),
        }),
      ],
      'COP',
    )

    expect(resultado.vencida.delta).toEqual(money(-50_000, 'COP'))
    expect(resultado.vencida.pctCambio).toBeCloseTo(-25)
    expect(resultado.conteos.mejoraron).toBe(1)
  })

  it('GAP-CAR-001: lo sin vencimiento se compara aparte, nunca fundido en corriente', () => {
    const resultado = calcularVariacionCartera(
      [
        fila({
          inmuebleId: 'i1',
          totalAnterior: money(10_000, 'COP'),
          totalActual: money(70_000, 'COP'),
          sinVencimientoAnterior: money(10_000, 'COP'),
          sinVencimientoActual: money(70_000, 'COP'),
        }),
      ],
      'COP',
    )

    expect(resultado.sinVencimiento.delta).toEqual(money(60_000, 'COP'))
    expect(resultado.corriente.delta).toEqual(money(0, 'COP'))
    expect(resultado.vencida.delta).toEqual(money(0, 'COP'))
    expect(resultado.total.delta).toEqual(money(60_000, 'COP'))
  })

  it('concentración: se calcula sobre el incremento bruto, no sobre el neto', () => {
    const resultado = calcularVariacionCartera(
      [
        fila({ inmuebleId: 'a', vencidaActual: money(800_000, 'COP') }),
        fila({ inmuebleId: 'b', vencidaActual: money(150_000, 'COP') }),
        fila({ inmuebleId: 'c', vencidaActual: money(50_000, 'COP') }),
        fila({ inmuebleId: 'paga', vencidaAnterior: money(400_000, 'COP') }),
      ],
      'COP',
    )

    expect(resultado.incrementoBruto).toEqual(money(1_000_000, 'COP'))
    // 'a' solo ya cubre el 80% del millón que subió.
    expect(resultado.concentracion.inmuebles).toBe(1)
    expect(resultado.concentracion.monto).toEqual(money(800_000, 'COP'))
    expect(resultado.concentracion.pctDelIncremento).toBeCloseTo(80)
  })

  it('ordena los contribuyentes por delta descendente', () => {
    const resultado = calcularVariacionCartera(
      [
        fila({ inmuebleId: 'chico', vencidaActual: money(10_000, 'COP') }),
        fila({ inmuebleId: 'grande', vencidaActual: money(90_000, 'COP') }),
        fila({ inmuebleId: 'medio', vencidaActual: money(50_000, 'COP') }),
      ],
      'COP',
    )

    expect(resultado.contribuyentes.map((c) => c.inmuebleId)).toEqual(['grande', 'medio', 'chico'])
  })
})

describe('atribución por eventos', () => {
  it('el inmueble que empeoró sin ningún evento es residuo, y se informa', () => {
    const resultado = calcularVariacionCartera(
      [
        fila({ inmuebleId: 'con-evento', vencidaActual: money(70_000, 'COP'), eventosEnPeriodo: 3 }),
        fila({ inmuebleId: 'sin-evento', vencidaActual: money(30_000, 'COP'), eventosEnPeriodo: 0 }),
      ],
      'COP',
    )

    expect(resultado.atribucion.explicado.monto).toEqual(money(70_000, 'COP'))
    expect(resultado.atribucion.explicado.inmuebles).toBe(1)
    expect(resultado.atribucion.sinExplicar.monto).toEqual(money(30_000, 'COP'))
    expect(resultado.atribucion.sinExplicar.inmuebles).toBe(1)
    // Explicado + sin explicar = incremento bruto: nada se pierde ni se reparte.
    expect(fos.sumar(resultado.atribucion.explicado.monto, resultado.atribucion.sinExplicar.monto)).toEqual(
      resultado.incrementoBruto,
    )
  })

  it('los inmuebles que mejoraron no entran en la atribución del incremento', () => {
    const resultado = calcularVariacionCartera(
      [
        fila({
          inmuebleId: 'mejora',
          vencidaAnterior: money(80_000, 'COP'),
          vencidaActual: money(20_000, 'COP'),
          eventosEnPeriodo: 2,
        }),
      ],
      'COP',
    )

    expect(resultado.atribucion.explicado.monto).toEqual(money(0, 'COP'))
    expect(resultado.atribucion.sinExplicar.monto).toEqual(money(0, 'COP'))
  })
})

describe('explicarVariacionCartera', () => {
  const contexto = { fechaCorteAnterior: '2026-08-31', fechaCorteActual: '2026-09-30' }

  it('cada afirmación resuelve su evidencia a una entidad y fuente reales (§4 prompt O2)', () => {
    const variacion = calcularVariacionCartera(
      [fila({ inmuebleId: 'i1', vencidaAnterior: money(100_000, 'COP'), vencidaActual: money(180_000, 'COP') })],
      'COP',
    )
    const afirmaciones = explicarVariacionCartera(variacion, contexto)

    expect(afirmaciones.length).toBeGreaterThan(0)
    for (const a of afirmaciones) {
      expect(a.evidencia.entidad.length).toBeGreaterThan(0)
      expect(a.evidencia.fuente.length).toBeGreaterThan(0)
      expect(a.evidencia.fechaCorte).toBe(contexto.fechaCorteActual)
    }
  })

  it('titular: aumento se tipa "calculo" y usa el verbo correcto', () => {
    const variacion = calcularVariacionCartera(
      [fila({ inmuebleId: 'i1', vencidaAnterior: money(100_000, 'COP'), vencidaActual: money(180_000, 'COP') })],
      'COP',
    )
    const [titular] = explicarVariacionCartera(variacion, contexto)

    expect(titular?.tipo).toBe('calculo')
    expect(titular?.texto).toContain('aumentó')
    expect(titular?.texto).toContain('80000')
  })

  it('titular: reducción usa "se redujo", no "aumentó"', () => {
    const variacion = calcularVariacionCartera(
      [fila({ inmuebleId: 'i1', vencidaAnterior: money(100_000, 'COP'), vencidaActual: money(40_000, 'COP') })],
      'COP',
    )
    const [titular] = explicarVariacionCartera(variacion, contexto)

    expect(titular?.texto).toContain('se redujo')
    expect(titular?.texto).not.toContain('aumentó')
  })

  it('titular: sin cambio no afirma un delta que no ocurrió', () => {
    const variacion = calcularVariacionCartera(
      [fila({ inmuebleId: 'i1', vencidaAnterior: money(100_000, 'COP'), vencidaActual: money(100_000, 'COP') })],
      'COP',
    )
    const [titular] = explicarVariacionCartera(variacion, contexto)

    expect(titular?.texto).toBe('La cartera vencida no cambió entre 2026-08-31 y 2026-09-30.')
  })

  it('concentración: se tipa "inferencia", nunca "hecho" (se deriva, no se observa directo)', () => {
    const variacion = calcularVariacionCartera(
      [
        fila({ inmuebleId: 'i1', vencidaAnterior: money(0, 'COP'), vencidaActual: money(500_000, 'COP') }),
        fila({ inmuebleId: 'i2', vencidaAnterior: money(0, 'COP'), vencidaActual: money(10_000, 'COP') }),
      ],
      'COP',
    )
    const afirmaciones = explicarVariacionCartera(variacion, contexto)
    const concentracion = afirmaciones.find((a) => a.texto.includes('explican el'))

    expect(concentracion?.tipo).toBe('inferencia')
  })

  it('sin incremento bruto: la concentración se declara "informacion_insuficiente", no se omite en silencio', () => {
    const variacion = calcularVariacionCartera(
      [fila({ inmuebleId: 'i1', vencidaAnterior: money(50_000, 'COP'), vencidaActual: money(20_000, 'COP') })],
      'COP',
    )
    const afirmaciones = explicarVariacionCartera(variacion, contexto)
    const concentracion = afirmaciones.find((a) => a.texto.includes('concentración'))

    expect(concentracion?.tipo).toBe('informacion_insuficiente')
  })

  it('residuo sin evento: se tipa "informacion_insuficiente" y nunca "hecho" — no se reparte ni se esconde', () => {
    const variacion = calcularVariacionCartera(
      [fila({ inmuebleId: 'sin-evento', vencidaActual: money(30_000, 'COP'), eventosEnPeriodo: 0 })],
      'COP',
    )
    const afirmaciones = explicarVariacionCartera(variacion, contexto)
    const residuo = afirmaciones.find((a) => a.texto.includes('no se puede explicar'))

    expect(residuo?.tipo).toBe('informacion_insuficiente')
    expect(residuo?.evidencia.entidad).toBe('eventos_cartera')
  })

  it('incremento con evento: se tipa "hecho", no "inferencia" — el evento sí es un dato verificable', () => {
    const variacion = calcularVariacionCartera(
      [fila({ inmuebleId: 'con-evento', vencidaActual: money(70_000, 'COP'), eventosEnPeriodo: 3 })],
      'COP',
    )
    const afirmaciones = explicarVariacionCartera(variacion, contexto)
    const explicado = afirmaciones.find((a) => a.texto.includes('coincide con eventos'))

    expect(explicado?.tipo).toBe('hecho')
  })

  it('no expone JSON crudo ni claves internas en el texto de ninguna afirmación', () => {
    const variacion = calcularVariacionCartera(
      [fila({ inmuebleId: 'i1', vencidaAnterior: money(100_000, 'COP'), vencidaActual: money(180_000, 'COP') })],
      'COP',
    )
    const afirmaciones = explicarVariacionCartera(variacion, contexto)

    for (const a of afirmaciones) {
      expect(a.texto).not.toMatch(/[{}[\]]/)
      expect(a.texto).not.toMatch(/estado_anterior|estado_nuevo/)
    }
  })
})
