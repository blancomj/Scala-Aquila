/**
 * purge_audit_log_antiguo() — 20260814190000_purga_audit_log.sql (E7, §11.3).
 *
 * Confirma que la excepción del trigger es estrecha: solo la propia función
 * puede borrar de audit_log, y solo filas de más de 24 meses. Un DELETE
 * directo (incluso como admin) sigue rechazado — el test existente
 * (append-only-audit-log.test.ts) ya lo prueba y no debería verse afectado
 * por este cambio; aquí se re-verifica de paso.
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
  console.warn('SALTADO tests/rls/audit-log-purge: faltan variables de Supabase en .env')
}

d('purge_audit_log_antiguo(): purga solo lo viejo, nadie más puede borrar', () => {
  const admin: Cliente = clienteAdmin(env!)
  let usuario: UsuarioPrueba
  let tenant: TenantPrueba
  let filaViejaId: string
  let filaRecienteId: string

  beforeAll(async () => {
    usuario = await crearUsuario(admin, 'purga')
    tenant = await crearTenant(admin, 'purga', usuario.id)
    await crearMembership(admin, tenant.id, usuario.id, 'agent')

    const hace25Meses = new Date()
    hace25Meses.setMonth(hace25Meses.getMonth() - 25)

    const { data: vieja, error: errorVieja } = await admin
      .from('audit_log')
      .insert({
        tenant_id: tenant.id,
        actor_id: usuario.id,
        action: 'security.rate_limited',
        entity_type: 'test',
        created_at: hace25Meses.toISOString(),
      })
      .select('id')
      .single<{ id: string }>()
    if (errorVieja) throw new Error(`fixture fila vieja: ${errorVieja.message}`)
    filaViejaId = vieja.id

    const { data: reciente, error: errorReciente } = await admin
      .from('audit_log')
      .insert({ tenant_id: tenant.id, actor_id: usuario.id, action: 'security.rate_limited', entity_type: 'test' })
      .select('id')
      .single<{ id: string }>()
    if (errorReciente) throw new Error(`fixture fila reciente: ${errorReciente.message}`)
    filaRecienteId = reciente.id
  }, 30_000)

  afterAll(async () => {
    // La fila reciente (si sobrevivió, que debería) se limpia junto con el tenant.
    await eliminarTenant(admin, tenant.id)
    await eliminarUsuario(admin, usuario.id)
  })

  it('un DELETE directo sigue rechazado, incluso como admin (SEC-14 intacto)', async () => {
    const { error } = await admin.from('audit_log').delete().eq('id', filaViejaId)
    expect(error).not.toBeNull()
    expect(error?.message).toMatch(/APPEND_ONLY/)
  })

  it('purge_audit_log_antiguo() borra solo lo que tiene más de 24 meses', async () => {
    const { error } = await admin.rpc('purge_audit_log_antiguo')
    expect(error).toBeNull()

    const { data: vieja } = await admin.from('audit_log').select('id').eq('id', filaViejaId).maybeSingle()
    expect(vieja).toBeNull()

    const { data: reciente } = await admin.from('audit_log').select('id').eq('id', filaRecienteId).maybeSingle()
    expect(reciente).not.toBeNull()
  }, 30_000)
})
