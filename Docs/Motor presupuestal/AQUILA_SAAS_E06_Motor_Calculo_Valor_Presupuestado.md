# AQUILA_SAAS — E-06
## Motor de cálculo del valor presupuestado

**Proyecto:** AQUILA_SAAS  
**Ámbito:** Administración de propiedad horizontal en Colombia  
**Versión:** 1.0  
**Fecha:** 14 de agosto de 2026

---

# 1. Objetivo

Definir el mecanismo mediante el cual AQUILA determina el **valor presupuestado de cada Componente Presupuestal** antes de proceder a su financiación y distribución.

La secuencia será:

```text
FUENTE / DATOS
      ↓
MÉTODO DE CÁLCULO
      ↓
VALOR PROYECTADO
      ↓
VALIDACIONES
      ↓
VALOR PRESUPUESTADO
```

El E-06 **no determina todavía cuánto paga cada propietario**.

Eso pertenece al Motor de Distribución.

---

# 2. Principio fundamental

El valor presupuestado debe ser resultado de una **metodología identificable y reproducible**.

No basta con almacenar:

```text
Vigilancia = $120.000.000
```

AQUILA debe poder responder:

> ¿Por qué el sistema presupuestó $120.000.000?

Por ejemplo:

```text
Contrato vigente:
$10.000.000 mensuales

Meses:
12

Valor proyectado:
$120.000.000
```

O:

```text
Ejecución 2026:
$100.000.000

Variación proyectada:
8 %

Valor presupuestado:
$108.000.000
```

La diferencia es fundamental para la **trazabilidad presupuestal**.

---

# 3. Métodos de cálculo

Se proponen inicialmente los siguientes métodos:

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

No todos tienen el mismo nivel de automatización.

---

# 4. Valor fijo

El usuario establece directamente el valor.

\[
VP = V
\]

Ejemplo:

```text
Componente:
Papelería

Valor:
$3.000.000
```

Debe quedar registrada la fuente o justificación del valor.

---

# 5. Método por contrato

Cuando existe un contrato vigente o proyectado:

\[
VP = \sum_{p=1}^{n} V_p
\]

Donde:

- \(V_p\) = obligación contractual del período \(p\).

Ejemplo:

```text
Contrato vigilancia
Valor mensual: $10.000.000
Duración presupuestada: 12 meses
```

Entonces:

\[
VP = 10.000.000 \times 12
\]

\[
VP = 120.000.000
\]

Este método es especialmente útil para:

- vigilancia;
- aseo;
- administración;
- mantenimiento;
- jardinería;
- servicios técnicos.

---

# 6. Método cantidad × tarifa

Para servicios cuyo costo depende de una cantidad:

\[
VP = Q \times T
\]

Donde:

- \(Q\) = cantidad proyectada.
- \(T\) = tarifa.

Ejemplo:

```text
Consumo proyectado:
10.000 kWh

Tarifa:
$800/kWh
```

Entonces:

\[
VP = 10.000 \times 800
\]

\[
VP = 8.000.000
\]

Este método será útil para:

- servicios públicos;
- consumos;
- mantenimiento por unidad;
- horas de servicio;
- unidades físicas;
- actividades contratadas por cantidad.

---

# 7. Método histórico

Se utiliza la ejecución presupuestal o gasto histórico como base.

\[
VP = H \times (1+r)
\]

Donde:

- \(H\) = valor histórico seleccionado.
- \(r\) = variación proyectada.

Ejemplo:

```text
Ejecución 2026:
$100.000.000

Variación proyectada:
8 %
```

\[
VP=100.000.000(1+0.08)
\]

\[
VP=108.000.000
\]

### Regla importante

El porcentaje \(r\) **no debe interpretarse automáticamente como IPC**.

Puede corresponder a:

- incremento contractual;
- variación de tarifas;
- incremento salarial aplicable a un contrato;
- comportamiento histórico;
- proyección administrativa;
- otra metodología debidamente sustentada.

---

# 8. Método de proyección

Una proyección puede construirse mediante:

\[
VP = H \times F
\]

Donde \(F\) es un factor de proyección.

Por ejemplo:

\[
F=(1+r_1)(1+r_2)
\]

Si tenemos:

- incremento contractual: 5 %;
- incremento tarifario adicional: 3 %.

Entonces:

\[
F=(1.05)(1.03)
\]

\[
F=1.0815
\]

Y:

\[
VP=H\times1.0815
\]

Esto es matemáticamente distinto de sumar simplemente 5 % + 3 %.

---

# 9. Proyección mensual

El motor debe poder calcular componentes mes a mes.

Ejemplo:

```text
Enero      $10.000.000
Febrero    $10.000.000
Marzo      $10.000.000
...
Diciembre  $10.500.000
```

Entonces:

\[
VP=\sum_{m=1}^{12}V_m
\]

Esto permite representar:

- incrementos durante el año;
- contratos que comienzan después de enero;
- contratos que terminan durante la vigencia;
- temporadas;
- cambios tarifarios;
- períodos sin ejecución.

Esto es superior a:

\[
Valor\ mensual\times12
\]

cuando existen variaciones durante la vigencia.

---

# 10. Método por cotización

Cuando el presupuesto se construye a partir de una cotización:

\[
VP = V_{cotización}
\]

AQUILA debe registrar:

```text
Proveedor
Fecha
Concepto
Valor
Vigencia
Documento soporte
```

Esto permite demostrar posteriormente la fuente del presupuesto.

---

# 11. Método mediante fórmula

Debe permitirse definir fórmulas matemáticas.

Ejemplo:

\[
VP=(Q\times T)+F
\]

Donde:

- \(Q\) = cantidad;
- \(T\) = tarifa;
- \(F\) = costo fijo.

Ejemplo:

```text
Mantenimiento:

50 equipos
×
$100.000
+
$2.000.000 fijo
```

\[
VP=50(100.000)+2.000.000
\]

\[
VP=7.000.000
\]

Este método permitirá posteriormente construir un **motor de fórmulas parametrizable**.

---

# 12. Método parametrizado

Este método utiliza parámetros previamente definidos.

Ejemplo:

```text
PARÁMETRO:
Costo mensual vigilancia = $10.000.000

PERIODOS:
12
```

Entonces:

\[
VP=10.000.000\times12
\]

Los parámetros deben tener:

- código;
- valor;
- unidad;
- vigencia;
- fuente;
- fecha de actualización;
- usuario que realizó el cambio.

---

# 13. Método manual

Debe existir porque no todos los componentes pueden ser modelados inicialmente.

Pero:

> **Manual no significa sin trazabilidad.**

Un valor manual debe exigir:

```text
Valor
Justificación
Fuente
Usuario
Fecha
Observación
```

Si el componente tiene impacto jurídico o financiero relevante, puede requerirse además un documento soporte.

---

# 14. Histórico como fuente, no como regla

El histórico puede ser:

```text
FUENTE
```

pero no necesariamente:

```text
REGLA
```

Ejemplo:

```text
Ejecución 2026:
$100 M

Método:
Histórico + proyección 7 %

Resultado:
$107 M
```

Por tanto:

```text
Fuente = Ejecución histórica
Método = Proyección
Factor = 7 %
```

Esto es más preciso que almacenar simplemente:

```text
Método = Histórico
```

---

# 15. Separación entre fuente y método

E-06 establece esta estructura:

```text
FUENTE
  ↓
DATO BASE
  ↓
MÉTODO
  ↓
PARÁMETROS
  ↓
FÓRMULA
  ↓
RESULTADO
```

Ejemplo:

```text
Fuente:
Ejecución presupuestal 2026

Dato:
$100.000.000

Método:
Proyección

Parámetro:
8 %

Fórmula:
100.000.000 × 1,08

Resultado:
$108.000.000
```

---

# 16. Incrementos

El motor debe distinguir entre diferentes tipos de incremento:

```text
INCREMENTO_CONTRACTUAL
INCREMENTO_TARIFARIO
INCREMENTO_SALARIAL
VARIACION_HISTORICA
INCREMENTO_PARAMETRIZADO
OTRO
```

Cada incremento debe tener:

```text
Tipo
Porcentaje
Base
Vigencia
Fuente
Justificación
```

---

# 17. Regla crítica: no existe incremento legal automático de cuota

El motor **no debe contener una regla general como**:

```text
Cuota año nuevo =
Cuota año anterior × (1 + IPC)
```

ni:

```text
Cuota año nuevo =
Cuota año anterior × (1 + SMMLV)
```

como mecanismo general.

La cuota debe determinarse a partir del presupuesto aprobado y de las reglas de distribución aplicables.

Por tanto:

> **El incremento es una variable del presupuesto, no una fórmula automática de la cuota.**

---

# 18. Proyección basada en IPC

AQUILA puede permitir:

```text
Método:
Histórico + IPC
```

pero debe significar:

> La administración decidió utilizar el IPC como supuesto de proyección.

No:

> La Ley obliga a utilizar el IPC.

El sistema debe guardar:

```text
Tipo:
SUPUESTO_PRESUPUESTAL

Índice:
IPC

Valor:
X %

Fuente:
Fuente oficial correspondiente

Justificación:
Proyección presupuestal
```

La diferencia jurídica y técnica es fundamental.

---

# 19. Proyección basada en salario mínimo

Igual tratamiento.

Puede utilizarse como **supuesto de proyección** cuando un costo esté razonablemente relacionado con remuneraciones o contratos afectados por ese parámetro.

Pero:

```text
SMMLV ≠ fórmula general de incremento de cuotas
```

Esto debe quedar como regla del motor.

---

# 20. Proyección mensual avanzada

Para componentes variables:

\[
VP=\sum_{m=1}^{12}
(Q_m\times T_m)+F_m
\]

Ejemplo:

```text
Mes       Cantidad    Tarifa
Enero       100        800
Febrero     110        800
Marzo       120        850
...
```

Cada período puede tener sus propios parámetros.

Esto permitirá posteriormente construir escenarios más precisos.

---

# 21. Escenarios presupuestales

El Motor Presupuestal debe permitir escenarios:

```text
BASE
OPTIMISTA
CONSERVADOR
```

Ejemplo:

| Escenario | Incremento |
|---|---:|
| Optimista | 3 % |
| Base | 6 % |
| Conservador | 10 % |

Regla:

> **Solo un escenario puede convertirse en presupuesto propuesto/aprobado para la vigencia.**

Los demás son herramientas de planeación.

---

# 22. Redondeo

El redondeo debe ejecutarse **al final del cálculo**, salvo que la naturaleza del componente requiera redondeos intermedios.

Regla:

\[
ResultadoFinal = Redondear(Resultado)
\]

Configuraciones posibles:

```text
SIN_DECIMALES
2_DECIMALES
DECIMA_MULTIPLE
```

El motor debe registrar el método utilizado.

No se debe redondear arbitrariamente cada operación porque puede producir diferencias acumuladas.

---

# 23. Tolerancia matemática

El motor debe manejar diferencias mínimas producidas por:

- redondeos;
- distribución decimal;
- conversiones;
- prorrateos.

Debe existir:

```text
TOLERANCIA_PRESUPUESTAL
```

Ejemplo:

\[
|TotalCalculado-TotalEsperado|\leq T
\]

La tolerancia debe ser:

> **controlada, parametrizada y auditable.**

No debe utilizarse para ocultar diferencias significativas.

---

# 24. Resultado del cálculo

Cada componente debe producir al menos:

```text
Valor base
Método
Parámetros
Valor proyectado
Ajustes
Valor final
```

Ejemplo:

```text
COMPONENTE: Vigilancia

Base:
$100.000.000

Método:
Histórico + Proyección

Factor:
8 %

Proyección:
$108.000.000

Ajuste:
$2.000.000

Valor presupuestado:
$110.000.000
```

---

# 25. Fórmula general del componente

Propongo esta abstracción:

\[
\boxed{
VP_k =
F_k(D_k,P_k,A_k)
}
\]

Donde:

- \(VP_k\) = valor presupuestado del componente \(k\);
- \(F_k\) = método de cálculo;
- \(D_k\) = datos base;
- \(P_k\) = parámetros;
- \(A_k\) = ajustes.

Esto permite que cada componente tenga su propio método.

---

# 26. Modelo matemático ampliado

Para componentes mensuales:

\[
\boxed{
VP_k =
\sum_{m=1}^{n}
F_k(D_{k,m},P_{k,m},A_{k,m})
}
\]

Donde:

- \(m\) = período;
- \(n\) = número de períodos presupuestales;
- \(D\) = datos;
- \(P\) = parámetros;
- \(A\) = ajustes.

Esta fórmula será la base para componentes variables.

---

# 27. Validaciones

## VP-001 — Método obligatorio

Todo componente con valor calculado debe tener método.

## VP-002 — Fuente obligatoria

Todo método que utilice datos externos debe identificar la fuente.

## VP-003 — Parámetros vigentes

Los parámetros utilizados deben estar vigentes para la fecha correspondiente.

## VP-004 — Fórmula reproducible

Un cálculo automático debe poder reconstruirse con los datos almacenados.

## VP-005 — No valores negativos

Salvo que se trate explícitamente de un componente cuya naturaleza permita valores negativos, el valor presupuestado de un gasto no puede ser negativo.

## VP-006 — Períodos válidos

Los períodos calculados deben pertenecer a la vigencia presupuestal.

## VP-007 — Trazabilidad

Todo ajuste manual posterior al cálculo debe quedar registrado.

## VP-008 — Escenario

Un presupuesto oficial solo puede derivarse de un escenario seleccionado y aprobado.

---

# 28. PRERREQUISITOS

## PRERREQUISITO 06.1 — Componente Presupuestal

Debe existir E-05.

## PRERREQUISITO 06.2 — Vigencia

Debe existir una vigencia presupuestal activa.

## PRERREQUISITO 06.3 — Fuentes

Deben estar disponibles los datos históricos, contratos, cotizaciones o parámetros utilizados.

## PRERREQUISITO 06.4 — Catálogo de métodos

Los métodos de cálculo deben estar definidos y versionados.

## PRERREQUISITO 06.5 — Parámetros

Los parámetros deben tener vigencia y fuente.

## PRERREQUISITO 06.6 — Calendario presupuestal

Debe estar definido el conjunto de períodos de la vigencia.

## PRERREQUISITO 06.7 — Motor de fórmulas

Si se utilizan fórmulas parametrizadas, debe existir un evaluador seguro y controlado.

---

# 29. Algoritmo conceptual E-06

```text
INICIO

1. Obtener componente.

2. Obtener vigencia.

3. Obtener método de cálculo.

4. Obtener fuente de datos.

5. Obtener datos base.

6. Obtener parámetros vigentes.

7. Obtener fórmula, si aplica.

8. Ejecutar cálculo.

9. Aplicar ajustes autorizados.

10. Calcular valor proyectado.

11. Aplicar reglas de redondeo.

12. Validar resultado.

13. Registrar trazabilidad.

14. Generar valor presupuestado.

FIN
```

---

# 30. Salida del E-06

El Motor de Cálculo debe producir:

```text
COMPONENTE
    ↓
VALOR BASE
    ↓
MÉTODO
    ↓
PARÁMETROS
    ↓
CÁLCULO
    ↓
AJUSTES
    ↓
REDONDEO
    ↓
VALOR PRESUPUESTADO
```

El resultado alimentará posteriormente:

**E-07 — Motor de Financiación Presupuestal.**

---

# 31. Decisiones de diseño E-06

### D-06.01
El valor presupuestado debe ser reproducible.

### D-06.02
Fuente y método son conceptos independientes.

### D-06.03
El histórico es una fuente, no necesariamente un método.

### D-06.04
IPC y SMMLV pueden ser parámetros de proyección, pero no constituyen una fórmula legal automática para determinar cuotas.

### D-06.05
Los componentes pueden calcularse por períodos.

### D-06.06
Los escenarios son herramientas de planeación; solo uno puede convertirse en presupuesto oficial.

### D-06.07
Todo ajuste manual debe ser auditable.

### D-06.08
El redondeo debe estar controlado.

### D-06.09
El Motor de Cálculo no distribuye valores entre propietarios.

### D-06.10
El Motor de Cálculo no genera obligaciones de cobro.

---

# 32. Entregable cerrado

| Elemento | Definición |
|---|---|
| Unidad | Componente Presupuestal |
| Entrada | Datos + fuente + parámetros |
| Método | Algoritmo de cálculo |
| Resultado | Valor presupuestado |
| Trazabilidad | Fuente + parámetros + fórmula + ajustes |
| Escenarios | Base / Optimista / Conservador |
| Salida | Valor para Motor de Financiación |

---

# 33. Siguiente entregable

## E-07 — Motor de Financiación Presupuestal

El siguiente paso será determinar:

> **Una vez calculado cuánto cuesta cada componente, ¿cómo se financia ese costo?**

Se deberán definir matemáticamente:

- ingresos presupuestados;
- cuotas ordinarias;
- cuotas extraordinarias;
- Fondo de Imprevistos;
- otros recursos;
- recursos sectoriales;
- déficit o superávit presupuestal;
- fuentes mixtas;
- reglas de afectación;
- prioridad de aplicación;
- saldos;
- y conciliación:

\[
\boxed{
Fuentes\ de\ Financiación
=
Necesidad\ Financiera
}
\]

Ese entregable será el puente entre **Presupuesto** y **Distribución**.
