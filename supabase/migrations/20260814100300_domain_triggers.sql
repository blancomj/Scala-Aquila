-- ═══════════════════════════════════════════════════════════════════════
--  F2 · Triggers del dominio PH
--  Propietario: PLAN_MAESTRO_IMPLEMENTACION.md §4.3
--
--  Reutiliza public.set_updated_at() y public.forbid_mutation(), definidas
--  en F1 (20260813190400_triggers.sql) — 21 §6 anti-redundancia.
-- ═══════════════════════════════════════════════════════════════════════

-- ── updated_at automático en las tablas de F2 que lo tienen ────────────
create trigger set_updated_at before update on public.inmuebles
  for each row execute function public.set_updated_at();
create trigger set_updated_at before update on public.zonas_comunes
  for each row execute function public.set_updated_at();
create trigger set_updated_at before update on public.coeficiente_sets
  for each row execute function public.set_updated_at();
create trigger set_updated_at before update on public.coeficientes
  for each row execute function public.set_updated_at();
create trigger set_updated_at before update on public.propietarios
  for each row execute function public.set_updated_at();
create trigger set_updated_at before update on public.inmueble_propietario
  for each row execute function public.set_updated_at();
create trigger set_updated_at before update on public.periodos
  for each row execute function public.set_updated_at();
create trigger set_updated_at before update on public.conceptos
  for each row execute function public.set_updated_at();
create trigger set_updated_at before update on public.politicas_financieras
  for each row execute function public.set_updated_at();
create trigger set_updated_at before update on public.presupuestos
  for each row execute function public.set_updated_at();
create trigger set_updated_at before update on public.presupuesto_rubros
  for each row execute function public.set_updated_at();
create trigger set_updated_at before update on public.fondos
  for each row execute function public.set_updated_at();

-- ── periodos: solo transiciones válidas (16 §14-16, 24 §24) ────────────
-- cerrado → abierto (reapertura, 16 §94) requiere autorización y auditoría
-- explícitas que todavía no existen como mecanismo (Edge Function propia,
-- F6) — se rechaza aquí hasta que ese flujo se construya.
create function public.guard_periodo_transicion()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.estado = old.estado then
    return new;
  end if;

  if not (
    (old.estado = 'abierto' and new.estado = 'en_liquidacion')
    or (old.estado = 'en_liquidacion' and new.estado = 'cerrado')
    or (old.estado = 'cerrado' and new.estado = 'bloqueado')
  ) then
    raise exception 'INVALID_TRANSITION: periodo % no puede pasar de % a % (16 §14-16)',
      old.id, old.estado, new.estado;
  end if;

  return new;
end;
$$;

create trigger guard_periodo_transicion
  before update on public.periodos
  for each row execute function public.guard_periodo_transicion();

-- ── politicas_financieras: inmutable en vigente/historica ──────────────
create function public.guard_politica_inmutable()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.estado in ('vigente', 'historica') then
    raise exception 'IMMUTABLE_POLICY: la política % (versión %) es inmutable en estado % '
      '— corrige creando una versión nueva (PLAN §4.3)', old.id, old.version, old.estado;
  end if;
  return new;
end;
$$;

create trigger guard_politica_inmutable
  before update on public.politicas_financieras
  for each row execute function public.guard_politica_inmutable();

-- ── presupuestos: inmutable en vigente/cerrado ──────────────────────────
create function public.guard_presupuesto_inmutable()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.estado in ('vigente', 'cerrado') then
    raise exception 'IMMUTABLE_BUDGET: el presupuesto % (versión %) es inmutable en estado % '
      '— corrige creando una versión nueva (16 §111)', old.id, old.version, old.estado;
  end if;
  return new;
end;
$$;

create trigger guard_presupuesto_inmutable
  before update on public.presupuestos
  for each row execute function public.guard_presupuesto_inmutable();

-- ── presupuestos: monto_total debe reconciliar con Σ rubros al aprobar ──
-- PLAN §4.3: "monto_total = Σ rubros, validado". Se exige siempre que el
-- estado nuevo sea aprobado/vigente (incluida la transición aprobado→
-- vigente) — mientras es borrador puede estar incompleto.
create function public.guard_presupuesto_reconciliado()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_suma_rubros numeric(18, 2);
begin
  if new.estado in ('aprobado', 'vigente') then
    select coalesce(sum(monto_anual), 0) into v_suma_rubros
    from public.presupuesto_rubros
    where presupuesto_id = new.id;

    if v_suma_rubros <> new.monto_total then
      raise exception 'BUDGET_NOT_RECONCILED: presupuesto % — monto_total (%) no coincide '
        'con la suma de sus rubros (%) (PLAN §4.3)', new.id, new.monto_total, v_suma_rubros;
    end if;
  end if;

  return new;
end;
$$;

create trigger guard_presupuesto_reconciliado
  before update on public.presupuestos
  for each row execute function public.guard_presupuesto_reconciliado();

-- ── coeficiente_sets: inmutable en vigente/historica ────────────────────
create function public.guard_coeficiente_set_inmutable()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.estado in ('vigente', 'historica') then
    raise exception 'IMMUTABLE_COEFFICIENT_SET: el set % (versión %) es inmutable en estado % '
      '— corrige creando una versión nueva (16 §111)', old.id, old.version, old.estado;
  end if;
  return new;
end;
$$;

create trigger guard_coeficiente_set_inmutable
  before update on public.coeficiente_sets
  for each row execute function public.guard_coeficiente_set_inmutable();

-- ── coeficientes: bloqueados si su set ya es vigente/historica ─────────
create function public.guard_coeficiente_set_padre_inmutable()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_set_id    uuid;
  v_estado    public.vigencia_estado_t;
begin
  v_set_id := coalesce(new.set_id, old.set_id);

  select estado into v_estado
  from public.coeficiente_sets
  where id = v_set_id;

  if v_estado in ('vigente', 'historica') then
    raise exception 'IMMUTABLE_COEFFICIENT_SET: el set % es inmutable en estado % '
      '— corrige creando una versión nueva (16 §111)', v_set_id, v_estado;
  end if;

  return coalesce(new, old);
end;
$$;

create trigger guard_coeficiente_set_padre_inmutable
  before insert or update or delete on public.coeficientes
  for each row execute function public.guard_coeficiente_set_padre_inmutable();

-- ── fondos.saldo_actual: derivado de fondo_movimientos (20 §18) ────────
create function public.recalcular_saldo_fondo()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.fondos
  set saldo_actual = coalesce((
    select sum(case when fm.tipo = 'aporte' then fm.monto else -fm.monto end)
    from public.fondo_movimientos fm
    where fm.fondo_id = new.fondo_id
  ), 0)
  where id = new.fondo_id;

  return new;
end;
$$;

create trigger recalcular_saldo_fondo
  after insert on public.fondo_movimientos
  for each row execute function public.recalcular_saldo_fondo();

-- ── fondo_movimientos: append-only (PLAN §4.3, mismo patrón que audit_log) ──
create trigger fondo_movimientos_append_only
  before update or delete on public.fondo_movimientos
  for each row execute function public.forbid_mutation();
