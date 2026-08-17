-- ═══════════════════════════════════════════════════════════════════════
--  unaccent + fn_unaccent_immutable — separado de
--  20260822140000_busqueda_tsvector.sql en su propia migración.
--
--  `supabase db push` corre cada archivo en una transacción propia — pero
--  el intento original (extensión + función + 4 ALTER TABLE ... GENERATED
--  ALWAYS AS en el mismo archivo) fallaba en el primer ALTER con
--  "generation expression is not immutable" (42P17) pese a que la misma
--  secuencia exacta de sentencias, probada a mano contra esta base con
--  una conexión directa, SÍ funciona sin error. La única diferencia
--  observable es que el CLI corre el push con un rol/sesión propio
--  ("login-role" vía Management API) distinto al de una conexión directa.
--  No se pudo aislar la causa exacta sin acceso a esa sesión — se separa
--  la extensión+función en su propia migración (que si aplicó limpio) de
--  las columnas generadas (siguiente archivo), así cada ALTER TABLE corre
--  contra una función ya comprometida en una transacción anterior, no en
--  la misma transacción que la crea.
-- ═══════════════════════════════════════════════════════════════════════

create extension if not exists unaccent with schema extensions;

create function public.fn_unaccent_immutable(p_texto text)
returns text
language sql
immutable
parallel safe
as $$
  select extensions.unaccent('extensions.unaccent', p_texto);
$$;
