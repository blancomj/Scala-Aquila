/**
 * EXS-4 — directorio: publicación deliberada, PII mínima y ubicación viva.
 *
 * Lo que defiende:
 *
 *  1. existir en `terceros` NO es aparecer en el directorio;
 *  2. una ficha publicada no expone documento, email ni teléfono
 *     administrativos — solo el contacto que el negocio aceptó publicar;
 *  3. la ubicación se deriva de la relación vigente, así que mudarse de
 *     local actualiza la ficha sin tocarla;
 *  4. el perfil es uno solo: el mismo tercero no puede tener dos.
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

interface FichaDirectorio {
  tercero_id: string
  nombre_comercial: string | null
  categoria_codigo: string | null
  contacto_publico: string | null
  ubicaciones: string[]
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

d('EXS-4: directorio de la copropiedad', () => {
  const admin = clienteAdmin(env!)

  let tenant: TenantPrueba
  let usuario: UsuarioPrueba
  let cliente: Cliente
  let terceroComercio: string
  let terceroPrivado: string
  let categoriaId: number

  beforeAll(async () => {
    tenant = await crearTenant(admin, 'exs4')
    usuario = await crearUsuario(admin, 'exs4-u')
    await crearMembership(admin, tenant.id, usuario.id, 'administrador')
    cliente = await clienteComo(env!, usuario)

    categoriaId = await idListaTipos(admin, 'CATEGORIA_COMERCIO', 'alimentacion')
    const tipoIdent = await idListaTipos(admin, 'TIPO_IDENTIFICACION', 'nit')
    const estadoTercero = await idListaTipos(admin, 'ESTADO_TERCERO', 'activo')

    const { data: t1, error: e1 } = await admin
      .from('terceros')
      .insert({
        tenant_id: tenant.id,
        tipo_persona: 'juridica',
        razon_social: 'Panadería La Espiga SAS',
        numero_documento: '900123456',
        tipo_identificacion_id: tipoIdent,
        estado_id: estadoTercero,
        email: 'privado@laespiga.test',
        telefono: '3001112233',
        direccion: 'Calle Falsa 123',
      })
      .select('id')
      .single<{ id: string }>()
    if (e1) throw new Error(`fixture comercio: ${e1.message}`)
    terceroComercio = t1.id

    const { data: t2, error: e2 } = await admin
      .from('terceros')
      .insert({
        tenant_id: tenant.id,
        tipo_persona: 'natural',
        primer_nombre: 'Ana',
        primer_apellido: 'Ruiz',
        numero_documento: '52123456',
        tipo_identificacion_id: tipoIdent,
        estado_id: estadoTercero,
      })
      .select('id')
      .single<{ id: string }>()
    if (e2) throw new Error(`fixture persona: ${e2.message}`)
    terceroPrivado = t2.id
  }, 60_000)

  afterAll(async () => {
    await eliminarUsuario(admin, usuario.id)
    await eliminarTenant(admin, tenant.id)
  })

  it('un tercero sin perfil no aparece: existir no es publicar', async () => {
    const { data, error } = await cliente.rpc('fn_directorio_listar', { p_tenant_id: tenant.id })
    expect(error).toBeNull()
    const ids = ((data ?? []) as FichaDirectorio[]).map((f) => f.tercero_id)
    expect(ids).not.toContain(terceroComercio)
    expect(ids).not.toContain(terceroPrivado)
  }, 30_000)

  it('un perfil creado pero sin publicar tampoco aparece', async () => {
    const { error } = await admin.from('tercero_perfil').insert({
      tenant_id: tenant.id,
      tercero_id: terceroComercio,
      nombre_comercial: 'Panadería La Espiga',
      categoria_comercio_id: categoriaId,
      descripcion: 'Pan artesanal y café.',
      horario: 'Lunes a sábado, 6:00 a.m. – 8:00 p.m.',
      contacto_publico: '3009998877',
    })
    expect(error).toBeNull()

    const { data } = await cliente.rpc('fn_directorio_listar', { p_tenant_id: tenant.id })
    expect((data ?? []) as FichaDirectorio[]).toHaveLength(0)
  }, 30_000)

  it('publicar sin nombre comercial se rechaza', async () => {
    const { error } = await admin
      .from('tercero_perfil')
      .update({ nombre_comercial: null, publicado: true })
      .eq('tercero_id', terceroComercio)
    expect(error?.message).toContain('PERFIL_PUBLICADO_SIN_NOMBRE')
  }, 30_000)

  it('al publicar aparece, y queda sellado cuándo', async () => {
    const { error } = await admin
      .from('tercero_perfil')
      .update({ publicado: true })
      .eq('tercero_id', terceroComercio)
    expect(error).toBeNull()

    const { data } = await cliente.rpc('fn_directorio_listar', { p_tenant_id: tenant.id })
    const fichas = (data ?? []) as FichaDirectorio[]
    expect(fichas).toHaveLength(1)
    expect(fichas[0]!.nombre_comercial).toBe('Panadería La Espiga')
    expect(fichas[0]!.categoria_codigo).toBe('alimentacion')

    const { data: perfil } = await admin
      .from('tercero_perfil')
      .select('publicado_at')
      .eq('tercero_id', terceroComercio)
      .single<{ publicado_at: string | null }>()
    expect(perfil!.publicado_at).not.toBeNull()
  }, 30_000)

  it('la ficha NO expone documento, email ni teléfono administrativos', async () => {
    const { data } = await cliente.rpc('fn_directorio_listar', { p_tenant_id: tenant.id })
    const ficha = ((data ?? []) as FichaDirectorio[])[0]!
    const serializada = JSON.stringify(ficha)

    // Los tres datos existen en terceros y ninguno debe haber salido.
    expect(serializada).not.toContain('900123456')
    expect(serializada).not.toContain('privado@laespiga.test')
    expect(serializada).not.toContain('3001112233')
    expect(serializada).not.toContain('Calle Falsa 123')
    // El que sí aceptó publicar, sí.
    expect(ficha.contacto_publico).toBe('3009998877')
  }, 30_000)

  it('despublicar la saca del directorio y borra el sello', async () => {
    await admin.from('tercero_perfil').update({ publicado: false }).eq('tercero_id', terceroComercio)

    const { data } = await cliente.rpc('fn_directorio_listar', { p_tenant_id: tenant.id })
    expect((data ?? []) as FichaDirectorio[]).toHaveLength(0)

    const { data: perfil } = await admin
      .from('tercero_perfil')
      .select('publicado_at, publicado_por')
      .eq('tercero_id', terceroComercio)
      .single<{ publicado_at: string | null; publicado_por: string | null }>()
    expect(perfil!.publicado_at).toBeNull()
    expect(perfil!.publicado_por).toBeNull()

    await admin.from('tercero_perfil').update({ publicado: true }).eq('tercero_id', terceroComercio)
  }, 30_000)

  it('la ubicación se deriva de la relación vigente, no se copia', async () => {
    const tipoInmueble = await idListaTipos(admin, 'TIPO_INMUEBLE', 'local')
    const rolPredio = await idListaTipos(admin, 'PERSONA_PREDIO', 'copropietario')

    const { data: inm, error: errInm } = await admin
      .from('inmuebles')
      .insert({ tenant_id: tenant.id, codigo: 'LOCAL-12', tipo_id: tipoInmueble })
      .select('id')
      .single<{ id: string }>()
    if (errInm) throw new Error(`fixture inmueble: ${errInm.message}`)

    // Antes de la relación, la ficha no tiene ubicación.
    const { data: antes } = await cliente.rpc('fn_directorio_listar', { p_tenant_id: tenant.id })
    expect(((antes ?? []) as FichaDirectorio[])[0]!.ubicaciones).toEqual([])

    const { error: errRel } = await admin.from('inmueble_persona_rol').insert({
      tenant_id: tenant.id,
      inmueble_id: inm.id,
      tercero_id: terceroComercio,
      rol_id: rolPredio,
      vigente_desde: new Date().toISOString().slice(0, 10),
    })
    if (errRel) throw new Error(`fixture relación: ${errRel.message}`)

    // Sin tocar el perfil, la ficha ya sabe dónde está.
    const { data: despues } = await cliente.rpc('fn_directorio_listar', { p_tenant_id: tenant.id })
    expect(((despues ?? []) as FichaDirectorio[])[0]!.ubicaciones).toEqual(['LOCAL-12'])
  }, 30_000)

  it('filtra por categoría y busca sin acentos', async () => {
    const otraCategoria = await idListaTipos(admin, 'CATEGORIA_COMERCIO', 'transporte')

    const { data: conCategoria } = await cliente.rpc('fn_directorio_listar', {
      p_tenant_id: tenant.id,
      p_categoria: categoriaId,
    })
    expect((conCategoria ?? []) as FichaDirectorio[]).toHaveLength(1)

    const { data: otra } = await cliente.rpc('fn_directorio_listar', {
      p_tenant_id: tenant.id,
      p_categoria: otraCategoria,
    })
    expect((otra ?? []) as FichaDirectorio[]).toHaveLength(0)

    // "panaderia" sin tilde debe encontrar "Panadería".
    const { data: texto } = await cliente.rpc('fn_directorio_listar', {
      p_tenant_id: tenant.id,
      p_texto: 'panaderia',
    })
    expect((texto ?? []) as FichaDirectorio[]).toHaveLength(1)
  }, 30_000)

  it('un tercero no puede tener dos perfiles', async () => {
    const { error } = await admin.from('tercero_perfil').insert({
      tenant_id: tenant.id,
      tercero_id: terceroComercio,
      nombre_comercial: 'Perfil duplicado',
    })
    expect(error).not.toBeNull()
  }, 30_000)

  it('el perfil no puede apuntar a un tercero de otro tenant', async () => {
    const otro = await crearTenant(admin, 'exs4-otro')
    const { error } = await admin.from('tercero_perfil').insert({
      tenant_id: otro.id,
      tercero_id: terceroComercio,
      nombre_comercial: 'Robado',
    })
    expect(error?.message).toContain('PROVEEDOR_TENANT_INCONSISTENTE')
    await eliminarTenant(admin, otro.id)
  }, 30_000)

  it('una categoría de la familia equivocada se rechaza', async () => {
    const categoriaActivo = await idListaTipos(admin, 'CATEGORIA_ACTIVO', 'hidraulico')
    const { error } = await admin
      .from('tercero_perfil')
      .update({ categoria_comercio_id: categoriaActivo })
      .eq('tercero_id', terceroComercio)
    expect(error?.message).toContain('PERFIL_CATEGORIA_COMERCIO_INVALIDA')
  }, 30_000)

  it('no hay directorio para quien no es miembro de la copropiedad', async () => {
    const otro = await crearTenant(admin, 'exs4-ajeno')
    const { error } = await cliente.rpc('fn_directorio_listar', { p_tenant_id: otro.id })
    expect(error?.message).toContain('DIRECTORIO_NO_DISPONIBLE')
    await eliminarTenant(admin, otro.id)
  }, 30_000)
})
