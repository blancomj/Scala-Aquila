-- ═══════════════════════════════════════════════════════════════════════
--  Búsqueda global — columnas tsvector generadas
--  Propietario: conversación de diseño de esta sesión.
--
--  extensión unaccent + fn_unaccent_immutable() ahora viven en
--  20260822141000_busqueda_unaccent_fn.sql, migración aparte — la función
--  necesita quedar comprometida ANTES de que un ALTER TABLE la use en una
--  columna generada.
--
--  Cada tsvector se GENERA (stored), no se calcula en el cliente ni se
--  mantiene con un trigger aparte — mismo criterio DB-first que
--  terceros.nombre_completo. terceros.busqueda_tsv NO puede referenciar
--  nombre_completo (Postgres no permite que una columna generada
--  referencie otra columna generada) — se duplica la misma lógica
--  natural/jurídica aquí, con esa razón anotada, no por descuido.
--
--  to_tsvector('spanish', …) sin más: Postgres resuelve 'spanish' contra el
--  overload to_tsvector(text, text), que es STABLE (el config podría venir
--  de una tabla), no IMMUTABLE — rechazado en una columna generada (42P17).
--  to_tsvector('spanish'::regconfig, …) fuerza el otro overload, el que
--  toma el config ya resuelto a OID en tiempo de parseo — ese sí es
--  IMMUTABLE. Ajustado en las 4 columnas de este archivo.
--
--  concat_ws(' ', a, b, c, d) en la rama de terceros (el original de esta
--  migración, verificado a mano contra esta base): concat_ws es STABLE, no
--  IMMUTABLE — acepta VARIADIC "any", y para tipos como timestamp su
--  representación de texto depende del timezone de sesión, así que
--  Postgres la marca STABLE para todo el overload aunque aquí solo se le
--  pasen columnas text. Se reemplaza por una cadena de coalesce+`||`, que
--  sí es IMMUTABLE para argumentos text.
-- ═══════════════════════════════════════════════════════════════════════

-- ── terceros ─────────────────────────────────────────────────────────────
alter table public.terceros add column busqueda_tsv tsvector generated always as (
  to_tsvector('spanish'::regconfig, public.fn_unaccent_immutable(
    coalesce(
      case tipo_persona
        when 'natural' then trim(regexp_replace(
          coalesce(primer_nombre, '') || ' ' || coalesce(segundo_nombre, '') || ' ' ||
          coalesce(primer_apellido, '') || ' ' || coalesce(segundo_apellido, ''),
          '\s+', ' ', 'g'
        ))
        when 'juridica' then razon_social
      end,
      ''
    ) || ' ' || coalesce(numero_documento, '') || ' ' || coalesce(email::text, '')
  ))
) stored;
create index terceros_busqueda_idx on public.terceros using gin (busqueda_tsv);

-- ── inmuebles ────────────────────────────────────────────────────────────
alter table public.inmuebles add column busqueda_tsv tsvector generated always as (
  to_tsvector('spanish'::regconfig, public.fn_unaccent_immutable(
    coalesce(codigo, '') || ' ' || coalesce(matricula_inmobiliaria, '')
  ))
) stored;
create index inmuebles_busqueda_idx on public.inmuebles using gin (busqueda_tsv);

-- ── documentos (ya generalizada, 20260822130000) ───────────────────────
alter table public.documentos add column busqueda_tsv tsvector generated always as (
  to_tsvector('spanish'::regconfig, public.fn_unaccent_immutable(coalesce(nombre_archivo, '')))
) stored;
create index documentos_busqueda_idx on public.documentos using gin (busqueda_tsv);

-- v_documento_vigente es `select d.*` — una vista así NO recoge columnas
-- agregadas después a la tabla subyacente sin recrearla explícitamente.
create or replace view public.v_documento_vigente with (security_invoker = true) as
select d.*
from public.documentos d
where d.version = (
  select max(d2.version)
  from public.documentos d2
  where d2.grupo_id = d.grupo_id
);

-- ── novedades ────────────────────────────────────────────────────────────
alter table public.novedades add column busqueda_tsv tsvector generated always as (
  to_tsvector('spanish'::regconfig, public.fn_unaccent_immutable(coalesce(descripcion, '')))
) stored;
create index novedades_busqueda_idx on public.novedades using gin (busqueda_tsv);
