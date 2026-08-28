# AQUILA_SAAS — MOTOR DE GESTIÓN DE CARTERA

## CAR-07 · Enmiendas propuestas a la Guía Oficial

> **ESTADO: INTEGRADO (2026-08-28).** Las cuatro enmiendas fueron aprobadas e
> integradas en `CAR_00_Guia_Oficial.md`. Este documento queda como **registro
> de la decisión y su motivación** — la norma vigente es el rector, no este
> archivo (§0.2, orden de precedencia).
>
> Trazabilidad de la integración en el rector: §34 nueva; §33.5 reemplazado;
> §9.2 reetiquetado; §3.5 con `VER-CAR-05` recalificado y `VER-CAR-07`/
> `VER-CAR-08` añadidos; §24.1 con `PRQ-CAR-019..022`; §24.3 ruta crítica
> ampliada; §27 con `I-C21..I-C25`; §10.3 y §18.4 con punteros a §34.
>
> Origen: revisión del 2026-08-28 del documento rector completo (3.725 líneas)
> contra el esquema real en `main` y contra el objetivo declarado por el
> propietario del producto: **que el módulo permita prescindir de la asesoría y
> gestión permanente de un abogado.**

---

# 0. Por qué estas cuatro enmiendas

`[ARQ]` CAR-00 fijó su criterio de terminación en §33.5:

> «¿Por qué le enviaron un requerimiento de cobro a este propietario el 14 de
> junio, y con base en qué?»

Es una pregunta **defensiva**: la formula un auditor, la asamblea o un
propietario inconforme, y se responde hacia adentro con la foto congelada del
§10.3. El documento la responde bien y el motor la responde bien.

El objetivo del producto exige además una pregunta **ofensiva**, que se responde
hacia afuera y ante un juez:

> «Acredite que notificó: cuándo, a quién, con qué texto y con qué prueba de
> recibo.»

CAR-00 nunca se propuso responder la segunda. Por eso el motor —construido con
fidelidad al documento— no puede responderla hoy: §10.2 conserva
`contenido_hash` pero no el contenido, y `estado_accion_cobranza_t` termina en
`ejecutada`, que significa *entregado al proveedor*, no *recibido por el
destinatario*.

Las cuatro enmiendas cierran esa brecha:

| Id | Enmienda | Alcance |
|---|---|---|
| `ENM-CAR-01` | **Nueva §34 — Expediente probatorio** | Sección nueva completa |
| `ENM-CAR-02` | §33.5 — Criterio de terminación del bloque | Reemplazo de párrafo |
| `ENM-CAR-03` | §9.2 — `requerimiento_formal` sin fundamento legal | Reetiquetado + `VER-CAR-07` |
| `ENM-CAR-04` | §3.5 — Prescripción mal calibrada | Recalificación de `VER-CAR-05` |

---

# ENM-CAR-01 — Nueva sección §34: Expediente probatorio

`[ARQ]` Se inserta como §34, después de §33 y antes del cierre del documento.

## 34.1 Principio

`[ARQ]` **Una gestión de cobro que no puede acreditarse no ocurrió.**

CAR-00 §9.1 ya separa *acción programada* (intención) de *acción ejecutada*
(hecho). Esta sección añade el tercer estado, que es el único que sirve ante un
juez:

```text
acción programada   →   acción ejecutada   →   acción acreditada
   (intención)            (despachada)          (recibida, con prueba)
```

`[ARQ]` **`REC-CAR-016`** — El estado `ejecutada` de
`estado_accion_cobranza_t` significa **despachada al proveedor**, no recibida.
No se renombra el valor del enum (migración costosa sobre datos vivos); se
documenta su semántica exacta y la acreditación se **deriva** de los acuses,
nunca se declara — mismo principio que §6.1 («la posición es derivada, nunca
declarada»).

## 34.2 Qué constituye prueba, por canal

`[NEGOCIO]` `[VERIFICAR]` No todos los canales prueban lo mismo. La tabla es
la fuente de verdad de qué se exige a cada uno:

| Canal | Prueba exigida | Origen del acuse | ¿Acredita por sí solo? |
|---|---|---|---|
| `email` | Constancia del proveedor: id de mensaje, fecha, destinatario, estado de entrega | Webhook | Sí, con acuse `entregado` |
| `sms` | Acuse del operador con id y estado | Webhook | Sí, con acuse `entregado` |
| `whatsapp` | Acuse del proveedor | Webhook | Parcial — ver `VER-CAR-08` |
| `carta` / físico | Guía rastreable de operador postal + acuse de recibo | Manual (documento) | Sí, con guía y acuse cargados |
| `llamada` | Registro del gestor: fecha, hora, duración, resultado tipificado | Constancia humana | No — es gestión, no notificación |
| `visita` | Acta de visita firmada o constancia del gestor | Constancia humana | No — es gestión, no notificación |

`[ARQ]` **`REC-CAR-017`** — Distinción dura entre **canal con acuse técnico**
(email, sms, whatsapp: el proveedor devuelve un estado verificable) y **canal
con constancia humana** (llamada, visita: solo hay la palabra del gestor). Un
escalamiento a etapa prejurídica o jurídica **no puede sustentarse únicamente en
constancias humanas**. Se implementa como regla de escalamiento, no como
advertencia de interfaz.

`[VERIFICAR]` **`VER-CAR-08`** *(nuevo)* — Valor probatorio de WhatsApp como
canal de notificación de cobro, y su compatibilidad con la Ley 1581 de 2012
cuando el número se obtuvo para otra finalidad. **No usarlo para
`requerimiento_formal` ni `aviso_prejuridico` hasta tener concepto.**

## 34.3 DDL

`[ARQ]` Dos tablas nuevas, ambas append-only, ambas con `tenant_id` + RLS
`enable & force` (`REC-CAR-007`). No se modifica `acciones_cobranza`: una acción
puede tener varios intentos de envío (§18.4 paso 7, reintentos con backoff), así
que el envío es una entidad propia, no columnas más.

```sql
-- ── Envío material de una acción de cobranza ──────────────────────────
create table public.acciones_cobranza_envios (
  id                    uuid primary key default gen_random_uuid(),
  tenant_id             uuid not null references public.tenants (id) on delete cascade,
  accion_id             uuid not null references public.acciones_cobranza (id),

  intento_numero        int not null,
  canal                 public.canal_cobranza_t not null,

  -- DESTINATARIO RESUELTO EN EL MOMENTO DEL ENVÍO
  destinatario_tercero_id uuid not null references public.terceros (id),
  destinatario_contacto   text not null,     -- correo/teléfono/dirección usados

  -- CONTENIDO — lo que se aporta al proceso, no su huella
  plantilla_codigo      text not null,
  plantilla_version     int not null,
  asunto                text,
  contenido_renderizado text not null,       -- el texto exacto que se envió
  contenido_hash        text not null,       -- integridad, no sustituto

  -- PROVEEDOR
  proveedor             text not null,       -- 'brevo' | 'postal' | 'manual'
  referencia_externa    text,                -- id del proveedor
  enviado_at            timestamptz not null default now(),
  enviado_por           uuid references public.profiles (id),

  created_at            timestamptz not null default now(),
  constraint envio_intento_unico unique (tenant_id, accion_id, intento_numero)
);

alter table public.acciones_cobranza_envios enable row level security;
alter table public.acciones_cobranza_envios force row level security;

create trigger acciones_cobranza_envios_append_only
  before update or delete on public.acciones_cobranza_envios
  for each row execute function public.forbid_mutation();

create index on public.acciones_cobranza_envios (tenant_id, accion_id);
create index on public.acciones_cobranza_envios (tenant_id, referencia_externa);
```

```sql
-- ── Acuses recibidos sobre un envío ───────────────────────────────────
create table public.acciones_cobranza_acuses (
  id                uuid primary key default gen_random_uuid(),
  tenant_id         uuid not null references public.tenants (id) on delete cascade,
  envio_id          uuid not null references public.acciones_cobranza_envios (id),

  estado            public.estado_acuse_t not null,
  ocurrido_at       timestamptz not null,    -- momento reportado por la fuente
  recibido_at       timestamptz not null default now(),  -- momento en que llegó

  origen            public.origen_acuse_t not null,
  payload_crudo     jsonb,                   -- respuesta íntegra del proveedor
  documento_id      uuid references public.documentos (id),  -- acuse escaneado
  motivo            text,                    -- rebote, imposibilidad, etc.
  registrado_por    uuid references public.profiles (id),

  created_at        timestamptz not null default now(),

  -- Un acuse manual sin documento que lo respalde no es prueba de nada
  constraint acuse_manual_exige_documento check (
    origen <> 'manual' or documento_id is not null
  ),
  -- Deduplicación de webhooks reenviados (IDEM-05)
  constraint acuse_unico unique (tenant_id, envio_id, estado, ocurrido_at)
);

alter table public.acciones_cobranza_acuses enable row level security;
alter table public.acciones_cobranza_acuses force row level security;

create trigger acciones_cobranza_acuses_append_only
  before update or delete on public.acciones_cobranza_acuses
  for each row execute function public.forbid_mutation();
```

`[ARQ]` **D-24, obligatorio antes de migrar.** Los dos tipos siguientes son
**propuesta de catálogo**, no autorización a crearlos como enum. Ambos gatillan
lógica de transición (el escalamiento consulta el estado de acreditación), por lo
que la evaluación de D-24 debería resolverse a favor del enum de Postgres **con
su `COMMENT ON TYPE`** — pero esa evaluación hay que hacerla explícitamente, y
`tests/governance/enum-lista-tipos-coverage.test.ts` la exige:

```sql
create type public.estado_acuse_t as enum (
  'encolado',      -- aceptado por el proveedor, sin resolución todavía
  'entregado',     -- el proveedor confirma entrega
  'leido',         -- confirmación de lectura (no todos los canales)
  'rebotado',      -- rechazo permanente del destino
  'fallido',       -- error técnico del envío
  'no_entregable'  -- imposibilidad acreditada (dirección inexistente, etc.)
);

create type public.origen_acuse_t as enum (
  'proveedor',     -- webhook del proveedor de envío
  'manual'         -- constancia cargada por una persona, exige documento_id
);
```

## 34.4 Estado de acreditación — derivado, nunca persistido

`[ARQ]` **`REC-CAR-018`** — No existe columna `esta_acreditada`. Igual que la
posición de cartera (§6.1) y que la prohibición de `esta_en_mora` (AP-01), el
estado de acreditación se **deriva** del último acuse de cada envío:

```sql
create or replace function public.fn_acreditacion_accion(
  p_tenant_id uuid,
  p_accion_id uuid
) returns table (
  envios_total        int,
  envios_acreditados  int,
  ultimo_estado       public.estado_acuse_t,
  ultimo_acuse_at     timestamptz,
  acreditada          boolean
)
language sql stable
as $$ ... $$;
```

```text
acreditada(accion) =
    ∃ envio ∈ envios(accion) :
        ultimo_acuse(envio).estado ∈ ('entregado', 'leido')

Nota: 'leido' implica 'entregado'. 'no_entregable' NO acredita la
notificación, pero SÍ acredita la diligencia — se conserva y se
reporta, porque un intento fallido documentado vale ante un juez.
```

## 34.5 Compilación del expediente

`[ARQ]` **`REC-CAR-019`** — Función pura de composición sobre datos ya
existentes. No calcula nada nuevo; reúne. Recibe fecha de corte explícita
(`REC-CAR-008`).

```sql
create or replace function public.fn_compilar_expediente(
  p_tenant_id   uuid,
  p_inmueble_id uuid,
  p_fecha_corte date
) returns jsonb
language sql stable
as $$ ... $$;
```

Contenido obligatorio del expediente, en este orden:

```text
1. Identificación         inmueble, coeficiente, deudor(es) con su rol y
                          vigencia (inmueble_persona_rol), copropiedad
2. Título ejecutivo       certificación art. 48 vigente + detalle_cargos
                          congelado + certificacion_hash
3. Composición de deuda   cargos vencidos con vencimiento, saldo y antigüedad
                          a la fecha de corte
4. Cronología de gestión  toda acción de cobranza, con: qué se envió, a quién,
                          cuándo, por qué canal, con qué plantilla y versión,
                          el texto íntegro, y su acuse con fecha
5. Promesas y acuerdos    con su estado, cumplimiento e incumplimiento
6. Trazabilidad           política de clasificación y versión que sustentó cada
                          decisión de escalamiento, y quién aprobó cada acción
                          de alto impacto
7. Intentos fallidos      envíos no entregables, con su motivo — acreditan
                          diligencia
```

`[ARQ]` **Criterio de terminación de esta sección:** el abogado debe poder
radicar con este expediente **sin pedir nada más**. Si tiene que preguntar algo,
la sección no está completa.

`[NEGOCIO]` Salida: PDF paginado, numerado, con índice y con el hash del
expediente en el pie de cada página. El PDF **no es la fuente de verdad** — es
una materialización fechada de `fn_compilar_expediente`, reproducible.

## 34.6 Retención

`[LEGAL]` `[VERIFICAR]` La evidencia se conserva mientras la obligación sea
exigible o esté en discusión, **no según una política de purga genérica**.

```text
retencion_minima(evidencia) =
    fecha_extincion_obligacion + termino_prescripcion + margen

Mientras VER-CAR-05 (prescripción) esté abierto, NO se purga
ninguna evidencia de cobranza. Ver ENM-CAR-04.
```

`[ARQ]` Esto choca con la purga automática existente
(`20260814190000_purga_audit_log.sql`, 24 meses). Las tablas de esta sección
**quedan explícitamente excluidas** de esa purga.

## 34.7 Invariantes nuevos

| Id | Invariante | Refuerzo |
|---|---|---|
| `I-C21` | Un envío conserva el contenido exacto que se despachó | `contenido_renderizado not null` + `forbid_mutation()` |
| `I-C22` | Un acuse manual no existe sin documento que lo respalde | `check (origen <> 'manual' or documento_id is not null)` |
| `I-C23` | Un escalamiento a prejurídica o jurídica exige al menos una acción acreditada por canal con acuse técnico | Función de escalamiento + test |
| `I-C24` | Un expediente no se compila con certificación anulada o vencida | `fn_compilar_expediente` + test |
| `I-C25` | La evidencia de cobranza no se purga por antigüedad | Exclusión explícita del job de purga |

`[ARQ]` `I-C21`, `I-C22` y `I-C25` se refuerzan **en el esquema**. `I-C23` e
`I-C24` viven en función y test, porque dependen de reglas de negocio
configurables.

## 34.8 Prerrequisitos nuevos

| Id | Prerrequisito | Estado real | ¿Bloqueante? |
|---|---|---|---|
| `PRQ-CAR-019` | Webhooks de acuse del proveedor de envío | ❌ **No existe.** Brevo los ofrece; no hay endpoint que los reciba | **Sí** para canales con acuse técnico |
| `PRQ-CAR-020` | Operador postal con guía rastreable | ❌ **No existe.** Ningún mockup ni código lo contempla, pese a que las pantallas ofrecen «correo certificado» | **Sí** para canal físico |
| `PRQ-CAR-021` | Versionado de plantillas con recuperación por versión | ⚠️ **Parcial.** `plantillas_sms` y `email_templates` existen; no hay versión recuperable | **Sí** |
| `PRQ-CAR-022` | Extensión de `subir-documento` para acuses | ⚠️ **Parcial.** La Edge Function existe (`GAP-CAR-007` resuelto); falta aceptar `envio_id` | Sí para canal físico |

## 34.9 Golden cases

```text
PH-C40  Email entregado
        Acción ejecutada → webhook 'entregado' → acreditada = true.
        El expediente incluye el texto íntegro y la fecha del acuse.

PH-C41  Email rebotado, reintento entregado
        Intento 1 'rebotado', intento 2 'entregado'.
        acreditada = true. El expediente muestra AMBOS intentos.

PH-C42  Solo constancias humanas
        Tres llamadas registradas, cero envíos con acuse técnico.
        El escalamiento a prejurídica se RECHAZA por I-C23.

PH-C43  No entregable acreditado
        Dirección inexistente con constancia del operador postal.
        acreditada = false, pero el expediente lo reporta como
        diligencia documentada, no como vacío.

PH-C44  Reproducibilidad
        fn_compilar_expediente con la misma fecha_corte produce el
        mismo hash dos veces, con datos posteriores en la base.

PH-C45  Webhook duplicado
        El proveedor reenvía el mismo acuse: la constraint acuse_unico
        lo deduplica sin error visible (IDEM-05).
```

---

# ENM-CAR-02 — §33.5, criterio de terminación

`[ARQ]` **Texto actual:**

> La prueba definitiva del bloque es esta pregunta, formulada por un juez o por
> la asamblea:
>
> «¿Por qué le enviaron un requerimiento de cobro a este propietario el 14 de
> junio, y con base en qué?»

**Texto propuesto:**

> La prueba definitiva del bloque son **dos** preguntas. La primera la formula la
> asamblea o un propietario inconforme, y se responde hacia adentro:
>
> «¿Por qué le enviaron un requerimiento de cobro a este propietario el 14 de
> junio, y con base en qué?»
>
> La segunda la formula un juez, y se responde hacia afuera:
>
> «Acredítelo.»
>
> Si AQUILA no puede responder la primera con precisión, fecha, política,
> versión, monto y firma, el bloque no está terminado. Si no puede responder la
> segunda con el texto exacto que se envió, el canal, el destinatario y su acuse
> de recibo, el bloque está terminado como herramienta de gestión pero **no
> cumple el objetivo del producto**.

---

# ENM-CAR-03 — §9.2, `requerimiento_formal`

`[VERIFICAR]` **Texto actual:**

```sql
'requerimiento_formal',   -- comunicación con efectos de constitución en mora
```

`[ARQ]` **Problema.** Es una afirmación jurídica de peso que **no traza a
ninguna fila de la matriz legal del §3**, incumpliendo la regla dura de §0.3
(«nunca presentar una decisión `[ARQ]` o `[NEGOCIO]` como si fuera `[LEGAL]`»).

Y probablemente sea incorrecta: en obligaciones a plazo la mora opera por el
solo vencimiento, sin necesidad de requerimiento. Las expensas comunes tienen
plazo fijado por el reglamento o por la asamblea, de modo que el deudor está en
mora desde el vencimiento y el requerimiento **no la constituye**. Su valor es
probatorio y de gestión, no constitutivo.

**Texto propuesto:**

```sql
'requerimiento_formal',   -- [NEGOCIO] comunicación formal con valor probatorio
                          -- reforzado, previa al escalamiento prejurídico.
                          -- NO constituye en mora: en obligación a plazo la
                          -- mora opera por el vencimiento (ver VER-CAR-07).
```

`[VERIFICAR]` **`VER-CAR-07`** *(nuevo)* — Confirmar con concepto jurídico que
las expensas comunes son obligación a plazo con mora automática, y que ninguna
comunicación del administrador es requisito para causar intereses. Impacta la
redacción de las plantillas de requerimiento, que hoy podrían estar afirmando
ante el deudor algo jurídicamente falso.

**¿Bloqueante?** No para construir. **Sí para el texto de las plantillas.**

---

# ENM-CAR-04 — §3.5, prescripción

`[ARQ]` **Clasificación actual** de `VER-CAR-05`:

| Id | Incertidumbre | ¿Bloqueante? |
|---|---|---|
| `VER-CAR-05` | Prescripción de la obligación por expensas comunes | No (afecta BI) |

**Problema.** La calificación «afecta BI» es correcta para un módulo de gestión
supervisado por un abogado. Es incorrecta para el objetivo declarado del
producto: si se retira al abogado del seguimiento permanente, **nadie vigila la
prescripción**, y una obligación que prescribe en silencio es exactamente el
riesgo que introduce la automatización.

Además, §34.6 hace depender de este concepto la política de retención de la
evidencia: sin término de prescripción no hay forma de saber cuánto conservar.

**Clasificación propuesta:**

| Id | Incertidumbre | ¿Bloqueante? |
|---|---|---|
| `VER-CAR-05` | Prescripción de la obligación por expensas comunes: término, cómputo y actos que la interrumpen | **Sí** — para §34 (retención) y para la alerta operativa de riesgo de prescripción |

**Consecuencias operativas que se añaden una vez resuelto:**

```text
1. Alerta por obligación próxima a prescribir, con umbral [CONFIG].
2. Registro explícito de los actos interruptivos, con su evidencia.
3. Indicador de cartera en riesgo de prescripción en el tablero.
4. Regla de retención de evidencia de §34.6.
```

`[ARQ]` Con esta recalificación, la ruta crítica de desbloqueo del §24.3 pasa a
tener **tres** conceptos jurídicos bloqueantes en vez de dos: `VER-CAR-01`
(conversión del IBC), `VER-CAR-02` (anatocismo) y `VER-CAR-05` (prescripción).
Los tres deberían llevarse al abogado en **una sola consulta**, junto con los
nuevos `VER-CAR-07` (constitución en mora) y `VER-CAR-08` (WhatsApp).

---

# Resumen de identificadores nuevos

```text
SECCIÓN
  §34                    Expediente probatorio

DECISIONES ARQUITECTÓNICAS
  REC-CAR-016            'ejecutada' = despachada, no recibida
  REC-CAR-017            Canal con acuse técnico ≠ canal con constancia humana
  REC-CAR-018            La acreditación es derivada, nunca persistida
  REC-CAR-019            fn_compilar_expediente, composición sin cálculo nuevo

TABLAS
  acciones_cobranza_envios
  acciones_cobranza_acuses

TIPOS (propuesta de catálogo — evaluar D-24 antes de crear)
  estado_acuse_t
  origen_acuse_t

FUNCIONES
  fn_acreditacion_accion
  fn_compilar_expediente

INVARIANTES
  I-C21 .. I-C25

PRERREQUISITOS
  PRQ-CAR-019            Webhooks de acuse del proveedor      ❌ no existe
  PRQ-CAR-020            Operador postal con guía rastreable  ❌ no existe
  PRQ-CAR-021            Versionado recuperable de plantillas ⚠️ parcial
  PRQ-CAR-022            subir-documento acepta envio_id      ⚠️ parcial

VERIFICACIONES JURÍDICAS
  VER-CAR-07             Constitución en mora en expensas comunes
  VER-CAR-08             Valor probatorio y habeas data de WhatsApp

RECALIFICACIONES
  VER-CAR-05             No bloqueante  →  BLOQUEANTE

IDEMPOTENCIA
  IDEM-05                Deduplicación de webhooks reenviados

GOLDEN CASES
  PH-C40 .. PH-C45
```

---

**FIN — CAR-07 ENMIENDAS PROPUESTAS**
**Pendiente de aprobación e integración en CAR_00_Guia_Oficial.md**
