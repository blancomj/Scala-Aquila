<script setup lang="ts">
// Drawer "Registrar movimiento" (E9) — mismo criterio que PresupuestoRubroDrawer.vue: solo
// cuentas hoja (guard_presupuesto_ejecucion_cuenta rechaza cualquier otra). USelect para
// periodo (lista corta, no necesita búsqueda); UiSelectorBuscable para cuenta — el plan de
// cuentas puede tener decenas de hojas anidadas (ruta completa en el label), a diferencia del
// periodo sí se justifica la búsqueda. Contenido en Nuxt UI (23-08-2026).
import type { Database } from '@aquila/shared'

const props = defineProps<{ tenantId: string }>()
const emit = defineEmits<{ cerrar: []; registrado: [] }>()

const presupuestoStore = usePresupuestoStore()
const liquidacionStore = useLiquidacionStore()
const agrupacionesStore = useAgrupacionesStore()
const copropiedadStore = useCopropiedadStore()
const tercerosStore = useTercerosStore()

const cuentaId = ref<string | null>(null)
const periodoId = ref<string | null>(null)
const monto = ref<number | null>(null)
const descripcion = ref('')
const referencia = ref('')
const agrupacionId = ref<string | null>(null)
const centroCostoId = ref<number | null>(null)
// PC-4: sin contrapartida el movimiento no puede representarse contablemente (solo tendría
// débito). El guard de BD la exige; aquí se captura como un hecho operativo —de dónde salió el
// dinero— y no como una cuenta contable, que no es una decisión que corresponda a esta pantalla.
const liquidacion = ref<Liquidacion>('pagado_banco')
const cuentaBancariaId = ref<string | null>(null)
const terceroId = ref<string | null>(null)
const fechaDocumento = ref('')
const guardando = ref(false)
const error = ref<string | null>(null)

type Liquidacion = Database['public']['Enums']['ejecucion_liquidacion_t']

await useAsyncData('periodos-ejecucion', () => liquidacionStore.cargarPeriodos(props.tenantId))

onMounted(async () => {
  if (agrupacionesStore.agrupaciones.length === 0) agrupacionesStore.cargarAgrupaciones(props.tenantId)
  if (presupuestoStore.tiposCentroCosto.length === 0) presupuestoStore.cargarTiposCentroCosto(props.tenantId)
  if (tercerosStore.terceros.length === 0) tercerosStore.cargarTerceros(props.tenantId)
  if (copropiedadStore.cuentasBancarias.length === 0) {
    await copropiedadStore.cargarCuentasBancarias(props.tenantId)
  }
  // Sin esto el selector rotula "Cuenta — 000123" en vez de "Bancolombia — 000123": el nombre
  // de la entidad vive en lista_tipos, no en cuentas_bancarias.
  if (copropiedadStore.entidadesFinancieras.length === 0) {
    await copropiedadStore.cargarEntidadesFinancieras(props.tenantId)
  }
  // Con una sola cuenta bancaria no hay nada que elegir; con varias, la de recaudo es la
  // predeterminada razonable.
  const cuentas = copropiedadStore.cuentasBancarias
  cuentaBancariaId.value = cuentas.length === 1
    ? (cuentas[0]?.id ?? null)
    : (cuentas.find((c) => c.es_recaudo)?.id ?? null)
})

const opcionesLiquidacion: { label: string; value: Liquidacion }[] = [
  { label: 'Pagado desde una cuenta bancaria', value: 'pagado_banco' },
  { label: 'Pagado en efectivo (caja)', value: 'pagado_caja' },
  { label: 'Queda por pagar al proveedor', value: 'por_pagar' },
]

const opcionesCuentaBancaria = computed<{ label: string; value: string | null }[]>(() => [
  { label: '— Elegir —', value: null },
  ...copropiedadStore.cuentasBancarias.map((c) => ({
    label: `${entidadPorId.value.get(c.entidad_financiera_id) ?? 'Cuenta'} — ${c.numero_cuenta}`,
    value: c.id,
  })),
])

const entidadPorId = computed(
  () => new Map(copropiedadStore.entidadesFinancieras.map((e) => [e.id, e.nombre])),
)

const terceroOpciones = computed(() =>
  tercerosStore.terceros.map((t) => ({
    valor: t.id,
    etiqueta: `${t.nombre_completo ?? t.razon_social ?? t.numero_documento} (${t.numero_documento})`,
  })),
)

/** La cuenta bancaria solo aplica a un pago por banco — el guard rechaza lo contrario con
 * LIQUIDACION_CUENTA_BANCARIA_NO_APLICA, así que se limpia al cambiar de modo. */
watch(liquidacion, (modo) => {
  if (modo !== 'pagado_banco') cuentaBancariaId.value = null
  else if (cuentaBancariaId.value === null) {
    const cuentas = copropiedadStore.cuentasBancarias
    cuentaBancariaId.value = cuentas.find((c) => c.es_recaudo)?.id ?? cuentas[0]?.id ?? null
  }
})

const opcionesAgrupacion = computed(() => [
  { label: '— Sin ubicación —', value: null },
  ...agrupacionesStore.arbolPlano.map((a) => ({ label: a.ruta, value: a.id })),
])

const opcionesCentroCosto = computed(() => [
  { label: '— Sin centro de costo —', value: null },
  ...presupuestoStore.tiposCentroCosto.map((t) => ({ label: t.nombre, value: t.id })),
])

/** Misma construcción de ruta legible que PresupuestoRubroDrawer.vue (parent_id, no `ruta`). */
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
    .map((c) => ({ valor: c.id, etiqueta: `${rutaNombres(c)} (${c.naturaleza})` }))
    .sort((a, b) => a.etiqueta.localeCompare(b.etiqueta))
})

const opcionesPeriodo = computed(() => [
  { label: '— Elegir —', value: null },
  ...liquidacionStore.periodos
    .slice()
    .sort((a, b) => b.anio - a.anio || b.mes - a.mes)
    .map((p) => ({ value: p.id, label: `${p.anio}-${String(p.mes).padStart(2, '0')} (${p.estado})` })),
])

async function guardar(): Promise<void> {
  error.value = null
  if (cuentaId.value === null || periodoId.value === null || monto.value === null) {
    error.value = 'Completa cuenta, periodo y monto.'
    return
  }

  // Se anticipan aquí las dos reglas del guard que dependen de la liquidación elegida, para que
  // el usuario las vea junto al campo y no como un error de BD después de enviar.
  if (liquidacion.value === 'pagado_banco' && cuentaBancariaId.value === null) {
    error.value = 'Indica de qué cuenta bancaria salió el dinero.'
    return
  }
  if (liquidacion.value === 'por_pagar' && terceroId.value === null) {
    error.value = 'Indica a qué proveedor se le adeuda: una cuenta por pagar necesita acreedor.'
    return
  }

  guardando.value = true
  try {
    await presupuestoStore.registrarEjecucion({
      tenantId: props.tenantId,
      cuentaId: cuentaId.value,
      periodoId: periodoId.value,
      monto: monto.value,
      descripcion: descripcion.value || undefined,
      referencia: referencia.value || undefined,
      agrupacionId: agrupacionId.value ?? undefined,
      centroCostoId: centroCostoId.value ?? undefined,
      liquidacion: liquidacion.value,
      cuentaBancariaId: cuentaBancariaId.value ?? undefined,
      terceroId: terceroId.value ?? undefined,
      fechaDocumento: fechaDocumento.value || undefined,
    })
    emit('registrado')
  } catch (excepcion) {
    error.value = mensajeError(excepcion, 'No se pudo registrar el movimiento.')
  } finally {
    guardando.value = false
  }
}
</script>

<template>
  <div class="ficha-inmueble">
    <UiDrawer :abierto="true" titulo="Registrar movimiento" @cerrar="emit('cerrar')">
      <div class="space-y-4 text-sm">
        <UFormField label="Cuenta" name="cuenta_id">
          <UiSelectorBuscable v-model="cuentaId" :opciones="cuentasHoja" placeholder="Buscar cuenta…" />
        </UFormField>
        <div class="grid grid-cols-2 gap-4">
          <UFormField label="Periodo" name="periodo_id">
            <USelect v-model="periodoId" :items="opcionesPeriodo" value-key="value" class="w-full" />
          </UFormField>
          <UFormField label="Monto" name="monto">
            <UInputNumber
              v-model="monto"
              :min="0"
              :increment="false"
              :decrement="false"
              :format-options="{ style: 'currency', currency: 'COP', maximumFractionDigits: 0 }"
              locale="es-CO"
              class="w-full"
            />
          </UFormField>
        </div>
        <UFormField
          label="¿Cómo se pagó?"
          name="liquidacion"
          help="Determina la contrapartida contable del movimiento."
        >
          <USelect v-model="liquidacion" :items="opcionesLiquidacion" value-key="value" class="w-full" />
        </UFormField>

        <UFormField
          v-if="liquidacion === 'pagado_banco'"
          label="Cuenta bancaria"
          name="cuenta_bancaria_id"
        >
          <USelect
            v-model="cuentaBancariaId"
            :items="opcionesCuentaBancaria"
            value-key="value"
            class="w-full"
          />
        </UFormField>

        <UFormField
          :label="liquidacion === 'por_pagar' ? 'Proveedor (a quién se le debe)' : 'Proveedor (opcional)'"
          name="tercero_id"
        >
          <UiSelectorBuscable
            v-model="terceroId"
            :opciones="terceroOpciones"
            placeholder="Buscar tercero…"
          />
        </UFormField>

        <div class="grid grid-cols-2 gap-4">
          <UFormField
            label="Fecha del documento"
            name="fecha_documento"
            help="La del soporte. Si se deja vacía, se toma el inicio del periodo."
          >
            <UInput v-model="fechaDocumento" type="date" class="w-full" />
          </UFormField>
          <UFormField label="Referencia / comprobante" name="referencia">
            <UInput v-model="referencia" type="text" class="w-full" />
          </UFormField>
        </div>

        <UFormField label="Descripción" name="descripcion">
          <UInput v-model="descripcion" type="text" class="w-full" />
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
        <UButton :loading="guardando" @click="guardar">Registrar movimiento</UButton>
      </template>
    </UiDrawer>
  </div>
</template>
