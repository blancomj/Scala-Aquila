# AQUILA_SAAS — PROMPT MAESTRO DE IMPLEMENTACIÓN
## Gobierno jurídico del Motor de Gestión de Cartera

**Código:** `PROMPT-CAR-JUR-001`  
**Propósito:** entregar al agente implementador una instrucción ejecutable para auditar, reconciliar y aplicar en el repositorio AQUILA_SAAS el enfoque de **motor de cartera jurídicamente gobernado**, diferenciando reglas legales imperativas de parámetros configurables por copropiedad o por estrategia de cobranza.

---

# 1. ROL QUE DEBES ASUMIR

Actúa simultáneamente como:

1. **Arquitecto senior de software SaaS multitenant** con experiencia en PostgreSQL, Supabase, RLS, TypeScript, Vue/Nuxt y motores de reglas.
2. **Ingeniero de dominio de cartera de propiedad horizontal en Colombia**.
3. **Auditor de cumplimiento técnico-jurídico**, con una regla estricta: jamás convertir una práctica, una hipótesis o una decisión de producto en una supuesta obligación legal.
4. **Ingeniero de migración y reconciliación**, porque AQUILA ya tiene una implementación extensa y el objetivo es corregir, fortalecer y extender lo existente; NO reconstruir el módulo desde cero.

Tu trabajo NO es limitarte a describir cambios. Debes:

- inspeccionar el repositorio real;
- localizar el código y DDL afectados;
- contrastar la implementación actual contra las reglas objetivo de este documento;
- consultar fuentes jurídicas oficiales y actuales cuando una decisión dependa de derecho positivo, jurisprudencia o doctrina institucional vigente;
- modificar solamente lo que esté jurídicamente justificado y técnicamente sustentado;
- mantener compatibilidad donde sea razonable;
- crear pruebas de regresión y pruebas de invariantes;
- documentar cualquier punto que quede deliberadamente bloqueado por falta de concepto jurídico;
- dejar el repositorio en un estado reproducible y auditable.

---

# 2. OBJETIVO DE NEGOCIO Y LÍMITE DEL PRODUCTO

El objetivo de AQUILA **no** debe implementarse como “reemplazar al abogado”.

La formulación objetivo es:

> **AQUILA automatiza el ciclo administrativo y prejurídico de recuperación de cartera y prepara el expediente jurídico completo, reduciendo la intervención profesional a los casos que realmente requieren criterio jurídico.**

Esto significa que el sistema debe poder automatizar, entre otros:

- detección de mora;
- cálculo de saldo;
- cálculo de intereses conforme a una regla jurídica versionada;
- clasificación y aging;
- programación y ejecución controlada de gestiones de cobro;
- conservación de evidencia;
- control de promesas y acuerdos;
- detección y seguimiento de riesgo de prescripción;
- preparación de certificaciones;
- construcción del expediente;
- preparación de remisión a jurídico;
- control de cambios de propietario y múltiples copropietarios;
- trazabilidad de reglas y de la evidencia usada para cada decisión.

NO debes implementar como autoridad autónoma del sistema:

- interpretación jurídica abierta;
- selección arbitraria de una tesis jurídica en un caso complejo;
- sustitución del criterio profesional del abogado;
- presentación automática de una demanda;
- afirmaciones al deudor que impliquen consecuencias jurídicas no verificadas;
- imposición de cargos o gastos simplemente porque una etapa de cobranza se alcanzó.

---

# 3. FUENTES Y JERARQUÍA DE PRECEDENCIA

Aplica esta jerarquía:

```text
1. Constitución y normas de rango legal vigentes.
2. Ley 675 de 2001 y normas que la modifiquen o complementen.
3. Código Civil y Código General del Proceso, cuando resulten aplicables.
4. Normativa vigente sobre protección de datos personales.
5. Normativa sobre mensajes de datos y prueba electrónica.
6. Jurisprudencia vigente y pertinente de las altas cortes.
7. Pronunciamientos y conceptos institucionales relevantes de SFC, SIC y otras autoridades competentes.
8. Reglamento de Propiedad Horizontal vigente de cada copropiedad.
9. Actas de Asamblea válidamente adoptadas.
10. Documentos canónicos AQUILA.
11. Decisiones de arquitectura y producto ya cerradas.
12. Este prompt.
13. Criterio del implementador.
```

**REGLA CRÍTICA:** este prompt NO puede modificar la ley, una sentencia o el reglamento de la copropiedad.

Si detectas conflicto entre el repositorio y una norma vigente:

1. conserva la evidencia del conflicto;
2. clasifica la regla;
3. corrige la implementación si la fuente superior es suficiente;
4. si la decisión depende de interpretación jurídica no resuelta, **NO inventes un valor**;
5. deja el punto bloqueado y documentado.

---

# 4. REGLA CENTRAL DE CONFIGURABILIDAD

No trates todo como “configurable”.

Toda regla debe clasificarse en uno de estos niveles:

| Nivel | Significado | Ejemplo | ¿Configurable por tenant? |
|---|---|---|---:|
| `L1_LEGAL_IMPERATIVA` | Regla obligatoria | solidaridad, requisitos probatorios, límite legal aplicable | No |
| `L2_LEGAL_ELECCION` | La ley permite opciones | tasa de mora inferior al máximo, cuando jurídicamente corresponda | Sí, dentro del límite |
| `L3_REGLAMENTARIA_ASAMBLEA` | Regla del reglamento o asamblea | procedimiento interno, beneficios o políticas aprobadas | Sí, si está soportado |
| `L4_OPERATIVA` | Política de operación | frecuencia de recordatorios | Sí |
| `L5_ESTRATEGIA_JURIDICA` | Decisión profesional | criterio de escalamiento | Sí, pero solo dentro de guardas jurídicas |
| `L6_ARQUITECTURA` | Decisión técnica AQUILA | snapshot, hash, append-only | No desde la UI de tenant |
| `L7_NO_RESUELTA` | Vacío jurídico | punto pendiente de concepto | No se implementa como hecho jurídico |

### Regla de diseño

> **La copropiedad puede parametrizar su política operativa, pero nunca puede configurar accidentalmente una conducta que contradiga una regla jurídica obligatoria.**

Por ello, las configuraciones deben estar subordinadas a **guards jurídicos**.

---

# 5. PRINCIPIO DE RECONCILIACIÓN DEL REPOSITORIO

El repositorio ya contiene una cantidad importante del motor. Entre las piezas observadas están:

- `Docs/Motor de gestion de cartera/CAR_00_Guia_Oficial.md`
- `Docs/Motor de gestion de cartera/CAR_08_Roadmap_Pendiente.md`
- `Docs/Motor de gestion de cartera/CAR_10_Consulta_Juridica.md`
- `packages/liquidation-engine/src/cuenta-corriente.ts`
- `packages/liquidation-engine/src/cartera-cobranza.ts`
- `packages/liquidation-engine/src/cartera-juridico.ts`
- `apps/web/app/stores/carteraConfig.ts`
- `apps/web/app/stores/prescripcion.ts`
- `supabase/functions/calcular-intereses/index.ts`
- `supabase/functions/cartera-recalcular/index.ts`
- `supabase/functions/cartera-certificar-deuda/index.ts`
- `supabase/functions/ejecutar-accion-cobranza/index.ts`
- `supabase/functions/_shared/despacho_cobranza.ts`
- migraciones de tasas, política financiera, prescripción, cobranza, expediente y jurídico.

Por tanto:

> **NO diseñes un módulo paralelo ni dupliques entidades existentes. Reconciliación primero; refactor solo cuando exista una razón verificable.**

---

# 6. HALLAZGO ESPECIAL: MIGRACIONES CON FECHAS FUTURAS RESPECTO DEL CORTE

El repositorio entregado contiene artefactos con nombres de migración posteriores al corte temporal documentado en varios documentos del módulo.

No interpretes automáticamente una migración con fecha futura como “funcionalidad completada”.

Debes comprobar:

- si el archivo realmente está en el árbol de trabajo objetivo;
- si existe evidencia de aplicación/deployment;
- si existen tests asociados;
- si el DDL y el código que lo consume están alineados.

Si no puedes verificarlo, clasifica el elemento como:

```text
FUTURE-DATED / VERIFY-DEPLOYMENT
```

y no lo uses como prueba de que la funcionalidad está desplegada.

---

# 7. FUENTES JURÍDICAS QUE DEBES CONSULTAR Y MANTENER ACTUALIZADAS

Como mínimo, verifica en fuentes oficiales:

### 7.1 Propiedad horizontal
- Ley 675 de 2001, especialmente arts. 29, 30 y 48.
- Normas que la hayan modificado o complementado y que estén vigentes.

### 7.2 Código Civil
Como mínimo:
- art. 1608 — mora;
- arts. 1653 y siguientes — imputación del pago;
- arts. 2535 y siguientes — prescripción;
- art. 2539 y normas concordantes sobre interrupción.

### 7.3 Proceso judicial
- Ley 1564 de 2012 (Código General del Proceso), especialmente reglas sobre mérito ejecutivo y costas cuando sean pertinentes.

### 7.4 Mensajes de datos
- Ley 527 de 1999, especialmente arts. 10, 11 y 12 y las normas concordantes aplicables a prueba y conservación.

### 7.5 Protección de datos
- Ley 1581 de 2012.
- Normativa reglamentaria vigente.
- Conceptos y lineamientos pertinentes de la SIC para tratamiento de datos y cobranza.

### 7.6 Interés bancario corriente
- Certificaciones vigentes de la Superintendencia Financiera.
- Herramientas/metodología oficial de conversión de tasas.
- Regulación vigente sobre usura y su relación con el IBC.

### 7.7 Jurisprudencia relevante
Como mínimo revisa y cita las decisiones que resulten pertinentes sobre:
- solidaridad de propietarios;
- publicación de morosos;
- exigibilidad y título ejecutivo en PH;
- tratamiento de datos en cobro de cartera;
- prueba electrónica y mensajes de datos;
- prescripción e interrupción.

**No copies textos extensos. Resume la regla y registra fuente, fecha y enlace.**

---

# 8. CJ-1 — INTERESES DE MORA

## 8.1 Objetivo

Transformar el motor de intereses para que la fuente jurídica primaria sea la tasa de referencia certificada y la regla vigente de la copropiedad, en vez de depender de una tasa mensual almacenada como autoridad autónoma.

## 8.2 Regla de modelado

La tasa debe representarse conceptualmente como:

```text
IBC certificado
    ↓
regla jurídica de multiplicador/límite
    ↓
política de mora de la copropiedad
    ↓
conversión periódica
    ↓
interés por período
```

La SFC publica el IBC como tasa efectiva anual y mantiene mecanismos oficiales de conversión a tasas mensuales y diarias.

### CONSECUENCIA TÉCNICA

No crees una arquitectura en la que:

```text
IBC_EA
   + tasa_mensual_independiente
   + tasa_diaria_independiente
```

puedan divergir sin trazabilidad.

La tasa mensual/diaria debe ser **derivada** o, si se materializa para performance, debe quedar marcada inequívocamente como valor derivado de una fuente y fórmula determinadas.

## 8.3 Conversión

Para una tasa efectiva anual `EA`, la equivalencia efectiva debe seguir la lógica exponencial:

```text
Tasa efectiva periódica = (1 + EA)^(1/n) - 1
```

donde `n` representa el número de períodos equivalentes del año.

**NO uses división simple `EA / 12` para convertir una tasa efectiva anual, salvo que una fuente jurídica/financiera específica del cálculo defina expresamente otro método para el caso concreto.**

La SFC explica que las tasas efectivas se convierten mediante equivalencias matemáticas, no por división nominal simplista.

## 8.4 No cierres por código lo que el concepto jurídico aún debe cerrar

Antes de convertir en regla inmutable debes verificar específicamente:

1. modalidad de IBC aplicable a las expensas comunes;
2. orden jurídico exacto del multiplicador frente a la tasa efectiva;
3. aplicabilidad y relación con el límite de usura;
4. convención de conteo de días para el cálculo de mora.

Si alguna de estas cuestiones sigue abierta en `VER-CAR-01`, implementa la **capacidad estructural** para soportarla, pero no conviertas una suposición en una regla jurídica definitiva.

## 8.5 Arquitectura objetivo

Mantén o crea una entidad equivalente a:

```text
 tasas_referencia
 ├── tipo_tasa
 ├── valor_ea
 ├── vigente_desde
 ├── vigente_hasta
 ├── resolucion_fuente
 ├── fecha_fuente
 └── fuente_url
```

y relaciona la política financiera con esa referencia.

La referencia nacional debe ser global, no editable por un tenant ordinario.

## 8.6 Guard obligatorio

Toda política que cobre interés de mora debe poder demostrar:

```text
fuente de tasa
+ regla de límite
+ vigencia
+ fórmula
+ versión de política
```

Una política nueva no puede omitir silenciosamente la trazabilidad jurídica de la tasa.

## 8.7 Day count

Actualmente el motor soporta múltiples convenciones (`mensual_30_dias_reales`, `actual_365`, `actual_360`, `treinta_360`).

No elimines esta capacidad durante la reconciliación.

Pero:

- no presentes ninguna convención como “legalmente obligatoria” sin soporte jurídico;
- separa la **convención matemática** del **fundamento jurídico que permite elegirla**;
- si el concepto jurídico determina una convención obligatoria, conviértela en `L1`;
- si permite una elección válida, conviértela en `L2`/`L3`.

## 8.8 Migración de tasas históricas

Nunca recalcules retrospectivamente de forma destructiva.

Debe existir capacidad de reproducir una liquidación histórica con:

```text
IBC vigente en la fecha
+ política vigente
+ fórmula utilizada
+ day_count
+ redondeo
+ snapshot
```

---

# 9. CJ-2 — ANATOCISMO E IMPUTACIÓN DE PAGOS

## 9.1 Separar dos problemas

No mezcles:

```text
cómo se genera el interés
```

con:

```text
cómo se aplica un pago
```

## 9.2 Interés sobre interés

Mientras el concepto jurídico no establezca una vía válida de capitalización para la obligación concreta de expensas comunes:

```text
capital vencido → causa interés
interés vencido → NO causa interés
```

Esto debe quedar como una regla del motor, pero documentando el fundamento jurídico que realmente la soporte.

No habilites “interés sobre interés” mediante una simple configuración de tenant.

## 9.3 Imputación

El repositorio ya posee:

- `imputarPago()`;
- `construirPlanManual()`;
- orden de categorías;
- estrategia por antigüedad/período.

No elimines estas capacidades.

Pero debes imponer la siguiente jerarquía conceptual:

```text
REGLA LEGAL
    ↓
restricciones de imputación
    ↓
preferencia/elección válida del pagador
    ↓
política operacional de la copropiedad
    ↓
algoritmo
```

No permitas que una configuración genérica convierta libremente:

```text
capital → intereses
```

si contradice la norma aplicable.

Cuando jurídicamente resulte permitido que el acreedor consienta una imputación diferente, esa circunstancia debe ser un **acto explícito y trazable**, no una preferencia oculta de la configuración global.

## 9.4 Antigüedad de la deuda

No modeles “más antigua primero” como verdad universal si la ley le concede al deudor facultades de imputación.

Diseña:

```text
imputación por instrucción válida del pagador
            ↓ si no existe
regla legal
            ↓
política operativa permitida
```

## 9.5 Sobrepagos

Mantén la decisión existente:

```text
pago > deuda
    ↓
saldo no aplicado
    ↓
crédito visible
```

No netees silenciosamente el crédito contra obligaciones futuras.

---

# 10. CJ-3 — PRESCRIPCIÓN

## 10.1 Cada obligación debe tener su propio reloj

Modela la prescripción a nivel de obligación/cargo o unidad jurídica equivalente:

```text
cargo
 ↓
fecha de exigibilidad
 ↓
plazo aplicable
 ↓
eventos jurídicos
 ↓
interrupciones
 ↓
nueva fecha de riesgo/vencimiento
```

No modeles la prescripción únicamente a nivel de inmueble.

## 10.2 Eventos interruptivos

El repositorio ya posee una bitácora factual de actos interruptivos.

Mantén esa separación:

```text
HECHO REGISTRADO
      ≠
EFECTO JURÍDICO AUTOMÁTICO
```

Cada acto debe poder almacenar:

- tipo;
- fecha de ocurrencia;
- obligación(es) afectada(s);
- evidencia;
- actor;
- descripción;
- estado de validación;
- fundamento jurídico aplicado;
- fecha de nuevo cómputo cuando corresponda.

## 10.3 Casos a evaluar jurídicamente

Debes contrastar en fuentes vigentes, como mínimo:

- comunicación ordinaria de cobro;
- requerimiento escrito;
- demanda ejecutiva;
- notificación del mandamiento;
- reconocimiento expreso;
- acuerdo de pago;
- abono parcial.

No asumas que todos tienen el mismo efecto.

## 10.4 Acuerdos de pago

El modelo debe distinguir al menos:

```text
acuerdo de pago
reconocimiento de deuda
novación
modificación de condiciones
incumplimiento del acuerdo
```

No declares que un acuerdo “reinicia” o “reinicia desde cero” la prescripción sin fundamento jurídico específico.

## 10.5 Alertas

Una vez jurídicamente cerrado `VER-CAR-05`, implementar:

```text
riesgo_bajo
riesgo_medio
riesgo_alto
prescripcion_vencida
```

pero con fechas explicables:

```text
fecha_exigibilidad
plazo_aplicado
acto_interruptivo_relevante
fecha_efecto
fecha_riesgo
```

## 10.6 Conservación de evidencia

Mientras no exista una regla jurídica específica suficiente para definir una purga segura:

```text
NO PURGAR AUTOMÁTICAMENTE
```

Implementa `legal_hold` para bloquear purga futura cuando exista controversia, actuación o caso jurídico.

---

# 11. CJ-4 — MORA Y COMUNICACIONES DE COBRO

## 11.1 No confundir mora con requerimiento

Cuando exista una obligación con plazo jurídicamente determinado y aplique la regla correspondiente de mora por vencimiento, la comunicación no debe decir que “constituye en mora” si eso no es cierto.

## 11.2 Modelo de lenguaje seguro

Diseña las plantillas para expresar:

```text
“La obligación se encuentra vencida desde [fecha].”

“La obligación se encuentra en mora desde [fecha], conforme al plazo de pago aplicable.”

“La presente comunicación tiene por objeto informarle y requerirle el pago del saldo actualmente adeudado.”
```

Estas son **plantillas de referencia**, no texto legal definitivo. Antes de fijarlas como plantillas oficiales verifica el concepto jurídico de `VER-CAR-07`.

## 11.3 Catálogo de afirmaciones prohibidas

Crea una capa de validación de contenido que pueda rechazar o marcar frases que impliquen, sin sustento:

- constitución en mora por el simple envío;
- embargo inminente automático;
- reporte automático a centrales de riesgo;
- suspensión automática de servicios;
- publicación pública de datos;
- amenaza de medidas judiciales inexistentes;
- consecuencias disciplinarias o penales no aplicables.

La validación debe ser programática, no solo documental.

---

# 12. CJ-5 — WHATSAPP Y MENSAJES DE DATOS

## 12.1 Capacidad probatoria

La Ley 527 de 1999 reconoce los mensajes de datos y su admisibilidad probatoria.

Por tanto, WhatsApp puede ser tratado como un **canal de mensajes de datos**, pero eso no equivale automáticamente a que cualquier mensaje a cualquier número acredite cualquier acto jurídico.

## 12.2 Conservación mínima de evidencia

Para mensajes utilizados en cobranza registra como mínimo:

```text
proveedor
referencia_externa
numero_destino
destinatario_persona_id
fecha_hora_envio
fecha_hora_entrega
fecha_hora_lectura (si existe)
contenido_integro
hash_contenido
plantilla_id
plantilla_version
payload/proof del proveedor
adjuntos
```

La evidencia debe permitir reconstruir:

```text
qué se envió
quién lo envió
para quién
cuándo
por qué medio
con qué versión de plantilla
qué confirmó el proveedor
```

## 12.3 Entregado vs leído

No codifiques `read = true` como equivalente automático a “notificación perfeccionada”.

Debe existir un catálogo de efecto probatorio por tipo de acción.

## 12.4 Habeas data

La posibilidad técnica de usar un teléfono no demuestra por sí sola que exista autorización o base jurídica suficiente para reutilizarlo con finalidad de cobro.

Añade al modelo de contacto:

```text
fuente
finalidad_original
finalidad_cobranza
base_juridica
autorizacion
fecha_autorizacion
evidencia
```

## 12.5 Implementación por niveles

Mientras `VER-CAR-08` siga abierto:

```text
WhatsApp informativo/gestión administrativa     → evaluar según base jurídica
WhatsApp requerimiento formal                   → BLOQUEADO
WhatsApp aviso prejurídico                      → BLOQUEADO
WhatsApp como única evidencia de acto jurídico  → BLOQUEADO
```

No desbloquees por intuición.

---

# 13. CJ-6 — GASTOS DE COBRANZA EXTRAJUDICIAL

## 13.1 Regla

No implementes un porcentaje universal por defecto.

NO:

```text
20% de la deuda = gastos de cobranza
10% de la deuda = gastos prejurídicos
```

salvo que exista un fundamento jurídico válido y específico y se haya configurado legalmente para la copropiedad.

## 13.2 Modelo recomendado

Mantén o crea:

```text
politicas_gastos_cobranza
politica_gasto_cobranza_items
```

y exige:

```text
acta_referencia
fundamento_texto
vigencia
version
aprobacion
```

## 13.3 Diferenciar gasto real de tarifa

El modelo debe permitir distinguir:

```text
gasto_real_acreditable
vs.
tarifa_fija_o_porcentaje
```

No atribuyas automáticamente la misma validez jurídica a ambos.

## 13.4 Flujo seguro

El gasto no debe saltar directamente a `cargos`.

Usa el flujo ya previsto:

```text
política
   ↓
propuesta
   ↓
validación/guard
   ↓
aprobación
   ↓
novedad
   ↓
cargo
```

Esto mantiene auditabilidad y reversibilidad.

---

# 14. CJ-7 — PUBLICACIÓN DE MOROSOS

## 14.1 Principio

La Ley 675 contempla publicación bajo condiciones específicas. La jurisprudencia constitucional ha examinado su compatibilidad con la protección de datos.

Esto NO significa que AQUILA pueda publicar datos de deuda sin restricciones.

## 14.2 Ámbito

Modela explícitamente:

```text
PUBLICACION_MOROSOS
    ↓
canal de circulación restringida
```

No asumas equivalencia entre:

```text
cartelera interna
```

y:

```text
internet público
redes sociales
WhatsApp grupal
portal indexable
```

Por defecto, el sistema debe bloquear publicación pública en Internet.

## 14.3 Datos mínimos

Define una lista permitida y otra prohibida.

Como postura conservadora inicial:

```text
permitidos:
  nombre
  identificación de unidad privada
  estado de mora
  saldo
  fecha de corte
```

Y evita exponer:

```text
cédula completa
telefonos
correo
información familiar
información financiera no necesaria
información sensible
```

Antes de activar la publicación, `VER-CAR-04` debe estar cerrado.

## 14.4 Retiro

La publicación debe ser temporal:

```text
mora subsiste → publicación permitida
pago / desaparición de condición → retirar
```

No conserves publicaciones históricas visibles al público como si fueran permanentes.

---

# 15. CJ-8 — CAMBIO DE PROPIETARIO Y MÚLTIPLES COPROPIETARIOS

## 15.1 Transferencia

La Ley 675 contempla responsabilidad solidaria en los supuestos legalmente previstos para expensas anteriores a la transferencia.

No implementes:

```text
nuevo propietario = deuda automáticamente trasladada
```

sin registrar el contexto de la transferencia.

## 15.2 Evento de transferencia

Debes poder registrar:

```text
fecha_transferencia
tipo_transferencia
propietario_anterior
propietario_nuevo
fecha_registro
paz_salvo
documento_fuente
deuda_a_la_fecha
```

## 15.3 Remate judicial

Debe existir un `tipo_transferencia` específico para permitir reglas distintas si la fuente jurídica aplicable lo exige.

No hardcodees el mismo efecto para:

```text
compraventa
remate judicial
donación
sucesión
adjudicación
```

## 15.4 Copropiedad múltiple

La regla de responsabilidad frente a la copropiedad debe modelar solidaridad cuando la norma aplicable la establezca.

Por ejemplo:

```text
unidad = $10.000.000 de deuda
A = 50%
B = 50%

frente a la copropiedad:
A → hasta el total jurídicamente exigible
B → hasta el total jurídicamente exigible
```

No dividas automáticamente la deuda entre propietarios como si cada uno solo debiera su porcentaje, si la obligación es solidaria.

Mantén, además, la regla de negocio existente:

```text
notificar a todos los copropietarios vigentes
```

---

# 16. MODELO OBJETIVO: GOBIERNO JURÍDICO COMO CAPA TRANSVERSAL

Introduce una capa conceptual común a todos los puntos anteriores:

```text
┌────────────────────────────────────────┐
│ FUENTES JURÍDICAS                      │
│ leyes / jurisprudencia / conceptos     │
└──────────────────────┬─────────────────┘
                       │
                 límites / reglas
                       │
┌──────────────────────▼─────────────────┐
│ REGLAS JURÍDICAS AQUILA                 │
│ versión + vigencia + fundamento         │
└──────────────────────┬─────────────────┘
                       │
                guardas / constraints
                       │
┌──────────────────────▼─────────────────┐
│ POLÍTICA DE COPROPIEDAD                 │
│ reglamento + asamblea + configuración   │
└──────────────────────┬─────────────────┘
                       │
                  estrategia
                       │
┌──────────────────────▼─────────────────┐
│ MOTOR DE CARTERA                        │
│ cálculo + cobranza + jurídico          │
└────────────────────────────────────────┘
```

---

# 17. ENTIDADES DE GOBIERNO JURÍDICO

No crees tablas nuevas si una entidad equivalente ya existe. Primero reconcílialas.

Si no existe una entidad funcional adecuada, el objetivo conceptual es disponer de:

## 17.1 Regla jurídica

```text
reglas_juridicas
----------------
id
codigo
nombre
categoria
nivel
estado
version
vigente_desde
vigente_hasta
fundamento_normativo
fundamento_jurisprudencial
fuente_url
regla_texto
condiciones_json
restricciones_json
created_at
created_by
```

## 17.2 Versión

Una regla jurídica nunca debe perder su historia.

```text
regla_v1
regla_v2
regla_v3
```

## 17.3 Política de tenant

```text
politicas_juridicas_tenant
--------------------------
id
tenant_id
regla_id
version
parametros_json
vigente_desde
vigente_hasta
fundamento_local
acto_origen
estado
hash
```

## 17.4 Evento jurídico

```text
eventos_juridicos
-----------------
id
tenant_id
sujeto_tipo
sujeto_id
tipo_evento
fecha
regla_aplicada
resultado
evidencia_id
actor_id
```

Usa estas estructuras solo si no existe ya un diseño equivalente. El objetivo es **gobierno**, no proliferación de tablas.

---

# 18. REGLAS JURÍDICAS COMO GUARDAS

Un guard jurídico debe expresarse conceptualmente como:

```text
ALLOW / DENY
```

Ejemplos:

### Guard de interés

```text
ALLOW tasa_mora
IF
  tasa_mora <= limite_juridico_vigente
```

### Guard de publicación

```text
DENY publicacion
IF canal = INTERNET_PUBLICO
```

### Guard de WhatsApp jurídico

```text
DENY accion
IF
  accion.es_acto_juridico = true
  AND VER_CAR_08 != CERRADO
```

### Guard de certificación

```text
ALLOW certificacion
IF
  existe_snapshot
  AND firmante_autorizado
  AND detalle_reproducible
```

---

# 19. NO REPETIR REGLAS JURÍDICAS EN CADA FUNCIÓN

Evita esto:

```text
calcular-intereses.ts       → regla legal A
registrar-pago.ts           → regla legal A distinta
cartera-recalcular.ts       → regla legal A tercera variante
```

Haz esto:

```text
regla jurídica central
        ↓
servicio/guard compartido
        ↓
funciones de dominio
```

Las Edge Functions deben orquestar; las reglas de dominio deben vivir en una capa única.

---

# 20. SNAKE_CASE CASE Y CONVENCIONES

Respeta la decisión existente del repositorio:

- tablas en español `snake_case`;
- columnas en español `snake_case`;
- funciones y módulos TypeScript en el estilo vigente del paquete;
- evita introducir nombres físicos en inglés cuando exista equivalente español ya adoptado.

No introduzcas:

```text
portfolio_classification_policy
collection_action
judicial_case
```

si el repositorio ya utiliza:

```text
politicas_clasificacion_cartera
acciones_cobranza
casos_juridicos
```

---

# 21. INTEGRACIÓN CON EL MOTOR EXISTENTE

## 21.1 Interés

Primero inspecciona:

```text
packages/liquidation-engine/src/cuenta-corriente.ts
supabase/functions/calcular-intereses/index.ts
supabase/migrations/20260819110000_interes_day_count.sql
supabase/migrations/20260822220000_cartera_tasas_referencia.sql
supabase/migrations/20260901110000_politica_tope_legal_obligatorio.sql
```

y cualquier otra migración/tipo relacionado.

No sustituyas `calcularInteresMora()` sin verificar todos sus consumidores y tests.

## 21.2 Pagos

Mantén:

```text
pagos
 → imputarPago()
 → pago_aplicaciones
 → v_cargo_saldo
```

pero corrige las reglas de imputación si la auditoría jurídica demuestra que la configuración actual permite una conducta inválida.

## 21.3 Cobranza

Mantén la separación existente:

```text
clasificación
→ estrategia
→ propuesta
→ aprobación
→ ejecución
→ evidencia
```

No mezcles esta máquina con la certificación judicial.

## 21.4 Jurídico

Una acción jurídica de alto impacto debe requerir:

```text
regla válida
+ prerequisitos
+ evidencia
+ rol autorizado
```

---

# 22. MATRIZ OBJETIVO DE CONFIGURABILIDAD

Implementa o ajusta la arquitectura para que el comportamiento final se aproxime a:

| Regla | Tipo objetivo | Configurable |
|---|---|---:|
| Límite jurídico de intereses | L1 | No |
| Fuente del IBC | L1 | No para tenant |
| Tasa de mora inferior al máximo, cuando la ley lo permita | L2 | Sí |
| Fórmula matemática de equivalencia | L1/6 | No |
| Day count | Depende de concepto | Solo si jurídicamente permitido |
| Interés sobre intereses | L1 | No |
| Imputación legal básica | L1 | No |
| Consentimiento excepcional del acreedor | L2 | Solo acto explícito |
| Estrategia operativa de antigüedad | L3/L4 | Sí dentro de guardas |
| Frecuencia de cobranza | L4 | Sí |
| Canal de recordatorio | L4/L5 | Sí |
| WhatsApp como acto jurídico | L7 hasta cerrar VER-CAR-08 | No |
| Gastos de cobranza | L7/L3 | Solo con soporte válido |
| Publicación morosos | L1/L3 | Sí, solo dentro de límites |
| Publicación en internet público | L1/guard | No |
| Solidaridad de copropietarios | L1 | No |
| Responsabilidad por transferencia | L1 | No |
| Prescripción | L1 | No |
| Alerta de prescripción | L1/ARQ | Sistema |
| Purga documental | L1/7 | No mientras exista incertidumbre |
| Plantilla de comunicación | L3/L4 | Sí, con validador jurídico |
| Certificación de deuda | L1/L6 | Flujo controlado |
| Costas judiciales | L1 | Nunca calcular por heurística |

---

# 23. COSTAS JUDICIALES: NO CONFUNDIR CON GASTOS DE COBRANZA

Mantén la separación:

```text
COSTAS JUDICIALES
    = resultado de actuación/proceso judicial
    = fuente judicial

GASTOS DE COBRANZA EXTRAJUDICIAL
    = política/gestión administrativa
    = fuente reglamento/asamblea y demás reglas aplicables
```

Prohibido implementar:

```text
180 días de mora => 10% de costas
360 días de mora => 15% de costas
```

Las costas judiciales no deben estimarse por antigüedad.

---

# 24. EVIDENCIA Y REPRODUCIBILIDAD

Toda actuación que pueda llegar a un expediente debe poder reproducirse.

Conserva, cuando corresponda:

```text
qué regla estaba vigente
qué política estaba vigente
qué versión de plantilla se usó
qué datos entraron
qué cálculo resultó
qué actor ejecutó/aprobó
qué proveedor confirmó
qué evidencia se generó
qué hash existía
```

Usa el patrón ya existente de:

```text
snapshot
policy_hash
contenido_hash
append-only
```

No reemplaces una decisión histórica con “el valor actual”.

---

# 25. SEGURIDAD Y RLS

Mantén aislamiento estricto `tenant_id`.

Especialmente:

- datos de cartera;
- datos de contacto;
- expedientes;
- acciones de cobranza;
- prescripción;
- casos jurídicos;
- acuerdos;
- documentos probatorios.

Excepción documentada:

```text
tasas_referencia
```

puede ser global si su naturaleza nacional lo exige, pero su escritura debe estar restringida a administración de plataforma.

Nunca relajes `SEC-03` ni equivalentes solo para facilitar administración cross-tenant.

---

# 26. COMUNICACIONES: MOTOR DE PLANTILLAS CON CONTROL JURÍDICO

Toda plantilla debe tener metadatos equivalentes a:

```text
tipo_acto
nivel_riesgo
version
vigente_desde
vigente_hasta
canales_permitidos
fundamento
variables_permitidas
variables_restringidas
requiere_aprobacion
```

Antes de ejecutar una plantilla de alto riesgo, valida:

```text
canal permitido
+ base jurídica
+ datos personales permitidos
+ afirmaciones permitidas
+ estado de la obligación
+ evidencia disponible
```

---

# 27. MAQUINA DE RIESGO JURÍDICO DE LAS ACCIONES

Clasifica acciones así:

### `R0_INFORMATIVA`

Ejemplos:

- estado de cuenta;
- recordatorio;
- información de saldo.

### `R1_COBRANZA`

Ejemplos:

- requerimiento de pago;
- promesa;
- acuerdo;
- gestión administrativa.

### `R2_DATOS_DERECHOS`

Ejemplos:

- publicación de morosos;
- tratamiento especial de datos;
- comunicaciones con efectos relevantes.

### `R3_JURIDICA`

Ejemplos:

- certificación ejecutiva;
- remisión a abogado;
- construcción de expediente;
- actuación procesal.

Cuanto mayor el riesgo:

```text
mayor validación
mayor trazabilidad
mayor restricción
```

---

# 28. REGLA ESPECIAL PARA EL AGENTE: NO INVENTAR FALTANTES

Cuando encuentres:

```text
[VERIFICAR]
[GAP]
[PRQ]
VER-CAR abierto
```

no lo cierres con un número “razonable”.

No hagas cosas como:

```text
prescripción = 5 años porque parece correcto

WhatsApp = válido porque tiene doble check

gastos = 10% porque es práctica común

day_count = 365 porque es lo normal
```

La respuesta correcta es:

```text
capacidad arquitectónica lista
regla jurídica pendiente
feature bloqueada
```

Esto es una regla esencial del proyecto.

---

# 29. PRERREQUISITOS

Debes conservar y reforzar explícitamente el concepto `PRQ`.

Cada cambio debe identificar:

```text
PRQ-CAR-xxx
```

cuando dependa de otra pieza.

Ejemplos:

```text
PRQ-CAR-INTERES-001
  tasa_referencia + política financiera + fórmula validada

PRQ-CAR-PRES-001
  término de prescripción + reglas de interrupción

PRQ-CAR-WA-001
  concepto jurídico WhatsApp + modelo de evidencia
```

Si una nueva decisión requiere una pieza previa que no existe, el agente debe:

1. identificarla;
2. declararla `PRERREQUISITO`;
3. implementar el prerrequisito si está suficientemente definido;
4. bloquear la funcionalidad dependiente si no lo está.

---

# 30. PRUEBAS OBLIGATORIAS

No cierres una modificación solo porque compile.

Debes añadir/ajustar pruebas para:

## 30.1 Intereses

- conversión EA → período;
- múltiples segmentos;
- no solapamiento;
- vigencia temporal;
- aplicación de límites;
- redondeo;
- regresión de day count;
- reproducibilidad histórica.

## 30.2 Imputación

- intereses antes de capital cuando así lo ordene la regla vigente;
- instrucción válida del pagador;
- no permitir configuraciones incompatibles;
- deuda más antigua en ausencia de una preferencia jurídicamente válida;
- sobrepago visible y no perdido.

## 30.3 Prescripción

- reloj independiente por obligación;
- registro factual de actos;
- actos interruptivos configurados según regla vigente;
- acuerdo de pago;
- interrupción múltiple cuando legalmente corresponda;
- alertas;
- bloqueo de purga.

## 30.4 Comunicaciones

- frases prohibidas;
- variables obligatorias;
- hash;
- plantilla/versionado;
- prueba de canal;
- bloqueo de canal no autorizado.

## 30.5 WhatsApp

- evidencia completa;
- delivered/read separados;
- número ligado a persona;
- finalidad/base jurídica;
- bloqueo si `VER-CAR-08` está abierto.

## 30.6 Publicación

- datos mínimos;
- canal restringido;
- retiro posterior al pago;
- bloqueo de publicación pública.

## 30.7 Solidaridad

- varios copropietarios;
- monto total no dividido automáticamente;
- notificación a todos;
- cambio de propietario;
- remate judicial como tipo diferenciado.

---

# 31. PRUEBAS DE BASE DE DATOS Y RLS

Para cada regla que deba ser imposible de violar desde API/UI, crea una defensa de base de datos cuando sea apropiado:

```text
CHECK
UNIQUE
EXCLUDE
TRIGGER
FUNCTION SECURITY DEFINER
RLS
```

Regla:

> **La UI informa y facilita; la base y el dominio garantizan.**

---

# 32. PLAN DE EJECUCIÓN OBLIGATORIO

Ejecuta en este orden:

## Fase A — Inventario

1. inspeccionar árbol del repositorio;
2. identificar módulo cartera;
3. identificar reglas financieras;
4. identificar código de pagos;
5. identificar código jurídico;
6. identificar prescripción;
7. identificar plantillas y canales;
8. identificar migrations y tests;
9. detectar duplicidades y piezas futuras/no desplegadas.

## Fase B — Matriz de discrepancias

Construye una tabla interna:

```text
Regla
Estado actual
Fuente
Nivel L1-L7
Gap
Cambio requerido
PRQ
Impacto
Tests
```

## Fase C — Cambios seguros

Implementa primero:

- guardas;
- versionado;
- estructuras faltantes;
- evidencias;
- validadores;
- bloqueos.

Después ajusta cálculos.

## Fase D — Migraciones

Cada migración debe ser:

- incremental;
- reversible conceptualmente;
- idempotente cuando el patrón del repo lo exija;
- documentada;
- acompañada de tests.

## Fase E — Reconciliación de documentación

Actualizar como mínimo:

```text
CAR_00_Guia_Oficial.md
CAR_08_Roadmap_Pendiente.md
CAR_10_Consulta_Juridica.md
CAR_04_Matriz_Legal_Extendida.md (si existe o corresponde)
```

Cerrar `VER-CAR-*` solo cuando exista soporte suficiente.

---

# 33. FORMATO DE ENTREGA DEL AGENTE

Al terminar, debes producir:

## A. INFORME DE AUDITORÍA

Con:

```text
1. Estado encontrado
2. Reglas ya correctas
3. Reglas incorrectas
4. Reglas no concluyentes
5. Código afectado
6. Migraciones afectadas
7. Riesgos
8. Prerrequisitos
```

## B. MATRIZ DE CAMBIOS

```text
ID
Componente
Antes
Después
Fundamento
Nivel
PRQ
```

## C. CAMBIOS IMPLEMENTADOS

Lista exacta de:

- archivos;
- funciones;
- tablas;
- triggers;
- políticas RLS;
- tests.

## D. CAMBIOS BLOQUEADOS

Cada uno con:

```text
VER-CAR-xx
Razón
Qué falta
Cómo quedó bloqueado
Qué habilitará después
```

## E. VALIDACIÓN

Debe incluir:

```text
pnpm test
pnpm lint
pnpm typecheck

migraciones / pruebas SQL

pruebas de regresión cartera
```

Usa los comandos reales definidos en `package.json` y la configuración vigente del repositorio; no inventes comandos.

## F. RESULTADO JURÍDICO-TÉCNICO

Resume:

```text
Reglas L1 que quedaron blindadas
Reglas L2 parametrizables
Reglas L3/L4 configurables
Reglas L7 bloqueadas
```

---

# 34. CONDICIONES DE NO TERMINACIÓN

No declares “completo” si ocurre cualquiera de estas situaciones:

- una política nueva puede exceder un límite jurídico sin guard;
- la tasa puede quedar separada de su fuente sin trazabilidad;
- el sistema permite interés sobre interés por simple configuración cuando ello no esté jurídicamente habilitado;
- la configuración puede invertir arbitrariamente el orden jurídico de imputación;
- una alerta de prescripción se basa en un plazo inventado;
- WhatsApp se usa como acto jurídico mientras la regla correspondiente siga abierta;
- se cobra un porcentaje inventado de gastos de cobranza;
- se publica cartera en Internet público por defecto;
- varios copropietarios reciben solo una fracción cuando la obligación es solidaria;
- una certificación histórica puede cambiarse destructivamente;
- una actuación judicial puede generarse sin sus prerrequisitos;
- una regla jurídica está duplicada en varias capas con posibilidad de divergencia.

---

# 35. PRINCIPIO FINAL DE DISEÑO

El resultado esperado NO es:

> “AQUILA tiene muchas opciones de configuración”.

El resultado esperado es:

> **“AQUILA tiene un marco jurídico versionado que delimita lo posible, y dentro de ese marco cada copropiedad puede definir su propia política de gestión de cartera.”**

En forma compacta:

```text
LEY / JURISPRUDENCIA
        ↓
LIMITES OBLIGATORIOS
        ↓
POLÍTICA DE LA COPROPIEDAD
        ↓
ESTRATEGIA DEL ASESOR / ADMINISTRADOR
        ↓
AUTOMATIZACIÓN AQUILA
        ↓
EVIDENCIA + AUDITORÍA + REPRODUCIBILIDAD
```

Si una capa inferior contradice una superior:

```text
RECHAZAR
```

Si la capa superior no está suficientemente definida:

```text
BLOQUEAR
```

Si la elección está jurídicamente permitida:

```text
CONFIGURAR + VALIDAR
```

Si la decisión es puramente operativa:

```text
CONFIGURAR
```

---

# 36. REFERENCIAS EXTERNAS UTILIZADAS COMO BASE DEL ENFOQUE

Estas fuentes deben ser revisadas directamente por el agente antes de cerrar decisiones jurídicas:

1. **Superintendencia Financiera — Tasas de interés y conversión**  
   https://www.superfinanciera.gov.co/preguntas-frecuentes/12/12-tasas-de-interes/

2. **Superintendencia Financiera — Simulador de conversión de tasas**  
   https://www.superfinanciera.gov.co/publicaciones/61554

3. **Superintendencia Financiera — certificaciones del IBC**  
   https://www.superfinanciera.gov.co/publicaciones/10116173/superfinanciera-certifica-el-interes-bancario-corriente/

4. **Corte Constitucional — Sentencia C-328 de 2019**  
   https://www.corteconstitucional.gov.co/relatoria/2019/C-328-19.htm

5. **Ley 527 de 1999 — mensajes de datos**  
   Texto oficial en Secretaría del Senado / SUIN según disponibilidad vigente.

6. **Ley 675 de 2001 — propiedad horizontal**  
   Texto oficial en Secretaría del Senado / SUIN según disponibilidad vigente.

7. **Código Civil colombiano**  
   Texto oficial en Secretaría del Senado / SUIN según disponibilidad vigente.

8. **Ley 1564 de 2012 — Código General del Proceso**  
   Texto oficial en Secretaría del Senado / SUIN según disponibilidad vigente.

9. **Ley 1581 de 2012 y doctrina SIC**  
   Consultar versión normativa vigente y conceptos oficiales aplicables a cobranza y tratamiento de datos.

---

# 37. INSTRUCCIÓN FINAL AL AGENTE

> **No implementes “lo que parece correcto”. Implementa únicamente lo que el repositorio, la arquitectura y la fuente jurídica permitan justificar.**
>
> Cuando el derecho permita opciones, expónlas como configuración gobernada.
>
> Cuando el derecho imponga una regla, conviértela en guard, constraint o regla centralizada.
>
> Cuando exista una decisión jurídica abierta, no elijas por intuición: construye la capacidad técnica, marca el bloqueo y preserva trazabilidad.
>
> Cuando exista una configuración actual que pueda producir una conducta jurídicamente inválida, endurece el sistema para rechazarla en UI, dominio y base de datos cuando corresponda.
>
> Cuando una modificación jurídica pueda afectar liquidaciones históricas, preserva reproducibilidad y evita recálculos destructivos.
>
> Mantén todas las decisiones nuevas versionadas, justificadas y auditables.
>
> El criterio de éxito no es “más funcionalidades”.
>
> El criterio de éxito es que **AQUILA pueda automatizar mucho más de la gestión de cartera sin perder control jurídico, trazabilidad, aislamiento multitenant, capacidad probatoria ni capacidad de adaptación a la política particular de cada copropiedad y de su asesor jurídico.**

---

## FIN DEL PROMPT
