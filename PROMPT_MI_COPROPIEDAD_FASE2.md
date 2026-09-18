# AQUILA MI COPROPIEDAD — OLA 2: SOLICITUDES · VISITAS · RESERVAS · DOCUMENTOS · CORRESPONDENCIA · MUDANZAS · CONTACTOS (EXT-08/09/10/12/13/14)

## Contrato operativo del Agente de IA — Extensión de alcance sobre `PROMPT_MAESTRO_FASE1.md`

Este documento **extiende** `PROMPT_MAESTRO_FASE1.md` (identidad/tenants/RBAC/RLS) y continúa
`PROMPT_MI_COPROPIEDAD_FASE1.md` (Ola 1, EXT-05/06/07, **cerrada** — D-142). No lo reemplaza:
donde este documento no dice lo contrario, aplican §2-§17 de `PROMPT_MAESTRO_FASE1.md` sin
cambios (workflow, gates de verificación, prohibiciones absolutas de `PLAN_MAESTRO_IMPLEMENTACION.md`
§9.2).

---

# 0. Cómo usar este documento

`PLAN_MI_COPROPIEDAD.md` §10 audita los 6 cortes de esta ola contra el código real (2026-09-17) y
corrige varias suposiciones del plan original — **léelo primero**, esta sección solo asume ese
resultado. §11 del mismo plan registra 3 decisiones abiertas, ya respondidas por el usuario:

```text
P2-01 Notificaciones (EXT-08b) → CONSTRUIR una vía mínima ahora (no diferir).
P2-02 Mudanzas (EXT-13)        → CONSTRUIR el horario semanal ahora (no simplificar a reserva llana).
P2-03 Orden de implementación  → "Solo-UI primero" (2a) y luego "con backend nuevo" (2b) — ver §11.
```

Si retomas este corte en una sesión nueva: revisa primero el banner de estado en §11 (mismo
formato que usó Fase 1) antes de asumir qué falta.

> **Estado 2026-09-17 — U1 cerrado.** `pages/mi-copropiedad/solicitudes/{index,[id]}.vue` (M10),
> reusando `external-solicitudes-listar` sin cambios. Dos hallazgos reales al verificar en
> navegador con datos QA (no en la lectura de código, mismo patrón que ya costó un bug en Ola 1):
> 1. **`solicitud_estado_t` tiene 10 valores, no 7** — `recibida_externa`/`rechazada_triage`
>    (`20260932790000`) y `cancelada_por_solicitante` (`20260932820000`) se agregaron después vía
>    `ALTER TYPE`, invisibles si solo se lee la migración de creación del enum. Los 3 archivos que
>    ya mapeaban estado a etiqueta (incluido `mi-copropiedad/index.vue` de Ola 1) se corrigieron.
> 2. **`external-solicitudes-cancelar` (EXT-02) existía desde antes y nunca se había expuesto en
>    ninguna UI** — ahora el botón "Cancelar solicitud" aparece en el detalle cuando
>    `estado === 'recibida_externa'`, verificado de punta a punta en navegador (Recibida →
>    Cancelada, con datos QA reales). No estaba en el alcance original de M10 tal como se escribió
>    arriba, pero es la misma superficie (listado/detalle) y cero trabajo de backend nuevo — se
>    incluyó por ser la extensión natural, no un corte aparte.
> `lint`/`build`/`nuxt typecheck` en verde.
>
> **U2 cerrado.** `pages/mi-copropiedad/visitas/{index,nueva}.vue` (M13), reusando
> `external-visitas-crear/listar/revocar` sin cambios — confirmado 100% funcional para actor
> externo (`PLAN_MI_COPROPIEDAD.md` §10.1). QR dibujado en el cliente con la librería `qrcode` ya
> usada en `mantenimiento/activos/[id].vue` (mismo patrón, sin dependencia nueva). Catálogo
> `TIPO_VISITA` leído directo por el cliente vía RLS (`tenant_id is null`, fila de plataforma) —
> **limitación conocida y documentada en el código**: un tenant que oculte tipos
> (`lista_tipos_ocultos`) o agregue tipos propios no se refleja para el actor externo, porque
> ambos mecanismos exigen `is_member(tenant_id)`, que un actor externo nunca satisface (AD-37);
> corregirlo exige una RPC nueva, fuera del alcance "solo UI" de U2 (§9). `lint`/`build`/`nuxt
> typecheck` en verde. **Verificación**: la pestaña compartida del navegador tenía sesión propia
> del usuario en curso (varias cuentas QA distintas en la misma pestaña durante la sesión) —para
> no interferir, el contrato crear→listar→revocar se verificó de punta a punta por fuera del
> navegador (JWT real vía Admin API + curl directo a las 3 Edge Functions), confirmando que la
> respuesta coincide exactamente con `VisitaExterna` tal como está tipada en `actor-externo-api.ts`.
>
> **U3 cerrado — con esto termina 2a.** `pages/mi-copropiedad/reservas/{index,nueva}.vue` (M15),
> reusando `external-reservas-disponibilidad/-crear/-listar/-cancelar` sin cambios (EXT-03,
> confirmado 100% funcional para actor externo, cero RLS nueva — `PLAN_MI_COPROPIEDAD.md` §10.2).
> Mismo criterio de verificación que U2 (curl aislado, JWT real, sin tocar la pestaña compartida
> del navegador): disponibilidad (catálogo + franjas ocupadas/regla) → crear (auto-aprobada al no
> `requiere_aprobacion`) → listar → cancelar, de punta a punta contra el tenant QA real, coincide
> exactamente con los tipos de `actor-externo-api.ts`. `lint`/`build`/`nuxt typecheck` en verde.
> Sigue **U4** (EXT-09 mejoras: foto + autorización permanente) — primer corte de 2b, con
> migración nueva.
>
> **U4 cerrado.** Migración `20260943000000_ext9_visita_foto_permanente.sql`: columnas
> `permanente`/`foto_url` en `mant_autorizaciones_visita` (`fecha_prevista` pasa a nullable), CHECK
> que exige `permanente` ↔ ausencia de fecha/hora en ambas direcciones, `guard_mant_autorizacion_
> visita()` reescrito con una ventana máxima de QR de 1 año para permanentes (la fórmula anterior
> daba `NULL` para fecha_prevista null y el chequeo se saltaba en silencio — no es un bug nuevo de
> este corte, es uno que este corte expone y corrige), y bucket privado `visitas-fotos` (5 MB,
> jpeg/png, solo SELECT para staff vía `is_member()` — mismo criterio que `documentos-inmueble`,
> sin policy de INSERT ni de lectura para el actor externo dueño). `external-visitas-crear`
> reescrito de JSON a `multipart/form-data` (único cambio de contrato: agrega `permanente`/`foto`
> opcionales, ningún campo existente cambia de significado). Tipos regenerados con
> `npx supabase gen types typescript --local` (bypass deliberado de `pnpm db:types`, que por
> diseño solo funciona contra un proyecto remoto — ver comentario en `scripts/db-types.mjs`), NO se
> tocó producción para esto. Frontend: `actor-externo-api.ts` (`crearVisitaExterna` ahora arma
> `FormData`, mismo patrón que `stores/documentos.ts`) y `visitas/nueva.vue` (toggle "Autorización
> permanente" que oculta fecha/hora, input de foto con `capture="environment"`). Efecto secundario
> corregido en el camino: `mantenimiento/acceso/index.vue` y `mi-copropiedad/visitas/index.vue`
> mostraban "Invalid Date" para una fila permanente (`fecha_prevista` ahora nullable en los tipos
> generados) — `formatoFecha` ahora devuelve "Permanente"; de paso se agregó la foto (signed URL,
> 5 min) al panel de validación de portería, que antes no la mostraba. `tests/external/
> visitantes.test.ts`: las 8 pruebas existentes que invocaban `external-visitas-crear` se
> convirtieron de body JSON a `FormData` (mismo contrato, sin cambiar su intención), más 3 pruebas
> nuevas (permanente, foto válida, MIME rechazado) — 13/13 en verde contra Supabase real.
> `lint`/`build`/`nuxt typecheck` en verde.
>
> Sigue **U5** (EXT-10 Documentos: `external-documentos-listar` nuevo + tercera vía `actor_externo`
> en `generar-enlace-documento` + `pages/mi-copropiedad/documentos/index.vue`).
>
> **U5 cerrado.** Sin migración — solo Edge Functions + UI. `documentos` no tiene NINGUNA política
> RLS utilizable por un actor externo (única policy, `documentos_select_agent_auditor`, exige
> `is_member(tenant_id)` — AD-37), así que `external-documentos-listar` (Edge Function nueva) sigue
> el mismo camino que `external-cuenta-resumen` (EXT-06/07): admin (service_role) resuelve el
> contexto (`_shared/actor_externo_context.ts`) y filtra `v_documento_vigente` por
> `tenant_id`/`inmueble_id` ya verificados — nunca por lo que mande el cliente. Trae solo la
> versión vigente de cada `grupo_id` y resuelve `tipo_documento_id` a nombre vía `lista_tipos`
> (mismo patrón que cuenta-resumen resuelve concepto/periodo). `generar-enlace-documento` (antes
> solo staff, `via` implícito) gana una vía `actor_externo` explícita (zod, `via` opcional
> default `'sesion'` — los 5+ llamadores existentes no cambian): resuelve el vínculo y verifica a
> mano que el documento pedido es de su propio tenant y de su inmueble o de copropiedad (mismo
> filtro que `external-documentos-listar` ya aplica), antes de firmar el mismo token HMAC de
> siempre — `ver-documento` no cambia una línea (el token no distingue quién lo pidió). Frontend:
> `actor-externo-api.ts` gana `listarDocumentosExternos`/`obtenerUrlDocumentoExterno` (esta última
> encadena generar-enlace-documento → ver-documento, la UI solo pide la URL final) y
> `pages/mi-copropiedad/documentos/index.vue` (listado con "Ver documento" que abre la signed URL
> en pestaña nueva). `tests/external/documentos.test.ts` (nuevo, 9 pruebas: propio inmueble,
> copropiedad, aislamiento por inmueble/tenant, solo versión vigente, ambas vías de
> generar-enlace-documento incluida la ruta de error, y una prueba de no-regresión de la vía
> `sesion` por defecto) — 9/9 en verde, más 35/35 en verde de los tests preexistentes de
> `generar-enlace-documento` (`gobierno/prerrequisitos`, `contabilidad/rendicion-cuentas`,
> `gobierno/acta`) para confirmar cero regresión. `lint`/`build`/`nuxt typecheck` en verde.
>
> Sigue **U6** (EXT-14 Contactos de emergencia).
>
> **U6 y U7 cerrados juntos.** Migración `20260944000000_ext14_contactos_emergencia.sql`: tabla
> `contactos_emergencia` ligada a `inmueble_id` (no a persona/vínculo — §4.1: cualquier residente
> del mismo inmueble ve/gestiona los mismos contactos), sin ninguna política RLS de escritura.
> `external-contactos-emergencia` (Edge Function nueva, un solo archivo con `accion:
> 'listar'|'crear'|'eliminar'` — mismo espíritu minimalista que `external-solicitudes-listar`):
> `eliminar` valida que el contacto pertenece al `inmueble_id` del contexto, nunca solo a
> `creado_por_vinculo_id` (verificado con un segundo vínculo sobre el mismo inmueble en los tests).
>
> Migración `20260945000000_ext12_correspondencia.sql`: familia `TIPO_CORRESPONDENCIA` en
> `lista_tipos` (D-24, cero filas precargadas), tabla `correspondencia` (CHECK que exige
> `entregada`↔`entregada_a`/`entregada_at` en ambas direcciones), sin política RLS de escritura
> para nadie — ni siquiera staff. Dos Edge Functions nuevas: `correspondencia-registrar` (staff
> auxiliar/administrador, `accion: 'registrar'|'marcar_entregada'`, replica `has_role` con una
> consulta directa a `memberships` porque `admin` con service_role no tiene `auth.uid()` — mismo
> criterio que la vía `sesion` de `crear-intencion-pago`) y `external-correspondencia-listar`
> (residente, **solo lectura** — marcar `entregada` es siempre staff en portería, §8.4). UI de
> staff mínima nueva (§1.2 lo permite explícitamente): `pages/correspondencia/index.vue`,
> standalone para no tocar `InmuebleFicha.vue` (con cambios propios sin commitear del usuario en
> esta misma sesión) — no hace falta cablearla al sidebar porque es configurable por tenant
> (SIDEBAR-CONFIG), la página es alcanzable por URL igual.
>
> Frontend residente: `actor-externo-api.ts` gana los wrappers de ambos dominios;
> `pages/mi-copropiedad/contactos/index.vue` (listar/crear/eliminar) y
> `pages/mi-copropiedad/correspondencia/index.vue` (solo lectura); dos tiles nuevos en
> `mi-copropiedad/index.vue` (Correspondencia con badge de `entregada=false`, derivado del dato que
> la función ya trae — mismo criterio de §5; Contactos sin badge).
>
> Tipos regenerados con `npx supabase gen types typescript --local` — **hallazgo real de esta
> regeneración**: redirigir `2>&1` al archivo coló un `npm warn` y un `Connecting to db 5432` de
> stderr ANTES del contenido TypeScript real, rompiendo la compilación de `@aquila/shared` con
> errores de sintaxis crípticos en la línea 5; se corrigió quitando esas dos líneas y separando
> stdout de stderr. **Segundo hallazgo**: las 3 Edge Functions nuevas devolvían 404 en los tests
> hasta correr `supabase functions serve` (mismo gotcha ya documentado: el mapa de funciones del
> `edge_runtime` local no se entera solo de carpetas nuevas — reafirma la nota existente en memoria
> de que un restart de Docker NO alcanza).
>
> `tests/external/contactos-emergencia.test.ts` (nuevo, 9 pruebas) y
> `tests/external/correspondencia.test.ts` (nuevo, 9 pruebas) — 18/18 en verde; suite completa
> `tests/external/` (8 archivos, 88 pruebas) en verde. `lint`/`build`/`nuxt typecheck` en verde.
>
> Sigue **U8** (EXT-08b Notificaciones) y **U9** (EXT-13 Mudanzas, horario semanal) — los dos
> últimos cortes de la ola.
>
> **U8 cerrado.** Migración `20260946000000_ext08b_notificaciones_actor_externo.sql`, un solo
> archivo para M11+M12 (van de la mano: el trigger de M11 dispara sobre la misma tabla que M12
> expone al residente). `fn_solicitud_actuaciones_externas` — mismo patrón exacto que
> `fn_solicitud_estado_externo` (solo funciona con la sesión real del propio actor externo,
> `auth.uid()`, nunca admin/service_role) — filtra `es_respuesta = true`, nunca una nota interna.
> `external-solicitudes-listar` la llama además de `fn_solicitud_estado_externo` cuando llega
> `solicitud_id`, sin Edge Function nueva. Tabla `notificaciones_actor_externo` — aparte de
> `exs2_notificaciones` a propósito (§4.4: dos audiencias, dos modelos de autorización) — sin
> NINGUNA política RLS (ni SELECT, a diferencia de la de staff). `fn_notificar_actor_externo`
> calca `fn_notificar` (EXS-2): única puerta de escritura, idempotente por
> `(vinculo, origen_entidad, origen_id, origen_evento)`. **Decisión de diseño deliberada, distinta
> a la lectura literal de §7.10**: `origen_id` es el `id` de la propia actuación-respuesta, no el
> de la solicitud — con `origen_id = solicitud_id` una SEGUNDA respuesta del staff a la misma
> solicitud habría colisionado con la clave de idempotencia de la primera y jamás se habría
> notificado (`ON CONFLICT DO NOTHING` la habría descartado en silencio); verificado explícitamente
> con una prueba (dos respuestas → dos notificaciones). El trigger `AFTER INSERT ON
> solicitud_actuaciones WHEN (es_respuesta = true)` no dispara si `origen_actor_externo_id` es
> null (solicitud creada por staff, no por el propio actor externo — caso real, cubierto por
> prueba). `external-notificaciones-listar` (Edge Function nueva, `accion: listar|marcar_leida`,
> mismo patrón admin+contexto que EXT-14). Frontend: `actor-externo-api.ts` gana
> `listarNotificacionesExternas`/`marcarNotificacionExternaLeida` y `SolicitudExternaDetalle` gana
> `actuaciones`; `MiCopropiedadNotificacionBell.vue` (nuevo, campana con badge de no leídas +
> panel, montada en `layouts/mi-copropiedad.vue` junto al selector de vínculo — falla en silencio
> si el listado falla, es un realce, no un flujo crítico) y `solicitudes/[id].vue` gana la sección
> "Respuestas". `tests/external/notificaciones.test.ts` (nuevo, 7 pruebas) — 7/7 en verde; suite
> completa `tests/external/` (11 archivos, 119 pruebas) + `tests/gobierno/atencion.test.ts` +
> `tests/gobierno/solicitudes-triage-externo.test.ts` en verde (el trigger nuevo sobre
> `solicitud_actuaciones` no rompe ningún flujo existente de GOB-8). `lint`/`build`/`nuxt
> typecheck` en verde.
>
> **U9 cerrado — Ola 2 completa.** Migración `20260947000000_ext13_mudanzas_horario_semanal.sql`:
> tabla `mant_zona_horario_semanal` (día de semana 0-6, franja `hora_desde`/`hora_hasta`, CHECK
> `hora_hasta > hora_desde`), RLS con SELECT para cualquier miembro y FOR ALL solo para
> `administrador` (mismo criterio exacto que `mant_zona_reserva_regla`, el spec nunca cerró
> explícitamente quién escribe esta tabla). Tercer `CREATE OR REPLACE` de `guard_mant_reserva()`
> (tras MANT-10 y EXT-03) — diff mínimo: se copia el cuerpo vigente y se agrega un solo bloque
> nuevo dentro de la rama INSERT, entre las validaciones de anticipación y el límite por inmueble.
> Una zona sin ninguna fila en `mant_zona_horario_semanal` sigue exactamente igual que antes (el
> `EXISTS` que activa la restricción no encuentra nada) — verificado con una prueba de regresión
> explícita. `external-reservas-disponibilidad` agrega `franjas_validas` a su respuesta SOLO
> cuando la zona tiene horario configurado (clave completamente ausente en cualquier otro caso —
> compatibilidad hacia atrás explícita, ningún consumidor existente ve un campo nuevo); el día de
> la semana se calcula igual en SQL (`extract(dow from fecha)`) y en el Edge Function
> (`new Date(\`${fecha}T00:00:00\`).getDay()`), ambos 0=domingo sin conversión de zona horaria.
> **Bug real encontrado y corregido en el camino**: `external-reservas-crear` tiene un mapa
> `ESTADO_HTTP_POR_CODIGO` que traduce cada código de error del guard a un status HTTP — el nuevo
> `RESERVA_FUERA_DE_HORARIO_SEMANAL` no estaba en el mapa y habría caído al 500 genérico por
> defecto; agregado como 400 (mismo status que el resto de las validaciones de negocio del guard).
> Frontend: `actor-externo-api.ts` gana `franjas_validas?` en `DisponibilidadZona`;
> `reservas/nueva.vue` la muestra como "Horario permitido: …" cuando hay franjas para el día
> elegido, alerta si el arreglo llega vacío (zona configurada pero sin franja ese día) y deshabilita
> el botón de reservar en ese caso. `tests/external/mudanzas.test.ts` (nuevo, 6 pruebas) — 6/6 en
> verde; `tests/external/reservas.test.ts` (EXT-03, 12 pruebas) sin regresión. `lint`/`build`/
> `nuxt typecheck` en verde.
>
> **Ola 2 (U1-U9) completa.** Pendiente con el usuario: registrar D-143 en `DECISIONES.md` y decidir
> cuándo empujar el backlog de migraciones acumulado a producción.

---

# 1. Misión y Alcance

## 1.1 Dentro de alcance

| # | Corte | Capacidad | Entregable observable |
| --- | --- | --- | --- |
| M10 | EXT-08 | "Mis solicitudes" — listado + detalle | `pages/mi-copropiedad/solicitudes/index.vue` + `[id].vue`, reusando `external-solicitudes-listar` tal cual (ya soporta el modo detalle) |
| M11 | EXT-08b | Notificaciones al actor externo | Tabla `notificaciones_actor_externo` + trigger sobre respuestas de solicitud + Edge Functions de lectura + badge en el header/nav |
| M12 | EXT-08 | Actuaciones/respuestas del staff visibles al residente | RPC nueva `fn_solicitud_actuaciones_externas` (solo `es_respuesta=true`, nunca notas internas) |
| M13 | EXT-09 | "Mis visitas" — crear/listar/revocar en la nueva superficie | `pages/mi-copropiedad/visitas/index.vue` + `nueva.vue`, reusando `external-visitas-*` tal cual |
| M14 | EXT-09 | Foto de visitante + autorización permanente | Columna `foto_url` (bucket nuevo) + `fecha_prevista` nullable + guard, extendiendo `external-visitas-crear` |
| M15 | EXT-10 | "Mis reservas" — disponibilidad/crear/cancelar en la nueva superficie | `pages/mi-copropiedad/reservas/index.vue` + `nueva.vue`, reusando `external-reservas-*` tal cual |
| M16 | EXT-10 | Documentos de mi copropiedad/inmueble | `external-documentos-listar` (nueva) + tercera vía `actor_externo` en `generar-enlace-documento` + `pages/mi-copropiedad/documentos/index.vue` |
| M17 | EXT-12 | Correspondencia/paquetería | Tabla `correspondencia` + Edge Functions (registrar por staff, listar por residente) + `pages/mi-copropiedad/correspondencia/index.vue` |
| M18 | EXT-13 | Mudanzas con horario semanal configurable | Tabla `mant_zona_horario_semanal` + extensión de `guard_mant_reserva` + UI de reserva especial "Mudanza" |
| M19 | EXT-14 | Contactos de emergencia | Tabla `contactos_emergencia` + Edge Functions CRUD + `pages/mi-copropiedad/contactos/index.vue` |

## 1.2 Fuera de alcance (NO implementar aquí)

```text
Gobierno/Junta, Portería, Proveedores (EXT-11/15) — Ola 3.
Hardening final (EXT-16: IDOR, replay, revocación de vínculo, rollout gradual) — Ola 3, cuando
  todas las superficies estén expuestas y haya algo real que endurecer.
Cualquier UI de staff nueva más allá del mínimo indispensable para que Correspondencia (EXT-12)
  tenga un lado de escritura — no se construye un módulo administrativo nuevo, se decide en el
  momento de implementar dónde encaja mejor (¿ficha de inmueble? ¿página propia?) sin inventar
  navegación nueva innecesaria.
Notificaciones push/email/SMS al actor externo — EXT-08b es solo una bandeja IN-APP (mismo
  criterio minimalista de badges de Ola 1); un canal externo de aviso es una ola futura.
Cualquier tipo de "notificación general de la copropiedad" (comunicados/anuncios) al actor
  externo — EXT-08b nace ligada A UN SOLO evento conocido (respuesta de staff a una solicitud
  propia). Ampliarla a más eventos es explícitamente la Ola 3+ (ver §4.4).
Retrofit de `external-solicitudes-*`/`external-reservas-*`/`external-visitas-*` para pasar por
  `_shared/actor_externo_context.ts` (deuda técnica menor, ya señalada en Fase 1 §1.2) — siguen
  funcionando con su propio patrón (`fn_actor_externo_mis_vinculos` + verificación inline); no se
  tocan sin necesidad real.
Cualquier cálculo financiero, de mora o de elegibilidad de voto fuera del Core.
Cualquier rol nuevo en `TenantRole` o en la matriz RLS de memberships — el actor externo sigue sin
  ser `tenant_member` (AD-37), en todos los cortes de esta ola sin excepción.
```

---

# 2. Fuentes de Verdad y Precedencia

Igual que Fase 1 (§2): `PLAN_MI_COPROPIEDAD.md` (con su §10/§11 nuevos) > este documento >
`PROMPT_MAESTRO_FASE1.md` > docs canónicos 01-20 > código existente > tests existentes >
inferencia del agente. Donde este documento cite un archivo/función real, ese archivo es la
fuente de verdad sobre el código — **verificar en el momento de implementar**, no confiar solo en
la cita (los 5 sub-informes que originaron este documento ya corrigieron 2 suposiciones del plan
original; puede haber más).

---

# 3. Reglas de Gobierno

Heredadas de Fase 1, sin cambios, y una que se hace **explícita** porque los 6 cortes de esta ola
la confirman sin excepción:

```text
Un actor externo NUNCA tiene una política RLS propia. Las 11 Edge Functions external-* existentes
(EXT-01/02/03/04) y las 2 de Fase 1 (EXT-06/07) resuelven su autorización de una de estas dos
formas — nunca una tercera:
  (a) RPC SECURITY DEFINER que valida "auth_user_id = auth.uid()" a mano (patrón EXT-02/03/04:
      fn_solicitud_*_externa, fn_reserva_*_externa, fn_autorizacion_visita_*_externa), o
  (b) _shared/actor_externo_context.ts + admin client filtrando server-side (patrón EXT-06/07:
      external-cuenta-resumen, crear-intencion-pago vía actor_externo).
Toda pieza nueva de esta ola sigue (a) o (b) — nunca se agrega una policy RLS que mencione
actor_externo_vinculo directamente.

403 VINCULO_NO_PERTENECE, mismo texto fijo, en cualquier función nueva que resuelva un vinculo_id.

El monto/fecha/horario lo decide siempre el servidor cuando hay dinero o disponibilidad de por
medio (regla de oro de EXT-07, aplica igual a EXT-13: el actor externo elige una franja publicada,
nunca escribe una hora libre para "Mudanza" fuera de las franjas que el staff configuró).
```

---

# 4. Modelo de Datos

## 4.1 Tablas nuevas de esta ola

```text
correspondencia
  tenant_id, inmueble_id, tipo_id (FK lista_tipos, familia TIPO_CORRESPONDENCIA — D-24, sin
    filas precargadas, cada copropiedad las define, mismo patrón que TIPO_SOLICITUD),
  destino text (a quién va dirigida, texto libre — nombre del residente/tercero),
  remitente text, descripcion text nullable,
  registrado_por uuid (perfil de staff que la recibió), created_at,
  entregada boolean default false, entregada_a text nullable, entregada_at timestamptz nullable
  RLS: SELECT solo miembros del tenant (staff) — el actor externo NUNCA lee esta tabla
  directamente, pasa por RPC SECURITY DEFINER que filtra por su propio inmueble_id (regla de §3).
  Sin política INSERT para authenticated: la escritura (staff registra que llegó un paquete) pasa
  por una Edge Function con service_role, igual que subir-documento.

contactos_emergencia
  tenant_id, inmueble_id (NO persona_id — decisión de este corte: se liga al inmueble, no al
    vínculo/persona puntual, para que cualquier residente del mismo inmueble vea/gestione los
    mismos contactos; si dos personas del mismo inmueble tuvieran contactos distintos sería un
    problema real distinto, no confirmado hoy — empezar simple),
  nombre text, telefono text, parentesco text nullable, creado_por_vinculo_id uuid nullable
    (trazabilidad de qué vínculo lo creó, no de autorización — la autorización sigue siendo
    "pertenece a mi inmueble"), created_at, updated_at
  RLS: igual criterio que correspondencia — sin policy para actor externo, todo vía RPC/Edge
  Function con ExecutionContext. A diferencia de correspondencia, aquí SÍ hay una vía de
  escritura para el actor externo (crea/edita/borra sus propios contactos) — ver §7.6.

mant_zona_horario_semanal   (EXT-13 — el horario que zonas_comunes nunca tuvo, confirmado en
                              PLAN §10.2/§10.5)
  tenant_id, zona_comun_id (FK zonas_comunes), dia_semana smallint (0=domingo..6=sábado, check
    entre 0 y 6), hora_desde time, hora_hasta time, created_at
  Constraint: hora_hasta > hora_desde (mismo patrón que mant_reservas_horario_valido).
  RLS: SELECT para miembros + lectura vía external-reservas-disponibilidad con admin client
  (mismo patrón ya usado por esa función para leer zonas_comunes/mant_zona_reserva_regla — no se
  inventa un tercer mecanismo de lectura para actor externo).
  Semántica de "zona sin filas aquí": sigue funcionando exactamente igual que hoy (sin
  restricción de horario) — este corte NO vuelve retroactivamente más estricta ninguna zona
  existente; solo una zona con filas en esta tabla queda sujeta a la validación nueva.

notificaciones_actor_externo   (EXT-08b — deliberadamente UNA TABLA APARTE de
                                 exs2_notificaciones, no una extensión de ella)
  tenant_id, actor_externo_vinculo_id (FK actor_externo_vinculo), titulo text, cuerpo text,
  enlace text (deep link dentro de mi-copropiedad, p. ej. /mi-copropiedad/solicitudes/<id>),
  origen_entidad text, origen_id uuid, origen_evento text (misma idempotencia que fn_notificar:
    índice único parcial sobre estas 3 columnas + actor_externo_vinculo_id),
  leida_at timestamptz nullable, created_at
  Por qué una tabla aparte y no una columna/rama en exs2_notificaciones: esa tabla se enruta por
  modulo + rol de tenant_member (PLAN §10.4) — mezclar un destinatario individual de actor externo
  ahí complicaría su único modelo de autorización sin necesidad; son dos audiencias con dos
  reglas de visibilidad distintas, no vale la pena forzarlas a una tabla común todavía (mismo
  criterio "no construir una abstracción para un problema que AQUILA no tiene" que ya usó
  `PLAN_MOTOR_REPORTES.md`).
  RLS: NINGUNA para authenticated — igual que exs2_notificaciones, se lee/escribe solo vía Edge
  Function + RPC SECURITY DEFINER (§3).
```

## 4.2 Extensiones a tablas existentes

```text
mant_autorizaciones_visita (EXT-09, M14)
  + foto_url text nullable          — ruta en un bucket nuevo `visitas-fotos` (privado, mismo
                                       patrón de tamaño/MIME que subir-documento: solo jpeg/png,
                                       límite razonable — confirmar límite exacto al implementar)
  + fecha_prevista → nullable       — hoy es NOT NULL; una autorización "permanente" no tiene
                                       fecha. Guard nuevo: si fecha_prevista es null, exigir un
                                       flag explícito (o inferirlo de fecha_prevista is null) y
                                       documentar que "permanente" nunca se combina con
                                       hora_desde/hora_hasta acotadas (si hay horario, no es
                                       realmente permanente — decidir la regla exacta al implementar,
                                       no inventarla aquí a ciegas de un caso real).
```

## 4.3 `lista_tipos` — familias nuevas (D-24, sin filas precargadas salvo que se indique)

```text
TIPO_CORRESPONDENCIA   — cada copropiedad define sus tipos (carta, paquete, encomienda...)
TIPO_VISITANTE         — 2026-09-17: PLAN §10.1 confirma que esto es DISTINTO de TIPO_VISITA
                          (que ya existe: social/domicilio/servicio_domestico/mudanza/
                          proveedor_puntual — esos son tipos de VISITA, no categorías del
                          VISITANTE). Antes de crear esta familia nueva, decidir explícitamente
                          si de verdad hace falta la distinción (Vecindapp la tiene, AQUILA no la
                          pidió con un caso de uso propio) — no crearla solo por paridad con un
                          competidor sin necesidad confirmada (mismo principio de EXT-07 badges:
                          "no construir para un problema que AQUILA no tiene").
```

## 4.4 Explícitamente fuera del modelo de datos de esta ola

`exs2_notificaciones` (la tabla de staff) **no se modifica**. `notificaciones_actor_externo` nace
ligada a un solo evento (respuesta de staff a una solicitud, §7.7) — conectar más eventos
(visita autorizada/revocada, correspondencia recibida, reserva aprobada/rechazada) es trabajo real
de una ola futura, una vez que el mecanismo de esta ola esté verificado con el primer caso de uso.

---

# 5. Diseño Visual

Sin cambios respecto a Fase 1 §5: mismo sistema visual de AQUILA Web (Nuxt UI + Tailwind, mismos
tokens), sin paleta ni librería nueva. **Piso tipográfico**: `DESIGN.md` prohíbe bajar de
`text-xs` (12px) — Fase 1 tuvo que corregir 3 usos de `text-[10px]`/`text-[11px]` que se colaron
en los badges; no repetir ese error aquí.

Patrón de badges (Fase 1 §7.6, ya validado): cada tile nuevo de "Mis asuntos" (Visitas, Reservas,
Documentos, Correspondencia, Contactos) puede llevar un contador — pero **solo si se deriva de un
dato que la Edge Function correspondiente ya trae** (visitas vigentes, reservas pendientes de
aprobación, correspondencia sin entregar). No inventar un contador nuevo por módulo sin ese dato
disponible ya.

---

# 6. Estructura Frontend

## 6.1 Rutas nuevas bajo `pages/mi-copropiedad/`

```text
solicitudes/
├─ nueva.vue           # ya existe (Ola 1/EXT-02), sin cambios
├─ index.vue           # NUEVO (M10) — listado, reusa external-solicitudes-listar (modo lista)
└─ [id].vue            # NUEVO (M10/M12) — detalle + actuaciones del staff (es_respuesta=true)
visitas/
├─ index.vue           # NUEVO (M13) — reusa external-visitas-listar
└─ nueva.vue           # NUEVO (M13/M14) — reusa external-visitas-crear (+foto/permanente en M14)
reservas/
├─ index.vue           # NUEVO (M15) — reusa external-reservas-listar/-cancelar
└─ nueva.vue           # NUEVO (M15/M18) — reusa external-reservas-disponibilidad/-crear
                        #   (M18 agrega la opción "Mudanza" sobre la misma pantalla, no una aparte)
documentos/
└─ index.vue           # NUEVO (M16)
correspondencia/
└─ index.vue           # NUEVO (M17) — solo lectura + marcar "recogida" si aplica al residente
contactos/
└─ index.vue           # NUEVO (M19) — listar/crear/eliminar los propios
```

Todas con `definePageMeta({ layout: 'mi-copropiedad', publico: true })`, mismo criterio de Fase 1.
Actualizar `layouts/mi-copropiedad.vue` si se decide agregar más tiles a "Mis asuntos" — la
navegación inferior fija (4 slots) **no crece**: Solicitudes/Visitas/Reservas/Documentos/
Correspondencia/Contactos viven como accesos rápidos en la home (`mi-copropiedad/index.vue`,
patrón ya establecido en Ola 1 U6), no como ítems nuevos del bottom nav — 6+ ítems en una barra de
4 columnas rompería el layout.

## 6.2 Componentes nuevos

```text
components/mi-copropiedad/
├─ MiCopropiedadNotificacionBell.vue   # M11 — badge de no leídas + panel, mismo patrón que
│                                        NavNotificaciones.vue del lado staff pero sobre
│                                        notificaciones_actor_externo, no sobre exs2_notificaciones
├─ MiCopropiedadEstadoPill.vue         # reusable: pill de estado (solicitud/reserva/visita/
│                                        correspondencia) — evita repetir el mapeo
│                                        ETIQUETA_ESTADO en cada página
└─ (los demás, según necesidad real de cada página — no prediseñar componentes que ninguna
    pantalla concreta pida todavía)
```

Nombrar TODO archivo nuevo bajo `components/mi-copropiedad/` con el prefijo completo
`MiCopropiedad*` — **no repetir el bug de Ola 1** (Fase 1 §6.4/§11: los `Mic*.vue` originales
nunca resolvían en el navegador porque Nuxt solo dedupea el prefijo de directorio si el archivo
empieza con el PascalCase COMPLETO del directorio).

---

# 7. Backend

## 7.1 M10 — Solicitudes: listado/detalle

Sin Edge Function nueva. `external-solicitudes-listar` ya soporta `{vinculo_id}` (lista) y
`{vinculo_id, solicitud_id}` (detalle, vía `fn_solicitud_estado_externo`). Frontend nuevo consume
`listarSolicitudesExternas` (ya existe en `actor-externo-api.ts`, Ola 1 U6) para el listado, y una
función nueva `obtenerSolicitudExterna(vinculoId, solicitudId)` para el detalle.

## 7.2 M12 — Actuaciones/respuestas visibles al residente

```text
RPC nueva: fn_solicitud_actuaciones_externas(p_vinculo_id uuid, p_solicitud_id uuid)
returns table (fecha date, descripcion text, created_at timestamptz)
  security definer — valida "p_vinculo_id pertenece a auth.uid()" (mismo patrón que
  fn_solicitud_mis_solicitudes_externas), Y que la solicitud pertenece a ESE vínculo
  (origen_actor_externo_id = p_vinculo_id) antes de devolver nada.
  SELECT ... FROM solicitud_actuaciones WHERE solicitud_id = p_solicitud_id AND es_respuesta = true
  — NUNCA una actuación con es_respuesta=false (esas son notas internas del staff, GOB-8).
```

Extender `external-solicitudes-listar` para llamar esta RPC además de `fn_solicitud_estado_externo`
cuando `solicitud_id` viene en el body, y devolver `{ ...solicitud, actuaciones: [...] }`. GAP-VERIFY:
confirmar que el `RETURNS TABLE` con columna `fecha`/`created_at` no colisiona con el gotcha de
plpgsql ya documentado en `20260932860000_ext3_funciones.sql` (columna `id` como OUT param) —
esta función no expone `id`, así que no debería aplicar, pero verificar al escribirla.

## 7.3 M13 — Visitas: crear/listar/revocar en la nueva superficie

Sin Edge Function nueva — solo UI nueva sobre `external-visitas-crear/listar/revocar` (EXT-04, ya
verificado por el sub-informe: mismo patrón `fn_actor_externo_mis_vinculos` resuelve `inmueble_id`
server-side). `actor-externo-api.ts` gana `crearVisitaExterna`/`listarVisitasExternas`/
`revocarVisitaExterna`.

## 7.4 M14 — Foto + autorización permanente

```text
Migración: ALTER mant_autorizaciones_visita ADD foto_url text, ALTER fecha_prevista DROP NOT NULL
  + guard (CHECK o trigger — decidir la forma exacta al implementar) que exija AL MENOS UNO entre
  fecha_prevista y un flag "permanente" explícito, nunca ambos vacíos.
Bucket nuevo `visitas-fotos` (privado) — política de INSERT solo vía Edge Function con
  service_role (mismo criterio que documentos-inmueble), política de lectura solo por el mismo
  actor externo dueño del vínculo o por staff con rol auxiliar (portería necesita verla al
  validar el QR).
Extender external-visitas-crear: aceptar foto (multipart, como subir-documento) y/o
  `permanente: boolean` en el payload; si permanente=true, fecha_prevista queda null.
Extender autorizacion-visita-validar/-consumir (portería): mostrar la foto si existe — GAP-VERIFY
  el formato de respuesta actual antes de asumir dónde agregar el campo.
```

## 7.5 M15 — Reservas: disponibilidad/crear/cancelar en la nueva superficie

Sin Edge Function nueva — solo UI sobre `external-reservas-disponibilidad/-crear/-cancelar/
-listar` (EXT-03, confirmado 100% funcional para actor externo, cero RLS nueva). `actor-externo-
api.ts` gana los 4 wrappers correspondientes.

## 7.6 M16 — Documentos

```text
external-documentos-listar (Edge Function nueva)
  POST { vinculo_id }
  → resolverContextoActorExterno(admin, jwt, vinculo_id)   (_shared/actor_externo_context.ts,
    reusado tal cual, mismo patrón que external-cuenta-resumen — EXT-06)
  → admin.from('documentos').select(...).or(`inmueble_id.eq.${ctx.inmuebleId},inmueble_id.is.null`)
    .eq('tenant_id', ctx.tenantId)  — trae SOLO la versión vigente de cada grupo (usar
    v_documento_vigente, no documentos crudo, para no listar versiones viejas)
  → 200 { documentos: [{ id, nombre_archivo, tipo_documento_id, fecha_vencimiento, ... }] }

generar-enlace-documento — tercera vía `actor_externo` (MISMO patrón que crear-intencion-pago,
  EXT-07 §7.3): en vez de exigir has_role(['auxiliar']), resolver contexto vía
  actor_externo_context.ts y verificar que el documento solicitado es uno de los que
  external-documentos-listar ya le mostraría (mismo tenant_id, inmueble_id propio o null) antes
  de firmar el enlace. Todo lo que sigue (verificarTokenEnlace, ver-documento) no cambia una
  línea — mismo criterio de "la vía nueva no toca el camino ya probado" que usó EXT-07.
```

## 7.7 M17 — Correspondencia

```text
Lado staff (registrar que llegó algo) — Edge Function nueva, ej. `correspondencia-registrar`,
  auth 'user' + has_role(['auxiliar']), inserta con service_role (mismo patrón que
  subir-documento). Decidir en el momento de implementar dónde vive el botón/formulario en la UI
  de staff (§1.2 — no inventar navegación nueva sin necesidad).

Lado residente (ver lo suyo) — RPC + Edge Function nueva `external-correspondencia-listar`:
  POST { vinculo_id } → resolverContextoActorExterno → admin.from('correspondencia')
  .eq('inmueble_id', ctx.inmuebleId).eq('tenant_id', ctx.tenantId).order('created_at', {desc:true})
  → 200 { correspondencia: [...] }
  Badge de "Mis asuntos": cantidad con entregada=false — mismo criterio que Fase 1 §7.6 (derivado
  de un dato que la función ya trae).
```

## 7.8 M18 — Mudanzas (horario semanal)

```text
Migración mant_zona_horario_semanal (§4.1).
Extender guard_mant_reserva (GAP-VERIFY su cuerpo exacto antes de tocarlo — vive en
  supabase/migrations/20260932730000_mant10_reservas.sql o una migración posterior que lo
  reemplace, confirmar con `\df+ guard_mant_reserva` en el momento de implementar): si la zona
  tiene filas en mant_zona_horario_semanal, exigir que fecha (día de la semana) + hora_inicio/fin
  caigan DENTRO de alguna franja configurada para ese día — mismo criterio que ya usa esa función
  para duración/ventana/cupo (un solo punto de validación, no uno nuevo en paralelo).
external-reservas-disponibilidad: cuando la zona tenga horario semanal, la respuesta de
  disponibilidad debe reflejar las franjas válidas del día consultado (no solo "ocupadas") —
  extender el modo "con zona_comun_id + fecha" para incluir `franjas_validas: [...]` cuando
  aplique; sin cambios cuando la zona no tenga horario configurado (compatibilidad hacia atrás).
Sin Edge Function nueva para crear/cancelar — fn_reserva_crear_externa no cambia una línea (toda
  la validación de horario vive en el guard, mismo principio ya confirmado por el propio
  fn_reserva_crear_externa: "toda validación de negocio vive en guard_mant_reserva").
```

## 7.9 M19 — Contactos de emergencia

```text
external-contactos-emergencia (una sola Edge Function, 3 acciones por un discriminador `accion`
  en el body — mismo espíritu minimalista que "una función, varios verbos" ya usado en
  external-solicitudes-listar para lista/detalle):
  POST { vinculo_id, accion: 'listar' }
    → resolverContextoActorExterno → admin.from('contactos_emergencia')
      .eq('inmueble_id', ctx.inmuebleId) → 200 { contactos: [...] }
  POST { vinculo_id, accion: 'crear', nombre, telefono, parentesco? }
    → valida nombre/telefono no vacíos → insert con creado_por_vinculo_id = ctx.vinculoId → 201
  POST { vinculo_id, accion: 'eliminar', contacto_id }
    → valida que el contacto pertenece al MISMO inmueble_id del contexto (nunca solo al
      creado_por_vinculo_id — cualquier residente del inmueble puede gestionar, §4.1) → delete
```

## 7.10 M11 — Notificaciones al actor externo (EXT-08b)

```text
fn_notificar_actor_externo(p_tenant_id, p_actor_externo_vinculo_id, p_titulo, p_cuerpo, p_enlace,
  p_origen_entidad, p_origen_id, p_origen_evento)
  security definer, grants SOLO a service_role (mismo patrón que fn_notificar) — nunca invocable
  por authenticated/anon directo.
  Idempotente por (actor_externo_vinculo_id, origen_entidad, origen_id, origen_evento) — mismo
  criterio que fn_notificar (on conflict do nothing).

Trigger AFTER INSERT en solicitud_actuaciones (WHEN es_respuesta = true): resuelve
  solicitudes.origen_actor_externo_id de la solicitud afectada, llama fn_notificar_actor_externo
  con origen_entidad='solicitud', origen_id=solicitud_id, origen_evento='respuesta',
  enlace='/mi-copropiedad/solicitudes/<id>'. Si origen_actor_externo_id es null (solicitud
  creada por staff en nombre de alguien, no por el propio actor externo — confirmar si ese caso
  existe hoy), no genera notificación — no hay a quién avisar.

external-notificaciones-listar (Edge Function nueva, dos acciones por `accion` como en §7.9):
  'listar' → resolverContextoActorExterno → admin.from('notificaciones_actor_externo')
    .eq('actor_externo_vinculo_id', ctx.vinculoId).order('created_at',{desc:true}).limit(30)
  'marcar_leida' → update .set({leida_at: now()}).eq('id', notificacion_id)
    .eq('actor_externo_vinculo_id', ctx.vinculoId) — nunca marca la de otro vínculo.
```

---

# 8. Flujos Críticos

## 8.1 Ver y responder a una solicitud propia

```text
1. /mi-copropiedad/solicitudes → listado (external-solicitudes-listar, modo lista)
2. Tocar una → /mi-copropiedad/solicitudes/[id] → detalle + actuaciones es_respuesta=true
3. Si el staff respondió mientras tanto → notificación en la campana (M11) con enlace directo aquí
```

## 8.2 Autorizar una visita permanente con foto

```text
1. /mi-copropiedad/visitas/nueva → elegir vínculo (si aplica) → formulario
2. Marcar "permanente" (sin fecha) + adjuntar foto (input capture, cámara del dispositivo)
3. external-visitas-crear (extendido, M14) → QR firmado → pantalla de código
```

## 8.3 Reservar una mudanza dentro del horario configurado

```text
1. /mi-copropiedad/reservas/nueva → elegir zona "Ascensor de mudanzas" (tipo especial)
2. external-reservas-disponibilidad devuelve franjas_validas del día elegido (M18)
3. Elegir una franja válida → external-reservas-crear → guard_mant_reserva valida contra
   mant_zona_horario_semanal (además de sus chequeos ya existentes) → 201 o 409/400 según el caso
```

## 8.4 Recibir un paquete y verlo desde el celular

```text
1. Staff registra en portería (correspondencia-registrar) que llegó un paquete para el inmueble
2. Residente entra a /mi-copropiedad/correspondencia → external-correspondencia-listar → lo ve
   con entregada=false
3. Al recogerlo, staff marca entregada=true (mismo Edge Function o uno de actualización — decidir
   al implementar si es la misma función con un tercer `accion` o una separada)
```

---

# 9. Gaps Abiertos (GAP-VERIFY antes de asumir)

```text
G1. Cuerpo exacto de guard_mant_reserva — necesario para M18, no leído en el sub-informe de
    reservas (que confirmó SU EXISTENCIA y su rol, no su implementación línea por línea).
G2. Formato de respuesta actual de autorizacion-visita-validar/-consumir (portería) — necesario
    para decidir dónde mostrar la foto de M14.
G3. ¿Puede una solicitud externa (origen_actor_externo_id) llegar sin ese campo poblado? Si nunca
    pasa, el trigger de M11 puede simplificarse (sin el chequeo "si es null, no notifica").
G4. Límite de tamaño/MIME exacto para el bucket `visitas-fotos` (M14) — replicar el de
    subir-documento (15 MB, pdf/jpeg/png) o uno más chico apropiado para una foto de cédula/rostro
    (probablemente sin pdf) — decidir al implementar, no inventar un límite arbitrario aquí.
G5. TIPO_VISITANTE (§4.3) — confirmar con el usuario si de verdad hace falta antes de crear la
    familia en lista_tipos; podría no ser necesaria para M14 (foto + permanente no requieren esta
    taxonomía).
G6. Numeración exacta de migraciones — `ls supabase/migrations` antes de tomar un número. El plan
    (§5) estima que el bloque libre empieza en 20260943000000, pero **debe confirmarse en el
    momento de implementar**, no asumirse de este documento (memoria del proyecto: colisión de
    migraciones con sesión paralela).
```

---

# 10. Testing y Definition of Done

Se añade a `PROMPT_MAESTRO_FASE1.md` §12 y a los criterios ya usados en Fase 1 §10:

```text
□ Alcance exacto de §1.1, sin extras (nada de EXT-11/15/16 se toca)
□ Cada tabla nueva: ENABLE + FORCE RLS en la misma migración que la crea
□ Ninguna tabla nueva tiene política RLS que mencione actor_externo_vinculo directamente (§3) —
  toda su autorización pasa por RPC SECURITY DEFINER o ExecutionContext + admin client
□ M18: una zona SIN filas en mant_zona_horario_semanal se comporta exactamente igual que antes de
  este corte (regresión explícita a probar, no solo el caso nuevo)
□ M14: una autorización de visita existente (con fecha_prevista, sin foto) sigue funcionando sin
  cambios — la extensión es aditiva
□ M12: fn_solicitud_actuaciones_externas NUNCA devuelve una actuación con es_respuesta=false,
  probado explícitamente creando ambos tipos en el fixture
□ M11: notificación generada solo para el actor_externo_vinculo dueño de la solicitud, nunca
  visible a otro vínculo del mismo tenant (aislamiento, mismo criterio que Fase 1 con inmuebles)
□ M16: generar-enlace-documento vía actor_externo rechaza un documento de OTRO inmueble del mismo
  tenant (aislamiento) y uno de OTRO tenant (VINCULO_NO_PERTENECE)
□ M17/M19: correspondencia/contactos_emergencia de un inmueble nunca visibles desde el vínculo de
  otro inmueble, aunque sea del mismo tenant
□ tsc --noEmit, eslint, deno check (funciones nuevas), build → gates de PROMPT_MAESTRO_FASE1.md §12.3
□ Verificación en navegador con datos reales antes de dar cualquier corte por cerrado — Fase 1
  encontró 2 bugs reales (uno de datos, uno de naming de componentes) que ningún test unitario
  habría detectado; no asumir que "tests en verde" basta para un corte de UI nuevo.
```

---

# 11. Orden de Implementación

Cadencia elegida por el usuario (`PLAN_MI_COPROPIEDAD.md` §11, P2-03): **2a "solo UI" primero**
(cero riesgo de backend, backend ya existe y ya fue verificado por los sub-informes), **2b "con
backend nuevo" después**.

```text
── 2a: solo UI, backend ya existe y ya funciona ──────────────────────────────────────────────
U1 · pages/mi-copropiedad/solicitudes/{index,[id]}.vue — reusa external-solicitudes-listar tal    [HECHO]
     cual (M10), + external-solicitudes-cancelar (EXT-02, existía sin UI). Sin actuaciones
     todavía (eso es U8, requiere backend nuevo).
        ↓
U2 · pages/mi-copropiedad/visitas/{index,nueva}.vue — reusa external-visitas-* tal cual (M13).      [HECHO]
     Sin foto/permanente todavía (eso es U4).
        ↓
U3 · pages/mi-copropiedad/reservas/{index,nueva}.vue — reusa external-reservas-* tal cual (M15).   [HECHO]
     Sin Mudanzas todavía (eso es U9).

── 2b: requiere migraciones/Edge Functions nuevas ────────────────────────────────────────────
U4 · EXT-09 mejoras (M14): foto + autorización permanente — migración + bucket + extender          [HECHO]
     external-visitas-crear + UI de U2
        ↓
U5 · EXT-10 Documentos (M16): external-documentos-listar + tercera vía actor_externo en           [HECHO]
     generar-enlace-documento + pages/mi-copropiedad/documentos/index.vue
        ↓
U6 · EXT-14 Contactos de emergencia (M19): tabla + external-contactos-emergencia + UI — el más    [HECHO]
     simple de los dominios nuevos, buen calentamiento antes de Correspondencia
        ↓
U7 · EXT-12 Correspondencia (M17): tabla + Edge Functions (staff registra, residente lista) + UI   [HECHO]
        ↓
U8 · EXT-08b Notificaciones (M11/M12): tabla + trigger + fn_solicitud_actuaciones_externas +      [HECHO]
     Edge Functions de lectura + campana en el header + conectar con U1
        ↓
U9 · EXT-13 Mudanzas (M18): mant_zona_horario_semanal + extender guard_mant_reserva +           [HECHO]
     external-reservas-disponibilidad + UI de U3
```

---

# 12. Workflow y Formato de Reporte

Aplican sin cambios `PROMPT_MAESTRO_FASE1.md` §14 y §16 (mismo criterio de Fase 1 §12). Al cerrar
esta ola completa, registrar D-143 en `DECISIONES.md` (las decisiones P2-01/02/03 de
`PLAN_MI_COPROPIEDAD.md` §11) y las filas correspondientes en `MIGRACIONES_LEDGER.md` para cada
bloque de migraciones nuevo.

---

# 13. Resumen Ejecutivo para el Agente

Ola 2 tiene 3 piezas que son pura reutilización de Edge Functions de EXT-01/02/03/04 ya
verificadas (Solicitudes/Visitas/Reservas — U1-U3, cero riesgo) y 6 piezas que requieren backend
genuinamente nuevo (U4-U9), dos de ellas (Notificaciones y Mudanzas) señaladas explícitamente por
el usuario como "construir ahora" pese a que el análisis encontró que no había ninguna pieza
existente sobre la cual apoyarse — tratarlas con el mismo cuidado que un corte de Ola 1 con
migración real (RLS completa en la misma migración, tests de aislamiento, verificación en
navegador), no como una extensión menor. Seguir §9 (Gaps Abiertos) antes de asumir el diseño
exacto de cada pieza — varios detalles finos (guard_mant_reserva, formato de portería, límites de
archivo) están deliberadamente marcados "verificar al implementar", no inventados aquí.
