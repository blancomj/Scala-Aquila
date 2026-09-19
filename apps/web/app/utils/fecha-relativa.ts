/**
 * Puente de mando (PROMPT_PUENTE_DE_MANDO.md §6.7 caso 6) — "hace 9 días",
 * "quedan 12 días" son relativos a *ahora*, no al momento de la carga, y
 * `fecha_vencimiento` es un `date`, no un `timestamptz`: `new Date('2026-10-05')`
 * se parsea como UTC y en Colombia (UTC−5) retrocede al día 4. Estas dos
 * funciones parsean por componentes en vez de dejar que el motor de JS decida
 * la zona horaria.
 */

/** Acepta 'YYYY-MM-DD' o un ISO con hora — en ambos casos toma solo la fecha
 * (los primeros 10 caracteres) y construye un Date en la medianoche LOCAL,
 * nunca en UTC. */
export function parsearFechaLocal(fecha: string): Date {
  const [anio, mes, dia] = fecha.slice(0, 10).split('-').map(Number)
  return new Date(anio ?? 1970, (mes ?? 1) - 1, dia ?? 1)
}

/** 'YYYY-MM-DD' de HOY en la zona horaria LOCAL del navegador — nunca
 * `new Date().toISOString().slice(0, 10)`, que da la fecha en UTC y se
 * adelanta un día completo en Colombia (UTC−5) entre las 19:00 y medianoche. */
export function hoyLocal(ahora: Date = new Date()): string {
  const anio = String(ahora.getFullYear()).padStart(4, '0')
  const mes = String(ahora.getMonth() + 1).padStart(2, '0')
  const dia = String(ahora.getDate()).padStart(2, '0')
  return `${anio}-${mes}-${dia}`
}

/** Días con signo entre `fecha` y `ahora` (positivo = en el futuro). Ambas
 * fechas se truncan a medianoche local antes de restar, así que "hoy" da 0
 * sin importar la hora del día. */
export function diasDesdeHoy(fecha: string, ahora: Date = new Date()): number {
  const destino = parsearFechaLocal(fecha)
  const hoyLocal = new Date(ahora.getFullYear(), ahora.getMonth(), ahora.getDate())
  const msPorDia = 1000 * 60 * 60 * 24
  return Math.round((destino.getTime() - hoyLocal.getTime()) / msPorDia)
}

/** "hace 9 días" / "hoy" / "en 12 días", genérico para metadatos en
 * `text-dimmed`. `dias` ya calculado con `diasDesdeHoy` (o su negativo para
 * antigüedad). */
export function textoDias(dias: number, sufijoFuturo: string, sufijoPasado: string): string {
  if (dias === 0) return 'hoy'
  if (dias > 0) return `${sufijoFuturo} ${String(dias)} día${dias === 1 ? '' : 's'}`
  const abs = Math.abs(dias)
  return `${sufijoPasado} ${String(abs)} día${abs === 1 ? '' : 's'}`
}

/** "hace 2 minutos", "hace 3 horas", "hace 5 días" — siempre PASADO (para el
 * sello de frescura y `created_at`, que nunca están en el futuro). */
export function relativoCorto(iso: string, ahora: Date = new Date()): string {
  const ms = ahora.getTime() - new Date(iso).getTime()
  const minutos = Math.round(ms / 60_000)
  if (minutos < 1) return 'hace un momento'
  if (minutos < 60) return `hace ${String(minutos)} minuto${minutos === 1 ? '' : 's'}`
  const horas = Math.round(minutos / 60)
  if (horas < 24) return `hace ${String(horas)} hora${horas === 1 ? '' : 's'}`
  const dias = Math.round(horas / 24)
  return `hace ${String(dias)} día${dias === 1 ? '' : 's'}`
}

/** Igual que `relativoCorto`, pero admite `iso` en el futuro (`vence_at`):
 * "vence en 2 horas" / "venció hace 2 horas". `vencido` distingue el signo
 * para que el llamador pueda pintarlo en `warning`. */
export function relativoConVencimiento(
  iso: string,
  ahora: Date = new Date(),
): { texto: string; vencido: boolean } {
  const ms = ahora.getTime() - new Date(iso).getTime()
  const vencido = ms >= 0
  const absMs = Math.abs(ms)
  const minutos = Math.round(absMs / 60_000)
  let cantidad: string
  if (minutos < 1) cantidad = 'un momento'
  else if (minutos < 60) cantidad = `${String(minutos)} minuto${minutos === 1 ? '' : 's'}`
  else if (minutos < 60 * 24) {
    const horas = Math.round(minutos / 60)
    cantidad = `${String(horas)} hora${horas === 1 ? '' : 's'}`
  } else {
    const dias = Math.round(minutos / (60 * 24))
    cantidad = `${String(dias)} día${dias === 1 ? '' : 's'}`
  }
  return { texto: vencido ? `venció hace ${cantidad}` : `vence en ${cantidad}`, vencido }
}
