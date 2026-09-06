-- ═══════════════════════════════════════════════════════════════════════
--  CO-2 · Corrección — fn_contabilizar_comprobante llamaba a
--  fn_contable_siguiente_numero con periodos.anio (int) donde la función
--  espera smallint. `supabase db lint` lo detectó tras aplicar
--  20260930210000: "function public.fn_contable_siguiente_numero(uuid,
--  integer, bigint) does not exist" — la resolución de sobrecarga de
--  PL/pgSQL para llamadas a función no hace el downcast implícito que sí
--  hace una asignación directa (`select ... into`). Mismo corte (CO-2),
--  corrige antes de cerrarlo — no se edita 20260930210000 para no reescribir
--  historial ya aplicado.
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
  if v_periodo.contable_estado <> 'abierto' then
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
  'CO-2: valida cuadre, periodo abierto, fecha dentro del periodo y dimensiones requeridas por '
  'cada cuenta; solo entonces asigna número (fn_contable_siguiente_numero) y marca '
  'contabilizado. SECURITY DEFINER con verificación interna de has_role (§3.8) — RLS por sí '
  'sola no permite a un cliente llevar un comprobante a ''contabilizado''.';
