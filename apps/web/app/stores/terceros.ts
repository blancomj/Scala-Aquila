/**
 * Terceros — mantenimiento (PROMPT_MANTENIMIENTO_TERCEROS.md §6.3),
 * asociación de terceros a un inmueble (ficha de inmueble,
 * PROMPT_FICHA_INMUEBLE.md §4.2, §7.1-7.3) y asociación de terceros a la
 * copropiedad misma (ficha de copropiedad, PROMPT_FICHA_COPROPIEDAD.md
 * §4.4, §7.3 — cierra el gap §8.2 de PROMPT_MANTENIMIENTO_TERCEROS.md, que
 * daba estas funciones por existentes sin estarlo). Antes `personas.ts` —
 * la tabla se generalizó a natural/jurídica (migración 20260821100000).
 *
 * SELECT/INSERT/UPDATE van directo por RLS (agent) — sin Edge Function,
 * mismo criterio que fundamentoNormativo.ts/members.ts. `marcarPagador` es
 * la única excepción de tipo "swap atómico de un solo X vigente": pasa por
 * el RPC `fn_marcar_pagador` para que desmarcar+marcar sea una sola
 * transacción — nunca un UPDATE directo sobre `es_pagador` (violaría el
 * índice único parcial si ya hay otro pagador vigente).
 *
 * `asociarTerceroInmueble` y `asociarTerceroTenant` además llaman a
 * `fn_cerrar_rol_anterior`/`fn_cerrar_rol_anterior_tenant` tras insertar:
 * cierran la vigencia (vigente_hasta = vigente_desde de la persona nueva)
 * de quien tenía ese mismo rol activo en el inmueble/la copropiedad — un
 * solo titular vigente por rol a la vez. Excepción única: copropietario en
 * `inmueble_persona_rol`, que sí admite varias personas activas (decisión
 * explícita del usuario). `tenant_tercero_rol` no tiene esa excepción —
 * ningún rol de PERSONA_COPROPIEDAD admite varios titulares vigentes
 * (decisión explícita del usuario, esta sesión, revierte lo documentado en
 * 20260822090000_tenant_tercero_rol.sql).
 */
import { defineStore } from 'pinia'
import type { Database } from '@aquila/shared'

type TerceroRow = Database['public']['Tables']['terceros']['Row']
type TerceroTipo = Database['public']['Enums']['tercero_tipo_t']
type InmueblePersonaRolRow = Database['public']['Tables']['inmueble_persona_rol']['Row']
type TenantTerceroRolRow = Database['public']['Tables']['tenant_tercero_rol']['Row']
type ListaTipoRow = Database['public']['Tables']['lista_tipos']['Row']

export interface TerceroAsociado extends InmueblePersonaRolRow {
  readonly tercero: TerceroRow
  readonly rol: ListaTipoRow
}

export interface PersonaTenant extends TenantTerceroRolRow {
  readonly tercero: TerceroRow
  readonly rol: ListaTipoRow
}

interface CrearTerceroNatural {
  tenantId: string
  tipoPersona: 'natural'
  tipoIdentificacionId: number
  numeroDocumento: string
  digitoVerificacion?: string
  primerNombre: string
  segundoNombre?: string
  primerApellido: string
  segundoApellido?: string
  email?: string
  telefono?: string
  direccion?: string
  estadoId: number
}

interface CrearTerceroJuridica {
  tenantId: string
  tipoPersona: 'juridica'
  tipoIdentificacionId: number
  numeroDocumento: string
  digitoVerificacion?: string
  razonSocial: string
  representanteLegalId?: string
  pagadorId?: string
  email?: string
  telefono?: string
  direccion?: string
  estadoId: number
}

export type CrearTerceroParams = CrearTerceroNatural | CrearTerceroJuridica

export interface ActualizarTerceroParams {
  tipoIdentificacionId?: number
  numeroDocumento?: string
  digitoVerificacion?: string | null
  primerNombre?: string | null
  segundoNombre?: string | null
  primerApellido?: string | null
  segundoApellido?: string | null
  razonSocial?: string | null
  representanteLegalId?: string | null
  pagadorId?: string | null
  email?: string | null
  telefono?: string | null
  direccion?: string | null
  estadoId?: number
}

export const useTercerosStore = defineStore('terceros', () => {
  const terceros = shallowRef<TerceroRow[]>([])
  const tercerosNaturales = shallowRef<TerceroRow[]>([])
  const tiposIdentificacion = shallowRef<ListaTipoRow[]>([])
  const estadosGenerales = shallowRef<ListaTipoRow[]>([])
  const rolesPersonaPredio = shallowRef<ListaTipoRow[]>([])
  const rolesPersonaCopropiedad = shallowRef<ListaTipoRow[]>([])
  const tercerosAsociados = shallowRef<TerceroAsociado[]>([])
  const personasTenant = shallowRef<PersonaTenant[]>([])
  const loading = ref(false)

  // ── Mantenimiento de terceros (PROMPT_MANTENIMIENTO_TERCEROS.md) ───────
  async function cargarTerceros(tenantId: string): Promise<TerceroRow[]> {
    loading.value = true
    try {
      const cliente = useSupabaseClient<Database>()
      const { data, error: errorTerceros } = await cliente
        .from('terceros')
        .select('*')
        .eq('tenant_id', tenantId)
        .order('nombre_completo')
      if (errorTerceros) throw errorTerceros
      terceros.value = data ?? []
      return terceros.value
    } finally {
      loading.value = false
    }
  }

  async function cargarCatalogos(tenantId: string): Promise<void> {
    const [tipos, estados, rolesCopropiedad] = await Promise.all([
      cargarListaTipos(tenantId, 'TIPO_IDENTIFICACION'),
      cargarListaTipos(tenantId, 'ESTADO_TERCERO'),
      cargarListaTipos(tenantId, 'PERSONA_COPROPIEDAD'),
    ])
    tiposIdentificacion.value = tipos
    estadosGenerales.value = estados
    rolesPersonaCopropiedad.value = rolesCopropiedad
  }

  async function cargarTercerosNaturales(tenantId: string): Promise<TerceroRow[]> {
    const cliente = useSupabaseClient<Database>()
    const { data, error: errorNaturales } = await cliente
      .from('terceros')
      .select('*')
      .eq('tenant_id', tenantId)
      .eq('tipo_persona', 'natural')
      .order('nombre_completo')
    if (errorNaturales) throw errorNaturales
    tercerosNaturales.value = data ?? []
    return tercerosNaturales.value
  }

  function payloadTipoPersona(params: CrearTerceroParams): TerceroTipo {
    return params.tipoPersona
  }

  async function crearTercero(params: CrearTerceroParams): Promise<TerceroRow> {
    const cliente = useSupabaseClient<Database>()
    const esNatural = params.tipoPersona === 'natural'
    const { data, error: errorInsert } = await cliente
      .from('terceros')
      .insert({
        tenant_id: params.tenantId,
        tipo_persona: payloadTipoPersona(params),
        tipo_identificacion_id: params.tipoIdentificacionId,
        numero_documento: params.numeroDocumento,
        digito_verificacion: params.digitoVerificacion ?? null,
        primer_nombre: esNatural ? (params as CrearTerceroNatural).primerNombre : null,
        segundo_nombre: esNatural ? ((params as CrearTerceroNatural).segundoNombre ?? null) : null,
        primer_apellido: esNatural ? (params as CrearTerceroNatural).primerApellido : null,
        segundo_apellido: esNatural
          ? ((params as CrearTerceroNatural).segundoApellido ?? null)
          : null,
        razon_social: esNatural ? null : (params as CrearTerceroJuridica).razonSocial,
        representante_legal_id: esNatural
          ? null
          : ((params as CrearTerceroJuridica).representanteLegalId ?? null),
        pagador_id: esNatural ? null : ((params as CrearTerceroJuridica).pagadorId ?? null),
        email: params.email ?? null,
        telefono: params.telefono ?? null,
        direccion: params.direccion ?? null,
        estado_id: params.estadoId,
      })
      .select('*')
      .single()
    if (errorInsert) throw errorInsert

    await cargarTerceros(params.tenantId)
    return data
  }

  async function actualizarTercero(
    id: string,
    tenantId: string,
    cambios: ActualizarTerceroParams,
  ): Promise<void> {
    const cliente = useSupabaseClient<Database>()
    const { error: errorUpdate } = await cliente
      .from('terceros')
      .update({
        tipo_identificacion_id: cambios.tipoIdentificacionId,
        numero_documento: cambios.numeroDocumento,
        digito_verificacion: cambios.digitoVerificacion,
        primer_nombre: cambios.primerNombre,
        segundo_nombre: cambios.segundoNombre,
        primer_apellido: cambios.primerApellido,
        segundo_apellido: cambios.segundoApellido,
        razon_social: cambios.razonSocial,
        representante_legal_id: cambios.representanteLegalId,
        pagador_id: cambios.pagadorId,
        email: cambios.email,
        telefono: cambios.telefono,
        direccion: cambios.direccion,
        estado_id: cambios.estadoId,
      })
      .eq('id', id)
    if (errorUpdate) throw errorUpdate

    await cargarTerceros(tenantId)
  }

  // ── Asociación de terceros a un inmueble (ficha de inmueble) ────────────
  async function cargarRolesPersonaPredio(tenantId: string): Promise<ListaTipoRow[]> {
    rolesPersonaPredio.value = await cargarListaTipos(tenantId, 'PERSONA_PREDIO')
    return rolesPersonaPredio.value
  }

  async function cargarTercerosAsociados(
    tenantId: string,
    inmuebleId: string,
  ): Promise<TerceroAsociado[]> {
    loading.value = true
    try {
      const cliente = useSupabaseClient<Database>()
      const { data, error: errorAsociados } = await cliente
        .from('inmueble_persona_rol')
        .select('*, tercero:terceros(*), rol:lista_tipos(*)')
        .eq('tenant_id', tenantId)
        .eq('inmueble_id', inmuebleId)
        .order('vigente_desde', { ascending: false })
      if (errorAsociados) throw errorAsociados
      tercerosAsociados.value = (data ?? []) as TerceroAsociado[]
      return tercerosAsociados.value
    } finally {
      loading.value = false
    }
  }

  /** Reutiliza el tercero si el documento ya existe en el tenant (unique constraint) — nunca duplica.
   * Split de nombre heurístico (primera palabra = primer_nombre, última = primer_apellido,
   * intermedias = segundo_nombre) — igual criterio que el backfill de la migración, esta ficha
   * solo colecciona "Nombre completo" en un campo (PROMPT_FICHA_INMUEBLE.md §7.2), no separa
   * nombres/apellidos. Alta rápida siempre crea un tercero natural, activo. */
  async function encontrarOCrearTercero(params: {
    tenantId: string
    tipoIdentificacionId: number
    numeroDocumento: string
    nombre: string
    email?: string
    telefono?: string
  }): Promise<TerceroRow> {
    const cliente = useSupabaseClient<Database>()
    const { data: existente, error: errorBusqueda } = await cliente
      .from('terceros')
      .select('*')
      .eq('tenant_id', params.tenantId)
      .eq('tipo_identificacion_id', params.tipoIdentificacionId)
      .eq('numero_documento', params.numeroDocumento)
      .maybeSingle()
    if (errorBusqueda) throw errorBusqueda
    if (existente) return existente

    const estadoActivo = (await cargarListaTipos(params.tenantId, 'ESTADO_TERCERO')).find(
      (e) => e.codigo === 'activo',
    )
    if (!estadoActivo) throw new Error('Catálogo ESTADO_TERCERO sin código "activo".')

    const palabras = params.nombre.trim().split(/\s+/)
    const primerNombre = palabras[0] ?? params.nombre
    const primerApellido =
      palabras.length > 1 ? (palabras[palabras.length - 1] ?? primerNombre) : primerNombre
    const segundoNombre =
      palabras.length > 2 ? palabras.slice(1, palabras.length - 1).join(' ') : undefined

    return crearTercero({
      tenantId: params.tenantId,
      tipoPersona: 'natural',
      tipoIdentificacionId: params.tipoIdentificacionId,
      numeroDocumento: params.numeroDocumento,
      primerNombre,
      segundoNombre,
      primerApellido,
      email: params.email,
      telefono: params.telefono,
      estadoId: estadoActivo.id,
    })
  }

  async function asociarTerceroInmueble(params: {
    tenantId: string
    inmuebleId: string
    rolId: number
    tipoIdentificacionId: number
    numeroDocumento: string
    nombre: string
    email?: string
    telefono?: string
    porcentaje?: number
    esPagador: boolean
    recibeNotificaciones: boolean
    vigenteDesde: string
    vigenteHasta?: string
  }): Promise<TerceroAsociado> {
    const tercero = await encontrarOCrearTercero(params)

    const cliente = useSupabaseClient<Database>()
    const { data: asociacion, error: errorInsert } = await cliente
      .from('inmueble_persona_rol')
      .insert({
        tenant_id: params.tenantId,
        inmueble_id: params.inmuebleId,
        tercero_id: tercero.id,
        rol_id: params.rolId,
        porcentaje: params.porcentaje ?? null,
        es_pagador: false,
        recibe_notificaciones: params.recibeNotificaciones,
        vigente_desde: params.vigenteDesde,
        vigente_hasta: params.vigenteHasta,
      })
      .select('*, tercero:terceros(*), rol:lista_tipos(*)')
      .single()
    if (errorInsert) throw errorInsert

    // Cierra la vigencia de quien tenía este mismo rol activo en el
    // inmueble — excepto copropietario, que sí admite varios activos a la
    // vez (copropiedad compartida). No-op silencioso si no había nadie con
    // ese rol o si el rol es copropietario (fn_cerrar_rol_anterior).
    const { error: errorCierre } = await cliente.rpc('fn_cerrar_rol_anterior', {
      p_persona_rol_id: asociacion.id,
      p_tenant_id: params.tenantId,
      p_inmueble_id: params.inmuebleId,
      p_rol_id: params.rolId,
      p_vigente_desde: params.vigenteDesde,
    })
    if (errorCierre) throw errorCierre

    if (params.esPagador) {
      await marcarPagador(asociacion.id, params.tenantId, params.inmuebleId)
    }

    await cargarTercerosAsociados(params.tenantId, params.inmuebleId)
    return asociacion as TerceroAsociado
  }

  async function actualizarAsociacion(params: {
    id: string
    tenantId: string
    inmuebleId: string
    rolId: number
    porcentaje?: number
    recibeNotificaciones: boolean
    vigenteHasta?: string | null
  }): Promise<void> {
    const cliente = useSupabaseClient<Database>()
    const { error: errorUpdate } = await cliente
      .from('inmueble_persona_rol')
      .update({
        rol_id: params.rolId,
        porcentaje: params.porcentaje ?? null,
        recibe_notificaciones: params.recibeNotificaciones,
        vigente_hasta: params.vigenteHasta,
      })
      .eq('id', params.id)
    if (errorUpdate) throw errorUpdate

    await cargarTercerosAsociados(params.tenantId, params.inmuebleId)
  }

  /** Único punto autorizado para cambiar el pagador — nunca un update directo de es_pagador (§7.3). */
  async function marcarPagador(
    tercerRolId: string,
    tenantId: string,
    inmuebleId: string,
  ): Promise<void> {
    const cliente = useSupabaseClient<Database>()
    const { error: errorRpc } = await cliente.rpc('fn_marcar_pagador', {
      p_persona_rol_id: tercerRolId,
      p_tenant_id: tenantId,
      p_inmueble_id: inmuebleId,
    })
    if (errorRpc) throw errorRpc

    await cargarTercerosAsociados(tenantId, inmuebleId)
  }

  // ── Asociación de terceros a la copropiedad (ficha de copropiedad) ─────
  async function cargarPersonasTenant(tenantId: string): Promise<PersonaTenant[]> {
    loading.value = true
    try {
      const cliente = useSupabaseClient<Database>()
      const { data, error: errorPersonas } = await cliente
        .from('tenant_tercero_rol')
        .select('*, tercero:terceros(*), rol:lista_tipos(*)')
        .eq('tenant_id', tenantId)
        .order('vigente_desde', { ascending: false })
      if (errorPersonas) throw errorPersonas
      personasTenant.value = (data ?? []) as PersonaTenant[]
      return personasTenant.value
    } finally {
      loading.value = false
    }
  }

  /** Sin restricción de tipo_persona (a diferencia de representante legal/pagador) —
   * un administrador o contador de la copropiedad puede ser natural o jurídico. */
  async function asociarTerceroTenant(params: {
    tenantId: string
    terceroId: string
    rolId: number
    vigenteDesde: string
    recibeNotificaciones: boolean
    numeroTarjetaProfesional?: string
  }): Promise<PersonaTenant> {
    const cliente = useSupabaseClient<Database>()
    const { data, error: errorInsert } = await cliente
      .from('tenant_tercero_rol')
      .insert({
        tenant_id: params.tenantId,
        tercero_id: params.terceroId,
        rol_id: params.rolId,
        vigente_desde: params.vigenteDesde,
        recibe_notificaciones: params.recibeNotificaciones,
        numero_tarjeta_profesional: params.numeroTarjetaProfesional || null,
      })
      .select('*, tercero:terceros(*), rol:lista_tipos(*)')
      .single()
    if (errorInsert) throw errorInsert

    // Cierra la vigencia de quien tenía este mismo rol activo en la
    // copropiedad — sin excepción de rol (a diferencia de
    // fn_cerrar_rol_anterior, aquí no existe el concepto "copropietario").
    const { error: errorCierre } = await cliente.rpc('fn_cerrar_rol_anterior_tenant', {
      p_tenant_tercero_rol_id: data.id,
      p_tenant_id: params.tenantId,
      p_rol_id: params.rolId,
      p_vigente_desde: params.vigenteDesde,
    })
    if (errorCierre) throw errorCierre

    await cargarPersonasTenant(params.tenantId)
    return data as PersonaTenant
  }

  /** Termina la relación poniendo vigente_hasta — nunca DELETE, mismo criterio
   * que inmueble_persona_rol/terceros.estado_id. */
  async function finalizarRelacionTenant(
    id: string,
    tenantId: string,
    vigenteHasta: string,
  ): Promise<void> {
    const cliente = useSupabaseClient<Database>()
    const { error: errorUpdate } = await cliente
      .from('tenant_tercero_rol')
      .update({ vigente_hasta: vigenteHasta })
      .eq('id', id)
    if (errorUpdate) throw errorUpdate

    await cargarPersonasTenant(tenantId)
  }

  function limpiar(): void {
    terceros.value = []
    tercerosNaturales.value = []
    tercerosAsociados.value = []
    personasTenant.value = []
  }

  return {
    terceros,
    tercerosNaturales,
    tiposIdentificacion,
    estadosGenerales,
    rolesPersonaPredio,
    rolesPersonaCopropiedad,
    tercerosAsociados,
    personasTenant,
    loading,
    cargarTerceros,
    cargarCatalogos,
    cargarTercerosNaturales,
    crearTercero,
    actualizarTercero,
    cargarRolesPersonaPredio,
    cargarTercerosAsociados,
    asociarTerceroInmueble,
    actualizarAsociacion,
    marcarPagador,
    cargarPersonasTenant,
    asociarTerceroTenant,
    finalizarRelacionTenant,
    limpiar,
  }
})
