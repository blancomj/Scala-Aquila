/**
 * subir-evidencia-auditoria (Edge Function, HTTP real) — PROMPT_MAESTRO_
 * MODULO_AUDITORIA_AQUILA §34, §70. Único punto de escritura hacia el
 * bucket `auditoria-evidencias` y hacia auditoria_evidencias (INSERT-only,
 * mismo criterio de integridad que subir-documento: el hash SHA-256 se
 * calcula en servidor, nunca se confía en uno enviado por el cliente).
 *
 * No repite el rate limit de punta a punta (ya probado en
 * tests/tenancy/create-tenant.test.ts) — se enfoca en el contrato HTTP:
 * validación de payload/archivo, resolución del tenant desde el hallazgo,
 * el rol requerido (auditor/administrador) y que el objeto realmente
 * aterriza en Storage bajo la ruta esperada.
 */
import { afterAll, describe, expect, it } from 'vitest'
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
} from '../rls/helpers.js'

const env = leerEntorno()
const d = env ? describe : describe.skip

if (!env) {
  console.warn('SALTADO tests/tenancy/subir-evidencia-auditoria: faltan variables de Supabase en .env')
}

interface RespuestaEvidencia {
  id: string
  tenant_id: string
  hallazgo_id: string
  tipo: string
  archivo_path: string
  hash: string
}

const PDF_MINIMO = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x34]) // "%PDF-1.4"

async function crearEngagementFixture(admin: Cliente, tenantId: string, creadoPor: string): Promise<string> {
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
  responsable?: string,
): Promise<string> {
  const { data, error } = await admin
    .from('auditoria_hallazgos')
    .insert({
      tenant_id: tenantId,
      engagement_id: engagementId,
      proceso: 'Cartera',
      nivel: 'MEDIO',
      created_by: creadoPor,
      responsable: responsable ?? null,
    })
    .select('id')
    .single<{ id: string }>()
  if (error) throw new Error(`fixture hallazgo: ${error.message}`)
  return data.id
}

function archivoValido(nombre = 'evidencia.pdf'): File {
  return new File([PDF_MINIMO], nombre, { type: 'application/pdf' })
}

function formularioValido(hallazgoId: string, archivo = archivoValido()): FormData {
  const form = new FormData()
  form.set('hallazgo_id', hallazgoId)
  form.set('tipo', 'DOCUMENTO')
  form.set('archivo', archivo)
  return form
}

d('subir-evidencia-auditoria (Edge Function)', () => {
  const admin = clienteAdmin(env!)
  let auditor: UsuarioPrueba
  let auxiliar: UsuarioPrueba
  let administrador: UsuarioPrueba
  let tenant: TenantPrueba
  let clienteAuditor: Cliente
  let clienteAuxiliar: Cliente
  let hallazgoId: string
  const storagePaths: string[] = []

  afterAll(async () => {
    if (storagePaths.length > 0) {
      await admin.storage.from('auditoria-evidencias').remove(storagePaths)
    }
    await eliminarTenant(admin, tenant.id)
    await eliminarUsuario(admin, auditor.id)
    await eliminarUsuario(admin, auxiliar.id)
    await eliminarUsuario(admin, administrador.id)
  })

  it('setup', async () => {
    auditor = await crearUsuario(admin, 'se-auditor')
    auxiliar = await crearUsuario(admin, 'se-auxiliar')
    administrador = await crearUsuario(admin, 'se-admin')
    tenant = await crearTenant(admin, 'se', auditor.id)
    await crearMembership(admin, tenant.id, auditor.id, 'auditor')
    await crearMembership(admin, tenant.id, auxiliar.id, 'auxiliar')
    await crearMembership(admin, tenant.id, administrador.id, 'administrador')
    clienteAuditor = await clienteComo(env!, auditor)
    clienteAuxiliar = await clienteComo(env!, auxiliar)
    const engagement = await crearEngagementFixture(admin, tenant.id, auditor.id)
    hallazgoId = await crearHallazgoFixture(admin, tenant.id, engagement, auditor.id)
  }, 30_000)

  it('flujo feliz: auditor sube un PDF, responde 200 y el objeto queda en Storage', async () => {
    const { data, response } = await clienteAuditor.functions.invoke<RespuestaEvidencia>(
      'subir-evidencia-auditoria',
      { body: formularioValido(hallazgoId) },
    )

    expect(response?.status).toBe(200)
    expect(data?.tipo).toBe('DOCUMENTO')
    expect(data?.archivo_path).toContain(`${tenant.id}/${hallazgoId}/`)
    if (data) storagePaths.push(data.archivo_path)

    const { data: bajado, error: errBajado } = await admin.storage
      .from('auditoria-evidencias')
      .download(data!.archivo_path)
    expect(errBajado).toBeNull()
    expect(bajado?.size).toBeGreaterThan(0)

    const { data: fila } = await admin
      .from('auditoria_evidencias')
      .select('id, tenant_id, hallazgo_id, usuario_id')
      .eq('id', data!.id)
      .single()
    expect(fila?.tenant_id).toBe(tenant.id)
    expect(fila?.hallazgo_id).toBe(hallazgoId)
    expect(fila?.usuario_id).toBe(auditor.id)
  }, 30_000)

  it('EVIDENCIA_DUPLICADA (409): el mismo archivo ya fue adjuntado a este hallazgo', async () => {
    const { data, response } = await clienteAuditor.functions.invoke<RespuestaEvidencia>(
      'subir-evidencia-auditoria',
      { body: formularioValido(hallazgoId) },
    )

    expect(data).toBeNull()
    expect(response?.status).toBe(409)
  }, 30_000)

  it('INVALID_PAYLOAD (400): hallazgo_id no es un uuid válido', async () => {
    const form = formularioValido(hallazgoId)
    form.set('hallazgo_id', 'no-es-un-uuid')
    const { data, response } = await clienteAuditor.functions.invoke<RespuestaEvidencia>(
      'subir-evidencia-auditoria',
      { body: form },
    )

    expect(data).toBeNull()
    expect(response?.status).toBe(400)
  }, 30_000)

  it('INVALID_PAYLOAD (400): tipo no pertenece al catálogo de evidencias', async () => {
    const form = formularioValido(hallazgoId)
    form.set('tipo', 'NO_EXISTE')
    const { data, response } = await clienteAuditor.functions.invoke<RespuestaEvidencia>(
      'subir-evidencia-auditoria',
      { body: form },
    )

    expect(data).toBeNull()
    expect(response?.status).toBe(400)
  }, 30_000)

  it('ARCHIVO_INVALIDO (400): tipo MIME no permitido', async () => {
    const archivoTexto = new File(['hola'], 'nota.txt', { type: 'text/plain' })
    const { data, response } = await clienteAuditor.functions.invoke<RespuestaEvidencia>(
      'subir-evidencia-auditoria',
      { body: formularioValido(hallazgoId, archivoTexto) },
    )

    expect(data).toBeNull()
    expect(response?.status).toBe(400)
  }, 30_000)

  it('HALLAZGO_NO_ENCONTRADO (404): hallazgo inexistente', async () => {
    const { data, response } = await clienteAuditor.functions.invoke<RespuestaEvidencia>(
      'subir-evidencia-auditoria',
      { body: formularioValido('00000000-0000-0000-0000-000000000000') },
    )

    expect(data).toBeNull()
    expect(response?.status).toBe(404)
  }, 30_000)

  it('FORBIDDEN (403): un auxiliar responsable del hallazgo no puede adjuntarle evidencia', async () => {
    const engagement = await crearEngagementFixture(admin, tenant.id, auditor.id)
    const hallazgoAsignado = await crearHallazgoFixture(admin, tenant.id, engagement, auditor.id, auxiliar.id)

    const { data, response } = await clienteAuxiliar.functions.invoke<RespuestaEvidencia>(
      'subir-evidencia-auditoria',
      { body: formularioValido(hallazgoAsignado, archivoValido('otro.pdf')) },
    )

    expect(data).toBeNull()
    expect(response?.status).toBe(403)
  }, 30_000)
})
