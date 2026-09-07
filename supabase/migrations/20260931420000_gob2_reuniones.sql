-- ═══════════════════════════════════════════════════════════════════════
--  GOB-2 · gobierno_reuniones
--  Ver GOB_02_reunion_convocatoria_asistencia.md §4.1, pruebas 1-3, 5-6, 12
--
--  fn_coeficiente_set_vigente(tenant, fecha): hallazgo del Plan del corte —
--  NO existe en el repo ninguna función que resuelva "el coeficiente_set
--  vigente a una fecha dada" (todo consumidor existente solo filtra
--  estado='vigente', el actual). coeficiente_sets ya tiene vigente_desde/
--  vigente_hasta con rangos no solapados por construcción
--  (guard_coeficiente_set_inmutable solo permite vigente→historica con
--  vigente_hasta puesto en el mismo acto que activa el reemplazo), así que
--  resolver por fecha es una consulta nueva sobre una tabla existente, no
--  una tabla nueva.
--
--  coeficiente_set_id se congela AL INSTALAR (no antes): un trigger resuelve
--  fn_coeficiente_set_vigente(tenant_id, fecha_hora::date) y lo fija.
--  gobierno_asistencia (próxima migración) resuelve el mismo set de forma
--  independiente en el momento de cada registro (antes de instalar puede no
--  existir todavía la columna congelada) — ambas resoluciones usan la misma
--  función con la misma fecha, así que siempre coinciden.
--
--  presidente_miembro_id/secretario_miembro_id obligatorios para instalar
--  CUALQUIER reunión, no solo asamblea: el corte original (art. 47) lo pide
--  para el acta de asamblea, pero se aplica a todo tipo de reunión por
--  simplicidad y porque gobierno_miembros ya modela presidente/secretario
--  para todo órgano (GOB-1) — decisión de diseño, documentada en el informe.
-- ═══════════════════════════════════════════════════════════════════════

create or replace function public.fn_coeficiente_set_vigente(p_tenant_id uuid, p_fecha date)
returns uuid
language sql
stable
security invoker
set search_path = ''
as $$
  select id
  from public.coeficiente_sets
  where tenant_id = p_tenant_id
    and estado in ('vigente', 'historica')
    and vigente_desde <= p_fecha
    and (vigente_hasta is null or vigente_hasta >= p_fecha)
  order by version desc
  limit 1
$$;

comment on function public.fn_coeficiente_set_vigente(uuid, date) is
  'GOB-2: resuelve el coeficiente_sets vigente a una fecha dada (histórico incluido), no solo el '
  'actual. Usado para congelar gobierno_reuniones.coeficiente_set_id al instalar y para resolver '
  'el coeficiente de cada gobierno_asistencia — reproducibilidad del quórum (marco §4.1).';

create table public.gobierno_reuniones (
  id                              uuid primary key default gen_random_uuid(),
  tenant_id                       uuid not null references public.tenants (id) on delete cascade,
  organo_id                       uuid not null references public.gobierno_organos (id),
  tipo_id                         bigint not null references public.lista_tipos (id),
  modalidad                       public.reunion_modalidad_t not null,
  convocatoria_regimen            public.reunion_convocatoria_t not null,
  convocatoria_antecedente_id     uuid references public.gobierno_reuniones (id),
  fecha_hora                      timestamptz not null,
  lugar                           text,
  medio                           text,
  estado                          public.reunion_estado_t not null default 'convocada',
  presidente_miembro_id           uuid references public.gobierno_miembros (id),
  secretario_miembro_id           uuid references public.gobierno_miembros (id),
  coeficiente_set_id              uuid references public.coeficiente_sets (id),
  instalada_at                    timestamptz,
  cerrada_at                      timestamptz,
  cancelada_motivo                text,
  created_at                      timestamptz not null default now(),
  updated_at                      timestamptz,

  constraint gobierno_reuniones_lugar_si_presencial
    check (modalidad = 'no_presencial' or lugar is not null),
  constraint gobierno_reuniones_medio_si_no_presencial
    check (modalidad = 'presencial' or medio is not null),
  constraint gobierno_reuniones_cancelada_con_motivo
    check (estado <> 'cancelada' or cancelada_motivo is not null),
  constraint gobierno_reuniones_segunda_con_antecedente
    check (convocatoria_regimen <> 'segunda' or convocatoria_antecedente_id is not null)
);

alter table public.gobierno_reuniones enable row level security;
alter table public.gobierno_reuniones force row level security;

create index gobierno_reuniones_tenant_idx on public.gobierno_reuniones (tenant_id);
create index gobierno_reuniones_organo_idx on public.gobierno_reuniones (organo_id);
create index gobierno_reuniones_antecedente_idx
  on public.gobierno_reuniones (convocatoria_antecedente_id) where convocatoria_antecedente_id is not null;

comment on table public.gobierno_reuniones is
  'GOB-2: reunión de un órgano de gobierno, con modalidad, régimen de convocatoria y su '
  'coeficiente_set congelado al instalar (reproducibilidad del quórum). No calcula quórum ni '
  'votación (GOB-3) — solo registra los insumos.';
comment on column public.gobierno_reuniones.coeficiente_set_id is
  'Congelado por el trigger al pasar a instalada (fn_coeficiente_set_vigente a fecha_hora). '
  'Inmutable después: REUNION_COEFICIENTE_SET_INMUTABLE.';

create policy gobierno_reuniones_select_miembro
  on public.gobierno_reuniones for select
  to authenticated
  using (public.is_member(tenant_id));

create policy gobierno_reuniones_insert_auxiliar
  on public.gobierno_reuniones for insert
  to authenticated
  with check (public.has_role(tenant_id, array['auxiliar']::public.tenant_role_t[]));

create policy gobierno_reuniones_update_auxiliar
  on public.gobierno_reuniones for update
  to authenticated
  using (public.has_role(tenant_id, array['auxiliar']::public.tenant_role_t[]))
  with check (public.has_role(tenant_id, array['auxiliar']::public.tenant_role_t[]));

-- ── guard: FSM, congelamiento de coeficiente_set, y las reglas duras del §4.1 ──
create function public.guard_gobierno_reunion()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_tenant_organo uuid;
  v_tipo_codigo text;
  v_set_id uuid;
  v_suma_total numeric(12, 10);
  v_asistencia_total numeric(12, 10);
  v_antecedente_regimen public.reunion_convocatoria_t;
  v_antecedente_tenant uuid;
begin
  select tenant_id into v_tenant_organo from public.gobierno_organos where id = new.organo_id;
  if v_tenant_organo is distinct from new.tenant_id then
    raise exception 'REUNION_ORGANO_INVALIDO: organo_id % no pertenece al tenant %', new.organo_id, new.tenant_id;
  end if;

  select codigo into v_tipo_codigo from public.lista_tipos where id = new.tipo_id and tipo = 'TIPO_REUNION';
  if v_tipo_codigo is null then
    raise exception 'REUNION_TIPO_INVALIDO: tipo_id % no pertenece a TIPO_REUNION', new.tipo_id;
  end if;

  if new.convocatoria_antecedente_id is not null then
    select tenant_id, convocatoria_regimen into v_antecedente_tenant, v_antecedente_regimen
    from public.gobierno_reuniones where id = new.convocatoria_antecedente_id;
    if v_antecedente_tenant is distinct from new.tenant_id then
      raise exception 'SEGUNDA_CONVOCATORIA_SIN_ANTECEDENTE: el antecedente % no pertenece al tenant',
        new.convocatoria_antecedente_id;
    end if;
  end if;

  if tg_op = 'INSERT' then
    return new;
  end if;

  -- cerrada es terminal e inmutable, sin excepción.
  if old.estado = 'cerrada' then
    raise exception 'REUNION_CERRADA_INMUTABLE: la reunión % está cerrada y es inmutable', old.id;
  end if;

  -- coeficiente_set_id congelado: inmutable una vez fijado (test 3).
  if old.coeficiente_set_id is not null and new.coeficiente_set_id is distinct from old.coeficiente_set_id then
    raise exception 'REUNION_COEFICIENTE_SET_INMUTABLE: el coeficiente_set de la reunión % ya está '
      'congelado en %', old.id, old.coeficiente_set_id;
  end if;

  if old.estado is distinct from new.estado then
    if not (
      (old.estado = 'convocada' and new.estado in ('instalada', 'cancelada'))
      or (old.estado = 'instalada' and new.estado = 'cerrada')
    ) then
      raise exception 'REUNION_TRANSICION_INVALIDA: % → % no es una transición válida', old.estado, new.estado;
    end if;

    if new.estado in ('instalada', 'cerrada') and (select auth.uid()) is not null then
      if not public.has_role(new.tenant_id, array['administrador']::public.tenant_role_t[]) then
        raise exception 'REUNION_TRANSICION_REQUIERE_ADMINISTRADOR: instalar o cerrar la reunión % '
          'requiere rol administrador', old.id;
      end if;
    end if;

    if new.estado = 'instalada' then
      if new.presidente_miembro_id is null or new.secretario_miembro_id is null then
        raise exception 'REUNION_SIN_PRESIDENTE_O_SECRETARIO: instalar exige presidente_miembro_id '
          'y secretario_miembro_id (Ley 675 art. 47)';
      end if;

      v_set_id := public.fn_coeficiente_set_vigente(new.tenant_id, new.fecha_hora::date);
      new.coeficiente_set_id := v_set_id;

      if new.convocatoria_regimen = 'universal_sin_convocatoria' then
        select suma_total into v_suma_total from public.coeficiente_sets where id = v_set_id;
        select coalesce(sum(a.coeficiente), 0) into v_asistencia_total
        from public.gobierno_asistencia a
        where a.reunion_id = new.id and a.calidad <> 'invitado' and a.salida_at is null;
        if v_set_id is null or v_asistencia_total < v_suma_total then
          raise exception 'REUNION_UNIVERSAL_SIN_TOTALIDAD_COEFICIENTES: la asistencia (%) no '
            'representa el 100%% de los coeficientes (%) — Ley 675 art. 40', v_asistencia_total, v_suma_total;
        end if;
      end if;

      new.instalada_at := now();
    end if;

    if new.estado = 'cerrada' then
      new.cerrada_at := now();
    end if;
  end if;

  return new;
end;
$$;

comment on function public.guard_gobierno_reunion() is
  'GOB-2: REUNION_ORGANO_INVALIDO/REUNION_TIPO_INVALIDO, FSM (REUNION_TRANSICION_INVALIDA, '
  'REUNION_CERRADA_INMUTABLE), REUNION_TRANSICION_REQUIERE_ADMINISTRADOR (instalar/cerrar), '
  'REUNION_SIN_PRESIDENTE_O_SECRETARIO y congelamiento de coeficiente_set_id al instalar '
  '(REUNION_COEFICIENTE_SET_INMUTABLE después), REUNION_UNIVERSAL_SIN_TOTALIDAD_COEFICIENTES.';

create trigger guard_gobierno_reunion
  before insert or update on public.gobierno_reuniones
  for each row execute function public.guard_gobierno_reunion();

create trigger set_updated_at before update on public.gobierno_reuniones
  for each row execute function public.set_updated_at();
