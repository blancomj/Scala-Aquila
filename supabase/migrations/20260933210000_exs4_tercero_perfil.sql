-- ═══════════════════════════════════════════════════════════════════════
--  EXS-4 · Directorio (2/3) — generalización del perfil
--
--  mant_proveedor_perfil pasa a tercero_perfil. Es una GENERALIZACIÓN, no
--  una tabla nueva: exactamente el mismo movimiento que
--  documentos_inmueble → documentos (20260822130000) y
--  propietarios → personas → terceros (20260820100000/20260821100000). El
--  proyecto renombra cuando una tabla deja de pertenecer a un módulo.
--
--  Por qué extender en vez de crear directorio_perfil (decisión del
--  usuario, D-75): un proveedor de mantenimiento que además atiende al
--  público —el electricista del local 3— tendría entonces dos perfiles con
--  categoría y descripción cada uno, y nada garantizaría que digan lo
--  mismo. Una sola fila por tercero es una sola fuente de verdad.
--
--  Coste medido antes de decidir: 2 migraciones y 4 líneas de un store.
-- ═══════════════════════════════════════════════════════════════════════

alter table public.mant_proveedor_perfil rename to tercero_perfil;

alter index mant_proveedor_perfil_pkey rename to tercero_perfil_pkey;
alter table public.tercero_perfil
  rename constraint mant_proveedor_perfil_tercero_unico to tercero_perfil_tercero_unico;

alter policy mant_proveedor_perfil_select_miembro on public.tercero_perfil
  rename to tercero_perfil_select_miembro;
alter policy mant_proveedor_perfil_insert_auxiliar on public.tercero_perfil
  rename to tercero_perfil_insert_auxiliar;
alter policy mant_proveedor_perfil_update_auxiliar on public.tercero_perfil
  rename to tercero_perfil_update_auxiliar;

-- ── Lo que el directorio necesita y no existía en ninguna tabla ────────
--
--  terceros guarda identidad legal (razón social, documento, dirección de
--  notificación). Nada de eso sirve para decir "Panadería La Espiga, abre
--  de 6 a 8, local 12". Esos son datos comerciales, y son los que faltaban.

alter table public.tercero_perfil
  add column nombre_comercial      text,
  add column descripcion           text,
  add column categoria_comercio_id bigint references public.lista_tipos (id),
  add column horario               text,
  add column contacto_publico      text,
  -- Existir en terceros NO implica aparecer en el directorio (prompt 03
  -- §66). Por defecto false: publicar es un acto deliberado, no el efecto
  -- secundario de haber creado un tercero.
  add column publicado             boolean not null default false,
  add column publicado_at          timestamptz,
  add column publicado_por         uuid references public.profiles (id);

comment on table public.tercero_perfil is
  'EXS-4 (antes mant_proveedor_perfil, MANT-5) — perfil de un tercero: lo operativo para '
  'mantenimiento (categorias_servicio, especialidades, estado_comercial_id) y lo comercial '
  'visible en el directorio (nombre_comercial, categoria_comercio_id, horario…). Una sola fila '
  'por tercero y tenant: un proveedor que además atiende al público no tiene dos perfiles que '
  'puedan contradecirse.';

comment on column public.tercero_perfil.publicado is
  'Si aparece en el directorio. false por defecto: que un tercero exista en la base no significa '
  'que deba mostrarse (prompt 03 §66). Publicar es deliberado y queda sellado con quién y cuándo.';

comment on column public.tercero_perfil.contacto_publico is
  'Canal de contacto que el negocio ACEPTA publicar — típicamente un teléfono comercial. '
  'Deliberadamente separado de terceros.email/telefono, que son datos de notificación '
  'administrativa y no deben exponerse por el hecho de tener ficha (prompt 03 §16, §46).';

comment on column public.tercero_perfil.categoria_comercio_id is
  'lista_tipos familia CATEGORIA_COMERCIO. Distinta de categorias_servicio (CATEGORIA_ACTIVO), '
  'que dice en qué activos trabaja un proveedor: una es "qué clase de negocio es", la otra "qué '
  'sabe reparar".';

-- ── El guard, generalizado ─────────────────────────────────────────────
--
--  El de MANT-5 validaba tenant, categorias_servicio y estado_comercial.
--  Se conserva tal cual y se le añade la validación de la categoría nueva
--  y el sellado de la publicación. Lo que NO se añade es una exigencia de
--  que el tercero tenga rol de proveedor: ahora la tabla también sirve a
--  comercios, que no lo son.

create or replace function public.guard_tercero_perfil()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_tercero_tenant uuid;
  v_categoria_id   bigint;
  v_estado_tipo    text;
  v_cat_tipo       text;
begin
  select tenant_id into v_tercero_tenant from public.terceros where id = new.tercero_id;
  if v_tercero_tenant is null or v_tercero_tenant <> new.tenant_id then
    raise exception 'PROVEEDOR_TENANT_INCONSISTENTE: el tercero % no pertenece al tenant',
      new.tercero_id;
  end if;

  if new.categorias_servicio is not null then
    foreach v_categoria_id in array new.categorias_servicio loop
      if not exists (
        select 1 from public.lista_tipos where id = v_categoria_id and tipo = 'CATEGORIA_ACTIVO'
      ) then
        raise exception 'PROVEEDOR_CATEGORIA_INVALIDA: % no pertenece a CATEGORIA_ACTIVO',
          v_categoria_id;
      end if;
    end loop;
  end if;

  if new.estado_comercial_id is not null then
    select tipo into v_estado_tipo from public.lista_tipos where id = new.estado_comercial_id;
    if v_estado_tipo is distinct from 'ESTADO_COMERCIAL_PROVEEDOR' then
      raise exception 'PROVEEDOR_CATEGORIA_INVALIDA: % no pertenece a '
        'ESTADO_COMERCIAL_PROVEEDOR', new.estado_comercial_id;
    end if;
  end if;

  if new.categoria_comercio_id is not null then
    select tipo into v_cat_tipo from public.lista_tipos where id = new.categoria_comercio_id;
    if v_cat_tipo is distinct from 'CATEGORIA_COMERCIO' then
      raise exception 'PERFIL_CATEGORIA_COMERCIO_INVALIDA: % no pertenece a CATEGORIA_COMERCIO',
        new.categoria_comercio_id;
    end if;
  end if;

  -- Publicar sin nombre comercial dejaría una ficha sin nombre por el que
  -- encontrarla: se exige antes de aparecer, no al crear el perfil.
  if new.publicado and coalesce(btrim(new.nombre_comercial), '') = '' then
    raise exception 'PERFIL_PUBLICADO_SIN_NOMBRE: publicar el perfil del tercero % exige '
      'nombre_comercial', new.tercero_id;
  end if;

  -- Sellado de la publicación, en los dos sentidos.
  if new.publicado and not coalesce(old.publicado, false) then
    new.publicado_at := coalesce(new.publicado_at, now());
    new.publicado_por := coalesce(new.publicado_por, (select auth.uid()));
  elsif not new.publicado then
    new.publicado_at := null;
    new.publicado_por := null;
  end if;

  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists mant_proveedor_perfil_guard on public.tercero_perfil;
drop function if exists public.guard_mant_proveedor_perfil();

create trigger tercero_perfil_guard
  before insert or update on public.tercero_perfil
  for each row execute function public.guard_tercero_perfil();

revoke execute on function public.guard_tercero_perfil() from public, authenticated, anon;

comment on function public.guard_tercero_perfil is
  'EXS-4 (generaliza guard_mant_proveedor_perfil, MANT-5) — valida tenant y que cada catálogo '
  'resuelva contra su familia, exige nombre_comercial para publicar, y sella publicado_at/'
  'publicado_por en ambos sentidos. No exige rol de proveedor: la tabla ahora también sirve a '
  'comercios, que no lo son.';

create index tercero_perfil_publicado_idx
  on public.tercero_perfil (tenant_id, categoria_comercio_id)
  where publicado;
