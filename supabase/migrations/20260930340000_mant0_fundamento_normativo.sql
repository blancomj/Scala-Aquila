-- ═══════════════════════════════════════════════════════════════════════
--  MANT-0 · Fundamento normativo del bloque contable de activos
--
--  MANT_MARCO_OBLIGATORIO.md §8 exige "normas registradas en
--  fundamento_normativo con artículo, ámbito, fecha y URL primaria" para
--  cualquier corte de esta serie. El diseño de activos.naturaleza_bien
--  (20260930280000) y el guard que bloquea capitalizar un bien común
--  esencial (guard_activo_ficha) descansan enteramente en tres fuentes: la
--  Ley 675 art. 20, el Concepto CTCP 243 de 2025 y el DOT 15 del CTCP. Esta
--  migración las deja registradas como dato del sistema, no solo como cita
--  en un .md — mismo patrón que CO-1 (20260930170000) y PC-7
--  (20260830530000).
--
--  VALIDACIÓN DE PRIMER GRADO — NO lograda en esta sesión: WebFetch falló
--  con "unable to verify the first certificate" contra ctcp.gov.co y con
--  "ECONNREFUSED" contra secretariasenado.gov.co (error de entorno, ya
--  documentado como el mismo problema en 20260930170000, no de las fuentes
--  mismas). El texto del art. 20 y el resumen de doctrina del Concepto 243
--  y del DOT 15 provienen de WebSearch (resultados de búsqueda y
--  agregadores de terceros como accounter.co, ambitojuridico.com), no de
--  haber leído el documento primario completo en esta sesión. Siguiendo
--  MANT_MARCO_OBLIGATORIO.md §1 (prohibición 5, "no inventes obligaciones
--  legales") y CO_01 §7: se registran con fecha_validacion = NULL (estado
--  "sin_validar" en fundamento_validacion_pendiente()) — pregunta abierta
--  para el contador matriculado, no una validación dada por hecha.
--
--  fuente_url: para Ley 675 art. 20 se reutiliza la URL ya presente en el
--  catálogo para el resto de artículos de la misma ley (funcionpublica.gov.co,
--  sembrada en 20260902100000) — no es una URL nueva inventada. Para el DOT
--  15 se registra la página real de ctcp.gov.co localizada por WebSearch
--  (no fetcheada con éxito, pero es la URL genuina de la fuente, no un
--  resumen de tercero). Para el Concepto 243/2025 NO se encontró un enlace
--  directo en ctcp.gov.co — solo agregadores de terceros — así que
--  fuente_url queda NULL en vez de citar un resumen como si fuera primario.
-- ═══════════════════════════════════════════════════════════════════════

insert into public.fundamento_normativo
  (tenant_id, tipo, norma, articulo, descripcion, referencia, fuente_url, fecha_validacion, validado_por)
values
  (
    null, 'ley', 'Ley 675 de 2001', 'Art. 20',
    'Desafectación de bienes comunes no esenciales: requiere autorización municipal/distrital '
    'previa y voto favorable del 70% de los coeficientes de copropiedad en asamblea. Solo tras '
    'esa desafectación un bien común no esencial pasa al dominio particular de la persona '
    'jurídica y puede entrar al balance (MANT-0: activos.naturaleza_bien = '
    '''bien_comun_no_esencial_desafectado''). Los bienes comunes esenciales quedan fuera de este '
    'artículo — nunca se desafectan, nunca se capitalizan (guard_activo_ficha).',
    'ley675_2001_art20',
    'https://www.funcionpublica.gov.co/eva/gestornormativo/norma.php?i=5497',
    null, 'Sesión de agente (Claude), 2026-09-05 — texto vía WebSearch (secretariasenado.gov.co '
    'entre las fuentes), WebFetch falló (ECONNREFUSED) contra el sitio del Senado; pendiente de '
    'revisión por contador matriculado'
  ),
  (
    null, 'orientacion_tecnica', 'CTCP Concepto 243 de 2025', null,
    'Los bienes comunes esenciales de una propiedad horizontal (indivisibles e indispensables '
    'para la existencia del edificio o conjunto) no deben reconocerse como activo en los '
    'estados financieros de la copropiedad, sin importar la vida útil o el umbral de '
    'capitalización que fije el contador. Los bienes comunes no esenciales solo pueden '
    'reconocerse tras su desafectación formal (Ley 675 art. 20). Fundamento directo de '
    'activo_naturaleza_bien_t (MANT-0) y del guard que impide capitalizado=true para '
    '''bien_comun_esencial''.',
    'ctcp_concepto_243_2025',
    null, null, 'Sesión de agente (Claude), 2026-09-05 — vía WebSearch (accounter.co cita el '
    'concepto; no se localizó el enlace directo del documento en ctcp.gov.co en esta sesión); '
    'pendiente de revisión por contador matriculado'
  ),
  (
    null, 'orientacion_tecnica', 'CTCP Documento de Orientación Técnica DOT 15', null,
    'Propiedades horizontales de uso residencial o mixto (Grupos 2 y 3): guía de preparación y '
    'presentación de información financiera, incluida la distinción y el tratamiento de bienes '
    'comunes esenciales frente a no esenciales, y de su reparación, construcción o fabricación. '
    'Marco de referencia general que MANT-0 aplica de forma acotada al reconocimiento inicial y '
    'la depreciación de activos.',
    'ctcp_dot_15_ph',
    'https://www.ctcp.gov.co/publicaciones-ctcp/orientaciones-tecnicas/1472852138-4188',
    null, 'Sesión de agente (Claude), 2026-09-05 — página localizada directamente en ctcp.gov.co '
    'vía WebSearch, WebFetch falló (unable to verify the first certificate) al intentar leer el '
    'contenido; pendiente de revisión por contador matriculado'
  );
