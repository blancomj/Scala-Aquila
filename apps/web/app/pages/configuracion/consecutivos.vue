<script setup lang="ts">
// Consecutivos de documento por copropiedad (RC-3) — a diferencia del folio
// de autenticidad del estado de cuenta (una secuencia global, compartida por
// toda la plataforma), cada tipo de documento contable lleva su propia
// numeración por tenant, con prefijo configurable. Hoy solo "Recibo de
// caja"; el mismo mecanismo sirve para comprobante_ingreso/egreso cuando
// existan (fuera de alcance de este plan).
definePageMeta({ layout: 'default', middleware: ['tenant', 'rbac'], permiso: 'settings:manage' })

const tenantStore = useTenantStore()
const consecutivosStore = useConsecutivosStore()
const toast = useToast()

const error = ref<string | null>(null)
const guardando = ref(false)

await useAsyncData('consecutivos-base', async () => {
  const tenantId = tenantStore.activeTenant?.id
  if (!tenantId) return null
  await consecutivosStore.cargarConsecutivos(tenantId)
  return null
})

// Tipos de documento conocidos hoy — se muestran aunque la copropiedad
// nunca haya emitido uno (siguiente_numero=1, prefijo vacío por defecto):
// así el administrador puede fijar el prefijo ANTES del primer recibo.
const TIPOS_CONOCIDOS = ['recibo_caja'] as const

const filas = computed(() =>
  TIPOS_CONOCIDOS.map((tipo) => {
    const existente = consecutivosStore.consecutivos.find((c) => c.tipo_documento === tipo)
    return {
      tipo_documento: tipo,
      etiqueta: ETIQUETA_TIPO_DOCUMENTO[tipo] ?? tipo,
      prefijo: existente?.prefijo ?? '',
      digitos: existente?.digitos ?? 6,
      siguiente_numero: existente?.siguiente_numero ?? 1,
      configurado: existente !== undefined,
    }
  }),
)

function ejemploFolio(prefijo: string, digitos: number, numero: number): string {
  return prefijo + String(numero).padStart(digitos, '0')
}

// ── modal de edición ────────────────────────────────────────────────
const modalAbierto = ref(false)
const tipoEditando = ref<string | null>(null)
const formPrefijo = ref('')
const formDigitos = ref(6)

function abrirEdicion(fila: (typeof filas.value)[number]): void {
  tipoEditando.value = fila.tipo_documento
  formPrefijo.value = fila.prefijo
  formDigitos.value = fila.digitos
  modalAbierto.value = true
}

async function guardar(): Promise<void> {
  const tenantId = tenantStore.activeTenant?.id
  if (!tenantId || !tipoEditando.value) return
  error.value = null
  guardando.value = true
  try {
    await consecutivosStore.guardarConsecutivo({
      tenantId,
      tipoDocumento: tipoEditando.value,
      prefijo: formPrefijo.value.trim(),
      digitos: formDigitos.value,
    })
    modalAbierto.value = false
    toast.add({ title: 'Consecutivo actualizado.', color: 'success' })
  } catch (excepcion) {
    error.value = mensajeError(excepcion, 'No se pudo guardar el consecutivo.')
  } finally {
    guardando.value = false
  }
}
</script>

<template>
  <div class="space-y-4">
    <div>
      <h1 class="text-xl font-semibold mb-1">Consecutivos de documento</h1>
      <p class="text-sm text-neutral-500 max-w-2xl">
        Numeración propia de esta copropiedad para cada tipo de documento contable — el prefijo
        y la cantidad de dígitos se aplican al PRÓXIMO documento que se emita, nunca a los ya
        expedidos.
      </p>
    </div>

    <UAlert v-if="error" color="error" variant="soft" :title="error" />

    <UiTabla
      :columnas="[
        { clave: 'etiqueta', etiqueta: 'Documento' },
        { clave: 'prefijo', etiqueta: 'Prefijo' },
        { clave: 'digitos', etiqueta: 'Dígitos', alinear: 'derecha' },
        { clave: 'siguiente', etiqueta: 'Próximo folio' },
        { clave: 'acciones', etiqueta: '' },
      ]"
      :filas="filas"
      :clave-fila="(f) => f.tipo_documento"
      vacio="Sin tipos de documento."
    >
      <template #celda-prefijo="{ fila }">
        <span class="font-mono text-xs text-neutral-600">{{ fila.prefijo || '(sin prefijo)' }}</span>
      </template>
      <template #celda-digitos="{ fila }">
        <span class="tabular-nums text-neutral-500">{{ fila.digitos }}</span>
      </template>
      <template #celda-siguiente="{ fila }">
        <span class="font-mono text-sm font-medium">{{
          ejemploFolio(fila.prefijo, fila.digitos, fila.siguiente_numero)
        }}</span>
        <span v-if="!fila.configurado" class="ml-2 text-xs text-neutral-400">— sin configurar aún</span>
      </template>
      <template #celda-acciones="{ fila }">
        <div class="flex justify-end">
          <UButton size="xs" variant="ghost" icon="i-lucide-pencil" title="Editar" @click="abrirEdicion(fila)" />
        </div>
      </template>
    </UiTabla>

    <UModal
      :open="modalAbierto"
      title="Editar consecutivo"
      @update:open="(abierto) => { if (!abierto) modalAbierto = false }"
    >
      <template #body>
        <div class="space-y-4 text-sm">
          <UFormField label="Prefijo" name="prefijo">
            <UInput v-model="formPrefijo" placeholder="ej. RC-" class="w-full" />
          </UFormField>
          <UFormField label="Dígitos" name="digitos">
            <UInput v-model.number="formDigitos" type="number" min="1" max="10" class="w-32" />
          </UFormField>
          <p class="text-xs text-neutral-400">
            Ejemplo del próximo folio con estos valores:
            <span class="font-mono font-medium text-neutral-600">{{
              ejemploFolio(
                formPrefijo,
                formDigitos,
                filas.find((f) => f.tipo_documento === tipoEditando)?.siguiente_numero ?? 1,
              )
            }}</span>
          </p>
        </div>
      </template>
      <template #footer>
        <div class="flex justify-end gap-2">
          <UButton variant="ghost" @click="modalAbierto = false">Cancelar</UButton>
          <UButton :loading="guardando" @click="guardar">Guardar</UButton>
        </div>
      </template>
    </UModal>
  </div>
</template>
