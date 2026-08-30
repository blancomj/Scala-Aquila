<script setup lang="ts">
// Pestaña "Fuentes de financiación" (E7) — antes vivía dentro de
// "Aplicación de bases" solo porque el diseño de 7 pestañas original no
// tenía espacio para una propia (ver comentario retirado). Mockup "Libro
// Presupuestal": registrar una fuente y simular el reparto son acciones
// distintas, ahora en pestañas separadas — la simulación vive en
// PresupuestoTabSimulacion.vue y consume presupuestoStore.fuentes que
// esta pestaña carga.
//
// Reconciliación con Plan de cuentas (20260830400000, investigación INCP/Ley 675 art. 35/38):
// "otros_ingresos"/"cuota_extraordinaria" son ingreso real — deberían poder vincularse a una
// cuenta de Ingresos. "fondo_imprevistos" NO es ingreso (usa un saldo que ya existe, efectivo
// restringido) — por eso nunca se le exige vínculo, solo se etiqueta como "Uso de reserva".
// La columna "Vínculo" es un aviso, no un bloqueo: nada impide guardar sin vincular.
const props = defineProps<{ presupuestoId: string | null }>()

const tenantStore = useTenantStore()
const presupuestoStore = usePresupuestoStore()
const fundamentoStore = useFundamentoNormativoStore()
const toast = useToast()

const drawerFuenteAbierto = ref(false)

watch(
  () => props.presupuestoId,
  async (id) => {
    if (id) await Promise.all([presupuestoStore.cargarFuentesFinanciacion(id), presupuestoStore.cargarTotalesCuenta(id)])
  },
  { immediate: true },
)

onMounted(() => {
  if (fundamentoStore.fundamentos.length === 0) fundamentoStore.cargarFundamentos()
  const tenantId = tenantStore.activeTenant?.id
  if (tenantId && presupuestoStore.tiposFuente.length === 0) presupuestoStore.cargarTiposFuente(tenantId)
})

const fundamentoPorId = computed(
  () => new Map(fundamentoStore.fundamentos.map((f) => [f.id, f.norma])),
)
const tipoFuentePorId = computed(
  () => new Map(presupuestoStore.tiposFuente.map((t) => [t.id, t.nombre])),
)
const tipoCodigoPorId = computed(
  () => new Map(presupuestoStore.tiposFuente.map((t) => [t.id, t.codigo])),
)
const cuentaPorId = computed(() => new Map(presupuestoStore.cuentas.map((c) => [c.id, c])))
const totalPorCuenta = computed(
  () => new Map(presupuestoStore.totalesCuenta.map((t) => [t.cuenta_id, Number(t.monto_acumulado)])),
)

const CATEGORIA_FUENTE: Record<string, string> = {
  otros_ingresos: 'Ingreso nuevo',
  cuota_extraordinaria: 'Ingreso nuevo',
  fondo_imprevistos: 'Uso de reserva',
}

function categoriaFuente(tipoId: number): string {
  const codigo = tipoCodigoPorId.value.get(tipoId)
  return (codigo && CATEGORIA_FUENTE[codigo]) ?? '—'
}

function esIngresoReal(tipoId: number): boolean {
  const codigo = tipoCodigoPorId.value.get(tipoId)
  return codigo === 'otros_ingresos' || codigo === 'cuota_extraordinaria'
}

interface EstadoVinculo {
  texto: string
  color: 'success' | 'warning' | 'neutral'
}

function estadoVinculo(fila: (typeof presupuestoStore.fuentes)[number]): EstadoVinculo {
  if (!esIngresoReal(fila.tipo_id)) return { texto: 'No aplica', color: 'neutral' }
  if (!fila.presupuesto_cuenta_id) return { texto: 'No está en Plan de cuentas', color: 'warning' }

  const nombreCuenta = cuentaPorId.value.get(fila.presupuesto_cuenta_id)?.nombre ?? '—'
  const montoCuenta = totalPorCuenta.value.get(fila.presupuesto_cuenta_id) ?? 0
  if (montoCuenta !== Number(fila.valor_aplicado)) {
    return { texto: `${nombreCuenta} · valores distintos`, color: 'warning' }
  }
  return { texto: nombreCuenta, color: 'success' }
}

function onFuenteCreada(): void {
  drawerFuenteAbierto.value = false
  toast.add({ title: 'Fuente de financiación registrada', color: 'success' })
}

</script>

<template>
  <div class="space-y-4">
    <div class="flex items-center justify-between">
      <div>
        <h2 class="text-lg font-semibold">Fuentes de financiación</h2>
        <p class="text-sm text-neutral-500">
          Recursos que financian el presupuesto además de la cuota de administración —
          préstamos, reservas, otros ingresos.
        </p>
      </div>
      <UButton size="xs" @click="drawerFuenteAbierto = true">Registrar fuente</UButton>
    </div>

    <UiTabla
      :columnas="[
        { clave: 'tipo', etiqueta: 'Tipo' },
        { clave: 'categoria', etiqueta: 'Naturaleza' },
        { clave: 'disponible', etiqueta: 'Disponible', alinear: 'derecha' },
        { clave: 'aplicado', etiqueta: 'Aplicado', alinear: 'derecha' },
        { clave: 'vinculo', etiqueta: 'Plan de cuentas' },
        { clave: 'descripcion', etiqueta: 'Descripción' },
        { clave: 'fundamento', etiqueta: 'Fundamento' },
      ]"
      :filas="presupuestoStore.fuentes"
      :clave-fila="(fuente) => fuente.id"
      vacio="Ninguna registrada todavía."
    >
      <template #celda-tipo="{ fila }">{{ tipoFuentePorId.get(fila.tipo_id) ?? '—' }}</template>
      <template #celda-categoria="{ fila }">
        <span class="text-neutral-500">{{ categoriaFuente(fila.tipo_id) }}</span>
      </template>
      <template #celda-disponible="{ fila }">
        <span class="tabular-nums">{{ formatoMoneda(fila.valor_disponible) }}</span>
      </template>
      <template #celda-aplicado="{ fila }">
        <span class="tabular-nums">{{ formatoMoneda(fila.valor_aplicado) }}</span>
      </template>
      <template #celda-vinculo="{ fila }">
        <UBadge :color="estadoVinculo(fila).color" variant="subtle">{{ estadoVinculo(fila).texto }}</UBadge>
      </template>
      <template #celda-descripcion="{ fila }"
        ><span class="text-neutral-500">{{ fila.descripcion ?? '—' }}</span></template
      >
      <template #celda-fundamento="{ fila }">
        <span class="text-neutral-500">
          {{
            fila.fundamento_normativo_id ? fundamentoPorId.get(fila.fundamento_normativo_id) : '—'
          }}
        </span>
      </template>
    </UiTabla>

    <p class="text-xs text-neutral-500">
      "Ingreso nuevo" (otros ingresos, cuota extraordinaria) se reconoce como ingreso al
      cobrarse — vincúlalo a su cuenta en Plan de cuentas para que ambos coincidan. "Uso de
      reserva" (fondo de imprevistos) no es ingreso, es aplicar un saldo que la copropiedad ya
      tiene — nunca necesita esa cuenta. El fondo de imprevistos tampoco puede aplicarse por más
      de su saldo actual disponible — se valida al guardar.
    </p>

    <PresupuestoFuenteDrawer
      v-if="drawerFuenteAbierto && presupuestoId && tenantStore.activeTenant"
      :presupuesto-id="presupuestoId"
      :tenant-id="tenantStore.activeTenant.id"
      @cerrar="drawerFuenteAbierto = false"
      @creado="onFuenteCreada"
    />
  </div>
</template>
