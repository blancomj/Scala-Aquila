/**
 * Configuración de proveedor de IA por copropiedad (fase de estructura).
 *
 * Este store NUNCA lee una credencial: `ia_credencial` no tiene política
 * para `authenticated` (a propósito, ver el COMMENT ON TABLE de la
 * migración 20260935000000), así que no hay consulta posible que la
 * devuelva. Solo se sabe QUÉ nombres de credencial están guardados, para
 * que la UI muestre "••••••••" y ofrezca reemplazar — nunca el valor.
 *
 * Toda escritura va por la Edge Function configurar-ia. Mismo patrón que
 * stores/pasarelas.ts.
 */
import { defineStore } from 'pinia'
import type { Database } from '@aquila/shared'
import { extraerErrorFuncion } from '~/utils/edge-function-error'

type IaProveedor = Database['public']['Enums']['ia_proveedor_t']

export interface ConfigProveedorIa {
  id: string
  proveedor: IaProveedor
  modelo: string
  activa: boolean
  verificada_at: string | null
  /** Solo los NOMBRES de credencial guardados — jamás los valores. */
  credenciales: string[]
}

export const useProveedoresIaStore = defineStore('proveedores-ia', () => {
  const configuraciones = ref<ConfigProveedorIa[]>([])
  const loading = ref(false)
  const guardando = ref(false)

  async function cargar(tenantId: string): Promise<ConfigProveedorIa[]> {
    loading.value = true
    try {
      const cliente = useSupabaseClient<Database>()
      const { data, error } = await cliente
        .from('ia_config')
        .select('id, proveedor, modelo, activa, verificada_at')
        .eq('tenant_id', tenantId)
        .order('proveedor')
      if (error) throw error

      // Los nombres de credencial se leen aparte: ia_credencial no es
      // legible por `authenticated`, así que se pregunta a la función RPC.
      const nombres = await nombresCredenciales(tenantId)

      configuraciones.value = (data ?? []).map((c) => ({
        id: c.id,
        proveedor: c.proveedor,
        modelo: c.modelo,
        activa: c.activa,
        verificada_at: c.verificada_at,
        credenciales: nombres.get(c.id) ?? [],
      }))
      return configuraciones.value
    } finally {
      loading.value = false
    }
  }

  async function nombresCredenciales(tenantId: string): Promise<Map<string, string[]>> {
    const cliente = useSupabaseClient<Database>()
    const { data, error } = await cliente.rpc('fn_ia_credenciales_presentes', {
      p_tenant_id: tenantId,
    })
    if (error) return new Map()
    const mapa = new Map<string, string[]>()
    for (const fila of data ?? []) {
      const lista = mapa.get(fila.config_id) ?? []
      lista.push(fila.nombre)
      mapa.set(fila.config_id, lista)
    }
    return mapa
  }

  async function invocar<T>(cuerpo: Record<string, unknown>): Promise<T> {
    const cliente = useSupabaseClient<Database>()
    const { data, error } = await cliente.functions.invoke<T>('configurar-ia', {
      body: cuerpo,
    })
    if (error) throw await extraerErrorFuncion(error)
    if (!data) throw new Error('configurar-ia no devolvió datos.')
    return data
  }

  async function guardarCredenciales(params: {
    tenantId: string
    proveedor: IaProveedor
    modelo: string
    /** Solo las que el usuario acaba de escribir — las que no cambió no viajan. */
    credenciales: Record<string, string>
  }): Promise<void> {
    guardando.value = true
    try {
      await invocar({
        accion: 'guardar_credenciales',
        tenant_id: params.tenantId,
        proveedor: params.proveedor,
        modelo: params.modelo,
        credenciales: params.credenciales,
      })
      await cargar(params.tenantId)
    } finally {
      guardando.value = false
    }
  }

  async function probarConexion(tenantId: string, configId: string): Promise<void> {
    guardando.value = true
    try {
      await invocar({ accion: 'probar_conexion', tenant_id: tenantId, config_id: configId })
      await cargar(tenantId)
    } finally {
      guardando.value = false
    }
  }

  async function activar(tenantId: string, configId: string): Promise<void> {
    guardando.value = true
    try {
      await invocar({ accion: 'activar', tenant_id: tenantId, config_id: configId })
      await cargar(tenantId)
    } finally {
      guardando.value = false
    }
  }

  return {
    configuraciones,
    loading,
    guardando,
    cargar,
    guardarCredenciales,
    probarConexion,
    activar,
  }
})
