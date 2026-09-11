/**
 * MANT-8 (20260932400000-20260932430000) — indicadores y tendencias de mantenimiento.
 * Ver Casos de uso/Tres Modulos/Mantenimiento/MANT_08_indicadores_tendencias.md.
 *
 * Decisión aprobada frente al mockup del corte (ver cabecera de
 * 20260932420000_mant8_indicadores_financieros.sql): el módulo de Presupuesto solo tiene
 * Presupuestado/Ejecutado (no "Comprometido"/"Disponible" a nivel de cuenta/tenant) —
 * mant_indicador_financiero_presupuesto es un passthrough exacto de presupuesto_cuenta_ejecucion
 * (prueba 3, la central); "Comprometido" es una función APARTE (costo_estimado de OT abiertas,
 * etiquetada estimado) que la prueba 4 excluye a propósito de la verificación estructural.
 */
import { afterAll, describe, expect, it } from 'vitest'
import 'dotenv/config'
import { Client } from 'pg'
import type { Database } from '@aquila/shared'
import {
  clienteAdmin,
  eliminarTenant,
  eliminarUsuario,
  crearUsuario,
  clienteComo,
  leerEntorno,
  RUN_ID,
  type Cliente,
  type UsuarioPrueba,
} from '../rls/helpers.js'

const env = leerEntorno()
const d = env ? describe : describe.skip
if (!env) {
  console.warn('SALTADO tests/mantenimiento/indicadores: faltan variables de Supabase en .env')
}

const dbUrl = process.env.SUPABASE_DB_URL
const dPg = dbUrl ? describe : describe.skip
if (!dbUrl) {
  console.warn('SALTADO las pruebas estructurales de indicadores: falta SUPABASE_DB_URL en .env')
}

type OtInsert = Database['public']['Tables']['mant_ordenes_trabajo']['Insert']

d('MANT-8: indicadores y tendencias de mantenimiento', () => {
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
      .rpc('create_tenant', { p_name: `MANT-8 ${etiqueta}`, p_slug: `t8-${RUN_ID}-${etiqueta}` })
      .single<{ id: string }>()
    if (error) throw new Error(`create_tenant (${etiqueta}): ${error.message}`)
    tenantsCreados.push(tenant.id)
    return { tenantId: tenant.id, cliente }
  }

  async function idListaTipos(tipo: string, codigo: string): Promise<number> {
    const { data, error } = await admin
      .from('lista_tipos')
      .select('id')
      .eq('tipo', tipo)
      .eq('codigo', codigo)
      .is('tenant_id', null)
      .single<{ id: number }>()
    if (error) throw new Error(`fixture lista_tipos ${tipo}.${codigo}: ${error.message}`)
    return data.id
  }

  async function crearActivoMinimo(tenantId: string, codigo: string): Promise<string> {
    const tipoId = await idListaTipos('TIPO_ACTIVO', 'otro')
    const categoriaId = await idListaTipos('CATEGORIA_ACTIVO', 'otros')
    const { data, error } = await admin
      .from('activos')
      .insert({
        tenant_id: tenantId, codigo, nombre: codigo, categoria_id: categoriaId, tipo_id: tipoId,
        naturaleza_bien: 'bien_propio', origen: 'comprado', estado: 'en_servicio',
      })
      .select('id')
      .single<{ id: string }>()
    if (error) throw new Error(`fixture activo ${codigo}: ${error.message}`)
    return data.id
  }

  async function registrarTransicionEstado(
    tenantId: string,
    activoId: string,
    estadoNuevo: Database['public']['Enums']['activo_estado_t'],
    createdAtIso: string,
  ): Promise<void> {
    const { error } = await admin.from('activo_estado_historial').insert({
      tenant_id: tenantId, activo_id: activoId, estado_nuevo: estadoNuevo, created_at: createdAtIso,
    })
    if (error) throw new Error(`fixture activo_estado_historial: ${error.message}`)
  }

  async function crearIncidencia(tenantId: string, activoId: string, reportadaAtIso: string): Promise<string> {
    const tipoId = await idListaTipos('TIPO_INCIDENCIA', 'falla')
    const origenId = await idListaTipos('ORIGEN_REPORTE', 'vigilancia')
    const { data, error } = await admin
      .from('mant_incidencias')
      .insert({
        tenant_id: tenantId, activo_id: activoId, tipo_id: tipoId, origen_id: origenId,
        titulo: 'Incidencia de prueba', reportada_at: reportadaAtIso,
      })
      .select('id')
      .single<{ id: string }>()
    if (error) throw new Error(`fixture incidencia: ${error.message}`)
    return data.id
  }

  async function crearOtCerradaParaIncidencia(
    tenantId: string,
    activoId: string,
    incidenciaId: string,
    cerradaAtIso: string,
    overrides: Partial<OtInsert> = {},
  ): Promise<string> {
    const tipoMantId = await idListaTipos('TIPO_MANTENIMIENTO', 'correctivo')
    const { data, error } = await admin
      .from('mant_ordenes_trabajo')
      .insert({
        tenant_id: tenantId, activo_id: activoId, tipo_mantenimiento_id: tipoMantId,
        titulo: 'OT de prueba', origen: 'incidencia', incidencia_id: incidenciaId,
        estado: 'cerrada', cerrada_at: cerradaAtIso,
        ...overrides,
      })
      .select('id')
      .single<{ id: string }>()
    if (error) throw new Error(`fixture OT cerrada: ${error.message}`)
    const { error: errVinculo } = await admin
      .from('mant_incidencias')
      .update({ orden_trabajo_id: data.id })
      .eq('id', incidenciaId)
    if (errVinculo) throw new Error(`fixture vincular incidencia→OT: ${errVinculo.message}`)
    return data.id
  }

  async function crearPeriodo(tenantId: string, anio: number, mes: number): Promise<string> {
    const { data, error } = await admin
      .from('periodos')
      .insert({ tenant_id: tenantId, anio, mes, estado: 'abierto' })
      .select('id')
      .single<{ id: string }>()
    if (error) throw new Error(`fixture periodo: ${error.message}`)
    return data.id
  }

  async function crearPresupuesto(tenantId: string, anio: number, montoTotal: number): Promise<string> {
    const { data, error } = await admin
      .from('presupuestos')
      .insert({ tenant_id: tenantId, anio, version: 1, monto_total: montoTotal })
      .select('id')
      .single<{ id: string }>()
    if (error) throw new Error(`fixture presupuesto: ${error.message}`)
    return data.id
  }

  async function unaHojaEgreso(tenantId: string): Promise<string> {
    const { data, error } = await admin
      .from('presupuesto_cuenta')
      .select('id, contable_cuenta:contable_cuenta_id!inner(requiere_tercero)')
      .eq('tenant_id', tenantId)
      .eq('naturaleza', 'egreso')
      .eq('es_hoja', true)
      .eq('activa', true)
      .eq('contable_cuenta.requiere_tercero', false)
      .limit(1)
      .single<{ id: string }>()
    if (error) throw new Error(`fixture hoja egreso: ${error.message}`)
    return data.id
  }

  async function registrarEjecucion(
    tenantId: string,
    cuentaId: string,
    periodoId: string,
    monto: number,
    fechaDocumento: string,
    activoId?: string,
  ): Promise<void> {
    const { error } = await admin.from('presupuesto_ejecucion').insert({
      tenant_id: tenantId, cuenta_id: cuentaId, periodo_id: periodoId, monto,
      liquidacion: 'pagado_caja', fecha_documento: fechaDocumento, activo_id: activoId ?? null,
    })
    if (error) throw new Error(`fixture presupuesto_ejecucion: ${error.message}`)
  }

  async function requisitoPorCodigo(tenantId: string, codigo: string) {
    const { data, error } = await admin
      .from('mant_requisito')
      .select('*')
      .eq('tenant_id', tenantId)
      .eq('codigo', codigo)
      .single()
    if (error) throw new Error(`fixture requisito ${codigo}: ${error.message}`)
    return data
  }

  it('1. MTTR, MTBF y disponibilidad dan los valores esperados sobre datos sembrados y verificados a mano', async () => {
    const { tenantId } = await crearTenantCompleto('mttr-mtbf-disp')
    const activoId = await crearActivoMinimo(tenantId, `ACT-${RUN_ID}-1`)

    // MTTR: dos incidencias, 48h y 24h de resolución → promedio 36h.
    const inc1 = await crearIncidencia(tenantId, activoId, '2027-01-01T00:00:00Z')
    await crearOtCerradaParaIncidencia(tenantId, activoId, inc1, '2027-01-03T00:00:00Z')
    const inc2 = await crearIncidencia(tenantId, activoId, '2027-02-01T00:00:00Z')
    await crearOtCerradaParaIncidencia(tenantId, activoId, inc2, '2027-02-02T00:00:00Z')

    const { data: mttr, error: errMttr } = await admin
      .rpc('mant_indicador_mttr', { p_tenant_id: tenantId, p_desde: '2027-01-01', p_hasta: '2027-02-28' })
      .single()
    if (errMttr) throw errMttr
    expect(mttr.muestras).toBe(2)
    expect(mttr.mttr_horas).toBeCloseTo(36, 1)

    // MTBF: fallas el 1 ene y el 1 feb → 31 días (744h) de separación, una sola muestra.
    const { data: mtbf, error: errMtbf } = await admin
      .rpc('mant_indicador_mtbf', { p_tenant_id: tenantId, p_activo_id: activoId, p_desde: '2027-01-01', p_hasta: '2027-02-28' })
      .single()
    if (errMtbf) throw errMtbf
    expect(mtbf.fallas).toBe(2)
    expect(mtbf.mtbf_horas).toBeCloseTo(31 * 24, 1)

    // Disponibilidad de enero: en_servicio [1-10) y [15-1feb) = 9+17 = 26 de 31 días.
    await registrarTransicionEstado(tenantId, activoId, 'en_servicio', '2027-01-01T00:00:00Z')
    await registrarTransicionEstado(tenantId, activoId, 'en_mantenimiento', '2027-01-10T00:00:00Z')
    await registrarTransicionEstado(tenantId, activoId, 'en_servicio', '2027-01-15T00:00:00Z')

    const { data: disp, error: errDisp } = await admin
      .rpc('mant_indicador_disponibilidad', { p_tenant_id: tenantId, p_activo_id: activoId, p_desde: '2027-01-01', p_hasta: '2027-01-31' })
      .single()
    if (errDisp) throw errDisp
    expect(disp.disponibilidad_pct).toBeCloseTo((26 / 31) * 100, 1)
  }, 30_000)

  dPg('estructural: comment on function en cada indicador', () => {
    it('2. todas las funciones de indicador tienen comment on function con su definición', async () => {
      const funciones = [
        'mant_indicador_mttr', 'mant_indicador_mtbf', 'mant_indicador_disponibilidad',
        'mant_activo_estado_en', 'mant_indicador_cumplimiento_plan', 'mant_indicador_ot_a_tiempo',
        'mant_indicador_proporcion_mantenimiento', 'mant_indicador_cumplimiento_normativo',
        'mant_indicador_hallazgos_criticos', 'mant_indicador_habilitaciones_vencidas',
        'mant_indicador_financiero_presupuesto', 'mant_indicador_comprometido_estimado',
        'mant_indicador_costo_m2', 'mant_tendencia_fallas',
      ]
      const client = new Client({ connectionString: dbUrl })
      await client.connect()
      try {
        for (const nombre of funciones) {
          const { rows } = await client.query<{ definicion: string | null }>(
            `select obj_description(p.oid, 'pg_proc') as definicion
             from pg_proc p join pg_namespace n on n.oid = p.pronamespace
             where n.nspname = 'public' and p.proname = $1
             limit 1`,
            [nombre],
          )
          expect(rows, `función ${nombre} no existe`).toHaveLength(1)
          expect(rows[0]!.definicion, `${nombre} sin comment on function`).toBeTruthy()
          expect(rows[0]!.definicion!.length, `${nombre}: comentario demasiado corto`).toBeGreaterThan(20)
        }
      } finally {
        await client.end()
      }
    }, 30_000)
  })

  it('3. las cifras financieras coinciden EXACTAMENTE con presupuesto_cuenta_ejecucion (módulo de Presupuesto)', async () => {
    const { tenantId } = await crearTenantCompleto('financiero-exacto')
    const anio: number = 2027
    const presupuestoId = await crearPresupuesto(tenantId, anio, 10_000_000)
    const periodoId = await crearPeriodo(tenantId, anio, 3)
    const hoja = await unaHojaEgreso(tenantId)
    await registrarEjecucion(tenantId, hoja, periodoId, 250_000, `${String(anio)}-03-10`)
    await registrarEjecucion(tenantId, hoja, periodoId, 75_000, `${String(anio)}-03-20`)

    const { data: esperado, error: errEsperado } = await admin.rpc('presupuesto_cuenta_ejecucion', {
      p_presupuesto_id: presupuestoId,
    })
    if (errEsperado) throw errEsperado
    const { data: real, error: errReal } = await admin.rpc('mant_indicador_financiero_presupuesto', {
      p_tenant_id: tenantId, p_presupuesto_id: presupuestoId, p_cuenta_id: hoja,
    })
    if (errReal) throw errReal

    const filaEsperada = esperado.find((f) => f.cuenta_id === hoja)
    const filaReal = real.find((f) => f.cuenta_id === hoja)
    expect(filaReal, 'mant_indicador_financiero_presupuesto no devolvió la cuenta esperada').toBeTruthy()
    expect(filaReal!.ejecutado).toBe(325_000)
    expect(filaReal!.ejecutado).toBe(filaEsperada!.ejecutado)
    expect(filaReal!.presupuestado).toBe(filaEsperada!.presupuestado)
  }, 30_000)

  dPg('estructural: indicadores financieros leen presupuesto_ejecucion, no tablas de mantenimiento', () => {
    it('4. mant_indicador_financiero_presupuesto y mant_indicador_costo_m2 no consultan mant_* para el importe', async () => {
      const client = new Client({ connectionString: dbUrl })
      await client.connect()
      try {
        for (const nombre of ['mant_indicador_financiero_presupuesto', 'mant_indicador_costo_m2']) {
          const { rows } = await client.query<{ definicion: string }>(
            `select pg_get_functiondef(p.oid) as definicion
             from pg_proc p join pg_namespace n on n.oid = p.pronamespace
             where n.nspname = 'public' and p.proname = $1`,
            [nombre],
          )
          expect(rows).toHaveLength(1)
          const def = rows[0]!.definicion.toLowerCase()
          expect(def).not.toContain('mant_ordenes_trabajo')
          expect(def).not.toContain('mant_incidencias')
          expect(def).not.toContain('costo_estimado')
        }
        // mant_indicador_comprometido_estimado es la EXCEPCIÓN aprobada — a propósito no se
        // verifica aquí, su fuente es costo_estimado de OT abiertas (ver cabecera del archivo).
      } finally {
        await client.end()
      }
    }, 30_000)
  })

  it('5. con menos observaciones que el umbral, mant_tendencia_fallas devuelve datos_insuficientes', async () => {
    const { tenantId } = await crearTenantCompleto('tendencia-insuficiente')
    const activoId = await crearActivoMinimo(tenantId, `ACT-${RUN_ID}-5`)
    // Una sola falla en toda la serie, umbral por defecto = 3.
    await crearIncidencia(tenantId, activoId, new Date().toISOString())

    const { data, error } = await admin.rpc('mant_tendencia_fallas', {
      p_tenant_id: tenantId, p_activo_id: activoId, p_ventanas: 3,
    })
    if (error) throw error
    expect(data.length).toBe(3)
    for (const fila of data) expect(fila.tendencia).toBe('datos_insuficientes')
  }, 30_000)

  it('6. con una serie creciente clara, mant_tendencia_fallas devuelve creciente con las cifras de respaldo', async () => {
    const { tenantId } = await crearTenantCompleto('tendencia-creciente')
    const activoId = await crearActivoMinimo(tenantId, `ACT-${RUN_ID}-6`)
    const hoy = new Date()
    function haceDias(dias: number): string {
      const d2 = new Date(hoy)
      d2.setDate(d2.getDate() - dias)
      return d2.toISOString()
    }
    // Ventana 1 (0-90 días atrás): 5 fallas. Ventana 2 (90-180 atrás): 1 falla. Crecimiento claro.
    for (let i = 0; i < 5; i++) await crearIncidencia(tenantId, activoId, haceDias(10 + i))
    await crearIncidencia(tenantId, activoId, haceDias(100))

    const { data, error } = await admin.rpc('mant_tendencia_fallas', {
      p_tenant_id: tenantId, p_activo_id: activoId, p_ventanas: 2,
    })
    if (error) throw error
    expect(data[0]!.fallas).toBe(5)
    expect(data[1]!.fallas).toBe(1)
    expect(data[0]!.tendencia).toBe('creciente')
    expect(data[0]!.variacion_pct).toBe(400)
  }, 30_000)

  it('7. TENDENCIA_VENTANAS_INSUFICIENTES si p_ventanas < 2', async () => {
    const { tenantId } = await crearTenantCompleto('tendencia-ventanas-invalidas')
    const activoId = await crearActivoMinimo(tenantId, `ACT-${RUN_ID}-7`)
    const { error } = await admin.rpc('mant_tendencia_fallas', {
      p_tenant_id: tenantId, p_activo_id: activoId, p_ventanas: 1,
    })
    expect(error?.message).toContain('TENDENCIA_VENTANAS_INSUFICIENTES')
  }, 20_000)

  dPg('estructural: ningún indicador persistido', () => {
    it('7b. ninguna tabla ni vista materializada respalda un indicador de MANT-8', async () => {
      const client = new Client({ connectionString: dbUrl })
      await client.connect()
      try {
        const { rows } = await client.query<{ nombre: string }>(`
          select table_name as nombre from information_schema.tables
          where table_schema = 'public' and (table_name ilike '%indicador%' or table_name ilike '%tendencia_falla%')
          union all
          select matviewname as nombre from pg_matviews
          where schemaname = 'public' and (matviewname ilike '%indicador%' or matviewname ilike '%tendencia_falla%')
        `)
        expect(rows).toHaveLength(0)
      } finally {
        await client.end()
      }
    }, 30_000)
  })

  it('8. el cumplimiento del plan no penaliza programaciones omitidas por activo fuera de servicio', async () => {
    const { tenantId } = await crearTenantCompleto('cumplimiento-plan-omitidas')
    const activoId = await crearActivoMinimo(tenantId, `ACT-${RUN_ID}-8`)
    const tipoMantId = await idListaTipos('TIPO_MANTENIMIENTO', 'preventivo')
    const { data: plan, error: errPlan } = await admin
      .from('mant_planes')
      .insert({
        tenant_id: tenantId, codigo: `PLAN-${RUN_ID}-8`, nombre: 'Plan 8', tipo_mantenimiento_id: tipoMantId,
        alcance: 'activo', alcance_activo_id: activoId,
        frecuencia_meses: 1, frecuencia_origen: 'propia', ventana_dias: 10, horizonte_meses: 3,
      })
      .select('id')
      .single<{ id: string }>()
    if (errPlan) throw new Error(`fixture plan: ${errPlan.message}`)

    // El activo pasa a fuera de servicio ANTES de la fecha programada.
    await registrarTransicionEstado(tenantId, activoId, 'fuera_de_servicio', '2027-03-01T00:00:00Z')

    // Programación 1: omitida porque el activo estaba fuera de servicio — no debe penalizar.
    const { error: errProg1 } = await admin.from('mant_programaciones').insert({
      tenant_id: tenantId, plan_id: plan.id, activo_id: activoId,
      fecha_programada: '2027-03-05', ventana_hasta: '2027-03-10', estado: 'omitida',
      omitida_motivo: 'Activo fuera de servicio en la fecha programada.',
    })
    if (errProg1) throw new Error(`fixture programación omitida: ${errProg1.message}`)

    // Programación 2: generada (cumplida) — sí cuenta.
    const { error: errProg2 } = await admin.from('mant_programaciones').insert({
      tenant_id: tenantId, plan_id: plan.id, activo_id: activoId,
      fecha_programada: '2027-04-05', ventana_hasta: '2027-04-10', estado: 'generada',
      generada_at: '2027-04-06T00:00:00Z',
    })
    if (errProg2) throw new Error(`fixture programación generada: ${errProg2.message}`)

    const { data, error } = await admin
      .rpc('mant_indicador_cumplimiento_plan', { p_tenant_id: tenantId, p_desde: '2027-03-01', p_hasta: '2027-04-30' })
      .single()
    if (error) throw error
    expect(data.excluidas_activo_no_disponible).toBe(1)
    expect(data.programadas).toBe(1)
    expect(data.ejecutadas).toBe(1)
    expect(data.pct).toBe(100)
  }, 30_000)

  it('9. el cumplimiento normativo coincide con mant_estado_cumplimiento (MANT-2)', async () => {
    const { tenantId } = await crearTenantCompleto('cumplimiento-normativo-coincide')
    const req = await requisitoPorCodigo(tenantId, 'TANQUE_LAVADO')
    await admin.from('mant_cumplimiento').insert({
      tenant_id: tenantId, requisito_id: req.id, fecha_cumplimiento: '2026-01-15',
      evidencia_referencia: 'https://ejemplo.com/analisis-agua.pdf',
    })

    const { data: base, error: errBase } = await admin.rpc('mant_estado_cumplimiento', { p_tenant_id: tenantId })
    if (errBase) throw errBase
    const esperado = new Map<string, number>()
    for (const fila of base) esperado.set(fila.estado, (esperado.get(fila.estado) ?? 0) + 1)

    const { data: real, error: errReal } = await admin.rpc('mant_indicador_cumplimiento_normativo', {
      p_tenant_id: tenantId,
    })
    if (errReal) throw errReal
    const realMapa = new Map(real.map((f) => [f.estado, f.cantidad]))
    expect(realMapa).toEqual(esperado)
  }, 30_000)

  it('10. aislamiento entre tenants: los indicadores de un tenant no ven datos de otro', async () => {
    const { tenantId: tenantA } = await crearTenantCompleto('aislar-a')
    const { tenantId: tenantB } = await crearTenantCompleto('aislar-b')
    const activoA = await crearActivoMinimo(tenantA, `ACT-${RUN_ID}-A`)
    const incA = await crearIncidencia(tenantA, activoA, '2027-01-01T00:00:00Z')
    await crearOtCerradaParaIncidencia(tenantA, activoA, incA, '2027-01-02T00:00:00Z')

    const { data: mttrB, error } = await admin
      .rpc('mant_indicador_mttr', { p_tenant_id: tenantB, p_desde: '2027-01-01', p_hasta: '2027-01-31' })
      .single()
    if (error) throw error
    expect(mttrB.muestras).toBe(0)
    expect(mttrB.mttr_horas).toBeNull()

    const { data: costosB, error: errCostos } = await admin.rpc('mant_costos', {
      p_tenant_id: tenantB, p_desde: '2027-01-01', p_hasta: '2027-01-31',
    })
    if (errCostos) throw errCostos
    expect(costosB).toHaveLength(0)
  }, 30_000)
})
