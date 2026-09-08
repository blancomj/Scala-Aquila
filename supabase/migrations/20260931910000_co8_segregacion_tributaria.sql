-- ═══════════════════════════════════════════════════════════════════════
--  CO-8 · Segregación de ingresos gravados y no gravados
--  Ver CO_08_tributario.md §4.1 — "lo primero y lo más importante, porque
--  es requisito CONTABLE derivado de norma tributaria" (ET art. 19-5).
--
--  naturaleza_tributaria_id vive en contable_cuenta (marca por cuenta, no
--  tabla propia) — nullable: una cuenta sin marcar simplemente no aporta a
--  contable_ingresos_por_naturaleza_tributaria (queda en el grupo
--  'sin_clasificar'), nunca bloquea nada más.
--
--  iva_periodicidad_id vive en tenants (mismo patrón incremental que CO-1:
--  responsable_iva/agente_retencion se agregaron directo a tenants, no en
--  tabla propia) — REMISIÓN A LA COPROPIEDAD (spec §4.3: "parametrizable,
--  no fijo"), sin valor por defecto.
-- ═══════════════════════════════════════════════════════════════════════

alter table public.contable_cuenta
  add column naturaleza_tributaria_id bigint references public.lista_tipos (id);

comment on column public.contable_cuenta.naturaleza_tributaria_id is
  'CO-8 §4.1 (ET art. 19-5): clasificación tributaria del movimiento de esta cuenta '
  '(lista_tipos NATURALEZA_TRIBUTARIA_CUENTA). NULL = sin clasificar — no bloquea nada, solo '
  'queda fuera de contable_ingresos_por_naturaleza_tributaria. Solo aplicable a clase 1/4/5 '
  '(TRIBUTARIO_CLASE_INVALIDA).';

alter table public.tenants
  add column iva_periodicidad_id bigint references public.lista_tipos (id);

comment on column public.tenants.iva_periodicidad_id is
  'CO-8 §4.3: periodicidad de declaración de IVA (lista_tipos PERIODICIDAD_IVA) — depende del '
  'tamaño del responsable ante la DIAN, no se infiere. NULL mientras responsable_iva=false o el '
  'tenant no lo haya configurado; tributario_resumen_iva() lo exige antes de agrupar.';

-- ── Guard: clase válida + coherencia con uso_economico (CO-1) ────────────
create function public.guard_contable_cuenta_naturaleza_tributaria()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_codigo  text;
  v_tenant  public.tenants%rowtype;
begin
  if new.naturaleza_tributaria_id is null then
    return new;
  end if;

  if new.clase not in (1, 4, 5) then
    raise exception 'TRIBUTARIO_CLASE_INVALIDA: naturaleza_tributaria solo aplica a cuentas de '
      'clase 1, 4 o 5 (cuenta % es clase %)', new.codigo, new.clase;
  end if;

  select codigo into v_codigo from public.lista_tipos
  where id = new.naturaleza_tributaria_id and tipo = 'NATURALEZA_TRIBUTARIA_CUENTA';
  if v_codigo is null then
    raise exception 'TRIBUTARIO_CLASE_INVALIDA: naturaleza_tributaria_id % no pertenece a '
      'NATURALEZA_TRIBUTARIA_CUENTA', new.naturaleza_tributaria_id;
  end if;

  if v_codigo in ('gravado_renta', 'gravado_renta_iva') then
    select * into v_tenant from public.tenants where id = new.tenant_id;
    if v_tenant.uso_economico = 'residencial' and not v_tenant.explota_bienes_comunes then
      raise exception 'TRIBUTARIO_MARCA_INCOHERENTE_CON_USO: la copropiedad % es residencial '
        'sin explotación de bienes comunes — no puede marcar cuentas como gravadas de renta '
        '(ET art. 19-5)', new.tenant_id;
    end if;
  end if;

  return new;
end;
$$;

comment on function public.guard_contable_cuenta_naturaleza_tributaria() is
  'CO-8 §4.1: TRIBUTARIO_CLASE_INVALIDA (solo clase 1/4/5) y TRIBUTARIO_MARCA_INCOHERENTE_CON_USO '
  '(residencial sin explotación no puede marcar gravado_renta/gravado_renta_iva — hereda la '
  'clasificación de CO-1, no la reinterpreta).';

create trigger guard_contable_cuenta_naturaleza_tributaria
  before insert or update of naturaleza_tributaria_id on public.contable_cuenta
  for each row execute function public.guard_contable_cuenta_naturaleza_tributaria();

-- ── Función de consulta (CO-8 §4.1) ──────────────────────────────────────
-- Se apoya en contable_libro_mayor (CO-4) sobre lo PERSISTIDO — nunca en contable_movimientos()
-- (proyección de solo lectura, CO-3) — mismo criterio que toda función de reporte posterior a
-- CO-4 (APENDICE_CO.md). Solo clase 4 (ingresos): es lo que el spec §4.1/prueba 7 exige: "sin
-- omitir ni duplicar ninguna cuenta de clase 4".
create function public.contable_ingresos_por_naturaleza_tributaria(
  p_tenant_id uuid,
  p_desde     date,
  p_hasta     date
)
returns table (
  naturaleza_tributaria text,
  total                 numeric
)
language sql
stable
security invoker
set search_path = ''
as $$
  select
    coalesce(lt.codigo, 'sin_clasificar') as naturaleza_tributaria,
    sum(lm.movimiento_credito - lm.movimiento_debito) as total
  from public.contable_libro_mayor(p_tenant_id, p_desde, p_hasta) lm
  join public.contable_cuenta cc on cc.id = lm.cuenta_id
  left join public.lista_tipos lt on lt.id = cc.naturaleza_tributaria_id
  where cc.clase = 4
  group by coalesce(lt.codigo, 'sin_clasificar');
$$;

comment on function public.contable_ingresos_por_naturaleza_tributaria(uuid, date, date) is
  'CO-8 §4.1: total de ingresos (clase 4) del periodo agrupado por naturaleza_tributaria — '
  'alimenta la nota tributaria de CO-5 y la base de la declaración de renta/IVA. Se apoya en '
  'contable_libro_mayor (CO-4, lo persistido), nunca en contable_movimientos() (proyección).';
