# Punto 4 — Importación y Migración de Datos desde Competidores

**Contexto:** análisis del punto crítico #4 del plan de acción de Aquila PH. El mayor costo de cambio del administrador no es la licencia: es **migrar**. Quien migra barato gana cuentas. Este módulo convierte el onboarding (brecha #1 de UX detectada en la evaluación) en una ventaja competitiva medible.

---

## A. Qué se migra y qué NO

### A.1 Inventario de datos fuente (por orden crítico)

| Dato | Obligatorio para operar | Complejidad | Decisión |
|---|---|---|---|
| Inmuebles (código, tipo, área, coeficiente) | ✅ Sí | Baja | Import completo |
| Propietarios / responsables por inmueble | ✅ Sí | Media (emails/teléfonos sucios) | Import con validación |
| **Saldos iniciales / cartera heredada** | ✅ Sí (si no, la mora se calcula mal desde el día 1) | **Alta** | Ver sección C — el punto más delicado |
| Coeficiente set vigente | ✅ Sí | Baja | Validar suma ≈ 1 (aviso, patrón existente Ley 675 art. 26) |
| Presupuesto vigente + conceptos base | Recomendable | Media | Plantilla guiada + import opcional |
| Novedades activas (exenciones, descuentos permanentes) | Recomendable | Media | Mapeo a tipos de novedad existentes |
| Historial completo de pagos (años atrás) | ❌ No para operación | Alta | Solo resumen opcional; el ledger empieza limpio |

### A.2 Principio rector
El sistema arranca con **estado presente correcto**, no con historia completa. La historia pre-Aquila vive como: saldo inicial envejecido por periodo (para mora) + PDF/reporte histórico adjuntado como documento de referencia (la Edge Function `subir-documento` ya existe). Intentar importar 5 años de ledger ajeno es el error clásico: meses de trabajo, datos inconsistentes, y cero valor operativo adicional.

## B. Fuentes de importación

### B.1 Genérica (el 80% de los casos)
Todo competidor exporta Excel/CSV. Wizard genérico de 4 pasos:
1. Subir archivo → detección automática de encoding/delimitador/hoja.
2. **Mapeo de columnas**: columna fuente → campo destino, con autodetección por nombre ("coef", "coefficiente", "% participación" → `coeficiente`) y plantillas guardadas por formato reconocido (`plantillas_mapeo` por tenant y global).
3. **Vista previa tipo diff** (ver sección D): verde válido / amarillo advertencia / rojo error, con conteos.
4. Confirmar → aplicación transaccional.

### B.2 Específicas por competidor (fase 2)
Formatos más comunes del mercado colombiano: exportaciones de Excel de sistemas tipo MiConjunto/Zafiro, Sisco, Nidux y hojas de cálculo manuales de administraciones pequeñas (el segmento más grande). Implementación: un *perfil de mapeo* precargado por formato conocido (columnas típicas documentadas por cliente real) — no requiere ingeniería inversa profunda, solo plantillas que mejoran con cada migración. Nota legal: interoperabilidad de datos propios del cliente es legítima; nunca solicitar credenciales dentro del sistema del competidor.

### B.3 Bancos (sinergia con punto 2)
Saldos bancarios y convenios de recaudo vigentes: capturarlos en configuración del tenant durante el mismo wizard.

## C. El problema central: saldos iniciales y cartera heredada

Este es donde se gana o pierde la confianza del administrador contable.

### C.1 Por qué un "saldo total" no sirve
El motor de intereses de Aquila devenga mora diaria sobre **capital pendiente por cargo con fecha de origen**. Un solo cargo semilla con el saldo agregado:
- Calcula mora sobre capital que quizá no está vencido,
- Pierde la distinción capital/intereses ya causados (doble cobro potencial de mora sobre mora),
- Impide imputación waterfall coherente (`deuda_mas_antigua` necesita fechas).

### C.2 Solución: saldo inicial envejecido (aged opening balance)
Importar por inmueble una **descomposición por periodo de origen**:

```
saldo_inicial_inmueble:
  inmueble_id, periodo_origen (ej. 2026-03),
  capital_pendiente, interes_acumulado_herado,
  concepto_origen (cuota_ordinaria | cuota_extraordinaria | otro)
```

Y generar **un cargo semilla por periodo vencido** (append-only, marcado `origen=migracion`, exento de sello de liquidación pero sujeto a todos los guards del ledger). Consecuencias:
- El interés de mora retoma exactamente donde lo dejó el sistema anterior (capital por periodo, días de gracia respetando fecha de origen).
- La imputación waterfall funciona nativamente.
- La anulación/corrección de un saldo mal importado usa la mecánica de contra-cargos espejo existente (L6) — nunca borrado.
- Si el administrador SOLO tiene el total (caso frecuente): asistente de desglose — reparte por periodos vencidos usando las cuotas históricas conocidas, o importa como "periodo consolidado" único con fecha origen configurable, dejando aviso permanente de precisión limitada.

### C.3 Reglas fiscales de los saldos heredados
Los intereses ya causados por el sistema anterior son capital nuevo para efectos de trazabilidad pero deben conservarse separados (`interes_acumulado_herado`) para no recomponer mora sobre mora (regla ya implementada en el kernel: intereses no componen).

## D. Patrón de ejecución: simular → aplicar (replicar el patrón estrella del repo)

Aquila ya domina esto en liquidación (snapshot → sello → aplicar transaccional). Replicarlo exactamente:

```
importar-simular (Edge Function):
  parsea archivo → valida fila por fila → construye DiffPreview
  → persiste lote en estado borrador + hash SHA-256 del archivo
  → devuelve resumen: creados/actualizados/advertencias/errores por tipo

UI de revisión (diff):
  verde=crear, amarillo=advertencia (coeficiente duplicado, email inválido→null),
  rojo=error bloqueante (documento repetido, inmueble sin código)
  → el administrador corrige inline o descarta filas

importar-aplicar (Edge Function):
  revalida hash (nadie cambió el archivo bajo sus pies)
  → prevuelo: bloqueos (inmuebles duplicados, suma coeficientes imposible)
             vs avisos (aceptables con confirmación — patrón LiquidacionPanel)
  → aplica TODO en UNA transacción (fn_importar_aplicar)
  → registra en audit_log: hash, usuario, conteos
```

Idempotencia: constraint único natural por `(tenant_id, codigo_inmueble)` + hash de archivo — subir dos veces el mismo CSV produce "ya importado", no duplicados.

## E. Validaciones de negocio (prevuelo)

**Bloqueantes:** código de inmueble duplicado en archivo; documento de identidad duplicado entre personas distintas; suma de coeficientes fuera de tolerancia (bloqueante si >5% de desviación, aviso si menor — alinear con la política del motor); periodo de liquidación ya aplicado cuando se importan cargos de ese periodo.

**Advertencias aceptables:** coeficientes que no suman exactamente 1; emails/teléfonos inválidos (se importan null); unidades sin responsable asignable; fechas de nacimiento imposibles; montos negativos (requieren mapeo a tipo de novedad crédito).

Cada validación debe tener mensaje accionable en español claro (lección del análisis UX: nada de códigos internos tipo "GAP-x" en mensajes).

## F. Integración con onboarding (punto crítico #1 de UX)

La importación ES el paso 2 del wizard de creación de copropiedad:

```
Datos básicos → IMPORTAR (Excel genérico o perfil competidor)
  → Coeficientes (validados en el import) → Cuenta de recaudo
  → Primer periodo/presupuesto → Dashboard activo
```

Con opción "empezar de cero" para copropiedades nuevas sin historial. Métrica del wizard: tiempo hasta primer dashboard con datos reales <30 minutos.

## G. Orden de implementación sugerido

1. Esquema: `lotes_importacion` (hash, estado, conteos), `plantillas_mapeo`, `saldo_inicial_inmueble` + extensión de cargos (`origen=migracion`).
2. Motor puro de parseo/validación (testable sin BD, patrón kernel) + fixtures de archivos reales anonimizados.
3. Edge Functions `importar-simular` / `importar-aplicar` + `fn_importar_aplicar` transaccional.
4. Wizard UI con diff interactivo y corrección inline.
5. Asistente de desglose de saldo consolidado.
6. Perfiles de mapeo por formato de competidor (se alimentan de clientes piloto).
7. Importador de propietarios/vínculos conectado al portal (punto 3, sección B.2).

## H. Métricas de éxito

- % de nuevas copropiedades que completan migración sin intervención de soporte (objetivo >80%).
- Tiempo medio hasta primer periodo liquidado post-migración.
- % de saldos iniciales importados con desglose por periodo vs consolidado (proxy de calidad de cartera heredada).
- Disputas de saldo por parte de propietarios en los 90 días posteriores a la migración (debe tender a cero — es la prueba de que el envejecimiento fue correcto).
