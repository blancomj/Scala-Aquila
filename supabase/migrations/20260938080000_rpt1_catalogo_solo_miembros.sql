-- ═══════════════════════════════════════════════════════════════════════
--  RPT-01 · el catálogo se lee solo desde dentro de una copropiedad
--
--  La política de reporte_campos nació como `using (true)` y la hizo saltar
--  el guardia de AD-37 §5 (tests/external/identidad-actor-externo.test.ts,
--  caso 11), que vigila que la lectura abierta para `authenticated` quede
--  reservada a catálogos globales sin dato de negocio.
--
--  El guardia contempla añadir un catálogo nuevo a su lista permitida "de
--  forma consciente". Aquí se toma la decisión contraria, que es más
--  estricta y no cuesta nada: el catálogo del motor NO se abre.
--
--  Razón: desde EXT-01 existen usuarios `authenticated` que NO son miembros
--  de ninguna copropiedad — los actores externos del portal (propietarios,
--  proveedores). Un actor externo no ejecuta reportes, así que tampoco
--  tiene por qué poder enumerar las fuentes del motor, sus campos ni las
--  etiquetas de negocio que exponen. No es un dato sensible, pero es
--  superficie que no compra nada.
--
--  `es_miembro_de_alguna_copropiedad()` es la versión sin tenant de
--  `is_member()`: misma tabla, mismo criterio de membresía activa, y
--  SECURITY DEFINER por el mismo motivo que ella — si la subconsulta a
--  `memberships` dependiera de la RLS del invocador, la política se
--  evaluaría distinto según quién mire.
-- ═══════════════════════════════════════════════════════════════════════

create function public.es_miembro_de_alguna_copropiedad()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.memberships m
    where m.user_id = (select auth.uid())
      and m.status = 'active'
  )
$$;

revoke execute on function public.es_miembro_de_alguna_copropiedad() from public, anon;
grant execute on function public.es_miembro_de_alguna_copropiedad() to authenticated;

comment on function public.es_miembro_de_alguna_copropiedad() is
  'is_member() sin tenant: ¿esta sesión pertenece a ALGUNA copropiedad? Para catálogos globales '
  'que no deben quedar abiertos a todo `authenticated` — desde EXT-01 hay sesiones autenticadas '
  'que no son miembros de ninguna copropiedad (actores externos del portal).';

drop policy reporte_fuentes_select_authenticated on public.reporte_fuentes;
drop policy reporte_campos_select_authenticated on public.reporte_campos;

create policy reporte_fuentes_select_miembro
  on public.reporte_fuentes for select
  to authenticated
  using (activa and public.es_miembro_de_alguna_copropiedad());

create policy reporte_campos_select_miembro
  on public.reporte_campos for select
  to authenticated
  using (public.es_miembro_de_alguna_copropiedad());
