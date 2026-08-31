<script setup lang="ts">
// PC-6 · Plan de cuentas contable de la copropiedad.
//
// Es un catálogo DISTINTO del árbol presupuestal, y la pantalla lo dice explícitamente: son las
// dos estructuras que el prompt maestro §60 exige mantener separadas ("¿qué es contablemente?"
// vs. "¿en qué partida se planeó?"). Nombrarlas igual invitaría a fusionarlas, que es
// justamente lo que no debe pasar.
//
// El plan no se crea a mano: se instancia desde la plantilla global (PC-2) y desde ahí se
// personaliza. Como fn_instanciar_plan_contable es idempotente, el mismo botón sirve para
// instalarlo y para agregar después las cuentas opcionales — no hay dos flujos que mantener.
import type { ContableCuentaNodo } from '~/stores/contabilidad'

definePageMeta({ layout: 'default', middleware: ['tenant', 'rbac'], permiso: 'data:create' })

const tenantStore = useTenantStore()
const contabilidadStore = useContabilidadStore()
const fundamentoStore = useFundamentoNormativoStore()

const error = ref<string | null>(null)
const aviso = ref<string | null>(null)
const trabajando = ref(false)
const busqueda = ref('')
const soloMovimiento = ref(false)
const colapsados = ref(new Set<string>())

// ── resumen (tarjetas, plegable) ─────────────────────────────────────────
// Cookie, no localStorage: mismo criterio que inmuebles/index.vue (localStorage produce
// hydration mismatch porque el servidor no puede leerlo en el primer render). Arranca cerrado
// (feedback de usuario, 2026-08-24): a diferencia de inmuebles/index.vue, aquí tanto el resumen
// como el árbol de cuentas deben verse cerrados al entrar a la pantalla.
const resumenExpandido = useCookie<boolean>('contable-plan-resumen-expandido', { default: () => false })

await useAsyncData('contable-plan', async () => {
  const tenantId = tenantStore.activeTenant?.id
  if (!tenantId) return null
  await Promise.all([
    contabilidadStore.cargarPlan(tenantId),
    contabilidadStore.cargarCuentasPresupuestales(tenantId),
    contabilidadStore.cargarPlantilla(),
    fundamentoStore.cargarFundamentos(),
  ])
  return true
})

// El árbol también arranca contraído — misma lógica que el botón "Contraer todo" (colapsarTodo,
// abajo), aplicada una vez al cargar en vez de dejar el primer render con todo expandido.
colapsarTodo()

/** "¿de dónde salió este valor?" también aplica al plan de cuentas (prompt maestro §58): cuando
 * una cuenta existe por una razón que no es obvia por el nombre —el caso central es el fondo de
 * imprevistos, activo y no pasivo por doctrina explícita del CTCP (PC-7)—, esto resuelve el
 * fundamento sin que el usuario tenga que ir a mirar la base de datos. */
const fundamentoPorId = computed(
  () => new Map(fundamentoStore.fundamentos.map((f) => [f.id, f])),
)
function fundamentoDe(codigo: string) {
  const id = contabilidadStore.fundamentoPorCodigo.get(codigo)
  return id === undefined ? null : (fundamentoPorId.value.get(id) ?? null)
}

const NOMBRE_CLASE: Record<number, string> = {
  1: 'Activo',
  2: 'Pasivo',
  3: 'Patrimonio',
  4: 'Ingresos',
  5: 'Gastos',
  6: 'Costos',
  8: 'Cuentas de orden',
}

/** Aplana el árbol respetando el colapso, para pintarlo en una sola tabla con indentación.
 * Un filtro activo desactiva el colapso: si el usuario busca "5405", no tiene sentido que la
 * fila siga escondida bajo un grupo cerrado. */
const filas = computed<ContableCuentaNodo[]>(() => {
  const termino = busqueda.value.trim().toLowerCase()
  const filtrando = termino.length > 0 || soloMovimiento.value

  const salida: ContableCuentaNodo[] = []
  const coincide = (n: ContableCuentaNodo): boolean => {
    if (soloMovimiento.value && !n.permite_movimiento) return false
    if (!termino) return true
    return n.codigo.toLowerCase().includes(termino) || n.nombre.toLowerCase().includes(termino)
  }

  const recorrer = (nodos: ContableCuentaNodo[]): void => {
    for (const n of nodos) {
      if (filtrando) {
        if (coincide(n)) salida.push(n)
        recorrer(n.hijos)
      } else {
        salida.push(n)
        if (!colapsados.value.has(n.codigo)) recorrer(n.hijos)
      }
    }
  }
  recorrer(contabilidadStore.arbol)
  return salida
})

const filtrando = computed(() => busqueda.value.trim().length > 0 || soloMovimiento.value)

const resumen = computed(() => {
  const todas = contabilidadStore.cuentas
  return {
    total: todas.length,
    movimiento: todas.filter((c) => c.permite_movimiento).length,
    inactivas: todas.filter((c) => !c.activa).length,
    clases: new Set(todas.map((c) => c.clase)).size,
  }
})

/** Las clases 6 y 8 y el fondo de reserva son opcionales (PC-01 §3.3): si no están, se pueden
 * agregar sin tocar el resto del plan. */
const faltanOpcionales = computed(
  () => contabilidadStore.tienePlan && !contabilidadStore.cuentas.some((c) => c.clase === 6),
)

function alternar(codigo: string): void {
  const set = new Set(colapsados.value)
  if (set.has(codigo)) set.delete(codigo)
  else set.add(codigo)
  colapsados.value = set
}

function colapsarTodo(): void {
  colapsados.value = new Set(
    contabilidadStore.cuentas.filter((c) => !c.permite_movimiento).map((c) => c.codigo),
  )
}

async function instalar(incluirOpcionales: boolean): Promise<void> {
  const tenantId = tenantStore.activeTenant?.id
  if (!tenantId) return
  trabajando.value = true
  error.value = null
  aviso.value = null
  try {
    const r = await contabilidadStore.instanciarPlan(tenantId, incluirOpcionales)
    await contabilidadStore.cargarCuentasPresupuestales(tenantId)
    aviso.value =
      r.creadas > 0
        ? `Se agregaron ${r.creadas} cuentas al plan.`
        : 'El plan ya estaba completo: no había cuentas nuevas que agregar.'
  } catch (excepcion) {
    error.value = mensajeError(excepcion, 'No se pudo instalar el plan de cuentas.')
  } finally {
    trabajando.value = false
  }
}

async function alternarActiva(cuenta: ContableCuentaNodo): Promise<void> {
  const tenantId = tenantStore.activeTenant?.id
  if (!tenantId) return
  error.value = null
  try {
    await contabilidadStore.actualizarCuenta(tenantId, cuenta.id, { activa: !cuenta.activa })
  } catch (excepcion) {
    error.value = mensajeError(excepcion, 'No se pudo cambiar el estado de la cuenta.')
  }
}

function dimensiones(c: ContableCuentaNodo): string[] {
  const d: string[] = []
  if (c.requiere_tercero) d.push('Tercero')
  if (c.requiere_centro_costo) d.push('Centro de costo')
  if (c.requiere_fondo) d.push('Fondo')
  if (c.requiere_inmueble) d.push('Inmueble')
  return d
}

// ── Nueva cuenta (auxiliar propio) / Editar cuenta ────────────────────────
// Un Auxiliar (nivel 5, código de 9 dígitos) ya no puede ganar hijos —
// guard_contable_cuenta_arbol no reconoce ninguna longitud siguiente — así que no se ofrece la
// acción sobre esas filas.
const cuentaPadreParaNueva = ref<ContableCuentaNodo | null>(null)
const cuentaEnEdicion = ref<ContableCuentaNodo | null>(null)

function abrirNuevaCuenta(fila: ContableCuentaNodo): void {
  cuentaEnEdicion.value = null
  cuentaPadreParaNueva.value = fila
}

function abrirEdicionCuenta(fila: ContableCuentaNodo): void {
  cuentaPadreParaNueva.value = null
  cuentaEnEdicion.value = fila
}

function cerrarDrawerCuenta(): void {
  cuentaPadreParaNueva.value = null
  cuentaEnEdicion.value = null
}

async function alCrearCuenta(): Promise<void> {
  const tenantId = tenantStore.activeTenant?.id
  cerrarDrawerCuenta()
  if (!tenantId) return
  aviso.value = 'Cuenta creada.'
  await contabilidadStore.cargarPlan(tenantId)
}

async function alEditarCuenta(): Promise<void> {
  const tenantId = tenantStore.activeTenant?.id
  cerrarDrawerCuenta()
  if (!tenantId) return
  aviso.value = 'Cuenta actualizada.'
  await contabilidadStore.cargarPlan(tenantId)
}
</script>

<template>
  <div class="space-y-6">
    <div class="flex items-start justify-between gap-4 flex-wrap">
      <div>
        <h1 class="text-xl font-semibold mb-1">Plan de cuentas contable</h1>
        <p class="text-sm text-muted flex items-center gap-2 flex-wrap">
          Mantenimiento de la estructura del plan de cuentas
          <button
            v-if="contabilidadStore.tienePlan"
            type="button"
            class="flex items-center gap-1 text-sm font-medium text-neutral-700 dark:text-neutral-300"
            @click="resumenExpandido = !resumenExpandido"
          >
            <UIcon :name="resumenExpandido ? 'i-lucide-chevron-down' : 'i-lucide-chevron-right'" class="size-4" />
            {{ resumenExpandido ? 'Cerrar resumen' : 'Ver resumen' }}
          </button>
        </p>
      </div>
      <UButton
        v-if="contabilidadStore.tienePlan"
        variant="ghost"
        icon="i-lucide-arrow-right-left"
        to="/contabilidad/mapeo"
      >
        Configurar mapeo
      </UButton>
    </div>

    <UAlert v-if="error" color="error" variant="soft" :title="error" />
    <UAlert v-if="aviso" color="success" variant="soft" :title="aviso" />

    <!-- Sin plan: única acción posible -->
    <div
      v-if="!contabilidadStore.tienePlan"
      class="rounded-lg border border-default p-8 text-center space-y-4"
    >
      <UiTituloDescripcion clase-descripcion="text-sm text-muted mt-1 max-w-lg mx-auto">
        <template #titulo>
          <h2 class="font-semibold">Esta copropiedad todavía no tiene plan de cuentas</h2>
        </template>
        <template #descripcion>
          Se instala una copia del catálogo base para propiedad horizontal colombiana (144
          cuentas). A partir de ahí es tuyo: puedes desactivar lo que no uses y agregar
          auxiliares propios.
        </template>
      </UiTituloDescripcion>
      <div class="flex items-center justify-center gap-2">
        <UButton :loading="trabajando" @click="instalar(false)">Instalar plan base</UButton>
        <UButton variant="ghost" :loading="trabajando" @click="instalar(true)">
          Instalar con cuentas opcionales
        </UButton>
      </div>
      <p class="text-xs text-muted">
        Las opcionales son costos (clase 6), cuentas de orden (clase 8) y el fondo de reserva.
        Se pueden agregar después.
      </p>
    </div>

    <template v-else>
      <div v-if="resumenExpandido" class="grid gap-4 sm:grid-cols-4">
        <div class="rounded-lg border border-default p-4">
          <p class="text-xs text-muted uppercase tracking-wide">Cuentas</p>
          <p class="text-lg font-semibold">{{ resumen.total }}</p>
        </div>
        <div class="rounded-lg border border-default p-4">
          <p class="text-xs text-muted uppercase tracking-wide">De movimiento</p>
          <p class="text-lg font-semibold">{{ resumen.movimiento }}</p>
        </div>
        <div class="rounded-lg border border-default p-4">
          <p class="text-xs text-muted uppercase tracking-wide">Clases</p>
          <p class="text-lg font-semibold">{{ resumen.clases }}</p>
        </div>
        <div class="rounded-lg border border-default p-4">
          <p class="text-xs text-muted uppercase tracking-wide">Desactivadas</p>
          <p class="text-lg font-semibold">{{ resumen.inactivas }}</p>
        </div>
      </div>

      <UAlert
        v-if="faltanOpcionales"
        color="neutral"
        variant="soft"
        icon="i-lucide-plus-circle"
        title="Hay cuentas opcionales sin instalar"
      >
        <template #description>
          <p class="mb-2 text-xs">
            Costos (clase 6), cuentas de orden (clase 8) y el fondo de reserva. Agregarlas no
            altera ninguna cuenta existente.
          </p>
          <UButton size="xs" variant="soft" :loading="trabajando" @click="instalar(true)">
            Agregar cuentas opcionales
          </UButton>
        </template>
      </UAlert>

      <div class="flex items-center gap-2 flex-wrap">
        <UInput
          v-model="busqueda"
          icon="i-lucide-search"
          placeholder="Buscar por código o nombre…"
          class="w-72"
        />
        <UCheckbox v-model="soloMovimiento" label="Solo cuentas de movimiento" />
        <div class="flex-1" />
        <UButton size="xs" variant="ghost" icon="i-lucide-chevrons-down-up" @click="colapsarTodo()">
          Contraer todo
        </UButton>
        <UButton
          size="xs"
          variant="ghost"
          icon="i-lucide-chevrons-up-down"
          @click="colapsados = new Set()"
        >
          Expandir todo
        </UButton>
      </div>

      <UiTabla
        :columnas="[
          { clave: 'cuenta', etiqueta: 'Cuenta' },
          { clave: 'clase', etiqueta: 'Clase' },
          { clave: 'naturaleza', etiqueta: 'Naturaleza' },
          { clave: 'dimensiones', etiqueta: 'Dimensiones obligatorias' },
          { clave: 'usos', etiqueta: 'Partidas', alinear: 'derecha' },
          { clave: 'activa', etiqueta: 'Activa', alinear: 'derecha' },
        ]"
        :filas="filas"
        :clave-fila="(fila) => fila.id"
        :vacio="filtrando ? 'Sin resultados.' : 'El plan está vacío.'"
      >
        <template #celda-cuenta="{ fila }">
          <div class="flex items-center gap-1" :style="{ paddingLeft: `${(fila.nivel - 1) * 16}px` }">
            <UButton
              v-if="fila.hijos.length > 0 && !filtrando"
              size="xs"
              variant="ghost"
              :icon="colapsados.has(fila.codigo) ? 'i-lucide-chevron-right' : 'i-lucide-chevron-down'"
              @click="alternar(fila.codigo)"
            />
            <span v-else class="w-6" />
            <button
              type="button"
              class="flex items-center gap-1 hover:underline hover:text-primary rounded-sm"
              :title="`Editar ${fila.codigo} · ${fila.nombre}`"
              @click="abrirEdicionCuenta(fila)"
            >
              <span class="tabular-nums font-medium">{{ fila.codigo }}</span>
              <span :class="fila.permite_movimiento ? '' : 'font-semibold'">{{ fila.nombre }}</span>
            </button>
            <UBadge v-if="!fila.activa" color="neutral" variant="subtle" size="xs">Inactiva</UBadge>
            <UIcon
              v-if="fundamentoDe(fila.codigo)"
              name="i-lucide-scale"
              class="size-3.5 text-muted shrink-0"
              :title="`${fundamentoDe(fila.codigo)!.norma}${fundamentoDe(fila.codigo)!.articulo ? ' — ' + fundamentoDe(fila.codigo)!.articulo : ''}: ${fundamentoDe(fila.codigo)!.descripcion ?? ''}`"
            />
            <UButton
              v-if="fila.codigo.length < 9"
              size="xs"
              variant="ghost"
              icon="i-lucide-plus"
              aria-label="Nueva cuenta"
              :title="`Agregar cuenta bajo ${fila.codigo}`"
              class="opacity-0 group-hover:opacity-100 focus-visible:opacity-100"
              @click="abrirNuevaCuenta(fila)"
            />
          </div>
        </template>
        <template #celda-clase="{ fila }">
          <span class="text-xs text-muted">{{ NOMBRE_CLASE[fila.clase] ?? fila.clase }}</span>
        </template>
        <template #celda-naturaleza="{ fila }">
          <UBadge
            :color="fila.naturaleza === 'debito' ? 'info' : 'warning'"
            variant="subtle"
            size="xs"
          >
            {{ fila.naturaleza === 'debito' ? 'Débito' : 'Crédito' }}
          </UBadge>
        </template>
        <template #celda-dimensiones="{ fila }">
          <div class="flex flex-wrap gap-1">
            <UBadge v-for="d in dimensiones(fila)" :key="d" variant="outline" size="xs">
              {{ d }}
            </UBadge>
          </div>
        </template>
        <template #celda-usos="{ fila }">
          <span v-if="fila.usos > 0" class="tabular-nums text-xs">{{ fila.usos }}</span>
          <span v-else class="text-muted">—</span>
        </template>
        <template #celda-activa="{ fila }">
          <USwitch
            :model-value="fila.activa"
            :disabled="fila.usos > 0 && fila.activa"
            @update:model-value="alternarActiva(fila)"
          />
        </template>
      </UiTabla>

      <p class="text-xs text-muted">
        «Partidas» es cuántas cuentas presupuestales imputan a esa cuenta contable. Una cuenta en
        uso no se puede desactivar: primero hay que reasignar sus partidas en el mapeo.
      </p>
    </template>

    <ContabilidadCuentaDrawer
      v-if="cuentaPadreParaNueva && tenantStore.activeTenant"
      :tenant-id="tenantStore.activeTenant.id"
      :cuenta-padre="cuentaPadreParaNueva"
      @cerrar="cerrarDrawerCuenta"
      @creada="alCrearCuenta"
    />
    <ContabilidadCuentaDrawer
      v-if="cuentaEnEdicion && tenantStore.activeTenant"
      :tenant-id="tenantStore.activeTenant.id"
      :cuenta="cuentaEnEdicion"
      @cerrar="cerrarDrawerCuenta"
      @editada="alEditarCuenta"
    />
  </div>
</template>
