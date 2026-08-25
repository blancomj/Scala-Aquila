-- ═══════════════════════════════════════════════════════════════════════
--  Restaura el NOT NULL de `nivel` que se perdió al cambiar los dígitos del
--  Auxiliar
--
--  ═══ QUÉ PASÓ ═══
--
--  20260830520000_contable_clase_nivel_not_null.sql marcó `clase` y `nivel`
--  como NOT NULL con un propósito muy concreto, escrito en su propia
--  cabecera: que el TIPO GENERADO lo supiera y el front no tuviera que
--  tratar con un `number | null` que en la práctica nunca es null.
--
--  20260830560000_contable_auxiliar_tres_digitos.sql cambió la expresión de
--  la columna generada (el Auxiliar pasó de 8 a 9 dígitos). Una expresión
--  `generated always as (...)` no se puede alterar: hay que DROP COLUMN +
--  ADD COLUMN. Y una columna recreada nace nullable — el NOT NULL no viaja
--  con ella.
--
--  Consecuencia: `database.generated.ts` volvió a declarar `nivel: number |
--  null` y el typecheck de apps/web empezó a fallar en
--  pages/contabilidad/plan-de-cuentas.vue, donde se hace `(fila.nivel - 1)`.
--  El dato en la base siempre estuvo bien; lo que se perdió fue la promesa
--  de que estaba bien.
--
--  Se detectó al correr `nuxi typecheck` tras implementar L7 — vale la pena
--  anotarlo: el error no lo produjo el código nuevo, lo destapó.
--
--  ═══ POR QUÉ ES SEGURO ═══
--
--  Verificado antes de escribir esto: cero filas con nivel null en ambas
--  tablas. El CASE de la expresión cubre las cinco longitudes válidas
--  (1/2/4/6/9) y el CHECK de `codigo` no admite ninguna otra, así que la
--  rama sin cubrir es inalcanzable — igual que razonaba 20260830520000.
-- ═══════════════════════════════════════════════════════════════════════

alter table public.contable_cuenta
  alter column nivel set not null;

alter table public.contable_plan_cuenta
  alter column nivel set not null;

comment on column public.contable_cuenta.nivel is
  'Nivel jerárquico derivado de la longitud del código (1/2/4/6/9 → 1..5). NOT NULL para que el '
  'tipo generado lo refleje: el CHECK de codigo no admite otra longitud, así que la rama sin '
  'cubrir del CASE es inalcanzable. Restaurado tras perderse en el DROP+ADD de '
  '20260830560000 (una columna generada recreada nace nullable).';
