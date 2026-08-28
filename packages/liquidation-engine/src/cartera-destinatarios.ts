/**
 * Resolución de destinatario de una acción de cobranza (Docs/Motor de
 * gestion de cartera/CAR_00_Guia_Oficial.md §10.2, §21). Puro, sin
 * Supabase — mismo nivel de pureza que cartera-cobranza.ts (D-14,
 * REC-CAR-009).
 *
 * Responde la pregunta que tenía detenido al job diario: dado un inmueble
 * y una acción que corresponde disparar, ¿a QUIÉN se le envía? Sin esto
 * `acciones_cobranza.destinatario_tercero_id` (not null) no se puede
 * llenar, y por eso evaluarJobCarteraInmueble() calculaba planes pero
 * nunca creaba acciones (ver cabecera de cartera-job.ts).
 *
 * Las cuatro reglas de negocio de abajo NO son deducciones del esquema:
 * son decisiones del propietario del producto tomadas el 2026-08-28,
 * siguiendo el protocolo de §33.3 (no inventar, preguntar). Se registran
 * aquí porque el código es donde se aplican.
 *
 *   R1  Las acciones de alto impacto van SIEMPRE al copropietario, aunque
 *       el pagador designado sea otro. El art. 29 de la Ley 675 obliga al
 *       propietario, no al ocupante: un requerimiento dirigido a quien no
 *       es el obligado no sirve para sustentar un ejecutivo.
 *   R2  Con varios copropietarios se notifica a TODOS los vigentes, uno
 *       por uno. Cada uno responde por la deuda (solidaridad, art. 29),
 *       así que cada uno necesita su propia evidencia acreditada (§34).
 *   R3  `recibe_notificaciones = false` es una preferencia de contacto: no
 *       puede bloquear una notificación que la copropiedad está obligada a
 *       hacer. Se respeta en gestión, se ignora en alto impacto — y cuando
 *       se ignora queda marcado, para que conste.
 *   R4  El apoderado ACOMPAÑA al copropietario, no lo reemplaza. Sin leer
 *       el poder, el sistema no puede asumir que está facultado para
 *       recibir notificaciones en nombre del titular.
 *
 * Esta función PROPONE destinatarios; no crea acciones ni envía nada —
 * mismo criterio que evaluarEscalamiento() en §11.4.
 */
import type { CanalCobranza, TipoAccionCobranza } from './cartera-cobranza.js'

export type { CanalCobranza }

/**
 * Fila vigente de inmueble_persona_rol + contacto del tercero, ya unidos
 * por el adaptador. `rolCodigo` es el código de lista_tipos PERSONA_PREDIO
 * (copropietario, arrendatario, inquilino, visitante, apoderado, codeudor,
 * locatario) — texto y no unión cerrada porque el catálogo es extensible
 * por tenant (20260814180000, D-24).
 */
export interface RelacionInmueblePersona {
  readonly terceroId: string
  readonly rolCodigo: string
  /** Solo aplica a copropietario; null en los demás roles. */
  readonly porcentaje: number | null
  readonly esPagador: boolean
  readonly recibeNotificaciones: boolean
  /** ISO yyyy-mm-dd. */
  readonly vigenteDesde: string
  /** ISO yyyy-mm-dd; null = relación activa. */
  readonly vigenteHasta: string | null
  readonly email: string | null
  readonly telefono: string | null
  /** terceros.direccion — existe desde 20260821100000. */
  readonly direccion: string | null
  /** terceros.municipio — sin municipio ningún operador postal admite la guía (GAP-CAR-012). */
  readonly municipio: string | null
  /** terceros.direccion_verificada_at; null = nadie confirmó nunca esa dirección. */
  readonly direccionVerificadaAt: string | null
}

export type MotivoDestinatario =
  /** Copropietario: el obligado del art. 29. */
  | 'obligado_legal'
  /** es_pagador = true, sin ser copropietario. */
  | 'pagador_designado'
  /** Apoderado vigente, en adición al titular (R4). */
  | 'apoderado'
  /** Recibe por conocimiento, no porque se le cobre a él. */
  | 'copia_informativa'

export interface DestinatarioResuelto {
  readonly terceroId: string
  readonly rolCodigo: string
  readonly motivo: MotivoDestinatario
  /** El dato de contacto que corresponde al canal — se congela en la acción. */
  readonly contacto: string
  readonly porcentaje: number | null
  /** true = se notifica pese a recibe_notificaciones = false (R3). */
  readonly ignoroPreferencia: boolean
  /**
   * Solo canal físico: se despacha a una dirección que nadie verificó.
   * No impide el envío — impedirlo dejaría sin notificar a quien nunca
   * atendió una verificación, que es justamente el moroso típico — pero
   * debilita el valor probatorio y debe constar en el expediente (§34.2).
   */
  readonly direccionNoVerificada: boolean
}

export type ResolucionDestinatarios =
  | { readonly tipo: 'resuelto'; readonly destinatarios: readonly DestinatarioResuelto[] }
  /** No hay a quién enviarle: el inmueble no tiene relaciones vigentes que apliquen. */
  | { readonly tipo: 'sin_destinatario'; readonly motivo: string }
  /**
   * Hay destinatario, pero falta el dato de contacto para ese canal. NUNCA
   * se degrada silenciosamente a otro canal: la estrategia eligió ese canal
   * por una razón, y un requerimiento formal enviado por SMS porque no
   * había dirección no es el requerimiento que la política aprobó.
   */
  | { readonly tipo: 'contacto_faltante'; readonly motivo: string; readonly terceroIds: readonly string[] }
  /** Acción interna (asignar abogado, revisión): el destinatario no es un tercero del inmueble. */
  | { readonly tipo: 'no_aplica'; readonly motivo: string }

export interface EntradaResolucionDestinatarios {
  readonly relaciones: readonly RelacionInmueblePersona[]
  readonly tipoAccion: TipoAccionCobranza
  readonly canal: CanalCobranza
  /** Fecha de corte explícita — REC-CAR-008, nunca la del sistema. */
  readonly fechaCorte: string
}

/**
 * Acciones con efecto legal frente al deudor. Son las que §9.4 marca como
 * "exigen aprobación humana" y que sustentan el escalamiento: por eso van
 * al obligado y no al pagador de conveniencia (R1).
 *
 * `asignacion_abogado`, `revision_manual` y `propuesta_acuerdo` NO están
 * aquí: las dos primeras son internas y la tercera es una oferta, no un
 * cobro — se dirige a quien efectivamente paga.
 */
const ACCIONES_ALTO_IMPACTO: ReadonlySet<TipoAccionCobranza> = new Set([
  'requerimiento_formal',
  'aviso_prejuridico',
  'remision_juridica',
  'publicacion_morosos',
])

/** No se dirigen a un tercero del inmueble sino a un actor interno o al abogado. */
const ACCIONES_INTERNAS: ReadonlySet<TipoAccionCobranza> = new Set([
  'asignacion_abogado',
  'revision_manual',
])

export function esAccionAltoImpacto(tipo: TipoAccionCobranza): boolean {
  return ACCIONES_ALTO_IMPACTO.has(tipo)
}

/** vigente_desde <= corte AND (vigente_hasta IS NULL OR vigente_hasta >= corte). */
function estaVigente(rel: RelacionInmueblePersona, fechaCorte: string): boolean {
  if (rel.vigenteDesde > fechaCorte) return false
  return rel.vigenteHasta === null || rel.vigenteHasta >= fechaCorte
}

/**
 * Qué dato de contacto exige cada canal. El físico exige dirección Y
 * municipio: ningún operador postal admite una guía sin municipio de
 * destino, así que una dirección suelta no es despachable (GAP-CAR-012,
 * resuelto en 20260905100000).
 */
function contactoParaCanal(rel: RelacionInmueblePersona, canal: CanalCobranza): string | null {
  switch (canal) {
    case 'email':
      return rel.email
    case 'sms':
    case 'whatsapp':
    case 'telefono':
      return rel.telefono
    case 'fisico': {
      const direccion = rel.direccion?.trim()
      const municipio = rel.municipio?.trim()
      if (!direccion || !municipio) return null
      return `${direccion}, ${municipio}`
    }
    case 'interno':
      return null
  }
}

/**
 * Devuelve los destinatarios de una acción, en el orden en que deben
 * crearse. Cada elemento produce UNA fila de acciones_cobranza; el
 * llamador las une con un grupo_envio_id común para conservar una
 * evidencia por persona (R2 + §34.3).
 */
export function resolverDestinatarios(
  entrada: EntradaResolucionDestinatarios,
): ResolucionDestinatarios {
  const { relaciones, tipoAccion, canal, fechaCorte } = entrada

  if (ACCIONES_INTERNAS.has(tipoAccion)) {
    return {
      tipo: 'no_aplica',
      motivo: `${tipoAccion} es una acción interna: su destinatario no es un tercero del inmueble.`,
    }
  }

  if (canal === 'interno') {
    return { tipo: 'no_aplica', motivo: 'El canal interno no notifica a un tercero.' }
  }

  const vigentes = relaciones.filter((r) => estaVigente(r, fechaCorte))
  if (vigentes.length === 0) {
    return {
      tipo: 'sin_destinatario',
      motivo: `El inmueble no tiene relaciones persona-predio vigentes al ${fechaCorte}.`,
    }
  }

  const copropietarios = vigentes.filter((r) => r.rolCodigo === 'copropietario')
  const apoderados = vigentes.filter((r) => r.rolCodigo === 'apoderado')
  const pagador = vigentes.find((r) => r.esPagador) ?? null

  const altoImpacto = esAccionAltoImpacto(tipoAccion)
  const elegidos: { rel: RelacionInmueblePersona; motivo: MotivoDestinatario }[] = []

  if (altoImpacto) {
    // R1 + R2: todos los copropietarios vigentes, siempre.
    if (copropietarios.length === 0) {
      return {
        tipo: 'sin_destinatario',
        motivo:
          `${tipoAccion} exige notificar al obligado del art. 29, y el inmueble no tiene ` +
          `copropietario vigente al ${fechaCorte}. Corregir la ficha del inmueble antes de escalar.`,
      }
    }
    for (const rel of copropietarios) elegidos.push({ rel, motivo: 'obligado_legal' })
    // R4: el apoderado acompaña.
    for (const rel of apoderados) elegidos.push({ rel, motivo: 'apoderado' })
    // El pagador se entera, aunque no sea el obligado.
    if (pagador && !elegidos.some((e) => e.rel.terceroId === pagador.terceroId)) {
      elegidos.push({ rel: pagador, motivo: 'copia_informativa' })
    }
  } else {
    // Gestión ordinaria: se le habla a quien paga, y se respeta el opt-out (R3).
    if (pagador && pagador.recibeNotificaciones) {
      elegidos.push({ rel: pagador, motivo: 'pagador_designado' })
    } else {
      const receptivos = copropietarios.filter((r) => r.recibeNotificaciones)
      for (const rel of receptivos) elegidos.push({ rel, motivo: 'obligado_legal' })
    }
    if (elegidos.length === 0) {
      return {
        tipo: 'sin_destinatario',
        motivo:
          'Ninguna persona vigente del inmueble acepta notificaciones de gestión. ' +
          'Las acciones de alto impacto sí podrán enviarse (R3).',
      }
    }
  }

  // El contacto se resuelve al final: primero se decide QUIÉN, después CÓMO.
  // Un destinatario correcto sin contacto es un problema de datos que hay
  // que reportar, no una razón para elegir a otra persona.
  const destinatarios: DestinatarioResuelto[] = []
  const sinContacto: string[] = []

  for (const { rel, motivo } of elegidos) {
    const contacto = contactoParaCanal(rel, canal)
    if (contacto === null || contacto.trim() === '') {
      sinContacto.push(rel.terceroId)
      continue
    }
    destinatarios.push({
      terceroId: rel.terceroId,
      rolCodigo: rel.rolCodigo,
      motivo,
      contacto,
      porcentaje: rel.porcentaje,
      ignoroPreferencia: altoImpacto && !rel.recibeNotificaciones,
      direccionNoVerificada: canal === 'fisico' && rel.direccionVerificadaAt === null,
    })
  }

  if (destinatarios.length === 0) {
    return {
      tipo: 'contacto_faltante',
      motivo:
        canal === 'fisico'
          ? 'El canal físico exige dirección Y municipio; ningún destinatario tiene ambos (GAP-CAR-012).'
          : `Ningún destinatario tiene el dato de contacto que exige el canal ${canal}.`,
      terceroIds: sinContacto,
    }
  }

  return { tipo: 'resuelto', destinatarios }
}
