/**
 * EXT-11 (Ola 3, M20 — `external-gobierno-listar`) — Gobierno de solo lectura para el actor
 * externo. Ver `PROMPT_MI_COPROPIEDAD_FASE3.md` §7.1/§9/§10.
 *
 * El dominio de gobierno es TENANT-COMPLETO (ninguna tabla `gobierno_*` tiene `inmueble_id`) — el
 * filtro es solo `tenant_id`. Nunca se exponen `gobierno_poderes` ni `gobierno_votos` (el voto
 * individual de cada miembro/inmueble): la función solo devuelve el resultado agregado ya
 * congelado en `gobierno_votaciones`.
 *
 * Fixtures de reunión/acta reutilizan el mismo camino que `tests/gobierno/acta.test.ts` (GOB-2/
 * GOB-3/GOB-4 real, no un atajo): instalar/cerrar exige el cliente autenticado de un
 * `administrador` real (el trigger valida rol vía `auth.uid()`, que `admin`/service_role no
 * tiene), `gobierno_generar_acta`/`fn_gobierno_suscribir_acta` son RPCs reales, y la transición a
 * `publicada` pasa por `gobierno_acta_entregas` (tipo `entrega`), igual que en producción.
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
} from '../rls/helpers.js'

const env = leerEntorno()
const d = env ? describe : describe.skip

if (!env) {
  console.warn('SALTADO tests/external/gobierno: faltan variables de Supabase en .env')
}

interface RespuestaReunion {
  id: string
  organo_nombre: string
  tipo_nombre: string
  modalidad: string
  fecha_hora: string
  lugar: string | null
  medio: string | null
  estado: string
}
interface RespuestaListado {
  reuniones: RespuestaReunion[]
}
interface RespuestaVotacion {
  id: string
  pregunta: string
  materia_nombre: string
  resultado: string | null
  coeficiente_total: string | null
  coeficiente_representado: string | null
  coeficiente_favor: string | null
  coeficiente_contra: string | null
  coeficiente_abstencion: string | null
}
interface RespuestaDetalle {
  reunion: RespuestaReunion
  convocatoria: { emitida_at: string; fecha_limite_respuesta: string | null; documento_id: string | null } | null
  agenda: { id: string; orden: number; titulo: string; descripcion: string | null; requiere_decision: boolean }[]
  acta: { id: string; numero: number | null; anio: number; documento_id: string | null } | null
  votaciones: RespuestaVotacion[]
}

interface ErrorHttpParseado {
  status: number | null
  codigo: string | null
  mensaje: string | null
}

/** Mismo patrón que el resto de tests/external/*.test.ts. */
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

d('EXT-11: gobierno de solo lectura desde External', () => {
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

  async function idMateria(codigo: string): Promise<number> {
    const { data, error } = await admin
      .from('gobierno_materia_decision').select('id').eq('codigo', codigo).single<{ id: number }>()
    if (error) throw new Error(`fixture materia ${codigo}: ${error.message}`)
    return data.id
  }

  async function crearInmueble(tenantId: string, codigo: string): Promise<string> {
    const tipoId = await idListaTipos('TIPO_INMUEBLE', 'apartamento')
    const { data, error } = await admin
      .from('inmuebles').insert({ tenant_id: tenantId, codigo, tipo_id: tipoId }).select('id').single<{ id: string }>()
    if (error) throw new Error(`fixture inmueble ${codigo}: ${error.message}`)
    return data.id
  }

  async function crearTercero(tenantId: string, sello: string): Promise<string> {
    const tipoIdentId = await idListaTipos('TIPO_IDENTIFICACION', 'cedula')
    const estadoActivoId = await idListaTipos('ESTADO_TERCERO', 'activo')
    const { data, error } = await admin.from('terceros').insert({
      tenant_id: tenantId, tipo_persona: 'natural', tipo_identificacion_id: tipoIdentId,
      numero_documento: `${RUN_ID}-${sello}`, primer_nombre: 'Externo', primer_apellido: sello, estado_id: estadoActivoId,
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

  async function crearVinculoExterno(tenantId: string, personaRolId: string, authUserId: string): Promise<string> {
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

  async function crearOrgano(tenantId: string): Promise<string> {
    const tipoId = await idListaTipos('ORGANO_GOBIERNO', 'asamblea_general')
    const { data, error } = await admin
      .from('gobierno_organos')
      .insert({ tenant_id: tenantId, tipo_id: tipoId, vigente_desde: '2020-01-01' })
      .select('id').single<{ id: string }>()
    if (error) throw new Error(`fixture organo: ${error.message}`)
    return data.id
  }

  async function crearMiembro(tenantId: string, organoId: string, terceroId: string, rolCodigo: string): Promise<string> {
    const rolId = await idListaTipos('ROL_CONCEJO_COPROPIEDAD', rolCodigo)
    const { data, error } = await admin
      .from('gobierno_miembros')
      .insert({ tenant_id: tenantId, organo_id: organoId, tercero_id: terceroId, rol_id: rolId, desde: '2020-01-01' })
      .select('id').single<{ id: string }>()
    if (error) throw new Error(`fixture miembro ${rolCodigo}: ${error.message}`)
    return data.id
  }

  async function crearCoeficienteSet(tenantId: string, filas: { inmuebleId: string; valor: number }[]): Promise<void> {
    const sumaTotal = filas.reduce((acc, f) => acc + f.valor, 0)
    const { data: set, error: errSet } = await admin
      .from('coeficiente_sets')
      .insert({ tenant_id: tenantId, version: 1, vigente_desde: '2020-01-01', estado: 'borrador', suma_total: sumaTotal })
      .select('id').single<{ id: string }>()
    if (errSet) throw new Error(`fixture coeficiente_sets: ${errSet.message}`)
    const { error: errCoef } = await admin.from('coeficientes').insert(
      filas.map((f) => ({ tenant_id: tenantId, set_id: set.id, inmueble_id: f.inmuebleId, valor: f.valor })),
    )
    if (errCoef) throw new Error(`fixture coeficientes: ${errCoef.message}`)
    await admin.from('coeficiente_sets').update({ estado: 'vigente' }).eq('id', set.id)
  }

  async function crearReunion(tenantId: string, organoId: string, fechaHora: string): Promise<string> {
    const tipoId = await idListaTipos('TIPO_REUNION', 'asamblea_ordinaria')
    const { data, error } = await admin
      .from('gobierno_reuniones')
      .insert({
        tenant_id: tenantId, organo_id: organoId, tipo_id: tipoId, modalidad: 'presencial',
        convocatoria_regimen: 'primera', fecha_hora: fechaHora, lugar: 'Salón comunal',
      })
      .select('id').single<{ id: string }>()
    if (error) throw new Error(`fixture reunion: ${error.message}`)
    return data.id
  }

  async function crearConvocatoria(tenantId: string, reunionId: string): Promise<void> {
    const { error } = await admin.from('gobierno_convocatorias').insert({
      tenant_id: tenantId, reunion_id: reunionId, fecha_limite_respuesta: null,
      orden_del_dia_congelado: [{ orden: 1, titulo: 'Aprobar presupuesto' }],
    })
    if (error) throw new Error(`fixture convocatoria: ${error.message}`)
  }

  async function crearAgendaPunto(tenantId: string, reunionId: string, orden: number, titulo: string): Promise<void> {
    const { error } = await admin.from('gobierno_agenda_puntos').insert({ tenant_id: tenantId, reunion_id: reunionId, orden, titulo })
    if (error) throw new Error(`fixture agenda: ${error.message}`)
  }

  async function crearAsistencia(tenantId: string, reunionId: string, inmuebleId: string, asistenteRef: string): Promise<string> {
    const { data, error } = await admin
      .from('gobierno_asistencia')
      .insert({ tenant_id: tenantId, reunion_id: reunionId, inmueble_id: inmuebleId, asistente_ref: asistenteRef, calidad: 'propietario' })
      .select('id').single<{ id: string }>()
    if (error) throw new Error(`fixture asistencia: ${error.message}`)
    return data.id
  }

  async function instalar(cliente: Cliente, reunionId: string, presidenteMiembroId: string, secretarioMiembroId: string): Promise<void> {
    const { error } = await cliente
      .from('gobierno_reuniones')
      .update({ estado: 'instalada', presidente_miembro_id: presidenteMiembroId, secretario_miembro_id: secretarioMiembroId })
      .eq('id', reunionId)
    if (error) throw new Error(`fixture instalar: ${error.message}`)
  }

  async function cerrarReunion(cliente: Cliente, reunionId: string): Promise<void> {
    const { error } = await cliente.from('gobierno_reuniones').update({ estado: 'cerrada' }).eq('id', reunionId)
    if (error) throw new Error(`fixture cerrar reunion: ${error.message}`)
  }

  async function crearVotacionCerrada(
    tenantId: string, reunionId: string, asistenciaFavorId: string, asistenciaContraId: string,
  ): Promise<string> {
    const materiaId = await idMateria('ordinaria')
    const { data: votacion, error: errVot } = await admin
      .from('gobierno_votaciones')
      .insert({ tenant_id: tenantId, reunion_id: reunionId, materia_id: materiaId, pregunta: '¿Aprobar el presupuesto?' })
      .select('id').single<{ id: string }>()
    if (errVot) throw new Error(`fixture votacion: ${errVot.message}`)
    await admin.from('gobierno_votos').insert({ tenant_id: tenantId, votacion_id: votacion.id, asistencia_id: asistenciaFavorId, sentido: 'favor', coeficiente: 0 })
    await admin.from('gobierno_votos').insert({ tenant_id: tenantId, votacion_id: votacion.id, asistencia_id: asistenciaContraId, sentido: 'contra', coeficiente: 0 })
    await admin.from('gobierno_votaciones').update({ estado: 'cerrada' }).eq('id', votacion.id)
    return votacion.id
  }

  function generarActa(reunionId: string) {
    return admin.rpc('gobierno_generar_acta', { p_reunion_id: reunionId }).single<{ id: string }>()
  }

  function suscribirActa(actaId: string, presidenteMiembroId: string, secretarioMiembroId: string) {
    return admin.rpc('fn_gobierno_suscribir_acta', {
      p_acta_id: actaId, p_presidente_miembro_id: presidenteMiembroId, p_secretario_miembro_id: secretarioMiembroId,
    }).single<{ id: string; estado: string }>()
  }

  async function publicarActa(tenantId: string, actaId: string): Promise<void> {
    const { error } = await admin.from('gobierno_acta_entregas').insert({ tenant_id: tenantId, acta_id: actaId, tipo: 'entrega' })
    if (error) throw new Error(`fixture publicar acta: ${error.message}`)
  }

  /** Tenant con staff administrador (para instalar/cerrar reuniones y suscribir actas — acciones
   * que exigen el rol real vía auth.uid(), no service_role) + un actor externo YA vinculado
   * (propietario, inmueble propio, sin relación con el inmueble/tercero de la asistencia de
   * gobierno — el dominio es tenant-completo, no importa cuál sea). */
  async function prepararEscenario(etiqueta: string): Promise<{
    tenantId: string
    clienteStaff: Cliente
    clienteExterno: Cliente
    actorExternoVinculoId: string
    organoId: string
    presidenteMiembroId: string
    secretarioMiembroId: string
    inmuebleAsistenciaId: string
    terceroAsistenciaId: string
    inmuebleAsistenciaBId: string
    terceroAsistenciaBId: string
  }> {
    const staff = await crearUsuario(admin, `staff-${etiqueta}`)
    usuariosCreados.push(staff.id)
    const tenant = await crearTenant(admin, etiqueta, staff.id)
    tenantsCreados.push(tenant.id)
    await crearMembership(admin, tenant.id, staff.id, 'administrador')
    const clienteStaff = await clienteComo(env!, staff)

    const organoId = await crearOrgano(tenant.id)
    const pTercero = await crearTercero(tenant.id, `pres-${etiqueta}`)
    const sTercero = await crearTercero(tenant.id, `sec-${etiqueta}`)
    const presidenteMiembroId = await crearMiembro(tenant.id, organoId, pTercero, 'presidente')
    const secretarioMiembroId = await crearMiembro(tenant.id, organoId, sTercero, 'secretario')

    const inmuebleAsistenciaId = await crearInmueble(tenant.id, `EXT11-${etiqueta}-asisA-${RUN_ID}`)
    const terceroAsistenciaId = await crearTercero(tenant.id, `asisA-${etiqueta}`)
    const inmuebleAsistenciaBId = await crearInmueble(tenant.id, `EXT11-${etiqueta}-asisB-${RUN_ID}`)
    const terceroAsistenciaBId = await crearTercero(tenant.id, `asisB-${etiqueta}`)
    await crearCoeficienteSet(tenant.id, [
      { inmuebleId: inmuebleAsistenciaId, valor: 0.6 },
      { inmuebleId: inmuebleAsistenciaBId, valor: 0.4 },
    ])

    const inmuebleExternoId = await crearInmueble(tenant.id, `EXT11-${etiqueta}-ext-${RUN_ID}`)
    const terceroExternoId = await crearTercero(tenant.id, `ext-${etiqueta}`)
    const personaRolId = await crearPersonaRol(tenant.id, inmuebleExternoId, terceroExternoId)
    const email = `ext11-${RUN_ID}-${etiqueta}@example.test`
    const password = `Aa1${crypto.randomUUID()}`
    const { data: creado, error: errorCrear } = await admin.auth.admin.createUser({ email, password, email_confirm: true })
    if (errorCrear) throw errorCrear
    usuariosCreados.push(creado.user.id)
    const actorExternoVinculoId = await crearVinculoExterno(tenant.id, personaRolId, creado.user.id)
    const clienteExterno = await clienteComo(env!, { id: creado.user.id, email, password })

    return {
      tenantId: tenant.id, clienteStaff, clienteExterno, actorExternoVinculoId,
      organoId, presidenteMiembroId, secretarioMiembroId,
      inmuebleAsistenciaId, terceroAsistenciaId, inmuebleAsistenciaBId, terceroAsistenciaBId,
    }
  }

  it('1. listado: solo reuniones instalada/cerrada, nunca convocada', async () => {
    const e = await prepararEscenario('p1')
    const reunionConvocada = await crearReunion(e.tenantId, e.organoId, '2028-06-01T15:00:00Z')
    const reunionInstalada = await crearReunion(e.tenantId, e.organoId, '2028-06-02T15:00:00Z')
    await instalar(e.clienteStaff, reunionInstalada, e.presidenteMiembroId, e.secretarioMiembroId)

    const { data, error } = await invocarConError(
      e.clienteExterno.functions.invoke<RespuestaListado>('external-gobierno-listar', {
        body: { vinculo_id: e.actorExternoVinculoId, accion: 'reuniones' },
      }),
    )
    if (error) throw new Error(error.mensaje ?? 'fallo inesperado')
    const ids = data!.reuniones.map((r) => r.id)
    expect(ids).toContain(reunionInstalada)
    expect(ids).not.toContain(reunionConvocada)
    const fila = data!.reuniones.find((r) => r.id === reunionInstalada)!
    expect(fila.tipo_nombre).toBe('Asamblea Ordinaria')
    expect(fila.organo_nombre).toBe('Asamblea General')
  }, 30_000)

  it('2. detalle: trae convocatoria + agenda + resultado agregado de votación cerrada, nunca el voto individual', async () => {
    const e = await prepararEscenario('p2')
    const reunionId = await crearReunion(e.tenantId, e.organoId, '2028-06-03T15:00:00Z')
    await crearConvocatoria(e.tenantId, reunionId)
    await crearAgendaPunto(e.tenantId, reunionId, 1, 'Aprobar presupuesto')
    const asistA = await crearAsistencia(e.tenantId, reunionId, e.inmuebleAsistenciaId, e.terceroAsistenciaId)
    const asistB = await crearAsistencia(e.tenantId, reunionId, e.inmuebleAsistenciaBId, e.terceroAsistenciaBId)
    await instalar(e.clienteStaff, reunionId, e.presidenteMiembroId, e.secretarioMiembroId)
    await crearVotacionCerrada(e.tenantId, reunionId, asistA, asistB)
    await cerrarReunion(e.clienteStaff, reunionId)

    const { data, error } = await invocarConError(
      e.clienteExterno.functions.invoke<RespuestaDetalle>('external-gobierno-listar', {
        body: { vinculo_id: e.actorExternoVinculoId, accion: 'detalle', reunion_id: reunionId },
      }),
    )
    if (error) throw new Error(error.mensaje ?? 'fallo inesperado')
    expect(data!.reunion.estado).toBe('cerrada')
    expect(data!.convocatoria).not.toBeNull()
    expect(data!.agenda).toHaveLength(1)
    expect(data!.agenda[0]).toMatchObject({ orden: 1, titulo: 'Aprobar presupuesto', descripcion: null, requiere_decision: false })
    expect(typeof data!.agenda[0]!.id).toBe('string')
    expect(data!.votaciones).toHaveLength(1)
    const votacion = data!.votaciones[0]!
    expect(votacion.pregunta).toBe('¿Aprobar el presupuesto?')
    expect(votacion.resultado).not.toBeNull()
    expect(Object.keys(votacion).sort()).toEqual([
      'coeficiente_abstencion', 'coeficiente_contra', 'coeficiente_favor', 'coeficiente_representado',
      'coeficiente_total', 'id', 'materia_nombre', 'pregunta', 'resultado',
    ])
  }, 30_000)

  it('3. acta: solo aparece cuando el estado es publicada, nunca en suscrita', async () => {
    const e = await prepararEscenario('p3')
    const reunionId = await crearReunion(e.tenantId, e.organoId, '2028-06-04T15:00:00Z')
    await crearAgendaPunto(e.tenantId, reunionId, 1, 'Punto único')
    await crearAsistencia(e.tenantId, reunionId, e.inmuebleAsistenciaId, e.terceroAsistenciaId)
    await instalar(e.clienteStaff, reunionId, e.presidenteMiembroId, e.secretarioMiembroId)
    await cerrarReunion(e.clienteStaff, reunionId)
    const { data: acta } = await generarActa(reunionId)
    await suscribirActa(acta!.id, e.presidenteMiembroId, e.secretarioMiembroId)

    const { data: antesDePublicar, error: e1 } = await invocarConError(
      e.clienteExterno.functions.invoke<RespuestaDetalle>('external-gobierno-listar', {
        body: { vinculo_id: e.actorExternoVinculoId, accion: 'detalle', reunion_id: reunionId },
      }),
    )
    if (e1) throw new Error(e1.mensaje ?? 'fallo inesperado')
    expect(antesDePublicar!.acta).toBeNull() // suscrita, todavía no publicada

    await publicarActa(e.tenantId, acta!.id)
    const { data: despuesDePublicar, error: e2 } = await invocarConError(
      e.clienteExterno.functions.invoke<RespuestaDetalle>('external-gobierno-listar', {
        body: { vinculo_id: e.actorExternoVinculoId, accion: 'detalle', reunion_id: reunionId },
      }),
    )
    if (e2) throw new Error(e2.mensaje ?? 'fallo inesperado')
    expect(despuesDePublicar!.acta).not.toBeNull()
    expect(despuesDePublicar!.acta!.id).toBe(acta!.id)
  }, 30_000)

  it('4. aislamiento entre tenants: un vínculo de otro tenant no ve ni lista ni el detalle de esta reunión', async () => {
    const a = await prepararEscenario('p4a')
    const b = await prepararEscenario('p4b')
    const reunionA = await crearReunion(a.tenantId, a.organoId, '2028-06-05T15:00:00Z')
    await instalar(a.clienteStaff, reunionA, a.presidenteMiembroId, a.secretarioMiembroId)

    const { data: listaB, error: eLista } = await invocarConError(
      b.clienteExterno.functions.invoke<RespuestaListado>('external-gobierno-listar', {
        body: { vinculo_id: b.actorExternoVinculoId, accion: 'reuniones' },
      }),
    )
    if (eLista) throw new Error(eLista.mensaje ?? 'fallo inesperado')
    expect(listaB!.reuniones.map((r) => r.id)).not.toContain(reunionA)

    const { data: detalleB, error: eDetalle } = await invocarConError(
      b.clienteExterno.functions.invoke<RespuestaDetalle>('external-gobierno-listar', {
        body: { vinculo_id: b.actorExternoVinculoId, accion: 'detalle', reunion_id: reunionA },
      }),
    )
    expect(detalleB).toBeNull()
    expect(eDetalle!.status).toBe(404)
    expect(eDetalle!.codigo).toBe('GOBIERNO_REUNION_NO_PERTENECE')
  }, 30_000)

  it('5. un vínculo que no existe o no es del que llama → 403 VINCULO_NO_PERTENECE', async () => {
    const a = await prepararEscenario('p5a')
    const b = await prepararEscenario('p5b')

    const { data, error } = await invocarConError(
      a.clienteExterno.functions.invoke<RespuestaListado>('external-gobierno-listar', {
        body: { vinculo_id: b.actorExternoVinculoId, accion: 'reuniones' },
      }),
    )
    expect(data).toBeNull()
    expect(error!.status).toBe(403)
    expect(error!.codigo).toBe('VINCULO_NO_PERTENECE')
  }, 30_000)

  it('6. rate limit: bloquea después de 60 intentos en una hora', async () => {
    const e = await prepararEscenario('p6rl')
    for (let i = 0; i < 60; i += 1) {
      const { error } = await invocarConError(
        e.clienteExterno.functions.invoke<RespuestaListado>('external-gobierno-listar', {
          body: { vinculo_id: e.actorExternoVinculoId, accion: 'reuniones' },
        }),
      )
      expect(error?.codigo).not.toBe('RATE_LIMITED')
    }
    const { data, error } = await invocarConError(
      e.clienteExterno.functions.invoke<RespuestaListado>('external-gobierno-listar', {
        body: { vinculo_id: e.actorExternoVinculoId, accion: 'reuniones' },
      }),
    )
    expect(data).toBeNull()
    expect(error!.status).toBe(429)
    expect(error!.codigo).toBe('RATE_LIMITED')
  }, 90_000)
})
