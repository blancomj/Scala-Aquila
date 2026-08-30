/**
 * Promesas y acuerdos de pago (CAR §12, bloque 19). Sin Edge Function:
 * guard_promesa_registrada/transicion y guard_acuerdo_propuesta/transicion/
 * guard_cuota_acuerdo_transicion (20260822300000/310000/20260907110000) ya
 * validan todo — estampan registrada_por/propuesto_por/consecutivo desde
 * auth.uid()/fn_siguiente_consecutivo, exigen administrador y bloquean
 * autoaprobación al activar un acuerdo, y gobiernan qué transición de
 * estado es válida. Mismo criterio que casosJuridicos.ts.
 *
 * NO incluido en este corte (documentado, no un descuido):
 *   - Congelar etapa_cobranza mientras el acuerdo está vigente y
 *     descongelarla al incumplir (CAR §12.5) — vive en el job diario
 *     (cartera-recalcular), fuera de alcance de una pantalla CRUD.
 *   - Generar la novedad tipo DISCOUNT al condonar intereses (CAR §12.6) —
 *     cruza con el flujo de aprobación de novedades existente; se deja el
 *     formulario listo para capturar acta_referencia/monto_condonado (la
 *     base de datos ya lo exige), pero la novedad no se crea automáticamente.
 *   - Marcar promesas cumplidas/incumplidas automáticamente (PH-C14/C15,
 *     job diario) — aquí el cambio de estado es manual.
 */
import { defineStore } from 'pinia'
import type { Database } from '@aquila/shared'
import { mensajeError } from '~/utils/error-message'
import { generarCuotasAcuerdo } from '~/utils/cuotas-acuerdo'

export type PromesaPago = Database['public']['Tables']['promesas_pago']['Row']
export type AcuerdoPago = Database['public']['Tables']['acuerdos_pago']['Row']
export type CuotaAcuerdo = Database['public']['Tables']['acuerdo_pago_cuotas']['Row']
export type EstadoPromesa = Database['public']['Enums']['estado_promesa_t']
export type EstadoAcuerdo = Database['public']['Enums']['estado_acuerdo_t']
export type EstadoCuotaAcuerdo = Database['public']['Enums']['estado_cuota_acuerdo_t']

export interface CrearPromesaInput {
  inmuebleId: string
  accionCobranzaId: string | null
  fechaPromesa: string
  montoPrometido: number
  fechaPagoPrometida: string
  notas: string | null
}

export interface CrearAcuerdoInput {
  inmuebleId: string
  fechaAcuerdo: string
  fechaInicio: string
  fechaFin: string
  montoCapital: number
  montoInteres: number
  montoOtros: number
  numeroCuotas: number
  cuotaInicial: number
  condonaInteres: boolean
  montoCondonado: number
  interesDuranteAcuerdo: boolean
  actaReferencia: string | null
  /** Acuerdo firmado, en documentos (CAR §12.1) — nullable, ver 20260908170000. */
  documentoId: string | null
}

export const useCarteraGestionStore = defineStore('carteraGestion', () => {
  const promesas = ref<PromesaPago[]>([])
  const acuerdos = ref<AcuerdoPago[]>([])
  const cuotas = ref<CuotaAcuerdo[]>([])
  const loading = ref(false)
  const guardando = ref(false)

  // ── promesas ────────────────────────────────────────────────────────
  async function cargarPromesas(tenantId: string): Promise<void> {
    loading.value = true
    try {
      const cliente = useSupabaseClient<Database>()
      const { data, error } = await cliente
        .from('promesas_pago')
        .select('*')
        .eq('tenant_id', tenantId)
        .order('fecha_pago_prometida', { ascending: true })
      if (error) throw new Error(mensajeError(error, 'No se pudieron cargar las promesas de pago.'))
      promesas.value = data ?? []
    } finally {
      loading.value = false
    }
  }

  async function crearPromesa(tenantId: string, input: CrearPromesaInput): Promise<void> {
    guardando.value = true
    try {
      const cliente = useSupabaseClient<Database>()
      const { error } = await cliente.from('promesas_pago').insert({
        tenant_id: tenantId,
        inmueble_id: input.inmuebleId,
        accion_cobranza_id: input.accionCobranzaId,
        fecha_promesa: input.fechaPromesa,
        monto_prometido: input.montoPrometido,
        fecha_pago_prometida: input.fechaPagoPrometida,
        notas: input.notas,
      })
      if (error) throw new Error(mensajeError(error, 'No se pudo registrar la promesa de pago.'))
      await cargarPromesas(tenantId)
    } finally {
      guardando.value = false
    }
  }

  async function actualizarEstadoPromesa(
    tenantId: string,
    promesaId: string,
    estado: EstadoPromesa,
    extras: { montoCumplido?: number } = {},
  ): Promise<void> {
    const cliente = useSupabaseClient<Database>()
    const { error } = await cliente
      .from('promesas_pago')
      .update({ estado, monto_cumplido: extras.montoCumplido })
      .eq('id', promesaId)
    if (error) throw new Error(mensajeError(error, 'No se pudo actualizar la promesa.'))
    await cargarPromesas(tenantId)
  }

  // ── acuerdos ────────────────────────────────────────────────────────
  async function cargarAcuerdos(tenantId: string): Promise<void> {
    loading.value = true
    try {
      const cliente = useSupabaseClient<Database>()
      const { data, error } = await cliente
        .from('acuerdos_pago')
        .select('*')
        .eq('tenant_id', tenantId)
        .order('created_at', { ascending: false })
      if (error) throw new Error(mensajeError(error, 'No se pudieron cargar los acuerdos de pago.'))
      acuerdos.value = data ?? []
    } finally {
      loading.value = false
    }
  }

  async function crearAcuerdo(tenantId: string, input: CrearAcuerdoInput): Promise<AcuerdoPago> {
    guardando.value = true
    try {
      const cliente = useSupabaseClient<Database>()
      const montoTotal = input.montoCapital + input.montoInteres + input.montoOtros

      // El calendario se calcula ANTES del insert — si las fechas/montos no
      // son coherentes (p.ej. período más corto que numero_cuotas), falla
      // aquí sin dejar un acuerdo a medias sin sus cuotas.
      const calendario = generarCuotasAcuerdo({
        montoTotal,
        cuotaInicial: input.cuotaInicial,
        numeroCuotas: input.numeroCuotas,
        fechaInicio: input.fechaInicio,
        fechaFin: input.fechaFin,
      })

      const { data: acuerdo, error: errorAcuerdo } = await cliente
        .from('acuerdos_pago')
        .insert({
          tenant_id: tenantId,
          inmueble_id: input.inmuebleId,
          fecha_acuerdo: input.fechaAcuerdo,
          fecha_inicio: input.fechaInicio,
          fecha_fin: input.fechaFin,
          monto_capital: input.montoCapital,
          monto_interes: input.montoInteres,
          monto_otros: input.montoOtros,
          monto_total: montoTotal,
          numero_cuotas: input.numeroCuotas,
          cuota_inicial: input.cuotaInicial,
          condona_interes: input.condonaInteres,
          monto_condonado: input.condonaInteres ? input.montoCondonado : 0,
          interes_durante_acuerdo: input.interesDuranteAcuerdo,
          acta_referencia: input.actaReferencia,
          documento_id: input.documentoId,
        })
        .select('*')
        .single()
      if (errorAcuerdo) throw new Error(mensajeError(errorAcuerdo, 'No se pudo crear el acuerdo de pago.'))

      const { error: errorCuotas } = await cliente.from('acuerdo_pago_cuotas').insert(
        calendario.map((c) => ({
          tenant_id: tenantId,
          acuerdo_id: acuerdo.id,
          numero_cuota: c.numeroCuota,
          fecha_vencimiento: c.fechaVencimiento,
          monto: c.monto,
        })),
      )
      if (errorCuotas) throw new Error(mensajeError(errorCuotas, 'El acuerdo se creó pero no se pudo generar el calendario de cuotas.'))

      acuerdos.value = [acuerdo, ...acuerdos.value]
      return acuerdo
    } finally {
      guardando.value = false
    }
  }

  /** Transiciones de estado — el guard decide cuáles son válidas y quién puede hacerlas. */
  async function cambiarEstadoAcuerdo(
    tenantId: string,
    acuerdoId: string,
    estado: EstadoAcuerdo,
    extras: { fechaIncumplimiento?: string; motivoIncumplimiento?: string } = {},
  ): Promise<void> {
    const cliente = useSupabaseClient<Database>()
    const { error } = await cliente
      .from('acuerdos_pago')
      .update({
        estado,
        fecha_incumplimiento: extras.fechaIncumplimiento,
        motivo_incumplimiento: extras.motivoIncumplimiento,
      })
      .eq('id', acuerdoId)
    if (error) throw new Error(mensajeError(error, 'No se pudo cambiar el estado del acuerdo.'))
    await cargarAcuerdos(tenantId)
  }

  async function cargarCuotas(acuerdoId: string): Promise<void> {
    const cliente = useSupabaseClient<Database>()
    const { data, error } = await cliente
      .from('acuerdo_pago_cuotas')
      .select('*')
      .eq('acuerdo_id', acuerdoId)
      .order('numero_cuota', { ascending: true })
    if (error) throw new Error(mensajeError(error, 'No se pudieron cargar las cuotas.'))
    cuotas.value = data ?? []
  }

  async function actualizarCuota(
    acuerdoId: string,
    cuotaId: string,
    campos: { estado?: EstadoCuotaAcuerdo; montoPagado?: number; fechaPago?: string | null },
  ): Promise<void> {
    const cliente = useSupabaseClient<Database>()
    const { error } = await cliente
      .from('acuerdo_pago_cuotas')
      .update({ estado: campos.estado, monto_pagado: campos.montoPagado, fecha_pago: campos.fechaPago })
      .eq('id', cuotaId)
    if (error) throw new Error(mensajeError(error, 'No se pudo actualizar la cuota.'))
    await cargarCuotas(acuerdoId)
  }

  return {
    promesas,
    acuerdos,
    cuotas,
    loading,
    guardando,
    cargarPromesas,
    crearPromesa,
    actualizarEstadoPromesa,
    cargarAcuerdos,
    crearAcuerdo,
    cambiarEstadoAcuerdo,
    cargarCuotas,
    actualizarCuota,
  }
})
