-- ═══════════════════════════════════════════════════════════════════════
--  GOB-3 · gobierno_regla_mayoria — configuración acotada por tenant
--  Ver GOB_03_quorum_votacion.md §4.2 — "el corazón del corte"
--
--  Rango legal con configurabilidad acotada (marco §3), no "todo
--  parametrizable": el piso y el techo dependen de gobierno_materia_
--  decision.mayoria_tipo, resuelto en el guard, nunca del valor que el
--  tenant intente escribir.
--   - ordinaria:      piso 50 (mitad+1 de representados, art. 45), techo 70
--   - calificada_70:  piso 70, techo 70 (art. 46 — fijo, sin margen real)
--   - unanimidad:     piso 100, techo 100
--  Excepción única: 'extincion_ph' no tiene techo (art. 45 la exceptúa
--  explícitamente del límite del 70%).
--
--  Solo `administrador` puede escribir esta tabla (no `auxiliar`, a
--  diferencia del resto de GOB-2/GOB-3) — configurar mal una mayoría puede
--  producir decisiones absolutamente nulas (art. 45); es una decisión de
--  gobierno más delicada que registrar asistencia o un poder.
-- ═══════════════════════════════════════════════════════════════════════

create table public.gobierno_regla_mayoria (
  id                    uuid primary key default gen_random_uuid(),
  tenant_id             uuid not null references public.tenants (id) on delete cascade,
  materia_id            bigint not null references public.gobierno_materia_decision (id),
  quorum_minimo_pct     numeric(5, 2) not null,
  mayoria_pct           numeric(5, 2) not null,
  reglamento_referencia text,
  vigente_desde         date not null,
  vigente_hasta         date,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz,

  constraint gobierno_regla_mayoria_fechas_validas check (vigente_hasta is null or vigente_hasta >= vigente_desde)
);

alter table public.gobierno_regla_mayoria enable row level security;
alter table public.gobierno_regla_mayoria force row level security;

create index gobierno_regla_mayoria_tenant_idx on public.gobierno_regla_mayoria (tenant_id);
create index gobierno_regla_mayoria_materia_idx on public.gobierno_regla_mayoria (materia_id);
create unique index gobierno_regla_mayoria_vigente_unico
  on public.gobierno_regla_mayoria (tenant_id, materia_id) where vigente_hasta is null;

comment on table public.gobierno_regla_mayoria is
  'GOB-3: configuración por copropiedad de quórum/mayoría para cada materia, acotada por el '
  'piso y el techo legal de gobierno_materia_decision.mayoria_tipo (marco §3 — rango legal con '
  'configurabilidad acotada, nunca "todo parametrizable"). Solo administrador puede escribir.';

create policy gobierno_regla_mayoria_select_miembro
  on public.gobierno_regla_mayoria for select
  to authenticated
  using (public.is_member(tenant_id));

create policy gobierno_regla_mayoria_insert_administrador
  on public.gobierno_regla_mayoria for insert
  to authenticated
  with check (public.has_role(tenant_id, array['administrador']::public.tenant_role_t[]));

create policy gobierno_regla_mayoria_update_administrador
  on public.gobierno_regla_mayoria for update
  to authenticated
  using (public.has_role(tenant_id, array['administrador']::public.tenant_role_t[]))
  with check (public.has_role(tenant_id, array['administrador']::public.tenant_role_t[]));

create function public.guard_gobierno_regla_mayoria()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_mayoria_tipo public.mayoria_tipo_t;
  v_materia_codigo text;
  v_piso_mayoria numeric(5, 2);
begin
  select mayoria_tipo, codigo into v_mayoria_tipo, v_materia_codigo
  from public.gobierno_materia_decision where id = new.materia_id;
  if v_mayoria_tipo is null then
    raise exception 'REGLA_MAYORIA_MATERIA_INVALIDA: materia_id % no existe', new.materia_id;
  end if;

  v_piso_mayoria := case v_mayoria_tipo
    when 'ordinaria' then 50
    when 'calificada_70' then 70
    when 'unanimidad' then 100
  end;

  if new.mayoria_pct < v_piso_mayoria then
    raise exception 'MAYORIA_INFERIOR_AL_PISO_LEGAL: % exige mínimo % de mayoría (piso legal, '
      'Ley 675 art. 45/46) — % configurado', v_materia_codigo, v_piso_mayoria, new.mayoria_pct;
  end if;

  if v_materia_codigo <> 'extincion_ph' and new.mayoria_pct > 70 then
    raise exception 'MAYORIA_EXCEDE_TECHO_LEGAL: para ninguna decisión, salvo la extinción de la '
      'propiedad horizontal, se puede exigir una mayoría superior al 70%% de los coeficientes '
      'que integran el edificio o conjunto (Ley 675 art. 45) — las mayorías superiores previstas '
      'en los reglamentos se entienden por no escritas, y las decisiones adoptadas en '
      'contravención son absolutamente nulas. % configurado para %', new.mayoria_pct, v_materia_codigo;
  end if;

  if new.quorum_minimo_pct < 50 then
    raise exception 'QUORUM_INFERIOR_AL_PISO_LEGAL: la asamblea exige un quórum de más de la '
      'mitad de los coeficientes (Ley 675 art. 45) — % configurado', new.quorum_minimo_pct;
  end if;

  return new;
end;
$$;

comment on function public.guard_gobierno_regla_mayoria() is
  'GOB-3: REGLA_MAYORIA_MATERIA_INVALIDA, MAYORIA_INFERIOR_AL_PISO_LEGAL (piso según '
  'mayoria_tipo: ordinaria=50, calificada_70=70, unanimidad=100), MAYORIA_EXCEDE_TECHO_LEGAL '
  '(techo 70%%, art. 45 — excepto extincion_ph), QUORUM_INFERIOR_AL_PISO_LEGAL (piso 50, art. 45).';

create trigger guard_gobierno_regla_mayoria
  before insert or update on public.gobierno_regla_mayoria
  for each row execute function public.guard_gobierno_regla_mayoria();

create trigger set_updated_at before update on public.gobierno_regla_mayoria
  for each row execute function public.set_updated_at();
