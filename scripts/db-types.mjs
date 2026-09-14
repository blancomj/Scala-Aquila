#!/usr/bin/env node
/**
 * Genera packages/shared/src/database.generated.ts desde el esquema real.
 *
 * Fase I §3.3 / DB-first: el esquema en Postgres manda, los tipos se
 * generan de él, nunca al revés.
 *
 * Vía `--project-id` + SUPABASE_ACCESS_TOKEN (Management API): no requiere
 * Docker/Podman, a diferencia de `--db-url` que levanta un contenedor de
 * introspección (D-11). El token es de la CUENTA, no del proyecto — se lee
 * del archivo de entorno correspondiente y se pasa por variable de entorno
 * al proceso hijo, nunca como argumento de línea de comandos.
 *
 * SUPABASE_URL solo resuelve a project ref cuando es un host
 * "https://<ref>.supabase.co" — por eso, igual que db-push.mjs (D-25), por
 * defecto lee .env (development) y con --prod lee .env.production: contra
 * un SUPABASE_URL local (http://127.0.0.1:...) esto siempre falla, porque
 * ahí no hay project ref que extraer.
 */
import { spawnSync } from 'node:child_process'
import { mkdirSync, writeFileSync } from 'node:fs'
import { config } from 'dotenv'

const esProd = process.argv.slice(2).includes('--prod')
const archivoEnv = esProd ? '.env.production' : '.env'

config({ path: archivoEnv })

const accessToken = process.env.SUPABASE_ACCESS_TOKEN
const supabaseUrl = process.env.SUPABASE_URL

if (!accessToken) {
  console.error(`
  Falta SUPABASE_ACCESS_TOKEN en ${archivoEnv}

  Es un token de tu CUENTA Supabase, no del proyecto. Generarlo en:
    https://supabase.com/dashboard/account/tokens

  Añádelo tú mismo — no lo pegues en el chat:
    SUPABASE_ACCESS_TOKEN=sbp_...
`)
  process.exit(1)
}

if (!supabaseUrl) {
  console.error(`Falta SUPABASE_URL en ${archivoEnv}`)
  process.exit(1)
}

const ref = /^https:\/\/([a-z0-9]+)\.supabase\.co\/?$/.exec(supabaseUrl)?.[1]
if (!ref) {
  console.error(`No se pudo extraer el project ref de SUPABASE_URL: "${supabaseUrl}"`)
  process.exit(1)
}

function citarParaCmd(valor) {
  return `"${valor.replaceAll('"', '""')}"`
}

const comando = ['pnpm', 'exec', 'supabase', 'gen', 'types', 'typescript', '--project-id', ref]
  .map(citarParaCmd)
  .join(' ')

// El token va por entorno, no por argv: evita que quede en la línea de
// comandos citada y en cualquier log de proceso.
const r = spawnSync(comando, {
  encoding: 'utf-8',
  shell: true,
  env: { ...process.env, SUPABASE_ACCESS_TOKEN: accessToken },
})

if (r.error || r.status !== 0) {
  console.error(r.stderr || r.error?.message)
  process.exit(r.status ?? 1)
}

const cabecera = `/**
 * GENERADO — no editar a mano (Fase I §3.3, DB-first).
 * Regenerar con: pnpm db:types
 */
`

mkdirSync('packages/shared/src', { recursive: true })
writeFileSync('packages/shared/src/database.generated.ts', cabecera + r.stdout)
console.log('packages/shared/src/database.generated.ts actualizado.')
