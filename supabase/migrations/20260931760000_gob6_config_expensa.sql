-- ═══════════════════════════════════════════════════════════════════════
--  GOB-6 · gobierno_config_expensa_necesaria — base del tope de multa
--  Ver GOB_06_convivencia_sanciones.md §4.5.
--
--  "Qué conceptos cuentan como expensa necesaria mensual" es pregunta para
--  el abogado y el contador (spec §4.5) — mientras no haya respuesta, se
--  exige selección EXPLÍCITA por tenant, nunca inferida (p.ej. por nombre
--  del concepto o por ser el primero creado). Sin configurar,
--  fn_gobierno_expensa_necesaria_mensual() falla explícito
--  (SANCION_BASE_EXPENSA_NO_CONFIGURADA) en vez de asumir un valor.
-- ═══════════════════════════════════════════════════════════════════════

create table public.gobierno_config_expensa_necesaria (
  tenant_id   uuid not null references public.tenants (id) on delete cascade,
  concepto_id uuid not null references public.conceptos (id),
  created_at  timestamptz not null default now(),

  primary key (tenant_id, concepto_id)
);

alter table public.gobierno_config_expensa_necesaria enable row level security;
alter table public.gobierno_config_expensa_necesaria force row level security;

comment on table public.gobierno_config_expensa_necesaria is
  'GOB-6 §4.5: qué conceptos cuentan como "expensas necesarias mensuales a cargo del infractor" '
  'para el tope de la multa (art. 59 num. 2) — selección explícita por tenant, nunca inferida. '
  'Puede tener varias filas si la cuota ordinaria se factura en más de un concepto.';

create policy gobierno_config_expensa_necesaria_select_miembro
  on public.gobierno_config_expensa_necesaria for select
  to authenticated
  using (public.is_member(tenant_id));

create policy gobierno_config_expensa_necesaria_insert_auxiliar
  on public.gobierno_config_expensa_necesaria for insert
  to authenticated
  with check (public.has_role(tenant_id, array['auxiliar']::public.tenant_role_t[]));

create policy gobierno_config_expensa_necesaria_delete_auxiliar
  on public.gobierno_config_expensa_necesaria for delete
  to authenticated
  using (public.has_role(tenant_id, array['auxiliar']::public.tenant_role_t[]));

create function public.fn_gobierno_expensa_necesaria_mensual(p_inmueble_id uuid, p_fecha date)
returns numeric
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  v_tenant_id  uuid;
  v_periodo_id uuid;
  v_total      numeric(18, 2);
begin
  select tenant_id into v_tenant_id from public.inmuebles where id = p_inmueble_id;
  if v_tenant_id is null then
    raise exception 'SANCION_INMUEBLE_INEXISTENTE: inmueble % no existe', p_inmueble_id;
  end if;

  if not exists (select 1 from public.gobierno_config_expensa_necesaria where tenant_id = v_tenant_id) then
    raise exception 'SANCION_BASE_EXPENSA_NO_CONFIGURADA: el tenant % no ha configurado qué '
      'conceptos cuentan como expensa necesaria mensual (gobierno_config_expensa_necesaria) — '
      'no se infiere (art. 59 num. 2)', v_tenant_id;
  end if;

  select id into v_periodo_id
  from public.periodos
  where tenant_id = v_tenant_id
    and anio = extract(year from p_fecha)::int
    and mes = extract(month from p_fecha)::int;

  if v_periodo_id is null then
    raise exception 'SANCION_PERIODO_INEXISTENTE: no existe periodo %-% para el tenant %',
      extract(year from p_fecha), extract(month from p_fecha), v_tenant_id;
  end if;

  select coalesce(sum(c.monto_original), 0) into v_total
  from public.cargos c
  where c.inmueble_id = p_inmueble_id
    and c.periodo_id = v_periodo_id
    and c.concepto_id in (
      select concepto_id from public.gobierno_config_expensa_necesaria where tenant_id = v_tenant_id
    );

  return v_total;
end;
$$;

comment on function public.fn_gobierno_expensa_necesaria_mensual(uuid, date) is
  'GOB-6 §4.5: suma de cargos del inmueble, en el periodo de la fecha dada, restringida a los '
  'conceptos que el tenant marcó explícitamente en gobierno_config_expensa_necesaria — la base '
  'del tope de multa (art. 59 num. 2). numeric(18,2), nunca float (financial-kernel si sube a TS).';
