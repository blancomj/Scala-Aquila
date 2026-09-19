import { describe, expect, it } from 'vitest'
import { reactive, toRaw } from 'vue'
import {
  clonar,
  esValorInicial,
  etiquetaValorFiltro,
  generarChips,
  hayFiltrosActivos,
  type CampoFiltro,
  type RangoFiltro,
  type ValorFiltro,
} from './useFiltros'
import { formatoMoneda } from '~/utils/formato'

describe('esValorInicial', () => {
  it('compara primitivos por igualdad simple', () => {
    expect(esValorInicial('bogota', null)).toBe(false)
    expect(esValorInicial(null, null)).toBe(true)
  })

  it('compara rangos por min/max, no por referencia', () => {
    expect(esValorInicial({ min: 10, max: 200 }, { min: null, max: null })).toBe(false)
    expect(esValorInicial({ min: null, max: null }, { min: null, max: null })).toBe(true)
  })

  it('compara arreglos por contenido sin importar el orden', () => {
    expect(esValorInicial(['bogota', 'cali'], [])).toBe(false)
    expect(esValorInicial(['bogota', 'cali'], ['cali', 'bogota'])).toBe(true)
    expect(esValorInicial([], [])).toBe(true)
  })
})

describe('etiquetaValorFiltro', () => {
  it('boolean: usa la etiqueta del campo tal cual, sin mostrar "true"', () => {
    const campo: CampoFiltro = { clave: 'favoritos', etiqueta: 'Solo favoritos', tipo: 'boolean' }
    expect(etiquetaValorFiltro(campo, true)).toBe('Solo favoritos')
  })

  it('select: resuelve la etiqueta de la opción, no el valor crudo', () => {
    const campo: CampoFiltro = {
      clave: 'categoria',
      etiqueta: 'Categoría',
      tipo: 'select',
      opciones: [{ valor: 9, etiqueta: 'Productos' }],
    }
    expect(etiquetaValorFiltro(campo, 9)).toBe('Categoría: Productos')
  })

  it('select: si el valor no está en las opciones, cae al valor crudo en vez de reventar', () => {
    const campo: CampoFiltro = { clave: 'categoria', etiqueta: 'Categoría', tipo: 'select', opciones: [] }
    expect(etiquetaValorFiltro(campo, 9)).toBe('Categoría: 9')
  })

  it('multiselect: une las etiquetas seleccionadas con coma', () => {
    const campo: CampoFiltro = {
      clave: 'ciudades',
      etiqueta: 'Ciudades',
      tipo: 'multiselect',
      opciones: [
        { valor: 'bog', etiqueta: 'Bogotá' },
        { valor: 'cal', etiqueta: 'Cali' },
      ],
    }
    expect(etiquetaValorFiltro(campo, ['bog', 'cal'])).toBe('Ciudades: Bogotá, Cali')
  })

  it('rango: con ambos extremos, muestra "min - max" formateado', () => {
    const campo: CampoFiltro = { clave: 'precio', etiqueta: 'Precio', tipo: 'rango' }
    expect(etiquetaValorFiltro(campo, { min: 10_000, max: 200_000 })).toBe('Precio: 10.000 - 200.000')
  })

  it('rango: con formato moneda, delega en el único formateador de COP del repo', () => {
    const campo: CampoFiltro = { clave: 'precio', etiqueta: 'Precio', tipo: 'rango', formato: 'moneda' }
    expect(etiquetaValorFiltro(campo, { min: 10_000, max: null })).toBe(`Precio: desde ${formatoMoneda(10_000)}`)
  })

  it('rango: con un solo extremo, usa "desde"/"hasta"', () => {
    const campo: CampoFiltro = { clave: 'precio', etiqueta: 'Precio', tipo: 'rango' }
    expect(etiquetaValorFiltro(campo, { min: 10_000, max: null })).toBe('Precio: desde 10.000')
    expect(etiquetaValorFiltro(campo, { min: null, max: 200_000 })).toBe('Precio: hasta 200.000')
  })

  it('texto: envuelve el valor en comillas', () => {
    const campo: CampoFiltro = { clave: 'busqueda', etiqueta: 'Búsqueda', tipo: 'texto' }
    expect(etiquetaValorFiltro(campo, 'flores')).toBe('Búsqueda: "flores"')
  })
})

interface FiltrosDePrueba extends Record<string, ValorFiltro> {
  categoria: number | null
  ciudades: Array<string | number>
  precio: RangoFiltro
}

describe('generarChips', () => {
  const schema: CampoFiltro[] = [
    { clave: 'categoria', etiqueta: 'Categoría', tipo: 'select', opciones: [{ valor: 9, etiqueta: 'Productos' }] },
    { clave: 'ciudades', etiqueta: 'Ciudades', tipo: 'multiselect', opciones: [{ valor: 'bog', etiqueta: 'Bogotá' }] },
    { clave: 'precio', etiqueta: 'Precio', tipo: 'rango' },
  ]
  const iniciales: FiltrosDePrueba = { categoria: null, ciudades: [], precio: { min: null, max: null } }

  it('sin filtros activos, no genera ningún chip', () => {
    expect(generarChips(schema, iniciales, iniciales)).toEqual([])
  })

  it('un chip por cada campo que se aparta de su valor inicial, en el orden del schema', () => {
    const aplicados: FiltrosDePrueba = { ...iniciales, categoria: 9, precio: { min: 10_000, max: null } }
    const chips = generarChips(schema, aplicados, iniciales)
    expect(chips).toEqual([
      { clave: 'categoria', etiqueta: 'Categoría: Productos' },
      { clave: 'precio', etiqueta: 'Precio: desde 10.000' },
    ])
  })

  it('un campo ausente en `aplicados` (schema más nuevo que el estado guardado) no revienta', () => {
    const aplicadosIncompletos = { categoria: 9 } as unknown as FiltrosDePrueba
    expect(generarChips(schema, aplicadosIncompletos, iniciales)).toEqual([
      { clave: 'categoria', etiqueta: 'Categoría: Productos' },
    ])
  })
})

describe('clonar', () => {
  interface FiltrosConArregloYRango extends Record<string, ValorFiltro> {
    ciudades: Array<string | number>
    precio: RangoFiltro
  }

  // Regresión: en el navegador, `useFiltros().borrador` es un Ref — sus campos array/objeto
  // quedan envueltos en un Proxy reactivo en cuanto se leen a través de él (confirmado migrando
  // mantenimiento/activos/index.vue). `structuredClone` directo sobre eso revienta con
  // `DataCloneError: could not be cloned`. Este test reproduce esa forma exacta con `reactive()`
  // de Vue en vez de esperar a pisarlo de nuevo en un navegador real.
  it('no revienta con DataCloneError al clonar un valor que pasó por un Proxy reactivo', () => {
    const original: FiltrosConArregloYRango = { ciudades: ['bog'], precio: { min: 10, max: null } }
    const envueltoEnProxy = reactive(original) as FiltrosConArregloYRango

    expect(() => clonar(envueltoEnProxy)).not.toThrow()
  })

  it('el clon es un objeto plano, no un Proxy — se puede seguir clonando después', () => {
    const envueltoEnProxy = reactive<FiltrosConArregloYRango>({ ciudades: ['bog'], precio: { min: null, max: null } })
    const clon = clonar(envueltoEnProxy)

    expect(toRaw(clon)).toBe(clon)
    expect(() => clonar(clon)).not.toThrow()
  })

  it('produce una copia independiente: mutar el original no afecta al clon', () => {
    const original: FiltrosConArregloYRango = { ciudades: ['bog'], precio: { min: null, max: null } }
    const clon = clonar(original)

    original.ciudades.push('cal')
    original.precio.min = 100

    expect(clon.ciudades).toEqual(['bog'])
    expect(clon.precio).toEqual({ min: null, max: null })
  })
})

describe('hayFiltrosActivos', () => {
  interface FiltroUnico extends Record<string, ValorFiltro> {
    categoria: number | null
  }

  it('false cuando todo coincide con los valores iniciales', () => {
    const iniciales: FiltroUnico = { categoria: null }
    expect(hayFiltrosActivos(iniciales, iniciales)).toBe(false)
  })

  it('true cuando al menos un campo se aparta de su inicial', () => {
    const iniciales: FiltroUnico = { categoria: null }
    expect(hayFiltrosActivos({ categoria: 9 }, iniciales)).toBe(true)
  })
})
