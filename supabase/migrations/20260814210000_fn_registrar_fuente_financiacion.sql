-- ═══════════════════════════════════════════════════════════════════════
--  fn_registrar_fuente_financiacion — RPC para el Edge Function
--  presupuesto-financiacion (GAP-19, capa de exposición).
--
--  SECURITY INVOKER (default, sin `security definer`): igual criterio que
--  switch_tenant (20260814120000) — fuente_financiacion_insert_agent ya
--  autoriza esta escritura vía RLS (has_role(tenant_id, agent)) y
--  guard_fuente_financiacion ya valida inmutabilidad + FI-003. No hace
--  falta escalar privilegios para esto.
--
--  tenant_id se resuelve del presupuesto, nunca del payload del cliente
--  (E-16 §6: "no debe confiarse exclusivamente en un copropiedad_id
--  enviado por el frontend"). Si el presupuesto no existe O el usuario no
--  es miembro del tenant al que pertenece, la SELECT bajo RLS
--  (presupuestos_select_miembro) devuelve 0 filas — mismo error en ambos
--  casos, no se filtra si el presupuesto existe en otro tenant.
-- ═══════════════════════════════════════════════════════════════════════

create function public.fn_registrar_fuente_financiacion(
  p_presupuesto_id uuid,
  p_tipo public.fuente_financiacion_tipo_t,
  p_valor_disponible numeric,
  p_valor_aplicado numeric default 0,
  p_descripcion text default null,
  p_fundamento_normativo_id bigint default null
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
    tenant_id, presupuesto_id, tipo, valor_disponible, valor_aplicado,
    descripcion, fundamento_normativo_id
  )
  values (
    v_tenant_id, p_presupuesto_id, p_tipo, p_valor_disponible, p_valor_aplicado,
    p_descripcion, p_fundamento_normativo_id
  )
  returning * into v_fuente;

  return v_fuente;
end;
$$;

revoke execute on function public.fn_registrar_fuente_financiacion(
  uuid, public.fuente_financiacion_tipo_t, numeric, numeric, text, bigint
) from public, anon;

grant execute on function public.fn_registrar_fuente_financiacion(
  uuid, public.fuente_financiacion_tipo_t, numeric, numeric, text, bigint
) to authenticated;
