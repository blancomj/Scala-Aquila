/**
 * subir-documento (Edge Function, HTTP real) — cierra el gap §8.1 de
 * PROMPT_FICHA_INMUEBLE.md. Único punto de escritura hacia el bucket
 * `documentos-inmueble` y hacia documentos (antes documentos_inmueble, que
 * no tiene política INSERT para `authenticated`, mismo criterio que
 * pagos/liquidaciones).
 *
 * No repite el rate limit de punta a punta (ya probado en
 * tests/tenancy/create-tenant.test.ts) — se enfoca en el contrato HTTP:
 * validación de archivo/tipo, aislamiento por tenant, rol requerido, y que
 * el objeto realmente aterriza en Storage bajo la ruta esperada.
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
  console.warn('SALTADO tests/tenancy/subir-documento: faltan variables de Supabase en .env')
}

interface RespuestaDocumento {
  id: string
  grupo_id: string
  version: number
  storage_path: string
  nombre_archivo: string
  tamano_bytes: number
}

const PDF_MINIMO = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x34]) // "%PDF-1.4"

async function tipoApartamentoId(admin: Cliente): Promise<number> {
  const { data, error } = await admin
    .from('lista_tipos')
    .select('id')
    .eq('tipo', 'TIPO_INMUEBLE')
    .eq('codigo', 'apartamento')
    .is('tenant_id', null)
    .single<{ id: number }>()
  if (error) throw new Error(`fixture tipo apartamento: ${error.message}`)
  return data.id
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

async function crearInmueble(admin: Cliente, tenantId: string): Promise<string> {
  const tipoId = await tipoApartamentoId(admin)
  const { data, error } = await admin
    .from('inmuebles')
    .insert({ tenant_id: tenantId, codigo: `DOC-${String(Date.now())}`, tipo_id: tipoId })
    .select('id')
    .single<{ id: string }>()
  if (error) throw new Error(`fixture inmueble: ${error.message}`)
  return data.id
}

function archivoValido(nombre = 'escritura.pdf'): File {
  return new File([PDF_MINIMO], nombre, { type: 'application/pdf' })
}

function formularioValido(inmuebleId: string, tipoDocumentoId: number, archivo = archivoValido()): FormData {
  const form = new FormData()
  form.set('inmueble_id', inmuebleId)
  form.set('tipo_documento_id', String(tipoDocumentoId))
  form.set('archivo', archivo)
  return form
}

d('subir-documento (Edge Function)', () => {
  const admin = clienteAdmin(env!)
  let agente: UsuarioPrueba
  let auditor: UsuarioPrueba
  let tenant: TenantPrueba
  let clienteAgent: Cliente
  let clienteAuditor: Cliente
  let inmuebleId: string
  let tipoDocumentoId: number
  const storagePaths: string[] = []

  afterAll(async () => {
    if (storagePaths.length > 0) {
      await admin.storage.from('documentos-inmueble').remove(storagePaths)
    }
    await eliminarTenant(admin, tenant.id)
    await eliminarUsuario(admin, agente.id)
    await eliminarUsuario(admin, auditor.id)
  })

  it('setup', async () => {
    agente = await crearUsuario(admin, 'sd-agent')
    auditor = await crearUsuario(admin, 'sd-auditor')
    tenant = await crearTenant(admin, 'sd', agente.id)
    await crearMembership(admin, tenant.id, agente.id, 'agent')
    await crearMembership(admin, tenant.id, auditor.id, 'auditor')
    clienteAgent = await clienteComo(env!, agente)
    clienteAuditor = await clienteComo(env!, auditor)
    inmuebleId = await crearInmueble(admin, tenant.id)
    tipoDocumentoId = await tipoDocumentoEscrituraId(admin)
  }, 30_000)

  it('flujo feliz: agent sube un PDF, responde 200 y el objeto queda en Storage', async () => {
    const { data, response } = await clienteAgent.functions.invoke<RespuestaDocumento>(
      'subir-documento',
      { body: formularioValido(inmuebleId, tipoDocumentoId) },
    )

    expect(response?.status).toBe(200)
    expect(data?.version).toBe(1)
    expect(data?.storage_path).toContain(`${tenant.id}/${inmuebleId}/`)
    if (data) storagePaths.push(data.storage_path)

    const { data: bajado, error: errBajado } = await admin.storage
      .from('documentos-inmueble')
      .download(data!.storage_path)
    expect(errBajado).toBeNull()
    expect(bajado?.size).toBeGreaterThan(0)

    const { data: fila } = await admin
      .from('documentos')
      .select('id, tenant_id, subido_por')
      .eq('id', data!.id)
      .single()
    expect(fila?.tenant_id).toBe(tenant.id)
    expect(fila?.subido_por).toBe(agente.id)
  }, 30_000)

  it('ARCHIVO_INVALIDO (400): tipo MIME no permitido', async () => {
    const archivoTexto = new File(['hola'], 'nota.txt', { type: 'text/plain' })
    const { data, response } = await clienteAgent.functions.invoke<RespuestaDocumento>(
      'subir-documento',
      { body: formularioValido(inmuebleId, tipoDocumentoId, archivoTexto) },
    )

    expect(data).toBeNull()
    expect(response?.status).toBe(400)
  }, 30_000)

  it('TIPO_DOCUMENTO_INVALIDO (400): tipo_documento_id no pertenece a TIPO_DOCUMENTO', async () => {
    const tipoInmuebleId = await tipoApartamentoId(admin)
    const { data, response } = await clienteAgent.functions.invoke<RespuestaDocumento>(
      'subir-documento',
      { body: formularioValido(inmuebleId, tipoInmuebleId) },
    )

    expect(data).toBeNull()
    expect(response?.status).toBe(400)
  }, 30_000)

  it('INMUEBLE_NO_ENCONTRADO (404): inmueble inexistente', async () => {
    const { data, response } = await clienteAgent.functions.invoke<RespuestaDocumento>(
      'subir-documento',
      {
        body: formularioValido('00000000-0000-0000-0000-000000000000', tipoDocumentoId),
      },
    )

    expect(data).toBeNull()
    expect(response?.status).toBe(404)
  }, 30_000)

  it('un auditor no puede subir documentos', async () => {
    const { data, response } = await clienteAuditor.functions.invoke<RespuestaDocumento>(
      'subir-documento',
      { body: formularioValido(inmuebleId, tipoDocumentoId) },
    )

    expect(data).toBeNull()
    expect(response?.status).not.toBe(200)
  }, 30_000)
})
