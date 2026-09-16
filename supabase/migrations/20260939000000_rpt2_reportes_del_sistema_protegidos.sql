-- ═══════════════════════════════════════════════════════════════════════
--  RPT-02 · los reportes de fábrica no se editan, se duplican
--
--  RPT-01 dejó `del_sistema` protegido solo contra DELETE. Faltaban las dos
--  mitades que el diseñador convierte en un problema real en cuanto existe
--  una UI que escribe:
--
--   · INSERT sin `not del_sistema` en el WITH CHECK: cualquier auxiliar
--     podía crear un reporte marcándolo como de fábrica, y ganaba así una
--     fila que la política de DELETE le impide borrar después. Un reporte
--     imborrable creado por accidente y sin forma de deshacerlo desde la UI.
--   · UPDATE sin esa condición: se podía convertir un reporte propio en uno
--     del sistema, con el mismo efecto.
--
--  De paso queda la regla que RPT-01 ya documentaba en el comentario de la
--  tabla pero no imponía: **un reporte de fábrica no se edita**. Ni él ni
--  sus versiones. El camino para ajustarlo es duplicarlo, que es lo que el
--  diseñador ofrece — así la copia de fábrica sigue siendo una referencia
--  fiable de lo que AQUILA entrega.
-- ═══════════════════════════════════════════════════════════════════════

drop policy reportes_insert_operador on public.reportes;
drop policy reportes_update_operador on public.reportes;

create policy reportes_insert_operador on public.reportes
  for insert to authenticated
  with check (
    not del_sistema
    and public.has_role(tenant_id, array['auxiliar']::public.tenant_role_t[])
  );

create policy reportes_update_operador on public.reportes
  for update to authenticated
  using (
    not del_sistema
    and public.has_role(tenant_id, array['auxiliar']::public.tenant_role_t[])
  )
  with check (
    not del_sistema
    and public.has_role(tenant_id, array['auxiliar']::public.tenant_role_t[])
  );

-- Las versiones siguen la suerte de su reporte: si el reporte es de fábrica,
-- su definición tampoco se toca.
drop policy reporte_versiones_insert_operador on public.reporte_versiones;
drop policy reporte_versiones_update_operador on public.reporte_versiones;
drop policy reporte_versiones_delete_borrador on public.reporte_versiones;

create policy reporte_versiones_insert_operador on public.reporte_versiones
  for insert to authenticated
  with check (
    public.has_role(tenant_id, array['auxiliar']::public.tenant_role_t[])
    and exists (
      select 1 from public.reportes r
      where r.id = reporte_id and not r.del_sistema
    )
  );

create policy reporte_versiones_update_operador on public.reporte_versiones
  for update to authenticated
  using (
    public.has_role(tenant_id, array['auxiliar']::public.tenant_role_t[])
    and exists (
      select 1 from public.reportes r
      where r.id = reporte_id and not r.del_sistema
    )
  )
  with check (
    public.has_role(tenant_id, array['auxiliar']::public.tenant_role_t[])
    and exists (
      select 1 from public.reportes r
      where r.id = reporte_id and not r.del_sistema
    )
  );

create policy reporte_versiones_delete_borrador on public.reporte_versiones
  for delete to authenticated
  using (
    estado = 'borrador'
    and public.has_role(tenant_id, array['auxiliar']::public.tenant_role_t[])
    and exists (
      select 1 from public.reportes r
      where r.id = reporte_id and not r.del_sistema
    )
  );

comment on column public.reportes.del_sistema is
  'Reporte entregado de fábrica por AQUILA (§39 del prompt). Ni se borra, ni se edita, ni se '
  'puede crear uno nuevo marcándolo así desde la aplicación (RPT-02, 20260939000000): las cuatro '
  'políticas de reportes y reporte_versiones lo exigen. El camino para ajustar uno de fábrica es '
  'duplicarlo — así la copia original sigue siendo una referencia fiable.';
