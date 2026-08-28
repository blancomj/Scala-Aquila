/**
 * Contrato de la capa de adaptadores de pasarela de pago.
 *
 * FASE DE ESTRUCTURA: el descriptor de capacidades SÍ se implementa de verdad
 * (es data, no integración de red); los métodos que hablan con el proveedor
 * lanzan NO_IMPLEMENTADO a propósito. La integración real llega en la fase
 * siguiente, en el orden de §F del documento propietario
 * (Docs/evaluacion/05-evaluacion-pagos-conciliacion.md): Wompi primero.
 */
import type { Database } from '@aquila/shared'

/** Derivado del enum de la base, nunca escrito a mano — así agregar un valor
 *  al enum sin escribir su adaptador es un error de compilación en el Record
 *  exhaustivo de registro.ts. */
export type PasarelaProveedor = Database['public']['Enums']['pasarela_proveedor_t']
export type PasarelaModo = Database['public']['Enums']['pasarela_modo_t']

/** Códigos de lista_tipos familia FORMA_PAGO — el MISMO vocabulario que
 *  consume pagos.forma_pago_id, para que la fase 2 pueda mapear lo que
 *  reporta la pasarela a un pago real sin reconciliar dos catálogos. */
export type MetodoPago =
  | 'pse'
  | 'tarjeta_credito'
  | 'tarjeta_debito'
  | 'nequi'
  | 'corresponsal_bancario'
  | 'transferencia_bancaria'

/**
 * Unión discriminada, no `{ checkoutUrl | referenciaEfectivo }` como propone
 * §D del documento propietario. La razón es Bold: su checkout online no es un
 * redirect a una URL, es un botón que se renderiza embebido en la página con
 * una firma de integridad. Modelado como "URL o referencia", Bold no cabe y
 * termina forzado a fingir una URL que no existe.
 *
 * NO "simplificar" esto de vuelta a un checkoutUrl suelto: rompe Bold en
 * silencio (el tipo compilaría, el pago no funcionaría).
 */
export type ResultadoIntencion =
  | { tipo: 'redirect'; checkoutUrl: string; expiraEn: string }
  | { tipo: 'boton_embebido'; payloadFirmado: Record<string, string>; expiraEn: string }
  | { tipo: 'referencia_efectivo'; referencia: string; expiraEn: string }

export interface CapacidadesPasarela {
  readonly metodosSoportados: readonly MetodoPago[]
  readonly tipoCheckout: ResultadoIntencion['tipo']
  readonly soportaSandbox: boolean
  /** Nombres de credencial que este proveedor exige. Es lo que hace genérica
   *  a la pantalla de configuración: la UI pinta lo que el descriptor declare,
   *  sin un `if (proveedor === 'wompi')` por cada proveedor. */
  readonly credencialesRequeridas: readonly string[]
  /** Documentación oficial del proveedor. La UI enlaza aquí en vez de copiar
   *  tarifas al código: cambian, y el documento propietario advierte
   *  "verificar siempre tarifa vigente al contratar". */
  readonly urlDocumentacion: string
}

export interface ParamsIntencion {
  readonly montoCentavos: number
  readonly moneda: string
  readonly referencia: string
  readonly metodo: MetodoPago
  readonly urlRetorno: string
  readonly modo: PasarelaModo
  /** Credenciales de ESTA copropiedad para ESTE proveedor, ya descifradas
   *  por el caller (service_role + Vault) — nombre → valor, mismo
   *  vocabulario que capacidades.credencialesRequeridas. El adaptador nunca
   *  las persiste ni las loguea; solo las usa para firmar/autenticar. */
  readonly credenciales: Readonly<Record<string, string>>
}

/** Lo que el adaptador necesita para preguntarle al proveedor por una
 *  transacción ya existente — a diferencia de crearIntencion(), no hay un
 *  monto ni una referencia que fijar: la transacción ya existe del lado del
 *  proveedor y transactionId basta para ubicarla. */
export interface ContextoConsulta {
  readonly modo: PasarelaModo
  readonly credenciales: Readonly<Record<string, string>>
}

export interface EstadoTransaccion {
  readonly transactionId: string
  readonly estado: 'pendiente' | 'aprobada' | 'rechazada' | 'anulada'
  readonly montoCentavos: number
  readonly metodo: MetodoPago | null
}

export interface EventoTransaccion {
  readonly transactionId: string
  readonly referencia: string
  readonly estado: EstadoTransaccion['estado']
  readonly montoCentavos: number
}

export interface PaymentGatewayAdapter {
  readonly proveedor: PasarelaProveedor
  readonly nombreComercial: string
  readonly capacidades: CapacidadesPasarela
  crearIntencion(params: ParamsIntencion): Promise<ResultadoIntencion>
  consultarTransaccion(transactionId: string, contexto: ContextoConsulta): Promise<EstadoTransaccion>
  validarFirmaWebhook(payload: unknown, firma: string, secreto: string): boolean
  parsearWebhook(payload: unknown): EventoTransaccion
}
