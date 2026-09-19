-- ═══════════════════════════════════════════════════════════════════════
--  Catálogo `modulo` — cierra el hueco de `rol_funcional_modulo.modulo`
--  como texto libre (20260830120000). Auditoría "Permisos: cerrar la capa
--  2" (Casos de uso/Seguridad Usuarios Roles/PROMPT_PERMISOS_CAPA2.md §A1).
--
--  Un typo en `rol_funcional_modulo.modulo` hoy crea un portón que nunca
--  se cierra y nadie se entera (falla en abierto, en silencio), y no hay
--  de dónde sacar la lista para poblar un selector en el builder de roles
--  funcionales (seguridad/index.vue). Este catálogo resuelve ambas cosas
--  con una FK.
--
--  Siembra: los 10 códigos de módulo verificados en uso HOY, no una lista
--  aspiracional — grep de `puede_ver_modulo(tenant_id, '...')` y de
--  `p_modulo => '...'` (fn_notificar) en todas las migraciones existentes:
--  financiero, cartera_cobranza, juridico, estado_cuenta, movilidad,
--  marketplace, anuncios (con portón y con rol que los cubre, series
--  20260830xxx/EXS), mantenimiento y porteria (con rol que los "cubre" en
--  rol_funcional_modulo pero sin ninguna política que los gatee todavía —
--  mapeos vivos aunque sin efecto, PROMPT_PERMISOS_CAPA2.md §1.3/§B4,
--  decisión del usuario: no se tocan en este corte) y gobierno (usado por
--  `notificaciones.modulo`, 20260933010000, deliberadamente SIN fila en
--  `rol_funcional_modulo` — comentario explícito en 20260933030000: no
--  existe ningún rol funcional de gobierno, así que hoy solo lo ven
--  administradores y quien no tenga ningún rol funcional asignado).
--
--  Lectura para todo miembro autenticado; sin política de escritura —
--  mismo patrón que `rol_funcional_modulo` (solo plataforma, vía
--  migración/service_role): el catálogo de módulos lo define el producto,
--  un tenant no puede inventar un módulo que no existe en el código.
-- ═══════════════════════════════════════════════════════════════════════

create table public.modulo (
  codigo      text primary key,
  nombre      text not null,
  descripcion text,
  orden       int  not null default 0,
  activo      boolean not null default true
);

alter table public.modulo enable row level security;
alter table public.modulo force row level security;

create policy modulo_select_authenticated
  on public.modulo for select
  to authenticated
  using (true);

comment on table public.modulo is
  'Catálogo de módulos restringibles por rol funcional (puede_ver_modulo). Existe para que un '
  'typo en rol_funcional_modulo.modulo sea imposible (FK) y para que el builder de roles '
  'funcionales (seguridad/index.vue) tenga de dónde listar opciones. Sin política de escritura: '
  'lo define el producto en migraciones, no un tenant.';

insert into public.modulo (codigo, nombre, descripcion, orden) values
  ('financiero',        'Financiero',            'Presupuesto, políticas financieras y fondos.', 1),
  ('cartera_cobranza',  'Cartera / Cobranza',     'Etapas de mora, acciones de cobranza y acuerdos de pago.', 2),
  ('estado_cuenta',     'Estado de cuenta',       'Cargos, pagos y novedades del estado de cuenta.', 3),
  ('juridico',          'Jurídico',               'Casos jurídicos, certificaciones de deuda y costas judiciales.', 4),
  ('mantenimiento',     'Mantenimiento',          'Activos, inventario e inspecciones de mantenimiento.', 5),
  ('porteria',          'Portería',               'Autorizaciones de visita y control de acceso.', 6),
  ('movilidad',         'Movilidad',              'Vehículos y visitantes que llegan en uno.', 7),
  ('anuncios',          'Anuncios',               'Comunicación oficial a la copropiedad.', 8),
  ('marketplace',       'Marketplace',            'Tablón de publicaciones entre residentes.', 9),
  ('gobierno',          'Gobierno',               'Órganos de gobierno, asamblea y vencimientos legales.', 10);

-- ── FK desde el mapeo rol→módulo ────────────────────────────────────────
alter table public.rol_funcional_modulo
  add constraint rol_funcional_modulo_modulo_fk
  foreign key (modulo) references public.modulo (codigo);

-- ── v_modulo_cobertura — informe consultable, no un hallazgo de una vez ─
--  Cruza portones (módulos con al menos un rol funcional que los cubra en
--  rol_funcional_modulo) para que el builder pueda avisar "nadie puede ver
--  X salvo administradores" sin depender de que alguien vuelva a auditarlo
--  a mano. `security_invoker = true`: hereda la RLS de `modulo` (lectura
--  para todo miembro autenticado), mismo patrón que vr_cartera_inmueble
--  (20260938020000).
create view public.v_modulo_cobertura with (security_invoker = true) as
select
  m.codigo,
  m.nombre,
  m.orden,
  exists (
    select 1 from public.rol_funcional_modulo rfm where rfm.modulo = m.codigo
  ) as tiene_rol_que_lo_cubre
from public.modulo m
where m.activo
order by m.orden;

comment on view public.v_modulo_cobertura is
  'PROMPT_PERMISOS_CAPA2.md §A2 — cruza modulo contra rol_funcional_modulo para que el builder '
  'de roles funcionales muestre qué módulos quedarían visibles solo para administradores. No se '
  'usa para corregir huecos automáticamente: mantenimiento/porteria/gobierno aparecen sin '
  'cobertura por decisión ya tomada (B4) o por diseño (gobierno), no por accidente.';
