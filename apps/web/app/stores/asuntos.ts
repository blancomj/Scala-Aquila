/**
 * Mis asuntos (EXS-7) — la bandeja de trabajo del miembro.
 *
 * Store deliberadamente delgado: toda la lógica está en `fn_mis_asuntos`,
 * que agrega siete ramas server-side. Replicar aquí el criterio de "qué es
 * un asunto" daría dos fuentes de verdad, y la del cliente sería la que
 * miente en cuanto alguien cambie una regla en la base.
 *
 * No hay acciones de escritura: un asunto no se marca como hecho — se
 * resuelve en su propio dominio y desaparece de la bandeja por sí solo.
 */
import { defineStore } from 'pinia'
import type { Database } from '@aquila/shared'
import { mensajeError } from '~/utils/error-message'

export interface Asunto {
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
  /** Solo la rama de Atención lo trae: es el único dominio del corte que asigna dueño. En las
   *  demás es null, y eso significa "le toca a quien pueda", no "falta asignarlo". */
  asignadoA: string | null
}

interface FilaAsunto {
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
  asignado_a: string | null
}

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
      asuntos.value = ((data ?? []) as unknown as FilaAsunto[]).map((a) => ({
        origenModulo: a.origen_modulo,
        origenEntidad: a.origen_entidad,
        origenId: a.origen_id,
        titulo: a.titulo,
        resumen: a.resumen,
        estado: a.estado,
        accion: a.accion,
        enlace: a.enlace,
        createdAt: a.created_at,
        venceAt: a.vence_at,
        asignadoA: a.asignado_a,
      }))
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
