# AEL V1 — AEL Security — Verification, Sandbox & Threat Model

> **Documento canónico consolidado.** La numeración histórica 1–74 se conserva sólo para trazabilidad. Las reglas transversales se definen una vez y se consumen por referencia.

## Fuentes absorbidas

```text
08 — Motor de liquidacion_AEL_V1_Security_Sandbox_Threat_Model 8.md
37 — Motor de liquidacion_AEL_V1_Verifier_Artifact_Security 37.md
42 — Motor de liquidacion_Security Model & Threat Model 42.md
60 — Motor de liquidacion_Verifier & Static Safety Validation 60.md
```

## 1. OBJETIVO

> **Origen:** Motor de liquidacion_AEL_V1_Security_Sandbox_Threat_Model 8.md

OBJETIVO

AEL se ejecutará dentro de una plataforma SaaS multitenant.

Por tanto, una regla debe considerarse:

```text
código no confiable
```

aunque haya sido creada por:

- un administrador;
- un desarrollador;
- un usuario interno;
- una importación;
- una API;
- otro sistema.

El sistema debe asumir que una regla puede ser:

```text
maliciosa
defectuosa
manipulada
excesivamente costosa
```

---

## 2. PRINCIPIO DE DEFENSA EN PROFUNDIDAD

> **Origen:** Motor de liquidacion_AEL_V1_Security_Sandbox_Threat_Model 8.md

PRINCIPIO DE DEFENSA EN PROFUNDIDAD

La seguridad no depende de una única capa.

Arquitectura:

```text
                    USER
                     │
                     ▼
                AUTHORIZATION
                     │
                     ▼
                  AEL SOURCE
                     │
                     ▼
                   PARSER
                     │
                     ▼
                  ANALYZER
                     │
                     ▼
               ARTIFACT BUILDER
                     │
                     ▼
               ARTIFACT VERIFIER
                     │
                     ▼
                  RUNTIME
                     │
             ┌───────┴────────┐
             ▼                ▼
        CAPABILITIES       LIMITS
             │                │
             └───────┬────────┘
                     ▼
                  PROVIDER
                     │
                     ▼
                  RLS / DB
```

---

## 3. FRONTERAS DE CONFIANZA

> **Origen:** Motor de liquidacion_AEL_V1_Security_Sandbox_Threat_Model 8.md

FRONTERAS DE CONFIANZA

AEL debe distinguir:

```text
Trusted
Untrusted
Semi-trusted
```

---

## 4. TRUSTED

> **Origen:** Motor de liquidacion_AEL_V1_Security_Sandbox_Threat_Model 8.md

TRUSTED

Componentes controlados por AQUILA:

```text
Runtime
Compiler
Verifier
Function Registry
Contract Registry
Provider Registry
Security Policy
```

---

## 5. UNTRUSTED

> **Origen:** Motor de liquidacion_AEL_V1_Security_Sandbox_Threat_Model 8.md

UNTRUSTED

Se consideran no confiables:

```text
Source AEL
Artifact recibido por API
ExecutionContext parcialmente externo
Provider response
Input del usuario
```

Incluso los Artifacts internos deben verificarse antes de ejecución.

---

## 6. SEMI-TRUSTED

> **Origen:** Motor de liquidacion_AEL_V1_Security_Sandbox_Threat_Model 8.md

SEMI-TRUSTED

Pueden existir:

```text
administradores
providers internos
functions registradas
plugins internos
```

pero deben estar limitados por contratos y políticas.

---

## 7. SECURITY BOUNDARY

> **Origen:** Motor de liquidacion_AEL_V1_Security_Sandbox_Threat_Model 8.md

SECURITY BOUNDARY

La frontera crítica es:

```text
AEL Runtime
        │
        ▼
Provider Interface
        │
        ▼
Infrastructure
```

AEL nunca atraviesa directamente esa frontera.

---

## 8. THREAT MODEL

> **Origen:** Motor de liquidacion_AEL_V1_Security_Sandbox_Threat_Model 8.md

THREAT MODEL

Las amenazas principales son:

```text
T1 — acceso no autorizado a datos
T2 — fuga entre tenants
T3 — ejecución arbitraria
T4 — agotamiento de recursos
T5 — manipulación de Artifact
T6 — Provider abuse
T7 — Function abuse
T8 — exfiltración de información
T9 — corrupción de contexto
T10 — bypass de autorización
T11 — ejecución infinita
T12 — escalamiento de privilegios
```

---

## 9. T1 — ACCESO NO AUTORIZADO

> **Origen:** Motor de liquidacion_AEL_V1_Security_Sandbox_Threat_Model 8.md

T1 — ACCESO NO AUTORIZADO

Ejemplo:

```ael
PROPERTY.OTHER_TENANT_DATA
```

La regla intenta obtener información que no pertenece a su contexto.

Defensas:

```text
Contract scope
Capability
ExecutionContext
Provider authorization
RLS
```

---

## 10. T2 — TENANT ESCAPE

> **Origen:** Motor de liquidacion_AEL_V1_Security_Sandbox_Threat_Model 8.md

T2 — TENANT ESCAPE

Una regla de:

```text
TENANT_A
```

intenta acceder a:

```text
TENANT_B
```

La defensa debe existir como mínimo en:

```text
Runtime
Provider
Database/RLS
```

---

## 11. T3 — EJECUCIÓN ARBITRARIA

> **Origen:** Motor de liquidacion_AEL_V1_Security_Sandbox_Threat_Model 8.md

T3 — EJECUCIÓN ARBITRARIA

Ataque conceptual:

```ael
EXEC("rm -rf ...")
```

Debe ser imposible porque AEL no tiene:

```text
EXEC
SHELL
EVAL
PROCESS
```

---

## 12. T4 — RESOURCE EXHAUSTION

> **Origen:** Motor de liquidacion_AEL_V1_Security_Sandbox_Threat_Model 8.md

T4 — RESOURCE EXHAUSTION

Ejemplos:

```ael
MIENTRAS VERDADERO
    ...
FIN
```

o estructuras que creen listas gigantes.

Defensas:

```text
maxInstructions
maxExecutionTime
maxStackDepth
maxListSize
maxStringLength
maxProviderCalls
```

---

## 13. T5 — ARTIFACT TAMPERING

> **Origen:** Motor de liquidacion_AEL_V1_Security_Sandbox_Threat_Model 8.md

T5 — ARTIFACT TAMPERING

Un atacante modifica:

```text
opcode
operand
contractId
functionId
jump
constant
```

El Verifier debe detectar:

```text
hash mismatch
```

y estructura inválida.

---

## 14. T6 — PROVIDER ABUSE

> **Origen:** Motor de liquidacion_AEL_V1_Security_Sandbox_Threat_Model 8.md

T6 — PROVIDER ABUSE

Una regla intenta producir miles de accesos:

```text
PROPERTY.*
```

Defensas:

```text
maxProviderCalls
Provider quotas
timeouts
capabilities
```

---

## 15. T7 — FUNCTION ABUSE

> **Origen:** Motor de liquidacion_AEL_V1_Security_Sandbox_Threat_Model 8.md

T7 — FUNCTION ABUSE

Una Function costosa puede consumir muchos recursos.

Debe existir:

```text
Function metadata
cost policy
capability
timeout
```

---

## 16. T8 — EXFILTRACIÓN

> **Origen:** Motor de liquidacion_AEL_V1_Security_Sandbox_Threat_Model 8.md

T8 — EXFILTRACIÓN

Una regla no debe poder enviar datos a:

```text
HTTP endpoint
webhook
filesystem
external process
```

porque V1 no expone dichas capacidades.

---

## 17. T9 — CONTEXT CORRUPTION

> **Origen:** Motor de liquidacion_AEL_V1_Security_Sandbox_Threat_Model 8.md

T9 — CONTEXT CORRUPTION

Una regla intenta cambiar:

```text
tenantId
userId
permissions
clock
limits
```

El ExecutionContext es inmutable.

---

## 18. T10 — AUTHORIZATION BYPASS

> **Origen:** Motor de liquidacion_AEL_V1_Security_Sandbox_Threat_Model 8.md

T10 — AUTHORIZATION BYPASS

No debe ser posible:

```text
usuario sin permiso
 ↓
ejecuta regla
 ↓
regla obtiene capability privilegiada
```

Las capabilities deben ser concedidas externamente.

---

## 19. T11 — INFINITE LOOP

> **Origen:** Motor de liquidacion_AEL_V1_Security_Sandbox_Threat_Model 8.md

T11 — INFINITE LOOP

Aunque:

```text
MIENTRAS
```

exista en la gramática, Runtime siempre limita:

```text
instructions
time
```

---

## 20. T12 — PRIVILEGE ESCALATION

> **Origen:** Motor de liquidacion_AEL_V1_Security_Sandbox_Threat_Model 8.md

T12 — PRIVILEGE ESCALATION

Una regla no puede:

```text
crear capability
registrar Provider
registrar Function
modificar Contract
modificar RLS
```

---

## 21. SANDBOX

> **Origen:** Motor de liquidacion_AEL_V1_Security_Sandbox_Threat_Model 8.md

SANDBOX

El sandbox de AEL es principalmente:

```text
logical sandbox
```

basado en:

```text
Instruction Set
Capabilities
Providers
Limits
```

No depender únicamente de un sandbox de JavaScript.

---

## 22. NO CONFIAR EN JAVASCRIPT SANDBOX

> **Origen:** Motor de liquidacion_AEL_V1_Security_Sandbox_Threat_Model 8.md

NO CONFIAR EN JAVASCRIPT SANDBOX

No considerar suficiente:

```text
vm.runInNewContext()
```

o mecanismos equivalentes.

La seguridad debe provenir del diseño del Runtime.

---

## 23. PROCESS ISOLATION

> **Origen:** Motor de liquidacion_AEL_V1_Security_Sandbox_Threat_Model 8.md

PROCESS ISOLATION

Para cargas de riesgo elevado, el Runtime puede ejecutarse en:

```text
worker
container
isolated process
```

según la infraestructura.

Esto es una capa adicional.

---

## 24. DEFAULT EXECUTION MODEL

> **Origen:** Motor de liquidacion_AEL_V1_Security_Sandbox_Threat_Model 8.md

DEFAULT EXECUTION MODEL

La implementación inicial puede ejecutar AEL dentro de un proceso controlado siempre que:

```text
no exista eval
no exista acceso arbitrario a Node APIs
```

y el Runtime exponga únicamente sus APIs internas.

---

## 25. HIGH RISK MODE

> **Origen:** Motor de liquidacion_AEL_V1_Security_Sandbox_Threat_Model 8.md

HIGH RISK MODE

Para reglas de alto consumo o fuentes no confiables:

```text
isolated worker
```

puede utilizar:

```text
CPU limit
memory limit
execution timeout
network disabled
filesystem restricted
```

---

## 26. NETWORK POLICY

> **Origen:** Motor de liquidacion_AEL_V1_Security_Sandbox_Threat_Model 8.md

NETWORK POLICY

El Runtime AEL V1 no necesita acceso directo a Internet.

Por defecto:

```text
NETWORK = DENY
```

---

## 27. FILESYSTEM POLICY

> **Origen:** Motor de liquidacion_AEL_V1_Security_Sandbox_Threat_Model 8.md

FILESYSTEM POLICY

Por defecto:

```text
FILESYSTEM = DENY
```

AEL no puede:

```text
read
write
delete
list
```

archivos del sistema.

---

## 28. PROCESS POLICY

> **Origen:** Motor de liquidacion_AEL_V1_Security_Sandbox_Threat_Model 8.md

PROCESS POLICY

Por defecto:

```text
PROCESS = DENY
```

No ejecutar procesos externos.

---

## 29. ENVIRONMENT VARIABLES

> **Origen:** Motor de liquidacion_AEL_V1_Security_Sandbox_Threat_Model 8.md

ENVIRONMENT VARIABLES

AEL no puede leer:

```text
process.env
```

ni secretos de entorno.

---

## 30. SECRETS

> **Origen:** Motor de liquidacion_AEL_V1_Security_Sandbox_Threat_Model 8.md

SECRETS

Nunca exponer a AEL:

```text
database passwords
API keys
JWT secrets
service credentials
encryption keys
```

---

## 31. LOGGING SECURITY

> **Origen:** Motor de liquidacion_AEL_V1_Security_Sandbox_Threat_Model 8.md

LOGGING SECURITY

No registrar automáticamente:

```text
tokens
passwords
credentials
secrets
```

en traces o errores.

---

## 32. ERROR SANITIZATION

> **Origen:** Motor de liquidacion_AEL_V1_Security_Sandbox_Threat_Model 8.md

ERROR SANITIZATION

Error interno:

```text
Postgres connection failed at /srv/app/...
```

No debe convertirse en respuesta pública con ese detalle.

Debe producir algo como:

```text
AEL-PROVIDER-001
No fue posible resolver el dato requerido.
```

---

## 33. STACK TRACE

> **Origen:** Motor de liquidacion_AEL_V1_Security_Sandbox_Threat_Model 8.md

STACK TRACE

Los stack traces técnicos sólo deben estar disponibles para:

```text
observabilidad interna
debug autorizado
```

No para usuarios finales por defecto.

---

## 34. SOURCE VISIBILITY

> **Origen:** Motor de liquidacion_AEL_V1_Security_Sandbox_Threat_Model 8.md

SOURCE VISIBILITY

El Source de una regla puede contener lógica de negocio sensible.

Por tanto:

```text
TRACE
LOG
AUDIT
ERROR
```

no deben exponer Source completo sin autorización.

---

## 35. SOURCE MAP SECURITY

> **Origen:** Motor de liquidacion_AEL_V1_Security_Sandbox_Threat_Model 8.md

SOURCE MAP SECURITY

El Source Map debe tener control de acceso.

No asumir que porque existe:

```text
Artifact
```

todos pueden recuperar:

```text
Source
```

---

## 36. ARTIFACT HASH

> **Origen:** Motor de liquidacion_AEL_V1_Security_Sandbox_Threat_Model 8.md

ARTIFACT HASH

El Artifact debe incorporar mecanismos de integridad.

Conceptualmente:

```text
artifactHash
```

---

## 37. HASH VS FIRMA

> **Origen:** Motor de liquidacion_AEL_V1_Security_Sandbox_Threat_Model 8.md

HASH VS FIRMA

El hash detecta:

```text
modificación accidental
```

Una firma digital puede detectar además:

```text
origen/autenticidad
```

V1 puede soportar:

```text
hash obligatorio
firma opcional según deployment
```

---

## 38. ARTIFACT SIGNING

> **Origen:** Motor de liquidacion_AEL_V1_Security_Sandbox_Threat_Model 8.md

ARTIFACT SIGNING

Para producción se recomienda:

```text
Artifact
 ↓
Hash
 ↓
Signature
 ↓
Publish
```

El Runtime puede exigir firma en instalaciones de alta seguridad.

---

## 39. KEY MANAGEMENT

> **Origen:** Motor de liquidacion_AEL_V1_Security_Sandbox_Threat_Model 8.md

KEY MANAGEMENT

Las claves de firma no deben estar dentro del Artifact.

Deben residir en:

```text
KMS
secret manager
secure deployment infrastructure
```

---

## 40. REPLAY

> **Origen:** Motor de liquidacion_AEL_V1_Security_Sandbox_Threat_Model 8.md

REPLAY

Un Artifact válido puede ser ejecutado múltiples veces.

Esto es permitido.

Pero las políticas de negocio pueden exigir:

```text
executionId
idempotencyKey
```

para operaciones futuras con efectos.

---

## 41. AEL V1 SIN SIDE EFFECTS

> **Origen:** Motor de liquidacion_AEL_V1_Security_Sandbox_Threat_Model 8.md

AEL V1 SIN SIDE EFFECTS

El modelo V1 debe mantener:

```text
Rule
→ read
→ calculate
→ return
```

No:

```text
Rule
→ modify database
```

---

## 42. BENEFICIO

> **Origen:** Motor de liquidacion_AEL_V1_Security_Sandbox_Threat_Model 8.md

BENEFICIO

Esto reduce drásticamente:

```text
transaction complexity
rollback complexity
replay risk
authorization complexity
audit complexity
```

---

## 43. INPUT VALIDATION

> **Origen:** Motor de liquidacion_AEL_V1_Security_Sandbox_Threat_Model 8.md

INPUT VALIDATION

Los valores de entrada externos deben validarse antes de ingresar al Runtime.

Ejemplo:

```text
propertyId
periodId
tenantId
```

---

## 44. CONTEXT VALIDATION

> **Origen:** Motor de liquidacion_AEL_V1_Security_Sandbox_Threat_Model 8.md

CONTEXT VALIDATION

El Runtime debe verificar:

```text
tenantId presente
executionId presente
limits válidos
capabilities válidas
clock válido
```

antes de comenzar.

---

## 45. CONTEXT IMMUTABILITY

> **Origen:** Motor de liquidacion_AEL_V1_Security_Sandbox_Threat_Model 8.md

CONTEXT IMMUTABILITY

El Context debe exponerse como:

```text
readonly
```

semánticamente.

---

## 46. USER ID

> **Origen:** Motor de liquidacion_AEL_V1_Security_Sandbox_Threat_Model 8.md

USER ID

AEL puede recibir un actor identificado para auditoría.

Pero una regla no puede cambiar:

```text
actorId
```

---

## 47. ROLE INFORMATION

> **Origen:** Motor de liquidacion_AEL_V1_Security_Sandbox_Threat_Model 8.md

ROLE INFORMATION

No es recomendable exponer directamente todos los roles al Source.

Una regla debe trabajar con capabilities y Contracts.

---

## 48. AUTHORIZATION LAYERS

> **Origen:** Motor de liquidacion_AEL_V1_Security_Sandbox_Threat_Model 8.md

AUTHORIZATION LAYERS

Modelo:

```text
User authorization
        ↓
Rule authorization
        ↓
Capability authorization
        ↓
Contract authorization
        ↓
Provider authorization
        ↓
RLS
```

---

## 49. CAPABILITY ESCALATION

> **Origen:** Motor de liquidacion_AEL_V1_Security_Sandbox_Threat_Model 8.md

CAPABILITY ESCALATION

AEL no puede ejecutar:

```text
GRANT
```

ni modificar su propio conjunto de capabilities.

---

## 50. CONTRACT ESCALATION

> **Origen:** Motor de liquidacion_AEL_V1_Security_Sandbox_Threat_Model 8.md

CONTRACT ESCALATION

Una regla no puede crear:

```text
LOAD_CONTRACT arbitrary
```

durante ejecución.

Todos los Contracts deben estar declarados en Artifact.

---

## 51. DYNAMIC DEPENDENCY BLOCK

> **Origen:** Motor de liquidacion_AEL_V1_Security_Sandbox_Threat_Model 8.md

DYNAMIC DEPENDENCY BLOCK

No permitir:

```text
contractName = "PROPERTY." + input
LOAD_CONTRACT contractName
```

Los Contracts se resuelven estáticamente durante compilación.

---

## 52. DYNAMIC FUNCTION BLOCK

> **Origen:** Motor de liquidacion_AEL_V1_Security_Sandbox_Threat_Model 8.md

DYNAMIC FUNCTION BLOCK

No permitir:

```text
functionName = input
CALL functionName
```

Las Functions deben quedar resueltas en Artifact.

---

## 53. STATIC DEPENDENCY BENEFIT

> **Origen:** Motor de liquidacion_AEL_V1_Security_Sandbox_Threat_Model 8.md

STATIC DEPENDENCY BENEFIT

Esto permite saber antes de ejecutar:

```text
qué puede hacer una regla
```

---

## 54. ARTIFACT ALLOWLIST

> **Origen:** Motor de liquidacion_AEL_V1_Security_Sandbox_Threat_Model 8.md

ARTIFACT ALLOWLIST

El Runtime puede tratar el Artifact como una allowlist de capacidades:

```text
Contracts
Functions
Capabilities
Opcodes
```

Todo lo que no esté incluido se considera prohibido.

---

## 55. OPCODE ALLOWLIST

> **Origen:** Motor de liquidacion_AEL_V1_Security_Sandbox_Threat_Model 8.md

OPCODE ALLOWLIST

El Runtime V1 sólo acepta:

```text
PUSH_CONSTANT
LOAD_LOCAL
STORE_LOCAL
LOAD_CONTRACT
CALL_FUNCTION
ADD
SUBTRACT
MULTIPLY
DIVIDE
NEGATE
EQUAL
NOT_EQUAL
GREATER_THAN
GREATER_EQUAL
LESS_THAN
LESS_EQUAL
AND
OR
NOT
JUMP
JUMP_IF_FALSE
MAKE_LIST
RETURN
```

---

## 56. UNKNOWN OPCODE

> **Origen:** Motor de liquidacion_AEL_V1_Security_Sandbox_Threat_Model 8.md

UNKNOWN OPCODE

Cualquier opcode fuera del catálogo:

```text
AEL-SECURITY-OPCODE-001
```

y el Artifact debe ser rechazado.

---

## 57. OPERAND VALIDATION

> **Origen:** Motor de liquidacion_AEL_V1_Security_Sandbox_Threat_Model 8.md

OPERAND VALIDATION

Cada opcode tiene operandos permitidos.

Ejemplo:

```text
LOAD_LOCAL index
```

debe tener:

```text
integer >= 0
```

---

## 58. JUMP VALIDATION

> **Origen:** Motor de liquidacion_AEL_V1_Security_Sandbox_Threat_Model 8.md

JUMP VALIDATION

Los targets deben apuntar a instrucciones válidas.

No:

```text
byte intermedio
```

ni:

```text
posición fuera del Artifact
```

---

## 59. CONSTANT VALIDATION

> **Origen:** Motor de liquidacion_AEL_V1_Security_Sandbox_Threat_Model 8.md

CONSTANT VALIDATION

Un índice de constant pool debe existir.

No aceptar:

```text
constant[999999]
```

si no existe.

---

## 60. FUNCTION VALIDATION

> **Origen:** Motor de liquidacion_AEL_V1_Security_Sandbox_Threat_Model 8.md

FUNCTION VALIDATION

Un Function ID debe estar registrado y permitido.

---

## 61. CONTRACT VALIDATION

> **Origen:** Motor de liquidacion_AEL_V1_Security_Sandbox_Threat_Model 8.md

CONTRACT VALIDATION

Un Contract ID debe:

```text
existir
estar versionado
estar permitido
tener capability compatible
```

---

## 62. RESOURCE ACCOUNTING

> **Origen:** Motor de liquidacion_AEL_V1_Security_Sandbox_Threat_Model 8.md

RESOURCE ACCOUNTING

Cada ejecución debe contabilizar:

```text
instructions
stackDepth
providerCalls
functionCalls
listsCreated
stringsCreated
duration
```

---

## 63. COST MODEL

> **Origen:** Motor de liquidacion_AEL_V1_Security_Sandbox_Threat_Model 8.md

COST MODEL

V1 no necesita un sistema sofisticado de gas.

Debe existir al menos:

```text
instruction count
time limit
provider count
memory/list limits
```

---

## 64. FUTURO GAS MODEL

> **Origen:** Motor de liquidacion_AEL_V1_Security_Sandbox_Threat_Model 8.md

FUTURO GAS MODEL

Una versión futura puede incorporar:

```text
executionCost
```

si la complejidad de las reglas lo justifica.

No introducirlo en V1 sin necesidad real.

---

## 65. DOS TIPOS DE LÍMITES

> **Origen:** Motor de liquidacion_AEL_V1_Security_Sandbox_Threat_Model 8.md

DOS TIPOS DE LÍMITES

## Hard limits

No pueden superarse.

```text
maxInstructions
maxExecutionTime
maxStackDepth
```

## Soft limits

Generan observabilidad o warning.

```text
providerCalls
traceEntries
```

---

## 66. TIMEOUT

> **Origen:** Motor de liquidacion_AEL_V1_Security_Sandbox_Threat_Model 8.md

TIMEOUT

El timeout debe detener la ejecución de forma segura.

No simplemente marcar:

```text
timeout
```

y dejar la ejecución corriendo.

---

## 67. CANCELLATION PROPAGATION

> **Origen:** Motor de liquidacion_AEL_V1_Security_Sandbox_Threat_Model 8.md

CANCELLATION PROPAGATION

Si un Provider está ejecutando una operación:

```text
Runtime cancellation
 ↓
Provider cancellation
```

cuando la infraestructura lo permita.

---

## 68. PROVIDER ISOLATION

> **Origen:** Motor de liquidacion_AEL_V1_Security_Sandbox_Threat_Model 8.md

PROVIDER ISOLATION

Un Provider debe tener sus propios límites.

Ejemplo:

```text
Provider timeout
Query timeout
Result size limit
```

---

## 69. RESULT SIZE LIMIT

> **Origen:** Motor de liquidacion_AEL_V1_Security_Sandbox_Threat_Model 8.md

RESULT SIZE LIMIT

Un Provider no debe devolver un resultado arbitrariamente grande.

Ejemplo:

```text
10 MB
100 MB
```

según la política de infraestructura.

---

## 70. NO RAW ROWSETS

> **Origen:** Motor de liquidacion_AEL_V1_Security_Sandbox_Threat_Model 8.md

NO RAW ROWSETS

AEL no debe recibir:

```text
10,000 database rows
```

para luego procesarlas sin límite.

Los Contracts deben ser diseñados para devolver el dato mínimo necesario.

---

## 71. N+1 PROTECTION

> **Origen:** Motor de liquidacion_AEL_V1_Security_Sandbox_Threat_Model 8.md

N+1 PROTECTION

Una regla no debe provocar inadvertidamente:

```text
1 provider call
+
N provider calls
```

sin control.

El límite de Provider Calls ayuda, pero también debe existir diseño adecuado de Contracts.

---

## 72. AGGREGATE CONTRACTS

> **Origen:** Motor de liquidacion_AEL_V1_Security_Sandbox_Threat_Model 8.md

AGGREGATE CONTRACTS

Cuando sea posible, preferir:

```text
OWNER.COUNT
```

sobre:

```text
OWNER.LIST
```

para una regla que sólo necesita contar.

---

## 73. DATA MINIMIZATION

> **Origen:** Motor de liquidacion_AEL_V1_Security_Sandbox_Threat_Model 8.md

DATA MINIMIZATION

Principio:

```text
Need to know
```

La regla recibe únicamente lo necesario para calcular.

---

## 74. PRIVACY

> **Origen:** Motor de liquidacion_AEL_V1_Security_Sandbox_Threat_Model 8.md

PRIVACY

La arquitectura de AEL no debe convertir el lenguaje en una vía indirecta de acceso masivo a información personal.

---

## 75. AUDIT

> **Origen:** Motor de liquidacion_AEL_V1_Security_Sandbox_Threat_Model 8.md

AUDIT

Las ejecuciones críticas deben registrar:

```text
executionId
tenantId
ruleId
ruleVersion
artifactHash
runtimeVersion
status
```

---

## 76. SECURITY EVENTS

> **Origen:** Motor de liquidacion_AEL_V1_Security_Sandbox_Threat_Model 8.md

SECURITY EVENTS

Eventos relevantes:

```text
CAPABILITY_DENIED
CONTRACT_DENIED
TENANT_ACCESS_DENIED
ARTIFACT_INTEGRITY_FAILURE
INVALID_OPCODE
RESOURCE_LIMIT
PROVIDER_TIMEOUT
```

---

## 77. SECURITY EVENT CORRELATION

> **Origen:** Motor de liquidacion_AEL_V1_Security_Sandbox_Threat_Model 8.md

SECURITY EVENT CORRELATION

Todos los eventos deben poder asociarse con:

```text
executionId
```

cuando exista.

---

## 78. SECURITY LOG RETENTION

> **Origen:** Motor de liquidacion_AEL_V1_Security_Sandbox_Threat_Model 8.md

SECURITY LOG RETENTION

La retención debe definirse según:

```text
auditoría
regulación
privacidad
costos
```

No almacenar indefinidamente por defecto.

---

## 79. TENANT DATA IN LOGS

> **Origen:** Motor de liquidacion_AEL_V1_Security_Sandbox_Threat_Model 8.md

TENANT DATA IN LOGS

No incluir automáticamente:

```text
tenant business data
```

en logs.

Registrar identificadores y metadatos mínimos.

---

## 80. DEBUG MODE

> **Origen:** Motor de liquidacion_AEL_V1_Security_Sandbox_Threat_Model 8.md

DEBUG MODE

Debug debe ser una capacidad privilegiada.

No habilitar:

```text
TRACE
```

para cualquier usuario.

---

## 81. PRODUCTION DEBUG

> **Origen:** Motor de liquidacion_AEL_V1_Security_Sandbox_Threat_Model 8.md

PRODUCTION DEBUG

En producción:

```text
debug = false
```

por defecto.

Cuando se habilite debe existir:

```text
authorization
audit
time limit
```

---

## 82. SOURCE ACCESS

> **Origen:** Motor de liquidacion_AEL_V1_Security_Sandbox_Threat_Model 8.md

SOURCE ACCESS

El acceso al Source debe estar separado del acceso al Artifact.

Esto permite:

```text
ejecutar
```

sin necesariamente:

```text
ver código
```

---

## 83. RULE VERSION SECURITY

> **Origen:** Motor de liquidacion_AEL_V1_Security_Sandbox_Threat_Model 8.md

RULE VERSION SECURITY

Una versión publicada es inmutable.

No modificar:

```text
RuleVersion
```

en sitio.

Crear:

```text
new RuleVersion
```

---

## 84. ROLLBACK

> **Origen:** Motor de liquidacion_AEL_V1_Security_Sandbox_Threat_Model 8.md

ROLLBACK

Rollback significa seleccionar una versión anterior:

```text
v3
↓
v2
```

no modificar v3.

---

## 85. ARTIFACT IMMUTABILITY

> **Origen:** Motor de liquidacion_AEL_V1_Security_Sandbox_Threat_Model 8.md

ARTIFACT IMMUTABILITY

Una vez publicado:

```text
Artifact
```

es inmutable.

Cualquier modificación produce un nuevo Artifact.

---

## 86. DEPENDENCY IMMUTABILITY

> **Origen:** Motor de liquidacion_AEL_V1_Security_Sandbox_Threat_Model 8.md

DEPENDENCY IMMUTABILITY

Una versión publicada de Rule conserva:

```text
Contract versions
Function versions
```

No resolver dependencias dinámicamente al ejecutar.

---

## 87. SUPPLY CHAIN SECURITY

> **Origen:** Motor de liquidacion_AEL_V1_Security_Sandbox_Threat_Model 8.md

SUPPLY CHAIN SECURITY

Los componentes críticos deben versionarse:

```text
Runtime
Compiler
Functions
Contracts
Providers
```

---

## 88. TRUSTED REGISTRY

> **Origen:** Motor de liquidacion_AEL_V1_Security_Sandbox_Threat_Model 8.md

TRUSTED REGISTRY

Production Runtime sólo debe aceptar:

```text
trusted Artifact
```

según política de deployment.

---

## 89. SIGNED ARTIFACT POLICY

> **Origen:** Motor de liquidacion_AEL_V1_Security_Sandbox_Threat_Model 8.md

SIGNED ARTIFACT POLICY

Deployment puede exigir:

```text
valid signature
valid hash
supported compiler version
supported runtime version
```

---

## 90. RUNTIME COMPATIBILITY

> **Origen:** Motor de liquidacion_AEL_V1_Security_Sandbox_Threat_Model 8.md

RUNTIME COMPATIBILITY

El Artifact debe declarar:

```text
minimumRuntimeVersion
```

y, cuando sea necesario:

```text
maximumRuntimeVersion
```

---

## 91. VERSION INCOMPATIBLE

> **Origen:** Motor de liquidacion_AEL_V1_Security_Sandbox_Threat_Model 8.md

VERSION INCOMPATIBLE

Si el Runtime no soporta el Artifact:

```text
AEL-ARTIFACT-VERSION-001
```

No intentar ejecutar parcialmente.

---

## 92. FORWARD COMPATIBILITY

> **Origen:** Motor de liquidacion_AEL_V1_Security_Sandbox_Threat_Model 8.md

FORWARD COMPATIBILITY

Un Runtime viejo no debe ejecutar automáticamente un Artifact de una versión futura.

---

## 93. BACKWARD COMPATIBILITY

> **Origen:** Motor de liquidacion_AEL_V1_Security_Sandbox_Threat_Model 8.md

BACKWARD COMPATIBILITY

Un Runtime nuevo puede ejecutar Artifacts antiguos sólo si la política declara compatibilidad.

---

## 94. SECURITY PATCH

> **Origen:** Motor de liquidacion_AEL_V1_Security_Sandbox_Threat_Model 8.md

SECURITY PATCH

Una vulnerabilidad del Runtime puede requerir:

```text
minimumRuntimeVersion
```

para impedir ejecutar Artifacts bajo una versión vulnerable.

---

## 95. DEPENDENCY REVOCATION

> **Origen:** Motor de liquidacion_AEL_V1_Security_Sandbox_Threat_Model 8.md

DEPENDENCY REVOCATION

Si una Function o Provider tiene una vulnerabilidad crítica, puede marcarse:

```text
REVOKED
```

Los Artifacts que dependan de ella deben quedar sujetos a una política de bloqueo.

---

## 96. REVOCATION VS DEPRECATION

> **Origen:** Motor de liquidacion_AEL_V1_Security_Sandbox_Threat_Model 8.md

REVOCATION VS DEPRECATION

```text
DEPRECATED
```

significa:

```text
no usar para nuevos Artifacts
```

```text
REVOKED
```

significa:

```text
no ejecutar
```

cuando la política de seguridad lo determine.

---

## 97. EMERGENCY BLOCK

> **Origen:** Motor de liquidacion_AEL_V1_Security_Sandbox_Threat_Model 8.md

EMERGENCY BLOCK

La plataforma debe poder bloquear:

```text
RuleVersion
ArtifactHash
FunctionVersion
ContractVersion
ProviderVersion
```

sin modificar el Source.

---

## 98. SECURITY POLICY

> **Origen:** Motor de liquidacion_AEL_V1_Security_Sandbox_Threat_Model 8.md

SECURITY POLICY

Debe existir un componente:

```text
SecurityPolicy
```

que determine:

```text
allowed opcodes
allowed capabilities
allowed functions
allowed contracts
runtime versions
artifact signature policy
resource limits
```

---

## 99. POLICY NO ES AEL

> **Origen:** Motor de liquidacion_AEL_V1_Security_Sandbox_Threat_Model 8.md

POLICY NO ES AEL

La SecurityPolicy pertenece a la plataforma.

La regla no puede modificarla.

---

## 100. TEST DE SEGURIDAD

> **Origen:** Motor de liquidacion_AEL_V1_Security_Sandbox_Threat_Model 8.md

TEST DE SEGURIDAD

Cada amenaza importante debe tener un test automatizado.

Mínimos:

```text
tenant escape
capability bypass
invalid opcode
artifact tampering
infinite loop
stack overflow
provider flood
secret access
filesystem access
network access
process execution
context mutation
```

---

## 101. PENETRATION TESTING

> **Origen:** Motor de liquidacion_AEL_V1_Security_Sandbox_Threat_Model 8.md

PENETRATION TESTING

Antes de producción se recomienda realizar pruebas específicas contra:

```text
Artifact parser
Verifier
Runtime
Providers
Capability enforcement
Multitenancy
```

---

## 102. FUZZING

> **Origen:** Motor de liquidacion_AEL_V1_Security_Sandbox_Threat_Model 8.md

FUZZING

El Parser y Verifier son buenos candidatos para fuzzing.

Objetivos:

```text
crash
infinite loop
stack overflow
unexpected acceptance
unexpected rejection
```

---

## 103. PROPERTY TESTING

> **Origen:** Motor de liquidacion_AEL_V1_Security_Sandbox_Threat_Model 8.md

PROPERTY TESTING

Propiedades deseables:

```text
invalid Artifact nunca ejecuta
```

```text
Artifact modificado nunca pasa integridad
```

```text
capability faltante nunca permite acceso
```

```text
tenant diferente nunca produce datos
```

---

## 104. SECURITY INVARIANTS

> **Origen:** Motor de liquidacion_AEL_V1_Security_Sandbox_Threat_Model 8.md

SECURITY INVARIANTS

Invariantes obligatorios:

```text
I1 — AEL no ejecuta código arbitrario.
I2 — AEL no accede directamente a infraestructura.
I3 — Capabilities no pueden aumentarse durante ejecución.
I4 — Context no puede modificarse.
I5 — Artifact debe verificarse.
I6 — Limits no pueden ser aumentados por la regla.
I7 — RLS permanece como defensa de datos.
I8 — Production Artifact es inmutable.
I9 — Dependencias quedan versionadas.
I10 — Network/Filesystem/Process están denegados por defecto.
```

---

## 105. SECURITY CHECKLIST DE PUBLICACIÓN

> **Origen:** Motor de liquidacion_AEL_V1_Security_Sandbox_Threat_Model 8.md

SECURITY CHECKLIST DE PUBLICACIÓN

Antes de publicar:

```text
[ ] Source compilado
[ ] Sin errores
[ ] Artifact generado
[ ] Artifact verificado
[ ] Hash válido
[ ] Firma válida si aplica
[ ] Dependencies versionadas
[ ] Capabilities derivadas
[ ] Security policy compatible
[ ] Runtime compatible
[ ] Limits configurados
[ ] Tenant scope validado
```

---

## 106. SECURITY CHECKLIST DE EJECUCIÓN

> **Origen:** Motor de liquidacion_AEL_V1_Security_Sandbox_Threat_Model 8.md

SECURITY CHECKLIST DE EJECUCIÓN

Antes de ejecutar:

```text
[ ] Artifact válido
[ ] Artifact permitido
[ ] Runtime compatible
[ ] Signature válida si aplica
[ ] Capabilities concedidas
[ ] Context válido
[ ] Tenant válido
[ ] Limits válidos
```

---

## 107. SECURITY CHECKLIST DURANTE EJECUCIÓN

> **Origen:** Motor de liquidacion_AEL_V1_Security_Sandbox_Threat_Model 8.md

SECURITY CHECKLIST DURANTE EJECUCIÓN

Durante:

```text
[ ] instruction limit
[ ] time limit
[ ] stack limit
[ ] provider limit
[ ] cancellation
[ ] capability enforcement
[ ] context immutability
```

---

## 108. SECURITY CHECKLIST POST-EJECUCIÓN

> **Origen:** Motor de liquidacion_AEL_V1_Security_Sandbox_Threat_Model 8.md

SECURITY CHECKLIST POST-EJECUCIÓN

Después:

```text
[ ] status registrado
[ ] errores sanitizados
[ ] métricas registradas
[ ] auditoría cuando aplique
[ ] trace sólo si autorizado
```

---

## 109. MODELO FINAL

> **Origen:** Motor de liquidacion_AEL_V1_Security_Sandbox_Threat_Model 8.md

MODELO FINAL

```text
                 TRUSTED PLATFORM
                        │
          ┌─────────────┴─────────────┐
          │                           │
       Compiler                  Security Policy
          │                           │
          ▼                           │
       Artifact ─────────────────────┘
          │
          ▼
       Verifier
          │
          ▼
   ┌───────────────────┐
   │      RUNTIME      │
   │                   │
   │ Limits            │
   │ Capabilities      │
   │ Context           │
   │ Instruction Set   │
   └─────────┬─────────┘
             │
             ▼
          PROVIDER
             │
             ▼
          RLS / DB
```

---

## 110. PRINCIPIO ARQUITECTÓNICO DEFINITIVO

> **Origen:** Motor de liquidacion_AEL_V1_Security_Sandbox_Threat_Model 8.md

PRINCIPIO ARQUITECTÓNICO DEFINITIVO

AEL V1 no debe intentar ser "seguro" porque confía en el usuario.

Debe ser seguro porque:

```text
el lenguaje es limitado
+
el Artifact es verificable
+
el Runtime es restringido
+
las capacidades son explícitas
+
los Providers están controlados
+
los recursos tienen límites
+
el contexto es inmutable
+
la infraestructura mantiene su propia seguridad
+
RLS protege los datos
```

La seguridad de AEL es, por diseño:

> **defensa en profundidad y mínimo privilegio.**

---

# FIN DEL DOCUMENTO 08

## AEL V1 — Modelo de Seguridad, Sandboxing y Threat Model

## 111. OBJETIVO

> **Origen:** Motor de liquidacion_AEL_V1_Verifier_Artifact_Security 37.md

OBJETIVO

Definir:

```text
Artifact Verification
Bytecode Verification
Stack Safety
Control Flow Safety
Type Safety
Dependency Validation
Integrity
Resource Limits
Trust Model
Tamper Detection
Runtime Defense
```

---

## 112. MODELO DE CONFIANZA

> **Origen:** Motor de liquidacion_AEL_V1_Verifier_Artifact_Security 37.md

MODELO DE CONFIANZA

El sistema debe asumir que un Artifact puede provenir de:

```text
Compiler confiable
storage
network
API
tenant
usuario
```

Por tanto:

```text
Artifact = untrusted input
```

hasta completar verification.

---

## 113. REGLA PRINCIPAL

> **Origen:** Motor de liquidacion_AEL_V1_Verifier_Artifact_Security 37.md

REGLA PRINCIPAL

Nunca:

```text
deserialize → execute
```

Debe ser:

```text
deserialize
    ↓
structural validation
    ↓
integrity validation
    ↓
semantic verification
    ↓
dependency validation
    ↓
resource validation
    ↓
execute
```

---

## 114. VERIFIER

> **Origen:** Motor de liquidacion_AEL_V1_Verifier_Artifact_Security 37.md

VERIFIER

Componente responsable:

```text
ArtifactVerifier
```

---

## 115. VERIFICATION RESULT

> **Origen:** Motor de liquidacion_AEL_V1_Verifier_Artifact_Security 37.md

VERIFICATION RESULT

```ts
type VerificationResult =
  | {
      valid: true
      metadata: VerifiedArtifactMetadata
    }
  | {
      valid: false
      errors: ArtifactVerificationError[]
    }
```

---

## 116. VERIFIER NO EJECUTA

> **Origen:** Motor de liquidacion_AEL_V1_Verifier_Artifact_Security 37.md

VERIFIER NO EJECUTA

Verifier nunca debe:

```text
consultar PostgreSQL
invocar Contract Provider
invocar Function Provider
ejecutar AEL
```

---

## 117. VERIFICATION PHASES

> **Origen:** Motor de liquidacion_AEL_V1_Verifier_Artifact_Security 37.md

VERIFICATION PHASES

Recomendación:

```text
1. Container validation
2. Header validation
3. Section validation
4. Integrity validation
5. Opcode validation
6. Index validation
7. Stack validation
8. Type validation
9. Control-flow validation
10. Dependency validation
11. Resource validation
12. Compatibility validation
```

---

## 118. CONTAINER VALIDATION

> **Origen:** Motor de liquidacion_AEL_V1_Verifier_Artifact_Security 37.md

CONTAINER VALIDATION

Comprobar:

```text
non-empty
valid encoding
valid container structure
```

---

## 119. MAX ARTIFACT SIZE

> **Origen:** Motor de liquidacion_AEL_V1_Verifier_Artifact_Security 37.md

MAX ARTIFACT SIZE

Rechazar Artifacts mayores que:

```text
maxArtifactSize
```

definido por RuntimePolicy.

---

## 120. HEADER VALIDATION

> **Origen:** Motor de liquidacion_AEL_V1_Verifier_Artifact_Security 37.md

HEADER VALIDATION

Validar:

```text
magic
formatVersion
flags
sectionCount
totalLength
```

---

## 121. MAGIC

> **Origen:** Motor de liquidacion_AEL_V1_Verifier_Artifact_Security 37.md

MAGIC

Debe coincidir con:

```text
AELA
```

o el valor definitivo del formato.

---

## 122. VERSION

> **Origen:** Motor de liquidacion_AEL_V1_Verifier_Artifact_Security 37.md

VERSION

Si:

```text
formatVersion
```

no es soportado:

```text
AEL-ARTIFACT-008
```

---

## 123. FLAGS

> **Origen:** Motor de liquidacion_AEL_V1_Verifier_Artifact_Security 37.md

FLAGS

Rechazar:

```text
unknown security-sensitive flags
```

cuando su interpretación no esté soportada.

---

## 124. SECTION VALIDATION

> **Origen:** Motor de liquidacion_AEL_V1_Verifier_Artifact_Security 37.md

SECTION VALIDATION

Cada sección debe tener:

```text
offset
length
type
```

válidos.

---

## 125. SECTION BOUNDS

> **Origen:** Motor de liquidacion_AEL_V1_Verifier_Artifact_Security 37.md

SECTION BOUNDS

Nunca permitir:

```text
offset + length > artifactLength
```

---

## 126. SECTION OVERLAP

> **Origen:** Motor de liquidacion_AEL_V1_Verifier_Artifact_Security 37.md

SECTION OVERLAP

Si el formato no permite overlap:

```text
overlapping sections = invalid
```

---

## 127. DUPLICATE SECTIONS

> **Origen:** Motor de liquidacion_AEL_V1_Verifier_Artifact_Security 37.md

DUPLICATE SECTIONS

No permitir múltiples secciones obligatorias del mismo tipo.

---

## 128. REQUIRED SECTIONS

> **Origen:** Motor de liquidacion_AEL_V1_Verifier_Artifact_Security 37.md

REQUIRED SECTIONS

V1 debe exigir:

```text
Header
Metadata
Instructions
Integrity
```

y las secciones de dependencias cuando existan referencias.

---

## 129. INTEGRITY

> **Origen:** Motor de liquidacion_AEL_V1_Verifier_Artifact_Security 37.md

INTEGRITY

Verificar:

```text
hash
```

antes de considerar confiable el contenido.

---

## 130. HASH

> **Origen:** Motor de liquidacion_AEL_V1_Verifier_Artifact_Security 37.md

HASH

Recomendación:

```text
SHA-256
```

---

## 131. HASH SCOPE

> **Origen:** Motor de liquidacion_AEL_V1_Verifier_Artifact_Security 37.md

HASH SCOPE

Hash debe cubrir:

```text
all protected artifact content
```

excepto el campo donde se almacena el propio hash.

---

## 132. HASH MISMATCH

> **Origen:** Motor de liquidacion_AEL_V1_Verifier_Artifact_Security 37.md

HASH MISMATCH

Debe producir:

```text
AEL-ARTIFACT-007
```

---

## 133. SIGNATURE

> **Origen:** Motor de liquidacion_AEL_V1_Verifier_Artifact_Security 37.md

SIGNATURE

Firma digital puede añadirse en una evolución.

---

## 134. V1 TRUST MODEL

> **Origen:** Motor de liquidacion_AEL_V1_Verifier_Artifact_Security 37.md

V1 TRUST MODEL

V1 puede confiar en:

```text
trusted deployment channel
+
SHA-256 integrity
```

pero no debe tratar hash como autenticación criptográfica de origen.

---

## 135. SIGNATURE FUTURE

> **Origen:** Motor de liquidacion_AEL_V1_Verifier_Artifact_Security 37.md

SIGNATURE FUTURE

Cuando exista firma:

```text
signature validation
```

debe ocurrir antes de ejecución.

---

## 136. DESERIALIZATION SAFETY

> **Origen:** Motor de liquidacion_AEL_V1_Verifier_Artifact_Security 37.md

DESERIALIZATION SAFETY

Deserializer debe tener límites para:

```text
counts
lengths
strings
nested metadata
```

---

## 137. NO UNBOUNDED ALLOCATION

> **Origen:** Motor de liquidacion_AEL_V1_Verifier_Artifact_Security 37.md

NO UNBOUNDED ALLOCATION

Un Artifact no puede provocar asignaciones de memoria arbitrarias mediante:

```text
declared count
declared length
```

---

## 138. CONSTANT POOL VALIDATION

> **Origen:** Motor de liquidacion_AEL_V1_Verifier_Artifact_Security 37.md

CONSTANT POOL VALIDATION

Validar:

```text
constant count
constant types
constant lengths
constant indexes
```

---

## 139. STRING LIMIT

> **Origen:** Motor de liquidacion_AEL_V1_Verifier_Artifact_Security 37.md

STRING LIMIT

Cada String constant debe respetar:

```text
maxStringLength
```

---

## 140. NUMBER VALIDATION

> **Origen:** Motor de liquidacion_AEL_V1_Verifier_Artifact_Security 37.md

NUMBER VALIDATION

Number constant debe ser:

```text
valid decimal
```

y respetar:

```text
maxPrecision
maxScale
```

---

## 141. MONEY CONSTANT

> **Origen:** Motor de liquidacion_AEL_V1_Verifier_Artifact_Security 37.md

MONEY CONSTANT

Debe validar:

```text
amount
currency
```

---

## 142. QUANTITY CONSTANT

> **Origen:** Motor de liquidacion_AEL_V1_Verifier_Artifact_Security 37.md

QUANTITY CONSTANT

Debe validar:

```text
amount
dimension
unit
```

---

## 143. TYPE TABLE

> **Origen:** Motor de liquidacion_AEL_V1_Verifier_Artifact_Security 37.md

TYPE TABLE

Todos los:

```text
typeId
```

deben existir.

---

## 144. TYPE VALIDATION

> **Origen:** Motor de liquidacion_AEL_V1_Verifier_Artifact_Security 37.md

TYPE VALIDATION

Verifier debe comprobar:

```text
well-formed AELType
```

---

## 145. RECURSIVE TYPE LIMIT

> **Origen:** Motor de liquidacion_AEL_V1_Verifier_Artifact_Security 37.md

RECURSIVE TYPE LIMIT

Evitar ciclos de tipos no soportados.

---

## 146. RECORD SCHEMA

> **Origen:** Motor de liquidacion_AEL_V1_Verifier_Artifact_Security 37.md

RECORD SCHEMA

Validar:

```text
field count
field names
field types
schema identity
```

---

## 147. DEPENDENCY TABLE

> **Origen:** Motor de liquidacion_AEL_V1_Verifier_Artifact_Security 37.md

DEPENDENCY TABLE

Validar:

```text
contract dependencies
function dependencies
```

---

## 148. DUPLICATE DEPENDENCIES

> **Origen:** Motor de liquidacion_AEL_V1_Verifier_Artifact_Security 37.md

DUPLICATE DEPENDENCIES

Puede deduplicarse durante compilation.

Verifier debe aceptar únicamente la representación canónica definida.

---

## 149. DEPENDENCY VERSION

> **Origen:** Motor de liquidacion_AEL_V1_Verifier_Artifact_Security 37.md

DEPENDENCY VERSION

Debe ser una versión concreta:

```text
1.0.0
```

No aceptar:

```text
latest
*
```

---

## 150. DEPENDENCY HASH

> **Origen:** Motor de liquidacion_AEL_V1_Verifier_Artifact_Security 37.md

DEPENDENCY HASH

Si Artifact contiene:

```text
definitionHash
```

debe compararse con Registry durante loading.

---

## 151. MISSING CONTRACT

> **Origen:** Motor de liquidacion_AEL_V1_Verifier_Artifact_Security 37.md

MISSING CONTRACT

Si Contract no existe:

```text
verification/loading failure
```

---

## 152. MISSING FUNCTION

> **Origen:** Motor de liquidacion_AEL_V1_Verifier_Artifact_Security 37.md

MISSING FUNCTION

Si Function no existe:

```text
verification/loading failure
```

---

## 153. INCOMPATIBLE PROVIDER

> **Origen:** Motor de liquidacion_AEL_V1_Verifier_Artifact_Security 37.md

INCOMPATIBLE PROVIDER

Si no existe Provider compatible:

```text
Artifact unavailable
```

---

## 154. CAPABILITY VALIDATION

> **Origen:** Motor de liquidacion_AEL_V1_Verifier_Artifact_Security 37.md

CAPABILITY VALIDATION

Las dependencies deben declarar capabilities compatibles con Registry.

---

## 155. NO HIDDEN CAPABILITY

> **Origen:** Motor de liquidacion_AEL_V1_Verifier_Artifact_Security 37.md

NO HIDDEN CAPABILITY

Artifact no puede solicitar una capability no declarada.

---

## 156. INSTRUCTION STREAM

> **Origen:** Motor de liquidacion_AEL_V1_Verifier_Artifact_Security 37.md

INSTRUCTION STREAM

Validar:

```text
instructionCount
instruction bytes
opcode encoding
operand lengths
```

---

## 157. OPCODE VALIDATION

> **Origen:** Motor de liquidacion_AEL_V1_Verifier_Artifact_Security 37.md

OPCODE VALIDATION

Todo opcode debe pertenecer al:

```text
supported opcode set
```

---

## 158. UNKNOWN OPCODE

> **Origen:** Motor de liquidacion_AEL_V1_Verifier_Artifact_Security 37.md

UNKNOWN OPCODE

Produce:

```text
AEL-ARTIFACT-002
```

---

## 159. OPERAND VALIDATION

> **Origen:** Motor de liquidacion_AEL_V1_Verifier_Artifact_Security 37.md

OPERAND VALIDATION

Cada opcode tiene un layout exacto.

Ejemplo:

```text
LOAD_LITERAL constantIndex
```

---

## 160. INVALID OPERAND

> **Origen:** Motor de liquidacion_AEL_V1_Verifier_Artifact_Security 37.md

INVALID OPERAND

Produce:

```text
AEL-ARTIFACT-003
```

---

## 161. INDEX VALIDATION

> **Origen:** Motor de liquidacion_AEL_V1_Verifier_Artifact_Security 37.md

INDEX VALIDATION

Verificar que:

```text
constantIndex
dependencyIndex
typeId
```

estén dentro de rango.

---

## 162. INVALID INDEX

> **Origen:** Motor de liquidacion_AEL_V1_Verifier_Artifact_Security 37.md

INVALID INDEX

Produce:

```text
AEL-ARTIFACT-004
```

---

## 163. CONTROL FLOW

> **Origen:** Motor de liquidacion_AEL_V1_Verifier_Artifact_Security 37.md

CONTROL FLOW

Identificar:

```text
basic blocks
entry point
jump targets
termination
```

---

## 164. ENTRY POINT

> **Origen:** Motor de liquidacion_AEL_V1_Verifier_Artifact_Security 37.md

ENTRY POINT

Debe apuntar a:

```text
valid instruction boundary
```

---

## 165. JUMP TARGET

> **Origen:** Motor de liquidacion_AEL_V1_Verifier_Artifact_Security 37.md

JUMP TARGET

Todo target debe ser:

```text
valid instruction boundary
```

---

## 166. NO JUMP INTO OPERAND

> **Origen:** Motor de liquidacion_AEL_V1_Verifier_Artifact_Security 37.md

NO JUMP INTO OPERAND

Nunca permitir saltar:

```text
a mitad de una instruction
```

---

## 167. NO JUMP OUTSIDE

> **Origen:** Motor de liquidacion_AEL_V1_Verifier_Artifact_Security 37.md

NO JUMP OUTSIDE

Target fuera del stream:

```text
invalid
```

---

## 168. STACK ANALYSIS

> **Origen:** Motor de liquidacion_AEL_V1_Verifier_Artifact_Security 37.md

STACK ANALYSIS

Verifier debe realizar análisis abstracto del stack.

---

## 169. STACK STATE

> **Origen:** Motor de liquidacion_AEL_V1_Verifier_Artifact_Security 37.md

STACK STATE

Conceptualmente:

```text
StackState {
  depth
  types[]
}
```

---

## 170. STACK ENTRY

> **Origen:** Motor de liquidacion_AEL_V1_Verifier_Artifact_Security 37.md

STACK ENTRY

Cada elemento debe tener:

```text
AELType
```

---

## 171. STACK UNDERFLOW

> **Origen:** Motor de liquidacion_AEL_V1_Verifier_Artifact_Security 37.md

STACK UNDERFLOW

Instruction que consume más elementos:

```text
invalid
```

---

## 172. STACK OVERFLOW

> **Origen:** Motor de liquidacion_AEL_V1_Verifier_Artifact_Security 37.md

STACK OVERFLOW

Si supera:

```text
maxStackDepth
```

rechazar.

---

## 173. STACK MERGE

> **Origen:** Motor de liquidacion_AEL_V1_Verifier_Artifact_Security 37.md

STACK MERGE

En un merge, los predecessors deben producir:

```text
same stack depth
```

---

## 174. STACK TYPE MERGE

> **Origen:** Motor de liquidacion_AEL_V1_Verifier_Artifact_Security 37.md

STACK TYPE MERGE

Los tipos en posiciones equivalentes deben ser:

```text
same
```

o compatibles según regla de Artifact.

---

## 175. INVALID MERGE

> **Origen:** Motor de liquidacion_AEL_V1_Verifier_Artifact_Security 37.md

INVALID MERGE

Produce:

```text
AEL-ARTIFACT-005
```

---

## 176. OPCODE STACK EFFECTS

> **Origen:** Motor de liquidacion_AEL_V1_Verifier_Artifact_Security 37.md

OPCODE STACK EFFECTS

Cada opcode debe tener una definición central:

```text
inputs
outputs
```

---

## 177. LOAD_LITERAL

> **Origen:** Motor de liquidacion_AEL_V1_Verifier_Artifact_Security 37.md

LOAD_LITERAL

```text
[] → [T]
```

---

## 178. LOAD_CONTRACT

> **Origen:** Motor de liquidacion_AEL_V1_Verifier_Artifact_Security 37.md

LOAD_CONTRACT

```text
[] → [ContractReturnType]
```

---

## 179. CALL_FUNCTION

> **Origen:** Motor de liquidacion_AEL_V1_Verifier_Artifact_Security 37.md

CALL_FUNCTION

```text
[arg1 ... argN] → [ReturnType]
```

---

## 180. ADD

> **Origen:** Motor de liquidacion_AEL_V1_Verifier_Artifact_Security 37.md

ADD

```text
[left, right] → [result]
```

---

## 181. JUMP

> **Origen:** Motor de liquidacion_AEL_V1_Verifier_Artifact_Security 37.md

JUMP

```text
stack unchanged
```

---

## 182. JUMP_IF_FALSE

> **Origen:** Motor de liquidacion_AEL_V1_Verifier_Artifact_Security 37.md

JUMP_IF_FALSE

```text
[Boolean] → []
```

---

## 183. RETURN

> **Origen:** Motor de liquidacion_AEL_V1_Verifier_Artifact_Security 37.md

RETURN

```text
[RuleReturnType] → termination
```

---

## 184. TYPE SAFETY

> **Origen:** Motor de liquidacion_AEL_V1_Verifier_Artifact_Security 37.md

TYPE SAFETY

Verifier debe comprobar que cada instruction recibe los tipos que espera.

---

## 185. ADD TYPE EXAMPLE

> **Origen:** Motor de liquidacion_AEL_V1_Verifier_Artifact_Security 37.md

ADD TYPE EXAMPLE

```text
Money<COP> + Money<COP>
```

válido.

---

## 186. ADD INVALID

> **Origen:** Motor de liquidacion_AEL_V1_Verifier_Artifact_Security 37.md

ADD INVALID

```text
Money<COP> + Quantity<M2>
```

inválido.

---

## 187. OPERATOR RULE SOURCE

> **Origen:** Motor de liquidacion_AEL_V1_Verifier_Artifact_Security 37.md

OPERATOR RULE SOURCE

Verifier debe utilizar las mismas:

```text
OperatorTypeRules
```

que Analyzer/Compiler.

---

## 188. NO DUPLICATED SEMANTICS

> **Origen:** Motor de liquidacion_AEL_V1_Verifier_Artifact_Security 37.md

NO DUPLICATED SEMANTICS

No crear una semántica diferente únicamente para Verifier.

---

## 189. FUNCTION TYPE VALIDATION

> **Origen:** Motor de liquidacion_AEL_V1_Verifier_Artifact_Security 37.md

FUNCTION TYPE VALIDATION

CALL_FUNCTION debe comprobar:

```text
argumentCount
parameter types
return type
```

---

## 190. CONTRACT TYPE VALIDATION

> **Origen:** Motor de liquidacion_AEL_V1_Verifier_Artifact_Security 37.md

CONTRACT TYPE VALIDATION

LOAD_CONTRACT debe conocer:

```text
declared return type
```

---

## 191. RETURN VALIDATION

> **Origen:** Motor de liquidacion_AEL_V1_Verifier_Artifact_Security 37.md

RETURN VALIDATION

RETURN debe producir:

```text
Rule declared return type
```

---

## 192. CONTROL FLOW TERMINATION

> **Origen:** Motor de liquidacion_AEL_V1_Verifier_Artifact_Security 37.md

CONTROL FLOW TERMINATION

Artifact debe garantizar:

```text
all reachable paths terminate
```

---

## 193. FALLTHROUGH

> **Origen:** Motor de liquidacion_AEL_V1_Verifier_Artifact_Security 37.md

FALLTHROUGH

No permitir terminar el instruction stream sin:

```text
RETURN
```

cuando la Rule requiere resultado.

---

## 194. UNREACHABLE BLOCKS

> **Origen:** Motor de liquidacion_AEL_V1_Verifier_Artifact_Security 37.md

UNREACHABLE BLOCKS

Pueden existir por razones de compilación, pero:

```text
malformed unreachable code
```

no debe utilizarse como mecanismo para evitar verification.

---

## 195. RECOMMENDATION

> **Origen:** Motor de liquidacion_AEL_V1_Verifier_Artifact_Security 37.md

RECOMMENDATION

Compiler no debe generar unreachable blocks innecesarios.

---

## 196. LOOP LIMIT

> **Origen:** Motor de liquidacion_AEL_V1_Verifier_Artifact_Security 37.md

LOOP LIMIT

V1 no permite loops generales.

Por tanto:

```text
control-flow graph
```

debe ser acíclico salvo estructuras internas permitidas explícitamente.

---

## 197. CYCLE DETECTION

> **Origen:** Motor de liquidacion_AEL_V1_Verifier_Artifact_Security 37.md

CYCLE DETECTION

Si aparece un cycle no permitido:

```text
AEL-CONTROL-004
```

---

## 198. RECURSION

> **Origen:** Motor de liquidacion_AEL_V1_Verifier_Artifact_Security 37.md

RECURSION

Artifact no puede representar:

```text
user function recursion
```

porque V1 no tiene user-defined functions.

---

## 199. RESOURCE ANALYSIS

> **Origen:** Motor de liquidacion_AEL_V1_Verifier_Artifact_Security 37.md

RESOURCE ANALYSIS

Verifier debe calcular o estimar:

```text
instructionCount
maxStackDepth
constantCount
dependencyCount
```

---

## 200. INSTRUCTION LIMIT

> **Origen:** Motor de liquidacion_AEL_V1_Verifier_Artifact_Security 37.md

INSTRUCTION LIMIT

Si:

```text
instructionCount > maxInstructions
```

rechazar.

---

## 201. CONSTANT LIMIT

> **Origen:** Motor de liquidacion_AEL_V1_Verifier_Artifact_Security 37.md

CONSTANT LIMIT

Si:

```text
constantCount > maxConstants
```

rechazar.

---

## 202. DEPENDENCY LIMIT

> **Origen:** Motor de liquidacion_AEL_V1_Verifier_Artifact_Security 37.md

DEPENDENCY LIMIT

Si:

```text
dependencyCount > maxDependencies
```

rechazar.

---

## 203. SOURCE MAP LIMIT

> **Origen:** Motor de liquidacion_AEL_V1_Verifier_Artifact_Security 37.md

SOURCE MAP LIMIT

Si metadata excede:

```text
maxSourceMapSize
```

rechazar o ignorar según policy.

---

## 204. STRING TOTAL LIMIT

> **Origen:** Motor de liquidacion_AEL_V1_Verifier_Artifact_Security 37.md

STRING TOTAL LIMIT

Puede existir:

```text
maxTotalStringBytes
```

---

## 205. MEMORY ESTIMATION

> **Origen:** Motor de liquidacion_AEL_V1_Verifier_Artifact_Security 37.md

MEMORY ESTIMATION

Verifier puede estimar:

```text
minimum execution memory
```

---

## 206. RUNTIME LIMITS

> **Origen:** Motor de liquidacion_AEL_V1_Verifier_Artifact_Security 37.md

RUNTIME LIMITS

Verifier no sustituye Runtime limits.

Runtime también mantiene:

```text
maxSteps
maxStackDepth
maxExecutionTime
```

---

## 207. DEFENSE IN DEPTH

> **Origen:** Motor de liquidacion_AEL_V1_Verifier_Artifact_Security 37.md

DEFENSE IN DEPTH

```text
Verifier
+
Runtime
```

ambos protegen invariants críticos.

---

## 208. ARTIFACT CACHE

> **Origen:** Motor de liquidacion_AEL_V1_Verifier_Artifact_Security 37.md

ARTIFACT CACHE

Verified Artifact puede cachearse mediante:

```text
artifactHash
```

---

## 209. CACHE TRUST

> **Origen:** Motor de liquidacion_AEL_V1_Verifier_Artifact_Security 37.md

CACHE TRUST

Sólo cachear:

```text
verified result
```

---

## 210. CACHE INVALIDATION

> **Origen:** Motor de liquidacion_AEL_V1_Verifier_Artifact_Security 37.md

CACHE INVALIDATION

Si cambia:

```text
language semantics
type rules
operator rules
```

el cache key debe cambiar.

---

## 211. VERIFICATION CONTEXT

> **Origen:** Motor de liquidacion_AEL_V1_Verifier_Artifact_Security 37.md

VERIFICATION CONTEXT

Verifier puede recibir:

```ts
interface VerificationContext {
  languageVersion: string
  artifactFormatVersion: string
  runtimeVersion: string
  limits: RuntimeLimits
}
```

---

## 212. REGISTRY CONTEXT

> **Origen:** Motor de liquidacion_AEL_V1_Verifier_Artifact_Security 37.md

REGISTRY CONTEXT

Para validar dependencies:

```text
ContractRegistry
FunctionRegistry
TypeRegistry
```

pueden proporcionar snapshots.

---

## 213. IMMUTABLE REGISTRIES

> **Origen:** Motor de liquidacion_AEL_V1_Verifier_Artifact_Security 37.md

IMMUTABLE REGISTRIES

Verification debe operar contra:

```text
immutable registry snapshots
```

---

## 214. PROVIDER VALIDATION

> **Origen:** Motor de liquidacion_AEL_V1_Verifier_Artifact_Security 37.md

PROVIDER VALIDATION

Provider existence puede verificarse fuera del Verifier puro, en una etapa:

```text
DependencyResolver
```

---

## 215. SEPARATION

> **Origen:** Motor de liquidacion_AEL_V1_Verifier_Artifact_Security 37.md

SEPARATION

```text
ArtifactVerifier
→ estructura y semántica del Artifact

DependencyResolver
→ disponibilidad real de dependencies

Runtime
→ ejecución
```

---

## 216. NO DATABASE ACCESS

> **Origen:** Motor de liquidacion_AEL_V1_Verifier_Artifact_Security 37.md

NO DATABASE ACCESS

ArtifactVerifier no debe consultar PostgreSQL.

---

## 217. NO NETWORK ACCESS

> **Origen:** Motor de liquidacion_AEL_V1_Verifier_Artifact_Security 37.md

NO NETWORK ACCESS

ArtifactVerifier no debe llamar APIs externas.

---

## 218. DETERMINISM

> **Origen:** Motor de liquidacion_AEL_V1_Verifier_Artifact_Security 37.md

DETERMINISM

Mismo Artifact + mismo VerificationContext:

```text
same verification result
```

---

## 219. ERROR MODEL

> **Origen:** Motor de liquidacion_AEL_V1_Verifier_Artifact_Security 37.md

ERROR MODEL

Los errores deben ser estructurados:

```ts
interface ArtifactVerificationError {
  code: string
  message: string
  section?: string
  instruction?: number
  sourceSpan?: SourceSpan
}
```

---

## 220. ERROR PRIORITY

> **Origen:** Motor de liquidacion_AEL_V1_Verifier_Artifact_Security 37.md

ERROR PRIORITY

Puede reportar múltiples errores, pero debe:

```text
deterministically order errors
```

---

## 221. ERROR ORDER

> **Origen:** Motor de liquidacion_AEL_V1_Verifier_Artifact_Security 37.md

ERROR ORDER

Recomendación:

```text
section
offset
instructionIndex
errorCode
```

---

## 222. NO SECRET LEAK

> **Origen:** Motor de liquidacion_AEL_V1_Verifier_Artifact_Security 37.md

NO SECRET LEAK

Verification errors no deben revelar:

```text
database credentials
internal tokens
```

---

## 223. TAMPER DETECTION

> **Origen:** Motor de liquidacion_AEL_V1_Verifier_Artifact_Security 37.md

TAMPER DETECTION

Cualquier modificación protegida debe invalidar:

```text
integrity hash
```

---

## 224. HASH COLLISION POLICY

> **Origen:** Motor de liquidacion_AEL_V1_Verifier_Artifact_Security 37.md

HASH COLLISION POLICY

SHA-256 es suficiente para V1 bajo modelo operativo normal.

---

## 225. AUTHENTICITY

> **Origen:** Motor de liquidacion_AEL_V1_Verifier_Artifact_Security 37.md

AUTHENTICITY

Hash no demuestra:

```text
quién produjo Artifact
```

---

## 226. FUTURE SIGNATURE

> **Origen:** Motor de liquidacion_AEL_V1_Verifier_Artifact_Security 37.md

FUTURE SIGNATURE

La firma digital deberá demostrar:

```text
origin
integrity
```

según trust store.

---

## 227. TRUSTED COMPILER

> **Origen:** Motor de liquidacion_AEL_V1_Verifier_Artifact_Security 37.md

TRUSTED COMPILER

Los Artifacts de producción deben generarse mediante:

```text
trusted Compiler build
```

---

## 228. BUILD PROVENANCE

> **Origen:** Motor de liquidacion_AEL_V1_Verifier_Artifact_Security 37.md

BUILD PROVENANCE

Guardar:

```text
compilerVersion
buildId
sourceHash
registry hashes
```

---

## 229. SUPPLY CHAIN

> **Origen:** Motor de liquidacion_AEL_V1_Verifier_Artifact_Security 37.md

SUPPLY CHAIN

El Runtime no debe aceptar plugins arbitrarios para:

```text
Provider
Function Adapter
```

sin mecanismos de confianza de plataforma.

---

## 230. PROVIDER TRUST

> **Origen:** Motor de liquidacion_AEL_V1_Verifier_Artifact_Security 37.md

PROVIDER TRUST

Providers deben pertenecer al:

```text
trusted application deployment
```

---

## 231. NO USER PROVIDERS

> **Origen:** Motor de liquidacion_AEL_V1_Verifier_Artifact_Security 37.md

NO USER PROVIDERS

Usuarios no pueden instalar adapters ejecutables desde AEL.

---

## 232. CAPABILITY MODEL

> **Origen:** Motor de liquidacion_AEL_V1_Verifier_Artifact_Security 37.md

CAPABILITY MODEL

Artifact sólo referencia capabilities conocidas.

---

## 233. CAPABILITY DENY

> **Origen:** Motor de liquidacion_AEL_V1_Verifier_Artifact_Security 37.md

CAPABILITY DENY

ExecutionContext puede negar una capability aunque Artifact la declare.

---

## 234. CAPABILITY CHECK TIMING

> **Origen:** Motor de liquidacion_AEL_V1_Verifier_Artifact_Security 37.md

CAPABILITY CHECK TIMING

Capability debe verificarse:

```text
at execution
```

porque depende del actor/tenant/context.

---

## 235. ARTIFACT DOES NOT GRANT AUTHORITY

> **Origen:** Motor de liquidacion_AEL_V1_Verifier_Artifact_Security 37.md

ARTIFACT DOES NOT GRANT AUTHORITY

Importante:

```text
Artifact declares dependency
```

pero no:

```text
Artifact grants capability
```

---

## 236. SECURITY BOUNDARY

> **Origen:** Motor de liquidacion_AEL_V1_Verifier_Artifact_Security 37.md

SECURITY BOUNDARY

La autoridad real proviene de:

```text
Application
ExecutionContext
Provider
RLS
```

---

## 237. TENANT ISOLATION

> **Origen:** Motor de liquidacion_AEL_V1_Verifier_Artifact_Security 37.md

TENANT ISOLATION

Artifact no puede especificar:

```text
tenantId alternativo
```

para acceder a otro tenant.

---

## 238. INPUT SECURITY

> **Origen:** Motor de liquidacion_AEL_V1_Verifier_Artifact_Security 37.md

INPUT SECURITY

Inputs deben validarse:

```text
type
size
allowed values
```

cuando corresponda.

---

## 239. INPUT RESOURCE LIMIT

> **Origen:** Motor de liquidacion_AEL_V1_Verifier_Artifact_Security 37.md

INPUT RESOURCE LIMIT

Evitar inputs gigantes que provoquen:

```text
memory exhaustion
```

---

## 240. STRING INPUT LIMIT

> **Origen:** Motor de liquidacion_AEL_V1_Verifier_Artifact_Security 37.md

STRING INPUT LIMIT

Aplicar:

```text
maxInputStringLength
```

---

## 241. RECORD INPUT LIMIT

> **Origen:** Motor de liquidacion_AEL_V1_Verifier_Artifact_Security 37.md

RECORD INPUT LIMIT

Aplicar:

```text
maxInputFields
```

---

## 242. LIST INPUT LIMIT

> **Origen:** Motor de liquidacion_AEL_V1_Verifier_Artifact_Security 37.md

LIST INPUT LIMIT

Si Lists se soportan:

```text
maxInputElements
```

---

## 243. NUMERIC LIMIT

> **Origen:** Motor de liquidacion_AEL_V1_Verifier_Artifact_Security 37.md

NUMERIC LIMIT

Aplicar:

```text
maxPrecision
maxScale
```

---

## 244. VERIFIER PERFORMANCE

> **Origen:** Motor de liquidacion_AEL_V1_Verifier_Artifact_Security 37.md

VERIFIER PERFORMANCE

La verificación debe ser aproximadamente:

```text
O(n)
```

respecto al Artifact.

---

## 245. NO PATH EXPLOSION

> **Origen:** Motor de liquidacion_AEL_V1_Verifier_Artifact_Security 37.md

NO PATH EXPLOSION

Verifier no debe explorar exponencialmente todos los caminos.

---

## 246. ABSTRACT INTERPRETATION

> **Origen:** Motor de liquidacion_AEL_V1_Verifier_Artifact_Security 37.md

ABSTRACT INTERPRETATION

Stack verification puede utilizar:

```text
abstract interpretation
```

---

## 247. CONTROL FLOW ANALYSIS

> **Origen:** Motor de liquidacion_AEL_V1_Verifier_Artifact_Security 37.md

CONTROL FLOW ANALYSIS

Utilizar CFG y estados abstractos:

```text
linear worklist
```

---

## 248. WORKLIST SAFETY

> **Origen:** Motor de liquidacion_AEL_V1_Verifier_Artifact_Security 37.md

WORKLIST SAFETY

Limitar:

```text
iterations
```

si aparecen estructuras inesperadas.

---

## 249. NO STACK RECURSION

> **Origen:** Motor de liquidacion_AEL_V1_Verifier_Artifact_Security 37.md

NO STACK RECURSION

Implementar traversal iterativo cuando sea posible.

---

## 250. MALICIOUS ARTIFACT

> **Origen:** Motor de liquidacion_AEL_V1_Verifier_Artifact_Security 37.md

MALICIOUS ARTIFACT

El Verifier debe asumir inputs maliciosos y nunca confiar en:

```text
counts
offsets
indices
types
jumps
```

sin comprobarlos.

---

## 251. ARTIFACT FUZZING

> **Origen:** Motor de liquidacion_AEL_V1_Verifier_Artifact_Security 37.md

ARTIFACT FUZZING

V1 debe incluir:

```text
fuzz tests
```

sobre:

```text
header
sections
instructions
operands
constants
metadata
```

---

## 252. MUTATION TESTING

> **Origen:** Motor de liquidacion_AEL_V1_Verifier_Artifact_Security 37.md

MUTATION TESTING

Modificar Artifacts válidos aleatoriamente debe provocar:

```text
verification failure
```

cuando se rompe una invariant.

---

## 253. PROPERTY TESTS

> **Origen:** Motor de liquidacion_AEL_V1_Verifier_Artifact_Security 37.md

PROPERTY TESTS

Verificar:

```text
verified Artifact
→ safe execution assumptions
```

---

## 254. GOLDEN INVALID ARTIFACTS

> **Origen:** Motor de liquidacion_AEL_V1_Verifier_Artifact_Security 37.md

GOLDEN INVALID ARTIFACTS

Mantener fixtures de:

```text
bad magic
bad version
bad offset
bad opcode
bad index
stack underflow
stack mismatch
invalid jump
invalid type
missing dependency
hash mismatch
```

---

## 255. SECURITY REGRESSION

> **Origen:** Motor de liquidacion_AEL_V1_Verifier_Artifact_Security 37.md

SECURITY REGRESSION

Cada vulnerabilidad encontrada debe convertirse en:

```text
regression test
```

---

## 256. OBSERVABILITY

> **Origen:** Motor de liquidacion_AEL_V1_Verifier_Artifact_Security 37.md

OBSERVABILITY

Métricas:

```text
artifact_verification_total
artifact_verification_failed
artifact_integrity_failed
artifact_invalid_opcode
artifact_invalid_jump
artifact_stack_failure
```

---

## 257. SECURITY ALERTING

> **Origen:** Motor de liquidacion_AEL_V1_Verifier_Artifact_Security 37.md

SECURITY ALERTING

Integrity failures repetidas pueden alimentar:

```text
security monitoring
```

fuera del lenguaje.

---

## 258. LOGGING

> **Origen:** Motor de liquidacion_AEL_V1_Verifier_Artifact_Security 37.md

LOGGING

No registrar el Artifact completo en cada error.

Preferir:

```text
artifactHash
artifactId
errorCode
```

---

## 259. FORENSICS

> **Origen:** Motor de liquidacion_AEL_V1_Verifier_Artifact_Security 37.md

FORENSICS

Para investigación puede conservarse:

```text
artifactHash
sourceHash
compilerVersion
registry hashes
```

según política de retención.

---

## 260. VERIFIER API

> **Origen:** Motor de liquidacion_AEL_V1_Verifier_Artifact_Security 37.md

VERIFIER API

Conceptualmente:

```ts
interface ArtifactVerifier {
  verify(artifact: Artifact, context: VerificationContext): VerificationResult
}
```

---

## 261. VERIFIED ARTIFACT

> **Origen:** Motor de liquidacion_AEL_V1_Verifier_Artifact_Security 37.md

VERIFIED ARTIFACT

El resultado puede ser:

```ts
interface VerifiedArtifact {
  artifact: Artifact
  verificationHash: string
  maxStackDepth: number
  instructionCount: number
}
```

---

## 262. NO MUTATION

> **Origen:** Motor de liquidacion_AEL_V1_Verifier_Artifact_Security 37.md

NO MUTATION

`VerifiedArtifact` no debe modificar el Artifact original.

---

## 263. RUNTIME HANDOFF

> **Origen:** Motor de liquidacion_AEL_V1_Verifier_Artifact_Security 37.md

RUNTIME HANDOFF

Sólo:

```text
VerifiedArtifact
```

debe pasar al Execution Engine.

---

## 264. PRE-EXECUTION CHECK

> **Origen:** Motor de liquidacion_AEL_V1_Verifier_Artifact_Security 37.md

PRE-EXECUTION CHECK

Runtime puede volver a comprobar:

```text
artifactHash
```

si el storage/cache lo requiere.

---

## 265. TOCTOU

> **Origen:** Motor de liquidacion_AEL_V1_Verifier_Artifact_Security 37.md

TOCTOU

Evitar:

```text
verify file A
execute modified file A
```

---

## 266. SOLUTION

> **Origen:** Motor de liquidacion_AEL_V1_Verifier_Artifact_Security 37.md

SOLUTION

La ejecución debe utilizar:

```text
exact bytes/object
```

que fueron verificados.

---

## 267. CACHE TOCTOU

> **Origen:** Motor de liquidacion_AEL_V1_Verifier_Artifact_Security 37.md

CACHE TOCTOU

Cache key debe derivarse de:

```text
verified artifact hash
```

---

## 268. STORAGE SECURITY

> **Origen:** Motor de liquidacion_AEL_V1_Verifier_Artifact_Security 37.md

STORAGE SECURITY

Artifact storage debe usar:

```text
access control
immutable versions
audit
```

según infraestructura.

---

## 269. RETENTION

> **Origen:** Motor de liquidacion_AEL_V1_Verifier_Artifact_Security 37.md

RETENTION

No borrar Artifacts históricos necesarios para:

```text
audit
reproducibility
```

---

## 270. EXIT CRITERIA — AEL-VERIFIER-SECURITY

> **Origen:** Motor de liquidacion_AEL_V1_Verifier_Artifact_Security 37.md

EXIT CRITERIA — AEL-VERIFIER-SECURITY

```text
✓ Untrusted Artifact model
✓ Safe deserialization
✓ Header validation
✓ Section validation
✓ Integrity verification
✓ Opcode validation
✓ Operand validation
✓ Index validation
✓ Stack verification
✓ Type verification
✓ Control-flow verification
✓ Dependency verification
✓ Capability validation
✓ Resource limits
✓ Deterministic errors
✓ No provider execution
✓ No DB/network access
✓ Tenant isolation
✓ Artifact authenticity model
✓ Supply-chain trust
✓ TOCTOU protection
✓ Fuzz testing
✓ Mutation testing
✓ Security regression
✓ Verification observability
```

---

## 271. FINAL SECURITY FLOW

> **Origen:** Motor de liquidacion_AEL_V1_Verifier_Artifact_Security 37.md

FINAL SECURITY FLOW

```text
                 Artifact
                    │
                    ▼
             Safe Deserialize
                    │
                    ▼
             Structural Check
                    │
                    ▼
             Integrity Check
                    │
                    ▼
             Semantic Verify
                    │
        ┌───────────┴───────────┐
        ▼                       ▼
      VALID                   INVALID
        │                       │
        ▼                       ▼
Dependency Resolve           Reject
        │
        ▼
Capability Context
        │
        ▼
      Runtime
```

---

## 272. PRINCIPIO DE CERO CONFIANZA

> **Origen:** Motor de liquidacion_AEL_V1_Verifier_Artifact_Security 37.md

PRINCIPIO DE CERO CONFIANZA

```text
Artifact recibido
      ≠
Artifact confiable
```

hasta completar todas las validaciones.

---

## 273. PRINCIPIO DE NO EJECUCIÓN

> **Origen:** Motor de liquidacion_AEL_V1_Verifier_Artifact_Security 37.md

PRINCIPIO DE NO EJECUCIÓN

Un Artifact inválido:

```text
never executes
```

---

## 274. PRINCIPIO DE INTEGRIDAD

> **Origen:** Motor de liquidacion_AEL_V1_Verifier_Artifact_Security 37.md

PRINCIPIO DE INTEGRIDAD

Un Artifact modificado:

```text
must be detected
```

---

## 275. PRINCIPIO DE AUTORIZACIÓN

> **Origen:** Motor de liquidacion_AEL_V1_Verifier_Artifact_Security 37.md

PRINCIPIO DE AUTORIZACIÓN

El Artifact:

```text
declara dependencies
```

pero la autoridad la determina:

```text
ExecutionContext + Application + RLS
```

---

## 276. PRINCIPIO DE DEFENSA EN PROFUNDIDAD

> **Origen:** Motor de liquidacion_AEL_V1_Verifier_Artifact_Security 37.md

PRINCIPIO DE DEFENSA EN PROFUNDIDAD

Seguridad:

```text
Artifact Format
+
Verifier
+
Runtime
+
Provider
+
PostgreSQL RLS
```

---

## 277. PRINCIPIO DE AISLAMIENTO

> **Origen:** Motor de liquidacion_AEL_V1_Verifier_Artifact_Security 37.md

PRINCIPIO DE AISLAMIENTO

El Verifier no conoce:

```text
tenant data
database rows
external APIs
```

---

## 278. OBJETIVO

> **Origen:** Motor de liquidacion_Security Model & Threat Model 42.md

OBJETIVO

Definir:

```text
Threat Model
Trust Boundaries
Attack Surfaces
Assets
Security Controls
Authentication
Authorization
Tenant Isolation
Artifact Security
Runtime Security
Provider Security
Database Security
Supply Chain
Observability
Incident Response
```

---

## 279. SECURITY MODEL

> **Origen:** Motor de liquidacion_Security Model & Threat Model 42.md

SECURITY MODEL

La seguridad se construye en capas:

```text
User
 ↓
Authentication
 ↓
Authorization
 ↓
ExecutionContext
 ↓
AEL Artifact
 ↓
Verifier
 ↓
Runtime
 ↓
Integration Layer
 ↓
PostgreSQL / RLS
```

---

## 280. PRINCIPIO ZERO TRUST

> **Origen:** Motor de liquidacion_Security Model & Threat Model 42.md

PRINCIPIO ZERO TRUST

Ningún componente debe asumir que otro componente es confiable únicamente porque:

```text
está dentro del mismo proceso
```

o:

```text
proviene de una fuente interna
```

---

## 281. ASSETS

> **Origen:** Motor de liquidacion_Security Model & Threat Model 42.md

ASSETS

Proteger:

```text
Tenant Data
Financial Data
Business Rules
Artifacts
Source
Credentials
API Keys
Database Access
Identity
Execution Context
Audit Data
Registry Metadata
```

---

## 282. SOURCE

> **Origen:** Motor de liquidacion_Security Model & Threat Model 42.md

SOURCE

AEL Source puede contener:

```text
business logic
business identifiers
references
```

Debe considerarse:

```text
untrusted input
```

---

## 283. ARTIFACT

> **Origen:** Motor de liquidacion_Security Model & Threat Model 42.md

ARTIFACT

Artifact contiene:

```text
compiled executable representation
```

Por tanto:

```text
high-value security object
```

---

## 284. EXECUTION CONTEXT

> **Origen:** Motor de liquidacion_Security Model & Threat Model 42.md

EXECUTION CONTEXT

Contiene información sensible:

```text
tenantId
actorId
capabilities
requestId
```

Debe protegerse.

---

## 285. CREDENTIALS

> **Origen:** Motor de liquidacion_Security Model & Threat Model 42.md

CREDENTIALS

Nunca deben entrar en:

```text
Source
Artifact
ExecutionState
AELValue
```

---

## 286. TRUST BOUNDARIES

> **Origen:** Motor de liquidacion_Security Model & Threat Model 42.md

TRUST BOUNDARIES

Principales:

```text
Client → Application
Application → Compiler
Compiler → Artifact
Artifact → Verifier
Runtime → Provider
Provider → PostgreSQL
```

---

## 287. CLIENT BOUNDARY

> **Origen:** Motor de liquidacion_Security Model & Threat Model 42.md

CLIENT BOUNDARY

El cliente puede controlar:

```text
input
Source submission
request parameters
```

cuando corresponda.

No debe controlar:

```text
tenant authority
service credentials
capabilities
RLS bypass
```

---

## 288. APPLICATION BOUNDARY

> **Origen:** Motor de liquidacion_Security Model & Threat Model 42.md

APPLICATION BOUNDARY

Application establece:

```text
identity
tenant
role
capabilities
```

---

## 289. COMPILER BOUNDARY

> **Origen:** Motor de liquidacion_Security Model & Threat Model 42.md

COMPILER BOUNDARY

Compiler recibe:

```text
untrusted Source
```

y debe aplicar límites.

---

## 290. ARTIFACT BOUNDARY

> **Origen:** Motor de liquidacion_Security Model & Threat Model 42.md

ARTIFACT BOUNDARY

Artifact puede almacenarse y transportarse.

Debe conservar:

```text
integrity
version
provenance
```

---

## 291. VERIFIER BOUNDARY

> **Origen:** Motor de liquidacion_Security Model & Threat Model 42.md

VERIFIER BOUNDARY

Verifier determina:

```text
whether Artifact is executable
```

---

## 292. RUNTIME BOUNDARY

> **Origen:** Motor de liquidacion_Security Model & Threat Model 42.md

RUNTIME BOUNDARY

Runtime controla:

```text
instruction execution
resource limits
capabilities
```

---

## 293. PROVIDER BOUNDARY

> **Origen:** Motor de liquidacion_Security Model & Threat Model 42.md

PROVIDER BOUNDARY

Provider controla:

```text
external access
database access
API access
```

---

## 294. DATABASE BOUNDARY

> **Origen:** Motor de liquidacion_Security Model & Threat Model 42.md

DATABASE BOUNDARY

PostgreSQL controla:

```text
data integrity
RLS
database privileges
```

---

## 295. THREAT CATEGORIES

> **Origen:** Motor de liquidacion_Security Model & Threat Model 42.md

THREAT CATEGORIES

Considerar:

```text
Spoofing
Tampering
Repudiation
Information Disclosure
Denial of Service
Elevation of Privilege
```

---

## 296. THREAT — TENANT ESCAPE

> **Origen:** Motor de liquidacion_Security Model & Threat Model 42.md

THREAT — TENANT ESCAPE

Atacante intenta:

```text
Tenant A
→ Tenant B data
```

---

## 297. CONTROLS

> **Origen:** Motor de liquidacion_Security Model & Threat Model 42.md

CONTROLS

```text
trusted tenant context
Provider filtering
RLS
cross-tenant tests
```

---

## 298. THREAT — TENANT OVERRIDE

> **Origen:** Motor de liquidacion_Security Model & Threat Model 42.md

THREAT — TENANT OVERRIDE

Source intenta:

```text
tenantId = otherTenant
```

---

## 299. CONTROL

> **Origen:** Motor de liquidacion_Security Model & Threat Model 42.md

CONTROL

Tenant authority nunca proviene de AEL.

---

## 300. THREAT — CAPABILITY ESCALATION

> **Origen:** Motor de liquidacion_Security Model & Threat Model 42.md

THREAT — CAPABILITY ESCALATION

Artifact intenta utilizar:

```text
capability no autorizada
```

---

## 301. CONTROL

> **Origen:** Motor de liquidacion_Security Model & Threat Model 42.md

CONTROL

Runtime debe comprobar:

```text
ExecutionContext.capabilities
```

---

## 302. THREAT — ARTIFACT TAMPERING

> **Origen:** Motor de liquidacion_Security Model & Threat Model 42.md

THREAT — ARTIFACT TAMPERING

Atacante modifica:

```text
opcode
constant
dependency
jump
```

---

## 303. CONTROL

> **Origen:** Motor de liquidacion_Security Model & Threat Model 42.md

CONTROL

```text
integrity hash
Verifier
artifact versioning
```

---

## 304. THREAT — MALFORMED ARTIFACT

> **Origen:** Motor de liquidacion_Security Model & Threat Model 42.md

THREAT — MALFORMED ARTIFACT

Artifact contiene:

```text
invalid offsets
invalid indexes
unknown opcode
```

---

## 305. CONTROL

> **Origen:** Motor de liquidacion_Security Model & Threat Model 42.md

CONTROL

Safe deserialization + Verifier.

---

## 306. THREAT — STACK ATTACK

> **Origen:** Motor de liquidacion_Security Model & Threat Model 42.md

THREAT — STACK ATTACK

Artifact intenta:

```text
stack underflow
stack overflow
invalid merge
```

---

## 307. CONTROL

> **Origen:** Motor de liquidacion_Security Model & Threat Model 42.md

CONTROL

Abstract stack verification + runtime defensive checks.

---

## 308. THREAT — CONTROL FLOW ATTACK

> **Origen:** Motor de liquidacion_Security Model & Threat Model 42.md

THREAT — CONTROL FLOW ATTACK

Artifact intenta:

```text
jump into operand
jump outside stream
cycle unsupported
```

---

## 309. CONTROL

> **Origen:** Motor de liquidacion_Security Model & Threat Model 42.md

CONTROL

CFG verification.

---

## 310. THREAT — RESOURCE EXHAUSTION

> **Origen:** Motor de liquidacion_Security Model & Threat Model 42.md

THREAT — RESOURCE EXHAUSTION

Artifact intenta consumir:

```text
CPU
memory
provider calls
database calls
```

---

## 311. CONTROL

> **Origen:** Motor de liquidacion_Security Model & Threat Model 42.md

CONTROL

```text
maxSteps
maxStackDepth
maxCalls
timeouts
cancellation
value limits
```

---

## 312. THREAT — SOURCE BOMBA

> **Origen:** Motor de liquidacion_Security Model & Threat Model 42.md

THREAT — SOURCE BOMBA

Source contiene:

```text
deep nesting
huge literals
huge AST
```

---

## 313. CONTROL

> **Origen:** Motor de liquidacion_Security Model & Threat Model 42.md

CONTROL

Compiler limits:

```text
maxSourceLength
maxASTNodes
maxNestingDepth
```

---

## 314. THREAT — SQL INJECTION

> **Origen:** Motor de liquidacion_Security Model & Threat Model 42.md

THREAT — SQL INJECTION

Input intenta alterar SQL.

---

## 315. CONTROL

> **Origen:** Motor de liquidacion_Security Model & Threat Model 42.md

CONTROL

Repository debe utilizar:

```text
parameterized queries
```

---

## 316. THREAT — SSRF

> **Origen:** Motor de liquidacion_Security Model & Threat Model 42.md

THREAT — SSRF

Function/Provider intenta acceder a:

```text
localhost
private IP
metadata service
internal network
```

---

## 317. CONTROL

> **Origen:** Motor de liquidacion_Security Model & Threat Model 42.md

CONTROL

HTTP Provider:

```text
allowlist
destination validation
DNS protection
response limits
```

---

## 318. THREAT — SECRET DISCLOSURE

> **Origen:** Motor de liquidacion_Security Model & Threat Model 42.md

THREAT — SECRET DISCLOSURE

Artifact o logs contienen:

```text
API keys
passwords
tokens
```

---

## 319. CONTROL

> **Origen:** Motor de liquidacion_Security Model & Threat Model 42.md

CONTROL

Secrets sólo en:

```text
server-side secret manager/configuration
```

---

## 320. THREAT — LOG INJECTION

> **Origen:** Motor de liquidacion_Security Model & Threat Model 42.md

THREAT — LOG INJECTION

Input malicioso introduce:

```text
fake log lines
```

---

## 321. CONTROL

> **Origen:** Motor de liquidacion_Security Model & Threat Model 42.md

CONTROL

Structured logging.

---

## 322. THREAT — INFORMATION DISCLOSURE

> **Origen:** Motor de liquidacion_Security Model & Threat Model 42.md

THREAT — INFORMATION DISCLOSURE

Error revela:

```text
SQL
host
credentials
internal topology
```

---

## 323. CONTROL

> **Origen:** Motor de liquidacion_Security Model & Threat Model 42.md

CONTROL

External error sanitization.

---

## 324. THREAT — PROVIDER COMPROMISE

> **Origen:** Motor de liquidacion_Security Model & Threat Model 42.md

THREAT — PROVIDER COMPROMISE

Provider defectuoso intenta:

```text
access other tenant
```

---

## 325. CONTROL

> **Origen:** Motor de liquidacion_Security Model & Threat Model 42.md

CONTROL

```text
RLS
least privilege
provider isolation
audit
```

---

## 326. THREAT — FUNCTION ADAPTER COMPROMISE

> **Origen:** Motor de liquidacion_Security Model & Threat Model 42.md

THREAT — FUNCTION ADAPTER COMPROMISE

Adapter intenta:

```text
arbitrary filesystem
network
database
```

---

## 327. CONTROL

> **Origen:** Motor de liquidacion_Security Model & Threat Model 42.md

CONTROL

Trusted deployment + capability boundary + infrastructure sandboxing.

---

## 328. THREAT — SUPPLY CHAIN

> **Origen:** Motor de liquidacion_Security Model & Threat Model 42.md

THREAT — SUPPLY CHAIN

Dependencia vulnerable modifica:

```text
Provider
Compiler
Runtime
```

---

## 329. CONTROL

> **Origen:** Motor de liquidacion_Security Model & Threat Model 42.md

CONTROL

```text
dependency pinning
lockfiles
SBOM
vulnerability scanning
signed builds
```

---

## 330. THREAT — COMPILER COMPROMISE

> **Origen:** Motor de liquidacion_Security Model & Threat Model 42.md

THREAT — COMPILER COMPROMISE

Compiler genera Artifact malicioso.

---

## 331. CONTROL

> **Origen:** Motor de liquidacion_Security Model & Threat Model 42.md

CONTROL

```text
trusted build pipeline
Artifact verification
golden tests
reproducible builds
```

---

## 332. THREAT — REGISTRY TAMPERING

> **Origen:** Motor de liquidacion_Security Model & Threat Model 42.md

THREAT — REGISTRY TAMPERING

Registry cambia:

```text
Contract version
Function definition
type
```

---

## 333. CONTROL

> **Origen:** Motor de liquidacion_Security Model & Threat Model 42.md

CONTROL

```text
immutable snapshots
definition hashes
audit
versioning
```

---

## 334. THREAT — DEPENDENCY CONFUSION

> **Origen:** Motor de liquidacion_Security Model & Threat Model 42.md

THREAT — DEPENDENCY CONFUSION

Artifact referencia:

```text
wrong implementation
```

---

## 335. CONTROL

> **Origen:** Motor de liquidacion_Security Model & Threat Model 42.md

CONTROL

Pin:

```text
dependency code
version
definition hash
```

---

## 336. THREAT — REPLAY

> **Origen:** Motor de liquidacion_Security Model & Threat Model 42.md

THREAT — REPLAY

Un request válido se reutiliza:

```text
repeated write
```

---

## 337. CONTROL

> **Origen:** Motor de liquidacion_Security Model & Threat Model 42.md

CONTROL

Para writes:

```text
idempotency keys
request identity
provider policy
```

---

## 338. THREAT — RACE CONDITION

> **Origen:** Motor de liquidacion_Security Model & Threat Model 42.md

THREAT — RACE CONDITION

Dos executions modifican el mismo recurso.

---

## 339. CONTROL

> **Origen:** Motor de liquidacion_Security Model & Threat Model 42.md

CONTROL

Aplicación/DB debe utilizar:

```text
transactions
constraints
locking
optimistic concurrency
```

según caso.

---

## 340. THREAT — TOCTOU

> **Origen:** Motor de liquidacion_Security Model & Threat Model 42.md

THREAT — TOCTOU

Artifact verificado es reemplazado antes de ejecución.

---

## 341. CONTROL

> **Origen:** Motor de liquidacion_Security Model & Threat Model 42.md

CONTROL

Runtime debe ejecutar:

```text
exact verified bytes/object
```

---

## 342. THREAT — CACHE POISONING

> **Origen:** Motor de liquidacion_Security Model & Threat Model 42.md

THREAT — CACHE POISONING

Cache contiene:

```text
cross-tenant data
```

---

## 343. CONTROL

> **Origen:** Motor de liquidacion_Security Model & Threat Model 42.md

CONTROL

Cache key debe incluir:

```text
tenant
dependency
context
```

---

## 344. THREAT — CACHE STALE

> **Origen:** Motor de liquidacion_Security Model & Threat Model 42.md

THREAT — CACHE STALE

Datos antiguos alteran liquidación.

---

## 345. CONTROL

> **Origen:** Motor de liquidacion_Security Model & Threat Model 42.md

CONTROL

TTL/invalidation debe pertenecer al Provider.

---

## 346. THREAT — PRIVILEGE ESCALATION

> **Origen:** Motor de liquidacion_Security Model & Threat Model 42.md

THREAT — PRIVILEGE ESCALATION

Role básico intenta ejecutar una capability administrativa.

---

## 347. CONTROL

> **Origen:** Motor de liquidacion_Security Model & Threat Model 42.md

CONTROL

```text
Role
→ Effective Capabilities
→ ExecutionContext
→ Runtime check
```

---

## 348. THREAT — CLAIM FORGERY

> **Origen:** Motor de liquidacion_Security Model & Threat Model 42.md

THREAT — CLAIM FORGERY

Cliente intenta enviar:

```text
tenant
role
capability
```

como claim arbitrario.

---

## 349. CONTROL

> **Origen:** Motor de liquidacion_Security Model & Threat Model 42.md

CONTROL

Sólo confiar en claims emitidos por:

```text
trusted authentication system
```

---

## 350. THREAT — USER METADATA ABUSE

> **Origen:** Motor de liquidacion_Security Model & Threat Model 42.md

THREAT — USER METADATA ABUSE

Usuario modifica metadata editable para obtener privilegios.

---

## 351. CONTROL

> **Origen:** Motor de liquidacion_Security Model & Threat Model 42.md

CONTROL

No usar:

```text
user-editable metadata
```

como autoridad de seguridad.

---

## 352. THREAT — RLS BYPASS

> **Origen:** Motor de liquidacion_Security Model & Threat Model 42.md

THREAT — RLS BYPASS

Application utiliza:

```text
service role
```

innecesariamente.

---

## 353. CONTROL

> **Origen:** Motor de liquidacion_Security Model & Threat Model 42.md

CONTROL

Least privilege + evitar service role para operaciones normales.

---

## 354. THREAT — SECURITY DEFINER ABUSE

> **Origen:** Motor de liquidacion_Security Model & Threat Model 42.md

THREAT — SECURITY DEFINER ABUSE

PostgreSQL function privilegiada expone datos.

---

## 355. CONTROL

> **Origen:** Motor de liquidacion_Security Model & Threat Model 42.md

CONTROL

Review de:

```text
SECURITY DEFINER
search_path
EXECUTE grants
```

---

## 356. THREAT — DATA EXFILTRATION

> **Origen:** Motor de liquidacion_Security Model & Threat Model 42.md

THREAT — DATA EXFILTRATION

Rule intenta obtener:

```text
large dataset
```

---

## 357. CONTROL

> **Origen:** Motor de liquidacion_Security Model & Threat Model 42.md

CONTROL

```text
result limits
provider limits
contract design
```

---

## 358. THREAT — SENSITIVE DATA EXPOSURE

> **Origen:** Motor de liquidacion_Security Model & Threat Model 42.md

THREAT — SENSITIVE DATA EXPOSURE

Contract devuelve:

```text
personal/financial sensitive data
```

sin necesidad.

---

## 359. CONTROL

> **Origen:** Motor de liquidacion_Security Model & Threat Model 42.md

CONTROL

Data minimization + Contract review.

---

## 360. THREAT — DEBUG DATA LEAK

> **Origen:** Motor de liquidacion_Security Model & Threat Model 42.md

THREAT — DEBUG DATA LEAK

Debug mode imprime:

```text
AELValue
```

completo.

---

## 361. CONTROL

> **Origen:** Motor de liquidacion_Security Model & Threat Model 42.md

CONTROL

Redaction + disabled production verbose tracing.

---

## 362. THREAT — ERROR ORACLE

> **Origen:** Motor de liquidacion_Security Model & Threat Model 42.md

THREAT — ERROR ORACLE

Atacante utiliza mensajes para descubrir:

```text
records
contracts
providers
```

---

## 363. CONTROL

> **Origen:** Motor de liquidacion_Security Model & Threat Model 42.md

CONTROL

Uniform external errors donde corresponda.

---

## 364. THREAT — DENIAL OF SERVICE

> **Origen:** Motor de liquidacion_Security Model & Threat Model 42.md

THREAT — DENIAL OF SERVICE

Miles de executions consumen:

```text
CPU
DB pool
memory
```

---

## 365. CONTROL

> **Origen:** Motor de liquidacion_Security Model & Threat Model 42.md

CONTROL

Application rate limits + Runtime limits + DB pool limits.

---

## 366. THREAT — PROVIDER FLOOD

> **Origen:** Motor de liquidacion_Security Model & Threat Model 42.md

THREAT — PROVIDER FLOOD

Rule provoca demasiadas llamadas externas.

---

## 367. CONTROL

> **Origen:** Motor de liquidacion_Security Model & Threat Model 42.md

CONTROL

```text
maxContractCalls
maxFunctionCalls
Provider quotas
```

---

## 368. THREAT — DATABASE FLOOD

> **Origen:** Motor de liquidacion_Security Model & Threat Model 42.md

THREAT — DATABASE FLOOD

Rule dispara consultas costosas.

---

## 369. CONTROL

> **Origen:** Motor de liquidacion_Security Model & Threat Model 42.md

CONTROL

```text
query limits
indexes
timeouts
max calls
```

---

## 370. THREAT — SLOW QUERY

> **Origen:** Motor de liquidacion_Security Model & Threat Model 42.md

THREAT — SLOW QUERY

Query consume toda la ejecución.

---

## 371. CONTROL

> **Origen:** Motor de liquidacion_Security Model & Threat Model 42.md

CONTROL

Database statement timeout + execution deadline.

---

## 372. THREAT — INFINITE LOOP

> **Origen:** Motor de liquidacion_Security Model & Threat Model 42.md

THREAT — INFINITE LOOP

Artifact contiene ciclo no permitido.

---

## 373. CONTROL

> **Origen:** Motor de liquidacion_Security Model & Threat Model 42.md; Motor de liquidacion_Security Model & Threat Model 42.md

CONTROL

Verifier CFG + Runtime step limit.

---

## 374. THREAT — RECURSION

> **Origen:** Motor de liquidacion_Security Model & Threat Model 42.md

THREAT — RECURSION

Dependency provoca recursion.

---

## 375. CONTROL

> **Origen:** Motor de liquidacion_Security Model & Threat Model 42.md

CONTROL

V1 no permite recursion de user-defined functions ni ejecución recursiva AEL.

---

## 376. THREAT — TYPE CONFUSION

> **Origen:** Motor de liquidacion_Security Model & Threat Model 42.md

THREAT — TYPE CONFUSION

Artifact manipula tipos para obtener:

```text
invalid arithmetic
```

---

## 377. CONTROL

> **Origen:** Motor de liquidacion_Security Model & Threat Model 42.md

CONTROL

Compiler type checking + Verifier type verification + Runtime defensive checks.

---

## 378. THREAT — NUMERIC OVERFLOW

> **Origen:** Motor de liquidacion_Security Model & Threat Model 42.md

THREAT — NUMERIC OVERFLOW

Input provoca:

```text
overflow
precision loss
```

---

## 379. CONTROL

> **Origen:** Motor de liquidacion_Security Model & Threat Model 42.md

CONTROL

Decimal policy + precision limits + checked arithmetic.

---

## 380. THREAT — MONEY MANIPULATION

> **Origen:** Motor de liquidacion_Security Model & Threat Model 42.md

THREAT — MONEY MANIPULATION

Rule mezcla:

```text
different currencies
```

---

## 381. CONTROL

> **Origen:** Motor de liquidacion_Security Model & Threat Model 42.md

CONTROL

Money type system + currency compatibility.

---

## 382. THREAT — QUANTITY MANIPULATION

> **Origen:** Motor de liquidacion_Security Model & Threat Model 42.md

THREAT — QUANTITY MANIPULATION

Rule mezcla:

```text
incompatible dimensions
```

---

## 383. CONTROL

> **Origen:** Motor de liquidacion_Security Model & Threat Model 42.md

CONTROL

Quantity dimension/unit validation.

---

## 384. THREAT — NULL CONFUSION

> **Origen:** Motor de liquidacion_Security Model & Threat Model 42.md

THREAT — NULL CONFUSION

Null tratado como:

```text
0
false
empty
```

---

## 385. CONTROL

> **Origen:** Motor de liquidacion_Security Model & Threat Model 42.md

CONTROL

Explicit Null semantics.

---

## 386. THREAT — SOURCE DISCLOSURE

> **Origen:** Motor de liquidacion_Security Model & Threat Model 42.md

THREAT — SOURCE DISCLOSURE

Usuario obtiene Source de otra organización.

---

## 387. CONTROL

> **Origen:** Motor de liquidacion_Security Model & Threat Model 42.md

CONTROL

Tenant isolation + access control + artifact/source permissions.

---

## 388. THREAT — ARTIFACT DISCLOSURE

> **Origen:** Motor de liquidacion_Security Model & Threat Model 42.md

THREAT — ARTIFACT DISCLOSURE

Usuario descarga Artifact de otro tenant.

---

## 389. CONTROL

> **Origen:** Motor de liquidacion_Security Model & Threat Model 42.md

CONTROL

Artifact registry authorization + tenant scope.

---

## 390. THREAT — RULE TAMPERING

> **Origen:** Motor de liquidacion_Security Model & Threat Model 42.md

THREAT — RULE TAMPERING

Usuario modifica una Rule activa.

---

## 391. CONTROL

> **Origen:** Motor de liquidacion_Security Model & Threat Model 42.md

CONTROL

Versioning + approval + immutable published versions.

---

## 392. THREAT — UNAUTHORIZED PUBLICATION

> **Origen:** Motor de liquidacion_Security Model & Threat Model 42.md

THREAT — UNAUTHORIZED PUBLICATION

Usuario publica Artifact sin permiso.

---

## 393. CONTROL

> **Origen:** Motor de liquidacion_Security Model & Threat Model 42.md

CONTROL

Role/capability:

```text
RULE_PUBLISH
```

---

## 394. THREAT — ROLLBACK ABUSE

> **Origen:** Motor de liquidacion_Security Model & Threat Model 42.md

THREAT — ROLLBACK ABUSE

Usuario activa Artifact vulnerable antiguo.

---

## 395. CONTROL

> **Origen:** Motor de liquidacion_Security Model & Threat Model 42.md

CONTROL

Artifact lifecycle + policy preventing insecure versions.

---

## 396. THREAT — AUDIT TAMPERING

> **Origen:** Motor de liquidacion_Security Model & Threat Model 42.md

THREAT — AUDIT TAMPERING

Usuario altera audit logs.

---

## 397. CONTROL

> **Origen:** Motor de liquidacion_Security Model & Threat Model 42.md

CONTROL

Append-only audit storage + restricted access.

---

## 398. THREAT — NON-REPUDIATION GAP

> **Origen:** Motor de liquidacion_Security Model & Threat Model 42.md

THREAT — NON-REPUDIATION GAP

No puede determinarse:

```text
who
what
when
which artifact
```

---

## 399. CONTROL

> **Origen:** Motor de liquidacion_Security Model & Threat Model 42.md

CONTROL

Audit event:

```text
actor
tenant
artifact
version
hash
request
execution
timestamp
result
```

---

## 400. THREAT — CLOCK MANIPULATION

> **Origen:** Motor de liquidacion_Security Model & Threat Model 42.md

THREAT — CLOCK MANIPULATION

Execution depende de reloj no confiable.

---

## 401. CONTROL

> **Origen:** Motor de liquidacion_Security Model & Threat Model 42.md

CONTROL

Trusted application clock abstraction.

---

## 402. THREAT — TIMEZONE CONFUSION

> **Origen:** Motor de liquidacion_Security Model & Threat Model 42.md

THREAT — TIMEZONE CONFUSION

Liquidación cambia por timezone.

---

## 403. CONTROL

> **Origen:** Motor de liquidacion_Security Model & Threat Model 42.md

CONTROL

Explicit timezone semantics + normalized storage.

---

## 404. THREAT — ENVIRONMENT CONFUSION

> **Origen:** Motor de liquidacion_Security Model & Threat Model 42.md

THREAT — ENVIRONMENT CONFUSION

Artifact de staging ejecutado en production.

---

## 405. CONTROL

> **Origen:** Motor de liquidacion_Security Model & Threat Model 42.md

CONTROL

Artifact registry environment binding.

---

## 406. THREAT — CONFIGURATION DRIFT

> **Origen:** Motor de liquidacion_Security Model & Threat Model 42.md

THREAT — CONFIGURATION DRIFT

Production Provider tiene configuración diferente.

---

## 407. CONTROL

> **Origen:** Motor de liquidacion_Security Model & Threat Model 42.md

CONTROL

Versioned configuration + deployment validation.

---

## 408. THREAT — DEPENDENCY DRIFT

> **Origen:** Motor de liquidacion_Security Model & Threat Model 42.md

THREAT — DEPENDENCY DRIFT

Artifact apunta a:

```text
latest
```

---

## 409. CONTROL

> **Origen:** Motor de liquidacion_Security Model & Threat Model 42.md

CONTROL

Exact version + definition hash.

---

## 410. THREAT — DESERIALIZATION ATTACK

> **Origen:** Motor de liquidacion_Security Model & Threat Model 42.md

THREAT — DESERIALIZATION ATTACK

Artifact declara tamaños enormes.

---

## 411. CONTROL

> **Origen:** Motor de liquidacion_Security Model & Threat Model 42.md

CONTROL

Hard limits before allocation.

---

## 412. THREAT — MEMORY EXHAUSTION

> **Origen:** Motor de liquidacion_Security Model & Threat Model 42.md

THREAT — MEMORY EXHAUSTION

Large String/List/Record.

---

## 413. CONTROL

> **Origen:** Motor de liquidacion_Security Model & Threat Model 42.md

CONTROL

Value size limits.

---

## 414. THREAT — STACK EXHAUSTION

> **Origen:** Motor de liquidacion_Security Model & Threat Model 42.md

THREAT — STACK EXHAUSTION

Malformed instruction stream.

---

## 415. THREAT — ERROR AMPLIFICATION

> **Origen:** Motor de liquidacion_Security Model & Threat Model 42.md

THREAT — ERROR AMPLIFICATION

Una dependency falla repetidamente y provoca storm.

---

## 416. CONTROL

> **Origen:** Motor de liquidacion_Security Model & Threat Model 42.md

CONTROL

Provider circuit breaker + rate limits + bounded retries.

---

## 417. THREAT — EXTERNAL API ABUSE

> **Origen:** Motor de liquidacion_Security Model & Threat Model 42.md

THREAT — EXTERNAL API ABUSE

Rule usa API costosa de manera masiva.

---

## 418. CONTROL

> **Origen:** Motor de liquidacion_Security Model & Threat Model 42.md

CONTROL

Capability + quotas + call limits.

---

## 419. THREAT — DATABASE LOCK ABUSE

> **Origen:** Motor de liquidacion_Security Model & Threat Model 42.md

THREAT — DATABASE LOCK ABUSE

Write operations mantienen locks demasiado tiempo.

---

## 420. CONTROL

> **Origen:** Motor de liquidacion_Security Model & Threat Model 42.md

CONTROL

Short transactions + statement timeout.

---

## 421. THREAT — CROSS-TENANT CACHE

> **Origen:** Motor de liquidacion_Security Model & Threat Model 42.md

THREAT — CROSS-TENANT CACHE

Tenant A reutiliza resultado de Tenant B.

---

## 422. CONTROL

> **Origen:** Motor de liquidacion_Security Model & Threat Model 42.md

CONTROL

Tenant-aware cache key + tests.

---

## 423. THREAT — CROSS-TENANT LOG ACCESS

> **Origen:** Motor de liquidacion_Security Model & Threat Model 42.md

THREAT — CROSS-TENANT LOG ACCESS

Usuario consulta logs de otro tenant.

---

## 424. CONTROL

> **Origen:** Motor de liquidacion_Security Model & Threat Model 42.md

CONTROL

Tenant-scoped observability authorization.

---

## 425. THREAT — SOURCE INJECTION

> **Origen:** Motor de liquidacion_Security Model & Threat Model 42.md

THREAT — SOURCE INJECTION

Source intenta explotar parser.

---

## 426. CONTROL

> **Origen:** Motor de liquidacion_Security Model & Threat Model 42.md

CONTROL

Lexer/parser limits + fuzzing.

---

## 427. THREAT — PARSER STACK OVERFLOW

> **Origen:** Motor de liquidacion_Security Model & Threat Model 42.md

THREAT — PARSER STACK OVERFLOW

Nested expression excesiva.

---

## 428. CONTROL

> **Origen:** Motor de liquidacion_Security Model & Threat Model 42.md

CONTROL

Maximum nesting depth + iterative parsing where possible.

---

## 429. THREAT — COMPILER RESOURCE EXHAUSTION

> **Origen:** Motor de liquidacion_Security Model & Threat Model 42.md

THREAT — COMPILER RESOURCE EXHAUSTION

Compilation masiva.

---

## 430. CONTROL

> **Origen:** Motor de liquidacion_Security Model & Threat Model 42.md

CONTROL

Compilation quotas + source limits + queue limits.

---

## 431. THREAT — ARTIFACT BUILD ABUSE

> **Origen:** Motor de liquidacion_Security Model & Threat Model 42.md

THREAT — ARTIFACT BUILD ABUSE

Usuario produce millones de Artifacts.

---

## 432. CONTROL

> **Origen:** Motor de liquidacion_Security Model & Threat Model 42.md

CONTROL

Publication quotas + rate limits + storage limits.

---

## 433. THREAT — MALICIOUS FUNCTION

> **Origen:** Motor de liquidacion_Security Model & Threat Model 42.md

THREAT — MALICIOUS FUNCTION

Function Adapter ejecuta código peligroso.

---

## 434. CONTROL

> **Origen:** Motor de liquidacion_Security Model & Threat Model 42.md

CONTROL

Trusted deployment + code review + dependency scanning + least privilege.

---

## 435. THREAT — MALICIOUS PROVIDER

> **Origen:** Motor de liquidacion_Security Model & Threat Model 42.md

THREAT — MALICIOUS PROVIDER

Provider exfiltra información.

---

## 436. CONTROL

> **Origen:** Motor de liquidacion_Security Model & Threat Model 42.md

CONTROL

Provider review + least privilege + RLS + network restrictions + audit.

---

## 437. THREAT — BUILD PIPELINE COMPROMISE

> **Origen:** Motor de liquidacion_Security Model & Threat Model 42.md

THREAT — BUILD PIPELINE COMPROMISE

Artifact malicioso publicado.

---

## 438. CONTROL

> **Origen:** Motor de liquidacion_Security Model & Threat Model 42.md

CONTROL

CI/CD security + signed artifacts + protected branches + approval.

---

## 439. THREAT — REGISTRY COMPROMISE

> **Origen:** Motor de liquidacion_Security Model & Threat Model 42.md

THREAT — REGISTRY COMPROMISE

Registry sustituye dependency.

---

## 440. CONTROL

> **Origen:** Motor de liquidacion_Security Model & Threat Model 42.md

CONTROL

Registry ACL + immutable versions + hashes.

---

## 441. THREAT — SECRET MANAGER COMPROMISE

> **Origen:** Motor de liquidacion_Security Model & Threat Model 42.md

THREAT — SECRET MANAGER COMPROMISE

Provider obtiene credenciales indebidas.

---

## 442. CONTROL

> **Origen:** Motor de liquidacion_Security Model & Threat Model 42.md

CONTROL

Least privilege + secret rotation + audit.

---

## 443. THREAT — DATABASE CREDENTIAL COMPROMISE

> **Origen:** Motor de liquidacion_Security Model & Threat Model 42.md

THREAT — DATABASE CREDENTIAL COMPROMISE

Atacante obtiene password.

---

## 444. CONTROL

> **Origen:** Motor de liquidacion_Security Model & Threat Model 42.md

CONTROL

Secret manager + rotation + restricted network + DB roles.

---

## 445. THREAT — BACKUP DISCLOSURE

> **Origen:** Motor de liquidacion_Security Model & Threat Model 42.md

THREAT — BACKUP DISCLOSURE

Backup contiene datos de tenants.

---

## 446. CONTROL

> **Origen:** Motor de liquidacion_Security Model & Threat Model 42.md

CONTROL

Encryption at rest + restricted backup access + retention policy.

---

## 447. THREAT — DATA EXPORT ABUSE

> **Origen:** Motor de liquidacion_Security Model & Threat Model 42.md

THREAT — DATA EXPORT ABUSE

Rule o usuario intenta exportar datos masivamente.

---

## 448. CONTROL

> **Origen:** Motor de liquidacion_Security Model & Threat Model 42.md

CONTROL

Export capability + quotas + audit.

---

## 449. THREAT — PRIVILEGED ADMIN ABUSE

> **Origen:** Motor de liquidacion_Security Model & Threat Model 42.md

THREAT — PRIVILEGED ADMIN ABUSE

Administrador accede a datos sin justificación.

---

## 450. CONTROL

> **Origen:** Motor de liquidacion_Security Model & Threat Model 42.md

CONTROL

Least privilege + audit + break-glass process.

---

## 451. THREAT — INSIDER SOURCE THEFT

> **Origen:** Motor de liquidacion_Security Model & Threat Model 42.md

THREAT — INSIDER SOURCE THEFT

Source de Rules comerciales es copiado.

---

## 452. CONTROL

> **Origen:** Motor de liquidacion_Security Model & Threat Model 42.md

CONTROL

Source ACL + tenant isolation + audit.

---

## 453. THREAT — ARTIFACT REVERSE ENGINEERING

> **Origen:** Motor de liquidacion_Security Model & Threat Model 42.md

THREAT — ARTIFACT REVERSE ENGINEERING

Artifact revela lógica comercial.

---

## 454. CONTROL

> **Origen:** Motor de liquidacion_Security Model & Threat Model 42.md

CONTROL

Artifact access control + encryption/storage security.

---

## 455. THREAT — VERSION MIXING

> **Origen:** Motor de liquidacion_Security Model & Threat Model 42.md

THREAT — VERSION MIXING

Compiler y Runtime utilizan semánticas incompatibles.

---

## 456. CONTROL

> **Origen:** Motor de liquidacion_Security Model & Threat Model 42.md

CONTROL

languageVersion + artifactFormatVersion + compatibility checks.

---

## 457. SECURITY VERSION

> **Origen:** Motor de liquidacion_Security Model & Threat Model 42.md

SECURITY VERSION

Security model changes deben poder versionarse.

---

## 458. SECURITY POLICY

> **Origen:** Motor de liquidacion_Security Model & Threat Model 42.md

SECURITY POLICY

RuntimePolicy debe ser:

```text
explicit
versioned
auditable
```

---

## 459. SECURITY CONFIGURATION

> **Origen:** Motor de liquidacion_Security Model & Threat Model 42.md

SECURITY CONFIGURATION

No depender exclusivamente de defaults implícitos.

---

## 460. FAIL CLOSED

> **Origen:** Motor de liquidacion_Security Model & Threat Model 42.md

FAIL CLOSED

Ante duda de seguridad:

```text
deny
```

---

## 461. LEAST PRIVILEGE

> **Origen:** Motor de liquidacion_Security Model & Threat Model 42.md

LEAST PRIVILEGE

Cada componente recibe sólo:

```text
minimum required authority
```

---

## 462. SEPARATION OF DUTIES

> **Origen:** Motor de liquidacion_Security Model & Threat Model 42.md

SEPARATION OF DUTIES

Cuando sea relevante separar:

```text
author
reviewer
publisher
administrator
```

---

## 463. IMMUTABILITY

> **Origen:** Motor de liquidacion_Security Model & Threat Model 42.md

IMMUTABILITY

Published Artifacts deben ser:

```text
immutable
```

---

## 464. AUDITABILITY

> **Origen:** Motor de liquidacion_Security Model & Threat Model 42.md

AUDITABILITY

Toda acción crítica debe ser:

```text
traceable
```

---

## 465. DEFENSE IN DEPTH

> **Origen:** Motor de liquidacion_Security Model & Threat Model 42.md

DEFENSE IN DEPTH

Ninguna capa debe ser la única defensa.

---

## 466. SECURITY TESTING

> **Origen:** Motor de liquidacion_Security Model & Threat Model 42.md

SECURITY TESTING

Mínimo:

```text
unit
integration
security
fuzz
penetration
tenant isolation
```

---

## 467. SECURITY REGRESSION

> **Origen:** Motor de liquidacion_Security Model & Threat Model 42.md

SECURITY REGRESSION

Cada vulnerabilidad encontrada:

```text
→ test
→ regression suite
```

---

## 468. DEPENDENCY SCANNING

> **Origen:** Motor de liquidacion_Security Model & Threat Model 42.md

DEPENDENCY SCANNING

CI debe revisar:

```text
runtime dependencies
compiler dependencies
provider dependencies
```

---

## 469. SBOM

> **Origen:** Motor de liquidacion_Security Model & Threat Model 42.md

SBOM

Producción debe poder generar:

```text
Software Bill of Materials
```

---

## 470. BUILD INTEGRITY

> **Origen:** Motor de liquidacion_Security Model & Threat Model 42.md

BUILD INTEGRITY

Build pipeline debe proteger:

```text
source
dependencies
compiler
artifact
```

---

## 471. SIGNED ARTIFACTS

> **Origen:** Motor de liquidacion_Security Model & Threat Model 42.md

SIGNED ARTIFACTS

Futuro recomendado:

```text
digital signatures
```

para Artifacts de producción.

---

## 472. INCIDENT RESPONSE

> **Origen:** Motor de liquidacion_Security Model & Threat Model 42.md

INCIDENT RESPONSE

Debe existir capacidad para:

```text
identify
contain
revoke
rotate
restore
audit
```

---

## 473. ARTIFACT REVOCATION

> **Origen:** Motor de liquidacion_Security Model & Threat Model 42.md

ARTIFACT REVOCATION

Un Artifact vulnerable puede pasar:

```text
ACTIVE
→ REVOKED
```

---

## 474. PROVIDER REVOCATION

> **Origen:** Motor de liquidacion_Security Model & Threat Model 42.md

PROVIDER REVOCATION

Provider vulnerable puede marcarse:

```text
DISABLED
```

---

## 475. CREDENTIAL ROTATION

> **Origen:** Motor de liquidacion_Security Model & Threat Model 42.md

CREDENTIAL ROTATION

Ante compromise:

```text
rotate credentials
```

---

## 476. SECURITY MONITORING

> **Origen:** Motor de liquidacion_Security Model & Threat Model 42.md

SECURITY MONITORING

Monitorear:

```text
cross-tenant denial
integrity failures
capability denial
provider anomalies
unusual execution volume
```

---

## 477. SECURITY ALERTS

> **Origen:** Motor de liquidacion_Security Model & Threat Model 42.md

SECURITY ALERTS

Alertas críticas:

```text
artifact integrity failure
tenant isolation violation
repeated auth failure
provider compromise indicators
```

---

## 478. RATE LIMITING

> **Origen:** Motor de liquidacion_Security Model & Threat Model 42.md

RATE LIMITING

Aplicar en:

```text
API
Compiler
Artifact publication
Runtime execution
external integrations
```

---

## 479. SECURITY HEADERS

> **Origen:** Motor de liquidacion_Security Model & Threat Model 42.md

SECURITY HEADERS

La plataforma web debe aplicar:

```text
appropriate HTTP security headers
```

fuera del Runtime.

---

## 480. TLS

> **Origen:** Motor de liquidacion_Security Model & Threat Model 42.md

TLS

External communication debe usar:

```text
TLS
```

---

## 481. DATABASE TLS

> **Origen:** Motor de liquidacion_Security Model & Threat Model 42.md

DATABASE TLS

Connections PostgreSQL deben utilizar:

```text
encrypted transport
```

---

## 482. SECRET ROTATION

> **Origen:** Motor de liquidacion_Security Model & Threat Model 42.md

SECRET ROTATION

Secrets deben poder rotarse:

```text
without recompiling AEL
```

---

## 483. ARTIFACT INDEPENDENCE

> **Origen:** Motor de liquidacion_Security Model & Threat Model 42.md

ARTIFACT INDEPENDENCE

Artifact no contiene:

```text
environment secrets
```

---

## 484. ENVIRONMENT BINDING

> **Origen:** Motor de liquidacion_Security Model & Threat Model 42.md

ENVIRONMENT BINDING

Provider configuration pertenece al:

```text
environment
```

no al Source.

---

## 485. SECURITY REVIEW

> **Origen:** Motor de liquidacion_Security Model & Threat Model 42.md

SECURITY REVIEW

Cambios en:

```text
Verifier
Runtime
Provider
RLS
Auth
```

requieren security review.

---

## 486. SECURITY OWNERSHIP

> **Origen:** Motor de liquidacion_Security Model & Threat Model 42.md

SECURITY OWNERSHIP

Cada capa debe tener:

```text
security owner
```

---

## 487. THREAT MODEL MAINTENANCE

> **Origen:** Motor de liquidacion_Security Model & Threat Model 42.md

THREAT MODEL MAINTENANCE

Este Threat Model debe actualizarse cuando aparezcan:

```text
new capability
new provider
new data type
new opcode
new external integration
```

---

## 488. SECURITY EXIT CRITERIA

> **Origen:** Motor de liquidacion_Security Model & Threat Model 42.md

SECURITY EXIT CRITERIA

```text
✓ Threat model
✓ Trust boundaries
✓ Asset inventory
✓ Tenant isolation
✓ Capability security
✓ Artifact integrity
✓ Verifier security
✓ Runtime limits
✓ Provider security
✓ PostgreSQL/RLS
✓ Secret management
✓ SSRF protection
✓ SQL injection protection
✓ Supply-chain security
✓ Registry integrity
✓ Audit
✓ Monitoring
✓ Incident response
✓ Revocation
✓ Credential rotation
✓ Security testing
```

---

## 489. FINAL SECURITY ARCHITECTURE

> **Origen:** Motor de liquidacion_Security Model & Threat Model 42.md

FINAL SECURITY ARCHITECTURE

```text
                         AQUILA
                            │
                     Authentication
                            │
                     Authorization
                            │
                 Tenant + Capabilities
                            │
                            ▼
                         AEL
                            │
                         Artifact
                            │
                       Verifier
                            │
                         Runtime
                            │
                    Integration Layer
                            │
              ┌─────────────┴─────────────┐
              ▼                           ▼
         PostgreSQL                    External APIs
              │
              ▼
             RLS
```

---

## 490. PRINCIPIO DE FAIL-CLOSED

> **Origen:** Motor de liquidacion_Security Model & Threat Model 42.md

PRINCIPIO DE FAIL-CLOSED

```text
Invalid
Unknown
Unauthorized
Expired
Unverified
```

debe resultar en:

```text
DENY
```

---

## 491. PRINCIPIO DE MÍNIMO PRIVILEGIO

> **Origen:** Motor de liquidacion_Security Model & Threat Model 42.md

PRINCIPIO DE MÍNIMO PRIVILEGIO

Ningún componente debe disponer de:

```text
more authority than required
```

---

## 492. PRINCIPIO DE AISLAMIENTO

> **Origen:** Motor de liquidacion_Security Model & Threat Model 42.md

PRINCIPIO DE AISLAMIENTO

```text
Tenant
Execution
Artifact
Provider
Database
```

deben mantener fronteras claras.

---

## 493. PRINCIPIO DE TRAZABILIDAD

> **Origen:** Motor de liquidacion_Security Model & Threat Model 42.md

PRINCIPIO DE TRAZABILIDAD

Debe ser posible responder:

```text
Quién ejecutó
Qué Rule
Qué Artifact
Qué versión
Qué hash
Qué tenant
Qué dependencies
Qué resultado
```

---

## 494. REFERENCIAS

> **Origen:** Motor de liquidacion_Verifier & Static Safety Validation 60.md

REFERENCIAS

Implementa y consume:

```text
Documento 18 — Type System
Documento 42 — Security Model & Threat Model
Documento 43 — Error Model & Diagnostics
Documento 45 — Registry & Dependency Management
Documento 46 — Versioning & Compatibility
Documento 49 — Performance & Scalability
Documento 51 — Financial Types & Numeric Semantics
Documento 54 — Reference Architecture
Documento 55 — Core Domain & Foundational Types
Documento 58 — Semantic Analyzer & Type System Implementation
Documento 59 — Intermediate Representation & Compiler Lowering
```

---

## 495. OBJETIVO

> **Origen:** Motor de liquidacion_Verifier & Static Safety Validation 60.md

OBJETIVO

Transformar:

```text
IR
```

en:

```text
Verified IR
```

o rechazarla mediante diagnostics estructurados.

---

## 496. PIPELINE

> **Origen:** Motor de liquidacion_Verifier & Static Safety Validation 60.md

PIPELINE

```text
Source
 ↓
Tokenizer
 ↓
Parser
 ↓
Semantic Analyzer
 ↓
IR Lowering
 ↓
Verifier
 ↓
Artifact
 ↓
Runtime
```

El Verifier es una frontera de seguridad.

---

## 497. RESPONSABILIDADES

> **Origen:** Motor de liquidacion_Verifier & Static Safety Validation 60.md

RESPONSABILIDADES

Debe comprobar como mínimo:

```text
IR structural integrity
type safety
control-flow integrity
reference validity
resource bounds
capability declarations
side-effect constraints
numeric safety
version compatibility
determinism constraints
```

---

## 498. NO RESPONSABILIDAD

> **Origen:** Motor de liquidacion_Verifier & Static Safety Validation 60.md

NO RESPONSABILIDAD

No debe:

```text
ejecutar Functions
consultar balances reales
calcular liquidaciones de negocio
persistir resultados
resolver HTTP
modificar la IR silenciosamente
```

---

## 499. PACKAGE

> **Origen:** Motor de liquidacion_Verifier & Static Safety Validation 60.md

PACKAGE

```text
packages/ael-verifier/
```

---

## 500. DEPENDENCIES

> **Origen:** Motor de liquidacion_Verifier & Static Safety Validation 60.md

DEPENDENCIES

Permitidas:

```text
ael-core
ael-types
ael-ir
```

y contratos/registry únicamente mediante snapshots o interfaces de consulta controlada.

No depender de Runtime.

---

## 501. VERIFICATION RESULT

> **Origen:** Motor de liquidacion_Verifier & Static Safety Validation 60.md

VERIFICATION RESULT

Conceptualmente:

```ts
interface VerificationResult {
  valid: boolean
  diagnostics: Diagnostic[]
  report: VerificationReport
}
```

---

## 502. VERIFICATION REPORT

> **Origen:** Motor de liquidacion_Verifier & Static Safety Validation 60.md

VERIFICATION REPORT

Debe registrar:

```text
checks executed
checks passed
checks failed
resource estimates
capabilities detected
warnings
```

---

## 503. FAIL CLOSED

> **Origen:** Motor de liquidacion_Verifier & Static Safety Validation 60.md

FAIL CLOSED

Ante una violación de seguridad:

```text
verification = failed
```

Nunca convertir un error crítico en warning.

---

## 504. IR STRUCTURAL VALIDATION

> **Origen:** Motor de liquidacion_Verifier & Static Safety Validation 60.md

IR STRUCTURAL VALIDATION

Validar:

```text
module exists
functions valid
blocks valid
instructions valid
terminators valid
references valid
```

---

## 505. FUNCTION VALIDATION

> **Origen:** Motor de liquidacion_Verifier & Static Safety Validation 60.md

FUNCTION VALIDATION

Cada Function debe tener:

```text
valid id
unique id
valid return type
valid parameters
valid entry block
```

---

## 506. BLOCK VALIDATION

> **Origen:** Motor de liquidacion_Verifier & Static Safety Validation 60.md

BLOCK VALIDATION

Cada block debe:

```text
have unique id
have valid instructions
have exactly one terminator
reference existing blocks
```

---

## 507. TERMINATOR VALIDATION

> **Origen:** Motor de liquidacion_Verifier & Static Safety Validation 60.md

TERMINATOR VALIDATION

Sólo permitir terminators definidos por IR V1:

```text
Return
Jump
Branch
```

---

## 508. UNREACHABLE TERMINATOR

> **Origen:** Motor de liquidacion_Verifier & Static Safety Validation 60.md

UNREACHABLE TERMINATOR

Si existe:

```text
Unreachable
```

debe ser soportado explícitamente por la IR version.

---

## 509. INSTRUCTION VALIDATION

> **Origen:** Motor de liquidacion_Verifier & Static Safety Validation 60.md

INSTRUCTION VALIDATION

Cada instruction debe:

```text
belong to known instruction kind
have valid operands
have valid result type
```

---

## 510. TEMPORAL VALIDATION

> **Origen:** Motor de liquidacion_Verifier & Static Safety Validation 60.md

TEMPORAL VALIDATION

Cada temporary:

```text
must be defined
must have one definition if SSA
must have known type
```

---

## 511. USE BEFORE DEF

> **Origen:** Motor de liquidacion_Verifier & Static Safety Validation 60.md

USE BEFORE DEF

Rechazar:

```text
use of temporary before definition
```

con:

```text
AEL_VERIFY_USE_BEFORE_DEF
```

---

## 512. DUPLICATE DEFINITION

> **Origen:** Motor de liquidacion_Verifier & Static Safety Validation 60.md

DUPLICATE DEFINITION

Si SSA está habilitado:

```text
same temporary defined twice
```

es error.

---

## 513. TYPE CONSISTENCY

> **Origen:** Motor de liquidacion_Verifier & Static Safety Validation 60.md

TYPE CONSISTENCY

Para cada instruction:

```text
operand types
operator
result type
```

deben coincidir con la firma declarada.

---

## 514. INVALID OPERATION

> **Origen:** Motor de liquidacion_Verifier & Static Safety Validation 60.md

INVALID OPERATION

Ejemplo conceptual:

```text
ADD(Money, Boolean)
```

debe rechazarse aunque la IR haya sido construida manualmente.

---

## 515. MONEY SAFETY

> **Origen:** Motor de liquidacion_Verifier & Static Safety Validation 60.md

MONEY SAFETY

Validar las reglas financieras establecidas por el Type System.

No duplicar aquí la especificación; consumirla.

---

## 516. CURRENCY SAFETY

> **Origen:** Motor de liquidacion_Verifier & Static Safety Validation 60.md

CURRENCY SAFETY

Cuando la IR contenga:

```text
Money + Money
```

verificar compatibilidad de currency cuando ésta sea conocida estáticamente.

---

## 517. RATE SAFETY

> **Origen:** Motor de liquidacion_Verifier & Static Safety Validation 60.md

RATE SAFETY

Verificar que:

```text
Money × Rate
```

corresponda a una operación autorizada por el Type System.

---

## 518. QUANTITY SAFETY

> **Origen:** Motor de liquidacion_Verifier & Static Safety Validation 60.md

QUANTITY SAFETY

No aceptar operaciones entre unidades incompatibles.

---

## 519. NULL SAFETY

> **Origen:** Motor de liquidacion_Verifier & Static Safety Validation 60.md

NULL SAFETY

Verificar operaciones sobre tipos nullable según las reglas de tipo.

---

## 520. DIVISION BY ZERO

> **Origen:** Motor de liquidacion_Verifier & Static Safety Validation 60.md

DIVISION BY ZERO

Si el divisor es una constante cero:

```text
verification error
```

Si no puede determinarse estáticamente:

```text
runtime guard requirement
```

según política V1.

---

## 521. NUMERIC BOUNDS

> **Origen:** Motor de liquidacion_Verifier & Static Safety Validation 60.md

NUMERIC BOUNDS

Verificar límites estáticos cuando sean determinables:

```text
integer range
decimal precision
collection sizes
```

---

## 522. OVERFLOW

> **Origen:** Motor de liquidacion_Verifier & Static Safety Validation 60.md

OVERFLOW

Si una operación puede demostrar overflow estático:

```text
verification error
```

Si requiere valor Runtime:

```text
runtime safety requirement
```

---

## 523. ROUNDING

> **Origen:** Motor de liquidacion_Verifier & Static Safety Validation 60.md

ROUNDING

El Verifier debe comprobar que operaciones financieras que requieran rounding utilicen una policy explícita.

No introducir rounding por defecto.

---

## 524. CONTROL FLOW GRAPH

> **Origen:** Motor de liquidacion_Verifier & Static Safety Validation 60.md

CONTROL FLOW GRAPH

Construir internamente un:

```text
Control Flow Graph
```

a partir de los blocks.

---

## 525. CFG NODES

> **Origen:** Motor de liquidacion_Verifier & Static Safety Validation 60.md

CFG NODES

Cada:

```text
IR Block
```

es un nodo.

---

## 526. CFG EDGES

> **Origen:** Motor de liquidacion_Verifier & Static Safety Validation 60.md

CFG EDGES

Edges derivadas de:

```text
Jump
Branch
```

---

## 527. ENTRY

> **Origen:** Motor de liquidacion_Verifier & Static Safety Validation 60.md

ENTRY

Debe existir exactamente un:

```text
entry block
```

por Function.

---

## 528. REACHABILITY

> **Origen:** Motor de liquidacion_Verifier & Static Safety Validation 60.md

REACHABILITY

Detectar blocks:

```text
unreachable
```

Puede ser warning o error según policy.

---

## 529. TERMINAL PATH

> **Origen:** Motor de liquidacion_Verifier & Static Safety Validation 60.md

TERMINAL PATH

Cada ruta ejecutable debe terminar en:

```text
Return
```

o un terminator explícitamente permitido.

---

## 530. INVALID FALLTHROUGH

> **Origen:** Motor de liquidacion_Verifier & Static Safety Validation 60.md

INVALID FALLTHROUGH

No permitir que un block termine sin terminator.

---

## 531. INFINITE LOOP

> **Origen:** Motor de liquidacion_Verifier & Static Safety Validation 60.md

INFINITE LOOP

El Verifier no necesita demostrar formalmente terminación completa.

Debe, sin embargo, aplicar límites estructurales y reglas de loops definidas por policy.

---

## 532. LOOP BOUNDS

> **Origen:** Motor de liquidacion_Verifier & Static Safety Validation 60.md

LOOP BOUNDS

Si el lenguaje permite loops:

```text
maximum iteration budget
```

debe quedar definido para ejecución segura.

---

## 533. RECURSION

> **Origen:** Motor de liquidacion_Verifier & Static Safety Validation 60.md

RECURSION

Debe existir límite de:

```text
call depth
```

si se permiten llamadas recursivas.

---

## 534. CALL GRAPH

> **Origen:** Motor de liquidacion_Verifier & Static Safety Validation 60.md

CALL GRAPH

Construir:

```text
Function → Function
```

cuando las llamadas sean resolubles estáticamente.

---

## 535. RECURSIVE CYCLE

> **Origen:** Motor de liquidacion_Verifier & Static Safety Validation 60.md

RECURSIVE CYCLE

Detectar ciclos de llamada cuando la policy los prohíba o requiera límites.

---

## 536. EXTERNAL CALLS

> **Origen:** Motor de liquidacion_Verifier & Static Safety Validation 60.md

EXTERNAL CALLS

Cada external call debe indicar:

```text
capability
target
expected input types
expected output type
effect
```

---

## 537. CAPABILITY DECLARATION

> **Origen:** Motor de liquidacion_Verifier & Static Safety Validation 60.md

CAPABILITY DECLARATION

Un Artifact sólo puede solicitar capabilities declaradas.

---

## 538. UNDECLARED CAPABILITY

> **Origen:** Motor de liquidacion_Verifier & Static Safety Validation 60.md

UNDECLARED CAPABILITY

Error:

```text
AEL_VERIFY_UNDECLARED_CAPABILITY
```

---

## 539. CAPABILITY ALLOWLIST

> **Origen:** Motor de liquidacion_Verifier & Static Safety Validation 60.md

CAPABILITY ALLOWLIST

La compilación debe poder recibir una allowlist:

```text
allowedCapabilities[]
```

---

## 540. CAPABILITY MINIMIZATION

> **Origen:** Motor de liquidacion_Verifier & Static Safety Validation 60.md

CAPABILITY MINIMIZATION

El Artifact debe declarar sólo capabilities realmente utilizadas.

---

## 541. EXCESS CAPABILITY

> **Origen:** Motor de liquidacion_Verifier & Static Safety Validation 60.md

EXCESS CAPABILITY

Una capability declarada pero no utilizada debe generar warning o ser eliminada antes del Artifact, según policy.

---

## 542. SIDE EFFECTS

> **Origen:** Motor de liquidacion_Verifier & Static Safety Validation 60.md

SIDE EFFECTS

Clasificar llamadas/instructions:

```text
Pure
Read
Write
External
```

---

## 543. PURE FUNCTION

> **Origen:** Motor de liquidacion_Verifier & Static Safety Validation 60.md

PURE FUNCTION

Una Function pure no puede depender de operaciones con efectos incompatibles.

---

## 544. SIDE EFFECT VIOLATION

> **Origen:** Motor de liquidacion_Verifier & Static Safety Validation 60.md

SIDE EFFECT VIOLATION

Error:

```text
AEL_VERIFY_SIDE_EFFECT_VIOLATION
```

---

## 545. TENANT CONTEXT

> **Origen:** Motor de liquidacion_Verifier & Static Safety Validation 60.md

TENANT CONTEXT

Si una capability requiere tenant context:

```text
TenantContext
```

debe ser obligatorio.

---

## 546. TENANT ISOLATION

> **Origen:** Motor de liquidacion_Verifier & Static Safety Validation 60.md

TENANT ISOLATION

El Verifier debe impedir que una operación marcada como tenant-scoped pueda ejecutarse sin contexto de tenant.

---

## 547. CROSS-TENANT

> **Origen:** Motor de liquidacion_Verifier & Static Safety Validation 60.md

CROSS-TENANT

Las operaciones cross-tenant deben requerir capability explícita y policy específica.

---

## 548. DATA ACCESS

> **Origen:** Motor de liquidacion_Verifier & Static Safety Validation 60.md

DATA ACCESS

IR no debe contener acceso directo a:

```text
database connections
```

Sólo referencias abstractas a capabilities/contracts.

---

## 549. SECRET SAFETY

> **Origen:** Motor de liquidacion_Verifier & Static Safety Validation 60.md

SECRET SAFETY

No permitir constantes que parezcan contener:

```text
passwords
API keys
tokens
private keys
```

si la policy de static scanning las detecta.

---

## 550. SOURCE METADATA

> **Origen:** Motor de liquidacion_Verifier & Static Safety Validation 60.md

SOURCE METADATA

El Verifier debe conservar source spans para diagnostics cuando estén disponibles.

---

## 551. VERSION CHECK

> **Origen:** Motor de liquidacion_Verifier & Static Safety Validation 60.md

VERSION CHECK

Validar:

```text
languageVersion
irVersion
compilerVersion
registry snapshot
```

contra las compatibilidades soportadas.

---

## 552. IR VERSION MISMATCH

> **Origen:** Motor de liquidacion_Verifier & Static Safety Validation 60.md

IR VERSION MISMATCH

Error:

```text
AEL_VERIFY_IR_VERSION
```

---

## 553. LANGUAGE VERSION MISMATCH

> **Origen:** Motor de liquidacion_Verifier & Static Safety Validation 60.md

LANGUAGE VERSION MISMATCH

Error:

```text
AEL_VERIFY_LANGUAGE_VERSION
```

---

## 554. REGISTRY VERSION

> **Origen:** Motor de liquidacion_Verifier & Static Safety Validation 60.md

REGISTRY VERSION

Un Artifact no debe depender silenciosamente de un Registry diferente al snapshot con el que fue compilado.

---

## 555. REGISTRY INTEGRITY

> **Origen:** Motor de liquidacion_Verifier & Static Safety Validation 60.md

REGISTRY INTEGRITY

Si se utiliza hash/version del Registry:

```text
verify snapshot identity
```

---

## 556. ARTIFACT DETERMINISM

> **Origen:** Motor de liquidacion_Verifier & Static Safety Validation 60.md

ARTIFACT DETERMINISM

Verificar que no existan elementos que impidan:

```text
canonical serialization
```

---

## 557. NON-DETERMINISTIC VALUES

> **Origen:** Motor de liquidacion_Verifier & Static Safety Validation 60.md

NON-DETERMINISTIC VALUES

No permitir en Artifact:

```text
random IDs
current timestamp
memory addresses
environment-dependent paths
```

salvo que estén explícitamente fuera del hash y documentados.

---

## 558. TIME

> **Origen:** Motor de liquidacion_Verifier & Static Safety Validation 60.md

TIME

El uso de tiempo Runtime debe pasar por:

```text
Clock capability
```

cuando la operación lo requiera.

---

## 559. RANDOMNESS

> **Origen:** Motor de liquidacion_Verifier & Static Safety Validation 60.md

RANDOMNESS

Randomness debe ser una capability explícita si alguna versión futura la permite.

---

## 560. RESOURCE LIMITS

> **Origen:** Motor de liquidacion_Verifier & Static Safety Validation 60.md

RESOURCE LIMITS

Configurar límites para:

```text
max source size
max functions
max blocks
max instructions
max call depth
max loop iterations
max collection size
max object properties
max string length
max decimal precision
```

según policy.

---

## 561. STATIC ESTIMATION

> **Origen:** Motor de liquidacion_Verifier & Static Safety Validation 60.md

STATIC ESTIMATION

El Verifier debe calcular estimaciones cuando sea posible:

```text
instruction count
block count
call depth
constant sizes
```

---

## 562. RESOURCE BUDGET

> **Origen:** Motor de liquidacion_Verifier & Static Safety Validation 60.md

RESOURCE BUDGET

El Artifact puede almacenar:

```text
declared budget
verified budget
```

---

## 563. BUDGET EXCEEDED

> **Origen:** Motor de liquidacion_Verifier & Static Safety Validation 60.md

BUDGET EXCEEDED

Error:

```text
AEL_VERIFY_RESOURCE_LIMIT
```

---

## 564. COLLECTION LIMIT

> **Origen:** Motor de liquidacion_Verifier & Static Safety Validation 60.md

COLLECTION LIMIT

Si una constante crea una colección demasiado grande:

```text
verification error
```

---

## 565. STRING LIMIT

> **Origen:** Motor de liquidacion_Verifier & Static Safety Validation 60.md

STRING LIMIT

Literal/string constante sobre el límite:

```text
verification error
```

---

## 566. NESTING LIMIT

> **Origen:** Motor de liquidacion_Verifier & Static Safety Validation 60.md

NESTING LIMIT

Profundidad estructural excesiva:

```text
verification error
```

---

## 567. INSTRUCTION LIMIT

> **Origen:** Motor de liquidacion_Verifier & Static Safety Validation 60.md

INSTRUCTION LIMIT

Artifact que exceda el límite configurado:

```text
verification error
```

---

## 568. FUNCTION COUNT LIMIT

> **Origen:** Motor de liquidacion_Verifier & Static Safety Validation 60.md

FUNCTION COUNT LIMIT

Exceso de Functions:

```text
verification error
```

---

## 569. CALL DEPTH

> **Origen:** Motor de liquidacion_Verifier & Static Safety Validation 60.md

CALL DEPTH

Si es estáticamente demostrable que excede el máximo:

```text
verification error
```

Si depende de Runtime:

```text
runtime guard
```

---

## 570. LOOP BUDGET

> **Origen:** Motor de liquidacion_Verifier & Static Safety Validation 60.md

LOOP BUDGET

El Runtime debe recibir el presupuesto necesario cuando no pueda verificarse estáticamente.

---

## 571. ARTIFACT ELIGIBILITY

> **Origen:** Motor de liquidacion_Verifier & Static Safety Validation 60.md

ARTIFACT ELIGIBILITY

Sólo una IR que pase todos los checks críticos puede convertirse en:

```text
Verified Artifact
```

---

## 572. VERIFIED ARTIFACT

> **Origen:** Motor de liquidacion_Verifier & Static Safety Validation 60.md

VERIFIED ARTIFACT

Conceptualmente:

```ts
interface VerifiedArtifact {
  artifactVersion: string
  ir: IrModule
  verification: VerificationReport
  integrityHash: string
}
```

El modelo definitivo será especificado en el documento de Artifact.

---

## 573. TRUST BOUNDARY

> **Origen:** Motor de liquidacion_Verifier & Static Safety Validation 60.md

TRUST BOUNDARY

El Runtime debe aceptar:

```text
Verified Artifact
```

y no:

```text
unverified IR
```

---

## 574. ARTIFACT HASH

> **Origen:** Motor de liquidacion_Verifier & Static Safety Validation 60.md

ARTIFACT HASH

El hash debe calcularse sobre:

```text
canonical artifact representation
```

---

## 575. HASH INPUT

> **Origen:** Motor de liquidacion_Verifier & Static Safety Validation 60.md

HASH INPUT

No incluir:

```text
runtime timestamp
execution id
machine path
memory address
```

---

## 576. SIGNATURE

> **Origen:** Motor de liquidacion_Verifier & Static Safety Validation 60.md

SIGNATURE

Si posteriormente existe firma criptográfica:

```text
signature
```

debe cubrir la representación canónica del Artifact.

No implementarla aquí salvo que el package la requiera.

---

## 577. VERIFICATION REPORT

> **Origen:** Motor de liquidacion_Verifier & Static Safety Validation 60.md

VERIFICATION REPORT

Debe incluir:

```text
verifierVersion
policyVersion
checks
capabilities
resourceBudget
registrySnapshot
```

---

## 578. CHECK IDENTIFIERS

> **Origen:** Motor de liquidacion_Verifier & Static Safety Validation 60.md

CHECK IDENTIFIERS

Cada check debe tener identificador estable:

```text
STRUCTURE
TYPE_SAFETY
CONTROL_FLOW
CAPABILITIES
RESOURCES
VERSION
DETERMINISM
FINANCIAL_SAFETY
```

---

## 579. DIAGNOSTIC CATALOG

> **Origen:** Motor de liquidacion_Verifier & Static Safety Validation 60.md

DIAGNOSTIC CATALOG

Inicial:

```text
AEL_VERIFY_INVALID_IR
AEL_VERIFY_INVALID_BLOCK
AEL_VERIFY_INVALID_REFERENCE
AEL_VERIFY_USE_BEFORE_DEF
AEL_VERIFY_INVALID_TYPE
AEL_VERIFY_INVALID_TERMINATOR
AEL_VERIFY_UNDECLARED_CAPABILITY
AEL_VERIFY_SIDE_EFFECT_VIOLATION
AEL_VERIFY_RESOURCE_LIMIT
AEL_VERIFY_IR_VERSION
AEL_VERIFY_LANGUAGE_VERSION
AEL_VERIFY_REGISTRY_MISMATCH
AEL_VERIFY_NON_DETERMINISTIC
AEL_VERIFY_FINANCIAL_SAFETY
AEL_VERIFY_TENANT_CONTEXT
AEL_VERIFY_DIVISION_BY_ZERO
```

---

## 580. WARNING CATALOG

> **Origen:** Motor de liquidacion_Verifier & Static Safety Validation 60.md

WARNING CATALOG

Warnings no críticos:

```text
AEL_VERIFY_UNREACHABLE_BLOCK
AEL_VERIFY_UNUSED_CAPABILITY
AEL_VERIFY_DEAD_CODE
```

La política debe determinar si warnings bloquean publicación.

---

## 581. FAIL-CLOSED POLICY

> **Origen:** Motor de liquidacion_Verifier & Static Safety Validation 60.md

FAIL-CLOSED POLICY

Los siguientes siempre bloquean:

```text
invalid IR
invalid type
invalid reference
undeclared capability
resource violation
version incompatibility
financial safety violation
tenant safety violation
non-determinism
```

---

## 582. NO AUTO-FIX

> **Origen:** Motor de liquidacion_Verifier & Static Safety Validation 60.md

NO AUTO-FIX

El Verifier no debe modificar silenciosamente la IR.

---

## 583. NO IMPLICIT ROUNDING

> **Origen:** Motor de liquidacion_Verifier & Static Safety Validation 60.md

NO IMPLICIT ROUNDING

Nunca corregir:

```text
Money
Decimal
Rate
```

insertando rounding automáticamente.

---

## 584. NO IMPLICIT CAST

> **Origen:** Motor de liquidacion_Verifier & Static Safety Validation 60.md

NO IMPLICIT CAST

No insertar conversiones no definidas por el Type System.

---

## 585. FINANCIAL POLICY

> **Origen:** Motor de liquidacion_Verifier & Static Safety Validation 60.md

FINANCIAL POLICY

La validación financiera debe utilizar las reglas centrales del Type System y Financial Domain.

No duplicar tablas de reglas.

---

## 586. STATIC FINANCIAL CHECK

> **Origen:** Motor de liquidacion_Verifier & Static Safety Validation 60.md

STATIC FINANCIAL CHECK

Ejemplos:

```text
Money(COP) + Money(USD) → reject
Money + Boolean → reject
Rate + Money → reject
```

si son determinables estáticamente.

---

## 587. RUNTIME FINANCIAL CHECK

> **Origen:** Motor de liquidacion_Verifier & Static Safety Validation 60.md

RUNTIME FINANCIAL CHECK

Si una condición depende de valores Runtime:

```text
emit guard requirement
```

en vez de fingir certeza estática.

---

## 588. GUARDS

> **Origen:** Motor de liquidacion_Verifier & Static Safety Validation 60.md

GUARDS

Un guard puede representar:

```text
division non-zero
currency compatibility
range
nullability
```

según Runtime design.

---

## 589. GUARD METADATA

> **Origen:** Motor de liquidacion_Verifier & Static Safety Validation 60.md

GUARD METADATA

Cada guard debe identificar:

```text
condition
source span
error code
```

---

## 590. GUARD DETERMINISM

> **Origen:** Motor de liquidacion_Verifier & Static Safety Validation 60.md

GUARD DETERMINISM

Los guards deben ser deterministas.

---

## 591. SECURITY GUARDS

> **Origen:** Motor de liquidacion_Verifier & Static Safety Validation 60.md

SECURITY GUARDS

Capabilities y tenant context pueden requerir runtime guards.

---

## 592. EXTERNAL DATA

> **Origen:** Motor de liquidacion_Verifier & Static Safety Validation 60.md

EXTERNAL DATA

Nunca considerar datos externos como constantes durante verification.

---

## 593. PROVIDER CONTRACT

> **Origen:** Motor de liquidacion_Verifier & Static Safety Validation 60.md

PROVIDER CONTRACT

El Verifier sólo comprueba el contrato declarado:

```text
input types
output type
effects
capability
```

---

## 594. PROVIDER TRUST

> **Origen:** Motor de liquidacion_Verifier & Static Safety Validation 60.md

PROVIDER TRUST

El comportamiento real del Provider debe verificarse en su propia frontera de seguridad.

No asumir que Provider es confiable por estar registrado.

---

## 595. REGISTRY SNAPSHOT

> **Origen:** Motor de liquidacion_Verifier & Static Safety Validation 60.md

REGISTRY SNAPSHOT

El Artifact debe quedar vinculado a un snapshot estable del Registry.

---

## 596. COMPILER POLICY

> **Origen:** Motor de liquidacion_Verifier & Static Safety Validation 60.md

COMPILER POLICY

La política de verificación debe ser explícita:

```text
VerificationPolicy
```

---

## 597. POLICY VERSION

> **Origen:** Motor de liquidacion_Verifier & Static Safety Validation 60.md

POLICY VERSION

Debe tener:

```text
policyVersion
```

---

## 598. POLICY IMMUTABILITY

> **Origen:** Motor de liquidacion_Verifier & Static Safety Validation 60.md

POLICY IMMUTABILITY

Una compilación utiliza una policy snapshot estable.

---

## 599. STRUCTURAL TEST

> **Origen:** Motor de liquidacion_Verifier & Static Safety Validation 60.md

STRUCTURAL TEST

Crear IR inválida:

```text
missing terminator
```

y verificar rechazo.

---

## 600. REFERENCE TEST

> **Origen:** Motor de liquidacion_Verifier & Static Safety Validation 60.md

REFERENCE TEST

Crear:

```text
Jump unknownBlock
```

y verificar:

```text
AEL_VERIFY_INVALID_REFERENCE
```

---

## 601. SSA TEST

> **Origen:** Motor de liquidacion_Verifier & Static Safety Validation 60.md

SSA TEST

Definir un temporal dos veces.

Esperado:

```text
verification failure
```

---

## 602. TYPE TEST

> **Origen:** Motor de liquidacion_Verifier & Static Safety Validation 60.md

TYPE TEST

Crear:

```text
ADD(Money, Boolean)
```

Esperado:

```text
verification failure
```

---

## 603. CAPABILITY TEST

> **Origen:** Motor de liquidacion_Verifier & Static Safety Validation 60.md

CAPABILITY TEST

Crear external call sin capability declarada.

Esperado:

```text
AEL_VERIFY_UNDECLARED_CAPABILITY
```

---

## 604. RESOURCE TEST

> **Origen:** Motor de liquidacion_Verifier & Static Safety Validation 60.md

RESOURCE TEST

Artifact con más instrucciones que el límite.

Esperado:

```text
AEL_VERIFY_RESOURCE_LIMIT
```

---

## 605. VERSION TEST

> **Origen:** Motor de liquidacion_Verifier & Static Safety Validation 60.md

VERSION TEST

Artifact con IR version incompatible.

Esperado:

```text
AEL_VERIFY_IR_VERSION
```

---

## 606. DETERMINISM TEST

> **Origen:** Motor de liquidacion_Verifier & Static Safety Validation 60.md

DETERMINISM TEST

IR con ID aleatorio incorporado al contenido canónico.

Esperado:

```text
AEL_VERIFY_NON_DETERMINISTIC
```

---

## 607. FINANCIAL TEST

> **Origen:** Motor de liquidacion_Verifier & Static Safety Validation 60.md

FINANCIAL TEST

Intentar:

```text
Money(COP) + Money(USD)
```

y verificar rechazo cuando currency sea estática.

---

## 608. TENANT TEST

> **Origen:** Motor de liquidacion_Verifier & Static Safety Validation 60.md

TENANT TEST

Capability tenant-scoped sin TenantContext.

Esperado:

```text
AEL_VERIFY_TENANT_CONTEXT
```

---

## 609. DIVISION TEST

> **Origen:** Motor de liquidacion_Verifier & Static Safety Validation 60.md

DIVISION TEST

Constante cero como divisor.

Esperado:

```text
AEL_VERIFY_DIVISION_BY_ZERO
```

---

## 610. GUARD TEST

> **Origen:** Motor de liquidacion_Verifier & Static Safety Validation 60.md

GUARD TEST

Divisor desconocido en Runtime.

Esperado:

```text
runtime guard metadata
```

y no falsa aprobación absoluta.

---

## 611. RECURSION TEST

> **Origen:** Motor de liquidacion_Verifier & Static Safety Validation 60.md

RECURSION TEST

Call graph que exceda policy.

Esperado:

```text
verification failure
```

cuando sea demostrable.

---

## 612. DETERMINISM TEST

> **Origen:** Motor de liquidacion_Verifier & Static Safety Validation 60.md

DETERMINISM TEST

Misma IR + misma policy:

```text
same verification report
```

---

## 613. PERFORMANCE TEST

> **Origen:** Motor de liquidacion_Verifier & Static Safety Validation 60.md

PERFORMANCE TEST

Verificar módulos crecientes:

```text
small
medium
large
```

sin comportamiento explosivo.

---

## 614. SECURITY TEST

> **Origen:** Motor de liquidacion_Verifier & Static Safety Validation 60.md

SECURITY TEST

Confirmar que el Verifier no ejecuta:

```text
Function
Provider
Contract
```

durante verification.

---

## 615. NO NETWORK TEST

> **Origen:** Motor de liquidacion_Verifier & Static Safety Validation 60.md

NO NETWORK TEST

La verificación debe poder ejecutarse offline.

---

## 616. NO DATABASE TEST

> **Origen:** Motor de liquidacion_Verifier & Static Safety Validation 60.md

NO DATABASE TEST

No requerir conexiones de datos reales.

---

## 617. TRUST MODEL

> **Origen:** Motor de liquidacion_Verifier & Static Safety Validation 60.md

TRUST MODEL

La cadena de confianza queda:

```text
Source
  ↓
Compiled
  ↓
Semantically Valid
  ↓
IR Valid
  ↓
Verified
  ↓
Artifact
  ↓
Runtime
```

Cada etapa agrega garantías; ninguna debe eliminar las anteriores.

---

## 618. PRINCIPIO DE SEGURIDAD

> **Origen:** Motor de liquidacion_Verifier & Static Safety Validation 60.md

PRINCIPIO DE SEGURIDAD

```text
Unverified
≠
Executable
```

---

## 619. PRINCIPIO FINANCIERO

> **Origen:** Motor de liquidacion_Verifier & Static Safety Validation 60.md

PRINCIPIO FINANCIERO

```text
Semantically valid
≠
Financially safe
```

La verificación debe comprobar las garantías que puedan demostrarse antes de ejecución y marcar guards para las que dependan de datos Runtime.

---
