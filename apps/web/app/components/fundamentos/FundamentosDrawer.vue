<script setup lang="ts">
// Drawer de detalle/edición de un fundamento normativo — mismo patrón que
// ContabilidadCuentaDrawer.vue/PresupuestoCuentaDrawer.vue (UiDrawer, no el UDrawer de Nuxt UI
// suelto que tenía esta pantalla antes, que se quedaba sin botón de cierre visible en modo solo
// lectura). D-29: un fundamento global (tenant_id null) solo lo edita platform admin; el resto
// solo lo ve y puede proponer un cambio (ver FundamentoPropuestaModal, en la página).
import { COLOR_ESTADO_FUNDAMENTO, TIPO_FUNDAMENTO_ITEMS } from '~/utils/fundamento-labels'

const props = defineProps<{ fundamentoId: number; esPlataformaAdmin: boolean }>()
const emit = defineEmits<{ cerrar: []; editado: [] }>()

const cargando = ref(true)
const guardando = ref(false)
const error = ref<string | null>(null)

const esGlobal = ref(false)
const estado = ref('activo')
const tipo = ref('ley')
const norma = ref('')
const articulo = ref('')
const descripcion = ref('')
const referencia = ref('')
const fuenteUrl = ref('')
const fechaValidacion = ref('')
const validadoPor = ref('')

const soloLectura = computed(() => esGlobal.value && !props.esPlataformaAdmin)

onMounted(async () => {
  cargando.value = true
  error.value = null
  try {
    const cliente = useSupabaseClient()
    const { data, error: err } = await cliente
      .from('fundamento_normativo')
      .select('*')
      .eq('id', props.fundamentoId)
      .single()
    if (err) throw err
    if (!data) throw new Error('Fundamento no encontrado')

    esGlobal.value = data.tenant_id === null
    estado.value = (data as { estado?: string }).estado ?? 'activo'
    tipo.value = data.tipo
    norma.value = data.norma
    articulo.value = data.articulo ?? ''
    descripcion.value = data.descripcion ?? ''
    referencia.value = data.referencia ?? ''
    fuenteUrl.value = (data as { fuente_url?: string | null }).fuente_url ?? ''
    fechaValidacion.value = (data as { fecha_validacion?: string | null }).fecha_validacion ?? ''
    validadoPor.value = (data as { validado_por?: string | null }).validado_por ?? ''
  } catch (excepcion) {
    error.value = mensajeError(excepcion, 'No se pudo cargar el fundamento.')
  } finally {
    cargando.value = false
  }
})

async function guardar(): Promise<void> {
  error.value = null
  guardando.value = true
  try {
    await useFundamentoNormativoStore().actualizarFundamento(props.fundamentoId, {
      tipo: tipo.value as never,
      norma: norma.value,
      articulo: articulo.value || undefined,
      descripcion: descripcion.value || undefined,
      referencia: referencia.value || undefined,
      fuenteUrl: fuenteUrl.value || undefined,
    })
    emit('editado')
  } catch (excepcion) {
    error.value = mensajeError(excepcion, 'No se pudo actualizar el fundamento.')
  } finally {
    guardando.value = false
  }
}
</script>

<template>
  <div class="ficha-inmueble">
    <UiDrawer
      :abierto="true"
      :titulo="soloLectura ? 'Detalle del fundamento' : 'Editar fundamento'"
      :subtitulo="
        esGlobal ? 'Fundamento del catálogo de plataforma.' : 'Fundamento propio de esta copropiedad.'
      "
      @cerrar="emit('cerrar')"
    >
      <div v-if="cargando" class="space-y-3">
        <USkeleton v-for="i in 5" :key="i" class="h-9 w-full" />
      </div>
      <div v-else class="space-y-4 text-sm">
        <UBadge v-if="esGlobal" :color="COLOR_ESTADO_FUNDAMENTO[estado] ?? 'neutral'" variant="subtle">
          {{ estado }}
        </UBadge>

        <UFormField label="Tipo" name="tipo" description="Categoría legal del fundamento">
          <USelect
            v-model="tipo"
            :disabled="soloLectura"
            :items="TIPO_FUNDAMENTO_ITEMS"
            value-key="value"
            class="w-full"
          />
        </UFormField>

        <UFormField label="Norma" name="norma">
          <UInput v-model="norma" :disabled="soloLectura" required class="w-full" />
        </UFormField>

        <UFormField label="Artículo" name="articulo" description="Ej: Art. 12, Art. 47 inc. 2">
          <UInput v-model="articulo" :disabled="soloLectura" class="w-full" />
        </UFormField>

        <UFormField label="Descripción" name="descripcion">
          <UTextarea v-model="descripcion" :disabled="soloLectura" class="w-full" :rows="5" autoresize :maxrows="14" />
        </UFormField>

        <UFormField label="Referencia" name="referencia" description="Clave interna o código de seguimiento (no es la norma)">
          <UInput v-model="referencia" :disabled="soloLectura" class="w-full" />
        </UFormField>

        <UFormField label="Fuente URL" name="fuenteUrl" description="Enlace a la norma oficial o documento">
          <UInput v-model="fuenteUrl" :disabled="soloLectura" class="w-full" placeholder="https://..." />
        </UFormField>

        <div v-if="esGlobal" class="grid grid-cols-2 gap-4 pt-3 border-t border-default">
          <div>
            <p class="text-xs font-medium text-muted mb-1">Fecha de validación</p>
            <p class="text-sm">{{ fechaValidacion || '—' }}</p>
          </div>
          <div>
            <p class="text-xs font-medium text-muted mb-1">Validado por</p>
            <p class="text-xs text-neutral-500 dark:text-neutral-400">{{ validadoPor || '—' }}</p>
          </div>
        </div>
      </div>

      <UAlert v-if="error" color="error" variant="soft" :title="error" class="mt-4" />

      <template #foot>
        <UButton variant="ghost" @click="emit('cerrar')">{{ soloLectura ? 'Cerrar' : 'Cancelar' }}</UButton>
        <UButton v-if="!soloLectura" :loading="guardando" :disabled="cargando" @click="guardar">
          Guardar
        </UButton>
      </template>
    </UiDrawer>
  </div>
</template>
