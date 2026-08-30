-- ═══════════════════════════════════════════════════════════════════════
--  CJ-9 (Docs/Motor de gestion de cartera/CAR_10_Consulta_Juridica.md,
--  pregunta 4 "Registro exigible") · Procedencia del dato de contacto
--
--  CJ-9 sigue SIN ASIGNAR (⧗ Abierto en CAR_10 §tabla de seguimiento): no
--  hay respuesta del abogado sobre si el uso de email/teléfono para
--  cobranza requiere autorización específica bajo la Ley 1581 de 2012, ni
--  sobre qué constituye base jurídica suficiente. Esta migración NO decide
--  esa pregunta ni impone una regla de licitud — sería inventar una
--  política no cerrada (PLAN §9.2). Registra el HECHO: de dónde salió el
--  dato, cuándo y quién lo declaró. Mismo criterio evidencial que
--  inmueble_transferencias (20260908100000) y
--  prescripcion_actos_interruptivos (20260907140000): bitácora
--  append-only, puramente factual, que ningún cálculo del motor lee ni
--  ningún guard exige para despachar por SMS/email — resolverDestinatarios()
--  no la consulta.
--
--  `valor` congela el dato en el momento del registro (igual que
--  inmueble_transferencias.deuda_a_la_fecha) — terceros.email/telefono
--  pueden cambiar después sin reescribir la historia de procedencia.
--
--  `campo` es CHECK, no lista_tipos: nombra una columna real de terceros
--  (email | telefono), no vocabulario de negocio que varíe por tenant — no
--  aplica D-24. `origen_id` sí es lista_tipos (ORIGEN_CONTACTO_TERCERO): es
--  vocabulario descriptivo abierto (portería, asamblea, actualización
--  directa...) y ningún camino de código aplica hoy un efecto distinto
--  según el origen — exactamente el mismo razonamiento que
--  TIPO_TRANSFERENCIA_PROPIEDAD y TIPO_ACTO_INTERRUPTIVO_PRESCRIPCION.
-- ═══════════════════════════════════════════════════════════════════════

insert into public.tipos (codigo, nombre) values
  ('ORIGEN_CONTACTO_TERCERO', 'Origen del Dato de Contacto');
insert into public.lista_tipos (tipo, codigo, nombre, orden) values
  ('ORIGEN_CONTACTO_TERCERO', 'porteria_administracion', 'Portería o administración', 1),
  ('ORIGEN_CONTACTO_TERCERO', 'asamblea_convocatoria', 'Asamblea o convocatoria', 2),
  ('ORIGEN_CONTACTO_TERCERO', 'actualizacion_directa', 'Actualización directa por el tercero', 3),
  ('ORIGEN_CONTACTO_TERCERO', 'importacion_inicial', 'Importación inicial (migración de datos)', 4),
  ('ORIGEN_CONTACTO_TERCERO', 'documento_contractual', 'Documento o contrato', 5),
  ('ORIGEN_CONTACTO_TERCERO', 'otro', 'Otro (describir)', 6);

create table public.terceros_contacto_procedencia (
  id              uuid primary key default gen_random_uuid(),
  tenant_id       uuid not null references public.tenants (id) on delete cascade,
  tercero_id      uuid not null references public.terceros (id),
  campo           text not null check (campo in ('email', 'telefono')),
  valor           text not null check (char_length(btrim(valor)) > 0),
  origen_id       bigint not null references public.lista_tipos (id),
  descripcion     text,

  -- Evidencia opcional — enlaza lo ya existente, no lo duplica (REC-CAR-004).
  documento_id    uuid references public.documentos (id),

  registrado_por  uuid not null references public.profiles (id),
  created_at      timestamptz not null default now()
);

alter table public.terceros_contacto_procedencia enable row level security;
alter table public.terceros_contacto_procedencia force row level security;

create index terceros_contacto_procedencia_tenant_idx on public.terceros_contacto_procedencia (tenant_id);
create index terceros_contacto_procedencia_tercero_idx
  on public.terceros_contacto_procedencia (tenant_id, tercero_id, created_at desc);

comment on table public.terceros_contacto_procedencia is
  'CJ-9 (CAR_10 pregunta 4, sin asignar) — bitácora append-only de dónde salió cada dato de '
  'contacto (email/teléfono) de un tercero: origen declarado, fecha y quién lo registró. No '
  'decide licitud de uso ni condiciona ningún envío — resolverDestinatarios() no la consulta. '
  'Es evidencia para cuando CJ-9 se resuelva, no una política ya aplicada. valor congela el '
  'dato en el momento del registro, igual que inmueble_transferencias.deuda_a_la_fecha.';

comment on column public.terceros_contacto_procedencia.campo is
  'email | telefono — nombra una columna real de terceros, no vocabulario de negocio (por '
  'eso CHECK y no lista_tipos, a diferencia de origen_id).';

comment on column public.terceros_contacto_procedencia.valor is
  'El dato exacto capturado en ese momento — no se deriva de terceros.email/telefono, que '
  'puede cambiar después sin reescribir esta fila.';

comment on column public.terceros_contacto_procedencia.origen_id is
  'ORIGEN_CONTACTO_TERCERO (lista_tipos) — vocabulario descriptivo abierto. Ningún camino de '
  'código aplica hoy un efecto distinto según el origen (D-24): registra el hecho, no decide '
  'CJ-9.';

comment on column public.terceros_contacto_procedencia.documento_id is
  'Evidencia opcional (ej. formulario firmado, autorización) — enlaza documentos existentes, '
  'no los duplica (REC-CAR-004).';

create function public.guard_contacto_procedencia_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_tipo text;
  v_tenant_tercero uuid;
begin
  if (select auth.uid()) is null then
    raise exception 'UNAUTHENTICATED: se requiere sesión para registrar procedencia de contacto';
  end if;
  if not public.has_role(new.tenant_id, array['auxiliar']::public.tenant_role_t[]) then
    raise exception 'FORBIDDEN: se requiere rol auxiliar en esta copropiedad';
  end if;

  select tenant_id into v_tenant_tercero from public.terceros where id = new.tercero_id;
  if v_tenant_tercero is distinct from new.tenant_id then
    raise exception 'TERCERO_INVALIDO: % no pertenece al tenant %', new.tercero_id, new.tenant_id;
  end if;

  select tipo into v_tipo from public.lista_tipos where id = new.origen_id;
  if v_tipo is distinct from 'ORIGEN_CONTACTO_TERCERO' then
    raise exception 'ORIGEN_INVALIDO: origen_id % no pertenece a ORIGEN_CONTACTO_TERCERO (es %)',
      new.origen_id, coalesce(v_tipo, 'inexistente');
  end if;

  if new.documento_id is not null and not exists (
    select 1 from public.documentos where id = new.documento_id and tenant_id = new.tenant_id
  ) then
    raise exception 'DOCUMENTO_INVALIDO: % no pertenece al tenant %', new.documento_id, new.tenant_id;
  end if;

  new.registrado_por := (select auth.uid());
  return new;
end;
$$;

create trigger guard_contacto_procedencia_insert
  before insert on public.terceros_contacto_procedencia
  for each row execute function public.guard_contacto_procedencia_insert();

create trigger terceros_contacto_procedencia_append_only
  before update or delete on public.terceros_contacto_procedencia
  for each row execute function public.forbid_mutation_salvo_tenant_borrado();

create policy terceros_contacto_procedencia_select_miembro
  on public.terceros_contacto_procedencia for select
  to authenticated
  using (public.is_member(tenant_id));

create policy terceros_contacto_procedencia_insert_auxiliar
  on public.terceros_contacto_procedencia for insert
  to authenticated
  with check (public.has_role(tenant_id, array['auxiliar']::public.tenant_role_t[]));
