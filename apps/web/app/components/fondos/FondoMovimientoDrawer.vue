<script setup lang="ts">
// Drawer "Registrar movimiento" — solo tipos manuales (ver TIPOS_MOVIMIENTO_MANUAL,
// fondos-labels.ts): 'uso' queda fuera a propósito, pasa por Solicitudes de uso (D-37); '
// cierre_remanente' pertenece a BLOQUE O (cierre), todavía sin construir.
const props = defineProps<{ fondoId: string }>()
const emit = defineEmits<{ cerrar: []; creado: [] }>()

const tenantStore = useTenantStore()
const fondosStore = useFondosStore()

const opcionesTipo = TIPOS_MOVIMIENTO_MANUAL.map((t) => ({
  value: t,
  label: ETIQUETA_TIPO_MOVIMIENTO_FONDO[t] ?? t,
}))

const tipo = ref<(typeof TIPOS_MOVIMIENTO_MANUAL)[number]>('aporte')
const monto = ref<number | null>(null)
const fecha = ref('')
const descripcion = ref('')
const motivo = ref('')
const guardando = ref(false)
const error = ref<string | null>(null)

// ajuste/reversión aceptan monto <>0 (guard fondo_movimientos_monto_signo); el resto exige >0 —
// se deja la validación real al guard, este solo ajusta el placeholder/mínimo por tipo.
const exigeMotivo = computed(() => tipo.value === 'ajuste')

async function guardar(): Promise<void> {
  error.value = null
  const tenantId = tenantStore.activeTenant?.id
  if (!tenantId || monto.value === null || monto.value === 0) {
    error.value = 'Indica un monto.'
    return
  }
  if (exigeMotivo.value && !motivo.value.trim()) {
    error.value = 'Un ajuste exige motivo.'
    return
  }

  guardando.value = true
  try {
    await fondosStore.registrarMovimiento({
      tenantId,
      fondoId: props.fondoId,
      tipo: tipo.value,
      monto: monto.value,
      fecha: fecha.value || undefined,
      descripcion: descripcion.value.trim() || undefined,
      motivo: motivo.value.trim() || undefined,
    })
    emit('creado')
  } catch (excepcion) {
    error.value = mensajeError(excepcion, 'No se pudo registrar el movimiento.')
  } finally {
    guardando.value = false
  }
}
</script>

<template>
  <div class="ficha-inmueble">
    <UiDrawer
      :abierto="true"
      titulo="Registrar movimiento"
      subtitulo="Movimiento manual — un uso pasa por Solicitudes de uso"
      @cerrar="emit('cerrar')"
    >
      <div class="grid grid-cols-2 gap-4 text-sm">
        <UFormField label="Tipo" name="tipo" class="col-span-2">
          <USelect v-model="tipo" :items="opcionesTipo" class="w-full" />
        </UFormField>
        <UFormField label="Monto" name="monto">
          <UInput v-model.number="monto" type="number" class="w-full" />
        </UFormField>
        <UFormField label="Fecha" name="fecha">
          <UInput v-model="fecha" type="date" class="w-full" />
        </UFormField>
        <UFormField label="Descripción (opcional)" name="descripcion" class="col-span-2">
          <UTextarea v-model="descripcion" class="w-full" :rows="2" />
        </UFormField>
        <UFormField
          :label="exigeMotivo ? 'Motivo (obligatorio)' : 'Motivo (opcional)'"
          name="motivo"
          class="col-span-2"
        >
          <UTextarea v-model="motivo" class="w-full" :rows="2" />
        </UFormField>
      </div>

      <UAlert v-if="error" color="error" variant="soft" :title="error" class="mt-4" />

      <template #foot>
        <UButton variant="ghost" @click="emit('cerrar')">Cancelar</UButton>
        <UButton :loading="guardando" @click="guardar">Registrar</UButton>
      </template>
    </UiDrawer>
  </div>
</template>
