/**
 * FIN-4 addendum (20260932630000) — plantilla de escenario conservador + reglas de alerta
 * sembrada en borrador/inactiva desde create_tenant(). Decisión del usuario (2026-09-09, mismo
 * patrón ya aprobado para MANT-9): ver la cabecera de la migración y
 * Casos de uso/Tres Modulos/Financiero/FIN_04_flujo_proyectado.md.
 */
import { afterAll, describe, expect, it } from 'vitest'
import 'dotenv/config'
import {
  clienteAdmin,
  eliminarTenant,
  eliminarUsuario,
  crearUsuario,
  clienteComo,
  leerEntorno,
  RUN_ID,
  type UsuarioPrueba,
} from '../rls/helpers.js'

const env = leerEntorno()
const d = env ? describe : describe.skip
if (!env) {
  console.warn('SALTADO tests/finanzas/flujo-plantilla-default: faltan variables de Supabase en .env')
}

interface FilaFlujo {
  ingresos_esperados: number
  componentes_insuficientes: string[]
}

d('FIN-4 addendum: plantilla de escenario/alertas sembrada en borrador desde create_tenant', () => {
  const admin = clienteAdmin(env!)
  const tenantsCreados: string[] = []
  const usuariosCreados: UsuarioPrueba[] = []

  afterAll(async () => {
    for (const id of tenantsCreados) await eliminarTenant(admin, id)
    for (const usuario of usuariosCreados) await eliminarUsuario(admin, usuario.id)
  }, 60_000)

  async function crearTenant(etiqueta: string): Promise<string> {
    const usuario = await crearUsuario(admin, etiqueta)
    usuariosCreados.push(usuario)
    const cliente = await clienteComo(env!, usuario)
    const { data: tenant, error } = await cliente
      .rpc('create_tenant', { p_name: `FIN-4 addendum ${etiqueta}`, p_slug: `fin4add-${RUN_ID}-${etiqueta}` })
      .single<{ id: string }>()
    if (error) throw new Error(`create_tenant (${etiqueta}): ${error.message}`)
    tenantsCreados.push(tenant.id)
    return tenant.id
  }

  it('un tenant nuevo trae un finanzas_escenario_parametros conservador en borrador (no vigente)', async () => {
    const tenantId = await crearTenant('t1-escenario')
    const { data, error } = await admin
      .from('finanzas_escenario_parametros')
      .select('escenario, estado, version')
      .eq('tenant_id', tenantId)
      .single<{ escenario: string; estado: string; version: number }>()
    if (error) throw error
    expect(data.escenario).toBe('conservador')
    expect(data.estado).toBe('borrador')
  }, 30_000)

  it('un tenant nuevo trae 5 finanzas_alerta_regla, todas inactivas', async () => {
    const tenantId = await crearTenant('t2-reglas')
    const { data, error } = await admin
      .from('finanzas_alerta_regla')
      .select('activa')
      .eq('tenant_id', tenantId)
    if (error) throw error
    expect(data).toHaveLength(5)
    expect(data.every((r) => !r.activa)).toBe(true)
  }, 30_000)

  it('el borrador sembrado no afecta finanzas_flujo_proyectado hasta que se activa', async () => {
    const tenantId = await crearTenant('t3-sin-efecto')
    const { data, error } = await admin
      .rpc('finanzas_flujo_proyectado', { p_tenant_id: tenantId, p_horizonte_dias: 7, p_escenario: 'conservador' })
    if (error) throw error
    const filas = data as unknown as FilaFlujo[]
    const [primera] = filas
    if (!primera) throw new Error('finanzas_flujo_proyectado no devolvió filas')
    // Sin fila vigente (la sembrada quedó en borrador), conservador sigue datos_insuficientes
    // para ingresos — exactamente como si no existiera ninguna fila.
    expect(primera.componentes_insuficientes).toContain('ingresos_esperados')
    expect(primera.ingresos_esperados).toBe(0)
  }, 30_000)

  it('las 5 reglas inactivas no emiten ninguna alerta al correr finanzas_alertas_evaluar', async () => {
    const tenantId = await crearTenant('t4-sin-alertas')
    const { data: emitidas, error } = await admin.rpc('finanzas_alertas_evaluar', { p_tenant_id: tenantId })
    if (error) throw error
    expect(emitidas).toBe(0)
  }, 30_000)

  it('el escenario conservador sembrado puede activarse tal cual', async () => {
    const tenantId = await crearTenant('t5-activable')
    const { data: fila, error: errFila } = await admin
      .from('finanzas_escenario_parametros').select('id').eq('tenant_id', tenantId)
      .single<{ id: string }>()
    if (errFila) throw errFila
    const { error } = await admin.from('finanzas_escenario_parametros').update({ estado: 'vigente' }).eq('id', fila.id)
    expect(error).toBeNull()
  }, 30_000)
})
