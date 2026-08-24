-- ═══════════════════════════════════════════════════════════════════════
--  PC-1b · Corrección normativa del PUC base: el fondo de imprevistos NO
--  es pasivo ni patrimonio — es efectivo restringido (activo)
--
--  20260830430000 sembró el fondo de imprevistos por partida doble en las
--  dos ubicaciones que se discuten en la práctica (2705 pasivo / 3205
--  patrimonio) y dejó que cada copropiedad eligiera. La investigación
--  normativa posterior mostró que ninguna de las dos es correcta.
--
--  FUNDAMENTO (tipo: ORIENTACIÓN TÉCNICA del regulador contable)
--    • CTCP, Concepto 0146 del 30 de abril de 2025: el fondo de imprevistos
--      "no es patrimonio ni pasivo"; su clasificación corresponde a un
--      ACTIVO RESTRINGIDO (efectivo con destinación específica). Presentarlo
--      en el patrimonio es un error de presentación que debe corregirse en
--      el periodo en que se identifica.
--    • CTCP, Concepto unificado 01(445) del 5 de junio de 2018: compila la
--      doctrina 2014-2018 en el mismo sentido — el fondo se constituye solo
--      con recursos líquidos efectivamente recaudados; la parte causada y no
--      recaudada se reconoce como cuenta por cobrar del fondo; el ingreso de
--      la cuota se reconoce en resultados, con presentación separada de la
--      cuota ordinaria.
--    • Ley 675 de 2001, arts. 34 y 35 (NORMA): obligatoriedad del fondo y
--      mínimo del 1% del presupuesto anual de gastos comunes.
--    • Verificado el 2026-08-24 mediante fuentes que citan los conceptos por
--      número y fecha; NO se pudo leer el PDF primario del CTCP (403 en el
--      portal y codificación de fuente no extraíble en el DOT 15). Queda
--      como validación de segundo grado — ver PC_01 §1.
--
--  CONSECUENCIA DE DISEÑO, y es la parte elegante: al dejar de ser una
--  cuenta de pasivo/patrimonio, el fondo pasa a ser exactamente lo que el
--  prompt maestro §13/§59/§81 pide que sea — una DIMENSIÓN analítica
--  (fondo_id) sobre movimientos cuya cuenta es efectivo restringido
--  (111015) o el gasto que se atendió con esos recursos. Una cuenta
--  contable menos, una dimensión bien usada.
--
--  Se reemplaza el seed de PUC_PH_CO_V1 en sitio en vez de publicar una V2
--  porque contable_cuenta está vacía: ninguna copropiedad ha instanciado
--  todavía el plan (PC-2 no existe), así que no hay nada que migrar y
--  arrastrar una V1 muerta solo añadiría ruido. Si ya hubiera tenants
--  instanciados, la vía correcta sería publicar V2 y migrar el mapeo.
-- ═══════════════════════════════════════════════════════════════════════

-- ── 1. limpiar el seed anterior (parent_id primero: FK on delete restrict) ──
update public.contable_plan_cuenta set parent_id = null
where plan_id = (select id from public.contable_plan where codigo = 'PUC_PH_CO_V1');

delete from public.contable_plan_cuenta
where plan_id = (select id from public.contable_plan where codigo = 'PUC_PH_CO_V1');

update public.contable_plan
set version = 2,
    descripcion = 'Catálogo base para copropiedades colombianas. 144 cuentas de instalación '
      'automática más 13 opcionales (clases 6 y 8, y la cuenta del fondo de reserva). El fondo '
      'de imprevistos se maneja como efectivo restringido (CTCP 0146/2025), no como pasivo ni '
      'patrimonio. Ver Casos de uso/Contabilidad/PC_01_Plantilla_PUC_Propiedad_Horizontal.md'
where codigo = 'PUC_PH_CO_V1';

-- ── 2. resembrar ─────────────────────────────────────────────────────────
-- Cambios frente a 20260830430000:
--   • ELIMINADO grupo 27 (Fondos con destinación específica, pasivo) y grupo 32 (Fondos
--     patrimoniales) — el error que corrige esta migración.
--   • NUEVA 1315 Fondo de imprevistos (CxC): la cuota causada y no recaudada, que según el
--     concepto unificado no debe engrosar el fondo líquido hasta que entre en caja.
--   • NUEVA 4115 Cuota fondo de imprevistos: el CTCP recomienda presentar este ingreso separado
--     de la cuota ordinaria. Las cuentas 13xx siguientes se corren para dejarle el hueco.
--   • NUEVA 4320 Servicios asociados al uso de bienes comunes: energía del salón y similares.
--     Se tratan como ingreso, no como recuperación de gasto: son contraprestación por el uso
--     del bien común, y netearlos contra el gasto ocultaría las dos cifras.
--   • RENUMERADAS las correctoras a la convención colombiana reconocible (Decreto 2650):
--     1390 -> 1399, 1595 -> 1592, 1695 -> 1698. El 2650 no rige para PH, pero el objetivo
--     declarado del módulo es exportar a sistemas contables externos, y esos son los códigos
--     que un contador colombiano espera ver. Su naturaleza credito dentro de la clase 1 (activo)
--     ya era la correcta: son cuentas correctoras, restan del activo que corrigen.
--   • 111020 Cuenta fondo de reserva pasa a opcional: la Ley 675 art. 35 obliga al fondo de
--     imprevistos, no al de reserva — ese lo crea la asamblea si lo decide.
insert into public.contable_plan_cuenta (
  plan_id, codigo, nombre, naturaleza, permite_movimiento, opcional,
  requiere_tercero, requiere_centro_costo, requiere_fondo, requiere_inmueble
)
select
  p.id, v.codigo, v.nombre, v.nat::public.contable_naturaleza_t, v.mov, v.opc,
  position('T' in v.dim) > 0, position('C' in v.dim) > 0,
  position('F' in v.dim) > 0, position('I' in v.dim) > 0
from public.contable_plan p,
(values
  -- ═══ CLASE 1 — ACTIVO ═══
  ('1',      'ACTIVO',                                    'debito',  false, false, ''),
  ('11',     'Efectivo y equivalentes de efectivo',       'debito',  false, false, ''),
  ('1105',   'Caja',                                      'debito',  false, false, ''),
  ('110505', 'Caja general',                              'debito',  true,  false, ''),
  ('110510', 'Caja menor',                                'debito',  true,  false, ''),
  ('1110',   'Bancos',                                    'debito',  false, false, ''),
  ('111005', 'Cuenta corriente',                          'debito',  true,  false, ''),
  ('111010', 'Cuenta de ahorros',                         'debito',  true,  false, ''),
  -- El fondo de imprevistos ES esta cuenta: efectivo restringido (CTCP 0146/2025).
  ('111015', 'Cuenta fondo de imprevistos',               'debito',  true,  false, 'F'),
  ('111020', 'Cuenta fondo de reserva',                   'debito',  true,  true,  'F'),
  ('12',     'Inversiones',                               'debito',  false, false, ''),
  ('1205',   'Certificados de depósito a término',        'debito',  true,  false, ''),
  ('1210',   'Fondos de inversión colectiva',             'debito',  true,  false, ''),
  ('13',     'Cuentas por cobrar',                        'debito',  false, false, ''),
  ('1305',   'Cuotas de administración',                  'debito',  true,  false, 'I'),
  ('1310',   'Cuotas extraordinarias',                    'debito',  true,  false, 'I'),
  ('1315',   'Fondo de imprevistos',                      'debito',  true,  false, 'FI'),
  ('1320',   'Intereses de mora',                         'debito',  true,  false, 'I'),
  ('1325',   'Multas y sanciones',                        'debito',  true,  false, 'I'),
  ('1330',   'Otros conceptos facturados',                'debito',  true,  false, 'I'),
  ('1335',   'Anticipos a proveedores',                   'debito',  true,  false, 'T'),
  ('1340',   'Deudores varios',                           'debito',  true,  false, 'T'),
  ('1399',   'Deterioro de cartera',                      'credito', true,  false, ''),
  ('14',     'Inventarios',                               'debito',  false, false, ''),
  ('1405',   'Elementos de aseo y cafetería',             'debito',  true,  false, ''),
  ('1410',   'Materiales y repuestos de mantenimiento',   'debito',  true,  false, ''),
  ('15',     'Propiedad, planta y equipo',                'debito',  false, false, ''),
  ('1505',   'Muebles y enseres',                         'debito',  true,  false, ''),
  ('1510',   'Equipo de oficina',                         'debito',  true,  false, ''),
  ('1515',   'Equipo de cómputo y comunicaciones',        'debito',  true,  false, ''),
  ('1520',   'Equipo de vigilancia y seguridad',          'debito',  true,  false, ''),
  ('1525',   'Maquinaria y equipo',                       'debito',  true,  false, ''),
  ('1592',   'Depreciación acumulada',                    'credito', true,  false, ''),
  ('16',     'Activos intangibles',                       'debito',  false, false, ''),
  ('1605',   'Licencias y software',                      'debito',  true,  false, ''),
  ('1698',   'Amortización acumulada',                    'credito', true,  false, ''),
  ('17',     'Otros activos',                             'debito',  false, false, ''),
  ('1705',   'Seguros pagados por anticipado',            'debito',  true,  false, ''),
  ('1710',   'Otros pagos anticipados',                   'debito',  true,  false, ''),

  -- ═══ CLASE 2 — PASIVO ═══
  ('2',      'PASIVO',                                    'credito', false, false, ''),
  ('21',     'Obligaciones financieras',                  'credito', false, false, ''),
  ('2105',   'Créditos y sobregiros bancarios',           'credito', true,  false, 'T'),
  ('22',     'Proveedores y contratistas',                'credito', false, false, ''),
  ('2205',   'Proveedores de bienes',                     'credito', true,  false, 'T'),
  ('2210',   'Proveedores de servicios',                  'credito', true,  false, 'T'),
  ('2215',   'Contratistas',                              'credito', true,  false, 'T'),
  ('23',     'Cuentas por pagar',                         'credito', false, false, ''),
  ('2305',   'Servicios públicos',                        'credito', true,  false, 'T'),
  ('2310',   'Honorarios',                                'credito', true,  false, 'T'),
  ('2315',   'Seguridad social y parafiscales',           'credito', true,  false, ''),
  ('2320',   'Retención en la fuente',                    'credito', true,  false, 'T'),
  ('2325',   'Retenciones y aportes de nómina',           'credito', true,  false, ''),
  ('2390',   'Acreedores varios',                         'credito', true,  false, 'T'),
  ('24',     'Obligaciones laborales',                    'credito', false, false, ''),
  ('2405',   'Salarios por pagar',                        'credito', true,  false, 'T'),
  ('2410',   'Cesantías consolidadas',                    'credito', true,  false, 'T'),
  ('2415',   'Intereses sobre cesantías',                 'credito', true,  false, 'T'),
  ('2420',   'Prima de servicios',                        'credito', true,  false, 'T'),
  ('2425',   'Vacaciones',                                'credito', true,  false, 'T'),
  ('25',     'Impuestos por pagar',                       'credito', false, false, ''),
  ('2505',   'Impuesto sobre las ventas (IVA)',           'credito', true,  false, ''),
  ('2510',   'Industria y comercio (ICA)',                'credito', true,  false, ''),
  ('2590',   'Otros impuestos',                           'credito', true,  false, ''),
  ('26',     'Anticipos y depósitos recibidos',           'credito', false, false, ''),
  ('2605',   'Anticipos de copropietarios',               'credito', true,  false, 'I'),
  ('2610',   'Depósitos por uso de zonas comunes',        'credito', true,  false, 'I'),
  ('28',     'Otros pasivos',                             'credito', false, false, ''),
  ('2805',   'Ingresos recibidos por anticipado',         'credito', true,  false, 'I'),

  -- ═══ CLASE 3 — PATRIMONIO ═══
  -- Sin grupo de "fondos patrimoniales": el fondo de imprevistos no vive aquí (CTCP 0146/2025).
  ('3',      'PATRIMONIO',                                'credito', false, false, ''),
  ('31',     'Patrimonio social',                         'credito', false, false, ''),
  ('3105',   'Patrimonio inicial',                        'credito', true,  false, ''),
  ('33',     'Resultados',                                'credito', false, false, ''),
  ('3305',   'Excedentes acumulados de ejercicios anteriores', 'credito', true, false, ''),
  ('3310',   'Excedente o déficit del ejercicio',         'credito', true,  false, ''),

  -- ═══ CLASE 4 — INGRESOS ═══
  ('4',      'INGRESOS',                                  'credito', false, false, ''),
  ('41',     'Expensas comunes',                          'credito', false, false, ''),
  ('4105',   'Cuotas ordinarias de administración',       'credito', true,  false, 'I'),
  ('4110',   'Cuotas extraordinarias',                    'credito', true,  false, 'I'),
  ('4115',   'Cuota fondo de imprevistos',                'credito', true,  false, 'FI'),
  ('42',     'Ingresos por mora',                         'credito', false, false, ''),
  ('4205',   'Intereses de mora',                         'credito', true,  false, 'I'),
  ('43',     'Uso de bienes comunes',                     'credito', false, false, ''),
  ('4305',   'Salón social',                              'credito', true,  false, ''),
  ('4310',   'Parqueaderos y zonas de estacionamiento',   'credito', true,  false, ''),
  ('4315',   'Otras zonas comunes',                       'credito', true,  false, ''),
  ('4320',   'Servicios asociados al uso de bienes comunes', 'credito', true, false, ''),
  ('44',     'Explotación económica de bienes comunes',   'credito', false, false, ''),
  ('4405',   'Arrendamiento de espacios',                 'credito', true,  false, 'T'),
  ('4410',   'Antenas y publicidad',                      'credito', true,  false, 'T'),
  ('45',     'Sanciones',                                 'credito', false, false, ''),
  ('4505',   'Multas por incumplimiento del reglamento',  'credito', true,  false, 'I'),
  ('46',     'Otros ingresos',                            'credito', false, false, ''),
  -- Los rendimientos del fondo de imprevistos entran aquí, no al patrimonio (CTCP): la
  -- dimensión fondo_id es la que los identifica como pertenecientes al fondo.
  ('4605',   'Rendimientos financieros',                  'credito', true,  false, 'F'),
  ('4610',   'Recuperaciones y reintegros',               'credito', true,  false, ''),
  ('4690',   'Ingresos diversos',                         'credito', true,  false, ''),

  -- ═══ CLASE 5 — GASTOS ═══
  ('5',      'GASTOS',                                    'debito',  false, false, ''),
  ('51',     'Administración, personal y honorarios',     'debito',  false, false, ''),
  ('5105',   'Honorarios de administración',              'debito',  true,  false, 'TC'),
  ('5110',   'Revisoría fiscal',                          'debito',  true,  false, 'TC'),
  ('5115',   'Contabilidad',                              'debito',  true,  false, 'TC'),
  ('5120',   'Asesoría jurídica',                         'debito',  true,  false, 'TC'),
  ('5125',   'Sueldos y salarios',                        'debito',  true,  false, 'C'),
  ('5130',   'Prestaciones sociales y seguridad social',  'debito',  true,  false, 'C'),
  ('52',     'Vigilancia y seguridad',                    'debito',  false, false, ''),
  ('5205',   'Servicio de vigilancia',                    'debito',  true,  false, 'TC'),
  ('5210',   'Monitoreo y seguridad electrónica',         'debito',  true,  false, 'TC'),
  ('53',     'Aseo y zonas comunes',                      'debito',  false, false, ''),
  ('5305',   'Servicio de aseo',                          'debito',  true,  false, 'TC'),
  ('5310',   'Elementos de aseo y cafetería',             'debito',  true,  false, 'C'),
  ('5315',   'Manejo de residuos',                        'debito',  true,  false, 'TC'),
  ('5320',   'Jardinería y zonas verdes',                 'debito',  true,  false, 'TC'),
  ('54',     'Servicios públicos',                        'debito',  false, false, ''),
  ('5405',   'Energía eléctrica',                         'debito',  true,  false, 'C'),
  ('5410',   'Acueducto y alcantarillado',                'debito',  true,  false, 'C'),
  ('5415',   'Gas',                                       'debito',  true,  false, 'C'),
  ('5420',   'Telefonía e internet',                      'debito',  true,  false, 'C'),
  ('55',     'Mantenimiento y reparaciones',              'debito',  false, false, ''),
  ('5505',   'Ascensores',                                'debito',  true,  false, 'TC'),
  ('5510',   'Equipos de bombeo e hidráulicos',           'debito',  true,  false, 'TC'),
  ('5515',   'Piscina',                                   'debito',  true,  false, 'TC'),
  ('5520',   'Planta eléctrica',                          'debito',  true,  false, 'TC'),
  ('5525',   'Instalaciones eléctricas',                  'debito',  true,  false, 'TC'),
  ('5530',   'Obras civiles y locativas',                 'debito',  true,  false, 'TC'),
  ('5535',   'Equipos de seguridad y control de acceso',  'debito',  true,  false, 'TC'),
  ('5590',   'Otros mantenimientos',                      'debito',  true,  false, 'TC'),
  ('56',     'Seguros',                                   'debito',  false, false, ''),
  ('5605',   'Póliza de áreas comunes',                   'debito',  true,  false, 'TC'),
  ('5610',   'Otras pólizas',                             'debito',  true,  false, 'TC'),
  ('57',     'Gastos legales y de asamblea',              'debito',  false, false, ''),
  ('5705',   'Gastos legales y notariales',               'debito',  true,  false, 'C'),
  ('5710',   'Gastos de asamblea y consejo',              'debito',  true,  false, 'C'),
  ('58',     'Gastos generales',                          'debito',  false, false, ''),
  ('5805',   'Papelería y útiles de oficina',             'debito',  true,  false, 'C'),
  ('5810',   'Software y servicios tecnológicos',         'debito',  true,  false, 'TC'),
  ('5815',   'Comunicaciones y notificaciones',           'debito',  true,  false, 'C'),
  ('5820',   'Gastos bancarios y comisiones',             'debito',  true,  false, 'C'),
  ('5825',   'Transporte y acarreos',                     'debito',  true,  false, 'C'),
  ('5830',   'Impuestos y contribuciones asumidos',       'debito',  true,  false, 'C'),
  ('5835',   'Intereses y gastos de financiación',        'debito',  true,  false, 'C'),
  ('5890',   'Gastos diversos',                           'debito',  true,  false, 'C'),
  ('59',     'Depreciaciones, amortizaciones y deterioros', 'debito', false, false, ''),
  ('5905',   'Depreciación',                              'debito',  true,  false, 'C'),
  ('5910',   'Amortización',                              'debito',  true,  false, 'C'),
  ('5915',   'Deterioro de cartera',                      'debito',  true,  false, ''),
  ('5990',   'Otros deterioros',                          'debito',  true,  false, 'C'),

  -- ═══ CLASE 6 — COSTOS (opcional) ═══
  ('6',      'COSTOS',                                    'debito',  false, true,  ''),
  ('61',     'Costos de actividades generadoras de ingresos', 'debito', false, true, ''),
  ('6105',   'Personal asociado',                         'debito',  true,  true,  'C'),
  ('6110',   'Insumos y suministros',                     'debito',  true,  true,  'C'),
  ('6190',   'Otros costos',                              'debito',  true,  true,  'C'),

  -- ═══ CLASE 8 — CUENTAS DE ORDEN (opcional) ═══
  -- Bajo NIIF PYMES las cuentas de orden no integran los estados financieros (lo que deba
  -- informarse va en revelaciones); se conservan como control administrativo para quien las
  -- use. Se adopta clase 8 con 81/82 según el §9 del prompt maestro, no el 7/8 del §8.
  ('8',      'CUENTAS DE ORDEN',                          'debito',  false, true,  ''),
  ('81',     'Deudoras',                                  'debito',  false, true,  ''),
  ('8105',   'Cartera en proceso jurídico',               'debito',  true,  true,  'I'),
  ('8110',   'Bienes recibidos en administración',        'debito',  true,  true,  ''),
  ('82',     'Acreedoras',                                'credito', false, true,  ''),
  ('8205',   'Contratos y compromisos vigentes',          'credito', true,  true,  'T'),
  ('8210',   'Garantías recibidas',                       'credito', true,  true,  'T')
) as v(codigo, nombre, nat, mov, opc, dim)
where p.codigo = 'PUC_PH_CO_V1';

-- ── 3. parent_id por prefijo ─────────────────────────────────────────────
update public.contable_plan_cuenta h
set parent_id = p.id
from public.contable_plan_cuenta p
where p.plan_id = h.plan_id
  and length(h.codigo) > 1
  and length(p.codigo) =
    case length(h.codigo) when 2 then 1 when 4 then 2 when 6 then 4 when 8 then 6 end
  and left(h.codigo, length(p.codigo)) = p.codigo;
