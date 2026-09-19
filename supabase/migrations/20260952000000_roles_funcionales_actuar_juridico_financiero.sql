-- ═══════════════════════════════════════════════════════════════════════
--  Roles funcionales — dimensión ver/actuar, enforcement en escritura.
--  Jurídico + Financiero/Presupuesto — mismo agrupamiento y mismo patrón
--  (alter policy, no drop+create) que 20260830130000 usó para SELECT.
--
--  Los guards de transición en triggers (maker-checker de jurídico,
--  congelamiento de columnas, append-only) NO se tocan — siguen aplicando
--  encima de esto sin cambios; esta migración es una capa adicional antes
--  de que cualquier guard se ejecute, no un reemplazo.
--
--  Los literales de rol usan 'auxiliar' (no 'agent'): el enum se renombró
--  en 20260830100000 y 'agent' ya no es una etiqueta válida para escribir
--  en una migración nueva, aunque el archivo histórico que creó cada
--  policy todavía diga 'agent' en su texto (Postgres actualizó las
--  policies ya existentes automáticamente; el texto del archivo viejo es
--  historia, no lo que hoy corre).
-- ═══════════════════════════════════════════════════════════════════════

-- ── Jurídico (módulo 'juridico') ────────────────────────────────────────

alter policy certificaciones_deuda_insert_administrador on public.certificaciones_deuda
  with check (
    public.has_role(tenant_id, array['administrador']::public.tenant_role_t[])
    and public.puede_actuar_en_modulo(tenant_id, 'juridico')
  );

alter policy certificaciones_deuda_update_administrador on public.certificaciones_deuda
  using (
    public.has_role(tenant_id, array['administrador']::public.tenant_role_t[])
    and public.puede_actuar_en_modulo(tenant_id, 'juridico')
  )
  with check (
    public.has_role(tenant_id, array['administrador']::public.tenant_role_t[])
    and public.puede_actuar_en_modulo(tenant_id, 'juridico')
  );

alter policy casos_juridicos_insert_administrador on public.casos_juridicos
  with check (
    public.has_role(tenant_id, array['administrador']::public.tenant_role_t[])
    and public.puede_actuar_en_modulo(tenant_id, 'juridico')
  );

alter policy casos_juridicos_update_agent on public.casos_juridicos
  using (
    public.has_role(tenant_id, array['auxiliar']::public.tenant_role_t[])
    and public.puede_actuar_en_modulo(tenant_id, 'juridico')
  )
  with check (
    public.has_role(tenant_id, array['auxiliar']::public.tenant_role_t[])
    and public.puede_actuar_en_modulo(tenant_id, 'juridico')
  );

alter policy caso_juridico_actuaciones_insert_agent on public.caso_juridico_actuaciones
  with check (
    public.has_role(tenant_id, array['auxiliar']::public.tenant_role_t[])
    and public.puede_actuar_en_modulo(tenant_id, 'juridico')
  );

alter policy costas_judiciales_insert_agent on public.costas_judiciales
  with check (
    public.has_role(tenant_id, array['auxiliar']::public.tenant_role_t[])
    and public.puede_actuar_en_modulo(tenant_id, 'juridico')
  );

alter policy costas_judiciales_update_agent on public.costas_judiciales
  using (
    public.has_role(tenant_id, array['auxiliar']::public.tenant_role_t[])
    and public.puede_actuar_en_modulo(tenant_id, 'juridico')
  )
  with check (
    public.has_role(tenant_id, array['auxiliar']::public.tenant_role_t[])
    and public.puede_actuar_en_modulo(tenant_id, 'juridico')
  );

-- ── Financiero / Presupuesto (módulo 'financiero') ──────────────────────

alter policy politicas_financieras_insert_agent on public.politicas_financieras
  with check (
    public.has_role(tenant_id, array['auxiliar']::public.tenant_role_t[])
    and public.puede_actuar_en_modulo(tenant_id, 'financiero')
  );

alter policy politicas_financieras_update_agent on public.politicas_financieras
  using (
    public.has_role(tenant_id, array['auxiliar']::public.tenant_role_t[])
    and public.puede_actuar_en_modulo(tenant_id, 'financiero')
  )
  with check (
    public.has_role(tenant_id, array['auxiliar']::public.tenant_role_t[])
    and public.puede_actuar_en_modulo(tenant_id, 'financiero')
  );

alter policy presupuestos_insert_agent on public.presupuestos
  with check (
    public.has_role(tenant_id, array['auxiliar']::public.tenant_role_t[])
    and public.puede_actuar_en_modulo(tenant_id, 'financiero')
  );

alter policy presupuestos_update_agent on public.presupuestos
  using (
    public.has_role(tenant_id, array['auxiliar']::public.tenant_role_t[])
    and public.puede_actuar_en_modulo(tenant_id, 'financiero')
  )
  with check (
    public.has_role(tenant_id, array['auxiliar']::public.tenant_role_t[])
    and public.puede_actuar_en_modulo(tenant_id, 'financiero')
  );

alter policy presupuesto_rubros_insert_agent on public.presupuesto_rubros
  with check (
    public.has_role(tenant_id, array['auxiliar']::public.tenant_role_t[])
    and public.puede_actuar_en_modulo(tenant_id, 'financiero')
  );

alter policy presupuesto_rubros_update_agent on public.presupuesto_rubros
  using (
    public.has_role(tenant_id, array['auxiliar']::public.tenant_role_t[])
    and public.puede_actuar_en_modulo(tenant_id, 'financiero')
  )
  with check (
    public.has_role(tenant_id, array['auxiliar']::public.tenant_role_t[])
    and public.puede_actuar_en_modulo(tenant_id, 'financiero')
  );

alter policy fondos_insert_agent on public.fondos
  with check (
    public.has_role(tenant_id, array['auxiliar']::public.tenant_role_t[])
    and public.puede_actuar_en_modulo(tenant_id, 'financiero')
  );

alter policy fondos_update_agent on public.fondos
  using (
    public.has_role(tenant_id, array['auxiliar']::public.tenant_role_t[])
    and public.puede_actuar_en_modulo(tenant_id, 'financiero')
  )
  with check (
    public.has_role(tenant_id, array['auxiliar']::public.tenant_role_t[])
    and public.puede_actuar_en_modulo(tenant_id, 'financiero')
  );

alter policy fondo_movimientos_insert_agent on public.fondo_movimientos
  with check (
    public.has_role(tenant_id, array['auxiliar']::public.tenant_role_t[])
    and public.puede_actuar_en_modulo(tenant_id, 'financiero')
  );

alter policy presupuesto_cuenta_insert_agent on public.presupuesto_cuenta
  with check (
    public.has_role(tenant_id, array['auxiliar']::public.tenant_role_t[])
    and public.puede_actuar_en_modulo(tenant_id, 'financiero')
  );

alter policy presupuesto_cuenta_update_agent on public.presupuesto_cuenta
  using (
    public.has_role(tenant_id, array['auxiliar']::public.tenant_role_t[])
    and public.puede_actuar_en_modulo(tenant_id, 'financiero')
  )
  with check (
    public.has_role(tenant_id, array['auxiliar']::public.tenant_role_t[])
    and public.puede_actuar_en_modulo(tenant_id, 'financiero')
  );

alter policy presupuesto_ejecucion_insert_agent on public.presupuesto_ejecucion
  with check (
    public.has_role(tenant_id, array['auxiliar']::public.tenant_role_t[])
    and public.puede_actuar_en_modulo(tenant_id, 'financiero')
  );
