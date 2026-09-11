-- ═══════════════════════════════════════════════════════════════════════
--  EXS-3 · Anuncios y comunicación oficial (1/5) — vocabulario
--  Casos de uso/Experiencia y servicios/EXS_03_INFORME.md
--
--  CATEGORIA_ANUNCIO y PRIORIDAD_ANUNCIO van a lista_tipos (D-24): ninguna
--  gatilla transición ni cálculo — clasifican y ordenan. Son además el
--  caso de libro del prompt 02 §5: "preferir catálogo si pueden cambiar,
--  requieren configuración por tenant, orden, color/icono, activarse o
--  desactivarse". lista_tipos da las cuatro cosas.
--
--  PRIORIDAD_ANUNCIO no reutiliza PRIORIDAD_NOTIFICACION (EXS-2), a
--  propósito y por el mismo criterio con que MANT-7 no reutilizó
--  SEVERIDAD_INCIDENCIA: dominios distintos y valores distintos. La
--  prioridad de un aviso in-app dice cuánto destaca en la campana
--  (informativa/importante/critica); la de un anuncio dice qué tan urgente
--  es la comunicación oficial (el prompt 02 §6 pide normal/importante/
--  urgente/critica). Fusionarlas obligaría a que un cambio en una
--  arrastrara a la otra.
--
--  anuncio_estado_t SÍ es enum nativo: gobierna transiciones reales,
--  custodiadas por guard_anuncio_transicion — es exactamente el caso que
--  D-24 admite.
-- ═══════════════════════════════════════════════════════════════════════

insert into public.tipos (codigo, nombre, descripcion) values
  ('CATEGORIA_ANUNCIO', 'Categoría de anuncio',
   'De qué trata una comunicación oficial (EXS-3 §5) — descriptivo. No condiciona quién la ve: '
   'eso lo decide la audiencia (anuncio_audiencia), nunca la categoría.'),
  ('PRIORIDAD_ANUNCIO', 'Prioridad de anuncio',
   'Urgencia de una comunicación oficial (EXS-3 §6). Deliberadamente separada de la categoría: '
   'un anuncio de seguridad puede ser rutinario y uno financiero urgente (prompt 02 §6).')
on conflict (codigo) do nothing;

insert into public.lista_tipos (tipo, codigo, nombre, orden) values
  ('CATEGORIA_ANUNCIO', 'general', 'General', 10),
  ('CATEGORIA_ANUNCIO', 'seguridad', 'Seguridad', 20),
  ('CATEGORIA_ANUNCIO', 'mantenimiento', 'Mantenimiento', 30),
  ('CATEGORIA_ANUNCIO', 'financiero', 'Financiero', 40),
  ('CATEGORIA_ANUNCIO', 'gobierno', 'Gobierno', 50),
  ('CATEGORIA_ANUNCIO', 'convivencia', 'Convivencia', 60),
  ('CATEGORIA_ANUNCIO', 'emergencia', 'Emergencia', 70),
  ('CATEGORIA_ANUNCIO', 'operativo', 'Operativo', 80),
  ('CATEGORIA_ANUNCIO', 'comercial', 'Comercial', 90),

  ('PRIORIDAD_ANUNCIO', 'normal', 'Normal', 10),
  ('PRIORIDAD_ANUNCIO', 'importante', 'Importante', 20),
  ('PRIORIDAD_ANUNCIO', 'urgente', 'Urgente', 30),
  ('PRIORIDAD_ANUNCIO', 'critica', 'Crítica', 40);

-- El tipo de notificación que emite este módulo cuando un anuncio se
-- publica. Cada corte EXS siembra los suyos (EXS-2, informe §4).
insert into public.lista_tipos (tipo, codigo, nombre, orden) values
  ('TIPO_NOTIFICACION', 'anuncio_publicado', 'Anuncio publicado', 40);

create type public.anuncio_estado_t as enum (
  'borrador',
  'pendiente_revision',
  'aprobado',
  'programado',
  'publicado',
  'archivado',
  'rechazado',
  'cancelado'
);

comment on type public.anuncio_estado_t is
  'Ciclo de vida de una comunicación oficial (EXS-3). Enum nativo y no lista_tipos (D-24) porque '
  'cada valor gatilla reglas duras en guard_anuncio_transicion: qué transiciones son legales, '
  'quién puede hacerlas (aprobar exige administrador y prohíbe auto-aprobación) y qué columnas '
  'quedan inmutables tras publicar. Es la máquina de estados, no vocabulario. '
  '"rechazado" devuelve a borrador por decisión del revisor; "cancelado" mata un anuncio que '
  'nunca llegó a publicarse; "archivado" retira uno publicado sin borrarlo (prompt 02 §48: no '
  'usar DELETE como mecanismo normal).';
