/**
 * MANT-1 (20260930660000-20260930710000) — atributos técnicos dinámicos y
 * criticidad. Ver Casos de uso/Tres Modulos/Mantenimiento/
 * MANT_01_atributos_criticidad.md §5 (10 pruebas obligatorias).
 *
 * Decisión de diseño (Plan del corte, confirmada con el usuario): jsonb +
 * catálogo de esquema (mant_atributo_definicion), no EAV.
 *
 * Hallazgo de esta sesión, encontrado ANTES de escribir ninguna prueba (por
 * lectura cuidadosa de coeficiente_set_reemplazar_vigente.sql, no por una
 * prueba fallida): reutilizar guard_politica_inmutable tal cual en
 * mant_criticidad_set bloqueaba para siempre la transición vigente->
 * historica, imposibilitando la prueba 7. Corregido en 20260930710000 con
 * un guard dedicado (mismo patrón que coeficiente_sets).
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
  console.warn('SALTADO tests/mantenimiento/atributos-criticidad: faltan variables de Supabase en .env')
}

interface Desglose {
  criterio_codigo: string
  criterio_nombre: string
  peso: number
  valor: string
  puntaje: number
  contribucion: number
}

d('MANT-1: atributos técnicos dinámicos y criticidad', () => {
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
      .rpc('create_tenant', { p_name: `MANT-1 ${etiqueta}`, p_slug: `t-${RUN_ID}-${etiqueta}` })
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

  async function crearActivoMinimo(tenantId: string, codigo: string, tipoId: number, categoriaId: number): Promise<string> {
    const { data, error } = await admin
      .from('activos')
      .insert({
        tenant_id: tenantId,
        codigo,
        nombre: codigo,
        categoria_id: categoriaId,
        tipo_id: tipoId,
        naturaleza_bien: 'bien_propio',
        origen: 'comprado',
      })
      .select('id')
      .single<{ id: string }>()
    if (error) throw new Error(`fixture activo ${codigo}: ${error.message}`)
    return data.id
  }

  interface DefinicionFixture {
    codigo: string
    nombre: string
    tipoDato: 'numero' | 'texto' | 'booleano' | 'fecha' | 'opcion'
    obligatorio?: boolean
    opciones?: string[]
  }

  async function crearDefinicion(tenantId: string, tipoActivoId: number, f: DefinicionFixture): Promise<string> {
    const { data, error } = await admin
      .from('mant_atributo_definicion')
      .insert({
        tenant_id: tenantId,
        tipo_activo_id: tipoActivoId,
        codigo: f.codigo,
        nombre: f.nombre,
        tipo_dato: f.tipoDato,
        obligatorio: f.obligatorio ?? false,
        opciones: f.opciones ?? null,
      })
      .select('id')
      .single<{ id: string }>()
    if (error) throw new Error(`fixture definicion ${f.codigo}: ${error.message}`)
    return data.id
  }

  async function crearSetCriticidad(tenantId: string, version: number): Promise<string> {
    const { data, error } = await admin
      .from('mant_criticidad_set')
      .insert({ tenant_id: tenantId, version })
      .select('id')
      .single<{ id: string }>()
    if (error) throw new Error(`fixture set criticidad v${String(version)}: ${error.message}`)
    return data.id
  }

  async function crearCriterio(
    tenantId: string, setId: string, codigo: string, peso: number, escala: Record<string, number>,
  ): Promise<string> {
    const { data, error } = await admin
      .from('mant_criticidad_criterio')
      .insert({ tenant_id: tenantId, set_id: setId, codigo, nombre: codigo, peso, escala })
      .select('id')
      .single<{ id: string }>()
    if (error) throw new Error(`fixture criterio ${codigo}: ${error.message}`)
    return data.id
  }

  async function activarSet(setId: string): Promise<void> {
    const { error } = await admin.from('mant_criticidad_set').update({ estado: 'vigente' }).eq('id', setId)
    if (error) throw new Error(`activar set ${setId}: ${error.message}`)
  }

  async function evaluar(tenantId: string, activoId: string, criterioId: string, valor: string): Promise<void> {
    const { error } = await admin
      .from('mant_activo_criticidad')
      .upsert(
        { tenant_id: tenantId, activo_id: activoId, criterio_id: criterioId, valor },
        { onConflict: 'activo_id,criterio_id' },
      )
    if (error) throw new Error(`evaluar criterio ${criterioId}: ${error.message}`)
  }

  it('1. un atributo no definido en el esquema del tipo → ATRIBUTO_NO_DEFINIDO', async () => {
    const { tenantId } = await crearTenantCompleto('p1-no-definido')
    const tipoId = await idListaTipos('TIPO_ACTIVO', 'ascensor')
    const categoriaId = await idListaTipos('CATEGORIA_ACTIVO', 'transporte_vertical')
    const activoId = await crearActivoMinimo(tenantId, 'AS-01', tipoId, categoriaId)

    const { error } = await admin
      .from('activos')
      .update({ atributos: { no_existe: 5 } })
      .eq('id', activoId)
    expect(error?.message).toContain('ATRIBUTO_NO_DEFINIDO')
  }, 20_000)

  it('2. un valor de tipo incorrecto → ATRIBUTO_TIPO_INVALIDO', async () => {
    const { tenantId } = await crearTenantCompleto('p2-tipo-invalido')
    const tipoId = await idListaTipos('TIPO_ACTIVO', 'ascensor')
    const categoriaId = await idListaTipos('CATEGORIA_ACTIVO', 'transporte_vertical')
    await crearDefinicion(tenantId, tipoId, { codigo: 'potencia', nombre: 'Potencia', tipoDato: 'numero' })
    const activoId = await crearActivoMinimo(tenantId, 'AS-01', tipoId, categoriaId)

    const { error } = await admin
      .from('activos')
      .update({ atributos: { potencia: 'cinco' } })
      .eq('id', activoId)
    expect(error?.message).toContain('ATRIBUTO_TIPO_INVALIDO')
  }, 20_000)

  it('3. pasar a en_servicio sin un atributo obligatorio → ATRIBUTO_OBLIGATORIO_FALTANTE', async () => {
    const { tenantId } = await crearTenantCompleto('p3-obligatorio')
    const tipoId = await idListaTipos('TIPO_ACTIVO', 'ascensor')
    const categoriaId = await idListaTipos('CATEGORIA_ACTIVO', 'transporte_vertical')
    await crearDefinicion(tenantId, tipoId, { codigo: 'voltaje', nombre: 'Voltaje', tipoDato: 'numero', obligatorio: true })
    const activoId = await crearActivoMinimo(tenantId, 'AS-01', tipoId, categoriaId)

    await admin.from('activos').update({ estado: 'adquirido' }).eq('id', activoId)
    await admin.from('activos').update({ estado: 'instalado' }).eq('id', activoId)
    const { error } = await admin.from('activos').update({ estado: 'en_servicio' }).eq('id', activoId)
    expect(error?.message).toContain('ATRIBUTO_OBLIGATORIO_FALTANTE')

    // Con el atributo obligatorio presente, la misma transición sí procede.
    const { error: errOk } = await admin
      .from('activos')
      .update({ atributos: { voltaje: 220 }, estado: 'en_servicio' })
      .eq('id', activoId)
    expect(errOk).toBeNull()
  }, 20_000)

  it('4. cambiar el esquema de un tipo no borra valores existentes; los huérfanos se reportan', async () => {
    const { tenantId } = await crearTenantCompleto('p4-huerfanos')
    const tipoId = await idListaTipos('TIPO_ACTIVO', 'ascensor')
    const categoriaId = await idListaTipos('CATEGORIA_ACTIVO', 'transporte_vertical')
    const definicionId = await crearDefinicion(tenantId, tipoId, { codigo: 'temperatura', nombre: 'Temperatura', tipoDato: 'numero' })
    const activoId = await crearActivoMinimo(tenantId, 'AS-01', tipoId, categoriaId)

    const { error: errSet } = await admin.from('activos').update({ atributos: { temperatura: 25 } }).eq('id', activoId)
    expect(errSet).toBeNull()

    // "Cambiar el esquema" — se borra la definición (el corte no exige un flag de deshabilitado,
    // solo que el valor ya guardado sobreviva y se reporte como huérfano).
    const { error: errDelete } = await admin.from('mant_atributo_definicion').delete().eq('id', definicionId)
    expect(errDelete).toBeNull()

    const { data: activo, error: errActivo } = await admin
      .from('activos').select('atributos').eq('id', activoId).single<{ atributos: Record<string, unknown> }>()
    if (errActivo) throw errActivo
    expect(activo.atributos).toEqual({ temperatura: 25 })

    const { data: huerfanos, error: errHuerfanos } = await admin.rpc('mant_atributos_huerfanos', { p_tenant_id: tenantId })
    if (errHuerfanos) throw errHuerfanos
    const filas = huerfanos as { activo_id: string; clave: string; valor: number }[]
    expect(filas).toHaveLength(1)
    expect(filas[0]?.activo_id).toBe(activoId)
    expect(filas[0]?.clave).toBe('temperatura')
  }, 20_000)

  it('5. pesos de criticidad que no suman 100 → CRITICIDAD_PESOS_INVALIDOS', async () => {
    const { tenantId } = await crearTenantCompleto('p5-pesos')
    const setId = await crearSetCriticidad(tenantId, 1)
    await crearCriterio(tenantId, setId, 'seguridad', 40, { bajo: 0, alto: 100 })
    await crearCriterio(tenantId, setId, 'costo', 50, { bajo: 0, alto: 100 })
    // 40 + 50 = 90, no 100.

    const { error } = await admin.from('mant_criticidad_set').update({ estado: 'vigente' }).eq('id', setId)
    expect(error?.message).toContain('CRITICIDAD_PESOS_INVALIDOS')

    const { error: errCriterio } = await admin
      .from('mant_criticidad_criterio')
      .insert({ tenant_id: tenantId, set_id: setId, codigo: 'redundancia', nombre: 'redundancia', peso: 10, escala: { no: 0, si: 100 } })
    expect(errCriterio).toBeNull()

    const { error: errOk } = await admin.from('mant_criticidad_set').update({ estado: 'vigente' }).eq('id', setId)
    expect(errOk).toBeNull()
  }, 20_000)

  it('6. mant_criticidad devuelve el puntaje esperado y el desglose por criterio', async () => {
    const { tenantId } = await crearTenantCompleto('p6-puntaje')
    const tipoId = await idListaTipos('TIPO_ACTIVO', 'ascensor')
    const categoriaId = await idListaTipos('CATEGORIA_ACTIVO', 'transporte_vertical')
    const activoId = await crearActivoMinimo(tenantId, 'AS-01', tipoId, categoriaId)

    const setId = await crearSetCriticidad(tenantId, 1)
    const seguridadId = await crearCriterio(tenantId, setId, 'seguridad', 60, { bajo: 0, medio: 50, alto: 100 })
    const costoId = await crearCriterio(tenantId, setId, 'costo', 40, { bajo: 20, alto: 80 })
    await admin.from('mant_criticidad_banda').insert([
      { tenant_id: tenantId, set_id: setId, etiqueta: 'bajo', puntaje_desde: 0, puntaje_hasta: 59.99, orden: 10 },
      { tenant_id: tenantId, set_id: setId, etiqueta: 'alto', puntaje_desde: 60, puntaje_hasta: null, orden: 20 },
    ])
    await activarSet(setId)

    await evaluar(tenantId, activoId, seguridadId, 'alto')
    await evaluar(tenantId, activoId, costoId, 'bajo')
    // Esperado a mano: 60% * 100 + 40% * 20 = 60 + 8 = 68 → banda 'alto'.

    const { data, error } = await admin.rpc('mant_criticidad', { p_activo_id: activoId }).single<{
      puntaje_total: number; banda: string; desglose: Desglose[]
    }>()
    if (error) throw error
    expect(data.puntaje_total).toBe(68)
    expect(data.banda).toBe('alto')
    expect(data.desglose).toHaveLength(2)
    const seguridad = data.desglose.find((d) => d.criterio_codigo === 'seguridad')
    expect(seguridad?.puntaje).toBe(100)
    expect(seguridad?.contribucion).toBe(60)
    const costo = data.desglose.find((d) => d.criterio_codigo === 'costo')
    expect(costo?.puntaje).toBe(20)
    expect(costo?.contribucion).toBe(8)
  }, 20_000)

  it('7. cambiar los pesos no altera las evaluaciones ya registradas con la versión anterior', async () => {
    const { tenantId } = await crearTenantCompleto('p7-version-anterior')
    const tipoId = await idListaTipos('TIPO_ACTIVO', 'ascensor')
    const categoriaId = await idListaTipos('CATEGORIA_ACTIVO', 'transporte_vertical')
    const activoId = await crearActivoMinimo(tenantId, 'AS-01', tipoId, categoriaId)

    const setV1 = await crearSetCriticidad(tenantId, 1)
    const seguridadV1 = await crearCriterio(tenantId, setV1, 'seguridad', 100, { alto: 90 })
    await activarSet(setV1)
    await evaluar(tenantId, activoId, seguridadV1, 'alto')

    const { data: antes, error: errAntes } = await admin
      .from('mant_activo_criticidad').select('valor, puntaje').eq('criterio_id', seguridadV1).single<{ valor: string; puntaje: number }>()
    if (errAntes) throw errAntes
    expect(antes.puntaje).toBe(90)

    // Nueva versión, pesos distintos — requiere retirar v1 a 'historica' antes de activar v2
    // (mismo patrón que coeficiente_sets, fix de 20260930710000).
    const setV2 = await crearSetCriticidad(tenantId, 2)
    await crearCriterio(tenantId, setV2, 'seguridad', 70, { alto: 90 })
    await crearCriterio(tenantId, setV2, 'costo', 30, { alto: 90 })

    const { error: errRetirar } = await admin.from('mant_criticidad_set').update({ estado: 'historica' }).eq('id', setV1)
    expect(errRetirar).toBeNull()
    await activarSet(setV2)

    const { data: despues, error: errDespues } = await admin
      .from('mant_activo_criticidad').select('valor, puntaje').eq('criterio_id', seguridadV1).single<{ valor: string; puntaje: number }>()
    if (errDespues) throw errDespues
    expect(despues).toEqual(antes)

    // El criterio de v1 sigue inmutable — ni su peso ni su escala se pueden tocar.
    const { error: errEditar } = await admin.from('mant_criticidad_criterio').update({ peso: 50 }).eq('id', seguridadV1)
    expect(errEditar?.message).toContain('IMMUTABLE_POLICY')
  }, 20_000)

  it('8. ninguna migración del corte siembra pesos, bandas ni atributos', async () => {
    const fs = await import('node:fs/promises')
    const path = await import('node:path')
    const dir = path.resolve(import.meta.dirname, '../../supabase/migrations')
    const archivos = (await fs.readdir(dir)).filter((f) =>
      f.startsWith('20260930660000') || f.startsWith('20260930670000') || f.startsWith('20260930680000')
      || f.startsWith('20260930690000') || f.startsWith('20260930700000') || f.startsWith('20260930710000'),
    )
    expect(archivos.length).toBeGreaterThan(0)
    for (const archivo of archivos) {
      const contenido = await fs.readFile(path.join(dir, archivo), 'utf8')
      expect(contenido).not.toMatch(/insert into public\.mant_atributo_definicion/i)
      expect(contenido).not.toMatch(/insert into public\.mant_criticidad_criterio/i)
      expect(contenido).not.toMatch(/insert into public\.mant_criticidad_banda/i)
      expect(contenido).not.toMatch(/insert into public\.mant_criticidad_set/i)
    }
  })

  it('9. aislamiento entre tenants', async () => {
    const { tenantId: tenantA } = await crearTenantCompleto('p9-aislamiento-a')
    const { tenantId: tenantB, cliente: clienteB } = await crearTenantCompleto('p9-aislamiento-b')
    const tipoId = await idListaTipos('TIPO_ACTIVO', 'ascensor')
    const categoriaId = await idListaTipos('CATEGORIA_ACTIVO', 'transporte_vertical')

    const definicionIdA = await crearDefinicion(tenantA, tipoId, { codigo: 'x', nombre: 'x', tipoDato: 'numero' })
    const activoIdA = await crearActivoMinimo(tenantA, 'AS-A', tipoId, categoriaId)
    const setIdA = await crearSetCriticidad(tenantA, 1)
    const criterioIdA = await crearCriterio(tenantA, setIdA, 'seguridad', 100, { alto: 90 })

    const { data: defB } = await clienteB.from('mant_atributo_definicion').select('id').eq('id', definicionIdA)
    expect(defB).toEqual([])
    const { data: activoB } = await clienteB.from('activos').select('id').eq('id', activoIdA)
    expect(activoB).toEqual([])
    const { data: setB } = await clienteB.from('mant_criticidad_set').select('id').eq('id', setIdA)
    expect(setB).toEqual([])

    // El activo y el criterio son de tenantA — insertarlos bajo tenant_id=tenantB (con el
    // cliente admin, que sí bypassa RLS) debe seguir bloqueado por la consistencia de tenant que
    // valida guard_activo_criticidad_puntaje, no solo por RLS.
    const { error: errCrossActivo } = await admin
      .from('mant_activo_criticidad')
      .insert({ tenant_id: tenantB, activo_id: activoIdA, criterio_id: criterioIdA, valor: 'alto' })
    expect(errCrossActivo?.message).toContain('ACTIVO_TENANT_INCONSISTENTE')
  }, 20_000)

  it('10. el enum nuevo tiene comment on type', async () => {
    // No hay una vista de pg_catalog expuesta vía PostgREST para leer `obj_description` desde el
    // cliente — se verifica directamente sobre la migración que declara el enum, igual que la
    // prueba 8 verifica ausencia de siembra por lectura de disco, no por RPC.
    const fs = await import('node:fs/promises')
    const path = await import('node:path')
    const archivo = path.resolve(
      import.meta.dirname, '../../supabase/migrations/20260930660000_mant1_atributos_definicion.sql',
    )
    const contenido = await fs.readFile(archivo, 'utf8')
    expect(contenido).toMatch(/create type public\.atributo_tipo_dato_t/)
    expect(contenido).toMatch(/comment on type public\.atributo_tipo_dato_t/)
  })
})
