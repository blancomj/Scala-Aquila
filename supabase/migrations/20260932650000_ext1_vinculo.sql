-- ═══════════════════════════════════════════════════════════════════════
--  EXT-01 · actor_externo_vinculo (Hito 4)
--
--  El vínculo entre una cuenta real de auth.users y un rol concreto sobre
--  un inmueble — nunca contra memberships (AD-37, la regla que no se
--  negocia de APENDICE_EXT.md).
--
--  Desviación deliberada frente al spec original (EXT_01_identidad_actor_
--  externo.md §3.1, que pedía `persona_ref uuid -- propietario_id o
--  tenedor_id`): esas dos tablas ya no existen así — D-60 (GOB-0) las
--  unificó en terceros/inmueble_persona_rol antes de que este corte se
--  escribiera. persona_rol_id referencia directo inmueble_persona_rol.id,
--  que ya trae tercero_id/inmueble_id/rol_id/vigencia en una sola fila —
--  esto también simplifica la revocación automática (20260932680000) a un
--  solo trigger genérico en vez de dos mecanismos separados por tipo de
--  persona.
--
--  Mutabilidad: NO es append-only puro. vigente_hasta es la única columna
--  editable después del alta (revocación manual por staff o automática por
--  el trigger de 20260932680000) — todo lo demás es inmutable, guardado
--  por trigger, mismo criterio que guard_privileged_columns (E1) pero
--  aplicado aquí a una tabla de dominio en vez de a profiles.
-- ═══════════════════════════════════════════════════════════════════════

create table public.actor_externo_vinculo (
  id               uuid primary key default gen_random_uuid(),
  tenant_id        uuid not null references public.tenants (id) on delete cascade,
  auth_user_id     uuid not null references auth.users (id) on delete cascade,
  persona_rol_id   uuid not null references public.inmueble_persona_rol (id),
  persona_tipo     public.actor_externo_persona_t not null,
  origen           public.actor_externo_origen_t not null,
  vigente_desde    date not null default current_date,
  vigente_hasta    date,
  creado_at        timestamptz not null default now(),
  creado_por       uuid references public.profiles (id)
);

alter table public.actor_externo_vinculo enable row level security;
alter table public.actor_externo_vinculo force row level security;

create index actor_externo_vinculo_tenant_idx on public.actor_externo_vinculo (tenant_id);
create index actor_externo_vinculo_auth_user_idx on public.actor_externo_vinculo (auth_user_id);
create index actor_externo_vinculo_persona_rol_idx on public.actor_externo_vinculo (persona_rol_id);

comment on table public.actor_externo_vinculo is
  'EXT-01 §3.1 — vínculo auth.users -> inmueble_persona_rol de un actor externo. NUNCA una fila '
  'en memberships (AD-37). persona_rol_id referencia inmueble_persona_rol.id directo (no un split '
  'propietario_id/tenedor_id, que ya no existe tras D-60/GOB-0) — un tercero puede tener varios '
  'vínculos vigentes (varios inmuebles, incluso varios tenant_id).';

comment on column public.actor_externo_vinculo.persona_tipo is
  'Snapshot del rol al momento del alta (derivado de inmueble_persona_rol.rol_id) — no se '
  'recalcula si el rol subyacente cambia después; ver comment on type.';

-- ── Guard central: conflicto con membresía, duplicado, y mutabilidad ────
create function public.guard_actor_externo_vinculo()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_conflicto boolean;
  v_solapa boolean;
begin
  if new.vigente_hasta is not null and new.vigente_hasta < new.vigente_desde then
    raise exception 'ACTOR_EXTERNO_VIGENCIA_INVALIDA: vigente_hasta no puede ser anterior a vigente_desde';
  end if;

  if tg_op = 'UPDATE' then
    if old.tenant_id is distinct from new.tenant_id
      or old.auth_user_id is distinct from new.auth_user_id
      or old.persona_rol_id is distinct from new.persona_rol_id
      or old.persona_tipo is distinct from new.persona_tipo
      or old.origen is distinct from new.origen
      or old.vigente_desde is distinct from new.vigente_desde
      or old.creado_at is distinct from new.creado_at
      or old.creado_por is distinct from new.creado_por
    then
      raise exception 'ACTOR_EXTERNO_VINCULO_INMUTABLE: solo vigente_hasta es editable tras el alta';
    end if;
    return new;
  end if;

  -- tg_op = 'INSERT' desde aquí.
  select exists (
    select 1 from public.memberships m
    where m.user_id = new.auth_user_id and m.tenant_id = new.tenant_id
  ) into v_conflicto;
  if v_conflicto then
    raise exception 'ACTOR_EXTERNO_CONFLICTO_MEMBRESIA: % ya es tenant_member de este tenant', new.auth_user_id;
  end if;

  if new.origen = 'autoverificacion' and not exists (
    select 1
    from public.inmueble_persona_rol ipr
    join public.terceros t on t.id = ipr.tercero_id
    join public.actor_externo_otp o
      on o.usado_at is not null
     and o.usado_at >= now() - interval '15 minutes'
     and (
       (o.canal = 'email' and t.email is not null and o.contacto = lower(t.email::text))
       or (o.canal = 'sms' and t.telefono is not null and o.contacto = t.telefono)
     )
    where ipr.id = new.persona_rol_id
  ) then
    raise exception 'ACTOR_EXTERNO_ALTA_SIN_VERIFICACION: no hay un OTP confirmado reciente para este rol';
  end if;

  select exists (
    select 1 from public.actor_externo_vinculo v
    where v.persona_rol_id = new.persona_rol_id
      and v.vigente_desde <= coalesce(new.vigente_hasta, 'infinity'::date)
      and coalesce(v.vigente_hasta, 'infinity'::date) >= new.vigente_desde
  ) into v_solapa;
  if v_solapa then
    raise exception 'ACTOR_EXTERNO_VINCULO_DUPLICADO: ya existe un vínculo vigente para este rol en ese rango';
  end if;

  return new;
end;
$$;

create trigger guard_actor_externo_vinculo
  before insert or update on public.actor_externo_vinculo
  for each row execute function public.guard_actor_externo_vinculo();

-- ── RLS: lectura propia o de staff del tenant; escritura SOLO vía función ─
create policy actor_externo_vinculo_select on public.actor_externo_vinculo
  for select to authenticated
  using (
    auth_user_id = (select auth.uid())
    or public.is_member(tenant_id)
  );

comment on policy actor_externo_vinculo_select on public.actor_externo_vinculo is
  'Un actor externo ve sus propios vínculos; un miembro del tenant (staff) ve los vínculos de su '
  'propio tenant, para soporte/administración. Sin política de insert/update/delete: todo alta '
  'pasa por fn_actor_externo_registrar_vinculo (20260932690000), sea autoverificación (vía Edge '
  'Function con service_role) o alta manual de staff (mismo camino, con su propio chequeo interno) '
  '— un único punto que corre siempre el guard de arriba.';
