-- ═══════════════════════════════════════════════════════════════════════
--  EXT-09 (Ola 2, M14) · Mi Copropiedad — foto de visitante + autorización
--  permanente sobre mant_autorizaciones_visita.
--  Ver PROMPT_MI_COPROPIEDAD_FASE2.md §4.2/§7.4.
--
--  `permanente` es una columna explícita, no una inferencia de
--  "fecha_prevista is null": una regla booleana clara es más fácil de leer
--  y de proteger con un CHECK que adivinar la intención a partir de qué
--  campos vinieron vacíos.
--
--  Una autorización permanente nunca tiene fecha_prevista/hora_desde/
--  hora_hasta — esos tres campos describen una ventana puntual, y una
--  autorización sin vencimiento no tiene ventana que describir. El CHECK
--  de abajo lo exige en ambas direcciones (ninguna fila puede tener
--  permanente=true con fecha, ni permanente=false sin fecha).
-- ═══════════════════════════════════════════════════════════════════════

alter table public.mant_autorizaciones_visita
  add column permanente boolean not null default false,
  add column foto_url text,
  alter column fecha_prevista drop not null;

alter table public.mant_autorizaciones_visita
  add constraint mant_autorizaciones_visita_permanente_check
  check (
    (permanente = false and fecha_prevista is not null)
    or
    (permanente = true and fecha_prevista is null and hora_desde is null and hora_hasta is null)
  );

comment on column public.mant_autorizaciones_visita.permanente is
  'EXT-09 (Ola 2, M14): autorización sin vencimiento por fecha (p. ej. personal doméstico fijo) '
  '— exige fecha_prevista/hora_desde/hora_hasta en null (CHECK). El QR igual expira (ver el '
  'guard actualizado abajo): "permanente" es sobre la relación con el visitante, no sobre el '
  'QR físico, que se sigue renovando/revocando como cualquier otro.';

comment on column public.mant_autorizaciones_visita.foto_url is
  'EXT-09 (Ola 2, M14): ruta en el bucket privado `visitas-fotos` (no una URL pública). Nullable '
  '— la extensión es aditiva, ninguna autorización previa a este corte la tiene.';

-- ── guard_mant_autorizacion_visita: ventana de vigencia del QR para permanentes ──────────────
-- La versión anterior (20260932760000) calculaba la ventana máxima como
-- "fecha_prevista + hora + 6h", que para una fila permanente (fecha_prevista null) da NULL y
-- la comparación `qr_expira_at > NULL` nunca es true en plpgsql — es decir, el chequeo se
-- saltaba en silencio, no fallaba. Eso no es un guard, es la AUSENCIA de uno: una autorización
-- permanente permitiría un qr_expira_at arbitrariamente lejano sin ningún tope. Se reemplaza la
-- función completa con una rama explícita para permanente (tope de 1 año desde el alta — no
-- indefinido: si el QR se filtra, sigue siendo un secreto con fecha de vencimiento, aunque larga).
create or replace function public.guard_mant_autorizacion_visita()
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
      if new.permanente then
        v_ventana_maxima := new.created_at + interval '1 year';
      else
        v_ventana_maxima := (new.fecha_prevista + coalesce(new.hora_hasta, new.hora_desde, '23:59:59'))
          + interval '6 hours';
      end if;
      if new.qr_expira_at > v_ventana_maxima then
        raise exception 'AUTORIZACION_VIGENCIA_EXCESIVA: qr_expira_at % excede la ventana '
          'permitida (% + %)', new.qr_expira_at, v_ventana_maxima,
          case when new.permanente then '1 año' else '6 horas' end;
      end if;
    end if;

    return new;
  end if;

  -- UPDATE: una autorización usada/revocada es terminal. Antes de esa transición, solo
  -- estado/qr_token/qr_expira_at/foto_url pueden cambiar (la Edge Function de creación necesita
  -- un segundo/tercer UPDATE para adjuntar el QR recién firmado y, si aplica, la foto subida
  -- después de tener el id real de la fila).
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
    or old.permanente is distinct from new.permanente
    or old.created_at is distinct from new.created_at
  then
    raise exception 'AUTORIZACION_ESTADO_INMUTABLE: solo estado/qr_token/qr_expira_at/foto_url '
      'son editables tras el alta';
  end if;

  if old.qr_expira_at is distinct from new.qr_expira_at and new.qr_expira_at is not null then
    if new.permanente then
      v_ventana_maxima := new.created_at + interval '1 year';
    else
      v_ventana_maxima := (new.fecha_prevista + coalesce(new.hora_hasta, new.hora_desde, '23:59:59'))
        + interval '6 hours';
    end if;
    if new.qr_expira_at > v_ventana_maxima then
      raise exception 'AUTORIZACION_VIGENCIA_EXCESIVA: qr_expira_at % excede la ventana '
        'permitida (% + %)', new.qr_expira_at, v_ventana_maxima,
        case when new.permanente then '1 año' else '6 horas' end;
    end if;
  end if;

  return new;
end;
$$;

-- ── Storage: bucket visitas-fotos ─────────────────────────────────────────────────────────
-- Privado. Mismo criterio que documentos-inmueble (20260821090000): sin política de INSERT
-- para `authenticated` — la escritura real pasa siempre por external-visitas-crear con
-- service_role (el actor externo nunca escribe Storage directo). SÍ hay política de SELECT
-- para miembros del tenant (portería necesita ver la foto al validar el QR, autorizacion-
-- visita-validar ya devuelve la fila completa vía select('*') — sin cambios en esa función).
-- A diferencia de documentos-inmueble, NO se agrega una policy de SELECT para el actor externo
-- dueño: no hay ningún caso de uso confirmado de "el residente vuelve a ver la foto que ya
-- tomó" (ya sabe qué foto subió) — agregar esa policy ahora sería construir para un problema
-- que AQUILA no tiene (mismo criterio que TIPO_VISITANTE en PLAN_MI_COPROPIEDAD.md §10.1).
-- Ruta: {tenant_id}/{autorizacion_id}/{nombre} — storage.foldername(name)[1] es el tenant_id,
-- mismo patrón que documentos-inmueble para delegar el aislamiento a is_member().
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'visitas-fotos',
  'visitas-fotos',
  false,
  5242880, -- 5 MB — una foto de rostro/cédula, no un documento; más chico que documentos-inmueble
           -- (15 MB) a propósito.
  array['image/jpeg', 'image/png']
)
on conflict (id) do nothing;

create policy visitas_fotos_storage_select_miembro
  on storage.objects for select
  to authenticated
  using (
    bucket_id = 'visitas-fotos'
    and public.is_member((storage.foldername(name))[1]::uuid)
  );
