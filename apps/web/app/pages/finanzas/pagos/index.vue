<script setup lang="ts">
// FIN-3 §3.8: bandeja de lotes de pago por estado. El armado del lote (selección de facturas
// pagables, disponibilidad en vivo) vive en la ficha ([id].vue) — aquí solo se crea el
// encabezado (cuenta bancaria + fecha programada) y se navega a ella.

definePageMeta({ layout: 'default', middleware: ['tenant', 'rbac'], permiso: 'data:read' })

const tenantStore = useTenantStore()
const lotesStore = useFinanzasLotesPagoStore()
const copropiedadStore = useCopropiedadStore()

async function cargar(): Promise<void> {
  const tenantId = tenantStore.activeTenant?.id
  if (!tenantId) return
  await Promise.all([
    lotesStore.cargarLotes(tenantId),
    copropiedadStore.cargarCuentasBancarias(tenantId),
  ])
}
onMounted(cargar)

const ESTADO_COLOR: Record<string, 'success' | 'warning' | 'error' | 'neutral' | 'primary'> = {
  borrador: 'neutral', programado: 'primary', aprobado: 'primary',
  ejecutado: 'success', conciliado: 'success', anulado: 'error',
}

const filtroEstado = ref<string | null>(null)
const lotesFiltrados = computed(() =>
  lotesStore.lotes.filter((l) => !filtroEstado.value || l.estado === filtroEstado.value),
)
const nombreCuenta = computed(() =>
  new Map(copropiedadStore.cuentasBancarias.map((c) => [c.id, c.numero_cuenta])),
)

const drawerAbierto = ref(false)
const form = reactive({ cuentaBancariaId: null as string | null, fechaProgramada: new Date().toISOString().slice(0, 10) })
const errorGuardar = ref<string | null>(null)

const opcionesCuenta = computed(() =>
  copropiedadStore.cuentasBancarias.map((c) => ({ valor: c.id, etiqueta: c.numero_cuenta })),
)

function abrirNuevo(): void {
  form.cuentaBancariaId = null
  form.fechaProgramada = new Date().toISOString().slice(0, 10)
  errorGuardar.value = null
  drawerAbierto.value = true
}

async function guardar(): Promise<void> {
  const tenantId = tenantStore.activeTenant?.id
  if (!tenantId || !form.cuentaBancariaId) return
  errorGuardar.value = null
  try {
    const lote = await lotesStore.crearLote({
      tenant_id: tenantId, cuenta_bancaria_id: form.cuentaBancariaId, fecha_programada: form.fechaProgramada,
    })
    drawerAbierto.value = false
    await navigateTo(`/finanzas/pagos/${lote.id}`)
  } catch (excepcion) {
    errorGuardar.value = mensajeError(excepcion, 'No se pudo crear el lote.')
  }
}
</script>

<template>
  <div class="space-y-6">
    <div class="flex items-start justify-between gap-4 flex-wrap">
      <UiTituloDescripcion clase-descripcion="text-sm text-muted mt-1 max-w-2xl">
        <template #titulo>
          <h1 class="text-xl font-semibold">Lotes de pago</h1>
        </template>
        <template #descripcion>
          Agrupa facturas aprobadas para pagarlas juntas contra una cuenta bancaria. Cada ítem
          reserva disponibilidad en el mismo acto de agregarse — el ciclo completo va de
          programado a ejecutado y, al confirmar la línea del extracto, a conciliado.
        </template>
      </UiTituloDescripcion>
      <div class="flex items-center gap-2">
        <UButton variant="ghost" icon="i-lucide-refresh-cw" :loading="lotesStore.loading" @click="cargar()">
          Actualizar
        </UButton>
        <UButton icon="i-lucide-plus" @click="abrirNuevo()">Nuevo lote</UButton>
      </div>
    </div>

    <div class="flex justify-end">
      <USelect
        v-model="filtroEstado"
        :items="[
          { label: 'Todos los estados', value: null },
          { label: 'Borrador', value: 'borrador' },
          { label: 'Programado', value: 'programado' },
          { label: 'Aprobado', value: 'aprobado' },
          { label: 'Ejecutado', value: 'ejecutado' },
          { label: 'Conciliado', value: 'conciliado' },
          { label: 'Anulado', value: 'anulado' },
        ]"
        class="w-48"
      />
    </div>

    <div class="rounded-lg border border-default divide-y divide-default">
      <NuxtLink
        v-for="l in lotesFiltrados" :key="l.id" :to="`/finanzas/pagos/${l.id}`"
        class="flex items-center justify-between gap-4 p-3 hover:bg-elevated transition-colors"
      >
        <div>
          <p class="font-medium">Lote {{ l.anio }}-{{ String(l.numero).padStart(5, '0') }} · {{ nombreCuenta.get(l.cuenta_bancaria_id) ?? '—' }}</p>
          <p class="text-sm text-muted">
            Programado {{ l.fecha_programada }} · {{ l.cantidad_pagos }} pago(s) · monto {{ l.monto_total }}
          </p>
        </div>
        <UBadge :color="ESTADO_COLOR[l.estado] ?? 'neutral'" variant="soft" class="capitalize">
          {{ l.estado }}
        </UBadge>
      </NuxtLink>
      <p v-if="lotesFiltrados.length === 0 && !lotesStore.loading" class="p-6 text-sm text-muted text-center">
        Sin lotes con este filtro.
      </p>
    </div>

    <UiDrawer :abierto="drawerAbierto" titulo="Nuevo lote de pago" @cerrar="drawerAbierto = false">
      <div class="space-y-3">
        <UAlert v-if="errorGuardar" color="error" variant="soft" :title="errorGuardar" />
        <UFormField label="Cuenta bancaria" name="cuenta">
          <UiSelectorBuscable v-model="form.cuentaBancariaId" :opciones="opcionesCuenta" placeholder="Selecciona una cuenta" />
        </UFormField>
        <UFormField label="Fecha programada" name="fechaProgramada">
          <UInput v-model="form.fechaProgramada" type="date" class="w-full" />
        </UFormField>
        <p class="text-xs text-muted">
          Las facturas se seleccionan y agregan al lote desde su ficha, con la disponibilidad de
          la cuenta en vivo.
        </p>
      </div>
      <template #foot>
        <div class="flex justify-end gap-2 w-full">
          <UButton variant="ghost" @click="drawerAbierto = false">Cancelar</UButton>
          <UButton :loading="lotesStore.guardando" :disabled="!form.cuentaBancariaId" @click="guardar()">
            Crear lote
          </UButton>
        </div>
      </template>
    </UiDrawer>
  </div>
</template>
