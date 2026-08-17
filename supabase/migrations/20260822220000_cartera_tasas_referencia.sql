-- ═══════════════════════════════════════════════════════════════════════
--  CAR F2 (parcial) · Tasa de mora trazable a resolución
--  Propietario: Docs/Motor de gestion de cartera/CAR_00_Guia_Oficial.md §3.4/§13.3
--
--  GAP-CAR-004: interes_tasa_mensual/interes_tope_mensual son hoy números
--  sueltos sin fuente. Art. 30 Ley 675/2001: el tope es 1.5 × Interés
--  Bancario Corriente certificado por la Superintendencia Financiera — la
--  asamblea puede fijar menos, nunca más.
--
--  tasas_referencia es GLOBAL (sin tenant_id) — única excepción documentada
--  a REC-CAR-007: el IBC es el mismo para todo el país, no por copropiedad.
--
--  valor_mensual se REGISTRA, no se deriva por fórmula: VER-CAR-01 (¿el
--  1.5× se aplica sobre la tasa EA o sobre su equivalente mensual? ¿qué
--  convención de capitalización?) sigue sin verificar jurídicamente. Este
--  esquema no inventa una respuesta — quien registra la resolución declara
--  ambos valores tal como los interpreta, y esa interpretación queda
--  trazada por resolucion_numero/fecha, nunca oculta en una fórmula.
-- ═══════════════════════════════════════════════════════════════════════

create type public.tipo_tasa_referencia_t as enum ('ibc_consumo_ordinario');

create table public.tasas_referencia (
  id                uuid primary key default gen_random_uuid(),
  tipo_tasa         public.tipo_tasa_referencia_t not null,
  vigente_desde     date not null,
  vigente_hasta     date,
  valor_ea          numeric(8, 6) not null,
  -- VER-CAR-01: declarado por quien registra la resolución, no derivado.
  valor_mensual     numeric(8, 6) not null,
  resolucion_numero text not null,
  resolucion_fecha  date not null,
  entidad_fuente    text not null default 'Superintendencia Financiera de Colombia',
  url_fuente        text,
  registrada_por    uuid references public.profiles (id),
  created_at        timestamptz not null default now(),

  constraint tasas_referencia_vigencia_valida
    check (vigente_hasta is null or vigente_hasta >= vigente_desde),
  constraint tasas_referencia_valores_positivos
    check (valor_ea > 0 and valor_mensual > 0)
);

alter table public.tasas_referencia enable row level security;
alter table public.tasas_referencia force row level security;

-- Sin solape de vigencias para el mismo tipo_tasa — a cualquier fecha,
-- como mucho una tasa certificada aplica.
create extension if not exists btree_gist;
alter table public.tasas_referencia
  add constraint tasas_referencia_sin_solape
  exclude using gist (
    tipo_tasa with =,
    daterange(vigente_desde, coalesce(vigente_hasta, 'infinity'::date), '[]') with &&
  );

create index tasas_referencia_tipo_vigencia_idx
  on public.tasas_referencia (tipo_tasa, vigente_desde);

comment on table public.tasas_referencia is
  'Tasas de referencia certificadas oficialmente (hoy, IBC de la Superintendencia '
  'Financiera — art. 30 Ley 675/2001). GLOBAL, sin tenant_id (única excepción a '
  'REC-CAR-007): la ley es la misma para toda copropiedad. Append-only — corregir '
  'un registro erróneo es uno nuevo con vigente_desde correcta, nunca un UPDATE. '
  'Actualizar el valor mensual es tarea operativa (CAR §3.4), no un despliegue de código.';

create trigger tasas_referencia_append_only
  before update or delete on public.tasas_referencia
  for each row execute function public.forbid_mutation();

-- Lectura abierta a cualquier usuario autenticado (es información pública,
-- igual para todos los tenants). Escritura solo por administración de
-- plataforma — un agent de una copropiedad no puede fijar una tasa
-- nacional.
create policy tasas_referencia_select_authenticated
  on public.tasas_referencia for select
  to authenticated
  using (true);

create policy tasas_referencia_insert_platform_admin
  on public.tasas_referencia for insert
  to authenticated
  with check (public.is_platform_admin());

-- ── politicas_financieras: declarar QUÉ tasa de referencia justifica el
--    tope configurado — ambas columnas nullable, retrocompatible con toda
--    política existente (mismo patrón que interes_day_count, D-23) ───────
alter table public.politicas_financieras
  add column interes_tipo_tasa      public.tipo_tasa_referencia_t,
  add column interes_multiplicador  numeric(4, 2);

comment on column public.politicas_financieras.interes_tipo_tasa is
  'GAP-CAR-004. Si se declara (junto con interes_multiplicador), '
  'guard_politica_financiera_tope_legal exige que interes_tasa_mensual e '
  'interes_tope_mensual no excedan multiplicador × tasas_referencia.valor_mensual '
  'vigente. NULL = sin trazar a una fuente (compatibilidad con políticas anteriores '
  'a este cambio) — el cálculo de interés no cambia; solo se pierde la validación.';

comment on column public.politicas_financieras.interes_multiplicador is
  'Art. 30 Ley 675/2001: el tope legal es 1.5 (la asamblea puede fijar un multiplicador '
  'menor, nunca mayor). Ver comentario de interes_tipo_tasa.';

-- ── guard: si la política declara tipo_tasa/multiplicador, el tope
--    configurado no puede exceder lo que esa tasa de referencia permite ──
create function public.guard_politica_financiera_tope_legal()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_valor_mensual_referencia numeric(8, 6);
  v_tope_legal numeric(8, 6);
begin
  if new.estado <> 'vigente' then
    return new;
  end if;
  if TG_OP = 'UPDATE' and old.estado = 'vigente' then
    return new;
  end if;

  -- Sin tipo/multiplicador declarados, no hay contra qué validar —
  -- retrocompatible con políticas anteriores a GAP-CAR-004.
  if new.interes_tipo_tasa is null or new.interes_multiplicador is null then
    return new;
  end if;

  select valor_mensual into v_valor_mensual_referencia
    from public.tasas_referencia
   where tipo_tasa = new.interes_tipo_tasa
     and vigente_desde <= coalesce(new.vigente_desde, current_date)
     and (vigente_hasta is null or vigente_hasta >= coalesce(new.vigente_desde, current_date))
   order by vigente_desde desc
   limit 1;

  if v_valor_mensual_referencia is null then
    raise exception 'TASA_REFERENCIA_NO_ENCONTRADA: no hay una tasa de referencia % '
      'vigente a la fecha de la política % (CAR §3.4)', new.interes_tipo_tasa, new.id;
  end if;

  v_tope_legal := new.interes_multiplicador * v_valor_mensual_referencia;

  if new.interes_tope_mensual is not null and new.interes_tope_mensual > v_tope_legal then
    raise exception 'INTERES_EXCEDE_TOPE_LEGAL: interes_tope_mensual (%) excede % × tasa '
      'de referencia vigente (%) = % — art. 30 Ley 675 de 2001 (CAR §3.1)',
      new.interes_tope_mensual, new.interes_multiplicador, v_valor_mensual_referencia,
      v_tope_legal;
  end if;

  if new.interes_tasa_mensual is not null and new.interes_tasa_mensual > v_tope_legal then
    raise exception 'INTERES_EXCEDE_TOPE_LEGAL: interes_tasa_mensual (%) excede % × tasa '
      'de referencia vigente (%) = % — art. 30 Ley 675 de 2001 (CAR §3.1)',
      new.interes_tasa_mensual, new.interes_multiplicador, v_valor_mensual_referencia,
      v_tope_legal;
  end if;

  return new;
end;
$$;

create trigger guard_politica_financiera_tope_legal
  before insert or update on public.politicas_financieras
  for each row execute function public.guard_politica_financiera_tope_legal();

comment on function public.guard_politica_financiera_tope_legal() is
  'PH-C36/PH-C37: rechaza activar una política financiera cuyo interés de mora '
  'excede multiplicador × la tasa de referencia declarada. La asamblea puede fijar '
  'menos que el tope (art. 30 L675, PH-C37), nunca más (PH-C36).';
