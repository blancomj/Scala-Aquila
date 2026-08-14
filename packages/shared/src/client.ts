/**
 * Fábrica tipada del cliente Supabase. Fase I §3.3 / DB-first: los tipos
 * vienen de `database.generated.ts`, nunca escritos a mano.
 */
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import type { Database } from './database.generated.js'

export type AquilaClient = SupabaseClient<Database>

export function crearClienteAquila(
  url: string,
  key: string,
  opciones?: Parameters<typeof createClient<Database>>[2],
): AquilaClient {
  return createClient<Database>(url, key, opciones)
}
