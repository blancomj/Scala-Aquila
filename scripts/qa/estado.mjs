#!/usr/bin/env node
/**
 * Estado del plan de pruebas: qué se ejecutó, qué falta, qué falló.
 *
 * Lee qa/plan.json (los 222 casos) y qa/resultados.jsonl (append-only, la
 * última línea de cada ítem manda) y responde tres preguntas distintas
 * según cómo se lo invoque:
 *
 *   node scripts/qa/estado.mjs              → avance por fase + hallazgos
 *   node scripts/qa/estado.mjs --siguiente  → el próximo ítem sin ejecutar
 *   node scripts/qa/estado.mjs --fase=f2    → detalle de una fase
 *   node scripts/qa/estado.mjs --json       → el mismo estado, para un script
 */
import fs from 'node:fs'

const args = process.argv.slice(2)
const arg = (n) => args.find((a) => a.startsWith(`--${n}=`))?.slice(n.length + 3)

const plan = JSON.parse(fs.readFileSync('qa/plan.json', 'utf8'))
const lineas = fs.existsSync('qa/resultados.jsonl')
  ? fs.readFileSync('qa/resultados.jsonl', 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l))
  : []

/** La última línea de cada ítem es la que vale. */
const ultimo = new Map()
for (const r of lineas) ultimo.set(r.item, r)

const SIMBOLO = { aprobado: '✓', fallido: '✗', bloqueado: '⊘', no_aplica: '—', parcial: '~' }

const porFase = plan.fases.map((f) => {
  const items = plan.items.filter((i) => i.fase === f.id)
  const conteo = { aprobado: 0, fallido: 0, bloqueado: 0, no_aplica: 0, parcial: 0, sin_ejecutar: 0 }
  for (const it of items) conteo[ultimo.get(it.codigo)?.estado ?? 'sin_ejecutar']++
  const evaluados = items.length - conteo.sin_ejecutar
  return { ...f, total: items.length, ...conteo, evaluados }
})

const totales = porFase.reduce(
  (acc, f) => {
    for (const k of ['aprobado', 'fallido', 'bloqueado', 'no_aplica', 'parcial', 'sin_ejecutar']) acc[k] += f[k]
    return acc
  },
  { aprobado: 0, fallido: 0, bloqueado: 0, no_aplica: 0, parcial: 0, sin_ejecutar: 0 },
)

const siguiente = plan.items.find((i) => !ultimo.has(i.codigo))

if (args.includes('--json')) {
  process.stdout.write(JSON.stringify({ totales, porFase, siguiente: siguiente ?? null }, null, 2) + '\n')
  process.exit(0)
}

if (args.includes('--siguiente')) {
  if (!siguiente) {
    process.stdout.write('No queda ningún ítem sin ejecutar.\n')
    process.exit(0)
  }
  process.stdout.write(
    `${siguiente.codigo} · ${siguiente.faseTitulo}\n` +
      `  Acción:  ${siguiente.accion}\n` +
      `  Aprueba: ${siguiente.criterioAprobacion}\n` +
      `  Rutas:   ${siguiente.rutas.join(' ') || '—'}\n`,
  )
  process.exit(0)
}

const faseFiltro = arg('fase')
if (faseFiltro) {
  const items = plan.items.filter((i) => i.fase === faseFiltro)
  if (!items.length) {
    process.stderr.write(`No existe la fase "${faseFiltro}".\n`)
    process.exit(1)
  }
  process.stdout.write(`\n${faseFiltro.toUpperCase()} · ${items[0].faseTitulo}\n\n`)
  for (const it of items) {
    const r = ultimo.get(it.codigo)
    const s = r ? SIMBOLO[r.estado] : ' '
    process.stdout.write(`  ${s} ${it.codigo}  ${it.accion.slice(0, 84)}\n`)
    if (r?.estado === 'fallido') process.stdout.write(`      ↳ ${r.titulo}\n`)
    if (r?.motivo) process.stdout.write(`      ↳ ${r.motivo}\n`)
  }
  process.stdout.write('\n')
  process.exit(0)
}

const ancho = 46
process.stdout.write('\nPlan de pruebas integral · avance\n\n')
for (const f of porFase) {
  const barra = '█'.repeat(Math.round((f.evaluados / f.total) * 20)).padEnd(20, '·')
  const detalle = [
    f.aprobado ? `${f.aprobado} ✓` : null,
    f.fallido ? `${f.fallido} ✗` : null,
    f.bloqueado ? `${f.bloqueado} ⊘` : null,
    f.parcial ? `${f.parcial} ~` : null,
    f.no_aplica ? `${f.no_aplica} —` : null,
  ]
    .filter(Boolean)
    .join('  ')
  process.stdout.write(
    `  ${f.id.toUpperCase().padEnd(4)}${f.titulo.slice(0, ancho).padEnd(ancho)}${barra}  ` +
      `${String(f.evaluados).padStart(2)}/${String(f.total).padEnd(3)} ${detalle}\n`,
  )
}

const evaluados = plan.totalItems - totales.sin_ejecutar
process.stdout.write(
  `\n  ${evaluados}/${plan.totalItems} casos evaluados · ` +
    `${totales.aprobado} aprobados · ${totales.fallido} fallidos · ` +
    `${totales.bloqueado} bloqueados · ${totales.parcial} parciales · ${totales.no_aplica} no aplican\n`,
)

const fallidos = [...ultimo.values()].filter((r) => r.estado === 'fallido')
if (fallidos.length) {
  process.stdout.write('\n  Hallazgos abiertos:\n')
  for (const r of fallidos.sort((a, b) => (a.severidad ?? '').localeCompare(b.severidad ?? ''))) {
    process.stdout.write(`    ${r.item}  [${r.severidad ?? 'media'}]  ${r.titulo}\n`)
  }
}

const bloqueados = [...ultimo.values()].filter((r) => r.estado === 'bloqueado')
if (bloqueados.length) {
  process.stdout.write('\n  Bloqueados (esperan una decisión o un prerrequisito):\n')
  for (const r of bloqueados) process.stdout.write(`    ${r.item}  ${r.motivo}\n`)
}

if (siguiente) process.stdout.write(`\n  Siguiente sin ejecutar: ${siguiente.codigo} (${siguiente.faseTitulo})\n\n`)
else process.stdout.write('\n  No queda ningún ítem sin ejecutar.\n\n')
