/**
 * Mantenimiento → Activos, Fase 1 (Registro Maestro) — D-88. Cubre
 * `mant_activos_listado`, la única pieza de backend nueva que este corte
 * agregó (todo lo demás — RLS + guards de MANT-0/MANT-1 — ya existía).
 *
 * El punto central a probar no es "trae los datos" sino "nunca lanza": a
 * diferencia de `mant_criticidad(activo_id)` (MANT-1), que **lanza**
 * `CRITICIDAD_EVALUACION_INCOMPLETA`/`CRITICIDAD_SIN_SET_VIGENTE` cuando al
 * activo le falta una evaluación, esta función debe devolver
 * `criticidad_banda = null` para ese activo y seguir listando el resto —
 * es exactamente el problema de N+1 + fragilidad que motivó crearla (ver
 * comentario de la migración 20260934030000).
 */
import { afterAll, describe, expect, it } from 'vitest'
import 'dotenv/config'
import type { Database } from '@aquila/shared'
import {
  clienteAdmin,
  clienteComo,
  crearMembership,
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
  console.warn('SALTADO tests/mantenimiento/activos-listado: faltan variables de Supabase en .env')
}

type FilaListado = Database['public']['Functions']['mant_activos_listado']['Returns'][number]

d('Mantenimiento → Activos, Fase 1: mant_activos_listado (D-88)', () => {
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
      .rpc('create_tenant', { p_name: `MANT-LISTADO ${etiqueta}`, p_slug: `t-${RUN_ID}-${etiqueta}` })
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

  type ActivoInsert = Database['public']['Tables']['activos']['Insert']
  async function crearActivo(
    tenantId: string, codigo: string, overrides: Partial<ActivoInsert> = {},
  ): Promise<string> {
    const tipoId = await idListaTipos('TIPO_ACTIVO', 'ascensor')
    const categoriaId = await idListaTipos('CATEGORIA_ACTIVO', 'transporte_vertical')
    const { data, error } = await admin
      .from('activos')
      .insert({
        tenant_id: tenantId, codigo, nombre: codigo, categoria_id: categoriaId, tipo_id: tipoId,
        naturaleza_bien: 'bien_propio', origen: 'comprado', ...overrides,
      })
      .select('id')
      .single<{ id: string }>()
    if (error) throw new Error(`fixture activo ${codigo}: ${error.message}`)
    return data.id
  }

  async function listado(cliente: Cliente, tenantId: string): Promise<FilaListado[]> {
    const { data, error } = await cliente.rpc('mant_activos_listado', { p_tenant_id: tenantId })
    if (error) throw new Error(`mant_activos_listado: ${error.message}`)
    return data
  }

  async function crearSetCriticidad(tenantId: string, version: number): Promise<string> {
    const { data, error } = await admin
      .from('mant_criticidad_set').insert({ tenant_id: tenantId, version }).select('id').single<{ id: string }>()
    if (error) throw new Error(`fixture set criticidad: ${error.message}`)
    return data.id
  }

  async function crearCriterio(
    tenantId: string, setId: string, codigo: string, peso: number, escala: Record<string, number>,
  ): Promise<string> {
    const { data, error } = await admin
      .from('mant_criticidad_criterio')
      .insert({ tenant_id: tenantId, set_id: setId, codigo, nombre: codigo, peso, escala })
      .select('id')
      .single<{ id: string }>()
    if (error) throw new Error(`fixture criterio ${codigo}: ${error.message}`)
    return data.id
  }

  async function evaluar(tenantId: string, activoId: string, criterioId: string, valor: string): Promise<void> {
    const { error } = await admin
      .from('mant_activo_criticidad')
      .upsert(
        { tenant_id: tenantId, activo_id: activoId, criterio_id: criterioId, valor },
        { onConflict: 'activo_id,criterio_id' },
      )
    if (error) throw new Error(`evaluar criterio ${criterioId}: ${error.message}`)
  }

  it('1. un tenant sin activos devuelve un arreglo vacío, sin error', async () => {
    const { tenantId, cliente } = await crearTenantCompleto('vacio')
    const filas = await listado(cliente, tenantId)
    expect(filas).toEqual([])
  }, 20_000)

  it('2. resuelve categoria_nombre/tipo_nombre y usa ubicacion_detalle sin agrupación ni zona', async () => {
    const { tenantId, cliente } = await crearTenantCompleto('nombres')
    const activoId = await crearActivo(tenantId, 'ASC-01', { ubicacion_detalle: 'Torre B - Sótano' })
    const [fila] = await listado(cliente, tenantId)
    expect(fila?.id).toBe(activoId)
    expect(fila?.categoria_nombre).toBe('Transporte vertical')
    expect(fila?.tipo_nombre).toBe('Ascensor')
    expect(fila?.ubicacion).toBe('Torre B - Sótano')
    expect(fila?.criticidad_banda).toBeNull()
    expect(fila?.valor_neto).toBeNull()
    expect(fila?.ultimo_mantenimiento).toBeNull()
    expect(fila?.proximo_mantenimiento).toBeNull()
  }, 20_000)

  it('3. la ubicación prioriza "agrupación · zona" sobre ubicacion_detalle cuando existen', async () => {
    const { tenantId, cliente } = await crearTenantCompleto('ubicacion')
    const tipoAgrupacionId = await idListaTipos('AGRUPACION_PREDIOS', 'torre')
    const { data: agrupacion, error: errAg } = await admin
      .from('agrupaciones')
      .insert({ tenant_id: tenantId, tipo_id: tipoAgrupacionId, nombre: 'A' })
      .select('id')
      .single<{ id: string }>()
    if (errAg) throw new Error(`fixture agrupación: ${errAg.message}`)
    const tipoZonaId = await idListaTipos('TIPO_ZONA_COMUN', 'transito')
    const { data: zona, error: errZona } = await admin
      .from('zonas_comunes')
      .insert({ tenant_id: tenantId, codigo: 'ZC-01', nombre: 'Lobby principal', tipo_id: tipoZonaId })
      .select('id')
      .single<{ id: string }>()
    if (errZona) throw new Error(`fixture zona común: ${errZona.message}`)

    const activoId = await crearActivo(tenantId, 'ASC-02', {
      ubicacion_detalle: 'Este texto no debe verse', agrupacion_id: agrupacion.id, zona_comun_id: zona.id,
    })
    const filas = await listado(cliente, tenantId)
    const fila = filas.find((f) => f.id === activoId)
    expect(fila?.ubicacion).toBe('A · Lobby principal')
  }, 20_000)

  it('4. valor_neto viene tal cual de mant_ppe_por_activo (no se recalcula) para un activo capitalizado', async () => {
    const { tenantId, cliente } = await crearTenantCompleto('valor-neto')
    const cuenta1505 = await (async () => {
      const { data, error } = await admin.from('contable_cuenta').select('id').eq('tenant_id', tenantId).eq('codigo', '1505').single<{ id: string }>()
      if (error) throw new Error(`cuenta 1505: ${error.message}`)
      return data.id
    })()
    // fecha_adquisicion en el pasado (no en el futuro): mant_activos_listado usa current_date
    // como corte fijo, así que el activo debe estar ya en curso de depreciación hoy.
    const activoId = await crearActivo(tenantId, 'ASC-03', {
      capitalizado: true, valor_adquisicion: 1_200_000, fecha_adquisicion: '2020-01-05',
      contable_cuenta_id: cuenta1505, vida_util_meses: 12, metodo_depreciacion: 'linea_recta',
    })

    const { data: ppeHoy, error: errPpe } = await admin.rpc('mant_ppe_por_activo', {
      p_tenant_id: tenantId, p_fecha_corte: new Date().toISOString().slice(0, 10),
    })
    if (errPpe) throw errPpe
    const esperado = ppeHoy.find((f) => f.activo_id === activoId)
    expect(esperado).toBeDefined()

    const filas = await listado(cliente, tenantId)
    const fila = filas.find((f) => f.id === activoId)
    expect(fila?.capitalizado).toBe(true)
    expect(fila?.valor_neto).toBe(esperado?.valor_neto)
  }, 30_000)

  it('5. con un set vigente pero evaluación incompleta, criticidad_banda es null (no lanza)', async () => {
    const { tenantId, cliente } = await crearTenantCompleto('criticidad-incompleta')
    const activoId = await crearActivo(tenantId, 'ASC-04')
    const setId = await crearSetCriticidad(tenantId, 1)
    const seguridadId = await crearCriterio(tenantId, setId, 'seguridad', 60, { alto: 100 })
    await crearCriterio(tenantId, setId, 'costo', 40, { bajo: 20 }) // segundo criterio, sin evaluar
    await admin.from('mant_criticidad_banda').insert({
      tenant_id: tenantId, set_id: setId, etiqueta: 'alto', puntaje_desde: 0, puntaje_hasta: null, orden: 10,
    })
    await admin.from('mant_criticidad_set').update({ estado: 'vigente' }).eq('id', setId)
    await evaluar(tenantId, activoId, seguridadId, 'alto') // solo 1 de 2 criterios evaluado

    // Control: mant_criticidad(activo_id) SÍ lanza para este mismo activo — confirma que el
    // problema que mant_activos_listado evita es real, no hipotético.
    const { error: errDirecto } = await admin.rpc('mant_criticidad', { p_activo_id: activoId }).single()
    expect(errDirecto?.message).toContain('CRITICIDAD_EVALUACION_INCOMPLETA')

    const filas = await listado(cliente, tenantId)
    const fila = filas.find((f) => f.id === activoId)
    expect(fila).toBeDefined()
    expect(fila?.criticidad_banda).toBeNull()
  }, 20_000)

  it('6. con la evaluación completa, criticidad_banda resuelve la misma banda que mant_criticidad', async () => {
    const { tenantId, cliente } = await crearTenantCompleto('criticidad-completa')
    const activoId = await crearActivo(tenantId, 'ASC-05')
    const setId = await crearSetCriticidad(tenantId, 1)
    const seguridadId = await crearCriterio(tenantId, setId, 'seguridad', 60, { alto: 100 })
    const costoId = await crearCriterio(tenantId, setId, 'costo', 40, { bajo: 20 })
    await admin.from('mant_criticidad_banda').insert([
      { tenant_id: tenantId, set_id: setId, etiqueta: 'bajo', puntaje_desde: 0, puntaje_hasta: 59.99, orden: 10 },
      { tenant_id: tenantId, set_id: setId, etiqueta: 'alto', puntaje_desde: 60, puntaje_hasta: null, orden: 20 },
    ])
    await admin.from('mant_criticidad_set').update({ estado: 'vigente' }).eq('id', setId)
    await evaluar(tenantId, activoId, seguridadId, 'alto')
    await evaluar(tenantId, activoId, costoId, 'bajo')
    // 60%*100 + 40%*20 = 68 → banda 'alto', igual que la prueba 6 de atributos-criticidad.test.ts

    const { data: directo, error } = await admin.rpc('mant_criticidad', { p_activo_id: activoId }).single<{ banda: string }>()
    if (error) throw error

    const filas = await listado(cliente, tenantId)
    const fila = filas.find((f) => f.id === activoId)
    expect(fila?.criticidad_banda).toBe(directo.banda)
    expect(fila?.criticidad_banda).toBe('alto')
  }, 20_000)

  it('7. ultimo_mantenimiento es MAX(cerrada_at) de las OT del activo, e ignora las que no están cerradas', async () => {
    const { tenantId, cliente } = await crearTenantCompleto('ultimo-mantenimiento')
    const activoId = await crearActivo(tenantId, 'ASC-06')
    const tipoMantId = await idListaTipos('TIPO_MANTENIMIENTO', 'correctivo')

    // fn_mant_cerrar_ot siempre pone cerrada_at = now() (OT_CERRADA_INMUTABLE bloquea tocarlo
    // después) — p_fecha_cierre solo alimenta mant_cumplimiento/el encadenamiento de
    // programaciones, no esta columna. Por eso la prueba no fija una fecha arbitraria: cierra
    // dos OT de verdad y compara contra el mismo MAX(cerrada_at) leído directamente.
    async function crearOtCerrada(): Promise<void> {
      const { data: ot, error } = await cliente
        .from('mant_ordenes_trabajo')
        .insert({ tenant_id: tenantId, activo_id: activoId, tipo_mantenimiento_id: tipoMantId, titulo: 'OT', origen: 'manual' })
        .select('id')
        .single<{ id: string }>()
      if (error) throw new Error(`fixture OT: ${error.message}`)
      for (const estado of ['programada', 'asignada', 'en_ejecucion', 'ejecutada'] as const) {
        const patch: Database['public']['Tables']['mant_ordenes_trabajo']['Update'] = { estado }
        if (estado === 'ejecutada') patch.ejecutada_at = new Date().toISOString()
        const { error: errAvanzar } = await admin.from('mant_ordenes_trabajo').update(patch).eq('id', ot.id)
        if (errAvanzar) throw new Error(`avanzar OT a ${estado}: ${errAvanzar.message}`)
      }
      const { error: errCerrar } = await admin.rpc('fn_mant_cerrar_ot', { p_ot_id: ot.id })
      if (errCerrar) throw new Error(`cerrar OT: ${errCerrar.message}`)
    }

    await crearOtCerrada()
    await crearOtCerrada()

    // Una OT abierta (no cerrada) no debe alterar el resultado.
    await cliente.from('mant_ordenes_trabajo').insert({
      tenant_id: tenantId, activo_id: activoId, tipo_mantenimiento_id: tipoMantId, titulo: 'OT abierta', origen: 'manual',
    })

    const { data: cerradas, error: errCerradas } = await admin
      .from('mant_ordenes_trabajo')
      .select('cerrada_at')
      .eq('activo_id', activoId)
      .not('cerrada_at', 'is', null)
    if (errCerradas) throw errCerradas
    const maxEsperado = cerradas
      .map((f) => f.cerrada_at)
      .sort()
      .at(-1)!
      .slice(0, 10)

    const filas = await listado(cliente, tenantId)
    const fila = filas.find((f) => f.id === activoId)
    expect(fila?.ultimo_mantenimiento).toBe(maxEsperado)
  }, 30_000)

  it('8. proximo_mantenimiento es la fecha programada pendiente más próxima de un plan activo', async () => {
    const { tenantId, cliente } = await crearTenantCompleto('proximo-mantenimiento')
    const activoId = await crearActivo(tenantId, 'ASC-07')
    const tipoMantId = await idListaTipos('TIPO_MANTENIMIENTO', 'preventivo')
    const { data: plan, error: errPlan } = await cliente
      .from('mant_planes')
      .insert({
        tenant_id: tenantId, codigo: 'PLAN-PROXIMO', nombre: 'PLAN-PROXIMO', tipo_mantenimiento_id: tipoMantId,
        alcance: 'activo', alcance_activo_id: activoId, frecuencia_meses: 1, frecuencia_origen: 'propia',
        ventana_dias: 5, horizonte_meses: 3,
      })
      .select('id')
      .single<{ id: string }>()
    if (errPlan) throw new Error(`fixture plan: ${errPlan.message}`)
    const { error: errTarea } = await admin
      .from('mant_plan_tareas')
      .insert({ tenant_id: tenantId, plan_id: plan.id, orden: 1, descripcion: 'Revisión periódica' })
    if (errTarea) throw new Error(`fixture tarea: ${errTarea.message}`)
    const { error: errActivar } = await cliente.rpc('fn_mant_activar_plan', { p_plan_id: plan.id })
    if (errActivar) throw new Error(`activar plan: ${errActivar.message}`)

    const { data: pendientes, error: errPend } = await admin
      .from('mant_programaciones')
      .select('fecha_programada')
      .eq('plan_id', plan.id)
      .eq('estado', 'pendiente')
      .order('fecha_programada')
    if (errPend) throw errPend
    expect(pendientes.length).toBeGreaterThan(0)
    const masProxima = pendientes[0]!.fecha_programada

    const filas = await listado(cliente, tenantId)
    const fila = filas.find((f) => f.id === activoId)
    expect(fila?.proximo_mantenimiento).toBe(masProxima)
  }, 30_000)

  it('9. aislamiento entre tenants: un activo de otro tenant no aparece en el listado', async () => {
    const { tenantId: tenantA } = await crearTenantCompleto('aislamiento-a')
    const { tenantId: tenantB, cliente: clienteB } = await crearTenantCompleto('aislamiento-b')
    await crearActivo(tenantA, 'ASC-A')
    const activoB = await crearActivo(tenantB, 'ASC-B')

    const filasVistasPorB = await listado(clienteB, tenantA)
    expect(filasVistasPorB).toEqual([])

    const filasPropias = await listado(clienteB, tenantB)
    expect(filasPropias.map((f) => f.id)).toEqual([activoB])
  }, 20_000)

  it('10. un auditor (solo lectura) ve el listado igual que el administrador — is_member, no un rol específico', async () => {
    const { tenantId, cliente: clienteAdministrador } = await crearTenantCompleto('auditor')
    const activoId = await crearActivo(tenantId, 'ASC-08')

    const usuarioAuditor = await crearUsuario(admin, 'auditor-listado')
    usuariosCreados.push(usuarioAuditor)
    await crearMembership(admin, tenantId, usuarioAuditor.id, 'auditor')
    const clienteAuditor = await clienteComo(env!, usuarioAuditor)

    const filasAdmin = await listado(clienteAdministrador, tenantId)
    const filasAuditor = await listado(clienteAuditor, tenantId)
    expect(filasAuditor.map((f) => f.id)).toEqual(filasAdmin.map((f) => f.id))
    expect(filasAuditor.map((f) => f.id)).toEqual([activoId])
  }, 20_000)
})
