<script setup lang="ts">
// Drawer "Cerrar fondo" — decide el remanente antes de cerrar (Modelo §35/§36, BLOQUE O). Solo se
// muestra cuando el fondo en_cierre tiene saldo > 0: con saldo 0 no hay nada que decidir y la
// página cierra directo (ver motivoNoPuedeCerrar en FondosTabDashboard.vue). fn_fondo_cerrar es
// una operación atómica (Prompt §53) — este drawer solo junta los datos que le manda.
import type { Database } from '@aquila/shared'

type FondoRow = Database['public']['Tables']['fondos']['Row']

const props = defineProps<{ fondo: FondoRow; saldo: number }>()
const emit = defineEmits<{ cerrar: []; cerrado: [] }>()

const tenantStore = useTenantStore()
const fondosStore = useFondosStore()

const organos = ref<{ valor: number; etiqueta: string }[]>([])
onMounted(async () => {
  const tenantId = tenantStore.activeTenant?.id
  if (!tenantId) return
  const tipos = await cargarListaTipos(tenantId, 'ORGANO_DECISORIO')
  organos.value = tipos.map((t) => ({ valor: t.id, etiqueta: t.nombre }))
})

const destino = ref<'traslado' | 'devolucion' | 'aplicacion' | ''>('')
const opcionesDestino = [
  { label: 'Traslado a otro fondo', value: 'traslado' },
  { label: 'Devolución a propietarios', value: 'devolucion' },
  { label: 'Aplicación a gasto', value: 'aplicacion' },
]

const fondoDestinoId = ref<string | null>(null)
const opcionesFondoDestino = computed(() =>
  fondosStore.fondos
    .filter((f) => f.id !== props.fondo.id && f.estado !== 'cerrado' && f.estado !== 'cancelado')
    .map((f) => ({ valor: f.id, etiqueta: `${f.codigo} — ${f.nombre} (${ETIQUETA_ESTADO_FONDO[f.estado] ?? f.estado})` })),
)

const organoId = ref<number | null>(null)
const decision = ref('')
const guardando = ref(false)
const error = ref<string | null>(null)

async function guardar(): Promise<void> {
  error.value = null
  if (!destino.value || organoId.value === null || !decision.value.trim()) {
    error.value = 'Completa el destino, el órgano decisorio y la decisión.'
    return
  }
  if (destino.value === 'traslado' && !fondoDestinoId.value) {
    error.value = 'El destino "Traslado a otro fondo" exige elegir el fondo destino.'
    return
  }

  guardando.value = true
  try {
    await fondosStore.cerrarFondo({
      fondoId: props.fondo.id,
      destino: destino.value,
      organoId: organoId.value,
      decision: decision.value.trim(),
      fondoDestinoId: destino.value === 'traslado' ? (fondoDestinoId.value ?? undefined) : undefined,
    })
    emit('cerrado')
  } catch (excepcion) {
    error.value = mensajeError(excepcion, 'No se pudo cerrar el fondo.')
  } finally {
    guardando.value = false
  }
}
</script>

<template>
  <div class="ficha-inmueble">
    <UiDrawer
      :abierto="true"
      :titulo="`Cerrar ${fondo.codigo} — ${fondo.nombre}`"
      subtitulo="Decide qué pasa con el remanente antes de cerrar el fondo"
      @cerrar="emit('cerrar')"
    >
      <div class="space-y-4 text-sm">
        <UAlert
          color="warning"
          variant="soft"
          :title="`Saldo pendiente: ${formatoMoneda(saldo)}`"
          description="Este fondo no puede cerrarse sin decidir qué pasa con este saldo (Modelo §35/§36)."
        />

        <UFormField label="Destino del remanente" name="destino">
          <USelect v-model="destino" :items="opcionesDestino" value-key="value" class="w-full" />
        </UFormField>

        <UFormField v-if="destino === 'traslado'" label="Fondo destino" name="fondo_destino">
          <UiSelectorBuscable v-model="fondoDestinoId" :opciones="opcionesFondoDestino" />
        </UFormField>

        <UFormField label="Órgano decisorio" name="organo_id">
          <UiSelectorBuscable v-model="organoId" :opciones="organos" />
        </UFormField>

        <UFormField label="Decisión" name="decision">
          <UTextarea v-model="decision" class="w-full" :rows="3" placeholder="Qué se decidió y por qué" />
        </UFormField>
      </div>

      <UAlert v-if="error" color="error" variant="soft" :title="error" class="mt-4" />

      <template #foot>
        <UButton variant="ghost" @click="emit('cerrar')">Cancelar</UButton>
        <UButton color="warning" :loading="guardando" @click="guardar">Registrar remanente y cerrar</UButton>
      </template>
    </UiDrawer>
  </div>
</template>
