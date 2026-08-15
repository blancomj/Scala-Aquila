-- ═══════════════════════════════════════════════════════════════════════
--  F6 · Motor Presupuestal — cierra el GAP-19 de OTROS_INGRESOS_ANUAL en
--  el propio Golden Case GC-001 (paso0/INFORME_PASO_0.md §3.1: "Otros
--  ingresos anuales 20.000.000 COP", documentado desde F2 pero nunca
--  representable hasta que 20260814200000_motor_presupuestal_financiacion.sql
--  creó `fuente_financiacion`).
--
--  El presupuesto de GC-001 ya quedó 'vigente' en
--  20260814100400_seed_gc001.sql, y guard_fuente_financiacion (20260814200000)
--  rechaza insertar fuente_financiacion sobre un presupuesto vigente/cerrado
--  — por diseño, para escritura normal de la app. Este seed representa un
--  dato de entrada retroactivo del propio golden case (no una operación de
--  usuario), así que se inserta con el guard desactivado puntualmente para
--  esta sola sentencia, en vez de forzar el ciclo borrador→vigente que ya
--  no aplica a una fila histórica inmutable (guard_presupuesto_inmutable).
-- ═══════════════════════════════════════════════════════════════════════

do $$
declare
  v_tenant_id      uuid;
  v_presupuesto_id uuid;
begin
  select id into v_tenant_id from public.tenants where slug = 'gc-001';
  if v_tenant_id is null then
    raise exception 'seed gc-001 no encontrado — corre 20260814100400_seed_gc001.sql primero';
  end if;

  select id into v_presupuesto_id
    from public.presupuestos
   where tenant_id = v_tenant_id and anio = 2026 and estado = 'vigente';
  if v_presupuesto_id is null then
    raise exception 'presupuesto vigente 2026 de gc-001 no encontrado';
  end if;

  alter table public.fuente_financiacion disable trigger guard_fuente_financiacion;

  insert into public.fuente_financiacion (
    tenant_id, presupuesto_id, tipo, valor_disponible, valor_aplicado, descripcion
  ) values (
    v_tenant_id, v_presupuesto_id, 'otros_ingresos', 20_000_000, 20_000_000,
    'paso0/INFORME_PASO_0.md §3.1 — otros ingresos anuales del golden case'
  );

  alter table public.fuente_financiacion enable trigger guard_fuente_financiacion;
end $$;
