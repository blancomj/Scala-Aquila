<script setup lang="ts">
// MANT-7: crear/editar un formato de inspección + su checklist de ítems. Los ítems solo son
// editables mientras el formato está en borrador (guard_mant_inspeccion_formato_item_inmutable);
// una vez vigente, se congela y cualquier cambio exige una versión nueva (botón "Nueva versión").
import type { Database } from '@aquila/shared'

type FormatoRow = Database['public']['Tables']['mant_inspeccion_formatos']['Row']

const props = defineProps<{ formato?: FormatoRow | null }>()
const emit = defineEmits<{ cerrar: []; guardado: [] }>()

const tenantStore = useTenantStore()
const inspeccionesStore = useMantenimientoInspeccionesStore()

const tipos = ref<Awaited<ReturnType<typeof cargarListaTipos>>>([])
const requisitos = ref<Array<{ id: string; nombre: string }>>([])

const codigo = ref(props.formato?.codigo ?? '')
const nombre = ref(props.formato?.nombre ?? '')
const tipoId = ref<number | undefined>(props.formato?.tipo_id ?? undefined)
const requisitoId = ref<string | null>(props.formato?.requisito_id ?? null)

const esBorrador = computed(() => !props.formato || props.formato.estado === 'borrador')

const error = ref<string | null>(null)
const formatoGuardado = ref<FormatoRow | null>(props.formato ?? null)

// ── ítems (solo si el formato ya existe) ──
const nuevoTexto = ref('')
const nuevaSeveridad = ref<Database['public']['Enums']['severidad_t']>('menor')
const nuevoRequiereEvidencia = ref(false)

async function cargarDatos(): Promise<void> {
  const tenantId = tenantStore.activeTenant?.id
  if (!tenantId) return
  tipos.value = await cargarListaTipos(tenantId, 'TIPO_INSPECCION')
  const cliente = useSupabaseClient<Database>()
  const { data } = await cliente
    .from('mant_requisito')
    .select('id, nombre')
    .eq('tenant_id', tenantId)
    .eq('activo', true)
    .order('nombre')
  requisitos.value = data ?? []
  if (formatoGuardado.value) await inspeccionesStore.cargarItems(formatoGuardado.value.id)
}
onMounted(cargarDatos)

async function guardar(): Promise<void> {
  const tenantId = tenantStore.activeTenant?.id
  if (!tenantId || !codigo.value.trim() || !nombre.value.trim() || tipoId.value === undefined) return
  error.value = null
  try {
    if (formatoGuardado.value) {
      await inspeccionesStore.actualizarFormato(formatoGuardado.value.id, {
        nombre: nombre.value.trim(),
        tipo_id: tipoId.value,
        requisito_id: requisitoId.value,
      })
      emit('guardado')
    } else {
      const fila = await inspeccionesStore.crearFormato({
        tenant_id: tenantId,
        codigo: codigo.value.trim(),
        nombre: nombre.value.trim(),
        tipo_id: tipoId.value,
        requisito_id: requisitoId.value,
        version: 1,
      })
      formatoGuardado.value = fila
    }
  } catch (excepcion) {
    error.value = mensajeError(excepcion, 'No se pudo guardar el formato.')
  }
}

async function agregarItem(): Promise<void> {
  if (!formatoGuardado.value || !nuevoTexto.value.trim()) return
  error.value = null
  try {
    await inspeccionesStore.crearItem({
      tenant_id: formatoGuardado.value.tenant_id,
      formato_id: formatoGuardado.value.id,
      orden: inspeccionesStore.items.length + 1,
      texto: nuevoTexto.value.trim(),
      severidad_si_no_conforme: nuevaSeveridad.value,
      requiere_evidencia: nuevoRequiereEvidencia.value,
    })
    nuevoTexto.value = ''
    nuevoRequiereEvidencia.value = false
  } catch (excepcion) {
    error.value = mensajeError(excepcion, 'No se pudo agregar el ítem.')
  }
}

async function quitarItem(id: string): Promise<void> {
  try {
    await inspeccionesStore.eliminarItem(id)
  } catch (excepcion) {
    error.value = mensajeError(excepcion, 'No se pudo quitar el ítem.')
  }
}

async function crearNuevaVersion(): Promise<void> {
  const tenantId = tenantStore.activeTenant?.id
  const base = props.formato
  if (!tenantId || !base) return
  error.value = null
  try {
    const itemsBase = [...inspeccionesStore.items]
    const fila = await inspeccionesStore.crearFormato({
      tenant_id: tenantId,
      codigo: base.codigo,
      nombre: base.nombre,
      tipo_id: base.tipo_id,
      requisito_id: base.requisito_id,
      version: base.version + 1,
    })
    formatoGuardado.value = fila
    // Copia los ítems de la versión anterior como punto de partida — se editan libremente
    // mientras esta versión nueva siga en borrador.
    for (const item of itemsBase) {
      await inspeccionesStore.crearItem({
        tenant_id: tenantId,
        formato_id: fila.id,
        orden: item.orden,
        texto: item.texto,
        severidad_si_no_conforme: item.severidad_si_no_conforme,
        requiere_evidencia: item.requiere_evidencia,
      })
    }
  } catch (excepcion) {
    error.value = mensajeError(excepcion, 'No se pudo crear la nueva versión.')
  }
}

async function activar(): Promise<void> {
  const tenantId = tenantStore.activeTenant?.id
  if (!tenantId || !formatoGuardado.value) return
  error.value = null
  try {
    await inspeccionesStore.activarFormato(tenantId, formatoGuardado.value.codigo, formatoGuardado.value.id)
    emit('guardado')
  } catch (excepcion) {
    error.value = mensajeError(excepcion, 'No se pudo activar el formato.')
  }
}
</script>

<template>
  <UiDrawer
    :abierto="true"
    :titulo="formato ? `Formato: ${formato.nombre} (v${formato.version})` : 'Nuevo formato de inspección'"
    ancho="ancho"
    @cerrar="emit('cerrar')"
  >
    <div class="space-y-4">
      <div class="grid grid-cols-2 gap-3">
        <UFormField label="Código (estable entre versiones)" name="codigo">
          <UInput v-model="codigo" class="w-full" :disabled="!!formato" placeholder="ascensor_anual" />
        </UFormField>
        <UFormField label="Tipo" name="tipo">
          <USelect
            v-model="tipoId"
            class="w-full"
            :disabled="!esBorrador"
            :items="tipos.map((t) => ({ label: t.nombre, value: t.id }))"
          />
        </UFormField>
      </div>
      <UFormField label="Nombre" name="nombre">
        <UInput v-model="nombre" class="w-full" :disabled="!esBorrador" />
      </UFormField>
      <UFormField label="Requisito que demuestra (opcional)" name="requisito">
        <UiSelectorBuscable
          v-model="requisitoId"
          :opciones="requisitos.map((r) => ({ valor: r.id, etiqueta: r.nombre }))"
          placeholder="— Checklist puramente interno —"
          :deshabilitado="!esBorrador"
        />
      </UFormField>
      <p v-if="!esBorrador" class="text-xs text-muted">
        Este formato ya no es borrador — sus ítems están congelados. Usa "Nueva versión" para
        modificarlo.
      </p>

      <template v-if="formatoGuardado">
        <hr class="border-neutral-200 dark:border-neutral-800">
        <h3 class="text-sm font-medium">Ítems del checklist</h3>
        <UiTabla
          :columnas="[
            { clave: 'texto', etiqueta: 'Ítem' },
            { clave: 'severidad', etiqueta: 'Severidad si no conforme' },
            { clave: 'evidencia', etiqueta: 'Evidencia' },
            { clave: 'acciones', etiqueta: '' },
          ]"
          :filas="inspeccionesStore.items"
          :clave-fila="(i) => i.id"
          vacio="Sin ítems todavía."
        >
          <template #celda-severidad="{ fila }"
            ><span class="capitalize">{{ fila.severidad_si_no_conforme }}</span></template
          >
          <template #celda-evidencia="{ fila }">{{ fila.requiere_evidencia ? 'Sí' : 'No' }}</template>
          <template #celda-acciones="{ fila }">
            <UButton
              v-if="esBorrador"
              size="xs"
              variant="ghost"
              color="error"
              @click="quitarItem(fila.id)"
              >Quitar</UButton
            >
          </template>
        </UiTabla>

        <div v-if="esBorrador" class="grid grid-cols-4 gap-2 items-end">
          <UFormField label="Texto del ítem" class="col-span-2">
            <UInput v-model="nuevoTexto" class="w-full" />
          </UFormField>
          <UFormField label="Severidad">
            <USelect
              v-model="nuevaSeveridad"
              class="w-full"
              :items="[
                { label: 'Crítico', value: 'critico' },
                { label: 'Mayor', value: 'mayor' },
                { label: 'Menor', value: 'menor' },
                { label: 'Observación', value: 'observacion' },
              ]"
            />
          </UFormField>
          <UButton @click="agregarItem()">Agregar</UButton>
        </div>
        <UCheckbox
          v-if="esBorrador"
          v-model="nuevoRequiereEvidencia"
          label="El siguiente ítem exige evidencia fotográfica"
        />
      </template>

      <UAlert v-if="error" color="error" variant="soft" :title="error" />
    </div>
    <template #foot>
      <div class="flex justify-end gap-2 w-full">
        <UButton variant="ghost" @click="emit('cerrar')">Cerrar</UButton>
        <UButton
          v-if="formato && formato.estado === 'historica'"
          variant="soft"
          @click="crearNuevaVersion()"
        >
          Nueva versión
        </UButton>
        <UButton
          v-if="formatoGuardado && esBorrador && inspeccionesStore.items.length > 0"
          color="primary"
          :loading="inspeccionesStore.guardando"
          @click="activar()"
        >
          Activar (vigente)
        </UButton>
        <UButton
          v-if="!formatoGuardado || esBorrador"
          :loading="inspeccionesStore.guardando"
          :disabled="!codigo.trim() || !nombre.trim() || tipoId === undefined"
          @click="guardar()"
        >
          Guardar
        </UButton>
      </div>
    </template>
  </UiDrawer>
</template>
