-- ═══════════════════════════════════════════════════════════════════════
--  Estado de cuenta: se aloja en la app Nuxt, no en supabase.co
--  Propietario: seguimiento de 20260822100000/20260822110000
--
--  Confirmado empíricamente (curl a la función desplegada): el gateway de
--  Supabase Edge Functions fuerza `Content-Type: text/plain` +
--  `Content-Security-Policy: sandbox` en CUALQUIER respuesta, sin importar
--  los headers que ponga la función — mismo control anti-XSS que ya se
--  vio en Storage (20260822110000), pero a nivel de toda la plataforma.
--  No hay forma de servir una página HTML renderizable desde
--  *.supabase.co, ni por Storage ni por Edge Function. La página vive
--  ahora en apps/web/app/pages/estado-cuenta/[id].vue (servida por
--  nuestro propio servidor Nuxt, sin esa restricción).
--
--  Con eso, `generar-estado-cuenta` deja de necesitar service_role — ya
--  no escribe a Storage, solo inserta una fila con los datos del ledger
--  (jsonb). Se elimina esa Edge Function; el store hace el insert directo
--  por RLS (agent), mismo patrón que coeficientes.ts/copropiedad.ts.
--  `ver-estado-cuenta` se queda (sigue siendo la única forma de que un
--  residente sin sesión, AD-26, lea esta fila — el SELECT normal exige
--  is_member()) pero ahora devuelve JSON, no HTML.
--
--  storage_path deja de tener sentido (no se sube nada a Storage) — se
--  reemplaza por datos jsonb con el ledger completo. El bucket
--  estados-cuenta queda sin uso pero no se borra en esta migración (bajo
--  riesgo dejarlo, evita tocar storage.buckets/objects sin necesidad).
-- ═══════════════════════════════════════════════════════════════════════

-- Solo había filas de prueba de esta sesión (tabla sin consumidor real
-- todavía) — se limpian antes de cambiar la forma de la tabla.
delete from public.estados_cuenta_generados;

alter table public.estados_cuenta_generados
  drop column storage_path,
  add column datos jsonb not null;

comment on column public.estados_cuenta_generados.datos is
  'Ledger completo (tenant, inmueble, movimientos, saldo final) calculado al momento de '
  'generar — snapshot inmutable, no se recalcula al leer (mismo criterio que liquidaciones).';

create policy estados_cuenta_generados_insert_agent
  on public.estados_cuenta_generados for insert
  to authenticated
  with check (public.has_role(tenant_id, array['agent']::public.tenant_role_t[]));
