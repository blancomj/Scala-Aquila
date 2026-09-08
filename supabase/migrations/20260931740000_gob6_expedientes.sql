-- ═══════════════════════════════════════════════════════════════════════
--  GOB-6 · gobierno_expedientes_convivencia
--  Ver GOB_06_convivencia_sanciones.md §4.3, prueba 9, 13.
--
--  A diferencia del acta/decisión, el expediente nace numerado en el mismo
--  INSERT — reportar un hecho ya es un evento formal que necesita
--  trazabilidad desde el minuto uno, no hay "borrador" que descartar.
--
--  propietario_responsable_ref se resuelve UNA VEZ, a la fecha de los
--  hechos (fn_propietario_responsable de GOB-0), y queda congelado — igual
--  que gobierno_asistencia.coeficiente en GOB-2: reproducible aunque la
--  propiedad del inmueble cambie después.
-- ═══════════════════════════════════════════════════════════════════════

create table public.gobierno_expediente_consecutivo (
  tenant_id     uuid not null references public.tenants (id) on delete cascade,
  anio          smallint not null,
  ultimo_numero integer not null default 0,
  updated_at    timestamptz,

  primary key (tenant_id, anio)
);

alter table public.gobierno_expediente_consecutivo enable row level security;
alter table public.gobierno_expediente_consecutivo force row level security;

create policy gobierno_expediente_consecutivo_select_miembro
  on public.gobierno_expediente_consecutivo for select
  to authenticated
  using (public.is_member(tenant_id));

create function public.fn_gobierno_siguiente_numero_expediente(p_tenant_id uuid, p_anio smallint)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_numero integer;
begin
  insert into public.gobierno_expediente_consecutivo (tenant_id, anio, ultimo_numero, updated_at)
  values (p_tenant_id, p_anio, 1, now())
  on conflict (tenant_id, anio)
  do update set ultimo_numero = public.gobierno_expediente_consecutivo.ultimo_numero + 1, updated_at = now()
  returning ultimo_numero into v_numero;

  return v_numero;
end;
$$;

create table public.gobierno_expedientes_convivencia (
  id                          uuid primary key default gen_random_uuid(),
  tenant_id                   uuid not null references public.tenants (id) on delete cascade,
  numero                      integer not null,
  anio                        smallint not null,
  infraccion_id               uuid not null references public.gobierno_infracciones (id),
  inmueble_id                 uuid not null references public.inmuebles (id),
  presunto_infractor_ref      uuid not null references public.terceros (id),
  calidad                     public.gobierno_expediente_calidad_t not null,
  propietario_responsable_ref uuid references public.terceros (id),
  fecha_hechos                date not null,
  reportado_por               uuid references public.profiles (id),
  reportado_at                timestamptz not null default now(),
  descripcion_hechos          text not null,
  etapa                       public.gobierno_expediente_etapa_t not null default 'reportado',
  estado_final                text,
  cerrado_at                  timestamptz,
  created_at                  timestamptz not null default now(),
  updated_at                  timestamptz,

  constraint gobierno_expedientes_numero_unico unique (tenant_id, anio, numero)
);

alter table public.gobierno_expedientes_convivencia enable row level security;
alter table public.gobierno_expedientes_convivencia force row level security;

create index gobierno_expedientes_tenant_idx on public.gobierno_expedientes_convivencia (tenant_id);
create index gobierno_expedientes_inmueble_idx on public.gobierno_expedientes_convivencia (inmueble_id);
create index gobierno_expedientes_infractor_idx on public.gobierno_expedientes_convivencia (presunto_infractor_ref);

comment on table public.gobierno_expedientes_convivencia is
  'GOB-6: expediente sancionatorio (art. 58-60) — nace numerado al reportar el hecho. '
  'propietario_responsable_ref se congela a fecha_hechos (fn_propietario_responsable, GOB-0), '
  'nunca se recalcula si la propiedad cambia después.';

create policy gobierno_expedientes_select_miembro
  on public.gobierno_expedientes_convivencia for select
  to authenticated
  using (public.is_member(tenant_id));

-- Sin política insert/update para `authenticated`: toda escritura pasa por
-- gobierno_reportar_expediente()/gobierno_registrar_actuacion()/
-- gobierno_imponer_sancion() (security definer), mismo criterio que
-- gobierno_actas/gobierno_decisiones.

create function public.gobierno_reportar_expediente(
  p_infraccion_id uuid,
  p_inmueble_id uuid,
  p_presunto_infractor_ref uuid,
  p_calidad public.gobierno_expediente_calidad_t,
  p_descripcion_hechos text,
  p_fecha_hechos date
)
returns public.gobierno_expedientes_convivencia
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_infraccion public.gobierno_infracciones;
  v_responsable uuid;
  v_numero integer;
  v_anio smallint;
  v_expediente public.gobierno_expedientes_convivencia;
begin
  select * into v_infraccion from public.gobierno_infracciones where id = p_infraccion_id;
  if not found then
    raise exception 'EXPEDIENTE_INFRACCION_INEXISTENTE: infraccion_id % no existe', p_infraccion_id;
  end if;

  if (select auth.uid()) is not null
     and not public.has_role(v_infraccion.tenant_id, array['auxiliar']::public.tenant_role_t[])
  then
    raise exception 'EXPEDIENTE_TRANSICION_REQUIERE_AUXILIAR: reportar un expediente exige rol '
      'auxiliar';
  end if;

  if p_calidad = 'propietario' then
    v_responsable := p_presunto_infractor_ref;
  else
    select tercero_id into v_responsable
    from public.fn_propietario_responsable(p_inmueble_id, p_fecha_hechos)
    order by porcentaje desc nulls last
    limit 1;
  end if;

  v_anio := extract(year from p_fecha_hechos)::smallint;
  v_numero := public.fn_gobierno_siguiente_numero_expediente(v_infraccion.tenant_id, v_anio);

  insert into public.gobierno_expedientes_convivencia (
    tenant_id, numero, anio, infraccion_id, inmueble_id, presunto_infractor_ref, calidad,
    propietario_responsable_ref, fecha_hechos, reportado_por, descripcion_hechos
  ) values (
    v_infraccion.tenant_id, v_numero, v_anio, p_infraccion_id, p_inmueble_id, p_presunto_infractor_ref,
    p_calidad, v_responsable, p_fecha_hechos, (select auth.uid()), p_descripcion_hechos
  )
  returning * into v_expediente;

  return v_expediente;
end;
$$;

comment on function public.gobierno_reportar_expediente(uuid, uuid, uuid, public.gobierno_expediente_calidad_t, text, date) is
  'GOB-6: crea el expediente ya numerado (nunca hay borrador), resolviendo el propietario '
  'responsable a fecha_hechos cuando el infractor no es él mismo el propietario (prueba 9).';
