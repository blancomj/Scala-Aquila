-- ═══════════════════════════════════════════════════════════════════════
--  MANT-0 · Política de depreciación por defecto, por categoría de activo
--  — gap encontrado en auditoría de configurabilidad contable (2026-09-14).
--
--  Hoy vida_util_meses/metodo_depreciacion (20260930280000) se definen
--  activo por activo, sin ningún default de copropiedad — cada alta parte
--  de cero, y nada impide que la misma categoría (p.ej. 'electrico')
--  termine con vidas útiles distintas en cada activo por simple
--  inconsistencia de captura.
--
--  A diferencia de contable_politica_deterioro (CO-7), esto NO es una
--  política contable auditada que recalcula saldos — es una SUGERENCIA
--  que precarga el formulario de alta de un activo nuevo (ActivoFormDrawer)
--  y que el usuario puede sobrescribir sin fricción. Por eso no se replica
--  el versionado borrador/vigente/histórica de CO-7 aquí: sería
--  sobre-ingeniería para un default editable en el momento (D-127/MANT-6
--  ya estableció el mismo criterio de proporcionalidad: no toda
--  parametrización necesita el aparato completo de una política versionada).
--
--  depreciacion_metodo_t (20260930280000) ya es 'linea_recta' | 'no_deprecia'
--  — se reutiliza tal cual, no se crea un enum propio.
-- ═══════════════════════════════════════════════════════════════════════

create table public.mant_categoria_depreciacion_default (
  id                  uuid primary key default gen_random_uuid(),
  tenant_id           uuid not null references public.tenants (id) on delete cascade,
  categoria_id        bigint not null references public.lista_tipos (id),
  metodo_depreciacion public.depreciacion_metodo_t not null,
  -- Solo se exige (guard abajo) cuando metodo_depreciacion = 'linea_recta' — mismo criterio
  -- que ACTIVO_VIDA_UTIL_INVALIDA en activos (20260930280000).
  vida_util_meses     integer,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz,

  constraint mant_categoria_depreciacion_default_unica unique (tenant_id, categoria_id),
  constraint mant_categoria_depreciacion_default_vida_util_valida
    check (metodo_depreciacion <> 'linea_recta' or coalesce(vida_util_meses, 0) > 0)
);

alter table public.mant_categoria_depreciacion_default enable row level security;
alter table public.mant_categoria_depreciacion_default force row level security;

create index mant_categoria_depreciacion_default_tenant_idx
  on public.mant_categoria_depreciacion_default (tenant_id);

comment on table public.mant_categoria_depreciacion_default is
  'Gap de configurabilidad contable (2026-09-14): default de método/vida útil por categoría de '
  'activo (lista_tipos CATEGORIA_ACTIVO), para precargar ActivoFormDrawer al crear un activo '
  'nuevo. Es una sugerencia editable en el momento, no una política versionada — activos.'
  'vida_util_meses/metodo_depreciacion siguen siendo la fuente real por activo; esta tabla '
  'nunca los sobrescribe retroactivamente.';
comment on column public.mant_categoria_depreciacion_default.categoria_id is
  'Debe pertenecer a lista_tipos tipo=CATEGORIA_ACTIVO (guard_mant_categoria_depreciacion_default), '
  'mismo catálogo que activos.categoria_id.';

create trigger set_updated_at before update on public.mant_categoria_depreciacion_default
  for each row execute function public.set_updated_at();

-- ── guard: categoria_id debe ser CATEGORIA_ACTIVO (mismo criterio que activos) ──
create function public.guard_mant_categoria_depreciacion_default()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_categoria_tipo text;
begin
  select tipo into v_categoria_tipo from public.lista_tipos where id = new.categoria_id;
  if v_categoria_tipo is distinct from 'CATEGORIA_ACTIVO' then
    raise exception 'ACTIVO_CATEGORIA_INVALIDA: categoria_id % no pertenece a CATEGORIA_ACTIVO (es %)',
      new.categoria_id, coalesce(v_categoria_tipo, 'inexistente');
  end if;
  return new;
end;
$$;

create trigger guard_mant_categoria_depreciacion_default
  before insert or update on public.mant_categoria_depreciacion_default
  for each row execute function public.guard_mant_categoria_depreciacion_default();

-- Trigger-only, nunca invocable vía RPC (mismo criterio de higiene que 20260932520000).
revoke execute on function public.guard_mant_categoria_depreciacion_default()
  from public, anon, authenticated;

-- ── RLS (mismo patrón que contable_politica_deterioro) ───────────────────
create policy mant_categoria_depreciacion_default_select_miembro
  on public.mant_categoria_depreciacion_default for select
  to authenticated
  using (public.is_member(tenant_id));

create policy mant_categoria_depreciacion_default_insert_auxiliar
  on public.mant_categoria_depreciacion_default for insert
  to authenticated
  with check (public.has_role(tenant_id, array['auxiliar']::public.tenant_role_t[]));

create policy mant_categoria_depreciacion_default_update_auxiliar
  on public.mant_categoria_depreciacion_default for update
  to authenticated
  using (public.has_role(tenant_id, array['auxiliar']::public.tenant_role_t[]))
  with check (public.has_role(tenant_id, array['auxiliar']::public.tenant_role_t[]));

create policy mant_categoria_depreciacion_default_delete_auxiliar
  on public.mant_categoria_depreciacion_default for delete
  to authenticated
  using (public.has_role(tenant_id, array['auxiliar']::public.tenant_role_t[]));
