-- ═══════════════════════════════════════════════════════════════════════
--  RPT-05 (3/n) · Bitácora de entregas
--  (PLAN_MOTOR_REPORTES.md §6 — "estados de entrega registrados")
--
--  POR QUÉ NO BASTA `reporte_ejecuciones`
--  ──────────────────────────────────────
--  Una corrida programada produce UN archivo y puede terminar en CINCO
--  buzones, cada uno con su propia suerte: entregado, rebotado, sin correo
--  registrado. `reporte_ejecuciones` (RPT-01) responde «¿se ejecutó y con
--  qué cifras?»; esto responde «¿a quién llegó?», que es la pregunta que se
--  hace cuando alguien dice «a mí nunca me llegó el informe».
--
--  EL DESTINATARIO SE CONGELA
--  ──────────────────────────
--  Se guarda el correo al que de verdad salió, no una referencia al perfil.
--  Un perfil cambia de dirección; la evidencia de a dónde se envió, no. Es
--  el mismo criterio de `acciones_cobranza`, que congela su contexto en vez
--  de resolverlo al leer.
--
--  APPEND-ONLY (SEC-14) y sin escritura para `authenticated`: quien escribe
--  aquí es la Edge Function con service_role. Que el propio administrador
--  pueda editar la prueba de lo que se envió vaciaría de sentido tenerla.
--  El guardia es `forbid_mutation_salvo_tenant_borrado`, el mismo que usa
--  `reporte_ejecuciones`, para que borrar la copropiedad siga siendo
--  posible.
--
--  Reseteo: cuelga de `reporte_programaciones` → `reportes`, que ya está en
--  el array de `fn_resetear_copropiedad`, y esa función fija
--  `aquila.reset_context`, que es justo la excepción del guardia. No hace
--  falta tocarla.
-- ═══════════════════════════════════════════════════════════════════════

create table public.reporte_entregas (
  id              uuid        primary key default gen_random_uuid(),
  tenant_id       uuid        not null references public.tenants (id) on delete cascade,
  programacion_id uuid        not null references public.reporte_programaciones (id) on delete cascade,
  -- La corrida que produjo el archivo. Es el puente al historial de RPT-04:
  -- desde una entrega se llega a las cifras exactas que se enviaron.
  ejecucion_id    uuid        references public.reporte_ejecuciones (id) on delete set null,
  -- A quién se le envió, congelado como texto. Ver cabecera.
  destinatario    text        not null,
  profile_id      uuid        references public.profiles (id) on delete set null,
  estado          text        not null,
  -- Qué pasó, en claro: el mensaje del proveedor si falló, o por qué se
  -- omitió. Nunca se muestra crudo al usuario, pero tiene que estar.
  detalle         text,
  intentada_at    timestamptz not null default now(),

  constraint reporte_entregas_estado_valido
    check (estado in ('enviada', 'fallida', 'omitida')),
  -- Un fallo sin explicación no es evidencia de nada.
  constraint reporte_entregas_detalle_coherente
    check (estado = 'enviada' or detalle is not null)
);

alter table public.reporte_entregas enable row level security;
alter table public.reporte_entregas force row level security;

create index reporte_entregas_tenant_idx
  on public.reporte_entregas (tenant_id, intentada_at desc);
create index reporte_entregas_programacion_idx
  on public.reporte_entregas (programacion_id, intentada_at desc);

comment on table public.reporte_entregas is
  'RPT-05 — a quién llegó cada corrida programada y con qué suerte. Append-only (SEC-14) y sin '
  'políticas de escritura para authenticated: escribe la Edge Function con service_role. El '
  'destinatario se congela como texto porque un perfil cambia de correo y la evidencia no.';

comment on column public.reporte_entregas.destinatario is
  'Correo al que se envió realmente, congelado. No se resuelve desde profile_id al leer: eso '
  'contaría la dirección de hoy, no la de aquel día.';

create policy reporte_entregas_select_miembro
  on public.reporte_entregas for select
  to authenticated
  using (public.is_member(tenant_id));

create trigger reporte_entregas_append_only
  before update or delete on public.reporte_entregas
  for each row execute function public.forbid_mutation_salvo_tenant_borrado();
