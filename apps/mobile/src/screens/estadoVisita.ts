// EXT-04 §3.4 — insignia de estado para MisVisitasScreen. autorizacion_visita_estado_t (MANT-11)
// es un enum distinto de reserva_estado_t/solicitud_estado_t — valores propios, no comparte
// función con estadoReserva.ts/estadoSolicitud.ts (mismo bug ya evitado una vez en EXT-03).
export interface EtiquetaEstado {
  texto: string
  color: string
}

export function etiquetaEstadoVisita(estado: string): EtiquetaEstado {
  switch (estado) {
    case 'vigente':
      return { texto: 'Vigente', color: '#1d4ed8' }
    case 'usada':
      return { texto: 'Ya ingresó', color: '#15803d' }
    case 'vencida':
      return { texto: 'Vencida', color: '#6b7280' }
    case 'revocada':
      return { texto: 'Revocada', color: '#b91c1c' }
    default:
      return { texto: estado, color: '#6b7280' }
  }
}
