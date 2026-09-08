-- ═══════════════════════════════════════════════════════════════════════
--  GOB-5 · Decisión y compromisos — vocabulario
--  Ver GOB_05_decision_compromisos.md §4.1, §4.2.
--
--  Solo dos enums: el estado de la decisión y el del compromiso gobiernan
--  transiciones reales (D-24) — a diferencia de GOB-2/GOB-4, este corte no
--  siembra ningún catálogo lista_tipos nuevo (no hay vocabulario descriptivo
--  que lo amerite: "prioridad" del §4.1 queda como texto libre, ver comentario
--  de columna en gobierno_decisiones).
--
--  Los fundamentos legales que este corte invoca (Ley 675 art. 45, 47, 51)
--  YA están registrados en fundamento_normativo: art. 45 por GOB-3
--  (referencia 'ley675_2001_art45_gob3'), art. 47 por GOB-4
--  ('ley675_2001_art47_gob4') y art. 51 por GOB-1 ('ley675_2001_art51_gob1')
--  — no se duplican aquí.
-- ═══════════════════════════════════════════════════════════════════════

create type public.gobierno_decision_estado_t as enum ('vigente', 'anulada', 'revocada', 'impugnada');

comment on type public.gobierno_decision_estado_t is
  'D-24: FSM de gobierno_decisiones. Nace vigente (nunca hay borrador: solo nace de una votación '
  'ya cerrada y aprobada, DECISION_SIN_VOTACION_APROBADA). vigente→revocada la dispara '
  'gobierno_revocar_decision (enlaza la decisión revocatoria vía revoca_decision_id sobre la '
  'nueva fila). impugnada la escribe GOB-7 (aquí solo se declara el valor, sin función que la '
  'asigne). anulada se declara para la nulidad de origen del art. 45 pero ninguna función de '
  'este corte la asigna — ninguna de las 13 pruebas del corte lo exige y el spec no da una regla '
  'operativa de cuándo/quién la dispara fuera de la revocación explícita (ver GOB_05_INFORME.md, '
  'pregunta abierta).';

create type public.gobierno_compromiso_estado_t as enum
  ('pendiente', 'en_progreso', 'bloqueado', 'cumplido', 'cancelado');

comment on type public.gobierno_compromiso_estado_t is
  'D-24: FSM de gobierno_compromisos. cumplido exige al menos un avance con evidencia '
  '(documento_id no nulo en gobierno_compromiso_avances) — COMPROMISO_CUMPLIDO_SIN_EVIDENCIA. '
  'bloqueado/cancelado exigen motivo (check constraint). "vencido" NO es un estado de este enum '
  '— es una condición derivada de fecha_limite < hoy con estado no terminal, calculada por '
  'gobierno_decision_ejecucion(), nunca almacenada (spec §4.2, principio §6.3 del marco).';
