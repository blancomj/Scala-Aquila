#!/usr/bin/env node
/**
 * Siembra una copropiedad de prueba completa para QA manual: 20 inmuebles,
 * propietarios, coeficientes vigentes y un presupuesto aprobado.
 *
 * SOLO contra local (.env) — nunca produce nada útil ni seguro corrido
 * contra producción. Usa create_tenant() real (vía sesión autenticada real,
 * no service_role) para heredar toda la plantilla automática (plan
 * contable, árbol presupuestal, fondo de imprevistos, conceptos) exactamente
 * como la recibiría una copropiedad real dada de alta desde la UI.
 *
 * Uso: pnpm exec node scripts/seed-qa-tenant.mjs [email-de-login]
 * Sin argumento usa blancomj@gmail.com (el mismo de dev-login.mjs).
 */
import { createClient } from '@supabase/supabase-js'
import { config } from 'dotenv'

config({ path: '.env' })

const url = process.env.SUPABASE_URL
const anonKey = process.env.SUPABASE_ANON_KEY
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
const email = process.argv[2] ?? 'blancomj@gmail.com'

if (!url || !anonKey || !serviceRoleKey) {
  console.error('Faltan SUPABASE_URL/SUPABASE_ANON_KEY/SUPABASE_SERVICE_ROLE_KEY en .env')
  process.exit(1)
}
if (!url.includes('127.0.0.1') && !url.includes('localhost')) {
  console.error(`SUPABASE_URL no es local (${url}) — este script nunca corre contra remoto.`)
  process.exit(1)
}

const admin = createClient(url, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
  global: { fetch },
})

async function clienteComo(userEmail) {
  const { data, error } = await admin.auth.admin.generateLink({ type: 'magiclink', email: userEmail })
  if (error) throw new Error(`generateLink(${userEmail}): ${error.message}`)
  const resp = await fetch(data.properties.action_link, { redirect: 'manual' })
  const location = resp.headers.get('location')
  if (!location) throw new Error(`sin redirect para ${userEmail}: ${resp.status}`)
  const tokens = new URLSearchParams(new URL(location).hash.slice(1))
  const accessToken = tokens.get('access_token')
  const refreshToken = tokens.get('refresh_token')
  if (!accessToken || !refreshToken) throw new Error(`sin tokens para ${userEmail}`)
  const cliente = createClient(url, anonKey, {
    auth: { autoRefreshToken: false, persistSession: false },
    global: { fetch },
  })
  const { error: errorSesion } = await cliente.auth.setSession({
    access_token: accessToken,
    refresh_token: refreshToken,
  })
  if (errorSesion) throw errorSesion
  return cliente
}

console.log(`Autenticando como ${email}...`)
const cliente = await clienteComo(email)

const RUN = Date.now().toString(36)
const slug = `qa-integral-${RUN}`
console.log(`Creando tenant "QA Integral ${RUN}" (slug ${slug})...`)
const { data: tenant, error: errorTenant } = await cliente
  .rpc('create_tenant', { p_name: `QA Integral ${RUN}`, p_slug: slug })
  .single()
if (errorTenant) throw errorTenant
const tenantId = tenant.id
console.log(`Tenant creado: ${tenantId}`)

// ── inspección de lo que create_tenant() ya sembró ───────────────────────
const { data: cuentasPresupuesto } = await admin
  .from('presupuesto_cuenta')
  .select('id, codigo, nombre, naturaleza, es_hoja, activa')
  .eq('tenant_id', tenantId)
  .order('ruta')
console.log(`\npresupuesto_cuenta ya sembradas por create_tenant(): ${cuentasPresupuesto?.length ?? 0}`)
for (const c of cuentasPresupuesto ?? []) {
  console.log(`  ${c.codigo} · ${c.nombre} · ${c.naturaleza} · hoja=${c.es_hoja} activa=${c.activa}`)
}

// ── catálogo (IDs globales, tenant_id null — estables entre tenants) ────
const TIPO_APARTAMENTO = 1
const ROL_COPROPIETARIO = 22
const TIPO_ID_CEDULA = 43
const USO_PREDIO_RESIDENCIAL = 59
const ESTADO_TERCERO_ACTIVO = 157

// ── 20 inmuebles: 4 torres x 5 pisos, área 45-95 m2 ──────────────────────
const NOMBRES = [
  'Andrea Gómez', 'Carlos Ramírez', 'Beatriz Suárez', 'Diego Martínez', 'Elena Rodríguez',
  'Felipe Torres', 'Gloria Pineda', 'Hernán Castro', 'Isabel Vargas', 'Javier Mendoza',
  'Karen López', 'Luis Herrera', 'Mónica Salazar', 'Nelson Ortiz', 'Olga Cárdenas',
  'Pedro Jiménez', 'Rosa Quintero', 'Sergio Delgado', 'Tatiana Rincón', 'Ugo Fajardo',
]
const inmueblesDef = []
let n = 0
for (const torre of ['1', '2', '3', '4']) {
  for (let piso = 1; piso <= 5; piso++) {
    n++
    inmueblesDef.push({
      codigo: `T${torre}-${String(piso).padStart(2, '0')}`,
      area: 45 + ((n * 7) % 51), // 45..95, determinístico
      propietario: NOMBRES[n - 1],
    })
  }
}

console.log(`\nCreando ${inmueblesDef.length} inmuebles...`)
const inmuebleIds = []
for (const def of inmueblesDef) {
  const { data, error } = await cliente
    .from('inmuebles')
    .insert({
      tenant_id: tenantId,
      codigo: def.codigo,
      tipo_id: TIPO_APARTAMENTO,
      estado: 'activo',
      area_privada: def.area,
      uso_predio_id: USO_PREDIO_RESIDENCIAL,
    })
    .select('id, codigo')
    .single()
  if (error) throw new Error(`inmueble ${def.codigo}: ${error.message}`)
  inmuebleIds.push(data.id)
  def.id = data.id
}
console.log(`  ${inmuebleIds.length} inmuebles creados.`)

// ── propietarios (terceros naturales) + vínculo copropietario ───────────
console.log(`\nCreando propietarios...`)
for (let i = 0; i < inmueblesDef.length; i++) {
  const def = inmueblesDef[i]
  const [primerNombre, primerApellido] = def.propietario.split(' ')
  const numeroDocumento = String(1000000000 + i * 137 + 17)

  const { data: tercero, error: errorTercero } = await cliente
    .from('terceros')
    .insert({
      tenant_id: tenantId,
      tipo_persona: 'natural',
      numero_documento: numeroDocumento,
      tipo_identificacion_id: TIPO_ID_CEDULA,
      estado_id: ESTADO_TERCERO_ACTIVO,
      primer_nombre: primerNombre,
      primer_apellido: primerApellido,
      email: `${primerNombre.toLowerCase()}.${primerApellido.toLowerCase()}@qa-integral.test`,
      telefono: `300${String(1000000 + i * 7919).slice(0, 7)}`,
    })
    .select('id')
    .single()
  if (errorTercero) throw new Error(`tercero ${def.propietario}: ${errorTercero.message}`)

  const { error: errorVinculo } = await cliente.from('inmueble_persona_rol').insert({
    tenant_id: tenantId,
    inmueble_id: def.id,
    tercero_id: tercero.id,
    rol_id: ROL_COPROPIETARIO,
    porcentaje: 100,
    vigente_desde: '2026-01-01',
    es_pagador: true,
  })
  if (errorVinculo) throw new Error(`vínculo ${def.propietario} -> ${def.codigo}: ${errorVinculo.message}`)
}
console.log(`  ${inmueblesDef.length} propietarios vinculados.`)

// ── coeficientes vigentes, proporcionales al área, Σ = 1.0000000000 ─────
console.log(`\nCreando set de coeficientes...`)
const areaTotal = inmueblesDef.reduce((acc, d) => acc + d.area, 0)
const coefs = inmueblesDef.map((d) => Math.round((d.area / areaTotal) * 1e10) / 1e10)
const ajuste = 1 - coefs.reduce((a, b) => a + b, 0)
coefs[coefs.length - 1] = Math.round((coefs[coefs.length - 1] + ajuste) * 1e10) / 1e10

const { data: set, error: errorSet } = await admin
  .from('coeficiente_sets')
  .insert({ tenant_id: tenantId, version: 1, vigente_desde: '2026-01-01', estado: 'borrador', suma_total: 1 })
  .select('id')
  .single()
if (errorSet) throw errorSet

const { error: errorCoefs } = await admin.from('coeficientes').insert(
  inmueblesDef.map((d, i) => ({
    tenant_id: tenantId,
    set_id: set.id,
    inmueble_id: d.id,
    valor: coefs[i],
  })),
)
if (errorCoefs) throw errorCoefs

const { error: errorVigente } = await admin
  .from('coeficiente_sets')
  .update({ estado: 'vigente' })
  .eq('id', set.id)
if (errorVigente) throw new Error(`activar set de coeficientes: ${errorVigente.message}`)
console.log(`  Set de coeficientes vigente (Σ=${coefs.reduce((a, b) => a + b, 0).toFixed(10)}).`)

// ── presupuesto anual, contra cuentas hoja ya sembradas, aprobado y vigente ──
console.log(`\nCreando presupuesto...`)
const RUBROS = [
  ['egr_administrador', 42000000],
  ['vigilancia', 60000000],
  ['egr_aseo', 24000000],
  ['egr_mant_zonas_comunes', 15000000],
  ['egr_seguros', 12000000],
  ['egr_energia_torres', 9000000],
  ['egr_acueducto', 8000000],
  ['egr_gastos_asamblea', 3000000],
]
const montoTotal = RUBROS.reduce((acc, [, monto]) => acc + monto, 0)

const { data: presupuesto, error: errorPresupuesto } = await cliente
  .from('presupuestos')
  .insert({ tenant_id: tenantId, anio: 2026, version: 1, estado: 'borrador', monto_total: montoTotal })
  .select('id')
  .single()
if (errorPresupuesto) throw errorPresupuesto

const cuentaIdPorCodigo = new Map((cuentasPresupuesto ?? []).map((c) => [c.codigo, c.id]))
for (const [codigo, monto] of RUBROS) {
  const cuentaId = cuentaIdPorCodigo.get(codigo)
  if (!cuentaId) throw new Error(`cuenta presupuestal "${codigo}" no encontrada en la plantilla`)
  const { error: errorRubro } = await cliente.from('presupuesto_rubros').insert({
    tenant_id: tenantId,
    presupuesto_id: presupuesto.id,
    codigo: codigo.toUpperCase(),
    nombre: (cuentasPresupuesto.find((c) => c.codigo === codigo)).nombre,
    cuenta_id: cuentaId,
    monto_anual: monto,
  })
  if (errorRubro) throw new Error(`rubro ${codigo}: ${errorRubro.message}`)
}

const { error: errorAprobar } = await cliente
  .from('presupuestos')
  .update({ estado: 'aprobado' })
  .eq('id', presupuesto.id)
if (errorAprobar) throw new Error(`aprobar presupuesto: ${errorAprobar.message}`)

const { error: errorActivar } = await cliente
  .from('presupuestos')
  .update({
    estado: 'vigente',
    fecha_aprobacion: '2026-01-05',
    vigente_desde: '2026-01-01',
    vigente_hasta: '2026-12-31',
    acta_asamblea: 'Acta 001-2026 (QA)',
  })
  .eq('id', presupuesto.id)
if (errorActivar) throw new Error(`activar presupuesto: ${errorActivar.message}`)
console.log(`  Presupuesto 2026 vigente por $${montoTotal.toLocaleString('es-CO')}.`)

console.log(`\n${'═'.repeat(70)}`)
console.log(`Listo. Tenant: ${tenant.name}  (${tenantId})`)
console.log(`Slug: ${slug}`)
console.log(`Login local: pnpm dev:login ${email}`)
console.log(`Al entrar, seleccionar "${tenant.name}" en /seleccionar-copropiedad.`)
console.log('═'.repeat(70))
console.log(JSON.stringify({ tenantId, slug, inmuebles: inmuebleIds.length }))
