/**
 * GOB-1 §4: órganos de gobierno, sus atribuciones y sus miembros.
 */
import { defineStore } from 'pinia'
import type { Database } from '@aquila/shared'

type OrganoRow = Database['public']['Tables']['gobierno_organos']['Row']
type OrganoInsert = Database['public']['Tables']['gobierno_organos']['Insert']
type AtribucionRow = Database['public']['Tables']['gobierno_atribucion']['Row']
type AtribucionInsert = Database['public']['Tables']['gobierno_atribucion']['Insert']
type MiembroRow = Database['public']['Tables']['gobierno_miembros']['Row']
type MiembroInsert = Database['public']['Tables']['gobierno_miembros']['Insert']
type ObligatoriedadRow = Database['public']['Functions']['gobierno_obligatoriedad_faltante']['Returns'][number]

export interface OrganoConTipo extends OrganoRow {
  tipo: { codigo: string; nombre: string } | null
}
export interface AtribucionConDetalle extends AtribucionRow {
  atribucion: { codigo: string; nombre: string } | null
}
export interface MiembroConDetalle extends MiembroRow {
  rol: { codigo: string; nombre: string } | null
  tercero: { nombre_completo: string; numero_documento: string } | null
}

export const useGobiernoOrganosStore = defineStore('gobiernoOrganos', () => {
  const organos = shallowRef<OrganoConTipo[]>([])
  const atribuciones = shallowRef<AtribucionConDetalle[]>([])
  const miembros = shallowRef<MiembroConDetalle[]>([])
  const obligatoriedad = shallowRef<ObligatoriedadRow[]>([])
  const loading = ref(false)
  const guardando = ref(false)

  // Carga TODO de una vez (órganos + atribuciones + miembros + obligatoriedad) — una
  // copropiedad tiene pocos órganos y pocos miembros, así que el panel de alertas puede
  // calcularse sobre el conjunto completo sin un drill-down por órgano.
  async function cargarOrganos(tenantId: string): Promise<void> {
    loading.value = true
    try {
      const cliente = useSupabaseClient<Database>()
      const [
        { data: organosFilas, error: errOrganos },
        { data: atribucionesFilas, error: errAtrib },
        { data: miembrosFilas, error: errMiembros },
        { data: obligatoriedadFilas, error: errObl },
      ] = await Promise.all([
        cliente
          .from('gobierno_organos')
          .select('*, tipo:tipo_id(codigo, nombre)')
          .eq('tenant_id', tenantId)
          .order('created_at', { ascending: false }),
        cliente
          .from('gobierno_atribucion')
          .select('*, atribucion:atribucion_id(codigo, nombre)')
          .eq('tenant_id', tenantId)
          .order('vigente_desde', { ascending: false }),
        cliente
          .from('gobierno_miembros')
          .select('*, rol:rol_id(codigo, nombre), tercero:tercero_id(nombre_completo, numero_documento)')
          .eq('tenant_id', tenantId)
          .order('desde', { ascending: false }),
        cliente.rpc('gobierno_obligatoriedad_faltante', { p_tenant_id: tenantId }),
      ])
      if (errOrganos) throw errOrganos
      if (errAtrib) throw errAtrib
      if (errMiembros) throw errMiembros
      if (errObl) throw errObl
      organos.value = (organosFilas ?? []) as OrganoConTipo[]
      atribuciones.value = (atribucionesFilas ?? []) as AtribucionConDetalle[]
      miembros.value = (miembrosFilas ?? []) as MiembroConDetalle[]
      obligatoriedad.value = obligatoriedadFilas ?? []
    } finally {
      loading.value = false
    }
  }

  async function crearOrgano(fila: OrganoInsert): Promise<OrganoRow> {
    guardando.value = true
    try {
      const cliente = useSupabaseClient<Database>()
      const { data, error } = await cliente.from('gobierno_organos').insert(fila).select('*').single()
      if (error) throw error
      await cargarOrganos(fila.tenant_id)
      return data
    } finally {
      guardando.value = false
    }
  }

  // D-85: termina el órgano Y, en la misma transacción (fn_gobierno_organo_terminar), cierra a
  // sus miembros y atribuciones que seguían vigentes — nadie queda "vigente" en un órgano que ya
  // es historia.
  async function terminarOrgano(
    id: string,
    tenantId: string,
    vigenteHasta: string,
    motivoTerminacion: string,
  ): Promise<void> {
    guardando.value = true
    try {
      const cliente = useSupabaseClient<Database>()
      const { error } = await cliente.rpc('fn_gobierno_organo_terminar', {
        p_organo_id: id,
        p_tenant_id: tenantId,
        p_vigente_hasta: vigenteHasta,
        p_motivo: motivoTerminacion,
      })
      if (error) throw error
      await cargarOrganos(tenantId)
    } finally {
      guardando.value = false
    }
  }

  async function agregarAtribucion(fila: AtribucionInsert): Promise<void> {
    guardando.value = true
    try {
      const cliente = useSupabaseClient<Database>()
      const { error } = await cliente.from('gobierno_atribucion').insert(fila)
      if (error) throw error
      await cargarOrganos(fila.tenant_id)
    } finally {
      guardando.value = false
    }
  }

  async function terminarAtribucion(id: string, tenantId: string, vigenteHasta: string): Promise<void> {
    guardando.value = true
    try {
      const cliente = useSupabaseClient<Database>()
      const { error } = await cliente.from('gobierno_atribucion').update({ vigente_hasta: vigenteHasta }).eq('id', id)
      if (error) throw error
      await cargarOrganos(tenantId)
    } finally {
      guardando.value = false
    }
  }

  async function agregarMiembro(fila: MiembroInsert): Promise<void> {
    guardando.value = true
    try {
      const cliente = useSupabaseClient<Database>()
      const { error } = await cliente.from('gobierno_miembros').insert(fila)
      if (error) throw error
      await cargarOrganos(fila.tenant_id)
    } finally {
      guardando.value = false
    }
  }

  async function terminarMiembro(id: string, tenantId: string, hasta: string): Promise<void> {
    guardando.value = true
    try {
      const cliente = useSupabaseClient<Database>()
      const { error } = await cliente.from('gobierno_miembros').update({ hasta }).eq('id', id)
      if (error) throw error
      await cargarOrganos(tenantId)
    } finally {
      guardando.value = false
    }
  }

  function limpiar(): void {
    organos.value = []
    atribuciones.value = []
    miembros.value = []
    obligatoriedad.value = []
  }

  return {
    organos, atribuciones, miembros, obligatoriedad, loading, guardando,
    cargarOrganos, crearOrgano, terminarOrgano,
    agregarAtribucion, terminarAtribucion, agregarMiembro, terminarMiembro, limpiar,
  }
})
