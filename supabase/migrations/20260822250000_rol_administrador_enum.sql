-- ═══════════════════════════════════════════════════════════════════════
--  GAP-CAR-009 (1/2) — agrega 'administrador' a tenant_role_t
--  Propietario: Docs/Motor de gestion de cartera/CAR_00_Guia_Oficial.md §21/§24
--
--  Solo agrega el valor al enum. Postgres no permite usar un valor de enum
--  recién agregado en la misma transacción en la que se agregó — mismo
--  criterio ya aplicado en 20260817100100 y 20260818100000: por eso
--  has_role()/guard_last_agent() van en un archivo aparte (20260822260000).
-- ═══════════════════════════════════════════════════════════════════════

alter type public.tenant_role_t add value 'administrador';
