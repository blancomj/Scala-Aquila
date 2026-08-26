/**
 * Hueco de test #4 (auditoría externa 2026-08-26, Docs/evaluacion/02 §7) —
 * cambio de coeficiente_set a mitad de año: qué pasa con periodos ya
 * liquidados cuando se reemplaza el set vigente por uno nuevo. La
 * funcionalidad ya existe completa (snapshot congelado en
 * liquidaciones.snapshot, índice único parcial "un solo vigente",
 * guard_coeficiente_set_inmutable) — solo faltaba el test que ejercite el
 * flujo de reemplazo con liquidaciones en ambos lados del cambio.
 *
 * Mismo patrón de reemplazo que apps/web/app/stores/coeficientes.ts::
 * activarCoeficienteSet: dos UPDATE secuenciales (retirar el vigente a
 * 'historica', promover el nuevo a 'vigente') — nunca dos filas vigentes
 * a la vez.
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
  console.warn('SALTADO tests/liquidacion/coeficiente-set-reemplazo: faltan variables de Supabase en .env')
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

interface SnapshotInmuebleParcial {
  readonly codigo: string
  readonly coeficiente: string
}

d('Reemplazo de coeficiente_set a mitad de año (hueco de test #4)', () => {
  const admin = clienteAdmin(env!)
  let auxiliar: UsuarioPrueba | undefined
  let administrador: UsuarioPrueba | undefined
  let tenant: TenantPrueba | undefined
  let cAux: Cliente
  let cAdm: Cliente

  afterAll(async () => {
    if (tenant) await eliminarTenant(admin, tenant.id)
    if (auxiliar) await eliminarUsuario(admin, auxiliar.id)
    if (administrador) await eliminarUsuario(admin, administrador.id)
  })

  it('una liquidación aplicada con el set viejo conserva su coeficiente congelado; una nueva usa el set nuevo', async () => {
    auxiliar = await crearUsuario(admin, 'coef-set-aux')
    administrador = await crearUsuario(admin, 'coef-set-adm')
    tenant = await crearTenant(admin, 'coef-set', auxiliar.id)
    const tenantId = tenant.id
    await crearMembership(admin, tenantId, auxiliar.id, 'auxiliar')
    await crearMembership(admin, tenantId, administrador.id, 'administrador')
    cAux = await clienteComo(env!, auxiliar)
    cAdm = await clienteComo(env!, administrador)

    const tipoId = await tipoApartamentoId(admin)
    const { data: inmueble, error: errInm } = await admin
      .from('inmuebles')
      .insert({ tenant_id: tenantId, codigo: `CS-${String(Date.now())}`, tipo_id: tipoId })
      .select('id')
      .single<{ id: string }>()
    if (errInm) throw new Error(`fixture inmueble: ${errInm.message}`)

    // Set A — vigente desde enero, coeficiente 0.6.
    const { data: setA, error: errSetA } = await admin
      .from('coeficiente_sets')
      .insert({
        tenant_id: tenantId,
        version: 1,
        vigente_desde: '2034-01-01',
        estado: 'borrador',
        suma_total: 0.6,
      })
      .select('id')
      .single<{ id: string }>()
    if (errSetA) throw new Error(`fixture set A: ${errSetA.message}`)
    const { error: errCoefA } = await admin.from('coeficientes').insert({
      tenant_id: tenantId,
      set_id: setA.id,
      inmueble_id: inmueble.id,
      valor: 0.6,
    })
    if (errCoefA) throw new Error(`fixture coeficiente A: ${errCoefA.message}`)
    await admin.from('coeficiente_sets').update({ estado: 'vigente' }).eq('id', setA.id)

    const { error: errPol } = await admin.from('politicas_financieras').insert({
      tenant_id: tenantId,
      version: 1,
      estado: 'vigente',
      vigente_desde: '2034-01-01',
      redondeo_modo: 'half_up',
      redondeo_escala: 0,
      residual_metodo: 'mayor_resto',
      coeficientes_suma_esperada: 0.6,
      policy_hash: 'fixture-coef-set',
    })
    if (errPol) throw new Error(`fixture politica: ${errPol.message}`)

    const { error: errCon } = await admin.from('conceptos').insert({
      tenant_id: tenantId,
      codigo: 'CUOTA_CS',
      nombre: 'Cuota de prueba coeficiente_set',
      modo_calculo: 'distribucion',
      modo_valor: 'fijo',
      valor_fijo: 100_000,
      prioridad: 100,
      estado: 'activo',
      tipo_recurrencia: 'recurrente',
      periodicidad: 'mensual',
      fecha_inicio_anio: 2034,
      fecha_inicio_mes: 1,
      alcance: 'todos',
    })
    if (errCon) throw new Error(`fixture concepto: ${errCon.message}`)

    // ── Enero: simular + solicitar + aplicar CON el set A vigente ──────
    const { data: periodoEnero, error: errPerEnero } = await admin
      .from('periodos')
      .insert({ tenant_id: tenantId, anio: 2034, mes: 1, fecha_vencimiento: '2034-01-10' })
      .select('id')
      .single<{ id: string }>()
    if (errPerEnero) throw new Error(`fixture periodo enero: ${errPerEnero.message}`)

    const { data: simEnero, error: errSimEnero } = await cAux.functions.invoke('simular-liquidacion', {
      body: { periodo_id: periodoEnero.id },
    })
    if (errSimEnero) throw errSimEnero
    const liquidacionEneroId = (simEnero as { liquidacion_id: string }).liquidacion_id

    const { error: errSolicitar } = await cAux
      .from('liquidaciones')
      .update({ estado: 'pendiente_aprobacion', nota_solicitud: 'coef-set' })
      .eq('id', liquidacionEneroId)
    if (errSolicitar) throw new Error(`fixture solicitar: ${errSolicitar.message}`)

    const { error: errAplicar } = await cAdm.rpc('fn_aplicar_liquidacion', {
      p_liquidacion_id: liquidacionEneroId,
    })
    if (errAplicar) throw errAplicar

    // ── Reemplazo: set B (0.9) vigente desde julio, retira A a histórica ──
    const { data: setB, error: errSetB } = await admin
      .from('coeficiente_sets')
      .insert({
        tenant_id: tenantId,
        version: 2,
        vigente_desde: '2034-07-01',
        estado: 'borrador',
        suma_total: 0.9,
      })
      .select('id')
      .single<{ id: string }>()
    if (errSetB) throw new Error(`fixture set B: ${errSetB.message}`)
    const { error: errCoefB } = await admin.from('coeficientes').insert({
      tenant_id: tenantId,
      set_id: setB.id,
      inmueble_id: inmueble.id,
      valor: 0.9,
    })
    if (errCoefB) throw new Error(`fixture coeficiente B: ${errCoefB.message}`)

    // Mismo orden que activarCoeficienteSet: retirar el viejo, luego promover el nuevo.
    const { error: errRetiro } = await admin
      .from('coeficiente_sets')
      .update({ estado: 'historica', vigente_hasta: '2034-06-30' })
      .eq('id', setA.id)
    if (errRetiro) throw new Error(`retiro set A: ${errRetiro.message}`)
    const { error: errPromover } = await admin
      .from('coeficiente_sets')
      .update({ estado: 'vigente' })
      .eq('id', setB.id)
    if (errPromover) throw new Error(`promover set B: ${errPromover.message}`)

    // ── Verificación 1: la liquidación de enero (ya aplicada, con A)
    //    conserva su coeficiente congelado — no se ve afectada por el
    //    reemplazo posterior. Actualizar politicas_financieras/coeficiente_
    //    suma_esperada a 0.9 exigiría una política nueva (inmutable); no
    //    hace falta para esta verificación.
    const { data: liqEnero, error: errLeerEnero } = await admin
      .from('liquidaciones')
      .select('snapshot')
      .eq('id', liquidacionEneroId)
      .single<{ snapshot: { inmuebles: readonly SnapshotInmuebleParcial[] } }>()
    if (errLeerEnero) throw new Error(`leer snapshot enero: ${errLeerEnero.message}`)
    expect(liqEnero.snapshot.inmuebles[0]?.coeficiente).toBe('0.6')

    // ── Verificación 2: una liquidación NUEVA, simulada después del
    //    reemplazo, usa el set B vigente — no vuelve a leer A aunque A
    //    siga existiendo (histórica).
    const { data: periodoJulio, error: errPerJulio } = await admin
      .from('periodos')
      .insert({ tenant_id: tenantId, anio: 2034, mes: 7, fecha_vencimiento: '2034-07-10' })
      .select('id')
      .single<{ id: string }>()
    if (errPerJulio) throw new Error(`fixture periodo julio: ${errPerJulio.message}`)

    const { data: simJulio, error: errSimJulio } = await cAux.functions.invoke('simular-liquidacion', {
      body: { periodo_id: periodoJulio.id },
    })
    if (errSimJulio) throw errSimJulio
    const liquidacionJulioId = (simJulio as { liquidacion_id: string }).liquidacion_id

    const { data: liqJulio, error: errLeerJulio } = await admin
      .from('liquidaciones')
      .select('snapshot')
      .eq('id', liquidacionJulioId)
      .single<{ snapshot: { inmuebles: readonly SnapshotInmuebleParcial[] } }>()
    if (errLeerJulio) throw new Error(`leer snapshot julio: ${errLeerJulio.message}`)
    expect(liqJulio.snapshot.inmuebles[0]?.coeficiente).toBe('0.9')

    // ── Verificación 3: el set A sigue existiendo, histórico, inalterable
    //    (guard_coeficiente_set_inmutable) — no se borró ni se pudo tocar
    //    más allá del único cambio permitido (vigente→historica de arriba).
    const { data: setAHistorico, error: errLeerA } = await admin
      .from('coeficiente_sets')
      .select('estado, vigente_hasta, suma_total')
      .eq('id', setA.id)
      .single<{ estado: string; vigente_hasta: string | null; suma_total: number }>()
    if (errLeerA) throw new Error(`leer set A: ${errLeerA.message}`)
    expect(setAHistorico.estado).toBe('historica')
    expect(setAHistorico.vigente_hasta).toBe('2034-06-30')
    expect(setAHistorico.suma_total).toBe(0.6) // congelado, no se pudo editar.
  }, 60_000)
})
