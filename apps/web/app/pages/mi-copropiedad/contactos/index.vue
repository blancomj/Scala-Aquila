<script setup lang="ts">
// EXT-14 §6.1/§7.9 (Ola 2, M19) — "Contactos de emergencia": ligados al inmueble, no a la
// persona (§4.1) — cualquier residente del mismo inmueble ve/crea/elimina los mismos contactos,
// no solo los que él mismo creó.
import type { Database } from '@aquila/shared'

definePageMeta({ layout: 'mi-copropiedad', publico: true })

const actorExterno = useActorExternoStore()
const cliente = useSupabaseClient<Database>()

const cargando = ref(true)
const error = ref<string | null>(null)
const contactos = ref<ContactoEmergencia[]>([])

const nombre = ref('')
const telefono = ref('')
const parentesco = ref('')
const creando = ref(false)
const errorCrear = ref<string | null>(null)

const eliminandoId = ref<string | null>(null)
const errorEliminar = ref<string | null>(null)

async function cargar(): Promise<void> {
  cargando.value = true
  error.value = null
  try {
    const {
      data: { user: usuario },
    } = await cliente.auth.getUser()
    if (!usuario) {
      await navigateTo('/mi-copropiedad/login')
      return
    }

    if (actorExterno.vinculos.length === 0) {
      await actorExterno.cargarVinculos()
    }
    if (actorExterno.vinculos.length === 0) {
      error.value = 'No encontramos ningún rol vigente asociado a tu cuenta.'
      return
    }
    if (!actorExterno.vinculoActivo) {
      await navigateTo('/mi-copropiedad/vinculos')
      return
    }

    contactos.value = await listarContactosEmergencia(actorExterno.vinculoActivo.vinculo_id)
  } catch (err) {
    error.value = mensajeError(err, 'No se pudieron cargar los contactos.')
  } finally {
    cargando.value = false
  }
}

onMounted(cargar)

async function crear(): Promise<void> {
  if (!actorExterno.vinculoActivo || !nombre.value.trim() || !telefono.value.trim()) return
  creando.value = true
  errorCrear.value = null
  try {
    const nuevo = await crearContactoEmergencia(
      actorExterno.vinculoActivo.vinculo_id,
      nombre.value.trim(),
      telefono.value.trim(),
      parentesco.value.trim() || undefined,
    )
    contactos.value = [...contactos.value, nuevo]
    nombre.value = ''
    telefono.value = ''
    parentesco.value = ''
  } catch (err) {
    errorCrear.value = mensajeError(err, 'No se pudo crear el contacto.')
  } finally {
    creando.value = false
  }
}

async function eliminar(contactoId: string): Promise<void> {
  if (!actorExterno.vinculoActivo) return
  eliminandoId.value = contactoId
  errorEliminar.value = null
  try {
    await eliminarContactoEmergencia(actorExterno.vinculoActivo.vinculo_id, contactoId)
    contactos.value = contactos.value.filter((c) => c.id !== contactoId)
  } catch (err) {
    errorEliminar.value = mensajeError(err, 'No se pudo eliminar el contacto.')
  } finally {
    eliminandoId.value = null
  }
}
</script>

<template>
  <div class="mx-auto max-w-md space-y-4 p-4">
    <h1 class="text-lg font-semibold text-highlighted">Contactos de emergencia</h1>
    <p class="text-xs text-muted">
      Visibles para cualquier residente de tu inmueble — útil para portería en caso de emergencia.
    </p>

    <UAlert v-if="error" color="error" variant="soft" :title="error" />

    <template v-else>
      <p v-if="cargando" class="text-sm text-muted">Cargando…</p>

      <div v-else class="space-y-3">
        <p v-if="errorEliminar" class="text-xs text-red-600 dark:text-red-400">{{ errorEliminar }}</p>
        <p v-if="contactos.length === 0" class="text-sm text-muted">
          Todavía no hay contactos registrados.
        </p>
        <div
          v-for="c in contactos"
          :key="c.id"
          class="flex items-center justify-between gap-3 rounded-xl border border-default bg-elevated p-4"
        >
          <div class="min-w-0">
            <p class="truncate text-sm font-medium text-highlighted">{{ c.nombre }}</p>
            <p class="text-xs text-muted">
              {{ c.telefono }}<template v-if="c.parentesco"> · {{ c.parentesco }}</template>
            </p>
          </div>
          <UButton
            icon="i-lucide-trash-2" color="error" variant="ghost" size="sm"
            :loading="eliminandoId === c.id" :disabled="eliminandoId !== null"
            aria-label="Eliminar contacto"
            @click="eliminar(c.id)"
          />
        </div>
      </div>

      <form class="space-y-3 rounded-xl border border-default bg-elevated p-4" @submit.prevent="crear">
        <p class="text-sm font-medium text-highlighted">Agregar contacto</p>
        <UFormField label="Nombre" required>
          <UInput v-model="nombre" class="w-full" placeholder="Nombre completo" />
        </UFormField>
        <UFormField label="Teléfono" required>
          <UInput v-model="telefono" class="w-full" placeholder="Número de contacto" />
        </UFormField>
        <UFormField label="Parentesco (opcional)">
          <UInput v-model="parentesco" class="w-full" placeholder="Ej. hermano, cónyuge, amigo" />
        </UFormField>
        <p v-if="errorCrear" class="text-xs text-red-600 dark:text-red-400">{{ errorCrear }}</p>
        <UButton
          type="submit" block variant="soft"
          :loading="creando" :disabled="creando || !nombre.trim() || !telefono.trim()"
        >
          {{ creando ? 'Guardando…' : 'Agregar' }}
        </UButton>
      </form>
    </template>
  </div>
</template>
