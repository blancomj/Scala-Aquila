-- ═══════════════════════════════════════════════════════════════════════
--  CO-9 · Vocabulario — CO_09_gobierno_y_asamblea.md §4.1/§4.2, parche
--  CO_09_PARCHE_FRONTERA_GOBIERNO.md.
--
--  TIPO_OPINION_DICTAMEN va a lista_tipos, no a un enum nuevo (D-24): el
--  tipo de opinión del revisor fiscal es vocabulario descriptivo que no
--  gatilla ninguna transición de estado — contable_dictamen no ramifica su
--  comportamiento según cuál sea (a diferencia de gobierno_decision_estado_t,
--  que sí gobierna transiciones reales).
--
--  tenants.tiene_revisor_fiscal: mismo patrón que uso_economico (CO-1,
--  20260930160000) — nullable, sin valor sembrado (marco §6.6): el caso
--  residencial se remite al reglamento de cada copropiedad, nunca se decide
--  por código (§4.2 del corte, vinculante).
-- ═══════════════════════════════════════════════════════════════════════

insert into public.tipos (codigo, nombre, descripcion) values
  ('TIPO_OPINION_DICTAMEN', 'Tipo de opinión del dictamen del revisor fiscal',
   'Vocabulario puro (CO-9 §4.2) — no gatilla ninguna transición de contable_dictamen.')
on conflict (codigo) do nothing;

insert into public.lista_tipos (tipo, codigo, nombre, orden) values
  ('TIPO_OPINION_DICTAMEN', 'limpia', 'Limpia (sin salvedades)', 10),
  ('TIPO_OPINION_DICTAMEN', 'con_salvedades', 'Con salvedades', 20),
  ('TIPO_OPINION_DICTAMEN', 'adversa', 'Adversa', 30),
  ('TIPO_OPINION_DICTAMEN', 'abstencion', 'Abstención de opinión', 40)
on conflict (tipo, codigo, tenant_id) do nothing;

insert into public.lista_tipos (tipo, codigo, nombre, orden) values
  ('TIPO_DOCUMENTO', 'certificacion_estados_financieros', 'Certificación de estados financieros', 26),
  ('TIPO_DOCUMENTO', 'dictamen_revisor_fiscal', 'Dictamen del revisor fiscal', 27),
  ('TIPO_DOCUMENTO', 'rendicion_cuentas', 'Paquete de rendición de cuentas', 28)
on conflict (tipo, codigo, tenant_id) do nothing;

alter table public.tenants
  add column tiene_revisor_fiscal boolean;

comment on column public.tenants.tiene_revisor_fiscal is
  'CO-9 §4.2: marca manual, solo para uso_economico=residencial (comercial/mixto ya lo exige por '
  'Ley 675 art. 56 sin necesitar esta columna). NUNCA se infiere automáticamente para el caso '
  'residencial — remisión al reglamento de cada copropiedad (marco §4). NULL = no decidido.';
