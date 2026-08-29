/**
 * CAR §18.4 / GAP-CAR-005 — canal EMAIL de cobranza.
 *
 * Todo en modo SIMULACIÓN. La simulación recorre exactamente las mismas
 * validaciones que el envío y renderiza el mismo mensaje; lo único que se
 * salta es la llamada al proveedor. No se manda ni un correo real: a
 * diferencia del SMS de prueba, aquí no hay una dirección autorizada por
 * el propietario del producto.
 *
 * Lo que se vigila:
 *
 *   · que un destinatario SIN correo se omita diciendo QUIÉN es, no un uuid
 *   · que el canal funcione sin que nadie haya redactado una plantilla
 *     (correo del sistema) — si exigiera HTML a mano, el canal nacería
 *     apagado
 *   · que una plantilla propia gane sobre la del sistema
 *   · que el asunto por defecto NO revele la mora (Ley 1266: el estado de
 *     cartera es dato personal y el asunto se ve en la pantalla bloqueada)
 *   · que el lote NO arrastre los canales de gestión humana
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
const d = env ? describe : describe.skip

if (!env) {
  console.warn('SALTADO tests/tenancy/cartera-canal-email: faltan variables de Supabase en .env')
}

const EVENT_TYPE = 'cartera_pago_vencido'
const FECHA_CORTE = '2026-08-28'
/** Dominio de ejemplo reservado por RFC 2606 — nunca resuelve a un buzón real. */
const EMAIL_PRUEBA = 'residente.prueba@example.com'

interface LineaResultado {
  accionId: string
  canal: string
  resultado: 'despachada' | 'fallida' | 'simulada' | 'omitida'
  motivo?: string
  contenido?: string
  asunto?: string
  destinatarioContacto?: string
}

interface RespuestaLote {
  modo: string
  candidatas: number
  simuladas: number
  omitidas: number
  lineas: LineaResultado[]
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

d('CAR §18.4 — canal email de cobranza', () => {
  const admin = clienteAdmin(env!)
  let administrador: UsuarioPrueba
  let tenant: TenantPrueba
  let cliente: Cliente
  let politicaId: string
  let estrategiaEmail: string
  let estrategiaTelefono: string
  let conCorreo: string
  let sinCorreo: string
  const inmuebles: string[] = []

  afterAll(async () => {
    await eliminarTenant(admin, tenant.id)
    await eliminarUsuario(admin, administrador.id)
  })

  async function crearAccion(
    inmuebleId: string,
    terceroId: string,
    estrategiaId: string,
    canal: 'email' | 'telefono',
  ): Promise<string> {
    const { data, error } = await admin
      .from('acciones_cobranza')
      .insert({
        tenant_id: tenant.id,
        inmueble_id: inmuebleId,
        estrategia_id: estrategiaId,
        tipo_accion: canal === 'email' ? 'email' : 'llamada',
        canal,
        fecha_programada: FECHA_CORTE,
        clasificacion_codigo: 'MORA',
        politica_clasificacion_id: politicaId,
        politica_version: 1,
        dias_mora_al_momento: 42,
        deuda_total_al_momento: 385_000,
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

  async function simular(): Promise<RespuestaLote> {
    const { data, response } = await cliente.functions.invoke<RespuestaLote>('cartera-ejecutar-lote', {
      body: { tenant_id: tenant.id, fecha_corte: FECHA_CORTE, modo: 'simulacion' },
    })
    expect(response?.status).toBe(200)
    return data!
  }

  it('setup: una copropiedad con dos destinatarios, uno sin correo', async () => {
    administrador = await crearUsuario(admin, 'cce-admin')
    tenant = await crearTenant(admin, 'cce', administrador.id)
    await crearMembership(admin, tenant.id, administrador.id, 'administrador')
    cliente = await clienteComo(env!, administrador)

    const { data: politica, error: errPol } = await admin
      .from('politicas_clasificacion_cartera')
      .insert({
        tenant_id: tenant.id,
        version: 1,
        estado: 'borrador',
        nombre: 'Política email v1',
        policy_hash: `test-fixture-email-${tenant.id}`,
      })
      .select('id')
      .single<{ id: string }>()
    if (errPol) throw new Error(`fixture politica: ${errPol.message}`)
    politicaId = politica.id

    const { data: tramos, error: errTramos } = await admin
      .from('politica_clasificacion_tramos')
      .insert([
        // IC-TRAMO-04: toda política vigente necesita exactamente un tramo
        // con dias_min = 0. No es decorativo aquí — sin él no se activa.
        {
          tenant_id: tenant.id,
          politica_id: politicaId,
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
          politica_id: politicaId,
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
    if (errTramos) throw new Error(`fixture tramos: ${errTramos.message}`)
    const tramoMora = tramos.find((t) => t.codigo === 'MORA')!.id

    const { data: estrategias, error: errEst } = await admin
      .from('estrategias_cobranza')
      .insert([
        {
          tenant_id: tenant.id,
          politica_id: politicaId,
          tramo_id: tramoMora,
          codigo: 'EST-EMAIL',
          nombre: 'Recordatorio por correo',
          tipo_accion: 'email',
          canal: 'email',
          plantilla_codigo: EVENT_TYPE,
          dias_desde_clasificacion: 0,
          frecuencia_dias: null,
          max_intentos: 2,
          rol_minimo: 'auxiliar',
          requiere_aprobacion: false,
          activa: true,
          orden: 1,
        },
        {
          tenant_id: tenant.id,
          politica_id: politicaId,
          tramo_id: tramoMora,
          codigo: 'EST-TEL',
          nombre: 'Gestión telefónica',
          tipo_accion: 'llamada',
          canal: 'telefono',
          plantilla_codigo: null,
          dias_desde_clasificacion: 0,
          frecuencia_dias: null,
          max_intentos: 1,
          rol_minimo: 'auxiliar',
          requiere_aprobacion: false,
          activa: true,
          orden: 2,
        },
      ])
      .select('id, codigo')
    if (errEst) throw new Error(`fixture estrategias: ${errEst.message}`)
    estrategiaEmail = estrategias.find((e) => e.codigo === 'EST-EMAIL')!.id
    estrategiaTelefono = estrategias.find((e) => e.codigo === 'EST-TEL')!.id

    const { error: errActivar } = await admin
      .from('politicas_clasificacion_cartera')
      .update({ estado: 'vigente' })
      .eq('id', politicaId)
    if (errActivar) throw new Error(`activar politica: ${errActivar.message}`)

    const tipoInmueble = await listaTipoId(admin, 'TIPO_INMUEBLE', 'apartamento')
    const sello = String(Date.now())
    const { data: filas, error: errInm } = await admin
      .from('inmuebles')
      .insert([
        { tenant_id: tenant.id, codigo: `CCE-A-${sello}`, tipo_id: tipoInmueble },
        { tenant_id: tenant.id, codigo: `CCE-B-${sello}`, tipo_id: tipoInmueble },
        { tenant_id: tenant.id, codigo: `CCE-C-${sello}`, tipo_id: tipoInmueble },
      ])
      .select('id')
    if (errInm) throw new Error(`fixture inmuebles: ${errInm.message}`)
    inmuebles.push(...filas.map((f) => f.id))

    const tipoIdent = await listaTipoId(admin, 'TIPO_IDENTIFICACION', 'cedula')
    const estadoActivo = await listaTipoId(admin, 'ESTADO_TERCERO', 'activo')
    const { data: terceros, error: errTer } = await admin
      .from('terceros')
      .insert([
        {
          tenant_id: tenant.id,
          tipo_identificacion_id: tipoIdent,
          numero_documento: `CCE-CON-${sello}`,
          tipo_persona: 'natural',
          primer_nombre: 'Marta',
          primer_apellido: 'Correa',
          email: EMAIL_PRUEBA,
          estado_id: estadoActivo,
        },
        {
          tenant_id: tenant.id,
          tipo_identificacion_id: tipoIdent,
          numero_documento: `CCE-SIN-${sello}`,
          tipo_persona: 'natural',
          primer_nombre: 'Pedro',
          primer_apellido: 'Sinbuzon',
          email: null,
          estado_id: estadoActivo,
        },
      ])
      .select('id, numero_documento')
    if (errTer) throw new Error(`fixture terceros: ${errTer.message}`)
    conCorreo = terceros.find((t) => t.numero_documento.includes('CON'))!.id
    sinCorreo = terceros.find((t) => t.numero_documento.includes('SIN'))!.id

    await crearAccion(inmuebles[0]!, conCorreo, estrategiaEmail, 'email')
    await crearAccion(inmuebles[1]!, sinCorreo, estrategiaEmail, 'email')
    await crearAccion(inmuebles[2]!, conCorreo, estrategiaTelefono, 'telefono')

    expect(inmuebles).toHaveLength(3)
  })

  it('sin plantilla propia, el correo del sistema sale igual', async () => {
    const salida = await simular()
    const linea = salida.lineas.find((l) => l.canal === 'email' && l.resultado === 'simulada')

    expect(linea).toBeDefined()
    expect(linea!.destinatarioContacto).toBe(EMAIL_PRUEBA)
    // El cuerpo es HTML — lo enviado es lo que se guarda como prueba.
    expect(linea!.contenido).toContain('<html')
    // Y lleva los datos de la obligación resueltos, no los marcadores.
    expect(linea!.contenido).toContain('Marta Correa')
    expect(linea!.contenido).toContain('42')
    expect(linea!.contenido).toContain('385.000')
    expect(linea!.contenido).not.toContain('{{ params.')
  })

  it('el asunto por defecto no revela la mora, y sí identifica la unidad', async () => {
    const salida = await simular()
    const linea = salida.lineas.find((l) => l.canal === 'email' && l.resultado === 'simulada')

    expect(linea!.asunto).toBeDefined()
    // Ley 1266: el asunto se ve sin abrir el correo, a veces delante de
    // otras personas. Nombrar la deuda ahí es divulgarla.
    expect(linea!.asunto!.toLowerCase()).not.toContain('mora')
    expect(linea!.asunto!.toLowerCase()).not.toContain('deuda')
    expect(linea!.asunto!.toLowerCase()).not.toContain('cobro')
    // Pero tiene que poder distinguirse de otro correo: lleva la unidad.
    expect(linea!.asunto).toContain('CCE-A-')
  })

  it('el nombre de la copropiedad se resuelve en el cuerpo', async () => {
    const { data: fila } = await admin
      .from('tenants')
      .select('name')
      .eq('id', tenant.id)
      .single<{ name: string }>()

    const salida = await simular()
    const linea = salida.lineas.find((l) => l.canal === 'email' && l.resultado === 'simulada')
    expect(linea!.contenido).toContain(fila!.name)
  })

  it('quien no tiene correo se omite CON NOMBRE, no con un uuid', async () => {
    const salida = await simular()
    const omitida = salida.lineas.find((l) => l.canal === 'email' && l.resultado === 'omitida')

    expect(omitida).toBeDefined()
    expect(omitida!.motivo).toContain('ACCION_COBRANZA_DESTINATARIO_SIN_EMAIL')
    expect(omitida!.motivo).toContain('Pedro Sinbuzon')
    // El uuid no le sirve a quien tiene que ir a arreglar el dato.
    expect(omitida!.motivo).not.toContain(sinCorreo)
  })

  it('el lote no arrastra los canales de gestión humana', async () => {
    const salida = await simular()
    // La acción de canal 'telefono' existe y está programada, pero no
    // aparece en la corrida: llenaría cada lote de omitidas que nadie
    // puede resolver.
    expect(salida.lineas.some((l) => l.canal === 'telefono')).toBe(false)
    expect(salida.candidatas).toBe(2)
  })

  it('una plantilla propia gana sobre la del sistema', async () => {
    const { error } = await admin.from('email_templates').insert({
      tenant_id: tenant.id,
      event_type: EVENT_TYPE,
      subject: 'Comunicación de {{ params.copropiedad }} — {{ params.inmueble }}',
      html_content:
        '<html><body><p>Hola {{ params.nombreResidente }}, su saldo es {{ params.saldoPendiente }}.</p></body></html>',
    })
    if (error) throw new Error(`fixture email_templates: ${error.message}`)

    const salida = await simular()
    const linea = salida.lineas.find((l) => l.canal === 'email' && l.resultado === 'simulada')

    expect(linea!.asunto).toContain('Comunicación de')
    expect(linea!.contenido).toContain('Hola Marta Correa, su saldo es')
    expect(linea!.contenido).not.toContain('Cordial saludo')
    expect(linea!.contenido).not.toContain('{{ params.')
  })

  it('una plantilla propia vacía no apaga el canal: vuelve la del sistema', async () => {
    const { error } = await admin
      .from('email_templates')
      .update({ html_content: '   ' })
      .eq('tenant_id', tenant.id)
      .eq('event_type', EVENT_TYPE)
    if (error) throw new Error(`vaciar plantilla: ${error.message}`)

    const salida = await simular()
    const linea = salida.lineas.find((l) => l.canal === 'email' && l.resultado === 'simulada')

    expect(linea!.contenido).toContain('Cordial saludo')
  })

  /**
   * El Message-ID de correo viaja entre ángulos (RFC 5322) y Brevo lo
   * reenvía así en el webhook. Si una punta los conserva y la otra no, la
   * búsqueda no encuentra el envío: el acuse se descarta en silencio y la
   * notificación nunca queda acreditada — el mismo síntoma que un webhook
   * mal configurado. Se prueba sin enviar nada: el envío se inserta a mano
   * con el id ya normalizado, y el webhook llega con los ángulos puestos.
   */
  it('un acuse de correo con el Message-ID entre ángulos resuelve al envío', async () => {
    if (!tokenWebhook) {
      console.warn('SALTADO: falta BREVO_WEBHOOK_TOKEN en .env')
      return
    }

    const { data: accion } = await admin
      .from('acciones_cobranza')
      .select('id')
      .eq('tenant_id', tenant.id)
      .eq('canal', 'email')
      .eq('inmueble_id', inmuebles[0]!)
      .single<{ id: string }>()

    const idSinAngulos = `202608291200.${String(Date.now())}@smtp-relay.brevo.com`
    const { data: envio, error: errEnvio } = await admin
      .from('acciones_cobranza_envios')
      .insert({
        tenant_id: tenant.id,
        accion_id: accion!.id,
        intento_numero: 1,
        canal: 'email',
        destinatario_tercero_id: conCorreo,
        destinatario_contacto: EMAIL_PRUEBA,
        plantilla_codigo: EVENT_TYPE,
        plantilla_version: 0,
        asunto: 'Estado de su cuenta',
        contenido_renderizado: '<html><body><p>Cuerpo de prueba</p></body></html>',
        contenido_hash: 'hash-de-prueba-angulos',
        proveedor: 'brevo',
        referencia_externa: idSinAngulos,
      })
      .select('id')
      .single<{ id: string }>()
    if (errEnvio) throw new Error(`fixture envio: ${errEnvio.message}`)

    const respuesta = await fetch(`${env!.url}/functions/v1/webhook-brevo/${tokenWebhook}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        event: 'delivered',
        'message-id': `<${idSinAngulos}>`,
        ts: Math.floor(Date.now() / 1000),
      }),
    })
    expect(respuesta.status).toBe(200)
    expect(await respuesta.json()).toMatchObject({ registrados: 1 })

    const { data: acuses } = await admin
      .from('acciones_cobranza_acuses')
      .select('estado')
      .eq('envio_id', envio.id)
    expect(acuses).toEqual([{ estado: 'entregado' }])
  })
})
