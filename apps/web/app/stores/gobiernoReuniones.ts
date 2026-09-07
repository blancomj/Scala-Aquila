/**
 * GOB-2 §4: reunión, convocatoria, asistencia y poderes. No calcula quórum ni votación (GOB-3) —
 * solo registra los insumos.
 */
import { defineStore } from 'pinia'
import type { Database } from '@aquila/shared'

type ReunionRow = Database['public']['Tables']['gobierno_reuniones']['Row']
type ReunionInsert = Database['public']['Tables']['gobierno_reuniones']['Insert']
type ConvocatoriaInsert = Database['public']['Tables']['gobierno_convocatorias']['Insert']
// orden_del_dia_congelado es jsonb (tipo Json recursivo) — traerlo revienta tsc con "Type
// instantiation is excessively deep" (mismo problema ya documentado en stores/certificaciones.ts).
// La vista de detalle solo necesita saber que la convocatoria existe y cuándo se emitió.
type ConvocatoriaResumen = Pick<
  Database['public']['Tables']['gobierno_convocatorias']['Row'],
  'id' | 'tenant_id' | 'reunion_id' | 'emitida_por' | 'emitida_at' | 'fecha_limite_respuesta' | 'documento_id'
>
type ConvocatoriaEnvioInsert = Database['public']['Tables']['gobierno_convocatoria_envios']['Insert']
type AgendaPuntoRow = Database['public']['Tables']['gobierno_agenda_puntos']['Row']
type AgendaPuntoInsert = Database['public']['Tables']['gobierno_agenda_puntos']['Insert']
type AsistenciaRow = Database['public']['Tables']['gobierno_asistencia']['Row']
type AsistenciaInsert = Database['public']['Tables']['gobierno_asistencia']['Insert']
type PoderRow = Database['public']['Tables']['gobierno_poderes']['Row']
type PoderInsert = Database['public']['Tables']['gobierno_poderes']['Insert']

export interface ReunionConDetalle extends ReunionRow {
  organo: { id: string; nombre: string | null; tipo: { codigo: string; nombre: string } | null } | null
  tipo: { codigo: string; nombre: string } | null
}
export interface AgendaPuntoConDetalle extends AgendaPuntoRow {
  atribucion: { codigo: string; nombre: string } | null
}
export interface AsistenciaConDetalle extends AsistenciaRow {
  inmueble: { codigo: string } | null
  asistente: { nombre_completo: string; numero_documento: string } | null
}
export interface PoderConDetalle extends PoderRow {
  inmueble: { codigo: string } | null
  otorgante: { nombre_completo: string } | null
  apoderado: { nombre_completo: string } | null
}

export const useGobiernoReunionesStore = defineStore('gobiernoReuniones', () => {
  const reuniones = shallowRef<ReunionConDetalle[]>([])
  const convocatoria = ref<ConvocatoriaResumen | null>(null)
  const envios = shallowRef<Database['public']['Tables']['gobierno_convocatoria_envios']['Row'][]>([])
  const agenda = shallowRef<AgendaPuntoConDetalle[]>([])
  const asistencia = shallowRef<AsistenciaConDetalle[]>([])
  const poderes = shallowRef<PoderConDetalle[]>([])
  const coeficienteActual = ref(0)
  const loading = ref(false)
  const guardando = ref(false)

  async function cargarReuniones(tenantId: string): Promise<void> {
    loading.value = true
    try {
      const cliente = useSupabaseClient<Database>()
      const { data, error } = await cliente
        .from('gobierno_reuniones')
        .select('*, organo:organo_id(id, nombre, tipo:tipo_id(codigo, nombre)), tipo:tipo_id(codigo, nombre)')
        .eq('tenant_id', tenantId)
        .order('fecha_hora', { ascending: false })
      if (error) throw error
      reuniones.value = (data ?? []) as ReunionConDetalle[]
    } finally {
      loading.value = false
    }
  }

  async function cargarDetalle(reunionId: string): Promise<void> {
    loading.value = true
    try {
      // Secuencial, no Promise.all: combinar estas cinco consultas (una con maybeSingle(), dos
      // con joins anidados, una rpc) en una sola tupla hace que tsc falle con "Type
      // instantiation is excessively deep" — issue conocido de supabase-js con tuplas grandes.
      const cliente = useSupabaseClient<Database>()
      const { data: convocatoriaFila, error: errConv } = await cliente
        .from('gobierno_convocatorias')
        .select('id, tenant_id, reunion_id, emitida_por, emitida_at, fecha_limite_respuesta, documento_id')
        .eq('reunion_id', reunionId)
        .order('emitida_at', { ascending: false }).limit(1).maybeSingle()
      if (errConv) throw errConv
      const { data: agendaFilas, error: errAgenda } = await cliente
        .from('gobierno_agenda_puntos').select('*, atribucion:atribucion_id(codigo, nombre)')
        .eq('reunion_id', reunionId).order('orden', { ascending: true })
      if (errAgenda) throw errAgenda
      const { data: asistenciaFilas, error: errAsist } = await cliente
        .from('gobierno_asistencia')
        .select('*, inmueble:inmueble_id(codigo), asistente:asistente_ref(nombre_completo, numero_documento)')
        .eq('reunion_id', reunionId).order('ingreso_at', { ascending: true })
      if (errAsist) throw errAsist
      const { data: poderesFilas, error: errPoder } = await cliente
        .from('gobierno_poderes')
        .select('*, inmueble:inmueble_id(codigo), otorgante:otorgante_ref(nombre_completo), apoderado:apoderado_ref(nombre_completo)')
        .eq('reunion_id', reunionId).order('created_at', { ascending: false })
      if (errPoder) throw errPoder
      const { data: coeficienteFila, error: errCoef } = await cliente
        .rpc('gobierno_reunion_coeficiente_actual', { p_reunion_id: reunionId })
      if (errCoef) throw errCoef
      convocatoria.value = convocatoriaFila
      agenda.value = (agendaFilas ?? []) as AgendaPuntoConDetalle[]
      asistencia.value = (asistenciaFilas ?? []) as AsistenciaConDetalle[]
      poderes.value = (poderesFilas ?? []) as PoderConDetalle[]
      coeficienteActual.value = coeficienteFila ?? 0

      if (convocatoria.value) {
        const { data: enviosFilas, error: errEnvios } = await cliente
          .from('gobierno_convocatoria_envios').select('*').eq('convocatoria_id', convocatoria.value.id)
          .order('created_at', { ascending: false })
        if (errEnvios) throw errEnvios
        envios.value = enviosFilas ?? []
      } else {
        envios.value = []
      }
    } finally {
      loading.value = false
    }
  }

  async function crearReunion(fila: ReunionInsert): Promise<ReunionRow> {
    guardando.value = true
    try {
      const cliente = useSupabaseClient<Database>()
      const { data, error } = await cliente.from('gobierno_reuniones').insert(fila).select('*').single()
      if (error) throw error
      await cargarReuniones(fila.tenant_id)
      return data
    } finally {
      guardando.value = false
    }
  }

  async function instalarReunion(
    id: string, tenantId: string, presidenteMiembroId: string, secretarioMiembroId: string,
  ): Promise<void> {
    guardando.value = true
    try {
      const cliente = useSupabaseClient<Database>()
      const { error } = await cliente
        .from('gobierno_reuniones')
        .update({ estado: 'instalada', presidente_miembro_id: presidenteMiembroId, secretario_miembro_id: secretarioMiembroId })
        .eq('id', id)
      if (error) throw error
      await Promise.all([cargarReuniones(tenantId), cargarDetalle(id)])
    } finally {
      guardando.value = false
    }
  }

  async function cerrarReunion(id: string, tenantId: string): Promise<void> {
    guardando.value = true
    try {
      const cliente = useSupabaseClient<Database>()
      const { error } = await cliente.from('gobierno_reuniones').update({ estado: 'cerrada' }).eq('id', id)
      if (error) throw error
      await cargarReuniones(tenantId)
    } finally {
      guardando.value = false
    }
  }

  async function cancelarReunion(id: string, tenantId: string, motivo: string): Promise<void> {
    guardando.value = true
    try {
      const cliente = useSupabaseClient<Database>()
      const { error } = await cliente
        .from('gobierno_reuniones').update({ estado: 'cancelada', cancelada_motivo: motivo }).eq('id', id)
      if (error) throw error
      await cargarReuniones(tenantId)
    } finally {
      guardando.value = false
    }
  }

  async function crearConvocatoria(fila: ConvocatoriaInsert): Promise<void> {
    guardando.value = true
    try {
      const cliente = useSupabaseClient<Database>()
      const { error } = await cliente.from('gobierno_convocatorias').insert(fila)
      if (error) throw error
      await cargarDetalle(fila.reunion_id)
    } finally {
      guardando.value = false
    }
  }

  async function registrarEnvio(fila: ConvocatoriaEnvioInsert, reunionId: string): Promise<void> {
    guardando.value = true
    try {
      const cliente = useSupabaseClient<Database>()
      const { error } = await cliente.from('gobierno_convocatoria_envios').insert(fila)
      if (error) throw error
      await cargarDetalle(reunionId)
    } finally {
      guardando.value = false
    }
  }

  async function marcarAcuseEnvio(id: string, reunionId: string): Promise<void> {
    guardando.value = true
    try {
      const cliente = useSupabaseClient<Database>()
      const { error } = await cliente
        .from('gobierno_convocatoria_envios').update({ acuse_at: new Date().toISOString() }).eq('id', id)
      if (error) throw error
      await cargarDetalle(reunionId)
    } finally {
      guardando.value = false
    }
  }

  async function agregarAgendaPunto(fila: AgendaPuntoInsert): Promise<void> {
    guardando.value = true
    try {
      const cliente = useSupabaseClient<Database>()
      const { error } = await cliente.from('gobierno_agenda_puntos').insert(fila)
      if (error) throw error
      await cargarDetalle(fila.reunion_id)
    } finally {
      guardando.value = false
    }
  }

  async function eliminarAgendaPunto(id: string, reunionId: string): Promise<void> {
    guardando.value = true
    try {
      const cliente = useSupabaseClient<Database>()
      const { error } = await cliente.from('gobierno_agenda_puntos').delete().eq('id', id)
      if (error) throw error
      await cargarDetalle(reunionId)
    } finally {
      guardando.value = false
    }
  }

  async function registrarAsistencia(fila: AsistenciaInsert): Promise<void> {
    guardando.value = true
    try {
      const cliente = useSupabaseClient<Database>()
      const { error } = await cliente.from('gobierno_asistencia').insert(fila)
      if (error) throw error
      await cargarDetalle(fila.reunion_id)
    } finally {
      guardando.value = false
    }
  }

  async function registrarSalida(id: string, reunionId: string): Promise<void> {
    guardando.value = true
    try {
      const cliente = useSupabaseClient<Database>()
      const { error } = await cliente
        .from('gobierno_asistencia').update({ salida_at: new Date().toISOString() }).eq('id', id)
      if (error) throw error
      await cargarDetalle(reunionId)
    } finally {
      guardando.value = false
    }
  }

  async function crearPoder(fila: PoderInsert): Promise<void> {
    guardando.value = true
    try {
      const cliente = useSupabaseClient<Database>()
      const { error } = await cliente.from('gobierno_poderes').insert(fila)
      if (error) throw error
      await cargarDetalle(fila.reunion_id)
    } finally {
      guardando.value = false
    }
  }

  async function validarPoder(id: string, reunionId: string, documentoId: string): Promise<void> {
    guardando.value = true
    try {
      const cliente = useSupabaseClient<Database>()
      const { error } = await cliente
        .from('gobierno_poderes')
        .update({ documento_id: documentoId, validado_at: new Date().toISOString() })
        .eq('id', id)
      if (error) throw error
      await cargarDetalle(reunionId)
    } finally {
      guardando.value = false
    }
  }

  function limpiarDetalle(): void {
    convocatoria.value = null
    envios.value = []
    agenda.value = []
    asistencia.value = []
    poderes.value = []
    coeficienteActual.value = 0
  }

  return {
    reuniones, convocatoria, envios, agenda, asistencia, poderes, coeficienteActual, loading, guardando,
    cargarReuniones, cargarDetalle, crearReunion, instalarReunion, cerrarReunion, cancelarReunion,
    crearConvocatoria, registrarEnvio, marcarAcuseEnvio,
    agregarAgendaPunto, eliminarAgendaPunto, registrarAsistencia, registrarSalida,
    crearPoder, validarPoder, limpiarDetalle,
  }
})
