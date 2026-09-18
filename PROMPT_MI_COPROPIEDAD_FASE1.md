# AQUILA MI COPROPIEDAD — OLA 1: FUNDACIÓN + FINANZAS (EXT-05 / EXT-06 / EXT-07)

## Contrato operativo del Agente de IA — Extensión de alcance sobre `PROMPT_MAESTRO_FASE1.md`

> **Proyecto:** Frontend web-móvil para propietarios y residentes, servido en `app.aquila.co`
> **Alcance:** Shell mobile-first + contexto de autorización formal + primera vertical financiera
> **Estado:** Especificación operativa V1 · identidad OTP y solicitudes ya construidas (EXT-01/02) ·
> pendiente el shell, el contexto formal y la exposición financiera
> **Extiende a:** `PROMPT_MAESTRO_FASE1.md` (gobierno §2–§9), `PLAN_MI_COPROPIEDAD.md` (decisiones
> D-142, backlog completo, olas 2-3)
> **Continúa la serie:** EXT-01 (identidad), EXT-02 (solicitudes), EXT-03/04 (visitas/reservas) —
> ya en el repo. Este documento cubre **EXT-05, EXT-06 y EXT-07 únicamente**.
> **Fuente visual de referencia (no vinculante):** mockups ilustrativos del
> [artifact de propuesta](https://claude.ai/artifact/RxRR3BSNxo93cTzrBhzDq8) — son bocetos de
> baja fidelidad, no un contrato pixel-perfect. No existe todavía un `docs/mockups/*.html` para
> esta superficie; si se necesita uno antes de construir, es un paso previo a acordar, no un
> supuesto de este documento.

---

# 0. Cómo usar este documento

Igual criterio que `PROMPT_MANTENIMIENTO_TERCEROS.md` §0. Diferencia importante: aquí **sí hay
piezas nuevas de esquema/backend** (el helper de contexto y una función nueva de pago), pero la
mayoría del valor viene de **exponer lo que ya existe** — antes de escribir cualquier función
nueva, releer §2 de `PLAN_MI_COPROPIEDAD.md` ("Qué ya existe") para no duplicar nada.

---

# 1. Misión y Alcance

## 1.1 Dentro de alcance

| # | Corte | Capacidad | Entregable observable |
| --- | --- | --- | --- |
| M1 | EXT-05 | Layout mobile-first propio | `layouts/mi-copropiedad.vue` — header con selector de vínculo + navegación inferior, sin sidebar administrativo |
| M2 | EXT-05 | Reubicación de rutas | `pages/portal-externo/**` → `pages/mi-copropiedad/**` (login, selector de vínculo, nueva solicitud) |
| M3 | EXT-05 | Store de actor externo | `stores/actorExterno.ts` — vínculos, vínculo activo, persistencia de selección |
| M4 | EXT-05 | "Mis asuntos" (home) | `pages/mi-copropiedad/index.vue` — agregador: saldo resumido + solicitudes recientes + accesos rápidos |
| M4b | EXT-05 | Badge de conteo por acceso rápido | Cada tile de acceso rápido (Finanzas, Solicitudes) muestra un contador — patrón visto en Vecindapp (cada ícono de su grilla trae un número), pero limitado a lo que Ola 1 puede contar sin inventar dominio nuevo (§7.6) |
| M5 | EXT-06 | `ExecutionContext` formal | `_shared/actor_externo_context.ts` — helper Deno reutilizable, usado por toda función nueva de esta ola |
| M6 | EXT-06 | Frontera de capabilities documentada | Comentario/nota en `permissions.ts` aclarando que el actor externo **no** usa `TenantRole` |
| M7 | EXT-07 | Estado de cuenta en vivo | `external-cuenta-resumen` (Edge Function nueva) + `pages/mi-copropiedad/finanzas/index.vue` |
| M8 | EXT-07 | Pago por el propio propietario | Tercera vía `actor_externo` en `crear-intencion-pago` |
| M9 | EXT-07 | Resultado de pago | Reusar `ver-intencion-pago` + `pago/resultado.vue` (verificar alcance real, §8.1) |

## 1.2 Fuera de alcance (NO implementar aquí)

```text
Notificaciones expuestas en la nueva superficie (EXT-08) — el dominio (exs2_notificaciones) ya
  existe, pero conectarlo a "Mis asuntos" es del siguiente corte, no de este.
Visitas/reservas/documentos en la nueva superficie (EXT-08/09/10) — external-visitas-*,
  external-reservas-* y documentos siguen funcionando donde están; no se tocan ni se exponen
  todavía bajo /mi-copropiedad.
Correspondencia, Mudanzas, Contactos de emergencia (EXT-12/13/14) — aprobados en el plan, pero
  son dominios nuevos que no bloquean la fundación ni las finanzas.
Gobierno/Junta, Portería, Proveedores (EXT-11/15) — Ola 3.
Comprobante formal de pago (PDF con folio) — se sigue generando y entregando como hoy
  (enviar-estado-cuenta + estados_cuenta_generados); esta ola no cambia ese flujo, solo agrega
  una vista EN VIVO del saldo, que es un concepto distinto (ver §4.3).
Retrofit de external-solicitudes-*/external-reservas-*/external-visitas-* para usar el nuevo
  helper de contexto (§6.1) — deuda técnica menor documentada, no de esta ola: esas tres
  funciones ya resuelven su propia autorización correctamente y funcionan; no se tocan sin
  necesidad.
Cualquier cálculo de saldo, interés, mora o liquidación fuera de v_cargo_saldo / financial-kernel.
Cualquier rol nuevo en TenantRole o en la matriz RLS de memberships.
```

---

# 2. Fuentes de Verdad y Precedencia

```text
1. Decisiones ratificadas en este documento y en PLAN_MI_COPROPIEDAD.md (D-142)
2. Migraciones y Edge Functions ya aplicadas (§4, §5)          — contrato de esquema/API real
3. apps/web/app/utils/actor-externo-api.ts                    — patrón de cliente ya probado
4. apps/web/app/middleware/tenant.ts                           — precedente de "un actor externo
                                                                  nunca es tenant_member"
5. PROMPT_MAESTRO_FASE1.md §2–§9                               — gobierno, RLS, capas, convenciones
6. PLAN_MI_COPROPIEDAD.md                                      — decisiones de producto, backlog
7. Inferencias del agente
```

---

# 3. Reglas de Gobierno

Aplican sin cambios `PROMPT_MAESTRO_FASE1.md` §3. Las más relevantes aquí:

- **Anti-Redundancia.** `fn_actor_externo_mis_vinculos`, `v_cargo_saldo`,
  `crear-intencion-pago`, `ver-intencion-pago`, `_shared/link_token.ts`,
  `_shared/rate_limit.ts` ya existen — se consumen, no se reescriben (salvo la extensión puntual
  de §7.2).
- **Doble Barrera.** Todo lo que valide la UI (p. ej. "no puedes pagar más del saldo") ya está
  respaldado por una barrera real en la Edge Function o en un `CHECK`/trigger — la UI nunca es la
  única defensa.
- **Regla de oro financiera (ya vigente en `crear-intencion-pago`, no se relaja):** el monto y el
  `inmueble_id`/`tenant_id` los decide siempre el servidor. La nueva vía `actor_externo` sigue
  esta regla exactamente igual que las vías `token` y `sesion` existentes.
- **`security invoker` y `set search_path = ''`** en cualquier función SQL nueva, siguiendo el
  precedente de `fn_actor_externo_mis_vinculos`.

---

# 4. Modelo de Datos

## 4.1 Nada nuevo en el esquema para EXT-05/06

EXT-05 y EXT-06 son frontend + una capa de resolución de contexto — cero migraciones.

## 4.2 Tablas/vistas que EXT-07 consume (ya existen, sin cambios de esquema)

| Pieza | Qué aporta | Notas |
| --- | --- | --- |
| `actor_externo_vinculo` | Vínculo autenticado ↔ inmueble/rol | Vía `fn_actor_externo_mis_vinculos` |
| `v_cargo_saldo` | Saldo pendiente por cargo, `security_invoker = true` | Misma fuente que ya usa `crear-intencion-pago` §5.3 para el saldo total — no se recalcula distinto |
| `inmuebles`, `tenants` | `tenant_id`, `moneda`, `codigo` | Para resolver contexto y formatear montos |
| `estados_cuenta_generados` | Snapshot notariado (folio/hash) | **No se toca** — sigue siendo el documento formal; EXT-07 es una vista distinta y complementaria (ver §4.3) |

## 4.3 Distinción explícita: "estado de cuenta en vivo" vs. "comprobante formal"

```text
Comprobante formal (YA EXISTE, sin cambios)
  estados_cuenta_generados → ver-estado-cuenta (token de 30 días, folio + SHA-256)
  Es un documento notariado: sirve para descargar/imprimir/enviar, tiene valor probatorio.

Estado de cuenta en vivo (NUEVO en esta ola — EXT-07)
  v_cargo_saldo, consultado on-demand por el propio actor externo autenticado.
  Es una vista de trabajo dentro de "Mis asuntos": no tiene folio ni hash, cambia en cada
  consulta, y es la que alimenta el botón "Pagar". No reemplaza al comprobante formal — un
  propietario que necesite el documento oficial lo sigue pidiendo/recibiendo como hoy.
```

No fusionar ambos conceptos en una sola función — son dos contratos distintos con distinto nivel
de garantía, igual que dos fuentes de un futuro reporte nunca comparten autoridad si no son la
misma vista (ver la misma disciplina en `PLAN_MOTOR_REPORTES.md` R-09).

---

# 5. Diseño Visual

No hay un mockup vinculante como en `PROMPT_MANTENIMIENTO_TERCEROS.md` (`docs/mockups/terceros.html`).
Referencia no vinculante: los dos bocetos de teléfono del
[artifact de propuesta](https://claude.ai/artifact/RxRR3BSNxo93cTzrBhzDq8) (§7, "Experiencia
visual") — muestran el concepto de "Mis asuntos" (saludo + tarjeta de saldo + accesos rápidos +
lista priorizada) y el de autorización de visitante (fuera de esta ola). Usar el sistema visual
**ya existente** de AQUILA Web (Nuxt UI + Tailwind, mismos tokens) — no se introduce una paleta ni
una librería nueva para esta superficie. Si el usuario quiere un mockup HTML vinculante antes de
construir el frontend de M1-M4, es un paso previo a pedir explícitamente — no se asume aquí.

Reglas de interfaz no negociables (de la propuesta, ya aprobadas implícitamente por el pivote a
web-móvil):

```text
Navegación inferior (bottom nav), nunca el sidebar de apps/web/app/layouts/default.vue.
Selector de vínculo siempre visible cuando el actor tiene más de un vínculo — mismo patrón que
  NavTenantSwitcher.vue, pero sobre stores/actorExterno.ts, no sobre tenantStore.
El monto a pagar se muestra, nunca se edita libremente por el usuario.
```

---

# 6. Estructura Frontend

## 6.1 Rutas — reubicación de `portal-externo` a `mi-copropiedad`

```text
apps/web/app/pages/mi-copropiedad/
├─ login.vue              # antes portal-externo/index.vue (OTP pedir/confirmar código)
├─ index.vue              # NUEVO — "Mis asuntos", reemplaza el rol de landing de mis-vinculos.vue
├─ vinculos.vue           # antes mis-vinculos.vue — ahora es el selector cuando hay >1 vínculo,
│                           no la landing (mismo patrón que /seleccionar-copropiedad para tenants)
├─ solicitudes/
│  └─ nueva.vue           # antes portal-externo/nueva-solicitud.vue, sin cambios de lógica
└─ finanzas/
   └─ index.vue           # NUEVO (EXT-07) — estado de cuenta en vivo + botón pagar
```

`definePageMeta({ layout: 'mi-copropiedad', publico: true })` en todas — se mantiene `publico:
true` porque `auth.global.ts` sigue siendo la única barrera global; el layout nuevo no cambia el
middleware chain.

**Redirecciones:** cualquier enlace/correo ya emitido a `/portal-externo/*` (p. ej. el que manda
`enviar-estado-cuenta` u otros) debe seguir funcionando — agregar un `redirect` en
`nuxt.config.ts` (`/portal-externo/:path*` → `/mi-copropiedad/:path*`) en vez de romper enlaces ya
enviados a propietarios reales.

## 6.2 Layout

```text
apps/web/app/layouts/mi-copropiedad.vue
```

Estructura: header (nombre de la copropiedad del vínculo activo + selector si hay más de uno) +
`<slot />` + navegación inferior fija (Inicio · Finanzas · Solicitudes · Más). "Más" es un menú
simple (perfil, cerrar sesión) — no un módulo nuevo.

## 6.3 Store nuevo — `stores/actorExterno.ts`

Extrae y centraliza la lógica que hoy vive inline en `mis-vinculos.vue`:

```text
estado:
  vinculos: Vinculo[]              // shape exacto de fn_actor_externo_mis_vinculos
  vinculoActivoId: string | null   // persistido en cookie 'vinculo-activo-sesion' (sin maxAge,
                                    // mismo criterio que 'copropiedad-confirmada-sesion' en
                                    // tenant.ts — se olvida al cerrar el navegador)
acciones:
  cargarVinculos()                 // llama fn_actor_externo_mis_vinculos con el usuario de
                                    // cliente.auth.getUser() — igual que mis-vinculos.vue hoy
  seleccionarVinculo(vinculoId)    // valida que vinculoId esté en `vinculos` antes de fijarlo
  cerrarSesion()                   // cliente.auth.signOut() + limpiar estado + redirect a login
getters:
  vinculoActivo                    // computed sobre vinculos + vinculoActivoId
  tieneMultiplesVinculos           // vinculos.length > 1
```

Con un solo vínculo, se fija automáticamente sin preguntar — mismo criterio que
`tenant.ts` líneas 94-96 para membresías.

## 6.4 Componentes nuevos

```text
apps/web/app/components/mi-copropiedad/
├─ MiCopropiedadSaldoCard.vue        # tarjeta de saldo + "¿por qué debo esto?" (EXT-07)
├─ MiCopropiedadAsuntoRow.vue        # fila de "Mis asuntos" (título, contexto, acción primaria)
└─ MiCopropiedadSelectorVinculo.vue  # selector de vínculo del header (solo si tieneMultiplesVinculos)
   (nombrados con el prefijo completo "MiCopropiedad", no la abreviatura "Mic" — Nuxt solo
   dedupea el prefijo de directorio en el nombre de tag si el archivo empieza exactamente con el
   PascalCase del directorio; con "Mic*" el componente quedaba registrado como
   "MiCopropiedadMicSaldoCard" y el `<MicSaldoCard>` del template nunca resolvía — bug real
   hallado en U6 al verificar en navegador con datos reales, afectaba también al
   MicSelectorVinculo de U4, nunca detectado porque esa rama solo se ejercita con 2+ vínculos)
```

---

# 7. Backend — EXT-06 y EXT-07

## 7.1 `ExecutionContext` — helper compartido

```text
supabase/functions/_shared/actor_externo_context.ts
```

```ts
interface ContextoActorExterno {
  authUserId: string
  vinculoId: string
  tenantId: string
  inmuebleId: string
  personaTipo: 'natural' | 'juridica' // ajustar al tipo real de actor_externo_persona_t
  rolCodigo: string
}

// Firma propuesta — implementación exacta la decide quien construya el corte:
async function resolverContextoActorExterno(
  admin: SupabaseClient<Database>,
  jwt: string,
  vinculoId: string,
): Promise<ContextoActorExterno | { error: 'UNAUTHENTICATED' | 'VINCULO_NO_PERTENECE' }>
```

Pasos internos (idénticos al patrón que ya usa `ver-estado-cuenta`/`crear-intencion-pago` para su
propia autorización, solo que resolviendo por `actor_externo_vinculo` en vez de `memberships`):

```text
1. admin.auth.getUser(jwt) → authUserId (401 si falla, igual que hoy en ambas funciones)
2. admin.rpc('fn_actor_externo_mis_vinculos', { p_auth_user_id: authUserId })
3. Buscar en el resultado el vínculo cuyo `vinculo_id === vinculoId` recibido en el body
   (NUNCA confiar en tenantId/inmuebleId que mande el cliente directamente)
4. Si no aparece → 403 VINCULO_NO_PERTENECE (mismo código y texto que ya usan las 11 Edge Functions external-* existentes: "Este vínculo no existe, no es tuyo, o ya no está vigente.")
5. Si aparece pero vigente_hasta ya pasó → 403 (la función SQL ya filtra vigentes, así que en
   la práctica esto ya viene filtrado — documentarlo, no hace falta un chequeo doble)
6. Devolver el contexto resuelto
```

Esta función se usa en **EXT-07 únicamente** (§1.2 ya aclara que no se retrofitea en las
Edge Functions EXT-02/03/04 existentes en esta ola).

## 7.2 `external-cuenta-resumen` — Edge Function nueva

```text
supabase/functions/external-cuenta-resumen/index.ts
```

```text
POST { vinculo_id: string }
Header: Authorization: Bearer <jwt de sesión del actor externo>

→ resolverContextoActorExterno(admin, jwt, vinculo_id)
→ select de v_cargo_saldo (+ conceptos/periodos para etiquetas humanas) where inmueble_id = ctx.inmuebleId
→ 200 {
    inmueble: { id, codigo },
    saldo_total: number,          // suma de monto_pendiente, mismo criterio que
                                    // crear-intencion-pago §5.3 (no se recalcula distinto)
    obligaciones: [{ concepto, periodo, monto_pendiente, estado }],
    pago_habilitado: boolean      // igual chequeo de pasarela_config.activa que ver-estado-cuenta
  }
```

Rate limit: reusar `enforceRateLimit`/`check_rate_limit` con bucket
`cuenta_resumen_vinculo:<vinculo_id>` — mismo mecanismo que ya usan `ver-estado-cuenta` y
`crear-intencion-pago`, sin inventar uno nuevo.

## 7.3 `crear-intencion-pago` — tercera vía `actor_externo`

Extender el `payloadSchema` (líneas 42-56 del archivo actual) con una tercera rama del
`z.discriminatedUnion`:

```ts
z.object({
  via: z.literal('actor_externo'),
  vinculo_id: z.string().uuid(),
  monto: z.number().positive().optional(),
  metodo: z.string().trim().min(1),
})
```

Y en la resolución de autorización (línea 108 en adelante, junto a los bloques `if (datos.via ===
'token')` / `else`), agregar el tercer bloque:

```text
else if (datos.via === 'actor_externo'):
  ctx = resolverContextoActorExterno(admin, jwt_del_header, datos.vinculo_id)
  si error → responder según el código de §7.1
  tenantId = ctx.tenantId; inmuebleId = ctx.inmuebleId; creadaPor = null
    (null porque no es un miembro cobrando en nombre de alguien — es el propio actor pagando;
    si se quiere trazar qué actor externo generó el pago, es un campo nuevo de auditoría,
    fuera de esta ola — no forzar `creadaPor` a un `auth_user_id` que la columna no espera hoy
    sin verificar su tipo real primero)
```

Todo lo que sigue después de la resolución (rate limit por inmueble, cálculo de saldo, `money()`,
adaptador de pasarela) **no cambia una línea** — es exactamente el mismo camino que ya siguen
`token` y `sesion`. Esto es intencional: es la prueba de que la "regla de oro" (monto decidido por
el servidor) sigue aplicando igual sin importar la vía de entrada.

## 7.4 `ver-intencion-pago` — verificar antes de asumir

```text
GAP-VERIFY (no asumir sin comprobar en el momento de implementar):
¿Acepta hoy `ver-intencion-pago` una consulta de un actor externo autenticado (vía `actor_externo`,
análoga a la que se agrega en §7.3), o solo `token`/`sesion` de miembro? Si no acepta la tercera
vía, replicar exactamente el mismo patrón de §7.3 ahí también — es el mismo tipo de extensión,
no una decisión nueva.
```

**RESUELTO (U7, 2026-09-17): no hace falta ningún cambio.** `ver-intencion-pago/index.ts` no tiene
ni ha tenido nunca el concepto de `via` — es una consulta pública (`admin` client, sin JWT) cuya
única autorización es el propio `intencion_id` (uuid v4 generado por el servidor en
`crear-intencion-pago`), tratado como capability token, exactamente igual para las tres vías. La
cabecera del archivo ya lo dice explícitamente: "el propio uuid de la intención actúa como
capability token — mismo criterio que un enlace de reseteo de contraseña […] El propietario no
tiene auth.users (AD-26) [sic — antes de EXT-01; ahora sí lo tiene, pero el diseño de esta función
nunca dependió de eso], así que esta puerta también tiene que ser anónima." `pago/resultado.vue`
tampoco necesita cambios: ya recibe `?intencion=<uuid>` en la URL de retorno que el propio
`crear-intencion-pago` construye server-side (`urlRetorno`), sin importar qué vía creó la
intención. El flujo de pago del actor externo (§8.3 pasos 4-5) queda cerrado reusando ambos
sin modificar una línea.

## 7.5 `permissions.ts` — nota de frontera (EXT-06)

Agregar un comentario junto a `TenantRole` (no un tipo nuevo, no una función nueva):

```ts
// El actor externo (propietario/residente, EXT-01) NO es un TenantRole y nunca lo será — su
// autorización viaja por actor_externo_vinculo → inmueble_persona_rol → capability específica
// de cada Edge Function (ver ContextoActorExterno en _shared/actor_externo_context.ts), nunca
// por ROLE_PERMISSIONS. Si en el futuro se siente la tentación de agregar 'residente' o
// 'propietario' aquí, es una señal de que se está intentando convertirlo en tenant_member —
// AD-37 lo prohíbe explícitamente.
```

Esto cierra la brecha que señalaba el documento externo 13: cruzar la taxonomía de capabilities
propuesta contra `permissions.ts` para no crear un segundo sistema de autorización incompatible.
La resolución aquí es que **no hay colisión posible** porque son planos distintos — el gap real
era que nadie lo había dejado escrito.

## 7.6 Badges de conteo por acceso rápido (patrón Vecindapp)

Vecindapp muestra en cada ícono de su grilla de inicio un número de "nuevo/pendiente" (PQRS,
Reservas, Facturación, Comunicados, Documentos...). Se adopta el patrón, pero **solo para lo que
ya existe en esta ola** — no se crea un dominio de conteo nuevo para módulos que todavía no están
expuestos (Documentos, Reservas, Visitas siguen siendo EXT-08/09/10).

```text
Finanzas → badge = 1 si external-cuenta-resumen.saldo_total > 0, si no, sin badge.
           Cero llamadas nuevas: es el mismo dato que ya trae M7/§7.2.

Solicitudes → badge = cantidad de solicitudes propias en un estado que requiere acción del
              actor (p. ej. respondida_pendiente_de_confirmacion, o el equivalente real de
              solicitud_estado_t que ya usa gobiernoAtencion.ts — VERIFICAR el valor exacto del
              enum en el momento de implementar, no asumirlo aquí). Se deriva de
              external-solicitudes-listar, que ya existe — sin Edge Function nueva.
```

**Patrón para Ola 2/3 (no implementar aquí, solo dejar documentado):** cuando EXT-08/09/10/12/13
expongan Documentos/Reservas/Visitas/Correspondencia/Mudanzas bajo `/mi-copropiedad`, cada uno
repite el mismo criterio — un conteo derivado de datos que esa función YA devuelve (nunca una
tabla de "contadores" separada que pueda desincronizarse de la fuente real). Si en algún punto
tres o más módulos necesitan su conteo en la misma pantalla y las llamadas por separado empiezan
a pesar, ahí sí se justifica un agregador tipo `external-mis-asuntos-resumen` — no antes (mismo
criterio de "no construir para un problema que AQUILA no tiene" de `PLAN_MOTOR_REPORTES.md`).

---

# 8. Flujos Críticos

## 8.1 Login → Mis asuntos (primer vínculo único)

```text
1. /mi-copropiedad/login.vue → OTP (ya construido, sin cambios) → sesión real
2. actorExterno.cargarVinculos() → 1 solo vínculo → se fija automático (§6.3)
3. Redirect a /mi-copropiedad/ (Mis asuntos)
4. Mis asuntos dispara external-cuenta-resumen(vinculo_id) → MiCopropiedadSaldoCard con saldo real
```

## 8.2 Login → selección de vínculo (más de uno)

```text
1-2. Igual, pero vinculos.length > 1 → redirect a /mi-copropiedad/vinculos (selector)
3. Usuario elige → actorExterno.seleccionarVinculo(id) → cookie fijada → /mi-copropiedad/
```

## 8.3 Ver saldo y pagar

```text
1. /mi-copropiedad/finanzas → external-cuenta-resumen → lista de obligaciones + saldo total
2. "¿Por qué debo esto?" → despliega el desglose por concepto/periodo (mismos datos, sin
   pedir nada nuevo al servidor)
3. "Pagar" → crear-intencion-pago { via:'actor_externo', vinculo_id, metodo } → intención creada
4. Redirect al proveedor de pago (igual que el flujo `token` ya construido)
5. Resultado → ver-intencion-pago + pago/resultado.vue (verificar §7.4 antes de dar esto por
   hecho)
```

---

# 9. Gaps Abiertos

## 9.1 `ver-intencion-pago` — ver §7.4, es el gap más importante de esta ola

**CERRADO (U7):** no requería cambios — ver la resolución en §7.4.

## 9.2 ¿Un vínculo puede tener más de un inmueble simultáneamente?

`fn_actor_externo_mis_vinculos` devuelve una fila por vínculo, y cada vínculo ya trae su propio
`inmueble_id` (vía `inmueble_persona_rol`). Si una misma persona tiene dos inmuebles, tendrá dos
filas (dos vínculos) — el selector de §6.3/§6.4 ya cubre ese caso mostrando cada inmueble como una
opción distinta. No se necesita "multi-inmueble dentro de un vínculo" — verificar que esta
suposición se sostenga con un caso real de un propietario con 2+ unidades antes de cerrar el
corte.

## 9.3 `apps/mobile` como referencia de UX

`MisSolicitudesScreen.tsx`/`NuevaVisitaScreen.tsx` etc. no aplican a esta ola (son EXT-08/09) —
no se abren ni se estudian todavía; se deja anotado para quien tome EXT-08 en adelante
(`PLAN_MI_COPROPIEDAD.md` §6).

---

# 10. Testing y Definition of Done

Se añade a `PROMPT_MAESTRO_FASE1.md` §12:

```text
□ Alcance exacto de §1.1, sin extras (nada de EXT-08 en adelante se toca)
□ Cero migraciones nuevas — EXT-05/06/07 no cambian el esquema
□ Un actor externo con un solo vínculo: login → Mis asuntos sin pantalla de selección
□ Un actor externo con dos vínculos: login → selector → Mis asuntos del vínculo elegido
□ external-cuenta-resumen con vinculo_id ajeno (de otro actor) → 403 VINCULO_NO_PERTENECE, nunca datos
□ external-cuenta-resumen con vinculo_id inexistente → 403 VINCULO_NO_PERTENECE (no 404 — no confirmar
  existencia de un vínculo ajeno)
□ Saldo mostrado en Mis asuntos/Finanzas coincide exactamente con v_cargo_saldo para ese inmueble
□ crear-intencion-pago vía actor_externo: el monto nunca lo decide el body más allá del saldo
  real (mismo test que ya cubre las vías token/sesion — replicar, no reinventar)
□ Las vías 'token' y 'sesion' de crear-intencion-pago siguen pasando sus pruebas existentes sin
  modificación (la extensión es aditiva, no debe romper nada)
□ Rate limiting aplica igual a la vía nueva (bucket propio, no comparte cupo con las otras vías
  de forma que un actor externo pueda agotar el límite de otro)
□ Redirect /portal-externo/* → /mi-copropiedad/* funciona para un enlace ya emitido
□ Badge de Finanzas visible solo cuando saldo_total > 0; badge de Solicitudes cuenta solo las
  que requieren acción del actor (no todas las solicitudes históricas)
□ tsc --noEmit, eslint, deno check (funciones nuevas), build → gates de
  PROMPT_MAESTRO_FASE1.md §12.3
□ Cobertura: financial-kernel y ael-runtime siguen en 100 % (esta ola no los toca, pero
  verificar que no bajen por rutas de import nuevas)
```

---

# 11. Orden de Implementación

> **Estado 2026-09-17 — leer esto primero si retomas este corte en una sesión nueva (de esta
> cuenta o de otra: el historial de conversación no viaja entre cuentas, este documento y el
> repo sí son la fuente de verdad).** **U1 a U7 están cerrados** (código + tsc/eslint/build en
> verde; U1-U3 con test de backend en verde, sin commitear todavía — confirmar con `git status`
> antes de asumir qué falta). Solo queda el cierre administrativo del corte (§12: D-142 en
> `DECISIONES.md`). Detalle de lo cerrado:
> - **U1** `supabase/functions/_shared/actor_externo_context.ts` + su test — 100% cobertura en
>   `pnpm test:edge` (que además necesitó un fix real: agregar `--no-config` al script en
>   `package.json`, porque `apps/mobile/tsconfig.json` rompía el auto-discovery de Deno).
> - **U2** `supabase/functions/external-cuenta-resumen/` (nueva) + `tests/external/cuenta-resumen.test.ts`
>   (6 pruebas) — usa `VINCULO_NO_PERTENECE` (no `FORBIDDEN`, ya corregido en §7 más abajo) para
>   alinearse con las 11 Edge Functions `external-*` ya existentes.
> - **U3** tercera vía `actor_externo` en `supabase/functions/crear-intencion-pago/index.ts` +
>   4 pruebas nuevas en `tests/tenancy/crear-intencion-pago.test.ts` — las vías `token`/`sesion`
>   verificadas sin regresión.
> - Verificación conjunta más reciente (antes de U6/U7): `tests/external/` +
>   `tests/tenancy/crear-intencion-pago.test.ts` → **67/67 en verde**.
> - **U4** `layouts/mi-copropiedad.vue` + `stores/actorExterno.ts` + `MiCopropiedadSelectorVinculo.vue`
>   (renombrado en U6 desde `MicSelectorVinculo.vue` — ver la nota de §6.4) — shell mobile-first y
>   estado del vínculo activo.
> - **U5** `pages/portal-externo/**` reubicado a `pages/mi-copropiedad/**`
>   (login/vinculos/solicitudes/nueva) + redirects explícitos en `nuxt.config.ts` + middleware
>   `tenant.ts` actualizado — verificado con `lint`/`build`/`nuxt typecheck` en verde y prueba
>   manual en navegador (login con OTP generado localmente, vía service_role, porque el docker
>   local no envía correo).
> - **U6** `pages/mi-copropiedad/index.vue` ("Mis asuntos": saldo compacto + accesos rápidos con
>   badge + solicitudes recientes) y `pages/mi-copropiedad/finanzas/index.vue` (saldo en vivo +
>   pagar), más `components/mi-copropiedad/MiCopropiedadSaldoCard.vue` y `MiCopropiedadAsuntoRow.vue`, y dos
>   funciones nuevas en `utils/actor-externo-api.ts` (`obtenerCuentaResumen`,
>   `listarSolicitudesExternas`, `crearIntencionPagoActorExterno`). El badge de Solicitudes usa
>   "abierta" (nueva/asignada/en_atencion/en_espera) en vez del literal "requiere tu respuesta"
>   del §7.6 original — el FSM de GOB-8 no tiene un estado que signifique eso específicamente
>   (verificado contra el esquema, no asumido); ver el comentario en `index.vue`. El enlace
>   "Solicitudes" del bottom nav (`layouts/mi-copropiedad.vue`) se corrigió de
>   `/mi-copropiedad/solicitudes` (404) a `/mi-copropiedad/solicitudes/nueva` (el único destino
>   real de esta ola) de paso, por ser el mismo archivo y la misma superficie.
>   **Dos bugs reales encontrados y corregidos al verificar en navegador con datos QA reales**
>   (no con los fixtures de `tests/external/`, que siempre rellenan todos los campos):
>   1. `external-cuenta-resumen/index.ts` fallaba 500 ("invalid input syntax for type uuid:
>      null") cuando un inmueble tenía cargos sin `concepto_id` (nullable en el esquema —
>      p. ej. intereses de mora, `origen_tipo='interes'`): el `.in('id', conceptoIds)` mandaba
>      ese `null` dentro del array y PostgREST no podía parsearlo. Corregido filtrando nulls antes
>      de construir `conceptoIds`; test de regresión añadido (`cuenta-resumen.test.ts` #7).
>   2. Los tres componentes de `components/mi-copropiedad/` (creados en U4/U6 como `Mic*.vue`)
>      nunca resolvían en el navegador (`[Vue warn]: Failed to resolve component`) — Nuxt solo
>      dedupea el prefijo de directorio si el archivo empieza con el PascalCase completo del
>      directorio (`MiCopropiedad`, no la abreviatura `Mic`). Renombrados a
>      `MiCopropiedadSaldoCard.vue`/`MiCopropiedadAsuntoRow.vue`/`MiCopropiedadSelectorVinculo.vue`
>      (ver nota en §6.4). De paso, dos usos de `text-[10px]`/`text-[11px]` (badges de conteo,
>      etiqueta "Vencido") se corrigieron a `text-xs` — DESIGN.md prohíbe bajar de ese piso.
> - **U7** GAP-VERIFY de §7.4 resuelto: `ver-intencion-pago`/`pago/resultado.vue` no necesitaron
>   ningún cambio — ya son agnósticos a la vía que creó la intención (el capability token es el
>   propio `intencion_id`). Ver el detalle en §7.4/§9.1.
> - **Requisito de entorno para correr las pruebas de backend:** `supabase functions serve
>   --env-file .env` debe estar corriendo (el edge runtime local normal no ve funciones nuevas
>   hasta que se redepliega — "mapa horneado").
> - Nada de esto toca `DECISIONES.md`/`MIGRACIONES_LEDGER.md` todavía (cero migraciones en esta
>   ola) — falta registrar D-142 al cerrar el corte completo (§12).

```text
U1 · _shared/actor_externo_context.ts — el helper, con sus propios tests unitarios          [HECHO]
     (vínculo propio → contexto; vínculo ajeno → error; vínculo vencido → error)
        ↓
U2 · external-cuenta-resumen — Edge Function nueva sobre U1, con pruebas de aislamiento      [HECHO]
        ↓
U3 · crear-intencion-pago — tercera vía sobre U1, pruebas de que las otras dos no se rompieron [HECHO]
        ↓
U4 · layouts/mi-copropiedad.vue + stores/actorExterno.ts — shell y estado, con datos de prueba  [HECHO]
     antes de conectar rutas reales
        ↓
U5 · Reubicar portal-externo/* → mi-copropiedad/* + redirect en nuxt.config.ts               [HECHO]
        ↓
U6 · pages/mi-copropiedad/index.vue ("Mis asuntos") + finanzas/index.vue, conectados a U2/U3 [HECHO]
        ↓
U7 · Verificar U 9.1 (ver-intencion-pago) y cerrar el flujo de resultado de pago             [HECHO]
```

---

# 12. Workflow y Formato de Reporte

Aplican sin cambios `PROMPT_MAESTRO_FASE1.md` §14 y §16. Al cerrar este corte, registrar D-142 en
`DECISIONES.md` (las decisiones de `PLAN_MI_COPROPIEDAD.md` §4, ya respondidas por el usuario) y
una fila en `MIGRACIONES_LEDGER.md` **solo si** U7 termina requiriendo alguna migración menor no
prevista aquí (este corte no debería necesitar ninguna).

---

# 13. Resumen Ejecutivo para el Agente

```text
Construyes el cimiento de "AQUILA Mi Copropiedad": un shell mobile-first en apps/web (mismo
Nuxt, mismo dominio de código, servido luego en app.aquila.co), un helper de contexto que
resuelve con quién está hablando el servidor sin confiar nunca en lo que mande el cliente, y la
primera vertical de negocio real (ver saldo, pagar) para validar que toda la cadena funciona de
punta a punta.

Casi todo lo que necesitas YA EXISTE: identidad OTP (EXT-01), solicitudes (EXT-02), saldo
(v_cargo_saldo), pagos (crear-intencion-pago) y notificaciones (exs2_notificaciones, aunque no se
conecta en esta ola). Tu trabajo es exponerlo bajo una superficie propia, no reconstruirlo.

Lo único genuinamente nuevo es: el helper de contexto (_shared/actor_externo_context.ts), una
Edge Function de lectura (external-cuenta-resumen) y una tercera vía en una función que ya existe
(crear-intencion-pago). Todo lo demás es frontend: layout, store, páginas.

No tocas: external-solicitudes-*/external-reservas-*/external-visitas-* (funcionan, no se
retrofitean en esta ola), ni ninguna tabla de Correspondencia/Mudanzas/Contactos de emergencia
(aprobadas pero son EXT-12/13/14, no esta ola), ni el código de apps/mobile (solo se lee como
referencia de UX en cortes futuros).

Terminado = Definition of Done de §10 completa, incluyendo que las vías `token` y `sesion` de
crear-intencion-pago sigan pasando sus pruebas sin cambios.
```
