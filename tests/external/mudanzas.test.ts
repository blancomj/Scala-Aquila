/**
 * EXT-13 (Ola 2, U9, 20260947000000) — horario semanal de zonas comunes (mudanzas). Ver
 * PROMPT_MI_COPROPIEDAD_FASE2.md §4.1/§7.8/§8.3.
 *
 * Cubre lo que EXT-03 (tests/external/reservas.test.ts) no ejercita: la zona SIN ninguna fila en
 * mant_zona_horario_semanal se comporta exactamente igual que antes (regresión explícita, DoD
 * §10); una zona CON filas expone `franjas_validas` correctas para el día consultado; el guard
 * rechaza una reserva fuera de cualquier franja configurada (RESERVA_FUERA_DE_HORARIO_SEMANAL);
 * una reserva DENTRO de una franja configurada se crea con normalidad.
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
  console.warn('SALTADO tests/external/mudanzas: faltan variables de Supabase en .env')
}

interface RespuestaReserva {
  id: string
  estado: string
}
interface RespuestaDisponibilidad {
  ocupadas: { hora_inicio: string; hora_fin: string }[]
  regla: { requiere_aprobacion: boolean; cupo_simultaneo: number } | null
  franjas_validas?: { hora_desde: string; hora_hasta: string }[]
}

interface ErrorHttpParseado {
  status: number | null
  codigo: string | null
  mensaje: string | null
}

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

d('EXT-13: horario semanal de zonas comunes (mudanzas)', () => {
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

  async function crearRegla(tenantId: string, zonaComunId: string): Promise<void> {
    const { error } = await admin.from('mant_zona_reserva_regla').insert({
      tenant_id: tenantId, zona_comun_id: zonaComunId, requiere_aprobacion: false,
      cupo_simultaneo: 1, vigente_desde: '2020-01-01',
    })
    if (error) throw new Error(`fixture regla zona ${zonaComunId}: ${error.message}`)
  }

  async function crearHorario(
    tenantId: string, zonaComunId: string, diaSemana: number, horaDesde: string, horaHasta: string,
  ): Promise<void> {
    const { error } = await admin.from('mant_zona_horario_semanal').insert({
      tenant_id: tenantId, zona_comun_id: zonaComunId,
      dia_semana: diaSemana, hora_desde: horaDesde, hora_hasta: horaHasta,
    })
    if (error) throw new Error(`fixture horario semanal: ${error.message}`)
  }

  async function prepararTenantConActorExterno(etiqueta: string): Promise<{
    tenantId: string; inmuebleId: string; zonaComunId: string; actorExternoVinculoId: string
    clienteExterno: Cliente
  }> {
    const tenant = await crearTenant(admin, etiqueta)
    tenantsCreados.push(tenant.id)
    const inmuebleId = await crearInmueble(tenant.id, `EXT13-${etiqueta}-${RUN_ID}`)
    const zonaComunId = await crearZonaComun(tenant.id, `Z13-${etiqueta}-${RUN_ID}`)
    const terceroId = await crearTercero(tenant.id, `${RUN_ID}-${etiqueta}`)
    const personaRolId = await crearPersonaRol(tenant.id, inmuebleId, terceroId)

    const email = `ext13-${RUN_ID}-${etiqueta}@example.test`
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

  // 2028-03-20 es lunes (dia_semana=1 con extract(dow) / getDay()).
  const LUNES = '2028-03-20'

  it('1. zona SIN horario semanal configurado: disponibilidad no incluye franjas_validas (regresión explícita)', async () => {
    const t = await prepararTenantConActorExterno('m1')
    await crearRegla(t.tenantId, t.zonaComunId)

    const { data, error } = await invocarConError(
      t.clienteExterno.functions.invoke<RespuestaDisponibilidad>('external-reservas-disponibilidad', {
        body: { vinculo_id: t.actorExternoVinculoId, zona_comun_id: t.zonaComunId, fecha: LUNES },
      }),
    )
    if (error) throw new Error(error.mensaje ?? 'fallo inesperado')
    expect(data).not.toHaveProperty('franjas_validas')
  }, 30_000)

  it('2. zona SIN horario semanal configurado: crear una reserva sigue funcionando sin restricción (regresión)', async () => {
    const t = await prepararTenantConActorExterno('m2')
    await crearRegla(t.tenantId, t.zonaComunId)

    const { data, error } = await invocarConError(
      t.clienteExterno.functions.invoke<RespuestaReserva>('external-reservas-crear', {
        body: { vinculo_id: t.actorExternoVinculoId, zona_comun_id: t.zonaComunId, fecha: LUNES, hora_inicio: '02:00', hora_fin: '03:00' },
      }),
    )
    if (error) throw new Error(error.mensaje ?? 'fallo inesperado')
    expect(data!.estado).toBe('aprobada')
  }, 30_000)

  it('3. zona CON horario semanal: disponibilidad expone franjas_validas del día consultado (lunes)', async () => {
    const t = await prepararTenantConActorExterno('m3')
    await crearRegla(t.tenantId, t.zonaComunId)
    await crearHorario(t.tenantId, t.zonaComunId, 1, '08:00', '12:00')
    await crearHorario(t.tenantId, t.zonaComunId, 2, '08:00', '12:00')

    const { data, error } = await invocarConError(
      t.clienteExterno.functions.invoke<RespuestaDisponibilidad>('external-reservas-disponibilidad', {
        body: { vinculo_id: t.actorExternoVinculoId, zona_comun_id: t.zonaComunId, fecha: LUNES },
      }),
    )
    if (error) throw new Error(error.mensaje ?? 'fallo inesperado')
    expect(data!.franjas_validas).toEqual([{ hora_desde: '08:00:00', hora_hasta: '12:00:00' }])
  }, 30_000)

  it('4. zona CON horario semanal pero sin franja para el día consultado: franjas_validas es un arreglo vacío', async () => {
    const t = await prepararTenantConActorExterno('m4')
    await crearRegla(t.tenantId, t.zonaComunId)
    // Solo configura martes (2); la fecha consultada es lunes.
    await crearHorario(t.tenantId, t.zonaComunId, 2, '08:00', '12:00')

    const { data, error } = await invocarConError(
      t.clienteExterno.functions.invoke<RespuestaDisponibilidad>('external-reservas-disponibilidad', {
        body: { vinculo_id: t.actorExternoVinculoId, zona_comun_id: t.zonaComunId, fecha: LUNES },
      }),
    )
    if (error) throw new Error(error.mensaje ?? 'fallo inesperado')
    expect(data!.franjas_validas).toEqual([])
  }, 30_000)

  it('5. una reserva fuera de cualquier franja configurada es rechazada con RESERVA_FUERA_DE_HORARIO_SEMANAL', async () => {
    const t = await prepararTenantConActorExterno('m5')
    await crearRegla(t.tenantId, t.zonaComunId)
    await crearHorario(t.tenantId, t.zonaComunId, 1, '08:00', '12:00')

    const { data, error } = await invocarConError(
      t.clienteExterno.functions.invoke<RespuestaReserva>('external-reservas-crear', {
        body: { vinculo_id: t.actorExternoVinculoId, zona_comun_id: t.zonaComunId, fecha: LUNES, hora_inicio: '14:00', hora_fin: '15:00' },
      }),
    )
    expect(data).toBeNull()
    expect(error!.status).toBe(400)
    expect(error!.codigo).toBe('RESERVA_FUERA_DE_HORARIO_SEMANAL')
  }, 30_000)

  it('6. una reserva DENTRO de la franja configurada se crea con normalidad', async () => {
    const t = await prepararTenantConActorExterno('m6')
    await crearRegla(t.tenantId, t.zonaComunId)
    await crearHorario(t.tenantId, t.zonaComunId, 1, '08:00', '12:00')

    const { data, error } = await invocarConError(
      t.clienteExterno.functions.invoke<RespuestaReserva>('external-reservas-crear', {
        body: { vinculo_id: t.actorExternoVinculoId, zona_comun_id: t.zonaComunId, fecha: LUNES, hora_inicio: '09:00', hora_fin: '10:00' },
      }),
    )
    if (error) throw new Error(error.mensaje ?? 'fallo inesperado')
    expect(data!.estado).toBe('aprobada')
  }, 30_000)
})
