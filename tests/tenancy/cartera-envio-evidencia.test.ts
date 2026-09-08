/**
 * CAR §34.2 — el circuito probatorio completo, contra servicios reales:
 *
 *   despachar → registrar el envío → recibir el acuse → acreditar
 *
 * ENVÍA UN SMS DE VERDAD. El propietario del producto autorizó el envío al
 * número de SMS_DESTINO_PRUEBA el 2026-08-28; cada corrida gasta un crédito
 * de Brevo. Por eso el test envía UNO solo y el resto de las
 * comprobaciones —acuses, deduplicación, acreditación— se hacen contra el
 * webhook, que no cuesta nada.
 *
 * El acuse de entrega real de Brevo llega a webhook-brevo por su cuenta y
 * puede tardar; este test no lo espera. Simula el POST del proveedor con el
 * message_id real que devolvió el envío, que es exactamente el mismo cuerpo
 * que Brevo manda. Cuando el acuse real llegue, acuse_unico lo deduplica si
 * coincide, o suma un acuse posterior legítimo si trae otra fecha.
 */
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
const tokenWebhook = process.env.BREVO_WEBHOOK_TOKEN
const d = env && tokenWebhook ? describe : describe.skip

if (!env || !tokenWebhook) {
  console.warn('SALTADO tests/tenancy/cartera-envio-evidencia: faltan variables de Supabase o BREVO_WEBHOOK_TOKEN en .env')
}

/** Autorizado por el propietario del producto el 2026-08-28. */
const SMS_DESTINO_PRUEBA = '+573107418731'
const EVENT_TYPE = 'cartera_pago_vencido'

interface RespuestaWorker {
  success: boolean
  estado: string
  envioId: string | null
  evidenciaRegistrada: boolean
  errorMessage?: string
}

interface Acreditacion {
  envios_total: number
  envios_acreditados: number
  ultimo_estado: string | null
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

d('CAR §34.2 — circuito probatorio: despacho real, evidencia y acuse', () => {
  const admin = clienteAdmin(env!)
  let administrador: UsuarioPrueba
  let tenant: TenantPrueba
  let cliente: Cliente
  let inmuebleId: string
  let terceroId: string
  let accionId: string
  let envioId: string
  let messageId: string
  /**
   * Momento del acuse de entrega. Tiene que ser POSTERIOR al acuse
   * 'encolado' que dejó el worker: gana el acuse más reciente, así que un
   * 'entregado' fechado antes del encolado no acreditaría nada — y eso es
   * lo correcto, no un defecto.
   */
  let tsEntrega: number

  afterAll(async () => {
    await eliminarTenant(admin, tenant.id)
    await eliminarUsuario(admin, administrador.id)
  })

  /** POST al webhook con el cuerpo que manda Brevo para SMS. */
  async function enviarEventoBrevo(evento: Record<string, unknown>): Promise<Response> {
    return await fetch(`${env!.url}/functions/v1/webhook-brevo/${tokenWebhook!}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(evento),
    })
  }

  /**
   * Un envío extra sobre la misma acción, insertado con service_role. Sirve
   * para probar el webhook sin gastar un SMS por caso: lo que se ejercita
   * es la traducción del evento, no el despacho.
   */
  async function crearEnvioSuelto(intento: number, referencia: string, enviadoAt: string): Promise<string> {
    const { data, error } = await admin
      .from('acciones_cobranza_envios')
      .insert({
        tenant_id: tenant.id,
        accion_id: accionId,
        intento_numero: intento,
        canal: 'sms',
        destinatario_tercero_id: terceroId,
        destinatario_contacto: SMS_DESTINO_PRUEBA,
        plantilla_codigo: EVENT_TYPE,
        plantilla_version: 0,
        contenido_renderizado: `envío ${String(intento)} para prueba de webhook`,
        contenido_hash: `hash-webhook-${String(intento)}`,
        proveedor: 'brevo',
        referencia_externa: referencia,
        enviado_at: enviadoAt,
      })
      .select('id')
      .single<{ id: string }>()
    if (error) throw new Error(`crearEnvioSuelto: ${error.message}`)
    return data.id
  }

  async function acreditacion(): Promise<Acreditacion> {
    const { data, error } = await admin.rpc('fn_acreditacion_accion', {
      p_tenant_id: tenant.id,
      p_accion_id: accionId,
    })
    if (error) throw new Error(`fn_acreditacion_accion: ${error.message}`)
    return (data as unknown as Acreditacion[])[0]!
  }

  it('setup: inmueble en mora, plantilla SMS activa y acción programada', async () => {
    administrador = await crearUsuario(admin, 'cee-admin')
    tenant = await crearTenant(admin, 'cee', administrador.id)
    await crearMembership(admin, tenant.id, administrador.id, 'administrador')
    cliente = await clienteComo(env!, administrador)

    const { data: politica, error: errPol } = await admin
      .from('politicas_clasificacion_cartera')
      .insert({
        tenant_id: tenant.id,
        version: 1,
        // Nace en borrador: una política vigente es inmutable y no admite
        // tramos nuevos (CAR §8.5, REC-CAR-011). Se activa al final.
        estado: 'borrador',
        nombre: 'Política envío v1',
        policy_hash: `test-fixture-envio-${tenant.id}`,
      })
      .select('id')
      .single<{ id: string }>()
    if (errPol) throw new Error(`fixture politica: ${errPol.message}`)

    // IC-TRAMO-04: toda política exige exactamente un tramo con dias_min=0.
    const { data: tramos, error: errTramo } = await admin
      .from('politica_clasificacion_tramos')
      .insert([
        {
          tenant_id: tenant.id,
          politica_id: politica.id,
          codigo: 'AL_DIA',
          nombre: 'Al día',
          dias_min: 0,
          dias_max: 0,
          nivel_riesgo: 'ninguno',
          etapa_cobranza: 'preventiva',
          prioridad: 0,
          orden: 0,
        },
        {
          tenant_id: tenant.id,
          politica_id: politica.id,
          codigo: 'MORA',
          nombre: 'En mora',
          dias_min: 1,
          dias_max: null,
          nivel_riesgo: 'alto',
          etapa_cobranza: 'administrativa',
          prioridad: 1,
          orden: 1,
        },
      ])
      .select('id, codigo')
    if (errTramo) throw new Error(`fixture tramos: ${errTramo.message}`)
    const tramo = tramos.find((t) => t.codigo === 'MORA')!

    // La estrategia es la que aporta plantilla_codigo al worker.
    const { data: estrategia, error: errEst } = await admin
      .from('estrategias_cobranza')
      .insert({
        tenant_id: tenant.id,
        politica_id: politica.id,
        tramo_id: tramo.id,
        codigo: 'EST-SMS',
        nombre: 'Aviso por SMS',
        tipo_accion: 'sms',
        canal: 'sms',
        plantilla_codigo: EVENT_TYPE,
        dias_desde_clasificacion: 0,
        frecuencia_dias: null,
        max_intentos: 3,
        rol_minimo: 'auxiliar',
        requiere_aprobacion: false,
        activa: true,
        orden: 1,
      })
      .select('id')
      .single<{ id: string }>()
    if (errEst) throw new Error(`fixture estrategia: ${errEst.message}`)

    const { error: errActivar } = await admin
      .from('politicas_clasificacion_cartera')
      .update({ estado: 'vigente' })
      .eq('id', politica.id)
    if (errActivar) throw new Error(`activar politica: ${errActivar.message}`)

    const { error: errPlantilla } = await admin.from('plantillas_sms').insert({
      tenant_id: tenant.id,
      event_type: EVENT_TYPE,
      cuerpo: 'AQUILA (prueba): el inmueble {inmueble} registra {diasMora} dias de mora por {saldoPendiente}.',
      activo: true,
    })
    if (errPlantilla) throw new Error(`fixture plantilla: ${errPlantilla.message}`)

    const tipoInmueble = await listaTipoId(admin, 'TIPO_INMUEBLE', 'apartamento')
    const { data: inmueble, error: errInm } = await admin
      .from('inmuebles')
      .insert({ tenant_id: tenant.id, codigo: `CEE-${String(Date.now())}`, tipo_id: tipoInmueble })
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
        numero_documento: `CEE-${sello}`,
        tipo_persona: 'natural',
        primer_nombre: 'Prueba',
        primer_apellido: 'Cartera',
        telefono: SMS_DESTINO_PRUEBA,
        estado_id: estadoActivo,
      })
      .select('id')
      .single<{ id: string }>()
    if (errTer) throw new Error(`fixture tercero: ${errTer.message}`)
    terceroId = tercero.id

    const { data: accion, error: errAccion } = await admin
      .from('acciones_cobranza')
      .insert({
        tenant_id: tenant.id,
        inmueble_id: inmuebleId,
        estrategia_id: estrategia.id,
        tipo_accion: 'sms',
        canal: 'sms',
        fecha_programada: '2026-08-28',
        clasificacion_codigo: 'MORA',
        politica_clasificacion_id: politica.id,
        politica_version: 1,
        dias_mora_al_momento: 45,
        deuda_total_al_momento: 250_000,
        destinatario_tercero_id: terceroId,
        destinatario_rol_codigo: 'copropietario',
        estado: 'programada',
        creada_por: 'job',
      })
      .select('id')
      .single<{ id: string }>()
    if (errAccion) throw new Error(`fixture accion: ${errAccion.message}`)
    accionId = accion.id
  }, 60_000)

  it('despacha el SMS real y deja la evidencia del envío (§34.3)', async () => {
    const { data, response } = await cliente.functions.invoke<RespuestaWorker>('ejecutar-accion-cobranza', {
      body: { tenant_id: tenant.id, accion_id: accionId },
    })
    expect(response?.status).toBe(200)
    expect(data?.errorMessage ?? null).toBeNull()
    expect(data?.success).toBe(true)
    expect(data?.evidenciaRegistrada).toBe(true)
    expect(data?.envioId).toBeTruthy()
    envioId = data!.envioId!

    const { data: envio, error } = await admin
      .from('acciones_cobranza_envios')
      .select('*')
      .eq('id', envioId)
      .single<{
        intento_numero: number
        canal: string
        destinatario_contacto: string
        plantilla_codigo: string
        plantilla_version: number
        contenido_renderizado: string
        contenido_hash: string
        proveedor: string
        referencia_externa: string | null
      }>()
    expect(error).toBeNull()
    expect(envio!.intento_numero).toBe(1)
    expect(envio!.canal).toBe('sms')
    expect(envio!.destinatario_contacto).toBe(SMS_DESTINO_PRUEBA)
    expect(envio!.plantilla_codigo).toBe(EVENT_TYPE)
    // PRQ-CAR-021 (20260907130000) ya versiona plantillas_sms — la plantilla propia
    // del tenant, insertada arriba sin version explícita, nace en 1 (default de columna).
    expect(envio!.plantilla_version).toBe(1)
    // El texto real que recibió el deudor, con las variables resueltas.
    expect(envio!.contenido_renderizado).toContain('45 dias de mora')
    expect(envio!.contenido_hash).toMatch(/^[0-9a-f]{64}$/)
    expect(envio!.proveedor).toBe('brevo')
    expect(envio!.referencia_externa).toBeTruthy()
    messageId = envio!.referencia_externa!

    // El acuse inicial es 'encolado': Brevo aceptó, que no es entregar.
    const { data: acuses } = await admin
      .from('acciones_cobranza_acuses')
      .select('estado, origen')
      .eq('envio_id', envioId)
    expect(acuses).toHaveLength(1)
    expect(acuses![0]!.estado).toBe('encolado')

    // Y por tanto la acción todavía NO está acreditada.
    const antes = await acreditacion()
    expect(antes.envios_total).toBe(1)
    expect(antes.acreditada).toBe(false)
  }, 120_000)

  it('el webhook convierte el acuse de entrega en acreditación (§34.4)', async () => {
    tsEntrega = Math.floor(Date.now() / 1000) + 60
    const respuesta = await enviarEventoBrevo({
      event: 'delivered',
      message_id: messageId,
      ts: tsEntrega,
      tag: accionId,
    })
    expect(respuesta.status).toBe(200)
    const cuerpo = (await respuesta.json()) as { registrados: number }
    expect(cuerpo.registrados).toBe(1)

    const despues = await acreditacion()
    expect(despues.acreditada).toBe(true)
    expect(despues.ultimo_estado).toBe('entregado')
    expect(despues.envios_acreditados).toBe(1)

    // I-C23: con una notificación probada, el inmueble ya puede escalar.
    const { data: acreditadas, error } = await admin.rpc('fn_contar_acciones_acreditadas', {
      p_tenant_id: tenant.id,
      p_inmueble_id: inmuebleId,
    })
    expect(error).toBeNull()
    expect(acreditadas).toBe(1)
  }, 60_000)

  it('PH-C45: el reenvío del mismo evento no duplica la prueba', async () => {
    const evento = { event: 'delivered', message_id: messageId, ts: tsEntrega }
    const respuesta = await enviarEventoBrevo(evento)
    expect(respuesta.status).toBe(200)
    const cuerpo = (await respuesta.json()) as { registrados: number; duplicados: number }
    expect(cuerpo.registrados).toBe(0)
    expect(cuerpo.duplicados).toBe(1)

    // Se cuenta el acuse con ESE instante exacto, no todos los 'entregado'
    // del envío: el webhook está configurado de verdad y Brevo puede
    // registrar acuses legítimos de este mismo SMS mientras corre el test.
    // La deduplicación es por (envio, estado, ocurrido_at) — eso es lo que
    // hay que comprobar.
    const { count } = await admin
      .from('acciones_cobranza_acuses')
      .select('id', { count: 'exact', head: true })
      .eq('envio_id', envioId)
      .eq('estado', 'entregado')
      .eq('ocurrido_at', new Date(tsEntrega * 1000).toISOString())
    expect(count).toBe(1)
  }, 60_000)

  it('acepta la forma REAL del webhook de SMS, que no trae campo `event`', async () => {
    // Hallazgo del 2026-08-29 contra Brevo en producción: el webhook de SMS
    // manda `status`/`msg_status`; `event` es solo del canal email. Exigir
    // `event` descartaba en silencio TODOS los acuses de SMS, con el mismo
    // síntoma que un webhook mal configurado.
    const envioSms = await crearEnvioSuelto(2, 'brevo-msg-forma-sms', '2026-08-28T10:00:00Z')

    const respuesta = await enviarEventoBrevo({
      id: 1,
      status: 'delivered',
      msg_status: 'delivered',
      messageId: 'brevo-msg-forma-sms',
      to: '573000000000',
      ts_event: Math.floor(Date.now() / 1000) + 120,
      type: 'transactional',
    })
    expect(respuesta.status).toBe(200)
    const cuerpo = (await respuesta.json()) as { registrados: number }
    expect(cuerpo.registrados).toBe(1)

    const { data: acuses } = await admin
      .from('acciones_cobranza_acuses')
      .select('estado')
      .eq('envio_id', envioSms)
    expect((acuses ?? []).map((a) => a.estado)).toContain('entregado')
  }, 60_000)

  it('un acuse fechado antes del envío se guarda con la hora de recepción', async () => {
    // Brevo manda `date` sin zona horaria en varios eventos de SMS, y leerlo
    // como UTC producía acuses cinco horas ANTERIORES al envío. No es
    // cosmético: gana el acuse más reciente, así que un 'entregado' con
    // fecha del pasado pierde contra el 'encolado' y nunca acredita.
    const envioFecha = await crearEnvioSuelto(3, 'brevo-msg-fecha-rara', '2026-02-15T09:00:00Z')

    const respuesta = await enviarEventoBrevo({
      id: 2,
      status: 'delivered',
      msg_status: 'delivered',
      messageId: 'brevo-msg-fecha-rara',
      date: '2020-01-01 00:00:00',
      type: 'transactional',
    })
    expect(respuesta.status).toBe(200)

    const { data: acuse } = await admin
      .from('acciones_cobranza_acuses')
      .select('estado, ocurrido_at')
      .eq('envio_id', envioFecha)
      .single<{ estado: string; ocurrido_at: string }>()
    expect(acuse!.estado).toBe('entregado')
    expect(Date.parse(acuse!.ocurrido_at)).toBeGreaterThan(Date.parse('2026-02-15T09:00:00Z'))

    expect((await acreditacion()).acreditada).toBe(true)
  }, 60_000)

  it('un evento de un mensaje ajeno se ignora sin ensuciar la evidencia', async () => {
    const respuesta = await enviarEventoBrevo({
      event: 'delivered',
      message_id: 'mensaje-que-no-es-de-cobranza',
      ts: Math.floor(Date.now() / 1000),
    })
    expect(respuesta.status).toBe(200)
    const cuerpo = (await respuesta.json()) as { registrados: number; ignorados: number }
    expect(cuerpo.registrados).toBe(0)
    expect(cuerpo.ignorados).toBe(1)
  }, 60_000)

  it('un evento no mapeado no se fuerza a ningún estado', async () => {
    const respuesta = await enviarEventoBrevo({
      event: 'evento_inventado_por_brevo',
      message_id: messageId,
      ts: Math.floor(Date.now() / 1000),
    })
    expect(respuesta.status).toBe(200)
    const cuerpo = (await respuesta.json()) as { registrados: number; ignorados: number }
    expect(cuerpo.registrados).toBe(0)
    expect(cuerpo.ignorados).toBe(1)
  }, 60_000)

  it('el token es el único control de acceso: sin él no se escribe nada', async () => {
    const respuesta = await fetch(`${env!.url}/functions/v1/webhook-brevo/token-inventado`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ event: 'delivered', message_id: messageId, ts: Math.floor(Date.now() / 1000) }),
    })
    expect(respuesta.status).toBe(404)
  }, 60_000)

  it('el expediente muestra el envío con su texto íntegro y su acuse', async () => {
    const { data, error } = await admin.rpc('fn_compilar_expediente', {
      p_tenant_id: tenant.id,
      p_inmueble_id: inmuebleId,
      // fn_compilar_expediente() filtra envíos/acuses por
      // "ocurrido_at/enviado_at < fecha_corte + 1" — un corte fijo en el pasado
      // deja fuera el envío real que este test acaba de despachar "ahora"
      // (mismo bug de fecha lejana ya documentado en FIN-1: usar la fecha real).
      p_fecha_corte: new Date().toISOString().slice(0, 10),
    })
    expect(error).toBeNull()
    const expediente = data as unknown as { cronologia_gestion: Array<Record<string, unknown>> }
    const accion = expediente.cronologia_gestion.find((a) => a.accion_id === accionId)
    expect(accion).toBeDefined()
    expect(accion!.acreditada).toBe(true)

    // El expediente trae TODOS los intentos de la acción, incluidos los
    // envíos sueltos que los tests del webhook cuelgan de ella. Lo que se
    // comprueba es que el despacho real está, con su texto y su acuse.
    const envios = accion!.envios as Array<Record<string, unknown>>
    const despachado = envios.find((e) => e.envio_id === envioId)
    expect(despachado).toBeDefined()
    expect(String(despachado!.contenido_renderizado)).toContain('45 dias de mora')
    expect(String(despachado!.destinatario_contacto)).toBe(SMS_DESTINO_PRUEBA)

    const acuses = despachado!.acuses as Array<Record<string, unknown>>
    expect(acuses.map((a) => a.estado)).toContain('entregado')
  }, 60_000)
})
