-- ═══════════════════════════════════════════════════════════════════════
--  pg_trgm — solo la extensión, en su propia migración.
--
--  Repite la corrección que ya dejó documentada
--  20260822141000_busqueda_unaccent_fn.sql: `supabase db push` falló con
--  42P17 ("generation expression is not immutable") al crear una extensión
--  y lo que la usa (función/columnas generadas) en el MISMO archivo, pese a
--  que la misma secuencia funciona sin error por conexión directa. La causa
--  exacta no se pudo aislar (el CLI corre con un rol/sesión distinto vía
--  Management API), así que la mitigación es la misma: separar la
--  extensión en su propia migración, para que lo que la use corra en una
--  transacción posterior contra una extensión ya comprometida.
--
--  Usada por el matching heurístico de conciliación bancaria (similarity()
--  sobre terceros.nombre_completo vs. el titular que trae el extracto) —
--  ver 20260904170000_conciliacion_esquema.sql.
-- ═══════════════════════════════════════════════════════════════════════

create extension if not exists pg_trgm with schema extensions;
