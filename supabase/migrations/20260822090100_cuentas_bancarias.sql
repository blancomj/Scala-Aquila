-- ═══════════════════════════════════════════════════════════════════════
--  cuentas_bancarias — cuentas de recaudo de la copropiedad
--  Propietario: PROMPT_FICHA_COPROPIEDAD.md §4.3, §7.2
--
--  Mismo gap que tenant_tercero_rol (ver 20260822090000): el prompt daba
--  esta tabla y fn_marcar_cuenta_recaudo por existentes, verificado falso.
--  Se construye ahora, mismo patrón exacto que fn_marcar_pagador
--  (20260820100100): swap atómico vía función, nunca dos UPDATE sueltos
--  desde el cliente, porque un UPDATE directo puede violar el índice único
--  parcial si ya hay otra cuenta de recaudo vigente.
--
--  `banco` queda en texto libre a propósito — gap reseñado (catálogo de
--  entidades financieras pendiente, ver migración siguiente).
--  `activa` es baja lógica, sin borrado físico desde la UI — mismo
--  criterio que terceros.estado_id.
-- ═══════════════════════════════════════════════════════════════════════

create type public.cuenta_bancaria_tipo_t as enum ('ahorros', 'corriente');

create table public.cuentas_bancarias (
  id             uuid primary key default gen_random_uuid(),
  tenant_id      uuid not null references public.tenants (id) on delete cascade,
  banco          text not null,
  tipo_cuenta    public.cuenta_bancaria_tipo_t not null,
  numero_cuenta  text not null,
  titular        text,
  es_recaudo     boolean not null default false,
  activa         boolean not null default true,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz
);

alter table public.cuentas_bancarias enable row level security;
alter table public.cuentas_bancarias force row level security;

create index cuentas_bancarias_tenant_idx on public.cuentas_bancarias (tenant_id);

-- Una sola cuenta de recaudo activa por tenant.
create unique index cuentas_bancarias_un_recaudo_vigente
  on public.cuentas_bancarias (tenant_id)
  where es_recaudo and activa;

comment on table public.cuentas_bancarias is
  'Cuentas bancarias de la copropiedad. es_recaudo: exactamente una activa por tenant '
  '(índice único parcial) — cambiarla va por fn_marcar_cuenta_recaudo, nunca UPDATE '
  'directo. banco es texto libre, catálogo pendiente (PROMPT_FICHA_COPROPIEDAD.md §8.2).';

-- ── RLS: mismo patrón que el resto del dominio (is_member / has_role agent) ──
create policy cuentas_bancarias_select_miembro
  on public.cuentas_bancarias for select
  to authenticated
  using (public.is_member(tenant_id));

create policy cuentas_bancarias_insert_agent
  on public.cuentas_bancarias for insert
  to authenticated
  with check (public.has_role(tenant_id, array['agent']::public.tenant_role_t[]));

create policy cuentas_bancarias_update_agent
  on public.cuentas_bancarias for update
  to authenticated
  using (public.has_role(tenant_id, array['agent']::public.tenant_role_t[]))
  with check (public.has_role(tenant_id, array['agent']::public.tenant_role_t[]));

create policy cuentas_bancarias_delete_agent
  on public.cuentas_bancarias for delete
  to authenticated
  using (public.has_role(tenant_id, array['agent']::public.tenant_role_t[]));

-- ── fn_marcar_cuenta_recaudo — swap atómico, mismo criterio que fn_marcar_pagador ──
-- SECURITY INVOKER (default): cuentas_bancarias_update_agent ya autoriza esta
-- escritura vía RLS, no hace falta escalar privilegios.
create function public.fn_marcar_cuenta_recaudo(
  p_cuenta_id uuid,
  p_tenant_id uuid
)
returns void
language plpgsql
set search_path = ''
as $$
begin
  update public.cuentas_bancarias
  set es_recaudo = false
  where tenant_id = p_tenant_id
    and es_recaudo
    and activa
    and id <> p_cuenta_id;

  update public.cuentas_bancarias
  set es_recaudo = true
  where id = p_cuenta_id
    and tenant_id = p_tenant_id
    and activa;
end;
$$;

revoke execute on function public.fn_marcar_cuenta_recaudo(uuid, uuid) from public, anon;
grant execute on function public.fn_marcar_cuenta_recaudo(uuid, uuid) to authenticated;
