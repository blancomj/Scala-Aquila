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
  RUN_ID,
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

// Fixture del expediente jurídico usado por el caso caso_juridico_id
// (CAR §15.4) — casos_juridicos exige certificacion_id, que a su vez exige
// politica_financiera_id vigente y rol administrador (mismo criterio que
// tests/rls/cartera-juridico.test.ts).
async function crearCasoJuridico(
  admin: Cliente,
  env: NonNullable<ReturnType<typeof leerEntorno>>,
  tenant: TenantPrueba,
  inmuebleId: string,
  administrador: UsuarioPrueba,
): Promise<string> {
  const { data: politica, error: errorPolitica } = await admin
    .from('politicas_financieras')
    .insert({
      tenant_id: tenant.id,
      version: 1,
      estado: 'vigente',
      vigente_desde: '2026-01-01',
      redondeo_modo: 'half_up',
      redondeo_escala: 0,
      residual_metodo: 'mayor_resto',
      coeficientes_suma_esperada: 1,
      policy_hash: `test-fixture-hash-${RUN_ID}-${tenant.id}`,
    })
    .select('id')
    .single<{ id: string }>()
  if (errorPolitica) throw new Error(`fixture politica_financiera: ${errorPolitica.message}`)

  const clienteAdministrador = await clienteComo(env, administrador)
  const { data: certificacion, error: errorCert } = await clienteAdministrador
    .from('certificaciones_deuda')
    .insert({
      tenant_id: tenant.id,
      inmueble_id: inmuebleId,
      consecutivo: `CERT-SD-${String(Date.now())}`,
      fecha_expedicion: '2026-08-17',
      fecha_corte: '2026-08-01',
      monto_expensas_ordinarias: 500000,
      monto_expensas_extraordinarias: 0,
      monto_intereses_mora: 30000,
      monto_sanciones: 0,
      monto_otros: 0,
      monto_total: 530000,
      detalle_cargos: [{ cargoId: 'fixture', categoria: 'capital', saldoPendiente: '500000' }],
      politica_financiera_id: politica.id,
      politica_version: 1,
      cargo_firmante: 'Administrador',
      certificacion_hash: `test-fixture-hash-sd-${String(Date.now())}`,
    })
    .select('id')
    .single<{ id: string }>()
  if (errorCert) throw new Error(`fixture certificacion_deuda: ${errorCert.message}`)

  const { data: caso, error: errorCaso } = await clienteAdministrador
    .from('casos_juridicos')
    .insert({
      tenant_id: tenant.id,
      inmueble_id: inmuebleId,
      consecutivo: `CASO-SD-${String(Date.now())}`,
      certificacion_id: certificacion.id,
      fecha_remision: '2026-08-17',
      monto_pretension: 530000,
      fecha_pretension: '2026-08-17',
    })
    .select('id')
    .single<{ id: string }>()
  if (errorCaso) throw new Error(`fixture caso_juridico: ${errorCaso.message}`)
  return caso.id
}

async function listaTipoId(admin: Cliente, tipo: string, codigo: string): Promise<number> {
  const { data, error } = await admin
    .from('lista_tipos')
    .select('id')
    .eq('tipo', tipo)
    .eq('codigo', codigo)
    .is('tenant_id', null)
    .single<{ id: number }>()
  if (error) throw new Error(`fixture lista_tipos ${tipo}.${codigo}: ${error.message}`)
  return data.id
}

// Fixture del envío usado por envio_id (PRQ-CAR-022) — mismo camino que
// tests/tenancy/cartera-expediente-probatorio.test.ts: acciones_cobranza_envios
// exige un accion_id real, que a su vez exige política de clasificación y un
// tercero destinatario.
async function crearEnvio(
  admin: Cliente,
  tenant: TenantPrueba,
  inmuebleId: string,
): Promise<string> {
  const { data: politica, error: errorPolitica } = await admin
    .from('politicas_clasificacion_cartera')
    .insert({
      tenant_id: tenant.id,
      version: 1,
      estado: 'vigente',
      nombre: 'Política envío v1',
      policy_hash: `test-fixture-sd-envio-${tenant.id}`,
    })
    .select('id')
    .single<{ id: string }>()
  if (errorPolitica) throw new Error(`fixture politica_clasificacion_cartera: ${errorPolitica.message}`)

  const tipoIdent = await listaTipoId(admin, 'TIPO_IDENTIFICACION', 'cedula')
  const estadoActivo = await listaTipoId(admin, 'ESTADO_TERCERO', 'activo')
  const sello = String(Date.now())
  const { data: tercero, error: errorTercero } = await admin
    .from('terceros')
    .insert({
      tenant_id: tenant.id,
      tipo_identificacion_id: tipoIdent,
      numero_documento: `SD-${sello}`,
      tipo_persona: 'natural',
      primer_nombre: 'Deudor',
      primer_apellido: 'Prueba',
      email: `sd-envio-${sello}@example.test`,
      estado_id: estadoActivo,
    })
    .select('id')
    .single<{ id: string }>()
  if (errorTercero) throw new Error(`fixture tercero: ${errorTercero.message}`)

  const { data: accion, error: errorAccion } = await admin
    .from('acciones_cobranza')
    .insert({
      tenant_id: tenant.id,
      inmueble_id: inmuebleId,
      tipo_accion: 'email',
      canal: 'email',
      fecha_programada: '2026-08-17',
      clasificacion_codigo: 'MORA',
      politica_clasificacion_id: politica.id,
      politica_version: 1,
      dias_mora_al_momento: 45,
      deuda_total_al_momento: 500000,
      destinatario_tercero_id: tercero.id,
      destinatario_rol_codigo: 'copropietario',
      estado: 'programada',
      creada_por: 'job',
    })
    .select('id')
    .single<{ id: string }>()
  if (errorAccion) throw new Error(`fixture accion_cobranza: ${errorAccion.message}`)

  const { data: envio, error: errorEnvio } = await admin
    .from('acciones_cobranza_envios')
    .insert({
      tenant_id: tenant.id,
      accion_id: accion.id,
      intento_numero: 1,
      canal: 'email',
      destinatario_tercero_id: tercero.id,
      destinatario_contacto: 'sd-envio@example.test',
      plantilla_codigo: 'COB-RECORDATORIO',
      plantilla_version: 1,
      asunto: 'Estado de su cuenta',
      contenido_renderizado: 'Señor(a) propietario(a): a la fecha registra un saldo pendiente…',
      contenido_hash: `hash-sd-${accion.id}`,
      proveedor: 'brevo',
    })
    .select('id')
    .single<{ id: string }>()
  if (errorEnvio) throw new Error(`fixture acciones_cobranza_envios: ${errorEnvio.message}`)
  return envio.id
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

function formularioCaso(casoJuridicoId: string, tipoDocumentoId: number, archivo = archivoValido()): FormData {
  const form = new FormData()
  form.set('caso_juridico_id', casoJuridicoId)
  form.set('tipo_documento_id', String(tipoDocumentoId))
  form.set('archivo', archivo)
  return form
}

function formularioEnvio(envioId: string, tipoDocumentoId: number, archivo = archivoValido()): FormData {
  const form = new FormData()
  form.set('envio_id', envioId)
  form.set('tipo_documento_id', String(tipoDocumentoId))
  form.set('archivo', archivo)
  return form
}

d('subir-documento (Edge Function)', () => {
  const admin = clienteAdmin(env!)
  let agente: UsuarioPrueba
  let auditor: UsuarioPrueba
  let administrador: UsuarioPrueba
  let tenant: TenantPrueba
  let clienteAgent: Cliente
  let clienteAuditor: Cliente
  let inmuebleId: string
  let tipoDocumentoId: number
  let casoJuridicoId: string
  let envioId: string
  const storagePaths: string[] = []

  afterAll(async () => {
    if (storagePaths.length > 0) {
      await admin.storage.from('documentos-inmueble').remove(storagePaths)
    }
    await eliminarTenant(admin, tenant.id)
    await eliminarUsuario(admin, agente.id)
    await eliminarUsuario(admin, auditor.id)
    await eliminarUsuario(admin, administrador.id)
  })

  it('setup', async () => {
    agente = await crearUsuario(admin, 'sd-agent')
    auditor = await crearUsuario(admin, 'sd-auditor')
    administrador = await crearUsuario(admin, 'sd-admin')
    tenant = await crearTenant(admin, 'sd', agente.id)
    await crearMembership(admin, tenant.id, agente.id, 'auxiliar')
    await crearMembership(admin, tenant.id, auditor.id, 'auditor')
    await crearMembership(admin, tenant.id, administrador.id, 'administrador')
    clienteAgent = await clienteComo(env!, agente)
    clienteAuditor = await clienteComo(env!, auditor)
    inmuebleId = await crearInmueble(admin, tenant.id)
    tipoDocumentoId = await tipoDocumentoEscrituraId(admin)
    casoJuridicoId = await crearCasoJuridico(admin, env!, tenant, inmuebleId, administrador)
    envioId = await crearEnvio(admin, tenant, inmuebleId)
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

  // ── caso_juridico_id (CAR §15.4, GAP-CAR-007) ────────────────────────
  it('flujo feliz: agent sube un documento al expediente de un caso jurídico', async () => {
    const { data, response } = await clienteAgent.functions.invoke<RespuestaDocumento>(
      'subir-documento',
      { body: formularioCaso(casoJuridicoId, tipoDocumentoId) },
    )

    expect(response?.status).toBe(200)
    expect(data?.version).toBe(1)
    expect(data?.storage_path).toContain(`${tenant.id}/_caso-juridico/${casoJuridicoId}/`)
    if (data) storagePaths.push(data.storage_path)

    const { data: fila } = await admin
      .from('documentos')
      .select('id, tenant_id, inmueble_id, caso_juridico_id')
      .eq('id', data!.id)
      .single()
    expect(fila?.tenant_id).toBe(tenant.id)
    expect(fila?.inmueble_id).toBeNull()
    expect(fila?.caso_juridico_id).toBe(casoJuridicoId)
  }, 30_000)

  it('CASO_JURIDICO_NO_ENCONTRADO (404): caso jurídico inexistente', async () => {
    const { data, response } = await clienteAgent.functions.invoke<RespuestaDocumento>(
      'subir-documento',
      { body: formularioCaso('00000000-0000-0000-0000-000000000000', tipoDocumentoId) },
    )

    expect(data).toBeNull()
    expect(response?.status).toBe(404)
  }, 30_000)

  // ── envio_id (PRQ-CAR-022, CAR §24.1) ────────────────────────────────
  it('flujo feliz: agent sube una constancia manual sobre un envío de cobranza', async () => {
    const { data, response } = await clienteAgent.functions.invoke<RespuestaDocumento>(
      'subir-documento',
      { body: formularioEnvio(envioId, tipoDocumentoId) },
    )

    expect(response?.status).toBe(200)
    expect(data?.version).toBe(1)
    expect(data?.storage_path).toContain(`${tenant.id}/_envio/${envioId}/`)
    if (data) storagePaths.push(data.storage_path)

    const { data: fila } = await admin
      .from('documentos')
      .select('id, tenant_id, inmueble_id, envio_id')
      .eq('id', data!.id)
      .single()
    expect(fila?.tenant_id).toBe(tenant.id)
    expect(fila?.inmueble_id).toBeNull()
    expect(fila?.envio_id).toBe(envioId)
  }, 30_000)

  it('ENVIO_NO_ENCONTRADO (404): envío inexistente', async () => {
    const { data, response } = await clienteAgent.functions.invoke<RespuestaDocumento>(
      'subir-documento',
      { body: formularioEnvio('00000000-0000-0000-0000-000000000000', tipoDocumentoId) },
    )

    expect(data).toBeNull()
    expect(response?.status).toBe(404)
  }, 30_000)
})
