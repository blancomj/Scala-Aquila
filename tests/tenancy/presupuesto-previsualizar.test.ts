/**
 * presupuesto-previsualizar (Edge Function, HTTP real) — GAP-19, E-16 §5
 * fase 5 y REC-003 (reutiliza allocate() de @aquila/financial-kernel, el
 * mismo motor que usa liquidation-engine/executor.ts — no uno nuevo).
 *
 * No persiste nada: solo lectura + cálculo. Cubre el neteo contra
 * fuente_financiacion (tipo='otros_ingresos'), la distribución por
 * coeficiente, y el aislamiento por tenant.
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
  console.warn(
    'SALTADO tests/tenancy/presupuesto-previsualizar: faltan variables de Supabase en .env',
  )
}

interface RespuestaPrevisualizacion {
  presupuesto_id: string
  necesidad_financiera: string
  otros_ingresos_aplicados: number
  distribucion: { inmueble_id: string; codigo: string; valor_asignado: string }[]
}

/** presupuesto_cuenta (E8) es un catálogo por tenant, no una fila de
 * plataforma como el categoria_id plano de antes — idempotente porque
 * `codigo` es único por tenant. */
async function cuentaAdministracionId(admin: Cliente, tenantId: string): Promise<string> {
  const { data: existente } = await admin
    .from('presupuesto_cuenta')
    .select('id')
    .eq('tenant_id', tenantId)
    .eq('codigo', 'administracion')
    .maybeSingle<{ id: string }>()
  if (existente) return existente.id

  const { data, error } = await admin
    .from('presupuesto_cuenta')
    .insert({
      tenant_id: tenantId,
      naturaleza: 'egreso',
      codigo: 'administracion',
      nombre: 'Administración',
    })
    .select('id')
    .single<{ id: string }>()
  if (error) throw new Error(`fixture cuenta administracion: ${error.message}`)
  return data.id
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

/** Arma copropiedad completa: 3 inmuebles con coeficientes, política vigente y un presupuesto. */
async function armarCopropiedad(
  admin: Cliente,
  tenantId: string,
  montoTotal: number,
): Promise<string> {
  const tipoId = await tipoApartamentoId(admin)
  const cuentaId = await cuentaAdministracionId(admin, tenantId)

  const coeficientes = [0.3, 0.3, 0.4]
  const inmuebleIds: string[] = []
  for (let i = 0; i < coeficientes.length; i++) {
    const { data: inmueble, error } = await admin
      .from('inmuebles')
      .insert({ tenant_id: tenantId, codigo: `PV-${String(i)}`, tipo_id: tipoId })
      .select('id')
      .single<{ id: string }>()
    if (error) throw new Error(`fixture inmueble: ${error.message}`)
    inmuebleIds.push(inmueble.id)
  }

  // guard_coeficiente_set_padre_inmutable bloquea escrituras en `coeficientes`
  // en cuanto el set padre ya es 'vigente' — hay que crearlo 'borrador',
  // insertar los coeficientes, y solo entonces marcarlo 'vigente' (mismo
  // orden que supabase/migrations/20260814100400_seed_gc001.sql §3.1).
  const { data: set, error: errSet } = await admin
    .from('coeficiente_sets')
    .insert({
      tenant_id: tenantId,
      version: 1,
      vigente_desde: '2027-01-01',
      estado: 'borrador',
      suma_total: 1,
    })
    .select('id')
    .single<{ id: string }>()
  if (errSet) throw new Error(`fixture coeficiente_set: ${errSet.message}`)

  const { error: errCoef } = await admin.from('coeficientes').insert(
    inmuebleIds.map((id, i) => ({
      tenant_id: tenantId,
      set_id: set.id,
      inmueble_id: id,
      valor: coeficientes[i] ?? 0,
    })),
  )
  if (errCoef) throw new Error(`fixture coeficientes: ${errCoef.message}`)

  const { error: errVigente } = await admin
    .from('coeficiente_sets')
    .update({ estado: 'vigente' })
    .eq('id', set.id)
  if (errVigente) throw new Error(`fixture coeficiente_set vigente: ${errVigente.message}`)

  const { error: errPolitica } = await admin.from('politicas_financieras').insert({
    tenant_id: tenantId,
    version: 1,
    estado: 'vigente',
    vigente_desde: '2027-01-01',
    redondeo_modo: 'half_up',
    redondeo_escala: 0,
    residual_metodo: 'mayor_resto',
    coeficientes_suma_esperada: 1,
    policy_hash: 'test-fixture-hash',
  })
  if (errPolitica) throw new Error(`fixture politica: ${errPolitica.message}`)

  const { data: presupuesto, error: errPresupuesto } = await admin
    .from('presupuestos')
    .insert({ tenant_id: tenantId, anio: 2027, version: 1, monto_total: montoTotal })
    .select('id')
    .single<{ id: string }>()
  if (errPresupuesto) throw new Error(`fixture presupuesto: ${errPresupuesto.message}`)

  await admin.from('presupuesto_rubros').insert({
    tenant_id: tenantId,
    presupuesto_id: presupuesto.id,
    codigo: 'ADMIN-001',
    nombre: 'Administración',
    cuenta_id: cuentaId,
    monto_anual: montoTotal,
  })

  return presupuesto.id
}

d('presupuesto-previsualizar (Edge Function)', () => {
  const admin = clienteAdmin(env!)
  let agente: UsuarioPrueba
  let agenteOtro: UsuarioPrueba
  let tenant: TenantPrueba
  let tenantOtro: TenantPrueba
  let clienteAgent: Cliente
  let clienteAgentOtro: Cliente
  let presupuestoId: string

  afterAll(async () => {
    await eliminarTenant(admin, tenant.id)
    await eliminarTenant(admin, tenantOtro.id)
    await eliminarUsuario(admin, agente.id)
    await eliminarUsuario(admin, agenteOtro.id)
  })

  it('setup', async () => {
    agente = await crearUsuario(admin, 'pp-agent')
    agenteOtro = await crearUsuario(admin, 'pp-agent-otro')
    tenant = await crearTenant(admin, 'pp', agente.id)
    tenantOtro = await crearTenant(admin, 'pp-otro', agenteOtro.id)
    await crearMembership(admin, tenant.id, agente.id, 'auxiliar')
    await crearMembership(admin, tenantOtro.id, agenteOtro.id, 'auxiliar')
    clienteAgent = await clienteComo(env!, agente)
    clienteAgentOtro = await clienteComo(env!, agenteOtro)

    presupuestoId = await armarCopropiedad(admin, tenant.id, 1_000_000)
  }, 30_000)

  it('flujo feliz: distribuye por coeficiente y conserva el total', async () => {
    const { data, response } = await clienteAgent.functions.invoke<RespuestaPrevisualizacion>(
      'presupuesto-previsualizar',
      { body: { presupuesto_id: presupuestoId } },
    )

    expect(response?.status).toBe(200)
    expect(data?.necesidad_financiera).toBe('1000000')
    expect(data?.distribucion).toHaveLength(3)

    const suma = data!.distribucion.reduce((acc, e) => acc + Number(e.valor_asignado), 0)
    expect(suma).toBe(1_000_000)
  }, 30_000)

  it('neteo: una fuente otros_ingresos reduce la necesidad financiera', async () => {
    await admin.from('fuente_financiacion').insert({
      tenant_id: tenant.id,
      presupuesto_id: presupuestoId,
      tipo: 'otros_ingresos',
      valor_disponible: 100_000,
      valor_aplicado: 100_000,
    })

    const { data, response } = await clienteAgent.functions.invoke<RespuestaPrevisualizacion>(
      'presupuesto-previsualizar',
      { body: { presupuesto_id: presupuestoId } },
    )

    expect(response?.status).toBe(200)
    expect(data?.otros_ingresos_aplicados).toBe(100_000)
    expect(data?.necesidad_financiera).toBe('900000')

    const suma = data!.distribucion.reduce((acc, e) => acc + Number(e.valor_asignado), 0)
    expect(suma).toBe(900_000)
  }, 30_000)

  it('PRESUPUESTO_NO_ENCONTRADO (404): presupuesto inexistente', async () => {
    const { data, response } = await clienteAgent.functions.invoke<RespuestaPrevisualizacion>(
      'presupuesto-previsualizar',
      { body: { presupuesto_id: '00000000-0000-0000-0000-000000000000' } },
    )
    expect(data).toBeNull()
    expect(response?.status).toBe(404)
  }, 30_000)

  it('aislamiento: un agent de otro tenant no puede previsualizar este presupuesto', async () => {
    const { data, response } = await clienteAgentOtro.functions.invoke<RespuestaPrevisualizacion>(
      'presupuesto-previsualizar',
      { body: { presupuesto_id: presupuestoId } },
    )
    expect(data).toBeNull()
    expect(response?.status).toBe(404)
  }, 30_000)
})
