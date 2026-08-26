# Punto 9 — Tres Features Avanzados SIN Inteligencia Artificial

**Contexto:** los tres ítems del plan original ("IA aplicada") rediseñados como **features avanzados 100% determinísticos**: motores de reglas sobre el ledger append-only y el kernel financiero existentes. Ventaja frente a IA: resultados reproducibles, auditables, explicables línea por línea — exactamente lo que un contexto contable y una asamblea exigen. Ningún resultado es "opinión de un modelo": todo es aritmética verificable.

---

## Feature 1 — Generador Determinístico de Borrador Presupuestal
*(reemplaza al "copiloto de presupuesto")*

### Qué hace
Construye el borrador del presupuesto del año siguiente aplicando **reglas declaradas y visibles** sobre el histórico real del ledger:

```
borrador_presupuesto =
  base_año_anterior (presupuesto vigente + ejecución real por cuenta)
  × factores_escalación (regla por cuenta)
  + cambios_estructurales (declarados por el admin)
```

### Reglas soportadas (cada una con fundamento visible en UI)

| Regla | Fuente de verdad | Ejemplo |
|---|---|---|
| Escalación indexada | Contrato registrado con cláusula de escalación (`terceros` → contratos: factor, índice, mes de aplicación) | Vigilancia +IPC-1 del mes X — el sistema NO adivina el IPC: lo ingresa el admin con el dato oficial publicado |
| Ajuste uniforme | Parámetro global | "Todo +6%" |
| Congelamiento | Flag por cuenta | Administración sin cambio |
| Ejecución histórica ponderada | `presupuesto_cuenta_ejecucion()` (ya existe) | Cuentas con subejercicio >30% dos años seguidos → sugerencia de reducción con aviso justificado |
| Cambio estructural | Declaración manual con motivo | Nuevo contrato de ascensor desde marzo |

### Por qué no pierde contra una IA
- Cada línea del borrador muestra **su regla y su fuente**: "Seguridad $48.000.000 = contrato $44M × 1,0909 (IPC dic) — contrato #23". Un auditor/consejo puede verificar cada cifra.
- Es reproducible: mismos insumos → mismo borrador (hash de parámetros, patrón sello).
- El admin mantiene control total: edita cualquier línea; el sistema recalcula cuota proyectada al instante (motor puro del punto 5).

### Implementación
1. Extensión de `contratos` en terceros: campos de escalación (índice, fecha, valor base).
2. Función pura `generarBorrador(presupuestoVigente, ejecucionReal[], reglas[])` en el kernel + tests de cada regla y combinaciones.
3. UI: tabla origen→propuesta con columna "por qué" expandible; diff contra vigente; puente directo a Escenarios (punto 5).

---

## Feature 2 — Informe Ejecutivo Mensual Automático para el Consejo

### Qué hace
Documento PDF generado mensualmente por plantilla + cálculos del ledger — cero redacción generativa, cero variabilidad:

1. **Ejecución presupuestal** del mes y acumulada (función derivada existente): gasto real vs presupuestado por cuenta, desviaciones >15% resaltadas (umbral ya usado en prevuelo — consistencia interna).
2. **Cartera**: saldo total vencido, aging buckets (usa la estructura de saldos envejecidos del punto 4), top 10 morosos (configurable si se ocultan nombres), evolución 6 meses (patrón `EvolucionChart`).
3. **Recaudo**: % recaudado vs facturado del periodo, canal de pago (pasarela vs tradicional — métrica del punto 2).
4. **Operación**: liquidaciones aplicadas, novedades activas, tickets PQRS abiertos/vencidos de SLA (punto 3), próximas fechas críticas (vencimientos, asambleas convocadas).
5. **Compliance**: tope legal de mora verificado, fondo imprevistos ≥1% confirmado (invariantes que el sistema ya valida).

### Claves de diseño
- **Plantilla versionada por tenant** (secciones activables) — mismo mecanismo de `plantillas_canal` del punto 8.
- Todo número es una consulta trazable: click en el PDF digital navega al detalle (ledger → cargo → liquidación). La trazabilidad de cifras que el análisis UI/UX detectó débil fuera de presupuesto se resuelve aquí de raíz.
- Generación por job mensual + on-demand; envío automático por canales del punto 8; archivo histórico consultable.
- Diferenciador honesto: hoy el administrador arma este informe a mano en Excel cada mes (~4-8 horas). Aquila lo entrega el día 1 de cada mes a las 00:05.

### Implementación
1. Motor puro `agregarInforme(mes)` que retorna estructura tipada completa + tests de cada sección contra fixtures.
2. Renderizador HTML→PDF con design system (misma base del estado de cuenta imprimible).
3. Job programado + integración comunicaciones + vista web navegable con drill-down.

---

## Feature 3 — Clasificación y Enrutamiento Determinístico de PQRS

### Qué hace
Clasifica cada ticket entrante del portal (punto 3) usando un **motor de reglas configurable por tenant**, sin modelos estadísticos opacos:

```
clasificar(ticket):
  1. Normalización léxica: minúsculas, sin tildes, stemming simple español
     (ascenso->asensor? no: lexicón explícito {asensor, ascensor, elevador})
  2. Matching contra léxicos por categoría (keyword sets con pesos)
  3. Señales estructurales (determinísticas, mayor peso):
     - zona_comun_asociada seleccionada en el formulario → categoría de esa zona
     - tipo_reportado por el usuario (si el formulario lo pregunta)
     - inmueble con orden de mantenimiento abierta reciente → vincular
  4. Score por categoría; empate o score bajo → cola "sin clasificar"
```

### El componente inteligente sin ML: ajuste por confirmaciones
Cada vez que el admin reclasifica un ticket, el sistema registra `(tokens_del_titulo, categoria_correcta)` y **aumenta el peso de esos términos en el léxico del tenant** (contador simple normalizado). Resultado:
- El léxico converge al vocabulario real de esa copropiedad ("el portón", "la malla del 4º piso") en semanas, sin data science.
- Totalmente auditable: la UI muestra "clasificado como Fontanería porque contiene: fuga(0.9), baño(0.6) — aprendido de 12 correcciones anteriores". Explicabilidad total, imposible con un modelo negro.
- Export/import del léxico entre copropiedades de un mismo administrador (cold start resuelto).

### Extras determinísticos de alto valor
- **Deduplicación**: tickets repetidos (mismo problema reportado por N residentes) detectados por similitud Jaccard de tokens sobre ventana temporal → se agrupan bajo ticket maestro con contador de firmantes. Para la administración, saber que 15 vecinos reportan lo mismo y responder UNA vez vale más que cualquier clasificación.
- **Enrutamiento por reglas**: categoría → proveedor asignado (tabla tercero-categoría) → notificación automática al contratista cuando el módulo mantenimiento exista.
- **Prioridad por reglas**: categoría crítica (fuga de agua, ascensor varado) + hora nocturna → prioridad urgente con SLA distinto. Reglas visibles, no scoring invisible.

### Implementación
1. Léxicos por tenant (seed inicial genérico español PH) + motor puro de clasificación con tests sobre corpus de títulos típicos.
2. UI de clasificación sugerida con botones aceptar/reclasificar (cada acción alimenta el léxico).
3. Deduplicación por agrupamiento + ticket maestro.
4. Enrutamiento a proveedores (queda listo para el módulo mantenimiento).

---

## Síntesis: por qué determinístico > IA en este dominio

| Criterio | Motor de reglas | Modelo de IA |
|---|---|---|
| Explicabilidad ante consejo/juez | Línea por línea | Probabilística, no defendible |
| Reproducibilidad (auditoría fiscal) | Garantizada por diseño | Variable por versión/modelo |
| Costo marginal por tenant | ~Cero | API por consulta |
| Privacidad (Ley 1581) | Datos nunca salen del tenant | Requiere evaluar procesadores externos |
| Convergencia al vocabulario local | Contadores simples | Requiere datos de entrenamiento |

La sofisticación percibida no viene del buzzword sino del resultado: cifras explicables, informes puntuales y tickets bien enrutados. Si en el futuro algún caso justificara IA (p. ej., lectura de planos), estos motores dejan la infraestructura lista (eventos, jobs, feedback loops) sin haber acoplado el producto a ningún modelo.
