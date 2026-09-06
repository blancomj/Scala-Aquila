-- ═══════════════════════════════════════════════════════════════════════
--  CO-2 · Núcleo del libro contable — estado contable del periodo
--  (Casos de uso/Tres Modulos/Contabilidad/CO_02_nucleo_libro_contable.md §3.1)
--
--  Por qué existe: el ciclo de liquidación (periodos.estado, abierto →
--  en_liquidacion → cerrado → bloqueado) y el ciclo contable son distintos y
--  pueden cerrarse en momentos distintos — se reutiliza `periodos` (PC_00
--  §PRE-08, regla de no redundancia) pero con una marca SEPARADA, no se
--  mezcla con `periodo_estado_t` (ese tiene `en_liquidacion`, que no
--  significa nada contablemente).
--
--  Qué queda deliberadamente fuera de este corte: el proceso de cierre con
--  sus validaciones previas (balance cuadrado, deterioro reconocido, etc.)
--  es CO-6. Aquí solo existen la columna, el enum y el guard de transición.
-- ═══════════════════════════════════════════════════════════════════════

create type public.contable_periodo_estado_t as enum ('abierto', 'cerrado', 'bloqueado');

comment on type public.contable_periodo_estado_t is
  'D-24: estado del CICLO CONTABLE de un periodo — gobierna si se admiten asientos '
  '(fn_contabilizar_comprobante exige abierto), separado de periodos.estado (ciclo de '
  'liquidación). Invariante de transición real (guard_contable_periodo_transicion), no '
  'vocabulario descriptivo.';

alter table public.periodos
  add column contable_estado           public.contable_periodo_estado_t not null default 'abierto',
  add column contable_cerrado_at       timestamptz,
  add column contable_cerrado_por      uuid references public.profiles (id),
  add column contable_reabierto_motivo text;

comment on column public.periodos.contable_estado is
  'Ciclo contable del periodo (CO-2), independiente de `estado` (ciclo de liquidación). '
  'abierto → cerrado → bloqueado; cerrado → abierto solo vía reapertura auditada '
  '(exige contable_reabierto_motivo). El proceso de cierre con sus validaciones previas es CO-6 '
  '— aquí solo se modela la transición.';
comment on column public.periodos.contable_cerrado_at is
  'Cuándo se cerró contablemente el periodo por última vez — se estampa automáticamente al '
  'entrar a cerrado o bloqueado (guard_contable_periodo_transicion).';
comment on column public.periodos.contable_cerrado_por is
  'Quién cerró contablemente el periodo por última vez — mismo trigger que contable_cerrado_at.';
comment on column public.periodos.contable_reabierto_motivo is
  'Motivo de la reapertura contable más reciente (cerrado → abierto). Obligatorio en esa '
  'transición específica (CONTABLE_PERIODO_REAPERTURA_SIN_MOTIVO); no se limpia automáticamente '
  'al volver a cerrar, para conservar el motivo de la última reapertura en el historial visible.';

create function public.guard_contable_periodo_transicion()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.contable_estado = old.contable_estado then
    return new;
  end if;

  if old.contable_estado = 'cerrado' and new.contable_estado = 'abierto' then
    if coalesce(btrim(new.contable_reabierto_motivo), '') = '' then
      raise exception 'CONTABLE_PERIODO_REAPERTURA_SIN_MOTIVO: reabrir el periodo % exige motivo',
        old.id;
    end if;
    return new;
  end if;

  if not (
    (old.contable_estado = 'abierto' and new.contable_estado = 'cerrado')
    or (old.contable_estado = 'cerrado' and new.contable_estado = 'bloqueado')
  ) then
    raise exception 'CONTABLE_PERIODO_TRANSICION_INVALIDA: el periodo % no puede pasar de % a %',
      old.id, old.contable_estado, new.contable_estado;
  end if;

  if new.contable_estado in ('cerrado', 'bloqueado') then
    new.contable_cerrado_at := now();
    new.contable_cerrado_por := (select auth.uid());
  end if;

  return new;
end;
$$;

comment on function public.guard_contable_periodo_transicion() is
  'CO-2: abierto → cerrado → bloqueado; cerrado → abierto solo con motivo (reapertura auditada). '
  'Estampa contable_cerrado_at/por al entrar a cerrado o bloqueado.';

create trigger guard_contable_periodo_transicion
  before update on public.periodos
  for each row execute function public.guard_contable_periodo_transicion();
