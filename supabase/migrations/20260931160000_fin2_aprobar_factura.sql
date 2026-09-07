-- ═══════════════════════════════════════════════════════════════════════
--  FIN-2 · Factura de proveedor y retenciones aplicadas (5/7)
--  §3.4 — la parte más delicada del corte: cómo la factura afecta el
--  ledger sin duplicarlo.
--
--  finanzas_factura_descomposicion(): la fuente única que devuelve las
--  líneas contables de una factura — la consume tanto CO-3
--  (contable_hechos, 20260931170000, vía JOIN interno) como cualquier
--  vista de la UI que quiera mostrar el desglose antes de aprobar.
--
--  fn_finanzas_aprobar_factura(): único camino a 'aprobada' (mismo
--  mecanismo aquila.cerrando_ot de MANT-4/fn_mant_cerrar_ot) — valida
--  soporte, crea o enlaza presupuesto_ejecucion (nunca un saldo propio,
--  APENDICE_FIN.md "el disponible/comprometido se calcula, no se
--  almacena"), y dispara la advertencia de órgano competente cuando
--  GOB-1 no existe (confirmado con el usuario en el Plan del corte: solo
--  se documenta la propuesta de la atribución 'aprobar_gasto', ningún
--  código de gobierno se implementa aquí).
--
--  Restringido a `administrador` (no `auxiliar`): aprobar compromete
--  presupuesto real, mismo criterio que mant_habilitacion_requerida
--  (MANT-5, tabla de reglas) aunque aquí es una acción, no una regla.
-- ═══════════════════════════════════════════════════════════════════════

create table public.finanzas_factura_advertencia (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references public.tenants (id) on delete cascade,
  factura_id  uuid not null references public.finanzas_facturas_proveedor (id) on delete cascade,
  codigo      text not null,
  mensaje     text not null,
  created_at  timestamptz not null default now()
);

alter table public.finanzas_factura_advertencia enable row level security;
alter table public.finanzas_factura_advertencia force row level security;

create index finanzas_factura_advertencia_factura_idx on public.finanzas_factura_advertencia (factura_id);

comment on table public.finanzas_factura_advertencia is
  'FIN-2 §3.1: "log inspeccionable" que pide el corte para FACTURA_APROBACION_ORGANO_INCOMPETENTE '
  'mientras GOB-1 no exista — persistido y consultable (no un RAISE NOTICE, que PostgREST no '
  'expone al cliente). Append-only por convención: nadie borra una advertencia ya emitida.';

create policy finanzas_factura_advertencia_select_miembro
  on public.finanzas_factura_advertencia for select
  to authenticated
  using (public.is_member(tenant_id));

-- ── La descomposición contable de una factura — fuente única, CO-3 la consume ──────────────
create function public.finanzas_factura_descomposicion(p_ejecucion_id uuid)
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
  -- que contable_hechos() ya usa para cualquier egreso, factura o no).
  select pcc.contable_cuenta_id, f.subtotal, 0::numeric, 'Gasto — factura ' || f.numero_documento
  from f join pe on true join public.presupuesto_cuenta pcc on pcc.id = pe.cuenta_id

  union all

  -- IVA descontable: solo si aplica (responsable_iva ya se validó al guardar la factura).
  select d.iva_descontable, f.iva_descontable, 0::numeric, 'IVA descontable — factura ' || f.numero_documento
  from f cross join d
  where f.iva_descontable > 0

  union all

  -- CxP proveedor: por el neto — ya descuenta las retenciones (siempre 0 mientras CO-8 no
  -- exista, ver 20260931150000). Cuando CO-8 exista, esta migración necesitará una línea de
  -- crédito adicional POR CADA retención (finanzas_factura_retencion), a su propia cuenta —
  -- pendiente de ese corte, documentado en FIN_02_INFORME.md.
  select d.proveedores, 0::numeric, f.total_neto_pagar, 'CxP proveedor — factura ' || f.numero_documento
  from f cross join d;
$$;

comment on function public.finanzas_factura_descomposicion(uuid) is
  'FIN-2 §3.4: líneas contables de una factura para la ejecución dada — vacío si la ejecución '
  'no viene de ninguna factura. contable_hechos() (CO-3, 20260931170000) la consulta al '
  'materializar. Hoy nunca produce líneas de retención (CO-8 ausente garantiza '
  'total_retenciones = 0, 20260931150000) — se completa cuando CO-8 exista.';

-- ── Aprobar: único camino a estado = 'aprobada' ────────────────────────────────────────────
create function public.fn_finanzas_aprobar_factura(p_factura_id uuid)
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
      fecha_documento, descripcion, referencia
    ) values (
      v_factura.tenant_id, v_factura.presupuesto_cuenta_id, v_periodo_id, v_factura.total_neto_pagar,
      'por_pagar', v_factura.proveedor_id, v_factura.contrato_id,
      v_factura.fecha_emision, 'Factura de proveedor ' || v_factura.numero_documento,
      v_factura.numero_documento
    )
    returning id into v_ejecucion_id;
  end if;

  -- ── Umbral de aprobación / órgano competente (GOB-1) ──
  v_politica := public.fn_finanzas_politica_aprobacion_vigente(v_factura.tenant_id);
  if v_politica.id is not null and v_politica.monto_umbral is not null
     and v_factura.total_neto_pagar > v_politica.monto_umbral then
    if to_regclass('public.gobierno_organos') is null then
      insert into public.finanzas_factura_advertencia (tenant_id, factura_id, codigo, mensaje)
      values (v_factura.tenant_id, p_factura_id, 'FACTURA_APROBACION_ORGANO_INCOMPETENTE',
        format('Factura %s por %s supera el umbral de aprobación (%s) — GOB-1 no existe '
               'todavía, no se pudo verificar aprobación por órgano competente.',
               v_factura.numero_documento, v_factura.total_neto_pagar, v_politica.monto_umbral));
    end if;
    -- Cuando GOB-1 exista: llamar gobierno_organo_competente(tenant, 'aprobar_gasto', hoy) y
    -- rechazar con FACTURA_APROBACION_ORGANO_INCOMPETENTE si no hay órgano competente vigente.
    -- Ver FIN_02_INFORME.md: propuesta de agregar 'aprobar_gasto' a ATRIBUCION_ORGANO.
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
  'FIN-2 §3.4: único camino a estado=''aprobada''. Valida soporte y umbral, crea o enlaza '
  'presupuesto_ejecucion (liquidacion=''por_pagar'', monto=total_neto_pagar — nunca un saldo '
  'propio), y registra advertencia inspeccionable si el monto supera el umbral y GOB-1 no '
  'existe. Restringido a administrador.';
