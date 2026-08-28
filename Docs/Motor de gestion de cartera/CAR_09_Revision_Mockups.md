# AQUILA_SAAS — MOTOR DE GESTIÓN DE CARTERA

## CAR-09 · Revisión de los mockups

> **Los mockups son insumo de diseño, no norma.** El §0.2 del rector fija una
> jerarquía normativa de ocho niveles y los mockups no aparecen en ninguno:
> quedan por debajo de `CAR_00_Guia_Oficial.md`.
>
> **Regla de resolución:** donde un mockup contradice al rector, se corrige el
> mockup. Si de verdad se quiere lo que propone, el camino es **enmendar CAR-00
> primero** y después construir — nunca implementar contra el documento en
> silencio.
>
> Revisión del 2026-08-28 sobre 70 imágenes (`Casos de uso/Gestion de cartera/
> Gestion de cartera.zip`). Los datos de las capturas son ficticios: se evaluó
> estructura, relaciones y conceptos, **nunca las cifras**.

---

# 1. Los tres cajones

`[ARQ]` Todo hallazgo cae en uno de estos tres, y solo el segundo contiene
decisiones abiertas.

```text
CAJÓN 1  El documento ya decidió  →  se corrige el mockup, sin discusión
CAJÓN 2  El documento calla       →  aquí el mockup SÍ decide (su función)
CAJÓN 3  El documento necesita enmienda  →  tramitar como cambio al rector
```

---

# 2. Cajón 1 — Se corrige el mockup

## 2.1 Ocho etapas editables contra las cinco del §11.1

`[ARQ]` Los mockups definen ocho etapas **editables por el administrador**, con
orden arrastrable y botón «Nueva etapa»: Preventiva, Pre-Cobranza, Cobranza
Activa, Cobranza Especializada, Prejurídica, Jurídica, Jurídica Avanzada,
Post-Judicial.

CAR-00 §11.1 define **cinco**, ya construidas como enum `etapa_cobranza_t`
(`20260822330000`) con su tabla de transiciones permitidas (§11.3).

Adoptar el mockup implica migrar un enum sobre datos vivos y rehacer la máquina
de estados. Y lo más grave: **permitir que un administrador edite las etapas
rompe las transiciones que §11.3 enumera precisamente porque no son opinables.**

```text
RECOMENDACIÓN: núcleo fijo de cinco etapas; el administrador subdivide y
renombra lo que VE. "Cobranza Especializada" y "Jurídica Avanzada" son
matices de gestión, no estados jurídicos distintos.
```

## 2.2 Costas calculadas por el sistema — AP-03 sistemático

`[LEGAL]` Aparece en **cinco pantallas**: Expediente Jurídico, Casos Jurídicos,
Costas y Liquidaciones, Indicadores Jurídicos y Parámetros de Cartera. La más
explícita declara «Fuente de cálculo: Motor Financiero» para una liquidación que
incluye costas procesales y **agencias en derecho**.

Es el anti-patrón `AP-03` del propio §2.1. Las agencias en derecho las fija el
juez con tarifas del Consejo Superior de la Judicatura (CGP art. 366). El
esquema real ni siquiera lo admite: `costas_judiciales` exige `documento_fuente`
y `fecha_decision` en `NOT NULL` (`I-C11`).

```text
REGLA ÚNICA, SIN EXCEPCIONES:
  Las costas se REGISTRAN cuando existe auto que las liquida.
  Nunca se estiman. Nunca entran en la pretensión. Nunca las calcula un motor.
```

Corolario: «Costas estimadas» no puede sumarse al «Total pretensión» del
expediente. La pretensión sale de la certificación del art. 48 y de nada más.

## 2.3 Anatocismo activado

`[VERIFICAR]` En Parámetros de Cartera, la matriz de composición de obligaciones
marca **«Intereses de mora → Genera intereses: Sí»**. Eso es anatocismo, y
`VER-CAR-02` lo tiene marcado como bloqueante porque la doctrina mayoritaria lo
niega. Queda en **No** y bloqueado hasta concepto jurídico.

## 2.4 El multiplicador confundido con una tasa

`[LEGAL]` La tarjeta «Interés por defecto: 1,50% mensual efectivo» confunde el
**multiplicador** del art. 30 —una vez y media el interés bancario corriente—
con una **tasa** del 1,5% mensual. Son cosas distintas y el nombre invita a que
alguien lo suba «porque el tope es 1,5».

```text
Partir en dos campos que no se puedan confundir:
  · el índice certificado (IBC), con su resolución fuente
  · el multiplicador legal (1.5), que no es editable
```

## 2.5 Cinco tasas de mora simultáneas

`[LEGAL]` La pantalla de Políticas de Intereses y Mora lista cinco políticas
vigentes en paralelo con «reglas de prioridad» para elegir entre ellas. El tope
del art. 30 **no es una política seleccionable**: es un techo que siempre
aplica. La asamblea puede fijar menos, nunca más, y no hay dos vigentes para el
mismo hecho.

Añádase que la ficha llama **«IBR»** al índice citando como fuente a la
Superfinanciera: el IBR es la tasa interbancaria de referencia; el Interés
Bancario Corriente es otro y es el del art. 30.

## 2.6 «Las actuaciones actualizan la deuda»

`[ARQ]` Pie de página de Casos Jurídicos. Una actuación procesal **no puede**
modificar la deuda: vive en `cargos`/`pagos`, y `REC-CAR-003` prohíbe que este
bloque escriba en `cargos`. Debe decir que actualizan el estado **del caso**.

## 2.7 Contradicción de umbral

`[NEGOCIO]` Acciones Automáticas dispara la alerta de remisión jurídica a los
**30 días** de vencido. Centro de Escalamiento exige **91 días de mora, 3
gestiones y una promesa incumplida** para la misma transición. La segunda es la
defendible.

## 2.8 Tipos de proceso fuera de dominio

`[LEGAL]` Entre los tipos aparecen **restitución de inmueble** (que es de
arrendamiento, no de expensas), **ejecutivo hipotecario** (exige hipoteca a
favor de la copropiedad) y **proceso monitorio** — que es para obligaciones
*sin* título ejecutivo: teniendo la certificación del art. 48, usarlo sería
renunciar al título.

```text
DECISIÓN DE ALCANCE PENDIENTE: ¿el producto es propiedad horizontal, o
administración inmobiliaria general (incluido arrendamiento)?
```

---

# 3. Cajón 2 — Aquí el mockup decide

## 3.1 Destinatario múltiple  ← RESOLVIÓ EL BLOQUEANTE

`[ARQ]` **Ya implementado el 2026-08-28.** El paso «Destinatarios» de *Nueva
Acción de Cobranza* muestra al propietario marcado como principal y a la
copropietaria, ambos seleccionables con su contacto. CAR-00 nunca resolvió esto
y era lo que tenía el motor detenido.

Resuelto con una acción por destinatario unidas por `grupo_envio_id`
(`20260905110000`) — conserva una evidencia por persona, que es lo que sirve en
juicio. Las cuatro reglas de negocio están documentadas en la cabecera de
`packages/liquidation-engine/src/cartera-destinatarios.ts`.

## 3.2 Control de términos judiciales

`[NEGOCIO]` *Actuaciones Jurídicas* lleva días restantes por actuación, vencidas
y porcentaje de cumplimiento de términos. Los términos vencidos son la primera
causa de pérdida de un ejecutivo. **CAR-00 no lo contempla en ninguna sección y
es diferenciador puro.** Conservar.

## 3.3 Prerrequisitos de escalamiento

`[NEGOCIO]` *Aprobaciones* y *Centro de Escalamiento* convierten «¿ya podemos
demandar a este?» en una checklist verificable —vencidas ≥ 2, mora ≥ 91 días,
gestiones ≥ 3, promesa incumplida ≥ 1, documentos completos— con evidencia
enlazada por fila. Es la consulta recurrente al abogado, resuelta. Conservar tal
cual.

## 3.4 Asistente de remisión a cobro jurídico

`[NEGOCIO]` La mejor pantalla del set: cinco pasos que verifican seis requisitos
con evidencia y **generan la certificación del art. 48 dentro del propio flujo**,
como paso obligatorio.

```text
LE FALTA UN SÉPTIMO REQUISITO, y es el importante:
que las gestiones previas hayan sido ENTREGADAS, no solo ejecutadas (§34).
```

## 3.5 Tabla de tramos

`[ARQ]` Cada fila mapea tramo de mora → clasificación → nivel de riesgo → etapa
→ estrategia → acciones automáticas, versionada y con versiones anteriores
inalterables. Es §9.1 convertido en una pantalla legible y respeta
`REC-CAR-006`. Conservar.

## 3.6 Provisión de cartera

`[GAP]` El tablero muestra «Cobertura de provisión». El deterioro/provisión es
concepto contable y conecta con el bloque PC. **CAR-00 no lo menciona en ninguna
de sus 33 secciones.** Decidir si el motor de cartera alimenta la provisión
contable o solo la lee.

## 3.7 Regla de incumplimiento de acuerdos

`[CONFIG]` Circulan dos versiones: «2 cuotas consecutivas o 3 alternas» (mockup)
y «2 consecutivas o 1 con más de 30 días» (§12.5). Elegir una y **estructurarla**
— hoy va como texto libre en observaciones, con un botón «Incumplir acuerdo»
suelto que debería ser una regla con override justificado.

---

# 4. Cajón 3 — El rector necesitaba enmienda

`[ARQ]` **Ya integradas el 2026-08-28** (ver `CAR_07_Enmiendas_Propuestas.md`):

```text
ENM-CAR-01  §34 Expediente probatorio (sección nueva)
ENM-CAR-02  §33.5 criterio de terminación → dos preguntas
ENM-CAR-03  §9.2 requerimiento_formal → [NEGOCIO] + VER-CAR-07
ENM-CAR-04  §3.5 prescripción → bloqueante
```

Origen: los mockups ya pensaban en evidencia («Evidencia obligatoria: Sí»,
pestaña «Evidencias», alertas de notificación pendiente) mientras el rector solo
guardaba `contenido_hash`, que no es prueba sin el original.

---

# 5. Inconsistencias transversales

## 5.1 Cuatro definiciones de antigüedad

```text
Tramos de Antigüedad   8 tramos (0, 1-15, 16-30, 31-60, 61-90, 91-120,
                                 121-180, 181+)
Centro de Cartera      7 tramos (1-30 … 181-360, +360)
Parámetros de Cartera  4 tramos (0-30, 31-60, 61-90, 90+) códigos C0-C4
Cuenta Corriente       3 tramos (0-30, 31-60, >60)
```

`[ARQ]` Una sola política versionada debe alimentar las cuatro vistas, o cada
pantalla dirá una verdad distinta sobre el mismo inmueble.

## 5.2 Canales prometidos vs. integrados

`[GAP]` *Canales y Notificaciones* configura SendGrid, Twilio, AWS SES,
Firebase y Telegram. Lo integrado y probado es **Brevo, solo SMS**; el correo
está bloqueado por verificación de remitente y WhatsApp no tiene proveedor. La
pantalla promete seis canales activos donde hay uno.

## 5.3 Canal físico sin soporte

`[GAP]` Varias pantallas ofrecen «correo certificado» y «Email + Físico». No hay
integración con ningún operador postal (`PRQ-CAR-020`), y hasta el 2026-08-28
`terceros` ni siquiera tenía dirección de notificación (`GAP-CAR-012`, resuelto
en `20260905100000`).

## 5.4 Actuaciones «Automáticas (Motor)»

`[GAP]` El detalle de una notificación personal declara origen automático. El
sistema no puede saber eso por sí solo: o es captura manual, o exige integración
con la **Rama Judicial**.

```text
OPORTUNIDAD: consultar el estado de los procesos y traer las actuaciones
sería un diferenciador real, no un adorno.
```

## 5.5 Aprobación interna confundida con judicial

`[LEGAL]` *Costas y Liquidaciones* somete la liquidación del crédito a un flujo
de aprobación **interno** (Director Jurídico). La liquidación del crédito
(CGP art. 446) la aprueba **el juzgado**. El sistema puede prepararla, nunca
aprobarla.

## 5.6 Interés congelado en el plan de cuotas

`[CONFIG]` El plan de un acuerdo reparte capital e intereses fijos por cuota, lo
que asume que el interés deja de causarse al firmar. §12.5 dice lo contrario
salvo configuración expresa. Es una decisión legítima, pero tiene que ser un
interruptor visible, no una consecuencia de cómo se dibujó la tabla.

## 5.7 Condonación como texto libre

`[LEGAL]` «Se acuerda condonar 100% de intereses de mora» va escrito en
observaciones. §12.6 exige **acta de referencia y aprobación identificada**,
porque condonar corresponde a la asamblea y no al administrador. Debe ser campo
estructurado.

## 5.8 El expediente empieza tarde

`[ARQ]` La línea de tiempo del *Expediente Jurídico* arranca en la remisión a
cobro jurídico. Los meses previos de gestión —cada recordatorio, cada
requerimiento, cada promesa incumplida, con sus acuses— no aparecen en ninguna
pestaña.

```text
El expediente que sostiene un ejecutivo empieza donde empezó la MORA,
no donde empezó el proceso. Tal como está, el abogado sigue teniendo que
pedir esa historia aparte — que es exactamente lo que se quiere eliminar.
```

## 5.9 Vigencia inventada de la certificación

`[NEGOCIO]` Una alerta dice «Certificación válida, vigente hasta…» con seis
meses. **No hay norma que fije vigencia a la certificación del art. 48.** Es una
decisión de negocio y debe etiquetarse como tal.

---

# 6. Qué falta dibujar

`[ARQ]` Dos pantallas que el objetivo del producto exige y que **ningún mockup
contempla**:

```text
1. EL EXPEDIENTE PROBATORIO
   Vista por inmueble con la línea de tiempo completa —cargo, vencimiento,
   cada notificación con su acuse, cada promesa, cada acuerdo— exportable
   como PDF paginado y numerado, listo para anexar. Es lo que hoy cuesta
   honorarios. Ver §34.5.

2. LA SIMULACIÓN PREVIA
   "Esta corrida va a enviar 43 mensajes a 38 inmuebles, ver el detalle."
   El backend ya lo soporta (modo:'simulacion', §18.1); falta exponerlo.
   Un administrador que puede revisar antes de enviar acepta mucha más
   automatización que uno que no.
```

---

**FIN — CAR-09 REVISIÓN DE MOCKUPS**
