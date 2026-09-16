/**
 * RPT-05 — programaciones, suscriptores y bitácora de entregas
 * (migraciones 20260941010000-20260941030000).
 *
 * Las dos reglas de seguridad que el plan pide por su nombre, y una tercera
 * que salió al escribirlas:
 *
 * 1. **Un usuario no puede suscribir a quien no es miembro.** Una
 *    programación es un envío recurrente de los estados financieros de la
 *    copropiedad: el destinatario tiene que estar dentro.
 * 2. **Una programación no cambia de copropiedad.** La política de UPDATE
 *    no basta — quien administra dos tenants pasa el `using` con uno y el
 *    `with check` con el otro. Hace falta un guardia.
 * 3. **La bitácora de entregas no la escribe nadie con sesión**: es la
 *    prueba de a quién llegó, y un administrador que pueda editarla la
 *    vacía de sentido.
 *
 * El cálculo de calendario se prueba aparte, con `select` directos sobre
 * `fn_reporte_proxima_corrida`, que es pura a propósito.
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
  console.warn('SALTADO tests/rls/reportes-programaciones: faltan variables de Supabase en .env')
}

interface FilaId {
  id: string
}

d('RPT-05 · programación y entrega', () => {
  let admin: Cliente
  let tenant: TenantPrueba
  let otroTenant: TenantPrueba
  let auxiliar: UsuarioPrueba
  let auditor: UsuarioPrueba
  let forastero: UsuarioPrueba
  let cliente: Cliente
  let reporteId: string
  let programacionId: string

  beforeAll(async () => {
    admin = clienteAdmin(env!)
    tenant = await crearTenant(admin, 'rpt5p')
    otroTenant = await crearTenant(admin, 'rpt5p-otro')
    auxiliar = await crearUsuario(admin, 'rpt5p-auxiliar')
    auditor = await crearUsuario(admin, 'rpt5p-auditor')
    // Existe, pero NO es miembro de esta copropiedad.
    forastero = await crearUsuario(admin, 'rpt5p-forastero')
    await crearMembership(admin, tenant.id, auxiliar.id, 'auxiliar')
    await crearMembership(admin, tenant.id, auditor.id, 'auditor')
    await crearMembership(admin, otroTenant.id, auxiliar.id, 'auxiliar')
    cliente = await clienteComo(env!, auxiliar)

    // Un reporte propio, publicado: programar un borrador no se admite.
    const { data: reporte, error } = await cliente
      .from('reportes')
      .insert({ tenant_id: tenant.id, codigo: 'RPT5-001', nombre: 'Cartera semanal' })
      .select('id')
      .single<FilaId>()
    if (error) throw error
    reporteId = reporte.id

    const { error: errorVersion } = await cliente.from('reporte_versiones').insert({
      tenant_id: tenant.id,
      reporte_id: reporteId,
      version: 1,
      estado: 'publicada',
      definicion: { fuente: 'recaudos', campos: [{ campo: 'monto' }] },
      publicada_at: new Date().toISOString(),
    })
    if (errorVersion) throw errorVersion
  }, 90_000)

  afterAll(async () => {
    if (!env) return
    await eliminarTenant(admin, tenant.id)
    await eliminarTenant(admin, otroTenant.id)
    await eliminarUsuario(admin, auxiliar.id)
    await eliminarUsuario(admin, auditor.id)
    await eliminarUsuario(admin, forastero.id)
  }, 90_000)

  // ── Alta ─────────────────────────────────────────────────────────────
  it('un auxiliar programa un reporte publicado, y la zona sale de la copropiedad', async () => {
    const { data, error } = await cliente
      .from('reporte_programaciones')
      .insert({
        tenant_id: tenant.id,
        reporte_id: reporteId,
        nombre: 'Cartera de los lunes',
        frecuencia: 'semanal',
        dia_semana: 1,
        hora: '07:00',
        // A propósito vacía: el disparador debe tomarla del tenant.
        zona_horaria: '',
        formato: 'xlsx',
      })
      .select('id, zona_horaria, proxima_at')
      .single<{ id: string; zona_horaria: string; proxima_at: string | null }>()

    expect(error).toBeNull()
    expect(data!.zona_horaria).toBe('America/Bogota')
    // Y queda con su próxima corrida ya calculada, no en null.
    expect(data!.proxima_at).not.toBeNull()
    programacionId = data!.id
  })

  it('el auditor no puede programar nada (hace falta operar, no solo mirar)', async () => {
    const clienteAuditor = await clienteComo(env!, auditor)
    const { error } = await clienteAuditor.from('reporte_programaciones').insert({
      tenant_id: tenant.id,
      reporte_id: reporteId,
      nombre: 'No debería existir',
      frecuencia: 'diaria',
      hora: '07:00',
      zona_horaria: 'America/Bogota',
      formato: 'pdf',
    })
    expect(error?.code).toBe('42501')
  })

  // Esta prueba encontró un error real: el CHECK original decía
  // `dia_semana between 0 and 6`, que con la columna nula evalúa a NULL — y
  // un CHECK que da NULL se considera satisfecho. La fila entraba, y su
  // próxima corrida habría sido NULL para siempre: una programación que
  // nunca corre y que nadie nota. Corregido en 20260941040000 con
  // `coalesce(..., false)`. Por eso se exige el código 23514 y no un
  // «falló»: no fallaba.
  it('una frecuencia semanal sin día de semana no se puede guardar', async () => {
    const { error } = await cliente.from('reporte_programaciones').insert({
      tenant_id: tenant.id,
      reporte_id: reporteId,
      nombre: 'Incoherente',
      frecuencia: 'semanal',
      hora: '07:00',
      zona_horaria: 'America/Bogota',
      formato: 'pdf',
    })
    // La rechaza el CHECK de coherencia, no la RLS.
    expect(error?.code).toBe('23514')
  })

  it('una frecuencia mensual sin día del mes tampoco', async () => {
    const { error } = await cliente.from('reporte_programaciones').insert({
      tenant_id: tenant.id,
      reporte_id: reporteId,
      nombre: 'Incoherente mensual',
      frecuencia: 'mensual',
      hora: '07:00',
      zona_horaria: 'America/Bogota',
      formato: 'pdf',
    })
    expect(error?.code).toBe('23514')
  })

  it('y una diaria con día de semana sobrante se rechaza igual', async () => {
    const { error } = await cliente.from('reporte_programaciones').insert({
      tenant_id: tenant.id,
      reporte_id: reporteId,
      nombre: 'Diaria con sobras',
      frecuencia: 'diaria',
      dia_semana: 3,
      hora: '07:00',
      zona_horaria: 'America/Bogota',
      formato: 'pdf',
    })
    expect(error?.code).toBe('23514')
  })

  it('desactivar una programación le quita la próxima corrida', async () => {
    const { data, error } = await cliente
      .from('reporte_programaciones')
      .update({ activa: false })
      .eq('id', programacionId)
      .select('proxima_at')
      .single<{ proxima_at: string | null }>()

    expect(error).toBeNull()
    expect(data!.proxima_at).toBeNull()

    // Y reactivarla la recalcula sola.
    const { data: reactivada } = await cliente
      .from('reporte_programaciones')
      .update({ activa: true })
      .eq('id', programacionId)
      .select('proxima_at')
      .single<{ proxima_at: string | null }>()
    expect(reactivada!.proxima_at).not.toBeNull()
  })

  // ── La programación no se muda de copropiedad ────────────────────────
  it('una programación no puede cambiar de copropiedad, ni siendo miembro de las dos', async () => {
    // `auxiliar` es auxiliar en AMBAS, así que la política de UPDATE deja
    // pasar el using con una y el with check con la otra. Solo el guardia
    // lo impide.
    const { error } = await cliente
      .from('reporte_programaciones')
      .update({ tenant_id: otroTenant.id })
      .eq('id', programacionId)

    expect(error?.message).toContain('RPT_PROGRAMACION_CONTEXTO_INMUTABLE')

    const { data } = await cliente
      .from('reporte_programaciones')
      .select('tenant_id')
      .eq('id', programacionId)
      .single<{ tenant_id: string }>()
    expect(data!.tenant_id).toBe(tenant.id)
  })

  // ── Suscriptores: miembros y nada más ────────────────────────────────
  it('se puede suscribir a un miembro de la copropiedad', async () => {
    const { error } = await cliente.from('reporte_suscripciones').insert({
      tenant_id: tenant.id,
      programacion_id: programacionId,
      profile_id: auditor.id,
    })
    expect(error).toBeNull()
  })

  it('NO se puede suscribir a alguien que no es miembro', async () => {
    const { error } = await cliente.from('reporte_suscripciones').insert({
      tenant_id: tenant.id,
      programacion_id: programacionId,
      profile_id: forastero.id,
    })
    // La política, no una FK: el forastero existe como perfil.
    expect(error?.code).toBe('42501')
  })

  // ── La bitácora de entregas es evidencia, no un registro editable ────
  it('nadie con sesión escribe en la bitácora de entregas', async () => {
    const { error } = await cliente.from('reporte_entregas').insert({
      tenant_id: tenant.id,
      programacion_id: programacionId,
      destinatario: 'cualquiera@ejemplo.com',
      estado: 'enviada',
    })
    expect(error?.code).toBe('42501')
  })

  it('y una entrega registrada por el servidor no se puede alterar ni borrar', async () => {
    const { data: entrega, error } = await admin
      .from('reporte_entregas')
      .insert({
        tenant_id: tenant.id,
        programacion_id: programacionId,
        destinatario: 'auditor@ejemplo.com',
        estado: 'fallida',
        detalle: 'buzón lleno',
      })
      .select('id')
      .single<FilaId>()
    expect(error).toBeNull()

    // Ni siquiera el cliente de servicio: el guardia es un disparador.
    const { error: errorUpdate } = await admin
      .from('reporte_entregas')
      .update({ estado: 'enviada' })
      .eq('id', entrega!.id)
    expect(errorUpdate?.message).toContain('APPEND_ONLY')

    const { error: errorDelete } = await admin
      .from('reporte_entregas')
      .delete()
      .eq('id', entrega!.id)
    expect(errorDelete?.message).toContain('APPEND_ONLY')

    // El miembro sí la lee: es lo que responde «¿a quién llegó?».
    const { data } = await cliente
      .from('reporte_entregas')
      .select('destinatario, estado, detalle')
      .eq('id', entrega!.id)
      .single<{ destinatario: string; estado: string; detalle: string | null }>()
    expect(data!.destinatario).toBe('auditor@ejemplo.com')
    expect(data!.detalle).toBe('buzón lleno')
  })

  it('una entrega fallida sin explicación no se admite', async () => {
    const { error } = await admin.from('reporte_entregas').insert({
      tenant_id: tenant.id,
      programacion_id: programacionId,
      destinatario: 'x@ejemplo.com',
      estado: 'fallida',
    })
    expect(error?.code).toBe('23514')
  })
})
