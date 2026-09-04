-- ═══════════════════════════════════════════════════════════════════════
--  Novedades prorrateables inhabilitables con observación obligatoria
--
--  Hasta ahora solo una novedad permanente podía inhabilitarse
--  (fn_inhabilitar_novedad, 20260827100000) — una prorrateable con cuotas
--  aún pendientes no tenía forma de detenerse si dejaba de aplicar (ej. se
--  desiste de una reparación en 3 cuotas después de generada la primera).
--  Esta migración:
--   - permite inhabilitar también una prorrateable, pero solo si todavía le
--     queda saldo pendiente (al menos una cuota sin generar) —
--     NOVEDAD_SIN_SALDO_PENDIENTE si ya se generaron todas: no hay nada que
--     detener,
--   - exige una observación (mismo criterio que el motivo de
--     fn_rechazar_novedad),
--   - corrige un gap real: fn_generar_cargos_novedades_periodo() nunca
--     filtraba inhabilitada_at en el barrido prorrateable porque hasta hoy
--     era imposible que una prorrateable estuviera inhabilitada. Ahora sí
--     puede, así que ese barrido debe respetarlo o inhabilitar no tendría
--     ningún efecto sobre las cuotas restantes.
-- ═══════════════════════════════════════════════════════════════════════

alter table public.novedades
  add column inhabilitada_motivo text;

comment on column public.novedades.inhabilitada_motivo is
  'Observación obligatoria al inhabilitar (permanente, o prorrateable con saldo pendiente) — '
  'mismo criterio que rejected_reason para el rechazo. Queda junto a inhabilitada_por/inhabilitada_at '
  'como registro de quién, cuándo y por qué.';

-- Backfill: filas inhabilitadas antes de esta migración no tenían motivo que
-- capturar (el campo no existía) — se documenta el hecho en vez de dejar el
-- registro histórico incoherente con el nuevo constraint.
update public.novedades
   set inhabilitada_motivo = 'Inhabilitada antes de exigir observación obligatoria.'
 where inhabilitada_at is not null and inhabilitada_motivo is null;

alter table public.novedades
  drop constraint novedades_inhabilitada_coherente,
  add constraint novedades_inhabilitada_coherente check (
    (inhabilitada_at is null) = (inhabilitada_por is null)
    and (inhabilitada_at is null) = (inhabilitada_motivo is null)
    and (not (permanente or prorrateable) or inhabilitada_at is null or estado = 'aprobada')
  );

-- ── fn_inhabilitar_novedad: cambia de firma (agrega p_motivo) y de alcance
--    (permanente o prorrateable-con-saldo, ya no solo permanente). ───────
drop function public.fn_inhabilitar_novedad(uuid, uuid);

create function public.fn_inhabilitar_novedad(p_novedad_id uuid, p_actor_id uuid, p_motivo text)
returns public.novedades
language plpgsql
set search_path = ''
as $$
declare
  v_novedad public.novedades;
  v_saldo_pendiente boolean;
begin
  select * into v_novedad from public.novedades where id = p_novedad_id;
  if v_novedad.id is null then
    raise exception 'NOVEDAD_NO_ENCONTRADA: % no existe', p_novedad_id;
  end if;

  if not (v_novedad.permanente or v_novedad.prorrateable) then
    raise exception 'NOVEDAD_NO_INHABILITABLE: % no es permanente ni prorrateable — nada que inhabilitar',
      p_novedad_id;
  end if;

  if v_novedad.inhabilitada_at is not null then
    raise exception 'NOVEDAD_YA_INHABILITADA: % ya fue inhabilitada el %',
      p_novedad_id, v_novedad.inhabilitada_at;
  end if;

  if v_novedad.prorrateable then
    select exists (
      select 1 from public.novedad_cuotas
      where novedad_id = p_novedad_id and generada_at is null
    ) into v_saldo_pendiente;
    if not v_saldo_pendiente then
      raise exception 'NOVEDAD_SIN_SALDO_PENDIENTE: % ya generó todas sus cuotas — nada que inhabilitar',
        p_novedad_id;
    end if;
  end if;

  update public.novedades
     set inhabilitada_at = now(), inhabilitada_por = p_actor_id, inhabilitada_motivo = p_motivo
   where id = p_novedad_id
  returning * into v_novedad;

  return v_novedad;
end;
$$;

revoke execute on function public.fn_inhabilitar_novedad(uuid, uuid, text) from public, anon, authenticated;

-- ── fn_generar_cargos_novedades_periodo: el barrido prorrateable ahora
--    también debe saltarse las inhabilitadas, igual que ya hace el barrido
--    permanente — hasta esta migración era un caso imposible. ───────────
create or replace function public.fn_generar_cargos_novedades_periodo(p_tenant_id uuid, p_periodo_id uuid)
returns int
language plpgsql
set search_path = ''
as $$
declare
  v_novedad record;
  v_cuota record;
  v_cargo_id uuid;
  v_generados int := 0;
begin
  -- permanentes activas sin cargo ya generado en este periodo.
  for v_novedad in
    select n.* from public.novedades n
    where n.tenant_id = p_tenant_id
      and n.estado = 'aprobada'
      and n.permanente = true
      and n.inhabilitada_at is null
      and not exists (
        select 1 from public.cargos c
        where c.novedad_id = n.id and c.periodo_id = p_periodo_id
      )
  loop
    insert into public.cargos (
      tenant_id, inmueble_id, periodo_id, categoria, origen_tipo, novedad_id, concepto_id, monto_original
    ) values (
      p_tenant_id, v_novedad.inmueble_id, p_periodo_id, 'otro', 'novedad', v_novedad.id,
      v_novedad.concepto_id, v_novedad.monto
    );
    v_generados := v_generados + 1;
  end loop;

  -- prorrateables activas: la próxima cuota pendiente, una por novedad por periodo.
  for v_novedad in
    select n.* from public.novedades n
    where n.tenant_id = p_tenant_id
      and n.estado = 'aprobada'
      and n.prorrateable = true
      and n.inhabilitada_at is null
      and not exists (
        select 1 from public.novedad_cuotas nc
        where nc.novedad_id = n.id and nc.periodo_id = p_periodo_id
      )
  loop
    select * into v_cuota from public.novedad_cuotas
     where novedad_id = v_novedad.id and cargo_id is null
     order by numero_cuota
     limit 1;
    if v_cuota.id is null then
      continue; -- ya se generaron todas sus cuotas
    end if;

    insert into public.cargos (
      tenant_id, inmueble_id, periodo_id, categoria, origen_tipo, novedad_id, concepto_id, monto_original
    ) values (
      p_tenant_id, v_novedad.inmueble_id, p_periodo_id, 'otro', 'novedad', v_novedad.id,
      v_novedad.concepto_id, v_cuota.monto_cuota
    )
    returning id into v_cargo_id;

    update public.novedad_cuotas
       set periodo_id = p_periodo_id, cargo_id = v_cargo_id, generada_at = now()
     where id = v_cuota.id;

    v_generados := v_generados + 1;
  end loop;

  return v_generados;
end;
$$;

revoke execute on function public.fn_generar_cargos_novedades_periodo(uuid, uuid) from public, anon, authenticated;
