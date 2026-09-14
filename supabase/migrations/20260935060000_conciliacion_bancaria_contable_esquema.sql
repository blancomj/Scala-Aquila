-- ═══════════════════════════════════════════════════════════════════════
--  Conciliación bancaria CONTABLE (banco↔libro) — Fase 3 (esquema) del plan
--  aprobado en `Docs/Conciliacion Bancaria/PROMPT_CONCILIACION_BANCARIA_CONTABLE.md`
--  §6/§7, con las decisiones D-CB-1..6 cerradas en D-113 (DECISIONES.md).
--
--  NO ES el motor de recaudo (banco↔residente, Entregable A, ya con UI desde
--  D-114) ni `contable_conciliacion_cartera` ni `fn_finanzas_conciliar_lote`
--  — glosario §2 del prompt, cuatro cosas distintas.
--
--  QUÉ RESUELVE. Por cuenta bancaria + período: compara el saldo del
--  extracto (TODAS las líneas, sin descartar nada) contra el saldo de la
--  cuenta contable de bancos (`contable_comprobante_detalle` vía
--  `cuentas_bancarias.contable_cuenta_id`, D-CB-1 — nunca la proyección
--  legacy `contable_movimientos()`). Lo que no cruza queda como una
--  `conciliacion_bancaria_partida` clasificada. Certificar es terminal
--  (D-CB-3) — un error se corrige con un ajuste en el período siguiente,
--  nunca reabriendo.
--
--  SOLO ESQUEMA EN ESTE CORTE. El motor de cruce (puro, sin Supabase) y las
--  Edge Functions que lo invocan (`generar-conciliacion-bancaria`,
--  `certificar-conciliacion-bancaria`) son las fases 4/5 del plan — nada de
--  eso vive aquí. Por eso ninguna de las dos tablas nuevas tiene política de
--  INSERT/UPDATE para `authenticated`: el cálculo y la certificación pasan
--  por Edge Function con `service_role` cuando existan, mismo criterio que
--  `extracto_bancario`/`extracto_linea` (20260904170000).
-- ═══════════════════════════════════════════════════════════════════════

-- ── 1. D-CB-2: extracto_bancario.cuenta_bancaria_id pasa a obligatorio ───
-- Un extracto sin cuenta bancaria conocida no es conciliable contablemente
-- por definición — mejor forzarlo en el punto de importación que
-- descubrirlo tarde. NO es `alter column ... set not null`: en prod hay 190
-- filas heredadas (20 tenants, ninguno con cuentas_bancarias configurada —
-- extractos de antes de que ese catálogo existiera) sin cuenta bancaria
-- conocida, y no hay forma de derivarla sin inventar un dato que no existe.
-- Un `check ... not valid` exige la columna en todo INSERT/UPDATE nuevo
-- (mismo efecto práctico que SET NOT NULL hacia adelante) sin tocar ni
-- validar las filas históricas. La Edge Function importar-extracto-bancario
-- ya exige el parámetro en el mismo corte (fuera de este archivo SQL) —
-- este CHECK es la segunda línea de defensa, a nivel de base de datos.
alter table public.extracto_bancario
  add constraint extracto_bancario_cuenta_bancaria_id_check
  check (cuenta_bancaria_id is not null) not valid;

comment on column public.extracto_bancario.cuenta_bancaria_id is
  'Obligatoria desde D-CB-2/Fase 3 de conciliación bancaria contable para todo extracto nuevo — '
  'sin ella no es conciliable contra ninguna cuenta contable de bancos. Enforced con CHECK ... NOT '
  'VALID, no SET NOT NULL: 190 filas heredadas en 20 tenants (sin cuentas_bancarias configurada) '
  'quedan nulas a propósito, no se fuerza un backfill inventado. Los tres motores que leen '
  'extracto_linea (recaudo, FIN-3 fn_finanzas_conciliar_lote, esta conciliación) confían en que '
  'toda fila nueva la trae.';

-- ── 2. Catálogo: tipo de partida no cruzada (D-CB-3, D-24: lista_tipos) ──
-- Vocabulario descriptivo sobre una partida, no un valor que gatille una
-- transición de estado real — a diferencia de `origen`/`estado` de abajo,
-- que sí son enum nativo porque deciden qué columna exige el guard.
insert into public.tipos (codigo, nombre, descripcion) values (
  'TIPO_PARTIDA_CONCILIACION',
  'Tipo de partida de conciliación bancaria',
  'Clasificación de una línea que no cruzó al comparar el extracto bancario contra los libros '
  'contables (conciliación bancaria CONTABLE, D-CB-3) — descriptivo, no gatilla ninguna '
  'transición por sí solo (a diferencia de conciliacion_bancaria_partida.origen).'
);

insert into public.lista_tipos (tipo, codigo, nombre, orden) values
  ('TIPO_PARTIDA_CONCILIACION', 'deposito_transito', 'Depósito en tránsito', 1),
  ('TIPO_PARTIDA_CONCILIACION', 'nota_debito_banco', 'Nota débito del banco sin registrar', 2),
  ('TIPO_PARTIDA_CONCILIACION', 'nota_credito_banco', 'Nota crédito del banco sin registrar', 3),
  ('TIPO_PARTIDA_CONCILIACION', 'cheque_pendiente', 'Cheque o pago girado aún no cobrado', 4),
  ('TIPO_PARTIDA_CONCILIACION', 'partida_salida_pendiente', 'Salida en libros aún no reflejada en banco', 5),
  ('TIPO_PARTIDA_CONCILIACION', 'otro', 'Otra partida no cruzada', 6);

-- ── 3. Estado de la cabecera — enum nativo: gatilla terminalidad ─────────
create type public.conciliacion_bancaria_estado_t as enum ('borrador', 'certificada');

comment on type public.conciliacion_bancaria_estado_t is
  'D-24: enum nativo porque el valor decide una transición real — certificada es terminal '
  '(D-CB-3, guard_conciliacion_bancaria_transicion), nunca se reabre. Un error se corrige con un '
  'ajuste en la conciliación del período siguiente, mismo criterio append-only del resto del repo.';

-- ── 4. Origen de una partida — enum nativo: decide qué FK exige ──────────
create type public.conciliacion_bancaria_partida_origen_t as enum ('banco', 'libro');

comment on type public.conciliacion_bancaria_partida_origen_t is
  'D-24: enum nativo porque decide, dentro de guard_conciliacion_bancaria_partida_coherencia, '
  'cuál de las dos FK de respaldo (extracto_linea_id / contable_comprobante_detalle_id) es '
  'obligatoria y cuál debe quedar nula.';

-- ── 5. Cabecera: una conciliación por cuenta bancaria y período ──────────
create table public.conciliacion_bancaria (
  id                    uuid primary key default gen_random_uuid(),
  tenant_id             uuid not null references public.tenants (id) on delete cascade,
  cuenta_bancaria_id    uuid not null references public.cuentas_bancarias (id),
  periodo_id            uuid not null references public.periodos (id),
  saldo_inicial_banco   numeric(18, 2) not null,
  saldo_final_banco     numeric(18, 2) not null,
  saldo_inicial_libros  numeric(18, 2) not null,
  saldo_final_libros    numeric(18, 2) not null,
  estado                public.conciliacion_bancaria_estado_t not null default 'borrador',
  preparado_por         uuid references public.profiles (id),
  preparado_at          timestamptz not null default now(),
  certificado_por       uuid references public.profiles (id),
  certificado_at        timestamptz,
  created_at            timestamptz not null default now(),

  constraint conciliacion_bancaria_una_por_cuenta_periodo unique (tenant_id, cuenta_bancaria_id, periodo_id),
  constraint conciliacion_bancaria_certificacion_coherente check (
    (estado = 'certificada' and certificado_por is not null and certificado_at is not null)
    or (estado = 'borrador' and certificado_por is null and certificado_at is null)
  )
);

alter table public.conciliacion_bancaria enable row level security;
alter table public.conciliacion_bancaria force row level security;

create index conciliacion_bancaria_tenant_idx on public.conciliacion_bancaria (tenant_id);

create policy conciliacion_bancaria_select_miembro on public.conciliacion_bancaria
  for select to authenticated using (public.is_member(tenant_id));

comment on table public.conciliacion_bancaria is
  'Conciliación bancaria CONTABLE (banco↔libro, D-98/D-113/D-114) — no confundir con la '
  'conciliación de recaudo (extracto_bancario/extracto_linea/conciliacion_propuesta) ni con '
  'fn_finanzas_conciliar_lote (glosario del prompt §2). Sin política de INSERT/UPDATE para '
  '`authenticated`: la calcula y la certifica una Edge Function con service_role (Fase 5, aún sin '
  'construir en este corte) — esta migración solo deja el esquema listo.';

comment on column public.conciliacion_bancaria.saldo_inicial_banco is
  'Saldo final de la conciliación anterior de esta cuenta (o 0 en la primera) + Σ extracto_linea.'
  'monto del período — TODAS las líneas, incluidas negativas, a diferencia del motor de recaudo.';
comment on column public.conciliacion_bancaria.saldo_inicial_libros is
  'Igual criterio que saldo_inicial_banco pero del lado contable: Σ (débito−crédito) de '
  'contable_comprobante_detalle donde cuenta_id = cuentas_bancarias.contable_cuenta_id y el '
  'comprobante está contabilizado (D-CB-1 — nunca contable_movimientos(), la proyección legacy).';

-- ── 6. Partidas no cruzadas ───────────────────────────────────────────────
create table public.conciliacion_bancaria_partida (
  id                              uuid primary key default gen_random_uuid(),
  tenant_id                       uuid not null references public.tenants (id) on delete cascade,
  conciliacion_id                 uuid not null references public.conciliacion_bancaria (id) on delete cascade,
  origen                          public.conciliacion_bancaria_partida_origen_t not null,
  tipo_id                         bigint not null references public.lista_tipos (id),
  extracto_linea_id               uuid references public.extracto_linea (id),
  contable_comprobante_detalle_id uuid references public.contable_comprobante_detalle (id),
  monto                           numeric(18, 2) not null check (monto > 0),
  descripcion                     text,
  resuelta                        boolean not null default false,
  resuelta_at                     timestamptz,
  created_at                      timestamptz not null default now()
);

alter table public.conciliacion_bancaria_partida enable row level security;
alter table public.conciliacion_bancaria_partida force row level security;

create index conciliacion_bancaria_partida_tenant_idx on public.conciliacion_bancaria_partida (tenant_id);
create index conciliacion_bancaria_partida_conciliacion_idx
  on public.conciliacion_bancaria_partida (conciliacion_id);

create policy conciliacion_bancaria_partida_select_miembro on public.conciliacion_bancaria_partida
  for select to authenticated using (public.is_member(tenant_id));

comment on table public.conciliacion_bancaria_partida is
  'Líneas que no cruzaron al comparar banco vs. libros (§6/§7 del prompt). resuelta permite '
  'aclarar una partida (p. ej. un cheque que por fin se cobra el mes siguiente) sin reabrir ni '
  'recalcular la conciliación ya certificada a la que pertenece — es la única columna que puede '
  'cambiar después de certificar.';
comment on column public.conciliacion_bancaria_partida.tipo_id is
  'lista_tipos, familia TIPO_PARTIDA_CONCILIACION — vocabulario descriptivo (D-24), no gatilla '
  'ninguna transición por sí solo (a diferencia de origen).';
comment on column public.conciliacion_bancaria_partida.extracto_linea_id is
  'Obligatoria cuando origen = banco (guard_conciliacion_bancaria_partida_coherencia); debe '
  'quedar nula cuando origen = libro.';
comment on column public.conciliacion_bancaria_partida.contable_comprobante_detalle_id is
  'Obligatoria cuando origen = libro; debe quedar nula cuando origen = banco.';

-- ── 7. guard: certificada es terminal, nunca se reabre (D-CB-3) ──────────
create function public.guard_conciliacion_bancaria_transicion()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.estado = 'certificada' then
    raise exception
      'CONCILIACION_BANCARIA_YA_CERTIFICADA: la conciliación % ya está certificada y es terminal '
      '— corrígela con un ajuste en la conciliación del período siguiente', old.id;
  end if;
  if new.estado = 'certificada' then
    new.certificado_at := coalesce(new.certificado_at, now());
  end if;
  return new;
end;
$$;

comment on function public.guard_conciliacion_bancaria_transicion() is
  'D-CB-3: una vez certificada, ninguna columna de la cabecera se vuelve a tocar — ni siquiera '
  'para "arreglar" un saldo. La corrección vive en la conciliación del período siguiente.';

create trigger guard_conciliacion_bancaria_transicion
  before update on public.conciliacion_bancaria
  for each row execute function public.guard_conciliacion_bancaria_transicion();

-- ── 8. guard: coherencia de una partida (origen ↔ FK, tenant, catálogo) ──
create function public.guard_conciliacion_bancaria_partida_coherencia()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_conciliacion public.conciliacion_bancaria;
begin
  select * into v_conciliacion from public.conciliacion_bancaria where id = new.conciliacion_id;
  if v_conciliacion.id is null then
    raise exception 'CONCILIACION_BANCARIA_INEXISTENTE: % no existe', new.conciliacion_id;
  end if;
  if v_conciliacion.tenant_id <> new.tenant_id then
    raise exception 'CONCILIACION_BANCARIA_TENANT_INCONSISTENTE: % pertenece a otro tenant',
      new.conciliacion_id;
  end if;

  if new.origen = 'banco' then
    if new.extracto_linea_id is null or new.contable_comprobante_detalle_id is not null then
      raise exception 'PARTIDA_ORIGEN_INCONSISTENTE: una partida de origen banco exige '
        'extracto_linea_id y NO contable_comprobante_detalle_id';
    end if;
    if not exists (
      select 1 from public.extracto_linea el
       where el.id = new.extracto_linea_id and el.tenant_id = new.tenant_id
    ) then
      raise exception 'EXTRACTO_LINEA_INVALIDA: % no pertenece al tenant %',
        new.extracto_linea_id, new.tenant_id;
    end if;
  else
    if new.contable_comprobante_detalle_id is null or new.extracto_linea_id is not null then
      raise exception 'PARTIDA_ORIGEN_INCONSISTENTE: una partida de origen libro exige '
        'contable_comprobante_detalle_id y NO extracto_linea_id';
    end if;
    if not exists (
      select 1 from public.contable_comprobante_detalle d
       where d.id = new.contable_comprobante_detalle_id and d.tenant_id = new.tenant_id
    ) then
      raise exception 'COMPROBANTE_DETALLE_INVALIDO: % no pertenece al tenant %',
        new.contable_comprobante_detalle_id, new.tenant_id;
    end if;
  end if;

  if not exists (
    select 1 from public.lista_tipos lt
     where lt.id = new.tipo_id and lt.tipo = 'TIPO_PARTIDA_CONCILIACION'
       and (lt.tenant_id is null or lt.tenant_id = new.tenant_id)
  ) then
    raise exception 'TIPO_PARTIDA_INVALIDO: % no es un TIPO_PARTIDA_CONCILIACION visible para el '
      'tenant %', new.tipo_id, new.tenant_id;
  end if;

  return new;
end;
$$;

comment on function public.guard_conciliacion_bancaria_partida_coherencia() is
  'Coherencia de una partida no cruzada: el respaldo (extracto_linea_id / '
  'contable_comprobante_detalle_id) lo decide origen, nunca los dos ni ninguno; tenant y catálogo '
  'verificados igual que el resto de guards de origen del repo (guard_fondo_movimiento, etc.).';

create trigger guard_conciliacion_bancaria_partida_coherencia
  before insert or update on public.conciliacion_bancaria_partida
  for each row execute function public.guard_conciliacion_bancaria_partida_coherencia();
