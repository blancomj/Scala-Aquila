<script setup lang="ts">
// Unificación de plantilla (D-14x): muestra el MISMO documento formal con folio+hash que ya recibe
// el propietario/residente por correo (comprobante-cuenta/[id].vue, D-27/D-28), resuelto para el
// vínculo autenticado vía external-estado-cuenta-ver — en vez de la vista de trabajo propia que
// tenía esta pantalla antes (EXT-07 §7.2). Si el tenant nunca ha corrido una liquidación no existe
// ningún estados_cuenta_generados que mostrar (estado legítimo, no un error): esta pantalla cae de
// vuelta a MiCopropiedadSaldoCard/external-cuenta-resumen para que igual se vea el saldo pendiente.
import type { Database } from '@aquila/shared'

definePageMeta({ layout: 'mi-copropiedad', publico: true })

const actorExterno = useActorExternoStore()
const cliente = useSupabaseClient<Database>()

const cargando = ref(true)
const error = ref<string | null>(null)
const comprobante = ref<ComprobanteCuentaRespuesta | null>(null)
// Estrecha la unión discriminada para el template (vue-tsc no infiere `existe: true` solo con un
// v-if/v-else sobre una expresión compuesta) — null cuando aún no hay comprobante que mostrar.
const comprobanteVisible = computed(() => (comprobante.value?.existe ? comprobante.value : null))
const resumen = ref<CuentaResumen | null>(null)
const pagando = ref(false)
const errorPago = ref<string | null>(null)

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

    const vinculoId = actorExterno.vinculoActivo.vinculo_id
    comprobante.value = await obtenerComprobanteCuenta(vinculoId)
    if (!comprobante.value.existe) {
      resumen.value = await obtenerCuentaResumen(vinculoId)
    }
  } catch (err) {
    error.value = mensajeError(err, 'No se pudo cargar tu estado de cuenta.')
  } finally {
    cargando.value = false
  }
}

onMounted(cargar)

async function pagar(): Promise<void> {
  if (!actorExterno.vinculoActivo) return
  pagando.value = true
  errorPago.value = null
  try {
    const resultado = await crearIntencionPagoActorExterno(actorExterno.vinculoActivo.vinculo_id)
    if (resultado.resultado.tipo === 'redirect' && resultado.resultado.checkoutUrl) {
      window.location.href = resultado.resultado.checkoutUrl
      return
    }
    throw new Error('La pasarela no devolvió un enlace de pago.')
  } catch (err) {
    errorPago.value = mensajeError(err, 'No se pudo iniciar el pago. Inténtalo de nuevo.')
  } finally {
    pagando.value = false
  }
}
</script>

<template>
  <div v-if="!comprobanteVisible" class="mx-auto max-w-md space-y-4 p-4">
    <h1 class="text-lg font-semibold text-highlighted">Finanzas</h1>

    <UAlert v-if="error" color="error" variant="soft" :title="error" />

    <MiCopropiedadSaldoCard v-else :resumen="resumen" :cargando="cargando">
      <template v-if="resumen && resumen.pago_habilitado && resumen.saldo_total > 0" #acciones>
        <UButton block :loading="pagando" :disabled="pagando" @click="pagar">
          {{ pagando ? 'Abriendo pasarela…' : 'Pagar ahora' }}
        </UButton>
        <p v-if="errorPago" class="mt-2 text-xs text-red-600 dark:text-red-400">{{ errorPago }}</p>
      </template>
    </MiCopropiedadSaldoCard>
  </div>

  <FinanzasComprobanteCuentaDocumento
    v-else
    :datos="comprobanteVisible.datos"
    :folio="comprobanteVisible.folio"
    :contenido-hash="comprobanteVisible.contenido_hash"
    :pago-habilitado="comprobanteVisible.pago_habilitado"
    :pagando="pagando"
    :error-pago="errorPago"
    @pagar="pagar"
  />
</template>
