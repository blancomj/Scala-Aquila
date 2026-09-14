<script setup lang="ts">
// Resuelve una línea `pendiente` de la cola manual de conciliación de RECAUDO (§6.4 del prompt):
// aplicar a inmueble, crear saldo a favor, o descartar con motivo. Las tres pasan por
// `conciliar-linea` (Edge Function) — nunca un INSERT/UPDATE directo, ver conciliacion.ts.
//
// El heurístico (score por similitud de nombre) NUNCA se auto-aplica (§6.1, regla de oro) — por
// eso, aunque haya una `conciliacion_propuesta`, el usuario siempre confirma explícitamente el
// inmueble antes de que el botón quede habilitado; preseleccionar el candidato de mayor score es
// una comodidad, no una decisión tomada por el sistema.
import type { LineaConPropuestas } from '~/stores/conciliacion'

type InmuebleRow = { readonly id: string; readonly codigo: string; readonly propietario?: string }

const props = defineProps<{
  abierto: boolean
  tenantId: string
  linea: LineaConPropuestas | null
  inmuebles: readonly InmuebleRow[]
}>()
const emit = defineEmits<{ cerrar: []; resuelta: [] }>()

const conciliacionStore = useConciliacionStore()
const toast = useToast()

const inmuebleId = ref<string | null>(null)
const motivo = ref('')
const mostrarDescarte = ref(false)
const error = ref<string | null>(null)

const METODO_ETIQUETA: Record<string, string> = {
  referencia: 'Referencia exacta',
  monto_fecha: 'Monto + fecha',
  heuristico: 'Nombre parecido (no se auto-aplica)',
}

const propuestasOrdenadas = computed(() =>
  [...(props.linea?.conciliacion_propuesta ?? [])].sort((a, b) => b.score - a.score),
)

watch(
  () => props.linea?.id,
  () => {
    inmuebleId.value = propuestasOrdenadas.value[0]?.inmueble_id ?? null
    motivo.value = ''
    mostrarDescarte.value = false
    error.value = null
  },
)

// La etiqueta lleva el propietario después del código, igual que en
// NovedadesEditor.vue — UiSelectorBuscable filtra por `etiqueta`, así que esto
// también permite buscar el inmueble por el nombre de su dueño.
const opcionesInmueble = computed(() =>
  props.inmuebles.map((i) => ({
    valor: i.id,
    etiqueta: i.propietario ? `${i.codigo} — ${i.propietario}` : i.codigo,
  })),
)

async function ejecutar(accion: 'aplicar_a_inmueble' | 'crear_saldo_a_favor'): Promise<void> {
  if (!props.linea || !inmuebleId.value) return
  error.value = null
  try {
    await conciliacionStore.resolverLinea({
      accion, tenantId: props.tenantId, lineaId: props.linea.id, inmuebleId: inmuebleId.value,
    })
    toast.add({ title: 'Línea resuelta.', color: 'success' })
    emit('resuelta')
  } catch (excepcion) {
    error.value = mensajeError(excepcion, 'No se pudo resolver la línea.')
  }
}

async function descartar(): Promise<void> {
  if (!props.linea || motivo.value.trim().length < 3) return
  error.value = null
  try {
    await conciliacionStore.resolverLinea({
      accion: 'descartar', tenantId: props.tenantId, lineaId: props.linea.id, motivo: motivo.value.trim(),
    })
    toast.add({ title: 'Línea descartada.', color: 'success' })
    emit('resuelta')
  } catch (excepcion) {
    error.value = mensajeError(excepcion, 'No se pudo descartar la línea.')
  }
}
</script>

<template>
  <UiDrawer :abierto="abierto" titulo="Resolver línea de extracto" @cerrar="emit('cerrar')">
    <div v-if="linea" class="space-y-4">
      <div class="rounded-lg border border-default p-3 space-y-1">
        <p class="font-medium">{{ linea.descripcion_banco }}</p>
        <p class="text-sm text-muted">
          {{ linea.fecha_movimiento }} · monto {{ linea.monto }}
          <span v-if="linea.referencia_banco"> · ref. {{ linea.referencia_banco }}</span>
        </p>
      </div>

      <div v-if="propuestasOrdenadas.length > 0" class="space-y-2">
        <p class="text-sm font-medium">Candidatos propuestos</p>
        <div
          v-for="p in propuestasOrdenadas" :key="p.id"
          class="flex items-center justify-between gap-3 rounded-lg border border-default p-2 text-sm"
          :class="inmuebleId === p.inmueble_id ? 'ring-1 ring-primary' : ''"
        >
          <div>
            <p class="font-medium">{{ p.inmueble?.codigo ?? p.inmueble_id }}</p>
            <p class="text-xs text-muted">{{ METODO_ETIQUETA[p.metodo] ?? p.metodo }} · score {{ p.score }}</p>
          </div>
          <UButton size="xs" variant="soft" @click="inmuebleId = p.inmueble_id">Elegir</UButton>
        </div>
      </div>

      <UFormField label="Inmueble" name="inmuebleId">
        <UiSelectorBuscable v-model="inmuebleId" :opciones="opcionesInmueble" placeholder="Confirma el inmueble" class="w-full" />
      </UFormField>

      <UAlert v-if="error" color="error" variant="soft" :title="error" />

      <div v-if="mostrarDescarte" class="space-y-2">
        <UFormField label="Motivo del descarte" name="motivo">
          <UTextarea v-model="motivo" placeholder="Mínimo 3 caracteres" class="w-full" />
        </UFormField>
        <div class="flex justify-end gap-2">
          <UButton variant="ghost" @click="mostrarDescarte = false">Cancelar</UButton>
          <UButton
            color="error" variant="soft" :loading="conciliacionStore.resolviendo"
            :disabled="motivo.trim().length < 3" @click="descartar()"
          >
            Confirmar descarte
          </UButton>
        </div>
      </div>
    </div>

    <template #foot>
      <div v-if="!mostrarDescarte" class="flex justify-between gap-2 w-full">
        <UButton color="error" variant="ghost" @click="mostrarDescarte = true">Descartar</UButton>
        <div class="flex gap-2">
          <UButton
            variant="soft" :loading="conciliacionStore.resolviendo" :disabled="!inmuebleId"
            @click="ejecutar('crear_saldo_a_favor')"
          >
            Crear saldo a favor
          </UButton>
          <UButton :loading="conciliacionStore.resolviendo" :disabled="!inmuebleId" @click="ejecutar('aplicar_a_inmueble')">
            Aplicar a inmueble
          </UButton>
        </div>
      </div>
    </template>
  </UiDrawer>
</template>
