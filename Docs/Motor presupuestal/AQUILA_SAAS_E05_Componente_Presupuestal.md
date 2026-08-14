# AQUILA_SAAS --- E-05

## Estructura y clasificación del Componente Presupuestal

**Proyecto:** AQUILA_SAAS\
**Ámbito:** Administración de propiedad horizontal en Colombia\
**Versión:** 1.0\
**Fecha:** 14 de agosto de 2026

------------------------------------------------------------------------

# 1. Objetivo

Definir la unidad mínima con la que el Motor Presupuestal de AQUILA_SAAS
construirá, financiará y distribuirá el presupuesto.

La unidad será:

> **Componente Presupuestal**

Un componente representa una necesidad presupuestal individualizada y
debe contener toda la información necesaria para determinar:

-   cuánto se presupuesta;
-   qué naturaleza tiene;
-   quién debe financiarlo;
-   mediante qué regla;
-   con qué fuente;
-   durante qué período;
-   y qué fundamento jurídico respalda su tratamiento.

------------------------------------------------------------------------

# 2. Principio fundamental

Un componente no es solamente un concepto contable.

Debe ser una unidad:

**jurídica + presupuestal + financiera + matemática.**

Ejemplo:

``` text
Vigilancia
├── Naturaleza: GASTO
├── Clasificación: EXPENSA COMÚN
├── Ámbito: GENERAL
├── Base: VALOR CONTRATO
├── Valor anual: $120.000.000
├── Distribución: COEFICIENTE
├── Financiación: CUOTA ORDINARIA
├── Periodicidad: MENSUAL
└── Fundamento: Ley 675 / Reglamento
```

------------------------------------------------------------------------

# 3. Estructura conceptual

Cada componente debe contener seis dimensiones:

``` text
COMPONENTE
│
├── IDENTIFICACIÓN
├── NATURALEZA
├── PRESUPUESTO
├── FINANCIACIÓN
├── DISTRIBUCIÓN
└── FUNDAMENTO / REGLAS
```

------------------------------------------------------------------------

# 4. Identificación

Campos conceptuales:

  Campo           Descripción
  --------------- ----------------------------
  `codigo`        Identificador único
  `nombre`        Nombre del componente
  `descripcion`   Descripción funcional
  `categoria`     Categoría presupuestal
  `vigencia`      Ejercicio al que pertenece
  `version`       Versión del presupuesto

Ejemplo:

``` text
Código: SEG-VIG-001
Nombre: Vigilancia
Categoría: Seguridad
Vigencia: 2027
```

------------------------------------------------------------------------

# 5. Naturaleza

Todo componente debe tener una naturaleza inequívoca.

### Valores iniciales

``` text
GASTO
INGRESO
RESERVA
AJUSTE
```

Para el primer modelo operativo se propone restringir el motor a:

``` text
GASTO
INGRESO
```

y manejar el **Fondo de Imprevistos** como una estructura presupuestal
especial, no como un gasto ordinario.

Esto evita mezclar:

> dinero que la copropiedad necesita gastar

con

> dinero que la copropiedad necesita constituir o reservar.

------------------------------------------------------------------------

# 6. Clasificación jurídica

El componente debe indicar explícitamente su tratamiento jurídico.

Valores iniciales:

``` text
EXPENSA_COMUN_NECESARIA
EXPENSA_COMUN_NO_GENERAL
FONDO_IMPREVISTOS
INGRESO_FINANCIADOR
OTRO
```

La Ley 675 establece que los propietarios deben contribuir a las
expensas necesarias causadas por la administración y los servicios
comunes esenciales, de acuerdo con el reglamento.

Por tanto, la clasificación jurídica no puede ser simplemente
configurable sin control. Debe estar sujeta a reglas.

------------------------------------------------------------------------

# 7. Ámbito de aplicación

Determina el universo de unidades al que puede afectar el componente.

Valores:

``` text
GENERAL
SECTOR
SUBSECTOR
UNIDAD
```

### GENERAL

Afecta al conjunto de propietarios según la regla general aplicable.

Ejemplos:

``` text
Administración general
Seguro general
```

### SECTOR

Afecta únicamente a un sector.

Ejemplo:

``` text
Mantenimiento zona comercial
```

En edificios comerciales o mixtos, la Ley 675 exige sectorización y que
los recursos de cada sector tengan destinación específica.

### SUBSECTOR

Permite una segmentación adicional cuando el reglamento la contemple.

### UNIDAD

Afecta exclusivamente a una o determinadas unidades.

Esta categoría debe estar sometida a validación jurídica/reglamentaria;
no debe interpretarse automáticamente que cualquier gasto individual
puede convertirse en una expensa común individualizada.

------------------------------------------------------------------------

# 8. Regla de distribución

El componente debe declarar explícitamente cómo se distribuye.

Valores iniciales:

``` text
COEFICIENTE
MODULO_CONTRIBUCION
DISTRIBUCION_ESPECIFICA
NO_DISTRIBUIBLE
```

### COEFICIENTE

Utiliza el coeficiente de copropiedad.

### MODULO_CONTRIBUCION

Utiliza el módulo correspondiente al sector.

La Ley 675 define los módulos como índices que determinan la
participación porcentual en expensas relacionadas con bienes y servicios
cuyo uso corresponde a un sector determinado.

### DISTRIBUCION_ESPECIFICA

Permite una regla particular establecida por el reglamento o una
disposición aplicable.

### NO_DISTRIBUIBLE

El componente puede formar parte del presupuesto pero no generar
directamente una obligación distribuible a propietarios.

------------------------------------------------------------------------

# 9. Base de cálculo

Cada componente debe identificar de dónde proviene su valor.

Valores propuestos:

``` text
VALOR_FIJO
CONTRATO
COTIZACION
HISTORICO
PROYECCION
FORMULA
PARAMETRO
MANUAL
```

Ejemplos:

### Vigilancia

``` text
Base: CONTRATO
Valor: $120.000.000
```

### Energía

``` text
Base: HISTORICO + PROYECCION
```

### Seguro

``` text
Base: COTIZACION
```

### Administración

``` text
Base: PARAMETRO
```

Esto permite que AQUILA registre **cómo se obtuvo el valor**, no
solamente el valor final.

------------------------------------------------------------------------

# 10. Fuente de financiación

Todo componente debe indicar cómo será financiado.

Valores iniciales:

``` text
CUOTA_ORDINARIA
OTROS_INGRESOS
FONDO_IMPREVISTOS
CUOTA_EXTRAORDINARIA
MIXTA
```

Regla:

> **El Fondo de Imprevistos no debe utilizarse automáticamente como
> fuente de financiación de cualquier componente.**

La Ley establece un fondo destinado a obligaciones o expensas
imprevistas y regula su utilización. El motor deberá validar las
condiciones antes de permitirlo.

------------------------------------------------------------------------

# 11. Periodicidad

El componente debe permitir:

``` text
ANUAL
SEMESTRAL
TRIMESTRAL
BIMESTRAL
MENSUAL
VARIABLE
```

Pero existe una distinción importante:

**Periodicidad presupuestal ≠ periodicidad de liquidación.**

Ejemplo:

``` text
Seguro
Presupuesto: ANUAL
Pago contractual: SEMESTRAL
Cuota propietario: MENSUAL
```

Por eso no debemos almacenar una única "periodicidad" como si resolviera
las tres situaciones.

------------------------------------------------------------------------

# 12. Fundamento jurídico

Este campo será obligatorio para componentes que afecten la
determinación de obligaciones.

Ejemplo:

``` text
Fundamento:
Ley 675 de 2001, artículo 25
Reglamento PH, capítulo X
```

Además:

``` text
tipo_fundamento
referencia_normativa
descripcion_regla
fecha_vigencia
```

Tipos propuestos:

``` text
LEY
DECRETO
REGLAMENTO_PH
DECISION_ASAMBLEA
PARAMETRO_ADMINISTRATIVO
```

Regla:

> **Toda regla que modifique el cálculo de una obligación y provenga de
> una norma legal debe conservar explícitamente su fundamento legal.**

------------------------------------------------------------------------

# 13. Modelo completo del componente

``` text
COMPONENTE PRESUPUESTAL
│
├── Identificación
│   ├── Código
│   ├── Nombre
│   ├── Descripción
│   └── Vigencia
│
├── Naturaleza
│   └── Gasto / Ingreso
│
├── Clasificación jurídica
│   └── Tipo de expensa / ingreso
│
├── Ámbito
│   └── General / Sector / Subsector / Unidad
│
├── Valor
│   ├── Base de cálculo
│   ├── Valor presupuestado
│   └── Fórmula
│
├── Financiación
│   └── Fuente
│
├── Distribución
│   ├── Regla
│   ├── Coeficiente
│   └── Módulo
│
├── Periodicidad
│
└── Fundamento
    ├── Tipo
    ├── Norma
    └── Regla
```

------------------------------------------------------------------------

# 14. Ejemplo completo --- Vigilancia

``` text
Código:
SEG-VIG-001

Naturaleza:
GASTO

Clasificación jurídica:
EXPENSA_COMUN_NECESARIA

Ámbito:
GENERAL

Base de cálculo:
CONTRATO

Valor anual:
120.000.000

Fuente de financiación:
CUOTA_ORDINARIA

Regla de distribución:
COEFICIENTE

Periodicidad presupuestal:
ANUAL

Periodicidad de financiación:
MENSUAL

Fundamento:
Ley 675 de 2001
Reglamento de propiedad horizontal
Presupuesto aprobado por Asamblea
```

------------------------------------------------------------------------

# 15. Ejemplo sectorial --- Zona comercial

``` text
Código:
COM-MAN-001

Naturaleza:
GASTO

Clasificación:
EXPENSA_COMUN_NO_GENERAL

Ámbito:
SECTOR

Sector:
COMERCIAL

Valor:
25.000.000

Fuente:
CUOTA_ORDINARIA

Distribución:
MODULO_CONTRIBUCION

Periodicidad:
MENSUAL

Fundamento:
Ley 675 de 2001, artículo 31
Reglamento de propiedad horizontal
```

Esto permite que el motor evite distribuir esos \$25 millones entre
propietarios residenciales que no pertenecen al sector correspondiente.

------------------------------------------------------------------------

# 16. Reglas de validación

## CP-001 --- Todo componente debe tener naturaleza

No puede existir un componente sin:

``` text
GASTO
o
INGRESO
```

## CP-002 --- Todo gasto distribuible debe tener regla

``` text
Si naturaleza = GASTO
y es distribuible
→ debe existir regla de distribución
```

## CP-003 --- Todo componente sectorial debe tener sector

``` text
Ámbito = SECTOR
→ sector obligatorio
```

## CP-004 --- Módulo requiere configuración válida

``` text
Distribución = MODULO_CONTRIBUCION
→ debe existir módulo aplicable
```

## CP-005 --- Coeficiente requiere unidad válida

``` text
Distribución = COEFICIENTE
→ unidad debe tener coeficiente vigente
```

## CP-006 --- Componente distribuible requiere beneficiarios

No puede distribuirse un componente si no existe el universo de unidades
beneficiarias.

## CP-007 --- Destinación sectorial

Un recurso sectorial no puede financiar componentes de otro sector.

Esta regla deriva directamente del artículo 31.

## CP-008 --- Fundamento

Todo tratamiento jurídico especial debe tener fundamento identificado.

------------------------------------------------------------------------

# 17. PRERREQUISITOS

## PRERREQUISITO 05.1 --- Catálogo de componentes

Debe existir un catálogo controlado.

## PRERREQUISITO 05.2 --- Catálogo de clasificaciones jurídicas

Debe existir una clasificación normalizada.

## PRERREQUISITO 05.3 --- Unidades privadas

Debe existir el universo de unidades.

## PRERREQUISITO 05.4 --- Coeficientes vigentes

Cada unidad debe tener su coeficiente correspondiente.

## PRERREQUISITO 05.5 --- Sectores

Debe existir la sectorización cuando corresponda.

## PRERREQUISITO 05.6 --- Módulos

Deben existir los módulos aplicables cuando el reglamento los contemple.

## PRERREQUISITO 05.7 --- Reglamento PH

Debe estar disponible la información relevante del reglamento.

## PRERREQUISITO 05.8 --- Fundamentos normativos

Las reglas legales utilizadas por el motor deben estar identificadas y
versionadas.

------------------------------------------------------------------------

# 18. Decisión de diseño E-05

Queda establecida la siguiente regla arquitectónica:

> **El Motor Presupuestal no distribuirá directamente un presupuesto
> global. Distribuirá componentes presupuestales individualizados, cada
> uno con su propia clasificación, fuente de financiación, universo
> beneficiario y regla de distribución.**

Esto permite posteriormente calcular:

\[ Cuota_u = `\sum`{=tex}\_{k=1}\^{n} Distribuir(NF_k,u) \]

donde cada componente puede tener una función de distribución diferente.

------------------------------------------------------------------------

# 19. Entregable cerrado

  Elemento              Definición
  --------------------- ------------------------------------------
  Unidad presupuestal   Componente Presupuestal
  Clasificación         Jurídica + presupuestal
  Ámbito                General / Sector / Subsector / Unidad
  Distribución          Coeficiente / Módulo / Regla específica
  Trazabilidad          Fundamento legal + reglamento + decisión

------------------------------------------------------------------------

# 20. Próximo entregable

## E-06 --- Motor de cálculo del valor presupuestado

El siguiente entregable debe definir cómo se obtiene matemáticamente el
valor de cada componente:

-   histórico;
-   contrato;
-   cotización;
-   proyección;
-   cantidad × tarifa;
-   fórmula;
-   parámetro;
-   incrementos;
-   inflación cuando corresponda;
-   escenarios;
-   redondeos;
-   ajustes;
-   y trazabilidad de la fuente del cálculo.

Se debe mantener la distinción entre:

> **método de proyección**

y

> **regla legal de incremento**.

El objetivo será convertir el concepto presupuestal en un **motor
matemático ejecutable**, sin introducir como obligación legal ninguna
regla que sea únicamente una decisión administrativa o una metodología
de proyección.
