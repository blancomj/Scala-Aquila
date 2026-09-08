-- ═══════════════════════════════════════════════════════════════════════
--  GOB-9 (5/7) · Funciones de detección que faltaban en GOB-1 y GOB-6
--  Ver GOB_09_comunicaciones_workflow.md §3.4 (tablero).
--
--  Por qué se crean aquí y no se dice que son "de GOB-9": conceptualmente
--  pertenecen al módulo dueño del dato (marco §3.4 "si el tablero necesita
--  una consulta que no existe, la función va en el módulo dueño, no
--  aquí") — GOB-1 (órganos/miembros) y GOB-6 (expedientes) ya cerraron su
--  propia serie de migraciones, así que se agregan en esta, con el prefijo
--  y la firma que tendrían si hubieran nacido en su propio corte. No
--  existía previamente ninguna consulta que detectara la AUSENCIA de un
--  órgano vigente o un expediente detenido — los guards de GOB-1 solo
--  impiden crear un segundo duplicado, nunca detectan que ya no queda
--  ninguno vigente (ver Plan del corte GOB-9 §1).
-- ═══════════════════════════════════════════════════════════════════════

-- ── Alertas de órgano (dueño: GOB-1) ─────────────────────────────────────
create function public.gobierno_organo_alertas(p_tenant_id uuid)
returns table (
  alerta     text,
  organo_id  uuid,
  detalle    text
)
language sql
stable
security invoker
set search_path = ''
as $$
  -- revisoría faltante en copropiedad comercial o mixta
  select
    'revisoria_faltante'::text,
    null::uuid,
    'La copropiedad es ' || t.uso_economico::text || ' y no tiene una revisoría fiscal vigente '
      || '(Ley 675 art. 57).'
  from public.tenants t
  where t.id = p_tenant_id
    and t.uso_economico in ('comercial', 'mixto')
    and not exists (
      select 1 from public.gobierno_organos go
      join public.lista_tipos lt on lt.id = go.tipo_id
      where go.tenant_id = p_tenant_id and lt.codigo = 'revisoria_fiscal' and go.vigente_hasta is null
    )

  union all

  -- comité de convivencia con período vencido: el órgano sigue vigente
  -- pero ninguno de sus miembros tiene un término que cubra hoy
  select
    'comite_convivencia_periodo_vencido'::text,
    go.id,
    'El comité de convivencia no tiene ningún miembro con período vigente (Ley 675 art. 58 par. 1).'
  from public.gobierno_organos go
  join public.lista_tipos lt on lt.id = go.tipo_id
  where go.tenant_id = p_tenant_id
    and lt.codigo = 'comite_convivencia'
    and go.vigente_hasta is null
    and not exists (
      select 1 from public.gobierno_miembros gm
      where gm.organo_id = go.id
        and (gm.hasta is null or gm.hasta >= current_date)
    )

  union all

  -- consejo de administración sin presidente o sin secretario vigente
  select
    'consejo_sin_direccion'::text,
    go.id,
    'El consejo de administración no tiene ' ||
      case
        when not exists (
          select 1 from public.gobierno_miembros gm join public.lista_tipos rl on rl.id = gm.rol_id
          where gm.organo_id = go.id and rl.codigo = 'presidente' and (gm.hasta is null or gm.hasta >= current_date)
        ) and not exists (
          select 1 from public.gobierno_miembros gm join public.lista_tipos rl on rl.id = gm.rol_id
          where gm.organo_id = go.id and rl.codigo = 'secretario' and (gm.hasta is null or gm.hasta >= current_date)
        ) then 'presidente ni secretario vigentes'
        when not exists (
          select 1 from public.gobierno_miembros gm join public.lista_tipos rl on rl.id = gm.rol_id
          where gm.organo_id = go.id and rl.codigo = 'presidente' and (gm.hasta is null or gm.hasta >= current_date)
        ) then 'presidente vigente'
        else 'secretario vigente'
      end
  from public.gobierno_organos go
  join public.lista_tipos lt on lt.id = go.tipo_id
  where go.tenant_id = p_tenant_id
    and lt.codigo = 'consejo_administracion'
    and go.vigente_hasta is null
    and (
      not exists (
        select 1 from public.gobierno_miembros gm join public.lista_tipos rl on rl.id = gm.rol_id
        where gm.organo_id = go.id and rl.codigo = 'presidente' and (gm.hasta is null or gm.hasta >= current_date)
      )
      or not exists (
        select 1 from public.gobierno_miembros gm join public.lista_tipos rl on rl.id = gm.rol_id
        where gm.organo_id = go.id and rl.codigo = 'secretario' and (gm.hasta is null or gm.hasta >= current_date)
      )
    )
$$;

comment on function public.gobierno_organo_alertas(uuid) is
  'GOB-1 (agregada por GOB-9 §3.4): 3 alertas estructurales que ningún guard de escritura '
  'detecta por sí solo — la ausencia de un órgano/miembro vigente, no su duplicación. Consumida '
  'únicamente por gobierno_tablero_resumen().';

-- ── Expedientes de convivencia detenidos (dueño: GOB-6) ─────────────────
create function public.gobierno_expedientes_detenidos(p_tenant_id uuid)
returns table (
  expediente_id  uuid,
  etapa          public.gobierno_expediente_etapa_t,
  dias_detenido  integer
)
language sql
stable
security invoker
set search_path = ''
as $$
  select
    e.id,
    e.etapa,
    (current_date - coalesce(
      (select max(a.fecha) from public.gobierno_expediente_actuaciones a where a.expediente_id = e.id),
      e.created_at::date
    ))::integer
  from public.gobierno_expedientes_convivencia e
  where e.tenant_id = p_tenant_id
    and e.etapa not in ('archivado', 'firme')
$$;

comment on function public.gobierno_expedientes_detenidos(uuid) is
  'GOB-6 (agregada por GOB-9 §3.4): días desde el último hito registrado, por expediente no '
  'terminal — "los que llevan más tiempo detenidos" del tablero. No existía antes ninguna '
  'función que mirara el expediente en conjunto: gobierno_expediente_actuaciones solo guarda '
  'fecha_limite por hito individual.';
