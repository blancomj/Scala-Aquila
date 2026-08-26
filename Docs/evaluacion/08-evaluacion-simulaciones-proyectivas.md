# Punto 5 — Simulaciones Proyectivas para Asambleas

**Contexto:** análisis del punto crítico #5 del plan de acción. Es **el diferenciador más barato del roadmap**: el motor es puro (`liquidar(snapshot)`) y el constructor de snapshot inmutable ya existe. Una proyección = construir un snapshot modificado → ejecutar el motor → presentar el diff. Sin persistencia de efectos financieros, sin tocar el ledger.

**Contexto normativo:** el incremento de cuotas es competencia exclusiva de la Asamblea (art. 38 Ley 675/2001; Circular Conjunta MinTrabajo-MinVivienda 0028/2026 — no puede aplicarse automático por IPC/salario mínimo). La herramienta apoya la *deliberación*; nunca automatiza la decisión.

---

## A. Casos de uso (por frecuencia real en asambleas)

### A.1 Incremento de presupuesto
¿Cuánto queda la cuota si subimos el presupuesto 10%? Parámetros:
- Incremento uniforme (%) o **incremento selectivo por rama del árbol presupuestal** (ej: +15% seguridad, +5% aseo, congelar administración). El árbol `presupuesto_cuenta` con jerarquía ya existe; propagar el % por descendencia.
- Ajuste por inflación objetivo (input IPC esperado, cálculo visible).

### A.2 Cuota extraordinaria
Se necesitan $180M para la fachada — ¿cuánto paga cada uno? Dos direcciones:
- Monto objetivo → reparto por coeficiente → cuota por inmueble (+ financiación en N cuotas usando el reparto mayor-resto anual→periodos existente).
- Cuota máxima tolerable → techo de obra financiable (cálculo inverso).

### A.3 Cambio de coeficientes (el más políticamente sensible)
Reparto actualizado por nuevo avalúo/construcción: vista **ganadores/perdedores** por inmueble (delta $ y % de cuota). La asamblea necesita ver quién gana y quién pierde ANTES de votar — hoy se hace en Excel a mano y mal.

### A.4 Sensibilidad de recaudo/mora
Si la mora sube al 8%, ¿qué presupuesto podemos sostener? Combina proyección de ingresos con estadísticas históricas de cartera del tenant (el ledger ya tiene todo el histórico).

### A.5 Comparación interanual
Presupuesto vigente vs propuesto, lado a lado por cuenta del árbol, con variación % — el entregable impreso de la asamblea.

---

## B. Diseño técnico

### B.1 El escenario como objeto de primera clase

```
presupuesto_escenarios:
  id, tenant_id, nombre,
  estado (borrador | presentado | aprobado | descartado),
  parametros_jsonb (modificaciones sobre el snapshot base),
  snapshot_base_hash (sello del presupuesto/coeficientes origen),
  resultado_hash (reproducibilidad — mismo patrón resultHash),
  creado_por, timestamps
```

Reglas:
- **Sin efectos colaterales**: ejecutar un escenario jamás escribe en cargos/presupuestos. Es computación pura sobre datos versionados.
- **Reproducibilidad**: guardar `snapshot_base_hash` + `resultado_hash`; si los datos base cambiaron (nuevo set de coeficientes), el escenario queda marcado desactualizado en vez de recalcular silenciosamente (misma filosofía del sello de liquidación).
- **Puente a producción**: escenario aprobado en asamblea → botón "convertir en borrador de presupuesto" que prellena el flujo existente borrador→vigente con maker-checker. La decisión humana (asamblea con acta) queda siempre en medio.

### B.2 Motor
Función pura nueva en financial-kernel:

```
proyectar(snapshotBase, modificaciones): ResultadoProyeccion
  - aplica modificaciones al snapshot EN MEMORIA
  - ejecuta liquidar() con las mismas invariantes (R1/R3/R4, mayor-resto, decimal exacto)
  - devuelve cuota por inmueble + desglose por cuenta + reconciliaciones
```

Costo computacional trivial (cientos de unidades × 12 periodos = milisegundos) → permite **UI reactiva**: sliders que recalculan en vivo sin backend roundtrip (el kernel corre también en cliente o vía una sola edge function de cálculo).

### B.3 Diferencia clave vs simulación de liquidación (naming crítico)
Ya existe "Simular liquidación" (pre-liquidación con efectos persistidos). Para evitar confusión fatal en UI contable: este módulo se llama **"Escenarios"** y su empty state lo aclara ("Los escenarios no afectan cifras reales; son cálculos comparativos para la asamblea").

---

## C. UI/UX (aplicando las lecciones del análisis frontend)

### C.1 Workspace de escenarios
- Página dentro de Presupuesto: lista de escenarios (nombre, fecha, estado, delta promedio).
- Editor con **sliders + inputs numéricos** por rama del árbol; totales recalculados en vivo con `tabular-nums` (patrón existente).
- Vista comparativa: tabla por cuenta (vigente | escenario | delta $ | delta %) con semáforo de variación (>15% resaltado — umbral ya usado en prevuelo).

### C.2 Impacto por inmueble
- Tabla ordenable: inmueble | coeficiente | cuota actual | cuota propuesta | delta $ | delta %.
- Buscador rápido para responder en vivo durante asamblea: ¿cuánto pagaría el apartamento 502? (caso de uso real #1 en sesión de asamblea).
- Vista ganadores/perdedores solo para escenarios de coeficientes: histograma de deltas + top 10 subidas/bajadas.

### C.3 Entregable de asamblea
- **Export PDF presentation-ready**: portada (nombre PH, fecha, escenario), resumen por cuentas, tabla completa por inmueble, gráfico de distribución. Es el documento que el administrador proyecta/imprime en la asamblea — hoy lo arman a mano en Excel y PowerPoint.
- Gráficos simples (barras por cuenta, distribución de cuotas) con la paleta del design system — no introducir librería pesada; el proyecto ya tiene Evoluchart propio en cartera (`EvolucionChart.vue`) como patrón.

### C.4 Estados vacíos y feedback
- Escenario sin modificar = aviso "Este escenario es idéntico al presupuesto vigente".
- Datos base desactualizados: banner ámbar con botón "Actualizar escenario" (recalcula y versiona).

---

## D. Gobernanza y auditoría

- Escenarios son drafts personales del admin; compartir lectura con consejo (rol auditor puede ver, no editar — extender t-matrix).
- Al convertir escenario→borrador de presupuesto: registrar en audit_log `{escenario_id, acta_asamblea_opcional, usuario}`. Campo opcional `acta_ref` para vincular el acta firmada (conexión con punto 1B firma digital).
- Descartado conservador: nunca borrar escenarios presentados en asambleas (trazabilidad histórica de decisiones).

## E. Tests requeridos (patrón del repo)

- Unitarios del motor: mismas invariantes que liquidar() (reconciliación exacta Σ=cuota, determinismo, redondeo único).
- Propiedad crítica: **escenario con parámetros identidad == resultado del presupuesto vigente** (regresión contra drift del motor).
- Integración: reproducibilidad del hash; conversión escenario→borrador respeta maker-checker; escenario marcado obsoleto cuando cambia el set de coeficientes.
- Fixtures de rendimiento: copropiedad de 800 unidades × 12 periodos < 500ms (para UI reactiva).

## F. Orden de implementación

1. Función pura `proyectar()` en kernel + tests de invariantes.
2. Edge Function `proyectar-escenario` (calculo on-demand) + esquema `presupuesto_escenarios`.
3. UI workspace: editor con sliders + tabla comparativa por cuenta.
4. Impacto por inmueble + buscador en vivo.
5. Export PDF de asamblea.
6. Puente escenario→borrador de presupuesto + ganadores/perdedores para coeficientes.

## G. Por qué es diferenciador real

Ningún competidor PH colombiano ofrece proyecciones con el motor exacto de liquidación (decimal exacto, mayor-resto, reconciliaciones): todos hacen estimaciones aproximadas en Excel. Aquila puede garantizar que el número que la asamblea aprueba es EXACTAMENTE el que liquidará el sistema después — elimina la brecha presupuesto-promesa vs liquidación-real, que es la fuente #1 de conflictos entre administradores y consejos. Y cuesta poco: reutiliza motor puro, snapshot builder, patrón de sellos/hash y design system existentes.
