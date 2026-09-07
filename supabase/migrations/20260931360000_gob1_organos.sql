-- ═══════════════════════════════════════════════════════════════════════
--  GOB-1 · gobierno_organos
--  Ver GOB_01_organos_gobierno.md §4.1, pruebas 1
--
--  Prefijo `gobierno_` (marco §5.1): específico del dominio de gobierno, sin
--  precedente reutilizable (primera tabla de la serie GOB con datos propios
--  — GOB-0 no creó ninguna).
-- ═══════════════════════════════════════════════════════════════════════

create table public.gobierno_organos (
  id                     uuid primary key default gen_random_uuid(),
  tenant_id              uuid not null references public.tenants (id) on delete cascade,
  tipo_id                bigint not null references public.lista_tipos (id),
  nombre                 text,
  vigente_desde          date not null,
  vigente_hasta          date,
  reglamento_referencia  text,
  documento_id           uuid references public.documentos (id),
  created_at             timestamptz not null default now(),
  updated_at             timestamptz,

  constraint gobierno_organos_fechas_validas check (vigente_hasta is null or vigente_hasta >= vigente_desde)
);

alter table public.gobierno_organos enable row level security;
alter table public.gobierno_organos force row level security;

create index gobierno_organos_tenant_idx on public.gobierno_organos (tenant_id);
create index gobierno_organos_tipo_idx on public.gobierno_organos (tipo_id);
create index gobierno_organos_documento_idx on public.gobierno_organos (documento_id) where documento_id is not null;

comment on table public.gobierno_organos is
  'Órganos de dirección/administración/control de la copropiedad (asamblea, consejo, comité de '
  'convivencia, comités ad hoc, administración, revisoría fiscal) — familia ORGANO_GOBIERNO. '
  'vigente_hasta IS NULL = vigente. reglamento_referencia: artículo del reglamento que lo crea, '
  'si aplica. documento_id: el acta que lo constituyó (nullable — no todo órgano nace de un '
  'acta ya capturada en el sistema).';

comment on column public.gobierno_organos.nombre is
  'Obligatorio para comités ad hoc (codigo=comite, guard_gobierno_organo). Opcional para los '
  'demás — su tipo ya los identifica.';

create policy gobierno_organos_select_miembro
  on public.gobierno_organos for select
  to authenticated
  using (public.is_member(tenant_id));

create policy gobierno_organos_insert_auxiliar
  on public.gobierno_organos for insert
  to authenticated
  with check (public.has_role(tenant_id, array['auxiliar']::public.tenant_role_t[]));

create policy gobierno_organos_update_auxiliar
  on public.gobierno_organos for update
  to authenticated
  using (public.has_role(tenant_id, array['auxiliar']::public.tenant_role_t[]))
  with check (public.has_role(tenant_id, array['auxiliar']::public.tenant_role_t[]));

-- ── guard: unicidad de vigencia por familia + comité ad hoc exige nombre ──
-- "Exactamente una asamblea" y "como máximo un consejo/comité de convivencia/revisoría fiscal"
-- (§4.1): un `unique index` parcial no puede consultar lista_tipos.codigo en su predicado
-- (no admite subconsultas) — se valida en el guard. `administracion` y `comite` (ad hoc)
-- quedan deliberadamente FUERA de esta restricción: el spec solo pide unicidad para los cuatro
-- códigos citados; "administracion" no se menciona en ninguno de los dos grupos (ni "máximo
-- uno" ni "varios permitidos") y forzar una regla no pedida sería inventar (marco §1.3).
create function public.guard_gobierno_organo()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_codigo text;
begin
  select codigo into v_codigo from public.lista_tipos where id = new.tipo_id and tipo = 'ORGANO_GOBIERNO';
  if v_codigo is null then
    raise exception 'ORGANO_TIPO_INVALIDO: tipo_id % no pertenece a ORGANO_GOBIERNO', new.tipo_id;
  end if;

  if v_codigo = 'comite' and coalesce(btrim(new.nombre), '') = '' then
    raise exception 'ORGANO_COMITE_SIN_NOMBRE: un comité ad hoc exige nombre';
  end if;

  if v_codigo in ('asamblea_general', 'consejo_administracion', 'comite_convivencia', 'revisoria_fiscal')
     and new.vigente_hasta is null
     and exists (
       select 1 from public.gobierno_organos go
       join public.lista_tipos lt on lt.id = go.tipo_id
       where go.tenant_id = new.tenant_id
         and lt.codigo = v_codigo
         and go.vigente_hasta is null
         and go.id is distinct from new.id
     )
  then
    raise exception 'ORGANO_DUPLICADO_VIGENTE: ya existe un % vigente para este tenant', v_codigo;
  end if;

  return new;
end;
$$;

comment on function public.guard_gobierno_organo() is
  'GOB-1: ORGANO_TIPO_INVALIDO (tipo_id fuera de familia), ORGANO_COMITE_SIN_NOMBRE (comité ad '
  'hoc sin nombre), ORGANO_DUPLICADO_VIGENTE (segundo asamblea_general/consejo_administracion/'
  'comite_convivencia/revisoria_fiscal vigente a la vez). "administracion" y "comite" no se '
  'restringen — el corte no lo pide para ellos.';

create trigger guard_gobierno_organo
  before insert or update on public.gobierno_organos
  for each row execute function public.guard_gobierno_organo();

create trigger set_updated_at before update on public.gobierno_organos
  for each row execute function public.set_updated_at();
