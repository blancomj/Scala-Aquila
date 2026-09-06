/**
 * FIN-1 (20260930780000-20260930810000) — posición de tesorería, disponibilidad bancaria y
 * política de "utilizable". Ver Casos de uso/Tres Modulos/Financiero/FIN_01_posicion_tesoreria.md.
 *
 * Todo se lee/escribe directo por RLS (mismo criterio que fondos.ts): finanzas_posicion_tesoreria
 * y fn_cuenta_bancaria_disponible son funciones `stable`/de solo lectura; finanzas_politica_
 * tesoreria e finanzas_cuenta_bancaria_compromiso van por INSERT/UPDATE directo, con los guards
 * de BD (guard_finanzas_compromiso_bancario, guard_finanzas_politica_tesoreria*) como única
 * autoridad de validación — sus mensajes llegan tal cual, sin traducir.
 *
 * `activarPolitica` sigue el mismo patrón de dos UPDATE secuenciales que politicaFinanciera.ts:
 * retira la vigente actual a 'historica' y luego promueve la nueva a 'vigente' — nunca hay dos
 * filas vigentes a la vez (índice único parcial `finanzas_politica_tesoreria_vigente_unico`).
 */
import { defineStore } from 'pinia'
import type { Database } from '@aquila/shared'

type PosicionFila = Database['public']['Functions']['finanzas_posicion_tesoreria']['Returns'][number]
type DisponibleCuenta = Database['public']['Functions']['fn_cuenta_bancaria_disponible']['Returns'][number]
type PoliticaTesoreriaRow = Database['public']['Tables']['finanzas_politica_tesoreria']['Row']
type CompromisoRow = Database['public']['Tables']['finanzas_cuenta_bancaria_compromiso']['Row']
type CompromisoOrigen = Database['public']['Enums']['compromiso_bancario_origen_t']
type CompromisoEstado = Database['public']['Enums']['compromiso_bancario_estado_t']

export const usePosicionTesoreriaStore = defineStore('posicionTesoreria', () => {
  const posicion = shallowRef<PosicionFila[]>([])
  const politicas = shallowRef<PoliticaTesoreriaRow[]>([])
  const compromisosPorCuenta = ref<Record<string, CompromisoRow[]>>({})
  const loading = ref(false)
  const guardando = ref(false)

  const politicaVigente = computed(() => politicas.value.find((p) => p.estado === 'vigente') ?? null)

  async function cargarPosicion(tenantId: string, fecha?: string): Promise<PosicionFila[]> {
    loading.value = true
    try {
      const cliente = useSupabaseClient<Database>()
      const { data, error } = await cliente.rpc('finanzas_posicion_tesoreria', {
        p_tenant_id: tenantId,
        ...(fecha ? { p_fecha: fecha } : {}),
      })
      if (error) throw error
      posicion.value = data ?? []
      return posicion.value
    } finally {
      loading.value = false
    }
  }

  async function cargarDisponibleCuenta(cuentaBancariaId: string, fecha?: string): Promise<DisponibleCuenta | null> {
    const cliente = useSupabaseClient<Database>()
    const { data, error } = await cliente
      .rpc('fn_cuenta_bancaria_disponible', {
        p_cuenta_bancaria_id: cuentaBancariaId,
        ...(fecha ? { p_fecha: fecha } : {}),
      })
      .single()
    if (error) throw error
    return data
  }

  /** Compromisos vigentes (no terminales) de una cuenta, para el detalle expandible §3.5. */
  async function cargarCompromisosCuenta(cuentaBancariaId: string): Promise<CompromisoRow[]> {
    const cliente = useSupabaseClient<Database>()
    const { data, error } = await cliente
      .from('finanzas_cuenta_bancaria_compromiso')
      .select('*')
      .eq('cuenta_bancaria_id', cuentaBancariaId)
      .in('estado', ['proyectado', 'reservado'] satisfies CompromisoEstado[])
      .order('created_at', { ascending: false })
    if (error) throw error
    compromisosPorCuenta.value = { ...compromisosPorCuenta.value, [cuentaBancariaId]: data ?? [] }
    return data ?? []
  }

  async function crearCompromiso(params: {
    tenantId: string
    cuentaBancariaId: string
    monto: number
    estado?: CompromisoEstado
    origen?: CompromisoOrigen
    fechaEsperadaEjecucion?: string
  }): Promise<CompromisoRow> {
    const cliente = useSupabaseClient<Database>()
    const { data, error } = await cliente
      .from('finanzas_cuenta_bancaria_compromiso')
      .insert({
        tenant_id: params.tenantId,
        cuenta_bancaria_id: params.cuentaBancariaId,
        monto: params.monto,
        estado: params.estado ?? 'proyectado',
        origen: params.origen ?? 'manual',
        fecha_esperada_ejecucion: params.fechaEsperadaEjecucion ?? null,
      })
      .select('*')
      .single()
    if (error) throw error
    await cargarCompromisosCuenta(params.cuentaBancariaId)
    return data
  }

  async function cargarPoliticas(tenantId: string): Promise<PoliticaTesoreriaRow[]> {
    const cliente = useSupabaseClient<Database>()
    const { data, error } = await cliente
      .from('finanzas_politica_tesoreria')
      .select('*')
      .eq('tenant_id', tenantId)
      .order('version', { ascending: false })
    if (error) throw error
    politicas.value = data ?? []
    return politicas.value
  }

  /** Crea la nueva versión en 'borrador', retira la vigente actual (si existe) a 'historica' y
   * promueve la nueva a 'vigente' — nunca una edición de una fila ya vigente o histórica
   * (guard_finanzas_politica_tesoreria_inmutable solo admite esa transición puntual). */
  async function guardarPolitica(params: {
    tenantId: string
    bancosUtilizables: string[]
    fondosUtilizables: string[]
    incluirCaja: boolean
    actaReferencia?: string
  }): Promise<PoliticaTesoreriaRow> {
    guardando.value = true
    try {
      const cliente = useSupabaseClient<Database>()
      const vigenteActual = politicaVigente.value
      const ultimaVersion = politicas.value
        .filter((p) => p.tenant_id === params.tenantId)
        .reduce((max, p) => Math.max(max, p.version), 0)
      const hoy = new Date().toISOString().slice(0, 10)

      const { data: nueva, error: errorInsert } = await cliente
        .from('finanzas_politica_tesoreria')
        .insert({
          tenant_id: params.tenantId,
          version: ultimaVersion + 1,
          estado: 'borrador',
          vigente_desde: hoy,
          bancos_utilizables: params.bancosUtilizables,
          fondos_utilizables: params.fondosUtilizables,
          incluir_caja: params.incluirCaja,
          acta_referencia: params.actaReferencia ?? null,
        })
        .select('*')
        .single()
      if (errorInsert) throw errorInsert

      if (vigenteActual) {
        const { error: errorRetiro } = await cliente
          .from('finanzas_politica_tesoreria')
          .update({ estado: 'historica', vigente_hasta: hoy })
          .eq('id', vigenteActual.id)
        if (errorRetiro) throw errorRetiro
      }

      const { error: errorActivar } = await cliente
        .from('finanzas_politica_tesoreria')
        .update({ estado: 'vigente' })
        .eq('id', nueva.id)
      if (errorActivar) throw errorActivar

      await cargarPoliticas(params.tenantId)
      return nueva
    } finally {
      guardando.value = false
    }
  }

  function limpiar(): void {
    posicion.value = []
    politicas.value = []
    compromisosPorCuenta.value = {}
  }

  return {
    posicion,
    politicas,
    politicaVigente,
    compromisosPorCuenta,
    loading,
    guardando,
    cargarPosicion,
    cargarDisponibleCuenta,
    cargarCompromisosCuenta,
    crearCompromiso,
    cargarPoliticas,
    guardarPolitica,
    limpiar,
  }
})
