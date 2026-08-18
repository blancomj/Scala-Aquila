-- ═══════════════════════════════════════════════════════════════════════
--  E8 · Reparentar cuentas presupuestales — pieza que había quedado fuera
--  de la pantalla de administración del catálogo
--  (apps/web/app/pages/presupuesto/cuentas.vue)
--
--  Motivación: guard_presupuesto_cuenta_arbol (20260823200000) solo
--  recalcula nivel/ruta de la fila que se escribe — si esa fila tiene
--  descendientes, quedaban con nivel/ruta desactualizados respecto a su
--  nueva posición real en el árbol. Por eso "mover una cuenta a otro
--  padre" se dejó fuera de la primera entrega en vez de construir algo
--  que dejara datos inconsistentes.
--
--  Esta migración resuelve las dos piezas que faltaban para que
--  reparentar sea seguro:
--    1. guard_presupuesto_cuenta_arbol gana una validación de profundidad
--       al reasignar padre: si el descendiente más lejano del subárbol
--       terminaría en un nivel > 4, se rechaza (CUENTA_PROFUNDIDAD_EXCEDIDA)
--       antes de escribir nada.
--    2. propagar_presupuesto_cuenta_ruta (trigger AFTER UPDATE OF
--       parent_id, nuevo) — una vez que la fila reasignada ya tiene su
--       nivel/ruta correctos (los puso el guard BEFORE), actualiza en
--       cascada el nivel/ruta de TODOS sus descendientes reemplazando el
--       prefijo de ruta antiguo por el nuevo y desplazando nivel por el
--       mismo delta. Solo toca nivel/ruta (no parent_id/naturaleza/orden),
--       así que no reactiva ninguno de los dos triggers — sin recursión.
--
--  La naturaleza sigue siendo inmutable después de creada una cuenta (sin
--  cambios aquí) — reparentar solo mueve el nodo entre padres de la MISMA
--  naturaleza, el guard ya lo exigía y lo sigue exigiendo.
--
--  Deliberadamente FUERA de esta migración: cambiar `orden` de una cuenta
--  con hijos deja el último segmento de `ruta` de los descendientes
--  desactualizado (ver comentario original en la columna `ruta`,
--  20260823200000) — es un problema puramente de orden de despliegue, no
--  de jerarquía real (nivel no cambia), así que se mantiene como
--  limitación conocida y aceptada, no se toca aquí.
-- ═══════════════════════════════════════════════════════════════════════

create or replace function public.guard_presupuesto_cuenta_arbol()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_parent public.presupuesto_cuenta%rowtype;
  v_profundidad_relativa int;
begin
  -- Profundidad relativa del subárbol de la fila que se reasigna — cuánto más profundo que
  -- ella misma llega su descendiente más lejano. Se necesita en las dos ramas de abajo
  -- (reasignar a raíz o a otro padre), por eso se calcula antes de bifurcar. NULL si no es un
  -- UPDATE con cambio de padre (INSERT, o UPDATE que no toca parent_id) — inofensivo, las
  -- comparaciones con NULL más abajo son siempre falsas en plpgsql.
  if tg_op = 'update' and old.parent_id is distinct from new.parent_id then
    select coalesce(max(nivel) - old.nivel, 0) into v_profundidad_relativa
    from (
      with recursive descendientes as (
        select id, nivel from public.presupuesto_cuenta where parent_id = old.id
        union all
        select c.id, c.nivel from public.presupuesto_cuenta c join descendientes d on c.parent_id = d.id
      )
      select nivel from descendientes
    ) sub;
  end if;

  if new.parent_id is null then
    if v_profundidad_relativa > 3 then
      raise exception 'CUENTA_PROFUNDIDAD_EXCEDIDA: mover % a cuenta raíz dejaría descendientes '
        'en nivel % (máximo 4)', old.id, 1 + v_profundidad_relativa;
    end if;
    new.nivel := 1;
    new.ruta := lpad(new.orden::text, 4, '0');
    return new;
  end if;

  select * into v_parent from public.presupuesto_cuenta where id = new.parent_id;

  if v_parent.id is null then
    raise exception 'CUENTA_PADRE_INEXISTENTE: parent_id % no existe', new.parent_id;
  end if;

  if v_parent.tenant_id <> new.tenant_id then
    raise exception 'CUENTA_TENANT_INCONSISTENTE: la cuenta padre % pertenece a otro tenant',
      new.parent_id;
  end if;

  if tg_op = 'update' then
    if new.parent_id in (
      with recursive descendientes as (
        select id from public.presupuesto_cuenta where parent_id = old.id
        union all
        select c.id from public.presupuesto_cuenta c join descendientes d on c.parent_id = d.id
      )
      select id from descendientes
    ) then
      raise exception 'CUENTA_CICLO: % no puede reasignarse bajo su propio descendiente %',
        old.id, new.parent_id;
    end if;

    if old.parent_id is distinct from new.parent_id
       and (v_parent.nivel + 1 + v_profundidad_relativa) > 4 then
      raise exception 'CUENTA_PROFUNDIDAD_EXCEDIDA: mover % bajo % dejaría descendientes en '
        'nivel % (máximo 4)', old.id, new.parent_id, v_parent.nivel + 1 + v_profundidad_relativa;
    end if;
  end if;

  if v_parent.naturaleza <> new.naturaleza then
    raise exception 'CUENTA_NATURALEZA_MEZCLADA: % no puede colgar de % — no se mezcla '
      'ingreso/egreso bajo el mismo nodo (E8)', new.naturaleza, v_parent.naturaleza;
  end if;

  if v_parent.nivel >= 4 then
    raise exception 'CUENTA_PROFUNDIDAD_MAXIMA: % ya está en el nivel máximo (4) — no admite '
      'hijos', v_parent.id;
  end if;

  new.nivel := v_parent.nivel + 1;
  new.ruta := v_parent.ruta || '.' || lpad(new.orden::text, 4, '0');

  if v_parent.es_hoja then
    update public.presupuesto_cuenta set es_hoja = false where id = v_parent.id;
  end if;

  return new;
end;
$$;

-- ── cascada: al reasignar padre, nivel/ruta de los descendientes también cambian ──
create function public.propagar_presupuesto_cuenta_ruta()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.parent_id is distinct from new.parent_id then
    with recursive descendientes as (
      select id, ruta, nivel from public.presupuesto_cuenta where parent_id = new.id
      union all
      select c.id, c.ruta, c.nivel
      from public.presupuesto_cuenta c
      join descendientes d on c.parent_id = d.id
    )
    update public.presupuesto_cuenta pc
    set ruta = new.ruta || substring(d.ruta from length(old.ruta) + 1),
        nivel = pc.nivel + (new.nivel - old.nivel)
    from descendientes d
    where pc.id = d.id;
  end if;
  return null;
end;
$$;

comment on function public.propagar_presupuesto_cuenta_ruta() is
  'AFTER UPDATE OF parent_id en presupuesto_cuenta (E8) — recalcula nivel/ruta de todos los '
  'descendientes tras un reparentado. Solo escribe nivel/ruta, nunca parent_id/naturaleza/orden, '
  'así que no reactiva guard_presupuesto_cuenta_arbol ni a sí mismo (sin recursión).';

create trigger propagar_presupuesto_cuenta_ruta
  after update of parent_id on public.presupuesto_cuenta
  for each row execute function public.propagar_presupuesto_cuenta_ruta();
