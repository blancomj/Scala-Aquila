/**
 * crear-novedad / aprobar-novedad / rechazar-novedad (Edge Functions, HTTP
 * real) — E4. No repite el aislamiento RLS por tenant (ya cubierto en
 * tests/rls/novedades.test.ts) — se enfoca en el contrato HTTP y en el
 * efecto financiero de aprobar/rechazar (AD-33).
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
  console.warn('SALTADO tests/tenancy/novedades: faltan variables de Supabase en .env')
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

d('crear-novedad / aprobar-novedad / rechazar-novedad (Edge Functions)', () => {
  const admin = clienteAdmin(env!)
  let agente: UsuarioPrueba
  let auditor: UsuarioPrueba
  let tenant: TenantPrueba
  let clienteAgent: Cliente
  let clienteAuditor: Cliente
  let inmuebleId: string

  afterAll(async () => {
    await eliminarTenant(admin, tenant.id)
    await eliminarUsuario(admin, agente.id)
    await eliminarUsuario(admin, auditor.id)
  })

  it('setup', async () => {
    agente = await crearUsuario(admin, 'nov-http-agent')
    auditor = await crearUsuario(admin, 'nov-http-auditor')
    tenant = await crearTenant(admin, 'nov-http', agente.id)
    await crearMembership(admin, tenant.id, agente.id, 'agent')
    await crearMembership(admin, tenant.id, auditor.id, 'auditor')
    clienteAgent = await clienteComo(env!, agente)
    clienteAuditor = await clienteComo(env!, auditor)

    const tipoId = await tipoApartamentoId(admin)
    const { data: inmueble, error: errInmueble } = await admin
      .from('inmuebles')
      .insert({ tenant_id: tenant.id, codigo: `NOVHTTP-${String(Date.now())}`, tipo_id: tipoId })
      .select('id')
      .single<{ id: string }>()
    if (errInmueble) throw new Error(`fixture inmueble: ${errInmueble.message}`)
    inmuebleId = inmueble.id

    const { error: errPeriodo } = await admin
      .from('periodos')
      .insert({ tenant_id: tenant.id, anio: 2027, mes: 1, estado: 'abierto' })
    if (errPeriodo) throw new Error(`fixture periodo: ${errPeriodo.message}`)
  }, 30_000)

  it('ADJUSTMENT_ZERO_AMOUNT (400): monto no puede ser cero', async () => {
    const { data, response } = await clienteAgent.functions.invoke<RespuestaNovedad>(
      'crear-novedad',
      {
        body: {
          inmueble_id: inmuebleId,
          tipo: 'CHARGE',
          monto: 0,
          descripcion: 'x',
          fecha_efectiva: '2027-01-15',
        },
      },
    )
    expect(data).toBeNull()
    expect(response?.status).toBe(400)
  }, 30_000)

  it('INVALID_PAYLOAD (400): CHARGE con monto negativo viola AD-30', async () => {
    const { data, response } = await clienteAgent.functions.invoke<RespuestaNovedad>(
      'crear-novedad',
      {
        body: {
          inmueble_id: inmuebleId,
          tipo: 'CHARGE',
          monto: -1000,
          descripcion: 'x',
          fecha_efectiva: '2027-01-15',
        },
      },
    )
    expect(data).toBeNull()
    expect(response?.status).toBe(400)
  }, 30_000)

  it('un auditor no puede crear novedades (403)', async () => {
    const { data, response } = await clienteAuditor.functions.invoke<RespuestaNovedad>(
      'crear-novedad',
      {
        body: {
          inmueble_id: inmuebleId,
          tipo: 'CHARGE',
          monto: 1000,
          descripcion: 'x',
          fecha_efectiva: '2027-01-15',
        },
      },
    )
    expect(data).toBeNull()
    expect(response?.status).toBe(403)
  }, 30_000)

  it('flujo feliz: crear → aprobar genera un cargo categoria=otro', async () => {
    const { data: creada, response: respCrear } =
      await clienteAgent.functions.invoke<RespuestaNovedad>('crear-novedad', {
        body: {
          inmueble_id: inmuebleId,
          tipo: 'CHARGE',
          monto: 75_000,
          descripcion: 'Daño en zona común',
          fecha_efectiva: '2027-01-15',
        },
      })
    expect(respCrear?.status).toBe(200)
    expect(creada?.estado).toBe('pendiente')

    const { data: aprobada, response: respAprobar } =
      await clienteAgent.functions.invoke<RespuestaNovedad>('aprobar-novedad', {
        body: { novedad_id: creada!.id },
      })
    expect(respAprobar?.status).toBe(200)
    expect(aprobada?.estado).toBe('aprobada')

    const { data: cargo, error: errCargo } = await admin
      .from('cargos')
      .select('categoria, origen_tipo, monto_original, novedad_id')
      .eq('novedad_id', creada!.id)
      .single()
    expect(errCargo).toBeNull()
    expect(cargo?.categoria).toBe('otro')
    expect(cargo?.origen_tipo).toBe('novedad')
    expect(Number(cargo?.monto_original)).toBe(75_000)
  }, 30_000)

  it('NOVEDAD_NO_PENDIENTE (409): no se puede aprobar dos veces', async () => {
    const { data: creada } = await clienteAgent.functions.invoke<RespuestaNovedad>(
      'crear-novedad',
      {
        body: {
          inmueble_id: inmuebleId,
          tipo: 'DISCOUNT',
          monto: -5000,
          descripcion: 'Descuento pronto pago',
          fecha_efectiva: '2027-01-15',
        },
      },
    )
    await clienteAgent.functions.invoke('aprobar-novedad', { body: { novedad_id: creada!.id } })

    const { data, response } = await clienteAgent.functions.invoke<RespuestaNovedad>(
      'aprobar-novedad',
      { body: { novedad_id: creada!.id } },
    )
    expect(data).toBeNull()
    expect(response?.status).toBe(409)
  }, 30_000)

  it('rechazar no genera cargo', async () => {
    const { data: creada } = await clienteAgent.functions.invoke<RespuestaNovedad>(
      'crear-novedad',
      {
        body: {
          inmueble_id: inmuebleId,
          tipo: 'ADJUSTMENT',
          monto: 1000,
          descripcion: 'Corrección de cobro',
          fecha_efectiva: '2027-01-15',
        },
      },
    )

    const { data: rechazada, response } = await clienteAgent.functions.invoke<RespuestaNovedad>(
      'rechazar-novedad',
      { body: { novedad_id: creada!.id, motivo: 'Duplicada' } },
    )
    expect(response?.status).toBe(200)
    expect(rechazada?.estado).toBe('rechazada')

    const { data: cargos, error } = await admin
      .from('cargos')
      .select('id')
      .eq('novedad_id', creada!.id)
    expect(error).toBeNull()
    expect(cargos).toHaveLength(0)
  }, 30_000)
})
