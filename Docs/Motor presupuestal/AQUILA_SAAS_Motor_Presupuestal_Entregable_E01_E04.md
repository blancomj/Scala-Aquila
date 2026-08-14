# Motor Presupuestal de Propiedad Horizontal

## Entregable E-01 a E-04 --- Concepto matemático y arquitectura funcional

**Proyecto:** AQUILA_SAAS\
**Ámbito:** Administración de propiedad horizontal en Colombia\
**Versión:** 1.0\
**Fecha:** 14 de agosto de 2026

------------------------------------------------------------------------

## 1. Objetivo

El Motor Presupuestal debe determinar:

> El monto de recursos que la copropiedad necesita obtener durante una
> vigencia para financiar el presupuesto aprobado, y la distribución de
> esa necesidad entre las unidades privadas conforme a las reglas
> aplicables.

No debe limitarse a calcular una cuota.

Su función primaria es:

**Presupuestar → financiar → distribuir → producir la base para
liquidar.**

------------------------------------------------------------------------

# E-01 --- Concepto matemático

## 2. Principio matemático fundamental

El modelo debe partir de tres magnitudes independientes:

### A. Necesidad presupuestal

Lo que la copropiedad planea gastar.

\[ G = `\sum`{=tex}\_{i=1}\^{n} G_i \]

Donde:

-   \(G\) = gastos presupuestados.
-   (G_i) = cada concepto de gasto.

### B. Recursos presupuestados diferentes de cuotas

Ingresos que pueden contribuir a financiar las necesidades de la
copropiedad.

\[ I = `\sum`{=tex}\_{j=1}\^{m} I_j \]

Por ejemplo:

-   explotación de bienes comunes;
-   rendimientos;
-   otros ingresos autorizados.

La Ley 675 reconoce diversas fuentes de recursos patrimoniales además de
las expensas.

### C. Necesidad a financiar mediante expensas

\[ NF = G - I \]

Por tanto:

> Las cuotas no deberían calcularse directamente sobre el gasto bruto
> cuando existen recursos presupuestados que legítimamente financian
> parte de esos gastos.

------------------------------------------------------------------------

## 3. Fondo de imprevistos

El fondo debe manejarse como una variable independiente:

\[ FI = B\_{FI} `\times `{=tex}P\_{FI} \]

Donde:

-   (FI) = aporte presupuestado al Fondo de Imprevistos.
-   (B\_{FI}) = base aplicable del fondo.
-   (P\_{FI}) = porcentaje aplicado.

La Ley 675 establece un porcentaje no inferior al 1 % sobre el
presupuesto anual de gastos comunes.

Como regla mínima:

\[ P\_{FI} `\geq 1`{=tex}% \]

El motor no debe asumir automáticamente que siempre se cobra el 1 %.
Debe evaluar la situación del fondo, dado que la Ley contempla la
posibilidad de suspender su cobro cuando el monto disponible alcance el
50 % del presupuesto ordinario de gastos del respectivo año.

------------------------------------------------------------------------

# E-02 --- Fórmula financiera base

## 4. Modelo financiero

Con los componentes anteriores:

\[ `\boxed{NF = G + FI - I}`{=tex} \]

Donde:

-   (NF) = Necesidad Financiera Presupuestal.
-   \(G\) = Presupuesto de gastos.
-   (FI) = Aporte al Fondo de Imprevistos.
-   \(I\) = Ingresos presupuestados aplicables.

Esta cifra todavía **no es la cuota de cada propietario**.

Es el monto que posteriormente debe ser distribuido.

------------------------------------------------------------------------

# E-03 --- Unidad matemática: Componente Presupuestal

## 5. La distribución es una segunda etapa

No debe utilizarse como fórmula universal:

\[ Cuota = Presupuesto `\times `{=tex}Coeficiente \]

Debe existir una separación:

\[ NF `\rightarrow `{=tex}Motor de Distribución \]

El motor debe determinar qué regla corresponde a cada componente.

Ejemplo conceptual:

``` text
Gasto
 │
 ├── General
 │       └── Coeficiente
 │
 ├── Sectorial
 │       └── Módulo de contribución
 │
 └── Particular
         └── Regla específica
```

La Ley 675 contempla tanto los coeficientes de copropiedad como los
módulos de contribución.

------------------------------------------------------------------------

## 6. Definición del Componente Presupuestal

Cada gasto o ingreso no debe almacenarse únicamente como un valor
monetario.

Debe convertirse en un **Componente Presupuestal** con atributos
suficientes para determinar su tratamiento jurídico, financiero y
matemático.

Ejemplo:

``` text
COMPONENTE
-----------
Código: SEG-001
Descripción: Vigilancia
Valor anual: $120.000.000
Naturaleza: Gasto
Clasificación: Común
Distribución: Coeficiente
Periodicidad: Mensual
```

Otro ejemplo:

``` text
COMPONENTE
-----------
Código: ASC-001
Descripción: Mantenimiento de ascensores
Valor anual: $18.000.000
Naturaleza: Gasto
Clasificación: Común condicionado
Distribución: Regla específica
Periodicidad: Mensual
```

Cada componente debe tener su propia regla de distribución.

------------------------------------------------------------------------

# 7. Motor Presupuestal --- Arquitectura conceptual

``` text
                 VIGENCIA
                    │
                    ▼
              PRESUPUESTO
                    │
        ┌───────────┼───────────┐
        ▼           ▼           ▼
      GASTOS      INGRESOS     FONDOS
        │           │           │
        └───────────┼───────────┘
                    ▼
          NECESIDAD FINANCIERA
                    │
                    ▼
           MOTOR DISTRIBUCIÓN
                    │
        ┌───────────┼───────────┐
        ▼           ▼           ▼
    COEFICIENTE   MÓDULO     REGLA ESPECIAL
        │           │           │
        └───────────┼───────────┘
                    ▼
            CUOTA PRESUPUESTAL
                    │
                    ▼
             LIQUIDACIÓN
```

La arquitectura separa expresamente:

1.  Presupuesto.
2.  Distribución.
3.  Liquidación.

------------------------------------------------------------------------

# 8. Magnitudes presupuestales

AQUILA debe manejar explícitamente las siguientes magnitudes:

### PB --- Presupuesto Bruto

\[ PB = `\sum `{=tex}Gastos \]

### FI --- Fondo de Imprevistos

\[ FI = Base\_{FI} `\times `{=tex}Porcentaje\_{FI} \]

### IO --- Ingresos Presupuestados

\[ IO = `\sum `{=tex}Ingresos aplicables \]

### NF --- Necesidad Financiera

\[ `\boxed{NF = PB + FI - IO}`{=tex} \]

Esta es la cifra que posteriormente debe ser distribuida.

------------------------------------------------------------------------

# 9. Necesidad financiera por componente

No se recomienda manejar una única necesidad financiera global.

Debe existir una necesidad financiera por componente de distribución.

Ejemplo:

  Componente                 Valor
  ---------------- ---------------
  Vigilancia         \$120.000.000
  Aseo                \$48.000.000
  Administración      \$36.000.000
  Ascensores          \$18.000.000
  Piscina             \$12.000.000
  Zona comercial      \$25.000.000

Cada componente debe poder tener:

-   base;
-   naturaleza;
-   beneficiarios;
-   regla de distribución;
-   fuente de financiación;
-   periodicidad;
-   tratamiento del fondo;
-   tratamiento extraordinario.

------------------------------------------------------------------------

# 10. Fórmula general del componente

Para cada componente presupuestal (k):

\[ NF_k = G_k + FI_k - I_k \]

Y:

\[ NF\_{total} = `\sum`{=tex}\_{k=1}\^{n} NF_k \]

Por tanto:

\[ `\boxed{NF_{total} = PB + FI - IO}`{=tex} \]

siempre que todos los componentes estén correctamente clasificados y no
exista doble contabilización.

------------------------------------------------------------------------

# 11. Distribución por coeficiente

Cuando el componente se distribuya mediante coeficiente:

\[ C\_{u,k}=NF_k`\times `{=tex}Coef_u \]

Donde:

-   (C\_{u,k}) = participación de la unidad (u) en el componente (k).
-   (NF_k) = necesidad financiera del componente.
-   (Coef_u) = coeficiente aplicable a la unidad.

La suma de las participaciones debe satisfacer:

\[ `\sum `{=tex}C\_{u,k}=NF_k \]

Esta constituye una regla de integridad matemática obligatoria del
motor.

------------------------------------------------------------------------

# 12. Distribución por módulo

Para componentes sectoriales no necesariamente se utilizará el
coeficiente general.

Entonces:

\[ C\_{u,k}=NF_k`\times `{=tex}M\_{u,k} \]

Donde (M\_{u,k}) es el módulo aplicable al componente.

Nuevamente:

\[ `\sum `{=tex}C\_{u,k}=NF_k \]

Esto permite manejar edificios mixtos y sectores con gastos
diferenciados.

------------------------------------------------------------------------

# 13. Cuota presupuestal de una unidad

Finalmente:

\[ QP_u=`\sum`{=tex}*{k=1}\^{n}C*{u,k} \]

Donde:

**QP = Cuota Presupuestal Anual de la unidad.**

Si la periodicidad es mensual:

\[ QM_u=`\frac{QP_u}{12}`{=tex} \]

El valor 12 no debe ser una constante estructural del motor.

Debe depender de la periodicidad definida para la vigencia.

``` text
Mensual       → 12
Bimestral     → 6
Trimestral    → 4
Semestral     → 2
Anual         → 1
```

La liquidación posterior será la encargada de convertir la cuota
presupuestal en obligaciones concretas por período.

------------------------------------------------------------------------

# E-04 --- Variables del modelo

## 14. Variables principales

  Variable     Significado
  ------------ ---------------------------------------
  (G_k)        Gasto presupuestado del componente
  (I_k)        Ingreso aplicable al componente
  (FI_k)       Fondo de imprevistos aplicable
  (NF_k)       Necesidad financiera del componente
  (C\_{u,k})   Participación de unidad en componente
  (QP_u)       Cuota presupuestal anual de unidad
  (QM_u)       Cuota periódica de unidad
  (Coef_u)     Coeficiente aplicable
  (M\_{u,k})   Módulo aplicable

------------------------------------------------------------------------

# 15. Reglas de integridad del motor

## RI-001 --- No déficit presupuestal

\[ NF\_{total}`\geq0`{=tex} \]

## RI-002 --- Distribución completa

\[ `\sum `{=tex}C\_{u,k}=NF_k \]

## RI-003 --- Integridad de coeficientes

La suma de coeficientes aplicables debe corresponder al universo
definido por el reglamento de propiedad horizontal.

## RI-004 --- No doble financiación

Un ingreso no puede descontarse dos veces.

## RI-005 --- Fondo de Imprevistos

El motor debe respetar el mínimo legal aplicable y las condiciones de
suspensión o excepción previstas por la normativa.

## RI-006 --- Estado de aprobación

Un presupuesto calculado por el sistema no equivale a un presupuesto
aprobado.

Estados propuestos:

``` text
BORRADOR
   ↓
PROPUESTO
   ↓
PRESENTADO
   ↓
APROBADO
   ↓
VIGENTE
   ↓
CERRADO
```

La Asamblea General es quien aprueba el presupuesto y las cuotas.

------------------------------------------------------------------------

# 16. PRERREQUISITOS

Para implementar correctamente el Motor Presupuestal deben existir
previamente los siguientes elementos.

## PRERREQUISITO 01 --- Reglamento de Propiedad Horizontal

Debe determinarse, según corresponda:

-   coeficientes;
-   sectores;
-   módulos;
-   reglas especiales;
-   unidades;
-   bienes comunes;
-   posibles exclusiones.

## PRERREQUISITO 02 --- Estructura de unidades privadas

Debe existir el universo de unidades:

``` text
Copropiedad
 └── Unidad privada
      ├── tipo
      ├── coeficiente
      ├── sector
      └── módulos aplicables
```

## PRERREQUISITO 03 --- Catálogo presupuestal

Debe existir una clasificación de:

-   gastos;
-   ingresos;
-   fondos;
-   conceptos especiales.

## PRERREQUISITO 04 --- Reglas de distribución

Cada componente debe determinar quién debe financiarlo y mediante qué
regla.

## PRERREQUISITO 05 --- Vigencia presupuestal

Debe estar definida la vigencia y su estado.

## PRERREQUISITO 06 --- Estado del Fondo de Imprevistos

Debe conocerse el monto disponible para aplicar correctamente las reglas
legales correspondientes.

------------------------------------------------------------------------

# 17. Algoritmo conceptual inicial

``` text
INICIO

1. Obtener vigencia presupuestal.

2. Obtener configuración jurídica de la copropiedad.

3. Obtener unidades privadas.

4. Obtener coeficientes y módulos.

5. Obtener componentes presupuestales.

6. Clasificar cada componente.

7. Calcular gastos presupuestados.

8. Calcular ingresos aplicables.

9. Determinar Fondo de Imprevistos.

10. Calcular necesidad financiera.

11. Validar reglas de distribución.

12. Distribuir cada componente.

13. Validar integridad matemática.

14. Consolidar cuota anual por unidad.

15. Aplicar periodicidad.

16. Generar presupuesto resultante.

17. Marcar como PROPUESTO.

FIN
```

**El algoritmo no debe generar obligaciones de cobro.**

La generación de obligaciones corresponde al Motor de Liquidación.

------------------------------------------------------------------------

# 18. Entregables cerrados de esta etapa

### E-01 --- Concepto matemático

**Presupuesto → necesidad financiera → distribución.**

### E-02 --- Fórmula base

\[ `\boxed{NF=PB+FI-IO}`{=tex} \]

### E-03 --- Unidad matemática

El **Componente Presupuestal**, no el presupuesto global.

### E-04 --- Separación arquitectónica

**Motor Presupuestal → Motor de Distribución → Motor de Liquidación.**

Esta separación constituye una decisión arquitectónica fundamental para
evitar que la lógica presupuestal quede acoplada a la generación de
obligaciones de cobro.

------------------------------------------------------------------------

# 19. Próximo entregable

El siguiente entregable recomendado es:

## E-05 --- Estructura y clasificación del Componente Presupuestal

Debe definir, sin redundancia:

-   tipos de componentes;
-   naturaleza;
-   clasificación jurídica;
-   clasificación presupuestal;
-   base de cálculo;
-   fuente de financiación;
-   beneficiarios;
-   regla de distribución;
-   periodicidad;
-   tratamiento del Fondo de Imprevistos;
-   tratamiento de conceptos extraordinarios;
-   validaciones;
-   fundamento legal;
-   parámetros;
-   excepciones;
-   y PRERREQUISITOS.

El objetivo será convertir el concepto matemático anterior en una
**especificación funcional implementable**, antes de diseñar las
fórmulas definitivas y el modelo de datos.
