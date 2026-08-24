-- ═══════════════════════════════════════════════════════════════════════
--  PC-6a · `clase` y `nivel` son NOT NULL, y el tipo generado debe saberlo
--
--  Ambas son columnas generadas desde el código (PC-1) y no pueden valer
--  NULL: `clase` es left(codigo,1)::smallint sobre un código que el CHECK
--  obliga a ser numérico, y `nivel` sale de un CASE cuyas ramas cubren las
--  únicas longitudes que ese mismo CHECK admite (1, 2, 4, 6, 8).
--
--  No declararlo tenía un costo concreto: el generador de tipos las emitía
--  como `number | null`, y cada consumidor en el frontend tenía que
--  defenderse de un null imposible. Se corrige en el esquema —donde está la
--  verdad— en vez de con `?? 0` repartidos por la UI.
-- ═══════════════════════════════════════════════════════════════════════

alter table public.contable_plan_cuenta
  alter column clase set not null,
  alter column nivel set not null;

alter table public.contable_cuenta
  alter column clase set not null,
  alter column nivel set not null;
