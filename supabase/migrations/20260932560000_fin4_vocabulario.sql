-- ═══════════════════════════════════════════════════════════════════════
--  FIN-4 · Flujo de caja proyectado y alertas de liquidez (1/8)
--  Casos de uso/Tres Modulos/Financiero/FIN_04_flujo_proyectado.md
--
--  Último corte de la serie FIN. Depende de FIN-3, CO-5, MANT-9 (opcional).
--
--  `finanzas_flujo_escenario_t` (D-24, enum justificado): 3 valores CERRADOS
--  que gatillan lógica de cálculo distinta en finanzas_flujo_proyectado() —
--  no es vocabulario descriptivo abierto (a diferencia de FUENTE_SALUD_
--  FACTOR en MANT-9), es un `case` real con 3 ramas fijas.
--
--  `TIPO_ALERTA_LIQUIDEZ` (lista_tipos, catálogo descriptivo del sistema —
--  cada código gatilla una consulta distinta dentro de finanzas_alertas_
--  evaluar(), mismo criterio que FUENTE_SALUD_FACTOR en MANT-9): los 5
--  ejemplos que el §3.5 del corte ofrece como plantilla. El catálogo de
--  TIPOS es platform-wide (siempre existe); las REGLAS reales por tenant
--  (`finanzas_alerta_regla`) siguen en cero — ver migración 580000.
-- ═══════════════════════════════════════════════════════════════════════

create type public.finanzas_flujo_escenario_t as enum ('base', 'conservador', 'optimista');
comment on type public.finanzas_flujo_escenario_t is
  'FIN-4 §3.2: 3 valores cerrados, nunca extensibles por tenant. base = tasa de recaudo histórica '
  'calculada en vivo (finanzas_tasa_recaudo_historica); conservador = coeficientes explícitos del '
  'tenant en finanzas_escenario_parametros, sin valor por defecto; optimista = 100% de recaudo en '
  'su fecha, sin coeficiente configurable (definición fija del propio corte, §3.2).';

insert into public.tipos (codigo, nombre, descripcion) values
  ('TIPO_ALERTA_LIQUIDEZ', 'Tipo de alerta de liquidez',
   'FIN-4 §3.5: qué condición evalúa una regla de alerta sobre el flujo de caja proyectado o la '
   'cartera. Catálogo CERRADO — finanzas_alertas_evaluar() tiene un dispatch fijo por código, una '
   'regla con tipo_id fuera de esta familia falla. Las reglas mismas (finanzas_alerta_regla) no se '
   'siembran — solo este catálogo de tipos posibles es platform-wide.');

insert into public.lista_tipos (tipo, codigo, nombre, descripcion, orden) values
  ('TIPO_ALERTA_LIQUIDEZ', 'saldo_30d_bajo_umbral', 'Saldo proyectado a 30 días bajo un umbral',
   'Compara el saldo_acumulado de la semana que cubre el día 30 contra umbral (monto absoluto).', 10),
  ('TIPO_ALERTA_LIQUIDEZ', 'saldo_30d_negativo', 'Saldo proyectado a 30 días negativo',
   'Igual que saldo_30d_bajo_umbral con umbral=0 — ejemplo aparte porque no requiere configurar '
   'ningún monto.', 20),
  ('TIPO_ALERTA_LIQUIDEZ', 'flujo_neto_negativo_n_semanas', 'Flujo neto negativo en N semanas',
   'Cuenta semanas con flujo_neto < 0 dentro del horizonte proyectado; dispara si el conteo >= '
   'semanas_consecutivas.', 30),
  ('TIPO_ALERTA_LIQUIDEZ', 'cxp_vencida_sin_lote', 'CxP vencida sin lote de pago programado',
   'finanzas_facturas_pagables() con p_solo_vencidas=true, filtrando ya_en_lote=false, sobre monto '
   '(umbral).', 40),
  ('TIPO_ALERTA_LIQUIDEZ', 'cartera_vencida_deteriorando', 'Cartera vencida deteriorándose',
   'fn_evolucion_cartera_vencida(): variación positiva de deuda_vencida entre la corrida más '
   'reciente y la anterior.', 50);
