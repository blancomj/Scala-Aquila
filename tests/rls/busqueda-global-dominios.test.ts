/**
 * fn_buscar_global — cinco categorías nuevas de 20260934020000_busqueda_global_nuevos_dominios.sql:
 * anuncio, vehiculo, organo_gobierno, reunion_gobierno, solicitud. Pedido del usuario tras notar
 * que la búsqueda general (Ctrl+K) no cubría casi nada de lo construido en las series recientes.
 *
 * Las otras cuatro categorías del mismo corte (decision_gobierno, orden_trabajo,
 * hallazgo_mantenimiento, accion_cobranza) se prueban dentro de la suite dueña de cada entidad
 * — decisiones.test.ts, ot-incidencias.test.ts, inspecciones-hallazgos.test.ts,
 * cartera-cobranza-aprobacion.test.ts — reutilizando sus fixtures reales en vez de
 * reconstruirlas aquí desde cero.
 */
import { afterAll, describe, expect, it } from 'vitest'
import 'dotenv/config'
import {
  clienteAdmin,
  clienteComo,
  crearMembership,
  crearTenant,
  crearUsuario,
  eliminarTenant,
  eliminarUsuario,
  leerEntorno,
  RUN_ID,
  type Cliente,
  type UsuarioPrueba,
} from './helpers.js'

const env = leerEntorno()
const d = env ? describe : describe.skip

if (!env) {
  console.warn('SALTADO tests/rls/busqueda-global-dominios: faltan variables de Supabase en .env')
}

interface FilaBusqueda {
  categoria: string
  entidad_id: string
  titulo: string
  subtitulo: string
  inmueble_id: string | null
  rank: number
}

d('fn_buscar_global — anuncio/vehiculo/organo_gobierno/reunion_gobierno/solicitud', () => {
  const admin = clienteAdmin(env!)
  const tenantsCreados: string[] = []
  const usuariosCreados: UsuarioPrueba[] = []

  afterAll(async () => {
    for (const id of tenantsCreados) await eliminarTenant(admin, id)
    for (const usuario of usuariosCreados) await eliminarUsuario(admin, usuario.id)
  }, 60_000)

  async function idListaTipos(tipo: string, codigo: string): Promise<number> {
    const { data, error } = await admin
      .from('lista_tipos').select('id').eq('tipo', tipo).eq('codigo', codigo).is('tenant_id', null)
      .single<{ id: number }>()
    if (error) throw new Error(`fixture lista_tipos ${tipo}.${codigo}: ${error.message}`)
    return data.id
  }

  async function crearVocabularioSolicitud(
    tenantId: string, familia: 'TIPO_SOLICITUD' | 'CATEGORIA_SOLICITUD' | 'ORIGEN_SOLICITUD' | 'PRIORIDAD_SOLICITUD',
    codigo: string, nombre: string,
  ): Promise<number> {
    const { data, error } = await admin
      .from('lista_tipos').insert({ tipo: familia, codigo, nombre, tenant_id: tenantId }).select('id').single<{ id: number }>()
    if (error) throw new Error(`fixture vocabulario ${familia}.${codigo}: ${error.message}`)
    return data.id
  }

  async function crearTenantCompleto(etiqueta: string): Promise<{ tenantId: string; cliente: Cliente }> {
    const usuario = await crearUsuario(admin, etiqueta)
    usuariosCreados.push(usuario)
    const tenant = await crearTenant(admin, etiqueta, usuario.id)
    tenantsCreados.push(tenant.id)
    await crearMembership(admin, tenant.id, usuario.id, 'administrador')
    const cliente = await clienteComo(env!, usuario)
    return { tenantId: tenant.id, cliente }
  }

  async function crearInmueble(tenantId: string, codigo: string): Promise<string> {
    const tipoId = await idListaTipos('TIPO_INMUEBLE', 'apartamento')
    const { data, error } = await admin
      .from('inmuebles').insert({ tenant_id: tenantId, codigo, tipo_id: tipoId }).select('id').single<{ id: string }>()
    if (error) throw new Error(`fixture inmueble ${codigo}: ${error.message}`)
    return data.id
  }

  async function crearTercero(tenantId: string, primerNombre: string, primerApellido: string): Promise<string> {
    const sello = `${RUN_ID}-${String(Date.now())}-${Math.random().toString(36).slice(2, 6)}`
    const tipoIdentId = await idListaTipos('TIPO_IDENTIFICACION', 'cedula')
    const estadoActivoId = await idListaTipos('ESTADO_TERCERO', 'activo')
    const { data, error } = await admin
      .from('terceros')
      .insert({
        tenant_id: tenantId, tipo_persona: 'natural', tipo_identificacion_id: tipoIdentId,
        numero_documento: sello, primer_nombre: primerNombre, primer_apellido: primerApellido,
        estado_id: estadoActivoId,
      })
      .select('id').single<{ id: string }>()
    if (error) throw new Error(`fixture tercero ${primerNombre} ${primerApellido}: ${error.message}`)
    return data.id
  }

  async function buscar(tenantId: string, query: string, categoria?: string) {
    const { data, error } = await admin.rpc('fn_buscar_global', {
      p_tenant_id: tenantId, p_query: query, p_limite: 20,
      ...(categoria !== undefined && { p_categoria: categoria }),
    })
    if (error) throw new Error(`fn_buscar_global: ${error.message}`)
    return data as FilaBusqueda[]
  }

  it('encuentra anuncio/vehiculo/organo_gobierno/reunion_gobierno/solicitud, con subtítulo resuelto', async () => {
    const sello = String(Date.now())
    const { tenantId } = await crearTenantCompleto('bgd')

    // ── anuncio ──
    const categoriaAnuncioId = await idListaTipos('CATEGORIA_ANUNCIO', 'seguridad')
    const prioridadAnuncioId = await idListaTipos('PRIORIDAD_ANUNCIO', 'urgente')
    const { data: anuncio, error: errAnuncio } = await admin
      .from('anuncios')
      .insert({
        tenant_id: tenantId, categoria_id: categoriaAnuncioId, prioridad_id: prioridadAnuncioId,
        titulo: `Corte de agua Zafiro${sello}`, contenido: 'Contenido de prueba.',
      })
      .select('id').single<{ id: string }>()
    if (errAnuncio) throw new Error(`fixture anuncio: ${errAnuncio.message}`)

    // ── vehiculo ──
    const tipoVehiculoId = await idListaTipos('TIPO_VEHICULO', 'automovil')
    const { data: vehiculo, error: errVehiculo } = await admin
      .from('vehiculos')
      .insert({ tenant_id: tenantId, placa: `ZAF${sello.slice(-3)}`, tipo_id: tipoVehiculoId, marca: 'Renault' })
      .select('id').single<{ id: string }>()
    if (errVehiculo) throw new Error(`fixture vehiculo: ${errVehiculo.message}`)

    // ── organo_gobierno (comité ad hoc — exige nombre) ──
    const tipoOrganoId = await idListaTipos('ORGANO_GOBIERNO', 'comite')
    const { data: organo, error: errOrgano } = await admin
      .from('gobierno_organos')
      .insert({ tenant_id: tenantId, tipo_id: tipoOrganoId, nombre: `Comité Zafiro${sello}`, vigente_desde: '2026-01-01' })
      .select('id').single<{ id: string }>()
    if (errOrgano) throw new Error(`fixture organo: ${errOrgano.message}`)

    // ── reunion_gobierno ──
    const tipoReunionId = await idListaTipos('TIPO_REUNION', 'asamblea_ordinaria')
    const { data: reunion, error: errReunion } = await admin
      .from('gobierno_reuniones')
      .insert({
        tenant_id: tenantId, organo_id: organo.id, tipo_id: tipoReunionId,
        modalidad: 'presencial', convocatoria_regimen: 'primera',
        fecha_hora: '2026-06-01T15:00:00Z', lugar: `Salón Zafiro${sello}`,
      })
      .select('id').single<{ id: string }>()
    if (errReunion) throw new Error(`fixture reunion: ${errReunion.message}`)

    // ── solicitud (vía RPC, como el flujo real) ──
    const inmA = await crearInmueble(tenantId, `BGD-${sello}`)
    const propA = await crearTercero(tenantId, 'PropA', sello)
    const tipoSolId = await crearVocabularioSolicitud(tenantId, 'TIPO_SOLICITUD', 'queja', 'Queja')
    const categoriaSolId = await crearVocabularioSolicitud(tenantId, 'CATEGORIA_SOLICITUD', 'ruido', 'Ruido')
    const origenSolId = await crearVocabularioSolicitud(tenantId, 'ORIGEN_SOLICITUD', 'telefono', 'Teléfono')
    const prioridadSolId = await crearVocabularioSolicitud(tenantId, 'PRIORIDAD_SOLICITUD', 'media', 'Media')
    const { data: solicitud, error: errSolicitud } = await admin.rpc('gobierno_crear_solicitud', {
      p_tipo_id: tipoSolId, p_categoria_id: categoriaSolId, p_origen_id: origenSolId,
      p_prioridad_id: prioridadSolId, p_solicitante_ref: propA, p_inmueble_id: inmA,
      p_calidad: 'propietario', p_asunto: `Ruido nocturno Zafiro${sello}`,
    }).single<{ id: string; numero: number; anio: number }>()
    if (errSolicitud) throw new Error(`fixture solicitud: ${errSolicitud.message}`)

    // ── cada categoría, filtrada ──
    const filasAnuncio = await buscar(tenantId, `Zafiro${sello}`, 'anuncio')
    expect(filasAnuncio).toHaveLength(1)
    expect(filasAnuncio[0]?.entidad_id).toBe(anuncio.id)
    expect(filasAnuncio[0]?.subtitulo).toContain('Borrador')

    const filasVehiculo = await buscar(tenantId, `ZAF${sello.slice(-3)}`, 'vehiculo')
    expect(filasVehiculo).toHaveLength(1)
    expect(filasVehiculo[0]?.entidad_id).toBe(vehiculo.id)
    expect(filasVehiculo[0]?.subtitulo).toContain('Renault')
    expect(filasVehiculo[0]?.subtitulo).toContain('Activo')

    const filasOrgano = await buscar(tenantId, `Zafiro${sello}`, 'organo_gobierno')
    expect(filasOrgano).toHaveLength(1)
    expect(filasOrgano[0]?.entidad_id).toBe(organo.id)
    expect(filasOrgano[0]?.subtitulo).toContain('Vigente')

    const filasReunion = await buscar(tenantId, `Zafiro${sello}`, 'reunion_gobierno')
    expect(filasReunion).toHaveLength(1)
    expect(filasReunion[0]?.entidad_id).toBe(reunion.id)
    expect(filasReunion[0]?.subtitulo).toContain(`Salón Zafiro${sello}`)

    const filasSolicitud = await buscar(tenantId, `Zafiro${sello}`, 'solicitud')
    expect(filasSolicitud).toHaveLength(1)
    expect(filasSolicitud[0]?.entidad_id).toBe(solicitud.id)
    expect(filasSolicitud[0]?.inmueble_id).toBe(inmA)

    // ── sin filtro, las cinco aparecen juntas ──
    const todas = await buscar(tenantId, `Zafiro${sello}`)
    const categorias = new Set(todas.map((f) => f.categoria))
    expect(categorias).toEqual(new Set(['anuncio', 'organo_gobierno', 'reunion_gobierno', 'solicitud']))
  }, 30_000)

  it('aísla por tenant: un vehículo de otro tenant no aparece', async () => {
    const sello = String(Date.now())
    const { tenantId: tenantA } = await crearTenantCompleto('bgd-cross-a')
    const { tenantId: tenantB } = await crearTenantCompleto('bgd-cross-b')
    const tipoVehiculoId = await idListaTipos('TIPO_VEHICULO', 'automovil')
    await admin.from('vehiculos').insert({ tenant_id: tenantB, placa: `CRZ${sello.slice(-3)}`, tipo_id: tipoVehiculoId })

    const filas = await buscar(tenantA, `CRZ${sello.slice(-3)}`, 'vehiculo')
    expect(filas).toEqual([])
  }, 30_000)
})
