/**
 * MANT-9 addendum (20260932530000) — plantilla de factores de salud sembrada en borrador
 * dentro de create_tenant(). Decisión del usuario (2026-09-09), posterior al cierre del corte:
 * ver `Casos de uso/Tres Modulos/Mantenimiento/MANT_09_salud_decision.md` y el encabezado de la
 * migración. Cero efecto sobre cualquier índice real hasta activación consciente — eso es
 * exactamente lo que este archivo verifica.
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
  console.warn('SALTADO tests/mantenimiento/salud-plantilla-default: faltan variables de Supabase en .env')
}

interface SaludResultado {
  indice: number | null
  set_id: string | null
  version: number | null
  desglose: unknown[]
}

d('MANT-9 addendum: plantilla de salud sembrada en borrador desde create_tenant', () => {
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
      .rpc('create_tenant', { p_name: `MANT-9 addendum ${etiqueta}`, p_slug: `t9add-${RUN_ID}-${etiqueta}` })
      .single<{ id: string }>()
    if (error) throw new Error(`create_tenant (${etiqueta}): ${error.message}`)
    tenantsCreados.push(tenant.id)
    return tenant.id
  }

  it('un tenant nuevo trae exactamente un set en borrador, 10 factores y pesos que suman 100', async () => {
    const tenantId = await crearTenant('t1-plantilla')

    const { data: set, error: errSet } = await admin
      .from('mant_salud_set')
      .select('id, version, estado')
      .eq('tenant_id', tenantId)
      .single<{ id: string; version: number; estado: string }>()
    if (errSet) throw errSet
    expect(set.version).toBe(1)
    expect(set.estado).toBe('borrador')

    const setId = set.id
    const { data: factores, error: errFactores } = await admin
      .from('mant_salud_factor')
      .select('codigo, peso')
      .eq('set_id', setId)
    if (errFactores) throw errFactores
    expect(factores).toHaveLength(10)
    const sumaPesos = factores.reduce((acc, f) => acc + f.peso, 0)
    expect(sumaPesos).toBeCloseTo(100, 2)

    const { data: bandas, error: errBandas } = await admin
      .from('mant_salud_banda')
      .select('id')
      .eq('set_id', setId)
    if (errBandas) throw errBandas
    expect(bandas).toHaveLength(4)
  }, 30_000)

  it('el borrador sembrado no afecta mant_salud() hasta que se activa conscientemente', async () => {
    const tenantId = await crearTenant('t2-sin-efecto')

    const activoFalso = '00000000-0000-0000-0000-000000000000'
    const { data, error } = await admin
      .rpc('mant_salud', { p_tenant_id: tenantId, p_activo_id: activoFalso })
      .single<SaludResultado>()
    if (error) throw error
    expect(data.indice).toBeNull()
    expect(data.set_id).toBeNull()
    expect(data.desglose).toEqual([])
  }, 30_000)

  it('el borrador sembrado puede activarse tal cual, sin retocar pesos (ya suman 100)', async () => {
    const tenantId = await crearTenant('t3-activable')
    const { data: set, error: errSet } = await admin
      .from('mant_salud_set')
      .select('id')
      .eq('tenant_id', tenantId)
      .single<{ id: string }>()
    if (errSet) throw errSet

    const { error: errActivar } = await admin
      .from('mant_salud_set')
      .update({ estado: 'vigente' })
      .eq('id', set.id)
    expect(errActivar).toBeNull()
  }, 30_000)
})
