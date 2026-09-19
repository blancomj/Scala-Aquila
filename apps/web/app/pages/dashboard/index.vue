<script setup lang="ts">
// «Puente de mando» — pantalla principal del administrador
// (Casos de uso/Dashboard y Mis asuntos/PROMPT_PUENTE_DE_MANDO.md).
//
// Responde tres preguntas en orden: en qué punto del ciclo estoy → qué me
// impide cerrar → qué espera mi decisión, y recién después el dinero.
// Reemplaza la grilla de seis tarjetas iguales que tenía esta pantalla.
//
// Todo lo que consume cartera/presupuesto/liquidación/conceptos/novedades/
// conciliación/comprobantes se carga con onMounted + watch sobre refs de
// página, NO useAsyncData — es el mismo patrón que ya usaba el "resumen
// gerencial" de la versión anterior de este archivo para evitar el
// mismatch de hidratación de mutar una ref de página como efecto
// secundario de useAsyncData (feedback_useasyncdata_ref_pagina_no_hidrata).
import { calcularIndicadoresGestion } from '@aquila/liquidation-engine/cartera-indicadores'
import { obtenerRawIndicadoresGestion } from '@aquila/liquidation-engine/cartera-indicadores-supabase'
import { money } from '@aquila/financial-kernel'
import type { Database } from '@aquila/shared'
import { MESES, ESTADO_UI } from '~/config/liquidacion-ui'
import type { FilaRecaudoForma } from '~/components/dashboard/DashboardRecaudoFormaPago.vue'
import type { PasoCiclo, EstadoPaso } from '~/components/dashboard/DashboardCicloPeriodo.vue'
import type { DashboardCarteraDTO, PuntoEvolucionDTO, RecaudoDTO } from '~/stores/cartera'
import { diasDesdeHoy, hoyLocal, relativoCorto } from '~/utils/fecha-relativa'

definePageMeta({ layout: 'default', middleware: ['tenant'] })

type PeriodoRow = Database['public']['Tables']['periodos']['Row']
// Pick, no el Row completo: `liquidaciones` trae `snapshot`/`avisos_aceptados`
// (jsonb, tipo Json recursivo) que dispara "Type instantiation is excessively
// deep" en vue-tsc en cuanto se compara `.estado` dentro de un Map/indexOf —
// mismo problema ya documentado en stores/certificaciones.ts y
// stores/gobiernoReuniones.ts. Esta pantalla no necesita el snapshot completo.
type LiquidacionResumen = Pick<
  Database['public']['Tables']['liquidaciones']['Row'],
  'id' | 'periodo_id' | 'estado' | 'simulada_at'
>

const MONEDA = 'COP'

const authStore = useAuthStore()
const tenantStore = useTenantStore()
const onboardingStore = useOnboardingStore()
const carteraStore = useCarteraStore()
const presupuestoStore = usePresupuestoStore()
const liquidacionStore = useLiquidacionStore()
const asuntosStore = useAsuntosStore()
const conceptoStore = useConceptoStore()
const cuentaStore = useCuentaCorrienteStore()
const comprobantesStore = useComprobantesStore()
const gobiernoReunionesStore = useGobiernoReunionesStore()
const fondosStore = useFondosStore()
const auditoriaStore = useAuditoriaStore()

// ── Arranque de la página (igual que la versión anterior) ────────────────
await useAsyncData('perfil', () => authStore.cargarPerfil())
await useAsyncData('memberships', () => tenantStore.cargarMemberships())
await useAsyncData(
  'onboarding-checklist',
  async () => {
    const tenantId = tenantStore.activeTenant?.id
    if (tenantId) await onboardingStore.cargarEstado(tenantId)
    return null
  },
  { watch: [() => tenantStore.activeTenant?.id] },
)

const puedeActuar = computed(() => tenantStore.puede('data:create'))
const miId = computed(() => authStore.profile?.id ?? null)

// ── Reloj compartido de la pantalla (§6.7 casos 2 y 6) ────────────────────
// Un solo "ahora" reactivo, no `new Date()` disperso: el sello de frescura y
// los relativos ("quedan N días", "vence en...") se recalculan juntos cada
// 30s, sin sondear el servidor — solo reevalúan cálculos ya hechos con datos
// ya cargados.
const ahora = ref(Date.now())
let temporizadorReloj: ReturnType<typeof setInterval> | undefined

// ── Estado por bloque (cada fuente marca su propio error, §7.2) ─────────
const cartera = ref<DashboardCarteraDTO | null>(null)
const carteraError = ref(false)
const evolucion = ref<PuntoEvolucionDTO[] | null>(null)
const evolucionError = ref(false)
const recaudoMes = ref<RecaudoDTO | null>(null)
const recaudoMesError = ref(false)
const recaudoPorForma = ref<FilaRecaudoForma[] | null>(null)
const recaudoFormaError = ref(false)
const gestionCalc = ref<{ efectividad: number | null; promesas: number | null; acuerdos: number | null; ejecutadas: number; efectivas: number; promesasVencidas: number; promesasCumplidas: number; acuerdosTerminados: number; acuerdosCumplidos: number; recuperado: string } | null>(null)
const gestionError = ref(false)

const periodos = ref<PeriodoRow[]>([])
const liquidaciones = ref<LiquidacionResumen[]>([])
const cicloError = ref(false)

const presupuestoVigente = ref<boolean | null>(null)
const presupuestoError = ref(false)
const conceptosActivos = ref<number | null>(null)
const conceptosError = ref(false)

const novedadesPendientes = ref<number | null>(null)
const novedadesError = ref(false)
const conciliacionResumen = ref<{ total: number; certificadas: number; pendientes: number } | null>(null)
const conciliacionError = ref(false)
const comprobantesPendientes = ref<number | null>(null)
const comprobantesError = ref(false)

const accesosHoy = ref<number | null>(null)
const accesosError = ref(false)
const paquetesSinEntregar = ref<number | null>(null)
const paquetesError = ref(false)
const proximaReunion = ref<{ fechaHora: string; nombre: string } | null>(null)
const reunionError = ref(false)
const saldoFondos = ref<number | null>(null)
const fondosError = ref(false)
const resumenAuditoria = ref<{ hallazgosAbiertos: number; accionesVencidas: number } | null>(null)
const auditoriaError = ref(false)

const cargando = ref(true)
const ultimaCargaMs = ref<number | null>(null)

// ── Derivaciones de periodo/liquidación — misma prioridad que
//    pages/liquidacion/index.vue (liquidacionPorPeriodo), con 'fallida'
//    agregada: ese archivo no la necesita para elegir qué periodo abrir por
//    defecto, pero el puente de mando sí necesita distinguir "falló" de
//    "sin liquidar" en el chip de estado.
const liquidacionPorPeriodo = computed(() => {
  const mapa = new Map<string, LiquidacionResumen>()
  const prioridad = ['aplicada', 'pendiente_aprobacion', 'pre_liquidada', 'fallida', 'rechazada']
  for (const l of liquidaciones.value) {
    if (!prioridad.includes(l.estado)) continue
    const previa = mapa.get(l.periodo_id)
    if (!previa || prioridad.indexOf(l.estado) < prioridad.indexOf(previa.estado)) mapa.set(l.periodo_id, l)
  }
  return mapa
})
const periodoActual = computed<PeriodoRow | null>(() => {
  if (periodos.value.length === 0) return null
  const pendiente = periodos.value.find((p) => liquidacionPorPeriodo.value.get(p.id)?.estado !== 'aplicada')
  return pendiente ?? periodos.value[0] ?? null
})
const liquidacionActual = computed<LiquidacionResumen | null>(() =>
  periodoActual.value ? (liquidacionPorPeriodo.value.get(periodoActual.value.id) ?? null) : null,
)

function formatoFecha(iso: string): string {
  return new Date(iso).toLocaleDateString('es-CO', { day: 'numeric', month: 'long' })
}
function mesSiguienteDe(periodo: PeriodoRow): string {
  const indice = periodo.mes === 12 ? 0 : periodo.mes
  return MESES[indice] ?? ''
}

interface SituacionPeriodo {
  chipTexto: string
  chipColor: 'warning' | 'neutral' | 'success' | 'error'
  frase: string
  accionTexto: string | null
  accionEnlace: string | null
  pasoActualId: string | null
}

const situacionPeriodo = computed<SituacionPeriodo | null>(() => {
  const periodo = periodoActual.value
  if (!periodo) return null
  void ahora.value // dependencia reactiva para "quedan N días"
  const liq = liquidacionActual.value
  const mesNombre = MESES[periodo.mes - 1] ?? ''
  const etiquetaMes = `${mesNombre} ${String(periodo.anio)}`

  if (periodo.estado === 'bloqueado') {
    return {
      chipTexto: 'Bloqueado',
      chipColor: 'error',
      frase: `${etiquetaMes} está bloqueado. No se puede seguir con el cierre hasta resolverlo.`,
      accionTexto: null,
      accionEnlace: null,
      pasoActualId: 'cierre',
    }
  }
  if (liq && (liq.estado === 'pre_liquidada' || liq.estado === 'pendiente_aprobacion')) {
    return {
      chipTexto: 'Liquidado, sin aplicar',
      chipColor: 'warning',
      frase: `La liquidación corrió el ${formatoFecha(liq.simulada_at)} y quedó esperando. Hasta que la apliques, los cargos no llegan a la cartera.`,
      accionTexto: 'Aplicar la liquidación',
      accionEnlace: '/liquidacion',
      pasoActualId: 'aplicacion',
    }
  }
  if (liq && liq.estado === 'fallida') {
    return {
      chipTexto: 'Falló',
      chipColor: 'error',
      frase: `La corrida del ${formatoFecha(liq.simulada_at)} falló. Revisa los diagnósticos antes de reintentar.`,
      accionTexto: 'Ver diagnósticos',
      accionEnlace: '/liquidacion',
      pasoActualId: 'liquidacion',
    }
  }
  if (liq && liq.estado === 'aplicada' && periodo.estado === 'abierto') {
    const dias = periodo.fecha_vencimiento ? diasDesdeHoy(periodo.fecha_vencimiento, new Date(ahora.value)) : null
    return {
      chipTexto: 'En recaudo',
      chipColor: 'success',
      frase:
        dias !== null && dias >= 0
          ? `Los cargos están en cartera. Quedan ${String(dias)} día${dias === 1 ? '' : 's'} para cerrar ${mesNombre}.`
          : `Los cargos de ${etiquetaMes} están en cartera.`,
      accionTexto: 'Ver el recaudo',
      accionEnlace: '/cartera',
      pasoActualId: 'recaudo',
    }
  }
  if (periodo.estado === 'cerrado') {
    return {
      chipTexto: 'Cerrado',
      chipColor: 'success',
      frase: `${etiquetaMes} quedó cerrado${periodo.cerrado_at ? ` el ${formatoFecha(periodo.cerrado_at)}` : ''}.`,
      accionTexto: `Abrir ${mesSiguienteDe(periodo)}`,
      accionEnlace: '/liquidacion',
      // El periodo que se muestra ya cerró — el paso "actual" pasa a ser el
      // presupuesto del periodo SIGUIENTE, no queda huérfano (confirmado con
      // el usuario 2026-09-19).
      pasoActualId: 'presupuesto',
    }
  }
  return {
    chipTexto: 'Abierto',
    chipColor: 'neutral',
    frase: `Todavía no has corrido la liquidación de ${etiquetaMes}.`,
    accionTexto: 'Simular la liquidación',
    accionEnlace: '/liquidacion',
    pasoActualId: 'liquidacion',
  }
})

// ── §4.2 — la tira del ciclo ───────────────────────────────────────────
const pasosCiclo = computed<PasoCiclo[]>(() => {
  const periodo = periodoActual.value
  const liq = liquidacionActual.value
  const pasoActualId = situacionPeriodo.value?.pasoActualId ?? null

  function estado(id: string, hecho: boolean, bloqueado = false): EstadoPaso {
    if (bloqueado) return 'bloqueado'
    if (id === pasoActualId) return 'actual'
    return hecho ? 'hecho' : 'pendiente'
  }

  const presupuestoHecho = presupuestoVigente.value === true
  const conceptosHecho = (conceptosActivos.value ?? 0) > 0
  const liquidacionBloqueada = liq?.estado === 'fallida'
  const liquidacionHecha = liq !== null && !liquidacionBloqueada
  const aplicacionHecha = liq?.estado === 'aplicada'
  const recaudoHecho = aplicacionHecha && periodo?.estado === 'cerrado'
  const conciliacionHecha =
    conciliacionResumen.value !== null &&
    conciliacionResumen.value.total > 0 &&
    conciliacionResumen.value.certificadas === conciliacionResumen.value.total
  const cierreHecho = periodo?.estado === 'cerrado'
  const cierreBloqueado = periodo?.estado === 'bloqueado'

  return [
    {
      id: 'presupuesto',
      nombre: 'Presupuesto',
      estado: estado('presupuesto', presupuestoHecho),
      detalle: presupuestoError.value ? '—' : presupuestoHecho ? 'Vigente' : 'Sin presupuesto vigente',
    },
    {
      id: 'conceptos',
      nombre: 'Conceptos',
      estado: estado('conceptos', conceptosHecho),
      detalle: conceptosError.value ? '—' : conceptosHecho ? `${String(conceptosActivos.value)} activos` : 'Sin conceptos activos',
    },
    {
      id: 'liquidacion',
      nombre: 'Liquidación',
      estado: estado('liquidacion', liquidacionHecha, liquidacionBloqueada),
      detalle: liq ? (ESTADO_UI[liq.estado]?.etiqueta ?? liq.estado) : 'Sin simular',
    },
    {
      id: 'aplicacion',
      nombre: 'Aplicación',
      estado: estado('aplicacion', aplicacionHecha),
      detalle: aplicacionHecha ? 'Aplicada' : 'Pendiente',
    },
    {
      id: 'recaudo',
      nombre: 'Recaudo',
      estado: estado('recaudo', recaudoHecho),
      detalle: aplicacionHecha ? 'En curso' : 'Pendiente',
    },
    {
      id: 'conciliacion',
      nombre: 'Conciliación',
      estado: estado('conciliacion', conciliacionHecha),
      detalle: conciliacionError.value
        ? '—'
        : conciliacionResumen.value
          ? `${String(conciliacionResumen.value.certificadas)} de ${String(conciliacionResumen.value.total)} certificadas`
          : 'Sin iniciar',
    },
    {
      id: 'cierre',
      nombre: 'Cierre',
      estado: estado('cierre', cierreHecho, cierreBloqueado),
      detalle: cierreHecho ? 'Cerrado' : cierreBloqueado ? 'Bloqueado' : 'Pendiente',
    },
  ]
})

// ── §4.3 — lo que bloquea el cierre ───────────────────────────────────
interface Bloqueo {
  id: string
  severidad: 'error' | 'warning'
  titulo: string
  consecuencia: string
  metadato: string
  accionTexto: string
  accionEnlace: string
}

const bloqueos = computed<Bloqueo[]>(() => {
  const lista: Bloqueo[] = []
  if (periodoActual.value?.estado === 'bloqueado') {
    lista.push({
      id: 'periodo-bloqueado',
      severidad: 'error',
      titulo: 'El periodo está bloqueado',
      consecuencia: 'Ninguna operación de cierre puede continuar mientras el periodo esté bloqueado.',
      metadato: 'Periodo',
      accionTexto: 'Ver periodo',
      accionEnlace: '/liquidacion',
    })
  }
  const nNovedades = novedadesPendientes.value ?? 0
  if (nNovedades > 0) {
    lista.push({
      id: 'novedades',
      severidad: 'warning',
      titulo: `${String(nNovedades)} novedad${nNovedades === 1 ? '' : 'es'} sin aprobar`,
      consecuencia: 'Una novedad pendiente no se refleja en la cuenta corriente del inmueble hasta que se apruebe o se rechace.',
      metadato: 'Cuenta corriente',
      accionTexto: 'Revisar novedades',
      accionEnlace: '/estado-cuenta/novedades',
    })
  }
  const nConciliacion = conciliacionResumen.value?.pendientes ?? 0
  if (nConciliacion > 0) {
    lista.push({
      id: 'conciliacion',
      severidad: 'warning',
      titulo: `${String(nConciliacion)} conciliación${nConciliacion === 1 ? '' : 'es'} bancaria${nConciliacion === 1 ? '' : 's'} sin certificar`,
      consecuencia: 'El cierre contable del periodo exige la conciliación banco-libro certificada.',
      metadato: 'Conciliación bancaria',
      accionTexto: 'Certificar conciliación',
      accionEnlace: '/finanzas/conciliacion-bancaria',
    })
  }
  const nComprobantes = comprobantesPendientes.value ?? 0
  if (nComprobantes > 0) {
    lista.push({
      id: 'comprobantes',
      severidad: 'warning',
      titulo: `${String(nComprobantes)} comprobante${nComprobantes === 1 ? '' : 's'} sin contabilizar`,
      consecuencia: 'Un comprobante en borrador no afecta los saldos contables hasta que se contabilice.',
      metadato: 'Contabilidad',
      accionTexto: 'Ver comprobantes',
      accionEnlace: '/contabilidad/comprobantes',
    })
  }
  return lista
})
// Si alguna de las fuentes propias de bloqueo falló, la lista de arriba
// puede estar incompleta — nunca hay que dejar entender "nada bloquea el
// cierre" cuando en realidad no se pudo terminar de verificar (§7.2: el
// error es por fuente, pero acá varias fuentes alimentan la MISMA promesa
// de "esto es todo lo que bloquea", así que la promesa entera queda en duda).
const bloqueosIncompletos = computed(() => novedadesError.value || comprobantesError.value)

// ── §4.4 — el dinero, en palabras ─────────────────────────────────────
// Proporción recaudado/pendiente/vencido: sin un `pctDelTotal` de servidor
// para esta combinación específica (a diferencia de los tramos de figura 1,
// que sí lo traen), hay que derivarla en el cliente. La SUMA y la DIVISIÓN
// se hacen con `Decimal` (vía `money().amount`), nunca `Number()` sobre el
// string del monto — solo el resultado final (un porcentaje de solo
// lectura para el ancho de una barra) se convierte a `number`, igual que
// `pctDelTotal` ya viene como `number` calculado en servidor para figura 1.
function decimalDe(monto: string) {
  return money(monto, MONEDA).amount
}

const proporcionDinero = computed(() => {
  if (!cartera.value || !recaudoMes.value) return null
  const recaudado = decimalDe(recaudoMes.value.montoRecaudado)
  const pendiente = decimalDe(cartera.value.tarjetas.carteraCorriente)
  const vencido = decimalDe(cartera.value.tarjetas.carteraVencida)
  const total = recaudado.plus(pendiente).plus(vencido)
  if (total.lessThanOrEqualTo(0)) return null
  return {
    recaudado: recaudado.toNumber(),
    pendiente: pendiente.toNumber(),
    vencido: vencido.toNumber(),
    pctRecaudado: recaudado.dividedBy(total).times(100).toNumber(),
    pctPendiente: pendiente.dividedBy(total).times(100).toNumber(),
    pctVencido: vencido.dividedBy(total).times(100).toNumber(),
  }
})

const concentracionMora = computed(() => {
  if (!cartera.value || cartera.value.topInmuebles.length === 0) return null
  const totalVencida = decimalDe(cartera.value.tarjetas.carteraVencida)
  const sumaTop = cartera.value.topInmuebles.reduce((acc, i) => acc.plus(decimalDe(i.deudaVencida)), decimalDe('0'))
  const pct = totalVencida.greaterThan(0) ? sumaTop.dividedBy(totalVencida).times(100).toNumber() : null
  return { pct, cantidad: cartera.value.topInmuebles.length }
})

const resumenDinero = computed(() => {
  if (!proporcionDinero.value || !cartera.value) return '—'
  return `Entró el ${proporcionDinero.value.pctRecaudado.toFixed(1)}% · faltan ${formatoMoneda(cartera.value.tarjetas.carteraVencida)}`
})
const resumenEdades = computed(() => {
  if (!cartera.value) return '—'
  return `${formatoMoneda(cartera.value.tarjetas.carteraVencida)} vencidos · ${formatoMoneda(cartera.value.tarjetas.carteraMayor90)} pasaron los 90 días`
})
const resumenRecaudoGestion = computed(() => {
  const partes: string[] = []
  if (recaudoPorForma.value && recaudoPorForma.value.length > 0) {
    const total = recaudoPorForma.value.reduce((a, f) => a + f.monto, 0)
    const automatico = recaudoPorForma.value.filter((f) => f.rol === 'automatico').reduce((a, f) => a + f.monto, 0)
    if (total > 0) partes.push(`el ${((automatico / total) * 100).toFixed(0)}% entra solo`)
  }
  if (gestionCalc.value) {
    partes.push(`${String(gestionCalc.value.efectivas)} de ${String(gestionCalc.value.ejecutadas)} acciones terminaron en pago`)
  }
  return partes.length > 0 ? partes.join(' · ') : '—'
})
const resumenPulso = computed(() => {
  const partes: string[] = []
  if (accesosHoy.value !== null) partes.push(`${String(accesosHoy.value)} acceso${accesosHoy.value === 1 ? '' : 's'} hoy`)
  if (paquetesSinEntregar.value !== null) {
    partes.push(`${String(paquetesSinEntregar.value)} paquete${paquetesSinEntregar.value === 1 ? '' : 's'} sin entregar`)
  }
  if (proximaReunion.value) partes.push(`próxima reunión el ${formatoFecha(proximaReunion.value.fechaHora)}`)
  if (saldoFondos.value !== null) partes.push(`fondos: ${formatoMoneda(saldoFondos.value)}`)
  if (resumenAuditoria.value && resumenAuditoria.value.accionesVencidas > 0) {
    partes.push(`${String(resumenAuditoria.value.accionesVencidas)} acción${resumenAuditoria.value.accionesVencidas === 1 ? '' : 'es'} de auditoría vencida${resumenAuditoria.value.accionesVencidas === 1 ? '' : 's'}`)
  }
  return partes.length > 0 ? partes.join(' · ') : '—'
})

// ── §4.5 — espera tu decisión ──────────────────────────────────────────
const ETIQUETA_ORIGEN: Record<string, string> = {
  anuncios: 'Anuncios',
  marketplace: 'Marketplace',
  movilidad: 'Movilidad',
  atencion: 'Atención',
  cartera: 'Cartera',
}
function etiquetaOrigen(modulo: string): string {
  return ETIQUETA_ORIGEN[modulo] ?? modulo
}

const filtroDecision = ref<'mios' | 'todos'>('mios')
const decisionesFiltradas = computed(() => {
  const base =
    filtroDecision.value === 'mios' && miId.value !== null ? asuntosStore.mios(miId.value) : asuntosStore.asuntos
  return [...base].sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())
})
const misAsuntosCantidad = computed(() => (miId.value !== null ? asuntosStore.mios(miId.value).length : 0))

// ── Carga de datos ──────────────────────────────────────────────────────
// Cada fuente se resuelve o falla por su cuenta: `errorRef` queda atado a
// SU propia promesa, no a una posición dentro de un array — agregar,
// quitar o reordenar una fuente en `cargarTodo` no puede desalinear el
// flag de error de otra (era el riesgo real del destructuring posicional
// que tenía esta función antes).
function conError<T>(promesa: Promise<T>, errorRef: Ref<boolean>): Promise<T | undefined> {
  errorRef.value = false
  return promesa.catch(() => {
    errorRef.value = true
    return undefined
  })
}

async function cargarCarteraDashboard(tenantId: string, fecha: string): Promise<void> {
  cartera.value = await carteraStore.cargarDashboard(tenantId, fecha)
}

async function cargarCarteraEvolucion(tenantId: string, fecha: string): Promise<void> {
  evolucion.value = await carteraStore.cargarEvolucion(tenantId, fecha)
}

async function cargarNovedades(tenantId: string): Promise<void> {
  const filas = await cuentaStore.cargarNovedades(tenantId)
  novedadesPendientes.value = filas.filter((n) => n.estado === 'pendiente').length
}

async function cargarPresupuestoVigente(tenantId: string): Promise<void> {
  const presupuestos = await presupuestoStore.cargarPresupuestos(tenantId)
  presupuestoVigente.value = presupuestos.some((p) => p.estado === 'vigente')
}

async function cargarConceptos(tenantId: string): Promise<void> {
  const conceptos = await conceptoStore.cargarConceptos(tenantId)
  conceptosActivos.value = conceptos.filter((c) => c.estado === 'activo').length
}

async function cargarAccesosHoy(tenantId: string): Promise<void> {
  // Cuenta server-side por rango de fecha LOCAL, no un slice de un
  // `mantenimientoAccesoStore.cargarRegistros` acotado a 200 filas (pensado
  // para una lista de actividad reciente, no como fuente de verdad de un
  // conteo): un edificio con mucho tráfico subcontaría en cuanto el
  // historial supere esas 200 filas antes de llegar a las de hoy.
  const inicioHoy = new Date()
  inicioHoy.setHours(0, 0, 0, 0)
  const inicioManana = new Date(inicioHoy)
  inicioManana.setDate(inicioManana.getDate() + 1)

  const cliente = useSupabaseClient<Database>()
  const { count, error } = await cliente
    .from('mant_registros_acceso_resumen')
    .select('id', { count: 'exact', head: true })
    .eq('tenant_id', tenantId)
    .gte('ingreso_at', inicioHoy.toISOString())
    .lt('ingreso_at', inicioManana.toISOString())
  if (error) throw error
  accesosHoy.value = count ?? 0
}

// Paquetería (EXT-12, tabla `correspondencia`) es un dominio separado de
// mant_registros_acceso (visitantes) — no se mezclan en una sola tabla
// (confirmado con el usuario 2026-09-19). "Sin entregar" y no "recibidos
// hoy": lo que importa a portería es la cola pendiente de retiro, no el día
// exacto en que llegó.
async function cargarPaquetesSinEntregar(tenantId: string): Promise<void> {
  const cliente = useSupabaseClient<Database>()
  const { count, error } = await cliente
    .from('correspondencia')
    .select('id', { count: 'exact', head: true })
    .eq('tenant_id', tenantId)
    .eq('entregada', false)
  if (error) throw error
  paquetesSinEntregar.value = count ?? 0
}

async function cargarProximaReunion(tenantId: string): Promise<void> {
  await gobiernoReunionesStore.cargarReuniones(tenantId)
  const ahoraMs = Date.now()
  const futuras = gobiernoReunionesStore.reuniones
    .filter((r) => new Date(r.fecha_hora).getTime() >= ahoraMs)
    .sort((a, b) => new Date(a.fecha_hora).getTime() - new Date(b.fecha_hora).getTime())
  const proxima = futuras[0]
  proximaReunion.value = proxima ? { fechaHora: proxima.fecha_hora, nombre: proxima.tipo?.nombre ?? 'Reunión' } : null
}

async function cargarSaldoFondos(tenantId: string): Promise<void> {
  await fondosStore.cargarFondos(tenantId)
  saldoFondos.value = Object.values(fondosStore.saldosPorFondo).reduce((acc, f) => acc + f.saldo, 0)
}

async function cargarAuditoria(tenantId: string): Promise<void> {
  resumenAuditoria.value = await auditoriaStore.cargarResumenLigero(tenantId)
}

async function cargarRecaudoPorForma(tenantId: string, fechaDesde: string, fechaHasta: string): Promise<void> {
  const cliente = useSupabaseClient<Database>()
  const [{ data: filas, error: errorFilas }, { data: tipos, error: errorTipos }] = await Promise.all([
    cliente
      .from('vr_recaudos')
      .select('forma_pago, monto')
      .eq('tenant_id', tenantId)
      .gte('fecha_pago', fechaDesde)
      .lte('fecha_pago', fechaHasta),
    cliente.from('lista_tipos').select('codigo, nombre').eq('tipo', 'FORMA_PAGO'),
  ])
  if (errorFilas) throw errorFilas
  if (errorTipos) throw errorTipos

  const codigoPorNombre = new Map((tipos ?? []).map((t) => [t.nombre, t.codigo]))
  // Catálogo abierto (D-24): las 6 sembradas se clasifican por su código.
  // Una forma de pago nueva por tenant (datáfono, corresponsal bancario...)
  // no se asume automática ni de ventanilla — se agrupa aparte, en neutral,
  // como "Otras Formas de Pago" (confirmado con el usuario 2026-09-19).
  const AUTOMATICO = new Set(['pse', 'debito_automatico', 'transferencia_bancaria', 'nota_debito'])
  const VENTANILLA = new Set(['efectivo', 'cheque'])
  const OTRAS_FORMAS = 'Otras Formas de Pago'

  const acumulado = new Map<string, number>()
  for (const f of filas ?? []) {
    const nombre = f.forma_pago ?? 'Sin forma'
    const codigo = codigoPorNombre.get(nombre)
    const etiqueta = nombre === 'Sin forma' || (codigo && (AUTOMATICO.has(codigo) || VENTANILLA.has(codigo))) ? nombre : OTRAS_FORMAS
    acumulado.set(etiqueta, (acumulado.get(etiqueta) ?? 0) + (f.monto ?? 0))
  }

  const ordenado = [...acumulado.entries()].sort((a, b) => b[1] - a[1])
  const TOPE = 7
  const principales = ordenado.slice(0, TOPE)
  const cola = ordenado.slice(TOPE)

  function rolDe(etiqueta: string): FilaRecaudoForma['rol'] {
    if (etiqueta === 'Sin forma' || etiqueta === OTRAS_FORMAS) return 'sin_forma'
    const codigo = codigoPorNombre.get(etiqueta)
    return codigo && VENTANILLA.has(codigo) ? 'ventanilla' : 'automatico'
  }

  const resultado: FilaRecaudoForma[] = principales.map(([etiqueta, monto]) => ({ etiqueta, monto, rol: rolDe(etiqueta) }))
  if (cola.length > 0) {
    resultado.push({ etiqueta: 'Otros', monto: cola.reduce((acc, [, m]) => acc + m, 0), rol: 'sin_forma' })
  }
  recaudoPorForma.value = resultado
}

async function cargarGestion(tenantId: string, fechaDesde: string, fechaHasta: string): Promise<void> {
  const cliente = useSupabaseClient<Database>()
  const crudo = await obtenerRawIndicadoresGestion(cliente, { tenantId, fechaDesde, fechaHasta, moneda: MONEDA })
  // carteraVencidaInicioPeriodo se pasa en cero: esta pantalla no muestra
  // recoveryRate (§6.4 solo pide el monto recuperado, no esa razón), así
  // que no hay snapshot de inicio de periodo que traer para calcularla sin
  // inventar un dato que no se usa.
  const calc = calcularIndicadoresGestion(crudo, money(0, MONEDA))
  gestionCalc.value = {
    efectividad: calc.collectionEffectiveness,
    promesas: calc.promiseFulfillmentRate,
    acuerdos: calc.agreementFulfillmentRate,
    ejecutadas: crudo.accionesEjecutadas,
    efectivas: crudo.accionesEfectivas,
    promesasVencidas: crudo.promesasVencidas,
    promesasCumplidas: crudo.promesasCumplidas,
    acuerdosTerminados: crudo.acuerdosTerminados,
    acuerdosCumplidos: crudo.acuerdosCumplidos,
    recuperado: crudo.montoRecuperadoPeriodo.amount.toString(),
  }
  // `cartera-recaudo` (Edge Function) solo envuelve esta misma llamada a
  // fn_indicadores_gestion para exponer montoRecaudado/collectionEffectiveness
  // — pedirla aparte duplicaba la RPC. `calc.collectionEffectiveness` usa la
  // idéntica fórmula (REC-CAR-004: pctEnteroONull compartida), así que
  // "Recaudo del mes" se deriva del mismo `crudo` en vez de otra vuelta de red.
  recaudoMes.value = {
    fechaDesde,
    fechaHasta,
    montoRecaudado: crudo.montoRecuperadoPeriodo.amount.toString(),
    collectionEffectiveness: calc.collectionEffectiveness,
  }
}

async function cargarConciliaciones(tenantId: string, periodoId: string): Promise<void> {
  const cliente = useSupabaseClient<Database>()
  const { data, error } = await cliente
    .from('conciliacion_bancaria')
    .select('estado')
    .eq('tenant_id', tenantId)
    .eq('periodo_id', periodoId)
  if (error) throw error
  const total = data.length
  const certificadas = data.filter((d) => d.estado === 'certificada').length
  conciliacionResumen.value = { total, certificadas, pendientes: total - certificadas }
}

async function cargarComprobantesPendientes(tenantId: string, periodoId: string): Promise<void> {
  const filas = await comprobantesStore.cargarComprobantes(tenantId, { periodoId, estado: 'borrador' })
  comprobantesPendientes.value = filas.length
}

async function cargarCiclo(tenantId: string): Promise<void> {
  const [p, l] = await Promise.all([liquidacionStore.cargarPeriodos(tenantId), liquidacionStore.cargarLiquidaciones(tenantId)])
  periodos.value = p
  liquidaciones.value = l
}

async function cargarTodo(): Promise<void> {
  const tenantId = tenantStore.activeTenant?.id
  if (!tenantId) return
  cargando.value = true

  // Fecha LOCAL, no `toISOString().slice(0, 10)` (UTC) — en Colombia (UTC−5)
  // esa fecha se adelanta un día entre las 19:00 y medianoche, corriendo
  // "hoy" y el primer día del mes hacia el día/mes siguiente en esas horas.
  const hoy = hoyLocal()
  const primerDiaMes = `${hoy.slice(0, 7)}-01`

  // Fase 1: todo lo que no depende de saber cuál es el periodo actual. Cada
  // fuente resuelve su propio ref de error vía `conError` — ya no rechaza
  // nada de lo que espera este `Promise.all`, así que no hace falta
  // `allSettled` ni desempacar resultados por posición.
  await Promise.all([
    conError(cargarCarteraDashboard(tenantId, hoy), carteraError),
    conError(cargarCarteraEvolucion(tenantId, hoy), evolucionError),
    conError(cargarRecaudoPorForma(tenantId, primerDiaMes, hoy), recaudoFormaError),
    conError(cargarGestion(tenantId, primerDiaMes, hoy), gestionError),
    conError(cargarCiclo(tenantId), cicloError),
    conError(cargarPresupuestoVigente(tenantId), presupuestoError),
    conError(cargarConceptos(tenantId), conceptosError),
    conError(cargarNovedades(tenantId), novedadesError),
    conError(cargarAccesosHoy(tenantId), accesosError),
    conError(cargarPaquetesSinEntregar(tenantId), paquetesError),
    conError(cargarProximaReunion(tenantId), reunionError),
    conError(cargarSaldoFondos(tenantId), fondosError),
    conError(cargarAuditoria(tenantId), auditoriaError),
    asuntosStore.cargar(tenantId),
  ])

  // `recaudoMesError` no tiene su propia carga — el mismo `gestionError` de
  // arriba ya cubre a `cargarGestion`, que ahora deriva recaudoMes.value.
  recaudoMesError.value = gestionError.value

  // Fase 2: conciliación y comprobantes necesitan el id del periodo actual,
  // que solo se conoce tras resolver la fase 1 (cargarCiclo).
  const periodoId = periodoActual.value?.id
  if (periodoId) {
    await Promise.all([
      conError(cargarConciliaciones(tenantId, periodoId), conciliacionError),
      conError(cargarComprobantesPendientes(tenantId, periodoId), comprobantesError),
    ])
  } else {
    conciliacionResumen.value = null
    comprobantesPendientes.value = null
    conciliacionError.value = false
    comprobantesError.value = false
  }

  ultimaCargaMs.value = Date.now()
  cargando.value = false
}

async function actualizar(): Promise<void> {
  await cargarTodo()
}

onMounted(cargarTodo)
watch(() => tenantStore.activeTenant?.id, cargarTodo)

// ── §6.7 caso 3 — recarga al recuperar visibilidad ────────────────────
const UMBRAL_VISIBILIDAD_MS = 90_000
function alVolverAlFoco(): void {
  if (document.visibilityState !== 'visible') return
  if (ultimaCargaMs.value === null) return
  if (Date.now() - ultimaCargaMs.value < UMBRAL_VISIBILIDAD_MS) return
  void cargarTodo()
}
onMounted(() => {
  document.addEventListener('visibilitychange', alVolverAlFoco)
  temporizadorReloj = setInterval(() => {
    ahora.value = Date.now()
  }, 30_000)
})
onUnmounted(() => {
  document.removeEventListener('visibilitychange', alVolverAlFoco)
  if (temporizadorReloj) clearInterval(temporizadorReloj)
})

// ── Sello de frescura (§6.7 caso 2) ───────────────────────────────────
const frescura = computed(() => {
  if (ultimaCargaMs.value === null) return null
  const minutos = Math.floor((ahora.value - ultimaCargaMs.value) / 60_000)
  return { texto: `Datos de ${relativoCorto(new Date(ultimaCargaMs.value).toISOString(), new Date(ahora.value))}`, vieja: minutos >= 10 }
})
</script>

<template>
  <div class="space-y-6">
    <DashboardOnboardingChecklist />

    <!-- ── 1 · Estado del periodo ────────────────────────────────────── -->
    <section class="space-y-3">
      <div class="flex flex-wrap items-start justify-between gap-3">
        <div class="flex items-center gap-3">
          <h1 class="font-display text-2xl font-semibold text-highlighted">
            {{ periodoActual ? `${MESES[periodoActual.mes - 1]} ${periodoActual.anio}` : 'Sin periodos' }}
          </h1>
          <UBadge v-if="situacionPeriodo" :color="situacionPeriodo.chipColor" variant="subtle">
            {{ situacionPeriodo.chipTexto }}
          </UBadge>
        </div>
        <div v-if="frescura" class="flex items-center gap-2 text-xs text-dimmed">
          <span
            aria-hidden="true"
            class="size-1.5 rounded-full"
            :class="frescura.vieja ? 'bg-warning' : 'bg-success'"
          />
          <span :class="frescura.vieja ? 'font-medium text-warning' : ''">{{ frescura.texto }}</span>
          <UButton size="xs" variant="ghost" color="neutral" :loading="cargando" @click="actualizar">
            Actualizar
          </UButton>
        </div>
      </div>

      <p v-if="situacionPeriodo" class="max-w-[64ch] text-base text-muted">{{ situacionPeriodo.frase }}</p>
      <p v-else-if="cicloError" class="text-sm text-warning">
        No se pudo cargar el periodo ni la liquidación actuales. —
      </p>
      <p v-else-if="!cargando" class="text-sm text-muted">
        Esta copropiedad todavía no tiene periodos. Crea el primero en Liquidación.
      </p>

      <div v-if="situacionPeriodo?.accionTexto" class="flex gap-2">
        <UButton v-if="puedeActuar" :to="situacionPeriodo.accionEnlace ?? undefined" color="primary">
          {{ situacionPeriodo.accionTexto }}
        </UButton>
        <UButton :to="'/liquidacion'" color="neutral" variant="outline">Ver liquidación</UButton>
      </div>
    </section>

    <!-- ── 2 · Tira del ciclo ────────────────────────────────────────── -->
    <section v-if="periodoActual" class="rounded-lg border border-default bg-elevated/40 p-4">
      <h2 class="sr-only">Ciclo del periodo</h2>
      <DashboardCicloPeriodo :pasos="pasosCiclo" />
    </section>

    <div class="grid grid-cols-1 gap-6 lg:grid-cols-[1.6fr_1fr]">
      <!-- ── ESPINA ─────────────────────────────────────────────────── -->
      <div class="space-y-6">
        <!-- 3 · Lo que bloquea el cierre -->
        <section class="space-y-3">
          <h2 class="font-display text-lg font-semibold text-highlighted">Lo que bloquea el cierre</h2>
          <p v-if="bloqueosIncompletos" class="flex items-center gap-2 text-sm text-warning">
            <span aria-hidden="true" class="size-2 rounded-full bg-warning" />
            No se pudo verificar todo lo que bloquea el cierre — puede haber más de lo que se ve acá.
          </p>
          <p v-else-if="bloqueos.length === 0 && !cargando" class="flex items-center gap-2 text-sm text-muted">
            <span aria-hidden="true" class="size-2 rounded-full bg-success" />
            Nada bloquea el cierre{{ periodoActual ? ` de ${MESES[periodoActual.mes - 1]}` : '' }}.
          </p>
          <ul v-if="bloqueos.length > 0" class="divide-y divide-default">
            <DashboardBloqueo
              v-for="b in bloqueos"
              :key="b.id"
              :severidad="b.severidad"
              :titulo="b.titulo"
              :consecuencia="b.consecuencia"
              :metadato="b.metadato"
              :accion-texto="b.accionTexto"
              :accion-enlace="b.accionEnlace"
              :puede-actuar="puedeActuar"
            />
          </ul>
        </section>

        <!-- 4 · El dinero, dicho en palabras -->
        <DashboardSeccionPlegable id="dinero" titulo="El dinero, dicho en palabras" :default-abierto="true">
          <template #resumen>{{ resumenDinero }}</template>
          <div v-if="carteraError || recaudoMesError" class="text-sm text-muted">
            No se pudo cargar la cartera o el recaudo del mes. —
          </div>
          <div v-else-if="cartera && recaudoMes" class="space-y-4">
            <p class="max-w-[66ch] text-[17px] leading-relaxed text-default">
              La copropiedad tiene
              <b class="font-display text-[1.32em] font-semibold tabular-nums text-highlighted">{{ formatoMoneda(cartera.tarjetas.carteraTotal) }}</b>
              en cartera, de los cuales
              <b class="font-display text-[1.32em] font-semibold tabular-nums text-highlighted">{{ formatoMoneda(cartera.tarjetas.carteraVencida) }}</b>
              están vencidos. Este mes entraron
              <b class="font-display text-[1.32em] font-semibold tabular-nums text-highlighted">{{ formatoMoneda(recaudoMes.montoRecaudado) }}</b>.
            </p>

            <div v-if="proporcionDinero" class="space-y-1.5">
              <div class="flex h-[34px] w-full overflow-hidden rounded-sm bg-neutral-100 dark:bg-neutral-800">
                <span class="h-full bg-success" :style="{ width: `${String(proporcionDinero.pctRecaudado)}%` }" />
                <span class="h-full bg-neutral-300 dark:bg-neutral-600" :style="{ width: `${String(proporcionDinero.pctPendiente)}%` }" />
                <span class="h-full bg-warning" :style="{ width: `${String(proporcionDinero.pctVencido)}%` }" />
              </div>
              <div class="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted">
                <span><span class="inline-block size-2 rounded-full bg-success" /> Recaudado: {{ formatoMoneda(proporcionDinero.recaudado) }}</span>
                <span><span class="inline-block size-2 rounded-full bg-neutral-400" /> Corriente: {{ formatoMoneda(proporcionDinero.pendiente) }}</span>
                <span><span class="inline-block size-2 rounded-full bg-warning" /> Vencido: {{ formatoMoneda(proporcionDinero.vencido) }}</span>
              </div>
            </div>

            <div v-if="concentracionMora" class="space-y-1.5">
              <p class="text-sm text-muted">
                Los {{ concentracionMora.cantidad }} inmuebles con mayor mora concentran
                <b v-if="concentracionMora.pct !== null" class="font-display font-semibold text-highlighted">{{ concentracionMora.pct.toFixed(1) }}%</b>
                <span v-else>una parte</span>
                de la cartera vencida.
              </p>
              <ul class="space-y-1">
                <li
                  v-for="i in cartera.topInmuebles"
                  :key="i.inmuebleId"
                  class="grid grid-cols-[1fr_5rem_7rem] gap-2 text-sm"
                >
                  <span class="truncate text-muted">{{ i.codigo }}</span>
                  <span class="text-right tabular-nums text-dimmed">{{ i.diasMoraMaximo }} días</span>
                  <span class="text-right tabular-nums text-highlighted">{{ formatoMoneda(i.deudaVencida) }}</span>
                </li>
              </ul>
            </div>
          </div>
        </DashboardSeccionPlegable>

        <!-- 4b · Cómo está envejeciendo (figuras 1 y 2) -->
        <DashboardSeccionPlegable id="edades" titulo="Cómo está envejeciendo" :default-abierto="true">
          <template #resumen>{{ resumenEdades }}</template>
          <div v-if="carteraError" class="text-sm text-muted">No se pudo cargar la cartera. —</div>
          <div v-else-if="cartera && cartera.antiguedad.length === 0" class="text-sm text-muted">
            Ningún inmueble en mora.
          </div>
          <div v-else-if="cartera" class="space-y-6">
            <DashboardCarteraEdades :tramos="cartera.antiguedad" />
            <div v-if="evolucionError" class="text-sm text-muted">No se pudo cargar la evolución. —</div>
            <div v-else-if="evolucion && evolucion.length > 0">
              <p class="mb-2 text-sm font-medium text-highlighted">Cómo viene la cartera vencida</p>
              <DashboardEvolucion :puntos="evolucion" />
            </div>
          </div>
        </DashboardSeccionPlegable>

        <!-- 4b · Por dónde entra y qué tan bien se cobra (figuras 3 y 4) -->
        <DashboardSeccionPlegable id="recaudo-gestion" titulo="Por dónde entra y qué tan bien se cobra" :default-abierto="false">
          <template #resumen>{{ resumenRecaudoGestion }}</template>
          <div class="space-y-6">
            <div>
              <p class="mb-2 text-sm font-medium text-highlighted">Recaudo por forma de pago</p>
              <p class="mb-2 text-sm text-muted">
                El efectivo se debita contra caja general, no directamente contra el banco — por eso importa por
                dónde entra, no solo cuánto.
              </p>
              <div v-if="recaudoFormaError" class="text-sm text-muted">No se pudo cargar el recaudo por forma de pago. —</div>
              <p v-else-if="recaudoPorForma && recaudoPorForma.length === 0" class="text-sm text-muted">
                Sin pagos registrados este periodo.
              </p>
              <DashboardRecaudoFormaPago v-else-if="recaudoPorForma" :filas="recaudoPorForma" />
            </div>
            <div>
              <p class="mb-2 text-sm font-medium text-highlighted">Efectividad de la gestión de cobranza</p>
              <div v-if="gestionError" class="text-sm text-muted">No se pudo cargar la gestión de cobranza. —</div>
              <DashboardEfectividadGestion
                v-else-if="gestionCalc"
                :filas="[
                  { concepto: 'Acciones que terminaron en pago', numerador: gestionCalc.efectivas, denominador: gestionCalc.ejecutadas, pct: gestionCalc.efectividad },
                  { concepto: 'Promesas de pago cumplidas', numerador: gestionCalc.promesasCumplidas, denominador: gestionCalc.promesasVencidas, pct: gestionCalc.promesas },
                  { concepto: 'Acuerdos de pago al día', numerador: gestionCalc.acuerdosCumplidos, denominador: gestionCalc.acuerdosTerminados, pct: gestionCalc.acuerdos },
                ]"
                :recuperado="formatoMoneda(gestionCalc.recuperado)"
              />
            </div>
          </div>
        </DashboardSeccionPlegable>
      </div>

      <!-- ── RIEL ───────────────────────────────────────────────────── -->
      <div class="space-y-6">
        <!-- 5 · Espera tu decisión -->
        <section class="space-y-3 rounded-md border border-default p-4">
          <div class="flex items-center justify-between gap-2">
            <h2 class="font-display text-lg font-semibold text-highlighted">Espera tu decisión</h2>
          </div>
          <div class="flex gap-2">
            <button
              type="button"
              class="rounded-full border px-3 py-1 text-xs transition-colors"
              :class="filtroDecision === 'mios' ? 'border-primary text-primary font-medium' : 'border-default text-muted'"
              @click="filtroDecision = 'mios'"
            >
              Asignado a mí ({{ misAsuntosCantidad }})
            </button>
            <button
              type="button"
              class="rounded-full border px-3 py-1 text-xs transition-colors"
              :class="filtroDecision === 'todos' ? 'border-primary text-primary font-medium' : 'border-default text-muted'"
              @click="filtroDecision = 'todos'"
            >
              Todo lo que me compete ({{ asuntosStore.total }})
            </button>
          </div>
          <p v-if="asuntosStore.error" class="text-sm text-muted">{{ asuntosStore.error }}</p>
          <p v-else-if="decisionesFiltradas.length === 0 && !asuntosStore.loading" class="text-sm text-muted">
            No hay nada esperando tu aprobación.
          </p>
          <ul v-else class="divide-y divide-default">
            <DashboardDecision
              v-for="a in decisionesFiltradas"
              :key="`${a.origenEntidad}-${a.origenId}`"
              :asunto="a"
              :etiqueta-origen="etiquetaOrigen(a.origenModulo)"
              :es-tuyo="a.asignadoA !== null && a.asignadoA === miId"
              :ahora="ahora"
            />
          </ul>
        </section>

        <!-- 6 · El pulso de hoy -->
        <DashboardSeccionPlegable id="pulso" titulo="El pulso de hoy" :default-abierto="false">
          <template #resumen>{{ resumenPulso }}</template>
          <p class="mb-3 text-sm text-muted">Nada acá necesita tu decisión.</p>
          <ul class="space-y-2 text-sm">
            <li
              v-if="accesosError || paquetesError || reunionError || fondosError || auditoriaError"
              class="text-muted"
            >
              No se pudo cargar el pulso de hoy. —
            </li>
            <template v-else>
              <li class="flex items-center justify-between gap-2">
                <span class="text-muted">Accesos registrados hoy</span>
                <span class="font-display tabular-nums text-highlighted">{{ accesosHoy ?? '—' }}</span>
              </li>
              <li class="flex items-center justify-between gap-2">
                <span class="text-muted">Paquetes sin entregar</span>
                <span class="font-display tabular-nums text-highlighted">{{ paquetesSinEntregar ?? '—' }}</span>
              </li>
              <li class="flex items-center justify-between gap-2">
                <span class="text-muted">Próxima reunión</span>
                <span class="font-display text-highlighted">
                  {{ proximaReunion ? `${proximaReunion.nombre} · ${formatoFecha(proximaReunion.fechaHora)}` : 'Ninguna programada' }}
                </span>
              </li>
              <li class="flex items-center justify-between gap-2">
                <span class="text-muted">Saldo de fondos</span>
                <span class="font-display tabular-nums text-highlighted">
                  {{ saldoFondos !== null ? formatoMoneda(saldoFondos) : '—' }}
                </span>
              </li>
              <li class="flex items-center justify-between gap-2">
                <span class="text-muted">Hallazgos de auditoría abiertos</span>
                <span class="font-display tabular-nums text-highlighted">{{ resumenAuditoria?.hallazgosAbiertos ?? '—' }}</span>
              </li>
              <li class="flex items-center justify-between gap-2">
                <span :class="resumenAuditoria && resumenAuditoria.accionesVencidas > 0 ? 'font-medium text-warning' : 'text-muted'">
                  Acciones de auditoría vencidas
                </span>
                <span
                  class="font-display tabular-nums"
                  :class="resumenAuditoria && resumenAuditoria.accionesVencidas > 0 ? 'font-medium text-warning' : 'text-highlighted'"
                >
                  {{ resumenAuditoria?.accionesVencidas ?? '—' }}
                </span>
              </li>
            </template>
          </ul>
        </DashboardSeccionPlegable>
      </div>
    </div>
  </div>
</template>
