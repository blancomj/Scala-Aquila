-- ═══════════════════════════════════════════════════════════════════════
--  RPT-01 · Catálogo del Motor de Reportes (PLAN_MOTOR_REPORTES.md §5, D-136)
--
--  Estas dos tablas son el GUARD DE SEGURIDAD del compilador de consultas
--  (`fn_reporte_ejecutar`, migración 20260938020000): ningún identificador
--  SQL llega nunca desde el cliente — el cliente manda códigos de campo, y
--  el compilador los resuelve CONTRA ESTAS TABLAS antes de interpolarlos
--  con format(%I). Si un tenant pudiera escribirlas, el guard no existiría.
--
--  Por eso, y a diferencia de casi todo el resto del esquema:
--
--    · son GLOBALES — sin tenant_id. El catálogo es parte del producto, no
--      dato de una copropiedad. La RLS de los datos reportados la sigue
--      aplicando la tabla/vista subyacente, no esta capa (R-06).
--    · son de SOLO LECTURA en runtime: política SELECT para `authenticated`
--      y ninguna de INSERT/UPDATE/DELETE. La única escritura posible es una
--      migración (el rol de migración lleva BYPASSRLS, igual que ya ocurre
--      con `tipos`/`lista_tipos` desde 20260814160000).
--
--  R-07 (D-136). La lista blanca ES el catálogo: un campo que no debe poder
--  reportarse sencillamente no se siembra aquí — no hay clasificación de
--  sensibilidad en V1 porque no hay campo sensible que sembrar, y una
--  columna de seguridad que nadie evalúa es peor que no tenerla.
-- ═══════════════════════════════════════════════════════════════════════

-- ── Fuentes ────────────────────────────────────────────────────────────
create table public.reporte_fuentes (
  id                 bigint generated always as identity primary key,
  codigo             text not null unique,
  nombre             text not null,
  descripcion        text,
  modulo             text not null,
  -- Nombre de la vista de reporting en `public` (vr_*). Nunca una tabla
  -- base: cada fuente es una vista `security_invoker = true` que ya resolvió
  -- sus joins, de modo que el compilador jamás arma un join dinámico.
  objeto_sql         text not null,
  -- Código del campo que toda ejecución DEBE filtrar (p. ej. 'fecha_corte'
  -- en cartera). NULL = sin filtro obligatorio. Protege a la base de una
  -- consulta sin acotar sobre una fuente que crece sin techo (§58).
  filtro_obligatorio text,
  activa             boolean not null default true,
  created_at         timestamptz not null default now(),

  -- Defensa en profundidad: aunque solo una migración pueda escribir aquí,
  -- el compilador interpola este valor con format(%I). Que el dominio del
  -- dato lo garantice, y no la disciplina de quien escriba la migración.
  constraint reporte_fuentes_objeto_vista check (objeto_sql ~ '^vr_[a-z0-9_]{1,60}$'),
  constraint reporte_fuentes_codigo_valido check (codigo ~ '^[a-z][a-z0-9_]{0,62}$')
);

alter table public.reporte_fuentes enable row level security;
alter table public.reporte_fuentes force row level security;

create policy reporte_fuentes_select_authenticated
  on public.reporte_fuentes for select
  to authenticated
  using (activa);

comment on table public.reporte_fuentes is
  'Catálogo GLOBAL de fuentes reportables (RPT-01, D-136 R-07). Sin tenant_id y sin política '
  'de escritura: solo una migración la modifica. Es la lista blanca que consulta '
  'fn_reporte_ejecutar antes de interpolar cualquier identificador — no es metadato '
  'decorativo, es el control de seguridad del compilador.';

comment on column public.reporte_fuentes.objeto_sql is
  'Vista public.vr_* (security_invoker) que ya resolvió los joins de la fuente. El compilador '
  'nunca arma joins dinámicos: una fuente = un objeto ya aplanado. El CHECK ^vr_ impide '
  'apuntar una fuente a una tabla base por error.';

comment on column public.reporte_fuentes.filtro_obligatorio is
  'Campo que toda ejecución debe filtrar (§58 del prompt: filtros obligatorios para fuentes '
  'grandes). NULL = sin exigencia. fn_reporte_ejecutar lanza RPT_FILTRO_OBLIGATORIO si falta.';

-- ── Campos ─────────────────────────────────────────────────────────────
create table public.reporte_campos (
  id                 bigint generated always as identity primary key,
  fuente_id          bigint not null references public.reporte_fuentes (id) on delete cascade,
  -- Nombre REAL de la columna en la vista. Es lo que acaba dentro de
  -- format(%I), así que el CHECK de abajo es la última barrera.
  codigo             text not null,
  etiqueta           text not null,
  descripcion        text,
  tipo_dato          text not null,
  clase              text not null,
  agregacion_default text,
  filtrable          boolean not null default true,
  ordenable          boolean not null default true,
  agrupable          boolean not null default true,
  orden              smallint not null default 0,

  constraint reporte_campos_codigo_unico unique (fuente_id, codigo),
  constraint reporte_campos_codigo_identificador check (codigo ~ '^[a-z][a-z0-9_]{0,62}$'),
  constraint reporte_campos_tipo_dato_valido check (
    tipo_dato in ('texto', 'numero', 'dinero', 'fecha', 'booleano', 'porcentaje')
  ),
  constraint reporte_campos_clase_valida check (clase in ('dimension', 'metrica')),
  constraint reporte_campos_agregacion_valida check (
    agregacion_default is null
    or agregacion_default in ('suma', 'conteo', 'promedio', 'minimo', 'maximo')
  ),
  -- Una métrica sin agregación no se puede totalizar, y una dimensión con
  -- agregación no es una dimensión. El modelo lo impide, no la convención.
  constraint reporte_campos_metrica_con_agregacion check (
    (clase = 'metrica' and agregacion_default is not null)
    or (clase = 'dimension' and agregacion_default is null)
  )
);

alter table public.reporte_campos enable row level security;
alter table public.reporte_campos force row level security;

create index reporte_campos_fuente_idx on public.reporte_campos (fuente_id, orden);

create policy reporte_campos_select_authenticated
  on public.reporte_campos for select
  to authenticated
  using (true);

comment on table public.reporte_campos is
  'Campos reportables de cada fuente (RPT-01, D-136 R-07). GLOBAL y sin escritura en runtime, '
  'igual que reporte_fuentes. `codigo` es el nombre real de la columna en la vista vr_*: es el '
  'valor que fn_reporte_ejecutar interpola con format(%I), de ahí el CHECK de identificador.';

comment on column public.reporte_campos.clase is
  'dimension = se agrupa y se filtra; metrica = se agrega. La restricción '
  'reporte_campos_metrica_con_agregacion impide que una métrica se siembre sin decir cómo se '
  'totaliza (R-09: la definición oficial de la cifra vive aquí, no en cada reporte).';
