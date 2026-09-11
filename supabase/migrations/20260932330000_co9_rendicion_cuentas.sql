-- ═══════════════════════════════════════════════════════════════════════
--  CO-9 · Rendición de cuentas (CO_09_gobierno_y_asamblea.md §4.3, ya con
--  el parche CO_09_PARCHE_FRONTERA_GOBIERNO.md §3.1 aplicado desde el
--  origen: sin votos_favor/votos_contra/coeficiente_favor/fecha_asamblea/
--  documento_acta_id — esos son propiedad de gobierno_decisiones/
--  gobierno_reuniones, nunca se duplican aquí).
--
--  decision_id/reunion_id referencian public.gobierno_decisiones/
--  public.gobierno_reuniones (NO "decisiones"/"reuniones" — esos nombres
--  no existen en el esquema; verificado por grep antes de escribir esta
--  migración, ver CO_09 Plan del corte).
--
--  guard_rendicion_origen_exclusivo es permanente (aplica en cualquier
--  estado, incluido borrador): "nunca las dos fuentes a la vez" del parche
--  no es solo una condición de la transición a presentada.
--  fn_contable_presentar_rendicion (próxima migración) exige además que
--  exactamente una esté poblada al presentar — en borrador ambas pueden
--  estar vacías todavía.
-- ═══════════════════════════════════════════════════════════════════════

create table public.contable_rendicion_cuentas (
  id                            uuid primary key default gen_random_uuid(),
  tenant_id                     uuid not null references public.tenants (id) on delete cascade,
  ejercicio                     int      not null check (ejercicio > 2000),
  periodo_desde                 date not null,
  periodo_hasta                 date not null check (periodo_hasta >= periodo_desde),
  certificacion_id              uuid not null references public.contable_certificacion (id),
  dictamen_id                   uuid references public.contable_dictamen (id),
  presupuesto_ejecutado_resumen jsonb,
  estado                        text not null default 'borrador'
                                   check (estado in ('borrador', 'presentada', 'aprobada', 'rechazada')),
  decision_id                   uuid references public.gobierno_decisiones (id),
  reunion_id                    uuid references public.gobierno_reuniones (id),
  acta_referencia_texto         text,
  observaciones                 text,
  documento_id                  uuid references public.documentos (id),
  libros_dian_registrado        boolean not null default false,
  libros_dian_fecha             date,
  libros_dian_radicado          text,
  presentada_at                 timestamptz,
  aprobada_at                   timestamptz,
  creado_por                    uuid references public.profiles (id),
  created_at                    timestamptz not null default now(),
  updated_at                    timestamptz not null default now()
);

alter table public.contable_rendicion_cuentas enable row level security;
alter table public.contable_rendicion_cuentas force row level security;

create index contable_rendicion_cuentas_tenant_idx
  on public.contable_rendicion_cuentas (tenant_id);
create index contable_rendicion_cuentas_certificacion_idx
  on public.contable_rendicion_cuentas (certificacion_id);
create index contable_rendicion_cuentas_decision_idx
  on public.contable_rendicion_cuentas (decision_id) where decision_id is not null;

comment on table public.contable_rendicion_cuentas is
  'CO-9 §4.3 (Ley 675 art. 51: rendición de cuentas del administrador). Empaqueta certificación + '
  'dictamen + resumen presupuestal para presentar a la asamblea. El resultado de la votación NUNCA '
  'se copia aquí (parche §2) — decision_id referencia gobierno_decisiones y se lee de ahí; '
  'acta_referencia_texto es el respaldo transitorio para un tenant que todavía no usa el módulo de '
  'gobierno (comment on column). Escritura vía RPC (fn_contable_crear_rendicion/'
  'fn_contable_presentar_rendicion/fn_contable_aprobar_rendicion/fn_contable_rechazar_rendicion) — '
  'sin policy insert/update.';

comment on column public.contable_rendicion_cuentas.acta_referencia_texto is
  'Respaldo transitorio (parche §3.1): existe solo para el tenant que aún no adoptó el módulo de '
  'gobierno. Cuando decision_id está poblado, esta columna debe estar vacía (guard_rendicion_'
  'origen_exclusivo) — la fuente de verdad del resultado de la votación es siempre '
  'gobierno_decisiones, nunca esta columna.';

create policy contable_rendicion_cuentas_select_miembro
  on public.contable_rendicion_cuentas for select
  to authenticated
  using (public.is_member(tenant_id));

-- ── guard de exclusión mutua del origen (parche §3.1) — permanente ───────
create function public.guard_rendicion_origen_exclusivo()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.decision_id is not null and new.acta_referencia_texto is not null then
    raise exception 'RENDICION_ORIGEN_DUPLICADO: la rendición % no puede tener decision_id y '
      'acta_referencia_texto a la vez', new.id;
  end if;

  new.updated_at := now();
  return new;
end;
$$;

create trigger contable_rendicion_cuentas_guard_origen
  before insert or update on public.contable_rendicion_cuentas
  for each row execute function public.guard_rendicion_origen_exclusivo();
