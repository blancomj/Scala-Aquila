-- ═══════════════════════════════════════════════════════════════════════
--  GOB-2 · gobierno_convocatorias / gobierno_convocatoria_envios
--  Ver GOB_02_reunion_convocatoria_asistencia.md §4.2
--
--  NO se construyó un segundo motor de envío (prohibición explícita del
--  corte). acciones_cobranza_envios/_acuses (cartera) están acopladas a
--  cobranza (FK obligatoria a acciones_cobranza, columnas de mora) —
--  generalizarlas sería invasivo. El propio corte pide una tabla plana y
--  simple (envío + acuse en una sola fila), consistente con que cada módulo
--  del repo tiene su propio registro de dominio. Por decisión explícita del
--  usuario (Plan del corte): este corte solo implementa el MODELO DE DATOS
--  — el envío real (Brevo vía email_provider.ts/sms_provider.ts) queda para
--  cuando se necesite; enviado_at/acuse_at se registran manualmente desde
--  la UI. Ninguna de las 14 pruebas obligatorias exige disparo automático.
-- ═══════════════════════════════════════════════════════════════════════

create table public.gobierno_convocatorias (
  id                      uuid primary key default gen_random_uuid(),
  tenant_id               uuid not null references public.tenants (id) on delete cascade,
  reunion_id              uuid not null references public.gobierno_reuniones (id) on delete cascade,
  emitida_por             uuid references public.profiles (id),
  emitida_at              timestamptz not null default now(),
  fecha_limite_respuesta  timestamptz,
  documento_id            uuid references public.documentos (id),
  orden_del_dia_congelado jsonb,
  created_at              timestamptz not null default now()
);

alter table public.gobierno_convocatorias enable row level security;
alter table public.gobierno_convocatorias force row level security;

create index gobierno_convocatorias_tenant_idx on public.gobierno_convocatorias (tenant_id);
create index gobierno_convocatorias_reunion_idx on public.gobierno_convocatorias (reunion_id);

comment on table public.gobierno_convocatorias is
  'GOB-2: la convocatoria de una reunión. orden_del_dia_congelado es la copia del orden del día '
  'al momento de convocar (Ley 675 art. 47: el acta debe reflejar el orden del día que se '
  'comunicó, no el que quedó después de editarse).';

create policy gobierno_convocatorias_select_miembro
  on public.gobierno_convocatorias for select
  to authenticated
  using (public.is_member(tenant_id));

create policy gobierno_convocatorias_insert_auxiliar
  on public.gobierno_convocatorias for insert
  to authenticated
  with check (public.has_role(tenant_id, array['auxiliar']::public.tenant_role_t[]));

create function public.guard_gobierno_convocatoria()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_tenant_reunion uuid;
begin
  select tenant_id into v_tenant_reunion from public.gobierno_reuniones where id = new.reunion_id;
  if v_tenant_reunion is distinct from new.tenant_id then
    raise exception 'CONVOCATORIA_REUNION_INVALIDA: reunion_id % no pertenece al tenant %',
      new.reunion_id, new.tenant_id;
  end if;
  return new;
end;
$$;

comment on function public.guard_gobierno_convocatoria() is
  'GOB-2: CONVOCATORIA_REUNION_INVALIDA — reunion_id debe pertenecer al mismo tenant.';

create trigger guard_gobierno_convocatoria
  before insert on public.gobierno_convocatorias
  for each row execute function public.guard_gobierno_convocatoria();

create table public.gobierno_convocatoria_envios (
  id                     uuid primary key default gen_random_uuid(),
  tenant_id              uuid not null references public.tenants (id) on delete cascade,
  convocatoria_id        uuid not null references public.gobierno_convocatorias (id) on delete cascade,
  destinatario_ref       uuid not null references public.terceros (id),
  canal                  text not null,
  enviado_at             timestamptz,
  acuse_at               timestamptz,
  evidencia_documento_id uuid references public.documentos (id),
  created_at             timestamptz not null default now(),

  constraint gobierno_convocatoria_envios_canal_valido check (canal in ('email', 'sms'))
);

alter table public.gobierno_convocatoria_envios enable row level security;
alter table public.gobierno_convocatoria_envios force row level security;

create index gobierno_convocatoria_envios_tenant_idx on public.gobierno_convocatoria_envios (tenant_id);
create index gobierno_convocatoria_envios_convocatoria_idx
  on public.gobierno_convocatoria_envios (convocatoria_id);

comment on table public.gobierno_convocatoria_envios is
  'GOB-2: registro de a quién se envió una convocatoria y si hubo acuse — no dispara el envío '
  '(sin motor propio, ver cabecera de esta migración); enviado_at/acuse_at se registran desde '
  'la UI o, si más adelante se integra el envío real, desde la Edge Function que lo ejecute.';

create policy gobierno_convocatoria_envios_select_miembro
  on public.gobierno_convocatoria_envios for select
  to authenticated
  using (public.is_member(tenant_id));

create policy gobierno_convocatoria_envios_insert_auxiliar
  on public.gobierno_convocatoria_envios for insert
  to authenticated
  with check (public.has_role(tenant_id, array['auxiliar']::public.tenant_role_t[]));

create policy gobierno_convocatoria_envios_update_auxiliar
  on public.gobierno_convocatoria_envios for update
  to authenticated
  using (public.has_role(tenant_id, array['auxiliar']::public.tenant_role_t[]))
  with check (public.has_role(tenant_id, array['auxiliar']::public.tenant_role_t[]));

create function public.guard_gobierno_convocatoria_envio()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_tenant_convocatoria uuid;
  v_tenant_destinatario uuid;
begin
  select tenant_id into v_tenant_convocatoria
  from public.gobierno_convocatorias where id = new.convocatoria_id;
  if v_tenant_convocatoria is distinct from new.tenant_id then
    raise exception 'CONVOCATORIA_ENVIO_INVALIDO: convocatoria_id % no pertenece al tenant %',
      new.convocatoria_id, new.tenant_id;
  end if;

  select tenant_id into v_tenant_destinatario from public.terceros where id = new.destinatario_ref;
  if v_tenant_destinatario is distinct from new.tenant_id then
    raise exception 'CONVOCATORIA_ENVIO_INVALIDO: destinatario_ref % no pertenece al tenant %',
      new.destinatario_ref, new.tenant_id;
  end if;

  return new;
end;
$$;

comment on function public.guard_gobierno_convocatoria_envio() is
  'GOB-2: CONVOCATORIA_ENVIO_INVALIDO — convocatoria_id/destinatario_ref deben pertenecer al '
  'mismo tenant.';

create trigger guard_gobierno_convocatoria_envio
  before insert or update on public.gobierno_convocatoria_envios
  for each row execute function public.guard_gobierno_convocatoria_envio();
