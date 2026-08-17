# AQUILA PH — PLANTILLAS DE CORREO SINCRONIZADAS CON BREVO · IMPLEMENTATION PROMPT

## Contrato operativo del Agente de IA — Extensión de alcance sobre `PROMPT_MAESTRO_FASE1.md`

> **Proyecto:** Administración de Propiedad Horizontal (AQUILA)
> **Alcance:** Backend de plantillas de correo transaccional sincronizadas con Brevo — tabla,
> funciones, Edge Functions. El panel de administración (frontend, §11 abajo) queda **fuera
> de esta pieza**, pendiente para una fase posterior (decisión explícita del usuario, 2026-08-17).
> **Estado:** Backend implementado (`20260822290000_plantillas_email.sql`,
> `packages/shared/src/email.ts`, `guardar-plantilla-email`/`sincronizar-plantilla-email`/
> `probar-plantilla-email`) · sin desplegar/probar contra Brevo real todavía · sin frontend.
> **Extiende a:** `PROMPT_MAESTRO_FASE1.md` (gobierno §2–§9) y a
> `Docs/Motor de gestion de cartera/CAR_00_Guia_Oficial.md` (GAP-CAR-005) — el catálogo de
> eventos reutiliza los mismos 4 `event_type` de `packages/shared/src/sms.ts`.
> **Fuente original:** `Casos de uso/Configuracion de Plantillas correo-SMS/
> PROMPT-modulo-configuracion-plantillas-email-brevo.md` (spec portable, dominio hospedaje,
> fuera del repo git — esta copia es la versión adaptada y vinculante para AQUILA).

## 0. Decisión de arquitectura y desviaciones sobre la spec original

**Decisión explícita del usuario (2026-08-17): Opción 1 — plantillas de Brevo, no HTML inline.**
El envío de correo de este proyecto crecerá más allá de cartera ("no solo del módulo, sino de
todo el proyecto"), así que se adopta el modelo que el spec original asume: Brevo renderiza el
HTML de su lado (`/v3/smtp/templates`), esta tabla es la copia local editable + el origen de
sincronización. Esto es **distinto** de cómo envía correo hoy `invite-user/index.ts` (HTML
inline en cada request, `/v3/smtp/email`, sin plantillas de Brevo) — `invite-user` **no se
migra** en esta pieza, es una decisión aparte.

Desviaciones deliberadas sobre el documento original (preservado íntegro debajo, §1 en
adelante, como referencia portable):

1. **`tenant_id` + único por `(tenant_id, event_type)`, no global** — el spec original (§4) es
   single-tenant (`event_type VARCHAR(50) UNIQUE`). AQUILA es SaaS multi-tenant, mismo criterio
   que `plantillas_sms`.
2. **`brevo_template_id` es NULLABLE, no `NOT NULL`** — el spec (§9) asume que el id ya existe y
   solo hay que verificarlo antes de sembrarlo. En AQUILA no existe ninguna plantilla de cartera
   en la cuenta de Brevo todavía: no hay ningún id que verificar, y sembrar uno inventado
   quedaría desincronizado desde el día uno. En su lugar, **el primer guardado exitoso CREA la
   plantilla en Brevo** (`POST /v3/smtp/templates`) y guarda el id real que Brevo devuelve;
   guardados siguientes la actualizan (`PUT`). Ver `supabase/functions/_shared/email_provider.ts`.
3. **Tipos Postgres reales**, no MySQL (`BIGINT UNSIGNED`/`LONGTEXT`/`TINYINT(1)` →
   `uuid`/`text`/`boolean`).
4. **Auditoría vía función `SECURITY DEFINER`** (`fn_guardar_plantilla_email`), no un
   `auditar()` genérico — `audit_log` no tiene política `INSERT` para `authenticated`, mismo
   patrón que `fn_guardar_plantilla_sms`.
5. **Catálogo de eventos**: se reutilizan los mismos 4 `event_type` de
   `packages/shared/src/sms.ts` (`cartera_recordatorio_pago`, `cartera_pago_vencido`,
   `cartera_pago_confirmado`, `cartera_acuerdo_pago_creado`) — mismo evento de negocio, canal
   distinto. El registro de campos por evento (`packages/shared/src/email.ts`,
   `EMAIL_FIELD_REGISTRY`) es independiente del de SMS: el correo admite más variables. Ninguno
   de estos eventos tiene todavía un disparador real de correo (el worker de F4 solo dispara SMS
   hoy, `supabase/functions/ejecutar-accion-cobranza/`) — son provisionales hasta que exista.
6. **Endpoint de prueba/preview sin llamada de red** (`probar-plantilla-email`, spec §8): Brevo
   no expone un endpoint de previsualización, se renderiza localmente con `EMAIL_FIELD_REGISTRY`
   como ya hacía `probar-plantilla-sms` con SMS (aunque ese sí envía de verdad — la asimetría es
   intencional: SMS no tiene concepto de "plantilla del proveedor" que previsualizar, solo
   probar; correo con plantillas de Brevo sí).
7. **Pendiente, fuera de esta pieza**: el panel de administración (§11 abajo, frontend), migrar
   `invite-user` a este sistema, y la verificación end-to-end contra Brevo real (mismo patrón de
   confirmación explícita que se usó para el worker de SMS antes del primer envío real).

---

## 1. Objetivo y el problema que resuelve

Cuando se usa un proveedor de correo transaccional con plantillas (Brevo, SendGrid, Mailjet), el HTML de cada correo vive **en el panel del proveedor** y la aplicación solo manda un `templateId` y un objeto de parámetros. Eso funciona hasta que aparecen tres problemas, todos inevitables:

1. **Nadie sabe qué variables acepta cada plantilla.** Quien edita en el panel del proveedor no ve el código que arma los parámetros. Escribe `{{ params.guestFullName }}`, la aplicación manda `guestName`, y el correo sale **con un hueco en blanco** — sin error, sin log, sin aviso. Se descubre cuando lo reporta un cliente.
2. **No hay historial ni control de acceso propio.** Cualquiera con la clave del proveedor edita el correo de confirmación de reserva y no queda rastro en el sistema.
3. **El contenido no es del proyecto.** No está en la base de datos, no está en el respaldo, no está en el repositorio. Vive en una cuenta de un tercero.

Este módulo pone **una copia local editable** de cada plantilla en la base de datos de la aplicación, con validación de variables contra lo que el código realmente manda, y sincroniza esa copia hacia el proveedor al guardar.

**El reparto de responsabilidades es el punto clave:** la aplicación es la fuente de verdad **de edición**; el proveedor sigue siendo la fuente de verdad **de envío**. Un correo que sale de la plataforma sigue saliendo con el `templateId` del proveedor, no con el HTML local.

---

## 2. Requisitos del proyecto anfitrión

- Envío transaccional ya funcionando contra el proveedor, con plantillas identificadas por un id numérico.
- Un módulo de notificaciones con funciones tipo `sendXEmail()` que arman los parámetros de cada correo.
- Autenticación con roles, y algún mecanismo de auditoría de acciones administrativas.
- Base de datos relacional.

---

## 3. Alcance

**Dentro:** copia local de cada plantilla, registro de campos por evento, validación al guardar, sincronización hacia el proveedor con estado y reintento, vista previa renderizada, pantalla de administración, auditoría.

**Fuera:** el envío en sí, la bitácora de correos enviados, los webhooks de apertura/rebote, y la creación inicial de las plantillas en la cuenta del proveedor (ver §9).

---

## 4. Modelo de datos

```sql
CREATE TABLE email_templates (
  id                BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  event_type        VARCHAR(50) NOT NULL UNIQUE,   -- debe coincidir con una clave del catálogo de plantillas del código
  brevo_template_id INT NOT NULL,                  -- id de la plantilla en el proveedor
  subject           VARCHAR(255) NOT NULL,
  html_content      LONGTEXT NOT NULL,
  is_synced         TINYINT(1) NOT NULL DEFAULT 0, -- 0 = hay cambios locales que el proveedor no tiene
  last_synced_at    TIMESTAMP NULL DEFAULT NULL,
  updated_by        BIGINT UNSIGNED NULL,          -- FK a usuarios, ON DELETE SET NULL
  created_at        TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at        TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);
```

> **Nota AQUILA:** ver desviaciones 1-2 de §0 arriba — `tenant_id` sí existe y `brevo_template_id`
> es nullable en la implementación real (`20260822290000_plantillas_email.sql`). El esquema de
> arriba es el original portable, no el implementado.

Decisiones a respetar:

- **`is_synced` no es decorativo: es el estado de una operación que puede fallar a mitad.** Guardar localmente y sincronizar con el proveedor son dos escrituras a dos sistemas distintos, sin transacción posible entre ellas. La bandera es lo que hace que el desfase sea visible y recuperable en vez de invisible.
- **`brevo_template_id` se guarda por fila, no se calcula desde variables de entorno en el momento del guardado.** Ver la trampa de §9.
- **La pantalla lista solo lo que existe en esta tabla.** Un evento declarado en el catálogo del código pero sin fila sembrada **no aparece en el panel** y nadie puede editarlo. Es la causa número uno de "esta plantilla no sale en el panel"; la migración que agrega un evento nuevo debe sembrar su fila (§9).

---

## 5. Registro de campos por evento

Igual que en el módulo de SMS: **un archivo de código, no una tabla**.

```ts
export interface EmailFieldDef {
  field: string;
  sample: string;
  description?: string;   // explicación en el idioma del panel, mostrada junto al nombre
}

export const EMAIL_TEMPLATE_FIELDS: Record<string, EmailFieldDef[]> = {
  BOOKING_CONFIRMED_GUEST: [
    { field: 'guestName',     sample: 'Ana María',               description: 'Nombre del huésped' },
    { field: 'propertyTitle', sample: 'Apartamento Bocagrande',  description: 'Título del alojamiento' },
    { field: 'totalAmount',   sample: '$450.000',                description: 'Monto total pagado' },
    { field: 'bookingId',     sample: '1842',                    description: 'Número de la reserva' },
  ],
  // …un bloque por evento
};
```

> **Nota AQUILA:** ver desviación 5 de §0 — el catálogo real vive en `packages/shared/src/email.ts`
> (`EMAIL_FIELD_REGISTRY`), con los 4 eventos de cartera, no los de hospedaje de arriba.

Reglas:

- **Los campos se releen de las llamadas reales de envío, nunca de un documento de especificación.** Este registro no describe una intención: describe lo que el código manda hoy. Un campo que se agregó después al disparador y no se declaró aquí **bloquea guardados legítimos**.
- **Escribe un test que compare este registro contra los parámetros reales que arma cada función de envío** y falle al desincronizarse. Sin ese test, el registro se vuelve mentira en pocos meses y el módulo empieza a rechazar ediciones correctas.
- `description` es obligatoria en la práctica: quien redacta el correo no es quien escribió el código. "`refundMessage` — Mensaje explicando el reembolso aplicado" convierte una lista de identificadores en algo utilizable.
- Los `sample` alimentan la vista previa. Que sean **realistas** (`'$450.000'`, no `'123'`): la vista previa existe para detectar problemas de maquetación, y una cifra corta no revela que el importe rompe la tabla.

---

## 6. Sintaxis de variables

**La del proveedor, exactamente.** En Brevo es `{{ params.nombreDelCampo }}`, con el prefijo `params.` obligatorio.

```ts
const PARAM_PATTERN = /\{\{\s*params\.(\w+)\s*\}\}/g;

export function renderEmailTemplate(text: string, params: Record<string, string>): string {
  return text.replace(PARAM_PATTERN, (m, key) => params[key] ?? m);
}
```

> **Trampa real, encontrada en producción:** `{{ guestName }}` **sin** el prefijo `params.` no da error en el proveedor — simplemente **renderiza vacío**. Una plantilla puede vivir meses así, enviando correos con campos en blanco. Como la expresión regular de validación solo reconoce la forma con prefijo, un `{{ guestName }}` suelto pasa la validación de campos desconocidos sin ser detectado.
>
> **Añade una comprobación explícita**: busca `\{\{\s*(?!params\.)(\w+)\s*\}\}` y rechaza el guardado con un mensaje que enseñe la forma correcta (`"Usa {{ params.guestName }}, no {{ guestName }} — sin el prefijo el campo se envía vacío"`). Es una línea de código que evita una clase entera de errores silenciosos.

### Validación al guardar

1. `html_content` con al menos 10 caracteres útiles.
2. **Campos desconocidos**, extraídos de **asunto y cuerpo a la vez** (el asunto también admite variables y se olvida siempre): si alguno no está en el registro de ese evento, `400` nombrándolos.
3. La comprobación de `{{ }}` sin prefijo del recuadro anterior.

El proveedor no valida nada de esto por su cuenta. Esta es la única barrera entre un campo mal escrito y un correo en blanco a un cliente.

---

## 7. Sincronización — el orden importa

```
guardar local  →  auditar  →  intentar sincronizar  →  marcar is_synced
```

```ts
export async function updateEmailTemplate(id, subject, htmlContent, adminId) {
  const row = await loadTemplateRow(id);          // 404 si no existe
  validar(row.event_type, subject, htmlContent);  // 400 si falla

  await db.update('email_templates', { subject, html_content: htmlContent, updated_by: adminId }, id);
  await auditar('update_email_template', id, { subject: row.subject }, { subject });

  return syncToProvider(id, row.brevo_template_id, subject, htmlContent);
}

async function syncToProvider(id, providerTemplateId, subject, htmlContent) {
  if (!apiConfigurada()) {
    await db.exec('UPDATE email_templates SET is_synced = 0 WHERE id = ?', [id]);
    return { saved: true, synced: false, error: 'API del proveedor no configurada' };
  }
  try {
    await provider.updateTemplate(providerTemplateId, { subject, htmlContent });
    await db.exec('UPDATE email_templates SET is_synced = 1, last_synced_at = NOW() WHERE id = ?', [id]);
    return { saved: true, synced: true };
  } catch (error) {
    await db.exec('UPDATE email_templates SET is_synced = 0 WHERE id = ?', [id]);
    return { saved: true, synced: false, error: error?.body?.message ?? error?.message ?? 'Error desconocido' };
  }
}
```

Las cuatro propiedades que debe cumplir, y que este orden garantiza:

1. **El cambio local se persiste siempre**, responda lo que responda el proveedor. Nadie pierde media hora de maquetación por un `502` ajeno.
2. **Un fallo de sincronización no es un error de la petición.** Responde `200` con `{ saved: true, synced: false, error }`. Un `500` haría creer que no se guardó nada, y quien edita volvería a pegar todo el HTML.
3. **El motivo real del proveedor llega al frontend.** En el SDK de Brevo el mensaje útil viene en `error.body.message`, no en `error.message`; extráelo o el panel dirá "error desconocido" para siempre.
4. **El desfase es recuperable sin volver a editar**: `POST /:id/sync` reintenta con lo que ya está guardado. Es el mismo `syncToProvider`, no una segunda ruta de código.

**Sin credencial configurada el módulo debe seguir siendo usable**: se edita, se valida, se previsualiza y se guarda; solo queda `is_synced = 0` con el motivo. Es la diferencia entre poder trabajar el módulo en desarrollo o no.

> **Nota AQUILA:** implementado en `supabase/functions/guardar-plantilla-email/index.ts` +
> `supabase/functions/sincronizar-plantilla-email/index.ts`, usando
> `supabase/functions/_shared/email_provider.ts` (crea la plantilla en Brevo si
> `brevo_template_id` es null, la actualiza si no — ver desviación 2 de §0).

---

## 8. Vista previa

**Se renderiza localmente. No hay llamada de red.**

Brevo **no expone ningún endpoint de previsualización o renderizado** en su API (verificado contra los tipos del SDK). No lo busques: se resuelve aplicando `renderEmailTemplate` sobre el asunto y el HTML con los `sample` del registro.

```
POST /email-templates/:id/preview   { overrides?: { campo: valor } }
  → { subject: "…renderizado…", html: "…renderizado…" }
```

- `overrides` permite probar con un valor propio (un nombre de propiedad largo de verdad, un importe grande). **Filtra los overrides contra el registro** y descarta lo que no esté declarado; si no, el endpoint se convierte en un renderizador de plantillas arbitrarias.
- **Muestra el resultado en un `<iframe srcdoc sandbox="allow-same-origin">`**, no inyectado en el DOM del panel. El HTML de un correo trae `<style>` con reglas globales (`body{…}`, `.container{…}`) que **se comen los estilos del panel de administración** si se renderizan en la misma página. El `sandbox` sin `allow-scripts` es además la contención correcta para HTML que un administrador puede pegar desde cualquier parte.
- Muestra el asunto renderizado **encima** de la previsualización: es donde más se olvidan las variables.

> **Nota AQUILA:** implementado en `supabase/functions/probar-plantilla-email/index.ts` (payload
> `{tenant_id, event_type, subject, html_content, overrides?}` → `{subject, html}`, sin red). El
> `<iframe sandbox>` es tarea del panel de administración, pendiente (§11, fuera de esta pieza).

---

## 9. Siembra inicial y catálogo de ids

El catálogo de plantillas en el código mapea evento → id del proveedor, típicamente leyendo variables de entorno con un valor de respaldo:

```ts
export const EMAIL_TEMPLATES = {
  BOOKING_CONFIRMED_GUEST: parseInt(process.env.BREVO_TEMPLATE_BOOKING_GUEST || '1'),
  STAFF_INVITE:            parseInt(process.env.BREVO_TEMPLATE_STAFF_INVITE || '9'),
  // …
};
```

> **Trampa real, encontrada al implementar esto:** los valores de respaldo del código **no coincidían** con los ids reales configurados en el entorno — dos plantillas los tenían **intercambiados entre sí**. El síntoma habría sido demoledor: editar "invitación de staff" en el panel y sobrescribir el contenido de "reserva por expirar" en la cuenta del proveedor.
>
> **Antes de sembrar, verifica cada id leyéndolo del proveedor** (`getTemplate(id)` y comprobar que el contenido corresponde), y siembra el **id real verificado**, no el valor de respaldo del código.

> **Nota AQUILA:** esta trampa es exactamente la razón de la desviación 2 (§0) — en vez de un
> catálogo de ids de respaldo que puede desincronizarse de la cuenta real de Brevo, AQUILA no
> siembra ningún id: el primer guardado exitoso desde el panel CREA la plantilla y Brevo mismo
> devuelve el id, eliminando la clase de error completa (no hay valor de respaldo que pueda
> divergir de la realidad, porque no hay valor de respaldo).

Reglas de la migración de siembra:

- **Una fila por evento**, con el id verificado, un asunto razonable y `is_synced = 0`.
- **`html_content` puede quedar con un marcador de posición** (`'-- pendiente de completar en el panel admin --'`) cuando el contenido real todavía vive solo en el proveedor. Es seguro **porque `is_synced = 0` y la sincronización solo ocurre al guardar desde el panel**: ese marcador nunca se envía al proveedor por su cuenta. Deja el comentario explicando esa garantía en la migración, o el siguiente lector la borrará por miedo.
- **Cuando la plantilla se crea desde la aplicación** (vía la API de creación del proveedor) con su HTML definitivo, siémbrala con ese HTML e `is_synced = 1`.
- **Toda migración que agregue un evento nuevo al catálogo del código debe sembrar su fila.** Sin fila no hay panel (§4). Que quede escrito en la lista de verificación del proyecto.
- **Importar el contenido real desde el proveedor** hacia las filas con marcador es un paso posterior de una sola vez: un script que lee cada plantilla del proveedor y llena `html_content` / `subject`, dejando `is_synced = 1`. Vale la pena hacerlo: hasta que ocurra, la copia local no es un respaldo de nada.

**Aviso operativo:** si el mismo `API_KEY` se usa en desarrollo y en producción — que es lo habitual, porque muchas cuentas no ofrecen claves separadas por entorno — **guardar una plantilla desde el panel de desarrollo modifica la plantilla de producción**. La sincronización no distingue entornos. O se usan cuentas/ids distintos por entorno, o el panel se restringe a producción, o se asume conscientemente. Decídelo antes de desplegar, no después.

> **Nota AQUILA:** este proyecto usa un único proyecto Supabase/Brevo (sin ambientes
> dev/prod separados todavía) — el aviso operativo aplica tal cual. Sin panel de administración
> construido (§11 pendiente), el único punto de guardado hoy es la Edge Function
> `guardar-plantilla-email`, invocable por cualquier `agent` autenticado del tenant.

---

## 10. API de administración

Autenticación + rol administrador (opcionalmente también un rol de finanzas o marketing, según quién redacte los correos en el proyecto).

| Ruta | Qué hace |
|---|---|
| `GET /email-templates` | Listado: `id`, `eventType`, `subject`, `isSynced`, `lastSyncedAt`, `updatedAt`. **Nunca el HTML** — son campos grandes y el listado no los usa. |
| `GET /email-templates/:id` | Detalle: lo anterior + `brevoTemplateId`, `htmlContent` y **`availableFields`** (los del registro para ese evento). El frontend no declara campos por su cuenta. |
| `PATCH /email-templates/:id` | Guarda y sincroniza (§7). Responde `{ saved, synced, error? }`. |
| `POST /email-templates/:id/sync` | Reintento manual de la sincronización con el contenido ya guardado. |
| `POST /email-templates/:id/preview` | Vista previa renderizada (§8). |

> **Nota AQUILA:** implementado como `guardar-plantilla-email` (POST, payload con `event_type`
> en vez de `:id` en la ruta — mismo patrón que `guardar-plantilla-sms`), `sincronizar-plantilla-
> email` (POST) y `probar-plantilla-email` (POST). Rol requerido: `agent` (que `administrador`
> hereda vía `has_role()`, GAP-CAR-009) — AQUILA no tiene un rol de "finanzas/marketing" separado.
> No hay todavía `GET /email-templates` ni `GET /email-templates/:id` — son parte del panel de
> administración (§11), pendiente.

---

## 11. Pantalla de administración

Dos columnas: lista de plantillas a la izquierda, editor a la derecha.

```
┌──────────────────────┬───────────────────────────────────────────────┐
│ Reserva confirmada ✓ │ Reserva confirmada (huésped)   [✓ Sincronizado]│
│ Reserva cancelada  ✓ │                     [Vista previa] [Guardar]   │
│ Pago procesado     ⚠ │───────────────────────────────────────────────│
│ Invitación staff   ⚠ │ Asunto  [ Tu reserva en {{ params.property…}} ]│
│ …                    │                                                │
│                      │ Campos disponibles — clic para insertar        │
│                      │ (guestName · Nombre del huésped)               │
│                      │ (propertyTitle · Título del alojamiento)       │
│                      │                                                │
│                      │ ┌───────────────────────────────────────────┐ │
│                      │ │ <!DOCTYPE html> …                          │ │
│                      │ │                                            │ │
│                      │ └───────────────────────────────────────────┘ │
└──────────────────────┴───────────────────────────────────────────────┘
```

- **Insignia de estado de sincronización siempre visible**, y en cada fila de la lista. `is_synced = 0` es la información más importante de la pantalla: significa que lo que se ve **no es lo que se envía**.
- **Botón "Reintentar sincronización" visible solo cuando `is_synced = 0`**, junto a la insignia. Es el único camino de recuperación y debe estar donde se ve el problema.
- **Chips de campos con su descripción**, que insertan `{{ params.campo }}` completo en el cursor. Que la inserción incluya el prefijo `params.` es precisamente lo que evita la trampa de §6.
- **Vista previa en diálogo, no en línea**: necesita ancho, y se pide bajo demanda. Dentro del diálogo, deja editar los datos de ejemplo (los `overrides`) y regenerar.
- Mensajes distintos para los dos desenlaces del guardado: `"Plantilla guardada y sincronizada"` vs. `"Se guardó localmente, pero no se pudo sincronizar: {error}"`. El segundo es un aviso, no un error — el trabajo no se perdió.
- Los nombres de evento van al sistema de traducciones (`event_BOOKING_CONFIRMED_GUEST` → "Reserva confirmada (huésped)"), nunca la clave cruda.
- El editor de HTML puede ser un `<textarea>` monoespaciado. Un editor enriquecido es una mejora posterior, y tiene un costo: destruye el HTML de correo escrito a mano (tablas, `<style>` en línea, comentarios condicionales). Si se agrega, que sea un editor de código, no de texto enriquecido.

> **Nota AQUILA:** PENDIENTE — nada de esta sección está construido todavía (decisión explícita
> del usuario, 2026-08-17: "solo el backend/esquema por ahora"). Cuando se retome, seguir el
> patrón de `apps/web/app/pages/configuracion/plantillas-sms.vue` (ya construido, mismo criterio
> de insignia de sincronización sería aplicable si se agrega estado de sync a SMS también).

---

## 12. Criterios de aceptación

- [ ] El listado no devuelve `html_content`.
- [ ] El detalle devuelve los campos disponibles del evento con sus descripciones.
- [ ] Guardar con `{{ params.inexistente }}` responde `400` nombrando el campo.
- [ ] Guardar con `{{ guestName }}` (sin prefijo `params.`) es rechazado con un mensaje que enseña la forma correcta.
- [ ] Un campo desconocido **solo en el asunto** también es rechazado.
- [ ] Con el proveedor fallando: el contenido **queda guardado**, la respuesta es `200` con `synced: false` y el mensaje real del proveedor, y `is_synced` queda en `0`.
- [ ] `POST /:id/sync` recupera el desfase sin volver a enviar el contenido.
- [ ] Un guardado exitoso deja `is_synced = 1` y `last_synced_at` con la hora.
- [ ] Sin credencial configurada, editar y guardar funciona; solo la sincronización queda pendiente, con el motivo.
- [ ] La vista previa no hace ninguna llamada de red al proveedor.
- [ ] La vista previa ignora los `overrides` de campos no declarados en el registro.
- [ ] Cada guardado deja registro de auditoría con el asunto anterior y el nuevo.
- [ ] Un usuario sin el rol requerido recibe `403` en todas las rutas.
- [ ] El test de sincronía del registro falla si se agrega un parámetro a una función de envío sin declararlo.

> **Nota AQUILA:** cubierto por tests unitarios de `packages/shared/src/email.test.ts`
> (renderizado, extracción, validación, prefijo faltante, filtrado de overrides) y por los tests
> RLS/gobernanza estándar del repo (T-SEC-01, cobertura de `ERROR_CODES`). Los criterios que
> requieren una llamada real a Brevo (guardado exitoso con sync, proveedor fallando, reintento)
> **no están probados todavía** — misma cautela que con el worker de SMS: se deja para
> confirmación explícita antes del primer guardado real.

### Pruebas mínimas

**Unitarias:** renderizado con campo faltante (deja el marcador visible), extracción de variables de asunto y cuerpo, validación de campos desconocidos, detección de `{{ }}` sin prefijo, construcción de parámetros de ejemplo, filtrado de `overrides`.

**De integración** (base de datos real, cliente del proveedor simulado): listado y detalle, guardado exitoso con sincronización, **guardado con el proveedor lanzando excepción** (el caso que importa: verificar que el contenido quedó persistido y `is_synced = 0`), reintento de sincronización, los tres rechazos de validación, escritura de auditoría y control de acceso por rol.

