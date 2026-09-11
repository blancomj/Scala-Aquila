/**
 * MANT-10 · Reservas de zonas comunes. Las reglas por zona (mant_zona_reserva_regla) se leen y
 * escriben por RLS directo — configuración, no operación con efecto colateral. Las reservas se
 * crean por RLS directo (el guard de la base valida traslapes/ventanas/cupo/vínculo), pero
 * aprobar/rechazar SIEMPRE vía fn_reserva_aprobar/fn_reserva_rechazar — aprobar puede generar un
 * cargo en la misma transacción (ver informe del corte).
 */
import { defineStore } from 'pinia'
import type { Database } from '@aquila/shared'

type ReglaRow = Database['public']['Tables']['mant_zona_reserva_regla']['Row']
type ReglaInsert = Database['public']['Tables']['mant_zona_reserva_regla']['Insert']
type ReglaUpdate = Database['public']['Tables']['mant_zona_reserva_regla']['Update']
type ReservaRow = Database['public']['Tables']['mant_reservas']['Row']
type ReservaInsert = Database['public']['Tables']['mant_reservas']['Insert']

export const useMantenimientoReservasStore = defineStore('mantenimientoReservas', () => {
  const reglas = shallowRef<ReglaRow[]>([])
  const reservas = shallowRef<ReservaRow[]>([])
  const loading = ref(false)
  const guardando = ref(false)

  async function cargarReglas(tenantId: string): Promise<void> {
    loading.value = true
    try {
      const cliente = useSupabaseClient<Database>()
      const { data, error } = await cliente
        .from('mant_zona_reserva_regla')
        .select('*')
        .eq('tenant_id', tenantId)
        .order('vigente_desde', { ascending: false })
      if (error) throw error
      reglas.value = data ?? []
    } finally {
      loading.value = false
    }
  }

  async function cargarReservas(tenantId: string): Promise<void> {
    loading.value = true
    try {
      const cliente = useSupabaseClient<Database>()
      const { data, error } = await cliente
        .from('mant_reservas')
        .select('*')
        .eq('tenant_id', tenantId)
        .order('fecha', { ascending: false })
        .order('hora_inicio', { ascending: false })
        .limit(200)
      if (error) throw error
      reservas.value = data ?? []
    } finally {
      loading.value = false
    }
  }

  async function crearRegla(fila: ReglaInsert): Promise<ReglaRow> {
    guardando.value = true
    try {
      const cliente = useSupabaseClient<Database>()
      const { data, error } = await cliente.from('mant_zona_reserva_regla').insert(fila).select('*').single()
      if (error) throw error
      reglas.value = [data, ...reglas.value]
      return data
    } finally {
      guardando.value = false
    }
  }

  async function actualizarRegla(id: string, patch: ReglaUpdate): Promise<void> {
    guardando.value = true
    try {
      const cliente = useSupabaseClient<Database>()
      const { data, error } = await cliente
        .from('mant_zona_reserva_regla')
        .update(patch)
        .eq('id', id)
        .select('*')
        .single()
      if (error) throw error
      reglas.value = reglas.value.map((r) => (r.id === id ? data : r))
    } finally {
      guardando.value = false
    }
  }

  async function crearReserva(fila: ReservaInsert): Promise<ReservaRow> {
    guardando.value = true
    try {
      const cliente = useSupabaseClient<Database>()
      const { data, error } = await cliente.from('mant_reservas').insert(fila).select('*').single()
      if (error) throw error
      reservas.value = [data, ...reservas.value]
      return data
    } finally {
      guardando.value = false
    }
  }

  async function aprobar(reservaId: string): Promise<void> {
    guardando.value = true
    try {
      const cliente = useSupabaseClient<Database>()
      const { data, error } = await cliente.rpc('fn_reserva_aprobar', { p_reserva_id: reservaId }).single()
      if (error) throw error
      reservas.value = reservas.value.map((r) => (r.id === reservaId ? data : r))
    } finally {
      guardando.value = false
    }
  }

  async function rechazar(reservaId: string, motivo: string): Promise<void> {
    guardando.value = true
    try {
      const cliente = useSupabaseClient<Database>()
      const { data, error } = await cliente
        .rpc('fn_reserva_rechazar', { p_reserva_id: reservaId, p_motivo: motivo })
        .single()
      if (error) throw error
      reservas.value = reservas.value.map((r) => (r.id === reservaId ? data : r))
    } finally {
      guardando.value = false
    }
  }

  return {
    reglas,
    reservas,
    loading,
    guardando,
    cargarReglas,
    cargarReservas,
    crearRegla,
    actualizarRegla,
    crearReserva,
    aprobar,
    rechazar,
  }
})
