-- ═══════════════════════════════════════════════════════════════════════
--  Conceptos avanzados Fase 2 — tipo de recurrencia + periodicidad
--
--  Primera vez que el motor sabe filtrar conceptos por fecha: hoy
--  snapshot-supabase.ts carga todo concepto estado='activo' sin importar
--  el periodo que se está liquidando. tipo_recurrencia distingue:
--   - recurrente: aplica desde fecha_inicio en adelante, cada periodo.
--   - unico: aplica solo en fecha_inicio (año, mes) exactos.
--   - por_periodo: aplica entre fecha_inicio y fecha_fin (inclusive).
--   - novedad: nunca entra al filtro temporal — se excluye siempre del
--     barrido de liquidar-periodo (Fase 4: se factura por inmueble
--     puntual vía la tabla novedades, no por este mecanismo). El valor se
--     agrega ya en esta fase al enum para no requerir otra migración de
--     tipo cuando llegue Fase 4, aunque su comportamiento real (concepto
--     singleton, nunca en el plan de liquidación) se implementa entonces.
--
--  Backfill: los conceptos existentes (todos recurrentes en la práctica,
--  como CUOTA_ADMIN de GC-001, activo desde enero-2026) NO pueden
--  recibir la fecha actual como fecha_inicio — eso los excluiría de los
--  periodos ya probados (enero-mayo 2026) y rompería los golden-case
--  tests en silencio. Se usa un centinela temprano (2000-01) solo para
--  backfill; todo concepto nuevo exige un valor explícito desde el cliente.
-- ═══════════════════════════════════════════════════════════════════════

create type public.concepto_tipo_recurrencia_t as enum ('recurrente', 'unico', 'por_periodo', 'novedad');

comment on type public.concepto_tipo_recurrencia_t is
  'recurrente: aplica desde fecha_inicio en adelante. unico: solo en fecha_inicio exacta. por_periodo: entre fecha_inicio y fecha_fin. novedad: excluido del filtro temporal — se aplica por inmueble puntual (Fase 4).';

alter table public.conceptos
  add column tipo_recurrencia public.concepto_tipo_recurrencia_t not null default 'recurrente',
  add column fecha_inicio_anio smallint,
  add column fecha_inicio_mes  smallint,
  add column fecha_fin_anio    smallint,
  add column fecha_fin_mes     smallint;

update public.conceptos set fecha_inicio_anio = 2000, fecha_inicio_mes = 1;

alter table public.conceptos alter column tipo_recurrencia drop default;

alter table public.conceptos
  add constraint conceptos_tipo_recurrencia_consistente check (
    (
      tipo_recurrencia in ('recurrente', 'unico')
      and fecha_inicio_anio is not null and fecha_inicio_mes is not null
      and fecha_fin_anio is null and fecha_fin_mes is null
    )
    or (
      tipo_recurrencia = 'por_periodo'
      and fecha_inicio_anio is not null and fecha_inicio_mes is not null
      and fecha_fin_anio is not null and fecha_fin_mes is not null
      and (fecha_fin_anio, fecha_fin_mes) >= (fecha_inicio_anio, fecha_inicio_mes)
    )
    or (
      tipo_recurrencia = 'novedad'
      and fecha_inicio_anio is null and fecha_inicio_mes is null
      and fecha_fin_anio is null and fecha_fin_mes is null
    )
  ),
  add constraint conceptos_fecha_inicio_mes_valido check (
    fecha_inicio_mes is null or fecha_inicio_mes between 1 and 12
  ),
  add constraint conceptos_fecha_fin_mes_valido check (
    fecha_fin_mes is null or fecha_fin_mes between 1 and 12
  );

-- ── guard_concepto_transicion(): tipo_recurrencia/fechas se suman al
--    contenido protegido. ─────────────────────────────────────────────
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

-- ── concepto_versiones: mismas columnas nuevas, o el historial deja de
--    capturar estos cambios silenciosamente. ─────────────────────────
alter table public.concepto_versiones
  add column tipo_recurrencia public.concepto_tipo_recurrencia_t not null default 'recurrente',
  add column fecha_inicio_anio smallint,
  add column fecha_inicio_mes  smallint,
  add column fecha_fin_anio    smallint,
  add column fecha_fin_mes     smallint;

alter table public.concepto_versiones alter column tipo_recurrencia drop default;
