/**
 * Notificaciones in-app (EXS-2).
 *
 * Reemplaza el uso de `audit_log` como sustituto de notificaciones, que es
 * lo que hacía la campana hasta este corte (y que el prompt 06 §13 prohíbe
 * expresamente). Diferencias que importan:
 *
 *   · audit_log registra lo que pasó; una notificación es lo que a alguien
 *     le interesa que pasó. No son lo mismo y no coinciden en volumen.
 *   · el "no leído" ya no es una cookie de este navegador, sino una fila
 *     en notificacion_lectura — sobrevive al cambio de equipo y es real.
 *   · cada aviso trae su enlace al contexto exacto, no al home del módulo.
 *
 * Solo lectura salvo `marcarLeida`: las notificaciones las emite el sistema
 * vía fn_notificar (la tabla no tiene policy de insert), y la RLS ya filtra
 * por tenant y por módulo visible — el cliente no decide qué le concierne.
 */
import { defineStore } from 'pinia'
import type { Database } from '@aquila/shared'

export interface Notificacion {
  id: string
  titulo: string
  cuerpo: string | null
  enlace: string | null
  modulo: string
  tipo: string
  prioridad: string
  createdAt: string
  leida: boolean
}

interface FilaNotificacion {
  id: string
  titulo: string
  cuerpo: string | null
  enlace: string | null
  modulo: string
  created_at: string
  tipo: { codigo: string } | null
  prioridad: { codigo: string } | null
  notificacion_lectura: { leida_at: string }[]
}

export const useNotificacionesStore = defineStore('notificaciones', () => {
  const notificaciones = shallowRef<Notificacion[]>([])
  const loading = ref(false)

  const noLeidas = computed(() => notificaciones.value.filter((n) => !n.leida).length)

  /**
   * El join a notificacion_lectura no lleva filtro por usuario: su propia
   * RLS (`notificacion_lectura_select_propia`) ya solo devuelve las filas
   * del usuario autenticado, así que el array viene vacío o con una sola
   * entrada — la suya. Filtrar aquí además sería redundante y daría la
   * impresión falsa de que la seguridad depende de este cliente.
   */
  async function cargar(tenantId: string, limite = 30): Promise<void> {
    loading.value = true
    try {
      const cliente = useSupabaseClient<Database>()
      const { data, error } = await cliente
        .from('notificaciones')
        .select(
          'id, titulo, cuerpo, enlace, modulo, created_at,' +
            ' tipo:tipo_id(codigo), prioridad:prioridad_id(codigo),' +
            ' notificacion_lectura(leida_at)',
        )
        .eq('tenant_id', tenantId)
        .order('created_at', { ascending: false })
        .limit(limite)
      if (error) throw error

      const filas = (data ?? []) as unknown as FilaNotificacion[]
      notificaciones.value = filas.map((f) => ({
        id: f.id,
        titulo: f.titulo,
        cuerpo: f.cuerpo,
        enlace: f.enlace,
        modulo: f.modulo,
        tipo: f.tipo?.codigo ?? 'desconocido',
        prioridad: f.prioridad?.codigo ?? 'informativa',
        createdAt: f.created_at,
        leida: f.notificacion_lectura.length > 0,
      }))
    } finally {
      loading.value = false
    }
  }

  /**
   * Append-only: insertar la fila de lectura. Un segundo intento sobre la
   * misma notificación choca con la PK; se ignora en silencio porque
   * "marcar leído dos veces" no es un error para quien lo hace.
   */
  async function marcarLeida(notificacionId: string): Promise<void> {
    const objetivo = notificaciones.value.find((n) => n.id === notificacionId)
    if (!objetivo || objetivo.leida) return

    const cliente = useSupabaseClient<Database>()
    const { data: usuario } = await cliente.auth.getUser()
    const userId = usuario.user?.id
    if (!userId) return

    const { error } = await cliente
      .from('notificacion_lectura')
      .insert({ notificacion_id: notificacionId, user_id: userId })
    // 23505 = unique_violation: ya estaba leída en otra pestaña.
    if (error && error.code !== '23505') throw error

    notificaciones.value = notificaciones.value.map((n) =>
      n.id === notificacionId ? { ...n, leida: true } : n,
    )
  }

  async function marcarTodasLeidas(): Promise<void> {
    const pendientes = notificaciones.value.filter((n) => !n.leida)
    for (const n of pendientes) await marcarLeida(n.id)
  }

  return { notificaciones, loading, noLeidas, cargar, marcarLeida, marcarTodasLeidas }
})
