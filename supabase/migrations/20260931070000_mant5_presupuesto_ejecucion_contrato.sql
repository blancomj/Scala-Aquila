-- ═══════════════════════════════════════════════════════════════════════
--  MANT-5 · Proveedores, contratos y garantías (6/9)
--  Casos de uso/Tres Modulos/Mantenimiento/MANT_05_proveedores_contratos_garantias.md §4.3
--
--  presupuesto_ejecucion.contrato_id (confirmado con el usuario): un
--  tercero puede tener varios contratos a la vez — sin esta columna, el
--  "comprometido/ejecutado" de LA FICHA DE UN CONTRATO solo podría filtrar
--  por tercero_id, y sería ambiguo en cuanto hubiera dos contratos
--  simultáneos con el mismo proveedor. Mismo patrón de alta incremental ya
--  usado sobre esta tabla (activo_id en MANT-0, agrupacion_id/
--  centro_costo_id en PC).
--
--  También completa las dos FK que MANT-3/MANT-4 dejaron a propósito sin
--  apuntar a nada ("MANT-5 no existe todavía") y agrega
--  mant_ordenes_trabajo.requiere_trabajo_alturas — condición que
--  mant_habilitacion_requerida necesita y que ninguna columna existente
--  capturaba (mismo criterio que acreditacion_referencia/requiere_medicion
--  en MANT-4, D-56: adición documentada, no omisión).
-- ═══════════════════════════════════════════════════════════════════════

alter table public.presupuesto_ejecucion
  add column contrato_id uuid references public.mant_contratos (id);

create index presupuesto_ejecucion_contrato_idx on public.presupuesto_ejecucion (contrato_id)
  where contrato_id is not null;

comment on column public.presupuesto_ejecucion.contrato_id is
  'MANT-5 §4.3: a qué contrato corresponde este movimiento, si alguno. mant_contrato_ejecucion() '
  'lo usa para dar el "ejecutado" real de un contrato — nunca se calcula ni se guarda aparte.';

-- ── guard extendido: valida tenant de contrato_id, igual que activo_id/agrupacion_id ────
create or replace function public.guard_presupuesto_ejecucion_activo()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_activo_tenant   uuid;
  v_contrato_tenant uuid;
begin
  if new.activo_id is not null then
    select tenant_id into v_activo_tenant from public.activos where id = new.activo_id;
    if v_activo_tenant is null or v_activo_tenant <> new.tenant_id then
      raise exception 'ACTIVO_TENANT_INCONSISTENTE: activo_id % no pertenece al tenant',
        new.activo_id;
    end if;
  end if;

  if new.contrato_id is not null then
    select tenant_id into v_contrato_tenant from public.mant_contratos where id = new.contrato_id;
    if v_contrato_tenant is null or v_contrato_tenant <> new.tenant_id then
      raise exception 'CONTRATO_TENANT_INCONSISTENTE: contrato_id % no pertenece al tenant',
        new.contrato_id;
    end if;
  end if;

  return new;
end;
$$;

-- ── Comprometido/ejecutado del contrato, SIEMPRE leídos de la fuente real ───────────────
create function public.mant_contrato_ejecucion(p_contrato_id uuid)
returns table (comprometido numeric, ejecutado numeric)
language sql
stable
set search_path = ''
as $$
  select
    c.valor_total,
    coalesce((select sum(pe.monto) from public.presupuesto_ejecucion pe
              where pe.contrato_id = c.id), 0)
  from public.mant_contratos c
  where c.id = p_contrato_id;
$$;

comment on function public.mant_contrato_ejecucion(uuid) is
  'MANT-5 §4.3/§4.6: "comprometido" es el propio valor_total pactado del contrato (un término, '
  'no un saldo que pueda divergir); "ejecutado" es la suma real de presupuesto_ejecucion filtrada '
  'por contrato_id. El contrato nunca lleva su propio total — la UI consulta siempre esta '
  'función, con indicación explícita de la fuente (§4.6).';

-- ── Completar las FK que MANT-3/MANT-4 dejaron sin apuntar a nada ───────────────────────
alter table public.mant_ordenes_trabajo
  add constraint mant_ordenes_trabajo_contrato_id_fkey
  foreign key (contrato_id) references public.mant_contratos (id);

comment on column public.mant_ordenes_trabajo.contrato_id is
  'MANT-5: FK real completada (creada como uuid sin FK en MANT-4, "MANT-5 no existe todavía"). '
  'El SLA del contrato (sla_solucion_horas) fija fecha_limite cuando la OT nace contra él y no '
  'trae su propia fecha límite — ver guard_mant_ot extendido, 20260931080000.';

alter table public.mant_planes
  add constraint mant_planes_contrato_id_fkey
  foreign key (contrato_id) references public.mant_contratos (id);

comment on column public.mant_planes.contrato_id is
  'MANT-5: FK real completada (creada como uuid sin FK en MANT-3, "MANT-5 no existe todavía").';

-- ── requiere_trabajo_alturas — condición que mant_habilitacion_requerida necesita ───────
alter table public.mant_ordenes_trabajo
  add column requiere_trabajo_alturas boolean not null default false;

comment on column public.mant_ordenes_trabajo.requiere_trabajo_alturas is
  'MANT-5 §4.2 (adición sobre el corte original, ver D-57): ninguna columna existente capturaba '
  '"la tarea implica trabajo en alturas", y mant_habilitacion_requerida la necesita como '
  'condición. Mismo patrón que requiere_parada_servicio, ya en esta misma tabla.';
