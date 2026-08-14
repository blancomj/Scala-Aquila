# AQUILA_SAAS — E-09
## Especificación funcional y técnica consolidada del Motor Presupuestal

**Proyecto:** AQUILA_SAAS  
**Ámbito:** Propiedad horizontal en Colombia  
**Versión:** 1.0  
**Fecha:** 14 de agosto de 2026

---

# 1. Objetivo

Consolidar en una única especificación implementable el núcleo del **Motor Presupuestal de AQUILA_SAAS**, integrando:

- E-05 — Componente Presupuestal.
- E-06 — Cálculo del valor presupuestado.
- E-07 — Financiación presupuestal.
- E-08 — Distribución presupuestal.

El resultado del motor será:

> **El valor presupuestal financiado y distribuido que corresponde a cada unidad privada para una vigencia determinada, sin generar todavía obligaciones de cobro.**

---

# 2. Fundamento jurídico funcional

La Ley 675 de 2001 establece, entre otros aspectos:

- los coeficientes de copropiedad;
- los módulos de contribución cuando correspondan;
- la obligación de contribuir a las expensas comunes necesarias;
- el Fondo de Imprevistos;
- la competencia de la Asamblea para aprobar el presupuesto y las cuotas;
- y las funciones del administrador para preparar y someter el presupuesto.

El reglamento de propiedad horizontal debe contener, según corresponda, los coeficientes de copropiedad y módulos de contribución.

El administrador debe presentar un presupuesto detallado de gastos e ingresos del nuevo ejercicio anual, incluyendo las primas de seguros.

La Asamblea General aprueba el presupuesto anual y las cuotas para atender las expensas ordinarias o extraordinarias.

**Fundamento principal:** Ley 675 de 2001, artículos 25, 29, 31, 35, 38 y 51; Ley 2079 de 2021 respecto de las modificaciones aplicables al artículo 35.

---

# 3. Alcance

## Incluye

```text
Presupuesto
    ↓
Componentes
    ↓
Cálculo de valores
    ↓
Financiación
    ↓
Distribución
    ↓
Cuota presupuestal
```

## No incluye

- generación de cartera;
- aplicación de pagos;
- cálculo de mora;
- intereses de mora;
- acuerdos de pago;
- recaudo;
- contabilización;
- conciliación bancaria;
- ejecución presupuestal;
- cierre contable.

Estos procesos pertenecen a otros módulos.

---

# 4. Arquitectura funcional

```text
┌─────────────────────────────────────────┐
│          MOTOR PRESUPUESTAL             │
├─────────────────────────────────────────┤
│                                         │
│  E-05  COMPONENTE PRESUPUESTAL         │
│                 ↓                       │
│  E-06  MOTOR DE CÁLCULO                 │
│                 ↓                       │
│  E-07  MOTOR DE FINANCIACIÓN            │
│                 ↓                       │
│  E-08  MOTOR DE DISTRIBUCIÓN            │
│                 ↓                       │
│       CUOTA PRESUPUESTAL                 │
│                                         │
└─────────────────────────────────────────┘
```

El motor debe mantener separadas las cuatro responsabilidades.

---

# 5. Entidades funcionales mínimas

El modelo requiere como mínimo:

```text
COPROPIEDAD
VIGENCIA_PRESUPUESTAL
PRESUPUESTO
COMPONENTE_PRESUPUESTAL
FUENTE_FINANCIACION
REGLA_DISTRIBUCION
UNIDAD_PRIVADA
COEFICIENTE
SECTOR
MODULO_CONTRIBUCION
CALCULO_PRESUPUESTAL
DISTRIBUCION_PRESUPUESTAL
CUOTA_PRESUPUESTAL
FUNDAMENTO_NORMATIVO
```

Estas son entidades funcionales; su posterior implementación física en PostgreSQL deberá definirse en el diseño de datos.

---

# 6. Vigencia presupuestal

Toda operación debe estar asociada a una vigencia.

Mínimo:

```text
id
año
fecha_inicio
fecha_fin
estado
```

Estados:

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

Regla:

> Solo una vigencia aprobada puede convertirse en presupuesto oficial.

---

# 7. Presupuesto

El presupuesto agrupa los componentes de una vigencia.

Debe contener:

```text
id
vigencia_id
version
fecha_creacion
estado
total_gastos
total_ingresos
total_fondo_imprevistos
total_necesidad_financiera
total_distribuido
```

Debe conservarse el historial de versiones.

Una modificación no debe sobrescribir silenciosamente un presupuesto aprobado.

---

# 8. Componente presupuestal

Es la unidad mínima de cálculo.

Mínimo:

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
fuente_datos
valor_base
valor_presupuestado
fuente_financiacion
regla_distribucion
periodicidad
estado
fundamento_id
```

Naturaleza:

```text
GASTO
INGRESO
```

Ámbito:

```text
GENERAL
SECTOR
SUBSECTOR
UNIDAD
```

---

# 9. Métodos de cálculo

El motor debe soportar inicialmente:

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

Cada cálculo debe conservar:

```text
dato_base
fuente
metodo
parametros
formula
resultado
ajustes
redondeo
usuario
fecha
```

---

# 10. Regla de trazabilidad

El sistema debe poder reconstruir cualquier valor:

```text
VALOR PRESUPUESTADO
        ↑
     CÁLCULO
        ↑
    PARÁMETROS
        ↑
     DATOS BASE
        ↑
      FUENTE
```

No se permite que un valor calculado quede almacenado sin conservar su origen.

---

# 11. Modelo financiero

Para cada componente \(k\):

\[
\boxed{
NF_k = G_k + FI_k - I_k
}
\]

Donde:

- \(G_k\) = gasto presupuestado.
- \(FI_k\) = componente aplicable del Fondo de Imprevistos.
- \(I_k\) = ingresos válidamente aplicables.
- \(NF_k\) = necesidad financiera.

La fórmula solo es válida después de clasificar correctamente los ingresos y verificar su destinación.

---

# 12. Fondo de Imprevistos

El Fondo de Imprevistos es una estructura restringida.

Reglas mínimas:

```text
Porcentaje mínimo legal:
1 % sobre el presupuesto anual de gastos comunes

Suspensión:
cuando el monto disponible alcance el 50 %
del presupuesto ordinario del respectivo año

Uso:
solo conforme a las condiciones legales,
la aprobación requerida y el reglamento
```

El sistema debe almacenar:

```text
saldo_inicial
aporte_presupuestado
aportes_ejecutados
utilizaciones
saldo_final
porcentaje_aplicado
base_calculo
fundamento
```

La excepción prevista para edificios o conjuntos VIS/VIP de cinco o menos unidades debe poder parametrizarse conforme a la Ley 2079 de 2021.

---

# 13. Fuentes de financiación

Valores iniciales:

```text
CUOTA_ORDINARIA
CUOTA_EXTRAORDINARIA
OTROS_INGRESOS
FONDO_IMPREVISTOS
SALDO_APLICABLE
```

Cada fuente debe indicar:

```text
tipo
valor
vigencia
ámbito
destinación
disponibilidad
restricciones
fundamento
```

---

# 14. Regla de destinación

Una fuente restringida solo puede financiar componentes compatibles.

Regla:

\[
Fuente \rightarrow Componente
\]

debe ser una relación validada.

No se permite:

```text
Ingreso sector comercial
→ gasto residencial
```

cuando la normativa o el reglamento establezcan destinación sectorial.

---

# 15. Equilibrio financiero

Para cada componente:

\[
\boxed{
NF_k=\sum_j F_{k,j}
}
\]

Donde \(F_{k,j}\) representa cada fuente aplicable.

Para el presupuesto:

\[
\boxed{
\sum_k NF_k =
\sum_{k,j}F_{k,j}
}
\]

El equilibrio debe comprobarse también por ámbito cuando existan recursos con destinación específica.

---

# 16. Déficit y superávit

### Déficit

\[
DF_k=NF_k-F_k
\]

Si:

\[
DF_k>0
\]

el componente queda en estado:

```text
DEFICIT
```

El sistema no debe resolverlo automáticamente.

Debe requerir una acción autorizada.

### Superávit

\[
SF_k=F_k-NF_k
\]

Si:

\[
SF_k>0
\]

el componente queda en estado:

```text
SUPERAVIT
```

Debe quedar identificado para decisión posterior.

---

# 17. Motor de distribución

Para cada componente:

\[
\boxed{
C_{u,k}=NF_k\times P_{u,k}
}
\]

Donde:

- \(C_{u,k}\) = participación de la unidad.
- \(NF_k\) = necesidad financiera.
- \(P_{u,k}\) = participación aplicable.

Tipos:

```text
COEFICIENTE
MODULO_CONTRIBUCION
REGLA_ESPECIFICA
```

---

# 18. Universo beneficiario

Cada componente distribuible debe tener un universo explícito:

\[
U_k=\{u_1,u_2,\ldots,u_n\}
\]

El sistema nunca debe asumir que todas las unidades son beneficiarias.

Ejemplo:

```text
Componente:
Mantenimiento sector comercial

Universo:
Locales comerciales

Exclusiones:
Unidades residenciales
```

---

# 19. Distribución por coeficiente

\[
C_{u,k}=NF_k\times Coef_u
\]

Debe utilizarse el coeficiente vigente y aplicable a la unidad.

Validación:

\[
\boxed{
\sum_{u\in U_k}Coef_u=1
}
\]

cuando el universo corresponda a la totalidad del conjunto aplicable.

---

# 20. Distribución por módulo

\[
C_{u,k}=NF_k\times Mod_{u,k}
\]

Debe existir:

```text
sector
módulo
vigencia
universo
```

y la suma de los módulos aplicables debe corresponder al 100 % del universo distribuible.

---

# 21. Distribución específica

Solo puede utilizarse cuando exista una regla válida proveniente de:

```text
REGLAMENTO_PH
NORMA
DECISION_ASAMBLEA
OTRA_REGLA_JURIDICAMENTE_APLICABLE
```

No debe permitirse introducir arbitrariamente una proporción y clasificarla como regla jurídica.

---

# 22. Cuota presupuestal anual

Para cada unidad:

\[
\boxed{
QP_u=
\sum_k C_{u,k}
}
\]

Donde \(QP_u\) es la cuota presupuestal anual de la unidad.

Esta es la salida principal del Motor Presupuestal.

---

# 23. Distribución temporal

Cuando el componente varía por período:

\[
NF_k=\sum_m NF_{k,m}
\]

y:

\[
\boxed{
C_{u,k,m}=NF_{k,m}\times P_{u,k,m}
}
\]

La cuota del período:

\[
\boxed{
Q_{u,m}=\sum_k C_{u,k,m}
}
\]

Esto permite representar presupuestos no uniformes.

---

# 24. Redondeo

Regla:

```text
1. Mantener máxima precisión durante el cálculo.
2. Aplicar redondeo monetario al resultado.
3. Calcular diferencia residual.
4. Aplicar regla de distribución residual.
5. Validar conservación.
```

Debe existir una tolerancia parametrizada.

---

# 25. Reglas de integridad consolidadas

### MP-001 — Vigencia

Todo cálculo debe pertenecer a una vigencia.

### MP-002 — Componente

Todo componente debe tener naturaleza y clasificación.

### MP-003 — Método

Todo valor calculado debe tener método.

### MP-004 — Trazabilidad

Todo valor calculado debe ser reproducible.

### MP-005 — Fuente

Toda fuente debe tener origen y vigencia.

### MP-006 — Destinación

No se permiten aplicaciones incompatibles con la destinación.

### MP-007 — Distribución

Todo componente distribuible debe tener universo y regla.

### MP-008 — Conservación

\[
\sum C_{u,k}=NF_k
\]

### MP-009 — Equilibrio

\[
\sum Fuentes=\sum Necesidades
\]

### MP-010 — Coeficiente

Debe utilizarse el coeficiente vigente aplicable.

### MP-011 — Módulo

Debe utilizarse el módulo vigente aplicable.

### MP-012 — Redondeo

Toda diferencia residual debe quedar identificada.

### MP-013 — Estado

Un presupuesto no aprobado no puede generar obligaciones oficiales.

### MP-014 — Inmutabilidad

Una versión aprobada no debe modificarse directamente.

### MP-015 — Fundamento

Toda regla jurídica aplicada debe conservar su fundamento.

---

# 26. Estados del presupuesto

```text
BORRADOR
    ↓
EN_PREPARACION
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

Estados alternativos:

```text
RECHAZADO
ANULADO
```

Regla:

> Solo `APROBADO` puede convertirse en `VIGENTE`.

---

# 27. Auditoría

Toda operación que afecte el presupuesto debe registrar:

```text
usuario
fecha
acción
valor_anterior
valor_nuevo
motivo
origen
```

Para cálculos:

```text
componente
datos_base
parametros
formula
resultado
ajustes
redondeo
```

Para aprobación:

```text
presupuesto
version
órgano
fecha
acta
decisión
```

---

# 28. Flujo operativo definitivo

```text
1. Crear vigencia
        ↓
2. Crear presupuesto
        ↓
3. Definir componentes
        ↓
4. Calcular valores
        ↓
5. Registrar fuentes
        ↓
6. Determinar financiación
        ↓
7. Definir universos
        ↓
8. Distribuir componentes
        ↓
9. Validar integridad
        ↓
10. Consolidar cuotas
        ↓
11. Generar presupuesto propuesto
        ↓
12. Presentar a órgano competente
        ↓
13. Registrar aprobación
        ↓
14. Activar vigencia
```

---

# 29. Salidas del Motor Presupuestal

El motor debe producir como mínimo:

### Salida 1 — Presupuesto consolidado

```text
Total gastos
Total ingresos
Fondo de imprevistos
Necesidad financiera
Fuentes de financiación
```

### Salida 2 — Detalle por componente

```text
Componente
Valor
Método
Fuente
Financiación
Distribución
```

### Salida 3 — Cuota presupuestal por unidad

```text
Unidad
Coeficiente/módulo
Componentes aplicables
Cuota anual
Cuota por período
```

### Salida 4 — Trazabilidad

```text
Unidad
→ componente
→ cálculo
→ financiación
→ distribución
→ cuota
```

---

# 30. Fórmula consolidada

La fórmula conceptual final del Motor Presupuestal es:

\[
\boxed{
QP_u=
\sum_k
\left[
(G_k+FI_k-I_k)\times P_{u,k}
\right]
}
\]

Sujeta a:

\[
\sum_j F_{k,j}=NF_k
\]

y:

\[
\sum_{u\in U_k}P_{u,k}=1
\]

y:

\[
\sum_{u\in U_k}C_{u,k}=NF_k
\]

La fórmula representa el modelo matemático, pero **no sustituye las reglas jurídicas de elegibilidad, destinación, coeficientes, módulos y aprobación**.

---

# 31. PRERREQUISITOS CONSOLIDADOS

Antes de ejecutar el Motor Presupuestal deben existir:

1. **PRERREQUISITO — Copropiedad**
   - Identificación y configuración.

2. **PRERREQUISITO — Reglamento PH**
   - Coeficientes.
   - Módulos.
   - Sectores.
   - Reglas especiales.

3. **PRERREQUISITO — Unidades**
   - Universo vigente de unidades privadas.

4. **PRERREQUISITO — Vigencia**
   - Período presupuestal.

5. **PRERREQUISITO — Catálogo**
   - Componentes y clasificaciones.

6. **PRERREQUISITO — Fuentes**
   - Contratos, históricos, cotizaciones y parámetros.

7. **PRERREQUISITO — Fundamentos**
   - Normas y reglas versionadas.

8. **PRERREQUISITO — Fondo**
   - Saldo y condiciones aplicables.

---

# 32. Decisiones de arquitectura cerradas

### DA-001
El presupuesto se construye por componentes.

### DA-002
El cálculo del valor está separado de la financiación.

### DA-003
La financiación está separada de la distribución.

### DA-004
La distribución se realiza por componente, no sobre el presupuesto global.

### DA-005
Cada componente tiene su propio universo beneficiario.

### DA-006
Los coeficientes y módulos son datos jurídicamente determinados, no valores calculados arbitrariamente por el motor.

### DA-007
Las reglas específicas deben tener fundamento.

### DA-008
El motor produce cuota presupuestal, no obligación de cobro.

### DA-009
El presupuesto aprobado debe conservar versión e historial.

### DA-010
Toda cifra debe ser reproducible y auditable.

---

# 33. Criterio de cierre del Motor Presupuestal

El Motor Presupuestal se considera correctamente ejecutado cuando:

```text
✓ Todos los componentes tienen valor.
✓ Todos los componentes están clasificados.
✓ Toda financiación está identificada.
✓ No existen fuentes aplicadas fuera de su destinación.
✓ Todos los componentes distribuibles tienen universo.
✓ Toda distribución tiene regla.
✓ La distribución conserva el valor del componente.
✓ El presupuesto está financieramente equilibrado.
✓ La cuota de cada unidad es reproducible.
✓ Toda regla jurídica tiene fundamento.
✓ La versión resultante puede auditarse.
```

---

# 34. Resultado

Con E-09 queda consolidado el diseño conceptual y funcional del **Motor Presupuestal de AQUILA_SAAS**.

El flujo definitivo es:

```text
                 MOTOR PRESUPUESTAL
                         │
        ┌────────────────┼────────────────┐
        ↓                ↓                ↓
   COMPONENTES       FUENTES          REGLAS PH
        │                │                │
        └────────────────┼────────────────┘
                         ↓
                    CÁLCULO
                         ↓
                   FINANCIACIÓN
                         ↓
                   DISTRIBUCIÓN
                         ↓
                CUOTA PRESUPUESTAL
                         ↓
              MOTOR DE LIQUIDACIÓN
```

**Este documento constituye la especificación consolidada del núcleo presupuestal y reemplaza la necesidad de crear nuevos entregables matemáticos equivalentes.**

El siguiente trabajo, si se continúa, debe pasar a **diseño técnico de implementación**: modelo de datos, servicios, algoritmos y pruebas del motor. No se requiere otro entregable conceptual intermedio.
