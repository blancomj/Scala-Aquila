/**
 * CAR §34 — expediente probatorio: envíos, acuses y estado de acreditación.
 *
 * Lo que se prueba aquí no es que el sistema envíe: es que lo enviado
 * pueda ACREDITARSE. §34.1: «una gestión de cobro que no puede acreditarse
 * no ocurrió». El estado `ejecutada` de una acción significa despachada al
 * proveedor; la acreditación se deriva de los acuses (REC-CAR-018) y no
 * existe como columna, igual que no existe `esta_en_mora` (AP-01).
 *
 * Cubre los golden cases PH-C40, PH-C41, PH-C43 y PH-C45 de §34.7, la
 * invariante I-C22 (acuse manual sin documento no prueba nada) y el
 * carácter append-only de las dos tablas.
 *
 * PH-C42 (escalamiento sostenido solo en constancias humanas) y PH-C44
 * (reproducibilidad del expediente) dependen de piezas que todavía no
 * existen — I-C23 en la función de escalamiento y fn_compilar_expediente
 * de §34.5 — y se prueban cuando se construyan.
 */
import type { Database } from '@aquila/shared'
import { afterAll, describe, expect, it } from 'vitest'
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
  console.warn('SALTADO tests/tenancy/cartera-expediente-probatorio: faltan variables de Supabase en .env')
}

interface Expediente {
  expediente_hash: string
  generado_at: string
  identificacion: Record<string, unknown>
  titulo_ejecutivo: Record<string, unknown>
  composicion_deuda: unknown
  cronologia_gestion: unknown
  trazabilidad: Record<string, unknown>
  intentos_fallidos: unknown
}

interface Acreditacion {
  envios_total: number
  envios_acreditados: number
  ultimo_estado: string | null
  ultimo_acuse_at: string | null
  acreditada: boolean
}

async function listaTipoId(admin: Cliente, tipo: string, codigo: string): Promise<number> {
  const { data, error } = await admin
    .from('lista_tipos')
    .select('id')
    .eq('tipo', tipo)
    .eq('codigo', codigo)
    .is('tenant_id', null)
    .single<{ id: number }>()
  if (error) throw new Error(`fixture ${tipo}.${codigo}: ${error.message}`)
  return data.id
}

d('CAR §34 — expediente probatorio: envíos, acuses y acreditación', () => {
  const admin = clienteAdmin(env!)
  let administrador: UsuarioPrueba
  let tenant: TenantPrueba
  let cliente: Cliente
  let inmuebleId: string
  let terceroId: string
  let politicaId: string
  let cargoId: string

  afterAll(async () => {
    await eliminarTenant(admin, tenant.id)
    await eliminarUsuario(admin, administrador.id)
  })

  /** Crea una acción de cobranza mínima con contexto congelado válido. */
  async function crearAccion(tipoAccion: Database['public']['Tables']['acciones_cobranza']['Insert']['tipo_accion'], fechaProgramada = '2026-02-15'): Promise<string> {
    const { data, error } = await admin
      .from('acciones_cobranza')
      .insert({
        tenant_id: tenant.id,
        inmueble_id: inmuebleId,
        tipo_accion: tipoAccion,
        canal: 'email',
        fecha_programada: fechaProgramada,
        clasificacion_codigo: 'MORA',
        politica_clasificacion_id: politicaId,
        politica_version: 1,
        dias_mora_al_momento: 45,
        deuda_total_al_momento: 500_000,
        destinatario_tercero_id: terceroId,
        destinatario_rol_codigo: 'copropietario',
        estado: 'programada',
        creada_por: 'job',
      })
      .select('id')
      .single<{ id: string }>()
    if (error) throw new Error(`crearAccion: ${error.message}`)
    return data.id
  }

  /** Registra un envío sobre una acción. */
  async function crearEnvio(
    accionId: string,
    intento: number,
    referencia: string,
    enviadoAt = '2026-02-15T09:00:00Z',
  ): Promise<string> {
    const { data, error } = await admin
      .from('acciones_cobranza_envios')
      .insert({
        tenant_id: tenant.id,
        accion_id: accionId,
        intento_numero: intento,
        enviado_at: enviadoAt,
        canal: 'email',
        destinatario_tercero_id: terceroId,
        destinatario_contacto: 'deudor@example.test',
        plantilla_codigo: 'COB-RECORDATORIO',
        plantilla_version: 1,
        asunto: 'Estado de su cuenta',
        contenido_renderizado: 'Señor(a) propietario(a): a la fecha registra un saldo pendiente…',
        contenido_hash: `hash-${accionId}-${String(intento)}`,
        proveedor: 'brevo',
        referencia_externa: referencia,
      })
      .select('id')
      .single<{ id: string }>()
    if (error) throw new Error(`crearEnvio: ${error.message}`)
    return data.id
  }

  async function compilar(fechaCorte: string): Promise<Expediente> {
    const { data, error } = await admin.rpc('fn_compilar_expediente', {
      p_tenant_id: tenant.id,
      p_inmueble_id: inmuebleId,
      p_fecha_corte: fechaCorte,
    })
    if (error) throw new Error(`fn_compilar_expediente: ${error.message}`)
    return data as unknown as Expediente
  }

  async function acreditacion(accionId: string): Promise<Acreditacion> {
    const { data, error } = await admin.rpc('fn_acreditacion_accion', {
      p_tenant_id: tenant.id,
      p_accion_id: accionId,
    })
    if (error) throw new Error(`fn_acreditacion_accion: ${error.message}`)
    const filas = data as unknown as Acreditacion[]
    return filas[0]!
  }

  it('setup: tenant con inmueble, tercero y política vigente', async () => {
    administrador = await crearUsuario(admin, 'cep-admin')
    tenant = await crearTenant(admin, 'cep', administrador.id)
    await crearMembership(admin, tenant.id, administrador.id, 'administrador')
    cliente = await clienteComo(env!, administrador)

    const { data: politica, error: errPol } = await admin
      .from('politicas_clasificacion_cartera')
      .insert({
        tenant_id: tenant.id,
        version: 1,
        estado: 'vigente',
        nombre: 'Política expediente v1',
        policy_hash: `test-fixture-expediente-${tenant.id}`,
      })
      .select('id')
      .single<{ id: string }>()
    if (errPol) throw new Error(`fixture politica: ${errPol.message}`)
    politicaId = politica.id

    const tipoInmueble = await listaTipoId(admin, 'TIPO_INMUEBLE', 'apartamento')
    const { data: inmueble, error: errInm } = await admin
      .from('inmuebles')
      .insert({ tenant_id: tenant.id, codigo: `CEP-${String(Date.now())}`, tipo_id: tipoInmueble })
      .select('id')
      .single<{ id: string }>()
    if (errInm) throw new Error(`fixture inmueble: ${errInm.message}`)
    inmuebleId = inmueble.id

    const tipoIdent = await listaTipoId(admin, 'TIPO_IDENTIFICACION', 'cedula')
    const estadoActivo = await listaTipoId(admin, 'ESTADO_TERCERO', 'activo')
    const sello = String(Date.now())
    const { data: tercero, error: errTer } = await admin
      .from('terceros')
      .insert({
        tenant_id: tenant.id,
        tipo_identificacion_id: tipoIdent,
        numero_documento: `CEP-${sello}`,
        tipo_persona: 'natural',
        primer_nombre: 'Ernesto',
        primer_apellido: 'Pardo',
        email: `cep-${sello}@example.test`,
        estado_id: estadoActivo,
      })
      .select('id')
      .single<{ id: string }>()
    if (errTer) throw new Error(`fixture tercero: ${errTer.message}`)
    terceroId = tercero.id

    const rolCopropietario = await listaTipoId(admin, 'PERSONA_PREDIO', 'copropietario')
    const { error: errRel } = await admin.from('inmueble_persona_rol').insert({
      tenant_id: tenant.id,
      inmueble_id: inmuebleId,
      tercero_id: terceroId,
      rol_id: rolCopropietario,
      porcentaje: 100,
      vigente_desde: '2020-01-01',
      es_pagador: true,
      recibe_notificaciones: true,
    })
    if (errRel) throw new Error(`fixture inmueble_persona_rol: ${errRel.message}`)
  }, 60_000)

  it('PH-C40: email entregado acredita la acción, con el texto íntegro conservado', async () => {
    const accionId = await crearAccion('email')
    const envioId = await crearEnvio(accionId, 1, 'brevo-msg-c40')

    // Sin acuse todavía: despachada no es acreditada (REC-CAR-016).
    const antes = await acreditacion(accionId)
    expect(antes.envios_total).toBe(1)
    expect(antes.acreditada).toBe(false)
    expect(antes.ultimo_estado).toBeNull()

    const { error } = await admin.from('acciones_cobranza_acuses').insert({
      tenant_id: tenant.id,
      envio_id: envioId,
      estado: 'entregado',
      ocurrido_at: '2026-02-15T14:30:00Z',
      origen: 'proveedor',
      payload_crudo: { event: 'delivered', 'message-id': 'brevo-msg-c40' },
    })
    expect(error).toBeNull()

    const despues = await acreditacion(accionId)
    expect(despues.acreditada).toBe(true)
    expect(despues.envios_acreditados).toBe(1)
    expect(despues.ultimo_estado).toBe('entregado')
    expect(despues.ultimo_acuse_at).not.toBeNull()

    // Lo que se aporta al proceso es el texto, no su huella (§34.1).
    const { data: envio } = await admin
      .from('acciones_cobranza_envios')
      .select('contenido_renderizado, destinatario_contacto')
      .eq('id', envioId)
      .single<{ contenido_renderizado: string; destinatario_contacto: string }>()
    expect(envio?.contenido_renderizado).toContain('saldo pendiente')
    expect(envio?.destinatario_contacto).toBe('deudor@example.test')
  }, 30_000)

  it('PH-C41: intento rebotado y reintento entregado — el expediente conserva ambos', async () => {
    const accionId = await crearAccion('email')
    const envio1 = await crearEnvio(accionId, 1, 'brevo-msg-c41-a')
    const envio2 = await crearEnvio(accionId, 2, 'brevo-msg-c41-b')

    const { error: err1 } = await admin.from('acciones_cobranza_acuses').insert({
      tenant_id: tenant.id,
      envio_id: envio1,
      estado: 'rebotado',
      ocurrido_at: '2026-02-15T10:00:00Z',
      origen: 'proveedor',
      motivo: 'mailbox unavailable',
    })
    expect(err1).toBeNull()

    const soloRebote = await acreditacion(accionId)
    expect(soloRebote.acreditada).toBe(false)
    expect(soloRebote.envios_total).toBe(2)

    const { error: err2 } = await admin.from('acciones_cobranza_acuses').insert({
      tenant_id: tenant.id,
      envio_id: envio2,
      estado: 'entregado',
      ocurrido_at: '2026-02-16T09:00:00Z',
      origen: 'proveedor',
    })
    expect(err2).toBeNull()

    const final = await acreditacion(accionId)
    expect(final.acreditada).toBe(true)
    // Dos envíos, uno solo acreditado: el rebote NO desaparece.
    expect(final.envios_total).toBe(2)
    expect(final.envios_acreditados).toBe(1)

    const { data: envios } = await admin
      .from('acciones_cobranza_envios')
      .select('intento_numero')
      .eq('accion_id', accionId)
      .order('intento_numero')
    expect((envios ?? []).map((e) => e.intento_numero)).toEqual([1, 2])
  }, 30_000)

  it("PH-C41b: 'leido' posterior a 'entregado' gana como último estado y mantiene la acreditación", async () => {
    const accionId = await crearAccion('email')
    const envioId = await crearEnvio(accionId, 1, 'brevo-msg-c41b')

    await admin.from('acciones_cobranza_acuses').insert([
      {
        tenant_id: tenant.id,
        envio_id: envioId,
        estado: 'encolado',
        ocurrido_at: '2026-02-15T08:00:00Z',
        origen: 'proveedor',
      },
      {
        tenant_id: tenant.id,
        envio_id: envioId,
        estado: 'entregado',
        ocurrido_at: '2026-02-15T08:05:00Z',
        origen: 'proveedor',
      },
      {
        tenant_id: tenant.id,
        envio_id: envioId,
        estado: 'leido',
        ocurrido_at: '2026-02-15T11:20:00Z',
        origen: 'proveedor',
      },
    ])

    const res = await acreditacion(accionId)
    expect(res.ultimo_estado).toBe('leido')
    expect(res.acreditada).toBe(true)
    expect(res.envios_acreditados).toBe(1)
  }, 30_000)

  it('PH-C43: no entregable no acredita la notificación pero conserva la diligencia', async () => {
    const accionId = await crearAccion('carta')
    const envioId = await crearEnvio(accionId, 1, 'postal-guia-c43')

    const { error } = await admin.from('acciones_cobranza_acuses').insert({
      tenant_id: tenant.id,
      envio_id: envioId,
      estado: 'no_entregable',
      ocurrido_at: '2026-02-20T16:00:00Z',
      origen: 'proveedor',
      motivo: 'dirección inexistente — constancia del operador postal',
    })
    expect(error).toBeNull()

    const res = await acreditacion(accionId)
    expect(res.acreditada).toBe(false)
    expect(res.ultimo_estado).toBe('no_entregable')
    // El intento no se borra: un fallo documentado vale ante un juez y su
    // ausencia no.
    expect(res.envios_total).toBe(1)

    const { data: acuse } = await admin
      .from('acciones_cobranza_acuses')
      .select('motivo')
      .eq('envio_id', envioId)
      .single<{ motivo: string }>()
    expect(acuse?.motivo).toContain('inexistente')
  }, 30_000)

  it('PH-C45: el mismo webhook reenviado no duplica la prueba', async () => {
    const accionId = await crearAccion('email')
    const envioId = await crearEnvio(accionId, 1, 'brevo-msg-c45')

    const acuse = {
      tenant_id: tenant.id,
      envio_id: envioId,
      estado: 'entregado' as const,
      ocurrido_at: '2026-02-15T12:00:00Z',
      origen: 'proveedor' as const,
    }

    const { error: primero } = await admin.from('acciones_cobranza_acuses').insert(acuse)
    expect(primero).toBeNull()

    const { error: repetido } = await admin.from('acciones_cobranza_acuses').insert(acuse)
    expect(repetido).not.toBeNull()
    expect(repetido?.message ?? '').toMatch(/acuse_unico|duplicate key/i)

    const { count } = await admin
      .from('acciones_cobranza_acuses')
      .select('id', { count: 'exact', head: true })
      .eq('envio_id', envioId)
    expect(count).toBe(1)
  }, 30_000)

  it('I-C22: un acuse manual sin documento que lo respalde es rechazado', async () => {
    const accionId = await crearAccion('carta')
    const envioId = await crearEnvio(accionId, 1, 'postal-guia-ic22')

    const { error } = await admin.from('acciones_cobranza_acuses').insert({
      tenant_id: tenant.id,
      envio_id: envioId,
      estado: 'entregado',
      ocurrido_at: '2026-02-18T09:00:00Z',
      origen: 'manual',
      motivo: 'el portero dice que lo recibió',
    })
    expect(error).not.toBeNull()
    expect(error?.message ?? '').toMatch(/acuse_manual_exige_documento/i)

    const res = await acreditacion(accionId)
    expect(res.acreditada).toBe(false)
  }, 30_000)

  it('append-only: envíos y acuses no admiten UPDATE ni DELETE', async () => {
    const accionId = await crearAccion('email')
    const envioId = await crearEnvio(accionId, 1, 'brevo-msg-append')
    await admin.from('acciones_cobranza_acuses').insert({
      tenant_id: tenant.id,
      envio_id: envioId,
      estado: 'entregado',
      ocurrido_at: '2026-02-15T13:00:00Z',
      origen: 'proveedor',
    })

    const { error: errUpd } = await admin
      .from('acciones_cobranza_envios')
      .update({ contenido_renderizado: 'otro texto' })
      .eq('id', envioId)
    expect(errUpd?.message ?? '').toMatch(/APPEND_ONLY/i)

    const { error: errDel } = await admin
      .from('acciones_cobranza_envios')
      .delete()
      .eq('id', envioId)
    expect(errDel?.message ?? '').toMatch(/APPEND_ONLY/i)

    const { error: errAcuseUpd } = await admin
      .from('acciones_cobranza_acuses')
      .update({ estado: 'rebotado' })
      .eq('envio_id', envioId)
    expect(errAcuseUpd?.message ?? '').toMatch(/APPEND_ONLY/i)
  }, 30_000)

  it('RLS: el miembro lee la evidencia de su tenant y no puede fabricarla', async () => {
    const accionId = await crearAccion('email')
    const envioId = await crearEnvio(accionId, 1, 'brevo-msg-rls')

    const { data: leidos, error: errSel } = await cliente
      .from('acciones_cobranza_envios')
      .select('id')
      .eq('id', envioId)
    expect(errSel).toBeNull()
    expect((leidos ?? []).length).toBe(1)

    // Sin política de INSERT para authenticated: la evidencia la escribe el
    // worker con service_role. Un envío tecleado a mano no probaría nada.
    const { error: errIns } = await cliente.from('acciones_cobranza_envios').insert({
      tenant_id: tenant.id,
      accion_id: accionId,
      intento_numero: 99,
      canal: 'email',
      destinatario_tercero_id: terceroId,
      destinatario_contacto: 'inventado@example.test',
      plantilla_codigo: 'COB-RECORDATORIO',
      plantilla_version: 1,
      contenido_renderizado: 'texto fabricado a mano',
      contenido_hash: 'hash-falso',
      proveedor: 'manual',
    })
    expect(errIns).not.toBeNull()
  }, 30_000)

  // ── §34.5 · compilación del expediente ──────────────────────────────
  // Los tests anteriores ya dejaron acciones con envíos, acuses entregados
  // y un no_entregable: el expediente se compila sobre ESA historia, no
  // sobre datos inventados aquí.

  const CORTE = '2026-02-28'

  it('setup: un cargo vencido y un pago POSTERIOR al corte', async () => {
    const { data: periodo, error: errPer } = await admin
      .from('periodos')
      .insert({ tenant_id: tenant.id, anio: 2026, mes: 1, estado: 'abierto', fecha_vencimiento: '2026-01-10' })
      .select('id')
      .single<{ id: string }>()
    if (errPer) throw new Error(`fixture periodo: ${errPer.message}`)

    const { data: concepto, error: errCon } = await admin
      .from('conceptos')
      .insert({
        tenant_id: tenant.id,
        codigo: `CEP-${String(Date.now())}`,
        nombre: 'Cuota de administración',
        modo_calculo: 'distribucion',
        modo_valor: 'formulado',
        tipo_recurrencia: 'recurrente',
        periodicidad: 'mensual',
        alcance: 'todos',
        fecha_inicio_anio: 2000,
        fecha_inicio_mes: 1,
        prioridad: 100,
        estado: 'activo',
      })
      .select('id')
      .single<{ id: string }>()
    if (errCon) throw new Error(`fixture concepto: ${errCon.message}`)

    const { data: liq, error: errLiq } = await admin
      .from('liquidaciones')
      .insert({
        tenant_id: tenant.id,
        periodo_id: periodo.id,
        result_hash: `test-fixture-cep-${String(Date.now())}`,
        tenant_total: 300_000,
      })
      .select('id')
      .single<{ id: string }>()
    if (errLiq) throw new Error(`fixture liquidacion: ${errLiq.message}`)

    const { data: linea, error: errLin } = await admin
      .from('liquidacion_lineas')
      .insert({
        tenant_id: tenant.id,
        liquidacion_id: liq.id,
        inmueble_id: inmuebleId,
        concepto_id: concepto.id,
        monto: 300_000,
      })
      .select('id')
      .single<{ id: string }>()
    if (errLin) throw new Error(`fixture linea: ${errLin.message}`)

    const { data: cargo, error: errCargo } = await admin
      .from('cargos')
      .insert({
        tenant_id: tenant.id,
        inmueble_id: inmuebleId,
        periodo_id: periodo.id,
        categoria: 'capital',
        origen_tipo: 'liquidacion_linea',
        liquidacion_linea_id: linea.id,
        concepto_id: concepto.id,
        monto_original: 300_000,
      })
      .select('id')
      .single<{ id: string }>()
    if (errCargo) throw new Error(`fixture cargo: ${errCargo.message}`)
    cargoId = cargo.id

    // Pago de marzo: NO debe alterar el saldo al corte de febrero.
    const formaPago = await listaTipoId(admin, 'FORMA_PAGO', 'transferencia_bancaria')
    const { data: pago, error: errPago } = await admin
      .from('pagos')
      .insert({
        tenant_id: tenant.id,
        inmueble_id: inmuebleId,
        monto: 100_000,
        fecha_pago: '2026-03-10',
        forma_pago_id: formaPago,
      })
      .select('id')
      .single<{ id: string }>()
    if (errPago) throw new Error(`fixture pago: ${errPago.message}`)

    const { error: errApl } = await admin.from('pago_aplicaciones').insert({
      tenant_id: tenant.id,
      pago_id: pago.id,
      cargo_id: cargoId,
      monto: 100_000,
    })
    if (errApl) throw new Error(`fixture aplicacion: ${errApl.message}`)
  }, 60_000)

  it('§34.5: el expediente reúne las secciones exigidas, sobre datos reales', async () => {
    const exp = await compilar(CORTE)

    // 1. Identificación — el obligado del art. 29, vigente al corte.
    const obligados = exp.identificacion.obligados as Array<Record<string, unknown>>
    expect(obligados.length).toBe(1)
    expect(obligados[0]!.tercero_id).toBe(terceroId)

    // 2. Título ejecutivo — no hay certificación: se dice, no se calla.
    expect(exp.titulo_ejecutivo.certificacion_id).toBeNull()
    expect(String(exp.titulo_ejecutivo.faltante)).toContain('art. 48')

    // 3. Composición de deuda — saldo AL CORTE: el pago de marzo no cuenta.
    const deuda = exp.composicion_deuda as Array<Record<string, unknown>>
    const cargo = deuda.find((c) => c.cargo_id === cargoId)
    expect(cargo).toBeDefined()
    expect(Number(cargo!.saldo_al_corte)).toBe(300_000)

    // 4. Cronología — con el texto íntegro de lo enviado y su acuse.
    const cronologia = exp.cronologia_gestion as Array<Record<string, unknown>>
    expect(cronologia.length).toBeGreaterThanOrEqual(6)
    const conAcuse = cronologia.find((a) => a.acreditada === true)
    expect(conAcuse).toBeDefined()
    const envios = conAcuse!.envios as Array<Record<string, unknown>>
    expect(String(envios[0]!.contenido_renderizado)).toContain('saldo pendiente')
    expect((envios[0]!.acuses as unknown[]).length).toBeGreaterThan(0)

    // 7. Intentos fallidos — diligencia documentada, no un vacío.
    const fallidos = exp.intentos_fallidos as Array<Record<string, unknown>>
    const noEntregable = fallidos.find((f) => f.estado_final === 'no_entregable')
    expect(noEntregable).toBeDefined()
    expect(String(noEntregable!.motivo)).toContain('inexistente')

    // 6. Trazabilidad — quién aprobó qué.
    expect(exp.trazabilidad).toHaveProperty('aprobaciones')
  }, 30_000)

  it('PH-C44: el mismo corte produce el mismo hash, con datos posteriores en la base', async () => {
    const primera = await compilar(CORTE)
    const segunda = await compilar(CORTE)
    expect(segunda.expediente_hash).toBe(primera.expediente_hash)
    // generado_at queda fuera del hash a propósito: es lo único que cambia.
    expect(segunda.generado_at).not.toBe(primera.generado_at)

    // Gestión POSTERIOR al corte: el expediente de febrero no puede moverse.
    const accionId = await crearAccion('email', '2026-03-20')
    const envioId = await crearEnvio(accionId, 1, 'brevo-msg-marzo', '2026-03-20T09:00:00Z')
    await admin.from('acciones_cobranza_acuses').insert({
      tenant_id: tenant.id,
      envio_id: envioId,
      estado: 'entregado',
      ocurrido_at: '2026-03-21T10:00:00Z',
      origen: 'proveedor',
    })

    const tercera = await compilar(CORTE)
    expect(tercera.expediente_hash).toBe(primera.expediente_hash)

    // Y el corte posterior sí lo ve: el filtro es por fecha, no por olvido.
    const marzo = await compilar('2026-03-31')
    expect(marzo.expediente_hash).not.toBe(primera.expediente_hash)
  }, 60_000)
})
