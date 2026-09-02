<script setup lang="ts">
// Combobox buscable genérico — reemplaza <select> nativos de catálogo (tipo de
// inmueble, roles, terceros, rubros, fundamentos...) que pueden crecer y se
// vuelven incómodos de recorrer sin filtro. No depende de Nuxt UI (USelectMenu
// está instalado pero sin theming propio en este repo, ver DECISIONES) — sigue
// el mismo criterio de componente hecho a mano que BusquedaGlobal.vue /
// NavTenantSwitcher.vue, reutilizando sus patrones de teclado y cierre.
//
// `variante` decide el sistema visual: 'ficha' delega el color/tipografía a
// las reglas .selector-buscable-*.is-ficha en assets/css/ficha-inmueble.css
// (mismos tokens que .field select / select.cat-select — cero cambio visual);
// 'tailwind' (default) aplica utilidades inline iguales a las que ya traían
// los <select> nativos del resto de la app.
export interface OpcionSelectorBuscable {
  valor: string | number | null
  etiqueta: string
}

const props = withDefaults(
  defineProps<{
    modelValue: string | number | null
    opciones: OpcionSelectorBuscable[]
    id?: string
    placeholder?: string
    deshabilitado?: boolean
    variante?: 'ficha' | 'tailwind'
    compacta?: boolean
  }>(),
  {
    id: undefined,
    placeholder: 'Selecciona…',
    deshabilitado: false,
    variante: 'tailwind',
    compacta: false,
  },
)

const emit = defineEmits<{ 'update:modelValue': [string | number | null] }>()

const abierto = ref(false)
const busqueda = ref('')
const indiceActivo = ref(-1)
const contenedorRef = ref<HTMLElement | null>(null)
const triggerRef = ref<HTMLButtonElement | null>(null)
const inputBusquedaRef = ref<HTMLInputElement | null>(null)
const opcionRefs = ref<(HTMLLIElement | null)[]>([])

const RANGO_DIACRITICOS = new RegExp('[̀-ͯ]', 'g')

function normalizar(texto: string): string {
  return texto.normalize('NFD').replace(RANGO_DIACRITICOS, '').toLowerCase()
}

const opcionesFiltradas = computed(() => {
  const q = normalizar(busqueda.value.trim())
  if (!q) return props.opciones
  return props.opciones.filter((o) => normalizar(o.etiqueta).includes(q))
})

const opcionSeleccionada = computed(
  () => props.opciones.find((o) => o.valor === props.modelValue) ?? null,
)

function abrir(): void {
  if (props.deshabilitado) return
  busqueda.value = ''
  abierto.value = true
  const actual = props.opciones.findIndex((o) => o.valor === props.modelValue)
  indiceActivo.value = actual >= 0 ? actual : props.opciones.length > 0 ? 0 : -1
  nextTick(() => inputBusquedaRef.value?.focus())
}

function cerrar(): void {
  abierto.value = false
}

function alternar(): void {
  if (abierto.value) cerrar()
  else abrir()
}

function seleccionar(opcion: OpcionSelectorBuscable): void {
  emit('update:modelValue', opcion.valor)
  cerrar()
  nextTick(() => triggerRef.value?.focus())
}

function onArrow(direccion: 1 | -1): void {
  const total = opcionesFiltradas.value.length
  if (total === 0) return
  const siguiente = indiceActivo.value + direccion
  indiceActivo.value = ((siguiente % total) + total) % total
}

function onEnter(): void {
  const opcion = opcionesFiltradas.value[indiceActivo.value]
  if (opcion) seleccionar(opcion)
}

function onEscape(): void {
  cerrar()
  triggerRef.value?.focus()
}

function alPerderFoco(evento: FocusEvent): void {
  const siguiente = evento.relatedTarget as Node | null
  if (siguiente && contenedorRef.value?.contains(siguiente)) return
  abierto.value = false
}

watch(busqueda, () => {
  indiceActivo.value = opcionesFiltradas.value.length > 0 ? 0 : -1
})

watch(indiceActivo, (i) => {
  nextTick(() => opcionRefs.value[i]?.scrollIntoView({ block: 'nearest' }))
})
</script>

<template>
  <div ref="contenedorRef" class="selector-buscable" @focusout="alPerderFoco">
    <button
      :id="id"
      ref="triggerRef"
      type="button"
      class="selector-buscable-trigger"
      :class="
        variante === 'ficha'
          ? ['is-ficha', { 'is-compacta': compacta }]
          : 'rounded-md border border-neutral-300 dark:border-neutral-700 bg-transparent px-2 py-1.5 text-sm'
      "
      :disabled="deshabilitado"
      :aria-expanded="abierto"
      aria-haspopup="listbox"
      @click="alternar"
    >
      <span
        class="selector-buscable-etiqueta"
        :class="{ 'is-placeholder': !opcionSeleccionada }"
      >{{ opcionSeleccionada?.etiqueta ?? placeholder }}</span>
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="selector-buscable-chevron w-3.5 h-3.5">
        <path d="M6 9l6 6 6-6" />
      </svg>
    </button>

    <div
      v-if="abierto"
      class="selector-buscable-panel"
      :class="variante === 'ficha' ? 'is-ficha' : 'bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-md shadow-lg'"
    >
      <div class="relative">
        <input
          ref="inputBusquedaRef"
          v-model="busqueda"
          type="text"
          placeholder="Buscar…"
          class="selector-buscable-busqueda"
          :class="[
            variante === 'ficha' ? 'is-ficha' : 'border-b border-neutral-200 dark:border-neutral-800 px-2.5 py-1.5 text-sm',
            busqueda ? 'pr-7' : '',
          ]"
          @keydown.down.prevent="onArrow(1)"
          @keydown.up.prevent="onArrow(-1)"
          @keydown.enter.prevent="onEnter"
          @keydown.esc="onEscape"
        >
        <button
          v-if="busqueda"
          type="button"
          class="absolute right-1.5 top-1/2 -translate-y-1/2 rounded p-0.5 text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-300"
          @click="busqueda = ''"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="size-3.5">
            <path d="M18 6L6 18M6 6l12 12" />
          </svg>
        </button>
      </div>
      <ul class="selector-buscable-lista" role="listbox">
        <li
          v-for="(op, i) in opcionesFiltradas"
          :key="op.valor === null ? '__null__' : op.valor"
          :ref="(el) => (opcionRefs[i] = el as HTMLLIElement)"
          role="option"
          :aria-selected="op.valor === modelValue"
          class="selector-buscable-opcion"
          :class="[
            variante === 'ficha' ? 'is-ficha' : 'px-2.5 py-1.5 text-sm',
            {
              'is-activa': i === indiceActivo,
              'is-seleccionada': op.valor === modelValue,
            },
          ]"
          @mousedown.prevent="seleccionar(op)"
          @mouseenter="indiceActivo = i"
        >
          {{ op.etiqueta }}
        </li>
        <li
          v-if="opcionesFiltradas.length === 0"
          class="selector-buscable-vacio"
          :class="variante === 'ficha' ? 'is-ficha' : 'px-2.5 py-1.5 text-sm text-neutral-400'"
        >
          Sin resultados
        </li>
      </ul>
    </div>
  </div>
</template>

<style scoped>
.selector-buscable {
  position: relative;
}
.selector-buscable-trigger {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  width: 100%;
  cursor: pointer;
}
.selector-buscable-trigger:disabled {
  cursor: not-allowed;
  opacity: 0.6;
}
.selector-buscable-etiqueta {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  text-align: left;
}
.selector-buscable-etiqueta.is-placeholder {
  opacity: 0.55;
}
.selector-buscable-chevron {
  flex-shrink: 0;
  opacity: 0.5;
}
.selector-buscable-panel {
  position: absolute;
  top: calc(100% + 4px);
  left: 0;
  right: 0;
  z-index: 40;
  display: flex;
  flex-direction: column;
  max-height: 280px;
  overflow: hidden;
}
.selector-buscable-busqueda {
  width: 100%;
  outline: none;
  flex-shrink: 0;
}
.selector-buscable-lista {
  list-style: none;
  margin: 0;
  padding: 4px;
  overflow-y: auto;
}
.selector-buscable-opcion {
  cursor: pointer;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
</style>
