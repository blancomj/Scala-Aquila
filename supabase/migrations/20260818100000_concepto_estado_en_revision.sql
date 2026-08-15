-- ═══════════════════════════════════════════════════════════════════════
--  AEL-004 Fase 4 — nuevo estado de revisión para conceptos (maker-checker)
--  Propietario: PLAN_AEL004_RULE_WORKSPACE.md Fase 4, Doc 10 §62/§65/§216
--
--  Solo agrega el valor al enum. Postgres no permite usar un valor de enum
--  recién agregado en la misma transacción en la que se agregó — mismo
--  criterio ya aplicado en Fase 3 (20260817100100), por eso el resto del
--  trabajo (columnas, trigger) va en un archivo aparte.
-- ═══════════════════════════════════════════════════════════════════════

alter type public.concepto_estado_t add value 'en_revision' after 'borrador';
