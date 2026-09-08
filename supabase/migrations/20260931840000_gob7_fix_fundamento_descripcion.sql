-- ═══════════════════════════════════════════════════════════════════════
--  GOB-7 · actualiza la descripción de los dos fundamentos "por verificar"
--  con el hallazgo de investigación real hecho al cerrar el corte — ver
--  GOB_07_INFORME.md primera sección. NO se marca fecha_vigencia (sigue sin
--  confirmarse contra la fuente primaria EXACTA que exige el marco §2,
--  suin-juriscol.gov.co, inalcanzable en esta sesión por un error de
--  certificado SSL) — solo se deja mejor documentado el estado real.
-- ═══════════════════════════════════════════════════════════════════════

update public.fundamento_normativo
set descripcion =
  'Impugnación de decisiones de la asamblea general (administrador, revisor fiscal y '
  'propietarios). Hallazgo 2026-09-07 (fuente: alcaldiabogota.gov.co, portal oficial que espeja '
  'el Diario Oficial — NO es literalmente suin-juriscol.gov.co, que no pudo alcanzarse en esta '
  'sesión por un error de certificado SSL, así que NO se marca esta fila como validada): el '
  'texto vigente del art. 49 no fija ningún plazo — el inciso que remitía al procedimiento del '
  'art. 194 del Código de Comercio fue DEROGADO desde el 1° de enero de 2014 por el art. 626 de '
  'la Ley 1564 de 2012 (Código General del Proceso), que hoy gobierna el trámite judicial (fuera '
  'de alcance de AQUILA, spec §5). Pendiente: confirmar directamente contra suin-juriscol.gov.co '
  'o el Diario Oficial si existe un plazo sustantivo vigente en otra norma antes de fijar '
  'gobierno_parametro_impugnacion.plazo_dias para "decision" con fundamento_normativo_id.'
where referencia = 'ley675_2001_art49_gob7';

update public.fundamento_normativo
set descripcion =
  'Impugnación de sanciones por incumplimiento de obligaciones no pecuniarias. Hallazgo '
  '2026-09-07 (misma fuente y misma reserva que ley675_2001_art49_gob7 — NO es literalmente '
  'suin-juriscol.gov.co): el texto vigente SÍ fija un plazo sustantivo propio, no derogado: '
  '"la impugnación sólo podrá intentarse dentro del mes siguiente a la fecha de la comunicación '
  'de la respectiva sanción" — UN (1) mes, resolviendo la discrepancia de fuentes secundarias '
  'entre uno y dos meses que el propio spec señalaba (GOB_07_impugnacion.md §3). El resto del '
  'artículo (remisión al procedimiento del art. 194 del Código de Comercio) fue derogado desde '
  '2014 por la misma Ley 1564 de 2012, igual que el art. 49 — irrelevante para AQUILA (no '
  'resuelve el trámite judicial). Pendiente: confirmar el mes exacto directamente contra '
  'suin-juriscol.gov.co o el Diario Oficial antes de marcar fundamento_normativo_id como '
  'validado en gobierno_parametro_impugnacion.'
where referencia = 'ley675_2001_art62_gob7';
