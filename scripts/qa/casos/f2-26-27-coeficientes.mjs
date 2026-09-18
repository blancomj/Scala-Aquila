#!/usr/bin/env node
/**
 * Casos f2-26 y f2-27 — corregir un set de coeficientes hasta que sume
 * exactamente 1.0000000000, activarlo, y verificar que el set vigente
 * anterior (el sembrado con los 20 inmuebles, version 1) pasa a "historica"
 * automáticamente.
 *
 * Replica EXACTO el flujo real de `activarCoeficienteSet` en
 * apps/web/app/stores/coeficientes.ts:175-197 — dos UPDATE secuenciales con
 * una sesión real (RLS activa): primero retira el vigente actual a
 * "historica" (con vigente_hasta = vigente_desde del nuevo), después
 * promueve el nuevo a "vigente". Nunca hay dos filas vigentes a la vez.
 *
 * OJO — esto es IRREVERSIBLE (IMMUTABLE_COEFFICIENT_SET): el set version 1
 * de T1 queda en "historica" para siempre; T1 solo vuelve a su punto de
 * partida si se resiembra (`pnpm seed:qa-suite -- --solo=t1`). El plan pide
 * exactamente esta transición (f2-26/f2-27), así que es intencional.
 */
import fs from 'node:fs'
import { clienteAdmin, clienteComo, exigirLocal, repartirMayorResto } from '../lib.mjs'

exigirLocal()

const banco = JSON.parse(fs.readFileSync('qa/tenants.json', 'utf8'))
const t1 = banco.tenants.t1
const admin = clienteAdmin()
const sesion = await clienteComo(admin, banco.adminPrincipal)

const veredictos = []
const anotar = (item, ok, observado) => veredictos.push({ item, ok, observado })

const { data: inmuebles } = await admin
  .from('inmuebles')
  .select('id, area_privada')
  .eq('tenant_id', t1.id)
  .order('codigo')

const { data: vigenteActual } = await admin
  .from('coeficiente_sets')
  .select('id, version, vigente_desde')
  .eq('tenant_id', t1.id)
  .eq('estado', 'vigente')
  .single()

// Reparto por mayor resto sobre 1e10 unidades → Σ exacta de 1.0000000000,
// sin importar redondeos de punto flotante en los pesos de área.
const partes = repartirMayorResto(
  10_000_000_000,
  inmuebles.map((i) => Number(i.area_privada)),
)
const valores = inmuebles.map((inm, i) => ({
  tenant_id: t1.id,
  inmueble_id: inm.id,
  valor10: partes[i],
}))
const sumaDiez = valores.reduce((a, b) => a + b.valor10, 0)
if (sumaDiez !== 10_000_000_000) {
  throw new Error(`repartirMayorResto no cuadró: suma=${sumaDiez}`)
}

const version = vigenteActual.version + 1
const vigenteDesde = '2026-10-01'

// ── f2-26 · crear el set corregido y activarlo ─────────────────────────
const { data: nuevoSet, error: errorCrear } = await sesion
  .from('coeficiente_sets')
  .insert({
    tenant_id: t1.id,
    version,
    vigente_desde: vigenteDesde,
    estado: 'borrador',
    suma_total: 1,
  })
  .select('id, vigente_desde')
  .single()

if (errorCrear) {
  anotar('f2-26', false, `No se pudo crear el set en borrador: ${errorCrear.code} ${errorCrear.message}`)
  anotar('f2-27', false, 'No aplica: el set corregido nunca se creó')
} else {
  const { error: errorCoefs } = await sesion.from('coeficientes').insert(
    valores.map((v) => ({
      tenant_id: v.tenant_id,
      set_id: nuevoSet.id,
      inmueble_id: v.inmueble_id,
      // numeric(12,10): 10 dígitos decimales exactos.
      valor: (v.valor10 / 1e10).toFixed(10),
    })),
  )

  if (errorCoefs) {
    anotar('f2-26', false, `Coeficientes rechazados: ${errorCoefs.code} ${errorCoefs.message}`)
    anotar('f2-27', false, 'No aplica: los coeficientes del set nuevo no se pudieron cargar')
  } else {
    // Paso 1 del flujo real: retirar el vigente actual a "historica".
    const { error: errorRetiro } = await sesion
      .from('coeficiente_sets')
      .update({ estado: 'historica', vigente_hasta: nuevoSet.vigente_desde })
      .eq('id', vigenteActual.id)

    // Paso 2: promover el nuevo a "vigente".
    const { error: errorActivar } = await sesion
      .from('coeficiente_sets')
      .update({ estado: 'vigente' })
      .eq('id', nuevoSet.id)

    const { data: estadoNuevo } = await admin
      .from('coeficiente_sets')
      .select('estado')
      .eq('id', nuevoSet.id)
      .single()
    const { data: estadoViejo } = await admin
      .from('coeficiente_sets')
      .select('estado, vigente_hasta')
      .eq('id', vigenteActual.id)
      .single()
    const { count: totalVigentes } = await admin
      .from('coeficiente_sets')
      .select('*', { count: 'exact', head: true })
      .eq('tenant_id', t1.id)
      .eq('estado', 'vigente')

    anotar(
      'f2-26',
      !errorActivar && estadoNuevo?.estado === 'vigente',
      errorActivar
        ? `Rechazado al activar: ${errorActivar.code} ${errorActivar.message}`
        : `El set version ${version} (Σ=1.0000000000, ${valores.length} inmuebles) pasó a estado "${estadoNuevo.estado}"`,
    )

    anotar(
      'f2-27',
      !errorRetiro && estadoViejo?.estado === 'historica' && totalVigentes === 1,
      errorRetiro
        ? `El retiro del set anterior falló: ${errorRetiro.code} ${errorRetiro.message}`
        : `El set version ${vigenteActual.version} (el sembrado) quedó en estado "${estadoViejo.estado}" con vigente_hasta=${estadoViejo.vigente_hasta}; hay ${totalVigentes} set(s) vigente(s) en total`,
    )
  }
}

for (const v of veredictos) {
  process.stdout.write(`${v.item}  ${v.ok ? 'CUMPLE ' : 'NO CUMPLE'}  ${v.observado}\n`)
}
