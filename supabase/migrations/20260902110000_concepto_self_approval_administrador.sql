-- ═══════════════════════════════════════════════════════════════════════
--  guard_concepto_transicion() — excepción de auto-aprobación para el rol
--  Administrador (decisión del usuario, 2026-08-27).
--
--  Desde 20260818100100, SELF_APPROVAL bloqueaba a CUALQUIER usuario que
--  intentara aprobar su propia solicitud en_revision→activo (maker-checker,
--  Doc 10 §62/§65/§216). En la práctica, en una copropiedad pequeña el
--  Administrador puede ser la única persona con permiso para operar
--  conceptos — sin excepción, sus borradores quedaban atascados en
--  en_revision sin nadie más que los apruebe.
--
--  Excepción, y SOLO para ese rol: si quien aprueba tiene rol
--  'administrador' en el tenant del concepto (has_role(), 20260830100000),
--  puede aprobar su propia solicitud. Auxiliar y Auditor siguen sujetos a
--  SELF_APPROVAL sin cambios — el maker-checker real sigue existiendo entre
--  ellos y sigue existiendo entre un Administrador y cualquier otro rol.
-- ═══════════════════════════════════════════════════════════════════════

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
    or new.alcance is distinct from old.alcance
    or new.alcance_condiciones is distinct from old.alcance_condiciones
  );

  if v_contenido_cambio and old.estado <> 'borrador' then
    raise exception 'CONCEPTO_INMUTABLE: % está en estado % — solo se puede editar el contenido en borrador (Doc 10 §27)',
      old.id, old.estado;
  end if;

  if new.estado = old.estado then
    return new;
  end if;

  if old.tipo_recurrencia = 'novedad' and new.estado = 'archivado' then
    raise exception 'CONCEPTO_NOVEDAD_PROTEGIDO: % es el concepto singleton tipo_recurrencia=''novedad'' — '
      'no se puede archivar, lo exige NovedadesEditor para novedades permanentes o prorrateables. '
      'Para reemplazarlo primero crea y aprueba un concepto nuevo con tipo_recurrencia=''novedad''.',
      old.id;
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
    if auth.uid() is not null
      and old.enviado_a_revision_por = auth.uid()
      and not public.has_role(old.tenant_id, array['administrador']::public.tenant_role_t[])
    then
      raise exception 'SELF_APPROVAL: no puedes aprobar tu propia solicitud de revisión (concepto %)',
        old.id;
    end if;
    new.aprobado_por := auth.uid();
    new.aprobado_at := now();
  end if;

  return new;
end;
$$;
