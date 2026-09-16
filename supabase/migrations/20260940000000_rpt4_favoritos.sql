-- ═══════════════════════════════════════════════════════════════════════
--  RPT-04 · Favoritos del Centro de Reportes
--  (PLAN_MOTOR_REPORTES.md §6 — "catálogo con búsqueda, categorías,
--   favoritos y recientes")
--
--  Un favorito es PERSONAL, no de la copropiedad: que la administradora
--  marque "Cartera por inmueble" no tiene por qué cambiarle el orden de la
--  pantalla al contador. Por eso la clave primaria es (reporte_id,
--  profile_id) y la política de SELECT solo deja ver las filas propias —
--  nadie, ni el administrador, ve los favoritos de otro. No hay nada
--  auditable aquí: es una preferencia de pantalla.
--
--  «Recientes» NO necesita tabla: sale de `reporte_ejecuciones`, que RPT-01
--  ya escribe en cada corrida con su `ejecutado_por` y su `iniciado_at`.
--  Duplicarlo sería una segunda verdad sobre lo mismo.
--
--  Sobre `tenant_id`: se guarda —como en toda tabla de copropiedad— para
--  que las políticas sigan el patrón `is_member(tenant_id)` y el índice sea
--  directo. Lo que evita una fila incoherente (un reporte del tenant B
--  marcado con el tenant A) es el EXISTS del WITH CHECK, que exige que el
--  reporte sea de ESE mismo tenant. No hace falta FK compuesta: el repo no
--  usa ninguna, y `reporte_versiones` ya resuelve lo mismo con un EXISTS.
--
--  Borrado: cuelga de `reportes` con ON DELETE CASCADE, y `reportes` ya
--  está en el array de `fn_resetear_copropiedad` (RPT-01), así que resetear
--  la copropiedad se lleva los favoritos sin tocar esa función.
-- ═══════════════════════════════════════════════════════════════════════

create table public.reporte_favoritos (
  tenant_id  uuid        not null references public.tenants (id) on delete cascade,
  reporte_id uuid        not null references public.reportes (id) on delete cascade,
  profile_id uuid        not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (reporte_id, profile_id)
);

alter table public.reporte_favoritos enable row level security;
alter table public.reporte_favoritos force row level security;

create index reporte_favoritos_usuario_idx
  on public.reporte_favoritos (tenant_id, profile_id);

comment on table public.reporte_favoritos is
  'RPT-04 — marca personal de un reporte en el Centro de Reportes. Por usuario, no por '
  'copropiedad: nadie ve los favoritos de otro. «Recientes» no tiene tabla propia, sale de '
  'reporte_ejecuciones.';

-- Solo las filas propias. `profile_id = auth.uid()` va primero para que el
-- planificador descarte por índice antes de llamar a is_member().
create policy reporte_favoritos_select_propios
  on public.reporte_favoritos for select
  to authenticated
  using (
    profile_id = (select auth.uid())
    and public.is_member(tenant_id)
  );

create policy reporte_favoritos_insert_propios
  on public.reporte_favoritos for insert
  to authenticated
  with check (
    profile_id = (select auth.uid())
    and public.is_member(tenant_id)
    -- El reporte tiene que ser de ESTE tenant: sin esto se podría guardar
    -- una fila que apunta a un reporte ajeno con un tenant_id propio.
    and exists (
      select 1 from public.reportes r
      where r.id = reporte_favoritos.reporte_id
        and r.tenant_id = reporte_favoritos.tenant_id
    )
  );

create policy reporte_favoritos_delete_propios
  on public.reporte_favoritos for delete
  to authenticated
  using (
    profile_id = (select auth.uid())
    and public.is_member(tenant_id)
  );
