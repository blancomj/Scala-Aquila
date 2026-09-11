// EXT-03 §3.5 — insignia de estado para MisReservasScreen. reserva_estado_t (MANT-10) es un enum
// distinto de solicitud_estado_t (EXT-02) — valores diferentes, no reutiliza estadoSolicitud.ts.
export interface EtiquetaEstado {
  texto: string
  color: string
}

export function etiquetaEstadoReserva(estado: string): EtiquetaEstado {
  switch (estado) {
    case 'solicitada':
      return { texto: 'Pendiente de aprobación', color: '#a16207' }
    case 'aprobada':
      return { texto: 'Aprobada', color: '#1d4ed8' }
    case 'rechazada':
      return { texto: 'Rechazada', color: '#b91c1c' }
    case 'cancelada':
      return { texto: 'Cancelada', color: '#6b7280' }
    case 'completada':
      return { texto: 'Completada', color: '#15803d' }
    case 'no_show':
      return { texto: 'No se presentó', color: '#b91c1c' }
    default:
      return { texto: estado, color: '#6b7280' }
  }
}
