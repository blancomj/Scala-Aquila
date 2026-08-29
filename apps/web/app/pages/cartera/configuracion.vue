<script setup lang="ts">
// Configuración del módulo de cartera (CAR §8 y §9, bloque 23).
//
// Es la puerta de entrada que faltaba. Sin política de clasificación
// vigente, el job diario aborta por PH-C26/I-C14 y no ocurre absolutamente
// nada: ni clasificación, ni acciones, ni cobranza. Hasta ahora esa
// configuración solo existía si alguien la escribía en SQL, así que una
// copropiedad nueva no podía encender el módulo sin un desarrollador.
//
// La pantalla hace tres cosas, en orden de lo que hace falta primero:
//   1. Sembrar la configuración sugerida por el rector (§8.4/§9.4) de un
//      clic, para copropiedades que empiezan de cero.
//   2. Mostrar qué está vigente: tramos y estrategias, con sus reglas.
//   3. Dejar encender y apagar estrategias sin tocar la política.
//
// Lo que NO hace todavía: editar los tramos. Una política vigente es
// inmutable (§8.5) y corregirla exige crear una versión nueva — eso es una
// pantalla propia, con su comparación de versiones, y meterla aquí a medias
// habría dado un formulario que falla al guardar sin explicar por qué.
import { useCarteraConfigStore, type EstrategiaCobranza } from '~/stores/carteraConfig'
import { CANALES_AUTOMATICOS, ETIQUETA_CANAL } from '~/utils/mensaje-cobranza'

definePageMeta({ layout: 'default', middleware: ['tenant', 'rbac'], permiso: 'settings:manage' })

const tenantStore = useTenantStore()
const configStore = useCarteraConfigStore()
const toast = useToast()

const errorCarga = ref<string | null>(null)
const sembrando = ref(false)
const activando = ref(false)
const cambiando = ref<string | null>(null)

const ETIQUETA_ETAPA: Record<string, string> = {
  preventiva: 'Preventiva',
  administrativa: 'Administrativa',
  prejuridica: 'Prejurídica',
  juridica: 'Jurídica',
  judicial: 'Judicial',
}

const COLOR_RIESGO: Record<string, 'neutral' | 'success' | 'warning' | 'error'> = {
  ninguno: 'success',
  bajo: 'neutral',
  medio: 'warning',
  alto: 'error',
  critico: 'error',
}

async function cargar(): Promise<void> {
  const tenantId = tenantStore.activeTenant?.id
  if (!tenantId) return
  errorCarga.value = null
  try {
    await configStore.cargar(tenantId)
  } catch (excepcion) {
    errorCarga.value = excepcion instanceof Error ? excepcion.message : 'No se pudo cargar la configuración.'
  }
}

await useAsyncData('cartera-configuracion-inicial', async () => {
  await cargar()
  return null
})

watch(() => tenantStore.activeTenant?.id, cargar)

const politica = computed(() => configStore.politicaActual)
const esBorrador = computed(() => politica.value?.estado === 'borrador')
const sinConfigurar = computed(() => politica.value === null)

/** Estrategias agrupadas por tramo, en el orden en que escala la mora. */
const porTramo = computed(() =>
  configStore.tramos.map((tramo) => ({
    tramo,
    estrategias: configStore.estrategias.filter((e) => e.tramoId === tramo.id),
  })),
)

function rangoDias(diasMin: number, diasMax: number | null): string {
  if (diasMax === null) return `${String(diasMin)} días o más`
  if (diasMin === diasMax) return diasMin === 0 ? 'Sin mora' : `${String(diasMin)} días`
  return `${String(diasMin)} a ${String(diasMax)} días`
}

async function sembrar(): Promise<void> {
  const tenantId = tenantStore.activeTenant?.id
  if (!tenantId) return
  sembrando.value = true
  try {
    await configStore.sembrarInicial(tenantId)
    toast.add({
      title: 'Configuración creada',
      description: 'Queda en borrador: revísala y actívala cuando la asamblea la respalde.',
      color: 'success',
    })
    await cargar()
  } catch (excepcion) {
    toast.add({
      title: 'No se pudo crear la configuración',
      description: excepcion instanceof Error ? excepcion.message : 'Error inesperado.',
      color: 'error',
    })
  } finally {
    sembrando.value = false
  }
}

async function activar(): Promise<void> {
  const actual = politica.value
  if (!actual) return
  activando.value = true
  try {
    await configStore.activarPolitica(actual.id)
    toast.add({
      title: 'Política activada',
      description: 'A partir de ahora una corrección exige crear una versión nueva.',
      color: 'success',
    })
    await cargar()
  } catch (excepcion) {
    // El trigger dice exactamente qué invariante falta (§8.3): se muestra
    // tal cual, porque es lo único que permite arreglarlo.
    toast.add({
      title: 'No se pudo activar',
      description: excepcion instanceof Error ? excepcion.message : 'Error inesperado.',
      color: 'error',
    })
  } finally {
    activando.value = false
  }
}

async function alternar(estrategia: EstrategiaCobranza): Promise<void> {
  cambiando.value = estrategia.id
  try {
    await configStore.alternarEstrategia(estrategia.id, !estrategia.activa)
    await cargar()
  } catch (excepcion) {
    toast.add({
      title: 'No se pudo cambiar la estrategia',
      description: excepcion instanceof Error ? excepcion.message : 'Error inesperado.',
      color: 'error',
    })
  } finally {
    cambiando.value = null
  }
}
</script>

<template>
  <div class="space-y-6">
    <div>
      <h1 class="text-xl font-semibold mb-2">Configuración de cartera</h1>
      <p class="text-sm text-neutral-500">
        Cómo se clasifica la mora y qué gestión corresponde a cada tramo.
      </p>
    </div>

    <UAlert
      v-if="errorCarga"
      color="error"
      variant="subtle"
      icon="i-lucide-triangle-alert"
      title="No se pudo cargar"
      :description="errorCarga"
    />

    <!-- ── copropiedad sin configurar ───────────────────────────────── -->
    <div v-if="sinConfigurar && !configStore.loading" class="rounded-md border border-neutral-200 dark:border-neutral-800 p-6 space-y-4">
      <div>
        <h2 class="font-semibold mb-1">Esta copropiedad todavía no tiene política de cartera</h2>
        <p class="text-sm text-neutral-500 max-w-2xl">
          Sin política de clasificación, la corrida diaria no clasifica nada ni genera gestión de
          cobro: el módulo queda inactivo. Puedes partir de la configuración sugerida —ocho tramos
          de mora y las estrategias de cobranza correspondientes— y ajustarla antes de activarla.
        </p>
      </div>
      <UButton icon="i-lucide-sparkles" :loading="sembrando" @click="sembrar">
        Crear configuración sugerida
      </UButton>
      <p class="text-xs text-neutral-400">
        Se crea en borrador. Nada empieza a funcionar hasta que la actives.
      </p>
    </div>

    <template v-else-if="politica">
      <!-- ── estado de la política ──────────────────────────────────── -->
      <div class="rounded-md border border-neutral-200 dark:border-neutral-800 p-4 flex flex-wrap items-center gap-3">
        <div class="flex-1 min-w-64">
          <div class="flex items-center gap-2">
            <span class="font-medium">{{ politica.nombre }}</span>
            <UBadge size="sm" variant="subtle" :color="esBorrador ? 'warning' : 'success'">
              {{ esBorrador ? 'Borrador' : 'Vigente' }}
            </UBadge>
            <span class="text-xs text-neutral-400">versión {{ politica.version }}</span>
          </div>
          <p v-if="esBorrador" class="text-sm text-neutral-500 mt-1">
            Todavía no rige. La corrida diaria seguirá sin clasificar hasta que la actives.
          </p>
          <p v-else class="text-sm text-neutral-500 mt-1">
            Una política vigente no se puede modificar: corregirla es crear una versión nueva.
          </p>
        </div>
        <UButton v-if="esBorrador" icon="i-lucide-check" :loading="activando" @click="activar">
          Activar política
        </UButton>
      </div>

      <!-- ── tramos ─────────────────────────────────────────────────── -->
      <div>
        <h2 class="text-sm font-semibold mb-1">Tramos de mora</h2>
        <p class="text-xs text-neutral-500 mb-3">
          En qué tramo cae cada obligación según sus días de mora, y en qué etapa de cobranza la
          coloca.
        </p>
        <UiTabla
          variante="tailwind"
          :columnas="[
            { clave: 'tramo', etiqueta: 'Tramo' },
            { clave: 'dias', etiqueta: 'Días de mora' },
            { clave: 'riesgo', etiqueta: 'Riesgo' },
            { clave: 'etapa', etiqueta: 'Etapa' },
            { clave: 'acciones', etiqueta: 'Gestión', alinear: 'derecha' },
          ]"
          :filas="porTramo"
          :clave-fila="(fila) => fila.tramo.id"
        >
          <template #celda-tramo="{ fila }">
            <div class="flex flex-col">
              <span class="font-medium">{{ fila.tramo.nombre }}</span>
              <span class="text-xs text-neutral-400">{{ fila.tramo.codigo }}</span>
            </div>
          </template>
          <template #celda-dias="{ fila }">
            {{ rangoDias(fila.tramo.diasMin, fila.tramo.diasMax) }}
          </template>
          <template #celda-riesgo="{ fila }">
            <UBadge size="sm" variant="subtle" :color="COLOR_RIESGO[fila.tramo.nivelRiesgo] ?? 'neutral'">
              {{ fila.tramo.nivelRiesgo }}
            </UBadge>
          </template>
          <template #celda-etapa="{ fila }">
            {{ ETIQUETA_ETAPA[fila.tramo.etapaCobranza] ?? fila.tramo.etapaCobranza }}
          </template>
          <template #celda-acciones="{ fila }">
            <span class="text-sm tabular-nums">
              {{ fila.estrategias.filter((e) => e.activa).length }} activa(s)
            </span>
          </template>
        </UiTabla>
      </div>

      <!-- ── estrategias ────────────────────────────────────────────── -->
      <div>
        <h2 class="text-sm font-semibold mb-1">Estrategias de cobranza</h2>
        <p class="text-xs text-neutral-500 mb-3">
          Qué se hace en cada tramo. Las de alto impacto exigen aprobación de un administrador: el
          sistema nunca demanda a nadie por su cuenta.
        </p>

        <div class="space-y-4">
          <div v-for="grupo in porTramo" :key="grupo.tramo.id">
            <template v-if="grupo.estrategias.length > 0">
              <p class="text-xs font-medium text-neutral-500 mb-1.5">
                {{ grupo.tramo.nombre }} · {{ rangoDias(grupo.tramo.diasMin, grupo.tramo.diasMax) }}
              </p>
              <div class="space-y-1.5">
                <div
                  v-for="estrategia in grupo.estrategias"
                  :key="estrategia.id"
                  class="rounded-md border border-neutral-200 dark:border-neutral-800 p-3 flex flex-wrap items-center gap-3"
                  :class="estrategia.activa ? '' : 'opacity-60'"
                >
                  <div class="flex-1 min-w-56">
                    <div class="flex items-center gap-2 flex-wrap">
                      <span class="font-medium text-sm">{{ estrategia.nombre }}</span>
                      <UBadge size="sm" variant="subtle" color="neutral">
                        {{ ETIQUETA_CANAL[estrategia.canal] ?? estrategia.canal }}
                      </UBadge>
                      <UBadge v-if="estrategia.requiereAprobacion" size="sm" variant="subtle" color="warning">
                        Exige aprobación
                      </UBadge>
                      <!-- Distinción que evita una expectativa falsa: la
                           acción se crea igual, pero el envío es manual. -->
                      <UBadge
                        v-if="!CANALES_AUTOMATICOS.has(estrategia.canal)"
                        size="sm"
                        variant="subtle"
                        color="neutral"
                        title="La acción se crea igual y queda en la bandeja; el envío se gestiona a mano."
                      >
                        Gestión manual
                      </UBadge>
                    </div>
                    <p class="text-xs text-neutral-400 mt-0.5">
                      A los {{ estrategia.diasDesdeClasificacion }} día(s) de clasificar ·
                      {{ estrategia.frecuenciaDias === null ? 'una sola vez' : `cada ${String(estrategia.frecuenciaDias)} días` }}
                      · máximo {{ estrategia.maxIntentos }} intento(s)
                    </p>
                  </div>

                  <UButton
                    size="xs"
                    :variant="estrategia.activa ? 'outline' : 'solid'"
                    :color="estrategia.activa ? 'neutral' : 'primary'"
                    :loading="cambiando === estrategia.id"
                    @click="alternar(estrategia)"
                  >
                    {{ estrategia.activa ? 'Desactivar' : 'Activar' }}
                  </UButton>
                </div>
              </div>
            </template>
          </div>
        </div>
      </div>
    </template>
  </div>
</template>
