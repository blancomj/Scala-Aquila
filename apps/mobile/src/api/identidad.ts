// EXT-01 §3.2/entregable 6 — capa de API para el flujo mínimo de alta/login. Cada llamada
// envuelve una Edge Function ya existente (actor-externo-solicitar-otp/confirmar-otp); ninguna
// pantalla llama a fetch directo (EXT_APP_MOVIL_PROMPT_MAESTRO.md §3, "capa de API única").

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL ?? ''
const SUPABASE_ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? ''

export type Canal = 'email' | 'sms'

export interface SolicitarOtpResultado {
  message: string
}

export interface ConfirmarOtpResultado {
  email: string
  hashed_token: string
  vinculos: number
}

async function llamarEdgeFunction<T>(nombre: string, payload: unknown): Promise<T> {
  const respuesta = await fetch(`${SUPABASE_URL}/functions/v1/${nombre}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
      apikey: SUPABASE_ANON_KEY,
    },
    body: JSON.stringify(payload),
  })
  const cuerpo = (await respuesta.json()) as T & { code?: string; message?: string }
  if (!respuesta.ok) {
    throw new Error(cuerpo.message ?? `Error ${String(respuesta.status)}`)
  }
  return cuerpo
}

/** EXT-01 §3.2 — "la app no valida el formato como si fuera un alta nueva, es una búsqueda"
 * (EXT_APP_MOVIL_PROMPT_MAESTRO.md §5.1). La respuesta es siempre el mismo mensaje genérico. */
export function solicitarOtp(canal: Canal, contacto: string): Promise<SolicitarOtpResultado> {
  return llamarEdgeFunction('actor-externo-solicitar-otp', { canal, contacto })
}

/** Confirma el código. La app NUNCA recibe una contraseña en este paso — obtiene un
 * hashed_token de magic link para establecer sesión (EXT-01 §3.2: la contraseña se pide después,
 * ya con sesión abierta, en EstablecerPasswordScreen). */
export function confirmarOtp(canal: Canal, contacto: string, codigo: string): Promise<ConfirmarOtpResultado> {
  return llamarEdgeFunction('actor-externo-confirmar-otp', { canal, contacto, codigo })
}
