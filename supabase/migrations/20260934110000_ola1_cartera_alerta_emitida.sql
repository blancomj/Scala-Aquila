-- ═══════════════════════════════════════════════════════════════════════
--  OLA 1 · Cartera empieza a notificar (2/3) — tabla de emisión + puente.
--
--  cartera_alerta_emitida: mismo patrón que finanzas_alerta_emitida
--  (20260932580000) — append-only, idempotente por día. La diferencia es
--  la llave de unicidad: finanzas dedupe por (regla_id, fecha_emision)
--  porque tiene una tabla de reglas configurables por tenant; cartera no
--  tiene reglas, tiene 4 condiciones fijas (tipo_id de TIPO_ALERTA_CARTERA,
--  20260934100000), así que dedupe por (tenant_id, tipo_id, fecha_emision).
--
--  DI-09 / principio de FIN-4 (02_ESTADO_VERIFICADO.md §2.2): "alerta
--  significa NOTIFICAR, nunca cambiar un estado ni ejecutar nada" — por
--  eso es append-only y nada en el resto del sistema la lee para decidir.
--
--  El puente a fn_notificar sigue el patrón exacto de
--  20260933030000_exs2_puentes_deteccion.sql: AFTER INSERT (la fila del
--  origen ya debe existir), envuelto en begin/exception para que un fallo
--  al notificar nunca tumbe la alerta detectada — la detección es el dato
--  duro, la notificación es conveniencia.
-- ═══════════════════════════════════════════════════════════════════════

create table public.cartera_alerta_emitida (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid not null references public.tenants(id) on delete cascade,
  tipo_id       bigint not null references public.lista_tipos(id),
  fecha_emision date not null,
  detalle       jsonb not null,
  created_at    timestamptz not null default now(),
  unique (tenant_id, tipo_id, fecha_emision)
);

comment on table public.cartera_alerta_emitida is
  'Ola 1 §2.2: emisión append-only de las 4 condiciones de fn_alertas_cartera (tipo_id de '
  'TIPO_ALERTA_CARTERA). Idempotente por (tenant, tipo, día) — una corrida repetida el mismo día '
  'no duplica. Solo cartera_alertas_evaluar() (20260934120000) escribe aquí.';

alter table public.cartera_alerta_emitida enable row level security;
alter table public.cartera_alerta_emitida force row level security;

create index cartera_alerta_emitida_tenant_idx on public.cartera_alerta_emitida (tenant_id);

create policy cartera_alerta_emitida_select_miembro
  on public.cartera_alerta_emitida for select
  to authenticated
  using (public.is_member(tenant_id) and public.puede_ver_modulo(tenant_id, 'cartera_cobranza'));

create trigger cartera_alerta_emitida_append_only
  before delete or update on public.cartera_alerta_emitida
  for each row execute function public.forbid_mutation_salvo_tenant_borrado();

-- Guard de tipo, mismo patrón que guard_finanzas_alerta_regla_tipo
-- (20260932580000): tipo_id debe pertenecer a TIPO_ALERTA_CARTERA.
create function public.guard_cartera_alerta_emitida_tipo()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_tipo text;
begin
  select tipo into v_tipo from public.lista_tipos where id = new.tipo_id;
  if v_tipo is distinct from 'TIPO_ALERTA_CARTERA' then
    raise exception 'CARTERA_ALERTA_TIPO_INVALIDO: tipo_id % no pertenece a TIPO_ALERTA_CARTERA '
      '(es %)', new.tipo_id, coalesce(v_tipo, 'inexistente');
  end if;
  return new;
end;
$$;

create trigger guard_cartera_alerta_emitida_tipo
  before insert on public.cartera_alerta_emitida
  for each row execute function public.guard_cartera_alerta_emitida_tipo();

-- ── Puente: emisión → notificación (mismo patrón que EXS-2, 20260933030000) ──

create function public.tg_notificar_alerta_cartera()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_nombre text;
begin
  select lt.nombre into v_nombre from public.lista_tipos lt where lt.id = new.tipo_id;

  begin
    perform public.fn_notificar(
      p_tenant_id      => new.tenant_id,
      p_modulo         => 'cartera_cobranza',
      p_tipo_codigo    => 'alerta_cartera',
      p_prioridad      => 'importante',
      p_titulo         => coalesce(v_nombre, 'Alerta de cartera'),
      p_origen_modulo  => 'cartera',
      p_origen_entidad => 'cartera_alerta_emitida',
      p_origen_evento  => 'alerta_emitida',
      p_origen_id      => new.id,
      p_cuerpo         => 'Detectado el ' || new.fecha_emision::text || '.',
      p_enlace         => '/cartera'
    );
  exception when others then
    raise warning 'OLA1_NOTIFICACION_OMITIDA: alerta cartera % (%)', new.id, sqlerrm;
  end;

  return new;
end;
$$;

create trigger notificar_alerta_cartera
  after insert on public.cartera_alerta_emitida
  for each row execute function public.tg_notificar_alerta_cartera();

-- Trigger functions: RETURNS trigger, no expuestas vía PostgREST fuera de
-- contexto de trigger, pero se revoca por higiene (20260932520000).
revoke execute on function public.guard_cartera_alerta_emitida_tipo() from public, authenticated, anon;
revoke execute on function public.tg_notificar_alerta_cartera() from public, authenticated, anon;
