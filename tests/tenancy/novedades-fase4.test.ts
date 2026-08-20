/**
 * Conceptos avanzados Fase 4 — novedades permanentes y prorrateables en
 * cuotas (supabase/migrations/20260827100000_novedades_permanente_cuotas.sql).
 * Cubre: singleton del concepto "Novedad" por tenant, prorrateable (N cuotas
 * en N periodos distintos), permanente (repite hasta inhabilitarse),
 * idempotencia (mismo periodo dos veces) y los errores de
 * inhabilitar-novedad. No repite lo que ya cubre tests/tenancy/novedades.test.ts
 * (flujo básico crear/aprobar/rechazar de una novedad de una sola vez).
 */
import { afterAll, describe, expect, it } from 'vitest'
import {
  clienteAdmin,
  clienteComo,
  crearMembership,
  crearTenant,
  crearUsuario,
  eliminarTenant,
  eliminarUsuario,
  leerEntorno,
  type Cliente,
  type TenantPrueba,
  type UsuarioPrueba,
} from '../rls/helpers.js'

const env = leerEntorno()
const d = env ? describe : describe.skip

if (!env) {
  console.warn('SALTADO tests/tenancy/novedades-fase4: faltan variables de Supabase en .env')
}

interface RespuestaNovedad {
  id: string
  estado: string
}

async function tipoApartamentoId(admin: Cliente): Promise<number> {
  const { data, error } = await admin
    .from('lista_tipos')
    .select('id')
    .eq('tipo', 'TIPO_INMUEBLE')
    .eq('codigo', 'apartamento')
    .is('tenant_id', null)
    .single<{ id: number }>()
  if (error) throw new Error(`fixture tipo apartamento: ${error.message}`)
  return data.id
}

/** El concepto singleton "Novedad" (tipo_recurrencia='novedad') — creado
 * directo con el cliente admin, igual que CUOTA_ADMIN en
 * tests/tenancy/liquidar-periodo.test.ts, porque ConceptosEditor.vue no
 * forma parte del contrato HTTP que este archivo prueba. */
async function crearConceptoNovedad(admin: Cliente, tenantId: string): Promise<string> {
  const { data, error } = await admin
    .from('conceptos')
    .insert({
      tenant_id: tenantId,
      codigo: 'NOVEDAD',
      nombre: 'Novedad',
      modo_calculo: 'directo',
      modo_valor: 'fijo',
      valor_fijo: 0,
      tipo_recurrencia: 'novedad',
      fecha_inicio_anio: null,
      fecha_inicio_mes: null,
      prioridad: 999,
      estado: 'activo',
      alcance: 'todos',
    })
    .select('id')
    .single<{ id: string }>()
  if (error) throw new Error(`fixture concepto novedad: ${error.message}`)
  return data.id
}

async function crearPeriodo(
  admin: Cliente,
  tenantId: string,
  anio: number,
  mes: number,
): Promise<string> {
  const { data, error } = await admin
    .from('periodos')
    .insert({ tenant_id: tenantId, anio, mes, estado: 'abierto' })
    .select('id')
    .single<{ id: string }>()
  if (error) throw new Error(`fixture periodo ${String(anio)}-${String(mes)}: ${error.message}`)
  return data.id
}

async function contarCargosDeNovedad(admin: Cliente, novedadId: string): Promise<number> {
  const { data, error } = await admin.from('cargos').select('id').eq('novedad_id', novedadId)
  if (error) throw new Error(`contar cargos: ${error.message}`)
  return data.length
}

async function generarCargosPeriodo(
  admin: Cliente,
  tenantId: string,
  periodoId: string,
): Promise<number> {
  const { data, error } = await admin
    .rpc('fn_generar_cargos_novedades_periodo', { p_tenant_id: tenantId, p_periodo_id: periodoId })
    .single<number>()
  if (error) throw new Error(`fn_generar_cargos_novedades_periodo: ${error.message}`)
  return data
}

d('Fase 4: novedades permanentes / prorrateables en cuotas', () => {
  const admin = clienteAdmin(env!)
  let agente: UsuarioPrueba
  let tenant: TenantPrueba
  let clienteAgent: Cliente
  let inmuebleId: string
  let conceptoNovedadId: string
  let periodo1: string
  let periodo2: string
  let periodo3: string
  let periodo4: string

  afterAll(async () => {
    await eliminarTenant(admin, tenant.id)
    await eliminarUsuario(admin, agente.id)
  })

  it('setup', async () => {
    agente = await crearUsuario(admin, 'nov4-agent')
    tenant = await crearTenant(admin, 'nov4', agente.id)
    await crearMembership(admin, tenant.id, agente.id, 'auxiliar')
    clienteAgent = await clienteComo(env!, agente)

    const tipoId = await tipoApartamentoId(admin)
    const { data: inmueble, error: errInmueble } = await admin
      .from('inmuebles')
      .insert({ tenant_id: tenant.id, codigo: `NOV4-${String(Date.now())}`, tipo_id: tipoId })
      .select('id')
      .single<{ id: string }>()
    if (errInmueble) throw new Error(`fixture inmueble: ${errInmueble.message}`)
    inmuebleId = inmueble.id

    conceptoNovedadId = await crearConceptoNovedad(admin, tenant.id)
    periodo1 = await crearPeriodo(admin, tenant.id, 2027, 1)
    periodo2 = await crearPeriodo(admin, tenant.id, 2027, 2)
    periodo3 = await crearPeriodo(admin, tenant.id, 2027, 3)
    periodo4 = await crearPeriodo(admin, tenant.id, 2027, 4)
  }, 30_000)

  it('singleton: un segundo concepto tipo_recurrencia=novedad para el mismo tenant se rechaza', async () => {
    const { error } = await admin.from('conceptos').insert({
      tenant_id: tenant.id,
      codigo: 'NOVEDAD_2',
      nombre: 'Novedad duplicada',
      modo_calculo: 'directo',
      modo_valor: 'fijo',
      valor_fijo: 0,
      tipo_recurrencia: 'novedad',
      fecha_inicio_anio: null,
      fecha_inicio_mes: null,
      prioridad: 999,
      estado: 'activo',
      alcance: 'todos',
    })
    expect(error).not.toBeNull()
    expect(error?.code).toBe('23505')
  }, 30_000)

  it('prorrateable: aprobar pre-puebla 3 cuotas y no genera cargo inmediato', async () => {
    const { data: creada, response } = await clienteAgent.functions.invoke<RespuestaNovedad>(
      'crear-novedad',
      {
        body: {
          inmueble_id: inmuebleId,
          concepto_id: conceptoNovedadId,
          tipo: 'CHARGE',
          monto: 900_000,
          descripcion: 'Reparación en 3 cuotas',
          fecha_efectiva: '2027-01-15',
          prorrateable: true,
          cuotas_totales: 3,
        },
      },
    )
    expect(response?.status).toBe(200)

    const { data: aprobada, response: respAprobar } =
      await clienteAgent.functions.invoke<RespuestaNovedad>('aprobar-novedad', {
        body: { novedad_id: creada!.id },
      })
    expect(respAprobar?.status).toBe(200)
    expect(aprobada?.estado).toBe('aprobada')

    expect(await contarCargosDeNovedad(admin, creada!.id)).toBe(0)

    const { data: cuotas, error } = await admin
      .from('novedad_cuotas')
      .select('numero_cuota, monto_cuota, generada_at')
      .eq('novedad_id', creada!.id)
      .order('numero_cuota')
    expect(error).toBeNull()
    expect(cuotas).toHaveLength(3)
    expect(cuotas?.every((c) => c.generada_at === null)).toBe(true)
    expect(cuotas?.map((c) => c.monto_cuota)).toEqual([300_000, 300_000, 300_000])

    // ── 3 corridas en 3 periodos distintos → exactamente 3 cargos ─────────
    expect(await generarCargosPeriodo(admin, tenant.id, periodo1)).toBe(1)
    expect(await generarCargosPeriodo(admin, tenant.id, periodo2)).toBe(1)
    expect(await generarCargosPeriodo(admin, tenant.id, periodo3)).toBe(1)
    expect(await contarCargosDeNovedad(admin, creada!.id)).toBe(3)

    // 4ta corrida (periodo distinto, sin cuotas pendientes) → 0 nuevos.
    expect(await generarCargosPeriodo(admin, tenant.id, periodo4)).toBe(0)
    expect(await contarCargosDeNovedad(admin, creada!.id)).toBe(3)

    // idempotencia: repetir el mismo periodo ya usado no duplica.
    expect(await generarCargosPeriodo(admin, tenant.id, periodo1)).toBe(0)
    expect(await contarCargosDeNovedad(admin, creada!.id)).toBe(3)
  }, 30_000)

  it('permanente: repite cada periodo hasta inhabilitarse', async () => {
    const { data: creada, response } = await clienteAgent.functions.invoke<RespuestaNovedad>(
      'crear-novedad',
      {
        body: {
          inmueble_id: inmuebleId,
          concepto_id: conceptoNovedadId,
          tipo: 'CHARGE',
          monto: 50_000,
          descripcion: 'Parqueadero adicional',
          fecha_efectiva: '2027-01-15',
          permanente: true,
        },
      },
    )
    expect(response?.status).toBe(200)

    await clienteAgent.functions.invoke('aprobar-novedad', { body: { novedad_id: creada!.id } })
    expect(await contarCargosDeNovedad(admin, creada!.id)).toBe(0)

    expect(await generarCargosPeriodo(admin, tenant.id, periodo1)).toBe(1)
    // mismo periodo otra vez → idempotente, 0 nuevos.
    expect(await generarCargosPeriodo(admin, tenant.id, periodo1)).toBe(0)
    expect(await generarCargosPeriodo(admin, tenant.id, periodo2)).toBe(1)
    expect(await contarCargosDeNovedad(admin, creada!.id)).toBe(2)

    const { data: inhabilitada, response: respInhabilitar } =
      await clienteAgent.functions.invoke<RespuestaNovedad>('inhabilitar-novedad', {
        body: { novedad_id: creada!.id },
      })
    expect(respInhabilitar?.status).toBe(200)
    expect(inhabilitada).not.toBeNull()

    expect(await generarCargosPeriodo(admin, tenant.id, periodo3)).toBe(0)
    expect(await contarCargosDeNovedad(admin, creada!.id)).toBe(2)

    // NOVEDAD_NO_PERMANENTE: nunca fue permanente.
    const { data: creadaUnica } = await clienteAgent.functions.invoke<RespuestaNovedad>(
      'crear-novedad',
      {
        body: {
          inmueble_id: inmuebleId,
          tipo: 'CHARGE',
          monto: 1000,
          descripcion: 'De una sola vez',
          fecha_efectiva: '2027-01-15',
        },
      },
    )
    const { data: dataNoPermanente, response: respNoPermanente } =
      await clienteAgent.functions.invoke<RespuestaNovedad>('inhabilitar-novedad', {
        body: { novedad_id: creadaUnica!.id },
      })
    expect(dataNoPermanente).toBeNull()
    expect(respNoPermanente?.status).toBe(409)

    // NOVEDAD_YA_INHABILITADA: la misma permanente, una segunda vez.
    const { data: dataYaInhabilitada, response: respYaInhabilitada } =
      await clienteAgent.functions.invoke<RespuestaNovedad>('inhabilitar-novedad', {
        body: { novedad_id: creada!.id },
      })
    expect(dataYaInhabilitada).toBeNull()
    expect(respYaInhabilitada?.status).toBe(409)
  }, 30_000)
})
