<script setup lang="ts">
// /fundamentos/nuevo — formulario de creación de fundamento propio del tenant.
import { TIPO_FUNDAMENTO_ITEMS } from '~/utils/fundamento-labels'

definePageMeta({ layout: 'default', middleware: ['tenant', 'rbac'], permiso: 'data:create' })

const tenantStore = useTenantStore()
const fundamentoStore = useFundamentoNormativoStore()
const toast = useToast()
const router = useRouter()

const tipo = ref<string>('reglamento_ph')
const norma = ref('')
const articulo = ref('')
const descripcion = ref('')
const referencia = ref('')
const fuenteUrl = ref('')
const cargando = ref(false)
const error = ref<string | null>(null)

const formularioSucio = computed(() =>
  norma.value || articulo.value || descripcion.value || referencia.value || fuenteUrl.value,
)

onBeforeRouteLeave((_to, _from, next) => {
  if (formularioSucio.value && !cargando.value) {
    if (!window.confirm('Tienes cambios sin guardar. ¿Salir de todos modos?')) {
      next(false)
      return
    }
  }
  next()
})

if (import.meta.client) {
  window.addEventListener('beforeunload', (e) => {
    if (formularioSucio.value && !cargando.value) {
      e.preventDefault()
    }
  })
}

async function crear(): Promise<void> {
  error.value = null
  const tenantId = tenantStore.activeTenant?.id
  if (!tenantId || !norma.value) {
    toast.add({ title: 'Falta la norma.', description: 'Es un campo obligatorio.', color: 'warning' })
    return
  }
  cargando.value = true
  try {
    await fundamentoStore.crearFundamento({
      tenantId,
      tipo: tipo.value as never,
      norma: norma.value,
      articulo: articulo.value || undefined,
      descripcion: descripcion.value || undefined,
      referencia: referencia.value || undefined,
      fuenteUrl: fuenteUrl.value || undefined,
    })
    toast.add({ title: 'Fundamento normativo creado.', color: 'success' })
    router.push('/fundamentos')
  } catch (excepcion) {
    error.value = mensajeError(excepcion, 'No se pudo crear el fundamento normativo.')
  } finally {
    cargando.value = false
  }
}
</script>

<template>
  <div class="space-y-6 max-w-2xl">
    <div>
      <h1 class="text-xl font-semibold mb-1">Nuevo fundamento normativo</h1>
      <p class="text-sm text-neutral-500 dark:text-neutral-400">
        Registrar una referencia legal propia de esta copropiedad.
      </p>
    </div>

    <form class="space-y-4" @submit.prevent="crear">
      <UFormField label="Tipo" name="tipo" description="Categoría legal del fundamento">
        <USelect v-model="tipo" :items="TIPO_FUNDAMENTO_ITEMS" value-key="value" class="w-full" />
      </UFormField>

      <UFormField label="Norma" name="norma">
        <UInput v-model="norma" required class="w-full" placeholder="Ej: Reglamento Interno PH" />
      </UFormField>

      <UFormField label="Artículo" name="articulo" description="Ej: Art. 12, Art. 47 inc. 2">
        <UInput v-model="articulo" class="w-full" placeholder="Ej: Art. 12" />
      </UFormField>

      <UFormField label="Descripción" name="descripcion">
        <UTextarea v-model="descripcion" class="w-full" :rows="5" autoresize :maxrows="14" placeholder="Resumen de la aplicación al sistema" />
      </UFormField>

      <UFormField label="Referencia" name="referencia" description="Clave interna o código de seguimiento (no es la norma)">
        <UInput v-model="referencia" class="w-full" placeholder="Clave interna" />
      </UFormField>

      <UFormField label="Fuente URL" name="fuenteUrl" description="Enlace a la norma oficial o documento">
        <UInput v-model="fuenteUrl" class="w-full" placeholder="https://..." />
      </UFormField>

      <UAlert v-if="error" color="error" variant="soft" :title="error" />

      <div class="flex gap-3">
        <UButton variant="soft" @click="router.push('/fundamentos')">Cancelar</UButton>
        <UButton type="submit" :loading="cargando">Registrar</UButton>
      </div>
    </form>
  </div>
</template>
