/**
 * MANT-5 (20260931020000-20260931100000) — proveedores, contratos y garantías.
 * Ver Casos de uso/Tres Modulos/Mantenimiento/MANT_05_proveedores_contratos_garantias.md.
 *
 * Dos decisiones confirmadas con el usuario antes de implementar (ver D-57 en DECISIONES.md):
 * (1) 'por_vencer'/'vencido' NUNCA entran a contrato_estado_t — se calculan en
 * mant_contrato_estado_visible(), nunca se almacenan; (2) presupuesto_ejecucion.contrato_id es
 * columna nueva para que el ejecutado de UN contrato (no de todo el tercero) se lea exacto.
 */
import { afterAll, describe, expect, it } from 'vitest'
import 'dotenv/config'
import type { Database } from '@aquila/shared'
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
  console.warn('SALTADO tests/mantenimiento/proveedores-contratos: faltan variables de Supabase en .env')
}

const HOY = new Date().toISOString().slice(0, 10)
function sumarDias(fechaIso: string, dias: number): string {
  const fecha = new Date(`${fechaIso}T00:00:00Z`)
  fecha.setUTCDate(fecha.getUTCDate() + dias)
  return fecha.toISOString().slice(0, 10)
}

d('MANT-5: proveedores, contratos y garantías', () => {
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
      .rpc('create_tenant', { p_name: `MANT-5 ${etiqueta}`, p_slug: `t5-${RUN_ID}-${etiqueta}` })
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
        naturaleza_bien: 'bien_propio', origen: 'comprado', estado: 'en_servicio',
      })
      .select('id').single<{ id: string }>()
    if (error) throw new Error(`fixture activo ${codigo}: ${error.message}`)
    return data.id
  }

  async function crearTercero(tenantId: string, apellido: string): Promise<string> {
    const [tipoIdent, estado] = await Promise.all([
      idListaTipos('TIPO_IDENTIFICACION', 'cedula'),
      idListaTipos('ESTADO_TERCERO', 'activo'),
    ])
    const { data, error } = await admin
      .from('terceros')
      .insert({
        tenant_id: tenantId, tipo_persona: 'natural', tipo_identificacion_id: tipoIdent,
        numero_documento: `${apellido}-${RUN_ID}`, primer_nombre: 'Contratista', primer_apellido: apellido,
        estado_id: estado,
      })
      .select('id').single<{ id: string }>()
    if (error) throw new Error(`fixture tercero ${apellido}: ${error.message}`)
    return data.id
  }

  async function crearDocumentoMinimo(tenantId: string, nombre: string): Promise<string> {
    const tipoDocId = await idListaTipos('TIPO_DOCUMENTO', 'habilitacion_proveedor')
    const { data, error } = await admin
      .from('documentos')
      .insert({ tenant_id: tenantId, tipo_documento_id: tipoDocId, nombre_archivo: `${nombre}.pdf`, storage_path: `test/${nombre}.pdf` })
      .select('id').single<{ id: string }>()
    if (error) throw new Error(`fixture documento ${nombre}: ${error.message}`)
    return data.id
  }

  type HabilitacionInsert = Database['public']['Tables']['mant_proveedor_habilitacion']['Insert']
  async function crearHabilitacion(overrides: HabilitacionInsert) {
    return await admin.from('mant_proveedor_habilitacion').insert(overrides).select('*').single()
  }

  type ReglaInsert = Database['public']['Tables']['mant_habilitacion_requerida']['Insert']
  async function crearRegla(overrides: ReglaInsert) {
    return await admin.from('mant_habilitacion_requerida').insert(overrides).select('*').single()
  }

  type ContratoInsert = Database['public']['Tables']['mant_contratos']['Insert']
  async function crearContrato(overrides: ContratoInsert) {
    return await admin.from('mant_contratos').insert(overrides).select('*').single()
  }

  type OtInsert = Database['public']['Tables']['mant_ordenes_trabajo']['Insert']
  async function crearOt(cliente: Cliente, overrides: Omit<OtInsert, 'origen'> & { origen?: OtInsert['origen'] }) {
    return await cliente.from('mant_ordenes_trabajo').insert({ origen: 'manual', ...overrides }).select('*').single()
  }

  it('1. no se crearon tablas de proveedor: se extendió terceros', async () => {
    const fs = await import('node:fs/promises')
    const path = await import('node:path')
    const dirMigraciones = path.resolve(import.meta.dirname, '../../supabase/migrations')
    const archivos = await fs.readdir(dirMigraciones)
    for (const archivo of archivos) {
      const contenido = await fs.readFile(path.join(dirMigraciones, archivo), 'utf8')
      expect(contenido).not.toMatch(/create table public\.mant_proveedores\b/)
      expect(contenido).not.toMatch(/create table public\.supplier/)
    }
  })

  it('2. una habilitación sin documento falla con HABILITACION_SIN_SOPORTE', async () => {
    const { tenantId } = await crearTenantCompleto('sin-soporte')
    const terceroId = await crearTercero(tenantId, 'SinSoporte')
    const tipoArlId = await idListaTipos('TIPO_HABILITACION', 'arl')

    const { error } = await crearHabilitacion({
      tenant_id: tenantId, tercero_id: terceroId, tipo_id: tipoArlId, vigente_desde: HOY,
    })
    expect(error?.message).toContain('HABILITACION_SIN_SOPORTE')

    const documentoId = await crearDocumentoMinimo(tenantId, 'arl-vigente')
    const { error: errOk } = await crearHabilitacion({
      tenant_id: tenantId, tercero_id: terceroId, tipo_id: tipoArlId, vigente_desde: HOY, documento_id: documentoId,
    })
    expect(errOk).toBeNull()
  }, 20_000)

  it('3. asignar una OT a un contratista con habilitación bloqueante vencida falla con OT_CONTRATISTA_NO_HABILITADO', async () => {
    const { tenantId, cliente } = await crearTenantCompleto('no-habilitado')
    const categoriaId = await idListaTipos('CATEGORIA_ACTIVO', 'hidraulico')
    const tipoActivoId = await idListaTipos('TIPO_ACTIVO', 'bomba')
    const activoId = await crearActivoMinimo(tenantId, `BOM-${RUN_ID}`, tipoActivoId, categoriaId)
    const tipoMantId = await idListaTipos('TIPO_MANTENIMIENTO', 'correctivo')
    const terceroId = await crearTercero(tenantId, 'NoHabilitado')
    const tipoArlId = await idListaTipos('TIPO_HABILITACION', 'arl')

    const { error: errRegla } = await crearRegla({
      tenant_id: tenantId, condicion_tipo: 'categoria_activo', condicion_valor: String(categoriaId),
      tipo_habilitacion_id: tipoArlId, bloqueante: true,
    })
    expect(errRegla).toBeNull()

    // Sin ninguna habilitación registrada: falta por completo.
    const { error: errSinHabilitacion } = await crearOt(cliente, {
      tenant_id: tenantId, activo_id: activoId, tipo_mantenimiento_id: tipoMantId,
      titulo: 'Reparar bomba', asignado_tercero_id: terceroId,
    })
    expect(errSinHabilitacion?.message).toContain('OT_CONTRATISTA_NO_HABILITADO')

    // Con una habilitación VENCIDA: sigue fallando (prueba central del corte).
    const documentoId = await crearDocumentoMinimo(tenantId, 'arl-vencida')
    await crearHabilitacion({
      tenant_id: tenantId, tercero_id: terceroId, tipo_id: tipoArlId, documento_id: documentoId,
      vigente_desde: sumarDias(HOY, -400), vigente_hasta: sumarDias(HOY, -30),
    })
    const { error: errVencida } = await crearOt(cliente, {
      tenant_id: tenantId, activo_id: activoId, tipo_mantenimiento_id: tipoMantId,
      titulo: 'Reparar bomba 2', asignado_tercero_id: terceroId,
    })
    expect(errVencida?.message).toContain('OT_CONTRATISTA_NO_HABILITADO')

    // Con la habilitación vigente: se permite asignar.
    const documentoVigenteId = await crearDocumentoMinimo(tenantId, 'arl-al-dia')
    await crearHabilitacion({
      tenant_id: tenantId, tercero_id: terceroId, tipo_id: tipoArlId, documento_id: documentoVigenteId,
      vigente_desde: HOY, vigente_hasta: sumarDias(HOY, 300),
    })
    const { error: errOk } = await crearOt(cliente, {
      tenant_id: tenantId, activo_id: activoId, tipo_mantenimiento_id: tipoMantId,
      titulo: 'Reparar bomba 3', asignado_tercero_id: terceroId,
    })
    expect(errOk).toBeNull()
  }, 30_000)

  it('4. una habilitación NO bloqueante vencida produce advertencia y no impide asignar', async () => {
    const { tenantId, cliente } = await crearTenantCompleto('no-bloqueante')
    const categoriaId = await idListaTipos('CATEGORIA_ACTIVO', 'electrico')
    const tipoActivoId = await idListaTipos('TIPO_ACTIVO', 'tablero')
    const activoId = await crearActivoMinimo(tenantId, `TAB-${RUN_ID}`, tipoActivoId, categoriaId)
    const tipoMantId = await idListaTipos('TIPO_MANTENIMIENTO', 'correctivo')
    const terceroId = await crearTercero(tenantId, 'NoBloqueante')
    const tipoOnacId = await idListaTipos('TIPO_HABILITACION', 'acreditacion_onac')

    await crearRegla({
      tenant_id: tenantId, condicion_tipo: 'categoria_activo', condicion_valor: String(categoriaId),
      tipo_habilitacion_id: tipoOnacId, bloqueante: false,
    })

    const { data: advertencias, error: errVerificar } = await admin.rpc('mant_verificar_habilitacion_tercero', {
      p_tenant_id: tenantId, p_tercero_id: terceroId, p_activo_id: activoId, p_tipo_mantenimiento_id: tipoMantId,
    })
    expect(errVerificar).toBeNull()
    expect(advertencias).toHaveLength(1)
    expect(advertencias![0]!.bloqueante).toBe(false)

    const { error: errOt } = await crearOt(cliente, {
      tenant_id: tenantId, activo_id: activoId, tipo_mantenimiento_id: tipoMantId,
      titulo: 'Revisar tablero', asignado_tercero_id: terceroId,
    })
    expect(errOt).toBeNull()
  }, 20_000)

  it('5. ninguna migración siembra reglas de habilitación (prueba estática)', async () => {
    const fs = await import('node:fs/promises')
    const path = await import('node:path')
    const dirMigraciones = path.resolve(import.meta.dirname, '../../supabase/migrations')
    const archivos = await fs.readdir(dirMigraciones)
    for (const archivo of archivos) {
      const contenido = await fs.readFile(path.join(dirMigraciones, archivo), 'utf8')
      expect(contenido).not.toMatch(/insert into public\.mant_habilitacion_requerida/)
    }
  })

  it('6. el estado por_vencer/vencido de un contrato se deriva de las fechas y no se puede escribir', async () => {
    const { tenantId } = await crearTenantCompleto('estado-derivado')
    const terceroId = await crearTercero(tenantId, 'Contrato')
    const tipoId = await idListaTipos('TIPO_CONTRATO', 'mantenimiento_preventivo')

    const { data: contrato, error } = await crearContrato({
      tenant_id: tenantId, codigo: `CTR-${RUN_ID}`, tercero_id: terceroId, tipo_id: tipoId,
      objeto: 'Mantenimiento de bombas', fecha_inicio: sumarDias(HOY, -100), fecha_fin: sumarDias(HOY, 10),
    })
    expect(error).toBeNull()
    await admin.from('mant_contratos').update({ estado: 'vigente' }).eq('id', contrato!.id)

    const { data: estadoPorVencer } = await admin
      .rpc('mant_contrato_estado_visible', { p_contrato_id: contrato!.id }).single<string>()
    expect(estadoPorVencer).toBe('por_vencer')

    await admin.from('mant_contratos').update({ fecha_fin: sumarDias(HOY, -1) }).eq('id', contrato!.id)
    const { data: estadoVencido } = await admin
      .rpc('mant_contrato_estado_visible', { p_contrato_id: contrato!.id }).single<string>()
    expect(estadoVencido).toBe('vencido')

    // 'por_vencer'/'vencido' no son valores del enum contrato_estado_t — nunca escribibles.
    const { error: errEscribir } = await admin
      .from('mant_contratos')
      .update({ estado: 'por_vencer' as unknown as Database['public']['Enums']['contrato_estado_t'] })
      .eq('id', contrato!.id)
    expect(errEscribir).not.toBeNull()
  }, 20_000)

  it('7. el comprometido/ejecutado de un contrato se lee de presupuesto_ejecucion', async () => {
    const { tenantId } = await crearTenantCompleto('comprometido-ejecutado')
    const terceroId = await crearTercero(tenantId, 'Ejecucion')
    const tipoId = await idListaTipos('TIPO_CONTRATO', 'suministro')

    const { data: contrato } = await crearContrato({
      tenant_id: tenantId, codigo: `CTR-EJEC-${RUN_ID}`, tercero_id: terceroId, tipo_id: tipoId,
      objeto: 'Suministro de insumos', fecha_inicio: sumarDias(HOY, -30), valor_total: 1_000_000,
    })

    const { data: cuenta } = await admin.from('presupuesto_cuenta')
      .insert({ tenant_id: tenantId, naturaleza: 'egreso', codigo: `5-${RUN_ID}`, nombre: 'Gasto contrato' })
      .select('id').single<{ id: string }>()
    const { data: periodo } = await admin.from('periodos')
      .insert({ tenant_id: tenantId, anio: 2028, mes: 1, estado: 'abierto' })
      .select('id').single<{ id: string }>()

    await admin.from('presupuesto_ejecucion').insert({
      tenant_id: tenantId, cuenta_id: cuenta!.id, periodo_id: periodo!.id, monto: 200_000,
      liquidacion: 'pagado_caja', contrato_id: contrato!.id,
    })
    await admin.from('presupuesto_ejecucion').insert({
      tenant_id: tenantId, cuenta_id: cuenta!.id, periodo_id: periodo!.id, monto: 150_000,
      liquidacion: 'pagado_caja', contrato_id: contrato!.id,
    })
    // Un movimiento del MISMO tenant/cuenta pero de OTRO contrato no debe contarse aquí.
    const { data: otroContrato } = await crearContrato({
      tenant_id: tenantId, codigo: `CTR-OTRO-${RUN_ID}`, tercero_id: terceroId, tipo_id: tipoId,
      objeto: 'Otro contrato', fecha_inicio: sumarDias(HOY, -30),
    })
    await admin.from('presupuesto_ejecucion').insert({
      tenant_id: tenantId, cuenta_id: cuenta!.id, periodo_id: periodo!.id, monto: 999_999,
      liquidacion: 'pagado_caja', contrato_id: otroContrato!.id,
    })

    const { data: ejecucion, error } = await admin
      .rpc('mant_contrato_ejecucion', { p_contrato_id: contrato!.id })
      .single<{ comprometido: number; ejecutado: number }>()
    expect(error).toBeNull()
    expect(ejecucion?.comprometido).toBe(1_000_000)
    expect(ejecucion?.ejecutado).toBe(350_000)
  }, 20_000)

  it('8. el SLA del contrato fija la fecha límite de una OT emitida contra él', async () => {
    const { tenantId, cliente } = await crearTenantCompleto('sla-fecha-limite')
    const terceroId = await crearTercero(tenantId, 'Sla')
    const tipoContratoId = await idListaTipos('TIPO_CONTRATO', 'mantenimiento_preventivo')
    const tipoMantId = await idListaTipos('TIPO_MANTENIMIENTO', 'correctivo')

    const { data: contrato } = await crearContrato({
      tenant_id: tenantId, codigo: `CTR-SLA-${RUN_ID}`, tercero_id: terceroId, tipo_id: tipoContratoId,
      objeto: 'Contrato con SLA', fecha_inicio: sumarDias(HOY, -30), sla_solucion_horas: 48,
    })

    const { data: ot, error } = await crearOt(cliente, {
      tenant_id: tenantId, tipo_mantenimiento_id: tipoMantId, titulo: 'OT contra contrato con SLA',
      contrato_id: contrato!.id,
    })
    expect(error).toBeNull()
    expect(ot?.fecha_limite).toBe(sumarDias(HOY, 2))
  }, 20_000)

  it('9. crear una OT correctiva sobre un activo con garantía vigente produce la advertencia', async () => {
    const { tenantId, cliente } = await crearTenantCompleto('garantia-vigente')
    const categoriaId = await idListaTipos('CATEGORIA_ACTIVO', 'hidraulico')
    const tipoActivoId = await idListaTipos('TIPO_ACTIVO', 'bomba')
    const activoId = await crearActivoMinimo(tenantId, `BOM-GAR-${RUN_ID}`, tipoActivoId, categoriaId)
    const tipoMantId = await idListaTipos('TIPO_MANTENIMIENTO', 'correctivo')

    const { data: garantia, error: errGarantia } = await admin.from('mant_garantias').insert({
      tenant_id: tenantId, activo_id: activoId, origen: 'fabricante',
      vigente_desde: sumarDias(HOY, -100), vigente_hasta: sumarDias(HOY, 200), alcance: 'Motor y sellos',
    }).select('*').single()
    expect(errGarantia).toBeNull()

    // La advertencia es informativa: la OT correctiva se crea igual, nunca se bloquea.
    const { error: errOt } = await crearOt(cliente, {
      tenant_id: tenantId, activo_id: activoId, tipo_mantenimiento_id: tipoMantId, titulo: 'Bomba con fuga',
    })
    expect(errOt).toBeNull()

    const { data: vigentes, error } = await admin.rpc('mant_activo_garantias_vigentes', { p_activo_id: activoId })
    expect(error).toBeNull()
    expect(vigentes).toHaveLength(1)
    expect(vigentes![0]!.garantia_id).toBe(garantia!.id)
  }, 20_000)

  it('10. la evaluación de proveedor muestra desglose por criterio, no solo el puntaje', async () => {
    const { tenantId } = await crearTenantCompleto('evaluacion-desglose')
    const terceroId = await crearTercero(tenantId, 'Evaluado')

    const criterios = {
      puntualidad: { peso: 50, puntaje: 4 },
      calidad: { peso: 50, puntaje: 5 },
    }
    const { data: evaluacion, error } = await admin.from('mant_proveedor_evaluacion').insert({
      tenant_id: tenantId, tercero_id: terceroId, periodo: '2026-T1', criterios, puntaje: 4.5,
    }).select('*').single()
    expect(error).toBeNull()
    expect(evaluacion?.criterios).toEqual(criterios)
    expect(evaluacion?.puntaje).toBe(4.5)

    // Append-only: no se corrige, se registra una nueva.
    const { error: errUpdate } = await admin
      .from('mant_proveedor_evaluacion').update({ puntaje: 5 }).eq('id', evaluacion!.id)
    expect(errUpdate?.message).toContain('APPEND_ONLY')
  }, 20_000)

  it('11. aislamiento entre tenants', async () => {
    const { tenantId: tenantA, cliente: clienteA } = await crearTenantCompleto('aislar-a')
    const { tenantId: tenantB, cliente: clienteB } = await crearTenantCompleto('aislar-b')
    const terceroA = await crearTercero(tenantA, 'AislarA')

    const { error: errCruce } = await admin.from('mant_proveedor_perfil').insert({
      tenant_id: tenantB, tercero_id: terceroA,
    })
    expect(errCruce?.message).toContain('PROVEEDOR_TENANT_INCONSISTENTE')

    const tipoId = await idListaTipos('TIPO_CONTRATO', 'aseo')
    const { data: contratoA } = await crearContrato({
      tenant_id: tenantA, codigo: `CTR-AISLAR-${RUN_ID}`, tercero_id: terceroA, tipo_id: tipoId,
      objeto: 'Contrato del tenant A', fecha_inicio: HOY,
    })
    const { data: visibleDesdeB, error: errSelect } = await clienteB
      .from('mant_contratos').select('id').eq('id', contratoA!.id)
    expect(errSelect).toBeNull()
    expect(visibleDesdeB ?? []).toHaveLength(0)
    void clienteA
  }, 20_000)

  it('12. los enums nuevos del corte tienen COMMENT ON TYPE (D-24)', async () => {
    const fs = await import('node:fs/promises')
    const path = await import('node:path')

    const archivoHabilitacion = path.resolve(
      import.meta.dirname, '../../supabase/migrations/20260931050000_mant5_habilitacion_requerida.sql',
    )
    const contenidoHabilitacion = await fs.readFile(archivoHabilitacion, 'utf8')
    expect(contenidoHabilitacion).toMatch(/create type public\.mant_habilitacion_condicion_t/)
    expect(contenidoHabilitacion).toMatch(/comment on type public\.mant_habilitacion_condicion_t/)

    const archivoContratos = path.resolve(
      import.meta.dirname, '../../supabase/migrations/20260931060000_mant5_contratos.sql',
    )
    const contenidoContratos = await fs.readFile(archivoContratos, 'utf8')
    expect(contenidoContratos).toMatch(/create type public\.contrato_estado_t/)
    expect(contenidoContratos).toMatch(/comment on type public\.contrato_estado_t/)

    const archivoGarantias = path.resolve(
      import.meta.dirname, '../../supabase/migrations/20260931100000_mant5_garantias.sql',
    )
    const contenidoGarantias = await fs.readFile(archivoGarantias, 'utf8')
    expect(contenidoGarantias).toMatch(/create type public\.garantia_origen_t/)
    expect(contenidoGarantias).toMatch(/comment on type public\.garantia_origen_t/)
  })
})
