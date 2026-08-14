export { money, isZeroMoney, isNegativeMoney, type Money } from './money.js'

export {
  sumar,
  restar,
  multiplicar,
  dividir,
  redondear,
  comparar,
  esIgual,
  unidadMinima,
  contarUnidadesResiduales,
  sumarDecimales,
  esNegativoDecimal,
  esCeroDecimal,
  type ModoRedondeo,
  type RoundingPolicy,
  type DecimalValue,
  type Decimal,
} from './financial-operation-service.js'

export {
  allocate,
  verificarSumaReconciliada,
  type AllocationBasisType,
  type AllocationRequest,
  type AllocationEntry,
  type AllocationResult,
} from './allocation.js'

export {
  InvalidCurrencyError,
  InvalidMoneyAmountError,
  CurrencyMismatchError,
  EmptyTargetsError,
  NegativeBasisError,
  ZeroTotalBasisError,
  DuplicateTargetError,
  NonIntegerResidualError,
  ReconciliationFailedError,
  type ContextoAsignacion,
} from './errors.js'
