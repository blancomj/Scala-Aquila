/**
 * cartera-recalcular — creación real de acciones_cobranza con destinatario
 * resuelto (CAR §18.2 pasos 14-16, §34 R1-R4). Es la pieza que faltaba
 * para que el job dejara de calcular sin crear nada.
 *
 * Prueba la composición HTTP + persistencia contra la base real: que se
 * cree UNA acción por destinatario, que las hermanas queden unidas por
 * grupo_envio_id conservando evidencia separada (R2), que el maker-checker
 * haga nacer en 'pendiente_aprobacion' lo de alto impacto, y que una
 * segunda corrida no duplique (§10.4 / IDEM-02).
 *
 * La lógica de a-quién-se-le-cobra ya tiene cobertura pura en
 * cartera-destinatarios.test.ts (REC-CAR-004): aquí no se vuelve a probar
 * el motor, se prueba que lo que decide llega a la tabla.
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
  console.warn('SALTADO tests/tenancy/cartera-acciones-destinatarios: faltan variables de Supabase en .env')
}

interface RespuestaEjecucion {
  modo: 'ejecucion'
  accionesCreadas: number
  accionesOmitidas: number
  accionesBloqueadas: number
  errores?: string[]
}

interface FilaAccion {
  tipo_accion: string
  estado: string
  grupo_envio_id: string | null
  destinatario_tercero_id: string
  destinatario_rol_codigo: string
  destinatario_contacto: string
  dias_mora_al_momento: number
}

async function listaTipoId(admin: Cliente, tipo: string, codigo: string): Promise<number> {
  const { data, error } = await admin
    .from('lista_tipos')
    .select('id')
    .eq('tipo', tipo)
    .eq('codigo', codigo)
    .is('tenant_id', null)
    .single<{ id: number }>()
  if (error) throw new Error(`fixture ${tipo}.${codigo}: ${error.message}`)
  return data.id
}

d('cartera-recalcular: acciones con destinatario resuelto (CAR §18.2, §34)', () => {
  const admin = clienteAdmin(env!)
  let administrador: UsuarioPrueba
  let tenant: TenantPrueba
  let cliente: Cliente
  let inmuebleId: string
  let terceroA: string
  let terceroB: string

  const FECHA_CORTE = '2026-02-15'

  afterAll(async () => {
    await eliminarTenant(admin, tenant.id)
    await eliminarUsuario(admin, administrador.id)
  })

  it('setup: inmueble en mora con dos copropietarios y dos estrategias', async () => {
    administrador = await crearUsuario(admin, 'cad-admin')
    tenant = await crearTenant(admin, 'cad', administrador.id)
    await crearMembership(admin, tenant.id, administrador.id, 'administrador')
    cliente = await clienteComo(env!, administrador)

    // ── política con un tramo que cubre toda la mora ──────────────────
    const { data: politica, error: errPol } = await admin
      .from('politicas_clasificacion_cartera')
      .insert({
        tenant_id: tenant.id,
        version: 1,
        estado: 'borrador',
        nombre: 'Política destinatarios v1',
        policy_hash: `test-fixture-destinatarios-${tenant.id}`,
      })
      .select('id')
      .single<{ id: string }>()
    if (errPol) throw new Error(`fixture politica: ${errPol.message}`)

    const { data: tramos, error: errTramos } = await admin
      .from('politica_clasificacion_tramos')
      .insert([
        {
          tenant_id: tenant.id,
          politica_id: politica.id,
          codigo: 'AL_DIA',
          nombre: 'Al día',
          dias_min: 0,
          dias_max: 0,
          nivel_riesgo: 'ninguno',
          etapa_cobranza: 'preventiva',
          prioridad: 0,
          orden: 0,
        },
        {
          tenant_id: tenant.id,
          politica_id: politica.id,
          codigo: 'MORA',
          nombre: 'En mora',
          dias_min: 1,
          dias_max: null,
          nivel_riesgo: 'alto',
          etapa_cobranza: 'administrativa',
          prioridad: 1,
          orden: 1,
        },
      ])
      .select('id, codigo')
    if (errTramos) throw new Error(`fixture tramos: ${errTramos.message}`)
    const tramoMora = tramos.find((t) => t.codigo === 'MORA')!

    const { error: errActivar } = await admin
      .from('politicas_clasificacion_cartera')
      .update({ estado: 'vigente' })
      .eq('id', politica.id)
    if (errActivar) throw new Error(`activar politica: ${errActivar.message}`)

    // ── dos estrategias sobre el mismo tramo ──────────────────────────
    // Una de gestión (nace lista) y una de alto impacto (nace esperando
    // aprobación) — así una sola corrida prueba las dos ramas.
    const { error: errEstrategias } = await admin.from('estrategias_cobranza').insert([
      {
        tenant_id: tenant.id,
        politica_id: politica.id,
        tramo_id: tramoMora.id,
        codigo: 'EST-EMAIL',
        nombre: 'Recordatorio por correo',
        tipo_accion: 'email',
        canal: 'email',
        dias_desde_clasificacion: 0,
        frecuencia_dias: null,
        max_intentos: 3,
        rol_minimo: 'auxiliar',
        requiere_aprobacion: false,
        activa: true,
        orden: 1,
      },
      {
        tenant_id: tenant.id,
        politica_id: politica.id,
        tramo_id: tramoMora.id,
        codigo: 'EST-REQ',
        nombre: 'Requerimiento formal',
        tipo_accion: 'requerimiento_formal',
        canal: 'email',
        dias_desde_clasificacion: 0,
        frecuencia_dias: null,
        max_intentos: 1,
        rol_minimo: 'administrador',
        requiere_aprobacion: true,
        activa: true,
        orden: 2,
      },
    ])
    if (errEstrategias) throw new Error(`fixture estrategias: ${errEstrategias.message}`)

    // ── inmueble + cargo vencido ──────────────────────────────────────
    const tipoInmueble = await listaTipoId(admin, 'TIPO_INMUEBLE', 'apartamento')
    const { data: inmueble, error: errInm } = await admin
      .from('inmuebles')
      .insert({ tenant_id: tenant.id, codigo: `CAD-${String(Date.now())}`, tipo_id: tipoInmueble })
      .select('id')
      .single<{ id: string }>()
    if (errInm) throw new Error(`fixture inmueble: ${errInm.message}`)
    inmuebleId = inmueble.id

    const { data: periodo, error: errPer } = await admin
      .from('periodos')
      .insert({
        tenant_id: tenant.id,
        anio: 2026,
        mes: 1,
        estado: 'abierto',
        fecha_vencimiento: '2026-01-01',
      })
      .select('id')
      .single<{ id: string }>()
    if (errPer) throw new Error(`fixture periodo: ${errPer.message}`)

    const { data: concepto, error: errCon } = await admin
      .from('conceptos')
      .insert({
        tenant_id: tenant.id,
        codigo: `CAD-${String(Date.now())}`,
        nombre: 'Cuota',
        modo_calculo: 'distribucion',
        modo_valor: 'formulado',
        tipo_recurrencia: 'recurrente',
        periodicidad: 'mensual',
        alcance: 'todos',
        fecha_inicio_anio: 2000,
        fecha_inicio_mes: 1,
        prioridad: 100,
        estado: 'activo',
      })
      .select('id')
      .single<{ id: string }>()
    if (errCon) throw new Error(`fixture concepto: ${errCon.message}`)

    const { data: liq, error: errLiq } = await admin
      .from('liquidaciones')
      .insert({
        tenant_id: tenant.id,
        periodo_id: periodo.id,
        result_hash: `test-fixture-cad-${String(Date.now())}`,
        tenant_total: 500_000,
      })
      .select('id')
      .single<{ id: string }>()
    if (errLiq) throw new Error(`fixture liquidacion: ${errLiq.message}`)

    const { data: linea, error: errLin } = await admin
      .from('liquidacion_lineas')
      .insert({
        tenant_id: tenant.id,
        liquidacion_id: liq.id,
        inmueble_id: inmuebleId,
        concepto_id: concepto.id,
        monto: 500_000,
      })
      .select('id')
      .single<{ id: string }>()
    if (errLin) throw new Error(`fixture linea: ${errLin.message}`)

    const { error: errCargo } = await admin.from('cargos').insert({
      tenant_id: tenant.id,
      inmueble_id: inmuebleId,
      periodo_id: periodo.id,
      categoria: 'capital',
      origen_tipo: 'liquidacion_linea',
      liquidacion_linea_id: linea.id,
      concepto_id: concepto.id,
      monto_original: 500_000,
    })
    if (errCargo) throw new Error(`fixture cargo: ${errCargo.message}`)

    // ── dos copropietarios, 60/40, ambos con correo ───────────────────
    const tipoIdent = await listaTipoId(admin, 'TIPO_IDENTIFICACION', 'cedula')
    const estadoActivo = await listaTipoId(admin, 'ESTADO_TERCERO', 'activo')
    const rolCopropietario = await listaTipoId(admin, 'PERSONA_PREDIO', 'copropietario')
    const sello = String(Date.now())

    const { data: terceros, error: errTer } = await admin
      .from('terceros')
      .insert([
        {
          tenant_id: tenant.id,
          tipo_identificacion_id: tipoIdent,
          numero_documento: `CAD-A-${sello}`,
          tipo_persona: 'natural',
          primer_nombre: 'Andrés',
          primer_apellido: 'Ruiz',
          email: `cad-a-${sello}@example.test`,
          estado_id: estadoActivo,
        },
        {
          tenant_id: tenant.id,
          tipo_identificacion_id: tipoIdent,
          numero_documento: `CAD-B-${sello}`,
          tipo_persona: 'natural',
          primer_nombre: 'María',
          primer_apellido: 'Ruiz',
          email: `cad-b-${sello}@example.test`,
          estado_id: estadoActivo,
        },
      ])
      .select('id')
    if (errTer) throw new Error(`fixture terceros: ${errTer.message}`)
    if (terceros.length !== 2) throw new Error('fixture terceros: se esperaban 2 filas')
    terceroA = terceros[0]!.id
    terceroB = terceros[1]!.id

    const { error: errRel } = await admin.from('inmueble_persona_rol').insert([
      {
        tenant_id: tenant.id,
        inmueble_id: inmuebleId,
        tercero_id: terceroA,
        rol_id: rolCopropietario,
        porcentaje: 60,
        vigente_desde: '2020-01-01',
        es_pagador: false,
        recibe_notificaciones: true,
      },
      {
        tenant_id: tenant.id,
        inmueble_id: inmuebleId,
        tercero_id: terceroB,
        rol_id: rolCopropietario,
        porcentaje: 40,
        vigente_desde: '2020-01-01',
        es_pagador: false,
        recibe_notificaciones: true,
      },
    ])
    if (errRel) throw new Error(`fixture inmueble_persona_rol: ${errRel.message}`)
  }, 60_000)

  it('crea una acción por destinatario, agrupadas por grupo_envio_id (R2)', async () => {
    const { data, response } = await cliente.functions.invoke<RespuestaEjecucion>('cartera-recalcular', {
      body: {
        tenant_id: tenant.id,
        fecha_corte: FECHA_CORTE,
        modo: 'ejecucion',
        alcance_inmuebles: [inmuebleId],
      },
    })
    expect(response?.status).toBe(200)
    expect(data?.errores ?? []).toEqual([])
    // 2 estrategias × 2 copropietarios.
    expect(data?.accionesCreadas).toBe(4)

    const { data: acciones, error: errAcc } = await admin
      .from('acciones_cobranza')
      .select('*')
      .eq('tenant_id', tenant.id)
      .eq('inmueble_id', inmuebleId)
    expect(errAcc).toBeNull()
    expect(acciones).toHaveLength(4)

    const filas = (acciones ?? []) as unknown as FilaAccion[]
    const emails = filas.filter((a) => a.tipo_accion === 'email')
    const requerimientos = filas.filter((a) => a.tipo_accion === 'requerimiento_formal')
    expect(emails).toHaveLength(2)
    expect(requerimientos).toHaveLength(2)

    // Las hermanas comparten grupo, pero son filas distintas: una evidencia
    // por persona, no una compartida.
    const gruposEmail = new Set(emails.map((a) => a.grupo_envio_id))
    expect(gruposEmail.size).toBe(1)
    expect([...gruposEmail][0]).not.toBeNull()
    expect(new Set(emails.map((a) => a.destinatario_tercero_id))).toEqual(
      new Set([terceroA, terceroB]),
    )
    // Cada estrategia produce su propio grupo.
    expect([...gruposEmail][0]).not.toBe(requerimientos[0]?.grupo_envio_id)

    // Cada acción congela el contacto usado y el contexto (REC-CAR-012).
    for (const a of filas) {
      expect(a.destinatario_rol_codigo).toBe('copropietario')
      expect(a.destinatario_contacto).toContain('@')
      expect(a.dias_mora_al_momento).toBe(45) // 2026-01-01 → 2026-02-15
    }
  }, 60_000)

  it('el maker-checker hace nacer el alto impacto en pendiente_aprobacion', async () => {
    const { data: acciones, error } = await admin
      .from('acciones_cobranza')
      .select('*')
      .eq('tenant_id', tenant.id)
      .eq('inmueble_id', inmuebleId)
    expect(error).toBeNull()

    const filas = (acciones ?? []) as unknown as FilaAccion[]
    const estadoDe = (t: string) =>
      new Set(filas.filter((a) => a.tipo_accion === t).map((a) => a.estado))
    expect(estadoDe('email')).toEqual(new Set(['programada']))
    expect(estadoDe('requerimiento_formal')).toEqual(new Set(['pendiente_aprobacion']))
  }, 30_000)

  it('una segunda corrida no vuelve a crear lo mismo (§10.4, IDEM-02)', async () => {
    const { data, response } = await cliente.functions.invoke<RespuestaEjecucion>('cartera-recalcular', {
      body: {
        tenant_id: tenant.id,
        fecha_corte: FECHA_CORTE,
        modo: 'ejecucion',
        alcance_inmuebles: [inmuebleId],
      },
    })
    expect(response?.status).toBe(200)
    expect(data?.accionesCreadas).toBe(0)

    const { count, error: errCount } = await admin
      .from('acciones_cobranza')
      .select('id', { count: 'exact', head: true })
      .eq('tenant_id', tenant.id)
      .eq('inmueble_id', inmuebleId)
    expect(errCount).toBeNull()
    expect(count).toBe(4)
  }, 60_000)
})
