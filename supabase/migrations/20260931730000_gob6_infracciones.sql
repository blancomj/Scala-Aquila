-- ═══════════════════════════════════════════════════════════════════════
--  GOB-6 · gobierno_infracciones — tipificación por copropiedad, art. 59/60
--  Ver GOB_06_convivencia_sanciones.md §4.2.
--
--  Cero infracciones sembradas por defecto (marco: un catálogo genérico de
--  "ruido después de las 10 p.m." sería exactamente la tipificación
--  inventada que la ley prohíbe) — cada copropiedad registra las suyas
--  desde su propio reglamento.
-- ═══════════════════════════════════════════════════════════════════════

create table public.gobierno_infracciones (
  id                          uuid primary key default gen_random_uuid(),
  tenant_id                   uuid not null references public.tenants (id) on delete cascade,
  codigo                      text not null,
  nombre                      text not null,
  descripcion                 text,
  reglamento_referencia       text not null,
  documento_id                uuid references public.documentos (id),
  clases_sancion_permitidas   text[] not null default '{}',
  es_no_pecuniaria            boolean not null default true,
  vigente_desde               date not null default current_date,
  vigente_hasta               date,
  created_at                  timestamptz not null default now(),
  updated_at                  timestamptz,

  constraint gobierno_infracciones_codigo_unico unique (tenant_id, codigo),
  constraint gobierno_infracciones_fechas_validas check (vigente_hasta is null or vigente_hasta >= vigente_desde)
);

alter table public.gobierno_infracciones enable row level security;
alter table public.gobierno_infracciones force row level security;

create index gobierno_infracciones_tenant_idx on public.gobierno_infracciones (tenant_id);

comment on table public.gobierno_infracciones is
  'GOB-6: lo que el reglamento de ESTA copropiedad tipifica como infracción (art. 59/60) — nunca '
  'sembrada, siempre capturada desde el reglamento real. reglamento_referencia obligatoria y no '
  'vacía (INFRACCION_SIN_TIPIFICACION): sin cita del reglamento la sanción sería ilegal, el '
  'sistema no permite ni siquiera crear la infracción.';
comment on column public.gobierno_infracciones.es_no_pecuniaria is
  'Declarativo (spec §4.2): el art. 59 solo autoriza sancionar incumplimientos NO pecuniarios — '
  'la mora en expensas tiene su propio régimen en cartera. Cómo detectar automáticamente que una '
  'infracción es pecuniaria queda como pregunta para el abogado (GOB_06_INFORME.md); mientras '
  'tanto, es una declaración explícita de quien tipifica, no inferida.';
comment on column public.gobierno_infracciones.clases_sancion_permitidas is
  'Subconjunto de gobierno_clase_sancion.codigo permitido para ESTA infracción — validado contra '
  'el catálogo global por el guard (INFRACCION_CLASE_SANCION_INVALIDA), no una FK de array '
  '(Postgres no soporta FK sobre elementos de un array).';

create policy gobierno_infracciones_select_miembro
  on public.gobierno_infracciones for select
  to authenticated
  using (public.is_member(tenant_id));

create policy gobierno_infracciones_insert_auxiliar
  on public.gobierno_infracciones for insert
  to authenticated
  with check (public.has_role(tenant_id, array['auxiliar']::public.tenant_role_t[]));

create policy gobierno_infracciones_update_auxiliar
  on public.gobierno_infracciones for update
  to authenticated
  using (public.has_role(tenant_id, array['auxiliar']::public.tenant_role_t[]))
  with check (public.has_role(tenant_id, array['auxiliar']::public.tenant_role_t[]));

create function public.guard_gobierno_infraccion()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_codigo text;
begin
  if coalesce(btrim(new.reglamento_referencia), '') = '' then
    raise exception 'INFRACCION_SIN_TIPIFICACION: reglamento_referencia es obligatoria y no '
      'puede estar vacía — sin cita del reglamento la sanción sería ilegal (art. 59/60)';
  end if;

  foreach v_codigo in array new.clases_sancion_permitidas loop
    if not exists (select 1 from public.gobierno_clase_sancion where codigo = v_codigo) then
      raise exception 'INFRACCION_CLASE_SANCION_INVALIDA: % no es una clase de sanción del '
        'catálogo del art. 59', v_codigo;
    end if;
  end loop;

  new.updated_at := now();
  return new;
end;
$$;

comment on function public.guard_gobierno_infraccion() is
  'GOB-6: INFRACCION_SIN_TIPIFICACION (prueba 6), INFRACCION_CLASE_SANCION_INVALIDA (data '
  'integrity del array contra el catálogo global).';

create trigger guard_gobierno_infraccion
  before insert or update on public.gobierno_infracciones
  for each row execute function public.guard_gobierno_infraccion();
