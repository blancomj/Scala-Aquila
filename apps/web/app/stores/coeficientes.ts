/**
 * Coeficientes de copropiedad — versionado por `coeficiente_sets`
 * (PLAN_DATOS_REALES.md §3.1.4). SELECT/INSERT/UPDATE van directo por RLS
 * (agent) — sin Edge Function, mismo criterio que politicaFinanciera.ts.
 *
 * Un set se crea vacío (`crearSetVacio`) y sus coeficientes se cargan
 * incrementalmente con `guardarLoteCoeficientes` — autoguardado fila por
 * fila desde el drawer, o de una vez desde una importación CSV. Mientras
 * `estado = 'borrador'` la BD permite seguir escribiendo `coeficientes` y
 * refrescando `suma_total` sin restricción; `guard_coeficiente_set_inmutable`
 * solo bloquea el UPDATE una vez que `old.estado` ya es vigente/historica.
 * Esto reemplaza el `crearCoeficienteSet` atómico anterior (todo-o-nada en
 * un solo guardar) — con 300 inmuebles era imposible completarlo en una
 * sola sesión y no había forma de retomar lo ya digitado.
 *
 * `activarCoeficienteSet` retira primero el set vigente actual (si existe)
 * a 'historica' y luego promueve el nuevo — dos UPDATE secuenciales, nunca
 * hay dos filas vigentes a la vez (20260830220000_coeficiente_set_reemplazar_vigente
 * redefinió el guard para admitir esa transición puntual; todo lo demás
 * sobre un set vigente/historica sigue bloqueado). El mismo gap sigue sin
 * resolverse a propósito en presupuestos y politicas_financieras — no se
 * tocó ahí, es específico de coeficiente_sets.
 *
 * Σ coeficientes: el motor NO exige que sume 1.0 (16 §82 — probado en
 * allocation.test.ts, ver `suma_total` abajo). El formulario de creación
 * solo advierte si Σ no coincide con `coeficientes_suma_esperada` de la
 * política vigente, nunca bloquea.
 */
import { defineStore } from 'pinia'
import type { Database } from '@aquila/shared'

type CoeficienteSetRow = Database['public']['Tables']['coeficiente_sets']['Row']
type ConteoPorSet = Map<string, number>

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

/** Crea el set vacío (borrador, Σ=0) que luego recibe sus coeficientes
   * incrementalmente vía `guardarLoteCoeficientes`. */
  async function crearSetVacio(params: {
    tenantId: string
    vigenteDesde: string
  }): Promise<CoeficienteSetRow> {
    const ultimaVersion = coeficienteSets.value
      .filter((s) => s.tenant_id === params.tenantId)
      .reduce((max, s) => Math.max(max, s.version), 0)

    const cliente = useSupabaseClient<Database>()
    const { data: set, error: errorInsertSet } = await cliente
      .from('coeficiente_sets')
      .insert({
        tenant_id: params.tenantId,
        version: ultimaVersion + 1,
        vigente_desde: params.vigenteDesde,
        suma_total: 0,
      })
      .select('*')
      .single()
    if (errorInsertSet) throw errorInsertSet

    await cargarCoeficienteSets(params.tenantId)
    return set
  }

  /** Único punto de escritura de `coeficientes` — upsert de un lote (una fila
   * para el autoguardado por input, muchas para una importación CSV) seguido
   * de un recálculo de `suma_total` sobre TODO el set (no solo el lote). */
  async function guardarLoteCoeficientes(params: {
    tenantId: string
    setId: string
    valores: { inmuebleId: string; valor: number }[]
  }): Promise<number> {
    const cliente = useSupabaseClient<Database>()
    if (params.valores.length > 0) {
      const { error: errorUpsert } = await cliente.from('coeficientes').upsert(
        params.valores.map((v) => ({
          tenant_id: params.tenantId,
          set_id: params.setId,
          inmueble_id: v.inmuebleId,
          valor: v.valor,
        })),
        { onConflict: 'set_id,inmueble_id' },
      )
      if (errorUpsert) throw errorUpsert
    }

    const { data: filas, error: errorSuma } = await cliente
      .from('coeficientes')
      .select('valor')
      .eq('set_id', params.setId)
    if (errorSuma) throw errorSuma
    const sumaTotal = (filas ?? []).reduce((acc, f) => acc + Number(f.valor), 0)

    const { error: errorUpdateSuma } = await cliente
      .from('coeficiente_sets')
      .update({ suma_total: sumaTotal })
      .eq('id', params.setId)
    if (errorUpdateSuma) throw errorUpdateSuma

    const set = coeficienteSets.value.find((s) => s.id === params.setId)
    if (set) set.suma_total = sumaTotal

    return sumaTotal
  }

  /** Precarga de un set existente (continuar un borrador, o solo ver uno ya
   * activado) — Map por inmueble_id para llenar el formulario. */
  async function cargarCoeficientesDeSet(
    setId: string,
    tenantId: string,
  ): Promise<Map<string, number>> {
    const cliente = useSupabaseClient<Database>()
    const { data, error: errorCoeficientes } = await cliente
      .from('coeficientes')
      .select('inmueble_id, valor')
      .eq('set_id', setId)
      .eq('tenant_id', tenantId)
    if (errorCoeficientes) throw errorCoeficientes
    return new Map((data ?? []).map((c) => [c.inmueble_id, Number(c.valor)]))
  }

  /** Cuántos inmuebles ya tienen coeficiente en cada set — para mostrar
   * progreso ("245 / 300") en la tabla de versiones sin cargar el detalle. */
  async function cargarConteoCoeficientesPorSet(tenantId: string): Promise<ConteoPorSet> {
    const cliente = useSupabaseClient<Database>()
    const { data, error: errorConteo } = await cliente
      .from('coeficientes')
      .select('set_id')
      .eq('tenant_id', tenantId)
    if (errorConteo) throw errorConteo
    const conteo: ConteoPorSet = new Map()
    for (const fila of data ?? []) {
      conteo.set(fila.set_id, (conteo.get(fila.set_id) ?? 0) + 1)
    }
    return conteo
  }

  async function activarCoeficienteSet(id: string, tenantId: string): Promise<void> {
    const cliente = useSupabaseClient<Database>()
    const nuevo = coeficienteSets.value.find((s) => s.id === id)
    const vigenteActual = coeficienteSets.value.find(
      (s) => s.tenant_id === tenantId && s.estado === 'vigente' && s.id !== id,
    )

    if (vigenteActual) {
      const { error: errorRetiro } = await cliente
        .from('coeficiente_sets')
        .update({ estado: 'historica', vigente_hasta: nuevo?.vigente_desde ?? vigenteActual.vigente_desde })
        .eq('id', vigenteActual.id)
      if (errorRetiro) throw errorRetiro
    }

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
    crearSetVacio,
    guardarLoteCoeficientes,
    cargarCoeficientesDeSet,
    cargarConteoCoeficientesPorSet,
    activarCoeficienteSet,
    limpiar,
  }
})
