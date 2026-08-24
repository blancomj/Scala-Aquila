<script setup lang="ts">
// Drawer "Agregar rubro" / "Editar rubro" — contenedor UiDrawer (igual que
// el resto), contenido en Nuxt UI (UFormField/UInput/USelect/UButton),
// mismo criterio que politicas/PoliticasVersionDrawer.vue (23-08-2026).
// Mismo patrón crear/editar que PresupuestoCuentaDrawer.vue (prop `rubro?`
// opcional). USelect para cuenta/fundamento, no UiSelectorBuscable —
// listas cortas que no necesitan búsqueda. Solo se listan cuentas hoja
// (es_hoja) — guard_presupuesto_rubro_cuenta (E8) rechaza un rubro contra
// una cuenta que agrupa subcuentas, así que ni se ofrecen como opción.
import type { Database } from '@aquila/shared'

type PresupuestoRubroRow = Database['public']['Tables']['presupuesto_rubros']['Row']

const props = defineProps<{
  presupuestoId: string
  rubro?: PresupuestoRubroRow
  cuentaIdInicial?: string
}>()
const emit = defineEmits<{ cerrar: []; creado: []; editado: [] }>()

const tenantStore = useTenantStore()
const presupuestoStore = usePresupuestoStore()
const fundamentoStore = useFundamentoNormativoStore()
const agrupacionesStore = useAgrupacionesStore()

const modoEdicion = computed(() => props.rubro !== undefined)

const codigo = ref(props.rubro?.codigo ?? '')
const nombre = ref(props.rubro?.nombre ?? '')
const cuentaId = ref<string | undefined>(props.rubro?.cuenta_id ?? props.cuentaIdInicial ?? undefined)
const montoAnual = ref<number | null>(props.rubro ? Number(props.rubro.monto_anual) : null)
const fundamentoNormativoId = ref<number | null>(props.rubro?.fundamento_normativo_id ?? null)
const agrupacionId = ref<string | null>(props.rubro?.agrupacion_id ?? null)
const centroCostoId = ref<number | null>(props.rubro?.centro_costo_id ?? null)
const guardando = ref(false)
const error = ref<string | null>(null)

onMounted(() => {
  const tenantId = tenantStore.activeTenant?.id
  if (!tenantId) return
  if (agrupacionesStore.agrupaciones.length === 0) agrupacionesStore.cargarAgrupaciones(tenantId)
  if (presupuestoStore.tiposCentroCosto.length === 0) presupuestoStore.cargarTiposCentroCosto(tenantId)
})

/** Cualquier nivel del árbol, no solo hojas — a diferencia de cuentaId (E8): un gasto puede ser
 * real de la torre completa (ver comentario de agrupacion_id en la migración 20260830420000). */
const opcionesAgrupacion = computed(() => [
  { label: '— Sin ubicación —', value: null },
  ...agrupacionesStore.arbolPlano.map((a) => ({ label: a.ruta, value: a.id })),
])

const opcionesCentroCosto = computed(() => [
  { label: '— Sin centro de costo —', value: null },
  ...presupuestoStore.tiposCentroCosto.map((t) => ({ label: t.nombre, value: t.id })),
])

/** Ruta legible (ej. "Servicios Públicos › Energía Eléctrica") — se arma
 * siguiendo parent_id en vez de repetir la lógica de `ruta` (BD), que es
 * un path de orden, no de nombres. */
const cuentasHoja = computed(() => {
  const porId = new Map(presupuestoStore.cuentas.map((c) => [c.id, c]))
  function rutaNombres(cuenta: (typeof presupuestoStore.cuentas)[number]): string {
    const segmentos = [cuenta.nombre]
    let actual = cuenta
    while (actual.parent_id) {
      const padre = porId.get(actual.parent_id)
      if (!padre) break
      segmentos.unshift(padre.nombre)
      actual = padre
    }
    return segmentos.join(' › ')
  }
  return presupuestoStore.cuentas
    .filter((c) => c.es_hoja)
    .map((c) => ({ value: c.id, label: `${rutaNombres(c)} (${c.naturaleza})` }))
    .sort((a, b) => a.label.localeCompare(b.label))
})

const opcionesFundamento = computed(() => [
  { label: '— Ninguno —', value: null },
  ...fundamentoStore.fundamentos.map((f) => ({ label: f.norma, value: f.id })),
])

async function guardar(): Promise<void> {
  error.value = null
  const tenantId = tenantStore.activeTenant?.id
  if (!tenantId) return
  if (!codigo.value || !nombre.value || cuentaId.value === undefined || montoAnual.value === null) {
    error.value = 'Completa código, nombre, cuenta y monto anual.'
    return
  }

  guardando.value = true
  try {
    if (modoEdicion.value && props.rubro) {
      await presupuestoStore.actualizarRubro({
        id: props.rubro.id,
        presupuestoId: props.presupuestoId,
        codigo: codigo.value,
        nombre: nombre.value,
        cuentaId: cuentaId.value,
        montoAnual: montoAnual.value,
        fundamentoNormativoId: fundamentoNormativoId.value,
        agrupacionId: agrupacionId.value,
        centroCostoId: centroCostoId.value,
      })
      emit('editado')
    } else {
      await presupuestoStore.crearRubro({
        presupuestoId: props.presupuestoId,
        tenantId,
        codigo: codigo.value,
        nombre: nombre.value,
        cuentaId: cuentaId.value,
        montoAnual: montoAnual.value,
        fundamentoNormativoId: fundamentoNormativoId.value ?? undefined,
        agrupacionId: agrupacionId.value ?? undefined,
        centroCostoId: centroCostoId.value ?? undefined,
      })
      emit('creado')
    }
  } catch (excepcion) {
    error.value = mensajeError(excepcion, 'No se pudo guardar el rubro.')
  } finally {
    guardando.value = false
  }
}
</script>

<template>
  <div class="ficha-inmueble">
    <UiDrawer
      :abierto="true"
      :titulo="modoEdicion ? 'Editar rubro' : 'Agregar rubro'"
      @cerrar="emit('cerrar')"
    >
      <div class="space-y-4 text-sm">
        <div class="grid grid-cols-[110px_1fr] gap-4">
          <UFormField label="Código" name="codigo">
            <UInput v-model="codigo" type="text" maxlength="6" class="w-full" />
          </UFormField>
          <UFormField label="Nombre" name="nombre">
            <UInput v-model="nombre" type="text" class="w-full" />
          </UFormField>
        </div>
        <UFormField label="Cuenta" name="cuenta_id">
          <USelect v-model="cuentaId" :items="cuentasHoja" value-key="value" class="w-full" />
        </UFormField>
        <UFormField label="Monto anual" name="monto_anual">
          <UInput v-model.number="montoAnual" type="number" min="0" class="w-full" />
        </UFormField>
        <UFormField label="Fundamento normativo" name="fundamento_normativo_id">
          <USelect v-model="fundamentoNormativoId" :items="opcionesFundamento" value-key="value" class="w-full" />
        </UFormField>
        <div class="grid grid-cols-2 gap-4">
          <UFormField label="Agrupación (ubicación)" name="agrupacion_id">
            <USelect v-model="agrupacionId" :items="opcionesAgrupacion" value-key="value" class="w-full" />
          </UFormField>
          <UFormField label="Centro de costo" name="centro_costo_id">
            <USelect v-model="centroCostoId" :items="opcionesCentroCosto" value-key="value" class="w-full" />
          </UFormField>
        </div>
      </div>

      <UAlert v-if="error" color="error" variant="soft" :title="error" class="mt-4" />

      <template #foot>
        <UButton variant="ghost" @click="emit('cerrar')">Cancelar</UButton>
        <UButton :loading="guardando" @click="guardar">
          {{ modoEdicion ? 'Guardar cambios' : 'Agregar rubro' }}
        </UButton>
      </template>
    </UiDrawer>
  </div>
</template>
