#!/usr/bin/env node
/**
 * Casos f2-10, f2-18, f2-19, f2-20 y f2-25 — constraints de los catálogos
 * maestros, verificados por base de datos con una sesión real (RLS activa,
 * como la UI). No usa service_role para escribir: service_role se salta la
 * RLS y aprobaría casos que en la aplicación real fallan.
 *
 * Imprime un veredicto por ítem. No registra nada: eso lo hace el agente con
 * scripts/qa/registrar.mjs, que es quien decide qué hacer con el resultado.
 */
import fs from 'node:fs'
import { cargarCatalogo, clienteAdmin, clienteComo, exigirLocal } from '../lib.mjs'

exigirLocal()

const banco = JSON.parse(fs.readFileSync('qa/tenants.json', 'utf8'))
const t1 = banco.tenants.t1
const admin = clienteAdmin()
const cat = await cargarCatalogo(admin)
const sesion = await clienteComo(admin, banco.adminPrincipal)

const veredictos = []
const anotar = (item, ok, observado) => veredictos.push({ item, ok, observado })
const sello = Date.now().toString(36).slice(-6)

// ── f2-10 · inmueble con un código ya usado en el tenant ───────────────
{
  const { data: existente } = await admin
    .from('inmuebles')
    .select('codigo')
    .eq('tenant_id', t1.id)
    .limit(1)
    .single()

  const { error } = await sesion.from('inmuebles').insert({
    tenant_id: t1.id,
    codigo: existente.codigo,
    tipo_id: cat.id('TIPO_INMUEBLE', 'apartamento'),
    estado: 'activo',
    area_privada: 50,
    uso_predio_id: cat.id('USO_PREDIO', 'residencial'),
  })

  const { count } = await admin
    .from('inmuebles')
    .select('*', { count: 'exact', head: true })
    .eq('tenant_id', t1.id)
    .eq('codigo', existente.codigo)

  anotar(
    'f2-10',
    !!error && count === 1,
    error
      ? `Rechazado con ${error.code} (${(error.message || '').slice(0, 90)}); sigue habiendo ${count} inmueble con el código ${existente.codigo}`
      : `NO rechazó: ahora hay ${count} inmuebles con el código ${existente.codigo}`,
  )
}

// ── f2-18 · tercero natural sin primer apellido ────────────────────────
{
  const { error } = await sesion.from('terceros').insert({
    tenant_id: t1.id,
    tipo_persona: 'natural',
    numero_documento: `QA18${sello}`,
    tipo_identificacion_id: cat.id('TIPO_IDENTIFICACION', 'cedula'),
    estado_id: cat.id('ESTADO_TERCERO', 'activo'),
    primer_nombre: 'Sin',
    primer_apellido: null,
  })
  anotar(
    'f2-18',
    !!error,
    error
      ? `Rechazado con ${error.code}: ${(error.message || '').slice(0, 110)}`
      : 'ACEPTÓ un tercero natural sin primer_apellido',
  )
}

// ── f2-19 · tercero jurídico sin razón social ──────────────────────────
{
  const { error } = await sesion.from('terceros').insert({
    tenant_id: t1.id,
    tipo_persona: 'juridica',
    numero_documento: `QA19${sello}`,
    tipo_identificacion_id: cat.id('TIPO_IDENTIFICACION', 'nit'),
    estado_id: cat.id('ESTADO_TERCERO', 'activo'),
    razon_social: null,
  })
  anotar(
    'f2-19',
    !!error,
    error
      ? `Rechazado con ${error.code}: ${(error.message || '').slice(0, 110)}`
      : 'ACEPTÓ un tercero jurídico sin razón social',
  )
}

// ── f2-20 · dos terceros con el mismo tipo y número de documento ───────
{
  const documento = `QA20${sello}`
  const base = {
    tenant_id: t1.id,
    tipo_persona: 'natural',
    numero_documento: documento,
    tipo_identificacion_id: cat.id('TIPO_IDENTIFICACION', 'cedula'),
    estado_id: cat.id('ESTADO_TERCERO', 'activo'),
    primer_nombre: 'Duplicado',
    primer_apellido: 'Prueba',
  }
  const { error: errorPrimero } = await sesion.from('terceros').insert(base)
  const { error: errorSegundo } = await sesion
    .from('terceros')
    .insert({ ...base, primer_nombre: 'Duplicado2' })
  const { count } = await admin
    .from('terceros')
    .select('*', { count: 'exact', head: true })
    .eq('tenant_id', t1.id)
    .eq('numero_documento', documento)

  anotar(
    'f2-20',
    !errorPrimero && !!errorSegundo && count === 1,
    errorPrimero
      ? `El PRIMER alta ya falló (${errorPrimero.code}: ${errorPrimero.message}), el caso no se pudo montar`
      : errorSegundo
        ? `El segundo alta rechazó con ${errorSegundo.code}; quedó ${count} tercero con el documento ${documento}`
        : `NO rechazó el duplicado: hay ${count} terceros con el documento ${documento}`,
  )
}

// ── f2-25 · set de coeficientes que no suma 1, intentando activarlo ────
{
  const { data: inmuebles } = await admin
    .from('inmuebles')
    .select('id')
    .eq('tenant_id', t1.id)
    .order('codigo')
  const { data: vigente } = await admin
    .from('coeficiente_sets')
    .select('version')
    .eq('tenant_id', t1.id)
    .order('version', { ascending: false })
    .limit(1)
    .single()

  const version = (vigente?.version ?? 1) + 1
  const { data: set, error: errorSet } = await sesion
    .from('coeficiente_sets')
    .insert({
      tenant_id: t1.id,
      version,
      vigente_desde: '2026-10-01',
      estado: 'borrador',
      suma_total: 0.98,
    })
    .select('id')
    .single()

  if (errorSet) {
    anotar('f2-25', false, `No se pudo ni crear el set en borrador: ${errorSet.message}`)
  } else {
    // 0.98 repartido entre los inmuebles: la suma queda deliberadamente corta.
    const valor = Math.floor((0.98 / inmuebles.length) * 1e10) / 1e10
    await sesion.from('coeficientes').insert(
      inmuebles.map((i) => ({ tenant_id: t1.id, set_id: set.id, inmueble_id: i.id, valor })),
    )
    const { error: errorActivar } = await sesion
      .from('coeficiente_sets')
      .update({ estado: 'vigente' })
      .eq('id', set.id)

    const { data: despues } = await admin
      .from('coeficiente_sets')
      .select('estado')
      .eq('id', set.id)
      .single()
    const { count: vigentes } = await admin
      .from('coeficiente_sets')
      .select('*', { count: 'exact', head: true })
      .eq('tenant_id', t1.id)
      .eq('estado', 'vigente')

    // OJO — esto NO aprueba f2-25. Con un set vigente en pie, el rechazo lo
    // produce el índice único coeficiente_sets_vigente_unico, no la suma: dar
    // esto por bueno sería aprobar el caso por la razón equivocada. Retirando
    // antes el set vigente, un set que suma 0.98 se activa sin ningún error
    // —comportamiento deliberado y documentado en coeficientes.ts:23-27— y por
    // eso el ítem está bloqueado esperando una decisión (qa/decisiones.md).
    // Repetir aquella comprobación es irreversible: el set que pasa a
    // "historica" no vuelve a "vigente" (IMMUTABLE_COEFFICIENT_SET) y obliga a
    // resembrar la copropiedad.
    anotar(
      'f2-25',
      false,
      errorActivar
        ? `Rechazado con ${errorActivar.code} (${(errorActivar.message || '').slice(0, 90)}) — pero por el índice de "un solo set vigente", NO por la suma. El caso no se probó de verdad: ver qa/decisiones.md`
        : `El set descuadrado quedó en estado "${despues.estado}" y hay ${vigentes} sets vigentes`,
    )

    // Limpieza: el set descuadrado no debe quedar ensuciando el tablero.
    await admin.from('coeficientes').delete().eq('set_id', set.id)
    await admin.from('coeficiente_sets').delete().eq('id', set.id)
  }
}

for (const v of veredictos) {
  process.stdout.write(`${v.item}  ${v.ok ? 'CUMPLE ' : 'NO CUMPLE'}  ${v.observado}\n`)
}
