/**
 * MANT-2 (20260930740000-20260930760000) — cumplimiento normativo.
 * Ver Casos de uso/Tres Modulos/Mantenimiento/MANT_02_cumplimiento_normativo.md
 * y MANT_02_INVESTIGACION_NORMATIVA.md.
 *
 * Rediseño aprobado (DECISIONES.md D-53) frente al texto original del corte: una sola tabla
 * `mant_requisito` (no catálogo global + tabla propia separados), con `tenant_id is null` como
 * semilla que `fn_instanciar_requisitos_cumplimiento()` copia a filas propias del tenant en
 * `create_tenant()` — el sistema nunca "resuelve" solo qué norma aplica por municipio; el
 * administrador edita cada fila (norma, fuente, frecuencia) desde el primer día.
 */
import { afterAll, describe, expect, it } from 'vitest'
import 'dotenv/config'
import {
  clienteAdmin,
  clienteComo,
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
  console.warn('SALTADO tests/mantenimiento/cumplimiento: faltan variables de Supabase en .env')
}

d('MANT-2: cumplimiento normativo', () => {
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
    const cliente = await clienteComo(env!, usuario)
    const { data: tenant, error } = await cliente
      .rpc('create_tenant', { p_name: `MANT-2 ${etiqueta}`, p_slug: `t-${RUN_ID}-${etiqueta}` })
      .single<{ id: string }>()
    if (error) throw new Error(`create_tenant (${etiqueta}): ${error.message}`)
    tenantsCreados.push(tenant.id)
    return { tenantId: tenant.id, cliente }
  }

  async function idListaTipos(tipo: string, codigo: string): Promise<number> {
    const { data, error } = await admin
      .from('lista_tipos').select('id').eq('tipo', tipo).eq('codigo', codigo).is('tenant_id', null)
      .single<{ id: number }>()
    if (error) throw new Error(`fixture lista_tipos ${tipo}.${codigo}: ${error.message}`)
    return data.id
  }

  async function crearActivoMinimo(tenantId: string, codigo: string, tipoId: number, categoriaId: number): Promise<string> {
    const { data, error } = await admin
      .from('activos')
      .insert({
        tenant_id: tenantId, codigo, nombre: codigo, categoria_id: categoriaId, tipo_id: tipoId,
        naturaleza_bien: 'bien_propio', origen: 'comprado',
      })
      .select('id').single<{ id: string }>()
    if (error) throw new Error(`fixture activo ${codigo}: ${error.message}`)
    return data.id
  }

  async function requisitoPorCodigo(tenantId: string, codigo: string) {
    const { data, error } = await admin
      .from('mant_requisito').select('*').eq('tenant_id', tenantId).eq('codigo', codigo).single()
    if (error) throw new Error(`fixture requisito ${codigo}: ${error.message}`)
    return data
  }

  it('1. create_tenant() instancia automáticamente los requisitos semilla', async () => {
    const { tenantId } = await crearTenantCompleto('semilla')
    const { data, error } = await admin.from('mant_requisito').select('codigo').eq('tenant_id', tenantId)
    expect(error).toBeNull()
    const codigos = (data ?? []).map((r) => r.codigo)
    expect(codigos).toContain('ASCENSOR_REVISION_ANUAL')
    expect(codigos).toContain('EXTINTOR_MANTENIMIENTO')
    expect(codigos.length).toBeGreaterThanOrEqual(10)
  }, 20_000)

  it('2. la semilla de ascensores llega sin norma_referencia — depende del municipio, no se adivina', async () => {
    const { tenantId } = await crearTenantCompleto('ascensor-sin-norma')
    const req = await requisitoPorCodigo(tenantId, 'ASCENSOR_REVISION_ANUAL')
    expect(req.norma_referencia).toBeNull()
    expect(req.fuente_url).toBeNull()
    expect(req.frecuencia_meses).toBe(12)
    expect(req.tipo_fundamento).toBe('legal_territorial')
  }, 20_000)

  it('3. aislamiento: un tenant no ve los requisitos de otro (RLS)', async () => {
    const { tenantId: tenantA } = await crearTenantCompleto('aislar-a')
    const { cliente: clienteB } = await crearTenantCompleto('aislar-b')
    const { data, error } = await clienteB.from('mant_requisito').select('id').eq('tenant_id', tenantA)
    expect(error).toBeNull()
    expect(data ?? []).toHaveLength(0)
  }, 20_000)

  it('4. un requisito propio sin norma_referencia falla con REQUISITO_SIN_REFERENCIA', async () => {
    const { tenantId, cliente } = await crearTenantCompleto('sin-referencia')
    const { error } = await cliente.from('mant_requisito').insert({
      tenant_id: tenantId, nombre: 'Revisión bomba piscina', tipo_fundamento: 'interno',
    })
    expect(error?.message).toContain('REQUISITO_SIN_REFERENCIA')
  }, 20_000)

  it('5. un requisito propio con norma_referencia sí se crea', async () => {
    const { tenantId, cliente } = await crearTenantCompleto('con-referencia')
    const { data, error } = await cliente.from('mant_requisito').insert({
      tenant_id: tenantId, nombre: 'Mantenimiento bomba Otis', tipo_fundamento: 'tecnico_fabricante',
      norma_referencia: 'Manual técnico Otis Gen2, sección 4.2', frecuencia_meses: 1,
    }).select('id').single()
    expect(error).toBeNull()
    expect(data?.id).toBeTruthy()
  }, 20_000)

  it('6. "quitar de mi copropiedad" (activo=false) lo saca del semáforo de mant_estado_cumplimiento', async () => {
    const { tenantId, cliente } = await crearTenantCompleto('quitar')
    const req = await requisitoPorCodigo(tenantId, 'RETILAP_ILUMINACION')
    await cliente.from('mant_requisito').update({ activo: false }).eq('id', req.id)
    const { data, error } = await cliente.rpc('mant_estado_cumplimiento', { p_tenant_id: tenantId })
    expect(error).toBeNull()
    expect((data ?? []).some((e) => e.requisito_id === req.id)).toBe(false)
  }, 20_000)

  it('7. registrar cumplimiento sin evidencia falla con CUMPLIMIENTO_SIN_EVIDENCIA', async () => {
    const { tenantId, cliente } = await crearTenantCompleto('sin-evidencia')
    const req = await requisitoPorCodigo(tenantId, 'TANQUE_LAVADO')
    const { error } = await cliente.from('mant_cumplimiento').insert({
      tenant_id: tenantId, requisito_id: req.id, fecha_cumplimiento: '2026-01-15',
    })
    expect(error?.message).toContain('CUMPLIMIENTO_SIN_EVIDENCIA')
  }, 20_000)

  it('8. un requisito que exige tercero acreditado sin tercero/acreditación falla con CUMPLIMIENTO_SIN_ACREDITACION', async () => {
    const { tenantId, cliente } = await crearTenantCompleto('sin-acreditacion')
    const req = await requisitoPorCodigo(tenantId, 'EXTINTOR_MANTENIMIENTO')
    expect(req.requiere_tercero_acreditado).toBe(true)
    const { error } = await cliente.from('mant_cumplimiento').insert({
      tenant_id: tenantId, requisito_id: req.id, fecha_cumplimiento: '2026-01-15',
      evidencia_referencia: 'https://ejemplo.com/certificado.pdf',
    })
    expect(error?.message).toContain('CUMPLIMIENTO_SIN_ACREDITACION')
  }, 20_000)

  it('9. vence_at se calcula desde la frecuencia del requisito y nunca se digita', async () => {
    const { tenantId, cliente } = await crearTenantCompleto('vence-at')
    const req = await requisitoPorCodigo(tenantId, 'TANQUE_LAVADO') // frecuencia_meses = 6
    const { data, error } = await cliente.from('mant_cumplimiento').insert({
      tenant_id: tenantId, requisito_id: req.id, fecha_cumplimiento: '2026-01-15',
      evidencia_referencia: 'https://ejemplo.com/analisis-agua.pdf',
      // vence_at "digitado" a propósito con un valor absurdo — el guard debe ignorarlo.
      vence_at: '2099-12-31',
    }).select('vence_at').single()
    expect(error).toBeNull()
    expect(data?.vence_at).toBe('2026-07-15')
  }, 20_000)

  it('10. mant_estado_cumplimiento marca "vencido" al pasar la fecha, sin ningún job', async () => {
    const { tenantId, cliente } = await crearTenantCompleto('vencido')
    // Requisito sin tipo_activo_id (copropiedad, no activo físico) — así no depende de que exista
    // un activo registrado para aparecer en el semáforo (ver prueba 15 para el caso por-activo).
    const req = await requisitoPorCodigo(tenantId, 'INCENDIO_INSPECCION_ANUAL')
    await cliente.from('mant_cumplimiento').insert({
      tenant_id: tenantId, requisito_id: req.id, fecha_cumplimiento: '2020-01-15',
      evidencia_referencia: 'https://ejemplo.com/certificado-bomberos.pdf',
    })
    const { data, error } = await cliente.rpc('mant_estado_cumplimiento', { p_tenant_id: tenantId })
    expect(error).toBeNull()
    const fila = (data ?? []).find((e) => e.requisito_id === req.id)
    expect(fila?.estado).toBe('vencido')
  }, 20_000)

  it('11. mant_estado_cumplimiento marca "nunca_cumplido" cuando no hay ningún registro', async () => {
    const { tenantId, cliente } = await crearTenantCompleto('nunca-cumplido')
    const req = await requisitoPorCodigo(tenantId, 'GAS_REVISION_INSTALACION')
    const { data, error } = await cliente.rpc('mant_estado_cumplimiento', { p_tenant_id: tenantId })
    expect(error).toBeNull()
    const fila = (data ?? []).find((e) => e.requisito_id === req.id)
    expect(fila?.estado).toBe('nunca_cumplido')
  }, 20_000)

  it('12. un cumplimiento es append-only: un UPDATE falla (sin policy de update)', async () => {
    const { tenantId, cliente } = await crearTenantCompleto('append-only')
    const req = await requisitoPorCodigo(tenantId, 'TANQUE_LAVADO')
    const { data: fila } = await cliente.from('mant_cumplimiento').insert({
      tenant_id: tenantId, requisito_id: req.id, fecha_cumplimiento: '2026-01-15',
      evidencia_referencia: 'https://ejemplo.com/analisis-agua.pdf',
    }).select('id').single()
    const { error, count } = await cliente
      .from('mant_cumplimiento')
      .update({ resultado: 'no_conforme' }, { count: 'exact' })
      .eq('id', fila!.id)
    // Sin policy de UPDATE, PostgREST no reporta error — simplemente no afecta ninguna fila.
    expect(error).toBeNull()
    expect(count ?? 0).toBe(0)
  }, 20_000)

  it('13. un cumplimiento con requisito_id de otro tenant falla con ACTIVO_TENANT_INCONSISTENTE', async () => {
    const { tenantId: tenantA } = await crearTenantCompleto('cruce-a')
    const { tenantId: tenantB } = await crearTenantCompleto('cruce-b')
    const reqA = await requisitoPorCodigo(tenantA, 'TANQUE_LAVADO')
    const { error } = await admin.from('mant_cumplimiento').insert({
      tenant_id: tenantB, requisito_id: reqA.id, fecha_cumplimiento: '2026-01-15',
      evidencia_referencia: 'https://ejemplo.com/x.pdf',
    })
    expect(error?.message).toContain('ACTIVO_TENANT_INCONSISTENTE')
  }, 20_000)

  it('14. mant_estado_cumplimiento no cambia ningún estado (sin motor de alertas que mute filas)', async () => {
    const { tenantId, cliente } = await crearTenantCompleto('sin-side-effects')
    const { count: antes } = await admin
      .from('mant_requisito').select('id', { count: 'exact', head: true }).eq('tenant_id', tenantId)
    await cliente.rpc('mant_estado_cumplimiento', { p_tenant_id: tenantId })
    await cliente.rpc('mant_estado_cumplimiento', { p_tenant_id: tenantId })
    const { count: despues } = await admin
      .from('mant_requisito').select('id', { count: 'exact', head: true }).eq('tenant_id', tenantId)
    expect(despues).toBe(antes)
  }, 20_000)

  it('15. un requisito ligado a un tipo de activo (ascensor) se expande por cada activo de ese tipo, y un cumplimiento contra un activo de otro tipo falla con CUMPLIMIENTO_ACTIVO_TIPO_INVALIDO', async () => {
    const { tenantId, cliente } = await crearTenantCompleto('por-activo')
    const tipoAscensorId = await idListaTipos('TIPO_ACTIVO', 'ascensor')
    const tipoExtintorId = await idListaTipos('TIPO_ACTIVO', 'extintor')
    const categoriaTransporteId = await idListaTipos('CATEGORIA_ACTIVO', 'transporte_vertical')
    const categoriaSeguridadId = await idListaTipos('CATEGORIA_ACTIVO', 'seguridad')
    const ascensorId = await crearActivoMinimo(tenantId, `ASC-${RUN_ID}`, tipoAscensorId, categoriaTransporteId)
    const extintorId = await crearActivoMinimo(tenantId, `EXT-${RUN_ID}`, tipoExtintorId, categoriaSeguridadId)
    const reqAscensor = await requisitoPorCodigo(tenantId, 'ASCENSOR_REVISION_ANUAL')

    const { data: estados, error: errEstados } = await cliente
      .rpc('mant_estado_cumplimiento', { p_tenant_id: tenantId })
    expect(errEstados).toBeNull()
    expect((estados ?? []).some((e) => e.requisito_id === reqAscensor.id && e.activo_id === ascensorId)).toBe(true)

    const { error: errCruce } = await cliente.from('mant_cumplimiento').insert({
      tenant_id: tenantId, requisito_id: reqAscensor.id, activo_id: extintorId, fecha_cumplimiento: '2026-01-15',
      evidencia_referencia: 'https://ejemplo.com/x.pdf', ejecutado_por_tercero_id: null, acreditacion_referencia: 'ONAC-1',
    })
    expect(errCruce?.message).toContain('CUMPLIMIENTO_ACTIVO_TIPO_INVALIDO')
  }, 20_000)
})
