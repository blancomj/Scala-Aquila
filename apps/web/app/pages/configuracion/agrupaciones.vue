<script setup lang="ts">
// Agrupaciones de inmuebles — construcción del árbol (20260830250000).
//
// Es el "mecanismo de creación" que faltaba: aquí se definen los grupos una
// sola vez y después quedan disponibles para asignarlos desde la ficha de
// cada inmueble. Antes no existía ninguna forma de agrupar inmuebles — el
// catálogo AGRUPACION_PREDIOS estaba sembrado pero huérfano.
//
// El árbol se pinta plano con sangría por `nivel` en vez de con un
// componente de árbol plegable: son decenas de nodos, no cientos, y una
// tabla plana permite reusar UiTabla y mostrar el conteo de inmuebles en la
// misma fila sin inventar un layout nuevo.
//
// Mover un nodo de padre se hace editando "Depende de" en el mismo modal de
// edición (decisión explícita del usuario, en vez de drag & drop). El guard
// de BD rechaza ciclos y profundidad > 5, así que aquí no se replica esa
// validación — su mensaje llega tal cual.
definePageMeta({ layout: 'default', middleware: ['tenant', 'rbac'], permiso: 'settings:manage' })

const tenantStore = useTenantStore()
const agrupacionesStore = useAgrupacionesStore()
const cuentaStore = useCuentaCorrienteStore()
const coeficientesStore = useCoeficientesStore()

const error = ref<string | null>(null)
const guardando = ref(false)

await useAsyncData('agrupaciones-base', async () => {
  const tenantId = tenantStore.activeTenant?.id
  if (!tenantId) return null
  await Promise.all([
    agrupacionesStore.cargarTiposAgrupacion(tenantId),
    agrupacionesStore.cargarAgrupaciones(tenantId),
    cuentaStore.cargarInmuebles(tenantId),
    coeficientesStore.cargarCoeficienteSets(tenantId),
  ])
  await coeficientesStore.cargarValoresVigentes(tenantId)
  return null
})

type Nodo = (typeof agrupacionesStore.arbolPlano)[number]

// ── conteo de inmuebles por nodo (incluye descendientes) ────────────────
// El conteo del subárbol es el que sirve para decidir: "Edificio A tiene 24"
// responde la pregunta real, "0 directos" no.
const conteoPorAgrupacion = computed(() => {
  const directos = new Map<string, number>()
  for (const inmueble of cuentaStore.inmuebles) {
    const id = inmueble.agrupacion_id
    if (!id) continue
    directos.set(id, (directos.get(id) ?? 0) + 1)
  }

  const total = new Map<string, number>()
  const acumular = (nodo: Nodo): number => {
    const suma =
      (directos.get(nodo.id) ?? 0) +
      nodo.hijos.reduce((acc, hijo) => acc + acumular(hijo as Nodo), 0)
    total.set(nodo.id, suma)
    return suma
  }
  for (const raiz of agrupacionesStore.arbol) acumular(raiz as Nodo)
  return total
})

const sinAgrupar = computed(
  () => cuentaStore.inmuebles.filter((i) => !i.agrupacion_id).length,
)

/** ids del nodo + todos sus descendientes, en orden hoja→raíz — el orden que
 * exige el borrado en cascada (ver eliminarAgrupacionSubarbol). */
function idsSubarbolPostOrden(nodo: Nodo): string[] {
  const ids: string[] = []
  for (const hijo of nodo.hijos) ids.push(...idsSubarbolPostOrden(hijo as Nodo))
  ids.push(nodo.id)
  return ids
}

function contarDescendientes(nodo: Nodo): number {
  return nodo.hijos.reduce((acc, hijo) => acc + 1 + contarDescendientes(hijo as Nodo), 0)
}

// ── buscador ─────────────────────────────────────────────────────────
// Filtra sobre el árbol, no la lista plana: un "Piso 02" que matchea debe
// conservar el "Edificio principal" que lo ubica, no aparecer huérfano.
const busqueda = ref('')

function coincideBusqueda(nodo: Nodo, q: string): boolean {
  return (
    nodo.nombre.toLowerCase().includes(q) ||
    nodo.tipoNombre.toLowerCase().includes(q) ||
    (nodo.descripcion ?? '').toLowerCase().includes(q)
  )
}

function filtrarArbol(nodos: Nodo[], q: string): Nodo[] {
  const salida: Nodo[] = []
  for (const nodo of nodos) {
    const hijosFiltrados = filtrarArbol(nodo.hijos as Nodo[], q)
    if (hijosFiltrados.length > 0 || coincideBusqueda(nodo, q)) {
      salida.push({ ...nodo, hijos: hijosFiltrados })
    }
  }
  return salida
}

// ── contraer / desplegar grupos de nivel superior ───────────────────────
// El toggle vive en nivel 1 y 2 (raíz y su primer hijo) — a partir de nivel 3
// no hace falta, las ramas son cortas. Colapsar oculta TODOS los
// descendientes, sin importar cuántos niveles tengan debajo.
const colapsados = ref<Set<string>>(new Set())

function alternarColapso(id: string): void {
  const set = new Set(colapsados.value)
  if (set.has(id)) set.delete(id)
  else set.add(id)
  colapsados.value = set
}

const filasVisibles = computed<Nodo[]>(() => {
  const q = busqueda.value.trim().toLowerCase()
  const arbol = q ? filtrarArbol(agrupacionesStore.arbol as Nodo[], q) : (agrupacionesStore.arbol as Nodo[])
  const salida: Nodo[] = []
  const recorrer = (nodos: Nodo[]): void => {
    for (const nodo of nodos) {
      salida.push(nodo)
      // Buscando, se ignora el colapso: una coincidencia no debe esconderse
      // solo porque su raíz estaba contraída.
      if (!q && colapsados.value.has(nodo.id)) continue
      recorrer(nodo.hijos as Nodo[])
    }
  }
  recorrer(arbol)
  return salida
})

// ── plantilla rápida ────────────────────────────────────────────────────
// "Piso 01..10 dentro de Torre 1" en un solo modal en vez de repetir
// "Nueva agrupación" diez veces.
const plantillaAbierta = ref(false)
const plantillaTipoId = ref<number | undefined>(undefined)
const plantillaParentId = ref<string | null>(null)
const plantillaNombres = ref('')
const plantillaDescripcion = ref('')
const plantillaGuardando = ref(false)
const plantillaError = ref<string | null>(null)
const rangoDesde = ref(1)
const rangoHasta = ref(10)
const rangoCeros = ref(true)

function generarRango(): void {
  const desde = Math.min(rangoDesde.value, rangoHasta.value)
  const hasta = Math.max(rangoDesde.value, rangoHasta.value)
  const ancho = String(hasta).length
  const nombres: string[] = []
  for (let n = desde; n <= hasta; n++) {
    nombres.push(rangoCeros.value ? String(n).padStart(ancho, '0') : String(n))
  }
  plantillaNombres.value = nombres.join('\n')
}

const plantillaNombresLista = computed(() =>
  plantillaNombres.value
    .split(/\r?\n|,/)
    .map((n) => n.trim())
    .filter((n) => n.length > 0),
)

const plantillaTipoNombre = computed(
  () => agrupacionesStore.tiposAgrupacion.find((t) => t.id === plantillaTipoId.value)?.nombre ?? '',
)

const plantillaPadre = computed(() =>
  agrupacionesStore.arbolPlano.find((n) => n.id === plantillaParentId.value),
)

function abrirPlantilla(): void {
  plantillaTipoId.value = agrupacionesStore.tiposAgrupacion[0]?.id
  plantillaParentId.value = null
  plantillaNombres.value = ''
  plantillaDescripcion.value = ''
  rangoDesde.value = 1
  rangoHasta.value = 10
  rangoCeros.value = true
  plantillaError.value = null
  plantillaAbierta.value = true
}

async function guardarPlantilla(): Promise<void> {
  const tenantId = tenantStore.activeTenant?.id
  if (!tenantId || plantillaTipoId.value === undefined || plantillaNombresLista.value.length === 0) return

  plantillaError.value = null
  plantillaGuardando.value = true
  try {
    await agrupacionesStore.crearAgrupacionesLote({
      tenantId,
      tipoId: plantillaTipoId.value,
      parentId: plantillaParentId.value,
      nombres: plantillaNombresLista.value,
      descripcion: plantillaDescripcion.value,
    })
    plantillaAbierta.value = false
  } catch (excepcion) {
    plantillaError.value = mensajeError(excepcion, 'No se pudieron crear las agrupaciones.')
  } finally {
    plantillaGuardando.value = false
  }
}

// ── asignación masiva de inmuebles ──────────────────────────────────────
const asignacionAbierta = ref(false)
const asignacionAgrupacionId = ref<string | null>(null)
const asignacionSeleccion = ref<Set<string>>(new Set())
const asignacionBusqueda = ref('')
const asignacionGuardando = ref(false)
const asignacionError = ref<string | null>(null)

const inmueblesSinAgrupar = computed(() => cuentaStore.inmuebles.filter((i) => !i.agrupacion_id))

const inmueblesSinAgruparFiltrados = computed(() => {
  const q = asignacionBusqueda.value.trim().toLowerCase()
  if (!q) return inmueblesSinAgrupar.value
  return inmueblesSinAgrupar.value.filter((i) => i.codigo.toLowerCase().includes(q))
})

function abrirAsignacionMasiva(): void {
  asignacionAgrupacionId.value = null
  asignacionSeleccion.value = new Set()
  asignacionBusqueda.value = ''
  asignacionError.value = null
  asignacionAbierta.value = true
}

function alternarSeleccion(id: string): void {
  const set = new Set(asignacionSeleccion.value)
  if (set.has(id)) set.delete(id)
  else set.add(id)
  asignacionSeleccion.value = set
}

function seleccionarTodosVisibles(): void {
  const set = new Set(asignacionSeleccion.value)
  for (const i of inmueblesSinAgruparFiltrados.value) set.add(i.id)
  asignacionSeleccion.value = set
}

function limpiarSeleccion(): void {
  asignacionSeleccion.value = new Set()
}

async function confirmarAsignacionMasiva(): Promise<void> {
  const tenantId = tenantStore.activeTenant?.id
  if (!tenantId || !asignacionAgrupacionId.value || asignacionSeleccion.value.size === 0) return

  asignacionError.value = null
  asignacionGuardando.value = true
  try {
    await agrupacionesStore.asignarInmueblesAAgrupacion({
      tenantId,
      agrupacionId: asignacionAgrupacionId.value,
      inmuebleIds: [...asignacionSeleccion.value],
    })
    await cuentaStore.cargarInmuebles(tenantId)
    asignacionAbierta.value = false
  } catch (excepcion) {
    asignacionError.value = mensajeError(excepcion, 'No se pudieron asignar los inmuebles.')
  } finally {
    asignacionGuardando.value = false
  }
}

// ── coeficientes por agrupación (columnas de la tabla principal) ────────
const setVigente = computed(() =>
  coeficientesStore.coeficienteSets.find((s) => s.estado === 'vigente'),
)

const coeficienteTotalVigente = computed(() =>
  [...coeficientesStore.valoresVigentes.values()].reduce((acc, v) => acc + v, 0),
)

/** Σ coeficiente por nodo, subárbol incluido — mismo criterio que
 * conteoPorAgrupacion: "Edificio A" responde por sus pisos, no solo por lo
 * que cuelga directo de él. */
const coeficientePorAgrupacion = computed(() => {
  const directos = new Map<string, number>()
  for (const inmueble of cuentaStore.inmuebles) {
    const id = inmueble.agrupacion_id
    if (!id) continue
    const valor = coeficientesStore.valoresVigentes.get(inmueble.id)
    if (valor === undefined) continue
    directos.set(id, (directos.get(id) ?? 0) + valor)
  }

  const total = new Map<string, number>()
  const acumular = (nodo: Nodo): number => {
    const suma =
      (directos.get(nodo.id) ?? 0) +
      nodo.hijos.reduce((acc, hijo) => acc + acumular(hijo as Nodo), 0)
    total.set(nodo.id, suma)
    return suma
  }
  for (const raiz of agrupacionesStore.arbol) acumular(raiz as Nodo)
  return total
})

const sinAgruparConCoeficiente = computed(
  () =>
    cuentaStore.inmuebles.filter((i) => !i.agrupacion_id && coeficientesStore.valoresVigentes.has(i.id))
      .length,
)

function formatoCoeficiente(valor: number): string {
  return valor.toFixed(6)
}

function formatoPorcentaje(valor: number): string {
  if (coeficienteTotalVigente.value === 0) return '—'
  return `${((valor / coeficienteTotalVigente.value) * 100).toFixed(2)}%`
}

// ── modal crear / editar ───────────────────────────────────────────────
const modalAbierto = ref(false)
const editandoId = ref<string | null>(null)
const formTipoId = ref<number | undefined>(undefined)
const formNombre = ref('')
const formParentId = ref<string | null>(null)
const formDescripcion = ref('')
const formActiva = ref(true)
const formOrden = ref(0)

/** Al mover un nodo, sus propios descendientes no pueden ser el nuevo padre
 * (la BD lo rechaza con AGRUPACION_CICLO). Se filtran aquí para no ofrecer
 * una opción que va a fallar. */
const opcionesPadre = computed(() => {
  const excluidos = new Set<string>()
  if (editandoId.value) {
    const marcar = (nodo: Nodo): void => {
      excluidos.add(nodo.id)
      for (const hijo of nodo.hijos) marcar(hijo as Nodo)
    }
    const actual = agrupacionesStore.arbolPlano.find((n) => n.id === editandoId.value)
    if (actual) marcar(actual as Nodo)
  }
  return agrupacionesStore.arbolPlano.filter((n) => !excluidos.has(n.id))
})

const tipoNombreSeleccionado = computed(
  () => agrupacionesStore.tiposAgrupacion.find((t) => t.id === formTipoId.value)?.nombre ?? '',
)

/** Vista previa de dónde va a quedar el nodo — el mismo texto que después
 * verá el usuario en la ficha del inmueble. */
const rutaPrevia = computed(() => {
  const etiqueta = `${tipoNombreSeleccionado.value} ${formNombre.value.trim()}`.trim()
  if (!etiqueta) return null
  const padre = agrupacionesStore.arbolPlano.find((n) => n.id === formParentId.value)
  return padre ? `${padre.ruta} / ${etiqueta}` : etiqueta
})

function abrirNueva(parentId: string | null = null): void {
  editandoId.value = null
  formTipoId.value = agrupacionesStore.tiposAgrupacion[0]?.id
  formNombre.value = ''
  formParentId.value = parentId
  formDescripcion.value = ''
  formActiva.value = true
  formOrden.value = 0
  error.value = null
  modalAbierto.value = true
}

function abrirEdicion(nodo: Nodo): void {
  editandoId.value = nodo.id
  formTipoId.value = nodo.tipo_id
  formNombre.value = nodo.nombre
  formParentId.value = nodo.parent_id
  formDescripcion.value = nodo.descripcion ?? ''
  formActiva.value = nodo.activa
  formOrden.value = nodo.orden
  error.value = null
  modalAbierto.value = true
}

const puedeGuardar = computed(
  () => formTipoId.value !== undefined && formNombre.value.trim().length > 0,
)

async function guardar(): Promise<void> {
  const tenantId = tenantStore.activeTenant?.id
  if (!tenantId || formTipoId.value === undefined) return

  error.value = null
  guardando.value = true
  try {
    if (editandoId.value) {
      await agrupacionesStore.actualizarAgrupacion({
        id: editandoId.value,
        tenantId,
        tipoId: formTipoId.value,
        nombre: formNombre.value,
        parentId: formParentId.value,
        descripcion: formDescripcion.value,
        activa: formActiva.value,
        orden: formOrden.value,
      })
    } else {
      await agrupacionesStore.crearAgrupacion({
        tenantId,
        tipoId: formTipoId.value,
        nombre: formNombre.value,
        parentId: formParentId.value,
        descripcion: formDescripcion.value,
        activa: formActiva.value,
        orden: formOrden.value,
      })
    }
    modalAbierto.value = false
  } catch (excepcion) {
    error.value = mensajeError(excepcion, 'No se pudo guardar la agrupación.')
  } finally {
    guardando.value = false
  }
}

// ── desactivar / eliminar ──────────────────────────────────────────────
const nodoAEliminar = ref<Nodo | null>(null)

async function confirmarEliminar(): Promise<void> {
  const nodo = nodoAEliminar.value
  const tenantId = tenantStore.activeTenant?.id
  if (!nodo || !tenantId) return
  nodoAEliminar.value = null

  error.value = null
  try {
    await agrupacionesStore.eliminarAgrupacionSubarbol(idsSubarbolPostOrden(nodo), tenantId)
  } catch (excepcion) {
    // FK `on delete restrict`: si tiene hijos o inmuebles, la BD lo rechaza.
    error.value = mensajeError(
      excepcion,
      'No se pudo eliminar — probablemente tiene subgrupos o inmuebles asignados. Desactívala en su lugar.',
    )
  }
}
</script>

<template>
  <div class="space-y-6">
    <div class="flex items-start justify-between gap-4 flex-wrap">
      <div>
        <h1 class="text-xl font-semibold mb-2">Agrupaciones</h1>
        <p class="text-sm text-neutral-500 max-w-2xl">
          Organiza los inmuebles en edificios, pisos, manzanas o zonas. Se definen una vez aquí y
          después quedan disponibles para asignarlos desde la ficha de cada inmueble.
        </p>
      </div>
    </div>

    <UAlert v-if="error" color="error" variant="soft" :title="error" />

    <p v-if="agrupacionesStore.arbolPlano.length === 0" class="text-neutral-500 text-sm">
      Todavía no hay agrupaciones. Crea la primera — por ejemplo un Edificio, una Manzana o una
      Zona — y después podrás colgar niveles debajo.
    </p>

    <template v-else>
      <div class="flex items-center justify-between gap-4 flex-wrap">
        <UInput
          v-model="busqueda"
          size="sm"
          icon="i-lucide-search"
          placeholder="Buscar por nombre, tipo o descripción…"
          class="w-72"
        >
          <template v-if="busqueda" #trailing>
            <UButton
              size="xs"
              variant="ghost"
              icon="i-lucide-x"
              title="Limpiar búsqueda"
              @click="busqueda = ''"
            />
          </template>
        </UInput>

        <div class="flex items-center gap-2">
          <UButton v-if="sinAgrupar > 0" size="sm" variant="soft" @click="abrirAsignacionMasiva">
            Asignar no agrupados
          </UButton>
          <UButton size="sm" variant="soft" @click="abrirPlantilla()">Plantilla rápida</UButton>
          <UButton size="sm" @click="abrirNueva()">Nueva agrupación</UButton>
        </div>
      </div>

      <p v-if="!setVigente" class="text-xs text-neutral-400">
        No hay un set de coeficientes vigente — la columna Σ Coeficiente se ve vacía. Actívalo
        desde <NuxtLink to="/coeficientes" class="underline">Coeficientes</NuxtLink>.
      </p>

      <p v-if="busqueda && filasVisibles.length === 0" class="text-neutral-500 text-sm">
        Sin resultados para «{{ busqueda }}».
      </p>

      <UiTabla
        v-else
        :columnas="[
          { clave: 'nombre', etiqueta: 'Agrupación' },
          { clave: 'descripcion', etiqueta: 'Descripción' },
          { clave: 'inmuebles', etiqueta: 'Inmuebles', alinear: 'derecha' },
          { clave: 'coeficiente', etiqueta: 'Σ Coeficiente', alinear: 'derecha' },
          { clave: 'porcentaje', etiqueta: '% del total', alinear: 'derecha' },
          { clave: 'acciones', etiqueta: '' },
        ]"
        :filas="filasVisibles"
        :clave-fila="(nodo) => nodo.id"
      >
        <template #celda-nombre="{ fila }">
          <div
            class="flex items-center gap-2"
            :style="{ paddingLeft: `${(fila.nivel - 1) * 24}px` }"
          >
            <UButton
              v-if="fila.nivel <= 2 && fila.hijos.length > 0"
              size="xs"
              variant="ghost"
              :icon="colapsados.has(fila.id) ? 'i-lucide-chevron-right' : 'i-lucide-chevron-down'"
              :title="colapsados.has(fila.id) ? 'Desplegar' : 'Contraer'"
              @click="alternarColapso(fila.id)"
            />
            <span v-else-if="fila.nivel <= 2" class="w-6 shrink-0" />
            <UBadge :color="fila.nivel === 1 ? 'primary' : 'neutral'" variant="subtle" size="sm">
              {{ fila.tipoNombre }}
            </UBadge>
            <span :class="fila.activa ? '' : 'text-neutral-400 line-through'">{{ fila.nombre }}</span>
            <UBadge v-if="!fila.activa" color="neutral" variant="subtle" size="sm">
              Inactiva
            </UBadge>
          </div>
        </template>
        <template #celda-descripcion="{ fila }">
          <span class="text-neutral-500">{{ fila.descripcion ?? '—' }}</span>
        </template>
        <template #celda-inmuebles="{ fila }">
          <span class="tabular-nums text-neutral-500">
            {{ conteoPorAgrupacion.get(fila.id) ?? 0 }}
          </span>
        </template>
        <template #celda-coeficiente="{ fila }">
          <span class="tabular-nums text-neutral-500">
            {{ setVigente ? formatoCoeficiente(coeficientePorAgrupacion.get(fila.id) ?? 0) : '—' }}
          </span>
        </template>
        <template #celda-porcentaje="{ fila }">
          <span class="tabular-nums text-neutral-500">
            {{ setVigente ? formatoPorcentaje(coeficientePorAgrupacion.get(fila.id) ?? 0) : '—' }}
          </span>
        </template>
        <template #celda-acciones="{ fila }">
          <div class="flex justify-end gap-1">
            <UButton
              size="xs"
              variant="ghost"
              icon="i-lucide-plus"
              title="Agregar dentro"
              @click="abrirNueva(fila.id)"
            />
            <UButton
              size="xs"
              variant="ghost"
              icon="i-lucide-pencil"
              title="Editar"
              @click="abrirEdicion(fila)"
            />
            <UButton
              v-if="(conteoPorAgrupacion.get(fila.id) ?? 0) === 0"
              size="xs"
              variant="ghost"
              color="error"
              icon="i-lucide-trash-2"
              title="Eliminar"
              @click="nodoAEliminar = fila"
            />
          </div>
        </template>
      </UiTabla>

      <p v-if="setVigente && sinAgruparConCoeficiente > 0" class="text-xs text-neutral-400">
        {{ sinAgruparConCoeficiente }} inmuebles con coeficiente todavía no están agrupados — no se
        reflejan en la columna Σ Coeficiente.
      </p>
    </template>

    <!-- ── crear / editar ──────────────────────────────────────────── -->
    <UModal
      :open="modalAbierto"
      :title="editandoId ? 'Editar agrupación' : 'Nueva agrupación'"
      @update:open="(abierto) => { if (!abierto) modalAbierto = false }"
    >
      <template #body>
        <div class="space-y-4 text-sm">
          <!-- "Depende de" va primero: define dónde cuelga el nodo, y de eso
               depende cómo se lee todo lo demás. -->
          <UFormField label="Depende de" name="padre">
            <USelect
              v-model="formParentId"
              :items="[{ label: 'Nivel Superior', value: null }, ...opcionesPadre.map((n) => ({ label: n.ruta, value: n.id }))]"
              value-key="value"
              class="w-full"
            />
          </UFormField>

          <div class="grid grid-cols-3 gap-3">
            <UFormField label="Tipo" name="tipo" class="col-span-1">
              <USelect
                v-model="formTipoId"
                :items="agrupacionesStore.tiposAgrupacion.map((t) => ({ label: t.nombre, value: t.id }))"
                value-key="value"
                class="w-full"
              />
            </UFormField>

            <UFormField name="nombre" class="col-span-2">
              <template #label>
                <span class="inline-flex items-baseline gap-1.5">
                  <span>Nombre</span>
                  <span class="text-xs font-normal text-neutral-400">
                    — solo el identificador: «3», no «Piso 3»
                  </span>
                </span>
              </template>
              <UInput v-model="formNombre" placeholder="A" class="w-full" />
            </UFormField>
          </div>

          <UFormField name="descripcion">
            <template #label>
              <span class="inline-flex items-baseline gap-1.5">
                <span>Descripción</span>
                <span class="text-xs font-normal text-neutral-400">— opcional</span>
              </span>
            </template>
            <UInput
              v-model="formDescripcion"
              placeholder="Ej. Torre norte, acceso por la calle 45"
              class="w-full"
            />
          </UFormField>

          <UCheckbox v-model="formActiva">
            <template #label>Activa</template>
            <template #description>
              Al desactivarla deja de ofrecerse para asignaciones nuevas. Los inmuebles que ya la
              tienen la conservan.
            </template>
          </UCheckbox>

          <div
            v-if="rutaPrevia"
            class="rounded-md border border-primary/40 bg-primary/5 px-3 py-2 text-xs"
          >
            Quedará como <strong class="font-medium text-primary">{{ rutaPrevia }}</strong>
          </div>
        </div>
      </template>
      <template #footer>
        <div class="flex justify-end gap-2">
          <UButton variant="ghost" @click="modalAbierto = false">Cancelar</UButton>
          <UButton :loading="guardando" :disabled="!puedeGuardar" @click="guardar">
            {{ editandoId ? 'Guardar' : 'Crear' }}
          </UButton>
        </div>
      </template>
    </UModal>

    <!-- ── eliminar ────────────────────────────────────────────────── -->
    <UModal
      :open="nodoAEliminar !== null"
      title="¿Eliminar esta agrupación?"
      @update:open="(abierto) => { if (!abierto) nodoAEliminar = null }"
    >
      <template #body>
        <div v-if="nodoAEliminar" class="space-y-2 text-sm">
          <p>
            Vas a eliminar <strong>{{ nodoAEliminar.ruta }}</strong>.
          </p>
          <p class="text-neutral-500">
            <template v-if="contarDescendientes(nodoAEliminar) > 0">
              Ni esta agrupación ni sus {{ contarDescendientes(nodoAEliminar) }} subgrupo(s)
              tienen inmuebles asignados, así que se borran todos juntos sin dejar nada colgando.
            </template>
            <template v-else>
              No tiene subgrupos ni inmuebles asignados, así que se puede borrar sin dejar nada
              colgando.
            </template>
            Si más adelante vuelve a hacer falta, se crea de nuevo.
          </p>
        </div>
      </template>
      <template #footer>
        <div class="flex justify-end gap-2">
          <UButton variant="ghost" @click="nodoAEliminar = null">Cancelar</UButton>
          <UButton color="error" @click="confirmarEliminar">Eliminar</UButton>
        </div>
      </template>
    </UModal>

    <!-- ── plantilla rápida ────────────────────────────────────────── -->
    <UModal
      :open="plantillaAbierta"
      title="Plantilla rápida"
      @update:open="(abierto) => { if (!abierto) plantillaAbierta = false }"
    >
      <template #body>
        <div class="space-y-4 text-sm">
          <UFormField label="Depende de" name="plantillaPadre">
            <USelect
              v-model="plantillaParentId"
              :items="[{ label: 'Nivel Superior', value: null }, ...agrupacionesStore.arbolPlano.map((n) => ({ label: n.ruta, value: n.id }))]"
              value-key="value"
              class="w-full"
            />
          </UFormField>

          <UFormField label="Tipo" name="plantillaTipo">
            <USelect
              v-model="plantillaTipoId"
              :items="agrupacionesStore.tiposAgrupacion.map((t) => ({ label: t.nombre, value: t.id }))"
              value-key="value"
              class="w-full"
            />
          </UFormField>

          <div class="rounded-md border border-neutral-200 dark:border-neutral-800 p-3 space-y-2">
            <p class="text-xs text-neutral-500">Generar un rango numérico (opcional)</p>
            <div class="flex items-end gap-3">
              <UFormField label="Desde" name="rangoDesde" class="w-20">
                <UInput v-model.number="rangoDesde" type="number" />
              </UFormField>
              <UFormField label="Hasta" name="rangoHasta" class="w-20">
                <UInput v-model.number="rangoHasta" type="number" />
              </UFormField>
              <UCheckbox v-model="rangoCeros" label="Ceros a la izquierda" class="pb-2" />
              <UButton size="xs" variant="soft" @click="generarRango">Generar</UButton>
            </div>
          </div>

          <UFormField name="plantillaNombres">
            <template #label>
              <span class="inline-flex items-baseline gap-1.5">
                <span>Nombres</span>
                <span class="text-xs font-normal text-neutral-400">
                  — uno por línea o separados por coma
                </span>
              </span>
            </template>
            <UTextarea
              v-model="plantillaNombres"
              :rows="4"
              placeholder="01&#10;02&#10;03"
              class="w-full"
            />
          </UFormField>

          <UFormField name="plantillaDescripcion">
            <template #label>
              <span class="inline-flex items-baseline gap-1.5">
                <span>Descripción</span>
                <span class="text-xs font-normal text-neutral-400">— opcional, igual para todas</span>
              </span>
            </template>
            <UInput v-model="plantillaDescripcion" class="w-full" />
          </UFormField>

          <p v-if="plantillaNombresLista.length > 0" class="text-xs text-neutral-500">
            Se crearán {{ plantillaNombresLista.length }} agrupaciones de tipo
            <strong class="text-neutral-700 dark:text-neutral-300">{{ plantillaTipoNombre }}</strong>
            <template v-if="plantillaPadre"> dentro de {{ plantillaPadre.ruta }}</template>
            <template v-else> en el nivel superior</template>:
            {{ plantillaNombresLista.join(', ') }}
          </p>

          <UAlert v-if="plantillaError" color="error" variant="soft" :title="plantillaError" />
        </div>
      </template>
      <template #footer>
        <div class="flex justify-end gap-2">
          <UButton variant="ghost" @click="plantillaAbierta = false">Cancelar</UButton>
          <UButton
            :loading="plantillaGuardando"
            :disabled="plantillaTipoId === undefined || plantillaNombresLista.length === 0"
            @click="guardarPlantilla"
          >
            Crear {{ plantillaNombresLista.length || '' }}
          </UButton>
        </div>
      </template>
    </UModal>

    <!-- ── asignación masiva de inmuebles ─────────────────────────────── -->
    <UModal
      :open="asignacionAbierta"
      title="Asignar inmuebles a una agrupación"
      @update:open="(abierto) => { if (!abierto) asignacionAbierta = false }"
    >
      <template #body>
        <div class="space-y-3 text-sm">
          <UFormField label="Agrupación destino" name="agrupacionDestino">
            <USelect
              v-model="asignacionAgrupacionId"
              :items="[{ label: '— Selecciona —', value: null }, ...agrupacionesStore.arbolPlano.map((n) => ({ label: n.ruta, value: n.id }))]"
              value-key="value"
              class="w-full"
            />
          </UFormField>

          <div class="flex items-center justify-between gap-2">
            <UInput
              v-model="asignacionBusqueda"
              size="sm"
              icon="i-lucide-search"
              placeholder="Buscar por código…"
              class="w-48"
            />
            <div class="flex gap-2">
              <UButton size="xs" variant="ghost" @click="seleccionarTodosVisibles">
                Seleccionar visibles
              </UButton>
              <UButton size="xs" variant="ghost" @click="limpiarSeleccion">Limpiar</UButton>
            </div>
          </div>

          <div
            class="max-h-64 overflow-y-auto border border-neutral-200 dark:border-neutral-800 rounded-md divide-y divide-neutral-100 dark:divide-neutral-800"
          >
            <div
              v-for="i in inmueblesSinAgruparFiltrados"
              :key="i.id"
              class="flex items-center gap-2 px-3 py-1.5 hover:bg-neutral-50 dark:hover:bg-neutral-900"
            >
              <UCheckbox
                :model-value="asignacionSeleccion.has(i.id)"
                :label="i.codigo"
                @update:model-value="alternarSeleccion(i.id)"
              />
            </div>
            <p v-if="inmueblesSinAgruparFiltrados.length === 0" class="px-3 py-2 text-neutral-500">
              No hay inmuebles sin agrupar que coincidan.
            </p>
          </div>

          <p class="text-neutral-500">{{ asignacionSeleccion.size }} inmueble(s) seleccionado(s).</p>

          <UAlert v-if="asignacionError" color="error" variant="soft" :title="asignacionError" />
        </div>
      </template>
      <template #footer>
        <div class="flex justify-end gap-2">
          <UButton variant="ghost" @click="asignacionAbierta = false">Cancelar</UButton>
          <UButton
            :loading="asignacionGuardando"
            :disabled="!asignacionAgrupacionId || asignacionSeleccion.size === 0"
            @click="confirmarAsignacionMasiva"
          >
            Asignar {{ asignacionSeleccion.size || '' }}
          </UButton>
        </div>
      </template>
    </UModal>
  </div>
</template>
