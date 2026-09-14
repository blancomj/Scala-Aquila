<script setup lang="ts">
// D-CB-5: una nota débito/crédito bancaria sin registrar pre-arma un borrador en el módulo de
// comprobantes ya existente (CO-2) — esta pantalla NUNCA inserta directo en
// contable_comprobante_detalle, solo llama el mismo `crearComprobante()` que usa la captura
// manual de Contabilidad → Comprobantes. Contabilizar sigue siendo un paso aparte, deliberado,
// desde ese módulo — la conciliación nunca contabiliza sola (§9 del prompt).
import type { PartidaConciliacion } from '~/stores/conciliacionBancaria'

const props = defineProps<{
  abierto: boolean
  tenantId: string
  periodoId: string
  anio: number
  cuentaBancoContableId: string
  partida: PartidaConciliacion | null
}>()
const emit = defineEmits<{ cerrar: []; creado: [comprobanteId: string] }>()

const comprobantesStore = useComprobantesStore()
const contabilidadStore = useContabilidadStore()
const toast = useToast()

const contrapartidaId = ref<string | null>(null)
const fecha = ref('')
const descripcion = ref('')
const error = ref<string | null>(null)
const guardando = ref(false)

const opcionesCuenta = computed(() =>
  contabilidadStore.cuentasDeMovimiento.map((c) => ({ valor: c.id, etiqueta: `${c.codigo} — ${c.nombre}` })),
)

/** nota_debito_banco: el banco rebajó el saldo (comisión, GMF…) → crédito banco, débito
 * contrapartida (gasto). nota_credito_banco: el banco abonó (rendimiento…) → débito banco,
 * crédito contrapartida (ingreso). Es la única lectura de signo posible para estos dos tipos —
 * `clasificarBancoSinCruzar` en conciliacion-bancaria-cruce.ts ya los distingue así. */
const esNotaDebito = computed(() => props.partida?.tipo?.codigo === 'nota_debito_banco')

watch(
  () => props.partida?.id,
  () => {
    error.value = null
    contrapartidaId.value = null
    fecha.value = props.partida?.extracto_linea?.fecha_movimiento ?? new Date().toISOString().slice(0, 10)
    descripcion.value = props.partida?.descripcion ?? props.partida?.extracto_linea?.descripcion_banco ?? ''
    if (props.abierto && props.tenantId) void contabilidadStore.cargarPlan(props.tenantId)
  },
)

async function guardar(): Promise<void> {
  if (!props.partida || !contrapartidaId.value) return
  const monto = props.partida.monto
  guardando.value = true
  error.value = null
  try {
    const comprobanteId = await comprobantesStore.crearComprobante({
      tenantId: props.tenantId,
      periodoId: props.periodoId,
      tipoId: await tipoAjusteId(),
      anio: props.anio,
      fecha: fecha.value,
      descripcion: descripcion.value,
      lineas: esNotaDebito.value
        ? [
            { cuentaId: props.cuentaBancoContableId, debito: 0, credito: monto },
            { cuentaId: contrapartidaId.value, debito: monto, credito: 0 },
          ]
        : [
            { cuentaId: props.cuentaBancoContableId, debito: monto, credito: 0 },
            { cuentaId: contrapartidaId.value, debito: 0, credito: monto },
          ],
    })
    toast.add({
      title: 'Borrador de comprobante creado.',
      description: 'Ábrelo en Contabilidad → Comprobantes para revisarlo y contabilizarlo.',
      color: 'success',
    })
    emit('creado', comprobanteId)
  } catch (excepcion) {
    error.value = mensajeError(excepcion, 'No se pudo crear el borrador de comprobante.')
  } finally {
    guardando.value = false
  }
}

async function tipoAjusteId(): Promise<number> {
  const tipos = await comprobantesStore.cargarTipos()
  const ajuste = tipos.find((t) => t.codigo === 'AJUSTE')
  if (!ajuste) throw new Error('Falta el tipo de comprobante AJUSTE en el catálogo.')
  return ajuste.id
}
</script>

<template>
  <UiDrawer :abierto="abierto" titulo="Crear comprobante desde la conciliación" @cerrar="emit('cerrar')">
    <div v-if="partida" class="space-y-4">
      <div class="rounded-lg border border-default p-3 space-y-1">
        <p class="font-medium">{{ partida.tipo?.nombre ?? partida.tipo?.codigo }}</p>
        <p class="text-sm text-muted">
          {{ partida.extracto_linea?.fecha_movimiento }} · monto {{ partida.monto }}
        </p>
        <p v-if="partida.descripcion" class="text-sm text-muted">{{ partida.descripcion }}</p>
      </div>

      <p class="text-xs text-muted">
        Esto solo guarda un <strong>borrador</strong> — no contabiliza nada. La cuenta de bancos
        ({{ esNotaDebito ? 'crédito' : 'débito' }}) ya está resuelta; elige la contrapartida
        (comisión bancaria, GMF, rendimiento financiero…).
      </p>

      <UFormField label="Fecha" name="fecha">
        <UInput v-model="fecha" type="date" class="w-full" />
      </UFormField>
      <UFormField label="Descripción" name="descripcion">
        <UInput v-model="descripcion" class="w-full" />
      </UFormField>
      <UFormField label="Cuenta contrapartida" name="contrapartidaId">
        <UiSelectorBuscable
          v-model="contrapartidaId" :opciones="opcionesCuenta"
          placeholder="Comisión bancaria, GMF, rendimiento financiero…" class="w-full"
        />
      </UFormField>

      <UAlert v-if="error" color="error" variant="soft" :title="error" />
    </div>

    <template #foot>
      <div class="flex justify-end gap-2 w-full">
        <UButton variant="ghost" @click="emit('cerrar')">Cancelar</UButton>
        <UButton :loading="guardando" :disabled="!contrapartidaId || !fecha" @click="guardar()">
          Guardar borrador
        </UButton>
      </div>
    </template>
  </UiDrawer>
</template>
