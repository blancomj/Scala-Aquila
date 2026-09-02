/**
 * fn_buscar_global — 4 categorías del módulo de auditoría (PROMPT AUDITORÍA
 * §92), agregadas en 20260919100000_busqueda_global_auditoria.sql. El RPC
 * en sí (20260822150000, extendido 20260830410000) no tenía pruebas
 * automáticas todavía para ninguna de sus categorías — esta suite cubre
 * puntualmente lo que se agregó: riesgo/control/hallazgo/evidencia,
 * filtro por categoría y aislamiento cross-tenant.
 */
import { describe, expect, it } from 'vitest'
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
} from './helpers.js'

const env = leerEntorno()
const d = env ? describe : describe.skip

if (!env) {
  console.warn('SALTADO tests/rls/busqueda-global-auditoria: faltan credenciales Supabase en .env')
}

interface FilaBusqueda {
  categoria: string
  entidad_id: string
  titulo: string
  subtitulo: string
  inmueble_id: string | null
  rank: number
}

async function crearRiesgoFixture(admin: Cliente, tenantId: string, creadoPor: string, nombre: string) {
  const { data, error } = await admin
    .from('auditoria_riesgos')
    .insert({ tenant_id: tenantId, nombre, categoria: 'OPERATIVO', probabilidad: 3, impacto: 3, created_by: creadoPor })
    .select('id')
    .single<{ id: string }>()
  if (error) throw new Error(`fixture riesgo: ${error.message}`)
  return data.id
}

async function crearControlFixture(admin: Cliente, tenantId: string, riesgoId: string, creadoPor: string, nombre: string) {
  const { data, error } = await admin
    .from('auditoria_controles')
    .insert({
      tenant_id: tenantId,
      riesgo_id: riesgoId,
      nombre,
      tipo: 'PREVENTIVO',
      automatizado: false,
      manual: true,
      created_by: creadoPor,
    })
    .select('id')
    .single<{ id: string }>()
  if (error) throw new Error(`fixture control: ${error.message}`)
  return data.id
}

async function crearEngagementFixture(admin: Cliente, tenantId: string, creadoPor: string) {
  const { data, error } = await admin
    .from('auditoria_engagements')
    .insert({ tenant_id: tenantId, nombre: 'Engagement de prueba', created_by: creadoPor })
    .select('id')
    .single<{ id: string }>()
  if (error) throw new Error(`fixture engagement: ${error.message}`)
  return data.id
}

async function crearHallazgoFixture(
  admin: Cliente,
  tenantId: string,
  engagementId: string,
  creadoPor: string,
  condicion: string,
) {
  const { data, error } = await admin
    .from('auditoria_hallazgos')
    .insert({
      tenant_id: tenantId,
      engagement_id: engagementId,
      proceso: 'Búsqueda global',
      condicion,
      nivel: 'MEDIO',
      created_by: creadoPor,
    })
    .select('id')
    .single<{ id: string }>()
  if (error) throw new Error(`fixture hallazgo: ${error.message}`)
  return data.id
}

async function crearEvidenciaFixture(admin: Cliente, tenantId: string, hallazgoId: string, usuarioId: string, descripcion: string) {
  const { data, error } = await admin
    .from('auditoria_evidencias')
    .insert({ tenant_id: tenantId, hallazgo_id: hallazgoId, tipo: 'DOCUMENTO', usuario_id: usuarioId, descripcion })
    .select('id')
    .single<{ id: string }>()
  if (error) throw new Error(`fixture evidencia: ${error.message}`)
  return data.id
}

d('fn_buscar_global — categorías de auditoría', () => {
  const admin = clienteAdmin(env!)

  it('encuentra riesgo/control/hallazgo/evidencia por texto, con subtítulo resuelto', async () => {
    const sello = String(Date.now())
    const auditor = await crearUsuario(admin, 'bga-auditor')
    const tenant = await crearTenant(admin, 'bga', auditor.id)
    await crearMembership(admin, tenant.id, auditor.id, 'auditor')

    const riesgoId = await crearRiesgoFixture(admin, tenant.id, auditor.id, `Riesgo Zafiro${sello}`)
    const controlId = await crearControlFixture(admin, tenant.id, riesgoId, auditor.id, `Control Zafiro${sello}`)
    const engagementId = await crearEngagementFixture(admin, tenant.id, auditor.id)
    const hallazgoId = await crearHallazgoFixture(admin, tenant.id, engagementId, auditor.id, `Hallazgo Zafiro${sello}`)
    const evidenciaId = await crearEvidenciaFixture(admin, tenant.id, hallazgoId, auditor.id, `Evidencia Zafiro${sello}`)

    const clienteAuditor = await clienteComo(env!, auditor)

    const { data: riesgos, error: errorRiesgos } = await clienteAuditor.rpc('fn_buscar_global', {
      p_tenant_id: tenant.id,
      p_query: `Zafiro${sello}`,
      p_categoria: 'riesgo',
      p_limite: 20,
    })
    expect(errorRiesgos).toBeNull()
    const filasRiesgo = riesgos as FilaBusqueda[]
    expect(filasRiesgo).toHaveLength(1)
    expect(filasRiesgo[0]?.entidad_id).toBe(riesgoId)
    expect(filasRiesgo[0]?.subtitulo).toContain('OPERATIVO')

    const { data: controles, error: errorControles } = await clienteAuditor.rpc('fn_buscar_global', {
      p_tenant_id: tenant.id,
      p_query: `Zafiro${sello}`,
      p_categoria: 'control',
      p_limite: 20,
    })
    expect(errorControles).toBeNull()
    const filasControl = controles as FilaBusqueda[]
    expect(filasControl).toHaveLength(1)
    expect(filasControl[0]?.entidad_id).toBe(controlId)
    expect(filasControl[0]?.subtitulo).toBe('PREVENTIVO · Manual')

    const { data: hallazgos, error: errorHallazgos } = await clienteAuditor.rpc('fn_buscar_global', {
      p_tenant_id: tenant.id,
      p_query: `Zafiro${sello}`,
      p_categoria: 'hallazgo',
      p_limite: 20,
    })
    expect(errorHallazgos).toBeNull()
    const filasHallazgo = hallazgos as FilaBusqueda[]
    expect(filasHallazgo).toHaveLength(1)
    expect(filasHallazgo[0]?.entidad_id).toBe(hallazgoId)
    expect(filasHallazgo[0]?.titulo).toBe(`Hallazgo Zafiro${sello}`)

    const { data: evidencias, error: errorEvidencias } = await clienteAuditor.rpc('fn_buscar_global', {
      p_tenant_id: tenant.id,
      p_query: `Zafiro${sello}`,
      p_categoria: 'evidencia',
      p_limite: 20,
    })
    expect(errorEvidencias).toBeNull()
    const filasEvidencia = evidencias as FilaBusqueda[]
    expect(filasEvidencia).toHaveLength(1)
    expect(filasEvidencia[0]?.entidad_id).toBe(evidenciaId)

    // Sin filtro de categoría, las 4 aparecen juntas (entre otras que ya
    // existan en el tenant, por eso >= en vez de longitud exacta).
    const { data: todas, error: errorTodas } = await clienteAuditor.rpc('fn_buscar_global', {
      p_tenant_id: tenant.id,
      p_query: `Zafiro${sello}`,
      p_limite: 20,
    })
    expect(errorTodas).toBeNull()
    const categorias = new Set((todas as FilaBusqueda[]).map((f) => f.categoria))
    expect(categorias).toEqual(new Set(['riesgo', 'control', 'hallazgo', 'evidencia']))

    await eliminarTenant(admin, tenant.id)
    await eliminarUsuario(admin, auditor.id)
  }, 30_000)

  it('aísla por tenant: no encuentra el riesgo de otro tenant', async () => {
    const sello = String(Date.now())
    const auditorA = await crearUsuario(admin, 'bga-cross-a')
    const auditorB = await crearUsuario(admin, 'bga-cross-b')
    const tenantA = await crearTenant(admin, 'bga-cross-a', auditorA.id)
    const tenantB = await crearTenant(admin, 'bga-cross-b', auditorB.id)
    await crearMembership(admin, tenantA.id, auditorA.id, 'auditor')
    await crearMembership(admin, tenantB.id, auditorB.id, 'auditor')
    await crearRiesgoFixture(admin, tenantB.id, auditorB.id, `Riesgo Cruzado${sello}`)

    const clienteAuditorA = await clienteComo(env!, auditorA)
    const { data, error } = await clienteAuditorA.rpc('fn_buscar_global', {
      p_tenant_id: tenantA.id,
      p_query: `Cruzado${sello}`,
      p_categoria: 'riesgo',
      p_limite: 20,
    })
    expect(error).toBeNull()
    expect(data).toEqual([])

    await eliminarTenant(admin, tenantA.id)
    await eliminarTenant(admin, tenantB.id)
    await eliminarUsuario(admin, auditorA.id)
    await eliminarUsuario(admin, auditorB.id)
  }, 30_000)
})
