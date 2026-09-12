/**
 * Marketplace de la copropiedad (EXS-6).
 *
 * Dos lecturas separadas a propósito:
 *
 *  · el TABLÓN sale de `fn_marketplace_listar`, que solo devuelve lo
 *    publicado y nunca `publicador_tercero_id`. Es lo que verá el residente
 *    el día que exista la capa externa, y por eso la pantalla de gestión lo
 *    usa igual: así no puede dar la ilusión de que un aviso se ve mejor de
 *    lo que se ve;
 *  · la GESTIÓN lee la tabla, donde el equipo sí necesita los borradores y
 *    lo pendiente de aprobar para poder trabajarlo.
 *
 * La escalera de aprobación NO se replica aquí: el guard de la base la
 * impone, y duplicarla en el cliente daría dos fuentes de verdad que
 * acabarían discrepando. La UI solo oculta lo que sabe que va a fallar.
 */
import { defineStore } from 'pinia'
import type { Database } from '@aquila/shared'
import { mensajeError } from '~/utils/error-message'

export type PublicacionEstado =
  | 'borrador'
  | 'pendiente_aprobacion'
  | 'publicada'
  | 'rechazada'
  | 'pausada'
  | 'cerrada'
  | 'expirada'

export interface FilaTablon {
  id: string
  titulo: string
  descripcion: string | null
  identidadPublica: string
  tipoNombre: string
  categoriaNombre: string
  condicionNombre: string | null
  precio: number | null
  moneda: string
  negociable: boolean
  publicadaAt: string | null
  vigenteHasta: string | null
  intereses: number
  /** Ruta de la primera foto, no una URL: el bucket es privado y la firma la pide el
   *  cliente con su propia sesión. */
  portadaPath: string | null
  fotos: number
}

export interface Publicacion {
  id: string
  publicadorTerceroId: string
  identidadPublica: string
  tipoId: number
  categoriaId: number
  condicionId: number | null
  titulo: string
  descripcion: string | null
  precio: number | null
  negociable: boolean
  estado: PublicacionEstado
  origen: 'residente' | 'auxiliar' | 'administrador'
  vigenteHasta: string | null
  motivoRechazo: string | null
}

export interface InteresPublicacion {
  id: string
  publicacionId: string
  interesadoNombre: string | null
  mensaje: string | null
  atendido: boolean
  createdAt: string
}

interface FilaTablonSql {
  id: string
  titulo: string
  descripcion: string | null
  identidad_publica: string
  tipo_nombre: string
  categoria_nombre: string
  condicion_nombre: string | null
  precio: number | null
  moneda: string
  negociable: boolean
  publicada_at: string | null
  vigente_hasta: string | null
  intereses: number
  portada_path: string | null
  fotos: number
}

export const useMarketplaceStore = defineStore('marketplace', () => {
  const tablon = shallowRef<FilaTablon[]>([])
  const publicaciones = shallowRef<Publicacion[]>([])
  const intereses = shallowRef<InteresPublicacion[]>([])
  const loading = ref(false)
  const error = ref<string | null>(null)

  async function cargarTablon(
    tenantId: string,
    filtros?: { categoriaId?: number | null; tipoId?: number | null; texto?: string },
  ): Promise<void> {
    loading.value = true
    error.value = null
    try {
      const cliente = useSupabaseClient<Database>()
      const { data, error: err } = await cliente.rpc('fn_marketplace_listar', {
        p_tenant_id: tenantId,
        p_categoria: filtros?.categoriaId ?? undefined,
        p_tipo: filtros?.tipoId ?? undefined,
        p_texto: filtros?.texto ?? undefined,
      })
      if (err) throw err
      tablon.value = ((data ?? []) as unknown as FilaTablonSql[]).map((f) => ({
        id: f.id,
        titulo: f.titulo,
        descripcion: f.descripcion,
        identidadPublica: f.identidad_publica,
        tipoNombre: f.tipo_nombre,
        categoriaNombre: f.categoria_nombre,
        condicionNombre: f.condicion_nombre,
        precio: f.precio,
        moneda: f.moneda,
        negociable: f.negociable,
        publicadaAt: f.publicada_at,
        vigenteHasta: f.vigente_hasta,
        intereses: f.intereses,
        portadaPath: f.portada_path,
        fotos: f.fotos,
      }))
    } catch (e) {
      error.value = mensajeError(e, 'No se pudo cargar el tablón.')
    } finally {
      loading.value = false
    }
  }

  async function cargarGestion(tenantId: string): Promise<void> {
    loading.value = true
    error.value = null
    try {
      const cliente = useSupabaseClient<Database>()
      // Cadena literal, no concatenada: supabase-js infiere el tipo de la
      // fila analizando este string en compilación.
      const { data, error: err } = await cliente
        .from('publicaciones')
        .select('id, publicador_tercero_id, identidad_publica, tipo_id, categoria_id, condicion_id, titulo, descripcion, precio, negociable, estado, origen, vigente_hasta, motivo_rechazo')
        .eq('tenant_id', tenantId)
        .order('created_at', { ascending: false })
      if (err) throw err
      publicaciones.value = (data ?? []).map((p) => ({
        id: p.id,
        publicadorTerceroId: p.publicador_tercero_id,
        identidadPublica: p.identidad_publica,
        tipoId: p.tipo_id,
        categoriaId: p.categoria_id,
        condicionId: p.condicion_id,
        titulo: p.titulo,
        descripcion: p.descripcion,
        precio: p.precio,
        negociable: p.negociable,
        estado: p.estado,
        origen: p.origen,
        vigenteHasta: p.vigente_hasta,
        motivoRechazo: p.motivo_rechazo,
      }))
    } catch (e) {
      error.value = mensajeError(e, 'No se pudieron cargar las publicaciones.')
    } finally {
      loading.value = false
    }
  }

  async function cargarIntereses(publicacionId: string): Promise<void> {
    error.value = null
    try {
      const cliente = useSupabaseClient<Database>()
      const { data, error: err } = await cliente
        .from('publicacion_interes')
        .select('id, publicacion_id, interesado_nombre, mensaje, atendido, created_at')
        .eq('publicacion_id', publicacionId)
        .order('created_at', { ascending: false })
      if (err) throw err
      intereses.value = (data ?? []).map((i) => ({
        id: i.id,
        publicacionId: i.publicacion_id,
        interesadoNombre: i.interesado_nombre,
        mensaje: i.mensaje,
        atendido: i.atendido,
        createdAt: i.created_at,
      }))
    } catch (e) {
      error.value = mensajeError(e, 'No se pudieron cargar los interesados.')
    }
  }

  async function guardar(params: {
    id?: string
    tenantId: string
    publicadorTerceroId: string
    identidadPublica: string
    tipoId: number
    categoriaId: number
    condicionId: number | null
    titulo: string
    descripcion: string | null
    precio: number | null
    negociable: boolean
    vigenteHasta: string | null
  }): Promise<boolean> {
    error.value = null
    try {
      const cliente = useSupabaseClient<Database>()
      const fila = {
        tenant_id: params.tenantId,
        publicador_tercero_id: params.publicadorTerceroId,
        identidad_publica: params.identidadPublica,
        tipo_id: params.tipoId,
        categoria_id: params.categoriaId,
        condicion_id: params.condicionId,
        titulo: params.titulo,
        descripcion: params.descripcion,
        precio: params.precio,
        negociable: params.negociable,
        vigente_hasta: params.vigenteHasta,
      }
      const { error: err } = params.id
        ? await cliente
            .from('publicaciones')
            .update({ ...fila, updated_at: new Date().toISOString() })
            .eq('id', params.id)
        : await cliente.from('publicaciones').insert(fila)
      if (err) throw err
      return true
    } catch (e) {
      error.value = mensajeError(e, 'No se pudo guardar la publicación.')
      return false
    }
  }

  /** Toda transición pasa por aquí; quién puede darla lo decide el guard. */
  async function cambiarEstado(
    id: string,
    estado: PublicacionEstado,
    extra?: { motivoRechazo?: string; motivoCierre?: string },
  ): Promise<boolean> {
    error.value = null
    try {
      const cliente = useSupabaseClient<Database>()
      const { error: err } = await cliente
        .from('publicaciones')
        .update({
          estado,
          motivo_rechazo: extra?.motivoRechazo ?? undefined,
          motivo_cierre: extra?.motivoCierre ?? undefined,
        })
        .eq('id', id)
      if (err) throw err
      return true
    } catch (e) {
      error.value = mensajeError(e, 'No se pudo cambiar el estado de la publicación.')
      return false
    }
  }

  async function registrarInteres(params: {
    tenantId: string
    publicacionId: string
    interesadoNombre: string
    mensaje: string | null
  }): Promise<boolean> {
    error.value = null
    try {
      const cliente = useSupabaseClient<Database>()
      const { error: err } = await cliente.from('publicacion_interes').insert({
        tenant_id: params.tenantId,
        publicacion_id: params.publicacionId,
        interesado_nombre: params.interesadoNombre,
        mensaje: params.mensaje,
      })
      if (err) throw err
      return true
    } catch (e) {
      error.value = mensajeError(e, 'No se pudo registrar el interés.')
      return false
    }
  }

  async function marcarInteresAtendido(id: string): Promise<boolean> {
    error.value = null
    try {
      const cliente = useSupabaseClient<Database>()
      const { error: err } = await cliente
        .from('publicacion_interes')
        .update({ atendido: true })
        .eq('id', id)
      if (err) throw err
      return true
    } catch (e) {
      error.value = mensajeError(e, 'No se pudo marcar el interés.')
      return false
    }
  }

  async function reportar(params: {
    tenantId: string
    publicacionId: string
    motivoId: number
    descripcion: string | null
  }): Promise<boolean> {
    error.value = null
    try {
      const cliente = useSupabaseClient<Database>()
      const { error: err } = await cliente.from('publicacion_reporte').insert({
        tenant_id: params.tenantId,
        publicacion_id: params.publicacionId,
        motivo_id: params.motivoId,
        descripcion: params.descripcion,
      })
      if (err) throw err
      return true
    } catch (e) {
      error.value = mensajeError(e, 'No se pudo reportar la publicación.')
      return false
    }
  }

  return {
    tablon,
    publicaciones,
    intereses,
    loading,
    error,
    cargarTablon,
    cargarGestion,
    cargarIntereses,
    guardar,
    cambiarEstado,
    registrarInteres,
    marcarInteresAtendido,
    reportar,
  }
})
