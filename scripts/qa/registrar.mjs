#!/usr/bin/env node
/**
 * Registra el resultado de un caso del plan de pruebas en qa/resultados.jsonl.
 *
 * El archivo es APPEND-ONLY a propósito: un caso que se ejecuta tres veces
 * deja tres líneas, y la última manda. Así se ve si un ítem pasó de fallido
 * a aprobado tras una corrección, que es justamente lo que el usuario pidió
 * poder valorar después. Nada se sobrescribe ni se borra.
 *
 * Uso:
 *   node scripts/qa/registrar.mjs --item=f2-10 --estado=aprobado \
 *     --como=api --tenant=t1 \
 *     --observado="El segundo INSERT falló con 23505 inmuebles_codigo_unico" \
 *     --evidencia="node scripts/qa/casos/f2-10.mjs"
 *
 *   node scripts/qa/registrar.mjs --item=f6-10 --estado=fallido \
 *     --severidad=alta --titulo="El recaudo en exceso no queda como anticipo" \
 *     --observado="..." --detalle="pasos / esperado / real"
 *
 * Estados admitidos:
 *   aprobado   el criterio del plan se cumplió, con evidencia
 *   fallido    el criterio NO se cumplió — exige --titulo y --detalle
 *   bloqueado  no se pudo ejecutar (falta un prerrequisito, o depende de
 *              una decisión pendiente del usuario) — exige --motivo
 *   no_aplica  el caso no aplica a esta instalación — exige --motivo
 *   parcial    se verificó una parte; exige --motivo diciendo qué falta
 */
import fs from 'node:fs'
import path from 'node:path'

const RUTA = 'qa/resultados.jsonl'
const ESTADOS = ['aprobado', 'fallido', 'bloqueado', 'no_aplica', 'parcial']

const args = process.argv.slice(2)
const arg = (nombre) => {
  const v = args.find((a) => a.startsWith(`--${nombre}=`))
  return v ? v.slice(nombre.length + 3) : undefined
}

const item = arg('item')
const estado = arg('estado')

function morir(mensaje) {
  process.stderr.write(`registrar: ${mensaje}\n`)
  process.exit(1)
}

if (!item) morir('falta --item=<codigo>, p. ej. --item=f2-10')
if (!estado || !ESTADOS.includes(estado)) morir(`--estado debe ser uno de: ${ESTADOS.join(', ')}`)

const plan = JSON.parse(fs.readFileSync('qa/plan.json', 'utf8'))
const definicion = plan.items.find((i) => i.codigo === item)
if (!definicion) morir(`el ítem "${item}" no existe en qa/plan.json (${plan.totalItems} ítems)`)

if (estado === 'fallido' && (!arg('titulo') || !arg('detalle'))) {
  morir('un ítem fallido exige --titulo y --detalle: sin eso el hallazgo no es accionable')
}
if (['bloqueado', 'no_aplica', 'parcial'].includes(estado) && !arg('motivo')) {
  morir(`un ítem ${estado} exige --motivo`)
}
if (estado === 'aprobado' && !arg('observado')) {
  morir('un ítem aprobado exige --observado: qué se vio que confirma el criterio del plan')
}

const registro = {
  item,
  fase: definicion.fase,
  estado,
  como: arg('como') ?? 'api',
  tenant: arg('tenant') ?? null,
  observado: arg('observado') ?? null,
  motivo: arg('motivo') ?? null,
  evidencia: arg('evidencia') ?? null,
  titulo: arg('titulo') ?? null,
  detalle: arg('detalle') ?? null,
  severidad: arg('severidad') ?? (estado === 'fallido' ? 'media' : null),
  corrida: arg('corrida') ?? null,
  agente: arg('agente') ?? 'qa-integral',
  at: new Date().toISOString(),
}

fs.mkdirSync(path.dirname(RUTA), { recursive: true })
fs.appendFileSync(RUTA, JSON.stringify(registro) + '\n')

process.stdout.write(`${item} · ${estado}${registro.titulo ? ` · ${registro.titulo}` : ''}\n`)
