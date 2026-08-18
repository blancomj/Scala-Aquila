-- ═══════════════════════════════════════════════════════════════════════
--  GC-001 · Clasificación Operacional/No operacional (E8/E9 seguimiento)
--
--  Gap identificado en el gap analysis original (Casos de uso/Presupuesto):
--  el Estado de Resultado Integral real (Almendro P.H.) clasifica TANTO
--  ingresos como egresos en OPERACIONALES/NO OPERACIONALES — una
--  dimensión que presupuesto_cuenta no necesitaba modelar como columna
--  nueva ("dato, no esquema"): el árbol jerárquico de E8 ya la soporta
--  como un nodo nivel-1 más, usando exactamente el mecanismo de
--  reparentado que 20260823210000/20260823220000 ya dejaron seguro.
--
--  Este corte aplica el patrón al catálogo real de GC-001 (el tenant de
--  referencia): las 6 cuentas de egreso existentes (Administración,
--  Vigilancia, Aseo, Mantenimiento, Servicios Públicos, Seguros) son, en
--  el documento real, gasto operativo — se reparentan bajo una nueva
--  cuenta nivel-1 "Operacionales". No se crea "No operacionales" todavía
--  (GC-001 no tiene hoy ningún egreso de esa naturaleza real — financieros,
--  extraordinarios — fabricar una cuenta vacía sería inventar dato que no
--  existe); se crea cuando aparezca el primer gasto real de ese tipo.
--
--  Reparentar no cambia monto_anual de ninguna hoja, así que
--  monto_total/presupuesto_cuenta_totales/presupuesto_cuenta_ejecucion
--  siguen cuadrando exactamente igual — verificado en dev antes de
--  escribir esta migración (Σ hojas = 120.000.000, igual que antes).
--
--  Idempotente: si 'operacionales' ya existe para este tenant (replay),
--  no se reinserta; el reparentado se reintenta siempre (es un no-op si
--  parent_id ya coincide — guard_presupuesto_cuenta_arbol solo recalcula
--  nivel/ruta, no cambia semántica).
-- ═══════════════════════════════════════════════════════════════════════

do $$
declare
  v_tenant_id uuid := 'e19a71e3-1b6e-43ca-8307-975ad108eb75'; -- Copropiedad GC-001 (demo)
  v_operacionales_id uuid;
begin
  if not exists (select 1 from public.tenants where id = v_tenant_id) then
    return; -- GC-001 no existe en este entorno (ej. prod) — no aplica.
  end if;

  select id into v_operacionales_id
  from public.presupuesto_cuenta
  where tenant_id = v_tenant_id and codigo = 'operacionales';

  if v_operacionales_id is null then
    insert into public.presupuesto_cuenta (tenant_id, naturaleza, codigo, nombre, orden, nivel, ruta)
    values (v_tenant_id, 'egreso', 'operacionales', 'Operacionales', 1, 0, '')
    returning id into v_operacionales_id;
  end if;

  update public.presupuesto_cuenta
  set parent_id = v_operacionales_id
  where tenant_id = v_tenant_id
    and codigo in ('administracion', 'vigilancia', 'aseo', 'mantenimiento', 'servicios_publicos', 'seguros');
end $$;
