-- ═══════════════════════════════════════════════════════════════════════
--  FIN-2 · Factura de proveedor y retenciones aplicadas (3/7)
--  Casos de uso/Tres Modulos/Financiero/FIN_02_factura_proveedor.md §3.1
--
--  Adición no prevista en el corte original, documentada como adición, no
--  omisión (mismo estilo que D-56/D-57): `presupuesto_cuenta_id`. El corte
--  exige que aprobar la factura CREE una fila de presupuesto_ejecucion
--  cuando no existe una ya enlazada (§3.4) — pero presupuesto_ejecucion.
--  cuenta_id es NOT NULL y el corte no da de dónde sacarlo cuando
--  contrato_id es null (el contrato SÍ trae presupuesto_cuenta_id, MANT-5,
--  pero es opcional en la factura). Se añade nullable a nivel de columna;
--  el guard de aprobación exige que esté presente cuando hace falta crear
--  la ejecución (FACTURA_SIN_CUENTA_PRESUPUESTAL, código nuevo).
--
--  Guards de aritmética implementados en TRIGGER, no en check de columna:
--  el proyecto exige que todo código de error registrado aparezca como
--  `raise exception '<CODIGO>: ...'` (§5.4 del marco, test de gobernanza
--  error-codes-coverage) — un check de columna sin ese formato no
--  quedaría cubierto. Se mantienen unos pocos check estructurales sin
--  código propio (subtotal > 0, etc.) donde no hay decisión de negocio
--  detrás, igual que en mant_contratos (MANT-5).
-- ═══════════════════════════════════════════════════════════════════════

create table public.finanzas_facturas_proveedor (
  id                        uuid primary key default gen_random_uuid(),
  tenant_id                 uuid not null references public.tenants (id) on delete cascade,
  proveedor_id              uuid not null references public.terceros (id),
  contrato_id               uuid references public.mant_contratos (id),
  presupuesto_cuenta_id     uuid references public.presupuesto_cuenta (id),
  numero_documento          text not null,
  fecha_emision             date not null,
  fecha_vencimiento         date not null,
  presupuesto_ejecucion_id  uuid references public.presupuesto_ejecucion (id),
  concepto_gasto            text,
  documento_soporte_id      uuid references public.documentos (id),

  subtotal                  numeric(18, 2) not null,
  iva_generado              numeric(18, 2) not null default 0,
  iva_descontable           numeric(18, 2) not null default 0,
  total_bruto               numeric(18, 2) not null,
  total_retenciones         numeric(18, 2) not null default 0,
  total_neto_pagar          numeric(18, 2) not null,

  estado                    public.factura_estado_t not null default 'borrador',
  aprobada_por              uuid references public.profiles (id),
  aprobada_at               timestamptz,
  motivo_rechazo            text,
  motivo_disputa            text,
  observaciones             text,

  created_at                timestamptz not null default now(),
  creado_por                uuid references public.profiles (id),
  updated_at                timestamptz,

  constraint finanzas_facturas_proveedor_documento_unico unique (tenant_id, proveedor_id, numero_documento),
  constraint finanzas_facturas_proveedor_ejecucion_unica unique (presupuesto_ejecucion_id),
  constraint finanzas_facturas_proveedor_subtotal_valido check (subtotal > 0),
  constraint finanzas_facturas_proveedor_iva_generado_valido check (iva_generado >= 0),
  constraint finanzas_facturas_proveedor_iva_descontable_valido check (iva_descontable >= 0),
  constraint finanzas_facturas_proveedor_retenciones_valido check (total_retenciones >= 0)
);

alter table public.finanzas_facturas_proveedor enable row level security;
alter table public.finanzas_facturas_proveedor force row level security;

create index finanzas_facturas_proveedor_tenant_idx on public.finanzas_facturas_proveedor (tenant_id);
create index finanzas_facturas_proveedor_proveedor_idx on public.finanzas_facturas_proveedor (proveedor_id);
create index finanzas_facturas_proveedor_contrato_idx on public.finanzas_facturas_proveedor (contrato_id);

comment on table public.finanzas_facturas_proveedor is
  'FIN-2 §3.1: el documento factura recibido del proveedor — número, retenciones e IVA '
  'descontable, enlazado a presupuesto_ejecucion. No genera comprobante contable propio: CO-3 '
  'materializa presupuesto_ejecucion (20260931170000). "pagada" es terminal e inmutable en sus '
  'campos sustantivos.';

comment on column public.finanzas_facturas_proveedor.presupuesto_cuenta_id is
  'Adición sobre el corte original (ver cabecera): de dónde sale cuenta_id al crear la fila de '
  'presupuesto_ejecucion en la aprobación, cuando la factura no llega ya enlazada a una '
  'ejecución existente. Nullable porque no hace falta si presupuesto_ejecucion_id ya viene '
  'poblado.';

-- ── Guard: consistencia de tenant, aritmética, FSM ──────────────────────────────────────────
create function public.guard_finanzas_factura_proveedor()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_permitida boolean := false;
begin
  -- ── 'pagada' es terminal: solo observaciones/updated_at pueden cambiar ──
  if tg_op = 'UPDATE' and old.estado = 'pagada' then
    if (to_jsonb(old) - 'observaciones' - 'updated_at')
       is distinct from (to_jsonb(new) - 'observaciones' - 'updated_at') then
      raise exception 'FACTURA_PAGADA_INMUTABLE: la factura % ya está pagada y no admite '
        'cambios sustantivos', old.id;
    end if;
  end if;

  -- ── Consistencia de tenant ──
  if not exists (select 1 from public.terceros where id = new.proveedor_id and tenant_id = new.tenant_id) then
    raise exception 'FACTURA_TENANT_INCONSISTENTE: el proveedor % no pertenece al tenant', new.proveedor_id;
  end if;
  if new.contrato_id is not null
     and not exists (select 1 from public.mant_contratos where id = new.contrato_id and tenant_id = new.tenant_id) then
    raise exception 'FACTURA_TENANT_INCONSISTENTE: el contrato % no pertenece al tenant', new.contrato_id;
  end if;
  if new.presupuesto_cuenta_id is not null
     and not exists (select 1 from public.presupuesto_cuenta where id = new.presupuesto_cuenta_id and tenant_id = new.tenant_id) then
    raise exception 'FACTURA_TENANT_INCONSISTENTE: la cuenta presupuestal % no pertenece al tenant', new.presupuesto_cuenta_id;
  end if;
  if new.presupuesto_cuenta_id is not null
     and not exists (select 1 from public.presupuesto_cuenta where id = new.presupuesto_cuenta_id and es_hoja) then
    raise exception 'CUENTA_NO_ES_HOJA: % agrupa subcuentas — una factura solo puede enlazarse '
      'a una cuenta hoja', new.presupuesto_cuenta_id;
  end if;
  if new.presupuesto_ejecucion_id is not null
     and not exists (select 1 from public.presupuesto_ejecucion where id = new.presupuesto_ejecucion_id and tenant_id = new.tenant_id) then
    raise exception 'FACTURA_TENANT_INCONSISTENTE: la ejecución %  no pertenece al tenant', new.presupuesto_ejecucion_id;
  end if;

  -- ── Duplicada: mensaje legible antes de que la unique falle en crudo ──
  if exists (
    select 1 from public.finanzas_facturas_proveedor
    where tenant_id = new.tenant_id and proveedor_id = new.proveedor_id
      and numero_documento = new.numero_documento and id <> new.id
  ) then
    raise exception 'FACTURA_DUPLICADA: el proveedor % ya tiene una factura con el número %',
      new.proveedor_id, new.numero_documento;
  end if;

  -- ── Una ejecución ya facturada no puede enlazarse a una segunda factura ──
  if new.presupuesto_ejecucion_id is not null and exists (
    select 1 from public.finanzas_facturas_proveedor
    where presupuesto_ejecucion_id = new.presupuesto_ejecucion_id and id <> new.id
  ) then
    raise exception 'EJECUCION_YA_FACTURADA: la ejecución % ya está enlazada a otra factura',
      new.presupuesto_ejecucion_id;
  end if;

  -- ── Aritmética ──
  if new.total_bruto is distinct from new.subtotal + new.iva_generado then
    raise exception 'FACTURA_ARITMETICA_INCONSISTENTE: total_bruto (%) debe ser subtotal (%) '
      'más iva_generado (%)', new.total_bruto, new.subtotal, new.iva_generado;
  end if;
  if new.total_neto_pagar is distinct from new.total_bruto - new.total_retenciones then
    raise exception 'FACTURA_ARITMETICA_INCONSISTENTE: total_neto_pagar (%) debe ser '
      'total_bruto (%) menos total_retenciones (%)', new.total_neto_pagar, new.total_bruto, new.total_retenciones;
  end if;

  -- ── IVA descontable solo si el tenant es responsable de IVA (CO-1) ──
  if new.iva_descontable > 0
     and not coalesce((select responsable_iva from public.tenants where id = new.tenant_id), false) then
    raise exception 'IVA_DESCONTABLE_INCONSISTENTE: el tenant % no es responsable de IVA — '
      'iva_descontable debe ser 0', new.tenant_id;
  end if;

  -- ── FSM (solo en UPDATE) ──
  if tg_op = 'UPDATE' and new.estado is distinct from old.estado then
    if new.estado = 'aprobada' then
      if coalesce(current_setting('aquila.aprobando_factura', true), 'false') <> 'true' then
        raise exception 'FACTURA_TRANSICION_INVALIDA: aprobar una factura exige '
          'fn_finanzas_aprobar_factura, no un UPDATE directo';
      end if;
      v_permitida := old.estado = 'en_revision';
    else
      v_permitida := case old.estado
        when 'borrador'        then new.estado in ('registrada', 'anulada')
        when 'registrada'      then new.estado in ('en_revision', 'anulada')
        when 'en_revision'     then new.estado in ('en_disputa', 'anulada')
        when 'en_disputa'      then new.estado in ('en_revision', 'anulada')
        when 'aprobada'        then new.estado in ('programada', 'anulada')
        when 'programada'      then new.estado in ('pagada_parcial', 'pagada', 'anulada')
        when 'pagada_parcial'  then new.estado in ('pagada', 'anulada')
        else false
      end;
    end if;

    if new.estado = 'anulada' and (new.motivo_rechazo is null or btrim(new.motivo_rechazo) = '') then
      raise exception 'FACTURA_ANULACION_SIN_MOTIVO: anular una factura exige motivo_rechazo';
    end if;
    if new.estado = 'en_disputa' and (new.motivo_disputa is null or btrim(new.motivo_disputa) = '') then
      raise exception 'FACTURA_DISPUTA_SIN_MOTIVO: marcar una factura en disputa exige motivo_disputa';
    end if;

    if not v_permitida then
      raise exception 'FACTURA_TRANSICION_INVALIDA: % -> % no está permitida', old.estado, new.estado;
    end if;
  end if;

  new.updated_at := now();
  return new;
end;
$$;

comment on function public.guard_finanzas_factura_proveedor() is
  'FIN-2 §3.1: valida consistencia de tenant, aritmética (FACTURA_ARITMETICA_INCONSISTENTE), '
  'IVA descontable (IVA_DESCONTABLE_INCONSISTENTE), duplicados (FACTURA_DUPLICADA) y la máquina '
  'de estados — bloquea "aprobada" salvo que la dispare fn_finanzas_aprobar_factura '
  '(20260931160000, mismo mecanismo aquila.cerrando_ot de MANT-4). "pagada" es terminal para '
  'cualquier columna salvo observaciones (chequeo al inicio, lección D-54/D-55/D-56).';

create trigger guard_finanzas_factura_proveedor
  before insert or update on public.finanzas_facturas_proveedor
  for each row execute function public.guard_finanzas_factura_proveedor();

create policy finanzas_facturas_proveedor_select_miembro
  on public.finanzas_facturas_proveedor for select
  to authenticated
  using (public.is_member(tenant_id));

create policy finanzas_facturas_proveedor_insert_auxiliar
  on public.finanzas_facturas_proveedor for insert
  to authenticated
  with check (public.has_role(tenant_id, array['auxiliar']::public.tenant_role_t[]));

create policy finanzas_facturas_proveedor_update_auxiliar
  on public.finanzas_facturas_proveedor for update
  to authenticated
  using (public.has_role(tenant_id, array['auxiliar']::public.tenant_role_t[]))
  with check (public.has_role(tenant_id, array['auxiliar']::public.tenant_role_t[]));
