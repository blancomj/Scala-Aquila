-- ═══════════════════════════════════════════════════════════════════════
--  RPT-05 (2/n) · Programación de reportes y sus suscriptores
--  (PLAN_MOTOR_REPORTES.md §6 — "frecuencias Una vez/Diaria/Semanal/
--   Mensual, zona horaria explícita, suscripciones a miembros del tenant")
--
--  LA ZONA HORARIA ES EXPLÍCITA, Y NO POR ADORNO
--  ─────────────────────────────────────────────
--  Guardar «a las 7:00» sin decir de dónde deja la hora a merced del
--  `TimeZone` de la sesión que ejecute el cron. Ya hay deuda registrada por
--  esto en el repo (ventanas `date -> timestamptz` que nunca consultan
--  `tenants.zona_horaria`, que existe desde siempre con default
--  'America/Bogota'). Aquí la zona se guarda en la fila, se toma del tenant
--  al crearla, y el cálculo de la próxima corrida la usa siempre.
--
--  SOLO SE SUSCRIBE A MIEMBROS. Y ESO ESTRECHA EL PLAN A PROPÓSITO
--  ──────────────────────────────────────────────────────────────
--  El esquema esbozado en §5 del plan decía `profile_id | correo`: o un
--  usuario, o una dirección escrita a mano. Pero la regla de seguridad del
--  MISMO corte dice «un usuario no puede suscribir a un destinatario que no
--  es miembro del tenant», y las dos cosas no caben juntas: una dirección
--  libre es exactamente un canal para sacar los estados financieros de la
--  copropiedad a donde sea, programado y recurrente, con un solo INSERT.
--
--  Se resuelve a favor de la regla de seguridad: `profile_id` obligatorio y
--  con membresía comprobada en la propia política. Si algún día hace falta
--  enviarle a un revisor fiscal que no es usuario del sistema, será una
--  decisión deliberada —con su propio control de a quién se puede— y no el
--  efecto colateral de una columna de texto libre.
--
--  EL DESTINATARIO SE CONGELA AL ENVIAR, no aquí: `reporte_entregas`
--  (migración siguiente) guarda el correo al que de verdad salió, porque un
--  perfil puede cambiar de dirección y la evidencia no puede cambiar con él.
-- ═══════════════════════════════════════════════════════════════════════

create table public.reporte_programaciones (
  id           uuid        primary key default gen_random_uuid(),
  tenant_id    uuid        not null references public.tenants (id) on delete cascade,
  reporte_id   uuid        not null references public.reportes (id) on delete cascade,
  nombre       text        not null,
  frecuencia   text        not null,
  -- 0 = domingo .. 6 = sábado, como `extract(dow)`. Solo para 'semanal'.
  dia_semana   smallint,
  -- 1..28 para 'mensual'. No se admite 29-31: en febrero no existen y la
  -- alternativa («el último día») es otra cosa que nadie ha pedido.
  dia_mes      smallint,
  -- Solo para 'una_vez'.
  fecha_unica  date,
  hora         time        not null,
  zona_horaria text        not null,
  parametros   jsonb       not null default '{}'::jsonb,
  formato      text        not null,
  activa       boolean     not null default true,
  -- Instante calculado de la próxima corrida. Es lo que el cron consulta:
  -- una comparación por índice, sin recalcular calendarios en cada pasada.
  proxima_at   timestamptz,
  ultima_at    timestamptz,
  creado_por   uuid        references public.profiles (id),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz,

  constraint reporte_programaciones_frecuencia_valida
    check (frecuencia in ('una_vez', 'diaria', 'semanal', 'mensual')),
  constraint reporte_programaciones_formato_valido
    check (formato in ('pdf', 'xlsx', 'csv')),
  -- Cada frecuencia exige SU dato y prohíbe los de las otras: una fila
  -- 'diaria' con dia_semana puesto es una definición ambigua, no un detalle.
  constraint reporte_programaciones_calendario_coherente check (
    case frecuencia
      when 'una_vez' then fecha_unica is not null and dia_semana is null and dia_mes is null
      when 'diaria'  then fecha_unica is null and dia_semana is null and dia_mes is null
      when 'semanal' then fecha_unica is null and dia_semana between 0 and 6 and dia_mes is null
      when 'mensual' then fecha_unica is null and dia_semana is null and dia_mes between 1 and 28
    end
  )
);

alter table public.reporte_programaciones enable row level security;
alter table public.reporte_programaciones force row level security;

create index reporte_programaciones_tenant_idx
  on public.reporte_programaciones (tenant_id);
-- El índice que usa el cron: solo las activas que ya vencieron.
create index reporte_programaciones_debidas_idx
  on public.reporte_programaciones (proxima_at)
  where activa and proxima_at is not null;

comment on table public.reporte_programaciones is
  'RPT-05 — un reporte que se ejecuta y se envía solo. La zona horaria se guarda en la fila '
  '(tomada de tenants.zona_horaria al crearla): sin ella, «a las 7:00» depende del TimeZone de '
  'quien ejecute el cron. proxima_at es un instante ya calculado, para que el cron compare por '
  'índice en vez de resolver calendarios en cada pasada.';

comment on column public.reporte_programaciones.dia_mes is
  'Día del mes, 1..28. No se admiten 29-31 a propósito: no existen todos los meses, y «el último '
  'día del mes» es otra regla que nadie ha pedido todavía.';

create policy reporte_programaciones_select_miembro
  on public.reporte_programaciones for select
  to authenticated
  using (public.is_member(tenant_id));

create policy reporte_programaciones_insert_operador
  on public.reporte_programaciones for insert
  to authenticated
  with check (
    public.has_role(tenant_id, array['auxiliar']::public.tenant_role_t[])
    -- El reporte tiene que ser de esta copropiedad y tener algo publicado:
    -- programar un borrador dejaría una corrida que nunca podría ejecutarse.
    and exists (
      select 1
        from public.reportes r
        join public.reporte_versiones v on v.reporte_id = r.id
       where r.id = reporte_programaciones.reporte_id
         and r.tenant_id = reporte_programaciones.tenant_id
         and v.estado = 'publicada'
    )
  );

create policy reporte_programaciones_update_operador
  on public.reporte_programaciones for update
  to authenticated
  using (public.has_role(tenant_id, array['auxiliar']::public.tenant_role_t[]))
  with check (public.has_role(tenant_id, array['auxiliar']::public.tenant_role_t[]));

create policy reporte_programaciones_delete_operador
  on public.reporte_programaciones for delete
  to authenticated
  using (public.has_role(tenant_id, array['auxiliar']::public.tenant_role_t[]));

-- ── Una programación no se muda de copropiedad ─────────────────────────
-- La política de UPDATE no basta: quien administra DOS copropiedades pasa
-- el `using` con una y el `with check` con la otra, y se llevaría la
-- programación —con sus suscriptores y su historial de entregas— a un
-- tenant distinto. Es el requisito de seguridad que el plan pide por su
-- nombre, y se impone con un guardia, no con confianza en la UI.
create or replace function public.guard_reporte_programacion_tenant()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.tenant_id is distinct from old.tenant_id
     or new.reporte_id is distinct from old.reporte_id then
    raise exception
      'RPT_PROGRAMACION_CONTEXTO_INMUTABLE: una programación no cambia de copropiedad ni de reporte; crea otra';
  end if;
  return new;
end;
$$;

revoke execute on function public.guard_reporte_programacion_tenant() from public, anon, authenticated;

create trigger reporte_programaciones_contexto_inmutable
  before update on public.reporte_programaciones
  for each row execute function public.guard_reporte_programacion_tenant();

create trigger set_updated_at
  before update on public.reporte_programaciones
  for each row execute function public.set_updated_at();

-- ── Suscriptores: miembros, y nada más ─────────────────────────────────
create table public.reporte_suscripciones (
  tenant_id       uuid        not null references public.tenants (id) on delete cascade,
  programacion_id uuid        not null references public.reporte_programaciones (id) on delete cascade,
  profile_id      uuid        not null references public.profiles (id) on delete cascade,
  created_at      timestamptz not null default now(),
  primary key (programacion_id, profile_id)
);

alter table public.reporte_suscripciones enable row level security;
alter table public.reporte_suscripciones force row level security;

create index reporte_suscripciones_tenant_idx
  on public.reporte_suscripciones (tenant_id);

comment on table public.reporte_suscripciones is
  'RPT-05 — quién recibe una programación. Solo miembros del tenant, comprobado en la política: '
  'una dirección de correo libre sería un canal recurrente para sacar los estados financieros de '
  'la copropiedad a cualquier parte. El correo real se congela al enviar, en reporte_entregas.';

create policy reporte_suscripciones_select_miembro
  on public.reporte_suscripciones for select
  to authenticated
  using (public.is_member(tenant_id));

create policy reporte_suscripciones_insert_operador
  on public.reporte_suscripciones for insert
  to authenticated
  with check (
    public.has_role(tenant_id, array['auxiliar']::public.tenant_role_t[])
    -- El destinatario tiene que ser miembro ACTIVO de esta copropiedad: a
    -- alguien a quien se le retiró el acceso tampoco se le sigue enviando.
    -- (`memberships` referencia al usuario por `user_id`, que es el mismo id
    -- que `profiles.id`.)
    and exists (
      select 1 from public.memberships m
       where m.user_id = reporte_suscripciones.profile_id
         and m.tenant_id = reporte_suscripciones.tenant_id
         and m.status = 'active'
    )
    -- Y la programación, de esta misma copropiedad.
    and exists (
      select 1 from public.reporte_programaciones p
       where p.id = reporte_suscripciones.programacion_id
         and p.tenant_id = reporte_suscripciones.tenant_id
    )
  );

create policy reporte_suscripciones_delete_operador
  on public.reporte_suscripciones for delete
  to authenticated
  using (public.has_role(tenant_id, array['auxiliar']::public.tenant_role_t[]));
