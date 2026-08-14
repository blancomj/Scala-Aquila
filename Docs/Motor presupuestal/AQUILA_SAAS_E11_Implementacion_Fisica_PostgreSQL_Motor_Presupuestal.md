# AQUILA_SAAS — E-11
## Implementación física PostgreSQL del Motor Presupuestal

**Proyecto:** AQUILA_SAAS  
**Ámbito:** Administración de propiedad horizontal en Colombia  
**Etapa:** Implementación técnica  
**Versión:** 1.0  
**Fecha:** 14 de agosto de 2026

---

# 1. Objetivo

Implementar físicamente en PostgreSQL la estructura definida en E-10 para el Motor Presupuestal.

Este entregable define:

- tipos enumerados;
- tablas;
- claves primarias;
- claves foráneas;
- restricciones;
- índices;
- relaciones;
- reglas de integridad;
- versionamiento;
- y criterios para RLS.

No define todavía:

- interfaz de usuario;
- endpoints REST;
- Edge Functions;
- políticas RLS completas;
- motor de fórmulas dinámicas.

---

# 2. Principio de implementación

La estructura física debe preservar la separación:

```text
VIGENCIA
   ↓
PRESUPUESTO
   ↓
COMPONENTE
   ├── CÁLCULO
   ├── FINANCIACIÓN
   └── DISTRIBUCIÓN
          ↓
        UNIDAD
          ↓
   CUOTA PRESUPUESTAL
```

El diseño debe evitar almacenar resultados derivados como si fueran datos maestros.

---

# 3. Convenciones

## Identificadores

Se recomienda:

```text
UUID
```

como PK.

## Nombres

Se utilizará `snake_case`.

## Auditoría

Las tablas principales tendrán:

```text
created_at
updated_at
created_by
updated_by
```

cuando corresponda.

## Montos

Para valores monetarios:

```sql
numeric(18,2)
```

Para porcentajes y participaciones:

```sql
numeric(12,8)
```

Esto evita perder precisión durante la distribución.

---

# 4. Extensiones

```sql
create extension if not exists pgcrypto;
```

La generación de UUID se realizará mediante:

```sql
gen_random_uuid()
```

---

# 5. Tipos enumerados

```sql
create type presupuesto_estado as enum (
    'BORRADOR',
    'EN_PREPARACION',
    'PROPUESTO',
    'PRESENTADO',
    'APROBADO',
    'VIGENTE',
    'CERRADO',
    'ANULADO'
);

create type componente_naturaleza as enum (
    'GASTO',
    'INGRESO'
);

create type componente_ambito as enum (
    'GENERAL',
    'SECTOR',
    'SUBSECTOR',
    'UNIDAD'
);

create type metodo_calculo as enum (
    'VALOR_FIJO',
    'CONTRATO',
    'CANTIDAD_X_TARIFA',
    'HISTORICO',
    'PROYECCION',
    'COTIZACION',
    'FORMULA',
    'PARAMETRIZADO',
    'MANUAL'
);

create type fuente_presupuestal_tipo as enum (
    'HISTORICO',
    'CONTRATO',
    'COTIZACION',
    'PARAMETRO',
    'DOCUMENTO',
    'OTRO'
);

create type fuente_financiacion_tipo as enum (
    'CUOTA_ORDINARIA',
    'CUOTA_EXTRAORDINARIA',
    'OTROS_INGRESOS',
    'FONDO_IMPREVISTOS',
    'SALDO_APLICABLE'
);

create type regla_distribucion_tipo as enum (
    'COEFICIENTE',
    'MODULO_CONTRIBUCION',
    'REGLA_ESPECIFICA'
);

create type fundamento_tipo as enum (
    'LEY',
    'DECRETO',
    'REGLAMENTO_PH',
    'DECISION_ASAMBLEA',
    'OTRA'
);
```

---

# 6. Tabla: vigencia_presupuestal

```sql
create table vigencia_presupuestal (
    id uuid primary key default gen_random_uuid(),

    copropiedad_id uuid not null,

    anio smallint not null,
    fecha_inicio date not null,
    fecha_fin date not null,

    estado presupuesto_estado not null default 'BORRADOR',

    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),

    constraint ck_vigencia_fechas
        check (fecha_fin >= fecha_inicio),

    constraint uq_vigencia_copropiedad_anio
        unique (copropiedad_id, anio)
);
```

`copropiedad_id` deberá referenciar posteriormente la tabla maestra de copropiedades del sistema AQUILA.

---

# 7. Tabla: presupuesto

```sql
create table presupuesto (
    id uuid primary key default gen_random_uuid(),

    vigencia_id uuid not null
        references vigencia_presupuestal(id),

    numero_version integer not null default 1,

    estado presupuesto_estado not null default 'BORRADOR',

    fecha_generacion timestamptz not null default now(),
    fecha_aprobacion timestamptz,

    total_gastos numeric(18,2) not null default 0,
    total_ingresos numeric(18,2) not null default 0,
    total_fondo_imprevistos numeric(18,2) not null default 0,
    total_necesidad_financiera numeric(18,2) not null default 0,
    total_distribuido numeric(18,2) not null default 0,

    version_anterior_id uuid
        references presupuesto(id),

    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),

    constraint ck_presupuesto_version
        check (numero_version > 0),

    constraint uq_presupuesto_version
        unique (vigencia_id, numero_version)
);
```

---

# 8. Tabla: fundamento_normativo

```sql
create table fundamento_normativo (
    id uuid primary key default gen_random_uuid(),

    tipo fundamento_tipo not null,

    norma varchar(150) not null,
    articulo varchar(100),
    descripcion text,

    fecha_vigencia date,
    referencia text,

    created_at timestamptz not null default now()
);
```

El fundamento se almacena como dato reutilizable y versionable.

---

# 9. Tabla: fuente_presupuestal

```sql
create table fuente_presupuestal (
    id uuid primary key default gen_random_uuid(),

    copropiedad_id uuid not null,

    tipo fuente_presupuestal_tipo not null,

    codigo varchar(50) not null,
    descripcion text,

    fecha date,
    vigencia smallint,

    valor numeric(18,2) not null default 0,

    documento_referencia text,
    metadata jsonb not null default '{}'::jsonb,

    created_at timestamptz not null default now(),

    constraint ck_fuente_presupuestal_valor
        check (valor >= 0),

    constraint uq_fuente_presupuestal_codigo
        unique (copropiedad_id, codigo)
);
```

`metadata` permite conservar información adicional sin convertir cada particularidad documental en una columna estructural.

---

# 10. Tabla: componente_presupuestal

```sql
create table componente_presupuestal (
    id uuid primary key default gen_random_uuid(),

    presupuesto_id uuid not null
        references presupuesto(id),

    codigo varchar(50) not null,
    nombre varchar(200) not null,
    descripcion text,

    naturaleza componente_naturaleza not null,
    clasificacion_juridica varchar(100),

    ambito componente_ambito not null default 'GENERAL',

    metodo_calculo metodo_calculo not null,

    periodicidad varchar(30),

    valor_base numeric(18,2) not null default 0,
    valor_presupuestado numeric(18,2) not null default 0,

    estado varchar(30) not null default 'ACTIVO',

    fundamento_normativo_id uuid
        references fundamento_normativo(id),

    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),

    constraint ck_componente_valor_base
        check (valor_base >= 0),

    constraint ck_componente_valor_presupuestado
        check (valor_presupuestado >= 0),

    constraint uq_componente_codigo
        unique (presupuesto_id, codigo)
);
```

---

# 11. Tabla: calculo_presupuestal

```sql
create table calculo_presupuestal (
    id uuid primary key default gen_random_uuid(),

    componente_id uuid not null
        references componente_presupuestal(id),

    metodo metodo_calculo not null,

    fuente_tipo varchar(50),

    valor_base numeric(18,8) not null default 0,

    parametros jsonb not null default '{}'::jsonb,

    formula text,
    ajustes jsonb not null default '{}'::jsonb,

    valor_resultado numeric(18,8) not null default 0,

    precision_calculo smallint not null default 8,
    redondeo smallint not null default 2,

    observacion text,

    created_by uuid,
    created_at timestamptz not null default now(),

    constraint ck_calculo_precision
        check (precision_calculo between 0 and 18),

    constraint ck_calculo_redondeo
        check (redondeo between 0 and 8)
);
```

La fórmula se conserva como información de trazabilidad.

No se debe ejecutar directamente como SQL dinámico sin pasar por un evaluador seguro.

---

# 12. Tabla: fuente_financiacion

```sql
create table fuente_financiacion (
    id uuid primary key default gen_random_uuid(),

    presupuesto_id uuid not null
        references presupuesto(id),

    tipo fuente_financiacion_tipo not null,

    ambito componente_ambito not null default 'GENERAL',

    destinacion varchar(150),

    valor_disponible numeric(18,2) not null default 0,
    valor_aplicado numeric(18,2) not null default 0,

    fundamento_normativo_id uuid
        references fundamento_normativo(id),

    created_at timestamptz not null default now(),

    constraint ck_fuente_financiacion_disponible
        check (valor_disponible >= 0),

    constraint ck_fuente_financiacion_aplicado
        check (valor_aplicado >= 0),

    constraint ck_fuente_financiacion_no_excede
        check (valor_aplicado <= valor_disponible)
);
```

---

# 13. Tabla: componente_financiacion

```sql
create table componente_financiacion (
    id uuid primary key default gen_random_uuid(),

    componente_id uuid not null
        references componente_presupuestal(id),

    fuente_financiacion_id uuid not null
        references fuente_financiacion(id),

    valor_aplicado numeric(18,2) not null default 0,

    created_at timestamptz not null default now(),

    constraint ck_componente_financiacion_valor
        check (valor_aplicado >= 0),

    constraint uq_componente_fuente
        unique (componente_id, fuente_financiacion_id)
);
```

La igualdad:

\[
\sum FuentesAplicadas = NecesidadFinanciera
\]

será validada por una función transaccional del motor, no mediante un `CHECK`, porque involucra múltiples filas.

---

# 14. Tabla: sector

```sql
create table sector (
    id uuid primary key default gen_random_uuid(),

    copropiedad_id uuid not null,

    codigo varchar(50) not null,
    nombre varchar(150) not null,
    descripcion text,

    estado boolean not null default true,

    created_at timestamptz not null default now(),

    constraint uq_sector_codigo
        unique (copropiedad_id, codigo)
);
```

---

# 15. Tabla: unidad_privada

La tabla real de unidades puede existir ya en AQUILA.

Para el Motor Presupuestal se requiere como mínimo una referencia:

```sql
-- Referencia lógica:
unidad_privada_id uuid not null
```

No se debe duplicar innecesariamente el maestro de unidades.

Si la tabla maestra ya existe, las FK deberán apuntar a ella.

---

# 16. Tabla: coeficiente_copropiedad

```sql
create table coeficiente_copropiedad (
    id uuid primary key default gen_random_uuid(),

    unidad_privada_id uuid not null,
    vigencia_id uuid not null
        references vigencia_presupuestal(id),

    valor numeric(12,8) not null,

    fecha_inicio date not null,
    fecha_fin date,

    fundamento_normativo_id uuid
        references fundamento_normativo(id),

    created_at timestamptz not null default now(),

    constraint ck_coeficiente_valor
        check (valor >= 0 and valor <= 100),

    constraint ck_coeficiente_fechas
        check (fecha_fin is null or fecha_fin >= fecha_inicio),

    constraint uq_coeficiente_unidad_vigencia
        unique (unidad_privada_id, vigencia_id)
);
```

El valor se almacena como porcentaje:

```text
1.25000000
```

y no como:

```text
0.0125
```

La conversión matemática se realizará al momento del cálculo:

\[
1.25\% = 0.0125
\]

---

# 17. Tabla: modulo_contribucion

```sql
create table modulo_contribucion (
    id uuid primary key default gen_random_uuid(),

    sector_id uuid not null
        references sector(id),

    unidad_privada_id uuid not null,

    vigencia_id uuid not null
        references vigencia_presupuestal(id),

    valor numeric(12,8) not null,

    fecha_inicio date not null,
    fecha_fin date,

    fundamento_normativo_id uuid
        references fundamento_normativo(id),

    created_at timestamptz not null default now(),

    constraint ck_modulo_valor
        check (valor >= 0 and valor <= 100),

    constraint ck_modulo_fechas
        check (fecha_fin is null or fecha_fin >= fecha_inicio),

    constraint uq_modulo_unidad_sector_vigencia
        unique (sector_id, unidad_privada_id, vigencia_id)
);
```

---

# 18. Tabla: regla_distribucion

```sql
create table regla_distribucion (
    id uuid primary key default gen_random_uuid(),

    componente_id uuid not null
        references componente_presupuestal(id),

    tipo regla_distribucion_tipo not null,

    sector_id uuid
        references sector(id),

    configuracion jsonb not null default '{}'::jsonb,

    fundamento_normativo_id uuid
        references fundamento_normativo(id),

    created_at timestamptz not null default now(),

    constraint ck_regla_especifica_fundamento
        check (
            tipo <> 'REGLA_ESPECIFICA'
            or fundamento_normativo_id is not null
        )
);
```

---

# 19. Tabla: universo_distribucion

```sql
create table universo_distribucion (
    id uuid primary key default gen_random_uuid(),

    componente_id uuid not null
        references componente_presupuestal(id),

    unidad_privada_id uuid not null,

    participacion numeric(12,8) not null,

    created_at timestamptz not null default now(),

    constraint ck_universo_participacion
        check (participacion >= 0 and participacion <= 100),

    constraint uq_universo_componente_unidad
        unique (componente_id, unidad_privada_id)
);
```

La suma de `participacion` será validada por el motor antes de aprobar el presupuesto.

---

# 20. Tabla: distribucion_presupuestal

```sql
create table distribucion_presupuestal (
    id uuid primary key default gen_random_uuid(),

    componente_id uuid not null
        references componente_presupuestal(id),

    unidad_privada_id uuid not null,

    regla_distribucion_id uuid not null
        references regla_distribucion(id),

    participacion numeric(12,8) not null,

    valor_calculado numeric(18,8) not null default 0,
    valor_redondeado numeric(18,2) not null default 0,

    diferencia_residual numeric(18,2) not null default 0,

    periodo date,

    created_at timestamptz not null default now(),

    constraint ck_distribucion_participacion
        check (participacion >= 0 and participacion <= 100),

    constraint ck_distribucion_valores
        check (valor_calculado >= 0 and valor_redondeado >= 0)
);
```

---

# 21. Tabla: cuota_presupuestal

```sql
create table cuota_presupuestal (
    id uuid primary key default gen_random_uuid(),

    presupuesto_id uuid not null
        references presupuesto(id),

    unidad_privada_id uuid not null,

    periodo date,

    valor numeric(18,2) not null default 0,

    estado varchar(30) not null default 'GENERADA',

    created_at timestamptz not null default now(),

    constraint ck_cuota_valor
        check (valor >= 0),

    constraint uq_cuota_presupuesto_unidad_periodo
        unique (presupuesto_id, unidad_privada_id, periodo)
);
```

---

# 22. Índices principales

```sql
create index idx_presupuesto_vigencia
    on presupuesto(vigencia_id);

create index idx_componente_presupuesto
    on componente_presupuestal(presupuesto_id);

create index idx_calculo_componente
    on calculo_presupuestal(componente_id);

create index idx_financiacion_presupuesto
    on fuente_financiacion(presupuesto_id);

create index idx_componente_financiacion_componente
    on componente_financiacion(componente_id);

create index idx_regla_componente
    on regla_distribucion(componente_id);

create index idx_universo_componente
    on universo_distribucion(componente_id);

create index idx_distribucion_componente
    on distribucion_presupuestal(componente_id);

create index idx_distribucion_unidad
    on distribucion_presupuestal(unidad_privada_id);

create index idx_cuota_presupuesto
    on cuota_presupuestal(presupuesto_id);

create index idx_cuota_unidad
    on cuota_presupuestal(unidad_privada_id);
```

---

# 23. Restricciones que requieren funciones

No deben intentar implementarse mediante `CHECK` las reglas que dependen de múltiples filas.

Se requieren funciones transaccionales para validar:

### V-001

Suma de participaciones:

\[
\sum P_{u,k}=100\%
\]

### V-002

Conservación del componente:

\[
\sum C_{u,k}=NF_k
\]

### V-003

Equilibrio de financiación:

\[
\sum F_{k,j}=NF_k
\]

### V-004

Equilibrio total:

\[
\sum Fuentes=\sum Necesidades
\]

### V-005

No destinación cruzada.

### V-006

Estado del presupuesto antes de aprobación.

Estas validaciones deben ejecutarse dentro de la misma transacción que genera o aprueba el presupuesto.

---

# 24. Inmutabilidad

Una vez que:

```text
presupuesto.estado IN ('APROBADO','VIGENTE','CERRADO')
```

las tablas relacionadas no deben permitir modificaciones directas de los datos que determinan el resultado.

La estrategia recomendada es:

```text
UPDATE bloqueado
        ↓
NUEVA VERSION
        ↓
recalcular
        ↓
validar
        ↓
aprobar
```

Esto debe implementarse mediante funciones de dominio y/o triggers de protección.

---

# 25. Versionamiento

La relación será:

```text
PRESUPUESTO v1
      ↓
PRESUPUESTO v2
      ↓
PRESUPUESTO v3
```

Cada nueva versión conserva:

```text
version_anterior_id
```

Nunca se modifica el histórico para representar el nuevo cálculo.

---

# 26. Snapshot

Aunque coeficientes, módulos y parámetros sean maestros versionados, la ejecución de un presupuesto aprobado debe conservar los valores efectivamente utilizados.

Por tanto, `distribucion_presupuestal.participacion` debe considerarse un **snapshot del valor aplicado al cálculo**, no una referencia dinámica que vuelva a consultar el coeficiente actual.

La misma filosofía aplica a:

```text
valor_calculado
valor_redondeado
regla_distribucion
parametros
```

---

# 27. RLS

La seguridad a nivel de fila deberá respetar el aislamiento multitenant de AQUILA.

Principio:

```text
usuario
   ↓
tenant_id / copropiedad_id
   ↓
registro presupuestal
```

Las tablas presupuestales deberán quedar vinculadas de manera inequívoca con la copropiedad.

### Regla

> Ningún usuario debe poder leer o modificar registros presupuestales pertenecientes a otra copropiedad.

Las políticas RLS concretas se definirán cuando se implemente el modelo de seguridad general de AQUILA, para evitar duplicar o contradecir las políticas maestras.

---

# 28. Transacciones

Las operaciones críticas deben ser transaccionales.

Especialmente:

```text
GENERAR PRESUPUESTO
CALCULAR COMPONENTES
APLICAR FINANCIACIÓN
DISTRIBUIR
VALIDAR
APROBAR
ACTIVAR
```

No debe existir un estado parcialmente generado como resultado de un fallo intermedio.

---

# 29. Funciones de dominio requeridas

El modelo físico requiere posteriormente, como mínimo:

```text
fn_calcular_componente()
fn_calcular_financiacion()
fn_validar_financiacion()
fn_calcular_distribucion()
fn_validar_distribucion()
fn_calcular_cuotas()
fn_validar_presupuesto()
fn_aprobar_presupuesto()
fn_crear_nueva_version_presupuesto()
```

Estas funciones serán objeto del siguiente diseño técnico.

---

# 30. Flujo transaccional

```text
BEGIN
   │
   ├── cargar componentes
   ├── ejecutar cálculos
   ├── calcular financiación
   ├── validar fuentes
   ├── calcular distribución
   ├── validar participaciones
   ├── generar cuotas
   ├── validar conservación
   ├── validar equilibrio
   │
   └── COMMIT
```

Ante cualquier error:

```text
ROLLBACK
```

No debe quedar un presupuesto parcialmente procesado.

---

# 31. PRERREQUISITOS

### PRERREQUISITO 11.1
E-10 — Modelo de Datos del Motor Presupuestal.

### PRERREQUISITO 11.2
Tabla maestra de copropiedades.

### PRERREQUISITO 11.3
Tabla maestra de unidades privadas.

### PRERREQUISITO 11.4
Modelo multitenant de AQUILA.

### PRERREQUISITO 11.5
Modelo de usuarios y autorización.

---

# 32. Decisiones técnicas cerradas

### DT-11.01
PostgreSQL será el motor de persistencia.

### DT-11.02
Las PK utilizarán UUID.

### DT-11.03
Los valores monetarios utilizarán `numeric`, no `float`.

### DT-11.04
Los cálculos internos conservarán mayor precisión que el valor monetario final.

### DT-11.05
Coeficientes y módulos se almacenarán como porcentajes con precisión suficiente.

### DT-11.06
Los presupuestos aprobados serán inmutables.

### DT-11.07
Las modificaciones posteriores crearán nuevas versiones.

### DT-11.08
Las reglas de integridad que involucran múltiples filas serán funciones transaccionales.

### DT-11.09
La distribución conservará el snapshot del valor utilizado.

### DT-11.10
El RLS deberá garantizar aislamiento por copropiedad.

---

# 33. Resultado del E-11

Con este entregable queda definida la **estructura física base de PostgreSQL** para el Motor Presupuestal.

El siguiente paso técnico ya no debe volver a diseñar tablas.

Debe implementar:

```text
E-11
MODELO FÍSICO
    ↓
E-12
FUNCIONES Y PROCEDIMIENTOS DEL MOTOR
    ↓
VALIDACIONES
    ↓
PRUEBAS MATEMÁTICAS
```

---

# 34. Criterio de cierre

E-11 se considera cerrado cuando:

```text
✓ Las tablas están definidas.
✓ Las relaciones están definidas.
✓ Las restricciones básicas están definidas.
✓ Los índices principales están definidos.
✓ El versionamiento está definido.
✓ La inmutabilidad está definida.
✓ El snapshot está definido.
✓ Las validaciones multirregistro están identificadas.
✓ El aislamiento multitenant está contemplado.
```

**No se requiere otro entregable de modelado de datos antes de implementar las funciones del motor.**
