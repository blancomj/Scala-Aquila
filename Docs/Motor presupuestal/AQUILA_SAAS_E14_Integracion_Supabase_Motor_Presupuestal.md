# AQUILA_SAAS — E-14
## Integración del Motor Presupuestal con Supabase

**Proyecto:** AQUILA_SAAS  
**Ámbito:** Administración de propiedad horizontal en Colombia  
**Etapa:** Integración técnica  
**Versión:** 1.0  
**Fecha:** 14 de agosto de 2026

---

# 1. Objetivo

Definir la integración del Motor Presupuestal de AQUILA_SAAS con:

- PostgreSQL/Supabase;
- autenticación;
- Row Level Security (RLS);
- RPC;
- Edge Functions;
- frontend Nuxt/Vue;
- control multitenant.

La arquitectura debe mantener una separación estricta:

```text
FRONTEND
   ↓
EDGE FUNCTION / RPC
   ↓
MOTOR DE DOMINIO
   ↓
POSTGRESQL
   ↓
RESULTADO
```

El frontend no ejecuta la lógica matemática crítica.

---

# 2. Fundamento técnico Supabase

Supabase proporciona PostgreSQL como base de datos central y permite utilizar funciones PostgreSQL mediante RPC. citeturn0search8turn0search7

Para tablas expuestas debe utilizarse RLS y las políticas se aplican directamente en PostgreSQL. Supabase integra RLS con Supabase Auth mediante funciones como `auth.uid()` y `auth.jwt()`. citeturn0search2

Las Edge Functions son funciones TypeScript ejecutadas en el servidor y pueden recibir solicitudes autenticadas, aplicar controles y utilizar Supabase para acceder a PostgreSQL. citeturn0search1turn0search0

---

# 3. Arquitectura definitiva

```text
┌──────────────────────────────────────────┐
│              NUXT / VUE                  │
│                                          │
│  Pantallas presupuestales                │
│  Formularios                             │
│  Resultados                              │
└────────────────────┬─────────────────────┘
                     │
                     │ HTTPS
                     ↓
┌──────────────────────────────────────────┐
│          SUPABASE EDGE FUNCTION          │
│                                          │
│  Autenticación                           │
│  Autorización funcional                  │
│  Validación de entrada                   │
│  Orquestación                            │
└────────────────────┬─────────────────────┘
                     │
                     │ RPC
                     ↓
┌──────────────────────────────────────────┐
│              POSTGRESQL                  │
│                                          │
│  RLS                                     │
│  Funciones del Motor                     │
│  Transacciones                           │
│  Integridad                              │
│  Auditoría                               │
└──────────────────────────────────────────┘
```

---

# 4. Responsabilidad de cada capa

## Frontend

Responsable de:

```text
✓ Captura de datos
✓ Presentación
✓ Validaciones UX
✓ Mensajes
✓ Estado visual
```

No debe ser responsable de:

```text
✗ cálculo definitivo
✗ distribución definitiva
✗ aprobación
✗ reglas jurídicas
✗ bypass de seguridad
```

---

## Edge Function

Responsable de:

```text
✓ autenticación
✓ autorización funcional
✓ validación de payload
✓ invocación del motor
✓ normalización de errores
✓ respuesta HTTP
```

No debe duplicar las fórmulas del motor.

---

## PostgreSQL

Responsable de:

```text
✓ persistencia
✓ RLS
✓ integridad
✓ cálculo crítico
✓ distribución
✓ validación
✓ transacciones
✓ versionamiento
✓ auditoría
```

---

# 5. Regla de seguridad fundamental

El usuario autenticado debe llegar hasta PostgreSQL conservando su contexto de autenticación.

Supabase permite que una función acceda a datos aplicando las políticas RLS del usuario autenticado. La documentación actual recomienda mantener la validación JWT para funciones llamadas por usuarios y utilizar un cliente Supabase asociado al contexto del usuario. citeturn0search0turn0search6

Por tanto:

```text
JWT usuario
    ↓
Edge Function
    ↓
contexto autenticado
    ↓
PostgreSQL
    ↓
RLS
```

---

# 6. Multitenancy

AQUILA debe garantizar:

\[
Usuario \rightarrow Copropiedad \rightarrow Datos
\]

No debe confiarse exclusivamente en un `copropiedad_id` enviado por el frontend.

Ejemplo incorrecto:

```json
{
  "copropiedad_id": "otra-copropiedad"
}
```

y aceptar el valor directamente.

La copropiedad debe determinarse mediante la relación autorizada:

```text
auth.uid()
   ↓
usuario_copropiedad
   ↓
copropiedad_id
```

---

# 7. Contexto de autorización

El modelo debe utilizar una relación de pertenencia:

```text
usuario
    ↓
usuario_copropiedad
    ↓
copropiedad
```

Y, si corresponde al modelo de AQUILA:

```text
usuario
    ↓
usuario_copropiedad
    ↓
rol
```

Ejemplo conceptual:

```text
usuario_id
copropiedad_id
rol_id
estado
```

La autorización debe basarse en datos controlados por el sistema, no en información editable por el usuario.

Supabase advierte que `raw_user_meta_data` puede ser modificable por el usuario y no es un lugar apropiado para datos de autorización; `raw_app_meta_data` es apropiado para información de autorización controlada por el servidor. citeturn0search2

---

# 8. RLS

Todas las tablas presupuestales expuestas deben tener RLS habilitado.

Ejemplo:

```sql
alter table presupuesto
enable row level security;
```

Supabase indica que las tablas del esquema expuesto deben protegerse con RLS. citeturn0search2

---

# 9. Patrón RLS multitenant

Cuando una tabla contiene directamente:

```text
copropiedad_id
```

la política puede utilizar esa columna.

Cuando una tabla depende de otra:

```text
componente
   ↓
presupuesto
   ↓
vigencia
   ↓
copropiedad
```

la política debe resolver la pertenencia a la copropiedad mediante una relación segura.

Conceptualmente:

```sql
using (
    exists (
        select 1
        from presupuesto p
        join vigencia_presupuestal v
          on v.id = p.vigencia_id
        where p.id = componente_presupuestal.presupuesto_id
          and v.copropiedad_id = fn_copropiedad_usuario()
    )
)
```

La función `fn_copropiedad_usuario()` debe resolver la copropiedad autorizada del usuario.

---

# 10. Función de contexto de tenant

Se requiere una función centralizada:

```sql
fn_usuario_tiene_acceso_copropiedad(
    p_copropiedad_id uuid
)
returns boolean
```

Responsabilidad:

```text
1. Obtener auth.uid().
2. Buscar relación usuario/copropiedad.
3. Verificar estado.
4. Verificar autorización.
5. Devolver TRUE/FALSE.
```

No debe existir una copia diferente de esta lógica en cada política.

---

# 11. RLS y roles

El RLS determina:

> **qué filas puede ver o modificar el usuario.**

El rol de aplicación determina:

> **qué operación funcional puede realizar.**

Por tanto:

```text
RLS
↓
acceso a datos

ROL
↓
acción permitida
```

Ejemplo:

```text
Administrador
✓ preparar presupuesto
✓ recalcular
✓ presentar
✓ gestionar configuración

Auditor
✓ consultar
✗ modificar

Invitado
✓ consultar información permitida
✗ modificar
```

Los roles exactos serán los definidos por el modelo de seguridad de AQUILA.

---

# 12. RPC

Las funciones PostgreSQL del motor pueden exponerse como RPC.

Supabase permite invocar funciones PostgreSQL desde `supabase-js` mediante `.rpc()`. citeturn0search7

Ejemplo conceptual:

```ts
const { data, error } = await supabase
  .rpc('fn_procesar_presupuesto', {
    p_presupuesto_id: presupuestoId
  })
```

Pero:

> **No todas las funciones del motor deben quedar públicas como RPC.**

Las funciones internas deben permanecer encapsuladas.

---

# 13. RPC pública del motor

Se recomienda exponer solamente funciones de dominio:

```text
fn_obtener_presupuesto
fn_validar_presupuesto
fn_procesar_presupuesto
fn_aprobar_presupuesto
fn_crear_nueva_version_presupuesto
```

No exponer directamente:

```text
fn_distribuir_coeficiente
fn_resolver_residual
fn_calc_...
```

porque son funciones internas.

---

# 14. Edge Function

La Edge Function será la puerta de entrada para operaciones complejas.

Funciones iniciales:

```text
presupuesto-procesar
presupuesto-aprobar
presupuesto-versionar
```

Arquitectura:

```text
POST /functions/v1/presupuesto-procesar
             ↓
        autenticación
             ↓
       autorización
             ↓
          RPC
             ↓
      Motor PostgreSQL
```

Las Edge Functions son apropiadas para endpoints HTTP autenticados y para orquestación server-side. citeturn0search1

---

# 15. Autenticación de Edge Functions

Para funciones llamadas por usuarios autenticados:

```text
Authorization:
Bearer <user-jwt>
```

La documentación actual de Supabase indica que `verify_jwt` está habilitado por defecto y que las funciones autenticadas pueden utilizar el contexto del usuario. citeturn0search3turn0search0

No debe enviarse una publishable key o secret key como `Bearer` token; las API keys y los JWT tienen funciones distintas. citeturn0search3

---

# 16. Uso de privilegios elevados

Una Edge Function puede disponer de un cliente administrativo que bypassa RLS.

Esto debe considerarse:

```text
PELIGROSO
```

No se utilizará para operaciones normales del Motor Presupuestal.

Regla:

```text
Usuario
   ↓
RLS
   ↓
Motor
```

El cliente privilegiado solo se utilizará para operaciones administrativas internas claramente justificadas.

Supabase documenta que el cliente con privilegios administrativos puede bypassar RLS, por lo que debe mantenerse fuera del código accesible al cliente. citeturn0search0turn0search4

---

# 17. Separación entre lectura y escritura

## Lecturas

Podrán utilizar:

```text
Supabase Client
   ↓
RLS
   ↓
SELECT
```

## Operaciones críticas

Utilizarán:

```text
Frontend
   ↓
Edge Function
   ↓
RPC
   ↓
PostgreSQL
```

Esto reduce la posibilidad de ejecutar operaciones críticas directamente desde la interfaz.

---

# 18. Flujo: preparar presupuesto

```text
Usuario
 ↓
Frontend
 ↓
presupuesto-procesar
 ↓
JWT válido
 ↓
Verificar copropiedad
 ↓
Verificar rol
 ↓
RPC fn_procesar_presupuesto()
 ↓
PostgreSQL
 ↓
RLS + funciones
 ↓
Resultado
 ↓
Frontend
```

---

# 19. Flujo: aprobar presupuesto

La aprobación requiere mayor control:

```text
Usuario autorizado
       ↓
Edge Function
       ↓
Verificar rol
       ↓
Verificar presupuesto PRESENTADO
       ↓
RPC fn_aprobar_presupuesto()
       ↓
Validación matemática
       ↓
Registrar aprobación
       ↓
APROBADO
```

Nunca:

```text
Frontend → UPDATE estado='APROBADO'
```

---

# 20. Flujo: nueva versión

```text
Presupuesto APROBADO
       ↓
Solicitud de modificación
       ↓
Autorización
       ↓
fn_crear_nueva_version_presupuesto()
       ↓
Nueva versión BORRADOR
       ↓
Modificar
       ↓
Procesar
       ↓
Validar
       ↓
Presentar
       ↓
Aprobar
```

La versión anterior permanece intacta.

---

# 21. Flujo de errores

La base de datos debe devolver códigos de dominio.

Ejemplo:

```json
{
  "code": "DISTRIBUCION_NO_CONSERVA_COMPONENTE",
  "message": "La distribución no conserva la necesidad financiera.",
  "details": {
    "componente_id": "...",
    "necesidad": 100000000,
    "distribuido": 99999999.99
  }
}
```

La Edge Function transforma esto en HTTP.

Ejemplo:

```http
422 Unprocessable Entity
```

---

# 22. Códigos HTTP recomendados

```text
400 → payload inválido
401 → no autenticado
403 → no autorizado
404 → recurso inexistente
409 → conflicto de estado/versionamiento
422 → regla de negocio incumplida
500 → error interno
```

Los códigos de dominio permanecen independientes de HTTP.

---

# 23. Contrato de `presupuesto-procesar`

### Request

```json
{
  "presupuesto_id": "uuid"
}
```

### Response exitosa

```json
{
  "ok": true,
  "presupuesto_id": "uuid",
  "valido": true,
  "totales": {
    "necesidad": 100000000,
    "distribuido": 100000000
  }
}
```

### Response con error de negocio

```json
{
  "ok": false,
  "code": "PRESUPUESTO_NO_VALIDO",
  "message": "El presupuesto no supera las validaciones.",
  "details": {}
}
```

---

# 24. Contrato de `presupuesto-aprobar`

### Request

```json
{
  "presupuesto_id": "uuid",
  "referencia_acta": "ACTA-2027-001"
}
```

El usuario no debe enviar:

```json
{
  "usuario_id": "..."
}
```

El usuario autenticado debe determinarse desde el contexto de autenticación.

---

# 25. Contrato de `presupuesto-versionar`

### Request

```json
{
  "presupuesto_id": "uuid"
}
```

### Response

```json
{
  "ok": true,
  "nuevo_presupuesto_id": "uuid",
  "version": 2,
  "estado": "BORRADOR"
}
```

---

# 26. Seguridad del frontend

El frontend puede enviar:

```text
presupuesto_id
```

pero no debe tener autoridad para decidir:

```text
copropiedad_id autorizado
usuario_id
rol
estado final
fecha aprobación
```

Estos datos deben ser determinados o validados en servidor.

---

# 27. Índices para RLS

Las columnas utilizadas frecuentemente por las políticas deben estar indexadas.

Supabase recomienda indexar las columnas usadas por políticas RLS y optimizar llamadas a funciones como `auth.uid()` para mejorar el rendimiento. citeturn0search2

Por tanto, deberán revisarse índices sobre:

```text
copropiedad_id
usuario_id
vigencia_id
presupuesto_id
unidad_privada_id
```

según las políticas finales.

---

# 28. Evitar políticas RLS duplicadas

No crear una política diferente con la misma lógica para cada tabla sin una razón.

Se debe centralizar:

```text
fn_usuario_tiene_acceso_copropiedad()
```

y construir las políticas alrededor del mismo principio.

Esto facilita:

```text
auditoría
mantenimiento
pruebas
cambios de seguridad
```

---

# 29. Auditoría

Toda operación crítica debe registrar:

```text
usuario_id
copropiedad_id
presupuesto_id
acción
fecha
resultado
ip/contexto cuando corresponda
```

Operaciones:

```text
CREAR
CALCULAR
RECALCULAR
PRESENTAR
APROBAR
VERSIONAR
ANULAR
```

---

# 30. Idempotencia HTTP

Las operaciones que pueden repetirse por:

- doble clic;
- reintento de red;
- timeout;
- retry automático;

deben ser idempotentes.

Especialmente:

```text
presupuesto-procesar
presupuesto-versionar
```

Debe evitarse generar:

```text
v2
v3
v4
```

por un mismo intento lógico del usuario.

Para operaciones críticas se recomienda utilizar un `idempotency_key`.

---

# 31. Procesamiento concurrente

Debe evitarse que dos usuarios procesen o versionen simultáneamente el mismo presupuesto.

Se recomienda:

```text
SELECT ... FOR UPDATE
```

en las operaciones críticas.

Ejemplo conceptual:

```text
Usuario A
    ↓
bloquea presupuesto
    ↓
procesa

Usuario B
    ↓
espera/rechaza
```

Esto evita carreras de versionamiento.

---

# 32. Secretos

Las credenciales privadas deben permanecer en:

```text
Supabase Secrets
```

Nunca:

```text
frontend
Git
archivo .env público
repositorio
```

Supabase recomienda almacenar credenciales de funciones en los secretos del proyecto y acceder a ellas mediante variables de entorno. citeturn0search1

---

# 33. RLS + Edge Function

La regla definitiva será:

```text
                  ┌─────────────┐
                  │   Usuario   │
                  └──────┬──────┘
                         ↓
                    JWT válido
                         ↓
                  Edge Function
                         ↓
                  autorización
                         ↓
                       RPC
                         ↓
                    PostgreSQL
                         ↓
                       RLS
                         ↓
                 Motor Presupuestal
```

La seguridad no depende de una sola capa.

---

# 34. PRERREQUISITOS

### PRERREQUISITO 14.1
E-11 — Modelo físico PostgreSQL.

### PRERREQUISITO 14.2
E-12 — Funciones del motor.

### PRERREQUISITO 14.3
E-13 — Implementación SQL y pruebas.

### PRERREQUISITO 14.4
Modelo real de usuarios.

### PRERREQUISITO 14.5
Modelo real de roles.

### PRERREQUISITO 14.6
Relación usuario ↔ copropiedad.

### PRERREQUISITO 14.7
Configuración multitenant de AQUILA.

### PRERREQUISITO 14.8
Supabase Auth configurado.

---

# 35. Decisiones técnicas cerradas

### INT-14.01
El frontend no contiene la lógica matemática crítica.

### INT-14.02
PostgreSQL conserva la lógica de integridad y cálculo crítico.

### INT-14.03
Las operaciones complejas se expondrán mediante Edge Functions y/o RPC controladas.

### INT-14.04
RLS es obligatorio para las tablas expuestas.

### INT-14.05
La autorización de tenant no confiará en valores enviados por el frontend.

### INT-14.06
El usuario autenticado se obtiene del contexto Auth.

### INT-14.07
Las operaciones de aprobación requieren autorización funcional.

### INT-14.08
Los presupuestos aprobados permanecen inmutables.

### INT-14.09
Las operaciones críticas deben ser transaccionales.

### INT-14.10
Las credenciales privilegiadas no se exponen al cliente.

### INT-14.11
Los errores de dominio se mantienen independientes de HTTP.

### INT-14.12
Las operaciones susceptibles a reintentos deben ser idempotentes.

---

# 36. Criterio de cierre

E-14 queda cerrado cuando la arquitectura pueda implementar:

```text
✓ autenticación
✓ autorización
✓ aislamiento multitenant
✓ RLS
✓ RPC
✓ Edge Functions
✓ procesamiento presupuestal
✓ aprobación
✓ versionamiento
✓ auditoría
✓ manejo de errores
✓ idempotencia
```

sin duplicar la lógica matemática del Motor Presupuestal.

---

# 37. Resultado

La arquitectura final queda:

```text
                 AQUILA_SAAS
                      │
        ┌─────────────┴─────────────┐
        ↓                           ↓
     Nuxt/Vue                  Supabase Auth
        │                           │
        └─────────────┬─────────────┘
                      ↓
               Edge Functions
                      ↓
                   RPC
                      ↓
               PostgreSQL
             ┌────────┴────────┐
             ↓                 ↓
            RLS          Motor Presupuestal
                               ↓
                      Cuota Presupuestal
                               ↓
                       Motor Liquidación
```

**E-14 cierra la integración arquitectónica del Motor Presupuestal.**

El siguiente paso no debe volver a diseñar el motor. Si se continúa, debe enfocarse en **E-15 — Suite de pruebas integrales, escenarios reales y criterios de aceptación**, antes de considerar el módulo listo para producción.
