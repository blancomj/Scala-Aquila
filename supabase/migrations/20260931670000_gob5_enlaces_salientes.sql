-- ═══════════════════════════════════════════════════════════════════════
--  GOB-5 · Enlaces salientes — la trazabilidad que justifica el módulo
--  Ver GOB_05_decision_compromisos.md §4.4, §4.5, pruebas 8-11.
--
--  Solo dos destinos reciben decision_id en este corte: presupuestos (ya
--  existe, refactor real per §4.5) y fondo_autorizaciones (ya existe). La
--  "rendición de cuentas contable" y el enlace de "castigo de cartera"
--  quedan explícitamente para CO-9 — CO_09_PARCHE_FRONTERA_GOBIERNO.md los
--  asigna a "Cambios concretos a aplicar en CO-9" (§3), y
--  contable_rendicion_cuentas ni siquiera existe todavía. No se inventa
--  esa tabla aquí (marco: "no crees entidades de módulos inexistentes").
--  El enlace de "cuota extraordinaria" a `conceptos` también queda fuera:
--  ninguna prueba lo exige y conceptos no tiene hoy dónde guardarlo.
--
--  Nota sobre nombres: CO_09_PARCHE_FRONTERA_GOBIERNO.md fue redactado
--  antes de fijarse la convención `gobierno_*` (GOB-1..4) y nombra las
--  tablas como `public.decisiones`/`public.reuniones` — inconsistencia del
--  parche, reportada en el informe. Este corte usa los nombres reales
--  gobierno_decisiones/gobierno_reuniones ya establecidos.
--
--  Retro-FK: gobierno_miembros.decision_id (GOB-1) y
--  gobierno_acta_verificadores.designado_en_decision_id (GOB-4) quedaron
--  deliberadamente sin FK "hasta que GOB-5 exista" — se conecta aquí.
-- ═══════════════════════════════════════════════════════════════════════

-- ── presupuestos: refactor de acta_asamblea (texto) → decision_id (FK) ──
alter table public.presupuestos add column decision_id uuid references public.gobierno_decisiones (id);

comment on column public.presupuestos.decision_id is
  'GOB-5 (20260931670000): la decisión de asamblea que aprueba este presupuesto (art. 51). '
  'Reemplaza a acta_asamblea (texto libre, ahora obsoleta) para copropiedades que usan GOB — '
  'nunca ambas pobladas a la vez (PRESUPUESTO_ORIGEN_APROBACION_DUPLICADO).';

comment on column public.presupuestos.acta_asamblea is
  'OBSOLETA desde GOB-5 (20260931670000, 2026-09-07): reemplazada por decision_id. Se conserva '
  'como respaldo de texto libre para copropiedades que aún no usan el módulo de gobierno — nunca '
  'se puebla junto con decision_id (PRESUPUESTO_ORIGEN_APROBACION_DUPLICADO). Cero migración '
  'automática de los textos existentes (spec §4.5, prueba 11).';

create function public.guard_presupuesto_origen_aprobacion()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.acta_asamblea is not null and new.decision_id is not null then
    raise exception 'PRESUPUESTO_ORIGEN_APROBACION_DUPLICADO: el presupuesto % no puede tener a '
      'la vez acta_asamblea (texto) y decision_id — son dos representaciones del mismo hecho',
      new.id;
  end if;
  return new;
end;
$$;

create trigger presupuesto_origen_aprobacion_guard
  before insert or update on public.presupuestos
  for each row execute function public.guard_presupuesto_origen_aprobacion();

-- ── fondo_autorizaciones: decision_id, sin guard de exclusión ────────────
-- fondo_autorizaciones es append-only (un hecho jurídico ya ocurrido, GOB-5
-- no lo modifica): a diferencia de presupuestos, no hay una transición de
-- "activar" que arriesgue poblar las dos fuentes en una misma fila — cada
-- fila nace una sola vez y decide en ese momento cuál fuente usar.
alter table public.fondo_autorizaciones
  add column decision_id uuid references public.gobierno_decisiones (id);

comment on column public.fondo_autorizaciones.decision_id is
  'GOB-5 (20260931670000): la decisión de gobierno que autoriza este movimiento, cuando la '
  'copropiedad usa GOB — nulable, coexiste con los campos de texto libre existentes '
  '(tipo_decision/decision/numero_acta) para copropiedades que no lo usan.';

-- ── Retro-FK: gobierno_miembros.decision_id (GOB-1) ──────────────────────
alter table public.gobierno_miembros
  add constraint gobierno_miembros_decision_id_fkey
  foreign key (decision_id) references public.gobierno_decisiones (id);

comment on column public.gobierno_miembros.decision_id is
  'La decisión que lo eligió — FK real desde GOB-5 (20260931670000); antes nulable sin FK porque '
  'la tabla de decisiones no existía todavía (GOB-1, 20260931380000).';

-- ── Retro-FK: gobierno_acta_verificadores.designado_en_decision_id (GOB-4) ──
alter table public.gobierno_acta_verificadores
  add constraint gobierno_acta_verificadores_designado_en_decision_id_fkey
  foreign key (designado_en_decision_id) references public.gobierno_decisiones (id);

comment on column public.gobierno_acta_verificadores.designado_en_decision_id is
  'La decisión que designó la comisión verificadora — FK real desde GOB-5 (20260931670000); '
  'antes sin FK (GOB-4, 20260931580000).';

-- ── gobierno_decision_efectos / gobierno_decision_origen (spec §4.4) ─────
create function public.gobierno_decision_efectos(p_decision_id uuid)
returns table (entidad text, entidad_id uuid, descripcion text)
language sql
stable
security invoker
set search_path = ''
as $$
  select 'presupuesto'::text, p.id, format('Presupuesto %s versión %s', p.anio, p.version)
  from public.presupuestos p
  where p.decision_id = p_decision_id

  union all

  select 'fondo_autorizacion'::text, fa.id, fa.decision
  from public.fondo_autorizaciones fa
  where fa.decision_id = p_decision_id
$$;

comment on function public.gobierno_decision_efectos(uuid) is
  'GOB-5 §4.4: todos los efectos registrados de una decisión — hoy solo presupuesto y '
  'autorización de fondo (los dos únicos destinos que existen y que este corte conecta). '
  'Rendición contable y castigo de cartera quedan para CO-9 (ver cabecera de la migración).';

create function public.gobierno_decision_origen(p_entidad text, p_entidad_id uuid)
returns public.gobierno_decisiones
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  v_decision_id uuid;
  v_decision    public.gobierno_decisiones;
begin
  if p_entidad = 'presupuesto' then
    select decision_id into v_decision_id from public.presupuestos where id = p_entidad_id;
  elsif p_entidad = 'fondo_autorizacion' then
    select decision_id into v_decision_id from public.fondo_autorizaciones where id = p_entidad_id;
  else
    raise exception 'DECISION_ORIGEN_ENTIDAD_DESCONOCIDA: entidad % no reconocida (use '
      'presupuesto o fondo_autorizacion)', p_entidad;
  end if;

  if v_decision_id is null then
    return null;
  end if;

  select * into v_decision from public.gobierno_decisiones where id = v_decision_id;
  return v_decision;
end;
$$;

comment on function public.gobierno_decision_origen(text, uuid) is
  'GOB-5 §4.4: la inversa de gobierno_decision_efectos — desde un presupuesto o una autorización '
  'de fondo, la decisión que lo originó (o null si no fue aprobado vía GOB). Prueba 9.';
