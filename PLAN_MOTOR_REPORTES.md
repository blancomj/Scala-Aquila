# PLAN RPT — Motor de Reportes de AQUILA

## 1. Contexto

El 2026-09-15 se presentó `Casos de uso/Informes/PROMPT_MAESTRO_IMPLEMENTACION_MOTOR_REPORTES_AQUILA.md`
(3.346 líneas, 114 secciones) junto con cuatro referencias visuales. Este archivo es el
resultado de evaluarlo contra el repositorio real y la **única fuente de ejecución** del
módulo — el prompt original queda como material de referencia, no como contrato.

**Veredicto de la evaluación: núcleo aceptado, ~30 % del alcance rechazado, 8 decisiones
ajustadas.** El diagnóstico del prompt es correcto y verificable: hay **once puntos de
exportación dispersos**, ninguno compartido, todos operando sobre los datos ya pintados en
pantalla —

| Vía | Archivos |
| --- | --- |
| `xlsx` | `contabilidad/{libros,movimientos,estados-financieros,tributario}.vue`, `recaudo/index.vue`, `PresupuestoTabEjecucion.vue`, `stores/libros.ts` |
| `pdfmake` | `contabilidad/{libros,estados-financieros}.vue`, `gobierno/actas/[id].vue`, `gobierno/tablero.vue`, `mantenimiento/salud/escenarios.vue` |

— y no existe ningún `packages/*` ni `utils/` que centralice nada de esto. El caso de
negocio es real. Lo que no es aceptable es el dimensionamiento: el prompt propone
infraestructura (cola de ejecución, workers, caché, DSL propio, 8 agentes en paralelo,
12 fases) para un problema que AQUILA no tiene.

## 2. Qué ya existe (base reutilizable, confirmado por código)

| Pieza | Dónde | Qué aporta |
| --- | --- | --- |
| Cartera ya calculada y congelada | `posiciones_cartera_snapshot` (deuda por concepto, días de mora, clasificación, `posicion_hash`) | Fuente #1 sin recalcular nada — la autoridad de cartera ya produjo el número |
| Saldo por cargo derivado | `v_cargo_saldo`, vista **con `security_invoker = true`** | Fuente #2 lista: RLS del invocador aplica sola |
| Recaudo | `pagos` + `pago_aplicaciones` (ambas append-only) | Fuente #3 |
| Tabla de pantalla | `UiTabla.vue` — filas de grupo, `colspanGrupo`, totales, orden emitido | El `ScreenRenderer` es casi gratis |
| Registro de campos validado | `COMPOSITOR_FIELD_REGISTRY` + `validateTemplateBodyAgainstRegistry()` | Patrón probado de *field registry*, se imita para el catálogo |
| Códigos de error centralizados | `packages/shared/src/error-codes.ts` + `tests/governance/error-codes-coverage.test.ts` | Los `RPT_*` van ahí; **no** se crea registro nuevo |
| Cron → Edge Function | `cartera-cron-diario`, `net.http_post` (6 migraciones), `CRON_SECRET` en `enviar-estados-cuenta-pendientes` | El scheduler de RPT-05 no inventa patrón |
| Entrega documental probada | `estados_cuenta_generados` + bucket privado + enlace firmado (`link_token.ts`, HMAC 30 días) + `comprobante-cuenta/[id].vue` | El camino de entrega de RPT-05 |
| SQL dinámico con lista blanca | `fn_resetear_copropiedad` (`execute format('… public.%I …') using $1`) | Precedente del compilador |
| Inventario de reportes por módulo | `Casos de uso/Gobierno/INFORME_INVENTARIO_REPORTES_MODULOS_EXISTENTES.md` (2026-09-05) | La "Fase 0" del prompt ya está medio hecha — **actualizar, no rehacer** (declara que Mantenimiento no existe; hoy existe con 12+ `mant_indicador_*`) |

## 3. Qué NO existe (y el prompt da por resuelto)

- **Permisos por módulo.** `apps/web/app/types/permissions.ts` tiene **3 roles y 12 permisos
  genéricos**; `auxiliar` los tiene todos, incluido `tenant:delete`. La matriz se valida
  cruzadamente contra las políticas SQL en `tests/rbac/t-matrix.test.ts`. Los 9 permisos
  `REPORTES_*` del prompt §56 romperían ese contrato o crearían el segundo sistema de
  autorización que su propio §110 prohíbe.
- **Generación de PDF en servidor.** `pdfmake` vive solo en 5 páginas Vue (cliente). La
  migración `20260822100000` documenta un PDFShift que **no existe en el código**: hoy el
  estado de cuenta se entrega como enlace firmado a una página Nuxt propia. AQUILA no
  genera hoy ni un solo PDF fuera del navegador.
- **Cualquier noción de reporte como entidad.** Cero tablas, cero rutas (`/reportes` no
  existe), cero definiciones versionadas.

## 4. Decisiones cerradas

Aprobadas por el usuario el 2026-09-15 (puntos 1-3) o derivadas de la evaluación (4-10).
Se registran en `DECISIONES.md` como **D-136**.

| # | Decisión | Razón |
| --- | --- | --- |
| **R-01** | **Se mapea a los 12 permisos existentes**, sin permisos nuevos: ejecutar/ver → `data:read`; crear/editar/publicar/programar → `settings:manage`; historial → `audit:view`. | Granularidad por módulo es un cambio de RBAC global, no un detalle de Reporting. Evita romper T-MATRIX y el segundo sistema de autorización. |
| **R-02** | **PDF: patrón probado.** Ejecución interactiva → `pdfmake` en cliente. Ejecución programada → **XLSX/CSV adjunto + enlace firmado** a la ejecución (HMAC de `link_token.ts`, bucket privado), igual que el estado de cuenta. Ninguna dependencia nueva, ningún servicio externo. | El PDF de servidor sigue sin resolverse en el repo; resolverlo no es prerrequisito del motor. |
| **R-03** | **V1 solo reportes tabulares.** Envolver los documentos formales que ya existen (estado de cuenta, expediente de cobro, informe de auditoría, certificación de deuda, actas) queda **comprometido para una fase posterior**, no descartado. | Tienen folio/hash y semántica propia; modelarlos en V1 multiplicaba el alcance. Si el motor nunca los absorbe, quedan dos sistemas documentales en paralelo — por eso queda comprometido. |
| **R-04** | **Ejecución síncrona**, con límite de filas y `statement_timeout`. Sin cola, sin estados `QUEUED/RUNNING/CANCELLED/EXPIRED`, sin workers, sin reintentos, sin compresión ni partición de archivos. `reporte_ejecuciones` sí se crea: su valor es el historial, no la gestión de cola. | Medición real contra producción (2026-09-15): **8.730 inmuebles, 8.496 cargos, 11.497 filas de `audit_log` en toda la base**, todos los tenants juntos. Un reporte se acota siempre a un tenant (AD-24). La asincronía se activa cuando una medición la exija, no antes (§103 del propio prompt). |
| **R-05** | **Sin lenguaje de expresiones en V1.** Nada de DSL propio (§12) ni de reutilizar AEL. Lo que el usuario necesita calcular lo entrega el catálogo como **campo derivado o métrica certificada**, escritos por nosotros en SQL, versionados y probados. | AD-21/AD-23 prohíben expandir el aparato de lenguajes sin caso de negocio. Y AEL no sirve: su runtime tiene 4 funciones (`MIN`, `MAX`, `PORCENTAJE`, `REDONDEAR_DINERO`) y evalúa en TS sobre `TypedValue` — no compila a SQL. |
| **R-06** | **Mecanismo de ejecución: `fn_reporte_ejecutar(p_definicion jsonb, …)`**, plpgsql, **`SECURITY INVOKER`**, `set search_path = ''`. Arma el SQL con `format(%I)` usando **solo identificadores resueltos contra el catálogo en base**, nunca del payload; **todos los valores viajan por `using $1..$n`**. Nunca `service_role`. | Es la contradicción que el prompt nunca resuelve (§59/§74 vs §20-24). `SECURITY INVOKER` hace que la RLS del usuario aplique sola: no se reimplementa tenancy ni se replica la matriz de seguridad. Precedente: `fn_resetear_copropiedad`. |
| **R-07** | **Catálogo global sembrado por migración**, sin `tenant_id`: `reporte_fuentes` y `reporte_campos` son solo-lectura para `authenticated` y nadie puede escribirlas en runtime. | El catálogo es el guard de seguridad del compilador. Si un tenant pudiera escribirlo, el guard no existe. |
| **R-08** | **Categoría → `lista_tipos`** (`CATEGORIA_REPORTE`). Formato y estado de ejecución → `text` + `check`. **Un solo enum**: `reporte_version_estado_t` (`BORRADOR/PUBLICADA/ARCHIVADA`), con su `COMMENT ON TYPE`. | D-24. Categoría es vocabulario descriptivo; solo el ciclo de vida de una versión gatilla transiciones reales. |
| **R-09** | **Las métricas apuntan a las funciones que ya alimentan las pantallas** (`fn_dashboard_cartera`, `presupuesto_cuenta_ejecucion`, `mant_indicador_*`, `posiciones_cartera_snapshot`), nunca a consultas nuevas equivalentes. | Es el §11 del prompt ("una sola definición"), su mejor aporte. Si el motor consulta las tablas por su cuenta, en tres meses hay dos cifras de cartera distintas y la culpa es del motor. |
| **R-11** | **Una fuente = UNA vista ya aplanada** (`vr_*`, `security_invoker`). Todos los joins de una fuente se resuelven en su vista, en una migración revisable; el compilador nunca arma un join dinámico. | Añadida al cerrar RPT-01. Deja el compilador en `select <campos> from <vista> where … group by … order by …` —auditable de un vistazo— y acota la superficie de ataque a lo que esas vistas exponen. |
| **R-10** | **Cinco cortes secuenciales** (RPT-01…RPT-05), un agente por corte, numeración de migraciones desde el ledger. Se descarta el modelo de 8 agentes en paralelo (§84-85) y las 12/13 fases contradictorias (§71-83 vs §112). | El repo trabaja por cortes con `MIGRACIONES_LEDGER.md` y `DECISIONES.md`; sesiones paralelas ya causaron una colisión de migraciones real. |

**Ruta canónica: `/reportes`.** No existe hoy. `/mantenimiento`, que sugiere §17, sería un error.

## 5. Modelo de datos

Ocho tablas en total (el prompt proponía once), repartidas entre los cortes que las necesitan.

```text
CATÁLOGO — global, sembrado por migración, solo lectura (R-07)
  reporte_fuentes    codigo, nombre, descripcion, modulo, objeto_sql, filtro_obligatorio,
                     permiso_requerido, activa
  reporte_campos     fuente_id, codigo, etiqueta, tipo_dato, clase ('dimension'|'metrica'),
                     expresion_sql, agregacion_default, operadores_permitidos,
                     filtrable, ordenable, agrupable, sensibilidad

DEFINICIÓN — por tenant, RLS
  reportes           tenant_id, codigo, nombre, categoria_id→lista_tipos, del_sistema,
                     creado_por
  reporte_versiones  reporte_id, version, estado reporte_version_estado_t, definicion jsonb,
                     publicada_por, publicada_at        ← publicada = inmutable (trigger)

EJECUCIÓN — por tenant, RLS, append-only
  reporte_ejecuciones  tenant_id, reporte_id, version_id, parametros jsonb, origen,
                       ejecutado_por, iniciado_at, duracion_ms, filas, formato,
                       exito boolean, error_codigo        (RPT-01)
  reporte_artefactos   ejecucion_id, storage_path, mime, bytes, sha256, expira_at (RPT-04)

PROGRAMACIÓN — por tenant, RLS
  reporte_programaciones  reporte_id, version_id, frecuencia, hora, zona_horaria,
                          parametros jsonb, formato, activa                        (RPT-05)
  reporte_suscripciones   programacion_id, profile_id | correo                      (RPT-05)
```

`definicion jsonb` guarda campos, alias, filtros, parámetros, agrupación, orden y
presentación. Es configuración compleja sin consultas propias → JSONB, como pide §15. Todo
lo que necesita índice, estado, ciclo de vida o auditoría queda relacional.

**Zona horaria (R-02/§48):** `reporte_programaciones.zona_horaria` se guarda explícita
(`America/Bogota` por defecto, no hardcodeada). Ver la memoria sobre ventanas
`timestamptz` sin zona: el cast `date→timestamptz` usa el `TimeZone` de la sesión.

## 6. Cortes

Cada corte cierra con el ciclo del repo (`READ → … → COMMIT`), `pnpm verify` en verde,
fila en `MIGRACIONES_LEDGER.md` (RPT-01 arranca en `20260938000000`) y entrada en
`DECISIONES.md`. La Definición de Done de PLAN §9.1 aplica íntegra: RLS `ENABLE + FORCE`
en la misma migración que crea la tabla, tipos por `pnpm db:types`, pruebas unitarias +
RLS + integración, cobertura ≥80 %.

### RPT-01 · Catálogo y ejecución — **CERRADO 2026-09-15 (D-137), local; falta producción**
Las 5 tablas del núcleo + `fn_reporte_ejecutar` + **3 fuentes reales**: Cartera por
inmueble (`posiciones_cartera_snapshot`), Cuenta corriente (`v_cargo_saldo` + `inmuebles`
+ `periodos` + `conceptos`), Recaudos (`pagos` + `pago_aplicaciones`). Pantalla mínima:
listar reportes del sistema, ejecutar, ver la tabla. Sin diseñador.
**Prueba de que funciona:** un reporte del sistema se ejecuta y muestra cifras que
coinciden con las de la pantalla del módulo correspondiente.
**Seguridad (la prueba que manda):** tenant A no ve datos de tenant B a través de
`fn_reporte_ejecutar`; un campo fuera del catálogo es rechazado; un valor de filtro con
comillas/`;` viaja por `using` y no altera la consulta.

### RPT-02 · Diseñador — **CERRADO 2026-09-15 (D-138), local; falta producción**
Campos, alias, filtros, parámetros (incluida la cascada Torre → Inmueble; **sin**
"Administración/Copropiedad", que choca con AD-24: el tenant *es* la copropiedad), orden,
agrupación con subtotales, vista previa a 100 filas, borrador con autosave por *debounce*,
publicación inmutable, aviso de cambios sin guardar.
**Prueba:** crear, previsualizar, validar, publicar y ejecutar un reporte propio; editar
la versión publicada crea la v2 y la v1 queda intacta.

### RPT-03 · Renderers — **CERRADO 2026-09-15 (D-139), local; sin migraciones**
`packages/reporting` con `ScreenRenderer` (sobre `UiTabla`), `XlsxRenderer`, `CsvRenderer`
(UTF-8 con BOM, escape correcto) y `PdfRenderer` de cliente reutilizando el patrón de
`contabilidad/libros.vue`. **Migración de un exportador existente** (`recaudo/index.vue`,
el más simple) con la prueba de equivalencia de §88: mismo archivo, mismos totales, antes
de retirar nada.
**Regla:** ningún exportador existente se elimina sin equivalencia demostrada.

### RPT-04 · Centro de Reportes e historial — **CERRADO 2026-09-15 (D-140), local**
Catálogo con búsqueda, categorías, favoritos y recientes; historial de ejecuciones con
detalle (reporte, versión, parámetros, duración, filas, error); artefactos en Storage con
bucket privado y retención (`expira_at`); el historial sobrevive al archivo expirado.
KPIs: solo los que significan algo en una copropiedad de 3-5 usuarios — se descartan
"usuarios que generan" y "descargas del mes" de la maqueta.
**Auditoría:** `audit_log` existente (`reporte.publicado`, `reporte.ejecutado`,
`reporte.programado`), nunca una tabla de auditoría propia (§57).

### RPT-05 · Programación y entrega
`pg_cron` → Edge Function con `CRON_SECRET` (patrón de `enviar-estados-cuenta-pendientes`),
frecuencias Una vez/Diaria/Semanal/Mensual, zona horaria explícita, suscripciones a
miembros del tenant, entrega por Brevo con XLSX adjunto + enlace firmado (R-02), estados
de entrega registrados.
**Seguridad:** un usuario no puede suscribir a un destinatario que no es miembro del
tenant; la programación no puede cambiar de tenant.

## 7. Fuera de alcance V1 (explícito)

Data warehouse, ETL, OLAP · caché · ejecución asíncrona y cola · DSL de expresiones · SQL
libre · gráficos y matrices (RPT-06 si se pide) · diseñador *pixel-perfect* · multicanal ·
Presupuesto y Mantenimiento como fuentes (entran cuando las 3 primeras estén probadas) ·
**envolver los documentos formales existentes (comprometido, R-03)**.

## 8. Riesgos

1. **El motor como segunda verdad.** Mitigado por R-09, y es el riesgo que hay que vigilar
   en cada corte: toda métrica nueva debe señalar qué autoridad la produce.
2. **`fn_reporte_ejecutar` como superficie de inyección.** Mitigado por R-06 + R-07 y por
   pruebas dedicadas; ningún identificador puede venir del payload.
3. **Deriva del catálogo.** Un campo que desaparece del esquema rompe reportes publicados.
   Se cubre con una prueba-guardia que valida `reporte_campos` contra
   `information_schema` — mismo espíritu que `error-codes-coverage.test.ts`.
4. **Colisión de migraciones.** Antes de cada `db:push`, revisar `ls supabase/migrations`
   además de la última fila del ledger.
