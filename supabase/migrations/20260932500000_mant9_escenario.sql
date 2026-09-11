-- ═══════════════════════════════════════════════════════════════════════
--  MANT-9 · Salud del activo y apoyo a la decisión (6/7)
--  Casos de uso/Tres Modulos/Mantenimiento/MANT_09_salud_decision.md §3.3
--
--  supuestos jsonb: objeto con una clave por supuesto, cada valor
--  {valor, unidad, origen, editable} — origen ∈ {'sistema','usuario',
--  'parametro_tenant'}. Los de origen 'sistema' los completa
--  mant_evaluar_escenario() automáticamente (nunca los digita nadie); los
--  de origen 'usuario' NO tienen default — si faltan al evaluar,
--  ESCENARIO_SUPUESTOS_INCOMPLETOS con la lista exacta de cuáles.
--
--  Prohibido (§3.3, vinculante): ningún campo `recomendacion`. resultado
--  jsonb solo tiene componentes + total + sensibilidad (participación %
--  de cada componente en el total) — nunca un veredicto.
-- ═══════════════════════════════════════════════════════════════════════

create table public.mant_escenario (
  id         uuid primary key default gen_random_uuid(),
  tenant_id  uuid not null references public.tenants (id) on delete cascade,
  activo_id  uuid not null references public.activos (id),
  nombre     text not null,
  tipo       public.escenario_tipo_t not null,
  supuestos  jsonb not null default '{}'::jsonb,
  resultado  jsonb,
  -- La decisión de gobierno que resolvió este escenario (GOB-5) — nulable: un escenario puede
  -- existir solo para comparar, sin que todavía haya una decisión formal que lo resuelva.
  decision_id    uuid references public.gobierno_decisiones (id),
  creado_por     uuid references public.profiles (id),
  creado_at      timestamptz not null default now(),
  updated_at     timestamptz,
  evaluado_at    timestamptz,

  constraint mant_escenario_nombre_no_vacio check (btrim(nombre) <> '')
);

alter table public.mant_escenario enable row level security;
alter table public.mant_escenario force row level security;

create index mant_escenario_tenant_idx on public.mant_escenario (tenant_id);
create index mant_escenario_activo_idx on public.mant_escenario (activo_id);

comment on table public.mant_escenario is
  'MANT-9 §3.3: comparación reparar/reemplazar/mantener para UN activo, con supuestos explícitos '
  'y su origen declarado. resultado lo escribe SOLO mant_evaluar_escenario() — nunca se digita a '
  'mano, y nunca incluye un campo de recomendación única (prueba 9, estructural).';

create function public.guard_mant_escenario()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (select 1 from public.activos where id = new.activo_id and tenant_id = new.tenant_id) then
    raise exception 'ESCENARIO_TENANT_INCONSISTENTE: el activo % no pertenece al tenant', new.activo_id;
  end if;
  if new.decision_id is not null
     and not exists (select 1 from public.gobierno_decisiones where id = new.decision_id and tenant_id = new.tenant_id) then
    raise exception 'ESCENARIO_TENANT_INCONSISTENTE: la decisión % no pertenece al tenant', new.decision_id;
  end if;
  if jsonb_typeof(new.supuestos) is distinct from 'object' then
    raise exception 'ESCENARIO_SUPUESTOS_FORMATO_INVALIDO: supuestos debe ser un objeto jsonb';
  end if;
  return new;
end;
$$;

comment on function public.guard_mant_escenario() is
  'MANT-9 §3.3: activo_id/decision_id deben pertenecer al tenant. La completitud de supuestos de '
  'origen usuario NO se valida aquí — un escenario se puede guardar incompleto mientras se arma; '
  'solo mant_evaluar_escenario() la exige (ESCENARIO_SUPUESTOS_INCOMPLETOS).';

create trigger set_updated_at before update on public.mant_escenario
  for each row execute function public.set_updated_at();

create trigger guard_mant_escenario
  before insert or update on public.mant_escenario
  for each row execute function public.guard_mant_escenario();

create policy mant_escenario_select_miembro
  on public.mant_escenario for select
  to authenticated
  using (public.is_member(tenant_id));

create policy mant_escenario_insert_auxiliar
  on public.mant_escenario for insert
  to authenticated
  with check (public.has_role(tenant_id, array['auxiliar']::public.tenant_role_t[]));

create policy mant_escenario_update_auxiliar
  on public.mant_escenario for update
  to authenticated
  using (public.has_role(tenant_id, array['auxiliar']::public.tenant_role_t[]))
  with check (public.has_role(tenant_id, array['auxiliar']::public.tenant_role_t[]));

create policy mant_escenario_delete_auxiliar
  on public.mant_escenario for delete
  to authenticated
  using (public.has_role(tenant_id, array['auxiliar']::public.tenant_role_t[]));

-- ── mant_evaluar_escenario: arma resultado, nunca una recomendación ──────
create function public.mant_evaluar_escenario(p_escenario_id uuid)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  v_esc record;
  v_supuestos jsonb;
  v_requeridos text[];
  v_faltantes text[];
  v_clave text;
  v_costo_historico_anual numeric;
  v_ppe record;
  v_componentes jsonb := '[]'::jsonb;
  v_total numeric := 0;
  v_monto numeric;
  v_sensibilidad jsonb := '[]'::jsonb;
  v_comp jsonb;
  v_horizonte numeric;
begin
  select * into v_esc from public.mant_escenario where id = p_escenario_id;
  if v_esc.id is null then
    raise exception 'ESCENARIO_INEXISTENTE: % no existe', p_escenario_id;
  end if;

  -- ── Supuestos de sistema, siempre recalculados (nunca digitados) ──
  select coalesce(sum(monto), 0) into v_costo_historico_anual
    from public.mant_costos(v_esc.tenant_id, (current_date - interval '1 year')::date, current_date)
   where activo_id = v_esc.activo_id;

  select * into v_ppe from public.mant_ppe_por_activo(v_esc.tenant_id, current_date)
   where activo_id = v_esc.activo_id;

  v_supuestos := v_esc.supuestos
    || jsonb_build_object('costo_historico_mantenimiento_anual',
         jsonb_build_object('valor', v_costo_historico_anual, 'unidad', 'COP/año', 'origen', 'sistema', 'editable', false))
    || jsonb_build_object('valor_en_libros',
         jsonb_build_object('valor', coalesce(v_ppe.valor_neto, 0), 'unidad', 'COP', 'origen', 'sistema', 'editable', false))
    || jsonb_build_object('depreciacion_acumulada',
         jsonb_build_object('valor', coalesce(v_ppe.depreciacion_acumulada, 0), 'unidad', 'COP', 'origen', 'sistema', 'editable', false));

  -- ── Qué supuestos de ORIGEN USUARIO exige cada tipo (§3.3) ──
  v_requeridos := case v_esc.tipo
    when 'reparar' then array['costo_reparacion_mayor', 'costo_indisponibilidad', 'vida_util_restante_anios']
    when 'reemplazar' then array['costo_reemplazo', 'costo_indisponibilidad']
    when 'mantener' then array['vida_util_restante_anios']
  end;

  v_faltantes := array[]::text[];
  foreach v_clave in array v_requeridos loop
    if (v_supuestos -> v_clave -> 'valor') is null
       or jsonb_typeof(v_supuestos -> v_clave -> 'valor') = 'null' then
      v_faltantes := array_append(v_faltantes, v_clave);
    end if;
  end loop;

  if array_length(v_faltantes, 1) > 0 then
    raise exception 'ESCENARIO_SUPUESTOS_INCOMPLETOS: faltan los supuestos %',
      array_to_string(v_faltantes, ', ');
  end if;

  v_horizonte := (v_supuestos -> 'vida_util_restante_anios' -> 'valor')::numeric;

  -- ── Componentes del total, por tipo (§3.3) ──
  if v_esc.tipo in ('reparar', 'mantener') then
    v_monto := coalesce((v_supuestos -> 'costo_historico_mantenimiento_anual' -> 'valor')::numeric, 0) * coalesce(v_horizonte, 1);
    v_componentes := v_componentes || jsonb_build_array(jsonb_build_object(
      'concepto', 'Mantenimiento estimado (' || coalesce(v_horizonte, 1) || ' años, promedio histórico)',
      'origen', 'sistema', 'monto', v_monto));
    v_total := v_total + v_monto;
  end if;

  if v_esc.tipo = 'reparar' then
    v_monto := (v_supuestos -> 'costo_reparacion_mayor' -> 'valor')::numeric;
    v_componentes := v_componentes || jsonb_build_array(jsonb_build_object(
      'concepto', 'Reparación mayor', 'origen', 'usuario', 'monto', v_monto));
    v_total := v_total + v_monto;
  end if;

  if v_esc.tipo = 'reemplazar' then
    v_monto := (v_supuestos -> 'costo_reemplazo' -> 'valor')::numeric;
    v_componentes := v_componentes || jsonb_build_array(jsonb_build_object(
      'concepto', 'Costo de reemplazo', 'origen', 'usuario', 'monto', v_monto));
    v_total := v_total + v_monto;
  end if;

  if v_esc.tipo in ('reparar', 'reemplazar') and (v_supuestos -> 'costo_indisponibilidad' -> 'valor') is not null then
    v_monto := (v_supuestos -> 'costo_indisponibilidad' -> 'valor')::numeric;
    v_componentes := v_componentes || jsonb_build_array(jsonb_build_object(
      'concepto', 'Costo de indisponibilidad', 'origen', 'usuario', 'monto', v_monto));
    v_total := v_total + v_monto;
  end if;

  -- ── Sensibilidad: participación de cada componente en el total, NUNCA una recomendación ──
  for v_comp in select jsonb_array_elements(v_componentes)
  loop
    v_sensibilidad := v_sensibilidad || jsonb_build_array(jsonb_build_object(
      'concepto', v_comp ->> 'concepto',
      'participacion_pct', case when v_total = 0 then 0
        else round(100.0 * (v_comp ->> 'monto')::numeric / v_total, 1) end
    ));
  end loop;

  update public.mant_escenario
    set supuestos = v_supuestos,
        resultado = jsonb_build_object(
          'tipo', v_esc.tipo, 'horizonte_anios', v_horizonte,
          'componentes', v_componentes, 'total', v_total, 'sensibilidad', v_sensibilidad
        ),
        evaluado_at = now()
    where id = p_escenario_id;

  return (select resultado from public.mant_escenario where id = p_escenario_id);
end;
$$;

comment on function public.mant_evaluar_escenario(uuid) is
  'MANT-9 §3.3: arma el total del escenario y su sensibilidad (participación % de cada '
  'componente) — PROHIBIDO cualquier campo de recomendación (prueba 9, estructural verificada '
  'sobre esta definición). ESCENARIO_SUPUESTOS_INCOMPLETOS si falta algún supuesto de origen '
  'usuario que el tipo exige, con la lista exacta. Los supuestos de origen sistema '
  '(costo_historico_mantenimiento_anual, valor_en_libros, depreciacion_acumulada) se recalculan '
  'siempre, nunca se digitan.';
