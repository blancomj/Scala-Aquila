-- ═══════════════════════════════════════════════════════════════════════
--  Cierra el módulo de seguridad para cartera_cobranza y estado_cuenta —
--  decisión del usuario (2026-08-20): vocabulario final de módulos
--  restringibles = financiero, cartera_cobranza, juridico, estado_cuenta,
--  mantenimiento (mantenimiento sigue sin tablas, sembrado para el
--  futuro). No se separa "Escalamiento" como módulo aparte de
--  cartera_cobranza — es la misma tabla cartera_etapas, no hay caso real
--  donde alguien necesite uno sin el otro.
--
--  Asociaciones nuevas en rol_funcional_modulo: contador, revisor_fiscal
--  y agente_cobranza también cubren estado_cuenta (conciliación,
--  auditoría financiera y cobranza respectivamente exigen ver cargos/
--  pagos) — sin esto, asignarle el rol "contador" a alguien le habría
--  quitado de golpe la visibilidad de cargos/pagos, que sí necesita.
--  jefe_mantenimiento no gana estado_cuenta — no le compete.
--
--  Mismo patrón que 20260830130000 (alter policy, no drop+create).
-- ═══════════════════════════════════════════════════════════════════════

insert into public.rol_funcional_modulo (lista_tipos_id, modulo)
select lt.id, m.modulo
from public.lista_tipos lt
join (values
  ('contador', 'estado_cuenta'),
  ('revisor_fiscal', 'estado_cuenta'),
  ('agente_cobranza', 'estado_cuenta')
) as m(codigo, modulo) on m.codigo = lt.codigo
where lt.tipo = 'ROL_FUNCIONAL' and lt.tenant_id is null;

-- ── Cartera / Cobranza (módulo 'cartera_cobranza') ──────────────────────
alter policy cartera_etapas_select_miembro on public.cartera_etapas
  using (public.is_member(tenant_id) and public.puede_ver_modulo(tenant_id, 'cartera_cobranza'));

alter policy acciones_cobranza_select_miembro on public.acciones_cobranza
  using (public.is_member(tenant_id) and public.puede_ver_modulo(tenant_id, 'cartera_cobranza'));

alter policy acuerdos_pago_select_miembro on public.acuerdos_pago
  using (public.is_member(tenant_id) and public.puede_ver_modulo(tenant_id, 'cartera_cobranza'));

alter policy acuerdo_pago_cuotas_select_miembro on public.acuerdo_pago_cuotas
  using (public.is_member(tenant_id) and public.puede_ver_modulo(tenant_id, 'cartera_cobranza'));

alter policy promesas_pago_select_miembro on public.promesas_pago
  using (public.is_member(tenant_id) and public.puede_ver_modulo(tenant_id, 'cartera_cobranza'));

alter policy eventos_cartera_select_miembro on public.eventos_cartera
  using (public.is_member(tenant_id) and public.puede_ver_modulo(tenant_id, 'cartera_cobranza'));

-- ── Estado de cuenta (módulo 'estado_cuenta') ────────────────────────────
alter policy cargos_select_agent_auditor on public.cargos
  using (
    public.has_role(tenant_id, array['auxiliar', 'auditor']::public.tenant_role_t[])
    and public.puede_ver_modulo(tenant_id, 'estado_cuenta')
  );

alter policy pagos_select_agent_auditor on public.pagos
  using (
    public.has_role(tenant_id, array['auxiliar', 'auditor']::public.tenant_role_t[])
    and public.puede_ver_modulo(tenant_id, 'estado_cuenta')
  );

alter policy pago_aplicaciones_select_agent_auditor on public.pago_aplicaciones
  using (
    public.has_role(tenant_id, array['auxiliar', 'auditor']::public.tenant_role_t[])
    and public.puede_ver_modulo(tenant_id, 'estado_cuenta')
  );

alter policy novedades_select_agent_auditor on public.novedades
  using (
    public.has_role(tenant_id, array['auxiliar', 'auditor']::public.tenant_role_t[])
    and public.puede_ver_modulo(tenant_id, 'estado_cuenta')
  );
