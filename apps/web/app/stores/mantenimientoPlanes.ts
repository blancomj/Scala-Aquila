/**
 * MANT-3 · Planes de mantenimiento y motor de programación.
 *
 * mant_plan_activos (resolución materializada del alcance) no se expone aquí como estado propio
 * — el store solo necesita el CONTEO para la previsualización (mant_previsualizar_alcance, de
 * solo lectura) y la lista de programaciones ya generadas, que sí trae su activo embebido.
 */
import { defineStore } from 'pinia'
import type { Database } from '@aquila/shared'

type PlanRow = Database['public']['Tables']['mant_planes']['Row']
type PlanInsert = Database['public']['Tables']['mant_planes']['Insert']
type PlanUpdate = Database['public']['Tables']['mant_planes']['Update']
type TareaRow = Database['public']['Tables']['mant_plan_tareas']['Row']
type TareaInsert = Database['public']['Tables']['mant_plan_tareas']['Insert']
type CoberturaRow = Database['public']['Functions']['mant_cobertura_requisitos']['Returns'][number]
type PrevisualizarArgs = Database['public']['Functions']['mant_previsualizar_alcance']['Args']

export interface ProgramacionConNombres {
  id: string
  plan_id: string
  activo_id: string
  fecha_programada: string
  ventana_hasta: string
  estado: Database['public']['Enums']['programacion_estado_t']
  omitida_motivo: string | null
  generada_at: string | null
  orden_trabajo_id: string | null
  mant_planes: { nombre: string } | null
  activos: { nombre: string; codigo: string } | null
}

export const useMantenimientoPlanesStore = defineStore('mantenimientoPlanes', () => {
  const planes = shallowRef<PlanRow[]>([])
  const planActual = ref<PlanRow | null>(null)
  const tareas = shallowRef<TareaRow[]>([])
  const programaciones = shallowRef<ProgramacionConNombres[]>([])
  const cobertura = shallowRef<CoberturaRow[]>([])
  const loading = ref(false)
  const guardando = ref(false)

  async function cargarPlanes(tenantId: string): Promise<void> {
    loading.value = true
    try {
      const cliente = useSupabaseClient<Database>()
      const { data, error } = await cliente
        .from('mant_planes').select('*').eq('tenant_id', tenantId).order('nombre')
      if (error) throw error
      planes.value = data ?? []
    } finally {
      loading.value = false
    }
  }

  async function cargarPlan(tenantId: string, planId: string): Promise<void> {
    loading.value = true
    try {
      const cliente = useSupabaseClient<Database>()
      const [{ data: plan, error: errPlan }, { data: tareasData, error: errTareas }, { data: progData, error: errProg }] =
        await Promise.all([
          cliente.from('mant_planes').select('*').eq('id', planId).single(),
          cliente.from('mant_plan_tareas').select('*').eq('plan_id', planId).order('orden'),
          cliente
            .from('mant_programaciones')
            .select('*, mant_planes(nombre), activos(nombre, codigo)')
            .eq('plan_id', planId)
            .order('fecha_programada'),
        ])
      if (errPlan) throw errPlan
      if (errTareas) throw errTareas
      if (errProg) throw errProg
      planActual.value = plan
      tareas.value = tareasData ?? []
      programaciones.value = (progData ?? []) as unknown as ProgramacionConNombres[]
      void tenantId
    } finally {
      loading.value = false
    }
  }

  /** Próximas programaciones de TODO el tenant, para el calendario del listado (§3.5). */
  /** `activoId` — Fase 5 de mantenimiento de activos (D-92): la Ficha 360° necesita las
   * programaciones de ESTE activo, no las del tenant completo. */
  async function cargarProgramacionesTenant(tenantId: string, activoId?: string): Promise<void> {
    loading.value = true
    try {
      const cliente = useSupabaseClient<Database>()
      let consulta = cliente
        .from('mant_programaciones')
        .select('*, mant_planes(nombre), activos(nombre, codigo)')
        .eq('tenant_id', tenantId)
      if (activoId) consulta = consulta.eq('activo_id', activoId)
      const { data, error } = await consulta.order('fecha_programada')
      if (error) throw error
      programaciones.value = (data ?? []) as unknown as ProgramacionConNombres[]
    } finally {
      loading.value = false
    }
  }

  async function crearPlan(fila: PlanInsert): Promise<PlanRow> {
    guardando.value = true
    try {
      const cliente = useSupabaseClient<Database>()
      const { data, error } = await cliente.from('mant_planes').insert(fila).select('*').single()
      if (error) throw error
      planActual.value = data
      return data
    } finally {
      guardando.value = false
    }
  }

  async function actualizarPlan(id: string, patch: PlanUpdate): Promise<void> {
    guardando.value = true
    try {
      const cliente = useSupabaseClient<Database>()
      const { data, error } = await cliente.from('mant_planes').update(patch).eq('id', id).select('*').single()
      if (error) throw error
      planActual.value = data
    } finally {
      guardando.value = false
    }
  }

  async function agregarTarea(fila: TareaInsert): Promise<void> {
    guardando.value = true
    try {
      const cliente = useSupabaseClient<Database>()
      const { error } = await cliente.from('mant_plan_tareas').insert(fila)
      if (error) throw error
      const { data, error: errRecarga } = await cliente
        .from('mant_plan_tareas').select('*').eq('plan_id', fila.plan_id).order('orden')
      if (errRecarga) throw errRecarga
      tareas.value = data ?? []
    } finally {
      guardando.value = false
    }
  }

  async function eliminarTarea(id: string, planId: string): Promise<void> {
    guardando.value = true
    try {
      const cliente = useSupabaseClient<Database>()
      const { error } = await cliente.from('mant_plan_tareas').delete().eq('id', id)
      if (error) throw error
      const { data, error: errRecarga } = await cliente
        .from('mant_plan_tareas').select('*').eq('plan_id', planId).order('orden')
      if (errRecarga) throw errRecarga
      tareas.value = data ?? []
    } finally {
      guardando.value = false
    }
  }

  /** MANT-3 §3.5: cuántos activos cubriría un alcance ANTES de guardar el plan. */
  async function previsualizarAlcance(args: PrevisualizarArgs): Promise<number> {
    const cliente = useSupabaseClient<Database>()
    const { data, error } = await cliente.rpc('mant_previsualizar_alcance', args)
    if (error) throw error
    return (data ?? []).length
  }

  /** Valida tareas (PLAN_SIN_TAREAS si no hay), resuelve el alcance y genera la primera tanda. */
  async function activarPlan(planId: string): Promise<void> {
    guardando.value = true
    try {
      const cliente = useSupabaseClient<Database>()
      const { error } = await cliente.rpc('fn_mant_activar_plan', { p_plan_id: planId })
      if (error) throw error
      const tenantId = planActual.value?.tenant_id
      if (tenantId) await cargarPlan(tenantId, planId)
    } finally {
      guardando.value = false
    }
  }

  async function generarProgramaciones(planId: string): Promise<void> {
    guardando.value = true
    try {
      const cliente = useSupabaseClient<Database>()
      const { error } = await cliente.rpc('fn_mant_generar_programaciones', { p_plan_id: planId })
      if (error) throw error
      const tenantId = planActual.value?.tenant_id
      if (tenantId) await cargarPlan(tenantId, planId)
    } finally {
      guardando.value = false
    }
  }

  async function omitirProgramacion(id: string, motivo: string, planId: string): Promise<void> {
    guardando.value = true
    try {
      const cliente = useSupabaseClient<Database>()
      const { error } = await cliente
        .from('mant_programaciones').update({ estado: 'omitida', omitida_motivo: motivo }).eq('id', id)
      if (error) throw error
      const tenantId = planActual.value?.tenant_id
      if (tenantId) await cargarPlan(tenantId, planId)
    } finally {
      guardando.value = false
    }
  }

  async function cancelarProgramacion(id: string, planId: string): Promise<void> {
    guardando.value = true
    try {
      const cliente = useSupabaseClient<Database>()
      const { error } = await cliente.from('mant_programaciones').update({ estado: 'cancelada' }).eq('id', id)
      if (error) throw error
      const tenantId = planActual.value?.tenant_id
      if (tenantId) await cargarPlan(tenantId, planId)
    } finally {
      guardando.value = false
    }
  }

  /** MANT-3 §3.4: el hueco que nadie ve — requisitos aplicables sin plan que los cubra. */
  async function cargarCobertura(tenantId: string): Promise<void> {
    loading.value = true
    try {
      const cliente = useSupabaseClient<Database>()
      const { data, error } = await cliente.rpc('mant_cobertura_requisitos', { p_tenant_id: tenantId })
      if (error) throw error
      cobertura.value = data ?? []
    } finally {
      loading.value = false
    }
  }

  function limpiarPlanActual(): void {
    planActual.value = null
    tareas.value = []
    programaciones.value = []
  }

  return {
    planes, planActual, tareas, programaciones, cobertura, loading, guardando,
    cargarPlanes, cargarPlan, cargarProgramacionesTenant, crearPlan, actualizarPlan,
    agregarTarea, eliminarTarea, previsualizarAlcance, activarPlan, generarProgramaciones,
    omitirProgramacion, cancelarProgramacion, cargarCobertura, limpiarPlanActual,
  }
})
