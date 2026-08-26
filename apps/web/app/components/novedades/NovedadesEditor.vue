<script setup lang="ts">
// Editor de novedad como página completa (/novedades/nueva y /novedades/[id]),
// mismo criterio que ConceptosEditor: el formulario no cabe cómodamente ni en
// línea sobre la tabla (empujaba la lista fuera de vista) ni en un panel
// lateral estrecho — son tres bloques de decisiones más un resumen que tiene
// que estar visible mientras se llena.
//
// Dos modos según `novedadId`:
//  - sin él: creación.
//  - con él: consulta. NO es edición: `novedades` no tiene política RLS de
//    UPDATE para `authenticated` (solo insert_agent y select_agent_auditor),
//    así que una novedad ya creada no se puede modificar por ninguna vía de
//    usuario — el estado lo mueven las Edge Functions aprobar/rechazar/
//    inhabilitar. La pantalla lo dice en vez de mostrar campos que fingirían
//    ser editables.
//
// Tres problemas del formulario anterior que este resuelve:
//
//  1. "Monto" significaba tres cosas distintas según la repetición (una vez /
//     completo cada periodo / total a repartir en N cuotas) y la pantalla
//     nunca decía cuál. Ahora cada opción explica su efecto y el panel "Qué va
//     a pasar" lo dice con los números puestos.
//  2. El signo era una trampa: había que escribir el menos a mano o la Edge
//     Function rechazaba con "…requieren monto negativo (AD-30)". Ahora se
//     pide una magnitud positiva y el signo lo deriva la dirección elegida
//     (AD-30 sigue validando igual del lado servidor).
//  3. "Componente presupuestal" obligaba a elegir cuenta contable entre 19
//     opciones en cada captura. Ese vínculo se movió al catálogo de motivos
//     (novedad_tipo_cuenta, 20260830240000) y lo aplica el trigger
//     aplicar_novedad_cuenta_por_tipo — aquí solo se muestra bajo qué cuenta
//     va a quedar.
//
// La fecha se captura como año-mes porque el día se descarta:
// fn_aprobar_novedad solo hace extract(year|month) de fecha_efectiva. Se
// envía siempre el día 01.
import {
  COLOR_ESTADO_NOVEDAD,
  DESCRIPCION_ESTADO_NOVEDAD,
  DESCRIPCION_REPETICION,
  DESCRIPCION_SIGNO,
  DESCRIPCION_TIPO_NOVEDAD,
  ETIQUETA_ESTADO_NOVEDAD,
  ETIQUETA_REPETICION,
  ETIQUETA_SIGNO,
  ETIQUETA_TIPO_NOVEDAD,
  TIPO_POR_SIGNO,
  mesAnioTexto,
  type NovedadTipo,
  type RepeticionNovedad,
  type SignoNovedad,
} from '~/utils/novedad-labels'

const props = defineProps<{ novedadId?: string }>()

const route = useRoute()
// Llegar desde "Nueva novedad" en la ficha de un inmueble preselecciona ese
// inmueble y, al guardar, vuelve a esa ficha en vez de a la lista general.
const inmuebleIdInicial =
  typeof route.query.inmuebleId === 'string' ? route.query.inmuebleId : null

const tenantStore = useTenantStore()
const cuentaStore = useCuentaCorrienteStore()
const presupuestoStore = usePresupuestoStore()
const conceptoStore = useConceptoStore()
const liquidacionStore = useLiquidacionStore()

const cargando = ref(false)
const guardando = ref(false)
const error = ref<string | null>(null)

const soloLectura = computed(() => props.novedadId !== undefined)

onMounted(async () => {
  const tenantId = tenantStore.activeTenant?.id
  if (!tenantId) return
  cargando.value = true
  try {
    await Promise.all([
      cuentaStore.cargarInmuebles(tenantId),
      cuentaStore.cargarTiposNovedad(tenantId),
      cuentaStore.cargarNovedadTipoCuenta(tenantId),
      cuentaStore.cargarPropietarios(tenantId),
      presupuestoStore.cargarCuentas(tenantId),
      conceptoStore.cargarConceptos(tenantId),
      liquidacionStore.cargarPeriodos(tenantId),
      ...(props.novedadId
        ? [cuentaStore.cargarNovedades(tenantId), cuentaStore.cargarNovedadCuotas(tenantId)]
        : []),
    ])
  } finally {
    cargando.value = false
  }
})

const novedad = computed(() =>
  props.novedadId ? cuentaStore.novedades.find((n) => n.id === props.novedadId) : undefined,
)

// ── formulario (solo creación) ─────────────────────────────────────────
const inmuebleId = ref<string | null>(inmuebleIdInicial)
const descripcion = ref('')
const tipoNovedadId = ref<number | null>(null)

/** La etiqueta lleva el propietario después de la nomenclatura porque
 * UiSelectorBuscable filtra por `etiqueta` — incluirlo ahí es lo que hace que
 * se pueda buscar el inmueble por el nombre de su dueño, sin tocar el
 * componente. Los inmuebles sin copropietario vigente registrado se quedan
 * solo con el código. */
function etiquetaInmueble(id: string, codigo: string): string {
  const propietario = cuentaStore.propietariosPorInmueble.get(id)
  return propietario ? `${codigo} — ${propietario}` : codigo
}

const opcionesInmueble = computed(() =>
  cuentaStore.inmuebles.map((i) => ({ valor: i.id, etiqueta: etiquetaInmueble(i.id, i.codigo) })),
)

// Única pregunta de esta sección: ¿la novedad aumenta o reduce lo que debe
// el inmueble? Antes había un paso de "Dirección" y otro de "Clase" (con
// Débito/Descuento/Crédito/Ajuste) que en la práctica preguntaban lo mismo
// dos veces — verificado en el motor de liquidación: ninguno de los 6
// valores de novedad_tipo_t cambia el tratamiento en el ledger, solo el
// signo (categoria siempre 'otro', origen_tipo siempre 'novedad'). Débito,
// Descuento, Crédito y Ajuste no aportaban nada que Cobro/Reembolso no
// dijeran ya, así que se retiraron del formulario — siguen existiendo como
// valores válidos del enum, para poder mostrar novedades antiguas que ya
// los usaban (ver ETIQUETA_TIPO_NOVEDAD).
const signo = ref<SignoNovedad>('cobro')
const tipo = computed<NovedadTipo>(() => TIPO_POR_SIGNO[signo.value])
const montoMagnitud = ref<number | null>(null)

// El valor se escribe en un campo de texto con separador de miles en vez de un
// <input type="number"> crudo: un monto en pesos sin agrupar ("1200000") es
// difícil de leer y fácil de equivocar en un cero. Formato es-CO — punto para
// los miles, coma decimal. `montoTexto` es lo que se ve; `montoMagnitud` sigue
// siendo el número real que consume montoFirmado.
const montoTexto = ref('')

function formatearMontoTexto(entrada: string): string {
  const limpio = entrada.replace(/[^\d,]/g, '')
  const [parteEntera = '', ...resto] = limpio.split(',')
  const enteraSinCeros = parteEntera.replace(/^0+(?=\d)/, '')
  const agrupada = enteraSinCeros.replace(/\B(?=(\d{3})+(?!\d))/g, '.')
  if (!limpio.includes(',')) return agrupada
  return `${agrupada || '0'},${resto.join('').slice(0, 2)}`
}

function montoDesdeTexto(texto: string): number | null {
  const normalizado = texto.replace(/\./g, '').replace(',', '.')
  if (normalizado === '' || normalizado === '.') return null
  const numero = Number(normalizado)
  return Number.isFinite(numero) ? numero : null
}

function onMontoInput(valor: string | number): void {
  montoTexto.value = formatearMontoTexto(String(valor))
  montoMagnitud.value = montoDesdeTexto(montoTexto.value)
}

/** El signo real con que se guarda (AD-30) — derivado, nunca escrito a mano. */
const montoFirmado = computed<number | null>(() => {
  if (montoMagnitud.value === null || montoMagnitud.value === 0) return null
  const magnitud = Math.abs(montoMagnitud.value)
  return signo.value === 'reembolso' ? -magnitud : magnitud
})

// "Inmediato" y "Programar" son excluyentes: o la novedad entra en la
// próxima liquidación que todavía esté abierta, o se elige un año/mes
// puntual. fn_aprobar_novedad exige que ya exista una fila en `periodos`
// para el año/mes de fecha_efectiva (falla con
// PERIODO_NO_ENCONTRADO_PARA_FECHA_EFECTIVA si no) — "Inmediato" evita ese
// error de raíz porque solo ofrece periodos que sabemos que existen y siguen
// 'abierto' (abierto → en_liquidacion → cerrado es de un solo sentido,
// guard_periodo_transicion). "Programar" no tiene esa garantía: sigue
// permitiendo elegir cualquier año/mes, incluido uno sin periodo creado
// todavía — el error, si aparece, sale recién al aprobar.
type ModoPeriodo = 'inmediato' | 'programado'
const modoPeriodo = ref<ModoPeriodo>('inmediato')

const proximoPeriodoAbierto = computed(() => {
  const abiertos = liquidacionStore.periodos.filter((p) => p.estado === 'abierto')
  if (abiertos.length === 0) return null
  return abiertos.reduce((min, p) =>
    p.anio < min.anio || (p.anio === min.anio && p.mes < min.mes) ? p : min,
  )
})

const hoy = new Date()
const anio = ref<number>(hoy.getFullYear())
const mes = ref<number>(hoy.getMonth() + 1)

const fechaEfectiva = computed<string | null>(() => {
  if (modoPeriodo.value === 'inmediato') {
    const p = proximoPeriodoAbierto.value
    return p ? `${p.anio}-${String(p.mes).padStart(2, '0')}-01` : null
  }
  return `${anio.value}-${String(mes.value).padStart(2, '0')}-01`
})

const repeticion = ref<RepeticionNovedad>('ninguna')
const cuotasTotales = ref<number | null>(null)
watch(repeticion, (valor) => {
  if (valor !== 'prorrateable') cuotasTotales.value = null
  else if (cuotasTotales.value === null) cuotasTotales.value = 2
})

// permanente/prorrateable exigen el concepto "Novedad" del tenant
// (novedades_recurrente_requiere_concepto).
const conceptoNovedad = computed(() =>
  conceptoStore.conceptos.find((c) => c.tipo_recurrencia === 'novedad' && c.estado !== 'archivado'),
)
const faltaConceptoNovedad = computed(
  () => repeticion.value !== 'ninguna' && !conceptoNovedad.value,
)

// ── cuenta derivada del motivo (no la elige el usuario) ─────────────────
function cuentaDeMotivo(motivoId: number | null): { nombre: string } | null {
  if (motivoId === null) return null
  const mapeo = cuentaStore.novedadTipoCuenta.find((m) => m.tipo_novedad_id === motivoId)
  if (!mapeo) return null
  return presupuestoStore.cuentas.find((c) => c.id === mapeo.presupuesto_cuenta_id) ?? null
}

const cuentaDelMotivo = computed(() => cuentaDeMotivo(tipoNovedadId.value))
const motivoNombre = computed(
  () => cuentaStore.tiposNovedad.find((t) => t.id === tipoNovedadId.value)?.nombre ?? null,
)

// ── resumen en vivo ────────────────────────────────────────────────────

const inmuebleCodigo = computed(
  () => cuentaStore.inmuebles.find((i) => i.id === inmuebleId.value)?.codigo ?? null,
)

const montoPorCuota = computed<number | null>(() => {
  if (repeticion.value !== 'prorrateable') return null
  if (montoFirmado.value === null || !cuotasTotales.value || cuotasTotales.value < 2) return null
  // Mismo reparto que fn_aprobar_novedad: round(monto/N, 2); la última cuota
  // absorbe el residual — aquí se muestra la cuota base.
  return Math.round((montoFirmado.value / cuotasTotales.value) * 100) / 100
})

const resumen = computed<string | null>(() => {
  if (!inmuebleCodigo.value || montoFirmado.value === null || fechaEfectiva.value === null) {
    return null
  }
  const quien = inmuebleCodigo.value
  const cuando = mesAnioTexto(fechaEfectiva.value)
  const verbo = montoFirmado.value < 0 ? 'se le abonarán' : 'se le cobrarán'
  const valor = formatoMoneda(Math.abs(montoFirmado.value))

  if (repeticion.value === 'prorrateable' && montoPorCuota.value !== null && cuotasTotales.value) {
    return (
      `A ${quien} ${verbo} ${cuotasTotales.value} cuotas de ` +
      `${formatoMoneda(Math.abs(montoPorCuota.value))} cada una, una por periodo, ` +
      `desde ${cuando}. Total ${valor}.`
    )
  }
  if (repeticion.value === 'permanente') {
    return `A ${quien} ${verbo} ${valor} cada periodo, desde ${cuando}, hasta que la inhabilites.`
  }
  return `A ${quien} ${verbo} ${valor} una sola vez, en ${cuando}.`
})

const puedeGuardar = computed(
  () =>
    inmuebleId.value !== null &&
    descripcion.value.trim().length > 0 &&
    montoFirmado.value !== null &&
    fechaEfectiva.value !== null &&
    !faltaConceptoNovedad.value &&
    (repeticion.value !== 'prorrateable' || (cuotasTotales.value ?? 0) > 1),
)

async function guardar(): Promise<void> {
  error.value = null
  const tenantId = tenantStore.activeTenant?.id
  if (!tenantId || !inmuebleId.value || montoFirmado.value === null || fechaEfectiva.value === null) {
    return
  }

  guardando.value = true
  try {
    await cuentaStore.crearNovedad({
      tenantId,
      inmuebleId: inmuebleId.value,
      tipo: tipo.value,
      tipoNovedadId: tipoNovedadId.value,
      // La cuenta ya no se envía: la deriva el trigger desde el motivo.
      presupuestoCuentaId: null,
      conceptoId: repeticion.value !== 'ninguna' ? (conceptoNovedad.value?.id ?? null) : null,
      monto: montoFirmado.value,
      descripcion: descripcion.value.trim(),
      fechaEfectiva: fechaEfectiva.value,
      permanente: repeticion.value === 'permanente',
      prorrateable: repeticion.value === 'prorrateable',
      cuotasTotales: repeticion.value === 'prorrateable' ? cuotasTotales.value : null,
    })
    await navigateTo(inmuebleIdInicial ? `/inmuebles/${inmuebleIdInicial}` : '/estado-cuenta/novedades')
  } catch (excepcion) {
    error.value = mensajeError(excepcion, 'No se pudo crear la novedad.')
  } finally {
    guardando.value = false
  }
}

// ── detalle: acciones sobre una novedad existente ──────────────────────
const accionEnCurso = ref(false)
const motivoRechazo = ref('')
const pidiendoRechazo = ref(false)
const pidiendoInhabilitar = ref(false)

const progresoCuotas = computed(() => {
  if (!props.novedadId) return null
  const cuotas = cuentaStore.novedadCuotas.filter((c) => c.novedad_id === props.novedadId)
  if (cuotas.length === 0) return null
  return {
    generadas: cuotas.filter((c) => c.generada_at).length,
    total: cuotas.length,
    saldo: cuotas.filter((c) => !c.generada_at).reduce((a, c) => a + Number(c.monto_cuota), 0),
  }
})

async function aprobar(): Promise<void> {
  error.value = null
  const tenantId = tenantStore.activeTenant?.id
  if (!tenantId || !props.novedadId) return

  accionEnCurso.value = true
  try {
    await cuentaStore.aprobarNovedad(props.novedadId, tenantId)
  } catch (excepcion) {
    error.value = mensajeError(excepcion, 'No se pudo aprobar la novedad.')
  } finally {
    accionEnCurso.value = false
  }
}

async function confirmarRechazo(): Promise<void> {
  const motivo = motivoRechazo.value.trim()
  const tenantId = tenantStore.activeTenant?.id
  if (!motivo || !tenantId || !props.novedadId) return
  pidiendoRechazo.value = false

  error.value = null
  accionEnCurso.value = true
  try {
    await cuentaStore.rechazarNovedad(props.novedadId, motivo, tenantId)
  } catch (excepcion) {
    error.value = mensajeError(excepcion, 'No se pudo rechazar la novedad.')
  } finally {
    accionEnCurso.value = false
  }
}

async function confirmarInhabilitar(): Promise<void> {
  const tenantId = tenantStore.activeTenant?.id
  if (!tenantId || !props.novedadId) return
  pidiendoInhabilitar.value = false

  error.value = null
  accionEnCurso.value = true
  try {
    await cuentaStore.inhabilitarNovedad(props.novedadId, tenantId)
  } catch (excepcion) {
    error.value = mensajeError(excepcion, 'No se pudo inhabilitar la novedad.')
  } finally {
    accionEnCurso.value = false
  }
}

/** Texto del detalle, equivalente al resumen del formulario pero leído desde
 * la fila ya guardada (no de los refs del formulario, que en este modo no se
 * usan). */
const resumenGuardado = computed<string | null>(() => {
  const n = novedad.value
  if (!n) return null
  const quien = cuentaStore.inmuebles.find((i) => i.id === n.inmueble_id)?.codigo ?? '—'
  const cuando = mesAnioTexto(n.fecha_efectiva)
  const monto = Number(n.monto)
  const verbo = monto < 0 ? 'se le abonaron' : 'se le cobran'
  const valor = formatoMoneda(Math.abs(monto))

  if (n.prorrateable && n.cuotas_totales) {
    const base = Math.round((monto / n.cuotas_totales) * 100) / 100
    return (
      `A ${quien} ${verbo} ${n.cuotas_totales} cuotas de ${formatoMoneda(Math.abs(base))} ` +
      `cada una, una por periodo, desde ${cuando}. Total ${valor}.`
    )
  }
  if (n.permanente) {
    return n.inhabilitada_at
      ? `A ${quien} se le cobraba ${valor} cada periodo desde ${cuando}. Ya está inhabilitada: no genera cargos nuevos.`
      : `A ${quien} ${verbo} ${valor} cada periodo, desde ${cuando}, hasta que se inhabilite.`
  }
  return `A ${quien} ${verbo} ${valor} una sola vez, en ${cuando}.`
})
</script>

<template>
  <div class="space-y-6">
    <!-- ── encabezado ──────────────────────────────────────────────── -->
    <div class="flex items-start justify-between gap-4 flex-wrap">
      <div>
        <NuxtLink
          to="/estado-cuenta/novedades"
          class="text-sm text-primary hover:underline inline-flex items-center gap-1 mb-2"
        >
          <UIcon name="i-lucide-arrow-left" class="size-3.5" />
          Novedades
        </NuxtLink>
        <div class="flex items-center gap-3 flex-wrap">
          <h1 class="text-xl font-semibold">
            {{ soloLectura ? (novedad?.descripcion ?? 'Novedad') : 'Nueva novedad' }}
          </h1>
          <UBadge
            v-if="novedad"
            :color="COLOR_ESTADO_NOVEDAD[novedad.estado] ?? 'neutral'"
            variant="subtle"
          >
            {{ ETIQUETA_ESTADO_NOVEDAD[novedad.estado] ?? novedad.estado }}
          </UBadge>
        </div>
        <p v-if="!soloLectura" class="text-sm text-gray-500 mt-1">
          Queda pendiente de aprobación — no genera ningún cargo hasta que alguien la apruebe.
        </p>
        <p v-else-if="novedad" class="text-sm text-gray-500 mt-1">
          {{ DESCRIPCION_ESTADO_NOVEDAD[novedad.estado] ?? '' }}
        </p>
      </div>

      <div v-if="!soloLectura" class="flex gap-2">
        <UButton
          variant="ghost"
          :to="inmuebleIdInicial ? `/inmuebles/${inmuebleIdInicial}` : '/estado-cuenta/novedades'"
        >
          Cancelar
        </UButton>
        <UButton :loading="guardando" :disabled="!puedeGuardar" @click="guardar">
          Crear novedad
        </UButton>
      </div>
    </div>

    <div v-if="soloLectura && novedad" class="flex gap-2 flex-wrap">
      <template v-if="novedad.estado === 'pendiente'">
        <UButton :loading="accionEnCurso" @click="aprobar">Aprobar</UButton>
        <UButton variant="ghost" color="error" @click="pidiendoRechazo = true">Rechazar</UButton>
      </template>
      <UButton
        v-else-if="novedad.estado === 'aprobada' && novedad.permanente && !novedad.inhabilitada_at"
        variant="ghost"
        color="error"
        :loading="accionEnCurso"
        @click="pidiendoInhabilitar = true"
      >
        Inhabilitar
      </UButton>
    </div>

    <UAlert v-if="error" color="error" variant="soft" :title="error" />

    <p v-if="cargando" class="text-sm text-gray-500">Cargando…</p>
    <p v-else-if="soloLectura && !novedad" class="text-sm text-gray-500">
      No se encontró esta novedad.
    </p>

    <div v-else class="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_320px] gap-6 items-start">
      <!-- ══ creación ══════════════════════════════════════════════ -->
      <div v-if="!soloLectura" class="space-y-4">
        <!-- 1. Qué pasó -->
        <section class="rounded-lg border border-gray-200 dark:border-gray-800">
          <header
            class="px-4 py-2.5 border-b border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-900/40"
          >
            <h3 class="text-xs font-semibold uppercase tracking-wider text-gray-500">
              1 · Qué pasó
            </h3>
          </header>
          <div class="p-4 space-y-4">
            <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <UFormField label="Inmueble" name="inmueble">
                <UiSelectorBuscable
                  v-model="inmuebleId"
                  :opciones="opcionesInmueble"
                  placeholder="— Elegir —"
                />
              </UFormField>
              <UFormField name="descripcion">
                <template #label>
                  <span class="inline-flex items-baseline gap-1.5">
                    <span>Descripción</span>
                    <span class="text-xs font-normal text-gray-400">
                      — visible al propietario en estado de cuenta
                    </span>
                  </span>
                </template>
                <UInput
                  v-model="descripcion"
                  placeholder="Ej. Sanción por ruido, asamblea del 12 de agosto"
                  class="w-full"
                />
              </UFormField>
            </div>
            <UFormField label="Motivo" name="motivo">
              <select
                v-model="tipoNovedadId"
                class="w-full rounded-md border border-gray-300 dark:border-gray-700 bg-transparent px-2 py-1.5"
              >
                <option :value="null">— Sin clasificar —</option>
                <option v-for="t in cuentaStore.tiposNovedad" :key="t.id" :value="t.id">
                  {{ t.nombre }}
                </option>
              </select>
              <template #help>
                <span v-if="cuentaDelMotivo">
                  Se registrará bajo <strong>{{ cuentaDelMotivo.nombre }}</strong>.
                </span>
                <span v-else-if="tipoNovedadId !== null">
                  Este motivo todavía no tiene cuenta asignada — el cobro no se reflejará en la
                  ejecución del presupuesto. Se configura en Ajustes › Motivos de novedad.
                </span>
                <span v-else>La cuenta contable se asigna sola a partir del motivo.</span>
              </template>
            </UFormField>
          </div>
        </section>

        <!-- 2. Cuánto -->
        <section class="rounded-lg border border-gray-200 dark:border-gray-800">
          <header
            class="px-4 py-2.5 border-b border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-900/40"
          >
            <h3 class="text-xs font-semibold uppercase tracking-wider text-gray-500">2 · Cuánto</h3>
          </header>
          <div class="p-4 space-y-4">
            <div class="flex flex-wrap items-start gap-6">
              <div>
                <p class="text-sm font-medium mb-1.5">Tipo</p>
                <div
                  class="grid grid-flow-col auto-cols-fr gap-0.5 p-0.5 rounded-md bg-gray-100 dark:bg-gray-800 text-sm max-w-xs"
                >
                  <button
                    v-for="opcion in (['cobro', 'reembolso'] as SignoNovedad[])"
                    :key="opcion"
                    type="button"
                    class="px-3 py-1.5 rounded transition-colors"
                    :aria-pressed="signo === opcion"
                    :class="
                      signo === opcion
                        ? 'bg-white dark:bg-gray-900 shadow-sm font-medium'
                        : 'text-gray-500 hover:text-gray-700 dark:hover:text-gray-300'
                    "
                    @click="signo = opcion"
                  >
                    {{ ETIQUETA_SIGNO[opcion] }}
                  </button>
                </div>
                <p class="text-xs text-gray-500 mt-1.5 max-w-[220px]">{{ DESCRIPCION_SIGNO[signo] }}</p>
              </div>

              <UFormField label="Valor" name="valor" class="w-40">
                <UInput
                  :model-value="montoTexto"
                  type="text"
                  inputmode="decimal"
                  placeholder="0"
                  class="w-full"
                  @update:model-value="onMontoInput"
                >
                  <template #leading>
                    <span class="text-gray-400 text-sm">$</span>
                  </template>
                </UInput>
              </UFormField>
            </div>
          </div>
        </section>

        <!-- 3. Cuándo y cada cuánto -->
        <section class="rounded-lg border border-gray-200 dark:border-gray-800">
          <header
            class="px-4 py-2.5 border-b border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-900/40"
          >
            <h3 class="text-xs font-semibold uppercase tracking-wider text-gray-500">
              3 · Cuándo y cada cuánto
            </h3>
          </header>
          <div class="p-4 space-y-4">
            <div class="flex flex-wrap items-start gap-4">
              <div>
                <p class="text-sm font-medium mb-1.5">Frecuencia de cobro</p>
                <div
                  class="grid grid-flow-col auto-cols-fr gap-0.5 p-0.5 rounded-md bg-gray-100 dark:bg-gray-800 text-sm"
                >
                  <button
                    v-for="opcion in (['ninguna', 'permanente', 'prorrateable'] as RepeticionNovedad[])"
                    :key="opcion"
                    type="button"
                    class="px-3 py-1.5 rounded transition-colors"
                    :aria-pressed="repeticion === opcion"
                    :class="
                      repeticion === opcion
                        ? 'bg-white dark:bg-gray-900 shadow-sm font-medium'
                        : 'text-gray-500 hover:text-gray-700 dark:hover:text-gray-300'
                    "
                    @click="repeticion = opcion"
                  >
                    {{ ETIQUETA_REPETICION[opcion] }}
                  </button>
                </div>
                <p class="text-xs text-gray-500 mt-1.5 max-w-[220px]">
                  {{ DESCRIPCION_REPETICION[repeticion] }}
                </p>
              </div>

              <div v-if="repeticion === 'prorrateable'" class="flex flex-wrap gap-3">
                <UFormField label="Cuotas" name="cuotas" class="w-28">
                  <UInput v-model.number="cuotasTotales" type="number" min="2" step="1" class="w-full" />
                </UFormField>
                <UFormField label="Valor de la cuota" name="valor_cuota" class="w-32">
                  <UInput
                    :model-value="montoPorCuota !== null ? formatoMoneda(Math.abs(montoPorCuota)) : '—'"
                    disabled
                    class="w-full"
                  />
                </UFormField>
              </div>
            </div>

            <div>
              <p class="text-sm font-medium mb-1.5">Periodo</p>
              <div class="flex flex-wrap items-start gap-4">
                <div
                  class="grid grid-flow-col auto-cols-fr gap-0.5 p-0.5 rounded-md bg-gray-100 dark:bg-gray-800 text-sm max-w-xs"
                >
                  <button
                    v-for="opcion in (['inmediato', 'programado'] as ModoPeriodo[])"
                    :key="opcion"
                    type="button"
                    class="px-3 py-1.5 rounded transition-colors"
                    :aria-pressed="modoPeriodo === opcion"
                    :class="
                      modoPeriodo === opcion
                        ? 'bg-white dark:bg-gray-900 shadow-sm font-medium'
                        : 'text-gray-500 hover:text-gray-700 dark:hover:text-gray-300'
                    "
                    @click="modoPeriodo = opcion"
                  >
                    {{ opcion === 'inmediato' ? 'Inmediato' : 'Programar' }}
                  </button>
                </div>

                <div v-if="modoPeriodo === 'programado'" class="w-36 shrink-0">
                  <UiSelectorMesAnio
                    :anio="anio"
                    :mes="mes"
                    placeholder="Seleccionar mes"
                    @update:anio="anio = $event"
                    @update:mes="mes = $event"
                  />
                </div>
              </div>

              <p v-if="modoPeriodo === 'inmediato' && proximoPeriodoAbierto" class="text-xs text-gray-500 mt-1.5">
                Se aplicará en <strong>{{ mesAnioTexto(fechaEfectiva!) }}</strong> — la próxima
                liquidación que sigue abierta.
              </p>
              <p
                v-else-if="modoPeriodo === 'inmediato'"
                class="flex gap-2 p-3 mt-1.5 text-xs leading-relaxed rounded-md text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/30 max-w-sm"
              >
                <UIcon name="i-lucide-triangle-alert" class="size-4 shrink-0 mt-px" />
                <span>No hay ningún periodo abierto todavía — usa «Programar» para elegir uno.</span>
              </p>
              <p v-else class="text-xs text-gray-500 mt-1.5 max-w-sm">
                La novedad se aplica sobre el periodo de ese mes; el día exacto no interviene. Si
                todavía no existe un periodo creado para ese mes, la aprobación fallará hasta que
                se cree.
              </p>
            </div>

            <p
              v-if="faltaConceptoNovedad"
              class="flex gap-2 p-3 text-xs leading-relaxed rounded-md text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/30"
            >
              <UIcon name="i-lucide-triangle-alert" class="size-4 shrink-0 mt-px" />
              <span>
                Para repetir una novedad hace falta el concepto «Novedad» de la copropiedad, y no
                hay ninguno activo. Créalo en Conceptos (Tipo = Novedad) o usa «Única vez».
              </span>
            </p>
          </div>
        </section>
      </div>

      <!-- ══ detalle ═══════════════════════════════════════════════ -->
      <div v-else-if="novedad" class="space-y-4">
        <section class="rounded-lg border border-gray-200 dark:border-gray-800">
          <header
            class="px-4 py-2.5 border-b border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-900/40"
          >
            <h3 class="text-xs font-semibold uppercase tracking-wider text-gray-500">Detalle</h3>
          </header>
          <dl class="p-4 grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-3 text-sm">
            <div>
              <dt class="text-gray-500 text-xs">Inmueble</dt>
              <dd>
                {{
                  etiquetaInmueble(
                    novedad.inmueble_id,
                    cuentaStore.inmuebles.find((i) => i.id === novedad!.inmueble_id)?.codigo ?? '—',
                  )
                }}
              </dd>
            </div>
            <div>
              <dt class="text-gray-500 text-xs">Periodo</dt>
              <dd>{{ mesAnioTexto(novedad.fecha_efectiva) }}</dd>
            </div>
            <div>
              <dt class="text-gray-500 text-xs">Monto</dt>
              <dd
                class="tabular-nums"
                :class="Number(novedad.monto) < 0 ? 'text-green-600 dark:text-green-500' : ''"
              >
                {{ formatoMoneda(novedad.monto) }}
              </dd>
            </div>
            <div>
              <dt class="text-gray-500 text-xs">Clase</dt>
              <dd>
                {{ ETIQUETA_TIPO_NOVEDAD[novedad.tipo as NovedadTipo] ?? novedad.tipo }}
                <span class="text-gray-500">
                  — {{ DESCRIPCION_TIPO_NOVEDAD[novedad.tipo as NovedadTipo] ?? '' }}
                </span>
              </dd>
            </div>
            <div>
              <dt class="text-gray-500 text-xs">Motivo</dt>
              <dd>
                {{
                  novedad.tipo_novedad_id
                    ? (cuentaStore.tiposNovedad.find((t) => t.id === novedad!.tipo_novedad_id)
                        ?.nombre ?? '—')
                    : 'Sin clasificar'
                }}
              </dd>
            </div>
            <div>
              <dt class="text-gray-500 text-xs">Cuenta de ingreso</dt>
              <dd>
                {{
                  novedad.presupuesto_cuenta_id
                    ? (presupuestoStore.cuentas.find((c) => c.id === novedad!.presupuesto_cuenta_id)
                        ?.nombre ?? '—')
                    : 'Sin asignar'
                }}
              </dd>
            </div>
            <div>
              <dt class="text-gray-500 text-xs">Repetición</dt>
              <dd>
                <template v-if="novedad.permanente">
                  {{ ETIQUETA_REPETICION.permanente
                  }}<template v-if="novedad.inhabilitada_at"> (inhabilitada)</template>
                </template>
                <template v-else-if="novedad.prorrateable">
                  {{ ETIQUETA_REPETICION.prorrateable }} — {{ novedad.cuotas_totales }} cuotas
                </template>
                <template v-else>{{ ETIQUETA_REPETICION.ninguna }}</template>
              </dd>
            </div>
            <div v-if="progresoCuotas">
              <dt class="text-gray-500 text-xs">Cuotas generadas</dt>
              <dd>
                {{ progresoCuotas.generadas }} de {{ progresoCuotas.total }} — saldo
                {{ formatoMoneda(progresoCuotas.saldo) }}
              </dd>
            </div>
          </dl>
        </section>

        <p class="text-xs text-gray-500">
          Una novedad no se puede modificar después de creada: queda como registro del hecho y solo
          cambia de estado al aprobarse, rechazarse o inhabilitarse. Si hay un error, recházala y
          crea una nueva.
        </p>
      </div>

      <!-- ══ resumen (ambos modos) ═════════════════════════════════ -->
      <aside class="lg:sticky lg:top-4 space-y-4">
        <div class="rounded-lg border border-primary/40 overflow-hidden">
          <header class="px-4 py-2.5 border-b border-primary/40 bg-primary/5">
            <h3 class="text-xs font-semibold uppercase tracking-wider text-primary">
              {{ soloLectura ? 'Qué pasó' : 'Qué va a pasar' }}
            </h3>
          </header>
          <p v-if="soloLectura && resumenGuardado" class="p-4 text-sm leading-relaxed">
            {{ resumenGuardado }}
          </p>
          <p v-else-if="resumen" class="p-4 text-sm leading-relaxed">{{ resumen }}</p>
          <p v-else class="p-4 text-sm text-gray-500 leading-relaxed">
            Elige el inmueble y el valor para ver aquí el efecto exacto.
          </p>

          <p
            v-if="!soloLectura && resumen && motivoNombre"
            class="px-4 py-3 text-xs border-t border-gray-200 dark:border-gray-800 text-gray-500"
          >
            Motivo: {{ motivoNombre
            }}<template v-if="cuentaDelMotivo"> · cuenta {{ cuentaDelMotivo.nombre }}</template>
          </p>
        </div>
      </aside>
    </div>

    <!-- ── confirmaciones del detalle ──────────────────────────────── -->
    <UModal
      :open="pidiendoRechazo"
      title="¿Rechazar esta novedad?"
      @update:open="(abierto) => { if (!abierto) pidiendoRechazo = false }"
    >
      <template #body>
        <div v-if="novedad" class="space-y-3 text-sm">
          <p>
            Vas a rechazar <strong>{{ novedad.descripcion }}</strong> por
            {{ formatoMoneda(novedad.monto) }}.
          </p>
          <p class="text-gray-500">
            No se generará ningún cargo. El rechazo queda registrado con su motivo y no se puede
            deshacer — si hiciera falta, habría que crear la novedad otra vez.
          </p>
          <UFormField label="Motivo del rechazo" name="motivo">
            <UInput
              v-model="motivoRechazo"
              placeholder="Ej. El valor no corresponde al acta"
              class="w-full"
            />
          </UFormField>
        </div>
      </template>
      <template #footer>
        <div class="flex justify-end gap-2">
          <UButton variant="ghost" @click="pidiendoRechazo = false">Cancelar</UButton>
          <UButton
            color="error"
            :disabled="!motivoRechazo.trim()"
            :loading="accionEnCurso"
            @click="confirmarRechazo"
          >
            Rechazar
          </UButton>
        </div>
      </template>
    </UModal>

    <UModal
      :open="pidiendoInhabilitar"
      title="¿Inhabilitar esta novedad permanente?"
      @update:open="(abierto) => { if (!abierto) pidiendoInhabilitar = false }"
    >
      <template #body>
        <div v-if="novedad" class="space-y-2 text-sm">
          <p>
            Vas a inhabilitar <strong>{{ novedad.descripcion }}</strong>, que hoy se cobra
            {{ formatoMoneda(novedad.monto) }} cada periodo.
          </p>
          <p class="text-gray-500">
            Deja de generar cargos desde el próximo periodo. Los cargos ya generados no se tocan.
            No se puede volver a activar — si vuelve a hacer falta, se crea una novedad nueva.
          </p>
        </div>
      </template>
      <template #footer>
        <div class="flex justify-end gap-2">
          <UButton variant="ghost" @click="pidiendoInhabilitar = false">Cancelar</UButton>
          <UButton color="error" :loading="accionEnCurso" @click="confirmarInhabilitar">
            Inhabilitar
          </UButton>
        </div>
      </template>
    </UModal>
  </div>
</template>
