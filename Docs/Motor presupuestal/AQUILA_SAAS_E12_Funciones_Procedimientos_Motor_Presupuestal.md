# AQUILA_SAAS — E-12
## Funciones y procedimientos del Motor Presupuestal

**Proyecto:** AQUILA_SAAS  
**Ámbito:** Administración de propiedad horizontal en Colombia  
**Etapa:** Implementación técnica  
**Versión:** 1.0  
**Fecha:** 14 de agosto de 2026

---

# 1. Objetivo

Definir las funciones y procedimientos de dominio que ejecutarán el Motor Presupuestal sobre PostgreSQL.

Este entregable convierte las reglas definidas en E-05 a E-11 en operaciones ejecutables y transaccionales.

El alcance se limita a:

```text
CALCULAR
    ↓
FINANCIAR
    ↓
DISTRIBUIR
    ↓
VALIDAR
    ↓
CONSOLIDAR
    ↓
APROBAR
```

No incluye todavía:

- interfaz;
- endpoints HTTP;
- RLS detallado;
- pruebas automatizadas completas;
- generación de cartera;
- liquidación de obligaciones.

---

# 2. Principio de diseño

Las funciones del motor deben ser:

- deterministas cuando reciban los mismos datos;
- transaccionales;
- auditables;
- idempotentes cuando la operación lo permita;
- independientes de la interfaz de usuario;
- incapaces de modificar presupuestos aprobados directamente.

La interfaz no debe contener la lógica matemática principal.

---

# 3. Flujo de ejecución

```text
fn_calcular_presupuesto()
        │
        ├── fn_calcular_componente()
        │
        ├── fn_calcular_financiacion()
        │
        ├── fn_calcular_distribucion()
        │
        ├── fn_calcular_cuotas()
        │
        └── fn_validar_presupuesto()
                    ↓
              PRESUPUESTO
                    ↓
             fn_aprobar_presupuesto()
```

---

# 4. Función: calcular componente

## Objetivo

Obtener el valor presupuestado de un componente utilizando el método configurado.

### Firma conceptual

```sql
fn_calcular_componente(
    p_componente_id uuid
)
returns numeric
```

### Responsabilidades

1. Obtener el componente.
2. Obtener el método.
3. Obtener el cálculo configurado.
4. Obtener parámetros.
5. Obtener fuente.
6. Ejecutar la metodología.
7. Aplicar ajustes.
8. Aplicar precisión.
9. Registrar resultado.
10. Actualizar `valor_presupuestado`.

### Resultado

```text
valor_presupuestado
```

---

# 5. Métodos de cálculo

La función debe resolver:

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

No debe utilizar un `CASE` gigantesco indefinidamente.

La implementación debe evolucionar hacia funciones internas especializadas:

```text
fn_calc_valor_fijo()
fn_calc_contrato()
fn_calc_cantidad_tarifa()
fn_calc_historico()
fn_calc_proyeccion()
fn_calc_cotizacion()
fn_calc_formula()
fn_calc_parametrizado()
fn_calc_manual()
```

`fn_calcular_componente()` actúa como orquestador.

---

# 6. Función: calcular presupuesto

## Objetivo

Ejecutar todos los cálculos de una versión de presupuesto.

### Firma

```sql
fn_calcular_presupuesto(
    p_presupuesto_id uuid
)
returns void
```

### Flujo

```text
1. Validar estado.
2. Obtener componentes.
3. Calcular cada componente.
4. Consolidar gastos.
5. Consolidar ingresos.
6. Calcular Fondo de Imprevistos.
7. Determinar necesidad financiera.
8. Ejecutar financiación.
9. Ejecutar distribución.
10. Generar cuotas.
11. Validar.
```

Debe ejecutarse dentro de una transacción.

---

# 7. Función: calcular Fondo de Imprevistos

### Firma conceptual

```sql
fn_calcular_fondo_imprevistos(
    p_presupuesto_id uuid
)
returns numeric
```

### Responsabilidades

- identificar la base de cálculo;
- aplicar el porcentaje parametrizado;
- considerar las reglas legales vigentes;
- registrar el cálculo;
- evitar duplicar el fondo cuando ya exista una configuración válida.

La base y el porcentaje utilizado deben quedar registrados.

No debe codificarse permanentemente como una simple multiplicación del 1 % sin considerar las excepciones y condiciones aplicables.

---

# 8. Función: calcular financiación

### Firma

```sql
fn_calcular_financiacion(
    p_presupuesto_id uuid
)
returns void
```

### Flujo

```text
Obtener componente
      ↓
Obtener necesidad
      ↓
Obtener fuentes disponibles
      ↓
Validar destinación
      ↓
Aplicar fuentes
      ↓
Calcular saldo
      ↓
Detectar déficit/superávit
```

### Regla

Para cada componente:

\[
NF_k=\sum_jF_{k,j}
\]

El presupuesto no puede pasar a `APROBADO` si existe déficit no resuelto.

---

# 9. Función: validar fuente

### Firma

```sql
fn_validar_fuente_financiacion(
    p_fuente_id uuid,
    p_componente_id uuid,
    p_valor numeric
)
returns boolean
```

### Validaciones

```text
✓ Fuente existe
✓ Fuente pertenece al presupuesto
✓ Valor disponible suficiente
✓ Destinación compatible
✓ Ámbito compatible
✓ Vigencia compatible
✓ Componente elegible
```

Debe devolver `false` o generar una excepción controlada cuando la fuente no sea aplicable.

---

# 10. Función: calcular distribución

### Firma

```sql
fn_calcular_distribucion(
    p_componente_id uuid
)
returns void
```

### Flujo

```text
Componente
    ↓
Necesidad financiera
    ↓
Regla de distribución
    ↓
Universo
    ↓
Coeficiente / módulo
    ↓
Participación individual
    ↓
Valor
    ↓
Redondeo
    ↓
Residual
```

---

# 11. Cálculo por coeficiente

\[
C_{u,k}=NF_k\times \frac{Coef_u}{100}
\]

Ejemplo:

```text
Necesidad = 100.000.000
Coeficiente = 1,25 %
```

Resultado:

\[
100.000.000\times0.0125
=
1.250.000
\]

La función debe utilizar el coeficiente correspondiente a la vigencia del presupuesto.

---

# 12. Cálculo por módulo

\[
C_{u,k}=NF_k\times\frac{Mod_{u,k}}{100}
\]

Debe validar:

```text
sector
vigencia
unidad
módulo
fundamento
```

No debe sustituir automáticamente un módulo por el coeficiente general.

---

# 13. Función: validar distribución

### Firma

```sql
fn_validar_distribucion(
    p_componente_id uuid
)
returns boolean
```

### Validaciones

\[
\sum P_{u,k}=100\%
\]

y:

\[
\sum C_{u,k}=NF_k
\]

También debe comprobar:

```text
✓ universo válido
✓ unidades vigentes
✓ regla vigente
✓ coeficientes/módulos vigentes
✓ ninguna unidad excluida recibió valor
✓ ninguna unidad elegible quedó omitida
```

---

# 14. Función: resolver residual

### Firma

```sql
fn_resolver_residual_distribucion(
    p_componente_id uuid
)
returns numeric
```

### Algoritmo

```text
1. Calcular valores con precisión completa.
2. Redondear valores monetarios.
3. Sumar valores redondeados.
4. Comparar contra necesidad.
5. Obtener diferencia.
6. Aplicar regla residual.
7. Registrar diferencia.
8. Volver a validar.
```

La diferencia debe ser mínima.

No debe utilizarse esta función para corregir errores de configuración.

---

# 15. Regla residual

La asignación residual debe ser determinística.

Se recomienda inicialmente:

```text
PRIORIDAD 1:
unidad con mayor participación

PRIORIDAD 2:
unidad con mayor valor calculado

PRIORIDAD 3:
unidad con menor UUID
```

La tercera condición solo funciona como criterio determinista de desempate.

La regla debe quedar parametrizable.

---

# 16. Función: calcular cuotas

### Firma

```sql
fn_calcular_cuotas(
    p_presupuesto_id uuid
)
returns void
```

### Fórmula

\[
QP_u=\sum_kC_{u,k}
\]

Para períodos:

\[
Q_{u,m}=\sum_kC_{u,k,m}
\]

La función debe consolidar las distribuciones ya validadas.

No debe recalcular directamente los componentes.

---

# 17. Función: validar presupuesto

### Firma

```sql
fn_validar_presupuesto(
    p_presupuesto_id uuid
)
returns boolean
```

### Validaciones mínimas

```text
✓ vigencia válida
✓ componentes válidos
✓ cálculos ejecutados
✓ financiación equilibrada
✓ distribución equilibrada
✓ Fondo de Imprevistos validado
✓ fuentes válidas
✓ universos completos
✓ cuotas generadas
✓ no existen déficits
✓ no existen errores críticos
```

---

# 18. Resultado de validación

La validación no debe limitarse a `true/false`.

Se recomienda una estructura:

```json
{
  "valido": true,
  "errores": [],
  "advertencias": [],
  "totales": {
    "necesidad": 0,
    "financiado": 0,
    "distribuido": 0
  }
}
```

Para esto puede utilizarse una función que retorne `jsonb`.

---

# 19. Función: aprobar presupuesto

### Firma

```sql
fn_aprobar_presupuesto(
    p_presupuesto_id uuid,
    p_usuario_id uuid,
    p_referencia_acta text
)
returns void
```

### Flujo

```text
1. Obtener presupuesto.
2. Verificar estado.
3. Ejecutar validación.
4. Si falla → ROLLBACK.
5. Registrar aprobación.
6. Cambiar estado.
7. Bloquear modificaciones.
8. Registrar auditoría.
```

No debe ser posible aprobar un presupuesto inválido mediante un `UPDATE` directo.

---

# 20. Función: crear nueva versión

### Firma

```sql
fn_crear_nueva_version_presupuesto(
    p_presupuesto_id uuid
)
returns uuid
```

### Flujo

```text
Presupuesto aprobado
        ↓
Crear versión +1
        ↓
Copiar configuración
        ↓
Mantener referencia anterior
        ↓
Nueva versión = BORRADOR
```

La versión anterior permanece intacta.

---

# 21. Máquina de estados

Las funciones deben controlar las transiciones.

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

No deben permitirse saltos arbitrarios.

Ejemplo inválido:

```text
BORRADOR → VIGENTE
```

---

# 22. Función de transición de estado

### Firma

```sql
fn_cambiar_estado_presupuesto(
    p_presupuesto_id uuid,
    p_estado_nuevo presupuesto_estado
)
returns void
```

Debe validar la transición:

```text
estado_actual
      ↓
¿transición válida?
      ↓
SÍ → cambiar
NO → excepción
```

---

# 23. Orquestador principal

La operación completa debe estar encapsulada en una función de dominio:

```sql
fn_procesar_presupuesto(
    p_presupuesto_id uuid
)
returns jsonb
```

### Secuencia

```text
BEGIN

1. Validar presupuesto.

2. Calcular componentes.

3. Calcular Fondo de Imprevistos.

4. Calcular financiación.

5. Validar financiación.

6. Calcular distribución.

7. Resolver residuales.

8. Validar distribución.

9. Calcular cuotas.

10. Validar presupuesto.

11. COMMIT.

RETURN resultado.
```

Ante cualquier error:

```text
ROLLBACK
```

---

# 24. Idempotencia

`fn_procesar_presupuesto()` debe poder ejecutarse nuevamente sobre una versión en preparación sin duplicar resultados.

La estrategia será:

```text
BORRAR/REEMPLAZAR RESULTADOS DERIVADOS
```

antes de recalcular:

```text
distribucion_presupuestal
cuota_presupuestal
```

pero **nunca** borrar datos maestros ni históricos de una versión aprobada.

---

# 25. Protección de presupuesto aprobado

Las funciones deben rechazar operaciones de cálculo que intenten alterar:

```text
APROBADO
VIGENTE
CERRADO
```

El flujo correcto será:

```text
APROBADO
   ↓
NUEVA VERSIÓN
   ↓
BORRADOR
   ↓
RECALCULAR
```

---

# 26. Errores de dominio

Se recomienda utilizar excepciones con códigos reconocibles.

Ejemplos:

```text
PRESUPUESTO_NO_EXISTE
ESTADO_NO_PERMITIDO
COMPONENTE_SIN_CALCULO
FUENTE_NO_APLICABLE
FUENTE_INSUFICIENTE
DESTINACION_INCOMPATIBLE
UNIVERSO_INVALIDO
PARTICIPACION_NO_100
DISTRIBUCION_NO_CONSERVA
FINANCIACION_NO_CONSERVA
COEFICIENTE_NO_ENCONTRADO
MODULO_NO_ENCONTRADO
PRESUPUESTO_NO_VALIDO
PRESUPUESTO_YA_APROBADO
```

Esto permitirá que el backend traduzca los errores de dominio a respuestas comprensibles.

---

# 27. Auditoría de ejecución

Cada procesamiento debe registrar:

```text
presupuesto_id
version
usuario
fecha_inicio
fecha_fin
estado
resultado
errores
advertencias
```

Se recomienda una tabla:

```sql
ejecucion_motor_presupuestal
```

con:

```text
id
presupuesto_id
tipo_ejecucion
inicio
fin
estado
resultado jsonb
usuario_id
created_at
```

---

# 28. No mezclar cálculo con aprobación

La función:

```text
fn_procesar_presupuesto()
```

no debe aprobar automáticamente.

Debe terminar en:

```text
VALIDADO
```

y posteriormente:

```text
fn_aprobar_presupuesto()
```

realiza la aprobación formal.

Esto mantiene separadas:

```text
Cálculo
≠
Validación
≠
Aprobación
```

---

# 29. Prerrequisitos

### PRERREQUISITO 12.1
E-11 — Modelo físico PostgreSQL.

### PRERREQUISITO 12.2
Modelo maestro de copropiedades.

### PRERREQUISITO 12.3
Modelo maestro de unidades.

### PRERREQUISITO 12.4
Configuración vigente de coeficientes y módulos.

### PRERREQUISITO 12.5
Fundamentos normativos.

### PRERREQUISITO 12.6
Control de usuarios y autorización.

---

# 30. Decisiones técnicas cerradas

### FT-12.01
La lógica matemática reside en PostgreSQL y/o servicios de dominio, no en la interfaz.

### FT-12.02
El cálculo completo es transaccional.

### FT-12.03
El procesamiento debe ser idempotente sobre versiones no aprobadas.

### FT-12.04
Los presupuestos aprobados son inmutables.

### FT-12.05
Toda modificación posterior requiere nueva versión.

### FT-12.06
Cálculo, validación y aprobación son operaciones distintas.

### FT-12.07
Las reglas de conservación se validan antes de aprobar.

### FT-12.08
Los errores de dominio deben ser identificables mediante códigos.

### FT-12.09
La distribución debe conservar la precisión matemática antes del redondeo.

### FT-12.10
La ejecución completa debe ser auditable.

---

# 31. Esqueleto de implementación

La arquitectura inicial de funciones será:

```text
fn_procesar_presupuesto()
        │
        ├── fn_calcular_componentes()
        │       └── fn_calcular_componente()
        │
        ├── fn_calcular_fondo_imprevistos()
        │
        ├── fn_calcular_financiacion()
        │       └── fn_validar_fuente_financiacion()
        │
        ├── fn_calcular_distribucion()
        │       ├── fn_distribuir_coeficiente()
        │       ├── fn_distribuir_modulo()
        │       └── fn_resolver_residual()
        │
        ├── fn_validar_distribucion()
        │
        ├── fn_calcular_cuotas()
        │
        └── fn_validar_presupuesto()
```

La implementación final deberá mantener las funciones pequeñas y especializadas.

---

# 32. Criterio de cierre

E-12 queda cerrado cuando:

```text
✓ Las operaciones del motor están definidas.
✓ Las firmas principales están definidas.
✓ La secuencia transaccional está definida.
✓ La idempotencia está definida.
✓ La máquina de estados está definida.
✓ La aprobación está separada del cálculo.
✓ Los errores de dominio están definidos.
✓ La auditoría está definida.
✓ Las funciones requeridas están identificadas.
```

El siguiente paso será **E-13 — Implementación SQL de las funciones críticas y pruebas del Motor Presupuestal**.

Ese entregable deberá contener código ejecutable y casos de prueba; no otro documento conceptual.
