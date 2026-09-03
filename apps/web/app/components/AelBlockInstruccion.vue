<script setup lang="ts">
// Render + edición estructural de una lista de BloqueInstruccion (el cuerpo
// de una fórmula o de una rama del condicional). Se recursa sobre sí misma
// para las ramas — mismo patrón que evaluarInstrucciones()/
// parsearInstrucciones() en el motor y el parser reales: una lista de
// instrucciones es solo eso, una lista, sin importar el anidamiento.
//
// Reordenar admite dos rutas equivalentes a propósito (decisión del usuario,
// «no podrían coexistir las 2»): los botones ↑/↓ (+ Alt+↑/Alt+↓) son la vía
// confiable y accesible y solo operan dentro de esta lista; el arrastre es
// azúcar encima y SÍ cruza ramas — usa el id real del bloque vía
// dataTransfer, no un índice local, y lo resuelve `aelMoverInstruccionGlobal`
// (lo provee AelBlockCanvas, el único componente con visión del árbol
// completo para poder quitar de una rama e insertar en otra en el mismo
// update).
//
// Fase 8 (movimientos 03 y 10) cambió solo la presentación:
// · Vocabulario en español. DEFINIR → «Calcular … como», RETORNAR →
//   «Resultado final», SI/ENTONCES/SINO → «Si / Entonces / De lo contrario».
//   FIN desapareció: era un artefacto de la gramática textual, y la caja ya
//   se cierra sola. El interruptor «Ver sintaxis AEL» del lienzo devuelve las
//   palabras clave junto a cada etiqueta.
// · El contenedor del condicional pasó de morado a neutro. El morado era el
//   mismo de CONCEPTO, así que una referencia a concepto dentro de un
//   condicional se fundía con su propia caja.
// · Los botones de fila se atenúan en reposo y aparecen al pasar el puntero
//   o al enfocar. Antes competían visualmente con el contenido.
// · «+ Cálculo / + Resultado / + Condición» son la acción principal de la
//   pantalla y ahora se ven como tal — antes eran el elemento más tenue.
import type { BloqueExpresion, BloqueInstruccion, CatalogoBloques, RutaLista } from '~/utils/ael-bloques'
import {
  bloqueCondicionalVacio,
  bloqueDeclaracionVacia,
  bloqueRetornoVacio,
} from '~/utils/ael-bloques'
import {
  CLAVE_MOSTRAR_SINTAXIS,
  CLAVE_VALORES_TRAZA,
  CLAVE_VALOR_RESULTADO,
  ETIQUETA_AGREGAR,
  ETIQUETA_CONDICIONAL,
  ETIQUETA_DECLARACION,
  ETIQUETA_DECLARACION_NEXO,
  ETIQUETA_ENTONCES,
  ETIQUETA_RETORNO,
  ETIQUETA_SINO,
} from '~/utils/ael-etiquetas'

const props = defineProps<{
  instrucciones: readonly BloqueInstruccion[]
  readonly?: boolean
  catalogo?: CatalogoBloques
  /** Camino desde la fórmula raíz hasta ESTA lista — [] para el cuerpo. */
  ruta?: RutaLista
}>()
const emit = defineEmits<{ 'update:instrucciones': [readonly BloqueInstruccion[]] }>()

const mostrarSintaxis = inject(CLAVE_MOSTRAR_SINTAXIS, ref(false))

// F4, mov. 07 — el resultado de la última «Prueba de fórmula», sobre el
// bloque que lo produce. El mapa lo provee ConceptosEditor desde la traza del
// evaluador real; acá solo se lee. Vacío mientras no se haya probado nada.
const valoresTraza = inject<{ value: Map<string, string> }>(CLAVE_VALORES_TRAZA, {
  value: new Map(),
})

function valorDe(inst: BloqueInstruccion): string | undefined {
  if (inst.tipo === 'Declaracion') return valoresTraza.value.get(inst.nombre)
  if (inst.tipo === 'Retorno') return valoresTraza.value.get(CLAVE_VALOR_RESULTADO)
  return undefined
}

const rutaPropia = computed<RutaLista>(() => props.ruta ?? [])
const moverGlobal = inject<(bloqueId: string, rutaDestino: RutaLista, indiceDestino: number) => void>(
  'aelMoverInstruccionGlobal',
  () => {},
)

const RE_IDENTIFICADOR = /^[a-zA-Z][a-zA-Z0-9_]*$/

/** «Calcular» a secas, o «Calcular (DEFINIR)» con el interruptor de sintaxis. */
function conSintaxis(etiqueta: { texto: string; sintaxis: string }): string {
  return mostrarSintaxis.value ? `${etiqueta.texto} (${etiqueta.sintaxis})` : etiqueta.texto
}

function reemplazarEnIndice(indice: number, nueva: BloqueInstruccion): void {
  emit(
    'update:instrucciones',
    props.instrucciones.map((inst, i) => (i === indice ? nueva : inst)),
  )
}

function actualizarNombreDeclaracion(indice: number, texto: string): void {
  const inst = props.instrucciones[indice]
  if (inst?.tipo !== 'Declaracion' || !RE_IDENTIFICADOR.test(texto)) return
  reemplazarEnIndice(indice, { ...inst, nombre: texto })
}

function actualizarExpresionDeclaracion(indice: number, nueva: BloqueExpresion): void {
  const inst = props.instrucciones[indice]
  if (inst?.tipo !== 'Declaracion') return
  reemplazarEnIndice(indice, { ...inst, expresion: nueva })
}

function actualizarExpresionRetorno(indice: number, nueva: BloqueExpresion): void {
  const inst = props.instrucciones[indice]
  if (inst?.tipo !== 'Retorno') return
  reemplazarEnIndice(indice, { ...inst, expresion: nueva })
}

function actualizarCondicionCondicional(indice: number, nueva: BloqueExpresion): void {
  const inst = props.instrucciones[indice]
  if (inst?.tipo !== 'Condicional') return
  reemplazarEnIndice(indice, { ...inst, condicion: nueva })
}

function actualizarEntoncesCondicional(indice: number, nuevas: readonly BloqueInstruccion[]): void {
  const inst = props.instrucciones[indice]
  if (inst?.tipo !== 'Condicional') return
  reemplazarEnIndice(indice, { ...inst, entonces: nuevas })
}

function actualizarSinoCondicional(indice: number, nuevas: readonly BloqueInstruccion[]): void {
  const inst = props.instrucciones[indice]
  if (inst?.tipo !== 'Condicional' || inst.sino === null) return
  reemplazarEnIndice(indice, { ...inst, sino: nuevas })
}

function agregarSino(indice: number): void {
  const inst = props.instrucciones[indice]
  if (inst?.tipo !== 'Condicional' || inst.sino !== null) return
  reemplazarEnIndice(indice, { ...inst, sino: [] })
}

function quitarSino(indice: number): void {
  const inst = props.instrucciones[indice]
  if (inst?.tipo !== 'Condicional' || inst.sino === null) return
  reemplazarEnIndice(indice, { ...inst, sino: null })
}

// ── estructura de la lista: agregar / eliminar / reordenar ─────────────
function agregarInstruccion(nueva: BloqueInstruccion): void {
  emit('update:instrucciones', [...props.instrucciones, nueva])
}

function eliminarInstruccion(indice: number): void {
  emit(
    'update:instrucciones',
    props.instrucciones.filter((_, i) => i !== indice),
  )
}

function moverInstruccion(origen: number, destino: number): void {
  if (origen === destino || destino < 0 || destino >= props.instrucciones.length) return
  const nuevas = [...props.instrucciones]
  const movida = nuevas.splice(origen, 1)[0]
  if (movida === undefined) return
  nuevas.splice(destino, 0, movida)
  emit('update:instrucciones', nuevas)
}

// dragstart/drop burbujean por el DOM igual que cualquier evento — una fila
// anidada vive dentro del subárbol DOM de su fila contenedora, que también es
// :draggable con su propio @dragstart/@drop. Sin stopPropagation() la fila
// ancestro reescribe el dataTransfer (o dispara un segundo soltarEn) antes de
// que el drop real se procese, moviendo el nodo equivocado.
function iniciarArrastre(id: string, evento: DragEvent): void {
  evento.stopPropagation()
  evento.dataTransfer?.setData('text/plain', id)
}

// F2, mov. 09 — el arrastre no daba ninguna señal: ni línea de inserción, ni
// resalte del destino, ni forma de soltar al final de una lista. Se soltaba a
// ciegas y el resultado se descubría después, sin poder deshacerlo.
//
// `indiceInsercion` es la posición ENTRE filas donde caería la instrucción
// (0..length), no el índice de una fila: por eso se mira si el puntero está
// en la mitad de arriba o de abajo, y por eso hay una zona extra al final.
const indiceInsercion = ref<number | null>(null)

function marcarInsercion(indice: number, evento: DragEvent): void {
  if (props.readonly) return
  const caja = (evento.currentTarget as HTMLElement).getBoundingClientRect()
  const mitadInferior = evento.clientY > caja.top + caja.height / 2
  indiceInsercion.value = mitadInferior ? indice + 1 : indice
}

function marcarInsercionFinal(): void {
  if (props.readonly) return
  indiceInsercion.value = props.instrucciones.length
}

function limpiarInsercion(): void {
  indiceInsercion.value = null
}

function soltarEn(evento: DragEvent): void {
  evento.stopPropagation()
  const destino = indiceInsercion.value
  limpiarInsercion()
  if (destino === null) return
  const bloqueId = evento.dataTransfer?.getData('text/plain')
  // Un chip de paleta también pone 'text/plain' (p. ej. "PARAMETER.AREA"), y
  // no corresponde a ninguna instrucción: encontrarRutaDeInstruccion devuelve
  // null y moverGlobal no hace nada. Es el comportamiento correcto — una
  // variable no es una instrucción.
  if (bloqueId) moverGlobal(bloqueId, rutaPropia.value, destino)
}

// Atajos de teclado — solo cuando la FILA misma tiene el foco (no un input
// hijo, evita robarle Supr/Retroceso a la edición de texto normal).
function manejarTeclado(evento: KeyboardEvent, indice: number): void {
  if (evento.target !== evento.currentTarget) return
  if (evento.key === 'Delete' || evento.key === 'Backspace') {
    evento.preventDefault()
    eliminarInstruccion(indice)
  } else if (evento.altKey && evento.key === 'ArrowUp') {
    evento.preventDefault()
    moverInstruccion(indice, indice - 1)
  } else if (evento.altKey && evento.key === 'ArrowDown') {
    evento.preventDefault()
    moverInstruccion(indice, indice + 1)
  }
}

const CLASE_ETIQUETA = 'text-xs font-medium tracking-wide text-neutral-500 dark:text-neutral-400'
const CLASE_BOTON_FILA =
  'inline-flex size-6 items-center justify-center rounded text-sm leading-none text-neutral-400 opacity-0 transition-opacity hover:bg-neutral-100 hover:text-neutral-700 focus-visible:opacity-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary disabled:opacity-0 group-hover/fila:opacity-100 group-focus-within/fila:opacity-100 dark:hover:bg-neutral-800 dark:hover:text-neutral-200'
// Los tres botones de agregar se repiten en cada lista — el cuerpo y las dos
// ramas de cada condicional. Con una sola prominencia, una fórmula con un SI
// muestra nueve botones llamativos y el contenido pierde. La regla adaptativa:
// una lista VACÍA los muestra prominentes (es cuando hacen falta y no hay nada
// más que mirar); una lista con contenido los baja a secundarios, porque ahí
// el protagonista es la fórmula.
const CLASE_BOTON_AGREGAR_PRINCIPAL =
  'rounded-md border border-primary/30 bg-primary/5 px-2.5 py-1 text-sm font-medium text-primary transition-colors hover:bg-primary/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary'
const CLASE_BOTON_AGREGAR_SUAVE =
  'rounded-md px-2 py-1 text-sm text-neutral-500 transition-colors hover:bg-primary/5 hover:text-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary dark:text-neutral-400'
const claseBotonAgregar = computed(() =>
  props.instrucciones.length === 0 ? CLASE_BOTON_AGREGAR_PRINCIPAL : CLASE_BOTON_AGREGAR_SUAVE,
)
const CLASE_NOMBRE =
  'w-28 rounded border border-neutral-300 bg-transparent px-1.5 py-0.5 font-mono text-sm font-medium outline-none focus-visible:border-primary disabled:cursor-not-allowed disabled:opacity-70 dark:border-neutral-600'
</script>

<template>
  <div class="space-y-2" @dragleave="limpiarInsercion" @dragend="limpiarInsercion">
    <template v-for="(inst, indice) in instrucciones" :key="inst.id">
      <div
        v-if="indiceInsercion === indice"
        class="h-0.5 rounded-full bg-primary"
        aria-hidden="true"
      />
      <div
        :draggable="!readonly"
        :tabindex="readonly ? undefined : 0"
        class="group/fila flex items-start gap-1.5 rounded focus:outline focus:outline-2 focus:outline-primary/50"
        @dragstart="iniciarArrastre(inst.id, $event)"
        @dragover.prevent="marcarInsercion(indice, $event)"
        @drop.prevent="soltarEn($event)"
        @keydown="manejarTeclado($event, indice)"
      >
      <span
        v-if="!readonly"
        class="mt-1.5 cursor-grab text-sm text-neutral-300 opacity-0 select-none group-hover/fila:opacity-100 dark:text-neutral-600"
        aria-hidden="true"
        title="Arrastra para reordenar (cruza las ramas del condicional)"
      >
        ⠿
      </span>

      <div class="min-w-0 flex-1">
        <!-- Valor calculado, si ya se probó la fórmula (mov. 07). -->
        <span
          v-if="valorDe(inst)"
          class="float-right ml-3 rounded border border-emerald-300 bg-emerald-50 px-2 py-0.5 font-mono text-xs tabular-nums text-emerald-900 dark:border-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-100"
        >= {{ valorDe(inst) }}</span>
        <div v-if="inst.tipo === 'Declaracion'" class="flex flex-wrap items-center gap-2">
          <span :class="CLASE_ETIQUETA">{{ conSintaxis(ETIQUETA_DECLARACION) }}</span>
          <input
            :value="inst.nombre"
            :disabled="readonly"
            :class="CLASE_NOMBRE"
            aria-label="Nombre del cálculo"
            @change="actualizarNombreDeclaracion(indice, ($event.target as HTMLInputElement).value)"
          >
          <span :class="CLASE_ETIQUETA">{{ ETIQUETA_DECLARACION_NEXO }}</span>
          <AelBlockExpresion
            :bloque="inst.expresion"
            :readonly="readonly"
            :catalogo="catalogo"
            @update:bloque="(nuevo) => actualizarExpresionDeclaracion(indice, nuevo)"
          />
        </div>

        <div v-else-if="inst.tipo === 'Retorno'" class="flex flex-wrap items-center gap-2">
          <span :class="CLASE_ETIQUETA">{{ conSintaxis(ETIQUETA_RETORNO) }}</span>
          <AelBlockExpresion
            :bloque="inst.expresion"
            :readonly="readonly"
            :catalogo="catalogo"
            @update:bloque="(nuevo) => actualizarExpresionRetorno(indice, nuevo)"
          />
        </div>

        <div
          v-else
          class="rounded-md border border-neutral-300 bg-neutral-50 p-3 dark:border-neutral-700 dark:bg-neutral-900/50"
        >
          <div class="flex flex-wrap items-center gap-2">
            <span class="text-sm font-semibold text-neutral-700 dark:text-neutral-200">
              {{ conSintaxis(ETIQUETA_CONDICIONAL) }}
            </span>
            <AelBlockExpresion
              :bloque="inst.condicion"
              :readonly="readonly"
              :catalogo="catalogo"
              @update:bloque="(nuevo) => actualizarCondicionCondicional(indice, nuevo)"
            />
          </div>

          <p :class="CLASE_ETIQUETA" class="mt-3">{{ conSintaxis(ETIQUETA_ENTONCES) }}</p>
          <div class="mt-1.5 border-l-2 border-neutral-300 pl-3 dark:border-neutral-700">
            <AelBlockInstruccion
              :instrucciones="inst.entonces"
              :readonly="readonly"
              :catalogo="catalogo"
              :ruta="[...rutaPropia, { indice, rama: 'entonces' }]"
              @update:instrucciones="(nuevas) => actualizarEntoncesCondicional(indice, nuevas)"
            />
          </div>

          <template v-if="inst.sino !== null">
            <div class="mt-3 flex items-center gap-3">
              <p :class="CLASE_ETIQUETA">{{ conSintaxis(ETIQUETA_SINO) }}</p>
              <button
                v-if="!readonly"
                type="button"
                class="text-xs text-neutral-500 underline-offset-2 hover:text-error hover:underline"
                @click="quitarSino(indice)"
              >
                Quitar esta rama
              </button>
            </div>
            <div class="mt-1.5 border-l-2 border-neutral-300 pl-3 dark:border-neutral-700">
              <AelBlockInstruccion
                :instrucciones="inst.sino"
                :readonly="readonly"
                :catalogo="catalogo"
                :ruta="[...rutaPropia, { indice, rama: 'sino' }]"
                @update:instrucciones="(nuevas) => actualizarSinoCondicional(indice, nuevas)"
              />
            </div>
          </template>
          <button
            v-else-if="!readonly"
            type="button"
            class="mt-3 text-sm text-primary underline-offset-2 hover:underline"
            @click="agregarSino(indice)"
          >
            + {{ ETIQUETA_SINO.texto }}
          </button>
        </div>
      </div>

      <div v-if="!readonly" class="flex shrink-0 items-center gap-0.5">
        <button
          type="button"
          :class="CLASE_BOTON_FILA"
          :disabled="indice === 0"
          aria-label="Mover arriba (Alt+flecha arriba)"
          @click="moverInstruccion(indice, indice - 1)"
        >
          ↑
        </button>
        <button
          type="button"
          :class="CLASE_BOTON_FILA"
          :disabled="indice === instrucciones.length - 1"
          aria-label="Mover abajo (Alt+flecha abajo)"
          @click="moverInstruccion(indice, indice + 1)"
        >
          ↓
        </button>
        <button
          type="button"
          :class="CLASE_BOTON_FILA"
          class="hover:!text-error"
          aria-label="Eliminar esta instrucción (Supr)"
          @click="eliminarInstruccion(indice)"
        >
          ✕
        </button>
        </div>
      </div>
    </template>

    <!-- Destino al final de la lista: sin esto no había forma de mover una
         instrucción después de la última — solo se podía soltar SOBRE una
         fila existente. -->
    <div
      v-if="!readonly"
      class="min-h-2"
      @dragover.prevent="marcarInsercionFinal"
      @drop.prevent="soltarEn($event)"
    >
      <div
        v-if="indiceInsercion === instrucciones.length && instrucciones.length > 0"
        class="h-0.5 rounded-full bg-primary"
        aria-hidden="true"
      />
    </div>

    <div v-if="!readonly" class="flex flex-wrap items-center gap-2 pt-1">
      <button
        type="button"
        :class="claseBotonAgregar"
        @click="agregarInstruccion(bloqueDeclaracionVacia())"
      >
        + {{ ETIQUETA_AGREGAR.declaracion }}
      </button>
      <button
        type="button"
        :class="claseBotonAgregar"
        @click="agregarInstruccion(bloqueRetornoVacio())"
      >
        + {{ ETIQUETA_AGREGAR.retorno }}
      </button>
      <button
        type="button"
        :class="claseBotonAgregar"
        @click="agregarInstruccion(bloqueCondicionalVacio())"
      >
        + {{ ETIQUETA_AGREGAR.condicional }}
      </button>
    </div>
  </div>
</template>
