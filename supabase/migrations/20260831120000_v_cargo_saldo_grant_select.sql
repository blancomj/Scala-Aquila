-- ═══════════════════════════════════════════════════════════════════════
--  M7 (auditoría externa 2026-08-26, Docs/evaluacion/01) — sobre-grant en
--  v_cargo_saldo
--
--  20260830650000 (descuento pronto pago) recreó v_cargo_saldo para el
--  swap-type de cargo_origen_t y le puso `grant all` — la vista original
--  (20260816100000) nunca tuvo un grant explícito, solo dependía de los
--  privilegios por defecto. `grant all` sobre una vista concede
--  INSERT/UPDATE/DELETE de más: v_cargo_saldo agrega sobre pago_aplicaciones
--  (no es una vista simple de una sola tabla), así que hoy ningún DML
--  llegaría a ejecutarse igual — pero conceder de más es superficie
--  innecesaria, y si en el futuro alguien le agrega un INSTEAD OF trigger,
--  este grant desbloquearía escritura que nadie decidió permitir.
--  security_invoker=true sigue exigiendo que la RLS de `cargos` se cumpla
--  de todas formas, así que el SELECT (lo único que se usa hoy) no cambia.
-- ═══════════════════════════════════════════════════════════════════════

revoke all on public.v_cargo_saldo from authenticated, service_role;
grant select on public.v_cargo_saldo to authenticated, service_role;
