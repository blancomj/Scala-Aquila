# Evaluación del Estado de Cuenta (mockup HTML) — Mejoras, Seguridad y Profesionalismo

**Contexto:** prospecto para implementar. Concepto declarado: correo con resumen en el cuerpo + link a documento HTML con el estado de cuenta completo. El diseño visual del mockup es sólido (jerarquía clara, tipografía cuidada, paleta forest/gold distintiva, responsive y print CSS presentes). Este informe se enfoca en lo que falta: seguridad real del documento, integridad, versatilidad y su integración con la arquitectura Aquila ya evaluada.

---

## A. SEGURIDAD (lo más importante)

### A.1 🔴 CRÍTICO — El monto del pago viaja en la URL
```html
href="https://pagos.losrobles.com.co/pasarela?cuenta=PH-0302-T2&valor=98200&ref=202608"
```
El botón pasa `valor=98200` como parámetro. Problemas:
- **Manipulación trivial**: cualquier persona puede editar la URL y pagar otro valor (o intentar que la pasarela cobre menos).
- Viola directamente la arquitectura definida en el punto 2 (`crear-intencion-pago`: el servidor valida monto ≤ saldo pendiente).

**Corrección obligatoria:** el link solo lleva un identificador opaco:
```
/pagar?t=<token HMAC de intención de pago>
```
El servidor resuelve `{tenant, inmueble, saldo_vigente}` desde el token firmado y calcula el monto él mismo. La UI muestra el monto; nunca lo recibe como input confiable. Si se quiere preseleccionar monto parcial (pago parcial), eso es una *intención de pago* creada server-side, no un parámetro libre.

### A.2 🔴 CRÍTICO — Modelo de distribución y control de acceso del documento
Un HTML estático enviado/embebido con datos financieros completos es una copia sin control: se reenvía por WhatsApp, queda en historial, no se puede revocar ni auditar. Además choca con el hallazgo A2 de la evaluación de seguridad (el endpoint `ver-estado-cuenta` actual ya fue flaggeado: sin rate-limit, sin auditoría, vigencia 90 días).

**Arquitectura recomendada:**
1. El HTML **no viaja adjunto**: se sirve desde el servidor vía link con **token HMAC firmado** `{tenant, inmueble, corte, exp}` (expiración corta sugerida: 30 días, renovable regenerando el estado de cuenta).
2. Cada acceso queda en `audit_log` (quién/cuándo/IP aproximada) — cierra la brecha del endpoint público actual.
3. Rate-limit por IP sobre el endpoint (reusar `check_rate_limit`).
4. El contenido servido debe ser el **snapshot sellado a la fecha de corte** (patrón sello md5 que ya existe): si alguien abre el link 3 semanas después, ve exactamente el documento expedido, no datos vivos mezclados con pagos posteriores. Indicar claramente "corte al 31/08/2026".

### A.3 🟠 Alto — PII excesiva en un documento reenviable
Muestra `C.C. 52.331.876` completa. Este documento está diseñado para ser compartido (tiene botón "Compartir"). Enmascarar: `C.C. ****8876`. El dato completo solo se ve en sesión autenticada (portal), no en el documento por link. Aplica data minimization (Ley 1581).

### A.4 🟠 Medio — Cabeceras y política de contenido ausentes
El HTML no define CSP ni protecciones mínimas. Para la versión servida:
- `<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'self'; img-src 'self' data:;">` (o cabeceras equivalentes en el Edge Function).
- Sin JavaScript innecesario (el botón compartir puede ser link `web+aquila:` o eliminarse — ver E.3).
- `X-Content-Type-Options: nosniff`, `Referrer-Policy: no-referrer`, cache corto/no-store según vigencia del token.
- **Fuentes**: hoy carga Google Fonts (Fraunces/Inter/Plex Mono). Problemas triple: (a) fuga de cada apertura a terceros con IP del destinatario (privacidad/Ley 1581), (b) si Google falla, el documento se degrada, (c) inconsistente con el app principal que ya hace self-hosting por CSP. Auto-hospedar los tres woff2.

### A.5 🟡 Anti-phishing — el eslabón débil es el correo
Un correo que dice "debes pagar, haz click aquí" es indistinguible del phishing clásico. Mitigaciones:
- Dominio consistente y propio del envío (el mismo dominio en remitente y links).
- En el cuerpo del correo Y en las notas del documento: "Verifica que el enlace comience con https://tuconjunto.com.co".
- El botón de pago dentro del documento hosteado (no en el email) reduce superficie: el email solo lleva al documento, el pago vive en dominio verificado.
- Considerar código de verificación: "¿Duda si este mensaje es legítimo? Consulta el folio FOLIO-XXXX en tu portal / llama a la administración".

## B. INTEGRIDAD Y ANTI-FALSIFICACIÓN (profesionalismo + seguridad)

El mockup tiene un sello decorativo ("MODELO·EJEMPLO") rotado. Reemplazarlo por un sistema de autenticidad real — diferenciador fuerte:

1. **Folio único** visible: `EDC-2026-08-PH0302T2-00001` (consecutivo por inmueble-periodo).
2. **Hash de contenido**: SHA-256 del snapshot sellado impreso en el footer (`Contenido verificado · SHA-256 9f3c…`). El patrón existe (sello md5 de liquidación, hashes SHA-256 de conceptos).
3. **QR de verificación** que apunta a `/verificar/<folio>`: cualquiera (incluido un juez en un proceso monitorio art. 54 L675) escanea y confirma que el documento coincide con el expedido. Esto conecta directo con la certificación de deuda firmada digitalmente del punto 1B.
4. En impresión NO ocultar el folio/hash (hoy `@media print` oculta el stamp — el elemento de autenticidad debe sobrevivir al papel; ocultar solo lo interactivo).

## C. CORRECCIÓN DE DATOS Y TRAZABILIDAD

### C.1 ✅ Verificado
La aritmética cuadra: saldo anterior 120.000 + cargos 503.200 − abonos 525.000 = 98.200; el running balance de la tabla también es coherente. Bien.

### C.2 🟠 Falta desglose del interés de mora
La fila "Interés de mora — Sobre saldo anterior $3.200" es exactamente el tipo de cifra que genera reclamos. El kernel ya calcula día a día con day-count configurable: mostrar tooltip/fila secundaria: "Capital vencido $120.000 × 1,32% mes × 20 días (tasa certificada Superfinanciera, resolución del 25/07/2026)". Transparencia = menos disputas = menos llamadas.

### C.3 🟠 Casos que el diseño aún no contempla (versatilidad contable)
| Caso | Tratamiento propuesto |
|---|---|
| **Saldo a favor** | Total en verde/sage con etiqueta "A tu favor", botón cambia a "Solicitar devolución / aplicar a próximo periodo" |
| **Descuento pronto pago** | Si aplica: banner destacado "Paga antes del 05/09 y paga $93.289 (ahorras $4.911)" — calculado por `fn_aplicar_descuento_pronto_pago` (que además necesita tests, hallazgo previo) |
| **Pago parcial pendiente de confirmación** (PSE en proceso) | Fila informativa gris "Pago en verificación — no sumado al saldo" |
| **Nota crédito / reversión** | Tipo de movimiento propio con abono y referencia al cargo anulado (`cargo_reversado_id`) |
| **Propietario multi-inmueble** | Consolidado con subtotales por inmueble + navegación, o documento por inmueble con selector — decidir con administradores piloto |
| **Cero movimientos** | Estado limpio: "No tienes saldos pendientes" en verde — refuerza confianza |

## D. LEGAL Y NORMATIVO

1. Nota 5 ("Documento informativo sin validez fiscal") — correcta y bien puesta. Ampliar: "Las cuotas de administración no requieren factura electrónica (Concepto DIAN 106/2022); los servicios gravados facturan electrónicamente cuando aplique" — conecta con punto 1.
2. Nota de intereses: agregar la fuente concreta de la tasa (certificación Superfinanciera con fecha) — el sistema ya la administra (`tasas_referencia` append-only).
3. Reclamaciones en 5 días hábiles: verificar contra el reglamento de cada PH (es paramétrico por tenant, no fijo) y dar canal concreto (email/portal PQRS punto 3).
4. Firma de administrador: las líneas de firma impresas están bien para papel; para el documento digital considerar sustituir por bloque "Expedido electrónicamente por [nombre], Administrador(a) — Folio … — Verifiable en [URL]" (la firma manuscrita escaneada no aporta y ocupa espacio).

## E. UX / ACCESIBILIDAD

1. ✅ Fortalezas: focus-visible en botones, contraste general bueno, jerarquía tipográfica clara, print CSS pensado, scroll horizontal en tabla móvil.
2. **Toast sin `aria-live`**: añadir `role="status" aria-live="polite"` al `.toast`.
3. **Tabla accesible**: `<caption>` descriptivo, `scope="col"` en th; los montos vacíos de celdas usar `—` o dejar celdas vacías explícitas para lectores de pantalla.
4. Emoji "⤓" en botón imprimir convive con SVG en los demás: unificar a iconografía única (Iconify lucide, ya en dependencias).
5. El bloque de pago está *dentro* del recuadro de resumen (`pay-block` anidado en `.summary`) — semánticamente raro y visualmente rompe el cierre del total. Moverlo debajo del summary, a ancho completo.
6. Texto del botón "Compartir" incluye el saldo en el texto compartido (`Saldo actual: $98.200`) — filtración innecesaria al reenviar. Hacer el texto genérico: "Estado de cuenta Los Robles P.H., Apto 302 · Corte 31/08/2026".
7. Contraste a revisar: `--ink-soft:#565F55` sobre `--band:#F7F7F2` para hints de 10.5px está al límite AA para texto pequeño — subir tamaño mínimo a 11.5px u oscurecer.
8. Fechas límite: destacar la fecha de pago con chip rojo/ámbar si quedan <5 días (urgencia honesta, accionable con el botón de pago).

## F. VERSATILIDAD DE PLATAFORMA

1. **PDF server-side además del print**: window.print() depende del navegador y las fuentes; generar PDF idéntico server-side (mismo renderer HTML→PDF del informe ejecutivo del punto 12) garantiza que el documento archivado == documento visto. Botones: "Descargar PDF" (server) + "Imprimir" (local).
2. **Historial**: navegación "Estado de cuenta anterior ▾" (lista de cortes disponibles del inmueble) — el admin consulta meses atrás sin pedir nada.
3. **Theming por tenant**: colores/nombre/logo hardcodeados de Los Robles deben venir de configuración del tenant (tokens CSS inyectados server-side). La paleta forest/gold puede ser el default elegante, con override por copropiedad (identidad propia = profesionalismo percibido por el consejo).
4. **Modo oscuro opcional**: los tokens ya existen; bajo prioridad pero trivial con variables CSS.
5. **Idioma/formatos**: fijados a es-CO correctamente; asegurar formato de moneda con `Intl.NumberFormat('es-CO',{style:'currency',currency:'COP'})` centralizado (la duplicación formatoMoneda ×18 ya flaggeada también aplica aquí).

## G. EL CORREO (mitad del concepto, aún no diseñado)

Requisitos técnicos que el HTML del documento NO cumple para correo (y no debe intentar cumplir):
- Clientes de correo no soportan flex/grid completo ni `<style>` en head: el cuerpo-resumen debe ser **tablas HTML con estilos inline**, ancho ≤600px, fallback de fuentes a system stack.
- Contenido sugerido del cuerpo (mínimo, todo apunta a abrir el documento): saludo personalizado, periodo y corte, **saldo actual grande**, fecha límite, botón principal "Ver estado de cuenta" (link tokenizado A.2), línea secundaria con link directo a pagar (intención server-side A.1), pie con verificación anti-phishing y opt-out/preferencias (Ley 1581 + canales del punto 8).
- Preheader (`<span class="preheader">`) con resumen de una línea para el inbox.
- Envío vía catálogo de eventos/plantillas versionadas ya diseñado (punto 8): `evento: estado_cuenta_generado`.
- Medir: entregabilidad + click-through al documento (métrica del punto 11E).

## H. PIPELINE DE RENDER EN AQUILA (integración)

```
fn_cerrar_periodo → estados_cuenta_generados (snapshot sellado, YA EXISTE)
  → renderer server-side: plantilla themable + datos del snapshot
  → persiste HTML/PDF versionado (hash de contenido, folio consecutivo)
  → evento estado_cuenta_generado → comunicaciones (punto 8):
       email resumen + link HMAC (30 días, auditado, rate-limited)
  → portal (punto 3): misma vista autenticada + historial de cortes
```

Un solo renderer sirve a tres consumidores (correo, link público-tokenizado, portal) — cero divergencia entre lo que ve el propietario en cada canal.

## I. PRIORIDADES

| # | Acción | Severidad |
|---|---|---|
| 1 | Eliminar `valor=` de la URL de pago → intención de pago server-side con token HMAC | 🔴 Crítico |
| 2 | Servir el documento vía link firmado + snapshot sellado + audit_log + rate-limit (no HTML adjunto) | 🔴 Crítico |
| 3 | Sistema de autenticidad: folio + SHA-256 + QR de verificación (sobrevive a impresión) | 🟠 Alto |
| 4 | Enmascarar identificación; texto de compartir sin saldo | 🟠 Alto |
| 5 | Desglose del cálculo de interés de mora visible | 🟠 Alto |
| 6 | Casos saldo a favor / pronto pago / pago en verificación / multi-inmueble | 🟠 Alto (versatilidad) |
| 7 | Self-hosting de fuentes + CSP + cabeceras en el endpoint | 🟡 Medio |
| 8 | Diseño del cuerpo del correo (tablas inline, ≤600px) con verificación anti-phishing | 🟡 Medio |
| 9 | PDF server-side + historial de cortes + theming por tenant | 🟡 Medio |
| 10 | Accesibilidad (aria-live, caption/scope, emoji→icono, contraste hints) y mover pay-block fuera del summary | 🟢 Bajo |

**Conclusión:** el mockup es estéticamente superior al promedio del mercado y la decisión del concepto (resumen en correo + documento hospedado) es la correcta. Las correcciones críticas son dos y ambas son de arquitectura, no de diseño: **nunca confiar en parámetros de URL para dinero** y **no distribuir documentos financieros sin token, sello y rastro**. Con el sistema de folio/hash/QR, este documento pasa de "bonito" a "jurídicamente verificable" — algo que ningún competidor ofrece.
