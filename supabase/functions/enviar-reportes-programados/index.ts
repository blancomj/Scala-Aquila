// Despachador de reportes programados — RPT-05 (PLAN_MOTOR_REPORTES.md §6).
//
// Lo invoca `cron_reportes_programados()` cada 15 minutos cuando hay algo
// vencido, con secreto compartido en cabecera (CRON_SECRET): no hay persona
// detrás, así que no hay JWT que validar. Mismo patrón que
// `enviar-estados-cuenta-pendientes`.
//
// EL RENDERER ES EL MISMO QUE EL DEL NAVEGADOR
// ───────────────────────────────────────────
// `@aquila/reporting` (RPT-03) construye la hoja y el CSV como DATO, sin
// importar `xlsx` ni tocar el DOM. Por eso el mismo código que arma la
// descarga del Centro de Reportes arma el adjunto de este correo, y una
// cifra no puede salir escrita de dos maneras según por dónde salga. Era la
// razón declarada de que el paquete no dependiera del navegador; aquí se
// cobra.
//
// AISLAMIENTO: esta función corre con service_role, que ATRAVIESA la RLS.
// Por eso `fn_reporte_ejecutar` exige `p_tenant_id` desde RPT-05 (D-141) y
// antepone el filtro de copropiedad él mismo. Sin eso, este archivo habría
// enviado por correo los datos de todas las copropiedades del proyecto.
//
// UN FALLO NO ARRASTRA A LOS DEMÁS: cada programación va en su propio
// try/catch y cada destinatario deja su fila en `reporte_entregas` con lo
// que pasó. Una corrida que revienta entera por un buzón lleno sería peor
// que no tener entrega programada.
import { createClient } from '@supabase/supabase-js'
import * as XLSX from 'xlsx'
import type { Database } from '../../../packages/shared/src/database.generated.ts'
import { aCsv, construirHoja, definicionEjecutable, parametrosSinValor } from '../../../packages/reporting/dist/index.js'
// Los TIPOS se toman del fuente, no del `dist`: Deno no asocia un `.d.ts`
// vecino a un `.js` sin una directiva expresa. Es el mismo criterio con el
// que todas las funciones de este repo importan `Database`.
import type {
  ColumnaReporte,
  EncabezadoReporte,
  FilaReporte,
} from '../../../packages/reporting/src/tipos.ts'
import type { DefinicionReporte } from '../../../packages/reporting/src/definicion.ts'

import { errorResponse, jsonResponse } from '../_shared/http.ts'
import { enviarEmailReporte } from '../_shared/email_reporte.ts'

/**
 * Lo que `construirHoja` devuelve. Se declara aquí porque el valor llega de
 * `dist/index.js` y Deno no asocia el `.d.ts` vecino: dentro de ese `.d.ts`
 * los reexports apuntan a `./tipos.js`, que para Deno es el JS sin tipos.
 * Escribirlo explícito, además, deja el contrato a la vista en la frontera.
 */
interface HojaPlano {
  nombre: string
  celdas: unknown[][]
  anchos: number[]
  formatos: (string | undefined)[]
  filaEncabezados: number
  nombreArchivo: string
}

/** Tope por corrida: predecible y acotado ante un backlog. */
const LIMITE_POR_CORRIDA = 20
/** Filas por reporte enviado. Un adjunto no es un volcado de la base. */
const LIMITE_FILAS = 5000
/** Retención del artefacto en Storage. */
const DIAS_RETENCION = 30

interface Programacion {
  id: string
  tenant_id: string
  reporte_id: string
  nombre: string
  formato: 'xlsx' | 'csv'
  parametros: Record<string, string>
  zona_horaria: string
}

interface ResultadoEjecucion {
  filas: FilaReporte[]
  total_filas: number
  duracion_ms: number
}

interface Destinatario {
  profileId: string
  correo: string
  nombre: string | null
}

async function sha256Hex(bytes: Uint8Array): Promise<string> {
  // `slice()` devuelve una copia con `ArrayBuffer` propio: sin ella el tipo
  // es `ArrayBufferLike`, que podría ser `SharedArrayBuffer`, y `digest` no
  // lo acepta.
  const hash = await crypto.subtle.digest('SHA-256', bytes.slice().buffer)
  return [...new Uint8Array(hash)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

/**
 * Arma el archivo. El CSV sale del paquete tal cual; el XLSX toma la matriz
 * que el paquete construye y solo la materializa — la decisión de qué va en
 * cada celda ya está tomada y probada en `packages/reporting`.
 */
function materializar(
  formato: 'xlsx' | 'csv',
  columnas: ColumnaReporte[],
  filas: FilaReporte[],
  encabezado: EncabezadoReporte,
): { bytes: Uint8Array; nombre: string; mime: string } {
  if (formato === 'csv') {
    const texto = aCsv(columnas, filas)
    const plano = construirHoja(columnas, filas, encabezado) as HojaPlano
    return {
      bytes: new TextEncoder().encode(texto),
      nombre: plano.nombreArchivo.replace(/\.xlsx$/, '.csv'),
      mime: 'text/csv',
    }
  }

  const plano = construirHoja(columnas, filas, encabezado) as HojaPlano
  const hoja = XLSX.utils.aoa_to_sheet(plano.celdas as unknown[][])
  hoja['!cols'] = plano.anchos.map((wch) => ({ wch }))

  // Mismo formato de celda que la exportación del navegador: sin esto los
  // montos llegan como números pelados y la columna no se lee igual.
  const primeraFilaDatos = plano.filaEncabezados + 1
  plano.formatos.forEach((formatoCelda, columna) => {
    if (!formatoCelda) return
    for (let fila = primeraFilaDatos; fila < plano.celdas.length; fila += 1) {
      const celda = hoja[XLSX.utils.encode_cell({ r: fila, c: columna })] as
        | { t?: string; z?: string }
        | undefined
      if (celda && celda.t === 'n') celda.z = formatoCelda
    }
  })

  const libro = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(libro, hoja, plano.nombre)
  const bytes = new Uint8Array(XLSX.write(libro, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer)
  return {
    bytes,
    nombre: plano.nombreArchivo,
    mime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  }
}

function cuerpoCorreo(programacion: Programacion, copropiedad: string, filas: number): string {
  return `<p>Hola,</p>
<p>Adjunto encontrarás <strong>${programacion.nombre}</strong> de <strong>${copropiedad}</strong>,
generado automáticamente.</p>
<p>${String(filas)} ${filas === 1 ? 'registro' : 'registros'}.</p>
<p style="color:#6b7280;font-size:12px">Este informe se envía porque estás suscrito a su
programación. Puedes darte de baja desde el Centro de Reportes.</p>`
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

  const { data: debidas, error: errorDebidas } = await admin.rpc(
    'fn_reporte_programaciones_debidas',
    { p_limite: LIMITE_POR_CORRIDA },
  )
  if (errorDebidas) {
    return errorResponse(500, 'INTERNAL_ERROR', errorDebidas.message, undefined, correlationId)
  }

  const resumen: { programacion: string; estado: string; detalle?: string }[] = []

  for (const fila of (debidas ?? []) as unknown as Programacion[]) {
    try {
      await procesar(admin, fila, resumen)
    } catch (excepcion) {
      const detalle = excepcion instanceof Error ? excepcion.message : String(excepcion)
      resumen.push({ programacion: fila.id, estado: 'fallida', detalle })
    } finally {
      // SIEMPRE, con éxito o con fallo: si no se marcara, una programación
      // que falla se reintentaría cada 15 minutos para siempre.
      await admin.rpc('fn_reporte_programacion_registrar_corrida', {
        p_programacion_id: fila.id,
      })
    }
  }

  return jsonResponse({ procesadas: resumen.length, resumen }, 200, correlationId)
})

async function procesar(
  admin: ReturnType<typeof createClient<Database>>,
  programacion: Programacion,
  resumen: { programacion: string; estado: string; detalle?: string }[],
): Promise<void> {
  // ── Definición vigente ───────────────────────────────────────────────
  const { data: version, error: errorVersion } = await admin
    .from('reporte_versiones')
    .select('id, version, definicion')
    .eq('reporte_id', programacion.reporte_id)
    .eq('estado', 'publicada')
    .order('version', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (errorVersion) throw new Error(errorVersion.message)
  if (!version) {
    resumen.push({
      programacion: programacion.id,
      estado: 'omitida',
      detalle: 'el reporte no tiene versión publicada',
    })
    return
  }

  const { data: tenant } = await admin
    .from('tenants')
    .select('name')
    .eq('id', programacion.tenant_id)
    .single()

  // ── Parámetros: de referencia a valor ────────────────────────────────
  // El compilador solo entiende filtros CON VALOR; la definición los guarda
  // por referencia («entre el parámetro desde y el parámetro hasta»). Sin
  // este paso la corrida NO falla: devuelve cero filas y sale un informe
  // vacío con pinta de informe. Es exactamente lo que pasó en la primera
  // prueba de punta a punta, y por eso la traducción vive ahora en
  // `@aquila/reporting`, donde la usan el navegador y este despachador.
  const definicionGuardada = version.definicion as unknown as DefinicionReporte
  const faltantes = parametrosSinValor(definicionGuardada, programacion.parametros)
  if (faltantes.length > 0) {
    resumen.push({
      programacion: programacion.id,
      estado: 'omitida',
      detalle: `faltan parámetros obligatorios: ${faltantes.join(', ')}`,
    })
    return
  }

  // ── Ejecutar ─────────────────────────────────────────────────────────
  const iniciado = Date.now()
  const { data: salida, error: errorRpc } = await admin.rpc('fn_reporte_ejecutar', {
    p_definicion: definicionEjecutable(definicionGuardada, programacion.parametros) as never,
    // Obligatorio: esta función atraviesa la RLS (D-141).
    p_tenant_id: programacion.tenant_id,
    p_limite: LIMITE_FILAS,
  })

  const resultado = salida as unknown as ResultadoEjecucion | null

  const { data: ejecucion } = await admin
    .from('reporte_ejecuciones')
    .insert({
      tenant_id: programacion.tenant_id,
      reporte_id: programacion.reporte_id,
      version_id: version.id,
      parametros: programacion.parametros as never,
      origen: 'programada',
      formato: programacion.formato,
      ejecutado_por: null,
      duracion_ms: resultado?.duracion_ms ?? Date.now() - iniciado,
      filas: resultado?.total_filas ?? null,
      exito: !errorRpc,
      error_codigo: errorRpc ? (errorRpc.message.split(':')[0] ?? 'RPT_ERROR') : null,
    })
    .select('id')
    .single()

  if (errorRpc || !resultado) {
    resumen.push({
      programacion: programacion.id,
      estado: 'fallida',
      detalle: errorRpc?.message ?? 'sin resultado',
    })
    return
  }

  // ── Columnas con su tipo, igual que en el navegador ──────────────────
  const { data: fuente } = await admin
    .from('reporte_fuentes')
    .select('codigo, reporte_campos(codigo, etiqueta, tipo_dato)')
    .eq('codigo', definicionGuardada.fuente)
    .single()

  const meta = new Map(
    ((fuente?.reporte_campos ?? []) as unknown as {
      codigo: string
      etiqueta: string
      tipo_dato: ColumnaReporte['tipo']
    }[]).map((c) => [c.codigo, c]),
  )
  const columnas: ColumnaReporte[] = definicionGuardada.campos.map((campo) => ({
    clave: campo.campo,
    etiqueta: campo.alias || meta.get(campo.campo)?.etiqueta || campo.campo,
    tipo: meta.get(campo.campo)?.tipo_dato ?? 'texto',
  }))

  const encabezado: EncabezadoReporte = {
    titulo: programacion.nombre,
    copropiedad: tenant?.name ?? '',
    version: version.version,
    generadoEn: new Date(),
    parametros: programacion.parametros,
    // El sello dice cuándo se produjo: en la hora de la copropiedad, no en
    // la del servidor, que corre en UTC.
    zonaHoraria: programacion.zona_horaria,
  }

  const archivo = materializar(programacion.formato, columnas, resultado.filas, encabezado)

  // ── Archivar el artefacto (RPT-04) ───────────────────────────────────
  const rutaStorage = `${programacion.tenant_id}/${ejecucion?.id ?? crypto.randomUUID()}.${
    programacion.formato
  }`
  const { error: errorSubida } = await admin.storage
    .from('reportes')
    .upload(rutaStorage, archivo.bytes, { contentType: archivo.mime, upsert: true })

  if (!errorSubida && ejecucion) {
    const expira = new Date(Date.now() + DIAS_RETENCION * 86_400_000)
    await admin.from('reporte_artefactos').insert({
      tenant_id: programacion.tenant_id,
      ejecucion_id: ejecucion.id,
      storage_path: rutaStorage,
      mime: archivo.mime,
      bytes: archivo.bytes.length,
      sha256: await sha256Hex(archivo.bytes),
      expira_at: expira.toISOString(),
    })
  }

  // ── Destinatarios: los suscriptores, con su correo de hoy ────────────
  const { data: suscritos } = await admin
    .from('reporte_suscripciones')
    .select('profile_id, profiles(email, full_name)')
    .eq('programacion_id', programacion.id)

  const destinatarios: Destinatario[] = ((suscritos ?? []) as unknown as {
    profile_id: string
    profiles: { email: string | null; full_name: string | null } | null
  }[])
    .filter((s) => Boolean(s.profiles?.email))
    .map((s) => ({
      profileId: s.profile_id,
      correo: s.profiles!.email!,
      nombre: s.profiles!.full_name,
    }))

  if (destinatarios.length === 0) {
    await admin.from('reporte_entregas').insert({
      tenant_id: programacion.tenant_id,
      programacion_id: programacion.id,
      ejecucion_id: ejecucion?.id ?? null,
      destinatario: '(sin suscriptores)',
      estado: 'omitida',
      detalle: 'la programación no tiene suscriptores con correo registrado',
    })
    resumen.push({ programacion: programacion.id, estado: 'omitida', detalle: 'sin suscriptores' })
    return
  }

  const html = cuerpoCorreo(programacion, tenant?.name ?? '', resultado.total_filas)
  let enviados = 0

  for (const destinatario of destinatarios) {
    const envio = await enviarEmailReporte({
      to: destinatario.correo,
      destinatarioNombre: destinatario.nombre,
      subject: `${programacion.nombre} — ${tenant?.name ?? ''}`.trim(),
      html,
      adjunto: { nombre: archivo.nombre, contenido: archivo.bytes },
      reference: programacion.id,
    })

    await admin.from('reporte_entregas').insert({
      tenant_id: programacion.tenant_id,
      programacion_id: programacion.id,
      ejecucion_id: ejecucion?.id ?? null,
      // Congelado: el correo al que salió de verdad, no una referencia.
      destinatario: destinatario.correo,
      profile_id: destinatario.profileId,
      estado: envio.success ? 'enviada' : 'fallida',
      detalle: envio.errorMessage ?? null,
    })

    if (envio.success) enviados += 1
  }

  resumen.push({
    programacion: programacion.id,
    estado: enviados > 0 ? 'enviada' : 'fallida',
    detalle: `${String(enviados)}/${String(destinatarios.length)} destinatario(s)`,
  })
}
