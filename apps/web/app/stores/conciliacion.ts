/**
 * Conciliación de RECAUDO (banco↔residente) — Entregable A de
 * `Docs/Conciliacion Bancaria/PROMPT_CONCILIACION_BANCARIA_CONTABLE.md` §5. Backend completo
 * desde Fase 3 (20260904170000 en adelante); este store es la primera UI que lo enlaza.
 *
 * No confundir con la conciliación bancaria CONTABLE (banco↔libro, Entregable B, sin empezar) ni
 * con `fn_finanzas_conciliar_lote` (FIN-3, store `finanzasLotesPago.ts`) — glosario §2 del prompt.
 *
 * `extracto_bancario`/`extracto_linea`/`conciliacion_propuesta` no tienen política de INSERT/UPDATE
 * para `authenticated` — toda escritura pasa por las Edge Functions `importar-extracto-bancario` y
 * `conciliar-linea` (`service_role` adentro, rol verificado ahí). Este store nunca hace un insert
 * directo en esas tres tablas.
 */
import { defineStore } from 'pinia'
import type { Database } from '@aquila/shared'
import { extraerErrorFuncion } from '~/utils/edge-function-error'

type ExtractoLineaRow = Database['public']['Tables']['extracto_linea']['Row']
type ConciliacionPropuestaRow = Database['public']['Tables']['conciliacion_propuesta']['Row']
type ConciliacionEstado = Database['public']['Enums']['conciliacion_estado_t']

export interface PropuestaConInmueble extends ConciliacionPropuestaRow {
  readonly inmueble: { readonly codigo: string } | null
}

export interface LineaConPropuestas extends ExtractoLineaRow {
  readonly extracto: { readonly cuenta_bancaria_id: string | null; readonly nombre_archivo: string } | null
  readonly conciliacion_propuesta: PropuestaConInmueble[]
}

export interface ResumenImportacion {
  readonly extractoId: string
  readonly lineasTotales: number
  readonly lineasNuevas: number
  readonly lineasYaExistian: number
  readonly autoConciliadas: number
  readonly propuestas: number
  readonly sinCandidato: number
  readonly noEsPago: number
}

export interface MetricaAutoConciliacion {
  readonly candidatasAPago: number
  readonly autoConciliadas: number
  readonly porcentaje: number
}

export interface FiltrosLineas {
  estado?: ConciliacionEstado | null
  cuentaBancariaId?: string | null
  desde?: string | null
  hasta?: string | null
}

type AccionResolver =
  | { accion: 'aplicar_a_inmueble'; tenantId: string; lineaId: string; inmuebleId: string }
  | { accion: 'crear_saldo_a_favor'; tenantId: string; lineaId: string; inmuebleId: string }
  | { accion: 'descartar'; tenantId: string; lineaId: string; motivo: string }

export const useConciliacionStore = defineStore('conciliacion', () => {
  const lineas = shallowRef<LineaConPropuestas[]>([])
  const metrica = ref<MetricaAutoConciliacion | null>(null)
  const loading = ref(false)
  const importando = ref(false)
  const resolviendo = ref(false)

  async function cargarLineas(tenantId: string, filtros: FiltrosLineas = {}): Promise<void> {
    loading.value = true
    try {
      const cliente = useSupabaseClient<Database>()
      let consulta = cliente
        .from('extracto_linea')
        .select(
          '*, extracto:extracto_bancario!inner(cuenta_bancaria_id, nombre_archivo), '
            + 'conciliacion_propuesta(*, inmueble:inmuebles(codigo))',
        )
        .eq('tenant_id', tenantId)
      if (filtros.estado) consulta = consulta.eq('estado', filtros.estado)
      if (filtros.cuentaBancariaId) consulta = consulta.eq('extracto.cuenta_bancaria_id', filtros.cuentaBancariaId)
      if (filtros.desde) consulta = consulta.gte('fecha_movimiento', filtros.desde)
      if (filtros.hasta) consulta = consulta.lte('fecha_movimiento', filtros.hasta)
      const { data, error } = await consulta.order('fecha_movimiento', { ascending: false })
      if (error) throw error
      lineas.value = (data ?? []) as unknown as LineaConPropuestas[]
    } finally {
      loading.value = false
    }
  }

  /** Mismo cálculo que `medirAutoConciliacion()`
   * (packages/liquidation-engine/src/conciliacion-supabase.ts) — no se importa desde ahí: ese
   * módulo no vive en el barrel del paquete a propósito (fuera de `exports`, ver package.json),
   * así que se replica la misma consulta de solo lectura en vez de un import que rompería el
   * build. % sobre las líneas CANDIDATAS A PAGO (monto > 0), no sobre el total del archivo. */
  async function medirKpi(tenantId: string, periodoDesde: string, periodoHasta: string): Promise<void> {
    const cliente = useSupabaseClient<Database>()
    const { data, error } = await cliente
      .from('extracto_linea')
      .select('estado, monto')
      .eq('tenant_id', tenantId)
      .gte('fecha_movimiento', periodoDesde)
      .lte('fecha_movimiento', periodoHasta)
      .gt('monto', 0)
    if (error) throw error
    const candidatasAPago = data.length
    const autoConciliadas = data.filter((f) => f.estado === 'conciliada_auto').length
    metrica.value = {
      candidatasAPago,
      autoConciliadas,
      porcentaje: candidatasAPago === 0 ? 0 : Math.round((autoConciliadas / candidatasAPago) * 10000) / 100,
    }
  }

  async function importarExtracto(params: {
    tenantId: string
    /** Obligatoria desde D-CB-2 (Fase 3) — la Edge Function rechaza el import sin ella. */
    cuentaBancariaId: string
    archivo: File
  }): Promise<ResumenImportacion> {
    importando.value = true
    try {
      const cliente = useSupabaseClient<Database>()
      const form = new FormData()
      form.set('tenant_id', params.tenantId)
      form.set('cuenta_bancaria_id', params.cuentaBancariaId)
      form.set('archivo', params.archivo)
      const { data, error } = await cliente.functions.invoke<ResumenImportacion>('importar-extracto-bancario', {
        body: form,
      })
      if (error) throw await extraerErrorFuncion(error)
      return data!
    } finally {
      importando.value = false
    }
  }

  async function resolverLinea(params: AccionResolver): Promise<void> {
    resolviendo.value = true
    try {
      const cliente = useSupabaseClient<Database>()
      const body =
        params.accion === 'descartar'
          ? { accion: 'descartar', tenant_id: params.tenantId, linea_id: params.lineaId, motivo: params.motivo }
          : {
              accion: params.accion,
              tenant_id: params.tenantId,
              linea_id: params.lineaId,
              inmueble_id: params.inmuebleId,
            }
      const { error } = await cliente.functions.invoke('conciliar-linea', { body })
      if (error) throw await extraerErrorFuncion(error)
    } finally {
      resolviendo.value = false
    }
  }

  function limpiar(): void {
    lineas.value = []
    metrica.value = null
  }

  return {
    lineas,
    metrica,
    loading,
    importando,
    resolviendo,
    cargarLineas,
    medirKpi,
    importarExtracto,
    resolverLinea,
    limpiar,
  }
})
