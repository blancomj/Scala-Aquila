/**
 * Políticas financieras — parámetros versionados del motor de liquidación
 * (redondeo, residual, intereses, fondo de imprevistos). PLAN §4.3, 19 §73.
 *
 * SELECT/INSERT van directo por RLS (sin Edge Function), mismo criterio que
 * fundamentoNormativo.ts. `activarPolitica` retira primero la política vigente
 * actual (si existe) a 'historica' y luego promueve la nueva — dos UPDATE
 * secuenciales, nunca hay dos filas vigentes a la vez (el índice único parcial
 * `politicas_financieras_vigente_unica` solo admite una por tenant).
 * `guard_politica_inmutable` (redefinido en 20260830230000) admite esa única
 * transición vigente->historica sobre una fila vigente; todo lo demás —
 * cualquier otro campo, o cualquier cambio una vez historica — sigue
 * bloqueado igual que antes.
 *
 * `policy_hash`: 19 §73 (hash del contenido canónico) no existe todavía
 * como función — el seed de GC-001 usa un placeholder literal. Aquí se
 * calcula un SHA-256 sobre los campos enviados, solo para tener algo
 * determinista y distinto por versión; NO es el hash canónico real de 19§73.
 */
import { defineStore } from 'pinia'
import type { Database } from '@aquila/shared'

type PoliticaFinancieraRow = Database['public']['Tables']['politicas_financieras']['Row']
type RedondeoModo = Database['public']['Enums']['redondeo_modo_t']
type FondoBaseCalculo = Database['public']['Enums']['fondo_base_calculo_t']
type InteresDayCount = Database['public']['Enums']['interes_day_count_t']
type InteresDescuentoOrden = Database['public']['Enums']['interes_descuento_orden_t']

async function hashPlaceholder(valores: Record<string, unknown>): Promise<string> {
  const canonico = JSON.stringify(valores, Object.keys(valores).sort())
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(canonico))
  return Array.from(new Uint8Array(bytes))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

export const usePoliticaFinancieraStore = defineStore('politicaFinanciera', () => {
  const politicas = shallowRef<PoliticaFinancieraRow[]>([])
  const loading = ref(false)

  async function cargarPoliticas(tenantId: string): Promise<PoliticaFinancieraRow[]> {
    loading.value = true
    try {
      const cliente = useSupabaseClient<Database>()
      const { data, error: errorPoliticas } = await cliente
        .from('politicas_financieras')
        .select('*')
        .eq('tenant_id', tenantId)
        .order('version', { ascending: false })
      if (errorPoliticas) throw errorPoliticas
      politicas.value = data ?? []
      return politicas.value
    } finally {
      loading.value = false
    }
  }

  async function crearPolitica(params: {
    tenantId: string
    redondeoModo: RedondeoModo
    redondeoEscala: number
    interesTasaMensual?: number
    interesTopeMensual?: number
    interesDiasGracia: number
    interesDayCount: InteresDayCount
    interesDescuentoOrden: InteresDescuentoOrden
    fondoImprevistosPorcentaje?: number
    fondoImprevistosBase?: FondoBaseCalculo
    coeficientesSumaEsperada: number
    vigenteDesde?: string
  }): Promise<PoliticaFinancieraRow> {
    const ultimaVersion = politicas.value
      .filter((p) => p.tenant_id === params.tenantId)
      .reduce((max, p) => Math.max(max, p.version), 0)

    const campos = {
      tenant_id: params.tenantId,
      version: ultimaVersion + 1,
      estado: 'borrador' as const,
      redondeo_modo: params.redondeoModo,
      redondeo_escala: params.redondeoEscala,
      residual_metodo: 'mayor_resto' as const,
      interes_tasa_mensual: params.interesTasaMensual,
      interes_tope_mensual: params.interesTopeMensual,
      interes_dias_gracia: params.interesDiasGracia,
      interes_day_count: params.interesDayCount,
      interes_descuento_orden: params.interesDescuentoOrden,
      fondo_imprevistos_porcentaje: params.fondoImprevistosPorcentaje,
      fondo_imprevistos_base: params.fondoImprevistosBase,
      coeficientes_suma_esperada: params.coeficientesSumaEsperada,
      vigente_desde: params.vigenteDesde,
    }

    const cliente = useSupabaseClient<Database>()
    const { data, error: errorInsert } = await cliente
      .from('politicas_financieras')
      .insert({ ...campos, policy_hash: await hashPlaceholder(campos) })
      .select('*')
      .single()
    if (errorInsert) throw errorInsert

    await cargarPoliticas(params.tenantId)
    return data
  }

  /** Retira primero la política vigente actual (si existe) a 'historica' y luego
   * promueve la nueva — dos UPDATE secuenciales, nunca hay dos filas vigentes a la
   * vez (politicas_financieras_vigente_unica es por tenant_id). 20260830230000
   * redefinió el guard para admitir esa transición puntual. */
  async function activarPolitica(id: string, tenantId: string): Promise<void> {
    const cliente = useSupabaseClient<Database>()
    const nueva = politicas.value.find((p) => p.id === id)
    const vigenteActual = politicas.value.find(
      (p) => p.tenant_id === tenantId && p.estado === 'vigente' && p.id !== id,
    )

    if (vigenteActual) {
      const { error: errorRetiro } = await cliente
        .from('politicas_financieras')
        .update({ estado: 'historica', vigente_hasta: nueva?.vigente_desde ?? vigenteActual.vigente_desde })
        .eq('id', vigenteActual.id)
      if (errorRetiro) throw errorRetiro
    }

    const { error: errorUpdate } = await cliente
      .from('politicas_financieras')
      .update({ estado: 'vigente' })
      .eq('id', id)
    if (errorUpdate) throw errorUpdate

    await cargarPoliticas(tenantId)
  }

  function limpiar(): void {
    politicas.value = []
  }

  return { politicas, loading, cargarPoliticas, crearPolitica, activarPolitica, limpiar }
})
