/**
 * Snapshot Builder respaldado por Supabase — Docs/17 §27-29 (SNAPSHOT
 * BUILDER RESPONSIBILITIES/NON-RESPONSIBILITY).
 *
 * Único módulo de liquidation-engine autorizado a hablar con Supabase
 * (D-14, vigilado por eslint.config.js) — el resto del paquete es puro y
 * opera solo sobre el `DataSnapshot` que esta función produce.
 *
 * PARAMETER.OTROS_INGRESOS_ANUAL / CUOTA_EXTRAORDINARIA_ANUAL / FONDO_IMPREVISTOS_ANUAL
 * (GAP-19, E-16 §5 fase 6 "neteo"): cada uno se resuelve como Σ fuente_financiacion.
 * valor_aplicado filtrado por lista_tipos.codigo (vía tipo_id — ex-enum, 20260830210000) del
 * presupuesto vigente. Antes de `fuente_financiacion`
 * (20260814200000_motor_presupuestal_financiacion.sql) estos parámetros no tenían fuente en el
 * esquema y el evaluador fallaba explícito (17 §37 SNAPSHOT INCOMPLETE) en vez de asumir cero en
 * silencio. Al principio solo OTROS_INGRESOS_ANUAL tenía parámetro — investigación externa
 * (INCP, Ley 675 art. 35/38) confirmó que cuota_extraordinaria también es ingreso real (se
 * reconoce en el estado de resultados al cobrarse) y fondo_imprevistos es aplicar un saldo ya
 * existente (efectivo restringido) — ambos merecían el mismo camino de neteo que otros_ingresos,
 * cerrado ahora. Ninguna fórmula está obligada a usarlos: quedan disponibles, igual que
 * OTROS_INGRESOS_ANUAL, para quien escriba la regla de la cuota.
 *
 * Nota de tipos: PostgrestResponse/PostgrestSingleResponse son uniones
 * discriminadas por `error` — tras `if (error) throw`, `data` queda
 * estrechado a no-nulo (array posiblemente vacío, o la fila con `.single()`)
 * sin necesitar `??`/`?.` adicionales. `.maybeSingle()` es la excepción
 * real: `data` puede ser `null` sin error, y así se trata más abajo.
 */
import type { AquilaClient } from '@aquila/shared'
import {
  crearDecimal,
  dividirDecimales,
  money,
  sumarDecimales,
  type Decimal,
  type ModoRedondeo,
} from '@aquila/financial-kernel'
import type { TypedValue } from '@aquila/ael-runtime'
import type { AtributosInmueble } from './alcance.js'
import type { DataSnapshot, SnapshotConcepto, SnapshotPeriodo } from './snapshot.js'
import { conceptoAplicaEnPeriodo } from './temporal.js'

function mapearModoRedondeo(modo: 'half_up' | 'half_even' | 'down' | 'up'): ModoRedondeo {
  switch (modo) {
    case 'half_up':
      return 'HALF_UP'
    case 'half_even':
      return 'HALF_EVEN'
    case 'down':
      return 'DOWN'
    case 'up':
      return 'UP'
  }
}

/** Último día del mes (`mes` 1-12) — day=0 de JS Date retrocede al último
 * día del mes anterior, y JS Date interpreta `month` 0-indexado, así que
 * pasar `mes` tal cual ya apunta al mes siguiente. UTC explícito: evita que
 * la zona horaria del runtime (Deno Edge Function) mueva el resultado. */
function diasDelMes(anio: number, mes: number): number {
  return new Date(Date.UTC(anio, mes, 0)).getUTCDate()
}

/** Día del mes de `fechaIso` (YYYY-MM-DD) si cae dentro de anio/mes — null
 * si la fecha es de otro periodo (incluye null de entrada). */
function diaSiCaeEnPeriodo(fechaIso: string | null, anio: number, mes: number): number | null {
  if (fechaIso === null) return null
  const partes = fechaIso.split('-').map(Number)
  const [a, m, d] = partes
  if (a === undefined || m === undefined || d === undefined || a !== anio || m !== mes) return null
  return d
}

/**
 * H2 (auditoría externa 2026-08-26): fracción de días del periodo en que el
 * inmueble estuvo activo. "1" (atajo, sin pasar por Decimal) cuando no hubo
 * transición este periodo — el caso inmensamente más común, y el
 * comportamiento exacto de antes de esta fase.
 */
export function calcularFraccionActiva(
  anio: number,
  mes: number,
  activoDesde: string | null,
  inactivoDesde: string | null,
): string {
  const totalDias = diasDelMes(anio, mes)
  const inicioTransicion = diaSiCaeEnPeriodo(activoDesde, anio, mes)
  const finTransicion = diaSiCaeEnPeriodo(inactivoDesde, anio, mes)
  if (inicioTransicion === null && finTransicion === null) return '1'

  const inicioEfectivo = inicioTransicion ?? 1
  // inactivo_desde es el primer día YA inactivo — el último día activo es el anterior.
  const finEfectivo = finTransicion !== null ? finTransicion - 1 : totalDias
  if (finEfectivo < inicioEfectivo) return '0'

  const diasActivos = finEfectivo - inicioEfectivo + 1
  return diasActivos === totalDias ? '1' : dividirDecimales(diasActivos, totalDias).toString()
}

interface FilaInmuebleAtributos {
  readonly id: string
  readonly estado_legal_id: number | null
  readonly habitabilidad_id: number | null
  readonly uso_predio_id: number | null
  /** ADC-01 — NOT NULL en el esquema (FK a TIPO_INMUEBLE). */
  readonly tipo_id: number
  readonly agrupacion_id: string | null
}

/** ADC-01 — ruta raíz→nodo de cada agrupación, a partir de los pares
 * (id, parent_id) del árbol del tenant. Pura y exportada para poder probarla
 * sin Supabase (mismo criterio que calcularFraccionActiva).
 *
 * Un parent_id que apunta a un nodo ausente, o un ciclo, cortan la ruta ahí en
 * vez de lanzar: el `agrupaciones_no_ciclo` del esquema ya impide ambos, y el
 * snapshot no es el lugar donde descubrir que el árbol quedó inconsistente —
 * lanzar aquí dejaría al tenant sin poder liquidar. */
export function construirRutasAgrupacion(
  filas: readonly { readonly id: string; readonly parent_id: string | null }[],
): Map<string, readonly string[]> {
  const padrePorId = new Map<string, string | null>(filas.map((f) => [f.id, f.parent_id]))
  const rutas = new Map<string, readonly string[]>()

  function rutaDe(id: string, visitados: ReadonlySet<string>): readonly string[] {
    const cacheada = rutas.get(id)
    if (cacheada) return cacheada
    const padre = padrePorId.get(id)
    // `!padrePorId.has(padre)`: un parent_id que apunta fuera del árbol no se
    // antepone a la ruta. Sin esa comprobación, ese id fantasma quedaría dentro
    // y una condición `agrupacion = <fantasma>` se cumpliría — cobrándole un
    // concepto segmentado a una unidad que no pertenece a esa agrupación.
    const ruta =
      padre === undefined || padre === null || !padrePorId.has(padre) || visitados.has(padre)
        ? [id]
        : [...rutaDe(padre, new Set([...visitados, id])), id]
    rutas.set(id, ruta)
    return ruta
  }

  for (const { id } of filas) rutaDe(id, new Set())
  return rutas
}

async function resolverRutasAgrupacion(
  cliente: AquilaClient,
  tenantId: string,
): Promise<Map<string, readonly string[]>> {
  const { data: filas, error } = await cliente
    .from('agrupaciones')
    .select('id, parent_id')
    .eq('tenant_id', tenantId)
  if (error) throw new Error(`No se pudieron leer las agrupaciones: ${error.message}`)
  return construirRutasAgrupacion(filas)
}

/** Fase 5 (alcance.ts): resuelve, para cada inmueble, los campos que un
 * concepto alcance='calculado' puede condicionar — salvo areaPrivada
 * (ya la trae inmueblesFilas del select principal, se funde en el llamador
 * para no leer inmuebles dos veces) y coeficiente (vive en SnapshotInmueble,
 * no en AtributosInmueble — ver comentario en alcance.ts).
 *
 * Propietario/Inquilino: inmueble_persona_rol sí admite varios titulares
 * vigentes simultáneos (decisión de sesión anterior) — con copropietario
 * gana el de mayor porcentaje (clasificación mayoritaria); con arrendatario/
 * inquilino gana el más reciente por vigente_desde (el ocupante actual).
 * Ambas son interpretaciones razonables, no el único diseño posible —
 * documentadas aquí porque el plan original no las resolvía.
 */
async function resolverAtributosInmueble(
  cliente: AquilaClient,
  tenantId: string,
  inmueblesFilas: readonly FilaInmuebleAtributos[],
  fechaReferencia: string,
): Promise<Map<string, Omit<AtributosInmueble, 'areaPrivada'>>> {
  const idsListaTipos = [
    ...new Set(
      inmueblesFilas
        .flatMap((i) => [i.estado_legal_id, i.habitabilidad_id, i.uso_predio_id, i.tipo_id])
        .filter((id): id is number => id !== null),
    ),
  ]
  const codigoPorListaTipoId = new Map<number, string>()
  if (idsListaTipos.length > 0) {
    const { data: filas, error } = await cliente
      .from('lista_tipos')
      .select('id, codigo')
      .in('id', idsListaTipos)
    if (error) throw new Error(`No se pudieron leer los catálogos de inmuebles: ${error.message}`)
    for (const f of filas) codigoPorListaTipoId.set(f.id, f.codigo)
  }

  const { data: rolesFilas, error: errorRoles } = await cliente
    .from('lista_tipos')
    .select('id, codigo')
    .eq('tipo', 'PERSONA_PREDIO')
    .in('codigo', ['copropietario', 'arrendatario', 'inquilino'])
  if (errorRoles) throw new Error(`No se pudo leer el catálogo PERSONA_PREDIO: ${errorRoles.message}`)
  const idCopropietario = rolesFilas.find((r) => r.codigo === 'copropietario')?.id
  const idsInquilino = new Set(
    rolesFilas.filter((r) => r.codigo === 'arrendatario' || r.codigo === 'inquilino').map((r) => r.id),
  )

  const inmuebleIds = inmueblesFilas.map((i) => i.id)
  const propietarioPorInmueble = new Map<string, 'natural' | 'juridica'>()
  const inquilinoPorInmueble = new Map<string, 'natural' | 'juridica'>()

  if (inmuebleIds.length > 0) {
    const { data: personaFilas, error: errorPersona } = await cliente
      .from('inmueble_persona_rol')
      .select('inmueble_id, rol_id, porcentaje, vigente_desde, tercero:terceros(tipo_persona)')
      .in('inmueble_id', inmuebleIds)
      .lte('vigente_desde', fechaReferencia)
      .or(`vigente_hasta.is.null,vigente_hasta.gte.${fechaReferencia}`)
    if (errorPersona) {
      throw new Error(`No se pudieron leer los roles de persona del inmueble: ${errorPersona.message}`)
    }

    const mejorPorcentaje = new Map<string, number>()
    const mejorFecha = new Map<string, string>()
    for (const fila of personaFilas as unknown as {
      inmueble_id: string
      rol_id: number
      porcentaje: string | null
      vigente_desde: string
      tercero: { tipo_persona: 'natural' | 'juridica' } | null
    }[]) {
      const tipoPersona = fila.tercero?.tipo_persona
      if (!tipoPersona) continue
      if (fila.rol_id === idCopropietario) {
        const porcentaje = fila.porcentaje === null ? 0 : Number(fila.porcentaje)
        if (porcentaje >= (mejorPorcentaje.get(fila.inmueble_id) ?? -1)) {
          mejorPorcentaje.set(fila.inmueble_id, porcentaje)
          propietarioPorInmueble.set(fila.inmueble_id, tipoPersona)
        }
      } else if (idsInquilino.has(fila.rol_id)) {
        if (fila.vigente_desde >= (mejorFecha.get(fila.inmueble_id) ?? '')) {
          mejorFecha.set(fila.inmueble_id, fila.vigente_desde)
          inquilinoPorInmueble.set(fila.inmueble_id, tipoPersona)
        }
      }
    }
  }

  const { data: cargosFilas, error: errorCargos } = await cliente
    .from('v_cargo_saldo')
    .select('inmueble_id, monto_pendiente')
    .eq('tenant_id', tenantId)
    .gt('monto_pendiente', 0)
  if (errorCargos) throw new Error(`No se pudo leer el saldo de cartera: ${errorCargos.message}`)
  const saldoPorInmueble = new Map<string, Decimal>()
  for (const c of cargosFilas) {
    // v_cargo_saldo tipa ambas columnas nullable (vista, no tabla) — en la
    // práctica nunca lo son para una fila real de cargo; se descarta la fila
    // en el caso imposible en vez de asumir 0 en silencio.
    if (c.inmueble_id === null || c.monto_pendiente === null) continue
    // H1 (auditoría 2026-08-26): suma con Decimal, no `+` de JS — única
    // acumulación de dinero de este paquete que no pasaba por financial-kernel.
    saldoPorInmueble.set(
      c.inmueble_id,
      (saldoPorInmueble.get(c.inmueble_id) ?? crearDecimal(0)).plus(c.monto_pendiente),
    )
  }

  const rutasAgrupacion = await resolverRutasAgrupacion(cliente, tenantId)

  const resultado = new Map<string, Omit<AtributosInmueble, 'areaPrivada'>>()
  for (const inmueble of inmueblesFilas) {
    resultado.set(inmueble.id, {
      estadoLegal:
        inmueble.estado_legal_id !== null
          ? (codigoPorListaTipoId.get(inmueble.estado_legal_id) ?? null)
          : null,
      habitabilidad:
        inmueble.habitabilidad_id !== null
          ? (codigoPorListaTipoId.get(inmueble.habitabilidad_id) ?? null)
          : null,
      tipoPropietario: propietarioPorInmueble.get(inmueble.id) ?? null,
      tipoInquilino: inquilinoPorInmueble.get(inmueble.id) ?? null,
      usoPredio:
        inmueble.uso_predio_id !== null
          ? (codigoPorListaTipoId.get(inmueble.uso_predio_id) ?? null)
          : null,
      saldoActual: saldoPorInmueble.has(inmueble.id) ? String(saldoPorInmueble.get(inmueble.id)) : null,
      tipoInmueble: codigoPorListaTipoId.get(inmueble.tipo_id) ?? null,
      agrupacionRuta:
        inmueble.agrupacion_id !== null ? (rutasAgrupacion.get(inmueble.agrupacion_id) ?? null) : null,
    })
  }
  return resultado
}

export interface OpcionesSnapshot {
  readonly tenantId: string
  readonly anio: number
  readonly mes: number
}

export async function construirSnapshotDesdeSupabase(
  cliente: AquilaClient,
  opciones: OpcionesSnapshot,
): Promise<DataSnapshot> {
  const { tenantId, anio, mes } = opciones

  const { data: tenant, error: errorTenant } = await cliente
    .from('tenants')
    .select('id, moneda')
    .eq('id', tenantId)
    .single()
  if (errorTenant) {
    throw new Error(`No se pudo resolver el tenant ${tenantId}: ${errorTenant.message}`)
  }

  const { data: periodosFilas, error: errorPeriodos } = await cliente
    .from('periodos')
    .select('id, anio, mes')
    .eq('tenant_id', tenantId)
    .eq('anio', anio)
    .order('mes')
  if (errorPeriodos) throw new Error(`No se pudieron leer los periodos: ${errorPeriodos.message}`)

  const periodosDelAnio: SnapshotPeriodo[] = periodosFilas.map((p) => ({
    id: p.id,
    anio: p.anio,
    mes: p.mes,
  }))
  const periodo = periodosDelAnio.find((p) => p.mes === mes)
  if (!periodo) {
    throw new Error(
      `No existe el periodo ${String(anio)}-${String(mes)} para el tenant ${tenantId}`,
    )
  }

  // Fase 5 (alcance.ts): fecha de referencia para "rol vigente" — primer
  // día del mes que se está liquidando, mismo criterio que "vigente en la
  // fecha del periodo" del plan original.
  const fechaReferencia = `${String(anio).padStart(4, '0')}-${String(mes).padStart(2, '0')}-01`
  const ultimoDiaPeriodo = `${String(anio).padStart(4, '0')}-${String(mes).padStart(2, '0')}-${String(diasDelMes(anio, mes)).padStart(2, '0')}`

  // H2 (auditoría externa 2026-08-26): estado='activo' ya no basta — un
  // inmueble que se retiró DENTRO de este periodo también debe entrar (se
  // prorratea, no se excluye de golpe). inactivo_desde fuera de [fecha
  // Referencia, ultimoDiaPeriodo] significa que llevaba inactivo desde
  // antes de este periodo — ese sí se excluye, comportamiento de siempre.
  const { data: inmueblesFilas, error: errorInmuebles } = await cliente
    .from('inmuebles')
    .select(
      'id, codigo, area_privada, area_comun, estado_legal_id, habitabilidad_id, uso_predio_id, tipo_id, agrupacion_id, estado, activo_desde, inactivo_desde',
    )
    .eq('tenant_id', tenantId)
    .or(
      `estado.eq.activo,and(estado.eq.inactivo,inactivo_desde.gte.${fechaReferencia},inactivo_desde.lte.${ultimoDiaPeriodo})`,
    )
  if (errorInmuebles)
    throw new Error(`No se pudieron leer los inmuebles: ${errorInmuebles.message}`)
  const atributosPorInmueble = await resolverAtributosInmueble(
    cliente,
    tenantId,
    inmueblesFilas,
    fechaReferencia,
  )

  const { data: setVigente, error: errorSet } = await cliente
    .from('coeficiente_sets')
    .select('id')
    .eq('tenant_id', tenantId)
    .eq('estado', 'vigente')
    .single()
  if (errorSet) {
    throw new Error(
      `No hay un coeficiente_set vigente para el tenant ${tenantId}: ${errorSet.message}`,
    )
  }

  const { data: coeficientesFilas, error: errorCoef } = await cliente
    .from('coeficientes')
    .select('inmueble_id, valor')
    .eq('set_id', setVigente.id)
  if (errorCoef) throw new Error(`No se pudieron leer los coeficientes: ${errorCoef.message}`)

  const coeficientePorInmueble = new Map(coeficientesFilas.map((c) => [c.inmueble_id, c.valor]))

  const inmuebles = inmueblesFilas.map((inmueble) => {
    const coeficiente = coeficientePorInmueble.get(inmueble.id)
    if (coeficiente === undefined) {
      throw new Error(`El inmueble ${inmueble.codigo} no tiene coeficiente en el set vigente`)
    }
    const atributosExtra = atributosPorInmueble.get(inmueble.id)
    return {
      id: inmueble.id,
      codigo: inmueble.codigo,
      coeficiente: String(coeficiente),
      fraccionActiva: calcularFraccionActiva(anio, mes, inmueble.activo_desde, inmueble.inactivo_desde),
      atributos: {
        estadoLegal: atributosExtra?.estadoLegal ?? null,
        habitabilidad: atributosExtra?.habitabilidad ?? null,
        areaPrivada: inmueble.area_privada !== null ? String(inmueble.area_privada) : null,
        tipoPropietario: atributosExtra?.tipoPropietario ?? null,
        tipoInquilino: atributosExtra?.tipoInquilino ?? null,
        usoPredio: atributosExtra?.usoPredio ?? null,
        saldoActual: atributosExtra?.saldoActual ?? null,
        tipoInmueble: atributosExtra?.tipoInmueble ?? null,
        agrupacionRuta: atributosExtra?.agrupacionRuta ?? null,
      },
    }
  })

  // UNIT.* por inmueble (AREA_PRIVADA/AREA_COMUN/COEFICIENTE) — antes solo se
  // cableaban para el panel "Probar fórmula" (D-13: "snapshot.unidades nunca
  // se puebla"), decisión revertida: son datos reales (`inmuebles.area_*`,
  // `coeficientes` ya leído arriba), no hace falta un caso piloto nuevo para
  // justificarlos (AD-23 ya se satisface). Un área nula se omite del
  // catálogo de ESE inmueble en vez de inventar 0 — una fórmula que la
  // referencie para ese inmueble falla con ContractoNoResueltoError
  // (17 §37 SNAPSHOT INCOMPLETE), que ejecutarPlan() no atrapa y aborta toda
  // la liquidación del periodo — no hace falta un chequeo eager aparte.
  const unidades: Record<string, Record<string, TypedValue>> = {}
  for (const inmueble of inmueblesFilas) {
    const coeficiente = coeficientePorInmueble.get(inmueble.id)
    if (coeficiente === undefined) continue // ya lanzó arriba — inalcanzable, solo para el tipo
    const campos: Record<string, TypedValue> = {
      COEFICIENTE: { tipo: 'NUMBER', valor: crearDecimal(coeficiente) },
    }
    if (inmueble.area_privada !== null) {
      campos.AREA_PRIVADA = { tipo: 'NUMBER', valor: crearDecimal(inmueble.area_privada) }
    }
    if (inmueble.area_comun !== null) {
      campos.AREA_COMUN = { tipo: 'NUMBER', valor: crearDecimal(inmueble.area_comun) }
    }
    unidades[inmueble.id] = campos
  }

  const { data: presupuesto, error: errorPresupuesto } = await cliente
    .from('presupuestos')
    .select('id, anio, monto_total')
    .eq('tenant_id', tenantId)
    .eq('anio', anio)
    .eq('estado', 'vigente')
    .maybeSingle()
  if (errorPresupuesto)
    throw new Error(`No se pudo leer el presupuesto vigente: ${errorPresupuesto.message}`)

  const { data: politica, error: errorPolitica } = await cliente
    .from('politicas_financieras')
    .select('redondeo_modo, redondeo_escala, fondo_imprevistos_porcentaje, fondo_imprevistos_base')
    .eq('tenant_id', tenantId)
    .eq('estado', 'vigente')
    .single()
  if (errorPolitica) {
    throw new Error(
      `No hay una política financiera vigente para el tenant ${tenantId}: ${errorPolitica.message}`,
    )
  }

  const { data: conceptosFilas, error: errorConceptos } = await cliente
    .from('conceptos')
    .select(
      'id, codigo, modo_calculo, modo_valor, formula_ael, valor_fijo, prioridad, tipo_recurrencia, fecha_inicio_anio, fecha_inicio_mes, fecha_fin_anio, fecha_fin_mes, periodicidad, alcance, alcance_condiciones',
    )
    .eq('tenant_id', tenantId)
    .eq('estado', 'activo')
  if (errorConceptos)
    throw new Error(`No se pudieron leer los conceptos: ${errorConceptos.message}`)

  // v0 no ejecuta un concepto formulado sin formula_ael todavía capturada —
  // AD-23: se amplía cuando un caso real lo requiera. Un concepto fijo
  // siempre tiene valor_fijo (CHECK de la base de datos), así
  // que nunca se filtra por esta razón. El segundo filtro (temporal.ts)
  // excluye lo que no aplica en ESTE periodo (anio, mes) — recurrente aún no
  // vigente, único de otro mes, por_periodo fuera de rango, o novedad
  // (siempre, Fase 4).
  const conceptos: SnapshotConcepto[] = conceptosFilas
    .filter((c) => (c.modo_valor === 'fijo' ? c.valor_fijo !== null : c.formula_ael !== null))
    .map((c) => ({
      id: c.id,
      codigo: c.codigo,
      modoCalculo: c.modo_calculo,
      modoValor: c.modo_valor,
      formulaAel: c.formula_ael ?? '',
      valorFijo: c.valor_fijo !== null ? String(c.valor_fijo) : null,
      prioridad: c.prioridad,
      tipoRecurrencia: c.tipo_recurrencia,
      fechaInicioAnio: c.fecha_inicio_anio,
      fechaInicioMes: c.fecha_inicio_mes,
      fechaFinAnio: c.fecha_fin_anio,
      fechaFinMes: c.fecha_fin_mes,
      periodicidad: c.periodicidad,
      alcance: c.alcance,
      alcanceCondiciones: c.alcance_condiciones as unknown as SnapshotConcepto['alcanceCondiciones'],
    }))
    .filter((c) => conceptoAplicaEnPeriodo(c, anio, mes))

  const parametros: Record<string, TypedValue> = {}
  if (presupuesto) {
    parametros.PRESUPUESTO_ANUAL = {
      tipo: 'MONEY',
      valor: money(presupuesto.monto_total, tenant.moneda),
    }

    const { data: fuentes, error: errorFuentes } = await cliente
      .from('fuente_financiacion')
      .select('valor_aplicado, lista_tipos!inner(codigo)')
      .eq('presupuesto_id', presupuesto.id)
      .in('lista_tipos.codigo', ['otros_ingresos', 'cuota_extraordinaria', 'fondo_imprevistos'])
    if (errorFuentes)
      throw new Error(`No se pudieron leer las fuentes de financiación: ${errorFuentes.message}`)

    // H1 (auditoría 2026-08-26): suma con Decimal, no `+` de JS.
    const sumaPorCodigo = (codigo: string) =>
      sumarDecimales(
        fuentes.filter((f) => f.lista_tipos.codigo === codigo).map((f) => f.valor_aplicado),
      )

    parametros.OTROS_INGRESOS_ANUAL = {
      tipo: 'MONEY',
      valor: money(sumaPorCodigo('otros_ingresos'), tenant.moneda),
    }
    parametros.CUOTA_EXTRAORDINARIA_ANUAL = {
      tipo: 'MONEY',
      valor: money(sumaPorCodigo('cuota_extraordinaria'), tenant.moneda),
    }
    parametros.FONDO_IMPREVISTOS_ANUAL = {
      tipo: 'MONEY',
      valor: money(sumaPorCodigo('fondo_imprevistos'), tenant.moneda),
    }
  }

  // BLOQUE K (GAP-22, D-38): activa las dos columnas de politicas_financieras
  // que hasta ahora nadie leía. Solo se exponen si hay porcentaje configurado —
  // así un concepto FONDO_IMPREVISTOS activado sin porcentaje falla explícito
  // (ContractoNoResueltoError) en vez de cobrar cero en silencio, mismo criterio
  // que el resto del snapshot (17 §37 SNAPSHOT INCOMPLETE).
  if (politica.fondo_imprevistos_porcentaje !== null) {
    parametros.FONDO_IMPREVISTOS_PORCENTAJE = {
      tipo: 'NUMBER',
      valor: crearDecimal(politica.fondo_imprevistos_porcentaje),
    }
    parametros.FONDO_IMPREVISTOS_BASE_CUOTA_ADMIN = {
      tipo: 'BOOLEAN',
      valor: politica.fondo_imprevistos_base === 'cuota_administracion',
    }
  }

  return {
    tenantId: tenant.id,
    moneda: tenant.moneda,
    periodo,
    periodosDelAnio,
    inmuebles,
    conceptos,
    presupuestoVigente: presupuesto
      ? { id: presupuesto.id, anio: presupuesto.anio, montoTotal: String(presupuesto.monto_total) }
      : null,
    politica: {
      redondeoModo: mapearModoRedondeo(politica.redondeo_modo),
      redondeoEscala: politica.redondeo_escala,
    },
    parametros,
    unidades,
  }
}
