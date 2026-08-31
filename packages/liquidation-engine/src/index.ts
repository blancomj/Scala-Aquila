export {
  type DataSnapshot,
  type SnapshotInmueble,
  type SnapshotPeriodo,
  type SnapshotConcepto,
  type SnapshotPresupuesto,
  type SnapshotPolitica,
  clavePeriodo,
} from './snapshot.js'

export { construirGrafo, ordenTopologico, type NodoGrafo } from './graph.js'

export { catalogoDesde, crearContexto } from './context.js'

export { ejecutarPlan, type LineaLiquidacion, type ResultadoConcepto } from './executor.js'

export {
  ensamblarResultado,
  type LiquidationResult,
  type LineaResultado,
  type TotalInmueble,
} from './result.js'

export { calcularResultHash } from './hash.js'

export { liquidar, type ResultadoLiquidacion } from './liquidar.js'

export { construirSnapshotDesdeSupabase, type OpcionesSnapshot } from './snapshot-supabase.js'

export { conceptoAplicaEnPeriodo } from './temporal.js'

export {
  DependenciaCiclicaError,
  DependenciaDesconocidaError,
  ConceptoNoAnalizaLimpioError,
  EvaluacionConceptoFallidaError,
  ConceptoFijoSinValorError,
  ConceptoRecurrenciaSinFechaError,
  ReconciliacionLiquidacionFallidaError,
  OrdenImputacionInvalidoError,
  EstrategiaImputacionInvalidaError,
  PoliticaMoraNoConfiguradaError,
  PoliticaClasificacionInvalidaError,
  TramoClasificacionNoEncontradoError,
  SegmentacionDayCountNoSoportadoError,
  SegmentosTasaSolapadosError,
  ImputacionManualInvalidaError,
  CuotaAcuerdoNoConciliableError,
} from './errors.js'

export {
  imputarPago,
  construirPlanManual,
  conciliarCuotaAcuerdo,
  calcularInteresMora,
  diasCalendario,
  type CategoriaCargo,
  type CargoAbierto,
  type EstrategiaImputacion,
  type AplicacionPago,
  type AplicacionManual,
  type PlanImputacion,
  type CargoInteresGenerado,
  type PoliticaMora,
  type SegmentoTasa,
  type EstadoCuotaAcuerdo,
  type CuotaAcuerdoActual,
  type ResultadoConciliacionCuota,
} from './cuenta-corriente.js'

export {
  calcularAntiguedad,
  calcularPosicionCartera,
  clasificarCartera,
  validarPoliticaClasificacion,
  calcularPosicionHash,
  type CargoConAntiguedad,
  type PosicionCarteraCalculada,
  type NivelRiesgo,
  type EtapaCobranza,
  type TramoClasificacion,
  type PoliticaClasificacion,
  type ResultadoClasificacion,
  type PosicionCarteraSnapshotDatos,
} from './cartera.js'

export {
  obtenerPoliticaClasificacionVigente,
  registrarSnapshotPosicion,
} from './cartera-supabase.js'

export {
  evaluarAccionesAplicables,
  type TipoAccionCobranza,
  type EstadoAccionCobranza,
  type EstrategiaCobranza,
  type AccionHistorica,
  type AccionPropuesta,
  type MotivoOmision,
  type AccionOmitida,
  type ResultadoEvaluacionAcciones,
} from './cartera-cobranza.js'

export {
  obtenerEstrategiasCobranzaVigentes,
  obtenerHistorialAccionesCobranza,
  registrarAccionCobranza,
  type DatosAccionCobranza,
} from './cartera-cobranza-supabase.js'

export {
  evaluarEscalamiento,
  TRANSICIONES_ETAPA_COBRANZA,
  type TransicionEtapaCobranza,
  type ResumenAccion,
  type ContextoEscalamiento,
  type DecisionEscalamiento,
} from './cartera-escalamiento.js'

export {
  construirCertificacionDeuda,
  calcularCertificacionHash,
  CertificacionSinDeudaError,
  type DetalleCargoCertificado,
  type CertificacionDeudaDatos,
} from './cartera-juridico.js'

export {
  registrarCertificacionDeuda,
  type OpcionesCertificarDeuda,
} from './cartera-juridico-supabase.js'

export {
  evaluarPromesaIncumplida,
  evaluarCuotaVencida,
  evaluarJobCarteraInmueble,
  calcularResultadoJobHash,
  type PromesaPendiente,
  type CuotaPendiente,
  type CambioPromesa,
  type CambioCuota,
  type CambioAcuerdo,
  type EntradaJobCarteraInmueble,
  type PlanJobCarteraInmueble,
} from './cartera-job.js'

export {
  obtenerInmueblesDelTenant,
  obtenerEtapaActual,
  cargarEntradaJobCarteraInmueble,
  type OpcionesCargarEntradaInmueble,
} from './cartera-job-supabase.js'

export {
  resolverDestinatarios,
  esAccionAltoImpacto,
  type CanalCobranza,
  type RelacionInmueblePersona,
  type MotivoDestinatario,
  type DestinatarioResuelto,
  type ResolucionDestinatarios,
  type EntradaResolucionDestinatarios,
} from './cartera-destinatarios.js'

export { obtenerRelacionesInmueble } from './cartera-destinatarios-supabase.js'

export {
  calcularDashboardCartera,
  calcularTopInmueblesCartera,
  type FilaDashboardCartera,
  type TarjetasCartera,
  type CodigoTramoAntiguedad,
  type TramoAntiguedad,
  type EtapaCarteraResumen,
  type DashboardCartera,
  type InmuebleCarteraResumen,
} from './cartera-dashboard.js'

export { obtenerFilasDashboardCartera } from './cartera-dashboard-supabase.js'

export {
  calcularOverduePortfolioPct,
  calcularCureRate,
  calcularRollRatePorTramo,
  calcularIndicadoresGestion,
  calcularIndicadoresLegales,
  pctEnteroONull,
  type FilaSnapshotIndicador,
  type TramoOrdenado,
  type RollRateTramo,
  type RawIndicadoresGestion,
  type IndicadoresGestion,
  type RawIndicadoresLegales,
  type IndicadoresLegales,
} from './cartera-indicadores.js'

export {
  obtenerSnapshotIndicador,
  obtenerTramosDePolitica,
  obtenerRawIndicadoresGestion,
  obtenerRawIndicadoresLegales,
  type SnapshotIndicador,
} from './cartera-indicadores-supabase.js'

export { obtenerPanelAccionesCartera, type PanelAccionesCartera } from './cartera-panel-acciones-supabase.js'

export {
  obtenerEvolucionCarteraVencida,
  type PuntoEvolucionCarteraVencida,
} from './cartera-evolucion-supabase.js'

export { obtenerRawAlertasCartera, type RawAlertasCartera } from './cartera-alertas-supabase.js'

export {
  obtenerActividadRecienteCartera,
  type EventoActividadCartera,
  type TipoEventoActividadCartera,
} from './cartera-actividad-reciente-supabase.js'

export { probarFormula, type ResultadoPrueba } from './prueba-formula.js'

export {
  construirContextoPrueba,
  type OpcionesContextoPrueba,
  type ContextoPrueba,
} from './prueba-formula-supabase.js'

export {
  obtenerCargosAbiertos,
  obtenerPoliticaMora,
  obtenerPoliticaImputacion,
  registrarPago,
  obtenerCuotaAcuerdoParaConciliar,
  registrarCargoInteres,
  obtenerUltimaFechaInteresPorCapital,
  generarCargosNovedadesPeriodo,
  type OpcionesCargosAbiertos,
  type PoliticaImputacion,
  type DatosPago,
} from './cuenta-corriente-supabase.js'

export {
  detectarParser,
  formatosSoportados,
  hashArchivo,
  hashLinea,
  parserBancolombia,
  type LineaCruda,
  type ParserExtracto,
} from './conciliacion-parsers.js'

// conciliacion-matching.js y conciliacion-supabase.js NO se re-exportan aquí
// a propósito (CAR_08 §4, deuda conocida "el barrel arrastra su grafo
// completo"): conciliacion-matching.js importa "@aquila/payment-gateways",
// un bare specifier que Deno solo resuelve si el deno.json de la Edge
// Function que importa tiene ese import map — la mayoría no lo tiene, porque
// no necesitan conciliación bancaria. Cuando esos dos módulos vivían en este
// barrel, CUALQUIER función que importara aunque fuera una sola cosa de aquí
// (p.ej. calcularResultHash) arrastraba ese specifier sin resolver y fallaba
// en `deno check`/deploy — confirmado en vivo (2026-08-30): `deno check` de
// cartera-actividad-reciente/index.ts fallaba con
// `TS2307: Import "@aquila/payment-gateways" not a dependency and not in
// import map`, pese a que esa función no toca conciliación para nada.
// Los dos únicos consumidores reales (conciliar-linea/index.ts,
// importar-extracto-bancario/index.ts) ya tenían "@aquila/payment-gateways"
// en su propio deno.json — importan estos dos módulos por ruta directa a
// dist/, nunca por el barrel (mismo patrón que registrar-pago/index.ts).
