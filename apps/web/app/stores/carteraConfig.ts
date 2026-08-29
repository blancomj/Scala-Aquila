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
 *  · las estrategias SÍ se pueden ajustar con la política vigente: solo se
 *    valida que el tramo pertenezca a la política
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
  activa: boolean
  orden: number
}

export const useCarteraConfigStore = defineStore('carteraConfig', () => {
  const politicas = shallowRef<PoliticaClasificacion[]>([])
  const tramos = shallowRef<TramoClasificacion[]>([])
  const estrategias = shallowRef<EstrategiaCobranza[]>([])
  const loading = ref(false)

  /** La política que manda hoy; si no hay vigente, el borrador más reciente. */
  const politicaActual = computed<PoliticaClasificacion | null>(() => {
    const vigente = politicas.value.find((p) => p.estado === 'vigente')
    if (vigente) return vigente
    const borradores = politicas.value.filter((p) => p.estado === 'borrador')
    return borradores.length > 0 ? (borradores[borradores.length - 1] ?? null) : null
  })

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
        return
      }

      const [{ data: filasTramos, error: errorTramos }, { data: filasEstrategias, error: errorEstrategias }] =
        await Promise.all([
          cliente
            .from('politica_clasificacion_tramos')
            .select('id, codigo, nombre, dias_min, dias_max, nivel_riesgo, etapa_cobranza, orden')
            .eq('politica_id', actual.id)
            .order('orden', { ascending: true }),
          cliente
            .from('estrategias_cobranza')
            .select(
              'id, tramo_id, codigo, nombre, tipo_accion, canal, dias_desde_clasificacion, frecuencia_dias, max_intentos, plantilla_codigo, rol_minimo, requiere_aprobacion, activa, orden',
            )
            .eq('politica_id', actual.id)
            .order('orden', { ascending: true }),
        ])
      if (errorTramos) throw new Error(mensajeError(errorTramos, 'No se pudieron leer los tramos.'))
      if (errorEstrategias) throw new Error(mensajeError(errorEstrategias, 'No se pudieron leer las estrategias.'))

      tramos.value = (filasTramos ?? []).map((t) => ({
        id: t.id,
        codigo: t.codigo,
        nombre: t.nombre,
        diasMin: t.dias_min,
        diasMax: t.dias_max,
        nivelRiesgo: t.nivel_riesgo,
        etapaCobranza: t.etapa_cobranza,
        orden: t.orden,
      }))

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
   * Activar. Los invariantes de §8.3 los valida el trigger al pasar a
   * vigente: si algo no cuadra, el mensaje dice exactamente qué falta y se
   * propaga tal cual — es más útil que un "no se pudo activar".
   */
  async function activarPolitica(politicaId: string): Promise<void> {
    const cliente = useSupabaseClient<Database>()
    const { error } = await cliente
      .from('politicas_clasificacion_cartera')
      .update({ estado: 'vigente' })
      .eq('id', politicaId)
    if (error) throw new Error(mensajeError(error, 'No se pudo activar la política.'))
  }

  /** Encender o apagar una estrategia sin tocar la política. */
  async function alternarEstrategia(estrategiaId: string, activa: boolean): Promise<void> {
    const cliente = useSupabaseClient<Database>()
    const { error } = await cliente.from('estrategias_cobranza').update({ activa }).eq('id', estrategiaId)
    if (error) throw new Error(mensajeError(error, 'No se pudo cambiar la estrategia.'))
  }

  return {
    politicas,
    tramos,
    estrategias,
    loading,
    politicaActual,
    cargar,
    sembrarInicial,
    activarPolitica,
    alternarEstrategia,
  }
})
