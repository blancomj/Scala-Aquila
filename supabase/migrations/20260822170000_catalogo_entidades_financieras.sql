-- ═══════════════════════════════════════════════════════════════════════
--  Catálogo de entidades financieras — cierra el gap reseñado en
--  20260822090200_gap_catalogo_entidades_financieras.sql.
--  Propietario: conversación de diseño de esta sesión.
--
--  `cuentas_bancarias.banco` (texto libre) → `entidad_financiera_id` (FK a
--  lista_tipos, familia ENTIDAD_FINANCIERA) — mismo patrón que
--  TIPO_INMUEBLE/TIPO_ZONA_COMUN/CATEGORIA_RUBRO_PRESUPUESTAL
--  (20260814160000): fila de plataforma (tenant_id NULL), ampliable por
--  tenant sin migración nueva.
--
--  El listado incluye bancos tradicionales y billeteras digitales
--  (Nequi, Daviplata, Movii, RappiPay) porque en Colombia son un canal de
--  recaudo real para una copropiedad, no un caso raro a ignorar.
--
--  Segunda pregunta del gap ("¿tipo_cuenta necesita un tercer valor para
--  billetera?"): sí — 'ahorros'/'corriente' no describe un saldo de
--  monedero digital. Se agrega el valor 'billetera' a
--  cuenta_bancaria_tipo_t en vez de crear un atributo nuevo en
--  lista_tipos — la distinción banco/billetera solo importa para ese
--  campo, no para el resto de columnas que ya usan la familia genérica.
-- ═══════════════════════════════════════════════════════════════════════

-- ── seed: familia ENTIDAD_FINANCIERA ────────────────────────────────────
insert into public.tipos (codigo, nombre, descripcion) values
  ('ENTIDAD_FINANCIERA', 'Entidad Financiera', 'Banco o billetera digital donde la copropiedad puede tener una cuenta de recaudo.');

insert into public.lista_tipos (tipo, codigo, nombre, orden) values
  ('ENTIDAD_FINANCIERA', 'bancolombia', 'Bancolombia', 1),
  ('ENTIDAD_FINANCIERA', 'banco_bogota', 'Banco de Bogotá', 2),
  ('ENTIDAD_FINANCIERA', 'davivienda', 'Davivienda', 3),
  ('ENTIDAD_FINANCIERA', 'bbva', 'BBVA Colombia', 4),
  ('ENTIDAD_FINANCIERA', 'banco_occidente', 'Banco de Occidente', 5),
  ('ENTIDAD_FINANCIERA', 'banco_popular', 'Banco Popular', 6),
  ('ENTIDAD_FINANCIERA', 'banco_caja_social', 'Banco Caja Social', 7),
  ('ENTIDAD_FINANCIERA', 'banco_agrario', 'Banco Agrario de Colombia', 8),
  ('ENTIDAD_FINANCIERA', 'av_villas', 'Banco AV Villas', 9),
  ('ENTIDAD_FINANCIERA', 'scotiabank_colpatria', 'Scotiabank Colpatria', 10),
  ('ENTIDAD_FINANCIERA', 'itau', 'Itaú', 11),
  ('ENTIDAD_FINANCIERA', 'banco_gnb_sudameris', 'Banco GNB Sudameris', 12),
  ('ENTIDAD_FINANCIERA', 'banco_falabella', 'Banco Falabella', 13),
  ('ENTIDAD_FINANCIERA', 'banco_pichincha', 'Banco Pichincha', 14),
  ('ENTIDAD_FINANCIERA', 'bancoomeva', 'Bancoomeva', 15),
  ('ENTIDAD_FINANCIERA', 'banco_serfinanza', 'Banco Serfinanza', 16),
  ('ENTIDAD_FINANCIERA', 'nequi', 'Nequi', 17),
  ('ENTIDAD_FINANCIERA', 'daviplata', 'Daviplata', 18),
  ('ENTIDAD_FINANCIERA', 'movii', 'Movii', 19),
  ('ENTIDAD_FINANCIERA', 'rappipay', 'RappiPay', 20),
  ('ENTIDAD_FINANCIERA', 'otra', 'Otra', 21);

-- ── cuentas_bancarias.banco (texto) → entidad_financiera_id (FK) ───────
alter table public.cuentas_bancarias add column entidad_financiera_id bigint;

update public.cuentas_bancarias cb
set entidad_financiera_id = lt.id
from public.lista_tipos lt
where lt.tipo = 'ENTIDAD_FINANCIERA' and lt.tenant_id is null and lower(lt.nombre) = lower(trim(cb.banco));

-- Best-effort: si algún registro histórico no matcheó por nombre exacto,
-- cae a 'Otra' en vez de dejar la migración inconsistente.
update public.cuentas_bancarias cb
set entidad_financiera_id = (
  select lt.id from public.lista_tipos lt
  where lt.tipo = 'ENTIDAD_FINANCIERA' and lt.tenant_id is null and lt.codigo = 'otra'
)
where cb.entidad_financiera_id is null;

alter table public.cuentas_bancarias alter column entidad_financiera_id set not null;
alter table public.cuentas_bancarias
  add constraint cuentas_bancarias_entidad_financiera_id_fkey foreign key (entidad_financiera_id) references public.lista_tipos (id);
create index cuentas_bancarias_entidad_financiera_id_idx on public.cuentas_bancarias (entidad_financiera_id);

alter table public.cuentas_bancarias drop column banco;

comment on table public.cuentas_bancarias is
  'Cuentas bancarias de la copropiedad. es_recaudo: exactamente una activa por tenant '
  '(índice único parcial) — cambiarla va por fn_marcar_cuenta_recaudo, nunca UPDATE '
  'directo. entidad_financiera_id: catálogo ENTIDAD_FINANCIERA (banco o billetera digital).';

-- ── cuenta_bancaria_tipo_t: + 'billetera' ───────────────────────────────
-- No se usa en este mismo archivo (Postgres no permite usar un valor de
-- enum agregado en la misma transacción que lo crea).
alter type public.cuenta_bancaria_tipo_t add value 'billetera';
