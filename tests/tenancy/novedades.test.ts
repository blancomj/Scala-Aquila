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

/** Fase 3 conceptos avanzados — id de un valor real del catálogo TIPO_NOVEDAD
 * (ya sembrado en 20260814180000, huérfano hasta ahora). */
async function tipoNovedadId(admin: Cliente, codigo: string): Promise<number> {
  const { data, error } = await admin
    .from('lista_tipos')
    .select('id')
    .eq('tipo', 'TIPO_NOVEDAD')
    .eq('codigo', codigo)
    .is('tenant_id', null)
    .single<{ id: number }>()
  if (error) throw new Error(`fixture tipo novedad ${codigo}: ${error.message}`)
  return data.id
}

/** Fase 3 conceptos avanzados — mismo patrón de fixture que
 * tests/rls/presupuesto-ejecucion.test.ts::crearCuenta. */
async function crearCuentaPresupuestal(
  admin: Cliente,
  params: { tenantId: string; naturaleza: 'ingreso' | 'egreso'; codigo: string; parentId?: string },
): Promise<{ id: string }> {
  const { data, error } = await admin
    .from('presupuesto_cuenta')
    .insert({
      tenant_id: params.tenantId,
      naturaleza: params.naturaleza,
      codigo: params.codigo,
      nombre: params.codigo,
      parent_id: params.parentId ?? null,
    })
    .select('id')
    .single<{ id: string }>()
  if (error) throw new Error(`fixture cuenta ${params.codigo}: ${error.message}`)
  return data
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
    await crearMembership(admin, tenant.id, agente.id, 'auxiliar')
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

  // ── Fase 3 conceptos avanzados — tipo_novedad_id / presupuesto_cuenta_id ─
  it('flujo feliz: crear con tipo_novedad_id + presupuesto_cuenta_id — ambos quedan guardados', async () => {
    const idTipoNovedad = await tipoNovedadId(admin, 'sancion')
    const cuenta = await crearCuentaPresupuestal(admin, {
      tenantId: tenant.id,
      naturaleza: 'ingreso',
      codigo: `CI-SANCIONES-${String(Date.now())}`,
    })

    const { data: creada, response } = await clienteAgent.functions.invoke<RespuestaNovedad>(
      'crear-novedad',
      {
        body: {
          inmueble_id: inmuebleId,
          tipo: 'CHARGE',
          tipo_novedad_id: idTipoNovedad,
          presupuesto_cuenta_id: cuenta.id,
          monto: 30_000,
          descripcion: 'Sanción por ruido',
          fecha_efectiva: '2027-01-15',
        },
      },
    )
    expect(response?.status).toBe(200)

    const { data: fila, error } = await admin
      .from('novedades')
      .select('tipo_novedad_id, presupuesto_cuenta_id')
      .eq('id', creada!.id)
      .single()
    expect(error).toBeNull()
    expect(fila?.tipo_novedad_id).toBe(idTipoNovedad)
    expect(fila?.presupuesto_cuenta_id).toBe(cuenta.id)
  }, 30_000)

  it('TIPO_NOVEDAD_INVALIDO (500): tipo_novedad_id de un catálogo distinto a TIPO_NOVEDAD', async () => {
    const idOtroCatalogo = await tipoApartamentoId(admin) // TIPO_INMUEBLE, no TIPO_NOVEDAD

    const { data, response } = await clienteAgent.functions.invoke<RespuestaNovedad>(
      'crear-novedad',
      {
        body: {
          inmueble_id: inmuebleId,
          tipo: 'CHARGE',
          tipo_novedad_id: idOtroCatalogo,
          monto: 1000,
          descripcion: 'x',
          fecha_efectiva: '2027-01-15',
        },
      },
    )
    expect(data).toBeNull()
    expect(response?.status).toBe(500)
  }, 30_000)

  it('CUENTA_NATURALEZA_INVALIDA (500): presupuesto_cuenta_id de egreso — una novedad es un cobro', async () => {
    const cuentaEgreso = await crearCuentaPresupuestal(admin, {
      tenantId: tenant.id,
      naturaleza: 'egreso',
      codigo: `CE-GASTOS-${String(Date.now())}`,
    })

    const { data, response } = await clienteAgent.functions.invoke<RespuestaNovedad>(
      'crear-novedad',
      {
        body: {
          inmueble_id: inmuebleId,
          tipo: 'CHARGE',
          presupuesto_cuenta_id: cuentaEgreso.id,
          monto: 1000,
          descripcion: 'x',
          fecha_efectiva: '2027-01-15',
        },
      },
    )
    expect(data).toBeNull()
    expect(response?.status).toBe(500)
  }, 30_000)

  it('CUENTA_NO_ES_HOJA (500): presupuesto_cuenta_id de una cuenta que agrupa subcuentas', async () => {
    const cuentaPadre = await crearCuentaPresupuestal(admin, {
      tenantId: tenant.id,
      naturaleza: 'ingreso',
      codigo: `CI-PADRE-${String(Date.now())}`,
    })
    await crearCuentaPresupuestal(admin, {
      tenantId: tenant.id,
      naturaleza: 'ingreso',
      codigo: `CI-HIJA-${String(Date.now())}`,
      parentId: cuentaPadre.id,
    })

    const { data, response } = await clienteAgent.functions.invoke<RespuestaNovedad>(
      'crear-novedad',
      {
        body: {
          inmueble_id: inmuebleId,
          tipo: 'CHARGE',
          presupuesto_cuenta_id: cuentaPadre.id,
          monto: 1000,
          descripcion: 'x',
          fecha_efectiva: '2027-01-15',
        },
      },
    )
    expect(data).toBeNull()
    expect(response?.status).toBe(500)
  }, 30_000)
})
