-- ═══════════════════════════════════════════════════════════════════════
--  EXS-2 · Dos de los tres puentes de detección apuntaban a un 404
--
--  Hallado el 2026-09-12 verificando la campana en navegador — la primera
--  vez que alguien pulsó una notificación de verdad. El panel funcionaba,
--  el contador funcionaba, marcar leída funcionaba; el enlace llevaba a
--  "Page not found".
--
--    · '/finanzas/flujo'  →  la página es '/finanzas/flujo-proyectado'
--    · '/gobierno'        →  no hay índice; el tablero es
--                            '/gobierno/tablero'
--
--  El de inventario ('/mantenimiento/inventario') sí existe, y el de
--  anuncios ('/anuncios/<id>') también. Eran 142 de las 246 filas de la
--  base local las que no llevaban a ninguna parte.
--
--  POR QUÉ NADIE LO VIO: nada en el camino falla. `fn_notificar` no sabe
--  qué rutas tiene el front, el trigger se traga sus propios errores a
--  propósito, y las pruebas de EXS-2 comprueban que el aviso se emite con
--  su enlace — no que el enlace resuelva. Un enlace muerto es exactamente
--  el tipo de fallo que solo aparece al usarlo. De ahí la prueba de
--  gobernanza que acompaña a esta migración
--  (tests/governance/enlaces-notificaciones.test.ts): compara cada
--  literal `p_enlace` de las migraciones contra las páginas reales de
--  apps/web/app/pages, y así el próximo renombrado de página lo dice la
--  suite en vez de un usuario.
--
--  Se corrigen las dos funciones Y las filas ya emitidas: una notificación
--  vieja sigue en la campana de alguien, y arreglar solo el emisor dejaría
--  el 404 vivo para todo lo anterior.
-- ═══════════════════════════════════════════════════════════════════════

create or replace function public.tg_notificar_alerta_finanzas()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_nombre text;
begin
  select r.nombre into v_nombre
    from public.finanzas_alerta_regla r
   where r.id = new.regla_id;

  begin
    perform public.fn_notificar(
      p_tenant_id      => new.tenant_id,
      p_modulo         => 'financiero',
      p_tipo_codigo    => 'alerta_liquidez',
      p_prioridad      => 'importante',
      p_titulo         => coalesce(v_nombre, 'Alerta de liquidez'),
      p_origen_modulo  => 'finanzas',
      p_origen_entidad => 'finanzas_alerta_emitida',
      p_origen_evento  => 'alerta_emitida',
      p_origen_id      => new.id,
      p_cuerpo         => 'Se emitió una alerta de la regla de tesorería el ' || new.fecha_emision::text || '.',
      p_enlace         => '/finanzas/flujo-proyectado'
    );
  exception when others then
    raise warning 'EXS2_NOTIFICACION_OMITIDA: alerta finanzas % (%)', new.id, sqlerrm;
  end;

  return new;
end;
$$;

create or replace function public.tg_notificar_vencimiento_gobierno()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  begin
    perform public.fn_notificar(
      p_tenant_id      => new.tenant_id,
      p_modulo         => 'gobierno',
      p_tipo_codigo    => 'vencimiento_gobierno',
      p_prioridad      => 'importante',
      p_titulo         => 'Vencimiento próximo: ' || replace(new.tipo_vencimiento::text, '_', ' '),
      p_origen_modulo  => 'gobierno',
      p_origen_entidad => 'gobierno_vencimiento_notificaciones',
      p_origen_evento  => new.tipo_vencimiento::text,
      p_origen_id      => new.id,
      p_cuerpo         => 'Detectado el ' || new.fecha_deteccion::text || '.',
      p_enlace         => '/gobierno/tablero'
    );
  exception when others then
    raise warning 'EXS2_NOTIFICACION_OMITIDA: vencimiento gobierno % (%)', new.id, sqlerrm;
  end;

  return new;
end;
$$;

-- Las ya emitidas. Igualdad exacta: '/finanzas/flujo-proyectado' no debe
-- volver a reescribirse si esta migración se re-aplica, y ningún otro
-- enlace empieza por estas cadenas.
update public.notificaciones
   set enlace = '/finanzas/flujo-proyectado'
 where enlace = '/finanzas/flujo';

update public.notificaciones
   set enlace = '/gobierno/tablero'
 where enlace = '/gobierno';
