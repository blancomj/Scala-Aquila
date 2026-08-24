-- ═══════════════════════════════════════════════════════════════════════
--  PC-4 · Contrapartida, tercero y fecha del documento en la ejecución
--
--  Cierra PRE-02 (bloqueante), PRE-03, PRE-04 y PRE-05 del análisis
--  (PC-00 §6). Es la única fase de todo el bloque contable que toca una
--  tabla existente.
--
--  EL PROBLEMA (PRE-02): un egreso registrado hoy dice cuánto y contra qué
--  cuenta presupuestal, pero no dice de dónde salió el dinero. Sin eso, el
--  asiento solo tiene su débito —el gasto— y ningún crédito: cualquier
--  exportación saldría descuadrada. Es lo que bloquea PC-5.
--
--  CÓMO SE RESUELVE, y por qué no con una cuenta contable directa: poner
--  una columna "contable_cuenta_id de contrapartida" habría obligado a
--  quien registra un gasto a elegir entre 145 cuentas en una pantalla
--  operativa — justo la clase de decisión contable que el prompt maestro
--  §25/§55 dice que no debe tomarse ahí. En su lugar se captura un hecho
--  que el operador sí conoce:
--
--      ¿ya se pagó, y de dónde salió?  →  banco / caja / quedó por pagar
--
--  y la cuenta se deriva de lo que PC-3 ya dejó parametrizado:
--
--      pagado_banco → cuentas_bancarias.contable_cuenta_id
--      pagado_caja  → contable_cuenta_default 'CAJA_GENERAL'
--      por_pagar    → contable_cuenta_default 'PROVEEDOR_BIENES/SERVICIOS'
--
--  Esta tabla registra un solo hecho económico, no el par causación+pago
--  que llevaría un módulo de cuentas por pagar completo: 'pagado_*' es
--  causación y pago simultáneos, 'por_pagar' es solo causación. Cuando
--  exista CxP, el pago posterior será su propio movimiento y esta columna
--  seguirá diciendo la verdad sobre lo que pasó al registrar el gasto.
--
--  Las columnas nacen NULLABLE pero el guard las exige en todo INSERT
--  nuevo: así las 11 filas históricas —capturadas antes de que existiera
--  el concepto— no se reescriben con una contrapartida inventada (habría
--  sido inventar datos contables), y contable_parametrizacion_pendiente()
--  las reporta como lo que son: movimientos que no se pueden exportar.
-- ═══════════════════════════════════════════════════════════════════════

create type public.ejecucion_liquidacion_t as enum
  ('pagado_banco', 'pagado_caja', 'por_pagar');

comment on type public.ejecucion_liquidacion_t is
  'D-24: enum nativo, no lista_tipos — no es vocabulario descriptivo sino un invariante que '
  'gatilla validación y determina el asiento. Cada valor cambia qué campos son obligatorios '
  '(pagado_banco exige cuenta_bancaria_id; por_pagar exige tercero_id) y qué cuenta se acredita '
  'al proyectar el movimiento contable. El conjunto es cerrado por la propia pregunta que '
  'responde —de dónde salió el dinero, o si todavía no salió—, no ampliable por copropiedad.';

-- ── PRE-05: proveedor y contratista en el catálogo de roles de tercero ──
-- Los roles sembrados hasta hoy cubren el entorno profesional de la copropiedad (administrador,
-- contador, abogado, revisor fiscal) pero no a quien le compra. Sin esto, tercero_id no tiene
-- a quién apuntar en un gasto.
insert into public.lista_tipos (tipo, codigo, nombre, descripcion, orden) values
  ('PERSONA_COPROPIEDAD', 'proveedor',   'Proveedor',
   'Persona o empresa que suministra bienes o servicios a la copropiedad', 50),
  ('PERSONA_COPROPIEDAD', 'contratista', 'Contratista',
   'Ejecuta obras o servicios bajo contrato (mantenimiento, obra civil, vigilancia)', 60);

-- ── columnas nuevas ──────────────────────────────────────────────────────
alter table public.presupuesto_ejecucion
  add column liquidacion        public.ejecucion_liquidacion_t,
  add column cuenta_bancaria_id uuid references public.cuentas_bancarias (id),
  add column tercero_id         uuid references public.terceros (id),
  add column fecha_documento    date;

comment on column public.presupuesto_ejecucion.liquidacion is
  'De dónde salió el dinero (PC-4, PRE-02). Determina la contrapartida del asiento: banco, caja '
  'o cuenta por pagar. NULL solo en los movimientos anteriores a PC-4 — el guard la exige en '
  'todo registro nuevo.';
comment on column public.presupuesto_ejecucion.cuenta_bancaria_id is
  'Cuenta bancaria de la que salió (o entró) el dinero. Obligatoria si liquidacion = '
  'pagado_banco, prohibida en los otros dos casos. Su cuenta contable la da '
  'cuentas_bancarias.contable_cuenta_id (PC-3).';
comment on column public.presupuesto_ejecucion.tercero_id is
  'Proveedor o contraparte del movimiento (PRE-03). Obligatorio si liquidacion = por_pagar '
  '—no se puede deber a nadie— y opcional en el resto, donde sirve para el auxiliar de terceros '
  'y el reporte "gasto por proveedor" (prompt maestro §34).';
comment on column public.presupuesto_ejecucion.fecha_documento is
  'Fecha del soporte (factura, recibo), no la de digitación (PRE-04). Si no se informa, el '
  'guard la deriva del primer día del periodo. created_at sigue siendo cuándo se capturó.';

create index presupuesto_ejecucion_tercero_idx on public.presupuesto_ejecucion (tercero_id)
  where tercero_id is not null;
create index presupuesto_ejecucion_fecha_idx on public.presupuesto_ejecucion (tenant_id, fecha_documento);

-- ── guard extendido ──────────────────────────────────────────────────────
-- Mantiene íntegro todo lo que ya validaba (cuenta hoja del tenant, cuenta sin concepto
-- automático, periodo del tenant, reglas de reversión) y añade las de PC-4.
create or replace function public.guard_presupuesto_ejecucion_cuenta()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_cuenta public.presupuesto_cuenta%rowtype;
  v_periodo public.periodos%rowtype;
  v_original public.presupuesto_ejecucion%rowtype;
  v_banco public.cuentas_bancarias%rowtype;
  v_tercero_tenant uuid;
begin
  select * into v_cuenta from public.presupuesto_cuenta where id = new.cuenta_id;

  if v_cuenta.id is null then
    raise exception 'CUENTA_INEXISTENTE: cuenta_id % no existe', new.cuenta_id;
  end if;

  if v_cuenta.tenant_id <> new.tenant_id then
    raise exception 'CUENTA_TENANT_INCONSISTENTE: la cuenta % pertenece a otro tenant',
      new.cuenta_id;
  end if;

  if not v_cuenta.es_hoja then
    raise exception 'CUENTA_NO_ES_HOJA: % agrupa subcuentas — un movimiento de ejecución solo '
      'puede registrarse contra una cuenta hoja (E9)', new.cuenta_id;
  end if;

  if exists (select 1 from public.conceptos where presupuesto_cuenta_id = new.cuenta_id) then
    raise exception 'CUENTA_CONCEPTO_AUTOMATICO: % ya recibe su ejecutado automáticamente de un '
      'concepto vinculado — no admite movimientos manuales (evita doble conteo)', new.cuenta_id;
  end if;

  select * into v_periodo from public.periodos where id = new.periodo_id;

  if v_periodo.id is null then
    raise exception 'PERIODO_INEXISTENTE: periodo_id % no existe', new.periodo_id;
  end if;

  if v_periodo.tenant_id <> new.tenant_id then
    raise exception 'PERIODO_TENANT_INCONSISTENTE: el periodo % pertenece a otro tenant',
      new.periodo_id;
  end if;

  if new.monto < 0 and new.ajusta_movimiento_id is null then
    raise exception 'REVERSION_SIN_ORIGEN: un monto negativo debe corregir un movimiento '
      'existente (ajusta_movimiento_id) — no se admite un negativo suelto';
  end if;

  if new.ajusta_movimiento_id is not null then
    select * into v_original
    from public.presupuesto_ejecucion where id = new.ajusta_movimiento_id;

    if v_original.id is null then
      raise exception 'MOVIMIENTO_INEXISTENTE: ajusta_movimiento_id % no existe',
        new.ajusta_movimiento_id;
    end if;

    if v_original.tenant_id <> new.tenant_id then
      raise exception 'MOVIMIENTO_TENANT_INCONSISTENTE: % pertenece a otro tenant',
        new.ajusta_movimiento_id;
    end if;

    if v_original.cuenta_id <> new.cuenta_id then
      raise exception 'REVERSION_CUENTA_DISTINTA: % corrige un movimiento de otra cuenta (%) — '
        'una reversión debe ser contra la misma cuenta; para mover el gasto a otra cuenta, '
        'registra dos movimientos nuevos', new.ajusta_movimiento_id, v_original.cuenta_id;
    end if;

    -- Una reversión deshace el movimiento original: por defecto vuelve por el mismo camino
    -- (reintegro al banco del que salió, o baja de la cuenta por pagar). Quien reverse puede
    -- informar otra liquidación explícitamente si el reintegro llegó por otra vía.
    if new.liquidacion is null then
      new.liquidacion := v_original.liquidacion;
      new.cuenta_bancaria_id := coalesce(new.cuenta_bancaria_id, v_original.cuenta_bancaria_id);
    end if;
    new.tercero_id := coalesce(new.tercero_id, v_original.tercero_id);
  end if;

  -- ── PC-4: contrapartida ──
  if new.liquidacion is null then
    raise exception 'LIQUIDACION_REQUERIDA: falta indicar de dónde salió el dinero '
      '(pagado_banco, pagado_caja o por_pagar) — sin contrapartida el movimiento no puede '
      'representarse contablemente (PC-4)';
  end if;

  if new.liquidacion = 'pagado_banco' then
    if new.cuenta_bancaria_id is null then
      raise exception 'LIQUIDACION_CUENTA_BANCARIA_REQUERIDA: liquidacion = pagado_banco exige '
        'indicar de qué cuenta bancaria salió el dinero';
    end if;
  elsif new.cuenta_bancaria_id is not null then
    raise exception 'LIQUIDACION_CUENTA_BANCARIA_NO_APLICA: liquidacion = % no admite '
      'cuenta_bancaria_id', new.liquidacion;
  end if;

  if new.liquidacion = 'por_pagar' and new.tercero_id is null then
    raise exception 'LIQUIDACION_TERCERO_REQUERIDO: liquidacion = por_pagar exige el tercero a '
      'quien se le adeuda — una cuenta por pagar sin acreedor no es exportable';
  end if;

  if new.cuenta_bancaria_id is not null then
    select * into v_banco from public.cuentas_bancarias where id = new.cuenta_bancaria_id;

    if v_banco.id is null then
      raise exception 'CUENTA_BANCARIA_INEXISTENTE: cuenta_bancaria_id % no existe',
        new.cuenta_bancaria_id;
    end if;

    if v_banco.tenant_id <> new.tenant_id then
      raise exception 'CUENTA_BANCARIA_TENANT_INCONSISTENTE: la cuenta bancaria % pertenece a '
        'otro tenant', new.cuenta_bancaria_id;
    end if;

    if not v_banco.activa then
      raise exception 'CUENTA_BANCARIA_INACTIVA: la cuenta bancaria % está inactiva',
        new.cuenta_bancaria_id;
    end if;
  end if;

  if new.tercero_id is not null then
    select tenant_id into v_tercero_tenant from public.terceros where id = new.tercero_id;

    if v_tercero_tenant is null then
      raise exception 'TERCERO_INEXISTENTE: tercero_id % no existe', new.tercero_id;
    end if;

    if v_tercero_tenant <> new.tenant_id then
      raise exception 'TERCERO_TENANT_INCONSISTENTE: el tercero % pertenece a otro tenant',
        new.tercero_id;
    end if;
  end if;

  -- ── PC-4: fecha del documento ──
  -- Se acota al año del periodo por el mismo criterio con que presupuesto_cuenta_ejecucion()
  -- acumula el ejecutado (año fiscal del presupuesto): una factura fechada en otro ejercicio
  -- desalinearía el reporte de ejecución respecto del libro contable. Dentro del año se admite
  -- cualquier mes, porque un soporte de fin de mes suele registrarse en el periodo siguiente.
  if new.fecha_documento is null then
    new.fecha_documento := make_date(v_periodo.anio, v_periodo.mes, 1);
  elsif extract(year from new.fecha_documento)::int <> v_periodo.anio then
    raise exception 'FECHA_DOCUMENTO_FUERA_DE_EJERCICIO: % no pertenece al año del periodo (%)',
      new.fecha_documento, v_periodo.anio;
  end if;

  return new;
end;
$$;

-- ── diagnóstico: los movimientos sin contrapartida también bloquean ─────
-- contable_parametrizacion_pendiente() reportaba lo que falta CONFIGURAR; se le añade lo que
-- falta en los DATOS y que impide exportar igual. Sin esta fila, los 11 movimientos anteriores
-- a PC-4 saldrían del reporte "todo listo" y descuadrarían la exportación en silencio.
create or replace function public.contable_parametrizacion_pendiente(p_tenant_id uuid)
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
    and c.estado = 'activo' and c.presupuesto_cuenta_id is null
  union all
  select
    'movimiento_sin_contrapartida',
    pe.id::text,
    coalesce(pe.descripcion, 'movimiento del ' || pe.created_at::date::text)
      || ' — registrado antes de PC-4, sin liquidación'
  from public.presupuesto_ejecucion pe
  where pe.tenant_id = p_tenant_id and pe.liquidacion is null;
$$;

comment on function public.contable_parametrizacion_pendiente(uuid) is
  'Lista todo lo que impide que una copropiedad emita información contable: cuentas '
  'presupuestales hoja sin mapear, eventos sin cuenta predeterminada, fondos y cuentas '
  'bancarias sin cuenta contable, conceptos activos sin cuenta de ingreso (PC-3) y movimientos '
  'de ejecución sin contrapartida (PC-4). Debe quedar vacío antes de exportar — cada fila es un '
  'movimiento que saldría sin cuenta o descuadrado.';
