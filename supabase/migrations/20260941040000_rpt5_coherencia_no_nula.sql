-- ═══════════════════════════════════════════════════════════════════════
--  RPT-05 (5/n) · El CHECK de coherencia no puede evaluar a NULL
--
--  EL ERROR, Y POR QUÉ ES FÁCIL DE COMETER
--  ───────────────────────────────────────
--  La restricción escrita en 20260941010000 decía, para la rama semanal:
--
--      dia_semana between 0 and 6
--
--  Con `dia_semana` NULL eso no da FALSO: da NULL. Y un CHECK que evalúa a
--  NULL **se considera satisfecho** — así lo define el estándar SQL, para
--  que una columna opcional no rompa las restricciones que la mencionan.
--  Resultado: una programación 'semanal' SIN día de semana entraba tan
--  campante, y el cálculo de la próxima corrida habría devuelto NULL para
--  siempre. Una programación que nunca corre y que nadie nota.
--
--  Lo mismo en la rama mensual con `dia_mes`. Las ramas 'una_vez' y
--  'diaria' no tenían el problema: `is null` / `is not null` devuelven
--  siempre verdadero o falso, nunca NULL.
--
--  Lo encontró la prueba `tests/rls/reportes-programaciones.test.ts` al
--  exigir el código de error 23514 en vez de conformarse con «falló»: la
--  fila no falló en absoluto.
--
--  La corrección es envolver cada rama en `coalesce(..., false)`: si algo
--  no se puede evaluar, no pasa.
-- ═══════════════════════════════════════════════════════════════════════

alter table public.reporte_programaciones
  drop constraint reporte_programaciones_calendario_coherente;

alter table public.reporte_programaciones
  add constraint reporte_programaciones_calendario_coherente check (
    coalesce(
      case frecuencia
        when 'una_vez' then fecha_unica is not null and dia_semana is null and dia_mes is null
        when 'diaria'  then fecha_unica is null and dia_semana is null and dia_mes is null
        when 'semanal' then fecha_unica is null and dia_semana between 0 and 6 and dia_mes is null
        when 'mensual' then fecha_unica is null and dia_semana is null and dia_mes between 1 and 28
      end,
      false
    )
  );

comment on constraint reporte_programaciones_calendario_coherente on public.reporte_programaciones is
  'Cada frecuencia exige SU dato de calendario y prohíbe los de las otras. El coalesce(..., false) '
  'no es defensivo de más: sin él, un `between` sobre una columna nula evalúa a NULL y el CHECK se '
  'da por satisfecho — una programación semanal sin día entraba sin protestar.';
