#!/usr/bin/env node
/**
 * Prepara el documento que el artefacto "Plan de Pruebas AQUILA" muestra en
 * vivo, a partir de qa/resultados.jsonl.
 *
 * El repo es la fuente de verdad; el artefacto es la vista compartida. Este
 * script no habla con claude.ai: deja el documento listo en
 * qa/artefacto-resultados.json y lo sube el agente con la herramienta
 * ArtifactData —
 *
 *   ArtifactData action=set
 *     url=https://claude.ai/artifact/3aPTLb4GaVTANbatnJQL5y
 *     collection=qa doc_id=resultados
 *     file_path=qa/artefacto-resultados.json
 *
 * Un solo documento, no 222: la página lo lee de una y evita 222 escrituras
 * por corrida.
 */
import fs from 'node:fs'

const plan = JSON.parse(fs.readFileSync('qa/plan.json', 'utf8'))
const lineas = fs.existsSync('qa/resultados.jsonl')
  ? fs.readFileSync('qa/resultados.jsonl', 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l))
  : []

// Append-only: la última línea de cada ítem es la vigente. Las anteriores se
// conservan como historial para poder ver que un fallido pasó a aprobado.
const ultimo = new Map()
const intentos = new Map()
for (const r of lineas) {
  ultimo.set(r.item, r)
  intentos.set(r.item, (intentos.get(r.item) ?? 0) + 1)
}

// ArtifactData tope un solo documento en 256KB. Con 222 ítems (varios con
// motivo/detalle de miles de caracteres — las PREGUNTA: largas de
// qa/decisiones.md) el documento completo ya lo supera. El repo
// (qa/resultados.jsonl) sigue siendo la fuente de verdad íntegra; acá se
// recorta solo la vista compartida, nunca el archivo fuente.
const TOPE_CAMPO_LARGO = 600
function recortar(texto) {
  if (!texto || texto.length <= TOPE_CAMPO_LARGO) return texto ?? null
  return `${texto.slice(0, TOPE_CAMPO_LARGO)}… (recortado — ver qa/resultados.jsonl para el texto completo)`
}

const items = {}
for (const [codigo, r] of ultimo) {
  items[codigo] = {
    estado: r.estado,
    como: r.como,
    tenant: r.tenant,
    observado: recortar(r.observado),
    motivo: recortar(r.motivo),
    titulo: r.titulo ?? null,
    detalle: recortar(r.detalle),
    severidad: r.severidad ?? null,
    evidencia: r.evidencia ?? null,
    agente: r.agente ?? null,
    at: r.at,
    intentos: intentos.get(codigo),
  }
}

const totales = { aprobado: 0, fallido: 0, bloqueado: 0, no_aplica: 0, parcial: 0, sin_ejecutar: 0 }
const porFase = {}
for (const f of plan.fases) {
  const deLaFase = plan.items.filter((i) => i.fase === f.id)
  const conteo = { aprobado: 0, fallido: 0, bloqueado: 0, no_aplica: 0, parcial: 0, sin_ejecutar: 0 }
  for (const it of deLaFase) {
    const estado = items[it.codigo]?.estado ?? 'sin_ejecutar'
    conteo[estado]++
    totales[estado]++
  }
  porFase[f.id] = { total: deLaFase.length, ...conteo }
}

const tenants = fs.existsSync('qa/tenants.json') ? JSON.parse(fs.readFileSync('qa/tenants.json', 'utf8')) : null

const documento = {
  actualizadoAt: new Date().toISOString(),
  totalItems: plan.totalItems,
  totales,
  porFase,
  items,
  banco: tenants
    ? Object.values(tenants.tenants).map((t) => ({
        clave: t.clave,
        nombre: t.nombre,
        inmuebles: t.inmuebles,
        perfil: t.perfil,
      }))
    : [],
}

fs.writeFileSync('qa/artefacto-resultados.json', JSON.stringify(documento, null, 2) + '\n')

const evaluados = plan.totalItems - totales.sin_ejecutar
process.stdout.write(
  `qa/artefacto-resultados.json listo · ${evaluados}/${plan.totalItems} evaluados · ` +
    `${totales.aprobado} ✓  ${totales.fallido} ✗  ${totales.bloqueado} ⊘  ${totales.parcial} ~  ${totales.no_aplica} —\n` +
    'Subilo con: ArtifactData action=set collection=qa doc_id=resultados ' +
    'file_path=qa/artefacto-resultados.json\n',
)
