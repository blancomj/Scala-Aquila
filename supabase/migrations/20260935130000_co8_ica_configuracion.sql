-- ═══════════════════════════════════════════════════════════════════════
--  CO-8 · ICA (Industria y Comercio) — gap encontrado en auditoría de
--  configurabilidad contable (2026-09-14): co1_marco_contable_tenant.sql
--  ya documentaba en su propio comentario que uso_economico/
--  explota_bienes_comunes deciden "si aplica ICA" (ET art. 19-5 cubre
--  renta E ICA con la misma base), y el plan de cuentas ya trae 2510
--  'Industria y comercio (ICA)' — pero no existía ningún lugar para
--  configurar municipio/tarifa/periodicidad ni ningún resumen, a
--  diferencia de IVA (CO-8 §4.3) que sí los tiene.
--
--  Mismo patrón incremental que iva_periodicidad_id (20260931910000): las
--  columnas se agregan directo a `tenants`, sin tabla propia — y sin guard
--  de escritura (mismo criterio: la validación es perezosa, al momento de
--  calcular el resumen, no al guardar la clasificación).
--
--  Base gravable: se reutiliza contable_ingresos_por_naturaleza_tributaria
--  (CO-8 §4.1) sumando 'gravado_renta' + 'gravado_renta_iva' — el propio
--  fundamento normativo de CO-1 (ET art. 19-5) dice que renta e ICA
--  comparten la misma base de explotación de bienes comunes, así que no
--  hace falta un ledger nuevo (tributario_iva_generado es informativo
--  porque IVA tiene un hecho generador distinto al de renta; ICA no).
--
--  Deliberadamente informativo (mismo criterio que tributario_resumen_iva):
--  no genera ningún asiento contable automático.
-- ═══════════════════════════════════════════════════════════════════════

insert into public.tipos (codigo, nombre, descripcion) values
  ('PERIODICIDAD_ICA', 'Periodicidad de declaración de ICA',
   'Bimestral o anual según lo fije el municipio (varía por municipio, a diferencia de IVA que '
   'lo fija la DIAN) — REMISIÓN A LA COPROPIEDAD/CONTADOR.');

insert into public.lista_tipos (tipo, codigo, nombre, descripcion, orden) values
  ('PERIODICIDAD_ICA', 'bimestral', 'Bimestral', 'Declaración de ICA cada dos meses (p. ej. Bogotá)', 10),
  ('PERIODICIDAD_ICA', 'anual',     'Anual',     'Declaración de ICA una vez al año (la mayoría de municipios)', 20);

alter table public.tenants
  add column ica_aplica          boolean not null default false,
  add column ica_municipio       text,
  add column ica_tarifa_por_mil  numeric(6, 2),
  add column ica_periodicidad_id bigint references public.lista_tipos (id);

alter table public.tenants
  add constraint tenants_ica_tarifa_valida
  check (ica_tarifa_por_mil is null or ica_tarifa_por_mil >= 0);

comment on column public.tenants.ica_aplica is
  'Si la copropiedad debe declarar Industria y Comercio ante el municipio. Hecho declarado por '
  'el tenant, sin valor por defecto (mismo criterio que agente_retencion, CO-1) — aunque '
  'uso_economico/explota_bienes_comunes ya sugieren cuándo aplicaría (ET art. 19-5), esta '
  'columna no se infiere automáticamente de esas dos.';
comment on column public.tenants.ica_municipio is
  'Municipio ante el que se declara — solo informativo (no hay catálogo de municipios en el '
  'sistema); NULL mientras ica_aplica=false o el tenant no lo haya configurado.';
comment on column public.tenants.ica_tarifa_por_mil is
  'Tarifa por mil de ingresos gravados (la fija cada municipio, Ley 14 de 1983 art. 33 — rango '
  'entre 2 y 30 por mil según la actividad) — parametrizable, nunca fija. Exigida por '
  'tributario_resumen_ica() antes de calcular.';
comment on column public.tenants.ica_periodicidad_id is
  'CO-8: periodicidad de declaración de ICA (lista_tipos PERIODICIDAD_ICA) — la fija el '
  'municipio, no la DIAN (a diferencia de iva_periodicidad_id). NULL mientras ica_aplica=false '
  'o sin configurar; tributario_resumen_ica() lo exige antes de agrupar.';

insert into public.fundamento_normativo (tenant_id, tipo, norma, articulo, descripcion, referencia)
values
  (null, 'ley', 'Ley 14 de 1983', 'art. 33',
   'Marco nacional del impuesto de Industria y Comercio (ICA): tarifa entre el 2 y el 30 por '
   'mil según la actividad, fijada por cada municipio dentro de ese rango — de ahí que '
   'ica_tarifa_por_mil y ica_periodicidad_id sean parametrizables por tenant y nunca un valor '
   'fijo en el sistema. Comparte hecho generador con el régimen ordinario de renta del ET art. '
   '19-5 (ya citado en CO-1/CO-8) para la explotación de bienes comunes.',
   'co8_ley_14_1983_art_33_ica_tarifa; verificado el 2026-09-14 mediante fuentes que citan el '
   'artículo, sin poder confirmar contra el texto primario por la misma falla de TLS contra '
   '.gov.co ya documentada en CO-1/CO-8/MANT-2 — no bloqueante, pregunta abierta');

-- ── Resumen de ICA (informativo, mismo criterio que tributario_resumen_iva) ──
create function public.tributario_resumen_ica(
  p_tenant_id      uuid,
  p_anio           int,
  p_periodo_numero int
)
returns table (
  mes_desde      int,
  mes_hasta      int,
  base_gravable  numeric,
  tarifa_por_mil numeric,
  valor_estimado numeric
)
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  v_aplica    boolean;
  v_tarifa    numeric;
  v_codigo    text;
  v_meses_por int;
  v_mes_desde int;
  v_mes_hasta int;
  v_desde     date;
  v_hasta     date;
  v_base      numeric;
begin
  select t.ica_aplica, t.ica_tarifa_por_mil, lt.codigo
    into v_aplica, v_tarifa, v_codigo
  from public.tenants t
  left join public.lista_tipos lt on lt.id = t.ica_periodicidad_id
  where t.id = p_tenant_id;

  if not coalesce(v_aplica, false) then
    raise exception 'TRIBUTARIO_ICA_NO_APLICA: el tenant % no tiene ica_aplica=true '
      '(Configuración contable)', p_tenant_id;
  end if;

  if v_tarifa is null or v_codigo is null then
    raise exception 'TRIBUTARIO_ICA_SIN_CONFIGURAR: el tenant % no tiene ica_tarifa_por_mil o '
      'ica_periodicidad_id configurados', p_tenant_id;
  end if;

  v_meses_por := case v_codigo when 'bimestral' then 2 when 'anual' then 12 end;
  v_mes_desde := (p_periodo_numero - 1) * v_meses_por + 1;
  v_mes_hasta := p_periodo_numero * v_meses_por;

  if v_mes_hasta > 12 or p_periodo_numero < 1 then
    raise exception 'TRIBUTARIO_PERIODO_ICA_INVALIDO: periodo % inválido para periodicidad %',
      p_periodo_numero, v_codigo;
  end if;

  v_desde := make_date(p_anio, v_mes_desde, 1);
  v_hasta := (make_date(p_anio, v_mes_hasta, 1) + interval '1 month' - interval '1 day')::date;

  select coalesce(sum(i.total), 0) into v_base
  from public.contable_ingresos_por_naturaleza_tributaria(p_tenant_id, v_desde, v_hasta) i
  where i.naturaleza_tributaria in ('gravado_renta', 'gravado_renta_iva');

  return query select v_mes_desde, v_mes_hasta, v_base, v_tarifa, round(v_base * v_tarifa / 1000, 2);
end;
$$;

comment on function public.tributario_resumen_ica(uuid, int, int) is
  'CO-8 (gap encontrado 2026-09-14): resumen estimado de ICA por bimestre o año, según '
  'tenants.ica_periodicidad_id. Base gravable = ingresos clase 4 con naturaleza_tributaria '
  'gravado_renta o gravado_renta_iva (mismo hecho generador que renta, ET art. 19-5) — '
  'reutiliza contable_ingresos_por_naturaleza_tributaria (CO-8 §4.1), no crea un ledger propio. '
  'Informativo: no genera ningún asiento contable automático, mismo criterio que '
  'tributario_resumen_iva. TRIBUTARIO_ICA_NO_APLICA / TRIBUTARIO_ICA_SIN_CONFIGURAR / '
  'TRIBUTARIO_PERIODO_ICA_INVALIDO.';
