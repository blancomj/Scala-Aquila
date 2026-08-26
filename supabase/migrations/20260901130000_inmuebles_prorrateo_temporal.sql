-- ═══════════════════════════════════════════════════════════════════════
--  Prorrateo temporal por inmueble (H2, auditoría externa 2026-08-26,
--  Docs/evaluacion/02) — un inmueble que se activa o se retira a mitad de
--  periodo hoy paga (o no paga) el mes completo, sin ninguna regla
--  explícita: solo el efecto colateral de en qué estado esté `inmuebles`
--  cuando se corre la liquidación.
--
--  Decisión del usuario (2026-08-26): prorratear por días calendario
--  reales del mes, sobre TODO concepto recurrente (no solo la cuota de
--  administración), disparado automáticamente al liquidar — sin paso
--  manual. Los días que un inmueble no estuvo activo se redistribuyen
--  entre los demás según su propio coeficiente (el motor sigue
--  garantizando reconciliación exacta Σ=fuente vía allocate(), ver
--  executor.ts) — no queda déficit de recaudo.
--
--  Dos columnas, no una tabla de historial: v0 solo necesita saber si el
--  inmueble cambió de estado DENTRO del periodo que se está liquidando,
--  no un historial completo de transiciones. Un inmueble que cambia de
--  estado dos veces en el mismo mes (activo→inactivo→activo antes de
--  liquidar) queda fuera de alcance a propósito — caso raro, se resuelve
--  hoy igual que cualquier caso no cubierto: manualmente, vía novedad.
--
--  NULL en ambas columnas (todo inmueble existente antes de esta
--  migración) significa "sin transición registrada" — el snapshot builder
--  lo trata como activo el periodo completo, igual que el comportamiento
--  de siempre. Nada retroactivo que inventar.
-- ═══════════════════════════════════════════════════════════════════════

alter table public.inmuebles
  add column activo_desde   date,
  add column inactivo_desde date;

comment on column public.inmuebles.activo_desde is
  'Última fecha en que el inmueble pasó a estado=activo — la pone fn_inmueble_estado_fechas(), '
  'nunca el cliente. NULL: sin transición registrada (todo inmueble anterior a esta migración), '
  'el snapshot builder lo trata como activo el periodo completo.';
comment on column public.inmuebles.inactivo_desde is
  'Última fecha en que el inmueble pasó a estado=inactivo — la pone fn_inmueble_estado_fechas(). '
  'NULL mientras esté activo (se limpia al reactivar).';

create function public.fn_inmueble_estado_fechas()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- tg_op se chequea primero y aparte (no en el mismo OR que lee old.estado)
  -- a propósito: OLD no existe en un trigger de INSERT, y no vale la pena
  -- apostar a que el short-circuit de OR evite tocarlo.
  if tg_op = 'INSERT' then
    if new.estado = 'activo' then
      new.activo_desde := current_date;
    else
      new.inactivo_desde := current_date;
    end if;
  elsif new.estado is distinct from old.estado then
    if new.estado = 'activo' then
      new.activo_desde := current_date;
      new.inactivo_desde := null;
    else
      new.inactivo_desde := current_date;
    end if;
  end if;
  return new;
end;
$$;

comment on function public.fn_inmueble_estado_fechas() is
  'Mantiene inmuebles.activo_desde/inactivo_desde en cada INSERT o cambio de estado — nunca '
  'confiado del cliente, igual criterio que enviado_a_revision_por en conceptos.';

create trigger fn_inmueble_estado_fechas
  before insert or update on public.inmuebles
  for each row execute function public.fn_inmueble_estado_fechas();
