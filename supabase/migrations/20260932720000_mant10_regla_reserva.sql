-- ═══════════════════════════════════════════════════════════════════════
--  MANT-10 · Reservas de zonas comunes (2/5) — mant_zona_reserva_regla
--  Casos de uso/Solicitudes - Reservas - Visitantes/MANT_10_reservas_zonas_comunes.md §3.1
--
--  Cero valores sembrados por defecto en ninguna columna de regla — cada
--  copropiedad define sus propias reglas por zona (§3.1, prueba 10).
--
--  Desviaciones frente al spec:
--   - concepto_id se declara `bigint references conceptos(id)` en el
--     documento, pero conceptos.id es uuid desde 20260814100100_domain_
--     tables.sql — se implementa como uuid, igual que cargos.concepto_id.
--   - El monto del cargo NO se agrega como columna propia de esta regla:
--     conceptos ya tiene modo_valor/valor_fijo (20260824100000, posterior
--     al spec) exactamente para un monto directo sin fórmula. Exigir que el
--     concepto_id de la regla tenga modo_valor='fijo' reutiliza ese
--     mecanismo (REGLA_RESERVA_CONCEPTO_NO_FIJO si no) — evaluar
--     formula_ael por reserva sería inventar un mecanismo de cobro propio,
--     justo lo que el spec §3.5 prohíbe.
-- ═══════════════════════════════════════════════════════════════════════

create table public.mant_zona_reserva_regla (
  id                                  uuid primary key default gen_random_uuid(),
  tenant_id                           uuid not null references public.tenants (id) on delete cascade,
  zona_comun_id                       uuid not null references public.zonas_comunes (id),
  requiere_aprobacion                 boolean not null,
  duracion_maxima_minutos             integer,
  anticipacion_minima_horas           integer,
  anticipacion_maxima_dias            integer,
  cupo_simultaneo                     integer not null default 1,
  maximo_activas_por_inmueble         integer,
  genera_cargo                        boolean not null default false,
  concepto_id                         uuid references public.conceptos (id),
  penalidad_cancelacion_tardia_horas  integer,
  vigente_desde                       date not null default current_date,
  vigente_hasta                       date,
  created_at                          timestamptz not null default now(),
  updated_at                          timestamptz,

  constraint mant_zona_reserva_regla_cupo_positivo check (cupo_simultaneo > 0),
  constraint mant_zona_reserva_regla_vigencia_valida
    check (vigente_hasta is null or vigente_hasta >= vigente_desde)
);

alter table public.mant_zona_reserva_regla enable row level security;
alter table public.mant_zona_reserva_regla force row level security;

create index mant_zona_reserva_regla_tenant_idx on public.mant_zona_reserva_regla (tenant_id);
create index mant_zona_reserva_regla_zona_idx on public.mant_zona_reserva_regla (zona_comun_id);

comment on table public.mant_zona_reserva_regla is
  'MANT-10 §3.1: reglas de reserva por zona común. No es un segundo catálogo de zonas — cada '
  'fila referencia una zonas_comunes existente. Nace vacía por tenant; una zona sin regla '
  'configurada simplemente no admite reservas (o es de acceso libre, fuera de alcance de este '
  'corte).';

comment on column public.mant_zona_reserva_regla.cupo_simultaneo is
  '1 = uso exclusivo (guard por exclude constraint en mant_reservas); > 1 = varias reservas a '
  'la vez en la misma franja (guard por conteo, ver guard_mant_reserva).';

create function public.guard_mant_zona_reserva_regla()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_modo_valor public.concepto_modo_valor_t;
begin
  if new.genera_cargo and new.concepto_id is null then
    raise exception 'REGLA_RESERVA_SIN_CONCEPTO: genera_cargo=true exige concepto_id (zona %)',
      new.zona_comun_id;
  end if;

  if new.genera_cargo then
    select modo_valor into v_modo_valor from public.conceptos where id = new.concepto_id;
    if v_modo_valor is distinct from 'fijo' then
      raise exception 'REGLA_RESERVA_CONCEPTO_NO_FIJO: el concepto % debe tener modo_valor=fijo '
        'para poder usarse en una regla de reserva (es %)', new.concepto_id,
        coalesce(v_modo_valor::text, 'inexistente');
    end if;
  end if;

  new.updated_at := now();
  return new;
end;
$$;

create trigger mant_zona_reserva_regla_guard
  before insert or update on public.mant_zona_reserva_regla
  for each row execute function public.guard_mant_zona_reserva_regla();

create policy mant_zona_reserva_regla_select_miembro
  on public.mant_zona_reserva_regla for select
  to authenticated
  using (public.is_member(tenant_id));

create policy mant_zona_reserva_regla_administrador_todo
  on public.mant_zona_reserva_regla for all
  to authenticated
  using (public.has_role(tenant_id, array['administrador']::public.tenant_role_t[]))
  with check (public.has_role(tenant_id, array['administrador']::public.tenant_role_t[]));

revoke execute on function public.guard_mant_zona_reserva_regla() from public, anon, authenticated;
