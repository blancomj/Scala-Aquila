/**
 * ADC-01 (§3.2/§3.3 del informe) — los avisos de "dato sin clasificar" que
 * el motor calcula al evaluar el alcance de un concepto, de punta a punta:
 * aparecen en vivo al simular, y quedan congelados en avisos_aceptados al
 * aplicar — con la misma garantía de auditoría que los avisos de
 * fn_liquidacion_prevuelo (SQL), aunque el cálculo vive en TypeScript.
 *
 * Va contra las dos Edge Functions reales (simular-liquidacion/
 * aplicar-liquidacion), no contra la RPC directa: la RPC por sí sola no
 * sabe nada de alcance, solo recibe el resultado ya calculado — es
 * exactamente lo que este test verifica que SÍ llegue.
 *
 * Tenant propio (mismo criterio que flujo-dos-tiempos.test.ts): un
 * concepto segmentado que excluye deliberadamente una unidad no debe
 * convivir con datos de otros tests en el mismo periodo.
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
  console.warn('SALTADO tests/liquidacion/adc1-avisos-alcance: faltan variables de Supabase en .env')
}

interface RespuestaSimular {
  liquidacion_id: string
  avisos_alcance: { codigo: string; titulo: string; detalle: string }[]
}

interface RespuestaAplicar {
  avisos: { codigo: string; titulo: string; detalle: string }[]
}

async function idListaTipos(admin: Cliente, tipo: string, codigo: string): Promise<number> {
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

d('ADC-01: avisos de alcance por dato sin clasificar', () => {
  const admin = clienteAdmin(env!)
  let administrador: UsuarioPrueba | undefined
  let cAdm: Cliente
  let tenant: TenantPrueba | undefined
  let periodo: string
  let liquidacionId: string

  afterAll(async () => {
    if (tenant) await eliminarTenant(admin, tenant.id)
    if (administrador) await eliminarUsuario(admin, administrador.id)
  })

  it('setup: un local comercial y uno SIN uso_predio clasificado, concepto segmentado por uso_predio=comercial', async () => {
    administrador = await crearUsuario(admin, 'adc1adm')
    tenant = await crearTenant(admin, 'adc1', administrador.id)
    await crearMembership(admin, tenant.id, administrador.id, 'administrador')
    cAdm = await clienteComo(env!, administrador)

    const tipoLocalId = await idListaTipos(admin, 'TIPO_INMUEBLE', 'local')
    const usoComercialId = await idListaTipos(admin, 'USO_PREDIO', 'comercial')

    const { data: inmuebles, error: errInm } = await admin
      .from('inmuebles')
      .insert([
        { tenant_id: tenant.id, codigo: 'ADC1-CLASIFICADO', tipo_id: tipoLocalId, uso_predio_id: usoComercialId },
        // Sin uso_predio_id: el que debe generar el aviso.
        { tenant_id: tenant.id, codigo: 'ADC1-SIN-CLASIFICAR', tipo_id: tipoLocalId },
      ])
      .select('id')
    if (errInm) throw new Error(`fixture inmuebles: ${errInm.message}`)

    const { data: set, error: errSet } = await admin
      .from('coeficiente_sets')
      .insert({ tenant_id: tenant.id, version: 1, vigente_desde: '2030-01-01', estado: 'borrador', suma_total: 1 })
      .select('id')
      .single<{ id: string }>()
    if (errSet) throw new Error(`fixture set: ${errSet.message}`)

    const { error: errCoef } = await admin.from('coeficientes').insert(
      inmuebles.map((i) => ({ tenant_id: tenant!.id, set_id: set.id, inmueble_id: i.id, valor: 0.5 })),
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
      policy_hash: 'fixture-adc1',
    })
    if (errPol) throw new Error(`fixture politica: ${errPol.message}`)

    const { data: per, error: errPer } = await admin
      .from('periodos')
      .insert({ tenant_id: tenant.id, anio: 2030, mes: 2, fecha_vencimiento: '2030-02-10' })
      .select('id')
      .single<{ id: string }>()
    if (errPer) throw new Error(`fixture periodo: ${errPer.message}`)
    periodo = per.id

    const { error: errCon } = await admin.from('conceptos').insert({
      tenant_id: tenant.id,
      codigo: 'VIGILANCIA_COMERCIAL_ADC1',
      nombre: 'Vigilancia comercial (ADC-01 test)',
      modo_calculo: 'directo',
      modo_valor: 'fijo',
      valor_fijo: 50_000,
      prioridad: 100,
      estado: 'activo',
      tipo_recurrencia: 'recurrente',
      periodicidad: 'mensual',
      fecha_inicio_anio: 2030,
      fecha_inicio_mes: 1,
      alcance: 'calculado',
      alcance_condiciones: { campo: 'uso_predio', operador: 'eq', valor: 'comercial' },
    })
    if (errCon) throw new Error(`fixture concepto: ${errCon.message}`)
  }, 60_000)

  it('simular: el inmueble sin uso_predio queda fuera del alcance Y el aviso llega en la respuesta', async () => {
    const { data, error } = await cAdm.functions.invoke<RespuestaSimular>('simular-liquidacion', {
      body: { periodo_id: periodo },
    })
    if (error) throw error
    liquidacionId = data!.liquidacion_id

    expect(data!.avisos_alcance).toHaveLength(1)
    expect(data!.avisos_alcance[0]?.codigo).toBe('ALCANCE_DATO_SIN_CLASIFICAR_VIGILANCIA_COMERCIAL_ADC1')
    expect(data!.avisos_alcance[0]?.titulo).toContain('1 inmueble(s)')
    expect(data!.avisos_alcance[0]?.detalle).toContain('uso_predio')

    // El motor no lo excluyó por accidente: la línea que sí se generó es la
    // del inmueble clasificado, con el monto fijo completo (alcance='calculado'
    // + modo_calculo='directo' no reparte, cada uno recibe el valor entero).
    const { data: lineas } = await admin
      .from('liquidacion_lineas')
      .select('inmueble_id, monto, inmuebles!inner(codigo)')
      .eq('liquidacion_id', liquidacionId)
    expect(lineas).toHaveLength(1)
    expect((lineas![0] as unknown as { inmuebles: { codigo: string } }).inmuebles.codigo).toBe('ADC1-CLASIFICADO')
  })

  it('aplicar (vía Edge Function, no la RPC directa): el aviso queda congelado en avisos_aceptados', async () => {
    await cAdm.from('liquidaciones').update({ estado: 'pendiente_aprobacion' }).eq('id', liquidacionId)

    const { data, error } = await cAdm.functions.invoke<RespuestaAplicar>('aplicar-liquidacion', {
      body: { liquidacion_id: liquidacionId },
    })
    if (error) throw error

    expect(data!.avisos.map((a) => a.codigo)).toContain('ALCANCE_DATO_SIN_CLASIFICAR_VIGILANCIA_COMERCIAL_ADC1')

    const { data: liq } = await admin
      .from('liquidaciones')
      .select('avisos_aceptados')
      .eq('id', liquidacionId)
      .single()
    const codigos = (liq!.avisos_aceptados as { codigo: string }[]).map((a) => a.codigo)
    expect(codigos).toContain('ALCANCE_DATO_SIN_CLASIFICAR_VIGILANCIA_COMERCIAL_ADC1')
  }, 60_000)
})
