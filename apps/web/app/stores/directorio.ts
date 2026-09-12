/**
 * Directorio de la copropiedad (EXS-4).
 *
 * No es una segunda lista de terceros: es una proyección de los que además
 * tienen perfil publicado, y solo con lo que ese perfil autoriza mostrar.
 * Por eso el listado sale de `fn_directorio_listar` y no de un select sobre
 * `terceros` — la función es la que garantiza que el documento, el correo y
 * el teléfono administrativos no viajen al cliente (prompt 03 §15).
 *
 * La gestión sí escribe sobre `tercero_perfil` directamente: ahí sí hace
 * falta ver y editar el perfil completo, y la RLS ya limita a miembros con
 * rol de escritura.
 */
import { defineStore } from 'pinia'
import type { Database } from '@aquila/shared'
import { mensajeError } from '~/utils/error-message'

export interface FichaDirectorio {
  terceroId: string
  /** Id del PERFIL, no del tercero: las fotos cuelgan del perfil (20260933810000). */
  perfilId: string
  nombreComercial: string | null
  categoriaCodigo: string | null
  categoriaNombre: string | null
  descripcion: string | null
  horario: string | null
  contactoPublico: string | null
  tipoPersona: string
  ubicaciones: string[]
  /** Ruta en el bucket privado, no una URL: la firma la pide el cliente al mostrarla. */
  portadaPath: string | null
  fotos: number
}

export interface PerfilTercero {
  id: string
  terceroId: string
  nombreComercial: string | null
  descripcion: string | null
  categoriaComercioId: number | null
  horario: string | null
  contactoPublico: string | null
  publicado: boolean
  publicadoAt: string | null
}

interface FilaFicha {
  tercero_id: string
  perfil_id: string
  nombre_comercial: string | null
  categoria_codigo: string | null
  categoria_nombre: string | null
  descripcion: string | null
  horario: string | null
  contacto_publico: string | null
  tipo_persona: string
  ubicaciones: string[]
  portada_path: string | null
  fotos: number
}

export const useDirectorioStore = defineStore('directorio', () => {
  const fichas = shallowRef<FichaDirectorio[]>([])
  const perfiles = shallowRef<PerfilTercero[]>([])
  const loading = ref(false)
  const error = ref<string | null>(null)

  async function cargarDirectorio(
    tenantId: string,
    filtros?: { categoriaId?: number | null; texto?: string },
  ): Promise<void> {
    loading.value = true
    error.value = null
    try {
      const cliente = useSupabaseClient<Database>()
      const { data, error: err } = await cliente.rpc('fn_directorio_listar', {
        p_tenant_id: tenantId,
        p_categoria: filtros?.categoriaId ?? undefined,
        p_texto: filtros?.texto ?? undefined,
      })
      if (err) throw err
      fichas.value = ((data ?? []) as unknown as FilaFicha[]).map((f) => ({
        terceroId: f.tercero_id,
        perfilId: f.perfil_id,
        nombreComercial: f.nombre_comercial,
        categoriaCodigo: f.categoria_codigo,
        categoriaNombre: f.categoria_nombre,
        descripcion: f.descripcion,
        horario: f.horario,
        contactoPublico: f.contacto_publico,
        tipoPersona: f.tipo_persona,
        ubicaciones: f.ubicaciones,
        portadaPath: f.portada_path,
        fotos: f.fotos,
      }))
    } catch (e) {
      error.value = mensajeError(e, 'No se pudo cargar el directorio.')
    } finally {
      loading.value = false
    }
  }

  async function cargarPerfiles(tenantId: string): Promise<void> {
    loading.value = true
    error.value = null
    try {
      const cliente = useSupabaseClient<Database>()
      const { data, error: err } = await cliente
        .from('tercero_perfil')
        // Cadena literal, no concatenada: supabase-js infiere el tipo de la
        // fila analizando este string en tiempo de compilación, y un `+`
        // se lo impide (la fila pasa a ser GenericStringError).
        .select('id, tercero_id, nombre_comercial, descripcion, categoria_comercio_id, horario, contacto_publico, publicado, publicado_at')
        .eq('tenant_id', tenantId)
        .order('nombre_comercial')
      if (err) throw err
      perfiles.value = (data ?? []).map((p) => ({
        id: p.id,
        terceroId: p.tercero_id,
        nombreComercial: p.nombre_comercial,
        descripcion: p.descripcion,
        categoriaComercioId: p.categoria_comercio_id,
        horario: p.horario,
        contactoPublico: p.contacto_publico,
        publicado: p.publicado,
        publicadoAt: p.publicado_at,
      }))
    } catch (e) {
      error.value = mensajeError(e, 'No se pudieron cargar los perfiles.')
    } finally {
      loading.value = false
    }
  }

  /** Crea el perfil si no existe y lo actualiza si ya está — un tercero
   *  tiene como mucho uno (tercero_perfil_tercero_unico). */
  async function guardarPerfil(params: {
    tenantId: string
    terceroId: string
    nombreComercial: string | null
    descripcion: string | null
    categoriaComercioId: number | null
    horario: string | null
    contactoPublico: string | null
  }): Promise<boolean> {
    error.value = null
    try {
      const cliente = useSupabaseClient<Database>()
      const { error: err } = await cliente.from('tercero_perfil').upsert(
        {
          tenant_id: params.tenantId,
          tercero_id: params.terceroId,
          nombre_comercial: params.nombreComercial,
          descripcion: params.descripcion,
          categoria_comercio_id: params.categoriaComercioId,
          horario: params.horario,
          contacto_publico: params.contactoPublico,
        },
        { onConflict: 'tenant_id,tercero_id' },
      )
      if (err) throw err
      return true
    } catch (e) {
      error.value = mensajeError(e, 'No se pudo guardar el perfil.')
      return false
    }
  }

  /** Publicar y despublicar son la misma operación con distinto valor: el
   *  guard sella o limpia publicado_at/publicado_por según corresponda. */
  async function cambiarPublicacion(terceroId: string, publicado: boolean): Promise<boolean> {
    error.value = null
    try {
      const cliente = useSupabaseClient<Database>()
      const { error: err } = await cliente
        .from('tercero_perfil')
        .update({ publicado })
        .eq('tercero_id', terceroId)
      if (err) throw err
      return true
    } catch (e) {
      error.value = mensajeError(e, 'No se pudo cambiar la publicación.')
      return false
    }
  }

  return {
    fichas,
    perfiles,
    loading,
    error,
    cargarDirectorio,
    cargarPerfiles,
    guardarPerfil,
    cambiarPublicacion,
  }
})
