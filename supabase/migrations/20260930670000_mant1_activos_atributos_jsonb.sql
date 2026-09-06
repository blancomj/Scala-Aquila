-- ═══════════════════════════════════════════════════════════════════════
--  MANT-1 · Atributos técnicos dinámicos y criticidad (2/4)
--
--  Este archivo: columna activos.atributos (jsonb) — no se toca la migración
--  ya aplicada 20260930280000 (disciplina de migraciones inmutables), se
--  agrega con ALTER TABLE — su trigger de validación contra
--  mant_atributo_definicion, la exigencia de obligatorios al entrar a
--  en_servicio, y mant_atributos_huerfanos (§3.2).
-- ═══════════════════════════════════════════════════════════════════════

alter table public.activos
  add column atributos jsonb not null default '{}'::jsonb;

comment on column public.activos.atributos is
  'MANT-1 §3.2: valores de atributos técnicos, validados contra mant_atributo_definicion por '
  'guard_activo_atributos. Cambiar el esquema del tipo no borra estas claves — las que dejen de '
  'estar definidas se reportan como huérfanas por mant_atributos_huerfanos, nunca se purgan solas.';

-- ── Guard: toda clave de atributos existe en el esquema del tipo, y su ──
--    valor corresponde al tipo_dato declarado (§3.2) ─────────────────────
create function public.guard_activo_atributos()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_clave  text;
  v_valor  jsonb;
  v_def    public.mant_atributo_definicion%rowtype;
begin
  for v_clave, v_valor in select * from jsonb_each(new.atributos)
  loop
    select * into v_def
      from public.mant_atributo_definicion
     where tenant_id = new.tenant_id and tipo_activo_id = new.tipo_id and codigo = v_clave;

    if not found then
      raise exception 'ATRIBUTO_NO_DEFINIDO: % no está definido para este tipo de activo '
        '(MANT-1 §3.2)', v_clave;
    end if;

    case v_def.tipo_dato
      when 'numero' then
        if jsonb_typeof(v_valor) <> 'number' then
          raise exception 'ATRIBUTO_TIPO_INVALIDO: % exige un número, se recibió %',
            v_clave, jsonb_typeof(v_valor);
        end if;
      when 'texto' then
        if jsonb_typeof(v_valor) <> 'string' then
          raise exception 'ATRIBUTO_TIPO_INVALIDO: % exige texto, se recibió %',
            v_clave, jsonb_typeof(v_valor);
        end if;
      when 'booleano' then
        if jsonb_typeof(v_valor) <> 'boolean' then
          raise exception 'ATRIBUTO_TIPO_INVALIDO: % exige booleano, se recibió %',
            v_clave, jsonb_typeof(v_valor);
        end if;
      when 'fecha' then
        if jsonb_typeof(v_valor) <> 'string' then
          raise exception 'ATRIBUTO_TIPO_INVALIDO: % exige fecha, se recibió %',
            v_clave, jsonb_typeof(v_valor);
        end if;
        begin
          perform (v_valor #>> '{}')::date;
        exception when others then
          raise exception 'ATRIBUTO_TIPO_INVALIDO: % exige una fecha válida (ISO 8601), se '
            'recibió %', v_clave, v_valor #>> '{}';
        end;
      when 'opcion' then
        if jsonb_typeof(v_valor) <> 'string' then
          raise exception 'ATRIBUTO_TIPO_INVALIDO: % exige una opción de texto, se recibió %',
            v_clave, jsonb_typeof(v_valor);
        end if;
        if not (v_valor #>> '{}') = any (v_def.opciones) then
          raise exception 'ATRIBUTO_OPCION_INVALIDA: % no está entre las opciones válidas de % '
            '(%)', v_valor #>> '{}', v_clave, array_to_string(v_def.opciones, ', ');
        end if;
    end case;
  end loop;

  return new;
end;
$$;

comment on function public.guard_activo_atributos() is
  'MANT-1 §3.2: cada clave de activos.atributos debe existir en mant_atributo_definicion para '
  '(tenant_id, tipo_id) y su valor debe corresponder al tipo_dato declarado. No valida '
  'obligatoriedad — eso lo hace guard_activo_atributos_obligatorios, atado al ciclo de vida.';

create trigger activos_guard_atributos
  before insert or update on public.activos
  for each row execute function public.guard_activo_atributos();

-- ── Guard: atributos obligatorios presentes al ENTRAR a en_servicio ─────
--    (§3.2 — "los atributos obligatorios deben estar presentes al pasar el
--    activo a en_servicio"; no al crearlo ni al permanecer en otro estado) ─
create function public.guard_activo_atributos_obligatorios()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_faltante record;
begin
  if new.estado <> 'en_servicio' then
    return new;
  end if;
  if tg_op = 'UPDATE' and old.estado = 'en_servicio' then
    return new;
  end if;

  select codigo, nombre into v_faltante
    from public.mant_atributo_definicion
   where tenant_id = new.tenant_id
     and tipo_activo_id = new.tipo_id
     and obligatorio
     and not (new.atributos ? codigo)
   limit 1;

  if found then
    raise exception 'ATRIBUTO_OBLIGATORIO_FALTANTE: % (%) es obligatorio y no está presente '
      'antes de pasar a en_servicio (MANT-1 §3.2)', v_faltante.nombre, v_faltante.codigo;
  end if;

  return new;
end;
$$;

comment on function public.guard_activo_atributos_obligatorios() is
  'MANT-1 §3.2: se dispara en cualquier INSERT o UPDATE que deje al activo en estado '
  '''en_servicio'' viniendo de un estado distinto (o creado directo en ese estado) — no en cada '
  'UPDATE mientras ya estaba en_servicio, para no re-validar sin necesidad.';

create trigger activos_guard_atributos_obligatorios
  before insert or update on public.activos
  for each row execute function public.guard_activo_atributos_obligatorios();

-- ── §3.2 Atributos huérfanos: valores cuya clave ya no está definida ────
create function public.mant_atributos_huerfanos(p_tenant_id uuid)
returns table (
  activo_id     uuid,
  activo_codigo text,
  clave         text,
  valor         jsonb
)
language sql
stable
security invoker
set search_path = ''
as $$
  select a.id, a.codigo, kv.key, kv.value
    from public.activos a
    cross join lateral jsonb_each(a.atributos) as kv (key, value)
   where a.tenant_id = p_tenant_id
     and not exists (
       select 1 from public.mant_atributo_definicion d
        where d.tenant_id = a.tenant_id
          and d.tipo_activo_id = a.tipo_id
          and d.codigo = kv.key
     )
   order by a.codigo, kv.key;
$$;

comment on function public.mant_atributos_huerfanos(uuid) is
  'MANT-1 §3.2: valores de activos.atributos cuya clave ya no existe en mant_atributo_definicion '
  'para el tipo del activo (el esquema cambió o la definición se borró) — nunca se purgan solos, '
  'esta función solo los reporta para revisión manual. SECURITY INVOKER: hereda RLS de activos.';
