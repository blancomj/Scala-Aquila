-- ═══════════════════════════════════════════════════════════════════════
--  PC-3b · Cerrar los 12 huecos que reportó contable_parametrizacion_pendiente
--
--  El diagnóstico que introdujo PC-3 hizo su trabajo en la primera corrida:
--  identificó 12 cuentas de ingreso del árbol de GC-001 que el mapeo inicial
--  no cubría (quedaron fuera del borrador de PC_01 §5 porque la consulta con
--  que se levantó ese borrador venía truncada a 80 filas y cortó los
--  ingresos). Ninguna de las 12 es un caso raro: son ingresos corrientes de
--  una PH real.
--
--  Once de las doce encajan en cuentas que ya existen. La restante —los
--  descuentos concedidos— no tenía dónde ir, y su naturaleza obliga a una
--  decisión de diseño que vale la pena dejar explícita.
-- ═══════════════════════════════════════════════════════════════════════

-- ── 1. 4695: cuenta correctora de ingresos ───────────────────────────────
-- "Descuento por pronto pago" y "Descuentos concedidos" son partidas de naturaleza presupuestal
-- ingreso, pero contablemente RESTAN del ingreso: son cuentas correctoras dentro de la clase 4,
-- de naturaleza debito. Es el mismo patrón que 1399/1592/1698 en el activo (PC_01 §3.1) y la
-- segunda confirmación de que `naturaleza` tiene que vivir por cuenta y no derivarse de la
-- clase: la regla "clase 4 = credito" dejaría este ingreso neto inflado.
insert into public.contable_plan_cuenta (
  plan_id, codigo, nombre, naturaleza, permite_movimiento, opcional,
  requiere_tercero, requiere_centro_costo, requiere_fondo, requiere_inmueble
)
select p.id, '4695', 'Descuentos y devoluciones concedidos', 'debito', true, false,
       false, false, false, true
from public.contable_plan p
where p.codigo = 'PUC_PH_CO';

update public.contable_plan_cuenta h
set parent_id = p.id
from public.contable_plan_cuenta p
where h.codigo = '4695' and p.codigo = '46' and p.plan_id = h.plan_id;

-- ── 2. propagarla a los planes ya instanciados ───────────────────────────
-- Sin procedimiento especial: fn_instanciar_plan_contable es idempotente, así que vuelve a
-- recorrer la plantilla y solo inserta lo que falta. Esta es exactamente la propiedad por la
-- que se diseñó así en PC-2 — publicar una cuenta nueva en la plantilla y repartirla no
-- requiere código nuevo.
do $$
declare
  v_tenant uuid;
begin
  for v_tenant in select distinct tenant_id from public.contable_cuenta loop
    perform public.fn_instanciar_plan_contable(v_tenant);
  end loop;
end $$;

-- ── 3. mapear las 12 cuentas presupuestales pendientes ───────────────────
update public.presupuesto_cuenta pc
set contable_cuenta_id = cc.id
from (values
  ('ing_fondo_imprevistos',             '4115'),  -- la cuota del fondo (CTCP: ingreso separado)
  ('ing_intereses_demora',              '4205'),
  ('ing_alquiler_salon_disponible',     '4305'),
  ('ing_usufructo_zona_comun',          '4310'),
  ('ing_sancion_inasistencia',          '4505'),
  ('ing_financieros',                   '4605'),
  ('ing_reintegro_gastos',              '4610'),
  ('ing_descuento_pronto_pago',         '4695'),
  ('ing_descuentos_concedidos',         '4695'),
  ('ing_ajuste_peso',                   '4690'),
  ('ing_aprovechamientos',              '4690'),
  ('ing_ingresos_ejercicios_anteriores','4690')
) as m(codigo_presupuestal, codigo_contable),
public.contable_cuenta cc
where cc.codigo = m.codigo_contable
  and cc.tenant_id = pc.tenant_id
  and pc.codigo = m.codigo_presupuestal
  and pc.es_hoja
  and pc.contable_cuenta_id is null;
