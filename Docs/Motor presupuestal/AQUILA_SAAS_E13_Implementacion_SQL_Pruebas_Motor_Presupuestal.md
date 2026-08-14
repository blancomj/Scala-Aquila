# AQUILA_SAAS — E-13
## Implementación SQL y pruebas del Motor Presupuestal

**Proyecto:** AQUILA_SAAS  
**Ámbito:** Administración de propiedad horizontal en Colombia  
**Etapa:** Implementación técnica  
**Versión:** 1.0  
**Fecha:** 14 de agosto de 2026

---

# 1. Objetivo

Convertir E-12 en una primera implementación SQL ejecutable y verificable del núcleo del Motor Presupuestal.

Este entregable contiene:

- funciones PostgreSQL;
- validaciones transaccionales;
- cálculo por coeficiente;
- cálculo por módulo;
- consolidación de cuotas;
- validación de conservación;
- control de estados;
- creación de nuevas versiones;
- casos de prueba matemáticos.

No se implementa todavía:

- RLS definitivo;
- API/Edge Functions;
- interfaz;
- cartera;
- liquidación;
- contabilidad.

---

# 2. Alcance técnico

La primera versión implementará completamente:

```text
VALIDACIÓN
   ↓
DISTRIBUCIÓN
   ↓
CONSERVACIÓN
   ↓
CUOTAS
   ↓
APROBACIÓN
   ↓
VERSIONAMIENTO
```

El cálculo de métodos presupuestales complejos como contratos, históricos, cotizaciones y fórmulas dinámicas queda preparado mediante la estructura de E-11/E-12, pero no se ejecutará mediante SQL dinámico inseguro.

---

# 3. Principio de seguridad

Las fórmulas almacenadas en `calculo_presupuestal.formula` **no se ejecutarán directamente como SQL**.

No se permitirá:

```sql
execute formula;
```

ni construir SQL concatenando valores provenientes de usuarios.

Para una primera implementación:

```text
VALOR_FIJO
PARAMETRIZADO
CANTIDAD_X_TARIFA
PROYECCION
```

deben utilizar parámetros estructurados en `jsonb`.

Las fórmulas dinámicas serán objeto de una implementación específica y segura posterior.

---

# 4. Función auxiliar — conversión de porcentaje

```sql
create or replace function fn_porcentaje(
    p_valor numeric
)
returns numeric
language sql
immutable
as $$
    select p_valor / 100.0;
$$;
```

Ejemplo:

```text
1.25 % → 0.0125
```

---

# 5. Función — validar estado editable

```sql
create or replace function fn_validar_presupuesto_editable(
    p_presupuesto_id uuid
)
returns void
language plpgsql
as $$
declare
    v_estado presupuesto_estado;
begin
    select estado
      into v_estado
      from presupuesto
     where id = p_presupuesto_id
     for update;

    if not found then
        raise exception using
            errcode = 'P0001',
            message = 'PRESUPUESTO_NO_EXISTE';
    end if;

    if v_estado in ('APROBADO', 'VIGENTE', 'CERRADO') then
        raise exception using
            errcode = 'P0001',
            message = 'PRESUPUESTO_NO_EDITABLE';
    end if;
end;
$$;
```

---

# 6. Función — validar fuente de financiación

```sql
create or replace function fn_validar_fuente_financiacion(
    p_fuente_id uuid,
    p_componente_id uuid,
    p_valor numeric
)
returns boolean
language plpgsql
as $$
declare
    v_disponible numeric;
    v_aplicado numeric;
    v_tipo fuente_financiacion_tipo;
begin
    if p_valor < 0 then
        return false;
    end if;

    select
        valor_disponible,
        valor_aplicado,
        tipo
    into
        v_disponible,
        v_aplicado,
        v_tipo
    from fuente_financiacion
    where id = p_fuente_id
    for update;

    if not found then
        return false;
    end if;

    if p_valor > (v_disponible - v_aplicado) then
        return false;
    end if;

    return true;
end;
$$;
```

La validación de destinación deberá ampliarse cuando se implemente el catálogo formal de destinaciones.

---

# 7. Función — validar distribución

```sql
create or replace function fn_validar_distribucion(
    p_componente_id uuid
)
returns boolean
language plpgsql
as $$
declare
    v_necesidad numeric;
    v_participacion numeric;
    v_distribuido numeric;
    v_tolerancia numeric := 0.01;
begin
    select valor_presupuestado
      into v_necesidad
      from componente_presupuestal
     where id = p_componente_id;

    if not found then
        raise exception using
            errcode = 'P0001',
            message = 'COMPONENTE_NO_EXISTE';
    end if;

    select coalesce(sum(participacion), 0)
      into v_participacion
      from universo_distribucion
     where componente_id = p_componente_id;

    if abs(v_participacion - 100) > 0.00000001 then
        return false;
    end if;

    select coalesce(sum(valor_redondeado), 0)
      into v_distribuido
      from distribucion_presupuestal
     where componente_id = p_componente_id;

    if abs(v_distribuido - v_necesidad) > v_tolerancia then
        return false;
    end if;

    return true;
end;
$$;
```

---

# 8. Función — distribución por coeficiente

```sql
create or replace function fn_distribuir_coeficiente(
    p_componente_id uuid
)
returns void
language plpgsql
as $$
declare
    r record;
    v_necesidad numeric;
    v_valor numeric;
begin
    select valor_presupuestado
      into v_necesidad
      from componente_presupuestal
     where id = p_componente_id;

    if not found then
        raise exception using
            errcode = 'P0001',
            message = 'COMPONENTE_NO_EXISTE';
    end if;

    delete from distribucion_presupuestal
     where componente_id = p_componente_id;

    for r in
        select
            u.unidad_privada_id,
            u.participacion,
            c.valor as coeficiente
        from universo_distribucion u
        join componente_presupuestal cp
          on cp.id = u.componente_id
        join presupuesto p
          on p.id = cp.presupuesto_id
        join coeficiente_copropiedad c
          on c.unidad_privada_id = u.unidad_privada_id
         and c.vigencia_id = p.vigencia_id
        where u.componente_id = p_componente_id
        order by u.unidad_privada_id
    loop

        v_valor :=
            v_necesidad *
            fn_porcentaje(r.coeficiente);

        insert into distribucion_presupuestal (
            componente_id,
            unidad_privada_id,
            regla_distribucion_id,
            participacion,
            valor_calculado,
            valor_redondeado
        )
        select
            p_componente_id,
            r.unidad_privada_id,
            rd.id,
            r.coeficiente,
            v_valor,
            round(v_valor, 2)
        from regla_distribucion rd
        where rd.componente_id = p_componente_id
          and rd.tipo = 'COEFICIENTE'
        limit 1;

    end loop;
end;
$$;
```

---

# 9. Función — distribución por módulo

```sql
create or replace function fn_distribuir_modulo(
    p_componente_id uuid
)
returns void
language plpgsql
as $$
declare
    r record;
    v_necesidad numeric;
    v_valor numeric;
begin
    select valor_presupuestado
      into v_necesidad
      from componente_presupuestal
     where id = p_componente_id;

    if not found then
        raise exception using
            errcode = 'P0001',
            message = 'COMPONENTE_NO_EXISTE';
    end if;

    delete from distribucion_presupuestal
     where componente_id = p_componente_id;

    for r in
        select
            u.unidad_privada_id,
            m.valor as modulo
        from universo_distribucion u
        join componente_presupuestal cp
          on cp.id = u.componente_id
        join presupuesto p
          on p.id = cp.presupuesto_id
        join regla_distribucion rd
          on rd.componente_id = cp.id
         and rd.tipo = 'MODULO_CONTRIBUCION'
        join modulo_contribucion m
          on m.unidad_privada_id = u.unidad_privada_id
         and m.vigencia_id = p.vigencia_id
         and (rd.sector_id is null or m.sector_id = rd.sector_id)
        where u.componente_id = p_componente_id
        order by u.unidad_privada_id
    loop

        v_valor :=
            v_necesidad *
            fn_porcentaje(r.modulo);

        insert into distribucion_presupuestal (
            componente_id,
            unidad_privada_id,
            regla_distribucion_id,
            participacion,
            valor_calculado,
            valor_redondeado
        )
        select
            p_componente_id,
            r.unidad_privada_id,
            rd.id,
            r.modulo,
            v_valor,
            round(v_valor, 2)
        from regla_distribucion rd
        where rd.componente_id = p_componente_id
          and rd.tipo = 'MODULO_CONTRIBUCION'
        limit 1;

    end loop;
end;
$$;
```

---

# 10. Función — resolver diferencia residual

La diferencia residual se calcula después del redondeo.

```sql
create or replace function fn_resolver_residual_distribucion(
    p_componente_id uuid
)
returns numeric
language plpgsql
as $$
declare
    v_necesidad numeric;
    v_distribuido numeric;
    v_residual numeric;
    v_id uuid;
begin
    select valor_presupuestado
      into v_necesidad
      from componente_presupuestal
     where id = p_componente_id;

    select coalesce(sum(valor_redondeado), 0)
      into v_distribuido
      from distribucion_presupuestal
     where componente_id = p_componente_id;

    v_residual :=
        round(v_necesidad - v_distribuido, 2);

    if v_residual = 0 then
        return 0;
    end if;

    select id
      into v_id
      from distribucion_presupuestal
     where componente_id = p_componente_id
     order by valor_calculado desc, unidad_privada_id
     limit 1;

    if v_id is null then
        raise exception using
            errcode = 'P0001',
            message = 'NO_EXISTE_DISTRIBUCION_PARA_RESIDUAL';
    end if;

    update distribucion_presupuestal
       set valor_redondeado =
               valor_redondeado + v_residual,
           diferencia_residual =
               diferencia_residual + v_residual
     where id = v_id;

    return v_residual;
end;
$$;
```

---

# 11. Función — calcular distribución

```sql
create or replace function fn_calcular_distribucion(
    p_componente_id uuid
)
returns void
language plpgsql
as $$
declare
    v_tipo regla_distribucion_tipo;
    v_valida boolean;
begin
    select tipo
      into v_tipo
      from regla_distribucion
     where componente_id = p_componente_id
     order by created_at desc
     limit 1;

    if not found then
        raise exception using
            errcode = 'P0001',
            message = 'REGLA_DISTRIBUCION_NO_EXISTE';
    end if;

    case v_tipo

        when 'COEFICIENTE' then
            perform fn_distribuir_coeficiente(p_componente_id);

        when 'MODULO_CONTRIBUCION' then
            perform fn_distribuir_modulo(p_componente_id);

        else
            raise exception using
                errcode = 'P0001',
                message = 'REGLA_DISTRIBUCION_NO_IMPLEMENTADA';

    end case;

    perform fn_resolver_residual_distribucion(
        p_componente_id
    );

    v_valida :=
        fn_validar_distribucion(p_componente_id);

    if not v_valida then
        raise exception using
            errcode = 'P0001',
            message = 'DISTRIBUCION_NO_CONSERVA_COMPONENTE';
    end if;
end;
$$;
```

---

# 12. Función — calcular cuotas

```sql
create or replace function fn_calcular_cuotas(
    p_presupuesto_id uuid
)
returns void
language plpgsql
as $$
begin
    delete from cuota_presupuestal
     where presupuesto_id = p_presupuesto_id;

    insert into cuota_presupuestal (
        presupuesto_id,
        unidad_privada_id,
        periodo,
        valor,
        estado
    )
    select
        p_presupuesto_id,
        d.unidad_privada_id,
        null,
        round(sum(d.valor_redondeado), 2),
        'GENERADA'
    from distribucion_presupuestal d
    join componente_presupuestal c
      on c.id = d.componente_id
    where c.presupuesto_id = p_presupuesto_id
    group by d.unidad_privada_id;

end;
$$;
```

La versión inicial consolida la cuota anual.

La distribución mensual se implementará utilizando `periodo` cuando el presupuesto contenga componentes temporalmente diferenciados.

---

# 13. Función — validar financiación

```sql
create or replace function fn_validar_financiacion(
    p_presupuesto_id uuid
)
returns boolean
language plpgsql
as $$
declare
    r record;
    v_financiado numeric;
begin

    for r in
        select
            id,
            valor_presupuestado
        from componente_presupuestal
        where presupuesto_id = p_presupuesto_id
    loop

        select coalesce(sum(valor_aplicado), 0)
          into v_financiado
          from componente_financiacion
         where componente_id = r.id;

        if abs(v_financiado - r.valor_presupuestado) > 0.01 then
            return false;
        end if;

    end loop;

    return true;
end;
$$;
```

---

# 14. Función — validar presupuesto

```sql
create or replace function fn_validar_presupuesto(
    p_presupuesto_id uuid
)
returns jsonb
language plpgsql
as $$
declare
    r record;
    v_ok boolean := true;
    v_financiacion boolean;
    v_distribucion boolean;
    v_distribucion_total numeric;
    v_necesidad_total numeric;
    v_resultado jsonb;
begin

    if not exists (
        select 1
        from presupuesto
        where id = p_presupuesto_id
    ) then
        raise exception using
            errcode = 'P0001',
            message = 'PRESUPUESTO_NO_EXISTE';
    end if;

    v_financiacion :=
        fn_validar_financiacion(p_presupuesto_id);

    if not v_financiacion then
        v_ok := false;
    end if;

    for r in
        select id
        from componente_presupuestal
        where presupuesto_id = p_presupuesto_id
    loop

        v_distribucion :=
            fn_validar_distribucion(r.id);

        if not v_distribucion then
            v_ok := false;
        end if;

    end loop;

    select coalesce(sum(valor_presupuestado), 0)
      into v_necesidad_total
      from componente_presupuestal
     where presupuesto_id = p_presupuesto_id;

    select coalesce(sum(valor), 0)
      into v_distribucion_total
      from cuota_presupuestal
     where presupuesto_id = p_presupuesto_id;

    if abs(v_necesidad_total - v_distribucion_total) > 0.01 then
        v_ok := false;
    end if;

    v_resultado := jsonb_build_object(
        'valido', v_ok,
        'financiacion_valida', v_financiacion,
        'necesidad_total', v_necesidad_total,
        'distribuido_total', v_distribucion_total
    );

    return v_resultado;
end;
$$;
```

---

# 15. Función — aprobar presupuesto

```sql
create or replace function fn_aprobar_presupuesto(
    p_presupuesto_id uuid,
    p_usuario_id uuid,
    p_referencia_acta text
)
returns void
language plpgsql
as $$
declare
    v_estado presupuesto_estado;
    v_validacion jsonb;
begin

    select estado
      into v_estado
      from presupuesto
     where id = p_presupuesto_id
     for update;

    if not found then
        raise exception using
            errcode = 'P0001',
            message = 'PRESUPUESTO_NO_EXISTE';
    end if;

    if v_estado <> 'PRESENTADO' then
        raise exception using
            errcode = 'P0001',
            message = 'ESTADO_NO_PERMITE_APROBACION';
    end if;

    v_validacion :=
        fn_validar_presupuesto(p_presupuesto_id);

    if coalesce((v_validacion ->> 'valido')::boolean, false) = false then
        raise exception using
            errcode = 'P0001',
            message = 'PRESUPUESTO_NO_VALIDO';
    end if;

    update presupuesto
       set estado = 'APROBADO',
           fecha_aprobacion = now(),
           updated_at = now()
     where id = p_presupuesto_id;

end;
$$;
```

La referencia del acta debe almacenarse posteriormente en una entidad formal de aprobación; en esta primera implementación queda como parámetro de dominio.

---

# 16. Función — nueva versión

```sql
create or replace function fn_crear_nueva_version_presupuesto(
    p_presupuesto_id uuid
)
returns uuid
language plpgsql
as $$
declare
    v_nueva_id uuid;
    v_vigencia_id uuid;
    v_version integer;
    v_estado presupuesto_estado;
begin

    select
        vigencia_id,
        numero_version,
        estado
    into
        v_vigencia_id,
        v_version,
        v_estado
    from presupuesto
    where id = p_presupuesto_id;

    if not found then
        raise exception using
            errcode = 'P0001',
            message = 'PRESUPUESTO_NO_EXISTE';
    end if;

    if v_estado not in ('APROBADO', 'VIGENTE', 'CERRADO') then
        raise exception using
            errcode = 'P0001',
            message = 'VERSION_SOLO_DESDE_PRESUPUESTO_CERRADO_O_APROBADO';
    end if;

    insert into presupuesto (
        vigencia_id,
        numero_version,
        estado,
        version_anterior_id
    )
    values (
        v_vigencia_id,
        v_version + 1,
        'BORRADOR',
        p_presupuesto_id
    )
    returning id into v_nueva_id;

    return v_nueva_id;
end;
$$;
```

La copia profunda de componentes, reglas, fuentes y configuraciones debe realizarse mediante una función de clonación controlada en el momento de crear la nueva versión.

---

# 17. Función — procesar presupuesto

```sql
create or replace function fn_procesar_presupuesto(
    p_presupuesto_id uuid
)
returns jsonb
language plpgsql
as $$
declare
    r record;
    v_validacion jsonb;
begin

    perform fn_validar_presupuesto_editable(
        p_presupuesto_id
    );

    for r in
        select id
        from componente_presupuestal
        where presupuesto_id = p_presupuesto_id
        order by codigo
    loop

        -- En esta primera versión,
        -- los valores de los componentes se consideran
        -- previamente calculados/configurados.

        perform fn_calcular_distribucion(r.id);

    end loop;

    perform fn_calcular_cuotas(
        p_presupuesto_id
    );

    v_validacion :=
        fn_validar_presupuesto(
            p_presupuesto_id
        );

    return v_validacion;
end;
$$;
```

Esta función constituye el orquestador inicial.

Los métodos automáticos de cálculo de componentes serán incorporados sin modificar la interfaz del orquestador.

---

# 18. Prueba 1 — Distribución simple por coeficiente

## Datos

```text
Necesidad:
$100.000.000

Unidad A:
1,25 %

Unidad B:
2,50 %

Unidad C:
96,25 %
```

### Resultado esperado

```text
A = $1.250.000
B = $2.500.000
C = $96.250.000

TOTAL = $100.000.000
```

Validación:

\[
1.25+2.50+96.25=100\%
\]

y:

\[
1.250.000+2.500.000+96.250.000=100.000.000
\]

---

# 19. Prueba 2 — Distribución por módulo

## Datos

```text
Necesidad sector:
$50.000.000

Unidad A:
10 %

Unidad B:
20 %

Unidad C:
70 %
```

### Resultado

```text
A = $5.000.000
B = $10.000.000
C = $35.000.000

TOTAL = $50.000.000
```

---

# 20. Prueba 3 — Residual por redondeo

## Datos

```text
Necesidad:
$100,00

Participaciones:
33,333333 %
33,333333 %
33,333334 %
```

Valores matemáticos:

```text
$33,333333
$33,333333
$33,333334
```

Redondeados:

```text
$33,33
$33,33
$33,33
```

Total:

```text
$99,99
```

Residual:

```text
$0,01
```

El motor debe asignar:

```text
$33,34
$33,33
$33,33
```

Total:

```text
$100,00
```

---

# 21. Prueba 4 — Déficit de financiación

## Datos

```text
Necesidad:
$100.000.000

Fuente A:
$60.000.000

Fuente B:
$30.000.000
```

Resultado:

\[
DF=100M-90M
\]

\[
DF=10M
\]

Estado esperado:

```text
DEFICIT
```

El motor no debe aprobar el presupuesto.

---

# 22. Prueba 5 — Financiación equilibrada

```text
Necesidad:
$100.000.000

Cuota ordinaria:
$80.000.000

Otros ingresos:
$20.000.000
```

Resultado:

```text
Financiación = $100.000.000
Déficit = $0
```

Estado esperado:

```text
EQUILIBRADO
```

---

# 23. Prueba 6 — Fuente insuficiente

Intentar aplicar:

```text
Fuente disponible:
$10.000.000

Aplicación:
$12.000.000
```

Resultado esperado:

```text
FUENTE_INSUFICIENTE
```

La transacción debe fallar.

---

# 24. Prueba 7 — Presupuesto aprobado

Intentar modificar un presupuesto:

```text
estado = APROBADO
```

Resultado esperado:

```text
PRESUPUESTO_NO_EDITABLE
```

La modificación debe rechazarse.

---

# 25. Prueba 8 — Nueva versión

Datos:

```text
Presupuesto:
v1
Estado:
APROBADO
```

Ejecutar:

```sql
select fn_crear_nueva_version_presupuesto(
    'ID-V1'
);
```

Resultado esperado:

```text
v2
Estado:
BORRADOR

version_anterior_id:
v1
```

La v1 permanece intacta.

---

# 26. Prueba 9 — Conservación

Para cada componente:

\[
\boxed{
Necesidad =
Distribución
}
\]

La prueba debe fallar si:

```text
Necesidad = $100.000
Distribución = $99.990
```

aunque la diferencia sea pequeña.

La tolerancia permitida debe utilizarse únicamente para diferencias de redondeo dentro del límite definido.

---

# 27. Prueba 10 — Unidad fuera del universo

Componente:

```text
Mantenimiento sector comercial
```

Universo:

```text
Locales comerciales
```

Una unidad residencial no debe aparecer en:

```text
distribucion_presupuestal
```

Resultado esperado:

```text
UNIDAD_NO_ELEGIBLE
```

---

# 28. Prueba 11 — Coeficiente inexistente

Una unidad incluida en el universo no tiene coeficiente para la vigencia.

Resultado esperado:

```text
COEFICIENTE_NO_ENCONTRADO
```

No se debe utilizar el coeficiente de otra vigencia.

---

# 29. Prueba 12 — Módulo inexistente

Una unidad incluida en un componente sectorial no tiene módulo vigente.

Resultado esperado:

```text
MODULO_NO_ENCONTRADO
```

No se debe sustituir automáticamente por el coeficiente general.

---

# 30. Prueba 13 — Idempotencia

Ejecutar dos veces:

```sql
select fn_procesar_presupuesto('ID');
select fn_procesar_presupuesto('ID');
```

Resultado esperado:

```text
Mismo número de distribuciones
Mismo número de cuotas
Mismos valores
Sin duplicados
```

---

# 31. Matriz de pruebas mínima

| ID | Prueba | Resultado esperado |
|---|---|---|
| T01 | Coeficiente | Conserva 100 % |
| T02 | Módulo | Conserva 100 % |
| T03 | Residual | Total exacto |
| T04 | Déficit | Rechazo |
| T05 | Equilibrio | Aceptación |
| T06 | Fuente insuficiente | Rechazo |
| T07 | Presupuesto aprobado | Bloqueo |
| T08 | Nueva versión | v+1 |
| T09 | Conservación | Igualdad |
| T10 | Unidad excluida | Rechazo |
| T11 | Coeficiente inexistente | Rechazo |
| T12 | Módulo inexistente | Rechazo |
| T13 | Idempotencia | Sin duplicados |

---

# 32. Resultado del E-13

Con E-13 queda definida la primera implementación ejecutable del núcleo matemático:

```text
DATOS
  ↓
FUNCIONES
  ↓
CÁLCULO
  ↓
DISTRIBUCIÓN
  ↓
CONSERVACIÓN
  ↓
CUOTAS
  ↓
VALIDACIÓN
  ↓
APROBACIÓN
```

El código debe considerarse **base de implementación**, no migración productiva definitiva.

Antes de producción deberá adaptarse a:

- nombres reales de tablas maestras de AQUILA;
- `tenant_id`;
- RLS;
- usuarios y roles;
- manejo formal de actas;
- auditoría;
- catálogo definitivo de parámetros;
- pruebas automatizadas.

---

# 33. PRERREQUISITOS

### PRERREQUISITO 13.1
E-11 — Esquema PostgreSQL.

### PRERREQUISITO 13.2
E-12 — Funciones y procedimientos definidos.

### PRERREQUISITO 13.3
Modelo real de copropiedades.

### PRERREQUISITO 13.4
Modelo real de unidades privadas.

### PRERREQUISITO 13.5
Modelo de autenticación/autorización.

### PRERREQUISITO 13.6
Configuración real de tenant/coproprietad.

---

# 34. Criterio de cierre

E-13 se considera cerrado cuando las pruebas T01–T13 puedan ejecutarse sobre una base de prueba y produzcan los resultados definidos.

El siguiente paso técnico, si se continúa, no debe volver a diseñar el motor.

Debe ser:

> **E-14 — Integración del Motor Presupuestal con Supabase: RLS, Edge Functions/API y flujo de aplicación.**

Ese entregable conectará el motor de base de datos con la arquitectura real de AQUILA_SAAS.
