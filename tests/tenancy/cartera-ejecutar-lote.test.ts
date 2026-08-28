/**
 * CAR §18.4 — worker por lotes de acciones de cobranza.
 *
 * Casi todo se prueba en modo SIMULACIÓN, que recorre las mismas
 * validaciones y renderiza los mismos mensajes sin enviar nada. Solo un
 * test ejecuta de verdad, y gasta UN SMS real al número autorizado por el
 * propietario del producto el 2026-08-28.
 *
 * Lo que se vigila aquí no es solo que despache: es que NO despache cuando
 * no debe — sin modo explícito, sin rol, o con los intentos agotados.
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
const d = env ? describe : describe.skip

if (!env) {
  console.warn('SALTADO tests/tenancy/cartera-ejecutar-lote: faltan variables de Supabase en .env')
}

/** Autorizado por el propietario del producto el 2026-08-28. */
const SMS_DESTINO_PRUEBA = '+573107418731'
const EVENT_TYPE = 'cartera_pago_vencido'
const FECHA_CORTE = '2026-08-28'

interface LineaResultado {
  accionId: string
  resultado: 'despachada' | 'fallida' | 'simulada' | 'omitida'
  motivo?: string
  contenido?: string
  destinatarioContacto?: string
}

interface RespuestaLote {
  modo: string
  candidatas: number
  despachadas: number
  fallidas: number
  simuladas: number
  omitidas: number
  hayMas: boolean
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

d('CAR §18.4 — worker por lotes de cobranza', () => {
  const admin = clienteAdmin(env!)
  let administrador: UsuarioPrueba
  let auxiliar: UsuarioPrueba
  let tenant: TenantPrueba
  let cliente: Cliente
  let clienteAuxiliar: Cliente
  let estrategiaId: string
  let terceroId: string
  const inmuebles: string[] = []
  const acciones: string[] = []

  afterAll(async () => {
    await eliminarTenant(admin, tenant.id)
    await eliminarUsuario(admin, administrador.id)
    await eliminarUsuario(admin, auxiliar.id)
  })

  async function crearAccion(inmuebleId: string, fechaProgramada: string): Promise<string> {
    const { data, error } = await admin
      .from('acciones_cobranza')
      .insert({
        tenant_id: tenant.id,
        inmueble_id: inmuebleId,
        estrategia_id: estrategiaId,
        tipo_accion: 'sms',
        canal: 'sms',
        fecha_programada: fechaProgramada,
        clasificacion_codigo: 'MORA',
        politica_clasificacion_id: politicaId,
        politica_version: 1,
        dias_mora_al_momento: 30,
        deuda_total_al_momento: 120_000,
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

  let politicaId: string

  it('setup: tres inmuebles con acción de cobranza programada', async () => {
    administrador = await crearUsuario(admin, 'cel-admin')
    auxiliar = await crearUsuario(admin, 'cel-aux')
    tenant = await crearTenant(admin, 'cel', administrador.id)
    await crearMembership(admin, tenant.id, administrador.id, 'administrador')
    await crearMembership(admin, tenant.id, auxiliar.id, 'auxiliar')
    cliente = await clienteComo(env!, administrador)
    clienteAuxiliar = await clienteComo(env!, auxiliar)

    const { data: politica, error: errPol } = await admin
      .from('politicas_clasificacion_cartera')
      .insert({
        tenant_id: tenant.id,
        version: 1,
        estado: 'borrador',
        nombre: 'Política lote v1',
        policy_hash: `test-fixture-lote-${tenant.id}`,
      })
      .select('id')
      .single<{ id: string }>()
    if (errPol) throw new Error(`fixture politica: ${errPol.message}`)
    politicaId = politica.id

    const { data: tramos, error: errTramos } = await admin
      .from('politica_clasificacion_tramos')
      .insert([
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

    const { data: estrategia, error: errEst } = await admin
      .from('estrategias_cobranza')
      .insert({
        tenant_id: tenant.id,
        politica_id: politicaId,
        tramo_id: tramos.find((t) => t.codigo === 'MORA')!.id,
        codigo: 'EST-SMS',
        nombre: 'Aviso por SMS',
        tipo_accion: 'sms',
        canal: 'sms',
        plantilla_codigo: EVENT_TYPE,
        dias_desde_clasificacion: 0,
        frecuencia_dias: null,
        // Dos intentos: alcanza para probar el tope sin gastar envíos.
        max_intentos: 2,
        rol_minimo: 'auxiliar',
        requiere_aprobacion: false,
        activa: true,
        orden: 1,
      })
      .select('id')
      .single<{ id: string }>()
    if (errEst) throw new Error(`fixture estrategia: ${errEst.message}`)
    estrategiaId = estrategia.id

    const { error: errActivar } = await admin
      .from('politicas_clasificacion_cartera')
      .update({ estado: 'vigente' })
      .eq('id', politicaId)
    if (errActivar) throw new Error(`activar politica: ${errActivar.message}`)

    const { error: errPlantilla } = await admin.from('plantillas_sms').insert({
      tenant_id: tenant.id,
      event_type: EVENT_TYPE,
      cuerpo: 'AQUILA (lote): {inmueble} debe {saldoPendiente} con {diasMora} dias de mora.',
      activo: true,
    })
    if (errPlantilla) throw new Error(`fixture plantilla: ${errPlantilla.message}`)

    const tipoInmueble = await listaTipoId(admin, 'TIPO_INMUEBLE', 'apartamento')
    const sello = String(Date.now())
    const { data: filas, error: errInm } = await admin
      .from('inmuebles')
      .insert([
        { tenant_id: tenant.id, codigo: `CEL-A-${sello}`, tipo_id: tipoInmueble },
        { tenant_id: tenant.id, codigo: `CEL-B-${sello}`, tipo_id: tipoInmueble },
        { tenant_id: tenant.id, codigo: `CEL-C-${sello}`, tipo_id: tipoInmueble },
      ])
      .select('id')
    if (errInm) throw new Error(`fixture inmuebles: ${errInm.message}`)
    inmuebles.push(...filas.map((f) => f.id))

    const tipoIdent = await listaTipoId(admin, 'TIPO_IDENTIFICACION', 'cedula')
    const estadoActivo = await listaTipoId(admin, 'ESTADO_TERCERO', 'activo')
    const { data: tercero, error: errTer } = await admin
      .from('terceros')
      .insert({
        tenant_id: tenant.id,
        tipo_identificacion_id: tipoIdent,
        numero_documento: `CEL-${sello}`,
        tipo_persona: 'natural',
        primer_nombre: 'Lote',
        primer_apellido: 'Prueba',
        telefono: SMS_DESTINO_PRUEBA,
        estado_id: estadoActivo,
      })
      .select('id')
      .single<{ id: string }>()
    if (errTer) throw new Error(`fixture tercero: ${errTer.message}`)
    terceroId = tercero.id

    // Dos vencidas y una programada para el futuro: el corte debe dejar
    // fuera la tercera.
    acciones.push(await crearAccion(inmuebles[0]!, '2026-08-20'))
    acciones.push(await crearAccion(inmuebles[1]!, '2026-08-25'))
    acciones.push(await crearAccion(inmuebles[2]!, '2026-09-15'))
  }, 90_000)

  it('simula por defecto: sin modo explícito no sale ningún mensaje', async () => {
    const { data, response } = await cliente.functions.invoke<RespuestaLote>('cartera-ejecutar-lote', {
      body: { tenant_id: tenant.id, fecha_corte: FECHA_CORTE },
    })
    expect(response?.status).toBe(200)
    expect(data?.modo).toBe('simulacion')

    // La acción del 15 de septiembre queda fuera del corte.
    expect(data?.candidatas).toBe(2)
    expect(data?.simuladas).toBe(2)
    expect(data?.despachadas).toBe(0)

    // Muestra el mensaje exacto que enviaría, con las variables resueltas.
    const linea = data!.lineas[0]!
    expect(linea.resultado).toBe('simulada')
    expect(linea.contenido).toContain('dias de mora')
    expect(linea.destinatarioContacto).toBe(SMS_DESTINO_PRUEBA)

    // Y no tocó nada: ni evidencia ni estado.
    const { count } = await admin
      .from('acciones_cobranza_envios')
      .select('id', { count: 'exact', head: true })
      .eq('tenant_id', tenant.id)
    expect(count).toBe(0)

    const { data: sinTocar } = await admin
      .from('acciones_cobranza')
      .select('estado')
      .eq('tenant_id', tenant.id)
    expect((sinTocar ?? []).every((a) => a.estado === 'programada')).toBe(true)
  }, 60_000)

  it('respeta el orden: la deuda más antigua sale primero cuando el límite corta', async () => {
    const { data } = await cliente.functions.invoke<RespuestaLote>('cartera-ejecutar-lote', {
      body: { tenant_id: tenant.id, fecha_corte: FECHA_CORTE, limite: 1 },
    })
    expect(data?.candidatas).toBe(1)
    expect(data?.lineas[0]!.accionId).toBe(acciones[0])
    // El lote vino lleno: hay más esperando.
    expect(data?.hayMas).toBe(true)
  }, 60_000)

  it('un auxiliar puede simular pero no ejecutar (403)', async () => {
    const simulacion = await clienteAuxiliar.functions.invoke<RespuestaLote>('cartera-ejecutar-lote', {
      body: { tenant_id: tenant.id, fecha_corte: FECHA_CORTE },
    })
    expect(simulacion.response?.status).toBe(200)

    const ejecucion = await clienteAuxiliar.functions.invoke<RespuestaLote>('cartera-ejecutar-lote', {
      body: { tenant_id: tenant.id, fecha_corte: FECHA_CORTE, modo: 'ejecucion' },
    })
    expect(ejecucion.response?.status).toBe(403)

    // El 403 no dejó rastro de envío.
    const { count } = await admin
      .from('acciones_cobranza_envios')
      .select('id', { count: 'exact', head: true })
      .eq('tenant_id', tenant.id)
    expect(count).toBe(0)
  }, 60_000)

  it('§18.4 paso 7: con los intentos agotados la acción se omite, no se reenvía', async () => {
    // Dos envíos previos fabricados = max_intentos alcanzado, sin gastar
    // SMS de verdad.
    for (const intento of [1, 2]) {
      const { error } = await admin.from('acciones_cobranza_envios').insert({
        tenant_id: tenant.id,
        accion_id: acciones[1]!,
        intento_numero: intento,
        canal: 'sms',
        destinatario_tercero_id: terceroId,
        destinatario_contacto: SMS_DESTINO_PRUEBA,
        plantilla_codigo: EVENT_TYPE,
        plantilla_version: 0,
        contenido_renderizado: `intento ${String(intento)} previo`,
        contenido_hash: `hash-previo-${String(intento)}`,
        proveedor: 'brevo',
      })
      if (error) throw new Error(`fixture envío previo: ${error.message}`)
    }

    const { data } = await cliente.functions.invoke<RespuestaLote>('cartera-ejecutar-lote', {
      body: { tenant_id: tenant.id, fecha_corte: FECHA_CORTE },
    })
    const omitida = data!.lineas.find((l) => l.accionId === acciones[1])
    expect(omitida?.resultado).toBe('omitida')
    expect(omitida?.motivo).toContain('ACCION_COBRANZA_INTENTOS_AGOTADOS')

    // La otra sigue siendo candidata: agotar una no bloquea el lote.
    const viva = data!.lineas.find((l) => l.accionId === acciones[0])
    expect(viva?.resultado).toBe('simulada')
  }, 60_000)

  it('ejecuta de verdad: despacha, deja evidencia y emite el evento (§18.4 pasos 4-6)', async () => {
    // Solo la primera acción: alcance acotado para gastar UN SMS.
    const { data, response } = await cliente.functions.invoke<RespuestaLote>('cartera-ejecutar-lote', {
      body: {
        tenant_id: tenant.id,
        fecha_corte: FECHA_CORTE,
        modo: 'ejecucion',
        alcance_inmuebles: [inmuebles[0]],
      },
    })
    expect(response?.status).toBe(200)
    expect(data?.modo).toBe('ejecucion')
    expect(data?.candidatas).toBe(1)
    expect(data?.despachadas).toBe(1)
    expect(data?.fallidas).toBe(0)

    const { data: envio, error } = await admin
      .from('acciones_cobranza_envios')
      .select('intento_numero, contenido_renderizado, referencia_externa')
      .eq('accion_id', acciones[0]!)
      .single<{ intento_numero: number; contenido_renderizado: string; referencia_externa: string | null }>()
    expect(error).toBeNull()
    expect(envio!.intento_numero).toBe(1)
    expect(envio!.contenido_renderizado).toContain('dias de mora')
    expect(envio!.referencia_externa).toBeTruthy()

    // §18.4 paso 6 — el evento de dominio, que antes no se emitía.
    const { data: eventos } = await admin
      .from('eventos_cartera')
      .select('tipo, motivo, entidad_id')
      .eq('tenant_id', tenant.id)
      .eq('entidad_id', acciones[0]!)
    expect(eventos).toHaveLength(1)
    expect(eventos![0]!.tipo).toBe('COBRANZA_ACCION_EJECUTADA')
    // I-C13: el motivo debe explicar, no repetir el nombre del evento.
    expect(eventos![0]!.motivo).toContain('Despachada no es recibida')

    // La acción quedó ejecutada = DESPACHADA, todavía sin acreditar.
    const { data: acreditacion } = await admin.rpc('fn_acreditacion_accion', {
      p_tenant_id: tenant.id,
      p_accion_id: acciones[0]!,
    })
    const fila = (acreditacion as unknown as { acreditada: boolean; ultimo_estado: string }[])[0]!
    expect(fila.acreditada).toBe(false)
    expect(fila.ultimo_estado).toBe('encolado')
  }, 120_000)

  it('la segunda corrida no vuelve a despachar lo ya ejecutado', async () => {
    const { data } = await cliente.functions.invoke<RespuestaLote>('cartera-ejecutar-lote', {
      body: { tenant_id: tenant.id, fecha_corte: FECHA_CORTE },
    })
    // La primera ya está 'ejecutada' y sale del conjunto de candidatas; la
    // segunda tiene los intentos agotados.
    expect(data!.lineas.find((l) => l.accionId === acciones[0])).toBeUndefined()
    expect(data?.despachadas).toBe(0)
  }, 60_000)
})
