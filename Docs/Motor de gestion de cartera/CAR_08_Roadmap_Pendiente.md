# AQUILA_SAAS — MOTOR DE GESTIÓN DE CARTERA

## CAR-08 · Roadmap pendiente

> **Corte: 2026-08-28.** Inventario de lo que falta para cumplir el objetivo
> declarado del producto: **que el módulo permita prescindir de la asesoría y
> gestión permanente de un abogado.**
>
> Este documento es un **inventario de trabajo**, no norma. La norma es
> `CAR_00_Guia_Oficial.md` (§0.2, orden de precedencia).

---

# 1. Dónde quedó el motor

`[ARQ]` Estado verificado contra `main` y contra la base de desarrollo.

## 1.1 Construido y funcionando

```text
F0–F9 completos y fusionados en main
  · 30 migraciones cartera_*
  · Motor puro en packages/liquidation-engine/src/cartera-*.ts
  · 12 Edge Functions cartera-* + ejecutar-accion-cobranza
  · Suite de tests (RLS + integración HTTP contra base real)
  · Dashboard de indicadores (única pantalla existente)

Cerrado el 2026-08-28 — el eslabón que tenía el motor detenido:
  · resolverDestinatarios() puro + adaptador Supabase
  · terceros.direccion/municipio/direccion_verificada_at (GAP-CAR-012)
  · acciones_cobranza.grupo_envio_id (20260905110000)
  · cartera-recalcular PERSISTE acciones (§18.2 pasos 14-16)
  · Verificado end-to-end contra la base real: un inmueble con 2
    copropietarios y 2 estrategias produce 4 acciones, una por persona
    por estrategia, con contexto congelado y maker-checker aplicado
```

## 1.2 La frase que ya no es cierta

`[ARQ]` La cabecera de `cartera-job.ts` decía durante meses que el job «no crea
`acciones_cobranza`, pieza siguiente, no esta». **Ya la crea.** Si se encuentra
esa frase en algún comentario o documento, está desactualizada.

---

# 2. Bloques pendientes

`[ARQ]` Veintiocho. El orden dentro de cada grupo no es de ejecución — las
dependencias reales están en §3.

## 2.1 Motor y backend

| # | Bloque | Referencia |
|---|---|---|
| 1 | Orquestación por lotes y reintentos — **hecho** (cartera-ejecutar-lote) | §18.4, `GAP-CAR-005` |
| 2 | Agendamiento del job diario — **hecho** (pg_cron 11:00 UTC, solo calcula) | §18, `PRQ-CAR-010` |
| 3 | Expediente probatorio — **COMPLETO**: §34.2/34.3/34.4/34.5, I-C23 y documento imprimible | **§34** |
| 4 | Canal email de cobranza — **hecho** (2026-08-29, Brevo real vía `despacho_cobranza.ts` — plantillas, acuses, hash de contenido, mismo tronco que SMS) | `GAP-CAR-005` |
| 5 | Canal WhatsApp — **bloqueado, no de código**: `VER-CAR-08` (valor probatorio + habeas data) sigue abierto; la regla del propio documento (§24.2) prohíbe implementar sin ese concepto jurídico resuelto | `GAP-CAR-005`, `VER-CAR-08` |
| 6 | Operador postal con guía rastreable — **sin empezar**: no hay proveedor elegido (ningún código lo contempla) | `PRQ-CAR-020` |
| 7 | Versionado recuperable de plantillas — **hecho** (2026-08-29): `plantillas_sms_versiones`/`plantillas_email_versiones` append-only, UI de historial en /configuracion/plantillas-sms y -email, `acciones_cobranza_envios.plantilla_version` ya no escribe 0 fijo | `PRQ-CAR-021` |
| 8 | `subir-documento` acepta `envio_id` | `PRQ-CAR-022` |
| 9 | Certificación del art. 48 completa — **hecho** (5 rubros discriminados) | `GAP-CAR-011` |
| 10 | Conciliación pago ↔ cuota de acuerdo — **hecha** (asociación explícita, registrar-pago) | `GAP-CAR-008` |
| 11 | Comparación contra el snapshot anterior (`cambiosClasificacion`) | §18.2 paso 7 |
| 12 | Pago retroactivo y reproducibilidad histórica — **hecho** (evento PAGO_REGISTRADO, snapshots inmutables) | `GAP-CAR-003` |
| 13 | Registro de actos interruptivos — **hecho en su parte factual** (2026-08-29, `20260907140000`, `/cartera/prescripcion`): bitácora append-only, sin calcular plazos. La alerta de riesgo de prescripción sigue **BLOCKED** — exige el término y el cómputo, que es justo lo que `VER-CAR-05` no ha verificado | `VER-CAR-05` |
| 14 | Exclusión de la evidencia del job de purga — **cumplido por construcción**: forbid_mutation solo admite DELETE en audit_log | §34.6, `I-C25` |
| 15 | Provisión / deterioro contable de cartera | Sin id — no está en CAR-00 |

## 2.2 Interfaz

`[ARQ]` **La frase que ya no es cierta (2ª):** esta sección decía "hoy existe
una sola pantalla, `apps/web/app/pages/cartera/index.vue`, de solo lectura".
Ya no — bandeja, simulación, escalamiento, configuración e indicadores tienen
pantalla propia (tabla abajo); certificaciones/jurídico/promesas-acuerdos
también tienen archivo `.vue` en `apps/web/app/pages/cartera/`. **Verificados
en vivo el 2026-08-29** (ver §2.2.1): las tres pantallas cargan, pero dos
tenían el detalle completamente muerto.

| # | Bloque |
|---|---|
| 16 | Bandeja de acciones y aprobaciones — **hecha** (/cartera/acciones) |
| 17 | Simulación previa de corrida — **hecha** (/cartera/simulacion) |
| 18 | Centro de escalamiento, aprobaciones y bitácora — **hecha** (/cartera/escalamiento) |
| 19 | Promesas y acuerdos — **verificada** (2026-08-29): lista y acciones bien; el drawer de detalle no montaba, corregido en `9da6828` |
| 20 | Casos jurídicos — **verificada** (2026-08-29): remisión completa desde una certificación vigente, caso `000001` creado en DEMO Bandeja Cobranza y drawer de detalle abierto |
| 21 | Certificaciones de deuda — **verificada** (2026-08-29): guardas correctas y expedición real, certificación `000006` por $850.000 sobre TORRE-B-208. El documento imprimible del art. 48 **no era alcanzable** por el anidamiento de rutas de Nuxt; corregido en `6571dc2` |
| 22 | Costas judiciales |
| 23 | Configuración — **hecha en su parte crítica** (/cartera/configuracion): siembra §8.4/§9.4, activación y encendido de estrategias. Falta editar tramos (exige versión nueva, §8.5) |
| 24 | Plantillas y canales — **hecha en su parte crítica**: versionado recuperable (`PRQ-CAR-021`). Sigue pendiente `PRQ-CAR-022` (`subir-documento` con `envio_id`) y los canales sin construir (WhatsApp/postal, bloques 5/6) |
| 25 | Indicadores de cobranza y jurídicos — **hecha** (/cartera/indicadores): consume `cartera-indicadores` (ya existía completo, F9 parte 2+3+4) sin cambios de backend |

## 2.3 Externos y decisiones

| # | Bloque | Referencia |
|---|---|---|
| 26 | Consulta jurídica única — **redactada**, ver `CAR_10`; falta enviarla | `VER-CAR-01`..`08` |
| 27 | Carga del IBC vigente — **pantalla hecha** (2026-08-29, `/plataforma/tasas-referencia`). Estaba mal clasificado: no era "tarea operativa", era que no existía ninguna superficie para hacerla. **Falta cargar una resolución real**, y en dev toda la vigencia de 2026 la ocupa una fila de prueba al 5% mensual que, por append-only, no se corrige sin una migración de reparación | §3.4 |
| 28 | Portal del residente | `GAP-CAR-010`, exige revisar `AD-26` |

---

# 3. Dependencias que mandan el orden

```text
26 (consulta jurídica)  ─── REDACTADA (CAR_10). Falta enviarla al abogado.
   │                         es lo único que no depende del equipo y con
   │                         el tiempo de respuesta más incierto
   ├──→ 27  carga del IBC
   ├──→ 13  alertas de prescripción      (VER-CAR-05)
   ├──→ 14  retención de evidencia       (VER-CAR-05)
   └──→ 5   canal WhatsApp               (VER-CAR-08)

3 (expediente probatorio §34)  ─── materializa el diferenciador
   ├── ✅ 34.3 evidencia + 34.4 acreditación + I-C23 en el escalamiento
   ├── ✅ 34.5 fn_compilar_expediente (reproducible, PH-C44 verificado)
   ├── ✅ webhook-brevo: acuses de SMS y email (PRQ-CAR-019 cerrado)
   └── ✅ documento imprimible (/cartera/expediente/{inmuebleId}): 7 secciones,
          índice y hash del expediente al pie de CADA página
   ├──→ 7   versionado de plantillas     (precondición)
   ├──→ 4   canal email                  (webhooks de acuse)
   ├──→ 6   operador postal              (canal físico)
   └──→ 8   subir-documento con envio_id

1 + 2 (lotes + agendamiento)  ─── convierte el motor en automatismo
   ├── ✅ cartera-ejecutar-lote: selección por fecha de corte, orden por
   │      deuda más antigua, tope de intentos (§18.4 paso 7), evento de
   │      dominio (paso 6) y MODO SIMULACIÓN POR DEFECTO
   ├── ✅ 17 simulación previa: el endpoint ya devuelve el mensaje exacto
   │      que enviaría; falta solo la pantalla
   └── ✅ cron diario activo (11:00 UTC = 6:00 a. m. Colombia). SOLO
          CALCULA: crea las acciones en la bandeja y no despacha nada.
          Agendar además cartera-ejecutar-lote en modo ejecucion es lo
          que convertiría esto en envío automático — decisión abierta.

9 (certificación completa)  ─── título ejecutivo defendible
   └── depende de distinguir extraordinarias y sanciones en el cargo

16..25 (interfaz)  ─── al final, salvo 16 y 17
   ✅ 16 bandeja: cola ordenada por urgencia, aprobar/rechazar con el
         maker-checker del art. 48, despacho, y una columna PRUEBA
         separada del estado — despachada no es acreditada
   ✅ 17 simulación previa: muestra el texto exacto que saldría y, con
         el mismo peso, lo que NO saldría y por qué. Desde ahí se puede
         despachar el lote con confirmación explícita.
```

`[NEGOCIO]` **Prioridad recomendada:** 26 en paralelo desde el primer día → 3 →
1 + 2 → 9 → 16 y 17 → resto de interfaz.

---

## 2.2.1 Verificación en vivo de 19/20/21 (2026-08-29)

```text
🔴 Bug real, ya corregido (9da6828) — afectaba a 19 y 20 por igual:
   Los componentes viven en components/cartera/, así que Nuxt los
   auto-importa CON el prefijo del directorio (CarteraAcuerdoPagoDrawer,
   CarteraCasoJuridicoDrawer), pero las páginas los llamaban sin él.
   Vue no resolvía el componente y no renderizaba NADA: hacer clic en
   el número de un acuerdo no abría nada, sin error visible. Sus
   vecinos de carpeta sí llevaban el prefijo, lo que hacía el fallo
   invisible a la lectura.

🔴 Segundo defecto, mismo commit: ambos drawers usaban UiDrawer sin un
   ancestro .ficha-inmueble, del que toma el estilo de panel. Una vez
   montados salían dentro del flujo de la página, sin overlay.

✅ Lo que sí funcionaba: las tres pantallas cargan sin errores de
   consola, con estados vacíos correctos. El modal de remisión a
   jurídico exige certificación vigente y enlaza a emitirla. La
   certificación rechaza con mensajes claros cuando falta la política
   financiera vigente o cuando no hay deuda vencida.

✅ Vía feliz cerrada, sembrando cartera en DEMO Bandeja Cobranza
   (ningún tenant de dev tenía deuda vencida; GC-001 sí tiene cargos,
   pero NO se tocó: es el tenant del caso dorado). Cadena mínima:
   periodo 2026-07 con vencimiento 2026-07-25 → concepto CUOTA_ADMIN →
   liquidación → línea → cargo de capital de $850.000 sobre
   TORRE-B-208. Con eso:
     · certificación 000006 expedida por exactamente $850.000, vigente;
     · caso jurídico 000001 remitido desde esa certificación,
       pretensión $850.000, y su drawer de detalle abre correctamente.
```

`[ARQ]` Los datos sembrados quedan en dev: son un juego coherente que hace
que ese tenant demuestre de verdad el flujo de cartera. La certificación es
inmutable por diseño (solo se anula), así que deshacerlo no es trivial —
tenerlo presente si alguien cuenta filas en DEMO Bandeja Cobranza.

`[ARQ]` De paso quedó verificado end-to-end el arreglo de la política
financiera (`05c5251`): se creó y activó una política v1 desde la interfaz en
DEMO Bandeja Cobranza, que es justo lo que antes era imposible.

---

`[NEGOCIO]` **I-C23 ya tiene por dónde cumplirse (2026-08-29):** SMS y email registran evidencia y reciben acuses reales de Brevo, así que un inmueble notificado por cualquiera de los dos y entregado YA puede escalar. WhatsApp sigue bloqueado por `VER-CAR-08` (concepto jurídico, no código); postal (bloque 6) sigue sin proveedor elegido.

---

# 3.1 Gobierno jurídico (PROMPT-CAR-JUR-001, auditoría 2026-08-29)

`[ARQ]` `Docs/Motor de gestion de cartera/PROMPT_AGENTE_IMPLEMENTACION_MOTOR_CARTERA_GOBIERNO_JURIDICO.md`
(recibido del usuario) pide auditar el motor contra un marco de gobierno
jurídico (CJ-1..CJ-8, niveles L1-L7 de configurabilidad). Se contrastó archivo
por archivo contra el repositorio real (no contra lo que el documento asumía)
antes de tocar nada. Resultado: la mayoría de lo que pide ya estaba bien
resuelto o correctamente bloqueado por un `VER-CAR-*` abierto. Tres huecos
reales sí se cerraron:

```text
✅ CJ-8 transferencia de propiedad y solidaridad (20260908100000)
   · inmueble_transferencias — bitácora factual de POR QUÉ cambió el
     titular (tipo, evidencia, deuda conocida a la fecha). NO duplica
     inmueble_persona_rol (que ya resuelve QUIÉN/CUÁNDO con
     vigente_desde/hasta) — solo agrega el contexto evidencial que
     faltaba. /cartera/transferencias.
   · Solidaridad de pago verificada como ya correcta por construcción:
     cargos cuelgan de inmueble_id, no de porcentaje de copropietario —
     nada que cambiar ahí.

✅ CJ-4 catálogo de frases prohibidas (20260908110000)
   · plantillas_frases_prohibidas (global, solo is_platform_admin
     escribe) + fn_validar_contenido_plantilla — fn_guardar_plantilla_sms/
     email ahora RECHAZAN (no solo advierten) contenido tipo "embargo
     inminente", "centrales de riesgo", "constituye en mora", etc.
     Antes esto no existía: cualquier texto se guardaba sin validar.

✅ CJ-3 legal_hold (20260908120000)
   · documentos_legal_holds + fn_activar_legal_hold (rol auxiliar) /
     fn_liberar_legal_hold (rol administrador) — freno de purga por
     documento_grupo_id. No hay ningún job de purga hoy (verificado);
     esto es el prerrequisito estructural, no una función completa.
```

Hallazgos de la propia auditoría que valen para no repetir el trabajo:

```text
· CJ-1 (intereses): guard_politica_financiera_tope_legal (20260901110000)
  YA es el guard obligatorio que CJ-1 §8.6 pedía — trigger de base de
  datos, no solo convención. Grieta menor: políticas con
  interes_tipo_tasa NULL se lo saltan (compatibilidad hacia atrás,
  20260822220000) — no se verificó cuántas políticas vigentes están así.
· CJ-2 (imputación): compensaCreditos (H3/H4, auditoría externa
  2026-08-26) permite que un crédito de un periodo compense la mora de
  un periodo POSTERIOR cuando la política del tenant lo activa — posible
  tensión con la regla "no netear créditos contra obligaciones futuras"
  del documento. No se tocó: es exactamente el tipo de punto que debe
  quedar para el abogado, no decidido por el agente.
· CJ-5 (evidencia SMS/email): acciones_cobranza_envios +
  acciones_cobranza_acuses ya cubren el estándar de evidencia que el
  documento exige para WhatsApp — aplicado correctamente a los canales
  que sí están en producción.
```

## 3.1.1 Seguimiento — la grieta de CJ-1, verificada

Se consultó la base: de 27 políticas financieras, 26 tienen
`interes_tipo_tasa` nulo, pero **ninguna cobra mora sin fuente declarada**.
Las 26 nulas no cobran interés en absoluto, que es el único caso que el guard
admite omitir. La grieta existe en el papel y no está siendo explotada.

Verificándola aparecieron dos huecos reales encadenados, ya cerrados en
`05c5251`:

```text
✅ La interfaz nunca alimentó al guard (20260908130000 + drawer/store)
   · PoliticasVersionDrawer pedía tasa y tope mensual pero NO la fuente
     ni el multiplicador; el store tampoco los enviaba. La política se
     guardaba en borrador (el guard no mira borradores) y al ACTIVARLA
     el trigger la rechazaba con TOPE_LEGAL_NO_DECLARADO — cuando ya no
     se puede editar. Ninguna copropiedad podía activar una política con
     mora desde el producto. Eso explica las 26 sin interés.
   · tasas_referencia tenía 61 resoluciones cargadas y CERO lectores en
     el producto. El store estrena cargarTasaReferenciaVigente().

✅ El multiplicador no tenía techo propio
   · El guard validaba la tasa contra multiplicador × tasa de referencia,
     pero el multiplicador lo declaraba el mismo tenant: con 3.00 se
     cobraba el triple del IBC y el guard aprobaba. El tope legal era
     circular. Ahora hay CHECK <= 1.5 (art. 30). No decide nada de
     VER-CAR-01, que pregunta por el orden de operaciones, el método de
     conversión, la modalidad y la base de días — no por el múltiplo.
```

`[NEGOCIO]` **El bloque 27 (carga del IBC vigente) pasó a ruta crítica.** Al
verificar en la aplicación viva, la única tasa de referencia vigente hoy en
dev es una fila de prueba (`TEST-CALC-INTERESES-2026`, marcada "no es una tasa
real"). Ahora que la interfaz sí permite declarar la fuente, una política
activada se validaría contra ese dato falso. Cargar la resolución real de la
Superfinanciera dejó de ser una tarea operativa aplazable.

Construida esa pantalla el mismo día (`8e6444a`), quedó a la vista el resto del
problema:

```text
· La fila de prueba TEST-CALC-INTERESES-2026 ocupa 2026-01-01 → 2026-12-31
  al 5% mensual (60% E.A.). Cualquier política de mora activada en 2026 se
  valida contra ella.
· No se puede corregir desde el producto ni con service role: forbid_mutation
  bloquea UPDATE y DELETE, y la restricción de no solape impide registrar la
  resolución real encima. Sacarla exige una migración de reparación que
  deshabilite el trigger a propósito — decisión de gobernanza, no de
  implementación.
· Sin verificar todavía si producción tiene el mismo problema.
```

---

# 4. Deuda conocida al corte

```text
· VER-CAR-01 sigue abierto y F1-F9 se completaron igual: todo el cálculo
  de mora corre sobre una conversión IBC→mensual no validada. Es la deuda
  más cara del bloque y contradice la regla de bloqueo de §24.2.

· El barrel de liquidation-engine arrastra su grafo completo a cada Edge
  Function que lo importa. Ya rompió dos deploys (node:crypto y
  @aquila/payment-gateways). Arreglo de fondo pendiente: importar el
  módulo concreto en vez del barrel.

· Los mockups contienen decisiones que contradicen el rector. Ver
  CAR_09_Revision_Mockups.md antes de construir cualquier pantalla.
```

---

**FIN — CAR-08 ROADMAP PENDIENTE**
