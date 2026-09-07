/**
 * inmueble_transferencias (CJ-8, PROMPT-CAR-JUR-001 §15, 20260908100000) —
 * bitácora factual de transferencias de propiedad. Prueba el guard
 * (tenant/inmueble/tipo/terceros), el rol mínimo y el append-only, mismo
 * criterio que tests/plantillas-sms.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
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
} from './helpers.js'

const env = leerEntorno()
const d = env ? describe : describe.skip

if (!env) {
  console.warn('SALTADO tests/rls/inmueble-transferencias: faltan variables de Supabase en .env')
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

async function tipoTransferenciaId(admin: Cliente, codigo: string): Promise<number> {
  const { data, error } = await admin
    .from('lista_tipos')
    .select('id')
    .eq('tipo', 'TIPO_TRANSFERENCIA_PROPIEDAD')
    .eq('codigo', codigo)
    .is('tenant_id', null)
    .single<{ id: number }>()
  if (error) throw new Error(`fixture tipo transferencia: ${error.message}`)
  return data.id
}

async function crearInmueble(admin: Cliente, tenantId: string): Promise<string> {
  const tipoId = await tipoApartamentoId(admin)
  const { data, error } = await admin
    .from('inmuebles')
    .insert({ tenant_id: tenantId, codigo: `TRF-${String(Date.now())}`, tipo_id: tipoId })
    .select('id')
    .single<{ id: string }>()
  if (error) throw new Error(`fixture inmueble: ${error.message}`)
  return data.id
}

async function crearTercero(admin: Cliente, tenantId: string, documento: string): Promise<string> {
  const [{ data: tipoIdent, error: errorIdent }, { data: estado, error: errorEstado }] = await Promise.all([
    admin
      .from('lista_tipos')
      .select('id')
      .eq('tipo', 'TIPO_IDENTIFICACION')
      .eq('codigo', 'cedula')
      .is('tenant_id', null)
      .single<{ id: number }>(),
    admin
      .from('lista_tipos')
      .select('id')
      .eq('tipo', 'ESTADO_TERCERO')
      .eq('codigo', 'activo')
      .is('tenant_id', null)
      .single<{ id: number }>(),
  ])
  if (errorIdent) throw new Error(`fixture tipo identificación: ${errorIdent.message}`)
  if (errorEstado) throw new Error(`fixture estado tercero: ${errorEstado.message}`)

  const { data, error } = await admin
    .from('terceros')
    .insert({
      tenant_id: tenantId,
      tipo_persona: 'natural',
      tipo_identificacion_id: tipoIdent.id,
      numero_documento: documento,
      primer_nombre: 'Prueba',
      primer_apellido: documento,
      estado_id: estado.id,
    })
    .select('id')
    .single<{ id: string }>()
  if (error) throw new Error(`fixture tercero: ${error.message}`)
  return data.id
}

d('inmueble_transferencias (CJ-8)', () => {
  const admin = clienteAdmin(env!)
  let auxiliarUser: UsuarioPrueba
  let auditorUser: UsuarioPrueba
  let tenant: TenantPrueba
  let clienteAuxiliar: Cliente
  let clienteAuditor: Cliente
  let inmuebleId: string
  let vendedorId: string
  let compradorId: string
  let tipoCompraventaId: number

  beforeAll(async () => {
    auxiliarUser = await crearUsuario(admin, 'trf-auxiliar')
    auditorUser = await crearUsuario(admin, 'trf-auditor')
    tenant = await crearTenant(admin, 'trf', auxiliarUser.id)
    await crearMembership(admin, tenant.id, auxiliarUser.id, 'auxiliar')
    await crearMembership(admin, tenant.id, auditorUser.id, 'auditor')
    clienteAuxiliar = await clienteComo(env!, auxiliarUser)
    clienteAuditor = await clienteComo(env!, auditorUser)

    inmuebleId = await crearInmueble(admin, tenant.id)
    vendedorId = await crearTercero(admin, tenant.id, `VEN-${String(Date.now())}`)
    compradorId = await crearTercero(admin, tenant.id, `COM-${String(Date.now())}`)
    tipoCompraventaId = await tipoTransferenciaId(admin, 'compraventa')
  }, 30_000)

  afterAll(async () => {
    await eliminarTenant(admin, tenant.id)
    await eliminarUsuario(admin, auxiliarUser.id)
    await eliminarUsuario(admin, auditorUser.id)
  }, 30_000)

  it('auxiliar puede registrar una transferencia — registrado_por queda estampado por el guard', async () => {
    const { data, error } = await clienteAuxiliar
      .from('inmueble_transferencias')
      .insert({
        tenant_id: tenant.id,
        inmueble_id: inmuebleId,
        tipo_transferencia_id: tipoCompraventaId,
        fecha_transferencia: '2026-08-01',
        descripcion: 'Compraventa según escritura pública 123.',
        propietario_anterior_id: vendedorId,
        propietario_nuevo_id: compradorId,
        deuda_a_la_fecha: 500000,
        registrado_por: auxiliarUser.id, // sobrescrito por el guard — ver comentario del store
      })
      .select('*')
      .single()
    expect(error).toBeNull()
    expect(data?.registrado_por).toBe(auxiliarUser.id)
    expect(data?.deuda_a_la_fecha).toBe(500000)
  })

  it('auditor NO puede registrar (FORBIDDEN)', async () => {
    const { error } = await clienteAuditor.from('inmueble_transferencias').insert({
      tenant_id: tenant.id,
      inmueble_id: inmuebleId,
      tipo_transferencia_id: tipoCompraventaId,
      fecha_transferencia: '2026-08-01',
      descripcion: 'Intento de auditor.',
      propietario_nuevo_id: compradorId,
      registrado_por: auditorUser.id,
    })
    expect(error).not.toBeNull()
    expect(error?.message).toMatch(/FORBIDDEN/)
  })

  it('TIPO_TRANSFERENCIA_INVALIDO: rechaza un tipo de otra familia de lista_tipos', async () => {
    const tipoAjeno = await tipoApartamentoId(admin) // TIPO_INMUEBLE, no TIPO_TRANSFERENCIA_PROPIEDAD
    const { error } = await clienteAuxiliar.from('inmueble_transferencias').insert({
      tenant_id: tenant.id,
      inmueble_id: inmuebleId,
      tipo_transferencia_id: tipoAjeno,
      fecha_transferencia: '2026-08-01',
      descripcion: 'Tipo inválido.',
      propietario_nuevo_id: compradorId,
      registrado_por: auxiliarUser.id,
    })
    expect(error).not.toBeNull()
    expect(error?.message).toMatch(/TIPO_TRANSFERENCIA_INVALIDO/)
  })

  it('propietario_anterior_id es opcional — primera titularidad registrada sin antecesor', async () => {
    const { data, error } = await clienteAuxiliar
      .from('inmueble_transferencias')
      .insert({
        tenant_id: tenant.id,
        inmueble_id: inmuebleId,
        tipo_transferencia_id: await tipoTransferenciaId(admin, 'adjudicacion'),
        fecha_transferencia: '2026-01-01',
        descripcion: 'Primera adjudicación, sin propietario anterior.',
        propietario_nuevo_id: compradorId,
        registrado_por: auxiliarUser.id,
      })
      .select('propietario_anterior_id')
      .single()
    expect(error).toBeNull()
    expect(data?.propietario_anterior_id).toBeNull()
  })

  it('append-only: la fila no cambia ante un intento de UPDATE (sin política UPDATE + forbid_mutation_salvo_tenant_borrado)', async () => {
    const { data: fila } = await clienteAuxiliar
      .from('inmueble_transferencias')
      .select('id, descripcion')
      .eq('tenant_id', tenant.id)
      .limit(1)
      .single<{ id: string; descripcion: string }>()

    // Sin política UPDATE para authenticated: RLS ya filtra la fila antes de
    // llegar al trigger, así que PostgREST responde éxito con 0 filas
    // afectadas (no un error) — el guard real es forbid_mutation_salvo_
    // tenant_borrado() más abajo, esto solo confirma que ninguna vía deja
    // el texto reescrito.
    await clienteAuxiliar.from('inmueble_transferencias').update({ descripcion: 'reescrita' }).eq('id', fila!.id)

    const { data: relectura } = await clienteAuxiliar
      .from('inmueble_transferencias')
      .select('descripcion')
      .eq('id', fila!.id)
      .single<{ descripcion: string }>()
    expect(relectura?.descripcion).toBe(fila!.descripcion)

    // El trigger sí es el guard real: incluso con service role (bypassa RLS),
    // un UPDATE directo debe fallar por forbid_mutation_salvo_tenant_borrado.
    const { error: errorAdmin } = await admin
      .from('inmueble_transferencias')
      .update({ descripcion: 'reescrita por admin' })
      .eq('id', fila!.id)
    expect(errorAdmin).not.toBeNull()
  })
})
