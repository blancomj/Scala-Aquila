#!/usr/bin/env node
/**
 * Banco de datos del "Plan de pruebas integral" (222 casos, artefacto QA).
 *
 * Siembra TRES copropiedades con perfiles deliberadamente distintos, porque
 * el plan necesita las tres a la vez:
 *
 *   T1 · QA Torres del Parque — 30 inmuebles, residencial, MADURA.
 *        Presupuesto vigente, coeficientes vigentes, dos periodos ya
 *        liquidados y recaudados de forma desigual (hay mora real que
 *        gestionar) y el periodo corriente ABIERTO SIN LIQUIDAR, que es
 *        justamente lo que f6-06 tiene que ejecutar.
 *   T2 · QA Plaza Comercial — 18 inmuebles, uso mixto, responsable de IVA,
 *        agente de retención, marco contable Grupo 2. Existe para los ítems
 *        tributarios (f7-08), los de marco contable (f5-01/02) y, sobre
 *        todo, como el "otro tenant" de toda la fase f17 de aislamiento:
 *        tiene datos reales que NO se deben poder ver desde T1.
 *   T3 · QA Conjunto Nuevo — 12 inmuebles y nada más. Sin coeficientes
 *        activos, sin presupuesto, sin plan contable instalado. Es el
 *        tablero en blanco que pide f21-03 (ciclo completo por UI) y el
 *        contraste para los ítems de "estado inicial" (f10-01: el fondo de
 *        imprevistos existe con saldo 0 sin que nadie lo creara).
 *
 * REGLA DE DISEÑO — la semilla pone el tablero, NO juega la partida.
 * Nada que un ítem del plan mande a crear se siembra aquí: no hay activos
 * dados de alta si f11-01 es "registrar un activo", no hay órganos de
 * gobierno si f12-01 es "crear un órgano". Sembrarlos invalidaría la prueba.
 * Sí se siembra todo lo que esos ítems necesitan como PRERREQUISITO.
 *
 * Solo local. Uso:
 *   pnpm seed:qa-suite                 → las tres
 *   pnpm seed:qa-suite -- --solo=t1    → una sola
 *   pnpm seed:qa-suite -- --email=otro@correo.com
 */
import fs from 'node:fs'
import {
  asegurarUsuario,
  cargarCatalogo,
  clienteAdmin,
  clienteComo,
  digitoVerificacionNit,
  exigirLocal,
  invocarFuncion,
  log,
  paso,
  URL_SUPABASE,
} from './lib.mjs'

exigirLocal()

const args = process.argv.slice(2)
const arg = (nombre, porDefecto) => {
  const encontrado = args.find((a) => a.startsWith(`--${nombre}=`))
  return encontrado ? encontrado.slice(nombre.length + 3) : porDefecto
}
const EMAIL_ADMIN = arg('email', 'blancomj@gmail.com')
const SOLO = arg('solo', 't1,t2,t3')
  .split(',')
  .map((s) => s.trim().toLowerCase())

const PASSWORD_QA = 'QaAquila2026!'
const ANIO = 2026
const MES_CORRIENTE = 9

const admin = clienteAdmin()
const cat = await cargarCatalogo(admin)

// ═══════════════════════════════════════════════════════════════════════
//  Usuarios de prueba — cada uno existe por un ítem concreto del plan
// ═══════════════════════════════════════════════════════════════════════
const USUARIOS = [
  { clave: 'auxiliar', email: 'qa.auxiliar@aquila.test', nombre: 'Aura Auxiliar', rol: 'auxiliar', por: 'f1-03: el auxiliar SÍ puede escribir' },
  { clave: 'auditor', email: 'qa.auditor@aquila.test', nombre: 'Aldo Auditor', rol: 'auditor', por: 'f1-02: el auditor lee todo y no escribe nada' },
  { clave: 'aprobador', email: 'qa.aprobador@aquila.test', nombre: 'Ana Aprobadora', rol: 'administrador', por: 'f6-04/f6-05: maker-checker exige un segundo par de ojos' },
  { clave: 'financiero', email: 'qa.financiero@aquila.test', nombre: 'Fabio Financiero', rol: 'auxiliar', por: 'f1-05/f1-06: rol funcional acotado (contador)' },
  { clave: 'ajeno', email: 'qa.ajeno@aquila.test', nombre: 'Ajena Externa', rol: 'administrador', por: 'f17: miembro de T2 y de nadie más — el intruso de aislamiento' },
]

paso('Usuarios de prueba')
for (const u of USUARIOS) {
  u.id = await asegurarUsuario(admin, u.email, PASSWORD_QA, u.nombre)
  log(`  ${u.email.padEnd(28)} ${u.rol.padEnd(14)} ${u.por}`)
}

const sesionAdmin = await clienteComo(admin, EMAIL_ADMIN)
log(`  ${EMAIL_ADMIN.padEnd(28)} administrador  dueño de las tres copropiedades`)

// ═══════════════════════════════════════════════════════════════════════
//  El banco es de TRES copropiedades y solo tres: antes de sembrar se
//  retira la versión anterior de las que se van a volver a crear. Sin
//  esto, cada corrida (incluida una que falla a mitad) dejaría un tenant
//  huérfano y en dos días habría quince. fn_resetear_copropiedad limpia
//  todas las tablas con FK a tenants —cobertura verificada al 100 %
//  (D-99/D-122/D-125/D-126)— y después se borra la fila de tenants.
//  Solo toca los slugs de este banco: cualquier otra copropiedad local,
//  incluida "QA Integral", queda intacta.
// ═══════════════════════════════════════════════════════════════════════
const PREFIJO_SLUG = { t1: 'qa-torres-', t2: 'qa-plaza-', t3: 'qa-nuevo-' }

if (!args.includes('--conservar-previas')) {
  const prefijos = SOLO.map((c) => PREFIJO_SLUG[c]).filter(Boolean)
  const { data: previas } = await admin.from('tenants').select('id, name, slug')
  const aRetirar = (previas ?? []).filter((t) => prefijos.some((p) => t.slug?.startsWith(p)))
  if (aRetirar.length) {
    paso('Retirando la versión anterior del banco')
    for (const t of aRetirar) {
      const { error: errorReset } = await sesionAdmin.rpc('fn_resetear_copropiedad', { p_tenant_id: t.id })
      if (errorReset) {
        log(`  ⚠ ${t.slug}: no se pudo vaciar (${errorReset.message}) — queda en pie`)
        continue
      }
      const { error: errorBorrar } = await admin.from('tenants').delete().eq('id', t.id)
      log(`  ${t.slug.padEnd(22)} ${errorBorrar ? `⚠ ${errorBorrar.message}` : 'retirada'}`)
    }
  }
}

// ═══════════════════════════════════════════════════════════════════════
//  Bloques reutilizables
// ═══════════════════════════════════════════════════════════════════════

async function crearTenant(nombre, slug) {
  const { data, error } = await sesionAdmin.rpc('create_tenant', { p_name: nombre, p_slug: slug }).single()
  if (error) throw new Error(`create_tenant(${slug}): ${error.message}`)
  return data.id
}

async function configurarTenant(tenantId, datos) {
  const { error } = await admin.from('tenants').update(datos).eq('id', tenantId)
  if (error) throw new Error(`configurar tenant: ${error.message}`)
}

async function darMembresia(tenantId, usuario) {
  const { error } = await admin
    .from('memberships')
    .upsert({ tenant_id: tenantId, user_id: usuario.id, role: usuario.rol, status: 'active' }, { onConflict: 'tenant_id,user_id' })
  if (error) throw new Error(`membresía ${usuario.email}: ${error.message}`)
}

async function crearAgrupaciones(tenantId, nombres, codigoTipo = 'torre') {
  const tipoId = cat.id('AGRUPACION_PREDIOS', codigoTipo)
  const ids = {}
  for (const [i, nombre] of nombres.entries()) {
    const { data, error } = await admin
      .from('agrupaciones')
      .insert({ tenant_id: tenantId, nombre, tipo_id: tipoId, orden: i + 1, activa: true })
      .select('id')
      .single()
    if (error) throw new Error(`agrupación ${nombre}: ${error.message}`)
    ids[nombre] = data.id
  }
  return ids
}

async function crearInmuebles(tenantId, defs) {
  const creados = []
  for (const def of defs) {
    const { data, error } = await admin
      .from('inmuebles')
      .insert({
        tenant_id: tenantId,
        codigo: def.codigo,
        tipo_id: cat.id('TIPO_INMUEBLE', def.tipo),
        estado: 'activo',
        area_privada: def.area,
        area_comun: def.areaComun ?? null,
        agrupacion_id: def.agrupacionId ?? null,
        uso_predio_id: cat.id('USO_PREDIO', def.uso),
        matricula_inmobiliaria: def.matricula ?? null,
        habitabilidad_id: def.habitabilidad ? cat.id('HABITABILIDAD_PREDIO', def.habitabilidad) : null,
        gravamen_tipo_id: def.gravamen ? cat.id('TIPO_GRAVAMEN', def.gravamen) : null,
        activo_desde: `${ANIO}-01-01`,
      })
      .select('id, codigo')
      .single()
    if (error) throw new Error(`inmueble ${def.codigo}: ${error.message}`)
    creados.push({ ...def, id: data.id })
  }

  // El trigger de alta abre el tramo de inmueble_atributo_historico con
  // vigente_desde = hoy, que es lo correcto para un inmueble dado de alta
  // hoy. Pero estas copropiedades se supone que existen desde enero, y el
  // snapshot de liquidación exige atributos vigentes en la fecha del
  // periodo: sin retrodatar, liquidar 2026-07 falla con SNAPSHOT_INCOMPLETO.
  const { error: errorHistorico } = await admin
    .from('inmueble_atributo_historico')
    .update({ vigente_desde: `${ANIO}-01-01` })
    .eq('tenant_id', tenantId)
    .in('inmueble_id', creados.map((c) => c.id))
  if (errorHistorico) throw new Error(`retrodatar atributos: ${errorHistorico.message}`)

  return creados
}

function correoDe(texto) {
  return texto
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '.')
    .replace(/^\.|\.$/g, '')
}

async function crearPropietarios(tenantId, inmuebles, semilla) {
  const ROL_COPROPIETARIO = cat.id('PERSONA_PREDIO', 'copropietario')
  const ROL_ARRENDATARIO = cat.id('PERSONA_PREDIO', 'arrendatario')
  const CEDULA = cat.id('TIPO_IDENTIFICACION', 'cedula')
  const ACTIVO = cat.id('ESTADO_TERCERO', 'activo')
  for (const [i, inm] of inmuebles.entries()) {
    const [primerNombre, ...resto] = inm.propietario.split(' ')
    const { data: tercero, error } = await admin
      .from('terceros')
      .insert({
        tenant_id: tenantId,
        tipo_persona: 'natural',
        numero_documento: String(semilla + i * 137 + 17),
        tipo_identificacion_id: CEDULA,
        estado_id: ACTIVO,
        primer_nombre: primerNombre,
        primer_apellido: resto.join(' ') || primerNombre,
        email: `${correoDe(inm.propietario)}@qa.test`,
        telefono: `300${String(1000000 + i * 7919).slice(0, 7)}`,
      })
      .select('id')
      .single()
    if (error) throw new Error(`tercero ${inm.propietario}: ${error.message}`)
    inm.terceroId = tercero.id

    const { error: errorVinculo } = await admin.from('inmueble_persona_rol').insert({
      tenant_id: tenantId,
      inmueble_id: inm.id,
      tercero_id: tercero.id,
      rol_id: ROL_COPROPIETARIO,
      porcentaje: 100,
      vigente_desde: `${ANIO}-01-01`,
      es_pagador: true,
    })
    if (errorVinculo) throw new Error(`vínculo ${inm.codigo}: ${errorVinculo.message}`)

    // Dos inmuebles llevan además un arrendatario: f2-22 exige que dos
    // vínculos con roles distintos coexistan sin pisarse.
    if (inm.arrendatario) {
      const [an, ...ar] = inm.arrendatario.split(' ')
      const { data: t2, error: e2 } = await admin
        .from('terceros')
        .insert({
          tenant_id: tenantId,
          tipo_persona: 'natural',
          numero_documento: String(semilla + 900000 + i),
          tipo_identificacion_id: CEDULA,
          estado_id: ACTIVO,
          primer_nombre: an,
          primer_apellido: ar.join(' '),
          email: `${correoDe(inm.arrendatario)}@qa.test`,
        })
        .select('id')
        .single()
      if (e2) throw new Error(`arrendatario ${inm.arrendatario}: ${e2.message}`)
      const { error: e3 } = await admin.from('inmueble_persona_rol').insert({
        tenant_id: tenantId,
        inmueble_id: inm.id,
        tercero_id: t2.id,
        rol_id: ROL_ARRENDATARIO,
        // porcentaje solo aplica al copropietario: el check exige null o >0.
        porcentaje: null,
        vigente_desde: `${ANIO}-03-01`,
        es_pagador: false,
      })
      if (e3) throw new Error(`vínculo arrendatario ${inm.codigo}: ${e3.message}`)
    }
  }
}

async function crearProveedores(tenantId, desplazamiento) {
  const NIT = cat.id('TIPO_IDENTIFICACION', 'nit')
  const ACTIVO = cat.id('ESTADO_TERCERO', 'activo')
  const defs = [
    { razon: 'Vigilancia Andina S.A.S.', nit: 900111222 },
    { razon: 'Aseo Total Ltda.', nit: 900333444 },
    { razon: 'Ascensores del Caribe S.A.', nit: 900555666 },
    { razon: 'Seguros Confianza S.A.', nit: 900777888 },
  ]
  const ids = {}
  for (const [i, d] of defs.entries()) {
    const numero = String(d.nit + desplazamiento)
    const { data, error } = await admin
      .from('terceros')
      .insert({
        tenant_id: tenantId,
        tipo_persona: 'juridica',
        numero_documento: numero,
        digito_verificacion: digitoVerificacionNit(numero),
        tipo_identificacion_id: NIT,
        estado_id: ACTIVO,
        razon_social: d.razon,
        email: `contacto${i}@proveedor-qa.test`,
        telefono: `601${String(2000000 + i * 111).slice(0, 7)}`,
      })
      .select('id')
      .single()
    if (error) throw new Error(`proveedor ${d.razon}: ${error.message}`)
    ids[d.razon] = data.id
  }
  return ids
}

async function crearCoeficientes(tenantId, inmuebles, { vigente }) {
  const areaTotal = inmuebles.reduce((a, i) => a + i.area, 0)
  const valores = inmuebles.map((i) => Math.round((i.area / areaTotal) * 1e10) / 1e10)
  const desvio = 1 - valores.reduce((a, b) => a + b, 0)
  valores[valores.length - 1] = Math.round((valores[valores.length - 1] + desvio) * 1e10) / 1e10
  const suma = valores.reduce((a, b) => a + b, 0)
  if (Math.abs(suma - 1) > 1e-12) throw new Error(`coeficientes no suman 1: ${suma}`)

  const { data: set, error } = await admin
    .from('coeficiente_sets')
    .insert({ tenant_id: tenantId, version: 1, vigente_desde: `${ANIO}-01-01`, estado: 'borrador', suma_total: 1 })
    .select('id')
    .single()
  if (error) throw new Error(`set coeficientes: ${error.message}`)

  const { error: errorCoefs } = await admin.from('coeficientes').insert(
    inmuebles.map((inm, i) => ({ tenant_id: tenantId, set_id: set.id, inmueble_id: inm.id, valor: valores[i] })),
  )
  if (errorCoefs) throw new Error(`coeficientes: ${errorCoefs.message}`)

  if (vigente) {
    const { error: e } = await admin.from('coeficiente_sets').update({ estado: 'vigente' }).eq('id', set.id)
    if (e) throw new Error(`activar coeficientes: ${e.message}`)
  }
  return set.id
}

async function crearPoliticaFinanciera(tenantId, { fondoImprevistos = true } = {}) {
  const { error } = await admin.from('politicas_financieras').insert({
    tenant_id: tenantId,
    version: 1,
    estado: 'vigente',
    vigente_desde: `${ANIO}-01-01`,
    redondeo_modo: 'half_up',
    redondeo_escala: 0,
    residual_metodo: 'mayor_resto',
    coeficientes_suma_esperada: 1,
    // Sin porcentaje, el concepto FONDO_IMPREVISTOS falla explícito
    // (el snapshot no expone el parámetro) en vez de cobrar cero en
    // silencio. 1 % del presupuesto anual de gastos es el piso legal
    // colombiano (Ley 675, art. 35).
    fondo_imprevistos_porcentaje: fondoImprevistos ? 1 : null,
    fondo_imprevistos_base: fondoImprevistos ? 'presupuesto_anual' : null,
    policy_hash: `qa-suite-${tenantId.slice(0, 8)}`,
  })
  if (error) throw new Error(`política financiera: ${error.message}`)
}

async function crearPeriodos(tenantId, meses) {
  const ids = {}
  for (const mes of meses) {
    const { data, error } = await admin
      .from('periodos')
      .insert({
        tenant_id: tenantId,
        anio: ANIO,
        mes,
        fecha_vencimiento: `${ANIO}-${String(mes).padStart(2, '0')}-10`,
      })
      .select('id')
      .single()
    if (error) throw new Error(`periodo ${ANIO}-${mes}: ${error.message}`)
    ids[mes] = data.id
  }
  return ids
}

async function crearPresupuesto(tenantId, rubros, { vigente }) {
  const { data: cuentas, error: errorCuentas } = await admin
    .from('presupuesto_cuenta')
    .select('id, codigo, nombre')
    .eq('tenant_id', tenantId)
  if (errorCuentas) throw errorCuentas
  const porCodigo = new Map(cuentas.map((c) => [c.codigo, c]))

  const montoTotal = rubros.reduce((a, [, m]) => a + m, 0)
  const { data: presupuesto, error } = await admin
    .from('presupuestos')
    .insert({ tenant_id: tenantId, anio: ANIO, version: 1, estado: 'borrador', monto_total: montoTotal })
    .select('id')
    .single()
  if (error) throw new Error(`presupuesto: ${error.message}`)

  for (const [codigo, monto] of rubros) {
    const cuenta = porCodigo.get(codigo)
    if (!cuenta) throw new Error(`cuenta presupuestal "${codigo}" no existe en la plantilla del tenant`)
    const { error: e } = await admin.from('presupuesto_rubros').insert({
      tenant_id: tenantId,
      presupuesto_id: presupuesto.id,
      codigo: codigo.toUpperCase(),
      nombre: cuenta.nombre,
      cuenta_id: cuenta.id,
      monto_anual: monto,
    })
    if (e) throw new Error(`rubro ${codigo}: ${e.message}`)
  }

  if (vigente) {
    await admin.from('presupuestos').update({ estado: 'aprobado' }).eq('id', presupuesto.id)
    const { error: e } = await admin
      .from('presupuestos')
      .update({
        estado: 'vigente',
        fecha_aprobacion: `${ANIO}-01-05`,
        vigente_desde: `${ANIO}-01-01`,
        vigente_hasta: `${ANIO}-12-31`,
        acta_asamblea: `Acta 001-${ANIO} (banco QA)`,
      })
      .eq('id', presupuesto.id)
    if (e) throw new Error(`activar presupuesto: ${e.message}`)
  }
  return { id: presupuesto.id, montoTotal }
}

/**
 * Un concepto no salta de borrador a activo: el guard de maker-checker
 * (20260829100000) solo admite borrador → en_revision → activo. Se recorren
 * los dos saltos con service_role, donde auth.uid() es null y por tanto no
 * dispara SELF_APPROVAL — esto es un prerrequisito de la semilla, no el
 * caso de prueba de maker-checker (ese es f6-04/f6-05 sobre novedades).
 */
async function activarConceptos(tenantId, codigos) {
  // La plantilla de create_tenant() abre los conceptos con fecha de inicio
  // = hoy. Estas copropiedades cobran desde enero, y conceptoAplicaEnPeriodo
  // descarta en silencio todo periodo anterior al inicio: sin retrodatar,
  // liquidar 2026-01 devuelve un total de $0 sin un solo error. El contenido
  // de un concepto solo se puede editar en borrador (CONCEPTO_INMUTABLE),
  // así que esto va antes de las dos transiciones de estado.
  const { error: errorFechas } = await admin
    .from('conceptos')
    .update({ fecha_inicio_anio: ANIO, fecha_inicio_mes: 1 })
    .eq('tenant_id', tenantId)
    .in('codigo', codigos)
  if (errorFechas) throw new Error(`retrodatar conceptos: ${errorFechas.message}`)

  for (const estado of ['en_revision', 'activo']) {
    const { error } = await admin
      .from('conceptos')
      .update({ estado })
      .eq('tenant_id', tenantId)
      .in('codigo', codigos)
    if (error) throw new Error(`conceptos → ${estado}: ${error.message}`)
  }
}

async function instalarPlanContable(tenantId, grupo) {
  await configurarTenant(tenantId, {
    marco_grupo: grupo,
    marco_clasificado_at: new Date().toISOString(),
    marco_fundamento: 'Clasificación sembrada por el banco de pruebas QA.',
  })
  const { data, error } = await admin.rpc('fn_instanciar_plan_contable', {
    p_tenant_id: tenantId,
    p_incluir_opcionales: true,
  })
  if (error) throw new Error(`instalar plan contable: ${error.message}`)
  return Array.isArray(data) ? data[0] : data
}

async function crearCuentasBancarias(tenantId) {
  const defs = [
    { numero: '4567890123', tipo: 'ahorros', recaudo: true, entidad: 'bancolombia' },
    { numero: '9876543210', tipo: 'corriente', recaudo: false, entidad: 'davivienda' },
  ]
  const ids = {}
  for (const d of defs) {
    const { data, error } = await admin
      .from('cuentas_bancarias')
      .insert({
        tenant_id: tenantId,
        numero_cuenta: d.numero,
        tipo_cuenta: d.tipo,
        es_recaudo: d.recaudo,
        activa: true,
        titular: 'Copropiedad QA',
        entidad_financiera_id: cat.id('ENTIDAD_FINANCIERA', d.entidad),
      })
      .select('id')
      .single()
    if (error) throw new Error(`cuenta bancaria ${d.numero}: ${error.message}`)
    ids[d.recaudo ? 'recaudo' : 'operativa'] = data.id
  }
  return ids
}

async function sembrarConfiguracionCartera(tenantId) {
  const { error } = await admin.rpc('fn_sembrar_configuracion_cartera', { p_tenant_id: tenantId })
  if (error) throw new Error(`configuración de cartera: ${error.message}`)
}

/**
 * Liquida un periodo por el camino real de la UI, los tres tiempos:
 * simular (Edge Function) → solicitar aplicación (UPDATE directo, el guard
 * asigna propuesta_por desde auth.uid()) → aplicar (Edge Function).
 */
async function liquidarPeriodo(cliente, periodoId, etiqueta) {
  // aplicar-liquidacion admite 10 llamadas por hora y por usuario — un tope
  // pensado para una persona, no para sembrar ocho meses de historia de un
  // tirón. Se vacía el contador entre corridas, que es una concesión de la
  // semilla y nada más: el límite sigue vivo para cualquier otro llamador y
  // sigue siendo comprobable como caso de prueba.
  await admin.from('rate_limit_hits').delete().like('bucket', '%liquidacion%')

  const sim = await invocarFuncion(cliente, 'simular-liquidacion', { periodo_id: periodoId })
  if (!sim.ok) return { ok: false, etapa: 'simular', detalle: sim.json ?? sim.texto.slice(0, 500) }
  const liquidacionId = sim.json?.liquidacion_id ?? sim.json?.liquidacion?.id ?? sim.json?.id
  if (!liquidacionId) {
    return { ok: false, etapa: 'simular', detalle: `respuesta sin liquidacion_id: ${JSON.stringify(sim.json).slice(0, 500)}` }
  }

  const { error: errorProponer } = await cliente
    .from('liquidaciones')
    .update({ estado: 'pendiente_aprobacion', nota_solicitud: `Semilla del banco QA · ${etiqueta}` })
    .eq('id', liquidacionId)
  if (errorProponer) return { ok: false, etapa: 'proponer', liquidacionId, detalle: errorProponer.message }

  const apl = await invocarFuncion(cliente, 'aplicar-liquidacion', { liquidacion_id: liquidacionId })
  if (!apl.ok) return { ok: false, etapa: 'aplicar', liquidacionId, detalle: apl.json ?? apl.texto.slice(0, 500) }
  log(`  ${etiqueta}: liquidación ${liquidacionId.slice(0, 8)} aplicada`)
  return { ok: true, liquidacionId, respuesta: sim.json }
}

/**
 * Recaudo desigual a propósito: la fase f8 necesita mora real y no
 * inventada. Tres tercios — al día, abono parcial, sin pagar.
 */
async function registrarPagos(tenantId, periodoId, inmuebles, cuentaRecaudoId, fechaPago, registradoPor, perfil = 'desigual') {
  const { data: cargos, error } = await admin
    .from('cargos')
    .select('id, inmueble_id, monto_original')
    .eq('tenant_id', tenantId)
    .eq('periodo_id', periodoId)
  if (error) throw new Error(`leer cargos: ${error.message}`)
  if (!cargos.length) return { pagados: 0, parciales: 0, morosos: 0, cargos: 0 }

  const porInmueble = new Map()
  for (const c of cargos) {
    const acc = porInmueble.get(c.inmueble_id) ?? { total: 0, cargos: [] }
    acc.total += Number(c.monto_original)
    acc.cargos.push(c)
    porInmueble.set(c.inmueble_id, acc)
  }

  const FORMA = cat.id('FORMA_PAGO', 'transferencia_bancaria')
  let pagados = 0
  let parciales = 0
  let morosos = 0

  for (const [indice, inm] of inmuebles.entries()) {
    const acc = porInmueble.get(inm.id)
    if (!acc || acc.total <= 0) continue
    const resto = indice % 10
    const monto = perfil === 'completo'
      ? acc.total
      : resto <= 6
        ? acc.total
        : resto <= 8
          ? Math.round(acc.total * 0.4)
          : 0

    if (monto <= 0) {
      morosos++
      continue
    }

    const { data: pago, error: errorPago } = await admin
      .from('pagos')
      .insert({
        tenant_id: tenantId,
        inmueble_id: inm.id,
        monto,
        fecha_pago: fechaPago,
        forma_pago_id: FORMA,
        cuenta_bancaria_id: cuentaRecaudoId,
        referencia: `QA-${periodoId.slice(0, 6)}-${inm.codigo}`,
        pagador_tercero_id: inm.terceroId ?? null,
        registrado_por: registradoPor,
      })
      .select('id')
      .single()
    if (errorPago) throw new Error(`pago ${inm.codigo}: ${errorPago.message}`)

    let pendiente = monto
    for (const c of acc.cargos) {
      if (pendiente <= 0) break
      const aplica = Math.min(pendiente, Number(c.monto_original))
      const { error: e } = await admin
        .from('pago_aplicaciones')
        .insert({ tenant_id: tenantId, pago_id: pago.id, cargo_id: c.id, monto: aplica })
      if (e) throw new Error(`aplicación pago ${inm.codigo}: ${e.message}`)
      pendiente -= aplica
    }
    if (monto === acc.total) pagados++
    else parciales++
  }
  return { pagados, parciales, morosos, cargos: cargos.length }
}

// ═══════════════════════════════════════════════════════════════════════
//  Definición de las tres copropiedades
// ═══════════════════════════════════════════════════════════════════════

const NOMBRES_T1 = [
  'Andrea Gómez', 'Carlos Ramírez', 'Beatriz Suárez', 'Diego Martínez', 'Elena Rodríguez',
  'Felipe Torres', 'Gloria Pineda', 'Hernán Castro', 'Isabel Vargas', 'Javier Mendoza',
  'Karen López', 'Luis Herrera', 'Mónica Salazar', 'Nelson Ortiz', 'Olga Cárdenas',
  'Pedro Jiménez', 'Rosa Quintero', 'Sergio Delgado', 'Tatiana Rincón', 'Úrsula Fajardo',
  // f20-01 exige un nombre con tilde, eñe y apóstrofe a la vez.
  "Valentina Peña O'Higgins",
  'William Acosta', 'Ximena Bolaños', 'Yesid Contreras', 'Zulma Duarte',
  'Álvaro Escobar', 'Bárbara Fonseca', 'César Guzmán', 'Diana Hoyos', 'Emilio Ibáñez',
]

function definirInmueblesT1(agrupaciones) {
  const torres = Object.keys(agrupaciones)
  const defs = []
  let n = 0
  for (const [ti, torre] of torres.entries()) {
    for (let piso = 1; piso <= 5; piso++) {
      for (const puerta of ['1', '2']) {
        if (defs.length >= 30) break
        n++
        const completo = n % 3 !== 0 // dos de cada tres llevan los opcionales llenos
        defs.push({
          codigo: `T${ti + 1}-${piso}0${puerta}`,
          tipo: 'apartamento',
          uso: 'residencial',
          area: 45 + ((n * 7) % 51),
          areaComun: completo ? 8 + (n % 5) : null,
          agrupacionId: agrupaciones[torre],
          matricula: completo ? `050C-${1200000 + n}` : null,
          habitabilidad: completo ? 'habitado' : null,
          gravamen: n % 7 === 0 ? 'hipotecario' : completo ? 'ninguno' : null,
          propietario: NOMBRES_T1[n - 1],
          arrendatario: n === 4 ? 'Renato Arrieta' : n === 11 ? 'Silvia Barrios' : null,
        })
      }
    }
  }
  return defs.slice(0, 30)
}

const RUBROS_T1 = [
  ['egr_administrador', 48000000],
  ['vigilancia', 72000000],
  ['egr_aseo', 26400000],
  ['egr_mant_zonas_comunes', 18000000],
  ['egr_seguros', 14400000],
  ['egr_energia_torres', 10800000],
  ['egr_acueducto', 9600000],
  ['egr_gastos_asamblea', 3600000],
]

const RUBROS_T2 = [
  ['egr_administrador', 36000000],
  ['vigilancia', 54000000],
  ['egr_aseo', 18000000],
  ['egr_mant_zonas_comunes', 12000000],
  ['egr_seguros', 9600000],
]

const resultado = {
  generadoAt: new Date().toISOString(),
  supabase: URL_SUPABASE,
  passwordQa: PASSWORD_QA,
  adminPrincipal: EMAIL_ADMIN,
  usuarios: USUARIOS.map(({ clave, email, rol, por }) => ({ clave, email, rol, por })),
  tenants: {},
}

// ─── T1 · QA Torres del Parque ─────────────────────────────────────────
if (SOLO.includes('t1')) {
  paso('T1 · QA Torres del Parque (30 inmuebles, residencial, madura)')
  const sufijo = Date.now().toString(36).slice(-5)
  const tenantId = await crearTenant('QA Torres del Parque', `qa-torres-${sufijo}`)
  log(`  tenant ${tenantId}`)

  const nit = '901456789'
  await configurarTenant(tenantId, {
    nit,
    ciudad: 'Barranquilla',
    direccion: 'Calle 84 # 51B-20',
    email: 'admin@torresdelparque-qa.test',
    telefono_1: '6053601234',
    uso_economico: 'residencial',
    tipo_division_id: cat.id('TIPO_DIVISION_PH', 'residencial'),
    responsable_iva: false,
    explota_bienes_comunes: false,
    agente_retencion: false,
    zona_horaria: 'America/Bogota',
    dia_facturacion: 10,
  })

  for (const u of USUARIOS.filter((u) => u.clave !== 'ajeno')) await darMembresia(tenantId, u)
  log('  4 miembros además del administrador principal')

  const agrupaciones = await crearAgrupaciones(tenantId, ['Torre 1', 'Torre 2', 'Torre 3'])
  log('  3 torres')

  const inmuebles = await crearInmuebles(tenantId, definirInmueblesT1(agrupaciones))
  log(`  ${inmuebles.length} inmuebles (${inmuebles.filter((i) => i.matricula).length} con los opcionales completos)`)

  await crearPropietarios(tenantId, inmuebles, 1010000000)
  log(`  ${inmuebles.length} propietarios + 2 arrendatarios`)

  const proveedores = await crearProveedores(tenantId, 11)
  log(`  ${Object.keys(proveedores).length} proveedores (terceros jurídicos)`)

  await crearCoeficientes(tenantId, inmuebles, { vigente: true })
  log('  set de coeficientes vigente (Σ = 1.0000000000)')

  await crearPoliticaFinanciera(tenantId)
  log('  política financiera vigente: HALF_UP, escala 0, mayor resto')

  await sembrarConfiguracionCartera(tenantId)
  log('  configuración de cartera sembrada')

  const plan = await instalarPlanContable(tenantId, 'grupo_3')
  log(`  plan contable Grupo 3 instalado (${JSON.stringify(plan)})`)

  const cuentas = await crearCuentasBancarias(tenantId)
  log('  2 cuentas bancarias (una de recaudo)')

  const presupuesto = await crearPresupuesto(tenantId, RUBROS_T1, { vigente: true })
  log(`  presupuesto ${ANIO} vigente por $${presupuesto.montoTotal.toLocaleString('es-CO')}`)

  await activarConceptos(tenantId, ['ADMINISTRACION', 'FONDO_IMPREVISTOS'])
  log('  conceptos ADMINISTRACION y FONDO_IMPREVISTOS activos')

  // Los DOCE periodos del año, no solo los que se van a liquidar: el motor
  // reparte el monto anual del concepto entre los periodos que existen
  // (ejecutarDistribucion, paso 1). Con cuatro periodos en base, la cuota
  // mensual saldría tres veces más alta y ningún cuadre lo delataría.
  const periodos = await crearPeriodos(tenantId, [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12])
  log(`  12 periodos (${ANIO}-01 … ${ANIO}-12); el corriente (${ANIO}-09) queda ABIERTO sin liquidar`)

  resultado.tenants.t1 = {
    clave: 't1',
    nombre: 'QA Torres del Parque',
    id: tenantId,
    slug: `qa-torres-${sufijo}`,
    inmuebles: inmuebles.length,
    perfil: 'residencial, madura, con mora real; el periodo corriente sigue sin liquidar',
    periodos,
    periodoCorriente: periodos[MES_CORRIENTE],
    cuentaRecaudo: cuentas.recaudo,
    presupuestoTotal: presupuesto.montoTotal,
    proveedores,
    inmueblesRef: inmuebles.slice(0, 3).map((i) => ({ codigo: i.codigo, id: i.id })),
    _inmuebles: inmuebles,
  }
}

// ─── T2 · QA Plaza Comercial ───────────────────────────────────────────
if (SOLO.includes('t2')) {
  paso('T2 · QA Plaza Comercial (18 inmuebles, mixto, responsable de IVA)')
  const sufijo = Date.now().toString(36).slice(-5)
  const tenantId = await crearTenant('QA Plaza Comercial', `qa-plaza-${sufijo}`)
  log(`  tenant ${tenantId}`)

  const nit = '900987654'
  await configurarTenant(tenantId, {
    nit,
    ciudad: 'Bogotá',
    direccion: 'Carrera 15 # 88-64',
    uso_economico: 'mixto',
    tipo_division_id: cat.id('TIPO_DIVISION_PH', 'mixto'),
    responsable_iva: true,
    explota_bienes_comunes: true,
    agente_retencion: true,
    iva_periodicidad_id: cat.id('PERIODICIDAD_IVA', 'bimestral'),
    zona_horaria: 'America/Bogota',
  })

  await darMembresia(tenantId, USUARIOS.find((u) => u.clave === 'ajeno'))
  log('  miembro exclusivo: qa.ajeno@aquila.test (el intruso de la fase f17)')

  const agrupaciones = await crearAgrupaciones(tenantId, ['Nivel Comercial', 'Torre Oficinas'], 'nivel')

  const nombresT2 = [
    'Inversiones Delta', 'Comercial Sigma', 'Grupo Omega', 'Distribuidora Alfa',
    'Textiles Beta', 'Farmacia Gamma', 'Óptica Lambda', 'Papelería Épsilon', 'Café Zeta',
    'Estudio Theta', 'Consultoría Iota', 'Laboratorio Kappa', 'Notaría Mu', 'Agencia Nu',
    'Seguros Xi', 'Asesores Pi', 'Ingeniería Rho', 'Arquitectos Tau',
  ]
  const defsT2 = []
  for (let i = 0; i < 12; i++) {
    defsT2.push({
      codigo: `L-${101 + i}`, tipo: 'local', uso: 'comercial', area: 30 + i * 6,
      agrupacionId: agrupaciones['Nivel Comercial'], matricula: `050C-${2200000 + i}`,
      habitabilidad: 'habitado', gravamen: 'ninguno', propietario: nombresT2[i],
    })
  }
  for (let i = 0; i < 6; i++) {
    defsT2.push({
      codigo: `O-${201 + i}`, tipo: 'oficina', uso: 'comercial', area: 55 + i * 9,
      agrupacionId: agrupaciones['Torre Oficinas'], matricula: `050C-${2300000 + i}`,
      habitabilidad: 'habitado', gravamen: 'ninguno', propietario: nombresT2[12 + i],
    })
  }
  const inmuebles2 = await crearInmuebles(tenantId, defsT2)
  log(`  ${inmuebles2.length} inmuebles (12 locales + 6 oficinas)`)

  await crearPropietarios(tenantId, inmuebles2, 1030000000)
  await crearCoeficientes(tenantId, inmuebles2, { vigente: true })
  await crearPoliticaFinanciera(tenantId)
  await sembrarConfiguracionCartera(tenantId)
  const plan2 = await instalarPlanContable(tenantId, 'grupo_2')
  const cuentas2 = await crearCuentasBancarias(tenantId)
  const presupuesto2 = await crearPresupuesto(tenantId, RUBROS_T2, { vigente: true })
  await activarConceptos(tenantId, ['ADMINISTRACION'])
  const periodos2 = await crearPeriodos(tenantId, [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12])
  log(`  propietarios, coeficientes, política, cartera, plan Grupo 2 (${JSON.stringify(plan2)}),`)
  log(`  presupuesto $${presupuesto2.montoTotal.toLocaleString('es-CO')} y 12 periodos`)

  resultado.tenants.t2 = {
    clave: 't2',
    nombre: 'QA Plaza Comercial',
    id: tenantId,
    slug: `qa-plaza-${sufijo}`,
    inmuebles: inmuebles2.length,
    perfil: 'mixto comercial, responsable de IVA, agente de retención, marco Grupo 2',
    periodos: periodos2,
    periodoCorriente: periodos2[MES_CORRIENTE],
    cuentaRecaudo: cuentas2.recaudo,
    presupuestoTotal: presupuesto2.montoTotal,
    inmueblesRef: inmuebles2.slice(0, 3).map((i) => ({ codigo: i.codigo, id: i.id })),
    _inmuebles: inmuebles2,
  }
}

// ─── T3 · QA Conjunto Nuevo ────────────────────────────────────────────
if (SOLO.includes('t3')) {
  paso('T3 · QA Conjunto Nuevo (12 inmuebles, tablero en blanco)')
  const sufijo = Date.now().toString(36).slice(-5)
  const tenantId = await crearTenant('QA Conjunto Nuevo', `qa-nuevo-${sufijo}`)
  log(`  tenant ${tenantId}`)

  await configurarTenant(tenantId, {
    ciudad: 'Medellín',
    uso_economico: 'residencial',
    tipo_division_id: cat.id('TIPO_DIVISION_PH', 'residencial'),
    zona_horaria: 'America/Bogota',
  })

  const nombres3 = [
    'Ana Betancur', 'Bruno Cifuentes', 'Clara Díaz', 'Dario Estrada', 'Eva Franco',
    'Fabio Giraldo', 'Gina Henao', 'Hugo Isaza', 'Inés Jaramillo', 'Jorge Klinger',
    'Lina Muñoz', 'Mario Naranjo',
  ]
  const defs3 = nombres3.map((propietario, i) => ({
    codigo: `C-${String(i + 1).padStart(2, '0')}`,
    tipo: 'casa',
    uso: 'residencial',
    area: 72 + i * 4,
    propietario,
  }))
  const inmuebles3 = await crearInmuebles(tenantId, defs3)
  await crearPropietarios(tenantId, inmuebles3, 1050000000)
  log(`  ${inmuebles3.length} casas con propietario · SIN coeficientes activos, SIN presupuesto,`)
  log('  SIN plan contable instalado y SIN periodos — así lo pide f21-03')

  resultado.tenants.t3 = {
    clave: 't3',
    nombre: 'QA Conjunto Nuevo',
    id: tenantId,
    slug: `qa-nuevo-${sufijo}`,
    inmuebles: inmuebles3.length,
    perfil: 'recién creada, sin configurar — tablero en blanco para el ciclo por UI',
    periodos: {},
    inmueblesRef: inmuebles3.slice(0, 3).map((i) => ({ codigo: i.codigo, id: i.id })),
    _inmuebles: inmuebles3,
  }
}

// ═══════════════════════════════════════════════════════════════════════
//  Historia financiera de T1: dos periodos liquidados y recaudados
// ═══════════════════════════════════════════════════════════════════════
if (resultado.tenants.t1) {
  // Enero a mayo se cobran y se pagan enteros: es la historia limpia sobre
  // la que se apoyan los estados financieros y el flujo proyectado. Junio,
  // julio y agosto se recaudan desigual a propósito — de ahí sale la mora
  // real (hasta tres meses de atraso) que la fase f8 tiene que gestionar.
  // Septiembre, el periodo corriente, queda sin liquidar: es f6-06.
  paso('T1 · historia financiera (liquidar 01…08, recaudar)')
  const t1 = resultado.tenants.t1
  const informe = []
  for (const mes of [1, 2, 3, 4, 5, 6, 7, 8]) {
    const etiqueta = `${ANIO}-${String(mes).padStart(2, '0')}`
    const r = await liquidarPeriodo(sesionAdmin, t1.periodos[mes], etiqueta)
    if (!r.ok) {
      log(`  ⚠ ${etiqueta} NO se pudo liquidar (${r.etapa}): ${JSON.stringify(r.detalle).slice(0, 400)}`)
      informe.push({ mes, ok: false, etapa: r.etapa, detalle: r.detalle })
      break
    }
    const pagos = await registrarPagos(
      t1.id,
      t1.periodos[mes],
      t1._inmuebles,
      t1.cuentaRecaudo,
      `${etiqueta}-08`,
      USUARIOS.find((u) => u.clave === 'auxiliar').id,
      mes <= 5 ? 'completo' : 'desigual',
    )
    log(`  ${etiqueta}: ${pagos.cargos} cargos · ${pagos.pagados} al día · ${pagos.parciales} abono parcial · ${pagos.morosos} sin pagar`)
    informe.push({ mes, ok: true, ...pagos })
  }
  t1.historia = informe
}

// ═══════════════════════════════════════════════════════════════════════
paso('Resumen')
for (const t of Object.values(resultado.tenants)) delete t._inmuebles
fs.mkdirSync('qa', { recursive: true })

// Con --solo=t1 solo se resiembra una: las otras dos siguen en pie y su
// entrada en qa/tenants.json tiene que sobrevivir, o el agente se queda sin
// los ids de T2 y T3 en mitad de una fase.
if (fs.existsSync('qa/tenants.json')) {
  const previo = JSON.parse(fs.readFileSync('qa/tenants.json', 'utf8'))
  resultado.tenants = { ...previo.tenants, ...resultado.tenants }
}
fs.writeFileSync('qa/tenants.json', JSON.stringify(resultado, null, 2) + '\n')
for (const t of Object.values(resultado.tenants)) {
  log(`  ${t.clave.toUpperCase()} · ${t.nombre.padEnd(22)} ${String(t.inmuebles).padStart(2)} inmuebles · ${t.id}`)
}
log('\n  Tablero escrito en qa/tenants.json')
log(`  Contraseña de todos los usuarios de prueba: ${PASSWORD_QA}`)
log(`  Entrar en local: pnpm dev:login ${EMAIL_ADMIN}`)
