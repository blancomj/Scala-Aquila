/**
 * Etiquetas en español para los enums de `activos` (MANT-0) — un solo punto
 * de verdad compartido entre el Registro Maestro y la Ficha 360° (Fase 1/3
 * de PROMPT_IMPLEMENTACION_MANTENIMIENTO_ACTIVOS_AQUILA.md, D-88/D-90) para
 * no repetir el mismo mapa en cada pantalla (mismo criterio que
 * `formatoMoneda` en `utils/formato.ts`).
 */
export const ESTADO_LABEL: Record<string, string> = {
  planificado: 'Planificado', adquirido: 'Adquirido', instalado: 'Instalado',
  en_servicio: 'En servicio', en_mantenimiento: 'En mantenimiento', fuera_de_servicio: 'Fuera de servicio',
  en_reparacion: 'En reparación', retirado: 'Retirado', dispuesto: 'Dispuesto',
}

export const ESTADO_COLOR: Record<string, 'success' | 'warning' | 'error' | 'neutral' | 'primary'> = {
  planificado: 'neutral', adquirido: 'neutral', instalado: 'primary',
  en_servicio: 'success', en_mantenimiento: 'warning', fuera_de_servicio: 'error',
  en_reparacion: 'warning', retirado: 'neutral', dispuesto: 'neutral',
}

export const NATURALEZA_LABEL: Record<string, string> = {
  bien_comun_esencial: 'Bien común esencial',
  bien_comun_no_esencial_desafectado: 'Bien común no esencial (desafectado)',
  bien_propio: 'Bien propio',
}

export const ORIGEN_LABEL: Record<string, string> = {
  comprado: 'Comprado', recibido_constructora: 'Recibido de constructora',
  donado: 'Donado', reposicion: 'Reposición',
}

export const METODO_DEPRECIACION_LABEL: Record<string, string> = {
  linea_recta: 'Línea recta', no_deprecia: 'No deprecia',
}
