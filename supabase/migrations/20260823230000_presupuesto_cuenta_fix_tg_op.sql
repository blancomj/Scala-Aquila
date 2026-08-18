-- ═══════════════════════════════════════════════════════════════════════
--  E8 · Fix real: TG_OP siempre es MAYÚSCULA ('INSERT'/'UPDATE'/'DELETE')
--
--  guard_presupuesto_cuenta_arbol (20260823200000/210000) comparaba
--  `tg_op = 'update'` en minúscula — nunca es cierto, porque PL/pgSQL
--  siempre pone TG_OP en mayúscula (confirmado contra el resto del
--  proyecto: 20260813190400_triggers.sql y 20260814190000_purga_audit_log.sql
--  sí lo hacen bien, en MAYÚSCULA). El resultado real, encontrado recién
--  al escribir el test automatizado de esto (tests/rls/
--  presupuesto-cuenta-arbol.test.ts) — la verificación manual anterior no
--  lo detectó porque el patrón "DO block con exception when others" no
--  distinguía "el guard rechazó" de "mi propia excepción de control
--  disparó porque el guard no rechazó nada":
--    • El check de ciclo (CUENTA_CICLO) nunca se ejecutaba en un UPDATE
--      real — permitía crear un ciclo real en parent_id.
--    • El check de profundidad al reparentar (CUENTA_PROFUNDIDAD_EXCEDIDA)
--      tampoco — dejaba pasar movidas que violaban el nivel máximo (el
--      CHECK nivel_valido de la tabla terminaba rechazándolo, pero con un
--      mensaje genérico de Postgres, no el error explicado).
--    • Con un ciclo real ya escrito en la tabla, la CTE recursiva de
--      propagar_presupuesto_cuenta_ruta (sin límite de profundidad) queda
--      recorriendo el ciclo sin parar — el timeout del test (5s) es
--      exactamente ese bucle infinito, no una lentitud normal.
--
--  Único cambio: 'update' → 'UPDATE' en las dos comparaciones. El resto
--  de la función queda idéntico a como la dejó 20260823210000.
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
  if tg_op = 'UPDATE' and old.parent_id is distinct from new.parent_id then
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

  if tg_op = 'UPDATE' then
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
