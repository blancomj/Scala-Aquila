-- ═══════════════════════════════════════════════════════════════════════
--  inmuebles.referencia_catastral / gravamen_tipo_id
--
--  Referencia catastral: identificador del predio ante la autoridad
--  catastral municipal — texto libre, sin validación de formato (varía
--  por municipio/departamento, no hay un estándar nacional único).
--
--  Tipo de gravamen: FK a TIPO_GRAVAMEN (ya sembrada en
--  20260814180000_seed_catalogo_referencia.sql — ninguno/hipotecario/
--  leasing — hasta ahora sin columna que la consumiera). Cuando es
--  distinto de "ninguno", la UI exige capturar un tercero asociado con
--  rol PERSONA_PREDIO.locatario (el ocupante bajo el contrato de leasing
--  o hipoteca con tenencia, distinto del propietario registrado y de un
--  arrendatario de arriendo común) — se valida en el formulario, no acá:
--  el flujo de creación guarda el inmueble antes de asociar personas, así
--  que un constraint sincrónico en esta tabla rompería ese orden.
-- ═══════════════════════════════════════════════════════════════════════

alter table public.inmuebles add column referencia_catastral text;
alter table public.inmuebles add column gravamen_tipo_id bigint references public.lista_tipos (id);

create index inmuebles_gravamen_tipo_idx on public.inmuebles (gravamen_tipo_id) where gravamen_tipo_id is not null;

comment on column public.inmuebles.referencia_catastral is
  'Identificador del predio ante la autoridad catastral municipal. Texto libre, sin '
  'validación de formato.';
comment on column public.inmuebles.gravamen_tipo_id is
  'FK lista_tipos, familia TIPO_GRAVAMEN (ninguno/hipotecario/leasing). NULL = sin '
  'gravamen registrado. Si es distinto de "ninguno", la UI exige un tercero asociado '
  'con rol PERSONA_PREDIO.locatario.';

-- ── PERSONA_PREDIO.locatario — nuevo rol, no existía ────────────────────
-- Ocupante bajo un contrato de leasing/hipoteca con tenencia — distinto de
-- "arrendatario" (arrendamiento común) e "inquilino": acá quien ocupa no es
-- dueño ni arrendatario regular, es locatario de un leasing financiero o
-- garantía hipotecaria con tenencia.
insert into public.lista_tipos (tipo, codigo, nombre, orden) values
  ('PERSONA_PREDIO', 'locatario', 'Locatario', 7);
