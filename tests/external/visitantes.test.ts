/**
 * EXT-04 (20260932870000 + Edge Functions) — visitantes desde External. Ver
 * Casos de uso/Solicitudes - Reservas - Visitantes/EXT_04_visitantes.md §5 (10 pruebas
 * obligatorias).
 *
 * Deliberadamente delgado (spec §2, "la frontera que no se mueve"): External autoriza, nunca
 * valida ni consume un QR — eso sigue siendo exclusivamente de portería (MANT-11,
 * autorizacion-visita-validar/-consumir), nunca tocado desde este corte.
 *
 * TIPO_VISITA (lista_tipos) es catálogo GLOBAL (tenant_id is null, sembrado por MANT-11) — a
 * diferencia de TIPO_SOLICITUD/CATEGORIA_SOLICITUD (EXT-02, por tenant), un actor externo ya
 * puede leerlo directo por RLS (AD-37 §5, lista_tipos_select_miembro: "tenant_id is null or
 * is_member(tenant_id)") — no hace falta ninguna Edge Function de catálogo para este corte.
 */
import { afterAll, describe, expect, it } from 'vitest'
import 'dotenv/config'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  clienteAdmin,
  clienteComo,
  crearTenant,
  crearUsuario,
  eliminarTenant,
  eliminarUsuario,
  leerEntorno,
  RUN_ID,
  type Cliente,
} from '../rls/helpers.js'

const env = leerEntorno()
const d = env ? describe : describe.skip

if (!env) {
  console.warn('SALTADO tests/external/visitantes: faltan variables de Supabase en .env')
}

const RAIZ = join(import.meta.dirname, '..', '..')

interface RespuestaAutorizacion {
  id: string
  tenant_id: string
  inmueble_id: string
  autorizado_por_ref: string
  autorizado_por_origen: string
  visitante_nombre: string
  visitante_documento: string | null
  permanente: boolean
  fecha_prevista: string | null
  estado: string
  qr_token: string | null
  qr_expira_at: string
  foto_url: string | null
}
interface RespuestaListado {
  id: string
  visitante_nombre: string
  visitante_documento: string | null
  tipo_id: number | null
  fecha_prevista: string
  estado: string
  qr_token: string | null
  qr_expira_at: string
  created_at: string
  ingreso_at: string | null
  egreso_at: string | null
}

interface ErrorHttpParseado {
  status: number | null
  codigo: string | null
  mensaje: string | null
}

/** Mismo patrón que tests/external/solicitudes.test.ts (EXT-02) / reservas.test.ts (EXT-03): evita
 * el no-unsafe-assignment de eslint sobre el `error: any` de @supabase/functions-js. */
function invocarConError<T>(
  promesa: Promise<{ data: T | null; error: unknown }>,
): Promise<{ data: T | null; error: ErrorHttpParseado | null }> {
  return promesa.then(async ({ data, error }) => {
    if (!error) return { data, error: null }
    const contexto = (error as { context?: unknown }).context
    let status: number | null = null
    let cuerpo: { error?: { code?: string; message?: string } } = {}
    if (contexto instanceof Response) {
      status = contexto.status
      try {
        cuerpo = (await contexto.clone().json()) as typeof cuerpo
      } catch {
        // sin cuerpo JSON legible — se deja vacío.
      }
    }
    return { data: null, error: { status, codigo: cuerpo.error?.code ?? null, mensaje: cuerpo.error?.message ?? null } }
  })
}

/** EXT-09 (Ola 2, M14): external-visitas-crear pasó de JSON a multipart/form-data (para poder
 * adjuntar la foto opcional) — este helper arma el FormData a partir de los mismos campos planos
 * que antes se mandaban como objeto, sin cambiar el significado de ningún test existente. */
function formVisita(campos: Record<string, string | number | undefined>): FormData {
  const form = new FormData()
  for (const [clave, valor] of Object.entries(campos)) {
    if (valor !== undefined) form.set(clave, String(valor))
  }
  return form
}

d('EXT-04: visitantes desde External', () => {
  const admin = clienteAdmin(env!)
  const tenantsCreados: string[] = []
  const usuariosCreados: string[] = []
  const tercerosCreados: string[] = []

  afterAll(async () => {
    for (const id of usuariosCreados) await eliminarUsuario(admin, id)
    for (const id of tenantsCreados) await eliminarTenant(admin, id)
    for (const id of tercerosCreados) {
      await admin.from('inmueble_persona_rol').delete().eq('tercero_id', id)
      await admin.from('terceros').delete().eq('id', id)
    }
  }, 60_000)

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
      .from('inmuebles').insert({ tenant_id: tenantId, codigo, tipo_id: tipoId })
      .select('id').single<{ id: string }>()
    if (error) throw new Error(`fixture inmueble ${codigo}: ${error.message}`)
    return data.id
  }

  async function crearTercero(tenantId: string, sello: string): Promise<string> {
    const tipoIdentId = await idListaTipos('TIPO_IDENTIFICACION', 'cedula')
    const estadoActivoId = await idListaTipos('ESTADO_TERCERO', 'activo')
    const { data, error } = await admin.from('terceros').insert({
      tenant_id: tenantId, tipo_persona: 'natural', tipo_identificacion_id: tipoIdentId,
      numero_documento: sello, primer_nombre: 'Externo', primer_apellido: sello, estado_id: estadoActivoId,
    }).select('id').single<{ id: string }>()
    if (error) throw new Error(`fixture tercero ${sello}: ${error.message}`)
    tercerosCreados.push(data.id)
    return data.id
  }

  async function crearPersonaRol(tenantId: string, inmuebleId: string, terceroId: string): Promise<string> {
    const rolId = await idListaTipos('PERSONA_PREDIO', 'copropietario')
    const { data, error } = await admin
      .from('inmueble_persona_rol')
      .insert({ tenant_id: tenantId, inmueble_id: inmuebleId, tercero_id: terceroId, rol_id: rolId, vigente_desde: '2020-01-01' })
      .select('id').single<{ id: string }>()
    if (error) throw new Error(`fixture inmueble_persona_rol: ${error.message}`)
    return data.id
  }

  async function crearVinculo(tenantId: string, personaRolId: string, authUserId: string): Promise<string> {
    const { error } = await admin.rpc('fn_actor_externo_registrar_vinculo', {
      p_tenant_id: tenantId, p_auth_user_id: authUserId, p_persona_rol_id: personaRolId,
      p_persona_tipo: 'propietario', p_origen: 'staff',
    })
    if (error) throw error
    const { data: vinculo, error: errorLeer } = await admin
      .from('actor_externo_vinculo').select('id').eq('auth_user_id', authUserId).eq('persona_rol_id', personaRolId)
      .single<{ id: string }>()
    if (errorLeer) throw errorLeer
    return vinculo.id
  }

  /** Tenant + inmueble + un actor externo YA vinculado (propietario) con sesión real (AD-37). */
  async function prepararTenantConActorExterno(etiqueta: string): Promise<{
    tenantId: string; inmuebleId: string; actorExternoVinculoId: string; clienteExterno: Cliente
  }> {
    const tenant = await crearTenant(admin, etiqueta)
    tenantsCreados.push(tenant.id)
    const inmuebleId = await crearInmueble(tenant.id, `EXT4-${etiqueta}-${RUN_ID}`)
    const terceroId = await crearTercero(tenant.id, `${RUN_ID}-${etiqueta}`)
    const personaRolId = await crearPersonaRol(tenant.id, inmuebleId, terceroId)

    const email = `ext4-${RUN_ID}-${etiqueta}@example.test`
    const password = `Aa1${crypto.randomUUID()}`
    const { data: creado, error: errorCrear } = await admin.auth.admin.createUser({
      email, password, email_confirm: true,
    })
    if (errorCrear) throw errorCrear
    usuariosCreados.push(creado.user.id)

    const vinculoId = await crearVinculo(tenant.id, personaRolId, creado.user.id)
    const clienteExterno = await clienteComo(env!, { id: creado.user.id, email, password })

    return { tenantId: tenant.id, inmuebleId, actorExternoVinculoId: vinculoId, clienteExterno }
  }

  /** Marca una autorización como 'usada' directo por SQL (mismo criterio que MANT-11: la vía real
   * de consumo es autorizacion-visita-consumir, portería — fuera de alcance de este corte, así que
   * el fixture de "ya usada" se fabrica con el mismo mecanismo SQL que esa Edge Function llama). */
  async function marcarUsada(autorizacionId: string): Promise<void> {
    const staff = await crearUsuario(admin, `staff-${RUN_ID}-${autorizacionId.slice(0, 8)}`)
    usuariosCreados.push(staff.id)
    const { error } = await admin.rpc('fn_autorizacion_visita_marcar_usada', {
      p_autorizacion_id: autorizacionId, p_registrado_por: staff.id,
    })
    if (error) throw new Error(`fixture marcar usada: ${error.message}`)
  }

  it('1. crear resuelve inmueble_id desde el vínculo, ignorando cualquier valor forzado en el cuerpo', async () => {
    const t = await prepararTenantConActorExterno('p1')
    const otroInmuebleId = await crearInmueble(t.tenantId, `EXT4-p1-otro-${RUN_ID}`)

    const { data, error } = await invocarConError(
      t.clienteExterno.functions.invoke<RespuestaAutorizacion>('external-visitas-crear', {
        body: formVisita({
          vinculo_id: t.actorExternoVinculoId, visitante_nombre: 'Juan Visitante',
          fecha_prevista: '2028-04-01', hora_desde: '10:00', hora_hasta: '12:00',
          inmueble_id: otroInmuebleId,
        }),
      }),
    )
    if (error) throw new Error(error.mensaje ?? 'fallo inesperado')
    expect(data!.inmueble_id).toBe(t.inmuebleId)
    expect(data!.inmueble_id).not.toBe(otroInmuebleId)
    expect(data!.autorizado_por_origen).toBe('externo')
    expect(data!.autorizado_por_ref).toBe(t.actorExternoVinculoId)
  }, 30_000)

  it('2. el QR devuelto tiene vigencia de horas, coherente con MANT-11, nunca el patrón de 50 años', async () => {
    const t = await prepararTenantConActorExterno('p2')
    const manana = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().slice(0, 10)
    const { data, error } = await invocarConError(
      t.clienteExterno.functions.invoke<RespuestaAutorizacion>('external-visitas-crear', {
        body: formVisita({ vinculo_id: t.actorExternoVinculoId, visitante_nombre: 'Ana Visitante', fecha_prevista: manana, hora_hasta: '18:00' }),
      }),
    )
    if (error) throw new Error(error.mensaje ?? 'fallo inesperado')
    expect(data!.qr_token).toBeTruthy()
    const vigenciaHoras = (new Date(data!.qr_expira_at).getTime() - Date.now()) / (3600 * 1000)
    expect(vigenciaHoras).toBeGreaterThan(0)
    expect(vigenciaHoras).toBeLessThan(24 * 30)
  }, 30_000)

  it('3. revocar una autorización vigente y no usada la mueve a revocada', async () => {
    const t = await prepararTenantConActorExterno('p3')
    const { data: creada, error: errorCrear } = await invocarConError(
      t.clienteExterno.functions.invoke<RespuestaAutorizacion>('external-visitas-crear', {
        body: formVisita({ vinculo_id: t.actorExternoVinculoId, visitante_nombre: 'Pedro Visitante', fecha_prevista: '2028-04-03', hora_hasta: '18:00' }),
      }),
    )
    if (errorCrear) throw new Error(errorCrear.mensaje ?? 'fallo inesperado')

    const { data: revocada, error: errorRevocar } = await invocarConError(
      t.clienteExterno.functions.invoke<RespuestaAutorizacion>('external-visitas-revocar', {
        body: { vinculo_id: t.actorExternoVinculoId, autorizacion_id: creada!.id },
      }),
    )
    if (errorRevocar) throw new Error(errorRevocar.mensaje ?? 'fallo inesperado')
    expect(revocada!.estado).toBe('revocada')
  }, 30_000)

  it('4. revocar una autorización ya usada falla, con el error que MANT-11 ya define', async () => {
    const t = await prepararTenantConActorExterno('p4')
    const { data: creada, error: errorCrear } = await invocarConError(
      t.clienteExterno.functions.invoke<RespuestaAutorizacion>('external-visitas-crear', {
        body: formVisita({ vinculo_id: t.actorExternoVinculoId, visitante_nombre: 'Laura Visitante', fecha_prevista: '2028-04-04', hora_hasta: '18:00' }),
      }),
    )
    if (errorCrear) throw new Error(errorCrear.mensaje ?? 'fallo inesperado')
    await marcarUsada(creada!.id)

    const { data, error } = await invocarConError(
      t.clienteExterno.functions.invoke<RespuestaAutorizacion>('external-visitas-revocar', {
        body: { vinculo_id: t.actorExternoVinculoId, autorizacion_id: creada!.id },
      }),
    )
    expect(data).toBeNull()
    expect(error!.status).toBe(409)
    expect(error!.codigo).toBe('AUTORIZACION_ESTADO_INMUTABLE')
  }, 30_000)

  it('5. GET /external/visitas solo devuelve las del vínculo que consulta', async () => {
    const a = await prepararTenantConActorExterno('p5a')
    const b = await prepararTenantConActorExterno('p5b')
    const { error: eA } = await invocarConError(
      a.clienteExterno.functions.invoke<RespuestaAutorizacion>('external-visitas-crear', {
        body: formVisita({ vinculo_id: a.actorExternoVinculoId, visitante_nombre: 'De A', fecha_prevista: '2028-04-05', hora_hasta: '18:00' }),
      }),
    )
    if (eA) throw new Error(eA.mensaje ?? 'fallo inesperado')
    const { error: eB } = await invocarConError(
      b.clienteExterno.functions.invoke<RespuestaAutorizacion>('external-visitas-crear', {
        body: formVisita({ vinculo_id: b.actorExternoVinculoId, visitante_nombre: 'De B', fecha_prevista: '2028-04-05', hora_hasta: '18:00' }),
      }),
    )
    if (eB) throw new Error(eB.mensaje ?? 'fallo inesperado')

    const { data: listaA, error: errorListaA } = await invocarConError(
      a.clienteExterno.functions.invoke<RespuestaListado[]>('external-visitas-listar', {
        body: { vinculo_id: a.actorExternoVinculoId },
      }),
    )
    if (errorListaA) throw new Error(errorListaA.mensaje ?? 'fallo inesperado')
    expect(listaA!.every((v) => v.visitante_nombre === 'De A')).toBe(true)
    expect(listaA!.some((v) => v.visitante_nombre === 'De B')).toBe(false)
  }, 30_000)

  it('6. el historial muestra correctamente cuándo una autorización fue usada, leyendo el registro de acceso real', async () => {
    const t = await prepararTenantConActorExterno('p6')
    const { data: creada, error: errorCrear } = await invocarConError(
      t.clienteExterno.functions.invoke<RespuestaAutorizacion>('external-visitas-crear', {
        body: formVisita({ vinculo_id: t.actorExternoVinculoId, visitante_nombre: 'Usada Visitante', fecha_prevista: '2028-04-06', hora_hasta: '18:00' }),
      }),
    )
    if (errorCrear) throw new Error(errorCrear.mensaje ?? 'fallo inesperado')
    await marcarUsada(creada!.id)

    const { data: lista, error: errorLista } = await invocarConError(
      t.clienteExterno.functions.invoke<RespuestaListado[]>('external-visitas-listar', {
        body: { vinculo_id: t.actorExternoVinculoId },
      }),
    )
    if (errorLista) throw new Error(errorLista.mensaje ?? 'fallo inesperado')
    const fila = lista!.find((v) => v.id === creada!.id)
    expect(fila?.estado).toBe('usada')
    expect(fila?.ingreso_at).not.toBeNull()
  }, 30_000)

  it('7. este corte nunca invoca fn_autorizacion_visita_validar ni _consumir (prueba estructural)', () => {
    const archivos = [
      'supabase/functions/external-visitas-crear/index.ts',
      'supabase/functions/external-visitas-revocar/index.ts',
      'supabase/functions/external-visitas-listar/index.ts',
    ]
    for (const ruta of archivos) {
      const contenido = readFileSync(join(RAIZ, ruta), 'utf8')
      expect(contenido).not.toContain('autorizacion-visita-validar')
      expect(contenido).not.toContain('autorizacion-visita-consumir')
      expect(contenido).not.toContain('fn_autorizacion_visita_validar')
      expect(contenido).not.toContain('fn_autorizacion_visita_consumir')
    }
  })

  it('8. un actor externo no puede autorizar ni revocar a nombre de un inmueble que no es el suyo', async () => {
    const a = await prepararTenantConActorExterno('p8a')
    const b = await prepararTenantConActorExterno('p8b')

    const { data: dataCrear, error: eCrear } = await invocarConError(
      a.clienteExterno.functions.invoke<RespuestaAutorizacion>('external-visitas-crear', {
        body: formVisita({ vinculo_id: b.actorExternoVinculoId, visitante_nombre: 'Intruso', fecha_prevista: '2028-04-08', hora_hasta: '18:00' }),
      }),
    )
    expect(dataCrear).toBeNull()
    expect(eCrear!.status).toBe(403)
    expect(eCrear!.codigo).toBe('VINCULO_NO_PERTENECE')

    const { data: autB, error: eCrearB } = await invocarConError(
      b.clienteExterno.functions.invoke<RespuestaAutorizacion>('external-visitas-crear', {
        body: formVisita({ vinculo_id: b.actorExternoVinculoId, visitante_nombre: 'De B', fecha_prevista: '2028-04-08', hora_hasta: '18:00' }),
      }),
    )
    if (eCrearB) throw new Error(eCrearB.mensaje ?? 'fallo inesperado')

    const { data: dataRevocar, error: eRevocar } = await invocarConError(
      a.clienteExterno.functions.invoke<RespuestaAutorizacion>('external-visitas-revocar', {
        body: { vinculo_id: a.actorExternoVinculoId, autorizacion_id: autB!.id },
      }),
    )
    expect(dataRevocar).toBeNull()
    expect(eRevocar!.codigo).toBe('AUTORIZACION_INEXISTENTE')
  }, 30_000)

  it('9. cero políticas RLS nuevas sobre mant_autorizaciones_visita o mant_registros_acceso', async () => {
    const dbUrl = process.env.SUPABASE_DB_URL
    if (!dbUrl) throw new Error('falta SUPABASE_DB_URL')
    const { Client } = await import('pg')
    const client = new Client({ connectionString: dbUrl })
    await client.connect()
    let filas: { tablename: string; policyname: string }[]
    try {
      const resultado = await client.query<{ tablename: string; policyname: string }>(`
        select tablename, policyname from pg_policies
        where schemaname = 'public' and tablename in ('mant_autorizaciones_visita', 'mant_registros_acceso')
        order by tablename, policyname
      `)
      filas = resultado.rows
    } finally {
      await client.end()
    }
    expect(filas.map((f) => `${f.tablename}.${f.policyname}`)).toEqual([
      'mant_autorizaciones_visita.mant_autorizaciones_visita_select_miembro',
      'mant_registros_acceso.mant_registros_acceso_select_miembro',
      'mant_registros_acceso.mant_registros_acceso_staff_insert',
      'mant_registros_acceso.mant_registros_acceso_staff_update',
    ])
  }, 30_000)

  it('10. aislamiento entre tenants', async () => {
    const a = await prepararTenantConActorExterno('p10a')
    const b = await prepararTenantConActorExterno('p10b')

    const { data, error } = await invocarConError(
      a.clienteExterno.functions.invoke<RespuestaAutorizacion>('external-visitas-crear', {
        body: formVisita({ vinculo_id: b.actorExternoVinculoId, visitante_nombre: 'Ajeno', fecha_prevista: '2028-04-10', hora_hasta: '18:00' }),
      }),
    )
    expect(data).toBeNull()
    expect(error!.codigo).toBe('VINCULO_NO_PERTENECE')
  }, 30_000)

  // ── EXT-09 (Ola 2, M14): permanente + foto ──────────────────────────────────────────────
  it('11. permanente=true omite fecha_prevista/hora y da un QR con vigencia de ~1 año, no de horas', async () => {
    const t = await prepararTenantConActorExterno('p11')
    const { data, error } = await invocarConError(
      t.clienteExterno.functions.invoke<RespuestaAutorizacion>('external-visitas-crear', {
        body: formVisita({ vinculo_id: t.actorExternoVinculoId, visitante_nombre: 'Empleada Fija', permanente: 'true' }),
      }),
    )
    if (error) throw new Error(error.mensaje ?? 'fallo inesperado')
    expect(data!.permanente).toBe(true)
    expect(data!.fecha_prevista).toBeNull()
    const vigenciaDias = (new Date(data!.qr_expira_at).getTime() - Date.now()) / (24 * 3600 * 1000)
    expect(vigenciaDias).toBeGreaterThan(30)
    expect(vigenciaDias).toBeLessThanOrEqual(366)
  }, 30_000)

  it('12. una foto JPEG válida se adjunta y queda como foto_url no nulo', async () => {
    const t = await prepararTenantConActorExterno('p12')
    const form = formVisita({ vinculo_id: t.actorExternoVinculoId, visitante_nombre: 'Con Foto', fecha_prevista: '2028-04-12', hora_hasta: '18:00' })
    form.set('foto', new File([new Uint8Array([0xff, 0xd8, 0xff, 0xdb])], 'rostro.jpg', { type: 'image/jpeg' }))
    const { data, error } = await invocarConError(
      t.clienteExterno.functions.invoke<RespuestaAutorizacion>('external-visitas-crear', { body: form }),
    )
    if (error) throw new Error(error.mensaje ?? 'fallo inesperado')
    expect(data!.foto_url).toBeTruthy()
  }, 30_000)

  it('13. una foto con MIME no permitido (PDF) se rechaza con 400 INVALID_PAYLOAD, sin crear nada', async () => {
    const t = await prepararTenantConActorExterno('p13')
    const form = formVisita({ vinculo_id: t.actorExternoVinculoId, visitante_nombre: 'Foto Inválida', fecha_prevista: '2028-04-13', hora_hasta: '18:00' })
    form.set('foto', new File([new Uint8Array([0x25, 0x50, 0x44, 0x46])], 'archivo.pdf', { type: 'application/pdf' }))
    const { data, error } = await invocarConError(
      t.clienteExterno.functions.invoke<RespuestaAutorizacion>('external-visitas-crear', { body: form }),
    )
    expect(data).toBeNull()
    expect(error!.status).toBe(400)
    expect(error!.codigo).toBe('INVALID_PAYLOAD')
  }, 30_000)

  // ── EXT-16 (Ola 3, M21): rate limiting — mismo criterio que reservas.test.ts/solicitudes.test.ts:
  // enforceRateLimit corre antes de la RPC/insert, así que el intento cuenta sin importar si el
  // negocio lo acepta o lo rechaza.
  it('14. rate limit: crear bloquea después de 20 intentos en una hora', async () => {
    const t = await prepararTenantConActorExterno('p14rl')
    for (let i = 0; i < 20; i += 1) {
      const { error } = await invocarConError(
        t.clienteExterno.functions.invoke<RespuestaAutorizacion>('external-visitas-crear', {
          body: formVisita({ vinculo_id: t.actorExternoVinculoId, visitante_nombre: `RL ${String(i)}`, permanente: 'true' }),
        }),
      )
      expect(error?.codigo).not.toBe('RATE_LIMITED')
    }
    const { data, error } = await invocarConError(
      t.clienteExterno.functions.invoke<RespuestaAutorizacion>('external-visitas-crear', {
        body: formVisita({ vinculo_id: t.actorExternoVinculoId, visitante_nombre: 'RL 20', permanente: 'true' }),
      }),
    )
    expect(data).toBeNull()
    expect(error!.status).toBe(429)
    expect(error!.codigo).toBe('RATE_LIMITED')
  }, 60_000)

  it('15. rate limit: listar bloquea después de 60 intentos en una hora', async () => {
    const t = await prepararTenantConActorExterno('p15rl')
    for (let i = 0; i < 60; i += 1) {
      const { error } = await invocarConError(
        t.clienteExterno.functions.invoke<RespuestaListado[]>('external-visitas-listar', {
          body: { vinculo_id: t.actorExternoVinculoId },
        }),
      )
      expect(error?.codigo).not.toBe('RATE_LIMITED')
    }
    const { data, error } = await invocarConError(
      t.clienteExterno.functions.invoke<RespuestaListado[]>('external-visitas-listar', {
        body: { vinculo_id: t.actorExternoVinculoId },
      }),
    )
    expect(data).toBeNull()
    expect(error!.status).toBe(429)
    expect(error!.codigo).toBe('RATE_LIMITED')
  }, 90_000)

  it('16. rate limit: revocar bloquea después de 30 intentos en una hora', async () => {
    const t = await prepararTenantConActorExterno('p16rl')
    for (let i = 0; i < 30; i += 1) {
      const { error } = await invocarConError(
        t.clienteExterno.functions.invoke<RespuestaAutorizacion>('external-visitas-revocar', {
          body: { vinculo_id: t.actorExternoVinculoId, autorizacion_id: crypto.randomUUID() },
        }),
      )
      expect(error?.codigo).not.toBe('RATE_LIMITED')
    }
    const { data, error } = await invocarConError(
      t.clienteExterno.functions.invoke<RespuestaAutorizacion>('external-visitas-revocar', {
        body: { vinculo_id: t.actorExternoVinculoId, autorizacion_id: crypto.randomUUID() },
      }),
    )
    expect(data).toBeNull()
    expect(error!.status).toBe(429)
    expect(error!.codigo).toBe('RATE_LIMITED')
  }, 60_000)
})
