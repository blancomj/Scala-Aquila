// Núcleo de envío del estado de cuenta por correo — D-28. Compartido por
// enviar-estado-cuenta (gatillo manual del administrador) y
// enviar-estados-cuenta-pendientes (batch post-liquidación, FUERA de la
// transacción de fn_aplicar_liquidacion — enviar correos dentro del cierre
// contable rompería el apply si Brevo falla).
//
// Deduplicación SIN columnas mutables: estados_cuenta_generados es append-only
// por doctrina (SEC-14), así que el rastro "este documento ya se notificó"
// vive en audit_log ('estado_cuenta.enviado', entity_id = id). La consulta de
// pendientes y el guard anti-doble-envío leen ese rastro; nada se actualiza.
//
// El enlace que recibe el propietario lleva token HMAC (link_token.ts, D-27):
// la URL nunca lleva montos ni parámetros editables — el visor resuelve todo
// desde el snapshot sellado.
import type { Database } from '../../../packages/shared/src/database.generated.ts'
import { construirCorreoEstadoCuenta, enviarEmailEstadoCuenta } from './email_estado_cuenta.ts'
import { firmarTokenEnlace } from './link_token.ts'

export const VIGENCIA_ENLACE_DIAS = 30

export interface ResultadoEnvio {
  enviados: string[]
  omitidosSinEmail: number
  /** Enlace firmado — se devuelve siempre para que el administrador pueda
   * compartirlo manualmente aunque no hubiera correos destino. */
  enlace: string
}

/** Tipo estructural mínimo del cliente service_role (mismo criterio que
 * ClienteConRpc en rate_limit.ts — evita acoplar al tipo exacto generado). */
export interface AdminMinimo {
  from(table: 'estados_cuenta_generados'): {
    select(campos: string): {
      eq(col: 'id', val: string): {
        maybeSingle(): PromiseLike<{
          data: {
            id: string
            tenant_id: string
            inmueble_id: string
            datos: {
              tenant_nombre: string
              tenant_nit: string | null
              inmueble_codigo: string
              saldo_final: number
              generado_en: string
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

// El cliente real (createClient<Database>) satisface AdminMinimo estructuralmente;
// este cast es el punto único de conversión y está documentado a propósito.
export function comoAdmin(cliente: ReturnType<typeof import('@supabase/supabase-js')['createClient<Database>']>): AdminMinimo {
  return cliente as unknown as AdminMinimo
}

/** ¿Se notificó ya este documento dentro de la ventana anti-duplicado? */
export async function fueNotificadoRecientemente(
  admin: AdminMinimo,
  id: string,
  ventanaHoras = 12,
): Promise<boolean> {
  const desde = new Date(Date.now() - ventanaHoras * 3600 * 1000).toISOString()
  const { data } = await admin
    .from('audit_log')
    .select('id')
    .eq('action', 'estado_cuenta.enviado')
    .eq('entity_type', 'estados_cuenta_generados')
    .eq('entity_id', id)
    .gte('created_at', desde)
    .limit(1)
    .maybeSingle()
  return data !== null
}

/** Propietarios vigentes con email — misma definición de "vigente" que
 * cargarPropietarios en apps/web (inmueble_persona_rol sin vigente_hasta, rol
 * copropietario). `recibe_notificaciones` existe pero es nueva y nullable:
 * filtrarla aquí excluiría a todos los NULL; se activará cuando la columna
 * tenga backfill (documentado en D-28). */
async function emailsDeDestinatarios(admin: AdminMinimo, inmuebleId: string): Promise<string[]> {
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

export interface OpcionesEnvio {
  reenviar?: boolean
  actorId?: string | null
  viaBatch?: boolean
}

/** Envía el correo del estado de cuenta a los destinatarios vigentes.
 * Lanza Error con mensaje `CODIGO: mensaje` en fallos estructurales — los
 * callers lo mapean con parsearErrorRpc(). */
export async function enviarEstadoCuentaPorId(
  admin: AdminMinimo,
  id: string,
  opts: OpcionesEnvio = {},
): Promise<ResultadoEnvio> {
  const appUrl = Deno.env.get('NUXT_PUBLIC_APP_URL') ?? Deno.env.get('APP_URL')
  if (!appUrl) {
    throw new Error('CONFIG_INCOMPLETA: falta NUXT_PUBLIC_APP_URL/APP_URL para armar el enlace.')
  }

  const { data: registro, error } = await admin
    .from('estados_cuenta_generados')
    .select('id, tenant_id, inmueble_id, datos, created_at')
    .eq('id', id)
    .maybeSingle()
  if (error) throw new Error(`INTERNAL_ERROR: ${error.message}`)
  if (!registro) {
    throw new Error('ESTADO_CUENTA_NO_ENCONTRADO: no existe ese estado de cuenta.')
  }

  if (!opts.reenviar && (await fueNotificadoRecientemente(admin, id))) {
    throw new Error('ESTADO_CUENTA_YA_NOTIFICADO: ya se envió hace menos de 12 horas.')
  }

  // Token firmado para el enlace público (D-27) — la URL jamás lleva montos.
  const token = await firmarTokenEnlace(id, VIGENCIA_ENLACE_DIAS)
  const enlace = `${appUrl}/comprobante-cuenta/${id}?t=${token}`

  const destinatarios = await emailsDeDestinatarios(admin, registro.inmueble_id)

  const enviados: string[] = []
  let errores = 0
  for (const email of destinatarios) {
    const resultado = await enviarEmailEstadoCuenta({
      email,
      tenantNombre: registro.datos.tenant_nombre,
      inmuebleCodigo: registro.datos.inmueble_codigo,
      saldoFinal: Number(registro.datos.saldo_final),
      corteIso: registro.datos.generado_en,
      urlDocumento: enlace,
      vigenciaDias: VIGENCIA_ENLACE_DIAS,
    })
    if (resultado.ok) enviados.push(email)
    else errores += 1
  }

  // Rastro del envío (dedupe futuro + auditoría) — best-effort: el correo real
  // ya salió; un fallo de auditoría no lo revierte ni lo repite.
  try {
    await admin.from('audit_log').insert({
      tenant_id: registro.tenant_id,
      actor_id: opts.actorId ?? null,
      action: 'estado_cuenta.enviado',
      entity_type: 'estados_cuenta_generados',
      entity_id: id,
      metadata: {
        enviados,
        omitidos_sin_email: Math.max(destinatarios.length - enviados.length - errores, 0),
        errores_envio: errores,
        via_batch: opts.viaBatch ?? false,
      },
    })
  } catch {
    // Sin política de escritura debería ser imposible fallar desde
    // service_role; si ocurre, los logs del proceso ya recogieron el envío.
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
