<script setup lang="ts">
// EXT-09 §6.1/§7.3/§8.2 (Ola 2, M13) — autorizar una visita nueva. Reusa external-visitas-crear
// tal cual (EXT-04). El QR se dibuja en el cliente con la librería `qrcode` ya usada en el
// proyecto (mantenimiento/activos/[id].vue) sobre el mismo qr_token que ya resuelve
// autorizacion-visita-validar — no se inventa un destino nuevo, solo se codifica el mismo valor
// como imagen escaneable en vez de mostrarlo como texto plano.
import type { Database } from '@aquila/shared'
import QRCode from 'qrcode'

definePageMeta({ layout: 'mi-copropiedad', publico: true })

const actorExterno = useActorExternoStore()
const cliente = useSupabaseClient<Database>()

const cargando = ref(true)
const error = ref<string | null>(null)
const tipos = ref<{ id: number; nombre: string }[]>([])

const visitanteNombre = ref('')
const visitanteDocumento = ref('')
const tipoId = ref<number | null>(null)
const permanente = ref(false)
const fechaPrevista = ref('')
const horaDesde = ref('')
const horaHasta = ref('')
const foto = ref<File | null>(null)

const enviando = ref(false)
const errorEnvio = ref<string | null>(null)
const visitaCreada = ref<VisitaExterna | null>(null)
const qrImagenUrl = ref<string | null>(null)

onMounted(async () => {
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

    // Mismo criterio de "solo plataforma" que visitas/index.vue — ver el comentario ahí.
    const { data } = await cliente
      .from('lista_tipos')
      .select('id, nombre')
      .eq('tipo', 'TIPO_VISITA')
      .is('tenant_id', null)
      .order('orden')
    tipos.value = data ?? []
  } catch (err) {
    error.value = mensajeError(err, 'No se pudo cargar el formulario.')
  } finally {
    cargando.value = false
  }
})

function onFotoSeleccionada(evento: Event): void {
  const input = evento.target as HTMLInputElement
  foto.value = input.files?.[0] ?? null
}

async function enviar(): Promise<void> {
  if (!actorExterno.vinculoActivo || !visitanteNombre.value.trim()) return
  if (!permanente.value && !fechaPrevista.value) return
  enviando.value = true
  errorEnvio.value = null
  try {
    const creada = await crearVisitaExterna({
      vinculoId: actorExterno.vinculoActivo.vinculo_id,
      visitanteNombre: visitanteNombre.value.trim(),
      ...(visitanteDocumento.value.trim() ? { visitanteDocumento: visitanteDocumento.value.trim() } : {}),
      ...(tipoId.value !== null ? { tipoId: tipoId.value } : {}),
      ...(permanente.value
        ? { permanente: true }
        : {
            fechaPrevista: fechaPrevista.value,
            ...(horaDesde.value ? { horaDesde: horaDesde.value } : {}),
            ...(horaHasta.value ? { horaHasta: horaHasta.value } : {}),
          }),
      ...(foto.value ? { foto: foto.value } : {}),
    })
    visitaCreada.value = creada
    if (creada.qr_token) {
      qrImagenUrl.value = await QRCode.toDataURL(creada.qr_token, { width: 220, margin: 1 })
    }
  } catch (err) {
    errorEnvio.value = mensajeError(err, 'No se pudo crear la autorización.')
  } finally {
    enviando.value = false
  }
}
</script>

<template>
  <div class="mx-auto max-w-md space-y-4 p-4">
    <NuxtLink to="/mi-copropiedad/visitas" class="text-sm text-primary-600 dark:text-primary-400">
      ← Mis visitas
    </NuxtLink>

    <UAlert v-if="error" color="error" variant="soft" :title="error" />

    <p v-else-if="cargando" class="text-sm text-gray-500 dark:text-gray-400">Cargando…</p>

    <template v-else-if="visitaCreada">
      <div class="rounded-xl border border-default bg-elevated p-4 text-center">
        <p class="text-sm font-medium text-gray-900 dark:text-white">
          Autorización creada para {{ visitaCreada.visitante_nombre }}
        </p>
        <img v-if="qrImagenUrl" :src="qrImagenUrl" alt="Código QR de la visita" class="mx-auto mt-4 rounded-lg">
        <p v-if="visitaCreada.qr_expira_at" class="mt-3 text-xs text-gray-500 dark:text-gray-400">
          Válido hasta {{ new Date(visitaCreada.qr_expira_at).toLocaleString('es-CO') }}
        </p>
        <p class="mt-2 text-xs text-gray-500 dark:text-gray-400">
          Muestra este código en la portería para que tu visitante ingrese.
        </p>
      </div>
      <UButton to="/mi-copropiedad/visitas" block>Ver mis visitas</UButton>
    </template>

    <form v-else class="space-y-4" @submit.prevent="enviar">
      <UFormField label="Nombre del visitante" required>
        <UInput v-model="visitanteNombre" class="w-full" placeholder="Nombre completo" />
      </UFormField>

      <UFormField label="Documento (opcional)">
        <UInput v-model="visitanteDocumento" class="w-full" placeholder="Número de identificación" />
      </UFormField>

      <UFormField v-if="tipos.length > 0" label="Tipo de visita (opcional)">
        <div class="flex flex-wrap gap-2">
          <button
            v-for="t in tipos" :key="t.id" type="button"
            class="rounded-full border px-3 py-1 text-xs font-medium"
            :class="
              tipoId === t.id
                ? 'border-primary-600 bg-primary-100 text-primary-800 dark:bg-primary-900/40 dark:text-primary-300'
                : 'border-default text-gray-600 dark:text-gray-300'
            "
            @click="tipoId = tipoId === t.id ? null : t.id"
          >{{ t.nombre }}</button>
        </div>
      </UFormField>

      <UFormField label="Autorización permanente (sin fecha de vencimiento)">
        <USwitch v-model="permanente" />
        <p class="mt-1 text-xs text-gray-500 dark:text-gray-400">
          Para personal fijo (empleada doméstica, cuidador). El QR sigue expirando por seguridad
          (a 1 año), pero no atas la visita a una fecha puntual.
        </p>
      </UFormField>

      <template v-if="!permanente">
        <UFormField label="Fecha prevista" required>
          <UInput v-model="fechaPrevista" type="date" class="w-full" />
        </UFormField>

        <div class="grid grid-cols-2 gap-3">
          <UFormField label="Desde (opcional)">
            <UInput v-model="horaDesde" type="time" class="w-full" />
          </UFormField>
          <UFormField label="Hasta (opcional)">
            <UInput v-model="horaHasta" type="time" class="w-full" />
          </UFormField>
        </div>
      </template>

      <UFormField label="Foto del visitante (opcional)">
        <input
          type="file" accept="image/jpeg,image/png" capture="environment"
          class="block w-full text-sm text-gray-600 dark:text-gray-300"
          @change="onFotoSeleccionada"
        >
      </UFormField>

      <p v-if="errorEnvio" class="text-xs text-red-600 dark:text-red-400">{{ errorEnvio }}</p>

      <UButton
        type="submit" block
        :loading="enviando"
        :disabled="enviando || !visitanteNombre.trim() || (!permanente && !fechaPrevista)"
      >
        {{ enviando ? 'Creando…' : 'Autorizar visita' }}
      </UButton>
    </form>
  </div>
</template>
