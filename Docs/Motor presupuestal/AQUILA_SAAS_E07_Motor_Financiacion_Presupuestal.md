# AQUILA_SAAS — E-07
## Motor de Financiación Presupuestal

**Proyecto:** AQUILA_SAAS  
**Ámbito:** Administración de propiedad horizontal en Colombia  
**Versión:** 1.0  
**Fecha:** 14 de agosto de 2026

---

# 1. Objetivo

Determinar, dado el costo presupuestado de cada componente, **con qué recursos se financiará y cuánto debe financiarse mediante expensas de los propietarios**.

La Ley 675 reconoce como recursos patrimoniales, entre otros, las expensas ordinarias y extraordinarias, multas, intereses, Fondo de Imprevistos y demás bienes e ingresos recibidos para cumplir el objeto de la persona jurídica.

---

# 2. Principio fundamental

No debe utilizarse simplemente:

\[
Financiación = Gastos - Ingresos
\]

porque **no todos los ingresos son intercambiables**.

Un ingreso puede tener una destinación específica.

Esto es especialmente importante en propiedades horizontales comerciales o mixtas: los recursos correspondientes a un sector deben quedar identificados en el presupuesto y solo pueden financiar las erogaciones inherentes a su destinación específica.

Por tanto, el modelo será:

\[
\boxed{
Financiación_k =
\sum Fuentes_{k}
}
\]

para cada componente \(k\).

Debe cumplirse:

\[
\boxed{
Financiación_k = Necesidad_k
}
\]

---

# 3. Fuentes de financiación

El motor manejará inicialmente cinco tipos:

```text
CUOTA_ORDINARIA
CUOTA_EXTRAORDINARIA
OTROS_INGRESOS
FONDO_IMPREVISTOS
SALDO_APLICABLE
```

No significa que todas puedan utilizarse para cualquier componente.

Cada fuente tendrá:

```text
fuente
valor
destinación
ámbito
vigencia
disponibilidad
restricciones
```

---

# 4. Cuota ordinaria

Es la fuente principal para financiar las expensas comunes presupuestadas.

Conceptualmente:

\[
CO_k = NF_k - OI_k
\]

Donde:

- \(CO_k\) = necesidad que debe financiarse mediante cuota ordinaria;
- \(NF_k\) = necesidad financiera del componente;
- \(OI_k\) = otros ingresos válidamente aplicables.

La cuota ordinaria no se determina primero para después construir el presupuesto.

El presupuesto determina la necesidad y posteriormente esta se distribuye entre los obligados conforme a las reglas aplicables.

---

# 5. Otros ingresos

Ejemplos:

```text
Arrendamiento de bienes comunes
Rendimientos financieros
Explotación económica autorizada
Otros ingresos
```

La Ley 675 contempla que los bienes comunes que produzcan renta puedan generar recursos para sufragar expensas comunes.

AQUILA debe registrar la **destinación** de cada ingreso.

Ejemplo:

```text
Ingreso:
Alquiler salón comunal

Valor:
$12.000.000

Aplicación:
Gastos generales
```

No debe asumirse que cualquier ingreso puede descontarse indiscriminadamente del presupuesto.

---

# 6. Recursos sectoriales

Caso especial para edificios comerciales o mixtos.

Ejemplo:

```text
Sector comercial

Ingreso:
$20.000.000

Gasto sector comercial:
$25.000.000
```

Entonces:

\[
NF_{sector}=25M-20M
\]

\[
NF_{sector}=5M
\]

Los $5 millones restantes se financian con los propietarios del sector según el módulo correspondiente.

No deben distribuirse entre toda la copropiedad.

---

# 7. Fondo de Imprevistos

El Fondo de Imprevistos debe tratarse como **fuente restringida**, no como fuente ordinaria de financiación.

La Ley establece reglas específicas para su constitución y utilización, incluyendo el recargo mínimo del 1 % sobre el presupuesto anual de gastos comunes y condiciones para suspender su cobro y utilizar los recursos.

Por tanto:

```text
FONDO_IMPREVISTOS
       │
       ▼
¿Componente elegible?
       │
   ┌───┴───┐
   NO      SÍ
   │        │
 RECHAZAR   ▼
        Aplicar saldo
```

El motor no debe permitir:

```text
Gasto ordinario
→ usar Fondo de Imprevistos
```

simplemente porque exista saldo.

---

# 8. Cuota extraordinaria

Debe existir como fuente separada:

```text
CUOTA_EXTRAORDINARIA
```

No debe confundirse con:

```text
CUOTA_ORDINARIA
```

ni con:

```text
APORTE_AL_FONDO_DE_IMPREVISTOS
```

Cuando la cuota extraordinaria se utilice para cubrir obligaciones relacionadas con el Fondo de Imprevistos, deben observarse las condiciones particulares establecidas por la normativa.

Por ello el motor debe conocer **la causa de la cuota extraordinaria**.

---

# 9. Modelo de financiación por componente

Para cada componente:

\[
\boxed{
NF_k =
CO_k +
CE_k +
OI_k +
FI_k +
SA_k
}
\]

Donde:

- \(CO_k\) = cuota ordinaria;
- \(CE_k\) = cuota extraordinaria;
- \(OI_k\) = otros ingresos;
- \(FI_k\) = Fondo de Imprevistos;
- \(SA_k\) = saldo aplicable.

La suma debe ser exactamente igual a la necesidad del componente:

\[
\boxed{
NF_k = \sum F_{k,j}
}
\]

---

# 10. Déficit de financiación

Si las fuentes inicialmente previstas no cubren el componente:

\[
DF_k = NF_k - F_k
\]

Si:

\[
DF_k > 0
\]

existe déficit.

El motor no debe resolverlo silenciosamente.

Debe generar:

```text
DÉFICIT DE FINANCIACIÓN
```

y determinar las alternativas autorizadas:

```text
1. Ajustar presupuesto
2. Aplicar otra fuente válida
3. Cuota extraordinaria
4. Aplicar saldo permitido
5. Revisión por administrador/Asamblea
```

La decisión debe quedar registrada.

---

# 11. Superávit de financiación

Si:

\[
F_k > NF_k
\]

entonces:

\[
SF_k = F_k-NF_k
\]

Debe producirse una alerta:

```text
SUPERÁVIT DE FINANCIACIÓN
```

No debe permitirse automáticamente convertirlo en otro gasto.

Debe existir una decisión sobre su tratamiento.

---

# 12. Regla de equilibrio

El presupuesto aprobado debe satisfacer:

\[
\boxed{
\sum Necesidades =
\sum Fuentes\ aplicables
}
\]

La igualdad debe comprobarse **por ámbito de destinación**, no únicamente globalmente.

Ejemplo:

```text
GENERAL
Necesidad: 300 M
Fuentes:   300 M
OK

COMERCIAL
Necesidad:  50 M
Fuentes:    50 M
OK
```

No sería válido compensar un déficit sectorial con un excedente de recursos que tengan otra destinación.

---

# 13. Estructura de la fuente

Cada fuente debe tener como mínimo:

```text
FUENTE_FINANCIACION
│
├── tipo
├── valor
├── vigencia
├── ámbito
├── destinación
├── disponibilidad
├── componente_destino
└── fundamento
```

Ejemplo:

```text
Tipo:
OTROS_INGRESOS

Valor:
$15.000.000

Ámbito:
GENERAL

Destinación:
GASTOS_GENERALES

Vigencia:
2027
```

---

# 14. Algoritmo E-07

```text
INICIO

1. Obtener componentes presupuestados.

2. Obtener necesidad financiera de cada componente.

3. Obtener fuentes disponibles.

4. Clasificar cada fuente.

5. Validar destinación.

6. Validar ámbito.

7. Aplicar fuentes restringidas únicamente
   a componentes elegibles.

8. Determinar recursos restantes.

9. Determinar necesidad a financiar
   mediante expensas.

10. Detectar déficit o superávit.

11. Resolver mediante reglas autorizadas.

12. Validar equilibrio financiero.

13. Generar estructura de financiación.

FIN
```

---

# 15. Salida del Motor de Financiación

Para cada componente:

```text
COMPONENTE
      ↓
NECESIDAD
      ↓
FUENTES APLICABLES
      ↓
APLICACIÓN DE RECURSOS
      ↓
SALDO A FINANCIAR
      ↓
FUENTE FINAL
```

Ejemplo:

```text
Vigilancia
Necesidad:              $120.000.000

Otros ingresos:           $5.000.000
Cuota ordinaria:        $115.000.000

Total financiación:     $120.000.000

Estado: EQUILIBRADO
```

---

# 16. Reglas de integridad

### FI-001 — Equilibrio

\[
\sum Fuentes = \sum Necesidades
\]

### FI-002 — No destinación cruzada

Una fuente restringida no puede financiar un componente incompatible.

### FI-003 — Fondo restringido

El Fondo de Imprevistos requiere validación de elegibilidad.

### FI-004 — No déficit oculto

Todo déficit debe quedar explícitamente identificado.

### FI-005 — No superávit silencioso

Todo exceso de financiación debe quedar identificado.

### FI-006 — Trazabilidad

Toda fuente debe indicar origen y fundamento.

### FI-007 — Vigencia

Una fuente debe pertenecer o ser legalmente aplicable a la vigencia correspondiente.

### FI-008 — Sector

Los recursos sectoriales deben conservar su destinación.

---

# 17. PRERREQUISITOS

### PRERREQUISITO 07.1
E-05 — Componente Presupuestal.

### PRERREQUISITO 07.2
E-06 — Valor presupuestado.

### PRERREQUISITO 07.3
Estructura de sectores y módulos cuando corresponda.

### PRERREQUISITO 07.4
Estado y saldo del Fondo de Imprevistos.

### PRERREQUISITO 07.5
Catálogo de fuentes de financiación.

### PRERREQUISITO 07.6
Reglas de destinación de recursos.

---

# 18. Decisión de diseño E-07

Queda establecida esta regla:

> **La financiación se determina por componente y por fuente, respetando la destinación y el ámbito de cada recurso.**

Por tanto, AQUILA no utilizará un único cálculo global:

\[
Presupuesto-Ingresos
\]

sino:

\[
\boxed{
Financiación =
\sum
Aplicación(Fuente,Componente)
}
\]

Esta decisión evita que recursos restringidos terminen financiando obligaciones que jurídicamente corresponden a otro ámbito.

---

# 19. Alcance cerrado del E-07

Con este entregable queda definido el **Motor de Financiación Presupuestal**.

No incluye:

- cálculo del valor de los componentes → E-06;
- distribución entre unidades → E-08;
- generación de cuotas periódicas;
- generación de cartera;
- liquidación de intereses;
- recaudo.

Esos procesos no se incorporan al E-07 para evitar mezclar responsabilidades.

### Flujo:

```text
E-05
Componente
   ↓
E-06
Valor
   ↓
E-07
Financiación
   ↓
E-08
Distribución entre unidades
```

**E-07 queda conceptualmente cerrado.**
