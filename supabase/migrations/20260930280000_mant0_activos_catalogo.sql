-- ═══════════════════════════════════════════════════════════════════════
--  MANT-0 · Registro de activos, ficha contable y depreciación (1/2)
--  Casos de uso/Tres Modulos/Mantenimiento/MANT_00_activos_ficha_contable.md
--
--  Este archivo: catálogo (§4.1), ficha maestra (§4.2) y ciclo de vida
--  (§4.3). La depreciación, la capitalización y las funciones PPE van en
--  20260930290000 (necesitan `activos` ya creada).
--
--  ═══ Hallazgo de esta sesión, confirmado con el usuario ═══
--  Ley 675/2001 art. 20 + doctrina CTCP (Concepto 243/2025, DOT 15): un
--  bien común ESENCIAL (indispensable para la existencia/estabilidad del
--  edificio — la inmensa mayoría de lo que se recibe de la constructora:
--  ascensores, tanques, estructura) **nunca** se reconoce como activo en
--  los estados financieros de la copropiedad. Solo un bien NO esencial, y
--  solo tras una DESAFECTACIÓN formal (escritura pública + voto del 70% de
--  coeficientes, un acto jurídico que este corte no modela), puede entrar
--  al balance. El corte original (MANT_00_...md §3) trata la capitalización
--  como una pregunta puramente numérica (vida útil, umbral) pendiente del
--  contador — le falta esta primera compuerta, legal, no contable. Se
--  agrega aquí como el enum `activo_naturaleza_bien_t` y el guard que
--  bloquea `capitalizado = true` para un bien esencial en la migración
--  siguiente (necesita la tabla ya creada).
-- ═══════════════════════════════════════════════════════════════════════

-- ── §4.1 Catálogo — lista_tipos, NO enums (D-24: vocabulario descriptivo) ──
insert into public.tipos (codigo, nombre, descripcion) values
  ('CATEGORIA_ACTIVO', 'Categoría de activo',
   'Agrupación funcional de un activo de mantenimiento (MANT-0 §4.1) — puramente descriptiva, '
   'sin ningún guard que dependa de cuál sea.'),
  ('TIPO_ACTIVO', 'Tipo de activo',
   'Tipo específico de activo dentro de una categoría (MANT-0 §4.1) — la asociación '
   'categoría↔tipo es informativa (se refleja en `descripcion`), no una FK: `lista_tipos` no '
   'tiene columna de jerarquía entre familias distintas.');

insert into public.lista_tipos (tipo, codigo, nombre, orden) values
  ('CATEGORIA_ACTIVO', 'transporte_vertical', 'Transporte vertical', 10),
  ('CATEGORIA_ACTIVO', 'hidraulico', 'Hidráulico', 20),
  ('CATEGORIA_ACTIVO', 'electrico', 'Eléctrico', 30),
  ('CATEGORIA_ACTIVO', 'climatizacion', 'Climatización', 40),
  ('CATEGORIA_ACTIVO', 'seguridad', 'Seguridad', 50),
  ('CATEGORIA_ACTIVO', 'seguridad_electronica', 'Seguridad electrónica', 60),
  ('CATEGORIA_ACTIVO', 'obra_civil', 'Obra civil', 70),
  ('CATEGORIA_ACTIVO', 'mobiliario', 'Mobiliario', 80),
  ('CATEGORIA_ACTIVO', 'otros', 'Otros', 90);

insert into public.lista_tipos (tipo, codigo, nombre, descripcion, orden) values
  ('TIPO_ACTIVO', 'ascensor', 'Ascensor', 'Categoría: transporte_vertical', 10),
  ('TIPO_ACTIVO', 'bomba', 'Bomba', 'Categoría: hidráulico', 20),
  ('TIPO_ACTIVO', 'tanque', 'Tanque de almacenamiento', 'Categoría: hidráulico', 30),
  ('TIPO_ACTIVO', 'planta_electrica', 'Planta eléctrica', 'Categoría: eléctrico', 40),
  ('TIPO_ACTIVO', 'tablero', 'Tablero eléctrico', 'Categoría: eléctrico', 50),
  ('TIPO_ACTIVO', 'aire_acondicionado', 'Aire acondicionado', 'Categoría: climatización', 60),
  ('TIPO_ACTIVO', 'extintor', 'Extintor', 'Categoría: seguridad', 70),
  ('TIPO_ACTIVO', 'puerta_automatica', 'Puerta automática', 'Categoría: seguridad', 80),
  ('TIPO_ACTIVO', 'camara', 'Cámara de videovigilancia', 'Categoría: seguridad_electronica', 90),
  ('TIPO_ACTIVO', 'luminaria', 'Luminaria', 'Categoría: obra_civil', 100),
  ('TIPO_ACTIVO', 'otro', 'Otro', 'Categoría: otros', 110);

-- ── §4.2/§4.3 Enums — cada uno gatilla transición o cálculo real (D-24) ──
create type public.activo_estado_t as enum (
  'planificado', 'adquirido', 'instalado', 'en_servicio',
  'en_mantenimiento', 'fuera_de_servicio', 'en_reparacion',
  'retirado', 'dispuesto'
);
comment on type public.activo_estado_t is
  'Ciclo de vida físico del activo (MANT-0 §4.3). Gatilla guard_activo_transicion — no es '
  'vocabulario descriptivo, cada valor determina qué transiciones siguen abiertas.';

create type public.activo_origen_t as enum ('comprado', 'recibido_constructora', 'donado', 'reposicion');
comment on type public.activo_origen_t is
  'De dónde salió el activo (MANT-0 §4.2). Determina cómo se reconoce contablemente: '
  '''comprado''/''reposicion'' se capitalizan reclasificando el gasto ya pagado en '
  'presupuesto_ejecucion (fn_mant_capitalizar_activo); ''recibido_constructora''/''donado'' solo '
  'pueden capitalizarse si además `naturaleza_bien <> ''bien_comun_esencial''` (ver ese enum) — '
  'la inmensa mayoría de lo recibido de la constructora es bien esencial y nunca se capitaliza.';

create type public.depreciacion_metodo_t as enum ('linea_recta', 'no_deprecia');
comment on type public.depreciacion_metodo_t is
  'Método de depreciación del activo (MANT-0 §4.2/§4.4). Gatilla el cálculo real de '
  'mant_calcular_depreciacion — ''no_deprecia'' cubre terrenos y bienes que la copropiedad '
  'decide no depreciar (no hay otro método soportado en este corte; el corte no pide otro).';

create type public.activo_naturaleza_bien_t as enum (
  'bien_comun_esencial', 'bien_comun_no_esencial_desafectado', 'bien_propio'
);
comment on type public.activo_naturaleza_bien_t is
  'Hallazgo de esta sesión (Ley 675 art. 20, CTCP Concepto 243/2025, DOT 15) — gatilla la '
  'compuerta legal que MANT_00_activos_ficha_contable.md §3 no modelaba: ''bien_comun_esencial'' '
  '(indivisible/indispensable — la mayoría de lo recibido de la constructora) NUNCA puede '
  'capitalizarse, sin importar qué diga el contador; solo ''bien_comun_no_esencial_desafectado'' '
  '(tras un acto jurídico de asamblea que este corte no modela) o ''bien_propio'' (comprado '
  'directo por la administración, sin cuestión de bien común) pueden llegar a `capitalizado = '
  'true`. Ver guard_activo_capitalizacion en 20260930290000.';

-- ── §4.2 Ficha maestra ──────────────────────────────────────────────────
create table public.activos (
  id                    uuid primary key default gen_random_uuid(),
  tenant_id             uuid not null references public.tenants (id) on delete cascade,
  codigo                text not null,
  nombre                text not null,
  descripcion           text,
  categoria_id          bigint not null references public.lista_tipos (id),
  tipo_id               bigint not null references public.lista_tipos (id),
  activo_padre_id       uuid references public.activos (id),
  agrupacion_id         uuid references public.agrupaciones (id),
  zona_comun_id         uuid references public.zonas_comunes (id),
  ubicacion_detalle     text,

  -- identificación técnica
  marca                 text,
  modelo                text,
  numero_serie          text,
  fabricante             text,

  -- ciclo de vida
  estado                 public.activo_estado_t not null default 'planificado',
  fecha_instalacion      date,
  fecha_puesta_servicio  date,
  fecha_retiro           date,

  -- ══ bloque contable ══
  naturaleza_bien        public.activo_naturaleza_bien_t not null,
  origen                 public.activo_origen_t not null,
  fecha_adquisicion      date,
  valor_adquisicion      numeric(18, 2),
  documento_soporte_id   uuid references public.documentos (id),
  contable_cuenta_id     uuid references public.contable_cuenta (id),
  centro_costo_id        bigint references public.lista_tipos (id),
  vida_util_meses        integer,
  metodo_depreciacion    public.depreciacion_metodo_t,
  valor_residual         numeric(18, 2) not null default 0,
  fecha_inicio_depreciacion date,
  capitalizado           boolean not null default false,

  -- identificación física
  qr_token               text,
  imagen_documento_id    uuid references public.documentos (id),

  created_at             timestamptz not null default now(),
  updated_at             timestamptz,

  constraint activos_codigo_unico unique (tenant_id, codigo),
  constraint activos_qr_token_unico unique (qr_token),
  constraint activos_valor_residual_valido check (
    valor_adquisicion is null or valor_residual <= valor_adquisicion
  )
);

alter table public.activos enable row level security;
alter table public.activos force row level security;

create index activos_tenant_idx on public.activos (tenant_id);
create index activos_padre_idx on public.activos (activo_padre_id);
create index activos_agrupacion_idx on public.activos (agrupacion_id);
create index activos_zona_comun_idx on public.activos (zona_comun_id);

comment on table public.activos is
  'MANT-0: activo físico de la copropiedad, con su bloque contable opcional. '
  '`naturaleza_bien` decide si algún día puede capitalizarse (ver guard_activo_capitalizacion, '
  '20260930290000) — un bien esencial nunca puede, sin importar los demás campos.';
comment on column public.activos.documento_soporte_id is
  'Factura o acta de entrega — opcional siempre (ningún guard lo exige, ni para capitalizar): '
  '`documentos` generaliza `documentos_inmueble` pero su INSERT para `authenticated` sigue sin '
  'política (gap §8.1 preexistente, no de este corte) — exigirlo bloquearía el corte entero por '
  'un gap ajeno.';
comment on column public.activos.centro_costo_id is
  'GASTO_DEPRECIACION resuelve hoy contra la cuenta 5905, que en el PUC vigente exige centro de '
  'costo (`requiere_centro_costo`) — sin este campo, ningún activo podría depreciarse. Nullable '
  'para no bloquear la creación de la ficha; `fn_mant_reconocer_depreciacion` reporta '
  '''fallido''/''omitido'' si falta cuando el activo sí está capitalizado (mismo patrón CO-3).';

-- ── Guards de la ficha (§4.2) ────────────────────────────────────────────
create function public.guard_activo_ficha()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_categoria_tipo text;
  v_tipo_tipo text;
  v_cuenta public.contable_cuenta%rowtype;
  v_padre_tenant uuid;
begin
  select tipo into v_categoria_tipo from public.lista_tipos where id = new.categoria_id;
  if v_categoria_tipo is distinct from 'CATEGORIA_ACTIVO' then
    raise exception 'ACTIVO_CATEGORIA_INVALIDA: categoria_id % no pertenece a CATEGORIA_ACTIVO (es %)',
      new.categoria_id, coalesce(v_categoria_tipo, 'inexistente');
  end if;

  select tipo into v_tipo_tipo from public.lista_tipos where id = new.tipo_id;
  if v_tipo_tipo is distinct from 'TIPO_ACTIVO' then
    raise exception 'ACTIVO_TIPO_INVALIDO: tipo_id % no pertenece a TIPO_ACTIVO (es %)',
      new.tipo_id, coalesce(v_tipo_tipo, 'inexistente');
  end if;

  if new.activo_padre_id is not null then
    select tenant_id into v_padre_tenant from public.activos where id = new.activo_padre_id;
    if v_padre_tenant is distinct from new.tenant_id then
      raise exception 'ACTIVO_TENANT_INCONSISTENTE: el activo padre % pertenece a otro tenant',
        new.activo_padre_id;
    end if;
    if new.activo_padre_id = new.id then
      raise exception 'ACTIVO_JERARQUIA_CICLICA: un activo no puede ser su propio padre';
    end if;
    -- No ciclos más largos: recorre la cadena de padres del propuesto y verifica que new.id
    -- no aparezca — mismo criterio que guard_agrupacion_arbol (profundidad acotada, aquí sin
    -- límite explícito porque la jerarquía de componentes físicos rara vez pasa de 2-3 niveles).
    if exists (
      with recursive cadena as (
        select a.id, a.activo_padre_id from public.activos a where a.id = new.activo_padre_id
        union all
        select a.id, a.activo_padre_id from public.activos a
        join cadena c on a.id = c.activo_padre_id
      )
      select 1 from cadena where id = new.id
    ) then
      raise exception 'ACTIVO_JERARQUIA_CICLICA: % ya es ancestro de %', new.id, new.activo_padre_id;
    end if;
  end if;

  if new.agrupacion_id is not null then
    if not exists (
      select 1 from public.agrupaciones where id = new.agrupacion_id and tenant_id = new.tenant_id
    ) then
      raise exception 'ACTIVO_TENANT_INCONSISTENTE: la agrupación % no pertenece al tenant', new.agrupacion_id;
    end if;
  end if;

  if new.zona_comun_id is not null then
    if not exists (
      select 1 from public.zonas_comunes where id = new.zona_comun_id and tenant_id = new.tenant_id
    ) then
      raise exception 'ACTIVO_TENANT_INCONSISTENTE: la zona común % no pertenece al tenant', new.zona_comun_id;
    end if;
  end if;

  if new.valor_residual < 0 then
    raise exception 'ACTIVO_VALOR_RESIDUAL_INVALIDO: valor_residual no puede ser negativo';
  end if;
  if new.valor_adquisicion is not null and new.valor_residual > new.valor_adquisicion then
    raise exception 'ACTIVO_VALOR_RESIDUAL_INVALIDO: valor_residual (%) no puede superar '
      'valor_adquisicion (%)', new.valor_residual, new.valor_adquisicion;
  end if;

  if new.metodo_depreciacion = 'linea_recta' and coalesce(new.vida_util_meses, 0) <= 0 then
    raise exception 'ACTIVO_VIDA_UTIL_INVALIDA: metodo_depreciacion = ''linea_recta'' exige '
      'vida_util_meses > 0';
  end if;

  if new.capitalizado then
    -- Guard a nivel de trigger, no solo dentro de fn_mant_capitalizar_activo: un bien esencial
    -- nunca puede quedar capitalizado, pase lo que pase por qué camino se intente el UPDATE
    -- (RPC, admin, service_role) — Ley 675 art. 20 + CTCP 243/2025, hallazgo de esta sesión.
    if new.naturaleza_bien = 'bien_comun_esencial' then
      raise exception 'ACTIVO_BIEN_ESENCIAL_NO_CAPITALIZABLE: % es un bien común esencial (Ley '
        '675 art. 20) — nunca puede capitalizarse', new.id;
    end if;
    if new.valor_adquisicion is null or new.fecha_adquisicion is null
       or new.contable_cuenta_id is null or new.vida_util_meses is null then
      raise exception 'ACTIVO_BLOQUE_CONTABLE_INCOMPLETO: capitalizado = true exige '
        'valor_adquisicion, fecha_adquisicion, contable_cuenta_id y vida_util_meses';
    end if;
    v_cuenta := public.validar_cuenta_contable_destino(new.contable_cuenta_id, new.tenant_id);
    if v_cuenta.clase <> 1 or left(v_cuenta.codigo, 2) <> '15' then
      raise exception 'ACTIVO_CUENTA_CLASE_INVALIDA: % (%) no es de clase 15 (propiedad, planta '
        'y equipo)', v_cuenta.codigo, v_cuenta.nombre;
    end if;
    if not v_cuenta.permite_movimiento then
      raise exception 'ACTIVO_CUENTA_CLASE_INVALIDA: % (%) no admite movimiento directo',
        v_cuenta.codigo, v_cuenta.nombre;
    end if;
  end if;

  new.updated_at := now();
  return new;
end;
$$;

comment on function public.guard_activo_ficha() is
  'Valida la ficha de activo (MANT-0 §4.2): categoría/tipo pertenecen a su familia, jerarquía '
  'sin ciclos, agrupación/zona común del mismo tenant, y el bloque contable completo + de clase '
  '15 cuando capitalizado = true. No valida naturaleza_bien vs. capitalizado — eso lo hace '
  'guard_activo_capitalizacion en 20260930290000 (necesita poder distinguir la creación inicial '
  'de la transición real a capitalizado, ver comentario ahí).';

create trigger activos_guard_ficha
  before insert or update on public.activos
  for each row execute function public.guard_activo_ficha();

-- ── §4.3 Ciclo de vida — historial append-only ──────────────────────────
create table public.activo_estado_historial (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid not null references public.tenants (id) on delete cascade,
  activo_id     uuid not null references public.activos (id) on delete cascade,
  estado_anterior public.activo_estado_t,
  estado_nuevo    public.activo_estado_t not null,
  motivo          text,
  documento_id    uuid references public.documentos (id),
  registrado_por  uuid references public.profiles (id),
  created_at      timestamptz not null default now()
);

alter table public.activo_estado_historial enable row level security;
alter table public.activo_estado_historial force row level security;

create index activo_estado_historial_activo_idx on public.activo_estado_historial (activo_id);

comment on table public.activo_estado_historial is
  'Append-only (mismo patrón que caso_juridico_actuaciones) — historial de transiciones de '
  'estado de un activo, con motivo. Sin UPDATE ni DELETE para ningún rol.';

create trigger activo_estado_historial_append_only
  before update or delete on public.activo_estado_historial
  for each row execute function public.forbid_mutation();

-- ── Transición de ciclo de vida (§4.3) ───────────────────────────────────
create function public.guard_activo_transicion()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_permitida boolean := false;
begin
  if tg_op = 'INSERT' then
    return new;
  end if;

  if new.estado = old.estado then
    return new;
  end if;

  v_permitida := case old.estado
    when 'planificado'       then new.estado = 'adquirido'
    when 'adquirido'         then new.estado = 'instalado'
    when 'instalado'         then new.estado = 'en_servicio'
    when 'en_servicio'       then new.estado in
      ('en_mantenimiento', 'fuera_de_servicio', 'en_reparacion', 'retirado')
    when 'en_mantenimiento'  then new.estado in ('en_servicio', 'retirado')
    when 'fuera_de_servicio' then new.estado in ('en_servicio', 'retirado')
    when 'en_reparacion'     then new.estado in ('en_servicio', 'retirado')
    when 'retirado'          then new.estado = 'dispuesto'
    else false
  end;

  if not v_permitida then
    raise exception 'ACTIVO_TRANSICION_INVALIDA: % -> % no está permitida', old.estado, new.estado;
  end if;

  insert into public.activo_estado_historial (
    tenant_id, activo_id, estado_anterior, estado_nuevo, registrado_por
  ) values (
    new.tenant_id, new.id, old.estado, new.estado, (select auth.uid())
  );

  return new;
end;
$$;

comment on function public.guard_activo_transicion() is
  'Máquina de estados del ciclo de vida físico (MANT-0 §4.3). Registra cada transición real en '
  'activo_estado_historial (append-only) — el INSERT inicial no genera fila de historial, solo '
  'las transiciones posteriores.';

create trigger activos_guard_transicion
  before insert or update on public.activos
  for each row execute function public.guard_activo_transicion();
