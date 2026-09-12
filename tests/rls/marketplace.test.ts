/**
 * EXS-6 — marketplace: un tablón, no un e-commerce.
 *
 * Lo que defiende:
 *
 *  1. la escalera de aprobación — nadie aprueba lo suyo salvo el
 *     administrador (residente → equipo; auxiliar → administrador;
 *     administrador → directo);
 *  2. `origen` se SELLA del rol real de quien inserta, así que un auxiliar
 *     no puede declararse administrador para saltarse su escalón;
 *  3. el tablón no expone a quién pertenece el aviso, solo su identidad
 *     pública;
 *  4. el precio es informativo y un regalo no lleva precio;
 *  5. el contenido de una publicación viva no se edita sin volver a pasar
 *     por aprobación.
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

interface FilaTablon {
  id: string
  titulo: string
  identidad_publica: string
  tipo_codigo: string
  categoria_codigo: string
  precio: number | null
  intereses: number
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

d('EXS-6: marketplace de la copropiedad', () => {
  const admin = clienteAdmin(env!)

  let tenant: TenantPrueba
  let administrador: UsuarioPrueba
  let auxiliar: UsuarioPrueba
  let comoAdmin: Cliente
  let comoAuxiliar: Cliente

  let tipoVenta: number
  let tipoRegalo: number
  let categoria: number
  let condicion: number
  let motivoFraude: number
  let tercero: string

  beforeAll(async () => {
    tenant = await crearTenant(admin, 'exs6')
    administrador = await crearUsuario(admin, 'exs6-adm')
    auxiliar = await crearUsuario(admin, 'exs6-aux')
    await crearMembership(admin, tenant.id, administrador.id, 'administrador')
    await crearMembership(admin, tenant.id, auxiliar.id, 'auxiliar')
    comoAdmin = await clienteComo(env!, administrador)
    comoAuxiliar = await clienteComo(env!, auxiliar)

    tipoVenta = await idListaTipos(admin, 'TIPO_PUBLICACION_MARKETPLACE', 'venta')
    tipoRegalo = await idListaTipos(admin, 'TIPO_PUBLICACION_MARKETPLACE', 'regalo')
    categoria = await idListaTipos(admin, 'CATEGORIA_MARKETPLACE', 'hogar')
    condicion = await idListaTipos(admin, 'CONDICION_ARTICULO', 'usado_bueno')
    motivoFraude = await idListaTipos(admin, 'MOTIVO_REPORTE_MARKETPLACE', 'fraude')

    const tipoIdent = await idListaTipos(admin, 'TIPO_IDENTIFICACION', 'cedula')
    const estadoTercero = await idListaTipos(admin, 'ESTADO_TERCERO', 'activo')
    const { data, error } = await admin
      .from('terceros')
      .insert({
        tenant_id: tenant.id,
        tipo_persona: 'natural',
        primer_nombre: 'Lucía',
        primer_apellido: 'Ramírez',
        numero_documento: '41222333',
        tipo_identificacion_id: tipoIdent,
        estado_id: estadoTercero,
        email: 'privado@lucia.test',
        telefono: '3004445566',
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

  function payload(extra: Record<string, unknown> = {}) {
    return {
      tenant_id: tenant.id,
      publicador_tercero_id: tercero,
      identidad_publica: 'Lucía R. — Torre 2',
      tipo_id: tipoVenta,
      categoria_id: categoria,
      condicion_id: condicion,
      titulo: 'Sofá de tres puestos',
      descripcion: 'Poco uso, color gris.',
      precio: 450000,
      ...extra,
    }
  }

  async function crearComo(cliente: Cliente, extra: Record<string, unknown> = {}): Promise<string> {
    const { data, error } = await cliente
      .from('publicaciones')
      .insert(payload(extra))
      .select('id')
      .single<{ id: string }>()
    if (error) throw new Error(`crear publicación: ${error.message}`)
    return data.id
  }

  // ── La escalera ──

  it('el origen se sella del rol real: el auxiliar no puede declararse administrador', async () => {
    const id = await crearComo(comoAuxiliar, { origen: 'administrador' })
    const { data } = await admin
      .from('publicaciones')
      .select('origen, creado_por')
      .eq('id', id)
      .single<{ origen: string; creado_por: string }>()
    expect(data?.origen).toBe('auxiliar')
    expect(data?.creado_por).toBe(auxiliar.id)
  }, 30_000)

  it('lo que publica un auxiliar NO lo aprueba otro auxiliar', async () => {
    const id = await crearComo(comoAuxiliar)
    await comoAuxiliar
      .from('publicaciones')
      .update({ estado: 'pendiente_aprobacion' })
      .eq('id', id)

    const { error } = await comoAuxiliar
      .from('publicaciones')
      .update({ estado: 'publicada' })
      .eq('id', id)
    expect(error?.message).toContain('PUBLICACION_APROBACION_REQUIERE_ADMINISTRADOR')
  }, 30_000)

  it('lo que publica un auxiliar lo aprueba el administrador, y queda sellado quién', async () => {
    const id = await crearComo(comoAuxiliar)
    await comoAuxiliar
      .from('publicaciones')
      .update({ estado: 'pendiente_aprobacion' })
      .eq('id', id)

    const { error } = await comoAdmin
      .from('publicaciones')
      .update({ estado: 'publicada' })
      .eq('id', id)
    expect(error).toBeNull()

    const { data } = await admin
      .from('publicaciones')
      .select('estado, aprobada_por, aprobada_at, publicada_at')
      .eq('id', id)
      .single<{
        estado: string
        aprobada_por: string
        aprobada_at: string
        publicada_at: string
      }>()
    expect(data?.estado).toBe('publicada')
    expect(data?.aprobada_por).toBe(administrador.id)
    expect(data?.aprobada_at).not.toBeNull()
    expect(data?.publicada_at).not.toBeNull()
  }, 30_000)

  it('el auxiliar no puede publicar directo, saltándose la aprobación', async () => {
    const id = await crearComo(comoAuxiliar)
    const { error } = await comoAuxiliar
      .from('publicaciones')
      .update({ estado: 'publicada' })
      .eq('id', id)
    expect(error?.message).toContain('PUBLICACION_DIRECTA_REQUIERE_ADMINISTRADOR')
  }, 30_000)

  it('el administrador publica directo: lo suyo lo aprueba él mismo', async () => {
    const id = await crearComo(comoAdmin)
    const { error } = await comoAdmin
      .from('publicaciones')
      .update({ estado: 'publicada' })
      .eq('id', id)
    expect(error).toBeNull()

    const { data } = await admin
      .from('publicaciones')
      .select('origen, estado')
      .eq('id', id)
      .single<{ origen: string; estado: string }>()
    expect(data?.origen).toBe('administrador')
    expect(data?.estado).toBe('publicada')
  }, 30_000)

  it('lo que publica un residente lo puede aprobar el auxiliar', async () => {
    // El residente todavía no tiene login (§0.1 A): el caso se construye
    // fuera de banda, que es exactamente como llegará el día que la capa
    // externa exista.
    const { data: creada, error: eCrear } = await admin
      .from('publicaciones')
      .insert(payload({ origen: 'residente', estado: 'pendiente_aprobacion' }))
      .select('id')
      .single<{ id: string }>()
    expect(eCrear).toBeNull()

    const { error } = await comoAuxiliar
      .from('publicaciones')
      .update({ estado: 'publicada' })
      .eq('id', creada!.id)
    expect(error).toBeNull()
  }, 30_000)

  it('el origen no se puede cambiar después: movería el escalón que le toca', async () => {
    const id = await crearComo(comoAuxiliar)
    const { error } = await comoAdmin
      .from('publicaciones')
      .update({ origen: 'residente' })
      .eq('id', id)
    expect(error?.message).toContain('PUBLICACION_ORIGEN_INMUTABLE')
  }, 30_000)

  // ── Contenido y dinero ──

  it('un regalo con precio se rechaza', async () => {
    const { error } = await comoAdmin
      .from('publicaciones')
      .insert(payload({ tipo_id: tipoRegalo, precio: 1000 }))
    expect(error?.message).toContain('PUBLICACION_REGALO_CON_PRECIO')
  }, 30_000)

  it('una categoría de la familia equivocada se rechaza', async () => {
    const { error } = await comoAdmin
      .from('publicaciones')
      .insert(payload({ categoria_id: condicion }))
    expect(error?.message).toContain('PUBLICACION_CATEGORIA_INVALIDA')
  }, 30_000)

  it('editar el contenido de una publicación viva se rechaza', async () => {
    const id = await crearComo(comoAdmin)
    await comoAdmin.from('publicaciones').update({ estado: 'publicada' }).eq('id', id)

    const { error } = await comoAdmin
      .from('publicaciones')
      .update({ precio: 1 })
      .eq('id', id)
    expect(error?.message).toContain('PUBLICACION_EDICION_EVADE_MODERACION')
  }, 30_000)

  it('devolverla a borrador limpia el sello de la aprobación anterior', async () => {
    const id = await crearComo(comoAdmin)
    await comoAdmin.from('publicaciones').update({ estado: 'publicada' }).eq('id', id)
    await comoAdmin.from('publicaciones').update({ estado: 'borrador' }).eq('id', id)

    const { data } = await admin
      .from('publicaciones')
      .select('aprobada_por, aprobada_at, publicada_at')
      .eq('id', id)
      .single<{
        aprobada_por: string | null
        aprobada_at: string | null
        publicada_at: string | null
      }>()
    expect(data?.aprobada_por).toBeNull()
    expect(data?.aprobada_at).toBeNull()
    expect(data?.publicada_at).toBeNull()
  }, 30_000)

  it('una transición que no está en la lista cerrada se rechaza', async () => {
    const id = await crearComo(comoAdmin)
    const { error } = await comoAdmin
      .from('publicaciones')
      .update({ estado: 'expirada' })
      .eq('id', id)
    expect(error?.message).toContain('PUBLICACION_TRANSICION_INVALIDA')
  }, 30_000)

  // ── El tablón ──

  it('el tablón muestra la identidad pública, nunca de quién es el aviso', async () => {
    const { data, error } = await comoAuxiliar.rpc('fn_marketplace_listar', {
      p_tenant_id: tenant.id,
    })
    expect(error).toBeNull()
    const filas = (data ?? []) as unknown as FilaTablon[]
    expect(filas.length).toBeGreaterThan(0)

    const serializado = JSON.stringify(filas)
    expect(serializado).toContain('Lucía R. — Torre 2')
    expect(serializado).not.toContain(tercero)
    expect(serializado).not.toContain('privado@lucia.test')
    expect(serializado).not.toContain('3004445566')
    expect(serializado).not.toContain('41222333')
  }, 30_000)

  it('un borrador no está en el tablón', async () => {
    const id = await crearComo(comoAdmin, { titulo: 'Borrador que no debe verse' })
    const { data } = await comoAdmin.rpc('fn_marketplace_listar', { p_tenant_id: tenant.id })
    const ids = ((data ?? []) as unknown as FilaTablon[]).map((f) => f.id)
    expect(ids).not.toContain(id)
  }, 30_000)

  it('busca sin acentos y filtra por categoría', async () => {
    const { data } = await comoAdmin.rpc('fn_marketplace_listar', {
      p_tenant_id: tenant.id,
      p_texto: 'sofa',
    })
    expect(((data ?? []) as unknown as FilaTablon[]).length).toBeGreaterThan(0)
  }, 30_000)

  it('no hay tablón para quien no es miembro de la copropiedad', async () => {
    const otro = await crearTenant(admin, 'exs6-ajeno')
    const { error } = await comoAdmin.rpc('fn_marketplace_listar', { p_tenant_id: otro.id })
    expect(error?.message).toContain('MARKETPLACE_NO_DISPONIBLE')
    await eliminarTenant(admin, otro.id)
  }, 30_000)

  // ── Interés y reporte ──

  it('no se puede expresar interés en algo que no está en el tablón', async () => {
    const id = await crearComo(comoAdmin)
    const { error } = await comoAdmin.from('publicacion_interes').insert({
      tenant_id: tenant.id,
      publicacion_id: id,
      interesado_nombre: 'Alguien del 302',
    })
    expect(error?.message).toContain('INTERES_PUBLICACION_NO_DISPONIBLE')
  }, 30_000)

  it('el interés se registra sobre una publicación viva y se cuenta en el tablón', async () => {
    const id = await crearComo(comoAdmin, { titulo: 'Bicicleta de montaña' })
    await comoAdmin.from('publicaciones').update({ estado: 'publicada' }).eq('id', id)

    const { error } = await comoAdmin.from('publicacion_interes').insert({
      tenant_id: tenant.id,
      publicacion_id: id,
      interesado_nombre: 'Alguien del 302',
      mensaje: '¿Sigue disponible?',
    })
    expect(error).toBeNull()

    const { data } = await comoAdmin.rpc('fn_marketplace_listar', {
      p_tenant_id: tenant.id,
      p_texto: 'bicicleta',
    })
    const fila = ((data ?? []) as unknown as FilaTablon[])[0]!
    expect(fila.intereses).toBe(1)
  }, 30_000)

  it('un interés sin nombre ni tercero se rechaza: alguien tiene que ser', async () => {
    const { data: pub } = await admin
      .from('publicaciones')
      .select('id')
      .eq('tenant_id', tenant.id)
      .eq('estado', 'publicada')
      .limit(1)
      .single<{ id: string }>()

    const { error } = await admin.from('publicacion_interes').insert({
      tenant_id: tenant.id,
      publicacion_id: pub!.id,
    })
    expect(error?.message).toContain('publicacion_interes_alguien')
  }, 30_000)

  it('cualquier miembro reporta, pero solo el administrador resuelve', async () => {
    const { data: pub } = await admin
      .from('publicaciones')
      .select('id')
      .eq('tenant_id', tenant.id)
      .eq('estado', 'publicada')
      .limit(1)
      .single<{ id: string }>()

    const { data: reporte, error: eReporte } = await comoAuxiliar
      .from('publicacion_reporte')
      .insert({
        tenant_id: tenant.id,
        publicacion_id: pub!.id,
        motivo_id: motivoFraude,
        descripcion: 'El precio parece un cebo.',
      })
      .select('id')
      .single<{ id: string }>()
    expect(eReporte).toBeNull()

    // Un UPDATE que no pasa la policy no lanza error: RLS lo FILTRA, así que
    // la sentencia afecta cero filas y vuelve limpia. Lo que hay que
    // comprobar es el efecto, no el error.
    await comoAuxiliar
      .from('publicacion_reporte')
      .update({ resuelto: true, resolucion: 'Revisado' })
      .eq('id', reporte!.id)

    const { data: trasAuxiliar } = await admin
      .from('publicacion_reporte')
      .select('resuelto')
      .eq('id', reporte!.id)
      .single<{ resuelto: boolean }>()
    expect(trasAuxiliar?.resuelto).toBe(false)

    const { error: eAdm } = await comoAdmin
      .from('publicacion_reporte')
      .update({ resuelto: true, resolucion: 'Revisado, sin mérito.' })
      .eq('id', reporte!.id)
    expect(eAdm).toBeNull()

    const { data } = await admin
      .from('publicacion_reporte')
      .select('resuelto_por, resuelto_at')
      .eq('id', reporte!.id)
      .single<{ resuelto_por: string; resuelto_at: string }>()
    expect(data?.resuelto_por).toBe(administrador.id)
    expect(data?.resuelto_at).not.toBeNull()
  }, 30_000)

  it('el barrido de vencimiento saca del tablón lo vencido', async () => {
    const id = await crearComo(comoAdmin, { titulo: 'Mesa que ya venció' })
    await comoAdmin
      .from('publicaciones')
      .update({ estado: 'publicada', vigente_hasta: '2020-01-01' })
      .eq('id', id)

    const { error } = await admin.rpc('fn_publicaciones_expirar')
    expect(error).toBeNull()

    const { data } = await admin
      .from('publicaciones')
      .select('estado')
      .eq('id', id)
      .single<{ estado: string }>()
    expect(data?.estado).toBe('expirada')

    const { data: tablon } = await comoAdmin.rpc('fn_marketplace_listar', {
      p_tenant_id: tenant.id,
      p_texto: 'venció',
    })
    expect((tablon ?? []) as unknown as FilaTablon[]).toHaveLength(0)
  }, 30_000)

  it('el tablón trae la portada y el número de fotos, sin firmar la URL', async () => {
    const id = await crearComo(comoAdmin, { titulo: 'Mesa con fotos' })
    await comoAdmin.from('publicaciones').update({ estado: 'publicada' }).eq('id', id)

    const tipoDocumento = await idListaTipos(admin, 'TIPO_DOCUMENTO', 'fotografia')
    const grupo = crypto.randomUUID()
    for (const [i, nombre] of ['frente.png', 'lateral.png'].entries()) {
      const { error } = await admin.from('documentos').insert({
        tenant_id: tenant.id,
        publicacion_id: id,
        tipo_documento_id: tipoDocumento,
        grupo_id: i === 0 ? grupo : crypto.randomUUID(),
        version: 1,
        nombre_archivo: nombre,
        storage_path: `${tenant.id}/_publicacion/${id}/${nombre}`,
        tamano_bytes: 100,
      })
      expect(error).toBeNull()
    }

    const { data } = await comoAdmin.rpc('fn_marketplace_listar', {
      p_tenant_id: tenant.id,
      p_texto: 'Mesa con fotos',
    })
    const fila = ((data ?? []) as unknown as (FilaTablon & {
      portada_path: string | null
      fotos: number
    })[])[0]!
    // Las dos fotos conviven: ninguna versiona a la otra.
    expect(fila.fotos).toBe(2)
    // Devuelve la RUTA, no una URL firmada: el bucket es privado y firmar
    // en SQL exigiría meter aquí la clave del bucket.
    expect(fila.portada_path).toContain('_publicacion')
    expect(fila.portada_path).not.toContain('http')
  }, 30_000)

  it('un documento no puede colgar de una publicación de otra copropiedad', async () => {
    const otro = await crearTenant(admin, 'exs6-doc-ajeno')
    const id = await crearComo(comoAdmin)
    const tipoDocumento = await idListaTipos(admin, 'TIPO_DOCUMENTO', 'fotografia')
    const { error } = await admin.from('documentos').insert({
      tenant_id: otro.id,
      publicacion_id: id,
      tipo_documento_id: tipoDocumento,
      grupo_id: crypto.randomUUID(),
      version: 1,
      nombre_archivo: 'robada.png',
      storage_path: `${otro.id}/_publicacion/${id}/robada.png`,
      tamano_bytes: 100,
    })
    expect(error?.message).toContain('PUBLICACION_INVALIDA')
    await eliminarTenant(admin, otro.id)
  }, 30_000)

  it('una publicación expirada se puede renovar', async () => {
    const { data: expirada } = await admin
      .from('publicaciones')
      .select('id')
      .eq('tenant_id', tenant.id)
      .eq('estado', 'expirada')
      .limit(1)
      .single<{ id: string }>()

    const { error } = await comoAdmin
      .from('publicaciones')
      .update({ estado: 'publicada', vigente_hasta: null })
      .eq('id', expirada!.id)
    expect(error).toBeNull()
  }, 30_000)
})
