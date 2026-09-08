/**
 * Doc 14 (registro de errores) — test-guardia: todo código de error que
 * aparezca en `raise exception 'CODIGO: ...'` (migraciones SQL) o
 * `errorResponse(status, 'CODIGO', ...)` (Edge Functions) debe estar
 * registrado en packages/shared/src/error-codes.ts. Puramente estático —
 * sin red, sin Supabase, corre siempre.
 */
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { ERROR_CODES } from '../../packages/shared/src/error-codes.js'

const RAIZ = join(import.meta.dirname, '..', '..')
const CODIGOS_REGISTRADOS = new Set<string>(Object.values(ERROR_CODES))

function codigosEnMigraciones(): Map<string, string[]> {
  const dir = join(RAIZ, 'supabase', 'migrations')
  const encontrados = new Map<string, string[]>()
  for (const archivo of readdirSync(dir)) {
    if (!archivo.endsWith('.sql')) continue
    const contenido = readFileSync(join(dir, archivo), 'utf-8')
    for (const m of contenido.matchAll(/raise exception '([A-Z][A-Z_]+):/g)) {
      const codigo = m[1]
      if (!codigo) continue
      const archivos = encontrados.get(codigo) ?? []
      archivos.push(archivo)
      encontrados.set(codigo, archivos)
    }
  }
  return encontrados
}

/** Todo .ts no-test dentro de una carpeta de supabase/functions (index.ts de cada función, y _shared/*.ts). */
function archivosTsFuente(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true })
    .filter((e) => e.isFile() && e.name.endsWith('.ts') && !e.name.endsWith('.test.ts'))
    .map((e) => e.name)
}

function codigosEnEdgeFunctions(): Map<string, string[]> {
  const dir = join(RAIZ, 'supabase', 'functions')
  const encontrados = new Map<string, string[]>()
  // supabase/functions/ también puede tener archivos sueltos (p.ej. .env de
  // secretos locales, gitignored) junto a las carpetas de cada función.
  for (const carpeta of readdirSync(dir, { withFileTypes: true }).filter((e) => e.isDirectory()).map((e) => e.name)) {
    const rutaCarpeta = join(dir, carpeta)
    for (const archivo of archivosTsFuente(rutaCarpeta)) {
      const contenido = readFileSync(join(rutaCarpeta, archivo), 'utf-8')
      // \s* tolera saltos de línea entre argumentos (errorResponse suele
      // formatearse en varias líneas) — \s ya cubre \n sin flag "s" extra.
      for (const m of contenido.matchAll(/errorResponse\(\s*\d+,\s*'([A-Z][A-Z_]+)'/g)) {
        const codigo = m[1]
        if (!codigo) continue
        const archivos = encontrados.get(codigo) ?? []
        archivos.push(`${carpeta}/${archivo}`)
        encontrados.set(codigo, archivos)
      }
    }
  }
  return encontrados
}

describe('registro de errores (Doc 14) — cobertura de ERROR_CODES', () => {
  it('todo código usado en migraciones SQL está en ERROR_CODES', () => {
    const usados = codigosEnMigraciones()
    const faltantes = [...usados.keys()].filter((c) => !CODIGOS_REGISTRADOS.has(c))
    if (faltantes.length > 0) {
      const detalle = faltantes
        .map((c) => `${c} (${(usados.get(c) ?? []).join(', ')})`)
        .join('\n  ')
      throw new Error(
        `Códigos de error en migraciones SQL sin registrar en error-codes.ts:\n  ${detalle}`,
      )
    }
    expect(faltantes).toEqual([])
  })

  it('todo código usado en errorResponse() de Edge Functions está en ERROR_CODES', () => {
    const usados = codigosEnEdgeFunctions()
    const faltantes = [...usados.keys()].filter((c) => !CODIGOS_REGISTRADOS.has(c))
    if (faltantes.length > 0) {
      const detalle = faltantes
        .map((c) => `${c} (${(usados.get(c) ?? []).join(', ')})`)
        .join('\n  ')
      throw new Error(
        `Códigos de error en Edge Functions sin registrar en error-codes.ts:\n  ${detalle}`,
      )
    }
    expect(faltantes).toEqual([])
  })
})
