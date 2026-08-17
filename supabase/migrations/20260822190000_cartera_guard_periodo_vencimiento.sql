-- ═══════════════════════════════════════════════════════════════════════
--  CAR F0 · Cierra GAP-CAR-001 en la fuente
--  Propietario: Docs/Motor de gestion de cartera/CAR_00_Guia_Oficial.md §4.4
--
--  periodos.fecha_vencimiento existe desde F2 (20260814100100_domain_tables)
--  pero es nullable — un periodo puede quedar sin fecha de vencimiento y
--  romper silenciosamente toda antigüedad derivada de él (CAR §7.1). Sin
--  tocar la columna (aditivo, sin backfill inventado): se bloquea la
--  transición 'abierto' → 'en_liquidacion' cuando falta.
--
--  Extiende public.guard_periodo_transicion() (20260814100300_domain_
--  triggers.sql) en vez de duplicarla — REC-CAR-004.
-- ═══════════════════════════════════════════════════════════════════════

create or replace function public.guard_periodo_transicion()
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

  -- CAR GAP-CAR-001: sin fecha_vencimiento, el periodo no puede liquidarse
  -- — la antigüedad de cartera se volvería indefinida para sus cargos.
  if new.estado = 'en_liquidacion' and new.fecha_vencimiento is null then
    raise exception 'PERIODO_SIN_FECHA_VENCIMIENTO: el periodo % no tiene fecha_vencimiento '
      'configurada — requerida antes de liquidar (CAR §7.1, GAP-CAR-001)', new.id;
  end if;

  return new;
end;
$$;

comment on function public.guard_periodo_transicion() is
  'Máquina de estados de periodos (16 §14-16) + GAP-CAR-001: bloquea la '
  'entrada a en_liquidacion sin fecha_vencimiento, para que la antigüedad '
  'de cartera (CAR §7) sea siempre derivable.';
