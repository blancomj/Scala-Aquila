-- ═══════════════════════════════════════════════════════════════════════
--  Fix: v_documento_vigente no exponía pago_id — "column v_documento_
--  vigente.pago_id does not exist" al registrar un pago (2026-08-27).
--
--  Causa: v_documento_vigente se creó como `select distinct on (grupo_id)
--  *` (20260820100300). En Postgres, `select *` en una vista congela la
--  lista de columnas al momento de crear/reemplazar la vista — un `alter
--  table documentos add column` posterior (aquí, pago_id en
--  20260903170000) NO se propaga solo. subir-documento/index.ts sí filtra
--  por pago_id contra esta vista, así que el 500 era inmediato en
--  cualquier registro de pago con inmueble seleccionado.
--
--  Mismo problema en potencia con caso_juridico_id (20260822340000): esa
--  columna tampoco quedó expuesta, aunque hoy nada la consulta todavía
--  (subir-documento no la acepta, según su propio comentario). Se corrige
--  aquí de una vez para no repetir este incidente cuando sí se use.
--
--  CREATE OR REPLACE VIEW con el mismo texto basta: solo se están
--  agregando columnas al final de `documentos`, nunca quitando ni
--  reordenando — Postgres permite eso sin dropear la vista.
-- ═══════════════════════════════════════════════════════════════════════

create or replace view public.v_documento_vigente
with (security_invoker = true) as
select distinct on (grupo_id) *
from public.documentos
order by grupo_id, version desc;

comment on view public.v_documento_vigente is
  'Última versión de cada grupo_id — derivado, no persistido (§4.2). security_invoker=true: '
  'respeta el RLS de documentos del usuario que consulta, no del dueño de la vista. '
  'Recreada en 20260903180000 para exponer columnas agregadas después de su creación original '
  '(pago_id, caso_juridico_id) — select * en una vista no las hereda solo.';
