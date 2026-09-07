/**
 * PC-3c (20260903120000) — el alta de una copropiedad deja la
 * parametrización contable completa.
 *
 * Por qué este test no existía y el hueco pasó desapercibido: los fixtures
 * de tests/rls/helpers.ts crean tenants con un INSERT directo sobre
 * `tenants`, que es lo correcto para probar RLS pero se salta
 * create_tenant() por completo. Ninguna prueba automatizada recorría el
 * alta real, así que nadie notó que PC-3 había sembrado sus dos puentes
 * (evento -> cuenta y cuenta presupuestal -> cuenta contable) con bloques
 * de una sola corrida en vez de engancharlos al alta. Resultado: toda
 * copropiedad creada después de PC-3 nacía con contable_movimientos()
 * devolviendo cuenta_codigo NULL en todas sus líneas.
 *
 * Este test sí pasa por la RPC create_tenant() — es la única forma de que
 * el hueco vuelva a ser visible si alguien agrega un evento contable nuevo
 * (como pasó con ANTICIPO_COPROPIETARIO en RC-1) y olvida mapearlo: la
 * primera aserción compara contra el catálogo global de eventos, no contra
 * un número fijo.
 */
import { afterAll, describe, expect, it } from 'vitest'
import 'dotenv/config'
import {
  clienteAdmin,
  clienteComo,
  crearUsuario,
  eliminarTenant,
  eliminarUsuario,
  leerEntorno,
  RUN_ID,
  type UsuarioPrueba,
} from '../rls/helpers.js'

const env = leerEntorno()
const d = env ? describe : describe.skip

if (!env) {
  console.warn(
    'SALTADO tests/contabilidad/alta-parametrizacion-contable: faltan variables de Supabase en .env',
  )
}

d('create_tenant: parametrización contable del alta', () => {
  const admin = clienteAdmin(env!)
  // tenants.created_by → profiles(id) sin ON DELETE: el tenant se borra ANTES que su creador.
  const tenantsCreados: string[] = []
  const usuariosCreados: UsuarioPrueba[] = []

  afterAll(async () => {
    for (const id of tenantsCreados) {
      await eliminarTenant(admin, id)
    }
    for (const usuario of usuariosCreados) {
      await eliminarUsuario(admin, usuario.id)
    }
    // Borrar la copropiedad arrastra en cascada sus 145 cuentas contables, sus 71 cuentas
    // presupuestales y sus conceptos: no cabe en el hookTimeout de 10 s por defecto.
  }, 60_000)

  it('la copropiedad nace con los dos puentes contables sembrados', async () => {
    const usuario = await crearUsuario(admin, 'alta-contable')
    usuariosCreados.push(usuario)
    const cliente = await clienteComo(env!, usuario)

    const { data: tenant, error: errAlta } = await cliente
      .rpc('create_tenant', {
        p_name: 'Alta parametrización contable',
        p_slug: `t-${RUN_ID}-alta-contable`,
      })
      .single<{ id: string }>()
    if (errAlta) throw new Error(`create_tenant falló: ${errAlta.message}`)
    tenantsCreados.push(tenant.id)

    // 1. Un default por cada evento contable del catálogo global — comparado contra el
    //    catálogo, no contra una constante, para que un evento nuevo sin mapear falle aquí.
    const { count: eventos, error: errEventos } = await admin
      .from('lista_tipos')
      .select('*', { count: 'exact', head: true })
      .eq('tipo', 'EVENTO_CONTABLE')
      .is('tenant_id', null)
      .eq('activo', true)
    if (errEventos) throw errEventos

    const { count: defaults, error: errDefaults } = await admin
      .from('contable_cuenta_default')
      .select('*', { count: 'exact', head: true })
      .eq('tenant_id', tenant.id)
    if (errDefaults) throw errDefaults

    expect(defaults).toBe(eventos)

    // 2. Ninguna hoja del árbol presupuestal queda sin cuenta contable.
    const { count: hojasSinCuenta, error: errHojas } = await admin
      .from('presupuesto_cuenta')
      .select('*', { count: 'exact', head: true })
      .eq('tenant_id', tenant.id)
      .eq('es_hoja', true)
      .eq('activa', true)
      .is('contable_cuenta_id', null)
    if (errHojas) throw errHojas

    expect(hojasSinCuenta).toBe(0)

    // 3. El diagnóstico oficial no reporta nada pendiente: es la condición que la propia
    //    contable_parametrizacion_pendiente() define como "lista para emitir contabilidad".
    const { data: pendientes, error: errPendientes } = await admin.rpc(
      'contable_parametrizacion_pendiente',
      { p_tenant_id: tenant.id },
    )
    if (errPendientes) throw errPendientes

    expect(pendientes).toEqual([])
  }, 30_000)

  it('GAP-22: la copropiedad también nace con su fondo de imprevistos (Ley 675 art. 35)', async () => {
    const usuario = await crearUsuario(admin, 'alta-fondo')
    usuariosCreados.push(usuario)
    const cliente = await clienteComo(env!, usuario)

    const { data: tenant, error: errAlta } = await cliente
      .rpc('create_tenant', { p_name: 'Alta fondo imprevistos', p_slug: `t-${RUN_ID}-alta-fondo` })
      .single<{ id: string }>()
    if (errAlta) throw new Error(`create_tenant falló: ${errAlta.message}`)
    const tenantId = tenant.id
    tenantsCreados.push(tenantId)

    const { data: fondo, error: errFondo } = await admin
      .from('fondos')
      .select(
        'id, codigo, naturaleza, estado, permanente, contable_cuenta:contable_cuenta_id(codigo)',
      )
      .eq('tenant_id', tenantId)
      .eq('naturaleza', 'imprevistos')
      .single<{
        id: string
        codigo: string
        naturaleza: string
        estado: string
        permanente: boolean
        contable_cuenta: { codigo: string } | null
      }>()
    if (errFondo) throw errFondo
    const fondoId = fondo.id

    // Nace activo (no propuesto): la ley lo manda, no es una decisión pendiente de aprobar.
    expect(fondo.estado).toBe('activo')
    expect(fondo.permanente).toBe(true)
    expect(fondo.contable_cuenta?.codigo).toBe('111015')

    // No se inventa una autorización que nunca ocurrió (Modelo §7): la existencia
    // del fondo la manda la ley, no un acta de asamblea.
    const { count: autorizaciones } = await admin
      .from('fondo_autorizaciones')
      .select('id', { count: 'exact', head: true })
      .eq('fondo_id', fondoId)
    expect(autorizaciones).toBe(0)

    // Idempotente: llamar create_tenant() no puede duplicar el fondo si algo
    // reintentara la instanciación (mismo contrato que los demás fn_instanciar_*).
    const { data: segundaLlamada, error: errIdempotente } = await admin
      .rpc('fn_instanciar_fondo_imprevistos', { p_tenant_id: tenantId })
      .single<{ id: string }>()
    expect(errIdempotente).toBeNull()
    expect(segundaLlamada!.id).toBe(fondoId)

    const { count: total } = await admin
      .from('fondos')
      .select('id', { count: 'exact', head: true })
      .eq('tenant_id', tenantId)
      .eq('naturaleza', 'imprevistos')
    expect(total).toBe(1)
  }, 30_000)
})
