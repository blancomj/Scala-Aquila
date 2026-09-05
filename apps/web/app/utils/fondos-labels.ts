// Traducciones de los enums de Fondos (GAP-22) a lenguaje llano — mismo criterio que
// presupuesto-labels.ts: centralizado aquí para no repetir el mapa en cada componente.

export const ETIQUETA_ESTADO_FONDO: Record<string, string> = {
  propuesto: 'Propuesto',
  pendiente_autorizacion: 'Pendiente de autorización',
  activo: 'Activo',
  suspendido: 'Suspendido',
  agotado: 'Agotado',
  en_cierre: 'En cierre',
  cerrado: 'Cerrado',
  cancelado: 'Cancelado',
}

export const COLOR_ESTADO_FONDO: Record<string, 'neutral' | 'primary' | 'success' | 'warning' | 'error'> = {
  propuesto: 'neutral',
  pendiente_autorizacion: 'warning',
  activo: 'success',
  suspendido: 'warning',
  agotado: 'error',
  en_cierre: 'warning',
  cerrado: 'neutral',
  cancelado: 'neutral',
}

/** guard_fondo_estado_transicion (20260929100000) — la única fuente de verdad es la base;
 * este mapa solo evita ofrecer en la UI un botón que la base rechazaría de todos modos. */
export const TRANSICIONES_ESTADO_FONDO: Record<string, string[]> = {
  propuesto: ['pendiente_autorizacion', 'cancelado'],
  pendiente_autorizacion: ['activo', 'propuesto', 'cancelado'],
  activo: ['suspendido', 'agotado', 'en_cierre'],
  suspendido: ['activo', 'en_cierre'],
  agotado: ['activo', 'en_cierre'],
  en_cierre: ['cerrado', 'activo'],
  cerrado: [],
  cancelado: [],
}

export const ETIQUETA_NATURALEZA_FONDO: Record<string, string> = {
  imprevistos: 'Imprevistos (Ley 675 art. 35)',
  destinacion_especifica: 'Destinación específica',
}

export const ETIQUETA_TIPO_MOVIMIENTO_FONDO: Record<string, string> = {
  aporte: 'Aporte',
  uso: 'Uso',
  rendimiento: 'Rendimiento financiero',
  traslado_entrada: 'Traslado (entrada)',
  traslado_salida: 'Traslado (salida)',
  ajuste: 'Ajuste',
  reversion: 'Reversión',
  cierre_remanente: 'Cierre de remanente',
}

/** guard_fondo_movimiento_efecto (20260929120000) — entran (crédito al saldo) o salen (débito),
 * ajuste/reversión ya llegan firmados. Solo para el signo visual (+/-) en la UI, no para validar
 * nada — el guard en BD es quien de verdad decide. */
export const ENTRA_AL_SALDO: Record<string, boolean | null> = {
  aporte: true,
  rendimiento: true,
  traslado_entrada: true,
  uso: false,
  traslado_salida: false,
  cierre_remanente: false,
  ajuste: null,
  reversion: null,
}

/** Tipos que un movimiento manual puede registrar desde la UI genérica de Movimientos. `uso`
 * queda fuera a propósito: el Modelo exige que un uso pase por fondo_solicitudes_uso (D-37,
 * segregación de funciones) — permitirlo aquí abriría un atajo alrededor de esa segregación.
 * `cierre_remanente` queda fuera también, siempre: solo lo crea fn_fondo_cerrar (BLOQUE O) — un
 * fondo en_cierre no admite ningún otro tipo de movimiento (guard_fondo_movimiento), así que
 * ofrecerlo aquí a mano nunca tendría sentido. */
export const TIPOS_MOVIMIENTO_MANUAL = [
  'aporte',
  'rendimiento',
  'traslado_entrada',
  'traslado_salida',
  'ajuste',
] as const

export const ETIQUETA_ESTADO_COMPROMISO: Record<string, string> = {
  proyectado: 'Proyectado',
  comprometido: 'Comprometido',
  parcialmente_ejecutado: 'Parcialmente ejecutado',
  ejecutado: 'Ejecutado',
  liberado: 'Liberado',
  anulado: 'Anulado',
}

export const COLOR_ESTADO_COMPROMISO: Record<string, 'neutral' | 'primary' | 'success' | 'warning' | 'error'> = {
  proyectado: 'neutral',
  comprometido: 'primary',
  parcialmente_ejecutado: 'warning',
  ejecutado: 'success',
  liberado: 'neutral',
  anulado: 'error',
}

export const ETIQUETA_ESTADO_SOLICITUD: Record<string, string> = {
  borrador: 'Borrador',
  en_revision: 'En revisión',
  aprobada: 'Aprobada',
  rechazada: 'Rechazada',
  comprometida: 'Comprometida',
  ejecutada: 'Ejecutada',
  anulada: 'Anulada',
}

export const COLOR_ESTADO_SOLICITUD: Record<string, 'neutral' | 'primary' | 'success' | 'warning' | 'error'> = {
  borrador: 'neutral',
  en_revision: 'warning',
  aprobada: 'primary',
  rechazada: 'error',
  comprometida: 'primary',
  ejecutada: 'success',
  anulada: 'error',
}

/** fondo_remanentes.destino (fn_fondo_cerrar, BLOQUE O) — vocabulario cerrado porque gobierna
 * lógica real: solo 'traslado' exige y usa fondo_destino_id (Modelo §35). */
export const ETIQUETA_DESTINO_REMANENTE: Record<string, string> = {
  traslado: 'Traslado a otro fondo',
  devolucion: 'Devolución a propietarios',
  aplicacion: 'Aplicación a gasto',
}
