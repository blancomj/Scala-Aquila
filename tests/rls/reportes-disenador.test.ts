/**
 * RPT-02 — el diseñador escribe, así que lo que importa es qué NO deja hacer
 * (migración 20260939000000).
 *
 * Con RPT-01 la única escritura era la bitácora de ejecuciones; ahora la
 * aplicación crea reportes, guarda borradores y publica. Eso convierte en
 * relevante algo que antes no lo era: `del_sistema` solo estaba protegido
 * contra DELETE, de modo que cualquiera podía crear un reporte marcándolo de
 * fábrica y quedarse con una fila que ya no podía borrar.
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
  console.warn('SALTADO tests/rls/reportes-disenador: faltan variables de Supabase en .env')
}

const DEFINICION = {
  fuente: 'recaudos',
  campos: [{ campo: 'inmueble' }, { campo: 'monto' }],
  orden: [{ campo: 'inmueble', direccion: 'asc' }],
}

d('RPT-02 · diseñador', () => {
  let admin: Cliente
  let tenant: TenantPrueba
  let auxiliar: UsuarioPrueba
  let auditor: UsuarioPrueba
  let cliente: Cliente

  beforeAll(async () => {
    admin = clienteAdmin(env!)
    tenant = await crearTenant(admin, 'rpt2')
    auxiliar = await crearUsuario(admin, 'rpt2-auxiliar')
    auditor = await crearUsuario(admin, 'rpt2-auditor')
    await crearMembership(admin, tenant.id, auxiliar.id, 'auxiliar')
    await crearMembership(admin, tenant.id, auditor.id, 'auditor')
    cliente = await clienteComo(env!, auxiliar)
  }, 60_000)

  afterAll(async () => {
    if (!env) return
    await eliminarTenant(admin, tenant.id)
    await eliminarUsuario(admin, auxiliar.id)
    await eliminarUsuario(admin, auditor.id)
  }, 60_000)

  it('un auxiliar crea un reporte propio con su primera versión en borrador', async () => {
    const { data: reporte, error } = await cliente
      .from('reportes')
      .insert({ tenant_id: tenant.id, codigo: 'MIO-001', nombre: 'Recaudos por unidad' })
      .select('id, del_sistema')
      .single<{ id: string; del_sistema: boolean }>()

    expect(error).toBeNull()
    expect(reporte!.del_sistema).toBe(false)

    const { error: errorVersion } = await cliente.from('reporte_versiones').insert({
      tenant_id: tenant.id,
      reporte_id: reporte!.id,
      version: 1,
      estado: 'borrador',
      definicion: DEFINICION,
    })
    expect(errorVersion).toBeNull()
  })

  it('no puede crear un reporte marcándolo como de fábrica', async () => {
    const { error } = await cliente
      .from('reportes')
      .insert({
        tenant_id: tenant.id,
        codigo: 'FALSO-SISTEMA',
        nombre: 'Intento de reporte de fábrica',
        del_sistema: true,
      })
    // Sin esta política, la fila se creaba y después ni su autor podía borrarla.
    expect(error?.code).toBe('42501')
  })

  it('no puede editar un reporte de fábrica ni su definición', async () => {
    const { data: fabrica } = await cliente
      .from('reportes')
      .select('id, nombre, reporte_versiones(id, definicion)')
      .eq('del_sistema', true)
      .limit(1)
      .single<{ id: string; nombre: string; reporte_versiones: { id: string }[] }>()

    await cliente.from('reportes').update({ nombre: 'Renombrado a la fuerza' }).eq('id', fabrica!.id)
    const { data: despues } = await cliente
      .from('reportes')
      .select('nombre')
      .eq('id', fabrica!.id)
      .single<{ nombre: string }>()
    // La RLS filtra en vez de lanzar: se comprueba la fila, no el error.
    expect(despues!.nombre).toBe(fabrica!.nombre)

    await cliente
      .from('reporte_versiones')
      .update({ definicion: { fuente: 'recaudos', campos: [] } })
      .eq('id', fabrica!.reporte_versiones[0]!.id)
    const { data: version } = await cliente
      .from('reporte_versiones')
      .select('definicion')
      .eq('id', fabrica!.reporte_versiones[0]!.id)
      .single<{ definicion: { campos: unknown[] } }>()
    expect(version!.definicion.campos.length).toBeGreaterThan(0)
  })

  it('el auditor no puede crear reportes', async () => {
    const clienteAuditor = await clienteComo(env!, auditor)
    const { error } = await clienteAuditor
      .from('reportes')
      .insert({ tenant_id: tenant.id, codigo: 'AUDITOR-001', nombre: 'No debería existir' })
    expect(error?.code).toBe('42501')
  })

  it('el ciclo completo: borrador → publicada → versión siguiente', async () => {
    const { data: reporte } = await cliente
      .from('reportes')
      .insert({ tenant_id: tenant.id, codigo: 'CICLO-001', nombre: 'Ciclo de versiones' })
      .select('id')
      .single<{ id: string }>()

    const { data: v1 } = await cliente
      .from('reporte_versiones')
      .insert({
        tenant_id: tenant.id,
        reporte_id: reporte!.id,
        version: 1,
        estado: 'borrador',
        definicion: DEFINICION,
      })
      .select('id')
      .single<{ id: string }>()

    // Un borrador se edita cuantas veces haga falta.
    const { error: errorBorrador } = await cliente
      .from('reporte_versiones')
      .update({ definicion: { ...DEFINICION, campos: [{ campo: 'inmueble' }] } })
      .eq('id', v1!.id)
    expect(errorBorrador).toBeNull()

    const { error: errorPublicar } = await cliente
      .from('reporte_versiones')
      .update({ estado: 'publicada', publicada_at: new Date().toISOString() })
      .eq('id', v1!.id)
    expect(errorPublicar).toBeNull()

    // Y a partir de ahí no.
    const { error: errorInmutable } = await cliente
      .from('reporte_versiones')
      .update({ definicion: { fuente: 'recaudos', campos: [] } })
      .eq('id', v1!.id)
    expect(errorInmutable?.message).toContain('RPT_VERSION_PUBLICADA_INMUTABLE')

    // La versión siguiente nace en borrador, sin tocar la publicada.
    const { data: v2, error: errorV2 } = await cliente
      .from('reporte_versiones')
      .insert({
        tenant_id: tenant.id,
        reporte_id: reporte!.id,
        version: 2,
        estado: 'borrador',
        definicion: DEFINICION,
      })
      .select('id, version, estado')
      .single<{ id: string; version: number; estado: string }>()

    expect(errorV2).toBeNull()
    expect(v2!.version).toBe(2)

    const { data: v1Final } = await cliente
      .from('reporte_versiones')
      .select('estado, definicion')
      .eq('id', v1!.id)
      .single<{ estado: string; definicion: { campos: unknown[] } }>()
    expect(v1Final!.estado).toBe('publicada')
    expect(v1Final!.definicion.campos).toHaveLength(1)
  }, 60_000)

  it('la vista previa del diseñador no deja rastro en el historial', async () => {
    const { count: antes } = await cliente
      .from('reporte_ejecuciones')
      .select('id', { count: 'exact', head: true })
      .eq('tenant_id', tenant.id)

    // Es la misma llamada que hace previsualizar(): ejecutar sin registrar.
    const { error } = await cliente.rpc('fn_reporte_ejecutar', {
      p_definicion: DEFINICION as never,
      p_tenant_id: tenant.id,
      p_limite: 100,
    })
    expect(error).toBeNull()

    const { count: despues } = await cliente
      .from('reporte_ejecuciones')
      .select('id', { count: 'exact', head: true })
      .eq('tenant_id', tenant.id)
    expect(despues ?? 0).toBe(antes ?? 0)
  })

  it('los valores sugeridos de un filtro salen del propio compilador', async () => {
    // El diseñador no tiene una RPC aparte para esto: agrupa por el campo con
    // fn_reporte_ejecutar, así que hereda catálogo y RLS sin código nuevo.
    const { data, error } = await cliente.rpc('fn_reporte_ejecutar', {
      p_definicion: {
        fuente: 'recaudos',
        campos: [{ campo: 'forma_pago' }],
        agrupar: ['forma_pago'],
        orden: [{ campo: 'forma_pago', direccion: 'asc' }],
      } as never,
      p_tenant_id: tenant.id,
      p_limite: 200,
    })

    expect(error).toBeNull()
    const resultado = data as unknown as { filas: Record<string, unknown>[] }
    // Tenant recién creado: sin pagos, la lista llega vacía y el filtro se
    // escribe a mano — no es un error.
    expect(Array.isArray(resultado.filas)).toBe(true)
  })
})
