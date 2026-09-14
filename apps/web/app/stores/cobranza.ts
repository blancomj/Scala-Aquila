/**
 * Bandeja de acciones de cobranza (CAR §23.5, bloque 16) — la cola de
 * trabajo del administrador.
 *
 * Las filas salen de fn_bandeja_cobranza (20260906150000), que ya trae el
 * estado probatorio derivado (§34.4): resolverlo desde aquí serían dos
 * consultas por acción.
 *
 * Aprobar y rechazar son UPDATE directos por RLS, no Edge Functions, y es
 * deliberado: quien decide tiene que ser un usuario identificado y las
 * reglas duras ya viven en la base —
 * guard_accion_cobranza_transicion (20260822280000) exige rol
 * administrador y prohíbe aprobar lo que uno mismo propuso. Meter una
 * función intermedia con service_role solo añadiría un lugar donde
 * equivocarse y perdería el auth.uid() que el art. 48 exige identificar.
 *
 * Despachar sí pasa por Edge Function: manda un SMS o un correo real,
 * cuesta dinero y necesita el proveedor.
 */
import { defineStore } from 'pinia'
import type { Database } from '@aquila/shared'
import { extraerErrorFuncion } from '~/utils/edge-function-error'
import { mensajeError } from '~/utils/error-message'

type EstadoAccion = Database['public']['Enums']['estado_accion_cobranza_t']
type EstadoAcuse = Database['public']['Enums']['estado_acuse_t']
/** Ola 2 §4 — el desenlace de la GESTIÓN (¿sirvió de algo?), distinto del
 *  estado de DESPACHO (¿salió y llegó?). Existe en el esquema desde F4
 *  (20260822270000); hasta esta ola nada lo escribía ni lo mostraba. */
export type ResultadoGestion = Database['public']['Enums']['resultado_accion_cobranza_t']

export interface AccionBandeja {
  accionId: string
  inmuebleId: string
  inmuebleCodigo: string
  tipoAccion: string
  canal: string
  estado: EstadoAccion
  fechaProgramada: string
  fechaEjecucion: string | null
  clasificacionCodigo: string
  diasMora: number
  deudaTotal: string
  destinatarioId: string
  destinatarioNombre: string | null
  destinatarioContacto: string | null
  destinatarioRol: string
  grupoEnvioId: string | null
  creadaPor: string
  propuestaPor: string | null
  aprobadaPor: string | null
  aprobadaAt: string | null
  enviosTotal: number
  ultimoEstadoAcuse: EstadoAcuse | null
  acreditada: boolean
  notas: string | null
  resultado: ResultadoGestion | null
}

/** Un envío con sus acuses — el detalle probatorio de una acción (§34.3). */
export interface EnvioDetalle {
  envioId: string
  intentoNumero: number
  canal: string
  destinatarioContacto: string
  plantillaCodigo: string
  plantillaVersion: number
  asunto: string | null
  contenidoRenderizado: string
  enviadoAt: string
  proveedor: string
  referenciaExterna: string | null
  acuses: { estado: EstadoAcuse; ocurridoAt: string; origen: string; motivo: string | null }[]
}

interface FilaBandejaDb {
  accion_id: string
  inmueble_id: string
  inmueble_codigo: string
  tipo_accion: string
  canal: string
  estado: EstadoAccion
  fecha_programada: string
  fecha_ejecucion: string | null
  clasificacion_codigo: string
  dias_mora: number
  deuda_total: string | number
  destinatario_id: string
  destinatario_nombre: string | null
  destinatario_contacto: string | null
  destinatario_rol: string
  grupo_envio_id: string | null
  creada_por: string
  propuesta_por: string | null
  aprobada_por: string | null
  aprobada_at: string | null
  envios_total: number
  ultimo_estado_acuse: EstadoAcuse | null
  acreditada: boolean
  notas: string | null
  resultado: ResultadoGestion | null
}

/** Una línea de la corrida por lotes: qué pasaría (o pasó) con una acción. */
export interface LineaLote {
  accionId: string
  inmuebleId: string
  canal: string
  resultado: 'despachada' | 'fallida' | 'simulada' | 'omitida'
  motivo?: string
  contenido?: string
  /** Solo correo. */
  asunto?: string
  destinatarioContacto?: string
}

export interface ResultadoLote {
  modo: string
  fechaCorte: string
  candidatas: number
  despachadas: number
  fallidas: number
  simuladas: number
  omitidas: number
  /** El lote se corta en el límite: si vino lleno, quedan más esperando. */
  hayMas: boolean
  lineas: LineaLote[]
}

export interface ResultadoDespacho {
  success: boolean
  estado: string
  envioId: string | null
  evidenciaRegistrada: boolean
  errorMessage?: string | null
}

// ── Ola 2 §3 (ENFOQUE_CONSOLIDACION) — situación → recomendación →
// confirmación → acciones_cobranza. Reutiliza cartera-recalcular tal cual:
// modo 'simulacion' (nunca escribe) calcula la recomendación, modo
// 'ejecucion' con alcance_inmuebles crea la fila — es la misma inserción
// que ya hace el job diario, sin una segunda ruta de escritura. La
// revalidación de "contexto obsoleto" (§3.4) es automática: confirmar
// vuelve a evaluar todo desde cero en el momento del clic, no reaplica lo
// que se vio en la simulación.

export interface DestinatarioPropuesto {
  terceroId: string
  rolCodigo: string
  contacto: string
}

export interface AccionPropuestaLote {
  estrategiaId: string
  tipoAccion: string
  canal: string
  intentoNumero: number
  requiereAprobacion: boolean
  destinatarios: DestinatarioPropuesto[]
}

export interface AccionBloqueadaLote {
  estrategiaId: string
  tipoAccion: string
  canal: string
  causa: 'sin_destinatario' | 'contacto_faltante' | 'no_aplica'
  motivo: string
}

export interface AccionOmitidaLote {
  estrategiaId: string
  motivo: string
}

/** Un inmueble evaluado — solo la parte que la recomendación necesita mostrar. */
export interface PlanRecomendacion {
  inmuebleId: string
  clasificacionCodigo: string
  accionesPropuestas: AccionPropuestaLote[]
  accionesOmitidas: AccionOmitidaLote[]
  accionesBloqueadas: AccionBloqueadaLote[]
}

export interface ResultadoSimulacionRecomendaciones {
  ejecucionId: string
  fechaCorte: string
  inmueblesEvaluados: number
  planes: PlanRecomendacion[]
}

export interface ResultadoConfirmarRecomendacion {
  ejecucionId: string
  accionesCreadas: number
  accionesOmitidas: number
  accionesBloqueadas: number
  errores?: string[]
}

export const useCobranzaStore = defineStore('cobranza', () => {
  const acciones = shallowRef<AccionBandeja[]>([])
  const loading = ref(false)

  async function cargarBandeja(tenantId: string, estados?: EstadoAccion[]): Promise<AccionBandeja[]> {
    loading.value = true
    try {
      const cliente = useSupabaseClient<Database>()
      const { data, error } = await cliente.rpc('fn_bandeja_cobranza', {
        p_tenant_id: tenantId,
        p_estados: estados && estados.length > 0 ? estados : undefined,
        p_limite: 200,
      })
      if (error) throw error

      const filas = (data ?? []) as unknown as FilaBandejaDb[]
      acciones.value = filas.map((f) => ({
        accionId: f.accion_id,
        inmuebleId: f.inmueble_id,
        inmuebleCodigo: f.inmueble_codigo,
        tipoAccion: f.tipo_accion,
        canal: f.canal,
        estado: f.estado,
        fechaProgramada: f.fecha_programada,
        fechaEjecucion: f.fecha_ejecucion,
        clasificacionCodigo: f.clasificacion_codigo,
        diasMora: f.dias_mora,
        deudaTotal: String(f.deuda_total),
        destinatarioId: f.destinatario_id,
        destinatarioNombre: f.destinatario_nombre,
        destinatarioContacto: f.destinatario_contacto,
        destinatarioRol: f.destinatario_rol,
        grupoEnvioId: f.grupo_envio_id,
        creadaPor: f.creada_por,
        propuestaPor: f.propuesta_por,
        aprobadaPor: f.aprobada_por,
        aprobadaAt: f.aprobada_at,
        enviosTotal: f.envios_total,
        ultimoEstadoAcuse: f.ultimo_estado_acuse,
        acreditada: f.acreditada,
        notas: f.notas,
        resultado: f.resultado,
      }))
      return acciones.value
    } finally {
      loading.value = false
    }
  }

  /**
   * Aprobar o rechazar. El mensaje del trigger se propaga tal cual porque
   * dice exactamente qué falló (rol insuficiente, autoaprobación,
   * transición inválida) — reemplazarlo por un "no se pudo" genérico
   * dejaría al administrador sin saber qué hacer.
   */
  async function decidirAccion(accionId: string, decision: 'aprobada' | 'rechazada'): Promise<void> {
    const cliente = useSupabaseClient<Database>()
    const { error } = await cliente.from('acciones_cobranza').update({ estado: decision }).eq('id', accionId)
    if (error) {
      throw new Error(mensajeError(error, `No se pudo ${decision === 'aprobada' ? 'aprobar' : 'rechazar'} la acción.`))
    }
  }

  /**
   * Ola 2 §4 — cerrar el ciclo: qué pasó DESPUÉS de despachar. No es un
   * cambio de estado (guard_accion_cobranza_transicion no vigila esta
   * columna) ni toca el contexto congelado — un UPDATE directo por RLS,
   * mismo criterio que decidirAccion/cancelarAccion. Sin evidencia
   * suficiente, la opción correcta es 'sin_respuesta', no dejarlo vacío:
   * un silencio también es un desenlace, y "nunca se afirma que se
   * realizó sin evidencia" corta en los dos sentidos.
   */
  async function registrarResultado(
    accionId: string,
    resultado: ResultadoGestion,
    notas?: string,
  ): Promise<void> {
    const cliente = useSupabaseClient<Database>()
    const cambios: { resultado: ResultadoGestion; resultado_fecha: string; notas?: string } = {
      resultado,
      resultado_fecha: new Date().toISOString(),
    }
    if (notas !== undefined) cambios.notas = notas
    const { error } = await cliente.from('acciones_cobranza').update(cambios).eq('id', accionId)
    if (error) throw new Error(mensajeError(error, 'No se pudo registrar el resultado de la gestión.'))
  }

  /** Cancelar — sale de la cola sin ejecutarse y sin decidir sobre el fondo. */
  async function cancelarAccion(accionId: string, motivo: string): Promise<void> {
    const cliente = useSupabaseClient<Database>()
    const { error } = await cliente
      .from('acciones_cobranza')
      .update({ estado: 'cancelada', notas: motivo })
      .eq('id', accionId)
    if (error) throw new Error(mensajeError(error, 'No se pudo cancelar la acción.'))
  }

  /** Despacha de verdad: manda el mensaje y registra la evidencia (§34.3). */
  async function despacharAccion(tenantId: string, accionId: string): Promise<ResultadoDespacho> {
    const cliente = useSupabaseClient<Database>()
    const { data, error } = await cliente.functions.invoke<ResultadoDespacho>('ejecutar-accion-cobranza', {
      body: { tenant_id: tenantId, accion_id: accionId },
    })
    if (error) throw await extraerErrorFuncion(error)
    if (!data) throw new Error('El worker no devolvió resultado.')
    return data
  }

  /**
   * CAR §18.1 — corrida por lotes. `modo: 'simulacion'` recorre las mismas
   * validaciones y devuelve el mensaje renderizado exacto SIN enviar nada;
   * 'ejecucion' despacha de verdad y exige rol administrador.
   *
   * El modo va siempre explícito desde aquí, aunque el endpoint simule por
   * defecto: en la pantalla, la diferencia entre ver y enviar no puede
   * depender de un parámetro omitido.
   */
  async function correrLote(
    tenantId: string,
    opciones: { fechaCorte: string; modo: 'simulacion' | 'ejecucion'; limite?: number; inmuebles?: string[] },
  ): Promise<ResultadoLote> {
    const cliente = useSupabaseClient<Database>()
    const { data, error } = await cliente.functions.invoke<ResultadoLote>('cartera-ejecutar-lote', {
      body: {
        tenant_id: tenantId,
        fecha_corte: opciones.fechaCorte,
        modo: opciones.modo,
        ...(opciones.limite === undefined ? {} : { limite: opciones.limite }),
        ...(opciones.inmuebles === undefined ? {} : { alcance_inmuebles: opciones.inmuebles }),
      },
    })
    if (error) throw await extraerErrorFuncion(error)
    if (!data) throw new Error('El worker no devolvió resultado.')
    return data
  }

  /**
   * CAR §34.5 — el expediente probatorio a una fecha de corte. Composición
   * sobre datos existentes: no calcula nada nuevo, reúne. El mismo corte
   * produce el mismo `expediente_hash` aunque después entren pagos y
   * gestiones (PH-C44).
   */
  async function compilarExpediente(
    tenantId: string,
    inmuebleId: string,
    fechaCorte: string,
  ): Promise<Record<string, unknown>> {
    const cliente = useSupabaseClient<Database>()
    const { data, error } = await cliente.rpc('fn_compilar_expediente', {
      p_tenant_id: tenantId,
      p_inmueble_id: inmuebleId,
      p_fecha_corte: fechaCorte,
    })
    if (error) throw new Error(mensajeError(error, 'No se pudo compilar el expediente.'))
    return data as unknown as Record<string, unknown>
  }

  /** El detalle probatorio: qué se envió exactamente y qué acusó el proveedor. */
  async function cargarEnvios(accionId: string): Promise<EnvioDetalle[]> {
    const cliente = useSupabaseClient<Database>()
    const { data, error } = await cliente
      .from('acciones_cobranza_envios')
      .select(
        'id, intento_numero, canal, destinatario_contacto, plantilla_codigo, plantilla_version, asunto, contenido_renderizado, enviado_at, proveedor, referencia_externa, acciones_cobranza_acuses(estado, ocurrido_at, origen, motivo)',
      )
      .eq('accion_id', accionId)
      .order('intento_numero', { ascending: true })
    if (error) throw new Error(mensajeError(error, 'No se pudo cargar la evidencia de la acción.'))

    interface FilaEnvioDb {
      id: string
      intento_numero: number
      canal: string
      destinatario_contacto: string
      plantilla_codigo: string
      plantilla_version: number
      asunto: string | null
      contenido_renderizado: string
      enviado_at: string
      proveedor: string
      referencia_externa: string | null
      acciones_cobranza_acuses: { estado: EstadoAcuse; ocurrido_at: string; origen: string; motivo: string | null }[]
    }

    return (data as unknown as FilaEnvioDb[]).map((e) => ({
      envioId: e.id,
      intentoNumero: e.intento_numero,
      canal: e.canal,
      destinatarioContacto: e.destinatario_contacto,
      plantillaCodigo: e.plantilla_codigo,
      plantillaVersion: e.plantilla_version,
      asunto: e.asunto,
      contenidoRenderizado: e.contenido_renderizado,
      enviadoAt: e.enviado_at,
      proveedor: e.proveedor,
      referenciaExterna: e.referencia_externa,
      acuses: [...e.acciones_cobranza_acuses]
        .sort((a, b) => a.ocurrido_at.localeCompare(b.ocurrido_at))
        .map((a) => ({ estado: a.estado, ocurridoAt: a.ocurrido_at, origen: a.origen, motivo: a.motivo })),
    }))
  }

  /**
   * Recomendación (Ola 2 §3): corre el mismo motor que el job diario, en
   * modo simulación — no escribe nada. Devuelve solo los inmuebles con algo
   * que mostrar (una acción propuesta u bloqueada); un inmueble sin novedad
   * no aporta a la bandeja de recomendaciones.
   */
  async function simularRecomendaciones(
    tenantId: string,
    fechaCorte: string,
  ): Promise<ResultadoSimulacionRecomendaciones> {
    const cliente = useSupabaseClient<Database>()
    const { data, error } = await cliente.functions.invoke<{
      ejecucionId: string
      fechaCorte: string
      inmueblesEvaluados: number
      planes: PlanRecomendacion[]
    }>('cartera-recalcular', {
      body: { tenant_id: tenantId, fecha_corte: fechaCorte, modo: 'simulacion' },
    })
    if (error) throw await extraerErrorFuncion(error)
    if (!data) throw new Error('No se pudo calcular la recomendación.')
    return {
      ejecucionId: data.ejecucionId,
      fechaCorte: data.fechaCorte,
      inmueblesEvaluados: data.inmueblesEvaluados,
      planes: data.planes.filter(
        (p) => p.accionesPropuestas.length > 0 || p.accionesBloqueadas.length > 0,
      ),
    }
  }

  /**
   * Confirmación humana explícita (§3.1: RECOMENDAR ≠ EJECUTAR): crea la(s)
   * fila(s) de acciones_cobranza para UN inmueble, llamando la misma
   * función que usa el job diario — nunca un INSERT propio. Si el estado
   * del inmueble cambió desde que se mostró la recomendación,
   * accionesCreadas puede salir en 0: eso es correcto, no un error (§3.4,
   * contexto obsoleto — no se ejecuta en silencio sobre una foto vieja).
   */
  async function confirmarRecomendacion(
    tenantId: string,
    fechaCorte: string,
    inmuebleId: string,
  ): Promise<ResultadoConfirmarRecomendacion> {
    const cliente = useSupabaseClient<Database>()
    const { data, error } = await cliente.functions.invoke<ResultadoConfirmarRecomendacion>(
      'cartera-recalcular',
      {
        body: {
          tenant_id: tenantId,
          fecha_corte: fechaCorte,
          modo: 'ejecucion',
          alcance_inmuebles: [inmuebleId],
        },
      },
    )
    if (error) throw await extraerErrorFuncion(error)
    if (!data) throw new Error('No se pudo confirmar la recomendación.')
    return data
  }

  return {
    acciones,
    loading,
    cargarBandeja,
    decidirAccion,
    registrarResultado,
    cancelarAccion,
    despacharAccion,
    correrLote,
    compilarExpediente,
    cargarEnvios,
    simularRecomendaciones,
    confirmarRecomendacion,
  }
})
