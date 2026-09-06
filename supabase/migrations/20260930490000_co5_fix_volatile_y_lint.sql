-- ═══════════════════════════════════════════════════════════════════════
--  CO-5 · Fix: contable_estado_financiero marcada `stable` no puede hacer
--  DROP TABLE/CREATE TEMPORARY TABLE — encontrado por `supabase db lint
--  --linked` antes de correr ninguna prueba ("DROP TABLE is not allowed in
--  a non volatile function"). Se marca `volatile` (sigue sin escribir
--  ningún dato de negocio real, solo una tabla temporal de sesión). La
--  migración ya aplicada (20260930470000) se deja intacta — create or
--  replace, mismo criterio que los fixes de CO-4/CO-7.
--
--  También limpia la advertencia de db lint sobre "v_politica" declarada
--  y nunca leída en fn_generar_notas (quedó de una refactorización previa
--  al escribir la nota de cartera).
-- ═══════════════════════════════════════════════════════════════════════

create or replace function public.contable_estado_financiero(
  p_tenant_id     uuid,
  p_codigo_estado text,
  p_fecha_corte   date,
  p_comparativo   boolean default true
)
returns table (
  codigo             text,
  orden              int,
  nivel              smallint,
  etiqueta           text,
  tipo_linea         text,
  nota_referencia    smallint,
  valor              numeric(18, 2),
  valor_anterior     numeric(18, 2),
  variacion_absoluta numeric(18, 2),
  variacion_relativa numeric(10, 4)
)
language plpgsql
volatile
security invoker
set search_path = ''
as $$
declare
  v_marco        record;
  v_modo_valor   text;
  v_plantilla_id uuid;
  v_linea        record;
  v_periodo      text;
  v_fecha        date;
  v_fecha_inicio date;
  v_resultado    numeric(18, 2);
  v_valor        numeric(18, 2);
  v_antes        numeric(18, 2);
  v_clase        smallint;
  v_match        text[];
  v_token        text;
  v_signo_tok    numeric;
  v_sub          numeric;
begin
  select * into v_marco from public.tenant_marco_contable(p_tenant_id);
  if not v_marco.clasificado then
    raise exception 'MARCO_CONTABLE_SIN_CLASIFICAR: el tenant % no está clasificado (Grupo 2/3) '
      '— no se puede emitir ningún estado financiero (CO-5 §4.2)', p_tenant_id;
  end if;

  if p_codigo_estado <> 'notas' and not (p_codigo_estado = any(v_marco.estados_requeridos)) then
    raise exception 'ESTADO_NO_REQUERIDO_PARA_GRUPO: % no aplica al % de este tenant (CO-5 §4.2)',
      p_codigo_estado, v_marco.marco_grupo;
  end if;

  select p.id, p.modo_valor into v_plantilla_id, v_modo_valor
    from public.contable_estado_plantilla p
   where p.codigo = p_codigo_estado
     and p.marco_grupo = v_marco.marco_grupo::public.marco_contable_grupo_t
     and p.vigente
   order by p.version desc
   limit 1;
  if v_plantilla_id is null then
    raise exception 'ESTADO_NO_REQUERIDO_PARA_GRUPO: no hay plantilla vigente de % para % (CO-5 §4.2)',
      p_codigo_estado, v_marco.marco_grupo;
  end if;

  drop table if exists tmp_estado_valores;
  create temporary table tmp_estado_valores (
    periodo text not null,
    codigo  text not null,
    valor   numeric(18, 2) not null,
    primary key (periodo, codigo)
  ) on commit drop;

  for v_periodo in select unnest(case when p_comparativo then array['actual', 'anterior'] else array['actual'] end)
  loop
    v_fecha := case when v_periodo = 'actual' then p_fecha_corte else (p_fecha_corte - interval '1 year')::date end;
    v_fecha_inicio := make_date(extract(year from v_fecha)::int, 1, 1);
    v_resultado := public.contable_resultado_ejercicio(p_tenant_id, v_fecha);

    for v_linea in
      select * from public.contable_estado_linea where plantilla_id = v_plantilla_id order by orden
    loop
      if v_linea.codigo = 'resultado_ejercicio' then
        v_valor := v_resultado;

      elsif v_linea.tipo_linea = 'grupo' then
        v_valor := null;

      elsif v_linea.tipo_linea = 'detalle' then
        select distinct cc.clase into v_clase
          from public.contable_cuenta cc
         where cc.tenant_id = p_tenant_id and cc.codigo like v_linea.selector_cuentas || '%'
         limit 1;

        if v_linea.momento = 'inicio' then
          select coalesce(sum(case when cc.naturaleza = 'debito' then d.debito - d.credito else d.credito - d.debito end), 0)
            into v_valor
            from public.contable_comprobante_detalle d
            join public.contable_comprobante c on c.id = d.comprobante_id
            join public.contable_cuenta cc on cc.id = d.cuenta_id
           where c.tenant_id = p_tenant_id and c.numero is not null and c.fecha < v_fecha_inicio
             and cc.codigo like v_linea.selector_cuentas || '%';

        elsif coalesce(v_clase, 0) in (4, 5) then
          select coalesce(sum(case when cc.naturaleza = 'debito' then d.debito - d.credito else d.credito - d.debito end), 0)
            into v_valor
            from public.contable_comprobante_detalle d
            join public.contable_comprobante c on c.id = d.comprobante_id
            join public.contable_cuenta cc on cc.id = d.cuenta_id
           where c.tenant_id = p_tenant_id and c.numero is not null
             and c.fecha between v_fecha_inicio and v_fecha
             and cc.codigo like v_linea.selector_cuentas || '%';

        else
          select coalesce(sum(case when cc.naturaleza = 'debito' then d.debito - d.credito else d.credito - d.debito end), 0)
            into v_valor
            from public.contable_comprobante_detalle d
            join public.contable_comprobante c on c.id = d.comprobante_id
            join public.contable_cuenta cc on cc.id = d.cuenta_id
           where c.tenant_id = p_tenant_id and c.numero is not null and c.fecha <= v_fecha
             and cc.codigo like v_linea.selector_cuentas || '%';

          if v_modo_valor = 'variacion' then
            select coalesce(sum(case when cc.naturaleza = 'debito' then d.debito - d.credito else d.credito - d.debito end), 0)
              into v_antes
              from public.contable_comprobante_detalle d
              join public.contable_comprobante c on c.id = d.comprobante_id
              join public.contable_cuenta cc on cc.id = d.cuenta_id
             where c.tenant_id = p_tenant_id and c.numero is not null and c.fecha < v_fecha_inicio
               and cc.codigo like v_linea.selector_cuentas || '%';
            v_valor := v_valor - v_antes;
          end if;
        end if;
        v_valor := v_valor * v_linea.signo;

      else
        v_valor := 0;
        for v_match in select regexp_matches(v_linea.formula, '([+-]?)([A-Za-z0-9_]+)', 'g')
        loop
          v_signo_tok := case when v_match[1] = '-' then -1 else 1 end;
          v_token := v_match[2];
          if v_token ~ '^[0-9]+$' then
            v_valor := v_valor + v_signo_tok * v_token::numeric;
          else
            select tv.valor into v_sub from tmp_estado_valores tv
             where tv.periodo = v_periodo and tv.codigo = v_token;
            if not found then
              raise exception 'FORMULA_ESTADO_INVALIDA: la fórmula de % referencia % antes de '
                'calcularla (revisa el orden de las líneas)', v_linea.codigo, v_token;
            end if;
            v_valor := v_valor + v_signo_tok * v_sub;
          end if;
        end loop;
        v_valor := v_valor * v_linea.signo;
      end if;

      insert into tmp_estado_valores (periodo, codigo, valor)
      values (v_periodo, v_linea.codigo, coalesce(v_valor, 0));
    end loop;
  end loop;

  return query
  select
    l.codigo, l.orden, l.nivel, l.etiqueta, l.tipo_linea::text, l.nota_referencia,
    case when l.tipo_linea = 'grupo' then null else va.valor end,
    case when l.tipo_linea = 'grupo' or not p_comparativo then null else van.valor end,
    case when l.tipo_linea = 'grupo' or not p_comparativo then null else va.valor - van.valor end,
    case when l.tipo_linea = 'grupo' or not p_comparativo or van.valor is null or van.valor = 0 then null
         else round((va.valor - van.valor) / abs(van.valor) * 100, 4) end
  from public.contable_estado_linea l
  join tmp_estado_valores va on va.periodo = 'actual' and va.codigo = l.codigo
  left join tmp_estado_valores van on van.periodo = 'anterior' and van.codigo = l.codigo
  where l.plantilla_id = v_plantilla_id
  order by l.orden;
end;
$$;

comment on function public.contable_estado_financiero(uuid, text, date, boolean) is
  'Motor genérico de presentación (CO-5 §4.2) — la estructura vive en contable_estado_plantilla/'
  '_linea, no en esta función. Bloquea con MARCO_CONTABLE_SIN_CLASIFICAR si el tenant no está '
  'clasificado, y con ESTADO_NO_REQUERIDO_PARA_GRUPO si el código no aplica al grupo del tenant '
  '(nunca una tabla en blanco silenciosa). SECURITY INVOKER: la lectura pasa por el RLS normal '
  'de contable_comprobante_detalle/contable_cuenta, igual que los libros de CO-4. volatile '
  '(no stable) porque crea/elimina una tabla temporal de sesión — no escribe ningún dato real.';

create or replace function public.fn_generar_notas(p_tenant_id uuid, p_ejercicio int)
returns setof public.contable_nota
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_fecha_corte    date := make_date(p_ejercicio, 12, 31);
  v_fecha_inicio   date := make_date(p_ejercicio, 1, 1);
  v_tenant         record;
  v_marco          record;
  v_np             record;
  v_cuerpo         text;
  v_num            numeric(18, 2);
  v_num2           numeric(18, 2);
  v_num3           numeric(18, 2);
  v_num4           numeric(18, 2);
  v_texto          text;
  v_fondo_id       uuid;
  v_fila           record;
  v_presupuesto_id uuid;
begin
  if not public.has_role(p_tenant_id, array['auxiliar']::public.tenant_role_t[]) then
    raise exception 'FORBIDDEN: se requiere rol auxiliar o administrador para generar notas';
  end if;

  select * into v_tenant from public.tenants where id = p_tenant_id;
  select * into v_marco from public.tenant_marco_contable(p_tenant_id);

  for v_np in select * from public.contable_nota_plantilla order by orden
  loop
    v_cuerpo := v_np.cuerpo_plantilla;

    if v_np.codigo = 'entidad_reportante' then
      v_cuerpo := replace(v_cuerpo, '{{nombre}}', coalesce(v_tenant.name, '—'));
      v_cuerpo := replace(v_cuerpo, '{{nit}}', coalesce(v_tenant.nit, 'sin NIT registrado'));
      v_cuerpo := replace(v_cuerpo, '{{direccion}}', coalesce(v_tenant.direccion, 'sin dirección registrada'));
      v_cuerpo := replace(v_cuerpo, '{{ciudad}}', coalesce(v_tenant.ciudad, '—'));
      v_cuerpo := replace(v_cuerpo, '{{uso_economico}}', coalesce(v_marco.uso_economico::text, 'sin clasificar'));

    elsif v_np.codigo = 'bases_preparacion' then
      v_cuerpo := replace(v_cuerpo, '{{marco_grupo_nombre}}',
        case v_marco.marco_grupo
          when 'grupo_2' then 'Grupo 2 (NIIF para las Pymes)'
          when 'grupo_3' then 'Grupo 3 (contabilidad simplificada)'
          else 'sin clasificar'
        end);

    elsif v_np.codigo = 'efectivo_equivalentes' then
      select coalesce(sum(case when cc.naturaleza = 'debito' then d.debito - d.credito else d.credito - d.debito end), 0)
        into v_num
        from public.contable_comprobante_detalle d
        join public.contable_comprobante c on c.id = d.comprobante_id
        join public.contable_cuenta cc on cc.id = d.cuenta_id
       where c.tenant_id = p_tenant_id and c.numero is not null and c.fecha <= v_fecha_corte
         and cc.codigo like '11%';
      v_cuerpo := replace(v_cuerpo, '{{total_efectivo}}', '$' || to_char(v_num, 'FM999G999G999G990'));

      select coalesce(cd.contable_cuenta_id, null) into v_fondo_id
        from public.contable_cuenta_default cd
        join public.lista_tipos lt on lt.id = cd.evento_id
       where cd.tenant_id = p_tenant_id and lt.tipo = 'EVENTO_CONTABLE' and lt.codigo = 'FONDO_IMPREVISTOS_EFECTIVO';
      v_num2 := 0;
      if v_fondo_id is not null then
        select coalesce(sum(case when cc.naturaleza = 'debito' then d.debito - d.credito else d.credito - d.debito end), 0)
          into v_num2
          from public.contable_comprobante_detalle d
          join public.contable_comprobante c on c.id = d.comprobante_id
          join public.contable_cuenta cc on cc.id = d.cuenta_id
         where c.tenant_id = p_tenant_id and c.numero is not null and c.fecha <= v_fecha_corte
           and cc.id = v_fondo_id;
      end if;
      v_cuerpo := replace(v_cuerpo, '{{saldo_fondo_imprevistos}}', '$' || to_char(v_num2, 'FM999G999G999G990'));

      v_texto := '';
      for v_fila in
        select cb.titular, cb.numero_cuenta, cb.contable_cuenta_id
          from public.cuentas_bancarias cb
         where cb.tenant_id = p_tenant_id and cb.activa
      loop
        select coalesce(saldo_final, 0) into v_num3
          from public.contable_libro_mayor(p_tenant_id, '0001-01-01'::date, v_fecha_corte, v_fila.contable_cuenta_id)
         limit 1;
        v_texto := v_texto || coalesce(v_fila.titular, 'Cuenta') || ' (' || coalesce(v_fila.numero_cuenta, '—') || '): $'
          || to_char(coalesce(v_num3, 0), 'FM999G999G999G990') || '; ';
      end loop;
      v_cuerpo := replace(v_cuerpo, '{{desglose_cuentas_bancarias}}', nullif(v_texto, ''));
      if v_texto = '' then
        v_cuerpo := replace(v_np.cuerpo_plantilla, '{{desglose_cuentas_bancarias}}', 'sin cuentas bancarias activas registradas');
        v_cuerpo := replace(v_cuerpo, '{{total_efectivo}}', '$' || to_char(v_num, 'FM999G999G999G990'));
        v_cuerpo := replace(v_cuerpo, '{{saldo_fondo_imprevistos}}', '$' || to_char(v_num2, 'FM999G999G999G990'));
      end if;

    elsif v_np.codigo = 'fondo_imprevistos' then
      select f.id into v_fondo_id from public.fondos f
       where f.tenant_id = p_tenant_id and f.naturaleza = 'imprevistos';
      v_num := 0; v_num2 := 0; v_num3 := 0; v_num4 := 0;
      if v_fondo_id is not null then
        select coalesce(sum(public.fn_fondo_movimiento_efecto(fm.tipo, fm.monto)), 0) into v_num
          from public.fondo_movimientos fm where fm.fondo_id = v_fondo_id and fm.fecha < v_fecha_inicio;
        select coalesce(sum(fm.monto), 0) into v_num2
          from public.fondo_movimientos fm
         where fm.fondo_id = v_fondo_id and fm.tipo = 'aporte' and fm.fecha between v_fecha_inicio and v_fecha_corte;
        select coalesce(sum(fm.monto), 0) into v_num3
          from public.fondo_movimientos fm
         where fm.fondo_id = v_fondo_id and fm.tipo in ('uso', 'traslado_salida')
           and fm.fecha between v_fecha_inicio and v_fecha_corte;
        select coalesce(sum(fm.monto), 0) into v_num4
          from public.fondo_movimientos fm
         where fm.fondo_id = v_fondo_id and fm.tipo = 'rendimiento' and fm.fecha between v_fecha_inicio and v_fecha_corte;
      end if;
      v_cuerpo := replace(v_cuerpo, '{{saldo_inicial}}', '$' || to_char(v_num, 'FM999G999G999G990'));
      v_cuerpo := replace(v_cuerpo, '{{recaudos}}', '$' || to_char(v_num2, 'FM999G999G999G990'));
      v_cuerpo := replace(v_cuerpo, '{{usos}}', '$' || to_char(v_num3, 'FM999G999G999G990'));
      v_cuerpo := replace(v_cuerpo, '{{rendimientos}}', '$' || to_char(v_num4, 'FM999G999G999G990'));
      v_cuerpo := replace(v_cuerpo, '{{saldo_final}}', '$' || to_char(v_num + v_num2 - v_num3 + v_num4, 'FM999G999G999G990'));

    elsif v_np.codigo = 'cuentas_por_cobrar' then
      v_texto := '';
      v_num := 0;
      begin
        for v_fila in select * from public.contable_calcular_deterioro(p_tenant_id, v_fecha_corte)
        loop
          v_texto := v_texto || 'inmueble ' || v_fila.inmueble_id || ': saldo $' || to_char(v_fila.saldo, 'FM999G999G999G990')
            || ', ' || v_fila.dias_vencido || ' días vencido; ';
          v_num := v_num + v_fila.deterioro_reconocido;
        end loop;
      exception when others then
        v_texto := 'sin política de deterioro vigente — no se puede calcular la antigüedad de cartera';
      end;
      v_cuerpo := replace(v_cuerpo, '{{cartera_por_antiguedad}}', nullif(v_texto, ''));
      if v_texto = '' then
        v_cuerpo := replace(v_np.cuerpo_plantilla, '{{cartera_por_antiguedad}}', 'sin cartera pendiente a la fecha de corte');
      end if;
      v_cuerpo := replace(v_cuerpo, '{{deterioro_reconocido}}', '$' || to_char(v_num, 'FM999G999G999G990'));

      select p.metodo::text into v_texto from public.contable_politica_deterioro p
       where p.tenant_id = p_tenant_id and p.estado = 'vigente';
      v_cuerpo := replace(v_cuerpo, '{{politica_deterioro_resumen}}', coalesce(v_texto, 'sin política vigente'));

    elsif v_np.codigo = 'propiedad_planta_equipo' then
      select coalesce(sum(case when cc.naturaleza = 'debito' then d.debito - d.credito else d.credito - d.debito end), 0)
        into v_num
        from public.contable_comprobante_detalle d
        join public.contable_comprobante c on c.id = d.comprobante_id
        join public.contable_cuenta cc on cc.id = d.cuenta_id
       where c.tenant_id = p_tenant_id and c.numero is not null and c.fecha <= v_fecha_corte
         and cc.codigo like '15%';
      v_cuerpo := replace(v_cuerpo, '{{saldo_ppe}}', '$' || to_char(v_num, 'FM999G999G999G990'));
      v_cuerpo := replace(v_cuerpo, '{{advertencia_ppe}}',
        'Esta nota presenta el saldo global de propiedad, planta y equipo — el desglose por '
        'activo individual y su depreciación pertenece al módulo de mantenimiento (fuera de '
        'alcance de este corte, CO-5 §5).');

    elsif v_np.codigo = 'cuentas_por_pagar' then
      v_texto := '';
      for v_fila in
        select cc.codigo, cc.nombre,
          coalesce(sum(case when cc.naturaleza = 'debito' then d.debito - d.credito else d.credito - d.debito end), 0) as saldo
        from public.contable_comprobante_detalle d
        join public.contable_comprobante c on c.id = d.comprobante_id
        join public.contable_cuenta cc on cc.id = d.cuenta_id
       where c.tenant_id = p_tenant_id and c.numero is not null and c.fecha <= v_fecha_corte
         and (cc.codigo like '22%' or cc.codigo like '23%')
         and cc.nivel = 2
       group by cc.codigo, cc.nombre
      having coalesce(sum(case when cc.naturaleza = 'debito' then d.debito - d.credito else d.credito - d.debito end), 0) <> 0
      loop
        v_texto := v_texto || v_fila.codigo || ' ' || v_fila.nombre || ': $' || to_char(v_fila.saldo, 'FM999G999G999G990') || '; ';
      end loop;
      v_cuerpo := replace(v_cuerpo, '{{cuentas_por_pagar_por_naturaleza}}', nullif(v_texto, ''));
      if v_texto = '' then
        v_cuerpo := replace(v_np.cuerpo_plantilla, '{{cuentas_por_pagar_por_naturaleza}}', 'sin saldo pendiente a la fecha de corte');
      end if;

    elsif v_np.codigo = 'patrimonio' then
      select coalesce(sum(case when cc.naturaleza = 'debito' then d.debito - d.credito else d.credito - d.debito end), 0)
        into v_num
        from public.contable_comprobante_detalle d
        join public.contable_comprobante c on c.id = d.comprobante_id
        join public.contable_cuenta cc on cc.id = d.cuenta_id
       where c.tenant_id = p_tenant_id and c.numero is not null and c.fecha <= v_fecha_corte and cc.codigo like '31%';
      select coalesce(sum(case when cc.naturaleza = 'debito' then d.debito - d.credito else d.credito - d.debito end), 0)
        into v_num2
        from public.contable_comprobante_detalle d
        join public.contable_comprobante c on c.id = d.comprobante_id
        join public.contable_cuenta cc on cc.id = d.cuenta_id
       where c.tenant_id = p_tenant_id and c.numero is not null and c.fecha <= v_fecha_corte and cc.codigo like '33%';
      v_num3 := public.contable_resultado_ejercicio(p_tenant_id, v_fecha_corte);
      v_cuerpo := replace(v_cuerpo, '{{patrimonio_social}}', '$' || to_char(v_num, 'FM999G999G999G990'));
      v_cuerpo := replace(v_cuerpo, '{{resultados_anteriores}}', '$' || to_char(v_num2, 'FM999G999G999G990'));
      v_cuerpo := replace(v_cuerpo, '{{resultado_ejercicio}}', '$' || to_char(v_num3, 'FM999G999G999G990'));

    elsif v_np.codigo = 'ingresos' then
      v_texto := '';
      for v_fila in
        select cc.codigo, cc.nombre,
          coalesce(sum(d.credito - d.debito), 0) as movimiento
        from public.contable_comprobante_detalle d
        join public.contable_comprobante c on c.id = d.comprobante_id
        join public.contable_cuenta cc on cc.id = d.cuenta_id
       where c.tenant_id = p_tenant_id and c.numero is not null
         and c.fecha between v_fecha_inicio and v_fecha_corte
         and cc.clase = 4 and cc.nivel = 2
       group by cc.codigo, cc.nombre
      having coalesce(sum(d.credito - d.debito), 0) <> 0
      loop
        v_texto := v_texto || v_fila.codigo || ' ' || v_fila.nombre || ': $' || to_char(v_fila.movimiento, 'FM999G999G999G990') || '; ';
      end loop;
      v_cuerpo := replace(v_cuerpo, '{{ingresos_por_naturaleza}}', nullif(v_texto, ''));
      if v_texto = '' then
        v_cuerpo := replace(v_np.cuerpo_plantilla, '{{ingresos_por_naturaleza}}', 'sin ingresos en el ejercicio');
      end if;

    elsif v_np.codigo = 'gastos' then
      v_texto := '';
      for v_fila in
        select cc.codigo, cc.nombre,
          coalesce(sum(d.debito - d.credito), 0) as movimiento
        from public.contable_comprobante_detalle d
        join public.contable_comprobante c on c.id = d.comprobante_id
        join public.contable_cuenta cc on cc.id = d.cuenta_id
       where c.tenant_id = p_tenant_id and c.numero is not null
         and c.fecha between v_fecha_inicio and v_fecha_corte
         and cc.clase = 5 and cc.nivel = 2
       group by cc.codigo, cc.nombre
      having coalesce(sum(d.debito - d.credito), 0) <> 0
      loop
        v_texto := v_texto || v_fila.codigo || ' ' || v_fila.nombre || ': $' || to_char(v_fila.movimiento, 'FM999G999G999G990') || '; ';
      end loop;
      v_cuerpo := replace(v_cuerpo, '{{gastos_por_naturaleza}}', nullif(v_texto, ''));
      if v_texto = '' then
        v_cuerpo := replace(v_np.cuerpo_plantilla, '{{gastos_por_naturaleza}}', 'sin gastos en el ejercicio');
      end if;

    elsif v_np.codigo = 'ejecucion_presupuestal' then
      select id into v_presupuesto_id from public.presupuestos
       where tenant_id = p_tenant_id and anio = p_ejercicio and estado = 'vigente';
      v_texto := '';
      if v_presupuesto_id is not null then
        for v_fila in
          select pc.codigo, pc.nombre, pe.presupuestado, pe.ejecutado
            from public.presupuesto_cuenta_ejecucion(v_presupuesto_id) pe
            join public.presupuesto_cuenta pc on pc.id = pe.cuenta_id
           where pe.presupuestado <> 0 or pe.ejecutado <> 0
        loop
          v_texto := v_texto || v_fila.codigo || ' ' || v_fila.nombre || ': presupuestado $'
            || to_char(v_fila.presupuestado, 'FM999G999G999G990') || ', ejecutado $'
            || to_char(v_fila.ejecutado, 'FM999G999G999G990') || '; ';
        end loop;
      end if;
      v_cuerpo := replace(v_cuerpo, '{{ejecucion_presupuestal}}', nullif(v_texto, ''));
      if v_texto = '' then
        v_cuerpo := replace(v_np.cuerpo_plantilla, '{{ejecucion_presupuestal}}', 'sin presupuesto vigente para este ejercicio');
      end if;

    elsif v_np.codigo = 'litigios_contingencias' then
      v_texto := '';
      v_num := 0;
      for v_fila in
        select consecutivo, estado, monto_pretension
          from public.casos_juridicos
         where tenant_id = p_tenant_id
           and estado not in ('terminado', 'desistido', 'archivado')
      loop
        v_texto := v_texto || v_fila.consecutivo || ' (' || v_fila.estado || '): $'
          || to_char(v_fila.monto_pretension, 'FM999G999G999G990') || '; ';
        v_num := v_num + v_fila.monto_pretension;
      end loop;
      v_cuerpo := replace(v_cuerpo, '{{litigios_activos}}', nullif(v_texto, ''));
      if v_texto = '' then
        v_cuerpo := replace(v_np.cuerpo_plantilla, '{{litigios_activos}}', 'sin procesos jurídicos activos a la fecha de corte');
      end if;
      v_cuerpo := replace(v_cuerpo, '{{total_pretension}}', '$' || to_char(v_num, 'FM999G999G999G990'));
    end if;

    insert into public.contable_nota (tenant_id, ejercicio, plantilla_id, numero, titulo, cuerpo)
    values (p_tenant_id, p_ejercicio, v_np.id, v_np.numero, v_np.titulo, v_cuerpo)
    on conflict (tenant_id, ejercicio, plantilla_id) do update
      set cuerpo = excluded.cuerpo, generada_at = now()
      where public.contable_nota.estado = 'generada';
  end loop;

  return query select * from public.contable_nota
   where tenant_id = p_tenant_id and ejercicio = p_ejercicio
   order by numero;
end;
$$;

comment on function public.fn_generar_notas(uuid, int) is
  'Genera las 14 notas con cifras reales del ejercicio (CO-5 §4.3). Una nota ya editada '
  '(estado=editada) nunca se sobrescribe al regenerar el resto (prueba 12) — el ON CONFLICT '
  'solo actualiza filas que siguen en estado=generada. SECURITY DEFINER con verificación '
  'interna de has_role. (Fix: se retira v_politica, declarada y nunca leída — advertencia de '
  'db lint.)';
