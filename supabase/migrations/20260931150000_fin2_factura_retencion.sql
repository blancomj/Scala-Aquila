-- ═══════════════════════════════════════════════════════════════════════
--  FIN-2 · Factura de proveedor y retenciones aplicadas (4/7)
--  Casos de uso/Tres Modulos/Financiero/FIN_02_factura_proveedor.md §3.2
--
--  concepto_id → tributario_concepto_retencion (CO-8) SIN FK a propósito:
--  CO-8 no existe todavía (verificado por grep, ninguna migración lo
--  crea) — mismo patrón que mant_ordenes_trabajo.contrato_id en MANT-3/4
--  hasta que MANT-5 lo cerró. Cuando CO-8 exista, se agrega la FK real y
--  el guard de resolución de cuenta contable por concepto (20260931170000
--  hoy solo decompone gasto/IVA/CxP; nunca produce líneas de retención
--  porque esta tabla se mantiene vacía a propósito hasta entonces).
--
--  Guard explícito que bloquea CUALQUIER insert mientras el catálogo de
--  CO-8 no exista (RETENCION_CATALOGO_TRIBUTARIO_AUSENTE) — no es una
--  validación de negocio inventada, es literalmente lo que el corte dice:
--  "si CO-8 aún no está implementado, el catálogo está vacío y solo se
--  puede registrar factura sin retenciones" (§3.2).
-- ═══════════════════════════════════════════════════════════════════════

create table public.finanzas_factura_retencion (
  id             uuid primary key default gen_random_uuid(),
  tenant_id      uuid not null references public.tenants (id) on delete cascade,
  factura_id     uuid not null references public.finanzas_facturas_proveedor (id) on delete cascade,
  concepto_id    bigint not null,
  base           numeric(18, 2) not null,
  tarifa         numeric(5, 2) not null,
  valor          numeric(18, 2) not null,
  registrada_at  timestamptz not null default now(),

  constraint finanzas_factura_retencion_unica unique (factura_id, concepto_id),
  constraint finanzas_factura_retencion_base_valida check (base >= 0),
  constraint finanzas_factura_retencion_tarifa_valida check (tarifa >= 0)
);

alter table public.finanzas_factura_retencion enable row level security;
alter table public.finanzas_factura_retencion force row level security;

create index finanzas_factura_retencion_factura_idx on public.finanzas_factura_retencion (factura_id);

comment on table public.finanzas_factura_retencion is
  'FIN-2 §3.2: retenciones efectivamente aplicadas — descompone total_neto_pagar, NUNCA genera '
  'comprobante propio. concepto_id sin FK: CO-8 (tributario_concepto_retencion) no existe '
  'todavía. El guard bloquea cualquier fila mientras el catálogo no exista (marco §1.6: no '
  'inventar catálogo tributario).';

comment on column public.finanzas_factura_retencion.concepto_id is
  'Sin FK a propósito — CO-8 (tributario_concepto_retencion) no existe todavía. Se agrega la FK '
  'real cuando CO-8 se implemente.';

create function public.guard_finanzas_factura_retencion()
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
  'FIN-2 §3.2: bloquea toda fila mientras CO-8 no exista (RETENCION_CATALOGO_TRIBUTARIO_AUSENTE), '
  'valida consistencia de tenant vía factura_id y la aritmética valor = base × tarifa / 100.';

create trigger guard_finanzas_factura_retencion
  before insert or update on public.finanzas_factura_retencion
  for each row execute function public.guard_finanzas_factura_retencion();

-- Append-only: una retención registrada no se corrige, se reemplaza (borra e inserta de nuevo)
-- mientras la factura siga en un estado editable — la propia factura ya bloquea eso en 'pagada'.
create trigger finanzas_factura_retencion_append_only
  before update on public.finanzas_factura_retencion
  for each row execute function public.forbid_mutation();

create policy finanzas_factura_retencion_select_miembro
  on public.finanzas_factura_retencion for select
  to authenticated
  using (public.is_member(tenant_id));

create policy finanzas_factura_retencion_insert_auxiliar
  on public.finanzas_factura_retencion for insert
  to authenticated
  with check (public.has_role(tenant_id, array['auxiliar']::public.tenant_role_t[]));

create policy finanzas_factura_retencion_delete_auxiliar
  on public.finanzas_factura_retencion for delete
  to authenticated
  using (public.has_role(tenant_id, array['auxiliar']::public.tenant_role_t[]));
