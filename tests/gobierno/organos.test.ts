/**
 * GOB-1 (20260931350000-20260931390000) — órganos de gobierno y sus miembros.
 * Ver Casos de uso/Tres Modulos/Gobierno/GOB_01_organos_gobierno.md.
 *
 * `persona_ref` del spec (§4.3, "propietario o tercero según el camino elegido en GOB-0") se
 * resolvió como `tercero_id`: GOB-0 encontró que ya no hay dos entidades separadas —
 * `terceros` es la única (D-60). El umbral del art. 53 (consejo obligatorio) se verificó contra
 * fuente primaria en esta sesión: solo aplica a uso comercial/mixto con >30 unidades privadas
 * (parqueaderos/depósitos excluidos) — residencial NUNCA es obligatorio, sin importar tamaño.
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
} from '../rls/helpers.js'

const env = leerEntorno()
const d = env ? describe : describe.skip

if (!env) {
  console.warn('SALTADO tests/gobierno/organos: faltan variables de Supabase en .env')
}

d('GOB-1: órganos de gobierno y sus miembros', () => {
  const admin = clienteAdmin(env!)
  const tenantsCreados: string[] = []
  const usuariosCreados: UsuarioPrueba[] = []

  afterAll(async () => {
    for (const id of tenantsCreados) await eliminarTenant(admin, id)
    for (const usuario of usuariosCreados) await eliminarUsuario(admin, usuario.id)
  }, 60_000)

  async function crearTenantCompleto(etiqueta: string): Promise<{ tenantId: string; cliente: Cliente }> {
    const usuario = await crearUsuario(admin, etiqueta)
    usuariosCreados.push(usuario)
    const tenant = await crearTenant(admin, etiqueta, usuario.id)
    tenantsCreados.push(tenant.id)
    await crearMembership(admin, tenant.id, usuario.id, 'administrador')
    const cliente = await clienteComo(env!, usuario)
    return { tenantId: tenant.id, cliente }
  }

  async function idListaTipos(tipo: string, codigo: string): Promise<number> {
    const { data, error } = await admin
      .from('lista_tipos').select('id').eq('tipo', tipo).eq('codigo', codigo).is('tenant_id', null)
      .single<{ id: number }>()
    if (error) throw new Error(`fixture lista_tipos ${tipo}.${codigo}: ${error.message}`)
    return data.id
  }

  async function crearOrgano(
    tenantId: string,
    tipoCodigo: string,
    opciones: { nombre?: string; vigenteDesde?: string; vigenteHasta?: string | null } = {},
  ): Promise<string> {
    const tipoId = await idListaTipos('ORGANO_GOBIERNO', tipoCodigo)
    const { data, error } = await admin
      .from('gobierno_organos')
      .insert({
        tenant_id: tenantId, tipo_id: tipoId,
        nombre: opciones.nombre ?? null,
        vigente_desde: opciones.vigenteDesde ?? '2026-01-01',
        vigente_hasta: opciones.vigenteHasta ?? null,
      })
      .select('id').single<{ id: string }>()
    if (error) throw new Error(`fixture organo ${tipoCodigo}: ${error.message}`)
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

  async function crearMiembro(
    tenantId: string,
    organoId: string,
    terceroId: string,
    rolCodigo: string,
    desde: string,
    hasta: string | null = null,
  ): Promise<{ id: string } | { error: string }> {
    const rolId = await idListaTipos('ROL_CONCEJO_COPROPIEDAD', rolCodigo)
    const { data, error } = await admin
      .from('gobierno_miembros')
      .insert({ tenant_id: tenantId, organo_id: organoId, tercero_id: terceroId, rol_id: rolId, desde, hasta })
      .select('id').single<{ id: string }>()
    if (error) return { error: error.message }
    return { id: data.id }
  }

  async function crearAtribucion(
    tenantId: string,
    organoId: string,
    atribucionCodigo: string,
    origen: 'ley' | 'reglamento',
    opciones: { reglamentoReferencia?: string; fundamentoNormativoId?: number; vigenteDesde?: string } = {},
  ): Promise<{ id: string } | { error: string }> {
    const atribucionId = await idListaTipos('ATRIBUCION_ORGANO', atribucionCodigo)
    const { data, error } = await admin
      .from('gobierno_atribucion')
      .insert({
        tenant_id: tenantId, organo_id: organoId, atribucion_id: atribucionId, origen,
        reglamento_referencia: opciones.reglamentoReferencia ?? null,
        fundamento_normativo_id: opciones.fundamentoNormativoId ?? null,
        vigente_desde: opciones.vigenteDesde ?? '2026-01-01',
      })
      .select('id').single<{ id: string }>()
    if (error) return { error: error.message }
    return { id: data.id }
  }

  it('1. un tenant no puede tener dos consejos vigentes a la vez → ORGANO_DUPLICADO_VIGENTE', async () => {
    const { tenantId } = await crearTenantCompleto('gob1-t1')
    await crearOrgano(tenantId, 'consejo_administracion')
    const { data, error } = await admin
      .from('gobierno_organos')
      .insert({
        tenant_id: tenantId,
        tipo_id: await idListaTipos('ORGANO_GOBIERNO', 'consejo_administracion'),
        vigente_desde: '2026-02-01',
      })
      .select('id')
    expect(data).toBeNull()
    expect(error?.message).toContain('ORGANO_DUPLICADO_VIGENTE')
  }, 30_000)

  it('2. asignar imponer_sanciones al comité de convivencia falla, incluso con origen=reglamento (prueba central)', async () => {
    const { tenantId } = await crearTenantCompleto('gob1-t2')
    const comite = await crearOrgano(tenantId, 'comite_convivencia')
    const resultado = await crearAtribucion(tenantId, comite, 'imponer_sanciones', 'reglamento', {
      reglamentoReferencia: 'Art. 40 del reglamento',
    })
    expect('error' in resultado).toBe(true)
    if ('error' in resultado) expect(resultado.error).toContain('ATRIBUCION_PROHIBIDA_COMITE_CONVIVENCIA')
  }, 30_000)

  it('3. una atribución con origen=reglamento sin referencia falla', async () => {
    const { tenantId } = await crearTenantCompleto('gob1-t3')
    const consejo = await crearOrgano(tenantId, 'consejo_administracion')
    const resultado = await crearAtribucion(tenantId, consejo, 'aprobar_presupuesto', 'reglamento')
    expect('error' in resultado).toBe(true)
    if ('error' in resultado) expect(resultado.error).toContain('ATRIBUCION_SIN_REFERENCIA_REGLAMENTO')
  }, 30_000)

  it('4. una atribución con origen=ley sin fundamento_normativo_id falla', async () => {
    const { tenantId } = await crearTenantCompleto('gob1-t4')
    const asamblea = await crearOrgano(tenantId, 'asamblea_general')
    const resultado = await crearAtribucion(tenantId, asamblea, 'aprobar_estados_financieros', 'ley')
    expect('error' in resultado).toBe(true)
    if ('error' in resultado) expect(resultado.error).toContain('ATRIBUCION_SIN_FUNDAMENTO')
  }, 30_000)

  it("5. gobierno_organo_competente devuelve el consejo cuando el reglamento se la dio, y la asamblea cuando no", async () => {
    const { tenantId } = await crearTenantCompleto('gob1-t5')
    const asamblea = await crearOrgano(tenantId, 'asamblea_general')
    const consejo = await crearOrgano(tenantId, 'consejo_administracion')
    const resultado = await crearAtribucion(tenantId, consejo, 'imponer_sanciones', 'reglamento', {
      reglamentoReferencia: 'Art. 39 del reglamento',
    })
    expect('id' in resultado).toBe(true)

    const { data: competente } = await admin
      .rpc('gobierno_organo_competente', {
        p_tenant_id: tenantId, p_atribucion_codigo: 'imponer_sanciones', p_fecha: '2026-06-01',
      })
    expect(competente).toHaveLength(1)
    expect(competente?.[0]?.organo_tipo_codigo).toBe('consejo_administracion')

    // Sin esa atribución, otro tenant nunca resuelve al consejo — la asamblea sancionaría por
    // defecto en la práctica (art. 60), pero eso lo decide quien consuma la función vacía.
    const { tenantId: tenantSinConsejo } = await crearTenantCompleto('gob1-t5b')
    await crearOrgano(tenantSinConsejo, 'asamblea_general')
    const { data: vacio } = await admin
      .rpc('gobierno_organo_competente', {
        p_tenant_id: tenantSinConsejo, p_atribucion_codigo: 'imponer_sanciones', p_fecha: '2026-06-01',
      })
    expect(vacio).toHaveLength(0)
    expect(asamblea).toBeTruthy()
  }, 30_000)

  it('6. si dos órganos tienen la misma atribución vigente, la función devuelve los dos', async () => {
    const { tenantId } = await crearTenantCompleto('gob1-t6')
    const asamblea = await crearOrgano(tenantId, 'asamblea_general')
    const consejo = await crearOrgano(tenantId, 'consejo_administracion')
    await crearAtribucion(tenantId, asamblea, 'aprobar_cuota_extraordinaria', 'reglamento', {
      reglamentoReferencia: 'Art. 10 del reglamento',
    })
    await crearAtribucion(tenantId, consejo, 'aprobar_cuota_extraordinaria', 'reglamento', {
      reglamentoReferencia: 'Art. 10 del reglamento (delegada)',
    })

    const { data } = await admin
      .rpc('gobierno_organo_competente', {
        p_tenant_id: tenantId, p_atribucion_codigo: 'aprobar_cuota_extraordinaria', p_fecha: '2026-06-01',
      })
    expect(data).toHaveLength(2)
    const tipos = new Set(data?.map((f) => f.organo_tipo_codigo))
    expect(tipos).toEqual(new Set(['asamblea_general', 'consejo_administracion']))
  }, 30_000)

  it('7. un comité de convivencia con período de 18 meses falla → COMITE_CONVIVENCIA_PERIODO_EXCEDIDO', async () => {
    const { tenantId } = await crearTenantCompleto('gob1-t7')
    const comite = await crearOrgano(tenantId, 'comite_convivencia')
    const tercero = await crearTercero(tenantId, 'Vocal', 'DieciochoMeses')
    const resultado = await crearMiembro(tenantId, comite, tercero, 'vocal', '2026-01-01', '2027-07-01')
    expect('error' in resultado).toBe(true)
    if ('error' in resultado) expect(resultado.error).toContain('COMITE_CONVIVENCIA_PERIODO_EXCEDIDO')
  }, 30_000)

  it('8. dos presidentes vigentes en el mismo consejo → ROL_ORGANO_DUPLICADO', async () => {
    const { tenantId } = await crearTenantCompleto('gob1-t8')
    const consejo = await crearOrgano(tenantId, 'consejo_administracion')
    const tercero1 = await crearTercero(tenantId, 'Presidente', 'Uno')
    const tercero2 = await crearTercero(tenantId, 'Presidente', 'Dos')
    const primero = await crearMiembro(tenantId, consejo, tercero1, 'presidente', '2026-01-01')
    expect('id' in primero).toBe(true)
    const segundo = await crearMiembro(tenantId, consejo, tercero2, 'presidente', '2026-02-01')
    expect('error' in segundo).toBe(true)
    if ('error' in segundo) expect(segundo.error).toContain('ROL_ORGANO_DUPLICADO')
  }, 30_000)

  async function crearInmueble(tenantId: string, codigo: string, tipoCodigo = 'apartamento'): Promise<string> {
    const tipoId = await idListaTipos('TIPO_INMUEBLE', tipoCodigo)
    const { data, error } = await admin
      .from('inmuebles').insert({ tenant_id: tenantId, codigo, tipo_id: tipoId }).select('id').single<{ id: string }>()
    if (error) throw new Error(`fixture inmueble ${codigo}: ${error.message}`)
    return data.id
  }

  it('9. una copropiedad comercial sin revisoría vigente produce advertencia, no bloqueo', async () => {
    const { tenantId } = await crearTenantCompleto('gob1-t9')
    await admin.from('tenants').update({ marco_grupo: 'grupo_3', uso_economico: 'comercial' }).eq('id', tenantId)

    const { data, error } = await admin
      .rpc('gobierno_obligatoriedad_faltante', { p_tenant_id: tenantId, p_fecha: '2026-06-01' })
    expect(error).toBeNull()
    const revisoria = data?.find((f) => f.obligacion === 'revisoria_fiscal')
    expect(revisoria?.cumplida).toBe(false)

    // No bloqueo: la escritura del tenant y la consulta misma no fallan por esta ausencia.
    const { error: errorConsulta } = await admin.from('tenants').select('id').eq('id', tenantId).single()
    expect(errorConsulta).toBeNull()
  }, 30_000)

  it('10. una copropiedad sin clasificar no produce advertencias de obligatoriedad', async () => {
    const { tenantId } = await crearTenantCompleto('gob1-t10')
    const { data, error } = await admin
      .rpc('gobierno_obligatoriedad_faltante', { p_tenant_id: tenantId, p_fecha: '2026-06-01' })
    expect(error).toBeNull()
    expect(data).toHaveLength(0)
  }, 30_000)

  it('10b. consejo obligatorio solo aplica con >30 unidades en uso comercial/mixto (art. 53 verificado)', async () => {
    const { tenantId } = await crearTenantCompleto('gob1-t10b')
    await admin.from('tenants').update({ marco_grupo: 'grupo_3', uso_economico: 'comercial' }).eq('id', tenantId)
    for (let i = 0; i < 31; i += 1) {
      await crearInmueble(tenantId, `GOB1-10B-${RUN_ID}-${String(i)}`)
    }
    const { data } = await admin
      .rpc('gobierno_obligatoriedad_faltante', { p_tenant_id: tenantId, p_fecha: '2026-06-01' })
    const consejo = data?.find((f) => f.obligacion === 'consejo_administracion')
    expect(consejo?.cumplida).toBe(false)
  }, 30_000)

  it('10c. residencial nunca exige consejo, sin importar el tamaño (art. 53 verificado explícitamente)', async () => {
    const { tenantId } = await crearTenantCompleto('gob1-t10c')
    await admin.from('tenants').update({ marco_grupo: 'grupo_3', uso_economico: 'residencial' }).eq('id', tenantId)
    for (let i = 0; i < 31; i += 1) {
      await crearInmueble(tenantId, `GOB1-10C-${RUN_ID}-${String(i)}`)
    }
    const { data } = await admin
      .rpc('gobierno_obligatoriedad_faltante', { p_tenant_id: tenantId, p_fecha: '2026-06-01' })
    expect(data).toHaveLength(0)
  }, 30_000)

  it('11. aislamiento entre tenants', async () => {
    const { tenantId: tenantA, cliente: clienteA } = await crearTenantCompleto('gob1-t11a')
    const { tenantId: tenantB } = await crearTenantCompleto('gob1-t11b')
    await crearOrgano(tenantA, 'consejo_administracion')
    await crearOrgano(tenantB, 'consejo_administracion')

    const { data: visiblesParaA, error } = await clienteA.from('gobierno_organos').select('id').eq('tenant_id', tenantB)
    expect(error).toBeNull()
    expect(visiblesParaA).toHaveLength(0)
  }, 30_000)

  it('12. el enum atribucion_origen_t tiene comment on type (D-24) — enforced globalmente por tests/governance', () => {
    // tests/governance/enum-lista-tipos-coverage.test.ts escanea todas las migraciones y hace
    // fallar cualquier `create type ... as enum` sin `comment on type` cercano — este corte crea
    // exactamente uno (atribucion_origen_t, 20260931350000) con su comentario en la misma
    // migración. Constancia explícita, no una segunda implementación de la regla.
    expect(true).toBe(true)
  })
})
