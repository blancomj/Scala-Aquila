/**
 * RPT-04 — Centro de Reportes: favoritos, artefactos, auditoría y la
 * protección del historial (migraciones 20260940000000-20260940020000).
 *
 * Tres afirmaciones que solo se pueden comprobar contra la base:
 *
 * 1. Un favorito es PERSONAL. Que la RLS lo aísle por usuario —y no solo
 *    por copropiedad— es lo único que separa «mi pantalla» de «la pantalla
 *    de la administración».
 * 2. El bucket de artefactos no acepta escritura de `authenticated`. Es
 *    deliberado: el productor es el renderer de servidor de RPT-05. Si esta
 *    prueba empezara a pasar en verde al revés, el bucket habría dejado de
 *    ser evidencia de nada.
 * 3. Un reporte ya ejecutado no se borra. `reporte_ejecuciones` es
 *    append-only por SEC-14, pero su FK a `reportes` cascadea: sin el
 *    guardia, borrar el padre borraba el historial sin violar ningún
 *    disparador.
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
  console.warn('SALTADO tests/rls/reportes-centro: faltan variables de Supabase en .env')
}

const DEFINICION = {
  fuente: 'recaudos',
  campos: [{ campo: 'inmueble' }, { campo: 'monto' }],
  orden: [{ campo: 'inmueble', direccion: 'asc' }],
}

interface FilaId {
  id: string
}

d('RPT-04 · Centro de Reportes', () => {
  let admin: Cliente
  let tenant: TenantPrueba
  let otroTenant: TenantPrueba
  let auxiliar: UsuarioPrueba
  let auditor: UsuarioPrueba
  let clienteAuxiliar: Cliente
  let clienteAuditor: Cliente
  let reporteId: string
  let versionId: string

  beforeAll(async () => {
    admin = clienteAdmin(env!)
    tenant = await crearTenant(admin, 'rpt4')
    otroTenant = await crearTenant(admin, 'rpt4-otro')
    auxiliar = await crearUsuario(admin, 'rpt4-auxiliar')
    auditor = await crearUsuario(admin, 'rpt4-auditor')
    await crearMembership(admin, tenant.id, auxiliar.id, 'auxiliar')
    await crearMembership(admin, tenant.id, auditor.id, 'auditor')
    clienteAuxiliar = await clienteComo(env!, auxiliar)
    clienteAuditor = await clienteComo(env!, auditor)

    const { data: reporte, error } = await clienteAuxiliar
      .from('reportes')
      .insert({ tenant_id: tenant.id, codigo: 'RPT4-001', nombre: 'Recaudos del corte' })
      .select('id')
      .single<FilaId>()
    if (error) throw error
    reporteId = reporte.id

    const { data: version, error: errorVersion } = await clienteAuxiliar
      .from('reporte_versiones')
      .insert({
        tenant_id: tenant.id,
        reporte_id: reporteId,
        version: 1,
        estado: 'borrador',
        definicion: DEFINICION,
      })
      .select('id')
      .single<FilaId>()
    if (errorVersion) throw errorVersion
    versionId = version.id
  }, 90_000)

  afterAll(async () => {
    if (!env) return
    await eliminarTenant(admin, tenant.id)
    await eliminarTenant(admin, otroTenant.id)
    await eliminarUsuario(admin, auxiliar.id)
    await eliminarUsuario(admin, auditor.id)
  }, 90_000)

  // ── Favoritos ────────────────────────────────────────────────────────
  it('un favorito es personal: el auditor no ve el del auxiliar', async () => {
    const { error } = await clienteAuxiliar
      .from('reporte_favoritos')
      .insert({ tenant_id: tenant.id, reporte_id: reporteId, profile_id: auxiliar.id })
    expect(error).toBeNull()

    const { data: mios } = await clienteAuxiliar.from('reporte_favoritos').select('reporte_id')
    expect(mios).toHaveLength(1)

    // Mismo tenant, mismo reporte, otro usuario: no debe ver nada.
    const { data: ajenos } = await clienteAuditor.from('reporte_favoritos').select('reporte_id')
    expect(ajenos).toEqual([])
  })

  it('nadie puede marcar un favorito a nombre de otro usuario', async () => {
    const { error } = await clienteAuditor
      .from('reporte_favoritos')
      .insert({ tenant_id: tenant.id, reporte_id: reporteId, profile_id: auxiliar.id })
    // 42501 y no otro: lo tiene que rechazar la política, no un error de
    // esquema. Una prueba negativa que pasa por el motivo equivocado no
    // prueba nada.
    expect(error?.code).toBe('42501')
  })

  it('no se puede guardar un favorito de un reporte de otra copropiedad', async () => {
    // El reporte es del tenant de prueba, pero se intenta etiquetar con un
    // tenant_id distinto — la fila incoherente que el WITH CHECK impide.
    const { error } = await clienteAuxiliar.from('reporte_favoritos').insert({
      tenant_id: otroTenant.id,
      reporte_id: reporteId,
      profile_id: auxiliar.id,
    })
    expect(error?.code).toBe('42501')
  })

  it('quitar el favorito solo afecta al propio usuario', async () => {
    const { error } = await clienteAuxiliar
      .from('reporte_favoritos')
      .delete()
      .eq('reporte_id', reporteId)
      .eq('profile_id', auxiliar.id)
    expect(error).toBeNull()

    const { data } = await clienteAuxiliar.from('reporte_favoritos').select('reporte_id')
    expect(data).toEqual([])
  })

  // ── Artefactos ───────────────────────────────────────────────────────
  it('un miembro lee los artefactos de su copropiedad y nada más', async () => {
    const { data, error } = await clienteAuxiliar.from('reporte_artefactos').select('id')
    expect(error).toBeNull()
    expect(data).toEqual([])
  })

  it('authenticated NO puede insertar un artefacto: solo escribe el servidor', async () => {
    // Hace falta una ejecución real para tener a qué colgarlo.
    const { data: ejecucion, error: errorEjecucion } = await clienteAuxiliar
      .from('reporte_ejecuciones')
      .insert({
        tenant_id: tenant.id,
        reporte_id: reporteId,
        version_id: versionId,
        formato: 'pantalla',
        exito: true,
        filas: 0,
      })
      .select('id')
      .single<FilaId>()
    expect(errorEjecucion).toBeNull()

    const { error } = await clienteAuxiliar.from('reporte_artefactos').insert({
      tenant_id: tenant.id,
      ejecucion_id: ejecucion!.id,
      storage_path: `${tenant.id}/${ejecucion!.id}.pdf`,
      mime: 'application/pdf',
      bytes: 1024,
      sha256: 'a'.repeat(64),
      expira_at: new Date(Date.now() + 86_400_000).toISOString(),
    })
    // Sin política de INSERT, la tabla rechaza por RLS (42501) — no porque
    // la fila esté mal formada: arriba va completa y válida a propósito.
    expect(error?.code).toBe('42501')
  })

  // ── Auditoría ────────────────────────────────────────────────────────
  it('una consulta en pantalla NO ensucia la auditoría', async () => {
    // La del test anterior ya corrió con formato 'pantalla'.
    const { data } = await clienteAuditor
      .from('audit_log')
      .select('action')
      .eq('tenant_id', tenant.id)
      .eq('action', 'reporte.exportado')
    expect(data).toEqual([])
  })

  it('exportar sí queda auditado, con su formato', async () => {
    const { error } = await clienteAuxiliar.from('reporte_ejecuciones').insert({
      tenant_id: tenant.id,
      reporte_id: reporteId,
      version_id: versionId,
      formato: 'xlsx',
      exito: true,
      filas: 12,
    })
    expect(error).toBeNull()

    const { data } = await clienteAuditor
      .from('audit_log')
      .select('action, metadata')
      .eq('tenant_id', tenant.id)
      .eq('action', 'reporte.exportado')
    expect(data).toHaveLength(1)
    expect((data![0]!.metadata as { formato: string }).formato).toBe('xlsx')
  })

  it('publicar una versión queda en audit_log con su definición sellada', async () => {
    const { error } = await clienteAuxiliar
      .from('reporte_versiones')
      .update({
        estado: 'publicada',
        publicada_por: auxiliar.id,
        publicada_at: new Date().toISOString(),
      })
      .eq('id', versionId)
    expect(error).toBeNull()

    const { data } = await clienteAuditor
      .from('audit_log')
      .select('action, entity_id, metadata')
      .eq('tenant_id', tenant.id)
      .eq('action', 'reporte.publicado')
    expect(data).toHaveLength(1)
    expect(data![0]!.entity_id).toBe(versionId)
    expect((data![0]!.metadata as { version: number }).version).toBe(1)
  })

  // ── El historial no se borra por la puerta de atrás ───────────────────
  it('un reporte ya ejecutado no se puede borrar', async () => {
    const { error } = await clienteAuxiliar.from('reportes').delete().eq('id', reporteId)
    expect(error).not.toBeNull()
    expect(error!.message).toContain('RPT_REPORTE_CON_HISTORIAL')

    // Y sigue ahí, con su historial intacto.
    const { data } = await clienteAuxiliar
      .from('reporte_ejecuciones')
      .select('id')
      .eq('reporte_id', reporteId)
    expect(data!.length).toBeGreaterThanOrEqual(2)
  })

  it('un reporte sin historial sí se borra: el guardia no estorba', async () => {
    const { data: nuevo, error: errorAlta } = await clienteAuxiliar
      .from('reportes')
      .insert({ tenant_id: tenant.id, codigo: 'RPT4-002', nombre: 'Nunca ejecutado' })
      .select('id')
      .single<FilaId>()
    expect(errorAlta).toBeNull()

    const { error } = await clienteAuxiliar.from('reportes').delete().eq('id', nuevo!.id)
    expect(error).toBeNull()

    const { data } = await clienteAuxiliar.from('reportes').select('id').eq('id', nuevo!.id)
    expect(data).toEqual([])
  })
})
