/**
 * Motor de Reportes — catálogo, definiciones y ejecución (RPT-01, D-136).
 *
 * Todo pasa por `fn_reporte_ejecutar`, SECURITY INVOKER. La RLS del usuario
 * aplica sola a través de las vistas `vr_*`, pero **desde RPT-05 el tenant
 * viaja también como argumento** (`p_tenant_id`) y el compilador lo antepone
 * como condición: el ejecutor programado corre con `service_role`, que
 * atraviesa la RLS, y esa condición es lo único que lo separa todo (D-141).
 *
 * Los PARÁMETROS se resuelven antes de llamar, no en la base: la definición
 * guarda `{ campo, operador, parametro }` y hay que convertirlo en
 * `{ campo, operador, valor }`. Esa traducción vive en `@aquila/reporting`
 * desde RPT-05, porque el despachador de reportes programados —que corre en
 * Deno— necesita exactamente la misma regla.
 */
import { defineStore } from 'pinia'
import { resolverFiltros as resolverFiltrosCompartido } from '@aquila/reporting'
import type { Database } from '@aquila/shared'

export type CampoCatalogo = {
  codigo: string
  etiqueta: string
  descripcion: string | null
  tipo_dato: 'texto' | 'numero' | 'dinero' | 'fecha' | 'booleano' | 'porcentaje'
  clase: 'dimension' | 'metrica'
  agregacion_default: string | null
  filtrable: boolean
  ordenable: boolean
  agrupable: boolean
  orden: number
}

export type FuenteCatalogo = {
  codigo: string
  nombre: string
  descripcion: string | null
  modulo: string
  filtro_obligatorio: string | null
  campos: CampoCatalogo[]
}

export type ParametroDefinicion = {
  codigo: string
  etiqueta: string
  tipo: 'fecha' | 'texto' | 'numero' | 'booleano'
  requerido: boolean
  /** De dónde sale el valor sugerido la primera vez que se abre el reporte. */
  origen?: 'hoy' | 'inicio_mes' | 'ultimo_corte_cartera'
}

export type FiltroDefinicion = {
  campo: string
  operador: string
  valor?: unknown
  parametro?: string
  parametro_desde?: string
  parametro_hasta?: string
  desde?: unknown
  hasta?: unknown
}

export type DefinicionReporte = {
  fuente: string
  /**
   * `alias` es solo el encabezado que ve el usuario: el compilador nunca lo
   * recibe (la columna de salida se llama siempre como el campo del
   * catálogo), así que un alias no puede colar nada en el SQL.
   */
  campos: { campo: string; agregacion?: string; alias?: string }[]
  filtros?: FiltroDefinicion[]
  agrupar?: string[]
  orden?: { campo: string; direccion?: 'asc' | 'desc' }[]
  parametros?: ParametroDefinicion[]
}

export type VersionReporte = {
  id: string
  version: number
  estado: 'borrador' | 'publicada' | 'archivada'
  definicion: DefinicionReporte
}

export type ReporteListado = {
  id: string
  codigo: string
  nombre: string
  descripcion: string | null
  del_sistema: boolean
  categoria: string | null
  versionPublicada: VersionReporte | null
  /** Borrador abierto, si lo hay: es lo que el diseñador reabre. */
  versionBorrador: VersionReporte | null
}

export type ResultadoEjecucion = {
  filas: Record<string, unknown>[]
  total_filas: number
  truncado: boolean
  duracion_ms: number
  fuente: string
}

/** Una corrida tal como la muestra el historial (RPT-04). */
export type EjecucionHistorial = {
  id: string
  reporteId: string
  reporteNombre: string
  version: number | null
  formato: 'pantalla' | 'pdf' | 'xlsx' | 'csv'
  origen: 'manual' | 'programada'
  parametros: Record<string, unknown>
  filas: number | null
  duracionMs: number | null
  exito: boolean
  errorCodigo: string | null
  ejecutadoPor: string | null
  iniciadoAt: string
  /**
   * Archivo archivado en Storage, si lo hubo. `null` cuando la corrida no
   * produjo artefacto —hoy, todas: RPT-03 genera en el navegador— y con
   * `purgadoAt` cuando existió y la retención ya venció (RPT-04).
   */
  artefacto: { storagePath: string; bytes: number; expiraAt: string; purgadoAt: string | null } | null
}

/** Una programación con sus suscriptores, tal como la pinta la pantalla (RPT-05). */
export type ProgramacionReporte = {
  id: string
  reporteId: string
  reporteNombre: string
  nombre: string
  frecuencia: 'una_vez' | 'diaria' | 'semanal' | 'mensual'
  diaSemana: number | null
  diaMes: number | null
  fechaUnica: string | null
  hora: string
  zonaHoraria: string
  formato: 'xlsx' | 'csv'
  activa: boolean
  /** Ya calculada por la base; `null` cuando está desactivada o ya pasó. */
  proximaAt: string | null
  ultimaAt: string | null
  suscriptores: { profileId: string; nombre: string; correo: string }[]
  /** Intentos de entrega registrados. Con uno solo, la programación ya no se borra. */
  entregas: number
}

/** Una entrega registrada: a quién llegó y con qué suerte (RPT-05). */
export type EntregaReporte = {
  id: string
  destinatario: string
  estado: 'enviada' | 'fallida' | 'omitida'
  detalle: string | null
  intentadaAt: string
}

/** Mensajes para el usuario: nunca se muestra el error crudo de Postgres (§66). */
const MENSAJE_POR_CODIGO: Record<string, string> = {
  RPT_FUENTE_NO_ENCONTRADA:
    'La fuente de datos de este reporte ya no está disponible. Avisa al administrador.',
  RPT_CAMPO_NO_ENCONTRADO:
    'El reporte usa un campo que ya no existe en su fuente de datos. Hay que revisar su definición.',
  RPT_DEFINICION_INVALIDA: 'La definición del reporte no es válida: revisa campos y agrupaciones.',
  RPT_CAMPO_NO_AGRUPABLE: 'Uno de los campos agrupados no admite agrupación.',
  RPT_AGREGACION_INVALIDA: 'Se intentó totalizar un campo que no es una métrica.',
  RPT_FILTRO_INVALIDO: 'Uno de los filtros no es válido para el campo elegido.',
  RPT_OPERADOR_INVALIDO: 'Uno de los filtros usa una condición que no está permitida.',
  RPT_FILTRO_OBLIGATORIO: 'Falta un dato obligatorio para ejecutar este reporte.',
  RPT_ORDEN_INVALIDO: 'El reporte intenta ordenar por un campo que no está incluido.',
}

/**
 * Errores de programación (RPT-05). Los lanza la base —política o guardia— y
 * llegan con su código; al usuario le tiene que llegar qué hacer, no el
 * código (§66).
 */
const MENSAJE_POR_SQLSTATE: Record<string, string> = {
  // CHECK de coherencia del calendario.
  '23514': 'Faltan datos del calendario: revisa el día y la hora de la frecuencia elegida.',
  // La política rechaza. En suscripciones significa, casi siempre, que el
  // destinatario no es miembro activo de la copropiedad.
  '42501':
    'No tienes permiso para esta operación, o el destinatario no es miembro activo de la copropiedad.',
  '23505': 'Esa persona ya está suscrita a esta programación.',
}

/**
 * El SQLSTATE viaja en `code` y el texto del guardia en `message`: hay que
 * mirar los dos. Buscar '42501' dentro del mensaje no lo encontraría — ese
 * texto dice «new row violates row-level security policy».
 */
export function mensajeDeProgramacion(error: { code?: string | null; message: string }): string {
  const porCodigo = error.code ? MENSAJE_POR_SQLSTATE[error.code] : undefined
  if (porCodigo) return porCodigo
  if (error.message.includes('RPT_PROGRAMACION_CONTEXTO_INMUTABLE')) {
    return 'Una programación no puede cambiar de copropiedad ni de reporte. Crea otra.'
  }
  // Borrar la programación se llevaría por delante su bitácora de entregas,
  // que es append-only (SEC-14): la cascada choca con el guardia.
  if (error.message.includes('APPEND_ONLY')) {
    return 'Esta programación ya hizo envíos y no se puede borrar sin perder esa evidencia. Púsala en pausa.'
  }
  return 'No fue posible guardar la programación. Inténtalo de nuevo o avisa al administrador.'
}

export function mensajeDeError(mensaje: string): string {
  const codigo = Object.keys(MENSAJE_POR_CODIGO).find((c) => mensaje.includes(c))
  return codigo
    ? MENSAJE_POR_CODIGO[codigo]!
    : 'No fue posible ejecutar el reporte. Inténtalo de nuevo o avisa al administrador.'
}

/** Valor inicial de un parámetro según su origen declarado. */
function valorSugerido(parametro: ParametroDefinicion, ultimoCorteCartera: string | null): string {
  const hoy = new Date()
  switch (parametro.origen) {
    case 'inicio_mes':
      return new Date(hoy.getFullYear(), hoy.getMonth(), 1).toISOString().slice(0, 10)
    case 'ultimo_corte_cartera':
      return ultimoCorteCartera ?? hoy.toISOString().slice(0, 10)
    case 'hoy':
      return hoy.toISOString().slice(0, 10)
    default:
      return ''
  }
}

export const useReportesStore = defineStore('reportes', () => {
  const reportes = ref<ReporteListado[]>([])
  const fuentes = ref<FuenteCatalogo[]>([])
  const resultado = ref<ResultadoEjecucion | null>(null)
  const cargando = ref(false)
  const ejecutando = ref(false)
  const error = ref<string | null>(null)
  const ultimoCorteCartera = ref<string | null>(null)

  // ── RPT-04 · Centro de Reportes ──────────────────────────────────────
  /** Ids de los reportes que ESTE usuario marcó. Nunca los de otro. */
  const favoritos = ref<Set<string>>(new Set())
  /** Ids por uso reciente, del más nuevo al más viejo, sin repetir. */
  const recientes = ref<string[]>([])
  const historial = ref<EjecucionHistorial[]>([])
  const cargandoHistorial = ref(false)

  // ── RPT-05 · Programación y entrega ──────────────────────────────────
  const programaciones = ref<ProgramacionReporte[]>([])
  const cargandoProgramaciones = ref(false)

  /**
   * `tenantId` no es opcional a propósito: la RLS deja ver los reportes de
   * TODAS las copropiedades donde el usuario es miembro, no solo la activa
   * (is_member es por tenant). Sin este filtro, quien administra tres
   * copropiedades ve cada reporte tres veces.
   */
  async function cargar(tenantId: string): Promise<void> {
    cargando.value = true
    error.value = null
    try {
      const cliente = useSupabaseClient<Database>()
      // El id sale del perfil ya cargado, no de `useSupabaseUser()`: ese ref
      // puede traer un objeto sin `id` durante la hidratación.
      const perfilId = useAuthStore().profile?.id ?? null

      const [listado, catalogo, corte, marcados, ultimasCorridas] = await Promise.all([
        // El `select` va como literal de una sola pieza a propósito: si se
        // concatena, supabase-js pierde la inferencia y todo el resultado
        // degrada a GenericStringError.
        cliente
          .from('reportes')
          .select('id, codigo, nombre, descripcion, del_sistema, lista_tipos(nombre), reporte_versiones(id, version, estado, definicion)')
          .eq('tenant_id', tenantId)
          .order('codigo'),
        cliente
          .from('reporte_fuentes')
          .select('codigo, nombre, descripcion, modulo, filtro_obligatorio, reporte_campos(codigo, etiqueta, descripcion, tipo_dato, clase, agregacion_default, filtrable, ordenable, agrupable, orden)')
          .order('codigo'),
        // Sugerencia para el parámetro de corte de cartera: el corte más
        // reciente que el usuario puede ver. Si no hay ninguno, el reporte
        // igual se puede ejecutar eligiendo fecha a mano.
        cliente
          .from('posiciones_cartera_snapshot')
          .select('fecha_corte')
          .eq('tenant_id', tenantId)
          .order('fecha_corte', { ascending: false })
          .limit(1)
          .maybeSingle(),
        // Favoritos (RPT-04): la política ya filtra por usuario, así que
        // esto no necesita un `.eq('profile_id', …)` — y si lo llevara,
        // seguiría sin ver los de otro.
        cliente.from('reporte_favoritos').select('reporte_id').eq('tenant_id', tenantId),
        // Recientes: las últimas corridas de ESTE usuario. No hay tabla
        // propia — `reporte_ejecuciones` ya lo sabe todo (RPT-01).
        cliente
          .from('reporte_ejecuciones')
          .select('reporte_id')
          .eq('tenant_id', tenantId)
          .eq('ejecutado_por', perfilId ?? '')
          .order('iniciado_at', { ascending: false })
          .limit(60),
      ])

      if (listado.error) throw listado.error
      if (catalogo.error) throw catalogo.error

      reportes.value = (listado.data ?? []).map((fila) => {
        const versiones = (fila.reporte_versiones ?? []) as unknown as VersionReporte[]
        const publicadas = versiones
          .filter((v) => v.estado === 'publicada')
          .sort((a, b) => b.version - a.version)
        const borradores = versiones
          .filter((v) => v.estado === 'borrador')
          .sort((a, b) => b.version - a.version)
        return {
          id: fila.id,
          codigo: fila.codigo,
          nombre: fila.nombre,
          descripcion: fila.descripcion,
          del_sistema: fila.del_sistema,
          categoria: (fila.lista_tipos as { nombre: string } | null)?.nombre ?? null,
          versionPublicada: publicadas[0] ?? null,
          versionBorrador: borradores[0] ?? null,
        }
      })

      fuentes.value = (catalogo.data ?? []).map((fila) => ({
        codigo: fila.codigo,
        nombre: fila.nombre,
        descripcion: fila.descripcion,
        modulo: fila.modulo,
        filtro_obligatorio: fila.filtro_obligatorio,
        campos: ((fila.reporte_campos ?? []) as unknown as CampoCatalogo[]).sort(
          (a, b) => a.orden - b.orden,
        ),
      }))

      ultimoCorteCartera.value = (corte.data as { fecha_corte: string } | null)?.fecha_corte ?? null

      favoritos.value = new Set((marcados.data ?? []).map((f) => f.reporte_id))
      // Las corridas vienen ordenadas por fecha; el Set conserva ese orden y
      // deja solo la primera aparición de cada reporte.
      recientes.value = [...new Set((ultimasCorridas.data ?? []).map((e) => e.reporte_id))].slice(
        0,
        6,
      )
    } catch (e) {
      error.value = e instanceof Error ? e.message : 'No fue posible cargar los reportes.'
    } finally {
      cargando.value = false
    }
  }

  function fuenteDe(codigo: string): FuenteCatalogo | undefined {
    return fuentes.value.find((f) => f.codigo === codigo)
  }

  /** Valores iniciales de los parámetros de un reporte, listos para el formulario. */
  function parametrosIniciales(definicion: DefinicionReporte): Record<string, string> {
    const valores: Record<string, string> = {}
    for (const parametro of definicion.parametros ?? []) {
      valores[parametro.codigo] = valorSugerido(parametro, ultimoCorteCartera.value)
    }
    return valores
  }

  /**
   * Sustituye las referencias a parámetros por sus valores. La regla vive en
   * `@aquila/reporting` desde RPT-05, no aquí: el despachador de reportes
   * programados corre en Deno y no puede importar un store de Vue, así que
   * cuando esta función era local la primera corrida programada mandó un
   * archivo de **cero filas** — los filtros llegaron sin valor y el
   * compilador no devolvió nada. Se mantiene el reexport para no cambiar la
   * superficie del store.
   */
  function resolverFiltros(
    definicion: DefinicionReporte,
    valores: Record<string, string>,
  ): FiltroDefinicion[] {
    return resolverFiltrosCompartido(definicion, valores)
  }

  async function ejecutar(
    reporte: ReporteListado,
    valores: Record<string, string>,
    limite = 1000,
    formato: 'pantalla' | 'pdf' | 'xlsx' | 'csv' = 'pantalla',
  ): Promise<void> {
    if (!reporte.versionPublicada) {
      error.value = 'Este reporte todavía no tiene una versión publicada.'
      return
    }

    // El tenant se resuelve ANTES de ejecutar: desde RPT-05 el compilador lo
    // exige, porque es él quien filtra por copropiedad y no la RLS sola.
    const tenantId = useTenantStore().activeTenant?.id
    if (!tenantId) {
      error.value = 'No hay una copropiedad activa.'
      return
    }

    ejecutando.value = true
    error.value = null
    resultado.value = null

    const cliente = useSupabaseClient<Database>()
    const definicion = reporte.versionPublicada.definicion
    const enviada = { ...definicion, filtros: resolverFiltros(definicion, valores) }
    const iniciado = Date.now()

    const { data, error: errorRpc } = await cliente.rpc('fn_reporte_ejecutar', {
      p_definicion: enviada as never,
      p_tenant_id: tenantId,
      p_limite: limite,
    })

    const salida = data as unknown as ResultadoEjecucion | null
    if (!errorRpc && salida) resultado.value = salida
    if (errorRpc) error.value = mensajeDeError(errorRpc.message)

    // La bitácora es parte del resultado, no un extra: un reporte que falla
    // también deja rastro (§67). Best-effort — si el registro falla, no se
    // le oculta al usuario el reporte que sí salió.
    //
    // getClaims() devuelve `sub`, no `id`: el id real del usuario sale de
    // auth.getUser() en cliente.
    const {
      data: { user },
    } = await cliente.auth.getUser()
    await cliente.from('reporte_ejecuciones').insert({
      tenant_id: tenantId,
      reporte_id: reporte.id,
      version_id: reporte.versionPublicada.id,
      parametros: valores as never,
      origen: 'manual',
      formato,
      ejecutado_por: user?.id ?? null,
      duracion_ms: salida?.duracion_ms ?? Date.now() - iniciado,
      filas: salida?.total_filas ?? null,
      exito: !errorRpc,
      error_codigo: errorRpc ? (errorRpc.message.split(':')[0] ?? 'RPT_ERROR') : null,
    })

    ejecutando.value = false
  }

  // ── Diseñador (RPT-02) ────────────────────────────────────────────────

  /**
   * Vista previa: ejecuta la definición SIN registrarla en el historial.
   * Diseñar un reporte son decenas de corridas de prueba; anotarlas todas
   * llenaría la bitácora de ruido y haría inútil el historial real (§35).
   */
  async function previsualizar(
    definicion: DefinicionReporte,
    valores: Record<string, string>,
    limite = 100,
  ): Promise<ResultadoEjecucion | null> {
    const tenantId = useTenantStore().activeTenant?.id
    if (!tenantId) return null

    const cliente = useSupabaseClient<Database>()
    const enviada = { ...definicion, filtros: resolverFiltros(definicion, valores) }

    const { data, error: errorRpc } = await cliente.rpc('fn_reporte_ejecutar', {
      p_definicion: enviada as never,
      p_tenant_id: tenantId,
      p_limite: limite,
    })

    if (errorRpc) {
      error.value = mensajeDeError(errorRpc.message)
      return null
    }
    error.value = null
    return data as unknown as ResultadoEjecucion
  }

  /**
   * Valores que un campo toma de verdad, para ofrecerlos en un filtro en vez
   * de pedir que el usuario los escriba de memoria. No hace falta una RPC
   * aparte: agrupar por el campo con el mismo compilador ya devuelve sus
   * valores distintos, con la RLS y el catálogo aplicados igual que siempre.
   *
   * `filtrosPrevios` es lo que hace la cascada: los valores de Inmueble
   * llegan ya acotados a la Torre elegida, sin ningún mecanismo nuevo.
   */
  async function valoresDe(
    fuente: string,
    campo: string,
    filtrosPrevios: FiltroDefinicion[] = [],
    limite = 200,
  ): Promise<string[]> {
    const tenantId = useTenantStore().activeTenant?.id
    if (!tenantId) return []

    const cliente = useSupabaseClient<Database>()
    const { data, error: errorRpc } = await cliente.rpc('fn_reporte_ejecutar', {
      p_definicion: {
        fuente,
        campos: [{ campo }],
        filtros: filtrosPrevios,
        agrupar: [campo],
        orden: [{ campo, direccion: 'asc' }],
      } as never,
      p_tenant_id: tenantId,
      p_limite: limite,
    })

    // Sin valores sugeridos el filtro sigue siendo utilizable a mano: una
    // fuente con filtro obligatorio (cartera) no puede listar valores hasta
    // que ese filtro esté puesto, y eso no es un error que mostrar.
    if (errorRpc) return []

    return ((data as unknown as ResultadoEjecucion).filas ?? [])
      .map((fila) => fila[campo])
      .filter((valor): valor is string | number | boolean => valor !== null && valor !== undefined)
      .map((valor) => String(valor))
  }

  async function crearReporte(
    tenantId: string,
    datos: { codigo: string; nombre: string; descripcion: string; categoriaId: number | null },
    definicion: DefinicionReporte,
  ): Promise<{ reporteId: string; versionId: string } | null> {
    const cliente = useSupabaseClient<Database>()
    const {
      data: { user },
    } = await cliente.auth.getUser()

    const { data: reporte, error: errorReporte } = await cliente
      .from('reportes')
      .insert({
        tenant_id: tenantId,
        codigo: datos.codigo,
        nombre: datos.nombre,
        descripcion: datos.descripcion || null,
        categoria_id: datos.categoriaId,
        creado_por: user?.id ?? null,
      })
      .select('id')
      .single()

    if (errorReporte || !reporte) {
      error.value = errorReporte?.message.includes('reportes_codigo_unico')
        ? 'Ya existe un reporte con ese código en esta copropiedad.'
        : 'No fue posible crear el reporte.'
      return null
    }

    const { data: version, error: errorVersion } = await cliente
      .from('reporte_versiones')
      .insert({
        tenant_id: tenantId,
        reporte_id: reporte.id,
        version: 1,
        estado: 'borrador',
        definicion: definicion as never,
        creado_por: user?.id ?? null,
      })
      .select('id')
      .single()

    if (errorVersion || !version) {
      error.value = 'El reporte se creó pero su primera versión no; reintenta desde el listado.'
      return null
    }

    return { reporteId: reporte.id, versionId: version.id }
  }

  /** Guarda el borrador. Se llama con debounce desde el diseñador (§64). */
  async function guardarBorrador(versionId: string, definicion: DefinicionReporte): Promise<boolean> {
    const cliente = useSupabaseClient<Database>()
    const { error: errorGuardar } = await cliente
      .from('reporte_versiones')
      .update({ definicion: definicion as never })
      .eq('id', versionId)
      .eq('estado', 'borrador')

    if (errorGuardar) {
      error.value = 'No fue posible guardar el borrador.'
      return false
    }
    return true
  }

  /**
   * Publicar congela: a partir de aquí la definición es inmutable y el
   * trigger reporte_versiones_inmutable lo hace cumplir en la base, no aquí.
   */
  async function publicar(versionId: string): Promise<boolean> {
    const cliente = useSupabaseClient<Database>()
    const {
      data: { user },
    } = await cliente.auth.getUser()

    const { error: errorPublicar } = await cliente
      .from('reporte_versiones')
      .update({
        estado: 'publicada',
        publicada_at: new Date().toISOString(),
        publicada_por: user?.id ?? null,
      })
      .eq('id', versionId)

    if (errorPublicar) {
      error.value = mensajeDeError(errorPublicar.message)
      return false
    }
    return true
  }

  /**
   * Editar una versión publicada crea la siguiente, en borrador, con la
   * definición actual como punto de partida (§38). La publicada no se toca.
   */
  async function nuevaVersion(reporte: ReporteListado): Promise<string | null> {
    if (!reporte.versionPublicada) return null
    const cliente = useSupabaseClient<Database>()
    const {
      data: { user },
    } = await cliente.auth.getUser()

    const { data: existentes } = await cliente
      .from('reporte_versiones')
      .select('version')
      .eq('reporte_id', reporte.id)
      .order('version', { ascending: false })
      .limit(1)

    const siguiente = (existentes?.[0]?.version ?? reporte.versionPublicada.version) + 1
    const tenantId = useTenantStore().activeTenant?.id
    if (!tenantId) return null

    const { data, error: errorNueva } = await cliente
      .from('reporte_versiones')
      .insert({
        tenant_id: tenantId,
        reporte_id: reporte.id,
        version: siguiente,
        estado: 'borrador',
        definicion: reporte.versionPublicada.definicion as never,
        creado_por: user?.id ?? null,
      })
      .select('id')
      .single()

    if (errorNueva || !data) {
      error.value = 'No fue posible crear la versión nueva.'
      return null
    }
    return data.id
  }

  /** Duplicar: el único camino para partir de un reporte de fábrica. */
  async function duplicar(
    tenantId: string,
    reporte: ReporteListado,
    codigo: string,
    nombre: string,
  ): Promise<{ reporteId: string; versionId: string } | null> {
    const definicion = reporte.versionPublicada?.definicion
    if (!definicion) {
      error.value = 'Ese reporte no tiene una versión publicada que copiar.'
      return null
    }
    return crearReporte(
      tenantId,
      {
        codigo,
        nombre,
        descripcion: reporte.descripcion ?? '',
        categoriaId: null,
      },
      definicion,
    )
  }

  /** Borrador de una versión concreta (para reabrir el diseñador). */
  async function cargarVersion(versionId: string): Promise<VersionReporte | null> {
    const cliente = useSupabaseClient<Database>()
    const { data, error: errorVersion } = await cliente
      .from('reporte_versiones')
      .select('id, version, estado, definicion')
      .eq('id', versionId)
      .single()

    if (errorVersion || !data) {
      error.value = 'No fue posible abrir esa versión.'
      return null
    }
    return data as unknown as VersionReporte
  }

  /**
   * Marca o desmarca un reporte (RPT-04). El estado local se cambia primero
   * y se revierte si la base dice que no: una estrella que tarda medio
   * segundo en encenderse se siente rota, y aquí no hay nada que corromper
   * —es una preferencia de pantalla, no un dato del negocio—.
   */
  async function alternarFavorito(tenantId: string, reporteId: string): Promise<void> {
    const cliente = useSupabaseClient<Database>()
    const perfilId = useAuthStore().profile?.id
    if (!perfilId) return

    const estaba = favoritos.value.has(reporteId)
    const siguiente = new Set(favoritos.value)
    if (estaba) siguiente.delete(reporteId)
    else siguiente.add(reporteId)
    favoritos.value = siguiente

    const { error: errorFavorito } = estaba
      ? await cliente
          .from('reporte_favoritos')
          .delete()
          .eq('reporte_id', reporteId)
          .eq('profile_id', perfilId)
      : await cliente
          .from('reporte_favoritos')
          .insert({ tenant_id: tenantId, reporte_id: reporteId, profile_id: perfilId })

    if (errorFavorito) {
      const revertido = new Set(favoritos.value)
      if (estaba) revertido.add(reporteId)
      else revertido.delete(reporteId)
      favoritos.value = revertido
    }
  }

  /**
   * Historial de ejecuciones (RPT-04, §57). No hay tabla de auditoría
   * propia: `reporte_ejecuciones` es append-only desde RPT-01 y esto solo
   * la lee, con el nombre del reporte y el artefacto si lo hubo.
   */
  async function cargarHistorial(tenantId: string, limite = 100): Promise<void> {
    cargandoHistorial.value = true
    try {
      const cliente = useSupabaseClient<Database>()
      const { data, error: errorHistorial } = await cliente
        .from('reporte_ejecuciones')
        .select('id, reporte_id, formato, origen, parametros, filas, duracion_ms, exito, error_codigo, ejecutado_por, iniciado_at, reportes(nombre), reporte_versiones(version), reporte_artefactos(storage_path, bytes, expira_at, purgado_at)')
        .eq('tenant_id', tenantId)
        .order('iniciado_at', { ascending: false })
        .limit(limite)

      if (errorHistorial) throw errorHistorial

      historial.value = (data ?? []).map((fila) => {
        // OJO con la forma: `reporte_artefactos.ejecucion_id` es UNIQUE, y eso
        // hace que PostgREST vea una relación UNO A UNO y devuelva un OBJETO,
        // no una lista. Asumir lista dejaba la columna «Archivo» en «—» para
        // corridas que sí habían producido archivo. Se aceptan las dos formas
        // porque la que llegue depende de una restricción de la tabla, no de
        // esta consulta.
        type FilaArtefacto = {
          storage_path: string
          bytes: number
          expira_at: string
          purgado_at: string | null
        }
        const crudo = fila.reporte_artefactos as unknown as
          | FilaArtefacto
          | FilaArtefacto[]
          | null
        const artefacto = Array.isArray(crudo) ? crudo[0] : (crudo ?? undefined)

        return {
          id: fila.id,
          reporteId: fila.reporte_id,
          reporteNombre: (fila.reportes as { nombre: string } | null)?.nombre ?? '—',
          version: (fila.reporte_versiones as { version: number } | null)?.version ?? null,
          formato: fila.formato as EjecucionHistorial['formato'],
          origen: fila.origen as EjecucionHistorial['origen'],
          parametros: (fila.parametros ?? {}) as Record<string, unknown>,
          filas: fila.filas,
          duracionMs: fila.duracion_ms,
          exito: fila.exito,
          errorCodigo: fila.error_codigo,
          ejecutadoPor: fila.ejecutado_por,
          iniciadoAt: fila.iniciado_at,
          artefacto: artefacto
            ? {
                storagePath: artefacto.storage_path,
                bytes: artefacto.bytes,
                expiraAt: artefacto.expira_at,
                purgadoAt: artefacto.purgado_at,
              }
            : null,
        }
      })
    } catch (e) {
      error.value = e instanceof Error ? e.message : 'No fue posible cargar el historial.'
    } finally {
      cargandoHistorial.value = false
    }
  }

  // ── RPT-05 · Programación y entrega ──────────────────────────────────

  /**
   * Programaciones de la copropiedad con sus suscriptores. `proxima_at` NO se
   * calcula aquí: lo mantiene un disparador en la base, y duplicar ese
   * calendario en el cliente sería la misma regla en dos sitios, lista para
   * divergir el día que alguien toque una de las dos.
   */
  async function cargarProgramaciones(tenantId: string): Promise<void> {
    cargandoProgramaciones.value = true
    try {
      const cliente = useSupabaseClient<Database>()
      const { data, error: errorProg } = await cliente
        .from('reporte_programaciones')
        .select('id, reporte_id, nombre, frecuencia, dia_semana, dia_mes, fecha_unica, hora, zona_horaria, formato, activa, proxima_at, ultima_at, reportes(nombre), reporte_suscripciones(profile_id, profiles(email, full_name)), reporte_entregas(count)')
        .eq('tenant_id', tenantId)
        .order('nombre')

      if (errorProg) throw errorProg

      programaciones.value = (data ?? []).map((fila) => ({
        id: fila.id,
        reporteId: fila.reporte_id,
        reporteNombre: (fila.reportes as { nombre: string } | null)?.nombre ?? '—',
        nombre: fila.nombre,
        frecuencia: fila.frecuencia as ProgramacionReporte['frecuencia'],
        diaSemana: fila.dia_semana,
        diaMes: fila.dia_mes,
        fechaUnica: fila.fecha_unica,
        hora: fila.hora,
        zonaHoraria: fila.zona_horaria,
        formato: fila.formato as ProgramacionReporte['formato'],
        activa: fila.activa,
        proximaAt: fila.proxima_at,
        ultimaAt: fila.ultima_at,
        // Cuántas veces se ha intentado entregar. Si hay alguna, la
        // programación ya no se puede borrar: `reporte_entregas` es
        // append-only y la cascada la bloquea. La pantalla lo dice en vez de
        // ofrecer un botón que va a fallar.
        entregas:
          ((fila.reporte_entregas ?? []) as unknown as { count: number }[])[0]?.count ?? 0,
        suscriptores: ((fila.reporte_suscripciones ?? []) as unknown as {
          profile_id: string
          profiles: { email: string | null; full_name: string | null } | null
        }[]).map((s) => ({
          profileId: s.profile_id,
          nombre: s.profiles?.full_name ?? s.profiles?.email ?? '—',
          correo: s.profiles?.email ?? '',
        })),
      }))
    } catch (e) {
      error.value = e instanceof Error ? e.message : 'No fue posible cargar las programaciones.'
    } finally {
      cargandoProgramaciones.value = false
    }
  }

  /**
   * Crea una programación. `zona_horaria` va vacía a propósito: el disparador
   * de la base la toma de la copropiedad, que es la única autoridad sobre
   * dónde son «las 7 de la mañana».
   */
  async function crearProgramacion(
    tenantId: string,
    datos: {
      reporteId: string
      nombre: string
      frecuencia: ProgramacionReporte['frecuencia']
      diaSemana: number | null
      diaMes: number | null
      fechaUnica: string | null
      hora: string
      formato: ProgramacionReporte['formato']
      parametros: Record<string, string>
    },
  ): Promise<string | null> {
    const cliente = useSupabaseClient<Database>()
    const { data, error: errorAlta } = await cliente
      .from('reporte_programaciones')
      .insert({
        tenant_id: tenantId,
        reporte_id: datos.reporteId,
        nombre: datos.nombre,
        frecuencia: datos.frecuencia,
        dia_semana: datos.diaSemana,
        dia_mes: datos.diaMes,
        fecha_unica: datos.fechaUnica,
        hora: datos.hora,
        zona_horaria: '',
        formato: datos.formato,
        parametros: datos.parametros as never,
        creado_por: useAuthStore().profile?.id ?? null,
      })
      .select('id')
      .single()

    if (errorAlta) {
      error.value = mensajeDeProgramacion(errorAlta)
      return null
    }
    error.value = null
    return data.id
  }

  async function alternarProgramacion(id: string, activa: boolean): Promise<boolean> {
    const cliente = useSupabaseClient<Database>()
    const { error: errorUpd } = await cliente
      .from('reporte_programaciones')
      .update({ activa })
      .eq('id', id)
    if (errorUpd) {
      error.value = mensajeDeProgramacion(errorUpd)
      return false
    }
    return true
  }

  async function eliminarProgramacion(id: string): Promise<boolean> {
    const cliente = useSupabaseClient<Database>()
    const { error: errorDel } = await cliente
      .from('reporte_programaciones')
      .delete()
      .eq('id', id)
    if (errorDel) {
      error.value = mensajeDeProgramacion(errorDel)
      return false
    }
    return true
  }

  /** Suscribir solo funciona con miembros: lo impone la política, no la UI. */
  async function suscribir(
    tenantId: string,
    programacionId: string,
    profileId: string,
  ): Promise<boolean> {
    const cliente = useSupabaseClient<Database>()
    const { error: errorSus } = await cliente
      .from('reporte_suscripciones')
      .insert({ tenant_id: tenantId, programacion_id: programacionId, profile_id: profileId })
    if (errorSus) {
      error.value = mensajeDeProgramacion(errorSus)
      return false
    }
    return true
  }

  async function desuscribir(programacionId: string, profileId: string): Promise<boolean> {
    const cliente = useSupabaseClient<Database>()
    const { error: errorSus } = await cliente
      .from('reporte_suscripciones')
      .delete()
      .eq('programacion_id', programacionId)
      .eq('profile_id', profileId)
    if (errorSus) {
      error.value = mensajeDeProgramacion(errorSus)
      return false
    }
    return true
  }

  /** A quién llegó de verdad cada corrida de esta programación. */
  async function cargarEntregas(programacionId: string, limite = 50): Promise<EntregaReporte[]> {
    const cliente = useSupabaseClient<Database>()
    const { data } = await cliente
      .from('reporte_entregas')
      .select('id, destinatario, estado, detalle, intentada_at')
      .eq('programacion_id', programacionId)
      .order('intentada_at', { ascending: false })
      .limit(limite)

    return (data ?? []).map((fila) => ({
      id: fila.id,
      destinatario: fila.destinatario,
      estado: fila.estado as EntregaReporte['estado'],
      detalle: fila.detalle,
      intentadaAt: fila.intentada_at,
    }))
  }

  return {
    reportes,
    fuentes,
    resultado,
    cargando,
    ejecutando,
    error,
    ultimoCorteCartera,
    programaciones,
    cargandoProgramaciones,
    cargarProgramaciones,
    crearProgramacion,
    alternarProgramacion,
    eliminarProgramacion,
    suscribir,
    desuscribir,
    cargarEntregas,
    favoritos,
    recientes,
    historial,
    cargandoHistorial,
    cargar,
    alternarFavorito,
    cargarHistorial,
    fuenteDe,
    parametrosIniciales,
    resolverFiltros,
    ejecutar,
    previsualizar,
    valoresDe,
    crearReporte,
    guardarBorrador,
    publicar,
    nuevaVersion,
    duplicar,
    cargarVersion,
  }
})
