-- ═══════════════════════════════════════════════════════════════════════
--  MANT-4 · Incidencias y órdenes de trabajo (4/9)
--  Casos de uso/Tres Modulos/Mantenimiento/MANT_04_incidencias_ordenes_trabajo.md §3.2
--
--  Matriz de prioridad: banda de criticidad (MANT-1, texto libre por
--  tenant — mant_criticidad_banda.nombre no es un catálogo fijo) cruzada
--  con severidad (SEVERIDAD_INCIDENCIA). §6 del marco: "cero valores
--  sembrados por defecto en catálogos que representan política de la
--  copropiedad" — esta tabla nace vacía, cada tenant la configura.
-- ═══════════════════════════════════════════════════════════════════════

create table public.mant_matriz_prioridad (
  id               uuid primary key default gen_random_uuid(),
  tenant_id        uuid not null references public.tenants (id) on delete cascade,
  banda_criticidad text not null,
  severidad_id     bigint not null references public.lista_tipos (id),
  prioridad_id     bigint not null references public.lista_tipos (id),
  created_at       timestamptz not null default now(),
  updated_at       timestamptz,

  constraint mant_matriz_prioridad_unica unique (tenant_id, banda_criticidad, severidad_id)
);

alter table public.mant_matriz_prioridad enable row level security;
alter table public.mant_matriz_prioridad force row level security;

comment on table public.mant_matriz_prioridad is
  'MANT-4 §3.2: banda de criticidad (texto libre, MANT-1) × severidad -> prioridad sugerida. '
  'Nace vacía por tenant — sin ninguna fila, mant_prioridad_sugerida simplemente no encuentra '
  'coincidencia y lo dice explícito (encontrada = false), nunca inventa un valor.';

create policy mant_matriz_prioridad_select_miembro
  on public.mant_matriz_prioridad for select
  to authenticated
  using (public.is_member(tenant_id));

create policy mant_matriz_prioridad_administrador_todo
  on public.mant_matriz_prioridad for all
  to authenticated
  using (public.has_role(tenant_id, array['administrador']::public.tenant_role_t[]))
  with check (public.has_role(tenant_id, array['administrador']::public.tenant_role_t[]));

create function public.guard_mant_matriz_prioridad()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_severidad text;
  v_prioridad text;
begin
  select tipo into v_severidad from public.lista_tipos where id = new.severidad_id;
  if v_severidad is distinct from 'SEVERIDAD_INCIDENCIA' then
    raise exception 'INCIDENCIA_SEVERIDAD_INVALIDA: severidad_id % no pertenece a '
      'SEVERIDAD_INCIDENCIA (es %)', new.severidad_id, coalesce(v_severidad, 'inexistente');
  end if;

  select tipo into v_prioridad from public.lista_tipos where id = new.prioridad_id;
  if v_prioridad is distinct from 'PRIORIDAD' then
    raise exception 'INCIDENCIA_PRIORIDAD_INVALIDA: prioridad_id % no pertenece a PRIORIDAD (es %)',
      new.prioridad_id, coalesce(v_prioridad, 'inexistente');
  end if;

  new.updated_at := now();
  return new;
end;
$$;

create trigger mant_matriz_prioridad_guard
  before insert or update on public.mant_matriz_prioridad
  for each row execute function public.guard_mant_matriz_prioridad();

-- ── mant_prioridad_sugerida (§3.2) ────────────────────────────────────────
create function public.mant_prioridad_sugerida(p_activo_id uuid, p_severidad_id bigint)
returns table (
  prioridad_id     bigint,
  prioridad_nombre text,
  banda_criticidad text,
  severidad_nombre text,
  encontrada       boolean
)
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  v_tenant_id uuid;
  v_banda     text;
  v_prioridad_id bigint;
begin
  select tenant_id into v_tenant_id from public.activos where id = p_activo_id;
  if v_tenant_id is null then
    raise exception 'ACTIVO_INVALIDO: % no existe', p_activo_id;
  end if;

  -- La criticidad puede no estar evaluada todavía (set sin vigencia, evaluación incompleta) —
  -- eso no bloquea la sugerencia, solo la deja sin banda (desglose lo muestra explícito).
  begin
    select c.banda into v_banda from public.mant_criticidad(p_activo_id) c;
  exception when others then
    v_banda := null;
  end;

  if v_banda is not null then
    select mp.prioridad_id into v_prioridad_id
    from public.mant_matriz_prioridad mp
    where mp.tenant_id = v_tenant_id and mp.banda_criticidad = v_banda and mp.severidad_id = p_severidad_id;
  end if;

  return query
  select
    v_prioridad_id,
    (select lt.nombre from public.lista_tipos lt where lt.id = v_prioridad_id),
    v_banda,
    (select lt.nombre from public.lista_tipos lt where lt.id = p_severidad_id),
    (v_prioridad_id is not null);
end;
$$;

comment on function public.mant_prioridad_sugerida(uuid, bigint) is
  'MANT-4 §3.2: prioridad derivada de la criticidad del activo (MANT-1) y la severidad del '
  'hecho, con desglose (banda usada, severidad usada, si hubo coincidencia en la matriz). Un '
  'número calculado nunca es una decisión (marco §6.4) — si no hay banda o no hay fila en la '
  'matriz, devuelve encontrada = false en vez de inventar un valor; nunca lanza excepción por '
  'falta de configuración.';
