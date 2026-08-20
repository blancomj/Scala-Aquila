-- ═══════════════════════════════════════════════════════════════════════
--  Elimina conceptos.tipo_base — nunca tuvo efecto en el motor
--
--  Diseñado en Doc 16 §20-25 como forma de resolver el valor de un
--  concepto (fijo/coeficiente/cantidad/porcentaje/saldo) antes de que
--  existiera la fórmula AEL. Auditoría exhaustiva del código (2026-08-19,
--  a pedido del usuario) confirmó que nunca se seleccionó hacia
--  SnapshotConcepto (snapshot-supabase.ts) ni se lee en ningún cálculo de
--  executor.ts — la única referencia real en todo el motor era un
--  comentario. La distinción que se pensaba resolver con tipo_base ya la
--  cubre modo_valor (fijo/formulado, conceptos avanzados Fase 1) con su
--  propio campo valor_fijo y su propia rama en el executor. tipo_base
--  quedó huérfano: solo ruido en el formulario, sin efecto de negocio.
-- ═══════════════════════════════════════════════════════════════════════

alter table public.conceptos drop column tipo_base;
alter table public.concepto_versiones drop column tipo_base;

drop type public.concepto_tipo_base_t;

-- ── guard_concepto_transicion(): ya no protege un campo que no existe ───
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
