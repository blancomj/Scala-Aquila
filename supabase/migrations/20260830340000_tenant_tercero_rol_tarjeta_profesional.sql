-- ═══════════════════════════════════════════════════════════════════════
--  tenant_tercero_rol.numero_tarjeta_profesional — captura opcional al
--  vincular una persona a la copropiedad (contador/revisor fiscal/abogado
--  suelen requerir tarjeta profesional; administrador no siempre).
--  Propietario: sección "Personas vinculadas" de la ficha de copropiedad.
--
--  Nullable y editable (esta tabla sí tiene política UPDATE para agent, a
--  diferencia de documentos) — no es append-only, así que no hace falta el
--  patrón grupo_id/version de otras tablas de este proyecto.
-- ═══════════════════════════════════════════════════════════════════════

alter table public.tenant_tercero_rol add column numero_tarjeta_profesional text;

comment on column public.tenant_tercero_rol.numero_tarjeta_profesional is
  'Número de tarjeta profesional de la persona vinculada, cuando el rol lo requiere '
  '(contador, revisor fiscal, abogado). Opcional — nulo si no aplica.';
