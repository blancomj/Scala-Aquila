/**
 * cartera-panel-acciones (Edge Function, HTTP real) — CAR F9 (parte 5),
 * §23.5: 8 conteos de colas de trabajo. Decisión de alcance del usuario
 * (2026-08-17): el panel devuelve solo conteos, no las filas de detalle
 * de cada cola — el frontend consulta las tablas directamente para eso.
 *
 * Cada cola lleva al menos una fila que SÍ cuenta y una que NO (control
 * negativo: estado equivocado, fecha fuera de ventana, o caso/certificación
 * terminal/reciente) para ejercitar el filtro real, no solo "hay datos".
 *
 * certificaciones_deuda/casos_juridicos exigen un cliente autenticado con
 * rol administrador real (rechazan auth.uid() null explícitamente — mismo
 * hallazgo que F9 parte 4); el resto de fixtures usa el cliente admin
 * directo (sin guard que lo bloquee para INSERT).
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
  console.warn('SALTADO tests/tenancy/cartera-panel-acciones: faltan variables de Supabase en .env')
}

interface RespuestaPanel {
  accionesPendientesAprobacion: number
  accionesProgramadasHoy: number
  accionesFallidas: number
  llamadasPendientes: number
  promesasVencenHoy: number
  cuotasAcuerdoVencenSemana: number
  casosJuridicosSinActuacion30d: number
  certificacionesPorVencer: number
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

async function crearInmueble(admin: Cliente, tenantId: string, tipoId: number, codigo: string): Promise<string> {
  const { data, error } = await admin
    .from('inmuebles')
    .insert({ tenant_id: tenantId, codigo, tipo_id: tipoId })
    .select('id')
    .single<{ id: string }>()
  if (error) throw new Error(`fixture inmueble ${codigo}: ${error.message}`)
  return data.id
}

async function crearPoliticaFinancieraVigente(admin: Cliente, tenantId: string): Promise<string> {
  const { data, error } = await admin
    .from('politicas_financieras')
    .insert({
      tenant_id: tenantId,
      version: 1,
      estado: 'vigente',
      vigente_desde: '2026-01-01',
      redondeo_modo: 'half_up',
      redondeo_escala: 0,
      residual_metodo: 'mayor_resto',
      coeficientes_suma_esperada: 1,
      policy_hash: `test-fixture-panel-financiera-${tenantId}`,
    })
    .select('id')
    .single<{ id: string }>()
  if (error) throw new Error(`fixture politica_financiera: ${error.message}`)
  return data.id
}

d('cartera-panel-acciones (Edge Function, CAR §23.5)', () => {
  const admin = clienteAdmin(env!)
  let agente: UsuarioPrueba
  let administrador: UsuarioPrueba
  let tenant: TenantPrueba
  let clienteAgent: Cliente
  let clienteAdministrador: Cliente

  const FECHA_REF = '2026-04-01'

  afterAll(async () => {
    await eliminarTenant(admin, tenant.id)
    await eliminarUsuario(admin, agente.id)
    await eliminarUsuario(admin, administrador.id)
  })

  it('setup', async () => {
    agente = await crearUsuario(admin, 'cpa-agent')
    administrador = await crearUsuario(admin, 'cpa-admin')
    tenant = await crearTenant(admin, 'cpa', agente.id)
    await crearMembership(admin, tenant.id, agente.id, 'agent')
    await crearMembership(admin, tenant.id, administrador.id, 'administrador')
    clienteAgent = await clienteComo(env!, agente)
    clienteAdministrador = await clienteComo(env!, administrador)

    const tipoId = await listaTipoId(admin, 'TIPO_INMUEBLE', 'apartamento')
    const inmuebleAccionesId = await crearInmueble(admin, tenant.id, tipoId, `CPA-ACC-${String(Date.now())}`)

    // Política de clasificación (FK obligatoria de acciones_cobranza; clasificacion_codigo es texto libre, sin FK a tramos).
    const { data: politica, error: errPolitica } = await admin
      .from('politicas_clasificacion_cartera')
      .insert({
        tenant_id: tenant.id,
        version: 1,
        estado: 'vigente',
        nombre: 'Política panel v1',
        policy_hash: `test-fixture-panel-clasificacion-${tenant.id}`,
      })
      .select('id')
      .single<{ id: string }>()
    if (errPolitica) throw new Error(`fixture politica_clasificacion: ${errPolitica.message}`)

    const tipoIdentCedula = await listaTipoId(admin, 'TIPO_IDENTIFICACION', 'cedula')
    const estadoActivo = await listaTipoId(admin, 'ESTADO_TERCERO', 'activo')
    const { data: tercero, error: errTercero } = await admin
      .from('terceros')
      .insert({
        tenant_id: tenant.id,
        tipo_identificacion_id: tipoIdentCedula,
        numero_documento: `CPA-TER-${String(Date.now())}`,
        tipo_persona: 'natural',
        primer_nombre: 'Luis',
        primer_apellido: 'Ramírez',
        estado_id: estadoActivo,
      })
      .select('id')
      .single<{ id: string }>()
    if (errTercero) throw new Error(`fixture tercero: ${errTercero.message}`)

    const politicaId = politica.id
    const terceroId = tercero.id

    function payloadAccion(
      overrides: Partial<{
        tipo_accion: 'llamada' | 'sms' | 'email'
        fecha_programada: string
        estado: 'programada' | 'pendiente_aprobacion'
      }> = {},
    ) {
      return {
        tenant_id: tenant.id,
        inmueble_id: inmuebleAccionesId,
        tipo_accion: 'llamada' as const,
        canal: 'telefono' as const,
        fecha_programada: FECHA_REF,
        clasificacion_codigo: 'MORA_INICIAL',
        politica_clasificacion_id: politicaId,
        politica_version: 1,
        dias_mora_al_momento: 30,
        deuda_total_al_momento: 100_000,
        alcance: 'inmueble' as const,
        destinatario_tercero_id: terceroId,
        destinatario_rol_codigo: 'copropietario',
        creada_por: 'manual' as const,
        estado: 'programada' as const,
        ...overrides,
      }
    }

    // #1 Acciones pendientes de aprobación: 1 acción nacida directamente en pendiente_aprobacion.
    const { error: errA } = await admin.from('acciones_cobranza').insert(payloadAccion({ estado: 'pendiente_aprobacion' }))
    if (errA) throw new Error(`fixture accion A (pendiente_aprobacion): ${errA.message}`)

    // #2 Acciones programadas para hoy + #4 llamadas pendientes (cuenta en ambas: llamada + programada).
    const { error: errB } = await admin.from('acciones_cobranza').insert(payloadAccion({ fecha_programada: FECHA_REF }))
    if (errB) throw new Error(`fixture accion B (programada hoy): ${errB.message}`)

    // Control negativo de #2: programada, pero NO hoy.
    const { error: errC } = await admin
      .from('acciones_cobranza')
      .insert(payloadAccion({ tipo_accion: 'email', fecha_programada: '2026-04-15' }))
    if (errC) throw new Error(`fixture accion C (programada, otra fecha): ${errC.message}`)

    // #3 Acciones fallidas: programada→ejecutando→fallida (tipo_accion distinto de 'llamada', no debe contar en #4).
    const { data: accionD, error: errD1 } = await admin
      .from('acciones_cobranza')
      .insert(payloadAccion({ tipo_accion: 'sms' }))
      .select('id')
      .single<{ id: string }>()
    if (errD1) throw new Error(`fixture accion D (insert): ${errD1.message}`)
    const { error: errD2 } = await clienteAgent.from('acciones_cobranza').update({ estado: 'ejecutando' }).eq('id', accionD.id)
    if (errD2) throw new Error(`fixture accion D→ejecutando: ${errD2.message}`)
    const { error: errD3 } = await clienteAgent
      .from('acciones_cobranza')
      .update({ estado: 'fallida', resultado: 'datos_incorrectos', fecha_ejecucion: `${FECHA_REF}T12:00:00Z` })
      .eq('id', accionD.id)
    if (errD3) throw new Error(`fixture accion D→fallida: ${errD3.message}`)

    // #4 Llamadas pendientes (segunda fila): llamada en ejecutando.
    const { data: accionE, error: errE1 } = await admin
      .from('acciones_cobranza')
      .insert(payloadAccion({}))
      .select('id')
      .single<{ id: string }>()
    if (errE1) throw new Error(`fixture accion E (insert): ${errE1.message}`)
    const { error: errE2 } = await clienteAgent.from('acciones_cobranza').update({ estado: 'ejecutando' }).eq('id', accionE.id)
    if (errE2) throw new Error(`fixture accion E→ejecutando: ${errE2.message}`)

    // #5 Promesas que vencen hoy.
    const { error: errF } = await admin.from('promesas_pago').insert({
      tenant_id: tenant.id,
      inmueble_id: inmuebleAccionesId,
      fecha_promesa: '2026-03-25',
      monto_prometido: 50_000,
      fecha_pago_prometida: FECHA_REF,
    })
    if (errF) throw new Error(`fixture promesa F (vence hoy): ${errF.message}`)

    // Control negativo de #5: pendiente, pero vence en otra fecha.
    const { error: errG } = await admin.from('promesas_pago').insert({
      tenant_id: tenant.id,
      inmueble_id: inmuebleAccionesId,
      fecha_promesa: '2026-03-25',
      monto_prometido: 50_000,
      fecha_pago_prometida: '2026-04-20',
    })
    if (errG) throw new Error(`fixture promesa G (vence otra fecha): ${errG.message}`)

    // #6 Cuotas de acuerdo que vencen esta semana.
    const { data: acuerdo, error: errAcuerdo } = await admin
      .from('acuerdos_pago')
      .insert({
        tenant_id: tenant.id,
        inmueble_id: inmuebleAccionesId,
        consecutivo: `CPA-ACU-${String(Date.now())}`,
        fecha_acuerdo: '2026-03-20',
        fecha_inicio: '2026-03-20',
        fecha_fin: '2026-07-20',
        monto_total: 200_000,
        monto_capital: 200_000,
        monto_interes: 0,
        monto_otros: 0,
        numero_cuotas: 4,
        cuota_inicial: 0,
        condona_interes: false,
        interes_durante_acuerdo: false,
      })
      .select('id')
      .single<{ id: string }>()
    if (errAcuerdo) throw new Error(`fixture acuerdo (para cuotas): ${errAcuerdo.message}`)

    // Cuota I: pendiente, vence dentro de los próximos 6 días → cuenta.
    const { error: errCuotaI } = await admin.from('acuerdo_pago_cuotas').insert({
      tenant_id: tenant.id,
      acuerdo_id: acuerdo.id,
      numero_cuota: 1,
      fecha_vencimiento: '2026-04-04',
      monto: 50_000,
      estado: 'pendiente',
    })
    if (errCuotaI) throw new Error(`fixture cuota I (vence esta semana): ${errCuotaI.message}`)

    // Control negativo de #6: pendiente, pero fuera de la ventana de 7 días.
    const { error: errCuotaJ } = await admin.from('acuerdo_pago_cuotas').insert({
      tenant_id: tenant.id,
      acuerdo_id: acuerdo.id,
      numero_cuota: 2,
      fecha_vencimiento: '2026-04-20',
      monto: 50_000,
      estado: 'pendiente',
    })
    if (errCuotaJ) throw new Error(`fixture cuota J (fuera de ventana): ${errCuotaJ.message}`)

    // Control negativo de #6: dentro de la ventana, pero ya pagada.
    const { data: cuotaK, error: errCuotaK1 } = await admin
      .from('acuerdo_pago_cuotas')
      .insert({
        tenant_id: tenant.id,
        acuerdo_id: acuerdo.id,
        numero_cuota: 3,
        fecha_vencimiento: '2026-04-05',
        monto: 50_000,
        estado: 'pendiente',
      })
      .select('id')
      .single<{ id: string }>()
    if (errCuotaK1) throw new Error(`fixture cuota K (insert): ${errCuotaK1.message}`)
    const { error: errCuotaK2 } = await clienteAgent
      .from('acuerdo_pago_cuotas')
      .update({ estado: 'pagada', monto_pagado: 50_000, fecha_pago: FECHA_REF })
      .eq('id', cuotaK.id)
    if (errCuotaK2) throw new Error(`fixture cuota K→pagada: ${errCuotaK2.message}`)

    // #7/#8: certificaciones + casos jurídicos — exigen administrador autenticado (auth.uid() no puede ser null).
    const politicaFinancieraId = await crearPoliticaFinancieraVigente(admin, tenant.id)
    const inmuebleJuridicoId = await crearInmueble(admin, tenant.id, tipoId, `CPA-JUR-${String(Date.now())}`)
    const inmuebleJuridico2Id = await crearInmueble(admin, tenant.id, tipoId, `CPA-JUR2-${String(Date.now())}`)
    const inmuebleJuridico3Id = await crearInmueble(admin, tenant.id, tipoId, `CPA-JUR3-${String(Date.now())}`)

    async function crearCertificacion(inmuebleId: string, fechaCorte: string): Promise<string> {
      const { data, error } = await clienteAdministrador
        .from('certificaciones_deuda')
        .insert({
          tenant_id: tenant.id,
          inmueble_id: inmuebleId,
          consecutivo: `CPA-CERT-${inmuebleId}-${String(Date.now())}`,
          fecha_expedicion: fechaCorte,
          fecha_corte: fechaCorte,
          monto_expensas_ordinarias: 300_000,
          monto_expensas_extraordinarias: 0,
          monto_intereses_mora: 0,
          monto_sanciones: 0,
          monto_otros: 0,
          monto_total: 300_000,
          detalle_cargos: [{ cargoId: 'fixture', categoria: 'capital', saldoPendiente: '300000' }],
          politica_financiera_id: politicaFinancieraId,
          politica_version: 1,
          cargo_firmante: 'Administrador de prueba',
          certificacion_hash: `test-fixture-panel-cert-${inmuebleId}-${String(Date.now())}`,
        })
        .select('id')
        .single<{ id: string }>()
      if (error) throw new Error(`fixture certificacion (${inmuebleId}): ${error.message}`)
      return data.id
    }

    // Certificación P: fecha_corte hace 40 días → #8 cuenta (por vencer). También financia el caso L.
    const certificacionPId = await crearCertificacion(inmuebleJuridicoId, '2026-02-20')

    // Control negativo de #8: certificación reciente (5 días de antigüedad).
    await crearCertificacion(inmuebleJuridico2Id, '2026-03-27')

    // #7 Caso L: activo, sin actuación registrada, remitido hace 40 días → cuenta.
    const { error: errCasoL } = await clienteAdministrador.from('casos_juridicos').insert({
      tenant_id: tenant.id,
      inmueble_id: inmuebleJuridicoId,
      consecutivo: `CPA-CASO-L-${String(Date.now())}`,
      certificacion_id: certificacionPId,
      fecha_remision: '2026-02-20',
      monto_pretension: 300_000,
      fecha_pretension: '2026-02-20',
    })
    if (errCasoL) throw new Error(`fixture caso L (sin actuación 40d): ${errCasoL.message}`)

    // Control negativo de #7: remitido hace 40 días, pero con actuación reciente (5 días).
    // fecha_corte de esta certificación es reciente a propósito — no debe sumar a #8
    // (independiente de fecha_remision del caso, que sí es antigua).
    const certificacionM = await crearCertificacion(inmuebleJuridico3Id, '2026-03-27')
    const { data: casoM, error: errCasoM } = await clienteAdministrador
      .from('casos_juridicos')
      .insert({
        tenant_id: tenant.id,
        inmueble_id: inmuebleJuridico3Id,
        consecutivo: `CPA-CASO-M-${String(Date.now())}`,
        certificacion_id: certificacionM,
        fecha_remision: '2026-02-20',
        monto_pretension: 300_000,
        fecha_pretension: '2026-02-20',
      })
      .select('id')
      .single<{ id: string }>()
    if (errCasoM) throw new Error(`fixture caso M (insert): ${errCasoM.message}`)
    const { error: errCasoMActuacion } = await clienteAgent
      .from('casos_juridicos')
      .update({ fecha_ultima_actuacion: '2026-03-27' })
      .eq('id', casoM.id)
    if (errCasoMActuacion) throw new Error(`fixture caso M (actuación reciente): ${errCasoMActuacion.message}`)
  }, 30_000)

  it('los 8 conteos del panel se calculan correctamente contra la BD real', async () => {
    const { data, response } = await clienteAgent.functions.invoke<RespuestaPanel>('cartera-panel-acciones', {
      body: { tenant_id: tenant.id, fecha_referencia: FECHA_REF },
    })
    expect(response?.status).toBe(200)

    expect(data?.accionesPendientesAprobacion).toBe(1) // A
    expect(data?.accionesProgramadasHoy).toBe(1) // B (C es otra fecha)
    expect(data?.accionesFallidas).toBe(1) // D
    expect(data?.llamadasPendientes).toBe(2) // B (programada) + E (ejecutando) — A y D no son 'llamada' o no están en ese estado
    expect(data?.promesasVencenHoy).toBe(1) // F (G vence otro día)
    expect(data?.cuotasAcuerdoVencenSemana).toBe(1) // I (J fuera de ventana, K ya pagada)
    expect(data?.casosJuridicosSinActuacion30d).toBe(1) // L (M tiene actuación reciente)
    expect(data?.certificacionesPorVencer).toBe(1) // certificación de L (la de M es reciente)
  }, 30_000)
})
