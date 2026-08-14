# AQUILA_SAAS — E-08
## Motor de Distribución Presupuestal

**Proyecto:** AQUILA_SAAS  
**Ámbito:** Administración de propiedad horizontal en Colombia  
**Versión:** 1.0  
**Fecha:** 14 de agosto de 2026

---

# 1. Objetivo

Determinar cuánto corresponde financiar a cada unidad privada a partir de la **necesidad financiera de cada componente**, aplicando la regla de distribución jurídicamente correspondiente.

La Ley 675 establece que los coeficientes determinan la proporción con la que cada propietario contribuye a las expensas comunes, salvo los casos en que estas se determinen mediante módulos de contribución.

La secuencia será:

```text
COMPONENTE FINANCIADO
        ↓
REGLA DE DISTRIBUCIÓN
        ↓
UNIVERSO BENEFICIARIO
        ↓
PARTICIPACIÓN INDIVIDUAL
        ↓
CUOTA PRESUPUESTAL
```

---

# 2. Regla matemática general

Para cada componente \(k\) y unidad \(u\):

\[
\boxed{
C_{u,k}=NF_k\times P_{u,k}
}
\]

Donde:

- \(C_{u,k}\) = participación de la unidad \(u\) en el componente \(k\).
- \(NF_k\) = necesidad financiera del componente.
- \(P_{u,k}\) = participación aplicable a esa unidad para ese componente.

La clave está en determinar correctamente \(P_{u,k}\).

---

# 3. Distribución mediante coeficiente

Cuando el componente se distribuye mediante coeficiente:

\[
\boxed{
C_{u,k}=NF_k\times Coef_u
}
\]

Ejemplo:

```text
Necesidad del componente: $100.000.000

Coeficiente unidad A: 1,25 %
```

Entonces:

\[
C_{A,k}=100.000.000\times0,0125
\]

\[
C_{A,k}=\$1.250.000
\]

El artículo 25 de la Ley 675 establece que el coeficiente determina el índice de participación para las expensas comunes, tanto ordinarias como extraordinarias, salvo los casos de módulos de contribución.

---

# 4. Distribución mediante módulo de contribución

Para componentes sectoriales:

\[
\boxed{
C_{u,k}=NF_k\times Mod_{u,k}
}
\]

Donde:

- \(Mod_{u,k}\) = módulo aplicable a la unidad dentro del sector.

Ejemplo:

```text
Necesidad sector comercial:
$50.000.000

Local A:
Módulo = 10 %
```

Entonces:

\[
C_{A,k}=50.000.000\times0,10
\]

\[
C_{A,k}=\$5.000.000
\]

La Ley 675 define los módulos para las expensas relacionadas con bienes y servicios cuyo uso corresponde a un sector determinado en edificios comerciales o mixtos.

---

# 5. Universo de distribución

El motor **no debe distribuir un componente sobre todas las unidades por defecto**.

Cada componente debe tener un:

> **Universo Beneficiario**

Ejemplo:

```text
Componente:
Mantenimiento zona comercial

Universo:
Locales comerciales

Excluir:
Apartamentos residenciales
Parqueaderos no pertenecientes al sector
```

Por tanto:

\[
U_k=\{u_1,u_2,...,u_n\}
\]

donde \(U_k\) es el conjunto de unidades beneficiarias del componente \(k\).

---

# 6. Regla de participación

El motor debe determinar:

\[
P_{u,k}
\]

según el tipo de distribución.

### Tipo 1 — Coeficiente

\[
P_{u,k}=Coef_u
\]

### Tipo 2 — Módulo

\[
P_{u,k}=Mod_{u,k}
\]

### Tipo 3 — Regla específica

\[
P_{u,k}=R_{u,k}
\]

Esta última debe provenir de una regla válida del reglamento o del marco jurídico aplicable.

No debe permitirse que el usuario invente libremente una proporción y el sistema la trate como jurídicamente válida.

---

# 7. Regla de integridad

Para cada componente:

\[
\boxed{
\sum_{u\in U_k}P_{u,k}=1
}
\]

Por tanto:

\[
\boxed{
\sum_{u\in U_k}C_{u,k}=NF_k
}
\]

Esta será una de las validaciones más importantes de AQUILA.

Si un componente tiene:

```text
Necesidad = $100.000.000
```

la suma de todas las participaciones debe producir exactamente:

```text
$100.000.000
```

salvo diferencias controladas de redondeo.

---

# 8. Cuota presupuestal anual de la unidad

Una unidad puede participar en múltiples componentes.

Por tanto:

\[
\boxed{
QP_u=\sum_{k=1}^{n}C_{u,k}
}
\]

Donde:

**QP = Cuota Presupuestal Anual.**

Ejemplo:

| Componente | Unidad A |
|---|---:|
| Vigilancia | $1.250.000 |
| Aseo | $500.000 |
| Administración | $400.000 |
| Ascensores | $180.000 |
| Sector comercial | $0 |
| **Total anual** | **$2.330.000** |

La cuota no nace de aplicar un porcentaje único al presupuesto global; nace de acumular la participación de la unidad en cada componente que le corresponde.

---

# 9. Cuota periódica

Una vez determinada la cuota anual:

\[
QP_u
\]

se transforma según la periodicidad de cobro definida.

Para una distribución uniforme mensual:

\[
\boxed{
QM_u=\frac{QP_u}{12}
}
\]

Pero AQUILA debe soportar componentes cuya financiación no sea uniforme durante el año.

Por ejemplo:

```text
Enero      $200.000
Febrero    $200.000
...
Junio      $300.000
...
```

En ese caso:

\[
Q_{u,m}=\sum_k C_{u,k,m}
\]

Esto es superior a dividir siempre el total anual entre 12 cuando existen variaciones durante la vigencia.

---

# 10. Componentes con distribución temporal

Cuando un componente tenga valores diferentes por período:

\[
NF_k=\sum_{m=1}^{12}NF_{k,m}
\]

Entonces:

\[
\boxed{
C_{u,k,m}=NF_{k,m}\times P_{u,k,m}
}
\]

Y:

\[
\boxed{
Q_{u,m}=\sum_k C_{u,k,m}
}
\]

Esto permite representar:

- contratos parciales;
- incrementos durante el año;
- gastos estacionales;
- períodos de inicio;
- períodos de terminación;
- modificaciones presupuestales.

---

# 11. Ordinario y extraordinario

El motor debe conservar la naturaleza de la obligación.

```text
ORDINARIA
EXTRAORDINARIA
FONDO_IMPREVISTOS
```

No deben mezclarse matemáticamente aunque puedan utilizar una misma regla de distribución.

Ejemplo:

```text
Gasto ordinario:
$120 M

Gasto extraordinario:
$60 M
```

Ambos podrían distribuirse mediante coeficiente, pero deben permanecer como componentes independientes:

```text
COMP-001 → Ordinario
COMP-002 → Extraordinario
```

Esto permite identificar correctamente el origen de cada obligación.

---

# 12. Módulos: no sustituirlos por coeficientes

En una copropiedad comercial o mixta puede ocurrir:

```text
Presupuesto general
        ↓
Coeficientes generales

Presupuesto sector comercial
        ↓
Módulos comerciales

Presupuesto sector residencial
        ↓
Módulos residenciales
```

Por tanto, el motor debe permitir que una misma unidad tenga diferentes participaciones según el componente.

Ejemplo:

```text
Apartamento 501

Coeficiente general = 1,20 %

Módulo comercial = 0 %
Módulo parqueadero = 2,50 %
```

según las reglas del reglamento.

---

# 13. Una unidad puede participar en varios universos

Ejemplo:

```text
Apartamento 501

Participa en:
✓ Gastos generales
✓ Ascensores Torre A

No participa en:
✗ Sector comercial
✗ Gastos de otra torre
```

Entonces:

\[
QP_{501}
=
C_{501,general}
+
C_{501,torre}
\]

No:

\[
QP_{501}=PresupuestoTotal\times Coeficiente
\]

Esta es una diferencia conceptual importante respecto del modelo simplificado.

---

# 14. Redondeo y diferencia residual

Al distribuir pueden aparecer diferencias mínimas por redondeo.

AQUILA debe aplicar una estrategia explícita:

```text
1. Calcular valores con máxima precisión.
2. Redondear según configuración monetaria.
3. Calcular diferencia residual.
4. Asignar la diferencia según regla definida.
5. Validar que el total coincida.
```

La diferencia residual debe ser mínima, trazable y auditable.

Nunca debe ocultarse.

---

# 15. Regla de conservación

Para cada componente:

\[
\boxed{
NF_k =
\sum_{u\in U_k}C_{u,k}
}
\]

Para todo el presupuesto:

\[
\boxed{
NF_{total}
=
\sum_u QP_u
}
\]

Esta será la prueba matemática principal del motor.

---

# 16. Algoritmo E-08

```text
INICIO

1. Obtener componentes financiados.

2. Obtener necesidad financiera de cada componente.

3. Obtener universo beneficiario.

4. Obtener regla de distribución.

5. Obtener coeficientes/módulos/reglas específicas.

6. Validar vigencia.

7. Validar que las participaciones
   correspondan al universo.

8. Calcular participación individual.

9. Calcular valor individual.

10. Aplicar precisión matemática.

11. Aplicar redondeo monetario.

12. Resolver diferencia residual.

13. Validar conservación del componente.

14. Acumular participación por unidad.

15. Generar cuota presupuestal anual.

16. Generar distribución por período.

17. Validar conservación total.

FIN
```

---

# 17. Reglas de integridad

### DI-001 — Universo

Todo componente distribuible debe tener universo beneficiario.

### DI-002 — Regla

Todo componente debe tener una regla de distribución válida.

### DI-003 — Participación

La suma de participaciones debe ser 100 % del universo aplicable.

\[
\sum P_{u,k}=1
\]

### DI-004 — Conservación

La suma distribuida debe ser igual a la necesidad financiera.

\[
\sum C_{u,k}=NF_k
\]

### DI-005 — Coeficiente vigente

El coeficiente utilizado debe ser el vigente para la vigencia presupuestal.

### DI-006 — Módulo vigente

El módulo utilizado debe corresponder al sector y vigencia aplicables.

### DI-007 — Destinación

Un componente sectorial solo puede distribuirse entre las unidades correspondientes al sector.

### DI-008 — No distribución indebida

Una unidad excluida del universo no puede recibir participación.

### DI-009 — Redondeo

Las diferencias por redondeo deben quedar identificadas y compensadas.

### DI-010 — Trazabilidad

Cada cuota debe poder reconstruirse desde:

```text
Unidad
→ Componente
→ Necesidad
→ Fuente
→ Regla
→ Coeficiente/Módulo
→ Cálculo
```

---

# 18. Fórmula completa del Motor

Para una unidad \(u\):

\[
\boxed{
QP_u=
\sum_{k=1}^{n}
\left(
NF_k\times P_{u,k}
\right)
}
\]

Donde:

- \(QP_u\) = cuota presupuestal anual de la unidad;
- \(NF_k\) = necesidad financiera del componente;
- \(P_{u,k}\) = participación de la unidad en ese componente.

Y:

\[
P_{u,k}=
\begin{cases}
Coef_u & \text{si distribución = coeficiente}\\
Mod_{u,k} & \text{si distribución = módulo}\\
R_{u,k} & \text{si existe regla específica}
\end{cases}
\]

Esta es la **base matemática central de la distribución presupuestal de AQUILA**.

---

# 19. Flujo completo

```text
E-05
COMPONENTE
    ↓
E-06
VALOR PRESUPUESTADO
    ↓
E-07
FINANCIACIÓN
    ↓
E-08
DISTRIBUCIÓN
    ↓
CUOTA PRESUPUESTAL INDIVIDUAL
```

Matemáticamente:

\[
\boxed{
VP_k
\rightarrow
NF_k
\rightarrow
C_{u,k}
\rightarrow
QP_u
}
\]

Donde:

\[
NF_k =
G_k + FI_k - I_k
\]

y:

\[
C_{u,k}=NF_k\times P_{u,k}
\]

por lo que:

\[
\boxed{
QP_u=
\sum_k
\left[
(G_k+FI_k-I_k)\times P_{u,k}
\right]
}
\]

con las salvedades de destinación, elegibilidad y reglas específicas de cada componente.

---

# 20. PRERREQUISITOS

### PRERREQUISITO 08.1
E-05 — Componente Presupuestal.

### PRERREQUISITO 08.2
E-06 — Valor presupuestado.

### PRERREQUISITO 08.3
E-07 — Financiación.

### PRERREQUISITO 08.4
Unidades privadas vigentes.

### PRERREQUISITO 08.5
Coeficientes de copropiedad vigentes.

### PRERREQUISITO 08.6
Sectores y módulos vigentes cuando corresponda.

### PRERREQUISITO 08.7
Reglas específicas del reglamento de propiedad horizontal.

---

# 21. Alcance cerrado

Con E-08 queda terminado el **núcleo matemático del Motor Presupuestal**:

```text
┌─────────────────────────────┐
│       MOTOR PRESUPUESTAL    │
├─────────────────────────────┤
│ E-05 Componente             │
│ E-06 Cálculo                │
│ E-07 Financiación           │
│ E-08 Distribución           │
└──────────────┬──────────────┘
               ↓
       CUOTA PRESUPUESTAL
       DE CADA UNIDAD
```

No se crean subentregables adicionales para repetir esta misma lógica.

El siguiente paso, si se continúa con AQUILA, será pasar del **modelo conceptual a la especificación funcional/técnica consolidada del Motor Presupuestal**, convirtiendo E-05 a E-08 en estructuras de datos, entradas, salidas, reglas implementables y validaciones.

---

# 22. Fundamento jurídico principal

La distribución mediante coeficientes y módulos está sustentada principalmente en los artículos **25, 26, 27, 29 y 31 de la Ley 675 de 2001**, con las modificaciones aplicables.

