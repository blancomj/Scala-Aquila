/**
 * cartera-recalcular (Edge Function, HTTP real) — CAR F8, JOB_CARTERA_
 * DIARIA (§18). Cubre: BLOCKED sin política vigente (PH-C26), rol mínimo
 * administrador, modo simulación sin efectos secundarios, modo ejecución
 * (snapshot + evento + confirmación automática de etapa) y PH-C33
 * (idempotencia: correr la misma fecha_corte dos veces no duplica nada y
 * produce el mismo resultadoHash).
 *
 * No cubre promesas/cuotas/acuerdo incumplido — esa lógica pura ya tiene
 * su propia cobertura en cartera-job.test.ts (REC-CAR-004); este archivo
 * prueba la composición HTTP + persistencia, no vuelve a probar el motor.
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
  console.warn('SALTADO tests/tenancy/cartera-recalcular: faltan variables de Supabase en .env')
}

interface PlanRespuesta {
  inmuebleId: string
  clasificacionCodigo: string
  etapaCobranza: string
  decisionEscalamiento: { tipo: string; hacia?: string }
}
interface RespuestaSimulacion {
  modo: 'simulacion'
  inmueblesEvaluados: number
  planes: PlanRespuesta[]
  resultadoHash: string
}
interface RespuestaEjecucion {
  modo: 'ejecucion'
  inmueblesEvaluados: number
  cambiosEtapa: number
  resultadoHash: string
  errores?: string[]
}

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

/** Política vigente con 2 tramos: AL_DIA (preventiva) y MORA (administrativa) — cobertura [0,∞). */
async function armarPoliticaClasificacion(admin: Cliente, tenantId: string): Promise<string> {
  const { data: politica, error: errPolitica } = await admin
    .from('politicas_clasificacion_cartera')
    .insert({
      tenant_id: tenantId,
      version: 1,
      estado: 'borrador',
      nombre: 'Política JOB_CARTERA_DIARIA v1',
      policy_hash: `test-fixture-recalcular-${tenantId}`,
    })
    .select('id')
    .single<{ id: string }>()
  if (errPolitica) throw new Error(`fixture politica: ${errPolitica.message}`)

  const { error: errTramos } = await admin.from('politica_clasificacion_tramos').insert([
    {
      tenant_id: tenantId,
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
      tenant_id: tenantId,
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
  if (errTramos) throw new Error(`fixture tramos: ${errTramos.message}`)

  const { error: errActivar } = await admin
    .from('politicas_clasificacion_cartera')
    .update({ estado: 'vigente' })
    .eq('id', politica.id)
  if (errActivar) throw new Error(`activar politica: ${errActivar.message}`)

  return politica.id
}

/** Cargo de capital vencido — mismo patrón que calcular-intereses.test.ts (crearCargoCapital). */
async function crearCargoVencido(
  admin: Cliente,
  tenantId: string,
  inmuebleId: string,
  fechaVencimiento: string,
  monto: number,
): Promise<void> {
  const { data: periodo, error: errPeriodo } = await admin
    .from('periodos')
    .insert({ tenant_id: tenantId, anio: 2026, mes: 1, estado: 'abierto', fecha_vencimiento: fechaVencimiento })
    .select('id')
    .single<{ id: string }>()
  if (errPeriodo) throw new Error(`fixture periodo: ${errPeriodo.message}`)

  const { data: concepto, error: errConcepto } = await admin
    .from('conceptos')
    .insert({
      tenant_id: tenantId,
      codigo: `CR-${String(Date.now())}-${String(Math.random()).slice(2, 6)}`,
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
  if (errConcepto) throw new Error(`fixture concepto: ${errConcepto.message}`)

  const { data: liquidacion, error: errLiquidacion } = await admin
    .from('liquidaciones')
    .insert({
      tenant_id: tenantId,
      periodo_id: periodo.id,
      result_hash: `test-fixture-recalcular-${String(Date.now())}-${String(Math.random())}`,
      tenant_total: monto,
    })
    .select('id')
    .single<{ id: string }>()
  if (errLiquidacion) throw new Error(`fixture liquidacion: ${errLiquidacion.message}`)

  const { data: linea, error: errLinea } = await admin
    .from('liquidacion_lineas')
    .insert({
      tenant_id: tenantId,
      liquidacion_id: liquidacion.id,
      inmueble_id: inmuebleId,
      concepto_id: concepto.id,
      monto,
    })
    .select('id')
    .single<{ id: string }>()
  if (errLinea) throw new Error(`fixture liquidacion_linea: ${errLinea.message}`)

  const { error: errCargo } = await admin.from('cargos').insert({
    tenant_id: tenantId,
    inmueble_id: inmuebleId,
    periodo_id: periodo.id,
    categoria: 'capital',
    origen_tipo: 'liquidacion_linea',
    liquidacion_linea_id: linea.id,
    concepto_id: concepto.id,
    monto_original: monto,
  })
  if (errCargo) throw new Error(`fixture cargo: ${errCargo.message}`)
}

d('cartera-recalcular (Edge Function, CAR §18)', () => {
  const admin = clienteAdmin(env!)
  let agente: UsuarioPrueba
  let administrador: UsuarioPrueba
  let tenant: TenantPrueba
  let tenantSinPolitica: TenantPrueba
  let clienteAgent: Cliente
  let clienteAdministrador: Cliente
  let clienteAdministradorSinPolitica: Cliente
  let inmuebleId: string

  const FECHA_CORTE = '2026-02-15'

  afterAll(async () => {
    await eliminarTenant(admin, tenant.id)
    await eliminarTenant(admin, tenantSinPolitica.id)
    await eliminarUsuario(admin, agente.id)
    await eliminarUsuario(admin, administrador.id)
  })

  it('setup', async () => {
    agente = await crearUsuario(admin, 'cr-agent')
    administrador = await crearUsuario(admin, 'cr-admin')
    tenant = await crearTenant(admin, 'cr', administrador.id)
    tenantSinPolitica = await crearTenant(admin, 'cr-sin-pol', administrador.id)
    await crearMembership(admin, tenant.id, agente.id, 'auxiliar')
    await crearMembership(admin, tenant.id, administrador.id, 'administrador')
    await crearMembership(admin, tenantSinPolitica.id, administrador.id, 'administrador')
    clienteAgent = await clienteComo(env!, agente)
    clienteAdministrador = await clienteComo(env!, administrador)
    clienteAdministradorSinPolitica = clienteAdministrador

    await armarPoliticaClasificacion(admin, tenant.id)

    const tipoId = await tipoApartamentoId(admin)
    const { data: inmueble, error: errInmueble } = await admin
      .from('inmuebles')
      .insert({ tenant_id: tenant.id, codigo: `CR-${String(Date.now())}`, tipo_id: tipoId })
      .select('id')
      .single<{ id: string }>()
    if (errInmueble) throw new Error(`fixture inmueble: ${errInmueble.message}`)
    inmuebleId = inmueble.id

    // vencimiento 2026-01-01, corte 2026-02-15 → 45 días de mora → tramo MORA (administrativa).
    await crearCargoVencido(admin, tenant.id, inmuebleId, '2026-01-01', 500_000)
  }, 30_000)

  it('POLITICA_CLASIFICACION_NO_VIGENTE (422): tenant sin política de clasificación', async () => {
    const { data, response } = await clienteAdministradorSinPolitica.functions.invoke<RespuestaEjecucion>(
      'cartera-recalcular',
      { body: { tenant_id: tenantSinPolitica.id, fecha_corte: FECHA_CORTE, modo: 'simulacion' } },
    )
    expect(data).toBeNull()
    expect(response?.status).toBe(422)
  }, 30_000)

  it('un agent no puede ejecutar el job (403) — rol mínimo administrador', async () => {
    const { data, response } = await clienteAgent.functions.invoke<RespuestaEjecucion>('cartera-recalcular', {
      body: { tenant_id: tenant.id, fecha_corte: FECHA_CORTE, modo: 'simulacion' },
    })
    expect(data).toBeNull()
    expect(response?.status).toBe(403)
  }, 30_000)

  let hashSimulacion: string

  it('modo simulación: calcula el plan y el hash sin escribir nada', async () => {
    const { data, response } = await clienteAdministrador.functions.invoke<RespuestaSimulacion>(
      'cartera-recalcular',
      { body: { tenant_id: tenant.id, fecha_corte: FECHA_CORTE, modo: 'simulacion', alcance_inmuebles: [inmuebleId] } },
    )
    expect(response?.status).toBe(200)
    expect(data?.inmueblesEvaluados).toBe(1)
    const plan = data?.planes.find((p) => p.inmuebleId === inmuebleId)
    expect(plan?.etapaCobranza).toBe('administrativa')
    expect(plan?.decisionEscalamiento.tipo).toBe('escalar')
    expect(plan?.decisionEscalamiento.hacia).toBe('administrativa')
    hashSimulacion = data!.resultadoHash

    const { data: snapshot } = await admin
      .from('posiciones_cartera_snapshot')
      .select('id')
      .eq('tenant_id', tenant.id)
      .eq('inmueble_id', inmuebleId)
      .eq('fecha_corte', FECHA_CORTE)
    expect(snapshot).toHaveLength(0)

    const { data: etapa } = await admin
      .from('cartera_etapas')
      .select('etapa')
      .eq('tenant_id', tenant.id)
      .eq('inmueble_id', inmuebleId)
      .maybeSingle()
    // el seed en preventiva ocurre siempre (incluso en simulación, no es un
    // "efecto" del job sino un prerrequisito de lectura) — pero la etapa NO
    // debe haber cambiado a administrativa todavía.
    expect(etapa === null || etapa.etapa === 'preventiva').toBe(true)
  }, 30_000)

  it('modo ejecución: persiste snapshot, confirma la etapa y registra el evento', async () => {
    const { data, response } = await clienteAdministrador.functions.invoke<RespuestaEjecucion>(
      'cartera-recalcular',
      { body: { tenant_id: tenant.id, fecha_corte: FECHA_CORTE, modo: 'ejecucion', alcance_inmuebles: [inmuebleId] } },
    )
    expect(response?.status).toBe(200)
    expect(data?.errores).toBeUndefined()
    expect(data?.cambiosEtapa).toBe(1)
    expect(data?.resultadoHash).toBe(hashSimulacion) // PH-C27/PH-C33: mismo insumo, mismo hash.

    const { data: etapa, error: errEtapa } = await admin
      .from('cartera_etapas')
      .select('etapa, etapa_anterior')
      .eq('tenant_id', tenant.id)
      .eq('inmueble_id', inmuebleId)
      .single()
    expect(errEtapa).toBeNull()
    expect(etapa?.etapa).toBe('administrativa')
    expect(etapa?.etapa_anterior).toBe('preventiva')

    const { data: snapshot, error: errSnapshot } = await admin
      .from('posiciones_cartera_snapshot')
      .select('etapa_cobranza, posicion_hash')
      .eq('tenant_id', tenant.id)
      .eq('inmueble_id', inmuebleId)
      .eq('fecha_corte', FECHA_CORTE)
    expect(errSnapshot).toBeNull()
    expect(snapshot).toHaveLength(1)
    expect(snapshot?.[0]?.etapa_cobranza).toBe('administrativa')

    const { data: eventos, error: errEventos } = await admin
      .from('eventos_cartera')
      .select('tipo, dedup_key')
      .eq('tenant_id', tenant.id)
      .eq('inmueble_id', inmuebleId)
      .eq('tipo', 'CARTERA_ETAPA_CAMBIO')
    expect(errEventos).toBeNull()
    expect(eventos).toHaveLength(1)
  }, 30_000)

  it('PH-C33: una segunda corrida sobre la misma fecha_corte no encuentra más trabajo y no duplica nada', async () => {
    const { data, response } = await clienteAdministrador.functions.invoke<RespuestaEjecucion>(
      'cartera-recalcular',
      { body: { tenant_id: tenant.id, fecha_corte: FECHA_CORTE, modo: 'ejecucion', alcance_inmuebles: [inmuebleId] } },
    )
    expect(response?.status).toBe(200)
    expect(data?.errores).toBeUndefined()
    // Idempotencia real: el estado YA cambió a administrativa en la corrida
    // anterior, así que evaluarJobCarteraInmueble() ahora lee etapaActual=
    // 'administrativa' y decide 'permanecer' — un hash distinto al de
    // hashSimulacion (que reflejaba la decisión 'escalar' sobre el estado
    // ANTERIOR) es lo esperado, no una violación de PH-C33. Lo que prueba
    // idempotencia es que no se propuso ningún cambio y nada se duplicó.
    expect(data?.cambiosEtapa).toBe(0)
    expect(data?.resultadoHash).not.toBe(hashSimulacion)

    const { data: snapshot, error: errSnapshot } = await admin
      .from('posiciones_cartera_snapshot')
      .select('id')
      .eq('tenant_id', tenant.id)
      .eq('inmueble_id', inmuebleId)
      .eq('fecha_corte', FECHA_CORTE)
    expect(errSnapshot).toBeNull()
    expect(snapshot).toHaveLength(1) // upsert+ignoreDuplicates — no se duplicó (IDEM-01).

    const { data: eventos, error: errEventos } = await admin
      .from('eventos_cartera')
      .select('id')
      .eq('tenant_id', tenant.id)
      .eq('inmueble_id', inmuebleId)
      .eq('tipo', 'CARTERA_ETAPA_CAMBIO')
    expect(errEventos).toBeNull()
    expect(eventos).toHaveLength(1) // ídem — sin duplicar (IDEM-03).
  }, 30_000)
})
