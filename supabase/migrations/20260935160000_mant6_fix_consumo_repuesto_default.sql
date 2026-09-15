-- ═══════════════════════════════════════════════════════════════════════
--  MANT-6 Fase 1 · fix — CONSUMO_REPUESTO_MANTENIMIENTO SÍ necesita default
--
--  20260935120000 sembró este evento deliberadamente SIN mapeo por defecto
--  ("no hay un código PUC único obvio, mismo criterio que
--  RECONOCIMIENTO_BIEN_DESAFECTADO") — pero esa cita es exactamente la
--  lectura que 20260930350000 ya había corregido para ese mismo evento:
--  "TODO evento contable global activo tiene un default sembrado al alta"
--  es una invariante cerrada de este repositorio (verificada por
--  tests/contabilidad/alta-parametrizacion-contable.test.ts, PC-3c, que
--  compara 1:1 contra el catálogo EVENTO_CONTABLE). Sin backfill, CUALQUIER
--  tenant (existente o de prueba) que llame fn_contabilizar_periodo queda
--  bloqueado con CONTABLE_PARAMETRIZACION_PENDIENTE aunque nunca haya
--  tocado un repuesto — encontrado corriendo la suite completa al
--  implementar el gap ReteIVA/ReteICA/ICA/depreciación (2026-09-14),
--  regresión en tests/finanzas/facturas-proveedor.test.ts (13) y
--  tests/contabilidad/tributario.test.ts (8).
--
--  5590 'Otros mantenimientos' (clase 55, ya en el PUC vigente) es la
--  cuenta genérica de gasto de mantenimiento sin categoría más específica —
--  mismo criterio de "cuenta canónica ya existente, no inventada" que 3105
--  para RECONOCIMIENTO_BIEN_DESAFECTADO. El tenant conserva la opción de
--  remapear a una cuenta más específica si su contador lo prefiere.
-- ═══════════════════════════════════════════════════════════════════════

update public.lista_tipos
set descripcion = 'Consumo de un repuesto con politica_contable=inventario en una orden de '
  'trabajo (MANT-6 Fase 1, D-127): débito gasto / crédito existencias. Mapeado por defecto a '
  '5590 (Otros mantenimientos) — el tenant puede remapear a una subcuenta más específica '
  '(p. ej. 5505 Ascensores) si su contador lo prefiere.'
where tipo = 'EVENTO_CONTABLE' and codigo = 'CONSUMO_REPUESTO_MANTENIMIENTO' and tenant_id is null;

create or replace function public.fn_instanciar_cuentas_default(p_tenant_id uuid)
returns table (creadas integer, existentes integer)
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_creadas integer := 0;
  v_total   integer;
begin
  if not exists (select 1 from public.tenants where id = p_tenant_id) then
    raise exception 'TENANT_INEXISTENTE: %', p_tenant_id;
  end if;

  insert into public.contable_cuenta_default (tenant_id, evento_id, contable_cuenta_id)
  select p_tenant_id, lt.id, cc.id
  from (values
    ('CARTERA_CUOTA_ORDINARIA','1305'),      ('CARTERA_CUOTA_EXTRAORDINARIA','1310'),
    ('CARTERA_FONDO_IMPREVISTOS','1315'),    ('CARTERA_INTERES_MORA','1320'),
    ('CARTERA_MULTA','1325'),                ('CARTERA_OTROS','1330'),
    ('INGRESO_CUOTA_ORDINARIA','4105'),      ('INGRESO_CUOTA_EXTRAORDINARIA','4110'),
    ('INGRESO_FONDO_IMPREVISTOS','4115'),    ('INGRESO_INTERES_MORA','4205'),
    ('INGRESO_MULTA','4505'),                ('BANCO_RECAUDO','111005'),
    ('CAJA_GENERAL','110505'),               ('PROVEEDOR_BIENES','2205'),
    ('PROVEEDOR_SERVICIOS','2210'),          ('FONDO_IMPREVISTOS_EFECTIVO','111015'),
    ('DETERIORO_CARTERA','1399'),            ('GASTO_DETERIORO_CARTERA','5915'),
    ('RESULTADO_EJERCICIO','3310'),          ('ANTICIPO_COPROPIETARIO','2605'),
    ('RENDIMIENTO_FINANCIERO_FONDO','4605'),
    ('GASTO_DEPRECIACION','5905'),           ('DEPRECIACION_ACUMULADA','1592'),
    ('PERDIDA_RETIRO_ACTIVO','5890'),        ('RECONOCIMIENTO_BIEN_DESAFECTADO','3105'),
    ('IVA_DESCONTABLE','2506'),              ('CONSUMO_REPUESTO_MANTENIMIENTO','5590')
  ) as m(evento, codigo_contable)
  join public.lista_tipos lt
    on lt.tipo = 'EVENTO_CONTABLE' and lt.codigo = m.evento
   and lt.tenant_id is null and lt.activo
  join public.contable_cuenta cc
    on cc.tenant_id = p_tenant_id and cc.codigo = m.codigo_contable
   and cc.permite_movimiento and cc.activa
  on conflict (tenant_id, evento_id) do nothing;

  get diagnostics v_creadas = row_count;

  select count(*) into v_total
  from public.contable_cuenta_default where tenant_id = p_tenant_id;

  return query select v_creadas, (v_total - v_creadas)::integer;
end;
$$;

comment on function public.fn_instanciar_cuentas_default(uuid) is
  'Siembra el mapa evento contable -> cuenta (contable_cuenta_default, PC-3) de una '
  'copropiedad con las cuentas canónicas del PUC PH. Idempotente: ON CONFLICT DO NOTHING por '
  '(tenant_id, evento_id). Fix MANT-6 Fase 1: agrega CONSUMO_REPUESTO_MANTENIMIENTO->5590 (todo '
  'evento contable global activo debe tener un default sembrado al alta, '
  'tests/contabilidad/alta-parametrizacion-contable.test.ts lo exige comparando 1:1 contra el '
  'catálogo) — el tenant puede remapear a otra cuenta si su contador prefiere una más específica.';

-- ── backfill: tenants ya existentes que quedaron sin este mapeo (mismo patrón que 20260930350000) ──
do $$
declare
  v_tenant uuid;
begin
  for v_tenant in select distinct tenant_id from public.contable_cuenta
  loop
    perform public.fn_instanciar_cuentas_default(v_tenant);
  end loop;
end $$;
