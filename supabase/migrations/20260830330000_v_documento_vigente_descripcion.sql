-- ═══════════════════════════════════════════════════════════════════════
--  v_documento_vigente — recrear tras 20260830320000_documentos_descripcion
--
--  `create view ... as select * from documentos` expande el `*` a la lista
--  de columnas vigente EN ESE MOMENTO (Postgres no lo deja como wildcard
--  vivo) — agregar `documentos.descripcion` después no la propaga a la
--  vista sola. Se recrea con `create or replace view` (agrega la columna al
--  final, no reordena ni quita las existentes, así que no rompe nada que ya
--  lea la vista por posición).
-- ═══════════════════════════════════════════════════════════════════════

create or replace view public.v_documento_vigente
with (security_invoker = true) as
select distinct on (grupo_id) *
from public.documentos
order by grupo_id, version desc;

comment on view public.v_documento_vigente is
  'Última versión de cada grupo_id — derivado, no persistido (§4.2). security_invoker=true: '
  'respeta el RLS de documentos del usuario que consulta, no del dueño de la vista. Recreada en '
  '20260830330000 para incluir documentos.descripcion.';
