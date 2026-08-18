#!/usr/bin/env node
/**
 * Aplica las migraciones de supabase/migrations al proyecto remoto.
 *
 * D-08: sin Docker, no hay stack local. Se usa `supabase db push --db-url`,
 * que no requiere `supabase link` ni access token: solo la cadena de conexión.
 *
 * Por defecto apunta a desarrollo (.env). Con --prod apunta a producción
 * (.env.production) — D-25, promoción siempre manual.
 *
 * La cadena se lee del archivo correspondiente (ignorado por git) y NUNCA se
 * imprime completa (solo el host, para confirmar el destino antes de tocar
 * producción). Obtenerla en:
 * Supabase → Project Settings → Database → Connection string → URI
 *
 * IMPORTANTE para un agente que ejecute esto: la confirmación "si" de abajo
 * es para que la teclee el USUARIO, en el momento, después de que se le haya
 * pedido autorización explícita en el chat para ESE push puntual a
 * producción. Nunca se responde sola (p. ej. `echo si | node
 * scripts/db-push.mjs --prod`) ni se asume implícita porque el paso ya
 * apareciera en un plan aprobado antes — un plan aprobado autoriza el
 * DISEÑO, no el momento de ejecutar el push a producción. Preguntar siempre,
 * de nuevo, en el turno en que se va a correr este comando con --prod.
 */
import { spawnSync } from 'node:child_process'
import { createInterface } from 'node:readline/promises'
import { config } from 'dotenv'

const args = process.argv.slice(2)
const esProd = args.includes('--prod')
const esDryRun = args.includes('--dry-run')
const archivoEnv = esProd ? '.env.production' : '.env'

config({ path: archivoEnv })

const dbUrl = process.env.SUPABASE_DB_URL

if (!dbUrl) {
  console.error(`
  Falta SUPABASE_DB_URL en ${archivoEnv}

  Añádela tú mismo — no la pegues en el chat:

    SUPABASE_DB_URL=postgresql://postgres:<password>@db.<ref>.supabase.co:5432/postgres

  Está en: Supabase → Project Settings → Database → Connection string → URI
`)
  process.exit(1)
}

function hostDesdeUrl(url) {
  try {
    return new URL(url).host
  } catch {
    return '(no se pudo leer el host de la cadena de conexión)'
  }
}

async function confirmarProduccion() {
  console.log(`\nEsto va a aplicar migraciones sobre PRODUCCIÓN: ${hostDesdeUrl(dbUrl)}`)
  const rl = createInterface({ input: process.stdin, output: process.stdout })
  const respuesta = await rl.question('Escribí "si" para continuar: ')
  rl.close()
  if (respuesta.trim().toLowerCase() !== 'si') {
    console.log('Cancelado. Nada se aplicó.')
    process.exit(1)
  }
}

if (esProd && !esDryRun) {
  await confirmarProduccion()
}

const modo = esDryRun ? ['--dry-run'] : []

console.log(
  `Aplicando migraciones${esDryRun ? ' (dry-run)' : ''} a ${esProd ? 'PRODUCCIÓN' : 'desarrollo'}…`,
)

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
