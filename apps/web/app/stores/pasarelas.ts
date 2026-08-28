/**
 * Configuración de pasarela de pago por copropiedad (fase de estructura).
 *
 * Este store NUNCA lee una credencial: `pasarela_credencial` no tiene política
 * para `authenticated` (a propósito, ver el COMMENT ON TABLE de la migración
 * 20260904100000), así que no hay consulta posible que la devuelva. Solo se
 * sabe QUÉ nombres de credencial están guardados, para que la UI muestre
 * "••••••••" y ofrezca reemplazar — nunca el valor.
 *
 * Toda escritura va por la Edge Function configurar-pasarela.
 */
import { defineStore } from 'pinia'
import type { Database } from '@aquila/shared'
import { extraerErrorFuncion } from '~/utils/edge-function-error'

type PasarelaProveedor = Database['public']['Enums']['pasarela_proveedor_t']
type PasarelaModo = Database['public']['Enums']['pasarela_modo_t']
type IntencionEstado = Database['public']['Enums']['intencion_pago_estado_t']

export interface IntencionPagoFila {
  id: string
  proveedor: PasarelaProveedor
  referencia: string
  monto: number
  estado: IntencionEstado
  metodo: string | null
  created_at: string
  inmuebleCodigo: string
}

export interface ConfigPasarela {
  id: string
  proveedor: PasarelaProveedor
  modo: PasarelaModo
  activa: boolean
  identificador_publico: string | null
  verificada_at: string | null
  /** Solo los NOMBRES de credencial guardados — jamás los valores. */
  credenciales: string[]
  /** Códigos de lista_tipos FORMA_PAGO habilitados en esta pasarela. */
  metodos: string[]
}

export const usePasarelasStore = defineStore('pasarelas', () => {
  const configuraciones = ref<ConfigPasarela[]>([])
  const loading = ref(false)
  const guardando = ref(false)
  const intenciones = ref<IntencionPagoFila[]>([])
  const cargandoIntenciones = ref(false)

  async function cargar(tenantId: string): Promise<ConfigPasarela[]> {
    loading.value = true
    try {
      const cliente = useSupabaseClient<Database>()
      const { data, error } = await cliente
        .from('pasarela_config')
        .select(
          `id, proveedor, modo, activa, identificador_publico, verificada_at,
           metodos:pasarela_config_metodo(forma_pago:lista_tipos(codigo))`,
        )
        .eq('tenant_id', tenantId)
        .order('proveedor')
      if (error) throw error

      // Los nombres de credencial se leen aparte: pasarela_credencial no es
      // legible por `authenticated`, así que se pregunta a la Edge Function.
      const nombres = await nombresCredenciales(tenantId)

      configuraciones.value = (data ?? []).map((c) => ({
        id: c.id,
        proveedor: c.proveedor,
        modo: c.modo,
        activa: c.activa,
        identificador_publico: c.identificador_publico,
        verificada_at: c.verificada_at,
        credenciales: nombres.get(c.id) ?? [],
        metodos: (c.metodos ?? [])
          .map((m) => m.forma_pago?.codigo)
          .filter((codigo): codigo is string => typeof codigo === 'string'),
      }))
      return configuraciones.value
    } finally {
      loading.value = false
    }
  }

  async function nombresCredenciales(tenantId: string): Promise<Map<string, string[]>> {
    const cliente = useSupabaseClient<Database>()
    const { data, error } = await cliente.rpc('fn_pasarela_credenciales_presentes', {
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
    const { data, error } = await cliente.functions.invoke<T>('configurar-pasarela', {
      body: cuerpo,
    })
    if (error) throw await extraerErrorFuncion(error)
    if (!data) throw new Error('configurar-pasarela no devolvió datos.')
    return data
  }

  async function guardarCredenciales(params: {
    tenantId: string
    proveedor: PasarelaProveedor
    identificadorPublico: string | null
    metodos: string[]
    /** Solo las que el usuario acaba de escribir — las que no cambió no viajan. */
    credenciales: Record<string, string>
  }): Promise<void> {
    guardando.value = true
    try {
      await invocar({
        accion: 'guardar_credenciales',
        tenant_id: params.tenantId,
        proveedor: params.proveedor,
        identificador_publico: params.identificadorPublico,
        metodos: params.metodos,
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

  async function cambiarModo(
    tenantId: string,
    configId: string,
    modo: PasarelaModo,
  ): Promise<void> {
    guardando.value = true
    try {
      await invocar({
        accion: 'cambiar_modo',
        tenant_id: tenantId,
        config_id: configId,
        modo,
      })
      await cargar(tenantId)
    } finally {
      guardando.value = false
    }
  }

  /** Bandeja de transacciones del administrador (§8.3) — últimas intenciones
   *  de pago del tenant, sin importar su estado; el filtro por estado vive en
   *  la propia UI (client-side, la lista ya es acotada por `limite`). */
  async function cargarIntenciones(tenantId: string, limite = 100): Promise<void> {
    cargandoIntenciones.value = true
    try {
      const cliente = useSupabaseClient<Database>()
      const { data, error } = await cliente
        .from('intenciones_pago')
        .select('id, proveedor, referencia, monto, estado, metodo, created_at, inmueble:inmuebles(codigo)')
        .eq('tenant_id', tenantId)
        .order('created_at', { ascending: false })
        .limit(limite)
      if (error) throw error
      intenciones.value = (data ?? []).map((f) => ({
        id: f.id,
        proveedor: f.proveedor,
        referencia: f.referencia,
        monto: f.monto,
        estado: f.estado,
        metodo: f.metodo,
        created_at: f.created_at,
        inmuebleCodigo: f.inmueble?.codigo ?? '—',
      }))
    } finally {
      cargandoIntenciones.value = false
    }
  }

  return {
    configuraciones,
    loading,
    guardando,
    intenciones,
    cargandoIntenciones,
    cargar,
    guardarCredenciales,
    probarConexion,
    activar,
    cambiarModo,
    cargarIntenciones,
  }
})
