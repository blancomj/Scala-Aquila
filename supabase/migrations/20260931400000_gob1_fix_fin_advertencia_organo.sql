-- ═══════════════════════════════════════════════════════════════════════
--  GOB-1 · fix cruzado: FIN-2/FIN-3 dejaron de advertir al existir GOB-1
--
--  Encontrado por la regresión de FIN-2 (tests 5/6 de
--  tests/finanzas/facturas-proveedor.test.ts) al correr `pnpm test` después
--  de aplicar las migraciones de este corte: esos dos guards escribían la
--  advertencia `FACTURA_APROBACION_ORGANO_INCOMPETENTE`/
--  `LOTE_APROBACION_ORGANO_INCOMPETENTE` solo cuando
--  `to_regclass('public.gobierno_organos') is null` — una condición que
--  este corte, al crear esa tabla, vuelve permanentemente falsa. El código
--  NO tenía un `else` que llamara `gobierno_organo_competente()` (ese
--  llamado era un comentario "cuando GOB-1 exista", nunca código real) —
--  así que ambas funciones pasaron de "advertir explícitamente que no se
--  pudo verificar" a "no advertir absolutamente nada", silenciosamente.
--
--  Resolver esto DE VERDAD (llamar gobierno_organo_competente con un
--  código real de ATRIBUCION_ORGANO) está fuera del alcance de GOB-1: la
--  atribución que FIN-2 necesitaría ("aprobar_gasto", según su propio
--  informe) NO está en la lista de códigos que el corte GOB-1 tenía que
--  sembrar (GOB_01_organos_gobierno.md §4.2) — inventarla ahora sería
--  decidir algo de FIN-2 desde este corte, no algo mío. Se restaura el
--  comportamiento pretendido (advertencia siempre que se supera el umbral
--  sin poder verificar un órgano competente real) quitando la condición
--  sobre `to_regclass`, con un mensaje que ya no dice "GOB-1 no existe"
--  (falso ahora) sino la razón real: existe pero no tiene una atribución
--  para esto todavía.
-- ═══════════════════════════════════════════════════════════════════════

create or replace function public.fn_finanzas_aprobar_factura(p_factura_id uuid)
returns public.finanzas_facturas_proveedor
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_factura       public.finanzas_facturas_proveedor%rowtype;
  v_ejecucion_id  uuid;
  v_periodo_id    uuid;
  v_monto_ejec    numeric;
  v_politica      public.finanzas_politica_aprobacion_pago;
begin
  select * into v_factura from public.finanzas_facturas_proveedor where id = p_factura_id;
  if v_factura.id is null then
    raise exception 'FACTURA_INEXISTENTE: la factura % no existe', p_factura_id;
  end if;

  if not public.has_role(v_factura.tenant_id, array['administrador']::public.tenant_role_t[]) then
    raise exception 'FORBIDDEN: se requiere rol administrador para aprobar una factura';
  end if;

  if v_factura.estado <> 'en_revision' then
    raise exception 'FACTURA_TRANSICION_INVALIDA: solo una factura en_revision puede aprobarse '
      '(estado actual: %)', v_factura.estado;
  end if;

  if v_factura.documento_soporte_id is null then
    raise exception 'FACTURA_APROBACION_SIN_SOPORTE: la factura % no tiene documento_soporte_id',
      p_factura_id;
  end if;

  -- ── Enlazar o crear la ejecución presupuestal (nunca un saldo propio) ──
  if v_factura.presupuesto_ejecucion_id is not null then
    select id, monto into v_ejecucion_id, v_monto_ejec
      from public.presupuesto_ejecucion where id = v_factura.presupuesto_ejecucion_id;
    if v_monto_ejec is distinct from v_factura.total_neto_pagar then
      raise exception 'FACTURA_EJECUCION_MONTO_DISCREPA: la ejecución % tiene monto % pero la '
        'factura exige %', v_ejecucion_id, v_monto_ejec, v_factura.total_neto_pagar;
    end if;
  else
    if v_factura.presupuesto_cuenta_id is null then
      raise exception 'FACTURA_SIN_CUENTA_PRESUPUESTAL: la factura % no tiene '
        'presupuesto_cuenta_id ni presupuesto_ejecucion_id — no hay contra qué rubro cargarla',
        p_factura_id;
    end if;

    select id into v_periodo_id from public.periodos
      where tenant_id = v_factura.tenant_id
        and anio = extract(year from v_factura.fecha_emision)
        and mes = extract(month from v_factura.fecha_emision);
    if v_periodo_id is null then
      raise exception 'PERIODO_INEXISTENTE: no existe un periodo % - % para la fecha de emisión '
        'de la factura %', extract(year from v_factura.fecha_emision),
        extract(month from v_factura.fecha_emision), p_factura_id;
    end if;

    insert into public.presupuesto_ejecucion (
      tenant_id, cuenta_id, periodo_id, monto, liquidacion, tercero_id, contrato_id,
      centro_costo_id, fecha_documento, descripcion, referencia
    ) values (
      v_factura.tenant_id, v_factura.presupuesto_cuenta_id, v_periodo_id, v_factura.total_neto_pagar,
      'por_pagar', v_factura.proveedor_id, v_factura.contrato_id, v_factura.centro_costo_id,
      v_factura.fecha_emision, 'Factura de proveedor ' || v_factura.numero_documento,
      v_factura.numero_documento
    )
    returning id into v_ejecucion_id;
  end if;

  -- ── Umbral de aprobación / órgano competente (GOB-1 existe, pero no tiene atribución para
  --    esto — ver cabecera de 20260931400000) — advertencia inspeccionable, nunca bloqueo.
  v_politica := public.fn_finanzas_politica_aprobacion_vigente(v_factura.tenant_id);
  if v_politica.id is not null and v_politica.monto_umbral is not null
     and v_factura.total_neto_pagar > v_politica.monto_umbral then
    insert into public.finanzas_factura_advertencia (tenant_id, factura_id, codigo, mensaje)
    values (v_factura.tenant_id, p_factura_id, 'FACTURA_APROBACION_ORGANO_INCOMPETENTE',
      format('Factura %s por %s supera el umbral de aprobación (%s) — GOB-1 existe pero no '
             'tiene una atribución de ATRIBUCION_ORGANO para aprobación de gastos todavía, no '
             'se pudo verificar aprobación por órgano competente.',
             v_factura.numero_documento, v_factura.total_neto_pagar, v_politica.monto_umbral));
  end if;

  perform set_config('aquila.aprobando_factura', 'true', true);
  update public.finanzas_facturas_proveedor
  set estado = 'aprobada', aprobada_por = auth.uid(), aprobada_at = now(),
      presupuesto_ejecucion_id = v_ejecucion_id
  where id = p_factura_id
  returning * into v_factura;
  perform set_config('aquila.aprobando_factura', 'false', true);

  return v_factura;
end;
$$;

create or replace function public.fn_finanzas_aprobar_lote(p_lote_id uuid, p_justificacion text default null)
returns public.finanzas_lotes_pago
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_lote               public.finanzas_lotes_pago;
  v_politica           public.finanzas_politica_aprobacion_lote;
  v_requiere_admin     boolean;
  v_proveedor_id       uuid;
  v_necesita_justif    boolean := false;
begin
  select * into v_lote from public.finanzas_lotes_pago where id = p_lote_id;
  if v_lote.id is null then
    raise exception 'LOTE_INEXISTENTE: el lote % no existe', p_lote_id;
  end if;
  if v_lote.estado <> 'programado' then
    raise exception 'LOTE_TRANSICION_INVALIDA: solo un lote programado puede aprobarse (estado '
      'actual: %)', v_lote.estado;
  end if;

  v_politica := public.fn_finanzas_politica_aprobacion_lote_vigente(v_lote.tenant_id);
  -- Sin política vigente o sin umbral definido, TODO lote exige administrador — el sistema no
  -- decide por nadie cuánto es "grande" (APENDICE_FIN.md).
  v_requiere_admin := v_politica.id is null or v_politica.monto_umbral is null
    or v_lote.monto_total > v_politica.monto_umbral;

  if v_requiere_admin then
    if not public.has_role(v_lote.tenant_id, array['administrador']::public.tenant_role_t[]) then
      raise exception 'FORBIDDEN: este lote supera el umbral de aprobación (o no hay umbral '
        'definido) — se requiere rol administrador';
    end if;
  elsif not public.has_role(v_lote.tenant_id, array['auxiliar']::public.tenant_role_t[]) then
    raise exception 'FORBIDDEN: se requiere membresía activa del tenant para aprobar un lote';
  end if;

  -- Validación no bloqueante: proveedor con habilitación vencida o próxima a vencer exige
  -- justificación explícita para aprobar de todos modos (§3.4).
  for v_proveedor_id in
    select distinct f.proveedor_id
    from public.finanzas_lote_items li
    join public.finanzas_facturas_proveedor f on f.id = li.factura_id
    where li.lote_id = p_lote_id
  loop
    if exists (
      select 1 from public.mant_habilitaciones_semaforo(v_proveedor_id) s where s.estado <> 'vigente'
    ) then
      v_necesita_justif := true;
    end if;
  end loop;

  if v_necesita_justif and (p_justificacion is null or btrim(p_justificacion) = '') then
    raise exception 'LOTE_APROBACION_SIN_JUSTIFICACION: al menos un proveedor del lote tiene una '
      'habilitación vencida o próxima a vencer — aprobar exige justificación explícita';
  end if;

  -- Umbral de asamblea / órgano competente (GOB-1 existe, pero no tiene atribución para esto —
  -- mismo hueco que FIN-2, ver cabecera de 20260931400000). Advertencia, nunca bloqueo.
  if v_politica.id is not null and v_politica.monto_umbral is not null
     and v_lote.monto_total > v_politica.monto_umbral then
    insert into public.finanzas_lote_advertencia (tenant_id, lote_id, codigo, mensaje)
    values (v_lote.tenant_id, p_lote_id, 'LOTE_APROBACION_ORGANO_INCOMPETENTE',
      format('Lote %s-%s por %s supera el umbral de aprobación (%s) — GOB-1 existe pero no '
             'tiene una atribución de ATRIBUCION_ORGANO para aprobación de lotes todavía, no se '
             'pudo verificar aprobación por órgano competente.',
             v_lote.anio, v_lote.numero, v_lote.monto_total, v_politica.monto_umbral));
  end if;

  perform set_config('aquila.aprobando_lote', 'true', true);
  update public.finanzas_lotes_pago
  set estado = 'aprobado', aprobado_por = auth.uid(), aprobado_at = now(),
      justificacion = p_justificacion
  where id = p_lote_id
  returning * into v_lote;
  perform set_config('aquila.aprobando_lote', 'false', true);

  return v_lote;
end;
$$;

comment on function public.fn_finanzas_aprobar_lote(uuid, text) is
  'FIN-3 §3.4: único camino a estado=aprobado. Administrador solo si supera el umbral vigente (o '
  'no hay umbral) — a diferencia de fn_finanzas_aprobar_factura (FIN-2), que siempre exige '
  'administrador sin importar el monto.';
