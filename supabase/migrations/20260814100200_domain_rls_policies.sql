-- ═══════════════════════════════════════════════════════════════════════
--  F2 · Políticas RLS del dominio PH
--  Propietario: PLAN_MAESTRO_IMPLEMENTACION.md §4.4
--
--  Deny-by-default, mismo patrón que Fase I §6.2: reutiliza is_member() y
--  has_role() (SECURITY DEFINER STABLE, ya definidas en F1).
--  El rol de plataforma NO aparece aquí (SEC-10): su único acceso a datos
--  de tenant es cero, igual que en Fase I.
--
--  gestión de datos de dominio → agent (rol máximo del tenant, PLAN §7.2)
--  lectura                     → agent + auditor
-- ═══════════════════════════════════════════════════════════════════════

-- ── inmuebles ──────────────────────────────────────────────────────────
create policy inmuebles_select_miembro
  on public.inmuebles for select
  to authenticated
  using (public.is_member(tenant_id));

create policy inmuebles_insert_agent
  on public.inmuebles for insert
  to authenticated
  with check (public.has_role(tenant_id, array['agent']::public.tenant_role_t[]));

create policy inmuebles_update_agent
  on public.inmuebles for update
  to authenticated
  using (public.has_role(tenant_id, array['agent']::public.tenant_role_t[]))
  with check (public.has_role(tenant_id, array['agent']::public.tenant_role_t[]));

create policy inmuebles_delete_agent
  on public.inmuebles for delete
  to authenticated
  using (public.has_role(tenant_id, array['agent']::public.tenant_role_t[]));

-- ── zonas_comunes ──────────────────────────────────────────────────────
create policy zonas_comunes_select_miembro
  on public.zonas_comunes for select
  to authenticated
  using (public.is_member(tenant_id));

create policy zonas_comunes_insert_agent
  on public.zonas_comunes for insert
  to authenticated
  with check (public.has_role(tenant_id, array['agent']::public.tenant_role_t[]));

create policy zonas_comunes_update_agent
  on public.zonas_comunes for update
  to authenticated
  using (public.has_role(tenant_id, array['agent']::public.tenant_role_t[]))
  with check (public.has_role(tenant_id, array['agent']::public.tenant_role_t[]));

create policy zonas_comunes_delete_agent
  on public.zonas_comunes for delete
  to authenticated
  using (public.has_role(tenant_id, array['agent']::public.tenant_role_t[]));

-- ── coeficiente_sets / coeficientes ────────────────────────────────────
-- Sin UPDATE ni DELETE directos: la inmutabilidad de vigente/historica la
-- exige guard_coeficiente_set_inmutable; un borrador se corrige recreando
-- la fila (DELETE + INSERT) mientras siga en borrador — permitido a agent.
create policy coeficiente_sets_select_miembro
  on public.coeficiente_sets for select
  to authenticated
  using (public.is_member(tenant_id));

create policy coeficiente_sets_insert_agent
  on public.coeficiente_sets for insert
  to authenticated
  with check (public.has_role(tenant_id, array['agent']::public.tenant_role_t[]));

create policy coeficiente_sets_update_agent
  on public.coeficiente_sets for update
  to authenticated
  using (public.has_role(tenant_id, array['agent']::public.tenant_role_t[]))
  with check (public.has_role(tenant_id, array['agent']::public.tenant_role_t[]));

create policy coeficiente_sets_delete_agent
  on public.coeficiente_sets for delete
  to authenticated
  using (public.has_role(tenant_id, array['agent']::public.tenant_role_t[]));

create policy coeficientes_select_miembro
  on public.coeficientes for select
  to authenticated
  using (public.is_member(tenant_id));

create policy coeficientes_insert_agent
  on public.coeficientes for insert
  to authenticated
  with check (public.has_role(tenant_id, array['agent']::public.tenant_role_t[]));

create policy coeficientes_update_agent
  on public.coeficientes for update
  to authenticated
  using (public.has_role(tenant_id, array['agent']::public.tenant_role_t[]))
  with check (public.has_role(tenant_id, array['agent']::public.tenant_role_t[]));

create policy coeficientes_delete_agent
  on public.coeficientes for delete
  to authenticated
  using (public.has_role(tenant_id, array['agent']::public.tenant_role_t[]));

-- ── propietarios / inmueble_propietario ────────────────────────────────
create policy propietarios_select_miembro
  on public.propietarios for select
  to authenticated
  using (public.is_member(tenant_id));

create policy propietarios_insert_agent
  on public.propietarios for insert
  to authenticated
  with check (public.has_role(tenant_id, array['agent']::public.tenant_role_t[]));

create policy propietarios_update_agent
  on public.propietarios for update
  to authenticated
  using (public.has_role(tenant_id, array['agent']::public.tenant_role_t[]))
  with check (public.has_role(tenant_id, array['agent']::public.tenant_role_t[]));

create policy propietarios_delete_agent
  on public.propietarios for delete
  to authenticated
  using (public.has_role(tenant_id, array['agent']::public.tenant_role_t[]));

create policy inmueble_propietario_select_miembro
  on public.inmueble_propietario for select
  to authenticated
  using (public.is_member(tenant_id));

create policy inmueble_propietario_insert_agent
  on public.inmueble_propietario for insert
  to authenticated
  with check (public.has_role(tenant_id, array['agent']::public.tenant_role_t[]));

create policy inmueble_propietario_update_agent
  on public.inmueble_propietario for update
  to authenticated
  using (public.has_role(tenant_id, array['agent']::public.tenant_role_t[]))
  with check (public.has_role(tenant_id, array['agent']::public.tenant_role_t[]));

create policy inmueble_propietario_delete_agent
  on public.inmueble_propietario for delete
  to authenticated
  using (public.has_role(tenant_id, array['agent']::public.tenant_role_t[]));

-- ── periodos ───────────────────────────────────────────────────────────
-- Sin DELETE: un periodo no se borra, transiciona de estado (guard_periodo_transicion).
create policy periodos_select_miembro
  on public.periodos for select
  to authenticated
  using (public.is_member(tenant_id));

create policy periodos_insert_agent
  on public.periodos for insert
  to authenticated
  with check (public.has_role(tenant_id, array['agent']::public.tenant_role_t[]));

create policy periodos_update_agent
  on public.periodos for update
  to authenticated
  using (public.has_role(tenant_id, array['agent']::public.tenant_role_t[]))
  with check (public.has_role(tenant_id, array['agent']::public.tenant_role_t[]));

-- ── conceptos ──────────────────────────────────────────────────────────
-- Sin DELETE: se archiva vía estado, nunca se borra (16 §19 versión inmutable en uso).
create policy conceptos_select_miembro
  on public.conceptos for select
  to authenticated
  using (public.is_member(tenant_id));

create policy conceptos_insert_agent
  on public.conceptos for insert
  to authenticated
  with check (public.has_role(tenant_id, array['agent']::public.tenant_role_t[]));

create policy conceptos_update_agent
  on public.conceptos for update
  to authenticated
  using (public.has_role(tenant_id, array['agent']::public.tenant_role_t[]))
  with check (public.has_role(tenant_id, array['agent']::public.tenant_role_t[]));

-- ── politicas_financieras ──────────────────────────────────────────────
-- Sin DELETE: inmutable en vigente/historica (guard_politica_inmutable).
create policy politicas_financieras_select_miembro
  on public.politicas_financieras for select
  to authenticated
  using (public.is_member(tenant_id));

create policy politicas_financieras_insert_agent
  on public.politicas_financieras for insert
  to authenticated
  with check (public.has_role(tenant_id, array['agent']::public.tenant_role_t[]));

create policy politicas_financieras_update_agent
  on public.politicas_financieras for update
  to authenticated
  using (public.has_role(tenant_id, array['agent']::public.tenant_role_t[]))
  with check (public.has_role(tenant_id, array['agent']::public.tenant_role_t[]));

-- ── presupuestos / presupuesto_rubros ──────────────────────────────────
-- Sin DELETE: inmutable en vigente/cerrado (guard_presupuesto_inmutable).
create policy presupuestos_select_miembro
  on public.presupuestos for select
  to authenticated
  using (public.is_member(tenant_id));

create policy presupuestos_insert_agent
  on public.presupuestos for insert
  to authenticated
  with check (public.has_role(tenant_id, array['agent']::public.tenant_role_t[]));

create policy presupuestos_update_agent
  on public.presupuestos for update
  to authenticated
  using (public.has_role(tenant_id, array['agent']::public.tenant_role_t[]))
  with check (public.has_role(tenant_id, array['agent']::public.tenant_role_t[]));

create policy presupuesto_rubros_select_miembro
  on public.presupuesto_rubros for select
  to authenticated
  using (public.is_member(tenant_id));

create policy presupuesto_rubros_insert_agent
  on public.presupuesto_rubros for insert
  to authenticated
  with check (public.has_role(tenant_id, array['agent']::public.tenant_role_t[]));

create policy presupuesto_rubros_update_agent
  on public.presupuesto_rubros for update
  to authenticated
  using (public.has_role(tenant_id, array['agent']::public.tenant_role_t[]))
  with check (public.has_role(tenant_id, array['agent']::public.tenant_role_t[]));

-- ── fondos / fondo_movimientos ─────────────────────────────────────────
-- fondos.saldo_actual: sin UPDATE directo, solo lo cambia el trigger
-- recalcular_saldo_fondo — no hay política de UPDATE, es intencional.
create policy fondos_select_miembro
  on public.fondos for select
  to authenticated
  using (public.is_member(tenant_id));

create policy fondos_insert_agent
  on public.fondos for insert
  to authenticated
  with check (public.has_role(tenant_id, array['agent']::public.tenant_role_t[]));

-- fondo_movimientos: lectura agent+auditor (igual que audit_log), sin
-- UPDATE ni DELETE (append-only, forbid_mutation reutilizado de F1).
create policy fondo_movimientos_select_agent_auditor
  on public.fondo_movimientos for select
  to authenticated
  using (public.has_role(tenant_id, array['agent', 'auditor']::public.tenant_role_t[]));

create policy fondo_movimientos_insert_agent
  on public.fondo_movimientos for insert
  to authenticated
  with check (public.has_role(tenant_id, array['agent']::public.tenant_role_t[]));
