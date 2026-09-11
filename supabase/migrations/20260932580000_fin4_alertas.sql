-- ═══════════════════════════════════════════════════════════════════════
--  FIN-4 · Flujo de caja proyectado y alertas de liquidez (3/8)
--
--  Reglas configurables por tenant (§3.5) — cero sembradas, `activa=false`
--  por defecto incluso cuando existan filas (ver migración 630000, la
--  plantilla auto-sembrada en create_tenant() queda inactiva). Alerta
--  significa NOTIFICAR, nunca cambiar un estado ni ejecutar un pago (§3.5,
--  misma regla que GOB-9) — por eso finanzas_alerta_emitida es append-only:
--  ninguna función de este corte puede volver a escribir sobre una fila ya
--  emitida, y nada en el resto del sistema lee esta tabla para decidir algo.
-- ═══════════════════════════════════════════════════════════════════════

create table public.finanzas_alerta_regla (
  id                    uuid primary key default gen_random_uuid(),
  tenant_id             uuid not null references public.tenants (id) on delete cascade,
  tipo_id               bigint not null references public.lista_tipos (id),
  nombre                text not null,
  activa                boolean not null default false,
  umbral                numeric(18, 2),
  semanas_consecutivas  smallint,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz,

  constraint finanzas_alerta_regla_semanas_validas
    check (semanas_consecutivas is null or semanas_consecutivas > 0)
);

comment on table public.finanzas_alerta_regla is
  'FIN-4 §3.5: regla de alerta de liquidez configurable por tenant. tipo_id debe pertenecer a la '
  'familia TIPO_ALERTA_LIQUIDEZ (SALUD_FACTOR_FUENTE_INVALIDA-style: FINANZAS_ALERTA_TIPO_INVALIDO '
  'si no). Cero filas sembradas por decisión del tenant; activa=false hasta que un administrador '
  'la revise, incluso las sembradas automáticamente por create_tenant() como plantilla borrador.';

alter table public.finanzas_alerta_regla enable row level security;
alter table public.finanzas_alerta_regla force row level security;

create index finanzas_alerta_regla_tenant_idx on public.finanzas_alerta_regla (tenant_id);

create policy finanzas_alerta_regla_select_miembro
  on public.finanzas_alerta_regla for select
  to authenticated
  using (public.is_member(tenant_id) and public.puede_ver_modulo(tenant_id, 'financiero'));

create policy finanzas_alerta_regla_insert_auxiliar
  on public.finanzas_alerta_regla for insert
  to authenticated
  with check (public.has_role(tenant_id, array['auxiliar']::public.tenant_role_t[]));

create policy finanzas_alerta_regla_update_auxiliar
  on public.finanzas_alerta_regla for update
  to authenticated
  using (public.has_role(tenant_id, array['auxiliar']::public.tenant_role_t[]))
  with check (public.has_role(tenant_id, array['auxiliar']::public.tenant_role_t[]));

create policy finanzas_alerta_regla_delete_auxiliar
  on public.finanzas_alerta_regla for delete
  to authenticated
  using (public.has_role(tenant_id, array['auxiliar']::public.tenant_role_t[]));

create trigger set_updated_at before update on public.finanzas_alerta_regla
  for each row execute function public.set_updated_at();

create function public.guard_finanzas_alerta_regla_tipo()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_tipo text;
begin
  select tipo into v_tipo from public.lista_tipos where id = new.tipo_id;
  if v_tipo is distinct from 'TIPO_ALERTA_LIQUIDEZ' then
    raise exception 'FINANZAS_ALERTA_TIPO_INVALIDO: tipo_id % no pertenece a TIPO_ALERTA_LIQUIDEZ '
      '(es %)', new.tipo_id, coalesce(v_tipo, 'inexistente');
  end if;
  return new;
end;
$$;

create trigger guard_finanzas_alerta_regla_tipo
  before insert or update on public.finanzas_alerta_regla
  for each row execute function public.guard_finanzas_alerta_regla_tipo();

-- ── Bitácora de alertas emitidas — append-only, nunca cambia un estado ──
create table public.finanzas_alerta_emitida (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid not null references public.tenants (id) on delete cascade,
  regla_id      uuid not null references public.finanzas_alerta_regla (id),
  fecha_emision date not null,
  detalle       jsonb not null,
  created_at    timestamptz not null default now(),

  constraint finanzas_alerta_emitida_unica unique (regla_id, fecha_emision)
);

comment on table public.finanzas_alerta_emitida is
  'FIN-4 §3.5: registro append-only de cada alerta emitida — solo notifica, nunca cambia un '
  'estado ni ejecuta nada (misma regla que GOB-9). Idempotente por (regla_id, fecha_emision).';

alter table public.finanzas_alerta_emitida enable row level security;
alter table public.finanzas_alerta_emitida force row level security;

create index finanzas_alerta_emitida_tenant_idx on public.finanzas_alerta_emitida (tenant_id);
create index finanzas_alerta_emitida_regla_idx on public.finanzas_alerta_emitida (regla_id);

create policy finanzas_alerta_emitida_select_miembro
  on public.finanzas_alerta_emitida for select
  to authenticated
  using (public.is_member(tenant_id) and public.puede_ver_modulo(tenant_id, 'financiero'));

create trigger finanzas_alerta_emitida_append_only
  before update or delete on public.finanzas_alerta_emitida
  for each row execute function public.forbid_mutation();
