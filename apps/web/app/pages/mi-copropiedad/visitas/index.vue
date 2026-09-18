<script setup lang="ts">
// EXT-09 §6.1/§7.3 (Ola 2, M13) — "Mis visitas": listado + revocar. Reusa external-visitas-listar/
// -revocar tal cual (EXT-04, ya verificado 100% funcional para actor externo — PLAN_MI_COPROPIEDAD
// .md §10.1). El QR/token y las mejoras de foto+permanente llegan en M14 (U4), no aquí.
import type { Database } from '@aquila/shared'

definePageMeta({ layout: 'mi-copropiedad', publico: true })

const actorExterno = useActorExternoStore()
const cliente = useSupabaseClient<Database>()

const cargando = ref(true)
const error = ref<string | null>(null)
const visitas = ref<VisitaExterna[]>([])
const tiposVisita = ref<Map<number, string>>(new Map())
const revocandoId = ref<string | null>(null)
const errorRevocar = ref<string | null>(null)

const ETIQUETA_ESTADO: Record<VisitaExterna['estado'], string> = {
  vigente: 'Vigente',
  usada: 'Usada',
  vencida: 'Vencida',
  revocada: 'Revocada',
}

// EXT-09 (Ola 2, M14): una autorización permanente no tiene fecha_prevista (CHECK de la
// migración 20260943000000).
function formatoFecha(fecha: string | null): string {
  if (!fecha) return 'Permanente'
  return new Date(`${fecha}T00:00:00`).toLocaleDateString('es-CO', {
    day: '2-digit', month: 'short', year: 'numeric',
  })
}

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

    // Catálogo TIPO_VISITA — solo filas de plataforma (tenant_id null): un tenant que oculte o
    // agregue tipos propios (lista_tipos_ocultos / lista_tipos con tenant_id) no se refleja aquí,
    // porque ambos mecanismos dependen de is_member(tenant_id) y un actor externo nunca lo es
    // (AD-37) — RLS los deja fuera en silencio. Limitación conocida, no un descuido: arreglarla
    // exige una RPC nueva, fuera del alcance "solo UI" de este corte (ver PROMPT_MI_COPROPIEDAD_
    // FASE2.md §9).
    const [visitasResultado, { data: tipos }] = await Promise.all([
      listarVisitasExternas(actorExterno.vinculoActivo.vinculo_id),
      cliente.from('lista_tipos').select('id, nombre').eq('tipo', 'TIPO_VISITA').is('tenant_id', null),
    ])
    visitas.value = visitasResultado
    tiposVisita.value = new Map((tipos ?? []).map((t) => [t.id, t.nombre]))
  } catch (err) {
    error.value = mensajeError(err, 'No se pudieron cargar tus visitas.')
  } finally {
    cargando.value = false
  }
}

onMounted(cargar)

async function revocar(autorizacionId: string): Promise<void> {
  if (!actorExterno.vinculoActivo) return
  revocandoId.value = autorizacionId
  errorRevocar.value = null
  try {
    const actualizada = await revocarVisitaExterna(actorExterno.vinculoActivo.vinculo_id, autorizacionId)
    const i = visitas.value.findIndex((v) => v.id === autorizacionId)
    if (i !== -1) visitas.value[i] = actualizada
  } catch (err) {
    errorRevocar.value = mensajeError(err, 'No se pudo revocar la autorización.')
  } finally {
    revocandoId.value = null
  }
}
</script>

<template>
  <div class="mx-auto max-w-md space-y-4 p-4">
    <div class="flex items-center justify-between gap-3">
      <h1 class="text-lg font-semibold text-gray-900 dark:text-white">Mis visitas</h1>
      <UButton to="/mi-copropiedad/visitas/nueva" icon="i-lucide-plus" size="sm">Nueva</UButton>
    </div>

    <UAlert v-if="error" color="error" variant="soft" :title="error" />

    <p v-else-if="cargando" class="text-sm text-gray-500 dark:text-gray-400">Cargando…</p>

    <p v-else-if="visitas.length === 0" class="text-sm text-gray-500 dark:text-gray-400">
      No has autorizado ninguna visita todavía.
    </p>

    <div v-else class="space-y-3">
      <p v-if="errorRevocar" class="text-xs text-red-600 dark:text-red-400">{{ errorRevocar }}</p>
      <div
        v-for="v in visitas"
        :key="v.id"
        class="rounded-xl border border-default bg-elevated p-4"
      >
        <div class="flex items-start justify-between gap-3">
          <div class="min-w-0">
            <p class="truncate text-sm font-medium text-gray-900 dark:text-white">{{ v.visitante_nombre }}</p>
            <p class="text-xs text-gray-500 dark:text-gray-400">
              {{ formatoFecha(v.fecha_prevista) }}
              <template v-if="v.tipo_id && tiposVisita.has(v.tipo_id)"> · {{ tiposVisita.get(v.tipo_id) }}</template>
            </p>
          </div>
          <span
            class="shrink-0 rounded-full px-2 py-0.5 text-xs font-medium"
            :class="{
              'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-400': v.estado === 'vigente',
              'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-300': v.estado === 'usada',
              'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-400': v.estado === 'vencida',
              'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-400': v.estado === 'revocada',
            }"
          >{{ ETIQUETA_ESTADO[v.estado] }}</span>
        </div>

        <p v-if="v.ingreso_at" class="mt-2 text-xs text-gray-500 dark:text-gray-400">
          Ingresó {{ new Date(v.ingreso_at).toLocaleString('es-CO') }}
          <template v-if="v.egreso_at"> · Salió {{ new Date(v.egreso_at).toLocaleString('es-CO') }}</template>
        </p>

        <UButton
          v-if="v.estado === 'vigente'"
          class="mt-3" color="error" variant="soft" size="sm" block
          :loading="revocandoId === v.id" :disabled="revocandoId !== null"
          @click="revocar(v.id)"
        >
          {{ revocandoId === v.id ? 'Revocando…' : 'Revocar' }}
        </UButton>
      </div>
    </div>
  </div>
</template>
