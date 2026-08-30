# AQUILA_SAAS — MOTOR DE GESTIÓN DE CARTERA

## CAR-10 · Consulta jurídica única

> **Bloque 26 de `CAR_08_Roadmap_Pendiente.md`.** Documento destinado a un
> abogado externo. Es el único insumo de la ruta crítica que no depende del
> equipo de desarrollo y con el tiempo de respuesta más incierto: por eso se
> envía antes que cualquier otra cosa (`ENM-CAR-04`, §24.3 del rector).
>
> Este documento **no es norma**. Las respuestas que se reciban sí lo serán, y
> se integran a `CAR_00_Guia_Oficial.md` cerrando cada `VER-CAR-*`.

---

# 1. Para el abogado consultado

## 1.1 Qué es el sistema y por qué se consulta

Se está construyendo el módulo de gestión de cartera de un software de
administración de propiedad horizontal en Colombia. El módulo calcula la deuda
por expensas comunes, liquida intereses de mora, clasifica la cartera por
antigüedad, ejecuta acciones de cobranza escalonadas y prepara el expediente
para el cobro ejecutivo del art. 48 de la Ley 675 de 2001.

El objetivo declarado del producto es que el módulo **opere de forma
automatizada, sin asesoría y gestión permanente de un abogado**. Precisamente
por eso las decisiones jurídicas deben quedar resueltas **una sola vez, por
escrito y de forma explícita**: el sistema no puede improvisarlas en cada
corrida, y nadie las estará supervisando después.

## 1.2 Regla de diseño que motiva esta consulta

El sistema tiene una regla interna que prohíbe implementar con valores
inventados:

```text
Mientras una incertidumbre jurídica marcada como bloqueante esté abierta,
la funcionalidad que depende de ella NO se implementa con un valor por
defecto. Se detiene.
```

Nueve puntos están abiertos. Cinco son los del §2 (los que el propio
documento rector ordenó llevar en una sola consulta). Tres más, en §3, ya
estaban marcados como bloqueantes y se incluyen aquí porque llevarlos en el
mismo envío no tiene costo adicional.

`[ARQ]` `CJ-9` y las preguntas `CJ-2.5`, `CJ-2.6` y `CJ-3.6` se agregaron el
2026-08-29, al contrastar esta consulta contra la auditoría externa
`PROMPT-CAR-JUR-001`. Son puntos que esa auditoría da por resueltos —o por
ya construidos— y que este documento no estaba preguntando.

## 1.3 Forma de respuesta que el sistema necesita

`[ARQ]` No basta con una opinión general. Cada respuesta debe permitir
escribir código o texto sin interpretación posterior. Concretamente:

| Si la pregunta es sobre | La respuesta debe contener |
|---|---|
| Un cálculo | La **fórmula exacta**, con el orden de las operaciones |
| Un plazo | El **término**, la **fecha de inicio del cómputo** y qué lo suspende o interrumpe |
| Una afirmación en un documento al deudor | Si puede afirmarse **sí o no**, y en caso negativo la redacción alternativa correcta |
| Un canal de comunicación | Si es **admisible como prueba**, para qué actos, y qué debe conservarse |
| Una facultad de la copropiedad | Si requiere **reglamento, acta de asamblea, o nada**, y el límite |

Se agradece indicar en cada punto la **norma o jurisprudencia de respaldo**, y
señalar expresamente cuando la respuesta sea **doctrina discutida** y no
posición pacífica: el sistema puede convivir con una decisión conservadora,
pero no con una ambigüedad silenciosa.

---

# 2. Consultas principales

## CJ-1 — Conversión de la tasa de referencia y aplicación del multiplicador

`[LEGAL]` **Cierra `VER-CAR-01`. Bloqueante. Es la más urgente de todas.**

### Contexto fáctico

El art. 30 de la Ley 675 de 2001 permite cobrar intereses de mora sobre
expensas comunes hasta **una y media veces el interés bancario corriente**. La
Superintendencia Financiera certifica el IBC mediante resolución mensual,
expresado como **tasa efectiva anual** y **discriminado por modalidad de
crédito** (consumo y ordinario, microcrédito, consumo de bajo monto).

El sistema liquida mora sobre saldos de capital vencido con corte diario y
presentación mensual. Necesita una tasa periódica, no una anual.

### Preguntas

1. **Orden de las operaciones.** ¿El multiplicador 1.5 se aplica sobre la tasa
   efectiva anual certificada y el resultado se convierte a periódica? ¿O se
   convierte primero el IBC a su equivalente periódica y sobre esa se aplica el
   1.5? Los dos caminos dan resultados distintos y el sistema debe elegir uno.

2. **Método de conversión.** ¿La conversión de efectiva anual a mensual debe
   hacerse por **equivalencia compuesta** —`(1 + EA)^(1/12) − 1`— o por
   **división nominal** —`EA / 12`? Si la respuesta depende de cómo esté
   redactado el reglamento de propiedad horizontal, indíquese qué redacción
   habilita cada método.

3. **Modalidad aplicable.** ¿Cuál de las modalidades certificadas por la
   Superfinanciera corresponde a la obligación por expensas comunes?

4. **Techo de usura.** ¿El límite del art. 305 del Código Penal opera como
   techo adicional e independiente del 1.5×, de modo que deba aplicarse el
   menor de los dos? ¿O el 1.5× de la Ley 675 ya es el único techo relevante
   en esta materia?

5. **Base de días.** Para el cómputo diario de la mora, ¿debe usarse año de 365
   días, de 360, o mes comercial de 30? El sistema hoy lo tiene configurable y
   necesita saber cuál es el defecto defendible ante un juez.

### Por qué bloquea

`[ARQ]` El sistema **registra** el valor mensual de la tasa en lugar de
derivarlo por fórmula, precisamente para no inventar esta conversión. Pero el
cálculo de mora ya está construido y en uso sobre un valor cuya derivación no
está validada. **Esta es la deuda técnica más cara del módulo**: si la
respuesta contradice lo asumido, hay que recalcular liquidaciones ya emitidas.

---

## CJ-2 — Anatocismo y orden de imputación del pago

`[LEGAL]` **Cierra `VER-CAR-02`. Bloqueante.**

### Contexto fáctico

El sistema causa intereses de mora **únicamente sobre el capital vencido**.
Los intereses causados y no pagados se acumulan como saldo, pero **no generan
intereses a su vez**. Esta decisión se tomó siguiendo la que se entiende es la
doctrina mayoritaria, y se pide confirmarla o corregirla.

Por otra parte, cuando entra un pago parcial, el sistema decide a qué lo
imputa. Hoy el orden es **configurable por copropiedad**.

Ocurre también el caso inverso: que un pago exceda lo exigible y quede un
saldo a favor del inmueble. Hoy, cuando la copropiedad activa esa opción, el
sistema consume ese saldo contra la mora de capital pendiente empezando por
la más antigua, de modo que un crédito originado en un periodo puede terminar
compensando la mora de un periodo posterior.

### Preguntas

1. **Capitalización.** ¿Es correcto que los intereses de mora sobre expensas
   comunes **no admiten capitalización**? Si existe alguna vía para pactarla
   —reglamento de propiedad horizontal, decisión de asamblea, aplicación
   supletiva del art. 886 del Código de Comercio— indíquese cuál y bajo qué
   requisitos.

2. **Orden de imputación.** ¿Rige imperativamente el art. 1653 del Código
   Civil, que imputa primero a intereses y luego a capital? ¿O la asamblea o el
   reglamento pueden fijar un orden distinto —por ejemplo, capital primero,
   que favorece al deudor porque reduce la base de causación?

3. **Antigüedad.** Dentro de una misma categoría, ¿el pago debe imputarse
   obligatoriamente a la cuota **más antigua** primero? ¿Puede el deudor elegir
   a cuál cuota imputa su pago, y esa elección obliga a la copropiedad?

4. **Descuentos por pronto pago.** Si la copropiedad ofrece un descuento por
   pago oportuno, ¿su pérdida por mora tiene naturaleza de sanción sujeta a
   límite, o es simplemente el precio ordinario sin el beneficio?

5. **Saldos a favor.** Cuando un pago excede lo exigible y queda un saldo a
   favor del inmueble, ¿puede la copropiedad aplicarlo automáticamente a
   obligaciones de otros periodos —incluidos periodos **posteriores** a aquel
   en que se originó el crédito—, o debe mantenerse como crédito disponible
   hasta que el deudor disponga otra cosa? ¿Cambia la respuesta si esa
   aplicación automática está prevista en el reglamento o aprobada por la
   asamblea? ¿Y si el saldo termina aplicándose a intereses de mora causados
   con posterioridad a la fecha del pago?

6. **Alcance de la instrucción del deudor.** La pregunta 3 se refiere a la
   elección de *cuota*. Además de eso, ¿puede el deudor instruir válidamente
   a qué **concepto** se imputa su pago —por ejemplo, exigir que se aplique a
   capital antes que a intereses—, y esa instrucción obliga a la copropiedad?
   Si obliga, ¿debe constar por escrito, y qué ocurre cuando contradice el
   orden fijado en el reglamento? Si no obliga, ¿puede la copropiedad
   aceptarla voluntariamente, y ese consentimiento requiere un acto formal?

### Por qué bloquea

Determina la base sobre la que se causa el interés y el destino de cada peso
recibido. Un error aquí produce cobros excesivos de forma sistemática y
silenciosa.

---

## CJ-3 — Prescripción: término, cómputo, interrupción y retención de prueba

`[LEGAL]` **Cierra `VER-CAR-05`. Bloqueante — recalificado por `ENM-CAR-04`.**

### Contexto fáctico

Este punto **estaba clasificado como no bloqueante** mientras se asumía que un
abogado supervisaría la cartera. Al retirar esa supervisión permanente, nadie
vigila la prescripción: si el sistema no alerta, la copropiedad pierde el
cobro sin que ninguna persona se entere. Por eso se recalificó.

El sistema debe hacer tres cosas con esta respuesta: **alertar** antes de que
una obligación prescriba, decidir cuándo una cartera es **incobrable**, y saber
**cuánto tiempo conservar la evidencia** de las gestiones de cobro.

### Preguntas

1. **Término.** ¿Cuál es el término de prescripción de la obligación por
   expensas comunes? ¿Se distingue entre la acción ordinaria y la ejecutiva, y
   entre la existencia del título y la exigibilidad?

2. **Cómputo.** ¿El término corre **de forma independiente para cada cuota
   mensual** desde su respectivo vencimiento? ¿O existe algún supuesto de
   unidad de la obligación que desplace el cómputo?

3. **Actos interruptivos.** ¿Cuáles de estos interrumpen la prescripción, y
   cuáles no?
   - Comunicación escrita de cobro remitida al deudor
   - Requerimiento formal con acuse de recibo
   - Presentación de la demanda ejecutiva
   - Notificación del auto de mandamiento de pago al demandado
   - Reconocimiento expreso de la deuda por el deudor
   - **Suscripción de un acuerdo de pago**
   - **Abono parcial** sin suscripción de acuerdo

4. **Acuerdo de pago.** ¿La suscripción de un acuerdo de pago interrumpe la
   prescripción, produce novación, o ninguna de las dos? ¿Qué ocurre con el
   cómputo cuando el acuerdo se **incumple**: se reanuda desde cero, desde el
   incumplimiento, o continúa el término original?

5. **Retención de la prueba.** ¿Durante cuánto tiempo debe conservarse la
   evidencia de las gestiones de cobro —comunicaciones enviadas, acuses,
   guías— para que siga siendo útil? El sistema necesita una fórmula del tipo
   *fecha de extinción de la obligación + término + margen*, y mientras no la
   tenga **no purga absolutamente nada**.

6. **Límite máximo de conservación.** La pregunta anterior busca el **mínimo**
   probatorio. ¿Existe además un **máximo** derivado de la protección de datos
   personales, cumplido el cual conservar esa evidencia —comunicaciones,
   números de contacto, historial de mora de una persona identificada— deja de
   ser lícito? Hoy el sistema no purga nada, y esa política indefinida podría
   ser en sí misma un incumplimiento. Si ambos plazos existen y no coinciden,
   ¿cuál prevalece, y qué debe hacerse con el dato en el intervalo:
   anonimizarlo, bloquear su acceso, conservar solo una huella?

### Por qué bloquea

Sin el término no hay alerta posible; sin la lista de actos interruptivos, el
sistema no sabe qué gestión reinicia el reloj y podría alertar sobre
obligaciones vivas o callar sobre obligaciones que están por perderse.

---

## CJ-4 — Mora automática y qué puede afirmar una comunicación de cobro

`[LEGAL]` **Cierra `VER-CAR-07`. No bloquea la construcción; sí bloquea el
texto de las plantillas.**

### Contexto fáctico

El sistema envía comunicaciones escalonadas al deudor. Una de ellas se
denomina internamente **requerimiento formal** y es la comunicación de mayor
peso probatorio previa al escalamiento prejurídico.

Se detectó un riesgo: las plantillas podrían afirmar ante el deudor que la
comunicación **lo constituye en mora**. Si las expensas son obligación a plazo
con mora automática, esa afirmación sería jurídicamente falsa, y estaría
enviándose de forma masiva y automatizada, sin revisión humana previa.

### Preguntas

1. **Naturaleza de la mora.** ¿La obligación por expensas comunes es una
   obligación a plazo en la que la mora opera **por el solo vencimiento**
   (art. 1608 num. 1 del Código Civil)? ¿O requiere requerimiento o
   reconvención judicial?

2. **Fuente del plazo.** ¿La fecha de vencimiento fijada en el reglamento de
   propiedad horizontal, o por decisión de asamblea, constituye "plazo
   estipulado" suficiente para ese efecto? ¿Debe estar en el reglamento o basta
   el acta?

3. **Redacción admisible.** Si la mora es automática, ¿qué **puede** afirmar
   lícitamente la comunicación de cobro respecto de su propio efecto jurídico?
   Se solicita, si es posible, la **frase modelo** correcta, porque irá en una
   plantilla que se envía sin revisión humana.

4. **Comunicación previa exigible.** ¿Existe alguna comunicación previa
   obligatoria antes de iniciar el proceso ejecutivo del art. 48 de la Ley 675,
   o antes de remitir el caso a un abogado? ¿El reglamento puede imponerla y
   volverla exigible?

5. **Afirmaciones de riesgo.** ¿Hay afirmaciones que una comunicación de cobro
   automatizada **no deba** hacer nunca —anuncio de reporte a centrales de
   riesgo, de restricción de servicios, de publicación del nombre, de embargo
   inminente— por constituir constreñimiento indebido o práctica abusiva?

### Por qué importa

`[NEGOCIO]` Es el punto donde el producto puede causar un daño reputacional
concreto: una afirmación falsa, repetida automáticamente sobre cientos de
deudores, es un frente de reclamación mucho más grande que un error de cálculo.

---

## CJ-5 — WhatsApp como canal de notificación de cobro

`[LEGAL]` **Cierra `VER-CAR-08`. Bloqueante para usar WhatsApp en acciones con
efecto jurídico.**

### Contexto fáctico

El sistema puede notificar por correo electrónico, SMS, WhatsApp, carta física
con operador postal, llamada y visita. Cada canal se clasifica según si sirve
para **acreditar** una notificación o solamente para **gestionar**.

Los números de celular de los residentes fueron capturados, en muchos casos,
para finalidades distintas del cobro: contacto de portería, emergencias,
convocatoria a asamblea.

### Preguntas

1. **Valor probatorio.** ¿Un mensaje de WhatsApp sirve para acreditar ante un
   juez que se comunicó al deudor un requerimiento de cobro? ¿Se le aplica el
   régimen de mensajes de datos de la Ley 527 de 1999?

2. **Qué conservar.** Para que ese valor probatorio se materialice, ¿qué debe
   conservar el sistema? ¿Basta el acuse de entrega del proveedor, o se
   requiere además el contenido íntegro, la identificación del número de
   destino y su vínculo acreditado con la persona?

3. **Acuse de lectura.** ¿La diferencia entre *entregado* y *leído* tiene
   consecuencia jurídica, o el envío acreditado es suficiente?

4. **Habeas data.** ¿Puede usarse para gestión de cobro un número obtenido
   originalmente para otra finalidad? ¿Se requiere autorización específica bajo
   la Ley 1581 de 2012, o el cobro de una obligación derivada de la relación de
   propiedad horizontal está cubierto por la finalidad original?

5. **Alcance por tipo de acto.** ¿WhatsApp es admisible para el requerimiento
   formal y el aviso prejurídico, o debe reservarse para gestión informativa,
   exigiendo canal con acuse formal para los actos de efecto jurídico?

### Por qué bloquea

Determina si se construye el canal, y para qué acciones queda habilitado. Es
una decisión de arquitectura, no solo de configuración.

---

# 3. Consultas adicionales incluidas en el mismo envío

`[ARQ]` Estas tres ya estaban marcadas como bloqueantes antes de esta
consulta. No formaban parte del paquete de `ENM-CAR-04`, pero incluirlas aquí
no tiene costo y evita una segunda ronda con el mismo abogado.

## CJ-6 — Gastos de cobranza extrajudicial

`[LEGAL]` **Cierra `VER-CAR-03`.**

1. ¿Puede la copropiedad cobrar al deudor **gastos de cobranza prejurídica**?
2. Si puede, ¿bajo qué límite? No se conoce un porcentaje legal universal.
3. ¿Requiere previsión en el reglamento, decisión de asamblea, o ambas?
4. ¿Deben corresponder a un gasto **realmente incurrido y acreditable**, o
   admiten tarifa fija?
5. ¿Se distinguen de las costas judiciales, que el sistema tiene expresamente
   prohibido calcular o estimar por su cuenta?

## CJ-7 — Publicación de morosos

`[LEGAL]` **Cierra `VER-CAR-04`.**

1. El parágrafo del art. 30 de la Ley 675 frente a la Ley 1581 de 2012: ¿qué
   puede publicarse efectivamente?
2. ¿**Qué datos** —nombre, número de inmueble, monto, todos, ninguno?
3. ¿**Dónde** —cartelera interna, circular a copropietarios, acta de asamblea?
4. ¿**Por cuánto tiempo**, y qué obliga a retirar la publicación?
5. ¿Requiere aviso previo al deudor y plazo para pagar antes de publicar?

## CJ-8 — Transferencia de dominio y deuda anterior

`[LEGAL]` **Cierra `VER-CAR-06`.**

1. ¿El adquirente de un inmueble responde por las expensas causadas **antes**
   de la transferencia? ¿Con qué alcance —solidaridad, deuda propter rem,
   limitada al valor del inmueble?
2. ¿Cambia si el adquirente lo hizo en remate judicial?
3. ¿Contra quién debe dirigirse el cobro de la deuda anterior: contra el
   anterior propietario, el actual, o ambos?
4. Cuando hay **varios copropietarios** de un mismo inmueble, ¿la obligación es
   solidaria? ¿Puede cobrarse el total a cualquiera de ellos?

`[ARQ]` La respuesta al punto 4 confirma o corrige una decisión ya
implementada: el sistema notifica a **todos** los copropietarios vigentes, uno
por uno, sin dividir el monto entre ellos.

## CJ-9 — Finalidad del dato de contacto en los canales ya en operación

`[LEGAL]` **No cierra ningún `VER-CAR` existente. A diferencia de todo lo
demás en este documento, afecta funcionalidad que ya está en producción.**

### Contexto fáctico

La pregunta 4 de `CJ-5` plantea el problema de la finalidad del dato dentro
del bloque de WhatsApp, que hoy está bloqueado y no se usa. Pero el sistema
**ya envía comunicaciones de cobro por SMS y por correo electrónico**, sobre
los mismos datos de contacto y con la misma duda: números y correos que en
muchos casos fueron capturados para portería, emergencias o convocatoria a
asamblea.

Aquí no se trata, entonces, de una funcionalidad detenida a la espera de
concepto. Es tráfico real que ya está saliendo.

### Preguntas

1. **Base jurídica.** ¿El cobro de una obligación derivada de la relación de
   propiedad horizontal está cubierto por la finalidad original con que se
   capturó el dato de contacto? ¿O requiere autorización específica bajo la
   Ley 1581 de 2012?

2. **Diferencia por canal.** ¿La respuesta cambia entre correo electrónico,
   SMS, llamada telefónica y carta física, o es la misma para todos?

3. **Datos ya capturados.** Si se requiere autorización específica, ¿qué debe
   hacerse con los contactos que no la tienen: dejar de usarlos, solicitarla
   de forma retroactiva, o existe una base jurídica alternativa —ejecución de
   la relación derivada del régimen de propiedad horizontal, interés
   legítimo— que la sustituya?

4. **Registro exigible.** ¿Qué debe conservar el sistema para demostrar la
   licitud del uso: la autorización, su fecha, el texto exacto aceptado, la
   finalidad declarada, el canal por el que se otorgó?

   `[ARQ]` **Infraestructura construida (2026-08-29), sin cerrar la
   pregunta.** `terceros_contacto_procedencia` (`20260908150000`) ya registra
   HECHO: qué campo (email/teléfono), qué valor, de qué origen declarado
   (portería, asamblea, actualización directa por el tercero, importación
   inicial, documento/contrato, otro — catálogo `ORIGEN_CONTACTO_TERCERO`),
   quién y cuándo. Se alimenta opcionalmente desde el modal de tercero
   cuando el usuario cambia email/teléfono. Es evidencia, no una respuesta:
   no exige nada para despachar por ningún canal (`resolverDestinatarios()`
   no la consulta) y no decide si el origen declarado constituye base
   jurídica suficiente — eso sigue siendo exactamente esta pregunta 4. Si el
   abogado exige campos que hoy no están (ej. texto exacto aceptado, si
   hubo autorización explícita), la tabla se ajusta; lo construido no
   presupone la respuesta.

5. **Contacto de un tercero distinto del obligado.** Cuando el dato
   corresponde a un arrendatario, apoderado o familiar y no al propietario
   deudor, ¿puede usarse para gestión de cobro dirigida a este último?

### Por qué importa

`[NEGOCIO]` Es el único punto de esta consulta cuyo efecto no es "no
construir" sino **"dejar de enviar"**. Si la respuesta es restrictiva, obliga
a corregir un canal en operación y a revisar lo ya enviado.

---

# 4. Anexo — Cómo se usará cada respuesta

`[ARQ]` Se incluye para que el abogado dimensione el efecto de cada punto.

| Consulta | Qué se construye o corrige con la respuesta |
|---|---|
| CJ-1 | Fórmula de liquidación de mora. Posible recálculo de lo ya liquidado |
| CJ-2 | Base de causación y algoritmo de imputación de pagos |
| CJ-3 | Alerta automática de prescripción, castigo de cartera, política de purga de evidencia |
| CJ-4 | Texto de todas las plantillas de comunicación al deudor |
| CJ-5 | Habilitación o descarte del canal WhatsApp por tipo de acción |
| CJ-6 | Módulo de gastos de cobranza — hoy detenido |
| CJ-7 | Acción de publicación de morosos — hoy bloqueada en el catálogo |
| CJ-8 | Reglas de responsabilidad ante cambio de propietario y copropiedad múltiple |
| CJ-9 | Licitud del uso de los datos de contacto ya capturados, en los canales que hoy despachan |

---

# 5. Registro de respuestas

`[ARQ]` Se diligencia al recibir el concepto. Cerrar un `VER-CAR-*` exige
editar `CAR_00_Guia_Oficial.md` §3.5 y dejar el rastro aquí.

| Consulta | `VER-CAR` | Fecha de respuesta | Estado | Integrado en el rector |
|---|---|---|---|---|
| CJ-1 | `VER-CAR-01` | — | ⧗ Abierto | — |
| CJ-2 | `VER-CAR-02` | — | ⧗ Abierto | — |
| CJ-3 | `VER-CAR-05` | — | ⧗ Abierto | — |
| CJ-4 | `VER-CAR-07` | — | ⧗ Abierto | — |
| CJ-5 | `VER-CAR-08` | — | ⧗ Abierto | — |
| CJ-6 | `VER-CAR-03` | — | ⧗ Abierto | — |
| CJ-7 | `VER-CAR-04` | — | ⧗ Abierto | — |
| CJ-8 | `VER-CAR-06` | — | ⧗ Abierto | — |
| CJ-9 | *(sin asignar)* | — | ⧗ Abierto | — |

**Datos del concepto recibido** (diligenciar):

```text
Abogado / firma:
Tarjeta profesional:
Fecha de la consulta:
Fecha del concepto:
Archivo del concepto:
```

---

**FIN — CAR-10 CONSULTA JURÍDICA ÚNICA**
