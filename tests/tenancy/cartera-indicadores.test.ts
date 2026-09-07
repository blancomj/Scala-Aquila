/**
 * cartera-indicadores (Edge Function, HTTP real) — CAR F9 (partes 2+3+4),
 * §23.3: los 11 indicadores completos — Overdue Portfolio %, Roll Rate,
 * Cure Rate, Recovery Rate, Collection Effectiveness, Promise/Agreement
 * Fulfillment Rate, Legal Referral Rate, Legal Recovery Rate, Average
 * Days to Recovery, Cost to Collect.
 *
 * Roll Rate/Cure Rate se prueban con snapshots SINTÉTICOS insertados
 * directamente (posiciones_cartera_snapshot es append-only, solo
 * service_role escribe, F3) — no hace falta recorrer el job diario (F8)
 * completo para fijar clasificacion_codigo/deuda_total exactos en dos
 * fechas y así ejercitar los bordes del agregador puro contra la BD real.
 * Overdue Portfolio % SÍ usa un cargo real (se recalcula en vivo con
 * fn_dashboard_cartera, F9 parte 1, independiente de los snapshots).
 *
 * Recovery Rate/Collection Effectiveness/Promise·Agreement Fulfillment
 * Rate llevan acciones_cobranza/acuerdos_pago hasta un estado terminal
 * usando el cliente ADMIN directo — los tramos programada→ejecutando→
 * ejecutada y vigente→cumplido/incumplido no exigen rol dentro del guard
 * (auth.uid() null = service_role se salta ese chequeo, confirmado
 * leyendo 20260822280000/20260822310000); solo pendiente_aprobacion→
 * aprobada/vigente lo exige, y este archivo no ejercita esa transición.
 *
 * Legal Referral/Recovery Rate SÍ exigen un cliente autenticado con rol
 * administrador real — certificaciones_deuda y casos_juridicos rechazan
 * auth.uid() null explícitamente (a diferencia de acciones_cobranza/
 * acuerdos_pago), así que aquí no hay atajo con el cliente admin para el
 * INSERT inicial (sí para el resto de fixtures, vía admin). "Inmuebles
 * que alcanzaron el tramo jurídico" se aproxima con posiciones_cartera_
 * snapshot.etapa_cobranza en un rango de fechas (cartera_etapas no es un
 * log de eventos) — ver cabecera de fn_indicadores_legales
 * (20260823120000). Cost to Collect es parcial (solo costas_judiciales,
 * sin costo de acciones_cobranza — no trackeado, decisión explícita).
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
  console.warn('SALTADO tests/tenancy/cartera-indicadores: faltan variables de Supabase en .env')
}

interface RespuestaIndicadores {
  overduePortfolioPct: number | null
  cureRate: number | null
  rollRatePorTramo: { tramoCodigo: string; tramoSiguienteCodigo: string | null; rollRate: number | null }[]
  recoveryRate: number | null
  collectionEffectiveness: number | null
  promiseFulfillmentRate: number | null
  agreementFulfillmentRate: number | null
  legalReferralRate: number | null
  legalRecoveryRate: number | null
  averageDaysToRecovery: number | null
  costToCollect: number | null
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

async function tipoApartamentoId(admin: Cliente): Promise<number> {
  return listaTipoId(admin, 'TIPO_INMUEBLE', 'apartamento')
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

async function insertarSnapshot(
  admin: Cliente,
  opciones: {
    tenantId: string
    inmuebleId: string
    fechaCorte: string
    deudaTotal: number
    clasificacionCodigo: string
    diasMoraMaximo: number
    politicaId: string
    /** Override — por defecto se deriva de diasMoraMaximo (preventiva/administrativa). Legal Referral Rate necesita 'juridica'/'judicial' explícito. */
    etapaCobranza?: 'preventiva' | 'administrativa' | 'prejuridica' | 'juridica' | 'judicial'
  },
): Promise<void> {
  const { error } = await admin.from('posiciones_cartera_snapshot').insert({
    tenant_id: opciones.tenantId,
    inmueble_id: opciones.inmuebleId,
    fecha_corte: opciones.fechaCorte,
    deuda_total: opciones.deudaTotal,
    deuda_capital: opciones.deudaTotal,
    deuda_interes: 0,
    deuda_otros: 0,
    dias_mora_maximo: opciones.diasMoraMaximo,
    clasificacion_codigo: opciones.clasificacionCodigo,
    nivel_riesgo: opciones.diasMoraMaximo === 0 ? 'ninguno' : 'bajo',
    etapa_cobranza: opciones.etapaCobranza ?? (opciones.diasMoraMaximo === 0 ? 'preventiva' : 'administrativa'),
    politica_clasificacion_id: opciones.politicaId,
    politica_version: 1,
    posicion_hash: `test-fixture-indicadores-${opciones.inmuebleId}-${opciones.fechaCorte}`,
  })
  if (error) throw new Error(`fixture snapshot ${opciones.inmuebleId}/${opciones.fechaCorte}: ${error.message}`)
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
      policy_hash: `test-fixture-indicadores-financiera-${tenantId}`,
    })
    .select('id')
    .single<{ id: string }>()
  if (error) throw new Error(`fixture politica_financiera: ${error.message}`)
  return data.id
}

/** Cargo llevado a saldo 0 con un único pago — fixture de Average Days to Recovery. */
async function crearCargoSaldado(
  admin: Cliente,
  opciones: { tenantId: string; inmuebleId: string; fechaVencimiento: string; montoOriginal: number; fechaPago: string },
): Promise<void> {
  const { data: periodo, error: errPeriodo } = await admin
    .from('periodos')
    .insert({ tenant_id: opciones.tenantId, anio: 2026, mes: 2, estado: 'abierto', fecha_vencimiento: opciones.fechaVencimiento })
    .select('id')
    .single<{ id: string }>()
  if (errPeriodo) throw new Error(`fixture periodo (cargo saldado): ${errPeriodo.message}`)
  const { data: concepto, error: errConcepto } = await admin
    .from('conceptos')
    .insert({
      tenant_id: opciones.tenantId,
      codigo: `CI-ADR-${String(Date.now())}`,
      nombre: 'Cuota ADR',
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
  if (errConcepto) throw new Error(`fixture concepto (cargo saldado): ${errConcepto.message}`)
  const { data: liquidacion, error: errLiquidacion } = await admin
    .from('liquidaciones')
    .insert({
      tenant_id: opciones.tenantId,
      periodo_id: periodo.id,
      result_hash: `test-fixture-indicadores-adr-liq-${String(Date.now())}`,
      tenant_total: opciones.montoOriginal,
    })
    .select('id')
    .single<{ id: string }>()
  if (errLiquidacion) throw new Error(`fixture liquidacion (cargo saldado): ${errLiquidacion.message}`)
  const { data: linea, error: errLinea } = await admin
    .from('liquidacion_lineas')
    .insert({
      tenant_id: opciones.tenantId,
      liquidacion_id: liquidacion.id,
      inmueble_id: opciones.inmuebleId,
      concepto_id: concepto.id,
      monto: opciones.montoOriginal,
    })
    .select('id')
    .single<{ id: string }>()
  if (errLinea) throw new Error(`fixture liquidacion_linea (cargo saldado): ${errLinea.message}`)
  const { data: cargo, error: errCargo } = await admin
    .from('cargos')
    .insert({
      tenant_id: opciones.tenantId,
      inmueble_id: opciones.inmuebleId,
      periodo_id: periodo.id,
      categoria: 'capital',
      origen_tipo: 'liquidacion_linea',
      liquidacion_linea_id: linea.id,
      concepto_id: concepto.id,
      monto_original: opciones.montoOriginal,
    })
    .select('id')
    .single<{ id: string }>()
  if (errCargo) throw new Error(`fixture cargo (cargo saldado): ${errCargo.message}`)
  const formaPagoId = await listaTipoId(admin, 'FORMA_PAGO', 'efectivo')
  const { data: pago, error: errPago } = await admin
    .from('pagos')
    .insert({ tenant_id: opciones.tenantId, inmueble_id: opciones.inmuebleId, monto: opciones.montoOriginal, fecha_pago: opciones.fechaPago, forma_pago_id: formaPagoId })
    .select('id')
    .single<{ id: string }>()
  if (errPago) throw new Error(`fixture pago (cargo saldado): ${errPago.message}`)
  const { error: errAplicacion } = await admin
    .from('pago_aplicaciones')
    .insert({ tenant_id: opciones.tenantId, pago_id: pago.id, cargo_id: cargo.id, monto: opciones.montoOriginal })
  if (errAplicacion) throw new Error(`fixture pago_aplicacion (cargo saldado): ${errAplicacion.message}`)
}

d('cartera-indicadores (Edge Function, CAR §23.3)', () => {
  const admin = clienteAdmin(env!)
  let agente: UsuarioPrueba
  let administrador: UsuarioPrueba
  let tenant: TenantPrueba
  let clienteAgent: Cliente
  let clienteAdministrador: Cliente
  let politicaId: string
  let inmuebleRealId: string

  const FECHA_DESDE = '2026-02-01'
  const FECHA_HASTA = '2026-03-01'

  afterAll(async () => {
    await eliminarTenant(admin, tenant.id)
    await eliminarUsuario(admin, agente.id)
    await eliminarUsuario(admin, administrador.id)
  })

  it('setup', async () => {
    agente = await crearUsuario(admin, 'ci-agent')
    administrador = await crearUsuario(admin, 'ci-admin')
    tenant = await crearTenant(admin, 'ci', agente.id)
    await crearMembership(admin, tenant.id, agente.id, 'auxiliar')
    await crearMembership(admin, tenant.id, administrador.id, 'administrador')
    clienteAgent = await clienteComo(env!, agente)
    clienteAdministrador = await clienteComo(env!, administrador)

    const { data: politica, error: errPolitica } = await admin
      .from('politicas_clasificacion_cartera')
      .insert({
        tenant_id: tenant.id,
        version: 1,
        estado: 'borrador',
        nombre: 'Política indicadores v1',
        policy_hash: `test-fixture-indicadores-${tenant.id}`,
      })
      .select('id')
      .single<{ id: string }>()
    if (errPolitica) throw new Error(`fixture politica: ${errPolitica.message}`)
    politicaId = politica.id

    const { error: errTramos } = await admin.from('politica_clasificacion_tramos').insert([
      { tenant_id: tenant.id, politica_id: politicaId, codigo: 'AL_DIA', nombre: 'Al día', dias_min: 0, dias_max: 0, nivel_riesgo: 'ninguno', etapa_cobranza: 'preventiva', prioridad: 0, orden: 0 },
      { tenant_id: tenant.id, politica_id: politicaId, codigo: 'MORA_TEMPRANA', nombre: 'Temprana', dias_min: 1, dias_max: 30, nivel_riesgo: 'bajo', etapa_cobranza: 'administrativa', prioridad: 1, orden: 1 },
      { tenant_id: tenant.id, politica_id: politicaId, codigo: 'MORA_INICIAL', nombre: 'Inicial', dias_min: 31, dias_max: null, nivel_riesgo: 'bajo', etapa_cobranza: 'administrativa', prioridad: 2, orden: 2 },
    ])
    if (errTramos) throw new Error(`fixture tramos: ${errTramos.message}`)

    const { error: errActivar } = await admin
      .from('politicas_clasificacion_cartera')
      .update({ estado: 'vigente' })
      .eq('id', politicaId)
    if (errActivar) throw new Error(`activar politica: ${errActivar.message}`)

    const tipoId = await tipoApartamentoId(admin)
    const inmuebleAId = await crearInmueble(admin, tenant.id, tipoId, `CI-A-${String(Date.now())}`)
    const inmuebleBId = await crearInmueble(admin, tenant.id, tipoId, `CI-B-${String(Date.now())}`)
    const inmuebleCId = await crearInmueble(admin, tenant.id, tipoId, `CI-C-${String(Date.now())}`)

    // A: MORA_TEMPRANA (100_000) → MORA_INICIAL (100_000) — rola, no se cura.
    await insertarSnapshot(admin, { tenantId: tenant.id, inmuebleId: inmuebleAId, fechaCorte: FECHA_DESDE, deudaTotal: 100_000, clasificacionCodigo: 'MORA_TEMPRANA', diasMoraMaximo: 15, politicaId })
    await insertarSnapshot(admin, { tenantId: tenant.id, inmuebleId: inmuebleAId, fechaCorte: FECHA_HASTA, deudaTotal: 100_000, clasificacionCodigo: 'MORA_INICIAL', diasMoraMaximo: 45, politicaId })

    // B: MORA_TEMPRANA (50_000) → AL_DIA (0) — se cura.
    await insertarSnapshot(admin, { tenantId: tenant.id, inmuebleId: inmuebleBId, fechaCorte: FECHA_DESDE, deudaTotal: 50_000, clasificacionCodigo: 'MORA_TEMPRANA', diasMoraMaximo: 10, politicaId })
    await insertarSnapshot(admin, { tenantId: tenant.id, inmuebleId: inmuebleBId, fechaCorte: FECHA_HASTA, deudaTotal: 0, clasificacionCodigo: 'AL_DIA', diasMoraMaximo: 0, politicaId })

    // C: AL_DIA → AL_DIA — sano en ambas fechas, no compite en los denominadores.
    await insertarSnapshot(admin, { tenantId: tenant.id, inmuebleId: inmuebleCId, fechaCorte: FECHA_DESDE, deudaTotal: 0, clasificacionCodigo: 'AL_DIA', diasMoraMaximo: 0, politicaId })
    await insertarSnapshot(admin, { tenantId: tenant.id, inmuebleId: inmuebleCId, fechaCorte: FECHA_HASTA, deudaTotal: 0, clasificacionCodigo: 'AL_DIA', diasMoraMaximo: 0, politicaId })

    // inmuebleReal: cargo vencido REAL para Overdue Portfolio % (fn_dashboard_cartera en vivo).
    inmuebleRealId = await crearInmueble(admin, tenant.id, tipoId, `CI-REAL-${String(Date.now())}`)
    const { data: periodo, error: errPeriodo } = await admin
      .from('periodos')
      .insert({ tenant_id: tenant.id, anio: 2026, mes: 1, estado: 'abierto', fecha_vencimiento: '2026-01-15' })
      .select('id')
      .single<{ id: string }>()
    if (errPeriodo) throw new Error(`fixture periodo: ${errPeriodo.message}`)
    const { data: concepto, error: errConcepto } = await admin
      .from('conceptos')
      .insert({ tenant_id: tenant.id, codigo: `CI-CONC-${String(Date.now())}`, nombre: 'Cuota', modo_calculo: 'distribucion', modo_valor: 'formulado', tipo_recurrencia: 'recurrente', periodicidad: 'mensual', alcance: 'todos', fecha_inicio_anio: 2000, fecha_inicio_mes: 1, prioridad: 100, estado: 'activo' })
      .select('id')
      .single<{ id: string }>()
    if (errConcepto) throw new Error(`fixture concepto: ${errConcepto.message}`)
    const { data: liquidacion, error: errLiquidacion } = await admin
      .from('liquidaciones')
      .insert({ tenant_id: tenant.id, periodo_id: periodo.id, result_hash: `test-fixture-indicadores-liq-${String(Date.now())}`, tenant_total: 100_000 })
      .select('id')
      .single<{ id: string }>()
    if (errLiquidacion) throw new Error(`fixture liquidacion: ${errLiquidacion.message}`)
    const { data: linea, error: errLinea } = await admin
      .from('liquidacion_lineas')
      .insert({ tenant_id: tenant.id, liquidacion_id: liquidacion.id, inmueble_id: inmuebleRealId, concepto_id: concepto.id, monto: 100_000 })
      .select('id')
      .single<{ id: string }>()
    if (errLinea) throw new Error(`fixture liquidacion_linea: ${errLinea.message}`)
    const { data: cargo, error: errCargo } = await admin
      .from('cargos')
      .insert({
        tenant_id: tenant.id,
        inmueble_id: inmuebleRealId,
        periodo_id: periodo.id,
        categoria: 'capital',
        origen_tipo: 'liquidacion_linea',
        liquidacion_linea_id: linea.id,
        concepto_id: concepto.id,
        monto_original: 100_000,
      })
      .select('id')
      .single<{ id: string }>()
    if (errCargo) throw new Error(`fixture cargo: ${errCargo.message}`)

    // Recovery Rate: pago aplicado DENTRO del período a un cargo vencido AL INICIO del período.
    const formaPagoIdRecovery = await listaTipoId(admin, 'FORMA_PAGO', 'efectivo')
    const { data: pago, error: errPago } = await admin
      .from('pagos')
      .insert({ tenant_id: tenant.id, inmueble_id: inmuebleRealId, monto: 40_000, fecha_pago: '2026-02-15', forma_pago_id: formaPagoIdRecovery })
      .select('id')
      .single<{ id: string }>()
    if (errPago) throw new Error(`fixture pago: ${errPago.message}`)
    const { error: errAplicacion } = await admin
      .from('pago_aplicaciones')
      .insert({ tenant_id: tenant.id, pago_id: pago.id, cargo_id: cargo.id, monto: 40_000 })
    if (errAplicacion) throw new Error(`fixture pago_aplicacion: ${errAplicacion.message}`)

    // Collection Effectiveness: 3 acciones ejecutadas dentro del período, 2 con resultado favorable.
    const tipoIdentCedula = await listaTipoId(admin, 'TIPO_IDENTIFICACION', 'cedula')
    const estadoActivo = await listaTipoId(admin, 'ESTADO_TERCERO', 'activo')
    const { data: tercero, error: errTercero } = await admin
      .from('terceros')
      .insert({
        tenant_id: tenant.id,
        tipo_identificacion_id: tipoIdentCedula,
        numero_documento: `CI-TER-${String(Date.now())}`,
        tipo_persona: 'natural',
        primer_nombre: 'Ana',
        primer_apellido: 'Gómez',
        estado_id: estadoActivo,
      })
      .select('id')
      .single<{ id: string }>()
    if (errTercero) throw new Error(`fixture tercero: ${errTercero.message}`)

    const resultadosAcciones: ('pago_recibido' | 'promesa_de_pago' | 'contacto_efectivo')[] = [
      'pago_recibido',
      'promesa_de_pago',
      'contacto_efectivo',
    ]
    for (const resultado of resultadosAcciones) {
      const { data: accion, error: errAccion } = await admin
        .from('acciones_cobranza')
        .insert({
          tenant_id: tenant.id,
          inmueble_id: inmuebleRealId,
          tipo_accion: 'llamada',
          canal: 'telefono',
          fecha_programada: '2026-02-05',
          clasificacion_codigo: 'MORA_INICIAL',
          politica_clasificacion_id: politicaId,
          politica_version: 1,
          dias_mora_al_momento: 30,
          deuda_total_al_momento: 100_000,
          alcance: 'inmueble',
          destinatario_tercero_id: tercero.id,
          destinatario_rol_codigo: 'copropietario',
          intento_numero: 1,
          creada_por: 'manual',
          estado: 'programada',
        })
        .select('id')
        .single<{ id: string }>()
      if (errAccion) throw new Error(`fixture accion_cobranza: ${errAccion.message}`)

      const { error: errEjecutando } = await admin
        .from('acciones_cobranza')
        .update({ estado: 'ejecutando' })
        .eq('id', accion.id)
      if (errEjecutando) throw new Error(`fixture accion_cobranza→ejecutando: ${errEjecutando.message}`)

      const { error: errEjecutada } = await admin
        .from('acciones_cobranza')
        .update({ estado: 'ejecutada', resultado, fecha_ejecucion: '2026-02-10T12:00:00Z' })
        .eq('id', accion.id)
      if (errEjecutada) throw new Error(`fixture accion_cobranza→ejecutada: ${errEjecutada.message}`)
    }

    // Promise Fulfillment Rate: 3 promesas vencidas dentro del período, 2 cumplidas.
    const desenlacesPromesas: ('cumplida' | 'incumplida')[] = ['cumplida', 'cumplida', 'incumplida']
    for (const desenlace of desenlacesPromesas) {
      const { data: promesa, error: errPromesa } = await admin
        .from('promesas_pago')
        .insert({
          tenant_id: tenant.id,
          inmueble_id: inmuebleRealId,
          fecha_promesa: '2026-02-01',
          monto_prometido: 50_000,
          fecha_pago_prometida: '2026-02-20',
        })
        .select('id')
        .single<{ id: string }>()
      if (errPromesa) throw new Error(`fixture promesa: ${errPromesa.message}`)

      const { error: errDesenlace } = await admin
        .from('promesas_pago')
        .update({ estado: desenlace })
        .eq('id', promesa.id)
      if (errDesenlace) throw new Error(`fixture promesa→${desenlace}: ${errDesenlace.message}`)
    }

    // Agreement Fulfillment Rate: 2 acuerdos terminados dentro del período (fecha_fin), 1 cumplido + 1 incumplido.
    const desenlacesAcuerdos: ('cumplido' | 'incumplido')[] = ['cumplido', 'incumplido']
    for (const desenlace of desenlacesAcuerdos) {
      const inmuebleAcuerdoId = await crearInmueble(admin, tenant.id, tipoId, `CI-ACU-${desenlace}-${String(Date.now())}`)
      const { data: acuerdo, error: errAcuerdo } = await admin
        .from('acuerdos_pago')
        .insert({
          tenant_id: tenant.id,
          inmueble_id: inmuebleAcuerdoId,
          consecutivo: `ACU-${desenlace}-${String(Date.now())}`,
          fecha_acuerdo: '2026-02-01',
          fecha_inicio: '2026-02-01',
          fecha_fin: '2026-02-25',
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
      if (errAcuerdo) throw new Error(`fixture acuerdo: ${errAcuerdo.message}`)

      const { error: errPendiente } = await admin
        .from('acuerdos_pago')
        .update({ estado: 'pendiente_aprobacion' })
        .eq('id', acuerdo.id)
      if (errPendiente) throw new Error(`fixture acuerdo→pendiente_aprobacion: ${errPendiente.message}`)

      const { error: errVigente } = await admin.from('acuerdos_pago').update({ estado: 'vigente' }).eq('id', acuerdo.id)
      if (errVigente) throw new Error(`fixture acuerdo→vigente: ${errVigente.message}`)

      const { error: errFinal } = await admin.from('acuerdos_pago').update({ estado: desenlace }).eq('id', acuerdo.id)
      if (errFinal) throw new Error(`fixture acuerdo→${desenlace}: ${errFinal.message}`)
    }

    // Legal Referral Rate: D y E "alcanzan el tramo jurídico" (snapshot con
    // etapa_cobranza juridica/judicial dentro del período) — solo D se
    // remite realmente a jurídico → 1/2 = 50%.
    const inmuebleDId = await crearInmueble(admin, tenant.id, tipoId, `CI-D-${String(Date.now())}`)
    const inmuebleEId = await crearInmueble(admin, tenant.id, tipoId, `CI-E-${String(Date.now())}`)
    await insertarSnapshot(admin, {
      tenantId: tenant.id,
      inmuebleId: inmuebleDId,
      fechaCorte: '2026-02-10',
      deudaTotal: 400_000,
      clasificacionCodigo: 'MORA_INICIAL',
      diasMoraMaximo: 90,
      politicaId,
      etapaCobranza: 'juridica',
    })
    await insertarSnapshot(admin, {
      tenantId: tenant.id,
      inmuebleId: inmuebleEId,
      fechaCorte: '2026-02-10',
      deudaTotal: 500_000,
      clasificacionCodigo: 'MORA_INICIAL',
      diasMoraMaximo: 95,
      politicaId,
      etapaCobranza: 'judicial',
    })

    // Legal Recovery Rate: certificación vigente + caso jurídico de D,
    // remitido dentro del período, con monto_recuperado parcial.
    const politicaFinancieraId = await crearPoliticaFinancieraVigente(admin, tenant.id)
    const { data: certificacion, error: errCert } = await clienteAdministrador
      .from('certificaciones_deuda')
      .insert({
        tenant_id: tenant.id,
        inmueble_id: inmuebleDId,
        consecutivo: `CI-CERT-${String(Date.now())}`,
        fecha_expedicion: '2026-02-11',
        fecha_corte: '2026-02-01',
        monto_expensas_ordinarias: 400_000,
        monto_expensas_extraordinarias: 0,
        monto_intereses_mora: 0,
        monto_sanciones: 0,
        monto_otros: 0,
        monto_total: 400_000,
        detalle_cargos: [{ cargoId: 'fixture', categoria: 'capital', saldoPendiente: '400000' }],
        politica_financiera_id: politicaFinancieraId,
        politica_version: 1,
        cargo_firmante: 'Administrador de prueba',
        certificacion_hash: `test-fixture-indicadores-cert-${String(Date.now())}`,
      })
      .select('id')
      .single<{ id: string }>()
    if (errCert) throw new Error(`fixture certificacion: ${errCert.message}`)

    const { data: caso, error: errCaso } = await clienteAdministrador
      .from('casos_juridicos')
      .insert({
        tenant_id: tenant.id,
        inmueble_id: inmuebleDId,
        consecutivo: `CI-CASO-${String(Date.now())}`,
        certificacion_id: certificacion.id,
        fecha_remision: '2026-02-12',
        monto_pretension: 400_000,
        fecha_pretension: '2026-02-12',
      })
      .select('id')
      .single<{ id: string }>()
    if (errCaso) throw new Error(`fixture caso_juridico: ${errCaso.message}`)

    const { error: errRecuperado } = await clienteAgent
      .from('casos_juridicos')
      .update({ monto_recuperado: 100_000 })
      .eq('id', caso.id)
    if (errRecuperado) throw new Error(`fixture caso_juridico monto_recuperado: ${errRecuperado.message}`)

    // Cost to Collect: costa judicial del mismo caso, dentro del período.
    const { error: errCosta } = await clienteAgent.from('costas_judiciales').insert({
      tenant_id: tenant.id,
      caso_id: caso.id,
      tipo_costa: 'gasto_proceso',
      monto: 50_000,
      documento_fuente: 'Auto que liquida costas — Juzgado 1 Civil Municipal',
      fecha_decision: '2026-02-15',
      autoridad: 'Juzgado 1 Civil Municipal',
    })
    if (errCosta) throw new Error(`fixture costa_judicial: ${errCosta.message}`)

    // Average Days to Recovery: cargo saldado con un único pago dentro del
    // período — vencimiento 2026-02-05, pago 2026-02-20 → 15 días. No
    // vencido al inicio del período (2026-02-05 no es < FECHA_DESDE), así
    // que no altera montoRecuperadoPeriodo (Recovery Rate/Cost to Collect).
    await crearCargoSaldado(admin, {
      tenantId: tenant.id,
      inmuebleId: inmuebleRealId,
      fechaVencimiento: '2026-02-05',
      montoOriginal: 30_000,
      fechaPago: '2026-02-20',
    })
  }, 30_000)

  it('SNAPSHOT_NO_DISPONIBLE (422): sin snapshot para fecha_desde', async () => {
    const { data, response } = await clienteAgent.functions.invoke<RespuestaIndicadores>('cartera-indicadores', {
      body: { tenant_id: tenant.id, fecha_desde: '2020-01-01', fecha_hasta: FECHA_HASTA },
    })
    expect(data).toBeNull()
    expect(response?.status).toBe(422)
  }, 30_000)

  it('los 11 indicadores de §23.3 se calculan correctamente contra la BD real', async () => {
    const { data, response } = await clienteAgent.functions.invoke<RespuestaIndicadores>('cartera-indicadores', {
      body: { tenant_id: tenant.id, fecha_desde: FECHA_DESDE, fecha_hasta: FECHA_HASTA },
    })
    expect(response?.status).toBe(200)

    // inmuebleReal: 1 cargo, 100% vencido, sin cargo corriente → 100%.
    expect(data?.overduePortfolioPct).toBeCloseTo(100, 6)

    // Cure Rate: vencidos en t−1 = A(100_000) + B(50_000) = 150_000; curado = B(50_000) → 33.33%.
    expect(data?.cureRate).toBeCloseTo(100 / 3, 6)

    const temprana = data?.rollRatePorTramo.find((t) => t.tramoCodigo === 'MORA_TEMPRANA')
    expect(temprana?.tramoSiguienteCodigo).toBe('MORA_INICIAL')
    // A (100_000) roló de TEMPRANA a INICIAL; B (50_000) curó a AL_DIA (no cuenta como "rolado a INICIAL").
    // rollRate = 100_000 / (100_000 + 50_000) = 66.67%.
    expect(temprana?.rollRate).toBeCloseTo(200 / 3, 6)

    const alDia = data?.rollRatePorTramo.find((t) => t.tramoCodigo === 'AL_DIA')
    expect(alDia?.tramoSiguienteCodigo).toBe('MORA_TEMPRANA')
    expect(alDia?.rollRate).toBeCloseTo(0, 6) // C permaneció en AL_DIA.

    const inicial = data?.rollRatePorTramo.find((t) => t.tramoCodigo === 'MORA_INICIAL')
    expect(inicial?.tramoSiguienteCodigo).toBeNull() // último tramo de la política.
    expect(inicial?.rollRate).toBeNull()

    // Recovery Rate: 40_000 recuperados / 150_000 vencidos al inicio (A+B) = 26.67%.
    expect(data?.recoveryRate).toBeCloseTo(400 / 15, 6)

    // Collection Effectiveness: 2 favorables (pago_recibido, promesa_de_pago) / 3 ejecutadas = 66.67%.
    expect(data?.collectionEffectiveness).toBeCloseTo(200 / 3, 6)

    // Promise Fulfillment Rate: 2 cumplidas / 3 vencidas = 66.67%.
    expect(data?.promiseFulfillmentRate).toBeCloseTo(200 / 3, 6)

    // Agreement Fulfillment Rate: 1 cumplido / 2 terminados = 50%.
    expect(data?.agreementFulfillmentRate).toBeCloseTo(50, 6)

    // Legal Referral Rate: D remitido / (D, E alcanzaron el tramo jurídico) = 1/2 = 50%.
    expect(data?.legalReferralRate).toBeCloseTo(50, 6)

    // Legal Recovery Rate: 100_000 recuperados / 400_000 pretendidos (caso de D) = 25%.
    expect(data?.legalRecoveryRate).toBeCloseTo(25, 6)

    // Average Days to Recovery: cargo saldado, vencimiento 2026-02-05, pago 2026-02-20 → 15 días.
    expect(data?.averageDaysToRecovery).toBeCloseTo(15, 6)

    // Cost to Collect: 50_000 costas / 40_000 recuperados en el período = 1.25 (destruye valor).
    expect(data?.costToCollect).toBeCloseTo(1.25, 6)
  }, 30_000)
})
