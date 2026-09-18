import { exigirLocal, clienteAdmin, clienteComo, invocarFuncion, log } from '../lib.mjs'

exigirLocal()
const admin = clienteAdmin()
const inmuebleId = '67b62f1a-8d53-40b5-8a78-7b8baaccf407' // T1-101

const auxiliar = await clienteComo(admin, 'qa.auxiliar@aquila.test')
const aprobador = await clienteComo(admin, 'qa.aprobador@aquila.test')

const crear = await invocarFuncion(auxiliar, 'crear-novedad', {
  inmueble_id: inmuebleId,
  tipo: 'CHARGE',
  monto: 15000,
  descripcion: 'QA f6-05 recargo (aprobador distinto)',
  fecha_efectiva: '2026-09-10',
})
log('crear-novedad -> ' + crear.status + ' ' + JSON.stringify(crear.json))
if (!crear.ok) process.exit(1)
const novedadId = crear.json.id

const aprobar = await invocarFuncion(aprobador, 'aprobar-novedad', { novedad_id: novedadId })
log('f6-05 aprobar (usuario distinto) -> ' + aprobar.status + ' ' + JSON.stringify(aprobar.json))

const { data: cargo } = await admin.from('cargos').select('*').eq('novedad_id', novedadId)
log('cargo generado: ' + JSON.stringify(cargo, null, 2))

// limpieza: contra-cargo para no dejar un cargo real de $15.000 en T1-101
if (cargo && cargo[0]) {
  const c = cargo[0]
  const { error } = await admin.from('cargos').insert({
    tenant_id: c.tenant_id,
    inmueble_id: c.inmueble_id,
    periodo_id: c.periodo_id,
    categoria: c.categoria,
    origen_tipo: c.origen_tipo,
    novedad_id: c.novedad_id,
    concepto_id: c.concepto_id,
    monto_original: -c.monto_original,
    cargo_reversado_id: c.id,
  })
  log('contra-cargo de limpieza -> ' + (error ? error.message : 'ok'))
}
