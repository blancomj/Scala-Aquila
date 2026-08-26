/**
 * Estado de sesión/perfil — PROMPT_MAESTRO_FASE1.md §10.2.
 *
 * `user`/`session` vienen de `useSupabaseUser()`/`useSupabaseClient()`
 * (D-16, @nuxtjs/supabase) — este store solo guarda lo que la app añade
 * encima: el `profile` (fila de `public.profiles`) y su estado de carga.
 * Los tokens nunca se persisten aquí a mano (§10.2 "prohibido").
 */
import { defineStore } from 'pinia'
import type { Database } from '@aquila/shared'

type ProfileRow = Database['public']['Tables']['profiles']['Row']

export const useAuthStore = defineStore('auth', () => {
  const profile = ref<ProfileRow | null>(null)
  const loading = ref(false)

  const isPlatformAdmin = computed(() => profile.value?.is_platform_admin ?? false)

  /**
   * Devuelve el perfil cargado (o `null`) — `useAsyncData` necesita un
   * valor de retorno real; si el handler devuelve `undefined` (NUXT_E3006),
   * Nuxt no puede cachear el resultado de SSR y repite la consulta en el
   * cliente, con riesgo de una segunda llamada en un momento en que la
   * sesión del cliente aún no terminó de hidratarse.
   *
   * El id sale de `auth.getUser()` (no de `useSupabaseUser().value.id`):
   * durante SSR, el ref reactivo puede quedar poblado con un objeto que
   * todavía no trae `id` (visto en pruebas manuales — la query fallaba con
   * `invalid input syntax for type uuid: "undefined"` aun con el usuario ya
   * autenticado), mientras que `getUser()` siempre valida contra Supabase.
   */
  async function cargarPerfil(opciones?: { forzar?: boolean }): Promise<ProfileRow | null> {
    if (profile.value && !opciones?.forzar) return profile.value

    const cliente = useSupabaseClient<Database>()
    const {
      data: { user: usuario },
    } = await cliente.auth.getUser()
    if (!usuario) {
      profile.value = null
      return null
    }

    loading.value = true
    try {
      const { data, error: errorPerfil } = await cliente
        .from('profiles')
        .select('*')
        .eq('id', usuario.id)
        .single()
      if (errorPerfil) throw errorPerfil
      profile.value = data
      return data
    } finally {
      loading.value = false
    }
  }

  /**
   * "Mi perfil" (menú de usuario, 2026-08-26) — solo las columnas que
   * profiles_update_propio + guard_privileged_columns dejan auto-editar
   * (SEC-06): is_platform_admin/status/email quedan fuera por diseño.
   */
  async function actualizarPerfil(cambios: {
    fullName: string | null
    phone: string | null
  }): Promise<void> {
    const cliente = useSupabaseClient<Database>()
    const {
      data: { user: usuario },
    } = await cliente.auth.getUser()
    if (!usuario) throw new Error('Sesión inválida.')

    const { data, error: errorPerfil } = await cliente
      .from('profiles')
      .update({ full_name: cambios.fullName, phone: cambios.phone })
      .eq('id', usuario.id)
      .select('*')
      .single()
    if (errorPerfil) throw errorPerfil
    profile.value = data
  }

  function limpiar(): void {
    profile.value = null
  }

  return { profile, loading, isPlatformAdmin, cargarPerfil, actualizarPerfil, limpiar }
})
