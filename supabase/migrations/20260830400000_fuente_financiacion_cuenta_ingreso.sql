-- ═══════════════════════════════════════════════════════════════════════
--  fuente_financiacion.presupuesto_cuenta_id — vínculo opcional hacia la
--  cuenta de Ingresos del Plan de cuentas que la fuente representa.
--
--  Investigación (sesión de usuario + INCP/Ley 675 art. 35/38): "otros_
--  ingresos" y "cuota_extraordinaria" SÍ son ingreso real (se reconocen en
--  el estado de resultados al cobrarse) — deberían poder aparecer también
--  como cuenta en Plan de cuentas. "fondo_imprevistos" NO es ingreso: es
--  usar un activo restringido que ya existe (efectivo restringido, INCP),
--  así que nunca debería exigirse un vínculo para ese tipo — el guard de
--  abajo no lo bloquea, solo lo permite si alguien lo vincula igual.
--
--  Nullable a propósito: no se fuerza el vínculo (fuente_financiacion y
--  presupuesto_cuenta siguen siendo dos modelos distintos, 20260814200000
--  ya decidió no fusionarlos) — esta columna solo habilita que la UI pueda
--  avisar cuando falta, en vez de dejarlo desincronizado en silencio.
-- ═══════════════════════════════════════════════════════════════════════

alter table public.fuente_financiacion
  add column presupuesto_cuenta_id uuid references public.presupuesto_cuenta (id);

create index fuente_financiacion_presupuesto_cuenta_idx
  on public.fuente_financiacion (presupuesto_cuenta_id);

comment on column public.fuente_financiacion.presupuesto_cuenta_id is
  'Cuenta de Ingresos (presupuesto_cuenta) que esta fuente representa — opcional, para que la '
  'UI pueda avisar cuando un ingreso real (otros_ingresos/cuota_extraordinaria) no tiene cuenta '
  'asociada en Plan de cuentas, o viceversa. fondo_imprevistos no es ingreso (INCP: efectivo '
  'restringido) y por eso nunca lo exige.';

-- ── guard_fuente_financiacion: valida que el vínculo (si existe) sea una cuenta de Ingresos
-- del mismo tenant — mismo criterio de validación que ya aplica a tipo_id. ────────────────────
create or replace function public.guard_fuente_financiacion()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_estado public.presupuesto_estado_t;
  v_saldo_fondo numeric(18, 2);
  v_tipo_familia text;
  v_tipo_tenant uuid;
  v_tipo_codigo text;
  v_cuenta_tenant uuid;
  v_cuenta_naturaleza text;
begin
  select estado into v_estado
    from public.presupuestos
   where id = new.presupuesto_id;

  if v_estado in ('vigente', 'cerrado') then
    raise exception 'IMMUTABLE_BUDGET: el presupuesto % es inmutable en estado % '
      '— corrige creando una versión nueva (16 §111)', new.presupuesto_id, v_estado;
  end if;

  select tipo, tenant_id, codigo into v_tipo_familia, v_tipo_tenant, v_tipo_codigo
    from public.lista_tipos where id = new.tipo_id;

  if v_tipo_familia is null then
    raise exception 'TIPO_FUENTE_INEXISTENTE: tipo_id % no existe', new.tipo_id;
  end if;

  if v_tipo_familia is distinct from 'TIPO_FUENTE_FINANCIACION' then
    raise exception 'TIPO_FUENTE_INVALIDO: tipo_id % no pertenece a TIPO_FUENTE_FINANCIACION '
      '(es %)', new.tipo_id, v_tipo_familia;
  end if;

  if v_tipo_tenant is not null and v_tipo_tenant <> new.tenant_id then
    raise exception 'TIPO_FUENTE_TENANT_INCONSISTENTE: tipo_id % pertenece a otro tenant',
      new.tipo_id;
  end if;

  if v_tipo_codigo = 'fondo_imprevistos' then
    select saldo_actual into v_saldo_fondo
      from public.fondos
     where tenant_id = new.tenant_id
       and tipo = 'imprevistos';

    if v_saldo_fondo is null then
      raise exception 'FONDO_IMPREVISTOS_NO_EXISTE: el tenant % no tiene fondo de imprevistos '
        'configurado', new.tenant_id;
    end if;

    if new.valor_disponible > v_saldo_fondo then
      raise exception 'FONDO_INSUFICIENTE: valor_disponible (%) excede el saldo actual del '
        'fondo de imprevistos (%) — FI-003', new.valor_disponible, v_saldo_fondo;
    end if;
  end if;

  if new.presupuesto_cuenta_id is not null then
    select tenant_id, naturaleza into v_cuenta_tenant, v_cuenta_naturaleza
      from public.presupuesto_cuenta where id = new.presupuesto_cuenta_id;

    if v_cuenta_tenant is null then
      raise exception 'CUENTA_INEXISTENTE: presupuesto_cuenta_id % no existe',
        new.presupuesto_cuenta_id;
    end if;

    if v_cuenta_tenant <> new.tenant_id then
      raise exception 'CUENTA_TENANT_INCONSISTENTE: presupuesto_cuenta_id % pertenece a otro '
        'tenant', new.presupuesto_cuenta_id;
    end if;

    if v_cuenta_naturaleza <> 'ingreso' then
      raise exception 'CUENTA_NATURALEZA_INVALIDA: presupuesto_cuenta_id % no es una cuenta de '
        'Ingresos', new.presupuesto_cuenta_id;
    end if;
  end if;

  return new;
end;
$$;

-- ── fn_registrar_fuente_financiacion: agrega p_presupuesto_cuenta_id opcional ───────────────
drop function public.fn_registrar_fuente_financiacion(uuid, bigint, numeric, numeric, text, bigint);

create function public.fn_registrar_fuente_financiacion(
  p_presupuesto_id uuid,
  p_tipo_id bigint,
  p_valor_disponible numeric,
  p_valor_aplicado numeric default 0,
  p_descripcion text default null,
  p_fundamento_normativo_id bigint default null,
  p_presupuesto_cuenta_id uuid default null
)
returns public.fuente_financiacion
language plpgsql
set search_path = ''
as $$
declare
  v_tenant_id uuid;
  v_fuente public.fuente_financiacion;
begin
  select tenant_id into v_tenant_id
    from public.presupuestos
   where id = p_presupuesto_id;

  if v_tenant_id is null then
    raise exception 'PRESUPUESTO_NO_ENCONTRADO: % no existe o no es accesible', p_presupuesto_id;
  end if;

  insert into public.fuente_financiacion (
    tenant_id, presupuesto_id, tipo_id, valor_disponible, valor_aplicado,
    descripcion, fundamento_normativo_id, presupuesto_cuenta_id
  )
  values (
    v_tenant_id, p_presupuesto_id, p_tipo_id, p_valor_disponible, p_valor_aplicado,
    p_descripcion, p_fundamento_normativo_id, p_presupuesto_cuenta_id
  )
  returning * into v_fuente;

  return v_fuente;
end;
$$;

revoke execute on function public.fn_registrar_fuente_financiacion(
  uuid, bigint, numeric, numeric, text, bigint, uuid
) from public, anon;

grant execute on function public.fn_registrar_fuente_financiacion(
  uuid, bigint, numeric, numeric, text, bigint, uuid
) to authenticated;
