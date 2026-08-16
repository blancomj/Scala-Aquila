<script setup lang="ts">
// AEL-004 Fase 7 (E4+E6) — render + edición de un BloqueExpresion.
// E4: cada variante edita sus propios campos primitivos (valor, operador,
// nombre...) y reemplaza el bloque completo hacia el padre.
// E6: además reestructura — "envolver" convierte cualquier expresión en el
// lado izquierdo de una nueva operación binaria; "simplificar" hace lo
// inverso para una ExpresionBinaria (se queda solo con el lado izquierdo);
// LlamadaFuncion admite agregar/quitar argumentos. No hay una forma
// genérica de "cambiar el tipo" de un nodo (p. ej. convertir un número en
// una referencia a contrato) — envolver/simplificar ya cubre reestructurar
// sin necesitar esa operación, y evita una UI de "elegir tipo nuevo" que
// tendría que decidir qué hacer con los hijos existentes.
import type { BloqueExpresion } from '~/utils/ael-bloques'
import { bloqueNumeroCero, envolverEnBinaria } from '~/utils/ael-bloques'
import type { OperadorBinario } from '@aquila/ael-language'

const props = defineProps<{ bloque: BloqueExpresion; readonly?: boolean }>()
const emit = defineEmits<{ 'update:bloque': [BloqueExpresion] }>()

const OPERADORES_BINARIOS: readonly OperadorBinario[] = [
  '+',
  '-',
  '*',
  '/',
  '==',
  '!=',
  '>',
  '>=',
  '<',
  '<=',
]

// Mismas formas léxicas que lexer.ts (Docs/02 §4/§9-10) — solo se aceptan
// ediciones que, al volver a imprimirse, sigan parseando.
const RE_NUMERO = /^\d+(\.\d+)?$/
const RE_IDENTIFICADOR = /^[a-zA-Z][a-zA-Z0-9_]*$/

const COLOR_CONTRATO: Record<string, string> = {
  PARAMETER:
    'bg-green-100 text-green-800 border-green-300 dark:bg-green-900/40 dark:text-green-200 dark:border-green-700',
  UNIT: 'bg-blue-100 text-blue-800 border-blue-300 dark:bg-blue-900/40 dark:text-blue-200 dark:border-blue-700',
  CONCEPTO:
    'bg-purple-100 text-purple-800 border-purple-300 dark:bg-purple-900/40 dark:text-purple-200 dark:border-purple-700',
}
const COLOR_DEFECTO =
  'bg-gray-100 text-gray-700 border-gray-300 dark:bg-gray-800 dark:text-gray-200 dark:border-gray-600'
const CLASE_INPUT_PILL =
  'bg-transparent outline-none disabled:cursor-not-allowed disabled:opacity-60'
const CLASE_BOTON_ESTRUCTURA = 'text-xs text-gray-400 hover:text-primary leading-none'

function colorContrato(contrato: string): string {
  return COLOR_CONTRATO[contrato] ?? COLOR_DEFECTO
}

// Invariante heredada de ast.ts (ver ael-bloques.ts): valor/monto son el
// lexema crudo — se rechaza (se ignora el evento) cualquier texto que no
// cumpla la forma léxica de NUMERO, nunca se reescribe con Number(x).
function actualizarValorNumero(texto: string): void {
  if (props.bloque.tipo !== 'NumeroLiteral' || !RE_NUMERO.test(texto)) return
  emit('update:bloque', { ...props.bloque, valor: texto })
}

function actualizarMontoDinero(texto: string): void {
  if (props.bloque.tipo !== 'DineroLiteral' || !RE_NUMERO.test(texto)) return
  emit('update:bloque', { ...props.bloque, monto: texto })
}

function actualizarMonedaDinero(texto: string): void {
  if (props.bloque.tipo !== 'DineroLiteral' || !RE_IDENTIFICADOR.test(texto)) return
  emit('update:bloque', { ...props.bloque, moneda: texto })
}

function actualizarBooleano(valor: string): void {
  if (props.bloque.tipo !== 'BooleanoLiteral') return
  emit('update:bloque', { ...props.bloque, valor: valor === 'true' })
}

function actualizarNombreIdentificador(texto: string): void {
  if (props.bloque.tipo !== 'Identificador' || !RE_IDENTIFICADOR.test(texto)) return
  emit('update:bloque', { ...props.bloque, nombre: texto })
}

function actualizarContratoReferencia(texto: string): void {
  if (props.bloque.tipo !== 'ReferenciaContract' || !RE_IDENTIFICADOR.test(texto)) return
  emit('update:bloque', { ...props.bloque, contrato: texto })
}

function actualizarCampoReferencia(texto: string): void {
  if (props.bloque.tipo !== 'ReferenciaContract' || !RE_IDENTIFICADOR.test(texto)) return
  emit('update:bloque', { ...props.bloque, campo: texto })
}

function actualizarNombreFuncion(texto: string): void {
  if (props.bloque.tipo !== 'LlamadaFuncion' || !RE_IDENTIFICADOR.test(texto)) return
  emit('update:bloque', { ...props.bloque, nombre: texto })
}

function actualizarArgumento(indice: number, nuevo: BloqueExpresion): void {
  if (props.bloque.tipo !== 'LlamadaFuncion') return
  const argumentos = props.bloque.argumentos.map((a, i) => (i === indice ? nuevo : a))
  emit('update:bloque', { ...props.bloque, argumentos })
}

function agregarArgumento(): void {
  if (props.bloque.tipo !== 'LlamadaFuncion') return
  emit('update:bloque', { ...props.bloque, argumentos: [...props.bloque.argumentos, bloqueNumeroCero()] })
}

function eliminarArgumento(indice: number): void {
  if (props.bloque.tipo !== 'LlamadaFuncion') return
  emit('update:bloque', {
    ...props.bloque,
    argumentos: props.bloque.argumentos.filter((_, i) => i !== indice),
  })
}

function actualizarOperando(nuevo: BloqueExpresion): void {
  if (props.bloque.tipo !== 'ExpresionUnaria') return
  emit('update:bloque', { ...props.bloque, operando: nuevo })
}

function actualizarOperadorBinario(operador: string): void {
  if (props.bloque.tipo !== 'ExpresionBinaria') return
  emit('update:bloque', { ...props.bloque, operador: operador as OperadorBinario })
}

function actualizarIzquierda(nuevo: BloqueExpresion): void {
  if (props.bloque.tipo !== 'ExpresionBinaria') return
  emit('update:bloque', { ...props.bloque, izquierda: nuevo })
}

function actualizarDerecha(nuevo: BloqueExpresion): void {
  if (props.bloque.tipo !== 'ExpresionBinaria') return
  emit('update:bloque', { ...props.bloque, derecha: nuevo })
}

function envolver(): void {
  emit('update:bloque', envolverEnBinaria(props.bloque))
}

function simplificarBinaria(): void {
  if (props.bloque.tipo !== 'ExpresionBinaria') return
  emit('update:bloque', props.bloque.izquierda)
}
</script>

<template>
  <span class="inline-flex items-center gap-0.5 align-middle">
    <span
      v-if="bloque.tipo === 'NumeroLiteral'"
      :class="COLOR_DEFECTO"
      class="inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-mono"
    >
      <input
        :value="bloque.valor"
        :disabled="readonly"
        :class="CLASE_INPUT_PILL"
        class="w-14 font-mono"
        @change="actualizarValorNumero(($event.target as HTMLInputElement).value)"
      >
    </span>

    <span
      v-else-if="bloque.tipo === 'DineroLiteral'"
      :class="COLOR_DEFECTO"
      class="inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-mono"
    >
      <input
        :value="bloque.monto"
        :disabled="readonly"
        :class="CLASE_INPUT_PILL"
        class="w-16 font-mono"
        @change="actualizarMontoDinero(($event.target as HTMLInputElement).value)"
      >
      <input
        :value="bloque.moneda"
        :disabled="readonly"
        :class="CLASE_INPUT_PILL"
        class="w-10 font-mono uppercase"
        @change="actualizarMonedaDinero(($event.target as HTMLInputElement).value)"
      >
    </span>

    <span
      v-else-if="bloque.tipo === 'BooleanoLiteral'"
      :class="COLOR_DEFECTO"
      class="inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-mono"
    >
      <select
        :value="String(bloque.valor)"
        :disabled="readonly"
        :class="CLASE_INPUT_PILL"
        class="font-mono"
        @change="actualizarBooleano(($event.target as HTMLSelectElement).value)"
      >
        <option value="true">VERDADERO</option>
        <option value="false">FALSO</option>
      </select>
    </span>

    <span
      v-else-if="bloque.tipo === 'NuloLiteral'"
      :class="COLOR_DEFECTO"
      class="inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-mono"
    >
      NULO
    </span>

    <span
      v-else-if="bloque.tipo === 'Identificador'"
      :class="COLOR_DEFECTO"
      class="inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-mono italic"
    >
      <input
        :value="bloque.nombre"
        :disabled="readonly"
        :class="CLASE_INPUT_PILL"
        class="w-20 font-mono italic"
        @change="actualizarNombreIdentificador(($event.target as HTMLInputElement).value)"
      >
    </span>

    <span
      v-else-if="bloque.tipo === 'ReferenciaContract'"
      :class="colorContrato(bloque.contrato)"
      class="inline-flex items-center gap-0.5 rounded-full border px-2 py-0.5 text-xs font-mono"
    >
      <input
        :value="bloque.contrato"
        :disabled="readonly"
        :class="CLASE_INPUT_PILL"
        class="w-20 font-mono"
        @change="actualizarContratoReferencia(($event.target as HTMLInputElement).value)"
      >
      <span>.</span>
      <input
        :value="bloque.campo"
        :disabled="readonly"
        :class="CLASE_INPUT_PILL"
        class="w-28 font-mono"
        @change="actualizarCampoReferencia(($event.target as HTMLInputElement).value)"
      >
    </span>

    <span
      v-else-if="bloque.tipo === 'LlamadaFuncion'"
      class="inline-flex items-center gap-1 rounded-md border border-dashed border-orange-400 bg-orange-50 px-2 py-1 text-xs dark:border-orange-600 dark:bg-orange-900/20"
    >
      <input
        :value="bloque.nombre"
        :disabled="readonly"
        :class="CLASE_INPUT_PILL"
        class="w-32 font-mono font-medium text-orange-700 dark:text-orange-300"
        @change="actualizarNombreFuncion(($event.target as HTMLInputElement).value)"
      >
      <span class="text-orange-500">(</span>
      <template v-for="(arg, i) in bloque.argumentos" :key="arg.id">
        <span v-if="i > 0" class="text-orange-500">,</span>
        <AelBlockExpresion
          :bloque="arg"
          :readonly="readonly"
          @update:bloque="(nuevo) => actualizarArgumento(i, nuevo)"
        />
        <button
          v-if="!readonly"
          type="button"
          class="text-[10px] leading-none text-orange-400 hover:text-red-500"
          title="Quitar argumento"
          @click="eliminarArgumento(i)"
        >
          ✕
        </button>
      </template>
      <button
        v-if="!readonly"
        type="button"
        class="text-xs leading-none text-orange-400 hover:text-orange-700"
        title="Agregar argumento"
        @click="agregarArgumento"
      >
        +
      </button>
      <span class="text-orange-500">)</span>
    </span>

    <span v-else-if="bloque.tipo === 'ExpresionUnaria'" class="inline-flex items-center gap-1">
      <span class="font-mono text-xs text-gray-500">-</span>
      <AelBlockExpresion
        :bloque="bloque.operando"
        :readonly="readonly"
        @update:bloque="actualizarOperando"
      />
    </span>

    <span v-else class="inline-flex items-center gap-1.5">
      <AelBlockExpresion
        :bloque="bloque.izquierda"
        :readonly="readonly"
        @update:bloque="actualizarIzquierda"
      />
      <select
        :value="bloque.operador"
        :disabled="readonly"
        :class="CLASE_INPUT_PILL"
        class="font-mono text-xs font-semibold text-gray-500"
        @change="actualizarOperadorBinario(($event.target as HTMLSelectElement).value)"
      >
        <option v-for="op in OPERADORES_BINARIOS" :key="op" :value="op">{{ op }}</option>
      </select>
      <AelBlockExpresion
        :bloque="bloque.derecha"
        :readonly="readonly"
        @update:bloque="actualizarDerecha"
      />
      <button
        v-if="!readonly"
        type="button"
        :class="CLASE_BOTON_ESTRUCTURA"
        title="Simplificar — quedarse solo con el lado izquierdo"
        @click="simplificarBinaria"
      >
        ↩
      </button>
    </span>

    <button
      v-if="!readonly"
      type="button"
      :class="CLASE_BOTON_ESTRUCTURA"
      title="Envolver en una operación"
      @click="envolver"
    >
      ⊕
    </button>
  </span>
</template>
