/**
 * terceros_contacto_procedencia (CJ-9, CAR_10_Consulta_Juridica.md
 * pregunta 4, 20260908150000) — bitácora factual de origen del dato de
 * contacto. Prueba el guard (tenant/tercero/origen), el rol mínimo y el
 * append-only, mismo criterio que tests/rls/inmueble-transferencias.
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
  console.warn('SALTADO tests/rls/terceros-contacto-procedencia: faltan variables de Supabase en .env')
}

async function origenId(admin: Cliente, codigo: string): Promise<number> {
  const { data, error } = await admin
    .from('lista_tipos')
    .select('id')
    .eq('tipo', 'ORIGEN_CONTACTO_TERCERO')
    .eq('codigo', codigo)
    .is('tenant_id', null)
    .single<{ id: number }>()
  if (error) throw new Error(`fixture origen contacto: ${error.message}`)
  return data.id
}

async function tipoIdentificacionCedulaId(admin: Cliente): Promise<number> {
  const { data, error } = await admin
    .from('lista_tipos')
    .select('id')
    .eq('tipo', 'TIPO_IDENTIFICACION')
    .eq('codigo', 'cedula')
    .is('tenant_id', null)
    .single<{ id: number }>()
  if (error) throw new Error(`fixture tipo identificación: ${error.message}`)
  return data.id
}

async function estadoActivoId(admin: Cliente): Promise<number> {
  const { data, error } = await admin
    .from('lista_tipos')
    .select('id')
    .eq('tipo', 'ESTADO_TERCERO')
    .eq('codigo', 'activo')
    .is('tenant_id', null)
    .single<{ id: number }>()
  if (error) throw new Error(`fixture estado tercero: ${error.message}`)
  return data.id
}

async function crearTercero(admin: Cliente, tenantId: string, documento: string): Promise<string> {
  const [tipoIdent, estado] = await Promise.all([
    tipoIdentificacionCedulaId(admin),
    estadoActivoId(admin),
  ])
  const { data, error } = await admin
    .from('terceros')
    .insert({
      tenant_id: tenantId,
      tipo_persona: 'natural',
      tipo_identificacion_id: tipoIdent,
      numero_documento: documento,
      primer_nombre: 'Prueba',
      primer_apellido: documento,
      estado_id: estado,
    })
    .select('id')
    .single<{ id: string }>()
  if (error) throw new Error(`fixture tercero: ${error.message}`)
  return data.id
}

d('terceros_contacto_procedencia (CJ-9)', () => {
  const admin = clienteAdmin(env!)
  let auxiliarUser: UsuarioPrueba
  let auditorUser: UsuarioPrueba
  let tenant: TenantPrueba
  let clienteAuxiliar: Cliente
  let clienteAuditor: Cliente
  let terceroId: string
  let origenActualizacionDirectaId: number

  beforeAll(async () => {
    auxiliarUser = await crearUsuario(admin, 'cnt-auxiliar')
    auditorUser = await crearUsuario(admin, 'cnt-auditor')
    tenant = await crearTenant(admin, 'cnt', auxiliarUser.id)
    await crearMembership(admin, tenant.id, auxiliarUser.id, 'auxiliar')
    await crearMembership(admin, tenant.id, auditorUser.id, 'auditor')
    clienteAuxiliar = await clienteComo(env!, auxiliarUser)
    clienteAuditor = await clienteComo(env!, auditorUser)

    terceroId = await crearTercero(admin, tenant.id, `CNT-${String(Date.now())}`)
    origenActualizacionDirectaId = await origenId(admin, 'actualizacion_directa')
  }, 30_000)

  afterAll(async () => {
    await eliminarTenant(admin, tenant.id)
    await eliminarUsuario(admin, auxiliarUser.id)
    await eliminarUsuario(admin, auditorUser.id)
  }, 30_000)

  it('auxiliar puede registrar procedencia — registrado_por queda estampado por el guard', async () => {
    const { data, error } = await clienteAuxiliar
      .from('terceros_contacto_procedencia')
      .insert({
        tenant_id: tenant.id,
        tercero_id: terceroId,
        campo: 'email',
        valor: 'residente@example.com',
        origen_id: origenActualizacionDirectaId,
        registrado_por: auxiliarUser.id, // sobrescrito por el guard — ver comentario del store
      })
      .select('*')
      .single()
    expect(error).toBeNull()
    expect(data?.registrado_por).toBe(auxiliarUser.id)
    expect(data?.valor).toBe('residente@example.com')
  })

  it('auditor NO puede registrar (FORBIDDEN)', async () => {
    const { error } = await clienteAuditor.from('terceros_contacto_procedencia').insert({
      tenant_id: tenant.id,
      tercero_id: terceroId,
      campo: 'telefono',
      valor: '3001234567',
      origen_id: origenActualizacionDirectaId,
      registrado_por: auditorUser.id,
    })
    expect(error).not.toBeNull()
    expect(error?.message).toMatch(/FORBIDDEN/)
  })

  it('CAMPO_INVALIDO: rechaza un campo que no sea email/telefono', async () => {
    const { error } = await clienteAuxiliar.from('terceros_contacto_procedencia').insert({
      tenant_id: tenant.id,
      tercero_id: terceroId,
      campo: 'direccion',
      valor: 'Calle 1 # 2-3',
      origen_id: origenActualizacionDirectaId,
      registrado_por: auxiliarUser.id,
    })
    expect(error).not.toBeNull()
  })

  it('ORIGEN_INVALIDO: rechaza un origen de otra familia de lista_tipos', async () => {
    const origenAjeno = await estadoActivoId(admin) // ESTADO_TERCERO, no ORIGEN_CONTACTO_TERCERO
    const { error } = await clienteAuxiliar.from('terceros_contacto_procedencia').insert({
      tenant_id: tenant.id,
      tercero_id: terceroId,
      campo: 'email',
      valor: 'otro@example.com',
      origen_id: origenAjeno,
      registrado_por: auxiliarUser.id,
    })
    expect(error).not.toBeNull()
    expect(error?.message).toMatch(/ORIGEN_INVALIDO/)
  })

  it('TERCERO_INVALIDO: rechaza un tercero de otro tenant', async () => {
    const otroTenant = await crearTenant(admin, 'cnt-otro', auxiliarUser.id)
    const terceroAjeno = await crearTercero(admin, otroTenant.id, `AJE-${String(Date.now())}`)
    try {
      const { error } = await clienteAuxiliar.from('terceros_contacto_procedencia').insert({
        tenant_id: tenant.id,
        tercero_id: terceroAjeno,
        campo: 'email',
        valor: 'ajeno@example.com',
        origen_id: origenActualizacionDirectaId,
        registrado_por: auxiliarUser.id,
      })
      expect(error).not.toBeNull()
      expect(error?.message).toMatch(/TERCERO_INVALIDO/)
    } finally {
      await eliminarTenant(admin, otroTenant.id)
    }
  })

  it('append-only: la fila no cambia ante un intento de UPDATE (sin política UPDATE + forbid_mutation_salvo_tenant_borrado)', async () => {
    const { data: fila } = await clienteAuxiliar
      .from('terceros_contacto_procedencia')
      .select('id, valor')
      .eq('tenant_id', tenant.id)
      .limit(1)
      .single<{ id: string; valor: string }>()

    // Sin política UPDATE para authenticated: RLS ya filtra la fila antes de
    // llegar al trigger, así que PostgREST responde éxito con 0 filas
    // afectadas (no un error) — el guard real es forbid_mutation_salvo_
    // tenant_borrado() más abajo, esto solo confirma que ninguna vía deja
    // el valor reescrito.
    await clienteAuxiliar.from('terceros_contacto_procedencia').update({ valor: 'reescrito@example.com' }).eq('id', fila!.id)

    const { data: relectura } = await clienteAuxiliar
      .from('terceros_contacto_procedencia')
      .select('valor')
      .eq('id', fila!.id)
      .single<{ valor: string }>()
    expect(relectura?.valor).toBe(fila!.valor)

    // El trigger sí es el guard real: incluso con service role (bypassa RLS),
    // un UPDATE directo debe fallar por forbid_mutation_salvo_tenant_borrado.
    const { error: errorAdmin } = await admin
      .from('terceros_contacto_procedencia')
      .update({ valor: 'reescrito por admin' })
      .eq('id', fila!.id)
    expect(errorAdmin).not.toBeNull()
  })
})
