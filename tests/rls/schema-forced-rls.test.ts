/**
 * T-SEC-01 — PLAN §12.2 / Fase I §6.3 SEC-01
 * Ninguna tabla de `public` sin RLS ENABLE + FORCE.
 *
 * Es el único test de esta suite que va contra Postgres directamente
 * (via SUPABASE_DB_URL) en lugar de PostgREST: necesita leer pg_class,
 * y RLS no aplica a superusuarios/roles con BYPASSRLS de todas formas —
 * este test verifica la CONFIGURACIÓN de la tabla, no su comportamiento.
 */
import { describe, expect, it } from 'vitest'
import 'dotenv/config'
import { Client } from 'pg'

const dbUrl = process.env.SUPABASE_DB_URL
const d = dbUrl ? describe : describe.skip

if (!dbUrl) {
  console.warn('SALTADO tests/rls/schema-forced-rls: falta SUPABASE_DB_URL en .env')
}

interface FilaTabla {
  relname: string
  relrowsecurity: boolean
  relforcerowsecurity: boolean
}

const TABLAS_ESPERADAS = [
  'tenants',
  'profiles',
  'memberships',
  'invitations',
  'audit_log',
  'inmuebles',
  'zonas_comunes',
  'coeficiente_sets',
  'coeficientes',
  'propietarios',
  'inmueble_propietario',
  'periodos',
  'conceptos',
  'politicas_financieras',
  'presupuestos',
  'presupuesto_rubros',
  'fondos',
  'fondo_movimientos',
]

d('T-SEC-01: toda tabla de public tiene RLS ENABLE + FORCE', () => {
  it('enumera pg_class y falla si alguna tabla no cumple', async () => {
    const client = new Client({ connectionString: dbUrl })
    await client.connect()
    try {
      const { rows } = await client.query<FilaTabla>(`
        select c.relname, c.relrowsecurity, c.relforcerowsecurity
        from pg_class c
        join pg_namespace n on n.oid = c.relnamespace
        where n.nspname = 'public'
          and c.relkind = 'r'
        order by c.relname
      `)

      const encontradas = new Set(rows.map((r) => r.relname))
      for (const esperada of TABLAS_ESPERADAS) {
        expect(encontradas.has(esperada), `falta la tabla ${esperada}`).toBe(true)
      }

      const sinRls = rows.filter((r) => !r.relrowsecurity || !r.relforcerowsecurity)
      expect(
        sinRls,
        `tablas sin RLS ENABLE+FORCE: ${sinRls.map((r) => r.relname).join(', ')}`,
      ).toHaveLength(0)
    } finally {
      await client.end()
    }
  }, 30_000)

  it('toda función SECURITY DEFINER declara SET search_path (SEC-08)', async () => {
    const client = new Client({ connectionString: dbUrl })
    await client.connect()
    try {
      const { rows } = await client.query<{ proname: string; proconfig: string[] | null }>(`
        select p.proname, p.proconfig
        from pg_proc p
        join pg_namespace n on n.oid = p.pronamespace
        where n.nspname = 'public'
          and p.prosecdef = true
      `)

      expect(rows.length).toBeGreaterThan(0)

      const sinSearchPath = rows.filter(
        (r) => !r.proconfig?.some((c) => c.startsWith('search_path=')),
      )
      expect(
        sinSearchPath,
        `funciones SECURITY DEFINER sin search_path fijo: ${sinSearchPath
          .map((r) => r.proname)
          .join(', ')}`,
      ).toHaveLength(0)
    } finally {
      await client.end()
    }
  }, 30_000)
})
