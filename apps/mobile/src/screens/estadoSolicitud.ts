// EXT-02 §3.4 — insignia de estado compartida entre NuevaSolicitudScreen (confirmación) y
// MisSolicitudesScreen (listado/detalle). Valores de solicitud_estado_t: los "en curso"
// (nueva/asignada/en_atencion/en_espera) no tienen matiz propio en el spec — se agrupan.
export interface EtiquetaEstado {
  texto: string
  color: string
}

export function etiquetaEstado(estado: string): EtiquetaEstado {
  switch (estado) {
    case 'recibida_externa':
      return { texto: 'En revisión', color: '#a16207' }
    case 'rechazada_triage':
      return { texto: 'No prosperó', color: '#b91c1c' }
    case 'cancelada_por_solicitante':
      return { texto: 'Cancelada', color: '#6b7280' }
    case 'anulada':
      return { texto: 'Anulada', color: '#b91c1c' }
    case 'resuelta':
    case 'cerrada':
      return { texto: 'Terminada', color: '#15803d' }
    default:
      return { texto: 'En curso', color: '#1d4ed8' }
  }
}
