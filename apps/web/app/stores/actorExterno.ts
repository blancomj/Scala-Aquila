/**
 * Estado del actor externo (propietario/residente, EXT-01/EXT-06) para "AQUILA Mi Copropiedad".
 *
 * Deliberadamente independiente de `tenant.ts`/`auth.ts`: un actor externo NUNCA es
 * `tenant_member` (AD-37) — no tiene `membership`, no tiene `role` de `TenantRole`, y su
 * autorización real la resuelve cada Edge Function contra `actor_externo_vinculo`, no contra
 * este store (ver `_shared/actor_externo_context.ts`, EXT-06). Este store es solo el espejo en
 * el cliente de "con cuál vínculo estoy trabajando ahora" — nunca la fuente de autorización.
 *
 * `vinculoActivoId` se persiste en una cookie de SESIÓN (sin `maxAge`), mismo criterio que
 * `copropiedad-confirmada-sesion` en `middleware/tenant.ts`: sobrevive a una recarga de página
 * pero se olvida al cerrar el navegador — un login nuevo vuelve a preguntar si hay más de un
 * vínculo.
 */
import { defineStore } from 'pinia'
import type { Database } from '@aquila/shared'

type Vinculo = Database['public']['Functions']['fn_actor_externo_mis_vinculos']['Returns'][number]

export const useActorExternoStore = defineStore('actorExterno', () => {
  const vinculos = shallowRef<Vinculo[]>([])
  const loading = ref(false)
  const vinculoActivoId = useCookie<string | null>('vinculo-activo-sesion', {
    default: () => null,
  })

  const vinculoActivo = computed<Vinculo | null>(() => {
    if (!vinculoActivoId.value) return null
    return vinculos.value.find((v) => v.vinculo_id === vinculoActivoId.value) ?? null
  })

  const tieneMultiplesVinculos = computed<boolean>(() => vinculos.value.length > 1)

  /**
   * Carga los vínculos vigentes del usuario autenticado. Igual que `mis-vinculos.vue` (EXT-01
   * §3.3): `cliente.auth.getUser()` valida siempre contra Supabase, nunca se asume que
   * `useSupabaseUser().value` ya trae un `id` fresco tras la recarga completa del OTP.
   *
   * Con un solo vínculo, se fija automático — mismo criterio que `tenant.ts` (líneas 94-96) para
   * membresías: "con uno solo no hay nada entre qué elegir".
   */
  async function cargarVinculos(): Promise<Vinculo[]> {
    loading.value = true
    try {
      const cliente = useSupabaseClient<Database>()
      const {
        data: { user: usuario },
      } = await cliente.auth.getUser()
      if (!usuario) {
        vinculos.value = []
        return vinculos.value
      }

      const { data, error } = await cliente.rpc('fn_actor_externo_mis_vinculos', {
        p_auth_user_id: usuario.id,
      })
      if (error) throw error
      vinculos.value = data ?? []

      if (vinculos.value.length === 1) {
        vinculoActivoId.value = vinculos.value[0]!.vinculo_id
      } else if (
        vinculoActivoId.value &&
        !vinculos.value.some((v) => v.vinculo_id === vinculoActivoId.value)
      ) {
        // El vínculo recordado en la cookie ya no está entre los vigentes (venció, o el rol
        // cambió) — se limpia para que el flujo vuelva a preguntar en vez de quedar apuntando a
        // un vínculo fantasma.
        vinculoActivoId.value = null
      }

      return vinculos.value
    } finally {
      loading.value = false
    }
  }

  /** Fija el vínculo activo — valida contra la lista ya cargada, nunca acepta un id a ciegas
   * (mismo espíritu que la validación server-side de `resolverContextoActorExterno`: aquí es
   * solo UX, la barrera real sigue siendo la Edge Function). */
  function seleccionarVinculo(vinculoId: string): void {
    if (!vinculos.value.some((v) => v.vinculo_id === vinculoId)) {
      throw new Error('Ese vínculo no está en la lista de vínculos vigentes.')
    }
    vinculoActivoId.value = vinculoId
  }

  async function cerrarSesion(): Promise<void> {
    const cliente = useSupabaseClient<Database>()
    await cliente.auth.signOut()
    vinculos.value = []
    vinculoActivoId.value = null
  }

  return {
    vinculos,
    loading,
    vinculoActivoId,
    vinculoActivo,
    tieneMultiplesVinculos,
    cargarVinculos,
    seleccionarVinculo,
    cerrarSesion,
  }
})
