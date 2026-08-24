-- ═══════════════════════════════════════════════════════════════════════
--  PC-7 · Validación normativa de primer grado — carril B: convertirla en
--  dato del sistema
--
--  PC_01 §1 dejó la validación del fondo de imprevistos como "segundo
--  grado": afirmaciones respaldadas por fuentes que citaban al CTCP, sin
--  haber leído el documento primario. Esta migración cierra esa brecha
--  para la parte que le corresponde a la base de datos — no a que "alguien
--  lea un PDF", sino a que la validación deje de vivir solo en un .md y se
--  vuelva algo que el sistema puede reportar cuando caduque.
--
--  Fuente: 8 conceptos del CTCP descargados directamente de ctcp.gov.co
--  el 2026-08-24 (Concepto 2021-0291, el origen de la doctrina, hasta
--  2025-0330/0331, los más recientes disponibles). Ver
--  Casos de uso/Contabilidad/fuentes-ctcp/INDICE.md — cada afirmación de
--  esta migración tiene ahí su cita textual.
--
--  Qué se agrega:
--    • fundamento_tipo_t + 'orientacion_tecnica' — la categoría que el
--      prompt maestro §6 exige distinguir de "norma obligatoria" y que el
--      enum no tenía. fundamento_normativo YA soportaba fundamentos
--      globales (tenant_id nullable + policy de select ya contemplaba
--      tenant_id is null) — no hacía falta tocar eso.
--    • fecha_validacion, fuente_url, validado_por — los tres campos que
--      el prompt maestro §6 exige documentar y que faltaban.
--    • contable_plan_cuenta.fundamento_normativo_id — el vínculo se hace
--      en la PLANTILLA global, no por tenant: así los 7 planes ya
--      instanciados (y cualquiera futuro, vía fn_instanciar_plan_contable)
--      heredan la trazabilidad sin repetir el vínculo siete veces.
--    • fundamento_validacion_pendiente() — mismo patrón que
--      contable_parametrizacion_pendiente(): un reporte, no una nota que
--      alguien tiene que acordarse de releer. Marca vencido lo que lleva
--      más de 12 meses sin revalidar.
--
--  Qué NO hace esta migración (Carril C, fuera de alcance de BD):
--    validado_por queda como texto libre indicando que la validación es de
--    un agente, pendiente de contador público matriculado. No se inventa
--    un mecanismo de firma digital ni un rol de "validador" — eso es una
--    decisión de producto, no de esquema.
-- ═══════════════════════════════════════════════════════════════════════

-- ── 1. nueva categoría de fundamento ─────────────────────────────────────
-- El valor 'orientacion_tecnica' se agregó en 20260830529000, en su propia
-- migración/transacción (PostgreSQL no permite usar un valor de enum en la
-- misma transacción en que se creó). fundamento_tipo_t está en ENUMS_LEGADO
-- (D-24): ampliar un enum legado con un valor nuevo no dispara el gate de
-- gobernanza (que solo mira CREATE TYPE nuevos), pero se documenta igual.
comment on type public.fundamento_tipo_t is
  'D-24 (legado): naturaleza del fundamento citado — norma obligatoria (ley/decreto), '
  'orientación técnica del regulador contable (sin fuerza vinculante per se, pero es la '
  'interpretación oficial — CTCP art. 28 Ley 1437/2011), reglamento_ph, decision_asamblea u '
  'otra. orientacion_tecnica se agregó en PC-7 porque el prompt maestro §6 exige distinguir '
  'esta categoría explícitamente de "norma obligatoria" y el enum no la tenía.';

-- ── 2. los tres campos que exige el prompt maestro §6 ────────────────────
alter table public.fundamento_normativo
  add column fecha_validacion date,
  add column fuente_url text,
  add column validado_por text;

comment on column public.fundamento_normativo.fecha_validacion is
  'Cuándo se verificó este fundamento contra su fuente primaria (prompt maestro §6). NULL = '
  'nunca validado contra fuente primaria (validación de segundo grado o pendiente). '
  'fundamento_validacion_pendiente() marca vencido lo que lleva más de 12 meses sin revalidar.';
comment on column public.fundamento_normativo.fuente_url is
  'URL del documento primario (no de un resumen de tercero) — para orientaciones técnicas del '
  'CTCP, el enlace de descarga en ctcp.gov.co.';
comment on column public.fundamento_normativo.validado_por is
  'Quién hizo la validación de primer grado. Texto libre a propósito: no existe todavía un rol '
  'formal de "validador normativo" en el sistema, y crear uno es decisión de producto, no algo '
  'que deba resolver esta migración. La validación de un agente de IA NO sustituye la revisión '
  'de un contador público matriculado (Ley 43 de 1990) antes de operar con copropiedades reales '
  '— eso queda anotado aquí en texto plano, no impuesto por un guard.';

-- ── 3. vínculo desde la plantilla global (una vez, no por tenant) ────────
alter table public.contable_plan_cuenta
  add column fundamento_normativo_id bigint references public.fundamento_normativo (id);

comment on column public.contable_plan_cuenta.fundamento_normativo_id is
  'Por qué esta cuenta existe con esta naturaleza contable, cuando la razón no es obvia por el '
  'nombre — el caso central es el fondo de imprevistos (111015/1315/4115/4605): existe como '
  'activo restringido, no como pasivo ni patrimonio, por doctrina explícita del CTCP (PC-7). '
  'Se vincula en la plantilla, no en contable_cuenta por tenant: los planes ya instanciados y '
  'los futuros (vía fn_instanciar_plan_contable) heredan la trazabilidad sin repetirla.';

-- ── 4. diagnóstico: lo mismo que contable_parametrizacion_pendiente(),
--    pero para la deuda de VALIDACIÓN en vez de la de mapeo ──────────────
create function public.fundamento_validacion_pendiente()
returns table (fundamento_id bigint, norma text, estado text, detalle text)
language sql
stable
set search_path = ''
as $$
  select
    f.id,
    coalesce(f.norma, 'sin norma citada'),
    case
      when f.fecha_validacion is null then 'sin_validar'
      when f.fecha_validacion < (current_date - interval '12 months') then 'vencida'
      else 'vigente'
    end,
    case
      when f.fecha_validacion is null
        then 'nunca se verificó contra el documento primario'
      when f.fecha_validacion < (current_date - interval '12 months')
        then 'última validación: ' || f.fecha_validacion::text || ' — revalidar contra fuente primaria'
      else 'validado ' || f.fecha_validacion::text
    end
  from public.fundamento_normativo f
  where f.tipo = 'orientacion_tecnica'
    and (f.fecha_validacion is null or f.fecha_validacion < (current_date - interval '12 months'))
  order by f.fecha_validacion nulls first;
$$;

comment on function public.fundamento_validacion_pendiente() is
  'Orientaciones técnicas sin validar contra fuente primaria, o validadas hace más de 12 meses '
  '(PC-7). Existe para que "hay que revisar esto de nuevo" sea una consulta a la base, no algo '
  'que dependa de que alguien recuerde releer un documento .md.';

-- ── 5. sembrar los 8 fundamentos, globales (tenant_id null) ──────────────
-- fecha_validacion = hoy: son los 8 documentos descargados directo de ctcp.gov.co el
-- 2026-08-24, con cita textual en Casos de uso/Contabilidad/fuentes-ctcp/INDICE.md.
insert into public.fundamento_normativo (
  tipo, norma, articulo, descripcion, referencia, fecha_validacion, fuente_url, validado_por
) values
  (
    'ley', 'Ley 675 de 2001', 'Art. 35',
    'Obligatoriedad del fondo de imprevistos: mínimo 1% del presupuesto anual de gastos '
    'comunes, destinado exclusivamente a obligaciones o expensas imprevistas.',
    'Ley675_2001',
    current_date, 'https://www.funcionpublica.gov.co/eva/gestornormativo/norma.php?i=5497',
    'Sesión de agente (Claude), 2026-08-24 — pendiente de revisión por contador matriculado'
  ),
  (
    'orientacion_tecnica', 'CTCP Concepto 2021-0291', null,
    'Origen de la doctrina: los fondos especiales de una copropiedad (incluido el de '
    'imprevistos) no son componente del patrimonio contable; el recaudo vía cuota ordinaria '
    'no constituye pasivo ni se contabiliza directamente en cuentas de patrimonio.',
    'concepto_2021-0291',
    current_date, 'https://www.ctcp.gov.co/CMSPages/GetFile.aspx?guid=39ce17cc-1595-49ee-b4eb-b901615a0aa2',
    'Sesión de agente (Claude), 2026-08-24 — pendiente de revisión por contador matriculado'
  ),
  (
    'orientacion_tecnica', 'CTCP Concepto 2025-0138', null,
    'El fondo no constituye pasivo ni gasto al momento de su constitución — el gasto se '
    'reconoce únicamente cuando se realiza el desembolso para atender el imprevisto.',
    'concepto_2025-0138',
    current_date, 'https://www.ctcp.gov.co/CMSPages/GetFile.aspx?guid=40ef9494-1c3d-4433-81e2-176cc583a24d',
    'Sesión de agente (Claude), 2026-08-24 — pendiente de revisión por contador matriculado'
  ),
  (
    'orientacion_tecnica', 'CTCP Concepto 2025-0146', null,
    'El fondo de imprevistos no debe registrarse como parte del patrimonio ni como un pasivo; '
    'su clasificación corresponde a un activo restringido (efectivo) con destinación '
    'específica. Presentarlo en el patrimonio es un error de presentación de los EEFF.',
    'concepto_2025-0146',
    current_date, 'https://www.ctcp.gov.co/CMSPages/GetFile.aspx?guid=5a32a476-5b43-4492-8755-346781dff5fe',
    'Sesión de agente (Claude), 2026-08-24 — pendiente de revisión por contador matriculado'
  ),
  (
    'orientacion_tecnica', 'CTCP Concepto 2025-0153', null,
    'Cita el DOT 15 (Grupos 2 y 3): el fondo se reconoce como cuenta del activo; el deterioro '
    'de cartera es obligatorio para Grupo 3 (párrafo 7.5 NIF Microempresas); el asiento de '
    'intereses de mora es débito a cuenta por cobrar / crédito a ingreso por intereses, y en '
    'el recaudo crédito a la cuenta por cobrar / débito a efectivo.',
    'concepto_2025-0153',
    current_date, 'https://www.ctcp.gov.co/CMSPages/GetFile.aspx?guid=22b20b01-082e-4455-b3ea-f76292225f7b',
    'Sesión de agente (Claude), 2026-08-24 — pendiente de revisión por contador matriculado'
  ),
  (
    'orientacion_tecnica', 'CTCP Concepto 2025-0270', null,
    'Los rendimientos financieros generados por la cuenta restringida del fondo de '
    'imprevistos deben reconocerse como ingresos en el estado de resultados, no en el '
    'patrimonio ni como provisión.',
    'concepto_2025-0270',
    current_date, 'https://www.ctcp.gov.co/CMSPages/GetFile.aspx?guid=13ff63bb-cf3e-4540-bf7d-1ce9e5502689',
    'Sesión de agente (Claude), 2026-08-24 — pendiente de revisión por contador matriculado'
  ),
  (
    'orientacion_tecnica', 'CTCP Concepto 2025-0330', null,
    'Reconfirmación más reciente disponible (dic-2025): los fondos no hacen parte del '
    'patrimonio; deben reconocerse como efectivo restringido en la medida de su recaudo. Un '
    'faltante por uso indebido se ajusta como cuenta por cobrar al responsable, nunca '
    'reduciendo el patrimonio para "cuadrar" el saldo.',
    'concepto_2025-0330',
    current_date, 'https://www.ctcp.gov.co/CMSPages/GetFile.aspx?guid=8c4ee6e8-b757-4e84-9edb-0c7bb6589b26',
    'Sesión de agente (Claude), 2026-08-24 — pendiente de revisión por contador matriculado'
  ),
  (
    'orientacion_tecnica', 'CTCP Concepto 2025-0331', null,
    'Reconfirma 2025-0270: los rendimientos del fondo son ingreso del estado de resultados, '
    'nunca patrimonio ni provisión.',
    'concepto_2025-0331',
    current_date, 'https://www.ctcp.gov.co/CMSPages/GetFile.aspx?guid=b32f63b7-8f56-4be1-9a80-4816090c35e3',
    'Sesión de agente (Claude), 2026-08-24 — pendiente de revisión por contador matriculado'
  );

-- ── 6. vincular las cuentas de la plantilla cuya existencia responde a esta doctrina ──
-- El fundamento principal es 2025-0146 (la formulación más citada y directa); las cuentas de
-- CxC/rendimientos se anclan al mismo, ya que responden a la misma doctrina consolidada.
update public.contable_plan_cuenta pc
set fundamento_normativo_id = f.id
from public.fundamento_normativo f
where f.referencia = 'concepto_2025-0146'
  and pc.codigo in ('111015', '1315', '4115')
  and pc.plan_id = (select id from public.contable_plan where codigo = 'PUC_PH_CO');

update public.contable_plan_cuenta pc
set fundamento_normativo_id = f.id
from public.fundamento_normativo f
where f.referencia = 'concepto_2025-0270'
  and pc.codigo = '4605'
  and pc.plan_id = (select id from public.contable_plan where codigo = 'PUC_PH_CO');
