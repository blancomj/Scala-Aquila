<script setup lang="ts">
// MANT-7: detalle de un hallazgo — asignar OT, aceptar (motivo + órgano si aplica) o cerrar
// (evidencia obligatoria si crítico/mayor). Los guards reales viven en la base
// (guard_mant_hallazgo_transicion); esta UI solo guía al usuario a no chocar con ellos.
import type { Database } from '@aquila/shared'

const props = defineProps<{ hallazgoId: string }>()
const emit = defineEmits<{ cerrar: []; actualizado: [] }>()

const tenantStore = useTenantStore()
const inspeccionesStore = useMantenimientoInspeccionesStore()
const ordenesStore = useMantenimientoOrdenesTrabajoStore()
const gobiernoOrganosStore = useGobiernoOrganosStore()

const hallazgo = ref<Database['public']['Tables']['mant_hallazgos']['Row'] | null>(null)
const error = ref<string | null>(null)

const organosVigentes = computed(() =>
  gobiernoOrganosStore.organos.filter((o) => !o.vigente_hasta),
)

async function cargar(): Promise<void> {
  hallazgo.value = await inspeccionesStore.cargarHallazgo(props.hallazgoId)
  const tenantId = tenantStore.activeTenant?.id
  if (!tenantId) return
  await Promise.all([
    ordenesStore.cargarOrdenes(tenantId),
    gobiernoOrganosStore.cargarOrganos(tenantId),
  ])
}
onMounted(cargar)

const otId = ref<string | null>(null)
const motivoAceptar = ref('')
const organoId = ref<string | undefined>(undefined)
const evidenciaDocumentoId = ref('')

async function asignarOt(): Promise<void> {
  if (!otId.value) return
  error.value = null
  try {
    await inspeccionesStore.asignarOtHallazgo(props.hallazgoId, otId.value)
    await cargar()
    emit('actualizado')
  } catch (excepcion) {
    error.value = mensajeError(excepcion, 'No se pudo asignar la OT.')
  }
}

async function aceptar(): Promise<void> {
  if (!motivoAceptar.value.trim()) return
  error.value = null
  try {
    await inspeccionesStore.aceptarHallazgo(props.hallazgoId, motivoAceptar.value.trim(), organoId.value)
    await cargar()
    emit('actualizado')
  } catch (excepcion) {
    error.value = mensajeError(excepcion, 'No se pudo aceptar el hallazgo.')
  }
}

async function cerrar(): Promise<void> {
  error.value = null
  try {
    await inspeccionesStore.cerrarHallazgo(props.hallazgoId, evidenciaDocumentoId.value.trim() || undefined)
    await cargar()
    emit('actualizado')
  } catch (excepcion) {
    error.value = mensajeError(excepcion, 'No se pudo cerrar el hallazgo.')
  }
}
</script>

<template>
  <UiDrawer :abierto="true" titulo="Hallazgo" @cerrar="emit('cerrar')">
    <div v-if="hallazgo" class="space-y-4">
      <div class="flex items-center gap-2">
        <UBadge variant="soft" class="capitalize">{{ hallazgo.severidad }}</UBadge>
        <UBadge variant="outline" class="capitalize">{{ hallazgo.estado.replace('_', ' ') }}</UBadge>
      </div>
      <p class="text-sm">{{ hallazgo.descripcion }}</p>
      <p v-if="hallazgo.fecha_limite" class="text-xs text-muted">
        Fecha límite: {{ new Date(`${hallazgo.fecha_limite}T00:00:00`).toLocaleDateString('es-CO') }}
      </p>

      <template v-if="hallazgo.estado === 'abierto'">
        <hr class="border-neutral-200 dark:border-neutral-800">
        <h3 class="text-sm font-medium">Tratar: asignar a una OT</h3>
        <div class="flex gap-2">
          <UiSelectorBuscable
            v-model="otId"
            class="flex-1"
            :opciones="
              ordenesStore.ordenes.map((o) => ({ valor: o.id, etiqueta: `OT ${o.numero}/${o.anio} — ${o.titulo}` }))
            "
            placeholder="Selecciona una OT"
          />
          <UButton :disabled="!otId" @click="asignarOt()">Asignar</UButton>
        </div>

        <hr class="border-neutral-200 dark:border-neutral-800">
        <h3 class="text-sm font-medium">O aceptar sin tratamiento</h3>
        <UFormField label="Motivo (obligatorio)">
          <UTextarea v-model="motivoAceptar" :rows="2" class="w-full" />
        </UFormField>
        <UFormField
          v-if="hallazgo.severidad === 'critico' && organosVigentes.length > 0"
          label="Órgano que aprueba (GOB-1 vigente en este tenant — obligatorio para crítico)"
        >
          <USelect
            v-model="organoId"
            class="w-full"
            :items="organosVigentes.map((o) => ({ label: o.nombre ?? o.tipo?.nombre ?? 'Órgano', value: o.id }))"
          />
        </UFormField>
        <UButton :disabled="!motivoAceptar.trim()" @click="aceptar()">Aceptar sin tratamiento</UButton>
      </template>

      <template v-else-if="hallazgo.estado === 'en_tratamiento'">
        <hr class="border-neutral-200 dark:border-neutral-800">
        <h3 class="text-sm font-medium">Cerrar</h3>
        <p v-if="hallazgo.severidad === 'critico' || hallazgo.severidad === 'mayor'" class="text-xs text-warning">
          Severidad {{ hallazgo.severidad }} — exige evidencia verificada para cerrar.
        </p>
        <UFormField label="Documento de evidencia (id)">
          <UInput v-model="evidenciaDocumentoId" class="w-full" placeholder="uuid del documento subido" />
        </UFormField>
        <UButton @click="cerrar()">Cerrar hallazgo</UButton>
      </template>

      <template v-else-if="hallazgo.estado === 'aceptado'">
        <p class="text-xs text-muted">Aceptado sin tratamiento: {{ hallazgo.aceptado_motivo }}</p>
      </template>

      <template v-else>
        <p class="text-xs text-success">Cerrado con evidencia verificada.</p>
      </template>

      <UAlert v-if="error" color="error" variant="soft" :title="error" />
    </div>
    <template #foot>
      <div class="flex justify-end w-full">
        <UButton variant="ghost" @click="emit('cerrar')">Cerrar panel</UButton>
      </div>
    </template>
  </UiDrawer>
</template>
