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
también tienen archivo `.vue` en `apps/web/app/pages/cartera/` pero su estado
real no se verificó en esta pasada — no marcarlos **hecha** sin confirmarlo.

| # | Bloque |
|---|---|
| 16 | Bandeja de acciones y aprobaciones — **hecha** (/cartera/acciones) |
| 17 | Simulación previa de corrida — **hecha** (/cartera/simulacion) |
| 18 | Centro de escalamiento, aprobaciones y bitácora — **hecha** (/cartera/escalamiento) |
| 19 | Promesas y acuerdos |
| 20 | Casos jurídicos, expediente y actuaciones |
| 21 | Certificaciones de deuda |
| 22 | Costas judiciales |
| 23 | Configuración — **hecha en su parte crítica** (/cartera/configuracion): siembra §8.4/§9.4, activación y encendido de estrategias. Falta editar tramos (exige versión nueva, §8.5) |
| 24 | Plantillas y canales — **hecha en su parte crítica**: versionado recuperable (`PRQ-CAR-021`). Sigue pendiente `PRQ-CAR-022` (`subir-documento` con `envio_id`) y los canales sin construir (WhatsApp/postal, bloques 5/6) |
| 25 | Indicadores de cobranza y jurídicos — **hecha** (/cartera/indicadores): consume `cartera-indicadores` (ya existía completo, F9 parte 2+3+4) sin cambios de backend |

## 2.3 Externos y decisiones

| # | Bloque | Referencia |
|---|---|---|
| 26 | Consulta jurídica única — **redactada**, ver `CAR_10`; falta enviarla | `VER-CAR-01`..`08` |
| 27 | Carga del IBC vigente | §3.4 — tarea operativa, no de código |
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

`[NEGOCIO]` **I-C23 ya tiene por dónde cumplirse (2026-08-29):** SMS y email registran evidencia y reciben acuses reales de Brevo, así que un inmueble notificado por cualquiera de los dos y entregado YA puede escalar. WhatsApp sigue bloqueado por `VER-CAR-08` (concepto jurídico, no código); postal (bloque 6) sigue sin proveedor elegido.

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
