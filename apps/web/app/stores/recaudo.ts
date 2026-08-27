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
}

export interface FiltrosRecaudo {
  desde?: string
  hasta?: string
  inmuebleId?: string
  formaPagoCodigo?: string
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
           inmueble:inmuebles(codigo),
           forma_pago:lista_tipos(codigo, nombre),
           recibo:recibos_caja(id, folio)`,
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
      }))

      if (filtros.formaPagoCodigo) {
        filas = filas.filter((f) => f.forma_pago_codigo === filtros.formaPagoCodigo)
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
