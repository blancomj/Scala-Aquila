/**
 * MANT-1 · Atributos técnicos dinámicos y criticidad (§3.7 UI), más
 * Mantenimiento → Activos Fase 2 (D-88): creación/edición de la ficha
 * maestra. `crearActivo`/`actualizarActivo` no reimplementan ninguna
 * validación — INSERT/UPDATE planos sobre `activos`, la autoridad sigue
 * siendo `guard_activo_ficha`/`guard_activo_transicion` en la base (§11 del
 * prompt: "la interfaz debe reflejar las validaciones existentes en
 * PostgreSQL, nunca depender exclusivamente del frontend"). Los campos
 * "sensibles" tras la capitalización (bloque contable, `capitalizado` en
 * sí) no se editan aquí una vez `capitalizado = true` — eso son las
 * funciones transaccionales de Fase 4 (`fn_mant_capitalizar_activo`/
 * `fn_mant_dar_baja_activo`/`fn_mant_reconocer_depreciacion`, D-91), que
 * ahora sí tienen UI (ver `cambiarEstado`/`capitalizarActivo`/
 * `darDeBajaActivo`/`reconocerDepreciacion` más abajo) — todas llaman la
 * función/RPC existente tal cual, ninguna reimplementa la regla de negocio.
 */
import { defineStore } from 'pinia'
import type { Database, Json } from '@aquila/shared'
import { extraerErrorFuncion } from '~/utils/edge-function-error'

type ActivoRow = Database['public']['Tables']['activos']['Row']
type ActivoInsert = Database['public']['Tables']['activos']['Insert']
type ActivoUpdate = Database['public']['Tables']['activos']['Update']
type DefinicionRow = Database['public']['Tables']['mant_atributo_definicion']['Row']
type EvaluacionRow = Database['public']['Tables']['mant_activo_criticidad']['Row']
type CriterioRow = Database['public']['Tables']['mant_criticidad_criterio']['Row']
type Criticidad = Database['public']['Functions']['mant_criticidad']['Returns'][number]
export type ActivoListado = Database['public']['Functions']['mant_activos_listado']['Returns'][number]
export type EstadoHistorialRow = Database['public']['Tables']['activo_estado_historial']['Row']
export type PpeActivo = Database['public']['Functions']['mant_ppe_por_activo']['Returns'][number]
export type DepreciacionCalculada = Database['public']['Functions']['mant_calcular_depreciacion']['Returns'][number]
export type ResumenDepreciacion = Database['public']['Functions']['fn_mant_reconocer_depreciacion']['Returns'][number]
export type ActivoEstado = Database['public']['Enums']['activo_estado_t']
export interface LineaComprobante {
  debito: number
  credito: number
  descripcion: string | null
  cuenta: { codigo: string; nombre: string } | null
}

/** Máquina de estados de `guard_activo_transicion` (MANT-0), reflejada aquí solo para que la UI
 * ofrezca los botones correctos — el guard sigue siendo la única autoridad real; si este mapa
 * quedara desactualizado, el guard rechaza igual y el mensaje se muestra tal cual. */
export const TRANSICIONES_VALIDAS: Record<ActivoEstado, ActivoEstado[]> = {
  planificado: ['adquirido'],
  adquirido: ['instalado'],
  instalado: ['en_servicio'],
  en_servicio: ['en_mantenimiento', 'fuera_de_servicio', 'en_reparacion', 'retirado'],
  en_mantenimiento: ['en_servicio', 'retirado'],
  fuera_de_servicio: ['en_servicio', 'retirado'],
  en_reparacion: ['en_servicio', 'retirado'],
  retirado: ['dispuesto'],
  dispuesto: [],
}

export const useActivosStore = defineStore('activos', () => {
  const activos = shallowRef<ActivoRow[]>([])
  const activo = shallowRef<ActivoRow | null>(null)
  const definiciones = shallowRef<DefinicionRow[]>([])
  const criteriosVigentes = shallowRef<CriterioRow[]>([])
  const evaluaciones = shallowRef<EvaluacionRow[]>([])
  const criticidad = shallowRef<Criticidad | null>(null)
  const errorCriticidad = ref<string | null>(null)
  const loading = ref(false)
  const guardando = ref(false)

  // Fase 3 (Ficha 360°, D-90): historial de transiciones (append-only, tal cual queda en
  // activo_estado_historial — ni se recalcula ni se resume) y PPE puntual del activo (mismo
  // mant_ppe_por_activo de MANT-0/Fase 1, filtrado a este activo — no se reimplementa la suma).
  const historialEstado = shallowRef<EstadoHistorialRow[]>([])
  const ppeActivo = shallowRef<PpeActivo | null>(null)

  // Fase 1 (Registro Maestro, D-88): una fila por activo, ya resuelta contra
  // mant_activos_listado — nombres, criticidad, valor neto y últimas/próximas
  // fechas de mantenimiento, todo calculado en la base, no en el cliente.
  const listado = shallowRef<ActivoListado[]>([])
  const cargandoListado = ref(false)

  async function cargarListado(tenantId: string): Promise<void> {
    cargandoListado.value = true
    try {
      const cliente = useSupabaseClient<Database>()
      const { data, error } = await cliente.rpc('mant_activos_listado', { p_tenant_id: tenantId })
      if (error) throw error
      listado.value = data ?? []
    } finally {
      cargandoListado.value = false
    }
  }

  async function cargarActivos(tenantId: string): Promise<void> {
    loading.value = true
    try {
      const cliente = useSupabaseClient<Database>()
      const { data, error } = await cliente
        .from('activos')
        .select('*')
        .eq('tenant_id', tenantId)
        .order('codigo')
      if (error) throw error
      activos.value = data ?? []
    } finally {
      loading.value = false
    }
  }

  /** Fase 2 (D-88): creación de la ficha maestra. `guard_activo_ficha` valida todo lo que
   * pueda validarse a nivel de fila (categoría/tipo/jerarquía/bloque contable); el `UNIQUE
   * (tenant_id, codigo)` queda como respaldo de BD si el chequeo de duplicado en el cliente
   * se saltó por una condición de carrera. */
  async function crearActivo(fila: ActivoInsert): Promise<ActivoRow> {
    guardando.value = true
    try {
      const cliente = useSupabaseClient<Database>()
      const { data, error } = await cliente.from('activos').insert(fila).select('*').single()
      if (error) throw error
      return data
    } finally {
      guardando.value = false
    }
  }

  /** Fase 2 (D-88): edición de datos maestros. No se usa para `capitalizado`/bloque contable
   * de un activo ya capitalizado — eso son las funciones transaccionales de Fase 4, todavía
   * sin UI (§12 del prompt: "no realizar cambios críticos mediante un simple UPDATE si ya
   * existe una función de dominio para ejecutarlos"). El formulario de edición ya se encarga
   * de no ofrecer esos campos en ese caso; esta función no lo vuelve a comprobar. */
  async function actualizarActivo(activoId: string, cambios: ActivoUpdate): Promise<ActivoRow> {
    guardando.value = true
    try {
      const cliente = useSupabaseClient<Database>()
      const { data, error } = await cliente
        .from('activos').update(cambios).eq('id', activoId).select('*').single()
      if (error) throw error
      return data
    } finally {
      guardando.value = false
    }
  }

  /** Carga la ficha, el esquema de atributos de su tipo, y el estado de criticidad —
   * en paralelo, ya que son independientes entre sí. */
  async function cargarFicha(tenantId: string, activoId: string): Promise<void> {
    loading.value = true
    try {
      const cliente = useSupabaseClient<Database>()
      const { data: fila, error: errActivo } = await cliente
        .from('activos').select('*').eq('id', activoId).single()
      if (errActivo) throw errActivo
      activo.value = fila

      const [{ data: defs, error: errDefs }, { data: evals, error: errEvals }] = await Promise.all([
        cliente
          .from('mant_atributo_definicion')
          .select('*')
          .eq('tenant_id', tenantId)
          .eq('tipo_activo_id', fila.tipo_id)
          .order('orden'),
        cliente
          .from('mant_activo_criticidad')
          .select('*')
          .eq('activo_id', activoId),
      ])
      if (errDefs) throw errDefs
      if (errEvals) throw errEvals
      definiciones.value = defs ?? []
      evaluaciones.value = evals ?? []

      const { data: setVigente } = await cliente
        .from('mant_criticidad_set').select('id').eq('tenant_id', tenantId).eq('estado', 'vigente').maybeSingle()
      if (setVigente) {
        const { data: criterios, error: errCriterios } = await cliente
          .from('mant_criticidad_criterio').select('*').eq('set_id', setVigente.id).order('codigo')
        if (errCriterios) throw errCriterios
        criteriosVigentes.value = criterios ?? []
      } else {
        criteriosVigentes.value = []
      }

      await cargarCriticidad(activoId)
    } finally {
      loading.value = false
    }
  }

  /** Independiente de cargarFicha: se vuelve a llamar sola tras evaluar un criterio, sin
   * recargar toda la ficha. Guarda el error explícito (CRITICIDAD_SIN_SET_VIGENTE /
   * CRITICIDAD_EVALUACION_INCOMPLETA) en vez de tragárselo — el panel lo muestra tal cual. */
  async function cargarCriticidad(activoId: string): Promise<void> {
    errorCriticidad.value = null
    criticidad.value = null
    const cliente = useSupabaseClient<Database>()
    const { data, error } = await cliente.rpc('mant_criticidad', { p_activo_id: activoId }).maybeSingle()
    if (error) {
      errorCriticidad.value = error.message
      return
    }
    criticidad.value = data
  }

  async function actualizarAtributos(
    activoId: string, atributos: Record<string, string | number | boolean>,
  ): Promise<void> {
    guardando.value = true
    try {
      const cliente = useSupabaseClient<Database>()
      const { data, error } = await cliente
        .from('activos').update({ atributos: atributos as Json }).eq('id', activoId).select('*').single()
      if (error) throw error
      activo.value = data
    } finally {
      guardando.value = false
    }
  }

  async function evaluarCriterio(
    tenantId: string, activoId: string, criterioId: string, valor: string,
  ): Promise<void> {
    guardando.value = true
    try {
      const cliente = useSupabaseClient<Database>()
      const { error } = await cliente
        .from('mant_activo_criticidad')
        .upsert(
          { tenant_id: tenantId, activo_id: activoId, criterio_id: criterioId, valor },
          { onConflict: 'activo_id,criterio_id' },
        )
      if (error) throw error
      const { data: evals, error: errEvals } = await cliente
        .from('mant_activo_criticidad').select('*').eq('activo_id', activoId)
      if (errEvals) throw errEvals
      evaluaciones.value = evals ?? []
      await cargarCriticidad(activoId)
    } finally {
      guardando.value = false
    }
  }

  /** Ciclo de vida (§17-18 del prompt): el historial ya es append-only en la base, aquí solo
   * se lee y se muestra en orden — más reciente primero, como cualquier bitácora. */
  async function cargarHistorialEstado(activoId: string): Promise<void> {
    const cliente = useSupabaseClient<Database>()
    const { data, error } = await cliente
      .from('activo_estado_historial')
      .select('*')
      .eq('activo_id', activoId)
      .order('created_at', { ascending: false })
    if (error) throw error
    historialEstado.value = data ?? []
  }

  /** Tab Contabilidad (§14 TAB 5): mismo mant_ppe_por_activo de MANT-0/Fase 1 (mant_activos_listado
   * ya lo llama para `valor_neto`, pero esta pantalla necesita además depreciacion_acumulada y
   * las cuentas — se llama de nuevo con fecha de corte hoy y se filtra al activo pedido, en vez
   * de sumar un segundo parámetro a la función existente para un solo consumidor. */
  async function cargarPpeActivo(tenantId: string, activoId: string): Promise<void> {
    const cliente = useSupabaseClient<Database>()
    const { data, error } = await cliente.rpc('mant_ppe_por_activo', {
      p_tenant_id: tenantId, p_fecha_corte: new Date().toISOString().slice(0, 10),
    })
    if (error) throw error
    ppeActivo.value = (data ?? []).find((f) => f.activo_id === activoId) ?? null
  }

  // ── Fase 4 (D-91): operaciones de dominio — cada una llama la función/RPC existente tal
  // cual, ninguna reimplementa la regla de negocio (§15/§16/§17/§19 del prompt). ────────────

  /** Cambio de estado genérico (todas las transiciones salvo el retiro capitalizado, que usa
   * `fn_mant_dar_baja_activo` porque puede generar asiento contable) — un UPDATE plano de
   * `estado` es exactamente lo que hacía MANT-0 antes de este corte (ver
   * atributos-criticidad.test.ts/ot-incidencias.test.ts, `avanzarOt`-equivalente para activos);
   * `guard_activo_transicion` valida la transición y registra el historial él solo. */
  async function cambiarEstado(activoId: string, nuevoEstado: ActivoEstado): Promise<ActivoRow> {
    return actualizarActivo(activoId, { estado: nuevoEstado })
  }

  /** §15: capitalizar. `fn_mant_capitalizar_activo` es la única autoridad — valida bien esencial,
   * bloque contable completo, cuenta de clase 15, período abierto y conciliación contra
   * `presupuesto_ejecucion`; aquí solo se invoca y se propaga su mensaje si falla. */
  async function capitalizarActivo(tenantId: string, activoId: string, periodoId: string): Promise<string> {
    guardando.value = true
    try {
      const cliente = useSupabaseClient<Database>()
      const { data, error } = await cliente.rpc('fn_mant_capitalizar_activo', {
        p_tenant_id: tenantId, p_activo_id: activoId, p_periodo_id: periodoId,
      })
      if (error) throw error
      return data
    } finally {
      guardando.value = false
    }
  }

  /** §19: retiro/baja. `periodoId` solo importa si el activo está capitalizado (la función
   * retorna antes de tocarlo si no lo está) — se permite `null` en ese caso en vez de forzar al
   * usuario a elegir un período que no se va a usar. */
  async function darDeBajaActivo(
    tenantId: string, activoId: string, periodoId: string | null, motivo: string,
  ): Promise<string | null> {
    guardando.value = true
    try {
      const cliente = useSupabaseClient<Database>()
      // El tipo generado exige `string` (Postgres no distingue "sin default" de NOT NULL en el
      // parámetro), pero la función solo lee p_periodo_id cuando el activo está capitalizado —
      // confirmado leyendo 20260930320000_mant0_fix_baja_activo.sql. `null` es válido en runtime.
      const { data, error } = await cliente.rpc('fn_mant_dar_baja_activo', {
        p_tenant_id: tenantId, p_activo_id: activoId, p_periodo_id: periodoId as unknown as string, p_motivo: motivo,
      })
      if (error) throw error
      return data
    } finally {
      guardando.value = false
    }
  }

  /** §16: vista previa de la cuota del período (mant_calcular_depreciacion es de solo lectura,
   * no genera nada) — se llama para el tenant completo y se filtra al activo pedido, igual que
   * cargarPpeActivo, en vez de pedirle a la función un parámetro nuevo para un solo consumidor. */
  async function previsualizarDepreciacion(
    tenantId: string, periodoId: string, activoId: string,
  ): Promise<DepreciacionCalculada | null> {
    const cliente = useSupabaseClient<Database>()
    const { data, error } = await cliente.rpc('mant_calcular_depreciacion', {
      p_tenant_id: tenantId, p_periodo_id: periodoId,
    })
    if (error) throw error
    return (data ?? []).find((f) => f.activo_id === activoId) ?? null
  }

  /** §16: reconocer depreciación del período — `fn_mant_reconocer_depreciacion` opera sobre TODOS
   * los activos capitalizados del tenant a la vez (no es una operación por-activo, ver su propio
   * comentario en MANT-0) y es idempotente (una segunda corrida reporta 'omitido', no duplica).
   * Se llama igual desde la ficha de un activo — el llamador filtra el resultado a su propio
   * `activo_id` en vez de pedir un parámetro nuevo que la función no necesita. */
  async function reconocerDepreciacion(tenantId: string, periodoId: string): Promise<ResumenDepreciacion[]> {
    guardando.value = true
    try {
      const cliente = useSupabaseClient<Database>()
      const { data, error } = await cliente.rpc('fn_mant_reconocer_depreciacion', {
        p_tenant_id: tenantId, p_periodo_id: periodoId,
      })
      if (error) throw error
      return data ?? []
    } finally {
      guardando.value = false
    }
  }

  /** §15 punto 7 "mostrar evidencia contable": las líneas del comprobante que acaba de generar
   * capitalizar/dar de baja/reconocer depreciación — lectura simple, ninguna cifra se recalcula. */
  async function cargarLineasComprobante(comprobanteId: string): Promise<LineaComprobante[]> {
    const cliente = useSupabaseClient<Database>()
    const { data, error } = await cliente
      .from('contable_comprobante_detalle')
      .select('debito, credito, descripcion, cuenta:cuenta_id(codigo, nombre)')
      .eq('comprobante_id', comprobanteId)
      .order('linea')
    if (error) throw error
    return (data ?? []) as unknown as LineaComprobante[]
  }

  /** §13/Fase 3 "QR": genera (o recupera, es idempotente) el qr_token vía la Edge Function ya
   * existente de MANT-0 — nunca se firma un token en el cliente. Sin renderizado de código de
   * barras: este proyecto no tiene esa dependencia en ningún otro sitio (mantenimiento/acceso
   * también solo muestra el token como texto), así que no se introduce una nueva aquí. */
  async function generarQr(tenantId: string, activoId: string): Promise<string> {
    guardando.value = true
    try {
      const cliente = useSupabaseClient<Database>()
      const { data, error } = await cliente.functions.invoke<{ qr_token: string }>('generar-qr-activo', {
        body: { activo_id: activoId, tenant_id: tenantId },
      })
      if (error) throw await extraerErrorFuncion(error)
      if (!data) throw new Error('La función no devolvió el token de QR.')
      if (activo.value && activo.value.id === activoId) activo.value = { ...activo.value, qr_token: data.qr_token }
      return data.qr_token
    } finally {
      guardando.value = false
    }
  }

  return {
    activos, activo, definiciones, criteriosVigentes, evaluaciones, criticidad, errorCriticidad,
    loading, guardando,
    listado, cargandoListado,
    historialEstado, ppeActivo,
    cargarActivos, cargarFicha, cargarCriticidad, actualizarAtributos, evaluarCriterio,
    cargarListado, crearActivo, actualizarActivo,
    cargarHistorialEstado, cargarPpeActivo, generarQr,
    cambiarEstado, capitalizarActivo, darDeBajaActivo, previsualizarDepreciacion,
    reconocerDepreciacion, cargarLineasComprobante,
  }
})
