/**
 * FIN-4 (20260932560000-20260932630000) — flujo de caja proyectado y alertas de liquidez. Ver
 * Casos de uso/Tres Modulos/Financiero/FIN_04_flujo_proyectado.md.
 *
 * Todo se lee/escribe directo por RLS (mismo criterio que posicionTesoreria.ts): finanzas_flujo_
 * proyectado/finanzas_proyeccion_vs_real/finanzas_tasa_recaudo_historica son funciones `stable`
 * de solo lectura; finanzas_escenario_parametros/finanzas_alerta_regla van por INSERT/UPDATE
 * directo con los guards de BD como única autoridad; finanzas_flujo_snapshot_guardar es la única
 * vía de escritura de snapshot (security definer, recalcula del lado del servidor).
 *
 * Tipos locales, no `Database['public']['Functions'][...]`: las migraciones de este corte todavía
 * no se pushearon a remoto al momento de escribir este store, así que `pnpm db:types` (que lee del
 * proyecto remoto) no las conoce todavía — mismo criterio ya usado en las páginas de MANT-9 antes
 * de su propio push. Migrar a los tipos generados cuando se regeneren.
 */
import { defineStore } from 'pinia'
import type { Database, Explicacion, Json } from '@aquila/shared'
import { explicarAlertaLiquidez } from '@aquila/shared'
import { extraerErrorFuncion } from '~/utils/edge-function-error'
import type { ResultadoRedaccionIa } from '~/types/ia-redaccion'

export type FlujoEscenario = 'base' | 'conservador' | 'optimista'

export interface FlujoFila {
  semana: number
  ingresos_esperados: number
  ingresos_otros: number
  egresos_cxp: number
  egresos_contratos: number
  egresos_mantenimiento: number
  flujo_neto: number
  saldo_acumulado: number
  componentes_insuficientes: string[]
}

export interface EscenarioParametrosRow {
  id: string
  tenant_id: string
  escenario: FlujoEscenario
  version: number
  estado: 'borrador' | 'vigente' | 'historica'
  vigente_desde: string | null
  vigente_hasta: string | null
  pct_recaudo_esperado: number | null
  dias_adicionales_pago_proveedor: number
  created_at: string
  updated_at: string | null
}

export interface AlertaReglaRow {
  id: string
  tenant_id: string
  tipo_id: number
  nombre: string
  activa: boolean
  umbral: number | null
  semanas_consecutivas: number | null
  created_at: string
  updated_at: string | null
}

export interface AlertaEmitidaRow {
  id: string
  tenant_id: string
  regla_id: string
  fecha_emision: string
  detalle: Json
  created_at: string
  /** Embed de solo lectura (regla_id → finanzas_alerta_regla → lista_tipos)
   *  para armar la explicación (Ola 2 §2) sin una segunda consulta. */
  finanzas_alerta_regla?: { nombre: string; lista_tipos: { codigo: string } | null } | null
}

export interface FlujoSnapshotRow {
  id: string
  tenant_id: string
  fecha_calculo: string
  horizonte_dias: number
  escenario: FlujoEscenario
  saldo_inicial: number
  parametros: Json
  resultado: Json
  motivo: string
  generado_por: string | null
  created_at: string
}

export interface ProyeccionVsRealFila {
  semana: number
  flujo_neto_proyectado: number
  flujo_neto_real: number
  desviacion: number
}

export const useFinanzasFlujoStore = defineStore('finanzasFlujo', () => {
  const filas = shallowRef<FlujoFila[]>([])
  const escenarioParametros = shallowRef<EscenarioParametrosRow[]>([])
  const alertaReglas = shallowRef<AlertaReglaRow[]>([])
  const alertasEmitidas = shallowRef<AlertaEmitidaRow[]>([])
  const snapshots = shallowRef<FlujoSnapshotRow[]>([])
  const loading = ref(false)
  const guardandoSnapshot = ref(false)

  const parametrosConservadorVigente = computed(
    () => escenarioParametros.value.find((p) => p.escenario === 'conservador' && p.estado === 'vigente') ?? null,
  )

  /** Ola 2 §2, segundo dominio explicando (finanzas): una Explicacion por
   *  alerta emitida, misma forma que la de cartera-variacion. detalle
   *  llega como Json de Supabase — se acota a Record<string, unknown>
   *  aquí, en el borde, no dentro de explicarAlertaLiquidez (que se queda
   *  pura y sin saber de dónde viene el dato). */
  const alertasExplicadas = computed<{ alerta: AlertaEmitidaRow; explicacion: Explicacion }[]>(() =>
    alertasEmitidas.value.map((row) => ({
      alerta: row,
      explicacion: {
        origenModulo: 'financiero',
        origenEntidad: 'finanzas_alerta_emitida',
        origenId: row.id,
        afirmaciones: explicarAlertaLiquidez({
          tipoCodigo: row.finanzas_alerta_regla?.lista_tipos?.codigo ?? '',
          nombreRegla: row.finanzas_alerta_regla?.nombre ?? 'Regla desconocida',
          fechaEmision: row.fecha_emision,
          detalle: (row.detalle ?? {}) as Record<string, unknown>,
        }),
      },
    })),
  )

  async function cargarFlujo(
    tenantId: string, horizonteDias: number, escenario: FlujoEscenario,
  ): Promise<FlujoFila[]> {
    loading.value = true
    try {
      const cliente = useSupabaseClient<Database>()
      const { data, error } = await cliente.rpc('finanzas_flujo_proyectado', {
        p_tenant_id: tenantId, p_horizonte_dias: horizonteDias, p_escenario: escenario,
      })
      if (error) throw error
      filas.value = (data ?? []) as unknown as FlujoFila[]
      return filas.value
    } finally {
      loading.value = false
    }
  }

  async function cargarEscenarioParametros(tenantId: string): Promise<EscenarioParametrosRow[]> {
    const cliente = useSupabaseClient<Database>()
    const { data, error } = await cliente
      .from('finanzas_escenario_parametros')
      .select('*')
      .eq('tenant_id', tenantId)
      .order('version', { ascending: false })
    if (error) throw error
    escenarioParametros.value = (data ?? []) as unknown as EscenarioParametrosRow[]
    return escenarioParametros.value
  }

  /** Crea una versión nueva de 'conservador' en borrador y la activa — dos pasos secuenciales
   * (retirar la vigente actual a historica, luego promover), mismo patrón que activarPolitica en
   * posicionTesoreria.ts. */
  async function guardarConservador(params: {
    tenantId: string; pctRecaudoEsperado: number; diasAdicionalesPagoProveedor: number
  }): Promise<void> {
    const cliente = useSupabaseClient<Database>()
    const ultimaVersion = escenarioParametros.value
      .filter((p) => p.escenario === 'conservador')
      .reduce((max, p) => Math.max(max, p.version), 0)

    const { data: nueva, error: errIns } = await cliente
      .from('finanzas_escenario_parametros')
      .insert({
        tenant_id: params.tenantId, escenario: 'conservador', version: ultimaVersion + 1,
        estado: 'borrador', pct_recaudo_esperado: params.pctRecaudoEsperado,
        dias_adicionales_pago_proveedor: params.diasAdicionalesPagoProveedor,
      })
      .select('id')
      .single()
    if (errIns) throw errIns

    const vigenteActual = parametrosConservadorVigente.value
    if (vigenteActual) {
      const { error: errRetiro } = await cliente
        .from('finanzas_escenario_parametros')
        .update({ estado: 'historica' })
        .eq('id', vigenteActual.id)
      if (errRetiro) throw errRetiro
    }
    const { error: errActivar } = await cliente
      .from('finanzas_escenario_parametros')
      .update({ estado: 'vigente' })
      .eq('id', nueva.id)
    if (errActivar) throw errActivar

    await cargarEscenarioParametros(params.tenantId)
  }

  async function cargarAlertaReglas(tenantId: string): Promise<AlertaReglaRow[]> {
    const cliente = useSupabaseClient<Database>()
    const { data, error } = await cliente
      .from('finanzas_alerta_regla')
      .select('*')
      .eq('tenant_id', tenantId)
      .order('created_at', { ascending: true })
    if (error) throw error
    alertaReglas.value = (data ?? []) as unknown as AlertaReglaRow[]
    return alertaReglas.value
  }

  async function actualizarAlertaRegla(
    id: string, cambios: { activa?: boolean; umbral?: number | null; semanas_consecutivas?: number | null },
  ): Promise<void> {
    const cliente = useSupabaseClient<Database>()
    const { error } = await cliente.from('finanzas_alerta_regla').update(cambios).eq('id', id)
    if (error) throw error
  }

  async function cargarAlertasEmitidas(tenantId: string, limite = 20): Promise<AlertaEmitidaRow[]> {
    const cliente = useSupabaseClient<Database>()
    const { data, error } = await cliente
      .from('finanzas_alerta_emitida')
      // Embed de solo lectura: trae el nombre de la regla y el código real
      // (TIPO_ALERTA_LIQUIDEZ) en la misma consulta — lo que
      // explicarAlertaLiquidez() necesita para redactar (Ola 2 §2).
      .select('*, finanzas_alerta_regla(nombre, lista_tipos(codigo))')
      .eq('tenant_id', tenantId)
      .order('fecha_emision', { ascending: false })
      .limit(limite)
    if (error) throw error
    alertasEmitidas.value = (data ?? []) as unknown as AlertaEmitidaRow[]
    return alertasEmitidas.value
  }

  /**
   * Ola 3 (segunda rebanada, ver D-134/primera en cartera) — redacta en
   * prosa la Explicacion de una alerta de liquidez ya emitida, reusando la
   * misma Edge Function genérica (recibe cualquier Explicacion, no sabe
   * de dominios). Bajo demanda, nunca automática — la llamada tiene costo.
   */
  async function redactarConIa(tenantId: string, explicacion: Explicacion): Promise<ResultadoRedaccionIa> {
    const cliente = useSupabaseClient<Database>()
    const { data, error: errorFuncion } = await cliente.functions.invoke<ResultadoRedaccionIa>(
      'ia-redactar-explicacion',
      { body: { tenant_id: tenantId, explicacion } },
    )
    if (errorFuncion) throw await extraerErrorFuncion(errorFuncion)
    if (!data) throw new Error('ia-redactar-explicacion no devolvió datos.')
    return data
  }

  async function cargarSnapshots(tenantId: string): Promise<FlujoSnapshotRow[]> {
    const cliente = useSupabaseClient<Database>()
    const { data, error } = await cliente
      .from('finanzas_flujo_snapshot')
      .select('*')
      .eq('tenant_id', tenantId)
      .order('fecha_calculo', { ascending: false })
    if (error) throw error
    snapshots.value = (data ?? []) as unknown as FlujoSnapshotRow[]
    return snapshots.value
  }

  async function guardarSnapshot(params: {
    tenantId: string; horizonteDias: number; escenario: FlujoEscenario; motivo: string
  }): Promise<string> {
    guardandoSnapshot.value = true
    try {
      const cliente = useSupabaseClient<Database>()
      const { data, error } = await cliente.rpc('finanzas_flujo_snapshot_guardar', {
        p_tenant_id: params.tenantId, p_horizonte_dias: params.horizonteDias,
        p_escenario: params.escenario, p_motivo: params.motivo,
      })
      if (error) throw error
      await cargarSnapshots(params.tenantId)
      return data as unknown as string
    } finally {
      guardandoSnapshot.value = false
    }
  }

  async function cargarProyeccionVsReal(snapshotId: string, hasta: string): Promise<ProyeccionVsRealFila[]> {
    const cliente = useSupabaseClient<Database>()
    const { data, error } = await cliente.rpc('finanzas_proyeccion_vs_real', {
      p_snapshot_id: snapshotId, p_hasta: hasta,
    })
    if (error) throw error
    return (data ?? []) as unknown as ProyeccionVsRealFila[]
  }

  function limpiar(): void {
    filas.value = []
    escenarioParametros.value = []
    alertaReglas.value = []
    alertasEmitidas.value = []
    snapshots.value = []
  }

  return {
    filas, escenarioParametros, alertaReglas, alertasEmitidas, snapshots, loading, guardandoSnapshot,
    parametrosConservadorVigente, alertasExplicadas,
    cargarFlujo, cargarEscenarioParametros, guardarConservador,
    cargarAlertaReglas, actualizarAlertaRegla, cargarAlertasEmitidas,
    cargarSnapshots, guardarSnapshot, cargarProyeccionVsReal, redactarConIa, limpiar,
  }
})
