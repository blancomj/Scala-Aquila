-- ═══════════════════════════════════════════════════════════════════════
--  L4 · Reconocimiento del ingreso: causación o caja
--  Propietario: plan "Liquidación en dos tiempos" (2026-08-24), §6/L4 + D2
--
--  ═══ CORRECCIÓN DE RUMBO: LO QUE EL PLAN DABA POR FALTANTE YA EXISTÍA ═══
--
--  El plan afirmaba que "el presupuesto no se entera" de la liquidación y
--  proponía que fn_aplicar_liquidacion insertara filas en
--  presupuesto_ejecucion. Eso era un ERROR de diagnóstico, y el esquema lo
--  rechazó activamente al intentarlo (CUENTA_CONCEPTO_AUTOMATICO).
--
--  La realidad, verificada contra presupuesto_cuenta_ejecucion() vigente:
--  el rollup YA tiene una rama automática que suma cargos.monto_original
--  para toda cuenta con conceptos vinculados —vía conceptos.
--  presupuesto_cuenta_id— y su propio comentario lo describe como "lo
--  facturado (devengo), no lo efectivamente recaudado en caja".
--
--  O sea: el modo causación funciona desde el instante en que L3 crea los
--  cargos, sin una línea de código nueva. Y guard_presupuesto_ejecucion_
--  cuenta bloquea los movimientos manuales sobre esas cuentas justamente
--  para que nadie sume dos veces lo mismo — que es exactamente lo que la
--  primera versión de esta migración iba a hacer.
--
--  ═══ ENTONCES, ¿QUÉ FALTA DE VERDAD? ═══
--
--  Solo el modo CAJA. El rollup reconoce el ingreso cuando se factura; para
--  una copropiedad que lleva sus ingresos por caja debe reconocerlo cuando
--  entra el pago. Eso no se arregla insertando filas: se arregla eligiendo
--  QUÉ se suma en esa rama automática — cargos (devengo) o aplicaciones de
--  pago (caja).
--
--  Una rama condicional en el rollup, y nada más. No hay tabla nueva, no hay
--  trigger, no hay dato duplicado que pueda desincronizarse: el ejecutado
--  sigue siendo derivado, igual que contable_movimientos() (PC-5).
--
--  ═══ D2b — QUÉ ES LA CARTERA EN MODO CAJA ═══
--
--  Se aplica la recomendación del plan, que quedó sin respuesta explícita:
--  `cargos` y `v_cargo_saldo` se comportan EXACTAMENTE IGUAL en los dos
--  modos. Lo que una unidad debe no depende de cómo la copropiedad prefiera
--  reportar sus ingresos — si en caja la deuda no naciera hasta el pago, no
--  habría cartera, ni mora, ni cobranza. Eso no sería una preferencia
--  contable: sería romper el negocio.
--
--  El modo decide únicamente qué suma el "ejecutado" del presupuesto (y por
--  derivación lo que ve la contabilidad). Conviene que el contador lo
--  valide: bajo NIIF el devengo es el tratamiento correcto, y por eso es el
--  default.
-- ═══════════════════════════════════════════════════════════════════════


-- ═══════════════════════════════════════════════════════════════════════
--  1. El modo, en la política financiera
-- ═══════════════════════════════════════════════════════════════════════
-- Va en politicas_financieras y no en tenant_configuracion porque es una
-- decisión contable versionada: la política vigente es inmutable
-- (guard_politica_inmutable), así que cambiar de modo obliga a crear una
-- versión nueva y deja rastro de cuándo cambió el criterio. Para algo que
-- altera cómo se reportan los ingresos ante una asamblea, esa fricción es
-- la correcta.

create type public.presupuesto_reconocimiento_ingreso_t as enum ('causacion', 'caja');

comment on type public.presupuesto_reconocimiento_ingreso_t is
  'Cuándo reconoce el presupuesto el ingreso de la liquidación: causacion (al facturarse, '
  'sumando cargos) o caja (al cobrarse, sumando aplicaciones de pago). ENUM y no lista_tipos '
  '(D-24) porque no es vocabulario descriptivo: presupuesto_cuenta_ejecucion() ramifica sobre él '
  'para decidir qué tabla suma — mismo criterio que politica_imputacion_estrategia_t, que ya '
  'vive en esta misma tabla.';

alter table public.politicas_financieras
  add column reconocimiento_ingreso public.presupuesto_reconocimiento_ingreso_t
    not null default 'causacion';

comment on column public.politicas_financieras.reconocimiento_ingreso is
  'Modo de reconocimiento del ingreso (D2). Default causacion: es el devengo, coherente con NIIF '
  'y con lo que el rollup ya hacía antes de existir esta columna. NO afecta cargos ni saldos — '
  'la unidad debe lo mismo en ambos modos (D2b); solo cambia qué suma el ejecutado.';


-- ═══════════════════════════════════════════════════════════════════════
--  2. El rollup, ahora con los dos modos
-- ═══════════════════════════════════════════════════════════════════════
-- Único cambio real de L4. La rama "manual" (E9) y todo el acumulado
-- recursivo quedan idénticos; lo que cambia es la rama automática, que
-- ahora elige su fuente según la política vigente:
--
--   causacion → cargos.monto_original          (lo facturado)
--   caja      → pago_aplicaciones.monto        (lo cobrado)
--
-- En modo caja solo cuenta lo aplicado a cargos de CAPITAL originados en
-- una liquidación: un pago imputado a interés de mora o a una novedad no es
-- ingreso por cuotas y no debe inflar esa cuenta presupuestal. El periodo
-- que se le atribuye es el del cargo cubierto, no el de la fecha del pago —
-- así el ejecutado sigue alineado con el periodo que generó la obligación.

create or replace function public.presupuesto_cuenta_ejecucion(p_presupuesto_id uuid)
returns table(cuenta_id uuid, presupuestado numeric, ejecutado numeric)
language sql
stable
set search_path = ''
as $$
  with recursive modo as (
    -- Sin política vigente se asume el default del esquema, en vez de dejar
    -- el ejecutado en cero sin explicación.
    select coalesce(
      (select pf.reconocimiento_ingreso
       from public.politicas_financieras pf
       join public.presupuestos pp on pp.id = p_presupuesto_id
       where pf.tenant_id = pp.tenant_id and pf.estado = 'vigente'),
      'causacion'::public.presupuesto_reconocimiento_ingreso_t
    ) as reconocimiento
  ),
  movimientos as (
    -- manual (E9) — cuentas sin ningún concepto vinculado (el guard lo exige)
    select pe.cuenta_id, pe.monto
    from public.presupuesto_ejecucion pe
    join public.periodos pr on pr.id = pe.periodo_id
    join public.presupuestos pp on pp.id = p_presupuesto_id and pp.anio = pr.anio
    where pe.tenant_id = pp.tenant_id

    union all
    -- automático · CAUSACIÓN — lo facturado, sin importar si se cobró
    select co.presupuesto_cuenta_id as cuenta_id, cg.monto_original as monto
    from public.conceptos co
    join public.cargos cg on cg.concepto_id = co.id
    join public.periodos pr on pr.id = cg.periodo_id
    join public.presupuestos pp on pp.id = p_presupuesto_id and pp.anio = pr.anio
    cross join modo m
    where co.presupuesto_cuenta_id is not null
      and cg.tenant_id = pp.tenant_id
      and m.reconocimiento = 'causacion'

    union all
    -- automático · CAJA — lo cobrado, atribuido al periodo del cargo cubierto
    select co.presupuesto_cuenta_id as cuenta_id, pa.monto
    from public.pago_aplicaciones pa
    join public.cargos cg on cg.id = pa.cargo_id
    join public.conceptos co on co.id = cg.concepto_id
    join public.periodos pr on pr.id = cg.periodo_id
    join public.presupuestos pp on pp.id = p_presupuesto_id and pp.anio = pr.anio
    cross join modo m
    where co.presupuesto_cuenta_id is not null
      and pa.tenant_id = pp.tenant_id
      and cg.categoria = 'capital'
      and cg.origen_tipo = 'liquidacion_linea'
      and m.reconocimiento = 'caja'
  ),
  hoja as (
    select
      c.id,
      c.parent_id,
      coalesce(r.monto_anual, 0) as presupuestado_propio,
      coalesce(m.ejecutado_propio, 0) as ejecutado_propio
    from public.presupuestos p
    join public.presupuesto_cuenta c on c.tenant_id = p.tenant_id
    left join public.presupuesto_rubros r
      on r.cuenta_id = c.id and r.presupuesto_id = p_presupuesto_id
    left join (
      select mv.cuenta_id, sum(mv.monto) as ejecutado_propio
      from movimientos mv
      group by mv.cuenta_id
    ) m on m.cuenta_id = c.id
    where p.id = p_presupuesto_id
  ),
  acumulado as (
    select h.id as cuenta_id, h.id as ancestro_id, h.presupuestado_propio, h.ejecutado_propio
    from hoja h
    union all
    select a.cuenta_id, c.parent_id, a.presupuestado_propio, a.ejecutado_propio
    from acumulado a
    join public.presupuesto_cuenta c on c.id = a.ancestro_id
    where c.parent_id is not null
  )
  select
    ancestro_id as cuenta_id,
    sum(presupuestado_propio) as presupuestado,
    sum(ejecutado_propio) as ejecutado
  from acumulado
  group by ancestro_id;
$$;

comment on function public.presupuesto_cuenta_ejecucion(uuid) is
  'Presupuestado vs. ejecutado por nodo del árbol (E9), con el modo de reconocimiento de L4. La '
  'rama manual cubre las cuentas sin concepto vinculado; la automática suma cargos (causación) o '
  'aplicaciones de pago (caja) según politicas_financieras.reconocimiento_ingreso. El ejecutado '
  'nunca se persiste: se deriva, igual que contable_movimientos() (PC-5), así que no existe una '
  'segunda verdad que pueda desincronizarse.';


-- ═══════════════════════════════════════════════════════════════════════
--  3. El aviso que faltaba en el pre-vuelo
-- ═══════════════════════════════════════════════════════════════════════
-- Un concepto sin presupuesto_cuenta_id se cobra igual —el cargo se crea, la
-- unidad debe— pero su ingreso queda invisible en "ejecutado vs.
-- presupuestado", en cualquiera de los dos modos. Perfil exacto de un aviso
-- (D4): resultado correcto, registro incompleto, reparable después sin
-- deshacer nada.
--
-- create or replace añadiendo una rama al UNION ALL; el resto es idéntico.

create or replace function public.fn_liquidacion_prevuelo(
  p_tenant_id      uuid,
  p_periodo_id     uuid,
  p_liquidacion_id uuid default null
)
returns table (
  severidad text,
  codigo    text,
  titulo    text,
  detalle   text
)
language sql
stable
set search_path = ''
as $$
  with periodo as (
    select * from public.periodos
    where id = p_periodo_id and tenant_id = p_tenant_id
  ),
  corte as (
    select (make_date(anio, mes, 1) + interval '1 month - 1 day')::date as fin
    from periodo
  ),
  set_vigente as (
    select id from public.coeficiente_sets
    where tenant_id = p_tenant_id and estado = 'vigente'
  ),
  presupuesto as (
    select pr.id, pr.monto_total
    from public.presupuestos pr, periodo p
    where pr.tenant_id = p_tenant_id and pr.anio = p.anio and pr.estado = 'vigente'
  )

  select 'bloqueo', 'PERIODO_NO_ABIERTO',
         'El periodo no está abierto',
         format('Está en estado "%s" — solo un periodo abierto puede liquidarse.', p.estado)
  from periodo p where p.estado <> 'abierto'

  union all
  select 'bloqueo', 'PERIODO_SIN_VENCIMIENTO',
         'El periodo no tiene fecha de vencimiento',
         'Sin ella no se puede calcular la mora de los cargos que genere esta liquidación, '
         'ni ahora ni después (CAR §7.1, GAP-CAR-001).'
  from periodo p where p.fecha_vencimiento is null

  union all
  select 'bloqueo', 'PERIODO_ANTERIOR_SIN_LIQUIDAR',
         format('Hay %s periodo(s) anterior(es) sin liquidar', count(*)),
         format('%s — la mora de este periodo se calcularía sobre una cartera incompleta.',
                string_agg(format('%s-%s', anterior.anio, lpad(anterior.mes::text, 2, '0')),
                           ', ' order by anterior.anio, anterior.mes))
  from periodo p
  join public.periodos anterior
    on anterior.tenant_id = p_tenant_id
   and (anterior.anio, anterior.mes) < (p.anio, p.mes)
   and not exists (
     select 1 from public.liquidaciones l
     where l.periodo_id = anterior.id and l.estado = 'aplicada'
   )
  having count(*) > 0

  union all
  select 'bloqueo', 'COEFICIENTES_SIN_SET_VIGENTE',
         'No hay una tabla de coeficientes vigente',
         'La liquidación reparte el presupuesto entre las unidades según sus coeficientes; '
         'sin una tabla vigente no hay con qué repartir.'
  from periodo p
  where not exists (select 1 from set_vigente)

  union all
  select 'bloqueo', 'INMUEBLE_SIN_COEFICIENTE',
         format('%s unidad(es) activa(s) sin coeficiente', count(*)),
         format('%s — no se les cobraría nada y su parte la absorberían las demás.',
                string_agg(i.codigo, ', ' order by i.codigo))
  from public.inmuebles i
  where i.tenant_id = p_tenant_id
    and i.estado = 'activo'
    and exists (select 1 from set_vigente)
    and not exists (
      select 1 from public.coeficientes c, set_vigente sv
      where c.inmueble_id = i.id and c.set_id = sv.id
    )
  having count(*) > 0

  union all
  select 'bloqueo', 'PRESUPUESTO_DESCUADRADO',
         'El presupuesto vigente no cuadra',
         format('Los rubros de egreso suman %s frente a un monto aprobado de %s.',
                to_char(coalesce(eg.total, 0), 'FM999G999G999G990D00'),
                to_char(pre.monto_total, 'FM999G999G999G990D00'))
  from presupuesto pre
  cross join lateral (
    select sum(r.monto_anual) as total
    from public.presupuesto_rubros r
    join public.presupuesto_cuenta pc on pc.id = r.cuenta_id
    where r.presupuesto_id = pre.id and pc.naturaleza = 'egreso'
  ) eg
  where coalesce(eg.total, 0) <> pre.monto_total

  union all
  select 'aviso', 'COEFICIENTES_NO_SUMAN_UNO',
         'Los coeficientes no suman 100 %',
         format('Suman %s. El reparto es proporcional y se recauda el total completo, pero '
                'revisa la tabla: la ley exige que sumen la unidad (Ley 675 art. 26).',
                to_char(sum(c.valor), 'FM990D99999999'))
  from public.coeficientes c
  join set_vigente sv on sv.id = c.set_id
  having sum(c.valor) <> 1

  union all
  select 'aviso', 'PRESUPUESTO_SIN_VIGENTE',
         format('No hay presupuesto vigente para %s', p.anio),
         'Los conceptos que se calculan sobre el presupuesto anual no encontrarán su base. '
         'Revisa si el presupuesto del año quedó en borrador.'
  from periodo p
  where not exists (select 1 from presupuesto)

  union all
  select 'aviso', 'CUENTA_SIN_MAPEO_CONTABLE',
         format('%s elemento(s) sin cuenta contable', count(*)),
         format('%s — los movimientos saldrán sin imputación contable hasta que se mapeen.',
                string_agg(pp.referencia, ', ' order by pp.referencia))
  from public.contable_parametrizacion_pendiente(p_tenant_id) pp
  having count(*) > 0

  union all
  -- L4: sin cuenta presupuestal vinculada, el ingreso de este concepto no
  -- entra en la rama automática del rollup — ni en causación ni en caja.
  select 'aviso', 'CONCEPTO_SIN_CUENTA_PRESUPUESTAL',
         format('%s concepto(s) activo(s) sin cuenta presupuestal', count(*)),
         format('%s — se cobran igual, pero su ingreso no aparecerá en la ejecución del '
                'presupuesto hasta vincularles una cuenta.',
                string_agg(co.codigo, ', ' order by co.codigo))
  from public.conceptos co
  where co.tenant_id = p_tenant_id
    and co.estado = 'activo'
    and co.presupuesto_cuenta_id is null
  having count(*) > 0

  union all
  select 'aviso', 'INMUEBLE_SIN_RESPONSABLE',
         format('%s unidad(es) sin responsable vigente', count(*)),
         format('%s — se liquidan igual, pero no hay a quién dirigir el estado de cuenta.',
                string_agg(i.codigo, ', ' order by i.codigo))
  from public.inmuebles i
  where i.tenant_id = p_tenant_id
    and i.estado = 'activo'
    and not exists (
      select 1 from public.inmueble_persona_rol r
      where r.inmueble_id = i.id and r.vigente_hasta is null
    )
  having count(*) > 0

  union all
  select 'aviso', 'NOVEDADES_PENDIENTES',
         format('%s novedad(es) pendiente(s) de aprobación', count(*)),
         'No entran en esta liquidación. Si alguna debía entrar, apruébala antes de aplicar.'
  from public.novedades n, corte c
  where n.tenant_id = p_tenant_id
    and n.estado = 'pendiente'
    and n.inhabilitada_at is null
    and n.fecha_efectiva <= c.fin
  having count(*) > 0

  union all
  select 'aviso', 'VARIACION_ALTA',
         format('El total varía %s%% frente al periodo anterior',
                to_char(round(((actual.tenant_total - previa.tenant_total)
                               / nullif(previa.tenant_total, 0)) * 100, 1), 'FM990D0')),
         format('Antes %s, ahora %s. Verifica que el cambio sea intencional.',
                to_char(previa.tenant_total, 'FM999G999G999G990D00'),
                to_char(actual.tenant_total, 'FM999G999G999G990D00'))
  from public.liquidaciones actual
  join periodo p on p.id = actual.periodo_id
  join lateral (
    select l.tenant_total
    from public.liquidaciones l
    join public.periodos pa on pa.id = l.periodo_id
    where l.tenant_id = p_tenant_id
      and l.estado = 'aplicada'
      and (pa.anio, pa.mes) < (p.anio, p.mes)
    order by pa.anio desc, pa.mes desc
    limit 1
  ) previa on true
  where actual.id = p_liquidacion_id
    and previa.tenant_total <> 0
    and abs((actual.tenant_total - previa.tenant_total) / previa.tenant_total) > 0.15
$$;


-- ═══════════════════════════════════════════════════════════════════════
--  4. Lo que fn_aplicar_liquidacion informa del modo
-- ═══════════════════════════════════════════════════════════════════════
-- No cambia lo que HACE —no escribe nada en presupuesto_ejecucion, por todo
-- lo anterior— pero sí devuelve el modo vigente, para que la pantalla de
-- confirmación pueda decir con verdad "se registra el ingreso ahora" o "se
-- registrará cuando entre el pago".

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

  -- Los cargos son también, por sí solos, el reconocimiento del ingreso en
  -- modo causación: presupuesto_cuenta_ejecucion() los suma directamente.
  -- No hay un paso adicional que dar aquí.
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

  -- L5 (estados de cuenta) se inserta aquí, dentro de esta misma transacción.

  return jsonb_build_object(
    'liquidacion_id',   p_liquidacion_id,
    'periodo_id',       v_liq.periodo_id,
    'tenant_total',     v_liq.tenant_total,
    'cargos_creados',   v_cargos_liq,
    'cargos_novedades', v_cargos_novedad,
    'reconocimiento',   v_modo,
    'avisos',           v_avisos
  );
end;
$$;

comment on function public.fn_aplicar_liquidacion(uuid, text) is
  'Aplica una liquidación pendiente de aprobación: cargos, cargos de novedades y cierre del '
  'periodo, todo en una transacción — o pasa entero, o no pasa nada. No escribe en '
  'presupuesto_ejecucion: el ejecutado se DERIVA de los cargos (causación) o de las aplicaciones '
  'de pago (caja) en presupuesto_cuenta_ejecucion(), así que insertar filas aquí duplicaría el '
  'ingreso — es justo lo que impide guard_presupuesto_ejecucion_cuenta. Devuelve el modo vigente '
  'para que la UI pueda decir con verdad cuándo se reconoce el ingreso.';
