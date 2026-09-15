import { describe, expect, it } from 'vitest'
import { aplicarConfiguracionMenu } from './useMenuPersonalizado'
import type { NavGrupo } from '~/utils/navegacion'

function itemDePrueba(to: string, label = to): NavGrupo['items'][number] {
  return { label, to, icono: 'M0 0' }
}

const GRUPOS_PRUEBA: NavGrupo[] = [
  { titulo: 'Grupo A', items: [itemDePrueba('/a1'), itemDePrueba('/a2')] },
  { titulo: 'Grupo B', items: [itemDePrueba('/b1'), itemDePrueba('/b2')] },
]

describe('aplicarConfiguracionMenu', () => {
  it('sin configuración, devuelve el catálogo tal cual (con oculto:false en cada ítem)', () => {
    const resultado = aplicarConfiguracionMenu(GRUPOS_PRUEBA, undefined)
    expect(resultado).toEqual(
      GRUPOS_PRUEBA.map((g) => ({ ...g, items: g.items.map((i) => ({ ...i, oculto: false })) })),
    )
  })

  it('reordena los grupos mencionados y deja los demás al final en su orden original', () => {
    const resultado = aplicarConfiguracionMenu(GRUPOS_PRUEBA, { grupos: ['Grupo B'] })
    expect(resultado.map((g) => g.titulo)).toEqual(['Grupo B', 'Grupo A'])
  })

  it('ignora en el orden de grupos un título que no existe en el catálogo', () => {
    const resultado = aplicarConfiguracionMenu(GRUPOS_PRUEBA, { grupos: ['Grupo Inventado', 'Grupo B'] })
    expect(resultado.map((g) => g.titulo)).toEqual(['Grupo B', 'Grupo A'])
  })

  it('reordena los ítems dentro de un grupo y deja los no mencionados al final', () => {
    const resultado = aplicarConfiguracionMenu(GRUPOS_PRUEBA, {
      items: { 'Grupo A': ['/a2'] },
    })
    const grupoA = resultado.find((g) => g.titulo === 'Grupo A')!
    expect(grupoA.items.map((i) => i.to)).toEqual(['/a2', '/a1'])
  })

  it('mueve un ítem a un grupo distinto del suyo original, sin duplicarlo ni perder el resto', () => {
    const resultado = aplicarConfiguracionMenu(GRUPOS_PRUEBA, {
      items: { 'Grupo B': ['/a1', '/b1'] },
    })
    const grupoA = resultado.find((g) => g.titulo === 'Grupo A')!
    const grupoB = resultado.find((g) => g.titulo === 'Grupo B')!
    expect(grupoA.items.map((i) => i.to)).toEqual(['/a2'])
    // El orden explícito de la configuración ('/a1' antes que '/b1') se respeta tal cual;
    // lo no mencionado ('/b2') se agrega al final.
    expect(grupoB.items.map((i) => i.to)).toEqual(['/a1', '/b1', '/b2'])
  })

  it('ignora en items una ruta que no existe en el catálogo, sin romper el resto', () => {
    const resultado = aplicarConfiguracionMenu(GRUPOS_PRUEBA, {
      items: { 'Grupo A': ['/no-existe', '/a2'] },
    })
    const grupoA = resultado.find((g) => g.titulo === 'Grupo A')!
    expect(grupoA.items.map((i) => i.to)).toEqual(['/a2', '/a1'])
  })

  it('no muta el catálogo original', () => {
    const copia = structuredClone(GRUPOS_PRUEBA)
    aplicarConfiguracionMenu(GRUPOS_PRUEBA, { grupos: ['Grupo B'], items: { 'Grupo B': ['/a1'] } })
    expect(GRUPOS_PRUEBA).toEqual(copia)
  })

  it('aplica el nombre personalizado de un ítem, sin afectar los demás', () => {
    const resultado = aplicarConfiguracionMenu(GRUPOS_PRUEBA, { etiquetas: { '/a1': 'Mi apodo' } })
    const grupoA = resultado.find((g) => g.titulo === 'Grupo A')!
    expect(grupoA.items.find((i) => i.to === '/a1')?.label).toBe('Mi apodo')
    expect(grupoA.items.find((i) => i.to === '/a2')?.label).toBe('/a2')
  })

  it('una etiqueta vacía o solo espacios no reemplaza el nombre original (equivale a restablecer)', () => {
    const resultado = aplicarConfiguracionMenu(GRUPOS_PRUEBA, { etiquetas: { '/a1': '   ' } })
    const grupoA = resultado.find((g) => g.titulo === 'Grupo A')!
    expect(grupoA.items.find((i) => i.to === '/a1')?.label).toBe('/a1')
  })

  it('el nombre personalizado sigue al ítem aunque se mueva de grupo', () => {
    const resultado = aplicarConfiguracionMenu(GRUPOS_PRUEBA, {
      items: { 'Grupo B': ['/a1'] },
      etiquetas: { '/a1': 'Renombrado' },
    })
    const grupoB = resultado.find((g) => g.titulo === 'Grupo B')!
    expect(grupoB.items.find((i) => i.to === '/a1')?.label).toBe('Renombrado')
  })

  it('un ítem en `ocultos` queda marcado oculto:true, el resto en false', () => {
    const resultado = aplicarConfiguracionMenu(GRUPOS_PRUEBA, { ocultos: ['/a1'] })
    const grupoA = resultado.find((g) => g.titulo === 'Grupo A')!
    expect(grupoA.items.find((i) => i.to === '/a1')?.oculto).toBe(true)
    expect(grupoA.items.find((i) => i.to === '/a2')?.oculto).toBe(false)
  })

  it('un ítem oculto sigue presente (no se elimina) para poder volver a mostrarlo', () => {
    const resultado = aplicarConfiguracionMenu(GRUPOS_PRUEBA, { ocultos: ['/a1'] })
    const grupoA = resultado.find((g) => g.titulo === 'Grupo A')!
    expect(grupoA.items).toHaveLength(2)
  })

  it('oculto y nombre personalizado son independientes: un ítem puede tener ambos', () => {
    const resultado = aplicarConfiguracionMenu(GRUPOS_PRUEBA, {
      ocultos: ['/a1'],
      etiquetas: { '/a1': 'Renombrado' },
    })
    const item = resultado.find((g) => g.titulo === 'Grupo A')!.items.find((i) => i.to === '/a1')!
    expect(item.oculto).toBe(true)
    expect(item.label).toBe('Renombrado')
  })
})
