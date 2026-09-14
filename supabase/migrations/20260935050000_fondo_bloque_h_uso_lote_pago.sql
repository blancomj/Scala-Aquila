-- ═══════════════════════════════════════════════════════════════════════
--  Dominio Fondos — BLOQUE H: uso de fondo al ejecutar un lote de pago
--  (`ANALISIS_FONDOS_BLOQUE_A.md` §6/§11 punto 4, D-98/sesión 78da96cd).
--
--  QUÉ RESUELVE. FIN-3 (20260931240000) ya dejó `finanzas_lotes_pago.fondo_id`
--  (opcional: el lote paga contra un fondo específico, p. ej. imprevistos, en
--  vez de la operación general de la cuenta) pero `fn_finanzas_ejecutar_lote`
--  nunca lo usó — ejecutar un lote con fondo_id no movía el fondo. Bloque H
--  estaba marcado como bloqueado por dominio inexistente (no había CxP/pagos
--  salientes); FIN-2/FIN-3 ya lo construyeron, así que esto ya es ejecutable.
--
--  MISMO PATRÓN QUE `aporte`/`pago_id` (BLOQUE K, D-42), NO UNA BANDERA DE
--  SESIÓN. `lote_pago_id` es una columna de origen real y consultable (como
--  `pago_id`), no una exención — así el histórico de un fondo puede
--  reconstruir qué lote de pago generó cada `uso` sin depender de que la
--  bandera haya estado activa en el momento exacto del insert.
--
--  MONTO POR LOTE, NO POR ÍTEM. `fondo_id` vive en la cabecera del lote —
--  todos sus ítems, por construcción, pagan contra el mismo fondo (o ninguno)
--  — así que un solo movimiento por `monto_total` del lote es correcto y
--  evita N movimientos que habría que sumar para reconciliar contra el lote.
--
--  SIN COMPROMISO/AUTORIZACIÓN PREVIA. Igual que el aporte automático de
--  BLOQUE K no exige una `fondo_autorizacion` previa, este `uso` tampoco —
--  `compromiso_id`/`autorizacion_id` siguen siendo nullable y opcionales para
--  cualquier `uso`, manual o automático. Si el fondo queda en negativo, lo
--  refleja `fn_fondo_saldo_derivado` como cualquier otro movimiento; no hay
--  guardia adicional aquí porque el modelo no cerró una en el corte original
--  (no inventar una regla nueva — D-98 y esta migración solo conectan lo que
--  ya existía).
-- ═══════════════════════════════════════════════════════════════════════

-- ── 1. Origen del movimiento: qué lote de pago lo ejecutó ───────────────
alter table public.fondo_movimientos
  add column lote_pago_id uuid references public.finanzas_lotes_pago (id);

comment on column public.fondo_movimientos.lote_pago_id is
  'Lote de pago (FIN-3) que ejecutó este uso — el lado saliente, simétrico a pago_id (BLOQUE K, '
  'lado entrante). Automático: lo escribe fn_finanzas_ejecutar_lote, nunca un INSERT manual del '
  'cliente (BLOQUE H, D-98).';

create index fondo_movimientos_lote_pago_idx on public.fondo_movimientos (lote_pago_id)
  where lote_pago_id is not null;

-- ── 2. guard_fondo_movimiento: valida lote_pago_id y admite `uso` dual ──
-- Reproducción íntegra de 20260930140000 (última versión) + el chequeo
-- referencial de lote_pago_id + `uso` pasa a exigir documento_id (manual) O
-- lote_pago_id (automático), mismo patrón que aporte con pago_id/documento_id.
create or replace function public.guard_fondo_movimiento()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_fondo public.fondos;
  v_original public.fondo_movimientos;
begin
  select * into v_fondo from public.fondos where id = new.fondo_id;

  if v_fondo.id is null then
    raise exception 'FONDO_NO_ENCONTRADO: % no existe', new.fondo_id;
  end if;

  if v_fondo.tenant_id <> new.tenant_id then
    raise exception 'FONDO_TENANT_INCONSISTENTE: el fondo % pertenece a otro tenant', new.fondo_id;
  end if;

  if v_fondo.estado in ('propuesto', 'pendiente_autorizacion', 'cerrado', 'cancelado')
     or (v_fondo.estado = 'en_cierre' and new.tipo <> 'cierre_remanente') then
    raise exception 'FONDO_ESTADO_NO_ADMITE_MOVIMIENTOS: el fondo % está % y no admite un '
      'movimiento de tipo %', v_fondo.codigo, v_fondo.estado, new.tipo;
  end if;

  if new.tipo in ('ajuste', 'reversion')
     and (new.motivo is null or btrim(new.motivo) = '') then
    raise exception 'FONDO_MOTIVO_REQUERIDO: un movimiento de tipo % exige motivo', new.tipo;
  end if;

  if new.tipo = 'reversion' then
    if new.reversion_de_id is null then
      raise exception 'FONDO_REVERSION_INVALIDA: una reversión debe indicar qué movimiento '
        'corrige (reversion_de_id)';
    end if;

    select * into v_original
      from public.fondo_movimientos where id = new.reversion_de_id;

    if v_original.id is null or v_original.fondo_id <> new.fondo_id then
      raise exception 'FONDO_REVERSION_INVALIDA: el movimiento % no existe o no es de este fondo',
        new.reversion_de_id;
    end if;

    if v_original.tipo = 'reversion' then
      raise exception 'FONDO_REVERSION_INVALIDA: una reversión no se revierte — corrige con un '
        'movimiento nuevo';
    end if;

    if new.monto is distinct from
       -public.fn_fondo_movimiento_efecto(v_original.tipo, v_original.monto) then
      raise exception 'FONDO_REVERSION_INVALIDA: una reversión debe valer % (lo contrario del '
        'movimiento que corrige), se recibió %',
        -public.fn_fondo_movimiento_efecto(v_original.tipo, v_original.monto), new.monto;
    end if;
  elsif new.reversion_de_id is not null then
    raise exception 'FONDO_REVERSION_INVALIDA: reversion_de_id solo aplica a un movimiento de '
      'tipo reversion';
  end if;

  if new.documento_id is not null and not exists (
    select 1 from public.documentos d
     where d.id = new.documento_id and d.tenant_id = new.tenant_id
  ) then
    raise exception 'DOCUMENTO_INVALIDO: % no pertenece al tenant %',
      new.documento_id, new.tenant_id;
  end if;

  if new.pago_id is not null and not exists (
    select 1 from public.pagos p where p.id = new.pago_id and p.tenant_id = new.tenant_id
  ) then
    raise exception 'PAGO_INVALIDO: % no pertenece al tenant %', new.pago_id, new.tenant_id;
  end if;

  if new.extracto_linea_id is not null and not exists (
    select 1 from public.extracto_linea el
     where el.id = new.extracto_linea_id and el.tenant_id = new.tenant_id
  ) then
    raise exception 'EXTRACTO_LINEA_INVALIDA: % no pertenece al tenant %',
      new.extracto_linea_id, new.tenant_id;
  end if;

  if new.compromiso_id is not null and not exists (
    select 1 from public.fondo_compromisos fc
     where fc.id = new.compromiso_id and fc.fondo_id = new.fondo_id
  ) then
    raise exception 'COMPROMISO_INVALIDO: % no es un compromiso de este fondo', new.compromiso_id;
  end if;

  if new.autorizacion_id is not null and not exists (
    select 1 from public.fondo_autorizaciones fa
     where fa.id = new.autorizacion_id and fa.fondo_id = new.fondo_id
  ) then
    raise exception 'AUTORIZACION_INVALIDA: % no es una autorización de este fondo',
      new.autorizacion_id;
  end if;

  if new.lote_pago_id is not null and not exists (
    select 1 from public.finanzas_lotes_pago l
     where l.id = new.lote_pago_id and l.tenant_id = new.tenant_id
  ) then
    raise exception 'LOTE_PAGO_INVALIDO: % no pertenece al tenant %',
      new.lote_pago_id, new.tenant_id;
  end if;

  -- Modelo §36 "sin soportes faltantes" (D-42) — diferenciado, no uniforme.
  -- La bandera solo la activa fn_fondo_cerrar, dentro de su propia
  -- transacción atómica, para los dos movimientos que genera (cierre_
  -- remanente y, si el destino es traslado, el traslado_entrada en el
  -- fondo destino) — su respaldo real es fondo_remanentes, no un documento.
  if current_setting('aquila.fondo_cierre_movimiento', true) is distinct from 'true' then
    if new.tipo = 'aporte' and new.pago_id is null and new.documento_id is null then
      raise exception 'FONDO_SOPORTE_REQUERIDO: un aporte manual exige documento_id — uno '
        'automático por recaudo (BLOQUE K) queda respaldado por pago_id';
    elsif new.tipo = 'uso' and new.documento_id is null and new.lote_pago_id is null then
      raise exception 'FONDO_SOPORTE_REQUERIDO: un uso manual exige documento_id — uno '
        'automático por ejecución de lote de pago (BLOQUE H) queda respaldado por lote_pago_id';
    elsif new.tipo in ('rendimiento', 'ajuste', 'traslado_entrada', 'traslado_salida')
          and new.documento_id is null then
      raise exception 'FONDO_SOPORTE_REQUERIDO: un movimiento de tipo % exige documento_id '
        '(Modelo §36)', new.tipo;
    end if;
  end if;

  new.registrado_por := coalesce(new.registrado_por, (select auth.uid()));

  return new;
end;
$$;

comment on function public.guard_fondo_movimiento() is
  'Coherencia del movimiento (fondo/tenant/estado/reversión/orígenes) + soporte documental '
  'diferenciado por tipo (D-42/BLOQUE H): automático (pago_id / lote_pago_id) vs manual '
  '(documento_id), nunca uniforme. La bandera aquila.fondo_cierre_movimiento exime lo que '
  'fn_fondo_cerrar genera.';

-- ── 3. fn_finanzas_ejecutar_lote: mueve el fondo cuando el lote tiene uno ─
-- Reproducción íntegra de 20260931280000 + un insert en fondo_movimientos
-- (tipo 'uso', lote_pago_id = el propio lote) cuando v_lote.fondo_id no es
-- nulo, después de procesar todos los ítems y antes de marcar el lote
-- ejecutado — mismo alcance transaccional que el resto de la función.
create or replace function public.fn_finanzas_ejecutar_lote(p_lote_id uuid, p_fecha_ejecucion date default current_date)
returns public.finanzas_lotes_pago
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_lote        public.finanzas_lotes_pago;
  v_item        record;
  v_periodo_id  uuid;
  v_ejec        public.presupuesto_ejecucion;
  v_estado_factura public.factura_estado_t;
begin
  select * into v_lote from public.finanzas_lotes_pago where id = p_lote_id;
  if v_lote.id is null then
    raise exception 'LOTE_INEXISTENTE: el lote % no existe', p_lote_id;
  end if;
  if not public.has_role(v_lote.tenant_id, array['administrador']::public.tenant_role_t[]) then
    raise exception 'FORBIDDEN: se requiere rol administrador para ejecutar un lote';
  end if;
  if v_lote.estado <> 'aprobado' then
    raise exception 'LOTE_TRANSICION_INVALIDA: solo un lote aprobado puede ejecutarse (estado '
      'actual: %)', v_lote.estado;
  end if;

  select id into v_periodo_id from public.periodos
    where tenant_id = v_lote.tenant_id
      and anio = extract(year from p_fecha_ejecucion)
      and mes = extract(month from p_fecha_ejecucion);
  if v_periodo_id is null then
    raise exception 'PERIODO_INEXISTENTE: no existe un periodo % - % para la fecha de ejecución '
      'del lote %', extract(year from p_fecha_ejecucion), extract(month from p_fecha_ejecucion),
      p_lote_id;
  end if;

  for v_item in
    select li.id, li.factura_id, li.monto_a_pagar, li.es_pago_parcial, li.compromiso_bancario_id,
           f.numero_documento, f.presupuesto_ejecucion_id as factura_ejecucion_id
    from public.finanzas_lote_items li
    join public.finanzas_facturas_proveedor f on f.id = li.factura_id
    where li.lote_id = p_lote_id
  loop
    select * into v_ejec from public.presupuesto_ejecucion where id = v_item.factura_ejecucion_id;

    update public.finanzas_cuenta_bancaria_compromiso
      set estado = 'ejecutado'
      where id = v_item.compromiso_bancario_id;

    -- El HECHO económico que APENDICE_FIN.md exige — nunca un comprobante contable aquí. Copia
    -- cuenta/centro de costo/contrato/agrupación/activo de la ejecución 'por_pagar' ya creada al
    -- aprobar la factura (FIN-2), para que causación y pago queden sobre el mismo rubro.
    insert into public.presupuesto_ejecucion (
      tenant_id, cuenta_id, periodo_id, monto, liquidacion, tercero_id, contrato_id,
      centro_costo_id, cuenta_bancaria_id, agrupacion_id, activo_id, fecha_documento,
      descripcion, referencia
    ) values (
      v_lote.tenant_id, v_ejec.cuenta_id, v_periodo_id, v_item.monto_a_pagar, 'pagado_banco',
      v_ejec.tercero_id, v_ejec.contrato_id, v_ejec.centro_costo_id, v_lote.cuenta_bancaria_id,
      v_ejec.agrupacion_id, v_ejec.activo_id, p_fecha_ejecucion,
      format('Pago factura %s — lote %s-%s', v_item.numero_documento, v_lote.anio, v_lote.numero),
      v_item.numero_documento
    );

    -- es_pago_parcial ya fue validado por guard_finanzas_lote_item contra el pendiente REAL al
    -- crear el ítem — no hace falta recalcular aquí, ningún otro lote pudo tocar la misma
    -- factura mientras estuvo 'programada' (LOTE_ITEM_FACTURA_YA_PROGRAMADA lo impide).
    v_estado_factura := case when v_item.es_pago_parcial then 'pagada_parcial' else 'pagada' end;
    update public.finanzas_facturas_proveedor set estado = v_estado_factura where id = v_item.factura_id;
  end loop;

  -- BLOQUE H: si el lote paga contra un fondo específico (fondo_id, FIN-3), registra el uso —
  -- un solo movimiento por el monto_total del lote (todos sus ítems pagan contra el mismo fondo
  -- por construcción, ver fondo_id en 20260931240000). lote_pago_id es el respaldo automático,
  -- mismo patrón que pago_id para un aporte (BLOQUE K).
  if v_lote.fondo_id is not null then
    insert into public.fondo_movimientos (
      tenant_id, fondo_id, tipo, monto, fecha, lote_pago_id, descripcion
    ) values (
      v_lote.tenant_id, v_lote.fondo_id, 'uso', v_lote.monto_total, p_fecha_ejecucion, p_lote_id,
      format('Ejecución lote de pago %s-%s', v_lote.anio, v_lote.numero)
    );
  end if;

  perform set_config('aquila.ejecutando_lote', 'true', true);
  update public.finanzas_lotes_pago
  set estado = 'ejecutado', ejecutado_por = auth.uid(), ejecutado_at = now(),
      fecha_ejecucion = p_fecha_ejecucion
  where id = p_lote_id
  returning * into v_lote;
  perform set_config('aquila.ejecutando_lote', 'false', true);

  return v_lote;
end;
$$;

comment on function public.fn_finanzas_ejecutar_lote(uuid, date) is
  'FIN-3 §3.5 + BLOQUE H: único camino a estado=ejecutado. Por cada ítem: compromiso→ejecutado, '
  'una fila de presupuesto_ejecucion con liquidacion=pagado_banco, y la factura a pagada/pagada_'
  'parcial. Si el lote tiene fondo_id, un movimiento fondo_movimientos tipo uso por monto_total '
  '(lote_pago_id como respaldo). Cero comprobantes contables — CO-3 los materializa en su '
  'siguiente corrida (criterio de aceptación del corte).';
