-- ═══════════════════════════════════════════════════════════════════════
--  L2 · Crear una Pre-Liquidación
--  Propietario: plan "Liquidación en dos tiempos" (2026-08-24), §6/L2
--
--  El otro extremo de fn_aplicar_liquidacion: si aplicar es una sola
--  transacción, calcular también debe serlo. Hoy guardarLiquidacion()
--  (TypeScript) hace dos INSERT secuenciales — liquidaciones y luego
--  liquidacion_lineas — y entre uno y otro cabe un fallo que deja una
--  liquidación sin líneas: un resultado que dice "total 26 millones" con
--  cero detalle de dónde salen.
--
--  Aquí las dos escrituras, más el descarte de la corrida anterior y el
--  sellado del escenario, ocurren juntas o no ocurren.
--
--  ═══ QUÉ ENTRA Y QUÉ NO ═══
--
--  El CÁLCULO sigue en TypeScript, sin cambios: el grafo de dependencias,
--  la evaluación AEL, el reparto con mayor resto y las reconciliaciones
--  R1/R3/R4 son packages/liquidation-engine, y ahí se quedan (D-14, y
--  confirmado con el usuario al arrancar la implementación). Esta función
--  recibe el resultado ya calculado y se encarga de GUARDARLO bien.
--
--  ═══ POR QUÉ EL DESCARTE ES AUTOMÁTICO ═══
--
--  liquidaciones_viva_unica (L0) permite una sola liquidación viva por
--  periodo. Simular otra vez no debe fallar por ese índice: debe reemplazar
--  la anterior. Que el descarte viva aquí dentro —y no en el código que
--  llama— es lo que hace imposible el estado intermedio de "descarté la
--  vieja pero la nueva falló", que dejaría el periodo sin ninguna.
-- ═══════════════════════════════════════════════════════════════════════

create function public.fn_crear_preliquidacion(
  p_tenant_id     uuid,
  p_periodo_id    uuid,
  p_result_hash   text,
  p_tenant_total  numeric,
  -- [{inmueble_id, concepto_id, monto}] — el resultado del motor.
  p_lineas        jsonb,
  p_snapshot      jsonb default null,
  p_snapshot_hash text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_periodo    public.periodos%rowtype;
  v_liq_id     uuid;
  v_descartadas int;
  v_lineas     int;
  v_sello      text;
begin
  -- ── Quién puede simular ────────────────────────────────────────────
  -- Imprescindible y fácil de olvidar: SECURITY DEFINER bypassa RLS, así
  -- que sin esta comprobación cualquier usuario autenticado podría crear
  -- Pre-Liquidaciones en CUALQUIER tenant. fn_aplicar_liquidacion no la
  -- necesita porque su guard de transición ya exige has_role(administrador)
  -- —que implica membresía—, pero aquí el INSERT no dispara ningún guard de
  -- rol. auth.uid() null = service_role (Edge Function de sistema, fixture).
  if (select auth.uid()) is not null
     and not public.has_role(p_tenant_id, array['auxiliar']::public.tenant_role_t[]) then
    raise exception 'FORBIDDEN: no tienes permiso para simular liquidaciones en esta copropiedad';
  end if;

  -- El mismo lock que toma fn_aplicar_liquidacion: dos simulaciones
  -- simultáneas del mismo periodo se serializan en vez de pelearse por
  -- liquidaciones_viva_unica.
  select * into v_periodo from public.periodos
   where id = p_periodo_id and tenant_id = p_tenant_id
   for update;

  if v_periodo.id is null then
    raise exception 'PERIODO_NO_ENCONTRADO: el periodo % no existe o no pertenece al tenant %',
      p_periodo_id, p_tenant_id;
  end if;

  if v_periodo.estado <> 'abierto' then
    raise exception 'PERIODO_NO_ABIERTO: el periodo está en estado "%" — solo se simula sobre un '
      'periodo abierto', v_periodo.estado;
  end if;

  if exists (
    select 1 from public.liquidaciones
    where tenant_id = p_tenant_id and periodo_id = p_periodo_id and estado = 'aplicada'
  ) then
    raise exception 'PERIODO_YA_LIQUIDADO: el periodo % ya tiene una liquidación aplicada — '
      'para rehacerla hay que anularla primero', p_periodo_id;
  end if;

  if jsonb_typeof(p_lineas) <> 'array' then
    raise exception 'INVALID_PAYLOAD: p_lineas debe ser un arreglo JSON de líneas';
  end if;

  -- ── Fuera la corrida anterior ──────────────────────────────────────
  -- Su resultado ya no representa nada: los datos pueden haber cambiado y
  -- por eso se volvió a simular. Queda como historia en estado descartada,
  -- nunca se borra.
  update public.liquidaciones
     set estado = 'descartada'
   where tenant_id = p_tenant_id
     and periodo_id = p_periodo_id
     and estado in ('pre_liquidada', 'pendiente_aprobacion', 'rechazada');
  get diagnostics v_descartadas = row_count;

  -- ── El sello del escenario, ahora ──────────────────────────────────
  -- Dentro del lock: lo que se sella es exactamente lo que el motor acaba
  -- de leer. fn_aplicar_liquidacion lo recalculará y comparará.
  v_sello := public.fn_liquidacion_sello_datos(p_tenant_id, p_periodo_id);

  insert into public.liquidaciones (
    tenant_id, periodo_id, estado, result_hash, tenant_total,
    snapshot, snapshot_hash, sello_datos
  )
  values (
    p_tenant_id, p_periodo_id, 'pre_liquidada', p_result_hash, p_tenant_total,
    p_snapshot, p_snapshot_hash, v_sello
  )
  returning id into v_liq_id;

  -- ── Las líneas, en la misma transacción ────────────────────────────
  insert into public.liquidacion_lineas (tenant_id, liquidacion_id, inmueble_id, concepto_id, monto)
  select p_tenant_id, v_liq_id,
         (l->>'inmueble_id')::uuid, (l->>'concepto_id')::uuid, (l->>'monto')::numeric
  from jsonb_array_elements(p_lineas) l;
  get diagnostics v_lineas = row_count;

  return jsonb_build_object(
    'liquidacion_id',       v_liq_id,
    'periodo_id',           p_periodo_id,
    'lineas',               v_lineas,
    'tenant_total',         p_tenant_total,
    'sello_datos',          v_sello,
    'descarto_anteriores',  v_descartadas
  );
end;
$$;

-- ═══════════════════════════════════════════════════════════════════════
--  Mismo cierre para el sello
-- ═══════════════════════════════════════════════════════════════════════
-- fn_liquidacion_sello_datos (L3) también es SECURITY DEFINER y también
-- está expuesta a `authenticated`. Devuelve solo un md5, no datos — pero un
-- hash sobre datos ajenos sigue siendo un oráculo: permitiría a un extraño
-- detectar CUÁNDO cambia algo en otra copropiedad. Se cierra por el mismo
-- motivo y con el mismo criterio.
create or replace function public.fn_liquidacion_sello_datos(
  p_tenant_id  uuid,
  p_periodo_id uuid
)
returns text
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if (select auth.uid()) is not null and not public.is_member(p_tenant_id) then
    raise exception 'FORBIDDEN: no tienes acceso a esta copropiedad';
  end if;

  return (
    select md5(string_agg(parte, '|' order by orden, parte))
    from (
      select 1 as orden,
             format('periodo:%s:%s', p.id, coalesce(p.fecha_vencimiento::text, '-')) as parte
      from public.periodos p
      where p.id = p_periodo_id

      union all
      select 2, format('coef:%s:%s', c.inmueble_id, c.valor)
      from public.coeficientes c
      join public.coeficiente_sets s on s.id = c.set_id
      where s.tenant_id = p_tenant_id and s.estado = 'vigente'

      union all
      select 3, format('inm:%s', i.id)
      from public.inmuebles i
      where i.tenant_id = p_tenant_id and i.estado = 'activo'

      union all
      select 4, format('con:%s', to_jsonb(co)::text)
      from public.conceptos co
      where co.tenant_id = p_tenant_id and co.estado = 'activo'

      union all
      select 5, format('pre:%s:%s:%s', pr.id, pr.monto_total, pr.estado)
      from public.presupuestos pr
      join public.periodos p on p.id = p_periodo_id
      where pr.tenant_id = p_tenant_id and pr.anio = p.anio and pr.estado = 'vigente'

      union all
      select 6, format('nov:%s:%s:%s:%s:%s', n.id, n.inmueble_id, n.tipo, n.monto, n.estado)
      from public.novedades n
      join public.periodos p on p.id = p_periodo_id
      where n.tenant_id = p_tenant_id
        and n.estado = 'aprobada'
        and n.inhabilitada_at is null
        and n.fecha_efectiva <= (make_date(p.anio, p.mes, 1) + interval '1 month - 1 day')::date

      union all
      select 7, format('pol:%s', to_jsonb(pf)::text)
      from public.politicas_financieras pf
      where pf.tenant_id = p_tenant_id and pf.estado = 'vigente'
    ) partes
  );
end;
$$;

comment on function public.fn_crear_preliquidacion(uuid, uuid, text, numeric, jsonb, jsonb, text) is
  'Guarda el resultado del motor como Pre-Liquidación: descarta la corrida anterior del periodo, '
  'sella el escenario (fn_liquidacion_sello_datos) e inserta cabecera y líneas — todo en una '
  'transacción, para que no exista una liquidación sin sus líneas. El cálculo en sí sigue en '
  'packages/liquidation-engine (D-14); esta función solo persiste. SECURITY DEFINER porque '
  'liquidaciones/liquidacion_lineas no admiten INSERT vía RLS.';

grant execute on function public.fn_crear_preliquidacion(uuid, uuid, text, numeric, jsonb, jsonb, text)
  to authenticated;
