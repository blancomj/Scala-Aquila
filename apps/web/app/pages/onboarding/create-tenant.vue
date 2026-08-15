<script setup lang="ts">
// PLAN §9.1/§9.3 — destino del middleware `tenant` cuando el usuario no
// tiene active_tenant_id. Requiere sesión (auth.global) pero no tenant
// (no lleva `middleware: ['tenant']`, o entraríamos en bucle de redirección).
definePageMeta({ layout: 'auth' })

const tenantStore = useTenantStore()

const nombre = ref('')
const slug = ref('')
const slugEditadoManualmente = ref(false)
const cargando = ref(false)
const error = ref<string | null>(null)

const MARCAS_DIACRITICAS = /[̀-ͯ]/g

function slugify(texto: string): string {
  return texto
    .toLowerCase()
    .normalize('NFD')
    .replace(MARCAS_DIACRITICAS, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 50)
}

watch(nombre, (valor) => {
  if (!slugEditadoManualmente.value) {
    slug.value = slugify(valor)
  }
})

function onSlugInput(): void {
  slugEditadoManualmente.value = true
}

// El error de `.rpc()` no es una instancia real de Error (visto en pruebas
// manuales: `instanceof Error` da `false` para un PostgrestError aquí),
// así que se extrae el mensaje por forma, no por clase.
function mensajeDeError(excepcion: unknown): string {
  if (
    excepcion &&
    typeof excepcion === 'object' &&
    'message' in excepcion &&
    typeof excepcion.message === 'string'
  ) {
    return excepcion.message
  }
  return 'No se pudo crear la copropiedad.'
}

async function crear(): Promise<void> {
  error.value = null
  cargando.value = true
  try {
    await tenantStore.crearTenant(nombre.value, slug.value)
    await navigateTo('/dashboard')
  } catch (excepcion) {
    error.value = mensajeDeError(excepcion)
  } finally {
    cargando.value = false
  }
}
</script>

<template>
  <UCard>
    <template #header>
      <h1 class="text-lg font-semibold">Crea tu copropiedad</h1>
    </template>

    <form class="space-y-4" @submit.prevent="crear">
      <UFormField label="Nombre" name="name">
        <UInput v-model="nombre" required class="w-full" />
      </UFormField>

      <UFormField
        label="Identificador (slug)"
        name="slug"
        help="Solo minúsculas, números y guiones."
      >
        <UInput v-model="slug" required class="w-full" @input="onSlugInput" />
      </UFormField>

      <UAlert v-if="error" color="error" variant="soft" :title="error" />

      <UButton type="submit" block :loading="cargando">Crear copropiedad</UButton>
    </form>
  </UCard>
</template>
