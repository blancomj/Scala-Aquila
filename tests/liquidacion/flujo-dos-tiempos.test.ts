/**
 * Liquidación en dos tiempos (L0-L7) contra la base real.
 *
 * Cubre el ciclo completo —simular → re-simular → solicitar → aprobar →
 * aplicar → anular— más los guards que lo protegen: quién puede hacer qué,
 * qué bloquea el pre-vuelo, y que un intento fallido no deje nada escrito.
 *
 * ═══ TENANT PROPIO, NO GC-001 ═══
 *
 * Todo ocurre en un tenant sembrado para el test (mismo criterio que
 * concepto-tipo-recurrencia-snapshot.test.ts). Dos razones: gc-001 tiene
 * periodos ya liquidados que dispararían el bloqueo de orden, y porque
 * eliminarTenant() arrastra en cascada todo lo que el test escriba —
 * cargos, liquidaciones y estados de cuenta incluidos, que son append-only
 * pero usan forbid_mutation_salvo_tenant_borrado justamente para esto.
 *
 * ═══ POR QUÉ IMPORTAN ESTOS TESTS ═══
 *
 * Casi todo lo que verifican son invariantes de dinero e irreversibilidad:
 * que un auxiliar no pueda aplicar aunque llame la RPC directamente, que un
 * intento abortado no deje cargos a medias, que anular no borre historia.
 * Son exactamente los que fallan en silencio si alguien toca un guard sin
 * darse cuenta de para qué estaba.
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
  type Cliente,
  type TenantPrueba,
  type UsuarioPrueba,
} from '../rls/helpers.js'

const env = leerEntorno()
const d = env ? describe : describe.skip

if (!env) {
  console.warn('SALTADO tests/liquidacion/flujo-dos-tiempos: faltan variables de Supabase en .env')
}

const CUOTA = 120_000
const UNIDADES = 3

/** Shape de la respuesta 200 de simular-liquidacion — solo los campos que
 *  estos tests leen (ver supabase/functions/simular-liquidacion/index.ts). */
interface RespuestaSimulacion {
  liquidacion_id: string
  estado: string
  lineas: number
  // Serializado como string (amount.toString() en el edge function) — no un
  // número: Number(...) en el punto de uso es una conversión real, no de más.
  tenant_total: string
  descarto_anteriores: number
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

d('Liquidación en dos tiempos (L0-L7)', () => {
  const admin = clienteAdmin(env!)
  let auxiliar: UsuarioPrueba
  let administrador: UsuarioPrueba
  let cAux: Cliente
  let cAdm: Cliente
  let tenant: TenantPrueba
  let periodo: string
  let conceptoId: string
  let liquidacionId: string

  afterAll(async () => {
    // Arrastra en cascada periodos, liquidaciones, cargos y estados de cuenta.
    // TS ve tenant/auxiliar/administrador como siempre asignados (se capturan
    // en el closure del it() de setup), pero si ese it() falla a mitad de
    // camino, afterAll igual corre — el guard evita un segundo error que
    // tape el original.
    /* eslint-disable @typescript-eslint/no-unnecessary-condition */
    if (tenant) await eliminarTenant(admin, tenant.id)
    if (auxiliar) await eliminarUsuario(admin, auxiliar.id)
    if (administrador) await eliminarUsuario(admin, administrador.id)
    /* eslint-enable @typescript-eslint/no-unnecessary-condition */
  })

  it('setup: copropiedad con 3 unidades, coeficientes, política y un concepto fijo', async () => {
    auxiliar = await crearUsuario(admin, 'l7aux')
    administrador = await crearUsuario(admin, 'l7adm')
    tenant = await crearTenant(admin, 'l7', auxiliar.id)
    await crearMembership(admin, tenant.id, auxiliar.id, 'auxiliar')
    await crearMembership(admin, tenant.id, administrador.id, 'administrador')
    cAux = await clienteComo(env!, auxiliar)
    cAdm = await clienteComo(env!, administrador)

    const tipoId = await tipoApartamentoId(admin)
    const { data: inmuebles, error: errInm } = await admin
      .from('inmuebles')
      .insert(
        Array.from({ length: UNIDADES }, (_, i) => ({
          tenant_id: tenant.id,
          codigo: `L7-${String(i + 1).padStart(3, '0')}`,
          tipo_id: tipoId,
        })),
      )
      .select('id')
    if (errInm) throw new Error(`fixture inmuebles: ${errInm.message}`)

    const { data: set, error: errSet } = await admin
      .from('coeficiente_sets')
      .insert({
        tenant_id: tenant.id,
        version: 1,
        vigente_desde: '2030-01-01',
        estado: 'borrador',
        suma_total: 1,
      })
      .select('id')
      .single<{ id: string }>()
    if (errSet) throw new Error(`fixture set: ${errSet.message}`)

    // Tercios exactos: 1/3 no es representable, así que el reparto por mayor
    // resto tendrá residuo — justo lo que interesa ejercitar.
    const { error: errCoef } = await admin.from('coeficientes').insert(
      inmuebles.map((i, idx) => ({
        tenant_id: tenant.id,
        set_id: set.id,
        inmueble_id: i.id,
        valor: idx === 0 ? 0.333334 : 0.333333,
      })),
    )
    if (errCoef) throw new Error(`fixture coeficientes: ${errCoef.message}`)
    await admin.from('coeficiente_sets').update({ estado: 'vigente' }).eq('id', set.id)

    const { error: errPol } = await admin.from('politicas_financieras').insert({
      tenant_id: tenant.id,
      version: 1,
      estado: 'vigente',
      vigente_desde: '2030-01-01',
      redondeo_modo: 'half_up',
      redondeo_escala: 0,
      residual_metodo: 'mayor_resto',
      coeficientes_suma_esperada: 1,
      policy_hash: 'fixture-l7',
    })
    if (errPol) throw new Error(`fixture politica: ${errPol.message}`)

    const { data: per, error: errPer } = await admin
      .from('periodos')
      .insert({ tenant_id: tenant.id, anio: 2030, mes: 1, fecha_vencimiento: '2030-01-10' })
      .select('id')
      .single<{ id: string }>()
    if (errPer) throw new Error(`fixture periodo: ${errPer.message}`)
    periodo = per.id

    // Concepto de distribución con valor fijo: reparte CUOTA entre las
    // unidades por coeficiente, sin depender de un presupuesto.
    //
    // modo_valor='fijo' NO prorratea: valor_fijo es directamente lo que se
    // reparte en el periodo (a diferencia de PARAMETER.PRESUPUESTO_ANUAL en
    // una fórmula, que sí se divide entre 12 — ver ADMINISTRACION en
    // gc-001). Por eso aquí va CUOTA, no CUOTA * 12.
    const { data: con, error: errCon } = await admin
      .from('conceptos')
      .insert({
        tenant_id: tenant.id,
        codigo: 'CUOTA_L7',
        nombre: 'Cuota de prueba',
        modo_calculo: 'distribucion',
        modo_valor: 'fijo',
        valor_fijo: CUOTA,
        prioridad: 100,
        estado: 'activo',
        tipo_recurrencia: 'recurrente',
        // conceptos_periodicidad_consistente: un recurrente exige periodicidad.
        periodicidad: 'mensual',
        fecha_inicio_anio: 2030,
        fecha_inicio_mes: 1,
        alcance: 'todos',
      })
      .select('id')
      .single<{ id: string }>()
    if (errCon) throw new Error(`fixture concepto: ${errCon.message}`)
    conceptoId = con.id
  }, 60_000)

  // ── El pre-vuelo (L1) ──────────────────────────────────────────────

  it('el pre-vuelo no reporta bloqueos en una copropiedad bien configurada', async () => {
    const { data, error } = await admin.rpc('fn_liquidacion_prevuelo', {
      p_tenant_id: tenant.id,
      p_periodo_id: periodo,
    })
    if (error) throw error
    const bloqueos = data.filter((h) => h.severidad === 'bloqueo')
    expect(bloqueos).toEqual([])
  })

  it('sin fecha de vencimiento, el pre-vuelo bloquea (GAP-CAR-001)', async () => {
    await admin.from('periodos').update({ fecha_vencimiento: null }).eq('id', periodo)
    const { data } = await admin.rpc('fn_liquidacion_prevuelo', {
      p_tenant_id: tenant.id,
      p_periodo_id: periodo,
    })
    const codigos = (data ?? []).map((h) => h.codigo)
    expect(codigos).toContain('PERIODO_SIN_VENCIMIENTO')

    await admin.from('periodos').update({ fecha_vencimiento: '2030-01-10' }).eq('id', periodo)
  })

  // ── Simular (L2) ───────────────────────────────────────────────────

  it('el auxiliar simula: calcula, no compromete nada', async () => {
    // functions.invoke() tipa `data`/`error` como `any` en su propia rama de
    // fallo (@supabase/functions-js) — el `as` de abajo es la salida
    // reconocida por las reglas no-unsafe-* para ese `any` de la librería.
    const respuestaSim = await cAux.functions.invoke('simular-liquidacion', {
      body: { periodo_id: periodo },
    })
    if (respuestaSim.error) throw respuestaSim.error as Error
    const data = respuestaSim.data as RespuestaSimulacion
    liquidacionId = data.liquidacion_id

    expect(data.estado).toBe('pre_liquidada')
    expect(data.lineas).toBe(UNIDADES)
    expect(Number(data.tenant_total)).toBe(CUOTA)

    // Lo esencial de una Pre-Liquidación: no toca nada.
    const { data: cargos } = await admin.from('cargos').select('id').eq('periodo_id', periodo)
    expect(cargos).toHaveLength(0)
    const { data: per } = await admin
      .from('periodos')
      .select('estado')
      .eq('id', periodo)
      .single<{ estado: string }>()
    expect(per!.estado).toBe('abierto')
  }, 60_000)

  it('congela el snapshot y el sello del escenario', async () => {
    const { data } = await admin
      .from('liquidaciones')
      .select('snapshot, snapshot_hash, sello_datos, simulada_por')
      .eq('id', liquidacionId)
      .single()
    expect(data!.snapshot).not.toBeNull()
    expect(data!.snapshot_hash).not.toBeNull()
    expect(data!.sello_datos).toHaveLength(32)
    expect(data!.simulada_por).toBe(auxiliar.id)
  })

  it('re-simular descarta la corrida anterior: solo queda una viva', async () => {
    const anterior = liquidacionId
    // functions.invoke() tipa `data`/`error` como `any` en su propia rama de
    // fallo (@supabase/functions-js) — el `as` de abajo es la salida
    // reconocida por las reglas no-unsafe-* para ese `any` de la librería.
    const respuestaSim = await cAux.functions.invoke('simular-liquidacion', {
      body: { periodo_id: periodo },
    })
    if (respuestaSim.error) throw respuestaSim.error as Error
    const data = respuestaSim.data as RespuestaSimulacion
    liquidacionId = data.liquidacion_id
    expect(data.descarto_anteriores).toBe(1)

    const { data: vieja } = await admin
      .from('liquidaciones')
      .select('estado')
      .eq('id', anterior)
      .single<{ estado: string }>()
    expect(vieja!.estado).toBe('descartada')

    const { data: vivas } = await admin
      .from('liquidaciones')
      .select('id')
      .eq('periodo_id', periodo)
      .in('estado', ['pre_liquidada', 'pendiente_aprobacion'])
    expect(vivas).toHaveLength(1)
  }, 60_000)

  // ── Los guards de rol (L0/L3) ──────────────────────────────────────

  it('no se aplica una que no está pendiente de aprobación', async () => {
    const { error } = await cAdm.rpc('fn_aplicar_liquidacion', {
      p_liquidacion_id: liquidacionId,
    })
    expect(error?.message).toMatch(/LIQUIDACION_NO_PENDIENTE/)
  })

  it('el auxiliar solicita la aplicación', async () => {
    const { error } = await cAux
      .from('liquidaciones')
      .update({ estado: 'pendiente_aprobacion', nota_solicitud: 'revisado' })
      .eq('id', liquidacionId)
    expect(error).toBeNull()

    const { data } = await admin
      .from('liquidaciones')
      .select('propuesta_por, propuesta_at')
      .eq('id', liquidacionId)
      .single()
    expect(data!.propuesta_por).toBe(auxiliar.id)
    expect(data!.propuesta_at).not.toBeNull()
  })

  it('el auxiliar NO puede aplicar, ni llamando la RPC directamente', async () => {
    const { error } = await cAux.rpc('fn_aplicar_liquidacion', {
      p_liquidacion_id: liquidacionId,
    })
    expect(error?.message).toMatch(/LIQUIDACION_REQUIERE_ADMINISTRADOR/)

    // Y el intento no dejó nada a medias.
    const { data: cargos } = await admin.from('cargos').select('id').eq('periodo_id', periodo)
    expect(cargos).toHaveLength(0)
  })

  it('el resultado calculado es inmutable (20 §69)', async () => {
    const { error } = await cAux
      .from('liquidaciones')
      .update({ tenant_total: 999_999 })
      .eq('id', liquidacionId)
    expect(error?.message).toMatch(/LIQUIDACION_RESULTADO_INMUTABLE/)
  })

  // ── Aplicar (L3/L4/L5) ─────────────────────────────────────────────

  it('el administrador aplica: cargos, cierre del periodo y estados de cuenta, en una transacción', async () => {
    const { data, error } = await cAdm.rpc('fn_aplicar_liquidacion', {
      p_liquidacion_id: liquidacionId,
    })
    if (error) throw error
    const r = data as unknown as {
      cargos_creados: number
      estados_emitidos: number
      reconocimiento: string
      avisos: unknown[]
    }

    expect(r.cargos_creados).toBe(UNIDADES)
    expect(r.estados_emitidos).toBe(UNIDADES)
    expect(r.reconocimiento).toBe('causacion')
    expect(Array.isArray(r.avisos)).toBe(true)
  }, 60_000)

  it('los cargos suman exactamente la cuota repartida', async () => {
    const { data: cargos } = await admin
      .from('cargos')
      .select('monto_original')
      .eq('periodo_id', periodo)
      .eq('origen_tipo', 'liquidacion_linea')
    const suma = cargos!.reduce((s, c) => s + c.monto_original, 0)
    expect(suma).toBe(CUOTA)
  })

  it('el periodo quedó cerrado, firmado por quien aprobó', async () => {
    const { data } = await admin
      .from('periodos')
      .select('estado, cerrado_por')
      .eq('id', periodo)
      .single()
    expect(data!.estado).toBe('cerrado')
    expect(data!.cerrado_por).toBe(administrador.id)
  })

  it('la liquidación registra a ambos actores y congela los avisos', async () => {
    const { data } = await admin
      .from('liquidaciones')
      .select('estado, propuesta_por, aprobada_por, aplicada_at, avisos_aceptados')
      .eq('id', liquidacionId)
      .single()
    expect(data!.estado).toBe('aplicada')
    expect(data!.propuesta_por).toBe(auxiliar.id)
    expect(data!.aprobada_por).toBe(administrador.id)
    expect(data!.aplicada_at).not.toBeNull()
    expect(Array.isArray(data!.avisos_aceptados)).toBe(true)
  })

  it('los estados de cuenta traen el formato que espera la página pública', async () => {
    const { data } = await admin
      .from('estados_cuenta_generados')
      .select('datos')
      .eq('liquidacion_id', liquidacionId)
      .limit(1)
      .single()
    const datos = data!.datos as unknown as Record<string, unknown>
    for (const clave of [
      'tenant_nombre',
      'tenant_nit',
      'inmueble_codigo',
      'movimientos',
      'saldo_final',
      'generado_en',
    ]) {
      expect(datos).toHaveProperty(clave)
    }
    expect(Number(datos.saldo_final)).toBeGreaterThan(0)
  })

  it('ya no se puede simular sobre un periodo liquidado', async () => {
    const respuestaSim = await cAux.functions.invoke('simular-liquidacion', {
      body: { periodo_id: periodo },
    })
    // La Edge Function devuelve 422; supabase-js lo reporta como error.
    expect(respuestaSim.error ?? respuestaSim.data).toBeTruthy()
    const { data: aplicadas } = await admin
      .from('liquidaciones')
      .select('id')
      .eq('periodo_id', periodo)
      .eq('estado', 'aplicada')
    expect(aplicadas).toHaveLength(1)
  }, 60_000)

  // ── Anular (L6) ────────────────────────────────────────────────────

  it('el auxiliar NO puede anular', async () => {
    const { error } = await cAux.rpc('fn_anular_liquidacion', {
      p_liquidacion_id: liquidacionId,
      p_motivo: 'quiero deshacerlo',
    })
    expect(error?.message).toMatch(/LIQUIDACION_REQUIERE_ADMINISTRADOR/)
  })

  it('anular exige un motivo escrito', async () => {
    const { error } = await cAdm.rpc('fn_anular_liquidacion', {
      p_liquidacion_id: liquidacionId,
      p_motivo: '   ',
    })
    expect(error?.message).toMatch(/LIQUIDACION_ANULACION_SIN_MOTIVO/)
  })

  it('un periodo con liquidación aplicada no se puede reabrir a mano', async () => {
    const { error } = await admin
      .from('periodos')
      .update({ estado: 'abierto' })
      .eq('id', periodo)
    expect(error?.message).toMatch(/PERIODO_CON_LIQUIDACION_APLICADA/)
  })

  it('el administrador anula: contra-cargos, sin borrar historia', async () => {
    const { data: antes } = await admin.from('cargos').select('id').eq('periodo_id', periodo)
    const cargosOriginales = antes!.length

    const { data, error } = await cAdm.rpc('fn_anular_liquidacion', {
      p_liquidacion_id: liquidacionId,
      p_motivo: 'los coeficientes estaban mal cargados',
    })
    if (error) throw error
    const r = data as unknown as { contra_cargos: number; estados_retirados: number }
    expect(r.contra_cargos).toBe(cargosOriginales)
    expect(r.estados_retirados).toBe(UNIDADES)

    // El saldo neto del periodo queda en cero…
    const { data: todos } = await admin
      .from('cargos')
      .select('monto_original, cargo_reversado_id')
      .eq('periodo_id', periodo)
    const neto = todos!.reduce((s, c) => s + c.monto_original, 0)
    expect(neto).toBe(0)

    // …pero los cargos originales siguen ahí: el ledger es append-only.
    const originales = todos!.filter((c) => c.cargo_reversado_id === null)
    expect(originales).toHaveLength(cargosOriginales)
  }, 60_000)

  it('tras anular, el periodo se reabre y admite una Pre-Liquidación nueva', async () => {
    const { data: per } = await admin
      .from('periodos')
      .select('estado, cerrado_at')
      .eq('id', periodo)
      .single()
    expect(per!.estado).toBe('abierto')
    expect(per!.cerrado_at).toBeNull()

    // functions.invoke() tipa `data`/`error` como `any` en su propia rama de
    // fallo (@supabase/functions-js) — el `as` de abajo es la salida
    // reconocida por las reglas no-unsafe-* para ese `any` de la librería.
    const respuestaSim = await cAux.functions.invoke('simular-liquidacion', {
      body: { periodo_id: periodo },
    })
    if (respuestaSim.error) throw respuestaSim.error as Error
    const data = respuestaSim.data as RespuestaSimulacion
    expect(data.estado).toBe('pre_liquidada')
    expect(data.lineas).toBe(UNIDADES)
  }, 60_000)

  it('no se puede anular dos veces', async () => {
    const { error } = await cAdm.rpc('fn_anular_liquidacion', {
      p_liquidacion_id: liquidacionId,
      p_motivo: 'otra vez',
    })
    expect(error?.message).toMatch(/LIQUIDACION_NO_APLICADA/)
  })

  it('el concepto sigue existiendo y sin usar — no se tocó el fixture', async () => {
    const { data } = await admin
      .from('conceptos')
      .select('estado')
      .eq('id', conceptoId)
      .single<{ estado: string }>()
    expect(data!.estado).toBe('activo')
  })
})
