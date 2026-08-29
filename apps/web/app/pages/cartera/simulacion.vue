<script setup lang="ts">
// Simulación previa de la corrida de cobranza (CAR §18.1, bloque 17).
//
// Responde una sola pregunta, que hoy no tiene respuesta en ninguna
// pantalla: **¿qué le va a llegar a los residentes si suelto esto?**
//
// El motor ya sabe decidir a quién escribirle y con qué texto. Lo que
// faltaba era poder MIRARLO antes. Sin esto, la única forma de saber qué
// enviaría una corrida es enviarla, y un mensaje no se puede recuperar.
//
// El backend es cartera-ejecutar-lote en modo 'simulacion': recorre las
// mismas validaciones que el envío real y renderiza el mismo mensaje, pero
// no despacha nada ni toca el estado de ninguna acción.
//
// La pantalla muestra DOS cosas, y la segunda importa tanto como la
// primera: lo que saldría, y lo que NO saldría con su motivo. Una acción
// omitida en silencio es una copropiedad que cree que notificó.
import { useCobranzaStore, type LineaLote, type ResultadoLote } from '~/stores/cobranza'
import { ETIQUETA_CANAL, textoLegible } from '~/utils/mensaje-cobranza'

definePageMeta({ layout: 'default', middleware: ['tenant', 'rbac'], permiso: 'data:read' })

const tenantStore = useTenantStore()
const cobranzaStore = useCobranzaStore()
const toast = useToast()

function hoyISO(): string {
  return new Date().toISOString().slice(0, 10)
}

const fechaCorte = ref(hoyISO())
const resultado = ref<ResultadoLote | null>(null)
const simulando = ref(false)
const enviando = ref(false)
const errorCorrida = ref<string | null>(null)
const confirmarEnvio = ref(false)

const esAdministrador = computed(() => tenantStore.role === 'administrador')

const aEnviar = computed<LineaLote[]>(() => (resultado.value?.lineas ?? []).filter((l) => l.resultado === 'simulada'))
const omitidas = computed<LineaLote[]>(() => (resultado.value?.lineas ?? []).filter((l) => l.resultado === 'omitida'))

/**
 * El lote devuelve ids, no códigos. El nombre de la unidad se toma de la
 * bandeja, que ya se carga con una sola consulta — más barato que añadir
 * un join por línea en el worker.
 */
function codigoUnidad(inmuebleId: string): string {
  return cobranzaStore.acciones.find((a) => a.inmuebleId === inmuebleId)?.inmuebleCodigo ?? '—'
}

/**
 * El motivo viene como "CODIGO: explicación". El código es para los logs;
 * a quien mira la pantalla le sirve la explicación.
 */
function motivoLegible(motivo: string | undefined): string {
  if (!motivo) return 'Sin motivo registrado.'
  const separador = motivo.indexOf(': ')
  return separador > 0 ? motivo.slice(separador + 2) : motivo
}

async function simular(): Promise<void> {
  const tenantId = tenantStore.activeTenant?.id
  if (!tenantId) return
  simulando.value = true
  errorCorrida.value = null
  try {
    resultado.value = await cobranzaStore.correrLote(tenantId, {
      fechaCorte: fechaCorte.value,
      modo: 'simulacion',
    })
  } catch (excepcion) {
    errorCorrida.value = excepcion instanceof Error ? excepcion.message : 'No se pudo simular la corrida.'
    resultado.value = null
  } finally {
    simulando.value = false
  }
}

async function enviarDeVerdad(): Promise<void> {
  const tenantId = tenantStore.activeTenant?.id
  if (!tenantId) return
  confirmarEnvio.value = false
  enviando.value = true
  try {
    const salida = await cobranzaStore.correrLote(tenantId, {
      fechaCorte: fechaCorte.value,
      modo: 'ejecucion',
    })
    toast.add({
      title: `${String(salida.despachadas)} mensaje(s) despachado(s)`,
      description: 'Despachado no es entregado: la acreditación llega con el acuse del proveedor.',
      color: salida.fallidas > 0 ? 'warning' : 'success',
    })
    if (salida.fallidas > 0) {
      toast.add({
        title: `${String(salida.fallidas)} envío(s) fallaron`,
        description: 'Quedaron registrados con su motivo — revísalos en la bandeja de acciones.',
        color: 'error',
      })
    }
    // Se vuelve a simular: lo que ya salió deja de estar pendiente y la
    // pantalla no puede seguir ofreciendo enviarlo otra vez.
    await simular()
  } catch (excepcion) {
    toast.add({
      title: 'No se pudo ejecutar la corrida',
      description: excepcion instanceof Error ? excepcion.message : 'Error inesperado.',
      color: 'error',
    })
  } finally {
    enviando.value = false
  }
}

// En cliente, no en useAsyncData: invocar una Edge Function durante el SSR
// no lleva la sesión del usuario y la llamada se queda sin resolver — la
// pantalla aparecía vacía sin decir por qué. La bandeja sí puede usar
// useAsyncData porque consulta por RPC, que sí viaja con la cookie.
onMounted(() => {
  const tenantId = tenantStore.activeTenant?.id
  // La bandeja se carga en paralelo solo para poder nombrar las unidades
  // por su código en vez de por su uuid.
  if (tenantId) void cobranzaStore.cargarBandeja(tenantId)
  void simular()
})

watch(
  () => tenantStore.activeTenant?.id,
  () => {
    void simular()
  },
)
</script>

<template>
  <div class="space-y-6">
    <div>
      <h1 class="text-xl font-semibold mb-2">Simulación de la corrida</h1>
      <p class="text-sm text-neutral-500">
        Qué mensajes saldrían hoy, con su texto exacto — sin enviar ninguno.
      </p>
    </div>

    <div class="flex flex-wrap items-end gap-3">
      <UFormField label="Fecha de corte" name="fechaCorte" class="w-48">
        <UInput v-model="fechaCorte" type="date" size="sm" />
      </UFormField>
      <UButton icon="i-lucide-play" size="sm" :loading="simulando" @click="simular">Simular</UButton>

      <UButton
        v-if="aEnviar.length > 0"
        class="ml-auto"
        icon="i-lucide-send"
        size="sm"
        color="primary"
        :disabled="!esAdministrador"
        :loading="enviando"
        :title="esAdministrador ? 'Despachar estos mensajes ahora' : 'Ejecutar una corrida requiere rol administrador'"
        @click="confirmarEnvio = true"
      >
        Enviar {{ aEnviar.length }} mensaje(s)
      </UButton>
    </div>

    <UAlert
      v-if="errorCorrida"
      color="error"
      variant="subtle"
      icon="i-lucide-triangle-alert"
      title="No se pudo simular"
      :description="errorCorrida"
    />

    <template v-if="resultado">
      <!-- El aviso va arriba y en primera persona: la pregunta que trae a
           alguien a esta pantalla es "¿esto se está enviando?". -->
      <UAlert
        color="neutral"
        variant="subtle"
        icon="i-lucide-eye"
        title="Nada de esto se ha enviado"
        :description="`Corrida simulada al ${resultado.fechaCorte}. ${String(resultado.candidatas)} acción(es) evaluadas.`"
      />

      <div class="grid grid-cols-2 md:grid-cols-3 gap-3">
        <div class="rounded-md border border-neutral-200 dark:border-neutral-800 p-3">
          <p class="text-xs text-neutral-500">Saldrían</p>
          <p class="text-2xl font-semibold tabular-nums">{{ aEnviar.length }}</p>
        </div>
        <div class="rounded-md border border-neutral-200 dark:border-neutral-800 p-3">
          <p class="text-xs text-neutral-500">No saldrían</p>
          <p class="text-2xl font-semibold tabular-nums">{{ omitidas.length }}</p>
        </div>
        <div class="rounded-md border border-neutral-200 dark:border-neutral-800 p-3">
          <p class="text-xs text-neutral-500">Evaluadas</p>
          <p class="text-2xl font-semibold tabular-nums">{{ resultado.candidatas }}</p>
        </div>
      </div>

      <p v-if="resultado.hayMas" class="text-xs text-warning-600 dark:text-warning-400 flex items-center gap-1.5">
        <UIcon name="i-lucide-info" class="size-3.5 shrink-0" />
        El lote llegó a su tope: hay más acciones esperando de las que se muestran aquí.
      </p>

      <!-- ── lo que saldría ─────────────────────────────────────────── -->
      <div v-if="aEnviar.length > 0">
        <h2 class="text-sm font-semibold mb-3">Mensajes que saldrían</h2>
        <div class="space-y-2">
          <div
            v-for="linea in aEnviar"
            :key="linea.accionId"
            class="rounded-md border border-neutral-200 dark:border-neutral-800 p-3 space-y-1.5"
          >
            <p class="text-xs text-neutral-500">
              <UBadge size="sm" variant="subtle" color="neutral">{{ ETIQUETA_CANAL[linea.canal] ?? linea.canal }}</UBadge>
              <span class="ml-2">Para {{ linea.destinatarioContacto }}</span>
            </p>
            <p v-if="linea.asunto" class="text-sm font-medium">Asunto: {{ linea.asunto }}</p>
            <!-- El texto íntegro, tal como lo recibiría el deudor. Es el
                 punto entero de esta pantalla. En correo se muestra el
                 texto del HTML, no su maquetado. -->
            <p class="text-sm whitespace-pre-wrap rounded bg-neutral-50 dark:bg-neutral-900 p-2">
              {{ textoLegible(linea.canal, linea.contenido ?? '') }}
            </p>
          </div>
        </div>
      </div>

      <p v-else-if="omitidas.length === 0" class="text-sm text-neutral-500">
        No hay acciones pendientes para esta fecha de corte. La corrida no enviaría nada.
      </p>

      <!-- ── lo que no saldría, y por qué ───────────────────────────── -->
      <div v-if="omitidas.length > 0">
        <h2 class="text-sm font-semibold mb-1">No saldrían</h2>
        <p class="text-xs text-neutral-500 mb-3">
          Estas acciones están en la cola pero la corrida las salta. Una acción omitida en silencio
          es una copropiedad que cree que notificó.
        </p>
        <UiTabla
          variante="tailwind"
          :columnas="[
            { clave: 'accion', etiqueta: 'Acción' },
            { clave: 'motivo', etiqueta: 'Por qué no sale' },
          ]"
          :filas="omitidas"
          :clave-fila="(fila) => fila.accionId"
        >
          <template #celda-accion="{ fila }">
            <!-- El código de la unidad, no el uuid de la acción: quien lee
                 esto tiene que saber a qué inmueble ir. -->
            <span class="font-medium">{{ codigoUnidad(fila.inmuebleId) }}</span>
          </template>
          <template #celda-motivo="{ fila }">
            <span class="text-sm">{{ motivoLegible(fila.motivo) }}</span>
          </template>
        </UiTabla>
      </div>
    </template>

    <!-- ── confirmación de envío real ───────────────────────────────── -->
    <UModal v-model:open="confirmarEnvio" title="Enviar de verdad">
      <template #body>
        <div class="space-y-3 text-sm">
          <p>
            Se van a despachar <strong>{{ aEnviar.length }}</strong> mensaje(s) a residentes reales,
            con la fecha de corte <strong>{{ fechaCorte }}</strong>.
          </p>
          <p class="text-neutral-500">
            Cada mensaje se factura con el proveedor y no se puede recuperar una vez enviado. La
            evidencia de cada envío queda registrada para el expediente.
          </p>
        </div>
      </template>
      <template #footer>
        <UButton color="neutral" variant="ghost" @click="confirmarEnvio = false">Cancelar</UButton>
        <UButton color="primary" :loading="enviando" @click="enviarDeVerdad">
          Sí, enviar {{ aEnviar.length }}
        </UButton>
      </template>
    </UModal>
  </div>
</template>
