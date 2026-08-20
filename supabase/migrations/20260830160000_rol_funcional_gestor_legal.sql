-- ═══════════════════════════════════════════════════════════════════════
--  Cierra el último módulo sin persona: juridico no tenía ningún rol
--  funcional que lo cubriera — decisión del usuario (2026-08-20): nuevo
--  rol funcional "Gestor Legal" (no "Abogado", a propósito: ese nombre ya
--  existe en el catálogo PERSONA_COPROPIEDAD para clasificar al tercero
--  externo sin login — mismo criterio de no repetir el mismo string entre
--  capas distintas que ya se aplicó con agente_administrador en
--  20260830110000).
-- ═══════════════════════════════════════════════════════════════════════

insert into public.lista_tipos (tipo, codigo, nombre, orden) values
  ('ROL_FUNCIONAL', 'gestor_legal', 'Gestor Legal', 5);

insert into public.rol_funcional_modulo (lista_tipos_id, modulo)
select lt.id, 'juridico'
from public.lista_tipos lt
where lt.tipo = 'ROL_FUNCIONAL' and lt.codigo = 'gestor_legal' and lt.tenant_id is null;
