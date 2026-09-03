// @vitest-environment happy-dom
/**
 * F0 (revisión del constructor visual AEL) — red de seguridad de render
 * ANTES de rediseñar la presentación (movimientos 01/02/03/10).
 *
 * Dos clases de prueba, a propósito:
 *
 * 1. INVARIANTES — lo que el rediseño NO puede cambiar: el modelo que se
 *    emite en cada edición, la invariante del lexema crudo (ast.ts: valor y
 *    monto son string, nunca Number(x)) y que en solo lectura no se pinte
 *    ningún control editable. Estas deben seguir verdes después de F1.
 *
 * 2. CARACTERIZACIÓN DEL DEFECTO — el hallazgo C1: hoy dos agrupamientos
 *    distintos producen el mismo texto visible. Se fija aquí para que el
 *    movimiento 01 tenga que INVERTIRLA explícitamente, y no se pueda dar
 *    por corregido el defecto sin que CI lo note. Va marcada con TODO(F1).
 */
import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import AelBlockExpresion from './AelBlockExpresion.vue'
import { CLAVE_MOSTRAR_SINTAXIS } from '~/utils/ael-etiquetas'
import { MIME_PALETA_AEL } from '~/utils/ael-bloques'
import type {
  BloqueExpresion,
  BloqueExpresionBinaria,
  BloqueNumeroLiteral,
  BloqueReferenciaContract,
} from '~/utils/ael-bloques'

let contador = 0
function id(): string {
  contador += 1
  return `bloque-${contador}`
}

function numero(valor: string): BloqueNumeroLiteral {
  return { id: id(), tipo: 'NumeroLiteral', valor }
}

function referencia(contrato: string, campo: string): BloqueReferenciaContract {
  return { id: id(), tipo: 'ReferenciaContract', contrato, campo }
}

function binaria(
  izquierda: BloqueExpresion,
  operador: BloqueExpresionBinaria['operador'],
  derecha: BloqueExpresion,
): BloqueExpresionBinaria {
  return { id: id(), tipo: 'ExpresionBinaria', operador, izquierda, derecha }
}

function montar(bloque: BloqueExpresion, readonly = false) {
  return mount(AelBlockExpresion, { props: { bloque, readonly } })
}

/** Texto visible, normalizado — es lo que un usuario puede llegar a leer. */
function textoVisible(wrapper: ReturnType<typeof montar>): string {
  return wrapper.text().replace(/\s+/g, ' ').trim()
}

describe('AelBlockExpresion — invariantes que el rediseño debe preservar', () => {
  /** El componente solo escucha @change (hallazgo A2: confirma al salir del
   * campo). setValue() de VTU dispara sus propios eventos, así que se escribe
   * en el DOM y se dispara change una sola vez, como haría un usuario. */
  async function escribirYConfirmar(wrapper: ReturnType<typeof montar>, texto: string) {
    const input = wrapper.get('input')
    ;(input.element as HTMLInputElement).value = texto
    await input.trigger('change')
    return input
  }

  it('emite el lexema crudo, sin normalizar el decimal', async () => {
    const wrapper = montar(numero('100.50'))

    await escribirYConfirmar(wrapper, '250.00')

    const emitidos = wrapper.emitted('update:bloque')
    expect(emitidos).toHaveLength(1)
    const nuevo = emitidos?.[0]?.[0] as BloqueNumeroLiteral
    // '250.00' y NO '250' — Number(x).toString() rompería la precisión.
    expect(nuevo.valor).toBe('250.00')
  })

  it('rechaza un número con forma léxica inválida sin emitir nada', async () => {
    const wrapper = montar(numero('100'))

    // La coma decimal colombiana no es NUMERO en el lexer (hallazgo A2).
    const input = await escribirYConfirmar(wrapper, '100,50')

    expect(wrapper.emitted('update:bloque')).toBeUndefined()
    // Y el desajuste que documenta A2: el modelo sigue en '100' pero el DOM
    // muestra '100,50', porque al no cambiar el estado no hay re-render.
    // TODO(F1): al validar en vivo esto deja de poder pasar.
    expect((input.element as HTMLInputElement).value).toBe('100,50')
  })

  it('cambiar el operador conserva ambos operandos', async () => {
    const wrapper = montar(binaria(numero('2'), '+', numero('3')))

    const selectorOperador = wrapper
      .findAll('select')
      .find((s) => s.findAll('option').some((o) => o.element.value === '*'))
    await selectorOperador?.setValue('*')

    const nuevo = wrapper.emitted('update:bloque')?.[0]?.[0] as BloqueExpresionBinaria
    expect(nuevo.operador).toBe('*')
    expect(nuevo.izquierda).toMatchObject({ tipo: 'NumeroLiteral', valor: '2' })
    expect(nuevo.derecha).toMatchObject({ tipo: 'NumeroLiteral', valor: '3' })
  })

  it('en solo lectura no pinta ningún control que edite el árbol', () => {
    const wrapper = montar(
      binaria(referencia('PARAMETER', 'PRESUPUESTO_ANUAL'), '/', numero('12')),
      true,
    )

    expect(wrapper.findAll('button')).toHaveLength(0)
    expect(wrapper.findAll('select').every((s) => s.attributes('disabled') !== undefined)).toBe(true)
    expect(wrapper.findAll('input').every((i) => i.attributes('disabled') !== undefined)).toBe(true)
  })
})

describe('AelBlockExpresion — agrupamiento visible (mov. 01, cierra C1/X1)', () => {
  /** (100 − 40) ÷ 12 — el printer imprime paréntesis, el lienzo debe encajonar. */
  const necesitaParentesis = () =>
    binaria(binaria(numero('100'), '-', numero('40')), '/', numero('12'))
  /** 100 − 40 ÷ 12 — sin paréntesis en el texto: tampoco caja. */
  const noNecesita = () => binaria(numero('100'), '-', binaria(numero('40'), '/', numero('12')))
  /** 100 − (40 − 12) — mismo nivel a la derecha: asociatividad, sí lleva caja. */
  const asociatividadDerecha = () =>
    binaria(numero('100'), '-', binaria(numero('40'), '-', numero('12')))

  const cajas = (wrapper: ReturnType<typeof montar>) => wrapper.findAll('[data-agrupado]').length

  it('encajona el operando que el printer pondría entre paréntesis', () => {
    expect(cajas(montar(necesitaParentesis(), true))).toBe(1)
  })

  it('no encajona cuando la precedencia natural ya basta', () => {
    expect(cajas(montar(noNecesita(), true))).toBe(0)
  })

  it('encajona el lado derecho de igual precedencia (asociatividad izquierda)', () => {
    expect(cajas(montar(asociatividadDerecha(), true))).toBe(1)
  })

  it('la expresión raíz nunca lleva caja', () => {
    const wrapper = montar(binaria(numero('1'), '+', numero('2')), true)
    expect(wrapper.attributes('data-agrupado')).toBeUndefined()
  })

  it('en solo lectura los dos agrupamientos ya se distinguen — cierra X1', () => {
    // Antes de mov. 01 el diff de versiones (readonly) no podía mostrar un
    // cambio de agrupamiento: sin chrome, los dos árboles se veían iguales.
    const conCaja = montar(necesitaParentesis(), true)
    const sinCaja = montar(noNecesita(), true)

    expect(cajas(conCaja)).not.toBe(cajas(sinCaja))
    // El texto sigue siendo el mismo: la diferencia es deliberadamente
    // visual, igual que un paréntesis lo es en el texto.
    expect(textoVisible(conCaja)).toBe(textoVisible(sinCaja))
  })
})

describe('AelBlockExpresion — chrome contextual (mov. 02)', () => {
  /** (100 − 40) ÷ 12 — la misma fórmula que se midió en la app. */
  const formulaMedida = () =>
    binaria(binaria(numero('100'), '-', numero('40')), '/', numero('12'))

  const controles = (wrapper: ReturnType<typeof montar>) =>
    wrapper.findAll('button').length +
    wrapper.findAll('select').length +
    wrapper.findAll('input').length

  it('en reposo no hay selector de tipo en ningún nodo', () => {
    const wrapper = montar(formulaMedida())
    const selectoresDeTipo = wrapper
      .findAll('select')
      .filter((s) => (s.attributes('aria-label') ?? '').startsWith('Cambiar tipo'))
    expect(selectoresDeTipo).toHaveLength(0)
  })

  it('cada nodo expone exactamente un botón de acciones', () => {
    const wrapper = montar(formulaMedida())
    const botones = wrapper.findAll('button')
    // 5 nodos: la binaria raíz, la binaria anidada y los tres números.
    expect(botones).toHaveLength(5)
    expect(botones.every((b) => b.attributes('aria-label') === 'Acciones de este valor')).toBe(true)
  })

  it('baja el recuento de controles frente al diseño anterior', () => {
    // Medido en la app antes de mov. 02, sobre esta misma expresión: 5 ⊕,
    // 2 ↩ y 3 selectores de tipo, más los 3 números y 2 operadores. Ahora
    // el chrome son 5 botones «⋯» y el contenido no cambia.
    expect(controles(montar(formulaMedida()))).toBeLessThan(15)
  })

  it('el menú ofrece envolver, y quitar la operación solo en una binaria', async () => {
    const wrapper = montar(formulaMedida())
    // El último botón del DOM es el del nodo raíz: los hijos se pintan antes.
    const botones = wrapper.findAll('button')
    await botones[botones.length - 1]?.trigger('click')

    const opciones = wrapper.findAll('[role="menuitem"]').map((b) => b.text())
    expect(opciones.some((t) => t.startsWith('Envolver en una operación'))).toBe(true)
    expect(opciones.some((t) => t.startsWith('Quitar la operación'))).toBe(true)
  })

  it('el menú de una hoja lista los tipos con nombre legible', async () => {
    const wrapper = montar(numero('12'))
    await wrapper.get('button').trigger('click')

    const opciones = wrapper.findAll('[role="menuitem"]').map((b) => b.text())
    expect(opciones).toContain('Número')
    expect(opciones).toContain('Dinero')
    expect(opciones).toContain('Dato del sistema')
    expect(opciones.some((t) => t.startsWith('Quitar la operación'))).toBe(false)
  })

  it('cambiar el tipo desde el menú emite el bloque nuevo', async () => {
    const wrapper = montar(numero('12'))
    await wrapper.get('button').trigger('click')
    const opcionDinero = wrapper.findAll('[role="menuitem"]').find((b) => b.text() === 'Dinero')
    await opcionDinero?.trigger('click')

    const nuevo = wrapper.emitted('update:bloque')?.[0]?.[0] as BloqueExpresion
    expect(nuevo.tipo).toBe('DineroLiteral')
  })
})

describe('AelBlockExpresion — etiquetas en español (mov. 03)', () => {
  function montarConSintaxis(bloque: BloqueExpresion, mostrar: boolean) {
    return mount(AelBlockExpresion, {
      props: { bloque },
      global: { provide: { [CLAVE_MOSTRAR_SINTAXIS]: ref(mostrar) } },
    })
  }

  it('dibuja los operadores aritméticos con su signo real', () => {
    const wrapper = montar(binaria(numero('2'), '*', numero('3')))
    const opciones = wrapper.get('select').findAll('option').map((o) => o.text())
    expect(opciones).toContain('×')
    expect(opciones).toContain('÷')
    expect(opciones).not.toContain('*')
  })

  it('dibuja las comparaciones en palabras', () => {
    const wrapper = montar(binaria(numero('2'), '>', numero('3')))
    const opciones = wrapper.get('select').findAll('option').map((o) => o.text())
    expect(opciones).toContain('es mayor que')
    expect(opciones).toContain('es distinto de')
  })

  it('nombra el contrato y el campo de una referencia en legible', () => {
    const wrapper = mount(AelBlockExpresion, {
      props: {
        bloque: referencia('PARAMETER', 'PRESUPUESTO_ANUAL'),
        catalogo: { parameter: ['PRESUPUESTO_ANUAL'], unit: [], concepto: [], funciones: [] },
      },
    })
    expect(wrapper.text()).toContain('Parámetro')
    expect(wrapper.text()).toContain('Presupuesto anual')
    expect(wrapper.text()).not.toContain('PRESUPUESTO_ANUAL')
  })

  it('«Ver sintaxis AEL» devuelve las palabras clave del lenguaje', () => {
    const conSintaxis = montarConSintaxis(binaria(numero('2'), '*', numero('3')), true)
    const opciones = conSintaxis.get('select').findAll('option').map((o) => o.text())
    expect(opciones).toContain('*')
    expect(opciones).not.toContain('×')
  })

  it('está apagado por defecto', () => {
    const porDefecto = montar(binaria(numero('2'), '*', numero('3')))
    const opciones = porDefecto.get('select').findAll('option').map((o) => o.text())
    expect(opciones).toContain('×')
  })
})

describe('AelBlockExpresion — destinos de arrastre acotados (mov. 09)', () => {
  /** dragover con el MIME de la paleta; devuelve si el nodo lo aceptó. */
  function arrastrarPaletaSobre(elemento: Element): boolean {
    const evento = new Event('dragover', { bubbles: true, cancelable: true })
    Object.defineProperty(evento, 'dataTransfer', { value: { types: [MIME_PALETA_AEL] } })
    elemento.dispatchEvent(evento)
    return evento.defaultPrevented
  }

  it('una hoja acepta soltar un ítem de paleta', () => {
    const wrapper = montar(numero('12'))
    expect(arrastrarPaletaSobre(wrapper.element)).toBe(true)
  })

  it('una operación NO lo acepta — cierra A4', () => {
    // Antes el manejador vivía en el span raíz de cualquier nodo: soltar sobre
    // el selector de operador reemplazaba la binaria entera por una hoja y se
    // llevaba los dos operandos, sin confirmación ni deshacer.
    const wrapper = montar(binaria(numero('2'), '+', numero('3')))
    expect(arrastrarPaletaSobre(wrapper.element)).toBe(false)
  })

  it('en solo lectura ninguna hoja acepta', () => {
    const wrapper = montar(numero('12'), true)
    expect(arrastrarPaletaSobre(wrapper.element)).toBe(false)
  })

  it('resalta el nodo mientras el arrastre está encima, y lo suelta al salir', async () => {
    const wrapper = montar(numero('12'))
    arrastrarPaletaSobre(wrapper.element)
    await wrapper.vm.$nextTick()
    expect(wrapper.attributes('data-arrastre-encima')).toBeDefined()

    await wrapper.trigger('dragleave')
    expect(wrapper.attributes('data-arrastre-encima')).toBeUndefined()
  })
})

describe('AelBlockExpresion — huecos explícitos (mov. 05)', () => {
  it('una referencia sin campo se marca como incompleta', () => {
    const wrapper = montar(referencia('PARAMETER', ''))
    expect(wrapper.attributes('data-incompleto')).toBeDefined()
  })

  it('una referencia con campo no se marca', () => {
    const wrapper = montar(referencia('PARAMETER', 'PRESUPUESTO_ANUAL'))
    expect(wrapper.attributes('data-incompleto')).toBeUndefined()
  })

  it('una función sin nombre se marca como incompleta', () => {
    const wrapper = montar({ id: 'f', tipo: 'LlamadaFuncion', nombre: '', argumentos: [] })
    expect(wrapper.attributes('data-incompleto')).toBeDefined()
  })

  it('un literal nunca está incompleto', () => {
    expect(montar(numero('0')).attributes('data-incompleto')).toBeUndefined()
  })
})
