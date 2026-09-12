/**
 * Vehículos y movilidad (EXS-5).
 *
 * Dos lecturas distintas y deliberadamente separadas:
 *
 *  · el INVENTARIO (`vehiculos` + relaciones) es gestión: se lista, se
 *    filtra y se edita;
 *  · la CONSULTA DE PORTERÍA va por `fn_vehiculo_por_placa`, porque la
 *    pregunta que se hace en la reja no es "muéstrame los vehículos" sino
 *    "esta placa, ¿entra?", y esa respuesta se DERIVA de los permisos y la
 *    fecha del día. No existe ninguna columna `autorizado` que consultar.
 *
 * El retiro tampoco se resuelve aquí: marcarlo dispara en la base la
 * revocación de sus permisos. La pantalla no tiene que acordarse.
 */
import { defineStore } from 'pinia'
import type { Database } from '@aquila/shared'
import { mensajeError } from '~/utils/error-message'

export interface Vehiculo {
  id: string
  placa: string
  placaNormalizada: string
  tipoId: number
  servicioId: number | null
  marca: string | null
  modelo: string | null
  color: string | null
  anio: number | null
  estado: 'activo' | 'inactivo' | 'retirado'
  observaciones: string | null
}

export interface ConsultaPorteria {
  vehiculoId: string
  placa: string
  tipo: string
  marca: string | null
  modelo: string | null
  color: string | null
  estado: string
  autorizado: boolean
  permisoHasta: string | null
  responsables: string[]
  inmuebles: string[]
}

export interface PermisoVehiculo {
  id: string
  vehiculoId: string
  tipoId: number
  vigenteDesde: string
  vigenteHasta: string | null
  estado: 'vigente' | 'revocado'
  inmuebleId: string | null
  motivo: string | null
  motivoRevocacion: string | null
}

interface FilaConsulta {
  vehiculo_id: string
  placa: string
  tipo: string
  marca: string | null
  modelo: string | null
  color: string | null
  estado: string
  autorizado: boolean
  permiso_hasta: string | null
  responsables: string[]
  inmuebles: string[]
}

export const useVehiculosStore = defineStore('vehiculos', () => {
  const vehiculos = shallowRef<Vehiculo[]>([])
  const permisos = shallowRef<PermisoVehiculo[]>([])
  const consulta = shallowRef<ConsultaPorteria[] | null>(null)
  const loading = ref(false)
  const error = ref<string | null>(null)

  async function cargar(tenantId: string, incluirRetirados = false): Promise<void> {
    loading.value = true
    error.value = null
    try {
      const cliente = useSupabaseClient<Database>()
      // Cadena literal, no concatenada: supabase-js infiere el tipo de la
      // fila analizando este string en compilación.
      let consultaSql = cliente
        .from('vehiculos')
        .select('id, placa, placa_normalizada, tipo_id, servicio_id, marca, modelo, color, anio, estado, observaciones')
        .eq('tenant_id', tenantId)
      if (!incluirRetirados) consultaSql = consultaSql.neq('estado', 'retirado')

      const { data, error: err } = await consultaSql.order('placa')
      if (err) throw err
      vehiculos.value = (data ?? []).map((v) => ({
        id: v.id,
        placa: v.placa,
        placaNormalizada: v.placa_normalizada ?? '',
        tipoId: v.tipo_id,
        servicioId: v.servicio_id,
        marca: v.marca,
        modelo: v.modelo,
        color: v.color,
        anio: v.anio,
        estado: v.estado,
        observaciones: v.observaciones,
      }))
    } catch (e) {
      error.value = mensajeError(e, 'No se pudieron cargar los vehículos.')
    } finally {
      loading.value = false
    }
  }

  /** La pregunta de portería. Devuelve lista vacía —no un error— para una
   *  placa que no está registrada: no distinguirlas evita que la consulta
   *  sirva para averiguar qué carros hay en el edificio. */
  async function buscarPorPlaca(tenantId: string, placa: string): Promise<void> {
    loading.value = true
    error.value = null
    consulta.value = null
    try {
      const cliente = useSupabaseClient<Database>()
      const { data, error: err } = await cliente.rpc('fn_vehiculo_por_placa', {
        p_tenant_id: tenantId,
        p_placa: placa,
      })
      if (err) throw err
      consulta.value = ((data ?? []) as unknown as FilaConsulta[]).map((f) => ({
        vehiculoId: f.vehiculo_id,
        placa: f.placa,
        tipo: f.tipo,
        marca: f.marca,
        modelo: f.modelo,
        color: f.color,
        estado: f.estado,
        autorizado: f.autorizado,
        permisoHasta: f.permiso_hasta,
        responsables: f.responsables,
        inmuebles: f.inmuebles,
      }))
    } catch (e) {
      error.value = mensajeError(e, 'No se pudo consultar la placa.')
    } finally {
      loading.value = false
    }
  }

  async function cargarPermisos(vehiculoId: string): Promise<void> {
    error.value = null
    try {
      const cliente = useSupabaseClient<Database>()
      const { data, error: err } = await cliente
        .from('vehiculo_permiso')
        .select('id, vehiculo_id, tipo_id, vigente_desde, vigente_hasta, estado, inmueble_id, motivo, motivo_revocacion')
        .eq('vehiculo_id', vehiculoId)
        .order('vigente_desde', { ascending: false })
      if (err) throw err
      permisos.value = (data ?? []).map((p) => ({
        id: p.id,
        vehiculoId: p.vehiculo_id,
        tipoId: p.tipo_id,
        vigenteDesde: p.vigente_desde,
        vigenteHasta: p.vigente_hasta,
        estado: p.estado,
        inmuebleId: p.inmueble_id,
        motivo: p.motivo,
        motivoRevocacion: p.motivo_revocacion,
      }))
    } catch (e) {
      error.value = mensajeError(e, 'No se pudieron cargar los permisos.')
    }
  }

  async function guardarVehiculo(params: {
    id?: string
    tenantId: string
    placa: string
    tipoId: number
    servicioId: number | null
    marca: string | null
    modelo: string | null
    color: string | null
    anio: number | null
    observaciones: string | null
  }): Promise<boolean> {
    error.value = null
    try {
      const cliente = useSupabaseClient<Database>()
      const fila = {
        tenant_id: params.tenantId,
        placa: params.placa,
        tipo_id: params.tipoId,
        servicio_id: params.servicioId,
        marca: params.marca,
        modelo: params.modelo,
        color: params.color,
        anio: params.anio,
        observaciones: params.observaciones,
      }
      const { error: err } = params.id
        ? await cliente
            .from('vehiculos')
            .update({ ...fila, updated_at: new Date().toISOString() })
            .eq('id', params.id)
        : await cliente.from('vehiculos').insert(fila)
      if (err) throw err
      return true
    } catch (e) {
      error.value = mensajeError(e, 'No se pudo guardar el vehículo.')
      return false
    }
  }

  /** Retirar es terminal y la base se encarga del resto: revoca los
   *  permisos vigentes y libera la placa para otro carro. */
  async function retirar(id: string, motivo: string): Promise<boolean> {
    error.value = null
    try {
      const cliente = useSupabaseClient<Database>()
      const { error: err } = await cliente
        .from('vehiculos')
        .update({ estado: 'retirado', retirado_at: new Date().toISOString(), motivo_retiro: motivo })
        .eq('id', id)
      if (err) throw err
      return true
    } catch (e) {
      error.value = mensajeError(e, 'No se pudo retirar el vehículo.')
      return false
    }
  }

  async function otorgarPermiso(params: {
    tenantId: string
    vehiculoId: string
    tipoId: number
    vigenteDesde: string
    vigenteHasta: string | null
    inmuebleId: string | null
    motivo: string | null
  }): Promise<boolean> {
    error.value = null
    try {
      const cliente = useSupabaseClient<Database>()
      const { error: err } = await cliente.from('vehiculo_permiso').insert({
        tenant_id: params.tenantId,
        vehiculo_id: params.vehiculoId,
        tipo_id: params.tipoId,
        vigente_desde: params.vigenteDesde,
        vigente_hasta: params.vigenteHasta,
        inmueble_id: params.inmuebleId,
        motivo: params.motivo,
      })
      if (err) throw err
      return true
    } catch (e) {
      error.value = mensajeError(e, 'No se pudo otorgar el permiso.')
      return false
    }
  }

  async function revocarPermiso(id: string, motivo: string): Promise<boolean> {
    error.value = null
    try {
      const cliente = useSupabaseClient<Database>()
      const { error: err } = await cliente
        .from('vehiculo_permiso')
        .update({ estado: 'revocado', motivo_revocacion: motivo })
        .eq('id', id)
      if (err) throw err
      return true
    } catch (e) {
      error.value = mensajeError(e, 'No se pudo revocar el permiso.')
      return false
    }
  }

  return {
    vehiculos,
    permisos,
    consulta,
    loading,
    error,
    cargar,
    buscarPorPlaca,
    cargarPermisos,
    guardarVehiculo,
    retirar,
    otorgarPermiso,
    revocarPermiso,
  }
})
