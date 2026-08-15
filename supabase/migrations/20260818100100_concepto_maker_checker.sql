-- ═══════════════════════════════════════════════════════════════════════
--  AEL-004 Fase 4 — maker-checker para conceptos (Doc 10 §62/§65/§216,
--  §27 IMMUTABILITY)
--
--  A diferencia de novedades (aprobar inserta un cargo atómicamente, un
--  efecto colateral real que exige service_role), aprobar un concepto no
--  tiene ningún efecto colateral más allá del propio UPDATE — todo el
--  flujo vive en RLS + este único trigger, que lee auth.uid() en una
--  conexión de cliente normal (mismo criterio que guard_self_modify,
--  20260814150000) para decidir quién puede enviar/aprobar cada
--  transición. conceptos_update_agent (RLS) no cambia.
-- ═══════════════════════════════════════════════════════════════════════

alter table public.conceptos
  add column enviado_a_revision_por uuid references public.profiles (id),
  add column enviado_a_revision_at  timestamptz,
  add column aprobado_por           uuid references public.profiles (id),
  add column aprobado_at            timestamptz,
  add column rechazado_motivo       text;

comment on column public.conceptos.enviado_a_revision_por is
  'Asignado por guard_concepto_transicion() en borrador→en_revision, nunca confiado del cliente.';
comment on column public.conceptos.aprobado_por is
  'Asignado por guard_concepto_transicion() en en_revision→activo — siempre distinto de enviado_a_revision_por.';

create function public.guard_concepto_transicion()
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

  -- El resto del guard (transiciones, inmutabilidad) sigue aplicando aunque
  -- el actor sea service_role/admin (fixtures de test, auth.uid() nulo) —
  -- por eso este chequeo de identidad va aquí adentro y no como un
  -- `return new` temprano al inicio de la función.
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

create trigger guard_concepto_transicion
  before update on public.conceptos
  for each row execute function public.guard_concepto_transicion();
