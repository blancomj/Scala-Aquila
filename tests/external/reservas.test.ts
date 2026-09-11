/**
 * EXT-03 (20260932850000-20260932860000 + Edge Functions) — reservas desde External. Ver
 * Casos de uso/Solicitudes - Reservas - Visitantes/EXT_03_reservas.md §5 (11 pruebas
 * obligatorias).
 *
 * Deliberadamente delgado (spec §2): External no decide nada sobre cupos, aprobación o cobro —
 * toda esa lógica vive en MANT-10 (guard_mant_reserva + el exclude constraint), reutilizada tal
 * cual. Las 4 Edge Functions (external-reservas-disponibilidad/-crear/-cancelar/-listar) siguen
 * el mismo patrón de sesión real que EXT-02.
 */
import { afterAll, describe, expect, it } from 'vitest'
import 'dotenv/config'
import {
  clienteAdmin,
  clienteComo,
  crearTenant,
  eliminarTenant,
  eliminarUsuario,
  leerEntorno,
  RUN_ID,
  type Cliente,
} from '../rls/helpers.js'

const env = leerEntorno()
const d = env ? describe : describe.skip

if (!env) {
  console.warn('SALTADO tests/external/reservas: faltan variables de Supabase en .env')
}

interface RespuestaReserva {
  id: string
  tenant_id: string
  zona_comun_id: string
  inmueble_id: string
  solicitante_ref: string
  solicitante_origen: string
  fecha: string
  hora_inicio: string
  hora_fin: string
  estado: string
  cargo_id: string | null
  penalizada: boolean
}
interface RespuestaListado {
  id: string
  zona_comun_id: string
  fecha: string
  hora_inicio: string
  hora_fin: string
  estado: string
  penalizada: boolean
  motivo_rechazo: string | null
  created_at: string
}
interface RespuestaDisponibilidad {
  ocupadas: { hora_inicio: string; hora_fin: string }[]
  regla: { requiere_aprobacion: boolean; cupo_simultaneo: number } | null
}

interface ErrorHttpParseado {
  status: number | null
  codigo: string | null
  mensaje: string | null
}

/** supabase-js envuelve un fallo de Edge Function en FunctionsHttpError cuyo `.context` es el
 * Response crudo — mismo patrón que apps/web/app/utils/edge-function-error.ts (y tests/external/
 * solicitudes.test.ts, EXT-02: enrutar TODA llamada .functions.invoke() por aquí evita el
 * no-unsafe-assignment de eslint, ya que @supabase/functions-js tipa error como `any`). */
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

d('EXT-03: reservas desde External', () => {
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

  async function crearZonaComun(tenantId: string, codigo: string): Promise<string> {
    const tipoId = await idListaTipos('TIPO_ZONA_COMUN', 'recreativa')
    const { data, error } = await admin
      .from('zonas_comunes').insert({ tenant_id: tenantId, codigo, nombre: `Zona ${codigo}`, tipo_id: tipoId })
      .select('id').single<{ id: string }>()
    if (error) throw new Error(`fixture zona ${codigo}: ${error.message}`)
    return data.id
  }

  async function crearConcepto(tenantId: string, codigo: string, valorFijo: number): Promise<string> {
    const { data, error } = await admin
      .from('conceptos')
      .insert({
        tenant_id: tenantId, codigo, nombre: `Concepto ${codigo}`,
        modo_calculo: 'directo', estado: 'activo',
        modo_valor: 'fijo', valor_fijo: valorFijo,
        tipo_recurrencia: 'unico', fecha_inicio_anio: 2020, fecha_inicio_mes: 1,
        alcance: 'todos',
      })
      .select('id').single<{ id: string }>()
    if (error) throw new Error(`fixture concepto ${codigo}: ${error.message}`)
    return data.id
  }

  async function crearPeriodo(tenantId: string, anio: number, mes: number): Promise<void> {
    const { error } = await admin.from('periodos').insert({ tenant_id: tenantId, anio, mes })
    if (error && !error.message.includes('duplicate')) throw new Error(`fixture periodo: ${error.message}`)
  }

  interface ReglaOverrides {
    requiere_aprobacion?: boolean
    cupo_simultaneo?: number
    genera_cargo?: boolean
    concepto_id?: string
    penalidad_cancelacion_tardia_horas?: number
    vigente_desde?: string
  }
  async function crearRegla(tenantId: string, zonaComunId: string, overrides: ReglaOverrides = {}): Promise<void> {
    const { error } = await admin.from('mant_zona_reserva_regla').insert({
      tenant_id: tenantId, zona_comun_id: zonaComunId, requiere_aprobacion: true,
      cupo_simultaneo: 1, vigente_desde: '2020-01-01', ...overrides,
    })
    if (error) throw new Error(`fixture regla zona ${zonaComunId}: ${error.message}`)
  }

  /** Tenant + inmueble + zona común (sin regla — cada prueba la crea a su medida) + un actor
   * externo YA vinculado (propietario) con sesión real (AD-37). */
  async function prepararTenantConActorExterno(etiqueta: string): Promise<{
    tenantId: string; inmuebleId: string; zonaComunId: string; actorExternoVinculoId: string
    clienteExterno: Cliente
  }> {
    const tenant = await crearTenant(admin, etiqueta)
    tenantsCreados.push(tenant.id)
    const inmuebleId = await crearInmueble(tenant.id, `EXT3-${etiqueta}-${RUN_ID}`)
    const zonaComunId = await crearZonaComun(tenant.id, `Z-${etiqueta}-${RUN_ID}`)
    const terceroId = await crearTercero(tenant.id, `${RUN_ID}-${etiqueta}`)
    const personaRolId = await crearPersonaRol(tenant.id, inmuebleId, terceroId)

    const email = `ext3-${RUN_ID}-${etiqueta}@example.test`
    const password = `Aa1${crypto.randomUUID()}`
    const { data: creado, error: errorCrear } = await admin.auth.admin.createUser({
      email, password, email_confirm: true,
    })
    if (errorCrear) throw errorCrear
    usuariosCreados.push(creado.user.id)

    const vinculoId = await crearVinculo(tenant.id, personaRolId, creado.user.id)
    const clienteExterno = await clienteComo(env!, { id: creado.user.id, email, password })

    return { tenantId: tenant.id, inmuebleId, zonaComunId, actorExternoVinculoId: vinculoId, clienteExterno }
  }

  it('1. consultar disponibilidad devuelve exactamente las franjas ocupadas reales de esa zona y fecha', async () => {
    const t = await prepararTenantConActorExterno('p1')
    await crearRegla(t.tenantId, t.zonaComunId, { requiere_aprobacion: false })
    const fecha = '2028-03-10'
    const { error: eCrear } = await invocarConError(
      t.clienteExterno.functions.invoke<RespuestaReserva>('external-reservas-crear', {
        body: { vinculo_id: t.actorExternoVinculoId, zona_comun_id: t.zonaComunId, fecha, hora_inicio: '10:00', hora_fin: '11:00' },
      }),
    )
    if (eCrear) throw new Error(eCrear.mensaje ?? 'fallo inesperado')

    const { data, error } = await invocarConError(
      t.clienteExterno.functions.invoke<RespuestaDisponibilidad>('external-reservas-disponibilidad', {
        body: { vinculo_id: t.actorExternoVinculoId, zona_comun_id: t.zonaComunId, fecha },
      }),
    )
    if (error) throw new Error(error.mensaje ?? 'fallo inesperado')
    expect(data!.ocupadas).toEqual([{ hora_inicio: '10:00:00', hora_fin: '11:00:00' }])
    expect(data!.regla).not.toBeNull()
  }, 30_000)

  it('2. crear resuelve inmueble_id desde el vínculo, ignorando cualquier valor forzado en el cuerpo', async () => {
    const t = await prepararTenantConActorExterno('p2')
    await crearRegla(t.tenantId, t.zonaComunId, { requiere_aprobacion: false })
    const otroInmuebleId = await crearInmueble(t.tenantId, `EXT3-p2-otro-${RUN_ID}`)

    const { data, error } = await invocarConError(
      t.clienteExterno.functions.invoke<RespuestaReserva>('external-reservas-crear', {
        body: {
          vinculo_id: t.actorExternoVinculoId, zona_comun_id: t.zonaComunId, fecha: '2028-03-11',
          hora_inicio: '10:00', hora_fin: '11:00', inmueble_id: otroInmuebleId,
        },
      }),
    )
    if (error) throw new Error(error.mensaje ?? 'fallo inesperado')
    expect(data!.inmueble_id).toBe(t.inmuebleId)
    expect(data!.inmueble_id).not.toBe(otroInmuebleId)
  }, 30_000)

  it('3. dos reservas traslapadas para la misma zona: la segunda falla por el exclude constraint (RESERVA_TRASLAPE)', async () => {
    const t = await prepararTenantConActorExterno('p3')
    await crearRegla(t.tenantId, t.zonaComunId, { requiere_aprobacion: false })
    const fecha = '2028-03-12'
    const { error: e1 } = await invocarConError(
      t.clienteExterno.functions.invoke<RespuestaReserva>('external-reservas-crear', {
        body: { vinculo_id: t.actorExternoVinculoId, zona_comun_id: t.zonaComunId, fecha, hora_inicio: '10:00', hora_fin: '11:00' },
      }),
    )
    if (e1) throw new Error(e1.mensaje ?? 'fallo inesperado')

    const { data, error } = await invocarConError(
      t.clienteExterno.functions.invoke<RespuestaReserva>('external-reservas-crear', {
        body: { vinculo_id: t.actorExternoVinculoId, zona_comun_id: t.zonaComunId, fecha, hora_inicio: '10:30', hora_fin: '11:30' },
      }),
    )
    expect(data).toBeNull()
    expect(error!.status).toBe(409)
    expect(error!.codigo).toBe('RESERVA_TRASLAPE')
  }, 30_000)

  it('4. con requiere_aprobacion=false, la respuesta indica aprobada de inmediato', async () => {
    const t = await prepararTenantConActorExterno('p4')
    await crearRegla(t.tenantId, t.zonaComunId, { requiere_aprobacion: false })
    const { data, error } = await invocarConError(
      t.clienteExterno.functions.invoke<RespuestaReserva>('external-reservas-crear', {
        body: { vinculo_id: t.actorExternoVinculoId, zona_comun_id: t.zonaComunId, fecha: '2028-03-13', hora_inicio: '10:00', hora_fin: '11:00' },
      }),
    )
    if (error) throw new Error(error.mensaje ?? 'fallo inesperado')
    expect(data!.estado).toBe('aprobada')
  }, 30_000)

  it('5. con requiere_aprobacion=true, la respuesta indica solicitada', async () => {
    const t = await prepararTenantConActorExterno('p5')
    await crearRegla(t.tenantId, t.zonaComunId, { requiere_aprobacion: true })
    const { data, error } = await invocarConError(
      t.clienteExterno.functions.invoke<RespuestaReserva>('external-reservas-crear', {
        body: { vinculo_id: t.actorExternoVinculoId, zona_comun_id: t.zonaComunId, fecha: '2028-03-14', hora_inicio: '10:00', hora_fin: '11:00' },
      }),
    )
    if (error) throw new Error(error.mensaje ?? 'fallo inesperado')
    expect(data!.estado).toBe('solicitada')
  }, 30_000)

  it('6. cancelar dentro de la ventana de penalidad tardía advierte la penalidad en la respuesta', async () => {
    const t = await prepararTenantConActorExterno('p6')
    // penalidad_cancelacion_tardia_horas muy grande (400 días) en vez de relativa a "ahora": la
    // condición now() > (inicio - penalidad) queda trivialmente cierta para cualquier fecha futura
    // razonable, sin depender de la hora real de ejecución del test (evita cruces de medianoche
    // UTC — bug real encontrado: "ahora + 2h" cerca de medianoche generaba hora_fin < hora_inicio
    // dentro del mismo `fecha`, violando mant_reservas_horario_valido).
    await crearRegla(t.tenantId, t.zonaComunId, { requiere_aprobacion: false, penalidad_cancelacion_tardia_horas: 24 * 400 })

    const manana = new Date(Date.now() + 24 * 60 * 60 * 1000)
    const fecha = manana.toISOString().slice(0, 10)
    const horaInicio = '10:00'
    const horaFin = '11:00'

    const { data: creada, error: eCrear } = await invocarConError(
      t.clienteExterno.functions.invoke<RespuestaReserva>('external-reservas-crear', {
        body: { vinculo_id: t.actorExternoVinculoId, zona_comun_id: t.zonaComunId, fecha, hora_inicio: horaInicio, hora_fin: horaFin },
      }),
    )
    if (eCrear) throw new Error(eCrear.mensaje ?? 'fallo inesperado')
    expect(creada!.estado).toBe('aprobada')

    const { data: cancelada, error: eCancelar } = await invocarConError(
      t.clienteExterno.functions.invoke<RespuestaReserva>('external-reservas-cancelar', {
        body: { vinculo_id: t.actorExternoVinculoId, reserva_id: creada!.id },
      }),
    )
    if (eCancelar) throw new Error(eCancelar.mensaje ?? 'fallo inesperado')
    expect(cancelada!.estado).toBe('cancelada')
    expect(cancelada!.penalizada).toBe(true)
  }, 30_000)

  it('7. un actor externo no puede reservar ni cancelar a nombre de un inmueble que no es el suyo', async () => {
    const a = await prepararTenantConActorExterno('p7a')
    const b = await prepararTenantConActorExterno('p7b')
    await crearRegla(a.tenantId, a.zonaComunId, { requiere_aprobacion: false })
    await crearRegla(b.tenantId, b.zonaComunId, { requiere_aprobacion: false })

    const { data: dataCrear, error: eCrear } = await invocarConError(
      a.clienteExterno.functions.invoke<RespuestaReserva>('external-reservas-crear', {
        body: { vinculo_id: b.actorExternoVinculoId, zona_comun_id: b.zonaComunId, fecha: '2028-03-15', hora_inicio: '10:00', hora_fin: '11:00' },
      }),
    )
    expect(dataCrear).toBeNull()
    expect(eCrear!.status).toBe(403)
    expect(eCrear!.codigo).toBe('VINCULO_NO_PERTENECE')

    const { data: reservaB, error: eCrearB } = await invocarConError(
      b.clienteExterno.functions.invoke<RespuestaReserva>('external-reservas-crear', {
        body: { vinculo_id: b.actorExternoVinculoId, zona_comun_id: b.zonaComunId, fecha: '2028-03-16', hora_inicio: '10:00', hora_fin: '11:00' },
      }),
    )
    if (eCrearB) throw new Error(eCrearB.mensaje ?? 'fallo inesperado')

    const { data: dataCancelar, error: eCancelar } = await invocarConError(
      a.clienteExterno.functions.invoke<RespuestaReserva>('external-reservas-cancelar', {
        body: { vinculo_id: a.actorExternoVinculoId, reserva_id: reservaB!.id },
      }),
    )
    expect(dataCancelar).toBeNull()
    expect(eCancelar!.codigo).toBe('RESERVA_INEXISTENTE')
  }, 30_000)

  it('8. GET /external/reservas solo devuelve las del vínculo que consulta', async () => {
    const a = await prepararTenantConActorExterno('p8a')
    const b = await prepararTenantConActorExterno('p8b')
    await crearRegla(a.tenantId, a.zonaComunId, { requiere_aprobacion: false })
    await crearRegla(b.tenantId, b.zonaComunId, { requiere_aprobacion: false })

    const { error: eA } = await invocarConError(
      a.clienteExterno.functions.invoke<RespuestaReserva>('external-reservas-crear', {
        body: { vinculo_id: a.actorExternoVinculoId, zona_comun_id: a.zonaComunId, fecha: '2028-03-17', hora_inicio: '10:00', hora_fin: '11:00' },
      }),
    )
    if (eA) throw new Error(eA.mensaje ?? 'fallo inesperado')
    const { error: eB } = await invocarConError(
      b.clienteExterno.functions.invoke<RespuestaReserva>('external-reservas-crear', {
        body: { vinculo_id: b.actorExternoVinculoId, zona_comun_id: b.zonaComunId, fecha: '2028-03-17', hora_inicio: '10:00', hora_fin: '11:00' },
      }),
    )
    if (eB) throw new Error(eB.mensaje ?? 'fallo inesperado')

    const { data: listaA, error: eListaA } = await invocarConError(
      a.clienteExterno.functions.invoke<RespuestaListado[]>('external-reservas-listar', {
        body: { vinculo_id: a.actorExternoVinculoId },
      }),
    )
    if (eListaA) throw new Error(eListaA.mensaje ?? 'fallo inesperado')
    expect(listaA!.length).toBe(1)
    expect(listaA!.every((r) => r.zona_comun_id === a.zonaComunId)).toBe(true)
  }, 30_000)

  it('9. cero políticas RLS nuevas sobre mant_reservas (idénticas a las de MANT-10)', async () => {
    const dbUrl = process.env.SUPABASE_DB_URL
    if (!dbUrl) throw new Error('falta SUPABASE_DB_URL')
    const { Client } = await import('pg')
    const client = new Client({ connectionString: dbUrl })
    await client.connect()
    let filas: { policyname: string }[]
    try {
      const resultado = await client.query<{ policyname: string }>(`
        select policyname from pg_policies
        where schemaname = 'public' and tablename = 'mant_reservas'
        order by policyname
      `)
      filas = resultado.rows
    } finally {
      await client.end()
    }
    expect(filas.map((f) => f.policyname)).toEqual(['mant_reservas_select_miembro', 'mant_reservas_staff_todo'])
  }, 30_000)

  it('10. ninguna validación de traslape existe en el código de este corte — se apoya en el exclude constraint de MANT-10', async () => {
    const dbUrl = process.env.SUPABASE_DB_URL
    if (!dbUrl) throw new Error('falta SUPABASE_DB_URL')
    const { Client } = await import('pg')
    const client = new Client({ connectionString: dbUrl })
    await client.connect()
    let definicion: string
    try {
      const resultado = await client.query<{ definicion: string }>(`
        select pg_get_functiondef(p.oid) as definicion
        from pg_proc p join pg_namespace n on n.oid = p.pronamespace
        where n.nspname = 'public' and p.proname = 'fn_reserva_crear_externa'
      `)
      expect(resultado.rows).toHaveLength(1)
      definicion = resultado.rows[0]!.definicion
    } finally {
      await client.end()
    }
    expect(definicion).not.toContain('tsrange')
    expect(definicion).not.toContain('&&')
    expect(definicion).not.toContain('overlaps')
    expect(definicion).toContain('exclusion_violation')
  }, 30_000)

  it('11. aislamiento entre tenants', async () => {
    const a = await prepararTenantConActorExterno('p11a')
    const b = await prepararTenantConActorExterno('p11b')
    await crearRegla(a.tenantId, a.zonaComunId, { requiere_aprobacion: false })

    const { data, error } = await invocarConError(
      a.clienteExterno.functions.invoke<RespuestaReserva>('external-reservas-crear', {
        body: { vinculo_id: b.actorExternoVinculoId, zona_comun_id: a.zonaComunId, fecha: '2028-03-18', hora_inicio: '10:00', hora_fin: '11:00' },
      }),
    )
    expect(data).toBeNull()
    expect(error!.codigo).toBe('VINCULO_NO_PERTENECE')
  }, 30_000)

  it('12. genera_cargo=true en una zona auto-aprobada crea el cargo, enlazado desde la primera respuesta', async () => {
    const t = await prepararTenantConActorExterno('p12')
    const conceptoId = await crearConcepto(t.tenantId, `RSV-${RUN_ID}-p12`, 60000)
    await crearRegla(t.tenantId, t.zonaComunId, { requiere_aprobacion: false, genera_cargo: true, concepto_id: conceptoId })
    await crearPeriodo(t.tenantId, 2028, 3)

    const { data, error } = await invocarConError(
      t.clienteExterno.functions.invoke<RespuestaReserva>('external-reservas-crear', {
        body: { vinculo_id: t.actorExternoVinculoId, zona_comun_id: t.zonaComunId, fecha: '2028-03-19', hora_inicio: '10:00', hora_fin: '11:00' },
      }),
    )
    if (error) throw new Error(error.mensaje ?? 'fallo inesperado')
    expect(data!.estado).toBe('aprobada')
    expect(data!.cargo_id).not.toBeNull()
  }, 30_000)
})
