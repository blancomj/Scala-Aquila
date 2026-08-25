-- ═══════════════════════════════════════════════════════════════════════
--  PC-1 (ajuste) · Auxiliar (Nivel 5) pasa de 2 a 3 dígitos de numeración
--  propia — código total de 9 dígitos en vez de 8.
--
--  Motivo (decisión del usuario, 2026-08-24): 2 dígitos solo permiten 99
--  auxiliares por subcuenta — insuficiente en una copropiedad grande, donde
--  un auxiliar por inmueble o por proveedor puede superar esa cifra sin
--  esfuerzo. Se cambia ANTES de que exista ningún dato real en Nivel 5:
--  verificado por consulta contra dev, cero filas de 8 dígitos hoy en
--  `contable_plan_cuenta` ni en `contable_cuenta` — es una extensión
--  limpia del esquema, no una migración de datos.
--
--  Alcance: solo el nivel Auxiliar. Clase(1) > Grupo(2) > Cuenta(4) >
--  Subcuenta(6) siguen en los incrementos estándar del PUC colombiano
--  (prompt maestro §9) — no hay motivo para desviarse ahí.
-- ═══════════════════════════════════════════════════════════════════════

-- ── contable_cuenta: constraint + columna generada `nivel` ───────────────
alter table public.contable_cuenta drop constraint contable_cuenta_codigo_valido;
alter table public.contable_cuenta add constraint contable_cuenta_codigo_valido
  check (codigo ~ '^[0-9]+$' and length(codigo) in (1, 2, 4, 6, 9));

-- Las columnas generadas no admiten ALTER de su expresión: se recrean. Sin filas de 8 dígitos
-- hoy (verificado contra dev), no hay nada real que recalcular.
alter table public.contable_cuenta drop column nivel;
alter table public.contable_cuenta add column nivel smallint generated always as (
  case length(codigo) when 1 then 1 when 2 then 2 when 4 then 3 when 6 then 4 when 9 then 5 end
) stored;

comment on column public.contable_cuenta.nivel is
  'Clase(1) > Grupo(2) > Cuenta(4) > Subcuenta(6) > Auxiliar(9) — el Auxiliar usa 3 dígitos '
  'propios en vez de 2 (ajuste 2026-08-24): 99 auxiliares por subcuenta no alcanzaba para una '
  'copropiedad grande con un auxiliar por inmueble o por proveedor.';

-- ── contable_plan_cuenta: mismo ajuste, por si la plantilla global llega a tener Auxiliares ────
alter table public.contable_plan_cuenta drop constraint contable_plan_cuenta_codigo_valido;
alter table public.contable_plan_cuenta add constraint contable_plan_cuenta_codigo_valido
  check (codigo ~ '^[0-9]+$' and length(codigo) in (1, 2, 4, 6, 9));

alter table public.contable_plan_cuenta drop column nivel;
alter table public.contable_plan_cuenta add column nivel smallint generated always as (
  case length(codigo) when 1 then 1 when 2 then 2 when 4 then 3 when 6 then 4 when 9 then 5 end
) stored;

-- ── guard_contable_cuenta_arbol: el hijo debe extender el código del padre correcto ─────────────
create or replace function public.guard_contable_cuenta_arbol()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_parent public.contable_cuenta%rowtype;
  v_long_padre_esperada int;
begin
  if new.parent_id is null then
    if length(new.codigo) <> 1 then
      raise exception 'CUENTA_RAIZ_INVALIDA: % no es una clase (1 dígito) — solo las clases '
        'pueden ir sin cuenta padre', new.codigo;
    end if;
    return new;
  end if;

  select * into v_parent from public.contable_cuenta where id = new.parent_id;

  if v_parent.id is null then
    raise exception 'CUENTA_PADRE_INEXISTENTE: parent_id % no existe', new.parent_id;
  end if;

  if v_parent.tenant_id <> new.tenant_id then
    raise exception 'CUENTA_TENANT_INCONSISTENTE: la cuenta padre % pertenece a otro tenant',
      new.parent_id;
  end if;

  v_long_padre_esperada :=
    case length(new.codigo) when 2 then 1 when 4 then 2 when 6 then 4 when 9 then 6 end;

  if v_long_padre_esperada is null then
    raise exception 'CUENTA_LONGITUD_INVALIDA: el código % no corresponde a ningún nivel '
      '(1, 2, 4, 6 o 9 dígitos)', new.codigo;
  end if;

  if length(v_parent.codigo) <> v_long_padre_esperada then
    raise exception 'CUENTA_NIVEL_SALTADO: % (nivel %) no puede colgar de % (nivel %) — la '
      'jerarquía contable no admite saltos de nivel', new.codigo, new.nivel, v_parent.codigo,
      v_parent.nivel;
  end if;

  -- Invariante central del PUC: el código del hijo extiende el del padre. Con esto, clase y
  -- ancestría quedan garantizadas por construcción, sin necesidad de validarlas aparte.
  if left(new.codigo, length(v_parent.codigo)) <> v_parent.codigo then
    raise exception 'CUENTA_CODIGO_INCOHERENTE: % debe empezar por el código de su cuenta '
      'padre (%)', new.codigo, v_parent.codigo;
  end if;

  -- Una cuenta que gana subcuentas deja de recibir movimiento directo.
  if v_parent.permite_movimiento then
    update public.contable_cuenta set permite_movimiento = false where id = v_parent.id;
  end if;

  return new;
end;
$$;

-- ── fn_instanciar_plan_contable: parent lookup, por si la plantilla suma Auxiliares algún día ──
create or replace function public.fn_instanciar_plan_contable(
  p_tenant_id           uuid,
  p_incluir_opcionales  boolean default false,
  p_plan_codigo         text default 'PUC_PH_CO'
)
returns table (creadas integer, existentes integer)
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_plan_id   uuid;
  v_nivel     smallint;
  v_creadas   integer := 0;
  v_lote      integer;
  v_del_plan  integer;
begin
  select id into v_plan_id
  from public.contable_plan
  where codigo = p_plan_codigo and vigente;

  if v_plan_id is null then
    raise exception 'PLAN_CONTABLE_INEXISTENTE: no hay plantilla vigente con código %',
      p_plan_codigo;
  end if;

  if not exists (select 1 from public.tenants where id = p_tenant_id) then
    raise exception 'TENANT_INEXISTENTE: %', p_tenant_id;
  end if;

  for v_nivel in 1..5 loop
    insert into public.contable_cuenta (
      tenant_id, parent_id, plan_cuenta_id, codigo, nombre, naturaleza,
      permite_movimiento, requiere_tercero, requiere_centro_costo,
      requiere_fondo, requiere_inmueble
    )
    select
      p_tenant_id,
      padre.id,
      pc.id,
      pc.codigo,
      pc.nombre,
      pc.naturaleza,
      pc.permite_movimiento,
      pc.requiere_tercero,
      pc.requiere_centro_costo,
      pc.requiere_fondo,
      pc.requiere_inmueble
    from public.contable_plan_cuenta pc
    left join public.contable_cuenta padre
      on padre.tenant_id = p_tenant_id
     and padre.codigo = left(
           pc.codigo,
           case length(pc.codigo) when 2 then 1 when 4 then 2 when 6 then 4 when 9 then 6 end
         )
    where pc.plan_id = v_plan_id
      and pc.nivel = v_nivel
      and (p_incluir_opcionales or not pc.opcional)
    on conflict (tenant_id, codigo) do nothing;

    get diagnostics v_lote = row_count;
    v_creadas := v_creadas + v_lote;
  end loop;

  select count(*) into v_del_plan
  from public.contable_plan_cuenta
  where plan_id = v_plan_id and (p_incluir_opcionales or not opcional);

  return query select v_creadas, (v_del_plan - v_creadas)::integer;
end;
$$;
