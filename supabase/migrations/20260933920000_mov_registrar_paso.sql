-- ═══════════════════════════════════════════════════════════════════════
--  MOV-1 (3/3) · Registrar el paso, y saber qué hay dentro
--
--  EL CUPO AVISA, NO IMPIDE. Es la decisión central del corte y va contra
--  la lectura fácil de "control de capacidad".
--
--  Si el parqueadero de visitantes está lleno y entra un carro igual —lo
--  autorizó el portero, el residente insistió, era una ambulancia—, el
--  hecho ocurrió. Una función que rechazara el registro dejaría al
--  vehículo dentro y fuera de la bitácora, que es el peor resultado
--  posible: se pierde precisamente el dato que después hará falta. El
--  registro nunca se niega; lo que devuelve es cuántos hay dentro y
--  cuántos caben, y quien esté en la portería decide.
--
--  Es el mismo criterio que ya rige la tabla: se anota también lo no
--  autorizado. Un sistema que solo sabe registrar lo correcto no sirve
--  para averiguar qué pasó.
--
--  LOS DOS CAMINOS DE ENTRADA, sin tocar MANT-11. El portero teclea una
--  placa, o llega una visita con su QR. En el segundo caso esta función
--  delega en `fn_autorizacion_visita_marcar_usada`, que ya es atómica
--  (`for update`) y ya valida vigencia y expiración: el consumo de un solo
--  uso sigue siendo suyo, aquí solo se le añade el paso del vehículo. Así
--  la visita en carro produce UN ingreso de persona (MANT-11) y UN paso de
--  vehículo (esto), apuntando ambos a la misma autorización.
--
--  QUÉ CUENTA COMO VISITANTE: que traiga autorización de visita, o que la
--  placa no esté en el inventario. Un residente con permiso vigente no
--  consume cupo de visitantes aunque parquee donde sea, porque ese no es
--  el conflicto que se quiere medir.
-- ═══════════════════════════════════════════════════════════════════════

create function public.fn_vehiculo_registrar_paso(
  p_tenant_id       uuid,
  p_sentido         public.vehiculo_sentido_t,
  p_placa           text default null,
  p_autorizacion_id uuid default null,
  p_observaciones   text default null
)
returns table (
  paso_id           uuid,
  placa             text,
  autorizado        boolean,
  es_visitante      boolean,
  visitantes_dentro integer,
  cupos_visitante   integer,
  aviso             text
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor        uuid := (select auth.uid());
  v_placa        text;
  v_vehiculo     uuid;
  v_autorizado   boolean := false;
  v_visitante    boolean;
  v_aut          public.mant_autorizaciones_visita;
  v_cupos        integer;
  v_dentro       integer;
  v_paso         public.vehiculo_paso;
  v_aviso        text;
begin
  if not public.is_member(p_tenant_id) then
    raise exception 'MOVILIDAD_NO_DISPONIBLE: no hay portería para esta copropiedad';
  end if;

  -- Sin matiz de "fuera de banda" aquí, a diferencia de los guards de la
  -- serie: `is_member` de arriba ya exige un actor real, así que a este
  -- punto no se llega nunca sin sesión. Registrar un paso es operación de
  -- portería, y para eso auxiliar basta.
  if not public.has_role(p_tenant_id, array['auxiliar']::public.tenant_role_t[]) then
    raise exception 'MOVILIDAD_REGISTRO_REQUIERE_AGENTE: registrar un paso exige rol de auxiliar o superior';
  end if;

  -- ── Camino del QR: la autorización manda sobre la placa tecleada ─────
  if p_autorizacion_id is not null then
    select * into v_aut
      from public.mant_autorizaciones_visita
     where id = p_autorizacion_id and tenant_id = p_tenant_id;

    if v_aut.id is null then
      raise exception 'AUTORIZACION_INEXISTENTE: % no existe en esta copropiedad', p_autorizacion_id;
    end if;

    -- Solo la ENTRADA consume el QR. La salida de esa misma visita se
    -- registra después contra una autorización ya 'usada', y debe poder
    -- hacerlo: negarla dejaría la bitácora con una entrada sin cierre.
    if p_sentido = 'entrada' then
      perform public.fn_autorizacion_visita_marcar_usada(p_autorizacion_id, v_actor, p_observaciones);
    end if;

    v_placa := coalesce(nullif(btrim(coalesce(p_placa, '')), ''), v_aut.vehiculo_placa);
    if v_placa is null then
      raise exception 'MOVILIDAD_PLACA_REQUERIDA: la autorización % no trae placa y no se tecleó ninguna',
        p_autorizacion_id;
    end if;
  else
    v_placa := nullif(btrim(coalesce(p_placa, '')), '');
    if v_placa is null then
      raise exception 'MOVILIDAD_PLACA_REQUERIDA: hay que indicar una placa o una autorización';
    end if;
  end if;

  -- ── ¿Está en el inventario, y estaba autorizado? ─────────────────────
  select v.id into v_vehiculo
    from public.vehiculos v
   where v.tenant_id = p_tenant_id
     and v.placa_normalizada = public.fn_normalizar_placa(v_placa)
     and v.estado <> 'retirado';

  if v_vehiculo is not null then
    -- Mismo criterio que fn_vehiculo_por_placa (EXS-5); aquí el resultado
    -- se congela en la fila porque es una foto del momento.
    select exists (
      select 1 from public.vehiculo_permiso p
       where p.vehiculo_id = v_vehiculo
         and p.estado = 'vigente'
         and p.vigente_desde <= current_date
         and (p.vigente_hasta is null or p.vigente_hasta >= current_date)
    ) into v_autorizado;
  end if;

  -- Una visita con autorización vigente está autorizada aunque su carro no
  -- esté en el inventario: para eso existe la autorización.
  if p_autorizacion_id is not null then
    v_autorizado := true;
  end if;

  v_visitante := p_autorizacion_id is not null or v_vehiculo is null;

  -- ── Capacidad: se mide y se informa, nunca se niega ──────────────────
  select mc.cupos_visitante into v_cupos
    from public.movilidad_config mc where mc.tenant_id = p_tenant_id;

  insert into public.vehiculo_paso (
    tenant_id, placa, vehiculo_id, autorizacion_visita_id, sentido,
    autorizado, es_visitante, registrado_por, observaciones
  ) values (
    p_tenant_id, v_placa, v_vehiculo, p_autorizacion_id, p_sentido,
    v_autorizado, v_visitante, v_actor, p_observaciones
  )
  returning * into v_paso;

  select count(*)::integer into v_dentro
    from public.fn_movilidad_dentro(p_tenant_id) d
   where d.es_visitante;

  if v_cupos is not null and p_sentido = 'entrada' and v_visitante then
    if v_dentro > v_cupos then
      v_aviso := 'Parqueadero de visitantes excedido: ' || v_dentro::text || ' dentro y '
                 || v_cupos::text || case when v_cupos = 1 then ' cupo.' else ' cupos.' end;
    elsif v_dentro = v_cupos then
      v_aviso := 'Con este, el parqueadero de visitantes queda lleno (' || v_cupos::text || ').';
    end if;
  end if;

  if not v_autorizado then
    v_aviso := coalesce(v_aviso || ' ', '') || 'Vehículo sin permiso vigente: el paso quedó registrado igual.';
  end if;

  return query select v_paso.id, v_paso.placa, v_paso.autorizado, v_paso.es_visitante,
                      v_dentro, v_cupos, v_aviso;
end;
$$;

comment on function public.fn_vehiculo_registrar_paso(uuid, public.vehiculo_sentido_t, text, uuid, text) is
  'MOV-1 — registra un paso por la portería y devuelve el estado de capacidad. NUNCA rechaza el '
  'registro por cupos: si el carro entró, negarlo lo dejaría dentro y fuera de la bitácora, que '
  'es el peor resultado. Avisa y deja decidir. Con autorización de visita delega el consumo de un '
  'solo uso en fn_autorizacion_visita_marcar_usada (MANT-11), que sigue siendo la dueña de esa '
  'regla; solo la entrada consume, porque negar la salida dejaría una entrada sin cierre.';

revoke execute on function public.fn_vehiculo_registrar_paso(uuid, public.vehiculo_sentido_t, text, uuid, text) from public, anon;
grant execute on function public.fn_vehiculo_registrar_paso(uuid, public.vehiculo_sentido_t, text, uuid, text) to authenticated, service_role;

-- ── Qué hay dentro ahora ───────────────────────────────────────────────
--
--  DERIVADO, no una tabla de "vehículos dentro" que alguien tendría que
--  mantener sincronizada. El último paso de cada placa dice si está
--  dentro; si ese último paso es una entrada, está. Un registro perdido se
--  corrige registrando, no editando.

create function public.fn_movilidad_dentro(p_tenant_id uuid)
returns table (
  placa          text,
  vehiculo_id    uuid,
  es_visitante   boolean,
  autorizado     boolean,
  desde          timestamptz,
  horas_dentro   numeric,
  excedido       boolean
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_horas integer;
begin
  if not public.is_member(p_tenant_id) then
    raise exception 'MOVILIDAD_NO_DISPONIBLE: no hay portería para esta copropiedad';
  end if;

  select mc.horas_max_visitante into v_horas
    from public.movilidad_config mc where mc.tenant_id = p_tenant_id;

  return query
  with ultimo as (
    select distinct on (p.placa_normalizada) p.*
    from public.vehiculo_paso p
    where p.tenant_id = p_tenant_id
    order by p.placa_normalizada, p.momento desc, p.created_at desc
  )
  select
    u.placa,
    u.vehiculo_id,
    u.es_visitante,
    u.autorizado,
    u.momento,
    round(extract(epoch from (now() - u.momento)) / 3600.0, 1),
    -- Excedido solo tiene sentido para visitantes y con límite definido:
    -- un residente no "se pasa de tiempo" en su propia copropiedad.
    v_horas is not null
      and u.es_visitante
      and now() > u.momento + make_interval(hours => v_horas)
  from ultimo u
  where u.sentido = 'entrada';
end;
$$;

comment on function public.fn_movilidad_dentro is
  'MOV-1 — qué vehículos están dentro ahora, DERIVADO del último paso de cada placa. No hay tabla '
  'de ocupación que mantener sincronizada: un registro olvidado se corrige registrando, no '
  'editando. `excedido` solo aplica a visitantes y solo si la copropiedad definió horas máximas — '
  'un residente no se pasa de tiempo en su propia casa.';

revoke execute on function public.fn_movilidad_dentro(uuid) from public, anon;
grant execute on function public.fn_movilidad_dentro(uuid) to authenticated, service_role;
