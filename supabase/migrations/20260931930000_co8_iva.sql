-- ═══════════════════════════════════════════════════════════════════════
--  CO-8 · IVA
--  Ver CO_08_tributario.md §4.3.
--
--  Fix heredado de FIN-2: IVA_DESCONTABLE (evento contable) se mapeó por
--  necesidad a 2505 (misma cuenta de IVA generado) porque la plantilla
--  PUC_PH_CO nunca tuvo una cuenta propia para IVA descontable
--  (20260931200000, comentario explícito: "el tenant puede remapear... si
--  su contador la crea"). CO-8 es quien crea esa cuenta (spec §4.3,
--  entregable 3) — se corrige el mapeo para todo tenant, existente y
--  futuro, sin tocar ningún otro código de la plantilla.
--
--  IVA generado en ingresos (spec §4.3, "Registro de IVA generado sobre
--  los ingresos gravados") es un concepto DISTINTO del iva_generado de
--  finanzas_facturas_proveedor (ese es el IVA que un PROVEEDOR le cobra a
--  la copropiedad, lado del gasto — ya resuelto por FIN-2). Este es el IVA
--  que la copropiedad cobra al EXPLOTAR bienes comunes (lado del ingreso)
--  — no existe hoy ningún ledger para eso.
--
--  Decisión de diseño confirmada con el usuario (Plan del corte, punto
--  abierto 1, opción 1): tributario_iva_generado es un registro
--  INFORMATIVO — alimenta el resumen y la exógena, pero NO genera ningún
--  asiento contable automático. Extender contable_hechos()/CO-3 para que
--  reconozca esta tabla igual que reconoce facturas sería invasivo sobre
--  el núcleo de materialización y excede "generar la información base"
--  (spec §2 regla 1). La copropiedad sigue registrando el ingreso y el
--  IVA por pagar por el mecanismo manual ya existente (un comprobante o
--  una segunda línea de presupuesto_ejecucion contra 2505).
-- ═══════════════════════════════════════════════════════════════════════

-- ── 1. Cuenta nueva: 2506 IVA descontable ────────────────────────────────
-- 'debito' dentro de una clase 25 'credito' — mismo patrón que las correctoras 1390/1595/1695
-- (guard_contable_cuenta_arbol NO exige que la naturaleza del hijo coincida con el padre).
insert into public.contable_plan_cuenta (
  plan_id, codigo, nombre, naturaleza, permite_movimiento, opcional,
  requiere_tercero, requiere_centro_costo, requiere_fondo, requiere_inmueble
)
select p.id, '2506', 'IVA descontable', 'debito'::public.contable_naturaleza_t, true, false,
  false, false, false, false
from public.contable_plan p
where p.codigo = 'PUC_PH_CO'
on conflict (plan_id, codigo) do nothing;

comment on column public.contable_cuenta.naturaleza is
  'Naturaleza propia de la cuenta — nunca se infiere de la clase (APENDICE_CO.md §"Principios '
  'invariables"). 2506 (IVA descontable, CO-8) es débito dentro de la clase 25 (crédito), mismo '
  'patrón que las correctoras 1390/1595/1695.';

-- parent_id por prefijo (mismo mecanismo que 20260830430000) — solo para la fila nueva.
update public.contable_plan_cuenta h
set parent_id = p.id
from public.contable_plan_cuenta p
where h.codigo = '2506'
  and p.plan_id = h.plan_id
  and p.codigo = left(h.codigo, 2);

-- Instancia 2506 en cada tenant que ya tiene su propio plan de cuentas — idempotente
-- (ON CONFLICT DO NOTHING por tenant+codigo), no toca nada de lo ya existente.
do $$
declare
  v_tenant uuid;
begin
  for v_tenant in select distinct tenant_id from public.contable_cuenta
  loop
    perform public.fn_instanciar_plan_contable(v_tenant);
  end loop;
end $$;

-- ── 2. Corrige el default IVA_DESCONTABLE → 2506 (era 2505) ──────────────
update public.lista_tipos
set descripcion = 'Débito del IVA descontable de una factura de proveedor (FIN-2 §3.3). '
  'Mapeado a 2506 (IVA descontable, cuenta propia agregada por CO-8 §4.3) — antes de CO-8 se '
  'mapeaba a 2505 por no existir una cuenta separada; ver 20260931200000.'
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
    ('IVA_DESCONTABLE','2506')
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
  '(tenant_id, evento_id). CO-8 corrige IVA_DESCONTABLE->2506 (antes 2505, FIN-2 fix temporal '
  'mientras esta cuenta no existía) — el tenant puede remapear a otra cuenta si su contador '
  'prefiere una subcuenta propia.';

-- Corrige el mapeo YA sembrado para tenants existentes (ON CONFLICT DO NOTHING no actualiza
-- filas ya insertadas) — mueve cada fila IVA_DESCONTABLE de 2505 a la 2506 del mismo tenant.
update public.contable_cuenta_default ccd
set contable_cuenta_id = c2506.id, updated_at = now()
from public.lista_tipos lt,
     public.contable_cuenta c2506
where lt.tipo = 'EVENTO_CONTABLE' and lt.codigo = 'IVA_DESCONTABLE' and lt.tenant_id is null
  and ccd.evento_id = lt.id
  and c2506.tenant_id = ccd.tenant_id and c2506.codigo = '2506';

-- ── 3. IVA generado en ingresos (spec §4.3) — registro informativo ───────
create table public.tributario_iva_generado (
  id                        uuid primary key default gen_random_uuid(),
  tenant_id                 uuid not null references public.tenants (id) on delete cascade,
  tercero_id                uuid references public.terceros (id),
  presupuesto_ejecucion_id  uuid references public.presupuesto_ejecucion (id),
  fecha                     date not null,
  base                      numeric(18, 2) not null,
  tarifa                    numeric(5, 2) not null,
  valor                     numeric(18, 2) not null,
  periodo_id                uuid not null references public.periodos (id),
  registrado_por            uuid references public.profiles (id),
  created_at                timestamptz not null default now(),

  constraint tributario_iva_generado_base_valida check (base >= 0),
  constraint tributario_iva_generado_tarifa_valida check (tarifa >= 0),
  constraint tributario_iva_generado_aritmetica_valida check (valor = round(base * tarifa / 100, 2))
);

alter table public.tributario_iva_generado enable row level security;
alter table public.tributario_iva_generado force row level security;

create index tributario_iva_generado_tenant_idx on public.tributario_iva_generado (tenant_id);
create index tributario_iva_generado_periodo_idx on public.tributario_iva_generado (periodo_id);

comment on table public.tributario_iva_generado is
  'CO-8 §4.3: IVA cobrado sobre un ingreso gravado (explotación de bienes comunes) — DISTINTO '
  'del iva_generado de finanzas_facturas_proveedor (ese es el IVA que un proveedor le cobra a '
  'la copropiedad, lado del gasto). Registro INFORMATIVO por decisión explícita del Plan del '
  'corte: alimenta el resumen bimestral/cuatrimestral y la base de exógena, pero NO genera '
  'ningún asiento contable automático — extender contable_hechos()/CO-3 para reconocerlo sería '
  'invasivo sobre el núcleo de materialización y excede "AQUILA genera la información base, no '
  'presenta declaraciones" (spec §2). El asiento (crédito a 2505) lo registra la copropiedad '
  'por el mecanismo manual ya existente. Sin responsable_iva=true (tenants, CO-1) no se puede '
  'insertar (TRIBUTARIO_SIN_RESPONSABLE_IVA).';

create policy tributario_iva_generado_select_miembro
  on public.tributario_iva_generado for select
  to authenticated
  using (public.is_member(tenant_id));

create policy tributario_iva_generado_insert_auxiliar
  on public.tributario_iva_generado for insert
  to authenticated
  with check (public.has_role(tenant_id, array['auxiliar']::public.tenant_role_t[]));

create policy tributario_iva_generado_delete_auxiliar
  on public.tributario_iva_generado for delete
  to authenticated
  using (public.has_role(tenant_id, array['auxiliar']::public.tenant_role_t[]));

-- Append-only salvo borrado (mismo criterio que finanzas_factura_retencion, FIN-2): una fila
-- mal registrada se borra y se vuelve a insertar, nunca se edita.
create trigger tributario_iva_generado_append_only
  before update on public.tributario_iva_generado
  for each row execute function public.forbid_mutation();

create function public.guard_tributario_iva_generado()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not coalesce((select responsable_iva from public.tenants where id = new.tenant_id), false) then
    raise exception 'TRIBUTARIO_SIN_RESPONSABLE_IVA: el tenant % no es responsable de IVA — no '
      'se puede registrar IVA generado (CO-8 §4.3)', new.tenant_id;
  end if;

  if new.periodo_id is not null
     and not exists (select 1 from public.periodos where id = new.periodo_id and tenant_id = new.tenant_id) then
    raise exception 'TENANT_INCONSISTENTE: el periodo % no pertenece al tenant', new.periodo_id;
  end if;

  return new;
end;
$$;

comment on function public.guard_tributario_iva_generado() is
  'CO-8 §4.3: TRIBUTARIO_SIN_RESPONSABLE_IVA si el tenant no es responsable de IVA (CO-1).';

create trigger guard_tributario_iva_generado
  before insert on public.tributario_iva_generado
  for each row execute function public.guard_tributario_iva_generado();

-- ── Reporte: resumen bimestral/cuatrimestral (spec §4.3, "parametrizable, no fijo") ──────
create function public.tributario_resumen_iva(
  p_tenant_id      uuid,
  p_anio           int,
  p_periodo_numero int
)
returns table (
  mes_desde   int,
  mes_hasta   int,
  total_base  numeric,
  total_valor numeric
)
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  v_codigo     text;
  v_meses_por  int;
  v_mes_desde  int;
  v_mes_hasta  int;
begin
  select lt.codigo into v_codigo
  from public.tenants t join public.lista_tipos lt on lt.id = t.iva_periodicidad_id
  where t.id = p_tenant_id;

  if v_codigo is null then
    raise exception 'TRIBUTARIO_PERIODICIDAD_IVA_SIN_CONFIGURAR: el tenant % no tiene '
      'iva_periodicidad_id configurado (CO-8 §4.3)', p_tenant_id;
  end if;

  v_meses_por := case v_codigo when 'bimestral' then 2 when 'cuatrimestral' then 4 end;
  v_mes_desde := (p_periodo_numero - 1) * v_meses_por + 1;
  v_mes_hasta := p_periodo_numero * v_meses_por;

  if v_mes_hasta > 12 or p_periodo_numero < 1 then
    raise exception 'TRIBUTARIO_PERIODO_IVA_INVALIDO: periodo % inválido para periodicidad %',
      p_periodo_numero, v_codigo;
  end if;

  return query
    select v_mes_desde, v_mes_hasta,
      coalesce(sum(g.base), 0), coalesce(sum(g.valor), 0)
    from public.tributario_iva_generado g
    where g.tenant_id = p_tenant_id
      and extract(year from g.fecha) = p_anio
      and extract(month from g.fecha) between v_mes_desde and v_mes_hasta;
end;
$$;

comment on function public.tributario_resumen_iva(uuid, int, int) is
  'CO-8 §4.3: resumen de IVA generado por bimestre (periodicidad=bimestral, p_periodo_numero '
  '1-6) o cuatrimestre (cuatrimestral, 1-3), según tenants.iva_periodicidad_id — parametrizable, '
  'nunca fijo. TRIBUTARIO_PERIODICIDAD_IVA_SIN_CONFIGURAR si el tenant no lo ha definido.';
