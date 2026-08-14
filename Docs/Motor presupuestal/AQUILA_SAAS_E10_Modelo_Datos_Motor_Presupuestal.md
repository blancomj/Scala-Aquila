# AQUILA_SAAS — E-10
## Diseño técnico del Modelo de Datos del Motor Presupuestal

**Proyecto:** AQUILA_SAAS  
**Ámbito:** Administración de propiedad horizontal en Colombia  
**Etapa:** Diseño técnico / Implementación  
**Versión:** 1.0  
**Fecha:** 14 de agosto de 2026

---

# 1. Objetivo

Transformar el modelo conceptual consolidado en una estructura de datos implementable para el Motor Presupuestal de AQUILA_SAAS.

Este entregable define:

- entidades;
- relaciones;
- responsabilidades;
- datos obligatorios;
- estados;
- trazabilidad;
- restricciones de integridad;
- y límites entre el Motor Presupuestal y los demás módulos.

No define todavía código SQL ni endpoints.

---

# 2. Alcance

E-10 cubre exclusivamente la persistencia de:

```text
Vigencia
   ↓
Presupuesto
   ↓
Componentes
   ↓
Cálculos
   ↓
Fuentes de financiación
   ↓
Reglas de distribución
   ↓
Distribución
   ↓
Cuota presupuestal
```

No incluye tablas de:

- cartera;
- facturación;
- liquidación de intereses;
- pagos;
- recaudo;
- contabilidad.

---

# 3. Principio de diseño

El modelo debe conservar la separación establecida en E-09:

```text
PRESUPUESTAR
     ↓
FINANCIAR
     ↓
DISTRIBUIR
     ↓
LIQUIDAR
```

Por tanto:

> **La cuota presupuestal no es una obligación de cobro.**

La cuota presupuestal es el resultado del Motor Presupuestal y constituye un insumo del Motor de Liquidación.

---

# 4. Modelo de entidades

La estructura lógica principal será:

```text
COPROPIEDAD
    │
    ├── VIGENCIA_PRESUPUESTAL
    │       │
    │       └── PRESUPUESTO
    │              │
    │              ├── COMPONENTE_PRESUPUESTAL
    │              │       │
    │              │       ├── CALCULO
    │              │       ├── FINANCIACION
    │              │       └── DISTRIBUCION
    │              │
    │              └── VERSIONES
    │
    ├── UNIDADES_PRIVADAS
    │       ├── COEFICIENTES
    │       └── MODULOS
    │
    └── SECTORES
            └── MODULOS
```

---

# 5. Entidad: VIGENCIA_PRESUPUESTAL

Representa el período para el cual se construye el presupuesto.

### Campos mínimos

```text
id
copropiedad_id
anio
fecha_inicio
fecha_fin
estado
created_at
updated_at
```

### Estados

```text
BORRADOR
EN_PREPARACION
PROPUESTO
PRESENTADO
APROBADO
VIGENTE
CERRADO
ANULADO
```

### Restricción

Una copropiedad no debe tener dos vigencias presupuestales activas para el mismo año.

---

# 6. Entidad: PRESUPUESTO

Representa una versión del presupuesto correspondiente a una vigencia.

### Campos mínimos

```text
id
vigencia_id
numero_version
estado
fecha_generacion
fecha_aprobacion
total_gastos
total_ingresos
total_fondo_imprevistos
total_necesidad_financiera
total_distribuido
created_at
updated_at
```

### Regla

Un presupuesto aprobado debe conservarse como versión histórica.

No se debe modificar destructivamente.

Una modificación posterior genera una nueva versión.

---

# 7. Entidad: COMPONENTE_PRESUPUESTAL

Es la unidad mínima de negocio del Motor Presupuestal.

### Campos mínimos

```text
id
presupuesto_id
codigo
nombre
descripcion
naturaleza
clasificacion_juridica
ambito
metodo_calculo
periodicidad
valor_base
valor_presupuestado
estado
fundamento_normativo_id
created_at
updated_at
```

### Naturaleza

```text
GASTO
INGRESO
```

### Ámbito

```text
GENERAL
SECTOR
SUBSECTOR
UNIDAD
```

### Regla

Cada componente debe tener una única definición de tratamiento para la versión del presupuesto.

---

# 8. Entidad: CALCULO_PRESUPUESTAL

Conserva cómo se obtuvo el valor del componente.

### Campos mínimos

```text
id
componente_id
metodo
fuente_tipo
valor_base
parametros
formula
ajustes
valor_resultado
precision
redondeo
observacion
created_by
created_at
```

### Métodos

```text
VALOR_FIJO
CONTRATO
CANTIDAD_X_TARIFA
HISTORICO
PROYECCION
COTIZACION
FORMULA
PARAMETRIZADO
MANUAL
```

### Regla fundamental

El valor de un componente calculado debe poder reconstruirse utilizando esta información.

---

# 9. Entidad: FUENTE_PRESUPUESTAL

Representa el origen de un valor utilizado para construir el presupuesto.

### Tipos iniciales

```text
HISTORICO
CONTRATO
COTIZACION
PARAMETRO
DOCUMENTO
OTRO
```

### Campos mínimos

```text
id
copropiedad_id
tipo
codigo
descripcion
fecha
vigencia
valor
documento_referencia
metadata
created_at
```

La fuente no debe confundirse con la financiación.

Ejemplo:

```text
Fuente:
Contrato de vigilancia 2027

Financiación:
Cuota ordinaria
```

Son conceptos diferentes.

---

# 10. Entidad: FUENTE_FINANCIACION

Representa los recursos que financian la necesidad presupuestal.

### Tipos

```text
CUOTA_ORDINARIA
CUOTA_EXTRAORDINARIA
OTROS_INGRESOS
FONDO_IMPREVISTOS
SALDO_APLICABLE
```

### Campos mínimos

```text
id
presupuesto_id
tipo
ambito
destinacion
valor_disponible
valor_aplicado
fundamento_normativo_id
created_at
```

### Regla

El valor aplicado nunca puede superar el valor disponible.

---

# 11. Entidad: COMPONENTE_FINANCIACION

Relaciona un componente con las fuentes que lo financian.

### Campos

```text
id
componente_id
fuente_financiacion_id
valor_aplicado
created_at
```

### Restricción

Para cada componente:

\[
\sum FuentesAplicadas = NecesidadFinanciera
\]

salvo que el componente se encuentre explícitamente en estado de déficit durante la fase de preparación.

Un presupuesto aprobado no puede contener déficit no resuelto.

---

# 12. Entidad: SECTOR

Representa una división funcional de la copropiedad.

### Campos

```text
id
copropiedad_id
codigo
nombre
descripcion
estado
created_at
```

Ejemplos:

```text
RESIDENCIAL
COMERCIAL
TORRE_A
TORRE_B
```

El modelo no debe asumir qué sectores existen; deben derivarse de la configuración de la copropiedad y su reglamento.

---

# 13. Entidad: UNIDAD_PRIVADA

Representa la unidad que puede participar en la distribución.

### Campos mínimos

```text
id
copropiedad_id
codigo
tipo
nombre
sector_id
estado
```

La información detallada de propietarios y obligaciones pertenece al modelo de propiedad y liquidación, no al núcleo presupuestal.

---

# 14. Entidad: COEFICIENTE_COPROPIEDAD

Conserva el coeficiente aplicable a una unidad para una vigencia determinada.

### Campos

```text
id
unidad_privada_id
vigencia_id
valor
fecha_inicio
fecha_fin
fundamento_normativo_id
```

### Regla

No debe almacenarse el coeficiente únicamente en la unidad.

Debe existir versionamiento por vigencia porque el Motor Presupuestal necesita saber **qué coeficiente estaba vigente cuando se calculó el presupuesto**.

---

# 15. Entidad: MODULO_CONTRIBUCION

Representa el módulo aplicable a una unidad dentro de un sector o ámbito determinado.

### Campos

```text
id
sector_id
unidad_privada_id
vigencia_id
valor
fecha_inicio
fecha_fin
fundamento_normativo_id
```

### Regla

El módulo debe conservar su vigencia y fundamento.

No debe sobrescribirse un valor histórico utilizado por un presupuesto aprobado.

---

# 16. Entidad: REGLA_DISTRIBUCION

Define cómo se distribuye un componente.

### Tipos

```text
COEFICIENTE
MODULO_CONTRIBUCION
REGLA_ESPECIFICA
```

### Campos

```text
id
componente_id
tipo
sector_id
configuracion
fundamento_normativo_id
created_at
```

### Regla

Una regla específica debe conservar obligatoriamente su fundamento.

---

# 17. Entidad: UNIVERSO_DISTRIBUCION

Define las unidades beneficiarias de un componente.

### Campos

```text
id
componente_id
unidad_privada_id
participacion
created_at
```

### Regla

No todos los componentes deben tener necesariamente todas las unidades.

La suma de las participaciones aplicables debe satisfacer:

\[
\sum_{u\in U_k}P_{u,k}=1
\]

cuando el componente sea distribuible proporcionalmente.

---

# 18. Entidad: DISTRIBUCION_PRESUPUESTAL

Conserva el resultado del cálculo individual por componente.

### Campos

```text
id
componente_id
unidad_privada_id
regla_distribucion_id
participacion
valor_calculado
valor_redondeado
diferencia_residual
periodo
created_at
```

### Fórmula

\[
C_{u,k}=NF_k\times P_{u,k}
\]

Esta tabla debe conservar el resultado generado para que el cálculo aprobado pueda auditarse posteriormente.

---

# 19. Entidad: CUOTA_PRESUPUESTAL

Consolida la participación de una unidad.

### Campos mínimos

```text
id
presupuesto_id
unidad_privada_id
periodo
valor
estado
created_at
```

### Fórmula anual

\[
QP_u=\sum_k C_{u,k}
\]

### Regla

La cuota presupuestal es un resultado del presupuesto.

No crea por sí misma una obligación de cobro.

---

# 20. Entidad: FUNDAMENTO_NORMATIVO

Conserva la referencia jurídica de las reglas utilizadas por el motor.

### Campos

```text
id
tipo
norma
articulo
descripcion
fecha_vigencia
referencia
created_at
```

### Tipos

```text
LEY
DECRETO
REGLAMENTO_PH
DECISION_ASAMBLEA
OTRA
```

### Regla

Cuando una regla tenga fundamento jurídico, este debe quedar asociado directamente a la configuración que utiliza el motor.

---

# 21. Relaciones principales

```text
COPROPIEDAD
    1 ─── N VIGENCIA_PRESUPUESTAL

VIGENCIA
    1 ─── N PRESUPUESTO

PRESUPUESTO
    1 ─── N COMPONENTE

COMPONENTE
    1 ─── N CALCULO

COMPONENTE
    1 ─── N COMPONENTE_FINANCIACION

FUENTE_FINANCIACION
    1 ─── N COMPONENTE_FINANCIACION

COMPONENTE
    1 ─── N REGLA_DISTRIBUCION

COMPONENTE
    1 ─── N UNIVERSO_DISTRIBUCION

COMPONENTE
    1 ─── N DISTRIBUCION_PRESUPUESTAL

UNIDAD
    1 ─── N DISTRIBUCION_PRESUPUESTAL

PRESUPUESTO
    1 ─── N CUOTA_PRESUPUESTAL

UNIDAD
    1 ─── N CUOTA_PRESUPUESTAL
```

---

# 22. Restricciones críticas

## DB-001 — Aislamiento por copropiedad

Toda entidad presupuestal debe poder determinar inequívocamente a qué copropiedad pertenece.

## DB-002 — Vigencia

No debe existir un cálculo sin vigencia.

## DB-003 — Presupuesto

No debe existir un componente sin presupuesto.

## DB-004 — Versionamiento

Un presupuesto aprobado no se modifica destructivamente.

## DB-005 — Coeficientes

El cálculo debe utilizar el coeficiente correspondiente a la vigencia.

## DB-006 — Módulos

El cálculo debe utilizar el módulo correspondiente a la vigencia.

## DB-007 — Distribución

La suma distribuida debe conservar la necesidad financiera.

## DB-008 — Financiación

La suma de fuentes aplicadas debe conservar la necesidad financiera.

## DB-009 — Trazabilidad

Toda cifra calculada debe conservar su origen.

## DB-010 — Fundamento

Las reglas jurídicas deben conservar su fundamento.

---

# 23. Inmutabilidad de presupuestos aprobados

Una vez que un presupuesto pasa a:

```text
APROBADO
```

o:

```text
VIGENTE
```

no debe permitirse modificar directamente:

- componentes;
- valores;
- fuentes;
- coeficientes utilizados;
- módulos utilizados;
- reglas;
- distribución;
- cuotas.

Una modificación deberá generar:

```text
NUEVA VERSION
```

con referencia a la versión anterior.

---

# 24. Snapshot de datos jurídicos

Este punto es crítico.

El presupuesto aprobado debe conservar una **instantánea lógica** de los datos que intervinieron en su cálculo.

Por ejemplo:

```text
Coeficiente vigente al calcular:
1,2500 %

Coeficiente actual:
1,3000 %
```

El presupuesto histórico debe continuar mostrando:

```text
1,2500 %
```

No debe recalcularse retroactivamente porque cambió la configuración actual.

La misma regla aplica a:

- módulos;
- reglas de distribución;
- parámetros;
- fuentes;
- fundamentos;
- fórmulas.

---

# 25. Auditoría

Las operaciones críticas deben registrar:

```text
created_by
created_at
updated_by
updated_at
```

Y para modificaciones relevantes:

```text
valor_anterior
valor_nuevo
motivo
usuario
fecha
```

Para una ejecución matemática:

```text
datos utilizados
parámetros
fórmula
resultado
redondeo
resultado final
```

---

# 26. Separación con Motor de Liquidación

El modelo debe terminar en:

```text
CUOTA_PRESUPUESTAL
```

El Motor de Liquidación recibirá posteriormente:

```text
unidad
período
concepto
valor presupuestado
regla aplicable
```

y será responsable de transformar esa información en obligaciones concretas.

Por tanto:

```text
Motor Presupuestal
        ↓
Cuota Presupuestal
        ↓
Motor de Liquidación
        ↓
Obligación
```

---

# 27. PRERREQUISITOS

### PRERREQUISITO 10.1
Modelo de copropiedades.

### PRERREQUISITO 10.2
Modelo de unidades privadas.

### PRERREQUISITO 10.3
Configuración del reglamento PH.

### PRERREQUISITO 10.4
Coeficientes y módulos versionados.

### PRERREQUISITO 10.5
Catálogo de sectores.

### PRERREQUISITO 10.6
Catálogo de fundamentos normativos.

### PRERREQUISITO 10.7
Motor de cálculo definido en E-06.

### PRERREQUISITO 10.8
Motor de financiación definido en E-07.

### PRERREQUISITO 10.9
Motor de distribución definido en E-08.

---

# 28. Decisiones técnicas cerradas

### DT-001
El presupuesto se versiona.

### DT-002
Los cálculos son trazables.

### DT-003
Coeficientes y módulos se versionan por vigencia.

### DT-004
Las reglas de distribución tienen fundamento.

### DT-005
Las fuentes de datos se separan de las fuentes de financiación.

### DT-006
La distribución se conserva por componente y unidad.

### DT-007
La cuota presupuestal se conserva como resultado independiente.

### DT-008
Los presupuestos aprobados son inmutables.

### DT-009
Los cambios posteriores generan una nueva versión.

### DT-010
El Motor Presupuestal no crea obligaciones de cobro.

---

# 29. Resultado del E-10

El modelo de datos queda conceptualmente definido así:

```text
COPROPIEDAD
    ↓
VIGENCIA
    ↓
PRESUPUESTO
    ↓
COMPONENTES
 ┌──┼───────────────┐
 ↓  ↓               ↓
CÁLCULO FINANCIACIÓN DISTRIBUCIÓN
                    ↓
              UNIDAD PRIVADA
                    ↓
            CUOTA PRESUPUESTAL
```

Este diseño constituye la base para el siguiente paso técnico:

> **Implementar el esquema físico en PostgreSQL/Supabase y sus restricciones de integridad.**

No se crea otro entregable conceptual intermedio.

---

# 30. Criterio de cierre

E-10 queda cerrado cuando el equipo pueda implementar el esquema de datos sin tener que tomar decisiones de negocio fundamentales que no estén definidas en E-05 a E-09.

Las decisiones de implementación física —nombres definitivos de tablas, tipos PostgreSQL, UUID, índices, constraints, RLS, triggers y funciones— pertenecen al siguiente paso técnico.
