-- ═══════════════════════════════════════════════════════════════════════
--  MANT-0 · fix — RECONOCIMIENTO_BIEN_DESAFECTADO SÍ necesita default
--
--  20260930290000 sembró este evento deliberadamente SIN mapeo por
--  defecto ("no inventes cuentas"), razonando que el reconocimiento de un
--  bien desafectado es un caso raro que cada tenant debería mapear solo si
--  le aplica. Verificación end-to-end (tests/contabilidad/
--  alta-parametrizacion-contable.test.ts, PC-3c) muestra que esa lectura
--  contradice una invariante ya cerrada y probada de este repositorio:
--  TODO evento contable global activo tiene un default sembrado al alta —
--  el test compara 1:1 contra el catálogo (`lista_tipos` EVENTO_CONTABLE)
--  precisamente para que un evento nuevo sin mapear se note aquí, no en
--  producción. tests/contabilidad/materializacion.test.ts (CO-3) también
--  falla porque su fixture exige que un tenant recién creado no traiga
--  nada en contable_parametrizacion_pendiente().
--
--  Esto NO inventa una cuenta nueva: 3105 (Patrimonio inicial) ya existe
--  en el PUC vigente y ya es, por diseño de esta serie, la única cuenta
--  de patrimonio genérica disponible para una contrapartida que no encaja
--  en ingreso/gasto (mismo criterio que la comisión previa sobre este
--  mismo evento en fn_mant_capitalizar_activo). El administrador conserva
--  la posibilidad de remapear a otra cuenta de patrimonio si su contador
--  prefiere una subcuenta específica — sembrar un default sensato no le
--  quita esa opción, igual que con GASTO_DEPRECIACION/DEPRECIACION_ACUMULADA/
--  PERDIDA_RETIRO_ACTIVO.
-- ═══════════════════════════════════════════════════════════════════════

update public.lista_tipos
set descripcion = 'Contrapartida patrimonial del reconocimiento inicial de un bien común no '
  'esencial desafectado (Ley 675 art. 20, CTCP 243/2025). Mapeado por defecto a 3105 '
  '(Patrimonio inicial) — la única cuenta de patrimonio genérica del PUC vigente; el tenant '
  'puede remapear a una subcuenta propia si su contador lo prefiere.'
where tipo = 'EVENTO_CONTABLE' and codigo = 'RECONOCIMIENTO_BIEN_DESAFECTADO' and tenant_id is null;

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
    ('PERDIDA_RETIRO_ACTIVO','5890'),        ('RECONOCIMIENTO_BIEN_DESAFECTADO','3105')
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
  '(tenant_id, evento_id). MANT-0 agrega GASTO_DEPRECIACION->5905, '
  'DEPRECIACION_ACUMULADA->1592, PERDIDA_RETIRO_ACTIVO->5890 y '
  'RECONOCIMIENTO_BIEN_DESAFECTADO->3105 (fix: todo evento contable global activo debe tener '
  'un default sembrado al alta, tests/contabilidad/alta-parametrizacion-contable.test.ts lo '
  'exige comparando 1:1 contra el catálogo) — el tenant puede remapear cualquiera de los '
  'cuatro después si su contador prefiere otra cuenta.';

-- ── backfill: tenants ya existentes que quedaron sin este mapeo por la migración original ──
do $$
declare
  v_tenant uuid;
begin
  for v_tenant in select distinct tenant_id from public.contable_cuenta
  loop
    perform public.fn_instanciar_cuentas_default(v_tenant);
  end loop;
end $$;
