<script setup lang="ts">
// Lienzo editable del constructor visual.
//
// El AST v0 es pequeño y cerrado por diseño (sin listas/Y-O-NO/MIENTRAS,
// AD-21): todo lo que parsear() acepta es representable en bloques sin
// excepción — la única degradación posible es binaria (el texto no parsea).
// Ese caso se defiende aquí, con el mensaje de abajo; la semilla para una
// fórmula vacía y la continuidad al cambiar de modo llegan con F3
// (movimiento 05).
//
// Fase 8 (movimientos 03 y 10): encabezado con el nombre de la fórmula en
// lenguaje llano, interruptor «Ver sintaxis AEL» —apagado por defecto, para
// quien esté aprendiendo el modo texto— y leyenda del código de color por
// origen del dato. El interruptor se provee al árbol entero: cada nodo lo
// consulta por inyección en vez de recibirlo como prop por cinco niveles.
import type {
  BloqueExpresion,
  BloqueInstruccion,
  BloqueRegla,
  CatalogoBloques,
  RutaLista,
} from '~/utils/ael-bloques'
import {
  encontrarRutaDeInstruccion,
  moverInstruccionEntreListas,
  reemplazarExpresionPorId,
} from '~/utils/ael-bloques'
import { CLAVE_MOSTRAR_SINTAXIS, CLAVE_NODO_ACTIVO, ETIQUETA_REGLA } from '~/utils/ael-etiquetas'

const props = defineProps<{
  bloque: BloqueRegla | null
  readonly?: boolean
  catalogo?: CatalogoBloques
}>()
const emit = defineEmits<{ 'update:bloque': [BloqueRegla] }>()

const RE_IDENTIFICADOR = /^[a-zA-Z][a-zA-Z0-9_]*$/

const mostrarSintaxis = ref(false)
provide(CLAVE_MOSTRAR_SINTAXIS, mostrarSintaxis)

// ── deshacer / rehacer (F2, mov. 04 — hallazgo C3) ──────────────────────
// Hasta la Fase 8 el lienzo no tenía red: «Quitar la operación» descartaba un
// subárbol entero, ✕ borraba la instrucción y Retroceso sobre una fila
// enfocada la eliminaba, todo irreversible y sin confirmación. El modo texto
// sí tenía deshacer, porque lo trae CodeMirror; al pasar a bloques el usuario
// lo perdía sin que nada se lo dijera.
//
// El árbol ya es inmutable —cada edición produce un BloqueRegla nuevo— así
// que el historial es literalmente un arreglo de referencias: no hay que
// clonar ni serializar nada. Se observa la prop en vez de interceptar cada
// mutación, porque así entra TODO cambio (botones, menús, arrastre, teclado)
// sin tener que acordarse de registrar cada uno.
//
// El historial vive aquí y no en el padre a propósito: al salir a modo texto
// este componente se desmonta y el historial se descarta, que es justo lo
// correcto — el texto pasa a ser la fuente y su propio deshacer toma el
// relevo.
const LIMITE_HISTORIAL = 50
const historial = ref<BloqueRegla[]>([])
const posicion = ref(-1)
/** Evita que el propio emit de deshacer/rehacer se registre como paso nuevo. */
let aplicandoHistorial = false

watch(
  () => props.bloque,
  (nuevo) => {
    if (nuevo === null) return
    if (aplicandoHistorial) {
      aplicandoHistorial = false
      return
    }
    // Al rehacer y luego editar, la rama de «rehacer» deja de tener sentido.
    const truncado = historial.value.slice(0, posicion.value + 1)
    truncado.push(nuevo)
    const sobrante = Math.max(0, truncado.length - LIMITE_HISTORIAL)
    historial.value = truncado.slice(sobrante)
    posicion.value = historial.value.length - 1
  },
  { immediate: true },
)

const puedeDeshacer = computed(() => posicion.value > 0)
const puedeRehacer = computed(() => posicion.value < historial.value.length - 1)

function irAPaso(nuevaPosicion: number): void {
  const destino = historial.value[nuevaPosicion]
  if (!destino) return
  posicion.value = nuevaPosicion
  aplicandoHistorial = true
  emit('update:bloque', destino)
}

function deshacer(): void {
  if (puedeDeshacer.value) irAPaso(posicion.value - 1)
}

function rehacer(): void {
  if (puedeRehacer.value) irAPaso(posicion.value + 1)
}

// Los eventos burbujean desde cualquier control del lienzo, así que basta un
// manejador en la raíz — sin listener global que se quede colgado ni que
// robe el atajo cuando el foco está en otra parte de la página.
function manejarAtajos(evento: KeyboardEvent): void {
  if (props.readonly || !(evento.ctrlKey || evento.metaKey)) return
  const tecla = evento.key.toLowerCase()
  if (tecla === 'z' && !evento.shiftKey) {
    evento.preventDefault()
    deshacer()
  } else if ((tecla === 'z' && evento.shiftKey) || tecla === 'y') {
    evento.preventDefault()
    rehacer()
  }
}

/** Leyenda del código de color. Es categórico (origen del dato), no el acento
 * de marca — excepción documentada en DESIGN_SYSTEM.md, igual que dataviz.
 * Antes no existía ninguna leyenda y el morado de CONCEPTO chocaba con el del
 * contenedor del condicional, que ya pasó a neutro. */
const LEYENDA = [
  { etiqueta: 'Parámetro', variable: 'parametro' },
  { etiqueta: 'Inmueble', variable: 'inmueble' },
  { etiqueta: 'Concepto', variable: 'concepto' },
  { etiqueta: 'Función', variable: 'funcion' },
] as const

function estiloLeyenda(variable: string): Record<string, string> {
  return {
    color: `var(--ael-${variable})`,
    backgroundColor: `var(--ael-${variable}-fondo)`,
    borderColor: `var(--ael-${variable}-borde)`,
  }
}

function actualizarNombreRegla(texto: string): void {
  if (props.bloque === null || !RE_IDENTIFICADOR.test(texto)) return
  emit('update:bloque', { ...props.bloque, nombre: texto })
}

function actualizarCuerpo(nuevoCuerpo: readonly BloqueInstruccion[]): void {
  if (props.bloque === null) return
  emit('update:bloque', { ...props.bloque, cuerpo: nuevoCuerpo })
}

// Único punto con visión del árbol completo — mover una instrucción entre
// ramas distintas exige quitarla de una lista e insertarla en otra en el
// mismo update, algo que ningún AelBlockInstruccion individual puede hacer
// por sí solo (cada uno solo ve y muta su propia lista).
function moverInstruccionGlobal(bloqueId: string, rutaDestino: RutaLista, indiceDestino: number): void {
  if (props.bloque === null) return
  const encontrada = encontrarRutaDeInstruccion(props.bloque.cuerpo, bloqueId)
  if (!encontrada) return
  const nuevo = moverInstruccionEntreListas(
    props.bloque,
    encontrada.ruta,
    encontrada.indice,
    rutaDestino,
    indiceDestino,
  )
  emit('update:bloque', nuevo)
}
provide('aelMoverInstruccionGlobal', moverInstruccionGlobal)

// ── catálogo único: insertar sobre el nodo activo (F4, mov. 06) ─────────
// El panel «Variables disponibles» ahora sirve a los dos modos. En bloques no
// hay cursor, así que el destino es la última expresión que recibió el foco o
// el puntero. Si no hay ninguna todavía, se reemplaza la expresión del último
// resultado — es el destino más probable en una fórmula recién sembrada.
const nodoActivo = ref<string | null>(null)
provide(CLAVE_NODO_ACTIVO, nodoActivo)

function idDeDestinoPorDefecto(): string | null {
  const cuerpo = props.bloque?.cuerpo ?? []
  for (let i = cuerpo.length - 1; i >= 0; i--) {
    const inst = cuerpo[i]
    if (inst?.tipo === 'Retorno') return inst.expresion.id
    if (inst?.tipo === 'Declaracion') return inst.expresion.id
  }
  return null
}

/** Reemplaza el nodo activo por `nueva`. Devuelve false si no había destino
 * —árbol vacío o sin resultado— para que el padre pueda avisar. */
function insertarEnNodoActivo(nueva: BloqueExpresion): boolean {
  if (props.bloque === null || props.readonly) return false
  const objetivo = nodoActivo.value ?? idDeDestinoPorDefecto()
  if (!objetivo) return false
  emit('update:bloque', reemplazarExpresionPorId(props.bloque, objetivo, nueva))
  nodoActivo.value = nueva.id
  return true
}

defineExpose({ insertarEnNodoActivo })
</script>

<template>
  <div
    class="rounded-lg border border-neutral-200 bg-neutral-50/60 p-4 dark:border-neutral-800 dark:bg-neutral-900/30"
    @keydown="manejarAtajos"
  >
    <template v-if="bloque">
      <div class="mb-4 flex flex-wrap items-center justify-between gap-3 border-b border-neutral-200 pb-3 dark:border-neutral-800">
        <div class="flex items-center gap-2">
          <span class="text-xs font-medium tracking-wide text-neutral-500 uppercase dark:text-neutral-400">
            {{ mostrarSintaxis ? `${ETIQUETA_REGLA.texto} (${ETIQUETA_REGLA.sintaxis})` : ETIQUETA_REGLA.texto }}
          </span>
          <input
            :value="bloque.nombre"
            :disabled="readonly"
            class="w-44 rounded border border-neutral-300 bg-transparent px-2 py-1 font-mono text-sm font-medium outline-none focus-visible:border-primary disabled:cursor-not-allowed disabled:opacity-70 dark:border-neutral-600"
            aria-label="Nombre de la fórmula"
            @change="actualizarNombreRegla(($event.target as HTMLInputElement).value)"
          >
        </div>

        <div class="flex items-center gap-3">
          <div v-if="!readonly" class="flex items-center gap-1">
            <button
              type="button"
              class="rounded px-2 py-1 text-sm text-neutral-600 transition-colors hover:bg-neutral-200 disabled:cursor-not-allowed disabled:opacity-40 focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary dark:text-neutral-300 dark:hover:bg-neutral-800"
              :disabled="!puedeDeshacer"
              aria-label="Deshacer (Ctrl+Z)"
              title="Deshacer (Ctrl+Z)"
              @click="deshacer"
            >
              ↶
            </button>
            <button
              type="button"
              class="rounded px-2 py-1 text-sm text-neutral-600 transition-colors hover:bg-neutral-200 disabled:cursor-not-allowed disabled:opacity-40 focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary dark:text-neutral-300 dark:hover:bg-neutral-800"
              :disabled="!puedeRehacer"
              aria-label="Rehacer (Ctrl+Mayús+Z)"
              title="Rehacer (Ctrl+Mayús+Z)"
              @click="rehacer"
            >
              ↷
            </button>
          </div>

          <label class="flex cursor-pointer items-center gap-2 text-xs text-neutral-500 dark:text-neutral-400">
            <input v-model="mostrarSintaxis" type="checkbox" class="accent-primary">
            Ver sintaxis AEL
          </label>
        </div>
      </div>

      <AelBlockInstruccion
        v-if="bloque.cuerpo.length > 0"
        :instrucciones="bloque.cuerpo"
        :readonly="readonly"
        :catalogo="catalogo"
        @update:instrucciones="actualizarCuerpo"
      />
      <p v-else class="text-sm text-neutral-500 dark:text-neutral-400">
        Esta fórmula todavía no tiene instrucciones. Empieza por un cálculo o un resultado.
      </p>

      <div class="mt-4 flex flex-wrap items-center gap-x-3 gap-y-1.5 border-t border-neutral-200 pt-3 dark:border-neutral-800">
        <span class="text-xs text-neutral-500 dark:text-neutral-400">Origen del dato:</span>
        <span
          v-for="item in LEYENDA"
          :key="item.etiqueta"
          class="rounded border px-1.5 py-0.5 text-xs"
          :style="estiloLeyenda(item.variable)"
        >
          {{ item.etiqueta }}
        </span>
      </div>
    </template>

    <p v-else class="text-sm text-neutral-500 dark:text-neutral-400">
      El texto actual tiene errores de sintaxis — corrígelo en modo texto para ver el constructor
      visual.
    </p>
  </div>
</template>
