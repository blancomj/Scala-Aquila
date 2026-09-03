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

export interface Shortcut {
  to: string
  label: string
  icono: string
  orden: number
}

export const useAuthStore = defineStore('auth', () => {
  // shallowRef: `profiles.navigation_shortcuts` es `Json` (tipo recursivo).
  // `ref<T>` fuerza a Vue a des-envolver profundamente vía UnwrapRef, lo que
  // dispara "Type instantiation is excessively deep" en vue-tsc (ver mismo
  // patrón en tenant.ts). Todas las asignaciones reemplazan el objeto
  // entero, nunca mutan un campo anidado.
  const profile = shallowRef<ProfileRow | null>(null)
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

  /**
   * Mismo criterio exacto que copropiedadStore.subirLogo (20260822180000):
   * bucket público sin metadata ni versionado, ruta fija por dueño para que
   * un re-upload sea upsert real. Acá la carpeta es {userId}, no {tenantId}
   * (20260901120000_avatar_usuario.sql). El `?v=` en la URL guardada es
   * cache-buster propio — a diferencia del logo, avatar_url se lee tal cual
   * en varios componentes (NavUsuarioMenu, esta página), así que el
   * cache-bust va horneado en el valor guardado, no en cada consumidor.
   */
  async function subirAvatar(archivo: File): Promise<void> {
    const cliente = useSupabaseClient<Database>()
    const {
      data: { user: usuario },
    } = await cliente.auth.getUser()
    if (!usuario) throw new Error('Sesión inválida.')

    const path = `${usuario.id}/avatar`
    const { error: errorUpload } = await cliente.storage
      .from('avatares')
      .upload(path, archivo, { upsert: true, contentType: archivo.type })
    if (errorUpload) throw errorUpload

    const { data: publica } = cliente.storage.from('avatares').getPublicUrl(path)
    const avatarUrl = `${publica.publicUrl}?v=${Date.now()}`

    const { data, error: errorPerfil } = await cliente
      .from('profiles')
      .update({ avatar_url: avatarUrl })
      .eq('id', usuario.id)
      .select('*')
      .single()
    if (errorPerfil) throw errorPerfil
    profile.value = data
  }

  // ── Accesos directos del sidebar ──────────────────────────────────
  // Guardados como JSONB en profiles.navigation_shortcuts — misma tabla,
  // misma RLS (profiles_update_propio), sin tabla nueva.

  const shortcuts = computed<Shortcut[]>(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const raw: any = profile.value?.navigation_shortcuts
    if (!Array.isArray(raw)) return []
    return raw.filter(
      (s: unknown): s is Shortcut =>
        typeof s === 'object' &&
        s !== null &&
        'to' in s &&
        'label' in s &&
        'orden' in s,
    )
  })

  async function actualizarShortcuts(items: Shortcut[]): Promise<void> {
    const cliente = useSupabaseClient<Database>()
    const {
      data: { user: usuario },
    } = await cliente.auth.getUser()
    if (!usuario) throw new Error('Sesión inválida.')

    const { data, error } = await (cliente
      .from('profiles')
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .update({ navigation_shortcuts: items as any })
      .eq('id', usuario.id)
      .select('*')
      .single())
    if (error) throw error
    profile.value = data
  }

  function limpiar(): void {
    profile.value = null
  }

  return {
    profile,
    loading,
    isPlatformAdmin,
    shortcuts,
    cargarPerfil,
    actualizarPerfil,
    subirAvatar,
    actualizarShortcuts,
    limpiar,
  }
})
