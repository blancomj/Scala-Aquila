-- ═══════════════════════════════════════════════════════════════════════
--  RPT-04 · Auditoría del motor de reportes y protección del historial
--  (PLAN_MOTOR_REPORTES.md §6 — "audit_log existente, nunca una tabla de
--   auditoría propia (§57)")
--
--  QUÉ SE AUDITA, Y QUÉ NO
--  ───────────────────────
--  `reporte_ejecuciones` (RPT-01) ya es la bitácora operativa: quién corrió
--  qué, con qué parámetros, cuánto tardó, cuántas filas y con qué formato.
--  Repetir cada corrida en `audit_log` sería la misma verdad escrita dos
--  veces y ahogaría la auditoría en ruido — una pantalla de reportes se
--  consulta decenas de veces al día.
--
--  A `audit_log` van los dos actos que NO son una consulta:
--
--  · `reporte.publicado` — sellar una versión es un acto de gobierno: a
--    partir de ahí esa definición es inmutable y produce cifras que alguien
--    va a citar. Queda quién y cuándo.
--  · `reporte.exportado` — sacar datos del sistema sí es auditable, y ya
--    hay precedente exacto: `fn_registrar_exportacion_libro` escribe
--    `contabilidad.libro.exportar`. Una consulta en pantalla no se audita;
--    un archivo que sale del sistema, sí. Por eso el disparador filtra por
--    `formato <> 'pantalla'`.
--
--  `reporte.programado` llega con RPT-05, junto con la programación misma.
--
--  EL HISTORIAL NO SE BORRA POR LA PUERTA DE ATRÁS
--  ───────────────────────────────────────────────
--  `reporte_ejecuciones` es append-only por SEC-14, pero su FK a `reportes`
--  es ON DELETE CASCADE: borrar el reporte se llevaba su historial entero
--  sin violar ningún disparador. Es la misma prohibición evitada por el
--  padre. Hoy ninguna pantalla borra reportes —la RLS lo permite pero la
--  app no lo ofrece—, así que se cierra ahora que es barato: un reporte ya
--  ejecutado no se borra.
--
--  El borrado del tenant y `fn_resetear_copropiedad` siguen pasando, con el
--  mismo mecanismo que usa `forbid_mutation_salvo_tenant_borrado`: si el
--  tenant ya no existe, o estamos dentro del reseteo, el historial se va
--  con todo lo demás porque esa es justamente la intención.
--
--  NOTA para quien añada un botón "Eliminar reporte": con este guardia,
--  un reporte con historial necesitará un ARCHIVAR (un `archivado_at` en
--  `reportes` y un filtro en el catálogo), no un borrado. No se añade aquí
--  porque ninguna pantalla ofrece borrar todavía y sería estructura sin uso.
-- ═══════════════════════════════════════════════════════════════════════

-- ── Publicación de una versión ─────────────────────────────────────────
create or replace function public.audit_reporte_publicacion()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.estado = 'borrador' and new.estado = 'publicada' then
    insert into public.audit_log (tenant_id, actor_id, action, entity_type, entity_id, metadata)
    values (
      new.tenant_id,
      (select auth.uid()),
      'reporte.publicado',
      'reporte_versiones',
      new.id,
      jsonb_build_object(
        'reporte_id', new.reporte_id,
        'version', new.version,
        -- La definición sellada entera: es lo que permite reconstruir meses
        -- después con qué reglas se produjo una cifra citada.
        'definicion', new.definicion
      )
    );
  end if;
  return new;
end;
$$;

comment on function public.audit_reporte_publicacion() is
  'RPT-04 — deja en audit_log el sellado de una versión de reporte. No audita la ejecución: '
  'para eso está reporte_ejecuciones (RPT-01).';

create trigger reporte_versiones_auditar_publicacion
  after update on public.reporte_versiones
  for each row execute function public.audit_reporte_publicacion();

-- ── Exportación (el dato sale del sistema) ─────────────────────────────
create or replace function public.audit_reporte_exportacion()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- Solo lo que produce un archivo. Una consulta en pantalla ya quedó en
  -- reporte_ejecuciones y no saca datos del sistema.
  if new.formato <> 'pantalla' and new.exito then
    insert into public.audit_log (tenant_id, actor_id, action, entity_type, entity_id, metadata)
    values (
      new.tenant_id,
      (select auth.uid()),
      'reporte.exportado',
      'reporte_ejecuciones',
      new.id,
      jsonb_build_object(
        'reporte_id', new.reporte_id,
        'version_id', new.version_id,
        'formato', new.formato,
        'filas', new.filas,
        'parametros', new.parametros
      )
    );
  end if;
  return new;
end;
$$;

comment on function public.audit_reporte_exportacion() is
  'RPT-04 — deja en audit_log que alguien sacó datos del sistema en un archivo. Mismo criterio '
  'que fn_registrar_exportacion_libro para los libros contables.';

create trigger reporte_ejecuciones_auditar_exportacion
  after insert on public.reporte_ejecuciones
  for each row execute function public.audit_reporte_exportacion();

-- ── Un reporte ya ejecutado no se borra ────────────────────────────────
create or replace function public.guard_reporte_con_historial()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- Borrado del tenant completo o reseteo de la copropiedad: el historial
  -- se va con todo, que es la intención. Mismo mecanismo exacto que
  -- forbid_mutation_salvo_tenant_borrado.
  if not exists (select 1 from public.tenants where id = old.tenant_id)
     or current_setting('aquila.reset_context', true) = 'true' then
    return old;
  end if;

  if exists (select 1 from public.reporte_ejecuciones e where e.reporte_id = old.id) then
    raise exception
      'RPT_REPORTE_CON_HISTORIAL: el reporte % ya fue ejecutado; borrarlo destruiría su historial (SEC-14)',
      old.codigo;
  end if;

  return old;
end;
$$;

comment on function public.guard_reporte_con_historial() is
  'RPT-04 — cierra el rodeo a SEC-14: reporte_ejecuciones es append-only, pero su FK a reportes '
  'cascadea, así que borrar el padre borraba el historial. Un reporte ya ejecutado no se borra.';

create trigger reportes_no_borrar_con_historial
  before delete on public.reportes
  for each row execute function public.guard_reporte_con_historial();

-- Los disparadores no se invocan fuera de su contexto, pero el advisor
-- marca el EXECUTE expuesto y el repo ya lo revoca por costumbre.
revoke execute on function public.audit_reporte_publicacion() from public, anon, authenticated;
revoke execute on function public.audit_reporte_exportacion() from public, anon, authenticated;
revoke execute on function public.guard_reporte_con_historial() from public, anon, authenticated;
