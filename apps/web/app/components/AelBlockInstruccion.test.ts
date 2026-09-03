// @vitest-environment happy-dom
/**
 * Fase 8, movimiento 03 — el lienzo dejó de hablar el vocabulario del
 * lenguaje. Estos tests fijan la capa de etiquetas: que se lea en español,
 * que FIN haya desaparecido (era un artefacto de la gramática textual: la
 * caja ya se cierra sola) y que el interruptor «Ver sintaxis AEL» siga
 * devolviendo las palabras clave para quien esté aprendiendo el modo texto.
 */
import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import AelBlockInstruccion from './AelBlockInstruccion.vue'
import { CLAVE_MOSTRAR_SINTAXIS } from '~/utils/ael-etiquetas'
import {
  bloqueCondicionalVacio,
  bloqueDeclaracionVacia,
  bloqueRetornoVacio,
  type BloqueInstruccion,
} from '~/utils/ael-bloques'

function montar(instrucciones: readonly BloqueInstruccion[], opciones: { readonly?: boolean; sintaxis?: boolean } = {}) {
  return mount(AelBlockInstruccion, {
    props: { instrucciones, readonly: opciones.readonly ?? false },
    global: { provide: { [CLAVE_MOSTRAR_SINTAXIS]: ref(opciones.sintaxis ?? false) } },
  })
}

describe('AelBlockInstruccion — vocabulario en español (mov. 03)', () => {
  it('una declaración se lee «Calcular … como»', () => {
    const texto = montar([bloqueDeclaracionVacia()]).text()
    expect(texto).toContain('Calcular')
    expect(texto).toContain('como')
    expect(texto).not.toContain('DEFINIR')
  })

  it('un retorno se lee «Resultado final»', () => {
    const texto = montar([bloqueRetornoVacio()]).text()
    expect(texto).toContain('Resultado final')
    expect(texto).not.toContain('RETORNAR')
  })

  it('un condicional se lee «Si / Entonces», y FIN desapareció', () => {
    const texto = montar([bloqueCondicionalVacio()]).text()
    expect(texto).toContain('Si')
    expect(texto).toContain('Entonces')
    expect(texto).not.toContain('FIN')
    expect(texto).not.toContain('SINO')
  })

  it('la rama alterna se ofrece como «De lo contrario»', () => {
    const condicional = { ...bloqueCondicionalVacio(), sino: [] as readonly BloqueInstruccion[] }
    expect(montar([condicional]).text()).toContain('De lo contrario')
  })

  it('los botones de agregar nombran lo que producen', () => {
    const texto = montar([]).text()
    expect(texto).toContain('+ Cálculo')
    expect(texto).toContain('+ Resultado')
    expect(texto).toContain('+ Condición')
    expect(texto).not.toContain('+ Definir')
  })

  it('«Ver sintaxis AEL» devuelve las palabras clave junto a la etiqueta', () => {
    const texto = montar([bloqueDeclaracionVacia()], { sintaxis: true }).text()
    expect(texto).toContain('Calcular (DEFINIR)')
  })

  it('está apagado por defecto', () => {
    expect(montar([bloqueDeclaracionVacia()]).text()).not.toContain('(DEFINIR)')
  })
})

describe('AelBlockInstruccion — invariantes de edición', () => {
  it('en solo lectura no pinta ningún control', () => {
    const wrapper = montar([bloqueDeclaracionVacia(), bloqueCondicionalVacio()], { readonly: true })
    expect(wrapper.findAll('button')).toHaveLength(0)
    expect(wrapper.findAll('input').every((i) => i.attributes('disabled') !== undefined)).toBe(true)
  })

  it('los botones de fila tienen nombre accesible, no solo un glifo', () => {
    const wrapper = montar([bloqueDeclaracionVacia(), bloqueRetornoVacio()])
    const etiquetas = wrapper
      .findAll('button')
      .map((b) => b.attributes('aria-label'))
      .filter((e): e is string => e !== undefined)

    expect(etiquetas).toContain('Mover arriba (Alt+flecha arriba)')
    expect(etiquetas).toContain('Mover abajo (Alt+flecha abajo)')
    expect(etiquetas).toContain('Eliminar esta instrucción (Supr)')
  })

  it('agregar un cálculo emite la lista con la instrucción nueva', async () => {
    const wrapper = montar([])
    const boton = wrapper.findAll('button').find((b) => b.text() === '+ Cálculo')
    await boton?.trigger('click')

    const emitidas = wrapper.emitted('update:instrucciones')?.[0]?.[0] as readonly BloqueInstruccion[]
    expect(emitidas).toHaveLength(1)
    expect(emitidas[0]?.tipo).toBe('Declaracion')
  })

  it('eliminar quita la instrucción de la lista', async () => {
    const a = bloqueDeclaracionVacia()
    const b = bloqueRetornoVacio()
    const wrapper = montar([a, b])
    const eliminar = wrapper
      .findAll('button')
      .filter((x) => x.attributes('aria-label') === 'Eliminar esta instrucción (Supr)')
    await eliminar[0]?.trigger('click')

    const emitidas = wrapper.emitted('update:instrucciones')?.[0]?.[0] as readonly BloqueInstruccion[]
    expect(emitidas.map((i) => i.id)).toEqual([b.id])
  })
})

describe('AelBlockInstruccion — destino de arrastre visible (mov. 09)', () => {
  /** dragover sobre una fila, apuntando a la mitad de arriba o de abajo. */
  async function arrastrarSobreFila(
    wrapper: ReturnType<typeof montar>,
    indiceFila: number,
    mitad: 'arriba' | 'abajo',
  ) {
    const fila = wrapper.findAll('[draggable="true"]')[indiceFila]!
    // getBoundingClientRect devuelve ceros en happy-dom: se fija una caja
    // conocida para poder razonar sobre la mitad superior/inferior.
    fila.element.getBoundingClientRect = () => ({ top: 100, height: 40 }) as DOMRect
    await fila.trigger('dragover', { clientY: mitad === 'arriba' ? 105 : 135 })
  }

  const lineas = (wrapper: ReturnType<typeof montar>) =>
    wrapper.findAll('.bg-primary').filter((n) => n.classes().includes('h-0.5')).length

  it('en reposo no hay ninguna línea de inserción', () => {
    expect(lineas(montar([bloqueDeclaracionVacia(), bloqueRetornoVacio()]))).toBe(0)
  })

  it('la mitad superior de una fila inserta antes de ella', async () => {
    const wrapper = montar([bloqueDeclaracionVacia(), bloqueRetornoVacio()])
    await arrastrarSobreFila(wrapper, 1, 'arriba')
    expect(lineas(wrapper)).toBe(1)
  })

  it('la mitad inferior inserta después', async () => {
    const wrapper = montar([bloqueDeclaracionVacia(), bloqueRetornoVacio()])
    await arrastrarSobreFila(wrapper, 1, 'abajo')
    // La última posición se pinta en la zona final, no entre filas.
    expect(lineas(wrapper)).toBe(1)
  })

  it('la línea se limpia al salir del arrastre', async () => {
    const wrapper = montar([bloqueDeclaracionVacia(), bloqueRetornoVacio()])
    await arrastrarSobreFila(wrapper, 0, 'arriba')
    expect(lineas(wrapper)).toBe(1)

    await wrapper.trigger('dragleave')
    expect(lineas(wrapper)).toBe(0)
  })

  it('soltar mueve la instrucción a la posición marcada', async () => {
    const a = bloqueDeclaracionVacia()
    const b = bloqueRetornoVacio()
    const movidas: Array<[string, unknown, number]> = []
    const wrapper = mount(AelBlockInstruccion, {
      props: { instrucciones: [a, b] },
      global: {
        provide: {
          [CLAVE_MOSTRAR_SINTAXIS]: ref(false),
          aelMoverInstruccionGlobal: (id: string, ruta: unknown, indice: number) =>
            movidas.push([id, ruta, indice]),
        },
      },
    })

    const fila = wrapper.findAll('[draggable="true"]')[0]!
    fila.element.getBoundingClientRect = () => ({ top: 100, height: 40 }) as DOMRect
    await fila.trigger('dragover', { clientY: 105 })
    await fila.trigger('drop', { dataTransfer: { getData: () => b.id } })

    expect(movidas).toEqual([[b.id, [], 0]])
  })

  it('existe una zona para soltar al final de la lista', async () => {
    const wrapper = montar([bloqueDeclaracionVacia()])
    const zonaFinal = wrapper.findAll('.min-h-2')
    expect(zonaFinal.length).toBeGreaterThan(0)

    await zonaFinal[0]?.trigger('dragover')
    expect(lineas(wrapper)).toBe(1)
  })
})
