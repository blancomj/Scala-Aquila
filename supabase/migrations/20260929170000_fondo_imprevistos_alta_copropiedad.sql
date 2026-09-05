-- ═══════════════════════════════════════════════════════════════════════
--  Dominio Fondos — el alta de copropiedad crea el fondo de imprevistos.
--  Cierra §4.2 de ANALISIS_FONDOS_BLOQUE_A.md.
--  Propietario: PLAN_MAESTRO_IMPLEMENTACION.md §4.3 (GAP-22), D-36.
--
--  EL DEFECTO. La Ley 675 de 2001, art. 35, obliga a toda copropiedad a
--  constituir el fondo de imprevistos — la excepción es potestativa
--  (Ley 2079/2021, VIS/VIP de cinco o menos unidades), nunca la regla. Pero
--  `create_tenant()` nunca lo creaba: de ~170 tenants en desarrollo,
--  exactamente 1 tenía fondo de imprevistos (el del seed GC-001, insertado
--  a mano). Cualquier copropiedad real creada por la UI nace sin él, y la
--  primera vez que alguien intenta usarlo como fuente de financiación
--  recibe FONDO_IMPREVISTOS_NO_EXISTE.
--
--  LA CORRECCIÓN, mismo patrón que PC-2/PC-2b/PC-2c/PC-3c:
--  fn_instanciar_fondo_imprevistos(tenant) — idempotente, SECURITY INVOKER,
--  una copropiedad por llamada — sirve tanto para el alta como para el
--  backfill de las copropiedades que ya existen.
--
--  QUÉ NO HACE, deliberadamente. No crea una fila en fondo_autorizaciones:
--  eso registraría una decisión de Asamblea que nunca ocurrió — la
--  existencia del fondo de imprevistos la manda la ley, no un acta (Modelo
--  §7 dice explícitamente que AQUILA registra la decisión adoptada, no la
--  inventa). Tampoco decide si la copropiedad califica para la excepción
--  VIS/VIP: nace activo por default (la regla, no la excepción) y queda a
--  criterio del administrador cerrarlo si su copropiedad calificara y así
--  lo decidiera — con la misma máquina de estados de cualquier otro fondo.
-- ═══════════════════════════════════════════════════════════════════════

create function public.fn_instanciar_fondo_imprevistos(p_tenant_id uuid)
returns public.fondos
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_fondo    public.fondos;
  v_tipo_id  bigint;
  v_cuenta_id uuid;
begin
  if not exists (select 1 from public.tenants where id = p_tenant_id) then
    raise exception 'TENANT_INEXISTENTE: %', p_tenant_id;
  end if;

  -- Idempotente: fondos_naturaleza_imprevistos_unico ya lo impediría a
  -- nivel de constraint, pero se comprueba antes para poder devolver el
  -- existente en vez de fallar (mismo contrato que fn_instanciar_plan_contable).
  select * into v_fondo
    from public.fondos
   where tenant_id = p_tenant_id and naturaleza = 'imprevistos';

  if v_fondo.id is not null then
    return v_fondo;
  end if;

  select id into v_tipo_id
    from public.lista_tipos
   where tipo = 'TIPO_FONDO' and codigo = 'imprevistos' and tenant_id is null;

  -- Nullable a propósito: si el plan de cuentas todavía no existe (una
  -- copropiedad de prueba insertada a mano, sin pasar por create_tenant),
  -- el fondo nace igual y contable_parametrizacion_pendiente() lo reporta.
  select id into v_cuenta_id
    from public.contable_cuenta
   where tenant_id = p_tenant_id and codigo = '111015';

  insert into public.fondos (
    tenant_id, codigo, nombre, naturaleza, tipo_id, estado, permanente,
    objetivo, contable_cuenta_id, fecha_inicio
  )
  values (
    p_tenant_id, 'FON-IMP', 'Fondo de imprevistos', 'imprevistos', v_tipo_id,
    -- 'activo' directo, no 'propuesto': su existencia la manda la ley, no
    -- una decisión pendiente de aprobar (a diferencia de cualquier fondo
    -- de destinación específica, que sí nace propuesto).
    'activo', true,
    'Atender obligaciones o expensas imprevistas de la copropiedad (Ley 675 de 2001, art. 35).',
    v_cuenta_id, current_date
  )
  returning * into v_fondo;

  return v_fondo;
end;
$$;

comment on function public.fn_instanciar_fondo_imprevistos(uuid) is
  'Crea el fondo de imprevistos de una copropiedad si todavía no lo tiene (Ley 675/2001 art. 35, '
  'GAP-22). Idempotente por naturaleza=imprevistos — llamarla dos veces devuelve el mismo fondo, '
  'nunca falla ni duplica. No crea autorización (la existencia la manda la ley, no un acta) ni '
  'decide la excepción VIS/VIP (Ley 2079/2021): nace activo, y su cierre —si calificara— es una '
  'decisión del administrador con la máquina de estados normal del fondo.';

-- ── create_tenant(): el alta también nace con su fondo de imprevistos ──
create or replace function public.create_tenant(p_name text, p_slug text)
returns public.tenants
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_tenant public.tenants;
begin
  if (select auth.uid()) is null then
    raise exception 'UNAUTHENTICATED: se requiere sesión para crear una copropiedad';
  end if;

  insert into public.tenants (name, slug, created_by)
  values (btrim(p_name), lower(btrim(p_slug)), (select auth.uid()))
  returning * into v_tenant;

  insert into public.audit_log (tenant_id, actor_id, action, entity_type, entity_id)
  values (v_tenant.id, (select auth.uid()), 'tenant.created', 'tenant', v_tenant.id);

  insert into public.memberships (user_id, tenant_id, role, status)
  values ((select auth.uid()), v_tenant.id, 'administrador', 'active');

  -- PC-2b/PC-2c: siembra los árboles presupuestal y contable. Conceptos depende de
  -- presupuesto_cuenta (ADMINISTRACION se liga a cuotas_administracion por código), así que
  -- tiene que ir después de fn_instanciar_presupuesto_cuenta, en la misma transacción de alta.
  perform public.fn_instanciar_presupuesto_cuenta(v_tenant.id);
  perform public.fn_instanciar_plan_contable(v_tenant.id);
  -- GAP-22: el fondo de imprevistos necesita el plan de cuentas para vincular 111015 —
  -- va después de fn_instanciar_plan_contable, igual que los dos puentes de abajo.
  perform public.fn_instanciar_fondo_imprevistos(v_tenant.id);
  -- PC-3c: y los dos puentes entre ambos árboles, sin los cuales toda la contabilidad
  -- proyectada de la copropiedad saldría sin cuenta.
  perform public.fn_instanciar_cuentas_default(v_tenant.id);
  perform public.fn_instanciar_puentes_presupuesto(v_tenant.id);
  perform public.fn_instanciar_conceptos(v_tenant.id);

  update public.profiles
  set active_tenant_id = v_tenant.id
  where id = (select auth.uid());

  return v_tenant;
exception
  when unique_violation then
    raise exception 'SLUG_TAKEN: ya existe una copropiedad con ese slug';
  when check_violation then
    raise exception 'SLUG_INVALID: el nombre o el slug no cumplen el formato requerido';
end;
$$;

-- ── Backfill — las copropiedades que ya existen ─────────────────────────
-- Mismo alcance que PC-3c: cada tenant con plan de cuentas ya sembrado,
-- para que el fondo pueda vincularse a 111015 de una vez. Idempotente por
-- construcción de fn_instanciar_fondo_imprevistos, así que GC-001 y
-- JARDINES DE BABILONIA (que ya tienen su fondo desde antes de GAP-22)
-- no cambian en nada — la función los detecta y devuelve el existente.
do $$
declare
  v_tenant uuid;
begin
  for v_tenant in select distinct tenant_id from public.contable_cuenta
  loop
    perform public.fn_instanciar_fondo_imprevistos(v_tenant);
  end loop;
end $$;
