<script setup lang="ts" generic="TFiltros extends Record<string, ValorFiltro>">
// Panel de filtros schema-driven — evaluado contra VecindApp/Vecitienda (2026-09-18) y
// generalizado como convención transversal (ver CLAUDE.md, "Panel de filtros reutilizable").
// Reutiliza UiDrawer como cascarón (drawer lateral en desktop, pantalla completa en mobile por
// el propio CSS de .drawer) — este componente solo aporta el contenido: una sección por campo
// del schema. Todas las secciones quedan siempre visibles, sin acordeón: VecindApp traía
// chevrons de colapso por sección pero nunca los vi ocultar nada al probarlos, así que esa
// pieza no se replica.
//
// Dos modelos separados a propósito:
//   - `abierto` (v-model:abierto) — visibilidad del drawer, la controla la página.
//   - modelValue (v-model) — el borrador de useFiltros(), NO el estado aplicado.
// El panel nunca toca `aplicados` directamente: solo edita el borrador y emite
// `aplicar`/`limpiar`; la página decide qué hacer con eso (cerrar el drawer, disparar el fetch).
// Multiselección resuelta acá mismo (buscador + chips "seleccionadas"/"disponibles", mecánica
// calcada de VecindApp) en vez de extender UiSelectorBuscable — ese componente ya tiene 20+
// usos de un solo valor; agregarle un modo multi es más riesgo que crear este bloque aparte.
import type { CampoFiltro, OpcionFiltro, RangoFiltro, ValorFiltro } from '~/composables/useFiltros'

const props = withDefaults(defineProps<{ schema: CampoFiltro[]; titulo?: string }>(), {
  titulo: 'Filtros',
})

/** Un `multiselect` con menos de 4 opciones se pinta como grupo de checkboxes (todas visibles,
 * sin buscador) en vez del buscador + chips — con 2-3 opciones el buscador es puro overhead.
 * `select` sigue siendo de un solo valor: para que un campo permita elegir varios se declara
 * `multiselect` y el componente decide solo cuál de los dos widgets usar según cuántas opciones
 * tenga en ese momento (el conteo puede ser dinámico, ej. catálogos por tenant). */
const UMBRAL_CHECKBOX = 4

const emit = defineEmits<{ aplicar: []; limpiar: [] }>()

const abierto = defineModel<boolean>('abierto', { default: false })
const borrador = defineModel<TFiltros>({ required: true })

/** Texto de búsqueda por campo multiselect — un panel puede tener más de uno (ej. Ciudades y
 * Torres/bloques a la vez), cada cual con su propio filtro local. */
const busquedaPorCampo = reactive<Record<string, string>>({})

function valoresSeleccionados(clave: string): Array<string | number> {
  return (borrador.value[clave] as Array<string | number> | undefined) ?? []
}

/** Una opción con `valor: null` solo tiene sentido en un `select` ("Todos/Todas...") — un
 * `multiselect` nunca debería declarar una así, pero el tipo `OpcionFiltro` es compartido entre
 * ambos; se descarta acá para poder comparar contra `Array<string | number>` sin `as`. */
function opcionesMultiselect(opciones: OpcionFiltro[]): Array<{ valor: string | number; etiqueta: string }> {
  return opciones.filter((o): o is { valor: string | number; etiqueta: string } => o.valor !== null)
}

function opcionesDisponibles(campo: CampoFiltro & { tipo: 'multiselect' }): Array<{ valor: string | number; etiqueta: string }> {
  const seleccionadas = valoresSeleccionados(campo.clave)
  const q = (busquedaPorCampo[campo.clave] ?? '').trim().toLowerCase()
  return opcionesMultiselect(campo.opciones).filter(
    (o) => !seleccionadas.includes(o.valor) && (q === '' || o.etiqueta.toLowerCase().includes(q)),
  )
}

function opcionesSeleccionadas(campo: CampoFiltro & { tipo: 'multiselect' }): Array<{ valor: string | number; etiqueta: string }> {
  const seleccionadas = valoresSeleccionados(campo.clave)
  return opcionesMultiselect(campo.opciones).filter((o) => seleccionadas.includes(o.valor))
}

// `toRaw` — sin esto, cada campo array/objeto de `borrador.value` que NO es el que se está
// actualizando ahora mismo queda envuelto en un Proxy reactivo anidado (Vue lo envuelve al
// leerlo a través del Ref), y ese Proxy se arrastra de spread en spread hasta que
// `useFiltros().aplicar()` intenta clonarlo y revienta con DataCloneError (confirmado en
// navegador). Ver el comentario de `clonar()` en useFiltros.ts.
function actualizarCampo(clave: string, valor: ValorFiltro): void {
  borrador.value = { ...toRaw(borrador.value), [clave]: valor }
}

function agregarMultiselect(clave: string, valor: string | number): void {
  actualizarCampo(clave, [...valoresSeleccionados(clave), valor])
}

function quitarMultiselect(clave: string, valor: string | number): void {
  actualizarCampo(
    clave,
    valoresSeleccionados(clave).filter((v) => v !== valor),
  )
}

function alternarMultiselect(clave: string, valor: string | number, marcado: boolean): void {
  if (marcado) agregarMultiselect(clave, valor)
  else quitarMultiselect(clave, valor)
}

// Envuelto en función (no un cast `as` inline en el template) porque vue-eslint-parser confunde
// la barra de una unión de tipos TypeScript ("string | number | null") con la sintaxis de
// filtros de Vue 2 (`expr | filtro`) y la marca como error (vue/no-deprecated-filter).
function valorSelect(clave: string): string | number | null {
  return (borrador.value[clave] as string | number | null | undefined) ?? null
}

function rangoDe(clave: string): RangoFiltro {
  return (borrador.value[clave] as RangoFiltro | undefined) ?? { min: null, max: null }
}

function actualizarRango(clave: string, extremo: 'min' | 'max', crudo: string): void {
  const actual = rangoDe(clave)
  if (crudo.trim() === '') {
    actualizarCampo(clave, { ...actual, [extremo]: null })
    return
  }
  const numero = Number(crudo)
  if (Number.isNaN(numero)) return
  actualizarCampo(clave, { ...actual, [extremo]: numero })
}

function itemsSelect(campo: CampoFiltro & { tipo: 'select' }): Array<{ label: string; value: string | number | null }> {
  return campo.opciones.map((o) => ({ label: o.etiqueta, value: o.valor }))
}

function aplicar(): void {
  emit('aplicar')
  abierto.value = false
}
</script>

<template>
  <UiDrawer :abierto="abierto" :titulo="props.titulo" @cerrar="abierto = false">
    <div class="space-y-5">
      <div v-for="campo in schema" :key="campo.clave" class="space-y-1.5">
        <p v-if="campo.tipo !== 'boolean'" class="flex items-center gap-1.5 text-sm font-medium">
          <UIcon v-if="campo.icono" :name="campo.icono" class="size-4 text-neutral-400" />
          {{ campo.etiqueta }}
        </p>

        <UCheckbox
          v-if="campo.tipo === 'boolean'"
          :model-value="borrador[campo.clave] as boolean"
          :label="campo.etiqueta"
          @update:model-value="actualizarCampo(campo.clave, $event === true)"
        />

        <USelect
          v-else-if="campo.tipo === 'select' && !campo.buscable"
          :model-value="valorSelect(campo.clave)"
          :items="itemsSelect(campo)"
          value-key="value"
          class="w-full"
          @update:model-value="actualizarCampo(campo.clave, $event ?? null)"
        />
        <UiSelectorBuscable
          v-else-if="campo.tipo === 'select' && campo.buscable"
          :model-value="valorSelect(campo.clave)"
          :opciones="campo.opciones"
          class="w-full"
          @update:model-value="actualizarCampo(campo.clave, $event)"
        />

        <div
          v-else-if="campo.tipo === 'multiselect' && opcionesMultiselect(campo.opciones).length < UMBRAL_CHECKBOX"
          class="flex flex-col gap-2"
        >
          <UCheckbox
            v-for="op in opcionesMultiselect(campo.opciones)"
            :key="op.valor"
            :model-value="valoresSeleccionados(campo.clave).includes(op.valor)"
            :label="op.etiqueta"
            @update:model-value="alternarMultiselect(campo.clave, op.valor, $event === true)"
          />
          <p v-if="opcionesMultiselect(campo.opciones).length === 0" class="text-xs text-neutral-400">
            {{ campo.mensajeVacio ?? 'Sin opciones disponibles' }}
          </p>
        </div>
        <div v-else-if="campo.tipo === 'multiselect'" class="space-y-2">
          <UInput v-model="busquedaPorCampo[campo.clave]" size="sm" icon="i-lucide-search" placeholder="Buscar…" class="w-full" />
          <div v-if="opcionesSeleccionadas(campo).length > 0" class="flex flex-wrap gap-1.5">
            <UBadge v-for="op in opcionesSeleccionadas(campo)" :key="op.valor" color="primary" variant="subtle" class="gap-1">
              {{ op.etiqueta }}
              <button type="button" :aria-label="`Quitar ${op.etiqueta}`" @click="quitarMultiselect(campo.clave, op.valor)">
                <UIcon name="i-lucide-x" class="size-3" />
              </button>
            </UBadge>
          </div>
          <div class="flex flex-wrap gap-1.5">
            <button
              v-for="op in opcionesDisponibles(campo)"
              :key="op.valor"
              type="button"
              class="rounded-full border border-neutral-300 dark:border-neutral-700 px-2.5 py-0.5 text-xs hover:border-primary hover:text-primary"
              @click="agregarMultiselect(campo.clave, op.valor)"
            >
              {{ op.etiqueta }}
            </button>
            <span v-if="opcionesDisponibles(campo).length === 0" class="text-xs text-neutral-400">Sin más opciones</span>
          </div>
        </div>

        <div v-else-if="campo.tipo === 'rango'" class="flex items-center gap-2">
          <UInput
            type="number"
            size="sm"
            placeholder="Mín."
            class="w-full"
            :model-value="rangoDe(campo.clave).min ?? undefined"
            @update:model-value="actualizarRango(campo.clave, 'min', String($event ?? ''))"
          />
          <span class="text-neutral-400 shrink-0">–</span>
          <UInput
            type="number"
            size="sm"
            placeholder="Máx."
            class="w-full"
            :model-value="rangoDe(campo.clave).max ?? undefined"
            @update:model-value="actualizarRango(campo.clave, 'max', String($event ?? ''))"
          />
        </div>

        <UInput
          v-else-if="campo.tipo === 'texto'"
          :model-value="borrador[campo.clave] as string"
          size="sm"
          class="w-full"
          @update:model-value="actualizarCampo(campo.clave, String($event ?? ''))"
        />
      </div>
    </div>

    <template #foot>
      <UButton variant="ghost" @click="emit('limpiar')">Limpiar filtros</UButton>
      <UButton @click="aplicar">Aplicar filtros</UButton>
    </template>
  </UiDrawer>
</template>
