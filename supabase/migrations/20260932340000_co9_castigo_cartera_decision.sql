-- ═══════════════════════════════════════════════════════════════════════
--  CO-9 · contable_castigo_cartera — frontera con gobierno (parche §3.2)
--
--  contable_castigo_cartera ya existe (CO-7, 20260930410000) como "solo
--  estructura" con acta_referencia text not null. El parche sustituye esa
--  referencia textual por decision_id, respondiendo la pregunta que CO-7
--  dejó abierta ("qué órgano autoriza el castigo"): lo autoriza quien
--  tenga la atribución según el reglamento (GOB-1), contabilidad solo
--  guarda el enlace.
--
--  A diferencia de contable_rendicion_cuentas (que tiene estado borrador
--  donde ambas fuentes pueden estar vacías todavía), contable_castigo_
--  cartera no tiene ciclo de vida propio — se inserta ya con la
--  autorización resuelta (autorizado_por/autorizado_at), así que aquí SÍ
--  se exige exactamente una fuente siempre, nunca ninguna.
-- ═══════════════════════════════════════════════════════════════════════

alter table public.contable_castigo_cartera
  rename column acta_referencia to acta_referencia_texto;

alter table public.contable_castigo_cartera
  alter column acta_referencia_texto drop not null;

alter table public.contable_castigo_cartera
  add column decision_id uuid references public.gobierno_decisiones (id);

create index contable_castigo_cartera_decision_idx
  on public.contable_castigo_cartera (decision_id) where decision_id is not null;

comment on column public.contable_castigo_cartera.acta_referencia_texto is
  'Respaldo transitorio (parche CO-9 §3.2), mismo criterio que '
  'contable_rendicion_cuentas.acta_referencia_texto: existe solo para el tenant que aún no adoptó '
  'el módulo de gobierno. Exactamente una de acta_referencia_texto/decision_id debe estar '
  'poblada (guard_castigo_cartera_origen), nunca ninguna ni las dos.';

comment on column public.contable_castigo_cartera.decision_id is
  'CO-9 parche §3.2: quién autoriza el castigo lo modela GOB-1 (atribución según el reglamento) '
  'y GOB-5 (la decisión formal); esta columna solo guarda el enlace, nunca el resultado.';

create function public.guard_castigo_cartera_origen()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.decision_id is not null and new.acta_referencia_texto is not null then
    raise exception 'CASTIGO_ORIGEN_DUPLICADO: el castigo % no puede tener decision_id y '
      'acta_referencia_texto a la vez', new.id;
  end if;

  if new.decision_id is null and coalesce(btrim(new.acta_referencia_texto), '') = '' then
    raise exception 'CASTIGO_ORIGEN_FALTANTE: el castigo % exige decision_id o '
      'acta_referencia_texto — cualquier fila aquí presupone que la autorización ya existió',
      new.id;
  end if;

  return new;
end;
$$;

create trigger contable_castigo_cartera_guard_origen
  before insert or update on public.contable_castigo_cartera
  for each row execute function public.guard_castigo_cartera_origen();
