-- ═══════════════════════════════════════════════════════════════════════
--  CO-6 · fn_contabilizar_comprobante — excepción puntual para el comprobante CIERRE
--  (CO_06_cierre_apertura_correccion.md §3.4)
--
--  Conflicto detectado al diseñar fn_contable_cerrar_ejercicio: el corte exige "los 12 periodos
--  del ejercicio cerrados" (contable_estado='cerrado') ANTES de construir el comprobante CIERRE,
--  y dice que ese comprobante "se contabiliza por la vía normal (fn_contabilizar_comprobante),
--  así que hereda todas las validaciones" (§3.4). Pero fn_contabilizar_comprobante (CO-2) exige
--  periodo.contable_estado = 'abierto' — y el periodo de diciembre, donde cae la fecha del
--  comprobante CIERRE (último día del ejercicio), YA está 'cerrado' en ese momento por la
--  precondición del propio §3.4. Sin este ajuste, fn_contable_cerrar_ejercicio nunca podría
--  contabilizar su propio comprobante de cierre.
--
--  Esto NO es relajar el guard para el caso general (MARCO §9.2 prohíbe relajar un guard
--  existente): un comprobante ordinario (INGRESO/EGRESO/CAUSACION/AJUSTE/...) sigue rechazado
--  exactamente igual que antes en un periodo 'cerrado' o 'bloqueado' — la prueba obligatoria #4
--  del corte ("Cerrado el periodo, contabilizar en él → CONTABLE_PERIODO_CERRADO") lo exige y
--  sigue cumpliéndose. La única cuenta añadida es: `contable_estado = 'cerrado'` (nunca
--  'bloqueado') Y el tipo del comprobante es exactamente 'CIERRE' (TIPO_COMPROBANTE, de sistema,
--  solo lo genera fn_contable_cerrar_ejercicio) — el asiento que sella contablemente el ejercicio
--  se contabiliza en el instante mismo del cierre, dato el mismo día que cierra, antes de que los
--  12 periodos pasen a 'bloqueado'. Es el mismo patrón contable real: el asiento de cierre no es
--  "una operación más" que el periodo admite, es parte del acto de cerrar.
--
--  APERTURA no necesita esta excepción: se contabiliza en enero del ejercicio NUEVO, que
--  fn_contable_abrir_ejercicio crea/dejará en 'abierto' antes de contabilizar (§3.5).
-- ═══════════════════════════════════════════════════════════════════════

create or replace function public.fn_contabilizar_comprobante(p_comprobante_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_comp     public.contable_comprobante%rowtype;
  v_periodo  public.periodos%rowtype;
  v_cuenta   public.contable_cuenta%rowtype;
  v_detalle  record;
  v_lineas   integer;
  v_debito   numeric(18,2);
  v_credito  numeric(18,2);
  v_numero   integer;
  v_ultimo_dia_mes date;
  v_tipo_codigo text;
begin
  select * into v_comp from public.contable_comprobante where id = p_comprobante_id;
  if v_comp.id is null or v_comp.estado <> 'borrador' then
    raise exception 'COMPROBANTE_ESTADO_INVALIDO: % no existe o no está en borrador',
      p_comprobante_id;
  end if;

  if not public.has_role(v_comp.tenant_id, array['auxiliar']::public.tenant_role_t[]) then
    raise exception 'FORBIDDEN: se requiere rol auxiliar o administrador para contabilizar';
  end if;

  select count(*), coalesce(sum(debito), 0), coalesce(sum(credito), 0)
    into v_lineas, v_debito, v_credito
  from public.contable_comprobante_detalle
  where comprobante_id = p_comprobante_id;

  if v_lineas < 2 then
    raise exception 'COMPROBANTE_SIN_DETALLE: % tiene menos de dos líneas', p_comprobante_id;
  end if;

  if v_debito <> v_credito or v_debito = 0 then
    raise exception 'COMPROBANTE_DESCUADRADO: débito % ≠ crédito % (comprobante %)',
      v_debito, v_credito, p_comprobante_id;
  end if;

  select * into v_periodo from public.periodos where id = v_comp.periodo_id;
  select lt.codigo into v_tipo_codigo from public.lista_tipos lt where lt.id = v_comp.tipo_id;

  -- CO-6 §3.4: única excepción — el comprobante CIERRE se contabiliza en el periodo de
  -- diciembre exactamente cuando ese periodo ya está 'cerrado' (precondición del propio cierre
  -- de ejercicio). Cualquier otro tipo de comprobante sigue exigiendo 'abierto'.
  if v_periodo.contable_estado <> 'abierto'
     and not (v_periodo.contable_estado = 'cerrado' and v_tipo_codigo = 'CIERRE') then
    raise exception 'CONTABLE_PERIODO_CERRADO: el periodo % no admite asientos', v_periodo.id;
  end if;

  v_ultimo_dia_mes := (make_date(v_periodo.anio, v_periodo.mes, 1) + interval '1 month'
    - interval '1 day')::date;
  if v_comp.fecha < make_date(v_periodo.anio, v_periodo.mes, 1)
     or v_comp.fecha > v_ultimo_dia_mes then
    raise exception 'COMPROBANTE_FECHA_FUERA_DE_PERIODO: % no cae dentro de %/%',
      v_comp.fecha, v_periodo.anio, v_periodo.mes;
  end if;

  for v_detalle in
    select * from public.contable_comprobante_detalle where comprobante_id = p_comprobante_id
  loop
    v_cuenta := public.validar_cuenta_contable_destino(v_detalle.cuenta_id, v_comp.tenant_id);

    if v_cuenta.requiere_tercero and v_detalle.tercero_id is null then
      raise exception 'COMPROBANTE_DIMENSION_REQUERIDA: línea % exige tercero (cuenta %)',
        v_detalle.linea, v_cuenta.codigo;
    end if;
    if v_cuenta.requiere_centro_costo and v_detalle.centro_costo_id is null then
      raise exception 'COMPROBANTE_DIMENSION_REQUERIDA: línea % exige centro de costo (cuenta %)',
        v_detalle.linea, v_cuenta.codigo;
    end if;
    if v_cuenta.requiere_fondo and v_detalle.fondo_id is null then
      raise exception 'COMPROBANTE_DIMENSION_REQUERIDA: línea % exige fondo (cuenta %)',
        v_detalle.linea, v_cuenta.codigo;
    end if;
    if v_cuenta.requiere_inmueble and v_detalle.inmueble_id is null then
      raise exception 'COMPROBANTE_DIMENSION_REQUERIDA: línea % exige inmueble (cuenta %)',
        v_detalle.linea, v_cuenta.codigo;
    end if;
  end loop;

  v_numero := public.fn_contable_siguiente_numero(
    v_comp.tenant_id, v_periodo.anio::smallint, v_comp.tipo_id
  );

  update public.contable_comprobante
  set estado = 'contabilizado', numero = v_numero, anio = v_periodo.anio,
      contabilizado_at = now()
  where id = p_comprobante_id;

  return p_comprobante_id;
end;
$$;

comment on function public.fn_contabilizar_comprobante(uuid) is
  'CO-2/CO-6: valida cuadre, periodo abierto (salvo el comprobante CIERRE de CO-6, que se '
  'contabiliza en el periodo de diciembre ya cerrado — ver comentario de la migración '
  '20260930540000), fecha dentro del periodo y dimensiones requeridas por cada cuenta; solo '
  'entonces asigna número (fn_contable_siguiente_numero) y marca contabilizado. SECURITY '
  'DEFINER con verificación interna de has_role (§3.8) — RLS por sí sola no permite a un cliente '
  'llevar un comprobante a ''contabilizado''.';
