/**
 * guard_politica_financiera_tope_legal — CAR F2, golden cases PH-C36/PH-C37
 * (Docs/Motor de gestion de cartera/CAR_00_Guia_Oficial.md §3.4/§13.3).
 *
 * Art. 30 Ley 675/2001: el interés de mora no puede exceder multiplicador ×
 * la tasa de referencia (hoy, IBC) vigente; la asamblea puede fijar menos,
 * nunca más. Cubre: rechazo al exceder el tope (PH-C36), aceptación por
 * debajo del tope (PH-C37), que una política SIN interés de mora puede
 * omitir tipo_tasa/multiplicador (nada que topar), y que desde S2
 * (auditoría 2026-08-26) una política CON interés de mora ya no puede
 * omitirlos — antes era opt-in sin límite de tiempo, decisión revertida
 * tras el hallazgo.
 *
 * S3 (2026-08-29): el multiplicador mismo tiene ahora un techo. Hasta
 * 20260908130000 el guard validaba la tasa contra `multiplicador × tasa de
 * referencia` sin que nadie limitara el multiplicador, declarado por el propio
 * tenant — el tope "legal" era circular: bastaba declarar 3.0 para cobrar el
 * triple del IBC y pasar. El art. 30 permite hasta 1.5.
 *
 * tasas_referencia es append-only y GLOBAL (sin tenant_id) — la fila de
 * prueba que este archivo inserta NO se puede borrar después y queda
 * permanentemente en la base. Se usa una fecha en el pasado lejano,
 * derivada de RUN_ID para no colisionar entre corridas concurrentes, y
 * resolucion_numero prefijado "TEST-" para dejarla identificable sin
 * ambigüedad como dato de prueba, nunca como una tasa real.
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
  RUN_ID,
  type Cliente,
  type TenantPrueba,
  type UsuarioPrueba,
} from './helpers.js'

const env = leerEntorno()
const d = env ? describe : describe.skip

if (!env) {
  console.warn('SALTADO tests/rls/politica-financiera-tope-legal: faltan variables de Supabase en .env')
}

/** Año/mes/día en 1000-1900, derivados de RUN_ID — no colisiona con datos reales
 * ni, con probabilidad astronómicamente baja, con otra corrida concurrente. */
function fechaDePruebaAislada(): string {
  const anio = 1000 + (parseInt(RUN_ID.slice(0, 3), 16) % 900)
  const mes = 1 + (parseInt(RUN_ID.slice(3, 5), 16) % 12)
  const dia = 1 + (parseInt(RUN_ID.slice(5, 7), 16) % 28)
  return `${String(anio).padStart(4, '0')}-${String(mes).padStart(2, '0')}-${String(dia).padStart(2, '0')}`
}

d('guard_politica_financiera_tope_legal (CAR §3.4, PH-C36/PH-C37)', () => {
  let admin: Cliente
  const usuarios: UsuarioPrueba[] = []
  const tenants: TenantPrueba[] = []
  let fechaTasa: string

  beforeAll(async () => {
    admin = clienteAdmin(env!)

    fechaTasa = fechaDePruebaAislada()
    const { error: errTasa } = await admin.from('tasas_referencia').insert({
      tipo_tasa: 'ibc_consumo_ordinario',
      vigente_desde: fechaTasa,
      vigente_hasta: fechaTasa,
      valor_ea: 0.24,
      valor_mensual: 0.02,
      resolucion_numero: `TEST-${RUN_ID}`,
      resolucion_fecha: fechaTasa,
      entidad_fuente: 'Dato de prueba automatizado — no es una tasa real',
    })
    if (errTasa) throw new Error(`fixture tasas_referencia: ${errTasa.message}`)
  })

  afterAll(async () => {
    for (const tenant of tenants) await eliminarTenant(admin, tenant.id)
    for (const usuario of usuarios) await eliminarUsuario(admin, usuario.id)
    // tasas_referencia es append-only — la fila de prueba queda para siempre,
    // a propósito (ver docstring del archivo).
  })

  // Cada caso usa su propio tenant: politicas_financieras_vigente_unica
  // permite solo UNA política 'vigente' por tenant a la vez, y dos de estos
  // casos activan una con éxito — no pueden compartir tenant entre sí.
  async function tenantDePrueba(etiqueta: string): Promise<TenantPrueba> {
    const usuario = await crearUsuario(admin, etiqueta)
    usuarios.push(usuario)
    const tenant = await crearTenant(admin, etiqueta, usuario.id)
    tenants.push(tenant)
    await crearMembership(admin, tenant.id, usuario.id, 'auxiliar')
    return tenant
  }

  function politicaBase(tenantId: string, overrides: Record<string, unknown>) {
    return {
      tenant_id: tenantId,
      version: 1,
      estado: 'vigente' as const,
      vigente_desde: fechaTasa,
      redondeo_modo: 'half_up' as const,
      redondeo_escala: 0,
      residual_metodo: 'mayor_resto' as const,
      coeficientes_suma_esperada: 1,
      policy_hash: `test-fixture-tope-legal-${RUN_ID}-${tenantId}`,
      imputacion_orden: ['interes', 'capital', 'otro'],
      imputacion_estrategia: 'deuda_mas_antigua' as const,
      ...overrides,
    }
  }

  it('PH-C36: rechaza interes_tasa_mensual por encima de multiplicador × tasa de referencia', async () => {
    const tenant = await tenantDePrueba('ph-c36')
    const { error } = await admin.from('politicas_financieras').insert(
      politicaBase(tenant.id, {
        interes_tipo_tasa: 'ibc_consumo_ordinario',
        interes_multiplicador: 1.5, // tope = 1.5 × 0.02 = 0.03
        interes_tasa_mensual: 0.05, // excede el tope
        interes_tope_mensual: 0.05,
      }),
    )
    expect(error).not.toBeNull()
    expect(error?.message).toContain('INTERES_EXCEDE_TOPE_LEGAL')
  })

  it('PH-C37: acepta interes_tasa_mensual por debajo de multiplicador × tasa de referencia', async () => {
    const tenant = await tenantDePrueba('ph-c37')
    const { error } = await admin.from('politicas_financieras').insert(
      politicaBase(tenant.id, {
        interes_tipo_tasa: 'ibc_consumo_ordinario',
        interes_multiplicador: 1.5, // tope = 0.03
        interes_tasa_mensual: 0.02, // dentro del tope — igual a la tasa de referencia
        interes_tope_mensual: 0.03, // exactamente en el tope, no lo excede
      }),
    )
    expect(error).toBeNull()
  })

  it('rechaza también cuando solo interes_tope_mensual (no la tasa) excede el límite', async () => {
    const tenant = await tenantDePrueba('tope-solo')
    const { error } = await admin.from('politicas_financieras').insert(
      politicaBase(tenant.id, {
        interes_tipo_tasa: 'ibc_consumo_ordinario',
        interes_multiplicador: 1.5,
        interes_tasa_mensual: 0.01,
        interes_tope_mensual: 0.05, // excede 0.03 aunque la tasa esté bien
      }),
    )
    expect(error).not.toBeNull()
    expect(error?.message).toContain('INTERES_EXCEDE_TOPE_LEGAL')
  })

  it('sin interés de mora (ambos campos null), tipo_tasa/multiplicador también pueden omitirse', async () => {
    const tenant = await tenantDePrueba('sin-interes')
    const { error } = await admin.from('politicas_financieras').insert(
      politicaBase(tenant.id, {
        // interes_tasa_mensual / interes_tope_mensual / interes_tipo_tasa /
        // interes_multiplicador: ninguno declarado — política sin mora, nada
        // que topar.
      }),
    )
    expect(error).toBeNull()
  })

  it('S2 (auditoría 2026-08-26): declarar interés de mora sin tipo_tasa/multiplicador se rechaza', async () => {
    const tenant = await tenantDePrueba('sin-tope-declarado')
    const { error } = await admin.from('politicas_financieras').insert(
      politicaBase(tenant.id, {
        interes_tasa_mensual: 0.5, // muy por encima de cualquier tope legal razonable
        interes_tope_mensual: 0.5,
        // interes_tipo_tasa / interes_multiplicador: no declarados (null) —
        // antes de S2 esto se aceptaba en silencio (GAP-CAR-004 original).
      }),
    )
    expect(error).not.toBeNull()
    expect(error?.message).toContain('TOPE_LEGAL_NO_DECLARADO')
  })

  it('S3: rechaza un multiplicador por encima de 1.5, aunque la tasa quepa bajo ese tope inflado', async () => {
    const tenant = await tenantDePrueba('multiplicador-ilegal')
    const { error } = await admin.from('politicas_financieras').insert(
      politicaBase(tenant.id, {
        interes_tipo_tasa: 'ibc_consumo_ordinario',
        interes_multiplicador: 3, // el art. 30 permite hasta 1.5
        // 0.05 cabe en 3 × 0.02 = 0.06, así que el guard de tope legal lo
        // aprobaría: lo que se rechaza es el múltiplo, no la tasa.
        interes_tasa_mensual: 0.05,
        interes_tope_mensual: 0.05,
      }),
    )
    expect(error).not.toBeNull()
    expect(error?.message).toContain('politicas_financieras_multiplicador_tope_legal')
  })

  it('S3: un multiplicador menor que 1.5 sigue siendo válido — la asamblea puede fijar menos', async () => {
    const tenant = await tenantDePrueba('multiplicador-menor')
    const { error } = await admin.from('politicas_financieras').insert(
      politicaBase(tenant.id, {
        interes_tipo_tasa: 'ibc_consumo_ordinario',
        interes_multiplicador: 1.2, // tope = 1.2 × 0.02 = 0.024
        interes_tasa_mensual: 0.02,
        interes_tope_mensual: 0.024,
      }),
    )
    expect(error).toBeNull()
  })
})
