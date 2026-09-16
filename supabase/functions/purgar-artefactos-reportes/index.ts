// Barrido de retención de artefactos de reporte — RPT-05.
//
// Lo invoca `cron_reportes_purgar_artefactos()` una vez al día cuando hay
// retenciones vencidas, con secreto compartido en cabecera: no hay persona
// detrás. Mismo patrón que `enviar-estados-cuenta-pendientes`.
//
// POR QUÉ NO ES UN DELETE EN SQL
// ──────────────────────────────
// Storage guarda el binario fuera de la base; borrar la fila de
// `storage.objects` dejaría el archivo en disco y la copropiedad creyendo
// que purgó. Solo la API de Storage sabe dónde vive el archivo, y solo
// `service_role` puede llamarla sobre un bucket privado.
//
// LA FILA NO SE BORRA: SE MARCA
// ─────────────────────────────
// `purgado_at` deja el rastro. El historial de RPT-04 puede entonces decir
// «produjo un XLSX de 33 KB que expiró el 16 de octubre» en vez de fingir
// que nunca hubo archivo — que es justo lo que pide el plan cuando dice que
// el historial sobrevive al archivo expirado.
//
// UN ARCHIVO QUE YA NO ESTÁ TAMBIÉN SE MARCA. Si alguien lo borró a mano, o
// un barrido anterior se cayó entre el borrado y la marca, el objetivo ya
// está cumplido: lo que no puede pasar es que la fila quede vencida para
// siempre y el barrido la reintente cada día.
import { createClient } from '@supabase/supabase-js'
import type { Database } from '../../../packages/shared/src/database.generated.ts'
import { errorResponse, jsonResponse } from '../_shared/http.ts'

/** Tope por corrida: predecible ante un backlog grande. */
const LIMITE_POR_CORRIDA = 200

interface Vencido {
  id: string
  tenant_id: string
  storage_path: string
  expira_at: string
}

Deno.serve(async (req) => {
  const correlationId = crypto.randomUUID()

  const secreto = Deno.env.get('CRON_SECRET')
  if (!secreto || req.headers.get('x-cron-secret') !== secreto) {
    return errorResponse(403, 'FORBIDDEN', 'No autorizado.', undefined, correlationId)
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  if (!supabaseUrl || !serviceKey) {
    return errorResponse(500, 'INTERNAL_ERROR', 'Configuración incompleta.', undefined, correlationId)
  }
  const admin = createClient<Database>(supabaseUrl, serviceKey)

  const { data: vencidos, error: errorVencidos } = await admin.rpc(
    'fn_reporte_artefactos_vencidos',
    { p_limite: LIMITE_POR_CORRIDA },
  )
  if (errorVencidos) {
    return errorResponse(500, 'INTERNAL_ERROR', errorVencidos.message, undefined, correlationId)
  }

  const lista = (vencidos ?? []) as unknown as Vencido[]
  let purgados = 0
  const fallidos: { id: string; detalle: string }[] = []

  for (const artefacto of lista) {
    const { error: errorBorrado } = await admin.storage
      .from('reportes')
      .remove([artefacto.storage_path])

    if (errorBorrado) {
      // Un archivo que ya no existe no es un fallo: el objetivo está
      // cumplido y hay que marcarlo, o el barrido lo reintentaría cada día.
      const yaNoEstaba = /not found|does not exist/i.test(errorBorrado.message)
      if (!yaNoEstaba) {
        fallidos.push({ id: artefacto.id, detalle: errorBorrado.message })
        continue
      }
    }

    const { error: errorMarca } = await admin.rpc('fn_reporte_artefacto_marcar_purgado', {
      p_artefacto_id: artefacto.id,
    })
    if (errorMarca) {
      fallidos.push({ id: artefacto.id, detalle: errorMarca.message })
      continue
    }
    purgados += 1
  }

  return jsonResponse(
    { vencidos: lista.length, purgados, fallidos },
    200,
    correlationId,
  )
})
