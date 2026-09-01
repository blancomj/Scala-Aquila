/** Campos disponibles para las plantillas del compositor de correo. */
export const COMPOSITOR_FIELD_REGISTRY = [
  { field: 'nombreDestinatario', sample: 'Juan Perez', description: 'Nombre del destinatario' },
  { field: 'inmuebleCodigo', sample: 'Apto 302', description: 'Codigo del inmueble asociado' },
  { field: 'saldoPendiente', sample: '$450.000', description: 'Saldo pendiente del inmueble' },
  { field: 'fechaActual', sample: '28 de agosto de 2026', description: 'Fecha de envio' },
  { field: 'remitenteNombre', sample: 'Maria Gomez - Administracion', description: 'Nombre de quien envia' },
] as const
