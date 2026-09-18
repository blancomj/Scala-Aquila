import { exigirLocal, clienteAdmin, clienteComo, invocarFuncion, log } from '../lib.mjs'

exigirLocal()
const admin = clienteAdmin()
const inmuebleId = '67b62f1a-8d53-40b5-8a78-7b8baaccf407' // T1-101

const auxiliar = await clienteComo(admin, 'qa.auxiliar@aquila.test')
const aprobador = await clienteComo(admin, 'qa.aprobador@aquila.test')

// f6-04: crear novedad (recargo) como auxiliar, fecha efectiva en septiembre (periodo corriente)
const crear = await invocarFuncion(auxiliar, 'crear-novedad', {
  inmueble_id: inmuebleId,
  tipo: 'CHARGE',
  monto: 25000,
  descripcion: 'QA f6-04/05 recargo de prueba',
  fecha_efectiva: '2026-09-10',
})
log('crear-novedad -> ' + crear.status + ' ' + JSON.stringify(crear.json))
if (!crear.ok) process.exit(1)
const novedadId = crear.json.id ?? crear.json.data?.id
log('novedadId = ' + novedadId)

// f6-04: aprobar con el MISMO usuario que la creó
const autoAprobar = await invocarFuncion(auxiliar, 'aprobar-novedad', { novedad_id: novedadId })
log('f6-04 auto-aprobar (mismo usuario) -> ' + autoAprobar.status + ' ' + JSON.stringify(autoAprobar.json))

// f6-05: aprobar con un usuario distinto
const aprobarDistinto = await invocarFuncion(aprobador, 'aprobar-novedad', { novedad_id: novedadId })
log('f6-05 aprobar (usuario distinto) -> ' + aprobarDistinto.status + ' ' + JSON.stringify(aprobarDistinto.json))

// Verificar estado final + si generó el cargo
const { data: novedad } = await admin.from('novedades').select('*').eq('id', novedadId).single()
log('estado final novedad: ' + JSON.stringify(novedad, null, 2))
