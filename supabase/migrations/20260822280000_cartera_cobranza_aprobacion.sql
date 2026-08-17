-- ═══════════════════════════════════════════════════════════════════════
--  CAR F4 · Aprobación de acciones de cobranza (CAR §9.4/§21.3)
--  Propietario: Docs/Motor de gestion de cartera/CAR_00_Guia_Oficial.md
--
--  Mismo patrón que el maker-checker de conceptos
--  (20260818100100_concepto_maker_checker.sql): sin Edge Function.
--  Aprobar/rechazar una acción de cobranza no tiene ningún efecto
--  colateral más allá del propio UPDATE (el envío real es el worker de
--  ejecución, bloqueado por GAP-CAR-005) — todo el flujo vive en RLS
--  (sin cambios: acciones_cobranza_update_agent ya cubre esto) + este
--  trigger, que decide quién puede completar cada transición.
--
--  A diferencia de conceptos (cualquier agent puede aprobar, solo se
--  bloquea auto-aprobación), aquí además se exige rol 'administrador'
--  explícito para pendiente_aprobacion→aprobada/rechazada — un agent
--  simple puede proponer (INSERT) pero no aprobar (CAR §9.4: "el
--  sistema nunca demanda a alguien automáticamente", Art. 48 exige
--  firmante identificado). has_role(tenant, ['administrador']) NO lo
--  satisface un agent simple (a diferencia de has_role(tenant,
--  ['agent']), que administrador sí hereda — 20260822260000).
-- ═══════════════════════════════════════════════════════════════════════

alter table public.acciones_cobranza
  add column propuesta_por uuid references public.profiles (id);

comment on column public.acciones_cobranza.propuesta_por is
  'Quién creó la acción cuando creada_por=''manual'' — asignado por '
  'guard_accion_cobranza_propuesta() desde auth.uid(), nunca confiado del cliente. '
  'null para creada_por=''job'' (no hay una persona que proponer, y auth.uid() es '
  'null cuando el job corre como service_role).';

comment on column public.acciones_cobranza.aprobada_por is
  'Quién decidió la transición pendiente_aprobacion→aprobada|rechazada — el nombre '
  'de la columna es histórico (CAR §10.2 sketch original), se usa para ambos '
  'desenlaces. El resultado real está en estado.';

-- ── quién propuso + estado inicial válido (solo en creación) ───────────
-- Sin este chequeo, un INSERT directo podría nacer ya en 'aprobada' y
-- saltarse por completo la aprobación — el trigger de transición de abajo
-- solo vigila UPDATE, nunca ve el INSERT.
create function public.guard_accion_cobranza_propuesta()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.estado not in ('programada', 'pendiente_aprobacion') then
    raise exception 'ACCION_COBRANZA_ESTADO_INICIAL_INVALIDO: una acción de cobranza solo puede '
      'crearse en programada o pendiente_aprobacion, no %', new.estado;
  end if;
  new.propuesta_por := (select auth.uid());
  return new;
end;
$$;

create trigger guard_accion_cobranza_propuesta
  before insert on public.acciones_cobranza
  for each row execute function public.guard_accion_cobranza_propuesta();

-- ── propuesta_por se suma a las columnas congeladas (REC-CAR-012) ──────
-- CREATE OR REPLACE sobre la función de 20260822270000: mismo criterio que
-- has_role()/guard_last_agent() en 20260822260000 — se amplía la función
-- existente en vez de editar una migración ya aplicada.
create or replace function public.guard_accion_cobranza_contexto_inmutable()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.clasificacion_codigo is distinct from old.clasificacion_codigo
     or new.politica_clasificacion_id is distinct from old.politica_clasificacion_id
     or new.politica_version is distinct from old.politica_version
     or new.dias_mora_al_momento is distinct from old.dias_mora_al_momento
     or new.deuda_total_al_momento is distinct from old.deuda_total_al_momento
     or new.tenant_id is distinct from old.tenant_id
     or new.inmueble_id is distinct from old.inmueble_id
     or new.tipo_accion is distinct from old.tipo_accion
     or new.fecha_programada is distinct from old.fecha_programada
     or new.alcance is distinct from old.alcance
     or new.cargo_id is distinct from old.cargo_id
     or new.destinatario_tercero_id is distinct from old.destinatario_tercero_id
     or new.destinatario_rol_codigo is distinct from old.destinatario_rol_codigo
     or new.creada_por is distinct from old.creada_por
     or new.propuesta_por is distinct from old.propuesta_por
  then
    raise exception 'ACCION_COBRANZA_CONTEXTO_INMUTABLE: la acción % no admite modificar su '
      'contexto congelado — solo estado/resultado/ejecución (CAR §10.3 REC-CAR-012)', old.id;
  end if;
  return new;
end;
$$;

-- ── transiciones de estado + aprobación ─────────────────────────────────
create function public.guard_accion_cobranza_transicion()
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
    (old.estado = 'programada' and new.estado in ('ejecutando', 'cancelada'))
    or (old.estado = 'pendiente_aprobacion' and new.estado in ('aprobada', 'rechazada', 'cancelada'))
    or (old.estado = 'aprobada' and new.estado in ('ejecutando', 'cancelada'))
    or (old.estado = 'ejecutando' and new.estado in ('ejecutada', 'fallida'))
  ) then
    raise exception 'ACCION_COBRANZA_TRANSICION_INVALIDA: la acción % no puede pasar de % a %',
      old.id, old.estado, new.estado;
  end if;

  if old.estado = 'pendiente_aprobacion' and new.estado in ('aprobada', 'rechazada') then
    -- auth.uid() null = service_role/fixture — cambio fuera de banda, mismo
    -- criterio que guard_privileged_columns/guard_self_modify. Con un actor
    -- real, se exige administrador explícito (no basta 'agent').
    if (select auth.uid()) is not null then
      if not public.has_role(new.tenant_id, array['administrador']::public.tenant_role_t[]) then
        raise exception 'ACCION_COBRANZA_REQUIERE_ADMINISTRADOR: aprobar o rechazar la acción % '
          'requiere rol administrador (CAR §9.4/§21.3)', old.id;
      end if;
      if old.propuesta_por is not null and old.propuesta_por = (select auth.uid()) then
        raise exception 'ACCION_COBRANZA_AUTOAPROBACION: no puedes aprobar ni rechazar una acción '
          'de cobranza que tú mismo propusiste (%)', old.id;
      end if;
    end if;
    new.aprobada_por := (select auth.uid());
    new.aprobada_at := now();
  end if;

  return new;
end;
$$;

create trigger guard_accion_cobranza_transicion
  before update on public.acciones_cobranza
  for each row execute function public.guard_accion_cobranza_transicion();
