/**
 * EXS-8 — Golden Journey de Experiencia y Servicios.
 *
 * Un solo recorrido, en orden, por los seis cortes que construyeron algo:
 * notificaciones, anuncios, directorio, movilidad, marketplace y la bandeja
 * de asuntos. No repite lo que cada suite ya prueba por dentro; comprueba
 * que **encajan entre sí** — que el trabajo que crea un módulo aparece en
 * la bandeja del otro, y que resolverlo allí lo hace desaparecer de aquí.
 *
 * Se recorre con dos personas reales, un administrador y un auxiliar, y con
 * un tercero multi-copropiedad al final: la hoja de ruta pide exactamente
 * ese par de casos.
 *
 * Los pasos van numerados y son DEPENDIENTES entre sí a propósito: es un
 * recorrido, no una batería de casos sueltos. Vitest ejecuta en orden.
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

interface Asunto {
  origen_modulo: string
  origen_entidad: string
  origen_id: string
  accion: string
  enlace: string
}

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

d('EXS-8: Golden Journey de Experiencia y Servicios', () => {
  const admin = clienteAdmin(env!)

  let tenant: TenantPrueba
  let administrador: UsuarioPrueba
  let auxiliar: UsuarioPrueba
  let comoAdmin: Cliente
  let comoAux: Cliente

  let tercero: string
  let inmueble: string

  // Estado que viaja entre pasos del recorrido.
  const paso: {
    anuncio?: string
    vehiculo?: string
    permiso?: string
    publicacion?: string
    interes?: string
  } = {}

  async function asuntos(cliente: Cliente): Promise<Asunto[]> {
    const { data, error } = await cliente.rpc('fn_mis_asuntos', { p_tenant_id: tenant.id })
    if (error) throw new Error(`fn_mis_asuntos: ${error.message}`)
    return data
  }

  beforeAll(async () => {
    tenant = await crearTenant(admin, 'gj')
    administrador = await crearUsuario(admin, 'gj-adm')
    auxiliar = await crearUsuario(admin, 'gj-aux')
    await crearMembership(admin, tenant.id, administrador.id, 'administrador')
    await crearMembership(admin, tenant.id, auxiliar.id, 'auxiliar')
    comoAdmin = await clienteComo(env!, administrador)
    comoAux = await clienteComo(env!, auxiliar)

    const { data: t } = await admin
      .from('terceros')
      .insert({
        tenant_id: tenant.id,
        tipo_persona: 'natural',
        primer_nombre: 'Rosa',
        primer_apellido: 'Peña',
        numero_documento: '43556677',
        tipo_identificacion_id: await idListaTipos(admin, 'TIPO_IDENTIFICACION', 'cedula'),
        estado_id: await idListaTipos(admin, 'ESTADO_TERCERO', 'activo'),
      })
      .select('id')
      .single<{ id: string }>()
    tercero = t!.id

    const { data: i } = await admin
      .from('inmuebles')
      .insert({
        tenant_id: tenant.id,
        codigo: `GJ-${String(Date.now())}`,
        tipo_id: await idListaTipos(admin, 'TIPO_INMUEBLE', 'apartamento'),
      })
      .select('id')
      .single<{ id: string }>()
    inmueble = i!.id
  }, 90_000)

  afterAll(async () => {
    await eliminarUsuario(admin, administrador.id)
    await eliminarUsuario(admin, auxiliar.id)
    await eliminarTenant(admin, tenant.id)
  })

  it('1 · la copropiedad arranca sin trabajo pendiente', async () => {
    expect(await asuntos(comoAdmin)).toHaveLength(0)
    expect(await asuntos(comoAux)).toHaveLength(0)
  }, 30_000)

  it('2 · el auxiliar redacta un anuncio y lo manda a revisión', async () => {
    const { data, error } = await comoAux
      .from('anuncios')
      .insert({
        tenant_id: tenant.id,
        titulo: 'Asamblea ordinaria el 30',
        contenido: 'Salón comunal, 7 p.m. Se requiere quórum.',
        categoria_id: await idListaTipos(admin, 'CATEGORIA_ANUNCIO', 'general'),
        prioridad_id: await idListaTipos(admin, 'PRIORIDAD_ANUNCIO', 'importante'),
      })
      .select('id')
      .single<{ id: string }>()
    if (error) throw new Error(`anuncio: ${error.message}`)
    paso.anuncio = data.id

    await comoAux.from('anuncios').update({ estado: 'pendiente_revision' }).eq('id', data.id)
  }, 30_000)

  it('3 · el anuncio aparece en la bandeja del administrador, no en la del auxiliar', async () => {
    const delAdmin = await asuntos(comoAdmin)
    const suyo = delAdmin.find((a) => a.origen_id === paso.anuncio)
    expect(suyo).toBeDefined()
    expect(suyo!.enlace).toBe(`/anuncios/${paso.anuncio!}`)

    // El auxiliar lo redactó, pero no puede aprobarlo: no es asunto suyo.
    expect((await asuntos(comoAux)).some((a) => a.origen_id === paso.anuncio)).toBe(false)
  }, 30_000)

  it('4 · el administrador aprueba y publica; el anuncio recibe consecutivo', async () => {
    await comoAdmin.from('anuncios').update({ estado: 'aprobado' }).eq('id', paso.anuncio!)
    const { error } = await comoAdmin
      .from('anuncios')
      .update({ estado: 'publicado' })
      .eq('id', paso.anuncio!)
    expect(error).toBeNull()

    const { data } = await admin
      .from('anuncios')
      .select('estado, numero, publicado_at')
      .eq('id', paso.anuncio!)
      .single<{ estado: string; numero: number | null; publicado_at: string | null }>()
    expect(data?.estado).toBe('publicado')
    expect(data?.numero).not.toBeNull()
    expect(data?.publicado_at).not.toBeNull()
  }, 30_000)

  it('5 · publicado, deja de ser trabajo pendiente para todos', async () => {
    expect((await asuntos(comoAdmin)).some((a) => a.origen_id === paso.anuncio)).toBe(false)
  }, 30_000)

  it('6 · el auxiliar registra el carro de la residente y lo relaciona con su apartamento', async () => {
    const { data, error } = await comoAux
      .from('vehiculos')
      .insert({
        tenant_id: tenant.id,
        placa: 'gj-455 h',
        tipo_id: await idListaTipos(admin, 'TIPO_VEHICULO', 'automovil'),
        marca: 'Mazda',
        modelo: '3',
      })
      .select('id, placa_normalizada')
      .single<{ id: string; placa_normalizada: string }>()
    if (error) throw new Error(`vehiculo: ${error.message}`)
    paso.vehiculo = data.id
    expect(data.placa_normalizada).toBe('GJ455H')

    await comoAux.from('vehiculo_relacion').insert({
      tenant_id: tenant.id,
      vehiculo_id: data.id,
      tercero_id: tercero,
      inmueble_id: inmueble,
      rol_id: await idListaTipos(admin, 'ROL_VEHICULO', 'propietario'),
    })
  }, 30_000)

  it('7 · registrado NO es autorizado: portería lo ve, pero sin permiso', async () => {
    const { data } = await comoAux.rpc('fn_vehiculo_por_placa', {
      p_tenant_id: tenant.id,
      p_placa: 'GJ455H',
    })
    const fila = (data as unknown as { autorizado: boolean; responsables: string[] }[])[0]!
    expect(fila.autorizado).toBe(false)
    expect(fila.responsables).toContain('Rosa Peña')
  }, 30_000)

  it('8 · el administrador otorga el permiso y portería ya autoriza', async () => {
    const enDiezDias = new Date()
    enDiezDias.setUTCDate(enDiezDias.getUTCDate() + 10)

    const { data, error } = await comoAdmin
      .from('vehiculo_permiso')
      .insert({
        tenant_id: tenant.id,
        vehiculo_id: paso.vehiculo!,
        tipo_id: await idListaTipos(admin, 'TIPO_PERMISO_VEHICULO', 'acceso'),
        vigente_hasta: enDiezDias.toISOString().slice(0, 10),
      })
      .select('id')
      .single<{ id: string }>()
    if (error) throw new Error(`permiso: ${error.message}`)
    paso.permiso = data.id

    const { data: consulta } = await comoAux.rpc('fn_vehiculo_por_placa', {
      p_tenant_id: tenant.id,
      p_placa: 'gj 455h',
    })
    expect((consulta as unknown as { autorizado: boolean }[])[0]!.autorizado).toBe(true)
  }, 30_000)

  it('9 · el permiso por vencer entra en la bandeja del administrador con su plazo', async () => {
    const asunto = (await asuntos(comoAdmin)).find((a) => a.origen_modulo === 'movilidad')
    expect(asunto).toBeDefined()
    expect(asunto!.accion).toBe('Renovar')
    expect(asunto!.enlace).toBe(`/movilidad?vehiculo=${paso.vehiculo!}`)
  }, 30_000)

  it('10 · la residente publica su ficha en el directorio y aparece sin datos privados', async () => {
    await admin.from('tercero_perfil').insert({
      tenant_id: tenant.id,
      tercero_id: tercero,
      nombre_comercial: 'Arepas Doña Rosa',
      categoria_comercio_id: await idListaTipos(admin, 'CATEGORIA_COMERCIO', 'alimentacion'),
      contacto_publico: '3009998877',
      publicado: true,
    })

    const { data } = await comoAux.rpc('fn_directorio_listar', { p_tenant_id: tenant.id })
    const serializado = JSON.stringify(data)
    expect(serializado).toContain('Arepas Doña Rosa')
    expect(serializado).not.toContain('43556677')
  }, 30_000)

  it('11 · el auxiliar captura un aviso del marketplace y lo manda a aprobación', async () => {
    const { data, error } = await comoAux
      .from('publicaciones')
      .insert({
        tenant_id: tenant.id,
        publicador_tercero_id: tercero,
        identidad_publica: 'Rosa P. — Torre 1',
        tipo_id: await idListaTipos(admin, 'TIPO_PUBLICACION_MARKETPLACE', 'venta'),
        categoria_id: await idListaTipos(admin, 'CATEGORIA_MARKETPLACE', 'hogar'),
        titulo: 'Juego de comedor',
        precio: 750000,
      })
      .select('id, origen')
      .single<{ id: string; origen: string }>()
    if (error) throw new Error(`publicacion: ${error.message}`)
    paso.publicacion = data.id
    // El origen se sella del rol real, no de lo que mande el cliente.
    expect(data.origen).toBe('auxiliar')

    await comoAux
      .from('publicaciones')
      .update({ estado: 'pendiente_aprobacion' })
      .eq('id', data.id)
  }, 30_000)

  it('12 · el auxiliar no puede aprobar lo suyo; el administrador sí', async () => {
    const { error } = await comoAux
      .from('publicaciones')
      .update({ estado: 'publicada' })
      .eq('id', paso.publicacion!)
    expect(error?.message).toContain('PUBLICACION_APROBACION_REQUIERE_ADMINISTRADOR')

    const { error: errorAdmin } = await comoAdmin
      .from('publicaciones')
      .update({ estado: 'publicada' })
      .eq('id', paso.publicacion!)
    expect(errorAdmin).toBeNull()
  }, 30_000)

  it('13 · el aviso ya está en el tablón, firmado solo con su identidad pública', async () => {
    const { data } = await comoAux.rpc('fn_marketplace_listar', { p_tenant_id: tenant.id })
    const filas = data as unknown as { id: string; identidad_publica: string }[]
    const mio = filas.find((f) => f.id === paso.publicacion)
    expect(mio).toBeDefined()
    expect(mio!.identidad_publica).toBe('Rosa P. — Torre 1')
    expect(JSON.stringify(filas)).not.toContain(tercero)
  }, 30_000)

  it('14 · un vecino se interesa y eso se convierte en trabajo para el equipo', async () => {
    const { data, error } = await comoAux
      .from('publicacion_interes')
      .insert({
        tenant_id: tenant.id,
        publicacion_id: paso.publicacion!,
        interesado_nombre: 'Vecino del 201',
        mensaje: '¿Cuántas sillas trae?',
      })
      .select('id')
      .single<{ id: string }>()
    if (error) throw new Error(`interes: ${error.message}`)
    paso.interes = data.id

    const asunto = (await asuntos(comoAux)).find((a) => a.origen_id === data.id)
    expect(asunto).toBeDefined()
    expect(asunto!.accion).toBe('Poner en contacto')
    expect(asunto!.enlace).toBe(`/marketplace?publicacion=${paso.publicacion!}`)
  }, 30_000)

  it('15 · atender el interés lo saca de la bandeja de los dos', async () => {
    await comoAux
      .from('publicacion_interes')
      .update({ atendido: true })
      .eq('id', paso.interes!)

    expect((await asuntos(comoAux)).some((a) => a.origen_id === paso.interes)).toBe(false)
    expect((await asuntos(comoAdmin)).some((a) => a.origen_id === paso.interes)).toBe(false)
  }, 30_000)

  it('16 · renovado el permiso, al administrador no le queda nada pendiente', async () => {
    await comoAdmin
      .from('vehiculo_permiso')
      .update({ vigente_hasta: null })
      .eq('id', paso.permiso!)

    expect(await asuntos(comoAdmin)).toHaveLength(0)
    expect(await asuntos(comoAux)).toHaveLength(0)
  }, 30_000)

  it('17 · retirar el vehículo revoca su permiso y portería deja de autorizarlo', async () => {
    await comoAdmin
      .from('vehiculos')
      .update({
        estado: 'retirado',
        retirado_at: new Date().toISOString(),
        motivo_retiro: 'La residente vendió el carro',
      })
      .eq('id', paso.vehiculo!)

    const { data: permiso } = await admin
      .from('vehiculo_permiso')
      .select('estado')
      .eq('id', paso.permiso!)
      .single<{ estado: string }>()
    expect(permiso?.estado).toBe('revocado')

    const { data: consulta } = await comoAux.rpc('fn_vehiculo_por_placa', {
      p_tenant_id: tenant.id,
      p_placa: 'GJ455H',
    })
    expect((consulta as unknown as { autorizado: boolean }[])[0]!.autorizado).toBe(false)
  }, 30_000)

  // ── El caso multi-copropiedad que pide la hoja de ruta ──

  it('18 · un administrador de dos copropiedades ve cada bandeja por separado', async () => {
    const segunda = await crearTenant(admin, 'gj-segunda')
    await crearMembership(admin, segunda.id, administrador.id, 'administrador')

    const { data: terceroDos } = await admin
      .from('terceros')
      .insert({
        tenant_id: segunda.id,
        tipo_persona: 'natural',
        primer_nombre: 'Iván',
        primer_apellido: 'Lozano',
        numero_documento: '80112233',
        tipo_identificacion_id: await idListaTipos(admin, 'TIPO_IDENTIFICACION', 'cedula'),
        estado_id: await idListaTipos(admin, 'ESTADO_TERCERO', 'activo'),
      })
      .select('id')
      .single<{ id: string }>()

    const { data: pubDos } = await admin
      .from('publicaciones')
      .insert({
        tenant_id: segunda.id,
        publicador_tercero_id: terceroDos!.id,
        identidad_publica: 'Iván L.',
        tipo_id: await idListaTipos(admin, 'TIPO_PUBLICACION_MARKETPLACE', 'venta'),
        categoria_id: await idListaTipos(admin, 'CATEGORIA_MARKETPLACE', 'hogar'),
        titulo: 'Aviso de la segunda copropiedad',
        origen: 'residente',
        estado: 'pendiente_aprobacion',
      })
      .select('id')
      .single<{ id: string }>()

    // La misma persona, dos bandejas: la de la primera sigue vacía y la de
    // la segunda trae su propio trabajo. El tenant lo fija el parámetro, no
    // una preferencia guardada del usuario.
    expect(await asuntos(comoAdmin)).toHaveLength(0)

    const { data: bandejaDos } = await comoAdmin.rpc('fn_mis_asuntos', {
      p_tenant_id: segunda.id,
    })
    const filas = bandejaDos as unknown as Asunto[]
    expect(filas).toHaveLength(1)
    expect(filas[0]!.origen_id).toBe(pubDos!.id)

    await eliminarTenant(admin, segunda.id)
  }, 60_000)
})
