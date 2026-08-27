// Núcleo de envío del recibo de caja por correo — RC-4, clon de
// envio_estado_cuenta.ts (D-28). Deduplicación SIN columnas mutables:
// recibos_caja es append-only (SEC-14), así que el rastro "este documento
// ya se notificó" vive en audit_log ('recibo_caja.enviado', entity_id = id).
//
// El enlace lleva token HMAC (link_token.ts, genérico — reutilizado tal
// cual, sin cambios): la URL nunca lleva montos ni parámetros editables.
import type { Database } from '../../../packages/shared/src/database.generated.ts'
import { construirCorreoReciboCaja, enviarEmailReciboCaja } from './email_recibo_caja.ts'
import { firmarTokenEnlace } from './link_token.ts'

export const VIGENCIA_ENLACE_DIAS = 30

export interface ResultadoEnvioRecibo {
  enviados: string[]
  omitidosSinEmail: number
  enlace: string
}

/** Tipo estructural mínimo del cliente service_role — mismo criterio que
 * AdminMinimo en envio_estado_cuenta.ts. */
export interface AdminMinimoRecibo {
  from(table: 'recibos_caja'): {
    select(campos: string): {
      eq(col: 'id', val: string): {
        maybeSingle(): PromiseLike<{
          data: {
            id: string
            tenant_id: string
            inmueble_id: string
            folio: string
            datos: {
              tenant_nombre: string
              inmueble_codigo: string
              monto: number
              fecha_pago: string
            }
            created_at: string
          } | null
          error: { message: string } | null
        }>
      }
    }
  }
  from(table: 'inmueble_persona_rol'): {
    select(campos: string): {
      eq(col: 'inmueble_id', val: string): {
        is(col: 'vigente_hasta', val: null): {
          eq(col: 'rol.codigo', val: string): PromiseLike<{
            data: { tercero: { email: string | null } | null }[] | null
            error: { message: string } | null
          }>
        }
      }
    }
  }
  from(table: 'audit_log'): {
    insert(fila: Record<string, unknown>): PromiseLike<{ error: { message: string } | null }>
    select(campos: string): {
      eq(col: 'action' | 'entity_type' | 'entity_id', val: string): {
        gte(col: 'created_at', val: string): {
          limit(n: number): {
            maybeSingle(): PromiseLike<{ data: { id: string } | null; error: { message: string } | null }>
          }
        }
      }
    }
  }
}

export function comoAdminRecibo(
  cliente: ReturnType<typeof import('@supabase/supabase-js')['createClient<Database>']>,
): AdminMinimoRecibo {
  return cliente as unknown as AdminMinimoRecibo
}

export async function fueNotificadoRecientementeRecibo(
  admin: AdminMinimoRecibo,
  id: string,
  ventanaHoras = 12,
): Promise<boolean> {
  const desde = new Date(Date.now() - ventanaHoras * 3600 * 1000).toISOString()
  const { data } = await admin
    .from('audit_log')
    .select('id')
    .eq('action', 'recibo_caja.enviado')
    .eq('entity_type', 'recibos_caja')
    .eq('entity_id', id)
    .gte('created_at', desde)
    .limit(1)
    .maybeSingle()
  return data !== null
}

async function emailsDeDestinatarios(admin: AdminMinimoRecibo, inmuebleId: string): Promise<string[]> {
  const { data, error } = await admin
    .from('inmueble_persona_rol')
    .select('tercero:terceros(email), rol:lista_tipos!inner(codigo)')
    .eq('inmueble_id', inmuebleId)
    .is('vigente_hasta', null)
    .eq('rol.codigo', 'copropietario')
  if (error) throw new Error(`INTERNAL_ERROR: destinatarios — ${error.message}`)

  const emails = new Set<string>()
  for (const fila of data ?? []) {
    const email = fila.tercero?.email
    if (email) emails.add(email.toLowerCase())
  }
  return [...emails]
}

export interface OpcionesEnvioRecibo {
  reenviar?: boolean
  actorId?: string | null
}

export async function enviarReciboCajaPorId(
  admin: AdminMinimoRecibo,
  id: string,
  opts: OpcionesEnvioRecibo = {},
): Promise<ResultadoEnvioRecibo> {
  const appUrl = Deno.env.get('NUXT_PUBLIC_APP_URL') ?? Deno.env.get('APP_URL')
  if (!appUrl) {
    throw new Error('CONFIG_INCOMPLETA: falta NUXT_PUBLIC_APP_URL/APP_URL para armar el enlace.')
  }

  const { data: registro, error } = await admin
    .from('recibos_caja')
    .select('id, tenant_id, inmueble_id, folio, datos, created_at')
    .eq('id', id)
    .maybeSingle()
  if (error) throw new Error(`INTERNAL_ERROR: ${error.message}`)
  if (!registro) {
    throw new Error('RECIBO_CAJA_NO_ENCONTRADO: no existe ese recibo de caja.')
  }

  if (!opts.reenviar && (await fueNotificadoRecientementeRecibo(admin, id))) {
    throw new Error('RECIBO_CAJA_YA_NOTIFICADO: ya se envió hace menos de 12 horas.')
  }

  const token = await firmarTokenEnlace(id, VIGENCIA_ENLACE_DIAS)
  const enlace = `${appUrl}/recibo-caja/${id}?t=${token}`

  const destinatarios = await emailsDeDestinatarios(admin, registro.inmueble_id)

  const enviados: string[] = []
  let errores = 0
  for (const email of destinatarios) {
    const resultado = await enviarEmailReciboCaja({
      email,
      tenantNombre: registro.datos.tenant_nombre,
      inmuebleCodigo: registro.datos.inmueble_codigo,
      monto: Number(registro.datos.monto),
      folio: registro.folio,
      fechaPagoIso: registro.datos.fecha_pago,
      urlDocumento: enlace,
      vigenciaDias: VIGENCIA_ENLACE_DIAS,
    })
    if (resultado.ok) enviados.push(email)
    else errores += 1
  }

  try {
    await admin.from('audit_log').insert({
      tenant_id: registro.tenant_id,
      actor_id: opts.actorId ?? null,
      action: 'recibo_caja.enviado',
      entity_type: 'recibos_caja',
      entity_id: id,
      metadata: {
        enviados,
        omitidos_sin_email: Math.max(destinatarios.length - enviados.length - errores, 0),
        errores_envio: errores,
      },
    })
  } catch {
    // Best-effort — mismo criterio que envio_estado_cuenta.ts.
  }

  if (enviados.length === 0 && errores > 0) {
    throw new Error('EMAIL_SEND_FAILED: ningún correo pudo enviarse.')
  }

  return {
    enviados,
    omitidosSinEmail: Math.max(destinatarios.length - enviados.length - errores, 0),
    enlace,
  }
}
