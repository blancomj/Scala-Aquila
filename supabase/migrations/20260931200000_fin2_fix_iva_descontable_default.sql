-- ═══════════════════════════════════════════════════════════════════════
--  FIN-2 · fix — IVA_DESCONTABLE necesita default sembrado al alta
--
--  Encontrado al escribir la prueba 13 (materialización de CO-3), no en
--  producción: `contable_parametrizacion_pendiente()` marca CUALQUIER
--  EVENTO_CONTABLE global activo sin fila en contable_cuenta_default como
--  pendiente para TODO tenant, sin importar si ese evento se usa en el
--  periodo — bloqueando fn_contabilizar_periodo con
--  CONTABLE_PARAMETRIZACION_PENDIENTE incluso para materializaciones que
--  no tienen nada que ver con facturas. Es exactamente el mismo hallazgo
--  que MANT-0 ya documentó para RECONOCIMIENTO_BIEN_DESAFECTADO
--  (20260930350000): "todo evento contable global activo tiene un
--  default sembrado al alta" es invariante cerrada, verificada por
--  tests/contabilidad/alta-parametrizacion-contable.test.ts comparando
--  1:1 contra el catálogo.
--
--  Cuenta elegida: 2505 "Impuesto sobre las ventas (IVA)", ya sembrada
--  por fn_instanciar_plan_contable (permite_movimiento=true, no
--  opcional) — no se inventa cuenta nueva. El PUC de este repositorio no
--  separa IVA generado de IVA descontable en cuentas distintas; débito
--  y crédito contra la misma 2505 es el tratamiento estándar cuando no
--  existe ese desdoble (reduce el IVA por pagar neto). El tenant puede
--  remapear a una subcuenta propia si su contador la crea.
-- ═══════════════════════════════════════════════════════════════════════

update public.lista_tipos
set descripcion = 'Débito del IVA descontable de una factura de proveedor (FIN-2 §3.3). '
  'Mapeado por defecto a 2505 (Impuesto sobre las ventas) — el PUC de este repositorio no '
  'separa IVA generado de descontable en cuentas distintas; el tenant puede remapear a una '
  'subcuenta propia si su contador la crea.'
where tipo = 'EVENTO_CONTABLE' and codigo = 'IVA_DESCONTABLE' and tenant_id is null;

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
    ('IVA_DESCONTABLE','2505')
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
  '(tenant_id, evento_id). FIN-2 agrega IVA_DESCONTABLE->2505 (fix: todo evento contable global '
  'activo debe tener un default sembrado al alta, mismo criterio que MANT-0/'
  'RECONOCIMIENTO_BIEN_DESAFECTADO) — el tenant puede remapear a otra cuenta si su contador '
  'prefiere una subcuenta propia.';

-- ── backfill: tenants ya existentes que quedaron sin este mapeo ───────────────────────────
do $$
declare
  v_tenant uuid;
begin
  for v_tenant in select distinct tenant_id from public.contable_cuenta
  loop
    perform public.fn_instanciar_cuentas_default(v_tenant);
  end loop;
end $$;
