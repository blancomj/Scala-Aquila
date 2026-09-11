/**
 * ADC-01 (§36 Caso 8 "relación múltiple") — un mismo inmueble puede tener
 * VARIOS roles de persona simultáneos vigentes en `inmueble_persona_rol`
 * (copropietario x2 + arrendatario + inquilino + apoderado + codeudor, los
 * 8 códigos reales de PERSONA_PREDIO no se agotan en propietario/inquilino).
 * Esto NO debe duplicar la fila del inmueble en el snapshot ni en las líneas
 * de liquidación, y `resolverAtributosInmueble` (snapshot-supabase.ts) debe
 * resolver el desempate documentado: copropietario → mayor porcentaje;
 * arrendatario/inquilino → vigente_desde más reciente. apoderado/codeudor
 * no participan en ninguno de los dos campos (no hay condición de alcance
 * sobre ellos) pero deben coexistir sin romper la resolución.
 *
 * Va contra simular-liquidacion (Edge Function real) — igual criterio que
 * adc1-avisos-alcance.test.ts y adc1-cambio-uso-historico.test.ts.
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
  console.warn('SALTADO tests/liquidacion/adc1-relacion-multiple: faltan variables de Supabase en .env')
}

interface RespuestaSimular {
  liquidacion_id: string
  avisos_alcance: { codigo: string; titulo: string; detalle: string }[]
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

async function crearTercero(
  admin: Cliente,
  tenantId: string,
  codigo: string,
  tipoPersona: 'natural' | 'juridica',
): Promise<string> {
  const tipoIdent = await idListaTipos(admin, 'TIPO_IDENTIFICACION', tipoPersona === 'natural' ? 'cedula' : 'nit')
  const estadoActivo = await idListaTipos(admin, 'ESTADO_TERCERO', 'activo')
  const sello = `${codigo}-${String(Date.now())}`
  const datosPersona =
    tipoPersona === 'natural'
      ? { primer_nombre: 'Prueba', primer_apellido: codigo }
      : { razon_social: `Prueba ${codigo} SAS` }
  const { data, error } = await admin
    .from('terceros')
    .insert({
      tenant_id: tenantId,
      tipo_identificacion_id: tipoIdent,
      numero_documento: sello,
      tipo_persona: tipoPersona,
      email: `${sello}@example.test`,
      estado_id: estadoActivo,
      ...datosPersona,
    })
    .select('id')
    .single<{ id: string }>()
  if (error) throw new Error(`fixture tercero ${codigo}: ${error.message}`)
  return data.id
}

d('ADC-01 (§36 Caso 8): relación múltiple — varios roles simultáneos en un inmueble', () => {
  const admin = clienteAdmin(env!)
  let administrador: UsuarioPrueba | undefined
  let cAdm: Cliente
  let tenant: TenantPrueba | undefined
  let inmuebleId: string
  let periodoId: string

  afterAll(async () => {
    if (tenant) await eliminarTenant(admin, tenant.id)
    if (administrador) await eliminarUsuario(admin, administrador.id)
  })

  it('setup: un inmueble con 6 roles de persona simultáneos (2 copropietarios + arrendatario + inquilino + apoderado + codeudor)', async () => {
    administrador = await crearUsuario(admin, 'adc1rm')
    tenant = await crearTenant(admin, 'adc1rm', administrador.id)
    await crearMembership(admin, tenant.id, administrador.id, 'administrador')
    cAdm = await clienteComo(env!, administrador)

    const tipoApartamentoId = await idListaTipos(admin, 'TIPO_INMUEBLE', 'apartamento')
    const { data: inmueble, error: errInm } = await admin
      .from('inmuebles')
      .insert({ tenant_id: tenant.id, codigo: 'RM-1', tipo_id: tipoApartamentoId })
      .select('id')
      .single<{ id: string }>()
    if (errInm) throw new Error(`fixture inmueble: ${errInm.message}`)
    inmuebleId = inmueble.id

    const copropMinoritario = await crearTercero(admin, tenant.id, 'coprop-minoritario', 'natural')
    const copropMayoritario = await crearTercero(admin, tenant.id, 'coprop-mayoritario', 'juridica')
    const arrendatarioViejo = await crearTercero(admin, tenant.id, 'arrendatario-viejo', 'natural')
    const inquilinoReciente = await crearTercero(admin, tenant.id, 'inquilino-reciente', 'juridica')
    const apoderado = await crearTercero(admin, tenant.id, 'apoderado', 'natural')
    const codeudor = await crearTercero(admin, tenant.id, 'codeudor', 'natural')

    const rolCopropietario = await idListaTipos(admin, 'PERSONA_PREDIO', 'copropietario')
    const rolArrendatario = await idListaTipos(admin, 'PERSONA_PREDIO', 'arrendatario')
    const rolInquilino = await idListaTipos(admin, 'PERSONA_PREDIO', 'inquilino')
    const rolApoderado = await idListaTipos(admin, 'PERSONA_PREDIO', 'apoderado')
    const rolCodeudor = await idListaTipos(admin, 'PERSONA_PREDIO', 'codeudor')

    const base = { tenant_id: tenant.id, inmueble_id: inmuebleId, es_pagador: false, recibe_notificaciones: false }
    const { error: errRel } = await admin.from('inmueble_persona_rol').insert([
      { ...base, tercero_id: copropMinoritario, rol_id: rolCopropietario, porcentaje: 30, vigente_desde: '2020-01-01' },
      { ...base, tercero_id: copropMayoritario, rol_id: rolCopropietario, porcentaje: 70, vigente_desde: '2020-01-01' },
      { ...base, tercero_id: arrendatarioViejo, rol_id: rolArrendatario, vigente_desde: '2021-01-01' },
      { ...base, tercero_id: inquilinoReciente, rol_id: rolInquilino, vigente_desde: '2022-06-01' },
      { ...base, tercero_id: apoderado, rol_id: rolApoderado, vigente_desde: '2020-01-01' },
      { ...base, tercero_id: codeudor, rol_id: rolCodeudor, vigente_desde: '2020-01-01' },
    ])
    if (errRel) throw new Error(`fixture inmueble_persona_rol: ${errRel.message}`)

    const { data: set, error: errSet } = await admin
      .from('coeficiente_sets')
      .insert({ tenant_id: tenant.id, version: 1, vigente_desde: '2030-01-01', estado: 'borrador', suma_total: 1 })
      .select('id')
      .single<{ id: string }>()
    if (errSet) throw new Error(`fixture set: ${errSet.message}`)
    const { error: errCoef } = await admin
      .from('coeficientes')
      .insert({ tenant_id: tenant.id, set_id: set.id, inmueble_id: inmuebleId, valor: 1 })
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
      policy_hash: 'fixture-adc1rm',
    })
    if (errPol) throw new Error(`fixture politica: ${errPol.message}`)

    const { data: per, error: errPer } = await admin
      .from('periodos')
      .insert({ tenant_id: tenant.id, anio: 2030, mes: 3, fecha_vencimiento: '2030-03-10' })
      .select('id')
      .single<{ id: string }>()
    if (errPer) throw new Error(`fixture periodo: ${errPer.message}`)
    periodoId = per.id

    // Dos conceptos segmentados: uno por tipo_propietario=juridica (debe
    // ganar el copropietario MAYORITARIO, que es jurídico) y otro por
    // tipo_inquilino=juridica (debe ganar el inquilino MÁS RECIENTE, que
    // también es jurídico) — si el desempate estuviera mal (p.ej. tomara el
    // primero insertado o el de menor porcentaje/más antiguo), alguno de los
    // dos NO incluiría el inmueble.
    const { error: errCon1 } = await admin.from('conceptos').insert({
      tenant_id: tenant.id,
      codigo: 'PROPIETARIO_JURIDICO_RM',
      nombre: 'Segmentado por propietario jurídico (RM test)',
      modo_calculo: 'directo',
      modo_valor: 'fijo',
      valor_fijo: 10_000,
      prioridad: 100,
      estado: 'activo',
      tipo_recurrencia: 'recurrente',
      periodicidad: 'mensual',
      fecha_inicio_anio: 2030,
      fecha_inicio_mes: 1,
      alcance: 'calculado',
      alcance_condiciones: { campo: 'tipo_propietario', operador: 'eq', valor: 'juridica' },
    })
    if (errCon1) throw new Error(`fixture concepto propietario: ${errCon1.message}`)

    const { error: errCon2 } = await admin.from('conceptos').insert({
      tenant_id: tenant.id,
      codigo: 'INQUILINO_JURIDICO_RM',
      nombre: 'Segmentado por inquilino jurídico (RM test)',
      modo_calculo: 'directo',
      modo_valor: 'fijo',
      valor_fijo: 20_000,
      prioridad: 100,
      estado: 'activo',
      tipo_recurrencia: 'recurrente',
      periodicidad: 'mensual',
      fecha_inicio_anio: 2030,
      fecha_inicio_mes: 1,
      alcance: 'calculado',
      alcance_condiciones: { campo: 'tipo_inquilino', operador: 'eq', valor: 'juridica' },
    })
    if (errCon2) throw new Error(`fixture concepto inquilino: ${errCon2.message}`)
  }, 60_000)

  it('el inmueble aparece UNA sola vez por concepto — 6 roles simultáneos no duplican la fila', async () => {
    const { data, response } = await cAdm.functions.invoke<RespuestaSimular>('simular-liquidacion', {
      body: { periodo_id: periodoId },
    })
    if (!response || response.status !== 200 || !data) {
      throw new Error(`simular-liquidacion: HTTP ${String(response?.status)}`)
    }

    expect(data.avisos_alcance).toHaveLength(0)

    const { data: lineas } = await admin
      .from('liquidacion_lineas')
      .select('inmueble_id, monto, concepto_id, conceptos!inner(codigo)')
      .eq('liquidacion_id', data.liquidacion_id)
      .order('monto', { ascending: true })
    const filas = lineas as unknown as { inmueble_id: string; monto: number; conceptos: { codigo: string } }[]

    // Ambos conceptos segmentados incluyen el inmueble — el desempate de
    // copropietario (mayor %) y de inquilino (más reciente) resolvieron
    // ambos a "juridica" — y cada uno exactamente UNA vez (sin duplicar).
    expect(filas).toHaveLength(2)
    expect(filas.every((f) => f.inmueble_id === inmuebleId)).toBe(true)
    expect(filas.map((f) => f.conceptos.codigo)).toEqual(['PROPIETARIO_JURIDICO_RM', 'INQUILINO_JURIDICO_RM'])
  })
})
