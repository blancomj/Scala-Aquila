-- ═══════════════════════════════════════════════════════════════════════
--  GOB-6 · gobierno_expediente_actuaciones — append-only, art. 58-60
--  Ver GOB_06_convivencia_sanciones.md §4.3, prueba 10.
--
--  Mismo patrón que caso_juridico_actuaciones (CAR §15.4, ya reutilizado
--  por GOB-5): bitácora append-only con forbid_mutation() genérico. La
--  fila 'sancion_impuesta' la crea SOLO gobierno_imponer_sancion() (no
--  gobierno_registrar_actuacion) porque exige los 5 guards de la tutela;
--  la fila 'archivado' la crea SOLO gobierno_archivar_expediente().
-- ═══════════════════════════════════════════════════════════════════════

create table public.gobierno_expediente_actuaciones (
  id             uuid primary key default gen_random_uuid(),
  tenant_id      uuid not null references public.tenants (id) on delete cascade,
  expediente_id  uuid not null references public.gobierno_expedientes_convivencia (id) on delete cascade,
  etapa          public.gobierno_expediente_etapa_t not null,
  fecha          date not null,
  descripcion    text not null,
  documento_id   uuid references public.documentos (id),
  plazo_dias     integer,
  fecha_limite   date,
  registrado_por uuid references public.profiles (id),
  created_at     timestamptz not null default now()
);

alter table public.gobierno_expediente_actuaciones enable row level security;
alter table public.gobierno_expediente_actuaciones force row level security;

create index gobierno_expediente_actuaciones_tenant_idx on public.gobierno_expediente_actuaciones (tenant_id);
create index gobierno_expediente_actuaciones_expediente_idx on public.gobierno_expediente_actuaciones (expediente_id);

comment on table public.gobierno_expediente_actuaciones is
  'GOB-6: bitácora append-only del expediente — cada fila es un hito del debido proceso. '
  'gobierno_imponer_sancion()/gobierno_registrar_actuacion() verifican su existencia por etapa '
  'antes de permitir avanzar (nunca se corrige un hito ya logueado, se agrega uno nuevo).';

create policy gobierno_expediente_actuaciones_select_miembro
  on public.gobierno_expediente_actuaciones for select
  to authenticated
  using (public.is_member(tenant_id));

create trigger gobierno_expediente_actuaciones_append_only
  before update or delete on public.gobierno_expediente_actuaciones
  for each row execute function public.forbid_mutation();

-- ── gobierno_registrar_actuacion: los pasos procesales previos a la sanción ──
create function public.gobierno_registrar_actuacion(
  p_expediente_id uuid,
  p_etapa public.gobierno_expediente_etapa_t,
  p_fecha date,
  p_descripcion text,
  p_documento_id uuid default null,
  p_plazo_dias integer default null
)
returns public.gobierno_expediente_actuaciones
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_expediente public.gobierno_expedientes_convivencia;
  v_fecha_limite date;
  v_actuacion public.gobierno_expediente_actuaciones;
begin
  select * into v_expediente from public.gobierno_expedientes_convivencia where id = p_expediente_id;
  if not found then
    raise exception 'EXPEDIENTE_INEXISTENTE: expediente % no existe', p_expediente_id;
  end if;

  if (select auth.uid()) is not null
     and not public.has_role(v_expediente.tenant_id, array['auxiliar']::public.tenant_role_t[])
  then
    raise exception 'EXPEDIENTE_TRANSICION_REQUIERE_AUXILIAR: registrar una actuación exige rol '
      'auxiliar';
  end if;

  if v_expediente.etapa in ('archivado', 'firme') then
    raise exception 'EXPEDIENTE_ETAPA_TERMINAL: el expediente % ya está en % (terminal), no '
      'admite nuevas actuaciones', p_expediente_id, v_expediente.etapa;
  end if;

  if p_etapa in ('reportado', 'sancion_impuesta', 'archivado') then
    raise exception 'ACTUACION_ETAPA_RESERVADA: la etapa % no se registra con esta función — '
      'reportado se crea al reportar el expediente, sancion_impuesta exige '
      'gobierno_imponer_sancion(), archivado exige gobierno_archivar_expediente()', p_etapa;
  end if;

  if p_plazo_dias is not null then
    v_fecha_limite := p_fecha + p_plazo_dias;
  end if;

  insert into public.gobierno_expediente_actuaciones (
    tenant_id, expediente_id, etapa, fecha, descripcion, documento_id, plazo_dias, fecha_limite
  ) values (
    v_expediente.tenant_id, p_expediente_id, p_etapa, p_fecha, p_descripcion, p_documento_id,
    p_plazo_dias, v_fecha_limite
  )
  returning * into v_actuacion;

  update public.gobierno_expedientes_convivencia set etapa = p_etapa, updated_at = now()
  where id = p_expediente_id;

  return v_actuacion;
end;
$$;

comment on function public.gobierno_registrar_actuacion(uuid, public.gobierno_expediente_etapa_t, date, text, uuid, integer) is
  'GOB-6: registra un hito procesal (conciliacion_comite/requerimiento_escrito/descargos) y '
  'avanza gobierno_expedientes_convivencia.etapa al mismo valor — el log ES el mecanismo de '
  'avance, no hay un UPDATE directo aparte.';

-- ── gobierno_archivar_expediente: terminal sin sanción ───────────────────
create function public.gobierno_archivar_expediente(p_expediente_id uuid, p_motivo text)
returns public.gobierno_expedientes_convivencia
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_expediente public.gobierno_expedientes_convivencia;
begin
  select * into v_expediente from public.gobierno_expedientes_convivencia where id = p_expediente_id;
  if not found then
    raise exception 'EXPEDIENTE_INEXISTENTE: expediente % no existe', p_expediente_id;
  end if;

  if (select auth.uid()) is not null
     and not public.has_role(v_expediente.tenant_id, array['auxiliar']::public.tenant_role_t[])
  then
    raise exception 'EXPEDIENTE_TRANSICION_REQUIERE_AUXILIAR: archivar un expediente exige rol '
      'auxiliar';
  end if;

  if v_expediente.etapa in ('archivado', 'firme') then
    raise exception 'EXPEDIENTE_ETAPA_TERMINAL: el expediente % ya está en % (terminal)',
      p_expediente_id, v_expediente.etapa;
  end if;

  insert into public.gobierno_expediente_actuaciones (tenant_id, expediente_id, etapa, fecha, descripcion)
  values (v_expediente.tenant_id, p_expediente_id, 'archivado', current_date, p_motivo);

  update public.gobierno_expedientes_convivencia
  set etapa = 'archivado', estado_final = p_motivo, cerrado_at = now(), updated_at = now()
  where id = p_expediente_id
  returning * into v_expediente;

  return v_expediente;
end;
$$;
