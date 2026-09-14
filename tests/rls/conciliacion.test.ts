/**
 * extracto_bancario / extracto_linea / conciliacion_propuesta — 20260904170000,
 * motor de conciliación bancaria (Fase 3, Bloque B).
 *
 * SEC-11: aislamiento entre tenants. Y el invariante de §3/§E.5:
 * `authenticated` no puede escribir estado ni crear pagos directamente — solo
 * puede leer. Toda escritura pasa por importar-extracto-bancario/
 * conciliar-linea con service_role.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
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
} from './helpers.js'

const env = leerEntorno()
const d = env ? describe : describe.skip

if (!env) {
  console.warn('SALTADO tests/rls/conciliacion: faltan variables de Supabase en .env')
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

d('RLS de conciliación bancaria', () => {
  let admin: Cliente
  let tenantA: TenantPrueba
  let tenantB: TenantPrueba
  let agenteA: UsuarioPrueba
  let agenteB: UsuarioPrueba
  let inmuebleAId: string
  let extractoAId: string
  let lineaAId: string

  beforeAll(async () => {
    admin = clienteAdmin(env!)
    tenantA = await crearTenant(admin, 'conciliacion-a')
    tenantB = await crearTenant(admin, 'conciliacion-b')
    agenteA = await crearUsuario(admin, 'conciliacion-agente-a')
    agenteB = await crearUsuario(admin, 'conciliacion-agente-b')
    await crearMembership(admin, tenantA.id, agenteA.id, 'auxiliar')
    await crearMembership(admin, tenantB.id, agenteB.id, 'auxiliar')

    const tipoApartamento = await listaTipoId(admin, 'TIPO_INMUEBLE', 'apartamento')
    const { data: inmueble, error: errInmueble } = await admin
      .from('inmuebles')
      .insert({ tenant_id: tenantA.id, codigo: `CON-${String(Date.now())}`, tipo_id: tipoApartamento })
      .select('id')
      .single<{ id: string }>()
    if (errInmueble) throw new Error(`fixture inmueble: ${errInmueble.message}`)
    inmuebleAId = inmueble.id

    // D-CB-2 (Fase 3, 20260935060000): extracto_bancario.cuenta_bancaria_id ya es NOT NULL.
    const entidadFinanciera = await listaTipoId(admin, 'ENTIDAD_FINANCIERA', 'bancolombia')
    const { data: cuentaBancaria, error: errCuenta } = await admin
      .from('cuentas_bancarias')
      .insert({
        tenant_id: tenantA.id, entidad_financiera_id: entidadFinanciera, tipo_cuenta: 'ahorros',
        numero_cuenta: `CONC-RLS-${String(Date.now())}`,
      })
      .select('id')
      .single<{ id: string }>()
    if (errCuenta) throw new Error(`fixture cuenta_bancaria: ${errCuenta.message}`)

    const { data: extracto, error: errExtracto } = await admin
      .from('extracto_bancario')
      .insert({
        tenant_id: tenantA.id,
        cuenta_bancaria_id: cuentaBancaria.id,
        origen: 'banco',
        nombre_archivo: 'extracto-test.csv',
        hash_archivo: `hash-fixture-${String(Date.now())}`,
        lineas_totales: 1,
      })
      .select('id')
      .single<{ id: string }>()
    if (errExtracto) throw new Error(`fixture extracto: ${errExtracto.message}`)
    extractoAId = extracto.id

    const { data: linea, error: errLinea } = await admin
      .from('extracto_linea')
      .insert({
        extracto_id: extractoAId,
        tenant_id: tenantA.id,
        fecha_movimiento: '2027-04-01',
        monto: 100_000,
        descripcion_banco: 'TRANSFERENCIA DE PRUEBA',
        hash_linea: `hashlinea-fixture-${String(Date.now())}`,
      })
      .select('id')
      .single<{ id: string }>()
    if (errLinea) throw new Error(`fixture linea: ${errLinea.message}`)
    lineaAId = linea.id
  }, 60_000)

  afterAll(async () => {
    if (!env) return
    await eliminarTenant(admin, tenantA.id)
    await eliminarTenant(admin, tenantB.id)
    await eliminarUsuario(admin, agenteA.id)
    await eliminarUsuario(admin, agenteB.id)
  }, 60_000)

  it('un miembro ve el extracto y sus líneas de su copropiedad', async () => {
    const cliente = await clienteComo(env!, agenteA)
    const { data: extractos } = await cliente.from('extracto_bancario').select('id').eq('id', extractoAId)
    expect(extractos?.map((e) => e.id)).toContain(extractoAId)
    const { data: lineas } = await cliente.from('extracto_linea').select('id').eq('id', lineaAId)
    expect(lineas?.map((l) => l.id)).toContain(lineaAId)
  })

  it('SEC-11 · el tenant B no ve el extracto ni las líneas del tenant A', async () => {
    const cliente = await clienteComo(env!, agenteB)
    const { data: extractos } = await cliente.from('extracto_bancario').select('id').eq('id', extractoAId)
    expect(extractos ?? []).toHaveLength(0)
    const { data: lineas } = await cliente.from('extracto_linea').select('id').eq('id', lineaAId)
    expect(lineas ?? []).toHaveLength(0)
  })

  it('`authenticated` no puede insertar un extracto directamente', async () => {
    const cliente = await clienteComo(env!, agenteA)
    const { error } = await cliente.from('extracto_bancario').insert({
      tenant_id: tenantA.id,
      origen: 'banco',
      nombre_archivo: 'inyectado.csv',
      hash_archivo: 'hash-inyectado',
      lineas_totales: 0,
    })
    expect(error).not.toBeNull()
  })

  it('`authenticated` no puede cambiar el estado de una línea directamente', async () => {
    // Es el efecto de seguridad central del módulo (§E.5/§3): decidir el
    // estado de una línea decide si se crea un pago real. Sin política de
    // UPDATE (y con force RLS), Postgres no lanza error: silenciosamente
    // afecta cero filas — se verifica que la fila NO cambió, no un error.
    const cliente = await clienteComo(env!, agenteA)
    const { data: actualizadas } = await cliente
      .from('extracto_linea')
      .update({ estado: 'conciliada_manual' })
      .eq('id', lineaAId)
      .select('id')
    expect(actualizadas ?? []).toHaveLength(0)

    const { data: tras } = await admin
      .from('extracto_linea')
      .select('estado')
      .eq('id', lineaAId)
      .single<{ estado: string }>()
    expect(tras?.estado).toBe('pendiente')
  })

  it('`authenticated` no puede insertar una propuesta de conciliación', async () => {
    const cliente = await clienteComo(env!, agenteA)
    const { error } = await cliente.from('conciliacion_propuesta').insert({
      tenant_id: tenantA.id,
      linea_id: lineaAId,
      inmueble_id: inmuebleAId,
      metodo: 'heuristico',
      score: 0.9,
      explicacion: [{ factor: 'x', detalle: 'y', aporte: 0.9 }],
    })
    expect(error).not.toBeNull()
  })

  it('una línea ya resuelta es terminal (guard_conciliacion_transicion)', async () => {
    // Se resuelve con admin (bypassa RLS, pero no el trigger) para probar el
    // guard en sí, no la política.
    await admin
      .from('extracto_linea')
      .update({ estado: 'descartada', descartada_motivo: 'prueba de terminalidad' })
      .eq('id', lineaAId)

    const { error } = await admin
      .from('extracto_linea')
      .update({ estado: 'pendiente' })
      .eq('id', lineaAId)
    expect(error?.message).toContain('CONCILIACION_LINEA_YA_RESUELTA')
  })

  it('el CHECK de coherencia de estado rechaza descartada sin motivo', async () => {
    const { error } = await admin.from('extracto_linea').insert({
      extracto_id: extractoAId,
      tenant_id: tenantA.id,
      fecha_movimiento: '2027-04-02',
      monto: 5_000,
      descripcion_banco: 'X',
      hash_linea: `hashlinea-check-${String(Date.now())}`,
      estado: 'descartada',
    })
    expect(error).not.toBeNull()
  })

  it('el CHECK de coherencia de estado rechaza conciliada_auto sin pago_id', async () => {
    const { error } = await admin.from('extracto_linea').insert({
      extracto_id: extractoAId,
      tenant_id: tenantA.id,
      fecha_movimiento: '2027-04-03',
      monto: 5_000,
      descripcion_banco: 'Y',
      hash_linea: `hashlinea-check2-${String(Date.now())}`,
      estado: 'conciliada_auto',
    })
    expect(error).not.toBeNull()
  })
})
