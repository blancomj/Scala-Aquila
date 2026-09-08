-- ═══════════════════════════════════════════════════════════════════════
--  CO-8 · Retención en la fuente
--  Ver CO_08_tributario.md §4.2.
--
--  NO se crea una tabla `tributario_retencion` nueva: `finanzas_factura_retencion`
--  (FIN-2, 20260931150000) YA ES la retención practicada — su propio
--  comentario documenta esta extensión pendiente ("cuando CO-8 exista, se
--  agrega la FK real"). Como todo gasto de este sistema entra a
--  presupuesto_ejecucion únicamente vía facturas de proveedor (verificado:
--  ningún otro módulo hace `insert into presupuesto_ejecucion` para un
--  egreso), no hay otro punto de práctica de retención que cubrir — crear
--  una segunda tabla sería la entidad duplicada que el marco §1.2 prohíbe.
--
--  Cero tarifas ni bases mínimas sembradas (spec §2 regla 3, §4.2
--  vinculante) — tributario_concepto_retencion nace vacío.
-- ═══════════════════════════════════════════════════════════════════════

create table public.tributario_concepto_retencion (
  id               bigint generated always as identity primary key,
  tenant_id        uuid not null references public.tenants (id) on delete cascade,
  codigo           text not null,
  nombre           text not null,
  base_minima_uvt  numeric(10, 2),
  tarifa           numeric(5, 2) not null,
  cuenta_contable_id uuid not null references public.contable_cuenta (id),
  vigente_desde    date not null default current_date,
  vigente_hasta    date,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz,

  constraint tributario_concepto_retencion_codigo_unico unique (tenant_id, codigo, vigente_desde),
  constraint tributario_concepto_retencion_tarifa_valida check (tarifa >= 0),
  constraint tributario_concepto_retencion_base_valida check (base_minima_uvt is null or base_minima_uvt >= 0),
  constraint tributario_concepto_retencion_vigencia_valida check (vigente_hasta is null or vigente_hasta >= vigente_desde)
);

alter table public.tributario_concepto_retencion enable row level security;
alter table public.tributario_concepto_retencion force row level security;

create index tributario_concepto_retencion_tenant_idx on public.tributario_concepto_retencion (tenant_id);

create trigger set_updated_at before update on public.tributario_concepto_retencion
  for each row execute function public.set_updated_at();

comment on table public.tributario_concepto_retencion is
  'CO-8 §4.2: catálogo de conceptos de retención en la fuente — tarifas y bases mínimas '
  'cambian por resolución cada año (REMISIÓN A LA COPROPIEDAD/CONTADOR), cero filas '
  'precargadas. Sin agente_retencion=true (tenants, CO-1) no se puede insertar '
  '(TRIBUTARIO_SIN_AGENTE_RETENCION, guard_finanzas_factura_retencion).';
comment on column public.tributario_concepto_retencion.cuenta_contable_id is
  'Cuenta de retención por pagar (grupo 23, p.ej. 2320) a la que finanzas_factura_descomposicion '
  '(FIN-2/CO-8) acredita cada retención practicada con este concepto.';

create policy tributario_concepto_retencion_select_miembro
  on public.tributario_concepto_retencion for select
  to authenticated
  using (public.is_member(tenant_id));

create policy tributario_concepto_retencion_insert_auxiliar
  on public.tributario_concepto_retencion for insert
  to authenticated
  with check (public.has_role(tenant_id, array['auxiliar']::public.tenant_role_t[]));

create policy tributario_concepto_retencion_update_auxiliar
  on public.tributario_concepto_retencion for update
  to authenticated
  using (public.has_role(tenant_id, array['auxiliar']::public.tenant_role_t[]))
  with check (public.has_role(tenant_id, array['auxiliar']::public.tenant_role_t[]));

-- ── FK real de finanzas_factura_retencion.concepto_id (FIN-2 la dejó sin FK a propósito) ──
alter table public.finanzas_factura_retencion
  add constraint finanzas_factura_retencion_concepto_fk
  foreign key (concepto_id) references public.tributario_concepto_retencion (id);

comment on column public.finanzas_factura_retencion.concepto_id is
  'FK real desde CO-8 (tributario_concepto_retencion) — FIN-2 la dejó sin FK porque este '
  'catálogo no existía todavía.';

-- ── Guard de finanzas_factura_retencion: + TRIBUTARIO_SIN_AGENTE_RETENCION ───────────────
-- Diff mínimo sobre el guard de FIN-2 (20260931150000): se conserva toda su lógica tal cual
-- (incluido el check `to_regclass(...) is null`, ya inalcanzable desde esta migración en
-- adelante pero inofensivo — mismo criterio de "diff mínimo" de MANT-5/D-57) y se agrega
-- solo la validación de agente_retencion (spec §4.2: "solo si agente_retencion = true").
create or replace function public.guard_finanzas_factura_retencion()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_tenant_factura uuid;
begin
  if to_regclass('public.tributario_concepto_retencion') is null then
    raise exception 'RETENCION_CATALOGO_TRIBUTARIO_AUSENTE: el catálogo de conceptos de '
      'retención (CO-8) todavía no existe — no se pueden registrar retenciones hasta entonces';
  end if;

  if not coalesce((select agente_retencion from public.tenants where id = new.tenant_id), false) then
    raise exception 'TRIBUTARIO_SIN_AGENTE_RETENCION: el tenant % no es agente de retención — '
      'no se pueden registrar retenciones (CO-8 §4.2)', new.tenant_id;
  end if;

  select tenant_id into v_tenant_factura from public.finanzas_facturas_proveedor where id = new.factura_id;
  if v_tenant_factura is null or v_tenant_factura <> new.tenant_id then
    raise exception 'FACTURA_TENANT_INCONSISTENTE: la factura % no pertenece al tenant', new.factura_id;
  end if;

  if new.valor is distinct from round(new.base * new.tarifa / 100, 2) then
    raise exception 'FACTURA_ARITMETICA_INCONSISTENTE: valor (%) debe ser base (%) × tarifa (%) / 100',
      new.valor, new.base, new.tarifa;
  end if;

  return new;
end;
$$;

comment on function public.guard_finanzas_factura_retencion() is
  'FIN-2/CO-8 §4.2: TRIBUTARIO_SIN_AGENTE_RETENCION (agente_retencion=false, CO-1) además de lo '
  'ya validado por FIN-2 (RETENCION_CATALOGO_TRIBUTARIO_AUSENTE, FACTURA_TENANT_INCONSISTENTE, '
  'FACTURA_ARITMETICA_INCONSISTENTE).';

-- ── finanzas_factura_descomposicion: + línea de crédito por cada retención ───────────────
-- Diff mínimo sobre la versión de 20260931210000: las tres líneas originales (gasto, IVA
-- descontable, CxP proveedor) quedan intactas — total_neto_pagar YA descuenta las
-- retenciones (FACTURA_ARITMETICA_INCONSISTENTE lo exige desde FIN-2), así que la línea de
-- CxP no cambia; solo se agrega la contrapartida que faltaba para que esas retenciones
-- cuadren (sum(debito) = sum(credito) también para este hecho).
create or replace function public.finanzas_factura_descomposicion(p_ejecucion_id uuid)
returns table (
  cuenta_id   uuid,
  debito      numeric,
  credito     numeric,
  descripcion text
)
language sql
stable
set search_path = ''
as $$
  with f as (
    select * from public.finanzas_facturas_proveedor where presupuesto_ejecucion_id = p_ejecucion_id
  ),
  pe as (
    select * from public.presupuesto_ejecucion where id = p_ejecucion_id
  ),
  d as (
    select
      (array_agg(cd.contable_cuenta_id) filter (where lt.codigo = 'IVA_DESCONTABLE'))[1] as iva_descontable,
      (array_agg(cd.contable_cuenta_id) filter (where lt.codigo = 'PROVEEDOR_SERVICIOS'))[1] as proveedores
    from public.contable_cuenta_default cd
    join public.lista_tipos lt on lt.id = cd.evento_id
    where cd.tenant_id = (select tenant_id from f)
  )
  -- Gasto: debita la cuenta del rubro presupuestal de la propia ejecución (la misma resolución
  -- que contable_hechos() ya usa para cualquier egreso, factura o no). El IVA no recuperado
  -- (iva_generado - iva_descontable) engorda el gasto — es costo real, no un activo — para que
  -- sum(debito) = sum(credito) sin importar si el tenant es responsable de IVA o no.
  select pcc.contable_cuenta_id, f.subtotal + (f.iva_generado - f.iva_descontable),
    0::numeric, 'Gasto — factura ' || f.numero_documento
  from f join pe on true join public.presupuesto_cuenta pcc on pcc.id = pe.cuenta_id

  union all

  -- IVA descontable: solo si aplica (responsable_iva ya se validó al guardar la factura).
  select d.iva_descontable, f.iva_descontable, 0::numeric, 'IVA descontable — factura ' || f.numero_documento
  from f cross join d
  where f.iva_descontable > 0

  union all

  -- Retención en la fuente (CO-8 §4.2): crédito a la cuenta de retención por pagar de cada
  -- concepto practicado — reduce el neto a pagar al proveedor sin tocar el gasto ni el IVA.
  select tcr.cuenta_contable_id, 0::numeric, ffr.valor,
    'Retención ' || tcr.codigo || ' — factura ' || f.numero_documento
  from f
  join public.finanzas_factura_retencion ffr on ffr.factura_id = f.id
  join public.tributario_concepto_retencion tcr on tcr.id = ffr.concepto_id

  union all

  -- CxP proveedor: por el neto — ya descuenta las retenciones (FACTURA_ARITMETICA_INCONSISTENTE
  -- lo exige desde FIN-2; TRIBUTARIO_RETENCIONES_INCONSISTENTES, CO-8, exige además que
  -- total_retenciones coincida con la suma real de finanzas_factura_retencion al aprobar).
  select d.proveedores, 0::numeric, f.total_neto_pagar, 'CxP proveedor — factura ' || f.numero_documento
  from f cross join d;
$$;

comment on function public.finanzas_factura_descomposicion(uuid) is
  'FIN-2/CO-8 §4.2: descompone una ejecución presupuestal ligada a una factura en líneas de '
  'partida doble — gasto (+IVA no recuperado), IVA descontable, retenciones practicadas '
  '(una línea por finanzas_factura_retencion) y CxP proveedor por el neto.';

-- ── fn_finanzas_aprobar_factura: + TRIBUTARIO_RETENCIONES_INCONSISTENTES ─────────────────
-- Diff mínimo SOBRE LA ÚLTIMA VERSIÓN (20260931400000, fix de GOB-1 — no sobre la original
-- 20260931160000, que ya no es la vigente): se inserta la validación justo después del check de
-- documento_soporte_id (antes de crear/enlazar la ejecución presupuestal, para no dejar efectos
-- secundarios si falla). Lección de GOB-1/MANT-2 aplicada: listar TODAS las migraciones que
-- redefinen esta función antes de reproducir su cuerpo — el primer intento de este corte se basó
-- por error en 20260931160000 y regresó silenciosamente el fix de GOB-1 (la advertencia
-- FACTURA_APROBACION_ORGANO_INCOMPETENTE dejó de insertarse), detectado por la regresión de
-- tests/finanzas/facturas-proveedor.test.ts (prueba 6), no por las pruebas propias de este corte.

create or replace function public.fn_finanzas_aprobar_factura(p_factura_id uuid)
returns public.finanzas_facturas_proveedor
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_factura       public.finanzas_facturas_proveedor%rowtype;
  v_ejecucion_id  uuid;
  v_periodo_id    uuid;
  v_monto_ejec    numeric;
  v_politica      public.finanzas_politica_aprobacion_pago;
  v_retenciones   numeric;
begin
  select * into v_factura from public.finanzas_facturas_proveedor where id = p_factura_id;
  if v_factura.id is null then
    raise exception 'FACTURA_INEXISTENTE: la factura % no existe', p_factura_id;
  end if;

  if not public.has_role(v_factura.tenant_id, array['administrador']::public.tenant_role_t[]) then
    raise exception 'FORBIDDEN: se requiere rol administrador para aprobar una factura';
  end if;

  if v_factura.estado <> 'en_revision' then
    raise exception 'FACTURA_TRANSICION_INVALIDA: solo una factura en_revision puede aprobarse '
      '(estado actual: %)', v_factura.estado;
  end if;

  if v_factura.documento_soporte_id is null then
    raise exception 'FACTURA_APROBACION_SIN_SOPORTE: la factura % no tiene documento_soporte_id',
      p_factura_id;
  end if;

  select coalesce(sum(valor), 0) into v_retenciones
    from public.finanzas_factura_retencion where factura_id = p_factura_id;
  if v_factura.total_retenciones is distinct from v_retenciones then
    raise exception 'TRIBUTARIO_RETENCIONES_INCONSISTENTES: total_retenciones (%) de la factura '
      '% no coincide con la suma de sus retenciones registradas (%)',
      v_factura.total_retenciones, p_factura_id, v_retenciones;
  end if;

  -- ── Enlazar o crear la ejecución presupuestal (nunca un saldo propio) ──
  if v_factura.presupuesto_ejecucion_id is not null then
    select id, monto into v_ejecucion_id, v_monto_ejec
      from public.presupuesto_ejecucion where id = v_factura.presupuesto_ejecucion_id;
    if v_monto_ejec is distinct from v_factura.total_neto_pagar then
      raise exception 'FACTURA_EJECUCION_MONTO_DISCREPA: la ejecución % tiene monto % pero la '
        'factura exige %', v_ejecucion_id, v_monto_ejec, v_factura.total_neto_pagar;
    end if;
  else
    if v_factura.presupuesto_cuenta_id is null then
      raise exception 'FACTURA_SIN_CUENTA_PRESUPUESTAL: la factura % no tiene '
        'presupuesto_cuenta_id ni presupuesto_ejecucion_id — no hay contra qué rubro cargarla',
        p_factura_id;
    end if;

    select id into v_periodo_id from public.periodos
      where tenant_id = v_factura.tenant_id
        and anio = extract(year from v_factura.fecha_emision)
        and mes = extract(month from v_factura.fecha_emision);
    if v_periodo_id is null then
      raise exception 'PERIODO_INEXISTENTE: no existe un periodo % - % para la fecha de emisión '
        'de la factura %', extract(year from v_factura.fecha_emision),
        extract(month from v_factura.fecha_emision), p_factura_id;
    end if;

    insert into public.presupuesto_ejecucion (
      tenant_id, cuenta_id, periodo_id, monto, liquidacion, tercero_id, contrato_id,
      centro_costo_id, fecha_documento, descripcion, referencia
    ) values (
      v_factura.tenant_id, v_factura.presupuesto_cuenta_id, v_periodo_id, v_factura.total_neto_pagar,
      'por_pagar', v_factura.proveedor_id, v_factura.contrato_id,
      v_factura.centro_costo_id, v_factura.fecha_emision, 'Factura de proveedor ' || v_factura.numero_documento,
      v_factura.numero_documento
    )
    returning id into v_ejecucion_id;
  end if;

  -- ── Umbral de aprobación / órgano competente (GOB-1 existe, pero no tiene atribución para
  --    esto — ver cabecera de 20260931400000) — advertencia inspeccionable, nunca bloqueo.
  v_politica := public.fn_finanzas_politica_aprobacion_vigente(v_factura.tenant_id);
  if v_politica.id is not null and v_politica.monto_umbral is not null
     and v_factura.total_neto_pagar > v_politica.monto_umbral then
    insert into public.finanzas_factura_advertencia (tenant_id, factura_id, codigo, mensaje)
    values (v_factura.tenant_id, p_factura_id, 'FACTURA_APROBACION_ORGANO_INCOMPETENTE',
      format('Factura %s por %s supera el umbral de aprobación (%s) — GOB-1 existe pero no '
             'tiene una atribución de ATRIBUCION_ORGANO para aprobación de gastos todavía, no '
             'se pudo verificar aprobación por órgano competente.',
             v_factura.numero_documento, v_factura.total_neto_pagar, v_politica.monto_umbral));
  end if;

  perform set_config('aquila.aprobando_factura', 'true', true);
  update public.finanzas_facturas_proveedor
  set estado = 'aprobada', aprobada_por = auth.uid(), aprobada_at = now(),
      presupuesto_ejecucion_id = v_ejecucion_id
  where id = p_factura_id
  returning * into v_factura;
  perform set_config('aquila.aprobando_factura', 'false', true);

  return v_factura;
end;
$$;

comment on function public.fn_finanzas_aprobar_factura(uuid) is
  'FIN-2 §3.4 / CO-8: único camino a estado=''aprobada''. Valida soporte, coherencia de '
  'retenciones (TRIBUTARIO_RETENCIONES_INCONSISTENTES) y umbral, crea o enlaza '
  'presupuesto_ejecucion (liquidacion=''por_pagar'', monto=total_neto_pagar, centro_costo_id — '
  'nunca un saldo propio), y registra advertencia inspeccionable si el monto supera el umbral '
  '(GOB-1 existe pero no tiene atribución para aprobación de gastos, 20260931400000). '
  'Restringido a administrador.';

-- ── Reportes (CO-8 §4.2) ──────────────────────────────────────────────────
create function public.tributario_certificado_retencion(
  p_tenant_id uuid,
  p_tercero_id uuid,
  p_desde date,
  p_hasta date
)
returns table (
  concepto_codigo text,
  concepto_nombre text,
  tarifa          numeric,
  total_base      numeric,
  total_valor     numeric
)
language sql
stable
security invoker
set search_path = ''
as $$
  select tcr.codigo, tcr.nombre, ffr.tarifa, sum(ffr.base), sum(ffr.valor)
  from public.finanzas_factura_retencion ffr
  join public.finanzas_facturas_proveedor f on f.id = ffr.factura_id
  join public.tributario_concepto_retencion tcr on tcr.id = ffr.concepto_id
  where ffr.tenant_id = p_tenant_id
    and f.proveedor_id = p_tercero_id
    and f.fecha_emision between p_desde and p_hasta
  group by tcr.codigo, tcr.nombre, ffr.tarifa
  order by tcr.codigo;
$$;

comment on function public.tributario_certificado_retencion(uuid, uuid, date, date) is
  'CO-8 §4.2: certificado de retención de un tercero en un periodo — suma exactamente las '
  'retenciones practicadas en sus facturas emitidas dentro del rango (spec §6 prueba 6). '
  'Documento obligatorio que la copropiedad debe entregar y hoy no podía emitir.';

create function public.tributario_resumen_retenciones_mensual(
  p_tenant_id uuid,
  p_anio int,
  p_mes  int
)
returns table (
  concepto_codigo text,
  concepto_nombre text,
  total_base      numeric,
  total_valor     numeric
)
language sql
stable
security invoker
set search_path = ''
as $$
  select tcr.codigo, tcr.nombre, sum(ffr.base), sum(ffr.valor)
  from public.finanzas_factura_retencion ffr
  join public.finanzas_facturas_proveedor f on f.id = ffr.factura_id
  join public.tributario_concepto_retencion tcr on tcr.id = ffr.concepto_id
  where ffr.tenant_id = p_tenant_id
    and extract(year from f.fecha_emision) = p_anio
    and extract(month from f.fecha_emision) = p_mes
  group by tcr.codigo, tcr.nombre
  order by tcr.codigo;
$$;

comment on function public.tributario_resumen_retenciones_mensual(uuid, int, int) is
  'CO-8 §4.2: resumen mensual de retenciones por concepto — base del formulario de declaración '
  'que el contador presenta (AQUILA nunca lo genera ni lo presenta, spec §2).';
