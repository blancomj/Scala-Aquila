<script setup lang="ts">
// Render + edición de un BloqueExpresion.
//
// AEL-004 Fase 7 (E4+E6) construyó la edición: cada variante edita sus
// campos primitivos y reemplaza el bloque completo hacia el padre;
// "envolver" convierte cualquier expresión en el lado izquierdo de una
// nueva operación binaria y "simplificar" hace lo inverso.
//
// Fase 8 (movimientos 01/02/03/10) rehízo la presentación sin tocar nada
// de esa semántica:
//
// · 01 — el anidamiento se pinta. Una caja aparece donde `imprimirOperando()`
//   del printer pondría un paréntesis (ver necesitaAgrupador en ael-bloques).
//   Antes `(a - b) / 12` y `a - (b / 12)` se leían igual, y en solo lectura
//   —el diff de versiones— eran indistinguibles.
//
// · 02 — el chrome dejó de ser permanente. Antes cada nodo arrastraba un
//   selector de tipo, un ⊕ y, si era binaria, un ↩: 16 controles de
//   estructura contra 6 de contenido en `RETORNAR (100 - 40) / 12`, medido
//   en la app. Ahora hay un solo «⋯» por nodo, atenuado en reposo, que abre
//   las MISMAS acciones con su nombre escrito. Ninguna capacidad se pierde.
//
// · 03 — etiquetas en español. Los operadores se dibujan `+ − × ÷` y las
//   comparaciones en palabras; los tipos y contratos tienen nombre legible
//   (ael-etiquetas.ts). El interruptor «Ver sintaxis AEL» del lienzo
//   devuelve las palabras clave para quien esté aprendiendo el modo texto.
//
// · 10 — nada por debajo de 12 px, `neutral-*` en vez de `gray-*`, y las
//   expresiones ENVUELVEN en vez de desbordarse (hallazgo A7: una fórmula
//   de tres números medía 937 px en un lienzo de 494).
//
// El menú se posiciona en flujo (`absolute` dentro del nodo) y no hace falta
// Teleport porque el lienzo ya no necesita `overflow-x`: al envolver, no hay
// contenedor de recorte que pueda comerse el desplegable.
import type { BloqueExpresion, CatalogoBloques, PayloadPaleta } from '~/utils/ael-bloques'
import {
  bloqueLlamadaFuncionDesde,
  bloqueNumeroCero,
  bloqueReferenciaContractDesde,
  envolverEnBinaria,
  FABRICAS_POR_TIPO,
  MIME_PALETA_AEL,
  necesitaAgrupador,
  precedenciaDeBloque,
} from '~/utils/ael-bloques'
import {
  CLAVE_MOSTRAR_SINTAXIS,
  CLAVE_NODO_ACTIVO,
  ETIQUETA_CONTRATO,
  ETIQUETA_OPERADOR_BINARIO,
  ETIQUETA_TIPO_VALOR,
  ORIGEN_POR_CONTRATO,
  etiquetaCampo,
  etiquetaFuncion,
} from '~/utils/ael-etiquetas'
import type { OperadorBinario } from '@aquila/ael-language'

const props = defineProps<{
  bloque: BloqueExpresion
  readonly?: boolean
  catalogo?: CatalogoBloques
  /** Precedencia de la operación que contiene a este bloque — la raíz no
   * tiene ninguna. Ver `necesitaAgrupador` (mov. 01). */
  precedenciaPadre?: number
  /** Si este bloque es el operando derecho de esa operación: el parser es
   * asociativo por la izquierda, así que el lado importa. */
  esLadoDerecho?: boolean
  /** Argumento de una llamada: su menú ofrece «Quitar este argumento». */
  puedeQuitarse?: boolean
}>()
const emit = defineEmits<{ 'update:bloque': [BloqueExpresion]; quitar: [] }>()

const mostrarSintaxis = inject(CLAVE_MOSTRAR_SINTAXIS, ref(false))

// F4, mov. 06 — el lienzo recuerda cuál fue la última expresión enfocada para
// que el catálogo pueda insertar sobre ella con un clic (y con teclado), no
// solo arrastrando.
const nodoActivo = inject<{ value: string | null } | null>(CLAVE_NODO_ACTIVO, null)
function marcarActivo(): void {
  if (nodoActivo && !props.readonly) nodoActivo.value = props.bloque.id
}

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

const CONTRATOS_CONOCIDOS = ['PARAMETER', 'UNIT', 'CONCEPTO'] as const

const TIPOS_HOJA: ReadonlyArray<BloqueExpresion['tipo']> = [
  'NumeroLiteral',
  'DineroLiteral',
  'BooleanoLiteral',
  'NuloLiteral',
  'Identificador',
  'ReferenciaContract',
  'LlamadaFuncion',
]
const esTipoHoja = computed(() => TIPOS_HOJA.includes(props.bloque.tipo))

// Mismas formas léxicas que lexer.ts (Docs/02 §4/§9-10) — solo se aceptan
// ediciones que, al volver a imprimirse, sigan parseando.
const RE_NUMERO = /^\d+(\.\d+)?$/
const RE_IDENTIFICADOR = /^[a-zA-Z][a-zA-Z0-9_]*$/

// ── agrupamiento visible (mov. 01 — hallazgos C1/X1) ────────────────────
const agrupado = computed(() =>
  necesitaAgrupador(props.bloque, props.precedenciaPadre ?? -Infinity, props.esLadoDerecho ?? false),
)
const precedenciaPropia = computed(() => precedenciaDeBloque(props.bloque))

const CLASE_AGRUPADOR =
  'rounded-md border border-neutral-300 bg-neutral-100/70 px-1.5 py-0.5 dark:border-neutral-600 dark:bg-neutral-800/60'

// ── huecos explícitos (F3, mov. 05 — hallazgos C2/A6) ───────────────────
// Una referencia sin campo o una función sin nombre imprimen `PARAMETER.` y
// `()`: texto que no parsea. El resultado se anunciaba abajo, como un
// diagnóstico con línea y columna de un texto que en modo bloques no está a
// la vista, y no había forma de saber QUÉ nodo lo había causado. Ahora el
// nodo se marca a sí mismo, que es donde el usuario está mirando.
const incompleto = computed(() => {
  const b = props.bloque
  if (b.tipo === 'ReferenciaContract') return b.campo.trim() === ''
  if (b.tipo === 'LlamadaFuncion') return b.nombre.trim() === ''
  return false
})

// ── paleta de contratos (mov. 10) ───────────────────────────────────────
// Codificación por ORIGEN DEL DATO. Es categórica, no decorativa: sobrevive
// como excepción documentada en DESIGN_SYSTEM.md, igual que dataviz. Lo que
// sí se corrigió es la colisión — el contenedor SI era morado, el mismo
// morado de CONCEPTO, así que un concepto dentro de un condicional se fundía
// con su propia caja. El SI pasó a neutro (AelBlockInstruccion).
const COLOR_DEFECTO =
  'bg-white text-neutral-800 border-neutral-300 dark:bg-neutral-900 dark:text-neutral-100 dark:border-neutral-600'

const CLASE_PILDORA = 'inline-flex items-center gap-1 rounded-md border px-2 py-1 text-sm'
const CLASE_CAMPO = 'bg-transparent outline-none disabled:cursor-not-allowed disabled:opacity-70'

/** El color sale de las variables de tokens.css, que son LAS MISMAS que usa
 * el resaltado del modo texto (utils/ael-codemirror.ts). Va por :style y no
 * por clases de Tailwind precisamente para que no haya dos copias del valor
 * que puedan divergir — que es lo que pasaba antes (hallazgo X3). */
function estiloOrigen(contrato: string): Record<string, string> | undefined {
  const variable = ORIGEN_POR_CONTRATO[contrato]
  if (!variable) return undefined
  return {
    color: `var(--ael-${variable})`,
    backgroundColor: `var(--ael-${variable}-fondo)`,
    borderColor: `var(--ael-${variable}-borde)`,
  }
}

/** Garantiza que el valor actual esté seleccionable, aunque no esté en el catálogo. */
function conValorActual(opciones: readonly string[], actual: string): readonly string[] {
  return actual && !opciones.includes(actual) ? [...opciones, actual] : opciones
}

const opcionesContrato = computed(() => {
  if (props.bloque.tipo !== 'ReferenciaContract') return CONTRATOS_CONOCIDOS
  return conValorActual(CONTRATOS_CONOCIDOS, props.bloque.contrato)
})

const opcionesCampo = computed(() => {
  if (props.bloque.tipo !== 'ReferenciaContract') return []
  const catalogo = props.catalogo
  const base =
    props.bloque.contrato === 'PARAMETER'
      ? (catalogo?.parameter ?? [])
      : props.bloque.contrato === 'UNIT'
        ? (catalogo?.unit ?? [])
        : props.bloque.contrato === 'CONCEPTO'
          ? (catalogo?.concepto ?? [])
          : []
  return conValorActual(base, props.bloque.campo)
})

const opcionesFuncion = computed(() => {
  if (props.bloque.tipo !== 'LlamadaFuncion') return []
  return conValorActual(props.catalogo?.funciones ?? [], props.bloque.nombre)
})

// ── edición de campos de texto (A2) ─────────────────────────────────────
// Antes: todos confirmaban con @change —al salir del campo— y descartaban en
// silencio lo que no pasaba la expresión regular. Como el estado no cambiaba,
// el componente no se volvía a renderizar y el input SEGUÍA MOSTRANDO lo que
// el usuario escribió mientras el modelo conservaba el valor anterior: lo que
// se ve y lo que se guarda podían diferir sin ninguna señal, en un módulo que
// calcula lo que se le cobra a cada copropietario.
//
// Ahora se valida mientras se escribe, el nodo se marca en error con la razón
// a la vista, y al salir del campo se restaura el último valor válido — así
// en reposo el campo y el modelo siempre coinciden.

/** La coma decimal colombiana se acepta y se normaliza a punto SOBRE LA
 * CADENA. No pasa por Number(x): eso reescribiría "100.50" como "100.5" y
 * rompería la invariante del lexema crudo heredada de ast.ts. */
function normalizarDecimal(texto: string): string {
  return texto.trim().replace(',', '.')
}

const errorEdicion = ref<string | null>(null)

/**
 * Valida lo que se escribe y emite solo si es válido. Devuelve el valor con
 * el que debe quedar el input al salir del campo — el propio texto si valía,
 * o el último valor válido del modelo si no.
 */
function editarCampo(
  evento: Event,
  opciones: {
    normalizar?: (t: string) => string
    valida: RegExp
    mensaje: string
    aplicar: (texto: string) => void
  },
): void {
  const bruto = (evento.target as HTMLInputElement).value
  const texto = opciones.normalizar ? opciones.normalizar(bruto) : bruto.trim()
  if (!opciones.valida.test(texto)) {
    errorEdicion.value = opciones.mensaje
    return
  }
  errorEdicion.value = null
  opciones.aplicar(texto)
}

/** Al salir del campo, lo que se ve tiene que ser lo que se va a guardar. */
function restaurarSiInvalido(evento: Event, valorDelModelo: string): void {
  if (errorEdicion.value === null) {
    // Aunque fuera válido, el modelo pudo normalizar (100,50 → 100.50).
    ;(evento.target as HTMLInputElement).value = valorDelModelo
    return
  }
  ;(evento.target as HTMLInputElement).value = valorDelModelo
  errorEdicion.value = `Se restauró ${valorDelModelo}.`
}

const MENSAJE_NUMERO = 'Solo dígitos, con punto o coma para los decimales.'
const MENSAJE_IDENTIFICADOR = 'Empieza por una letra; solo letras, números y guion bajo.'

function actualizarValorNumero(evento: Event): void {
  editarCampo(evento, {
    normalizar: normalizarDecimal,
    valida: RE_NUMERO,
    mensaje: MENSAJE_NUMERO,
    aplicar: (valor) => {
      if (props.bloque.tipo === 'NumeroLiteral') emit('update:bloque', { ...props.bloque, valor })
    },
  })
}

function actualizarMontoDinero(evento: Event): void {
  editarCampo(evento, {
    normalizar: normalizarDecimal,
    valida: RE_NUMERO,
    mensaje: MENSAJE_NUMERO,
    aplicar: (monto) => {
      if (props.bloque.tipo === 'DineroLiteral') emit('update:bloque', { ...props.bloque, monto })
    },
  })
}

function actualizarMonedaDinero(evento: Event): void {
  editarCampo(evento, {
    valida: RE_IDENTIFICADOR,
    mensaje: 'Un código de moneda, como COP.',
    aplicar: (moneda) => {
      if (props.bloque.tipo === 'DineroLiteral') emit('update:bloque', { ...props.bloque, moneda })
    },
  })
}

function actualizarBooleano(valor: string): void {
  if (props.bloque.tipo !== 'BooleanoLiteral') return
  emit('update:bloque', { ...props.bloque, valor: valor === 'true' })
}

function actualizarNombreIdentificador(evento: Event): void {
  editarCampo(evento, {
    valida: RE_IDENTIFICADOR,
    mensaje: MENSAJE_IDENTIFICADOR,
    aplicar: (nombre) => {
      if (props.bloque.tipo === 'Identificador') emit('update:bloque', { ...props.bloque, nombre })
    },
  })
}

function actualizarContratoReferencia(texto: string): void {
  if (props.bloque.tipo !== 'ReferenciaContract' || !RE_IDENTIFICADOR.test(texto)) return
  emit('update:bloque', { ...props.bloque, contrato: texto })
}

function actualizarCampoReferencia(texto: string): void {
  if (props.bloque.tipo !== 'ReferenciaContract' || !RE_IDENTIFICADOR.test(texto)) return
  errorEdicion.value = null
  emit('update:bloque', { ...props.bloque, campo: texto })
}

/** Variante de texto libre del campo, cuando el catálogo no lo conoce. */
function editarCampoReferencia(evento: Event): void {
  editarCampo(evento, {
    valida: RE_IDENTIFICADOR,
    mensaje: MENSAJE_IDENTIFICADOR,
    aplicar: actualizarCampoReferencia,
  })
}

function actualizarNombreFuncion(texto: string): void {
  if (props.bloque.tipo !== 'LlamadaFuncion' || !RE_IDENTIFICADOR.test(texto)) return
  errorEdicion.value = null
  emit('update:bloque', { ...props.bloque, nombre: texto })
}

/** Variante de texto libre del nombre, cuando el catálogo está vacío. */
function editarNombreFuncion(evento: Event): void {
  editarCampo(evento, {
    valida: RE_IDENTIFICADOR,
    mensaje: MENSAJE_IDENTIFICADOR,
    aplicar: actualizarNombreFuncion,
  })
}

function actualizarArgumento(indice: number, nuevo: BloqueExpresion): void {
  if (props.bloque.tipo !== 'LlamadaFuncion') return
  const argumentos = props.bloque.argumentos.map((a, i) => (i === indice ? nuevo : a))
  emit('update:bloque', { ...props.bloque, argumentos })
}

function agregarArgumento(): void {
  if (props.bloque.tipo !== 'LlamadaFuncion') return
  emit('update:bloque', {
    ...props.bloque,
    argumentos: [...props.bloque.argumentos, bloqueNumeroCero()],
  })
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
  cerrarMenu()
}

function simplificarBinaria(): void {
  if (props.bloque.tipo !== 'ExpresionBinaria') return
  emit('update:bloque', props.bloque.izquierda)
  cerrarMenu()
}

function cambiarTipo(nuevoTipo: string): void {
  cerrarMenu()
  if (nuevoTipo === props.bloque.tipo) return
  const fabrica = FABRICAS_POR_TIPO[nuevoTipo as keyof typeof FABRICAS_POR_TIPO]
  if (!fabrica) return
  emit('update:bloque', fabrica())
}

// ── menú contextual del nodo (mov. 02) ──────────────────────────────────
// Un solo botón por nodo, atenuado en reposo. Las acciones son exactamente
// las de antes (cambiar tipo, envolver, quitar la operación, argumentos),
// pero con su nombre escrito en vez de un glifo con `title`.
const raiz = ref<HTMLElement | null>(null)
const menuAbierto = ref(false)

const tiposDisponibles = computed(() =>
  TIPOS_HOJA.map((tipo) => ({ tipo, etiqueta: ETIQUETA_TIPO_VALOR[tipo] })).filter(
    (t): t is { tipo: BloqueExpresion['tipo']; etiqueta: { texto: string; ayuda: string } } =>
      t.etiqueta !== undefined,
  ),
)

function alternarMenu(): void {
  menuAbierto.value = !menuAbierto.value
}

function cerrarMenu(): void {
  menuAbierto.value = false
}

function alPulsarFuera(evento: MouseEvent): void {
  if (raiz.value && !raiz.value.contains(evento.target as Node)) cerrarMenu()
}

watch(menuAbierto, (abierto) => {
  if (abierto) document.addEventListener('mousedown', alPulsarFuera)
  else document.removeEventListener('mousedown', alPulsarFuera)
})

onBeforeUnmount(() => document.removeEventListener('mousedown', alPulsarFuera))

// ── paleta arrastrable (Fase 7 E7) ──────────────────────────────────────
// Cada AelBlockExpresion es su propio destino: soltar un ítem reemplaza ESE
// nodo. dragover solo hace preventDefault cuando el arrastre es de la paleta
// (dataTransfer.types SÍ expone el MIME durante dragover, aunque getData no),
// así una instrucción arrastrándose sigue de largo. drop NO usa el
// modificador .stop de Vue: stopPropagation se llama a mano y solo tras
// confirmar un payload válido, porque este componente se anida dentro de sí
// mismo y sin ese guard el mismo drop burbujearía hasta el ancestro.
// F2, mov. 09 — solo las HOJAS aceptan un ítem de paleta. Antes el manejador
// estaba en el span raíz de cualquier nodo, así que soltar sobre el selector
// de operador de una binaria —o sobre el hueco entre sus operandos— la
// reemplazaba entera por una hoja y se llevaba por delante los dos operandos
// (hallazgo A4), sin confirmación y sin deshacer. Ahora una binaria
// simplemente no hace preventDefault: el navegador no dispara drop sobre
// ella, y el gesto no hace nada en vez de destruir un subárbol.
const arrastreEncima = ref(false)

const aceptaPaleta = computed(() => !props.readonly && esTipoHoja.value)

function permitirDropPaleta(evento: DragEvent): void {
  if (!aceptaPaleta.value) return
  if (!evento.dataTransfer?.types.includes(MIME_PALETA_AEL)) return
  evento.preventDefault()
  arrastreEncima.value = true
}

function salirArrastrePaleta(): void {
  arrastreEncima.value = false
}

function manejarDropPaleta(evento: DragEvent): void {
  arrastreEncima.value = false
  if (!aceptaPaleta.value) return
  const crudo = evento.dataTransfer?.getData(MIME_PALETA_AEL)
  if (!crudo) return
  let payload: PayloadPaleta
  try {
    payload = JSON.parse(crudo) as PayloadPaleta
  } catch {
    return
  }
  evento.stopPropagation()
  if (payload.kind === 'campo') {
    emit('update:bloque', bloqueReferenciaContractDesde(payload.contrato, payload.campo))
  } else {
    emit('update:bloque', bloqueLlamadaFuncionDesde(payload.nombre))
  }
}
</script>

<template>
  <span
    ref="raiz"
    class="group/nodo relative inline-flex flex-wrap items-center gap-1 align-middle"
    :class="[
      agrupado ? CLASE_AGRUPADOR : '',
      arrastreEncima ? 'rounded-md outline outline-2 outline-offset-1 outline-primary' : '',
      incompleto || errorEdicion ? 'rounded-md outline outline-2 outline-offset-1 outline-error/70' : '',
    ]"
    :data-agrupado="agrupado ? '' : undefined"
    :data-arrastre-encima="arrastreEncima ? '' : undefined"
    :data-incompleto="incompleto ? '' : undefined"
    :data-nodo-id="bloque.id"
    @focusin="marcarActivo"
    @pointerdown="marcarActivo"
    @dragover="permitirDropPaleta"
    @dragleave="salirArrastrePaleta"
    @dragend="salirArrastrePaleta"
    @drop="manejarDropPaleta"
  >
    <span
      v-if="bloque.tipo === 'NumeroLiteral'"
      :class="[CLASE_PILDORA, COLOR_DEFECTO]"
      class="font-mono tabular-nums"
    >
      <input
        :value="bloque.valor"
        :disabled="readonly"
        :class="CLASE_CAMPO"
        class="w-16 font-mono tabular-nums"
        aria-label="Número"
        @input="actualizarValorNumero"
        @blur="restaurarSiInvalido($event, bloque.valor)"
      >
    </span>

    <span
      v-else-if="bloque.tipo === 'DineroLiteral'"
      :class="[CLASE_PILDORA, COLOR_DEFECTO]"
      class="font-mono tabular-nums"
    >
      <input
        :value="bloque.monto"
        :disabled="readonly"
        :class="CLASE_CAMPO"
        class="w-20 font-mono tabular-nums"
        aria-label="Monto"
        @input="actualizarMontoDinero"
        @blur="restaurarSiInvalido($event, bloque.monto)"
      >
      <input
        :value="bloque.moneda"
        :disabled="readonly"
        :class="CLASE_CAMPO"
        class="w-11 font-mono uppercase"
        aria-label="Moneda"
        @input="actualizarMonedaDinero"
        @blur="restaurarSiInvalido($event, bloque.moneda)"
      >
    </span>

    <span v-else-if="bloque.tipo === 'BooleanoLiteral'" :class="[CLASE_PILDORA, COLOR_DEFECTO]">
      <select
        :value="String(bloque.valor)"
        :disabled="readonly"
        :class="CLASE_CAMPO"
        aria-label="Sí o no"
        @change="actualizarBooleano(($event.target as HTMLSelectElement).value)"
      >
        <option value="true">{{ mostrarSintaxis ? 'Sí (VERDADERO)' : 'Sí' }}</option>
        <option value="false">{{ mostrarSintaxis ? 'No (FALSO)' : 'No' }}</option>
      </select>
    </span>

    <span
      v-else-if="bloque.tipo === 'NuloLiteral'"
      :class="[CLASE_PILDORA, COLOR_DEFECTO]"
      class="italic text-neutral-500 dark:text-neutral-400"
    >
      {{ mostrarSintaxis ? 'Sin valor (NULO)' : 'Sin valor' }}
    </span>

    <span
      v-else-if="bloque.tipo === 'Identificador'"
      :class="[CLASE_PILDORA, COLOR_DEFECTO]"
      class="font-mono italic"
    >
      <input
        :value="bloque.nombre"
        :disabled="readonly"
        :class="CLASE_CAMPO"
        class="w-24 font-mono italic"
        aria-label="Nombre del cálculo"
        @input="actualizarNombreIdentificador"
        @blur="restaurarSiInvalido($event, bloque.nombre)"
      >
    </span>

    <span
      v-else-if="bloque.tipo === 'ReferenciaContract'"
      :class="[CLASE_PILDORA, estiloOrigen(bloque.contrato) ? '' : COLOR_DEFECTO]"
      :style="estiloOrigen(bloque.contrato)"
    >
      <select
        :value="bloque.contrato"
        :disabled="readonly"
        :class="CLASE_CAMPO"
        class="text-xs uppercase tracking-wide opacity-80"
        aria-label="Origen del dato"
        @change="actualizarContratoReferencia(($event.target as HTMLSelectElement).value)"
      >
        <option v-for="c in opcionesContrato" :key="c" :value="c">
          {{ mostrarSintaxis ? c : (ETIQUETA_CONTRATO[c] ?? c) }}
        </option>
      </select>
      <select
        v-if="opcionesCampo.length > 0"
        :value="bloque.campo"
        :disabled="readonly"
        :class="CLASE_CAMPO"
        aria-label="Campo"
        @change="actualizarCampoReferencia(($event.target as HTMLSelectElement).value)"
      >
        <option v-if="!bloque.campo" value="" disabled>— elige un campo —</option>
        <option v-for="c in opcionesCampo" :key="c" :value="c">
          {{ mostrarSintaxis ? c : etiquetaCampo(c) }}
        </option>
      </select>
      <input
        v-else
        :value="bloque.campo"
        :disabled="readonly"
        :class="CLASE_CAMPO"
        class="w-32"
        placeholder="campo"
        aria-label="Campo"
        @input="editarCampoReferencia"
        @blur="restaurarSiInvalido($event, bloque.campo)"
      >
    </span>

    <span
      v-else-if="bloque.tipo === 'LlamadaFuncion'"
      class="inline-flex flex-wrap items-center gap-1 rounded-md border px-2 py-1 text-sm"
      :style="{ color: 'var(--ael-funcion)', backgroundColor: 'var(--ael-funcion-fondo)', borderColor: 'var(--ael-funcion-borde)' }"
    >
      <select
        v-if="opcionesFuncion.length > 0"
        :value="bloque.nombre"
        :disabled="readonly"
        :class="CLASE_CAMPO"
        class="font-medium"
        aria-label="Función"
        @change="actualizarNombreFuncion(($event.target as HTMLSelectElement).value)"
      >
        <option v-if="!bloque.nombre" value="" disabled>— elige una función —</option>
        <option v-for="f in opcionesFuncion" :key="f" :value="f">
          {{ mostrarSintaxis ? f : etiquetaFuncion(f) }}
        </option>
      </select>
      <input
        v-else
        :value="bloque.nombre"
        :disabled="readonly"
        :class="CLASE_CAMPO"
        class="w-36 font-medium"
        placeholder="función"
        aria-label="Función"
        @input="editarNombreFuncion"
        @blur="restaurarSiInvalido($event, bloque.nombre)"
      >
      <span class="opacity-70">(</span>
      <template v-for="(arg, i) in bloque.argumentos" :key="arg.id">
        <span v-if="i > 0" class="opacity-70">,</span>
        <AelBlockExpresion
          :bloque="arg"
          :readonly="readonly"
          :catalogo="catalogo"
          :puede-quitarse="true"
          @update:bloque="(nuevo) => actualizarArgumento(i, nuevo)"
          @quitar="eliminarArgumento(i)"
        />
      </template>
      <span class="opacity-70">)</span>
    </span>

    <span v-else-if="bloque.tipo === 'ExpresionUnaria'" class="inline-flex items-center gap-1">
      <span class="font-mono text-sm text-neutral-600 dark:text-neutral-300">−</span>
      <!-- El printer imprime el operando de una unaria con precedencia
           Infinity, así que cualquier operación debajo lleva paréntesis. -->
      <AelBlockExpresion
        :bloque="bloque.operando"
        :readonly="readonly"
        :catalogo="catalogo"
        :precedencia-padre="Number.POSITIVE_INFINITY"
        @update:bloque="actualizarOperando"
      />
    </span>

    <span v-else class="inline-flex flex-wrap items-center gap-1.5">
      <AelBlockExpresion
        :bloque="bloque.izquierda"
        :readonly="readonly"
        :catalogo="catalogo"
        :precedencia-padre="precedenciaPropia"
        :es-lado-derecho="false"
        @update:bloque="actualizarIzquierda"
      />
      <select
        :value="bloque.operador"
        :disabled="readonly"
        :class="CLASE_CAMPO"
        class="font-semibold text-neutral-700 dark:text-neutral-200"
        :aria-label="`Operación: ${ETIQUETA_OPERADOR_BINARIO[bloque.operador]}`"
        @change="actualizarOperadorBinario(($event.target as HTMLSelectElement).value)"
      >
        <option v-for="op in OPERADORES_BINARIOS" :key="op" :value="op">
          {{ mostrarSintaxis ? op : ETIQUETA_OPERADOR_BINARIO[op] }}
        </option>
      </select>
      <AelBlockExpresion
        :bloque="bloque.derecha"
        :readonly="readonly"
        :catalogo="catalogo"
        :precedencia-padre="precedenciaPropia"
        :es-lado-derecho="true"
        @update:bloque="actualizarDerecha"
      />
    </span>

    <!-- Por qué se rechazó lo que se escribió, en el nodo y no en un
         `title` — antes no se decía nada en absoluto (A2). -->
    <span
      v-if="errorEdicion"
      role="status"
      class="absolute top-full left-0 z-40 mt-1 w-max max-w-xs rounded border border-error/40 bg-error/10 px-2 py-1 text-xs text-error"
    >
      {{ errorEdicion }}
    </span>

    <!-- ── menú contextual del nodo (mov. 02) ─────────────────────────── -->
    <button
      v-if="!readonly"
      type="button"
      class="inline-flex size-6 shrink-0 items-center justify-center rounded relative before:absolute before:-inset-1 text-sm leading-none text-neutral-400 opacity-40 transition-opacity hover:bg-neutral-100 hover:text-neutral-700 focus-visible:opacity-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary group-hover/nodo:opacity-100 dark:hover:bg-neutral-800 dark:hover:text-neutral-200"
      :class="menuAbierto ? 'opacity-100' : ''"
      :aria-expanded="menuAbierto"
      aria-haspopup="menu"
      aria-label="Acciones de este valor"
      @click="alternarMenu"
      @keydown.escape="cerrarMenu"
    >
      ⋯
    </button>

    <span
      v-if="menuAbierto"
      role="menu"
      class="absolute top-full left-0 z-50 mt-1 flex w-60 flex-col rounded-md border border-neutral-200 bg-white py-1 text-left shadow-lg dark:border-neutral-700 dark:bg-neutral-900"
      @keydown.escape="cerrarMenu"
    >
      <template v-if="esTipoHoja">
        <span class="px-3 pt-1 pb-1 text-xs font-medium tracking-wide text-neutral-500 uppercase">
          Cambiar tipo de valor
        </span>
        <button
          v-for="t in tiposDisponibles"
          :key="t.tipo"
          type="button"
          role="menuitem"
          class="px-3 py-1.5 text-left text-sm hover:bg-neutral-100 focus-visible:bg-neutral-100 focus-visible:outline-none dark:hover:bg-neutral-800 dark:focus-visible:bg-neutral-800"
          :class="t.tipo === bloque.tipo ? 'font-semibold text-primary' : ''"
          @click="cambiarTipo(t.tipo)"
        >
          {{ t.etiqueta.texto }}
        </button>
        <span class="my-1 border-t border-neutral-200 dark:border-neutral-700" />
      </template>

      <button
        type="button"
        role="menuitem"
        class="px-3 py-1.5 text-left text-sm hover:bg-neutral-100 focus-visible:bg-neutral-100 focus-visible:outline-none dark:hover:bg-neutral-800"
        @click="envolver"
      >
        Envolver en una operación
      </button>

      <button
        v-if="bloque.tipo === 'ExpresionBinaria'"
        type="button"
        role="menuitem"
        class="px-3 py-1.5 text-left text-sm text-error hover:bg-error/10 focus-visible:bg-error/10 focus-visible:outline-none"
        @click="simplificarBinaria"
      >
        Quitar la operación
        <span class="block text-xs opacity-70">Se descarta el lado derecho.</span>
      </button>

      <button
        v-if="bloque.tipo === 'LlamadaFuncion'"
        type="button"
        role="menuitem"
        class="px-3 py-1.5 text-left text-sm hover:bg-neutral-100 focus-visible:bg-neutral-100 focus-visible:outline-none dark:hover:bg-neutral-800"
        @click="agregarArgumento(); cerrarMenu()"
      >
        Agregar argumento
      </button>

      <button
        v-if="puedeQuitarse"
        type="button"
        role="menuitem"
        class="px-3 py-1.5 text-left text-sm text-error hover:bg-error/10 focus-visible:bg-error/10 focus-visible:outline-none"
        @click="emit('quitar'); cerrarMenu()"
      >
        Quitar este argumento
      </button>
    </span>
  </span>
</template>
