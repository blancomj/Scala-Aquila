-- ═══════════════════════════════════════════════════════════════════════
--  Conceptos avanzados Fase 1 — modo de valor Fijo vs. Formulado
--
--  Cierra un gap ya documentado en snapshot-supabase.ts (AD-23): hoy un
--  concepto sin formula_ael se excluye en silencio del snapshot porque no
--  hay forma de decir "este concepto vale un monto fijo, no una fórmula".
--
--  modo_valor es una dimensión nueva, distinta de modo_calculo (que sigue
--  respondiendo "¿directo o distribución?" — cómo se reparte el monto ya
--  resuelto entre inmuebles, algo ortogonal a de dónde sale ese monto).
-- ═══════════════════════════════════════════════════════════════════════

create type public.concepto_modo_valor_t as enum ('fijo', 'formulado');

comment on type public.concepto_modo_valor_t is
  'fijo: valor_fijo es el monto directo, sin fórmula. formulado: formula_ael se evalúa (comportamiento actual, único que existía antes de esta fase).';

alter table public.conceptos
  add column modo_valor public.concepto_modo_valor_t not null default 'formulado',
  add column valor_fijo numeric(18, 2);

alter table public.conceptos alter column modo_valor drop default;

alter table public.conceptos
  add constraint conceptos_modo_valor_consistente check (
    (modo_valor = 'fijo' and valor_fijo is not null and formula_ael is null)
    or (modo_valor = 'formulado' and valor_fijo is null)
  );

-- ── guard_concepto_transicion(): modo_valor/valor_fijo se suman al
--    contenido protegido — si no, quedarían editables fuera de borrador. ──
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

-- ── concepto_versiones: mismo par de columnas, o el historial deja de
--    capturar cambios de modo_valor/valor_fijo silenciosamente. ──────────
alter table public.concepto_versiones
  add column modo_valor public.concepto_modo_valor_t not null default 'formulado',
  add column valor_fijo numeric(18, 2);

alter table public.concepto_versiones alter column modo_valor drop default;
