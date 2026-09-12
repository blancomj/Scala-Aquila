-- ═══════════════════════════════════════════════════════════════════════
--  D-85 (complemento) · terminar un órgano cierra también a sus miembros y
--  atribuciones vigentes
--
--  Preguntado por el usuario tras ver el mensaje de confirmación: "¿cómo
--  van a ser miembros de un órgano que ya no existe?" — tenía razón. Antes
--  de esto, terminar el órgano dejaba `gobierno_miembros.hasta` y
--  `gobierno_atribucion.vigente_hasta` intactos: nadie quedaba mal
--  contado en las alertas (gobierno_organo_alertas ya filtra
--  `go.vigente_hasta is null` antes de mirar miembros), pero la pantalla
--  seguía mostrando "miembros vigentes" de un órgano histórico, que no
--  tiene sentido de cara al usuario.
--
--  Solo se cierran los que estaban vigentes EN ESE MOMENTO — a quien ya
--  había salido antes (hasta ya fijado) no se le toca su fecha real. Y
--  solo los que ya habían empezado (desde <= fecha de cierre): un miembro
--  con fecha futura no se cierra retroactivamente, se deja para que quien
--  lo agregó decida qué hacer con él.
--
--  security invoker, no definer: las tres tablas YA tienen policy
--  `*_update_auxiliar` — esta función solo agrupa tres UPDATE en una
--  transacción, no necesita ni debe saltarse RLS.
-- ═══════════════════════════════════════════════════════════════════════

create function public.fn_gobierno_organo_terminar(
  p_organo_id     uuid,
  p_tenant_id     uuid,
  p_vigente_hasta date,
  p_motivo        text
)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
begin
  update public.gobierno_organos
     set vigente_hasta = p_vigente_hasta, motivo_terminacion = p_motivo
   where id = p_organo_id and tenant_id = p_tenant_id;

  if not found then
    raise exception 'ORGANO_INEXISTENTE: % no existe en el tenant %', p_organo_id, p_tenant_id;
  end if;

  update public.gobierno_miembros
     set hasta = p_vigente_hasta
   where organo_id = p_organo_id
     and tenant_id = p_tenant_id
     and hasta is null
     and desde <= p_vigente_hasta;

  update public.gobierno_atribucion
     set vigente_hasta = p_vigente_hasta
   where organo_id = p_organo_id
     and tenant_id = p_tenant_id
     and vigente_hasta is null
     and vigente_desde <= p_vigente_hasta;
end;
$$;

comment on function public.fn_gobierno_organo_terminar(uuid, uuid, date, text) is
  'D-85 — termina un órgano Y, en la misma transacción, cierra (hasta/vigente_hasta = '
  'p_vigente_hasta) a los miembros y atribuciones que seguían vigentes en ese momento. security '
  'invoker: las tres tablas ya exigen rol auxiliar vía RLS, esta función solo las agrupa.';

revoke execute on function public.fn_gobierno_organo_terminar(uuid, uuid, date, text) from public, anon;
grant execute on function public.fn_gobierno_organo_terminar(uuid, uuid, date, text) to authenticated, service_role;
