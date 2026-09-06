-- ═══════════════════════════════════════════════════════════════════════
--  MANT-1 · Fix: `activos`/`activo_estado_historial` (MANT-0) tenían
--  ENABLE + FORCE ROW LEVEL SECURITY pero CERO políticas — inaccesibles
--  para cualquier cliente autenticado real, solo el service_role podía
--  leerlas o escribirlas
--
--  Encontrado al verificar en el navegador la primera UI real construida
--  sobre `activos` (ninguna existía hasta este corte, MANT-0 §"Qué NO se
--  implementó"): `activos.select('*').eq('id', ...).single()` devolvía 0
--  filas para un administrador con membresía activa en el tenant dueño de
--  la fila, aun confirmando por service_role que la fila y el tenant_id
--  eran correctos. `grep -c "create policy" 20260930280000_mant0_
--  activos_catalogo.sql 20260930290000_mant0_depreciacion_ppe.sql
--  20260930340000_mant0_fundamento_normativo.sql
--  20260930350000_mant0_fix_reconocimiento_bien_desafectado_default.sql`
--  → 0 en los cuatro archivos. Ningún test de MANT-0 lo detectó porque su
--  suite usa exclusivamente el cliente admin (service_role, bypassa RLS)
--  para todo el CRUD de `activos` — nunca un cliente autenticado real.
--
--  No es relajar un guard: es completar una política de autorización que
--  nunca se escribió (Definición de Terminado del marco: "autorización
--  aplicada en UI y en RLS"). Mismo patrón ya usado en el resto del
--  repositorio (is_member para lectura, has_role(auxiliar) para
--  escritura). Sin política de DELETE a propósito: un activo nunca se
--  borra físicamente, solo transiciona a 'retirado'/'dispuesto'
--  (guard_activo_transicion, MANT-0 §4.3).
-- ═══════════════════════════════════════════════════════════════════════

create policy activos_select_miembro
  on public.activos for select
  to authenticated
  using (public.is_member(tenant_id));

create policy activos_insert_auxiliar
  on public.activos for insert
  to authenticated
  with check (public.has_role(tenant_id, array['auxiliar']::public.tenant_role_t[]));

create policy activos_update_auxiliar
  on public.activos for update
  to authenticated
  using (public.has_role(tenant_id, array['auxiliar']::public.tenant_role_t[]))
  with check (public.has_role(tenant_id, array['auxiliar']::public.tenant_role_t[]));

create policy activo_estado_historial_select_miembro
  on public.activo_estado_historial for select
  to authenticated
  using (public.is_member(tenant_id));

create policy activo_estado_historial_insert_auxiliar
  on public.activo_estado_historial for insert
  to authenticated
  with check (public.has_role(tenant_id, array['auxiliar']::public.tenant_role_t[]));

-- Mismo gap, mismo hallazgo (mismo grep de 0 coincidencias), en `mant_depreciacion_detalle`
-- (20260930290000) — solo lectura por miembro: la puebla exclusivamente
-- fn_mant_reconocer_depreciacion (SECURITY DEFINER), ningún cliente inserta ahí directo.
create policy mant_depreciacion_detalle_select_miembro
  on public.mant_depreciacion_detalle for select
  to authenticated
  using (public.is_member(tenant_id));
