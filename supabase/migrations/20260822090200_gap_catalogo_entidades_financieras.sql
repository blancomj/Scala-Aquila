-- ═══════════════════════════════════════════════════════════════════════
--  Gap reseñado (no implementado): catálogo de entidades para
--  cuentas_bancarias.banco
--  Propietario: conversación de diseño de esta sesión.
--
--  `cuentas_bancarias.banco` es texto libre hoy (20260817200000). Debería
--  ser un catálogo — mismo patrón que TIPO_IDENTIFICACION o
--  PERSONA_PREDIO (lista_tipos, extensible por tenant) — pero no se
--  siembra en esta migración porque falta conseguir el listado real:
--  bancos tradicionales (Bancolombia, Davivienda, BBVA, Banco de
--  Bogotá...) Y carteras/monederos digitales (Nequi, Daviplata, Movii...),
--  que en Colombia son un canal de recaudo real para una copropiedad, no
--  un caso raro a ignorar.
--
--  Al implementarlo, dos cosas a decidir entonces, no ahora:
--  1. Familia nueva en lista_tipos (p. ej. ENTIDAD_FINANCIERA) que
--     reemplace la columna de texto libre por entidad_financiera_id.
--  2. `cuenta_bancaria_tipo_t` ('ahorros', 'corriente') no cubre un
--     monedero digital — no tiene ahorros/corriente, es un saldo de
--     billetera. Puede que la familia nueva ya distinga
--     banco/wallet por su propio atributo, o que tipo_cuenta necesite un
--     tercer valor — no se resuelve aquí, es la primera pregunta a
--     responder cuando haya listado real en la mano.
-- ═══════════════════════════════════════════════════════════════════════

comment on column public.cuentas_bancarias.banco is
  'Texto libre por ahora — PENDIENTE: reemplazar por FK a un catálogo de entidades '
  '(bancos + carteras/monederos digitales como Nequi/Daviplata/Movii) una vez se consiga '
  'el listado real. Ver comentario de la migración 20260817210000 para el detalle.';
