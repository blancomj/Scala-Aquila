/**
 * Dominio Fondos — BLOQUE B/C/D/E/F/G (GAP-22, PLAN §4.3, D-36, D-37).
 * Migraciones: 20260929100000_fondos_modelo_general.sql,
 * 20260929110000_fondo_movimientos_tipos_y_origen.sql,
 * 20260929120000_fondo_saldo_derivado_y_guards.sql,
 * 20260929130000_fondo_autorizaciones_y_fuentes.sql,
 * 20260929140000_fondo_compromisos.sql,
 * 20260929150000_fondo_solicitudes_uso.sql.
 *
 * Cubre las pruebas críticas del Modelo Maestro que ya tienen implementación:
 * FND-T-002 (tipo válido), FND-T-005/009 (saldo derivado), FND-T-007
 * (movimiento confirmado no se edita), FND-T-008 (reversión conserva
 * histórico), FND-T-012 (rendimiento ≠ aporte), FND-T-013 (fondo cerrado no
 * recibe movimientos ordinarios), FND-T-023 (destinación específica no hereda
 * la unicidad del fondo de imprevistos), R8 (saldo_actual no editable), R9
 * (comprometer nunca deja el disponible en negativo), el cierre de §4.5 de
 * ANALISIS_FONDOS_BLOQUE_A.md (fuente_financiacion.fondo_id), y la
 * segregación de funciones de D-37 en solicitudes de uso (BLOQUE G).
 *
 * El aislamiento entre tenants no se repite aquí: ya lo cubren
 * tests/rls/domain-isolation.test.ts (SEC-11) y schema-forced-rls (SEC-13).
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
} from '../rls/helpers.js'

const env = leerEntorno()
const d = env ? describe : describe.skip

if (!env) {
  console.warn('SALTADO tests/tenancy/fondos-modelo-general: faltan variables de Supabase en .env')
}

/** Fila de catálogo de plataforma (tenant_id null) de cualquier familia. */
async function idCatalogo(admin: Cliente, familia: string, codigo: string): Promise<number> {
  const { data, error } = await admin
    .from('lista_tipos')
    .select('id')
    .eq('tipo', familia)
    .is('tenant_id', null)
    .eq('codigo', codigo)
    .single<{ id: number }>()
  if (error) throw new Error(`fixture ${familia} ${codigo}: ${error.message}`)
  return data.id
}

async function idTipoFondo(admin: Cliente, codigo: string): Promise<number> {
  return idCatalogo(admin, 'TIPO_FONDO', codigo)
}

/** Soporte documental reutilizable (D-42, guard_fondo_movimiento) — un solo documento por
 * tenant respalda todos los movimientos manuales de fixture de esta suite; el guard solo exige
 * que documento_id exista y sea del tenant, no que sea distinto por movimiento. */
async function crearDocumentoFixture(admin: Cliente, tenantId: string): Promise<string> {
  const tipoDocumentoId = await idCatalogo(admin, 'TIPO_DOCUMENTO', 'soporte_movimiento_fondo')
  const { data, error } = await admin
    .from('documentos')
    .insert({
      tenant_id: tenantId,
      tipo_documento_id: tipoDocumentoId,
      nombre_archivo: 'soporte-fixture.pdf',
      storage_path: `test/${String(Date.now())}.pdf`,
    })
    .select('id')
    .single<{ id: string }>()
  if (error) throw new Error(`fixture documento soporte: ${error.message}`)
  return data.id
}

d('Dominio Fondos — modelo general y saldo derivado (GAP-22)', () => {
  const admin = clienteAdmin(env!)
  let tenant: TenantPrueba
  let tipoImprevistos: number
  let tipoProyecto: number
  let documentoId: string

  async function crearFondo(
    codigo: string,
    extra: Record<string, unknown> = {},
  ): Promise<{ id: string; estado: string }> {
    const { data, error } = await admin
      .from('fondos')
      .insert({
        tenant_id: tenant.id,
        codigo,
        nombre: `Fondo ${codigo}`,
        naturaleza: 'destinacion_especifica',
        tipo_id: tipoProyecto,
        ...extra,
      })
      .select('id, estado')
      .single<{ id: string; estado: string }>()
    if (error) throw new Error(`fixture fondo ${codigo}: ${error.message}`)
    return data
  }

  /** Lleva un fondo recién creado (propuesto) hasta activo. */
  async function activar(fondoId: string): Promise<void> {
    for (const estado of ['pendiente_autorizacion', 'activo'] as const) {
      const { error } = await admin.from('fondos').update({ estado }).eq('id', fondoId)
      if (error) throw new Error(`fixture activar → ${estado}: ${error.message}`)
    }
  }

  async function saldo(fondoId: string): Promise<number> {
    const { data, error } = await admin
      .from('fondos')
      .select('saldo_actual')
      .eq('id', fondoId)
      .single<{ saldo_actual: number }>()
    if (error) throw new Error(`saldo: ${error.message}`)
    return data.saldo_actual
  }

  beforeAll(async () => {
    tenant = await crearTenant(admin, 'fondos-gap22')
    tipoImprevistos = await idTipoFondo(admin, 'imprevistos')
    tipoProyecto = await idTipoFondo(admin, 'proyecto')
    documentoId = await crearDocumentoFixture(admin, tenant.id)
  }, 60_000)

  afterAll(async () => {
    await eliminarTenant(admin, tenant.id)
  }, 60_000)

  it('un fondo nuevo nace propuesto y no admite movimientos todavía', async () => {
    const fondo = await crearFondo('FON-P01')
    expect(fondo.estado).toBe('propuesto')

    const { error } = await admin
      .from('fondo_movimientos')
      .insert({ tenant_id: tenant.id, fondo_id: fondo.id, tipo: 'aporte', monto: 1000, documento_id: documentoId })
    expect(error?.message).toMatch(/FONDO_ESTADO_NO_ADMITE_MOVIMIENTOS/)
  })

  it('FND-T-002: tipo_id debe pertenecer a la familia TIPO_FONDO', async () => {
    const { data: otro } = await admin
      .from('lista_tipos')
      .select('id')
      .eq('tipo', 'TIPO_INMUEBLE')
      .is('tenant_id', null)
      .limit(1)
      .single<{ id: number }>()

    const { error } = await admin.from('fondos').insert({
      tenant_id: tenant.id,
      codigo: 'FON-BAD',
      nombre: 'Tipo equivocado',
      naturaleza: 'destinacion_especifica',
      tipo_id: otro!.id,
    })
    expect(error?.message).toMatch(/TIPO_FONDO_INVALIDO/)
  })

  it('el código de fondo es único dentro de la copropiedad', async () => {
    await crearFondo('FON-DUP')
    const { error } = await admin.from('fondos').insert({
      tenant_id: tenant.id,
      codigo: 'FON-DUP',
      nombre: 'Repetido',
      naturaleza: 'destinacion_especifica',
      tipo_id: tipoProyecto,
    })
    expect(error?.message).toMatch(/fondos_codigo_unico/)
  })

  it('FND-T-023: solo puede haber un fondo de imprevistos, pero N de destinación específica', async () => {
    await admin.from('fondos').insert({
      tenant_id: tenant.id,
      codigo: 'FON-IMP',
      nombre: 'Imprevistos',
      naturaleza: 'imprevistos',
      tipo_id: tipoImprevistos,
      permanente: true,
    })

    const { error: errSegundo } = await admin.from('fondos').insert({
      tenant_id: tenant.id,
      codigo: 'FON-IMP2',
      nombre: 'Otro imprevistos',
      naturaleza: 'imprevistos',
      tipo_id: tipoImprevistos,
    })
    expect(errSegundo?.message).toMatch(/fondos_naturaleza_imprevistos_unico/)

    // La unicidad NO se hereda: los de destinación específica conviven.
    await crearFondo('FON-E01')
    await crearFondo('FON-E02')
    const { count } = await admin
      .from('fondos')
      .select('id', { count: 'exact', head: true })
      .eq('tenant_id', tenant.id)
      .eq('naturaleza', 'destinacion_especifica')
    expect(count).toBeGreaterThanOrEqual(2)
  })

  it('las transiciones de estado inválidas se rechazan y cerrado es terminal', async () => {
    const fondo = await crearFondo('FON-EST')

    const { error: errSalto } = await admin
      .from('fondos')
      .update({ estado: 'cerrado' })
      .eq('id', fondo.id)
    expect(errSalto?.message).toMatch(/FONDO_TRANSICION_INVALIDA/)

    await activar(fondo.id)
    for (const estado of ['en_cierre', 'cerrado'] as const) {
      const { error } = await admin.from('fondos').update({ estado }).eq('id', fondo.id)
      expect(error).toBeNull()
    }

    const { error: errTerminal } = await admin
      .from('fondos')
      .update({ estado: 'activo' })
      .eq('id', fondo.id)
    expect(errTerminal?.message).toMatch(/FONDO_ESTADO_TERMINAL/)
  })

  it('FND-T-013: un fondo cerrado no recibe movimientos ordinarios', async () => {
    const fondo = await crearFondo('FON-CER')
    await activar(fondo.id)
    await admin.from('fondos').update({ estado: 'en_cierre' }).eq('id', fondo.id)

    // en_cierre admite únicamente el tratamiento del remanente.
    const { error: errOrdinario } = await admin
      .from('fondo_movimientos')
      .insert({ tenant_id: tenant.id, fondo_id: fondo.id, tipo: 'aporte', monto: 500, documento_id: documentoId })
    expect(errOrdinario?.message).toMatch(/FONDO_ESTADO_NO_ADMITE_MOVIMIENTOS/)

    await admin.from('fondos').update({ estado: 'cerrado' }).eq('id', fondo.id)
    const { error: errCerrado } = await admin.from('fondo_movimientos').insert({
      tenant_id: tenant.id,
      fondo_id: fondo.id,
      tipo: 'cierre_remanente',
      monto: 500,
    })
    expect(errCerrado?.message).toMatch(/FONDO_ESTADO_NO_ADMITE_MOVIMIENTOS/)
  })

  it('FND-T-009/012: el saldo se deriva de los movimientos y distingue aporte de rendimiento', async () => {
    const fondo = await crearFondo('FON-SAL')
    await activar(fondo.id)

    await admin.from('fondo_movimientos').insert([
      { tenant_id: tenant.id, fondo_id: fondo.id, tipo: 'aporte', monto: 100_000, documento_id: documentoId },
      { tenant_id: tenant.id, fondo_id: fondo.id, tipo: 'rendimiento', monto: 3_000, documento_id: documentoId },
      { tenant_id: tenant.id, fondo_id: fondo.id, tipo: 'uso', monto: 20_000, documento_id: documentoId },
    ])

    expect(await saldo(fondo.id)).toBe(83_000)

    // Aporte y rendimiento suman igual, pero no son el mismo hecho: el reporte
    // los separa (Modelo §17/§23, criterio de no aprobación si se mezclan).
    const { data: porTipo } = await admin
      .from('fondo_movimientos')
      .select('tipo, monto')
      .eq('fondo_id', fondo.id)
    const rendimientos = (porTipo ?? []).filter((m) => m.tipo === 'rendimiento')
    expect(rendimientos).toHaveLength(1)
    expect(rendimientos[0]!.monto).toBe(3_000)
  })

  it('R8: saldo_actual no se puede escribir a mano y fn_fondo_reconciliar no reporta diferencia', async () => {
    const fondo = await crearFondo('FON-R8')
    await activar(fondo.id)
    await admin
      .from('fondo_movimientos')
      .insert({ tenant_id: tenant.id, fondo_id: fondo.id, tipo: 'aporte', monto: 50_000, documento_id: documentoId })

    const { error } = await admin
      .from('fondos')
      .update({ saldo_actual: 999_999 })
      .eq('id', fondo.id)
    expect(error?.message).toMatch(/FONDO_SALDO_DERIVADO/)
    expect(await saldo(fondo.id)).toBe(50_000)

    const { data: reconciliacion, error: errRec } = await admin.rpc('fn_fondo_reconciliar', {
      p_tenant_id: tenant.id,
    })
    expect(errRec).toBeNull()
    for (const fila of reconciliacion ?? []) {
      expect(fila.diferencia).toBe(0)
    }
  })

  it('FND-T-007/008: un movimiento no se edita ni se borra; se revierte con motivo', async () => {
    const fondo = await crearFondo('FON-REV')
    await activar(fondo.id)

    const { data: original } = await admin
      .from('fondo_movimientos')
      .insert({ tenant_id: tenant.id, fondo_id: fondo.id, tipo: 'aporte', monto: 8_000, documento_id: documentoId })
      .select('id')
      .single<{ id: string }>()

    const { error: errUpdate } = await admin
      .from('fondo_movimientos')
      .update({ monto: 1 })
      .eq('id', original!.id)
    expect(errUpdate?.message).toMatch(/APPEND_ONLY/)

    const { error: errSinMotivo } = await admin.from('fondo_movimientos').insert({
      tenant_id: tenant.id,
      fondo_id: fondo.id,
      tipo: 'reversion',
      monto: -8_000,
      reversion_de_id: original!.id,
    })
    expect(errSinMotivo?.message).toMatch(/FONDO_MOTIVO_REQUERIDO/)

    const { error: errMontoMalo } = await admin.from('fondo_movimientos').insert({
      tenant_id: tenant.id,
      fondo_id: fondo.id,
      tipo: 'reversion',
      monto: -7_000,
      motivo: 'monto equivocado',
      reversion_de_id: original!.id,
    })
    expect(errMontoMalo?.message).toMatch(/FONDO_REVERSION_INVALIDA/)

    const { error: errOk } = await admin.from('fondo_movimientos').insert({
      tenant_id: tenant.id,
      fondo_id: fondo.id,
      tipo: 'reversion',
      monto: -8_000,
      motivo: 'aporte registrado por duplicado',
      reversion_de_id: original!.id,
    })
    expect(errOk).toBeNull()
    expect(await saldo(fondo.id)).toBe(0)

    // El original sigue ahí: la reversión no borra historia (FND-T-008).
    const { count } = await admin
      .from('fondo_movimientos')
      .select('id', { count: 'exact', head: true })
      .eq('fondo_id', fondo.id)
    expect(count).toBe(2)

    // Y no se revierte dos veces.
    const { error: errDoble } = await admin.from('fondo_movimientos').insert({
      tenant_id: tenant.id,
      fondo_id: fondo.id,
      tipo: 'reversion',
      monto: -8_000,
      motivo: 'otra vez',
      reversion_de_id: original!.id,
    })
    expect(errDoble?.message).toMatch(/fondo_movimientos_reversion_unica/)
  })

  it('un ajuste lleva signo propio y exige motivo', async () => {
    const fondo = await crearFondo('FON-AJU')
    await activar(fondo.id)
    await admin
      .from('fondo_movimientos')
      .insert({ tenant_id: tenant.id, fondo_id: fondo.id, tipo: 'aporte', monto: 10_000, documento_id: documentoId })

    const { error: errSinMotivo } = await admin
      .from('fondo_movimientos')
      .insert({ tenant_id: tenant.id, fondo_id: fondo.id, tipo: 'ajuste', monto: -150 })
    expect(errSinMotivo?.message).toMatch(/FONDO_MOTIVO_REQUERIDO/)

    await admin.from('fondo_movimientos').insert({
      tenant_id: tenant.id,
      fondo_id: fondo.id,
      tipo: 'ajuste',
      monto: -150,
      motivo: 'diferencia de redondeo en la apertura',
      documento_id: documentoId,
    })
    expect(await saldo(fondo.id)).toBe(9_850)

    // Un aporte, en cambio, no admite importe negativo.
    const { error: errNegativo } = await admin
      .from('fondo_movimientos')
      .insert({ tenant_id: tenant.id, fondo_id: fondo.id, tipo: 'aporte', monto: -100, documento_id: documentoId })
    expect(errNegativo?.message).toMatch(/fondo_movimientos_monto_signo/)
  })
})

d('Dominio Fondos — autorizaciones y fuentes de alimentación (GAP-22, BLOQUE C/D)', () => {
  const admin = clienteAdmin(env!)
  let tenant: TenantPrueba
  let tipoProyecto: number
  let organoAsamblea: number
  let tipoFuenteRecargo: number
  let fondo: { id: string }

  beforeAll(async () => {
    tenant = await crearTenant(admin, 'fondos-autorizaciones')
    tipoProyecto = await idTipoFondo(admin, 'proyecto')
    organoAsamblea = await idCatalogo(admin, 'ORGANO_DECISORIO', 'asamblea')
    tipoFuenteRecargo = await idCatalogo(
      admin,
      'TIPO_FUENTE_ALIMENTACION_FONDO',
      'recargo_fondo_imprevistos',
    )

    const { data, error } = await admin
      .from('fondos')
      .insert({
        tenant_id: tenant.id,
        codigo: 'FON-ASC',
        nombre: 'Renovación ascensores',
        naturaleza: 'destinacion_especifica',
        tipo_id: tipoProyecto,
      })
      .select('id')
      .single<{ id: string }>()
    if (error) throw new Error(`fixture fondo: ${error.message}`)
    fondo = data
  }, 60_000)

  afterAll(async () => {
    await eliminarTenant(admin, tenant.id)
  }, 60_000)

  it('una autorización exige un ORGANO_DECISORIO válido y es append-only', async () => {
    const { error: errOrgano } = await admin.from('fondo_autorizaciones').insert({
      tenant_id: tenant.id,
      fondo_id: fondo.id,
      organo_id: 999_999,
      tipo_decision: 'Aprobación de creación',
      decision: 'Se aprueba el fondo para renovación de ascensores',
    })
    expect(errOrgano?.message).toMatch(/ORGANO_DECISORIO_INVALIDO/)

    const { data: autorizacion, error } = await admin
      .from('fondo_autorizaciones')
      .insert({
        tenant_id: tenant.id,
        fondo_id: fondo.id,
        organo_id: organoAsamblea,
        tipo_decision: 'Aprobación de creación',
        decision: 'Se aprueba el fondo para renovación de ascensores',
        numero_acta: '023',
      })
      .select('id')
      .single<{ id: string }>()
    expect(error).toBeNull()

    const { error: errUpdate } = await admin
      .from('fondo_autorizaciones')
      .update({ decision: 'editado' })
      .eq('id', autorizacion!.id)
    expect(errUpdate?.message).toMatch(/APPEND_ONLY/)
  })

  it('una fuente exige porcentaje o valor, y solo se enlaza a una autorización de su propio fondo', async () => {
    const { data: autorizacion } = await admin
      .from('fondo_autorizaciones')
      .insert({
        tenant_id: tenant.id,
        fondo_id: fondo.id,
        organo_id: organoAsamblea,
        tipo_decision: 'Autorización de fuente',
        decision: 'Se autoriza la cuota extraordinaria como fuente',
      })
      .select('id')
      .single<{ id: string }>()

    const { error: errVacio } = await admin
      .from('fondo_fuentes')
      .insert({ tenant_id: tenant.id, fondo_id: fondo.id, tipo_id: tipoFuenteRecargo })
    expect(errVacio?.message).toMatch(/fondo_fuentes_porcentaje_o_valor/)

    const { error: errOk } = await admin.from('fondo_fuentes').insert({
      tenant_id: tenant.id,
      fondo_id: fondo.id,
      tipo_id: tipoFuenteRecargo,
      valor: 500_000,
      periodicidad: 'mensual',
      autorizacion_id: autorizacion!.id,
    })
    expect(errOk).toBeNull()

    // Un segundo fondo del mismo tenant no puede reutilizar esa autorización.
    const { data: otroFondo } = await admin
      .from('fondos')
      .insert({
        tenant_id: tenant.id,
        codigo: 'FON-OTRO',
        nombre: 'Otro fondo',
        naturaleza: 'destinacion_especifica',
        tipo_id: tipoProyecto,
      })
      .select('id')
      .single<{ id: string }>()

    const { error: errCruzada } = await admin.from('fondo_fuentes').insert({
      tenant_id: tenant.id,
      fondo_id: otroFondo!.id,
      tipo_id: tipoFuenteRecargo,
      valor: 100,
      autorizacion_id: autorizacion!.id,
    })
    expect(errCruzada?.message).toMatch(/AUTORIZACION_INVALIDA/)
  })
})

d('Dominio Fondos — fuente_financiacion.fondo_id (cierra §4.5, GAP-22)', () => {
  const admin = clienteAdmin(env!)
  let tenant: TenantPrueba
  let presupuestoId: string
  let tipoFondoImprevistosFuente: number
  let fondoImprevistos: { id: string }
  let documentoId: string

  async function activarFondo(fondoId: string): Promise<void> {
    for (const estado of ['pendiente_autorizacion', 'activo'] as const) {
      const { error } = await admin.from('fondos').update({ estado }).eq('id', fondoId)
      if (error) throw new Error(`fixture activar → ${estado}: ${error.message}`)
    }
  }

  beforeAll(async () => {
    tenant = await crearTenant(admin, 'fondos-fuente-fin')
    tipoFondoImprevistosFuente = await idCatalogo(
      admin,
      'TIPO_FUENTE_FINANCIACION',
      'fondo_imprevistos',
    )
    documentoId = await crearDocumentoFixture(admin, tenant.id)

    const { data: presupuesto, error: errPresu } = await admin
      .from('presupuestos')
      .insert({ tenant_id: tenant.id, anio: 2032, version: 1, estado: 'borrador', monto_total: 1 })
      .select('id')
      .single<{ id: string }>()
    if (errPresu) throw new Error(`fixture presupuesto: ${errPresu.message}`)
    presupuestoId = presupuesto.id

    const tipoImprevistos = await idTipoFondo(admin, 'imprevistos')
    const { data: fondo, error: errFondo } = await admin
      .from('fondos')
      .insert({
        tenant_id: tenant.id,
        codigo: 'FON-IMP',
        nombre: 'Fondo de imprevistos',
        naturaleza: 'imprevistos',
        tipo_id: tipoImprevistos,
        permanente: true,
      })
      .select('id')
      .single<{ id: string }>()
    if (errFondo) throw new Error(`fixture fondo imprevistos: ${errFondo.message}`)
    fondoImprevistos = fondo

    await activarFondo(fondoImprevistos.id)
    await admin.from('fondo_movimientos').insert({
      tenant_id: tenant.id,
      fondo_id: fondoImprevistos.id,
      tipo: 'aporte',
      monto: 1_000,
      documento_id: documentoId,
    })
  }, 60_000)

  afterAll(async () => {
    await eliminarTenant(admin, tenant.id)
  }, 60_000)

  it('sin fondo_id explícito, el guard lo resuelve solo para fondo_imprevistos (compatibilidad D-36)', async () => {
    const { data, error } = await admin.rpc('fn_registrar_fuente_financiacion', {
      p_presupuesto_id: presupuestoId,
      p_tipo_id: tipoFondoImprevistosFuente,
      p_valor_disponible: 400,
    })
    expect(error).toBeNull()
    expect(data?.fondo_id).toBe(fondoImprevistos.id)
  })

  it('fondo_id explícito debe ser el fondo de imprevistos del tenant cuando el tipo lo exige', async () => {
    const { data: otroFondo } = await admin
      .from('fondos')
      .insert({
        tenant_id: tenant.id,
        codigo: 'FON-OTRO2',
        nombre: 'Fondo destinación específica',
        naturaleza: 'destinacion_especifica',
        tipo_id: await idTipoFondo(admin, 'proyecto'),
      })
      .select('id')
      .single<{ id: string }>()

    const { error } = await admin.rpc('fn_registrar_fuente_financiacion', {
      p_presupuesto_id: presupuestoId,
      p_tipo_id: tipoFondoImprevistosFuente,
      p_valor_disponible: 100,
      p_fondo_id: otroFondo!.id,
    })
    expect(error?.message).toMatch(/FONDO_NATURALEZA_INVALIDA/)
  })

  it('Modelo §23: un fondo de destinación específica puede declararse como fuente propia con fondo_id explícito', async () => {
    const tipoOtrosIngresos = await idCatalogo(admin, 'TIPO_FUENTE_FINANCIACION', 'otros_ingresos')

    const { data: fondoProyecto, error: errFondo } = await admin
      .from('fondos')
      .insert({
        tenant_id: tenant.id,
        codigo: 'FON-ASC2',
        nombre: 'Fondo ascensores',
        naturaleza: 'destinacion_especifica',
        tipo_id: await idTipoFondo(admin, 'proyecto'),
      })
      .select('id')
      .single<{ id: string }>()
    if (errFondo) throw new Error(`fixture fondo ascensores: ${errFondo.message}`)

    await activarFondo(fondoProyecto.id)
    await admin.from('fondo_movimientos').insert({
      tenant_id: tenant.id,
      fondo_id: fondoProyecto.id,
      tipo: 'aporte',
      monto: 120_000_000,
      documento_id: documentoId,
    })

    const { data, error } = await admin.rpc('fn_registrar_fuente_financiacion', {
      p_presupuesto_id: presupuestoId,
      p_tipo_id: tipoOtrosIngresos,
      p_valor_disponible: 120_000_000,
      p_fondo_id: fondoProyecto.id,
    })
    expect(error).toBeNull()
    expect(data?.fondo_id).toBe(fondoProyecto.id)

    // Y el mismo tope FI-003 aplica: no puede superar el saldo del fondo.
    const { error: errExceso } = await admin.rpc('fn_registrar_fuente_financiacion', {
      p_presupuesto_id: presupuestoId,
      p_tipo_id: tipoOtrosIngresos,
      p_valor_disponible: 120_000_001,
      p_fondo_id: fondoProyecto.id,
    })
    expect(errExceso?.message).toMatch(/FONDO_INSUFICIENTE/)
  })
})

d('Dominio Fondos — compromisos y disponible (GAP-22, BLOQUE F, R9)', () => {
  const admin = clienteAdmin(env!)
  let tenant: TenantPrueba
  let fondo: { id: string; codigo: string }
  let documentoId: string

  interface Saldos {
    saldo: number
    comprometido: number
    disponible: number
  }

  async function saldos(fondoId: string): Promise<Saldos> {
    const { data, error } = await admin
      .rpc('fn_fondo_saldos', { p_fondo_id: fondoId })
      .single<Saldos>()
    if (error) throw new Error(`fn_fondo_saldos: ${error.message}`)
    return data
  }

  beforeAll(async () => {
    tenant = await crearTenant(admin, 'fondos-compromisos')
    documentoId = await crearDocumentoFixture(admin, tenant.id)
    const tipoProyecto = await idTipoFondo(admin, 'proyecto')

    const { data, error } = await admin
      .from('fondos')
      .insert({
        tenant_id: tenant.id,
        codigo: 'FON-CMP',
        nombre: 'Fondo compromisos',
        naturaleza: 'destinacion_especifica',
        tipo_id: tipoProyecto,
      })
      .select('id, codigo')
      .single<{ id: string; codigo: string }>()
    if (error) throw new Error(`fixture fondo: ${error.message}`)
    fondo = data

    for (const estado of ['pendiente_autorizacion', 'activo'] as const) {
      await admin.from('fondos').update({ estado }).eq('id', fondo.id)
    }
    await admin
      .from('fondo_movimientos')
      .insert({ tenant_id: tenant.id, fondo_id: fondo.id, tipo: 'aporte', monto: 200_000, documento_id: documentoId })
  }, 60_000)

  afterAll(async () => {
    await eliminarTenant(admin, tenant.id)
  }, 60_000)

  it('un compromiso proyectado no resta del disponible; comprometerlo sí, y respeta R9', async () => {
    expect(await saldos(fondo.id)).toEqual({ saldo: 200_000, comprometido: 0, disponible: 200_000 })

    const { data: compromiso, error } = await admin
      .from('fondo_compromisos')
      .insert({
        tenant_id: tenant.id,
        fondo_id: fondo.id,
        concepto: 'Estimado pintura fachada',
        monto: 500_000,
      })
      .select('id, estado')
      .single<{ id: string; estado: string }>()
    expect(error).toBeNull()
    expect(compromiso!.estado).toBe('proyectado')
    expect(await saldos(fondo.id)).toEqual({ saldo: 200_000, comprometido: 0, disponible: 200_000 })

    // R9: comprometer 500k sobre un saldo de 200k dejaría el disponible en negativo.
    const { error: errExcede } = await admin
      .from('fondo_compromisos')
      .update({ estado: 'comprometido' })
      .eq('id', compromiso!.id)
    expect(errExcede?.message).toMatch(/COMPROMISO_EXCEDE_DISPONIBLE/)
  })

  it('un uso contra un compromiso lo hace avanzar de comprometido a parcialmente_ejecutado a ejecutado', async () => {
    const { data: compromiso } = await admin
      .from('fondo_compromisos')
      .insert({
        tenant_id: tenant.id,
        fondo_id: fondo.id,
        concepto: 'Mantenimiento ascensor',
        monto: 80_000,
        estado: 'comprometido',
      })
      .select('id')
      .single<{ id: string }>()

    expect(await saldos(fondo.id)).toEqual({
      saldo: 200_000,
      comprometido: 80_000,
      disponible: 120_000,
    })

    // Un segundo compromiso que exceda el disponible (120k) se rechaza.
    const { error: errSegundo } = await admin.from('fondo_compromisos').insert({
      tenant_id: tenant.id,
      fondo_id: fondo.id,
      concepto: 'Otro',
      monto: 130_000,
      estado: 'comprometido',
    })
    expect(errSegundo?.message).toMatch(/COMPROMISO_EXCEDE_DISPONIBLE/)

    await admin.from('fondo_movimientos').insert({
      tenant_id: tenant.id,
      fondo_id: fondo.id,
      tipo: 'uso',
      monto: 30_000,
      compromiso_id: compromiso!.id,
      documento_id: documentoId,
    })
    let fila = await admin
      .from('fondo_compromisos')
      .select('monto_ejecutado, estado')
      .eq('id', compromiso!.id)
      .single<{ monto_ejecutado: number; estado: string }>()
    expect(fila.data).toEqual({ monto_ejecutado: 30_000, estado: 'parcialmente_ejecutado' })

    await admin.from('fondo_movimientos').insert({
      tenant_id: tenant.id,
      fondo_id: fondo.id,
      tipo: 'uso',
      monto: 50_000,
      compromiso_id: compromiso!.id,
      documento_id: documentoId,
    })
    fila = await admin
      .from('fondo_compromisos')
      .select('monto_ejecutado, estado')
      .eq('id', compromiso!.id)
      .single<{ monto_ejecutado: number; estado: string }>()
    expect(fila.data).toEqual({ monto_ejecutado: 80_000, estado: 'ejecutado' })

    // Ejecutado es terminal: ni un uso más, ni un salto de estado hacia atrás.
    const { error: errExtra } = await admin.from('fondo_movimientos').insert({
      tenant_id: tenant.id,
      fondo_id: fondo.id,
      tipo: 'uso',
      monto: 1,
      compromiso_id: compromiso!.id,
      documento_id: documentoId,
    })
    expect(errExtra?.message).toMatch(/COMPROMISO_ESTADO_NO_EJECUTABLE/)

    const { error: errRetroceso } = await admin
      .from('fondo_compromisos')
      .update({ estado: 'comprometido' })
      .eq('id', compromiso!.id)
    expect(errRetroceso?.message).toMatch(/COMPROMISO_ESTADO_TERMINAL/)

    expect(await saldos(fondo.id)).toEqual({
      saldo: 200_000 - 80_000,
      comprometido: 0,
      disponible: 200_000 - 80_000,
    })
  })

  it('un compromiso no puede ejecutar más de lo comprometido, y un uso solo ejecuta el compromiso de su propio fondo', async () => {
    const { data: compromiso } = await admin
      .from('fondo_compromisos')
      .insert({
        tenant_id: tenant.id,
        fondo_id: fondo.id,
        concepto: 'Compra de equipo',
        monto: 10_000,
        estado: 'comprometido',
      })
      .select('id')
      .single<{ id: string }>()

    const { error: errSobreejecucion } = await admin.from('fondo_movimientos').insert({
      tenant_id: tenant.id,
      fondo_id: fondo.id,
      tipo: 'uso',
      monto: 10_001,
      compromiso_id: compromiso!.id,
      documento_id: documentoId,
    })
    expect(errSobreejecucion?.message).toMatch(/COMPROMISO_EJECUCION_EXCEDE_MONTO/)

    const { data: otroFondo } = await admin
      .from('fondos')
      .insert({
        tenant_id: tenant.id,
        codigo: 'FON-CMP2',
        nombre: 'Otro fondo',
        naturaleza: 'destinacion_especifica',
        tipo_id: await idTipoFondo(admin, 'proyecto'),
      })
      .select('id')
      .single<{ id: string }>()
    for (const estado of ['pendiente_autorizacion', 'activo'] as const) {
      await admin.from('fondos').update({ estado }).eq('id', otroFondo!.id)
    }
    await admin
      .from('fondo_movimientos')
      .insert({ tenant_id: tenant.id, fondo_id: otroFondo!.id, tipo: 'aporte', monto: 50_000, documento_id: documentoId })

    const { error: errCruzado } = await admin.from('fondo_movimientos').insert({
      tenant_id: tenant.id,
      fondo_id: otroFondo!.id,
      tipo: 'uso',
      monto: 100,
      compromiso_id: compromiso!.id,
    })
    expect(errCruzado?.message).toMatch(/COMPROMISO_INVALIDO/)
  })
})

d('Dominio Fondos — solicitudes de uso y segregación de funciones (GAP-22, BLOQUE G, D-37)', () => {
  const admin = clienteAdmin(env!)
  let tenant: TenantPrueba
  let fondo: { id: string }
  let solicitante: UsuarioPrueba
  let aprobador: UsuarioPrueba
  let ejecutor: UsuarioPrueba
  let clSolicitante: Cliente
  let clAprobador: Cliente
  let clEjecutor: Cliente
  let documentoId: string

  interface Solicitud {
    id: string
    estado: string
    aprobador_id: string | null
    compromiso_id: string | null
  }

  const SELECT_SOLICITUD = 'id, estado, aprobador_id, compromiso_id'

  async function crearSolicitud(monto: number): Promise<Solicitud> {
    const { data, error } = await clSolicitante
      .from('fondo_solicitudes_uso')
      .insert({
        tenant_id: tenant.id,
        fondo_id: fondo.id,
        solicitante_id: solicitante.id,
        objetivo: 'Reparación de emergencia',
        monto_solicitado: monto,
        justificacion: 'Falla detectada en visita técnica',
      })
      .select(SELECT_SOLICITUD)
      .single<Solicitud>()
    if (error) throw new Error(`fixture solicitud: ${error.message}`)
    return data
  }

  async function enviarARevision(id: string): Promise<void> {
    const { error } = await clSolicitante
      .from('fondo_solicitudes_uso')
      .update({ estado: 'en_revision' })
      .eq('id', id)
    if (error) throw new Error(`fixture en_revision: ${error.message}`)
  }

  beforeAll(async () => {
    tenant = await crearTenant(admin, 'fondos-solicitudes')
    solicitante = await crearUsuario(admin, 'fondos-solicitante')
    aprobador = await crearUsuario(admin, 'fondos-aprobador')
    ejecutor = await crearUsuario(admin, 'fondos-ejecutor')
    await crearMembership(admin, tenant.id, solicitante.id, 'auxiliar')
    await crearMembership(admin, tenant.id, aprobador.id, 'administrador')
    await crearMembership(admin, tenant.id, ejecutor.id, 'auxiliar')
    clSolicitante = await clienteComo(env!, solicitante)
    clAprobador = await clienteComo(env!, aprobador)
    clEjecutor = await clienteComo(env!, ejecutor)
    documentoId = await crearDocumentoFixture(admin, tenant.id)

    const tipoProyecto = await idTipoFondo(admin, 'proyecto')
    const { data, error } = await admin
      .from('fondos')
      .insert({
        tenant_id: tenant.id,
        codigo: 'FON-SOL',
        nombre: 'Fondo solicitudes',
        naturaleza: 'destinacion_especifica',
        tipo_id: tipoProyecto,
      })
      .select('id')
      .single<{ id: string }>()
    if (error) throw new Error(`fixture fondo: ${error.message}`)
    fondo = data

    for (const estado of ['pendiente_autorizacion', 'activo'] as const) {
      await admin.from('fondos').update({ estado }).eq('id', fondo.id)
    }
    await admin
      .from('fondo_movimientos')
      .insert({ tenant_id: tenant.id, fondo_id: fondo.id, tipo: 'aporte', monto: 100_000, documento_id: documentoId })
  }, 60_000)

  afterAll(async () => {
    await eliminarTenant(admin, tenant.id)
    await eliminarUsuario(admin, solicitante.id)
    await eliminarUsuario(admin, aprobador.id)
    await eliminarUsuario(admin, ejecutor.id)
  }, 60_000)

  it('D-37: el solicitante no puede aprobar su propia solicitud, ni un auxiliar sin rol administrador', async () => {
    const solicitud = await crearSolicitud(15_000)
    expect(solicitud.estado).toBe('borrador')
    await enviarARevision(solicitud.id)

    const { error: errAutoaprobacion } = await clSolicitante
      .from('fondo_solicitudes_uso')
      .update({ estado: 'aprobada' })
      .eq('id', solicitud.id)
    expect(errAutoaprobacion?.message).toMatch(/SOLICITUD_AUTOAPROBACION/)

    const { error: errRolInsuficiente } = await clEjecutor
      .from('fondo_solicitudes_uso')
      .update({ estado: 'aprobada' })
      .eq('id', solicitud.id)
    expect(errRolInsuficiente?.message).toMatch(/SOLICITUD_ROL_INSUFICIENTE/)
  })

  it('Modelo §20: no se aprueba una solicitud que exceda el disponible del fondo', async () => {
    const solicitud = await crearSolicitud(500_000)
    await enviarARevision(solicitud.id)

    const { error } = await clAprobador
      .from('fondo_solicitudes_uso')
      .update({ estado: 'aprobada' })
      .eq('id', solicitud.id)
    expect(error?.message).toMatch(/SOLICITUD_EXCEDE_DISPONIBLE/)
  })

  it('rechazar exige motivo y rol administrador', async () => {
    const solicitud = await crearSolicitud(5_000)
    await enviarARevision(solicitud.id)

    const { error: errSinMotivo } = await clAprobador
      .from('fondo_solicitudes_uso')
      .update({ estado: 'rechazada' })
      .eq('id', solicitud.id)
    expect(errSinMotivo?.message).toMatch(/SOLICITUD_MOTIVO_REQUERIDO/)

    const { data, error } = await clAprobador
      .from('fondo_solicitudes_uso')
      .update({ estado: 'rechazada', motivo_rechazo: 'Fuera de la destinación del fondo' })
      .eq('id', solicitud.id)
      .select('estado')
      .single<{ estado: string }>()
    expect(error).toBeNull()
    expect(data!.estado).toBe('rechazada')

    // Terminal: ni siquiera el administrador puede reabrirla.
    const { error: errTerminal } = await clAprobador
      .from('fondo_solicitudes_uso')
      .update({ estado: 'en_revision' })
      .eq('id', solicitud.id)
    expect(errTerminal?.message).toMatch(/SOLICITUD_ESTADO_TERMINAL/)
  })

  it('flujo completo: aprobar → comprometer (D-37: no el mismo actor) → ejecutar propaga a la solicitud', async () => {
    const solicitud = await crearSolicitud(15_000)
    await enviarARevision(solicitud.id)

    const { data: aprobada } = await clAprobador
      .from('fondo_solicitudes_uso')
      .update({ estado: 'aprobada' })
      .eq('id', solicitud.id)
      .select(SELECT_SOLICITUD)
      .single<Solicitud>()
    expect(aprobada!.estado).toBe('aprobada')
    expect(aprobada!.aprobador_id).toBe(aprobador.id)

    // D-37: el mismo administrador que aprobó no puede comprometer.
    const { error: errAutoejecucion } = await clAprobador
      .from('fondo_solicitudes_uso')
      .update({ estado: 'comprometida' })
      .eq('id', solicitud.id)
    expect(errAutoejecucion?.message).toMatch(/SOLICITUD_AUTOEJECUCION/)

    const { data: comprometida } = await clEjecutor
      .from('fondo_solicitudes_uso')
      .update({ estado: 'comprometida' })
      .eq('id', solicitud.id)
      .select(SELECT_SOLICITUD)
      .single<Solicitud>()
    expect(comprometida!.estado).toBe('comprometida')
    expect(comprometida!.compromiso_id).not.toBeNull()

    const { data: compromiso } = await admin
      .from('fondo_compromisos')
      .select('monto, estado, solicitud_id')
      .eq('id', comprometida!.compromiso_id!)
      .single<{ monto: number; estado: string; solicitud_id: string | null }>()
    expect(compromiso).toEqual({ monto: 15_000, estado: 'comprometido', solicitud_id: solicitud.id })

    // 'ejecutada' no se asigna a mano, ni siquiera con service_role.
    const { error: errManual } = await admin
      .from('fondo_solicitudes_uso')
      .update({ estado: 'ejecutada' })
      .eq('id', solicitud.id)
    expect(errManual?.message).toMatch(/SOLICITUD_EJECUTADA_NO_MANUAL/)

    // Un uso parcial todavía no propaga.
    await admin.from('fondo_movimientos').insert({
      tenant_id: tenant.id,
      fondo_id: fondo.id,
      tipo: 'uso',
      monto: 7_000,
      compromiso_id: comprometida!.compromiso_id!,
      documento_id: documentoId,
    })
    const { data: solTrasParcial } = await admin
      .from('fondo_solicitudes_uso')
      .select('estado')
      .eq('id', solicitud.id)
      .single<{ estado: string }>()
    expect(solTrasParcial!.estado).toBe('comprometida')

    // El uso restante completa el compromiso y propaga 'ejecutada'.
    await admin.from('fondo_movimientos').insert({
      tenant_id: tenant.id,
      fondo_id: fondo.id,
      tipo: 'uso',
      monto: 8_000,
      compromiso_id: comprometida!.compromiso_id!,
      documento_id: documentoId,
    })
    const { data: solFinal } = await admin
      .from('fondo_solicitudes_uso')
      .select('estado')
      .eq('id', solicitud.id)
      .single<{ estado: string }>()
    expect(solFinal!.estado).toBe('ejecutada')
  })
})

d('Dominio Fondos — cierre y remanentes (GAP-22, BLOQUE O, Modelo §35/§36)', () => {
  const admin = clienteAdmin(env!)
  let tenant: TenantPrueba
  let tipoProyecto: number
  let documentoId: string

  async function crearFondoActivo(codigo: string): Promise<{ id: string; codigo: string }> {
    const { data, error } = await admin
      .from('fondos')
      .insert({
        tenant_id: tenant.id,
        codigo,
        nombre: `Fondo ${codigo}`,
        naturaleza: 'destinacion_especifica',
        tipo_id: tipoProyecto,
      })
      .select('id, codigo')
      .single<{ id: string; codigo: string }>()
    if (error) throw new Error(`fixture fondo ${codigo}: ${error.message}`)
    for (const estado of ['pendiente_autorizacion', 'activo'] as const) {
      const { error: errEstado } = await admin.from('fondos').update({ estado }).eq('id', data.id)
      if (errEstado) throw new Error(`fixture fondo ${codigo} → ${estado}: ${errEstado.message}`)
    }
    return data
  }

  async function saldoDerivado(fondoId: string): Promise<number> {
    const { data, error } = await admin
      .from('fondos')
      .select('saldo_actual')
      .eq('id', fondoId)
      .single<{ saldo_actual: number }>()
    if (error) throw new Error(`saldo: ${error.message}`)
    return data.saldo_actual
  }

  beforeAll(async () => {
    tenant = await crearTenant(admin, 'fondos-cierre')
    tipoProyecto = await idTipoFondo(admin, 'proyecto')
    documentoId = await crearDocumentoFixture(admin, tenant.id)
  }, 60_000)

  afterAll(async () => {
    await eliminarTenant(admin, tenant.id)
  }, 60_000)

  it('un fondo activo sin saldo cierra directo, sin destino/órgano/decisión', async () => {
    const fondo = await crearFondoActivo('FCI-DIRECTO')
    const { error: errEnCierre } = await admin.from('fondos').update({ estado: 'en_cierre' }).eq('id', fondo.id)
    expect(errEnCierre).toBeNull()

    const { data, error } = await admin.rpc('fn_fondo_cerrar', { p_fondo_id: fondo.id }).single<{ estado: string }>()
    expect(error).toBeNull()
    expect(data!.estado).toBe('cerrado')
  })

  it('con saldo > 0, cerrar sin destino falla con FONDO_REMANENTE_SIN_DECISION', async () => {
    const fondo = await crearFondoActivo('FCI-SIN-DECISION')
    await admin.from('fondo_movimientos').insert({ tenant_id: tenant.id, fondo_id: fondo.id, tipo: 'aporte', monto: 90_000, documento_id: documentoId })
    await admin.from('fondos').update({ estado: 'en_cierre' }).eq('id', fondo.id)

    const { error } = await admin.rpc('fn_fondo_cerrar', { p_fondo_id: fondo.id })
    expect(error?.message).toMatch(/FONDO_REMANENTE_SIN_DECISION/)
  })

  it('destino devolución: registra el remanente, crea el movimiento cierre_remanente y cierra en 0', async () => {
    const fondo = await crearFondoActivo('FCI-DEVOLUCION')
    await admin.from('fondo_movimientos').insert({ tenant_id: tenant.id, fondo_id: fondo.id, tipo: 'aporte', monto: 60_000, documento_id: documentoId })
    await admin.from('fondos').update({ estado: 'en_cierre' }).eq('id', fondo.id)
    const organoId = await idCatalogo(admin, 'ORGANO_DECISORIO', 'asamblea')

    const { data, error } = await admin
      .rpc('fn_fondo_cerrar', {
        p_fondo_id: fondo.id,
        p_destino: 'devolucion',
        p_organo_id: organoId,
        p_decision: 'Se devuelve el remanente a los propietarios a prorrata de coeficiente.',
      })
      .single<{ estado: string; saldo_actual: number }>()
    expect(error).toBeNull()
    expect(data!.estado).toBe('cerrado')
    expect(data!.saldo_actual).toBe(0)
    expect(await saldoDerivado(fondo.id)).toBe(0)

    const { data: movimiento } = await admin
      .from('fondo_movimientos')
      .select('tipo, monto')
      .eq('fondo_id', fondo.id)
      .eq('tipo', 'cierre_remanente')
      .single<{ tipo: string; monto: number }>()
    expect(movimiento).toEqual({ tipo: 'cierre_remanente', monto: 60_000 })

    const { data: remanente } = await admin
      .from('fondo_remanentes')
      .select('destino, monto, fondo_destino_id')
      .eq('fondo_id', fondo.id)
      .single<{ destino: string; monto: number; fondo_destino_id: string | null }>()
    expect(remanente).toEqual({ destino: 'devolucion', monto: 60_000, fondo_destino_id: null })
  })

  it('destino traslado: acredita traslado_entrada en el fondo destino por el mismo monto', async () => {
    const origen = await crearFondoActivo('FCI-TRASLADO-ORIGEN')
    const destino = await crearFondoActivo('FCI-TRASLADO-DESTINO')
    await admin.from('fondo_movimientos').insert({ tenant_id: tenant.id, fondo_id: origen.id, tipo: 'aporte', monto: 45_000, documento_id: documentoId })
    await admin.from('fondos').update({ estado: 'en_cierre' }).eq('id', origen.id)
    const organoId = await idCatalogo(admin, 'ORGANO_DECISORIO', 'consejo')

    const { error } = await admin.rpc('fn_fondo_cerrar', {
      p_fondo_id: origen.id,
      p_destino: 'traslado',
      p_organo_id: organoId,
      p_decision: 'Se traslada el remanente al fondo de obra en curso.',
      p_fondo_destino_id: destino.id,
    })
    expect(error).toBeNull()
    expect(await saldoDerivado(origen.id)).toBe(0)
    expect(await saldoDerivado(destino.id)).toBe(45_000)

    const { data: entrada } = await admin
      .from('fondo_movimientos')
      .select('tipo, monto')
      .eq('fondo_id', destino.id)
      .eq('tipo', 'traslado_entrada')
      .single<{ tipo: string; monto: number }>()
    expect(entrada).toEqual({ tipo: 'traslado_entrada', monto: 45_000 })
  })

  it('no cierra con un compromiso pendiente (proyectado/comprometido/parcialmente_ejecutado)', async () => {
    const fondo = await crearFondoActivo('FCI-COMPROMISO-PENDIENTE')
    await admin.from('fondo_movimientos').insert({ tenant_id: tenant.id, fondo_id: fondo.id, tipo: 'aporte', monto: 20_000, documento_id: documentoId })
    await admin.from('fondo_compromisos').insert({
      tenant_id: tenant.id,
      fondo_id: fondo.id,
      concepto: 'Compromiso sin resolver',
      monto: 10_000,
    })
    await admin.from('fondos').update({ estado: 'en_cierre' }).eq('id', fondo.id)

    const { error } = await admin.rpc('fn_fondo_cerrar', {
      p_fondo_id: fondo.id,
      p_destino: 'aplicacion',
      p_organo_id: await idCatalogo(admin, 'ORGANO_DECISORIO', 'administrador'),
      p_decision: 'Se aplica a gastos generales.',
    })
    expect(error?.message).toMatch(/FONDO_COMPROMISOS_PENDIENTES/)
  })

  it('un compromiso pendiente SÍ se puede anular/liberar durante en_cierre, para poder cerrar (no queda en candado)', async () => {
    const fondo = await crearFondoActivo('FCI-COMPROMISO-RESUELTO')
    await admin.from('fondo_movimientos').insert({ tenant_id: tenant.id, fondo_id: fondo.id, tipo: 'aporte', monto: 20_000, documento_id: documentoId })
    const { data: compromiso } = await admin
      .from('fondo_compromisos')
      .insert({ tenant_id: tenant.id, fondo_id: fondo.id, concepto: 'Compromiso a resolver', monto: 10_000 })
      .select('id')
      .single<{ id: string }>()
    await admin.from('fondos').update({ estado: 'en_cierre' }).eq('id', fondo.id)

    // Antes del fix: esto fallaba con FONDO_ESTADO_NO_ADMITE_COMPROMISOS — un compromiso
    // pendiente quedaba en candado (no se podía resolver ni dejar el fondo cerrarse).
    const { error: errorAnular } = await admin
      .from('fondo_compromisos')
      .update({ estado: 'anulado' })
      .eq('id', compromiso!.id)
    expect(errorAnular).toBeNull()

    const { data, error } = await admin
      .rpc('fn_fondo_cerrar', {
        p_fondo_id: fondo.id,
        p_destino: 'aplicacion',
        p_organo_id: await idCatalogo(admin, 'ORGANO_DECISORIO', 'administrador'),
        p_decision: 'Se aplica a gastos generales.',
      })
      .single<{ estado: string }>()
    expect(error).toBeNull()
    expect(data!.estado).toBe('cerrado')
  })

  it('un compromiso pendiente NO se puede comprometer/ejecutar más durante en_cierre (solo liberar/anular)', async () => {
    const fondo = await crearFondoActivo('FCI-COMPROMISO-BLOQUEADO')
    await admin.from('fondo_movimientos').insert({ tenant_id: tenant.id, fondo_id: fondo.id, tipo: 'aporte', monto: 20_000, documento_id: documentoId })
    const { data: compromiso } = await admin
      .from('fondo_compromisos')
      .insert({ tenant_id: tenant.id, fondo_id: fondo.id, concepto: 'Compromiso a resolver', monto: 10_000 })
      .select('id')
      .single<{ id: string }>()
    await admin.from('fondos').update({ estado: 'en_cierre' }).eq('id', fondo.id)

    const { error } = await admin
      .from('fondo_compromisos')
      .update({ estado: 'comprometido' })
      .eq('id', compromiso!.id)
    expect(error?.message).toMatch(/FONDO_ESTADO_NO_ADMITE_COMPROMISOS/)
  })

  it('no cierra con una solicitud de uso pendiente', async () => {
    const solicitante = await crearUsuario(admin, 'ccm-fondo-cierre-solicitante')
    await crearMembership(admin, tenant.id, solicitante.id, 'auxiliar')
    const fondo = await crearFondoActivo('FCI-SOLICITUD-PENDIENTE')
    await admin.from('fondo_movimientos').insert({ tenant_id: tenant.id, fondo_id: fondo.id, tipo: 'aporte', monto: 15_000, documento_id: documentoId })
    await admin.from('fondo_solicitudes_uso').insert({
      tenant_id: tenant.id,
      fondo_id: fondo.id,
      solicitante_id: solicitante.id,
      objetivo: 'Reparación menor',
      monto_solicitado: 5_000,
    })
    await admin.from('fondos').update({ estado: 'en_cierre' }).eq('id', fondo.id)

    const { error } = await admin.rpc('fn_fondo_cerrar', {
      p_fondo_id: fondo.id,
      p_destino: 'aplicacion',
      p_organo_id: await idCatalogo(admin, 'ORGANO_DECISORIO', 'administrador'),
      p_decision: 'Se aplica a gastos generales.',
    })
    expect(error?.message).toMatch(/FONDO_SOLICITUDES_PENDIENTES/)

    await eliminarUsuario(admin, solicitante.id)
  })

  it('un UPDATE directo a cerrado sin pasar por fn_fondo_cerrar también queda bloqueado por el guard', async () => {
    const fondo = await crearFondoActivo('FCI-GUARD-DIRECTO')
    await admin.from('fondo_movimientos').insert({ tenant_id: tenant.id, fondo_id: fondo.id, tipo: 'aporte', monto: 30_000, documento_id: documentoId })
    await admin.from('fondos').update({ estado: 'en_cierre' }).eq('id', fondo.id)

    const { error } = await admin.from('fondos').update({ estado: 'cerrado' }).eq('id', fondo.id)
    expect(error?.message).toMatch(/FONDO_REMANENTE_SIN_DECISION/)
  })

  it('fondo_remanentes es append-only', async () => {
    const fondo = await crearFondoActivo('FCI-INMUTABLE')
    await admin.from('fondo_movimientos').insert({ tenant_id: tenant.id, fondo_id: fondo.id, tipo: 'aporte', monto: 25_000, documento_id: documentoId })
    await admin.from('fondos').update({ estado: 'en_cierre' }).eq('id', fondo.id)
    await admin.rpc('fn_fondo_cerrar', {
      p_fondo_id: fondo.id,
      p_destino: 'aplicacion',
      p_organo_id: await idCatalogo(admin, 'ORGANO_DECISORIO', 'otro'),
      p_decision: 'Se aplica a mantenimiento correctivo urgente.',
    })

    const { data: remanente } = await admin
      .from('fondo_remanentes')
      .select('id')
      .eq('fondo_id', fondo.id)
      .single<{ id: string }>()

    const { error: errUpdate } = await admin
      .from('fondo_remanentes')
      .update({ decision: 'cambiado' })
      .eq('id', remanente!.id)
    expect(errUpdate?.message).toMatch(/FONDO_REMANENTE_INMUTABLE/)

    const { error: errDelete } = await admin.from('fondo_remanentes').delete().eq('id', remanente!.id)
    expect(errDelete?.message).toMatch(/FONDO_REMANENTE_INMUTABLE/)
  })
})

d('Dominio Fondos — soporte documental diferenciado (GAP-22, D-42, Modelo §36)', () => {
  const admin = clienteAdmin(env!)
  let tenant: TenantPrueba
  let fondo: { id: string }
  let documentoId: string

  beforeAll(async () => {
    tenant = await crearTenant(admin, 'fondos-soporte')
    const tipoProyecto = await idTipoFondo(admin, 'proyecto')
    documentoId = await crearDocumentoFixture(admin, tenant.id)

    const { data, error } = await admin
      .from('fondos')
      .insert({
        tenant_id: tenant.id,
        codigo: 'FON-SOP',
        nombre: 'Fondo soporte diferenciado',
        naturaleza: 'destinacion_especifica',
        tipo_id: tipoProyecto,
      })
      .select('id')
      .single<{ id: string }>()
    if (error) throw new Error(`fixture fondo: ${error.message}`)
    fondo = data
    for (const estado of ['pendiente_autorizacion', 'activo'] as const) {
      await admin.from('fondos').update({ estado }).eq('id', fondo.id)
    }
  }, 60_000)

  afterAll(async () => {
    await eliminarTenant(admin, tenant.id)
  }, 60_000)

  it('un aporte manual (sin pago_id) exige documento_id — el automático por recaudo (BLOQUE K) no', async () => {
    const { error: errSinRespaldo } = await admin
      .from('fondo_movimientos')
      .insert({ tenant_id: tenant.id, fondo_id: fondo.id, tipo: 'aporte', monto: 1_000 })
    expect(errSinRespaldo?.message).toMatch(/FONDO_SOPORTE_REQUERIDO/)

    const { error: errConDocumento } = await admin
      .from('fondo_movimientos')
      .insert({ tenant_id: tenant.id, fondo_id: fondo.id, tipo: 'aporte', monto: 1_000, documento_id: documentoId })
    expect(errConDocumento).toBeNull()
  })

  it('rendimiento/ajuste/traslado_entrada/traslado_salida exigen documento_id siempre (no hay ruta automática)', async () => {
    type TipoSinRutaAutomatica = 'rendimiento' | 'ajuste' | 'traslado_entrada' | 'traslado_salida'
    const casos: Array<{ tipo: TipoSinRutaAutomatica; monto: number; extra?: Record<string, unknown> }> = [
      { tipo: 'rendimiento', monto: 500 },
      { tipo: 'ajuste', monto: -10, extra: { motivo: 'ajuste de prueba' } },
      { tipo: 'traslado_entrada', monto: 200 },
      { tipo: 'traslado_salida', monto: 200 },
    ]

    for (const caso of casos) {
      const { error: errSinDocumento } = await admin.from('fondo_movimientos').insert({
        tenant_id: tenant.id,
        fondo_id: fondo.id,
        tipo: caso.tipo,
        monto: caso.monto,
        ...caso.extra,
      })
      expect(errSinDocumento?.message, `${caso.tipo} sin documento`).toMatch(/FONDO_SOPORTE_REQUERIDO/)

      const { error: errConDocumento } = await admin.from('fondo_movimientos').insert({
        tenant_id: tenant.id,
        fondo_id: fondo.id,
        tipo: caso.tipo,
        monto: caso.monto,
        documento_id: documentoId,
        ...caso.extra,
      })
      expect(errConDocumento, `${caso.tipo} con documento`).toBeNull()
    }
  })

  it('un uso contra un compromiso exige documento_id', async () => {
    const { data: compromiso, error: errCompromiso } = await admin
      .from('fondo_compromisos')
      .insert({
        tenant_id: tenant.id,
        fondo_id: fondo.id,
        concepto: 'Compromiso soporte',
        monto: 100,
        estado: 'comprometido',
      })
      .select('id')
      .single<{ id: string }>()
    if (errCompromiso) throw new Error(`fixture compromiso: ${errCompromiso.message}`)

    const { error: errSinDocumento } = await admin.from('fondo_movimientos').insert({
      tenant_id: tenant.id,
      fondo_id: fondo.id,
      tipo: 'uso',
      monto: 50,
      compromiso_id: compromiso.id,
    })
    expect(errSinDocumento?.message).toMatch(/FONDO_SOPORTE_REQUERIDO/)

    const { error: errConDocumento } = await admin.from('fondo_movimientos').insert({
      tenant_id: tenant.id,
      fondo_id: fondo.id,
      tipo: 'uso',
      monto: 50,
      compromiso_id: compromiso.id,
      documento_id: documentoId,
    })
    expect(errConDocumento).toBeNull()
  })

  it('una reversión queda exenta — su respaldo es el movimiento que corrige, no un documento', async () => {
    const { data: original } = await admin
      .from('fondo_movimientos')
      .insert({ tenant_id: tenant.id, fondo_id: fondo.id, tipo: 'aporte', monto: 3_000, documento_id: documentoId })
      .select('id')
      .single<{ id: string }>()

    const { error } = await admin.from('fondo_movimientos').insert({
      tenant_id: tenant.id,
      fondo_id: fondo.id,
      tipo: 'reversion',
      monto: -3_000,
      motivo: 'corrige aporte de prueba',
      reversion_de_id: original!.id,
    })
    expect(error).toBeNull()
  })

  it('cierre_remanente y el traslado_entrada que fn_fondo_cerrar genera quedan exentos — su respaldo es fondo_remanentes', async () => {
    const tipoProyecto = await idTipoFondo(admin, 'proyecto')
    const origen = await admin
      .from('fondos')
      .insert({
        tenant_id: tenant.id,
        codigo: 'FON-SOP-ORIGEN',
        nombre: 'Origen cierre',
        naturaleza: 'destinacion_especifica',
        tipo_id: tipoProyecto,
      })
      .select('id')
      .single<{ id: string }>()
    const destino = await admin
      .from('fondos')
      .insert({
        tenant_id: tenant.id,
        codigo: 'FON-SOP-DESTINO',
        nombre: 'Destino cierre',
        naturaleza: 'destinacion_especifica',
        tipo_id: tipoProyecto,
      })
      .select('id')
      .single<{ id: string }>()
    for (const f of [origen.data!.id, destino.data!.id]) {
      for (const estado of ['pendiente_autorizacion', 'activo'] as const) {
        await admin.from('fondos').update({ estado }).eq('id', f)
      }
    }
    await admin
      .from('fondo_movimientos')
      .insert({ tenant_id: tenant.id, fondo_id: origen.data!.id, tipo: 'aporte', monto: 4_000, documento_id: documentoId })
    await admin.from('fondos').update({ estado: 'en_cierre' }).eq('id', origen.data!.id)

    const { error } = await admin.rpc('fn_fondo_cerrar', {
      p_fondo_id: origen.data!.id,
      p_destino: 'traslado',
      p_organo_id: await idCatalogo(admin, 'ORGANO_DECISORIO', 'asamblea'),
      p_decision: 'Traslado de prueba sin documento — exento por bandera de sesión.',
      p_fondo_destino_id: destino.data!.id,
    })
    expect(error).toBeNull()

    const { data: movimientos } = await admin
      .from('fondo_movimientos')
      .select('tipo, documento_id')
      .in('fondo_id', [origen.data!.id, destino.data!.id])
      .in('tipo', ['cierre_remanente', 'traslado_entrada'])
    expect(movimientos).toHaveLength(2)
    for (const m of movimientos!) {
      expect(m.documento_id).toBeNull()
    }
  })
})
