#!/usr/bin/env node
/**
 * Genera packages/shared/src/database.generated.ts desde el esquema real.
 *
 * Fase I §3.3: los tipos de BD se generan, nunca se escriben a mano.
 * Escribe el archivo desde Node (no por redirección de shell, que difiere
 * entre PowerShell/cmd/bash) y antepone la cabecera de "no editar".
 */
import { spawnSync } from 'node:child_process'
import { writeFileSync } from 'node:fs'
import { config } from 'dotenv'

config()

const dbUrl = process.env.SUPABASE_DB_URL
if (!dbUrl) {
  console.error('Falta SUPABASE_DB_URL en .env')
  process.exit(1)
}

function citarParaCmd(valor) {
  return `"${valor.replaceAll('"', '""')}"`
}

const argumentos = ['exec', 'supabase', 'gen', 'types', 'typescript', '--db-url', dbUrl]
const comando = ['pnpm', ...argumentos].map(citarParaCmd).join(' ')

const r = spawnSync(comando, { encoding: 'utf-8', shell: true })

if (r.error || r.status !== 0) {
  console.error(r.stderr || r.error?.message)
  process.exit(r.status ?? 1)
}

const cabecera = `/**
 * GENERADO — no editar a mano (Fase I §3.3).
 * Regenerar con: pnpm db:types
 */
`

writeFileSync('packages/shared/src/database.generated.ts', cabecera + r.stdout)
console.log('packages/shared/src/database.generated.ts actualizado.')
