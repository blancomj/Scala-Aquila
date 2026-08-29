/**
 * documentos_legal_holds (CJ-3 §10.6, PROMPT-CAR-JUR-001, 20260908120000) —
 * freno de purga sobre documento_grupo_id. Prueba fn_activar_legal_hold /
 * fn_liberar_legal_hold: rol mínimo por función, upsert por grupo_id,
 * validación de documento inexistente, y que liberar exige que haya un
 * hold activo.
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
  console.warn('SALTADO tests/rls/documentos-legal-hold: faltan variables de Supabase en .env')
}

async function tipoDocumentoEscrituraId(admin: Cliente): Promise<number> {
  const { data, error } = await admin
    .from('lista_tipos')
    .select('id')
    .eq('tipo', 'TIPO_DOCUMENTO')
    .eq('codigo', 'escritura_publica')
    .is('tenant_id', null)
    .single<{ id: number }>()
  if (error) throw new Error(`fixture tipo documento: ${error.message}`)
  return data.id
}

async function crearDocumento(admin: Cliente, tenantId: string): Promise<string> {
  const tipoDocumentoId = await tipoDocumentoEscrituraId(admin)
  const { data, error } = await admin
    .from('documentos')
    .insert({
      tenant_id: tenantId,
      tipo_documento_id: tipoDocumentoId,
      nombre_archivo: 'escritura.pdf',
      storage_path: `test/${String(Date.now())}.pdf`,
    })
    .select('grupo_id')
    .single<{ grupo_id: string }>()
  if (error) throw new Error(`fixture documento: ${error.message}`)
  return data.grupo_id
}

d('documentos_legal_holds (CJ-3)', () => {
  const admin = clienteAdmin(env!)
  let auxiliarUser: UsuarioPrueba
  let administradorUser: UsuarioPrueba
  let auditorUser: UsuarioPrueba
  let tenant: TenantPrueba
  let clienteAuxiliar: Cliente
  let clienteAdministrador: Cliente
  let clienteAuditor: Cliente
  let grupoId: string

  beforeAll(async () => {
    auxiliarUser = await crearUsuario(admin, 'hold-auxiliar')
    administradorUser = await crearUsuario(admin, 'hold-admin')
    auditorUser = await crearUsuario(admin, 'hold-auditor')
    tenant = await crearTenant(admin, 'hold', administradorUser.id)
    await crearMembership(admin, tenant.id, auxiliarUser.id, 'auxiliar')
    await crearMembership(admin, tenant.id, administradorUser.id, 'administrador')
    await crearMembership(admin, tenant.id, auditorUser.id, 'auditor')
    clienteAuxiliar = await clienteComo(env!, auxiliarUser)
    clienteAdministrador = await clienteComo(env!, administradorUser)
    clienteAuditor = await clienteComo(env!, auditorUser)

    grupoId = await crearDocumento(admin, tenant.id)
  }, 30_000)

  afterAll(async () => {
    await eliminarTenant(admin, tenant.id)
    await eliminarUsuario(admin, auxiliarUser.id)
    await eliminarUsuario(admin, administradorUser.id)
    await eliminarUsuario(admin, auditorUser.id)
  }, 30_000)

  it('DOCUMENTO_INVALIDO: rechaza activar un hold sobre un grupo_id inexistente', async () => {
    const { error } = await clienteAuxiliar.rpc('fn_activar_legal_hold', {
      p_tenant_id: tenant.id,
      p_documento_grupo_id: '00000000-0000-0000-0000-000000000000',
      p_motivo: 'inexistente',
    })
    expect(error).not.toBeNull()
    expect(error?.message).toMatch(/^DOCUMENTO_INVALIDO:/)
  })

  it('auditor NO puede activar un hold (FORBIDDEN)', async () => {
    const { error } = await clienteAuditor.rpc('fn_activar_legal_hold', {
      p_tenant_id: tenant.id,
      p_documento_grupo_id: grupoId,
      p_motivo: 'intento de auditor',
    })
    expect(error).not.toBeNull()
    expect(error?.message).toMatch(/^FORBIDDEN:/)
  })

  it('auxiliar puede activar un hold — queda auditado', async () => {
    const { data, error } = await clienteAuxiliar.rpc('fn_activar_legal_hold', {
      p_tenant_id: tenant.id,
      p_documento_grupo_id: grupoId,
      p_motivo: 'Caso jurídico en trámite',
    })
    expect(error).toBeNull()
    expect(data?.activo).toBe(true)
    expect(data?.motivo).toBe('Caso jurídico en trámite')

    const { data: auditoria } = await admin
      .from('audit_log')
      .select('action')
      .eq('tenant_id', tenant.id)
      .eq('action', 'documento.legal_hold_activado')
      .order('created_at', { ascending: false })
      .limit(1)
      .single()
    expect(auditoria?.action).toBe('documento.legal_hold_activado')
  })

  it('activar de nuevo sobre el mismo grupo_id actualiza el motivo (upsert), no duplica fila', async () => {
    const { data, error } = await clienteAuxiliar.rpc('fn_activar_legal_hold', {
      p_tenant_id: tenant.id,
      p_documento_grupo_id: grupoId,
      p_motivo: 'Motivo actualizado',
    })
    expect(error).toBeNull()
    expect(data?.motivo).toBe('Motivo actualizado')

    const { count } = await admin
      .from('documentos_legal_holds')
      .select('id', { count: 'exact', head: true })
      .eq('tenant_id', tenant.id)
      .eq('documento_grupo_id', grupoId)
    expect(count).toBe(1)
  })

  it('auxiliar NO puede liberar un hold (FORBIDDEN — exige administrador)', async () => {
    const { error } = await clienteAuxiliar.rpc('fn_liberar_legal_hold', {
      p_tenant_id: tenant.id,
      p_documento_grupo_id: grupoId,
      p_motivo: 'intento de auxiliar',
    })
    expect(error).not.toBeNull()
    expect(error?.message).toMatch(/^FORBIDDEN:/)
  })

  it('administrador libera el hold — queda auditado', async () => {
    const { data, error } = await clienteAdministrador.rpc('fn_liberar_legal_hold', {
      p_tenant_id: tenant.id,
      p_documento_grupo_id: grupoId,
      p_motivo: 'Caso jurídico cerrado',
    })
    expect(error).toBeNull()
    expect(data?.activo).toBe(false)

    const { data: auditoria } = await admin
      .from('audit_log')
      .select('action')
      .eq('tenant_id', tenant.id)
      .eq('action', 'documento.legal_hold_liberado')
      .order('created_at', { ascending: false })
      .limit(1)
      .single()
    expect(auditoria?.action).toBe('documento.legal_hold_liberado')
  })

  it('LEGAL_HOLD_NO_ENCONTRADO: liberar de nuevo (ya inactivo) falla', async () => {
    const { error } = await clienteAdministrador.rpc('fn_liberar_legal_hold', {
      p_tenant_id: tenant.id,
      p_documento_grupo_id: grupoId,
      p_motivo: 'segundo intento',
    })
    expect(error).not.toBeNull()
    expect(error?.message).toMatch(/^LEGAL_HOLD_NO_ENCONTRADO:/)
  })
})
