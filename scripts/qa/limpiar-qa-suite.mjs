#!/usr/bin/env node
/**
 * Borra las copropiedades del banco de pruebas QA (slug qa-torres-* /
 * qa-plaza-* / qa-nuevo-*) para poder resembrar desde cero.
 *
 * Existe porque el usuario acotó el banco a un máximo de tres copropiedades:
 * sin esto, cada corrida fallida del seed dejaría un tenant huérfano y en
 * dos tardes habría quince. Borra en dos tiempos — fn_resetear_copropiedad
 * limpia todas las tablas con FK a tenants (cobertura verificada al 100 %,
 * D-99/D-122/D-125/D-126) y después se elimina la fila de tenants.
 *
 * NO toca ninguna otra copropiedad. En particular deja intacto el tenant
 * "QA Integral" sembrado en sesiones anteriores.
 *
 * Uso:
 *   node scripts/qa/limpiar-qa-suite.mjs           → lista lo que borraría
 *   node scripts/qa/limpiar-qa-suite.mjs --si      → lo borra de verdad
 *   node scripts/qa/limpiar-qa-suite.mjs --si --id=<uuid>  → solo ese
 */
import { clienteAdmin, exigirLocal, log, paso } from './lib.mjs'

exigirLocal()

const args = process.argv.slice(2)
const CONFIRMADO = args.includes('--si')
const soloId = args.find((a) => a.startsWith('--id='))?.slice(5)

const admin = clienteAdmin()

const PREFIJOS = ['qa-torres-', 'qa-plaza-', 'qa-nuevo-']

const { data: todos, error } = await admin.from('tenants').select('id, name, slug, created_at')
if (error) throw error

const objetivo = todos.filter((t) =>
  soloId ? t.id === soloId : PREFIJOS.some((p) => t.slug?.startsWith(p)),
)

paso(CONFIRMADO ? 'Borrando copropiedades del banco QA' : 'Copropiedades del banco QA (simulación)')
if (objetivo.length === 0) {
  log('  No hay ninguna. Nada que hacer.')
  process.exit(0)
}

for (const t of objetivo) {
  log(`  ${t.slug.padEnd(22)} ${t.name.padEnd(24)} ${t.id}`)
  if (!CONFIRMADO) continue
  const { error: errorReset } = await admin.rpc('fn_resetear_copropiedad', { p_tenant_id: t.id })
  if (errorReset) {
    log(`    ⚠ reset falló: ${errorReset.message}`)
    continue
  }
  const { error: errorBorrar } = await admin.from('tenants').delete().eq('id', t.id)
  if (errorBorrar) {
    log(`    ⚠ delete falló: ${errorBorrar.message}`)
    continue
  }
  log('    borrada')
}

if (!CONFIRMADO) log('\n  Simulación. Volvé a correrlo con --si para borrarlas de verdad.')
