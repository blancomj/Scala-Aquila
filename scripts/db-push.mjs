#!/usr/bin/env node
/**
 * Aplica las migraciones de supabase/migrations al proyecto remoto.
 *
 * D-08: sin Docker, no hay stack local. Se usa `supabase db push --db-url`,
 * que no requiere `supabase link` ni access token: solo la cadena de conexión.
 *
 * La cadena se lee de .env (ignorado por git) y NUNCA se imprime.
 * Obtenerla en: Supabase → Project Settings → Database → Connection string → URI
 */
import { spawnSync } from 'node:child_process'
import { config } from 'dotenv'

config()

const dbUrl = process.env.SUPABASE_DB_URL

if (!dbUrl) {
  console.error(`
  Falta SUPABASE_DB_URL en .env

  Añádela tú mismo — no la pegues en el chat:

    SUPABASE_DB_URL=postgresql://postgres:<password>@db.<ref>.supabase.co:5432/postgres

  Está en: Supabase → Project Settings → Database → Connection string → URI
`)
  process.exit(1)
}

const args = process.argv.slice(2)
const esDryRun = args.includes('--dry-run')
const modo = esDryRun ? ['--dry-run'] : []

console.log(`Aplicando migraciones${esDryRun ? ' (dry-run)' : ''}…`)

/**
 * Windows: spawnSync de .cmd con shell:false falla con EINVAL en Node — es
 * una limitación conocida del runtime, no algo que evitemos deshabilitando
 * el shell. Se usa shell:true, pero cada argumento se cita explícitamente
 * (comillas dobles, escapando comillas internas) para que cmd.exe lo trate
 * como un token único y no reinterprete nada dentro de él (DEP0190).
 */
function citarParaCmd(valor) {
  return `"${valor.replaceAll('"', '""')}"`
}

const argumentos = ['exec', 'supabase', 'db', 'push', '--db-url', dbUrl, '--include-all', ...modo]
const comando = ['pnpm', ...argumentos].map(citarParaCmd).join(' ')

const r = spawnSync(comando, { stdio: 'inherit', shell: true })

if (r.error) {
  console.error(`\nNo se pudo ejecutar supabase: ${r.error.message}`)
  process.exit(1)
}

if (r.status !== 0) {
  console.error('\nFallo al aplicar migraciones.')
  process.exit(r.status ?? 1)
}

console.log(esDryRun ? '\nDry-run completado. Nada se escribió.' : '\nMigraciones aplicadas.')
