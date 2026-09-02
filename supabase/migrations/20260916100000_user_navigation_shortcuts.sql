-- ═══════════════════════════════════════════════════════════════════════
--  Accesos directos del sidebar — shortcuts de navegación por usuario
--
--  Almacena los accesos directos personalizados que cada usuario
--  configura en el sidebar. Es un JSONB en profiles (no tabla nueva)
--  porque:
--    • La RLS ya está cubierta por profiles_select_propio
--    • El conjunto es flexible y no necesita foreign keys
--    • Se carga junto con el perfil en una sola query
--
--  Shape del JSONB:
--  [
--    {
--      "to": "/inmuebles",          -- ruta del NavItem
--      "label": "Mis inmuebles",    -- label personalizado
--      "icono": "inmuebles",        -- clave del catálogo SHORTCUT_ICONOS
--      "orden": 0                   -- posición (0 = primero)
--    }
--  ]
--
--  Límite: 12 shortcuts por tenant por usuario (validado en app, no en BD).
-- ═══════════════════════════════════════════════════════════════════════

-- Columna JSONB con default array vacío. No NOT NULL inicialmente para
-- no bloquear filas existentes; se refuerza después.
alter table public.profiles
  add column navigation_shortcuts jsonb not null default '[]'::jsonb;

comment on column public.profiles.navigation_shortcuts is
  'Accesos directos del sidebar del usuario. Array de objetos '
  '{to, label, icono, orden} — JSONB porque el conjunto es flexible '
  'y no necesita foreign keys ni indexación compleja.';
