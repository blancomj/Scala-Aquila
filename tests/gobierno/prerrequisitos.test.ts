/**
 * GOB-0 (20260931320000-20260931340000 + Edge Functions generar-enlace-documento/ver-documento)
 * — prerrequisitos bloqueantes de la serie GOB.
 * Ver Casos de uso/Tres Modulos/Gobierno/GOB_00_prerrequisitos_bloqueantes.md.
 *
 * Parte A (tenedor): NO se creó tabla nueva — `inmueble_persona_rol` (renombrada y generalizada
 * desde `inmueble_propietario` en 20260820100000, con su FK apuntando hoy a `terceros` vía
 * `tercero_id` desde 20260821100000) ya era la relación tercero↔inmueble con vigencia histórica
 * que el corte pedía. Solo se añadió el código `usufructuario` a PERSONA_PREDIO y dos funciones
 * de resolución (`fn_tenedores_vigentes`, `fn_propietario_responsable`). Ver D-60 en DECISIONES.md.
 *
 * Parte B (AD-26, Opción 1 mínima): dos Edge Functions nuevas que reutilizan tal cual
 * `supabase/functions/_shared/link_token.ts` (cero cambios) — probadas de punta a punta contra
 * el proyecto Supabase remoto real (D-08), nunca reconstruyendo el HMAC fuera de Deno: intentarlo
 * reveló que el material derivado en producción no coincide con `SUPABASE_SERVICE_ROLE_KEY` del
 * `.env` local (el proyecto tiene además claves `sb_secret_*` del sistema nuevo de API keys —
 * cuál de las dos ve `Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')` en runtime no es observable desde
 * aquí). La prueba 6 usa `vigencia_dias: 0` (válido — expira de inmediato) para obtener un token
 * REAL ya vencido por el viaje de red hasta la segunda invocación, sin adivinar ningún secreto.
 */
import { afterAll, describe, expect, it } from 'vitest'
import 'dotenv/config'
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
  console.warn('SALTADO tests/gobierno/prerrequisitos: faltan variables de Supabase en .env')
}

const PDF_MINIMO = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x34]) // "%PDF-1.4"

interface RespuestaEnlace {
  documento_id: string
  token: string
  vigencia_dias: number
  expira_en: string
}
interface RespuestaVerDocumento {
  nombre_archivo: string
  tipo_documento_id: number
  fecha_vencimiento: string | null
  url_firmada: string
  url_expira_en_segundos: number
}

d('GOB-0: prerrequisitos bloqueantes', () => {
  const admin = clienteAdmin(env!)
  const tenantsCreados: string[] = []
  const usuariosCreados: UsuarioPrueba[] = []
  const storagePaths: string[] = []

  afterAll(async () => {
    if (storagePaths.length > 0) {
      await admin.storage.from('documentos-inmueble').remove(storagePaths)
    }
    for (const id of tenantsCreados) await eliminarTenant(admin, id)
    for (const usuario of usuariosCreados) await eliminarUsuario(admin, usuario.id)
  }, 60_000)

  async function crearTenantCompleto(
    etiqueta: string,
  ): Promise<{ tenantId: string; cliente: Cliente; usuario: UsuarioPrueba; tenant: TenantPrueba }> {
    const usuario = await crearUsuario(admin, etiqueta)
    usuariosCreados.push(usuario)
    const tenant = await crearTenant(admin, etiqueta, usuario.id)
    tenantsCreados.push(tenant.id)
    await crearMembership(admin, tenant.id, usuario.id, 'administrador')
    const cliente = await clienteComo(env!, usuario)
    return { tenantId: tenant.id, cliente, usuario, tenant }
  }

  async function idListaTipos(tipo: string, codigo: string): Promise<number> {
    const { data, error } = await admin
      .from('lista_tipos').select('id').eq('tipo', tipo).eq('codigo', codigo).is('tenant_id', null)
      .single<{ id: number }>()
    if (error) throw new Error(`fixture lista_tipos ${tipo}.${codigo}: ${error.message}`)
    return data.id
  }

  async function crearInmueble(tenantId: string, codigo: string): Promise<string> {
    const tipoId = await idListaTipos('TIPO_INMUEBLE', 'apartamento')
    const { data, error } = await admin
      .from('inmuebles')
      .insert({ tenant_id: tenantId, codigo, tipo_id: tipoId })
      .select('id').single<{ id: string }>()
    if (error) throw new Error(`fixture inmueble ${codigo}: ${error.message}`)
    return data.id
  }

  // "Persona" en el dominio jurídico del corte = un `tercero` natural con
  // rol PERSONA_PREDIO — `personas` fue renombrada a `terceros` un día
  // después de generalizarse (20260821100000), antes de este corte.
  async function crearTercero(tenantId: string, primerNombre: string, primerApellido: string): Promise<string> {
    const sello = `${RUN_ID}-${String(Date.now())}-${Math.random().toString(36).slice(2, 6)}`
    const tipoIdentId = await idListaTipos('TIPO_IDENTIFICACION', 'cedula')
    const estadoActivoId = await idListaTipos('ESTADO_TERCERO', 'activo')
    const { data, error } = await admin
      .from('terceros')
      .insert({
        tenant_id: tenantId, tipo_persona: 'natural', tipo_identificacion_id: tipoIdentId,
        numero_documento: sello, primer_nombre: primerNombre, primer_apellido: primerApellido,
        estado_id: estadoActivoId,
      })
      .select('id').single<{ id: string }>()
    if (error) throw new Error(`fixture tercero ${primerNombre} ${primerApellido}: ${error.message}`)
    return data.id
  }

  async function vincularRol(
    tenantId: string,
    inmuebleId: string,
    terceroId: string,
    rolCodigo: string,
    vigenteDesde: string,
    vigenteHasta: string | null = null,
  ): Promise<string> {
    const rolId = await idListaTipos('PERSONA_PREDIO', rolCodigo)
    const { data, error } = await admin
      .from('inmueble_persona_rol')
      .insert({
        tenant_id: tenantId, inmueble_id: inmuebleId, tercero_id: terceroId, rol_id: rolId,
        vigente_desde: vigenteDesde, vigente_hasta: vigenteHasta,
      })
      .select('id').single<{ id: string }>()
    if (error) throw new Error(`fixture inmueble_persona_rol (${rolCodigo}): ${error.message}`)
    return data.id
  }

  async function crearDocumentoFixture(
    tenantId: string,
    opciones: { conArchivoReal?: boolean } = {},
  ): Promise<{ id: string; storagePath: string }> {
    const tipoDocId = await idListaTipos('TIPO_DOCUMENTO', 'acta_asamblea')
    const storagePath = `${tenantId}/_copropiedad/${crypto.randomUUID()}/1_acta-fixture.pdf`
    if (opciones.conArchivoReal) {
      const { error: errorUpload } = await admin.storage
        .from('documentos-inmueble')
        .upload(storagePath, PDF_MINIMO, { contentType: 'application/pdf', upsert: false })
      if (errorUpload) throw new Error(`fixture storage documento: ${errorUpload.message}`)
      storagePaths.push(storagePath)
    }
    const { data, error } = await admin
      .from('documentos')
      .insert({
        tenant_id: tenantId, tipo_documento_id: tipoDocId,
        nombre_archivo: 'acta-fixture.pdf', storage_path: storagePath, tamano_bytes: PDF_MINIMO.length,
      })
      .select('id').single<{ id: string }>()
    if (error) throw new Error(`fixture documento: ${error.message}`)
    return { id: data.id, storagePath }
  }

  it('1. se puede registrar un tenedor (arrendatario) sobre un inmueble con vigencia desde/hasta', async () => {
    const { tenantId } = await crearTenantCompleto('gob0-t1')
    const inmuebleId = await crearInmueble(tenantId, `GOB0-1-${RUN_ID}`)
    const terceroId = await crearTercero(tenantId, 'Arrendatario', 'Uno')
    const rolId = await vincularRol(tenantId, inmuebleId, terceroId, 'arrendatario', '2026-01-01', '2026-12-31')
    expect(rolId).toBeTruthy()

    const { data: fila } = await admin
      .from('inmueble_persona_rol').select('vigente_desde, vigente_hasta').eq('id', rolId).single()
    expect(fila?.vigente_desde).toBe('2026-01-01')
    expect(fila?.vigente_hasta).toBe('2026-12-31')
  }, 30_000)

  it('2. fn_tenedores_vigentes resuelve por fecha histórica y devuelve vacío cuando no había ninguno', async () => {
    const { tenantId } = await crearTenantCompleto('gob0-t2')
    const inmuebleId = await crearInmueble(tenantId, `GOB0-2-${RUN_ID}`)
    const tercero1 = await crearTercero(tenantId, 'Inquilino', 'Antiguo')
    const tercero2 = await crearTercero(tenantId, 'Inquilino', 'Actual')
    await vincularRol(tenantId, inmuebleId, tercero1, 'inquilino', '2025-01-01', '2025-06-30')
    await vincularRol(tenantId, inmuebleId, tercero2, 'inquilino', '2025-07-01', null)

    const { data: enJulio, error: errJulio } = await admin
      .rpc('fn_tenedores_vigentes', { p_inmueble_id: inmuebleId, p_fecha: '2025-08-01' })
    expect(errJulio).toBeNull()
    expect(enJulio).toHaveLength(1)
    expect(enJulio?.[0]?.tercero_id).toBe(tercero2)

    const { data: enMarzo } = await admin
      .rpc('fn_tenedores_vigentes', { p_inmueble_id: inmuebleId, p_fecha: '2025-03-01' })
    expect(enMarzo).toHaveLength(1)
    expect(enMarzo?.[0]?.tercero_id).toBe(tercero1)

    const { data: enero2024 } = await admin
      .rpc('fn_tenedores_vigentes', { p_inmueble_id: inmuebleId, p_fecha: '2024-01-01' })
    expect(enero2024).toHaveLength(0)
  }, 30_000)

  it('3. un inmueble admite dos tenedores simultáneos', async () => {
    const { tenantId } = await crearTenantCompleto('gob0-t3')
    const inmuebleId = await crearInmueble(tenantId, `GOB0-3-${RUN_ID}`)
    const tercero1 = await crearTercero(tenantId, 'Arrendatario', 'Simultáneo')
    const tercero2 = await crearTercero(tenantId, 'Usufructuario', 'Simultáneo')
    await vincularRol(tenantId, inmuebleId, tercero1, 'arrendatario', '2026-01-01', null)
    await vincularRol(tenantId, inmuebleId, tercero2, 'usufructuario', '2026-01-01', null)

    const { data } = await admin.rpc('fn_tenedores_vigentes', { p_inmueble_id: inmuebleId, p_fecha: '2026-06-01' })
    expect(data).toHaveLength(2)
    expect(new Set(data?.map((f) => f.tercero_id))).toEqual(new Set([tercero1, tercero2]))
  }, 30_000)

  it('4. desde un tenedor se resuelve el propietario vigente a una fecha dada', async () => {
    const { tenantId } = await crearTenantCompleto('gob0-t4')
    const inmuebleId = await crearInmueble(tenantId, `GOB0-4-${RUN_ID}`)
    const propietarioViejo = await crearTercero(tenantId, 'Propietario', 'Viejo')
    const propietarioActual = await crearTercero(tenantId, 'Propietario', 'Actual')
    const tenedor = await crearTercero(tenantId, 'Tenedor', 'Responsabilidad')
    await vincularRol(tenantId, inmuebleId, propietarioViejo, 'copropietario', '2020-01-01', '2025-12-31')
    await vincularRol(tenantId, inmuebleId, propietarioActual, 'copropietario', '2026-01-01', null)
    await vincularRol(tenantId, inmuebleId, tenedor, 'arrendatario', '2026-01-01', null)

    const { data } = await admin
      .rpc('fn_propietario_responsable', { p_inmueble_id: inmuebleId, p_fecha: '2026-06-01' })
    expect(data).toHaveLength(1)
    expect(data?.[0]?.tercero_id).toBe(propietarioActual)

    const { data: historico } = await admin
      .rpc('fn_propietario_responsable', { p_inmueble_id: inmuebleId, p_fecha: '2021-01-01' })
    expect(historico?.[0]?.tercero_id).toBe(propietarioViejo)
  }, 30_000)

  it('5. el tenedor no aparece en ninguna consulta de habilitados para votar (prueba negativa, prep. GOB-3)', async () => {
    const { tenantId } = await crearTenantCompleto('gob0-t5')
    const inmuebleId = await crearInmueble(tenantId, `GOB0-5-${RUN_ID}`)
    const propietario = await crearTercero(tenantId, 'Propietario', 'Votante')
    const tenedor = await crearTercero(tenantId, 'Tenedor', 'NoVotante')
    await vincularRol(tenantId, inmuebleId, propietario, 'copropietario', '2026-01-01', null)
    await vincularRol(tenantId, inmuebleId, tenedor, 'locatario', '2026-01-01', null)

    // La habilitación para votar (GOB-3, aún no existe) partirá de rol=copropietario —
    // se prueba aquí la garantía estructural: filtrando por ese rol, el tenedor nunca aparece.
    const rolCopropietarioId = await idListaTipos('PERSONA_PREDIO', 'copropietario')
    const { data: habilitados } = await admin
      .from('inmueble_persona_rol')
      .select('tercero_id')
      .eq('inmueble_id', inmuebleId)
      .eq('rol_id', rolCopropietarioId)
    expect(habilitados?.map((f) => f.tercero_id)).toEqual([propietario])
    expect(habilitados?.map((f) => f.tercero_id)).not.toContain(tenedor)
  }, 30_000)

  it('6. un enlace de consulta con token caducado no devuelve el documento', async () => {
    // vigencia_dias:0 → exp = ahora mismo (redondeado al segundo hacia abajo). El viaje de
    // red hasta ver-documento (segunda invocación real) ya lo deja vencido — se prueba con un
    // token REAL emitido por generar-enlace-documento, no una réplica del HMAC fuera de Deno.
    const { tenantId, cliente } = await crearTenantCompleto('gob0-t6')
    const { id: documentoId } = await crearDocumentoFixture(tenantId)
    const { data: enlace, response: respEnlace } = await cliente.functions.invoke<RespuestaEnlace>(
      'generar-enlace-documento',
      { body: { documento_id: documentoId, vigencia_dias: 0 } },
    )
    expect(respEnlace?.status).toBe(200)

    const { data, response } = await admin.functions.invoke<RespuestaVerDocumento>(
      'ver-documento',
      { body: { id: documentoId, t: enlace!.token } },
    )
    expect(data).toBeNull()
    expect(response?.status).toBe(410)
  }, 30_000)

  it('7. un enlace de consulta del tenant A no da acceso a un documento del tenant B', async () => {
    const { tenantId: tenantA, cliente: clienteA } = await crearTenantCompleto('gob0-t7a')
    const { tenantId: tenantB } = await crearTenantCompleto('gob0-t7b')
    const { id: documentoA } = await crearDocumentoFixture(tenantA)
    const { id: documentoB } = await crearDocumentoFixture(tenantB)

    // Token real, válido, firmado para el documento del tenant A...
    const { data: enlace } = await clienteA.functions.invoke<RespuestaEnlace>(
      'generar-enlace-documento',
      { body: { documento_id: documentoA } },
    )

    // ...usado contra el documento del tenant B: la firma está atada al id, no coincide.
    const { data, response } = await admin.functions.invoke<RespuestaVerDocumento>(
      'ver-documento',
      { body: { id: documentoB, t: enlace!.token } },
    )
    expect(data).toBeNull()
    expect(response?.status).toBe(403)
  }, 30_000)

  it('8. aislamiento entre tenants: un miembro de un tenant no ve los tenedores de otro', async () => {
    const { tenantId: tenantA, cliente: clienteA } = await crearTenantCompleto('gob0-t8a')
    const { tenantId: tenantB } = await crearTenantCompleto('gob0-t8b')
    const inmuebleA = await crearInmueble(tenantA, `GOB0-8A-${RUN_ID}`)
    const inmuebleB = await crearInmueble(tenantB, `GOB0-8B-${RUN_ID}`)
    const terceroA = await crearTercero(tenantA, 'Tenedor', 'TenantA')
    const terceroB = await crearTercero(tenantB, 'Tenedor', 'TenantB')
    await vincularRol(tenantA, inmuebleA, terceroA, 'arrendatario', '2026-01-01', null)
    await vincularRol(tenantB, inmuebleB, terceroB, 'arrendatario', '2026-01-01', null)

    const { data: visiblesParaA, error } = await clienteA
      .from('inmueble_persona_rol').select('tercero_id').eq('inmueble_id', inmuebleB)
    expect(error).toBeNull()
    expect(visiblesParaA).toHaveLength(0)
  }, 30_000)

  it('9. flujo feliz: enlace de consulta válido devuelve una URL firmada del documento', async () => {
    // crearTenantCompleto ya deja al creador como 'administrador', que satisface
    // has_role(['auxiliar']) por la relación administrador ⊇ auxiliar — no hace
    // falta una membership adicional.
    const { tenantId, cliente } = await crearTenantCompleto('gob0-t9')
    const { id: documentoId } = await crearDocumentoFixture(tenantId, { conArchivoReal: true })

    const { data: enlace, response: respEnlace } = await cliente.functions.invoke<RespuestaEnlace>(
      'generar-enlace-documento',
      { body: { documento_id: documentoId } },
    )
    expect(respEnlace?.status).toBe(200)
    expect(enlace?.token).toBeTruthy()

    const { data: verResult, response: respVer } = await admin.functions.invoke<RespuestaVerDocumento>(
      'ver-documento',
      { body: { id: documentoId, t: enlace!.token } },
    )
    expect(respVer?.status).toBe(200)
    expect(verResult?.url_firmada).toContain('documentos-inmueble')
    expect(verResult?.nombre_archivo).toBe('acta-fixture.pdf')
  }, 30_000)

  it('10. todo enum nuevo de este corte tiene comment on type (D-24) — este corte no crea ninguno', () => {
    // GOB-0 no crea ningún `create type ... as enum` (Parte A reutiliza PERSONA_PREDIO vía
    // lista_tipos; Parte B no toca SQL). tests/governance/enum-lista-tipos-coverage.test.ts ya
    // hace cumplir esto globalmente — se deja esta prueba como constancia explícita del corte.
    expect(true).toBe(true)
  })
})
