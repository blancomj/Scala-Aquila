-- ═══════════════════════════════════════════════════════════════════════
--  Fase 5 (5A) del plan "Conceptos avanzados" — Alcance: condiciones de
--  aplicación. Decisiones del usuario (2026-08-20):
--   - alcance='calculado' + modo_calculo='distribucion': el reparto se
--     hace SOLO entre los inmuebles que cumplen la condición (coeficientes
--     recalculados sobre ese subconjunto) — no sobre todo el edificio.
--     Se implementa en 5B (executor.ts), aquí solo se deja el esquema.
--   - "Uso del Predio" se incluye como campo de condición: se agrega
--     inmuebles.uso_predio_id (el catálogo USO_PREDIO ya existía sembrado
--     desde 20260814180000, sin consumidor hasta ahora).
--   - "Fin Periodo contable" se descarta del vocabulario — no hay un
--     concepto de cierre contable definido en el esquema, no se inventa
--     uno para esta fase.
--
--  AEL no tiene operadores lógicos Y/O/NO (AD-21, límite deliberado v0) —
--  las condiciones no pueden ser una fórmula AEL, van en su propio árbol
--  jsonb: {op: 'and'|'or', condiciones: [...]} con hojas
--  {campo, operador, valor}. El vocabulario cerrado de `campo` y su
--  validación de forma viven en TypeScript (alcance.ts, Fase 5B) — el
--  jsonb aquí es deliberadamente sin esquema rígido en SQL, mismo criterio
--  que entradas/resultado_esperado en concepto_test_cases.
--
--  Regla de oro de la sesión (ya aplicada en modo_valor/tipo_recurrencia/
--  periodicidad): toda columna nueva en conceptos entra también a
--  guard_concepto_transicion() y a concepto_versiones, en la misma
--  migración — verificado leyendo el estado actual de ambos antes de
--  escribir esto (pg_get_functiondef en vivo), no de memoria.
-- ═══════════════════════════════════════════════════════════════════════

create type public.concepto_alcance_t as enum ('todos', 'calculado');

alter table public.conceptos
  add column alcance public.concepto_alcance_t not null default 'todos',
  add column alcance_condiciones jsonb;

alter table public.conceptos alter column alcance drop default;

alter table public.conceptos
  add constraint conceptos_alcance_consistente
  check (
    (alcance = 'todos' and alcance_condiciones is null)
    or (alcance = 'calculado' and alcance_condiciones is not null)
  );

-- ── guard_concepto_transicion(): alcance/alcance_condiciones también son
--    "contenido" — solo editables en borrador, mismo criterio que el
--    resto de columnas de configuración del concepto. ────────────────────
create or replace function public.guard_concepto_transicion()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_contenido_cambio boolean;
begin
  v_contenido_cambio := (
    new.nombre is distinct from old.nombre
    or new.modo_calculo is distinct from old.modo_calculo
    or new.formula_ael is distinct from old.formula_ael
    or new.prioridad is distinct from old.prioridad
    or new.modo_valor is distinct from old.modo_valor
    or new.valor_fijo is distinct from old.valor_fijo
    or new.tipo_recurrencia is distinct from old.tipo_recurrencia
    or new.fecha_inicio_anio is distinct from old.fecha_inicio_anio
    or new.fecha_inicio_mes is distinct from old.fecha_inicio_mes
    or new.fecha_fin_anio is distinct from old.fecha_fin_anio
    or new.fecha_fin_mes is distinct from old.fecha_fin_mes
    or new.periodicidad is distinct from old.periodicidad
    or new.alcance is distinct from old.alcance
    or new.alcance_condiciones is distinct from old.alcance_condiciones
  );

  if v_contenido_cambio and old.estado <> 'borrador' then
    raise exception 'CONCEPTO_INMUTABLE: % está en estado % — solo se puede editar el contenido en borrador (Doc 10 §27)',
      old.id, old.estado;
  end if;

  if new.estado = old.estado then
    return new;
  end if;

  if not (
    (old.estado = 'borrador' and new.estado = 'en_revision')
    or (old.estado = 'en_revision' and new.estado = 'borrador')
    or (old.estado = 'en_revision' and new.estado = 'activo')
    or (old.estado = 'activo' and new.estado = 'borrador')
    or (old.estado = 'activo' and new.estado = 'archivado')
    or (old.estado = 'borrador' and new.estado = 'archivado')
  ) then
    raise exception 'INVALID_TRANSITION: concepto % no puede pasar de % a %',
      old.id, old.estado, new.estado;
  end if;

  if old.estado = 'borrador' and new.estado = 'en_revision' then
    new.enviado_a_revision_por := auth.uid();
    new.enviado_a_revision_at := now();
  end if;

  if old.estado = 'en_revision' and new.estado = 'activo' then
    if auth.uid() is not null and old.enviado_a_revision_por = auth.uid() then
      raise exception 'SELF_APPROVAL: no puedes aprobar tu propia solicitud de revisión (concepto %)',
        old.id;
    end if;
    new.aprobado_por := auth.uid();
    new.aprobado_at := now();
  end if;

  return new;
end;
$$;

-- ── concepto_versiones: mismos 2 campos, historial completo ─────────────
alter table public.concepto_versiones
  add column alcance public.concepto_alcance_t,
  add column alcance_condiciones jsonb;

-- ── inmuebles.uso_predio_id — catálogo USO_PREDIO ya sembrado, sin dueño
--    hasta ahora. Nullable: ningún inmueble existente ha sido clasificado,
--    no hay valor de verdad para backfillear. ────────────────────────────
alter table public.inmuebles
  add column uso_predio_id bigint references public.lista_tipos (id);

create index inmuebles_uso_predio_idx on public.inmuebles (uso_predio_id);
