-- ═══════════════════════════════════════════════════════════════════════
--  RPT-04 · Artefactos de reporte en Storage
--  (PLAN_MOTOR_REPORTES.md §6 — "artefactos en Storage con bucket privado
--   y retención (expira_at); el historial sobrevive al archivo expirado")
--
--  QUIÉN ESCRIBE AQUÍ, Y POR QUÉ NADIE MÁS
--  ───────────────────────────────────────
--  Hoy —después de RPT-03— los archivos se arman en el navegador y se
--  descargan; no pasan por el servidor y no hay nada que archivar. El
--  productor de artefactos es el renderer de servidor que construye RPT-05
--  para las entregas programadas. Esta migración deja la estructura lista
--  para ese momento y el historial que la lee.
--
--  Por eso el bucket NO tiene política de INSERT para `authenticated`: la
--  única escritura pasa por Edge Function con service_role, exactamente
--  como `estados-cuenta` (20260822100000) y `auditoria-evidencias`
--  (20260915100000). La alternativa —subir el blob que generó el cliente—
--  obligaría a abrir INSERT bajo `{tenant_id}/` a cualquier miembro, que es
--  justo lo que esos dos patrones evitan: un bucket del sistema donde el
--  cliente puede poner lo que quiera deja de ser evidencia de nada.
--
--  SELECT sí existe, para miembros del tenant: es lo que permite firmar una
--  URL temporal desde el cliente sin otra Edge Function.
--
--  EL HISTORIAL SOBREVIVE AL ARCHIVO
--  ─────────────────────────────────
--  Cuando la retención vence, se borra el objeto de Storage y se marca
--  `purgado_at` — la fila NO se borra. Así el historial puede decir «esta
--  ejecución produjo un XLSX de 23 KB que expiró el 15 de octubre» en vez
--  de fingir que nunca hubo archivo. `reporte_ejecuciones` (append-only
--  desde RPT-01) es el historial propiamente dicho y no depende de esto.
--
--  `sha256` no es decorativo: es lo que permite afirmar meses después que
--  el archivo que alguien guardó es el mismo que produjo esa ejecución.
--
--  Borrado: cuelga de `reporte_ejecuciones` con ON DELETE CASCADE, y esa
--  tabla ya está en `fn_resetear_copropiedad` (RPT-01) — resetear la
--  copropiedad se lleva las filas sin tocar esa función. Los OBJETOS de
--  Storage quedan huérfanos, igual que los de `estados-cuenta`: el reset
--  nunca ha tocado Storage. Es deuda conocida y ajena a este corte.
-- ═══════════════════════════════════════════════════════════════════════

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'reportes',
  'reportes',
  false,
  15728640, -- 15 MB, mismo límite que los demás buckets del sistema
  array[
    'application/pdf',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'text/csv'
  ]
)
on conflict (id) do nothing;

-- Convención de ruta: {tenant_id}/{ejecucion_id}.{ext} — el tenant en el
-- primer segmento es lo que hace que foldername(name)[1] sirva de frontera
-- (AD-03), igual que en los buckets anteriores.
create policy reportes_storage_select_miembro
  on storage.objects for select
  to authenticated
  using (
    bucket_id = 'reportes'
    and public.is_member((storage.foldername(name))[1]::uuid)
  );

create table public.reporte_artefactos (
  id           uuid        primary key default gen_random_uuid(),
  tenant_id    uuid        not null references public.tenants (id) on delete cascade,
  -- Una ejecución produce como mucho un archivo: `reporte_ejecuciones` ya
  -- registra UN formato por corrida.
  ejecucion_id uuid        not null unique references public.reporte_ejecuciones (id) on delete cascade,
  storage_path text        not null,
  mime         text        not null,
  bytes        bigint      not null,
  sha256       text        not null,
  expira_at    timestamptz not null,
  purgado_at   timestamptz,
  created_at   timestamptz not null default now(),

  constraint reporte_artefactos_bytes_positivo check (bytes > 0),
  constraint reporte_artefactos_sha256_valido check (sha256 ~ '^[0-9a-f]{64}$'),
  constraint reporte_artefactos_retencion_futura check (expira_at > created_at)
);

alter table public.reporte_artefactos enable row level security;
alter table public.reporte_artefactos force row level security;

create index reporte_artefactos_tenant_idx on public.reporte_artefactos (tenant_id, created_at desc);
-- Para el barrido de retención: los vencidos que todavía tienen archivo.
create index reporte_artefactos_purga_idx
  on public.reporte_artefactos (expira_at)
  where purgado_at is null;

comment on table public.reporte_artefactos is
  'RPT-04 — archivo producido por una ejecución de reporte, en el bucket privado `reportes`. '
  'Sin políticas de escritura para authenticated: solo service_role (Edge Function de RPT-05) '
  'escribe aquí. Al vencer la retención se borra el objeto y se marca purgado_at; la fila queda, '
  'para que el historial pueda decir que hubo un archivo y expiró.';

comment on column public.reporte_artefactos.sha256 is
  'Huella del contenido, calculada en servidor. Permite afirmar que un archivo guardado por '
  'alguien es el mismo que produjo esta ejecución.';

comment on column public.reporte_artefactos.purgado_at is
  'Momento en que se borró el objeto de Storage por retención vencida. La fila sobrevive: el '
  'historial no debe fingir que nunca hubo archivo.';

create policy reporte_artefactos_select_miembro
  on public.reporte_artefactos for select
  to authenticated
  using (public.is_member(tenant_id));
