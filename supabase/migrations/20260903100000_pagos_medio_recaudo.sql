-- ═══════════════════════════════════════════════════════════════════════
--  RC-0 · Recaudo: cómo, dónde y de quién entró el dinero
--  Propietario: plan "Pagos y recibo de caja" (2026-08-27)
--
--  ═══ EL HUECO QUE CIERRA ═══
--
--  `pagos` sabía CUÁNTO y CUÁNDO, nunca CÓMO ni DÓNDE. Consecuencia directa
--  y medible: contable_movimientos() (PC-5, 20260830500000) debita SIEMPRE
--  la cuenta del evento BANCO_RECAUDO, sin importar la forma de pago — un
--  recaudo en efectivo se contabiliza hoy como si hubiera entrado al banco.
--  El evento CAJA_GENERAL existe y está parametrizado en todos los tenants
--  desde PC-3; simplemente nunca hubo un dato que permitiera elegirlo.
--
--  El catálogo FORMA_PAGO ya estaba sembrado desde
--  20260814180000_seed_catalogo_referencia.sql (efectivo,
--  transferencia_bancaria, pse, debito_automatico, nota_debito) y ninguna
--  tabla lo referenciaba. Aquí se cablea por primera vez y se le agrega
--  `cheque`, que faltaba y es forma corriente de pago en PH colombiana.
--
--  ═══ POR QUÉ lista_tipos Y NO UN ENUM (D-24) ═══
--
--  No se crea ningún tipo nuevo: se reutiliza la familia FORMA_PAGO que ya
--  existe. Una copropiedad puede necesitar una forma de pago que hoy no
--  imaginamos (datáfono, corresponsal bancario, billetera digital) y
--  lista_tipos admite filas por tenant; un enum obligaría a una migración
--  por cada una.
--
--  ═══ fecha_pago vs fecha_registro (GAP-CAR-003) ═══
--
--  Documentado en Docs/Motor de gestion de cartera/CAR_00_Guia_Oficial.md
--  §GAP-CAR-003 y exigido por Doc 19 §135 (PERIOD BOUNDARY): la política
--  debe poder distinguir la fecha VALOR del pago (cuándo pagó el residente
--  — la que cuenta para mora y para pronto pago) de la fecha en que se
--  REGISTRÓ en el sistema (la que hace auditable un registro retroactivo).
--  Hasta hoy solo existía `fecha_pago`, y un pago cargado tarde con fecha
--  anterior alteraba la antigüedad sin dejar rastro consultable.
--  `created_at` es el timestamp técnico de la fila; `fecha_registro` es el
--  dato contable, y por eso es una columna propia y no un alias de aquél.
--
--  ═══ QUIÉN PAGA ═══
--
--  Un recibo de caja dice "Recibí de <nombre>, C.C. <número>". Hasta hoy
--  `pagos` solo tenía inmueble_id y el pagador se INFERÍA de
--  inmueble_persona_rol.es_pagador. Pero quien paga en ventanilla puede no
--  ser el propietario registrado (un arrendatario, un familiar, un tercero
--  que paga por encargo). Por eso pagador_tercero_id es opcional y existe
--  además pagador_nombre para el caso en que quien paga no es —ni tiene por
--  qué ser— un tercero del sistema. Si ambos son null, quien consuma el
--  dato cae a la inferencia de siempre; nada se rompe hacia atrás.
-- ═══════════════════════════════════════════════════════════════════════

-- ── 1. cheque: la forma de pago que faltaba en el catálogo ──────────────
insert into public.lista_tipos (tipo, codigo, nombre, descripcion, orden)
select 'FORMA_PAGO', 'cheque', 'Cheque',
       'Cheque entregado a la administración. Se registra cuando ya fue canjeado — AQUILA no '
       'maneja hoy el estado "recibido pero no canjeado" (decisión del usuario, 2026-08-27).',
       60
where not exists (
  select 1 from public.lista_tipos
  where tipo = 'FORMA_PAGO' and codigo = 'cheque' and tenant_id is null
);

-- ── 2. columnas del recaudo ─────────────────────────────────────────────
alter table public.pagos
  add column forma_pago_id       bigint references public.lista_tipos (id),
  add column cuenta_bancaria_id  uuid   references public.cuentas_bancarias (id),
  add column fecha_registro      date,
  add column pagador_tercero_id  uuid   references public.terceros (id),
  add column pagador_nombre      text;

comment on column public.pagos.forma_pago_id is
  'Cómo entró el dinero — lista_tipos familia FORMA_PAGO. Determina la cuenta de efectivo que '
  'debita contable_movimientos(): efectivo -> CAJA_GENERAL, cualquier otra -> la cuenta bancaria '
  'de cuenta_bancaria_id, o BANCO_RECAUDO si no se identificó una.';

comment on column public.pagos.cuenta_bancaria_id is
  'A qué cuenta bancaria entró. Null y obligatoriamente null cuando la forma de pago es efectivo '
  '(guard_pago_medio_recaudo). Null en las demás formas significa "no se identificó la cuenta" y '
  'la contabilidad cae a la cuenta del evento BANCO_RECAUDO.';

comment on column public.pagos.fecha_registro is
  'Cuándo se registró el pago en AQUILA, que puede ser posterior a fecha_pago (la fecha valor, la '
  'que cuenta para mora y pronto pago). Cierra GAP-CAR-003 y Doc 19 §135: un registro retroactivo '
  'queda auditable en vez de alterar la antigüedad en silencio.';

comment on column public.pagos.pagador_tercero_id is
  'Quién pagó realmente, cuando es un tercero del sistema — puede no ser el propietario (un '
  'arrendatario, un familiar). Null cae a la inferencia por inmueble_persona_rol.es_pagador.';

comment on column public.pagos.pagador_nombre is
  'Nombre libre de quien pagó, para el caso en que no es ni tiene por qué ser un tercero '
  'registrado. Solo se usa si pagador_tercero_id es null.';

-- ── 3. backfill de lo ya registrado ─────────────────────────────────────
-- `pagos` es append-only por trigger de fila (forbid_mutation, SEC-14). Un
-- ALTER TABLE no lo dispara, pero el UPDATE del backfill sí. Se desactiva
-- SOLO durante este backfill, dentro de la misma transacción de la
-- migración, y se vuelve a activar — nunca se deja abierto.
--
-- Criterio del backfill: lo ya registrado entró por el camino que existía,
-- que es el de la cuenta de recaudo. NO se marca como efectivo: no consta
-- que lo fuera, y afirmarlo cambiaría su contabilización de bancos a caja
-- sobre datos que nadie declaró. transferencia_bancaria + la cuenta de
-- recaudo vigente reproduce exactamente el asiento que esos pagos ya
-- tienen hoy, así que el backfill es contablemente neutro por construcción.
alter table public.pagos disable trigger pagos_append_only;

update public.pagos p
set forma_pago_id = (
      select lt.id from public.lista_tipos lt
      where lt.tipo = 'FORMA_PAGO' and lt.codigo = 'transferencia_bancaria'
        and lt.tenant_id is null
    ),
    cuenta_bancaria_id = (
      select cb.id from public.cuentas_bancarias cb
      where cb.tenant_id = p.tenant_id and cb.es_recaudo and cb.activa
      limit 1
    ),
    fecha_registro = coalesce(p.created_at::date, p.fecha_pago)
where p.forma_pago_id is null;

alter table public.pagos enable trigger pagos_append_only;

-- Ahora que no queda ninguno sin forma de pago, se exige hacia adelante.
alter table public.pagos
  alter column forma_pago_id set not null,
  alter column fecha_registro set not null,
  alter column fecha_registro set default current_date;

-- ── 4. guard de coherencia del medio de recaudo ─────────────────────────
create function public.guard_pago_medio_recaudo()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_familia  text;
  v_codigo   text;
  v_tenant   uuid;
  v_cb_tenant uuid;
begin
  select lt.tipo, lt.codigo, lt.tenant_id
    into v_familia, v_codigo, v_tenant
  from public.lista_tipos lt
  where lt.id = new.forma_pago_id;

  if v_familia is distinct from 'FORMA_PAGO' then
    raise exception 'FORMA_PAGO_INVALIDA: forma_pago_id % no pertenece a FORMA_PAGO (es %)',
      new.forma_pago_id, coalesce(v_familia, 'inexistente');
  end if;

  -- Una forma de pago propia de otra copropiedad no es utilizable aquí
  -- (mismo criterio que guard_contable_cuenta_default con EVENTO_CONTABLE).
  if v_tenant is not null and v_tenant <> new.tenant_id then
    raise exception 'FORMA_PAGO_INVALIDA: la forma de pago % pertenece a otra copropiedad',
      new.forma_pago_id;
  end if;

  -- Efectivo no entra a una cuenta bancaria: si entrara, no sería efectivo.
  -- Es la distinción que permite a la contabilidad elegir caja en vez de bancos.
  if v_codigo = 'efectivo' and new.cuenta_bancaria_id is not null then
    raise exception 'PAGO_MEDIO_INCOHERENTE: un pago en efectivo no puede señalar una cuenta '
      'bancaria — se contabiliza contra caja, no contra bancos';
  end if;

  if new.cuenta_bancaria_id is not null then
    select cb.tenant_id into v_cb_tenant
    from public.cuentas_bancarias cb where cb.id = new.cuenta_bancaria_id;
    if v_cb_tenant is distinct from new.tenant_id then
      raise exception 'PAGO_MEDIO_INCOHERENTE: la cuenta bancaria % no pertenece a esta '
        'copropiedad', new.cuenta_bancaria_id;
    end if;
  end if;

  -- Registrar un pago con fecha valor POSTERIOR a la de registro sería
  -- registrar el futuro. Al revés sí es legítimo (registro retroactivo).
  if new.fecha_pago > new.fecha_registro then
    raise exception 'PAGO_FECHA_INCOHERENTE: la fecha del pago (%) no puede ser posterior a la '
      'fecha de registro (%)', new.fecha_pago, new.fecha_registro;
  end if;

  return new;
end;
$$;

comment on function public.guard_pago_medio_recaudo() is
  'Coherencia del medio de recaudo (RC-0): la forma de pago pertenece a FORMA_PAGO y a esta '
  'copropiedad; efectivo nunca señala cuenta bancaria (es lo que permite a contable_movimientos '
  'elegir caja en vez de bancos); la cuenta bancaria es del tenant; y la fecha valor no puede '
  'ser posterior a la de registro.';

create trigger guard_pago_medio_recaudo
  before insert on public.pagos
  for each row execute function public.guard_pago_medio_recaudo();

create index pagos_forma_pago_idx on public.pagos (tenant_id, forma_pago_id);
create index pagos_fecha_registro_idx on public.pagos (tenant_id, fecha_registro);
