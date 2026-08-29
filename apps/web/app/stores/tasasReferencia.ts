/**
 * Tasas de referencia certificadas — CAR §3.4, art. 30 Ley 675/2001.
 *
 * La tabla es GLOBAL, sin `tenant_id` (única excepción a REC-CAR-007: la ley
 * es la misma para toda copropiedad) y **append-only**: `forbid_mutation`
 * bloquea UPDATE y DELETE, así que aquí no hay editar ni borrar, y tampoco
 * "cerrar la vigencia de la anterior" — cada resolución entra como una fila
 * nueva con su vigencia completa.
 *
 * Dos consecuencias que la pantalla tiene que respetar:
 *
 * 1. `vigente_hasta` es obligatoria en la práctica. La restricción
 *    `tasas_referencia_sin_solape` compara `daterange(desde, coalesce(hasta,
 *    'infinity'), '[]')`, de modo que una fila sin fecha de cierre ocupa todo
 *    el futuro y, al no poder actualizarse, **bloquea el tipo de tasa para
 *    siempre**. El IBC se certifica por periodos, así que siempre hay fecha
 *    de cierre conocida.
 * 2. Un error de captura no se corrige: se queda. Por eso la pantalla pide
 *    confirmar antes de insertar.
 *
 * Lectura abierta a cualquier autenticado (información pública, igual para
 * todos los tenants); escritura solo `is_platform_admin` (RLS,
 * 20260822220000).
 *
 * Unidades: `valor_ea` y `valor_mensual` son **fracciones decimales**, no
 * porcentajes — 0.02 = 2%. Es la misma unidad que consume el motor
 * (`SegmentoTasa.tasaMensual`, cuenta-corriente.ts) y contra la que el guard
 * de tope legal compara `interes_tasa_mensual`.
 */
import { defineStore } from 'pinia'
import type { Database } from '@aquila/shared'

type TasaReferenciaRow = Database['public']['Tables']['tasas_referencia']['Row']
type TipoTasaReferencia = Database['public']['Enums']['tipo_tasa_referencia_t']

export const useTasasReferenciaStore = defineStore('tasasReferencia', () => {
  const tasas = shallowRef<TasaReferenciaRow[]>([])
  const loading = ref(false)

  async function cargarTasas(): Promise<TasaReferenciaRow[]> {
    loading.value = true
    try {
      const cliente = useSupabaseClient<Database>()
      const { data, error: errorTasas } = await cliente
        .from('tasas_referencia')
        .select('*')
        .order('vigente_desde', { ascending: false })
      if (errorTasas) throw errorTasas
      tasas.value = data ?? []
      return tasas.value
    } finally {
      loading.value = false
    }
  }

  /**
   * Registra una resolución. `registrada_por` sale de `authStore.profile.id` y
   * NO de `useSupabaseUser().value.id`, que en esta versión de
   * @nuxtjs/supabase es el JWT decodificado y no tiene `.id` (ver la trampa
   * anotada tras el bug del guard de auto-aprobación del art. 48).
   */
  async function registrarTasa(params: {
    tipoTasa: TipoTasaReferencia
    vigenteDesde: string
    vigenteHasta: string
    valorEa: number
    valorMensual: number
    resolucionNumero: string
    resolucionFecha: string
    entidadFuente: string
    urlFuente?: string
  }): Promise<TasaReferenciaRow> {
    const authStore = useAuthStore()
    const cliente = useSupabaseClient<Database>()
    const { data, error: errorInsert } = await cliente
      .from('tasas_referencia')
      .insert({
        tipo_tasa: params.tipoTasa,
        vigente_desde: params.vigenteDesde,
        vigente_hasta: params.vigenteHasta,
        valor_ea: params.valorEa,
        valor_mensual: params.valorMensual,
        resolucion_numero: params.resolucionNumero,
        resolucion_fecha: params.resolucionFecha,
        entidad_fuente: params.entidadFuente,
        url_fuente: params.urlFuente || null,
        registrada_por: authStore.profile?.id ?? null,
      })
      .select('*')
      .single()
    if (errorInsert) throw errorInsert

    await cargarTasas()
    return data
  }

  function limpiar(): void {
    tasas.value = []
  }

  return { tasas, loading, cargarTasas, registrarTasa, limpiar }
})
