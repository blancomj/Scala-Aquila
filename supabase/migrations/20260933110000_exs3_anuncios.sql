-- ═══════════════════════════════════════════════════════════════════════
--  EXS-3 · Anuncios (2/5) — el dominio
--
--  Qué NO es este corte, verificado antes de construirlo:
--    · gobierno_convocatorias está atada a reunion_id — convoca a una
--      reunión, no comunica algo general. No solapa.
--    · el compositor de correo (plantillas_compositor +
--      enviar-correo-compositor) manda a UN destinatario suelto, sin
--      segmentación ni ciclo de vida. Tampoco solapa.
--  Anuncios es dominio nuevo legítimo. Lo que sí reutiliza, entero:
--  gobierno_segmento_destinatarios (audiencia), documentos (adjuntos),
--  COM-1 (despacho) y fn_notificar (aviso in-app).
--
--  AUDIENCIA DECLARATIVA, NO MATERIALIZADA (prompt 02 §13). No se guarda
--  un destinatario por persona al publicar: se guardan las REGLAS
--  (criterio, valor) y se resuelven contra datos vivos cuando hace falta.
--  Una copropiedad de 500 unidades con 40 anuncios al año generaría 20.000
--  filas muertas que además envejecen mal — un propietario que vendió
--  seguiría "siendo destinatario" de un anuncio de hace ocho meses.
-- ═══════════════════════════════════════════════════════════════════════

create table public.anuncios (
  id                    uuid primary key default gen_random_uuid(),
  tenant_id             uuid not null references public.tenants (id) on delete cascade,

  categoria_id          bigint not null references public.lista_tipos (id),
  prioridad_id          bigint not null references public.lista_tipos (id),

  titulo                text not null,
  resumen               text,
  contenido             text not null,

  estado                public.anuncio_estado_t not null default 'borrador',

  -- Consecutivo oficial. Nulo hasta publicar, a propósito: numerar al
  -- crear quemaría números en borradores descartados y dejaría huecos en
  -- una serie que debe poder citarse (mismo criterio que GOB-5 con las
  -- decisiones).
  numero                integer,
  anio                  smallint,

  -- Programación y vigencia son cosas distintas (prompt 02 §15): cuándo se
  -- publica vs. durante cuánto tiempo lo publicado sigue vigente.
  publicar_at           timestamptz,
  publicado_at          timestamptz,
  vigente_desde         timestamptz,
  vigente_hasta         timestamptz,

  requiere_confirmacion boolean not null default false,

  motivo_rechazo        text,

  creado_por            uuid references public.profiles (id),
  created_at            timestamptz not null default now(),
  revisado_por          uuid references public.profiles (id),
  revisado_at           timestamptz,
  publicado_por         uuid references public.profiles (id),
  updated_at            timestamptz,

  constraint anuncios_titulo_no_vacio check (btrim(titulo) <> ''),
  constraint anuncios_contenido_no_vacio check (btrim(contenido) <> ''),
  -- prompt 02 §46: vigencia coherente.
  constraint anuncios_vigencia_coherente check (
    vigente_hasta is null or vigente_desde is null or vigente_hasta >= vigente_desde
  ),
  -- El consecutivo va completo o no va: un número sin año no identifica nada.
  constraint anuncios_consecutivo_completo check ((numero is null) = (anio is null)),
  -- Publicado exige número y fecha; sin publicar no puede haber ninguno de los dos.
  constraint anuncios_publicado_con_numero check (
    (estado in ('publicado', 'archivado')) = (numero is not null and publicado_at is not null)
  ),
  constraint anuncios_rechazo_con_motivo check (
    estado <> 'rechazado' or (motivo_rechazo is not null and btrim(motivo_rechazo) <> '')
  )
);

create unique index anuncios_consecutivo_idx
  on public.anuncios (tenant_id, anio, numero)
  where numero is not null;

create index anuncios_tenant_estado_idx on public.anuncios (tenant_id, estado, publicado_at desc);
-- Para el job de publicación programada: solo mira los que puede publicar.
create index anuncios_programados_idx on public.anuncios (publicar_at)
  where estado = 'programado';

alter table public.anuncios enable row level security;
alter table public.anuncios force row level security;

-- Lectura: miembro con acceso al módulo. Los borradores ajenos también se
-- ven — es comunicación institucional, no correspondencia privada, y la
-- revisión exige justamente poder leer lo que otro redactó.
create policy anuncios_select_miembro on public.anuncios
  for select
  using (public.is_member(tenant_id) and public.puede_ver_modulo(tenant_id, 'anuncios'));

create policy anuncios_insert_agente on public.anuncios
  for insert
  with check (
    public.has_role(tenant_id, array['auxiliar', 'administrador']::public.tenant_role_t[])
    and public.puede_ver_modulo(tenant_id, 'anuncios')
  );

-- El update queda abierto a auxiliar/administrador aquí, y es
-- guard_anuncio_transicion quien decide de verdad qué se puede cambiar y
-- quién puede hacerlo. La RLS no sabe de estados anteriores; un trigger sí.
create policy anuncios_update_agente on public.anuncios
  for update
  using (
    public.has_role(tenant_id, array['auxiliar', 'administrador']::public.tenant_role_t[])
    and public.puede_ver_modulo(tenant_id, 'anuncios')
  );

-- Sin policy de delete: prompt 02 §48 — archivar o cancelar, nunca borrar.

comment on table public.anuncios is
  'EXS-3 — comunicación oficial de la copropiedad. Ciclo de vida en anuncio_estado_t, custodiado '
  'por guard_anuncio_transicion (incluida la segregación: quien redacta no aprueba). La audiencia '
  'vive en anuncio_audiencia como reglas, no como destinatarios materializados. Sin policy de '
  'delete a propósito.';

comment on column public.anuncios.numero is
  'Consecutivo oficial por (tenant, año), asignado al PUBLICAR vía fn_anuncio_siguiente_numero. '
  'Nulo mientras no se publique: numerar al crear quemaría números en borradores descartados.';

comment on column public.anuncios.vigente_hasta is
  'Hasta cuándo el anuncio sigue siendo contenido vigente. Distinto de publicado_at (prompt 02 '
  '§15) y de archivado: al expirar deja de listarse como vigente, pero no se borra ni cambia de '
  'estado — el histórico se conserva (§17/§49).';

-- ── Audiencia: reglas, no destinatarios ────────────────────────────────

create table public.anuncio_audiencia (
  id         uuid primary key default gen_random_uuid(),
  anuncio_id uuid not null references public.anuncios (id) on delete cascade,
  criterio   text not null,
  valor      text,

  -- Los criterios son exactamente los que gobierno_segmento_destinatarios
  -- ya sabe resolver (GOB-9): no se inventa un vocabulario paralelo. Si
  -- esa función aprende criterios nuevos, aquí solo se amplía el check.
  constraint anuncio_audiencia_criterio_valido check (
    criterio in ('agrupacion', 'calidad', 'inmueble', 'miembro_organo', 'cartera_mora')
  ),
  constraint anuncio_audiencia_valor_requerido check (
    criterio = 'cartera_mora' or (valor is not null and btrim(valor) <> '')
  ),
  unique (anuncio_id, criterio, valor)
);

alter table public.anuncio_audiencia enable row level security;
alter table public.anuncio_audiencia force row level security;

create policy anuncio_audiencia_select_miembro on public.anuncio_audiencia
  for select
  using (exists (
    select 1 from public.anuncios a
    where a.id = anuncio_id
      and public.is_member(a.tenant_id)
      and public.puede_ver_modulo(a.tenant_id, 'anuncios')
  ));

create policy anuncio_audiencia_write_agente on public.anuncio_audiencia
  for all
  using (exists (
    select 1 from public.anuncios a
    where a.id = anuncio_id
      and public.has_role(a.tenant_id, array['auxiliar', 'administrador']::public.tenant_role_t[])
  ))
  with check (exists (
    select 1 from public.anuncios a
    where a.id = anuncio_id
      and public.has_role(a.tenant_id, array['auxiliar', 'administrador']::public.tenant_role_t[])
  ));

comment on table public.anuncio_audiencia is
  'EXS-3 — reglas de audiencia de un anuncio, en el mismo vocabulario que '
  'gobierno_segmento_destinatarios (GOB-9) sabe resolver. CERO filas = toda la copropiedad: la '
  'ausencia de restricción ES la regla más amplia, y así no hace falta un criterio "todos" que '
  'duplicaría el significado del conjunto vacío.';

-- ── Lectura y confirmación ─────────────────────────────────────────────

create table public.anuncio_lectura (
  anuncio_id     uuid not null references public.anuncios (id) on delete cascade,
  user_id        uuid not null references auth.users (id) on delete cascade,
  leido_at       timestamptz not null default now(),
  confirmado_at  timestamptz,

  primary key (anuncio_id, user_id)
);

alter table public.anuncio_lectura enable row level security;
alter table public.anuncio_lectura force row level security;

create policy anuncio_lectura_select_propia on public.anuncio_lectura
  for select
  using (user_id = (select auth.uid()));

-- Quien publica necesita saber cuántos leyeron y confirmaron, sin ver
-- quién en particular — eso lo da fn_anuncio_metricas (agregado). Por eso
-- esta policy es estrictamente "lo mío".

create policy anuncio_lectura_insert_propia on public.anuncio_lectura
  for insert
  with check (
    user_id = (select auth.uid())
    and exists (
      select 1 from public.anuncios a
      where a.id = anuncio_id
        and a.estado in ('publicado', 'archivado')
        and public.is_member(a.tenant_id)
        and public.puede_ver_modulo(a.tenant_id, 'anuncios')
    )
  );

-- Confirmar es el único update permitido, y solo sobre la propia fila.
create policy anuncio_lectura_update_propia on public.anuncio_lectura
  for update
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

comment on table public.anuncio_lectura is
  'EXS-3 — evidencia de lectura por usuario. Abrir (leido_at) y confirmar (confirmado_at) son '
  'distintos a propósito (prompt 02 §20): la confirmación es un acto explícito, no un efecto de '
  'haber abierto. Solo se registran lecturas; la ausencia de fila es el no leído (§18, '
  'estrategia B) — no se materializa un destinatario por persona al publicar.';

-- ── Adjuntos: una columna en documentos, no una tabla propia ───────────
--
--  documentos resuelve el vínculo con FKs nullable por dominio
--  (inmueble_id, pago_id, caso_juridico_id, envio_id). Se sigue ese patrón
--  en vez de crear anuncio_adjuntos o un vínculo polimórfico genérico
--  (EXS-1 §5, diagnóstico §2.4).

alter table public.documentos
  add column anuncio_id uuid references public.anuncios (id) on delete cascade;

create index documentos_anuncio_idx on public.documentos (anuncio_id) where anuncio_id is not null;

comment on column public.documentos.anuncio_id is
  'EXS-3 — adjunto de un anuncio. Sigue el patrón de columna FK por dominio de esta tabla; no se '
  'creó una tabla de media propia.';
