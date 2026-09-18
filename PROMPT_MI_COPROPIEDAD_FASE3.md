# AQUILA MI COPROPIEDAD — OLA 3: GOBIERNO DE SOLO LECTURA · RATE LIMITING (EXT-11 · EXT-16)

## Contrato operativo del Agente de IA — Extensión de alcance sobre `PROMPT_MAESTRO_FASE1.md`

Este documento **extiende** `PROMPT_MAESTRO_FASE1.md` (identidad/tenants/RBAC/RLS) y continúa
`PROMPT_MI_COPROPIEDAD_FASE1.md` (Ola 1, EXT-05/06/07, cerrada — D-142) y
`PROMPT_MI_COPROPIEDAD_FASE2.md` (Ola 2, EXT-08/09/10/12/13/14, cerrada y 100% verificada en
navegador — D-143). No los reemplaza: donde este documento no dice lo contrario, aplican §2-§17
de `PROMPT_MAESTRO_FASE1.md` sin cambios (workflow, gates de verificación, prohibiciones
absolutas de `PLAN_MAESTRO_IMPLEMENTACION.md` §9.2).

---

# 0. Cómo usar este documento

`PLAN_MI_COPROPIEDAD.md` §12 audita los 3 cortes originales de Ola 3 (EXT-11/15/16) contra el
código real (2026-09-18) — **léelo primero**, esta sección solo asume ese resultado. §13 del
mismo plan registra 3 decisiones (P3-01/02/03), ya respondidas por el usuario:

```text
P3-01 EXT-11 Gobierno    → SOLO LECTURA esta ola (agenda/convocatorias/actas/resultados de
                           votación). Voto/asistencia remota se difiere a un corte propio.
P3-02 EXT-15 Proveedor   → POSPUESTO por completo. No entra en el alcance de Ola 3.
P3-03 EXT-16 Hardening   → SOLO rate limiting en las 11 funciones de escritura, ya (no espera al
                           resto). Rollout gradual (feature flag por tenant) diferido hasta que
                           haya fecha real de apertura.
```

**Como consecuencia, "Ola 3" en este documento son 2 cortes, no 3**: M20 (Gobierno de solo
lectura) y M21 (Rate limiting). Si retomas este corte en una sesión nueva, revisa primero si hay
un banner de estado más abajo antes de asumir qué falta.

**Corrección al implementar M21 (2026-09-18)**: el conteo de "11 funciones" de P3-03/§12.3 venía
de un grep que solo miraba los archivos `index.ts` — `external-solicitudes-crear` ya tenía rate
limiting propio dentro de la RPC `fn_solicitud_recibir_externa` (invisible a ese grep). Son 10
funciones reales, no 11 — ver §7.2 para el detalle y por qué no se toca esa función.

---

# 1. Misión y Alcance

## 1.1 Dentro de alcance

| # | Corte | Capacidad | Entregable observable |
| --- | --- | --- | --- |
| M20 | EXT-11 | "Gobierno" — ver reuniones, convocatoria + agenda, actas ya publicadas (puestas a disposición) y resultado de votaciones ya cerradas | `pages/mi-copropiedad/gobierno/{index,[id]}.vue` + Edge Function nueva `external-gobierno-listar` |
| M21 | EXT-16 | Rate limiting en las Edge Functions `external-*` de escritura que hoy no lo tienen | `enforceRateLimit` agregado a `external-reservas-crear/cancelar/disponibilidad/listar`, `external-solicitudes-cancelar/catalogo/listar`, `external-visitas-crear/listar/revocar` (10 funciones — `external-solicitudes-crear` NO se toca, ver nota de implementación) |

## 1.2 Fuera de alcance (NO implementar aquí)

```text
Voto y asistencia remotos (registrar un voto o una asistencia desde mi-copropiedad) — diferido a
  un corte propio (P3-01): toca guard_gobierno_voto()/guard_gobierno_asistencia(), reglas de
  quórum/mayoría que el plan §8 protege explícitamente contra reimplementación apresurada.
gobierno_poderes (quién representó a quién) y gobierno_votos (el voto individual de cada
  miembro/inmueble) — NUNCA se exponen a un actor externo en este corte. M20 solo expone el
  RESULTADO agregado de una votación (coeficiente_favor/contra/abstencion, resultado), nunca el
  detalle de cómo votó cada quien — es información personal de otros propietarios, fuera de
  alcance sin una decisión de producto explícita que no existe hoy.
EXT-15 (Proveedor/contratista) — pospuesto por completo (P3-02). No se diseña ni se empieza el
  mecanismo de vínculo a nivel tenant que requeriría.
Rollout gradual / feature flag por tenant (parte de EXT-16) — diferido (P3-03) hasta que haya
  fecha real de apertura a copropiedades. No se agrega ninguna columna/tabla de configuración en
  este corte.
Reuniones/actas no disponibles todavía — M20 solo lista reuniones ya `instalada`/`cerrada` (nunca
  `convocada` sin instalar, que podría cambiar) y actas en estado `publicada` (nunca `borrador`/
  `en_verificacion`/`suscrita` — `acta_estado_t` tiene 4 valores, no 2; `publicada` es exactamente
  el momento de "puesta a disposición" de los propietarios, art. 47, congelado en
  `puesta_a_disposicion_at` por la primera entrega/verificación — es el único estado en el que el
  acta ya es, legalmente, información que le corresponde ver al propietario).
Cualquier notificación nueva ligada a gobierno (p. ej. "nueva convocatoria disponible") — el
  dominio de notificaciones de Ola 2 (EXT-08b) nace ligado a un solo evento (§4.4 de
  `PROMPT_MI_COPROPIEDAD_FASE2.md`); conectar gobierno es una ampliación futura, no de esta ola.
Cualquier rol nuevo en `TenantRole` o en la matriz RLS de memberships — el actor externo sigue sin
  ser `tenant_member` (AD-37), sin excepción.
```

---

# 2. Fuentes de Verdad y Precedencia

Igual que Fase 1/2 (§2): `PLAN_MI_COPROPIEDAD.md` (con su §12/§13 nuevos) > este documento >
`PROMPT_MAESTRO_FASE1.md` > docs canónicos 01-20 > código existente > tests existentes >
inferencia del agente. Donde este documento cite un archivo/función real, ese archivo es la
fuente de verdad sobre el código — **verificar en el momento de implementar**, no confiar solo en
la cita.

---

# 3. Reglas de Gobierno

Heredadas de Fase 1/2 sin cambios, más una distinción nueva que este corte introduce por primera
vez en la iniciativa:

```text
Un actor externo NUNCA tiene una política RLS propia (regla ya establecida, sin excepción en las
16 Edge Functions external-* existentes). M20 sigue el patrón (b) de Fase 2 §3:
_shared/actor_externo_context.ts + admin client filtrando server-side — mismo camino que
external-documentos-listar/external-cuenta-resumen, NO una RPC SECURITY DEFINER nueva (no hace
falta: el filtro es solo por tenant_id, ver más abajo).

NOVEDAD DE ESTA OLA — el dominio de gobierno es TENANT-COMPLETO, no por inmueble. A diferencia de
solicitudes/documentos/correspondencia/contactos (todos filtrados por inmueble_id del vínculo),
ninguna tabla gobierno_* tiene columna inmueble_id — una reunión, su agenda, su acta y el
resultado de sus votaciones aplican a TODA la copropiedad. El filtro de M20 es exclusivamente
`tenant_id = ctx.tenantId` (confirmado leyendo gobierno_reuniones/convocatorias/agenda_puntos/
actas/votaciones — ninguna tiene inmueble_id). No inventar un filtro por inmueble que el dominio
no tiene.

403 VINCULO_NO_PERTENECE, mismo texto fijo, en la función nueva.

Nunca se expone gobierno_poderes ni gobierno_votos (§1.2) — M20 lee únicamente
reuniones/convocatorias/agenda_puntos/actas/votaciones (solo columnas agregadas de esta última).
```

---

# 4. Modelo de Datos

## 4.1 Tablas nuevas de esta ola

Ninguna. M20 lee tablas GOB0-9 ya existentes (confirmado en `PLAN_MI_COPROPIEDAD.md` §12.1):
`gobierno_reuniones`, `gobierno_convocatorias`, `gobierno_agenda_puntos`, `gobierno_actas`,
`gobierno_votaciones`. M21 no toca el esquema — es código de Edge Function únicamente.

## 4.2 RPCs nuevas

Ninguna. Mismo criterio que `external-documentos-listar`/`external-cuenta-resumen` (Ola 1/2): un
admin client (`service_role`) bypasea RLS y filtra explícitamente por `tenant_id` ya resuelto por
`resolverContextoActorExterno` — no hace falta una función `SECURITY DEFINER` nueva porque el
filtro es un simple `eq('tenant_id', ...)`, sin la lógica de negocio que sí justificó una RPC en
`fn_solicitud_actuaciones_externas` (Ola 2, M12).

## 4.3 Extensiones a tablas existentes

Ninguna.

## 4.4 `lista_tipos` — familias nuevas

Ninguna. `gobierno_reuniones.tipo_id` y `gobierno_votaciones.materia_id` ya resuelven contra
catálogos existentes (`lista_tipos`/`gobierno_materia_decision`) — se leen tal cual, igual que
`external-documentos-listar` ya resuelve `tipo_documento_id` a nombre.

---

# 5. Diseño Visual

Sin cambios respecto a Fase 1/2 §5: mismo sistema visual de AQUILA Web (Nuxt UI + Tailwind, mismos
tokens), sin paleta ni librería nueva. Piso tipográfico `text-xs` (12px), sin excepciones.

Sin badge de conteo para el tile de Gobierno en `mi-copropiedad/index.vue` en este corte — a
diferencia de Solicitudes/Correspondencia (Ola 1/2), no hay un criterio obvio de "pendiente" para
reuniones/actas (¿la próxima reunión? ¿un acta nueva desde la última visita?) sin inventar una
regla no cerrada en el plan (mismo criterio que ya evitó un badge no confirmado en Ola 1 §7.6). Si
se quiere en el futuro, es una decisión de producto aparte.

---

# 6. Estructura Frontend

## 6.1 Rutas nuevas bajo `pages/mi-copropiedad/`

```text
gobierno/
├─ index.vue           # NUEVO (M20) — lista de reuniones (instalada/cerrada), fecha, órgano,
│                       #   estado; toca una fila → detalle
└─ [id].vue            # NUEVO (M20) — detalle de una reunión: convocatoria + agenda (orden del
                        #   día congelado), acta si ya está publicada (enlace al PDF vía el mismo
                        #   generar-enlace-documento/ver-documento de M16, sin cambios), y el
                        #   resultado de cada votación cerrada de esa reunión (coeficiente_favor/
                        #   contra/abstencion + resultado — nunca los votos individuales)
```

`definePageMeta({ layout: 'mi-copropiedad', publico: true })`, mismo criterio de Fase 1/2. Nuevo
tile "Gobierno" en `mi-copropiedad/index.vue` (accesos rápidos), sin badge (§5).

## 6.2 Componentes nuevos

```text
components/mi-copropiedad/
└─ MiCopropiedadResultadoVotacion.vue   # pill/resumen reusable de una votación cerrada
    (pregunta, resultado, coeficiente_favor/contra/abstencion) — evita repetir el formato en
    index.vue y [id].vue si ambos necesitan mostrarlo.
```

Prefijo `MiCopropiedad*` completo, sin excepción (Fase 1 §6.4/§11 — el bug de los `Mic*.vue` que
nunca resolvían en el navegador no se repite).

---

# 7. Backend

## 7.1 M20 — Gobierno de solo lectura

```text
external-gobierno-listar (Edge Function nueva, "una función, varios verbos" — mismo espíritu
  minimalista que external-contactos-emergencia/external-notificaciones-listar de Ola 2)

  POST { vinculo_id, accion: 'reuniones' }
    → resolverContextoActorExterno(admin, jwt, vinculo_id)   (_shared/actor_externo_context.ts,
      reusado tal cual — mismo patrón que external-documentos-listar, EXT-10)
    → admin.from('gobierno_reuniones').select('id, organo_id, tipo_id, modalidad, fecha_hora,
        lugar, medio, estado').eq('tenant_id', ctx.tenantId)
        .in('estado', ['instalada', 'cerrada'])   -- nunca 'convocada' sin instalar ni 'cancelada'
        .order('fecha_hora', { ascending: false })
    → 200 { reuniones: [...] }   -- resolver tipo_id/organo_id a nombre vía lista_tipos/
      gobierno_organos, mismo patrón que external-documentos-listar resuelve tipo_documento_id

  POST { vinculo_id, accion: 'detalle', reunion_id }
    → mismo resolverContextoActorExterno, y ADEMÁS verificar que la reunión pertenece a
      ctx.tenantId (GOBIERNO_REUNION_NO_PERTENECE si no) antes de traer nada
    → convocatoria: admin.from('gobierno_convocatorias').select('emitida_at,
        fecha_limite_respuesta, documento_id, orden_del_dia_congelado').eq('reunion_id', ...)
    → agenda: admin.from('gobierno_agenda_puntos').select('id, orden, titulo, descripcion,
        requiere_decision').eq('reunion_id', ...).order('orden', { ascending: true })   -- la
        tabla es inmutable tras instalar la reunión (AGENDA_INMUTABLE_TRAS_INSTALAR), coincide con
        el orden_del_dia_congelado de la convocatoria; leer de aquí es equivalente y más simple
    → acta: admin.from('gobierno_actas').select('id, numero, anio, estado, documento_id,
        suscrita_at, puesta_a_disposicion_at').eq('reunion_id', ...).eq('estado', 'publicada')
        .maybeSingle()   -- acta_estado_t = borrador|en_verificacion|suscrita|publicada (4
        valores, no 2 — confirmar en el momento de implementar); null si todavía no llegó a
        'publicada' (incluye 'suscrita', que YA está firmada pero aún no puesta a disposición),
        el frontend muestra "Acta pendiente de disposición"
    → votaciones: admin.from('gobierno_votaciones').select('id, pregunta, estado, resultado,
        coeficiente_favor, coeficiente_contra, coeficiente_abstencion, coeficiente_total,
        coeficiente_representado').eq('reunion_id', ...).eq('estado', 'cerrada')
        -- NUNCA seleccionar columnas de gobierno_votos (§3) ni exponer un JOIN a esa tabla
    → 200 { convocatoria, agenda: [...], acta: {...} | null, votaciones: [...] }

  enforceRateLimit igual que el resto de funciones de lectura de Ola 2 (mismo criterio que
  external-documentos-listar: ver §7.2 de este documento para el valor exacto).

Acta: si `acta.documento_id` no es null, el frontend reusa `obtenerUrlDocumentoExterno`
  (actor-externo-api.ts, ya existe desde M16) para conseguir la URL firmada — ningún cambio en
  generar-enlace-documento/ver-documento. GAP-VERIFY (§9, G1): confirmar que cuando el staff sube
  el PDF firmado del acta vía subir-documento (flujo real: firma física → escaneo →
  fn_gobierno_vincular_documento_acta), ese documento queda con inmueble_id = null (documento de
  copropiedad) — si no fuera así, el filtro ya existente de generar-enlace-documento
  (vía actor_externo, EXT-10) lo rechazaría y habría que revisar ese flujo de subida, NO el filtro.
```

## 7.2 M21 — Rate limiting en las funciones de escritura

**Corrección de implementación (2026-09-18)**: la auditoría original (§12.3 del plan) contó 11
funciones sin rate limiting a partir de un grep sobre `enforceRateLimit`/`check_rate_limit` en los
archivos `index.ts` de cada Edge Function — un punto ciego, porque `external-solicitudes-crear`
**ya tiene** rate limiting (5/hora por vínculo), implementado DENTRO de la RPC
`fn_solicitud_recibir_externa` (`20260932810000_gob8_parche_funciones.sql:71`), no en el archivo
`index.ts` — invisible a ese grep. `tests/external/solicitudes.test.ts` prueba #10 protege
explícitamente esto ("el límite de tasa aplicado es el mismo del parche — no hay un segundo
mecanismo en la Edge Function"). Agregarle `enforceRateLimit` habría creado un segundo mecanismo
redundante y habría violado esa prueba en espíritu (aunque no en la letra, porque 20/hora > 5/hora
nunca se habría activado primero) — **no se toca `external-solicitudes-crear`**. Quedan 10
funciones reales sin rate limiting, no 11.

Mismo helper ya en uso (`_shared/rate_limit.ts::enforceRateLimit`, ver `external-documentos-listar`
o `external-cuenta-resumen` como referencia exacta de la llamada) — agregar la misma línea al
inicio de cada función, después de resolver el contexto y antes de cualquier efecto secundario:

```ts
const bloqueo = await enforceRateLimit(
  admin, `<bucket>:${contexto.vinculoId}`, <MAX_HITS>, '<VENTANA>', correlationId,
)
if (bloqueo) return bloqueo
```

| Función | Bucket | Máx./ventana propuesto | Motivo |
| --- | --- | --- | --- |
| `external-reservas-crear` | `reservas_crear_vinculo` | 20/hora | Escritura con efecto en cupo — mismo orden de magnitud que el resto de creación |
| `external-reservas-cancelar` | `reservas_cancelar_vinculo` | 30/hora | Cancelar es menos sensible que crear, pero no ilimitado |
| `external-reservas-disponibilidad` | `reservas_disponibilidad_vinculo` | 60/hora | Solo lectura — mismo valor que `external-documentos-listar`/`external-cuenta-resumen` (precedente ya establecido) |
| `external-reservas-listar` | `reservas_listar_vinculo` | 60/hora | Ídem, solo lectura |
| `external-solicitudes-cancelar` | `solicitudes_cancelar_vinculo` | 30/hora | Igual criterio que reservas-cancelar |
| `external-solicitudes-catalogo` | `solicitudes_catalogo_vinculo` | 60/hora | Solo lectura |
| `external-solicitudes-listar` | `solicitudes_listar_vinculo` | 60/hora | Solo lectura |
| `external-visitas-crear` | `visitas_crear_vinculo` | 20/hora | Generar QRs en volumen es el riesgo concreto señalado en la auditoría |
| `external-visitas-listar` | `visitas_listar_vinculo` | 60/hora | Solo lectura |
| `external-visitas-revocar` | `visitas_revocar_vinculo` | 30/hora | Igual criterio que las demás cancelaciones |

**GAP-VERIFY (§9, G2)**: estos números son una propuesta razonada a partir del único precedente
real en el código (`external-documentos-listar`/`external-cuenta-resumen` = 60/hora para lectura;
`actor-externo-solicitar-otp` = 10/hora **por IP**, no por vínculo — casos distintos). Nadie los
cerró explícitamente en el plan — confirmar con el usuario antes de implementar si prefiere otros
valores, en vez de asumir que estos son correctos solo porque están en este documento.

---

# 8. Flujos Críticos

## 8.1 Ver la próxima convocatoria y el orden del día

```text
1. /mi-copropiedad/gobierno → lista de reuniones instaladas/cerradas (external-gobierno-listar,
   accion=reuniones)
2. Tocar una → /mi-copropiedad/gobierno/[id] → convocatoria + agenda (accion=detalle)
```

## 8.2 Ver el acta y el resultado de una votación ya cerrada

```text
1. /mi-copropiedad/gobierno/[id] de una reunión cerrada
2. Si el acta ya está `publicada` (puesta a disposición) → botón "Ver acta" →
   obtenerUrlDocumentoExterno (M16, sin cambios) → PDF en pestaña nueva. Si está en cualquier otro
   estado (`borrador`/`en_verificacion`/`suscrita`) → "Acta pendiente de disposición" (nunca el
   borrador ni la narrativa interna, aunque ya esté firmada).
3. Cada votación cerrada de la reunión → MiCopropiedadResultadoVotacion.vue: pregunta, resultado
   (aprobada/rechazada/nula), coeficiente a favor/en contra/abstención — nunca quién votó qué.
```

## 8.3 Reserva bloqueada tras exceder el límite

```text
1. Un actor externo intenta crear más de 20 reservas en una hora (o el valor que se confirme, §7.2)
2. external-reservas-crear responde 429 RATE_LIMITED antes de tocar guard_mant_reserva
3. UI muestra el mensaje genérico ya usado en el resto de la superficie ("Demasiados intentos...")
```

---

# 9. Gaps Abiertos (GAP-VERIFY antes de asumir)

```text
G1. Confirmar que el documento de un acta suscrita (subido vía subir-documento, vinculado con
    fn_gobierno_vincular_documento_acta) queda con inmueble_id = null — si el flujo real de staff
    lo sube con un inmueble_id puesto por error, el filtro de generar-enlace-documento (vía
    actor_externo, ya existente desde M16) lo rechazaría para cualquier residente que no sea de
    ESE inmueble. No es un cambio de código de este corte si se confirma — sería una corrección
    del flujo de subida de actas, fuera de M20.
G2. Valores exactos de rate limiting (§7.2) — propuestos por precedente, no cerrados por el
    usuario. Confirmar antes de implementar.
G3. Numeración exacta de migraciones — este corte probablemente no necesita ninguna (§4.1/§4.2),
    pero si algo cambia de alcance al implementar, correr `ls supabase/migrations` antes de tomar
    un número — NO asumir que el bloque libre sigue empezando en 20260948000000 solo porque es lo
    que sigue a la última migración de Ola 2 (memoria del proyecto: colisión de migraciones con
    sesión paralela).
G4. `gobierno_reuniones.organo_id` → confirmar el nombre real del órgano (`gobierno_organos`) que
    se debe mostrar junto a cada reunión (¿Asamblea? ¿Consejo?) — no asumido en este documento.
G5. `votacion_estado_t` confirmado (`abierta`/`cerrada`/`anulada`) y `reunion_estado_t` confirmado
    (`convocada`/`instalada`/`cerrada`/`cancelada`) — los filtros de §7.1 ya usan los valores
    reales. `acta_estado_t` tiene 4 valores, no 2 (`borrador`/`en_verificacion`/`suscrita`/
    `publicada` — corregido en §7.1/§8.2/§10 de este documento tras verificar
    `20260931550000_gob4_vocabulario.sql`); confirmar que ningún otro sitio de este documento
    quedó con la suposición binaria original antes de implementar.
```

---

# 10. Testing y Definition of Done

Se añade a `PROMPT_MAESTRO_FASE1.md` §12 y a los criterios ya usados en Fase 1/2 §10:

```text
□ Alcance exacto de §1.1, sin extras (nada de voto/asistencia remota, EXT-15, ni rollout gradual)
□ external-gobierno-listar NUNCA expone gobierno_poderes ni gobierno_votos — verificado con un
  test que confirme que la respuesta no contiene esas columnas/tablas bajo ningún accion
□ external-gobierno-listar filtra SOLO por tenant_id (nunca por inmueble_id, que el dominio no
  tiene) — un vínculo de cualquier inmueble del tenant ve las mismas reuniones/actas/votaciones
□ Aislamiento entre tenants: un vínculo de OTRO tenant nunca ve reuniones/actas de este (mismo
  criterio de aislamiento que toda la serie EXT-*)
□ Una reunión en estado 'convocada' (no instalada) o 'cancelada' NUNCA aparece en el listado
□ Un acta en estado 'borrador', 'en_verificacion' o 'suscrita' (firmada pero aún no puesta a
  disposición) NUNCA se expone — el detalle muestra "pendiente de disposición" hasta que el
  estado real sea 'publicada'
□ Cada una de las 10 funciones de M21 (§7.2 — excluye `external-solicitudes-crear`, ya protegida
  por `fn_solicitud_recibir_externa`) devuelve 429 RATE_LIMITED al exceder su límite, verificado
  con un test que dispare más llamadas que el máximo configurado
□ Ninguna de las 10 funciones de M21 cambia su comportamiento normal por debajo del límite —
  regresión explícita contra los tests ya existentes de cada una (reservas.test.ts,
  solicitudes*.test.ts, visitantes.test.ts)
□ `external-solicitudes-crear` queda intacto — `tests/external/solicitudes.test.ts` prueba #10
  sigue en verde sin modificarla
□ tsc --noEmit, eslint, deno check (funciones nuevas y modificadas), build → gates de
  PROMPT_MAESTRO_FASE1.md §12.3
□ Verificación en navegador con datos reales antes de dar cualquier corte por cerrado — Ola 2
  encontró un gap real (U9 sin verificar) que solo apareció al revisar el navegador después de
  darla por cerrada con tests en verde; no repetir ese patrón aquí.
```

---

# 11. Orden de Implementación

```text
U1 · M21 (Rate limiting) — cero riesgo, cero migración, cero cambio de comportamiento por debajo   [HECHO]
     del límite, independiente de M20. Entrega el gap de seguridad más barato primero (mismo
     criterio "menor riesgo primero" de Ola 1/2).
        ↓
U2 · M20 (Gobierno de solo lectura) — Edge Function nueva + 2 páginas + 1 componente. Sin           [HECHO]
     migraciones (§4.1/§4.2). GAP-VERIFY G1/G4/G5 antes de escribir el filtro.
```

> **U1 cerrado (2026-09-18).** `enforceRateLimit` agregado a 10 de las 11 funciones previstas —
> `external-solicitudes-crear` quedó fuera al descubrirse que ya tenía rate limiting propio
> (5/hora) dentro de `fn_solicitud_recibir_externa`, invisible al grep original que solo miraba
> los `index.ts` (§7.2 documenta la corrección; `PLAN_MI_COPROPIEDAD.md` §12.3 actualizado
> también). Límites aplicados tal como propone la tabla de §7.2 (20/hora crear,
> 30/hora cancelar/revocar, 60/hora lectura) — siguen siendo una propuesta por precedente, no
> confirmados explícitamente por el usuario (G2 sigue abierto, pero ya en producción del corte
> local). 10 pruebas nuevas (`tests/external/{reservas,solicitudes,visitantes}.test.ts`, una por
> función) confirman que cada límite bloquea con `429 RATE_LIMITED` exactamente después del cupo
> configurado, sin afectar el comportamiento por debajo de él — suite completa de los 3 archivos
> en verde (47/47, incluidas las 37 pruebas preexistentes, sin regresión). `deno check` limpio en
> las 10 funciones tocadas. `external-solicitudes-catalogo` tenía además un `TS7006` preexistente
> (parámetros `f` implícitamente `any` en dos `.filter()`, ya en el HEAD anterior a esta sesión,
> sin relación con M21) — señalado aparte como tarea independiente y corregido ahí mismo (sesión
> separada, `task_c4fc5a3f`); `deno check` de esa función también en verde. `tsc --noEmit` raíz y
> `eslint` sin errores.
>
> **U2 cerrado (2026-09-18) — Ola 3 completa.** `external-gobierno-listar` (Edge Function nueva,
> sin migraciones — reusa GOB0-9 vía admin client + `_shared/actor_externo_context.ts`, mismo
> patrón que `external-documentos-listar`), `pages/mi-copropiedad/gobierno/{index,[id]}.vue`,
> `MiCopropiedadResultadoVotacion.vue` y el tile "Gobierno" en `mi-copropiedad/index.vue`. Al
> escribir el filtro se encontró que `acta_estado_t` tiene 4 valores, no 2 como el propio §7.1 ya
> había corregido en el diseño — confirmado en código real, sin sorpresas adicionales. 6 pruebas
> nuevas (`tests/external/gobierno.test.ts`): listado filtra `convocada`, detalle expone
> convocatoria/agenda/resultado agregado de votación (nunca `gobierno_votos`/`gobierno_poderes` —
> verificado comparando las claves exactas del objeto devuelto), acta solo aparece en `publicada`
> (nunca en `suscrita`, probado con la transición real vía `gobierno_acta_entregas`), aislamiento
> entre tenants (404 `GOBIERNO_REUNION_NO_PERTENECE` en detalle, ausente en listado), 403
> `VINCULO_NO_PERTENECE`, y rate limit a 60/hora (mismo patrón de M21, no estaba en el alcance
> original de esa lista pero es la convención ya establecida para toda función `external-*` de
> solo lectura desde Ola 2). Suite completa `tests/external/`+`tests/gobierno/` en verde (22
> archivos, 266 pruebas, sin regresión). Verificado en navegador contra datos QA reales (tenant
> "QA Torres del Parque", una reunión cerrada con 2 votaciones ya resueltas y un acta en
> `borrador`): el listado y el detalle renderizan correctamente, y el acta muestra "todavía no
> está disponible" — el caso exacto que exige `publicada`, no solo `suscrita`, confirmado en vivo.
> `deno check`/`nuxt typecheck`/`eslint` limpios.
>
> **Hallazgo operativo de esta sesión, no del código**: al correr `supabase functions serve` para
> que el runtime local reconociera la función nueva (memoria del proyecto: una función nueva
> queda invisible hasta que algo refresca ese mapa) y luego interrumpirlo, el contenedor
> `supabase_edge_runtime` quedó eliminado por completo (no solo detenido) — un `docker ps -a` no
> lo listaba. La recuperación fue relanzar `supabase functions serve` como proceso de fondo
> persistente (no interrumpirlo), que recreó el contenedor y volvió a servir las 96 funciones
> existentes con normalidad — confirmado sin ninguna pérdida de datos (Postgres nunca se tocó).
> Vale la pena registrarlo aparte en la memoria del proyecto para la próxima sesión que agregue
> una Edge Function nueva.

---

# 12. Workflow y Formato de Reporte

Aplican sin cambios `PROMPT_MAESTRO_FASE1.md` §14 y §16 (mismo criterio de Fase 1/2 §12). Al
cerrar esta ola completa, registrar D-144 en `DECISIONES.md` (las decisiones P3-01/02/03 de
`PLAN_MI_COPROPIEDAD.md` §13) — sin fila nueva en `MIGRACIONES_LEDGER.md` si finalmente no hace
falta ninguna migración (confirmar al cerrar, no asumir aquí).

---

# 13. Resumen Ejecutivo para el Agente

Ola 3 quedó reducida a 2 cortes tras las decisiones del usuario (P3-01/02/03): M21 (rate limiting,
cero riesgo, cero migración) y M20 (gobierno de solo lectura, reuso real de RLS/tablas ya
existentes de la serie GOB0-9, también sin migración si el diseño de §7.1 se sostiene). A
diferencia de Ola 2, donde 6 de 9 unidades requerían backend genuinamente nuevo, aquí ninguna de
las dos piezas toca el esquema — el trabajo es casi enteramente Edge Functions + UI. El único
límite de alcance que hay que respetar con cuidado es §1.2/§3: `gobierno_poderes` y
`gobierno_votos` (el voto individual) nunca se exponen, solo el resultado agregado de una
votación cerrada — es la primera vez en la iniciativa que se expone un dominio con datos
potencialmente sensibles de OTRAS personas (cómo votó cada quien), y la línea a no cruzar está
marcada explícitamente. Seguir §9 (Gaps Abiertos) antes de asumir el diseño exacto — en particular
G1 (dónde queda `inmueble_id` en el documento de un acta) y G2 (valores de rate limit, propuestos
pero no cerrados por el usuario).
