-- ═══════════════════════════════════════════════════════════════════════
--  RPT-01 · reporte_ejecuciones debe dejar pasar el borrado del tenant
--
--  Bug real, encontrado verificando en navegador (no lo atrapó ninguna
--  prueba): con `forbid_mutation()`, una copropiedad que hubiera ejecutado
--  aunque fuera UN reporte quedaba imposible de borrar —
--
--    ERROR: APPEND_ONLY: reporte_ejecuciones no admite DELETE (SEC-14)
--    CONTEXT: DELETE FROM ONLY "public"."reporte_ejecuciones" WHERE ...
--
--  — porque la FK `tenant_id ... on delete cascade` dispara un DELETE que
--  el guard rechaza. Es exactamente el bug que 20260823250000 arregló para
--  las otras diez tablas append-only con tenant CASCADE, y la corrección es
--  reutilizar su guard, no escribir uno nuevo:
--  `forbid_mutation_salvo_tenant_borrado()` permite ÚNICAMENTE el DELETE
--  cuya fila apunta a un tenant que ya no existe (o sea, la cascada), y
--  sigue prohibiendo todo UPDATE y todo DELETE mientras el tenant viva.
--
--  Las pruebas RLS del corte no lo detectaron porque llaman a
--  fn_reporte_ejecutar directamente y la bitácora la escribe el store del
--  frontend: no había ejecuciones registradas cuando el afterAll borraba
--  los tenants. Se cubre ahora con un caso explícito en
--  tests/rls/reportes.test.ts.
-- ═══════════════════════════════════════════════════════════════════════

drop trigger reporte_ejecuciones_append_only on public.reporte_ejecuciones;

create trigger reporte_ejecuciones_append_only
  before update or delete on public.reporte_ejecuciones
  for each row execute function public.forbid_mutation_salvo_tenant_borrado();

comment on table public.reporte_ejecuciones is
  'Bitácora append-only de ejecuciones (RPT-01, §67 observabilidad). Sin cola ni estados '
  'QUEUED/RUNNING (D-136 R-04: la ejecución es síncrona): `exito` es un hecho terminal, no un '
  'ciclo de vida. Guarda los parámetros efectivos y la versión exacta, que es lo que permite '
  'responder cómo se produjo un documento (§95). Usa forbid_mutation_salvo_tenant_borrado '
  '(20260823250000) y no forbid_mutation: si no, una copropiedad con reportes ejecutados no se '
  'podría borrar nunca.';
