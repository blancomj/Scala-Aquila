-- ═══════════════════════════════════════════════════════════════════════
--  Centro de costo + estructura física (agrupación) en presupuesto —
--  dos dimensiones INDEPENDIENTES, nunca fusionadas (sesión de diseño,
--  respaldada en Casos de uso/Centro de costos/
--  ARQUITECTURA_ESTRUCTURA_FISICA_CENTROS_COSTO_AQUILA.md).
--
--  Auditoría contra el esquema real antes de crear nada (documento §18/§20
--  aplicado): de las dimensiones que propone el documento, la mayoría YA
--  existen en AQUILA con otro nombre — `agrupaciones` es exactamente su
--  "estructura física" (jerarquía no rígida + tipo_id ampliable vía
--  lista_tipos, ya construida así desde 20260830250000), `zonas_comunes`
--  es su "espacio común", `presupuesto_cuenta` es su "plan contable",
--  `fondos` es su "fondo", `terceros` es su "tercero". La única pieza que
--  de verdad no existe es "centro de costo" — por eso esta migración NO
--  crea una tabla `estructura_fisica` nueva (sería duplicar `agrupaciones`,
--  justo lo que el documento mismo pide evitar en su §20), solo agrega
--  `centro_costo` como catálogo nuevo y dos columnas de vínculo.
--
--  Por qué NO se fusiona centro de costo con agrupaciones: una Torre
--  contiene ascensores, vigilancia, iluminación — convertirla en centro de
--  costo pierde la capacidad de analizar esos consumos por separado
--  (documento §2). Un rubro/movimiento puede llevar las dos dimensiones a
--  la vez: "Mantenimiento ascensor" (centro=Ascensores, agrupación=Torre 3),
--  cada una nullable e independiente — ninguna obligatoria.
--
--  Deliberadamente FUERA de este corte (mismo criterio AD-23/GAP-21 que ya
--  rige el proyecto): activo, proyecto, contrato, y el motor de
--  configuración OBLIGATORIO/OPCIONAL/NO APLICA por cuenta que propone el
--  documento (§13-14) — ninguno tiene caso de uso validado hoy en AQUILA;
--  se documentan aquí como gap identificado, no se construyen
--  especulativamente.
-- ═══════════════════════════════════════════════════════════════════════

-- ── 1. catálogo centro_costo (familia CENTRO_COSTO, ampliable por tenant) ──
insert into public.tipos (codigo, nombre, descripcion) values
  ('CENTRO_COSTO', 'Centro de Costo',
   'En qué área, proceso o servicio se consume el recurso — independiente de dónde ocurre '
   'físicamente (ver agrupaciones). Catálogo de plataforma con valores típicos de PH, '
   'ampliable por tenant sin migración nueva.');

insert into public.lista_tipos (tipo, codigo, nombre, orden) values
  ('CENTRO_COSTO', 'administracion', 'Administración', 1),
  ('CENTRO_COSTO', 'seguridad', 'Seguridad', 2),
  ('CENTRO_COSTO', 'aseo', 'Aseo', 3),
  ('CENTRO_COSTO', 'mantenimiento', 'Mantenimiento', 4),
  ('CENTRO_COSTO', 'ascensores', 'Ascensores', 5),
  ('CENTRO_COSTO', 'piscina', 'Piscina', 6),
  ('CENTRO_COSTO', 'zonas_verdes', 'Zonas verdes', 7),
  ('CENTRO_COSTO', 'electrico', 'Sistemas eléctricos', 8),
  ('CENTRO_COSTO', 'hidraulico', 'Sistemas hidráulicos', 9),
  ('CENTRO_COSTO', 'obras_civiles', 'Obras civiles', 10),
  ('CENTRO_COSTO', 'seguridad_electronica', 'Seguridad electrónica (CCTV)', 11);

-- ── 2. presupuesto_rubros: agrupacion_id + centro_costo_id, ambos opcionales ──
alter table public.presupuesto_rubros
  add column agrupacion_id uuid references public.agrupaciones (id),
  add column centro_costo_id bigint references public.lista_tipos (id);

comment on column public.presupuesto_rubros.agrupacion_id is
  'Estructura física donde ocurre el gasto (Torre, Bloque, Piso...) — cualquier nivel del árbol '
  'de agrupaciones, no solo hojas: "Vigilancia Torre 3" es un gasto real de la torre completa, '
  'repartirlo entre sus pisos sería artificial. NULL = no segregado por ubicación (el '
  'consolidado de siempre).';

comment on column public.presupuesto_rubros.centro_costo_id is
  'En qué área/proceso/servicio se consume el recurso (lista_tipos, familia CENTRO_COSTO) — '
  'independiente de agrupacion_id, nunca fusionados (ver cabecera de esta migración). NULL = no '
  'segregado por centro de costo.';

-- ── 3. presupuesto_ejecucion: mismas dos columnas, mismo criterio ────────
alter table public.presupuesto_ejecucion
  add column agrupacion_id uuid references public.agrupaciones (id),
  add column centro_costo_id bigint references public.lista_tipos (id);

comment on column public.presupuesto_ejecucion.agrupacion_id is
  'Igual que presupuesto_rubros.agrupacion_id — el movimiento real puede segregarse por '
  'ubicación aunque el rubro presupuestado no lo estuviera (o viceversa).';

comment on column public.presupuesto_ejecucion.centro_costo_id is
  'Igual que presupuesto_rubros.centro_costo_id, a nivel de movimiento real de ejecución.';

-- ── 4. guard compartido: valida tenant + familia, para ambas tablas ──────
-- Una función, reutilizada en dos triggers (mismo criterio que
-- guard_fuente_financiacion: dos validaciones sobre la misma pareja de columnas no ameritan
-- funciones separadas). Dispara solo cuando alguna de las dos columnas cambia — igual patrón
-- que guard_presupuesto_rubro_cuenta (before insert or update of <columna>), no en cada UPDATE.
create function public.guard_agrupacion_centro_costo()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_agrupacion_tenant uuid;
  v_tipo_familia text;
  v_tipo_tenant uuid;
  v_tipo_activo boolean;
begin
  if new.agrupacion_id is not null then
    select tenant_id into v_agrupacion_tenant
      from public.agrupaciones where id = new.agrupacion_id;

    if v_agrupacion_tenant is null then
      raise exception 'AGRUPACION_INEXISTENTE: agrupacion_id % no existe', new.agrupacion_id;
    end if;

    if v_agrupacion_tenant <> new.tenant_id then
      raise exception 'AGRUPACION_TENANT_INCONSISTENTE: agrupacion_id % pertenece a otro tenant',
        new.agrupacion_id;
    end if;
  end if;

  if new.centro_costo_id is not null then
    select tipo, tenant_id, activo into v_tipo_familia, v_tipo_tenant, v_tipo_activo
      from public.lista_tipos where id = new.centro_costo_id;

    if v_tipo_familia is null then
      raise exception 'CENTRO_COSTO_INEXISTENTE: centro_costo_id % no existe', new.centro_costo_id;
    end if;

    if v_tipo_familia is distinct from 'CENTRO_COSTO' then
      raise exception 'CENTRO_COSTO_INVALIDO: centro_costo_id % no pertenece a CENTRO_COSTO '
        '(es %)', new.centro_costo_id, v_tipo_familia;
    end if;

    if v_tipo_tenant is not null and v_tipo_tenant <> new.tenant_id then
      raise exception 'CENTRO_COSTO_TENANT_INCONSISTENTE: centro_costo_id % pertenece a otro '
        'tenant', new.centro_costo_id;
    end if;

    if not v_tipo_activo then
      raise exception 'CENTRO_COSTO_INACTIVO: centro_costo_id % está desactivado',
        new.centro_costo_id;
    end if;
  end if;

  return new;
end;
$$;

create trigger guard_agrupacion_centro_costo
  before insert or update of agrupacion_id, centro_costo_id on public.presupuesto_rubros
  for each row execute function public.guard_agrupacion_centro_costo();

create trigger guard_agrupacion_centro_costo
  before insert or update of agrupacion_id, centro_costo_id on public.presupuesto_ejecucion
  for each row execute function public.guard_agrupacion_centro_costo();

-- ── 5. índices parciales (mismo criterio que el resto del esquema) ──────
create index presupuesto_rubros_agrupacion_idx on public.presupuesto_rubros (agrupacion_id)
  where agrupacion_id is not null;
create index presupuesto_rubros_centro_costo_idx on public.presupuesto_rubros (centro_costo_id)
  where centro_costo_id is not null;
create index presupuesto_ejecucion_agrupacion_idx on public.presupuesto_ejecucion (agrupacion_id)
  where agrupacion_id is not null;
create index presupuesto_ejecucion_centro_costo_idx on public.presupuesto_ejecucion (centro_costo_id)
  where centro_costo_id is not null;
