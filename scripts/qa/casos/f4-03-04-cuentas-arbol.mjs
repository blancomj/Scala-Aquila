#!/usr/bin/env node
import fs from 'node:fs'
import { clienteAdmin, clienteComo, exigirLocal } from '../lib.mjs'
exigirLocal()
const banco = JSON.parse(fs.readFileSync('qa/tenants.json', 'utf8'))
const t1 = banco.tenants.t1
const admin = clienteAdmin()
const sesion = await clienteComo(admin, banco.adminPrincipal)
const sello = Date.now().toString(36)

// f4-03: mezclar naturaleza
const { data: ingresoRoot } = await sesion.from('presupuesto_cuenta').insert({
  tenant_id: t1.id, naturaleza: 'ingreso', codigo: `qa_ing_${sello}`, nombre: 'QA Ingreso Raiz', orden: 900,
}).select().single()
const { data: egresoRoot } = await sesion.from('presupuesto_cuenta').insert({
  tenant_id: t1.id, naturaleza: 'egreso', codigo: `qa_egr_${sello}`, nombre: 'QA Egreso Raiz', orden: 901,
}).select().single()

const { error: errorMezcla } = await sesion.from('presupuesto_cuenta').update({ parent_id: egresoRoot.id }).eq('id', ingresoRoot.id)
console.log('f4-03', errorMezcla ? `CUMPLE: rechazado ${errorMezcla.message}` : 'NO CUMPLE: permitio mezclar naturaleza')

// f4-04: profundidad excedida
const { data: cuentaA } = await sesion.from('presupuesto_cuenta').insert({
  tenant_id: t1.id, naturaleza: 'egreso', codigo: `qa_prof_a_${sello}`, nombre: 'QA Prof A', orden: 902,
}).select().single()
const { data: cuentaB } = await sesion.from('presupuesto_cuenta').insert({
  tenant_id: t1.id, naturaleza: 'egreso', codigo: `qa_prof_b_${sello}`, nombre: 'QA Prof B', parent_id: cuentaA.id, orden: 1,
}).select().single()
console.log('cuentaA nivel', cuentaA.nivel, 'cuentaB nivel', cuentaB.nivel)

const { data: nivel3 } = await admin.from('presupuesto_cuenta').select('id,nivel,naturaleza').eq('id', 'b2fd4fc0-26c3-4fdd-9c47-885cb5b25481').single()
console.log('padre destino nivel3', nivel3)

const { error: errorProfundidad } = await sesion.from('presupuesto_cuenta').update({ parent_id: nivel3.id }).eq('id', cuentaA.id)
const { data: cuentaADespues } = await admin.from('presupuesto_cuenta').select('parent_id,nivel').eq('id', cuentaA.id).single()
const { data: cuentaBDespues } = await admin.from('presupuesto_cuenta').select('parent_id,nivel').eq('id', cuentaB.id).single()
console.log('f4-04', errorProfundidad ? `CUMPLE: rechazado ${errorProfundidad.message}` : 'NO CUMPLE: permitio exceder profundidad')
console.log('cuentaA despues (deberia seguir igual, sin mover nada):', cuentaADespues)
console.log('cuentaB despues (deberia seguir igual):', cuentaBDespues)

// limpieza
await admin.from('presupuesto_cuenta').delete().eq('id', cuentaB.id)
await admin.from('presupuesto_cuenta').delete().eq('id', cuentaA.id)
await admin.from('presupuesto_cuenta').delete().eq('id', ingresoRoot.id)
await admin.from('presupuesto_cuenta').delete().eq('id', egresoRoot.id)
console.log('limpiado')
