-- ═══════════════════════════════════════════════════════════════════════
--  GOB-2 · gobierno_agenda_puntos
--  Ver GOB_02_reunion_convocatoria_asistencia.md §4.3, prueba 4
--
--  ATRIBUCION_TIPO_INVALIDO se reutiliza TAL CUAL de GOB-1 (mismo
--  significado exacto: atribucion_id no pertenece a la familia
--  ATRIBUCION_ORGANO) — no se inventa un código nuevo para lo mismo.
--
--  Añadir puntos en sesión queda bloqueado (fuera de alcance, pregunta para
--  el abogado — §4.3 del corte): AGENDA_INMUTABLE_TRAS_INSTALAR bloquea
--  insert/update/delete sobre cualquier punto de una reunión que ya no esté
--  en estado 'convocada', sin excepción.
-- ═══════════════════════════════════════════════════════════════════════

create table public.gobierno_agenda_puntos (
  id                uuid primary key default gen_random_uuid(),
  tenant_id         uuid not null references public.tenants (id) on delete cascade,
  reunion_id        uuid not null references public.gobierno_reuniones (id) on delete cascade,
  orden             int not null,
  titulo            text not null,
  descripcion       text,
  requiere_decision boolean not null default false,
  atribucion_id     bigint references public.lista_tipos (id),
  documento_id      uuid references public.documentos (id),
  created_at        timestamptz not null default now(),
  updated_at        timestamptz,

  constraint gobierno_agenda_puntos_orden_unico unique (reunion_id, orden)
);

alter table public.gobierno_agenda_puntos enable row level security;
alter table public.gobierno_agenda_puntos force row level security;

create index gobierno_agenda_puntos_tenant_idx on public.gobierno_agenda_puntos (tenant_id);
create index gobierno_agenda_puntos_reunion_idx on public.gobierno_agenda_puntos (reunion_id);

comment on table public.gobierno_agenda_puntos is
  'GOB-2: orden del día de una reunión. atribucion_id conecta con GOB-1 — un punto que aprueba '
  'el presupuesto declara aprobar_presupuesto, y GOB-3 podrá verificar competencia del órgano. '
  'Inmutable tras instalar (AGENDA_INMUTABLE_TRAS_INSTALAR): añadir puntos en sesión es una '
  'decisión jurídica delicada, bloqueada hasta respuesta del abogado.';

create policy gobierno_agenda_puntos_select_miembro
  on public.gobierno_agenda_puntos for select
  to authenticated
  using (public.is_member(tenant_id));

create policy gobierno_agenda_puntos_insert_auxiliar
  on public.gobierno_agenda_puntos for insert
  to authenticated
  with check (public.has_role(tenant_id, array['auxiliar']::public.tenant_role_t[]));

create policy gobierno_agenda_puntos_update_auxiliar
  on public.gobierno_agenda_puntos for update
  to authenticated
  using (public.has_role(tenant_id, array['auxiliar']::public.tenant_role_t[]))
  with check (public.has_role(tenant_id, array['auxiliar']::public.tenant_role_t[]));

create policy gobierno_agenda_puntos_delete_auxiliar
  on public.gobierno_agenda_puntos for delete
  to authenticated
  using (public.has_role(tenant_id, array['auxiliar']::public.tenant_role_t[]));

create function public.guard_gobierno_agenda_punto()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_reunion_id uuid;
  v_tenant_reunion uuid;
  v_estado_reunion public.reunion_estado_t;
  v_atribucion_codigo text;
begin
  v_reunion_id := coalesce(new.reunion_id, old.reunion_id);

  select tenant_id, estado into v_tenant_reunion, v_estado_reunion
  from public.gobierno_reuniones where id = v_reunion_id;

  if tg_op in ('INSERT', 'UPDATE') and v_tenant_reunion is distinct from new.tenant_id then
    raise exception 'AGENDA_REUNION_INVALIDA: reunion_id % no pertenece al tenant %', v_reunion_id, new.tenant_id;
  end if;

  if v_estado_reunion <> 'convocada' then
    raise exception 'AGENDA_INMUTABLE_TRAS_INSTALAR: el orden del día de la reunión % es '
      'inmutable en estado %', v_reunion_id, v_estado_reunion;
  end if;

  if tg_op in ('INSERT', 'UPDATE') and new.atribucion_id is not null then
    select codigo into v_atribucion_codigo
    from public.lista_tipos where id = new.atribucion_id and tipo = 'ATRIBUCION_ORGANO';
    if v_atribucion_codigo is null then
      raise exception 'ATRIBUCION_TIPO_INVALIDO: atribucion_id % no pertenece a ATRIBUCION_ORGANO', new.atribucion_id;
    end if;
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

comment on function public.guard_gobierno_agenda_punto() is
  'GOB-2: AGENDA_REUNION_INVALIDA (tenant), AGENDA_INMUTABLE_TRAS_INSTALAR (reunión no en '
  'convocada), ATRIBUCION_TIPO_INVALIDO (reutilizado de GOB-1, mismo significado).';

create trigger guard_gobierno_agenda_punto
  before insert or update or delete on public.gobierno_agenda_puntos
  for each row execute function public.guard_gobierno_agenda_punto();

create trigger set_updated_at before update on public.gobierno_agenda_puntos
  for each row execute function public.set_updated_at();
