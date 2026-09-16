-- ═══════════════════════════════════════════════════════════════════════
--  RPT-01 · Privilegios de las vistas de reporting
--
--  Los ALTER DEFAULT PRIVILEGES de Supabase otorgan a `anon` y
--  `authenticated` TODOS los privilegios sobre cualquier objeto nuevo de
--  `public`. Para una vista de reporting eso es más de lo necesario, así
--  que se recorta al mismo mínimo que ya tiene v_cargo_saldo
--  (20260831120000): solo SELECT, y nada para anon.
--
--  Qué cambia de verdad y qué no:
--
--   · `authenticated` conserva SELECT — y lo NECESITA, porque
--     fn_reporte_ejecutar es SECURITY INVOKER: la consulta la hace el
--     usuario, no la función. Sin este SELECT el motor no ejecutaría nada.
--   · INSERT/UPDATE/DELETE se retiran por higiene, no porque fueran
--     explotables: las tres vistas tienen joins (y dos, subconsultas
--     laterales), así que Postgres no las considera actualizables y
--     cualquier escritura fallaría igual.
--   · `anon` pierde el acceso. Tampoco habría visto datos —al ser
--     security_invoker, las políticas de las tablas base no le conceden
--     ninguna fila— pero podía enumerar la estructura por PostgREST, y no
--     hay razón para que una vista de reporting sea visible sin sesión.
-- ═══════════════════════════════════════════════════════════════════════

revoke all on public.vr_cartera_inmueble from anon, authenticated, service_role;
revoke all on public.vr_cuenta_corriente from anon, authenticated, service_role;
revoke all on public.vr_recaudos        from anon, authenticated, service_role;

grant select on public.vr_cartera_inmueble to authenticated, service_role;
grant select on public.vr_cuenta_corriente to authenticated, service_role;
grant select on public.vr_recaudos        to authenticated, service_role;
