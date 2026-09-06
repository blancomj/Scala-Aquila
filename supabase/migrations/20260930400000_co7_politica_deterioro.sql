-- ═══════════════════════════════════════════════════════════════════════
--  CO-7 · Política de deterioro de cartera — versionada, sin porcentajes
--  incrustados en el código (Casos de uso/Tres Modulos/Contabilidad/
--  CO_07_deterioro_cartera.md §4.1)
--
--  CTCP 0153/2025 (ya en fundamento_normativo, 20260830530000) confirma que el deterioro es
--  obligatorio para Grupo 3 (NIF Microempresas §7.5), pero el MÉTODO de estimación no está
--  fijado por norma — es parametrización de cada copropiedad. Por eso este corte construye un
--  motor de política versionada (mismo patrón que politicas_financieras/
--  politicas_clasificacion_cartera, 20260822200000), no una tabla de porcentajes sembrados.
--
--  Reutiliza vigencia_estado_t (20260814100000) y guard_politica_inmutable() (20260814100300)
--  tal cual — no crea equivalentes propios (D-24, marco §3).
--
--  Punto de diseño acordado con el usuario (Plan del corte): el enum trae 3 métodos porque el
--  corte los nombra los tres explícitamente, pero solo 'antiguedad' tiene estructura y pruebas
--  detalladas. 'porcentaje_global' se resuelve con un único campo en la política (sin tabla
--  nueva). 'individual' queda como valor de enum válido — activar una política con ese método
--  no falla aquí, pero contable_calcular_deterioro (próxima migración) sí falla explícitamente
--  con DETERIORO_METODO_NO_IMPLEMENTADO: no hay tabla de excepciones por inmueble especificada
--  en este corte, e inventarla violaría "no inventes tablas" del marco.
--
--  Fuera de este corte (§5 del corte, vinculante): deterioro de activos clase 15 (módulo PPE),
--  proceso completo de castigo de cartera, cambios a la lógica de intereses de mora existente.
-- ═══════════════════════════════════════════════════════════════════════

create type public.deterioro_metodo_t as enum ('antiguedad', 'porcentaje_global', 'individual');

comment on type public.deterioro_metodo_t is
  'Gobierna qué algoritmo ejecuta contable_calcular_deterioro (D-24): antiguedad usa '
  'contable_politica_deterioro_tramo; porcentaje_global usa contable_politica_deterioro.'
  'porcentaje_global; individual no tiene estructura definida en CO-7 y hace que el cálculo '
  'falle explícitamente (DETERIORO_METODO_NO_IMPLEMENTADO) hasta que un corte futuro la diseñe.';

-- ── contable_politica_deterioro ─────────────────────────────────────────
create table public.contable_politica_deterioro (
  id                                 uuid primary key default gen_random_uuid(),
  tenant_id                         uuid not null references public.tenants (id) on delete cascade,
  version                           int not null,
  estado                            public.vigencia_estado_t not null default 'borrador',
  vigente_desde                     date,
  vigente_hasta                     date,
  metodo                            public.deterioro_metodo_t not null,
  -- Solo se usa (y se exige) cuando metodo = 'porcentaje_global' — validado en
  -- guard_politica_deterioro_completa al pasar a 'vigente', igual que los tramos.
  porcentaje_global                 numeric(5, 2),
  -- §4.2: por defecto, los cargos con acuerdo de pago vigente no entran a la base de cálculo
  -- (un acuerdo vigente cambia la expectativa de recaudo) — parametrizable, no hardcodeado.
  excluir_cargos_con_acuerdo_vigente boolean not null default true,
  aprobada_por                      uuid references public.profiles (id),
  aprobada_at                       timestamptz,
  acta_referencia                   text,
  fundamento                        text,
  created_at                        timestamptz not null default now(),
  updated_at                        timestamptz
);

alter table public.contable_politica_deterioro enable row level security;
alter table public.contable_politica_deterioro force row level security;

create index contable_politica_deterioro_tenant_idx
  on public.contable_politica_deterioro (tenant_id);
create unique index contable_politica_deterioro_version_unica
  on public.contable_politica_deterioro (tenant_id, version);
create unique index contable_politica_deterioro_vigente_unica
  on public.contable_politica_deterioro (tenant_id)
  where estado = 'vigente';

comment on table public.contable_politica_deterioro is
  'Política de deterioro de cartera, versionada e inmutable una vez vigente/historica (mismo '
  'patrón que politicas_financieras/politicas_clasificacion_cartera). Cero porcentajes '
  'sembrados por defecto — una política sin aprobar no calcula nada (CO-7 §4.1). El método de '
  'estimación es decisión de la copropiedad, no norma (CTCP 0153/2025 solo obliga el deterioro '
  'en sí para Grupo 3, no fija un porcentaje).';

create trigger set_updated_at before update on public.contable_politica_deterioro
  for each row execute function public.set_updated_at();

-- Reutiliza el guard genérico ya usado por politicas_financieras y
-- politicas_clasificacion_cartera — opera solo sobre old.estado/id/version.
create trigger guard_politica_inmutable
  before update on public.contable_politica_deterioro
  for each row execute function public.guard_politica_inmutable();

-- ── guard: porcentaje_global siempre en [0,100] si está presente ───────
create function public.guard_politica_deterioro_porcentaje_valido()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.porcentaje_global is not null
     and (new.porcentaje_global < 0 or new.porcentaje_global > 100) then
    raise exception 'DETERIORO_PORCENTAJE_INVALIDO: porcentaje_global % está fuera de [0,100] '
      '(CO-7 §4.1)', new.porcentaje_global;
  end if;
  return new;
end;
$$;

create trigger guard_politica_deterioro_porcentaje_valido
  before insert or update on public.contable_politica_deterioro
  for each row execute function public.guard_politica_deterioro_porcentaje_valido();

-- ── contable_politica_deterioro_tramo — solo para metodo = 'antiguedad' ─
create table public.contable_politica_deterioro_tramo (
  id           uuid primary key default gen_random_uuid(),
  tenant_id    uuid not null references public.tenants (id) on delete cascade,
  politica_id  uuid not null references public.contable_politica_deterioro (id) on delete cascade,
  dias_desde   int not null check (dias_desde >= 0),
  -- null = sin tope superior — exactamente un tramo de la política lo tiene.
  dias_hasta   int,
  porcentaje   numeric(5, 2) not null,
  created_at   timestamptz not null default now(),

  constraint politica_deterioro_tramo_rango_valido
    check (dias_hasta is null or dias_hasta >= dias_desde)
);

alter table public.contable_politica_deterioro_tramo enable row level security;
alter table public.contable_politica_deterioro_tramo force row level security;

create index contable_politica_deterioro_tramo_tenant_idx
  on public.contable_politica_deterioro_tramo (tenant_id);
create index contable_politica_deterioro_tramo_politica_idx
  on public.contable_politica_deterioro_tramo (politica_id);

comment on table public.contable_politica_deterioro_tramo is
  'Tramos de antigüedad de una contable_politica_deterioro con metodo=antiguedad. Deben cubrir '
  '[0,∞) sin huecos ni solapes, validado por guard_politica_deterioro_completa antes de activar '
  'la política dueña (CO-7 §4.1).';

-- ── guard: porcentaje de cada tramo en [0,100] ──────────────────────────
create function public.guard_tramo_deterioro_porcentaje_valido()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.porcentaje < 0 or new.porcentaje > 100 then
    raise exception 'DETERIORO_PORCENTAJE_INVALIDO: el porcentaje % del tramo está fuera de '
      '[0,100] (CO-7 §4.1)', new.porcentaje;
  end if;
  return new;
end;
$$;

create trigger guard_tramo_deterioro_porcentaje_valido
  before insert or update on public.contable_politica_deterioro_tramo
  for each row execute function public.guard_tramo_deterioro_porcentaje_valido();

-- ── guard: tramos inmutables si la política dueña ya no es borrador ────
create function public.guard_tramo_deterioro_inmutable()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_politica_id uuid := coalesce(new.politica_id, old.politica_id);
  v_estado      public.vigencia_estado_t;
begin
  select estado into v_estado
    from public.contable_politica_deterioro
   where id = v_politica_id;

  if v_estado in ('vigente', 'historica') then
    raise exception 'IMMUTABLE_POLICY: los tramos de la política de deterioro % son '
      'inmutables en estado % — corrige creando una versión nueva (CO-7 §4.1)',
      v_politica_id, v_estado;
  end if;

  return coalesce(new, old);
end;
$$;

create trigger guard_tramo_deterioro_inmutable
  before insert or update or delete on public.contable_politica_deterioro_tramo
  for each row execute function public.guard_tramo_deterioro_inmutable();

-- ── guard: cobertura completa de tramos antes de pasar a 'vigente' ──────
create function public.guard_politica_deterioro_completa()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_total          int;
  v_con_inicio_cero int;
  v_sin_tope       int;
begin
  -- Solo se valida al entrar a 'vigente' — un borrador puede estar incompleto.
  if new.estado <> 'vigente' or old.estado = 'vigente' then
    return new;
  end if;

  if new.metodo = 'porcentaje_global' then
    if new.porcentaje_global is null then
      raise exception 'DETERIORO_PORCENTAJE_INVALIDO: la política % usa porcentaje_global y '
        'no lo tiene definido (CO-7 §4.1)', new.id;
    end if;
    return new;
  end if;

  if new.metodo = 'individual' then
    -- Sin estructura definida en CO-7 — se permite activar (no bloquea el flujo de
    -- aprobación); contable_calcular_deterioro falla explícitamente si se usa.
    return new;
  end if;

  -- metodo = 'antiguedad': cobertura [0,∞) sin huecos ni solapes.
  select count(*) into v_total
    from public.contable_politica_deterioro_tramo
   where politica_id = new.id;

  if v_total = 0 then
    raise exception 'DETERIORO_TRAMOS_INCOMPLETOS: la política % no tiene tramos (CO-7 §4.1)',
      new.id;
  end if;

  select count(*) into v_con_inicio_cero
    from public.contable_politica_deterioro_tramo
   where politica_id = new.id and dias_desde = 0;
  if v_con_inicio_cero <> 1 then
    raise exception 'DETERIORO_TRAMOS_INCOMPLETOS: se esperaba exactamente 1 tramo con '
      'dias_desde=0 en la política %, hay % (CO-7 §4.1)', new.id, v_con_inicio_cero;
  end if;

  select count(*) into v_sin_tope
    from public.contable_politica_deterioro_tramo
   where politica_id = new.id and dias_hasta is null;
  if v_sin_tope <> 1 then
    raise exception 'DETERIORO_TRAMOS_INCOMPLETOS: se esperaba exactamente 1 tramo con '
      'dias_hasta=null en la política %, hay % (CO-7 §4.1)', new.id, v_sin_tope;
  end if;

  -- Huecos: el tramo siguiente empieza después de donde terminó el anterior.
  if exists (
    select 1 from (
      select dias_desde, lag(dias_hasta) over (order by dias_desde) as anterior_hasta
        from public.contable_politica_deterioro_tramo
       where politica_id = new.id
    ) t
    where anterior_hasta is not null and dias_desde > anterior_hasta + 1
  ) then
    raise exception 'DETERIORO_TRAMOS_INCOMPLETOS: los tramos de la política % dejan un hueco '
      'de cobertura (CO-7 §4.1)', new.id;
  end if;

  -- Solapes: el tramo siguiente empieza antes de que termine el anterior, o el tramo sin
  -- tope superior no es el de mayor dias_desde.
  if exists (
    select 1 from (
      select dias_desde, lag(dias_hasta) over (order by dias_desde) as anterior_hasta
        from public.contable_politica_deterioro_tramo
       where politica_id = new.id
    ) t
    where anterior_hasta is not null and dias_desde <= anterior_hasta
  ) or exists (
    select 1
      from public.contable_politica_deterioro_tramo abierto
      join public.contable_politica_deterioro_tramo otro
        on otro.politica_id = abierto.politica_id
       and otro.id <> abierto.id
     where abierto.politica_id = new.id
       and abierto.dias_hasta is null
       and otro.dias_desde > abierto.dias_desde
  ) then
    raise exception 'DETERIORO_TRAMOS_SOLAPADOS: los tramos de la política % se solapan '
      '(CO-7 §4.1)', new.id;
  end if;

  return new;
end;
$$;

create trigger guard_politica_deterioro_completa
  before update on public.contable_politica_deterioro
  for each row execute function public.guard_politica_deterioro_completa();

-- ── RLS ──────────────────────────────────────────────────────────────────
create policy contable_politica_deterioro_select_miembro
  on public.contable_politica_deterioro for select
  to authenticated
  using (public.is_member(tenant_id));

create policy contable_politica_deterioro_insert_auxiliar
  on public.contable_politica_deterioro for insert
  to authenticated
  with check (public.has_role(tenant_id, array['auxiliar']::public.tenant_role_t[]));

create policy contable_politica_deterioro_update_auxiliar
  on public.contable_politica_deterioro for update
  to authenticated
  using (public.has_role(tenant_id, array['auxiliar']::public.tenant_role_t[]))
  with check (public.has_role(tenant_id, array['auxiliar']::public.tenant_role_t[]));

create policy contable_politica_deterioro_tramo_select_miembro
  on public.contable_politica_deterioro_tramo for select
  to authenticated
  using (public.is_member(tenant_id));

create policy contable_politica_deterioro_tramo_insert_auxiliar
  on public.contable_politica_deterioro_tramo for insert
  to authenticated
  with check (public.has_role(tenant_id, array['auxiliar']::public.tenant_role_t[]));

create policy contable_politica_deterioro_tramo_update_auxiliar
  on public.contable_politica_deterioro_tramo for update
  to authenticated
  using (public.has_role(tenant_id, array['auxiliar']::public.tenant_role_t[]))
  with check (public.has_role(tenant_id, array['auxiliar']::public.tenant_role_t[]));

create policy contable_politica_deterioro_tramo_delete_auxiliar
  on public.contable_politica_deterioro_tramo for delete
  to authenticated
  using (public.has_role(tenant_id, array['auxiliar']::public.tenant_role_t[]));
