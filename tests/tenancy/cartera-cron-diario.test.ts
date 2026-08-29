/**
 * CAR §18 — disparador de la corrida diaria (bloque 2, PRQ-CAR-010).
 *
 * Lo que se prueba aquí es sobre todo lo que el cron NO debe hacer: no
 * despachar mensajes, no dejar entrar a quien no trae el token, y no
 * gastar una invocación por cada copropiedad que no tiene cartera
 * configurada. El primer intento de este cron mandó 63 peticiones y
 * recibió 63 respuestas 401; estas comprobaciones existen para que eso no
 * vuelva a pasar en silencio.
 */
import { afterAll, describe, expect, it } from 'vitest'
import {
  clienteAdmin,
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
const tokenCron = process.env.CARTERA_CRON_TOKEN
const d = env && tokenCron ? describe : describe.skip

if (!env || !tokenCron) {
  console.warn('SALTADO tests/tenancy/cartera-cron-diario: faltan variables de Supabase o CARTERA_CRON_TOKEN en .env')
}

interface RespuestaCron {
  fechaCorte: string
  copropiedades: number
  exitosas: number
  fallidas: number
  resultados: { tenantId: string; status: number; ok: boolean; detalle?: string }[]
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

d('CAR §18 — cron diario de cartera', () => {
  const admin = clienteAdmin(env!)
  let administrador: UsuarioPrueba
  let tenantConPolitica: TenantPrueba
  let tenantSinPolitica: TenantPrueba

  afterAll(async () => {
    await eliminarTenant(admin, tenantConPolitica.id)
    await eliminarTenant(admin, tenantSinPolitica.id)
    await eliminarUsuario(admin, administrador.id)
  })

  async function llamarCron(token: string, cuerpo: Record<string, unknown> = {}): Promise<Response> {
    return await fetch(`${env!.url}/functions/v1/cartera-cron-diario/${token}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(cuerpo),
    })
  }

  it('setup: una copropiedad con política vigente y otra sin ella', async () => {
    administrador = await crearUsuario(admin, 'ccd-admin')
    tenantConPolitica = await crearTenant(admin, 'ccd-con', administrador.id)
    tenantSinPolitica = await crearTenant(admin, 'ccd-sin', administrador.id)
    await crearMembership(admin, tenantConPolitica.id, administrador.id, 'administrador')
    await crearMembership(admin, tenantSinPolitica.id, administrador.id, 'administrador')

    const { data: politica, error: errPol } = await admin
      .from('politicas_clasificacion_cartera')
      .insert({
        tenant_id: tenantConPolitica.id,
        version: 1,
        estado: 'borrador',
        nombre: 'Política cron',
        policy_hash: `test-cron-${tenantConPolitica.id}`,
      })
      .select('id')
      .single<{ id: string }>()
    if (errPol) throw new Error(`fixture politica: ${errPol.message}`)

    const { error: errTramos } = await admin.from('politica_clasificacion_tramos').insert([
      {
        tenant_id: tenantConPolitica.id,
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
        tenant_id: tenantConPolitica.id,
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
    if (errTramos) throw new Error(`fixture tramos: ${errTramos.message}`)

    const { error: errActivar } = await admin
      .from('politicas_clasificacion_cartera')
      .update({ estado: 'vigente' })
      .eq('id', politica.id)
    if (errActivar) throw new Error(`activar politica: ${errActivar.message}`)

    // Un inmueble para que la corrida tenga sobre qué trabajar.
    const tipoInmueble = await listaTipoId(admin, 'TIPO_INMUEBLE', 'apartamento')
    const { error: errInm } = await admin
      .from('inmuebles')
      .insert({ tenant_id: tenantConPolitica.id, codigo: `CCD-${String(Date.now())}`, tipo_id: tipoInmueble })
    if (errInm) throw new Error(`fixture inmueble: ${errInm.message}`)
  }, 90_000)

  it('sin token no entra nadie', async () => {
    const respuesta = await llamarCron('token-inventado')
    expect(respuesta.status).toBe(404)
  }, 30_000)

  it('recalcula la copropiedad con política y NO la que no tiene', async () => {
    const respuesta = await llamarCron(tokenCron!)
    expect(respuesta.status).toBe(200)
    const cuerpo = (await respuesta.json()) as RespuestaCron

    const conPolitica = cuerpo.resultados.find((r) => r.tenantId === tenantConPolitica.id)
    expect(conPolitica).toBeDefined()
    // Si esto falla con 401, cartera-recalcular dejó de aceptar el modo
    // 'secret' y el cron está roto aunque el job siga «corriendo».
    expect(conPolitica?.ok).toBe(true)

    // Sin política de clasificación, cartera-recalcular abortaría por
    // PH-C26/I-C14: no se gasta la invocación.
    const sinPolitica = cuerpo.resultados.find((r) => r.tenantId === tenantSinPolitica.id)
    expect(sinPolitica).toBeUndefined()
  }, 180_000)

  it('deja bitácora de la corrida, que es lo que responde «¿corrió hoy?»', async () => {
    const { data, error } = await admin
      .from('cartera_corridas_diarias')
      .select('fecha_corte, origen')
      .eq('tenant_id', tenantConPolitica.id)
      .single<{ fecha_corte: string; origen: string }>()
    expect(error).toBeNull()
    expect(data!.origen).toBe('cron')
    expect(data!.fecha_corte).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  }, 30_000)

  it('la corrida diaria no despacha NADA — ese es el alcance decidido', async () => {
    // El cron crea acciones; el envío exige una persona o agendar
    // cartera-ejecutar-lote, que no está agendado a propósito.
    const { count, error } = await admin
      .from('acciones_cobranza_envios')
      .select('id', { count: 'exact', head: true })
      .eq('tenant_id', tenantConPolitica.id)
    expect(error).toBeNull()
    expect(count).toBe(0)
  }, 30_000)

  it('acepta una fecha de corte explícita para re-correr un día concreto (REC-CAR-008)', async () => {
    const respuesta = await llamarCron(tokenCron!, { fecha_corte: '2026-07-15' })
    expect(respuesta.status).toBe(200)
    const cuerpo = (await respuesta.json()) as RespuestaCron
    expect(cuerpo.fechaCorte).toBe('2026-07-15')
  }, 180_000)
})
