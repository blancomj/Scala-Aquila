-- ADC-01-ADD (§17/§18 PROMPT_01_ADAPTACION_COMERCIAL_CORE): no retroactividad
-- de tipo/uso/agrupación. coeficiente (coeficiente_sets) y relación
-- (inmueble_persona_rol) ya tenían vigencia temporal; tipo_id/uso_predio_id/
-- agrupacion_id se leían "en vivo" de inmuebles en snapshot-supabase.ts —
-- re-simular un periodo pasado después de que un inmueble cambiara de uso
-- habría usado el valor ACTUAL, no el vigente en ese periodo. Mismo patrón
-- que inmueble_persona_rol: tabla histórica con vigente_desde/vigente_hasta,
-- poblada solo por trigger (nunca por el cliente), resuelta por
-- snapshot-supabase.ts a la fecha del periodo que se liquida.
create table public.inmueble_atributo_historico (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  inmueble_id uuid not null references public.inmuebles (id) on delete cascade,
  tipo_id bigint not null references public.lista_tipos (id),
  uso_predio_id bigint references public.lista_tipos (id),
  agrupacion_id uuid references public.agrupaciones (id),
  vigente_desde date not null,
  vigente_hasta date,
  created_at timestamptz not null default now(),
  constraint inmueble_atributo_historico_fechas_validas
    check (vigente_hasta is null or vigente_hasta >= vigente_desde)
);

comment on table public.inmueble_atributo_historico is
  'ADC-01-ADD (§17/§18): historia de tipo_id/uso_predio_id/agrupacion_id de un inmueble con vigencia temporal (mismo patrón que inmueble_persona_rol). construirSnapshotDesdeSupabase() resuelve la fila vigente al primer día del periodo liquidado, no el valor actual de inmuebles — así re-simular un periodo pasado no cambia tras un cambio físico posterior. Poblada únicamente por fn_inmueble_atributo_historico_sincronizar (trigger en inmuebles); sin política de insert/update/delete para el cliente.';

create index inmueble_atributo_historico_inmueble_idx
  on public.inmueble_atributo_historico (inmueble_id, vigente_desde);

-- A lo sumo una fila abierta (vigente_hasta is null) por inmueble.
create unique index inmueble_atributo_historico_un_vigente
  on public.inmueble_atributo_historico (inmueble_id)
  where vigente_hasta is null;

alter table public.inmueble_atributo_historico enable row level security;
alter table public.inmueble_atributo_historico force row level security;

create policy inmueble_atributo_historico_select_miembro
  on public.inmueble_atributo_historico for select
  to authenticated
  using (public.is_member(tenant_id));

-- Sin insert/update/delete para authenticated: la escritura es responsabilidad
-- exclusiva del trigger (security definer, más abajo).

-- ── trigger: sincroniza la historia cuando inmuebles.tipo_id/uso_predio_id/
--    agrupacion_id cambia (o se crea el inmueble) ─────────────────────────
create function public.fn_inmueble_atributo_historico_sincronizar()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if TG_OP = 'INSERT' then
    insert into public.inmueble_atributo_historico
      (tenant_id, inmueble_id, tipo_id, uso_predio_id, agrupacion_id, vigente_desde)
    values
      (new.tenant_id, new.id, new.tipo_id, new.uso_predio_id, new.agrupacion_id, current_date);
    return new;
  end if;

  -- UPDATE: solo actúa si alguno de los 3 campos versionados realmente cambió.
  if new.tipo_id is distinct from old.tipo_id
     or new.uso_predio_id is distinct from old.uso_predio_id
     or new.agrupacion_id is distinct from old.agrupacion_id then

    -- Ya hubo un cambio HOY para este inmueble: corrige la fila abierta en
    -- vez de fragmentar la historia con una entrada de duración cero.
    update public.inmueble_atributo_historico
       set tipo_id = new.tipo_id,
           uso_predio_id = new.uso_predio_id,
           agrupacion_id = new.agrupacion_id
     where inmueble_id = new.id
       and vigente_hasta is null
       and vigente_desde = current_date;

    if not found then
      update public.inmueble_atributo_historico
         set vigente_hasta = current_date - 1
       where inmueble_id = new.id
         and vigente_hasta is null;

      insert into public.inmueble_atributo_historico
        (tenant_id, inmueble_id, tipo_id, uso_predio_id, agrupacion_id, vigente_desde)
      values
        (new.tenant_id, new.id, new.tipo_id, new.uso_predio_id, new.agrupacion_id, current_date);
    end if;
  end if;

  return new;
end;
$$;

comment on function public.fn_inmueble_atributo_historico_sincronizar() is
  'ADC-01-ADD (§18): mantiene inmueble_atributo_historico en sincronía con inmuebles.tipo_id/uso_predio_id/agrupacion_id. INSERT siembra la fila inicial; UPDATE cierra la vigente (vigente_hasta = ayer) y abre una nueva solo si alguno de los 3 campos cambió — varios cambios el mismo día corrigen la fila de hoy en vez de fragmentar.';

create trigger inmueble_atributo_historico_insert
  after insert on public.inmuebles
  for each row execute function public.fn_inmueble_atributo_historico_sincronizar();

create trigger inmueble_atributo_historico_update
  after update on public.inmuebles
  for each row execute function public.fn_inmueble_atributo_historico_sincronizar();

-- ── backfill: una fila por inmueble existente, vigente_desde muy anterior a
--    cualquier periodo real del sistema — preserva exactamente el
--    comportamiento actual (lectura en vivo) para todo periodo ya existente,
--    sin inventar una fecha de cambio que nunca ocurrió.
insert into public.inmueble_atributo_historico
  (tenant_id, inmueble_id, tipo_id, uso_predio_id, agrupacion_id, vigente_desde)
select tenant_id, id, tipo_id, uso_predio_id, agrupacion_id, date '2000-01-01'
from public.inmuebles;
