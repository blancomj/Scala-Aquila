/**
 * Conciliación bancaria CONTABLE (banco↔libro) — Fase 6 (UI) del plan aprobado en
 * `Docs/Conciliacion Bancaria/PROMPT_CONCILIACION_BANCARIA_CONTABLE.md` (D-113/115/116/117).
 *
 * NO es la conciliación de RECAUDO (banco↔residente, `stores/conciliacion.ts`,
 * `pages/finanzas/conciliacion/`) — glosario §2. Esta pantalla compara el saldo del extracto
 * contra la cuenta contable de bancos.
 *
 * Generar y certificar pasan por Edge Function (service_role) — las dos tablas no tienen política
 * de INSERT/UPDATE para `authenticated` (20260935060000). Este store solo LEE directo
 * (`conciliacion_bancaria`/`conciliacion_bancaria_partida` sí tienen SELECT para miembros).
 */
import { defineStore } from 'pinia'
import type { Database } from '@aquila/shared'
import { extraerErrorFuncion } from '~/utils/edge-function-error'

type ConciliacionRow = Database['public']['Tables']['conciliacion_bancaria']['Row']
type PeriodoRow = Database['public']['Tables']['periodos']['Row']

export interface PartidaConciliacion {
  id: string
  origen: 'banco' | 'libro'
  monto: number
  descripcion: string | null
  resuelta: boolean
  tipo: { codigo: string; nombre: string } | null
  extracto_linea: { fecha_movimiento: string; descripcion_banco: string } | null
}

export interface ResumenGeneracion {
  conciliacionId: string
  saldoInicialBanco: number
  saldoFinalBanco: number
  saldoInicialLibros: number
  saldoFinalLibros: number
  partidasCruzadas: number
  partidasNoCruzadas: number
}

export const useConciliacionBancariaStore = defineStore('conciliacionBancaria', () => {
  const periodos = shallowRef<PeriodoRow[]>([])
  const conciliacion = shallowRef<ConciliacionRow | null>(null)
  const partidas = shallowRef<PartidaConciliacion[]>([])
  const loading = ref(false)
  const buscada = ref(false)

  async function cargarPeriodos(tenantId: string): Promise<PeriodoRow[]> {
    const cliente = useSupabaseClient<Database>()
    const { data, error } = await cliente
      .from('periodos')
      .select('*')
      .eq('tenant_id', tenantId)
      .order('anio', { ascending: false })
      .order('mes', { ascending: false })
    if (error) throw error
    periodos.value = data ?? []
    return periodos.value
  }

  /** Busca la conciliación (si existe) de una cuenta bancaria + período, con sus partidas. */
  async function buscar(tenantId: string, cuentaBancariaId: string, periodoId: string): Promise<void> {
    loading.value = true
    buscada.value = false
    try {
      const cliente = useSupabaseClient<Database>()
      const { data, error } = await cliente
        .from('conciliacion_bancaria')
        .select('*')
        .eq('tenant_id', tenantId)
        .eq('cuenta_bancaria_id', cuentaBancariaId)
        .eq('periodo_id', periodoId)
        .maybeSingle()
      if (error) throw error
      conciliacion.value = data

      if (!data) {
        partidas.value = []
        return
      }

      const { data: filas, error: errorPartidas } = await cliente
        .from('conciliacion_bancaria_partida')
        .select(
          'id, origen, monto, descripcion, resuelta, '
          + 'tipo:tipo_id(codigo, nombre), '
          + 'extracto_linea:extracto_linea_id(fecha_movimiento, descripcion_banco)',
        )
        .eq('conciliacion_id', data.id)
        .order('origen')
      if (errorPartidas) throw errorPartidas
      // Embed anidado vía FK — PostgREST no tipa un join a más de un nivel con certeza (mismo
      // caso ya resuelto en stores/conciliacion.ts para conciliacion_propuesta).
      partidas.value = (filas ?? []) as unknown as PartidaConciliacion[]
    } finally {
      loading.value = false
      buscada.value = true
    }
  }

  async function generar(tenantId: string, cuentaBancariaId: string, periodoId: string): Promise<void> {
    const cliente = useSupabaseClient<Database>()
    const { error } = await cliente.functions.invoke<ResumenGeneracion>('generar-conciliacion-bancaria', {
      body: { tenant_id: tenantId, cuenta_bancaria_id: cuentaBancariaId, periodo_id: periodoId },
    })
    if (error) throw await extraerErrorFuncion(error)
    await buscar(tenantId, cuentaBancariaId, periodoId)
  }

  async function certificar(tenantId: string, cuentaBancariaId: string, periodoId: string): Promise<void> {
    if (!conciliacion.value) return
    const cliente = useSupabaseClient<Database>()
    const { error } = await cliente.functions.invoke('certificar-conciliacion-bancaria', {
      body: { tenant_id: tenantId, conciliacion_id: conciliacion.value.id },
    })
    if (error) throw await extraerErrorFuncion(error)
    await buscar(tenantId, cuentaBancariaId, periodoId)
  }

  function limpiar(): void {
    conciliacion.value = null
    partidas.value = []
    buscada.value = false
  }

  return {
    periodos,
    conciliacion,
    partidas,
    loading,
    buscada,
    cargarPeriodos,
    buscar,
    generar,
    certificar,
    limpiar,
  }
})
