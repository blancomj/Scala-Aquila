-- ═══════════════════════════════════════════════════════════════════════
--  CO-6 · Endurecimiento — guard_marco_contable_tenant ya no usa el ciclo de
--  liquidación (CO_06_cierre_apertura_correccion.md, entregable 2)
--
--  CO-1 (20260930160000) dejó explícito en su propio comentario: "Solo evaluable hoy contra
--  periodos.estado = 'cerrado' (CO-2 aún no existe el cierre real de CO-6); se endurecerá cuando
--  CO-6 introduzca la semántica completa de cierre." Ese momento es ahora: periodos.contable_estado
--  (CO-2) es el ciclo contable real; periodos.estado sigue siendo el ciclo de LIQUIDACIÓN
--  (facturación/cobro), sin relación con si hay asientos contables cerrados. Se cambia el
--  predicado a contable_estado in ('cerrado', 'bloqueado') — cualquiera de los dos significa que
--  ya hay al menos un periodo con asientos sellados, que es exactamente lo que
--  MARCO_GRUPO_INMUTABLE_CON_CIERRE necesita proteger.
-- ═══════════════════════════════════════════════════════════════════════

create or replace function public.guard_marco_contable_tenant()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_cambia_clasificacion boolean;
begin
  v_cambia_clasificacion :=
    new.marco_grupo is distinct from old.marco_grupo
    or new.uso_economico is distinct from old.uso_economico
    or new.explota_bienes_comunes is distinct from old.explota_bienes_comunes
    or new.responsable_iva is distinct from old.responsable_iva
    or new.agente_retencion is distinct from old.agente_retencion
    or new.marco_fundamento is distinct from old.marco_fundamento;

  if not v_cambia_clasificacion then
    return new;
  end if;

  -- CO-6: contable_estado (ciclo contable real), no estado (ciclo de liquidación) — endurecido
  -- tal como lo anunciaba el comentario original de CO-1.
  if new.marco_grupo is distinct from old.marco_grupo
     and exists (
       select 1 from public.periodos p
       where p.tenant_id = old.id and p.contable_estado in ('cerrado', 'bloqueado')
     )
  then
    raise exception 'MARCO_GRUPO_INMUTABLE_CON_CIERRE: la copropiedad % ya tiene periodos '
      'contables cerrados; el marco de información financiera no se puede cambiar', old.id;
  end if;

  if new.uso_economico = 'residencial'
     and new.explota_bienes_comunes
     and coalesce(btrim(new.marco_fundamento), '') = ''
  then
    raise exception 'MARCO_USO_INCOHERENTE: uso_economico=residencial con '
      'explota_bienes_comunes=true requiere marco_fundamento explicando la explotación';
  end if;

  if (select auth.uid()) is not null then
    new.marco_clasificado_por := (select auth.uid());
    new.marco_clasificado_at := now();
  end if;

  return new;
end;
$$;

comment on function public.guard_marco_contable_tenant() is
  'CO-1/CO-6: valida MARCO_GRUPO_INMUTABLE_CON_CIERRE (contra periodos.contable_estado — ciclo '
  'contable real de CO-2/CO-6, no periodos.estado del ciclo de liquidación) y '
  'MARCO_USO_INCOHERENTE, y estampa marco_clasificado_por/at en cualquier escritura que cambie '
  'la clasificación.';
