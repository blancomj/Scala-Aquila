/**
 * SEC-14 — Fase I §6.3
 * audit_log es append-only: rechaza UPDATE y DELETE para todo rol,
 * incluido service_role (BYPASSRLS salta las políticas, pero no los
 * triggers — esa es exactamente la garantía que se está probando).
 */
import { describe, expect, it } from 'vitest'
import { clienteAdmin, leerEntorno } from './helpers.js'

const env = leerEntorno()
const d = env ? describe : describe.skip

if (!env) {
  console.warn('SALTADO tests/rls/append-only-audit-log: faltan credenciales Supabase en .env')
}

d('SEC-14: audit_log es append-only incluso para service_role', () => {
  const admin = clienteAdmin(env!)

  it('rechaza UPDATE sobre audit_log', async () => {
    const { data: filas } = await admin.from('audit_log').select('id').limit(1)
    if (!filas || filas.length === 0) {
      throw new Error(
        'audit_log está vacío: no hay fila para probar el trigger. ' +
          'Corre primero tenant-isolation.test.ts, que genera eventos de auditoría.',
      )
    }

    const { error } = await admin
      .from('audit_log')
      .update({ action: 'manipulado' })
      .eq('id', filas[0]!.id)

    expect(error).not.toBeNull()
    expect(error?.message).toMatch(/APPEND_ONLY/)
  }, 30_000)

  it('rechaza DELETE sobre audit_log', async () => {
    const { data: filas } = await admin.from('audit_log').select('id').limit(1)
    if (!filas || filas.length === 0) {
      throw new Error('audit_log está vacío: no hay fila para probar el trigger.')
    }

    const { error } = await admin.from('audit_log').delete().eq('id', filas[0]!.id)

    expect(error).not.toBeNull()
    expect(error?.message).toMatch(/APPEND_ONLY/)
  }, 30_000)
})
