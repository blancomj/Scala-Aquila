-- ═══════════════════════════════════════════════════════════════════════
--  EXS-3 · Anuncios (5/5) — el módulo y el disparo diario
-- ═══════════════════════════════════════════════════════════════════════

-- ── El módulo 'anuncios' lo cubren TODOS los roles funcionales ─────────
--
--  Contrato EXS-1 §3.4: cada corte declara su módulo en la migración que
--  crea sus tablas. Aquí hay un matiz que conviene dejar escrito.
--
--  puede_ver_modulo() es, según su propio comentario, "un gate restrictivo
--  para módulos sensibles": pasa si eres administrador, o si tu membresía
--  no tiene NINGÚN rol funcional, o si alguno cubre el módulo. Aplicado a
--  anuncios sin más, tendría un efecto perverso: asignarle a alguien el rol
--  'contador' le ocultaría los avisos de seguridad del edificio.
--
--  La comunicación oficial es transversal — es justo lo contrario de un
--  módulo sensible que haya que restringir por especialidad. Se resuelve
--  sembrando los cinco roles existentes contra 'anuncios' en vez de
--  exceptuar a este dominio del mecanismo: se conserva la uniformidad de
--  EXS-1, todos los miembros ven los anuncios, y si algún día una
--  copropiedad quiere restringirlos, basta borrar filas de esta tabla —
--  sin tocar policies ni desplegar código.

insert into public.rol_funcional_modulo (lista_tipos_id, modulo)
select lt.id, 'anuncios'
from public.lista_tipos lt
where lt.tipo = 'ROL_FUNCIONAL'
on conflict (lista_tipos_id, modulo) do nothing;

-- ── Disparo diario de la publicación programada ────────────────────────
--
--  Mismo patrón que cron_gobierno_vencimientos_diario: una función
--  envoltorio que el scheduler llama, no pg_cron apuntando a la lógica.
--  fn_anuncio_publicar_programados ya es idempotente y multi-tenant (barre
--  por fecha, no por tenant), así que aquí no hace falta iterar
--  copropiedades.

create function public.cron_anuncios_publicar_programados()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_publicados integer;
begin
  v_publicados := public.fn_anuncio_publicar_programados();

  if v_publicados > 0 then
    insert into public.audit_log (actor_id, action, entity_type, metadata)
    values (
      null,
      'ANUNCIOS_PUBLICACION_PROGRAMADA',
      'anuncios',
      jsonb_build_object('publicados', v_publicados, 'corrida_at', now())
    );
  end if;
end;
$$;

comment on function public.cron_anuncios_publicar_programados is
  'EXS-3 — disparo diario de la publicación programada. Solo deja rastro en audit_log cuando '
  'publicó algo: una corrida que no encuentra nada es lo normal y no merece una fila diaria de '
  'ruido. La idempotencia la garantiza fn_anuncio_publicar_programados (el estado es la marca), '
  'no este envoltorio.';

revoke execute on function public.cron_anuncios_publicar_programados() from public, authenticated, anon;
grant execute on function public.cron_anuncios_publicar_programados() to service_role;
