-- ═══════════════════════════════════════════════════════════════════════
--  Casos jurídicos (CAR §15.3, bloque 20) — consecutivo estampado por el
--  servidor, mismo mecanismo que certificaciones_deuda/recibo_caja
--  (fn_siguiente_consecutivo, RC-3): guard_caso_juridico_insert lo asigna
--  siempre desde public.fn_siguiente_consecutivo(tenant_id,
--  'caso_juridico'), nunca se confía del cliente. NOT NULL a nivel de
--  columna es redundante con esa garantía y rompe el I/O directo desde TS
--  (mismo motivo que 20260822360000: aprobado_por/registrada_por).
-- ═══════════════════════════════════════════════════════════════════════

alter table public.casos_juridicos
  alter column consecutivo drop not null;

create or replace function public.guard_caso_juridico_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_certificacion record;
begin
  if (select auth.uid()) is null then
    raise exception 'UNAUTHENTICATED: se requiere sesión para remitir un caso jurídico';
  end if;
  if not public.has_role(new.tenant_id, array['administrador']::public.tenant_role_t[]) then
    raise exception 'CASO_JURIDICO_REQUIERE_ADMINISTRADOR: remitir un inmueble a proceso '
      'jurídico exige rol administrador';
  end if;

  select tenant_id, estado into v_certificacion
  from public.certificaciones_deuda
  where id = new.certificacion_id;
  if v_certificacion.tenant_id is distinct from new.tenant_id or v_certificacion.estado <> 'vigente' then
    raise exception 'CASO_JURIDICO_CERTIFICACION_INVALIDA: certificacion_id % no es una '
      'certificación vigente de este tenant', new.certificacion_id;
  end if;

  if new.abogado_tercero_id is not null and not exists (
    select 1 from public.tenant_tercero_rol ttr
    join public.lista_tipos lt on lt.id = ttr.rol_id
    where ttr.tenant_id = new.tenant_id
      and ttr.tercero_id = new.abogado_tercero_id
      and lt.tipo = 'PERSONA_COPROPIEDAD' and lt.codigo = 'abogado'
      and (ttr.vigente_hasta is null or ttr.vigente_hasta >= new.fecha_remision)
  ) then
    raise exception 'CASO_JURIDICO_ABOGADO_INVALIDO: % no tiene un rol de abogado vigente en '
      'esta copropiedad', new.abogado_tercero_id;
  end if;

  new.consecutivo := public.fn_siguiente_consecutivo(new.tenant_id, 'caso_juridico');
  new.aprobado_por := (select auth.uid());
  new.aprobado_at := now();
  return new;
end;
$$;
