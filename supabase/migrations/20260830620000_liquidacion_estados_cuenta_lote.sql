-- ═══════════════════════════════════════════════════════════════════════
--  L5 · Estados de cuenta por lote
--  Propietario: plan "Liquidación en dos tiempos" (2026-08-24), §6/L5
--
--  ═══ EL PROBLEMA ═══
--
--  Hoy el estado de cuenta se genera de a uno, desde la ficha del inmueble
--  (cuentaCorriente.ts::generarEstadoCuenta). Para una copropiedad de 66
--  unidades eso son 66 clics después de cada liquidación; en la práctica,
--  no se hace. Y el estado de cuenta es justamente el documento que el
--  residente recibe y por el que paga.
--
--  ═══ MISMO FORMATO, OTRA VÍA ═══
--
--  El JSONB que produce esta función es idéntico al del TypeScript: mismos
--  campos, mismo orden de eventos, mismo cálculo de saldo corriente. Eso no
--  es casualidad — la página pública /comprobante-cuenta/[id] ya lo lee así,
--  y cambiar el formato obligaría a tocarla y a romper los estados ya
--  emitidos. Se replica la forma existente en vez de inventar otra.
--
--  El orden de eventos también se replica con exactitud, incluida su
--  peculiaridad: el TypeScript compara las fechas como TEXTO, y un pago
--  ("2026-08-25") ordena antes que un cargo del mismo día
--  ("2026-08-25T04:00:00Z") porque la cadena corta es prefijo de la larga.
--  Se mantiene ese criterio para que un estado regenerado no reordene
--  movimientos respecto de uno emitido antes.
--
--  ═══ POR QUÉ DENTRO DE LA TRANSACCIÓN ═══
--
--  Un periodo cerrado sin sus estados de cuenta es un cierre a medias: los
--  cargos existen pero nadie los recibió. Va dentro de
--  fn_aplicar_liquidacion, como el resto.
--
--  Queda anotado el riesgo que el propio plan preveía (§8): si con un tenant
--  grande el lote alarga demasiado la transacción —y con ella el lock del
--  periodo—, este paso sale de la transacción y pasa a ser un trabajo
--  posterior reintentable. La función ya es idempotente por periodo
--  (reemplaza los emitidos de esa liquidación), así que ese movimiento no
--  exigiría rediseñarla.
-- ═══════════════════════════════════════════════════════════════════════


-- ═══════════════════════════════════════════════════════════════════════
--  1. De qué liquidación viene cada estado de cuenta
-- ═══════════════════════════════════════════════════════════════════════
-- Sin esto no se podría responder "¿qué se le envió a esta unidad en el
-- corte de septiembre?" ni distinguir un estado emitido por el cierre de
-- uno que alguien generó a mano desde la ficha.

alter table public.estados_cuenta_generados
  add column liquidacion_id uuid references public.liquidaciones (id),
  add column periodo_id     uuid references public.periodos (id);

create index estados_cuenta_generados_liquidacion_idx
  on public.estados_cuenta_generados (liquidacion_id)
  where liquidacion_id is not null;

comment on column public.estados_cuenta_generados.liquidacion_id is
  'Liquidación que lo emitió (L5). Null en los generados a mano desde la ficha del inmueble, que '
  'siguen siendo válidos — un estado de cuenta puede pedirse en cualquier momento, no solo al '
  'cerrar el periodo.';

comment on column public.estados_cuenta_generados.periodo_id is
  'Periodo del corte. Null en los generados a mano: esos son "a hoy", no a un corte concreto.';


-- ═══════════════════════════════════════════════════════════════════════
--  2. La emisión
-- ═══════════════════════════════════════════════════════════════════════
-- Un INSERT ... SELECT sobre todo el tenant: el saldo corriente sale de una
-- ventana ordenada, no de un bucle por inmueble.
--
-- Se emite para TODAS las unidades activas, incluso las que no tuvieron
-- movimiento este periodo: su estado de cuenta muestra el saldo que arrastran,
-- y una unidad al día también tiene derecho a recibir el suyo diciendo que
-- no debe nada.

create function public.fn_emitir_estados_cuenta(p_liquidacion_id uuid)
returns int
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_liq       public.liquidaciones%rowtype;
  v_tenant    public.tenants%rowtype;
  v_emitidos  int;
begin
  select * into v_liq from public.liquidaciones where id = p_liquidacion_id;
  if v_liq.id is null then
    raise exception 'LIQUIDACION_NO_ENCONTRADA: no existe la liquidación %', p_liquidacion_id;
  end if;

  select * into v_tenant from public.tenants where id = v_liq.tenant_id;

  -- Idempotencia: reemitir sustituye lo anterior de ESTA liquidación en vez
  -- de acumular duplicados. Los estados generados a mano (liquidacion_id
  -- null) no se tocan.
  delete from public.estados_cuenta_generados
   where liquidacion_id = p_liquidacion_id;

  with eventos as (
    -- Cargos. La descripción replica CATEGORIA_ESTADO_CUENTA_LABEL del
    -- TypeScript para que un estado emitido por lote se lea igual que uno
    -- generado desde la ficha.
    select c.inmueble_id,
           to_char(c.created_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') as fecha,
           case c.categoria
             when 'capital' then 'Capital'
             when 'interes' then 'Interés'
             else 'Otro'
           end as descripcion,
           c.monto_original as monto,
           true as es_cargo
    from public.cargos c
    where c.tenant_id = v_liq.tenant_id

    union all

    select p.inmueble_id,
           p.fecha_pago::text as fecha,
           case when p.referencia is not null and btrim(p.referencia) <> ''
                then 'Pago — ' || p.referencia
                else 'Pago' end as descripcion,
           p.monto,
           false
    from public.pagos p
    where p.tenant_id = v_liq.tenant_id
  ),
  -- El saldo corriente, con la misma regla de orden que el TypeScript:
  -- comparación de la fecha COMO TEXTO. `es_cargo` desempata para que dos
  -- eventos con la misma marca de tiempo salgan siempre en el mismo orden.
  con_saldo as (
    select e.*,
           sum(case when e.es_cargo then e.monto else -e.monto end)
             over (partition by e.inmueble_id order by e.fecha, e.es_cargo desc, e.descripcion
                   rows between unbounded preceding and current row) as saldo
    from eventos e
  ),
  por_inmueble as (
    select i.id as inmueble_id,
           i.codigo,
           coalesce(
             jsonb_agg(jsonb_build_object(
               'fecha',       cs.fecha,
               'descripcion', cs.descripcion,
               'cargo',       case when cs.es_cargo then cs.monto else null end,
               'abono',       case when cs.es_cargo then null else cs.monto end,
               'saldo',       cs.saldo
             ) order by cs.fecha, cs.es_cargo desc, cs.descripcion)
             filter (where cs.inmueble_id is not null),
             '[]'::jsonb
           ) as movimientos,
           coalesce(max(cs.saldo) filter (
             where cs.fecha = (select max(cs2.fecha) from con_saldo cs2
                               where cs2.inmueble_id = i.id)
           ), 0) as saldo_final
    from public.inmuebles i
    left join con_saldo cs on cs.inmueble_id = i.id
    where i.tenant_id = v_liq.tenant_id and i.estado = 'activo'
    group by i.id, i.codigo
  )
  insert into public.estados_cuenta_generados (
    tenant_id, inmueble_id, liquidacion_id, periodo_id, generado_por, datos
  )
  select v_liq.tenant_id, pi.inmueble_id, p_liquidacion_id, v_liq.periodo_id,
         (select auth.uid()),
         jsonb_build_object(
           -- La columna es `name` (esquema en inglés de la Fase I); la CLAVE del
           -- JSON sí va en español porque así la lee /comprobante-cuenta/[id].
           'tenant_nombre',   v_tenant.name,
           'tenant_nit',      v_tenant.nit,
           'inmueble_codigo', pi.codigo,
           'movimientos',     pi.movimientos,
           'saldo_final',     pi.saldo_final,
           'generado_en',     to_char(now() at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"')
         )
  from por_inmueble pi;

  get diagnostics v_emitidos = row_count;
  return v_emitidos;
end;
$$;

comment on function public.fn_emitir_estados_cuenta(uuid) is
  'Emite el estado de cuenta de todas las unidades activas del tenant en un INSERT ... SELECT '
  '(L5). El JSONB replica exactamente el formato de cuentaCorriente.ts::generarEstadoCuenta — '
  'incluido su orden de eventos por fecha COMO TEXTO — para que la página pública '
  '/comprobante-cuenta/[id] lo lea sin cambios y un estado regenerado no reordene movimientos. '
  'Idempotente: reemitir reemplaza los de esa misma liquidación, y nunca toca los generados a mano.';


-- ═══════════════════════════════════════════════════════════════════════
--  3. Dentro de la transacción de aplicar
-- ═══════════════════════════════════════════════════════════════════════
-- Último paso, después de cerrar el periodo: el estado de cuenta debe
-- reflejar los cargos recién creados, así que tiene que emitirse cuando el
-- ledger ya está completo.

create or replace function public.fn_aplicar_liquidacion(
  p_liquidacion_id uuid,
  p_snapshot_hash  text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_liq             public.liquidaciones%rowtype;
  v_periodo         public.periodos%rowtype;
  v_sello_actual    text;
  v_bloqueos        text;
  v_avisos          jsonb;
  v_cargos_liq      int;
  v_cargos_novedad  int;
  v_modo            public.presupuesto_reconocimiento_ingreso_t;
  v_estados         int;
begin
  select * into v_liq from public.liquidaciones where id = p_liquidacion_id;
  if v_liq.id is null then
    raise exception 'LIQUIDACION_NO_ENCONTRADA: no existe la liquidación %', p_liquidacion_id;
  end if;

  if v_liq.estado <> 'pendiente_aprobacion' then
    raise exception 'LIQUIDACION_NO_PENDIENTE: la liquidación % está en estado "%" — solo se '
      'aplica una que esté pendiente de aprobación', p_liquidacion_id, v_liq.estado;
  end if;

  select * into v_periodo from public.periodos
   where id = v_liq.periodo_id
   for update;

  if v_liq.sello_datos is not null then
    v_sello_actual := public.fn_liquidacion_sello_datos(v_liq.tenant_id, v_liq.periodo_id);
    if v_sello_actual is distinct from v_liq.sello_datos then
      raise exception 'LIQUIDACION_DATOS_CAMBIARON: los datos cambiaron desde que se calculó '
        'esta Pre-Liquidación (coeficientes, conceptos, novedades, presupuesto o política). '
        'Aplicarla ahora produciría números distintos a los revisados — vuelve a simular.';
    end if;
  end if;

  if p_snapshot_hash is not null
     and v_liq.snapshot_hash is not null
     and p_snapshot_hash is distinct from v_liq.snapshot_hash then
    raise exception 'LIQUIDACION_SNAPSHOT_DESACTUALIZADO: el snapshot actual (%) no coincide con '
      'el que se calculó (%) — vuelve a simular.', p_snapshot_hash, v_liq.snapshot_hash;
  end if;

  select string_agg(format('%s (%s)', titulo, codigo), '; ' order by codigo)
    into v_bloqueos
  from public.fn_liquidacion_prevuelo(v_liq.tenant_id, v_liq.periodo_id, v_liq.id)
  where severidad = 'bloqueo';

  if v_bloqueos is not null then
    raise exception 'LIQUIDACION_PREVUELO_BLOQUEADO: no se puede aplicar — %', v_bloqueos;
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
           'codigo', codigo, 'titulo', titulo, 'detalle', detalle
         ) order by codigo), '[]'::jsonb)
    into v_avisos
  from public.fn_liquidacion_prevuelo(v_liq.tenant_id, v_liq.periodo_id, v_liq.id)
  where severidad = 'aviso';

  update public.liquidaciones
     set estado = 'aplicada',
         avisos_aceptados = v_avisos
   where id = p_liquidacion_id;

  insert into public.cargos (
    tenant_id, inmueble_id, periodo_id, categoria, origen_tipo,
    liquidacion_linea_id, concepto_id, monto_original
  )
  select ll.tenant_id, ll.inmueble_id, v_liq.periodo_id, 'capital', 'liquidacion_linea',
         ll.id, ll.concepto_id, ll.monto
  from public.liquidacion_lineas ll
  where ll.liquidacion_id = p_liquidacion_id
    and ll.monto <> 0;
  get diagnostics v_cargos_liq = row_count;

  v_cargos_novedad := public.fn_generar_cargos_novedades_periodo(v_liq.tenant_id, v_liq.periodo_id);

  select pf.reconocimiento_ingreso into v_modo
  from public.politicas_financieras pf
  where pf.tenant_id = v_liq.tenant_id and pf.estado = 'vigente';
  v_modo := coalesce(v_modo, 'causacion');

  update public.periodos set estado = 'en_liquidacion' where id = v_liq.periodo_id;
  update public.periodos
     set estado = 'cerrado', cerrado_at = now(), cerrado_por = (select auth.uid())
   where id = v_liq.periodo_id;

  -- L5, al final: los estados de cuenta deben reflejar los cargos que se
  -- acaban de crear, así que se emiten con el ledger ya completo.
  v_estados := public.fn_emitir_estados_cuenta(p_liquidacion_id);

  return jsonb_build_object(
    'liquidacion_id',    p_liquidacion_id,
    'periodo_id',        v_liq.periodo_id,
    'tenant_total',      v_liq.tenant_total,
    'cargos_creados',    v_cargos_liq,
    'cargos_novedades',  v_cargos_novedad,
    'reconocimiento',    v_modo,
    'estados_emitidos',  v_estados,
    'avisos',            v_avisos
  );
end;
$$;

comment on function public.fn_aplicar_liquidacion(uuid, text) is
  'Aplica una liquidación pendiente de aprobación: cargos, cargos de novedades, cierre del periodo '
  'y emisión de los estados de cuenta — todo en una transacción, o pasa entero o no pasa nada. No '
  'escribe en presupuesto_ejecucion: el ejecutado se DERIVA de los cargos (causación) o de las '
  'aplicaciones de pago (caja) en presupuesto_cuenta_ejecucion(), así que insertar filas aquí '
  'duplicaría el ingreso — es justo lo que impide guard_presupuesto_ejecucion_cuenta.';
