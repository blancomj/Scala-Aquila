-- ═══════════════════════════════════════════════════════════════════════
--  Dominio Fondos — fondo_autorizaciones/fondo_fuentes ganan el mismo
--  candado de estado que ya tienen fondo_movimientos/fondo_compromisos/
--  fondo_solicitudes_uso.
--
--  QUÉ RESUELVE. Al revisar en vivo qué acciones ofrecía el detalle de un
--  fondo `cerrado` (FON-OBRA-01), "Registrar autorización" y "Registrar
--  fuente"/"Activar"/"Desactivar" seguían disponibles y el guard las
--  aceptaba sin más — guard_fondo_autorizacion (20260929130000) y
--  guard_fondo_fuente (20260929130000) nunca miraron `fondos.estado`,
--  a diferencia de guard_fondo_movimiento/guard_fondo_compromiso/
--  guard_fondo_solicitud_uso_transicion, que sí lo hacen. Un fondo cerrado
--  o cancelado es terminal (cerrado/cancelado no tienen transiciones de
--  salida en TRANSICIONES_ESTADO_FONDO) — no hay una autorización nueva
--  que decidir ni una fuente nueva que alimentar sobre un fondo que ya no
--  opera. en_cierre se suma al bloqueo por el mismo motivo que ya vale
--  para fondo_movimientos: es el estado que existe para dejar de admitir
--  operaciones nuevas mientras se liquida (Modelo §36).
--
--  QUÉ NO SE TOCA. `propuesto`/`pendiente_autorizacion` siguen admitiendo
--  autorizaciones y fuentes sin restricción — es exactamente el momento en
--  que se registra el acta de constitución (Modelo §7) y se configuran las
--  reglas de alimentación antes de activar el fondo. Bloquear ahí rompería
--  el flujo real de alta de un fondo.
-- ═══════════════════════════════════════════════════════════════════════

create or replace function public.guard_fondo_autorizacion()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_fondo public.fondos;
begin
  select * into v_fondo from public.fondos f where f.id = new.fondo_id and f.tenant_id = new.tenant_id;

  if v_fondo.id is null then
    raise exception 'FONDO_TENANT_INCONSISTENTE: el fondo % no pertenece al tenant %',
      new.fondo_id, new.tenant_id;
  end if;

  if v_fondo.estado in ('en_cierre', 'cerrado', 'cancelado') then
    raise exception 'FONDO_ESTADO_NO_ADMITE_AUTORIZACIONES: el fondo % está % y no admite '
      'autorizaciones nuevas', v_fondo.codigo, v_fondo.estado;
  end if;

  if not exists (
    select 1 from public.lista_tipos lt
     where lt.id = new.organo_id
       and lt.tipo = 'ORGANO_DECISORIO'
       and (lt.tenant_id is null or lt.tenant_id = new.tenant_id)
  ) then
    raise exception 'ORGANO_DECISORIO_INVALIDO: % no es un ORGANO_DECISORIO visible para el '
      'tenant %', new.organo_id, new.tenant_id;
  end if;

  if new.documento_id is not null and not exists (
    select 1 from public.documentos d
     where d.id = new.documento_id and d.tenant_id = new.tenant_id
  ) then
    raise exception 'DOCUMENTO_INVALIDO: % no pertenece al tenant %',
      new.documento_id, new.tenant_id;
  end if;

  new.registrada_por := coalesce(new.registrada_por, (select auth.uid()));

  return new;
end;
$$;

comment on function public.guard_fondo_autorizacion() is
  'Coherencia de la autorización + FONDO_ESTADO_NO_ADMITE_AUTORIZACIONES para en_cierre/cerrado/'
  'cancelado (terminal — no hay decisión nueva que registrar sobre un fondo que ya no opera).';

create or replace function public.guard_fondo_fuente()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_fondo public.fondos;
begin
  select * into v_fondo from public.fondos f where f.id = new.fondo_id and f.tenant_id = new.tenant_id;

  if v_fondo.id is null then
    raise exception 'FONDO_TENANT_INCONSISTENTE: el fondo % no pertenece al tenant %',
      new.fondo_id, new.tenant_id;
  end if;

  if v_fondo.estado in ('en_cierre', 'cerrado', 'cancelado') then
    raise exception 'FONDO_ESTADO_NO_ADMITE_FUENTES: el fondo % está % y no admite crear ni '
      'modificar fuentes de alimentación', v_fondo.codigo, v_fondo.estado;
  end if;

  if not exists (
    select 1 from public.lista_tipos lt
     where lt.id = new.tipo_id
       and lt.tipo = 'TIPO_FUENTE_ALIMENTACION_FONDO'
       and (lt.tenant_id is null or lt.tenant_id = new.tenant_id)
  ) then
    raise exception 'TIPO_FUENTE_FONDO_INVALIDO: % no es un TIPO_FUENTE_ALIMENTACION_FONDO '
      'visible para el tenant %', new.tipo_id, new.tenant_id;
  end if;

  if new.autorizacion_id is not null and not exists (
    select 1 from public.fondo_autorizaciones fa
     where fa.id = new.autorizacion_id and fa.fondo_id = new.fondo_id
  ) then
    raise exception 'AUTORIZACION_INVALIDA: % no es una autorización de este fondo',
      new.autorizacion_id;
  end if;

  if new.documento_id is not null and not exists (
    select 1 from public.documentos d
     where d.id = new.documento_id and d.tenant_id = new.tenant_id
  ) then
    raise exception 'DOCUMENTO_INVALIDO: % no pertenece al tenant %',
      new.documento_id, new.tenant_id;
  end if;

  return new;
end;
$$;

comment on function public.guard_fondo_fuente() is
  'Coherencia de la fuente + FONDO_ESTADO_NO_ADMITE_FUENTES para en_cierre/cerrado/cancelado '
  '(terminal — ni crear ni activar/desactivar una fuente tiene sentido sobre un fondo que ya no '
  'opera). Cubre INSERT y UPDATE (activa/inactiva) — mismo trigger que ya validaba lo demás.';
