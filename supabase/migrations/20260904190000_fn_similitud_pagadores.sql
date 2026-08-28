-- ═══════════════════════════════════════════════════════════════════════
--  fn_similitud_pagadores — similitud de nombre para el paso heurístico de
--  conciliación (§6.2, §E.3). similarity() de pg_trgm no es expresable vía
--  PostgREST directamente, así que se envuelve en una función STABLE.
--
--  Compara el texto del titular (tal como lo trae el extracto bancario)
--  contra terceros.nombre_completo de quienes están marcados es_pagador en
--  algún inmueble del tenant, vigentes hoy. Ambos lados pasan por
--  fn_unaccent_immutable (ya existe, 20260822141000) antes de comparar —
--  "María Pérez" y "MARIA PEREZ" deben verse iguales para similarity().
--
--  SOLO devuelve candidatos: es el motor puro (conciliacion-matching.ts)
--  quien decide qué hacer con ellos, y el heurístico nunca auto-aplica.
-- ═══════════════════════════════════════════════════════════════════════

create function public.fn_similitud_pagadores(p_tenant_id uuid, p_texto text)
returns table (inmueble_id uuid, codigo text, similitud real)
language sql
stable
set search_path = ''
as $$
  select
    i.id as inmueble_id,
    i.codigo,
    extensions.similarity(
      public.fn_unaccent_immutable(lower(t.nombre_completo)),
      public.fn_unaccent_immutable(lower(p_texto))
    ) as similitud
  from public.inmueble_persona_rol ipr
  join public.terceros t on t.id = ipr.tercero_id
  join public.inmuebles i on i.id = ipr.inmueble_id
  where ipr.tenant_id = p_tenant_id
    and ipr.es_pagador
    and ipr.vigente_hasta is null
    and t.nombre_completo is not null
  order by similitud desc;
$$;

comment on function public.fn_similitud_pagadores(uuid, text) is
  'Candidatos de conciliación heurística por similitud de nombre (pg_trgm), contra los pagadores '
  'vigentes del tenant. Solo devuelve candidatos con su score — conciliacion-matching.ts (motor '
  'puro) decide qué hacer, y el heurístico nunca auto-aplica dinero (§6.1).';

revoke execute on function public.fn_similitud_pagadores(uuid, text) from public, anon;
grant execute on function public.fn_similitud_pagadores(uuid, text) to authenticated;
