-- ═══════════════════════════════════════════════════════════════════════
--  inmuebles.estado_legal_id / habitabilidad_id — dos ejes independientes
--  Propietario: PROMPT_FICHA_INMUEBLE.md §4.2
--
--  No confundir los dos ejes (§4.2): un inmueble puede estar perfectamente
--  habitable y embargado a la vez. HABITABILIDAD_PREDIO es condición
--  física/funcional (ya sembrada en 20260814180000); ESTADO_LEGAL_PREDIO
--  es situación jurídica — familia nueva, no existía ni como valores de
--  catálogo. Códigos inferidos directamente de los tres ejemplos que da
--  el propio documento ("litigio, embargo, sucesión ilíquida") — ninguno
--  inventado más allá de eso.
--
--  Ambas columnas nullable: un inmueble sin novedad jurídica no tiene
--  estado_legal_id (NULL = sin problema, no "normal" como valor propio);
--  habitabilidad_id nullable por si se necesita migrar un inmueble
--  existente sin forzar un valor.
-- ═══════════════════════════════════════════════════════════════════════

insert into public.tipos (codigo, nombre, descripcion) values
  ('ESTADO_LEGAL_PREDIO', 'Estado Legal del Predio',
   'Situación jurídica del inmueble (litigio, gravamen judicial...) — independiente de su '
   'habitabilidad física (HABITABILIDAD_PREDIO).');

insert into public.lista_tipos (tipo, codigo, nombre, orden) values
  ('ESTADO_LEGAL_PREDIO', 'litigio', 'Litigio', 1),
  ('ESTADO_LEGAL_PREDIO', 'embargo', 'Embargo', 2),
  ('ESTADO_LEGAL_PREDIO', 'sucesion_iliquida', 'Sucesión Ilíquida', 3);

alter table public.inmuebles add column estado_legal_id bigint references public.lista_tipos (id);
alter table public.inmuebles add column estado_legal_observaciones text;
alter table public.inmuebles add column habitabilidad_id bigint references public.lista_tipos (id);

create index inmuebles_estado_legal_idx on public.inmuebles (estado_legal_id) where estado_legal_id is not null;
create index inmuebles_habitabilidad_idx on public.inmuebles (habitabilidad_id) where habitabilidad_id is not null;

comment on column public.inmuebles.estado_legal_id is
  'FK lista_tipos, familia ESTADO_LEGAL_PREDIO. NULL = sin novedad jurídica.';
comment on column public.inmuebles.habitabilidad_id is
  'FK lista_tipos, familia HABITABILIDAD_PREDIO. Eje independiente de estado_legal_id — '
  'un inmueble puede ser habitable y estar embargado a la vez.';

-- ── corrige HABITABILIDAD_PREDIO: 2 códigos deben nacer inactivos ──────
-- El seed de 20260814180000 insertó los 6 valores sin columna `activo`
-- explícita (default true) — nunca se corrigió que litigio_disputa_legal
-- e inactivo_sin_titular no deben ofrecerse en el <select> de
-- habitabilidad: esa información vive en estado_legal_id (el primero) y
-- en v_inmuebles_sin_titular (el segundo, T0.5), no aquí.
update public.lista_tipos
set activo = false
where tipo = 'HABITABILIDAD_PREDIO'
  and codigo in ('litigio_disputa_legal', 'inactivo_sin_titular')
  and tenant_id is null;
