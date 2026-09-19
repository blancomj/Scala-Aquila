<script setup lang="ts">
// Visor público del estado de cuenta — D-27/D-28 (Docs/evaluacion/13).
// Sin sesión por defecto (AD-26): el acceso anónimo exige el token HMAC `t`
// que mintió enviar-estado-cuenta; un miembro autenticado también puede
// abrirlo sin t (ver-estado-cuenta valida su membresía). Por eso
// `publico: true` (auth.global.ts lo exime) y layout 'blank'.
//
// La respuesta es un sobre { datos, folio, contenido_hash }:
//   · datos      — snapshot sellado a la fecha de corte (nunca datos vivos).
//   · folio      — identidad pública del documento (EDC-YYYYMM-NNNNNN).
//   · contenido_hash — SHA-256 del snapshot; se imprime como sello junto al
//     folio: cualquier tercero puede confirmar que este documento es
//     exactamente el expedido (papel incluido — sobrevive a @media print).
//
// El botón de pago permanece APAGADO hasta que existan pasarelas (punto 2):
// cuando llegue, será intención de pago server-side con token propio —
// jamás un monto en la URL (crítico §A.1 de la evaluación 13). Mientras,
// las notas apuntan a los canales tradicionales.
definePageMeta({ layout: 'blank', publico: true })

const route = useRoute()
const id = route.params.id as string
const tokenEnlace = computed(() => {
  const t = route.query.t
  return typeof t === 'string' && t.length > 0 ? t : undefined
})

const cliente = useSupabaseClient()

interface RespuestaEstadoCuenta {
  datos: EstadoCuentaDatos
  folio: string | null
  contenido_hash: string | null
  pago_habilitado?: boolean
}

const {
  data: respuesta,
  error: errorCarga,
  pending,
} = await useAsyncData(`estado-cuenta-${id}`, async () => {
  const { data, error: errorFuncion } = await cliente.functions.invoke<RespuestaEstadoCuenta>(
    'ver-estado-cuenta',
    { body: tokenEnlace.value ? { id, t: tokenEnlace.value } : { id } },
  )
  if (errorFuncion) {
    // createError(), no `new Error()` a secas: useAsyncData corre en SSR y un
    // Error normal pierde `.message` (propiedad no enumerable) al serializarse
    // en el payload hacia el cliente — el visor quedaba mostrando siempre el
    // mensaje genérico. NuxtError sí sobrevive esa frontera intacto.
    const err = await extraerErrorFuncion(errorFuncion)
    throw createError({ message: err.message, fatal: false })
  }
  if (!data) throw createError({ message: 'No se encontró el comprobante de cuenta.', fatal: false })
  return data
})

const datos = computed(() => respuesta.value?.datos ?? null)

// ── Pagar ahora (D-32, cierra D-28 punto 4) ─────────────────────────────
// Se enciende solo cuando el propio servidor (ver-estado-cuenta) confirma
// que el tenant tiene una pasarela activa — nunca una condición local. El
// monto NO se decide aquí: crear-intencion-pago lo calcula del lado del
// servidor a partir del saldo real (§5.3), el mismo criterio de "jamás un
// monto en la URL" que ya regía este visor.
const saldoPendiente = computed(() => (datos.value?.saldo_final ?? 0) > 0)
const pagoHabilitado = computed(() => respuesta.value?.pago_habilitado === true && saldoPendiente.value)
const pagando = ref(false)
const errorPago = ref<string | null>(null)

async function pagarAhora(): Promise<void> {
  if (!tokenEnlace.value) {
    errorPago.value = 'Este enlace no tiene la firma necesaria para iniciar un pago. Pide uno nuevo a la administración.'
    return
  }
  pagando.value = true
  errorPago.value = null
  try {
    const { data, error: errorFuncion } = await cliente.functions.invoke<{
      resultado: { tipo: string; checkoutUrl?: string }
    }>('crear-intencion-pago', {
      body: { via: 'token', estado_cuenta_id: id, t: tokenEnlace.value, metodo: 'pse' },
    })
    if (errorFuncion) throw await extraerErrorFuncion(errorFuncion)
    if (data?.resultado.tipo === 'redirect' && data.resultado.checkoutUrl) {
      window.location.href = data.resultado.checkoutUrl
      return
    }
    throw new Error('La pasarela no devolvió un enlace de pago.')
  } catch (excepcion) {
    errorPago.value = mensajeError(excepcion, 'No se pudo iniciar el pago. Inténtalo de nuevo.')
  } finally {
    pagando.value = false
  }
}
</script>

<template>
  <div class="estado-cuenta-pagina">
    <template v-if="pending">
      <p class="mensaje">Cargando estado de cuenta…</p>
    </template>
    <template v-else-if="errorCarga || !datos">
      <p class="mensaje">
        {{ mensajeError(errorCarga, 'No se pudo cargar el estado de cuenta.') }}
      </p>
    </template>
    <ComprobanteCuentaDocumento
      v-else
      :datos="datos"
      :folio="respuesta?.folio ?? null"
      :contenido-hash="respuesta?.contenido_hash ?? ''"
      :pago-habilitado="pagoHabilitado"
      :pagando="pagando"
      :error-pago="errorPago"
      @pagar="pagarAhora"
    />
  </div>
</template>

<style scoped>
/* El diseño completo del documento vive en ComprobanteCuentaDocumento.vue —
 * este archivo solo necesita el fondo/mensaje para los estados de carga y
 * error, antes de que el componente exista. */
.estado-cuenta-pagina {
  font-family: var(--font-sans);
  color: var(--color-neutral-900);
  background: var(--color-neutral-100);
  min-height: 100vh;
  padding: 40px 16px 72px;
}
.mensaje {
  max-width: 800px;
  margin: 0 auto;
  padding: 32px;
  color: var(--color-neutral-500);
  font-size: 14px;
  background: var(--color-neutral-50);
  border-radius: var(--radius-xl);
}
</style>
