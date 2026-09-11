/**
 * Anuncios y comunicación oficial (EXS-3).
 *
 * El ciclo de vida NO vive aquí: vive en guard_anuncio_transicion. Este
 * store manda el cambio de estado y deja que la base lo acepte o lo
 * rechace — si validara las transiciones por su cuenta tendríamos dos
 * versiones de la misma regla, y la del cliente sería la mentirosa
 * (prompt 03 §77: una regla, una fuente).
 *
 * Por eso `transicionar` no comprueba nada antes de enviar: los mensajes
 * de error del guard (ANUNCIO_AUTOAPROBACION, ANUNCIO_TRANSICION_INVALIDA…)
 * son los que ve el usuario, y son los mismos que vería cualquier otro
 * cliente contra la misma base.
 */
import { defineStore } from 'pinia'
import type { Database } from '@aquila/shared'
import { mensajeError } from '~/utils/error-message'

type AnuncioEstado = Database['public']['Enums']['anuncio_estado_t']

export interface Anuncio {
  id: string
  titulo: string
  resumen: string | null
  contenido: string
  estado: AnuncioEstado
  categoria: string
  categoriaId: number
  prioridad: string
  prioridadId: number
  numero: number | null
  anio: number | null
  referencia: string | null
  publicarAt: string | null
  publicadoAt: string | null
  vigenteDesde: string | null
  vigenteHasta: string | null
  requiereConfirmacion: boolean
  motivoRechazo: string | null
  creadoPor: string | null
  createdAt: string
  leido: boolean
  confirmado: boolean
}

export interface ReglaAudiencia {
  id: string
  criterio: string
  valor: string | null
}

export interface MetricasAnuncio {
  destinatarios: number
  leidos: number
  confirmados: number
}

interface FilaAnuncio {
  id: string
  titulo: string
  resumen: string | null
  contenido: string
  estado: AnuncioEstado
  categoria_id: number
  prioridad_id: number
  numero: number | null
  anio: number | null
  publicar_at: string | null
  publicado_at: string | null
  vigente_desde: string | null
  vigente_hasta: string | null
  requiere_confirmacion: boolean
  motivo_rechazo: string | null
  creado_por: string | null
  created_at: string
  categoria: { codigo: string; nombre: string } | null
  prioridad: { codigo: string; nombre: string } | null
  anuncio_lectura: { leido_at: string; confirmado_at: string | null }[]
}

const SELECT_ANUNCIO =
  'id, titulo, resumen, contenido, estado, categoria_id, prioridad_id, numero, anio,' +
  ' publicar_at, publicado_at, vigente_desde, vigente_hasta, requiere_confirmacion,' +
  ' motivo_rechazo, creado_por, created_at,' +
  ' categoria:categoria_id(codigo, nombre), prioridad:prioridad_id(codigo, nombre),' +
  ' anuncio_lectura(leido_at, confirmado_at)'

function aAnuncio(f: FilaAnuncio): Anuncio {
  const lectura = f.anuncio_lectura[0]
  return {
    id: f.id,
    titulo: f.titulo,
    resumen: f.resumen,
    contenido: f.contenido,
    estado: f.estado,
    categoria: f.categoria?.nombre ?? '—',
    categoriaId: f.categoria_id,
    prioridad: f.prioridad?.codigo ?? 'normal',
    prioridadId: f.prioridad_id,
    numero: f.numero,
    anio: f.anio,
    referencia:
      f.numero !== null && f.anio !== null
        ? `AN-${String(f.anio)}-${String(f.numero).padStart(6, '0')}`
        : null,
    publicarAt: f.publicar_at,
    publicadoAt: f.publicado_at,
    vigenteDesde: f.vigente_desde,
    vigenteHasta: f.vigente_hasta,
    requiereConfirmacion: f.requiere_confirmacion,
    motivoRechazo: f.motivo_rechazo,
    creadoPor: f.creado_por,
    createdAt: f.created_at,
    leido: lectura !== undefined,
    confirmado: lectura?.confirmado_at != null,
  }
}

export const useAnunciosStore = defineStore('anuncios', () => {
  const anuncios = shallowRef<Anuncio[]>([])
  const detalle = ref<Anuncio | null>(null)
  const audiencia = shallowRef<ReglaAudiencia[]>([])
  const metricas = ref<MetricasAnuncio | null>(null)
  const loading = ref(false)
  const error = ref<string | null>(null)

  async function cargar(tenantId: string): Promise<void> {
    loading.value = true
    error.value = null
    try {
      const cliente = useSupabaseClient<Database>()
      const { data, error: err } = await cliente
        .from('anuncios')
        .select(SELECT_ANUNCIO)
        .eq('tenant_id', tenantId)
        .order('created_at', { ascending: false })
      if (err) throw err
      anuncios.value = ((data ?? []) as unknown as FilaAnuncio[]).map(aAnuncio)
    } catch (e) {
      error.value = mensajeError(e, 'No se pudieron cargar los anuncios.')
    } finally {
      loading.value = false
    }
  }

  async function cargarDetalle(anuncioId: string): Promise<void> {
    loading.value = true
    error.value = null
    try {
      const cliente = useSupabaseClient<Database>()
      const { data, error: err } = await cliente
        .from('anuncios')
        .select(SELECT_ANUNCIO)
        .eq('id', anuncioId)
        .single()
      if (err) throw err
      detalle.value = aAnuncio(data as unknown as FilaAnuncio)

      const { data: reglas } = await cliente
        .from('anuncio_audiencia')
        .select('id, criterio, valor')
        .eq('anuncio_id', anuncioId)
      audiencia.value = (reglas ?? []) as ReglaAudiencia[]

      // Las métricas solo tienen sentido sobre algo ya publicado.
      if (detalle.value.publicadoAt) {
        const { data: m } = await cliente.rpc('fn_anuncio_metricas', { p_anuncio_id: anuncioId })
        metricas.value = (m?.[0] as MetricasAnuncio | undefined) ?? null
      } else {
        metricas.value = null
      }
    } catch (e) {
      error.value = mensajeError(e, 'No se pudo cargar el anuncio.')
    } finally {
      loading.value = false
    }
  }

  async function crear(params: {
    tenantId: string
    categoriaId: number
    prioridadId: number
    titulo: string
    resumen: string | null
    contenido: string
    requiereConfirmacion: boolean
    vigenteHasta: string | null
  }): Promise<string | null> {
    error.value = null
    try {
      const cliente = useSupabaseClient<Database>()
      const { data: usuario } = await cliente.auth.getUser()
      const { data, error: err } = await cliente
        .from('anuncios')
        .insert({
          tenant_id: params.tenantId,
          categoria_id: params.categoriaId,
          prioridad_id: params.prioridadId,
          titulo: params.titulo,
          resumen: params.resumen,
          contenido: params.contenido,
          requiere_confirmacion: params.requiereConfirmacion,
          vigente_hasta: params.vigenteHasta,
          creado_por: usuario.user?.id ?? null,
        })
        .select('id')
        .single<{ id: string }>()
      if (err) throw err
      return data.id
    } catch (e) {
      error.value = mensajeError(e, 'No se pudo crear el anuncio.')
      return null
    }
  }

  async function guardarBorrador(
    anuncioId: string,
    cambios: { titulo?: string; resumen?: string | null; contenido?: string; requiereConfirmacion?: boolean },
  ): Promise<boolean> {
    error.value = null
    try {
      const cliente = useSupabaseClient<Database>()
      const { error: err } = await cliente
        .from('anuncios')
        .update({
          ...(cambios.titulo !== undefined ? { titulo: cambios.titulo } : {}),
          ...(cambios.resumen !== undefined ? { resumen: cambios.resumen } : {}),
          ...(cambios.contenido !== undefined ? { contenido: cambios.contenido } : {}),
          ...(cambios.requiereConfirmacion !== undefined
            ? { requiere_confirmacion: cambios.requiereConfirmacion }
            : {}),
        })
        .eq('id', anuncioId)
      if (err) throw err
      return true
    } catch (e) {
      error.value = mensajeError(e, 'No se pudo guardar el borrador.')
      return false
    }
  }

  /** Manda el cambio y deja hablar al guard. Ver la cabecera del store. */
  async function transicionar(
    anuncioId: string,
    estado: AnuncioEstado,
    extra?: { publicarAt?: string; motivoRechazo?: string },
  ): Promise<boolean> {
    error.value = null
    try {
      const cliente = useSupabaseClient<Database>()
      const { error: err } = await cliente
        .from('anuncios')
        .update({
          estado,
          ...(extra?.publicarAt ? { publicar_at: extra.publicarAt } : {}),
          ...(extra?.motivoRechazo ? { motivo_rechazo: extra.motivoRechazo } : {}),
        })
        .eq('id', anuncioId)
      if (err) throw err
      return true
    } catch (e) {
      error.value = mensajeError(e, 'No se pudo cambiar el estado del anuncio.')
      return false
    }
  }

  async function fijarAudiencia(
    anuncioId: string,
    reglas: { criterio: string; valor: string | null }[],
  ): Promise<boolean> {
    error.value = null
    try {
      const cliente = useSupabaseClient<Database>()
      // Reemplazo completo: la audiencia es un conjunto, no un histórico.
      const { error: errBorrar } = await cliente
        .from('anuncio_audiencia')
        .delete()
        .eq('anuncio_id', anuncioId)
      if (errBorrar) throw errBorrar

      if (reglas.length > 0) {
        const { error: errInsert } = await cliente
          .from('anuncio_audiencia')
          .insert(reglas.map((r) => ({ anuncio_id: anuncioId, criterio: r.criterio, valor: r.valor })))
        if (errInsert) throw errInsert
      }
      return true
    } catch (e) {
      error.value = mensajeError(e, 'No se pudo guardar la audiencia.')
      return false
    }
  }

  async function marcarLeido(anuncioId: string): Promise<void> {
    const cliente = useSupabaseClient<Database>()
    const { data: usuario } = await cliente.auth.getUser()
    const userId = usuario.user?.id
    if (!userId) return
    const { error: err } = await cliente
      .from('anuncio_lectura')
      .insert({ anuncio_id: anuncioId, user_id: userId })
    // 23505 = ya estaba leído; no es un error para quien lee.
    if (err && err.code !== '23505') error.value = mensajeError(err, 'No se pudo registrar la lectura.')
    else if (detalle.value?.id === anuncioId) detalle.value = { ...detalle.value, leido: true }
  }

  async function confirmarLectura(anuncioId: string): Promise<boolean> {
    error.value = null
    try {
      const cliente = useSupabaseClient<Database>()
      const { data: usuario } = await cliente.auth.getUser()
      const userId = usuario.user?.id
      if (!userId) return false
      const { error: err } = await cliente
        .from('anuncio_lectura')
        .update({ confirmado_at: new Date().toISOString() })
        .eq('anuncio_id', anuncioId)
        .eq('user_id', userId)
      if (err) throw err
      if (detalle.value?.id === anuncioId) detalle.value = { ...detalle.value, confirmado: true }
      return true
    } catch (e) {
      error.value = mensajeError(e, 'No se pudo confirmar la lectura.')
      return false
    }
  }

  async function despachar(anuncioId: string): Promise<{ enviados: number; fallidos: number; sinCorreo: number } | null> {
    error.value = null
    try {
      const cliente = useSupabaseClient<Database>()
      const { data, response } = await cliente.functions.invoke<{
        enviados: number
        fallidos: number
        sin_correo: number
      }>('enviar-anuncio', { body: { anuncio_id: anuncioId } })
      if (!response || response.status !== 200 || !data) {
        throw new Error(`No se pudo despachar el anuncio (HTTP ${String(response?.status)}).`)
      }
      return { enviados: data.enviados, fallidos: data.fallidos, sinCorreo: data.sin_correo }
    } catch (e) {
      error.value = mensajeError(e, 'No se pudo despachar el anuncio.')
      return null
    }
  }

  return {
    anuncios,
    detalle,
    audiencia,
    metricas,
    loading,
    error,
    cargar,
    cargarDetalle,
    crear,
    guardarBorrador,
    transicionar,
    fijarAudiencia,
    marcarLeido,
    confirmarLectura,
    despachar,
  }
})
