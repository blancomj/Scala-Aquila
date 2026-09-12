-- ═══════════════════════════════════════════════════════════════════════
--  EXS-6 · Marketplace (2/4) — la publicación
--
--  DOS IDENTIDADES DISTINTAS, y confundirlas sería el error del corte:
--
--    · publicador_tercero_id — DE QUIÉN es el aviso. Un tercero que ya
--      existe (EXS-1 §2.1: no se crea un segundo modelo de identidad).
--      NUNCA viaja al listado.
--    · creado_por            — QUIÉN lo capturó. Hoy siempre un miembro
--      del staff, porque el residente todavía no tiene por dónde entrar.
--
--  Y una tercera, que es la única pública:
--
--    · identidad_publica     — CÓMO se firma el aviso. Texto libre
--      deliberado ("Juan P.", "Residente Torre 3", "Panadería La Espiga"),
--      porque el nivel de identidad que cada quien acepta mostrar es una
--      decisión suya y no una propiedad derivable de su ficha (§7).
--
--  NO HAY COLUMNA DE CONTACTO. Es intencional (§15, §22): la publicación
--  no revela teléfono ni correo, y quien quiera hablar deja un interés. Ese
--  es el único canal, y es también lo que hace verdad la decisión de
--  producto de que la copropiedad no intervenga en la transacción: pone en
--  contacto y se aparta.
-- ═══════════════════════════════════════════════════════════════════════

create table public.publicaciones (
  id                  uuid primary key default gen_random_uuid(),
  tenant_id           uuid not null references public.tenants (id) on delete cascade,

  publicador_tercero_id uuid not null references public.terceros (id),
  identidad_publica   text not null,

  tipo_id             bigint not null references public.lista_tipos (id),
  categoria_id        bigint not null references public.lista_tipos (id),
  condicion_id        bigint references public.lista_tipos (id),

  titulo              text not null,
  descripcion         text,

  -- Dinero informativo (§10, y la decisión de producto de Johnny). Es
  -- numeric(18,2) como todo importe del repositorio —nunca float—, pero NO
  -- pasa por financial-kernel ni genera asiento, cuenta por cobrar,
  -- factura, recaudo ni retención: no es una obligación de nadie, es el
  -- número que el vecino escribió en su aviso.
  precio              numeric(18, 2),
  moneda              char(3) not null default 'COP',
  negociable          boolean not null default true,

  estado              public.publicacion_estado_t not null default 'borrador',
  origen              public.publicacion_origen_t not null,

  publicada_at        timestamptz,
  vigente_hasta       date,
  cerrada_at          timestamptz,
  motivo_cierre       text,

  aprobada_por        uuid references public.profiles (id),
  aprobada_at         timestamptz,
  motivo_rechazo      text,

  created_at          timestamptz not null default now(),
  creado_por          uuid references public.profiles (id),
  updated_at          timestamptz,

  constraint publicaciones_titulo_no_vacio check (btrim(titulo) <> ''),
  constraint publicaciones_identidad_no_vacia check (btrim(identidad_publica) <> ''),
  constraint publicaciones_precio_no_negativo check (precio is null or precio >= 0),
  constraint publicaciones_rechazo_con_motivo check (
    estado <> 'rechazada'
    or (motivo_rechazo is not null and btrim(motivo_rechazo) <> '')
  ),
  constraint publicaciones_publicada_con_fecha check (
    (estado in ('publicada', 'pausada', 'cerrada', 'expirada')) = (publicada_at is not null)
  ),
  constraint publicaciones_cierre_coherente check (
    (estado = 'cerrada') = (cerrada_at is not null)
  )
);

create index publicaciones_tenant_estado_idx on public.publicaciones (tenant_id, estado);
create index publicaciones_publicador_idx on public.publicaciones (publicador_tercero_id);
-- Para el listado: lo que hoy se ve, ordenado por lo más reciente.
create index publicaciones_visibles_idx
  on public.publicaciones (tenant_id, publicada_at desc)
  where estado = 'publicada';
-- Para el barrido de vencimiento.
create index publicaciones_vencimiento_idx
  on public.publicaciones (vigente_hasta)
  where estado = 'publicada' and vigente_hasta is not null;

alter table public.publicaciones enable row level security;
alter table public.publicaciones force row level security;

-- Ver el tablón es de cualquier miembro con acceso al módulo. La RLS NO
-- distingue entre publicada y borrador: eso lo hace fn_marketplace_listar,
-- porque el equipo administrativo sí necesita ver los borradores y lo
-- pendiente de aprobar para poder trabajarlos.
create policy publicaciones_select_miembro on public.publicaciones
  for select
  using (public.is_member(tenant_id) and public.puede_ver_modulo(tenant_id, 'marketplace'));

create policy publicaciones_insert_agente on public.publicaciones
  for insert
  with check (public.has_role(tenant_id, array['auxiliar', 'administrador']::public.tenant_role_t[]));

create policy publicaciones_update_agente on public.publicaciones
  for update
  using (public.has_role(tenant_id, array['auxiliar', 'administrador']::public.tenant_role_t[]));

-- Sin delete: una publicación se cierra, y lo que se publicó en el tablón
-- de la copropiedad queda como evidencia de qué se ofreció y cuándo.

comment on table public.publicaciones is
  'EXS-6 — el tablón de avisos de la copropiedad. La copropiedad NO interviene en la transacción '
  '(decisión de producto, 2026-09-12): no hay orden, carrito, pago, comisión ni asiento, y el '
  'precio es informativo. Facilita publicación → descubrimiento → interés → negociación externa, '
  'y ahí se aparta (prompt 05 §3).';

comment on column public.publicaciones.publicador_tercero_id is
  'De quién es el aviso. Un tercero que YA existe — no se crea un segundo modelo de identidad '
  '(§2.1). Nunca viaja al listado: lo público es identidad_publica.';

comment on column public.publicaciones.identidad_publica is
  'Cómo se firma el aviso ("Juan P.", "Residente Torre 3", "Panadería La Espiga"). Texto libre a '
  'propósito: cuánta identidad acepta mostrar cada quien es decisión suya, no algo derivable de '
  'su ficha de tercero (§7).';

comment on column public.publicaciones.precio is
  'Informativo. numeric(18,2) como todo importe del repositorio —jamás float—, pero NO entra a '
  'financial-kernel ni genera asiento, cuenta por cobrar, factura ni recaudo: no es la obligación '
  'de nadie, es el número que el vecino escribió en su aviso (§10).';

comment on column public.publicaciones.origen is
  'Quién originó la publicación, sellado por el guard al crearla. Gobierna quién puede aprobarla.';

comment on column public.publicaciones.vigente_hasta is
  'Cuándo deja de aparecer en el tablón. El paso a ''expirada'' lo hace un barrido, no la visita '
  'de un usuario a una pantalla (§17).';

-- ── Fotos: columna FK en documentos, no tabla de media propia ─────────
--
--  Mismo movimiento que los adjuntos de anuncios en EXS-3: `documentos`
--  resuelve el vínculo con FKs nullable por dominio (inmueble_id, pago_id,
--  caso_juridico_id, envio_id, anuncio_id). Se añade una más.

alter table public.documentos
  add column publicacion_id uuid references public.publicaciones (id) on delete cascade;

create index documentos_publicacion_idx on public.documentos (publicacion_id)
  where publicacion_id is not null;

comment on column public.documentos.publicacion_id is
  'EXS-6 — foto de una publicación del marketplace. Sigue el patrón de columna FK por dominio de '
  'esta tabla; no se creó una tabla de media propia.';
