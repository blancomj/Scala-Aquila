-- 20260908130000_interes_multiplicador_tope_legal.sql
--
-- El guard `guard_politica_financiera_tope_legal` (20260901110000) valida que
-- `interes_tasa_mensual`/`interes_tope_mensual` no excedan
--
--     interes_multiplicador × tasas_referencia.valor_mensual
--
-- pero `interes_multiplicador` no tenía límite propio: lo declara el tenant.
-- Con un multiplicador de 3.00 el guard aprobaba el triple del IBC sin objetar
-- nada. El tope "legal" era, en la práctica, autodeclarado — el guard solo
-- comprobaba que la tasa no excediera el techo que la misma política se había
-- puesto.
--
-- El art. 30 de la Ley 675 de 2001 permite hasta UNA Y MEDIA VECES el interés
-- bancario corriente. Ese 1.5 no es una de las incertidumbres abiertas de
-- `VER-CAR-01`, que pregunta por el orden de las operaciones, el método de
-- conversión de efectiva anual a mensual, la modalidad de IBC aplicable y la
-- base de días — no por el múltiplo. El múltiplo está en el texto de la norma,
-- así lo recoge `CAR_10` §CJ-1 y así lo dice el propio comentario del guard
-- (PH-C36/PH-C37: la asamblea puede fijar menos, nunca más).
--
-- No se toca la fórmula, ni el valor de la tasa, ni el guard. Solo se impide
-- declarar un multiplicador por encima del máximo legal.
--
-- Verificado antes de aplicar: ninguna política existente declara un
-- multiplicador superior a 1.5 (la única que lo declara vale exactamente 1.50).

alter table public.politicas_financieras
  add constraint politicas_financieras_multiplicador_tope_legal
  check (
    interes_multiplicador is null
    or (interes_multiplicador > 0 and interes_multiplicador <= 1.5)
  );

comment on constraint politicas_financieras_multiplicador_tope_legal
  on public.politicas_financieras is
  'PH-C36: el multiplicador del interés de mora no puede exceder 1.5 veces la tasa de '
  'referencia (art. 30 Ley 675 de 2001). Fijar un multiplicador menor sí es válido '
  '(PH-C37, decisión de asamblea). Nullable porque una política sin interés de mora omite '
  'los tres campos de tasa, tal como admite guard_politica_financiera_tope_legal.';
