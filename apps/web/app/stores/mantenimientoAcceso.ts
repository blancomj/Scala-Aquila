/**
 * MANT-11 · Visitantes y control de acceso. Crear/validar/consumir un QR SIEMPRE pasa por las
 * Edge Functions (`autorizacion-visita-crear/-validar/-consumir`) — la firma HMAC exige Web
 * Crypto de Deno, irreproducible en el cliente ni en SQL. El registro sin autorización previa
 * (walk-in) es un INSERT directo, protegido por RLS (has_role auxiliar).
 */
import { defineStore } from 'pinia'
import type { Database } from '@aquila/shared'

type AutorizacionRow = Database['public']['Tables']['mant_autorizaciones_visita']['Row']
type RegistroRow = Database['public']['Tables']['mant_registros_acceso']['Row']
// La bandeja/listado SIEMPRE lee de la vista sin visitante_documento (MANT-11 §4.5, prueba 9) —
// sus columnas son nullable porque PostgREST no puede derivar la nulabilidad real de una vista.
type RegistroResumenRow = Database['public']['Views']['mant_registros_acceso_resumen']['Row']

export const useMantenimientoAccesoStore = defineStore('mantenimientoAcceso', () => {
  const autorizaciones = shallowRef<AutorizacionRow[]>([])
  const registros = shallowRef<RegistroResumenRow[]>([])
  const loading = ref(false)
  const guardando = ref(false)

  async function cargarAutorizaciones(tenantId: string): Promise<void> {
    loading.value = true
    try {
      const cliente = useSupabaseClient<Database>()
      const { data, error } = await cliente
        .from('mant_autorizaciones_visita')
        .select('*')
        .eq('tenant_id', tenantId)
        .order('fecha_prevista', { ascending: false })
        .limit(200)
      if (error) throw error
      autorizaciones.value = data ?? []
    } finally {
      loading.value = false
    }
  }

  async function cargarRegistros(tenantId: string): Promise<void> {
    loading.value = true
    try {
      const cliente = useSupabaseClient<Database>()
      const { data, error } = await cliente
        .from('mant_registros_acceso_resumen')
        .select('*')
        .eq('tenant_id', tenantId)
        .order('ingreso_at', { ascending: false })
        .limit(200)
      if (error) throw error
      registros.value = data ?? []
    } finally {
      loading.value = false
    }
  }

  async function crearAutorizacion(params: {
    tenant_id: string
    inmueble_id: string
    visitante_nombre: string
    visitante_documento?: string
    tipo_id?: number
    fecha_prevista: string
    hora_desde?: string
    hora_hasta?: string
  }): Promise<AutorizacionRow> {
    guardando.value = true
    try {
      const cliente = useSupabaseClient<Database>()
      const { data, error } = await cliente.functions.invoke<AutorizacionRow>('autorizacion-visita-crear', {
        body: params,
      })
      if (error) throw await extraerErrorFuncion(error)
      if (!data) throw new Error('La función no devolvió la autorización.')
      autorizaciones.value = [data, ...autorizaciones.value]
      return data
    } finally {
      guardando.value = false
    }
  }

  async function validarQr(qrToken: string): Promise<AutorizacionRow> {
    const cliente = useSupabaseClient<Database>()
    const { data, error } = await cliente.functions.invoke<AutorizacionRow>('autorizacion-visita-validar', {
      body: { qr_token: qrToken },
    })
    if (error) throw await extraerErrorFuncion(error)
    if (!data) throw new Error('La función no devolvió la autorización.')
    return data
  }

  async function consumirQr(qrToken: string, observaciones?: string): Promise<RegistroRow> {
    guardando.value = true
    try {
      const cliente = useSupabaseClient<Database>()
      const { data, error } = await cliente.functions.invoke<RegistroRow>('autorizacion-visita-consumir', {
        body: { qr_token: qrToken, ...(observaciones !== undefined && { observaciones }) },
      })
      if (error) throw await extraerErrorFuncion(error)
      if (!data) throw new Error('La función no devolvió el registro.')
      registros.value = [data, ...registros.value]
      autorizaciones.value = autorizaciones.value.map((a) => (a.id === data.autorizacion_id ? { ...a, estado: 'usada' } : a))
      return data
    } finally {
      guardando.value = false
    }
  }

  async function revocar(autorizacionId: string): Promise<void> {
    guardando.value = true
    try {
      const cliente = useSupabaseClient<Database>()
      const { data, error } = await cliente
        .rpc('fn_autorizacion_visita_revocar', { p_autorizacion_id: autorizacionId })
        .single()
      if (error) throw error
      autorizaciones.value = autorizaciones.value.map((a) => (a.id === autorizacionId ? data : a))
    } finally {
      guardando.value = false
    }
  }

  async function registrarAccesoDirecto(params: {
    tenant_id: string
    visitante_nombre: string
    visitante_documento?: string | null
    inmueble_destino_id: string
    registrado_por: string
    observaciones?: string | null
  }): Promise<RegistroRow> {
    guardando.value = true
    try {
      const cliente = useSupabaseClient<Database>()
      const { data, error } = await cliente
        .from('mant_registros_acceso')
        .insert(params)
        .select('*')
        .single()
      if (error) throw error
      registros.value = [data, ...registros.value]
      return data
    } finally {
      guardando.value = false
    }
  }

  async function registrarEgreso(registroId: string): Promise<void> {
    guardando.value = true
    try {
      const cliente = useSupabaseClient<Database>()
      const { error } = await cliente
        .from('mant_registros_acceso')
        .update({ egreso_at: new Date().toISOString() })
        .eq('id', registroId)
      if (error) throw error
      registros.value = registros.value.map((r) => (r.id === registroId ? { ...r, egreso_at: new Date().toISOString() } : r))
    } finally {
      guardando.value = false
    }
  }

  return {
    autorizaciones,
    registros,
    loading,
    guardando,
    cargarAutorizaciones,
    cargarRegistros,
    crearAutorizacion,
    validarQr,
    consumirQr,
    revocar,
    registrarAccesoDirecto,
    registrarEgreso,
  }
})
