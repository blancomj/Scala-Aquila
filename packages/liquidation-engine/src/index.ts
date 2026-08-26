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
} from './errors.js'

export {
  imputarPago,
  calcularInteresMora,
  diasCalendario,
  type CategoriaCargo,
  type CargoAbierto,
  type EstrategiaImputacion,
  type AplicacionPago,
  type PlanImputacion,
  type CargoInteresGenerado,
  type PoliticaMora,
  type SegmentoTasa,
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
  registrarCargoInteres,
  obtenerUltimaFechaInteresPorCapital,
  generarCargosNovedadesPeriodo,
  type OpcionesCargosAbiertos,
  type PoliticaImputacion,
  type DatosPago,
} from './cuenta-corriente-supabase.js'
