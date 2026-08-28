<script setup lang="ts">
// Pantalla de resultado tras volver del checkout de Wompi (§8.2) — pública,
// sin sesión (AD-26): el propio uuid de la intención es el capability token
// (ver cabecera de ver-intencion-pago/index.ts). Wompi redirige aquí con
// ?intencion=<uuid> tras el checkout — la confirmación real llega por el
// webhook, no por este redirect, así que el estado puede seguir "pendiente"
// varios segundos (o minutos, si es PSE) después de volver: se sondea en
// vez de asumir éxito por haber vuelto.
definePageMeta({ layout: 'blank', publico: true })

const route = useRoute()
const intencionId = computed(() => {
  const valor = route.query.intencion
  return typeof valor === 'string' ? valor : null
})

type EstadoIntencion = 'creada' | 'pendiente' | 'aprobada' | 'rechazada' | 'expirada'
interface RespuestaIntencion {
  estado: EstadoIntencion
  monto: number
  referencia: string
}

const cliente = useSupabaseClient()
const estado = ref<EstadoIntencion | 'error' | null>(null)
const monto = ref<number | null>(null)
const cargando = ref(true)
let temporizador: ReturnType<typeof setTimeout> | undefined

const ESTADOS_TERMINALES: readonly EstadoIntencion[] = ['aprobada', 'rechazada', 'expirada']
// El webhook llega en segundos para tarjeta/Nequi, minutos para PSE — se
// sondea hasta 3 minutos antes de dejar de intentar y solo sugerir refrescar.
const LIMITE_INTENTOS = 36
const INTERVALO_MS = 5000
let intentos = 0

async function consultar(): Promise<void> {
  if (!intencionId.value) {
    estado.value = 'error'
    cargando.value = false
    return
  }
  const { data, error } = await cliente.functions.invoke<RespuestaIntencion>('ver-intencion-pago', {
    body: { intencion_id: intencionId.value },
  })
  cargando.value = false
  if (error || !data) {
    estado.value = 'error'
    return
  }
  estado.value = data.estado
  monto.value = data.monto

  intentos += 1
  if (!ESTADOS_TERMINALES.includes(data.estado) && intentos < LIMITE_INTENTOS) {
    temporizador = setTimeout(consultar, INTERVALO_MS)
  }
}

onMounted(consultar)
onBeforeUnmount(() => clearTimeout(temporizador))

const TITULOS: Record<EstadoIntencion | 'error', string> = {
  creada: 'Estamos confirmando tu pago…',
  pendiente: 'Tu pago está en proceso',
  aprobada: '¡Pago confirmado!',
  rechazada: 'El pago no se pudo confirmar',
  expirada: 'Este enlace de pago venció',
  error: 'No pudimos consultar el estado del pago',
}
const MENSAJES: Record<EstadoIntencion | 'error', string> = {
  creada: 'Un momento mientras confirmamos tu transacción con la pasarela.',
  pendiente: 'Te avisaremos por correo o SMS en cuanto se confirme — algunos medios como PSE pueden tardar unos minutos.',
  aprobada: 'Ya quedó aplicado a tu cuenta. Puedes cerrar esta ventana.',
  rechazada: 'La pasarela no aprobó la transacción. Puedes intentarlo de nuevo desde tu estado de cuenta.',
  expirada: 'El enlace de pago venció sin confirmarse. Genera uno nuevo desde tu estado de cuenta.',
  error: 'Verifica tu conexión e intenta recargar esta página.',
}
</script>

<template>
  <div class="pago-resultado">
    <div class="tarjeta">
      <template v-if="cargando && !estado">
        <p class="titulo">Consultando…</p>
      </template>
      <template v-else>
        <div class="icono" :class="estado ?? 'error'" aria-hidden="true">
          <span v-if="estado === 'aprobada'">✓</span>
          <span v-else-if="estado === 'rechazada' || estado === 'expirada' || estado === 'error'">✕</span>
          <span v-else class="girando">↻</span>
        </div>
        <p class="titulo">{{ TITULOS[estado ?? 'error'] }}</p>
        <p class="mensaje">{{ MENSAJES[estado ?? 'error'] }}</p>
        <p v-if="monto !== null" class="monto">{{ formatoMoneda(monto) }}</p>
      </template>
    </div>
  </div>
</template>

<style scoped>
.pago-resultado {
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--color-neutral-100);
  font-family: var(--font-sans);
  padding: 24px;
}
.tarjeta {
  max-width: 420px;
  width: 100%;
  background: var(--color-neutral-50);
  border-radius: var(--radius-xl);
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.05);
  padding: 40px 32px;
  text-align: center;
}
.icono {
  width: 56px;
  height: 56px;
  margin: 0 auto 18px;
  border-radius: 50%;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: 26px;
  font-weight: 700;
}
.icono.aprobada {
  background: var(--ui-color-success-100, var(--color-brand-100));
  color: var(--ui-color-success-700, var(--color-brand-700));
}
.icono.rechazada,
.icono.expirada,
.icono.error {
  background: var(--ui-color-error-100);
  color: var(--ui-color-error-700);
}
.icono.creada,
.icono.pendiente {
  background: var(--color-brand-100);
  color: var(--color-brand-700);
}
.girando {
  display: inline-block;
  animation: girar 1.4s linear infinite;
}
@keyframes girar {
  to {
    transform: rotate(360deg);
  }
}
.titulo {
  font-family: var(--font-display);
  font-size: 19px;
  font-weight: 600;
  color: var(--color-neutral-900);
  margin: 0 0 8px;
}
.mensaje {
  font-size: 13.5px;
  color: var(--color-neutral-500);
  line-height: 1.5;
  margin: 0;
}
.monto {
  margin: 18px 0 0;
  font-family: var(--font-display);
  font-size: 26px;
  font-weight: 600;
  color: var(--color-brand-800);
  font-variant-numeric: tabular-nums;
}
</style>
