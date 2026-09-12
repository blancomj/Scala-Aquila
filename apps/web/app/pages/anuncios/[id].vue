<script setup lang="ts">
// EXS-3 · Detalle de un anuncio: lectura, ciclo de vida y despacho.
//
// Las acciones que se muestran salen del estado actual, no del rol: si el
// guard va a rechazar la transición, el botón no debería estar ahí. Pero la
// autorización real sigue siendo del guard — ocultar un botón no autoriza
// nada (EXS-1 §4), y por eso los errores que devuelve la base se muestran
// tal cual en vez de traducirlos a un "no permitido" genérico.
definePageMeta({ layout: 'default', middleware: ['tenant', 'rbac'], permiso: 'data:read' })

const route = useRoute()
const anunciosStore = useAnunciosStore()

const anuncioId = computed(() => route.params.id as string)
const a = computed(() => anunciosStore.detalle)

const ocupado = ref(false)
const avisoDespacho = ref<string | null>(null)

async function cargar(): Promise<void> {
  await anunciosStore.cargarDetalle(anuncioId.value)
  // Abrir el anuncio registra la lectura, pero NO la confirmación: son actos
  // distintos a propósito (prompt 02 §20).
  if (a.value?.estado === 'publicado' && !a.value.leido) {
    await anunciosStore.marcarLeido(anuncioId.value)
  }
}
onMounted(cargar)

async function transicionar(estado: string, extra?: { publicarAt?: string; motivoRechazo?: string }): Promise<void> {
  ocupado.value = true
  try {
    const ok = await anunciosStore.transicionar(anuncioId.value, estado as never, extra)
    if (ok) await anunciosStore.cargarDetalle(anuncioId.value)
  } finally {
    ocupado.value = false
  }
}

const motivoRechazo = ref('')
const mostrarRechazo = ref(false)
async function rechazar(): Promise<void> {
  if (!motivoRechazo.value.trim()) return
  await transicionar('rechazado', { motivoRechazo: motivoRechazo.value.trim() })
  mostrarRechazo.value = false
  motivoRechazo.value = ''
}

const fechaProgramada = ref('')
const mostrarProgramar = ref(false)
async function programar(): Promise<void> {
  if (!fechaProgramada.value) return
  await transicionar('programado', { publicarAt: new Date(fechaProgramada.value).toISOString() })
  mostrarProgramar.value = false
}

async function confirmar(): Promise<void> {
  ocupado.value = true
  try {
    await anunciosStore.confirmarLectura(anuncioId.value)
  } finally {
    ocupado.value = false
  }
}

async function despachar(): Promise<void> {
  ocupado.value = true
  avisoDespacho.value = null
  try {
    const r = await anunciosStore.despachar(anuncioId.value)
    if (r) {
      const partes = [`${String(r.enviados)} enviados`]
      if (r.fallidos > 0) partes.push(`${String(r.fallidos)} fallidos`)
      if (r.sinCorreo > 0) partes.push(`${String(r.sinCorreo)} sin correo registrado`)
      avisoDespacho.value = partes.join(' · ')
    }
  } finally {
    ocupado.value = false
  }
}

const ETIQUETA_ESTADO: Record<string, string> = {
  borrador: 'Borrador',
  pendiente_revision: 'Pendiente de revisión',
  aprobado: 'Aprobado',
  programado: 'Programado',
  publicado: 'Publicado',
  rechazado: 'Rechazado',
  archivado: 'Archivado',
  cancelado: 'Cancelado',
}

const ETIQUETA_CRITERIO: Record<string, string> = {
  agrupacion: 'Agrupación',
  calidad: 'Relación con el inmueble',
  inmueble: 'Inmueble',
  miembro_organo: 'Miembro de órgano',
  cartera_mora: 'Con cartera en mora',
}

function fechaHora(iso: string | null): string {
  return iso ? new Date(iso).toLocaleString('es-CO', { dateStyle: 'medium', timeStyle: 'short' }) : '—'
}
</script>

<template>
  <div v-if="a" class="space-y-6 max-w-3xl">
    <div class="flex items-start justify-between gap-4">
      <div class="min-w-0">
        <NuxtLink to="/anuncios" class="text-xs text-neutral-500 hover:underline">← Anuncios</NuxtLink>
        <h1 class="text-xl font-semibold mt-1">{{ a.titulo }}</h1>
        <p class="text-xs text-neutral-500 mt-1">
          {{ a.categoria }} · {{ ETIQUETA_ESTADO[a.estado] }}
          <span v-if="a.referencia"> · <span class="font-mono">{{ a.referencia }}</span></span>
          <span v-if="a.publicadoAt"> · publicado {{ fechaHora(a.publicadoAt) }}</span>
        </p>
      </div>
    </div>

    <p v-if="anunciosStore.error" class="text-sm text-red-600 dark:text-red-400">
      {{ anunciosStore.error }}
    </p>
    <p v-if="avisoDespacho" class="text-sm text-emerald-700 dark:text-emerald-400">
      Despachado por correo: {{ avisoDespacho }}
    </p>

    <div v-if="a.motivoRechazo" class="rounded-lg border border-red-200 dark:border-red-900 p-3">
      <p class="text-xs font-medium text-red-700 dark:text-red-400">Devuelto por el revisor</p>
      <p class="text-sm mt-1">{{ a.motivoRechazo }}</p>
    </div>

    <article class="rounded-lg border border-neutral-200 dark:border-neutral-800 p-4">
      <p v-if="a.resumen" class="text-sm text-neutral-600 dark:text-neutral-400 mb-3">{{ a.resumen }}</p>
      <p class="text-sm whitespace-pre-wrap leading-relaxed">{{ a.contenido }}</p>
    </article>

    <!-- Confirmación: acción explícita, nunca un efecto de haber abierto -->
    <div
      v-if="a.estado === 'publicado' && a.requiereConfirmacion"
      class="rounded-lg border p-4"
      :class="a.confirmado
        ? 'border-emerald-200 dark:border-emerald-900'
        : 'border-amber-300 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/30'"
    >
      <p v-if="a.confirmado" class="text-sm text-emerald-700 dark:text-emerald-400">
        Confirmaste que conoces esta comunicación.
      </p>
      <template v-else>
        <p class="text-sm">Esta comunicación requiere que confirmes que la conoces.</p>
        <UButton class="mt-2" size="xs" :loading="ocupado" @click="confirmar">Confirmar lectura</UButton>
      </template>
    </div>

    <!-- Adjuntos: van pegados al cuerpo porque son parte de lo comunicado,
         no metadatos del anuncio -->
    <UiGaleriaDocumentos
      :anuncio-id="anuncioId"
      titulo="Adjuntos"
      vacio="Este anuncio no tiene documentos adjuntos."
      :editable="!['publicado', 'archivado', 'cancelado'].includes(a.estado)"
      motivo-bloqueo="Un anuncio publicado ya no admite adjuntos: lleva consecutivo y lo que se comunicó no se reescribe. Si hace falta añadir algo, redacta otro anuncio."
    />

    <!-- Audiencia -->
    <section class="space-y-2">
      <h2 class="text-sm font-medium">Dirigido a</h2>
      <p v-if="anunciosStore.audiencia.length === 0" class="text-sm text-neutral-500">
        Toda la copropiedad.
      </p>
      <ul v-else class="text-sm space-y-1">
        <li v-for="r in anunciosStore.audiencia" :key="r.id" class="text-neutral-600 dark:text-neutral-400">
          {{ ETIQUETA_CRITERIO[r.criterio] ?? r.criterio }}<span v-if="r.valor">: {{ r.valor }}</span>
        </li>
      </ul>
    </section>

    <!-- Métricas: agregadas, nunca nominales -->
    <section v-if="anunciosStore.metricas" class="grid grid-cols-3 gap-3">
      <div class="rounded-lg border border-neutral-200 dark:border-neutral-800 p-3">
        <p class="text-xs text-neutral-500">Destinatarios</p>
        <p class="text-lg font-semibold">{{ anunciosStore.metricas.destinatarios }}</p>
      </div>
      <div class="rounded-lg border border-neutral-200 dark:border-neutral-800 p-3">
        <p class="text-xs text-neutral-500">Leídos</p>
        <p class="text-lg font-semibold">{{ anunciosStore.metricas.leidos }}</p>
      </div>
      <div class="rounded-lg border border-neutral-200 dark:border-neutral-800 p-3">
        <p class="text-xs text-neutral-500">Confirmados</p>
        <p class="text-lg font-semibold">{{ anunciosStore.metricas.confirmados }}</p>
      </div>
    </section>

    <!-- Ciclo de vida -->
    <section class="border-t border-neutral-200 dark:border-neutral-800 pt-4 space-y-3">
      <h2 class="text-sm font-medium">Acciones</h2>

      <div class="flex flex-wrap gap-2">
        <UButton
          v-if="a.estado === 'borrador' || a.estado === 'rechazado'"
          size="xs"
          :loading="ocupado"
          @click="transicionar('pendiente_revision')"
        >
          Enviar a revisión
        </UButton>

        <UButton
          v-if="a.estado === 'pendiente_revision'"
          size="xs"
          :loading="ocupado"
          @click="transicionar('aprobado')"
        >
          Aprobar
        </UButton>
        <UButton
          v-if="a.estado === 'pendiente_revision'"
          size="xs"
          variant="outline"
          @click="mostrarRechazo = !mostrarRechazo"
        >
          Devolver
        </UButton>

        <UButton
          v-if="a.estado === 'aprobado' || a.estado === 'borrador' || a.estado === 'programado'"
          size="xs"
          :loading="ocupado"
          @click="transicionar('publicado')"
        >
          Publicar ahora
        </UButton>
        <UButton
          v-if="a.estado === 'aprobado'"
          size="xs"
          variant="outline"
          @click="mostrarProgramar = !mostrarProgramar"
        >
          Programar
        </UButton>

        <UButton
          v-if="a.estado === 'publicado'"
          size="xs"
          variant="outline"
          :loading="ocupado"
          @click="despachar"
        >
          Enviar por correo
        </UButton>
        <UButton
          v-if="a.estado === 'publicado'"
          size="xs"
          variant="ghost"
          :loading="ocupado"
          @click="transicionar('archivado')"
        >
          Archivar
        </UButton>
      </div>

      <p v-if="a.estado === 'publicado'" class="text-xs text-neutral-500">
        Publicar dejó el anuncio disponible dentro de AQUILA y lo anunció en la campana. Enviarlo
        por correo es un paso aparte, y llega a la audiencia resuelta en el momento del envío.
      </p>
      <p v-if="a.estado === 'programado'" class="text-xs text-neutral-500">
        Se publicará solo el {{ fechaHora(a.publicarAt) }}.
      </p>

      <div v-if="mostrarRechazo" class="space-y-2 max-w-md">
        <UFormField label="Motivo de la devolución" required>
          <UInput v-model="motivoRechazo" class="w-full" />
        </UFormField>
        <UButton size="xs" :disabled="!motivoRechazo.trim()" :loading="ocupado" @click="rechazar">
          Devolver al redactor
        </UButton>
      </div>

      <div v-if="mostrarProgramar" class="space-y-2 max-w-md">
        <UFormField label="Publicar el" required>
          <UInput v-model="fechaProgramada" type="datetime-local" class="w-full" />
        </UFormField>
        <UButton size="xs" :disabled="!fechaProgramada" :loading="ocupado" @click="programar">
          Programar publicación
        </UButton>
      </div>
    </section>
  </div>

  <p v-else-if="anunciosStore.loading" class="text-sm text-neutral-500">Cargando…</p>
  <p v-else class="text-sm text-neutral-500">No se encontró el anuncio.</p>
</template>
