# AQUILA_SAAS — E-15
## Suite de Pruebas Integrales, Escenarios Reales y Criterios de Aceptación

**Proyecto:** AQUILA_SAAS  
**Ámbito:** Administración de propiedad horizontal en Colombia  
**Etapa:** Validación técnica  
**Versión:** 1.0  
**Fecha:** 14 de agosto de 2026

---

# 1. Objetivo

Definir la estrategia final de pruebas para verificar que el Motor Presupuestal:

- calcula correctamente;
- financia correctamente;
- distribuye correctamente;
- conserva los valores;
- respeta coeficientes y módulos;
- mantiene aislamiento multitenant;
- aplica RLS;
- controla estados;
- conserva versiones;
- y produce resultados reproducibles.

Este entregable no agrega nueva lógica de negocio.

Su propósito es determinar si la lógica definida en E-05 a E-14 puede considerarse técnicamente aceptable.

---

# 2. Base de pruebas

La estrategia se divide en cinco niveles:

```text
NIVEL 1 — Unidad
        ↓
NIVEL 2 — Base de datos
        ↓
NIVEL 3 — Seguridad/RLS
        ↓
NIVEL 4 — Integración
        ↓
NIVEL 5 — Aceptación funcional
```

Supabase recomienda utilizar pgTAP para pruebas de tablas, restricciones, funciones, integridad y RLS, y permite ejecutar estas pruebas mediante `supabase test db`. citeturn0search0turn0search1

Las pruebas de aplicación complementan las pruebas de base de datos y permiten verificar el comportamiento desde el contexto de la aplicación. citeturn0search0turn0search2

---

# 3. Criterio general

Un presupuesto solamente puede considerarse técnicamente válido cuando:

```text
CÁLCULO        ✓
FINANCIACIÓN   ✓
DISTRIBUCIÓN   ✓
CONSERVACIÓN   ✓
SEGURIDAD      ✓
VERSIONAMIENTO ✓
AUDITORÍA      ✓
INTEGRACIÓN    ✓
```

Un resultado matemáticamente correcto que viole RLS **es un resultado inválido**.

Un resultado seguro que no conserve los valores **también es inválido**.

---

# 4. Entorno de pruebas

Debe existir un entorno independiente:

```text
LOCAL
   ↓
TEST
   ↓
STAGING
   ↓
PRODUCCIÓN
```

Las pruebas destructivas no deben ejecutarse directamente sobre producción.

Para pruebas de base de datos se recomienda utilizar el entorno local de Supabase y `supabase test db`. La documentación actual indica que las pruebas SQL se ejecutan con pgTAP y que cada archivo se ejecuta dentro de una transacción que se revierte al finalizar. citeturn0search2turn0search5

---

# 5. Estructura de pruebas

Se recomienda:

```text
supabase/
└── tests/
    └── database/
        ├── 000_setup.test.sql
        ├── 010_schema.test.sql
        ├── 020_constraints.test.sql
        ├── 030_calculation.test.sql
        ├── 040_financing.test.sql
        ├── 050_distribution.test.sql
        ├── 060_rounding.test.sql
        ├── 070_versioning.test.sql
        ├── 080_rls.test.sql
        ├── 090_authorization.test.sql
        └── 100_regression.test.sql
```

La nomenclatura ordenada permite controlar dependencias entre archivos.

---

# 6. Pruebas de estructura

## T-DB-001

Verificar existencia de:

```text
vigencia_presupuestal
presupuesto
componente_presupuestal
calculo_presupuestal
fuente_presupuestal
fuente_financiacion
componente_financiacion
sector
coeficiente_copropiedad
modulo_contribucion
regla_distribucion
universo_distribucion
distribucion_presupuestal
cuota_presupuestal
```

---

# 7. Pruebas de claves

Debe comprobarse:

```text
✓ PK
✓ FK
✓ UNIQUE
✓ NOT NULL
✓ CHECK
```

Ejemplos:

```text
presupuesto.vigencia_id → vigencia_presupuestal.id

componente.presupuesto_id → presupuesto.id

distribucion.componente_id → componente.id
```

---

# 8. Pruebas de tipos

Verificar:

```text
montos → numeric
porcentajes → numeric
identificadores → uuid
fechas → date/timestamptz
estados → enum
configuraciones → jsonb
```

No deben existir montos monetarios críticos almacenados como `float`.

---

# 9. Pruebas de cálculo

## T-CAL-001 — Valor fijo

```text
Valor = $10.000.000
```

Esperado:

```text
Resultado = $10.000.000
```

---

# 10. T-CAL-002 — Cantidad × tarifa

```text
Cantidad = 12
Tarifa = $500.000
```

Esperado:

\[
12\times500.000=6.000.000
\]

---

# 11. T-CAL-003 — Proyección

```text
Base = $100.000.000
Factor = 8 %
```

Esperado:

\[
100.000.000\times1.08
=
108.000.000
\]

Los parámetros deben quedar registrados.

---

# 12. T-CAL-004 — Precisión

Utilizar:

```text
Base = 1
Factor = 33,33333333 %
```

Verificar que el cálculo interno conserve más precisión que el valor monetario final.

---

# 13. Pruebas de Fondo de Imprevistos

## T-FI-001

Verificar el porcentaje configurado para la vigencia.

## T-FI-002

Verificar la base utilizada.

## T-FI-003

Verificar que el sistema registre:

```text
base
porcentaje
resultado
fundamento
```

## T-FI-004

Verificar las condiciones especiales aplicables.

No debe existir una prueba que simplemente asuma que todas las copropiedades siempre aplican exactamente la misma regla sin verificar configuración y fundamento.

---

# 14. Pruebas de financiación

## T-FIN-001 — Equilibrio

```text
Necesidad = $100.000.000

Fuente A = $60.000.000
Fuente B = $40.000.000
```

Esperado:

```text
Financiado = $100.000.000
Déficit = $0
```

---

# 15. T-FIN-002 — Déficit

```text
Necesidad = $100.000.000

Fuentes = $90.000.000
```

Esperado:

```text
Déficit = $10.000.000
```

El presupuesto no debe poder aprobarse.

---

# 16. T-FIN-003 — Fuente insuficiente

```text
Disponible = $10.000.000
Aplicar = $12.000.000
```

Esperado:

```text
RECHAZO
```

---

# 17. T-FIN-004 — Destinación incompatible

Crear:

```text
Fuente sector A
```

e intentar aplicarla a:

```text
Componente sector B
```

Esperado:

```text
DESTINACION_INCOMPATIBLE
```

---

# 18. Pruebas de coeficientes

## T-COEF-001

```text
Necesidad = $100.000.000

A = 1 %
B = 2 %
C = 97 %
```

Esperado:

```text
A = $1.000.000
B = $2.000.000
C = $97.000.000
```

---

# 19. T-COEF-002 — Coeficiente histórico

Crear:

```text
2026 → 1,20 %
2027 → 1,25 %
```

Procesar presupuesto 2026.

Esperado:

```text
Se utiliza 1,20 %
```

Cambiar el maestro vigente.

Esperado:

```text
El presupuesto 2026 no cambia.
```

---

# 20. T-COEF-003 — Coeficiente inexistente

Una unidad tiene participación en el universo pero no tiene coeficiente vigente.

Esperado:

```text
COEFICIENTE_NO_ENCONTRADO
```

No se debe usar un coeficiente de otra vigencia.

---

# 21. Pruebas de módulos

## T-MOD-001

```text
Necesidad = $50.000.000

A = 10 %
B = 20 %
C = 70 %
```

Esperado:

```text
A = $5.000.000
B = $10.000.000
C = $35.000.000
```

---

# 22. T-MOD-002 — Sector

Crear:

```text
Sector Comercial
Sector Residencial
```

El componente comercial debe distribuirse únicamente sobre su universo.

Esperado:

```text
Residencial no recibe participación comercial.
```

---

# 23. T-MOD-003 — Módulo histórico

Crear:

```text
2026 → módulo 10 %
2027 → módulo 12 %
```

Procesar 2026.

Esperado:

```text
Se utiliza 10 %
```

El cambio posterior no debe alterar el presupuesto histórico.

---

# 24. Pruebas de universo

## T-UNI-001

Verificar:

\[
\sum P_{u,k}=100\%
\]

---

## T-UNI-002

Participaciones:

```text
40 %
30 %
20 %
```

Esperado:

```text
RECHAZO
```

porque:

\[
40+30+20=90\%
\]

---

# 25. T-UNI-003 — Unidad excluida

Una unidad fuera del universo no puede aparecer en:

```text
distribucion_presupuestal
```

---

# 26. Pruebas de conservación

## T-CON-001

Para cada componente:

\[
\boxed{
Necesidad = Distribución
}
\]

---

# 27. T-CON-002 — Error deliberado

```text
Necesidad = $100.000
Distribución = $99.990
```

Esperado:

```text
RECHAZO
```

si la diferencia supera la tolerancia definida.

---

# 28. T-CON-003 — Presupuesto completo

\[
\boxed{
\sum Necesidades =
\sum Distribuciones
}
\]

Debe coincidir dentro de la tolerancia monetaria definida.

---

# 29. Pruebas de redondeo

## T-RED-001

```text
Necesidad = $100,00

33,333333 %
33,333333 %
33,333334 %
```

Resultado esperado después del residual:

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

# 30. T-RED-002 — Residual negativo

Debe probarse un escenario donde el redondeo produzca un exceso:

```text
Distribuido redondeado > necesidad
```

El algoritmo debe corregir el residual sin generar valores negativos.

---

# 31. T-RED-003 — Determinismo

Ejecutar el mismo cálculo dos veces.

Esperado:

```text
mismos valores
mismo residual
misma unidad receptora del residual
```

---

# 32. Pruebas de cuotas

## T-Q-001

Si una unidad participa en:

```text
Componente A = $500.000
Componente B = $300.000
Componente C = $200.000
```

esperado:

```text
Cuota anual = $1.000.000
```

---

# 33. T-Q-002 — Cuota periódica

Si el componente tiene distribución temporal:

```text
Enero = $100.000
Febrero = $120.000
Marzo = $80.000
```

la cuota de cada período debe conservar el valor correspondiente.

---

# 34. Pruebas de versionamiento

## T-V-001

```text
v1 → APROBADO
```

Crear nueva versión.

Esperado:

```text
v2 → BORRADOR
v2.version_anterior_id = v1
```

---

# 35. T-V-002 — Inmutabilidad

Intentar modificar:

```text
valor_presupuestado
```

de v1 aprobada.

Esperado:

```text
RECHAZO
```

---

# 36. T-V-003 — Independencia histórica

Modificar v2.

Esperado:

```text
v1 permanece exactamente igual.
```

---

# 37. Pruebas de máquina de estados

Transiciones válidas:

```text
BORRADOR → EN_PREPARACION
EN_PREPARACION → PROPUESTO
PROPUESTO → PRESENTADO
PRESENTADO → APROBADO
APROBADO → VIGENTE
VIGENTE → CERRADO
```

Cada transición debe probarse.

---

# 38. Estados inválidos

Ejemplos:

```text
BORRADOR → VIGENTE
BORRADOR → CERRADO
APROBADO → BORRADOR
CERRADO → APROBADO
```

Esperado:

```text
RECHAZO
```

---

# 39. Pruebas RLS

Supabase recomienda probar explícitamente las políticas RLS y los casos negativos, incluyendo operaciones que el usuario no debería poder realizar. citeturn0search0turn0search1

## T-RLS-001

Usuario A consulta copropiedad A.

Esperado:

```text
ACCESO
```

---

# 40. T-RLS-002

Usuario A intenta consultar copropiedad B.

Esperado:

```text
SIN FILAS / ACCESO DENEGADO
```

---

# 41. T-RLS-003

Usuario A intenta modificar presupuesto de B.

Esperado:

```text
RECHAZO
```

---

# 42. T-RLS-004

Usuario sin pertenencia a copropiedad.

Esperado:

```text
SIN ACCESO
```

---

# 43. T-RLS-005 — Escalada mediante ID

Enviar manualmente:

```json
{
  "presupuesto_id": "ID-DE-OTRA-COPROPIEDAD"
}
```

Esperado:

```text
RECHAZO
```

No basta con ocultar el registro en la interfaz.

---

# 44. Pruebas de roles

## T-ROL-001

Usuario autorizado para preparar presupuesto.

Esperado:

```text
PUEDE PROCESAR
```

---

## T-ROL-002

Usuario sin permiso de aprobación.

Esperado:

```text
NO PUEDE APROBAR
```

---

## T-ROL-003

Auditor.

Esperado:

```text
PUEDE CONSULTAR
NO PUEDE MODIFICAR
```

Los roles concretos deben corresponder al modelo de seguridad definitivo de AQUILA.

---

# 45. Pruebas de Edge Functions

Verificar:

```text
✓ JWT válido
✓ JWT inválido
✓ usuario inexistente
✓ copropiedad no autorizada
✓ payload incompleto
✓ UUID inválido
✓ error de dominio
✓ error interno
```

---

# 46. Pruebas de contrato HTTP

### 400

Payload inválido.

### 401

Usuario no autenticado.

### 403

Usuario autenticado pero sin autorización.

### 404

Presupuesto inexistente.

### 409

Conflicto de estado o versionamiento.

### 422

Regla de negocio incumplida.

### 500

Error interno no controlado.

Los códigos HTTP no sustituyen los códigos de dominio.

---

# 47. Pruebas de idempotencia

## T-IDEM-001

Enviar dos veces la misma operación de procesamiento.

Esperado:

```text
No duplicar distribuciones.
No duplicar cuotas.
No crear nuevas versiones.
```

---

# 48. Pruebas de concurrencia

Simular:

```text
Usuario A → procesar
Usuario B → procesar
```

simultáneamente.

Esperado:

```text
No corrupción.
No duplicados.
No pérdida de datos.
```

---

# 49. T-CONC-002 — Versionamiento concurrente

Dos solicitudes intentan crear una nueva versión de v1 simultáneamente.

Esperado:

```text
Solo una versión siguiente válida.
```

La otra debe:

```text
esperar
```

o:

```text
recibir conflicto controlado.
```

---

# 50. Pruebas de regresión

Después de cualquier cambio en:

```text
cálculo
financiación
distribución
RLS
versionamiento
```

deben ejecutarse nuevamente:

```text
suite matemática
suite financiera
suite distribución
suite seguridad
suite versionamiento
```

---

# 51. Pruebas de propiedades matemáticas

Además de ejemplos fijos, el motor debe probar propiedades.

## Propiedad P1

Para cualquier componente válido:

\[
\sum P=100\%
\]

---

## Propiedad P2

Para cualquier componente válido:

\[
\sum C=NF
\]

---

## Propiedad P3

Si:

\[
NF=0
\]

entonces:

\[
C_u=0
\]

---

## Propiedad P4

Si:

\[
P_u=0
\]

entonces:

\[
C_u=0
\]

---

## Propiedad P5

Si la necesidad se duplica:

\[
NF' = 2NF
\]

entonces:

\[
C'_u=2C_u
\]

antes del redondeo.

---

# 52. Prueba de invariancia histórica

Después de aprobar:

```text
Presupuesto v1
```

cambiar:

```text
coeficiente maestro
módulo maestro
regla actual
parámetro actual
```

Esperado:

```text
v1 no cambia.
```

Esta prueba es crítica para auditoría.

---

# 53. Prueba de trazabilidad

Para cualquier cuota:

```text
cuota
 ↓
distribución
 ↓
componente
 ↓
financiación
 ↓
cálculo
 ↓
fuente
 ↓
fundamento
```

Debe ser posible reconstruir el resultado.

---

# 54. Prueba de auditoría

Verificar que las operaciones:

```text
CALCULAR
RECALCULAR
PRESENTAR
APROBAR
VERSIONAR
ANULAR
```

produzcan registro de auditoría.

---

# 55. Suite pgTAP

Las pruebas de base de datos deberán utilizar pgTAP.

Ejemplo:

```sql
begin;

select plan(3);

select has_table(
    'public',
    'presupuesto',
    'La tabla presupuesto existe'
);

select has_column(
    'public',
    'presupuesto',
    'vigencia_id',
    'presupuesto tiene vigencia'
);

select col_is_pk(
    'public',
    'presupuesto',
    'id',
    'presupuesto tiene PK'
);

select * from finish();

rollback;
```

Supabase documenta `has_table()`, `has_column()`, `col_is_pk()`, `results_eq()`, `policies_are()` y funciones de prueba de funciones como parte de pgTAP. citeturn0search1

---

# 56. Suite RLS pgTAP

Las políticas deben probar:

```text
SELECT
INSERT
UPDATE
DELETE
```

y al menos:

```text
usuario autorizado
usuario no autorizado
usuario de otra copropiedad
usuario sin rol
```

Supabase recomienda probar tanto los casos permitidos como los negativos para detectar bypasses de seguridad. citeturn0search0

---

# 57. CI/CD

La suite debe integrarse al pipeline de GitHub.

Flujo:

```text
Pull Request
      ↓
Migraciones
      ↓
Base local
      ↓
pgTAP
      ↓
Pruebas Edge Functions
      ↓
PASS
      ↓
Merge
```

Supabase documenta la ejecución de pruebas de base de datos mediante CLI y la automatización de pruebas de Edge Functions con GitHub Actions. citeturn0search3turn0search9

---

# 58. Criterios de aceptación

El Motor Presupuestal se considerará **APTO PARA STAGING** cuando:

```text
✓ 100 % de pruebas críticas matemáticas PASS
✓ 100 % de pruebas de conservación PASS
✓ 100 % de pruebas de versionamiento PASS
✓ 100 % de pruebas RLS críticas PASS
✓ 100 % de pruebas de autorización críticas PASS
✓ 100 % de pruebas de integración críticas PASS
✓ Sin defectos críticos abiertos
```

---

# 59. Criterios de aceptación para producción

Para declarar el motor **APTO PARA PRODUCCIÓN**:

```text
✓ Suite crítica completa PASS
✓ Suite de regresión PASS
✓ RLS validado
✓ Multitenancy validado
✓ Auditoría validada
✓ Concurrencia validada
✓ Backup/restore probado
✓ Migraciones reversibles o controladas
✓ Observabilidad disponible
✓ Errores de dominio controlados
✓ Pruebas de aceptación funcional aprobadas
```

---

# 60. Defectos bloqueantes

Los siguientes defectos bloquean producción:

```text
❌ distribución incorrecta
❌ pérdida de conservación
❌ cálculo matemático incorrecto
❌ acceso cross-tenant
❌ bypass de RLS
❌ modificación de presupuesto aprobado
❌ corrupción de versiones
❌ duplicación de cuotas
❌ pérdida de trazabilidad
❌ aprobación de presupuesto inválido
```

---

# 61. Evidencias requeridas

Cada ejecución de la suite debe conservar:

```text
commit
fecha
versión
migración
resultado
cantidad de pruebas
PASS
FAIL
errores
```

Para pruebas críticas:

```text
datos de entrada
resultado esperado
resultado obtenido
```

---

# 62. Matriz final

| Área | Pruebas | Bloqueante |
|---|---:|---|
| Estructura | 10+ | Sí |
| Cálculo | 10+ | Sí |
| Fondo | 4+ | Sí |
| Financiación | 5+ | Sí |
| Coeficientes | 3+ | Sí |
| Módulos | 3+ | Sí |
| Universo | 3+ | Sí |
| Conservación | 3+ | Sí |
| Redondeo | 3+ | Sí |
| Cuotas | 2+ | Sí |
| Versionamiento | 3+ | Sí |
| Estados | 6+ | Sí |
| RLS | 5+ | Sí |
| Roles | 3+ | Sí |
| Edge Functions | 8+ | Sí |
| Idempotencia | 1+ | Sí |
| Concurrencia | 2+ | Sí |
| Regresión | Completa | Sí |

---

# 63. PRERREQUISITOS

### PRERREQUISITO 15.1
E-13 — Implementación SQL.

### PRERREQUISITO 15.2
E-14 — Integración Supabase.

### PRERREQUISITO 15.3
Base de pruebas independiente.

### PRERREQUISITO 15.4
Datos maestros de prueba.

### PRERREQUISITO 15.5
Usuarios de prueba.

### PRERREQUISITO 15.6
Roles de prueba.

### PRERREQUISITO 15.7
Copropiedades de prueba.

### PRERREQUISITO 15.8
Configuración de coeficientes y módulos de prueba.

---

# 64. Decisiones de validación cerradas

### QA-15.01
Las pruebas matemáticas son obligatorias.

### QA-15.02
Las pruebas RLS son obligatorias.

### QA-15.03
Los casos negativos son obligatorios.

### QA-15.04
Las pruebas históricas son obligatorias.

### QA-15.05
Las pruebas de concurrencia son obligatorias antes de producción.

### QA-15.06
Las pruebas deben automatizarse.

### QA-15.07
Las pruebas deben ejecutarse en CI/CD.

### QA-15.08
Un resultado matemáticamente correcto pero inseguro es un FAIL.

### QA-15.09
Un sistema seguro pero matemáticamente incorrecto es un FAIL.

### QA-15.10
No se considera producción-ready mientras existan defectos críticos abiertos.

---

# 65. Resultado del E-15

Con E-15 queda definida la **suite integral de validación del Motor Presupuestal**:

```text
MODELO
   ↓
IMPLEMENTACIÓN
   ↓
INTEGRACIÓN
   ↓
PRUEBAS
   ├── Matemáticas
   ├── Financieras
   ├── Distribución
   ├── Seguridad
   ├── RLS
   ├── Versionamiento
   ├── Concurrencia
   └── Integración
   ↓
CRITERIOS DE ACEPTACIÓN
```

El motor ya no requiere otro entregable conceptual.

El paso siguiente, si se continúa, debe ser **ejecutar la suite sobre una base de prueba real y documentar los resultados**, no crear otra capa teórica.

---

# 66. Criterio de cierre

E-15 queda cerrado cuando:

```text
✓ Casos de prueba definidos.
✓ Casos positivos definidos.
✓ Casos negativos definidos.
✓ Propiedades matemáticas definidas.
✓ RLS definido para pruebas.
✓ Integración definida.
✓ Concurrencia definida.
✓ Idempotencia definida.
✓ CI/CD definido.
✓ Criterios de staging definidos.
✓ Criterios de producción definidos.
✓ Defectos bloqueantes definidos.
```

**E-15 completa la definición de validación del Motor Presupuestal.**
