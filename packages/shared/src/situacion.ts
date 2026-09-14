/**
 * Contrato común de situación (ENFOQUE_CONSOLIDACION, Ola 1 §2.1 —
 * 06_PROMPT_O1_CONSOLIDACION.md).
 *
 * NO es un tipo nuevo: es la forma que `fn_mis_asuntos` (EXS-7) ya
 * devuelve, probada en producción y hoy replicada a mano en
 * `apps/web/app/stores/asuntos.ts`. Se formaliza aquí para que cualquier
 * dominio que ya emite algo con esta forma —hoy `fn_mis_asuntos`, ocho
 * ramas: anuncios, publicaciones, publicacion_interes, publicacion_reporte,
 * solicitudes, vehiculo_paso, vehiculo_permiso, fn_movilidad_dentro— y
 * cualquiera que se sume después, lo declare contra un solo tipo, no
 * ocho copias sueltas.
 *
 * `tipo`, `severidad` y `as_of` son las únicas adiciones reales frente a
 * lo que `fn_mis_asuntos` ya devuelve, y quedan OPCIONALES a propósito:
 * `fn_mis_asuntos` no las selecciona hoy en ninguna de sus ocho ramas —
 * extenderla para que lo haga es una decisión aparte, de alcance mayor
 * (tocar una función SQL ya en producción), que este corte no resuelve.
 * Un productor de situaciones que sí las tenga (p. ej. un futuro puente
 * desde `cartera_alerta_emitida`, 20260934110000) las declara; uno que no,
 * las omite — ninguna rama existente deja de tipar por su ausencia.
 *
 * Regla del prompt, no negociable: no se renombran los campos que
 * `fn_mis_asuntos` ya devuelve. Un contrato que la obligara a cambiar
 * está mal diseñado.
 */

/** Fila cruda tal como la devuelve una función RPC (snake_case, tipos de
 * PostgREST) — antes de mapear a `Situacion`. */
export interface FilaSituacion {
  origen_modulo: string
  origen_entidad: string
  origen_id: string
  titulo: string
  resumen: string | null
  estado: string
  accion: string
  enlace: string
  created_at: string
  vence_at: string | null
  /** Solo lo trae la rama que asigna dueño explícito (hoy, Atención —
   *  EXS-1). `null` significa "le toca a quien pueda", no "falta asignar". */
  asignado_a: string | null
  /** Código de `lista_tipos`, familia `TIPO_SITUACION` — ver §2.3 del
   *  prompt. Ausente en las ocho ramas actuales de `fn_mis_asuntos`. */
  tipo?: string | null
  /** Código de `lista_tipos`, familia de prioridad existente (D-24: no se
   *  inventa una nueva si ya hay una que sirva). */
  severidad?: string | null
  /** Fecha de corte del dato que sustenta la situación — relevante para
   *  quien deriva de un snapshot (p. ej. una alerta de cartera evaluada
   *  el día X), no para quien deriva del estado vivo sin fecha de corte
   *  propia (la mayoría de las ocho ramas de hoy). */
  as_of?: string | null
}

/** Forma tipada, camelCase, que consume la UI — el contrato en sí. */
export interface Situacion {
  origenModulo: string
  origenEntidad: string
  origenId: string
  titulo: string
  resumen: string | null
  estado: string
  accion: string
  enlace: string
  createdAt: string
  venceAt: string | null
  asignadoA: string | null
  tipo?: string | null
  severidad?: string | null
  asOf?: string | null
}

/** Único lugar que mapea snake_case → camelCase para este contrato — evita
 * que cada consumidor (hoy `apps/web/app/stores/asuntos.ts`, mañana lo que
 * sea) repita el mismo mapeo con el riesgo de que diverjan en silencio. */
export function mapearFilaSituacion(fila: FilaSituacion): Situacion {
  return {
    origenModulo: fila.origen_modulo,
    origenEntidad: fila.origen_entidad,
    origenId: fila.origen_id,
    titulo: fila.titulo,
    resumen: fila.resumen,
    estado: fila.estado,
    accion: fila.accion,
    enlace: fila.enlace,
    createdAt: fila.created_at,
    venceAt: fila.vence_at,
    asignadoA: fila.asignado_a,
    tipo: fila.tipo ?? null,
    severidad: fila.severidad ?? null,
    asOf: fila.as_of ?? null,
  }
}
