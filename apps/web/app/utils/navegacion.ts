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
  periodosVigencia: 'M8 2v4M16 2v4M4 6h16a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1ZM3 10h18',
  controlValidaciones: 'M12 3l7 3v6c0 4.5-3 8-7 9-4-1-7-4.5-7-9V6l7-3Z M9 12.5l2 2 4-4.5',
  conceptos:
    'M20.6 13.4 13 21a2 2 0 0 1-2.8 0l-7-7a2 2 0 0 1 0-2.8L10.8 3.6A2 2 0 0 1 12.2 3H19a2 2 0 0 1 2 2v6.8a2 2 0 0 1-.6 1.4ZM7.5 8a.5.5 0 1 1 0-1 .5.5 0 0 1 0 1Z',
  dependencias:
    'M9 12a3.5 3.5 0 0 0 5 0l3-3a3.5 3.5 0 0 0-5-5l-1 1M15 12a3.5 3.5 0 0 0-5 0l-3 3a3.5 3.5 0 0 0 5 5l1-1',
  fundamentos: 'M12 4v16M4 6h5.5L7 12a2.7 2.7 0 0 0 5 0L9.5 6M14.5 6H20l-2.5 6a2.7 2.7 0 0 0 5 0L20 6M4 21h16',
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
} as const

export const NAV_INICIO: NavItem = { label: 'Inicio', to: '/dashboard', icono: NAV_ICONOS.inicio }
export const NAV_COPROPIEDADES: NavItem = {
  label: 'Mis copropiedades',
  to: '/copropiedades',
  icono: NAV_ICONOS.copropiedades,
}
export const NAV_PLATAFORMA: NavItem = {
  label: 'Plataforma',
  to: '/plataforma',
  icono: NAV_ICONOS.plataforma,
}

export const NAV_GRUPOS: NavGrupo[] = [
  {
    titulo: 'Copropiedad',
    items: [
      { label: 'Inmuebles', to: '/inmuebles', permiso: 'data:read', icono: NAV_ICONOS.inmuebles },
      { label: 'Terceros', to: '/terceros', permiso: 'data:read', icono: NAV_ICONOS.terceros },
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
        label: 'Coeficientes',
        to: '/coeficientes',
        permiso: 'settings:manage',
        icono: NAV_ICONOS.coeficientes,
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
    titulo: 'Facturación',
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
    ],
  },
  {
    titulo: 'Recaudo y Cartera',
    items: [
      {
        label: 'Recaudo',
        to: '/recaudo',
        permiso: 'data:create',
        modulo: 'estado_cuenta',
        icono: NAV_ICONOS.pagos,
      },
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
        icono: NAV_ICONOS.carteraDashboard,
      },
      {
        label: 'Simulación de corrida',
        to: '/cartera/simulacion',
        permiso: 'data:read',
        modulo: 'cartera_cobranza',
        icono: NAV_ICONOS.carteraDashboard,
      },
      {
        label: 'Centro de escalamiento',
        to: '/cartera/escalamiento',
        permiso: 'data:read',
        modulo: 'cartera_cobranza',
        icono: NAV_ICONOS.carteraDashboard,
      },
      {
        label: 'Indicadores de cobranza',
        to: '/cartera/indicadores',
        permiso: 'data:read',
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
        label: 'Transacciones de pasarela',
        to: '/pagos/transacciones',
        permiso: 'data:read',
        modulo: 'estado_cuenta',
        icono: NAV_ICONOS.pagos,
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
        icono: NAV_ICONOS.contabilidad,
      },
      {
        label: 'Movimientos contables',
        to: '/contabilidad/movimientos',
        permiso: 'data:create',
        modulo: 'financiero',
        icono: NAV_ICONOS.contabilidad,
      },
      {
        label: 'Comprobantes',
        to: '/contabilidad/comprobantes',
        permiso: 'data:create',
        modulo: 'financiero',
        icono: NAV_ICONOS.contabilidad,
      },
      {
        label: 'Libros oficiales',
        to: '/contabilidad/libros',
        permiso: 'data:read',
        modulo: 'financiero',
        icono: NAV_ICONOS.contabilidad,
      },
      {
        label: 'Deterioro de cartera',
        to: '/contabilidad/deterioro',
        permiso: 'data:create',
        modulo: 'financiero',
        icono: NAV_ICONOS.contabilidad,
      },
      {
        label: 'Estados financieros',
        to: '/contabilidad/estados-financieros',
        permiso: 'data:read',
        modulo: 'financiero',
        icono: NAV_ICONOS.contabilidad,
      },
      {
        label: 'Cierres contables',
        to: '/contabilidad/cierres',
        permiso: 'data:read',
        modulo: 'financiero',
        icono: NAV_ICONOS.contabilidad,
      },
    ],
  },
  {
    titulo: 'Configuración',
    items: [
      {
        label: 'Datos de la copropiedad',
        to: '/configuracion',
        permiso: 'settings:manage',
        icono: NAV_ICONOS.configuracion,
      },
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
      {
        label: 'Pasarela de pago',
        to: '/configuracion/pasarela',
        permiso: 'settings:manage',
        icono: NAV_ICONOS.pagos,
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

  for (const item of [NAV_INICIO, NAV_COPROPIEDADES, NAV_PLATAFORMA]) {
    considerar(null, item)
  }
  for (const grupo of NAV_GRUPOS) {
    for (const item of grupo.items) {
      considerar(grupo.titulo, item)
    }
  }
  return mejor
}
