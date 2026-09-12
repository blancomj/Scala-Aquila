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


/** MOV-1 — un paso registrado en la bitácora. */
export interface PasoBitacora {
  id: string
  placa: string
  sentido: 'entrada' | 'salida'
  momento: string
  autorizado: boolean
  esVisitante: boolean
  observaciones: string | null
}

/** MOV-1 — el resultado de registrar un paso: la fila más el estado de capacidad. */
export interface ResultadoPaso {
  placa: string
  autorizado: boolean
  esVisitante: boolean
  visitantesDentro: number
  cuposVisitante: number | null
  aviso: string | null
}

/** MOV-1 — un vehículo que está dentro ahora, derivado del último paso. */
export interface VehiculoDentro {
  placa: string
  esVisitante: boolean
  autorizado: boolean
  desde: string
  horasDentro: number
  excedido: boolean
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
    /** MOV-1: el cupo cuando el parqueadero es bien privado (un inmueble de tipo
     *  `parqueadero`). El guard rechaza cualquier otro tipo. */
    inmuebleId: string | null
    /** MOV-1: el cupo cuando es área común de uso exclusivo. Excluyente con inmuebleId. */
    cupoZonaId?: string | null
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
        cupo_zona_id: params.cupoZonaId ?? null,
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


  // ── MOV-1 · bitácora de portería ──
  //
  //  La escritura NO va contra la tabla: `vehiculo_paso` no tiene policy
  //  de INSERT para `authenticated` a propósito — un insert directo podría
  //  afirmar "autorizado = true" sobre cualquier placa. Todo pasa por
  //  fn_vehiculo_registrar_paso, que además devuelve el estado de cupos.
  const bitacora = shallowRef<PasoBitacora[]>([])
  const dentro = shallowRef<VehiculoDentro[]>([])
  const ultimoPaso = ref<ResultadoPaso | null>(null)

  async function registrarPaso(params: {
    tenantId: string
    sentido: 'entrada' | 'salida'
    placa?: string
    autorizacionId?: string
    observaciones?: string
  }): Promise<ResultadoPaso | null> {
    error.value = null
    try {
      const cliente = useSupabaseClient<Database>()
      const { data, error: err } = await cliente.rpc('fn_vehiculo_registrar_paso', {
        p_tenant_id: params.tenantId,
        p_sentido: params.sentido,
        p_placa: params.placa ?? undefined,
        p_autorizacion_id: params.autorizacionId ?? undefined,
        p_observaciones: params.observaciones ?? undefined,
      })
      if (err) throw err
      const fila = (data ?? [])[0]
      if (!fila) return null
      ultimoPaso.value = {
        placa: fila.placa,
        autorizado: fila.autorizado,
        esVisitante: fila.es_visitante,
        visitantesDentro: fila.visitantes_dentro,
        cuposVisitante: fila.cupos_visitante,
        aviso: fila.aviso,
      }
      return ultimoPaso.value
    } catch (e) {
      error.value = mensajeError(e, 'No se pudo registrar el paso.')
      return null
    }
  }

  async function cargarDentro(tenantId: string): Promise<void> {
    error.value = null
    try {
      const cliente = useSupabaseClient<Database>()
      const { data, error: err } = await cliente.rpc('fn_movilidad_dentro', {
        p_tenant_id: tenantId,
      })
      if (err) throw err
      dentro.value = (data ?? []).map((d) => ({
        placa: d.placa,
        esVisitante: d.es_visitante,
        autorizado: d.autorizado,
        desde: d.desde,
        horasDentro: d.horas_dentro,
        excedido: d.excedido,
      }))
    } catch (e) {
      error.value = mensajeError(e, 'No se pudo leer qué hay dentro.')
    }
  }

  /** La bitácora sí se LEE por tabla: su policy de select existe, y filtrar
   *  por placa en el servidor evita traerse el histórico entero. */
  async function cargarBitacora(tenantId: string, placa?: string): Promise<void> {
    loading.value = true
    error.value = null
    try {
      const cliente = useSupabaseClient<Database>()
      let consulta = cliente
        .from('vehiculo_paso')
        .select('id, placa, sentido, momento, autorizado, es_visitante, observaciones')
        .eq('tenant_id', tenantId)
        .order('momento', { ascending: false })
        .limit(100)
      if (placa && placa.trim() !== '') {
        consulta = consulta.ilike('placa', `%${placa.trim()}%`)
      }
      const { data, error: err } = await consulta
      if (err) throw err
      bitacora.value = (data ?? []).map((p) => ({
        id: p.id,
        placa: p.placa,
        sentido: p.sentido,
        momento: p.momento,
        autorizado: p.autorizado,
        esVisitante: p.es_visitante,
        observaciones: p.observaciones,
      }))
    } catch (e) {
      error.value = mensajeError(e, 'No se pudo cargar la bitácora.')
    } finally {
      loading.value = false
    }
  }


  /** MOV-1 — los cupos disponibles para asignar, de las DOS figuras que ya existen: inmuebles
   *  de tipo `parqueadero` (bien privado) y zonas comunes de uso exclusivo. El prefijo del
   *  valor dice a qué tabla apunta, porque el permiso tiene una FK distinta para cada una. */
  async function cargarCupos(tenantId: string): Promise<{ valor: string; etiqueta: string }[]> {
    const cliente = useSupabaseClient<Database>()
    const [{ data: inmuebles }, { data: zonas }] = await Promise.all([
      cliente
        .from('inmuebles')
        .select('id, codigo, lista_tipos!inmuebles_tipo_id_fkey(codigo)')
        .eq('tenant_id', tenantId),
      cliente
        .from('zonas_comunes')
        .select('id, codigo, nombre')
        .eq('tenant_id', tenantId)
        .not('uso_exclusivo_inmueble_id', 'is', null),
    ])
    return [
      ...(inmuebles ?? [])
        .filter((i) => i.lista_tipos?.codigo === 'parqueadero')
        .map((i) => ({ valor: `i:${i.id}`, etiqueta: `${i.codigo} (privado)` })),
      ...(zonas ?? []).map((z) => ({
        valor: `z:${z.id}`,
        etiqueta: `${z.codigo ?? z.nombre} (común de uso exclusivo)`,
      })),
    ]
  }

  /** MOV-1 — capacidad de visitantes. undefined = esta copropiedad no controla eso, que es
   *  distinto de cero (= no cabe nadie). */
  async function cargarConfigMovilidad(
    tenantId: string,
  ): Promise<{ cuposVisitante: number | undefined; horasMax: number | undefined }> {
    const cliente = useSupabaseClient<Database>()
    const { data } = await cliente
      .from('movilidad_config')
      .select('cupos_visitante, horas_max_visitante')
      .eq('tenant_id', tenantId)
      .maybeSingle()
    return {
      cuposVisitante: data?.cupos_visitante ?? undefined,
      horasMax: data?.horas_max_visitante ?? undefined,
    }
  }

  async function guardarConfigMovilidad(
    tenantId: string,
    valores: { cuposVisitante: number | undefined; horasMax: number | undefined },
  ): Promise<boolean> {
    error.value = null
    try {
      const cliente = useSupabaseClient<Database>()
      const { error: err } = await cliente.from('movilidad_config').upsert({
        tenant_id: tenantId,
        cupos_visitante: valores.cuposVisitante ?? null,
        horas_max_visitante: valores.horasMax ?? null,
      })
      if (err) throw err
      return true
    } catch (e) {
      error.value = mensajeError(e, 'No se pudo guardar la configuración de movilidad.')
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
    bitacora,
    dentro,
    ultimoPaso,
    registrarPaso,
    cargarDentro,
    cargarBitacora,
    cargarCupos,
    cargarConfigMovilidad,
    guardarConfigMovilidad,
  }
})
