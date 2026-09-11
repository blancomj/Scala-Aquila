-- ═══════════════════════════════════════════════════════════════════════
--  MANT-11 · Visitantes y control de acceso (2/5) — mant_autorizaciones_visita
--  Casos de uso/Solicitudes - Reservas - Visitantes/MANT_11_visitantes_acceso.md §4.1-4.2
--
--  qr_token/qr_expira_at los escribe la Edge Function autorizacion-visita-crear
--  (20260932800000), nunca esta migración ni un cliente directo — la firma
--  (HMAC-SHA256 vía _shared/link_token.ts) exige Web Crypto de Deno,
--  irreproducible en plpgsql sin duplicar esa lógica en dos runtimes. Mismo
--  patrón que generar-qr-activo (MANT-0): la fila nace, LUEGO se firma.
--
--  qr_token guarda el compuesto "<id>.<firmado>" — un solo string escaneable
--  que fn autorizacion-visita-validar/consumir separan en el primer punto
--  para recuperar el id (uuid, sin puntos) y pasarle el resto intacto a
--  verificarTokenEnlace(). No hay "fn_autorizacion_visita_validar" en SQL —
--  ver la cabecera de 20260932800000 para la desviación de nombres.
-- ═══════════════════════════════════════════════════════════════════════

create table public.mant_autorizaciones_visita (
  id                     uuid primary key default gen_random_uuid(),
  tenant_id              uuid not null references public.tenants (id) on delete cascade,
  inmueble_id            uuid not null references public.inmuebles (id),
  autorizado_por_ref     uuid not null,
  autorizado_por_origen  public.autorizacion_origen_t not null,
  visitante_nombre       text not null,
  visitante_documento    text,
  tipo_id                bigint references public.lista_tipos (id),
  fecha_prevista         date not null,
  hora_desde             time,
  hora_hasta             time,
  estado                 public.autorizacion_visita_estado_t not null default 'vigente',
  qr_token               text unique,
  qr_expira_at           timestamptz,
  created_at             timestamptz not null default now(),

  constraint mant_autorizaciones_visita_horario_valido
    check (hora_hasta is null or hora_desde is null or hora_hasta > hora_desde)
);

alter table public.mant_autorizaciones_visita enable row level security;
alter table public.mant_autorizaciones_visita force row level security;

create index mant_autorizaciones_visita_tenant_idx on public.mant_autorizaciones_visita (tenant_id);
create index mant_autorizaciones_visita_inmueble_idx on public.mant_autorizaciones_visita (inmueble_id);

comment on table public.mant_autorizaciones_visita is
  'MANT-11 §4.1: autorización de visita creada con anticipación por un residente o por staff. '
  'El visitante NUNCA se crea en terceros — es un dato que otro actor declara (nombre + '
  'documento, nada más), no un actor de AQUILA.';

comment on column public.mant_autorizaciones_visita.qr_expira_at is
  'Vigencia CORTA (horas), a diferencia de activos.qr_token (MANT-0, ~50 años) — este QR se '
  'imprime/entrega una vez para una visita puntual, no un rótulo físico permanente.';

create function public.guard_mant_autorizacion_visita()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_vinculado boolean;
  v_ventana_maxima timestamptz;
begin
  if tg_op = 'INSERT' then
    if new.autorizado_por_origen = 'externo' then
      select exists (
        select 1
          from public.actor_externo_vinculo v
          join public.inmueble_persona_rol ipr on ipr.id = v.persona_rol_id
         where v.id = new.autorizado_por_ref
           and ipr.inmueble_id = new.inmueble_id
           and (v.vigente_hasta is null or v.vigente_hasta >= current_date)
      ) into v_vinculado;

      if not v_vinculado then
        raise exception 'AUTORIZACION_INMUEBLE_NO_VINCULADO: el actor externo % no está '
          'vinculado al inmueble %', new.autorizado_por_ref, new.inmueble_id;
      end if;
    end if;

    if new.qr_expira_at is not null then
      v_ventana_maxima := (new.fecha_prevista + coalesce(new.hora_hasta, new.hora_desde, '23:59:59'))
        + interval '6 hours';
      if new.qr_expira_at > v_ventana_maxima then
        raise exception 'AUTORIZACION_VIGENCIA_EXCESIVA: qr_expira_at % excede la ventana '
          'permitida (% + 6 horas)', new.qr_expira_at, v_ventana_maxima;
      end if;
    end if;

    return new;
  end if;

  -- UPDATE: una autorización usada/revocada es terminal. Antes de esa transición, solo
  -- estado/qr_token/qr_expira_at pueden cambiar (la Edge Function de creación necesita un
  -- segundo UPDATE para adjuntar el QR recién firmado a la fila que acaba de insertar).
  if old.estado in ('usada', 'revocada') then
    raise exception 'AUTORIZACION_ESTADO_INMUTABLE: la autorización % ya está % y no admite '
      'más cambios', old.id, old.estado;
  end if;

  if old.tenant_id is distinct from new.tenant_id
    or old.inmueble_id is distinct from new.inmueble_id
    or old.autorizado_por_ref is distinct from new.autorizado_por_ref
    or old.autorizado_por_origen is distinct from new.autorizado_por_origen
    or old.visitante_nombre is distinct from new.visitante_nombre
    or old.visitante_documento is distinct from new.visitante_documento
    or old.tipo_id is distinct from new.tipo_id
    or old.fecha_prevista is distinct from new.fecha_prevista
    or old.hora_desde is distinct from new.hora_desde
    or old.hora_hasta is distinct from new.hora_hasta
    or old.created_at is distinct from new.created_at
  then
    raise exception 'AUTORIZACION_ESTADO_INMUTABLE: solo estado/qr_token/qr_expira_at son '
      'editables tras el alta';
  end if;

  if old.qr_expira_at is distinct from new.qr_expira_at and new.qr_expira_at is not null then
    v_ventana_maxima := (new.fecha_prevista + coalesce(new.hora_hasta, new.hora_desde, '23:59:59'))
      + interval '6 hours';
    if new.qr_expira_at > v_ventana_maxima then
      raise exception 'AUTORIZACION_VIGENCIA_EXCESIVA: qr_expira_at % excede la ventana '
        'permitida (% + 6 horas)', new.qr_expira_at, v_ventana_maxima;
    end if;
  end if;

  return new;
end;
$$;

create trigger guard_mant_autorizacion_visita
  before insert or update on public.mant_autorizaciones_visita
  for each row execute function public.guard_mant_autorizacion_visita();

create policy mant_autorizaciones_visita_select_miembro
  on public.mant_autorizaciones_visita for select
  to authenticated
  using (public.is_member(tenant_id));

-- Sin política de INSERT/UPDATE para `authenticated`: el alta y el adjunte del QR los hace
-- SIEMPRE la Edge Function autorizacion-visita-crear con su cliente service_role, después de
-- validar has_role(['auxiliar']) (staff) o el vínculo del actor externo por su cuenta —
-- mismo criterio que generar-qr-activo/fn_actor_externo_registrar_vinculo (EXT-01): cero
-- políticas de escritura, todo pasa por la función.

revoke execute on function public.guard_mant_autorizacion_visita() from public, anon, authenticated;
