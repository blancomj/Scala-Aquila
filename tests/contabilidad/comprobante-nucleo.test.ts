/**
 * CO-2 (20260930180000-20260930220000) — núcleo del libro contable.
 * Ver Casos de uso/Tres Modulos/Contabilidad/CO_02_nucleo_libro_contable.md §5.
 *
 * fn_contabilizar_comprobante/fn_reversar_comprobante son SECURITY DEFINER con verificación
 * INTERNA de has_role (§3.8) — eso exige un auth.uid() real. Llamarlas con el cliente `admin`
 * (service_role, sin sesión) siempre da FORBIDDEN, así que estas dos RPC se invocan con un
 * cliente autenticado como auxiliar (`auxiliar`, devuelto por crearTenantConPlan); todo lo demás
 * (fixtures, RLS de otras tablas, tests de rol) usa `admin` como en el resto del repo.
 *
 * Criterio #16 (los dos enums nuevos tienen COMMENT ON TYPE) ya lo cubre, estáticamente,
 * tests/governance/enum-lista-tipos-coverage.test.ts — no se repite aquí.
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
  type UsuarioPrueba,
} from '../rls/helpers.js'

const env = leerEntorno()
const d = env ? describe : describe.skip

if (!env) {
  console.warn('SALTADO tests/contabilidad/comprobante-nucleo: faltan variables de Supabase en .env')
}

d('CO-2: núcleo del libro contable', () => {
  const admin = clienteAdmin(env!)
  const tenantsCreados: string[] = []
  const usuariosCreados: UsuarioPrueba[] = []

  afterAll(async () => {
    for (const id of tenantsCreados) await eliminarTenant(admin, id)
    for (const usuario of usuariosCreados) await eliminarUsuario(admin, usuario.id)
  }, 60_000)

  async function crearTenantConPlan(
    etiqueta: string,
  ): Promise<{ tenantId: string; auxiliar: Cliente }> {
    const tenant = await crearTenant(admin, etiqueta)
    tenantsCreados.push(tenant.id)
    const { error } = await admin.rpc('fn_instanciar_plan_contable', { p_tenant_id: tenant.id })
    if (error) throw error

    const usuario = await crearUsuario(admin, etiqueta)
    usuariosCreados.push(usuario)
    await crearMembership(admin, tenant.id, usuario.id, 'auxiliar')
    const auxiliar = await clienteComo(env!, usuario)

    return { tenantId: tenant.id, auxiliar }
  }

  async function crearPeriodo(
    tenantId: string,
    anio: number,
    mes: number,
    contableEstado: 'abierto' | 'cerrado' | 'bloqueado' = 'abierto',
  ): Promise<string> {
    const { data, error } = await admin
      .from('periodos')
      .insert({ tenant_id: tenantId, anio, mes })
      .select('id')
      .single<{ id: string }>()
    if (error) throw new Error(`fixture periodo: ${error.message}`)
    if (contableEstado !== 'abierto') {
      // abierto -> cerrado -> bloqueado, un paso a la vez (guard_contable_periodo_transicion).
      const { error: errCerrar } = await admin
        .from('periodos')
        .update({ contable_estado: 'cerrado' })
        .eq('id', data.id)
      if (errCerrar) throw errCerrar
      if (contableEstado === 'bloqueado') {
        const { error: errBloquear } = await admin
          .from('periodos')
          .update({ contable_estado: 'bloqueado' })
          .eq('id', data.id)
        if (errBloquear) throw errBloquear
      }
    }
    return data.id
  }

  /** fn_reversar_comprobante fecha la reversión en current_date (es lo correcto para uso real:
   * una reversión se contabiliza el día en que de verdad se hace) — así que el periodo destino
   * en las pruebas tiene que cubrir la fecha real de hoy, no un año ficticio como los demás
   * fixtures de este archivo. */
  async function crearPeriodoActual(tenantId: string): Promise<string> {
    const hoy = new Date()
    return crearPeriodo(tenantId, hoy.getFullYear(), hoy.getMonth() + 1)
  }

  async function tipoComprobanteId(codigo: string): Promise<number> {
    const { data, error } = await admin
      .from('lista_tipos')
      .select('id')
      .eq('tipo', 'TIPO_COMPROBANTE')
      .eq('codigo', codigo)
      .single<{ id: number }>()
    if (error) throw error
    return data.id
  }

  async function cuentaPorCodigo(tenantId: string, codigo: string): Promise<string> {
    const { data, error } = await admin
      .from('contable_cuenta')
      .select('id')
      .eq('tenant_id', tenantId)
      .eq('codigo', codigo)
      .single<{ id: string }>()
    if (error) throw error
    return data.id
  }

  interface LineaFixture {
    cuenta_id: string
    debito: number
    credito: number
  }

  async function crearBorrador(params: {
    tenantId: string
    periodoId: string
    tipoId: number
    fecha: string
    lineas: LineaFixture[]
    origen?: { modulo: string; entidad: string; id: string; evento: string }
  }): Promise<string> {
    const { data: periodo } = await admin
      .from('periodos')
      .select('anio')
      .eq('id', params.periodoId)
      .single<{ anio: number }>()

    const { data: comp, error: errComp } = await admin
      .from('contable_comprobante')
      .insert({
        tenant_id: params.tenantId,
        periodo_id: params.periodoId,
        tipo_id: params.tipoId,
        anio: periodo!.anio,
        fecha: params.fecha,
        descripcion: 'Comprobante de prueba',
        ...(params.origen
          ? {
              origen_modulo: params.origen.modulo,
              origen_entidad: params.origen.entidad,
              origen_id: params.origen.id,
              origen_evento: params.origen.evento,
            }
          : {}),
      })
      .select('id')
      .single<{ id: string }>()
    if (errComp) throw errComp

    const filas = params.lineas.map((l, i) => ({
      tenant_id: params.tenantId,
      comprobante_id: comp.id,
      linea: i + 1,
      cuenta_id: l.cuenta_id,
      debito: l.debito,
      credito: l.credito,
    }))
    const { error: errDetalle } = await admin.from('contable_comprobante_detalle').insert(filas)
    if (errDetalle) throw errDetalle

    return comp.id
  }

  it('1. SUM(debito) ≠ SUM(credito) no se puede contabilizar', async () => {
    const { tenantId, auxiliar } = await crearTenantConPlan('descuadre')
    const periodoId = await crearPeriodo(tenantId, 2031, 1)
    const tipoId = await tipoComprobanteId('INGRESO')
    const caja = await cuentaPorCodigo(tenantId, '110505')
    const honorarios = await cuentaPorCodigo(tenantId, '5105')

    const compId = await crearBorrador({
      tenantId,
      periodoId,
      tipoId,
      fecha: '2031-01-15',
      lineas: [
        { cuenta_id: caja, debito: 100, credito: 0 },
        { cuenta_id: honorarios, debito: 0, credito: 50 },
      ],
    })

    const { error } = await auxiliar.rpc('fn_contabilizar_comprobante', {
      p_comprobante_id: compId,
    })
    expect(error?.message).toContain('COMPROBANTE_DESCUADRADO')
  })

  it('2. una sola línea no se puede contabilizar', async () => {
    const { tenantId, auxiliar } = await crearTenantConPlan('sin-detalle')
    const periodoId = await crearPeriodo(tenantId, 2031, 1)
    const tipoId = await tipoComprobanteId('INGRESO')
    const caja = await cuentaPorCodigo(tenantId, '110505')

    const compId = await crearBorrador({
      tenantId,
      periodoId,
      tipoId,
      fecha: '2031-01-15',
      lineas: [{ cuenta_id: caja, debito: 100, credito: 0 }],
    })

    const { error } = await auxiliar.rpc('fn_contabilizar_comprobante', {
      p_comprobante_id: compId,
    })
    expect(error?.message).toContain('COMPROBANTE_SIN_DETALLE')
  })

  it('3. una línea con débito y crédito a la vez viola el check', async () => {
    const { tenantId } = await crearTenantConPlan('ambos-lados')
    const periodoId = await crearPeriodo(tenantId, 2031, 1)
    const tipoId = await tipoComprobanteId('INGRESO')
    const caja = await cuentaPorCodigo(tenantId, '110505')

    await expect(
      crearBorrador({
        tenantId,
        periodoId,
        tipoId,
        fecha: '2031-01-15',
        lineas: [{ cuenta_id: caja, debito: 10, credito: 10 }],
      }),
    ).rejects.toThrow()
  })

  it('4. una línea con ambos lados en cero viola el check', async () => {
    const { tenantId } = await crearTenantConPlan('ambos-cero')
    const periodoId = await crearPeriodo(tenantId, 2031, 1)
    const tipoId = await tipoComprobanteId('INGRESO')
    const caja = await cuentaPorCodigo(tenantId, '110505')

    await expect(
      crearBorrador({
        tenantId,
        periodoId,
        tipoId,
        fecha: '2031-01-15',
        lineas: [{ cuenta_id: caja, debito: 0, credito: 0 }],
      }),
    ).rejects.toThrow()
  })

  it('5. contabilizar asigna número; el siguiente recibe numero + 1', async () => {
    const { tenantId, auxiliar } = await crearTenantConPlan('numeracion')
    const periodoId = await crearPeriodo(tenantId, 2032, 1)
    const tipoId = await tipoComprobanteId('EGRESO')
    const caja = await cuentaPorCodigo(tenantId, '110505')
    const bancos = await cuentaPorCodigo(tenantId, '111005') // sin dimensiones requeridas

    const lineas = [
      { cuenta_id: caja, debito: 0, credito: 100 },
      { cuenta_id: bancos, debito: 100, credito: 0 },
    ]

    const comp1 = await crearBorrador({ tenantId, periodoId, tipoId, fecha: '2032-01-05', lineas })
    const { error: err1 } = await auxiliar.rpc('fn_contabilizar_comprobante', {
      p_comprobante_id: comp1,
    })
    if (err1) throw err1

    const comp2 = await crearBorrador({ tenantId, periodoId, tipoId, fecha: '2032-01-06', lineas })
    const { error: err2 } = await auxiliar.rpc('fn_contabilizar_comprobante', {
      p_comprobante_id: comp2,
    })
    if (err2) throw err2

    const { data: fila1 } = await admin
      .from('contable_comprobante')
      .select('numero')
      .eq('id', comp1)
      .single<{ numero: number }>()
    const { data: fila2 } = await admin
      .from('contable_comprobante')
      .select('numero')
      .eq('id', comp2)
      .single<{ numero: number }>()

    expect(fila1!.numero).not.toBeNull()
    expect(fila2!.numero).toBe(fila1!.numero + 1)
  })

  it('6. sin huecos: 5 borradores, 2 descartados, 3 contabilizados concurrentemente → 1, 2, 3', async () => {
    const { tenantId, auxiliar } = await crearTenantConPlan('sin-huecos')
    const periodoId = await crearPeriodo(tenantId, 2033, 1)
    const tipoId = await tipoComprobanteId('CAUSACION')
    const caja = await cuentaPorCodigo(tenantId, '110505')
    const bancos = await cuentaPorCodigo(tenantId, '111005') // sin dimensiones requeridas
    const lineas = [
      { cuenta_id: caja, debito: 0, credito: 100 },
      { cuenta_id: bancos, debito: 100, credito: 0 },
    ]

    const ids = await Promise.all(
      Array.from({ length: 5 }, (_, i) =>
        crearBorrador({
          tenantId,
          periodoId,
          tipoId,
          fecha: `2033-01-0${(i + 1).toString()}`,
          lineas,
        }),
      ),
    )

    // Dos borradores se descartan (delete permitido en borrador) — no deben consumir número.
    await admin.from('contable_comprobante').delete().eq('id', ids[0]!)
    await admin.from('contable_comprobante').delete().eq('id', ids[1]!)

    const restantes = ids.slice(2)
    const resultados = await Promise.all(
      restantes.map((id) => auxiliar.rpc('fn_contabilizar_comprobante', { p_comprobante_id: id })),
    )
    for (const r of resultados) expect(r.error).toBeNull()

    const { data: filas } = await admin
      .from('contable_comprobante')
      .select('numero')
      .in('id', restantes)
    const numeros = (filas ?? []).map((f) => f.numero).sort((a, b) => (a ?? 0) - (b ?? 0))
    expect(numeros).toEqual([1, 2, 3])
  }, 20_000)

  it('7. un comprobante contabilizado no admite update de descripción ni de sus líneas', async () => {
    const { tenantId, auxiliar } = await crearTenantConPlan('inmutable')
    const periodoId = await crearPeriodo(tenantId, 2031, 2)
    const tipoId = await tipoComprobanteId('INGRESO')
    const caja = await cuentaPorCodigo(tenantId, '110505')
    const bancos = await cuentaPorCodigo(tenantId, '111005') // sin dimensiones requeridas

    const compId = await crearBorrador({
      tenantId,
      periodoId,
      tipoId,
      fecha: '2031-02-10',
      lineas: [
        { cuenta_id: caja, debito: 100, credito: 0 },
        { cuenta_id: bancos, debito: 0, credito: 100 },
      ],
    })
    const { error: errContab } = await auxiliar.rpc('fn_contabilizar_comprobante', {
      p_comprobante_id: compId,
    })
    if (errContab) throw errContab

    // El intento se hace con `admin` (bypassa RLS) a propósito: lo que se prueba aquí es el
    // guard (trigger, corre siempre) de inmutabilidad, no el permiso de escritura.
    const { error: errUpdateComp } = await admin
      .from('contable_comprobante')
      .update({ descripcion: 'Editado' })
      .eq('id', compId)
    expect(errUpdateComp?.message).toContain('COMPROBANTE_CONTABILIZADO_INMUTABLE')

    const { data: detalle } = await admin
      .from('contable_comprobante_detalle')
      .select('id')
      .eq('comprobante_id', compId)
      .limit(1)
      .single<{ id: string }>()
    const { error: errUpdateDetalle } = await admin
      .from('contable_comprobante_detalle')
      .update({ debito: 999 })
      .eq('id', detalle!.id)
    expect(errUpdateDetalle?.message).toContain('COMPROBANTE_CONTABILIZADO_INMUTABLE')
  })

  it('8. contabilizar en un periodo con contable_estado=cerrado falla', async () => {
    const { tenantId, auxiliar } = await crearTenantConPlan('periodo-cerrado')
    const periodoId = await crearPeriodo(tenantId, 2031, 3, 'cerrado')
    const tipoId = await tipoComprobanteId('INGRESO')
    const caja = await cuentaPorCodigo(tenantId, '110505')
    const honorarios = await cuentaPorCodigo(tenantId, '5105')

    const compId = await crearBorrador({
      tenantId,
      periodoId,
      tipoId,
      fecha: '2031-03-10',
      lineas: [
        { cuenta_id: caja, debito: 100, credito: 0 },
        { cuenta_id: honorarios, debito: 0, credito: 100 },
      ],
    })

    const { error } = await auxiliar.rpc('fn_contabilizar_comprobante', {
      p_comprobante_id: compId,
    })
    expect(error?.message).toContain('CONTABLE_PERIODO_CERRADO')
  })

  it('9. una cuenta con dimensión requerida sin diligenciar no se puede contabilizar', async () => {
    const { tenantId, auxiliar } = await crearTenantConPlan('dimension')
    const periodoId = await crearPeriodo(tenantId, 2031, 4)
    const tipoId = await tipoComprobanteId('INGRESO')
    const caja = await cuentaPorCodigo(tenantId, '110505')
    const honorarios = await cuentaPorCodigo(tenantId, '5105') // requiere_centro_costo + requiere_tercero

    const compId = await crearBorrador({
      tenantId,
      periodoId,
      tipoId,
      fecha: '2031-04-10',
      lineas: [
        { cuenta_id: honorarios, debito: 100, credito: 0 },
        { cuenta_id: caja, debito: 0, credito: 100 },
      ],
    })

    const { error } = await auxiliar.rpc('fn_contabilizar_comprobante', {
      p_comprobante_id: compId,
    })
    expect(error?.message).toContain('COMPROBANTE_DIMENSION_REQUERIDA')
  })

  it('10. una cuenta de grupo (permite_movimiento=false) no admite imputación', async () => {
    const { tenantId, auxiliar } = await crearTenantConPlan('grupo-sin-movimiento')
    const periodoId = await crearPeriodo(tenantId, 2031, 5)
    const tipoId = await tipoComprobanteId('INGRESO')
    const caja = await cuentaPorCodigo(tenantId, '110505')
    const activo = await cuentaPorCodigo(tenantId, '1') // ACTIVO, grupo raíz

    const compId = await crearBorrador({
      tenantId,
      periodoId,
      tipoId,
      fecha: '2031-05-10',
      lineas: [
        { cuenta_id: activo, debito: 100, credito: 0 },
        { cuenta_id: caja, debito: 0, credito: 100 },
      ],
    })

    const { error } = await auxiliar.rpc('fn_contabilizar_comprobante', {
      p_comprobante_id: compId,
    })
    expect(error?.message).toContain('CUENTA_CONTABLE_NO_ADMITE_MOVIMIENTO')
  })

  it('11. reversar produce un comprobante con los lados intercambiados; la suma por cuenta es cero', async () => {
    const { tenantId, auxiliar } = await crearTenantConPlan('reversion')
    const periodoId = await crearPeriodo(tenantId, 2031, 6)
    const tipoId = await tipoComprobanteId('INGRESO')
    const caja = await cuentaPorCodigo(tenantId, '110505')
    const bancos = await cuentaPorCodigo(tenantId, '111005') // sin dimensiones requeridas

    const original = await crearBorrador({
      tenantId,
      periodoId,
      tipoId,
      fecha: '2031-06-10',
      lineas: [
        { cuenta_id: caja, debito: 200, credito: 0 },
        { cuenta_id: bancos, debito: 0, credito: 200 },
      ],
    })
    const { error: errContab } = await auxiliar.rpc('fn_contabilizar_comprobante', {
      p_comprobante_id: original,
    })
    if (errContab) throw errContab

    const periodoDestino = await crearPeriodoActual(tenantId)
    const { data: nuevoId, error: errReversar } = await auxiliar.rpc('fn_reversar_comprobante', {
      p_comprobante_id: original,
      p_periodo_destino: periodoDestino,
      p_motivo: 'Prueba de reversión',
    })
    if (errReversar) throw errReversar

    const { data: lineasNuevas } = await admin
      .from('contable_comprobante_detalle')
      .select('cuenta_id, debito, credito')
      .eq('comprobante_id', nuevoId)

    const porCuenta = new Map<string, number>()
    for (const l of [
      { cuenta_id: caja, debito: 200, credito: 0 },
      { cuenta_id: bancos, debito: 0, credito: 200 },
      ...(lineasNuevas ?? []),
    ]) {
      const neto = l.debito - l.credito
      porCuenta.set(l.cuenta_id, (porCuenta.get(l.cuenta_id) ?? 0) + neto)
    }
    for (const neto of porCuenta.values()) expect(neto).toBe(0)

    const { data: original2 } = await admin
      .from('contable_comprobante')
      .select('reversado_por_id')
      .eq('id', original)
      .single<{ reversado_por_id: string }>()
    expect(original2!.reversado_por_id).toBe(nuevoId)
  })

  it('12. reversar dos veces el mismo comprobante falla', async () => {
    const { tenantId, auxiliar } = await crearTenantConPlan('doble-reversion')
    const periodoId = await crearPeriodo(tenantId, 2031, 7)
    const tipoId = await tipoComprobanteId('INGRESO')
    const caja = await cuentaPorCodigo(tenantId, '110505')
    const bancos = await cuentaPorCodigo(tenantId, '111005') // sin dimensiones requeridas

    const original = await crearBorrador({
      tenantId,
      periodoId,
      tipoId,
      fecha: '2031-07-10',
      lineas: [
        { cuenta_id: caja, debito: 50, credito: 0 },
        { cuenta_id: bancos, debito: 0, credito: 50 },
      ],
    })
    const { error: errContab } = await auxiliar.rpc('fn_contabilizar_comprobante', {
      p_comprobante_id: original,
    })
    if (errContab) throw errContab

    const periodoDestino = await crearPeriodoActual(tenantId)
    const { error: errPrimera } = await auxiliar.rpc('fn_reversar_comprobante', {
      p_comprobante_id: original,
      p_periodo_destino: periodoDestino,
      p_motivo: 'primera reversión',
    })
    if (errPrimera) throw errPrimera

    const { error } = await auxiliar.rpc('fn_reversar_comprobante', {
      p_comprobante_id: original,
      p_periodo_destino: periodoDestino,
      p_motivo: 'segunda reversión',
    })
    expect(error?.message).toContain('COMPROBANTE_YA_REVERSADO')
  })

  it('13. dos comprobantes con el mismo origen violan el índice único', async () => {
    const { tenantId } = await crearTenantConPlan('origen-duplicado')
    const periodoId = await crearPeriodo(tenantId, 2031, 8)
    const tipoId = await tipoComprobanteId('CAUSACION')
    const caja = await cuentaPorCodigo(tenantId, '110505')
    const honorarios = await cuentaPorCodigo(tenantId, '5105')
    const lineas = [
      { cuenta_id: caja, debito: 10, credito: 0 },
      { cuenta_id: honorarios, debito: 0, credito: 10 },
    ]
    const origen = { modulo: 'cartera', entidad: 'cargos', id: crypto.randomUUID(), evento: 'causacion' }

    await crearBorrador({ tenantId, periodoId, tipoId, fecha: '2031-08-10', lineas, origen })
    await expect(
      crearBorrador({ tenantId, periodoId, tipoId, fecha: '2031-08-11', lineas, origen }),
    ).rejects.toThrow()
  })

  it('14. un usuario del tenant A no lee ni escribe comprobantes del tenant B', async () => {
    const { tenantId: tenantA, auxiliar: clienteA } = await crearTenantConPlan('aislamiento-a')
    const { tenantId: tenantB } = await crearTenantConPlan('aislamiento-b')
    const periodoB = await crearPeriodo(tenantB, 2031, 9)
    const tipoId = await tipoComprobanteId('INGRESO')
    const cajaB = await cuentaPorCodigo(tenantB, '110505')
    const honorariosB = await cuentaPorCodigo(tenantB, '5105')
    void tenantA

    const compB = await crearBorrador({
      tenantId: tenantB,
      periodoId: periodoB,
      tipoId,
      fecha: '2031-09-10',
      lineas: [
        { cuenta_id: cajaB, debito: 10, credito: 0 },
        { cuenta_id: honorariosB, debito: 0, credito: 10 },
      ],
    })

    const { data: lectura, error: errLectura } = await clienteA
      .from('contable_comprobante')
      .select('id')
      .eq('id', compB)
    expect(errLectura).toBeNull()
    expect(lectura).toEqual([])

    const { data: escritura, error: errEscritura } = await clienteA
      .from('contable_comprobante')
      .update({ descripcion: 'hackeado' })
      .eq('id', compB)
      .select('id')
    expect(errEscritura).toBeNull()
    expect(escritura).toEqual([])
  })

  it('15. un auditor puede leer y no puede crear', async () => {
    const { tenantId } = await crearTenantConPlan('rol-auditor')
    const periodoId = await crearPeriodo(tenantId, 2031, 10)
    const tipoId = await tipoComprobanteId('INGRESO')
    const caja = await cuentaPorCodigo(tenantId, '110505')
    const honorarios = await cuentaPorCodigo(tenantId, '5105')

    const compId = await crearBorrador({
      tenantId,
      periodoId,
      tipoId,
      fecha: '2031-10-10',
      lineas: [
        { cuenta_id: caja, debito: 10, credito: 0 },
        { cuenta_id: honorarios, debito: 0, credito: 10 },
      ],
    })

    const auditor = await crearUsuario(admin, 'auditor-comprobante')
    usuariosCreados.push(auditor)
    await crearMembership(admin, tenantId, auditor.id, 'auditor')
    const clienteAuditor: Cliente = await clienteComo(env!, auditor)

    const { data: lectura, error: errLectura } = await clienteAuditor
      .from('contable_comprobante')
      .select('id')
      .eq('id', compId)
    if (errLectura) throw errLectura
    expect(lectura).toHaveLength(1)

    const { data: creado, error: errCreado } = await clienteAuditor
      .from('contable_comprobante')
      .insert({
        tenant_id: tenantId,
        periodo_id: periodoId,
        tipo_id: tipoId,
        anio: 2031,
        fecha: '2031-10-11',
        descripcion: 'Intento de auditor',
      })
      .select('id')
    expect(errCreado).not.toBeNull()
    expect(creado).toBeNull()
  })

  it('16. fn_actualizar_observaciones_comprobante anota un comprobante ya contabilizado (un UPDATE directo del cliente lo rechaza)', async () => {
    const { tenantId, auxiliar } = await crearTenantConPlan('observaciones')
    const periodoId = await crearPeriodo(tenantId, 2031, 11)
    const tipoId = await tipoComprobanteId('INGRESO')
    const caja = await cuentaPorCodigo(tenantId, '110505')
    const bancos = await cuentaPorCodigo(tenantId, '111005') // sin dimensiones requeridas

    const compId = await crearBorrador({
      tenantId,
      periodoId,
      tipoId,
      fecha: '2031-11-10',
      lineas: [
        { cuenta_id: caja, debito: 100, credito: 0 },
        { cuenta_id: bancos, debito: 0, credito: 100 },
      ],
    })
    const { error: errContab } = await auxiliar.rpc('fn_contabilizar_comprobante', {
      p_comprobante_id: compId,
    })
    if (errContab) throw errContab

    // Un UPDATE directo (aunque solo toque observaciones) lo rechaza RLS a propósito —
    // contable_comprobante_update_auxiliar exige estado in (borrador, anulado) en su WITH CHECK.
    // La fila SÍ es visible/seleccionable (USING no filtra por estado), así que esto es un
    // 42501 duro (WITH CHECK violado), no un filtrado silencioso — se prueba con `auxiliar` (RLS
    // real, no admin) para confirmar que la RPC es necesaria, no redundante.
    const { error: errDirecto } = await auxiliar
      .from('contable_comprobante')
      .update({ observaciones: 'nota directa' })
      .eq('id', compId)
      .select('id')
    expect(errDirecto?.code).toBe('42501')

    const { error: errRpc } = await auxiliar.rpc('fn_actualizar_observaciones_comprobante', {
      p_comprobante_id: compId,
      p_observaciones: 'Revisado por el revisor fiscal el 2031-11-15.',
    })
    if (errRpc) throw errRpc

    const { data: fila } = await admin
      .from('contable_comprobante')
      .select('observaciones, estado, descripcion')
      .eq('id', compId)
      .single<{ observaciones: string | null; estado: string; descripcion: string }>()
    expect(fila!.observaciones).toBe('Revisado por el revisor fiscal el 2031-11-15.')
    // Sigue contabilizado y con su descripción original — la RPC no tocó nada más.
    expect(fila!.estado).toBe('contabilizado')
    expect(fila!.descripcion).toBe('Comprobante de prueba')
  })

  it('17. un auditor no puede anotar observaciones (FORBIDDEN)', async () => {
    const { tenantId } = await crearTenantConPlan('observaciones-auditor')
    const periodoId = await crearPeriodo(tenantId, 2031, 12)
    const tipoId = await tipoComprobanteId('AJUSTE')
    const caja = await cuentaPorCodigo(tenantId, '110505')
    const bancos = await cuentaPorCodigo(tenantId, '111005')

    const compId = await crearBorrador({
      tenantId,
      periodoId,
      tipoId,
      fecha: '2031-12-10',
      lineas: [
        { cuenta_id: caja, debito: 10, credito: 0 },
        { cuenta_id: bancos, debito: 0, credito: 10 },
      ],
    })

    const auditor = await crearUsuario(admin, 'auditor-observaciones')
    usuariosCreados.push(auditor)
    await crearMembership(admin, tenantId, auditor.id, 'auditor')
    const clienteAuditor: Cliente = await clienteComo(env!, auditor)

    const { error } = await clienteAuditor.rpc('fn_actualizar_observaciones_comprobante', {
      p_comprobante_id: compId,
      p_observaciones: 'intento de auditor',
    })
    expect(error?.message).toContain('FORBIDDEN')
  })
})
