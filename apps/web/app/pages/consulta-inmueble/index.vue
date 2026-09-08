<script setup lang="ts">
// GOB-8 §4.4 — paquete de consulta sin sesión por inmueble (AD-26, Opción 1): estado de cuenta,
// paz y salvo, actas publicadas y estado de las solicitudes. Sin cuenta ni portal — el enlace con
// `id` (fila de control) + `t` (HMAC) es la única puerta; `ver-inmueble` (Edge Function) hace
// todas las validaciones del lado del servidor, esta página solo pinta lo que devuelve.
//
// "Documentos publicados" genéricos quedan fuera del paquete (Plan del corte, confirmado con el
// usuario): `documentos` no tiene hoy ninguna marca de visibilidad pública. Actas/paz y salvo se
// muestran inline sin un visor de PDF dedicado — GOB-0/GOB-4 tampoco construyeron un visor público
// genérico de `documento_id` en el frontend; extenderlo aquí sería deuda ajena, no de este corte
// (ver GOB_08_INFORME.md). El estado de cuenta sí reutiliza el visor ya existente
// (`/comprobante-cuenta`) porque ese viaje ya está completo desde GOB-0/D-28.
definePageMeta({ layout: 'blank', publico: true })

interface RespuestaInmueble {
  estado_cuenta: { folio: string | null; generado_en: string; id: string; t: string } | null
  paz_y_salvo: { consecutivo: number; fecha_expedicion: string; monto_total: number; certificacion_hash: string } | null
  actas_publicadas: { numero: number; anio: number; documento_id?: string; t?: string }[]
  solicitudes: { id: string; numero: number; anio: number; estado: string; asunto: string }[]
}

const route = useRoute()
const id = computed(() => (typeof route.query.id === 'string' ? route.query.id : ''))
const token = computed(() => (typeof route.query.t === 'string' ? route.query.t : ''))
const cliente = useSupabaseClient()

const {
  data: paquete, error: errorCarga, pending,
} = await useAsyncData(`consulta-inmueble-${id.value}`, async () => {
  if (!id.value || !token.value) return null
  const { data, error: errorFuncion } = await cliente.functions.invoke<RespuestaInmueble>('ver-inmueble', {
    body: { id: id.value, t: token.value },
  })
  if (errorFuncion) {
    const err = await extraerErrorFuncion(errorFuncion)
    throw createError({ message: err.message, fatal: false })
  }
  if (!data) throw createError({ message: 'No se encontró información para este enlace.', fatal: false })
  return data
})

const ESTADO_ETIQUETA: Record<string, string> = {
  nueva: 'Nueva', asignada: 'Asignada', en_atencion: 'En atención', en_espera: 'En espera',
  resuelta: 'Resuelta', cerrada: 'Cerrada', anulada: 'Anulada',
}
const ESTADOS_ENCUESTABLES = ['resuelta', 'cerrada']

const calificaciones = ref<Record<string, number>>({})
const comentarios = ref<Record<string, string>>({})
const encuestaEstado = ref<Record<string, 'enviando' | 'enviada' | 'ya_respondida' | 'error'>>({})

async function enviarEncuesta(solicitudId: string): Promise<void> {
  const calificacion = calificaciones.value[solicitudId]
  if (!calificacion) return
  encuestaEstado.value[solicitudId] = 'enviando'
  try {
    const { error: errorFuncion, response } = await cliente.functions.invoke('responder-encuesta-solicitud', {
      body: {
        id: id.value, t: token.value, solicitud_id: solicitudId, calificacion,
        ...(comentarios.value[solicitudId] ? { comentario: comentarios.value[solicitudId] } : {}),
      },
    })
    if (errorFuncion) {
      encuestaEstado.value[solicitudId] = response?.status === 409 ? 'ya_respondida' : 'error'
      return
    }
    encuestaEstado.value[solicitudId] = 'enviada'
  } catch {
    encuestaEstado.value[solicitudId] = 'error'
  }
}

function formatoFecha(iso: string): string {
  const d = new Date(iso)
  return `${String(d.getUTCDate()).padStart(2, '0')}/${String(d.getUTCMonth() + 1).padStart(2, '0')}/${d.getUTCFullYear()}`
}
</script>

<template>
  <div class="pagina">
    <main class="hoja">
      <template v-if="!id || !token">
        <p class="mensaje">Este enlace no es válido — pide uno nuevo a la administración.</p>
      </template>
      <template v-else-if="pending">
        <p class="mensaje">Cargando…</p>
      </template>
      <template v-else-if="errorCarga || !paquete">
        <p class="mensaje">{{ mensajeError(errorCarga, 'No se pudo cargar la información de este inmueble.') }}</p>
      </template>
      <template v-else>
        <h1 class="titulo">Consulta de tu inmueble</h1>

        <section class="bloque">
          <h2>Estado de cuenta</h2>
          <p v-if="paquete.estado_cuenta">
            Folio {{ paquete.estado_cuenta.folio ?? '—' }} · generado el {{ formatoFecha(paquete.estado_cuenta.generado_en) }}
            — <NuxtLink :to="`/comprobante-cuenta/${paquete.estado_cuenta.id}?t=${paquete.estado_cuenta.t}`" target="_blank">ver comprobante</NuxtLink>
          </p>
          <p v-else class="vacio">Sin estado de cuenta generado todavía.</p>
        </section>

        <section class="bloque">
          <h2>Paz y salvo</h2>
          <p v-if="paquete.paz_y_salvo">
            No. {{ paquete.paz_y_salvo.consecutivo }} · expedido el {{ formatoFecha(paquete.paz_y_salvo.fecha_expedicion) }}
            · monto {{ formatoMoneda(paquete.paz_y_salvo.monto_total) }}
          </p>
          <p v-else class="vacio">Sin certificación de paz y salvo vigente.</p>
        </section>

        <section class="bloque">
          <h2>Actas publicadas</h2>
          <ul v-if="paquete.actas_publicadas.length > 0" class="lista">
            <li v-for="a in paquete.actas_publicadas" :key="`${a.anio}-${a.numero}`">Acta {{ a.numero }}/{{ a.anio }}</li>
          </ul>
          <p v-else class="vacio">Sin actas publicadas todavía.</p>
        </section>

        <section class="bloque">
          <h2>Tus solicitudes</h2>
          <ul v-if="paquete.solicitudes.length > 0" class="lista solicitudes">
            <li v-for="s in paquete.solicitudes" :key="s.id">
              <div class="solicitud-fila">
                <span>{{ s.numero }}/{{ s.anio }} · {{ s.asunto }}</span>
                <span class="estado-tag">{{ ESTADO_ETIQUETA[s.estado] ?? s.estado }}</span>
              </div>
              <div v-if="ESTADOS_ENCUESTABLES.includes(s.estado) && encuestaEstado[s.id] !== 'enviada'" class="encuesta">
                <template v-if="encuestaEstado[s.id] === 'ya_respondida'">
                  <p class="encuesta-nota">Ya respondiste la encuesta de esta solicitud — gracias.</p>
                </template>
                <template v-else>
                  <p class="encuesta-nota">¿Cómo calificarías la atención recibida?</p>
                  <div class="encuesta-estrellas">
                    <button
                      v-for="n in [1, 2, 3, 4, 5]" :key="n" type="button"
                      :class="{ activa: (calificaciones[s.id] ?? 0) >= n }"
                      @click="calificaciones[s.id] = n"
                    >★</button>
                  </div>
                  <input
                    v-model="comentarios[s.id]" type="text" placeholder="Comentario opcional"
                    class="encuesta-comentario"
                  >
                  <button
                    type="button" class="encuesta-boton"
                    :disabled="!calificaciones[s.id] || encuestaEstado[s.id] === 'enviando'"
                    @click="enviarEncuesta(s.id)"
                  >
                    {{ encuestaEstado[s.id] === 'enviando' ? 'Enviando…' : 'Enviar' }}
                  </button>
                  <p v-if="encuestaEstado[s.id] === 'error'" class="encuesta-error">No se pudo enviar. Intenta de nuevo.</p>
                </template>
              </div>
              <p v-else-if="encuestaEstado[s.id] === 'enviada'" class="encuesta-nota">¡Gracias por tu respuesta!</p>
            </li>
          </ul>
          <p v-else class="vacio">Sin solicitudes registradas para este inmueble.</p>
        </section>
      </template>
    </main>
  </div>
</template>

<style scoped>
.pagina {
  font-family: var(--font-sans);
  color: var(--color-neutral-900);
  background: var(--color-neutral-100);
  min-height: 100vh;
  padding: 40px 16px 72px;
}
.hoja {
  max-width: 640px;
  margin: 0 auto;
  background: var(--color-neutral-50);
  border-radius: var(--radius-xl);
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.05);
  padding: 32px 34px;
}
.mensaje { color: var(--color-neutral-500); font-size: 14px; }
.titulo { font-family: var(--font-display); font-size: 22px; font-weight: 600; margin: 0 0 20px; color: var(--color-brand-900); }
.bloque { margin-bottom: 22px; }
.bloque h2 {
  font-size: 11px; font-weight: 700; letter-spacing: 0.1em; text-transform: uppercase;
  color: var(--color-brand-700); margin: 0 0 8px;
}
.bloque p { font-size: 13px; margin: 0; }
.vacio { color: var(--color-neutral-500); }
.lista { list-style: none; margin: 0; padding: 0; font-size: 13px; }
.lista li { padding: 8px 0; border-bottom: 1px solid var(--color-neutral-200); }
.lista li:last-child { border-bottom: none; }
.solicitud-fila { display: flex; justify-content: space-between; gap: 10px; }
.estado-tag {
  font-size: 11px; color: var(--color-brand-800); background: var(--color-brand-100);
  padding: 2px 8px; border-radius: var(--radius-xs); white-space: nowrap;
}
.encuesta { margin-top: 8px; padding: 10px; background: var(--color-neutral-100); border-radius: var(--radius-md); }
.encuesta-nota { font-size: 12px; color: var(--color-neutral-600); margin: 0 0 6px; }
.encuesta-estrellas { display: flex; gap: 4px; margin-bottom: 8px; }
.encuesta-estrellas button {
  font-size: 20px; line-height: 1; background: none; border: none; cursor: pointer;
  color: var(--color-neutral-300);
}
.encuesta-estrellas button.activa { color: var(--color-brand-600); }
.encuesta-comentario {
  width: 100%; font: inherit; font-size: 13px; padding: 6px 8px; margin-bottom: 8px;
  border: 1px solid var(--color-neutral-200); border-radius: var(--radius-sm);
}
.encuesta-boton {
  font: inherit; font-size: 12px; font-weight: 600; color: var(--color-neutral-50);
  background: var(--color-brand-700); border: none; padding: 7px 14px; border-radius: var(--radius-sm);
  cursor: pointer;
}
.encuesta-boton:disabled { opacity: 0.5; cursor: not-allowed; }
.encuesta-error { font-size: 11px; color: var(--ui-color-error-600); margin: 6px 0 0; }
</style>
