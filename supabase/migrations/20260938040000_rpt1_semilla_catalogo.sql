-- ═══════════════════════════════════════════════════════════════════════
--  RPT-01 · Semilla del catálogo y reportes de fábrica
--  (PLAN_MOTOR_REPORTES.md §6, D-136)
--
--  Los `codigo` de reporte_campos son NOMBRES REALES DE COLUMNA de las
--  vistas vr_* (20260938020000). Si una vista cambia una columna, este
--  catálogo miente y el reporte falla en ejecución — por eso el corte
--  incluye una prueba-guardia que compara ambos contra information_schema
--  (tests/reportes/catalogo-vs-esquema.test.ts), en el mismo espíritu que
--  error-codes-coverage.test.ts.
--
--  La lista blanca ES el catálogo (R-07): lo que no se siembra aquí, no se
--  puede reportar. Se dejan fuera a propósito tenant_id (la RLS ya filtra;
--  como columna solo sería ruido) y cualquier identificador interno.
-- ═══════════════════════════════════════════════════════════════════════

-- ── Fuente 1 · Cartera por inmueble ────────────────────────────────────
insert into public.reporte_fuentes (codigo, nombre, descripcion, modulo, objeto_sql, filtro_obligatorio)
values (
  'cartera_inmueble',
  'Cartera por inmueble',
  'Deuda por inmueble a una fecha de corte, con su clasificación, nivel de riesgo y etapa de '
  'cobranza tal como los produjo el motor de cartera.',
  'Cartera',
  'vr_cartera_inmueble',
  -- Sin acotar el corte, la fuente devuelve inmuebles × todas las fechas de
  -- snapshot: un total que suma varias veces la misma deuda. El filtro no es
  -- una preferencia, es lo que hace que la cifra signifique algo.
  'fecha_corte'
);

insert into public.reporte_campos
  (fuente_id, codigo, etiqueta, descripcion, tipo_dato, clase, agregacion_default, agrupable, orden)
select
  f.id, c.codigo, c.etiqueta, c.descripcion, c.tipo_dato, c.clase, c.agregacion, c.agrupable, c.orden
from public.reporte_fuentes f
cross join (values
  ('fecha_corte',                   'Fecha de corte',      'Fecha a la que está calculada la posición.', 'fecha',   'dimension', null::text,  true,  10::smallint),
  ('agrupacion',                    'Torre / Bloque',      'Agrupación a la que pertenece el inmueble.', 'texto',   'dimension', null,        true,  20),
  ('agrupacion_tipo',               'Tipo de agrupación',  'Edificio, Piso, Manzana…',                   'texto',   'dimension', null,        true,  30),
  ('inmueble',                      'Inmueble',            'Código del inmueble.',                       'texto',   'dimension', null,        true,  40),
  ('inmueble_tipo',                 'Tipo de inmueble',    null,                                         'texto',   'dimension', null,        true,  50),
  ('inmueble_estado',               'Estado del inmueble', null,                                         'texto',   'dimension', null,        true,  60),
  ('propietario',                   'Propietario',         'Propietarios vigentes a la fecha de corte.', 'texto',   'dimension', null,        true,  70),
  ('clasificacion',                 'Clasificación',       'Clasificación de cartera congelada con la política que la produjo.', 'texto', 'dimension', null, true, 80),
  ('nivel_riesgo',                  'Nivel de riesgo',     null,                                         'texto',   'dimension', null,        true,  90),
  ('etapa_cobranza',                'Etapa de cobranza',   null,                                         'texto',   'dimension', null,        true, 100),
  ('fecha_vencimiento_mas_antigua', 'Vencimiento más antiguo', null,                                     'fecha',   'dimension', null,        true, 110),
  ('deuda_total',                   'Deuda total',         'Capital + intereses + otros.',               'dinero',  'metrica',   'suma',      false, 120),
  ('deuda_capital',                 'Deuda capital',       null,                                         'dinero',  'metrica',   'suma',      false, 130),
  ('deuda_interes',                 'Deuda intereses',     null,                                         'dinero',  'metrica',   'suma',      false, 140),
  ('deuda_otros',                   'Deuda otros',         null,                                         'dinero',  'metrica',   'suma',      false, 150),
  ('saldo_credito',                 'Saldo a favor',       'Dinero del inmueble aún sin imputar.',       'dinero',  'metrica',   'suma',      false, 160),
  ('dias_mora_maximo',              'Días de mora',        'Mora del cargo vencido más antiguo.',        'numero',  'metrica',   'maximo',    false, 170),
  ('cantidad_cargos_vencidos',      'Cargos vencidos',     null,                                         'numero',  'metrica',   'suma',      false, 180)
) as c(codigo, etiqueta, descripcion, tipo_dato, clase, agregacion, agrupable, orden)
where f.codigo = 'cartera_inmueble';

-- ── Fuente 2 · Cuenta corriente ────────────────────────────────────────
insert into public.reporte_fuentes (codigo, nombre, descripcion, modulo, objeto_sql, filtro_obligatorio)
values (
  'cuenta_corriente',
  'Cuenta corriente',
  'Cargos del inmueble con su saldo pendiente derivado, período, concepto y vencimiento.',
  'Cuenta Corriente',
  'vr_cuenta_corriente',
  null
);

insert into public.reporte_campos
  (fuente_id, codigo, etiqueta, descripcion, tipo_dato, clase, agregacion_default, agrupable, orden)
select
  f.id, c.codigo, c.etiqueta, c.descripcion, c.tipo_dato, c.clase, c.agregacion, c.agrupable, c.orden
from public.reporte_fuentes f
cross join (values
  ('inmueble',          'Inmueble',          null,                                          'texto',   'dimension', null::text, true,  10::smallint),
  ('agrupacion',        'Torre / Bloque',    null,                                          'texto',   'dimension', null,       true,  20),
  ('periodo',           'Período',           'Año-mes del cargo (AAAA-MM).',                'texto',   'dimension', null,       true,  30),
  ('periodo_anio',      'Año',               null,                                          'numero',  'dimension', null,       true,  40),
  ('periodo_mes',       'Mes',               null,                                          'numero',  'dimension', null,       true,  50),
  ('periodo_estado',    'Estado del período',null,                                          'texto',   'dimension', null,       true,  60),
  ('concepto_codigo',   'Código concepto',   null,                                          'texto',   'dimension', null,       true,  70),
  ('concepto',          'Concepto',          null,                                          'texto',   'dimension', null,       true,  80),
  ('categoria',         'Categoría',         'Capital, interés, otros.',                    'texto',   'dimension', null,       true,  90),
  ('origen',            'Origen',            'Liquidación, novedad o interés.',             'texto',   'dimension', null,       true, 100),
  ('fecha_cargo',       'Fecha del cargo',   null,                                          'fecha',   'dimension', null,       true, 110),
  ('fecha_vencimiento', 'Vencimiento',       null,                                          'fecha',   'dimension', null,       true, 120),
  ('pendiente',         'Tiene saldo',       'Verdadero si al cargo le queda saldo.',       'booleano','dimension', null,       true, 130),
  ('monto_original',    'Valor del cargo',   null,                                          'dinero',  'metrica',   'suma',     false,140),
  ('monto_pagado',      'Valor pagado',      'Imputado al cargo (v_cargo_saldo).',          'dinero',  'metrica',   'suma',     false,150),
  ('monto_pendiente',   'Saldo pendiente',   null,                                          'dinero',  'metrica',   'suma',     false,160),
  ('dias_vencido',      'Días vencido',      'A hoy, y solo si el cargo tiene saldo.',      'numero',  'metrica',   'maximo',   false,170)
) as c(codigo, etiqueta, descripcion, tipo_dato, clase, agregacion, agrupable, orden)
where f.codigo = 'cuenta_corriente';

-- ── Fuente 3 · Recaudos ────────────────────────────────────────────────
insert into public.reporte_fuentes (codigo, nombre, descripcion, modulo, objeto_sql, filtro_obligatorio)
values (
  'recaudos',
  'Recaudos',
  'Pagos registrados, con su forma de pago y cuánto quedó imputado. Incluye las anulaciones '
  'como filas de monto opuesto: la suma es el recaudo neto.',
  'Financiero',
  'vr_recaudos',
  null
);

insert into public.reporte_campos
  (fuente_id, codigo, etiqueta, descripcion, tipo_dato, clase, agregacion_default, agrupable, orden)
select
  f.id, c.codigo, c.etiqueta, c.descripcion, c.tipo_dato, c.clase, c.agregacion, c.agrupable, c.orden
from public.reporte_fuentes f
cross join (values
  ('fecha_pago',        'Fecha de pago',      null,                                         'fecha',   'dimension', null::text, true,  10::smallint),
  ('fecha_registro',    'Fecha de registro',  'Cuándo se capturó en el sistema.',           'fecha',   'dimension', null,       true,  20),
  ('inmueble',          'Inmueble',           null,                                         'texto',   'dimension', null,       true,  30),
  ('agrupacion',        'Torre / Bloque',     null,                                         'texto',   'dimension', null,       true,  40),
  ('forma_pago',        'Forma de pago',      null,                                         'texto',   'dimension', null,       true,  50),
  ('referencia',        'Referencia',         null,                                         'texto',   'dimension', null,       true,  60),
  ('pagador',           'Pagador',            null,                                         'texto',   'dimension', null,       true,  70),
  ('es_anulacion',      'Es anulación',       'Verdadero en la fila que reversa un pago.',  'booleano','dimension', null,       true,  80),
  ('anulado_motivo',    'Motivo de anulación',null,                                         'texto',   'dimension', null,       true,  90),
  ('monto',             'Valor recaudado',    'Negativo en una anulación — sumar da el neto.', 'dinero','metrica',  'suma',     false,100),
  ('monto_aplicado',    'Valor imputado',     null,                                         'dinero',  'metrica',   'suma',     false,110),
  ('monto_sin_aplicar', 'Sin imputar',        'Saldo a favor que dejó el pago.',            'dinero',  'metrica',   'suma',     false,120)
) as c(codigo, etiqueta, descripcion, tipo_dato, clase, agregacion, agrupable, orden)
where f.codigo = 'recaudos';

-- ═══════════════════════════════════════════════════════════════════════
--  Reportes de fábrica (§39)
--
--  Se siembran por tenant, de forma idempotente, desde una función que
--  llaman TRES vías: esta migración (tenants existentes), un trigger AFTER
--  INSERT sobre tenants (los nuevos) y, si hiciera falta, una llamada
--  manual. AFTER y no BEFORE porque las filas que inserta referencian al
--  tenant por FK: en BEFORE la fila del tenant todavía no existe.
--
--  `definicion.parametros` es contrato de la capa de aplicación, NO del
--  compilador: el store resuelve el parámetro y manda el filtro ya con su
--  `valor`. fn_reporte_ejecutar solo entiende `valor`, y así no necesita
--  saber nada de plantillas ni de sustituciones.
-- ═══════════════════════════════════════════════════════════════════════

create function public.fn_reportes_sistema_sembrar(p_tenant uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_reporte_id uuid;
  v_semilla    record;
begin
  for v_semilla in
    select * from (values
      (
        'RPT-CAR-001',
        'Cartera por inmueble',
        'Deuda por inmueble a una fecha de corte, ordenada de mayor a menor.',
        'CARTERA',
        jsonb_build_object(
          'fuente', 'cartera_inmueble',
          'campos', jsonb_build_array(
            jsonb_build_object('campo', 'agrupacion'),
            jsonb_build_object('campo', 'inmueble'),
            jsonb_build_object('campo', 'propietario'),
            jsonb_build_object('campo', 'clasificacion'),
            jsonb_build_object('campo', 'dias_mora_maximo'),
            jsonb_build_object('campo', 'deuda_capital'),
            jsonb_build_object('campo', 'deuda_interes'),
            jsonb_build_object('campo', 'deuda_total')
          ),
          'filtros', jsonb_build_array(
            jsonb_build_object('campo', 'fecha_corte', 'operador', 'igual', 'parametro', 'fecha_corte')
          ),
          'orden', jsonb_build_array(
            jsonb_build_object('campo', 'deuda_total', 'direccion', 'desc')
          ),
          'parametros', jsonb_build_array(
            jsonb_build_object(
              'codigo', 'fecha_corte', 'etiqueta', 'Fecha de corte',
              'tipo', 'fecha', 'requerido', true, 'origen', 'ultimo_corte_cartera'
            )
          )
        )
      ),
      (
        'RPT-CC-001',
        'Saldos pendientes por inmueble',
        'Cargos con saldo, agrupados por inmueble y concepto.',
        'CUENTA_CORRIENTE',
        jsonb_build_object(
          'fuente', 'cuenta_corriente',
          'campos', jsonb_build_array(
            jsonb_build_object('campo', 'inmueble'),
            jsonb_build_object('campo', 'periodo'),
            jsonb_build_object('campo', 'concepto'),
            jsonb_build_object('campo', 'fecha_vencimiento'),
            jsonb_build_object('campo', 'monto_original'),
            jsonb_build_object('campo', 'monto_pagado'),
            jsonb_build_object('campo', 'monto_pendiente')
          ),
          'filtros', jsonb_build_array(
            jsonb_build_object('campo', 'pendiente', 'operador', 'igual', 'valor', true)
          ),
          'orden', jsonb_build_array(
            jsonb_build_object('campo', 'inmueble', 'direccion', 'asc'),
            jsonb_build_object('campo', 'fecha_vencimiento', 'direccion', 'asc')
          ),
          'parametros', jsonb_build_array()
        )
      ),
      (
        'RPT-FIN-001',
        'Recaudos del período',
        'Pagos registrados entre dos fechas, por forma de pago.',
        'FINANCIERO',
        jsonb_build_object(
          'fuente', 'recaudos',
          'campos', jsonb_build_array(
            jsonb_build_object('campo', 'fecha_pago'),
            jsonb_build_object('campo', 'inmueble'),
            jsonb_build_object('campo', 'forma_pago'),
            jsonb_build_object('campo', 'referencia'),
            jsonb_build_object('campo', 'pagador'),
            jsonb_build_object('campo', 'monto')
          ),
          'filtros', jsonb_build_array(
            jsonb_build_object(
              'campo', 'fecha_pago', 'operador', 'entre',
              'parametro_desde', 'desde', 'parametro_hasta', 'hasta'
            )
          ),
          'orden', jsonb_build_array(
            jsonb_build_object('campo', 'fecha_pago', 'direccion', 'asc')
          ),
          'parametros', jsonb_build_array(
            jsonb_build_object('codigo', 'desde', 'etiqueta', 'Desde', 'tipo', 'fecha', 'requerido', true, 'origen', 'inicio_mes'),
            jsonb_build_object('codigo', 'hasta', 'etiqueta', 'Hasta', 'tipo', 'fecha', 'requerido', true, 'origen', 'hoy')
          )
        )
      )
    ) as s(codigo, nombre, descripcion, categoria, definicion)
  loop
    insert into public.reportes (tenant_id, codigo, nombre, descripcion, categoria_id, del_sistema)
    select
      p_tenant, v_semilla.codigo, v_semilla.nombre, v_semilla.descripcion,
      (select id from public.lista_tipos
        where tipo = 'CATEGORIA_REPORTE' and codigo = v_semilla.categoria and tenant_id is null),
      true
    on conflict (tenant_id, codigo) do nothing
    returning id into v_reporte_id;

    -- Ya existía: nada que hacer. La idempotencia es lo que permite llamar
    -- a esta función desde varias vías sin coordinarlas.
    if v_reporte_id is null then
      continue;
    end if;

    insert into public.reporte_versiones
      (tenant_id, reporte_id, version, estado, definicion, publicada_at, notas)
    values
      (p_tenant, v_reporte_id, 1, 'publicada', v_semilla.definicion, now(),
       'Versión de fábrica sembrada por RPT-01.');
  end loop;
end;
$fn$;

revoke execute on function public.fn_reportes_sistema_sembrar(uuid) from public, anon, authenticated;

comment on function public.fn_reportes_sistema_sembrar(uuid) is
  'Siembra idempotente de los reportes de fábrica de un tenant (RPT-01, §39). La llaman la '
  'migración 20260938040000 (tenants existentes) y el trigger tenants_sembrar_reportes (nuevos). '
  'SECURITY DEFINER porque corre dentro del trigger de creación, antes de que exista membresía '
  'alguna; sin EXECUTE para roles de cliente.';

create function public.trg_tenant_sembrar_reportes()
returns trigger
language plpgsql
security definer
set search_path = ''
as $fn$
begin
  perform public.fn_reportes_sistema_sembrar(new.id);
  return new;
end;
$fn$;

revoke execute on function public.trg_tenant_sembrar_reportes() from public, anon, authenticated;

-- AFTER INSERT: las filas sembradas referencian tenants(id) por FK, y en un
-- BEFORE la fila del tenant todavía no es visible para esa FK.
create trigger tenants_sembrar_reportes
  after insert on public.tenants
  for each row execute function public.trg_tenant_sembrar_reportes();

-- Tenants que ya existen cuando corre esta migración.
do $do$
declare
  v_tenant uuid;
begin
  for v_tenant in select id from public.tenants loop
    perform public.fn_reportes_sistema_sembrar(v_tenant);
  end loop;
end;
$do$;
