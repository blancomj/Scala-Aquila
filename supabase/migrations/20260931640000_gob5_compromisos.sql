-- ═══════════════════════════════════════════════════════════════════════
--  GOB-5 · gobierno_compromisos / gobierno_compromiso_avances
--  Ver GOB_05_decision_compromisos.md §4.2, pruebas 5-7.
--
--  Segregación de funciones confirmada (Plan del corte): un compromiso es
--  ejecución operativa de una decisión que YA pasó por el filtro de
--  administrador al crearse — todas sus transiciones (avances, cumplido,
--  bloqueado, cancelado) exigen solo rol auxiliar, sin escalamiento
--  adicional. Por eso, a diferencia de gobierno_decisiones/gobierno_actas,
--  SÍ hay políticas insert/update directas para `authenticated` (mismo
--  criterio que gobierno_votos en GOB-3): no se necesita una función
--  security definer solo para envolver un chequeo de rol que la propia
--  política RLS ya expresa.
--
--  responsable_ref (spec: "miembro de órgano, tercero, o la administración"):
--  no hay precedente en el repo de una referencia polimórfica — todo `_ref`
--  existente (destinatario_ref, otorgante_ref, asistente_ref) apunta a un
--  solo tipo. Se modela como dos columnas nulables con un check de
--  exclusión mutua; si ambas son null, el responsable es "la
--  administración" (art. 51), sin entidad propia que rastrear.
-- ═══════════════════════════════════════════════════════════════════════

create table public.gobierno_compromisos (
  id                     uuid primary key default gen_random_uuid(),
  tenant_id              uuid not null references public.tenants (id) on delete cascade,
  decision_id            uuid not null references public.gobierno_decisiones (id) on delete cascade,
  orden                  int not null,
  titulo                 text not null,
  descripcion            text,
  responsable_miembro_id uuid references public.gobierno_miembros (id),
  responsable_tercero_id uuid references public.terceros (id),
  fecha_limite           date,
  estado                 public.gobierno_compromiso_estado_t not null default 'pendiente',
  bloqueado_motivo       text,
  cancelado_motivo       text,
  cumplido_at            timestamptz,
  verificado_por         uuid references public.profiles (id),
  verificado_at          timestamptz,
  monto_estimado         numeric(18, 2),
  presupuesto_cuenta_id  uuid references public.presupuesto_cuenta (id),
  fondo_id               uuid references public.fondos (id),
  created_at             timestamptz not null default now(),
  updated_at             timestamptz,

  constraint gobierno_compromisos_orden_unico unique (decision_id, orden),
  constraint gobierno_compromisos_responsable_excluyente check (
    not (responsable_miembro_id is not null and responsable_tercero_id is not null)
  ),
  constraint gobierno_compromisos_bloqueado_con_motivo
    check (estado <> 'bloqueado' or bloqueado_motivo is not null),
  constraint gobierno_compromisos_cancelado_con_motivo
    check (estado <> 'cancelado' or cancelado_motivo is not null),
  constraint gobierno_compromisos_monto_no_negativo
    check (monto_estimado is null or monto_estimado >= 0)
);

alter table public.gobierno_compromisos enable row level security;
alter table public.gobierno_compromisos force row level security;

create index gobierno_compromisos_tenant_idx on public.gobierno_compromisos (tenant_id);
create index gobierno_compromisos_decision_idx on public.gobierno_compromisos (decision_id);

comment on table public.gobierno_compromisos is
  'GOB-5: un compromiso ejecuta una decisión. Sin estado de ejecución global aquí — la decisión '
  'lo calcula desde sus compromisos (gobierno_decision_ejecucion). "vencido" no es un valor de '
  'estado: se deriva de fecha_limite < hoy con estado no terminal.';
comment on column public.gobierno_compromisos.responsable_miembro_id is
  'Responsable cuando es un miembro de un órgano de gobierno (spec §4.2). Excluyente con '
  'responsable_tercero_id.';
comment on column public.gobierno_compromisos.responsable_tercero_id is
  'Responsable cuando es un tercero (proveedor, profesional externo). Si ambas columnas de '
  'responsable son null, el responsable implícito es "la administración" (art. 51) — no se '
  'modela como entidad propia.';

create policy gobierno_compromisos_select_miembro
  on public.gobierno_compromisos for select
  to authenticated
  using (public.is_member(tenant_id));

create policy gobierno_compromisos_insert_auxiliar
  on public.gobierno_compromisos for insert
  to authenticated
  with check (public.has_role(tenant_id, array['auxiliar']::public.tenant_role_t[]));

create policy gobierno_compromisos_update_auxiliar
  on public.gobierno_compromisos for update
  to authenticated
  using (public.has_role(tenant_id, array['auxiliar']::public.tenant_role_t[]))
  with check (public.has_role(tenant_id, array['auxiliar']::public.tenant_role_t[]));

-- ── Guard: decisión del mismo tenant + evidencia antes de cumplido ───────
create function public.guard_gobierno_compromiso()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_tenant_decision uuid;
begin
  if tg_op = 'INSERT' then
    select tenant_id into v_tenant_decision
    from public.gobierno_decisiones where id = new.decision_id;

    if v_tenant_decision is null or v_tenant_decision <> new.tenant_id then
      raise exception 'COMPROMISO_DECISION_INVALIDA: la decisión % no pertenece al tenant %',
        new.decision_id, new.tenant_id;
    end if;
  end if;

  if new.estado = 'cumplido' and (tg_op = 'INSERT' or old.estado <> 'cumplido') then
    if not exists (
      select 1 from public.gobierno_compromiso_avances
      where compromiso_id = new.id and documento_id is not null
    ) then
      raise exception 'COMPROMISO_CUMPLIDO_SIN_EVIDENCIA: el compromiso % no tiene ningún avance '
        'con evidencia (documento) — regístralo antes de marcarlo cumplido',
        coalesce(new.id, old.id);
    end if;
    new.cumplido_at := now();
  end if;

  new.updated_at := now();
  return new;
end;
$$;

comment on function public.guard_gobierno_compromiso() is
  'GOB-5: COMPROMISO_DECISION_INVALIDA (aislamiento de tenant, prueba 13) + '
  'COMPROMISO_CUMPLIDO_SIN_EVIDENCIA (prueba 5) — un compromiso creado directamente en INSERT ya '
  'como cumplido es siempre rechazado: no puede existir un avance con evidencia para un '
  'compromiso que todavía no tiene id asignado.';

create trigger gobierno_compromiso_guard
  before insert or update on public.gobierno_compromisos
  for each row execute function public.guard_gobierno_compromiso();

-- ═══════════════════════════════════════════════════════════════════════
--  gobierno_compromiso_avances — append-only, mismo patrón que
--  caso_juridico_actuaciones (forbid_mutation genérico, sin código propio).
-- ═══════════════════════════════════════════════════════════════════════

create table public.gobierno_compromiso_avances (
  id             uuid primary key default gen_random_uuid(),
  tenant_id      uuid not null references public.tenants (id) on delete cascade,
  compromiso_id  uuid not null references public.gobierno_compromisos (id) on delete cascade,
  fecha          date not null,
  descripcion    text not null,
  porcentaje     numeric(5, 2),
  documento_id   uuid references public.documentos (id),
  registrado_por uuid not null references public.profiles (id),
  created_at     timestamptz not null default now(),

  constraint gobierno_compromiso_avances_porcentaje_valido
    check (porcentaje is null or (porcentaje >= 0 and porcentaje <= 100))
);

alter table public.gobierno_compromiso_avances enable row level security;
alter table public.gobierno_compromiso_avances force row level security;

create index gobierno_compromiso_avances_tenant_idx on public.gobierno_compromiso_avances (tenant_id);
create index gobierno_compromiso_avances_compromiso_idx
  on public.gobierno_compromiso_avances (compromiso_id);

comment on table public.gobierno_compromiso_avances is
  'GOB-5: bitácora append-only del avance de un compromiso (spec §4.2) — mismo patrón que '
  'caso_juridico_actuaciones: se corrige con un avance nuevo, nunca editando (forbid_mutation, '
  'prueba 7). documento_id no nulo es lo que guard_gobierno_compromiso cuenta como "evidencia".';

create function public.guard_gobierno_compromiso_avance_registrado_por()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  new.registrado_por := (select auth.uid());
  return new;
end;
$$;

create trigger guard_gobierno_compromiso_avance_registrado_por
  before insert on public.gobierno_compromiso_avances
  for each row execute function public.guard_gobierno_compromiso_avance_registrado_por();

create trigger gobierno_compromiso_avances_append_only
  before update or delete on public.gobierno_compromiso_avances
  for each row execute function public.forbid_mutation();

create policy gobierno_compromiso_avances_select_miembro
  on public.gobierno_compromiso_avances for select
  to authenticated
  using (public.is_member(tenant_id));

create policy gobierno_compromiso_avances_insert_auxiliar
  on public.gobierno_compromiso_avances for insert
  to authenticated
  with check (public.has_role(tenant_id, array['auxiliar']::public.tenant_role_t[]));
