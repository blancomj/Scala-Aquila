-- ═══════════════════════════════════════════════════════════════════════
--  GOB-5 · fix: el chequeo de rol debe saltarse para service_role
--
--  gobierno_crear_decision/gobierno_revocar_decision comprobaban has_role()
--  incondicionalmente — bajo el cliente admin (service_role) auth.uid() es
--  null, así que has_role() siempre da false y el guard dispararía incluso
--  para llamadas administrativas legítimas (tests, scripts, RPCs desde
--  Edge Functions con service_role). Mismo patrón ya establecido en
--  gobierno_generar_acta/fn_gobierno_suscribir_acta (GOB-4, 20260931570000,
--  líneas 154/284/323): `if (select auth.uid()) is not null and not
--  has_role(...)`, que solo exige el rol cuando hay un usuario autenticado
--  real detrás de la llamada.
-- ═══════════════════════════════════════════════════════════════════════

create or replace function public.gobierno_crear_decision(
  p_votacion_id uuid,
  p_titulo text,
  p_descripcion text default null,
  p_fundamento text default null,
  p_fecha_limite date default null,
  p_prioridad text default null
)
returns public.gobierno_decisiones
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_votacion public.gobierno_votaciones;
  v_reunion  public.gobierno_reuniones;
  v_acta_id  uuid;
  v_numero   integer;
  v_anio     smallint;
  v_decision public.gobierno_decisiones;
begin
  select * into v_votacion from public.gobierno_votaciones where id = p_votacion_id;
  if not found then
    raise exception 'DECISION_SIN_VOTACION_APROBADA: la votación % no existe', p_votacion_id;
  end if;

  if (select auth.uid()) is not null
     and not public.has_role(v_votacion.tenant_id, array['auxiliar']::public.tenant_role_t[])
  then
    raise exception 'DECISION_TRANSICION_REQUIERE_AUXILIAR: crear una decisión exige rol auxiliar';
  end if;

  if v_votacion.estado <> 'cerrada' or v_votacion.resultado <> 'aprobada' then
    raise exception 'DECISION_SIN_VOTACION_APROBADA: la votación % no está cerrada y aprobada '
      '(estado=%, resultado=%)', p_votacion_id, v_votacion.estado, v_votacion.resultado;
  end if;

  select * into v_reunion from public.gobierno_reuniones where id = v_votacion.reunion_id;

  select id into v_acta_id from public.gobierno_actas where reunion_id = v_reunion.id;

  v_anio := extract(year from v_reunion.fecha_hora)::smallint;
  v_numero := public.fn_gobierno_siguiente_numero_decision(v_votacion.tenant_id, v_anio);

  insert into public.gobierno_decisiones (
    tenant_id, numero, anio, reunion_id, agenda_punto_id, votacion_id, acta_id, materia_id,
    titulo, descripcion, fundamento, organo_id, fecha_limite, prioridad
  ) values (
    v_votacion.tenant_id, v_numero, v_anio, v_reunion.id, v_votacion.agenda_punto_id, v_votacion.id,
    v_acta_id, v_votacion.materia_id, p_titulo, p_descripcion, p_fundamento, v_reunion.organo_id,
    p_fecha_limite, p_prioridad
  )
  returning * into v_decision;

  return v_decision;
end;
$$;

create or replace function public.gobierno_revocar_decision(
  p_decision_id uuid,
  p_votacion_revocatoria_id uuid,
  p_titulo text,
  p_descripcion text default null,
  p_fundamento text default null
)
returns public.gobierno_decisiones
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_original public.gobierno_decisiones;
  v_nueva    public.gobierno_decisiones;
begin
  select * into v_original from public.gobierno_decisiones where id = p_decision_id;
  if not found then
    raise exception 'DECISION_REVOCACION_INVALIDA: la decisión % no existe', p_decision_id;
  end if;

  if (select auth.uid()) is not null
     and not public.has_role(v_original.tenant_id, array['administrador']::public.tenant_role_t[])
  then
    raise exception 'DECISION_TRANSICION_REQUIERE_ADMINISTRADOR: revocar una decisión exige rol '
      'administrador';
  end if;

  if v_original.estado <> 'vigente' then
    raise exception 'DECISION_REVOCACION_INVALIDA: la decisión % no está vigente (estado=%), no '
      'se puede revocar', p_decision_id, v_original.estado;
  end if;

  v_nueva := public.gobierno_crear_decision(
    p_votacion_revocatoria_id, p_titulo, p_descripcion, p_fundamento
  );

  update public.gobierno_decisiones
  set revoca_decision_id = v_original.id
  where id = v_nueva.id
  returning * into v_nueva;

  update public.gobierno_decisiones
  set estado = 'revocada'
  where id = v_original.id;

  return v_nueva;
end;
$$;
