/**
 * Módulo de recaudo (RC-5) — listado de pagos de toda la copropiedad, con
 * su recibo de caja (si ya se emitió — el trigger de RC-3 lo hace siempre
 * para un pago real, así que en la práctica todos lo tienen salvo los
 * registrados antes de esa migración), filtros y totales por forma de
 * pago. Distinto de cuentaCorriente.ts (que es POR INMUEBLE, para la ficha)
 * — este store es tenant-wide, para la vista de administración.
 */
import { defineStore } from 'pinia'
import type { Database } from '@aquila/shared'

export interface PagoConRecibo {
  id: string
  inmueble_id: string
  inmueble_codigo: string
  /** null = inmueble sin agrupación asignada. Resolver el nombre legible (ruta del árbol)
   * le corresponde a quien pinte esto — este store no conoce agrupacionesStore. */
  inmueble_agrupacion_id: string | null
  monto: number
  fecha_pago: string
  fecha_registro: string
  referencia: string | null
  forma_pago_codigo: string | null
  forma_pago_nombre: string | null
  pago_original_id: string | null
  anulado_motivo: string | null
  es_reversa: boolean
  esta_anulado: boolean
  recibo_id: string | null
  recibo_folio: string | null
  /** Comprobante adjunto (documentos.pago_id, 20260903170000) — foto/PDF del recibo físico.
   * null = no se adjuntó ninguno al registrar el pago. */
  comprobante_storage_path: string | null
  comprobante_nombre_archivo: string | null
}

export interface FiltrosRecaudo {
  desde?: string
  hasta?: string
  inmuebleId?: string
  formaPagoCodigo?: string
  /** Nodo de agrupación elegido (ubicación) — se resuelve su subárbol completo con
   * agrupacion_subarbol() antes de filtrar, así que también trae los inmuebles de los
   * nodos hijos (ej. elegir "Torre 1" incluye sus pisos). */
  agrupacionId?: string
}

export const useRecaudoStore = defineStore('recaudo', () => {
  const pagos = shallowRef<PagoConRecibo[]>([])
  const loading = ref(false)

  async function cargarRecaudo(tenantId: string, filtros: FiltrosRecaudo = {}): Promise<PagoConRecibo[]> {
    loading.value = true
    try {
      const cliente = useSupabaseClient<Database>()
      let consulta = cliente
        .from('pagos')
        .select(
          `id, inmueble_id, monto, fecha_pago, fecha_registro, referencia, pago_original_id,
           anulado_motivo,
           inmueble:inmuebles(codigo, agrupacion_id),
           forma_pago:lista_tipos(codigo, nombre),
           recibo:recibos_caja(id, folio),
           comprobante:documentos(storage_path, nombre_archivo)`,
        )
        .eq('tenant_id', tenantId)
        .order('fecha_pago', { ascending: false })
        .order('created_at', { ascending: false })

      if (filtros.desde) consulta = consulta.gte('fecha_pago', filtros.desde)
      if (filtros.hasta) consulta = consulta.lte('fecha_pago', filtros.hasta)
      if (filtros.inmuebleId) consulta = consulta.eq('inmueble_id', filtros.inmuebleId)

      const { data, error } = await consulta
      if (error) throw error

      // Un pago anulado (tiene una reversa) se marca así en el cliente — la
      // consulta trae TODOS los pagos (reales y reversas) de una vez;
      // reconstruir el mapa de "¿quién reversa a quién?" evita N consultas.
      const reversasPorOriginal = new Set(
        (data ?? []).filter((p) => p.pago_original_id !== null).map((p) => p.pago_original_id as string),
      )

      let filas: PagoConRecibo[] = (data ?? []).map((p) => ({
        id: p.id,
        inmueble_id: p.inmueble_id,
        inmueble_codigo: p.inmueble?.codigo ?? '—',
        inmueble_agrupacion_id: p.inmueble?.agrupacion_id ?? null,
        monto: Number(p.monto),
        fecha_pago: p.fecha_pago,
        fecha_registro: p.fecha_registro,
        referencia: p.referencia,
        forma_pago_codigo: p.forma_pago?.codigo ?? null,
        forma_pago_nombre: p.forma_pago?.nombre ?? null,
        pago_original_id: p.pago_original_id,
        anulado_motivo: p.anulado_motivo,
        es_reversa: p.pago_original_id !== null,
        esta_anulado: reversasPorOriginal.has(p.id),
        recibo_id: p.recibo?.id ?? null,
        recibo_folio: p.recibo?.folio ?? null,
        comprobante_storage_path: p.comprobante?.[0]?.storage_path ?? null,
        comprobante_nombre_archivo: p.comprobante?.[0]?.nombre_archivo ?? null,
      }))

      if (filtros.formaPagoCodigo) {
        filas = filas.filter((f) => f.forma_pago_codigo === filtros.formaPagoCodigo)
      }

      // Ubicación: el nodo elegido + su subárbol completo (agrupacion_subarbol) — así
      // "Torre 1" también incluye los pagos de sus pisos, no solo los del nodo exacto.
      if (filtros.agrupacionId) {
        const { data: subarbol, error: errorSubarbol } = await cliente.rpc('agrupacion_subarbol', {
          p_agrupacion_id: filtros.agrupacionId,
        })
        if (errorSubarbol) throw errorSubarbol
        const idsSubarbol = new Set((subarbol ?? []).map((n) => n.id))
        filas = filas.filter((f) => f.inmueble_agrupacion_id !== null && idsSubarbol.has(f.inmueble_agrupacion_id))
      }

      pagos.value = filas
      return pagos.value
    } finally {
      loading.value = false
    }
  }

  /** Reenvía el correo del recibo de caja (RC-4). */
  async function reenviarRecibo(reciboId: string): Promise<{ enviados: string[]; enlace: string }> {
    const cliente = useSupabaseClient<Database>()
    const { data, error: errorFuncion } = await cliente.functions.invoke<{
      enviados: string[]
      enlace: string
    }>('enviar-recibo-caja', { body: { recibo_caja_id: reciboId, reenviar: true } })
    if (errorFuncion) throw await extraerErrorFuncion(errorFuncion)
    if (!data) throw new Error('enviar-recibo-caja no devolvió datos.')
    return data
  }

  function limpiar(): void {
    pagos.value = []
  }

  return { pagos, loading, cargarRecaudo, reenviarRecibo, limpiar }
})
