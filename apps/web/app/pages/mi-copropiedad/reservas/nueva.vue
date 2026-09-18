<script setup lang="ts">
// EXT-10 §6.1/§7.5/§8.3 (Ola 2, M15) — reservar una zona común. Reusa external-reservas-
// disponibilidad (catálogo + franjas ocupadas) y external-reservas-crear tal cual (EXT-03). El
// monto (si la regla `genera_cargo`) lo calcula siempre el servidor — aquí solo se muestra.
import type { Database } from '@aquila/shared'

definePageMeta({ layout: 'mi-copropiedad', publico: true })

const actorExterno = useActorExternoStore()
const cliente = useSupabaseClient<Database>()

const cargando = ref(true)
const error = ref<string | null>(null)
const zonas = ref<ZonaReservable[]>([])

const zonaId = ref<string | null>(null)
const fecha = ref('')
const horaInicio = ref('')
const horaFin = ref('')

const consultandoDisponibilidad = ref(false)
const disponibilidad = ref<DisponibilidadZona | null>(null)
const errorDisponibilidad = ref<string | null>(null)

const enviando = ref(false)
const errorEnvio = ref<string | null>(null)
const reservaCreada = ref<ReservaExterna | null>(null)

function formatoHora(hora: string): string {
  return hora.slice(0, 5)
}

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

    zonas.value = await listarZonasReservables(actorExterno.vinculoActivo.vinculo_id)
  } catch (err) {
    error.value = mensajeError(err, 'No se pudo cargar el formulario.')
  } finally {
    cargando.value = false
  }
})

// Se re-consulta cada vez que cambian zona o fecha — la disponibilidad de OTRA combinación ya no
// aplica, así que se limpia primero para no mostrar franjas de la consulta anterior mientras
// llega la nueva.
watch([zonaId, fecha], async ([nuevaZona, nuevaFecha]) => {
  disponibilidad.value = null
  errorDisponibilidad.value = null
  if (!nuevaZona || !nuevaFecha || !actorExterno.vinculoActivo) return
  consultandoDisponibilidad.value = true
  try {
    disponibilidad.value = await consultarDisponibilidadZona(
      actorExterno.vinculoActivo.vinculo_id, nuevaZona, nuevaFecha,
    )
  } catch (err) {
    errorDisponibilidad.value = mensajeError(err, 'No se pudo consultar la disponibilidad.')
  } finally {
    consultandoDisponibilidad.value = false
  }
})

async function enviar(): Promise<void> {
  if (!actorExterno.vinculoActivo || !zonaId.value || !fecha.value || !horaInicio.value || !horaFin.value) return
  enviando.value = true
  errorEnvio.value = null
  try {
    reservaCreada.value = await crearReservaExterna(
      actorExterno.vinculoActivo.vinculo_id, zonaId.value, fecha.value, horaInicio.value, horaFin.value,
    )
  } catch (err) {
    errorEnvio.value = mensajeError(err, 'No se pudo crear la reserva.')
  } finally {
    enviando.value = false
  }
}
</script>

<template>
  <div class="mx-auto max-w-md space-y-4 p-4">
    <NuxtLink to="/mi-copropiedad/reservas" class="text-sm text-primary-600 dark:text-primary-400">
      ← Mis reservas
    </NuxtLink>

    <UAlert v-if="error" color="error" variant="soft" :title="error" />

    <p v-else-if="cargando" class="text-sm text-gray-500 dark:text-gray-400">Cargando…</p>

    <template v-else-if="reservaCreada">
      <div class="rounded-xl border border-default bg-elevated p-4 text-center">
        <p class="text-sm font-medium text-gray-900 dark:text-white">
          {{ reservaCreada.estado === 'aprobada' ? 'Reserva confirmada' : 'Reserva enviada' }}
        </p>
        <p class="mt-1 text-xs text-gray-500 dark:text-gray-400">
          {{ reservaCreada.estado === 'aprobada'
            ? 'Ya quedó confirmada.'
            : 'Queda pendiente de aprobación por la administración.' }}
        </p>
      </div>
      <UButton to="/mi-copropiedad/reservas" block>Ver mis reservas</UButton>
    </template>

    <p v-else-if="zonas.length === 0" class="text-sm text-gray-500 dark:text-gray-400">
      Esta copropiedad todavía no tiene zonas comunes habilitadas para reserva.
    </p>

    <form v-else class="space-y-4" @submit.prevent="enviar">
      <UFormField label="Zona común" required>
        <div class="flex flex-wrap gap-2">
          <button
            v-for="z in zonas" :key="z.id" type="button"
            class="rounded-full border px-3 py-1 text-xs font-medium"
            :class="
              zonaId === z.id
                ? 'border-primary-600 bg-primary-100 text-primary-800 dark:bg-primary-900/40 dark:text-primary-300'
                : 'border-default text-gray-600 dark:text-gray-300'
            "
            @click="zonaId = z.id"
          >{{ z.nombre }}</button>
        </div>
      </UFormField>

      <UFormField label="Fecha" required>
        <UInput v-model="fecha" type="date" class="w-full" />
      </UFormField>

      <template v-if="zonaId && fecha">
        <p v-if="consultandoDisponibilidad" class="text-xs text-gray-500 dark:text-gray-400">Consultando disponibilidad…</p>
        <UAlert v-else-if="errorDisponibilidad" color="error" variant="soft" :title="errorDisponibilidad" />
        <template v-else-if="disponibilidad">
          <p v-if="disponibilidad.ocupadas.length > 0" class="text-xs text-gray-500 dark:text-gray-400">
            Ya ocupado:
            <span v-for="(o, i) in disponibilidad.ocupadas" :key="i">
              {{ formatoHora(o.hora_inicio) }}–{{ formatoHora(o.hora_fin) }}<template v-if="i < disponibilidad.ocupadas.length - 1">, </template>
            </span>
          </p>
          <p v-if="disponibilidad.regla?.genera_cargo && disponibilidad.regla.monto" class="text-xs text-gray-500 dark:text-gray-400">
            Costo: {{ formatoMoneda(disponibilidad.regla.monto) }}
          </p>
          <p v-if="disponibilidad.regla?.requiere_aprobacion" class="text-xs text-gray-500 dark:text-gray-400">
            Esta reserva queda pendiente de aprobación por la administración.
          </p>

          <template v-if="disponibilidad.franjas_validas !== undefined">
            <UAlert
              v-if="disponibilidad.franjas_validas.length === 0"
              color="warning" variant="soft"
              title="Esta zona no tiene horario habilitado para el día elegido."
            />
            <p v-else class="text-xs text-gray-500 dark:text-gray-400">
              Horario permitido:
              <span v-for="(f, i) in disponibilidad.franjas_validas" :key="i">
                {{ formatoHora(f.hora_desde) }}–{{ formatoHora(f.hora_hasta) }}<template v-if="i < disponibilidad.franjas_validas.length - 1">, </template>
              </span>
            </p>
          </template>

          <div class="grid grid-cols-2 gap-3">
            <UFormField label="Desde" required>
              <UInput v-model="horaInicio" type="time" class="w-full" />
            </UFormField>
            <UFormField label="Hasta" required>
              <UInput v-model="horaFin" type="time" class="w-full" />
            </UFormField>
          </div>
        </template>
      </template>

      <p v-if="errorEnvio" class="text-xs text-red-600 dark:text-red-400">{{ errorEnvio }}</p>

      <UButton
        type="submit" block
        :loading="enviando"
        :disabled="
          enviando || !zonaId || !fecha || !horaInicio || !horaFin
            || disponibilidad?.franjas_validas?.length === 0
        "
      >
        {{ enviando ? 'Reservando…' : 'Reservar' }}
      </UButton>
    </form>
  </div>
</template>
