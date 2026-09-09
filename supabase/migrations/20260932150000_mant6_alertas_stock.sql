-- ═══════════════════════════════════════════════════════════════════════
--  MANT-6 · Inventario de repuestos y costos (6/6)
--  Casos de uso/Tres Modulos/Mantenimiento/MANT_06_inventario_costos.md §4.5
--
--  Alertas de stock — mismo patrón de tabla de notificación dedicada que
--  gobierno_vencimiento_notificaciones (GOB-9): un cron INSERTA filas
--  nuevas, nunca actualiza mant_repuestos/mant_inventario_movimientos.
--  "Notifica; no genera órdenes de compra automáticas" (prompt §4.5) — no
--  hay ninguna tabla de compras en este corte ni se crea una.
--
--  No hay bitácora de corridas aparte (mismo criterio que
--  cron_mant_generar_programaciones_diario, MANT-3): el propio índice
--  parcial "una alerta activa por repuesto+almacen+tipo" evita duplicar
--  alertas de una misma situación que sigue vigente día a día.
-- ═══════════════════════════════════════════════════════════════════════

create type public.inventario_alerta_tipo_t as enum ('stock_bajo', 'sin_stock', 'punto_reorden');
comment on type public.inventario_alerta_tipo_t is
  'Motivo de la alerta de stock (MANT-6 §4.5). Enum nativo y no lista_tipos (D-24) porque el '
  'valor determina QUÉ COMPARACIÓN disparó la alerta (stock <= 0, stock < stock_minimo, stock <= '
  'punto_reorden) — no es vocabulario descriptivo suelto, gatilla la lógica de '
  'cron_mant_inventario_alertas_diario.';

create table public.mant_inventario_alertas (
  id             uuid primary key default gen_random_uuid(),
  tenant_id      uuid not null references public.tenants (id) on delete cascade,
  repuesto_id    uuid not null references public.mant_repuestos (id),
  almacen_id     uuid not null references public.mant_almacenes (id),
  tipo_alerta    public.inventario_alerta_tipo_t not null,
  stock_actual   numeric(18, 4) not null,
  generada_at    timestamptz not null default now(),
  resuelta_at    timestamptz
);

alter table public.mant_inventario_alertas enable row level security;
alter table public.mant_inventario_alertas force row level security;

create index mant_inventario_alertas_tenant_idx on public.mant_inventario_alertas (tenant_id);

-- Una alerta activa (sin resolver) por repuesto+almacén+tipo — el cron no duplica mientras la
-- situación siga vigente; se "resuelve" (resuelta_at) cuando el stock vuelve a estar por encima
-- del umbral que la disparó.
create unique index mant_inventario_alertas_activa_unica
  on public.mant_inventario_alertas (tenant_id, repuesto_id, almacen_id, tipo_alerta)
  where resuelta_at is null;

comment on table public.mant_inventario_alertas is
  'MANT-6 §4.5: notificación de stock bajo/agotado/punto de reorden alcanzado. Solo notifica — '
  'no genera ninguna orden de compra ni cambia el estado de mant_repuestos/mant_almacenes. '
  'Poblada exclusivamente por cron_mant_inventario_alertas_diario, nunca por INSERT manual desde '
  'la UI (evita alertas fabricadas).';

create policy mant_inventario_alertas_select_miembro
  on public.mant_inventario_alertas for select
  to authenticated
  using (public.is_member(tenant_id));

-- ── Cron: detecta y notifica, nunca corrige ni compra (§4.5) ─────────────
create function public.cron_mant_inventario_alertas_diario()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_fila record;
  v_tipo public.inventario_alerta_tipo_t;
  v_generadas int := 0;
  v_resueltas int := 0;
begin
  -- ── Resolver alertas activas cuyo stock ya volvió a un nivel sano ──
  update public.mant_inventario_alertas a
    set resuelta_at = now()
    where a.resuelta_at is null
      and public.mant_stock(a.tenant_id, a.repuesto_id, a.almacen_id, current_date) > (
        select case a.tipo_alerta
          when 'sin_stock' then 0
          when 'stock_bajo' then coalesce(r.stock_minimo, 0)
          when 'punto_reorden' then coalesce(r.punto_reorden, 0)
        end
        from public.mant_repuestos r where r.id = a.repuesto_id
      );
  get diagnostics v_resueltas = row_count;

  -- ── Detectar situaciones nuevas, por cada combinación repuesto+almacén con movimientos ──
  for v_fila in
    select distinct m.tenant_id, m.repuesto_id, m.almacen_id
    from public.mant_inventario_movimientos m
    join public.tenants t on t.id = m.tenant_id
    where t.status = 'active'
  loop
    declare
      v_stock numeric;
      v_repuesto public.mant_repuestos;
    begin
      select * into v_repuesto from public.mant_repuestos where id = v_fila.repuesto_id and activo;
      if v_repuesto.id is null then
        continue;
      end if;

      v_stock := public.mant_stock(v_fila.tenant_id, v_fila.repuesto_id, v_fila.almacen_id, current_date);

      v_tipo := case
        when v_stock <= 0 then 'sin_stock'::public.inventario_alerta_tipo_t
        when v_repuesto.stock_minimo is not null and v_stock < v_repuesto.stock_minimo
          then 'stock_bajo'::public.inventario_alerta_tipo_t
        when v_repuesto.punto_reorden is not null and v_stock <= v_repuesto.punto_reorden
          then 'punto_reorden'::public.inventario_alerta_tipo_t
        else null
      end;

      if v_tipo is not null then
        insert into public.mant_inventario_alertas (tenant_id, repuesto_id, almacen_id, tipo_alerta, stock_actual)
        values (v_fila.tenant_id, v_fila.repuesto_id, v_fila.almacen_id, v_tipo, v_stock)
        on conflict (tenant_id, repuesto_id, almacen_id, tipo_alerta) where resuelta_at is null
          do nothing;
        if found then
          v_generadas := v_generadas + 1;
        end if;
      end if;
    exception when others then
      raise warning 'MANT_INVENTARIO_ALERTA_FALLIDA: repuesto % almacen % — %',
        v_fila.repuesto_id, v_fila.almacen_id, sqlerrm;
    end;
  end loop;

  raise notice 'MANT_INVENTARIO_ALERTAS_CRON: % nuevas, % resueltas', v_generadas, v_resueltas;
end;
$$;

revoke execute on function public.cron_mant_inventario_alertas_diario() from public, anon, authenticated;

comment on function public.cron_mant_inventario_alertas_diario() is
  'MANT-6 §4.5: resuelve alertas activas cuyo stock volvió a un nivel sano y detecta situaciones '
  'nuevas (sin_stock/stock_bajo/punto_reorden) por cada repuesto+almacén con movimientos, para '
  'cada tenant activo. Solo INSERTA/marca resuelta_at — nunca toca mant_repuestos ni genera '
  'ninguna orden de compra. Corre vía pg_cron (job "mant-inventario-alertas-diario").';

select cron.schedule(
  'mant-inventario-alertas-diario',
  '0 8 * * *',
  $$select public.cron_mant_inventario_alertas_diario()$$
);
