// E7 · gate de cobertura para las Edge Functions (Deno) — PROMPT_MAESTRO_FASE1.md
// §12.3 exige 100% aquí, igual que financial-kernel/ael-runtime/permissions.ts
// en vitest.config.ts, pero Vitest no puede instrumentar código Deno. Este
// script parsea el lcov que genera `deno coverage --lcov` y falla si algún
// archivo de supabase/functions/_shared/ no llega a 100% en líneas y funciones
// (el reporter de Deno no exporta cobertura de statements por separado).
import { readFileSync } from 'node:fs'

const RUTA_LCOV = 'coverage/edge/lcov.info'

function parsearLcov(texto) {
  const archivos = []
  let actual = null

  for (const linea of texto.split('\n')) {
    if (linea.startsWith('SF:')) {
      // Windows genera rutas absolutas con backslash (SF:E:\...\_shared\http.ts).
      actual = { archivo: linea.slice(3).trim().replaceAll('\\', '/'), lf: 0, lh: 0, fnf: 0, fnh: 0 }
    } else if (linea.startsWith('LF:')) {
      actual.lf = Number(linea.slice(3))
    } else if (linea.startsWith('LH:')) {
      actual.lh = Number(linea.slice(3))
    } else if (linea.startsWith('FNF:')) {
      actual.fnf = Number(linea.slice(4))
    } else if (linea.startsWith('FNH:')) {
      actual.fnh = Number(linea.slice(4))
    } else if (linea.startsWith('end_of_record')) {
      archivos.push(actual)
      actual = null
    }
  }
  return archivos
}

const texto = readFileSync(RUTA_LCOV, 'utf-8')
const archivos = parsearLcov(texto).filter((a) => a.archivo.includes('supabase/functions/_shared/'))

if (archivos.length === 0) {
  console.error(`No se encontró ningún archivo de supabase/functions/_shared/ en ${RUTA_LCOV}.`)
  process.exit(1)
}

let falla = false
for (const a of archivos) {
  const lineas = a.lf === 0 ? 100 : (a.lh / a.lf) * 100
  const funciones = a.fnf === 0 ? 100 : (a.fnh / a.fnf) * 100
  const ok = lineas === 100 && funciones === 100
  console.log(`${ok ? 'OK  ' : 'FAIL'} ${a.archivo} — líneas ${lineas.toFixed(1)}% · funciones ${funciones.toFixed(1)}%`)
  if (!ok) falla = true
}

if (falla) {
  console.error('\nCobertura insuficiente en supabase/functions/_shared/ (se exige 100%, §12.3).')
  process.exit(1)
}
console.log('\nOK: 100% de cobertura en supabase/functions/_shared/.')
