<script setup lang="ts">
// CO-6 · Cierre, apertura y corrección de errores (§3.7).
//
// Rejilla de los 12 periodos del ejercicio en semáforo; al seleccionar uno, sus hallazgos
// (contable_validacion_cierre) con enlace a la pantalla donde se resuelven. El botón de cierre
// se deshabilita mientras haya bloqueantes; con solo advertencias, exige la casilla de
// confirmación antes de forzar. Cierre/apertura de ejercicio son acciones separadas y explícitas.
definePageMeta({ layout: 'default', middleware: ['tenant', 'rbac'], permiso: 'data:read' })

const tenantStore = useTenantStore()
const contabilidadStore = useContabilidadStore()
const cierresStore = useCierresStore()

const hoy = new Date()
const anio = ref(hoy.getFullYear())
const periodoSeleccionadoId = ref<string | null>(null)
const forzarAdvertencias = ref(false)
const error = ref<string | null>(null)
const mensaje = ref<string | null>(null)

const modalReabrir = ref(false)
const motivoReabrir = ref('')
const modalCerrarEjercicio = ref(false)
const modalAbrirEjercicio = ref(false)
const anioAperturaNueva = ref(anio.value + 1)
const vistaHistorial = ref(false)

const MESES = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
]

// §3.7: cada hallazgo enlazado a la pantalla donde se resuelve — un hallazgo que no dice dónde
// arreglarlo es inútil.
const PANTALLA_POR_HALLAZGO: Record<string, { label: string; to: string }> = {
  comprobante_borrador: { label: 'Ver comprobantes', to: '/contabilidad/comprobantes' },
  parametrizacion_pendiente: { label: 'Ir a configuración', to: '/contabilidad/configuracion' },
  conciliacion_proyeccion: { label: 'Ver movimientos', to: '/contabilidad/movimientos' },
  materializacion_pendiente: { label: 'Ver movimientos', to: '/contabilidad/movimientos' },
  comprobante_descuadrado: { label: 'Ver comprobantes', to: '/contabilidad/comprobantes' },
  conciliacion_cartera: { label: 'Ver libro de inventarios y balances', to: '/contabilidad/libros' },
  movimiento_sin_contrapartida: { label: 'Ver movimientos', to: '/contabilidad/movimientos' },
  cuenta_bancaria_sin_mapear: { label: 'Ir a configuración', to: '/contabilidad/configuracion' },
  marco_sin_clasificar: { label: 'Clasificar copropiedad', to: '/contabilidad/configuracion' },
  deterioro_no_calculado: { label: 'Ir a deterioro de cartera', to: '/contabilidad/deterioro' },
  periodo_anterior_abierto: { label: 'Seleccione el periodo anterior', to: '/contabilidad/cierres' },
}

const puedeReabrir = computed(() => tenantStore.role === 'administrador')

const periodoSeleccionado = computed(() =>
  cierresStore.periodos.find((p) => p.id === periodoSeleccionadoId.value) ?? null,
)
const bloqueantes = computed(() => cierresStore.hallazgos.filter((h) => h.severidad === 'bloqueante'))
const advertencias = computed(() => cierresStore.hallazgos.filter((h) => h.severidad === 'advertencia'))
const puedeCerrarPeriodo = computed(() =>
  bloqueantes.value.length === 0 && (advertencias.value.length === 0 || forzarAdvertencias.value),
)
const los12Cerrados = computed(() =>
  cierresStore.periodos.length === 12 && cierresStore.periodos.every((p) => p.contable_estado === 'cerrado'),
)
const ejercicioBloqueado = computed(() =>
  cierresStore.periodos.length === 12 && cierresStore.periodos.every((p) => p.contable_estado === 'bloqueado'),
)
/** Copropiedad recién creada: nunca tuvo NINGÚN periodo, en ningún año — no hay "ejercicio
 * anterior" que exigirle bloqueado. Se abre directamente el ejercicio que se está mirando
 * (`anio`), no el siguiente. */
const esPrimerEjercicio = computed(() => cierresStore.periodos.length === 0 && !cierresStore.hayHistorial)
const puedeAbrirEjercicio = computed(() => ejercicioBloqueado.value || esPrimerEjercicio.value)
const anioAperturaSugerida = computed(() => (esPrimerEjercicio.value ? anio.value : anio.value + 1))

function colorEstado(estado: string): 'neutral' | 'warning' | 'success' {
  if (estado === 'abierto') return 'neutral'
  if (estado === 'cerrado') return 'warning'
  return 'success' // bloqueado
}

async function cargar(): Promise<void> {
  const tenantId = tenantStore.activeTenant?.id
  if (!tenantId) return
  error.value = null
  try {
    await contabilidadStore.cargarMarcoContable(tenantId)
    await cierresStore.cargarPeriodos(tenantId, anio.value)
    periodoSeleccionadoId.value = null
    cierresStore.hallazgos = []
  } catch (e) {
    error.value = e instanceof Error ? e.message : 'Error al cargar los periodos'
  }
}

async function seleccionar(periodoId: string): Promise<void> {
  const tenantId = tenantStore.activeTenant?.id
  if (!tenantId) return
  periodoSeleccionadoId.value = periodoId
  forzarAdvertencias.value = false
  error.value = null
  try {
    await cierresStore.cargarValidacion(tenantId, periodoId)
  } catch (e) {
    error.value = e instanceof Error ? e.message : 'Error al validar el periodo'
  }
}

async function cerrarPeriodoSeleccionado(): Promise<void> {
  const tenantId = tenantStore.activeTenant?.id
  if (!tenantId || !periodoSeleccionadoId.value) return
  error.value = null
  mensaje.value = null
  try {
    await cierresStore.cerrarPeriodo(tenantId, periodoSeleccionadoId.value, forzarAdvertencias.value)
    mensaje.value = 'Periodo cerrado.'
    await cargar()
  } catch (e) {
    error.value = e instanceof Error ? e.message : 'Error al cerrar el periodo'
  }
}

async function confirmarReabrir(): Promise<void> {
  const tenantId = tenantStore.activeTenant?.id
  if (!tenantId || !periodoSeleccionadoId.value) return
  error.value = null
  mensaje.value = null
  try {
    await cierresStore.reabrirPeriodo(tenantId, periodoSeleccionadoId.value, motivoReabrir.value)
    modalReabrir.value = false
    motivoReabrir.value = ''
    mensaje.value = 'Periodo reabierto.'
    await cargar()
  } catch (e) {
    error.value = e instanceof Error ? e.message : 'Error al reabrir el periodo'
  }
}

async function confirmarCerrarEjercicio(): Promise<void> {
  const tenantId = tenantStore.activeTenant?.id
  if (!tenantId) return
  error.value = null
  mensaje.value = null
  try {
    await cierresStore.cerrarEjercicio(tenantId, anio.value)
    modalCerrarEjercicio.value = false
    mensaje.value = `Ejercicio ${String(anio.value)} cerrado.`
    await cargar()
  } catch (e) {
    error.value = e instanceof Error ? e.message : 'Error al cerrar el ejercicio'
  }
}

async function confirmarAbrirEjercicio(): Promise<void> {
  const tenantId = tenantStore.activeTenant?.id
  if (!tenantId) return
  error.value = null
  mensaje.value = null
  try {
    await cierresStore.abrirEjercicio(tenantId, anioAperturaNueva.value)
    modalAbrirEjercicio.value = false
    mensaje.value = `Ejercicio ${String(anioAperturaNueva.value)} abierto.`
    anio.value = anioAperturaNueva.value
    await cargar()
  } catch (e) {
    error.value = e instanceof Error ? e.message : 'Error al abrir el ejercicio'
  }
}

async function mostrarHistorial(): Promise<void> {
  const tenantId = tenantStore.activeTenant?.id
  if (!tenantId) return
  vistaHistorial.value = true
  error.value = null
  try {
    await cierresStore.cargarHistorial(tenantId)
  } catch (e) {
    error.value = e instanceof Error ? e.message : 'Error al cargar el historial'
  }
}

onMounted(() => { void cargar() })
watch(anio, () => { void cargar() })
</script>

<template>
  <div class="space-y-6">
    <div class="flex items-start justify-between gap-4 flex-wrap">
      <UiTituloDescripcion clase-descripcion="text-sm text-muted mt-1 max-w-2xl">
        <template #titulo>
          <h1 class="text-xl font-semibold">Cierres contables</h1>
        </template>
        <template #descripcion>
          Cierre mensual, cierre y apertura de ejercicio, y reaperturas auditadas. El cierre
          mensual no genera asiento — solo bloquea el periodo; el asiento de cierre es anual.
        </template>
      </UiTituloDescripcion>
      <UButton variant="ghost" icon="i-lucide-history" @click="mostrarHistorial()">
        Historial de reaperturas y correcciones
      </UButton>
    </div>

    <ContabilidadBannerSinClasificar :clasificado="contabilidadStore.marcoContable?.clasificado ?? false" />

    <UAlert v-if="error" color="error" variant="soft" :title="error" />
    <UAlert v-if="mensaje" color="success" variant="soft" :title="mensaje" />

    <div v-if="!vistaHistorial" class="space-y-6">
      <div class="flex items-end gap-2">
        <UFormField label="Ejercicio" name="anio">
          <UInput v-model.number="anio" type="number" class="w-32" />
        </UFormField>
        <UButton variant="ghost" icon="i-lucide-refresh-cw" :loading="cierresStore.loading" @click="cargar()">
          Actualizar
        </UButton>
      </div>

      <!-- Rejilla de 12 periodos -->
      <div class="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-6 gap-2">
        <button
          v-for="p in cierresStore.periodos" :key="p.id" type="button"
          class="rounded-lg border p-3 text-left transition-colors"
          :class="p.id === periodoSeleccionadoId ? 'border-primary ring-1 ring-primary' : 'border-default hover:border-primary/50'"
          @click="seleccionar(p.id)"
        >
          <p class="text-sm font-medium">{{ MESES[p.mes - 1] }}</p>
          <UBadge :color="colorEstado(p.contable_estado)" variant="soft" size="sm" class="mt-1 capitalize">
            {{ p.contable_estado }}
          </UBadge>
        </button>
        <p v-if="cierresStore.periodos.length === 0" class="col-span-full text-sm text-muted p-4 text-center">
          Sin periodos creados para este ejercicio.
        </p>
      </div>

      <!-- Acciones de ejercicio -->
      <div class="flex items-center gap-2 flex-wrap rounded-lg border border-default p-4">
        <p class="text-sm text-muted mr-2">
          {{ esPrimerEjercicio ? 'Copropiedad sin ejercicios previos — puede abrir su primer ejercicio.'
            : los12Cerrados ? 'Los 12 periodos están cerrados — listo para cerrar el ejercicio.'
              : ejercicioBloqueado ? 'Ejercicio ya cerrado y bloqueado.'
                : 'Cierre y apertura de ejercicio, acciones separadas y explícitas.' }}
        </p>
        <UButton
          color="error" :disabled="!los12Cerrados" icon="i-lucide-lock"
          @click="modalCerrarEjercicio = true"
        >
          Cerrar ejercicio {{ anio }}
        </UButton>
        <UButton
          color="primary" variant="soft" icon="i-lucide-unlock" :disabled="!puedeAbrirEjercicio"
          @click="anioAperturaNueva = anioAperturaSugerida; modalAbrirEjercicio = true"
        >
          Abrir ejercicio {{ anioAperturaSugerida }}
        </UButton>
      </div>

      <!-- Hallazgos del periodo seleccionado -->
      <div v-if="periodoSeleccionado" class="space-y-4 rounded-lg border border-default p-4">
        <div class="flex items-center justify-between flex-wrap gap-2">
          <h2 class="font-medium">
            {{ MESES[periodoSeleccionado.mes - 1] }} {{ anio }} —
            <span class="capitalize">{{ periodoSeleccionado.contable_estado }}</span>
          </h2>
          <UButton
            v-if="puedeReabrir && periodoSeleccionado.contable_estado === 'cerrado'"
            variant="ghost" color="warning" icon="i-lucide-unlock"
            @click="modalReabrir = true"
          >
            Reabrir periodo
          </UButton>
        </div>

        <div v-if="cierresStore.loadingHallazgos" class="text-sm text-muted">Validando…</div>
        <template v-else>
          <p v-if="cierresStore.hallazgos.length === 0" class="text-sm text-success">
            Sin hallazgos — el periodo puede cerrarse.
          </p>
          <ul v-else class="space-y-2">
            <li
              v-for="(h, i) in cierresStore.hallazgos" :key="i"
              class="flex items-start justify-between gap-3 rounded-lg border p-3"
              :class="h.severidad === 'bloqueante'
                ? 'border-red-300 dark:border-red-800 bg-red-50 dark:bg-red-950/30'
                : 'border-amber-300 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/30'"
            >
              <div>
                <p class="text-sm font-medium">
                  <UBadge :color="h.severidad === 'bloqueante' ? 'error' : 'warning'" variant="soft" size="sm">
                    {{ h.severidad }}
                  </UBadge>
                  {{ h.hallazgo }}
                </p>
                <p class="text-xs text-muted mt-1">{{ h.detalle }}</p>
              </div>
              <NuxtLink
                v-if="PANTALLA_POR_HALLAZGO[h.hallazgo]"
                :to="PANTALLA_POR_HALLAZGO[h.hallazgo]!.to"
                class="text-xs font-medium underline whitespace-nowrap"
              >
                {{ PANTALLA_POR_HALLAZGO[h.hallazgo]!.label }}
              </NuxtLink>
            </li>
          </ul>

          <UCheckbox
            v-if="bloqueantes.length === 0 && advertencias.length > 0"
            v-model="forzarAdvertencias"
            label="Confirmo que revisé las advertencias y quiero forzar el cierre de todas formas"
          />

          <UButton
            v-if="periodoSeleccionado.contable_estado === 'abierto'"
            color="primary" :disabled="!puedeCerrarPeriodo" :loading="cierresStore.procesando"
            icon="i-lucide-lock"
            @click="cerrarPeriodoSeleccionado()"
          >
            Cerrar periodo
          </UButton>
        </template>
      </div>
    </div>

    <!-- Historial (visible para el rol auditor, entre otros con acceso de lectura) -->
    <div v-else class="space-y-6">
      <UButton variant="ghost" icon="i-lucide-arrow-left" @click="vistaHistorial = false">
        Volver a los cierres
      </UButton>

      <div>
        <h2 class="font-medium mb-2">Reaperturas</h2>
        <div class="overflow-x-auto rounded-lg border border-default">
          <table class="w-full text-sm">
            <thead class="bg-muted/30">
              <tr><th class="p-2 text-left">Cuándo</th><th class="p-2 text-left">Motivo</th></tr>
            </thead>
            <tbody>
              <tr v-for="r in cierresStore.reaperturas" :key="r.id" class="border-t border-default">
                <td class="p-2">{{ new Date(r.created_at).toLocaleString('es-CO') }}</td>
                <td class="p-2">{{ (r.metadata as { motivo?: string } | null)?.motivo ?? '—' }}</td>
              </tr>
              <tr v-if="cierresStore.reaperturas.length === 0">
                <td colspan="2" class="p-4 text-center text-muted">Sin reaperturas registradas.</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <div>
        <h2 class="font-medium mb-2">Correcciones</h2>
        <div class="overflow-x-auto rounded-lg border border-default">
          <table class="w-full text-sm">
            <thead class="bg-muted/30">
              <tr>
                <th class="p-2 text-left">Cuándo</th><th class="p-2 text-left">Motivo</th>
                <th class="p-2 text-left">Tipo</th><th class="p-2 text-left">Reversión</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="c in cierresStore.correcciones" :key="c.id" class="border-t border-default">
                <td class="p-2">{{ new Date(c.created_at).toLocaleString('es-CO') }}</td>
                <td class="p-2">{{ c.motivo }}</td>
                <td class="p-2">{{ c.tipo_correccion }}</td>
                <td class="p-2">{{ c.comprobante_reversion_id ? 'Sí' : 'No (mismo periodo — Grupo 3)' }}</td>
              </tr>
              <tr v-if="cierresStore.correcciones.length === 0">
                <td colspan="4" class="p-4 text-center text-muted">Sin correcciones registradas.</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>

    <!-- Modal: reabrir periodo -->
    <UModal v-model:open="modalReabrir" title="Reabrir periodo">
      <template #body>
        <UFormField label="Motivo" name="motivo" required>
          <UTextarea v-model="motivoReabrir" class="w-full" :rows="3" placeholder="Motivo de la reapertura (obligatorio, queda auditado)" />
        </UFormField>
      </template>
      <template #footer>
        <UButton variant="ghost" @click="modalReabrir = false">Cancelar</UButton>
        <UButton color="warning" :disabled="!motivoReabrir.trim()" :loading="cierresStore.procesando" @click="confirmarReabrir()">
          Reabrir
        </UButton>
      </template>
    </UModal>

    <!-- Modal: cerrar ejercicio -->
    <UModal v-model:open="modalCerrarEjercicio" title="Cerrar ejercicio">
      <template #body>
        <p class="text-sm">
          Se generará el comprobante de cierre que cancela las cuentas de resultado (clases 4, 5 y
          6) contra la cuenta de excedente/déficit del ejercicio, y los 12 periodos de {{ anio }}
          pasarán a <strong>bloqueado</strong>. Esta acción no se puede deshacer directamente.
        </p>
      </template>
      <template #footer>
        <UButton variant="ghost" @click="modalCerrarEjercicio = false">Cancelar</UButton>
        <UButton color="error" :loading="cierresStore.procesando" @click="confirmarCerrarEjercicio()">
          Confirmar cierre del ejercicio {{ anio }}
        </UButton>
      </template>
    </UModal>

    <!-- Modal: abrir ejercicio -->
    <UModal v-model:open="modalAbrirEjercicio" title="Abrir ejercicio">
      <template #body>
        <p v-if="esPrimerEjercicio" class="text-sm">
          Primer ejercicio de esta copropiedad — no hay un ejercicio anterior del cual reproducir
          saldos. Se creará un comprobante de apertura vacío y los 12 periodos de
          {{ anioAperturaNueva }}, listos para liquidar desde cero.
        </p>
        <p v-else class="text-sm">
          Se generará el comprobante de apertura con los saldos de balance (clases 1, 2 y 3) al
          cierre de {{ anio }}, y se crearán los 12 periodos de {{ anioAperturaNueva }}.
        </p>
      </template>
      <template #footer>
        <UButton variant="ghost" @click="modalAbrirEjercicio = false">Cancelar</UButton>
        <UButton color="primary" :loading="cierresStore.procesando" @click="confirmarAbrirEjercicio()">
          Confirmar apertura del ejercicio {{ anioAperturaNueva }}
        </UButton>
      </template>
    </UModal>
  </div>
</template>
