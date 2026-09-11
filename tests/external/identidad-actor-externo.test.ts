/**
 * EXT-01 (20260932640000-20260932700000) — identidad del actor externo. Ver
 * Casos de uso/Aplicacion Movil/CLAUDE/EXT_01_identidad_actor_externo.md §5 (17 pruebas
 * obligatorias) y AD-37_DECISION_IDENTIDAD_ACTOR_EXTERNO.md.
 *
 * Desviación de diseño frente al spec original, documentada en la cabecera de
 * 20260932650000_ext1_vinculo.sql: `persona_ref` (propietario_id/tenedor_id, que ya no existen
 * tras D-60/GOB-0) se reemplazó por `persona_rol_id` -> inmueble_persona_rol.id. El OTP se
 * resuelve por CONTACTO (canal+valor), no por persona_rol_id, porque un mismo contacto puede
 * verificar varios roles a la vez (§3.3 "multi-relación").
 *
 * Las pruebas ejercitan las funciones de Postgres directamente (mismo criterio que el resto del
 * repo: la lógica vive ahí, no en las Edge Functions, que son wrappers delgados de rate-limit +
 * envío + Admin API — ver actor-externo-solicitar-otp/confirmar-otp). El paso de creación real de
 * auth.users vía Admin API que hace la Edge Function se reproduce aquí con
 * admin.auth.admin.createUser, exactamente la misma llamada.
 */
import { afterAll, describe, expect, it } from 'vitest'
import 'dotenv/config'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  clienteAdmin,
  clienteComo,
  crearMembership,
  crearTenant,
  crearUsuario,
  eliminarTenant,
  eliminarUsuario,
  RUN_ID,
  leerEntorno,
  type UsuarioPrueba,
} from '../rls/helpers.js'

const env = leerEntorno()
const d = env ? describe : describe.skip
if (!env) {
  console.warn('SALTADO tests/external/identidad-actor-externo: faltan variables de Supabase en .env')
}

const RAIZ = join(import.meta.dirname, '..', '..')

interface FilaConfirmarOtp {
  persona_rol_id: string
  tenant_id: string
  tercero_id: string
  rol_codigo: string
  email: string | null
  telefono: string | null
  nombre_completo: string
}

d('EXT-01: identidad del actor externo', () => {
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
  })

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
      .from('inmuebles').insert({ tenant_id: tenantId, codigo, tipo_id: tipoId }).select('id').single<{ id: string }>()
    if (error) throw new Error(`fixture inmueble ${codigo}: ${error.message}`)
    return data.id
  }

  async function crearTercero(
    tenantId: string,
    sello: string,
    contacto: { email?: string; telefono?: string },
  ): Promise<string> {
    const tipoIdentId = await idListaTipos('TIPO_IDENTIFICACION', 'cedula')
    const estadoActivoId = await idListaTipos('ESTADO_TERCERO', 'activo')
    const { data, error } = await admin.from('terceros').insert({
      tenant_id: tenantId, tipo_persona: 'natural', tipo_identificacion_id: tipoIdentId,
      numero_documento: sello, primer_nombre: 'Externo', primer_apellido: sello,
      estado_id: estadoActivoId, email: contacto.email ?? null, telefono: contacto.telefono ?? null,
    }).select('id').single<{ id: string }>()
    if (error) throw new Error(`fixture tercero ${sello}: ${error.message}`)
    tercerosCreados.push(data.id)
    return data.id
  }

  async function crearPersonaRol(
    tenantId: string,
    inmuebleId: string,
    terceroId: string,
    rolCodigo: string,
  ): Promise<string> {
    const rolId = await idListaTipos('PERSONA_PREDIO', rolCodigo)
    const { data, error } = await admin
      .from('inmueble_persona_rol')
      .insert({ tenant_id: tenantId, inmueble_id: inmuebleId, tercero_id: terceroId, rol_id: rolId, vigente_desde: '2020-01-01' })
      .select('id').single<{ id: string }>()
    if (error) throw new Error(`fixture inmueble_persona_rol: ${error.message}`)
    return data.id
  }

  async function prepararRol(
    etiqueta: string,
    contacto: { email?: string; telefono?: string },
    rolCodigo = 'copropietario',
  ): Promise<{ tenantId: string; inmuebleId: string; terceroId: string; personaRolId: string }> {
    const tenant = await crearTenant(admin, etiqueta)
    tenantsCreados.push(tenant.id)
    const inmuebleId = await crearInmueble(tenant.id, `INM-${RUN_ID}-${etiqueta}`)
    const terceroId = await crearTercero(tenant.id, `${RUN_ID}-${etiqueta}`, contacto)
    const personaRolId = await crearPersonaRol(tenant.id, inmuebleId, terceroId, rolCodigo)
    return { tenantId: tenant.id, inmuebleId, terceroId, personaRolId }
  }

  /** Reproduce lo que hace actor-externo-confirmar-otp: confirma el OTP, crea (o reutiliza) el
   * auth.users, y registra un vínculo por cada fila devuelta. */
  async function confirmarYRegistrar(
    canal: 'email' | 'sms',
    contacto: string,
    codigo: string,
  ): Promise<{ authUserId: string; filas: FilaConfirmarOtp[] }> {
    const { data: filas, error } = await admin.rpc('fn_actor_externo_confirmar_otp', {
      p_canal: canal, p_contacto: contacto, p_codigo: codigo,
    })
    if (error) throw error
    const filasTyped = filas as FilaConfirmarOtp[]
    const email = filasTyped[0]?.email
    if (!email) throw new Error('sin email para crear la cuenta')
    const { data: creado, error: errorCrear } = await admin.auth.admin.createUser({
      email, email_confirm: true, password: `Aa1${crypto.randomUUID()}`,
    })
    if (errorCrear) throw errorCrear
    usuariosCreados.push(creado.user.id)
    for (const fila of filasTyped) {
      const { error: errorVinculo } = await admin.rpc('fn_actor_externo_registrar_vinculo', {
        p_tenant_id: fila.tenant_id,
        p_auth_user_id: creado.user.id,
        p_persona_rol_id: fila.persona_rol_id,
        p_persona_tipo: fila.rol_codigo === 'copropietario' ? 'propietario' : 'tenedor',
        p_origen: 'autoverificacion',
      })
      if (errorVinculo) throw errorVinculo
    }
    return { authUserId: creado.user.id, filas: filasTyped }
  }

  it('1. solicitar OTP con un contacto no registrado no tiene efecto (no revela existencia)', async () => {
    const { data: codigo, error } = await admin.rpc('fn_actor_externo_solicitar_otp', {
      p_canal: 'email', p_contacto: `no-existe-${RUN_ID}@example.test`,
    })
    if (error) throw error
    expect(codigo).toBeNull()
  }, 30_000)

  it('2. confirmar un OTP válido crea el usuario en auth.users y el vínculo, en una sola operación', async () => {
    const email = `p2-${RUN_ID}@example.test`
    await prepararRol('p2', { email })

    const { data: codigo, error: errorSolicitar } = await admin.rpc('fn_actor_externo_solicitar_otp', {
      p_canal: 'email', p_contacto: email,
    })
    if (errorSolicitar) throw errorSolicitar
    expect(codigo).not.toBeNull()

    const { authUserId } = await confirmarYRegistrar('email', email, codigo)
    const { data: vinculo, error } = await admin
      .from('actor_externo_vinculo').select('id').eq('auth_user_id', authUserId).maybeSingle()
    if (error) throw error
    expect(vinculo).toBeTruthy()
  }, 30_000)

  it('3. el auth_user_id creado no aparece en memberships de ningún tenant', async () => {
    const email = `p3-${RUN_ID}@example.test`
    await prepararRol('p3', { email })
    const { data: codigo } = await admin.rpc('fn_actor_externo_solicitar_otp', { p_canal: 'email', p_contacto: email })
    const { authUserId } = await confirmarYRegistrar('email', email, codigo!)

    const { data: memberships, error } = await admin.from('memberships').select('id').eq('user_id', authUserId)
    if (error) throw error
    expect(memberships).toHaveLength(0)
  }, 30_000)

  it('4. si el correo ya tiene un auth_user_id de un tenant_member existente, el alta falla', async () => {
    const { tenantId, personaRolId } = await prepararRol('p4', {})
    const usuarioStaff: UsuarioPrueba = await crearUsuario(admin, `p4-staff-${RUN_ID}`)
    usuariosCreados.push(usuarioStaff.id)
    await crearMembership(admin, tenantId, usuarioStaff.id, 'auxiliar')

    const { error } = await admin.rpc('fn_actor_externo_registrar_vinculo', {
      p_tenant_id: tenantId, p_auth_user_id: usuarioStaff.id, p_persona_rol_id: personaRolId,
      p_persona_tipo: 'propietario', p_origen: 'staff',
    })
    expect(error?.message).toContain('ACTOR_EXTERNO_CONFLICTO_MEMBRESIA')
  }, 30_000)

  it('5. dos vínculos vigentes solapados para el mismo rol → ACTOR_EXTERNO_VINCULO_DUPLICADO', async () => {
    const { tenantId, personaRolId } = await prepararRol('p5', {})
    const usuario = await crearUsuario(admin, `p5-${RUN_ID}`)
    usuariosCreados.push(usuario.id)

    const { error: e1 } = await admin.rpc('fn_actor_externo_registrar_vinculo', {
      p_tenant_id: tenantId, p_auth_user_id: usuario.id, p_persona_rol_id: personaRolId,
      p_persona_tipo: 'propietario', p_origen: 'staff',
    })
    if (e1) throw e1

    const { error: e2 } = await admin.rpc('fn_actor_externo_registrar_vinculo', {
      p_tenant_id: tenantId, p_auth_user_id: usuario.id, p_persona_rol_id: personaRolId,
      p_persona_tipo: 'propietario', p_origen: 'staff',
    })
    expect(e2?.message).toContain('ACTOR_EXTERNO_VINCULO_DUPLICADO')
  }, 30_000)

  it('6. una cuenta con vínculos a dos inmuebles distintos: fn_actor_externo_mis_vinculos devuelve ambos', async () => {
    const email = `p6-${RUN_ID}@example.test`
    const rolA = await prepararRol('p6a', { email })

    // Un segundo inmueble/rol para el MISMO tercero (mismo contacto -> multi-relación real).
    const inmuebleB = await crearInmueble(rolA.tenantId, `INM-${RUN_ID}-p6b`)
    const personaRolB = await crearPersonaRol(rolA.tenantId, inmuebleB, rolA.terceroId, 'copropietario')

    const { data: codigo } = await admin.rpc('fn_actor_externo_solicitar_otp', { p_canal: 'email', p_contacto: email })
    const { authUserId, filas } = await confirmarYRegistrar('email', email, codigo!)
    expect(filas.length).toBeGreaterThanOrEqual(2)
    expect(filas.some((f) => f.persona_rol_id === personaRolB)).toBe(true)

    const { data: vinculos, error } = await admin.rpc('fn_actor_externo_mis_vinculos', { p_auth_user_id: authUserId })
    if (error) throw error
    expect(vinculos.length).toBeGreaterThanOrEqual(2)
  }, 30_000)

  it('7. cerrar inmueble_persona_rol cierra automáticamente el vínculo, con la misma fecha', async () => {
    const email = `p7-${RUN_ID}@example.test`
    const { personaRolId } = await prepararRol('p7', { email })
    const { data: codigo } = await admin.rpc('fn_actor_externo_solicitar_otp', { p_canal: 'email', p_contacto: email })
    await confirmarYRegistrar('email', email, codigo!)

    // Fecha futura, no pasada: el vínculo nace HOY (vigente_desde=current_date en
    // fn_actor_externo_registrar_vinculo) — cerrar con una fecha anterior a eso activaría el
    // clamp a GREATEST() de fn_actor_externo_revocar_por_cierre_rol (ver su propio comentario),
    // que es del todo correcto pero no lo que esta prueba puntual quiere verificar.
    const fechaCierre = '2027-01-15'
    const { error: errorCierre } = await admin
      .from('inmueble_persona_rol').update({ vigente_hasta: fechaCierre }).eq('id', personaRolId)
    if (errorCierre) throw errorCierre

    const { data: vinculo, error } = await admin
      .from('actor_externo_vinculo').select('vigente_hasta').eq('persona_rol_id', personaRolId).single()
    if (error) throw error
    expect(vinculo.vigente_hasta).toBe(fechaCierre)
  }, 30_000)

  it('8. un código OTP usado dos veces falla la segunda vez', async () => {
    const email = `p8-${RUN_ID}@example.test`
    await prepararRol('p8', { email })
    const { data: codigo } = await admin.rpc('fn_actor_externo_solicitar_otp', { p_canal: 'email', p_contacto: email })
    await confirmarYRegistrar('email', email, codigo!)

    const { error } = await admin.rpc('fn_actor_externo_confirmar_otp', {
      p_canal: 'email', p_contacto: email, p_codigo: codigo!,
    })
    expect(error?.message).toContain('OTP_INVALIDO_O_VENCIDO')
  }, 30_000)

  it('9. el límite de tasa de _shared/rate_limit.ts se aplica — sin un segundo mecanismo propio', async () => {
    const bucket = `actor_externo_otp_test:${RUN_ID}`
    const { data: r1 } = await admin.rpc('check_rate_limit', { p_bucket: bucket, p_max_hits: 2, p_window: '1 hour' })
    const { data: r2 } = await admin.rpc('check_rate_limit', { p_bucket: bucket, p_max_hits: 2, p_window: '1 hour' })
    const { data: r3 } = await admin.rpc('check_rate_limit', { p_bucket: bucket, p_max_hits: 2, p_window: '1 hour' })
    expect(r1).toBe(true)
    expect(r2).toBe(true)
    expect(r3).toBe(false)

    // Estructural: ambas Edge Functions usan check_rate_limit, ninguna implementa su propio
    // contador — grep contra el código fuente en vez de una prueba de red.
    const solicitar = readFileSync(join(RAIZ, 'supabase/functions/actor-externo-solicitar-otp/index.ts'), 'utf-8')
    const confirmar = readFileSync(join(RAIZ, 'supabase/functions/actor-externo-confirmar-otp/index.ts'), 'utf-8')
    expect(solicitar).toContain(`admin.rpc('check_rate_limit'`)
    expect(confirmar).toContain(`admin.rpc('check_rate_limit'`)
  }, 30_000)

  it('10. el paso reforzado expira pasado su tiempo de vida, y se agota tras tres intentos fallidos', async () => {
    const usuario = await crearUsuario(admin, `p10-${RUN_ID}`)
    usuariosCreados.push(usuario.id)
    const clienteUsuario = await clienteComo(env!, usuario)
    const contextoId = crypto.randomUUID()

    // Expiración: se solicita, se fuerza expira_at al pasado, y confirmar debe fallar.
    const { data: codigoExpirado } = await clienteUsuario.rpc('fn_actor_externo_paso_reforzado_solicitar', {
      p_auth_user_id: usuario.id, p_accion: 'votar', p_contexto_id: contextoId,
    })
    await admin
      .from('actor_externo_paso_reforzado')
      .update({ expira_at: '2020-01-01T00:00:00Z' })
      .eq('auth_user_id', usuario.id).eq('contexto_id', contextoId)
    const { error: errorVencido } = await clienteUsuario.rpc('fn_actor_externo_paso_reforzado_confirmar', {
      p_auth_user_id: usuario.id, p_accion: 'votar', p_contexto_id: contextoId, p_codigo: codigoExpirado!,
    })
    expect(errorVencido?.message).toContain('PASO_REFORZADO_AGOTADO')

    // Agotamiento por 3 intentos fallidos, sobre una solicitud nueva.
    const contexto2 = crypto.randomUUID()
    await clienteUsuario.rpc('fn_actor_externo_paso_reforzado_solicitar', {
      p_auth_user_id: usuario.id, p_accion: 'votar', p_contexto_id: contexto2,
    })
    for (let i = 0; i < 3; i += 1) {
      await clienteUsuario.rpc('fn_actor_externo_paso_reforzado_confirmar', {
        p_auth_user_id: usuario.id, p_accion: 'votar', p_contexto_id: contexto2, p_codigo: '000000',
      })
    }
    const { error: errorAgotado } = await clienteUsuario.rpc('fn_actor_externo_paso_reforzado_confirmar', {
      p_auth_user_id: usuario.id, p_accion: 'votar', p_contexto_id: contexto2, p_codigo: '000000',
    })
    expect(errorAgotado?.message).toContain('PASO_REFORZADO_AGOTADO')
  }, 30_000)

it('11. regresión AD-37 §5: las políticas using(true) para authenticated siguen limitadas a '
    + 'catálogos globales sin dato de negocio', async () => {
    // Contra pg_policies directo (ground truth), no regex sobre el texto de las migraciones —
    // mismo criterio que tests/rls/schema-forced-rls.test.ts (T-SEC-01).
    const dbUrl = process.env.SUPABASE_DB_URL
    if (!dbUrl) throw new Error('falta SUPABASE_DB_URL')
    const { Client } = await import('pg')
    const client = new Client({ connectionString: dbUrl })
    await client.connect()
    let filas: { tablename: string }[]
    try {
      const resultado = await client.query<{ tablename: string }>(`
        select distinct tablename
        from pg_policies
        where schemaname = 'public' and qual = 'true' and 'authenticated' = any(roles)
      `)
      filas = resultado.rows
    } finally {
      await client.end()
    }

    // AD-37 §5 documentó 9 de estas 15 (2026-09-08); las 6 restantes
    // (conceptos_plantilla/contable_plan/contable_plan_cuenta/gobierno_clase_sancion/
    // gobierno_materia_decision/presupuesto_cuenta_plantilla) se sumaron en cortes posteriores
    // (CO-4/GOB-3/GOB-6) con el mismo criterio — verificado contra pg_policies real al escribir
    // esta prueba (2026-09-09), no copiado del texto de AD-37. Todas son catálogos/plantillas
    // globales sin tenant_id de negocio. Un catálogo nuevo que necesite lectura abierta se agrega
    // aquí de forma consciente, nunca por accidente.
    const TABLAS_PERMITIDAS = new Set([
      'tipos', 'tasas_referencia', 'rol_funcional_modulo', 'plantillas_frases_prohibidas',
      'auditoria_tipo_auditoria', 'auditoria_catalogo_riesgos', 'contable_estado_plantilla',
      'contable_estado_linea', 'contable_nota_plantilla', 'contable_plan', 'contable_plan_cuenta',
      'presupuesto_cuenta_plantilla', 'conceptos_plantilla', 'gobierno_materia_decision',
      'gobierno_clase_sancion',
    ])
    const fueraDeLista = filas.map((f) => f.tablename).filter((t) => !TABLAS_PERMITIDAS.has(t))
    expect(fueraDeLista).toEqual([])
  }, 30_000)

  it('12. un actor externo autenticado no puede leer tablas protegidas por is_member()/has_role()', async () => {
    const email = `p12-${RUN_ID}@example.test`
    const { tenantId } = await prepararRol('p12', { email })
    const { data: codigo } = await admin.rpc('fn_actor_externo_solicitar_otp', { p_canal: 'email', p_contacto: email })
    const { authUserId } = await confirmarYRegistrar('email', email, codigo!)

    const password = `Aa1${crypto.randomUUID()}`
    await admin.auth.admin.updateUserById(authUserId, { password })
    const clienteExterno = await clienteComo(env!, { id: authUserId, email, password })

    const { data, error } = await clienteExterno.from('cargos').select('id').eq('tenant_id', tenantId)
    // RLS bloquea: o cero filas, o un error explícito — nunca datos.
    if (error === null) {
      expect(data).toHaveLength(0)
    }
  }, 30_000)

  it('13. aislamiento entre tenants en fn_actor_externo_mis_vinculos', async () => {
    const emailA = `p13a-${RUN_ID}@example.test`
    await prepararRol('p13a', { email: emailA })
    const { data: codigoA } = await admin.rpc('fn_actor_externo_solicitar_otp', { p_canal: 'email', p_contacto: emailA })
    const { authUserId: authA } = await confirmarYRegistrar('email', emailA, codigoA!)

    const emailB = `p13b-${RUN_ID}@example.test`
    await prepararRol('p13b', { email: emailB })
    const { data: codigoB } = await admin.rpc('fn_actor_externo_solicitar_otp', { p_canal: 'email', p_contacto: emailB })
    const { authUserId: authB } = await confirmarYRegistrar('email', emailB, codigoB!)

    const passwordB = `Aa1${crypto.randomUUID()}`
    await admin.auth.admin.updateUserById(authB, { password: passwordB })
    const clienteB = await clienteComo(env!, { id: authB, email: emailB, password: passwordB })

    const { data: vinculosDeAVistosPorB, error } = await clienteB.rpc('fn_actor_externo_mis_vinculos', { p_auth_user_id: authA })
    if (error) throw error
    expect(vinculosDeAVistosPorB).toHaveLength(0)
  }, 30_000)

  it('14. los dos enums tienen comment on type', () => {
    const contenido = readFileSync(join(RAIZ, 'supabase/migrations/20260932640000_ext1_vocabulario.sql'), 'utf-8')
    expect(contenido).toMatch(/comment on type public\.actor_externo_persona_t is/)
    expect(contenido).toMatch(/comment on type public\.actor_externo_origen_t is/)
  })

  it('15. subir un avatar mayor al límite de tamaño o de un tipo no permitido falla', async () => {
    const usuario = await crearUsuario(admin, `p15-${RUN_ID}`)
    usuariosCreados.push(usuario.id)
    const password = `Aa1${crypto.randomUUID()}`
    await admin.auth.admin.updateUserById(usuario.id, { password })
    const cliente = await clienteComo(env!, { ...usuario, password })

    const archivoGrande = new Uint8Array(3 * 1024 * 1024) // 3MB > 2MB del bucket
    const { error: errorGrande } = await cliente.storage
      .from('avatares').upload(`${usuario.id}/grande.png`, archivoGrande, { contentType: 'image/png' })
    expect(errorGrande).toBeTruthy()

    const archivoTipoInvalido = new Uint8Array([1, 2, 3])
    const { error: errorTipo } = await cliente.storage
      .from('avatares').upload(`${usuario.id}/invalido.pdf`, archivoTipoInvalido, { contentType: 'application/pdf' })
    expect(errorTipo).toBeTruthy()
  }, 30_000)

  it('16. un auth_user_id no puede leer ni sobrescribir el avatar de otro', async () => {
    const usuarioA = await crearUsuario(admin, `p16a-${RUN_ID}`)
    usuariosCreados.push(usuarioA.id)
    const usuarioB = await crearUsuario(admin, `p16b-${RUN_ID}`)
    usuariosCreados.push(usuarioB.id)
    const passwordA = `Aa1${crypto.randomUUID()}`
    await admin.auth.admin.updateUserById(usuarioA.id, { password: passwordA })
    const clienteA = await clienteComo(env!, { ...usuarioA, password: passwordA })

    const archivo = new Uint8Array([137, 80, 78, 71])
    const { error: errorSubidaA } = await clienteA.storage
      .from('avatares').upload(`${usuarioA.id}/avatar.png`, archivo, { contentType: 'image/png' })
    expect(errorSubidaA).toBeNull()

    const passwordB = `Aa1${crypto.randomUUID()}`
    await admin.auth.admin.updateUserById(usuarioB.id, { password: passwordB })
    const clienteB = await clienteComo(env!, { ...usuarioB, password: passwordB })

    const { error: errorSobrescribir } = await clienteB.storage
      .from('avatares').update(`${usuarioA.id}/avatar.png`, archivo, { contentType: 'image/png' })
    expect(errorSobrescribir).toBeTruthy()
  }, 30_000)

  it('17. cambiar avatar_url/alias en user_metadata no modifica ni es leído por el nombre oficial', async () => {
    const email = `p17-${RUN_ID}@example.test`
    const { terceroId } = await prepararRol('p17', { email })
    const { data: codigo } = await admin.rpc('fn_actor_externo_solicitar_otp', { p_canal: 'email', p_contacto: email })
    const { authUserId } = await confirmarYRegistrar('email', email, codigo!)

    const { data: terceroAntes } = await admin.from('terceros').select('nombre_completo').eq('id', terceroId).single()

    await admin.auth.admin.updateUserById(authUserId, {
      user_metadata: { avatar_url: 'https://example.test/avatar.png', full_name: 'Alias Falso' },
    })

    const { data: terceroDespues } = await admin.from('terceros').select('nombre_completo').eq('id', terceroId).single()
    expect(terceroDespues?.nombre_completo).toBe(terceroAntes?.nombre_completo)

    const { data: perfil } = await admin.from('profiles').select('full_name').eq('id', authUserId).single()
    // profiles.full_name se llena solo al crear el usuario (handle_new_user) — updateUserById no
    // lo toca (no hay trigger de sincronización en sentido inverso), así que sigue siendo el que
    // tenía la cuenta al crearse, nunca el nombre oficial de terceros.
    expect(perfil?.full_name).not.toBe('Alias Falso')
  }, 30_000)
})
