-- ═══════════════════════════════════════════════════════════════════════
--  CO-2 · Núcleo del libro contable — consecutivo, contabilización,
--  reversión y guards de inmutabilidad/transición
--  (CO_02_nucleo_libro_contable.md §3.5-§3.7)
-- ═══════════════════════════════════════════════════════════════════════

-- ── 1. Consecutivo sin huecos ─────────────────────────────────────────────
-- insert ... on conflict do update ... returning serializa por fila (el UPDATE toma un lock de
-- fila): dos transacciones concurrentes para el mismo (tenant, año, tipo) nunca reciben el mismo
-- número. Deliberadamente sin `sequence` — una sequence deja huecos al abortar una transacción,
-- y aquí el hueco es un defecto legal (ET art. 774).
create function public.fn_contable_siguiente_numero(
  p_tenant_id uuid,
  p_anio      smallint,
  p_tipo_id   bigint
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_numero integer;
begin
  insert into public.contable_consecutivo (tenant_id, anio, tipo_id, ultimo_numero, updated_at)
  values (p_tenant_id, p_anio, p_tipo_id, 1, now())
  on conflict (tenant_id, anio, tipo_id)
  do update set ultimo_numero = public.contable_consecutivo.ultimo_numero + 1, updated_at = now()
  returning ultimo_numero into v_numero;

  return v_numero;
end;
$$;

comment on function public.fn_contable_siguiente_numero(uuid, smallint, bigint) is
  'CO-2: siguiente número consecutivo por (tenant, año, tipo de comprobante). SECURITY DEFINER '
  'porque contable_consecutivo no tiene política de escritura para authenticated — solo esta '
  'función escribe ahí. Llamarla dos veces para el mismo (tenant, año, tipo) nunca repite '
  'número, incluso con llamadas concurrentes (el UPDATE del ON CONFLICT toma el lock de fila).';

-- ── 2. Contabilizar ───────────────────────────────────────────────────────
create function public.fn_contabilizar_comprobante(p_comprobante_id uuid)
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

  v_numero := public.fn_contable_siguiente_numero(v_comp.tenant_id, v_periodo.anio, v_comp.tipo_id);

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

-- ── 3. Reversar ────────────────────────────────────────────────────────────
create function public.fn_reversar_comprobante(
  p_comprobante_id uuid,
  p_periodo_destino uuid,
  p_motivo text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_original      public.contable_comprobante%rowtype;
  v_tipo_ajuste_id bigint;
  v_periodo_anio  smallint;
  v_nuevo_id      uuid;
  v_detalle       record;
  v_linea         smallint := 1;
begin
  select * into v_original from public.contable_comprobante where id = p_comprobante_id;
  if v_original.id is null then
    raise exception 'COMPROBANTE_ESTADO_INVALIDO: % no existe', p_comprobante_id;
  end if;

  if not public.has_role(v_original.tenant_id, array['auxiliar']::public.tenant_role_t[]) then
    raise exception 'FORBIDDEN: se requiere rol auxiliar o administrador para reversar';
  end if;

  if v_original.estado <> 'contabilizado' then
    raise exception 'COMPROBANTE_ESTADO_INVALIDO: solo un comprobante contabilizado se reversa (%)',
      p_comprobante_id;
  end if;

  if v_original.reversado_por_id is not null then
    raise exception 'COMPROBANTE_YA_REVERSADO: % ya fue reversado por %',
      p_comprobante_id, v_original.reversado_por_id;
  end if;

  if coalesce(btrim(p_motivo), '') = '' then
    raise exception 'COMPROBANTE_MOTIVO_REQUERIDO: reversar % exige motivo', p_comprobante_id;
  end if;

  select id into v_tipo_ajuste_id from public.lista_tipos
  where tipo = 'TIPO_COMPROBANTE' and codigo = 'AJUSTE' and tenant_id is null;

  select anio into v_periodo_anio from public.periodos where id = p_periodo_destino;
  if v_periodo_anio is null then
    raise exception 'COMPROBANTE_ESTADO_INVALIDO: el periodo destino % no existe', p_periodo_destino;
  end if;

  insert into public.contable_comprobante (
    tenant_id, periodo_id, tipo_id, anio, fecha, descripcion,
    reversa_comprobante_id, creado_por
  ) values (
    v_original.tenant_id, p_periodo_destino, v_tipo_ajuste_id, v_periodo_anio, current_date,
    'Reversión del comprobante ' || coalesce(v_original.numero::text, v_original.id::text)
      || ' — ' || p_motivo,
    p_comprobante_id, (select auth.uid())
  )
  returning id into v_nuevo_id;

  for v_detalle in
    select * from public.contable_comprobante_detalle
    where comprobante_id = p_comprobante_id
    order by linea
  loop
    insert into public.contable_comprobante_detalle (
      tenant_id, comprobante_id, linea, cuenta_id, debito, credito, descripcion,
      tercero_id, inmueble_id, centro_costo_id, agrupacion_id, fondo_id, presupuesto_cuenta_id,
      origen_entidad, origen_id
    ) values (
      v_detalle.tenant_id, v_nuevo_id, v_linea, v_detalle.cuenta_id,
      v_detalle.credito, v_detalle.debito, -- lados intercambiados, nunca negativos
      v_detalle.descripcion,
      v_detalle.tercero_id, v_detalle.inmueble_id, v_detalle.centro_costo_id,
      v_detalle.agrupacion_id, v_detalle.fondo_id, v_detalle.presupuesto_cuenta_id,
      v_detalle.origen_entidad, v_detalle.origen_id
    );
    v_linea := v_linea + 1;
  end loop;

  perform public.fn_contabilizar_comprobante(v_nuevo_id);

  update public.contable_comprobante set reversado_por_id = v_nuevo_id
  where id = p_comprobante_id;

  return v_nuevo_id;
end;
$$;

comment on function public.fn_reversar_comprobante(uuid, uuid, text) is
  'CO-2: crea un comprobante tipo AJUSTE con las mismas líneas y los lados intercambiados, en '
  'el periodo destino, lo contabiliza (reutiliza fn_contabilizar_comprobante — mismas '
  'validaciones, incluida CONTABLE_PERIODO_CERRADO si el destino no admite asientos), y enlaza '
  'ambos por reversa_comprobante_id/reversado_por_id. No modifica el original de ninguna otra '
  'forma. SECURITY DEFINER con verificación interna de has_role.';

-- ── 4. Guard de transición e inmutabilidad del comprobante ────────────────
create function public.guard_contable_comprobante_transicion()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_periodo public.periodos%rowtype;
begin
  -- numero solo se asigna exactamente en la transición borrador -> contabilizado
  -- (fn_contabilizar_comprobante); cualquier otro intento de tocarlo es manual.
  if new.numero is distinct from old.numero
     and not (old.estado = 'borrador' and new.estado = 'contabilizado') then
    raise exception 'COMPROBANTE_NUMERO_NO_ASIGNABLE: numero no se asigna manualmente (comprobante %)',
      old.id;
  end if;

  -- un comprobante anulado es terminal.
  if old.estado = 'anulado' then
    raise exception 'INVALID_TRANSITION: el comprobante % ya está anulado', old.id;
  end if;

  -- transición a anulado: solo desde contabilizado, con motivo y periodo abierto.
  if new.estado = 'anulado' and old.estado <> 'anulado' then
    if old.estado <> 'contabilizado' then
      raise exception 'INVALID_TRANSITION: solo un comprobante contabilizado puede anularse '
        '(comprobante % viene de %)', old.id, old.estado;
    end if;
    if coalesce(btrim(new.anulado_motivo), '') = '' then
      raise exception 'COMPROBANTE_MOTIVO_REQUERIDO: anular % exige motivo', old.id;
    end if;
    select * into v_periodo from public.periodos where id = old.periodo_id;
    if v_periodo.contable_estado <> 'abierto' then
      raise exception 'CONTABLE_PERIODO_CERRADO: el periodo % ya no admite anulaciones',
        v_periodo.id;
    end if;
    new.anulado_por := (select auth.uid());
    new.anulado_at := now();
    return new;
  end if;

  -- un comprobante contabilizado es inmutable en sus campos sustantivos — salvo
  -- reversado_por_id (fn_reversar_comprobante) y la transición a anulado (ya resuelta arriba).
  if old.estado = 'contabilizado' and new.estado = 'contabilizado' then
    if new.descripcion is distinct from old.descripcion
       or new.fecha is distinct from old.fecha
       or new.tipo_id is distinct from old.tipo_id
       or new.periodo_id is distinct from old.periodo_id
       or new.numero is distinct from old.numero
       or new.anio is distinct from old.anio
    then
      raise exception 'COMPROBANTE_CONTABILIZADO_INMUTABLE: el comprobante % ya está contabilizado',
        old.id;
    end if;
  end if;

  return new;
end;
$$;

comment on function public.guard_contable_comprobante_transicion() is
  'CO-2 §3.6: borrador → contabilizado (vía fn_contabilizar_comprobante, único lugar que asigna '
  'numero) → anulado (terminal, exige motivo y periodo abierto). Un comprobante contabilizado '
  'es inmutable salvo reversado_por_id.';

create trigger guard_contable_comprobante_transicion
  before update on public.contable_comprobante
  for each row execute function public.guard_contable_comprobante_transicion();

-- ── 5. Guard de inmutabilidad del detalle ─────────────────────────────────
create function public.guard_contable_comprobante_detalle_inmutable()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_estado public.contable_comprobante_estado_t;
begin
  select estado into v_estado from public.contable_comprobante
  where id = coalesce(new.comprobante_id, old.comprobante_id);

  if v_estado is distinct from 'borrador' then
    raise exception 'COMPROBANTE_CONTABILIZADO_INMUTABLE: el comprobante % ya no admite cambios '
      'en su detalle', coalesce(new.comprobante_id, old.comprobante_id);
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

comment on function public.guard_contable_comprobante_detalle_inmutable() is
  'CO-2 §3.6: ninguna línea de un comprobante que ya dejó de ser borrador (contabilizado o '
  'anulado) admite insert/update/delete. fn_reversar_comprobante inserta las líneas del nuevo '
  'comprobante ANTES de contabilizarlo (todavía borrador en ese momento), así que no choca con '
  'este guard.';

create trigger guard_contable_comprobante_detalle_inmutable
  before insert or update or delete on public.contable_comprobante_detalle
  for each row execute function public.guard_contable_comprobante_detalle_inmutable();
