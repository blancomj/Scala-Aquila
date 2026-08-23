/**
 * Zonas comunes — inventario de bienes comunes de la copropiedad
 * (20260830300000). Descriptivo, fuera de la cadena de cálculo (R6,
 * PLAN_MAESTRO_IMPLEMENTACION.md §4.1.1): el motor de liquidación nunca lee
 * de esta tabla.
 *
 * `es_esencial` es la distinción de la Ley 675/2001 (Art. 19-20): un bien
 * común esencial (estructura, escaleras, redes) nunca puede asignarse en uso
 * exclusivo a un inmueble — el guard `guard_zona_comun_esencial_sin_uso_exclusivo`
 * lo impone en la base, aquí solo se refleja el error tal cual.
 *
 * Lectura/escritura directa por RLS (`zonas_comunes_*_agent`), mismo criterio
 * que agrupaciones.ts: sin efecto colateral atómico que exija una Edge
 * Function.
 */
import { defineStore } from 'pinia'
import type { Database } from '@aquila/shared'

type ZonaComunRow = Database['public']['Tables']['zonas_comunes']['Row']
type ListaTipoRow = Database['public']['Tables']['lista_tipos']['Row']

export const useZonasComunesStore = defineStore('zonasComunes', () => {
  const zonasComunes = shallowRef<ZonaComunRow[]>([])
  const tiposZonaComun = shallowRef<ListaTipoRow[]>([])
  const loading = ref(false)

  async function cargarTiposZonaComun(tenantId: string): Promise<ListaTipoRow[]> {
    const cliente = useSupabaseClient<Database>()
    const { data, error: errorTipos } = await cliente
      .from('lista_tipos')
      .select('*')
      .eq('tipo', 'TIPO_ZONA_COMUN')
      .eq('activo', true)
      .or(`tenant_id.is.null,tenant_id.eq.${tenantId}`)
      .order('orden')
    if (errorTipos) throw errorTipos
    tiposZonaComun.value = data ?? []
    return tiposZonaComun.value
  }

  async function cargarZonasComunes(tenantId: string): Promise<ZonaComunRow[]> {
    loading.value = true
    try {
      const cliente = useSupabaseClient<Database>()
      const { data, error: errorZonas } = await cliente
        .from('zonas_comunes')
        .select('*')
        .eq('tenant_id', tenantId)
        .order('nombre')
      if (errorZonas) throw errorZonas
      zonasComunes.value = data ?? []
      return zonasComunes.value
    } finally {
      loading.value = false
    }
  }

  const tipoPorId = computed(() => new Map(tiposZonaComun.value.map((t) => [t.id, t.nombre])))

  async function crearZonaComun(params: {
    tenantId: string
    codigo: string
    nombre: string
    tipoId: number
    area?: number | null
    descripcion?: string | null
    esEsencial?: boolean
    activa?: boolean
    usoExclusivoInmuebleId?: string | null
    matriculaInmobiliaria?: string | null
  }): Promise<ZonaComunRow> {
    const cliente = useSupabaseClient<Database>()
    const { data, error: errorInsert } = await cliente
      .from('zonas_comunes')
      .insert({
        tenant_id: params.tenantId,
        codigo: params.codigo.trim(),
        nombre: params.nombre.trim(),
        tipo_id: params.tipoId,
        area: params.area ?? null,
        descripcion: params.descripcion?.trim() || null,
        es_esencial: params.esEsencial ?? false,
        activa: params.activa ?? true,
        uso_exclusivo_inmueble_id: params.usoExclusivoInmuebleId ?? null,
        matricula_inmobiliaria: params.matriculaInmobiliaria?.trim() || null,
      })
      .select('*')
      .single()
    if (errorInsert) throw errorInsert

    await cargarZonasComunes(params.tenantId)
    return data
  }

  async function actualizarZonaComun(params: {
    id: string
    tenantId: string
    codigo: string
    nombre: string
    tipoId: number
    area?: number | null
    descripcion?: string | null
    esEsencial?: boolean
    activa?: boolean
    usoExclusivoInmuebleId?: string | null
    matriculaInmobiliaria?: string | null
  }): Promise<void> {
    const cliente = useSupabaseClient<Database>()
    const { error: errorUpdate } = await cliente
      .from('zonas_comunes')
      .update({
        codigo: params.codigo.trim(),
        nombre: params.nombre.trim(),
        tipo_id: params.tipoId,
        area: params.area ?? null,
        descripcion: params.descripcion?.trim() || null,
        es_esencial: params.esEsencial ?? false,
        activa: params.activa ?? true,
        uso_exclusivo_inmueble_id: params.usoExclusivoInmuebleId ?? null,
        matricula_inmobiliaria: params.matriculaInmobiliaria?.trim() || null,
      })
      .eq('id', params.id)
    if (errorUpdate) throw errorUpdate

    await cargarZonasComunes(params.tenantId)
  }

  /** Solo se puede borrar de verdad si no tiene asignación — no hay FK que lo
   * impida (uso_exclusivo_inmueble_id es `on delete set null` del lado del
   * inmueble, no al revés), así que la regla se aplica aquí antes de pedirlo:
   * borrar un bien todavía asignado dejaría a un inmueble "usando" algo que
   * ya no existe. Para retirar un bien en uso está `activa`. */
  async function eliminarZonaComun(id: string, tenantId: string): Promise<void> {
    const cliente = useSupabaseClient<Database>()
    const { error: errorDelete } = await cliente.from('zonas_comunes').delete().eq('id', id)
    if (errorDelete) throw errorDelete

    await cargarZonasComunes(tenantId)
  }

  function limpiar(): void {
    zonasComunes.value = []
    tiposZonaComun.value = []
  }

  return {
    zonasComunes,
    tiposZonaComun,
    loading,
    tipoPorId,
    cargarTiposZonaComun,
    cargarZonasComunes,
    crearZonaComun,
    actualizarZonaComun,
    eliminarZonaComun,
    limpiar,
  }
})
