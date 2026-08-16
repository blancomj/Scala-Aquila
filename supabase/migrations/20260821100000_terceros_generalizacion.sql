-- ═══════════════════════════════════════════════════════════════════════
--  Terceros — generalización de personas a natural/jurídica
--  Propietario: PROMPT_MANTENIMIENTO_TERCEROS.md §4.2, §7
--
--  PROMPT_MANTENIMIENTO_TERCEROS.md asumía que este rename ya estaba hecho
--  (fechas 20260817, antes de personas_roles_flexibles que en este repo es
--  20260820) — verificado falso, no existía ni la tabla `terceros` ni el
--  store. Se construye ahora, adaptado al estado real: personas (single
--  `nombre`, `tipo_documento` texto libre) es el punto de partida, no
--  propietarios. Decisión explícita del usuario: renombrar personas→
--  terceros (no dejar la tabla como `personas` con columnas de terceros),
--  pese al costo de tocar la ficha de inmueble ya construida y verificada
--  hoy — se prefiere fidelidad al esquema del documento sobre menor blast
--  radius.
--
--  inmueble_persona_rol (la tabla, no la columna) se queda con ese nombre:
--  PROMPT_MANTENIMIENTO_TERCEROS.md §1.2 excluye explícitamente
--  "inmueble_tercero_rol" del alcance de esta pantalla ("vive en la ficha
--  de inmueble... no se duplica aquí") — renombrar esa tabla sería una
--  decisión de PROMPT_FICHA_INMUEBLE.md, no de este documento. Solo se
--  renombra la columna FK que apunta a la entidad renombrada.
-- ═══════════════════════════════════════════════════════════════════════

-- ── 1. rename personas → terceros ───────────────────────────────────────
alter table public.personas rename to terceros;
alter table public.terceros rename constraint personas_pkey to terceros_pkey;
alter table public.terceros rename constraint personas_documento_unico to terceros_documento_unico;
alter table public.terceros rename constraint propietarios_tenant_id_fkey to terceros_tenant_id_fkey;
alter index personas_tenant_idx rename to terceros_tenant_idx;

alter policy personas_select_miembro on public.terceros rename to terceros_select_miembro;
alter policy personas_insert_agent on public.terceros rename to terceros_insert_agent;
alter policy personas_update_agent on public.terceros rename to terceros_update_agent;
alter policy personas_delete_agent on public.terceros rename to terceros_delete_agent;

alter table public.inmueble_persona_rol rename column persona_id to tercero_id;
alter table public.inmueble_persona_rol
  rename constraint inmueble_propietario_inmueble_id_fkey to inmueble_persona_rol_inmueble_id_fkey;
alter table public.inmueble_persona_rol
  rename constraint inmueble_propietario_propietario_id_fkey to inmueble_persona_rol_tercero_id_fkey;
alter table public.inmueble_persona_rol
  rename constraint inmueble_propietario_tenant_id_fkey to inmueble_persona_rol_tenant_id_fkey;

-- ── 2. tipo_persona: natural | jurídica ─────────────────────────────────
create type public.tercero_tipo_t as enum ('natural', 'juridica');

alter table public.terceros add column tipo_persona public.tercero_tipo_t not null default 'natural';
alter table public.terceros alter column tipo_persona drop default;

-- ── 3. catálogo ESTADO_TERCERO (no existía) ─────────────────────────────
insert into public.tipos (codigo, nombre) values
  ('ESTADO_TERCERO', 'Estado del Tercero')
on conflict (codigo) do nothing;

insert into public.lista_tipos (tipo, codigo, nombre, orden) values
  ('ESTADO_TERCERO', 'activo', 'Activo', 1),
  ('ESTADO_TERCERO', 'inactivo', 'Inactivo', 2);

-- ── 4. columnas nuevas ───────────────────────────────────────────────────
alter table public.terceros add column tipo_identificacion_id bigint references public.lista_tipos (id);
alter table public.terceros add column digito_verificacion text;
alter table public.terceros add column primer_nombre text;
alter table public.terceros add column segundo_nombre text;
alter table public.terceros add column primer_apellido text;
alter table public.terceros add column segundo_apellido text;
alter table public.terceros add column razon_social text;
alter table public.terceros add column representante_legal_id uuid references public.terceros (id);
alter table public.terceros add column pagador_id uuid references public.terceros (id);
alter table public.terceros add column direccion text;
alter table public.terceros add column estado_id bigint references public.lista_tipos (id);

-- ── 5. backfill de filas existentes ──────────────────────────────────────
-- Solo dato de desarrollo (fixtures de esta sesión) — el split de `nombre`
-- en primer/segundo nombre y apellido es heurístico (primera palabra =
-- primer_nombre, última = primer_apellido, intermedias = segundo_nombre),
-- no un algoritmo general de nombres colombianos. No hay filas de jurídica
-- que migrar: la tabla vieja nunca modeló ese caso.
update public.terceros t
set
  primer_nombre = (regexp_split_to_array(trim(t.nombre), '\s+'))[1],
  segundo_nombre = nullif(
    array_to_string(
      (regexp_split_to_array(trim(t.nombre), '\s+'))[2:array_length(regexp_split_to_array(trim(t.nombre), '\s+'), 1) - 1],
      ' '
    ),
    ''
  ),
  primer_apellido = (regexp_split_to_array(trim(t.nombre), '\s+'))[array_length(regexp_split_to_array(trim(t.nombre), '\s+'), 1)],
  tipo_identificacion_id = lt.id
from public.lista_tipos lt
where lt.tipo = 'TIPO_IDENTIFICACION' and lt.tenant_id is null
  and lt.codigo = case t.tipo_documento
    when 'C.C.' then 'cedula'
    when 'NIT' then 'nit'
    when 'C.E.' then 'cedula_extranjeria'
    when 'T.I.' then 'tarjeta_identidad'
    when 'Pasaporte' then 'pasaporte'
    else 'cedula'
  end;

update public.terceros t
set estado_id = lt.id
from public.lista_tipos lt
where lt.tipo = 'ESTADO_TERCERO' and lt.tenant_id is null and lt.codigo = 'activo';

-- ── 6. not null + drop de la columna vieja ──────────────────────────────
alter table public.terceros alter column tipo_identificacion_id set not null;
alter table public.terceros alter column estado_id set not null;

alter table public.terceros drop constraint terceros_documento_unico;
alter table public.terceros drop column tipo_documento;
alter table public.terceros
  add constraint terceros_documento_unico unique (tenant_id, tipo_identificacion_id, numero_documento);

-- ── 7. CHECKs — campos obligatorios/exclusivos por tipo_persona ─────────
alter table public.terceros add constraint terceros_natural_requiere_nombre
  check (tipo_persona <> 'natural' or (primer_nombre is not null and primer_apellido is not null));
alter table public.terceros add constraint terceros_natural_sin_razon_social
  check (tipo_persona <> 'natural' or razon_social is null);
alter table public.terceros add constraint terceros_juridica_requiere_razon_social
  check (tipo_persona <> 'juridica' or razon_social is not null);
alter table public.terceros add constraint terceros_juridica_sin_campos_natural
  check (
    tipo_persona <> 'juridica'
    or (primer_nombre is null and segundo_nombre is null
        and primer_apellido is null and segundo_apellido is null)
  );
alter table public.terceros add constraint terceros_representante_no_autorreferencia
  check (representante_legal_id is null or representante_legal_id <> id);
alter table public.terceros add constraint terceros_pagador_no_autorreferencia
  check (pagador_id is null or pagador_id <> id);

-- ── 8. nombre_completo — generada, nunca recalcular en el componente ────
-- concat_ws() es STABLE, no IMMUTABLE (provolatile='s') — Postgres rechaza
-- una columna generada que lo use (42P17). || + coalesce + regexp_replace
-- (colapsa los espacios dobles que deja un campo nulo) sí son immutable.
alter table public.terceros add column nombre_completo text generated always as (
  case
    when tipo_persona = 'juridica' then razon_social
    else trim(regexp_replace(
      coalesce(primer_nombre, '') || ' ' || coalesce(segundo_nombre, '') || ' ' ||
      coalesce(primer_apellido, '') || ' ' || coalesce(segundo_apellido, ''),
      '\s+', ' ', 'g'
    ))
  end
) stored;

-- ── 9. guard_tercero_invariantes — familia de catálogo + representante/
--       pagador natural del mismo tenant. Un CHECK no puede hacer subquery
--       (AD-03, mismo motivo que fn_marcar_pagador en vez de un CHECK para
--       "un solo pagador vigente"), de ahí el trigger.
create function public.guard_tercero_invariantes()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (
    select 1 from public.lista_tipos lt
    where lt.id = new.tipo_identificacion_id
      and lt.tipo = 'TIPO_IDENTIFICACION'
      and (lt.tenant_id is null or lt.tenant_id = new.tenant_id)
  ) then
    raise exception 'TIPO_IDENTIFICACION_INVALIDO: tipo_identificacion_id % no pertenece a TIPO_IDENTIFICACION',
      new.tipo_identificacion_id;
  end if;

  if not exists (
    select 1 from public.lista_tipos lt
    where lt.id = new.estado_id
      and lt.tipo = 'ESTADO_TERCERO'
      and (lt.tenant_id is null or lt.tenant_id = new.tenant_id)
  ) then
    raise exception 'ESTADO_TERCERO_INVALIDO: estado_id % no pertenece a ESTADO_TERCERO', new.estado_id;
  end if;

  if new.representante_legal_id is not null and not exists (
    select 1 from public.terceros t
    where t.id = new.representante_legal_id
      and t.tenant_id = new.tenant_id
      and t.tipo_persona = 'natural'
  ) then
    raise exception 'TERCERO_REPRESENTANTE_INVALIDO: representante_legal_id % debe ser un tercero natural del mismo tenant',
      new.representante_legal_id;
  end if;

  if new.pagador_id is not null and not exists (
    select 1 from public.terceros t
    where t.id = new.pagador_id
      and t.tenant_id = new.tenant_id
      and t.tipo_persona = 'natural'
  ) then
    raise exception 'TERCERO_PAGADOR_INVALIDO: pagador_id % debe ser un tercero natural del mismo tenant',
      new.pagador_id;
  end if;

  return new;
end;
$$;

create trigger guard_tercero_invariantes
  before insert or update on public.terceros
  for each row execute function public.guard_tercero_invariantes();

comment on table public.terceros is
  'Persona natural o jurídica del tenant (PROMPT_MANTENIMIENTO_TERCEROS.md §4.2) — antes '
  '"personas" (solo natural, sin generalizar). representante_legal_id/pagador_id solo '
  'aplican a jurídica y deben apuntar a un tercero natural del mismo tenant '
  '(guard_tercero_invariantes). nombre_completo es generada, nunca recalcular en el '
  'frontend. tipo_persona es inmutable tras creación solo por decisión de UI, no hay '
  'guard de base para eso todavía (gap §8.1 del documento).';

comment on column public.terceros.digito_verificacion is
  'Solo aplica cuando tipo_identificacion es NIT — calculado en el cliente (algoritmo '
  'DIAN, PROMPT_MANTENIMIENTO_TERCEROS.md §7.3), no recalculado ni validado en la base.';
