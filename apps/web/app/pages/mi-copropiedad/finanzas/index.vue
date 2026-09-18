<script setup lang="ts">
// EXT-07 §6.1/§7.2/§8.3 — "estado de cuenta en vivo" + pagar. Distinto del comprobante formal con
// folio y hash (comprobante-cuenta/[id].vue, D-27/D-28 — sin cambios): esa es una constancia
// sellada al corte; esta es una vista de trabajo consultada on-demand, sin folio (ver §4.3 del
// prompt de este corte).
import type { Database } from '@aquila/shared'

definePageMeta({ layout: 'mi-copropiedad', publico: true })

const actorExterno = useActorExternoStore()
const cliente = useSupabaseClient<Database>()

const cargando = ref(true)
const error = ref<string | null>(null)
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

    resumen.value = await obtenerCuentaResumen(actorExterno.vinculoActivo.vinculo_id)
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
  <div class="mx-auto max-w-md space-y-4 p-4">
    <h1 class="text-lg font-semibold text-gray-900 dark:text-white">Finanzas</h1>

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
</template>
