/**
 * EXS-3 — anuncios: máquina de estados, segregación, audiencia y lectura.
 *
 * Lo que defiende, y que no se ve leyendo el esquema:
 *
 *  1. la separación crear/aprobar/publicar NO es un permiso, es una
 *     transición custodiada — y quien redacta no aprueba lo suyo;
 *  2. la audiencia se resuelve contra datos vivos, no contra una lista
 *     congelada al publicar;
 *  3. un anuncio publicado no se edita en silencio;
 *  4. el consecutivo se asigna al publicar y solo entonces;
 *  5. la publicación programada es idempotente sin tabla auxiliar.
 */
import { describe, expect, it, beforeAll, afterAll } from 'vitest'
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

async function idListaTipos(admin: Cliente, tipo: string, codigo: string): Promise<number> {
  const { data, error } = await admin
    .from('lista_tipos')
    .select('id')
    .eq('tipo', tipo)
    .eq('codigo', codigo)
    .single<{ id: number }>()
  if (error) throw new Error(`lista_tipos ${tipo}.${codigo}: ${error.message}`)
  return data.id
}

d('EXS-3: anuncios y comunicación oficial', () => {
  const admin = clienteAdmin(env!)

  let tenant: TenantPrueba
  let admin1: UsuarioPrueba
  let admin2: UsuarioPrueba
  let auxiliar: UsuarioPrueba
  let cAdmin1: Cliente
  let cAdmin2: Cliente
  let cAuxiliar: Cliente
  let categoriaId: number
  let prioridadId: number

  beforeAll(async () => {
    tenant = await crearTenant(admin, 'exs3')
    admin1 = await crearUsuario(admin, 'exs3-admin1')
    admin2 = await crearUsuario(admin, 'exs3-admin2')
    auxiliar = await crearUsuario(admin, 'exs3-aux')

    await crearMembership(admin, tenant.id, admin1.id, 'administrador')
    await crearMembership(admin, tenant.id, admin2.id, 'administrador')
    await crearMembership(admin, tenant.id, auxiliar.id, 'auxiliar')

    cAdmin1 = await clienteComo(env!, admin1)
    cAdmin2 = await clienteComo(env!, admin2)
    cAuxiliar = await clienteComo(env!, auxiliar)

    categoriaId = await idListaTipos(admin, 'CATEGORIA_ANUNCIO', 'seguridad')
    prioridadId = await idListaTipos(admin, 'PRIORIDAD_ANUNCIO', 'urgente')
  }, 60_000)

  afterAll(async () => {
    for (const u of [admin1, admin2, auxiliar]) await eliminarUsuario(admin, u.id)
    await eliminarTenant(admin, tenant.id)
  })

  async function crearBorrador(cliente: Cliente, titulo: string, creadoPor: string): Promise<string> {
    const { data, error } = await cliente
      .from('anuncios')
      .insert({
        tenant_id: tenant.id,
        categoria_id: categoriaId,
        prioridad_id: prioridadId,
        titulo,
        contenido: 'Contenido de la comunicación oficial.',
        creado_por: creadoPor,
      })
      .select('id')
      .single<{ id: string }>()
    if (error) throw new Error(`crear borrador: ${error.message}`)
    return data.id
  }

  it('transición ilegal: de borrador no se puede saltar a archivado', async () => {
    const id = await crearBorrador(cAdmin1, 'Salto ilegal', admin1.id)
    const { error } = await cAdmin1.from('anuncios').update({ estado: 'archivado' }).eq('id', id)
    expect(error?.message).toContain('ANUNCIO_TRANSICION_INVALIDA')
  }, 30_000)

  it('un auxiliar no puede publicar directo: debe pasar por revisión', async () => {
    const id = await crearBorrador(cAuxiliar, 'Intento del auxiliar', auxiliar.id)
    const { error } = await cAuxiliar.from('anuncios').update({ estado: 'publicado' }).eq('id', id)
    expect(error?.message).toContain('ANUNCIO_PUBLICACION_DIRECTA_REQUIERE_ADMINISTRADOR')
  }, 30_000)

  it('segregación: quien redactó no puede aprobar su propio anuncio', async () => {
    const id = await crearBorrador(cAdmin1, 'Redactado por admin1', admin1.id)
    await cAdmin1.from('anuncios').update({ estado: 'pendiente_revision' }).eq('id', id)

    const { error } = await cAdmin1.from('anuncios').update({ estado: 'aprobado' }).eq('id', id)
    expect(error?.message).toContain('ANUNCIO_AUTOAPROBACION')

    // Otro administrador sí puede, y queda sellado quién revisó.
    const { error: errOtro } = await cAdmin2.from('anuncios').update({ estado: 'aprobado' }).eq('id', id)
    expect(errOtro).toBeNull()

    const { data } = await admin
      .from('anuncios')
      .select('revisado_por, revisado_at')
      .eq('id', id)
      .single<{ revisado_por: string; revisado_at: string }>()
    expect(data!.revisado_por).toBe(admin2.id)
    expect(data!.revisado_at).not.toBeNull()
  }, 30_000)

  it('un auxiliar no puede aprobar aunque no sea el autor', async () => {
    const id = await crearBorrador(cAdmin1, 'Para el auxiliar', admin1.id)
    await cAdmin1.from('anuncios').update({ estado: 'pendiente_revision' }).eq('id', id)

    const { error } = await cAuxiliar.from('anuncios').update({ estado: 'aprobado' }).eq('id', id)
    expect(error?.message).toContain('ANUNCIO_REVISION_REQUIERE_ADMINISTRADOR')
  }, 30_000)

  it('publicar asigna consecutivo y sello; el borrador no tenía número', async () => {
    const id = await crearBorrador(cAdmin1, 'Corte de agua programado', admin1.id)

    const { data: antes } = await admin
      .from('anuncios')
      .select('numero, anio, publicado_at')
      .eq('id', id)
      .single<{ numero: number | null; anio: number | null; publicado_at: string | null }>()
    expect(antes!.numero).toBeNull()
    expect(antes!.publicado_at).toBeNull()

    const { error } = await cAdmin1.from('anuncios').update({ estado: 'publicado' }).eq('id', id)
    expect(error).toBeNull()

    const { data: despues } = await admin
      .from('anuncios')
      .select('numero, anio, publicado_at, publicado_por, vigente_desde')
      .eq('id', id)
      .single<{ numero: number; anio: number; publicado_at: string; publicado_por: string; vigente_desde: string }>()
    expect(despues!.numero).toBeGreaterThan(0)
    expect(despues!.anio).toBeGreaterThan(2000)
    expect(despues!.publicado_at).not.toBeNull()
    expect(despues!.publicado_por).toBe(admin1.id)
    // Sin vigencia explícita, vige desde que se publica.
    expect(despues!.vigente_desde).toBe(despues!.publicado_at)
  }, 30_000)

  it('el consecutivo no se repite y no se quema en borradores', async () => {
    const primero = await crearBorrador(cAdmin1, 'Consecutivo uno', admin1.id)
    const descartado = await crearBorrador(cAdmin1, 'Este se cancela', admin1.id)
    const segundo = await crearBorrador(cAdmin1, 'Consecutivo dos', admin1.id)

    await cAdmin1.from('anuncios').update({ estado: 'publicado' }).eq('id', primero)
    await cAdmin1.from('anuncios').update({ estado: 'cancelado' }).eq('id', descartado)
    await cAdmin1.from('anuncios').update({ estado: 'publicado' }).eq('id', segundo)

    const { data } = await admin
      .from('anuncios')
      .select('numero')
      .in('id', [primero, segundo])
      .order('numero', { ascending: true })
    const numeros = (data ?? []).map((f) => f.numero as number)
    expect(numeros[1]! - numeros[0]!).toBe(1)

    const { data: cancelado } = await admin
      .from('anuncios')
      .select('numero')
      .eq('id', descartado)
      .single<{ numero: number | null }>()
    expect(cancelado!.numero).toBeNull()
  }, 30_000)

  it('un anuncio publicado no se edita en silencio', async () => {
    const id = await crearBorrador(cAdmin1, 'Ya publicado', admin1.id)
    await cAdmin1.from('anuncios').update({ estado: 'publicado' }).eq('id', id)

    const { error } = await cAdmin1
      .from('anuncios')
      .update({ contenido: 'Contenido cambiado después de publicar.' })
      .eq('id', id)
    expect(error?.message).toContain('ANUNCIO_PUBLICADO_INMUTABLE')
  }, 30_000)

  it('programar exige fecha futura, y una fecha pasada se rechaza', async () => {
    const id = await crearBorrador(cAdmin1, 'Programado', admin1.id)
    await cAdmin1.from('anuncios').update({ estado: 'pendiente_revision' }).eq('id', id)
    await cAdmin2.from('anuncios').update({ estado: 'aprobado' }).eq('id', id)

    const { error: errPasado } = await cAdmin1
      .from('anuncios')
      .update({ estado: 'programado', publicar_at: '2020-01-01T00:00:00Z' })
      .eq('id', id)
    expect(errPasado?.message).toContain('ANUNCIO_PROGRAMADO_EN_PASADO')

    const futuro = new Date(Date.now() + 86_400_000).toISOString()
    const { error } = await cAdmin1
      .from('anuncios')
      .update({ estado: 'programado', publicar_at: futuro })
      .eq('id', id)
    expect(error).toBeNull()
  }, 30_000)

  it('el job publica lo vencido y una segunda corrida no lo duplica (GC-005)', async () => {
    const id = await crearBorrador(cAdmin1, 'Se publica solo', admin1.id)
    await cAdmin1.from('anuncios').update({ estado: 'pendiente_revision' }).eq('id', id)
    await cAdmin2.from('anuncios').update({ estado: 'aprobado' }).eq('id', id)
    const futuro = new Date(Date.now() + 86_400_000).toISOString()
    await cAdmin1.from('anuncios').update({ estado: 'programado', publicar_at: futuro }).eq('id', id)

    // Se adelanta la fecha con service_role (el guard trata auth.uid() nulo
    // como cambio fuera de banda), simulando que llegó el momento.
    await admin.from('anuncios').update({ publicar_at: new Date(Date.now() - 1000).toISOString() }).eq('id', id)

    const { data: primera } = await admin.rpc('fn_anuncio_publicar_programados')
    expect(primera).toBeGreaterThanOrEqual(1)

    const { data: estado } = await admin
      .from('anuncios')
      .select('estado, numero')
      .eq('id', id)
      .single<{ estado: string; numero: number }>()
    expect(estado!.estado).toBe('publicado')
    expect(estado!.numero).toBeGreaterThan(0)

    // Segunda corrida: nada que hacer. El estado es la marca de idempotencia.
    const { data: segunda } = await admin.rpc('fn_anuncio_publicar_programados')
    expect(segunda).toBe(0)
  }, 30_000)

  it('publicar emite la notificación in-app con su deep link', async () => {
    const id = await crearBorrador(cAdmin1, 'Notifica al publicar', admin1.id)
    await cAdmin1.from('anuncios').update({ estado: 'publicado' }).eq('id', id)

    const { data } = await admin
      .from('notificaciones')
      .select('titulo, modulo, enlace, origen_entidad')
      .eq('tenant_id', tenant.id)
      .eq('origen_id', id)
    expect(data).toHaveLength(1)
    expect(data![0]!.modulo).toBe('anuncios')
    expect(data![0]!.enlace).toBe(`/anuncios/${id}`)
    // urgente (anuncio) se proyecta a critica (campana).
    expect(data![0]!.origen_entidad).toBe('anuncios')
  }, 30_000)

  it('audiencia sin reglas = toda la copropiedad; con regla, solo el segmento', async () => {
    const id = await crearBorrador(cAdmin1, 'Audiencia', admin1.id)

    // Sin reglas resuelve contra todos los terceros con relación vigente.
    // El tenant de prueba no tiene inmuebles, así que lo verificable aquí es
    // que la función responde sin error y que el conteo es consistente con
    // las métricas — la resolución por criterio la cubre GOB-9.
    const { data: todos, error } = await admin.rpc('fn_anuncio_destinatarios', { p_anuncio_id: id })
    expect(error).toBeNull()
    expect(Array.isArray(todos)).toBe(true)

    const { data: metricas } = await admin.rpc('fn_anuncio_metricas', { p_anuncio_id: id })
    expect(metricas![0]!.destinatarios).toBe((todos ?? []).length)
    expect(metricas![0]!.leidos).toBe(0)
  }, 30_000)

  it('leer y confirmar son actos distintos', async () => {
    const id = await crearBorrador(cAdmin1, 'Requiere confirmación', admin1.id)
    await cAdmin1.from('anuncios').update({ requiere_confirmacion: true }).eq('id', id)
    await cAdmin1.from('anuncios').update({ estado: 'publicado' }).eq('id', id)

    const { error: errLeer } = await cAdmin2
      .from('anuncio_lectura')
      .insert({ anuncio_id: id, user_id: admin2.id })
    expect(errLeer).toBeNull()

    const { data: metricasTrasLeer } = await admin.rpc('fn_anuncio_metricas', { p_anuncio_id: id })
    expect(metricasTrasLeer![0]!.leidos).toBe(1)
    expect(metricasTrasLeer![0]!.confirmados).toBe(0)

    await cAdmin2
      .from('anuncio_lectura')
      .update({ confirmado_at: new Date().toISOString() })
      .eq('anuncio_id', id)
      .eq('user_id', admin2.id)

    const { data: metricasTrasConfirmar } = await admin.rpc('fn_anuncio_metricas', { p_anuncio_id: id })
    expect(metricasTrasConfirmar![0]!.confirmados).toBe(1)
  }, 30_000)

  it('no se puede marcar leído un anuncio que aún no está publicado', async () => {
    const id = await crearBorrador(cAdmin1, 'Todavía borrador', admin1.id)
    const { error } = await cAdmin2
      .from('anuncio_lectura')
      .insert({ anuncio_id: id, user_id: admin2.id })
    expect(error).not.toBeNull()
  }, 30_000)

  it('no se puede registrar la lectura a nombre de otro', async () => {
    const id = await crearBorrador(cAdmin1, 'Lectura ajena', admin1.id)
    await cAdmin1.from('anuncios').update({ estado: 'publicado' }).eq('id', id)

    const { error } = await cAdmin2
      .from('anuncio_lectura')
      .insert({ anuncio_id: id, user_id: admin1.id })
    expect(error).not.toBeNull()
  }, 30_000)

  it('tenant isolation: el anuncio de otra copropiedad no existe para mí', async () => {
    const otro = await crearTenant(admin, 'exs3-otro')
    const usuarioOtro = await crearUsuario(admin, 'exs3-otro-u')
    await crearMembership(admin, otro.id, usuarioOtro.id, 'administrador')
    const cOtro = await clienteComo(env!, usuarioOtro)

    const id = await crearBorrador(cAdmin1, 'Privado de este tenant', admin1.id)

    const { data } = await cOtro.from('anuncios').select('id').eq('id', id)
    expect(data).toEqual([])

    // Y conocer el UUID tampoco sirve para resolver su audiencia.
    const { error } = await cOtro.rpc('fn_anuncio_destinatarios', { p_anuncio_id: id })
    expect(error?.message).toContain('ANUNCIO_NO_ENCONTRADO')

    await eliminarUsuario(admin, usuarioOtro.id)
    await eliminarTenant(admin, otro.id)
  }, 60_000)

  it('un anuncio no se puede borrar: se archiva', async () => {
    const id = await crearBorrador(cAdmin1, 'No se borra', admin1.id)
    await cAdmin1.from('anuncios').update({ estado: 'publicado' }).eq('id', id)

    await cAdmin1.from('anuncios').delete().eq('id', id)
    const { data } = await admin.from('anuncios').select('id').eq('id', id)
    expect(data).toHaveLength(1)

    const { error } = await cAdmin1.from('anuncios').update({ estado: 'archivado' }).eq('id', id)
    expect(error).toBeNull()
  }, 30_000)
})
