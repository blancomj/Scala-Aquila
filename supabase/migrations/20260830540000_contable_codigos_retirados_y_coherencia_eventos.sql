-- ═══════════════════════════════════════════════════════════════════════
--  PC-9 · Carril C, hasta donde le corresponde a la ingeniería: hacer
--  cumplir en el motor la doctrina ya validada, no volver a decidirla
--
--  Auditando el diseño con ojo escéptico antes de entregarlo al Carril C
--  humano (PC-08), se probaron dos ataques contra la propia base de datos
--  y ambos pasaron cuando no debían:
--
--    1. Con rol `auxiliar` (el mismo que edita el plan de cuentas), se
--       pudo recrear a mano el grupo "27" (fondos con destinación
--       específica, pasivo) colgándolo de la clase "2" — el mismo grupo
--       que PC-7 retiró de la plantilla por doctrina del CTCP (0146/2025,
--       0330/2025: el fondo NO es pasivo). El guard del árbol valida
--       jerarquía y coherencia de código, pero no sabe que ese código en
--       particular fue retirado a propósito.
--    2. `contable_cuenta_default` aceptó mapear el evento
--       INGRESO_CUOTA_ORDINARIA (debería acreditar una cuenta de la clase
--       4) contra 5105 Honorarios de administración (clase 5, un gasto).
--       validar_cuenta_contable_destino() comprueba existencia, tenant,
--       movimiento y actividad — nunca la coherencia de clase con el
--       evento, a diferencia del guard que sí existe sobre
--       presupuesto_cuenta.contable_cuenta_id.
--
--  Ninguna de las dos correcciones decide nada contable nuevo: la clase
--  correcta de cada evento ya estaba implícita en su propio nombre desde
--  que se sembró en PC-3, y los códigos retirados ya estaban documentados
--  en PC-7. Esto es cerrar la brecha entre "está documentado" y "el motor
--  lo impide" — el trabajo que sí le corresponde a la ingeniería antes de
--  pasarle el dossier a un contador, para que revise criterio y no tenga
--  que además descubrir agujeros de aplicación.
-- ═══════════════════════════════════════════════════════════════════════

-- ═══════════════════════════════════════════════════════════════════════
--  1. Códigos retirados de la plantilla — no reinstanciables por tenant
-- ═══════════════════════════════════════════════════════════════════════

create table public.contable_codigo_retirado (
  plan_id               uuid not null references public.contable_plan (id) on delete cascade,
  codigo                text not null,
  motivo                text not null,
  fundamento_normativo_id bigint references public.fundamento_normativo (id),
  created_at            timestamptz not null default now(),
  primary key (plan_id, codigo)
);

comment on table public.contable_codigo_retirado is
  'Códigos que existieron en una versión anterior de la plantilla y se retiraron por doctrina '
  '(PC-9), no por reordenamiento cosmético — a diferencia de un simple rename, estos no deben '
  'poder reaparecer en el plan de ningún tenant, ni siquiera creados a mano por el rol auxiliar. '
  'guard_contable_codigo_no_retirado rechaza cualquier código cuyo prefijo coincida con uno de '
  'esta lista.';

insert into public.contable_codigo_retirado (plan_id, codigo, motivo, fundamento_normativo_id)
select p.id, v.codigo, v.motivo, f.id
from public.contable_plan p
join public.fundamento_normativo f on f.referencia = 'concepto_2025-0146'
cross join (values
  ('27', 'Fondos con destinación específica (pasivo) — el fondo de imprevistos y los demás '
         'fondos especiales de la asamblea no son pasivo, son efectivo restringido (activo)'),
  ('32', 'Fondos patrimoniales — el fondo de imprevistos y los demás fondos especiales no son '
         'patrimonio; presentarlos ahí es un error de presentación que el CTCP pide corregir')
) as v(codigo, motivo)
where p.codigo = 'PUC_PH_CO';

create function public.guard_contable_codigo_no_retirado()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_plan_id uuid;
  v_retirado record;
begin
  select id into v_plan_id from public.contable_plan where codigo = 'PUC_PH_CO';
  if v_plan_id is null then
    return new;
  end if;

  select codigo, motivo into v_retirado
  from public.contable_codigo_retirado
  where plan_id = v_plan_id and left(new.codigo, length(codigo)) = codigo
  limit 1;

  if v_retirado.codigo is not null then
    raise exception 'CUENTA_CODIGO_RETIRADO: % no puede crearse — el código % fue retirado del '
      'plan base por decisión de diseño con fundamento normativo: %',
      new.codigo, v_retirado.codigo, v_retirado.motivo;
  end if;

  return new;
end;
$$;

create trigger guard_contable_codigo_no_retirado
  before insert or update of codigo on public.contable_cuenta
  for each row execute function public.guard_contable_codigo_no_retirado();

comment on function public.guard_contable_codigo_no_retirado() is
  'Impide recrear, por tenant, un código retirado de la plantilla global por doctrina (PC-9). '
  'No es una restricción arbitraria de la ingeniería: hace cumplir en el motor lo que PC-7 ya '
  'documentó y fundamentó — sin este guard, cualquier rol auxiliar podía deshacer en su propio '
  'plan la corrección normativa que motivó eliminar los grupos 27/32.';

-- ═══════════════════════════════════════════════════════════════════════
--  2. Coherencia de clase entre evento y cuenta predeterminada
-- ═══════════════════════════════════════════════════════════════════════
-- El prefijo del código de cada evento ya declara su clase esperada — es la misma semántica con
-- que se sembraron en 20260830460000, aquí simplemente se hace cumplir. No cubre eventos cuya
-- clase depende de una decisión de la copropiedad (ninguno de los actuales): si en el futuro se
-- agrega uno así, este mapa deberá ampliarse explícitamente, no relajarse en silencio.
create or replace function public.guard_contable_cuenta_default()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_familia text;
  v_evento_tenant uuid;
  v_evento_codigo text;
  v_cuenta public.contable_cuenta%rowtype;
  v_clase_esperada smallint;
  v_grupo11_esperado boolean := false;
begin
  select tipo, tenant_id, codigo into v_familia, v_evento_tenant, v_evento_codigo
  from public.lista_tipos where id = new.evento_id;

  if v_familia is distinct from 'EVENTO_CONTABLE' then
    raise exception 'EVENTO_CONTABLE_INVALIDO: evento_id % no pertenece a EVENTO_CONTABLE (es %)',
      new.evento_id, coalesce(v_familia, 'inexistente');
  end if;

  if v_evento_tenant is not null and v_evento_tenant <> new.tenant_id then
    raise exception 'EVENTO_CONTABLE_INVALIDO: el evento % pertenece a otro tenant',
      new.evento_id;
  end if;

  v_cuenta := public.validar_cuenta_contable_destino(new.contable_cuenta_id, new.tenant_id);

  v_clase_esperada := case
    when v_evento_codigo like 'CARTERA_%'                        then 1
    when v_evento_codigo in ('BANCO_RECAUDO', 'CAJA_GENERAL',
                              'FONDO_IMPREVISTOS_EFECTIVO')       then 1
    when v_evento_codigo = 'DETERIORO_CARTERA'                   then 1
    when v_evento_codigo like 'PROVEEDOR_%'                      then 2
    when v_evento_codigo = 'RESULTADO_EJERCICIO'                 then 3
    when v_evento_codigo like 'INGRESO_%'                        then 4
    when v_evento_codigo = 'GASTO_DETERIORO_CARTERA'             then 5
  end;

  if v_evento_codigo in ('BANCO_RECAUDO', 'CAJA_GENERAL', 'FONDO_IMPREVISTOS_EFECTIVO') then
    v_grupo11_esperado := true;
  end if;

  if v_clase_esperada is not null and v_cuenta.clase <> v_clase_esperada then
    raise exception 'CUENTA_CONTABLE_CLASE_INCOMPATIBLE: % (%) es clase % — el evento % espera '
      'una cuenta de clase %', v_cuenta.codigo, v_cuenta.nombre, v_cuenta.clase, v_evento_codigo,
      v_clase_esperada;
  end if;

  if v_grupo11_esperado and left(v_cuenta.codigo, 2) <> '11' then
    raise exception 'CUENTA_CONTABLE_CLASE_INCOMPATIBLE: % (%) no es efectivo (grupo 11) — el '
      'evento % exige una cuenta de caja o bancos', v_cuenta.codigo, v_cuenta.nombre,
      v_evento_codigo;
  end if;

  return new;
end;
$$;

comment on function public.guard_contable_cuenta_default() is
  'Cuentas predeterminadas por evento (PC-3), con coherencia de clase exigida desde PC-9: la '
  'clase esperada de cada evento ya estaba implícita en su nombre (CARTERA_* -> 1, INGRESO_* '
  '-> 4, PROVEEDOR_* -> 2...) desde que se sembró el catálogo EVENTO_CONTABLE; este guard '
  'impide mapear, por error, un evento de ingreso contra una cuenta de gasto o viceversa.';
