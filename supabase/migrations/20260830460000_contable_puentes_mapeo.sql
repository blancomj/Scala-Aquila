-- ═══════════════════════════════════════════════════════════════════════
--  PC-3 · Puentes entre lo que ya existe y el plan de cuentas contable
--
--  Cierra G-07, G-08, G-15 y G-16 del gap analysis (PC-00 §3). Es la fase
--  en la que el catálogo de PC-1/PC-2 deja de ser un catálogo aislado y
--  queda conectado a las operaciones que AQUILA ya produce.
--
--  Tres puentes y un mapa:
--
--    presupuesto_cuenta.contable_cuenta_id   N:1  — el egreso/ingreso
--    fondos.contable_cuenta_id               1:1  — el efectivo restringido
--    cuentas_bancarias.contable_cuenta_id    1:1  — dónde entra el recaudo
--    contable_cuenta_default (tenant, evento) — lo que no nace del árbol
--
--  Por qué N:1 en presupuesto_cuenta y no 1:1: es el punto central de todo
--  el diseño (PC-00 §2). Las 19 cuentas presupuestales "Torre 1..19" que
--  cuelgan de "Energía eléctrica — torres" mapean TODAS a 5405; las tres
--  de usufructo (vehículos, motos, bicicletero) mapean a 4310. El detalle
--  no se pierde: vive en agrupacion_id / centro_costo_id del movimiento y
--  en el propio árbol presupuestal.
--
--  Por qué EVENTO_CONTABLE en lista_tipos y no un enum: mismo patrón exacto
--  que novedad_tipo_cuenta (20260830240000), que mapea lista_tipos
--  TIPO_NOVEDAD -> presupuesto_cuenta. El vocabulario de eventos debe poder
--  crecer cuando llegue el motor de reglas (prompt maestro §16 pide que el
--  evento sea configurable), y D-24 desaconseja un enum para eso.
--
--  Cada entrada del mapa define UNA cuenta con un rol, no un asiento
--  completo: CARTERA_CUOTA_ORDINARIA es la cuenta que se debita y
--  INGRESO_CUOTA_ORDINARIA la que se acredita. Esto es el catálogo de
--  "cuentas predeterminadas" del prompt §55, no el motor de reglas de doble
--  partida (§16/§47) — ese es una etapa posterior y se apoyará en este mapa.
-- ═══════════════════════════════════════════════════════════════════════

-- ═══════════════════════════════════════════════════════════════════════
--  1. Validación común de un puente hacia una cuenta contable
-- ═══════════════════════════════════════════════════════════════════════
-- Toda columna que apunte a contable_cuenta exige lo mismo: existe, es del propio tenant,
-- está activa y admite movimiento. Se centraliza para que los cuatro guards de abajo no
-- repitan las cuatro comprobaciones (y no se desincronicen con el tiempo).
create function public.validar_cuenta_contable_destino(
  p_cuenta_id uuid,
  p_tenant_id uuid,
  p_prefijo_codigo text default null
)
returns public.contable_cuenta
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_cuenta public.contable_cuenta%rowtype;
begin
  select * into v_cuenta from public.contable_cuenta where id = p_cuenta_id;

  if v_cuenta.id is null then
    raise exception 'CUENTA_CONTABLE_INEXISTENTE: contable_cuenta_id % no existe', p_cuenta_id;
  end if;

  if v_cuenta.tenant_id <> p_tenant_id then
    raise exception 'CUENTA_CONTABLE_TENANT_INCONSISTENTE: la cuenta % pertenece a otro tenant',
      p_cuenta_id;
  end if;

  if not v_cuenta.permite_movimiento then
    raise exception 'CUENTA_CONTABLE_NO_ADMITE_MOVIMIENTO: % (%) agrupa subcuentas — solo una '
      'cuenta de movimiento puede recibir imputaciones', v_cuenta.codigo, v_cuenta.nombre;
  end if;

  if not v_cuenta.activa then
    raise exception 'CUENTA_CONTABLE_INACTIVA: % (%) está desactivada', v_cuenta.codigo,
      v_cuenta.nombre;
  end if;

  if p_prefijo_codigo is not null
     and left(v_cuenta.codigo, length(p_prefijo_codigo)) <> p_prefijo_codigo then
    raise exception 'CUENTA_CONTABLE_CLASE_INCOMPATIBLE: % (%) no corresponde al grupo % '
      'exigido para este vínculo', v_cuenta.codigo, v_cuenta.nombre, p_prefijo_codigo;
  end if;

  return v_cuenta;
end;
$$;

comment on function public.validar_cuenta_contable_destino(uuid, uuid, text) is
  'Validación compartida por todos los puentes hacia contable_cuenta (PC-3): existencia, '
  'tenant, permite_movimiento, activa y, opcionalmente, prefijo de código exigido (ej. "11" '
  'para vínculos que deben apuntar a efectivo y equivalentes). Devuelve la fila para que el '
  'guard llamador siga validando lo suyo.';

-- ═══════════════════════════════════════════════════════════════════════
--  2. Puente principal: cuenta presupuestal -> cuenta contable
-- ═══════════════════════════════════════════════════════════════════════

alter table public.presupuesto_cuenta
  add column contable_cuenta_id uuid references public.contable_cuenta (id);

comment on column public.presupuesto_cuenta.contable_cuenta_id is
  'Cuenta contable de movimiento que representa esta partida presupuestal (PC-3). N:1 a '
  'propósito: varias cuentas presupuestales pueden compartir cuenta contable (las 19 torres de '
  'energía -> 5405), porque lo que las distingue es una dimensión del movimiento '
  '(agrupacion_id, centro_costo_id), no una cuenta distinta — prompt maestro §12/§59/§81. '
  'NULL = sin clasificar contablemente; contable_parametrizacion_pendiente() las reporta.';

create index presupuesto_cuenta_contable_idx
  on public.presupuesto_cuenta (contable_cuenta_id)
  where contable_cuenta_id is not null;

-- Guard: además de lo común, la clase contable debe concordar con la naturaleza presupuestal.
-- Es la validación que hace imposible el error de clasificación más frecuente — imputar un
-- egreso a una cuenta de ingreso, o al revés.
create function public.guard_presupuesto_cuenta_contable()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_cuenta public.contable_cuenta%rowtype;
begin
  if new.contable_cuenta_id is null then
    return new;
  end if;

  v_cuenta := public.validar_cuenta_contable_destino(new.contable_cuenta_id, new.tenant_id);

  if new.naturaleza = 'egreso' and v_cuenta.clase not in (5, 6) then
    raise exception 'CUENTA_CONTABLE_CLASE_INCOMPATIBLE: % (%) es de clase % — una cuenta '
      'presupuestal de egreso solo puede mapear a gastos (5) o costos (6)',
      v_cuenta.codigo, v_cuenta.nombre, v_cuenta.clase;
  end if;

  if new.naturaleza = 'ingreso' and v_cuenta.clase <> 4 then
    raise exception 'CUENTA_CONTABLE_CLASE_INCOMPATIBLE: % (%) es de clase % — una cuenta '
      'presupuestal de ingreso solo puede mapear a la clase 4',
      v_cuenta.codigo, v_cuenta.nombre, v_cuenta.clase;
  end if;

  return new;
end;
$$;

create trigger guard_presupuesto_cuenta_contable
  before insert or update of contable_cuenta_id, naturaleza on public.presupuesto_cuenta
  for each row execute function public.guard_presupuesto_cuenta_contable();

-- ═══════════════════════════════════════════════════════════════════════
--  3. Fondos y cuentas bancarias -> efectivo (grupo 11)
-- ═══════════════════════════════════════════════════════════════════════

alter table public.fondos
  add column contable_cuenta_id uuid references public.contable_cuenta (id);

comment on column public.fondos.contable_cuenta_id is
  'Cuenta de efectivo restringido que materializa el fondo (PC-3) — típicamente 111015 para el '
  'fondo de imprevistos. Se exige grupo 11 porque, según el CTCP (Concepto 0146/2025), el fondo '
  'NO es pasivo ni patrimonio sino un activo restringido: ver PC_01 §3.2.';

alter table public.cuentas_bancarias
  add column contable_cuenta_id uuid references public.contable_cuenta (id);

comment on column public.cuentas_bancarias.contable_cuenta_id is
  'Cuenta contable de esta cuenta bancaria (PC-3) — 111005 corriente, 111010 ahorros, 111015 '
  'la del fondo de imprevistos. Sin esto, el crédito de un pago no sabe a qué cuenta de banco '
  'apuntar cuando la copropiedad maneja varias.';

create function public.guard_vinculo_cuenta_efectivo()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.contable_cuenta_id is null then
    return new;
  end if;

  -- Prefijo '11': efectivo y equivalentes. Cubre caja (1105xx) y bancos (1110xx).
  perform public.validar_cuenta_contable_destino(new.contable_cuenta_id, new.tenant_id, '11');

  return new;
end;
$$;

create trigger guard_fondo_cuenta_contable
  before insert or update of contable_cuenta_id on public.fondos
  for each row execute function public.guard_vinculo_cuenta_efectivo();

create trigger guard_cuenta_bancaria_contable
  before insert or update of contable_cuenta_id on public.cuentas_bancarias
  for each row execute function public.guard_vinculo_cuenta_efectivo();

-- ═══════════════════════════════════════════════════════════════════════
--  4. Cuentas predeterminadas por evento (prompt maestro §55)
-- ═══════════════════════════════════════════════════════════════════════

insert into public.tipos (codigo, nombre, descripcion) values (
  'EVENTO_CONTABLE',
  'Evento contable',
  'Hecho económico que AQUILA ya produce en otro módulo (causar una cuota, recaudar un pago, '
  'registrar un gasto) y que necesita una cuenta contable predeterminada para poder '
  'representarse. Cada evento nombra UNA cuenta con un rol —la que se debita o la que se '
  'acredita—, no un asiento completo: el asiento lo arma quien consume el mapa.'
);

insert into public.lista_tipos (tipo, codigo, nombre, descripcion, orden) values
  ('EVENTO_CONTABLE', 'CARTERA_CUOTA_ORDINARIA',      'Cartera — cuota ordinaria',        'Débito al causar la cuota de administración', 10),
  ('EVENTO_CONTABLE', 'CARTERA_CUOTA_EXTRAORDINARIA', 'Cartera — cuota extraordinaria',   'Débito al causar una cuota extraordinaria', 20),
  ('EVENTO_CONTABLE', 'CARTERA_FONDO_IMPREVISTOS',    'Cartera — fondo de imprevistos',   'Débito por la parte causada y no recaudada del fondo (CTCP 01(445)/2018)', 30),
  ('EVENTO_CONTABLE', 'CARTERA_INTERES_MORA',         'Cartera — intereses de mora',      'Débito al causar intereses', 40),
  ('EVENTO_CONTABLE', 'CARTERA_MULTA',                'Cartera — multas y sanciones',     'Débito al causar una multa', 50),
  ('EVENTO_CONTABLE', 'CARTERA_OTROS',                'Cartera — otros conceptos',        'Débito por conceptos facturados sin cuenta propia', 60),
  ('EVENTO_CONTABLE', 'INGRESO_CUOTA_ORDINARIA',      'Ingreso — cuota ordinaria',        'Crédito del devengo de la cuota de administración', 70),
  ('EVENTO_CONTABLE', 'INGRESO_CUOTA_EXTRAORDINARIA', 'Ingreso — cuota extraordinaria',   'Crédito del devengo de una cuota extraordinaria', 80),
  ('EVENTO_CONTABLE', 'INGRESO_FONDO_IMPREVISTOS',    'Ingreso — cuota fondo imprevistos','Crédito del devengo del fondo; el CTCP pide presentarlo separado de la cuota ordinaria', 90),
  ('EVENTO_CONTABLE', 'INGRESO_INTERES_MORA',         'Ingreso — intereses de mora',      'Crédito del devengo de intereses', 100),
  ('EVENTO_CONTABLE', 'INGRESO_MULTA',                'Ingreso — multas',                 'Crédito del devengo de una multa', 110),
  ('EVENTO_CONTABLE', 'BANCO_RECAUDO',                'Banco de recaudo',                 'Débito al recibir un pago, cuando no se identifica una cuenta bancaria concreta', 120),
  ('EVENTO_CONTABLE', 'CAJA_GENERAL',                 'Caja general',                     'Débito de un recaudo en efectivo', 130),
  ('EVENTO_CONTABLE', 'PROVEEDOR_BIENES',             'Proveedores de bienes',            'Crédito de un gasto que queda por pagar a un proveedor de bienes', 140),
  ('EVENTO_CONTABLE', 'PROVEEDOR_SERVICIOS',          'Proveedores de servicios',         'Crédito de un gasto que queda por pagar a un proveedor de servicios', 150),
  ('EVENTO_CONTABLE', 'FONDO_IMPREVISTOS_EFECTIVO',   'Fondo de imprevistos (efectivo)',  'Efectivo restringido del fondo — no es pasivo ni patrimonio (CTCP 0146/2025)', 160),
  ('EVENTO_CONTABLE', 'DETERIORO_CARTERA',            'Deterioro de cartera (correctora)','Crédito correctora del activo al reconocer deterioro', 170),
  ('EVENTO_CONTABLE', 'GASTO_DETERIORO_CARTERA',      'Gasto por deterioro de cartera',   'Débito al reconocer el deterioro', 180),
  ('EVENTO_CONTABLE', 'RESULTADO_EJERCICIO',          'Excedente o déficit del ejercicio','Cuenta de cierre del resultado', 190);

create table public.contable_cuenta_default (
  tenant_id          uuid   not null references public.tenants (id) on delete cascade,
  evento_id          bigint not null references public.lista_tipos (id),
  contable_cuenta_id uuid   not null references public.contable_cuenta (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz,
  primary key (tenant_id, evento_id)
);

comment on table public.contable_cuenta_default is
  'Cuentas predeterminadas por evento y copropiedad (prompt maestro §55). Cubre lo que no nace '
  'del árbol presupuestal: cartera, bancos, proveedores, deterioro, cierre. Con este mapa más '
  'presupuesto_cuenta.contable_cuenta_id, todo movimiento que AQUILA produce hoy tiene cuenta '
  'contable — que es la definición operativa de "el plan de cuentas está listo".';

create index contable_cuenta_default_cuenta_idx
  on public.contable_cuenta_default (contable_cuenta_id);

alter table public.contable_cuenta_default enable row level security;
alter table public.contable_cuenta_default force row level security;

create trigger set_updated_at before update on public.contable_cuenta_default
  for each row execute function public.set_updated_at();

-- Mismo criterio que novedad_tipo_cuenta: es configuración de catálogo, no lleva cifras.
create policy contable_cuenta_default_select_miembro on public.contable_cuenta_default
  for select to authenticated using (public.is_member(tenant_id));
create policy contable_cuenta_default_insert_auxiliar on public.contable_cuenta_default
  for insert to authenticated
  with check (public.has_role(tenant_id, array['auxiliar']::public.tenant_role_t[]));
create policy contable_cuenta_default_update_auxiliar on public.contable_cuenta_default
  for update to authenticated
  using (public.has_role(tenant_id, array['auxiliar']::public.tenant_role_t[]))
  with check (public.has_role(tenant_id, array['auxiliar']::public.tenant_role_t[]));
create policy contable_cuenta_default_delete_auxiliar on public.contable_cuenta_default
  for delete to authenticated
  using (public.has_role(tenant_id, array['auxiliar']::public.tenant_role_t[]));

create function public.guard_contable_cuenta_default()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_familia text;
  v_evento_tenant uuid;
begin
  select tipo, tenant_id into v_familia, v_evento_tenant
  from public.lista_tipos where id = new.evento_id;

  if v_familia is distinct from 'EVENTO_CONTABLE' then
    raise exception 'EVENTO_CONTABLE_INVALIDO: evento_id % no pertenece a EVENTO_CONTABLE (es %)',
      new.evento_id, coalesce(v_familia, 'inexistente');
  end if;

  if v_evento_tenant is not null and v_evento_tenant <> new.tenant_id then
    raise exception 'EVENTO_CONTABLE_INVALIDO: el evento % pertenece a otro tenant',
      new.evento_id;
  end if;

  perform public.validar_cuenta_contable_destino(new.contable_cuenta_id, new.tenant_id);

  return new;
end;
$$;

create trigger guard_contable_cuenta_default
  before insert or update on public.contable_cuenta_default
  for each row execute function public.guard_contable_cuenta_default();

-- ═══════════════════════════════════════════════════════════════════════
--  5. Diagnóstico de parametrización
--
--  Mitiga R-2 del análisis (PC-00 §7): sin esto, una cuenta presupuestal
--  nueva sin mapear desaparecería en silencio de cualquier exportación
--  contable. El prompt §55 lo exige explícitamente: el sistema debe decir
--  qué falta parametrizar, no fallar callado.
-- ═══════════════════════════════════════════════════════════════════════
create function public.contable_parametrizacion_pendiente(p_tenant_id uuid)
returns table (ambito text, referencia text, detalle text)
language sql
stable
set search_path = ''
as $$
  select 'cuenta_presupuestal', pc.codigo, pc.nombre
  from public.presupuesto_cuenta pc
  where pc.tenant_id = p_tenant_id
    and pc.es_hoja and pc.activa and pc.contable_cuenta_id is null
  union all
  select 'evento_contable', lt.codigo, lt.nombre
  from public.lista_tipos lt
  where lt.tipo = 'EVENTO_CONTABLE'
    and (lt.tenant_id is null or lt.tenant_id = p_tenant_id)
    and lt.activo
    and not exists (
      select 1 from public.contable_cuenta_default d
      where d.tenant_id = p_tenant_id and d.evento_id = lt.id
    )
  union all
  select 'fondo', f.nombre, 'sin cuenta de efectivo restringido asociada'
  from public.fondos f
  where f.tenant_id = p_tenant_id and f.contable_cuenta_id is null
  union all
  select 'cuenta_bancaria', cb.numero_cuenta, 'sin cuenta contable asociada'
  from public.cuentas_bancarias cb
  where cb.tenant_id = p_tenant_id and cb.activa and cb.contable_cuenta_id is null
  union all
  select 'concepto', c.codigo, 'concepto activo sin cuenta presupuestal de ingreso'
  from public.conceptos c
  where c.tenant_id = p_tenant_id
    and c.estado = 'activo' and c.presupuesto_cuenta_id is null;
$$;

comment on function public.contable_parametrizacion_pendiente(uuid) is
  'Lista lo que falta parametrizar para que una copropiedad pueda emitir información contable '
  '(PC-3): cuentas presupuestales hoja sin mapear, eventos sin cuenta predeterminada, fondos y '
  'cuentas bancarias sin cuenta contable, y conceptos activos sin cuenta de ingreso. Debe '
  'quedar vacío antes de exportar — cada fila es un movimiento que saldría sin cuenta.';

-- ═══════════════════════════════════════════════════════════════════════
--  6. Seed del mapeo — datos de ejemplo, no configuración definitiva
--
--  Aplica el borrador de mapeo de PC_01 §5 a los códigos slug del árbol
--  sembrado en GC-001 (y a cualquier tenant que comparta esos códigos).
--  Es un punto de partida verificable, no una decisión contable cerrada:
--  cada copropiedad puede reasignar lo que quiera desde la UI de PC-6.
-- ═══════════════════════════════════════════════════════════════════════

update public.presupuesto_cuenta pc
set contable_cuenta_id = cc.id
from (values
  -- egresos
  ('egr_administrador','5105'), ('egr_revisoria_fiscal','5110'),
  ('egr_contador_publico','5115'), ('egr_asesoria_juridica','5120'),
  ('vigilancia','5205'), ('egr_aseo','5305'),
  ('egr_elementos_aseo','5310'), ('egr_elementos_cafeteria','5310'),
  ('egr_mant_jardin','5320'),
  ('egr_torre_1','5405'),  ('egr_torre_2','5405'),  ('egr_torre_3','5405'),
  ('egr_torre_4','5405'),  ('egr_torre_5','5405'),  ('egr_torre_6','5405'),
  ('egr_torre_7','5405'),  ('egr_torre_8','5405'),  ('egr_torre_9','5405'),
  ('egr_torre_10','5405'), ('egr_torre_11','5405'), ('egr_torre_12','5405'),
  ('egr_torre_13','5405'), ('egr_torre_14','5405'), ('egr_torre_15','5405'),
  ('egr_torre_16','5405'), ('egr_torre_17','5405'), ('egr_torre_18','5405'),
  ('egr_torre_19','5405'), ('egr_zonas_comunes','5405'),
  ('egr_acueducto','5410'), ('egr_telefono','5420'),
  ('egr_mant_bomba','5510'), ('egr_mant_planta','5520'),
  ('egr_instalaciones_electricas','5525'), ('egr_suministros_electricos','5525'),
  ('egr_mant_zonas_comunes','5530'), ('egr_cerramiento_conjunto','5530'),
  ('egr_mant_camara_video','5535'), ('egr_mant_puertas','5535'),
  ('egr_seguros','5605'), ('egr_gastos_legales','5705'), ('egr_gastos_asamblea','5710'),
  ('egr_papeleria_fotocopias','5805'), ('egr_gastos_bancarios','5820'),
  ('egr_taxis_buses','5825'), ('egr_impuestos_asumidos','5830'),
  ('egr_intereses_mora','5835'),
  ('egr_actividades_conjunto','5890'), ('egr_combustibles_lubricantes','5890'),
  ('egr_otros_servicios','5890'), ('egr_otros_gastos_diversos','5890'),
  ('egr_gastos_diversos','5890'), ('egr_gastos_ejercicios_anteriores','5890'),
  ('egr_amortizaciones','5910'),
  -- cuentas legacy planas del backfill E8 (categorías de lista_tipos)
  ('administracion','5105'), ('aseo','5305'), ('mantenimiento','5590'),
  ('servicios_publicos','5405'), ('seguros','5605'), ('otros','5890'),
  -- ingresos
  ('cuotas_administracion','4105'), ('ing_alquiler_salon','4305'),
  ('ing_usufructo_vehiculos','4310'), ('ing_usufructo_motos','4310'),
  ('ing_bicicletero','4310'), ('ing_energia_salon','4320'),
  ('ing_otros_operacionales','4690')
) as m(codigo_presupuestal, codigo_contable),
public.contable_cuenta cc
where cc.codigo = m.codigo_contable
  and cc.tenant_id = pc.tenant_id
  and pc.codigo = m.codigo_presupuestal
  and pc.es_hoja
  and pc.contable_cuenta_id is null;

-- Cuentas predeterminadas, para cada copropiedad que ya tenga plan contable.
insert into public.contable_cuenta_default (tenant_id, evento_id, contable_cuenta_id)
select cc.tenant_id, lt.id, cc.id
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
  ('RESULTADO_EJERCICIO','3310')
) as m(evento, codigo_contable)
join public.lista_tipos lt on lt.tipo = 'EVENTO_CONTABLE' and lt.codigo = m.evento
join public.contable_cuenta cc on cc.codigo = m.codigo_contable
on conflict (tenant_id, evento_id) do nothing;

-- Fondos y cuentas bancarias: el fondo de imprevistos va a 111015; las cuentas bancarias
-- toman corriente por defecto (111005) salvo la de recaudo, que va a la misma. Es un punto de
-- partida: la copropiedad ajusta cuál es ahorros y cuál corriente desde la UI.
update public.fondos f
set contable_cuenta_id = cc.id
from public.contable_cuenta cc
where cc.tenant_id = f.tenant_id
  and cc.codigo = case when f.tipo = 'imprevistos' then '111015' else '111010' end
  and f.contable_cuenta_id is null;

update public.cuentas_bancarias cb
set contable_cuenta_id = cc.id
from public.contable_cuenta cc
where cc.tenant_id = cb.tenant_id
  -- billetera (Nequi, Daviplata…) se asimila a ahorros: es efectivo equivalente a la vista,
  -- no una cuenta corriente.
  and cc.codigo = case when cb.tipo_cuenta in ('ahorros', 'billetera') then '111010'
                       else '111005' end
  and cb.contable_cuenta_id is null;
