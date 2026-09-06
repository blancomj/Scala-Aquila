-- ═══════════════════════════════════════════════════════════════════════
--  CO-5 · Fix: contable_estado_financiero() trataba `v_marco.clasificado`
--  con `if not v_marco.clasificado`, que en PL/pgSQL es NULL (no true) —
--  y por lo tanto NO dispara el `raise`— cuando v_marco.clasificado es NULL
--  en vez de false. Esto ocurre para un tenant_id que el llamante no puede
--  ver por RLS (tenant_marco_contable() no encuentra la fila en `tenants` y
--  deja todos sus campos NULL): en vez de MARCO_CONTABLE_SIN_CLASIFICAR, el
--  código seguía hasta el segundo guard (también NULL-seguro por accidente,
--  no por diseño) y terminaba levantando ESTADO_NO_REQUERIDO_PARA_GRUPO con
--  un mensaje confuso ("... para <NULL>"). No es una fuga de datos (ningún
--  dato del otro tenant se devuelve, la prueba de aislamiento de
--  tests/contabilidad/estados-financieros.test.ts prueba 13 lo confirma),
--  pero el código de error no reflejaba la causa real. Fix: `is not true`
--  trata NULL y false de forma idéntica (ambos "no confirmado clasificado"),
--  cubriendo tanto el tenant realmente sin clasificar (CO-5 §6 prueba 6)
--  como el tenant invisible por RLS (prueba 13) con el mismo error correcto.
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
  if v_marco.clasificado is not true then
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
  'clasificado O si es invisible por RLS (v_marco.clasificado sale NULL, no false — `is not true` '
  'cubre ambos casos, fix CO-5 tras la prueba 13 de aislamiento), y con '
  'ESTADO_NO_REQUERIDO_PARA_GRUPO si el código no aplica al grupo del tenant (nunca una tabla en '
  'blanco silenciosa). SECURITY INVOKER: la lectura pasa por el RLS normal de '
  'contable_comprobante_detalle/contable_cuenta, igual que los libros de CO-4.';
