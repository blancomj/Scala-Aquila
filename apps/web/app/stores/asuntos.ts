/**
 * Mis asuntos (EXS-7) — la bandeja de trabajo del miembro.
 *
 * Store deliberadamente delgado: toda la lógica está en `fn_mis_asuntos`,
 * que agrega ocho ramas server-side. Replicar aquí el criterio de "qué es
 * un asunto" daría dos fuentes de verdad, y la del cliente sería la que
 * miente en cuanto alguien cambie una regla en la base.
 *
 * No hay acciones de escritura: un asunto no se marca como hecho — se
 * resuelve en su propio dominio y desaparece de la bandeja por sí solo.
 *
 * `Asunto` es `Situacion` (ENFOQUE_CONSOLIDACION, Ola 1 §2.1,
 * `packages/shared/src/situacion.ts`) con su nombre de dominio: fue la
 * forma que ese contrato formalizó, sin inventar una nueva ni renombrar
 * sus campos. Alias, no una copia — un solo mapeo, no dos que puedan
 * divergir en silencio.
 */
import { defineStore } from 'pinia'
import type { Database, FilaSituacion, Situacion } from '@aquila/shared'
import { mapearFilaSituacion } from '@aquila/shared'
import { mensajeError } from '~/utils/error-message'

export type Asunto = Situacion
type FilaAsunto = FilaSituacion

export const useAsuntosStore = defineStore('asuntos', () => {
  const asuntos = shallowRef<Asunto[]>([])
  const loading = ref(false)
  const error = ref<string | null>(null)

  async function cargar(tenantId: string, diasAnticipacion?: number): Promise<void> {
    loading.value = true
    error.value = null
    try {
      const cliente = useSupabaseClient<Database>()
      const { data, error: err } = await cliente.rpc('fn_mis_asuntos', {
        p_tenant_id: tenantId,
        p_dias_anticipacion: diasAnticipacion ?? undefined,
      })
      if (err) throw err
      asuntos.value = ((data ?? []) as unknown as FilaAsunto[]).map(mapearFilaSituacion)
    } catch (e) {
      error.value = mensajeError(e, 'No se pudieron cargar los asuntos.')
    } finally {
      loading.value = false
    }
  }

  /** Cuántos asuntos hay por módulo — para las pastillas de filtro. */
  const porModulo = computed(() => {
    const cuenta = new Map<string, number>()
    for (const a of asuntos.value) {
      cuenta.set(a.origenModulo, (cuenta.get(a.origenModulo) ?? 0) + 1)
    }
    return cuenta
  })

  /** Vencidos y por vencer, que es lo que justifica mirar la bandeja hoy. */
  const vencidos = computed(() => {
    const hoy = new Date().toISOString().slice(0, 10)
    return asuntos.value.filter((a) => a.venceAt !== null && a.venceAt.slice(0, 10) < hoy).length
  })

  /** Cuántos asuntos hay en total — lo que pinta la insignia del sidebar. */
  const total = computed(() => asuntos.value.length)

  /** Los que llevan tu nombre. Se calcula aquí y no en SQL porque el conjunto ya viene
   *  acotado a lo que puedes atender y cabe entero en memoria (AD-24: un tenant es un
   *  edificio); bajarlo a la función solo añadiría un parámetro sin ahorrar trabajo. */
  function mios(userId: string | null): Asunto[] {
    if (userId === null) return []
    return asuntos.value.filter((a) => a.asignadoA === userId)
  }

  /** Con dueño explícito que no eres tú: lo que alguien ya lleva. */
  const sinDueno = computed(() => asuntos.value.filter((a) => a.asignadoA === null))

  return { asuntos, loading, error, cargar, porModulo, vencidos, total, mios, sinDueno }
})
