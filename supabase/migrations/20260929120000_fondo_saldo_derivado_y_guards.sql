-- ═══════════════════════════════════════════════════════════════════════
--  Dominio Fondos — BLOQUE E (2/2): el saldo deja de ser un número editable.
--  Propietario: PLAN_MAESTRO_IMPLEMENTACION.md §4.3 (GAP-22), R8, D-36.
--
--  EL DEFECTO QUE CIERRA (ANALISIS_FONDOS_BLOQUE_A.md §4.1). El PLAN declara
--  desde F2 la invariante R8 `fondo.saldo_actual = Σ fondo_movimientos` y la
--  da por aceptada. No lo estaba: recalcular_saldo_fondo solo dispara
--  `after insert on fondo_movimientos`, así que cualquier UPDATE directo
--  sobre el campo quedaba en pie. En la base de desarrollo había un fondo con
--  saldo 250.000 y CERO movimientos — y ese número es justo el que consulta
--  FI-003, el guard que bloquea un presupuesto. El saldo dejaba de ser una
--  derivación para ser un dato editable del que dependía una regla de
--  negocio: exactamente lo que el Modelo Maestro §34/§45 prohíbe.
--
--  CÓMO SE CIERRA, y por qué no basta con "quitar el permiso de UPDATE".
--  El trigger de recálculo también hace UPDATE, y fn_resetear_copropiedad
--  también (pone 0 después de borrar los movimientos). Bloquear por autor
--  obligaría a mantener una lista de llamadores privilegiados. En su lugar el
--  guard compara: el valor que se intenta escribir debe ser EXACTAMENTE el
--  derivado. El recálculo pasa porque escribe la derivación; el reset pasa
--  porque tras borrar los movimientos la derivación es 0; un UPDATE a mano
--  falla. La invariante se hace cumplir, no se vigila al llamador.
--
--  SIGNO. `monto` sigue siendo positivo para los seis tipos cuya dirección es
--  inequívoca. `ajuste` y `reversion` sí llevan signo en el importe: un
--  ajuste puede ir en cualquier dirección, y una reversión debe valer
--  exactamente lo contrario del movimiento que corrige — invariante que el
--  guard verifica contra el original en vez de confiar en quien la registra.
--  La proyección contable ya trataba un monto negativo intercambiando débito
--  y crédito (20260830500000), así que esto no le añade ningún caso nuevo.
-- ═══════════════════════════════════════════════════════════════════════

-- ── 1. Efecto de un movimiento sobre el saldo ───────────────────────────
create function public.fn_fondo_movimiento_efecto(
  p_tipo public.fondo_movimiento_tipo_t,
  p_monto numeric
)
returns numeric
language sql
immutable
set search_path = ''
as $$
  select case p_tipo
    when 'aporte'           then p_monto
    when 'rendimiento'      then p_monto
    when 'traslado_entrada' then p_monto
    when 'uso'              then -p_monto
    when 'traslado_salida'  then -p_monto
    when 'cierre_remanente' then -p_monto
    -- ajuste y reversion llegan ya firmados (ver cabecera).
    else p_monto
  end;
$$;

comment on function public.fn_fondo_movimiento_efecto(public.fondo_movimiento_tipo_t, numeric) is
  'Cuánto suma o resta un movimiento al saldo del fondo. Una sola definición del signo, '
  'compartida por el recálculo, la reconciliación y el guard de reversión — para que no puedan '
  'divergir entre sí.';

-- ── 2. Importe firmado solo donde la dirección es genuinamente ambigua ──
alter table public.fondo_movimientos
  drop constraint fondo_movimientos_monto_positivo;

alter table public.fondo_movimientos
  add constraint fondo_movimientos_monto_signo check (
    case when tipo in ('ajuste', 'reversion') then monto <> 0 else monto > 0 end
  );

-- ── 3. El saldo derivado, fuente de verdad ──────────────────────────────
create function public.fn_fondo_saldo_derivado(p_fondo_id uuid)
returns numeric
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(sum(public.fn_fondo_movimiento_efecto(fm.tipo, fm.monto)), 0)
    from public.fondo_movimientos fm
   where fm.fondo_id = p_fondo_id;
$$;

comment on function public.fn_fondo_saldo_derivado(uuid) is
  'Σ de los movimientos del fondo. Esta es la fuente de verdad del saldo (PLAN §4.3, R8); '
  'fondos.saldo_actual es solo su caché materializado, y guard_fondo_saldo_derivado impide que '
  'los dos se separen.';

create or replace function public.recalcular_saldo_fondo()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.fondos
     set saldo_actual = public.fn_fondo_saldo_derivado(new.fondo_id)
   where id = new.fondo_id;

  return new;
end;
$$;

-- ── 4. saldo_actual deja de ser escribible a mano ───────────────────────
create function public.guard_fondo_saldo_derivado()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_derivado numeric(18, 2);
begin
  if tg_op = 'UPDATE' and new.saldo_actual is not distinct from old.saldo_actual then
    return new;
  end if;

  v_derivado := public.fn_fondo_saldo_derivado(new.id);

  if new.saldo_actual is distinct from v_derivado then
    raise exception 'FONDO_SALDO_DERIVADO: saldo_actual del fondo % no se escribe a mano — vale % '
      'según sus movimientos, se intentó %. Registra un fondo_movimientos (R8, PLAN §4.3)',
      new.codigo, v_derivado, new.saldo_actual;
  end if;

  return new;
end;
$$;

create trigger guard_fondo_saldo_derivado
  before insert or update of saldo_actual on public.fondos
  for each row execute function public.guard_fondo_saldo_derivado();

comment on function public.guard_fondo_saldo_derivado() is
  'Hace cumplir R8 comparando contra la derivación en vez de vigilar quién escribe: el recálculo '
  'y fn_resetear_copropiedad pasan porque escriben el valor correcto; un UPDATE manual falla. '
  'Cubre INSERT también — un fondo nuevo no puede nacer con saldo.';

-- ── 5. Coherencia del movimiento ────────────────────────────────────────
create function public.guard_fondo_movimiento()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_fondo public.fondos;
  v_original public.fondo_movimientos;
begin
  select * into v_fondo from public.fondos where id = new.fondo_id;

  if v_fondo.id is null then
    raise exception 'FONDO_NO_ENCONTRADO: % no existe', new.fondo_id;
  end if;

  if v_fondo.tenant_id <> new.tenant_id then
    raise exception 'FONDO_TENANT_INCONSISTENTE: el fondo % pertenece a otro tenant', new.fondo_id;
  end if;

  -- FND-T-013. Un fondo cerrado, cancelado o todavía sin autorizar no recibe
  -- movimientos. en_cierre admite únicamente el tratamiento del remanente:
  -- es justo el estado que existe para impedir operaciones nuevas mientras se
  -- liquida (Modelo §36).
  if v_fondo.estado in ('propuesto', 'pendiente_autorizacion', 'cerrado', 'cancelado')
     or (v_fondo.estado = 'en_cierre' and new.tipo <> 'cierre_remanente') then
    raise exception 'FONDO_ESTADO_NO_ADMITE_MOVIMIENTOS: el fondo % está % y no admite un '
      'movimiento de tipo %', v_fondo.codigo, v_fondo.estado, new.tipo;
  end if;

  -- Corregir exige decir por qué (mismo criterio que novedades.inhabilitada_motivo).
  if new.tipo in ('ajuste', 'reversion')
     and (new.motivo is null or btrim(new.motivo) = '') then
    raise exception 'FONDO_MOTIVO_REQUERIDO: un movimiento de tipo % exige motivo', new.tipo;
  end if;

  if new.tipo = 'reversion' then
    if new.reversion_de_id is null then
      raise exception 'FONDO_REVERSION_INVALIDA: una reversión debe indicar qué movimiento '
        'corrige (reversion_de_id)';
    end if;

    select * into v_original
      from public.fondo_movimientos where id = new.reversion_de_id;

    if v_original.id is null or v_original.fondo_id <> new.fondo_id then
      raise exception 'FONDO_REVERSION_INVALIDA: el movimiento % no existe o no es de este fondo',
        new.reversion_de_id;
    end if;

    if v_original.tipo = 'reversion' then
      raise exception 'FONDO_REVERSION_INVALIDA: una reversión no se revierte — corrige con un '
        'movimiento nuevo';
    end if;

    -- La reversión vale exactamente lo contrario del original. Se verifica
    -- contra el original en vez de confiar en el importe recibido: es la
    -- única forma de que "reversión" signifique siempre lo mismo en el saldo.
    if new.monto is distinct from
       -public.fn_fondo_movimiento_efecto(v_original.tipo, v_original.monto) then
      raise exception 'FONDO_REVERSION_INVALIDA: una reversión debe valer % (lo contrario del '
        'movimiento que corrige), se recibió %',
        -public.fn_fondo_movimiento_efecto(v_original.tipo, v_original.monto), new.monto;
    end if;
  elsif new.reversion_de_id is not null then
    raise exception 'FONDO_REVERSION_INVALIDA: reversion_de_id solo aplica a un movimiento de '
      'tipo reversion';
  end if;

  if new.documento_id is not null and not exists (
    select 1 from public.documentos d
     where d.id = new.documento_id and d.tenant_id = new.tenant_id
  ) then
    raise exception 'DOCUMENTO_INVALIDO: % no pertenece al tenant %',
      new.documento_id, new.tenant_id;
  end if;

  if new.pago_id is not null and not exists (
    select 1 from public.pagos p where p.id = new.pago_id and p.tenant_id = new.tenant_id
  ) then
    raise exception 'PAGO_INVALIDO: % no pertenece al tenant %', new.pago_id, new.tenant_id;
  end if;

  if new.extracto_linea_id is not null and not exists (
    select 1 from public.extracto_linea el
     where el.id = new.extracto_linea_id and el.tenant_id = new.tenant_id
  ) then
    raise exception 'EXTRACTO_LINEA_INVALIDA: % no pertenece al tenant %',
      new.extracto_linea_id, new.tenant_id;
  end if;

  new.registrado_por := coalesce(new.registrado_por, (select auth.uid()));

  return new;
end;
$$;

create trigger guard_fondo_movimiento
  before insert on public.fondo_movimientos
  for each row execute function public.guard_fondo_movimiento();

-- ── 6. Control de reconciliación (Modelo §34/§47: reporta, no corrige) ──
create function public.fn_fondo_reconciliar(p_tenant_id uuid)
returns table (
  fondo_id            uuid,
  codigo              text,
  nombre              text,
  saldo_materializado numeric,
  saldo_derivado      numeric,
  diferencia          numeric
)
language sql
stable
security invoker
set search_path = ''
as $$
  select f.id,
         f.codigo,
         f.nombre,
         f.saldo_actual,
         public.fn_fondo_saldo_derivado(f.id),
         f.saldo_actual - public.fn_fondo_saldo_derivado(f.id)
    from public.fondos f
   where f.tenant_id = p_tenant_id
   order by f.codigo;
$$;

comment on function public.fn_fondo_reconciliar(uuid) is
  'Contrasta el saldo materializado contra la derivación de los movimientos, fondo por fondo '
  '(Modelo Maestro §34). Reporta la diferencia; NO la corrige — una divergencia es una excepción '
  'de control que alguien debe explicar, no un número que el sistema arregle solo (§47). Con '
  'guard_fondo_saldo_derivado en pie la diferencia debe ser siempre 0: si deja de serlo, hay un '
  'camino de escritura que se saltó el guard. security invoker a propósito: se lee con RLS del '
  'usuario, igual que cualquier consulta de fondos.';

-- ── 7. Corrección del saldo huérfano heredado ───────────────────────────
-- Se deja rastro en audit_log en vez de sobrescribir en silencio: el valor
-- anterior no tenía movimientos que lo respaldaran, pero borrarlo sin
-- registro sería exactamente el tipo de ajuste invisible que este bloque
-- existe para impedir.
insert into public.audit_log (tenant_id, actor_id, action, entity_type, entity_id, metadata)
select f.tenant_id,
       null,
       'fondo.saldo_reconciliado',
       'fondos',
       f.id,
       jsonb_build_object(
         'saldo_anterior', f.saldo_actual,
         'saldo_derivado', public.fn_fondo_saldo_derivado(f.id),
         'motivo', 'GAP-22: saldo materializado sin movimientos que lo respalden (R8)'
       )
  from public.fondos f
 where f.saldo_actual is distinct from public.fn_fondo_saldo_derivado(f.id);

update public.fondos f
   set saldo_actual = public.fn_fondo_saldo_derivado(f.id)
 where f.saldo_actual is distinct from public.fn_fondo_saldo_derivado(f.id);
