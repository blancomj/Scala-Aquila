-- ═══════════════════════════════════════════════════════════════════════
--  CO-6 · Cierre de periodo mensual — fn_contable_cerrar_periodo(tenant, periodo, forzar)
--  (CO_06_cierre_apertura_correccion.md §3.2)
--
--  El cierre mensual NO genera asiento (§3.2) — solo bloquea el periodo tras validar. El asiento
--  de cierre es anual (fn_contable_cerrar_ejercicio, migración siguiente).
--
--  Bloqueantes NUNCA se pueden forzar. Las advertencias solo se saltan con
--  p_forzar_advertencias = true, y esa decisión queda registrada en audit_log (quién, qué
--  advertencias, cuándo) — sin eso, "forzar" sería indistinguible de "no había advertencias".
--  Ambos casos de bloqueo (hallazgo bloqueante presente, o advertencia presente sin forzar) usan
--  el mismo código CONTABLE_CIERRE_BLOQUEADO: el corte solo define ese código para esta operación
--  (§3.2); el detalle del mensaje y la propia contable_validacion_cierre ya distinguen severidad.
-- ═══════════════════════════════════════════════════════════════════════

create function public.fn_contable_cerrar_periodo(
  p_tenant_id uuid,
  p_periodo_id uuid,
  p_forzar_advertencias boolean default false
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_periodo      public.periodos%rowtype;
  v_bloqueantes  text;
  v_advertencias text;
  v_hallazgos    jsonb;
begin
  if not public.has_role(p_tenant_id, array['auxiliar']::public.tenant_role_t[]) then
    raise exception 'FORBIDDEN: se requiere rol auxiliar o administrador para cerrar un periodo';
  end if;

  select * into v_periodo from public.periodos
  where id = p_periodo_id and tenant_id = p_tenant_id;
  if v_periodo.id is null then
    raise exception 'PERIODO_INEXISTENTE: % no existe para este tenant', p_periodo_id;
  end if;

  select
    string_agg(v.detalle, '; ') filter (where v.severidad = 'bloqueante'),
    string_agg(v.detalle, '; ') filter (where v.severidad = 'advertencia'),
    jsonb_agg(jsonb_build_object('hallazgo', v.hallazgo, 'severidad', v.severidad,
      'detalle', v.detalle)) filter (where v.severidad = 'advertencia')
    into v_bloqueantes, v_advertencias, v_hallazgos
  from public.contable_validacion_cierre(p_tenant_id, p_periodo_id) v;

  if v_bloqueantes is not null then
    raise exception 'CONTABLE_CIERRE_BLOQUEADO: %', v_bloqueantes;
  end if;

  if v_advertencias is not null and not p_forzar_advertencias then
    raise exception 'CONTABLE_CIERRE_BLOQUEADO: hay advertencias sin confirmar — %', v_advertencias;
  end if;

  update public.periodos set contable_estado = 'cerrado' where id = p_periodo_id;

  insert into public.audit_log (tenant_id, actor_id, action, entity_type, entity_id, metadata)
  values (
    p_tenant_id, (select auth.uid()), 'contable.periodo.cerrado', 'periodo', p_periodo_id,
    jsonb_build_object(
      'forzado', v_advertencias is not null and p_forzar_advertencias,
      'advertencias_forzadas', coalesce(v_hallazgos, '[]'::jsonb)
    )
  );

  return p_periodo_id;
end;
$$;

comment on function public.fn_contable_cerrar_periodo(uuid, uuid, boolean) is
  'CO-6 §3.2: ejecuta contable_validacion_cierre; aborta con CONTABLE_CIERRE_BLOQUEADO si hay '
  'bloqueantes (nunca forzables) o advertencias sin p_forzar_advertencias=true. No genera '
  'asiento — solo marca periodos.contable_estado=''cerrado'' (guard_contable_periodo_transicion '
  'de CO-2 sella contable_cerrado_at/por). Registra en audit_log si se forzaron advertencias, '
  'con el detalle de cada una.';
