-- ═══════════════════════════════════════════════════════════════════════
--  Segunda colisión de nomenclatura detectada durante la consolidación de
--  roles (20260830100000): el catálogo lista_tipos.PERSONA_COPROPIEDAD
--  (clasifica al TERCERO externo — sin login — que ocupa un cargo en la
--  copropiedad, vía tenant_tercero_rol.rol_id) tenía un valor con el mismo
--  código 'administrador' que tenant_role_t.administrador (el ROL DE
--  SISTEMA, con login, GAP-CAR-009). Dos conceptos distintos (clasificación
--  de un tercero vs. rol de acceso) compartiendo el mismo string.
--
--  Decisión del usuario (2026-08-20): el rol de sistema queda como
--  'administrador' (ya resuelto en 20260830100000, junto con 'admin' de
--  plataforma). El valor del catálogo se renombra a 'agente_administrador'
--  / "Agente Administrador" para no repetir el string.
--
--  Cambio seguro: tenant_tercero_rol.rol_id referencia lista_tipos por id
--  (bigint FK), no por código — ningún guard ni política filtra por el
--  string 'administrador' de esta familia específica (verificado por
--  grep en todo el repo). Solo se actualiza el dato semilla.
-- ═══════════════════════════════════════════════════════════════════════

update public.lista_tipos
set codigo = 'agente_administrador',
    nombre = 'Agente Administrador'
where tipo = 'PERSONA_COPROPIEDAD'
  and codigo = 'administrador'
  and tenant_id is null;
