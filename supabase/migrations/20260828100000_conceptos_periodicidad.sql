-- ═══════════════════════════════════════════════════════════════════════
--  Conceptos avanzados — periodicidad de un concepto recurrente
--
--  tipo_recurrencia='recurrente' hoy aplica en TODOS los periodos desde
--  fecha_inicio en adelante (temporal.ts::conceptoAplicaEnPeriodo) — no
--  distingue "cada mes" de "cada trimestre". periodicidad cierra ese gap:
--  mensual (comportamiento actual, sin cambios) | bimensual | trimestral |
--  semestral | anual — solo tiene sentido para 'recurrente' (unico ya es un
--  solo periodo; por_periodo ya tiene su propio rango; novedad nunca entra
--  al filtro temporal), igual que fecha_fin solo aplica a 'por_periodo'.
--
--  Backfill: todo concepto 'recurrente' existente (CUOTA_ADMIN de GC-001
--  incluido) recibe 'mensual' — preserva exactamente el comportamiento de
--  hoy, sin romper los golden-case tests.
-- ═══════════════════════════════════════════════════════════════════════

create type public.concepto_periodicidad_t as enum
  ('mensual', 'bimensual', 'trimestral', 'semestral', 'anual');

comment on type public.concepto_periodicidad_t is
  'Cada cuántos periodos aplica un concepto tipo_recurrencia=''recurrente'' — mensual: cada periodo (comportamiento pre-existente). bimensual/trimestral/semestral/anual: cada 2/3/6/12 periodos desde fecha_inicio.';

alter table public.conceptos
  add column periodicidad public.concepto_periodicidad_t;

update public.conceptos set periodicidad = 'mensual' where tipo_recurrencia = 'recurrente';

alter table public.conceptos
  add constraint conceptos_periodicidad_consistente check (
    (tipo_recurrencia = 'recurrente' and periodicidad is not null)
    or (tipo_recurrencia <> 'recurrente' and periodicidad is null)
  );

-- ── guard_concepto_transicion(): periodicidad se suma al contenido
--    protegido (mismo criterio que tipo_recurrencia/fechas, Fase 2). ─────
create or replace function public.guard_concepto_transicion()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_contenido_cambio boolean;
begin
  v_contenido_cambio := (
    new.nombre is distinct from old.nombre
    or new.tipo_base is distinct from old.tipo_base
    or new.modo_calculo is distinct from old.modo_calculo
    or new.formula_ael is distinct from old.formula_ael
    or new.prioridad is distinct from old.prioridad
    or new.modo_valor is distinct from old.modo_valor
    or new.valor_fijo is distinct from old.valor_fijo
    or new.tipo_recurrencia is distinct from old.tipo_recurrencia
    or new.fecha_inicio_anio is distinct from old.fecha_inicio_anio
    or new.fecha_inicio_mes is distinct from old.fecha_inicio_mes
    or new.fecha_fin_anio is distinct from old.fecha_fin_anio
    or new.fecha_fin_mes is distinct from old.fecha_fin_mes
    or new.periodicidad is distinct from old.periodicidad
  );

  if v_contenido_cambio and old.estado <> 'borrador' then
    raise exception 'CONCEPTO_INMUTABLE: % está en estado % — solo se puede editar el contenido en borrador (Doc 10 §27)',
      old.id, old.estado;
  end if;

  if new.estado = old.estado then
    return new;
  end if;

  if not (
    (old.estado = 'borrador' and new.estado = 'en_revision')
    or (old.estado = 'en_revision' and new.estado = 'borrador')
    or (old.estado = 'en_revision' and new.estado = 'activo')
    or (old.estado = 'activo' and new.estado = 'borrador')
    or (old.estado = 'activo' and new.estado = 'archivado')
    or (old.estado = 'borrador' and new.estado = 'archivado')
  ) then
    raise exception 'INVALID_TRANSITION: concepto % no puede pasar de % a %',
      old.id, old.estado, new.estado;
  end if;

  if old.estado = 'borrador' and new.estado = 'en_revision' then
    new.enviado_a_revision_por := auth.uid();
    new.enviado_a_revision_at := now();
  end if;

  if old.estado = 'en_revision' and new.estado = 'activo' then
    if auth.uid() is not null and old.enviado_a_revision_por = auth.uid() then
      raise exception 'SELF_APPROVAL: no puedes aprobar tu propia solicitud de revisión (concepto %)',
        old.id;
    end if;
    new.aprobado_por := auth.uid();
    new.aprobado_at := now();
  end if;

  return new;
end;
$$;

-- ── concepto_versiones: misma columna nueva, nullable (igual que
--    fecha_inicio_*/fecha_fin_*: solo aplica quien tenga sentido en cada
--    fila, no exige backfill de versiones históricas). ────────────────────
alter table public.concepto_versiones
  add column periodicidad public.concepto_periodicidad_t;
