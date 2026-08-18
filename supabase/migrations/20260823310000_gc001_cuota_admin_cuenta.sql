-- ═══════════════════════════════════════════════════════════════════════
--  GC-001 · Cuenta de ingreso "Cuotas de administración" vinculada a
--  CUOTA_ADMIN (20260823290000)
--
--  Aplica al tenant de referencia el mismo patrón operacional/no
--  operacional que ya se usó en el lado de egresos (20260823280000):
--  "Operacionales" (ingreso) → "Cuotas de administración", vinculada al
--  concepto real CUOTA_ADMIN. A partir de esta migración,
--  presupuesto_cuenta_ejecucion() empieza a sumar automáticamente lo
--  facturado real (cargos.monto_original) contra esta cuenta — GC-001 ya
--  tiene cargos reales de CUOTA_ADMIN para 2026-02 (8.333.334 COP,
--  verificado antes de escribir esta migración), así que "Ejecutado" deja
--  de ser siempre $0 en el lado de ingresos.
--
--  Idempotente, igual criterio que 20260823280000.
-- ═══════════════════════════════════════════════════════════════════════

do $$
declare
  v_tenant_id uuid := 'e19a71e3-1b6e-43ca-8307-975ad108eb75'; -- Copropiedad GC-001 (demo)
  v_operacionales_id uuid;
  v_concepto_id uuid;
begin
  if not exists (select 1 from public.tenants where id = v_tenant_id) then
    return; -- GC-001 no existe en este entorno (ej. prod) — no aplica.
  end if;

  select id into v_concepto_id
  from public.conceptos
  where tenant_id = v_tenant_id and codigo = 'CUOTA_ADMIN';

  if v_concepto_id is null then
    return; -- Sin el concepto real todavía — nada que vincular.
  end if;

  select id into v_operacionales_id
  from public.presupuesto_cuenta
  where tenant_id = v_tenant_id and codigo = 'operacionales_ingreso';

  if v_operacionales_id is null then
    insert into public.presupuesto_cuenta (tenant_id, naturaleza, codigo, nombre, orden, nivel, ruta)
    values (v_tenant_id, 'ingreso', 'operacionales_ingreso', 'Operacionales', 1, 0, '')
    returning id into v_operacionales_id;
  end if;

  if not exists (
    select 1 from public.presupuesto_cuenta
    where tenant_id = v_tenant_id and codigo = 'cuotas_administracion'
  ) then
    insert into public.presupuesto_cuenta
      (tenant_id, naturaleza, codigo, nombre, parent_id, orden, concepto_id, nivel, ruta)
    values
      (v_tenant_id, 'ingreso', 'cuotas_administracion', 'Cuotas de administración',
       v_operacionales_id, 1, v_concepto_id, 0, '');
  end if;
end $$;
