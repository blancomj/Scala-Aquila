-- ═══════════════════════════════════════════════════════════════════════
--  MANT-5 · Proveedores, contratos y garantías (4/9)
--  Casos de uso/Tres Modulos/Mantenimiento/MANT_05_proveedores_contratos_garantias.md §4.2
--
--  Qué exige CADA copropiedad para CADA trabajo — cero filas sembradas
--  (marco §6.6, y el propio corte lo pide explícito): el sistema no decide
--  qué trabajo requiere certificación de alturas ni afiliación a
--  seguridad social; eso depende de norma no verificada en este entorno
--  (SG-SST/Decreto 1072, resolución de alturas — ver informe) y del
--  criterio de la administración.
-- ═══════════════════════════════════════════════════════════════════════

create type public.mant_habilitacion_condicion_t as enum (
  'categoria_activo', 'tipo_mantenimiento', 'trabajo_alturas', 'parada_servicio', 'monto_minimo'
);
comment on type public.mant_habilitacion_condicion_t is
  'MANT-5 §4.2: qué disparó la exigencia de una habilitación en mant_habilitacion_requerida. '
  'Gatilla cómo se interpreta condicion_valor — categoria_activo/tipo_mantenimiento exigen un id '
  'de lista_tipos; trabajo_alturas/parada_servicio son banderas sin valor adicional; '
  'monto_minimo exige un numeric. No es vocabulario descriptivo: cada valor cambia qué código de '
  'validación corre y qué columna de la OT se compara.';

create table public.mant_habilitacion_requerida (
  id                  uuid primary key default gen_random_uuid(),
  tenant_id           uuid not null references public.tenants (id) on delete cascade,
  condicion_tipo      public.mant_habilitacion_condicion_t not null,
  condicion_valor     text,
  tipo_habilitacion_id bigint not null references public.lista_tipos (id),
  bloqueante          boolean not null default true,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz
);

alter table public.mant_habilitacion_requerida enable row level security;
alter table public.mant_habilitacion_requerida force row level security;

create index mant_habilitacion_requerida_tenant_idx on public.mant_habilitacion_requerida (tenant_id);

comment on table public.mant_habilitacion_requerida is
  'MANT-5 §4.2: reglas propias de CADA copropiedad sobre qué habilitación exige qué condición de '
  'trabajo. Cero filas sembradas por ninguna migración — verificado por prueba estática (D-24/'
  'marco §6.6). No bloqueante produce advertencia, no impide asignar (mant_verificar_'
  'habilitacion_tercero).';
comment on column public.mant_habilitacion_requerida.condicion_valor is
  'Interpretado según condicion_tipo: id de lista_tipos (categoria_activo/tipo_mantenimiento), '
  'monto numérico (monto_minimo), o NULL (trabajo_alturas/parada_servicio, donde la condición es '
  'la bandera misma).';

-- ── Reglas de habilitación son política, no dato operativo: solo administrador escribe ──
create policy mant_habilitacion_requerida_select_miembro
  on public.mant_habilitacion_requerida for select
  to authenticated
  using (public.is_member(tenant_id));

create policy mant_habilitacion_requerida_administrador_todo
  on public.mant_habilitacion_requerida for all
  to authenticated
  using (public.has_role(tenant_id, array['administrador']::public.tenant_role_t[]))
  with check (public.has_role(tenant_id, array['administrador']::public.tenant_role_t[]));

create function public.guard_mant_habilitacion_requerida()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_tipo_habilitacion text;
  v_familia_esperada  text;
begin
  select tipo into v_tipo_habilitacion from public.lista_tipos where id = new.tipo_habilitacion_id;
  if v_tipo_habilitacion is distinct from 'TIPO_HABILITACION' then
    raise exception 'HABILITACION_TIPO_INVALIDO: tipo_habilitacion_id % no pertenece a '
      'TIPO_HABILITACION (es %)', new.tipo_habilitacion_id, coalesce(v_tipo_habilitacion, 'inexistente');
  end if;

  case new.condicion_tipo
    when 'categoria_activo' then v_familia_esperada := 'CATEGORIA_ACTIVO';
    when 'tipo_mantenimiento' then v_familia_esperada := 'TIPO_MANTENIMIENTO';
    else v_familia_esperada := null;
  end case;

  if v_familia_esperada is not null then
    if new.condicion_valor is null then
      raise exception 'HABILITACION_CONDICION_VALOR_REQUERIDO: condicion_tipo % exige '
        'condicion_valor (un id de %)', new.condicion_tipo, v_familia_esperada;
    end if;
    if not exists (
      select 1 from public.lista_tipos
      where id = new.condicion_valor::bigint and tipo = v_familia_esperada
    ) then
      raise exception 'HABILITACION_CONDICION_VALOR_INVALIDO: % no es un id válido de %',
        new.condicion_valor, v_familia_esperada;
    end if;
  elsif new.condicion_tipo in ('trabajo_alturas', 'parada_servicio') then
    if new.condicion_valor is not null then
      raise exception 'HABILITACION_CONDICION_VALOR_NO_APLICA: condicion_tipo % no admite '
        'condicion_valor — la condición es la bandera misma', new.condicion_tipo;
    end if;
  elsif new.condicion_tipo = 'monto_minimo' then
    if new.condicion_valor is null or new.condicion_valor::numeric < 0 then
      raise exception 'HABILITACION_MONTO_INVALIDO: condicion_tipo monto_minimo exige un '
        'condicion_valor numérico no negativo (recibido: %)', new.condicion_valor;
    end if;
  end if;

  new.updated_at := now();
  return new;
exception
  when invalid_text_representation then
    raise exception 'HABILITACION_CONDICION_VALOR_INVALIDO: % no es un valor numérico válido '
      'para condicion_tipo %', new.condicion_valor, new.condicion_tipo;
end;
$$;

comment on function public.guard_mant_habilitacion_requerida() is
  'MANT-5 §4.2: valida tipo_habilitacion_id contra TIPO_HABILITACION y condicion_valor según lo '
  'que exige cada condicion_tipo — cada uno interpreta el campo de forma distinta.';

create trigger mant_habilitacion_requerida_guard
  before insert or update on public.mant_habilitacion_requerida
  for each row execute function public.guard_mant_habilitacion_requerida();
