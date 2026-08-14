# ORDEN DE COLOCACIÓN — AEL / AQUILA

## 1. Prompt principal del agente

Coloca primero:

`AEL_AQUILA_PROMPT_MAESTRO_FINAL_V1.md`

Este es el texto que debe recibir el agente como instrucción principal.

## 2. Documentos canónicos de arquitectura

Después proporciona los documentos:

```text
01–20
```

en orden numérico.

### Entrega 1

```text
01–07
```

### Entrega 2

```text
08–15
```

### Entrega 3

```text
16–20
```

## 3. Documentos de gobierno

Después proporciona:

```text
21 — Master Implementation Prompt
22 — Traceability & Requirements Matrix
23 — Master Implementation Roadmap
24 — Verification, Acceptance & Definition of Done
```

Aunque el Prompt Maestro Final ya incorpora sus reglas operativas esenciales,
mantén estos cuatro documentos disponibles como fuentes normativas detalladas.

## 4. Orden lógico final

```text
PROMPT MAESTRO FINAL
        ↓
01–07  AEL Language Core
        ↓
08–15  Platform & AQUILA
        ↓
16–20  Financial & Liquidation Engine
        ↓
21     Implementation Governance
22     Traceability
23     Roadmap
24     Verification / Acceptance / DoD
```

## 5. Si la herramienta del agente permite archivos de contexto

Carga todos los documentos 01–24 como archivos de referencia.

No los pegues todos dentro del texto del prompt principal si la herramienta ya
permite adjuntar archivos/contexto.

## 6. Si la herramienta sólo permite un prompt

Usa el archivo:

`AEL_AQUILA_PROMPT_MAESTRO_FINAL_V1.md`

y, cuando el agente necesite desarrollar una unidad, suministra los documentos
canónicos aplicables a esa unidad.

## 7. Importante

No entregues al agente los documentos históricos 1–74 como arquitectura activa.

La numeración oficial es:

```text
01–24
```

Los documentos históricos sólo deben consultarse si se necesita recuperar
información que no esté en la arquitectura canónica.
