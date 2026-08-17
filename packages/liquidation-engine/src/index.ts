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

export { guardarLiquidacion } from './persistencia-supabase.js'

export {
  DependenciaCiclicaError,
  DependenciaDesconocidaError,
  ConceptoNoAnalizaLimpioError,
  EvaluacionConceptoFallidaError,
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
  type CargoConAntiguedad,
  type PosicionCarteraCalculada,
  type NivelRiesgo,
  type EtapaCobranza,
  type TramoClasificacion,
  type PoliticaClasificacion,
  type ResultadoClasificacion,
} from './cartera.js'

export { obtenerPoliticaClasificacionVigente } from './cartera-supabase.js'

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
  registrarCargosDeLiquidacion,
  registrarCargoInteres,
  obtenerUltimaFechaInteresPorCapital,
  type OpcionesCargosAbiertos,
  type PoliticaImputacion,
  type DatosPago,
  type LiquidacionLineaInsertada,
} from './cuenta-corriente-supabase.js'
