// EXT-01 entregable 6 — el JWT de sesión vive en almacenamiento seguro del dispositivo
// (expo-secure-store), nunca en AsyncStorage plano (EXT_APP_MOVIL_PROMPT_MAESTRO.md §3).
import * as SecureStore from 'expo-secure-store'
import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL ?? ''
const SUPABASE_ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? ''

const almacenSeguro = {
  getItem: (clave: string) => SecureStore.getItemAsync(clave),
  setItem: (clave: string, valor: string) => SecureStore.setItemAsync(clave, valor),
  removeItem: (clave: string) => SecureStore.deleteItemAsync(clave),
}

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    storage: almacenSeguro,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
})

/** Intercambia el hashed_token del magic link (devuelto por confirmarOtp) por una sesión real —
 * sin contraseña en este paso (EXT-01 §3.2, "solo en el primer ingreso la app pide establecer
 * una contraseña", DESPUÉS de tener sesión). */
export async function establecerSesionDesdeOtp(email: string, hashedToken: string): Promise<void> {
  const { error } = await supabase.auth.verifyOtp({ email, token: hashedToken, type: 'magiclink' })
  if (error) throw error
}
