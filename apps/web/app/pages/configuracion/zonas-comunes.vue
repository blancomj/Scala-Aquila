<script setup lang="ts">
// Zonas comunes — inventario de bienes comunes de la copropiedad
// (20260830300000). Antes existía schema+RLS completos pero ningún CRUD
// (PLAN_DATOS_REALES.md línea 28); esto cierra ese vacío con el mismo patrón
// de /configuracion/agrupaciones.
//
// "Es esencial" deshabilita el selector de asignación en el propio formulario
// (no solo en la base): un bien esencial nunca puede tener uso exclusivo
// (Ley 675/2001 Art. 19-20), así que no tiene sentido dejar la opción visible
// y fallar después contra el guard de la base.
definePageMeta({ layout: 'default', middleware: ['tenant', 'rbac'], permiso: 'settings:manage' })

const tenantStore = useTenantStore()
const zonasStore = useZonasComunesStore()
const cuentaStore = useCuentaCorrienteStore()
const toast = useToast()

const error = ref<string | null>(null)

await useAsyncData('zonas-comunes-base', async () => {
  const tenantId = tenantStore.activeTenant?.id
  if (!tenantId) return null
  await Promise.all([
    zonasStore.cargarTiposZonaComun(tenantId),
    zonasStore.cargarZonasComunes(tenantId),
    cuentaStore.cargarInmuebles(tenantId),
  ])
  return null
})

const inmueblePorId = computed(() => new Map(cuentaStore.inmuebles.map((i) => [i.id, i.codigo])))

const opcionesInmueble = computed(() => [
  { valor: null, etiqueta: '— Sin asignar —' },
  ...cuentaStore.inmuebles.map((i) => ({ valor: i.id, etiqueta: i.codigo })),
])

// ── búsqueda + filtros ──────────────────────────────────────────────────
const busqueda = ref('')
const filtroTipoId = ref<number | null>(null)
const filtroSoloUsoExclusivo = ref(false)

const hayFiltrosActivos = computed(
  () => busqueda.value.trim().length > 0 || filtroTipoId.value !== null || filtroSoloUsoExclusivo.value,
)

function limpiarFiltros(): void {
  busqueda.value = ''
  filtroTipoId.value = null
  filtroSoloUsoExclusivo.value = false
}

const zonasFiltradas = computed(() => {
  const q = busqueda.value.trim().toLowerCase()
  return zonasStore.zonasComunes.filter((z) => {
    if (filtroTipoId.value !== null && z.tipo_id !== filtroTipoId.value) return false
    if (filtroSoloUsoExclusivo.value && !z.uso_exclusivo_inmueble_id) return false
    if (!q) return true
    return (
      z.nombre.toLowerCase().includes(q) ||
      z.codigo.toLowerCase().includes(q) ||
      (z.descripcion ?? '').toLowerCase().includes(q) ||
      (inmueblePorId.value.get(z.uso_exclusivo_inmueble_id ?? '') ?? '').toLowerCase().includes(q)
    )
  })
})

// ── modal crear / editar ───────────────────────────────────────────────
type ZonaComun = (typeof zonasStore.zonasComunes)[number]

const modalAbierto = ref(false)
const editandoId = ref<string | null>(null)
const guardando = ref(false)
const formCodigo = ref('')
const formNombre = ref('')
const formTipoId = ref<number | undefined>(undefined)
const formArea = ref<number | null>(null)
const formDescripcion = ref('')
const formEsEsencial = ref(false)
const formActiva = ref(true)
const formUsoExclusivoId = ref<string | null>(null)
const formMatricula = ref('')

watch(formEsEsencial, (esencial) => {
  if (esencial) formUsoExclusivoId.value = null
})

function abrirNueva(): void {
  editandoId.value = null
  formCodigo.value = ''
  formNombre.value = ''
  formTipoId.value = zonasStore.tiposZonaComun[0]?.id
  formArea.value = null
  formDescripcion.value = ''
  formEsEsencial.value = false
  formActiva.value = true
  formUsoExclusivoId.value = null
  formMatricula.value = ''
  error.value = null
  modalAbierto.value = true
}

function abrirEdicion(zona: ZonaComun): void {
  editandoId.value = zona.id
  formCodigo.value = zona.codigo
  formNombre.value = zona.nombre
  formTipoId.value = zona.tipo_id
  formArea.value = zona.area
  formDescripcion.value = zona.descripcion ?? ''
  formEsEsencial.value = zona.es_esencial
  formActiva.value = zona.activa
  formUsoExclusivoId.value = zona.uso_exclusivo_inmueble_id
  formMatricula.value = zona.matricula_inmobiliaria ?? ''
  error.value = null
  modalAbierto.value = true
}

const puedeGuardar = computed(
  () => formCodigo.value.trim().length > 0 && formNombre.value.trim().length > 0 && formTipoId.value !== undefined,
)

async function guardar(): Promise<void> {
  const tenantId = tenantStore.activeTenant?.id
  if (!tenantId || formTipoId.value === undefined) return

  error.value = null
  guardando.value = true
  const creando = !editandoId.value
  try {
    if (editandoId.value) {
      await zonasStore.actualizarZonaComun({
        id: editandoId.value,
        tenantId,
        codigo: formCodigo.value,
        nombre: formNombre.value,
        tipoId: formTipoId.value,
        area: formArea.value,
        descripcion: formDescripcion.value,
        esEsencial: formEsEsencial.value,
        activa: formActiva.value,
        usoExclusivoInmuebleId: formUsoExclusivoId.value,
        matriculaInmobiliaria: formMatricula.value,
      })
    } else {
      await zonasStore.crearZonaComun({
        tenantId,
        codigo: formCodigo.value,
        nombre: formNombre.value,
        tipoId: formTipoId.value,
        area: formArea.value,
        descripcion: formDescripcion.value,
        esEsencial: formEsEsencial.value,
        activa: formActiva.value,
        usoExclusivoInmuebleId: formUsoExclusivoId.value,
        matriculaInmobiliaria: formMatricula.value,
      })
    }
    modalAbierto.value = false
    toast.add({ title: creando ? 'Zona común creada.' : 'Zona común actualizada.', color: 'success' })
  } catch (excepcion) {
    error.value = mensajeError(excepcion, 'No se pudo guardar la zona común.')
  } finally {
    guardando.value = false
  }
}

// ── eliminar ─────────────────────────────────────────────────────────
const zonaAEliminar = ref<ZonaComun | null>(null)

async function confirmarEliminar(): Promise<void> {
  const zona = zonaAEliminar.value
  const tenantId = tenantStore.activeTenant?.id
  if (!zona || !tenantId) return
  zonaAEliminar.value = null

  error.value = null
  try {
    await zonasStore.eliminarZonaComun(zona.id, tenantId)
  } catch (excepcion) {
    error.value = mensajeError(excepcion, 'No se pudo eliminar la zona común.')
  }
}
</script>

<template>
  <div class="space-y-6">
    <div class="flex items-start gap-3 bg-neutral-50 rounded-md px-3 py-2">
      <h1 class="text-base font-semibold text-neutral-900 whitespace-nowrap">Zonas comunes</h1>
      <p class="text-sm text-neutral-500 max-w-prose line-clamp-2">
        Inventario de bienes comunes de la copropiedad — piscina, salón social, escaleras, redes
        técnicas. Los no esenciales pueden asignarse en uso exclusivo a un inmueble (Art. 20, Ley
        675/2001); nunca generan cobro propio, su sostenimiento se cubre con la cuota de
        administración.
      </p>
    </div>

    <UAlert v-if="error" color="error" variant="soft" :title="error" />

    <div v-if="zonasStore.zonasComunes.length === 0" class="flex items-center justify-between gap-3 flex-wrap">
      <p class="text-neutral-500 text-sm">
        Todavía no hay zonas comunes registradas. Crea la primera — por ejemplo la piscina, el salón
        social o un depósito común.
      </p>
      <UButton size="sm" @click="abrirNueva()">Nueva zona común</UButton>
    </div>

    <template v-else>
      <div class="flex items-center justify-between gap-3 flex-wrap">
        <div class="flex items-center gap-3 flex-wrap">
          <UInput
            v-model="busqueda"
            size="sm"
            icon="i-lucide-search"
            placeholder="Buscar por código, nombre, descripción o inmueble asignado…"
            class="w-80"
          />
          <USelect
            v-model="filtroTipoId"
            :items="[{ label: 'Todos los tipos', value: null }, ...zonasStore.tiposZonaComun.map((t) => ({ label: t.nombre, value: t.id }))]"
            value-key="value"
            size="sm"
            class="w-56"
          />
          <UCheckbox v-model="filtroSoloUsoExclusivo" label="Solo con uso exclusivo" />
          <UButton v-if="hayFiltrosActivos" size="xs" variant="ghost" @click="limpiarFiltros">
            Limpiar filtros
          </UButton>
        </div>
        <UButton size="sm" @click="abrirNueva()">Nueva zona común</UButton>
      </div>

      <p v-if="hayFiltrosActivos && zonasFiltradas.length === 0" class="text-neutral-500 text-sm">
        Sin resultados para estos filtros.
      </p>

      <UiTabla
        v-else
        :columnas="[
          { clave: 'codigo', etiqueta: 'Código' },
          { clave: 'nombre', etiqueta: 'Nombre' },
          { clave: 'tipo', etiqueta: 'Tipo' },
          { clave: 'area', etiqueta: 'Área', alinear: 'derecha' },
          { clave: 'asignacion', etiqueta: 'Asignación' },
          { clave: 'acciones', etiqueta: '' },
        ]"
        :filas="zonasFiltradas"
        :clave-fila="(zona) => zona.id"
      >
        <template #celda-codigo="{ fila }">
          <span class="mono" :class="fila.activa ? '' : 'text-neutral-400 line-through'">
            {{ fila.codigo }}
          </span>
        </template>
        <template #celda-nombre="{ fila }">
          <div class="leading-tight">
            <span :class="fila.activa ? '' : 'text-neutral-400 line-through'">{{ fila.nombre }}</span>
            <p v-if="fila.matricula_inmobiliaria" class="text-xs text-neutral-400">
              Matrícula {{ fila.matricula_inmobiliaria }}
            </p>
            <p v-if="fila.descripcion" class="text-xs text-neutral-400">{{ fila.descripcion }}</p>
          </div>
        </template>
        <template #celda-tipo="{ fila }">
          <div class="flex items-center gap-1.5">
            <UBadge variant="subtle" size="sm">{{ zonasStore.tipoPorId.get(fila.tipo_id) ?? '—' }}</UBadge>
            <UBadge v-if="fila.es_esencial" color="warning" variant="subtle" size="sm">Esencial</UBadge>
            <UBadge v-if="!fila.activa" color="neutral" variant="subtle" size="sm">Inactiva</UBadge>
          </div>
        </template>
        <template #celda-area="{ fila }">
          <span class="tabular-nums text-neutral-500">{{ fila.area ?? '—' }}{{ fila.area ? ' m²' : '' }}</span>
        </template>
        <template #celda-asignacion="{ fila }">
          <span v-if="fila.uso_exclusivo_inmueble_id" class="text-neutral-700 dark:text-neutral-300">
            {{ inmueblePorId.get(fila.uso_exclusivo_inmueble_id) ?? '—' }}
          </span>
          <span v-else class="text-neutral-400">Sin asignar</span>
        </template>
        <template #celda-acciones="{ fila }">
          <div class="flex justify-end gap-1">
            <UButton size="xs" variant="ghost" icon="i-lucide-pencil" title="Editar" @click="abrirEdicion(fila)" />
            <UButton
              v-if="!fila.uso_exclusivo_inmueble_id"
              size="xs"
              variant="ghost"
              color="error"
              icon="i-lucide-trash-2"
              title="Eliminar"
              @click="zonaAEliminar = fila"
            />
          </div>
        </template>
      </UiTabla>
    </template>

    <!-- ── crear / editar ──────────────────────────────────────────── -->
    <UModal
      :open="modalAbierto"
      :title="editandoId ? 'Editar zona común' : 'Nueva zona común'"
      @update:open="(abierto) => { if (!abierto) modalAbierto = false }"
    >
      <template #body>
        <div class="space-y-4 text-sm">
          <div class="grid grid-cols-3 gap-3">
            <UFormField label="Código" name="codigo" class="col-span-1">
              <UInput v-model="formCodigo" placeholder="ZC-01" class="w-full" />
            </UFormField>
            <UFormField label="Nombre" name="nombre" class="col-span-2">
              <UInput v-model="formNombre" placeholder="Piscina, salón social, escalera torre A…" class="w-full" />
            </UFormField>
          </div>

          <div class="grid grid-cols-2 gap-3">
            <UFormField label="Tipo" name="tipo">
              <USelect
                v-model="formTipoId"
                :items="zonasStore.tiposZonaComun.map((t) => ({ label: t.nombre, value: t.id }))"
                value-key="value"
                class="w-full"
              />
            </UFormField>
            <UFormField label="Área (m²)" name="area">
              <UInput v-model.number="formArea" type="number" step="0.01" placeholder="45.00" class="w-full" />
            </UFormField>
          </div>

          <UFormField name="matricula">
            <template #label>
              <span class="inline-flex items-baseline gap-1.5">
                <span>Matrícula inmobiliaria</span>
                <span class="text-xs font-normal text-neutral-400">
                  — opcional, solo si el bien tiene folio propio
                </span>
              </span>
            </template>
            <UInput v-model="formMatricula" placeholder="050-987654" class="w-full" />
            <template #help>
              La mayoría de zonas comunes (piscina, salón social) no tienen matrícula propia —
              déjalo en blanco. Si la tiene, no puede repetir la de un inmueble ya registrado.
            </template>
          </UFormField>

          <UFormField name="descripcion">
            <template #label>
              <span class="inline-flex items-baseline gap-1.5">
                <span>Descripción</span>
                <span class="text-xs font-normal text-neutral-400">— opcional</span>
              </span>
            </template>
            <UInput v-model="formDescripcion" placeholder="Incluye camerinos y zona de duchas" class="w-full" />
          </UFormField>

          <UCheckbox v-model="formEsEsencial">
            <template #label>Es esencial</template>
            <template #description>
              Estructura, fachadas, escaleras, redes principales — indispensable para el edificio.
              Un bien esencial nunca se puede asignar en uso exclusivo (Art. 20, Ley 675/2001).
            </template>
          </UCheckbox>

          <UFormField label="Asignación de uso exclusivo" name="usoExclusivo">
            <UiSelectorBuscable
              v-model="formUsoExclusivoId"
              :opciones="opcionesInmueble"
              :deshabilitado="formEsEsencial"
              placeholder="— Sin asignar —"
            />
            <template #help>
              <span v-if="formEsEsencial">Deshabilitado — un bien esencial no admite uso exclusivo.</span>
              <span v-else>El inmueble asignado la ve en su ficha. No genera coeficiente ni cobro propio.</span>
            </template>
          </UFormField>

          <UCheckbox v-model="formActiva">
            <template #label>Activa</template>
            <template #description>
              Al desactivarla se conserva en el histórico pero deja de figurar como disponible.
            </template>
          </UCheckbox>
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
      :open="zonaAEliminar !== null"
      title="¿Eliminar esta zona común?"
      @update:open="(abierto) => { if (!abierto) zonaAEliminar = null }"
    >
      <template #body>
        <div v-if="zonaAEliminar" class="space-y-2 text-sm">
          <p>Vas a eliminar <strong>{{ zonaAEliminar.nombre }}</strong>.</p>
          <p class="text-neutral-500">
            No tiene ningún inmueble asignado, así que se puede borrar sin dejar nada colgando. Si
            más adelante vuelve a hacer falta, se crea de nuevo.
          </p>
        </div>
      </template>
      <template #footer>
        <div class="flex justify-end gap-2">
          <UButton variant="ghost" @click="zonaAEliminar = null">Cancelar</UButton>
          <UButton color="error" @click="confirmarEliminar">Eliminar</UButton>
        </div>
      </template>
    </UModal>
  </div>
</template>
