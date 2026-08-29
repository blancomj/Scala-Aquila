-- ═══════════════════════════════════════════════════════════════════════
--  CJ-8 (PROMPT-CAR-JUR-001 §15) · Registro de transferencia de propiedad
--  Propietario: Docs/Motor de gestion de cartera/VALUACION CAR_10_cONSULTA
--  JURIDICA_DE _MOTOR_CARTERA_GOBIERNO_JURIDICO.md §15, auditoría 2026-08-29.
--
--  Reconciliación primero (§5 del documento): el modelo de copropietarios
--  múltiples y su historial YA EXISTE — inmueble_persona_rol (20260820100000)
--  admite varios copropietarios vigentes simultáneos, con vigente_desde/
--  vigente_hasta, y "terminar" una relación ya es poner vigente_hasta, nunca
--  DELETE. Esta migración NO duplica esa pieza. Lo que falta, y es lo único
--  que se construye aquí, es la capa evidencial que el documento pide en
--  §15.2: POR QUÉ cambió el titular (tipo_transferencia), con qué soporte
--  (documento_id) y cuál era la deuda conocida a esa fecha — nada de esto
--  se deriva de inmueble_persona_rol, que solo sabe QUIÉN y CUÁNDO.
--
--  §15.1 — "no implementes: nuevo propietario = deuda automáticamente
--  trasladada, sin registrar el contexto": esta tabla es puramente un
--  registro factual, igual que prescripcion_actos_interruptivos
--  (20260907140000). No toca cargos, no reasigna deuda, no dispara ningún
--  cálculo — deja evidencia de que un cambio de titular ocurrió y cómo.
--
--  §15.3 — tipo_transferencia_id usa lista_tipos (catálogo abierto), no un
--  enum cerrado (D-24): hoy ningún camino de código aplica un efecto
--  distinto según el tipo (remate judicial vs compraventa vs sucesión) —
--  eso exigiría una regla jurídica cerrada que no existe. Se registra el
--  tipo como vocabulario descriptivo, sin inventar el efecto diferenciado
--  que §15.3 exige *cuando* la fuente jurídica lo determine.
--
--  §15.4 — solidaridad: verificado (auditoría 2026-08-29) que
--  packages/liquidation-engine no usa inmueble_persona_rol.porcentaje para
--  dividir cargos ni deuda — los cargos cuelgan de inmueble_id como un
--  todo, y cartera-destinatarios.ts ya notifica a TODOS los copropietarios
--  vigentes por separado (R1/R2, 20260905110000) precisamente porque cada
--  uno responde por el total (art. 29 L675). La solidaridad de pago ya es
--  estructuralmente correcta por construcción — no requiere cambio de
--  schema; esta migración no la toca.
--
--  deuda_a_la_fecha es una fotografía declarada por quien registra el
--  evento (igual que tasas_referencia.valor_mensual, 20260822220000) — no
--  se deriva de v_cargo_saldo ni de ningún cálculo, evita atar esta tabla a
--  un snapshot que cambiaría de significado si se reconsulta después.
--  Puramente informativa: nada del motor la lee.
-- ═══════════════════════════════════════════════════════════════════════

insert into public.tipos (codigo, nombre) values
  ('TIPO_TRANSFERENCIA_PROPIEDAD', 'Tipo de Transferencia de Propiedad');
insert into public.lista_tipos (tipo, codigo, nombre, orden) values
  ('TIPO_TRANSFERENCIA_PROPIEDAD', 'compraventa', 'Compraventa', 1),
  ('TIPO_TRANSFERENCIA_PROPIEDAD', 'remate_judicial', 'Remate judicial', 2),
  ('TIPO_TRANSFERENCIA_PROPIEDAD', 'donacion', 'Donación', 3),
  ('TIPO_TRANSFERENCIA_PROPIEDAD', 'sucesion', 'Sucesión', 4),
  ('TIPO_TRANSFERENCIA_PROPIEDAD', 'adjudicacion', 'Adjudicación', 5),
  ('TIPO_TRANSFERENCIA_PROPIEDAD', 'otro', 'Otro (describir)', 6);

create table public.inmueble_transferencias (
  id                       uuid primary key default gen_random_uuid(),
  tenant_id                uuid not null references public.tenants (id) on delete cascade,
  inmueble_id              uuid not null references public.inmuebles (id),
  tipo_transferencia_id    bigint not null references public.lista_tipos (id),
  fecha_transferencia      date not null,
  descripcion              text not null check (char_length(btrim(descripcion)) > 0),

  -- Nullable: el primer registro de titularidad de un inmueble no tiene
  -- antecesor que transfiera nada.
  propietario_anterior_id  uuid references public.terceros (id),
  propietario_nuevo_id     uuid not null references public.terceros (id),

  -- Evidencia opcional — enlaza lo ya existente, no lo duplica (REC-CAR-004).
  documento_id             uuid references public.documentos (id),
  -- Declarada por quien registra, no derivada (ver cabecera).
  deuda_a_la_fecha         numeric(18, 2),

  registrado_por           uuid not null references public.profiles (id),
  created_at               timestamptz not null default now(),

  constraint inmueble_transferencias_deuda_no_negativa check (deuda_a_la_fecha is null or deuda_a_la_fecha >= 0)
);

alter table public.inmueble_transferencias enable row level security;
alter table public.inmueble_transferencias force row level security;

create index inmueble_transferencias_tenant_idx on public.inmueble_transferencias (tenant_id);
create index inmueble_transferencias_inmueble_idx
  on public.inmueble_transferencias (tenant_id, inmueble_id, fecha_transferencia desc);

comment on table public.inmueble_transferencias is
  'CJ-8 (bloque nuevo, PROMPT-CAR-JUR-001 §15) — bitácora append-only de POR QUÉ cambió el '
  'titular de un inmueble (tipo, evidencia, deuda conocida a la fecha). No reasigna deuda ni '
  'dispara cálculo alguno — el QUIÉN y CUÁNDO ya los resuelve inmueble_persona_rol '
  '(20260820100000), que esta tabla complementa sin duplicar.';

create function public.guard_inmueble_transferencia_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_tipo text;
  v_tenant_inmueble uuid;
begin
  if (select auth.uid()) is null then
    raise exception 'UNAUTHENTICATED: se requiere sesión para registrar una transferencia de propiedad';
  end if;
  if not public.has_role(new.tenant_id, array['auxiliar']::public.tenant_role_t[]) then
    raise exception 'FORBIDDEN: se requiere rol auxiliar en esta copropiedad';
  end if;

  select tenant_id into v_tenant_inmueble from public.inmuebles where id = new.inmueble_id;
  if v_tenant_inmueble is distinct from new.tenant_id then
    raise exception 'INMUEBLE_INVALIDO: % no pertenece al tenant %', new.inmueble_id, new.tenant_id;
  end if;

  select tipo into v_tipo from public.lista_tipos where id = new.tipo_transferencia_id;
  if v_tipo is distinct from 'TIPO_TRANSFERENCIA_PROPIEDAD' then
    raise exception 'TIPO_TRANSFERENCIA_INVALIDO: tipo_transferencia_id % no pertenece a TIPO_TRANSFERENCIA_PROPIEDAD (es %)',
      new.tipo_transferencia_id, coalesce(v_tipo, 'inexistente');
  end if;

  if new.propietario_anterior_id is not null and not exists (
    select 1 from public.terceros where id = new.propietario_anterior_id and tenant_id = new.tenant_id
  ) then
    raise exception 'PROPIETARIO_ANTERIOR_INVALIDO: % no pertenece al tenant %', new.propietario_anterior_id, new.tenant_id;
  end if;
  if not exists (
    select 1 from public.terceros where id = new.propietario_nuevo_id and tenant_id = new.tenant_id
  ) then
    raise exception 'PROPIETARIO_NUEVO_INVALIDO: % no pertenece al tenant %', new.propietario_nuevo_id, new.tenant_id;
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

create trigger guard_inmueble_transferencia_insert
  before insert on public.inmueble_transferencias
  for each row execute function public.guard_inmueble_transferencia_insert();

create trigger inmueble_transferencias_append_only
  before update or delete on public.inmueble_transferencias
  for each row execute function public.forbid_mutation_salvo_tenant_borrado();

create policy inmueble_transferencias_select_miembro
  on public.inmueble_transferencias for select
  to authenticated
  using (public.is_member(tenant_id));

create policy inmueble_transferencias_insert_auxiliar
  on public.inmueble_transferencias for insert
  to authenticated
  with check (public.has_role(tenant_id, array['auxiliar']::public.tenant_role_t[]));
