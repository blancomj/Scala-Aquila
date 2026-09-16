/**
 * RPT-01 — Motor de Reportes: aislamiento, permisos y seguridad del compilador
 * (migraciones 20260938000000..20260938040000, D-136).
 *
 * Lo que de verdad se prueba aquí no es el CRUD sino las tres afirmaciones
 * de las que depende el motor entero:
 *
 *   1. el catálogo es una lista blanca real — lo que no está sembrado no se
 *      puede reportar, y eso incluye cualquier identificador SQL inventado;
 *   2. los valores de filtro son datos, nunca sintaxis;
 *   3. fn_reporte_ejecutar es SECURITY INVOKER, así que la RLS del usuario
 *      aplica sola: un miembro del tenant A no ve una fila del tenant B ni
 *      aunque ejecute la misma fuente.
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
  console.warn('SALTADO tests/rls/reportes: faltan variables de Supabase en .env')
}

type Resultado = {
  filas: Record<string, unknown>[]
  total_filas: number
  truncado: boolean
  duracion_ms: number
  fuente: string
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

async function crearInmueble(admin: Cliente, tenantId: string, prefijo: string): Promise<string> {
  const tipoInmuebleId = await listaTipoId(admin, 'TIPO_INMUEBLE', 'apartamento')
  const { data, error } = await admin
    .from('inmuebles')
    .insert({ tenant_id: tenantId, codigo: `${prefijo}-${String(Date.now())}`, tipo_id: tipoInmuebleId })
    .select('id')
    .single<{ id: string }>()
  if (error) throw new Error(`fixture inmueble: ${error.message}`)
  return data.id
}

d('RPT-01 · Motor de Reportes', () => {
  let admin: Cliente
  let tenantA: TenantPrueba
  let tenantB: TenantPrueba
  let auxiliarA: UsuarioPrueba
  let auditorA: UsuarioPrueba
  let auxiliarB: UsuarioPrueba
  // Referencia que solo existe en el tenant B: si aparece en un resultado
  // del tenant A, el aislamiento está roto.
  const referenciaB = `RPT-SOLO-B-${String(Date.now())}`

  beforeAll(async () => {
    admin = clienteAdmin(env!)
    tenantA = await crearTenant(admin, 'rpt-a')
    tenantB = await crearTenant(admin, 'rpt-b')
    auxiliarA = await crearUsuario(admin, 'rpt-auxiliar-a')
    auditorA = await crearUsuario(admin, 'rpt-auditor-a')
    auxiliarB = await crearUsuario(admin, 'rpt-auxiliar-b')
    await crearMembership(admin, tenantA.id, auxiliarA.id, 'auxiliar')
    await crearMembership(admin, tenantA.id, auditorA.id, 'auditor')
    await crearMembership(admin, tenantB.id, auxiliarB.id, 'auxiliar')

    const inmuebleB = await crearInmueble(admin, tenantB.id, 'rpt-b')
    const formaPagoId = await listaTipoId(admin, 'FORMA_PAGO', 'efectivo')
    const { error } = await admin.from('pagos').insert({
      tenant_id: tenantB.id,
      inmueble_id: inmuebleB,
      monto: 777000,
      fecha_pago: new Date().toISOString().slice(0, 10),
      forma_pago_id: formaPagoId,
      referencia: referenciaB,
    })
    if (error) throw new Error(`fixture pago B: ${error.message}`)
  }, 60_000)

  afterAll(async () => {
    if (!env) return
    await eliminarTenant(admin, tenantA.id)
    await eliminarTenant(admin, tenantB.id)
    await eliminarUsuario(admin, auxiliarA.id)
    await eliminarUsuario(admin, auditorA.id)
    await eliminarUsuario(admin, auxiliarB.id)
  }, 60_000)

  // ── Reportes de fábrica y aislamiento ────────────────────────────────
  it('un tenant nuevo nace con sus reportes de fábrica publicados', async () => {
    const cliente = await clienteComo(env!, auxiliarA)
    const { data, error } = await cliente
      .from('reportes')
      .select('codigo, del_sistema, reporte_versiones(version, estado)')
      .order('codigo')

    expect(error).toBeNull()
    expect(data?.map((r) => r.codigo)).toEqual(['RPT-CAR-001', 'RPT-CC-001', 'RPT-FIN-001'])
    expect(data?.every((r) => r.del_sistema)).toBe(true)
    // Vienen publicados: un reporte de fábrica en borrador no se podría ejecutar.
    expect(data?.every((r) => r.reporte_versiones.some((v) => v.estado === 'publicada'))).toBe(true)
  })

  it('un miembro del tenant A no ve los reportes del tenant B', async () => {
    const cliente = await clienteComo(env!, auxiliarA)
    const { data } = await cliente.from('reportes').select('tenant_id')
    expect(data?.every((r) => r.tenant_id === tenantA.id)).toBe(true)
  })

  it('el auditor no puede crear reportes (settings:manage)', async () => {
    const cliente = await clienteComo(env!, auditorA)
    const { error } = await cliente
      .from('reportes')
      .insert({ tenant_id: tenantA.id, codigo: 'RPT-AUDITOR', nombre: 'No debería existir' })
    expect(error?.code).toBe('42501')
  })

  it('un reporte del sistema no se puede borrar', async () => {
    const cliente = await clienteComo(env!, auxiliarA)
    await cliente.from('reportes').delete().eq('codigo', 'RPT-CAR-001')
    // RLS filtra en vez de lanzar: lo que se comprueba es la fila, no el error.
    const { data } = await cliente.from('reportes').select('codigo').eq('codigo', 'RPT-CAR-001')
    expect(data).toHaveLength(1)
  })

  it('una versión publicada es inmutable', async () => {
    // Sobre un reporte PROPIO: en uno de fábrica la RLS filtra antes
    // (20260939000000) y el trigger nunca llega a hablar — eso se prueba
    // aparte, en tests/rls/reportes-disenador.test.ts.
    const cliente = await clienteComo(env!, auxiliarA)

    const { data: reporte } = await cliente
      .from('reportes')
      .insert({ tenant_id: tenantA.id, codigo: 'INMUTABLE-001', nombre: 'Prueba de inmutabilidad' })
      .select('id')
      .single<{ id: string }>()

    const { data: version } = await cliente
      .from('reporte_versiones')
      .insert({
        tenant_id: tenantA.id,
        reporte_id: reporte!.id,
        version: 1,
        estado: 'publicada',
        definicion: { fuente: 'recaudos', campos: [{ campo: 'monto' }] },
        publicada_at: new Date().toISOString(),
      })
      .select('id')
      .single<{ id: string }>()

    const { error } = await cliente
      .from('reporte_versiones')
      .update({ definicion: { fuente: 'recaudos', campos: [] } })
      .eq('id', version!.id)

    expect(error?.message).toContain('RPT_VERSION_PUBLICADA_INMUTABLE')
  })

  // ── El catálogo como lista blanca ────────────────────────────────────
  it('el catálogo de fuentes es legible y no escribible', async () => {
    const cliente = await clienteComo(env!, auxiliarA)
    const { data } = await cliente.from('reporte_fuentes').select('codigo').order('codigo')
    expect(data?.map((f) => f.codigo)).toEqual(['cartera_inmueble', 'cuenta_corriente', 'recaudos'])

    const { error } = await cliente
      .from('reporte_fuentes')
      .insert({ codigo: 'pirata', nombre: 'x', modulo: 'x', objeto_sql: 'vr_pirata' })
    expect(error?.code).toBe('42501')
  })

  it('rechaza un campo que no está en el catálogo', async () => {
    const cliente = await clienteComo(env!, auxiliarA)
    const { error } = await cliente.rpc('fn_reporte_ejecutar', {
      p_definicion: { fuente: 'recaudos', campos: [{ campo: 'tenant_id' }] },
      p_tenant_id: tenantA.id,
      p_limite: 10,
    })
    expect(error?.message).toContain('RPT_CAMPO_NO_ENCONTRADO')
  })

  it('rechaza un identificador SQL disfrazado de campo', async () => {
    const cliente = await clienteComo(env!, auxiliarA)
    const { error } = await cliente.rpc('fn_reporte_ejecutar', {
      p_definicion: {
        fuente: 'recaudos',
        campos: [{ campo: 'monto) as x, (select current_setting($$request.jwt.claims$$)' }],
      },
      p_tenant_id: tenantA.id,
      p_limite: 10,
    })
    expect(error?.message).toContain('RPT_CAMPO_NO_ENCONTRADO')
  })

  it('exige el filtro obligatorio de la fuente de cartera', async () => {
    const cliente = await clienteComo(env!, auxiliarA)
    const { error } = await cliente.rpc('fn_reporte_ejecutar', {
      p_definicion: { fuente: 'cartera_inmueble', campos: [{ campo: 'inmueble' }] },
      p_tenant_id: tenantA.id,
      p_limite: 10,
    })
    expect(error?.message).toContain('RPT_FILTRO_OBLIGATORIO')
  })

  it('no deja agregar una dimensión ni ordenar por un campo ausente', async () => {
    const cliente = await clienteComo(env!, auxiliarA)

    const { error: errorAgregacion } = await cliente.rpc('fn_reporte_ejecutar', {
      p_definicion: {
        fuente: 'recaudos',
        campos: [{ campo: 'forma_pago', agregacion: 'suma' }],
      },
      p_tenant_id: tenantA.id,
      p_limite: 10,
    })
    expect(errorAgregacion?.message).toContain('RPT_AGREGACION_INVALIDA')

    const { error: errorOrden } = await cliente.rpc('fn_reporte_ejecutar', {
      p_definicion: {
        fuente: 'recaudos',
        campos: [{ campo: 'monto' }],
        orden: [{ campo: 'pagador' }],
      },
      p_tenant_id: tenantA.id,
      p_limite: 10,
    })
    expect(errorOrden?.message).toContain('RPT_ORDEN_INVALIDO')
  })

  // ── Los valores son datos, nunca sintaxis ────────────────────────────
  it('un valor de filtro con sintaxis SQL se trata como texto', async () => {
    const cliente = await clienteComo(env!, auxiliarA)
    const { data, error } = await cliente.rpc('fn_reporte_ejecutar', {
      p_definicion: {
        fuente: 'recaudos',
        campos: [{ campo: 'inmueble' }, { campo: 'monto' }],
        filtros: [{ campo: 'referencia', operador: 'contiene', valor: "' or 1=1 --" }],
      },
      p_tenant_id: tenantA.id,
      p_limite: 100,
    })

    expect(error).toBeNull()
    // Si el texto se hubiera interpolado como sintaxis, el `or 1=1` habría
    // devuelto todas las filas visibles en vez de ninguna.
    expect((data as Resultado).total_filas).toBe(0)

    // Y el catálogo sigue en pie.
    const { data: fuentes } = await cliente.from('reporte_fuentes').select('codigo')
    expect(fuentes).toHaveLength(3)
  })

  // ── SECURITY INVOKER: la RLS del usuario aplica sola ─────────────────
  // Desde RPT-05 el tenant viaja como argumento, así que este test pide
  // explícitamente el de B: es el caso hostil de verdad — un cliente que
  // manda el id de otra copropiedad. El argumento no da acceso a nada; la
  // RLS de las vistas vr_* sigue mandando para `authenticated`.
  it('un miembro del tenant A no ve el tenant B ni pidiéndolo por id', async () => {
    const clienteA = await clienteComo(env!, auxiliarA)
    const { data, error } = await clienteA.rpc('fn_reporte_ejecutar', {
      p_definicion: {
        fuente: 'recaudos',
        campos: [{ campo: 'referencia' }, { campo: 'monto' }],
        filtros: [{ campo: 'referencia', operador: 'igual', valor: referenciaB }],
      },
      p_tenant_id: tenantB.id,
      p_limite: 100,
    })

    expect(error).toBeNull()
    expect((data as Resultado).total_filas).toBe(0)
  })

  it('el dueño de esa fila sí la ve, con la misma definición', async () => {
    const clienteB = await clienteComo(env!, auxiliarB)
    const { data, error } = await clienteB.rpc('fn_reporte_ejecutar', {
      p_definicion: {
        fuente: 'recaudos',
        campos: [{ campo: 'referencia' }, { campo: 'monto' }],
        filtros: [{ campo: 'referencia', operador: 'igual', valor: referenciaB }],
      },
      p_tenant_id: tenantB.id,
      p_limite: 100,
    })

    expect(error).toBeNull()
    const resultado = data as Resultado
    expect(resultado.total_filas).toBe(1)
    expect(resultado.filas[0]!.referencia).toBe(referenciaB)
    expect(Number(resultado.filas[0]!.monto)).toBe(777000)
  })

  it('agrupa y totaliza sobre los datos del propio tenant', async () => {
    const clienteB = await clienteComo(env!, auxiliarB)
    const { data, error } = await clienteB.rpc('fn_reporte_ejecutar', {
      p_definicion: {
        fuente: 'recaudos',
        campos: [{ campo: 'forma_pago' }, { campo: 'monto', agregacion: 'suma' }],
        agrupar: ['forma_pago'],
        orden: [{ campo: 'monto', direccion: 'desc' }],
      },
      p_tenant_id: tenantB.id,
      p_limite: 100,
    })

    expect(error).toBeNull()
    const resultado = data as Resultado
    expect(resultado.total_filas).toBe(1)
    expect(resultado.filas[0]!.forma_pago).toBe('Efectivo')
    expect(Number(resultado.filas[0]!.monto)).toBe(777000)
  })

  it('una copropiedad con ejecuciones registradas se puede borrar', async () => {
    // Regresión de 20260938060000: con forbid_mutation() a secas, la FK
    // `tenant_id ... on delete cascade` chocaba contra el guard append-only
    // y la copropiedad quedaba imposible de borrar en cuanto alguien
    // ejecutaba un reporte. Lo encontró la verificación en navegador, no las
    // pruebas — porque la bitácora la escribe el frontend, no la RPC.
    const tenantDesechable = await crearTenant(admin, 'rpt-borrable')

    const { data: reporte } = await admin
      .from('reportes')
      .select('id, reporte_versiones(id)')
      .eq('tenant_id', tenantDesechable.id)
      .limit(1)
      .single<{ id: string; reporte_versiones: { id: string }[] }>()

    const { error: errorEjecucion } = await admin.from('reporte_ejecuciones').insert({
      tenant_id: tenantDesechable.id,
      reporte_id: reporte!.id,
      version_id: reporte!.reporte_versiones[0]!.id,
      exito: true,
      filas: 0,
      duracion_ms: 5,
    })
    expect(errorEjecucion).toBeNull()

    const { error: errorBorrado } = await admin
      .from('tenants')
      .delete()
      .eq('id', tenantDesechable.id)
    expect(errorBorrado).toBeNull()

    const { data: quedan } = await admin
      .from('tenants')
      .select('id')
      .eq('id', tenantDesechable.id)
    expect(quedan).toHaveLength(0)
  }, 60_000)

  it('resetear la copropiedad borra el historial y devuelve los reportes de fábrica', async () => {
    const tenantReset = await crearTenant(admin, 'rpt-reset')
    const adminReset = await crearUsuario(admin, 'rpt-admin-reset')
    await crearMembership(admin, tenantReset.id, adminReset.id, 'administrador')

    const { data: reporte } = await admin
      .from('reportes')
      .select('id, reporte_versiones(id)')
      .eq('tenant_id', tenantReset.id)
      .limit(1)
      .single<{ id: string; reporte_versiones: { id: string }[] }>()

    await admin.from('reporte_ejecuciones').insert({
      tenant_id: tenantReset.id,
      reporte_id: reporte!.id,
      version_id: reporte!.reporte_versiones[0]!.id,
      exito: true,
      filas: 3,
      duracion_ms: 12,
    })

    const cliente = await clienteComo(env!, adminReset)
    const { error } = await cliente.rpc('fn_resetear_copropiedad', { p_tenant_id: tenantReset.id })
    expect(error).toBeNull()

    const { data: ejecuciones } = await admin
      .from('reporte_ejecuciones')
      .select('id')
      .eq('tenant_id', tenantReset.id)
    expect(ejecuciones).toHaveLength(0)

    // Y la copropiedad queda como recién creada: sus tres reportes de fábrica.
    const { data: reportes } = await admin
      .from('reportes')
      .select('codigo')
      .eq('tenant_id', tenantReset.id)
      .order('codigo')
    expect(reportes?.map((r) => r.codigo)).toEqual(['RPT-CAR-001', 'RPT-CC-001', 'RPT-FIN-001'])

    await eliminarTenant(admin, tenantReset.id)
    await eliminarUsuario(admin, adminReset.id)
  }, 90_000)

  it('respeta el límite de filas y lo reporta', async () => {
    const clienteB = await clienteComo(env!, auxiliarB)
    const { data } = await clienteB.rpc('fn_reporte_ejecutar', {
      p_definicion: { fuente: 'recaudos', campos: [{ campo: 'monto' }] },
      p_tenant_id: tenantB.id,
      p_limite: 1,
    })
    const resultado = data as Resultado
    expect(resultado.filas).toHaveLength(1)
    expect(resultado.truncado).toBe(true)
  })
})
