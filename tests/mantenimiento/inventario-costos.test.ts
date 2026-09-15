/**
 * MANT-6 (20260932100000-20260932150000) — inventario de repuestos y costos.
 * Ver Casos de uso/Tres Modulos/Mantenimiento/MANT_06_inventario_costos.md.
 *
 * Decisiones de diseño confirmadas en el Plan del corte (no están en el prompt original, ver
 * cabeceras de las migraciones): (1) `direccion` (+1/-1) desacopla el signo del tipo para poder
 * modelar un `ajuste` bidireccional; (2) sin política de valoración definida (prompt §3), el
 * consumo de una OT SIEMPRE se registra físicamente — nunca se aborta — y queda listado por
 * `mant_inventario_pendientes_contabilizar()`, no por una excepción; (3) `transferencia` es un
 * par de filas atómico (`fn_mant_transferir_repuesto`), nunca un INSERT suelto.
 */
import { afterAll, describe, expect, it } from 'vitest'
import 'dotenv/config'
import { Client } from 'pg'
import type { Database } from '@aquila/shared'
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
  console.warn(
    'SALTADO tests/mantenimiento/inventario-costos: faltan variables de Supabase en .env',
  )
}

const dbUrl = process.env.SUPABASE_DB_URL
const dPg = dbUrl ? describe : describe.skip
if (!dbUrl) {
  console.warn(
    'SALTADO las pruebas estructurales de inventario-costos: falta SUPABASE_DB_URL en .env',
  )
}

const FECHA = '2026-01-15'
const ANIO = 2026
const MES = 1

d('MANT-6: inventario de repuestos y costos', () => {
  const admin = clienteAdmin(env!)
  const tenantsCreados: string[] = []
  const usuariosCreados: UsuarioPrueba[] = []

  afterAll(async () => {
    for (const id of tenantsCreados) await eliminarTenant(admin, id)
    for (const usuario of usuariosCreados) await eliminarUsuario(admin, usuario.id)
  }, 60_000)

  async function crearTenantCompleto(
    etiqueta: string,
  ): Promise<{ tenantId: string; cliente: Cliente }> {
    const usuario = await crearUsuario(admin, etiqueta)
    usuariosCreados.push(usuario)
    const cliente = await clienteComo(env!, usuario)
    const { data: tenant, error } = await cliente
      .rpc('create_tenant', { p_name: `MANT-6 ${etiqueta}`, p_slug: `t6-${RUN_ID}-${etiqueta}` })
      .single<{ id: string }>()
    if (error) throw new Error(`create_tenant (${etiqueta}): ${error.message}`)
    tenantsCreados.push(tenant.id)
    return { tenantId: tenant.id, cliente }
  }

  async function idListaTipos(tipo: string, codigo: string): Promise<number> {
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

  async function crearRepuesto(
    tenantId: string,
    sku: string,
    overrides: Partial<Database['public']['Tables']['mant_repuestos']['Insert']> = {},
  ): Promise<string> {
    const categoriaId = await idListaTipos('CATEGORIA_REPUESTO', 'ferreteria')
    const { data, error } = await admin
      .from('mant_repuestos')
      .insert({ tenant_id: tenantId, sku, nombre: sku, categoria_id: categoriaId, ...overrides })
      .select('id')
      .single<{ id: string }>()
    if (error) throw new Error(`fixture repuesto ${sku}: ${error.message}`)
    return data.id
  }

  async function crearAlmacen(tenantId: string, nombre: string): Promise<string> {
    const { data, error } = await admin
      .from('mant_almacenes')
      .insert({ tenant_id: tenantId, nombre })
      .select('id')
      .single<{ id: string }>()
    if (error) throw new Error(`fixture almacén ${nombre}: ${error.message}`)
    return data.id
  }

  async function crearActivoMinimo(tenantId: string, codigo: string): Promise<string> {
    const tipoId = await idListaTipos('TIPO_ACTIVO', 'otro')
    const categoriaId = await idListaTipos('CATEGORIA_ACTIVO', 'otros')
    const { data, error } = await admin
      .from('activos')
      .insert({
        tenant_id: tenantId,
        codigo,
        nombre: codigo,
        categoria_id: categoriaId,
        tipo_id: tipoId,
        naturaleza_bien: 'bien_propio',
        origen: 'comprado',
        estado: 'en_servicio',
      })
      .select('id')
      .single<{ id: string }>()
    if (error) throw new Error(`fixture activo ${codigo}: ${error.message}`)
    return data.id
  }

  type OtInsert = Database['public']['Tables']['mant_ordenes_trabajo']['Insert']
  async function crearOt(
    tenantId: string,
    titulo: string,
    overrides: Partial<OtInsert> = {},
  ): Promise<string> {
    const tipoMantId = await idListaTipos('TIPO_MANTENIMIENTO', 'correctivo')
    const { data, error } = await admin
      .from('mant_ordenes_trabajo')
      .insert({
        tenant_id: tenantId,
        titulo,
        tipo_mantenimiento_id: tipoMantId,
        origen: 'manual',
        ...overrides,
      })
      .select('id')
      .single<{ id: string }>()
    if (error) throw new Error(`fixture OT ${titulo}: ${error.message}`)
    return data.id
  }

  async function crearPeriodo(tenantId: string, anio: number, mes: number): Promise<string> {
    const { data, error } = await admin
      .from('periodos')
      .insert({ tenant_id: tenantId, anio, mes })
      .select('id')
      .single<{ id: string }>()
    if (error) throw new Error(`fixture periodo: ${error.message}`)
    return data.id
  }

  async function unaHojaEgreso(tenantId: string): Promise<string> {
    const { data, error } = await admin
      .from('presupuesto_cuenta')
      .select('id, contable_cuenta:contable_cuenta_id!inner(requiere_tercero)')
      .eq('tenant_id', tenantId)
      .eq('naturaleza', 'egreso')
      .eq('es_hoja', true)
      .eq('activa', true)
      .eq('contable_cuenta.requiere_tercero', false)
      .limit(1)
      .single<{ id: string }>()
    if (error) throw new Error(`fixture hoja egreso: ${error.message}`)
    return data.id
  }

  async function registrarEjecucion(
    tenantId: string,
    periodoId: string,
    monto: number,
    activoId: string | null,
  ): Promise<void> {
    const hoja = await unaHojaEgreso(tenantId)
    const centroCostoId = await idListaTipos('CENTRO_COSTO', 'mantenimiento')
    const { error } = await admin.from('presupuesto_ejecucion').insert({
      tenant_id: tenantId,
      cuenta_id: hoja,
      periodo_id: periodoId,
      monto,
      liquidacion: 'pagado_caja',
      fecha_documento: FECHA,
      centro_costo_id: centroCostoId,
      activo_id: activoId,
    })
    if (error) throw new Error(`fixture presupuesto_ejecucion: ${error.message}`)
  }

  it('1. el stock se deriva de los movimientos — no existe columna de stock actual', async () => {
    // Estructural: ninguna columna de mant_repuestos/mant_inventario_movimientos se llama
    // "stock"/"stock_actual" — solo mant_stock() lo deriva.
    if (dbUrl) {
      const client = new Client({ connectionString: dbUrl })
      await client.connect()
      try {
        const { rows } = await client.query<{ table_name: string; column_name: string }>(`
          select table_name, column_name from information_schema.columns
          where table_schema = 'public'
            and table_name in ('mant_repuestos', 'mant_inventario_movimientos', 'mant_almacenes')
        `)
        const prohibidas = rows.filter(
          (r) => r.column_name === 'stock' || r.column_name === 'stock_actual',
        )
        expect(prohibidas, JSON.stringify(prohibidas)).toHaveLength(0)
      } finally {
        await client.end()
      }
    }

    const { tenantId } = await crearTenantCompleto('stock-derivado')
    const repuestoId = await crearRepuesto(tenantId, `SKU-${RUN_ID}-1`)
    const almacenId = await crearAlmacen(tenantId, 'Principal')

    await admin.from('mant_inventario_movimientos').insert({
      tenant_id: tenantId,
      repuesto_id: repuestoId,
      almacen_id: almacenId,
      tipo: 'entrada',
      cantidad: 10,
    })
    await admin.from('mant_inventario_movimientos').insert({
      tenant_id: tenantId,
      repuesto_id: repuestoId,
      almacen_id: almacenId,
      tipo: 'salida',
      cantidad: 3,
    })

    const { data: stock, error } = await admin.rpc('mant_stock', {
      p_tenant_id: tenantId,
      p_repuesto_id: repuestoId,
      p_almacen_id: almacenId,
      p_fecha: FECHA_HOY(),
    })
    expect(error).toBeNull()
    expect(Number(stock)).toBe(7)
  }, 30_000)

  it('2. una salida que dejaría stock negativo falla con STOCK_INSUFICIENTE', async () => {
    const { tenantId } = await crearTenantCompleto('stock-insuficiente')
    const repuestoId = await crearRepuesto(tenantId, `SKU-${RUN_ID}-2`)
    const almacenId = await crearAlmacen(tenantId, 'Principal')

    await admin.from('mant_inventario_movimientos').insert({
      tenant_id: tenantId,
      repuesto_id: repuestoId,
      almacen_id: almacenId,
      tipo: 'entrada',
      cantidad: 5,
    })
    const { error } = await admin.from('mant_inventario_movimientos').insert({
      tenant_id: tenantId,
      repuesto_id: repuestoId,
      almacen_id: almacenId,
      tipo: 'salida',
      cantidad: 10,
    })
    expect(error?.message).toContain('STOCK_INSUFICIENTE')
  }, 30_000)

  it('3. un ajuste sin motivo falla con AJUSTE_SIN_MOTIVO', async () => {
    const { tenantId } = await crearTenantCompleto('ajuste-sin-motivo')
    const repuestoId = await crearRepuesto(tenantId, `SKU-${RUN_ID}-3`)
    const almacenId = await crearAlmacen(tenantId, 'Principal')

    const { error } = await admin.from('mant_inventario_movimientos').insert({
      tenant_id: tenantId,
      repuesto_id: repuestoId,
      almacen_id: almacenId,
      tipo: 'ajuste',
      direccion: 1,
      cantidad: 5,
    })
    expect(error?.message).toContain('AJUSTE_SIN_MOTIVO')
  }, 30_000)

  it('4. los movimientos son append-only: update y delete fallan', async () => {
    const { tenantId } = await crearTenantCompleto('append-only')
    const repuestoId = await crearRepuesto(tenantId, `SKU-${RUN_ID}-4`)
    const almacenId = await crearAlmacen(tenantId, 'Principal')

    const { data: mov } = await admin
      .from('mant_inventario_movimientos')
      .insert({
        tenant_id: tenantId,
        repuesto_id: repuestoId,
        almacen_id: almacenId,
        tipo: 'entrada',
        cantidad: 5,
      })
      .select('id')
      .single<{ id: string }>()

    const { error: errUpdate } = await admin
      .from('mant_inventario_movimientos')
      .update({ cantidad: 999 })
      .eq('id', mov!.id)
    expect(errUpdate?.message).toContain('APPEND_ONLY')

    const { error: errDelete } = await admin
      .from('mant_inventario_movimientos')
      .delete()
      .eq('id', mov!.id)
    expect(errDelete?.message).toContain('APPEND_ONLY')
  }, 30_000)

  it('5. una cantidad negativa (o cero) falla con MOVIMIENTO_CANTIDAD_INVALIDA', async () => {
    const { tenantId } = await crearTenantCompleto('cantidad-invalida')
    const repuestoId = await crearRepuesto(tenantId, `SKU-${RUN_ID}-5`)
    const almacenId = await crearAlmacen(tenantId, 'Principal')

    const { error } = await admin.from('mant_inventario_movimientos').insert({
      tenant_id: tenantId,
      repuesto_id: repuestoId,
      almacen_id: almacenId,
      tipo: 'entrada',
      cantidad: -1,
    })
    expect(error?.message).toContain('MOVIMIENTO_CANTIDAD_INVALIDA')
  }, 30_000)

  it('6. consumir en una OT genera el movimiento de salida enlazado y descuenta el stock', async () => {
    const { tenantId, cliente } = await crearTenantCompleto('consumo-ot')
    const repuestoId = await crearRepuesto(tenantId, `SKU-${RUN_ID}-6`)
    const almacenId = await crearAlmacen(tenantId, 'Principal')
    const otId = await crearOt(tenantId, 'OT consumo')

    await admin.from('mant_inventario_movimientos').insert({
      tenant_id: tenantId,
      repuesto_id: repuestoId,
      almacen_id: almacenId,
      tipo: 'entrada',
      cantidad: 20,
    })

    const { data: movimiento, error } = await cliente
      .rpc('fn_mant_registrar_consumo', {
        p_ot_id: otId,
        p_repuesto_id: repuestoId,
        p_almacen_id: almacenId,
        p_cantidad: 4,
        p_costo_unitario: 2500,
      })
      .single<Database['public']['Tables']['mant_inventario_movimientos']['Row']>()
    expect(error).toBeNull()
    expect(movimiento!.tipo).toBe('salida')
    expect(movimiento!.orden_trabajo_id).toBe(otId)

    const { data: stock } = await admin.rpc('mant_stock', {
      p_tenant_id: tenantId,
      p_repuesto_id: repuestoId,
      p_almacen_id: almacenId,
      p_fecha: FECHA_HOY(),
    })
    expect(Number(stock)).toBe(16)
  }, 30_000)

  it('7. sin política contable, el consumo queda pendiente de contabilizar (no se aborta)', async () => {
    const { tenantId, cliente } = await crearTenantCompleto('sin-politica')
    const repuestoId = await crearRepuesto(tenantId, `SKU-${RUN_ID}-7`)
    const almacenId = await crearAlmacen(tenantId, 'Principal')
    const otId = await crearOt(tenantId, 'OT sin política')

    await admin.from('mant_inventario_movimientos').insert({
      tenant_id: tenantId,
      repuesto_id: repuestoId,
      almacen_id: almacenId,
      tipo: 'entrada',
      cantidad: 10,
    })
    const { data: movimiento, error } = await cliente
      .rpc('fn_mant_registrar_consumo', {
        p_ot_id: otId,
        p_repuesto_id: repuestoId,
        p_almacen_id: almacenId,
        p_cantidad: 2,
      })
      .single<Database['public']['Tables']['mant_inventario_movimientos']['Row']>()
    expect(error).toBeNull()
    expect(movimiento!.presupuesto_ejecucion_id).toBeNull()

    const { data: pendientes, error: errPendientes } = await admin.rpc(
      'mant_inventario_pendientes_contabilizar',
      { p_tenant_id: tenantId },
    )
    expect(errPendientes).toBeNull()
    const fila = pendientes!.find(
      (p: { movimiento_id: string }) => p.movimiento_id === movimiento!.id,
    )
    expect(fila).toBeDefined()
    expect(fila!.motivo_bloqueo).toBe('INVENTARIO_POLITICA_CONTABLE_NO_DEFINIDA')
  }, 30_000)

  it('8. la devolución de material es un movimiento nuevo, no una edición', async () => {
    const { tenantId, cliente } = await crearTenantCompleto('devolucion')
    const repuestoId = await crearRepuesto(tenantId, `SKU-${RUN_ID}-8`)
    const almacenId = await crearAlmacen(tenantId, 'Principal')
    const otId = await crearOt(tenantId, 'OT devolución')

    await admin.from('mant_inventario_movimientos').insert({
      tenant_id: tenantId,
      repuesto_id: repuestoId,
      almacen_id: almacenId,
      tipo: 'entrada',
      cantidad: 10,
    })
    const { data: consumo } = await cliente
      .rpc('fn_mant_registrar_consumo', {
        p_ot_id: otId,
        p_repuesto_id: repuestoId,
        p_almacen_id: almacenId,
        p_cantidad: 5,
      })
      .single<Database['public']['Tables']['mant_inventario_movimientos']['Row']>()

    const { data: devolucion, error } = await cliente
      .rpc('fn_mant_registrar_devolucion', {
        p_ot_id: otId,
        p_repuesto_id: repuestoId,
        p_almacen_id: almacenId,
        p_cantidad: 2,
      })
      .single<Database['public']['Tables']['mant_inventario_movimientos']['Row']>()
    expect(error).toBeNull()
    expect(devolucion!.tipo).toBe('entrada')
    expect(devolucion!.orden_trabajo_id).toBe(otId)
    expect(devolucion!.id).not.toBe(consumo!.id)

    const { data: movimientosOt } = await admin
      .from('mant_inventario_movimientos')
      .select('id')
      .eq('orden_trabajo_id', otId)
    expect(movimientosOt).toHaveLength(2)

    const { data: original } = await admin
      .from('mant_inventario_movimientos')
      .select('cantidad')
      .eq('id', consumo!.id)
      .single<{ cantidad: number }>()
    expect(original!.cantidad).toBe(5)
  }, 30_000)

  dPg('estructural: mant_costos', () => {
    it('9. mant_costos lee exclusivamente de presupuesto_ejecucion', async () => {
      const client = new Client({ connectionString: dbUrl })
      await client.connect()
      try {
        const { rows } = await client.query<{ definicion: string }>(`
          select pg_get_functiondef(p.oid) as definicion
          from pg_proc p
          join pg_namespace n on n.oid = p.pronamespace
          where n.nspname = 'public' and p.proname = 'mant_costos'
        `)
        expect(rows).toHaveLength(1)
        const definicion = rows[0]!.definicion.toLowerCase()
        expect(definicion).toContain('presupuesto_ejecucion')
        expect(definicion).not.toContain('mant_inventario_movimientos')
        expect(definicion).not.toContain('mant_repuestos')
      } finally {
        await client.end()
      }
    }, 30_000)
  })

  it('10. el costo por activo coincide con la suma de presupuesto_ejecucion filtrada por ese activo_id', async () => {
    const { tenantId } = await crearTenantCompleto('costo-por-activo')
    const activoId = await crearActivoMinimo(tenantId, `ACT-${RUN_ID}`)
    const periodoId = await crearPeriodo(tenantId, ANIO, MES)

    await registrarEjecucion(tenantId, periodoId, 150_000, activoId)
    await registrarEjecucion(tenantId, periodoId, 80_000, activoId)
    // Ruido: un gasto sin activo no debe contarse.
    await registrarEjecucion(tenantId, periodoId, 999_999, null)

    const { data: costos, error } = await admin.rpc('mant_costos', {
      p_tenant_id: tenantId,
      p_desde: '2026-01-01',
      p_hasta: '2026-01-31',
    })
    expect(error).toBeNull()
    const fila = costos!.find((c: { activo_id: string | null }) => c.activo_id === activoId)
    expect(fila).toBeDefined()
    expect(fila!.monto).toBe(230_000)
  }, 30_000)

  it('11. el costo_estimado de la OT nunca sustituye al real en ninguna consulta', async () => {
    const { tenantId } = await crearTenantCompleto('costo-estimado')
    const activoId = await crearActivoMinimo(tenantId, `ACT-EST-${RUN_ID}`)
    const otId = await crearOt(tenantId, 'OT con estimado', {
      activo_id: activoId,
      costo_estimado: 5_000_000,
    })
    const periodoId = await crearPeriodo(tenantId, ANIO, MES)

    // Sin ningún presupuesto_ejecucion real todavía — mant_costos no debe mostrar nada para este
    // activo, aunque la OT tenga un costo_estimado enorme.
    const { data: costosAntes } = await admin.rpc('mant_costos', {
      p_tenant_id: tenantId,
      p_desde: '2026-01-01',
      p_hasta: '2026-01-31',
    })
    expect(costosAntes!.some((c: { activo_id: string | null }) => c.activo_id === activoId)).toBe(
      false,
    )

    await registrarEjecucion(tenantId, periodoId, 300_000, activoId)
    const { data: costosDespues } = await admin.rpc('mant_costos', {
      p_tenant_id: tenantId,
      p_desde: '2026-01-01',
      p_hasta: '2026-01-31',
    })
    const fila = costosDespues!.find((c: { activo_id: string | null }) => c.activo_id === activoId)
    expect(fila).toBeDefined()
    // El monto real (300.000) nunca coincide con costo_estimado (5.000.000) — si mant_costos
    // alguna vez lo sustituyera por error, esta igualdad fallaría de otra forma.
    expect(fila!.monto).toBe(300_000)
    expect(fila!.monto).not.toBe(5_000_000)

    const { data: ot } = await admin
      .from('mant_ordenes_trabajo')
      .select('costo_estimado')
      .eq('id', otId)
      .single<{ costo_estimado: number }>()
    expect(ot!.costo_estimado).toBe(5_000_000)
  }, 30_000)

  it('12. el cron de alertas no genera compras ni cambia estados de repuestos/OT', async () => {
    const { tenantId } = await crearTenantCompleto('alertas-sin-compras')
    const repuestoId = await crearRepuesto(tenantId, `SKU-${RUN_ID}-12`, { stock_minimo: 10 })
    const almacenId = await crearAlmacen(tenantId, 'Principal')

    await admin.from('mant_inventario_movimientos').insert({
      tenant_id: tenantId,
      repuesto_id: repuestoId,
      almacen_id: almacenId,
      tipo: 'entrada',
      cantidad: 3,
    })

    const { error } = await admin.rpc('cron_mant_inventario_alertas_diario')
    expect(error).toBeNull()

    const { data: alertas } = await admin
      .from('mant_inventario_alertas')
      .select('tipo_alerta')
      .eq('tenant_id', tenantId)
      .eq('repuesto_id', repuestoId)
    expect(alertas!.some((a) => a.tipo_alerta === 'stock_bajo')).toBe(true)

    // No hay ninguna tabla de órdenes de compra en el esquema — no genera compras (fuera de
    // alcance del corte, verificado por ausencia). El repuesto y sus umbrales quedan intactos.
    const { data: repuesto } = await admin
      .from('mant_repuestos')
      .select('stock_minimo, activo')
      .eq('id', repuestoId)
      .single<{ stock_minimo: number; activo: boolean }>()
    expect(repuesto!.stock_minimo).toBe(10)
    expect(repuesto!.activo).toBe(true)
  }, 30_000)

  it('13. se reutilizó UNIDAD_MEDIDA — no hay catálogo nuevo de unidades', async () => {
    const unidadId = await idListaTipos('UNIDAD_MEDIDA', 'kg')
    const { tenantId } = await crearTenantCompleto('unidad-medida')
    const repuestoId = await crearRepuesto(tenantId, `SKU-${RUN_ID}-13`, { unidad_id: unidadId })
    const { data: repuesto, error } = await admin
      .from('mant_repuestos')
      .select('unidad_id')
      .eq('id', repuestoId)
      .single<{ unidad_id: number }>()
    expect(error).toBeNull()
    expect(repuesto!.unidad_id).toBe(unidadId)

    const { data: familias } = await admin.from('tipos').select('codigo').ilike('codigo', 'UNIDAD%')
    expect(familias!.map((f) => f.codigo)).toEqual(['UNIDAD_MEDIDA'])
  }, 30_000)

  async function cuentaPorCodigo(tenantId: string, codigo: string): Promise<string> {
    const { data, error } = await admin
      .from('contable_cuenta')
      .select('id')
      .eq('tenant_id', tenantId)
      .eq('codigo', codigo)
      .single<{ id: string }>()
    if (error) throw new Error(`fixture cuenta contable ${codigo}: ${error.message}`)
    return data.id
  }

  async function mapearEventoContable(
    tenantId: string,
    codigoEvento: string,
    contableCuentaId: string,
  ): Promise<void> {
    const evento = await idListaTipos('EVENTO_CONTABLE', codigoEvento)
    // upsert, no insert: fix MANT-6 (20260935160000) sembró un default propio para
    // CONSUMO_REPUESTO_MANTENIMIENTO en create_tenant() — un insert plano chocaría con esa fila
    // ya existente (contable_cuenta_default_pkey).
    const { error } = await admin
      .from('contable_cuenta_default')
      .upsert(
        { tenant_id: tenantId, evento_id: evento, contable_cuenta_id: contableCuentaId },
        { onConflict: 'tenant_id,evento_id' },
      )
    if (error) throw new Error(`fixture contable_cuenta_default ${codigoEvento}: ${error.message}`)
  }

  it('15. politica_contable inventario sin contable_cuenta_id falla con REPUESTO_POLITICA_INVENTARIO_SIN_CUENTA', async () => {
    const { tenantId } = await crearTenantCompleto('inv-sin-cuenta')
    const categoriaId = await idListaTipos('CATEGORIA_REPUESTO', 'ferreteria')
    const { error } = await admin.from('mant_repuestos').insert({
      tenant_id: tenantId,
      sku: `SKU-${RUN_ID}-15`,
      nombre: 'Repuesto sin cuenta',
      categoria_id: categoriaId,
      politica_contable: 'inventario',
    })
    expect(error?.message).toContain('REPUESTO_POLITICA_INVENTARIO_SIN_CUENTA')
  }, 30_000)

  it('16. politica_contable inventario con cuenta de clase distinta de 1 falla con CUENTA_CONTABLE_CLASE_INCOMPATIBLE', async () => {
    const { tenantId } = await crearTenantCompleto('inv-clase-mala')
    const cuentaGasto = await cuentaPorCodigo(tenantId, '5530')
    const { error } = await admin.from('mant_repuestos').insert({
      tenant_id: tenantId,
      sku: `SKU-${RUN_ID}-16`,
      nombre: 'Repuesto con cuenta de gasto',
      categoria_id: await idListaTipos('CATEGORIA_REPUESTO', 'ferreteria'),
      politica_contable: 'inventario',
      contable_cuenta_id: cuentaGasto,
    })
    expect(error?.message).toContain('CUENTA_CONTABLE_CLASE_INCOMPATIBLE')
  }, 30_000)

  it('17. consumir un repuesto con política inventario genera el comprobante Débito gasto / Crédito existencias', async () => {
    const { tenantId, cliente } = await crearTenantCompleto('inv-consumo-contable')
    const cuentaExistencias = await cuentaPorCodigo(tenantId, '1410')
    // 5915 no exige tercero ni centro de costo (dim '' en el PUC seed) — el fixture no necesita
    // un activo con centro_costo_id para probar la generación del comprobante en sí.
    const cuentaGasto = await cuentaPorCodigo(tenantId, '5915')
    await mapearEventoContable(tenantId, 'CONSUMO_REPUESTO_MANTENIMIENTO', cuentaGasto)

    const repuestoId = await crearRepuesto(tenantId, `SKU-${RUN_ID}-17`, {
      politica_contable: 'inventario',
      contable_cuenta_id: cuentaExistencias,
    })
    const almacenId = await crearAlmacen(tenantId, 'Principal')
    const otId = await crearOt(tenantId, 'OT con política inventario')
    const periodoId = await crearPeriodo(tenantId, ANIO, MES)

    await admin.from('mant_inventario_movimientos').insert({
      tenant_id: tenantId,
      repuesto_id: repuestoId,
      almacen_id: almacenId,
      tipo: 'entrada',
      cantidad: 20,
    })

    const { data: movimiento, error } = await cliente
      .rpc('fn_mant_registrar_consumo', {
        p_ot_id: otId,
        p_repuesto_id: repuestoId,
        p_almacen_id: almacenId,
        p_cantidad: 5,
        p_costo_unitario: 1000,
        p_periodo_id: periodoId,
      })
      .single<Database['public']['Tables']['mant_inventario_movimientos']['Row']>()
    expect(error).toBeNull()
    expect(movimiento!.tipo).toBe('salida')

    const { data: comprobante, error: errComp } = await admin
      .from('contable_comprobante')
      .select('id, estado, origen_evento')
      .eq('tenant_id', tenantId)
      .eq('origen_modulo', 'mantenimiento')
      .eq('origen_entidad', 'mant_inventario_movimientos')
      .eq('origen_id', movimiento!.id)
      .single<{ id: string; estado: string; origen_evento: string }>()
    expect(errComp).toBeNull()
    expect(comprobante!.estado).toBe('contabilizado')
    expect(comprobante!.origen_evento).toBe('consumo_repuesto')

    const { data: detalle, error: errDet } = await admin
      .from('contable_comprobante_detalle')
      .select('cuenta_id, debito, credito')
      .eq('comprobante_id', comprobante!.id)
      .order('linea')
    expect(errDet).toBeNull()
    expect(detalle).toHaveLength(2)
    expect(detalle![0]!.cuenta_id).toBe(cuentaGasto)
    expect(detalle![0]!.debito).toBe(5000)
    expect(detalle![0]!.credito).toBe(0)
    expect(detalle![1]!.cuenta_id).toBe(cuentaExistencias)
    expect(detalle![1]!.debito).toBe(0)
    expect(detalle![1]!.credito).toBe(5000)

    const { data: pendientes } = await admin.rpc('mant_inventario_pendientes_contabilizar', {
      p_tenant_id: tenantId,
    })
    expect(
      pendientes!.some((p: { movimiento_id: string }) => p.movimiento_id === movimiento!.id),
    ).toBe(false)
  }, 30_000)

  it('18. consumo con política inventario pero sin costo_unitario/periodo_id se registra físicamente y queda pendiente con INVENTARIO_CONSUMO_SIN_CONTABILIZAR', async () => {
    const { tenantId, cliente } = await crearTenantCompleto('inv-consumo-incompleto')
    const cuentaExistencias = await cuentaPorCodigo(tenantId, '1410')
    const repuestoId = await crearRepuesto(tenantId, `SKU-${RUN_ID}-18`, {
      politica_contable: 'inventario',
      contable_cuenta_id: cuentaExistencias,
    })
    const almacenId = await crearAlmacen(tenantId, 'Principal')
    const otId = await crearOt(tenantId, 'OT inventario incompleta')

    await admin.from('mant_inventario_movimientos').insert({
      tenant_id: tenantId,
      repuesto_id: repuestoId,
      almacen_id: almacenId,
      tipo: 'entrada',
      cantidad: 10,
    })

    const { data: movimiento, error } = await cliente
      .rpc('fn_mant_registrar_consumo', {
        p_ot_id: otId,
        p_repuesto_id: repuestoId,
        p_almacen_id: almacenId,
        p_cantidad: 3,
      })
      .single<Database['public']['Tables']['mant_inventario_movimientos']['Row']>()
    expect(error).toBeNull()
    expect(movimiento!.tipo).toBe('salida')

    const { data: pendientes, error: errPendientes } = await admin.rpc(
      'mant_inventario_pendientes_contabilizar',
      { p_tenant_id: tenantId },
    )
    expect(errPendientes).toBeNull()
    const fila = pendientes!.find(
      (p: { movimiento_id: string }) => p.movimiento_id === movimiento!.id,
    )
    expect(fila).toBeDefined()
    expect(fila!.motivo_bloqueo).toBe('INVENTARIO_CONSUMO_SIN_CONTABILIZAR')
  }, 30_000)

  it('19. politica_contable gasto_directo (default) nunca genera comprobante, aunque se pasen costo_unitario y periodo_id', async () => {
    const { tenantId, cliente } = await crearTenantCompleto('gasto-directo-explicito')
    const repuestoId = await crearRepuesto(tenantId, `SKU-${RUN_ID}-19`)
    const almacenId = await crearAlmacen(tenantId, 'Principal')
    const otId = await crearOt(tenantId, 'OT gasto directo')
    const periodoId = await crearPeriodo(tenantId, ANIO, MES)

    await admin.from('mant_inventario_movimientos').insert({
      tenant_id: tenantId,
      repuesto_id: repuestoId,
      almacen_id: almacenId,
      tipo: 'entrada',
      cantidad: 10,
    })

    const { data: movimiento, error } = await cliente
      .rpc('fn_mant_registrar_consumo', {
        p_ot_id: otId,
        p_repuesto_id: repuestoId,
        p_almacen_id: almacenId,
        p_cantidad: 3,
        p_costo_unitario: 500,
        p_periodo_id: periodoId,
      })
      .single<Database['public']['Tables']['mant_inventario_movimientos']['Row']>()
    expect(error).toBeNull()

    const { count } = await admin
      .from('contable_comprobante')
      .select('id', { count: 'exact', head: true })
      .eq('tenant_id', tenantId)
      .eq('origen_entidad', 'mant_inventario_movimientos')
      .eq('origen_id', movimiento!.id)
    expect(count).toBe(0)
  }, 30_000)

  it('14. aislamiento entre tenants', async () => {
    const { tenantId: tenantA } = await crearTenantCompleto('aislamiento-a')
    const { tenantId: tenantB, cliente: clienteB } = await crearTenantCompleto('aislamiento-b')
    const repuestoA = await crearRepuesto(tenantA, `SKU-${RUN_ID}-14A`)
    const almacenA = await crearAlmacen(tenantA, 'Principal A')

    const { data: visible } = await clienteB.from('mant_repuestos').select('id').eq('id', repuestoA)
    expect(visible).toHaveLength(0)

    const { error } = await clienteB.from('mant_inventario_movimientos').insert({
      tenant_id: tenantB,
      repuesto_id: repuestoA,
      almacen_id: almacenA,
      tipo: 'entrada',
      cantidad: 1,
    })
    expect(error).not.toBeNull()
  }, 30_000)
})

function FECHA_HOY(): string {
  return new Date().toISOString().slice(0, 10)
}
