// @vitest-environment happy-dom
/**
 * F2, movimiento 04 — deshacer/rehacer en el lienzo (hallazgo C3).
 *
 * El componente no posee el árbol: lo recibe como prop y emite el nuevo. El
 * historial observa esa prop, así que estos tests simulan lo que hace el
 * padre con v-model — aplicar de vuelta con setProps lo que se emitió.
 */
import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import AelBlockCanvas from './AelBlockCanvas.vue'
import type { BloqueRegla } from '~/utils/ael-bloques'

function regla(nombre: string): BloqueRegla {
  return { id: `regla-${nombre}`, tipo: 'Regla', nombre, cuerpo: [] }
}

function montar(inicial: BloqueRegla | null, readonly = false) {
  return mount(AelBlockCanvas, { props: { bloque: inicial, readonly } })
}

/** Aplica al componente el último bloque emitido, como haría el v-model. */
async function propagar(wrapper: ReturnType<typeof montar>) {
  const emitidos = wrapper.emitted('update:bloque')
  const ultimo = emitidos?.[emitidos.length - 1]?.[0] as BloqueRegla
  await wrapper.setProps({ bloque: ultimo })
  return ultimo
}

const boton = (wrapper: ReturnType<typeof montar>, etiqueta: string) =>
  wrapper.findAll('button').find((b) => b.attributes('aria-label')?.startsWith(etiqueta))

describe('AelBlockCanvas — deshacer y rehacer (mov. 04)', () => {
  it('arranca sin nada que deshacer', () => {
    const wrapper = montar(regla('uno'))
    expect(boton(wrapper, 'Deshacer')?.attributes('disabled')).toBeDefined()
    expect(boton(wrapper, 'Rehacer')?.attributes('disabled')).toBeDefined()
  })

  it('deshacer devuelve el árbol al paso anterior', async () => {
    const wrapper = montar(regla('uno'))
    await wrapper.setProps({ bloque: regla('dos') })

    expect(boton(wrapper, 'Deshacer')?.attributes('disabled')).toBeUndefined()
    await boton(wrapper, 'Deshacer')?.trigger('click')

    const devuelto = await propagar(wrapper)
    expect(devuelto.nombre).toBe('uno')
  })

  it('rehacer vuelve a aplicar lo deshecho', async () => {
    const wrapper = montar(regla('uno'))
    await wrapper.setProps({ bloque: regla('dos') })
    await boton(wrapper, 'Deshacer')?.trigger('click')
    await propagar(wrapper)

    expect(boton(wrapper, 'Rehacer')?.attributes('disabled')).toBeUndefined()
    await boton(wrapper, 'Rehacer')?.trigger('click')
    expect((await propagar(wrapper)).nombre).toBe('dos')
  })

  it('editar después de deshacer descarta la rama de rehacer', async () => {
    const wrapper = montar(regla('uno'))
    await wrapper.setProps({ bloque: regla('dos') })
    await boton(wrapper, 'Deshacer')?.trigger('click')
    await propagar(wrapper)

    // Una edición nueva desde el punto al que se volvió.
    await wrapper.setProps({ bloque: regla('tres') })

    expect(boton(wrapper, 'Rehacer')?.attributes('disabled')).toBeDefined()
    await boton(wrapper, 'Deshacer')?.trigger('click')
    expect((await propagar(wrapper)).nombre).toBe('uno')
  })

  it('recorre varios pasos hacia atrás y hacia adelante', async () => {
    const wrapper = montar(regla('a'))
    for (const n of ['b', 'c', 'd']) await wrapper.setProps({ bloque: regla(n) })

    await boton(wrapper, 'Deshacer')?.trigger('click')
    expect((await propagar(wrapper)).nombre).toBe('c')
    await boton(wrapper, 'Deshacer')?.trigger('click')
    expect((await propagar(wrapper)).nombre).toBe('b')
    await boton(wrapper, 'Rehacer')?.trigger('click')
    expect((await propagar(wrapper)).nombre).toBe('c')
  })

  it('Ctrl+Z y Ctrl+Mayús+Z hacen lo mismo que los botones', async () => {
    const wrapper = montar(regla('uno'))
    await wrapper.setProps({ bloque: regla('dos') })

    await wrapper.trigger('keydown', { key: 'z', ctrlKey: true })
    expect((await propagar(wrapper)).nombre).toBe('uno')

    await wrapper.trigger('keydown', { key: 'z', ctrlKey: true, shiftKey: true })
    expect((await propagar(wrapper)).nombre).toBe('dos')
  })

  it('en solo lectura no hay historial que ofrecer', () => {
    const wrapper = montar(regla('uno'), true)
    expect(boton(wrapper, 'Deshacer')).toBeUndefined()
    expect(boton(wrapper, 'Rehacer')).toBeUndefined()
  })

  it('un texto que no parsea no rompe el historial', async () => {
    const wrapper = montar(regla('uno'))
    await wrapper.setProps({ bloque: null })
    // El lienzo muestra el mensaje de error, sin encabezado ni botones.
    expect(wrapper.text()).toContain('errores de sintaxis')
    expect(boton(wrapper, 'Deshacer')).toBeUndefined()
  })
})

describe('AelBlockCanvas — encabezado y leyenda (mov. 03/10)', () => {
  it('muestra la leyenda del código de color por origen del dato', () => {
    const texto = montar(regla('uno')).text()
    expect(texto).toContain('Origen del dato')
    for (const etiqueta of ['Parámetro', 'Inmueble', 'Concepto', 'Función']) {
      expect(texto).toContain(etiqueta)
    }
  })

  it('el interruptor de sintaxis arranca apagado', () => {
    const wrapper = montar(regla('uno'))
    const casilla = wrapper.get('input[type="checkbox"]')
    expect((casilla.element as HTMLInputElement).checked).toBe(false)
    expect(wrapper.text()).toContain('Ver sintaxis AEL')
    expect(wrapper.text()).not.toContain('(REGLA)')
  })

  it('al encenderlo aparece la palabra clave del lenguaje', async () => {
    const wrapper = montar(regla('uno'))
    await wrapper.get('input[type="checkbox"]').setValue(true)
    expect(wrapper.text()).toContain('(REGLA)')
  })
})
