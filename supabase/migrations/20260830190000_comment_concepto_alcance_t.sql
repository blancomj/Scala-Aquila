-- ═══════════════════════════════════════════════════════════════════════
--  D-24: todo enum nuevo exige COMMENT ON TYPE que justifique por qué no
--  es una familia de lista_tipos — el test de gobernanza
--  (tests/governance/enum-lista-tipos-coverage.test.ts) lo hizo cumplir
--  para concepto_alcance_t (20260830180000), que se creó sin él.
-- ═══════════════════════════════════════════════════════════════════════

comment on type public.concepto_alcance_t is
  'todos: el concepto aplica a todos los inmuebles (comportamiento actual, sin cambios). '
  'calculado: aplica solo a los que cumplen alcance_condiciones — el executor filtra '
  'snapshot.inmuebles antes de calcular/repartir, y en modo_calculo=distribucion el '
  'reparto se recalcula solo sobre ese subconjunto (decisión del usuario, 2026-08-20). '
  'No es vocabulario descriptivo: gatilla una rama de ejecución real, mismo criterio '
  'que modo_valor/modo_calculo/tipo_recurrencia — no una familia de lista_tipos.';
