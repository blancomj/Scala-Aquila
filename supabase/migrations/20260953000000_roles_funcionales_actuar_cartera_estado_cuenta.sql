-- ═══════════════════════════════════════════════════════════════════════
--  Roles funcionales — dimensión ver/actuar, enforcement en escritura.
--  Cartera/Cobranza + Estado de cuenta — mismo agrupamiento y mismo
--  patrón (alter policy) que 20260830150000 usó para SELECT.
--
--  eventos_cartera, cargos, pagos y pago_aplicaciones NO aparecen aquí:
--  no tienen ninguna policy de insert/update/delete para `authenticated`
--  (solo service_role vía Edge Function) — no hay nada que gatear, ya
--  están más restringidas de lo que puede_actuar_en_modulo() lograría.
--
--  Guards de transición en triggers (maker-checker de cartera, append-
--  only) no se tocan — siguen aplicando encima sin cambios.
-- ═══════════════════════════════════════════════════════════════════════

-- ── Cartera / Cobranza (módulo 'cartera_cobranza') ──────────────────────

alter policy cartera_etapas_insert_agent on public.cartera_etapas
  with check (
    public.has_role(tenant_id, array['auxiliar']::public.tenant_role_t[])
    and public.puede_actuar_en_modulo(tenant_id, 'cartera_cobranza')
  );

alter policy cartera_etapas_update_agent on public.cartera_etapas
  using (
    public.has_role(tenant_id, array['auxiliar']::public.tenant_role_t[])
    and public.puede_actuar_en_modulo(tenant_id, 'cartera_cobranza')
  )
  with check (
    public.has_role(tenant_id, array['auxiliar']::public.tenant_role_t[])
    and public.puede_actuar_en_modulo(tenant_id, 'cartera_cobranza')
  );

alter policy acciones_cobranza_insert_agent on public.acciones_cobranza
  with check (
    public.has_role(tenant_id, array['auxiliar']::public.tenant_role_t[])
    and public.puede_actuar_en_modulo(tenant_id, 'cartera_cobranza')
  );

alter policy acciones_cobranza_update_agent on public.acciones_cobranza
  using (
    public.has_role(tenant_id, array['auxiliar']::public.tenant_role_t[])
    and public.puede_actuar_en_modulo(tenant_id, 'cartera_cobranza')
  )
  with check (
    public.has_role(tenant_id, array['auxiliar']::public.tenant_role_t[])
    and public.puede_actuar_en_modulo(tenant_id, 'cartera_cobranza')
  );

alter policy acuerdos_pago_insert_agent on public.acuerdos_pago
  with check (
    public.has_role(tenant_id, array['auxiliar']::public.tenant_role_t[])
    and public.puede_actuar_en_modulo(tenant_id, 'cartera_cobranza')
  );

alter policy acuerdos_pago_update_agent on public.acuerdos_pago
  using (
    public.has_role(tenant_id, array['auxiliar']::public.tenant_role_t[])
    and public.puede_actuar_en_modulo(tenant_id, 'cartera_cobranza')
  )
  with check (
    public.has_role(tenant_id, array['auxiliar']::public.tenant_role_t[])
    and public.puede_actuar_en_modulo(tenant_id, 'cartera_cobranza')
  );

alter policy acuerdo_pago_cuotas_insert_agent on public.acuerdo_pago_cuotas
  with check (
    public.has_role(tenant_id, array['auxiliar']::public.tenant_role_t[])
    and public.puede_actuar_en_modulo(tenant_id, 'cartera_cobranza')
  );

alter policy acuerdo_pago_cuotas_update_agent on public.acuerdo_pago_cuotas
  using (
    public.has_role(tenant_id, array['auxiliar']::public.tenant_role_t[])
    and public.puede_actuar_en_modulo(tenant_id, 'cartera_cobranza')
  )
  with check (
    public.has_role(tenant_id, array['auxiliar']::public.tenant_role_t[])
    and public.puede_actuar_en_modulo(tenant_id, 'cartera_cobranza')
  );

alter policy promesas_pago_insert_agent on public.promesas_pago
  with check (
    public.has_role(tenant_id, array['auxiliar']::public.tenant_role_t[])
    and public.puede_actuar_en_modulo(tenant_id, 'cartera_cobranza')
  );

alter policy promesas_pago_update_agent on public.promesas_pago
  using (
    public.has_role(tenant_id, array['auxiliar']::public.tenant_role_t[])
    and public.puede_actuar_en_modulo(tenant_id, 'cartera_cobranza')
  )
  with check (
    public.has_role(tenant_id, array['auxiliar']::public.tenant_role_t[])
    and public.puede_actuar_en_modulo(tenant_id, 'cartera_cobranza')
  );

-- ── Estado de cuenta (módulo 'estado_cuenta') ────────────────────────────
--  novedades conserva su condición extra (estado = 'pendiente') — solo se
--  le agrega puede_actuar_en_modulo, no se toca lo demás.

alter policy novedades_insert_agent on public.novedades
  with check (
    public.has_role(tenant_id, array['auxiliar']::public.tenant_role_t[])
    and estado = 'pendiente'
    and public.puede_actuar_en_modulo(tenant_id, 'estado_cuenta')
  );
