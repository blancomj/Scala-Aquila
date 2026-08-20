/**
 * presupuesto_cuenta — árbol de cuentas presupuestales (E8, 20260823200000/
 * 210000/220000). Verificado a mano en dev durante la construcción; este
 * archivo codifica esa misma verificación como regresión permanente.
 *
 * Cubre: aislamiento multitenant + rol agent vs auditor (mismo patrón que
 * motor-presupuestal-financiacion.test.ts), el guard del árbol
 * (guard_presupuesto_cuenta_arbol: padre inexistente, tenant inconsistente,
 * naturaleza mezclada, profundidad máxima al crear y al reparentar, ciclo),
 * la cascada de nivel/ruta hacia los descendientes al reparentar y al
 * reordenar (propagar_presupuesto_cuenta_ruta), el guard de rubro contra
 * hoja (guard_presupuesto_rubro_cuenta), el filtro por naturaleza 'egreso'
 * de guard_presupuesto_reconciliado, y el rollup por tenant de
 * presupuesto_cuenta_totales — incluida la regresión del bug real
 * encontrado en verificación manual (sin filtrar por tenant, sumaba
 * cuentas de otros tenants).
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
  console.warn('SALTADO tests/rls/presupuesto-cuenta-arbol: faltan variables de Supabase en .env')
}

interface CuentaFixture {
  id: string
  nivel: number
  ruta: string
  es_hoja: boolean
}

async function crearCuenta(
  admin: Cliente,
  params: {
    tenantId: string
    naturaleza: 'ingreso' | 'egreso'
    codigo: string
    nombre?: string
    parentId?: string
    orden?: number
  },
): Promise<CuentaFixture> {
  const { data, error } = await admin
    .from('presupuesto_cuenta')
    .insert({
      tenant_id: params.tenantId,
      naturaleza: params.naturaleza,
      codigo: params.codigo,
      nombre: params.nombre ?? params.codigo,
      parent_id: params.parentId ?? null,
      orden: params.orden ?? 0,
    })
    .select('id, nivel, ruta, es_hoja')
    .single<CuentaFixture>()
  if (error) throw new Error(`fixture cuenta ${params.codigo}: ${error.message}`)
  return data
}

async function cuentaPorId(admin: Cliente, id: string): Promise<CuentaFixture> {
  const { data, error } = await admin
    .from('presupuesto_cuenta')
    .select('id, nivel, ruta, es_hoja')
    .eq('id', id)
    .single<CuentaFixture>()
  if (error) throw new Error(`leer cuenta ${id}: ${error.message}`)
  return data
}

async function crearPresupuesto(admin: Cliente, tenantId: string, anio: number, montoTotal: number) {
  const { data, error } = await admin
    .from('presupuestos')
    .insert({ tenant_id: tenantId, anio, version: 1, monto_total: montoTotal })
    .select('id')
    .single<{ id: string }>()
  if (error) throw new Error(`fixture presupuesto: ${error.message}`)
  return data
}

d('presupuesto_cuenta — árbol de cuentas presupuestales (E8)', () => {
  const admin = clienteAdmin(env!)
  let agenteA: UsuarioPrueba
  let auditorA: UsuarioPrueba
  let agenteB: UsuarioPrueba
  let tenantA: TenantPrueba
  let tenantB: TenantPrueba
  let clienteAgentA: Cliente
  let clienteAuditorA: Cliente
  let clienteAgentB: Cliente
  let raizEgresoA: CuentaFixture

  beforeAll(async () => {
    agenteA = await crearUsuario(admin, 'pca-agent-a')
    auditorA = await crearUsuario(admin, 'pca-auditor-a')
    agenteB = await crearUsuario(admin, 'pca-agent-b')
    tenantA = await crearTenant(admin, 'pca-a', agenteA.id)
    tenantB = await crearTenant(admin, 'pca-b', agenteB.id)
    await crearMembership(admin, tenantA.id, agenteA.id, 'auxiliar')
    await crearMembership(admin, tenantA.id, auditorA.id, 'auditor')
    await crearMembership(admin, tenantB.id, agenteB.id, 'auxiliar')

    clienteAgentA = await clienteComo(env!, agenteA)
    clienteAuditorA = await clienteComo(env!, auditorA)
    clienteAgentB = await clienteComo(env!, agenteB)

    raizEgresoA = await crearCuenta(admin, {
      tenantId: tenantA.id,
      naturaleza: 'egreso',
      codigo: 'raiz-egreso',
    })
  }, 30_000)

  afterAll(async () => {
    await eliminarTenant(admin, tenantA.id)
    await eliminarTenant(admin, tenantB.id)
    await eliminarUsuario(admin, agenteA.id)
    await eliminarUsuario(admin, auditorA.id)
    await eliminarUsuario(admin, agenteB.id)
  }, 30_000)

  // ── RLS ──────────────────────────────────────────────────────────────
  it('control positivo: A ve su propia cuenta', async () => {
    const { data, error } = await clienteAgentA
      .from('presupuesto_cuenta')
      .select('id')
      .eq('id', raizEgresoA.id)
    expect(error).toBeNull()
    expect(data).toHaveLength(1)
  })

  it('SEC-11: B no ve las cuentas de A', async () => {
    const { data, error } = await clienteAgentB
      .from('presupuesto_cuenta')
      .select('id')
      .eq('id', raizEgresoA.id)
    expect(error).toBeNull()
    expect(data).toHaveLength(0)
  })

  it('un auditor no puede insertar presupuesto_cuenta', async () => {
    const { error } = await clienteAuditorA.from('presupuesto_cuenta').insert({
      tenant_id: tenantA.id,
      naturaleza: 'egreso',
      codigo: 'auditor-intento',
      nombre: 'No debería crearse',
    })
    expect(error).not.toBeNull()
  })

  it('B no puede insertar una cuenta bajo el tenant_id de A', async () => {
    const { error } = await clienteAgentB.from('presupuesto_cuenta').insert({
      tenant_id: tenantA.id,
      naturaleza: 'egreso',
      codigo: 'b-intento',
      nombre: 'No debería crearse',
    })
    expect(error).not.toBeNull()
  })

  // ── guard_presupuesto_cuenta_arbol — creación ───────────────────────────
  it('es_hoja se apaga solo en el padre al insertar el primer hijo', async () => {
    const padre = await crearCuenta(admin, {
      tenantId: tenantA.id,
      naturaleza: 'egreso',
      codigo: 'con-hijo',
    })
    expect(padre.es_hoja).toBe(true)

    const hijo = await crearCuenta(admin, {
      tenantId: tenantA.id,
      naturaleza: 'egreso',
      codigo: 'con-hijo.uno',
      parentId: padre.id,
    })
    expect(hijo.nivel).toBe(2)
    expect(hijo.ruta.startsWith(`${padre.ruta}.`)).toBe(true)

    const padreActualizado = await cuentaPorId(admin, padre.id)
    expect(padreActualizado.es_hoja).toBe(false)
  })

  it('CUENTA_NATURALEZA_MEZCLADA: un hijo no puede tener naturaleza distinta al padre', async () => {
    const { error } = await admin.from('presupuesto_cuenta').insert({
      tenant_id: tenantA.id,
      naturaleza: 'ingreso',
      codigo: 'mezcla-mal',
      nombre: 'Mal',
      parent_id: raizEgresoA.id,
    })
    expect(error?.message).toMatch(/CUENTA_NATURALEZA_MEZCLADA/)
  })

  it('CUENTA_PADRE_INEXISTENTE: parent_id que no existe se rechaza', async () => {
    const { error } = await admin.from('presupuesto_cuenta').insert({
      tenant_id: tenantA.id,
      naturaleza: 'egreso',
      codigo: 'padre-fantasma',
      nombre: 'Fantasma',
      parent_id: '00000000-0000-0000-0000-000000000000',
    })
    expect(error?.message).toMatch(/CUENTA_PADRE_INEXISTENTE/)
  })

  it('CUENTA_TENANT_INCONSISTENTE: no se puede colgar de una cuenta de otro tenant', async () => {
    const raizB = await crearCuenta(admin, {
      tenantId: tenantB.id,
      naturaleza: 'egreso',
      codigo: 'raiz-b',
    })
    const { error } = await admin.from('presupuesto_cuenta').insert({
      tenant_id: tenantA.id,
      naturaleza: 'egreso',
      codigo: 'cruce-tenant',
      nombre: 'Cruce',
      parent_id: raizB.id,
    })
    expect(error?.message).toMatch(/CUENTA_TENANT_INCONSISTENTE/)
  })

  it('CUENTA_PROFUNDIDAD_MAXIMA: no admite un 5to nivel', async () => {
    const n1 = await crearCuenta(admin, { tenantId: tenantA.id, naturaleza: 'egreso', codigo: 'prof-1' })
    const n2 = await crearCuenta(admin, {
      tenantId: tenantA.id,
      naturaleza: 'egreso',
      codigo: 'prof-2',
      parentId: n1.id,
    })
    const n3 = await crearCuenta(admin, {
      tenantId: tenantA.id,
      naturaleza: 'egreso',
      codigo: 'prof-3',
      parentId: n2.id,
    })
    const n4 = await crearCuenta(admin, {
      tenantId: tenantA.id,
      naturaleza: 'egreso',
      codigo: 'prof-4',
      parentId: n3.id,
    })
    expect(n4.nivel).toBe(4)

    const { error } = await admin.from('presupuesto_cuenta').insert({
      tenant_id: tenantA.id,
      naturaleza: 'egreso',
      codigo: 'prof-5',
      nombre: 'Nivel 5',
      parent_id: n4.id,
    })
    expect(error?.message).toMatch(/CUENTA_PROFUNDIDAD_MAXIMA/)
  })

  // ── reparentar: ciclo, profundidad, cascada ─────────────────────────────
  it('CUENTA_CICLO: no se puede reasignar una cuenta bajo su propio descendiente', async () => {
    const abuelo = await crearCuenta(admin, {
      tenantId: tenantA.id,
      naturaleza: 'egreso',
      codigo: 'ciclo-abuelo',
    })
    const padre = await crearCuenta(admin, {
      tenantId: tenantA.id,
      naturaleza: 'egreso',
      codigo: 'ciclo-padre',
      parentId: abuelo.id,
    })
    const nieto = await crearCuenta(admin, {
      tenantId: tenantA.id,
      naturaleza: 'egreso',
      codigo: 'ciclo-nieto',
      parentId: padre.id,
    })

    const { error } = await admin
      .from('presupuesto_cuenta')
      .update({ parent_id: nieto.id })
      .eq('id', abuelo.id)
    expect(error?.message).toMatch(/CUENTA_CICLO/)
  })

  it('CUENTA_PROFUNDIDAD_EXCEDIDA: reparentar rechaza si algún descendiente pasaría del nivel 4', async () => {
    const destino = await crearCuenta(admin, {
      tenantId: tenantA.id,
      naturaleza: 'egreso',
      codigo: 'destino-prof',
    })
    const destinoHijo = await crearCuenta(admin, {
      tenantId: tenantA.id,
      naturaleza: 'egreso',
      codigo: 'destino-prof.hijo',
      parentId: destino.id,
    })

    const mover1 = await crearCuenta(admin, { tenantId: tenantA.id, naturaleza: 'egreso', codigo: 'mover-1' })
    const mover2 = await crearCuenta(admin, {
      tenantId: tenantA.id,
      naturaleza: 'egreso',
      codigo: 'mover-2',
      parentId: mover1.id,
    })
    const mover3 = await crearCuenta(admin, {
      tenantId: tenantA.id,
      naturaleza: 'egreso',
      codigo: 'mover-3',
      parentId: mover2.id,
    })
    expect(mover3.nivel).toBe(3)

    // destinoHijo está en nivel 2 — moverlo ahí pondría a mover1 en nivel 3, empujando a
    // mover3 (2 niveles más abajo de mover1) a nivel 5.
    const { error } = await admin
      .from('presupuesto_cuenta')
      .update({ parent_id: destinoHijo.id })
      .eq('id', mover1.id)
    expect(error?.message).toMatch(/CUENTA_PROFUNDIDAD_EXCEDIDA/)
  })

  it('reparentar cascada nivel/ruta a todos los descendientes', async () => {
    const origen = await crearCuenta(admin, { tenantId: tenantA.id, naturaleza: 'egreso', codigo: 'casc-origen' })
    const hijo = await crearCuenta(admin, {
      tenantId: tenantA.id,
      naturaleza: 'egreso',
      codigo: 'casc-origen.hijo',
      parentId: origen.id,
    })
    const nieto = await crearCuenta(admin, {
      tenantId: tenantA.id,
      naturaleza: 'egreso',
      codigo: 'casc-origen.hijo.nieto',
      parentId: hijo.id,
    })
    const destino = await crearCuenta(admin, {
      tenantId: tenantA.id,
      naturaleza: 'egreso',
      codigo: 'casc-destino',
    })

    const { error } = await admin
      .from('presupuesto_cuenta')
      .update({ parent_id: destino.id, orden: 1 })
      .eq('id', origen.id)
    expect(error).toBeNull()

    const origenTrasMover = await cuentaPorId(admin, origen.id)
    const hijoTrasMover = await cuentaPorId(admin, hijo.id)
    const nietoTrasMover = await cuentaPorId(admin, nieto.id)

    expect(origenTrasMover.nivel).toBe(2)
    expect(origenTrasMover.ruta).toBe(`${destino.ruta}.0001`)
    expect(hijoTrasMover.nivel).toBe(3)
    expect(hijoTrasMover.ruta.startsWith(`${origenTrasMover.ruta}.`)).toBe(true)
    expect(nietoTrasMover.nivel).toBe(4)
    expect(nietoTrasMover.ruta.startsWith(`${hijoTrasMover.ruta}.`)).toBe(true)
  })

  it('reordenar (sin cambiar padre) propaga ruta a los descendientes sin tocar nivel', async () => {
    const padre = await crearCuenta(admin, { tenantId: tenantA.id, naturaleza: 'egreso', codigo: 'orden-padre' })
    const hijo = await crearCuenta(admin, {
      tenantId: tenantA.id,
      naturaleza: 'egreso',
      codigo: 'orden-padre.hijo',
      parentId: padre.id,
    })
    const nivelHijoAntes = hijo.nivel

    const { error } = await admin
      .from('presupuesto_cuenta')
      .update({ orden: 7 })
      .eq('id', padre.id)
    expect(error).toBeNull()

    const padreTrasOrden = await cuentaPorId(admin, padre.id)
    const hijoTrasOrden = await cuentaPorId(admin, hijo.id)

    expect(padreTrasOrden.nivel).toBe(1)
    expect(padreTrasOrden.ruta).toBe('0007')
    expect(hijoTrasOrden.nivel).toBe(nivelHijoAntes)
    expect(hijoTrasOrden.ruta.startsWith('0007.')).toBe(true)
  })

  // ── guard_presupuesto_rubro_cuenta ──────────────────────────────────────
  it('CUENTA_NO_ES_HOJA: un rubro no puede presupuestarse contra una cuenta que agrupa subcuentas', async () => {
    const grupo = await crearCuenta(admin, { tenantId: tenantA.id, naturaleza: 'egreso', codigo: 'grupo-rubro' })
    await crearCuenta(admin, {
      tenantId: tenantA.id,
      naturaleza: 'egreso',
      codigo: 'grupo-rubro.hijo',
      parentId: grupo.id,
    })

    const presupuesto = await crearPresupuesto(admin, tenantA.id, 2030, 1000)
    const { error } = await admin.from('presupuesto_rubros').insert({
      tenant_id: tenantA.id,
      presupuesto_id: presupuesto.id,
      codigo: 'RUBRO-GRUPO',
      nombre: 'No debería poder',
      cuenta_id: grupo.id,
      monto_anual: 1000,
    })
    expect(error?.message).toMatch(/CUENTA_NO_ES_HOJA/)
  })

  it('un rubro no puede referenciar una cuenta de otro tenant', async () => {
    const cuentaB = await crearCuenta(admin, { tenantId: tenantB.id, naturaleza: 'egreso', codigo: 'hoja-b' })
    const presupuesto = await crearPresupuesto(admin, tenantA.id, 2031, 1000)

    const { error } = await admin.from('presupuesto_rubros').insert({
      tenant_id: tenantA.id,
      presupuesto_id: presupuesto.id,
      codigo: 'RUBRO-CRUCE',
      nombre: 'No debería poder',
      cuenta_id: cuentaB.id,
      monto_anual: 1000,
    })
    expect(error?.message).toMatch(/CUENTA_TENANT_INCONSISTENTE/)
  })

  // ── guard_presupuesto_reconciliado + presupuesto_cuenta_totales ─────────
  it('la reconciliación de monto_total solo suma hojas de naturaleza egreso', async () => {
    const egreso = await crearCuenta(admin, { tenantId: tenantA.id, naturaleza: 'egreso', codigo: 'recon-egreso' })
    const ingreso = await crearCuenta(admin, {
      tenantId: tenantA.id,
      naturaleza: 'ingreso',
      codigo: 'recon-ingreso',
    })

    const presupuesto = await crearPresupuesto(admin, tenantA.id, 2032, 500)
    await admin.from('presupuesto_rubros').insert([
      {
        tenant_id: tenantA.id,
        presupuesto_id: presupuesto.id,
        codigo: 'RECON-E',
        nombre: 'Egreso',
        cuenta_id: egreso.id,
        monto_anual: 500,
      },
      {
        tenant_id: tenantA.id,
        presupuesto_id: presupuesto.id,
        codigo: 'RECON-I',
        nombre: 'Ingreso',
        cuenta_id: ingreso.id,
        monto_anual: 9_999_999,
      },
    ])

    // si el rubro de ingreso contara, esto fallaría con BUDGET_NOT_RECONCILED; como no cuenta,
    // 500 (monto_total) = 500 (Σ solo egreso) y cuadra.
    const { error } = await admin
      .from('presupuestos')
      .update({ estado: 'aprobado' })
      .eq('id', presupuesto.id)
    expect(error).toBeNull()
  })

  it('presupuesto_cuenta_totales agrega solo las cuentas del tenant dueño del presupuesto', async () => {
    const raiz = await crearCuenta(admin, { tenantId: tenantA.id, naturaleza: 'egreso', codigo: 'totales-raiz' })
    const hoja = await crearCuenta(admin, {
      tenantId: tenantA.id,
      naturaleza: 'egreso',
      codigo: 'totales-raiz.hoja',
      parentId: raiz.id,
    })

    const presupuesto = await crearPresupuesto(admin, tenantA.id, 2033, 300)
    await admin.from('presupuesto_rubros').insert({
      tenant_id: tenantA.id,
      presupuesto_id: presupuesto.id,
      codigo: 'TOT-001',
      nombre: 'Hoja',
      cuenta_id: hoja.id,
      monto_anual: 300,
    })

    const { data: totales, error } = await admin.rpc('presupuesto_cuenta_totales', {
      p_presupuesto_id: presupuesto.id,
    })
    expect(error).toBeNull()

    const porCuenta = new Map((totales ?? []).map((t) => [t.cuenta_id, t.monto_acumulado]))
    expect(porCuenta.get(hoja.id)).toBe(300)
    expect(porCuenta.get(raiz.id)).toBe(300)

    // Regresión del bug real encontrado en verificación manual: sin filtrar por tenant, el
    // rollup escaneaba las cuentas de TODOS los tenants — ninguna fila debe pertenecer a B.
    const { data: cuentasDeB } = await admin
      .from('presupuesto_cuenta')
      .select('id')
      .eq('tenant_id', tenantB.id)
    const idsDeB = new Set((cuentasDeB ?? []).map((c) => c.id))
    for (const fila of totales ?? []) {
      expect(idsDeB.has(fila.cuenta_id)).toBe(false)
    }
  })
})
