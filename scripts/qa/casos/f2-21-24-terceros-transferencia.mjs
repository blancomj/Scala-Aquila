#!/usr/bin/env node
/**
 * Casos f2-21 a f2-24 — vincular terceros a un inmueble (copropietario
 * pagador + arrendatario), transferencia de propiedad y su histórico.
 * Usa un inmueble y terceros descartables propios para no tocar los 20
 * inmuebles sembrados de T1.
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
const sello = Date.now().toString(36)

// ── montaje: inmueble descartable + terceros descartables ──────────────
const { data: inmueble } = await sesion
  .from('inmuebles')
  .insert({
    tenant_id: t1.id,
    codigo: `QA-F2-2X-${sello}`,
    tipo_id: cat.id('TIPO_INMUEBLE', 'apartamento'),
    estado: 'activo',
    area_privada: 45,
    uso_predio_id: cat.id('USO_PREDIO', 'residencial'),
  })
  .select()
  .single()

const { data: copropietario } = await sesion
  .from('terceros')
  .insert({
    tenant_id: t1.id,
    tipo_persona: 'natural',
    numero_documento: `QAF221${sello}`,
    tipo_identificacion_id: cat.id('TIPO_IDENTIFICACION', 'cedula'),
    estado_id: cat.id('ESTADO_TERCERO', 'activo'),
    primer_nombre: 'Copropietario',
    primer_apellido: 'PruebaF221',
  })
  .select()
  .single()

const { data: arrendatario } = await sesion
  .from('terceros')
  .insert({
    tenant_id: t1.id,
    tipo_persona: 'natural',
    numero_documento: `QAF222${sello}`,
    tipo_identificacion_id: cat.id('TIPO_IDENTIFICACION', 'cedula'),
    estado_id: cat.id('ESTADO_TERCERO', 'activo'),
    primer_nombre: 'Arrendatario',
    primer_apellido: 'PruebaF222',
  })
  .select()
  .single()

// ── f2-21 · vincular copropietario y marcarlo pagador ───────────────────
const { data: vinculoCopropietario, error: errorVinculo1 } = await sesion
  .from('inmueble_persona_rol')
  .insert({
    tenant_id: t1.id,
    inmueble_id: inmueble.id,
    tercero_id: copropietario.id,
    rol_id: 22, // copropietario
    porcentaje: 100,
    vigente_desde: '2026-01-01',
    es_pagador: true,
  })
  .select()
  .single()

anotar(
  'f2-21',
  !errorVinculo1 && vinculoCopropietario?.es_pagador === true,
  errorVinculo1
    ? `Rechazado: ${errorVinculo1.message}`
    : `Vínculo creado con es_pagador=${vinculoCopropietario.es_pagador}, rol=copropietario, porcentaje=${vinculoCopropietario.porcentaje}`,
)

// ── f2-22 · vincular un segundo tercero como arrendatario ───────────────
const { data: vinculoArrendatario, error: errorVinculo2 } = await sesion
  .from('inmueble_persona_rol')
  .insert({
    tenant_id: t1.id,
    inmueble_id: inmueble.id,
    tercero_id: arrendatario.id,
    rol_id: 23, // arrendatario
    vigente_desde: '2026-02-01',
    es_pagador: false,
  })
  .select()
  .single()

const { data: ambosVinculos } = await admin
  .from('inmueble_persona_rol')
  .select('tercero_id, rol_id, vigente_desde, vigente_hasta, es_pagador')
  .eq('inmueble_id', inmueble.id)

anotar(
  'f2-22',
  !errorVinculo2 && ambosVinculos.length === 2,
  errorVinculo2
    ? `Rechazado: ${errorVinculo2.message}`
    : `Coexisten ${ambosVinculos.length} vínculos: ${JSON.stringify(ambosVinculos)}`,
)

// ── f2-23 · transferencia de propiedad a un tercero nuevo ───────────────
const { data: nuevoPropietario } = await sesion
  .from('terceros')
  .insert({
    tenant_id: t1.id,
    tipo_persona: 'natural',
    numero_documento: `QAF223${sello}`,
    tipo_identificacion_id: cat.id('TIPO_IDENTIFICACION', 'cedula'),
    estado_id: cat.id('ESTADO_TERCERO', 'activo'),
    primer_nombre: 'NuevoPropietario',
    primer_apellido: 'PruebaF223',
  })
  .select()
  .single()

const fechaTransferencia = '2026-06-01'
const { error: errorCierre } = await sesion
  .from('inmueble_persona_rol')
  .update({ vigente_hasta: fechaTransferencia })
  .eq('id', vinculoCopropietario.id)

const { data: nuevoVinculo, error: errorNuevo } = await sesion
  .from('inmueble_persona_rol')
  .insert({
    tenant_id: t1.id,
    inmueble_id: inmueble.id,
    tercero_id: nuevoPropietario.id,
    rol_id: 22,
    porcentaje: 100,
    vigente_desde: fechaTransferencia,
    es_pagador: true,
  })
  .select()
  .single()

const { data: vinculoCerrado } = await admin
  .from('inmueble_persona_rol')
  .select('vigente_hasta')
  .eq('id', vinculoCopropietario.id)
  .single()

anotar(
  'f2-23',
  !errorCierre &&
    !errorNuevo &&
    vinculoCerrado.vigente_hasta === fechaTransferencia &&
    nuevoVinculo.vigente_desde === fechaTransferencia,
  errorCierre || errorNuevo
    ? `Falló: cierre=${errorCierre?.message ?? 'ok'} / nuevo=${errorNuevo?.message ?? 'ok'}`
    : `Titular anterior quedó con vigente_hasta=${vinculoCerrado.vigente_hasta}; nuevo titular con vigente_desde=${nuevoVinculo.vigente_desde} — misma fecha, sin hueco`,
)

// ── f2-24 · histórico del inmueble tras la transferencia ────────────────
const { data: historico } = await admin
  .from('inmueble_persona_rol')
  .select('tercero_id, rol_id, vigente_desde, vigente_hasta')
  .eq('inmueble_id', inmueble.id)
  .eq('rol_id', 22)
  .order('vigente_desde')

anotar(
  'f2-24',
  historico.length === 2 &&
    historico[0].vigente_hasta === fechaTransferencia &&
    historico[1].vigente_hasta === null,
  `El histórico de copropietario muestra ${historico.length} filas: ${JSON.stringify(historico)} — se ven AMBOS (anterior con cierre, nuevo sin cierre)`,
)

// ── limpieza ─────────────────────────────────────────────────────────────
await admin.from('inmueble_persona_rol').delete().eq('inmueble_id', inmueble.id)
await admin.from('inmuebles').delete().eq('id', inmueble.id)
await admin
  .from('terceros')
  .delete()
  .in('id', [copropietario.id, arrendatario.id, nuevoPropietario.id])

for (const v of veredictos) {
  process.stdout.write(`${v.item}  ${v.ok ? 'CUMPLE ' : 'NO CUMPLE'}  ${v.observado}\n`)
}
