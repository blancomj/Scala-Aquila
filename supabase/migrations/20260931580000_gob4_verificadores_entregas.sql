-- ═══════════════════════════════════════════════════════════════════════
--  GOB-4 · Comisión verificadora y derecho a copia (art. 47 inc. 2 y par.)
--  Ver GOB_04_acta.md §4.3, §4.5.
--
--  gobierno_acta_verificadores.designado_en_decision_id: uuid SIN FK — GOB-5
--  (decisiones) todavía no existe. Mismo patrón ya establecido en
--  gobierno_miembros.decision_id (GOB-1, 20260931380000): se conecta cuando
--  GOB-5 exista.
--
--  gobierno_acta_entregas es una tabla NUEVA no listada explícitamente en
--  §4.1 del corte, pero exigida por su propio §4.5 ("registro de cada
--  solicitud de copia y de cada entrega... campo para registrar una
--  negativa y su motivo") — no existe ninguna tabla reutilizable para esto
--  (grep: sin resultados).
-- ═══════════════════════════════════════════════════════════════════════

create table public.gobierno_acta_verificadores (
  id                        uuid primary key default gen_random_uuid(),
  tenant_id                 uuid not null references public.tenants (id) on delete cascade,
  acta_id                   uuid not null references public.gobierno_actas (id) on delete cascade,
  tercero_id                uuid not null references public.terceros (id),
  designado_en_decision_id  uuid,
  plazo_limite              date not null,
  verificado_at             timestamptz,
  observaciones             text,
  created_at                timestamptz not null default now(),
  updated_at                timestamptz
);

alter table public.gobierno_acta_verificadores enable row level security;
alter table public.gobierno_acta_verificadores force row level security;

create index gobierno_acta_verificadores_tenant_idx on public.gobierno_acta_verificadores (tenant_id);
create index gobierno_acta_verificadores_acta_idx on public.gobierno_acta_verificadores (acta_id);

comment on table public.gobierno_acta_verificadores is
  'GOB-4: comisión verificadora del acta (art. 47 inc. 2) — opcional, existe solo si la asamblea '
  'la designó. Al designar el primer verificador, el acta pasa de borrador a en_verificacion '
  '(guard_gobierno_acta_verificador). plazo_limite no puede exceder 20 días hábiles desde la '
  'reunión (VERIFICACION_PLAZO_EXCEDE_LEGAL) — el del reglamento es válido solo si es MENOR.';

comment on column public.gobierno_acta_verificadores.designado_en_decision_id is
  'Sin FK: GOB-5 (decisiones) todavía no existe. Se conecta cuando exista, mismo patrón que '
  'gobierno_miembros.decision_id (GOB-1).';

create policy gobierno_acta_verificadores_select_miembro
  on public.gobierno_acta_verificadores for select
  to authenticated
  using (public.is_member(tenant_id));

create policy gobierno_acta_verificadores_insert_auxiliar
  on public.gobierno_acta_verificadores for insert
  to authenticated
  with check (public.has_role(tenant_id, array['auxiliar']::public.tenant_role_t[]));

create policy gobierno_acta_verificadores_update_auxiliar
  on public.gobierno_acta_verificadores for update
  to authenticated
  using (public.has_role(tenant_id, array['auxiliar']::public.tenant_role_t[]))
  with check (public.has_role(tenant_id, array['auxiliar']::public.tenant_role_t[]));

create function public.guard_gobierno_acta_verificador()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_acta record;
  v_plazo_maximo date;
begin
  select a.tenant_id, a.estado, r.fecha_hora into v_acta
  from public.gobierno_actas a
  join public.gobierno_reuniones r on r.id = a.reunion_id
  where a.id = new.acta_id;

  if v_acta.tenant_id is distinct from new.tenant_id then
    raise exception 'VERIFICACION_ACTA_INVALIDA: acta_id % no pertenece al tenant %', new.acta_id, new.tenant_id;
  end if;

  v_plazo_maximo := public.gobierno_sumar_dias_habiles(v_acta.fecha_hora::date, 20);
  if new.plazo_limite > v_plazo_maximo then
    raise exception 'VERIFICACION_PLAZO_EXCEDE_LEGAL: % excede el plazo legal (máximo % — 20 días '
      'hábiles desde la reunión, Ley 675 art. 47 inc. 2)', new.plazo_limite, v_plazo_maximo;
  end if;

  if v_acta.estado = 'borrador' then
    update public.gobierno_actas set estado = 'en_verificacion', updated_at = now() where id = new.acta_id;
  end if;

  return new;
end;
$$;

comment on function public.guard_gobierno_acta_verificador() is
  'GOB-4: VERIFICACION_ACTA_INVALIDA (tenant), VERIFICACION_PLAZO_EXCEDE_LEGAL (techo de 20 días '
  'hábiles, art. 47 inc. 2 — TECHO LEGAL IMPERATIVO, marco §3). Al designar el primer verificador, '
  'mueve el acta de borrador a en_verificacion (prueba 12: no pasa directo a suscrita).';

create trigger guard_gobierno_acta_verificador
  before insert on public.gobierno_acta_verificadores
  for each row execute function public.guard_gobierno_acta_verificador();

create trigger set_updated_at before update on public.gobierno_acta_verificadores
  for each row execute function public.set_updated_at();

-- ── derecho a copia: registro de solicitudes, entregas y negativas ───────
create table public.gobierno_acta_entregas (
  id               uuid primary key default gen_random_uuid(),
  tenant_id        uuid not null references public.tenants (id) on delete cascade,
  acta_id          uuid not null references public.gobierno_actas (id) on delete cascade,
  tipo             text not null check (tipo in ('solicitud', 'entrega', 'negativa')),
  solicitante_ref  uuid references public.terceros (id),
  fecha            timestamptz not null default now(),
  motivo_negativa  text,
  observaciones    text,
  created_at       timestamptz not null default now(),

  constraint gobierno_acta_entregas_negativa_con_motivo check (tipo <> 'negativa' or motivo_negativa is not null)
);

alter table public.gobierno_acta_entregas enable row level security;
alter table public.gobierno_acta_entregas force row level security;

create index gobierno_acta_entregas_tenant_idx on public.gobierno_acta_entregas (tenant_id);
create index gobierno_acta_entregas_acta_idx on public.gobierno_acta_entregas (acta_id);

comment on table public.gobierno_acta_entregas is
  'GOB-4: registro de cada solicitud de copia, entrega y negativa del acta (art. 47 par.) — es la '
  'defensa del administrador ante una reclamación al alcalde: prueba que la copia se entregó (o '
  'por qué se negó). La primera entrega publica el acta (gobierno_actas.puesta_a_disposicion_at).';

create policy gobierno_acta_entregas_select_miembro
  on public.gobierno_acta_entregas for select
  to authenticated
  using (public.is_member(tenant_id));

create policy gobierno_acta_entregas_insert_auxiliar
  on public.gobierno_acta_entregas for insert
  to authenticated
  with check (public.has_role(tenant_id, array['auxiliar']::public.tenant_role_t[]));

create function public.guard_gobierno_acta_entrega()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_acta record;
begin
  select tenant_id, estado, puesta_a_disposicion_at into v_acta
  from public.gobierno_actas where id = new.acta_id;

  if v_acta.tenant_id is distinct from new.tenant_id then
    raise exception 'ENTREGA_ACTA_INVALIDA: acta_id % no pertenece al tenant %', new.acta_id, new.tenant_id;
  end if;
  if v_acta.estado not in ('suscrita', 'publicada') then
    raise exception 'ENTREGA_ACTA_NO_SUSCRITA: el acta % todavía no está suscrita — no hay copia '
      'que entregar (art. 47)', new.acta_id;
  end if;

  if new.tipo = 'entrega' and v_acta.puesta_a_disposicion_at is null then
    update public.gobierno_actas
    set estado = 'publicada', puesta_a_disposicion_at = new.fecha, updated_at = now()
    where id = new.acta_id;
  end if;

  return new;
end;
$$;

comment on function public.guard_gobierno_acta_entrega() is
  'GOB-4: ENTREGA_ACTA_INVALIDA (tenant), ENTREGA_ACTA_NO_SUSCRITA. La primera entrega real '
  '(tipo=entrega) mueve el acta a publicada y congela puesta_a_disposicion_at — entregas '
  'posteriores no la vuelven a mover.';

create trigger guard_gobierno_acta_entrega
  before insert on public.gobierno_acta_entregas
  for each row execute function public.guard_gobierno_acta_entrega();
