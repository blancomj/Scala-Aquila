<script setup lang="ts">
// Sube un extracto bancario (CSV, un solo parser real hoy: Bancolombia — no verificado contra un
// archivo real, ver conciliacion-parsers.ts) a `importar-extracto-bancario`. cuenta_bancaria_id es
// obligatoria desde D-CB-2 (Fase 3 de conciliación bancaria contable, 20260935060000) — un
// extracto sin cuenta conocida no es conciliable contablemente, la Edge Function la rechaza.
import type { Database } from '@aquila/shared'

type CuentaBancariaRow = Database['public']['Tables']['cuentas_bancarias']['Row']

const props = defineProps<{
  abierto: boolean
  tenantId: string
  cuentasBancarias: readonly CuentaBancariaRow[]
}>()
const emit = defineEmits<{ cerrar: []; importado: [] }>()

const conciliacionStore = useConciliacionStore()
const toast = useToast()

const cuentaBancariaId = ref<string | null>(null)
const archivoSeleccionado = ref<File | null>(null)
const error = ref<string | null>(null)

watch(
  () => props.abierto,
  (abierto) => {
    if (!abierto) return
    cuentaBancariaId.value = null
    archivoSeleccionado.value = null
    error.value = null
  },
)

const opcionesCuenta = computed(() =>
  props.cuentasBancarias.map((c) => ({ valor: c.id, etiqueta: c.numero_cuenta })),
)

function elegirArchivo(evento: Event): void {
  const input = evento.target as HTMLInputElement
  archivoSeleccionado.value = input.files?.[0] ?? null
  error.value = null
}

async function confirmar(): Promise<void> {
  if (!archivoSeleccionado.value || !cuentaBancariaId.value) return
  error.value = null
  try {
    const resumen = await conciliacionStore.importarExtracto({
      tenantId: props.tenantId,
      cuentaBancariaId: cuentaBancariaId.value,
      archivo: archivoSeleccionado.value,
    })
    const partes = [
      resumen.lineasNuevas > 0 ? `${resumen.lineasNuevas} línea(s) nueva(s)` : null,
      resumen.lineasYaExistian > 0 ? `${resumen.lineasYaExistian} ya existían` : null,
      resumen.autoConciliadas > 0 ? `${resumen.autoConciliadas} auto-conciliada(s)` : null,
      resumen.propuestas > 0 ? `${resumen.propuestas} con propuesta(s) por revisar` : null,
      resumen.sinCandidato > 0 ? `${resumen.sinCandidato} sin candidato` : null,
      resumen.noEsPago > 0 ? `${resumen.noEsPago} sin monto a favor (comisiones, notas, etc.)` : null,
    ].filter((p): p is string => p !== null)
    toast.add({
      title: `Extracto importado — ${resumen.lineasTotales} línea(s) en total.`,
      description: partes.length > 0 ? partes.join(' · ') + '.' : undefined,
      color: 'success',
    })
    emit('importado')
    emit('cerrar')
  } catch (excepcion) {
    error.value = mensajeError(excepcion, 'No se pudo importar el extracto.')
  }
}
</script>

<template>
  <UModal
    :open="abierto"
    title="Importar extracto bancario"
    :ui="{ content: 'max-w-lg' }"
    @update:open="(v) => { if (!v) emit('cerrar') }"
  >
    <template #body>
      <div class="space-y-4 text-sm">
        <UFormField label="Cuenta bancaria" name="cuentaBancariaId" required>
          <UiSelectorBuscable
            v-model="cuentaBancariaId" :opciones="opcionesCuenta"
            placeholder="Selecciona la cuenta de este extracto" class="w-full"
          />
        </UFormField>

        <div class="rounded-lg border border-default p-3">
          <p class="font-medium mb-2">Archivo (.csv)</p>
          <div class="flex items-center gap-3">
            <div class="flex-1 min-w-0">
              <p class="truncate">
                {{ archivoSeleccionado ? archivoSeleccionado.name : 'Selecciona el extracto exportado por el banco' }}
              </p>
              <span class="text-xs text-muted">Solo CSV por ahora — Bancolombia es el único formato soportado</span>
            </div>
            <UInput type="file" accept=".csv" class="max-w-[180px]" @change="elegirArchivo" />
          </div>
        </div>

        <UAlert v-if="error" color="error" variant="soft" :title="error" />
      </div>
    </template>
    <template #footer>
      <div class="flex justify-end gap-2">
        <UButton variant="ghost" @click="emit('cerrar')">Cancelar</UButton>
        <UButton
          :loading="conciliacionStore.importando" :disabled="!archivoSeleccionado || !cuentaBancariaId"
          @click="confirmar()"
        >
          Importar
        </UButton>
      </div>
    </template>
  </UModal>
</template>
