/**
 * Coeficientes de copropiedad — versionado por `coeficiente_sets`
 * (PLAN_DATOS_REALES.md §3.1.4). SELECT/INSERT/UPDATE van directo por RLS
 * (agent) — sin Edge Function, mismo criterio que politicaFinanciera.ts.
 *
 * `activarCoeficienteSet` es un UPDATE directo, igual que
 * `activarPolitica`: solo funciona para el primer set de un tenant.
 * `guard_coeficiente_set_inmutable` bloquea cualquier UPDATE una vez que
 * `old.estado` ya es vigente/historica, y el índice único parcial
 * `coeficiente_sets_vigente_unico` rechaza un segundo set vigente.
 * Reemplazar un set vigente por una versión nueva no tiene mecanismo hoy —
 * gap real del esquema, no se inventa uno aquí (mismo criterio que
 * politicaFinanciera.ts); el error de Postgres llega tal cual al store.
 *
 * Σ coeficientes: el motor NO exige que sume 1.0 (16 §82 — probado en
 * allocation.test.ts, ver `suma_total` abajo). El formulario de creación
 * solo advierte si Σ no coincide con `coeficientes_suma_esperada` de la
 * política vigente, nunca bloquea.
 */
import { defineStore } from 'pinia'
import type { Database } from '@aquila/shared'

type CoeficienteSetRow = Database['public']['Tables']['coeficiente_sets']['Row']

export const useCoeficientesStore = defineStore('coeficientes', () => {
  const coeficienteSets = shallowRef<CoeficienteSetRow[]>([])
  const loading = ref(false)

  async function cargarCoeficienteSets(tenantId: string): Promise<CoeficienteSetRow[]> {
    loading.value = true
    try {
      const cliente = useSupabaseClient<Database>()
      const { data, error: errorSets } = await cliente
        .from('coeficiente_sets')
        .select('*')
        .eq('tenant_id', tenantId)
        .order('version', { ascending: false })
      if (errorSets) throw errorSets
      coeficienteSets.value = data ?? []
      return coeficienteSets.value
    } finally {
      loading.value = false
    }
  }

  /** Crea el set (borrador) y sus filas de coeficientes hijas — no atómico
   * (dos escrituras separadas), mismo criterio que asociarTerceroInmueble. */
  async function crearCoeficienteSet(params: {
    tenantId: string
    vigenteDesde: string
    valores: { inmuebleId: string; valor: number }[]
  }): Promise<CoeficienteSetRow> {
    const ultimaVersion = coeficienteSets.value
      .filter((s) => s.tenant_id === params.tenantId)
      .reduce((max, s) => Math.max(max, s.version), 0)
    const sumaTotal = params.valores.reduce((acc, v) => acc + v.valor, 0)

    const cliente = useSupabaseClient<Database>()
    const { data: set, error: errorInsertSet } = await cliente
      .from('coeficiente_sets')
      .insert({
        tenant_id: params.tenantId,
        version: ultimaVersion + 1,
        vigente_desde: params.vigenteDesde,
        suma_total: sumaTotal,
      })
      .select('*')
      .single()
    if (errorInsertSet) throw errorInsertSet

    const { error: errorInsertCoeficientes } = await cliente.from('coeficientes').insert(
      params.valores.map((v) => ({
        tenant_id: params.tenantId,
        set_id: set.id,
        inmueble_id: v.inmuebleId,
        valor: v.valor,
      })),
    )
    if (errorInsertCoeficientes) throw errorInsertCoeficientes

    await cargarCoeficienteSets(params.tenantId)
    return set
  }

  async function activarCoeficienteSet(id: string, tenantId: string): Promise<void> {
    const cliente = useSupabaseClient<Database>()
    const { error: errorUpdate } = await cliente
      .from('coeficiente_sets')
      .update({ estado: 'vigente' })
      .eq('id', id)
    if (errorUpdate) throw errorUpdate

    await cargarCoeficienteSets(tenantId)
  }

  function limpiar(): void {
    coeficienteSets.value = []
  }

  return {
    coeficienteSets,
    loading,
    cargarCoeficienteSets,
    crearCoeficienteSet,
    activarCoeficienteSet,
    limpiar,
  }
})
