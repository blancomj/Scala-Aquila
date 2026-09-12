/**
 * EXS-7 — Mis asuntos: la bandeja de trabajo del miembro.
 *
 * Lo que defiende:
 *
 *  1. es AGREGACIÓN — resolver el trabajo saca el asunto de la bandeja sin
 *     que nadie lo borre, porque no hay nada que borrar;
 *  2. cada rama filtra por quien puede ACTUAR, no por quien puede mirar: un
 *     auxiliar no ve lo que solo un administrador puede aprobar;
 *  3. asunto ≠ notificación — leer un aviso no es haber hecho el trabajo;
 *  4. el deep link lleva al contexto exacto, no al home del módulo;
 *  5. lo que vence antes se atiende antes.
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
  titulo: string
  resumen: string
  estado: string
  accion: string
  enlace: string
  created_at: string
  vence_at: string | null
  asignado_a: string | null
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

function enDias(dias: number): string {
  const f = new Date()
  f.setUTCDate(f.getUTCDate() + dias)
  return f.toISOString().slice(0, 10)
}

d('EXS-7: mis asuntos', () => {
  const admin = clienteAdmin(env!)

  let tenant: TenantPrueba
  let administrador: UsuarioPrueba
  let auxiliar: UsuarioPrueba
  let comoAdmin: Cliente
  let comoAuxiliar: Cliente

  let tercero: string
  let tipoVenta: number
  let categoria: number

  async function asuntos(cliente: Cliente): Promise<Asunto[]> {
    const { data, error } = await cliente.rpc('fn_mis_asuntos', { p_tenant_id: tenant.id })
    if (error) throw new Error(`fn_mis_asuntos: ${error.message}`)
    // El tipo generado ya garantiza el array: la función `returns table`
    // devuelve cero filas, nunca null.
    return data
  }

  beforeAll(async () => {
    tenant = await crearTenant(admin, 'exs7')
    administrador = await crearUsuario(admin, 'exs7-adm')
    auxiliar = await crearUsuario(admin, 'exs7-aux')
    await crearMembership(admin, tenant.id, administrador.id, 'administrador')
    await crearMembership(admin, tenant.id, auxiliar.id, 'auxiliar')
    comoAdmin = await clienteComo(env!, administrador)
    comoAuxiliar = await clienteComo(env!, auxiliar)

    tipoVenta = await idListaTipos(admin, 'TIPO_PUBLICACION_MARKETPLACE', 'venta')
    categoria = await idListaTipos(admin, 'CATEGORIA_MARKETPLACE', 'hogar')

    const tipoIdent = await idListaTipos(admin, 'TIPO_IDENTIFICACION', 'cedula')
    const estadoTercero = await idListaTipos(admin, 'ESTADO_TERCERO', 'activo')
    const { data, error } = await admin
      .from('terceros')
      .insert({
        tenant_id: tenant.id,
        tipo_persona: 'natural',
        primer_nombre: 'Marta',
        primer_apellido: 'Gil',
        numero_documento: '39887766',
        tipo_identificacion_id: tipoIdent,
        estado_id: estadoTercero,
      })
      .select('id')
      .single<{ id: string }>()
    if (error) throw new Error(`fixture tercero: ${error.message}`)
    tercero = data.id
  }, 60_000)

  afterAll(async () => {
    await eliminarUsuario(admin, administrador.id)
    await eliminarUsuario(admin, auxiliar.id)
    await eliminarTenant(admin, tenant.id)
  })

  it('una copropiedad sin trabajo pendiente tiene la bandeja vacía', async () => {
    expect(await asuntos(comoAdmin)).toHaveLength(0)
  }, 30_000)

  it('no hay bandeja para quien no es miembro de la copropiedad', async () => {
    const otro = await crearTenant(admin, 'exs7-ajeno')
    const { error } = await comoAdmin.rpc('fn_mis_asuntos', { p_tenant_id: otro.id })
    expect(error?.message).toContain('ASUNTOS_NO_DISPONIBLES')
    await eliminarTenant(admin, otro.id)
  }, 30_000)

  // ── Filtrado por quien puede ACTUAR ──

  it('lo que solo el administrador puede aprobar NO aparece en la bandeja del auxiliar', async () => {
    const { data: pub } = await comoAuxiliar
      .from('publicaciones')
      .insert({
        tenant_id: tenant.id,
        publicador_tercero_id: tercero,
        identidad_publica: 'Marta G.',
        tipo_id: tipoVenta,
        categoria_id: categoria,
        titulo: 'Escritorio de madera',
        precio: 200000,
      })
      .select('id')
      .single<{ id: string }>()
    await comoAuxiliar
      .from('publicaciones')
      .update({ estado: 'pendiente_aprobacion' })
      .eq('id', pub!.id)

    // El auxiliar lo creó, pero solo un administrador puede aprobarlo: no
    // es trabajo suyo y no debe ocupar su bandeja.
    const delAuxiliar = await asuntos(comoAuxiliar)
    expect(delAuxiliar.some((a) => a.origen_id === pub!.id)).toBe(false)

    const delAdmin = await asuntos(comoAdmin)
    const asunto = delAdmin.find((a) => a.origen_id === pub!.id)
    expect(asunto).toBeDefined()
    expect(asunto!.origen_modulo).toBe('marketplace')
    expect(asunto!.accion).toBe('Aprobar')
  }, 30_000)

  it('lo que originó un residente sí puede atenderlo el auxiliar', async () => {
    const { data: pub } = await admin
      .from('publicaciones')
      .insert({
        tenant_id: tenant.id,
        publicador_tercero_id: tercero,
        identidad_publica: 'Marta G.',
        tipo_id: tipoVenta,
        categoria_id: categoria,
        titulo: 'Cafetera italiana',
        precio: 60000,
        origen: 'residente',
        estado: 'pendiente_aprobacion',
      })
      .select('id')
      .single<{ id: string }>()

    const delAuxiliar = await asuntos(comoAuxiliar)
    expect(delAuxiliar.some((a) => a.origen_id === pub!.id)).toBe(true)
  }, 30_000)

  it('un anuncio pendiente de revisión es asunto del administrador, no del auxiliar', async () => {
    const categoriaAnuncio = await idListaTipos(admin, 'CATEGORIA_ANUNCIO', 'general')
    const prioridad = await idListaTipos(admin, 'PRIORIDAD_ANUNCIO', 'normal')
    const { data: anuncio, error } = await comoAuxiliar
      .from('anuncios')
      .insert({
        tenant_id: tenant.id,
        titulo: 'Corte de agua el martes',
        contenido: 'De 8 a 12 del mediodía.',
        categoria_id: categoriaAnuncio,
        prioridad_id: prioridad,
      })
      .select('id')
      .single<{ id: string }>()
    if (error) throw new Error(`fixture anuncio: ${error.message}`)

    await comoAuxiliar
      .from('anuncios')
      .update({ estado: 'pendiente_revision' })
      .eq('id', anuncio.id)

    expect((await asuntos(comoAuxiliar)).some((a) => a.origen_id === anuncio.id)).toBe(false)

    const asunto = (await asuntos(comoAdmin)).find((a) => a.origen_id === anuncio.id)
    expect(asunto).toBeDefined()
    expect(asunto!.origen_modulo).toBe('anuncios')
    // Deep link al anuncio exacto, no al listado.
    expect(asunto!.enlace).toBe(`/anuncios/${anuncio.id}`)
  }, 30_000)

  // ── Agregación: se resuelve solo ──

  it('aprobar el anuncio lo saca de la bandeja, sin que nadie borre nada', async () => {
    const antes = (await asuntos(comoAdmin)).filter((a) => a.origen_entidad === 'anuncio')
    expect(antes.length).toBeGreaterThan(0)

    await comoAdmin.from('anuncios').update({ estado: 'aprobado' }).eq('id', antes[0]!.origen_id)

    const despues = (await asuntos(comoAdmin)).filter((a) => a.origen_id === antes[0]!.origen_id)
    expect(despues).toHaveLength(0)
  }, 30_000)

  // ── Asunto ≠ notificación ──

  it('leer la notificación no saca el asunto de la bandeja: son cosas distintas', async () => {
    const { data: pub } = await comoAdmin
      .from('publicaciones')
      .insert({
        tenant_id: tenant.id,
        publicador_tercero_id: tercero,
        identidad_publica: 'Marta G.',
        tipo_id: tipoVenta,
        categoria_id: categoria,
        titulo: 'Bicicleta estática',
        precio: 300000,
      })
      .select('id')
      .single<{ id: string }>()
    await comoAdmin.from('publicaciones').update({ estado: 'publicada' }).eq('id', pub!.id)
    await comoAdmin.from('publicacion_interes').insert({
      tenant_id: tenant.id,
      publicacion_id: pub!.id,
      interesado_nombre: 'Vecino del 402',
      mensaje: '¿La entregan?',
    })

    // La notificación se emite por fn_notificar, el emisor único de EXS-2 —
    // `notificaciones` no admite insert directo a propósito.
    const { data: notiId, error: errorNoti } = await admin.rpc('fn_notificar', {
      p_tenant_id: tenant.id,
      p_modulo: 'marketplace',
      p_tipo_codigo: 'anuncio_publicado',
      p_prioridad: 'informativa',
      p_titulo: 'Nuevo interesado en una publicación',
      p_origen_modulo: 'marketplace',
      p_origen_entidad: 'publicacion',
      p_origen_evento: 'interes_registrado',
      p_origen_id: pub!.id,
    })
    if (errorNoti) throw new Error(`fn_notificar: ${errorNoti.message}`)

    // Marcarla leída no cambia que el interés siga sin atender.
    // `notificacion_lectura` es append-only por usuario: no lleva tenant_id
    // —lo hereda de la notificación— sino user_id.
    const { error: errorLectura } = await comoAdmin.from('notificacion_lectura').insert({
      notificacion_id: notiId,
      user_id: administrador.id,
    })
    expect(errorLectura).toBeNull()

    const interes = (await asuntos(comoAdmin)).filter(
      (a) => a.origen_entidad === 'publicacion_interes',
    )
    expect(interes.length).toBeGreaterThan(0)
    expect(interes[0]!.accion).toBe('Poner en contacto')
  }, 30_000)

  it('atender el interés sí lo saca de la bandeja', async () => {
    const antes = (await asuntos(comoAdmin)).filter(
      (a) => a.origen_entidad === 'publicacion_interes',
    )
    expect(antes.length).toBeGreaterThan(0)

    await comoAdmin
      .from('publicacion_interes')
      .update({ atendido: true })
      .eq('id', antes[0]!.origen_id)

    const despues = (await asuntos(comoAdmin)).filter((a) => a.origen_id === antes[0]!.origen_id)
    expect(despues).toHaveLength(0)
  }, 30_000)

  // ── Vencimientos y orden ──

  it('un permiso vehicular por vencer aparece con su fecha límite', async () => {
    const tipoVehiculo = await idListaTipos(admin, 'TIPO_VEHICULO', 'automovil')
    const tipoPermiso = await idListaTipos(admin, 'TIPO_PERMISO_VEHICULO', 'acceso')
    const { data: v } = await admin
      .from('vehiculos')
      .insert({ tenant_id: tenant.id, placa: 'ASU-101', tipo_id: tipoVehiculo })
      .select('id')
      .single<{ id: string }>()
    await admin.from('vehiculo_permiso').insert({
      tenant_id: tenant.id,
      vehiculo_id: v!.id,
      tipo_id: tipoPermiso,
      vigente_hasta: enDias(3),
    })

    const asunto = (await asuntos(comoAdmin)).find((a) => a.origen_modulo === 'movilidad')
    expect(asunto).toBeDefined()
    expect(asunto!.accion).toBe('Renovar')
    expect(asunto!.vence_at).not.toBeNull()
    // Deep link al vehículo concreto, no al módulo.
    expect(asunto!.enlace).toBe(`/movilidad?vehiculo=${v!.id}`)
  }, 30_000)

  it('un permiso que vence más allá de la ventana no es asunto todavía', async () => {
    const tipoVehiculo = await idListaTipos(admin, 'TIPO_VEHICULO', 'motocicleta')
    const tipoPermiso = await idListaTipos(admin, 'TIPO_PERMISO_VEHICULO', 'acceso')
    const { data: v } = await admin
      .from('vehiculos')
      .insert({ tenant_id: tenant.id, placa: 'ASU-202', tipo_id: tipoVehiculo })
      .select('id')
      .single<{ id: string }>()
    await admin.from('vehiculo_permiso').insert({
      tenant_id: tenant.id,
      vehiculo_id: v!.id,
      tipo_id: tipoPermiso,
      vigente_hasta: enDias(90),
    })

    const { data } = await comoAdmin.rpc('fn_mis_asuntos', { p_tenant_id: tenant.id })
    const todos = (data ?? []) as unknown as Asunto[]
    expect(todos.some((a) => a.enlace === `/movilidad?vehiculo=${v!.id}`)).toBe(false)

    // Pero con una ventana más ancha, sí.
    const { data: ancha } = await comoAdmin.rpc('fn_mis_asuntos', {
      p_tenant_id: tenant.id,
      p_dias_anticipacion: 120,
    })
    expect(
      ((ancha ?? []) as unknown as Asunto[]).some((a) => a.enlace === `/movilidad?vehiculo=${v!.id}`),
    ).toBe(true)
  }, 30_000)

  it('lo que vence antes va primero; lo que no vence, después', async () => {
    const lista = await asuntos(comoAdmin)
    const conFecha = lista.filter((a) => a.vence_at !== null)
    const sinFecha = lista.filter((a) => a.vence_at === null)

    expect(conFecha.length).toBeGreaterThan(0)

    // Los que tienen fecha están ordenados entre sí…
    const fechas = conFecha.map((a) => new Date(a.vence_at!).getTime())
    expect([...fechas].sort((x, y) => x - y)).toEqual(fechas)

    // …y todos preceden a los que no tienen plazo.
    if (sinFecha.length > 0) {
      expect(lista.indexOf(conFecha[conFecha.length - 1]!)).toBeLessThan(lista.indexOf(sinFecha[0]!))
    }
  }, 30_000)

  it('cada asunto conserva su dominio de origen y su enlace al contexto', async () => {
    const lista = await asuntos(comoAdmin)
    expect(lista.length).toBeGreaterThan(0)
    for (const a of lista) {
      expect(['anuncios', 'marketplace', 'movilidad', 'atencion']).toContain(a.origen_modulo)
      expect(a.origen_entidad.length).toBeGreaterThan(0)
      // Nunca el home pelado del módulo: siempre lleva id o parámetro.
      expect(a.enlace).toMatch(/[/?=]/)
      expect(a.enlace).not.toBe(`/${a.origen_modulo}`)
      expect(a.accion.length).toBeGreaterThan(0)
    }
  }, 30_000)

  it('la bandeja no cruza copropiedades', async () => {
    const otro = await crearTenant(admin, 'exs7-vecino')
    await crearMembership(admin, otro.id, administrador.id, 'administrador')
    const { data: terceroOtro } = await admin
      .from('terceros')
      .insert({
        tenant_id: otro.id,
        tipo_persona: 'natural',
        primer_nombre: 'Otro',
        primer_apellido: 'Vecino',
        numero_documento: '11111111',
        tipo_identificacion_id: await idListaTipos(admin, 'TIPO_IDENTIFICACION', 'cedula'),
        estado_id: await idListaTipos(admin, 'ESTADO_TERCERO', 'activo'),
      })
      .select('id')
      .single<{ id: string }>()
    const { data: pubOtro } = await admin
      .from('publicaciones')
      .insert({
        tenant_id: otro.id,
        publicador_tercero_id: terceroOtro!.id,
        identidad_publica: 'Otro vecino',
        tipo_id: tipoVenta,
        categoria_id: categoria,
        titulo: 'Algo de otra copropiedad',
        origen: 'residente',
        estado: 'pendiente_aprobacion',
      })
      .select('id')
      .single<{ id: string }>()

    const propios = await asuntos(comoAdmin)
    expect(propios.some((a) => a.origen_id === pubOtro!.id)).toBe(false)

    await eliminarTenant(admin, otro.id)
  }, 30_000)

  // ── asignado_a (20260933800000) ──
  //
  //  De las siete ramas solo Atención asigna dueño. Que las demás traigan
  //  null no es un hueco por rellenar: significa "le toca a quien pueda".
  //
  //  El fixture es más largo que los otros de este archivo porque
  //  `solicitudes` exige vocabulario propio del tenant, inmueble y
  //  consecutivo — es la tabla de GOB-8, no una del corte.

  async function crearSolicitud(asunto: string, asignadoA: string | null): Promise<void> {
    const vocabulario = async (familia: string, codigo: string): Promise<number> => {
      const { data, error } = await admin
        .from('lista_tipos')
        .insert({ tipo: familia, codigo, nombre: codigo, tenant_id: tenant.id })
        .select('id')
        .single<{ id: number }>()
      if (error) throw new Error(`fixture ${familia}.${codigo}: ${error.message}`)
      return data.id
    }
    // Códigos únicos por llamada: lista_tipos es único por (tenant, tipo, código).
    const sufijo = Math.random().toString(36).slice(2, 8)
    const tipoSolicitud = await vocabulario('TIPO_SOLICITUD', `peticion-${sufijo}`)
    const categoriaSolicitud = await vocabulario('CATEGORIA_SOLICITUD', `general-${sufijo}`)
    // solicitudes_clasificacion_completa exige origen y prioridad salvo en
    // los estados de triaje externo, que no son los de esta prueba.
    const origenSolicitud = await vocabulario('ORIGEN_SOLICITUD', `telefono-${sufijo}`)
    const prioridadSolicitud = await vocabulario('PRIORIDAD_SOLICITUD', `media-${sufijo}`)
    const tipoInmueble = await idListaTipos(admin, 'TIPO_INMUEBLE', 'apartamento')

    const { data: inmueble, error: errorInmueble } = await admin
      .from('inmuebles')
      .insert({ tenant_id: tenant.id, codigo: `A-${sufijo}`, tipo_id: tipoInmueble })
      .select('id')
      .single<{ id: string }>()
    if (errorInmueble) throw new Error(`fixture inmueble: ${errorInmueble.message}`)

    const { error } = await admin.from('solicitudes').insert({
      tenant_id: tenant.id,
      numero: Math.floor(Math.random() * 100000),
      anio: new Date().getUTCFullYear(),
      tipo_id: tipoSolicitud,
      categoria_id: categoriaSolicitud,
      solicitante_ref: tercero,
      inmueble_id: inmueble.id,
      calidad: 'propietario',
      origen_id: origenSolicitud,
      prioridad_id: prioridadSolicitud,
      asunto,
      asignado_a: asignadoA,
    })
    if (error) throw new Error(`fixture solicitud: ${error.message}`)
  }

  it('la bandeja distingue lo asignado de lo que le toca a cualquiera', async () => {
    await crearSolicitud('Sin dueño todavía', null)
    await crearSolicitud('La lleva el administrador', administrador.id)

    const filas = await asuntos(comoAdmin)
    const sinDueno = filas.find((a) => a.titulo === 'Sin dueño todavía')
    const conDueno = filas.find((a) => a.titulo === 'La lleva el administrador')

    expect(sinDueno, 'la solicitud sin asignar debería estar en la bandeja').toBeDefined()
    expect(conDueno, 'la solicitud asignada debería estar en la bandeja').toBeDefined()
    expect(sinDueno!.asignado_a).toBeNull()
    expect(conDueno!.asignado_a).toBe(administrador.id)
  }, 60_000)

  it('las ramas que no asignan dueño devuelven null, y eso es lo correcto', async () => {
    const filas = await asuntos(comoAdmin)
    const ajenasAAtencion = filas.filter((a) => a.origen_modulo !== 'atencion')
    expect(ajenasAAtencion.length).toBeGreaterThan(0)
    // Ninguna otra rama inventa un dueño: aprobar un anuncio le toca a
    // cualquier administrador, no a uno nominado.
    expect(ajenasAAtencion.every((a) => a.asignado_a === null)).toBe(true)
  }, 30_000)
})
