/**
 * RPT-01 — guardia: el catálogo no puede mentir sobre el esquema.
 *
 * `reporte_campos.codigo` es el nombre REAL de una columna de la vista
 * `reporte_fuentes.objeto_sql`, y es lo que fn_reporte_ejecutar interpola
 * con format(%I). Si alguien renombra una columna de una vista vr_* y no
 * actualiza la semilla, el catálogo sigue ofreciendo un campo que ya no
 * existe y el reporte falla en ejecución, delante del usuario.
 *
 * Este test pide a PostgREST exactamente las columnas que el catálogo
 * promete: si falta una, responde 42703 y el test cae aquí y no en
 * producción. Mismo espíritu que error-codes-coverage.test.ts.
 */
import { beforeAll, describe, expect, it } from 'vitest'
import { clienteAdmin, leerEntorno, type Cliente } from './helpers.js'

const env = leerEntorno()
const d = env ? describe : describe.skip

if (!env) {
  console.warn('SALTADO tests/rls/reportes-catalogo: faltan variables de Supabase en .env')
}

type Fuente = {
  codigo: string
  objeto_sql: string
  filtro_obligatorio: string | null
  reporte_campos: { codigo: string; clase: string; agregacion_default: string | null }[]
}

d('RPT-01 · catálogo contra esquema real', () => {
  let admin: Cliente
  let fuentes: Fuente[]

  beforeAll(async () => {
    admin = clienteAdmin(env!)
    const { data, error } = await admin
      .from('reporte_fuentes')
      .select('codigo, objeto_sql, filtro_obligatorio, reporte_campos(codigo, clase, agregacion_default)')
      .order('codigo')
    if (error) throw new Error(`catálogo: ${error.message}`)
    fuentes = data
  }, 60_000)

  it('hay fuentes sembradas y todas tienen campos', () => {
    expect(fuentes.length).toBeGreaterThan(0)
    for (const fuente of fuentes) {
      expect(fuente.reporte_campos.length, `la fuente ${fuente.codigo} no tiene campos`)
        .toBeGreaterThan(0)
    }
  })

  it('cada campo del catálogo existe en su vista', async () => {
    for (const fuente of fuentes) {
      const columnas = fuente.reporte_campos.map((c) => c.codigo).join(',')
      const { error } = await admin
        .from(fuente.objeto_sql as 'vr_recaudos')
        .select(columnas)
        .limit(0)

      expect(
        error,
        `la fuente ${fuente.codigo} declara columnas que ${fuente.objeto_sql} no tiene: ${error?.message ?? ''}`,
      ).toBeNull()
    }
  }, 60_000)

  it('el filtro obligatorio de una fuente es un campo suyo y filtrable', () => {
    for (const fuente of fuentes.filter((f) => f.filtro_obligatorio)) {
      const codigos = fuente.reporte_campos.map((c) => c.codigo)
      expect(
        codigos,
        `${fuente.codigo} exige filtrar por ${String(fuente.filtro_obligatorio)}, que no está en su catálogo`,
      ).toContain(fuente.filtro_obligatorio)
    }
  })

  it('toda métrica dice cómo se totaliza y ninguna dimensión se agrega', () => {
    for (const fuente of fuentes) {
      for (const campo of fuente.reporte_campos) {
        if (campo.clase === 'metrica') {
          expect(campo.agregacion_default, `${fuente.codigo}.${campo.codigo}`).not.toBeNull()
        } else {
          expect(campo.agregacion_default, `${fuente.codigo}.${campo.codigo}`).toBeNull()
        }
      }
    }
  })

  it('cada reporte de fábrica apunta a una fuente y a campos que existen', async () => {
    const { data, error } = await admin
      .from('reporte_versiones')
      .select('definicion, reportes!inner(codigo, del_sistema)')
      .eq('reportes.del_sistema', true)
      .limit(50)

    expect(error).toBeNull()

    const porFuente = new Map(fuentes.map((f) => [f.codigo, f.reporte_campos.map((c) => c.codigo)]))
    for (const fila of data ?? []) {
      const definicion = fila.definicion as {
        fuente: string
        campos: { campo: string }[]
        filtros?: { campo: string }[]
        orden?: { campo: string }[]
      }
      const disponibles = porFuente.get(definicion.fuente)
      expect(disponibles, `fuente desconocida: ${definicion.fuente}`).toBeDefined()

      const referenciados = [
        ...definicion.campos.map((c) => c.campo),
        ...(definicion.filtros ?? []).map((f) => f.campo),
        ...(definicion.orden ?? []).map((o) => o.campo),
      ]
      for (const codigo of referenciados) {
        expect(disponibles, `${definicion.fuente} no tiene el campo ${codigo}`).toContain(codigo)
      }
    }
  }, 60_000)
})
