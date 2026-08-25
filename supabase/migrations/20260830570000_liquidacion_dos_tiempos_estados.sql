-- ═══════════════════════════════════════════════════════════════════════
--  L0 · Liquidación en dos tiempos — cimientos del esquema
--  Propietario: plan "Liquidación en dos tiempos" (2026-08-24), §4 y §6/L0
--
--  ═══ QUÉ PROBLEMA RESUELVE ═══
--
--  Hoy liquidar es un acto único e irreversible: `liquidacion_estado_t`
--  solo tiene ('completada','fallida') y un UNIQUE(tenant_id, periodo_id)
--  sin condición de estado, así que la segunda corrida sobre un periodo
--  choca contra la primera. No hay forma de ver el resultado antes de
--  comprometerlo, ni de repetir el cálculo mientras se corrigen datos.
--
--  Esta migración parte el acto en dos tiempos:
--
--    PRE_LIQUIDADA  →  cálculo completo, cero efectos, repetible N veces
--                      (cada corrida descarta la anterior del periodo)
--         │ solicitar         (auxiliar o administrador)
--         ▼
--    PENDIENTE_APROBACION → esperando decisión de un administrador
--         │ aprobar           (SOLO administrador)
--         ▼
--    APLICADA       →  irreversible: cargos, presupuesto, cierre de
--                      periodo y estados de cuenta (fn_aplicar_liquidacion,
--                      L3/L4/L5 — todavía no existe)
--
--  Ramas laterales: DESCARTADA (la reemplazó una corrida nueva),
--  RECHAZADA (el administrador dijo que no), ANULADA (L6, reversión por
--  contra-cargos), FALLIDA (el motor no pudo calcular).
--
--  ═══ POR QUÉ ENUM NATIVO Y NO lista_tipos (regla D-24) ═══
--
--  Mismo criterio exacto que `periodo_estado_t`, que 20260814160000
--  excluyó a propósito de la migración a lista_tipos: este vocabulario
--  no es descriptivo, es la máquina de estados que
--  guard_liquidacion_transicion valida en CADA transición y de la que
--  cuelga un acto irreversible sobre la contabilidad de la copropiedad.
--  Un valor inválido debe ser imposible por definición de tipo, no solo
--  por lógica de trigger — que es justamente la garantía que lista_tipos
--  no puede dar (sus filas son editables por el tenant). Confirmado con
--  el usuario tras plantearle el precedente (2026-08-24).
--
--  ═══ POR QUÉ SWAP DE TIPO Y NO ALTER TYPE ... ADD VALUE ═══
--
--  Postgres no permite USAR un valor de enum recién agregado dentro de la
--  misma transacción que lo agregó, y `supabase db push` corre cada
--  migración en una transacción. Como además hay que mapear las filas
--  existentes ('completada' → 'aplicada'), el swap de tipo resuelve las
--  dos cosas de una vez. Verificado antes de escribir esto: el enum lo usa
--  UNA sola columna en todo el esquema (liquidaciones.estado) y ninguna
--  función lo referencia, así que el swap no arrastra dependencias.
--
--  ═══ LAS 5 LIQUIDACIONES EXISTENTES EN DEV ═══
--
--  Las 5 filas 'completada' pasan a 'aplicada': son liquidaciones reales
--  que ya generaron cargos en el ledger, así que ese es su estado fiel.
--  NO se les retro-asigna aplicada_at/aprobada_por (no existe el dato) ni
--  se cierran sus periodos: la Edge Function de entonces nunca transicionó
--  `periodos.estado`, y reescribir esa historia sería inventarla. Quedan
--  como liquidaciones aplicadas sobre periodos que siguen abiertos —
--  anomalía conocida y acotada al entorno de desarrollo.
--
--  ═══ DELIBERADAMENTE FUERA DE ESTE CORTE ═══
--
--    • fn_liquidacion_prevuelo()        → L1
--    • simular-liquidacion              → L2
--    • fn_aplicar_liquidacion()         → L3 (los efectos de la transición
--                                          a 'aplicada'; este corte solo
--                                          define QUIÉN puede pedirla)
--    • presupuesto_ejecucion / caja     → L4
--    • estados de cuenta por lote       → L5
--    • fn_anular_liquidacion()          → L6
--
--  Las columnas de anulación SÍ se crean aquí, no en L6: el guard de
--  transición que se escribe ahora ya tiene que conocer el estado
--  'anulada', y un guard que valida una transición hacia un estado sin
--  columnas donde registrar quién y por qué sería incoherente. Lo que
--  llega en L6 es la lógica (los contra-cargos), no el espacio donde
--  anotarla.
-- ═══════════════════════════════════════════════════════════════════════


-- ═══════════════════════════════════════════════════════════════════════
--  1. El enum nuevo, por swap
-- ═══════════════════════════════════════════════════════════════════════

create type public.liquidacion_estado_nuevo_t as enum (
  'pre_liquidada',
  'pendiente_aprobacion',
  'rechazada',
  'aplicada',
  'descartada',
  'anulada',
  'fallida'
);

-- El COMMENT va también sobre el nombre transitorio, no solo sobre el final:
-- D-24 exige que TODO enum nuevo justifique por qué no es lista_tipos, y el
-- test de gobernanza escanea los `create type` — que aquí usa este nombre.
-- Sobrevive al rename de más abajo y luego se reemplaza por el definitivo.
comment on type public.liquidacion_estado_nuevo_t is
  'Nombre transitorio del swap de tipo (ver cabecera). El COMMENT definitivo, con la '
  'justificación D-24 completa, se aplica tras el rename.';

-- El default estorba el ALTER TYPE (se castearía con el tipo viejo).
alter table public.liquidaciones alter column estado drop default;

alter table public.liquidaciones
  alter column estado type public.liquidacion_estado_nuevo_t
  using (
    case estado::text
      when 'completada' then 'aplicada'
      when 'fallida'    then 'fallida'
    end
  )::public.liquidacion_estado_nuevo_t;

drop type public.liquidacion_estado_t;
alter type public.liquidacion_estado_nuevo_t rename to liquidacion_estado_t;

-- Una liquidación nace como Pre-Liquidación: cálculo hecho, nada comprometido.
alter table public.liquidaciones
  alter column estado set default 'pre_liquidada'::public.liquidacion_estado_t;

comment on type public.liquidacion_estado_t is
  'Máquina de estados de la liquidación en dos tiempos (plan 2026-08-24 §4). '
  'pre_liquidada → pendiente_aprobacion → aplicada es el camino feliz; descartada/rechazada/'
  'anulada/fallida son las salidas. ENUM y no lista_tipos por la misma razón que '
  'periodo_estado_t (D-24, 20260814160000): guard_liquidacion_transicion lo valida en cada '
  'transición y de él cuelga un acto irreversible sobre la contabilidad — un valor inválido '
  'debe ser imposible por definición de tipo, no solo por lógica de trigger.';


-- ═══════════════════════════════════════════════════════════════════════
--  2. Unicidad por estado — el cambio que desbloquea repetir el cálculo
-- ═══════════════════════════════════════════════════════════════════════
-- El UNIQUE original no distinguía estados, así que la segunda corrida
-- sobre un periodo era imposible. Se reemplaza por dos índices parciales
-- que dicen lo que de verdad hace falta:
--
--   · UN solo resultado definitivo por periodo (el invariante que
--     protegía el UNIQUE original, intacto).
--   · UNA sola liquidación viva por periodo — así un doble clic o dos
--     sesiones simultáneas no dejan dos Pre-Liquidaciones compitiendo,
--     y "la nueva descarta la anterior" (L2) es un invariante de base de
--     datos, no una promesa del código que la escribe.
--
-- Las filas en descartada/rechazada/anulada/fallida quedan fuera de ambos:
-- son historia, y de esas puede haber tantas como corridas se hicieron.

alter table public.liquidaciones drop constraint liquidaciones_periodo_unico;

create unique index liquidaciones_aplicada_unica
  on public.liquidaciones (tenant_id, periodo_id)
  where estado = 'aplicada';

create unique index liquidaciones_viva_unica
  on public.liquidaciones (tenant_id, periodo_id)
  where estado in ('pre_liquidada', 'pendiente_aprobacion');

comment on index public.liquidaciones_aplicada_unica is
  'Un solo resultado definitivo por periodo — el invariante que protegía liquidaciones_periodo_'
  'unico antes de que existieran las Pre-Liquidaciones.';

comment on index public.liquidaciones_viva_unica is
  'Una sola liquidación en curso por periodo. Hace que "una corrida nueva descarta la anterior" '
  'sea un invariante de la base, no una promesa del código que la escribe.';


-- ═══════════════════════════════════════════════════════════════════════
--  3. El snapshot congelado (Docs/17 §34 OPTIMISTIC SNAPSHOT)
-- ═══════════════════════════════════════════════════════════════════════
-- El riesgo que esto cierra: se revisa una Pre-Liquidación, alguien cambia
-- un coeficiente, y al aprobar se aplicaría algo distinto a lo revisado.
-- Con el snapshot y su hash congelados, fn_aplicar_liquidacion (L3) puede
-- recalcular el hash contra la base viva y rechazar si cambió — el control
-- de concurrencia optimista de Docs/17 §34.
--
-- Nullable: las 5 filas históricas no lo tienen y no se puede inventar.
-- Las nuevas siempre lo traen (simular-liquidacion, L2).

alter table public.liquidaciones
  add column snapshot      jsonb,
  add column snapshot_hash text;

comment on column public.liquidaciones.snapshot is
  'DataSnapshot completo con el que se calculó (Docs/17 §8-13). Null en las liquidaciones '
  'anteriores a esta migración — no existía el dato.';

comment on column public.liquidaciones.snapshot_hash is
  'Hash canónico del snapshot. fn_aplicar_liquidacion (L3) lo recalcula contra la base viva '
  'antes de escribir: si no coincide, algo cambió desde la Pre-Liquidación y se exige volver '
  'a simular (Docs/17 §34).';


-- ═══════════════════════════════════════════════════════════════════════
--  4. Trazabilidad del flujo de dos actores
-- ═══════════════════════════════════════════════════════════════════════
-- Tres actos distintos, tres pares (quién, cuándo). No se colapsan en uno
-- solo porque responden preguntas distintas ante una auditoría: quién
-- calculó, quién pidió aplicarla, quién la autorizó.
--
-- Nombres alineados con acciones_cobranza (20260822280000) donde el
-- concepto es el mismo — propuesta_por/aprobada_por/aprobada_at — para que
-- el patrón se lea igual en los dos módulos.

alter table public.liquidaciones
  add column simulada_por       uuid references public.profiles (id),
  add column simulada_at        timestamptz not null default now(),
  add column propuesta_por      uuid references public.profiles (id),
  add column propuesta_at       timestamptz,
  add column nota_solicitud     text,
  add column aprobada_por       uuid references public.profiles (id),
  add column aprobada_at        timestamptz,
  add column motivo_rechazo     text,
  add column aplicada_at        timestamptz,
  add column anulada_por        uuid references public.profiles (id),
  add column anulada_at         timestamptz,
  add column motivo_anulacion   text,
  add column updated_at         timestamptz;

comment on column public.liquidaciones.simulada_por is
  'Quién corrió el cálculo (creó la Pre-Liquidación). Asignado por guard_liquidacion_creacion '
  'desde auth.uid(), nunca confiado del cliente. Null cuando la escribió service_role sin '
  'sesión (Edge Function de sistema, fixtures).';

comment on column public.liquidaciones.propuesta_por is
  'Quién solicitó aplicarla (pre_liquidada → pendiente_aprobacion). Distinto de simulada_por: '
  'se puede simular muchas veces y solicitar una.';

comment on column public.liquidaciones.nota_solicitud is
  'Mensaje opcional de quien solicita para quien aprueba — el contexto que no cabe en los '
  'números ("la mora subió por las 6 unidades de la Torre 3").';

comment on column public.liquidaciones.aprobada_por is
  'Quién decidió pendiente_aprobacion → aplicada|rechazada. Como en acciones_cobranza, el '
  'nombre sirve a ambos desenlaces; cuál fue está en estado.';

comment on column public.liquidaciones.aplicada_at is
  'Cuándo se comprometió de verdad (cargos creados, periodo cerrado). Separado de aprobada_at '
  'porque L3 puede fallar después de aprobar: aprobada_at sin aplicada_at es exactamente el '
  'rastro de ese caso.';

create trigger set_updated_at before update on public.liquidaciones
  for each row execute function public.set_updated_at();


-- ═══════════════════════════════════════════════════════════════════════
--  5. Estado inicial válido + quién simuló
-- ═══════════════════════════════════════════════════════════════════════
-- Sin esto, un INSERT directo podría nacer ya en 'aplicada' y saltarse todo
-- el flujo — el guard de transición solo vigila UPDATE, nunca ve el INSERT.
-- Mismo hueco que guard_accion_cobranza_propuesta cierra en cobranza.

create function public.guard_liquidacion_creacion()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.estado not in ('pre_liquidada', 'fallida') then
    raise exception 'LIQUIDACION_ESTADO_INICIAL_INVALIDO: una liquidación solo puede crearse en '
      'pre_liquidada o fallida, no % — aplicar es una transición, no un punto de partida',
      new.estado;
  end if;

  new.simulada_por := (select auth.uid());
  return new;
end;
$$;

create trigger guard_liquidacion_creacion
  before insert on public.liquidaciones
  for each row execute function public.guard_liquidacion_creacion();

comment on function public.guard_liquidacion_creacion() is
  'Una liquidación nace calculada pero no comprometida. Cierra el hueco de que un INSERT '
  'directo naciera en aplicada saltándose el flujo (guard_liquidacion_transicion solo ve UPDATE).';


-- ═══════════════════════════════════════════════════════════════════════
--  6. El resultado del cálculo es inmutable
-- ═══════════════════════════════════════════════════════════════════════
-- Docs/20 §69 RESULT IMMUTABILITY. Antes de esta migración la tabla era de
-- facto inmutable porque nada la actualizaba nunca; ahora que el estado
-- transiciona, hay UPDATEs legítimos y hace falta decir explícitamente qué
-- NO puede cambiar en ellos.
--
-- Corregir un resultado es simular de nuevo (una fila nueva), jamás editar
-- el que ya se calculó — mismo principio que guard_accion_cobranza_
-- contexto_inmutable (REC-CAR-012).

create function public.guard_liquidacion_resultado_inmutable()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.tenant_id     is distinct from old.tenant_id
     or new.periodo_id    is distinct from old.periodo_id
     or new.result_hash   is distinct from old.result_hash
     or new.tenant_total  is distinct from old.tenant_total
     or new.snapshot      is distinct from old.snapshot
     or new.snapshot_hash is distinct from old.snapshot_hash
     or new.simulada_por  is distinct from old.simulada_por
     or new.simulada_at   is distinct from old.simulada_at
  then
    raise exception 'LIQUIDACION_RESULTADO_INMUTABLE: la liquidación % no admite modificar el '
      'resultado ni el snapshot con que se calculó (20 §69) — corregir es volver a simular, '
      'que crea una liquidación nueva', old.id;
  end if;
  return new;
end;
$$;

create trigger guard_liquidacion_resultado_inmutable
  before update on public.liquidaciones
  for each row execute function public.guard_liquidacion_resultado_inmutable();

comment on function public.guard_liquidacion_resultado_inmutable() is
  'Docs/20 §69 RESULT IMMUTABILITY: el estado y el rastro del flujo cambian; el resultado del '
  'cálculo y su snapshot, nunca. Corregir = simular de nuevo (fila nueva).';


-- ═══════════════════════════════════════════════════════════════════════
--  7. La máquina de estados
-- ═══════════════════════════════════════════════════════════════════════
-- Mismo patrón que guard_accion_cobranza_transicion (20260822280000) y
-- guard_periodo_transicion (20260814100300), con UNA diferencia deliberada
-- que conviene dejar escrita:
--
--   ═══ POR QUÉ AQUÍ SÍ SE PERMITE AUTOAPROBAR ═══
--
--   acciones_cobranza prohíbe que quien propone apruebe (ACCION_COBRANZA_
--   AUTOAPROBACION). Aquí NO, y es una decisión, no un olvido:
--
--     · En cobranza, la acción apunta a un residente concreto y el riesgo
--       es que una persona sola dirija una gestión de cobro contra otra.
--       Un segundo par de ojos es una salvaguarda real.
--     · Liquidar es un acto sobre TODA la copropiedad, y el administrador
--       es su responsable legal (Ley 675 art. 51). No hay a quién escalar:
--       prohibir la autoaprobación dejaría sin poder liquidar a cualquier
--       copropiedad donde el administrador sea el único usuario — que es
--       el caso más común del mercado objetivo.
--
--   Lo que sí queda garantizado es el rastro: propuesta_por y aprobada_por
--   se escriben siempre, así que "las dos fueron la misma persona" es un
--   hecho auditable, no algo que el sistema disimule.
--
-- La transición a 'aplicada' aquí solo valida QUIÉN puede pedirla. Los
-- EFECTOS (cargos, presupuesto, cierre de periodo, estados de cuenta) son
-- fn_aplicar_liquidacion, que llega en L3 y correrá en la misma
-- transacción que este UPDATE.

create function public.guard_liquidacion_transicion()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.estado = old.estado then
    return new;
  end if;

  if not (
    (old.estado = 'pre_liquidada'        and new.estado in ('pendiente_aprobacion', 'descartada'))
    or (old.estado = 'pendiente_aprobacion' and new.estado in ('aplicada', 'rechazada', 'descartada'))
    -- Rechazada vuelve a la mesa: se corrige lo señalado y se solicita otra vez, sin tener que
    -- recalcular si el snapshot sigue válido (fn_aplicar_liquidacion revalida el hash igual).
    or (old.estado = 'rechazada'         and new.estado in ('pendiente_aprobacion', 'descartada'))
    or (old.estado = 'aplicada'          and new.estado = 'anulada')
  ) then
    raise exception 'LIQUIDACION_TRANSICION_INVALIDA: la liquidación % no puede pasar de % a %',
      old.id, old.estado, new.estado;
  end if;

  -- ── solicitar aplicación ──────────────────────────────────────────────
  if new.estado = 'pendiente_aprobacion' then
    new.propuesta_por := coalesce((select auth.uid()), new.propuesta_por);
    new.propuesta_at  := now();
    -- Una solicitud nueva limpia el rechazo anterior: el motivo describía la solicitud que
    -- se rechazó, no esta.
    new.motivo_rechazo := null;
  end if;

  -- ── aprobar / rechazar — solo administrador ───────────────────────────
  if old.estado = 'pendiente_aprobacion' and new.estado in ('aplicada', 'rechazada') then
    -- auth.uid() null = service_role/fixture: cambio fuera de banda, mismo criterio que
    -- guard_accion_cobranza_transicion y guard_privileged_columns.
    if (select auth.uid()) is not null then
      if not public.has_role(new.tenant_id, array['administrador']::public.tenant_role_t[]) then
        raise exception 'LIQUIDACION_REQUIERE_ADMINISTRADOR: aprobar o rechazar la liquidación % '
          'requiere rol administrador — un auxiliar puede simular y solicitar, no comprometer '
          'la contabilidad de la copropiedad', old.id;
      end if;
    end if;
    new.aprobada_por := (select auth.uid());
    new.aprobada_at  := now();

    if new.estado = 'aplicada' then
      new.aplicada_at := now();
    end if;
  end if;

  -- ── anular (L6: los contra-cargos; aquí solo el rastro y el permiso) ──
  if new.estado = 'anulada' then
    if (select auth.uid()) is not null then
      if not public.has_role(new.tenant_id, array['administrador']::public.tenant_role_t[]) then
        raise exception 'LIQUIDACION_REQUIERE_ADMINISTRADOR: anular la liquidación % requiere '
          'rol administrador', old.id;
      end if;
    end if;
    if new.motivo_anulacion is null or btrim(new.motivo_anulacion) = '' then
      raise exception 'LIQUIDACION_ANULACION_SIN_MOTIVO: anular la liquidación % exige un motivo '
        'escrito — es el único rastro de por qué se revirtió', old.id;
    end if;
    new.anulada_por := (select auth.uid());
    new.anulada_at  := now();
  end if;

  return new;
end;
$$;

create trigger guard_liquidacion_transicion
  before update on public.liquidaciones
  for each row execute function public.guard_liquidacion_transicion();

comment on function public.guard_liquidacion_transicion() is
  'Máquina de estados de la liquidación en dos tiempos. Exige rol administrador para aprobar, '
  'rechazar y anular (un auxiliar simula y solicita). A diferencia de acciones_cobranza, NO '
  'prohíbe autoaprobar: liquidar es un acto sobre toda la copropiedad y el administrador es su '
  'responsable legal (Ley 675 art. 51) — prohibirlo dejaría sin liquidar a toda copropiedad con '
  'un solo usuario. El rastro (propuesta_por + aprobada_por) queda igual.';


-- ═══════════════════════════════════════════════════════════════════════
--  8. RLS — solicitar es un UPDATE del usuario, no una Edge Function
-- ═══════════════════════════════════════════════════════════════════════
-- Mismo criterio que acciones_cobranza: proponer/aprobar no tienen efectos
-- colaterales fuera de la propia fila, así que no necesitan Edge Function
-- — RLS decide quién puede tocar la tabla y el guard de transición decide
-- qué transición puede completar cada rol.
--
-- El INSERT sigue sin política para `authenticated`: crear una
-- Pre-Liquidación exige correr el motor, que es privilegiado (L2, Edge
-- Function con service_role) — igual que antes de esta migración.
--
-- La transición a 'aplicada' pasará por fn_aplicar_liquidacion (L3,
-- SECURITY DEFINER), pero se apoya en esta misma política: auth.uid()
-- sobrevive dentro de la función y el guard lo verá.

create policy liquidaciones_update_agent
  on public.liquidaciones for update
  to authenticated
  using (public.has_role(tenant_id, array['auxiliar']::public.tenant_role_t[]))
  with check (public.has_role(tenant_id, array['auxiliar']::public.tenant_role_t[]));

comment on table public.liquidaciones is
  'Liquidación de un periodo, en dos tiempos (plan 2026-08-24). Una Pre-Liquidación calcula sin '
  'comprometer nada y se puede repetir; solo la transición a aplicada crea cargos, cierra el '
  'periodo y emite estados de cuenta. El resultado calculado es inmutable (20 §69): corregir es '
  'volver a simular, nunca editar.';
