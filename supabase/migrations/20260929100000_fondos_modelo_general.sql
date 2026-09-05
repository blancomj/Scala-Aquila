-- ═══════════════════════════════════════════════════════════════════════
--  Dominio Fondos — BLOQUE B/C: modelo general del fondo + tipos.
--  Propietario: PLAN_MAESTRO_IMPLEMENTACION.md §4.3 (GAP-22), D-36, D-37.
--  Diagnóstico de partida: ANALISIS_FONDOS_BLOQUE_A.md.
--
--  QUÉ REABRE Y POR QUÉ. GAP-15 cerró `fondos` como un contenedor con saldo
--  derivado: `tipo enum(imprevistos, otro)`, `nombre`, `saldo_actual`. Eso
--  bastaba para lo que F2 necesitaba, pero no representa un recurso con
--  destinación específica: no tiene estado, ni finalidad, ni vigencia, ni
--  autorización. GAP-22 lo supera SIN reemplazar las tablas — se evoluciona
--  la fila que ya existe (Modelo Maestro §55/§56: no crear un segundo fondo
--  de imprevistos, conservar identificadores y trazabilidad).
--
--  LA DISTINCIÓN CENTRAL, y por qué son dos columnas y no una:
--
--    naturaleza  enum(imprevistos, destinacion_especifica)  ← gatilla lógica
--    tipo_id     lista_tipos(TIPO_FONDO)                    ← vocabulario
--
--  Un fondo de destinación específica NUNCA hereda las reglas legales del
--  fondo de imprevistos (Modelo §2.1/§4.3, y art. 35 Ley 675 solo obliga al
--  de imprevistos). Si esto fuera un solo catálogo de texto, esa frontera
--  jurídica dependería de datos editables en vez de código.
--
--  NO SE CREA NINGÚN CHECK QUE DECIDA JURÍDICAMENTE (Modelo §8/§34): el
--  sistema registra la destinación y la decisión adoptada, no arbitra si un
--  gasto "es" imprevisto ni quién tenía competencia para autorizarlo.
--
--  Fuera de esta migración, en las siguientes del bloque:
--    • fondo_movimientos: tipos ampliados, origen, reversión, saldo derivado
--    • fondo_autorizaciones / fondo_fuentes
--    • fondo_compromisos / fondo_solicitudes_uso / fn_fondo_saldos
-- ═══════════════════════════════════════════════════════════════════════

-- ── 1. Catálogo TIPO_FONDO (D-24: vocabulario descriptivo, no enum) ─────
insert into public.tipos (codigo, nombre, descripcion) values (
  'TIPO_FONDO',
  'Tipo de Fondo',
  'Finalidad declarada de un fondo. Es vocabulario descriptivo y parametrizable por '
  'copropiedad — la frontera jurídica entre el fondo de imprevistos y los demás la marca '
  'fondos.naturaleza, no este catálogo (PLAN §4.3, GAP-22).'
);

insert into public.lista_tipos (tipo, codigo, nombre, descripcion, orden) values
  ('TIPO_FONDO', 'imprevistos', 'Imprevistos',
   'Fondo del art. 35 de la Ley 675 de 2001. Único con reglas legales propias.', 1),
  ('TIPO_FONDO', 'proyecto', 'Proyecto',
   'Recursos destinados a un proyecto concreto con meta y vigencia.', 2),
  ('TIPO_FONDO', 'obra', 'Obra',
   'Recursos destinados a una obra sobre bienes comunes.', 3),
  ('TIPO_FONDO', 'mantenimiento', 'Mantenimiento',
   'Mantenimiento mayor o preventivo programado de bienes comunes.', 4),
  ('TIPO_FONDO', 'renovacion', 'Renovación',
   'Reposición o modernización de equipos o instalaciones comunes.', 5),
  ('TIPO_FONDO', 'especial', 'Especial',
   'Cualquier otra destinación específica decidida por el órgano competente.', 6);

-- ── 2. naturaleza: el enum de GAP-15, renombrado a lo que siempre fue ───
-- No es una columna nueva: es la misma de F2 con el nombre correcto. Se
-- renombra el valor 'otro' porque "otro" no dice nada, y el punto entero de
-- esta columna es marcar QUÉ régimen legal aplica.
alter type public.fondo_tipo_t rename value 'otro' to 'destinacion_especifica';
alter type public.fondo_tipo_t rename to fondo_naturaleza_t;

alter table public.fondos rename column tipo to naturaleza;
alter index public.fondos_imprevistos_unico rename to fondos_naturaleza_imprevistos_unico;

comment on type public.fondo_naturaleza_t is
  'Régimen legal del fondo. Enum nativo y no lista_tipos (D-24) porque el valor gatilla lógica '
  'real y no es parametrizable por la copropiedad: imprevistos es único por tenant '
  '(fondos_naturaleza_imprevistos_unico), lo obliga el art. 35 de la Ley 675 de 2001 con un '
  'mínimo referido al presupuesto anual, su cobro puede suspenderse al alcanzar el 50 % del '
  'presupuesto ordinario, la autorización de erogaciones con cargo a él es competencia de la '
  'Asamblea (art. 38.11) y la Ley 2079 de 2021 lo hace potestativo en VIS/VIP de cinco o menos '
  'unidades. Nada de eso aplica a destinacion_especifica, que se rige por la decisión del '
  'órgano competente y el reglamento. La finalidad concreta —proyecto, obra, mantenimiento— es '
  'vocabulario y vive en lista_tipos, familia TIPO_FONDO.';

comment on column public.fondos.naturaleza is
  'Régimen legal aplicable. Un fondo de destinación específica NUNCA hereda automáticamente las '
  'reglas del fondo de imprevistos (PLAN §4.3, GAP-22).';

-- ── 3. estado: el ciclo de vida que GAP-15 no tenía ─────────────────────
create type public.fondo_estado_t as enum (
  'propuesto',
  'pendiente_autorizacion',
  'activo',
  'suspendido',
  'agotado',
  'en_cierre',
  'cerrado',
  'cancelado'
);

comment on type public.fondo_estado_t is
  'Ciclo de vida del fondo (PLAN §4.3, GAP-22). Enum nativo y no lista_tipos (D-24) porque es '
  'una máquina de estados con transiciones cerradas que la base hace cumplir '
  '(guard_fondo_estado_transicion): cerrado y cancelado son terminales, solo activo y suspendido '
  'admiten movimientos ordinarios, y en_cierre existe precisamente para bloquear operaciones '
  'nuevas mientras se reconcilia y se decide el remanente. Si estos valores fueran un catálogo '
  'editable, la irreversibilidad del cierre dependería de datos en vez de código.';

-- ── 4. Identidad, destinación y vigencia ────────────────────────────────
alter table public.fondos
  add column codigo                 text,
  add column tipo_id                bigint references public.lista_tipos (id),
  add column estado                 public.fondo_estado_t not null default 'activo',
  add column objetivo               text,
  add column destinacion            text,
  add column permanente             boolean not null default false,
  add column meta                   numeric(18, 2),
  add column fecha_inicio           date,
  add column fecha_fin              date,
  add column documento_principal_id uuid references public.documentos (id);

-- Backfill: las filas que existen hoy son fondos de imprevistos ya operando.
update public.fondos f
set codigo = case when f.naturaleza = 'imprevistos' then 'FON-IMP'
                  else 'FON-' || upper(left(replace(f.id::text, '-', ''), 6)) end,
    tipo_id = (
      select lt.id from public.lista_tipos lt
       where lt.tipo = 'TIPO_FONDO'
         and lt.codigo = case when f.naturaleza = 'imprevistos' then 'imprevistos' else 'especial' end
         and lt.tenant_id is null
    ),
    permanente = (f.naturaleza = 'imprevistos'),
    fecha_inicio = coalesce(f.fecha_inicio, f.created_at::date)
where f.codigo is null;

alter table public.fondos
  alter column codigo  set not null,
  alter column tipo_id set not null;

-- Los fondos nuevos nacen propuestos; el default 'activo' de arriba existía
-- solo para no dejar en limbo las filas que ya estaban operando.
alter table public.fondos alter column estado set default 'propuesto';

create unique index fondos_codigo_unico on public.fondos (tenant_id, codigo);
create index fondos_estado_idx on public.fondos (tenant_id, estado);

alter table public.fondos
  add constraint fondos_vigencia_coherente
    check (fecha_fin is null or fecha_inicio is null or fecha_fin >= fecha_inicio),
  add constraint fondos_permanente_sin_fin
    check (not permanente or fecha_fin is null),
  add constraint fondos_meta_positiva
    check (meta is null or meta > 0);

comment on column public.fondos.codigo is
  'Código corto del fondo dentro de la copropiedad (FON-IMP, FON-ASC...). Único por tenant: es '
  'el identificador que usa la gente, frente al uuid que usa el sistema.';
comment on column public.fondos.tipo_id is
  'Finalidad declarada (lista_tipos, familia TIPO_FONDO). Descriptivo y parametrizable — no '
  'decide ninguna regla; para eso está naturaleza.';
comment on column public.fondos.objetivo is
  'Para qué existe el fondo, en lenguaje natural. Texto libre a propósito (Modelo Maestro §8): '
  'no se convierte en regla ejecutable. Las reglas viven en fondo_fuentes y en los guards.';
comment on column public.fondos.destinacion is
  'Usos permitidos y restringidos, declarados. Igual que objetivo: descriptivo, nunca se '
  'interpreta automáticamente para autorizar o rechazar un uso.';
comment on column public.fondos.permanente is
  'Un fondo permanente no tiene fecha_fin ni llega a remanente por vencimiento. El de '
  'imprevistos lo es por naturaleza; los de proyecto normalmente no.';
comment on column public.fondos.meta is
  'Monto objetivo a acumular, cuando lo hay (Modelo §20). El % de avance FINANCIERO se deriva de '
  'saldo/meta — nunca se confunde con avance físico de obra, que AQUILA no modela.';
comment on column public.fondos.documento_principal_id is
  'Acta o documento que soporta la existencia del fondo. Nullable: el fondo se registra el mismo '
  'día aunque el escaneo del acta llegue después (mismo criterio que '
  'caso_juridico_actuaciones.documento_id).';

-- ── 5. Transiciones de estado ───────────────────────────────────────────
create function public.guard_fondo_estado_transicion()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.estado = old.estado then
    return new;
  end if;

  -- cerrado y cancelado son terminales: un fondo no se borra ni se revive,
  -- permanece en histórico (Modelo §22/§35). Corregir un cierre equivocado
  -- exige una decisión registrada, no un UPDATE.
  if old.estado in ('cerrado', 'cancelado') then
    raise exception 'FONDO_ESTADO_TERMINAL: el fondo % está % y no admite cambios de estado',
      old.codigo, old.estado;
  end if;

  if not (
       (old.estado = 'propuesto'              and new.estado in ('pendiente_autorizacion', 'cancelado'))
    or (old.estado = 'pendiente_autorizacion' and new.estado in ('activo', 'propuesto', 'cancelado'))
    or (old.estado = 'activo'                 and new.estado in ('suspendido', 'agotado', 'en_cierre'))
    or (old.estado = 'suspendido'             and new.estado in ('activo', 'en_cierre'))
    or (old.estado = 'agotado'                and new.estado in ('activo', 'en_cierre'))
    or (old.estado = 'en_cierre'              and new.estado in ('cerrado', 'activo'))
  ) then
    raise exception 'FONDO_TRANSICION_INVALIDA: % → % no es una transición válida para el fondo %',
      old.estado, new.estado, old.codigo;
  end if;

  return new;
end;
$$;

create trigger guard_fondo_estado_transicion
  before update of estado on public.fondos
  for each row execute function public.guard_fondo_estado_transicion();

comment on function public.guard_fondo_estado_transicion() is
  'Máquina de estados del fondo (PLAN §4.3, GAP-22). agotado → activo es deliberado: un fondo se '
  'agota por saldo, no por decisión, y vuelve a operar solo si recibe aportes. en_cierre → activo '
  'también, porque el cierre puede abortarse mientras no se haya consumado. Lo que NO se permite '
  'es salir de cerrado o cancelado.';

-- ── 6. Coherencia de tenant en las referencias ──────────────────────────
create function public.guard_fondo_referencias()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.documento_principal_id is not null and not exists (
    select 1 from public.documentos d
     where d.id = new.documento_principal_id and d.tenant_id = new.tenant_id
  ) then
    raise exception 'DOCUMENTO_INVALIDO: % no pertenece al tenant %',
      new.documento_principal_id, new.tenant_id;
  end if;

  -- lista_tipos: fila de plataforma (tenant_id null) o del propio tenant, y
  -- de la familia correcta. Aquí sí se valida la familia —a diferencia de
  -- tenant_tercero_rol— porque naturaleza y tipo_id deben poder leerse juntos
  -- sin ambigüedad en toda la UI de fondos.
  if not exists (
    select 1 from public.lista_tipos lt
     where lt.id = new.tipo_id
       and lt.tipo = 'TIPO_FONDO'
       and (lt.tenant_id is null or lt.tenant_id = new.tenant_id)
  ) then
    raise exception 'TIPO_FONDO_INVALIDO: % no es un TIPO_FONDO visible para el tenant %',
      new.tipo_id, new.tenant_id;
  end if;

  return new;
end;
$$;

create trigger guard_fondo_referencias
  before insert or update of documento_principal_id, tipo_id on public.fondos
  for each row execute function public.guard_fondo_referencias();

-- ── 7. Escritura: hasta ahora fondos solo admitía INSERT ────────────────
-- El modelo de GAP-15 no necesitaba UPDATE (solo existía saldo_actual, que
-- lo escribe el trigger). Con estado, destinación y vigencia sí hace falta.
-- Sin gate de módulo, igual que fondos_insert_agent: el enforcement de roles
-- funcionales (20260830130000) se aplicó deliberadamente solo a la lectura.
create policy fondos_update_agent
  on public.fondos for update
  to authenticated
  using (public.has_role(tenant_id, array['auxiliar']::public.tenant_role_t[]))
  with check (public.has_role(tenant_id, array['auxiliar']::public.tenant_role_t[]));

-- ── 8. FI-003 sigue funcionando con la columna renombrada ───────────────
-- Reproducción literal de guard_fuente_financiacion (20260830400000), con un
-- único cambio: `and tipo = 'imprevistos'` → `and naturaleza = 'imprevistos'`.
-- El cuerpo de una función plpgsql no se valida al crearla, así que sin este
-- replace el guard seguiría compilando y fallaría en tiempo de ejecución.
-- El acoplamiento de fondo "por naturaleza" en vez de por id se resuelve de
-- raíz en el bloque de fuentes, cuando fuente_financiacion reciba fondo_id.
create or replace function public.guard_fuente_financiacion()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_estado public.presupuesto_estado_t;
  v_saldo_fondo numeric(18, 2);
  v_tipo_familia text;
  v_tipo_tenant uuid;
  v_tipo_codigo text;
  v_cuenta_tenant uuid;
  v_cuenta_naturaleza text;
begin
  select estado into v_estado
    from public.presupuestos
   where id = new.presupuesto_id;

  if v_estado in ('vigente', 'cerrado') then
    raise exception 'IMMUTABLE_BUDGET: el presupuesto % es inmutable en estado % '
      '— corrige creando una versión nueva (16 §111)', new.presupuesto_id, v_estado;
  end if;

  select tipo, tenant_id, codigo into v_tipo_familia, v_tipo_tenant, v_tipo_codigo
    from public.lista_tipos where id = new.tipo_id;

  if v_tipo_familia is null then
    raise exception 'TIPO_FUENTE_INEXISTENTE: tipo_id % no existe', new.tipo_id;
  end if;

  if v_tipo_familia is distinct from 'TIPO_FUENTE_FINANCIACION' then
    raise exception 'TIPO_FUENTE_INVALIDO: tipo_id % no pertenece a TIPO_FUENTE_FINANCIACION '
      '(es %)', new.tipo_id, v_tipo_familia;
  end if;

  if v_tipo_tenant is not null and v_tipo_tenant <> new.tenant_id then
    raise exception 'TIPO_FUENTE_TENANT_INCONSISTENTE: tipo_id % pertenece a otro tenant',
      new.tipo_id;
  end if;

  if v_tipo_codigo = 'fondo_imprevistos' then
    select saldo_actual into v_saldo_fondo
      from public.fondos
     where tenant_id = new.tenant_id
       and naturaleza = 'imprevistos';

    if v_saldo_fondo is null then
      raise exception 'FONDO_IMPREVISTOS_NO_EXISTE: el tenant % no tiene fondo de imprevistos '
        'configurado', new.tenant_id;
    end if;

    if new.valor_disponible > v_saldo_fondo then
      raise exception 'FONDO_INSUFICIENTE: valor_disponible (%) excede el saldo actual del '
        'fondo de imprevistos (%) — FI-003', new.valor_disponible, v_saldo_fondo;
    end if;
  end if;

  if new.presupuesto_cuenta_id is not null then
    select tenant_id, naturaleza into v_cuenta_tenant, v_cuenta_naturaleza
      from public.presupuesto_cuenta where id = new.presupuesto_cuenta_id;

    if v_cuenta_tenant is null then
      raise exception 'CUENTA_INEXISTENTE: presupuesto_cuenta_id % no existe',
        new.presupuesto_cuenta_id;
    end if;

    if v_cuenta_tenant <> new.tenant_id then
      raise exception 'CUENTA_TENANT_INCONSISTENTE: presupuesto_cuenta_id % pertenece a otro '
        'tenant', new.presupuesto_cuenta_id;
    end if;

    if v_cuenta_naturaleza <> 'ingreso' then
      raise exception 'CUENTA_NATURALEZA_INVALIDA: presupuesto_cuenta_id % no es una cuenta de '
        'Ingresos', new.presupuesto_cuenta_id;
    end if;
  end if;

  return new;
end;
$$;

comment on table public.fondos is
  'Estructura de control y destinación de recursos de la copropiedad: una finalidad, reglas de '
  'alimentación, autorización, vigencia y trazabilidad (PLAN §4.3, GAP-22). NO es una cuenta '
  'bancaria, ni una cuenta contable, ni una cuota, ni un rubro presupuestal, ni patrimonio: '
  'contablemente es efectivo restringido (CTCP Concepto 0146/2025), y su trazabilidad la da la '
  'dimensión fondo_id, no una cuenta por fondo.';
