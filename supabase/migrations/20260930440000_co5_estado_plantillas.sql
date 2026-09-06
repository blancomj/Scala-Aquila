-- ═══════════════════════════════════════════════════════════════════════
--  CO-5 · Motor de presentación de estados financieros — catálogo en tabla,
--  no incrustado en SQL (Casos de uso/Tres Modulos/Contabilidad/
--  CO_05_estados_financieros.md §4.1)
--
--  Esquema exacto que da el propio corte: contable_estado_plantilla (global, sin tenant_id,
--  versionada) + contable_estado_linea (sus líneas). codigo de la plantilla coincide con las
--  cadenas que ya devuelve tenant_marco_contable().estados_requeridos (CO-1,
--  20260930160000) — no se traduce, se reutiliza literal.
--
--  Decisión de diseño (Plan del corte, aprobado): dos mecanismos de valor por línea, ambos
--  100% tabla — 'detalle' lee selector_cuentas (prefijo de código); 'grupo'/'subtotal'/'total'/
--  'calculada' leen formula (suma/resta de otras líneas de la MISMA plantilla, referenciadas por
--  su propio codigo, evaluadas en orden). Una excepción única y compartida por las tres
--  plantillas que la necesitan: el codigo reservado 'resultado_ejercicio' — contable_estado_
--  financiero() (próxima migración) lo calcula una sola vez (ingresos clase 4 − gastos clase 5
--  del ejercicio, mismo criterio que CO-4) y lo inyecta donde aparezca, garantizando que ESF/ER/
--  ECP muestren exactamente el mismo número (CO-5 §6 prueba 2) sin tres cálculos independientes
--  que puedan divergir.
--
--  Grupo 2/3 no difieren en la estructura de ESF/ER a la escala de una PH (ambos exigidos por
--  DUR 2420 anexo respectivo) — se siembran igual, una fila de plantilla por grupo ("una por
--  grupo, si difieren" — aquí no difieren, pero se respeta el modelo de una fila por grupo).
--  ECP y EFE son exclusivos de Grupo 2 (siguiente migración).
-- ═══════════════════════════════════════════════════════════════════════

create type public.estado_linea_tipo_t as enum ('grupo', 'detalle', 'subtotal', 'total', 'calculada');

comment on type public.estado_linea_tipo_t is
  'Gobierna qué mecanismo de valor usa contable_estado_financiero() para una línea (D-24): '
  'detalle lee selector_cuentas contra el saldo/movimiento real de las cuentas; grupo no tiene '
  'valor propio (encabezado); subtotal/total/calculada evalúan formula referenciando otras '
  'líneas ya calculadas de la misma plantilla.';

create table public.contable_estado_plantilla (
  id          uuid primary key default gen_random_uuid(),
  codigo      text not null,
  nombre      text not null,
  marco_grupo public.marco_contable_grupo_t not null,
  -- 'saldo': balance acumulado a la fecha de corte (ESF). 'movimiento': débito/crédito del
  -- ejercicio hasta la fecha de corte (ER). 'variacion': cambio de saldo acumulado entre el
  -- inicio del ejercicio y la fecha de corte (EFE, método indirecto).
  modo_valor  text not null check (modo_valor in ('saldo', 'movimiento', 'variacion')),
  version     int not null default 1,
  vigente     boolean not null default true,
  created_at  timestamptz not null default now(),

  constraint contable_estado_plantilla_codigo_grupo_version_unica
    unique (codigo, marco_grupo, version)
);

alter table public.contable_estado_plantilla enable row level security;
alter table public.contable_estado_plantilla force row level security;

comment on table public.contable_estado_plantilla is
  'Catálogo global de plantillas de estados financieros (CO-5 §4.1) — sin tenant_id, no editable '
  'por el tenant, igual que contable_plan/contable_plan_cuenta. codigo coincide con los valores '
  'de tenant_marco_contable().estados_requeridos (CO-1).';

create policy contable_estado_plantilla_select_authenticated
  on public.contable_estado_plantilla for select
  to authenticated
  using (true);

create table public.contable_estado_linea (
  id                      uuid primary key default gen_random_uuid(),
  plantilla_id            uuid not null references public.contable_estado_plantilla (id) on delete cascade,
  -- Identificador estable de la línea dentro de su plantilla — lo que referencia `formula` de
  -- otra línea, y lo que usa contable_estado_financiero() para inyectar 'resultado_ejercicio'.
  codigo                  text not null,
  orden                   int not null,
  nivel                   smallint not null check (nivel between 1 and 4),
  etiqueta                text not null,
  tipo_linea              public.estado_linea_tipo_t not null,
  selector_cuentas        text,
  signo                   smallint not null default 1 check (signo in (1, -1)),
  formula                 text,
  nota_referencia         smallint,
  fundamento_normativo_id bigint references public.fundamento_normativo (id),
  -- Solo para plantillas modo_valor='variacion' (EFE/ECP): fuerza saldo puntual al inicio del
  -- ejercicio en vez de la variación fin-menos-inicio — la línea de apertura de efectivo (EFE)
  -- y las líneas "saldo inicial" de cada componente patrimonial (ECP) lo necesitan.
  momento                 text check (momento in ('inicio')),

  constraint contable_estado_linea_orden_unica unique (plantilla_id, orden),
  constraint contable_estado_linea_codigo_unico unique (plantilla_id, codigo),
  constraint contable_estado_linea_valor_segun_tipo check (
    (tipo_linea = 'detalle' and selector_cuentas is not null and formula is null)
    or (tipo_linea in ('subtotal', 'total', 'calculada') and formula is not null and selector_cuentas is null)
    or (tipo_linea = 'grupo' and selector_cuentas is null and formula is null)
  )
);

alter table public.contable_estado_linea enable row level security;
alter table public.contable_estado_linea force row level security;

comment on table public.contable_estado_linea is
  'Líneas de una contable_estado_plantilla, en el orden de presentación. La cobertura de fórmulas '
  '(que todo codigo referenciado por formula exista y aparezca antes en orden) la valida '
  'contable_estado_financiero() en tiempo de evaluación, no un guard de escritura — el catálogo '
  'lo siembra una migración, no un usuario.';

create policy contable_estado_linea_select_authenticated
  on public.contable_estado_linea for select
  to authenticated
  using (true);

-- ── seed: helper para insertar una plantilla + sus líneas en un solo bloque ─
do $$
declare
  v_plantilla_id uuid;
  v_grupo public.marco_contable_grupo_t;
begin
  foreach v_grupo in array array['grupo_2', 'grupo_3']::public.marco_contable_grupo_t[]
  loop
    -- ── ESF ──────────────────────────────────────────────────────────────
    insert into public.contable_estado_plantilla (codigo, nombre, marco_grupo, modo_valor)
    values ('estado_situacion_financiera', 'Estado de situación financiera', v_grupo, 'saldo')
    returning id into v_plantilla_id;

    insert into public.contable_estado_linea
      (plantilla_id, codigo, orden, nivel, etiqueta, tipo_linea, selector_cuentas, signo, formula, nota_referencia)
    values
      (v_plantilla_id, 'activo_titulo', 10, 1, 'ACTIVO', 'grupo', null, 1, null, null),
      (v_plantilla_id, 'activo_corriente_titulo', 20, 2, 'Activo corriente', 'grupo', null, 1, null, null),
      (v_plantilla_id, 'activo_efectivo', 30, 3, 'Efectivo y equivalentes de efectivo', 'detalle', '11', 1, null, 4),
      (v_plantilla_id, 'activo_inversiones', 40, 3, 'Inversiones', 'detalle', '12', 1, null, null),
      (v_plantilla_id, 'activo_cxc', 50, 3, 'Cuentas por cobrar', 'detalle', '13', 1, null, 6),
      (v_plantilla_id, 'activo_inventarios', 60, 3, 'Inventarios', 'detalle', '14', 1, null, null),
      (v_plantilla_id, 'activo_otros', 70, 3, 'Otros activos', 'detalle', '17', 1, null, null),
      (v_plantilla_id, 'total_activo_corriente', 80, 2, 'Total activo corriente', 'subtotal',
        null, 1, 'activo_efectivo+activo_inversiones+activo_cxc+activo_inventarios+activo_otros', null),
      (v_plantilla_id, 'activo_no_corriente_titulo', 90, 2, 'Activo no corriente', 'grupo', null, 1, null, null),
      (v_plantilla_id, 'activo_ppe', 100, 3, 'Propiedad, planta y equipo', 'detalle', '15', 1, null, 7),
      (v_plantilla_id, 'activo_intangibles', 110, 3, 'Activos intangibles', 'detalle', '16', 1, null, null),
      (v_plantilla_id, 'total_activo_no_corriente', 120, 2, 'Total activo no corriente', 'subtotal',
        null, 1, 'activo_ppe+activo_intangibles', null),
      (v_plantilla_id, 'total_activo', 130, 1, 'TOTAL ACTIVO', 'total',
        null, 1, 'total_activo_corriente+total_activo_no_corriente', null),

      (v_plantilla_id, 'pasivo_titulo', 200, 1, 'PASIVO', 'grupo', null, 1, null, null),
      (v_plantilla_id, 'pasivo_corriente_titulo', 210, 2, 'Pasivo corriente', 'grupo', null, 1, null, null),
      (v_plantilla_id, 'pasivo_obligaciones_financieras', 220, 3, 'Obligaciones financieras', 'detalle', '21', 1, null, null),
      (v_plantilla_id, 'pasivo_proveedores', 230, 3, 'Proveedores y contratistas', 'detalle', '22', 1, null, 8),
      (v_plantilla_id, 'pasivo_cxp', 240, 3, 'Cuentas por pagar', 'detalle', '23', 1, null, 8),
      (v_plantilla_id, 'pasivo_laborales', 250, 3, 'Obligaciones laborales', 'detalle', '24', 1, null, null),
      (v_plantilla_id, 'pasivo_impuestos', 260, 3, 'Impuestos por pagar', 'detalle', '25', 1, null, null),
      (v_plantilla_id, 'pasivo_anticipos', 270, 3, 'Anticipos y depósitos recibidos', 'detalle', '26', 1, null, null),
      (v_plantilla_id, 'pasivo_otros', 280, 3, 'Otros pasivos', 'detalle', '28', 1, null, null),
      (v_plantilla_id, 'total_pasivo_corriente', 290, 2, 'Total pasivo corriente', 'subtotal', null, 1,
        'pasivo_obligaciones_financieras+pasivo_proveedores+pasivo_cxp+pasivo_laborales+pasivo_impuestos+pasivo_anticipos+pasivo_otros', null),
      (v_plantilla_id, 'total_pasivo', 300, 1, 'TOTAL PASIVO', 'total', null, 1, 'total_pasivo_corriente', null),

      (v_plantilla_id, 'patrimonio_titulo', 400, 1, 'PATRIMONIO', 'grupo', null, 1, null, null),
      (v_plantilla_id, 'patrimonio_social', 410, 2, 'Patrimonio social', 'detalle', '31', 1, null, 9),
      (v_plantilla_id, 'resultados_anteriores', 420, 2, 'Resultados de ejercicios anteriores', 'detalle', '33', 1, null, 9),
      -- 'resultado_ejercicio': codigo reservado, inyectado por la función — nunca por formula.
      (v_plantilla_id, 'resultado_ejercicio', 430, 2, 'Excedente (déficit) del ejercicio', 'calculada', null, 1, 'resultado_ejercicio_inyectado', 9),
      (v_plantilla_id, 'total_patrimonio', 440, 1, 'TOTAL PATRIMONIO', 'total', null, 1,
        'patrimonio_social+resultados_anteriores+resultado_ejercicio', null),

      (v_plantilla_id, 'total_pasivo_mas_patrimonio', 500, 1, 'TOTAL PASIVO + PATRIMONIO', 'total', null, 1,
        'total_pasivo+total_patrimonio', null);

    -- ── ER ───────────────────────────────────────────────────────────────
    insert into public.contable_estado_plantilla (codigo, nombre, marco_grupo, modo_valor)
    values ('estado_resultados', 'Estado de resultados', v_grupo, 'movimiento')
    returning id into v_plantilla_id;

    insert into public.contable_estado_linea
      (plantilla_id, codigo, orden, nivel, etiqueta, tipo_linea, selector_cuentas, signo, formula, nota_referencia)
    values
      (v_plantilla_id, 'ingresos_titulo', 10, 1, 'INGRESOS', 'grupo', null, 1, null, null),
      (v_plantilla_id, 'ingreso_cuota_ordinaria', 20, 2, 'Cuotas ordinarias de administración', 'detalle', '4105', 1, null, 10),
      (v_plantilla_id, 'ingreso_cuota_extraordinaria', 30, 2, 'Cuotas extraordinarias', 'detalle', '4110', 1, null, 10),
      (v_plantilla_id, 'ingreso_fondo_imprevistos', 40, 2, 'Cuota fondo de imprevistos', 'detalle', '4115', 1, null, 5),
      (v_plantilla_id, 'ingreso_mora', 50, 2, 'Ingresos por mora', 'detalle', '42', 1, null, 10),
      (v_plantilla_id, 'ingreso_uso_bienes_comunes', 60, 2, 'Uso de bienes comunes', 'detalle', '43', 1, null, 10),
      (v_plantilla_id, 'ingreso_explotacion_bienes_comunes', 70, 2, 'Explotación económica de bienes comunes', 'detalle', '44', 1, null, 10),
      (v_plantilla_id, 'ingreso_sanciones', 80, 2, 'Sanciones', 'detalle', '45', 1, null, 10),
      (v_plantilla_id, 'ingreso_otros', 90, 2, 'Otros ingresos', 'detalle', '46', 1, null, 10),
      (v_plantilla_id, 'total_ingresos', 100, 1, 'Total ingresos', 'subtotal', null, 1,
        'ingreso_cuota_ordinaria+ingreso_cuota_extraordinaria+ingreso_fondo_imprevistos+ingreso_mora+ingreso_uso_bienes_comunes+ingreso_explotacion_bienes_comunes+ingreso_sanciones+ingreso_otros', null),

      (v_plantilla_id, 'gastos_titulo', 200, 1, 'GASTOS', 'grupo', null, 1, null, null),
      (v_plantilla_id, 'gasto_administracion', 210, 2, 'Administración, personal y honorarios', 'detalle', '51', 1, null, 11),
      (v_plantilla_id, 'gasto_vigilancia', 220, 2, 'Vigilancia y seguridad', 'detalle', '52', 1, null, 11),
      (v_plantilla_id, 'gasto_aseo', 230, 2, 'Aseo y zonas comunes', 'detalle', '53', 1, null, 11),
      (v_plantilla_id, 'gasto_servicios_publicos', 240, 2, 'Servicios públicos', 'detalle', '54', 1, null, 11),
      (v_plantilla_id, 'gasto_mantenimiento', 250, 2, 'Mantenimiento y reparaciones', 'detalle', '55', 1, null, 11),
      (v_plantilla_id, 'gasto_seguros', 260, 2, 'Seguros', 'detalle', '56', 1, null, 11),
      (v_plantilla_id, 'gasto_legales', 270, 2, 'Gastos legales y de asamblea', 'detalle', '57', 1, null, 11),
      (v_plantilla_id, 'gasto_generales', 280, 2, 'Gastos generales', 'detalle', '58', 1, null, 11),
      (v_plantilla_id, 'gasto_depreciacion_deterioro', 290, 2, 'Depreciaciones, amortizaciones y deterioros', 'detalle', '59', 1, null, 11),
      (v_plantilla_id, 'total_gastos', 300, 1, 'Total gastos', 'subtotal', null, 1,
        'gasto_administracion+gasto_vigilancia+gasto_aseo+gasto_servicios_publicos+gasto_mantenimiento+gasto_seguros+gasto_legales+gasto_generales+gasto_depreciacion_deterioro', null),

      (v_plantilla_id, 'resultado_ejercicio', 400, 1, 'Excedente (déficit) del ejercicio', 'total', null, 1,
        'total_ingresos-total_gastos', 9);
  end loop;
end;
$$;
