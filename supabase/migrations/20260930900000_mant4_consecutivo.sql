-- ═══════════════════════════════════════════════════════════════════════
--  MANT-4 · Incidencias y órdenes de trabajo (2/9)
--
--  Consecutivo sin huecos, copia estructural de contable_consecutivo/
--  fn_contable_siguiente_numero (CO-2, 20260930210000) — NO se reutiliza
--  esa tabla contable (mezclaría series de incidencia/OT con comprobantes
--  contables) ni consecutivos_documento (RC-3, 20260903150000): ese otro
--  ya existente no lleva `anio` — numera corrido para siempre, y el corte
--  exige numeración que resetea cada año ("patrón de CO-2").
-- ═══════════════════════════════════════════════════════════════════════

create table public.mant_consecutivo (
  tenant_id     uuid not null references public.tenants (id) on delete cascade,
  anio          smallint not null,
  serie_id      bigint not null references public.lista_tipos (id),
  ultimo_numero integer not null default 0,
  updated_at    timestamptz,

  primary key (tenant_id, anio, serie_id)
);

alter table public.mant_consecutivo enable row level security;
alter table public.mant_consecutivo force row level security;

comment on table public.mant_consecutivo is
  'MANT-4: consecutivo sin huecos por (tenant, año, serie) — serie_id resuelve contra '
  'MANT_SERIE_CONSECUTIVO (''incidencia''/''orden_trabajo''). Copia estructural de '
  'contable_consecutivo (CO-2); sin policy de escritura para authenticated, solo '
  'fn_mant_siguiente_numero (SECURITY DEFINER) incrementa.';

create policy mant_consecutivo_select_miembro
  on public.mant_consecutivo for select
  to authenticated
  using (public.is_member(tenant_id));

create function public.fn_mant_siguiente_numero(p_tenant_id uuid, p_anio smallint, p_serie_id bigint)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_numero integer;
begin
  insert into public.mant_consecutivo (tenant_id, anio, serie_id, ultimo_numero, updated_at)
  values (p_tenant_id, p_anio, p_serie_id, 1, now())
  on conflict (tenant_id, anio, serie_id)
  do update set ultimo_numero = public.mant_consecutivo.ultimo_numero + 1, updated_at = now()
  returning ultimo_numero into v_numero;

  return v_numero;
end;
$$;

comment on function public.fn_mant_siguiente_numero(uuid, smallint, bigint) is
  'Consecutivo atómico por (tenant, año, serie) — INSERT...ON CONFLICT DO UPDATE...RETURNING en '
  'un solo paso (mismo patrón que fn_contable_siguiente_numero, CO-2), nunca sequence.';
