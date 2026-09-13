/**
 * MANT-7 (20260932200000-20260932260000) — inspecciones, hallazgos y acciones correctivas.
 * Ver Casos de uso/Tres Modulos/Mantenimiento/MANT_07_inspecciones_hallazgos.md.
 *
 * Decisiones de diseño confirmadas en el Plan del corte (no están en el prompt original, ver
 * cabeceras de las migraciones): (A) inspección + respuestas + hallazgos se registran atómicamente
 * vía fn_mant_registrar_inspeccion, nunca INSERT suelto; (B) el hallazgo vive en su propia tabla,
 * no como fila de mant_cumplimiento; (C) "órgano competente" de GOB-1 se exige solo si el tenant
 * tiene al menos un gobierno_organos vigente, no por si el módulo existe; (D) legal_no_aceptable se
 * detecta vía mant_inspeccion_formatos.requisito_id, no un vínculo propio del hallazgo.
 */
import { afterAll, describe, expect, it } from 'vitest'
import 'dotenv/config'
import { Client } from 'pg'
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
  console.warn('SALTADO tests/mantenimiento/inspecciones-hallazgos: faltan variables de Supabase en .env')
}

const dbUrl = process.env.SUPABASE_DB_URL
const dPg = dbUrl ? describe : describe.skip
if (!dbUrl) {
  console.warn('SALTADO las pruebas estructurales de inspecciones-hallazgos: falta SUPABASE_DB_URL en .env')
}

const FECHA = '2026-02-10'

type InspeccionRow = Database['public']['Tables']['mant_inspecciones']['Row']
type HallazgoRow = Database['public']['Tables']['mant_hallazgos']['Row']

d('MANT-7: inspecciones, hallazgos y acciones correctivas', () => {
  const admin = clienteAdmin(env!)
  const tenantsCreados: string[] = []
  const usuariosCreados: UsuarioPrueba[] = []

  afterAll(async () => {
    for (const id of tenantsCreados) await eliminarTenant(admin, id)
    for (const usuario of usuariosCreados) await eliminarUsuario(admin, usuario.id)
  }, 60_000)

  async function crearTenantCompleto(
    etiqueta: string,
  ): Promise<{ tenantId: string; cliente: Cliente }> {
    const usuario = await crearUsuario(admin, etiqueta)
    usuariosCreados.push(usuario)
    const cliente = await clienteComo(env!, usuario)
    const { data: tenant, error } = await cliente
      .rpc('create_tenant', { p_name: `MANT-7 ${etiqueta}`, p_slug: `t7-${RUN_ID}-${etiqueta}` })
      .single<{ id: string }>()
    if (error) throw new Error(`create_tenant (${etiqueta}): ${error.message}`)
    tenantsCreados.push(tenant.id)
    return { tenantId: tenant.id, cliente }
  }

  async function idListaTipos(tipo: string, codigo: string): Promise<number> {
    const { data, error } = await admin
      .from('lista_tipos')
      .select('id')
      .eq('tipo', tipo)
      .eq('codigo', codigo)
      .is('tenant_id', null)
      .single<{ id: number }>()
    if (error) throw new Error(`fixture lista_tipos ${tipo}.${codigo}: ${error.message}`)
    return data.id
  }

  /** Crea un formato vigente con los ítems dados. Devuelve el id del formato y de cada ítem
   * (en el mismo orden que se pasaron). */
  async function crearFormatoVigente(
    tenantId: string,
    codigo: string,
    items: Array<{ texto: string; severidad: Database['public']['Enums']['severidad_t'] }>,
    requisitoId?: string,
  ): Promise<{ formatoId: string; itemIds: string[] }> {
    const tipoId = await idListaTipos('TIPO_INSPECCION', 'interna')
    const { data: formato, error } = await admin
      .from('mant_inspeccion_formatos')
      .insert({
        tenant_id: tenantId,
        codigo,
        nombre: `Formato ${codigo}`,
        tipo_id: tipoId,
        requisito_id: requisitoId ?? null,
        version: 1,
      })
      .select('id')
      .single<{ id: string }>()
    if (error) throw new Error(`fixture formato ${codigo}: ${error.message}`)

    const itemIds: string[] = []
    let orden = 0
    for (const item of items) {
      orden += 1
      const { data: fila, error: errItem } = await admin
        .from('mant_inspeccion_formato_items')
        .insert({
          tenant_id: tenantId,
          formato_id: formato.id,
          orden,
          texto: item.texto,
          severidad_si_no_conforme: item.severidad,
        })
        .select('id')
        .single<{ id: string }>()
      if (errItem) throw new Error(`fixture ítem ${item.texto}: ${errItem.message}`)
      itemIds.push(fila.id)
    }

    const { error: errActivar } = await admin
      .from('mant_inspeccion_formatos')
      .update({ estado: 'vigente', vigente_desde: FECHA })
      .eq('id', formato.id)
    if (errActivar) throw new Error(`fixture activar formato ${codigo}: ${errActivar.message}`)

    return { formatoId: formato.id, itemIds }
  }

  async function crearRequisito(
    tenantId: string,
    tipoFundamento: Database['public']['Enums']['requisito_tipo_t'],
  ): Promise<string> {
    const { data, error } = await admin
      .from('mant_requisito')
      .insert({
        tenant_id: tenantId,
        nombre: `Requisito ${tipoFundamento}`,
        tipo_fundamento: tipoFundamento,
        norma_referencia: tipoFundamento === 'legal_nacional' ? null : 'Manual de referencia',
      })
      .select('id')
      .single<{ id: string }>()
    if (error) throw new Error(`fixture requisito ${tipoFundamento}: ${error.message}`)
    return data.id
  }

  async function crearOrganoVigente(tenantId: string): Promise<string> {
    const tipoId = await idListaTipos('ORGANO_GOBIERNO', 'administracion')
    const { data, error } = await admin
      .from('gobierno_organos')
      .insert({ tenant_id: tenantId, tipo_id: tipoId, vigente_desde: FECHA })
      .select('id')
      .single<{ id: string }>()
    if (error) throw new Error(`fixture órgano vigente: ${error.message}`)
    return data.id
  }

  async function crearDocumento(tenantId: string): Promise<string> {
    const tipoId = await idListaTipos('TIPO_DOCUMENTO', 'evidencia_ot')
    const { data, error } = await admin
      .from('documentos')
      .insert({
        tenant_id: tenantId,
        tipo_documento_id: tipoId,
        nombre_archivo: 'evidencia.jpg',
        storage_path: `test/${RUN_ID}/evidencia.jpg`,
      })
      .select('id')
      .single<{ id: string }>()
    if (error) throw new Error(`fixture documento: ${error.message}`)
    return data.id
  }

  async function registrarInspeccion(
    cliente: Cliente,
    params: {
      tenantId: string
      formatoId: string
      respuestas: Array<{
        item_id: string
        valor: Database['public']['Enums']['respuesta_valor_t']
        fecha_limite?: string
        evidencia_documento_id?: string
      }>
      resultadoOverride?: Database['public']['Enums']['cumplimiento_resultado_t']
      resultadoMotivo?: string
      terceroId?: string
      acreditacionReferencia?: string
    },
  ) {
    return cliente
      .rpc('fn_mant_registrar_inspeccion', {
        p_tenant_id: params.tenantId,
        p_formato_id: params.formatoId,
        p_fecha: FECHA,
        p_respuestas: params.respuestas,
        ...(params.resultadoOverride !== undefined
          ? { p_resultado_override: params.resultadoOverride }
          : {}),
        ...(params.resultadoMotivo !== undefined ? { p_resultado_motivo: params.resultadoMotivo } : {}),
        ...(params.terceroId !== undefined ? { p_tercero_id: params.terceroId } : {}),
        ...(params.acreditacionReferencia !== undefined
          ? { p_acreditacion_referencia: params.acreditacionReferencia }
          : {}),
      })
      .single<InspeccionRow>()
  }

  it('1. un formato en borrador acepta ítems; una vez vigente, queda inmutable', async () => {
    const { tenantId } = await crearTenantCompleto('formato-inmutable')
    const { formatoId } = await crearFormatoVigente(tenantId, `fmt-${RUN_ID}-1`, [
      { texto: 'Ítem A', severidad: 'menor' },
    ])

    const { error: errItem } = await admin.from('mant_inspeccion_formato_items').insert({
      tenant_id: tenantId,
      formato_id: formatoId,
      orden: 2,
      texto: 'Ítem tardío',
      severidad_si_no_conforme: 'menor',
    })
    expect(errItem?.message).toContain('INSPECCION_FORMATO_ITEM_INMUTABLE')

    const { error: errUpdate } = await admin
      .from('mant_inspeccion_formatos')
      .update({ nombre: 'Otro nombre' })
      .eq('id', formatoId)
    expect(errUpdate?.message).toContain('INSPECCION_FORMATO_INMUTABLE')
  }, 30_000)

  it('2. la versión de un formato se congela en la inspección — una re-versión posterior no la altera (central)', async () => {
    const { tenantId, cliente } = await crearTenantCompleto('congelamiento-version')
    const { formatoId, itemIds } = await crearFormatoVigente(tenantId, `fmt-${RUN_ID}-2`, [
      { texto: 'Ítem A', severidad: 'menor' },
    ])

    const { data: inspeccion, error } = await registrarInspeccion(cliente, {
      tenantId,
      formatoId,
      respuestas: [{ item_id: itemIds[0]!, valor: 'conforme' }],
    })
    expect(error).toBeNull()
    expect(inspeccion!.formato_version).toBe(1)

    // Nueva versión del MISMO código: v2 borrador -> vigente (retira v1 a historica).
    const tipoId = await idListaTipos('TIPO_INSPECCION', 'interna')
    const { data: v2 } = await admin
      .from('mant_inspeccion_formatos')
      .insert({
        tenant_id: tenantId,
        codigo: `fmt-${RUN_ID}-2`,
        nombre: 'Formato v2',
        tipo_id: tipoId,
        version: 2,
      })
      .select('id')
      .single<{ id: string }>()
    await admin.from('mant_inspeccion_formatos').update({ estado: 'historica' }).eq('id', formatoId)
    await admin
      .from('mant_inspeccion_formatos')
      .update({ estado: 'vigente', vigente_desde: FECHA })
      .eq('id', v2!.id)

    const { data: inspeccionReleida } = await admin
      .from('mant_inspecciones')
      .select('formato_version, formato_id')
      .eq('id', inspeccion!.id)
      .single<{ formato_version: number; formato_id: string }>()
    expect(inspeccionReleida!.formato_version).toBe(1)
    expect(inspeccionReleida!.formato_id).toBe(formatoId)
  }, 30_000)

  it('3. el resultado sugerido es conforme/con_hallazgos/no_conforme según las respuestas', async () => {
    const { tenantId, cliente } = await crearTenantCompleto('resultado-sugerido')
    const { formatoId, itemIds } = await crearFormatoVigente(tenantId, `fmt-${RUN_ID}-3`, [
      { texto: 'Ítem menor', severidad: 'menor' },
      { texto: 'Ítem crítico', severidad: 'critico' },
    ])

    const { data: conforme } = await registrarInspeccion(cliente, {
      tenantId,
      formatoId,
      respuestas: [
        { item_id: itemIds[0]!, valor: 'conforme' },
        { item_id: itemIds[1]!, valor: 'conforme' },
      ],
    })
    expect(conforme!.resultado_sugerido).toBe('conforme')

    const { data: conHallazgos } = await registrarInspeccion(cliente, {
      tenantId,
      formatoId,
      respuestas: [
        { item_id: itemIds[0]!, valor: 'no_conforme' },
        { item_id: itemIds[1]!, valor: 'conforme' },
      ],
    })
    expect(conHallazgos!.resultado_sugerido).toBe('con_hallazgos')

    const { data: noConforme } = await registrarInspeccion(cliente, {
      tenantId,
      formatoId,
      respuestas: [
        { item_id: itemIds[0]!, valor: 'conforme' },
        { item_id: itemIds[1]!, valor: 'no_conforme', fecha_limite: '2026-03-01' },
      ],
    })
    expect(noConforme!.resultado_sugerido).toBe('no_conforme')
  }, 30_000)

  it('4. sobrescribir el resultado sin motivo falla con INSPECCION_RESULTADO_SOBRESCRITO_SIN_MOTIVO', async () => {
    const { tenantId, cliente } = await crearTenantCompleto('override-sin-motivo')
    const { formatoId, itemIds } = await crearFormatoVigente(tenantId, `fmt-${RUN_ID}-4`, [
      { texto: 'Ítem A', severidad: 'menor' },
    ])

    const { error } = await registrarInspeccion(cliente, {
      tenantId,
      formatoId,
      respuestas: [{ item_id: itemIds[0]!, valor: 'conforme' }],
      resultadoOverride: 'con_hallazgos',
    })
    expect(error?.message).toContain('INSPECCION_RESULTADO_SOBRESCRITO_SIN_MOTIVO')
  }, 30_000)

  it('5. una respuesta no_conforme genera un hallazgo con la severidad del ítem', async () => {
    const { tenantId, cliente } = await crearTenantCompleto('hallazgo-automatico')
    const { formatoId, itemIds } = await crearFormatoVigente(tenantId, `fmt-${RUN_ID}-5`, [
      { texto: 'Ítem mayor', severidad: 'mayor' },
    ])

    const { data: inspeccion } = await registrarInspeccion(cliente, {
      tenantId,
      formatoId,
      respuestas: [{ item_id: itemIds[0]!, valor: 'no_conforme', fecha_limite: '2026-03-01' }],
    })

    const { data: hallazgos, error } = await admin
      .from('mant_hallazgos')
      .select('*')
      .eq('inspeccion_id', inspeccion!.id)
    expect(error).toBeNull()
    expect(hallazgos).toHaveLength(1)
    expect(hallazgos![0]!.severidad).toBe('mayor')
    expect(hallazgos![0]!.estado).toBe('abierto')
  }, 30_000)

  it('6. un hallazgo crítico/mayor sin fecha_limite falla con HALLAZGO_SIN_FECHA_LIMITE', async () => {
    const { tenantId, cliente } = await crearTenantCompleto('sin-fecha-limite')
    const { formatoId, itemIds } = await crearFormatoVigente(tenantId, `fmt-${RUN_ID}-6`, [
      { texto: 'Ítem crítico', severidad: 'critico' },
    ])

    const { error } = await registrarInspeccion(cliente, {
      tenantId,
      formatoId,
      respuestas: [{ item_id: itemIds[0]!, valor: 'no_conforme' }],
    })
    expect(error?.message).toContain('HALLAZGO_SIN_FECHA_LIMITE')
  }, 30_000)

  it('7. cerrar un hallazgo crítico sin evidencia falla con HALLAZGO_CIERRE_SIN_EVIDENCIA (central)', async () => {
    const { tenantId, cliente } = await crearTenantCompleto('cierre-sin-evidencia')
    const { formatoId, itemIds } = await crearFormatoVigente(tenantId, `fmt-${RUN_ID}-7`, [
      { texto: 'Ítem crítico', severidad: 'critico' },
    ])
    const { data: inspeccion } = await registrarInspeccion(cliente, {
      tenantId,
      formatoId,
      respuestas: [{ item_id: itemIds[0]!, valor: 'no_conforme', fecha_limite: '2026-03-01' }],
    })
    const { data: hallazgo } = await admin
      .from('mant_hallazgos')
      .select('id')
      .eq('inspeccion_id', inspeccion!.id)
      .single<{ id: string }>()

    const { error } = await cliente.rpc('fn_mant_cerrar_hallazgo', { p_hallazgo_id: hallazgo!.id })
    expect(error?.message).toContain('HALLAZGO_CIERRE_SIN_EVIDENCIA')
  }, 30_000)

  it('8. cerrar un hallazgo crítico con evidencia verificada funciona', async () => {
    const { tenantId, cliente } = await crearTenantCompleto('cierre-con-evidencia')
    const { formatoId, itemIds } = await crearFormatoVigente(tenantId, `fmt-${RUN_ID}-8`, [
      { texto: 'Ítem crítico', severidad: 'critico' },
    ])
    const { data: inspeccion } = await registrarInspeccion(cliente, {
      tenantId,
      formatoId,
      respuestas: [{ item_id: itemIds[0]!, valor: 'no_conforme', fecha_limite: '2026-03-01' }],
    })
    const { data: hallazgo } = await admin
      .from('mant_hallazgos')
      .select('id')
      .eq('inspeccion_id', inspeccion!.id)
      .single<{ id: string }>()
    const documentoId = await crearDocumento(tenantId)

    const { data: cerrado, error } = await cliente
      .rpc('fn_mant_cerrar_hallazgo', {
        p_hallazgo_id: hallazgo!.id,
        p_evidencia_documento_id: documentoId,
      })
      .single<HallazgoRow>()
    expect(error).toBeNull()
    expect(cerrado!.estado).toBe('cerrado')
    expect(cerrado!.cerrado_evidencia_documento_id).toBe(documentoId)
  }, 30_000)

  it('9. aceptar un hallazgo sin motivo falla con HALLAZGO_ACEPTACION_SIN_JUSTIFICACION', async () => {
    const { tenantId, cliente } = await crearTenantCompleto('aceptar-sin-motivo')
    const { formatoId, itemIds } = await crearFormatoVigente(tenantId, `fmt-${RUN_ID}-9`, [
      { texto: 'Ítem menor', severidad: 'menor' },
    ])
    const { data: inspeccion } = await registrarInspeccion(cliente, {
      tenantId,
      formatoId,
      respuestas: [{ item_id: itemIds[0]!, valor: 'no_conforme' }],
    })
    const { data: hallazgo } = await admin
      .from('mant_hallazgos')
      .select('id')
      .eq('inspeccion_id', inspeccion!.id)
      .single<{ id: string }>()

    const { error } = await cliente.rpc('fn_mant_aceptar_hallazgo', {
      p_hallazgo_id: hallazgo!.id,
      p_motivo: '',
    })
    expect(error?.message).toContain('HALLAZGO_ACEPTACION_SIN_JUSTIFICACION')
  }, 30_000)

  it('10. aceptar un hallazgo crítico sin órgano falla cuando el tenant tiene GOB-1 vigente', async () => {
    const { tenantId, cliente } = await crearTenantCompleto('aceptar-critico-sin-organo')
    await crearOrganoVigente(tenantId)
    const { formatoId, itemIds } = await crearFormatoVigente(tenantId, `fmt-${RUN_ID}-10`, [
      { texto: 'Ítem crítico', severidad: 'critico' },
    ])
    const { data: inspeccion } = await registrarInspeccion(cliente, {
      tenantId,
      formatoId,
      respuestas: [{ item_id: itemIds[0]!, valor: 'no_conforme', fecha_limite: '2026-03-01' }],
    })
    const { data: hallazgo } = await admin
      .from('mant_hallazgos')
      .select('id')
      .eq('inspeccion_id', inspeccion!.id)
      .single<{ id: string }>()

    const { error } = await cliente.rpc('fn_mant_aceptar_hallazgo', {
      p_hallazgo_id: hallazgo!.id,
      p_motivo: 'Riesgo asumido temporalmente',
    })
    expect(error?.message).toContain('HALLAZGO_ACEPTACION_SIN_JUSTIFICACION')
  }, 30_000)

  it('11. aceptar un hallazgo crítico funciona solo con motivo cuando el tenant NO tiene GOB-1 vigente', async () => {
    const { tenantId, cliente } = await crearTenantCompleto('aceptar-critico-sin-gob1')
    const { formatoId, itemIds } = await crearFormatoVigente(tenantId, `fmt-${RUN_ID}-11`, [
      { texto: 'Ítem crítico', severidad: 'critico' },
    ])
    const { data: inspeccion } = await registrarInspeccion(cliente, {
      tenantId,
      formatoId,
      respuestas: [{ item_id: itemIds[0]!, valor: 'no_conforme', fecha_limite: '2026-03-01' }],
    })
    const { data: hallazgo } = await admin
      .from('mant_hallazgos')
      .select('id')
      .eq('inspeccion_id', inspeccion!.id)
      .single<{ id: string }>()

    const { data: aceptado, error } = await cliente
      .rpc('fn_mant_aceptar_hallazgo', {
        p_hallazgo_id: hallazgo!.id,
        p_motivo: 'Riesgo asumido temporalmente',
      })
      .single<HallazgoRow>()
    expect(error).toBeNull()
    expect(aceptado!.estado).toBe('aceptado')
  }, 30_000)

  it('12. un hallazgo de origen legal nunca se puede aceptar, ni con motivo ni con órgano (central)', async () => {
    const { tenantId, cliente } = await crearTenantCompleto('legal-no-aceptable')
    await crearOrganoVigente(tenantId)
    const organoId = await crearOrganoVigente(tenantId) // segundo órgano, evita chocar con unicidad
    const requisitoId = await crearRequisito(tenantId, 'legal_nacional')
    const { formatoId, itemIds } = await crearFormatoVigente(
      tenantId,
      `fmt-${RUN_ID}-12`,
      [{ texto: 'Ítem legal crítico', severidad: 'critico' }],
      requisitoId,
    )
    const { data: inspeccion } = await registrarInspeccion(cliente, {
      tenantId,
      formatoId,
      respuestas: [{ item_id: itemIds[0]!, valor: 'no_conforme', fecha_limite: '2026-03-01' }],
    })
    const { data: hallazgo } = await admin
      .from('mant_hallazgos')
      .select('id')
      .eq('inspeccion_id', inspeccion!.id)
      .single<{ id: string }>()

    const { error } = await cliente.rpc('fn_mant_aceptar_hallazgo', {
      p_hallazgo_id: hallazgo!.id,
      p_motivo: 'Se intenta aceptar de todas formas',
      p_organo_id: organoId,
    })
    expect(error?.message).toContain('HALLAZGO_LEGAL_NO_ACEPTABLE')
  }, 30_000)

  it('13. una inspección completada genera mant_cumplimiento cuando el formato demuestra un requisito', async () => {
    const { tenantId, cliente } = await crearTenantCompleto('cumplimiento-generado')
    const requisitoId = await crearRequisito(tenantId, 'interno')
    const { formatoId, itemIds } = await crearFormatoVigente(
      tenantId,
      `fmt-${RUN_ID}-13`,
      [{ texto: 'Ítem A', severidad: 'menor' }],
      requisitoId,
    )
    const { data: inspeccion, error } = await registrarInspeccion(cliente, {
      tenantId,
      formatoId,
      respuestas: [{ item_id: itemIds[0]!, valor: 'conforme' }],
    })
    expect(error).toBeNull()
    expect(inspeccion!.cumplimiento_id).not.toBeNull()

    const { data: cumplimiento } = await admin
      .from('mant_cumplimiento')
      .select('requisito_id')
      .eq('id', inspeccion!.cumplimiento_id!)
      .single<{ requisito_id: string }>()
    expect(cumplimiento!.requisito_id).toBe(requisitoId)
  }, 30_000)

  it('13b. sin acreditación cuando el requisito la exige, falla con INSPECCION_CUMPLIMIENTO_SIN_ACREDITACION', async () => {
    const { tenantId, cliente } = await crearTenantCompleto('cumplimiento-sin-acreditacion')
    const { data: requisito, error: errRequisito } = await admin
      .from('mant_requisito')
      .insert({
        tenant_id: tenantId,
        nombre: 'Requisito acreditado',
        tipo_fundamento: 'tecnico_fabricante',
        norma_referencia: 'Manual del fabricante',
        requiere_tercero_acreditado: true,
      })
      .select('id')
      .single<{ id: string }>()
    expect(errRequisito).toBeNull()
    const { formatoId, itemIds } = await crearFormatoVigente(
      tenantId,
      `fmt-${RUN_ID}-13b`,
      [{ texto: 'Ítem A', severidad: 'menor' }],
      requisito!.id,
    )

    const { error } = await registrarInspeccion(cliente, {
      tenantId,
      formatoId,
      respuestas: [{ item_id: itemIds[0]!, valor: 'conforme' }],
    })
    expect(error?.message).toContain('INSPECCION_CUMPLIMIENTO_SIN_ACREDITACION')
  }, 30_000)

  it('14. mant_hallazgos_abiertos ordena por severidad y antigüedad, y marca los vencidos', async () => {
    const { tenantId, cliente } = await crearTenantCompleto('panel-abiertos')
    const { formatoId, itemIds } = await crearFormatoVigente(tenantId, `fmt-${RUN_ID}-14`, [
      { texto: 'Ítem menor', severidad: 'menor' },
      { texto: 'Ítem crítico vencido', severidad: 'critico' },
    ])
    await registrarInspeccion(cliente, {
      tenantId,
      formatoId,
      respuestas: [
        { item_id: itemIds[0]!, valor: 'no_conforme' },
        { item_id: itemIds[1]!, valor: 'no_conforme', fecha_limite: '2020-01-01' },
      ],
    })

    const { data: abiertos, error } = await admin.rpc('mant_hallazgos_abiertos', {
      p_tenant_id: tenantId,
    })
    expect(error).toBeNull()
    expect(abiertos).toHaveLength(2)
    expect(abiertos![0]!.severidad).toBe('critico')
    expect(abiertos![0]!.vencido).toBe(true)
    expect(abiertos![1]!.severidad).toBe('menor')
  }, 30_000)

  it('15. trazabilidad bidireccional: inspección → hallazgo → OT → cierre, navegable en ambos sentidos', async () => {
    const { tenantId, cliente } = await crearTenantCompleto('trazabilidad')
    const { formatoId, itemIds } = await crearFormatoVigente(tenantId, `fmt-${RUN_ID}-15`, [
      { texto: 'Ítem mayor', severidad: 'mayor' },
    ])
    const { data: inspeccion } = await registrarInspeccion(cliente, {
      tenantId,
      formatoId,
      respuestas: [{ item_id: itemIds[0]!, valor: 'no_conforme', fecha_limite: '2026-03-01' }],
    })
    const { data: hallazgo } = await admin
      .from('mant_hallazgos')
      .select('id')
      .eq('inspeccion_id', inspeccion!.id)
      .single<{ id: string }>()

    const tipoMantId = await idListaTipos('TIPO_MANTENIMIENTO', 'correctivo')
    const { data: ot, error: errOt } = await admin
      .from('mant_ordenes_trabajo')
      .insert({
        tenant_id: tenantId,
        titulo: 'OT desde hallazgo',
        tipo_mantenimiento_id: tipoMantId,
        origen: 'inspeccion',
        inspeccion_id: inspeccion!.id,
      })
      .select('id')
      .single<{ id: string }>()
    expect(errOt).toBeNull()

    const { data: asignado, error } = await cliente
      .rpc('fn_mant_asignar_ot_hallazgo', { p_hallazgo_id: hallazgo!.id, p_ot_id: ot!.id })
      .single<HallazgoRow>()
    expect(error).toBeNull()
    expect(asignado!.estado).toBe('en_tratamiento')
    expect(asignado!.ot_id).toBe(ot!.id)

    // Navegable en ambos sentidos: OT -> inspección (FK real) e inspección -> hallazgo -> OT.
    const { data: otReleida } = await admin
      .from('mant_ordenes_trabajo')
      .select('inspeccion_id')
      .eq('id', ot!.id)
      .single<{ inspeccion_id: string }>()
    expect(otReleida!.inspeccion_id).toBe(inspeccion!.id)

    const documentoId = await crearDocumento(tenantId)
    const { data: cerrado } = await cliente
      .rpc('fn_mant_cerrar_hallazgo', { p_hallazgo_id: hallazgo!.id, p_evidencia_documento_id: documentoId })
      .single<HallazgoRow>()
    expect(cerrado!.estado).toBe('cerrado')

    const { data: actuaciones } = await admin
      .from('mant_hallazgo_actuaciones')
      .select('estado_desde, estado_hasta')
      .eq('hallazgo_id', hallazgo!.id)
      .order('created_at')
    expect(actuaciones).toHaveLength(2)
    expect(actuaciones![0]).toMatchObject({ estado_desde: 'abierto', estado_hasta: 'en_tratamiento' })
    expect(actuaciones![1]).toMatchObject({ estado_desde: 'en_tratamiento', estado_hasta: 'cerrado' })
  }, 30_000)

  it('16. la bitácora de actuaciones es append-only: update y delete fallan', async () => {
    const { tenantId, cliente } = await crearTenantCompleto('actuaciones-append-only')
    const { formatoId, itemIds } = await crearFormatoVigente(tenantId, `fmt-${RUN_ID}-16`, [
      { texto: 'Ítem menor', severidad: 'menor' },
    ])
    const { data: inspeccion } = await registrarInspeccion(cliente, {
      tenantId,
      formatoId,
      respuestas: [{ item_id: itemIds[0]!, valor: 'no_conforme' }],
    })
    const { data: hallazgo } = await admin
      .from('mant_hallazgos')
      .select('id')
      .eq('inspeccion_id', inspeccion!.id)
      .single<{ id: string }>()
    await cliente.rpc('fn_mant_aceptar_hallazgo', { p_hallazgo_id: hallazgo!.id, p_motivo: 'motivo' })

    const { data: actuacion } = await admin
      .from('mant_hallazgo_actuaciones')
      .select('id')
      .eq('hallazgo_id', hallazgo!.id)
      .single<{ id: string }>()

    const { error: errUpdate } = await admin
      .from('mant_hallazgo_actuaciones')
      .update({ descripcion: 'editado' })
      .eq('id', actuacion!.id)
    expect(errUpdate?.message).toContain('APPEND_ONLY')

    const { error: errDelete } = await admin
      .from('mant_hallazgo_actuaciones')
      .delete()
      .eq('id', actuacion!.id)
    expect(errDelete?.message).toContain('APPEND_ONLY')
  }, 30_000)

  it('17. aislamiento entre tenants', async () => {
    const { tenantId: tenantA } = await crearTenantCompleto('aislamiento-a')
    const { tenantId: tenantB, cliente: clienteB } = await crearTenantCompleto('aislamiento-b')
    const { formatoId } = await crearFormatoVigente(tenantA, `fmt-${RUN_ID}-17`, [
      { texto: 'Ítem A', severidad: 'menor' },
    ])

    const { data: visible } = await clienteB
      .from('mant_inspeccion_formatos')
      .select('id')
      .eq('id', formatoId)
    expect(visible).toHaveLength(0)

    const { error } = await registrarInspeccion(clienteB, {
      tenantId: tenantB,
      formatoId,
      respuestas: [],
    })
    expect(error).not.toBeNull()
  }, 30_000)

  it('19. fn_buscar_global (categoría hallazgo_mantenimiento, 20260934020000) encuentra el hallazgo por su descripción', async () => {
    const sello = String(Date.now())
    const { tenantId, cliente } = await crearTenantCompleto('busqueda-hallazgo')
    const { formatoId, itemIds } = await crearFormatoVigente(tenantId, `fmt-bgd-${RUN_ID}`, [
      { texto: `Fuga de agua Zafiro${sello}`, severidad: 'mayor' },
    ])

    const { data: inspeccion, error: errInsp } = await registrarInspeccion(cliente, {
      tenantId, formatoId,
      respuestas: [{ item_id: itemIds[0]!, valor: 'no_conforme', fecha_limite: '2026-03-01' }],
    })
    expect(errInsp).toBeNull()

    const { data: hallazgo } = await admin
      .from('mant_hallazgos').select('id').eq('inspeccion_id', inspeccion!.id).single<{ id: string }>()

    const { data: filas, error } = await admin.rpc('fn_buscar_global', {
      p_tenant_id: tenantId, p_query: `Zafiro${sello}`, p_categoria: 'hallazgo_mantenimiento', p_limite: 20,
    })
    expect(error).toBeNull()
    const resultados = filas as { entidad_id: string; titulo: string; subtitulo: string }[]
    expect(resultados).toHaveLength(1)
    expect(resultados[0]?.entidad_id).toBe(hallazgo!.id)
    expect(resultados[0]?.subtitulo).toBe('Mayor · Abierto')
  }, 30_000)

  dPg('estructural: guard_mant_inspeccion_flag bloquea INSERT directo', () => {
    it('18. mant_inspecciones/mant_inspeccion_respuestas/mant_hallazgos no se pueden insertar directo', async () => {
      const client = new Client({ connectionString: dbUrl })
      await client.connect()
      try {
        const { rows } = await client.query<{ definicion: string }>(`
          select pg_get_functiondef(p.oid) as definicion
          from pg_proc p
          join pg_namespace n on n.oid = p.pronamespace
          where n.nspname = 'public' and p.proname = 'guard_mant_inspeccion_flag'
        `)
        expect(rows).toHaveLength(1)
        expect(rows[0]!.definicion.toLowerCase()).toContain('aquila.registrando_inspeccion')
      } finally {
        await client.end()
      }
    }, 30_000)
  })
})
