/**
 * Configuración del módulo de cartera (CAR §8 y §9, bloque 23): política de
 * clasificación, sus tramos y las estrategias de cobranza.
 *
 * Es la puerta que faltaba: sin política vigente el job aborta por
 * PH-C26/I-C14 y no ocurre nada. Hasta ahora esa configuración solo se
 * podía crear escribiendo SQL, así que ninguna copropiedad podía encender
 * el módulo sin un desarrollador.
 *
 * Reglas que la pantalla no puede saltarse, y que además vigila la base:
 *  · una política vigente es INMUTABLE — corregir es crear versión nueva
 *    (§8.5, REC-CAR-011, guard_politica_clasificacion_*)
 *  · activar exige cumplir los invariantes de tramos (§8.3): exactamente un
 *    tramo con dias_min=0, exactamente uno abierto (dias_max null), sin
 *    solapes ni huecos
 *  · las estrategias SÍ se pueden crear/editar/eliminar con la política
 *    vigente (§9.3, sin guard de inmutabilidad): solo se valida que el
 *    tramo pertenezca a la política (guard_estrategia_cobranza_tramo_coherente)
 */
import { defineStore } from 'pinia'
import type { Database } from '@aquila/shared'
import { mensajeError } from '~/utils/error-message'

export interface PoliticaClasificacion {
  id: string
  version: number
  estado: string
  nombre: string
  createdAt: string
}

export interface TramoClasificacion {
  id: string
  codigo: string
  nombre: string
  diasMin: number
  diasMax: number | null
  nivelRiesgo: string
  etapaCobranza: string
  orden: number
}

export interface EstrategiaCobranza {
  id: string
  tramoId: string
  codigo: string
  nombre: string
  tipoAccion: string
  canal: string
  diasDesdeClasificacion: number
  frecuenciaDias: number | null
  maxIntentos: number
  plantillaCodigo: string | null
  rolMinimo: string
  requiereAprobacion: boolean
  montoMinimoDeuda: number | null
  activa: boolean
  orden: number
}

export interface NuevoTramo {
  codigo: string
  nombre: string
  diasMin: number
  diasMax: number | null
  nivelRiesgo: Database['public']['Enums']['nivel_riesgo_t']
  etapaCobranza: Database['public']['Enums']['etapa_cobranza_t']
  orden: number
}

export interface NuevaEstrategia {
  tramoId: string
  codigo: string
  nombre: string
  tipoAccion: Database['public']['Enums']['tipo_accion_cobranza_t']
  canal: Database['public']['Enums']['canal_cobranza_t']
  diasDesdeClasificacion: number
  frecuenciaDias: number | null
  maxIntentos: number
  plantillaCodigo: string | null
  rolMinimo: Database['public']['Enums']['tenant_role_t']
  requiereAprobacion: boolean
  montoMinimoDeuda: number | null
  activa: boolean
  orden: number
}

export const useCarteraConfigStore = defineStore('carteraConfig', () => {
  const politicas = shallowRef<PoliticaClasificacion[]>([])
  const tramos = shallowRef<TramoClasificacion[]>([])
  const estrategias = shallowRef<EstrategiaCobranza[]>([])
  /** Tramos del borrador en edición (§8.5), cargados aparte de `tramos` porque
   * cuando hay vigente + borrador simultáneos, `politicaActual`/`tramos` apuntan a
   * la vigente (lo que debe mostrarse por defecto) y la comparación necesita ver
   * ambas versiones a la vez. */
  const tramosBorrador = shallowRef<TramoClasificacion[]>([])
  const loading = ref(false)

  /** La política que manda hoy; si no hay vigente, el borrador más reciente. */
  const politicaActual = computed<PoliticaClasificacion | null>(() => {
    const vigente = politicas.value.find((p) => p.estado === 'vigente')
    if (vigente) return vigente
    const borradores = politicas.value.filter((p) => p.estado === 'borrador')
    return borradores.length > 0 ? (borradores[borradores.length - 1] ?? null) : null
  })

  /** La vigente hoy, si existe — independiente de si además hay un borrador en edición. */
  const politicaVigente = computed<PoliticaClasificacion | null>(
    () => politicas.value.find((p) => p.estado === 'vigente') ?? null,
  )

  /** Un borrador en edición (§8.5): solo existe cuando ya hay vigente y alguien creó
   * una versión nueva para corregirla. El primer borrador (sin vigente todavía) no
   * cuenta como "en edición" — es la puesta en marcha inicial. */
  const politicaBorradorEnEdicion = computed<PoliticaClasificacion | null>(() => {
    if (!politicaVigente.value) return null
    const borradores = politicas.value.filter((p) => p.estado === 'borrador')
    return borradores.length > 0 ? (borradores[borradores.length - 1] ?? null) : null
  })

  /** Recibe `cliente` en vez de pedirlo con useSupabaseClient(): esta función se
   * invoca después de un await en cargar(), y un composable de Nuxt llamado ahí
   * pierde el contexto de la instancia (NUXT_E1001) — el cliente que devolvería
   * queda desconectado de la sesión y RLS filtra todo en silencio, sin error. */
  async function cargarTramosDe(
    cliente: ReturnType<typeof useSupabaseClient<Database>>,
    politicaId: string,
  ): Promise<TramoClasificacion[]> {
    const { data, error } = await cliente
      .from('politica_clasificacion_tramos')
      .select('id, codigo, nombre, dias_min, dias_max, nivel_riesgo, etapa_cobranza, orden')
      .eq('politica_id', politicaId)
      .order('orden', { ascending: true })
    if (error) throw new Error(mensajeError(error, 'No se pudieron leer los tramos.'))
    return (data ?? []).map((t) => ({
      id: t.id,
      codigo: t.codigo,
      nombre: t.nombre,
      diasMin: t.dias_min,
      diasMax: t.dias_max,
      nivelRiesgo: t.nivel_riesgo,
      etapaCobranza: t.etapa_cobranza,
      orden: t.orden,
    }))
  }

  async function cargar(tenantId: string): Promise<void> {
    loading.value = true
    try {
      const cliente = useSupabaseClient<Database>()

      const { data: filasPolitica, error: errorPolitica } = await cliente
        .from('politicas_clasificacion_cartera')
        .select('id, version, estado, nombre, created_at')
        .eq('tenant_id', tenantId)
        .order('version', { ascending: true })
      if (errorPolitica) throw new Error(mensajeError(errorPolitica, 'No se pudo leer la política de cartera.'))

      politicas.value = (filasPolitica ?? []).map((p) => ({
        id: p.id,
        version: p.version,
        estado: p.estado,
        nombre: p.nombre,
        createdAt: p.created_at,
      }))

      const actual = politicaActual.value
      if (!actual) {
        tramos.value = []
        estrategias.value = []
        tramosBorrador.value = []
        return
      }

      const borrador = politicaBorradorEnEdicion.value

      const [{ data: filasEstrategias, error: errorEstrategias }, filasTramos, filasTramosBorrador] =
        await Promise.all([
          cliente
            .from('estrategias_cobranza')
            .select(
              'id, tramo_id, codigo, nombre, tipo_accion, canal, dias_desde_clasificacion, frecuencia_dias, max_intentos, plantilla_codigo, rol_minimo, requiere_aprobacion, monto_minimo_deuda, activa, orden',
            )
            .eq('politica_id', actual.id)
            .order('orden', { ascending: true }),
          cargarTramosDe(cliente, actual.id),
          borrador && borrador.id !== actual.id ? cargarTramosDe(cliente, borrador.id) : Promise.resolve([]),
        ])
      if (errorEstrategias) throw new Error(mensajeError(errorEstrategias, 'No se pudieron leer las estrategias.'))

      tramos.value = filasTramos
      tramosBorrador.value = filasTramosBorrador

      estrategias.value = (filasEstrategias ?? []).map((e) => ({
        id: e.id,
        tramoId: e.tramo_id,
        codigo: e.codigo,
        nombre: e.nombre,
        tipoAccion: e.tipo_accion,
        canal: e.canal,
        diasDesdeClasificacion: e.dias_desde_clasificacion,
        frecuenciaDias: e.frecuencia_dias,
        maxIntentos: e.max_intentos,
        plantillaCodigo: e.plantilla_codigo,
        rolMinimo: e.rol_minimo,
        requiereAprobacion: e.requiere_aprobacion,
        montoMinimoDeuda: e.monto_minimo_deuda,
        activa: e.activa,
        orden: e.orden,
      }))
    } finally {
      loading.value = false
    }
  }

  /** Siembra los valores sugeridos del rector (§8.4/§9.4). Nace en borrador. */
  async function sembrarInicial(tenantId: string): Promise<void> {
    const cliente = useSupabaseClient<Database>()
    const { error } = await cliente.rpc('fn_sembrar_configuracion_cartera', { p_tenant_id: tenantId })
    if (error) throw new Error(mensajeError(error, 'No se pudo crear la configuración inicial.'))
  }

  /**
   * Activar. Si ya hay una vigente distinta (§8.5: segunda versión en adelante),
   * primero se retira a 'historica' y luego se promueve la nueva — dos UPDATE
   * secuenciales, mismo patrón que politicaFinanciera.activarPolitica: el índice
   * único parcial nunca ve dos filas vigentes a la vez. Los invariantes de §8.3
   * los valida el trigger al pasar a vigente: si algo no cuadra, el mensaje dice
   * exactamente qué falta y se propaga tal cual.
   */
  async function activarPolitica(politicaId: string, tenantId: string): Promise<void> {
    const cliente = useSupabaseClient<Database>()
    const vigenteActual = politicas.value.find(
      (p) => p.estado === 'vigente' && p.id !== politicaId,
    )

    if (vigenteActual) {
      const { error: errorRetiro } = await cliente
        .from('politicas_clasificacion_cartera')
        .update({ estado: 'historica' })
        .eq('id', vigenteActual.id)
      if (errorRetiro) throw new Error(mensajeError(errorRetiro, 'No se pudo retirar la política vigente actual.'))
    }

    const { error } = await cliente
      .from('politicas_clasificacion_cartera')
      .update({ estado: 'vigente' })
      .eq('id', politicaId)
    if (error) throw new Error(mensajeError(error, 'No se pudo activar la política.'))

    await cargar(tenantId)
  }

  /** Clona tramos y estrategias de una política existente en una versión nueva en
   * borrador (§8.5, RPC fn_crear_version_politica_clasificacion) — la vía para
   * corregir una vigente sin tocarla. */
  async function crearVersionNueva(politicaId: string, tenantId: string): Promise<string> {
    const cliente = useSupabaseClient<Database>()
    const { data, error } = await cliente.rpc('fn_crear_version_politica_clasificacion', {
      p_politica_id: politicaId,
    })
    if (error) throw new Error(mensajeError(error, 'No se pudo crear la versión nueva.'))
    await cargar(tenantId)
    return data
  }

  /** Alta/edición/baja de tramos — solo tiene efecto sobre un borrador: una vez
   * vigente, guard_tramo_politica_inmutable bloquea las tres operaciones (§8.5). */
  async function crearTramo(politicaId: string, tenantId: string, tramo: NuevoTramo): Promise<void> {
    const cliente = useSupabaseClient<Database>()
    const { error } = await cliente.from('politica_clasificacion_tramos').insert({
      tenant_id: tenantId,
      politica_id: politicaId,
      codigo: tramo.codigo,
      nombre: tramo.nombre,
      dias_min: tramo.diasMin,
      dias_max: tramo.diasMax,
      nivel_riesgo: tramo.nivelRiesgo,
      etapa_cobranza: tramo.etapaCobranza,
      prioridad: tramo.orden,
      orden: tramo.orden,
    })
    if (error) throw new Error(mensajeError(error, 'No se pudo crear el tramo.'))
  }

  async function actualizarTramo(
    tramoId: string,
    cambios: Partial<Omit<NuevoTramo, 'codigo'>>,
  ): Promise<void> {
    const cliente = useSupabaseClient<Database>()
    const { error } = await cliente
      .from('politica_clasificacion_tramos')
      .update({
        nombre: cambios.nombre,
        dias_min: cambios.diasMin,
        dias_max: cambios.diasMax,
        nivel_riesgo: cambios.nivelRiesgo,
        etapa_cobranza: cambios.etapaCobranza,
        orden: cambios.orden,
      })
      .eq('id', tramoId)
    if (error) throw new Error(mensajeError(error, 'No se pudo actualizar el tramo.'))
  }

  async function eliminarTramo(tramoId: string): Promise<void> {
    const cliente = useSupabaseClient<Database>()
    const { error } = await cliente.from('politica_clasificacion_tramos').delete().eq('id', tramoId)
    if (error) throw new Error(mensajeError(error, 'No se pudo eliminar el tramo.'))
  }

  /** Encender o apagar una estrategia sin tocar la política. */
  async function alternarEstrategia(estrategiaId: string, activa: boolean): Promise<void> {
    const cliente = useSupabaseClient<Database>()
    const { error } = await cliente.from('estrategias_cobranza').update({ activa }).eq('id', estrategiaId)
    if (error) throw new Error(mensajeError(error, 'No se pudo cambiar la estrategia.'))
  }

  /** Alta/edición/baja completa de una estrategia — a diferencia de los tramos, no
   * hay guard de inmutabilidad sobre estrategias_cobranza (§9.3): se pueden crear,
   * editar y eliminar con la política vigente igual que con un borrador. El único
   * guard existente (guard_estrategia_cobranza_tramo_coherente) exige que tramo_id
   * pertenezca a politica_id, y RLS exige el rol base (auxiliar/administrador). */
  async function crearEstrategia(politicaId: string, tenantId: string, estrategia: NuevaEstrategia): Promise<void> {
    const cliente = useSupabaseClient<Database>()
    const { error } = await cliente.from('estrategias_cobranza').insert({
      tenant_id: tenantId,
      politica_id: politicaId,
      tramo_id: estrategia.tramoId,
      codigo: estrategia.codigo,
      nombre: estrategia.nombre,
      tipo_accion: estrategia.tipoAccion,
      canal: estrategia.canal,
      dias_desde_clasificacion: estrategia.diasDesdeClasificacion,
      frecuencia_dias: estrategia.frecuenciaDias,
      max_intentos: estrategia.maxIntentos,
      plantilla_codigo: estrategia.plantillaCodigo,
      rol_minimo: estrategia.rolMinimo,
      requiere_aprobacion: estrategia.requiereAprobacion,
      monto_minimo_deuda: estrategia.montoMinimoDeuda,
      activa: estrategia.activa,
      orden: estrategia.orden,
    })
    if (error) throw new Error(mensajeError(error, 'No se pudo crear la estrategia.'))
  }

  async function actualizarEstrategia(
    estrategiaId: string,
    cambios: Partial<Omit<NuevaEstrategia, 'tramoId' | 'codigo'>>,
  ): Promise<void> {
    const cliente = useSupabaseClient<Database>()
    const { error } = await cliente
      .from('estrategias_cobranza')
      .update({
        nombre: cambios.nombre,
        tipo_accion: cambios.tipoAccion,
        canal: cambios.canal,
        dias_desde_clasificacion: cambios.diasDesdeClasificacion,
        frecuencia_dias: cambios.frecuenciaDias,
        max_intentos: cambios.maxIntentos,
        plantilla_codigo: cambios.plantillaCodigo,
        rol_minimo: cambios.rolMinimo,
        requiere_aprobacion: cambios.requiereAprobacion,
        monto_minimo_deuda: cambios.montoMinimoDeuda,
        orden: cambios.orden,
      })
      .eq('id', estrategiaId)
    if (error) throw new Error(mensajeError(error, 'No se pudo actualizar la estrategia.'))
  }

  async function eliminarEstrategia(estrategiaId: string): Promise<void> {
    const cliente = useSupabaseClient<Database>()
    const { error } = await cliente.from('estrategias_cobranza').delete().eq('id', estrategiaId)
    if (error) throw new Error(mensajeError(error, 'No se pudo eliminar la estrategia.'))
  }

  return {
    politicas,
    tramos,
    tramosBorrador,
    estrategias,
    loading,
    politicaActual,
    politicaVigente,
    politicaBorradorEnEdicion,
    cargar,
    sembrarInicial,
    activarPolitica,
    alternarEstrategia,
    crearEstrategia,
    actualizarEstrategia,
    eliminarEstrategia,
    crearVersionNueva,
    crearTramo,
    actualizarTramo,
    eliminarTramo,
  }
})
