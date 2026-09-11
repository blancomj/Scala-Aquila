-- ═══════════════════════════════════════════════════════════════════════
--  EXS-2 · Notificaciones in-app (4/4) — puentes desde las detecciones
--  Casos de uso/Experiencia y servicios/EXS_02_INFORME.md
--
--  Las tres detecciones que ya existían pasan a emitir un aviso dirigido.
--  Ninguna de las tres tablas se modifica: se les cuelga un trigger
--  AFTER INSERT y nada más. La detección sigue siendo la fuente de verdad
--  de "esto ocurrió"; la notificación solo es "y a alguien le interesa".
--
--  AFTER INSERT, no BEFORE: fn_notificar lee lista_tipos y escribe en otra
--  tabla; en BEFORE la fila que origina el aviso aún no existe y cualquier
--  FK o consulta que la busque fallaría.
--
--  Los triggers NO fallan la operación que los dispara. Una alerta de
--  stock debe registrarse aunque su aviso no se pueda emitir — de ahí el
--  bloque exception de cada uno: la detección es el dato duro, la
--  notificación es conveniencia.
-- ═══════════════════════════════════════════════════════════════════════

-- ── 1 · Finanzas: alerta de liquidez → módulo financiero ───────────────

create function public.tg_notificar_alerta_finanzas()
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
      p_enlace         => '/finanzas/flujo'
    );
  exception when others then
    raise warning 'EXS2_NOTIFICACION_OMITIDA: alerta finanzas % (%)', new.id, sqlerrm;
  end;

  return new;
end;
$$;

create trigger notificar_alerta_finanzas
  after insert on public.finanzas_alerta_emitida
  for each row execute function public.tg_notificar_alerta_finanzas();

-- ── 2 · Mantenimiento: alerta de inventario → módulo mantenimiento ─────

create function public.tg_notificar_alerta_inventario()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_repuesto text;
  v_prioridad text;
begin
  select r.nombre into v_repuesto
    from public.mant_repuestos r
   where r.id = new.repuesto_id;

  -- sin_stock detiene trabajo; stock_bajo/punto_reorden solo avisan.
  v_prioridad := case when new.tipo_alerta = 'sin_stock' then 'critica' else 'importante' end;

  begin
    perform public.fn_notificar(
      p_tenant_id      => new.tenant_id,
      p_modulo         => 'mantenimiento',
      p_tipo_codigo    => 'alerta_inventario',
      p_prioridad      => v_prioridad,
      p_titulo         => coalesce(v_repuesto, 'Repuesto') || ': ' || replace(new.tipo_alerta::text, '_', ' '),
      p_origen_modulo  => 'mantenimiento',
      p_origen_entidad => 'mant_inventario_alertas',
      p_origen_evento  => new.tipo_alerta::text,
      p_origen_id      => new.id,
      p_cuerpo         => 'Existencia actual: ' || new.stock_actual::text || '.',
      p_enlace         => '/mantenimiento/inventario'
    );
  exception when others then
    raise warning 'EXS2_NOTIFICACION_OMITIDA: alerta inventario % (%)', new.id, sqlerrm;
  end;

  return new;
end;
$$;

create trigger notificar_alerta_inventario
  after insert on public.mant_inventario_alertas
  for each row execute function public.tg_notificar_alerta_inventario();

-- ── 3 · Gobierno: vencimiento detectado → módulo gobierno ──────────────
--
--  'gobierno' no figura hoy en rol_funcional_modulo, y es correcto que no
--  figure: no existe ningún rol funcional de gobierno. La consecuencia,
--  por la semántica de puede_ver_modulo(), es que estos avisos los ven los
--  administradores y quien no tenga ningún rol funcional asignado — que es
--  el comportamiento deseado para vencimientos de órganos y plazos
--  legales. Si algún día se crea un rol funcional de gobierno, basta
--  sembrar su fila en rol_funcional_modulo y el gate se estrecha solo.

create function public.tg_notificar_vencimiento_gobierno()
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
      p_enlace         => '/gobierno'
    );
  exception when others then
    raise warning 'EXS2_NOTIFICACION_OMITIDA: vencimiento gobierno % (%)', new.id, sqlerrm;
  end;

  return new;
end;
$$;

create trigger notificar_vencimiento_gobierno
  after insert on public.gobierno_vencimiento_notificaciones
  for each row execute function public.tg_notificar_vencimiento_gobierno();

-- Las funciones de trigger no se exponen vía PostgREST (RETURNS trigger),
-- pero el advisor las marca igual y el proyecto ya revoca EXECUTE por
-- higiene — mismo criterio que 20260932520000.
revoke execute on function public.tg_notificar_alerta_finanzas() from public, authenticated, anon;
revoke execute on function public.tg_notificar_alerta_inventario() from public, authenticated, anon;
revoke execute on function public.tg_notificar_vencimiento_gobierno() from public, authenticated, anon;
