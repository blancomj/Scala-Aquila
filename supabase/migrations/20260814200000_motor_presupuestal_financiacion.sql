-- ═══════════════════════════════════════════════════════════════════════
--  Motor Presupuestal — corte físico mínimo (GAP-19, adoptado)
--  Propietario: Docs/Motor presupuestal/AQUILA_SAAS_E16_...md §8
--
--  Alcance de ESTE corte, deliberadamente acotado:
--    • fuente_financiacion — recursos presupuestados distintos de la cuota
--      ordinaria (otros ingresos, cuota extraordinaria, fondo de
--      imprevistos, saldo aplicable), con su fundamento legal.
--    • fundamento_normativo — trazabilidad jurídica reutilizable.
--    • presupuesto_rubros.fundamento_normativo_id — enlace opcional.
--
--  Deliberadamente FUERA de este corte (no son redundancia evitada, son
--  incrementos futuros reales — ver GAP-19 en PLAN_MAESTRO_IMPLEMENTACION.md
--  §7 para el registro formal):
--    • Neteo de fuente_financiacion contra presupuestos.monto_total / lo
--      que factura conceptos.CUOTA_ADMIN — hoy fuente_financiacion es
--      trazabilidad y tope de aplicación, no todavía reduce la cuota
--      calculada. Tocar eso implica decidir la semántica de monto_total y
--      posiblemente el liquidation-engine, que E-16 REC-008 dejó
--      explícitamente fuera.
--    • presupuesto_rubros.naturaleza/ambito/metodo_calculo — sin consumidor
--      concreto todavía (ambito=unidad además colisionaría con el mecanismo
--      de novedades ya existente a nivel de liquidación).
--    • sector / modulo_contribucion — diferido, GAP-21.
--    • Enlace fuente_financiacion ↔ rubro individual (E-10 la llamaba
--      componente_financiacion) — con financiación a nivel de presupuesto
--      alcanza para este corte; bajar el enlace a nivel de rubro es
--      ampliable después sin romper esta migración.
-- ═══════════════════════════════════════════════════════════════════════

-- ── fundamento_normativo — trazabilidad jurídica reutilizable ───────────
-- Mismo patrón que tipos/lista_tipos (20260814160000): tenant_id NULL =
-- fundamento de plataforma (LEY, DECRETO — aplican a cualquier tenant,
-- inmutables); tenant_id propio = fundamento del tenant (REGLAMENTO_PH,
-- DECISION_ASAMBLEA — cada copropiedad tiene el suyo).
create type public.fundamento_tipo_t as enum (
  'ley', 'decreto', 'reglamento_ph', 'decision_asamblea', 'otra'
);

create table public.fundamento_normativo (
  id            bigint generated always as identity primary key,
  tenant_id     uuid references public.tenants (id) on delete cascade,
  tipo          public.fundamento_tipo_t not null,
  norma         text not null,
  articulo      text,
  descripcion   text,
  fecha_vigencia date,
  referencia    text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz
);

alter table public.fundamento_normativo enable row level security;
alter table public.fundamento_normativo force row level security;

create index fundamento_normativo_tenant_idx on public.fundamento_normativo (tenant_id);

create trigger set_updated_at before update on public.fundamento_normativo
  for each row execute function public.set_updated_at();

comment on table public.fundamento_normativo is
  'Referencia legal reutilizable (Ley 675, reglamento PH, decisión de asamblea) asociable a '
  'reglas del Motor Presupuestal (E-16 §7). tenant_id NULL = norma de plataforma (LEY/DECRETO, '
  'igual para todos); tenant_id propio = fundamento del tenant (REGLAMENTO_PH/DECISION_ASAMBLEA).';

-- RLS: igual filosofía que lista_tipos — SELECT abierto a filas de
-- plataforma + las del propio tenant; INSERT/UPDATE solo agent sobre sus
-- propias filas (tenant_id NULL nunca satisface has_role, así que RLS sola
-- ya protege lo global, sin necesitar un trigger adicional).
create policy fundamento_normativo_select_miembro
  on public.fundamento_normativo for select
  to authenticated
  using (tenant_id is null or public.is_member(tenant_id));

create policy fundamento_normativo_insert_agent
  on public.fundamento_normativo for insert
  to authenticated
  with check (tenant_id is not null and public.has_role(tenant_id, array['agent']::public.tenant_role_t[]));

create policy fundamento_normativo_update_agent
  on public.fundamento_normativo for update
  to authenticated
  using (tenant_id is not null and public.has_role(tenant_id, array['agent']::public.tenant_role_t[]))
  with check (tenant_id is not null and public.has_role(tenant_id, array['agent']::public.tenant_role_t[]));

-- ── fuente_financiacion — recursos distintos de la cuota ordinaria ──────
-- E-07: lo que no cubren estas fuentes se financia por defecto vía cuota
-- ordinaria (implícita, no se modela como fila propia — sigue siendo el
-- residual de presupuestos.monto_total, igual que hoy).
create type public.fuente_financiacion_tipo_t as enum (
  'otros_ingresos', 'cuota_extraordinaria', 'fondo_imprevistos', 'saldo_aplicable'
);

create table public.fuente_financiacion (
  id                       uuid primary key default gen_random_uuid(),
  tenant_id                uuid not null references public.tenants (id) on delete cascade,
  presupuesto_id           uuid not null references public.presupuestos (id) on delete cascade,
  tipo                     public.fuente_financiacion_tipo_t not null,
  descripcion              text,
  valor_disponible         numeric(18, 2) not null,
  valor_aplicado           numeric(18, 2) not null default 0,
  fundamento_normativo_id  bigint references public.fundamento_normativo (id),
  created_at               timestamptz not null default now(),
  updated_at               timestamptz,

  constraint fuente_financiacion_valor_disponible_no_negativo check (valor_disponible >= 0),
  constraint fuente_financiacion_valor_aplicado_no_negativo check (valor_aplicado >= 0),
  constraint fuente_financiacion_aplicado_no_excede check (valor_aplicado <= valor_disponible)
);

alter table public.fuente_financiacion enable row level security;
alter table public.fuente_financiacion force row level security;

create index fuente_financiacion_tenant_idx on public.fuente_financiacion (tenant_id);
create index fuente_financiacion_presupuesto_idx on public.fuente_financiacion (presupuesto_id);

create trigger set_updated_at before update on public.fuente_financiacion
  for each row execute function public.set_updated_at();

comment on table public.fuente_financiacion is
  'Recursos presupuestados distintos de la cuota ordinaria (E-07/E-16 §8.4): otros ingresos, '
  'cuota extraordinaria, fondo de imprevistos, saldo aplicable. valor_aplicado es tope de uso '
  'declarado — todavía no reduce presupuestos.monto_total ni conceptos.CUOTA_ADMIN (alcance '
  'diferido, ver cabecera de esta migración).';

create policy fuente_financiacion_select_miembro
  on public.fuente_financiacion for select
  to authenticated
  using (public.is_member(tenant_id));

create policy fuente_financiacion_insert_agent
  on public.fuente_financiacion for insert
  to authenticated
  with check (public.has_role(tenant_id, array['agent']::public.tenant_role_t[]));

create policy fuente_financiacion_update_agent
  on public.fuente_financiacion for update
  to authenticated
  using (public.has_role(tenant_id, array['agent']::public.tenant_role_t[]))
  with check (public.has_role(tenant_id, array['agent']::public.tenant_role_t[]));

-- ── guard: fuente_financiacion inmutable + fondo validado ───────────────
-- Dos reglas en una función (ambas son validaciones de escritura sobre la
-- misma tabla, no ameritan dos triggers separados, 21 §6):
--   1. Inmutable en cuanto el presupuesto padre deja de ser editable
--      (mismo criterio que guard_presupuesto_inmutable).
--   2. FI-003 (E-07 §7): una fuente tipo fondo_imprevistos no puede
--      declarar más de lo que el fondo realmente tiene disponible.
create function public.guard_fuente_financiacion()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_estado public.presupuesto_estado_t;
  v_saldo_fondo numeric(18, 2);
begin
  select estado into v_estado
    from public.presupuestos
   where id = new.presupuesto_id;

  if v_estado in ('vigente', 'cerrado') then
    raise exception 'IMMUTABLE_BUDGET: el presupuesto % es inmutable en estado % '
      '— corrige creando una versión nueva (16 §111)', new.presupuesto_id, v_estado;
  end if;

  if new.tipo = 'fondo_imprevistos' then
    select saldo_actual into v_saldo_fondo
      from public.fondos
     where tenant_id = new.tenant_id
       and tipo = 'imprevistos';

    if v_saldo_fondo is null then
      raise exception 'FONDO_IMPREVISTOS_NO_EXISTE: el tenant % no tiene fondo de imprevistos '
        'configurado', new.tenant_id;
    end if;

    if new.valor_disponible > v_saldo_fondo then
      raise exception 'FONDO_INSUFICIENTE: valor_disponible (%) excede el saldo actual del '
        'fondo de imprevistos (%) — FI-003', new.valor_disponible, v_saldo_fondo;
    end if;
  end if;

  return new;
end;
$$;

create trigger guard_fuente_financiacion
  before insert or update on public.fuente_financiacion
  for each row execute function public.guard_fuente_financiacion();

-- ── presupuesto_rubros: enlace opcional a su fundamento legal ───────────
alter table public.presupuesto_rubros
  add column fundamento_normativo_id bigint references public.fundamento_normativo (id);

comment on column public.presupuesto_rubros.fundamento_normativo_id is
  'Referencia legal opcional del rubro (E-16 §8.1) — nullable: no todo rubro requiere '
  'fundamento explícito, solo los que lo ameriten (E-05 §12).';

-- ── presupuestos: el equilibrio también valida fuentes de financiación ──
-- Extiende guard_presupuesto_reconciliado (20260814100300): además de
-- monto_total = Σ rubros, ahora también exige que ninguna fuente de
-- financiación aplicada supere el total presupuestado (MP-009/FI-001,
-- versión mínima sin desglose por componente — ver cabecera).
create or replace function public.guard_presupuesto_reconciliado()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_suma_rubros numeric(18, 2);
  v_suma_fuentes numeric(18, 2);
begin
  if new.estado in ('aprobado', 'vigente') then
    select coalesce(sum(monto_anual), 0) into v_suma_rubros
    from public.presupuesto_rubros
    where presupuesto_id = new.id;

    if v_suma_rubros <> new.monto_total then
      raise exception 'BUDGET_NOT_RECONCILED: presupuesto % — monto_total (%) no coincide '
        'con la suma de sus rubros (%) (PLAN §4.3)', new.id, new.monto_total, v_suma_rubros;
    end if;

    select coalesce(sum(valor_aplicado), 0) into v_suma_fuentes
    from public.fuente_financiacion
    where presupuesto_id = new.id;

    if v_suma_fuentes > new.monto_total then
      raise exception 'FINANCIACION_EXCEDE_PRESUPUESTO: presupuesto % — fuentes aplicadas (%) '
        'superan monto_total (%) (E-07 FI-001/GAP-19)', new.id, v_suma_fuentes, new.monto_total;
    end if;
  end if;

  return new;
end;
$$;
