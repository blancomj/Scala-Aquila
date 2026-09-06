-- ═══════════════════════════════════════════════════════════════════════
--  CO-6 · Validación previa al cierre — contable_validacion_cierre(tenant, periodo)
--  (CO_06_cierre_apertura_correccion.md §3.1)
--
--  Solo informa, nunca cierra nada (§3.1). Los 11 hallazgos mínimos de la tabla del corte se
--  agrupan así:
--   1. comprobante_borrador                bloqueante
--   2. parametrizacion_pendiente            bloqueante (contable_parametrizacion_pendiente,
--      TODOS los ámbitos salvo movimiento_sin_contrapartida y cuenta_bancaria, que son advertencia
--      aparte — igual que hace fn_contabilizar_periodo con movimiento_sin_contrapartida)
--   3. conciliacion_proyeccion              bloqueante (contable_conciliacion_proyeccion, CO-3)
--   4. materializacion_pendiente            bloqueante (hechos sin comprobante — ver abajo)
--   5. comprobante_descuadrado              bloqueante (defensivo: no debería poder existir dado
--      que fn_contabilizar_comprobante ya exige cuadre antes de contabilizar — si aparece, es un
--      defecto de otra parte del sistema, no de este corte)
--   6. conciliacion_cartera                 bloqueante (contable_conciliacion_cartera, CO-4)
--   7. movimiento_sin_contrapartida         advertencia (mismo ámbito de parametrizacion_pendiente)
--   8. cuenta_bancaria_sin_mapear           advertencia (ídem, ámbito 'cuenta_bancaria')
--   9. marco_sin_clasificar                 advertencia (tenant_marco_contable, CO-1)
--  10. deterioro_no_calculado               advertencia (contable_calcular_deterioro, CO-7)
--  11. periodo_anterior_abierto             bloqueante (evita cerrar marzo con febrero abierto)
--
--  Hechos sin materializar (hallazgo 4) — no existe ningún RPC de solo lectura para esto; se
--  construye aquí mismo replicando EXACTAMENTE el esquema de claves de idempotencia de
--  fn_contabilizar_periodo (20260930260000), vía anti-join contra contable_hechos() en vez de
--  volver a ejecutar la materialización (que tiene efectos de escritura y no puede reusarse en
--  una función de solo lectura):
--   • Camino B (cargos/pago_aplicaciones/pagos): un comprobante por (periodo, entidad) —
--     origen_modulo='cartera', origen_entidad=<entidad>, origen_id=<periodo_id>,
--     origen_evento='materializacion_periodo'.
--   • Camino A (presupuesto_ejecucion/fondo_movimientos): un comprobante por hecho —
--     origen_modulo=(presupuesto|fondos), origen_entidad=<entidad>, origen_id=<hecho.origen_id>,
--     origen_evento='materializacion'. Se excluyen los hechos sin contrapartida resoluble
--     (cuenta_debito/cuenta_credito null): esos ya los reporta el ámbito
--     'movimiento_sin_contrapartida' (hallazgo 7), no son "pendientes de materializar" sino
--     estructuralmente no materializables todavía.
--
--  Deterioro (hallazgo 10) — contable_calcular_deterioro puede levantar DETERIORO_SIN_POLITICA
--  cuando el tenant no tiene política de deterioro configurada; se captura y se omite ese
--  hallazgo específico (no es lo que el corte pide advertir aquí — la ausencia de política no es
--  "deterioro pendiente de reconocer", es una configuración distinta, fuera de alcance de este
--  hallazgo puntual). Cualquier otro error de esa función SÍ se repropaga.
-- ═══════════════════════════════════════════════════════════════════════

create function public.contable_validacion_cierre(p_tenant_id uuid, p_periodo_id uuid)
returns table (hallazgo text, severidad text, detalle text)
language plpgsql
stable
set search_path = ''
as $$
declare
  v_periodo   public.periodos%rowtype;
  v_anterior  public.periodos%rowtype;
  v_desde     date;
  v_hasta     date;
  v_marco     record;
  v_det       record;
  v_cnt       integer;
  v_txt       text;
begin
  select * into v_periodo from public.periodos
  where id = p_periodo_id and tenant_id = p_tenant_id;
  if v_periodo.id is null then
    raise exception 'PERIODO_INEXISTENTE: % no existe para este tenant', p_periodo_id;
  end if;

  v_desde := make_date(v_periodo.anio, v_periodo.mes, 1);
  v_hasta := (v_desde + interval '1 month' - interval '1 day')::date;

  -- 1. comprobantes en borrador en el periodo
  select count(*) into v_cnt from public.contable_comprobante
  where tenant_id = p_tenant_id and periodo_id = p_periodo_id and estado = 'borrador';
  if v_cnt > 0 then
    return query select 'comprobante_borrador', 'bloqueante',
      v_cnt::text || ' comprobante(s) en borrador dentro del periodo';
  end if;

  -- 2. parametrización pendiente (bloqueante) — todos los ámbitos salvo los dos de advertencia
  select string_agg(p.ambito || ': ' || p.referencia || ' — ' || p.detalle, '; ')
    into v_txt
  from public.contable_parametrizacion_pendiente(p_tenant_id) p
  where p.ambito not in ('movimiento_sin_contrapartida', 'cuenta_bancaria');
  if v_txt is not null then
    return query select 'parametrizacion_pendiente', 'bloqueante', v_txt;
  end if;

  -- 3. conciliación proyección vs. persistido (CO-3)
  select string_agg(c.cuenta_codigo || ': dif. débito ' || c.diferencia_debito
      || ', dif. crédito ' || c.diferencia_credito, '; ')
    into v_txt
  from public.contable_conciliacion_proyeccion(p_tenant_id, v_desde, v_hasta) c;
  if v_txt is not null then
    return query select 'conciliacion_proyeccion', 'bloqueante', v_txt;
  end if;

  -- 4. hechos del periodo sin materializar (anti-join dual, misma clave que
  --    fn_contabilizar_periodo)
  select string_agg(h.entidad || ' (' || h.n || ' hecho(s) sin comprobante)', '; ') into v_txt
  from (
    -- Camino B: un comprobante por (periodo, entidad) — cuenta hechos que quedarían cubiertos
    -- por ese único comprobante ausente, no comprobantes (§3.1: fn_contabilizar_periodo agrupa
    -- todos los hechos de la entidad en el periodo en un solo comprobante).
    select hh.entidad, count(*) as n
    from public.contable_hechos(p_tenant_id, v_desde, v_hasta) hh
    where hh.entidad in ('cargos', 'pago_aplicaciones', 'pagos')
      and not exists (
        select 1 from public.contable_comprobante cc
        where cc.tenant_id = p_tenant_id and cc.origen_modulo = 'cartera'
          and cc.origen_entidad = hh.entidad and cc.origen_id = p_periodo_id
          and cc.origen_evento = 'materializacion_periodo'
      )
    group by hh.entidad
    union all
    -- Camino A: un comprobante por hecho
    select a.entidad, count(*) as n
    from public.contable_hechos(p_tenant_id, v_desde, v_hasta) a
    where a.entidad in ('presupuesto_ejecucion', 'fondo_movimientos')
      and a.cuenta_debito is not null and a.cuenta_credito is not null
      and not exists (
        select 1 from public.contable_comprobante cc
        where cc.tenant_id = p_tenant_id
          and cc.origen_modulo = (case when a.entidad = 'presupuesto_ejecucion'
                                        then 'presupuesto' else 'fondos' end)
          and cc.origen_entidad = a.entidad and cc.origen_id = a.origen_id
          and cc.origen_evento = 'materializacion'
      )
    group by a.entidad
  ) h;
  if v_txt is not null then
    return query select 'materializacion_pendiente', 'bloqueante', v_txt;
  end if;

  -- 5. comprobante descuadrado (defensivo — no debería poder existir)
  select string_agg(d.numero::text, ', ') into v_txt
  from (
    select c.numero, sum(det.debito) as deb, sum(det.credito) as cred
    from public.contable_comprobante c
    join public.contable_comprobante_detalle det on det.comprobante_id = c.id
    where c.tenant_id = p_tenant_id and c.periodo_id = p_periodo_id and c.estado = 'contabilizado'
    group by c.id, c.numero
    having sum(det.debito) <> sum(det.credito)
  ) d;
  if v_txt is not null then
    return query select 'comprobante_descuadrado', 'bloqueante',
      'comprobante(s) descuadrado(s) (defecto): ' || v_txt;
  end if;

  -- 6. conciliación de cartera (CO-4)
  select string_agg(coalesce(i.codigo, cc.inmueble_id::text) || ': ' || cc.diferencia::text, '; ')
    into v_txt
  from public.contable_conciliacion_cartera(p_tenant_id, v_hasta) cc
  left join public.inmuebles i on i.id = cc.inmueble_id;
  if v_txt is not null then
    return query select 'conciliacion_cartera', 'bloqueante', v_txt;
  end if;

  -- 7. movimientos de presupuesto_ejecucion sin contrapartida (advertencia)
  select count(*) into v_cnt
  from public.contable_parametrizacion_pendiente(p_tenant_id) p
  where p.ambito = 'movimiento_sin_contrapartida';
  if v_cnt > 0 then
    return query select 'movimiento_sin_contrapartida', 'advertencia',
      v_cnt::text || ' movimiento(s) de ejecución presupuestal sin contrapartida resoluble';
  end if;

  -- 8. cuentas bancarias sin contable_cuenta_id (advertencia)
  select string_agg(p.referencia, ', ') into v_txt
  from public.contable_parametrizacion_pendiente(p_tenant_id) p
  where p.ambito = 'cuenta_bancaria';
  if v_txt is not null then
    return query select 'cuenta_bancaria_sin_mapear', 'advertencia',
      'sin cuenta contable asociada: ' || v_txt;
  end if;

  -- 9. copropiedad sin clasificar (CO-1)
  select * into v_marco from public.tenant_marco_contable(p_tenant_id);
  if v_marco.clasificado is not true then
    return query select 'marco_sin_clasificar', 'advertencia',
      'la copropiedad no tiene marco contable/tributario clasificado (CO-1)';
  end if;

  -- 10. deterioro no calculado en el ejercicio (CO-7) — se omite si el tenant no tiene política
  begin
    select string_agg(coalesce(i.codigo, d.inmueble_id::text) || ': ajuste ' || d.ajuste::text,
        '; ')
      into v_txt
    from public.contable_calcular_deterioro(p_tenant_id, v_hasta) d
    left join public.inmuebles i on i.id = d.inmueble_id
    where d.ajuste <> 0;
    if v_txt is not null then
      return query select 'deterioro_no_calculado', 'advertencia',
        'deterioro calculado pero no reconocido contablemente: ' || v_txt;
    end if;
  exception when others then
    if sqlerrm not like 'DETERIORO_SIN_POLITICA%' then
      raise;
    end if;
  end;

  -- 11. periodo anterior aún abierto (bloqueante)
  select * into v_anterior from public.periodos
  where tenant_id = p_tenant_id
    and (anio * 12 + mes) = (v_periodo.anio * 12 + v_periodo.mes - 1)
  order by anio desc, mes desc
  limit 1;
  if v_anterior.id is not null and v_anterior.contable_estado = 'abierto' then
    return query select 'periodo_anterior_abierto', 'bloqueante',
      'el periodo ' || v_anterior.anio || '-' || lpad(v_anterior.mes::text, 2, '0')
        || ' todavía está abierto';
  end if;
end;
$$;

comment on function public.contable_validacion_cierre(uuid, uuid) is
  'CO-6 §3.1: hallazgos previos al cierre de un periodo, con severidad bloqueante|advertencia. '
  'Nunca cierra ni modifica nada — fn_contable_cerrar_periodo la ejecuta y decide. El hallazgo '
  '''materializacion_pendiente'' replica la clave de idempotencia de fn_contabilizar_periodo '
  '(CO-3) vía anti-join, sin reejecutar la materialización (que tiene efectos de escritura). '
  '''deterioro_no_calculado'' omite DETERIORO_SIN_POLITICA (tenant sin política configurada no es '
  '''deterioro pendiente'', es otra configuración, fuera de alcance de este hallazgo).';
