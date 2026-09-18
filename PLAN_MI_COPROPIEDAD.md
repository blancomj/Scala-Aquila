# PLAN MI COPROPIEDAD — Frontend web-móvil para propietarios y residentes

## 1. Contexto

El 2026-09-16 se evaluaron tres insumos para extender AQUILA hacia sus usuarios finales
(propietarios y residentes) como **frontend web independiente, mobile-first, en URL propia** —
no una app nativa:

1. **18 documentos** de un análisis externo (`01_EXTERNAL_REPOSITORY_AUDIT.md` →
   `17_EXTERNAL_IMPLEMENTATION_QA_ROLLOUT.md` + selección de stack), sin acceso al repo real.
2. **Exploración funcional en vivo de Vecindapp** (`app.vecindapp.co`), competidor en producción:
   13 módulos para el propietario/residente.
3. **Auditoría directa del repositorio AQUILA** (código, migraciones, `DECISIONES.md`).

Resultado íntegro de la fusión: [artifact de la propuesta](https://claude.ai/artifact/RxRR3BSNxo93cTzrBhzDq8)
(mockups ilustrativos, comparación completa con Vecindapp). Este documento es la traducción de
esa propuesta al formato de ejecución del repo — la única fuente para implementar.

**Veredicto de la evaluación: el 60-70 % del cimiento ya existe. No se parte de cero.** El
diagnóstico externo es conceptualmente sólido (modelo actor/relación/capability, cadena de
autorización, boundary Web/External) pero **no verificado contra el código real** — varias de
sus suposiciones de "gap" ya están resueltas en el repo, y no detecta un desarrollo paralelo que
el propio proyecto ya tiene a medio camino.

## 2. Qué ya existe (confirmado por código)

| Pieza | Dónde | Aporta |
| --- | --- | --- |
| Identidad de actor externo (OTP, sesión real) | `portal-externo/index.vue`, `actor-externo-api.ts`, tablas `actor_externo_vinculo`/`actor_externo_otp` (EXT-01) | Login ya resuelto — sesión Supabase Auth real vía `verifyOtp({type:'recovery'})`, **nunca** `tenant_member` (guard SQL en `ext1_vinculo.sql`) |
| Landing de vínculos | `portal-externo/mis-vinculos.vue` + RPC `fn_actor_externo_mis_vinculos` | Selector de inmueble/rol ya resuelto server-side |
| Solicitudes (Atención/PQRS) | `nueva-solicitud.vue`, `gobiernoAtencion.ts`, tablas `solicitudes`/`solicitud_actuaciones`/`solicitud_sla`, estado `cancelada_por_solicitante` (EXT-02) | Dominio maduro con SLA y escalamiento — más completo que el de Vecindapp |
| Reservas de zonas comunes | `mant10_reservas`, extendida en `ext3_extender_guard_reserva`/`ext3_funciones` (EXT-03/04) | Ficha de zona (capacidad/depósito/valor) ya modelada |
| Autorización de visitas + QR | `autorizacion-visita-crear`, `mant_autorizaciones_visita`, `_shared/link_token.ts` (HMAC firmado) (EXT-04) | Falta tipo de visitante, foto, autorización permanente (ver §7) |
| Documentos con enlace firmado | `generar-enlace-documento`/`ver-documento`, legal hold | Signed URL temporal, autorización transitiva ya resuelta |
| **Notificaciones** | `exs2_notificaciones` (migración `20260933010000`, serie EXS cerrada) | **Corrige al análisis externo**, que lo marca como gap ("solo `audit_log`+cookie"). Ya es dominio formal: pasa de `CREATE` a `REUSE` |
| Gobierno (juntas/reuniones/votaciones) | 9 stores de gobierno, serie **GOB0-9** cerrada y en remoto (corrige la atribución original a "CO-9", que es de Contabilidad — ver §12.1) | Elegibilidad de voto ya resuelta por el Core |
| Estado de cuenta / pagos | `ver-estado-cuenta`, `crear-intencion-pago`, `ver-intencion-pago`, `ver-recibo-caja` | Primera vertical financiera lista para exponerse tal cual |
| Rate limiting / tokens firmados | `_shared/rate_limit.ts` + `check_rate_limit`, `_shared/link_token.ts` | No se reinventa ninguno de los dos |
| Middleware `tenant.ts` | ya contempla actor externo sin membership (líneas 70-83, comentario "AD-37") | Base del `ExecutionContext` — se adapta, no se reescribe |

## 3. Qué NO existe (y el análisis externo asumía a ciegas)

- **Rol RBAC "residente/propietario/portero".** `apps/web/app/types/permissions.ts` solo define
  `auxiliar | auditor | administrador` — **por diseño**: el actor externo no usa RBAC de tenant,
  usa la cadena separada `actor_externo_vinculo → inmueble_persona_rol → capability`.
- **Correspondencia/paquetería.** Sin tabla ni store — coincide con el gap G1 que el propio
  análisis externo marcaba (no inventar sin confirmar), y aquí se confirma: no existe.
- **Foto/tipo de visitante/autorización permanente** en `autorizacion-visita-crear` — el flujo
  base existe, estos tres campos no.
- **`apps/mobile` compilando.** Existe como scaffold React Native (`MisVisitasScreen`,
  `MisReservasScreen`, `MisSolicitudesScreen`, `NuevaVisitaScreen`, `src/api/{visitas,
  solicitudes}.ts`) construido en paralelo sobre las mismas Edge Functions del portal externo,
  **sin compilar**. Es el camino que el giro de estrategia deja atrás.
- **Layout/rutas mobile-first propias.** `portal-externo/*` hoy son 3 páginas puntuales
  (`layout:'blank'`), no una superficie completa con navegación, "Mis asuntos" agregado, ni
  identidad visual propia.

## 4. Decisiones — respondidas por el usuario el 2026-09-16

Se registran como **D-142** en `DECISIONES.md` en cuanto se cierre EXT-05/06/07 (mismo criterio
que `PLAN_MOTOR_REPORTES.md` con D-136: el número se asigna al plan, el detalle final al cerrar
el primer corte real).

| # | Pregunta | Decisión | Implicación |
| --- | --- | --- | --- |
| P-01 | ¿Qué hacer con `apps/mobile`? | **Reescribir sus pantallas como referencia de UX** para las equivalentes Nuxt (no se conserva el código React Native). `MisVisitasScreen`/`MisReservasScreen`/`MisSolicitudesScreen`/`NuevaVisitaScreen` se estudian al construir EXT-08 (solicitudes), EXT-09 (visitas) y EXT-10 (reservas) respectivamente — su flujo/orden de pantallas es el insumo, no su código. `apps/mobile` queda congelado (sin desarrollo nuevo) hasta que cada equivalente Nuxt esté implementado y verificado; el borrado del scaffold se decide corte por corte, no de una vez. |
| P-02 | ¿Nombre y dominio? | **`app.aquila.co`** | Layout `mi-copropiedad` en `apps/web` sirviendo bajo ese dominio/subdominio (configuración de despliegue, fuera de este plan). Actualiza el nombre de trabajo del artifact. |
| P-03 | ¿"Llamados de atención"? | **No desarrollar.** | Confirmado fuera de alcance — no es una brecha técnica, es una decisión de producto que el usuario no quiere tomar ahora. |
| P-04 | ¿Correspondencia/paquetería? | **Implementar.** | Pasa de "Ola 3 / fuera de alcance" a **EXT-12**, reubicada en Ola 2 (§6) — no bloquea la fundación/finanzas de Ola 1, pero ya no se aplaza indefinidamente. |
| P-05 | ¿Mudanzas y Contactos de emergencia? | **Implementar ambas.** | **EXT-13** (Mudanzas, reserva con horario semanal configurable) y **EXT-14** (Contactos de emergencia), también reubicadas en Ola 2. |
| P-06 | ¿Vecitienda (marketplace P2P)? | Sin respuesta explícita — se mantiene la recomendación original: **descartado**, fuera del núcleo financiero/administrativo de AQUILA. | Confirmar si el usuario quiere reabrirlo; no se construye salvo que lo pida explícitamente. |
| P-07 | ¿Orden de actores? | Sin objeción — se mantiene **Propietario → Residente → Solicitante → Junta → Portería → Proveedor**. | Sin cambios respecto al artifact original. |

## 5. Modelo de datos — solo lo nuevo

La Ola 1 (§8, EXT-05/06/07) **no requiere ninguna tabla nueva** — reutiliza `actor_externo_vinculo`,
`inmueble_persona_rol`, `solicitudes`, `exs2_notificaciones`, y las Edge Functions financieras ya
citadas en §2. Las únicas tablas nuevas de todo el plan (Olas 2-3, fuera de este documento de
ejecución inmediata) son:

```text
correspondencia            tenant_id, inmueble_id, tipo (lista_tipos), destino, remitente,
                            entregado_a, registrado_por, entregada boolean, entregada_at
contactos_emergencia       tenant_id, inmueble_id (o persona_id), nombre, telefono, parentesco
```

`Mudanzas` **no** es una tabla nueva: se modela como un tipo más de reserva sobre
`mant10_reservas`/`zonas_comunes` (recurso = "Ascensor de mudanzas" o "Zona de cargue"), con reglas
de horario semanal que ya podrían vivir en `zonas_comunes` (columnas de horario) o requerir una
extensión menor — a confirmar en Ola 3, no antes.

**Próximo bloque de migraciones libre:** el ledger cierra en `RPT-05 (parcial)` en
`20260941060000`, pero el `git status` de esta sesión ya muestra dos migraciones sin commitear en
`20260942000000`/`20260942010000` (`fix_invite_user_jerarquia_roles`,
`guard_inmueble_inactivar_saldo_pendiente`) que aún no están en el ledger. **Verificar
`ls supabase/migrations` antes de tomar un número** (memoria del proyecto: colisión de
migraciones con sesión paralela) — el bloque `EXT-05` probablemente arranca en
`20260943000000`, pero debe confirmarse en el momento de implementar, no ahora.

## 6. Numeración de cortes

Esta iniciativa **continúa la serie `EXT-*`** ya usada en el repo para el portal externo
(EXT-01 identidad, EXT-02 solicitudes, EXT-03 visitas, EXT-04 reservas) — no se inventa un
prefijo nuevo.

| Corte | Contenido | Ola |
| --- | --- | --- |
| **EXT-05** | Layout `mi-copropiedad` + navegación mobile-first + agregador "Mis asuntos" | 1 — cubierto por `PROMPT_MI_COPROPIEDAD_FASE1.md` |
| **EXT-06** | `ExecutionContext` formal + cruce con `permissions.ts` + capability mapping | 1 — ídem |
| **EXT-07** | Finanzas: estado de cuenta, explicación, pago, resultado, comprobante | 1 — ídem |
| EXT-08 | Solicitudes + notificaciones expuestas en la nueva superficie (referencia UX: `NuevaVisitaScreen`/`MisSolicitudesScreen` de `apps/mobile`) | 2 |
| EXT-09 | Visitas: tipo de visitante (lista_tipos), foto, autorización permanente, historial consultable (referencia UX: `MisVisitasScreen`) | 2 |
| EXT-10 | Documentos + reservas de zonas comunes en la nueva superficie (referencia UX: `MisReservasScreen`) | 2 |
| EXT-11 | Gobierno (Junta/Consejo): reuniones, documentos, votación | 3 |
| **EXT-12** | Correspondencia/paquetería (nuevo dominio) — **aprobado (P-04)** | 2 |
| **EXT-13** | Mudanzas (reserva con horario semanal configurable) — **aprobado (P-05)** | 2 |
| **EXT-14** | Contactos de emergencia — **aprobado (P-05)** | 2 |
| EXT-15 | Proveedor/contratista | 3 |
| EXT-16 | Hardening final: IDOR, replay, revocación de vínculo, rollout gradual | 3 |

Este documento y `PROMPT_MI_COPROPIEDAD_FASE1.md` cubren **solo EXT-05/06/07** (Ola 1). Las
demás quedan en backlog — no se detallan en prompt hasta que la Ola 1 esté cerrada y verificada
(mismo principio que usó `PLAN_MOTOR_REPORTES.md`: no detallar la fase N+1 sin haber cerrado N).

## 7. Backlog de brechas confirmadas (fuera de Ola 1, ya aprobadas)

| Brecha | Origen | Tamaño estimado | Corte |
| --- | --- | --- | --- |
| **Badge de conteo por módulo** — cada ícono de "Mis Opciones" en Vecindapp trae un número de pendientes/nuevos (PQRS, Reservas, Facturación, Comunicados, Documentos, Llamados de atención, Historial de visitas, Autorización visitantes...) | Hallazgo Vecindapp (visto en las capturas, no señalado explícitamente hasta que el usuario lo pidió) | Pequeño para Solicitudes/Finanzas (derivable de datos que Ola 1 ya trae); requiere un contador dedicado por dominio a medida que cada módulo de Ola 2/3 se expone | EXT-05 (Solicitudes/Finanzas) → se repite en cada corte de Ola 2/3 |
| Tipo de visitante (11 categorías tipo Vecindapp) como `lista_tipos` | Hallazgo Vecindapp | Pequeño — extender `autorizacion-visita-crear`/`external-visitas-crear` + 1 FK | EXT-09 |
| Foto de visitante (cámara del dispositivo) | Hallazgo Vecindapp | Pequeño — input `capture` + subida a Storage | EXT-09 |
| Autorización permanente (sin rango de fecha) | Hallazgo Vecindapp | Pequeño — columna nullable + guard | EXT-09 |
| Historial de visitas consultable por el propietario | Hallazgo Vecindapp | Por confirmar si `autorizacion-visita-consumir`/`external-visitas-listar` ya deja registro | EXT-09 |
| Correspondencia/paquetería | Hallazgo Vecindapp + gap G1 externo | Mediano — tabla nueva + Edge Function | EXT-12 |
| Mudanzas (reserva con horario semanal configurable) | Hallazgo Vecindapp | Mediano — extensión de `zonas_comunes`/reservas | EXT-13 |
| Contactos de emergencia | Hallazgo Vecindapp | Pequeño — tabla nueva ligada a `inmueble_persona_rol` | EXT-14 |

## 8. Fuera de alcance (explícito)

Llamados de atención/comparendos (P-03, confirmado que no se construye) · Vecitienda/marketplace
P2P (sin aprobación, se mantiene descartado) · asistente conversacional tipo "VECI" (aplazable a
evolución de `IA-01`) · código React Native de `apps/mobile` (se usa solo como referencia de UX,
no se conserva ni se extiende, P-01) · cualquier rol RBAC nuevo de tenant · cualquier cálculo
financiero, de mora o de elegibilidad de voto fuera del Core · Citofonía (no explorada por
implicar una llamada real a un tercero).

## 9. Riesgos

1. **Que `apps/mobile` se retome como código en vez de solo como referencia de UX** — mitigado por
   P-01: sus pantallas se estudian corte por corte (EXT-08/09/10), el código RN no se integra ni
   se compila.
2. **Que la nueva superficie recalcule algo que el Core ya calcula** — mitigado porque la Ola 1
   solo expone Edge Functions existentes, cero lógica financiera nueva.
3. **Colisión de migraciones** al asumir el siguiente número del ledger sin mirar el disco — ver
   nota de §5.
4. **Que el layout nuevo termine heredando navegación/menús administrativos** por reusar
   componentes de `apps/web` sin cuidado — mitigado en `PROMPT_MI_COPROPIEDAD_FASE1.md` §6-7.

## 10. Ola 2 — verificación contra el código real (2026-09-17)

Ola 1 (EXT-05/06/07) cerró completa el 2026-09-17 (D-142, `PROMPT_MI_COPROPIEDAD_FASE1.md` §11).
Antes de detallar un prompt de ejecución para Ola 2, se auditaron los 6 cortes (EXT-08/09/10/12/
13/14) contra el código real — el mismo criterio que evitó reconstruir cosas ya resueltas en Ola 1.
**El resultado corrige varias suposiciones de §6/§7, en ambas direcciones**: algunas cosas que se
asumían "por confirmar" ya están resueltas; una que se asumía resuelta no lo está en absoluto.

### 10.1 EXT-09 (Visitas) — más resuelto de lo que el backlog asumía

`external-visitas-crear/listar/revocar` (EXT-04) **ya funcionan de punta a punta para el actor
externo** — mismo patrón de EXT-01/02 (`fn_actor_externo_mis_vinculos` resuelve `inmueble_id`
server-side, nunca del body). El QR reusa `_shared/link_token.ts` (HMAC, igual que estado de
cuenta). **El "historial de visitas consultable" que `PLAN` §7 marcaba "por confirmar" YA EXISTE**:
`fn_autorizacion_visita_mis_autorizaciones_externas` hace LEFT JOIN con `mant_registros_acceso` y
trae `ingreso_at/egreso_at` — no es un gap, hay que tacharlo del backlog.

Los tres gaps reales confirmados (`mant_autorizaciones_visita`, columna por columna):
- **Foto del visitante**: no existe ninguna columna. Requiere bucket de Storage + columna.
- **Autorización permanente**: `fecha_prevista date not null` — siempre exige una fecha, no hay
  forma de omitirla. Requiere volver la columna nullable + un guard explícito.
- **"Tipo de visitante"**: lo que existe es `tipo_id → lista_tipos` con la familia `TIPO_VISITA`
  (`social/domicilio/servicio_domestico/mudanza/proveedor_puntual`) — es tipo de **visita**, no
  una categorización del **visitante** (los ~11 tipos que muestra Vecindapp). Son conceptos
  distintos; si se quiere la categorización de Vecindapp hace falta una familia nueva de
  `lista_tipos` (`TIPO_VISITANTE`), no reusar `TIPO_VISITA`.

**Lo único que falta para el 80% del corte es UI**: no existe ninguna página bajo
`pages/mi-copropiedad/` para visitas — solo las pantallas de `apps/mobile` (referencia de UX, P-01).

### 10.2 EXT-10 (Reservas) — reservas es 100% reutilización, cero backend nuevo

`external-reservas-crear/listar/cancelar/disponibilidad` (EXT-03) están completos y **ya
autorizan al actor externo sin RLS nueva** — las 3 RPCs (`fn_reserva_crear_externa`,
`_cancelar_externa`, `_mis_reservas_externas`) son `SECURITY DEFINER` con su propio chequeo
"es mío", no dependen de una política RLS para `actor_externo_vinculo` (que no existe y no hace
falta). Mapean cada código de error de negocio (`CUPO_EXCEDIDO`, `TRASLAPE`, `LIMITE_INMUEBLE_
EXCEDIDO`, etc.) a su HTTP correcto. **Este sub-corte es, en la práctica, tan liviano como fue
Ola 1: exponer Edge Functions que ya existen detrás de una UI nueva** — mismo patrón, cero
migraciones, cero Edge Functions nuevas.

`zonas_comunes` **no tiene ninguna columna de capacidad, depósito ni horario/franja/día de la
semana** (confirmado, comentario explícito en `20260932710000_mant10_vocabulario.sql`: "no tiene
disponibilidad ni reglas de reserva"). El monto de una reserva sale de `conceptos.valor_fijo` vía
`mant_zona_reserva_regla.concepto_id`, no de una columna de depósito propia. Esto es relevante
para EXT-13 (Mudanzas, ver 10.5): confirma que "horario semanal configurable" **no existe en
ningún lado del esquema hoy** — no es una omisión de este análisis, es una pieza nueva real.

### 10.3 EXT-10 (Documentos) — SÍ es un gap real, nada reusa tal cual

A diferencia de reservas, ningún Edge Function de documentos sirve hoy a un actor externo:
`generar-enlace-documento`/`subir-documento` exigen rol `auxiliar` (staff/tenant_member);
`ver-documento` es público pero solo vía token HMAC ya emitido (pensado para el enlace de un
estado de cuenta, no para "ver el reglamento de mi copropiedad"). La tabla `documentos` no tiene
ninguna columna de visibilidad por propietario — solo `inmueble_id` (nullable = documento de
copropiedad) y una única política RLS para miembros del tenant. **Se necesita una Edge Function
nueva** (`external-documentos-listar`, mismo patrón que `external-cuenta-resumen`: `ExecutionContext`
+ admin client filtrando por `inmueble_id = ctx.inmuebleId or inmueble_id is null`) más reusar
`ver-documento`/`link_token.ts` para el acceso puntual al archivo — no inventa un mecanismo nuevo,
combina dos que ya existen (`_shared/actor_externo_context.ts` + `_shared/link_token.ts`), igual
que hizo EXT-07 con `v_cargo_saldo`.

Legal hold ya existe (`documentos_legal_holds`, independiente de `documentos` por ser append-only)
— no requiere ningún cambio para este corte, es transparente al actor externo (no hay ninguna
noción de "documento con hold" visible desde afuera, y no debería haberla).

### 10.4 EXT-08 (Solicitudes + notificaciones) — la mitad "notificaciones" no es un simple reuse

**Solicitudes**: lo que falta es la UI de listado/detalle bajo `mi-copropiedad/solicitudes/` (hoy
solo existe `nueva.vue`) y exponer las **actuaciones/respuestas del staff** — hoy
`fn_solicitud_estado_externo` devuelve la solicitud pero NINGUNA fila de `solicitud_actuaciones`,
y esa tabla no tiene política RLS para actor externo. Para que el residente vea "el staff
respondió esto" hace falta una RPC nueva (o extender la existente) que traiga solo las actuaciones
con `es_respuesta = true` de SU solicitud — nunca las notas internas del staff, y siempre
verificando el vínculo server-side (mismo patrón que toda la serie).

**Notificaciones — esto es lo que corrige la lectura de `PLAN` §2/§7.** El `PLAN` original decía
que `exs2_notificaciones` "ya es dominio formal, pasa de CREATE a REUSE" — **eso es cierto solo
para miembros del tenant (staff), no para un actor externo**. La tabla `notificaciones` no tiene
ninguna columna de destinatario individual (ni `auth_user_id`, ni `actor_externo_vinculo_id`): se
enruta por `modulo` + `puede_ver_modulo(tenant_id, modulo)`, una función que evalúa **rol de
tenant_member** — un actor externo, que por AD-37 nunca lo es, no puede pasar por esa puerta bajo
ningún ajuste menor. Tampoco existe ningún RPC/Edge Function de lectura (`fn_notificar` solo
escribe, con grant exclusivo a `service_role`); hoy el cliente lee la tabla directo vía RLS
(`stores/notificaciones.ts`), y esa RLS tampoco cubre actor externo. **Conectar notificaciones al
actor externo no es "reusar un dominio ya formal" — es diseñar una segunda vía de autorización
sobre un dominio pensado desde cero para tenant_member.** Es una pieza de tamaño real, no la cola
menor que el backlog original sugería. Ver la decisión abierta en §11.

### 10.5 EXT-13 (Mudanzas) — confirma la propia duda del plan: no hay dónde apoyarse

`PLAN` §5 ya lo dejaba abierto ("a confirmar en Ola 3, no antes"). Confirmado ahora: ni
`zonas_comunes` ni `mant_zona_reserva_regla` tienen columna de horario/franja/día de la semana —
"horario semanal configurable" no es una extensión de una pieza existente, es una tabla nueva
completa (algo como `zona_horario_semanal`: zona_comun_id, dia_semana, hora_desde, hora_hasta) que
nadie ha diseñado todavía. Ver la decisión abierta en §11.

### 10.6 EXT-12 (Correspondencia) y EXT-14 (Contactos de emergencia) — confirmado: dominios nuevos

Cero coincidencias de `correspondencia`/`contactos_emergencia` en todo `supabase/migrations/` —
el `PLAN` original acertó, son dominios genuinamente nuevos. Patrón a seguir para ambas tablas
(confirmado con un ejemplo real, `20260933010000_exs2_notificaciones.sql`): `ENABLE`+`FORCE RLS`
en la misma migración que crea la tabla, comentario de cabecera explicando el porqué, sin política
de INSERT para `authenticated` cuando la escritura debe pasar por una Edge Function con
`service_role` (mismo criterio que `documentos`). El "tipo" de correspondencia (carta/paquete/...)
va en `lista_tipos` (D-24), sin filas precargadas — mismo patrón que `TIPO_SOLICITUD`/`TIPO_VISITA`,
cada copropiedad las define. `inmueble_persona_rol` (destino natural de `contactos_emergencia`, por
`inmueble_id` o por vínculo) ya tiene el patrón "cerrar con `vigente_hasta`, nunca DELETE" — aplica
igual aquí si se decide ligarlo a un vínculo puntual en vez de al inmueble completo.

## 11. Decisiones abiertas de Ola 2 — pendientes de respuesta antes del prompt de ejecución

| # | Pregunta | Recomendación |
| --- | --- | --- |
| P2-01 | **Notificaciones en EXT-08**: dado que no es un simple reuse (§10.4), ¿se construye ahora una vía de autorización nueva y mínima (p. ej. notificar al `actor_externo_vinculo` en eventos puntuales ya conocidos: cambio de estado de una solicitud propia), o se difiere el dominio de notificaciones completo y EXT-08 de esta ola se limita a Solicitudes (listado + detalle + actuaciones del staff)? | Diferir notificaciones; EXT-08 = solo Solicitudes. Es la misma cola que ya cubre el badge de Ola 1 (saldo/solicitudes abiertas) sin construir una segunda vía de autorización completa para un beneficio marginal en esta ola. |
| P2-02 | **Mudanzas (EXT-13)**: ¿se construye la pieza nueva de horario semanal configurable (tabla `zona_horario_semanal` o similar) ahora, o se simplifica esta ola a modelar "Mudanza" como una reserva normal de una zona especial ("Ascensor de mudanzas"/"Zona de cargue"), con fecha+hora explícitos por reserva — el mismo mecanismo de EXT-03/04 que ya funciona, sin horario predefinido — y se deja el horario semanal para cuando haya una necesidad real confirmada? | Simplificar: reusar el mecanismo de reservas tal cual. Cero backend nuevo, coherente con "no construir para un problema que AQUILA no tiene todavía" (mismo criterio de `PLAN_MOTOR_REPORTES.md`). |
| P2-03 | **Orden de implementación de Ola 2**: dado que Reservas (parte de EXT-10) y Visitas (EXT-09, salvo foto/permanente) ya funcionan de punta a punta en backend — solo falta UI —, mientras que Documentos (EXT-10), Correspondencia (EXT-12), Contactos de emergencia (EXT-14) y las mejoras de Visitas (foto/autorización permanente) requieren backend nuevo, ¿se prefiere un orden "solo-UI primero" (2a: Solicitudes-listado, Visitas-UI, Reservas-UI) y luego "con backend nuevo" (2b: Documentos, Visitas-mejoras, Correspondencia, Contactos), o el orden EXT-08→09→10→12→13→14 tal como está numerado? | Solo-UI primero (2a) — entrega valor observable más rápido y de menor riesgo, mismo criterio que ya usó Ola 1 (U1-U3 backend, U4-U7 frontend, pero aquí incluso el backend de 2a ya existe). |

Estas tres decisiones se responden antes de escribir `PROMPT_MI_COPROPIEDAD_FASE2.md` — mismo
criterio que P-01..P-07 en §4 para Ola 1.

## 12. Ola 3 — verificación contra el código real (2026-09-18)

Ola 2 (EXT-08/09/10/12/13/14) cerró completa el 2026-09-18, verificada en navegador en su
totalidad (D-143, incluido el addendum de U9/Mudanzas). Antes de detallar un prompt de ejecución
para Ola 3, se auditaron sus 3 cortes (EXT-11/15/16) contra el código real — mismo criterio que
evitó reconstruir cosas ya resueltas en Ola 1/2. A diferencia de Ola 2 (seis cortes de tamaño
razonablemente parejo), **Ola 3 es muy despareja**: un corte de reuso real, un corte que exige una
pieza de arquitectura nueva no trivial, y un corte de seguridad con dos gaps concretos y baratos
de cerrar.

### 12.1 EXT-11 (Gobierno) — reuso real, pero cero superficie externa hoy

El dominio no es "CO-9" (Contabilidad) como decía §2 antes de esta auditoría — es la serie
**GOB0-9**, cerrada y en remoto: `gobierno_organos/atribuciones/miembros` (GOB-1),
`gobierno_reuniones/convocatorias/agenda/poderes/asistencia` (GOB-2), `gobierno_votaciones/votos`
(GOB-3), `gobierno_actas/acta_consecutivo` (GOB-4), decisiones/convivencia/impugnaciones (GOB-5..9,
Atención/PQRS de GOB-9 es un dominio distinto ya cubierto por EXT-08). 9 stores en
`apps/web/app/stores/gobierno*.ts` (no 8 — Tablero es un dashboard agregador).

**Cero superficie externa existe**: ningún `external-gobierno-*`/`external-reuniones-*`/
`external-votaciones-*`, ninguna página bajo `pages/mi-copropiedad/`, y todas las tablas de
gobierno tienen una única policy SELECT (`is_member(tenant_id)`) — un actor externo no puede leer
nada hoy.

**Elegibilidad de voto ya resuelta por el Core, confirmado línea por línea**: vive en el trigger
`guard_gobierno_voto()` (`20260931530000_gob3_votaciones.sql`) — exige una fila vigente en
`gobierno_asistencia`, congela `coeficiente` desde ahí (nunca del cliente), evita duplicados. Es
reusable tal cual (el plan §8 ya prohíbe reimplementar esta regla) pero **hoy solo `auxiliar`
puede insertar en `gobierno_asistencia`/`gobierno_votos`** — la brecha real es exponerlo vía una
RPC `security definer` nueva con el mismo patrón de `_shared/actor_externo_context.ts`, no
reconstruir la regla. `gobierno_asistencia.modalidad_asistencia` ya contempla el valor `'remota'`
sin ningún flujo que lo use desde fuera — pieza a medio construir, no gap desde cero.

**Actas probablemente ya se resuelven con Ola 2, sin construir nada**: usan la tabla general
`documentos` (`fn_gobierno_vincular_documento_acta`, `inmueble_id null` = documento de
copropiedad) — el mismo mecanismo que ya expone `external-documentos-listar` (EXT-10). Falta
confirmar en la implementación que el `tipo_documento` de un acta pasa el filtro de esa función
sin heredar los problemas de visibilidad por propietario que esa misma auditoría (§10.3) ya
detectó para documentos en general.

**Gaps reales**: (a) lectura de reuniones/convocatorias/agenda/resultados de votación — ninguna
función existe; (b) asistencia y voto remotos — falta la RPC puente, la regla de negocio ya existe.

### 12.2 EXT-15 (Proveedor/contratista) — el backend es maduro, el puente actor-externo no existe

No hay tabla `proveedores`/`contratistas` — se modela como **satélite sobre `terceros`**, ya
construido por la serie MANT-5 (no es trabajo de Ola 3, ya existe y está maduro): rol
`PERSONA_COPROPIEDAD.proveedor`/`.contratista` vía `tenant_tercero_rol`, más
`mant_proveedor_perfil` (categorías/especialidades), `mant_proveedor_habilitacion` (certificaciones
con semáforo vigente/próximo/vencida), `mant_contratos`, `mant_ordenes_trabajo` (con validación de
habilitación vigente del contratista asignado), garantías y evaluación de proveedor. Cero
`cotización`, cero Edge Functions — toda esa serie es staff-facing por RLS/RPC directas.

**El gap real y no trivial es estructural, no de superficie**: `actor_externo_vinculo` (Ola 1)
referencia **directamente** `inmueble_persona_rol.id` — un rol atado a un inmueble
(`PERSONA_PREDIO`: copropietario/inquilino/apoderado). Un proveedor se vincula al **tenant
completo** vía `tenant_tercero_rol` (catálogo `PERSONA_COPROPIEDAD`), una tabla distinta sin
relación con `inmueble_persona_rol` ni con `actor_externo_vinculo` (confirmado por el comentario
de cabecera de `tenant_tercero_rol.sql`: "esos conceptos son de propiedad de un inmueble").
**EXT-15 no puede reusar el mecanismo de identidad de EXT-01 tal cual** — necesita una variante
nueva del patrón (vínculo a nivel tenant, no a nivel inmueble), replicando OTP/sesión/RLS pero
sobre una relación distinta. Es la primera vez en toda la iniciativa que esto pasa.

### 12.3 EXT-16 (Hardening) — dos gaps concretos, dos preocupaciones ya resueltas

Auditados IDOR, replay, revocación de vínculo y rollout gradual contra las 16 Edge Functions
`external-*`/`actor-externo-*` existentes:

- **IDOR — cubierto, sin excepción encontrada**: todas resuelven `tenant_id`/`inmueble_id`
  server-side vía `fn_actor_externo_mis_vinculos` (directo o vía `resolverContextoActorExterno`),
  nunca del body del cliente.
- **Revocación de vínculo — cubierto de forma centralizada**: `fn_actor_externo_mis_vinculos` es
  el único punto de origen del dato y ya filtra `vigente_hasta`; como todas las funciones dependen
  de esa RPC, un vínculo revocado desaparece de toda la superficie a la vez, sin doble-chequeo que
  pueda desalinearse.
- **Replay — diseño intencional, no bug**: `_shared/link_token.ts` expira pero es reusable hasta
  ese vencimiento (documentado en su propio comentario de cabecera) — correcto para enlaces de
  solo lectura (estado de cuenta, documentos). Solo sería un gap si el negocio exige semántica de
  un solo uso para algún enlace puntual — a confirmar, no a asumir.
- **Rate limiting — gap real, con una corrección al implementar**: cubierto en 7 funciones de
  *lectura* (OTP, cuenta-resumen, documentos-listar, contactos, correspondencia-listar,
  notificaciones-listar) y en 1 de *escritura* (`external-solicitudes-crear`, vía
  `fn_solicitud_recibir_externa`, 5/hora — invisible al grep original que solo miraba los
  `index.ts`, encontrado al implementar `PROMPT_MI_COPROPIEDAD_FASE3.md` §7.2). Realmente
  **ausente en 10 funciones de escritura/creación**, no 11
  (`external-reservas-crear/cancelar/disponibilidad/listar`,
  `external-solicitudes-cancelar/catalogo/listar`, `external-visitas-crear/listar/revocar`) —
  exactamente las más expuestas a abuso (spam de solicitudes, agotar cupos de reserva, generar QRs
  en volumen). El patrón ya existe (`check_rate_limit`) y es una llamada de pocas líneas por
  función.
- **Rollout gradual — gap real y total**: no existe ninguna columna/tabla/feature-flag que
  controle activación de `mi-copropiedad/*` por copropiedad — la superficie está disponible para
  cualquier tenant con vínculos vigentes, sin forma de habilitar un piloto antes de abrir a todas.

## 13. Decisiones abiertas de Ola 3 — pendientes de respuesta antes del prompt de ejecución

| # | Pregunta | Recomendación |
| --- | --- | --- |
| P3-01 | **Gobierno (EXT-11)**: dado que la lectura (reuniones/convocatorias/actas/resultados) es reuso de patrones ya probados pero la asistencia/voto remoto exige una RPC puente nueva sobre una regla de negocio sensible (quórum/mayoría), ¿se construyen ambas piezas en el mismo corte, o EXT-11 de esta ola se limita a lectura (agenda/actas/resultados ya cerrados) y el voto/asistencia remotos se difieren a un corte propio, con más tiempo de revisión sobre `guard_gobierno_voto`? | Separar: EXT-11 = solo lectura esta ola (menor riesgo, reuso real, entrega observable rápido — mismo criterio "solo-UI primero" de P2-03). Voto/asistencia remotos a un corte propio posterior, dado que toca una regla de quórum/mayoría que el plan §8 protege explícitamente. |
| P3-02 | **Proveedor (EXT-15)**: dado que no existe ningún vínculo actor-externo a nivel tenant (solo a nivel inmueble) y habría que diseñar esa pieza desde cero — el backend de gestión de proveedor ya es maduro y staff-facing —, ¿se construye igual esta ola, o se pospone EXT-15 hasta que haya una necesidad real confirmada de que un proveedor necesite login propio (vs. seguir gestionándolo el staff internamente, que es como funciona hoy)? | Posponer. Mismo criterio que ya usó Ola 2 con Mudanzas/horario semanal (P2-02): no construir una pieza de arquitectura nueva (vínculo a nivel tenant) para un problema sin demanda confirmada — el staff ya puede gestionar proveedores de punta a punta sin esta pieza. |
| P3-03 | **Hardening (EXT-16)**: rate limiting en las 11 funciones de escritura es barato y no depende de que EXT-11/15 avancen — ¿se aplica ya, como corte independiente, en vez de esperar al resto de Ola 3? El rollout gradual (feature flag por tenant) sí es una decisión de producto (¿por columna en `tenants`? ¿tabla de configuración aparte?) — ¿se diseña ahora o se decide cuando haya una fecha real de apertura a copropiedades reales? | Rate limiting: aplicar ya, corte independiente y rápido. Rollout gradual: diferir el diseño hasta que haya una fecha de apertura real — construirlo ahora sin esa fecha es "inventar una regla no cerrada en el plan" (mismo criterio de EXT-08 con badges, §8.4 original). |

Estas tres decisiones se responden antes de escribir `PROMPT_MI_COPROPIEDAD_FASE3.md` — mismo
criterio que P-01..P-07 (§4) y P2-01..03 (§11).

**Respondidas por el usuario el 2026-09-18** (se registran como D-144 en `DECISIONES.md` en cuanto
cierre el primer corte real de esta ola, mismo criterio que D-142/D-143):

```text
P3-01  EXT-11 Gobierno    → Solo lectura esta ola (agenda/convocatorias/actas/resultados de
                            votación). Voto/asistencia remota se difiere a un corte propio.
P3-02  EXT-15 Proveedor   → Pospuesto por completo. No entra en el alcance de Ola 3.
P3-03  EXT-16 Hardening   → Rate limiting en las 11 funciones de escritura, corte independiente
                            YA (no espera al resto de Ola 3). Rollout gradual (feature flag por
                            tenant) diferido hasta que haya fecha real de apertura.
```

**Alcance resultante de Ola 3, tras estas decisiones**: dos cortes, no tres — **EXT-11 (solo
lectura de gobierno)** y **EXT-16 (solo rate limiting)**. EXT-15 queda fuera del backlog activo
hasta que haya demanda confirmada; el voto/asistencia remota de EXT-11 y el rollout gradual de
EXT-16 quedan como brechas conocidas y documentadas (§12.1/§12.3), no como trabajo pendiente de
esta ola. `PROMPT_MI_COPROPIEDAD_FASE3.md` cubre únicamente estos dos cortes — **escrito
2026-09-18**, con un hallazgo adicional al verificar `acta_estado_t` línea por línea: el enum
tiene 4 valores (`borrador`/`en_verificacion`/`suscrita`/`publicada`), no 2 como se asumía al
escribir este §13 — un acta solo debe exponerse al actor externo en estado `publicada` (puesta a
disposición, art. 47), nunca solo por estar `suscrita`. Ver ese documento §7.1/§9 para el detalle.
