-- ═══════════════════════════════════════════════════════════════════════
--  VER-CAR-05 (parcial) · Registro de actos interruptivos de prescripción
--  Propietario: Docs/Motor de gestion de cartera/CAR_00_Guia_Oficial.md §3.5, bloque 13
--
--  VER-CAR-05 sigue ABIERTO: "término, cómputo y actos que la interrumpen"
--  del régimen civil aplicable a expensas comunes no está verificado con
--  concepto jurídico. Por la regla de §3.5 ("mientras un VER-CAR-* bloqueante
--  esté abierto, la funcionalidad que depende de él queda BLOCKED, no se
--  implementa con un valor por defecto inventado"), esta pieza NO construye
--  la alerta operativa de riesgo de prescripción — eso exige saber el
--  término y el cómputo, que es exactamente lo que está sin verificar.
--
--  Lo que SÍ se construye, y por qué no viola la regla: un registro
--  puramente FACTUAL de eventos (quién dice que ocurrió qué, cuándo, con
--  qué evidencia) — el sistema no afirma "esto interrumpió la prescripción"
--  ni calcula ningún plazo. Es la misma distinción que ya usa el propio
--  documento en otras piezas: caso_juridico_actuaciones (20260822340000)
--  registra actuaciones procesales sin arbitrar su efecto jurídico. Cuando
--  VER-CAR-05 se cierre, este historial ya existe para que el abogado (o
--  una pieza posterior con la fórmula correcta) lo use — no hay que
--  reconstruir retroactivamente qué pasó.
--
--  tipo_acto_id usa lista_tipos (catálogo abierto), NO un enum cerrado —
--  mismo criterio que TIPO_ACTUACION_JURIDICA en 20260822340000: es
--  vocabulario descriptivo de qué se registró ("se hizo un pago", "el
--  deudor reconoció la deuda por escrito"), no una determinación de que
--  ese hecho legalmente interrumpe el término — eso es precisamente lo que
--  VER-CAR-05 no ha verificado. Los 5 códigos sembrados son los actos que
--  la doctrina civil general reconoce casi universalmente como candidatos
--  a interrupción (pago, reconocimiento, demanda) más dos categorías
--  abiertas — ninguno afirma efecto, todos son descripción de un hecho.
--
--  A nivel de inmueble, no de caso jurídico: la prescripción corre sobre
--  la obligación (la deuda), que existe antes de que haya caso jurídico —
--  atarlo a casos_juridicos.id habría dejado sin registro cualquier acto
--  ocurrido en fase preventiva/administrativa/prejurídica.
-- ═══════════════════════════════════════════════════════════════════════

insert into public.tipos (codigo, nombre) values
  ('TIPO_ACTO_INTERRUPTIVO_PRESCRIPCION', 'Tipo de Acto Interruptivo de Prescripción');
insert into public.lista_tipos (tipo, codigo, nombre, orden) values
  ('TIPO_ACTO_INTERRUPTIVO_PRESCRIPCION', 'pago_realizado', 'Pago realizado', 1),
  ('TIPO_ACTO_INTERRUPTIVO_PRESCRIPCION', 'reconocimiento_escrito', 'Reconocimiento escrito de la deuda', 2),
  ('TIPO_ACTO_INTERRUPTIVO_PRESCRIPCION', 'demanda_presentada', 'Demanda presentada', 3),
  ('TIPO_ACTO_INTERRUPTIVO_PRESCRIPCION', 'actuacion_judicial', 'Actuación judicial dentro de un proceso', 4),
  ('TIPO_ACTO_INTERRUPTIVO_PRESCRIPCION', 'otro', 'Otro (describir)', 5);

create table public.prescripcion_actos_interruptivos (
  id               uuid primary key default gen_random_uuid(),
  tenant_id        uuid not null references public.tenants (id) on delete cascade,
  inmueble_id      uuid not null references public.inmuebles (id),
  tipo_acto_id     bigint not null references public.lista_tipos (id),
  fecha_ocurrencia date not null,
  descripcion      text not null check (char_length(btrim(descripcion)) > 0),

  -- Evidencia opcional — enlaza lo ya existente, no lo duplica (REC-CAR-004).
  pago_id          uuid references public.pagos (id),
  caso_id          uuid references public.casos_juridicos (id),
  documento_id     uuid references public.documentos (id),

  registrado_por   uuid not null references public.profiles (id),
  created_at       timestamptz not null default now()
);

alter table public.prescripcion_actos_interruptivos enable row level security;
alter table public.prescripcion_actos_interruptivos force row level security;

create index prescripcion_actos_tenant_idx on public.prescripcion_actos_interruptivos (tenant_id);
create index prescripcion_actos_inmueble_idx on public.prescripcion_actos_interruptivos (tenant_id, inmueble_id, fecha_ocurrencia desc);

comment on table public.prescripcion_actos_interruptivos is
  'VER-CAR-05 (parcial, bloque 13) — bitácora append-only de hechos que PODRÍAN interrumpir la '
  'prescripción de la obligación de un inmueble. NO calcula plazos ni alerta: el término y el '
  'cómputo siguen sin verificar (VER-CAR-05 abierto). Solo registra qué se dice que pasó, cuándo '
  'y con qué evidencia — mismo criterio que caso_juridico_actuaciones. La alerta operativa queda '
  'BLOCKED hasta que se cierre VER-CAR-05 (regla de §3.5).';

create function public.guard_prescripcion_acto_insert()
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
    raise exception 'UNAUTHENTICATED: se requiere sesión para registrar un acto interruptivo';
  end if;
  if not public.has_role(new.tenant_id, array['auxiliar']::public.tenant_role_t[]) then
    raise exception 'FORBIDDEN: se requiere rol auxiliar en esta copropiedad';
  end if;

  select tenant_id into v_tenant_inmueble from public.inmuebles where id = new.inmueble_id;
  if v_tenant_inmueble is distinct from new.tenant_id then
    raise exception 'INMUEBLE_INVALIDO: % no pertenece al tenant %', new.inmueble_id, new.tenant_id;
  end if;

  select tipo into v_tipo from public.lista_tipos where id = new.tipo_acto_id;
  if v_tipo is distinct from 'TIPO_ACTO_INTERRUPTIVO_PRESCRIPCION' then
    raise exception 'TIPO_ACTO_INVALIDO: tipo_acto_id % no pertenece a TIPO_ACTO_INTERRUPTIVO_PRESCRIPCION (es %)',
      new.tipo_acto_id, coalesce(v_tipo, 'inexistente');
  end if;

  if new.pago_id is not null and not exists (
    select 1 from public.pagos where id = new.pago_id and tenant_id = new.tenant_id
  ) then
    raise exception 'PAGO_INVALIDO: % no pertenece al tenant %', new.pago_id, new.tenant_id;
  end if;
  if new.caso_id is not null and not exists (
    select 1 from public.casos_juridicos where id = new.caso_id and tenant_id = new.tenant_id
  ) then
    raise exception 'CASO_JURIDICO_INVALIDO: % no pertenece al tenant %', new.caso_id, new.tenant_id;
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

create trigger guard_prescripcion_acto_insert
  before insert on public.prescripcion_actos_interruptivos
  for each row execute function public.guard_prescripcion_acto_insert();

create trigger prescripcion_actos_append_only
  before update or delete on public.prescripcion_actos_interruptivos
  for each row execute function public.forbid_mutation_salvo_tenant_borrado();

create policy prescripcion_actos_select_miembro
  on public.prescripcion_actos_interruptivos for select
  to authenticated
  using (public.is_member(tenant_id));

create policy prescripcion_actos_insert_auxiliar
  on public.prescripcion_actos_interruptivos for insert
  to authenticated
  with check (public.has_role(tenant_id, array['auxiliar']::public.tenant_role_t[]));
