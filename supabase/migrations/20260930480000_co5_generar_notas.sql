-- ═══════════════════════════════════════════════════════════════════════
--  CO-5 · Generador de notas con cifras reales (§4.3) — fn_generar_notas().
--
--  Cada nota tiene su propia consulta real (no un motor de plantillas genérico — hay
--  exactamente 14 notas conocidas, no un catálogo abierto, decisión acordada en el Plan del
--  corte). Reutiliza lo ya construido: contable_libro_mayor (CO-4) para el desglose por cuenta
--  bancaria, contable_calcular_deterioro (CO-7) para la nota 6, presupuesto_cuenta_ejecucion
--  (ya existente) para la nota 12, fn_fondo_movimiento_efecto (fondos) para la nota 5.
--
--  Una nota editada por el usuario (contable_nota.estado='editada') NUNCA se sobrescribe al
--  regenerar el resto — fn_generar_notas() hace upsert solo de las que siguen en 'generada'
--  (prueba 12).
-- ═══════════════════════════════════════════════════════════════════════

create function public.contable_validar_notas_completas(p_tenant_id uuid, p_ejercicio int)
returns void
language plpgsql
stable
set search_path = ''
as $$
declare
  v_faltante record;
begin
  select np.numero, np.titulo into v_faltante
    from public.contable_nota_plantilla np
    left join public.contable_nota n
      on n.tenant_id = p_tenant_id and n.ejercicio = p_ejercicio and n.plantilla_id = np.id
   where np.obligatoria and (n.id is null or trim(coalesce(n.cuerpo, '')) = '')
   limit 1;

  if v_faltante.numero is not null then
    raise exception 'NOTA_OBLIGATORIA_VACIA: la nota % (%) es obligatoria y está vacía — no se '
      'puede exportar el juego de estados financieros (CO-5 §4.3)', v_faltante.numero, v_faltante.titulo;
  end if;
end;
$$;

comment on function public.contable_validar_notas_completas(uuid, int) is
  'Llamada antes de exportar el juego completo (CO-5 §4.5/§8) — ninguna nota obligatoria puede '
  'quedar vacía al exportar (prueba 9). No bloquea guardar un borrador incompleto, solo exportar.';

create function public.fn_generar_notas(p_tenant_id uuid, p_ejercicio int)
returns setof public.contable_nota
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_fecha_corte  date := make_date(p_ejercicio, 12, 31);
  v_fecha_inicio date := make_date(p_ejercicio, 1, 1);
  v_tenant       record;
  v_marco        record;
  v_np           record;
  v_cuerpo       text;
  v_num          numeric(18, 2);
  v_num2         numeric(18, 2);
  v_num3         numeric(18, 2);
  v_num4         numeric(18, 2);
  v_texto        text;
  v_fondo_id     uuid;
  v_fila         record;
  v_politica     record;
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

    -- Una nota ya editada por el usuario nunca se sobrescribe (prueba 12) — solo se inserta
    -- la primera vez, o se actualiza mientras siga en estado='generada'.
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
  'interna de has_role.';
