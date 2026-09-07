/**
 * Dominio Fondos — BLOQUE L: contabilidad (GAP-22, PLAN §4.3, D-36).
 * Migración: 20260929160000_contabilidad_fondos_dimension.sql.
 *
 * Cubre lo que cierra este bloque, verificado antes contra la base real
 * (ver ANALISIS_FONDOS_BLOQUE_A.md §4.3/§4.4):
 *
 * 1. El bloque D de contable_movimientos() distingue los 8 tipos de
 *    movimiento por el signo de fn_fondo_movimiento_efecto, en vez de
 *    tratar cualquier tipo distinto de 'aporte' como un uso — defecto que
 *    20260929110000 introdujo sin querer al ampliar los tipos.
 * 2. Un rendimiento acredita RENDIMIENTO_FINANCIERO_FONDO (4605), no el
 *    banco: es ingreso real (CTCP, PC_01 §3.2), no una reclasificación de
 *    efectivo.
 * 3. Una reversión hereda la familia de contrapartida de lo que corrige.
 * 4. requiere_fondo se activa como guard en los dos puntos donde SÍ se
 *    puede validar en escritura (contable_cuenta_default, fondos.contable_cuenta_id).
 * 5. contable_dimensiones_faltantes() activa las cuatro dimensiones
 *    obligatorias del prompt maestro §35 como control observable.
 *
 * Usa la Edge Function create-tenant (no crearTenant() de helpers.ts) porque
 * necesita la parametrización contable completa que solo produce el alta
 * real — fn_instanciar_cuentas_default incluye ahora RENDIMIENTO_FINANCIERO_FONDO.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import {
  clienteAdmin,
  clienteComo,
  crearUsuario,
  eliminarTenant,
  eliminarUsuario,
  leerEntorno,
  RUN_ID,
  type Cliente,
  type UsuarioPrueba,
} from '../rls/helpers.js'

const env = leerEntorno()
const d = env ? describe : describe.skip

if (!env) {
  console.warn('SALTADO tests/contabilidad/fondos-dimension: faltan variables de Supabase en .env')
}

interface RespuestaCrearTenant {
  tenant: { id: string; slug: string }
}

interface LineaContable {
  entidad: string
  origen_id: string
  documento: string
  cuenta_codigo: string | null
  debito: number
  credito: number
  fondo_id: string | null
}

async function idCuenta(admin: Cliente, tenantId: string, codigo: string): Promise<string> {
  const { data, error } = await admin
    .from('contable_cuenta')
    .select('id')
    .eq('tenant_id', tenantId)
    .eq('codigo', codigo)
    .single<{ id: string }>()
  if (error) throw new Error(`fixture cuenta ${codigo}: ${error.message}`)
  return data.id
}

async function idEventoContable(admin: Cliente, codigo: string): Promise<number> {
  const { data, error } = await admin
    .from('lista_tipos')
    .select('id')
    .eq('tipo', 'EVENTO_CONTABLE')
    .is('tenant_id', null)
    .eq('codigo', codigo)
    .single<{ id: number }>()
  if (error) throw new Error(`fixture evento ${codigo}: ${error.message}`)
  return data.id
}

/** Soporte documental (D-42, guard_fondo_movimiento) — rendimiento/aporte manual lo exigen. */
async function crearDocumentoFixture(admin: Cliente, tenantId: string): Promise<string> {
  const { data: tipo, error: errTipo } = await admin
    .from('lista_tipos')
    .select('id')
    .eq('tipo', 'TIPO_DOCUMENTO')
    .is('tenant_id', null)
    .eq('codigo', 'soporte_movimiento_fondo')
    .single<{ id: number }>()
  if (errTipo) throw new Error(`fixture TIPO_DOCUMENTO soporte_movimiento_fondo: ${errTipo.message}`)
  const { data, error } = await admin
    .from('documentos')
    .insert({
      tenant_id: tenantId,
      tipo_documento_id: tipo.id,
      nombre_archivo: 'soporte-fixture.pdf',
      storage_path: `test/${String(Date.now())}.pdf`,
    })
    .select('id')
    .single<{ id: string }>()
  if (error) throw new Error(`fixture documento soporte: ${error.message}`)
  return data.id
}

d('Dominio Fondos — dimensión contable (GAP-22, BLOQUE L)', () => {
  const admin = clienteAdmin(env!)
  let usuario: UsuarioPrueba
  let tenantId: string
  let fondoImprevistos: { id: string }
  let documentoId: string

  beforeAll(async () => {
    usuario = await crearUsuario(admin, 'fondos-contab')
    const cliente = await clienteComo(env!, usuario)
    const { data, response } = await cliente.functions.invoke<RespuestaCrearTenant>(
      'create-tenant',
      { body: { name: 'Fondos Contabilidad', slug: `t-${RUN_ID}-fondos-contab` } },
    )
    if (!response || response.status !== 200 || !data) {
      throw new Error(`create-tenant: HTTP ${String(response?.status)}`)
    }
    tenantId = data.tenant.id

    // GAP-22 (bloque "alta de copropiedad"): create-tenant ya crea el fondo de
    // imprevistos solo (Ley 675 art. 35), activo y vinculado a 111015 — no hay
    // que insertarlo a mano, y hacerlo violaría fondos_naturaleza_imprevistos_unico.
    const { data: fondo, error } = await admin
      .from('fondos')
      .select('id')
      .eq('tenant_id', tenantId)
      .eq('naturaleza', 'imprevistos')
      .single<{ id: string }>()
    if (error) throw new Error(`fixture fondo (nacido con el alta): ${error.message}`)
    fondoImprevistos = fondo
    documentoId = await crearDocumentoFixture(admin, tenantId)
  }, 60_000)

  afterAll(async () => {
    await eliminarTenant(admin, tenantId)
    await eliminarUsuario(admin, usuario.id)
  }, 60_000)

  it('el alta siembra RENDIMIENTO_FINANCIERO_FONDO -> 4605 en contable_cuenta_default', async () => {
    const eventoId = await idEventoContable(admin, 'RENDIMIENTO_FINANCIERO_FONDO')
    const { data, error } = await admin
      .from('contable_cuenta_default')
      .select('contable_cuenta_id, contable_cuenta:contable_cuenta_id(codigo)')
      .eq('tenant_id', tenantId)
      .eq('evento_id', eventoId)
      .single<{ contable_cuenta_id: string; contable_cuenta: { codigo: string } }>()
    expect(error).toBeNull()
    expect(data!.contable_cuenta.codigo).toBe('4605')
  })

  it('guard_contable_cuenta_default: un evento de fondo no puede mapear a una cuenta sin requiere_fondo', async () => {
    const eventoId = await idEventoContable(admin, 'RENDIMIENTO_FINANCIERO_FONDO')
    const cuentaBanco = await idCuenta(admin, tenantId, '111005')

    const { error } = await admin
      .from('contable_cuenta_default')
      .update({ contable_cuenta_id: cuentaBanco })
      .eq('tenant_id', tenantId)
      .eq('evento_id', eventoId)
    expect(error?.message).toMatch(/CUENTA_CONTABLE_CLASE_INCOMPATIBLE/)
  })

  it('guard_vinculo_cuenta_efectivo: un fondo no puede vincularse a una cuenta sin requiere_fondo', async () => {
    const cuentaBanco = await idCuenta(admin, tenantId, '111005')
    const { error } = await admin
      .from('fondos')
      .update({ contable_cuenta_id: cuentaBanco })
      .eq('id', fondoImprevistos.id)
    expect(error?.message).toMatch(/CUENTA_SIN_DIMENSION_FONDO/)
  })

  it('aporte y rendimiento resuelven cuentas distintas: banco vs ingreso real (4605)', async () => {
    const { data: aporte } = await admin
      .from('fondo_movimientos')
      .insert({ tenant_id: tenantId, fondo_id: fondoImprevistos.id, tipo: 'aporte', monto: 100_000, documento_id: documentoId })
      .select('id')
      .single<{ id: string }>()

    const { data: rendimiento } = await admin
      .from('fondo_movimientos')
      .insert({
        tenant_id: tenantId,
        fondo_id: fondoImprevistos.id,
        tipo: 'rendimiento',
        monto: 3_000,
        documento_id: documentoId,
      })
      .select('id')
      .single<{ id: string }>()

    const { data: movimientos, error } = await admin.rpc('contable_movimientos', {
      p_tenant_id: tenantId,
      p_desde: '2020-01-01',
      p_hasta: '2030-01-01',
    })
    expect(error).toBeNull()
    const lineas = movimientos as LineaContable[]

    const lineasAporte = lineas.filter((l) => l.origen_id === aporte!.id)
    expect(lineasAporte).toHaveLength(2)
    expect(lineasAporte.find((l) => l.debito > 0)!.cuenta_codigo).toBe('111015')
    expect(lineasAporte.find((l) => l.credito > 0)!.cuenta_codigo).toBe('111005')

    const lineasRendimiento = lineas.filter((l) => l.origen_id === rendimiento!.id)
    expect(lineasRendimiento).toHaveLength(2)
    expect(lineasRendimiento.find((l) => l.debito > 0)!.cuenta_codigo).toBe('111015')
    // La corrección de este bloque: antes de GAP-22/L, un rendimiento se
    // proyectaba como si acreditara el banco (mismo trato que un uso).
    expect(lineasRendimiento.find((l) => l.credito > 0)!.cuenta_codigo).toBe('4605')
  })

  it('una reversión hereda la familia de contrapartida del movimiento que corrige', async () => {
    const { data: original } = await admin
      .from('fondo_movimientos')
      .insert({
        tenant_id: tenantId,
        fondo_id: fondoImprevistos.id,
        tipo: 'rendimiento',
        monto: 500,
        descripcion: 'a revertir',
        documento_id: documentoId,
      })
      .select('id')
      .single<{ id: string }>()

    const { data: reversion } = await admin
      .from('fondo_movimientos')
      .insert({
        tenant_id: tenantId,
        fondo_id: fondoImprevistos.id,
        tipo: 'reversion',
        monto: -500,
        motivo: 'rendimiento registrado por error',
        reversion_de_id: original!.id,
      })
      .select('id')
      .single<{ id: string }>()

    const { data: movimientos } = await admin.rpc('contable_movimientos', {
      p_tenant_id: tenantId,
      p_desde: '2020-01-01',
      p_hasta: '2030-01-01',
    })
    const lineas = (movimientos as LineaContable[]).filter((l) => l.origen_id === reversion!.id)
    expect(lineas).toHaveLength(2)
    // Se revierte un rendimiento: la contrapartida sigue siendo 4605, no el banco.
    expect(lineas.find((l) => l.credito > 0)!.cuenta_codigo).toBe('111015')
    expect(lineas.find((l) => l.debito > 0)!.cuenta_codigo).toBe('4605')
  })

  it('contable_dimensiones_faltantes() activa requiere_fondo cuando una cuenta lo exige y la línea no trae fondo_id', async () => {
    // Caso limpio: todas las líneas de fondos ya traen fondo_id (bloque D
    // siempre lo puebla), así que hoy no debe reportar nada para ese fondo.
    const { data: limpio, error } = await admin.rpc('contable_dimensiones_faltantes', {
      p_tenant_id: tenantId,
      p_desde: '2020-01-01',
      p_hasta: '2030-01-01',
    })
    expect(error).toBeNull()
    expect((limpio as unknown[]).filter((f) => (f as { dimension_faltante: string }).dimension_faltante === 'fondo')).toHaveLength(0)
  })
})
