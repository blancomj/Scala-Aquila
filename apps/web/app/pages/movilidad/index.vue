<script setup lang="ts">
// EXS-5 · Vehículos y movilidad.
//
// La pestaña de portería va primero a propósito: es la pregunta que se hace
// veinte veces al día en la reja ("esta placa, ¿entra?"), mientras que el
// inventario se toca de vez en cuando. Y responde con fn_vehiculo_por_placa,
// no filtrando la tabla en el cliente, porque «autorizado» se deriva de los
// permisos y de la fecha de hoy: no hay columna que leer.
definePageMeta({ layout: 'default', middleware: ['tenant', 'rbac'], permiso: 'data:read' })

const tenantStore = useTenantStore()
const vehiculosStore = useVehiculosStore()
const catalogosStore = useCatalogosStore()

type Tab = 'porteria' | 'inventario'
const TABS: ReadonlyArray<{ id: Tab; etiqueta: string }> = [
  { id: 'porteria', etiqueta: 'Consulta de placa' },
  { id: 'inventario', etiqueta: 'Inventario' },
]
const tabActiva = ref<Tab>('porteria')

const tipos = ref<{ id: number; codigo: string; nombre: string }[]>([])
const servicios = ref<{ id: number; codigo: string; nombre: string }[]>([])
const tiposPermiso = ref<{ id: number; codigo: string; nombre: string }[]>([])

async function cargarTodo(): Promise<void> {
  const tenantId = tenantStore.activeTenant?.id
  if (!tenantId) return
  const valores = await catalogosStore.cargarValores(tenantId)
  const de = (tipo: string) =>
    valores.filter((v) => v.tipo === tipo).map((v) => ({ id: v.id, codigo: v.codigo, nombre: v.nombre }))
  tipos.value = de('TIPO_VEHICULO')
  servicios.value = de('SERVICIO_VEHICULO')
  tiposPermiso.value = de('TIPO_PERMISO_VEHICULO')
  await vehiculosStore.cargar(tenantId, incluirRetirados.value)
}
onMounted(async () => {
  await cargarTodo()
  await abrirDesdeEnlace()
})
watch(() => tenantStore.activeTenant?.id, cargarTodo)

// Deep link de EXS-7: `/movilidad?vehiculo=<id>` abre los permisos de ese
// vehículo, que es donde se renueva el que está por vencer — el asunto que
// trajo al usuario hasta aquí.
const ruta = useRoute()

async function abrirDesdeEnlace(): Promise<void> {
  const id = ruta.query.vehiculo
  if (typeof id !== 'string' || id === '') return
  if (!vehiculosStore.vehiculos.some((v) => v.id === id)) return
  tabActiva.value = 'inventario'
  await abrirPermisos(id)
}

const nombreTipo = computed(() => new Map(tipos.value.map((t) => [t.id, t.nombre])))
const nombrePermiso = computed(() => new Map(tiposPermiso.value.map((t) => [t.id, t.nombre])))

// ── Portería ──
const placaBuscada = ref('')

async function consultar(): Promise<void> {
  const tenantId = tenantStore.activeTenant?.id
  if (!tenantId || placaBuscada.value.trim() === '') return
  await vehiculosStore.buscarPorPlaca(tenantId, placaBuscada.value.trim())
}

// ── Inventario ──
const incluirRetirados = ref(false)
watch(incluirRetirados, async (valor) => {
  const tenantId = tenantStore.activeTenant?.id
  if (tenantId) await vehiculosStore.cargar(tenantId, valor)
})

const drawerAbierto = ref(false)
const guardando = ref(false)
const edicion = ref({
  id: undefined as string | undefined,
  placa: '',
  // USelect de Nuxt UI no admite null en el modelo: "sin servicio" viaja
  // como undefined y se normaliza a null al guardar.
  tipoId: undefined as number | undefined,
  servicioId: undefined as number | undefined,
  marca: '',
  modelo: '',
  color: '',
  anio: undefined as number | undefined,
  observaciones: '',
})

function abrirNuevo(): void {
  edicion.value = {
    id: undefined,
    placa: '',
    tipoId: tipos.value[0]?.id,
    servicioId: servicios.value[0]?.id,
    marca: '',
    modelo: '',
    color: '',
    anio: undefined,
    observaciones: '',
  }
  drawerAbierto.value = true
}

function abrirEdicion(id: string): void {
  const v = vehiculosStore.vehiculos.find((x) => x.id === id)
  if (!v) return
  edicion.value = {
    id: v.id,
    placa: v.placa,
    tipoId: v.tipoId,
    servicioId: v.servicioId ?? undefined,
    marca: v.marca ?? '',
    modelo: v.modelo ?? '',
    color: v.color ?? '',
    anio: v.anio ?? undefined,
    observaciones: v.observaciones ?? '',
  }
  drawerAbierto.value = true
}

const puedeGuardar = computed(
  () => edicion.value.placa.trim().length > 0 && edicion.value.tipoId !== undefined,
)

async function guardar(): Promise<void> {
  const tenantId = tenantStore.activeTenant?.id
  if (!tenantId || !puedeGuardar.value) return
  guardando.value = true
  try {
    const ok = await vehiculosStore.guardarVehiculo({
      id: edicion.value.id,
      tenantId,
      placa: edicion.value.placa.trim(),
      tipoId: edicion.value.tipoId!,
      servicioId: edicion.value.servicioId ?? null,
      marca: edicion.value.marca.trim() || null,
      modelo: edicion.value.modelo.trim() || null,
      color: edicion.value.color.trim() || null,
      anio: edicion.value.anio ?? null,
      observaciones: edicion.value.observaciones.trim() || null,
    })
    if (ok) {
      drawerAbierto.value = false
      await cargarTodo()
    }
  } finally {
    guardando.value = false
  }
}

// ── Retiro ──
const retiroAbierto = ref(false)
const retiroId = ref<string | null>(null)
const motivoRetiro = ref('')

function abrirRetiro(id: string): void {
  retiroId.value = id
  motivoRetiro.value = ''
  retiroAbierto.value = true
}

async function confirmarRetiro(): Promise<void> {
  if (!retiroId.value) return
  const ok = await vehiculosStore.retirar(retiroId.value, motivoRetiro.value.trim() || 'Sin motivo')
  if (ok) {
    retiroAbierto.value = false
    await cargarTodo()
  }
}

// ── Permisos ──
const permisosAbierto = ref(false)
const vehiculoPermisos = ref<string | null>(null)
const nuevoPermiso = ref({
  tipoId: undefined as number | undefined,
  vigenteDesde: new Date().toISOString().slice(0, 10),
  vigenteHasta: '',
  motivo: '',
})

async function abrirPermisos(id: string): Promise<void> {
  vehiculoPermisos.value = id
  nuevoPermiso.value = {
    tipoId: tiposPermiso.value[0]?.id,
    vigenteDesde: new Date().toISOString().slice(0, 10),
    vigenteHasta: '',
    motivo: '',
  }
  await vehiculosStore.cargarPermisos(id)
  permisosAbierto.value = true
}

async function otorgar(): Promise<void> {
  const tenantId = tenantStore.activeTenant?.id
  if (!tenantId || !vehiculoPermisos.value || nuevoPermiso.value.tipoId === undefined) return
  const ok = await vehiculosStore.otorgarPermiso({
    tenantId,
    vehiculoId: vehiculoPermisos.value,
    tipoId: nuevoPermiso.value.tipoId,
    vigenteDesde: nuevoPermiso.value.vigenteDesde,
    vigenteHasta: nuevoPermiso.value.vigenteHasta || null,
    inmuebleId: null,
    motivo: nuevoPermiso.value.motivo.trim() || null,
  })
  if (ok) await vehiculosStore.cargarPermisos(vehiculoPermisos.value)
}

async function revocar(id: string): Promise<void> {
  const ok = await vehiculosStore.revocarPermiso(id, 'Revocado desde la gestión de vehículos')
  if (ok && vehiculoPermisos.value) await vehiculosStore.cargarPermisos(vehiculoPermisos.value)
}

/** Un permiso 'vigente' cuya fecha ya pasó no autoriza, aunque su estado lo
 *  diga: la etiqueta lo refleja para que nadie lea la tabla al revés. */
function etiquetaPermiso(p: { estado: string; vigenteDesde: string; vigenteHasta: string | null }): string {
  if (p.estado === 'revocado') return 'Revocado'
  const hoy = new Date().toISOString().slice(0, 10)
  if (p.vigenteHasta !== null && p.vigenteHasta < hoy) return 'Vencido'
  if (p.vigenteDesde > hoy) return 'Futuro'
  return 'Vigente'
}
</script>

<template>
  <div class="space-y-6">
    <UiTituloDescripcion>
      <template #titulo>
        <h1 class="text-xl font-semibold">Movilidad</h1>
      </template>
      <template #descripcion>
        Los vehículos de la copropiedad y sus permisos de acceso. Registrar un vehículo
        <strong>no</strong> es autorizarlo: son dos hechos distintos, y la consulta de portería
        responde con el segundo. Un vehículo no se borra — se retira, porque su historial de
        accesos es evidencia; al retirarlo, sus permisos quedan revocados y su placa vuelve a
        quedar libre.
      </template>
    </UiTituloDescripcion>

    <nav
      class="flex gap-1 border-b border-neutral-200 dark:border-neutral-800"
      role="tablist"
      aria-label="Secciones de Movilidad"
    >
      <button
        v-for="tab in TABS"
        :key="tab.id"
        type="button"
        role="tab"
        :aria-selected="tabActiva === tab.id"
        class="px-3 py-2 text-sm whitespace-nowrap border-b-2 -mb-px transition-colors"
        :class="
          tabActiva === tab.id
            ? 'border-primary text-primary font-medium'
            : 'border-transparent text-neutral-500 hover:text-neutral-700 dark:hover:text-neutral-300'
        "
        @click="tabActiva = tab.id"
      >
        {{ tab.etiqueta }}
      </button>
    </nav>

    <p v-if="vehiculosStore.error" class="text-sm text-red-600 dark:text-red-400">
      {{ vehiculosStore.error }}
    </p>

    <!-- ── Portería ── -->
    <div v-if="tabActiva === 'porteria'" role="tabpanel" class="space-y-4">
      <div class="flex items-center gap-3">
        <UInput
          v-model="placaBuscada"
          placeholder="Placa (da igual cómo la escribas)"
          class="w-72"
          @keyup.enter="consultar"
        />
        <UButton size="xs" variant="outline" :loading="vehiculosStore.loading" @click="consultar">
          Consultar
        </UButton>
      </div>

      <p
        v-if="vehiculosStore.consulta !== null && vehiculosStore.consulta.length === 0"
        class="text-sm text-neutral-500 py-8 text-center"
      >
        No hay ningún vehículo registrado con esa placa.
      </p>

      <div
        v-for="c in vehiculosStore.consulta ?? []"
        :key="c.vehiculoId"
        class="rounded-lg border p-4 space-y-3"
        :class="
          c.autorizado
            ? 'border-emerald-300 dark:border-emerald-800'
            : 'border-neutral-200 dark:border-neutral-800'
        "
      >
        <div class="flex items-center justify-between">
          <div>
            <p class="text-lg font-mono font-semibold">{{ c.placa }}</p>
            <p class="text-xs text-neutral-500">
              {{ c.tipo }}<span v-if="c.marca"> · {{ c.marca }} {{ c.modelo }}</span>
              <span v-if="c.color"> · {{ c.color }}</span>
            </p>
          </div>
          <span
            class="px-3 py-1 rounded-full text-sm font-medium"
            :class="
              c.autorizado
                ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300'
                : 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300'
            "
          >
            {{ c.autorizado ? 'Autorizado' : 'Sin permiso vigente' }}
          </span>
        </div>

        <dl class="text-xs space-y-1">
          <div v-if="c.responsables.length > 0" class="flex gap-1">
            <dt class="text-neutral-500">Responsables:</dt>
            <dd>{{ c.responsables.join(', ') }}</dd>
          </div>
          <div v-if="c.inmuebles.length > 0" class="flex gap-1">
            <dt class="text-neutral-500">Unidades:</dt>
            <dd>{{ c.inmuebles.join(', ') }}</dd>
          </div>
          <div v-if="c.autorizado && c.permisoHasta" class="flex gap-1">
            <dt class="text-neutral-500">Permiso hasta:</dt>
            <dd>{{ c.permisoHasta }}</dd>
          </div>
          <div v-if="c.estado !== 'activo'" class="flex gap-1">
            <dt class="text-neutral-500">Estado del vehículo:</dt>
            <dd>{{ c.estado }}</dd>
          </div>
        </dl>
      </div>
    </div>

    <!-- ── Inventario ── -->
    <div v-else role="tabpanel" class="space-y-3">
      <div class="flex items-center justify-between">
        <UCheckbox v-model="incluirRetirados" label="Mostrar también los retirados" />
        <UButton icon="i-lucide-plus" size="xs" @click="abrirNuevo">Nuevo vehículo</UButton>
      </div>

      <UiTabla
        :columnas="[
          { clave: 'placa', etiqueta: 'Placa' },
          { clave: 'tipo', etiqueta: 'Tipo' },
          { clave: 'descripcion', etiqueta: 'Vehículo' },
          { clave: 'estado', etiqueta: 'Estado' },
          { clave: 'acciones', etiqueta: '' },
        ]"
        :filas="vehiculosStore.vehiculos"
        :clave-fila="(v) => v.id"
        vacio="Todavía no hay vehículos registrados."
      >
        <template #celda-placa="{ fila }">
          <span class="font-mono">{{ fila.placa }}</span>
        </template>
        <template #celda-tipo="{ fila }">
          {{ nombreTipo.get(fila.tipoId) ?? '—' }}
        </template>
        <template #celda-descripcion="{ fila }">
          {{ [fila.marca, fila.modelo, fila.color].filter(Boolean).join(' · ') || '—' }}
        </template>
        <template #celda-estado="{ fila }">
          <span
            class="px-2 py-0.5 rounded-full text-[11px]"
            :class="
              fila.estado === 'activo'
                ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300'
                : 'bg-neutral-100 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-400'
            "
          >
            {{ fila.estado }}
          </span>
        </template>
        <template #celda-acciones="{ fila }">
          <div class="flex gap-2 justify-end">
            <UButton size="xs" variant="ghost" @click="abrirPermisos(fila.id)">Permisos</UButton>
            <UButton
              v-if="fila.estado !== 'retirado'"
              size="xs"
              variant="ghost"
              @click="abrirEdicion(fila.id)"
            >
              Editar
            </UButton>
            <UButton
              v-if="fila.estado !== 'retirado'"
              size="xs"
              variant="outline"
              @click="abrirRetiro(fila.id)"
            >
              Retirar
            </UButton>
          </div>
        </template>
      </UiTabla>
    </div>

    <!-- ── Alta y edición ── -->
    <UiDrawer
      :abierto="drawerAbierto"
      titulo="Vehículo"
      subtitulo="La placa se guarda como la escribas y se compara en su forma canónica."
      @cerrar="drawerAbierto = false"
    >
      <div class="space-y-4">
        <UFormField label="Placa" required>
          <UInput v-model="edicion.placa" placeholder="ABC-123" class="w-full" />
        </UFormField>

        <UFormField label="Tipo" required>
          <USelect
            v-model="edicion.tipoId"
            :items="tipos.map((t) => ({ value: t.id, label: t.nombre }))"
            class="w-full"
          />
        </UFormField>

        <UFormField label="Servicio" hint="Particular, público u oficial: dimensión aparte del tipo.">
          <USelect
            v-model="edicion.servicioId"
            :items="servicios.map((s) => ({ value: s.id, label: s.nombre }))"
            class="w-full"
          />
        </UFormField>

        <div class="grid grid-cols-2 gap-3">
          <UFormField label="Marca">
            <UInput v-model="edicion.marca" class="w-full" />
          </UFormField>
          <UFormField label="Modelo">
            <UInput v-model="edicion.modelo" class="w-full" />
          </UFormField>
          <UFormField label="Color">
            <UInput v-model="edicion.color" class="w-full" />
          </UFormField>
          <UFormField label="Año">
            <UInput v-model.number="edicion.anio" type="number" class="w-full" />
          </UFormField>
        </div>

        <UFormField label="Observaciones">
          <UTextarea v-model="edicion.observaciones" :rows="2" class="w-full" />
        </UFormField>

        <p v-if="vehiculosStore.error" class="text-sm text-red-600 dark:text-red-400">
          {{ vehiculosStore.error }}
        </p>
      </div>

      <template #foot>
        <UButton variant="ghost" @click="drawerAbierto = false">Cancelar</UButton>
        <UButton :disabled="!puedeGuardar || guardando" :loading="guardando" @click="guardar">
          Guardar vehículo
        </UButton>
      </template>
    </UiDrawer>

    <!-- ── Retiro ── -->
    <UiDrawer
      :abierto="retiroAbierto"
      titulo="Retirar vehículo"
      subtitulo="El retiro es definitivo: revoca sus permisos y libera la placa. La ficha y su historial se conservan."
      @cerrar="retiroAbierto = false"
    >
      <UFormField label="Motivo del retiro">
        <UTextarea v-model="motivoRetiro" :rows="3" placeholder="Vendido, mudanza…" class="w-full" />
      </UFormField>

      <template #foot>
        <UButton variant="ghost" @click="retiroAbierto = false">Cancelar</UButton>
        <UButton color="error" @click="confirmarRetiro">Retirar</UButton>
      </template>
    </UiDrawer>

    <!-- ── Permisos ── -->
    <UiDrawer
      :abierto="permisosAbierto"
      titulo="Permisos del vehículo"
      subtitulo="Otorgar y revocar exige rol administrador. Un permiso sin fecha final no caduca."
      @cerrar="permisosAbierto = false"
    >
      <div class="space-y-4">
        <UiTabla
          :columnas="[
            { clave: 'tipo', etiqueta: 'Tipo' },
            { clave: 'vigencia', etiqueta: 'Vigencia' },
            { clave: 'estado', etiqueta: 'Estado' },
            { clave: 'acciones', etiqueta: '' },
          ]"
          :filas="vehiculosStore.permisos"
          :clave-fila="(p) => p.id"
          vacio="Este vehículo no tiene permisos: está registrado, pero no autorizado."
        >
          <template #celda-tipo="{ fila }">
            {{ nombrePermiso.get(fila.tipoId) ?? '—' }}
          </template>
          <template #celda-vigencia="{ fila }">
            {{ fila.vigenteDesde }} → {{ fila.vigenteHasta ?? 'sin fin' }}
          </template>
          <template #celda-estado="{ fila }">
            {{ etiquetaPermiso(fila) }}
          </template>
          <template #celda-acciones="{ fila }">
            <UButton
              v-if="fila.estado === 'vigente'"
              size="xs"
              variant="ghost"
              @click="revocar(fila.id)"
            >
              Revocar
            </UButton>
          </template>
        </UiTabla>

        <div class="border-t border-neutral-200 dark:border-neutral-800 pt-4 space-y-3">
          <p class="text-xs text-neutral-500">Otorgar un permiso nuevo</p>
          <UFormField label="Tipo de permiso">
            <USelect
              v-model="nuevoPermiso.tipoId"
              :items="tiposPermiso.map((t) => ({ value: t.id, label: t.nombre }))"
              class="w-full"
            />
          </UFormField>
          <div class="grid grid-cols-2 gap-3">
            <UFormField label="Desde">
              <UInput v-model="nuevoPermiso.vigenteDesde" type="date" class="w-full" />
            </UFormField>
            <UFormField label="Hasta" hint="Vacío = sin caducidad">
              <UInput v-model="nuevoPermiso.vigenteHasta" type="date" class="w-full" />
            </UFormField>
          </div>
          <UFormField label="Motivo">
            <UInput v-model="nuevoPermiso.motivo" class="w-full" />
          </UFormField>
          <UButton size="xs" @click="otorgar">Otorgar permiso</UButton>
        </div>
      </div>

      <template #foot>
        <UButton variant="ghost" @click="permisosAbierto = false">Cerrar</UButton>
      </template>
    </UiDrawer>
  </div>
</template>
