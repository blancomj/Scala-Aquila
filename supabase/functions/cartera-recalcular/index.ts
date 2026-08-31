// CAR F8 — JOB_CARTERA_DIARIA (§18). Compone lo ya construido en F1-F7
// (clasificarCartera, evaluarEscalamiento, cartera_etapas, promesas_pago,
// acuerdo_pago_cuotas/acuerdos_pago) vía el orquestador puro
// evaluarJobCarteraInmueble() (packages/liquidation-engine/src/cartera-job.ts)
// — REC-CAR-004: ningún cálculo se reimplementa aquí, esta función solo
// carga datos, llama al orquestador y persiste lo que decide.
//
// modo:'simulacion' NUNCA escribe — se detiene después de calcular los
// planes y el resultadoHash (§18.1: "ningún administrador acepta que el
// sistema empiece a enviar requerimientos sin haber visto antes qué va a
// enviar"). modo:'ejecucion' persiste.
//
// Desde 2026-08-28 SÍ crea acciones_cobranza (§18.2 pasos 14-16): el
// destinatario se resuelve con resolverDestinatarios() según las cuatro
// reglas de negocio decididas ese día — el obligado del art. 29 es el
// copropietario, se notifica a todos los vigentes uno por uno, el opt-out
// no bloquea lo obligatorio y el apoderado acompaña sin reemplazar. Las
// hermanas de un mismo disparo se unen con grupo_envio_id (20260905110000)
// conservando evidencia por persona.
//
// Desde 2026-08-30 SÍ compara contra el snapshot de ayer y emite
// CARTERA_CLASIFICACION_CAMBIO (§18.2 paso 8): cargarEntradaJobCarteraInmueble
// trae clasificacionAnterior sin lectura extra (reutiliza la consulta que ya
// calculaba diasEnTramoActual, ver cartera-job-supabase.ts).
//
// Sigue acotada en un punto: no está agendada por pg_cron — se invoca a
// mano, por un administrador — mismo criterio de "un humano aprieta el
// botón" que el resto del bloque de cobranza.
//
// Idempotencia (PH-C33): las escrituras de estado (cartera_etapas,
// promesas_pago, acuerdo_pago_cuotas, acuerdos_pago) son idempotentes por
// construcción — evaluarJobCarteraInmueble() solo propone un cambio si el
// estado leído todavía lo amerita, así que una segunda corrida con los
// mismos datos no encuentra nada que cambiar. posiciones_cartera_snapshot
// y eventos_cartera usan upsert con ignoreDuplicates (IDEM-01/IDEM-03).
import { withSupabase } from '@supabase/server'
import { z } from 'zod'
// dist/index.js (compilado), no src/index.ts — mismo motivo que
// cartera-posicion/index.ts.
import {
  cargarEntradaJobCarteraInmueble,
  calcularPosicionHash,
  calcularResultadoJobHash,
  clasificarCartera,
  evaluarJobCarteraInmueble,
  obtenerEstrategiasCobranzaVigentes,
  obtenerInmueblesDelTenant,
  obtenerPoliticaClasificacionVigente,
} from '../../../packages/liquidation-engine/dist/index.js'
import type { Database } from '../../../packages/shared/src/database.generated.ts'
import { errorResponse, jsonResponse } from '../_shared/http.ts'
import { logEvent } from '../_shared/logger.ts'
import { enforceRateLimit } from '../_shared/rate_limit.ts'

const RATE_LIMIT_MAX_HITS = 10
const RATE_LIMIT_VENTANA = '1 hour'

const payloadSchema = z.object({
  tenant_id: z.string().uuid(),
  fecha_corte: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'fecha_corte debe ser YYYY-MM-DD.'),
  modo: z.enum(['simulacion', 'ejecucion']),
  alcance_inmuebles: z.array(z.string().uuid()).optional(),
})

interface Alerta {
  readonly inmuebleId: string
  readonly tipo: 'requiere_aprobacion' | 'bloqueado'
  readonly mensaje: string
}

// Espejo local — dist/index.js pierde los exports type-only al compilar
// (mismo patrón que PoliticaClasificacionLocal en cartera-posicion/index.ts).
type NivelRiesgoLocal = 'ninguno' | 'bajo' | 'medio' | 'alto' | 'critico'
type EtapaCobranzaLocal = 'preventiva' | 'administrativa' | 'prejuridica' | 'juridica' | 'judicial'
interface TramoClasificacionLocal {
  readonly codigo: string
  readonly diasMin: number
  readonly diasMax: number | null
  readonly nivelRiesgo: NivelRiesgoLocal
  readonly etapaCobranza: EtapaCobranzaLocal
  readonly prioridad: number
}
interface PoliticaClasificacionLocal {
  readonly id: string
  readonly version: number
  readonly tramos: readonly TramoClasificacionLocal[]
}
interface ResultadoClasificacionLocal {
  readonly codigo: string
  readonly nivelRiesgo: NivelRiesgoLocal
  readonly etapaCobranza: EtapaCobranzaLocal
  readonly prioridad: number
  readonly diasMora: number
  readonly politicaId: string
  readonly politicaVersion: number
}
// DecisionEscalamiento es un export type-only de cartera-escalamiento.ts —
// dist/*.js lo pierde al compilar (mismo motivo documentado en la cabecera
// de cartera-job-supabase.ts), así que ReturnType<typeof
// evaluarJobCarteraInmueble> resuelve mal esta parte del tipo. Se espeja
// aquí, igual que TramoClasificacionLocal/PoliticaClasificacionLocal.
type DecisionEscalamientoLocal =
  | { readonly tipo: 'permanecer' }
  | {
      readonly tipo: 'escalar'
      readonly hacia: EtapaCobranzaLocal
      readonly requiereAprobacion: boolean
      readonly motivo: string
    }
  | {
      readonly tipo: 'desescalar'
      readonly hacia: EtapaCobranzaLocal
      readonly requiereAprobacion: boolean
      readonly motivo: string
    }
  | { readonly tipo: 'congelar'; readonly motivo: string }
  | { readonly tipo: 'bloqueado'; readonly requisitoFaltante: string }
interface CambioPromesaLocal {
  readonly promesaId: string
  readonly nuevoEstado: 'incumplida'
}
interface CambioCuotaLocal {
  readonly cuotaId: string
  readonly nuevoEstado: 'vencida'
}
interface CambioAcuerdoLocal {
  readonly acuerdoId: string
  readonly nuevoEstado: 'incumplido'
}
interface CambioClasificacionLocal {
  readonly codigoAnterior: string
  readonly diasMoraAnterior: number
  readonly codigoNuevo: string
  readonly diasMoraNuevo: number
}
type TipoAccionCobranzaLocal =
  | 'email'
  | 'sms'
  | 'whatsapp'
  | 'llamada'
  | 'carta'
  | 'requerimiento_formal'
  | 'aviso_prejuridico'
  | 'publicacion_morosos'
  | 'restriccion_servicios'
  | 'visita'
  | 'asignacion_abogado'
  | 'remision_juridica'
  | 'propuesta_acuerdo'
  | 'revision_manual'
type CanalCobranzaLocal = 'email' | 'sms' | 'whatsapp' | 'telefono' | 'fisico' | 'interno'
// §18.2 pasos 14-16 — mismos "espejo local" que el resto del archivo:
// dist/index.js pierde los exports type-only al compilar.
interface DestinatarioResueltoLocal {
  readonly terceroId: string
  readonly rolCodigo: string
  readonly contacto: string
}
interface AccionConDestinatariosLocal {
  readonly estrategiaId: string
  readonly tipoAccion: TipoAccionCobranzaLocal
  readonly canal: CanalCobranzaLocal
  readonly intentoNumero: number
  readonly requiereAprobacion: boolean
  readonly destinatarios: readonly DestinatarioResueltoLocal[]
}
interface AccionOmitidaLocal {
  readonly estrategiaId: string
  readonly motivo: string
}
interface AccionBloqueadaLocal {
  readonly estrategiaId: string
  readonly tipoAccion: TipoAccionCobranzaLocal
  readonly canal: CanalCobranzaLocal
  readonly causa: 'sin_destinatario' | 'contacto_faltante' | 'no_aplica'
  readonly motivo: string
}
interface PlanJobCarteraInmuebleLocal {
  readonly inmuebleId: string
  readonly clasificacion: ResultadoClasificacionLocal
  readonly decisionEscalamiento: DecisionEscalamientoLocal
  readonly promesasIncumplidas: readonly CambioPromesaLocal[]
  readonly cuotasVencidas: readonly CambioCuotaLocal[]
  readonly acuerdoIncumplido: CambioAcuerdoLocal | null
  readonly cambioClasificacion: CambioClasificacionLocal | null
  readonly accionesPropuestas: readonly AccionConDestinatariosLocal[]
  readonly accionesOmitidas: readonly AccionOmitidaLocal[]
  readonly accionesBloqueadas: readonly AccionBloqueadaLocal[]
}

export default {
  // auth: ['user', 'secret'] — la misma operación la disparan dos actores
  // distintos: un administrador desde la interfaz, y el CRON diario
  // (§18, cartera-cron-diario), que no es una persona y no tiene sesión.
  // 'secret' valida la clave interna del proyecto en el header apikey.
  fetch: withSupabase<Database>({ auth: ['user', 'secret'] }, async (req, ctx) => {
    const correlationId = crypto.randomUUID()
    const actorId = ctx.userClaims?.id ?? null
    // Sin usuario = el job. Es lo que el rector llama creada_por='job'
    // (§10.2): no hay persona que auditar, y el actor queda en null a
    // propósito — inventarle un usuario al sistema sería peor.
    const esJob = actorId === null
    const cliente = esJob ? ctx.supabaseAdmin : ctx.supabase
    if (req.method !== 'POST') {
      return errorResponse(405, 'METHOD_NOT_ALLOWED', 'Solo POST.', undefined, correlationId)
    }

    let payload: unknown
    try {
      payload = await req.json()
    } catch {
      return errorResponse(400, 'INVALID_PAYLOAD', 'El cuerpo debe ser JSON válido.', undefined, correlationId)
    }
    const parseo = payloadSchema.safeParse(payload)
    if (!parseo.success) {
      return errorResponse(
        400,
        'INVALID_PAYLOAD',
        parseo.error.issues[0]?.message ?? 'Payload inválido.',
        { issues: parseo.error.issues },
        correlationId,
      )
    }
    const { tenant_id: tenantId, fecha_corte: fechaCorte, modo, alcance_inmuebles: alcanceInmuebles } = parseo.data

    // El rate limit es por actor humano; el cron corre una vez al día y no
    // compite con nadie por la cuota de nadie.
    if (!esJob) {
      const bloqueo = await enforceRateLimit(
        cliente,
        `cartera_recalcular:${actorId}`,
        RATE_LIMIT_MAX_HITS,
        RATE_LIMIT_VENTANA,
        correlationId,
      )
      if (bloqueo) return bloqueo
    }

    // §22.3: rol mínimo administrador cuando lo dispara una persona. El
    // job no tiene rol que comprobar: su barrera es la clave secreta del
    // proyecto, que nunca sale de las Edge Functions.
    if (!esJob) {
      const { data: esAdministrador, error: errorRol } = await cliente.rpc('has_role', {
        p_tenant: tenantId,
        p_roles: ['administrador'],
      })
      if (errorRol) return errorResponse(500, 'INTERNAL_ERROR', errorRol.message, undefined, correlationId)
      if (!esAdministrador) {
        return errorResponse(
          403,
          'FORBIDDEN',
          'Ejecutar el job diario de cartera exige rol administrador.',
          undefined,
          correlationId,
        )
      }
    }

    // 0. Prerrequisito bloqueante (PH-C26/I-C14): sin política de clasificación vigente, ABORTAR.
    let politica: PoliticaClasificacionLocal
    try {
      politica = await obtenerPoliticaClasificacionVigente(cliente, { tenantId })
    } catch (excepcion) {
      logEvent({
        level: 'warn',
        action: 'cartera_recalcular.blocked_sin_politica',
        correlationId,
        actorId,
        tenantId,
        message: excepcion instanceof Error ? excepcion.message : 'sin política',
      })
      return errorResponse(
        422,
        'POLITICA_CLASIFICACION_NO_VIGENTE',
        'BLOCKED — el tenant no tiene una política de clasificación de cartera vigente (CAR §8, PH-C26).',
        undefined,
        correlationId,
      )
    }

    const estrategias = await obtenerEstrategiasCobranzaVigentes(cliente, { tenantId, politicaId: politica.id })
    const inmuebleIds = await obtenerInmueblesDelTenant(cliente, { tenantId, alcanceInmuebles })

    // Garantiza que cada inmueble tenga fila en cartera_etapas antes de evaluar
    // (nace en preventiva — guard_cartera_etapa_inicial, F6). No-op si ya existe.
    for (const inmuebleId of inmuebleIds) {
      const { error: errorEtapaSeed } = await cliente
        .from('cartera_etapas')
        .upsert(
          { tenant_id: tenantId, inmueble_id: inmuebleId },
          { onConflict: 'tenant_id,inmueble_id', ignoreDuplicates: true },
        )
      if (errorEtapaSeed) {
        return errorResponse(500, 'INTERNAL_ERROR', errorEtapaSeed.message, undefined, correlationId)
      }
    }

    const { data: posiciones, error: errorPosiciones } = await cliente.rpc('fn_posicion_cartera', {
      p_tenant_id: tenantId,
      p_fecha_corte: fechaCorte,
    })
    if (errorPosiciones) {
      return errorResponse(500, 'INTERNAL_ERROR', errorPosiciones.message, undefined, correlationId)
    }
    const posicionesDelAlcance = posiciones.filter((p) => inmuebleIds.includes(p.inmueble_id))

    const ejecucionId = crypto.randomUUID()
    const planes: PlanJobCarteraInmuebleLocal[] = []
    const posicionesPorInmueble = new Map<string, (typeof posicionesDelAlcance)[number]>()

    for (const fila of posicionesDelAlcance) {
      const diasMoraMaximo = fila.dias_mora_maximo ?? 0
      const clasificacion = clasificarCartera(diasMoraMaximo, politica)

      const entrada = await cargarEntradaJobCarteraInmueble(cliente, {
        tenantId,
        inmuebleId: fila.inmueble_id,
        fechaCorte,
        diasMoraMaximo,
        saldoVencido: String(fila.deuda_total),
        politicaClasificacion: politica,
        clasificacionCodigo: clasificacion.codigo,
        estrategias,
        toleranciaDiasPromesa: 0, // CAR §12.2 — default explícito del documento, sin [CONFIG] todavía.
      })
      // Cast justificado: el mismo problema de resolución de tipos que
      // motiva DecisionEscalamientoLocal (ver arriba) hace que deno
      // resuelva el propio valor de retorno con 'tipo' ensanchado a
      // string — el objeto en tiempo de ejecución es el real, correcto.
      planes.push(evaluarJobCarteraInmueble(entrada) as PlanJobCarteraInmuebleLocal)
      posicionesPorInmueble.set(fila.inmueble_id, fila)
    }

    const resultadoHash = calcularResultadoJobHash(planes)

    if (modo === 'simulacion') {
      return jsonResponse(
        {
          ejecucionId,
          fechaCorte,
          modo,
          inmueblesEvaluados: planes.length,
          planes: planes.map((p) => ({
            inmuebleId: p.inmuebleId,
            clasificacionCodigo: p.clasificacion.codigo,
            etapaCobranza: p.clasificacion.etapaCobranza,
            decisionEscalamiento: p.decisionEscalamiento,
            cambioClasificacion: p.cambioClasificacion,
            promesasIncumplidas: p.promesasIncumplidas,
            cuotasVencidas: p.cuotasVencidas,
            acuerdoIncumplido: p.acuerdoIncumplido,
          })),
          resultadoHash,
        },
        200,
        correlationId,
      )
    }

    // ── modo: ejecución — persistir ─────────────────────────────────────
    let cambiosClasificacionTotal = 0
    let cambiosEtapa = 0
    let candidatosEscalamiento = 0
    let accionesCreadasTotal = 0
    let accionesOmitidasTotal = 0
    let accionesBloqueadasTotal = 0
    let promesasIncumplidasTotal = 0
    let acuerdosIncumplidosTotal = 0
    const alertas: Alerta[] = []
    const errores: string[] = []

    for (const plan of planes) {
      const fila = posicionesPorInmueble.get(plan.inmuebleId)
      if (!fila) continue

      // posiciones_cartera_snapshot (IDEM-01) — service_role, igual que registrarSnapshotPosicion.
      const datosSnapshot = {
        tenantId,
        inmuebleId: plan.inmuebleId,
        fechaCorte,
        deudaTotal: String(fila.deuda_total),
        deudaCapital: String(fila.deuda_capital),
        deudaInteres: String(fila.deuda_interes),
        deudaOtros: String(fila.deuda_otros),
        saldoCredito: String(fila.saldo_credito),
        diasMoraMaximo: fila.dias_mora_maximo ?? 0,
        cantidadCargosVencidos: fila.cantidad_cargos_vencidos ?? 0,
        fechaVencimientoMasAntigua: fila.fecha_vencimiento_mas_antigua,
        cargoVencidoMasAntiguoId: fila.cargo_vencido_mas_antiguo_id,
        clasificacionCodigo: plan.clasificacion.codigo,
        nivelRiesgo: plan.clasificacion.nivelRiesgo,
        etapaCobranza: plan.clasificacion.etapaCobranza,
        politicaId: plan.clasificacion.politicaId,
        politicaVersion: plan.clasificacion.politicaVersion,
      }
      const { error: errorSnapshot } = await ctx.supabaseAdmin.from('posiciones_cartera_snapshot').upsert(
        {
          tenant_id: datosSnapshot.tenantId,
          inmueble_id: datosSnapshot.inmuebleId,
          fecha_corte: datosSnapshot.fechaCorte,
          deuda_total: Number(datosSnapshot.deudaTotal),
          deuda_capital: Number(datosSnapshot.deudaCapital),
          deuda_interes: Number(datosSnapshot.deudaInteres),
          deuda_otros: Number(datosSnapshot.deudaOtros),
          saldo_credito: Number(datosSnapshot.saldoCredito),
          dias_mora_maximo: datosSnapshot.diasMoraMaximo,
          cantidad_cargos_vencidos: datosSnapshot.cantidadCargosVencidos,
          fecha_vencimiento_mas_antigua: datosSnapshot.fechaVencimientoMasAntigua,
          cargo_vencido_mas_antiguo_id: datosSnapshot.cargoVencidoMasAntiguoId,
          clasificacion_codigo: datosSnapshot.clasificacionCodigo,
          nivel_riesgo: datosSnapshot.nivelRiesgo,
          etapa_cobranza: datosSnapshot.etapaCobranza,
          politica_clasificacion_id: datosSnapshot.politicaId,
          politica_version: datosSnapshot.politicaVersion,
          posicion_hash: calcularPosicionHash(datosSnapshot),
        },
        { onConflict: 'tenant_id,inmueble_id,fecha_corte', ignoreDuplicates: true },
      )
      if (errorSnapshot) errores.push(`snapshot ${plan.inmuebleId}: ${errorSnapshot.message}`)

      // cartera_etapas — automático se confirma directo; con aprobación solo se propone (F6).
      if (plan.decisionEscalamiento.tipo === 'escalar' || plan.decisionEscalamiento.tipo === 'desescalar') {
        const decision = plan.decisionEscalamiento
        if (decision.requiereAprobacion) {
          // .is('etapa_propuesta', null) — no reemplaza una propuesta ya
          // pendiente (PH-C33: una segunda corrida el mismo día no debe
          // duplicar la propuesta ni el conteo de candidatos).
          const { error: errorPropuesta, count } = await cliente
            .from('cartera_etapas')
            .update({ etapa_propuesta: decision.hacia, motivo_propuesta: decision.motivo }, { count: 'exact' })
            .eq('tenant_id', tenantId)
            .eq('inmueble_id', plan.inmuebleId)
            .is('etapa_propuesta', null)
          if (errorPropuesta) errores.push(`etapa_propuesta ${plan.inmuebleId}: ${errorPropuesta.message}`)
          else if ((count ?? 0) > 0) {
            candidatosEscalamiento += 1
            alertas.push({
              inmuebleId: plan.inmuebleId,
              tipo: 'requiere_aprobacion',
              mensaje: `Candidato a ${decision.tipo} hacia ${decision.hacia}: ${decision.motivo}`,
            })
          }
        } else {
          const { error: errorEtapa, count } = await cliente
            .from('cartera_etapas')
            .update({ etapa: decision.hacia }, { count: 'exact' })
            .eq('tenant_id', tenantId)
            .eq('inmueble_id', plan.inmuebleId)
          if (errorEtapa) errores.push(`etapa ${plan.inmuebleId}: ${errorEtapa.message}`)
          else if ((count ?? 0) > 0) cambiosEtapa += 1
        }
      } else if (plan.decisionEscalamiento.tipo === 'bloqueado') {
        alertas.push({
          inmuebleId: plan.inmuebleId,
          tipo: 'bloqueado',
          mensaje: plan.decisionEscalamiento.requisitoFaltante,
        })
      }

      // promesas_pago (§12.2)
      for (const cambio of plan.promesasIncumplidas) {
        const { error: errorPromesa } = await cliente
          .from('promesas_pago')
          .update({ estado: 'incumplida' })
          .eq('id', cambio.promesaId)
          .eq('estado', 'pendiente')
        if (errorPromesa) errores.push(`promesa ${cambio.promesaId}: ${errorPromesa.message}`)
        else promesasIncumplidasTotal += 1
      }

      // acuerdo_pago_cuotas
      for (const cambio of plan.cuotasVencidas) {
        const { error: errorCuota } = await cliente
          .from('acuerdo_pago_cuotas')
          .update({ estado: 'vencida' })
          .eq('id', cambio.cuotaId)
          .in('estado', ['pendiente', 'parcial'])
        if (errorCuota) errores.push(`cuota ${cambio.cuotaId}: ${errorCuota.message}`)
      }

      // acuerdos_pago — el "descongelamiento" de cartera_etapas es un efecto
      // secundario natural (CARTERA_ETAPA_CONGELADA lee acuerdos_pago en vivo, F6).
      if (plan.acuerdoIncumplido) {
        const { error: errorAcuerdo } = await cliente
          .from('acuerdos_pago')
          .update({ estado: 'incumplido', fecha_incumplimiento: fechaCorte })
          .eq('id', plan.acuerdoIncumplido.acuerdoId)
          .eq('estado', 'vigente')
        if (errorAcuerdo) errores.push(`acuerdo ${plan.acuerdoIncumplido.acuerdoId}: ${errorAcuerdo.message}`)
        else acuerdosIncumplidosTotal += 1
      }

      // eventos_cartera (I-C13, IDEM-03) — service_role, igual que posiciones_cartera_snapshot.
      const eventos: Database['public']['Tables']['eventos_cartera']['Insert'][] = []
      // §18.2 paso 8 — CARTERA_CLASIFICACION_CAMBIO. Antes quedaba en 0
      // porque comparar contra el snapshot de ayer exigía una lectura
      // extra por inmueble; cargarEntradaJobCarteraInmueble ya la trae
      // (reutiliza la consulta que calculaba diasEnTramoActual, ver
      // cartera-job-supabase.ts) — aquí solo se traduce a evento y conteo.
      if (plan.cambioClasificacion) {
        cambiosClasificacionTotal += 1
        const cambio = plan.cambioClasificacion
        eventos.push({
          tenant_id: tenantId,
          tipo: 'CARTERA_CLASIFICACION_CAMBIO',
          inmueble_id: plan.inmuebleId,
          entidad_tipo: 'posiciones_cartera_snapshot',
          fecha_corte: fechaCorte,
          estado_anterior: { codigo: cambio.codigoAnterior, dias_mora: cambio.diasMoraAnterior },
          estado_nuevo: { codigo: cambio.codigoNuevo, dias_mora: cambio.diasMoraNuevo },
          motivo:
            `La clasificación pasó de ${cambio.codigoAnterior} (${String(cambio.diasMoraAnterior)} días de mora) ` +
            `a ${cambio.codigoNuevo} (${String(cambio.diasMoraNuevo)} días de mora) en la fecha de corte ${fechaCorte}.`,
          politica_id: plan.clasificacion.politicaId,
          politica_version: plan.clasificacion.politicaVersion,
          origen: 'job',
          actor_id: actorId,
          ejecucion_id: ejecucionId,
          dedup_key: `CARTERA_CLASIFICACION_CAMBIO:${plan.inmuebleId}:${fechaCorte}:${cambio.codigoNuevo}`,
        })
      }
      if (plan.decisionEscalamiento.tipo === 'escalar' || plan.decisionEscalamiento.tipo === 'desescalar') {
        const decision = plan.decisionEscalamiento
        eventos.push({
          tenant_id: tenantId,
          tipo: 'CARTERA_ETAPA_CAMBIO',
          inmueble_id: plan.inmuebleId,
          entidad_tipo: 'cartera_etapas',
          fecha_corte: fechaCorte,
          estado_nuevo: { etapa: decision.hacia, requiereAprobacion: decision.requiereAprobacion },
          motivo: decision.motivo,
          politica_id: plan.clasificacion.politicaId,
          politica_version: plan.clasificacion.politicaVersion,
          origen: 'job',
          actor_id: actorId,
          ejecucion_id: ejecucionId,
          dedup_key: `CARTERA_ETAPA_CAMBIO:${plan.inmuebleId}:${fechaCorte}:${decision.hacia}`,
        })
      }
      for (const cambio of plan.promesasIncumplidas) {
        eventos.push({
          tenant_id: tenantId,
          tipo: 'PROMESA_INCUMPLIDA',
          inmueble_id: plan.inmuebleId,
          entidad_tipo: 'promesas_pago',
          entidad_id: cambio.promesaId,
          fecha_corte: fechaCorte,
          motivo: `Promesa vencida a fecha de corte ${fechaCorte} sin pago que la cumpla.`,
          origen: 'job',
          actor_id: actorId,
          ejecucion_id: ejecucionId,
          dedup_key: `PROMESA_INCUMPLIDA:${plan.inmuebleId}:${fechaCorte}:${cambio.promesaId}`,
        })
      }
      if (plan.acuerdoIncumplido) {
        eventos.push({
          tenant_id: tenantId,
          tipo: 'ACUERDO_INCUMPLIDO',
          inmueble_id: plan.inmuebleId,
          entidad_tipo: 'acuerdos_pago',
          entidad_id: plan.acuerdoIncumplido.acuerdoId,
          fecha_corte: fechaCorte,
          motivo: 'Al menos una cuota del acuerdo vigente quedó vencida a la fecha de corte.',
          origen: 'job',
          actor_id: actorId,
          ejecucion_id: ejecucionId,
          dedup_key: `ACUERDO_INCUMPLIDO:${plan.inmuebleId}:${fechaCorte}:${plan.acuerdoIncumplido.acuerdoId}`,
        })
      }
      // ── §18.2 pasos 14-16: crear las acciones ──────────────────────────
      // Lo que faltaba para que el job dejara de ser solo cálculo. La
      // anti-duplicación (§10.4) ya la aplicó evaluarAccionesAplicables()
      // sobre el historial real, así que una segunda corrida del mismo día
      // no vuelve a proponer lo ya creado (IDEM-02).
      accionesOmitidasTotal += plan.accionesOmitidas.length
      accionesBloqueadasTotal += plan.accionesBloqueadas.length

      for (const propuesta of plan.accionesPropuestas) {
        // Un grupo solo tiene sentido cuando hay hermanas que unir; con un
        // único destinatario la acción es suelta y grupo_envio_id queda null
        // (ver 20260905110000).
        const grupoEnvioId =
          propuesta.destinatarios.length > 1 ? crypto.randomUUID() : null

        const filas = propuesta.destinatarios.map((d) => ({
          tenant_id: tenantId,
          inmueble_id: plan.inmuebleId,
          estrategia_id: propuesta.estrategiaId,
          tipo_accion: propuesta.tipoAccion,
          canal: propuesta.canal,
          fecha_programada: fechaCorte,
          // Foto del momento — REC-CAR-012, nunca se recalcula después.
          clasificacion_codigo: plan.clasificacion.codigo,
          politica_clasificacion_id: plan.clasificacion.politicaId,
          politica_version: plan.clasificacion.politicaVersion,
          dias_mora_al_momento: fila.dias_mora_maximo ?? 0,
          deuda_total_al_momento: Number(fila.deuda_total),
          destinatario_tercero_id: d.terceroId,
          destinatario_rol_codigo: d.rolCodigo,
          destinatario_contacto: d.contacto,
          grupo_envio_id: grupoEnvioId,
          intento_numero: propuesta.intentoNumero,
          // Maker-checker (20260822280000): lo de alto impacto nace esperando
          // aprobación humana, nunca listo para disparar.
          estado: propuesta.requiereAprobacion ? 'pendiente_aprobacion' : 'programada',
          creada_por: 'job' as const,
        }))

        const { error: errorAcciones } = await ctx.supabaseAdmin
          .from('acciones_cobranza')
          .insert(filas)
        if (errorAcciones) {
          errores.push(`acciones ${plan.inmuebleId}: ${errorAcciones.message}`)
          continue
        }
        accionesCreadasTotal += filas.length
      }

      if (eventos.length > 0) {
        const { error: errorEventos } = await ctx.supabaseAdmin
          .from('eventos_cartera')
          .upsert(eventos, { onConflict: 'tenant_id,dedup_key', ignoreDuplicates: true })
        if (errorEventos) errores.push(`eventos ${plan.inmuebleId}: ${errorEventos.message}`)
      }
    }

    const { error: errorAudit } = await ctx.supabaseAdmin.from('audit_log').insert({
      tenant_id: tenantId,
      actor_id: actorId,
      action: 'cartera_recalcular.ejecutado',
      entity_type: 'job_cartera_diaria',
      entity_id: ejecucionId,
      metadata: {
        fechaCorte,
        modo,
        inmueblesEvaluados: planes.length,
        cambiosClasificacion: cambiosClasificacionTotal,
        cambiosEtapa,
        accionesCreadas: accionesCreadasTotal,
        accionesOmitidas: accionesOmitidasTotal,
        accionesBloqueadas: accionesBloqueadasTotal,
        candidatosEscalamiento,
        promesasIncumplidas: promesasIncumplidasTotal,
        acuerdosIncumplidos: acuerdosIncumplidosTotal,
        resultadoHash,
        errores: errores.length > 0 ? errores : undefined,
      },
    })
    if (errorAudit) errores.push(`audit_log: ${errorAudit.message}`)

    logEvent({
      level: errores.length > 0 ? 'warn' : 'info',
      action: 'cartera_recalcular.completada',
      correlationId,
      actorId,
      tenantId,
      meta: { ejecucionId, modo, inmueblesEvaluados: planes.length, errores: errores.length },
    })

    return jsonResponse(
      {
        ejecucionId,
        fechaCorte,
        modo,
        inmueblesEvaluados: planes.length,
        cambiosClasificacion: cambiosClasificacionTotal,
        cambiosEtapa,
        accionesCreadas: accionesCreadasTotal,
        accionesOmitidas: accionesOmitidasTotal,
        accionesBloqueadas: accionesBloqueadasTotal,
        promesasIncumplidas: promesasIncumplidasTotal,
        acuerdosIncumplidos: acuerdosIncumplidosTotal,
        candidatosEscalamiento,
        alertas,
        resultadoHash,
        errores: errores.length > 0 ? errores : undefined,
      },
      200,
      correlationId,
    )
  }),
}
