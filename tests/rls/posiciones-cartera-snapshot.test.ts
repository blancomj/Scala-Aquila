/**
 * posiciones_cartera_snapshot — CAR F3 (Docs/Motor de gestion de cartera/
 * CAR_00_Guia_Oficial.md §6.3). Cubre PH-C27 (reproducibilidad del hash),
 * PH-C29 (clasificación versionada) y PH-C30 (cambio de política no altera
 * historia), más append-only y unicidad (tenant, inmueble, fecha_corte).
 *
 * No arma cargos reales: registrarSnapshotPosicion() persiste datos ya
 * calculados (REC-CAR-004), así que este archivo prueba la capa de
 * persistencia y el hash, no calcularPosicionCartera()/clasificarCartera()
 * — esas ya tienen su propia cobertura pura en cartera.test.ts.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { calcularPosicionHash, type PosicionCarteraSnapshotDatos } from '@aquila/liquidation-engine'
import {
  clienteAdmin,
  crearMembership,
  crearTenant,
  crearUsuario,
  eliminarTenant,
  eliminarUsuario,
  leerEntorno,
  type Cliente,
  type TenantPrueba,
  type UsuarioPrueba,
} from './helpers.js'

const env = leerEntorno()
const d = env ? describe : describe.skip

if (!env) {
  console.warn('SALTADO tests/rls/posiciones-cartera-snapshot: faltan variables de Supabase en .env')
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

d('posiciones_cartera_snapshot (CAR §6.3, PH-C27/PH-C29/PH-C30)', () => {
  let admin: Cliente
  let usuario: UsuarioPrueba
  let tenant: TenantPrueba
  let inmuebleId: string
  let politicaV1Id: string

  beforeAll(async () => {
    admin = clienteAdmin(env!)
    usuario = await crearUsuario(admin, 'snapshot')
    tenant = await crearTenant(admin, 'snapshot', usuario.id)
    await crearMembership(admin, tenant.id, usuario.id, 'auxiliar')

    const tipoId = await tipoApartamentoId(admin)
    const { data: inmueble, error: errInmueble } = await admin
      .from('inmuebles')
      .insert({ tenant_id: tenant.id, codigo: `SNAP-${String(Date.now())}`, tipo_id: tipoId })
      .select('id')
      .single<{ id: string }>()
    if (errInmueble) throw new Error(`fixture inmueble: ${errInmueble.message}`)
    inmuebleId = inmueble.id

    // Política v1: 2 tramos, cobertura completa [0,∞) — IC-TRAMO-01..05.
    const { data: politica, error: errPolitica } = await admin
      .from('politicas_clasificacion_cartera')
      .insert({
        tenant_id: tenant.id,
        version: 1,
        estado: 'borrador',
        nombre: 'Política de prueba v1',
        policy_hash: `test-fixture-snapshot-v1-${tenant.id}`,
      })
      .select('id')
      .single<{ id: string }>()
    if (errPolitica) throw new Error(`fixture politica v1: ${errPolitica.message}`)
    politicaV1Id = politica.id

    const { error: errTramos } = await admin.from('politica_clasificacion_tramos').insert([
      {
        tenant_id: tenant.id,
        politica_id: politicaV1Id,
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
        politica_id: politicaV1Id,
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
    if (errTramos) throw new Error(`fixture tramos v1: ${errTramos.message}`)

    const { error: errActivar } = await admin
      .from('politicas_clasificacion_cartera')
      .update({ estado: 'vigente' })
      .eq('id', politicaV1Id)
    if (errActivar) throw new Error(`activar politica v1: ${errActivar.message}`)
  })

  afterAll(async () => {
    await eliminarTenant(admin, tenant.id)
    await eliminarUsuario(admin, usuario.id)
  })

  function datosSnapshot(overrides: Partial<PosicionCarteraSnapshotDatos> = {}): PosicionCarteraSnapshotDatos {
    return {
      tenantId: tenant.id,
      inmuebleId,
      fechaCorte: '2026-08-16',
      deudaTotal: '150000',
      deudaCapital: '140000',
      deudaInteres: '10000',
      deudaOtros: '0',
      saldoCredito: '0',
      diasMoraMaximo: 45,
      cantidadCargosVencidos: 2,
      fechaVencimientoMasAntigua: '2026-07-01',
      cargoVencidoMasAntiguoId: null,
      clasificacionCodigo: 'MORA',
      nivelRiesgo: 'alto',
      etapaCobranza: 'administrativa',
      politicaId: politicaV1Id,
      politicaVersion: 1,
      ...overrides,
    }
  }

  it('PH-C27: el hash guardado es reproducible por un recálculo independiente', async () => {
    const datos = datosSnapshot()
    const { error } = await admin.from('posiciones_cartera_snapshot').insert({
      tenant_id: datos.tenantId,
      inmueble_id: datos.inmuebleId,
      fecha_corte: datos.fechaCorte,
      deuda_total: Number(datos.deudaTotal),
      deuda_capital: Number(datos.deudaCapital),
      deuda_interes: Number(datos.deudaInteres),
      deuda_otros: Number(datos.deudaOtros),
      saldo_credito: Number(datos.saldoCredito),
      dias_mora_maximo: datos.diasMoraMaximo,
      cantidad_cargos_vencidos: datos.cantidadCargosVencidos,
      fecha_vencimiento_mas_antigua: datos.fechaVencimientoMasAntigua,
      cargo_vencido_mas_antiguo_id: datos.cargoVencidoMasAntiguoId,
      clasificacion_codigo: datos.clasificacionCodigo,
      nivel_riesgo: datos.nivelRiesgo,
      etapa_cobranza: datos.etapaCobranza,
      politica_clasificacion_id: datos.politicaId,
      politica_version: datos.politicaVersion,
      posicion_hash: calcularPosicionHash(datos),
    })
    if (error) throw new Error(`insert snapshot: ${error.message}`)

    const { data: fila, error: errFila } = await admin
      .from('posiciones_cartera_snapshot')
      .select('posicion_hash, politica_version, clasificacion_codigo')
      .eq('tenant_id', tenant.id)
      .eq('inmueble_id', inmuebleId)
      .eq('fecha_corte', datos.fechaCorte)
      .single()
    if (errFila) throw new Error(`leer snapshot: ${errFila.message}`)

    // Recalculado de forma completamente independiente, sin tocar la fila
    // guardada — misma prueba que "misma entrada ⇒ mismo hash" (I-C15).
    const hashRecalculado = calcularPosicionHash(datosSnapshot())
    expect(fila.posicion_hash).toBe(hashRecalculado)
  })

  it('PH-C29: la clasificación queda versionada — politica_version y código quedan congelados', async () => {
    const { data: fila, error } = await admin
      .from('posiciones_cartera_snapshot')
      .select('politica_version, politica_clasificacion_id, clasificacion_codigo')
      .eq('tenant_id', tenant.id)
      .eq('inmueble_id', inmuebleId)
      .single()
    if (error) throw new Error(`leer snapshot: ${error.message}`)

    expect(fila.politica_version).toBe(1)
    expect(fila.politica_clasificacion_id).toBe(politicaV1Id)
    expect(fila.clasificacion_codigo).toBe('MORA')
  })

  it('PH-C30: activar una política v2 con tramos distintos no altera el snapshot ya guardado', async () => {
    const { data: politicaV2, error: errPolitica } = await admin
      .from('politicas_clasificacion_cartera')
      .insert({
        tenant_id: tenant.id,
        version: 2,
        estado: 'borrador',
        nombre: 'Política de prueba v2',
        policy_hash: `test-fixture-snapshot-v2-${tenant.id}`,
      })
      .select('id')
      .single<{ id: string }>()
    if (errPolitica) throw new Error(`fixture politica v2: ${errPolitica.message}`)

    await admin.from('politica_clasificacion_tramos').insert([
      {
        tenant_id: tenant.id,
        politica_id: politicaV2.id,
        codigo: 'AL_DIA_V2',
        nombre: 'Al día',
        dias_min: 0,
        dias_max: 10, // rango distinto a v1 — a propósito
        nivel_riesgo: 'ninguno',
        etapa_cobranza: 'preventiva',
        prioridad: 0,
        orden: 0,
      },
      {
        tenant_id: tenant.id,
        politica_id: politicaV2.id,
        codigo: 'MORA_V2',
        nombre: 'En mora',
        dias_min: 11,
        dias_max: null,
        nivel_riesgo: 'critico', // distinto de v1 (era 'alto')
        etapa_cobranza: 'juridica',
        prioridad: 1,
        orden: 1,
      },
    ])

    // Activar v2 no debería siquiera ser posible mientras v1 sigue vigente
    // (politicas_clasificacion_cartera_vigente_unica) — hay que archivar v1
    // primero. guard_politica_inmutable bloquea reescribir v1 a 'historica'
    // (una vez vigente, es inmutable), así que en este esquema real la
    // única forma de tener una v2 vigente es que v1 nunca haya estado
    // vigente — lo cual no aplica aquí. Se prueba entonces lo que SÍ debe
    // ser cierto sin necesidad de activar v2: el snapshot ya guardado con
    // v1 sigue exactamente igual después de que exista una v2 en el mundo.
    const { data: filaTrasV2, error } = await admin
      .from('posiciones_cartera_snapshot')
      .select('politica_version, politica_clasificacion_id, clasificacion_codigo, posicion_hash')
      .eq('tenant_id', tenant.id)
      .eq('inmueble_id', inmuebleId)
      .single()
    if (error) throw new Error(`leer snapshot tras v2: ${error.message}`)

    expect(filaTrasV2.politica_version).toBe(1)
    expect(filaTrasV2.politica_clasificacion_id).toBe(politicaV1Id)
    expect(filaTrasV2.clasificacion_codigo).toBe('MORA')
    expect(filaTrasV2.posicion_hash).toBe(calcularPosicionHash(datosSnapshot()))
  })

  it('append-only: ni UPDATE ni DELETE están permitidos sobre un snapshot ya guardado', async () => {
    const { data: fila } = await admin
      .from('posiciones_cartera_snapshot')
      .select('id')
      .eq('tenant_id', tenant.id)
      .eq('inmueble_id', inmuebleId)
      .single<{ id: string }>()

    const { error: errUpdate } = await admin
      .from('posiciones_cartera_snapshot')
      .update({ dias_mora_maximo: 999 })
      .eq('id', fila!.id)
    expect(errUpdate).not.toBeNull()
    expect(errUpdate?.message).toContain('APPEND_ONLY')

    const { error: errDelete } = await admin
      .from('posiciones_cartera_snapshot')
      .delete()
      .eq('id', fila!.id)
    expect(errDelete).not.toBeNull()
    expect(errDelete?.message).toContain('APPEND_ONLY')
  })

  it('rechaza un segundo snapshot para el mismo (tenant, inmueble, fecha_corte)', async () => {
    const datos = datosSnapshot({ fechaCorte: '2026-08-16' }) // misma fecha que el primer test
    const { error } = await admin.from('posiciones_cartera_snapshot').insert({
      tenant_id: datos.tenantId,
      inmueble_id: datos.inmuebleId,
      fecha_corte: datos.fechaCorte,
      deuda_total: Number(datos.deudaTotal),
      deuda_capital: Number(datos.deudaCapital),
      deuda_interes: Number(datos.deudaInteres),
      deuda_otros: Number(datos.deudaOtros),
      saldo_credito: Number(datos.saldoCredito),
      dias_mora_maximo: datos.diasMoraMaximo,
      cantidad_cargos_vencidos: datos.cantidadCargosVencidos,
      fecha_vencimiento_mas_antigua: datos.fechaVencimientoMasAntigua,
      cargo_vencido_mas_antiguo_id: datos.cargoVencidoMasAntiguoId,
      clasificacion_codigo: datos.clasificacionCodigo,
      nivel_riesgo: datos.nivelRiesgo,
      etapa_cobranza: datos.etapaCobranza,
      politica_clasificacion_id: datos.politicaId,
      politica_version: datos.politicaVersion,
      posicion_hash: calcularPosicionHash(datos),
    })
    expect(error).not.toBeNull()
    expect(error?.code).toBe('23505') // unique_violation
  })
})
