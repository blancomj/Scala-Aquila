-- ═══════════════════════════════════════════════════════════════════════
--  PC-2 · Instanciación del plan de cuentas contable por copropiedad
--
--  PC-1 dejó la plantilla global publicada pero sin forma de llegar a un
--  tenant: contable_cuenta seguía vacía. Esta migración cierra G-03 del
--  gap analysis (PC-00 §3) con una sola función.
--
--  Decisiones de diseño:
--
--  • SECURITY INVOKER, no definer. Los INSERT pasan por la policy
--    contable_cuenta_insert_auxiliar tal cual, así que la autorización la
--    resuelve RLS y no hay que reimplementarla dentro de la función —
--    mismo criterio ya aplicado a presupuesto_cuenta_totales() y
--    presupuesto_cuenta_ejecucion() (E8/E9).
--
--  • Idempotente por (tenant_id, codigo) vía ON CONFLICT DO NOTHING.
--    Llamarla dos veces no duplica nada, y volver a llamarla con
--    p_incluir_opcionales => true agrega solo las que faltaban. Eso permite
--    que una copropiedad active la clase 6 o el fondo de reserva más tarde
--    sin ningún procedimiento especial (PC-01 §3.3).
--
--  • Inserta nivel por nivel (1 → 5) en vez de todo de golpe: parent_id se
--    resuelve buscando por código el ancestro ya insertado, y así el
--    guard_contable_cuenta_arbol —que exige que el padre exista y que el
--    código lo extienda— se satisface por construcción. El mismo guard
--    apaga permite_movimiento del padre al llegar el primer hijo, de modo
--    que la coherencia del árbol no depende de que la plantilla esté bien
--    marcada.
--
--  • Respeta lo que el tenant ya tenga: si una cuenta con ese código ya
--    existe (creada a mano o en una corrida anterior), se conserva. La
--    función nunca sobrescribe ni renombra.
-- ═══════════════════════════════════════════════════════════════════════

-- ── 0. el código de la plantilla no debe llevar la versión dentro ────────
-- La versión vive en contable_plan.version (hoy 2, tras la corrección del fondo de
-- imprevistos); dejarla también en el código obligaba a que ambos mintieran o cambiaran juntos.
update public.contable_plan set codigo = 'PUC_PH_CO' where codigo = 'PUC_PH_CO_V1';

-- ── 1. la función ────────────────────────────────────────────────────────
create function public.fn_instanciar_plan_contable(
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

  -- De arriba hacia abajo: cada nivel encuentra a su padre ya materializado.
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
           case length(pc.codigo) when 2 then 1 when 4 then 2 when 6 then 4 when 8 then 6 end
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

comment on function public.fn_instanciar_plan_contable(uuid, boolean, text) is
  'Copia la plantilla global de plan de cuentas (contable_plan_cuenta) al plan de una '
  'copropiedad (contable_cuenta). Idempotente: ON CONFLICT DO NOTHING por (tenant_id, codigo), '
  'así que repetirla no duplica y volver a llamarla con p_incluir_opcionales => true agrega '
  'solo las cuentas opcionales que faltaban (clases 6 y 8, fondo de reserva). SECURITY INVOKER: '
  'la autorización la resuelve la policy contable_cuenta_insert_auxiliar, no la función. '
  'Devuelve cuántas creó y cuántas ya existían.';

-- ── 2. instanciar para las copropiedades que ya tienen actividad ─────────
-- Solo las que ya tienen árbol presupuestal: son los tenants con contenido real, y son los
-- que PC-3 va a necesitar para mapear presupuesto_cuenta -> contable_cuenta. El resto lo
-- recibirá en su onboarding, cuando se enganche esta función al alta de copropiedad.
-- Sin opcionales: clases 6 y 8 y fondo de reserva son decisión de cada asamblea (PC-01 §3.3).
do $$
declare
  v_tenant uuid;
begin
  for v_tenant in
    select distinct tenant_id from public.presupuesto_cuenta
  loop
    perform public.fn_instanciar_plan_contable(v_tenant);
  end loop;
end $$;
