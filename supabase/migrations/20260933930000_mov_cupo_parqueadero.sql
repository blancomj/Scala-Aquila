-- ═══════════════════════════════════════════════════════════════════════
--  MOV-1 (extra) · El cupo de parqueadero: una columna nueva, no dos
--
--  ESTA MIGRACIÓN SE ESCRIBIÓ DOS VECES, y la primera versión es la
--  lección. Añadía `cupo_inmueble_id` a `vehiculo_permiso` "para no crear
--  un inventario paralelo de cupos"... sin ver que `inmueble_id` YA ERA
--  eso. El comentario que EXS-5 puso en esa columna lo dice sin margen:
--
--      'Parqueadero asignado, cuando lo hay. Es un inmueble más: no se
--       crea un segundo modelo de parqueaderos (prompt 04 §19/§20).'
--
--  La decisión ya estaba tomada y documentada, y la primera versión de
--  esta migración la habría duplicado — el mismo error contra el que su
--  propia cabecera advertía. Se deja escrito porque el patrón se repite:
--  antes de añadir una columna a una tabla ajena, leer los comentarios de
--  las que ya tiene.
--
--  LO QUE SÍ FALTABA es la otra figura jurídica. En derecho colombiano un
--  parqueadero es una de dos cosas, y el repositorio solo cubría una:
--
--   · BIEN PRIVADO → un `inmuebles` de tipo `parqueadero`, con matrícula y
--     coeficiente. Ya se expresaba con `inmueble_id`. No se toca.
--   · ÁREA COMÚN DE USO EXCLUSIVO → una `zonas_comunes` con
--     `uso_exclusivo_inmueble_id`. No se podía expresar. Se añade
--     `cupo_zona_id`.
--
--  Dos FKs nullable excluyentes, y no una columna polimórfica
--  ("cupo_id + cupo_tipo"): esa habría perdido la integridad referencial,
--  que es justo lo que impide que un permiso apunte a un cupo inexistente.
--
--  TRES REGLAS QUE EL GUARD NO TENÍA, y que no nacen de este corte pero se
--  cierran aquí porque son el mismo camino de código:
--
--   1. el inmueble citado es de esta copropiedad — `guard_vehiculo_permiso`
--      validaba el tenant del vehículo pero NO el del inmueble;
--   2. el inmueble citado es de tipo `parqueadero`. Asignar el
--      apartamento 502 como cupo es un error de captura que hoy nadie
--      atrapa y que solo se nota leyendo el informe de parqueaderos;
--   3. un cupo, un permiso vigente. Sin esto dos carros pueden tener
--      asignado el mismo espacio sin que el sistema se entere — que es la
--      diferencia entre controlar la capacidad y solo anotarla.
-- ═══════════════════════════════════════════════════════════════════════

alter table public.vehiculo_permiso
  add column cupo_zona_id uuid references public.zonas_comunes (id) on delete set null,
  add constraint vehiculo_permiso_cupo_excluyente
    check (inmueble_id is null or cupo_zona_id is null);

comment on column public.vehiculo_permiso.cupo_zona_id is
  'MOV-1 — el cupo cuando el parqueadero es ÁREA COMÚN DE USO EXCLUSIVO (zonas_comunes con '
  'uso_exclusivo_inmueble_id), la figura que `inmueble_id` no podía representar porque no es un '
  'inmueble con matrícula. Excluyente con inmueble_id: un permiso apunta a un espacio, y ese '
  'espacio es privado o es común, nunca las dos cosas.';

comment on column public.vehiculo_permiso.inmueble_id is
  'Parqueadero asignado cuando es BIEN PRIVADO, con matrícula y coeficiente propios: es un '
  'inmueble más, no un segundo modelo de parqueaderos (prompt 04 §19/§20). Desde MOV-1 '
  '(20260933930000) el guard exige que sea de tipo `parqueadero` y del mismo tenant, y un índice '
  'único parcial impide que dos permisos vigentes se lo repartan. Para el parqueadero común de '
  'uso exclusivo, ver cupo_zona_id.';

-- Un espacio no puede estar asignado a dos vehículos a la vez. Parciales
-- sobre 'vigente': el histórico de quién lo tuvo antes se conserva entero.
create unique index vehiculo_permiso_cupo_inmueble_unico
  on public.vehiculo_permiso (inmueble_id)
  where inmueble_id is not null and estado = 'vigente';

create unique index vehiculo_permiso_cupo_zona_unico
  on public.vehiculo_permiso (cupo_zona_id)
  where cupo_zona_id is not null and estado = 'vigente';

-- ── El guard ───────────────────────────────────────────────────────────
--
--  Se extiende el existente en vez de añadir un trigger nuevo: ya corre
--  BEFORE INSERT OR UPDATE sobre esta tabla, y dos triggers sobre lo mismo
--  obligarían a razonar su orden alfabético — la fragilidad que EXS-8
--  documentó.
--
--  El cuerpo hasta el bloque MOV-1 es el ORIGINAL de 20260933320000,
--  copiado literal y no reescrito de memoria. Se intentó lo segundo y se
--  perdieron dos reglas sin que ninguna prueba lo notara: el bloqueo de
--  permisos vigentes a un vehículo retirado, y el sellado de
--  `revocado_at`/`revocado_por`.

create or replace function public.guard_vehiculo_permiso()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_tipo        text;
  v_vehiculo    record;
  v_tenant_cupo uuid;
  v_tipo_cupo   text;
  v_tenant_zona uuid;
begin
  select tipo into v_tipo from public.lista_tipos where id = new.tipo_id;
  if v_tipo is distinct from 'TIPO_PERMISO_VEHICULO' then
    raise exception 'PERMISO_VEHICULO_TIPO_INVALIDO: % no pertenece a TIPO_PERMISO_VEHICULO',
      new.tipo_id;
  end if;

  select tenant_id, estado into v_vehiculo from public.vehiculos where id = new.vehiculo_id;
  if v_vehiculo.tenant_id is null or v_vehiculo.tenant_id <> new.tenant_id then
    raise exception 'PERMISO_VEHICULO_TENANT_INCONSISTENTE: el vehículo % no pertenece al tenant',
      new.vehiculo_id;
  end if;

  -- Un vehículo retirado no puede recibir permisos nuevos: retirar es
  -- terminal y su placa ya puede estar en uso por otro carro.
  if v_vehiculo.estado = 'retirado' and new.estado = 'vigente' then
    raise exception 'PERMISO_VEHICULO_RETIRADO: el vehículo % está retirado y no puede recibir '
      'permisos vigentes', new.vehiculo_id;
  end if;

  -- ── MOV-1 · el cupo como bien privado ───────────────────────────────
  if new.inmueble_id is not null then
    select i.tenant_id, lt.codigo into v_tenant_cupo, v_tipo_cupo
      from public.inmuebles i
      join public.lista_tipos lt on lt.id = i.tipo_id
     where i.id = new.inmueble_id;

    if v_tenant_cupo is distinct from new.tenant_id then
      raise exception 'CUPO_INVALIDO: el cupo % no pertenece al tenant %',
        new.inmueble_id, new.tenant_id;
    end if;
    if v_tipo_cupo is distinct from 'parqueadero' then
      raise exception 'CUPO_NO_ES_PARQUEADERO: el inmueble % es de tipo % y no puede asignarse '
        'como cupo de parqueadero', new.inmueble_id, coalesce(v_tipo_cupo, 'desconocido');
    end if;
  end if;

  -- ── MOV-1 · el cupo como área común de uso exclusivo ────────────────
  if new.cupo_zona_id is not null then
    select tenant_id into v_tenant_zona
      from public.zonas_comunes where id = new.cupo_zona_id;
    if v_tenant_zona is distinct from new.tenant_id then
      raise exception 'CUPO_INVALIDO: la zona % no pertenece al tenant %',
        new.cupo_zona_id, new.tenant_id;
    end if;
  end if;

  if new.estado = 'revocado' and (tg_op = 'INSERT' or old.estado <> 'revocado') then
    new.revocado_at := coalesce(new.revocado_at, now());
    new.revocado_por := coalesce(new.revocado_por, (select auth.uid()));
  end if;

  return new;
end;
$$;
