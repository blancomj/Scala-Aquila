-- ═══════════════════════════════════════════════════════════════════════
--  GOB-8 · atencion_tokens_consulta — generalización del enlace de GOB-0
--  Ver GOB_08_atencion_consulta.md §4.4, pruebas 7, 8, 9, 10.
--
--  El mecanismo HMAC de link_token.ts (D-27) es STATELESS a propósito —
--  firma {id, exp} sin guardar nada en BD. Este corte exige revocar un
--  token vigente con motivo (spec §4.4), algo que un HMAC puro no puede
--  expresar (no hay fila que marcar). Esta tabla es solo METADATA de
--  control: el secreto sigue sin persistirse, se sigue firmando sobre el
--  `id` de esta fila (igual patrón que estados_cuenta_generados/
--  documentos) — el token real nunca se guarda, solo su vigencia y su
--  estado de revocación.
-- ═══════════════════════════════════════════════════════════════════════

create table public.atencion_tokens_consulta (
  id                uuid primary key default gen_random_uuid(),
  tenant_id         uuid not null references public.tenants (id) on delete cascade,
  inmueble_id       uuid not null references public.inmuebles (id),
  expira_at         timestamptz not null,
  revocado_at       timestamptz,
  motivo_revocacion text,
  revocado_por      uuid references public.profiles (id),
  generado_por      uuid references public.profiles (id),
  created_at        timestamptz not null default now(),

  constraint atencion_tokens_consulta_revocacion_con_motivo check (
    revocado_at is null or (motivo_revocacion is not null and btrim(motivo_revocacion) <> '')
  )
);

alter table public.atencion_tokens_consulta enable row level security;
alter table public.atencion_tokens_consulta force row level security;

create index atencion_tokens_consulta_tenant_idx on public.atencion_tokens_consulta (tenant_id);
create index atencion_tokens_consulta_inmueble_idx on public.atencion_tokens_consulta (inmueble_id);

comment on table public.atencion_tokens_consulta is
  'GOB-8 §4.4: metadata de control de un enlace de consulta sin sesión por inmueble — el token '
  'HMAC en sí (D-27, link_token.ts) sigue sin persistirse; esta fila solo existe para poder '
  'revocar (con motivo) algo que un HMAC puro no puede expresar. Por inmueble y con caducidad, '
  'nunca permanente (spec §4.4). Cada generación es una fila aquí; cada consulta exitosa vía '
  '`ver-inmueble` se audita en `audit_log` (misma tabla genérica que ya usa `ver-documento`).';
comment on column public.atencion_tokens_consulta.revocado_at is
  'Revocar exige motivo_revocacion (check atencion_tokens_consulta_revocacion_con_motivo) — spec '
  '§4.4: "Revocación de un token vigente, con motivo".';

create policy atencion_tokens_consulta_select_miembro
  on public.atencion_tokens_consulta for select
  to authenticated
  using (public.is_member(tenant_id));

create policy atencion_tokens_consulta_insert_auxiliar
  on public.atencion_tokens_consulta for insert
  to authenticated
  with check (public.has_role(tenant_id, array['auxiliar']::public.tenant_role_t[]));

create policy atencion_tokens_consulta_update_auxiliar
  on public.atencion_tokens_consulta for update
  to authenticated
  using (public.has_role(tenant_id, array['auxiliar']::public.tenant_role_t[]))
  with check (public.has_role(tenant_id, array['auxiliar']::public.tenant_role_t[]));

-- ── guard: solo revocado_at/motivo_revocacion son editables ─────────────
-- Mismo criterio que guard_gobierno_decision_inmutable (GOB-5): bloquea cualquier otro cambio
-- después de creada la fila — expira_at/inmueble_id/generado_por son inmutables por diseño
-- (D-27: la vigencia real vive en el propio token firmado, no se "extiende" una fila existente).
create function public.guard_atencion_token_consulta_inmutable()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (to_jsonb(old) - 'revocado_at' - 'motivo_revocacion' - 'revocado_por')
     is distinct from (to_jsonb(new) - 'revocado_at' - 'motivo_revocacion' - 'revocado_por')
  then
    raise exception 'ATENCION_TOKEN_CONSULTA_INMUTABLE: solo revocado_at/motivo_revocacion/'
      'revocado_por se pueden modificar tras crear el token %', old.id;
  end if;

  if old.revocado_at is not null and new.revocado_at is distinct from old.revocado_at then
    raise exception 'ATENCION_TOKEN_CONSULTA_YA_REVOCADO: el token % ya está revocado', old.id;
  end if;

  return new;
end;
$$;

create trigger atencion_token_consulta_inmutable_guard
  before update on public.atencion_tokens_consulta
  for each row execute function public.guard_atencion_token_consulta_inmutable();

-- ── gobierno_revocar_token_consulta_inmueble ────────────────────────────
create function public.gobierno_revocar_token_consulta_inmueble(
  p_token_id uuid,
  p_motivo text,
  p_actor_id uuid default null
)
returns public.atencion_tokens_consulta
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_token public.atencion_tokens_consulta;
  v_actor uuid;
begin
  select * into v_token from public.atencion_tokens_consulta where id = p_token_id;
  if not found then
    raise exception 'ATENCION_TOKEN_CONSULTA_INEXISTENTE: token % no existe', p_token_id;
  end if;

  if (select auth.uid()) is not null
     and not public.has_role(v_token.tenant_id, array['auxiliar']::public.tenant_role_t[])
  then
    raise exception 'ATENCION_TRANSICION_REQUIERE_AUXILIAR: revocar un token de consulta exige '
      'rol auxiliar';
  end if;

  if v_token.revocado_at is not null then
    raise exception 'ATENCION_TOKEN_CONSULTA_YA_REVOCADO: el token % ya está revocado', p_token_id;
  end if;

  if p_motivo is null or btrim(p_motivo) = '' then
    raise exception 'ATENCION_TOKEN_REVOCACION_SIN_MOTIVO: revocar un token exige un motivo '
      '(spec §4.4)';
  end if;

  v_actor := coalesce((select auth.uid()), p_actor_id);

  update public.atencion_tokens_consulta
  set revocado_at = now(), motivo_revocacion = p_motivo, revocado_por = v_actor
  where id = p_token_id
  returning * into v_token;

  return v_token;
end;
$$;

comment on function public.gobierno_revocar_token_consulta_inmueble(uuid, text, uuid) is
  'GOB-8 §4.4: revoca un token de consulta vigente, con motivo obligatorio — un token revocado '
  'nunca vuelve a servir el paquete (ver-inmueble lo verifica, spec §6 prueba 8). Exige rol '
  'auxiliar.';
