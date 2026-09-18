/**
 * guard_inmueble_inactivar_con_saldo (hallazgo QA f2-17, qa/decisiones.md,
 * 20260942010000) — inactivar un inmueble con saldo pendiente (según
 * v_cargo_saldo) debe rechazarse, no solo advertir. Mismo patrón que los
 * demás guards de dominio (LAST_AGENT, CARTERA_ETAPA_CONGELADA): un trigger
 * BEFORE UPDATE, no un chequeo del lado del cliente.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import {
  clienteAdmin,
  crearMembership,
  crearTenant,
  crearUsuario,
  eliminarTenant,
  eliminarUsuario,
  leerEntorno,
  type Cliente,
  type TenantPrueba,
  type UsuarioPrueba,
} from './helpers.js'

const env = leerEntorno()
const d = env ? describe : describe.skip

if (!env) {
  console.warn('SALTADO tests/rls/inmueble-inactivar-saldo: faltan variables de Supabase en .env')
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

async function crearInmueble(admin: Cliente, tenantId: string, codigo: string): Promise<string> {
  const tipoId = await tipoApartamentoId(admin)
  const { data, error } = await admin
    .from('inmuebles')
    .insert({ tenant_id: tenantId, codigo, tipo_id: tipoId })
    .select('id')
    .single<{ id: string }>()
  if (error) throw new Error(`fixture inmueble: ${error.message}`)
  return data.id
}

async function crearPeriodo(admin: Cliente, tenantId: string): Promise<string> {
  const { data, error } = await admin
    .from('periodos')
    .insert({ tenant_id: tenantId, anio: 2026, mes: 9 })
    .select('id')
    .single<{ id: string }>()
  if (error) throw new Error(`fixture periodo: ${error.message}`)
  return data.id
}

/** Cargo con saldo pendiente completo — vía origen 'novedad' (el más simple
 * de construir sin pasar por una liquidación real). */
async function crearCargoConSaldo(
  admin: Cliente,
  tenantId: string,
  inmuebleId: string,
  periodoId: string,
  creadoPor: string,
): Promise<void> {
  const { data: novedad, error: errorNovedad } = await admin
    .from('novedades')
    .insert({
      tenant_id: tenantId,
      inmueble_id: inmuebleId,
      tipo: 'CHARGE',
      monto: 100_000,
      descripcion: 'fixture f2-17 — saldo pendiente para probar el guard',
      fecha_efectiva: '2026-09-01',
      created_by: creadoPor,
    })
    .select('id')
    .single<{ id: string }>()
  if (errorNovedad) throw new Error(`fixture novedad: ${errorNovedad.message}`)

  const { error: errorCargo } = await admin.from('cargos').insert({
    tenant_id: tenantId,
    inmueble_id: inmuebleId,
    periodo_id: periodoId,
    categoria: 'otro',
    origen_tipo: 'novedad',
    novedad_id: novedad.id,
    monto_original: 100_000,
  })
  if (errorCargo) throw new Error(`fixture cargo: ${errorCargo.message}`)
}

d('guard_inmueble_inactivar_con_saldo (hallazgo QA f2-17)', () => {
  const admin = clienteAdmin(env!)
  let owner: UsuarioPrueba
  let tenant: TenantPrueba
  let periodoId: string

  beforeAll(async () => {
    owner = await crearUsuario(admin, 'inact-owner')
    tenant = await crearTenant(admin, 'inact', owner.id)
    await crearMembership(admin, tenant.id, owner.id, 'administrador')
    periodoId = await crearPeriodo(admin, tenant.id)
  }, 30_000)

  afterAll(async () => {
    await eliminarTenant(admin, tenant.id)
    await eliminarUsuario(admin, owner.id)
  }, 30_000)

  it('rechaza estado=inactivo mientras haya saldo pendiente (INMUEBLE_SALDO_PENDIENTE)', async () => {
    const inmuebleId = await crearInmueble(admin, tenant.id, `F2-17-${String(Date.now())}`)
    await crearCargoConSaldo(admin, tenant.id, inmuebleId, periodoId, owner.id)

    const { error } = await admin.from('inmuebles').update({ estado: 'inactivo' }).eq('id', inmuebleId)
    expect(error).not.toBeNull()
    expect(error?.message).toMatch(/^INMUEBLE_SALDO_PENDIENTE:/)

    const { data: inmueble } = await admin
      .from('inmuebles')
      .select('estado')
      .eq('id', inmuebleId)
      .single<{ estado: string }>()
    expect(inmueble?.estado).toBe('activo')
  })

  it('permite estado=inactivo cuando no hay ningún cargo (saldo pendiente = 0)', async () => {
    const inmuebleId = await crearInmueble(admin, tenant.id, `F2-17-OK-${String(Date.now())}`)

    const { error } = await admin.from('inmuebles').update({ estado: 'inactivo' }).eq('id', inmuebleId)
    expect(error).toBeNull()

    const { data: inmueble } = await admin
      .from('inmuebles')
      .select('estado')
      .eq('id', inmuebleId)
      .single<{ estado: string }>()
    expect(inmueble?.estado).toBe('inactivo')
  })
})
