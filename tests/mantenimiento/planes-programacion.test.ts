/**
 * MANT-3 (20260930820000-20260930880000) — planes de mantenimiento y motor de programación.
 * Ver Casos de uso/Tres Modulos/Mantenimiento/MANT_03_planes_programacion.md.
 *
 * La distinción que ordena el corte: un requisito (MANT-2) dice qué hay que hacer y cada cuánto;
 * un plan dice cómo se organiza el trabajo. La frecuencia legal vive siempre en el requisito —
 * un plan puede ser más exigente, nunca menos (pruebas 1 y 2). El motor de programación encadena
 * la siguiente fecha desde la ejecución REAL, no desde la teórica (prueba 8, D-55).
 */
import { afterAll, describe, expect, it } from 'vitest'
import 'dotenv/config'
import type { Database } from '@aquila/shared'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  clienteAdmin,
  clienteComo,
  crearUsuario,
  eliminarTenant,
  eliminarUsuario,
  leerEntorno,
  RUN_ID,
  type Cliente,
  type UsuarioPrueba,
} from '../rls/helpers.js'

const env = leerEntorno()
const d = env ? describe : describe.skip

if (!env) {
  console.warn('SALTADO tests/mantenimiento/planes-programacion: faltan variables de Supabase en .env')
}

function sumarMeses(fechaIso: string, meses: number): string {
  const fecha = new Date(`${fechaIso}T00:00:00Z`)
  fecha.setUTCMonth(fecha.getUTCMonth() + meses)
  return fecha.toISOString().slice(0, 10)
}

const HOY = new Date().toISOString().slice(0, 10)

d('MANT-3: planes de mantenimiento y motor de programación', () => {
  const admin = clienteAdmin(env!)
  const tenantsCreados: string[] = []
  const usuariosCreados: UsuarioPrueba[] = []

  afterAll(async () => {
    for (const id of tenantsCreados) await eliminarTenant(admin, id)
    for (const usuario of usuariosCreados) await eliminarUsuario(admin, usuario.id)
  }, 60_000)

  async function crearTenantCompleto(etiqueta: string): Promise<{ tenantId: string; cliente: Cliente }> {
    const usuario = await crearUsuario(admin, etiqueta)
    usuariosCreados.push(usuario)
    const cliente = await clienteComo(env!, usuario)
    const { data: tenant, error } = await cliente
      .rpc('create_tenant', { p_name: `MANT-3 ${etiqueta}`, p_slug: `t-${RUN_ID}-${etiqueta}` })
      .single<{ id: string }>()
    if (error) throw new Error(`create_tenant (${etiqueta}): ${error.message}`)
    tenantsCreados.push(tenant.id)
    return { tenantId: tenant.id, cliente }
  }

  async function idListaTipos(tipo: string, codigo: string): Promise<number> {
    const { data, error } = await admin
      .from('lista_tipos').select('id').eq('tipo', tipo).eq('codigo', codigo).is('tenant_id', null)
      .single<{ id: number }>()
    if (error) throw new Error(`fixture lista_tipos ${tipo}.${codigo}: ${error.message}`)
    return data.id
  }

  type ActivoEstado = Database['public']['Tables']['activos']['Insert']['estado']

  async function crearActivoMinimo(
    tenantId: string, codigo: string, tipoId: number, categoriaId: number,
    estado: ActivoEstado = 'en_servicio',
  ): Promise<string> {
    const { data, error } = await admin
      .from('activos')
      .insert({
        tenant_id: tenantId, codigo, nombre: codigo, categoria_id: categoriaId, tipo_id: tipoId,
        naturaleza_bien: 'bien_propio', origen: 'comprado', estado,
      })
      .select('id').single<{ id: string }>()
    if (error) throw new Error(`fixture activo ${codigo}: ${error.message}`)
    return data.id
  }

  async function requisitoPorCodigo(tenantId: string, codigo: string) {
    const { data, error } = await admin
      .from('mant_requisito').select('*').eq('tenant_id', tenantId).eq('codigo', codigo).single()
    if (error) throw new Error(`fixture requisito ${codigo}: ${error.message}`)
    return data
  }

  type PlanInsert = Database['public']['Tables']['mant_planes']['Insert']

  async function crearPlan(
    cliente: Cliente, tenantId: string, codigo: string, overrides: Partial<PlanInsert>,
  ) {
    const tipoMantId = await idListaTipos('TIPO_MANTENIMIENTO', 'preventivo')
    const base: PlanInsert = {
      tenant_id: tenantId, codigo, nombre: codigo,
      tipo_mantenimiento_id: tipoMantId,
      alcance: 'categoria', frecuencia_meses: 6, frecuencia_origen: 'propia',
      ventana_dias: 15, horizonte_meses: 6,
      ...overrides,
    }
    return await cliente.from('mant_planes').insert(base).select('*').single()
  }

  async function agregarTarea(tenantId: string, planId: string, orden: number, descripcion: string) {
    const { error } = await admin
      .from('mant_plan_tareas')
      .insert({ tenant_id: tenantId, plan_id: planId, orden, descripcion })
    if (error) throw new Error(`fixture tarea ${descripcion}: ${error.message}`)
  }

  it('1. un plan derivado de un requisito no admite frecuencia mayor que la exigida', async () => {
    const { tenantId, cliente } = await crearTenantCompleto('frecuencia-mayor')
    const requisito = await requisitoPorCodigo(tenantId, 'TANQUE_LAVADO') // frecuencia_meses = 6
    const tipoActivoId = await idListaTipos('TIPO_ACTIVO', 'tanque')
    const { error } = await crearPlan(cliente, tenantId, 'PLAN-FRECUENCIA-MAYOR', {
      requisito_id: requisito.id, alcance: 'tipo_activo', alcance_tipo_activo_id: tipoActivoId,
      frecuencia_meses: 12, frecuencia_origen: 'heredada_requisito',
    })
    expect(error?.message).toContain('PLAN_FRECUENCIA_INFERIOR_A_EXIGIDA')
    // Cita la norma, no solo el número — el usuario debe ver que no es una preferencia del sistema.
    expect(error?.message).toContain('Decreto 1575')
  }, 20_000)

  it('2. un plan puede tener frecuencia menor que la exigida: se acepta', async () => {
    const { tenantId, cliente } = await crearTenantCompleto('frecuencia-menor')
    const requisito = await requisitoPorCodigo(tenantId, 'TANQUE_LAVADO') // frecuencia_meses = 6
    const tipoActivoId = await idListaTipos('TIPO_ACTIVO', 'tanque')
    const { data, error } = await crearPlan(cliente, tenantId, 'PLAN-FRECUENCIA-MENOR', {
      requisito_id: requisito.id, alcance: 'tipo_activo', alcance_tipo_activo_id: tipoActivoId,
      frecuencia_meses: 3, frecuencia_origen: 'heredada_requisito',
    })
    expect(error).toBeNull()
    expect(data?.id).toBeTruthy()
  }, 20_000)

  it('3. activar un plan sin tareas falla con PLAN_SIN_TAREAS', async () => {
    const { tenantId, cliente } = await crearTenantCompleto('sin-tareas')
    const categoriaId = await idListaTipos('CATEGORIA_ACTIVO', 'obra_civil')
    const { data: plan, error: errCrear } = await crearPlan(cliente, tenantId, 'PLAN-SIN-TAREAS', {
      alcance: 'categoria', alcance_categoria_id: categoriaId,
    })
    expect(errCrear).toBeNull()
    const { error } = await cliente.rpc('fn_mant_activar_plan', { p_plan_id: plan!.id })
    expect(error?.message).toContain('PLAN_SIN_TAREAS')
  }, 20_000)

  it('4. ventana_dias mayor que la frecuencia falla con PLAN_VENTANA_INVALIDA', async () => {
    const { tenantId, cliente } = await crearTenantCompleto('ventana-invalida')
    const categoriaId = await idListaTipos('CATEGORIA_ACTIVO', 'obra_civil')
    const { error } = await crearPlan(cliente, tenantId, 'PLAN-VENTANA-INVALIDA', {
      alcance: 'categoria', alcance_categoria_id: categoriaId,
      frecuencia_meses: 1, ventana_dias: 31, // 1 mes ≈ 30 días
    })
    expect(error?.message).toContain('PLAN_VENTANA_INVALIDA')
  }, 20_000)

  it('5. la generación de programaciones es idempotente: dos corridas no duplican', async () => {
    const { tenantId, cliente } = await crearTenantCompleto('idempotente')
    const tipoId = await idListaTipos('TIPO_ACTIVO', 'extintor')
    const categoriaId = await idListaTipos('CATEGORIA_ACTIVO', 'seguridad')
    const activoId = await crearActivoMinimo(tenantId, `EXT-${RUN_ID}`, tipoId, categoriaId)
    const { data: plan } = await crearPlan(cliente, tenantId, 'PLAN-IDEMPOTENTE', {
      alcance: 'activo', alcance_activo_id: activoId, frecuencia_meses: 1, horizonte_meses: 3, ventana_dias: 5,
    })
    await agregarTarea(tenantId, plan!.id, 1, 'Revisar carga y sello')
    await cliente.rpc('fn_mant_activar_plan', { p_plan_id: plan!.id })

    const { count: antes } = await admin.from('mant_programaciones').select('id', { count: 'exact', head: true }).eq('plan_id', plan!.id)
    await cliente.rpc('fn_mant_generar_programaciones', { p_plan_id: plan!.id })
    const { count: despues } = await admin.from('mant_programaciones').select('id', { count: 'exact', head: true }).eq('plan_id', plan!.id)
    expect(despues).toBe(antes)
    expect(antes).toBeGreaterThan(0)
  }, 20_000)

  it('6. al activar un plan no se generan programaciones con fecha pasada', async () => {
    const { tenantId, cliente } = await crearTenantCompleto('no-pasado')
    const tipoId = await idListaTipos('TIPO_ACTIVO', 'extintor')
    const categoriaId = await idListaTipos('CATEGORIA_ACTIVO', 'seguridad')
    const activoId = await crearActivoMinimo(tenantId, `EXT-${RUN_ID}`, tipoId, categoriaId)
    const { data: plan } = await crearPlan(cliente, tenantId, 'PLAN-NO-PASADO', {
      alcance: 'activo', alcance_activo_id: activoId, frecuencia_meses: 1, horizonte_meses: 3, ventana_dias: 5,
    })
    await agregarTarea(tenantId, plan!.id, 1, 'Revisar carga y sello')
    await cliente.rpc('fn_mant_activar_plan', { p_plan_id: plan!.id })

    const { data: filas, error } = await admin
      .from('mant_programaciones').select('fecha_programada').eq('plan_id', plan!.id)
    expect(error).toBeNull()
    for (const fila of filas ?? []) {
      expect(fila.fecha_programada >= HOY).toBe(true)
    }
  }, 20_000)

  it('7. el horizonte acota: no se generan programaciones más allá del parámetro', async () => {
    const { tenantId, cliente } = await crearTenantCompleto('horizonte')
    const tipoId = await idListaTipos('TIPO_ACTIVO', 'extintor')
    const categoriaId = await idListaTipos('CATEGORIA_ACTIVO', 'seguridad')
    const activoId = await crearActivoMinimo(tenantId, `EXT-${RUN_ID}`, tipoId, categoriaId)
    const { data: plan } = await crearPlan(cliente, tenantId, 'PLAN-HORIZONTE', {
      alcance: 'activo', alcance_activo_id: activoId, frecuencia_meses: 1, horizonte_meses: 6, ventana_dias: 5,
    })
    await agregarTarea(tenantId, plan!.id, 1, 'Revisar carga y sello')
    await cliente.rpc('fn_mant_activar_plan', { p_plan_id: plan!.id })

    const { data: filas, error } = await admin
      .from('mant_programaciones').select('fecha_programada').eq('plan_id', plan!.id)
      .order('fecha_programada', { ascending: false })
    expect(error).toBeNull()
    expect(filas?.length).toBe(6)
    const horizonteHasta = sumarMeses(HOY, 6)
    expect((filas![0] as { fecha_programada: string }).fecha_programada <= horizonteHasta).toBe(true)
  }, 20_000)

  it('8. cerrar una OT con retraso desplaza la siguiente programación desde la fecha real, no la programada', async () => {
    const { tenantId, cliente } = await crearTenantCompleto('encadenamiento-real')
    const tipoId = await idListaTipos('TIPO_ACTIVO', 'extintor')
    const categoriaId = await idListaTipos('CATEGORIA_ACTIVO', 'seguridad')
    const activoId = await crearActivoMinimo(tenantId, `EXT-${RUN_ID}`, tipoId, categoriaId)
    const { data: plan } = await crearPlan(cliente, tenantId, 'PLAN-ENCADENAMIENTO', {
      alcance: 'activo', alcance_activo_id: activoId, frecuencia_meses: 1, horizonte_meses: 1, ventana_dias: 5,
      encadenar_desde_ejecucion_real: true,
    })
    await agregarTarea(tenantId, plan!.id, 1, 'Revisar carga y sello')
    await cliente.rpc('fn_mant_activar_plan', { p_plan_id: plan!.id })

    // Con horizonte 1 mes solo debe existir una programación: la de +1 mes.
    const { data: iniciales } = await admin
      .from('mant_programaciones').select('id, fecha_programada').eq('plan_id', plan!.id)
    expect(iniciales?.length).toBe(1)
    const primeraFecha = (iniciales![0] as { fecha_programada: string }).fecha_programada
    const fechaRealEjecucion = sumarMeses(HOY, 2) // ejecutada un mes tarde
    const fechaSiNoEncadenaraDesdeReal = sumarMeses(primeraFecha, 1)

    // MANT-4 agregó la FK real de orden_trabajo_id (20260930970000) — un placeholder inventado
    // ya no basta, hace falta una OT real para simular el cierre que MANT-4 hace de verdad.
    const tipoMantId = await idListaTipos('TIPO_MANTENIMIENTO', 'correctivo')
    const { data: otSimulada } = await admin.from('mant_ordenes_trabajo').insert({
      tenant_id: tenantId, activo_id: activoId, tipo_mantenimiento_id: tipoMantId, origen: 'manual',
      titulo: 'OT simulada para encadenamiento',
    }).select('id').single<{ id: string }>()

    const { error: errCerrar } = await admin.from('mant_programaciones').update({
      estado: 'generada', generada_at: `${fechaRealEjecucion}T00:00:00Z`, orden_trabajo_id: otSimulada!.id,
    }).eq('id', (iniciales![0] as { id: string }).id)
    expect(errCerrar).toBeNull()

    // Amplía el horizonte para que la siguiente programación quepa, y vuelve a generar.
    await admin.from('mant_planes').update({ horizonte_meses: 3 }).eq('id', plan!.id)
    await cliente.rpc('fn_mant_generar_programaciones', { p_plan_id: plan!.id })

    const { data: siguientes } = await admin
      .from('mant_programaciones').select('fecha_programada').eq('plan_id', plan!.id).eq('estado', 'pendiente')
    const fechas = (siguientes ?? []).map((f) => f.fecha_programada)
    expect(fechas).toContain(sumarMeses(fechaRealEjecucion, 1))
    expect(fechas).not.toContain(fechaSiNoEncadenaraDesdeReal)
  }, 20_000)

  it('9. un activo fuera_de_servicio no genera programaciones nuevas y las pendientes quedan omitidas, no borradas', async () => {
    const { tenantId, cliente } = await crearTenantCompleto('fuera-de-servicio')
    const tipoId = await idListaTipos('TIPO_ACTIVO', 'extintor')
    const categoriaId = await idListaTipos('CATEGORIA_ACTIVO', 'seguridad')
    const activoId = await crearActivoMinimo(tenantId, `EXT-${RUN_ID}`, tipoId, categoriaId)
    const { data: plan } = await crearPlan(cliente, tenantId, 'PLAN-FUERA-SERVICIO', {
      alcance: 'activo', alcance_activo_id: activoId, frecuencia_meses: 1, horizonte_meses: 3, ventana_dias: 5,
    })
    await agregarTarea(tenantId, plan!.id, 1, 'Revisar carga y sello')
    await cliente.rpc('fn_mant_activar_plan', { p_plan_id: plan!.id })

    const { count: antes } = await admin.from('mant_programaciones').select('id', { count: 'exact', head: true }).eq('plan_id', plan!.id)
    expect(antes).toBe(3)

    await admin.from('activos').update({ estado: 'fuera_de_servicio' }).eq('id', activoId)
    await cliente.rpc('fn_mant_generar_programaciones', { p_plan_id: plan!.id })

    const { data: filas, count: total } = await admin
      .from('mant_programaciones').select('estado, omitida_motivo', { count: 'exact' }).eq('plan_id', plan!.id)
    expect(total).toBe(3) // ninguna se borró
    for (const fila of filas ?? []) {
      expect((fila as { estado: string }).estado).toBe('omitida')
      expect((fila as { omitida_motivo: string | null }).omitida_motivo).toContain('fuera_de_servicio')
    }
  }, 20_000)

  it('10. mant_cobertura_requisitos detecta un requisito aplicable sin plan que lo cubra', async () => {
    const { tenantId, cliente } = await crearTenantCompleto('cobertura-hueco')
    const tipoAscensorId = await idListaTipos('TIPO_ACTIVO', 'ascensor')
    const categoriaId = await idListaTipos('CATEGORIA_ACTIVO', 'transporte_vertical')
    const activoId = await crearActivoMinimo(tenantId, `ASC-${RUN_ID}`, tipoAscensorId, categoriaId)
    const requisito = await requisitoPorCodigo(tenantId, 'ASCENSOR_REVISION_ANUAL')

    const { data, error } = await cliente.rpc('mant_cobertura_requisitos', { p_tenant_id: tenantId })
    expect(error).toBeNull()
    const fila = (data ?? []).find(
      (f) => f.requisito_id === requisito.id && f.activo_id === activoId,
    )
    expect(fila).toBeDefined()
    expect(fila?.cubierto).toBe(false)
    expect(fila?.plan_id).toBeNull()
  }, 20_000)

  it('11. la corrida usa el scheduler existente (pg_cron); no hay uno nuevo', async () => {
    const { data, error } = await admin.rpc('mant_diagnostico_cron_job_existe', {
      p_jobname: 'mant-generar-programaciones-diario',
    })
    expect(error).toBeNull()
    expect(data).toBe(true)
  }, 20_000)

  it('12. aislamiento entre tenants: un plan de otro tenant no es visible ni referenciable', async () => {
    const { tenantId: tenantA, cliente: clienteA } = await crearTenantCompleto('aislar-a')
    const { tenantId: tenantB, cliente: clienteB } = await crearTenantCompleto('aislar-b')
    const categoriaId = await idListaTipos('CATEGORIA_ACTIVO', 'obra_civil')
    const { data: planA } = await crearPlan(clienteA, tenantA, 'PLAN-AISLAR', {
      alcance: 'categoria', alcance_categoria_id: categoriaId,
    })

    const { data: visibleDesdeB, error: errSelect } = await clienteB.from('mant_planes').select('id').eq('id', planA!.id)
    expect(errSelect).toBeNull()
    expect(visibleDesdeB ?? []).toHaveLength(0)

    const requisitoB = await requisitoPorCodigo(tenantB, 'TANQUE_LAVADO')
    const { error: errCruce } = await admin.from('mant_planes').insert({
      tenant_id: tenantA, codigo: 'PLAN-CRUCE', nombre: 'PLAN-CRUCE',
      tipo_mantenimiento_id: await idListaTipos('TIPO_MANTENIMIENTO', 'preventivo'),
      requisito_id: requisitoB.id, alcance: 'categoria', alcance_categoria_id: categoriaId,
      frecuencia_meses: 6, frecuencia_origen: 'propia', ventana_dias: 10, horizonte_meses: 6,
    })
    expect(errCruce?.message).toContain('PLAN_TENANT_INCONSISTENTE')
  }, 20_000)

  it('13. los tres enums nuevos del corte tienen COMMENT ON TYPE (D-24)', () => {
    const migracion = readFileSync(
      join(import.meta.dirname, '..', '..', 'supabase', 'migrations', '20260930830000_mant3_planes.sql'),
      'utf-8',
    )
    for (const enumNombre of ['plan_alcance_t', 'plan_frecuencia_origen_t']) {
      expect(migracion).toContain(`create type public.${enumNombre}`)
      expect(migracion).toContain(`comment on type public.${enumNombre}`)
    }
    const migracionProgramaciones = readFileSync(
      join(import.meta.dirname, '..', '..', 'supabase', 'migrations', '20260930850000_mant3_programaciones.sql'),
      'utf-8',
    )
    expect(migracionProgramaciones).toContain('create type public.programacion_estado_t')
    expect(migracionProgramaciones).toContain('comment on type public.programacion_estado_t')
  })
})
