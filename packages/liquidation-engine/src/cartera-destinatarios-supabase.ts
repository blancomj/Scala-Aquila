/**
 * I/O Supabase de la resolución de destinatario — mismo nivel de
 * autorización que cartera-cobranza-supabase.ts (D-14, vigilado por
 * eslint.config.js).
 *
 * REC-CAR-004: no decide nada. Lee las relaciones persona-predio con el
 * contacto del tercero y se las entrega a resolverDestinatarios(), que es
 * quien aplica las reglas R1-R4 (cartera-destinatarios.ts).
 */
import type { AquilaClient } from '@aquila/shared'
import type { RelacionInmueblePersona } from './cartera-destinatarios.js'

/**
 * Relaciones del inmueble con su contacto, listas para resolver.
 *
 * No se filtra la vigencia en SQL a propósito: `resolverDestinatarios()`
 * recibe `fechaCorte` explícita (REC-CAR-008) y decide con ella, de modo
 * que una corrida con fecha de corte pasada resuelve exactamente los
 * destinatarios que correspondían ese día. Filtrar aquí con `now()`
 * rompería esa reproducibilidad — es el mismo error que AD-32 prohíbe.
 */
export async function obtenerRelacionesInmueble(
  cliente: AquilaClient,
  opciones: { tenantId: string; inmuebleId: string },
): Promise<RelacionInmueblePersona[]> {
  const { data, error } = await cliente
    .from('inmueble_persona_rol')
    .select(
      `tercero_id, porcentaje, es_pagador, recibe_notificaciones, vigente_desde, vigente_hasta,
       rol:lista_tipos!inmueble_persona_rol_rol_id_fkey ( codigo ),
       tercero:terceros!inmueble_persona_rol_tercero_id_fkey (
         email, telefono, direccion, municipio, direccion_verificada_at
       )`,
    )
    .eq('tenant_id', opciones.tenantId)
    .eq('inmueble_id', opciones.inmuebleId)

  if (error) {
    throw new Error(
      `No se pudieron leer las relaciones persona-predio del inmueble ${opciones.inmuebleId}: ${error.message}`,
    )
  }

  return data.map((fila): RelacionInmueblePersona => {
    // `rol` y `tercero` vienen de FK not null, así que el tipo generado
    // los da siempre presentes — no se agrega una guarda defensiva que el
    // compilador ya descartó.
    const rol = fila.rol
    const tercero = fila.tercero

    return {
      terceroId: fila.tercero_id,
      rolCodigo: rol.codigo,
      porcentaje: fila.porcentaje,
      esPagador: fila.es_pagador,
      recibeNotificaciones: fila.recibe_notificaciones,
      vigenteDesde: fila.vigente_desde,
      vigenteHasta: fila.vigente_hasta,
      email: tercero.email,
      telefono: tercero.telefono,
      direccion: tercero.direccion,
      municipio: tercero.municipio,
      direccionVerificadaAt: tercero.direccion_verificada_at,
    }
  })
}
