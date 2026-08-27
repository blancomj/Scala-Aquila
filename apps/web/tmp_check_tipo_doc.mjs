import { readFileSync } from 'node:fs'
import pg from 'pg'
const env = Object.fromEntries(
  readFileSync('../../.env', 'utf8').split('\n').filter((l) => l.includes('=') && !l.startsWith('#')).map((l) => {
    const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()]
  }),
)
const c = new pg.Client({ connectionString: env.SUPABASE_DB_URL, ssl: { rejectUnauthorized: false } })
await c.connect()
const q = async (s, p) => (await c.query(s, p)).rows
console.log('TIPO_DOCUMENTO:', await q(`select codigo, nombre from lista_tipos where tipo='TIPO_DOCUMENTO' order by orden`))
console.log('\ncolumnas documentos_inmueble:', await q(`select column_name, is_nullable from information_schema.columns where table_name='documentos_inmueble' order by ordinal_position`))
await c.end()
