import type { Permission } from '~/types/permissions'

export interface NavItem {
  label: string
  to: string
  /** Sin permiso = visible para cualquier miembro del tenant (auxiliar y auditor). */
  permiso?: Permission
  /** Módulo de roles funcionales (20260830120000) que gobierna este ítem — sin
   * módulo = visible sin importar los roles funcionales asignados (comportamiento
   * de hoy). Con módulo, se oculta si el usuario tiene roles funcionales
   * asignados y ninguno cubre este módulo (ver tenantStore.puedeVerModulo). */
  modulo?: string
  icono: string
  /** Rótulo de sub-sección dentro del grupo (p. ej. separar "Activos y salud" de
   * "Operación" dentro de Mantenimiento) — puramente visual, NO es un nivel de
   * acordeón ni agrega un clic: NavSidebar.vue lo pinta como encabezado menor
   * antes del primer ítem que lo declare, y no lo repite mientras los ítems
   * siguientes compartan el mismo valor. Items sin `subgrupo` no muestran nada. */
  subgrupo?: string
}

export interface NavGrupo {
  titulo: string
  items: NavItem[]
}

/** Íconos como paths SVG sueltos (mismo patrón stroke="currentColor" que
 * BusquedaResultadoFila.vue) — sin agregar una librería de íconos nueva. Uno
 * por ítem de navegación (no solo por grupo), para que el modo colapsado del
 * sidebar siga siendo reconocible ítem a ítem. */
export const NAV_ICONOS = {
  inicio: 'M4 11.5 12 4l8 7.5M6 10v9h12v-9',
  copropiedades: 'M4 7h16v13H4zM8 7V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M4 12h16',
  inmuebles: 'M4 3h16v18H4zM8 7h2M14 7h2M8 11h2M14 11h2M8 15h2M14 15h2',
  terceros: 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm-7 8c1.2-3.5 4-5 7-5s5.8 1.5 7 5',
  resumenCuenta: 'M4 6h16M4 12h16M4 18h10',
  pagos: 'M3 6h18v12H3zM3 10h18M7 15h3',
  novedades:
    'M12 9v4m0 4h.01M10.3 3.86 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.86a2 2 0 0 0-3.4 0Z',
  presupuesto: 'M12 3v18M17 7.5c0-1.7-2.2-3-5-3s-5 1.3-5 3 2.2 3 5 3 5 1.3 5 3-2.2 3-5 3-5-1.3-5-3',
  periodosVigencia:
    'M8 2v4M16 2v4M4 6h16a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1ZM3 10h18',
  controlValidaciones: 'M12 3l7 3v6c0 4.5-3 8-7 9-4-1-7-4.5-7-9V6l7-3Z M9 12.5l2 2 4-4.5',
  conceptos:
    'M20.6 13.4 13 21a2 2 0 0 1-2.8 0l-7-7a2 2 0 0 1 0-2.8L10.8 3.6A2 2 0 0 1 12.2 3H19a2 2 0 0 1 2 2v6.8a2 2 0 0 1-.6 1.4ZM7.5 8a.5.5 0 1 1 0-1 .5.5 0 0 1 0 1Z',
  dependencias:
    'M9 12a3.5 3.5 0 0 0 5 0l3-3a3.5 3.5 0 0 0-5-5l-1 1M15 12a3.5 3.5 0 0 0-5 0l-3 3a3.5 3.5 0 0 0 5 5l1-1',
  fundamentos:
    'M12 4v16M4 6h5.5L7 12a2.7 2.7 0 0 0 5 0L9.5 6M14.5 6H20l-2.5 6a2.7 2.7 0 0 0 5 0L20 6M4 21h16',
  liquidacion: 'M9 11l3 3L22 4M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11',
  // Balanza: la partida doble, dos platos que deben quedar al mismo nivel.
  contabilidad: 'M12 3v18M7 21h10M3 8h18M6 8l-3 6a3 3 0 0 0 6 0L6 8Zm12 0-3 6a3 3 0 0 0 6 0l-3-6Z',
  coeficientes: 'M5 19 19 5M7 8a2 2 0 1 0 0-4 2 2 0 0 0 0 4Zm10 12a2 2 0 1 0 0-4 2 2 0 0 0 0 4Z',
  politicas: 'M12 3l7 3v6c0 4.5-3 8-7 9-4-1-7-4.5-7-9V6l7-3Z',
  seguridad: 'M12 3l7 3v6c0 4.5-3 8-7 9-4-1-7-4.5-7-9V6l7-3ZM9 12l2 2 4-4.5',
  configuracion:
    'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6ZM19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1-1.6 1.7 1.7 0 0 0-1.9.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.9 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1 1.7 1.7 0 0 0-.3-1.9l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.9.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.9-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.9V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1Z',
  plantillasSms: 'M3 6h18v13H3zM3 8l9 6 9-6M8 17h3',
  plantillasEmail: 'M4 5h16v14H4zM4 7l8 6 8-6',
  usuarios:
    'M9 12a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7ZM2.5 20c1-3.3 3.4-5 6.5-5s5.5 1.7 6.5 5M16 8a3 3 0 1 1 0 6M17.5 14.5c2.3.4 3.9 1.8 4.5 4.5',
  auditoria: 'M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14ZM21 21l-4.3-4.3',
  plataforma: 'M4 6h16M4 6v11a2 2 0 0 0 2 2h4M4 6l2.5-3h11L20 6M20 6v6M15 21l3-3-3-3M13 18h7',
  carteraDashboard: 'M4 19V9M10 19V5M16 19v-7M4 19h16',
  // Cofre/bóveda: efectivo restringido, no de libre disposición (PC_01 §3.2).
  fondos: 'M12 2v3M5 8a7 7 0 0 1 14 0v6c0 4-3 7-7 8-4-1-7-4-7-8V8ZM9 12h6M12 9v6',
  // Llave inglesa: mantenimiento de activos.
  mantenimiento: 'M14.7 6.3a4 4 0 0 1-5.4 5.4L4 17l3 3 5.3-5.3a4 4 0 0 1 5.4-5.4l-2.6 2.6-2-2Z',
  // Billetera con signo de moneda: posición de tesorería (FIN-1).
  tesoreria:
    'M3 7a2 2 0 0 1 2-2h13a1 1 0 0 1 1 1v3M3 7v11a2 2 0 0 0 2 2h15a1 1 0 0 0 1-1v-8a1 1 0 0 0-1-1H8a2 2 0 0 0 0 4h9.5',
  // Documento con renglones y check: factura de proveedor (FIN-2).
  facturas:
    'M7 3h10a1 1 0 0 1 1 1v16l-3-2-2 2-2-2-2 2-2-2-2 2V4a1 1 0 0 1 1-1ZM9 8h6M9 12h6M9 16h3',
  // Varias tarjetas apiladas con una flecha de salida: lote de pago agrupando facturas (FIN-3).
  lotesPago:
    'M4 7h13a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V8a1 1 0 0 1 1-1ZM7 4h13a1 1 0 0 1 1 1v2M15 12l4 4-4 4',
  // Edificio de banco (columnas + base): conciliación de RECAUDO (banco↔residente) — icono propio
  // y distinto de `tesoreria` (billetera) porque esta pantalla enlaza EL EXTRACTO del banco, no
  // el saldo/posición de la cuenta.
  conciliacionBancaria:
    'M3 21h18M4 21V10M20 21V10M4 10l8-6 8 6M8 10v11M12 10v11M16 10v11',
  // Balanza: conciliación bancaria CONTABLE (banco↔libro) — comparación/validación, no el edificio
  // de banco de arriba (esa es la de recaudo, banco↔residente). Glosario §2.
  conciliacionBancariaContable:
    'M16 16l3-8 3 8c-.87.65-1.92 1-3 1s-2.13-.35-3-1ZM2 16l3-8 3 8c-.87.65-1.92 1-3 1s-2.13-.35-3-1ZM7 21h10M12 3v18M3 7h2c2 0 5-1 7-2 2 1 5 2 7 2h2',
  // Línea ascendente con puntos: flujo de caja proyectado (FIN-4).
  flujoProyectado: 'M3 17l5-5 4 4 8-8M14 8h6v6',
  // Velocímetro: tablero de finanzas, una sola pantalla con todo (FIN-4).
  tableroFinanciero: 'M12 3a9 9 0 1 0 9 9M12 12l5-5M12 3v2M21 12h-2M5.6 5.6l1.4 1.4',
  // Edificio institucional con columnas: órganos de gobierno de la copropiedad (GOB-1).
  organosGobierno: 'M4 21h16M5 21V10.5L12 5l7 5.5V21M8 21v-7M12 21v-7M16 21v-7M4 10.5h16',
  // Personas alrededor de una mesa: reunión, convocatoria y asistencia (GOB-2).
  reunionesGobierno:
    'M17 20v-2a4 4 0 0 0-4-4H7a4 4 0 0 0-4 4v2M9 10a3 3 0 1 0 0-6 3 3 0 0 0 0 6ZM21 20v-2a3 3 0 0 0-2-2.83M16 3.13a3 3 0 0 1 0 5.74',
  // Círculo con signo de interrogación: centro de ayuda.
  ayuda:
    'M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20ZM9.5 9a2.5 2.5 0 0 1 4.9.8c0 1.7-2.4 2-2.4 3.7M12 17h.01',
  // Círculo con check: una decisión con efecto ya adoptado (GOB-5).
  decisionesGobierno: 'M9 12l2 2 4-4M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z',
  // Lista con checks: seguimiento de compromisos por responsable (GOB-5).
  compromisosGobierno: 'M9 6h11M9 12h11M9 18h11M4 5.5l1 1 2-2M4 11.5l1 1 2-2M4 17.5l1 1 2-2',
  // Escudo con signo de interrogación: impugnación de decisiones y sanciones (GOB-7).
  impugnacionGobierno: 'M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6l8-3ZM12 8.5v3.25M12 15.25h.01',
  // Globo de mensaje: atención al propietario/residente y consulta sin sesión (GOB-8).
  atencionGobierno:
    'M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v10ZM8 9h8M8 12.5h5',
  // Escudo con signo de alerta: expedientes de convivencia y régimen sancionatorio (GOB-6).
  convivenciaGobierno: 'M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6l8-3ZM12 8v5M12 16h.01',
  // Cuadrícula de paneles: tablero que agrega lo de todos los cortes de gobierno (GOB-9).
  tableroGobierno: 'M4 4h7v7H4zM13 4h7v4h-7zM13 11h7v9h-7zM4 14h7v6H4z',
  // Sobre: histórico unificado de correo enviado por cualquier módulo (COM-1).
  comunicaciones: 'M3 8l9 6 9-6M4 6h16a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1Z',
  // Libreta abierta: fichas de negocios y servicios de la copropiedad (EXS-4).
  directorio: 'M4 5a2 2 0 0 1 2-2h12v18H6a2 2 0 0 1-2-2V5ZM8 7h8M8 11h5',
  // Megáfono: comunicación oficial publicada (EXS-3). Icono propio y no el
  // sobre de COM-1 a propósito — son cosas distintas: uno es el contenido
  // publicado, el otro el registro de lo que salió por correo.
  anuncios: 'M3 11v2a1 1 0 0 0 1 1h2l4 4V6L6 10H4a1 1 0 0 0-1 1ZM14 8a4 4 0 0 1 0 8M17 5a8 8 0 0 1 0 14',
  // Automóvil de perfil: vehículos y permisos de acceso (EXS-5).
  movilidad: 'M5 17h14M6.5 17a1.5 1.5 0 1 1-3 0 1.5 1.5 0 0 1 3 0ZM20.5 17a1.5 1.5 0 1 1-3 0 1.5 1.5 0 0 1 3 0ZM4 17v-4l2-5h12l2 5v4M6 13h12',
  // Tablón con chincheta: avisos entre vecinos (EXS-6). NO un carrito ni la
  // etiqueta de precio de `conceptos` — aquí no se compra nada y el icono no
  // debe prometerlo; además repetir un path haría ilegible el sidebar
  // colapsado, que es justo lo que esta tabla existe para evitar.
  marketplace: 'M4 7h16a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V8a1 1 0 0 1 1-1ZM12 4v3M8 12h8M8 15h5',
  // Bandeja de entrada: lo que espera una decisión de quien mira (EXS-7).
  asuntos: 'M4 13h4l1.5 3h5L16 13h4M4 13l2.5-7.5a1 1 0 0 1 1-.5h9a1 1 0 0 1 1 .5L20 13v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1v-5Z',

  // --- D-96: íconos propios para los ítems de Mantenimiento y de la
  // operación de Cartera y Cobranza que hasta ahora compartían un único
  // ícono genérico (mantenimiento/carteraDashboard) — "Activos" y "Dashboard
  // de Cartera" quedan como están por ser el ítem insignia de cada grupo; el
  // resto de esta sección son íconos nuevos, uno por ítem.
  // Electrocardiograma: salud del activo, no la llave inglesa genérica.
  saludActivo: 'M3 12H7L9 5L13 19L15 12H21',
  // Dos flechas divergiendo desde el centro: la bifurcación reparar-o-reemplazar.
  escenariosMantenimiento: 'M9 12H3M6 8 3 12l3 4M15 12h6M18 8l3 4-3 4',
  // Pin de mapa con signo de alerta: dónde está el riesgo, no qué se repara.
  mapaRiesgo:
    'M12 21s7-6.5 7-12a7 7 0 1 0-14 0c0 5.5 7 12 7 12ZM12 6v5M12 14h.01',
  // Portapapeles con lista: un plan es un documento con tareas, no una llave inglesa.
  planesMantenimiento:
    'M9 3h6a1 1 0 0 1 1 1v1h1a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1h1V4a1 1 0 0 1 1-1ZM9 11h6M9 15h4',
  // Medalla/certificado: cumplimiento normativo es una certificación, no una reparación.
  cumplimientoNormativo: 'M12 14a5 5 0 1 0 0-10 5 5 0 0 0 0 10ZM8.5 13 7 21l5-3 5 3-1.5-8',
  // Círculo con exclamación: una incidencia es un evento que alerta, distinto
  // del triángulo ya usado en "Novedades" y del círculo con check de decisiones.
  incidencias: 'M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20ZM12 8v5M12 16h.01',
  // Boleta/talonario: una orden de trabajo es un documento de trabajo, no la herramienta.
  ordenesTrabajo:
    'M4 8a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v2a2 2 0 0 0 0 4v2a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-2a2 2 0 0 0 0-4V8ZM9 8v8',
  // Lupa con check: inspeccionar es verificar, distinto de la lupa sola de auditoría.
  inspecciones: 'M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14ZM8.5 11l1.8 1.8L14.5 9M21 21l-4.3-4.3',
  // Camión de reparto: proveedores y contratistas traen algo a la copropiedad.
  proveedoresContratistas:
    'M3 7h11v8H3zM14 10h4l3 3v2h-7v-5ZM6.5 18a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3ZM17.5 18a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3Z',
  // Documento con firma: un contrato se firma, no se repara.
  contratos: 'M6 3h9l5 5v13a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1ZM14 3v5h5M8 16c1-1.2 2-1.2 3 0s2 1.2 3 0',
  // Caja 3D: inventario es lo que hay en existencia, no una reparación.
  inventario: 'M12 2 3 7l9 5 9-5-9-5ZM3 7v10l9 5 9-5V7M12 12v10',
  // Gráfico de torta: indicadores de mantenimiento, distinto de las barras de Cartera.
  indicadoresMantenimiento: 'M21.21 15.89A10 10 0 1 1 8 2.83M22 12A10 10 0 0 0 12 2v10z',
  // Auricular de teléfono: una acción de cobranza es una llamada/gestión, no el tablero.
  accionesCobranza:
    'M6.6 10.8a15 15 0 0 0 6.6 6.6l2.2-2.2a1 1 0 0 1 1-.2c1.1.4 2.3.6 3.6.6a1 1 0 0 1 1 1V20a1 1 0 0 1-1 1A17 17 0 0 1 3 4a1 1 0 0 1 1-1h3.5a1 1 0 0 1 1 1c0 1.3.2 2.5.6 3.6a1 1 0 0 1-.2 1L6.6 10.8Z',
  // Matraz: una simulación es un experimento sobre datos, no el tablero real.
  simulacionCorrida: 'M9 3h6M10 3v5.5L4.9 17.6A2 2 0 0 0 6.6 21h10.8a2 2 0 0 0 1.7-3.4L14 8.5V3',
  // Escalones ascendentes: escalar un caso sube de nivel, no es una barra de dashboard.
  centroEscalamiento: 'M3 21h4v-4h4v-4h4v-4h4V3M18 3h3v3',
  // Diana: indicadores de cobranza son una meta que se persigue, no un dashboard genérico.
  indicadoresCobranza: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18ZM12 16a4 4 0 1 0 0-8 4 4 0 0 0 0 8ZM12 12h.01',

  // --- D-97: mismo problema que D-96 pero en Contabilidad — 9 ítems
  // compartían la balanza de `contabilidad`. "Plan de cuentas contable" la
  // conserva por ser la base de todo el módulo (equivalente a "Activos" en
  // Mantenimiento); el resto son íconos nuevos, uno por ítem.
  // Dos casillas conectadas por una flecha: mapear una cuenta origen a una destino.
  mapeoContable: 'M3 5h6v6H3zM15 5h6v6h-6zM9 8h6M13 6l2 2-2 2',
  // Flechas opuestas: un movimiento contable mueve valor entre cuentas.
  movimientosContables: 'M4 7h13l-3-3M20 17H7l3 3',
  // Recibo con borde dentado: un comprobante es el papel, no la balanza.
  comprobantes: 'M6 3h12v17l-2-1-2 1-2-1-2 1-2-1-2 1V3ZM9 8h6M9 12h6',
  // Libro abierto: los libros oficiales son un registro encuadernado, no la balanza.
  librosOficiales:
    'M12 6c-1.5-1.3-3.5-2-6-2H4v14h2c2.5 0 4.5.7 6 2 1.5-1.3 3.5-2 6-2h2V4h-2c-2.5 0-4.5.7-6 2ZM12 6v14',
  // Línea descendente: deterioro es una pérdida de valor, espejo de flujoProyectado (que sube).
  deterioroCartera: 'M3 7l6 6 4-4 8 8M15 17h6v-6',
  // Reloj/engranaje simplificado: la depreciación es valor que se consume con el tiempo de uso.
  depreciacionActivos: 'M12 3a9 9 0 1 0 9 9M12 3v9l6 3M16 3h5v5',
  // Documento con barras: un estado financiero es un reporte con cifras, no la balanza sola.
  estadosFinancieros: 'M5 3h14v18H5zM8 17v-4M12 17v-7M16 17v-2',
  // Candado: cerrar un período contable es bloquearlo, no pesarlo en la balanza.
  cierresContables: 'M6 11V7a6 6 0 0 1 12 0v4M5 11h14v10H5zM12 15v3',
  // Documento con signo de porcentaje: la obligación tributaria es un impuesto sobre un valor.
  obligacionesTributarias:
    'M6 3h9l5 5v13a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1ZM14 3v5h5M9 16l6-6M9.5 11a.5.5 0 1 0 0-1 .5.5 0 0 0 0 1ZM14.5 16a.5.5 0 1 0 0-1 .5.5 0 0 0 0 1Z',
  // Documento con flecha hacia arriba: rendir cuentas es entregar/someter un informe.
  rendicionCuentas:
    'M6 3h9l5 5v13a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1ZM14 3v5h5M12 17v-5M9.5 14.5 12 12l2.5 2.5',
  // Chispa de cuatro puntas con dos destellos pequeños: proveedor de IA, no
  // un robot — esta pantalla configura de dónde sale la inteligencia, no
  // una funcionalidad de IA en sí misma.
  proveedorIa:
    'M11 2 9.3 7.3 4 9l5.3 1.7L11 16l1.7-5.3L18 9l-5.3-1.7ZM19 3v3.5M17.3 4.8h3.4M5 16v2.5M3.8 17.3h2.4',
  ordenMenu: 'M4 6h16M4 12h16M4 18h16',
} as const

export const NAV_INICIO: NavItem = { label: 'Inicio', to: '/dashboard', icono: NAV_ICONOS.inicio }
export const NAV_COPROPIEDADES: NavItem = {
  label: 'Mis copropiedades',
  to: '/copropiedades',
  icono: NAV_ICONOS.copropiedades,
}
/** EXS-7 — va en el bloque superior y no dentro de un grupo de módulo a
 * propósito: no es un módulo más, es la bandeja de trabajo de quien mira, y
 * reúne cosas de cuatro dominios distintos. */
export const NAV_ASUNTOS: NavItem = {
  label: 'Mis asuntos',
  to: '/asuntos',
  icono: NAV_ICONOS.asuntos,
}
export const NAV_PLATAFORMA: NavItem = {
  label: 'Plataforma',
  to: '/plataforma',
  icono: NAV_ICONOS.plataforma,
}
/** Sin `permiso` ni `modulo`: visible para cualquier usuario autenticado, sin
 * importar tenant activo ni rol. */
export const NAV_AYUDA: NavItem = { label: 'Ayuda', to: '/ayuda', icono: NAV_ICONOS.ayuda }

export const NAV_GRUPOS: NavGrupo[] = [
  {
    // Contenido y vida social de la copropiedad — lo que un residente consulta
    // día a día. Separado de "Copropiedad" (catálogos maestros) porque son
    // audiencias/frecuencias de uso distintas, no la misma cosa repartida al
    // azar. Reservas y Visitantes/acceso vienen de Mantenimiento: de cara al
    // usuario son trámites de convivencia, no mantenimiento de activos.
    titulo: 'Comunidad',
    items: [
      { label: 'Anuncios', to: '/anuncios', permiso: 'data:read', icono: NAV_ICONOS.anuncios },
      { label: 'Directorio', to: '/directorio', permiso: 'data:read', icono: NAV_ICONOS.directorio },
      {
        label: 'Marketplace',
        to: '/marketplace',
        permiso: 'data:read',
        icono: NAV_ICONOS.marketplace,
      },
      { label: 'Movilidad', to: '/movilidad', permiso: 'data:read', icono: NAV_ICONOS.movilidad },
      {
        label: 'Reservas de zonas comunes',
        to: '/mantenimiento/reservas',
        permiso: 'data:read',
        icono: NAV_ICONOS.periodosVigencia,
      },
      {
        label: 'Visitantes y acceso',
        to: '/mantenimiento/acceso',
        permiso: 'data:read',
        icono: NAV_ICONOS.terceros,
      },
    ],
  },
  {
    // Catálogos maestros de la propiedad física — se configuran una vez y se
    // consultan seguido, a diferencia de "Configuración" (ajustes de todo el
    // sistema) o de "Comunidad" (contenido social).
    titulo: 'Copropiedad',
    items: [
      { label: 'Inmuebles', to: '/inmuebles', permiso: 'data:read', icono: NAV_ICONOS.inmuebles },
      { label: 'Terceros', to: '/terceros', permiso: 'data:read', icono: NAV_ICONOS.terceros },
      {
        label: 'Configuración',
        to: '/configuracion',
        permiso: 'settings:manage',
        icono: NAV_ICONOS.configuracion,
      },
    ],
  },
  {
    titulo: 'Presupuesto',
    items: [
      {
        label: 'Presupuesto',
        to: '/presupuesto',
        permiso: 'data:create',
        modulo: 'financiero',
        icono: NAV_ICONOS.presupuesto,
      },
      {
        label: 'Periodos y vigencia',
        to: '/presupuesto/periodos',
        permiso: 'data:create',
        modulo: 'financiero',
        icono: NAV_ICONOS.periodosVigencia,
      },
      {
        label: 'Control y validaciones',
        to: '/presupuesto/control',
        permiso: 'data:create',
        modulo: 'financiero',
        icono: NAV_ICONOS.controlValidaciones,
      },
      {
        label: 'Fundamentos normativos',
        to: '/fundamentos',
        permiso: 'data:create',
        modulo: 'financiero',
        icono: NAV_ICONOS.fundamentos,
      },
    ],
  },
  {
    // Facturación (antes su propio grupo) + Recaudo del día a día (antes
    // mezclado con toda la cartera de mora) — es un mismo ciclo operativo:
    // generar el cobro y recibirlo. La cartera en mora/jurídica queda aparte.
    titulo: 'Facturación y Recaudo',
    items: [
      {
        label: 'Conceptos',
        to: '/estado-cuenta/conceptos',
        permiso: 'data:create',
        modulo: 'estado_cuenta',
        icono: NAV_ICONOS.conceptos,
      },
      {
        label: 'Dependencias',
        to: '/conceptos/dependencias',
        permiso: 'data:read',
        modulo: 'financiero',
        icono: NAV_ICONOS.dependencias,
      },
      {
        label: 'Novedades',
        to: '/estado-cuenta/novedades',
        permiso: 'data:create',
        modulo: 'estado_cuenta',
        icono: NAV_ICONOS.novedades,
      },
      {
        label: 'Liquidación',
        to: '/liquidacion',
        permiso: 'data:create',
        modulo: 'financiero',
        icono: NAV_ICONOS.liquidacion,
      },
      {
        label: 'Estados de cuenta',
        to: '/estado-cuenta',
        permiso: 'data:read',
        modulo: 'estado_cuenta',
        icono: NAV_ICONOS.resumenCuenta,
      },
      {
        label: 'Recaudo',
        to: '/recaudo',
        permiso: 'data:create',
        modulo: 'estado_cuenta',
        icono: NAV_ICONOS.pagos,
      },
      {
        label: 'Transacciones de pasarela',
        to: '/pagos/transacciones',
        permiso: 'data:read',
        modulo: 'estado_cuenta',
        icono: NAV_ICONOS.pagos,
      },
    ],
  },
  {
    // Módulo cartera_cobranza completo: operación de cobranza + lo jurídico.
    // Antes vivía junto con Recaudo (operación diaria de otro módulo), lo que
    // hacía este grupo casi el doble de grande sin necesidad.
    titulo: 'Cartera y Cobranza',
    items: [
      {
        label: 'Dashboard de Cartera',
        to: '/cartera',
        permiso: 'data:read',
        modulo: 'cartera_cobranza',
        icono: NAV_ICONOS.carteraDashboard,
      },
      {
        label: 'Acciones de cobranza',
        to: '/cartera/acciones',
        permiso: 'data:read',
        modulo: 'cartera_cobranza',
        icono: NAV_ICONOS.accionesCobranza,
      },
      {
        label: 'Simulación de corrida',
        to: '/cartera/simulacion',
        permiso: 'data:read',
        modulo: 'cartera_cobranza',
        icono: NAV_ICONOS.simulacionCorrida,
      },
      {
        label: 'Centro de escalamiento',
        to: '/cartera/escalamiento',
        permiso: 'data:read',
        modulo: 'cartera_cobranza',
        icono: NAV_ICONOS.centroEscalamiento,
      },
      {
        label: 'Indicadores de cobranza',
        to: '/cartera/indicadores',
        permiso: 'data:read',
        modulo: 'cartera_cobranza',
        icono: NAV_ICONOS.indicadoresCobranza,
      },
      {
        label: 'Certificaciones de deuda',
        to: '/cartera/certificaciones',
        permiso: 'data:create',
        modulo: 'cartera_cobranza',
        icono: NAV_ICONOS.carteraDashboard,
      },
      {
        label: 'Casos jurídicos',
        to: '/cartera/juridico',
        permiso: 'data:create',
        modulo: 'cartera_cobranza',
        icono: NAV_ICONOS.carteraDashboard,
      },
      {
        label: 'Actos interruptivos de prescripción',
        to: '/cartera/prescripcion',
        permiso: 'data:create',
        modulo: 'cartera_cobranza',
        icono: NAV_ICONOS.carteraDashboard,
      },
      {
        label: 'Transferencias de propiedad',
        to: '/cartera/transferencias',
        permiso: 'data:create',
        modulo: 'cartera_cobranza',
        icono: NAV_ICONOS.carteraDashboard,
      },
      {
        label: 'Promesas y acuerdos de pago',
        to: '/cartera/promesas-acuerdos',
        permiso: 'data:create',
        modulo: 'cartera_cobranza',
        icono: NAV_ICONOS.carteraDashboard,
      },
      {
        label: 'Configuración de cartera',
        to: '/cartera/configuracion',
        permiso: 'settings:manage',
        modulo: 'cartera_cobranza',
        icono: NAV_ICONOS.configuracion,
      },
    ],
  },
  {
    titulo: 'Contabilidad',
    items: [
      {
        label: 'Configuración contable',
        to: '/contabilidad/configuracion',
        permiso: 'settings:manage',
        modulo: 'financiero',
        icono: NAV_ICONOS.configuracion,
      },
      {
        label: 'Plan de cuentas contable',
        to: '/contabilidad/plan-de-cuentas',
        permiso: 'data:create',
        modulo: 'financiero',
        icono: NAV_ICONOS.contabilidad,
      },
      {
        label: 'Mapeo contable',
        to: '/contabilidad/mapeo',
        permiso: 'data:create',
        modulo: 'financiero',
        icono: NAV_ICONOS.mapeoContable,
      },
      {
        label: 'Movimientos contables',
        to: '/contabilidad/movimientos',
        permiso: 'data:create',
        modulo: 'financiero',
        icono: NAV_ICONOS.movimientosContables,
      },
      {
        label: 'Comprobantes',
        to: '/contabilidad/comprobantes',
        permiso: 'data:create',
        modulo: 'financiero',
        icono: NAV_ICONOS.comprobantes,
      },
      {
        label: 'Libros oficiales',
        to: '/contabilidad/libros',
        permiso: 'data:read',
        modulo: 'financiero',
        icono: NAV_ICONOS.librosOficiales,
      },
      {
        label: 'Deterioro de cartera',
        to: '/contabilidad/deterioro',
        permiso: 'data:create',
        modulo: 'financiero',
        icono: NAV_ICONOS.deterioroCartera,
      },
      {
        label: 'Depreciación por defecto',
        to: '/contabilidad/depreciacion',
        permiso: 'data:create',
        modulo: 'financiero',
        icono: NAV_ICONOS.depreciacionActivos,
      },
      {
        label: 'Estados financieros',
        to: '/contabilidad/estados-financieros',
        permiso: 'data:read',
        modulo: 'financiero',
        icono: NAV_ICONOS.estadosFinancieros,
      },
      {
        label: 'Cierres contables',
        to: '/contabilidad/cierres',
        permiso: 'data:read',
        modulo: 'financiero',
        icono: NAV_ICONOS.cierresContables,
      },
      {
        label: 'Obligaciones tributarias',
        to: '/contabilidad/tributario',
        permiso: 'data:read',
        modulo: 'financiero',
        icono: NAV_ICONOS.obligacionesTributarias,
      },
      {
        label: 'Rendición de cuentas',
        to: '/contabilidad/rendicion',
        permiso: 'data:read',
        modulo: 'financiero',
        icono: NAV_ICONOS.rendicionCuentas,
      },
    ],
  },
  {
    titulo: 'Finanzas',
    items: [
      {
        label: 'Posición de tesorería',
        to: '/finanzas/posicion',
        permiso: 'data:read',
        modulo: 'financiero',
        icono: NAV_ICONOS.tesoreria,
      },
      {
        label: 'Facturas de proveedor',
        to: '/finanzas/facturas',
        permiso: 'data:read',
        modulo: 'financiero',
        icono: NAV_ICONOS.facturas,
      },
      {
        label: 'Lotes de pago',
        to: '/finanzas/pagos',
        permiso: 'data:read',
        modulo: 'financiero',
        icono: NAV_ICONOS.lotesPago,
      },
      {
        label: 'Conciliación de Recaudo',
        to: '/finanzas/conciliacion',
        permiso: 'data:read',
        modulo: 'financiero',
        icono: NAV_ICONOS.conciliacionBancaria,
      },
      {
        // Contable (banco↔libro) — distinta de la de arriba (recaudo, banco↔residente). D-CB-6.
        label: 'Conciliación Contable',
        to: '/finanzas/conciliacion-bancaria',
        permiso: 'data:read',
        modulo: 'financiero',
        icono: NAV_ICONOS.conciliacionBancariaContable,
      },
      {
        label: 'Flujo de caja proyectado',
        to: '/finanzas/flujo-proyectado',
        permiso: 'data:read',
        modulo: 'financiero',
        icono: NAV_ICONOS.flujoProyectado,
      },
      {
        label: 'Tablero de finanzas',
        to: '/finanzas/tablero',
        permiso: 'data:read',
        modulo: 'financiero',
        icono: NAV_ICONOS.tableroFinanciero,
      },
    ],
  },
  {
    // Reubicado junto a Finanzas: efectivo restringido es parte de la misma
    // familia de tesorería, no del ciclo Presupuesto→Facturación.
    titulo: 'Fondos',
    items: [
      {
        label: 'Fondos',
        to: '/fondos',
        permiso: 'data:read',
        modulo: 'financiero',
        icono: NAV_ICONOS.fondos,
      },
    ],
  },
  {
    // Reservas y Visitantes/acceso se fueron a "Comunidad" (D-95) — de cara al
    // residente son trámites, no mantenimiento de activos. `subgrupo` agrupa
    // visualmente los 15 ítems restantes SIN fragmentar el menú en 5 grupos:
    // sigue siendo un solo acordeón (ver NavSidebar.vue).
    titulo: 'Mantenimiento',
    items: [
      {
        label: 'Activos',
        to: '/mantenimiento/activos',
        permiso: 'data:read',
        icono: NAV_ICONOS.mantenimiento,
        subgrupo: 'Activos y salud',
      },
      {
        label: 'Salud de los activos',
        to: '/mantenimiento/salud',
        permiso: 'data:read',
        icono: NAV_ICONOS.saludActivo,
        subgrupo: 'Activos y salud',
      },
      {
        label: 'Escenarios: reparar o reemplazar',
        to: '/mantenimiento/salud/escenarios',
        permiso: 'data:read',
        icono: NAV_ICONOS.escenariosMantenimiento,
        subgrupo: 'Activos y salud',
      },
      {
        label: 'Mapa de riesgo',
        to: '/mantenimiento/salud/mapa-riesgo',
        permiso: 'data:read',
        icono: NAV_ICONOS.mapaRiesgo,
        subgrupo: 'Activos y salud',
      },
      {
        label: 'Configuración de salud',
        to: '/mantenimiento/salud/configuracion',
        permiso: 'settings:manage',
        icono: NAV_ICONOS.configuracion,
        subgrupo: 'Activos y salud',
      },
      {
        label: 'Planes de mantenimiento',
        to: '/mantenimiento/planes',
        permiso: 'data:read',
        icono: NAV_ICONOS.planesMantenimiento,
        subgrupo: 'Operación',
      },
      {
        label: 'Cumplimiento normativo',
        to: '/mantenimiento/cumplimiento',
        permiso: 'data:read',
        icono: NAV_ICONOS.cumplimientoNormativo,
        subgrupo: 'Operación',
      },
      {
        label: 'Incidencias',
        to: '/mantenimiento/incidencias',
        permiso: 'data:read',
        icono: NAV_ICONOS.incidencias,
        subgrupo: 'Operación',
      },
      {
        label: 'Órdenes de trabajo',
        to: '/mantenimiento/ordenes-trabajo',
        permiso: 'data:read',
        icono: NAV_ICONOS.ordenesTrabajo,
        subgrupo: 'Operación',
      },
      {
        label: 'Inspecciones',
        to: '/mantenimiento/inspecciones',
        permiso: 'data:read',
        icono: NAV_ICONOS.inspecciones,
        subgrupo: 'Operación',
      },
      {
        label: 'Proveedores y contratistas',
        to: '/mantenimiento/proveedores',
        permiso: 'data:read',
        icono: NAV_ICONOS.proveedoresContratistas,
        subgrupo: 'Proveedores y recursos',
      },
      {
        label: 'Contratos',
        to: '/mantenimiento/contratos',
        permiso: 'data:read',
        icono: NAV_ICONOS.contratos,
        subgrupo: 'Proveedores y recursos',
      },
      {
        label: 'Inventario',
        to: '/mantenimiento/inventario',
        permiso: 'data:read',
        icono: NAV_ICONOS.inventario,
        subgrupo: 'Proveedores y recursos',
      },
      {
        label: 'Indicadores',
        to: '/mantenimiento/indicadores',
        permiso: 'data:read',
        icono: NAV_ICONOS.indicadoresMantenimiento,
        subgrupo: 'Indicadores y configuración',
      },
      {
        label: 'Configuración de mantenimiento',
        to: '/mantenimiento/configuracion',
        permiso: 'settings:manage',
        icono: NAV_ICONOS.configuracion,
        subgrupo: 'Indicadores y configuración',
      },
    ],
  },
  {
    titulo: 'Gobierno',
    items: [
      {
        label: 'Tablero',
        to: '/gobierno/tablero',
        permiso: 'data:read',
        icono: NAV_ICONOS.tableroGobierno,
      },
      {
        label: 'Órganos de gobierno',
        to: '/gobierno/organos',
        permiso: 'data:read',
        icono: NAV_ICONOS.organosGobierno,
      },
      {
        label: 'Reuniones',
        to: '/gobierno/reuniones',
        permiso: 'data:read',
        icono: NAV_ICONOS.reunionesGobierno,
      },
      {
        label: 'Decisiones',
        to: '/gobierno/decisiones',
        permiso: 'data:read',
        icono: NAV_ICONOS.decisionesGobierno,
      },
      {
        label: 'Compromisos',
        to: '/gobierno/compromisos',
        permiso: 'data:read',
        icono: NAV_ICONOS.compromisosGobierno,
      },
      {
        label: 'Convivencia y sanciones',
        to: '/gobierno/convivencia',
        permiso: 'data:read',
        icono: NAV_ICONOS.convivenciaGobierno,
      },
      {
        label: 'Impugnaciones',
        to: '/gobierno/impugnaciones',
        permiso: 'data:read',
        icono: NAV_ICONOS.impugnacionGobierno,
      },
      {
        label: 'Atención al propietario',
        to: '/atencion',
        permiso: 'data:read',
        icono: NAV_ICONOS.atencionGobierno,
      },
    ],
  },
  {
    // Consolida lo que antes estaba partido entre "Configuración" (las dos
    // plantillas) y "Seguridad" (el histórico) sin relación visible — es un
    // mismo tema: comunicación saliente de la copropiedad.
    titulo: 'Comunicaciones',
    items: [
      {
        label: 'Comunicaciones',
        to: '/comunicaciones',
        permiso: 'audit:view',
        icono: NAV_ICONOS.comunicaciones,
      },
      {
        label: 'Plantillas de correo',
        to: '/configuracion/plantillas-email',
        permiso: 'settings:manage',
        icono: NAV_ICONOS.plantillasEmail,
      },
      {
        label: 'Plantillas SMS',
        to: '/configuracion/plantillas-sms',
        permiso: 'settings:manage',
        icono: NAV_ICONOS.plantillasSms,
      },
    ],
  },
  {
    // "Datos de la copropiedad" se fue a Copropiedad como "Configuración".
    // Lo que queda aquí es configuración transversal a todo el tenant, no de
    // un módulo puntual (esos viven al final de su propio grupo: Configuración
    // de cartera, de mantenimiento, de salud, contable).
    titulo: 'Configuración',
    items: [
      {
        label: 'Políticas financieras',
        to: '/politicas',
        permiso: 'settings:manage',
        icono: NAV_ICONOS.politicas,
      },
      {
        label: 'Catálogos',
        to: '/configuracion/catalogos',
        permiso: 'settings:manage',
        icono: NAV_ICONOS.dependencias,
      },
      {
        label: 'Motivos de novedad',
        to: '/configuracion/motivos-novedad',
        permiso: 'settings:manage',
        icono: NAV_ICONOS.dependencias,
      },
      {
        label: 'Consecutivos de documento',
        to: '/configuracion/consecutivos',
        permiso: 'settings:manage',
        icono: NAV_ICONOS.pagos,
      },
      {
        label: 'Pasarela de pago',
        to: '/configuracion/pasarela',
        permiso: 'settings:manage',
        icono: NAV_ICONOS.pagos,
      },
      {
        label: 'Proveedor de IA',
        to: '/configuracion/ia',
        permiso: 'settings:manage',
        icono: NAV_ICONOS.proveedorIa,
      },
      {
        label: 'Zonas comunes',
        to: '/configuracion/zonas-comunes',
        permiso: 'settings:manage',
        icono: NAV_ICONOS.dependencias,
      },
      {
        label: 'Agrupaciones',
        to: '/configuracion/agrupaciones',
        permiso: 'settings:manage',
        icono: NAV_ICONOS.dependencias,
      },
      {
        label: 'Orden del menú',
        to: '/configuracion/menu',
        permiso: 'settings:manage',
        icono: NAV_ICONOS.ordenMenu,
      },
      {
        label: 'Coeficientes',
        to: '/coeficientes',
        permiso: 'settings:manage',
        icono: NAV_ICONOS.coeficientes,
      },
    ],
  },
  {
    titulo: 'Seguridad',
    items: [
      {
        label: 'Roles y accesos',
        to: '/seguridad',
        permiso: 'users:manage',
        icono: NAV_ICONOS.seguridad,
      },
      { label: 'Usuarios', to: '/usuarios', permiso: 'users:manage', icono: NAV_ICONOS.usuarios },
      { label: 'Auditoría', to: '/auditoria', permiso: 'audit:view', icono: NAV_ICONOS.auditoria },
    ],
  },
]

export interface MigaPan {
  grupo: string | null
  item: NavItem
}

/** Deriva el breadcrumb del header a partir de la misma config de
 * navegación — no hay un sistema de títulos de página aparte, así que el
 * breadcrumb no puede tener más niveles que Grupo/Ítem (nada de un tercer
 * nivel "Editar fórmula" inventado sin esa info). */
export function buscarMigaPan(path: string): MigaPan | null {
  const coincide = (to: string): boolean => path === to || path.startsWith(`${to}/`)

  // Gana el `to` más largo que coincida, no el primero: con rutas anidadas
  // (p. ej. /configuracion y /configuracion/plantillas-sms) el primero en
  // declararse podía "ganarle" por prefijo a la ruta más específica.
  let mejor: MigaPan | null = null
  const considerar = (grupo: string | null, item: NavItem): void => {
    if (!coincide(item.to)) return
    if (!mejor || item.to.length > mejor.item.to.length) mejor = { grupo, item }
  }

  for (const item of [NAV_INICIO, NAV_COPROPIEDADES, NAV_PLATAFORMA, NAV_AYUDA]) {
    considerar(null, item)
  }
  for (const grupo of NAV_GRUPOS) {
    for (const item of grupo.items) {
      considerar(grupo.titulo, item)
    }
  }
  return mejor
}
