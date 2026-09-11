/**
 * MANT-9 (20260932450000-20260932510000) — salud del activo y apoyo a la decisión.
 * Ver Casos de uso/Tres Modulos/Mantenimiento/MANT_09_salud_decision.md §5 (14 pruebas
 * obligatorias). Las pruebas 3, 8 y 9 son las que impiden que un número se convierta en una
 * decisión (§7, criterio de aceptación).
 *
 * Decisiones del plan aprobadas con el usuario (ver cabecera de 20260932450000): fuente_id FK a
 * lista_tipos (familia FUENTE_SALUD_FACTOR) en vez de texto libre, y "documentación" queda FUERA
 * del catálogo a propósito — pendiente para un corte futuro.
 */
import { afterAll, describe, expect, it } from 'vitest'
import 'dotenv/config'
import { Client } from 'pg'
import type { Database } from '@aquila/shared'
import {
  clienteAdmin,
  eliminarTenant,
  eliminarUsuario,
  crearUsuario,
  clienteComo,
  leerEntorno,
  RUN_ID,
  type UsuarioPrueba,
} from '../rls/helpers.js'

const env = leerEntorno()
const d = env ? describe : describe.skip
if (!env) {
  console.warn('SALTADO tests/mantenimiento/salud-decision: faltan variables de Supabase en .env')
}

const dbUrl = process.env.SUPABASE_DB_URL
const dPg = dbUrl ? describe : describe.skip
if (!dbUrl) {
  console.warn('SALTADO las pruebas estructurales de salud-decision: falta SUPABASE_DB_URL en .env')
}

const ARCHIVOS_CORTE = [
  '20260932450000', '20260932460000', '20260932470000',
  '20260932480000', '20260932490000', '20260932500000', '20260932510000',
]

interface DesgloseFactor {
  factor_codigo: string
  factor_nombre: string
  fuente_codigo: string
  dato_crudo: number | null
  puntaje: number | null
  peso: number
  contribucion: number | null
}
interface SaludResultado {
  indice: number | null
  set_id: string | null
  version: number | null
  desglose: DesgloseFactor[]
}
type Tramo = { hasta: number | null; puntaje: number }

d('MANT-9: salud del activo y apoyo a la decisión', () => {
  const admin = clienteAdmin(env!)
  const tenantsCreados: string[] = []
  const usuariosCreados: UsuarioPrueba[] = []

  afterAll(async () => {
    for (const id of tenantsCreados) await eliminarTenant(admin, id)
    for (const usuario of usuariosCreados) await eliminarUsuario(admin, usuario.id)
  }, 60_000)

  async function crearTenantCompleto(etiqueta: string): Promise<{ tenantId: string }> {
    const usuario = await crearUsuario(admin, etiqueta)
    usuariosCreados.push(usuario)
    const cliente = await clienteComo(env!, usuario)
    const { data: tenant, error } = await cliente
      .rpc('create_tenant', { p_name: `MANT-9 ${etiqueta}`, p_slug: `t9-${RUN_ID}-${etiqueta}` })
      .single<{ id: string }>()
    if (error) throw new Error(`create_tenant (${etiqueta}): ${error.message}`)
    tenantsCreados.push(tenant.id)
    // Addendum MANT-9 (fn_instanciar_salud_factores_default, 20260932530000): create_tenant()
    // ya siembra un mant_salud_set en borrador con 10 factores/4 bandas. Las pruebas de este
    // archivo verifican la mecánica de MANT-9 desde cero (versiones/pesos propios) — se borra
    // la plantilla por defecto para no colisionar con crearSaludSet(tenantId, 1) ni con las
    // pruebas de conteo exacto de factores/bandas.
    const { error: errorBorrado } = await admin.from('mant_salud_set').delete().eq('tenant_id', tenant.id)
    if (errorBorrado) throw new Error(`borrar plantilla salud por defecto: ${errorBorrado.message}`)
    return { tenantId: tenant.id }
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

  async function crearActivoMinimo(tenantId: string, codigo: string): Promise<string> {
    const tipoId = await idListaTipos('TIPO_ACTIVO', 'otro')
    const categoriaId = await idListaTipos('CATEGORIA_ACTIVO', 'otros')
    const { data, error } = await admin
      .from('activos')
      .insert({
        tenant_id: tenantId, codigo, nombre: codigo, categoria_id: categoriaId, tipo_id: tipoId,
        naturaleza_bien: 'bien_propio', origen: 'comprado', estado: 'en_servicio',
      })
      .select('id')
      .single<{ id: string }>()
    if (error) throw new Error(`fixture activo ${codigo}: ${error.message}`)
    return data.id
  }

  async function registrarTransicionEstado(
    tenantId: string,
    activoId: string,
    estadoNuevo: Database['public']['Enums']['activo_estado_t'],
    createdAtIso: string,
  ): Promise<void> {
    const { error } = await admin.from('activo_estado_historial').insert({
      tenant_id: tenantId, activo_id: activoId, estado_nuevo: estadoNuevo, created_at: createdAtIso,
    })
    if (error) throw new Error(`fixture activo_estado_historial: ${error.message}`)
  }

  async function crearPeriodo(tenantId: string, anio: number, mes: number): Promise<string> {
    const { data, error } = await admin
      .from('periodos')
      .insert({ tenant_id: tenantId, anio, mes, estado: 'abierto' })
      .select('id')
      .single<{ id: string }>()
    if (error) throw new Error(`fixture periodo: ${error.message}`)
    return data.id
  }

  async function crearPresupuesto(tenantId: string, anio: number, montoTotal: number): Promise<string> {
    const { data, error } = await admin
      .from('presupuestos')
      .insert({ tenant_id: tenantId, anio, version: 1, monto_total: montoTotal })
      .select('id')
      .single<{ id: string }>()
    if (error) throw new Error(`fixture presupuesto: ${error.message}`)
    return data.id
  }

  async function unaHojaEgreso(tenantId: string): Promise<string> {
    const { data, error } = await admin
      .from('presupuesto_cuenta')
      .select('id, contable_cuenta:contable_cuenta_id!inner(requiere_tercero)')
      .eq('tenant_id', tenantId)
      .eq('naturaleza', 'egreso')
      .eq('es_hoja', true)
      .eq('activa', true)
      .eq('contable_cuenta.requiere_tercero', false)
      .limit(1)
      .single<{ id: string }>()
    if (error) throw new Error(`fixture hoja egreso: ${error.message}`)
    return data.id
  }

  async function registrarEjecucion(
    tenantId: string, cuentaId: string, periodoId: string, monto: number,
    fechaDocumento: string, activoId?: string,
  ): Promise<void> {
    const { error } = await admin.from('presupuesto_ejecucion').insert({
      tenant_id: tenantId, cuenta_id: cuentaId, periodo_id: periodoId, monto,
      liquidacion: 'pagado_caja', fecha_documento: fechaDocumento, activo_id: activoId ?? null,
    })
    if (error) throw new Error(`fixture presupuesto_ejecucion: ${error.message}`)
  }

  async function crearSaludSet(tenantId: string, version: number): Promise<string> {
    const { data, error } = await admin
      .from('mant_salud_set')
      .insert({ tenant_id: tenantId, version })
      .select('id')
      .single<{ id: string }>()
    if (error) throw new Error(`fixture set salud v${String(version)}: ${error.message}`)
    return data.id
  }

  async function crearFactor(
    tenantId: string, setId: string, codigo: string, peso: number, fuenteCodigo: string,
    escala: Tramo[], ventanaDias = 30,
  ): Promise<string> {
    const fuenteId = await idListaTipos('FUENTE_SALUD_FACTOR', fuenteCodigo)
    const { data, error } = await admin
      .from('mant_salud_factor')
      .insert({
        tenant_id: tenantId, set_id: setId, codigo, nombre: codigo,
        peso, fuente_id: fuenteId, ventana_dias: ventanaDias, escala,
      })
      .select('id')
      .single<{ id: string }>()
    if (error) throw new Error(`fixture factor ${codigo}: ${error.message}`)
    return data.id
  }

  async function activarSet(setId: string): Promise<void> {
    const { error } = await admin.from('mant_salud_set').update({ estado: 'vigente' }).eq('id', setId)
    if (error) throw new Error(`activar set ${setId}: ${error.message}`)
  }

  async function crearEscenario(
    tenantId: string, activoId: string,
    tipo: Database['public']['Enums']['escenario_tipo_t'], nombre: string,
  ): Promise<string> {
    const { data, error } = await admin
      .from('mant_escenario')
      .insert({ tenant_id: tenantId, activo_id: activoId, tipo, nombre })
      .select('id')
      .single<{ id: string }>()
    if (error) throw new Error(`fixture escenario ${nombre}: ${error.message}`)
    return data.id
  }

  it('1. pesos que no suman 100 → SALUD_PESOS_INVALIDOS', async () => {
    const { tenantId } = await crearTenantCompleto('p1-pesos')
    const setId = await crearSaludSet(tenantId, 1)
    await crearFactor(tenantId, setId, 'disp', 50, 'disponibilidad', [{ hasta: null, puntaje: 100 }])
    // 50 solo, no 100.

    const { error } = await admin.from('mant_salud_set').update({ estado: 'vigente' }).eq('id', setId)
    expect(error?.message).toContain('SALUD_PESOS_INVALIDOS')

    await crearFactor(tenantId, setId, 'mtbf', 50, 'mtbf', [{ hasta: null, puntaje: 100 }])
    const { error: errOk } = await admin.from('mant_salud_set').update({ estado: 'vigente' }).eq('id', setId)
    expect(errOk).toBeNull()
  }, 20_000)

  it('2. ninguna migración del corte siembra pesos, bandas ni supuestos', async () => {
    const fs = await import('node:fs/promises')
    const path = await import('node:path')
    const dir = path.resolve(import.meta.dirname, '../../supabase/migrations')
    const archivos = (await fs.readdir(dir)).filter((f) => ARCHIVOS_CORTE.some((prefijo) => f.startsWith(prefijo)))
    expect(archivos).toHaveLength(7)
    for (const archivo of archivos) {
      const contenido = await fs.readFile(path.join(dir, archivo), 'utf8')
      expect(contenido).not.toMatch(/insert into public\.mant_salud_factor/i)
      expect(contenido).not.toMatch(/insert into public\.mant_salud_banda/i)
      expect(contenido).not.toMatch(/insert into public\.mant_escenario/i)
    }
  })

  dPg('estructural: mant_salud nunca separa índice de desglose', () => {
    it('3. mant_salud no puede devolver el índice sin el desglose', async () => {
      const client = new Client({ connectionString: dbUrl })
      await client.connect()
      try {
        const { rows } = await client.query<{ proname: string; resultado: string }>(`
          select p.proname, pg_get_function_result(p.oid) as resultado
          from pg_proc p join pg_namespace n on n.oid = p.pronamespace
          where n.nspname = 'public' and p.proname ilike '%salud%'
        `)
        const principal = rows.find((r) => r.proname === 'mant_salud')
        expect(principal, 'mant_salud no existe').toBeTruthy()
        expect(principal!.resultado).toContain('indice')
        expect(principal!.resultado).toContain('desglose')

        // Ninguna otra función devuelve "indice" sin "desglose" — el índice nunca es alcanzable solo.
        const conIndiceSolo = rows.filter((r) =>
          r.proname !== 'mant_salud' && /\bindice\b/i.test(r.resultado) && !/\bdesglose\b/i.test(r.resultado),
        )
        expect(conIndiceSolo).toEqual([])
      } finally {
        await client.end()
      }
    }, 30_000)
  })

  it('4. el índice calculado coincide con el esperado sobre factores y datos conocidos, verificado a mano', async () => {
    const { tenantId } = await crearTenantCompleto('p4-indice-a-mano')
    const activoId = await crearActivoMinimo(tenantId, `ACT-${RUN_ID}-4`)
    const setId = await crearSaludSet(tenantId, 1)
    await crearFactor(tenantId, setId, 'disp', 60, 'disponibilidad',
      [{ hasta: 50, puntaje: 0 }, { hasta: 90, puntaje: 50 }, { hasta: null, puntaje: 100 }], 30)
    await crearFactor(tenantId, setId, 'costo', 40, 'costo',
      [{ hasta: 50_000, puntaje: 100 }, { hasta: 200_000, puntaje: 40 }, { hasta: null, puntaje: 0 }], 30)
    await activarSet(setId)

    // Disponibilidad de enero 2027 (ventana 30 días antes del 31 = todo el mes): en_servicio
    // [1-10) y [15-1feb) = 9+17 = 26 de 31 días ≈ 83.9% → tramo "hasta 90" → puntaje 50 →
    // contribución 50*60/100 = 30.
    await registrarTransicionEstado(tenantId, activoId, 'en_servicio', '2027-01-01T00:00:00Z')
    await registrarTransicionEstado(tenantId, activoId, 'en_mantenimiento', '2027-01-10T00:00:00Z')
    await registrarTransicionEstado(tenantId, activoId, 'en_servicio', '2027-01-15T00:00:00Z')

    // Costo de enero 2027: 100.000 → tramo "hasta 200.000" → puntaje 40 → contribución 40*40/100 = 16.
    const presupuestoId = await crearPresupuesto(tenantId, 2027, 10_000_000)
    const periodoId = await crearPeriodo(tenantId, 2027, 1)
    const hoja = await unaHojaEgreso(tenantId)
    await registrarEjecucion(tenantId, hoja, periodoId, 100_000, '2027-01-15', activoId)
    void presupuestoId

    const { data, error } = await admin
      .rpc('mant_salud', { p_tenant_id: tenantId, p_activo_id: activoId, p_fecha: '2027-01-31' })
      .single<SaludResultado>()
    if (error) throw error
    expect(data.indice).toBeCloseTo(46, 1)
    expect(data.desglose.find((f) => f.factor_codigo === 'disp')?.contribucion).toBeCloseTo(30, 1)
    expect(data.desglose.find((f) => f.factor_codigo === 'costo')?.contribucion).toBeCloseTo(16, 1)
  }, 30_000)

  it('5. cambiar los pesos no altera los snapshots históricos', async () => {
    const { tenantId } = await crearTenantCompleto('p5-snapshot-inmutable')
    const activoId = await crearActivoMinimo(tenantId, `ACT-${RUN_ID}-5`)
    await registrarTransicionEstado(tenantId, activoId, 'en_servicio', '2027-01-01T00:00:00Z')

    const setV1 = await crearSaludSet(tenantId, 1)
    await crearFactor(tenantId, setV1, 'disp', 100, 'disponibilidad', [{ hasta: null, puntaje: 80 }], 30)
    await activarSet(setV1)

    const { data: v1, error: errV1 } = await admin
      .rpc('mant_salud', { p_tenant_id: tenantId, p_activo_id: activoId, p_fecha: '2027-01-31' })
      .single<SaludResultado>()
    if (errV1) throw errV1
    expect(v1.indice).toBe(80)

    const { data: snap, error: errSnap } = await admin
      .from('mant_salud_snapshot')
      .insert({
        tenant_id: tenantId, activo_id: activoId, fecha: '2027-01-31',
        indice: v1.indice!, detalle: v1.desglose as unknown as Database['public']['Tables']['mant_salud_snapshot']['Insert']['detalle'],
        version_factores: v1.version!,
      })
      .select('id')
      .single<{ id: string }>()
    if (errSnap) throw errSnap

    // Nueva versión, pesos distintos — requiere retirar v1 a 'historica' antes de activar v2
    // (mismo patrón que mant_criticidad_set, MANT-1).
    const setV2 = await crearSaludSet(tenantId, 2)
    await crearFactor(tenantId, setV2, 'disp', 50, 'disponibilidad', [{ hasta: null, puntaje: 80 }], 30)
    await crearFactor(tenantId, setV2, 'costo', 50, 'costo', [{ hasta: null, puntaje: 20 }], 30)
    const { error: errRetirar } = await admin.from('mant_salud_set').update({ estado: 'historica' }).eq('id', setV1)
    expect(errRetirar).toBeNull()
    await activarSet(setV2)

    const { data: snapDespues, error: errRelectura } = await admin
      .from('mant_salud_snapshot')
      .select('indice, version_factores')
      .eq('id', snap.id)
      .single<{ indice: number; version_factores: number }>()
    if (errRelectura) throw errRelectura
    expect(snapDespues.indice).toBe(80)
    expect(snapDespues.version_factores).toBe(1)

    const { data: v2, error: errV2 } = await admin
      .rpc('mant_salud', { p_tenant_id: tenantId, p_activo_id: activoId, p_fecha: '2027-01-31' })
      .single<SaludResultado>()
    if (errV2) throw errV2
    expect(v2.indice).toBe(50)
  }, 30_000)

  it('6. mant_salud_explicacion devuelve los hechos concretos que movieron el índice', async () => {
    const { tenantId } = await crearTenantCompleto('p6-explicacion')
    const activoId = await crearActivoMinimo(tenantId, `ACT-${RUN_ID}-6`)
    const setId = await crearSaludSet(tenantId, 1)
    await crearFactor(tenantId, setId, 'disp', 100, 'disponibilidad',
      [{ hasta: 40, puntaje: 0 }, { hasta: 80, puntaje: 60 }, { hasta: null, puntaje: 100 }], 30)
    await activarSet(setId)

    await registrarTransicionEstado(tenantId, activoId, 'en_servicio', '2027-01-01T00:00:00Z')
    await registrarTransicionEstado(tenantId, activoId, 'en_mantenimiento', '2027-02-20T00:00:00Z')

    // Al 4-feb (ventana 30 días: 5-ene a 4-feb) el activo estuvo en_servicio todo el rango →
    // 100% → puntaje 100. Al 1-mar (ventana 30-ene a 1-mar) entró en_mantenimiento el 20-feb →
    // en_servicio 21 de 31 días ≈ 67.7% → tramo "hasta 80" → puntaje 60.
    const { data, error } = await admin.rpc('mant_salud_explicacion', {
      p_tenant_id: tenantId, p_activo_id: activoId, p_desde: '2027-02-04', p_hasta: '2027-03-01',
    })
    if (error) throw error
    expect(data).toHaveLength(1)
    const fila = data[0]!
    expect(fila.factor_codigo).toBe('disp')
    expect(fila.contribucion_desde).toBeCloseTo(100, 1)
    expect(fila.contribucion_hasta).toBeCloseTo(60, 1)
    expect(fila.variacion).toBeCloseTo(-40, 1)
  }, 30_000)

  it('7. un factor con fuente_id fuera del catálogo cerrado falla con SALUD_FACTOR_FUENTE_INVALIDA', async () => {
    const { tenantId } = await crearTenantCompleto('p7-fuente-invalida')
    const setId = await crearSaludSet(tenantId, 1)
    const fuenteAjena = await idListaTipos('TIPO_MANTENIMIENTO', 'correctivo')

    const { error } = await admin.from('mant_salud_factor').insert({
      tenant_id: tenantId, set_id: setId, codigo: 'digitado', nombre: 'Digitado',
      peso: 100, fuente_id: fuenteAjena, escala: [{ hasta: null, puntaje: 100 }],
    })
    expect(error?.message).toContain('SALUD_FACTOR_FUENTE_INVALIDA')

    // Con una fuente válida del catálogo cerrado, el factor sí se guarda y queda identificable.
    const factorId = await crearFactor(tenantId, setId, 'valido', 100, 'costo', [{ hasta: null, puntaje: 20 }])
    const fuenteValida = await idListaTipos('FUENTE_SALUD_FACTOR', 'costo')
    const { data: fila, error: errFila } = await admin
      .from('mant_salud_factor').select('fuente_id').eq('id', factorId).single<{ fuente_id: number }>()
    if (errFila) throw errFila
    expect(fila.fuente_id).toBe(fuenteValida)
  }, 20_000)

  it('8. evaluar un escenario sin todos los supuestos de origen usuario → ESCENARIO_SUPUESTOS_INCOMPLETOS', async () => {
    const { tenantId } = await crearTenantCompleto('p8-supuestos-incompletos')
    const activoId = await crearActivoMinimo(tenantId, `ACT-${RUN_ID}-8`)
    const escenarioId = await crearEscenario(tenantId, activoId, 'reparar', 'Reparar bomba')

    const { error } = await admin.rpc('mant_evaluar_escenario', { p_escenario_id: escenarioId })
    expect(error?.message).toContain('ESCENARIO_SUPUESTOS_INCOMPLETOS')
    expect(error?.message).toContain('costo_reparacion_mayor')
    expect(error?.message).toContain('costo_indisponibilidad')
    expect(error?.message).toContain('vida_util_restante_anios')

    // Con solo uno de los tres, la lista de faltantes ya no lo incluye a él.
    await admin.from('mant_escenario').update({
      supuestos: { costo_reparacion_mayor: { valor: 5_000_000, unidad: 'COP', origen: 'usuario', editable: true } },
    }).eq('id', escenarioId)
    const { error: errParcial } = await admin.rpc('mant_evaluar_escenario', { p_escenario_id: escenarioId })
    expect(errParcial?.message).not.toContain('costo_reparacion_mayor')
    expect(errParcial?.message).toContain('costo_indisponibilidad')
    expect(errParcial?.message).toContain('vida_util_restante_anios')
  }, 20_000)

  dPg('estructural: ningún campo de recomendación única', () => {
    it('9. no existe ningún campo ni retorno de recomendación', async () => {
      const fs = await import('node:fs/promises')
      const path = await import('node:path')
      const archivo = path.resolve(import.meta.dirname, '../../supabase/migrations/20260932500000_mant9_escenario.sql')
      const contenido = await fs.readFile(archivo, 'utf8')
      // Solo código real, no los comentarios que EXPLICAN la prohibición (que sí mencionan la
      // palabra a propósito, ver cabecera del archivo).
      const sinComentarios = contenido.replace(/--.*$/gm, '')
      expect(sinComentarios).not.toMatch(/recomendacion/i)

      const client = new Client({ connectionString: dbUrl })
      await client.connect()
      try {
        const { rows } = await client.query<{ column_name: string }>(`
          select column_name from information_schema.columns
          where table_schema = 'public' and table_name = 'mant_escenario'
        `)
        expect(rows.some((r) => /recomendacion/i.test(r.column_name))).toBe(false)
      } finally {
        await client.end()
      }
    }, 20_000)
  })

  it('10. el escenario exportado contiene todos los supuestos con su origen', async () => {
    const { tenantId } = await crearTenantCompleto('p10-supuestos-origen')
    const activoId = await crearActivoMinimo(tenantId, `ACT-${RUN_ID}-10`)
    const escenarioId = await crearEscenario(tenantId, activoId, 'reemplazar', 'Reemplazar motor')
    await admin.from('mant_escenario').update({
      supuestos: {
        costo_reemplazo: { valor: 8_000_000, unidad: 'COP', origen: 'usuario', editable: true },
        costo_indisponibilidad: { valor: 500_000, unidad: 'COP', origen: 'usuario', editable: true },
      },
    }).eq('id', escenarioId)

    const { data: resultado, error } = await admin.rpc('mant_evaluar_escenario', { p_escenario_id: escenarioId })
    if (error) throw error
    expect('recomendacion' in (resultado as object)).toBe(false)

    const { data: fila, error: errFila } = await admin
      .from('mant_escenario')
      .select('supuestos')
      .eq('id', escenarioId)
      .single<{ supuestos: Record<string, { origen: string }> }>()
    if (errFila) throw errFila
    const claves = [
      'costo_reemplazo', 'costo_indisponibilidad',
      'costo_historico_mantenimiento_anual', 'valor_en_libros', 'depreciacion_acumulada',
    ]
    for (const clave of claves) {
      expect(fila.supuestos[clave], `falta el supuesto ${clave}`).toBeTruthy()
      expect(fila.supuestos[clave]!.origen, `${clave} sin origen`).toBeTruthy()
    }
    expect(fila.supuestos['costo_reemplazo']!.origen).toBe('usuario')
    expect(fila.supuestos['costo_historico_mantenimiento_anual']!.origen).toBe('sistema')
  }, 20_000)

  it('11. mant_proyeccion devuelve datos_insuficientes para el correctivo cuando no hay histórico', async () => {
    const { tenantId } = await crearTenantCompleto('p11-sin-historico')
    const { data, error } = await admin.rpc('mant_proyeccion', { p_tenant_id: tenantId, p_anio: 2027 })
    if (error) throw error
    const correctivo = data.find((f) => f.componente === 'Correctivo esperado')
    expect(correctivo?.datos_insuficientes).toBe(true)
    expect(correctivo?.monto).toBeNull()
  }, 20_000)

  it('12. la comparación contra presupuesto coincide exactamente con presupuesto_cuenta_ejecucion (módulo de Presupuesto)', async () => {
    const { tenantId } = await crearTenantCompleto('p12-presupuesto-exacto')
    const anio = 2027
    const presupuestoId = await crearPresupuesto(tenantId, anio, 10_000_000)
    const periodoId = await crearPeriodo(tenantId, anio, 5)
    const hoja = await unaHojaEgreso(tenantId)
    await registrarEjecucion(tenantId, hoja, periodoId, 300_000, `${String(anio)}-05-10`)

    const { data: esperado, error: errEsperado } = await admin.rpc('presupuesto_cuenta_ejecucion', {
      p_presupuesto_id: presupuestoId,
    })
    if (errEsperado) throw errEsperado
    const { data: real, error: errReal } = await admin.rpc('mant_indicador_financiero_presupuesto', {
      p_tenant_id: tenantId, p_presupuesto_id: presupuestoId, p_cuenta_id: hoja,
    })
    if (errReal) throw errReal

    const filaEsperada = esperado.find((f) => f.cuenta_id === hoja)
    const filaReal = real.find((f) => f.cuenta_id === hoja)
    expect(filaReal?.ejecutado).toBe(300_000)
    expect(filaReal?.ejecutado).toBe(filaEsperada?.ejecutado)
    expect(filaReal?.presupuestado).toBe(filaEsperada?.presupuestado)
  }, 30_000)

  it('13. ninguna migración del corte escribe en presupuestos o presupuesto_rubros', async () => {
    const fs = await import('node:fs/promises')
    const path = await import('node:path')
    const dir = path.resolve(import.meta.dirname, '../../supabase/migrations')
    const archivos = (await fs.readdir(dir)).filter((f) => ARCHIVOS_CORTE.some((prefijo) => f.startsWith(prefijo)))
    for (const archivo of archivos) {
      const contenido = await fs.readFile(path.join(dir, archivo), 'utf8')
      expect(contenido).not.toMatch(/insert into public\.presupuestos\b/i)
      expect(contenido).not.toMatch(/update public\.presupuestos\b/i)
      expect(contenido).not.toMatch(/insert into public\.presupuesto_rubros/i)
      expect(contenido).not.toMatch(/update public\.presupuesto_rubros/i)
    }
  })

  it('14. aislamiento entre tenants: salud, escenarios y proyección no ven datos de otro tenant', async () => {
    const { tenantId: tenantA } = await crearTenantCompleto('p14-aislar-a')
    const { tenantId: tenantB } = await crearTenantCompleto('p14-aislar-b')
    const activoA = await crearActivoMinimo(tenantA, `ACT-${RUN_ID}-A`)
    await registrarTransicionEstado(tenantA, activoA, 'en_servicio', '2027-01-01T00:00:00Z')
    const setA = await crearSaludSet(tenantA, 1)
    await crearFactor(tenantA, setA, 'disp', 100, 'disponibilidad', [{ hasta: null, puntaje: 80 }], 30)
    await activarSet(setA)
    await crearEscenario(tenantA, activoA, 'mantener', 'Mantener bomba A')

    const { data: saludB, error: errSaludB } = await admin
      .rpc('mant_salud', { p_tenant_id: tenantB, p_activo_id: activoA, p_fecha: '2027-01-31' })
      .single<SaludResultado>()
    if (errSaludB) throw errSaludB
    expect(saludB.indice).toBeNull()
    expect(saludB.desglose).toEqual([])

    const { data: escenariosB, error: errEscB } = await admin
      .from('mant_escenario').select('id').eq('tenant_id', tenantB)
    if (errEscB) throw errEscB
    expect(escenariosB).toEqual([])

    const { data: proyeccionB, error: errProy } = await admin
      .rpc('mant_proyeccion', { p_tenant_id: tenantB, p_anio: 2027 })
    if (errProy) throw errProy
    expect(proyeccionB.find((f) => f.componente === 'Renovaciones decididas')?.monto).toBe(0)
  }, 30_000)
})
