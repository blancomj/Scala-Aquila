/**
 * Ficha de inmueble — el inmueble activo, su coeficiente vigente (lectura),
 * zonas comunes de uso exclusivo, y el histórico unificado (PROMPT_FICHA_
 * INMUEBLE.md §4.2, §5.2, §7.5). SELECT/INSERT/UPDATE de `inmuebles` van
 * directo por RLS (agent) — sin Edge Function, mismo criterio que
 * fundamentoNormativo.ts. No crea CRUD de coeficientes (fuera de alcance,
 * PROMPT_FICHA_INMUEBLE.md §1.2) — `cargarCoeficienteVigente` es solo
 * lectura del set vigente ya existente.
 */
import { defineStore } from 'pinia'
import type { Database } from '@aquila/shared'

type InmuebleRow = Database['public']['Tables']['inmuebles']['Row']
type ZonaComunRow = Database['public']['Tables']['zonas_comunes']['Row']
type CoeficienteRow = Database['public']['Tables']['coeficientes']['Row']
type CoeficienteSetRow = Database['public']['Tables']['coeficiente_sets']['Row']

export interface CoeficienteVigente extends CoeficienteRow {
  readonly set: CoeficienteSetRow
}

export interface EventoHistorico {
  readonly fecha: string
  readonly tipo: 'inmueble' | 'persona' | 'novedad' | 'pago' | 'liquidacion'
  readonly descripcion: string
  readonly actor: string | null
}

export const useInmueblesStore = defineStore('inmuebles', () => {
  const inmuebleActivo = shallowRef<InmuebleRow | null>(null)
  const zonasExclusivas = shallowRef<ZonaComunRow[]>([])
  const coeficienteVigente = shallowRef<CoeficienteVigente | null>(null)
  const historico = shallowRef<EventoHistorico[]>([])
  const loading = ref(false)

  async function cargarInmueble(tenantId: string, id: string): Promise<InmuebleRow | null> {
    loading.value = true
    try {
      const cliente = useSupabaseClient<Database>()
      const { data, error: errorInmueble } = await cliente
        .from('inmuebles')
        .select('*')
        .eq('tenant_id', tenantId)
        .eq('id', id)
        .maybeSingle()
      if (errorInmueble) throw errorInmueble
      inmuebleActivo.value = data
      return data
    } finally {
      loading.value = false
    }
  }

  async function crearInmueble(params: {
    tenantId: string
    codigo: string
    tipoId: number
    estado: Database['public']['Enums']['inmueble_estado_t']
    matriculaInmobiliaria?: string
    areaPrivada?: number
    areaComun?: number
    estadoLegalId?: number | null
    estadoLegalObservaciones?: string
    habitabilidadId?: number | null
  }): Promise<InmuebleRow> {
    const cliente = useSupabaseClient<Database>()
    const { data, error: errorInsert } = await cliente
      .from('inmuebles')
      .insert({
        tenant_id: params.tenantId,
        codigo: params.codigo,
        tipo_id: params.tipoId,
        estado: params.estado,
        matricula_inmobiliaria: params.matriculaInmobiliaria,
        area_privada: params.areaPrivada,
        area_comun: params.areaComun,
        estado_legal_id: params.estadoLegalId,
        estado_legal_observaciones: params.estadoLegalObservaciones,
        habitabilidad_id: params.habitabilidadId,
      })
      .select('*')
      .single()
    if (errorInsert) throw errorInsert
    inmuebleActivo.value = data
    return data
  }

  async function actualizarInmueble(params: {
    id: string
    codigo: string
    tipoId: number
    estado: Database['public']['Enums']['inmueble_estado_t']
    matriculaInmobiliaria?: string
    areaPrivada?: number
    areaComun?: number
    estadoLegalId?: number | null
    estadoLegalObservaciones?: string
    habitabilidadId?: number | null
  }): Promise<InmuebleRow> {
    const cliente = useSupabaseClient<Database>()
    const { data, error: errorUpdate } = await cliente
      .from('inmuebles')
      .update({
        codigo: params.codigo,
        tipo_id: params.tipoId,
        estado: params.estado,
        matricula_inmobiliaria: params.matriculaInmobiliaria,
        area_privada: params.areaPrivada,
        area_comun: params.areaComun,
        estado_legal_id: params.estadoLegalId,
        estado_legal_observaciones: params.estadoLegalObservaciones,
        habitabilidad_id: params.habitabilidadId,
      })
      .eq('id', params.id)
      .select('*')
      .single()
    if (errorUpdate) throw errorUpdate
    inmuebleActivo.value = data
    return data
  }

  async function cargarZonasExclusivas(tenantId: string, inmuebleId: string): Promise<ZonaComunRow[]> {
    const cliente = useSupabaseClient<Database>()
    const { data, error: errorZonas } = await cliente
      .from('zonas_comunes')
      .select('*')
      .eq('tenant_id', tenantId)
      .eq('uso_exclusivo_inmueble_id', inmuebleId)
      .order('codigo')
    if (errorZonas) throw errorZonas
    zonasExclusivas.value = data ?? []
    return zonasExclusivas.value
  }

  async function cargarCoeficienteVigente(
    tenantId: string,
    inmuebleId: string,
  ): Promise<CoeficienteVigente | null> {
    const cliente = useSupabaseClient<Database>()
    const { data, error: errorCoeficiente } = await cliente
      .from('coeficientes')
      .select('*, set:coeficiente_sets!inner(*)')
      .eq('tenant_id', tenantId)
      .eq('inmueble_id', inmuebleId)
      .eq('set.estado', 'vigente')
      .maybeSingle()
    if (errorCoeficiente) throw errorCoeficiente
    coeficienteVigente.value = data as CoeficienteVigente | null
    return coeficienteVigente.value
  }

  async function cargarHistorico(tenantId: string, inmuebleId: string): Promise<EventoHistorico[]> {
    const cliente = useSupabaseClient<Database>()

    const [inmuebleRes, personasRes, novedadesRes, pagosRes, lineasRes] = await Promise.all([
      cliente
        .from('inmuebles')
        .select('created_at')
        .eq('tenant_id', tenantId)
        .eq('id', inmuebleId)
        .single(),
      cliente
        .from('inmueble_persona_rol')
        .select('vigente_desde, porcentaje, tercero:terceros(nombre_completo), rol:lista_tipos(nombre)')
        .eq('tenant_id', tenantId)
        .eq('inmueble_id', inmuebleId),
      cliente
        .from('novedades')
        .select('created_at, tipo, monto, estado, created_by, approved_by, approved_at')
        .eq('tenant_id', tenantId)
        .eq('inmueble_id', inmuebleId),
      cliente
        .from('pagos')
        .select('created_at, monto, registrado_por')
        .eq('tenant_id', tenantId)
        .eq('inmueble_id', inmuebleId),
      cliente
        .from('liquidacion_lineas')
        .select('created_at, monto, liquidacion:liquidaciones(periodo_id, periodo:periodos(anio, mes))')
        .eq('tenant_id', tenantId)
        .eq('inmueble_id', inmuebleId),
    ])
    if (inmuebleRes.error) throw inmuebleRes.error
    if (personasRes.error) throw personasRes.error
    if (novedadesRes.error) throw novedadesRes.error
    if (pagosRes.error) throw pagosRes.error
    if (lineasRes.error) throw lineasRes.error

    const actorIds = new Set<string>()
    for (const n of novedadesRes.data ?? []) {
      actorIds.add(n.created_by)
      if (n.approved_by) actorIds.add(n.approved_by)
    }
    for (const p of pagosRes.data ?? []) {
      if (p.registrado_por) actorIds.add(p.registrado_por)
    }

    const nombresPorId = new Map<string, string>()
    if (actorIds.size > 0) {
      const { data: perfiles, error: errorPerfiles } = await cliente
        .from('profiles')
        .select('id, full_name')
        .in('id', [...actorIds])
      if (errorPerfiles) throw errorPerfiles
      for (const perfil of perfiles ?? []) {
        if (perfil.full_name) nombresPorId.set(perfil.id, perfil.full_name)
      }
    }

    const eventos: EventoHistorico[] = []

    eventos.push({
      fecha: inmuebleRes.data.created_at,
      tipo: 'inmueble',
      descripcion: 'Inmueble registrado en la copropiedad',
      actor: null,
    })

    for (const p of personasRes.data ?? []) {
      const nombreTercero = (p.tercero as { nombre_completo: string | null } | null)?.nombre_completo ?? 'Tercero'
      const nombreRol = (p.rol as { nombre: string } | null)?.nombre ?? 'rol'
      const porcentaje = p.porcentaje ? ` (${p.porcentaje}%)` : ''
      eventos.push({
        fecha: p.vigente_desde,
        tipo: 'persona',
        descripcion: `Tercero asociado: ${nombreTercero} — ${nombreRol}${porcentaje}`,
        actor: null,
      })
    }

    for (const n of novedadesRes.data ?? []) {
      eventos.push({
        fecha: n.created_at,
        tipo: 'novedad',
        descripcion: `Novedad registrada: ${n.tipo} · $ ${n.monto}`,
        actor: nombresPorId.get(n.created_by) ?? null,
      })
      if (n.approved_at) {
        eventos.push({
          fecha: n.approved_at,
          tipo: 'novedad',
          descripcion: `Novedad ${n.estado}: ${n.tipo} · $ ${n.monto}`,
          actor: n.approved_by ? (nombresPorId.get(n.approved_by) ?? null) : null,
        })
      }
    }

    for (const p of pagosRes.data ?? []) {
      eventos.push({
        fecha: p.created_at,
        tipo: 'pago',
        descripcion: `Pago registrado por $ ${p.monto}`,
        actor: p.registrado_por ? (nombresPorId.get(p.registrado_por) ?? null) : null,
      })
    }

    for (const l of lineasRes.data ?? []) {
      const periodo = (l.liquidacion as { periodo: { anio: number; mes: number } | null } | null)
        ?.periodo
      const etiquetaPeriodo = periodo ? `${periodo.anio}-${String(periodo.mes).padStart(2, '0')}` : '—'
      eventos.push({
        fecha: l.created_at,
        tipo: 'liquidacion',
        descripcion: `Liquidación del periodo ${etiquetaPeriodo}: $ ${l.monto}`,
        actor: null,
      })
    }

    eventos.sort((a, b) => new Date(b.fecha).getTime() - new Date(a.fecha).getTime())
    historico.value = eventos
    return historico.value
  }

  function limpiar(): void {
    inmuebleActivo.value = null
    zonasExclusivas.value = []
    coeficienteVigente.value = null
    historico.value = []
  }

  return {
    inmuebleActivo,
    zonasExclusivas,
    coeficienteVigente,
    historico,
    loading,
    cargarInmueble,
    crearInmueble,
    actualizarInmueble,
    cargarZonasExclusivas,
    cargarCoeficienteVigente,
    cargarHistorico,
    limpiar,
  }
})
