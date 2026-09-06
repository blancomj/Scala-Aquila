<script setup lang="ts">
// MANT-2 §4.5/§4.6: semáforo de cumplimiento (calculado, nunca almacenado) por requisito y,
// cuando el requisito está ligado a un tipo de activo, por cada activo de ese tipo. Registrar
// evidencia es append-only — un cumplimiento nuevo, nunca una edición del anterior.
definePageMeta({ layout: 'default', middleware: ['tenant', 'rbac'], permiso: 'data:read' })

const tenantStore = useTenantStore()
const cumplimientoStore = useCumplimientoStore()
const configStore = useMantenimientoConfiguracionStore()
const tercerosStore = useTercerosStore()

const terceros = ref<Awaited<ReturnType<typeof tercerosStore.cargarTerceros>>>([])

async function cargar(): Promise<void> {
  const tenantId = tenantStore.activeTenant?.id
  if (!tenantId) return
  await Promise.all([
    cumplimientoStore.cargarEstados(tenantId),
    configStore.cargarRequisitos(tenantId),
    terceros.value.length === 0 ? tercerosStore.cargarTerceros(tenantId).then((t) => { terceros.value = t }) : Promise.resolve(),
  ])
}
onMounted(cargar)

const ESTADO_COLOR: Record<string, 'success' | 'warning' | 'error' | 'neutral'> = {
  al_dia: 'success', proximo_a_vencer: 'warning', vencido: 'error', nunca_cumplido: 'neutral',
}
const ESTADO_LABEL: Record<string, string> = {
  al_dia: 'Al día', proximo_a_vencer: 'Próximo a vencer', vencido: 'Vencido', nunca_cumplido: 'Nunca cumplido',
}

const drawerAbierto = ref(false)
const filaSeleccionada = ref<{ requisitoId: string; activoId: string | null; nombre: string } | null>(null)
const requisitoSeleccionado = computed(() =>
  filaSeleccionada.value ? configStore.requisitos.find((r) => r.id === filaSeleccionada.value?.requisitoId) : undefined,
)

const form = reactive({
  fecha: new Date().toISOString().slice(0, 10),
  resultado: 'conforme' as 'conforme' | 'con_hallazgos' | 'no_conforme',
  evidenciaReferencia: '',
  terceroId: undefined as string | undefined,
  acreditacionReferencia: '',
})
const errorRegistrar = ref<string | null>(null)

function abrirRegistro(fila: { requisitoId: string; activoId: string | null; nombre: string }): void {
  filaSeleccionada.value = fila
  form.fecha = new Date().toISOString().slice(0, 10)
  form.resultado = 'conforme'
  form.evidenciaReferencia = ''
  form.terceroId = undefined
  form.acreditacionReferencia = ''
  errorRegistrar.value = null
  drawerAbierto.value = true
}

async function registrar(): Promise<void> {
  const tenantId = tenantStore.activeTenant?.id
  const fila = filaSeleccionada.value
  if (!tenantId || !fila) return
  errorRegistrar.value = null
  try {
    await cumplimientoStore.registrarCumplimiento({
      tenant_id: tenantId,
      requisito_id: fila.requisitoId,
      activo_id: fila.activoId,
      fecha_cumplimiento: form.fecha,
      resultado: form.resultado,
      evidencia_referencia: form.evidenciaReferencia || null,
      ejecutado_por_tercero_id: form.terceroId ?? null,
      acreditacion_referencia: form.acreditacionReferencia || null,
    })
    drawerAbierto.value = false
  } catch (e) {
    errorRegistrar.value = e instanceof Error ? e.message : 'No se pudo registrar'
  }
}
</script>

<template>
  <div class="space-y-6">
    <div class="flex items-start justify-between gap-4 flex-wrap">
      <UiTituloDescripcion clase-descripcion="text-sm text-muted mt-1 max-w-2xl">
        <template #titulo>
          <h1 class="text-xl font-semibold">Cumplimiento normativo</h1>
        </template>
        <template #descripcion>
          Estado calculado por requisito y activo, a la fecha de hoy — no se guarda, se recalcula
          cada vez que abres esta página. Configura o edita los requisitos en
          <NuxtLink to="/mantenimiento/configuracion" class="text-primary underline">Configuración de mantenimiento</NuxtLink>.
        </template>
      </UiTituloDescripcion>
      <UButton variant="ghost" icon="i-lucide-refresh-cw" :loading="cumplimientoStore.loading" @click="cargar()">
        Actualizar
      </UButton>
    </div>

    <div class="rounded-lg border border-default divide-y divide-default">
      <div
        v-for="e in cumplimientoStore.estados" :key="`${e.requisito_id}-${e.activo_id ?? 'tenant'}`"
        class="flex items-center justify-between gap-4 p-3 flex-wrap"
      >
        <div>
          <p class="text-sm font-medium">
            {{ e.requisito_nombre }}
            <span v-if="e.activo_codigo" class="text-muted">— {{ e.activo_codigo }}</span>
          </p>
          <p class="text-xs text-muted">
            <span v-if="e.ultima_fecha">Último cumplimiento: {{ e.ultima_fecha }}</span>
            <span v-if="e.vence_at"> · vence {{ e.vence_at }}</span>
            <span v-if="!e.ultima_fecha">Sin registro todavía</span>
          </p>
        </div>
        <div class="flex items-center gap-2">
          <UBadge :color="ESTADO_COLOR[e.estado] ?? 'neutral'" variant="soft">{{ ESTADO_LABEL[e.estado] ?? e.estado }}</UBadge>
          <UButton
            variant="ghost" size="sm"
            @click="abrirRegistro({ requisitoId: e.requisito_id, activoId: e.activo_id, nombre: e.requisito_nombre })"
          >
            Registrar cumplimiento
          </UButton>
        </div>
      </div>
      <p v-if="cumplimientoStore.estados.length === 0" class="p-4 text-sm text-muted text-center">
        Sin requisitos activos — actívalos o edítalos en Configuración de mantenimiento.
      </p>
    </div>

    <UiDrawer
      :abierto="drawerAbierto"
      :titulo="`Registrar cumplimiento`"
      :subtitulo="filaSeleccionada?.nombre"
      @cerrar="drawerAbierto = false"
    >
      <div class="space-y-3">
        <UAlert v-if="errorRegistrar" color="error" variant="soft" :title="errorRegistrar" />
        <UFormField label="Fecha de cumplimiento" name="fecha">
          <UInput v-model="form.fecha" type="date" class="w-full" />
        </UFormField>
        <UFormField label="Resultado" name="resultado">
          <USelect
            v-model="form.resultado"
            :items="[
              { label: 'Conforme', value: 'conforme' },
              { label: 'Con hallazgos', value: 'con_hallazgos' },
              { label: 'No conforme', value: 'no_conforme' },
            ]"
            class="w-full"
          />
        </UFormField>
        <UFormField label="Evidencia (enlace o descripción)" name="evidencia">
          <UInput v-model="form.evidenciaReferencia" class="w-full" placeholder="ej. enlace al certificado" />
        </UFormField>
        <template v-if="requisitoSeleccionado?.requiere_tercero_acreditado">
          <UFormField label="Ejecutado por (tercero acreditado)" name="tercero">
            <USelect
              v-model="form.terceroId"
              :items="terceros.map((t) => ({ label: t.nombre_completo ?? t.razon_social ?? '—', value: t.id }))"
              class="w-full"
            />
          </UFormField>
          <UFormField label="Referencia de acreditación" name="acreditacion">
            <UInput v-model="form.acreditacionReferencia" class="w-full" placeholder="ej. número de acreditación ONAC" />
          </UFormField>
        </template>
      </div>
      <template #foot>
        <div class="flex justify-end gap-2 w-full">
          <UButton variant="ghost" @click="drawerAbierto = false">Cancelar</UButton>
          <UButton :loading="cumplimientoStore.guardando" @click="registrar()">Registrar</UButton>
        </div>
      </template>
    </UiDrawer>
  </div>
</template>
