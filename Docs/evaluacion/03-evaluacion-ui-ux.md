# Evaluación UI/UX — Frontend `apps/web` (Aquila PH)

**Alcance real:** 46 páginas en `apps/web/app/pages`, ~75 componentes, 3 layouts, tokens CSS, `DESIGN_SYSTEM.md`, test de gobernanza. Páginas leídas completas: dashboard, presupuesto/index, liquidacion/index + LiquidacionPanel + LiquidacionConfirmar, cartera, estado-cuenta (index/novedades), configuracion/index, onboarding, fundamentos, comprobante-cuenta, UiTabla, NavSidebar, NavBreadcrumb, layouts.

**Usuario típico:** administrador de propiedad horizontal (perfil no técnico, contable) y consejos de administración.

---

## 1. Design system — existe y es de los mejores puntos del proyecto

### Fortalezas
- **Tokens centralizados**: `apps/web/app/assets/css/tokens.css` define escala `brand-*` (oklch hue 255) y `neutral-*`, tipografías self-hosted (Inter/Inter Tight, subset latin es-CO por CSP), radios recalibrados a back-office compacto con historial de decisión documentado.
- **Doc vivo**: `DESIGN_SYSTEM.md:100-102` establece excepciones explícitas ("nunca `<UTable>` directo — usar `<UiTabla>`"; "nunca `<USelectMenu>` — usar `<UiSelectorBuscable>`") con justificación técnica.
- **Gobernanza automatizada**: `tests/governance/design-system-coverage.test.ts` bloquea hex hardcodeado, fuentes fuera de Inter/Inter Tight y clases `gray-*` nuevas, con *allowlist* congelado de 66 archivos legado. Raro incluso en proyectos senior.
- **Reuso genuino**: `UiTabla.vue` es una tabla headless genérica bien diseñada; los drawers/fichas comparten `ficha-inmueble.css` con variables mapeadas a tokens.

### Debilidades
- **[ALTA] Dark mode muerto**: cientos de clases `dark:` en todo el código pero **no existe ningún toggle de tema ni configuración de colorMode**. El 50% del CSS condicional nunca se verifica visualmente. Además el sidebar es "oscuro fijo… a propósito" (`NavSidebar.vue:50-55`), creando una mezcla extraña.
- **[MEDIA] Doble subsistema visual**: `.ficha-inmueble.css` (28KB) convive con Tailwind/Nuxt UI como "otro subsistema de diseño". `configuracion/index.vue:92-94` renderiza breadcrumb propio dentro de la ficha mientras el breadcrumb oficial del layout está desactivado (`layouts/default.vue:40`).
- **[ALTA] Duplicación masiva de lógica de formato**: `formatoMoneda` copiado **18 veces**, con dos formatos distintos: la mayoría usa `Intl...currency COP`, pero `inmuebles/index.vue:79-81` usa `$ ${Math.round(valor).toLocaleString('es-CO')}` (sin símbolo correcto ni agrupación idéntica). Riesgo directo de cifras inconsistentes entre pantallas contables.
- **[BAJA]** Iconos SVG a mano como paths sueltos pese a tener `@iconify-json/lucide` instalado; dos sistemas de iconos conviven.

---

## 2. Arquitectura de navegación / IA

**Estructura** (`utils/navegacion.ts:71-259`): Inicio + Mis copropiedades + 5 grupos acordeón (Cartera 3 ítems, Estado de cuenta 4, Presupuesto 9, Configuración 9, Seguridad 3).

| Severidad | Hallazgo | Evidencia |
|---|---|---|
| ALTA | Grupo "Presupuesto" es un cajón de sastre de **9 módulos heterogéneos**: liquidación, plan de cuentas contable, mapeo, movimientos, fundamentos normativos, dependencias. El usuario contable no espera encontrar "Liquidación" bajo "Presupuesto". | `navegacion.ts:120-185` |
| ALTA | **Breadcrumb deshabilitado** en producción: `<div v-if="false">` con `<NavBreadcrumb />`. En un app de 22 rutas con grupos acordeón que colapsan, el usuario pierde contexto de dónde está. | `layouts/default.vue:38-45` |
| MEDIA | **Doble "plan de cuentas"**: pestaña "Plan de cuentas" dentro de Presupuesto vs página "Plan de cuentas contable". Y "Conceptos" vive en `/estado-cuenta/conceptos` pero "Dependencias" (de conceptos) vive en grupo Presupuesto — familia conceptual partida en dos grupos. | `presupuesto/index.vue:12-15` lo admite |
| MEDIA | **Nombres internos que filtran al UI**: la página Fundamentos se autodescribe con ticket interno "**— GAP-19.**"; estado-cuenta muestra nombres de tablas SQL ("*ledger por inmueble (`cargos`/`pagos`/`pago_aplicaciones`)*"); `configuracion/index.vue:147` habla de "`v_inmueble_historico`" y "decisión de arquitectura sin resolver". Lenguaje de desarrollador en cara del usuario final. |
| BAJA | Títulos de grupo en `text-[10.5px] font-mono uppercase` (`NavSidebar.vue:109`) — casi ilegibles y fuera del sistema tipográfico (mínimo permitido text-xs=12px). |
| POSITIVO | Buscador global con debounce, categorías, navegación por teclado y accesos rápidos mitiga parcialmente la IA profunda. |

---

## 3. Patrones UX por página

### Formularios
- **[POSITIVO] Liquidación es el mejor flujo del app**: rediseñado deliberadamente de "botón que hacía todo de golpe e irreversiblemente" a **simular → solicitar → aprobar → aplicar**, con prevuelo de hallazgos (bloqueo/aviso), botón deshabilitado *con motivo visible al lado*, y confirmación escrita del nombre del periodo + motivo obligatorio para anular. Excelente para perfil contable.
- **[ALTA] Validación inline casi inexistente**: los formularios usan `required` HTML o validación silenciosa. Ej.: `fundamentos/index.vue:26-28` — si falta un campo, `crear()` simplemente `return` sin mensaje: el usuario clickea "Registrar" y **no pasa nada, sin feedback**. No hay `useToast` en toda la app (0 resultados).
- **[ALTA] Éxito silencioso**: crear un fundamento limpia el formulario sin confirmación. Solo LiquidacionPanel muestra alerta de éxito. El patrón general es error-only.
- **[MEDIA] Select nativo fuera de sistema** en fundamentos, violando la regla propia del design system.

### Tablas grandes
- `UiTabla` tiene ordenamiento opt-in y estado vacío, pero **no hay paginación en ningún lugar de la app** — todas las filas se renderizan. Con 500+ inmuebles típicos, `inmuebles/index.vue:48-56` carga TODOS los inmuebles + TODOS los cargos abiertos + propietarios al entrar, y filtra en cliente.
- Filtros buenos en Inmuebles (búsqueda + 4 filtros + limpiar) y Novedades (segmented filter con conteos).
- **[MEDIA] Export a Excel solo en 2 módulos**: contabilidad/movimientos y PresupuestoTabEjecucion (lazy import de xlsx, bien hecho). Cartera, estado-cuenta e inmuebles no exportan nada.

### Confirmaciones destructivas
- **[POSITIVO]** `LiquidacionConfirmar.vue` es ejemplar (type-to-confirm con el nombre del periodo, lista numerada de pasos, motivo obligatorio). Pero es el único componente así.

---

## 4. Estados vacíos, skeletons, accesibilidad, responsive, i18n

**Estados vacíos [POSITIVO con matiz]**: consistentes y redactados con siguiente acción. Matiz: son párrafos grises sin CTA-botón; el empty state de primer uso no diferencia "nunca hubo datos" de "filtros excluyeron todo" (novedades sí lo hace).

**Skeletons [ALTA]**: no hay `USkeleton` en toda la app; loading = texto plano "Cargando…" y un solo `animate-pulse`. En cartera se muestra literalmente "Cargando…" dentro de una tarjeta KPI → layout shift y percepción de lentitud.

**Accesibilidad [MEDIA-POSITIVO]**: roving tabindex correcto en tabs, `aria-pressed` en filtros, listbox/option en selector buscable, dialog/modal en drawer. Deudas: `th` sin `aria-sort`; menú de usuario sin roles menu/menuitem ni Escape; mucha información significativa en `text-gray-400`.

**Responsive [ALTA]**: layout `h-screen flex overflow-hidden` con sidebar siempre visible — **sin hamburguesa ni drawer móvil**. En teléfono queda ~60% de pantalla útil tras header+sidebar. Solo 12 matches de breakpoints en todo el código. Las tablas anchas no tienen scroll horizontal propio. Un administrador consultando saldo desde su celular en asamblea — caso de uso obvio — hoy no puede.

**i18n [BAJA por contexto]**: sin i18n; copy hardcodeado en español (aceptable para Colombia), pero textos tipo "GAP-19", nombres de tablas SQL y comentarios internos visibles deben limpiarse.

---

## 5. Performance percibida

- **[POSITIVO] Fetching disciplinado**: `useAsyncData` con keys compartidas y deduplicación SSR en las 30+ páginas; `Promise.all` para cargas paralelas.
- **[MEDIA] Watchers encadenados**: cascada implícita dificulta razonar estados de carga intermedios (3 saltos visuales sin skeletons).
- **[MEDIA] Componentes monolíticos** (>500 líneas): `ConceptosEditor.vue` **1600 líneas**, `NovedadesEditor.vue` 830, `configuracion/agrupaciones.vue` 792, `PresupuestoTabPlanCuentas.vue` 675, `inmuebles/index.vue` 656. Alto costo de mantenimiento e hidratación inicial.
- **[BAJA] Sin paginación/virtualización**: los computed de filtrado re-corren en cada tecla sin debounce.

---

## 6. Onboarding y curva de aprendizaje — el punto más débil

- **[CRÍTICA] Primer día = formulario de 2 campos y un desierto**: `onboarding/create-tenant.vue:66-89` pide Nombre + slug y redirige a `/dashboard`. No hay wizard de setup (inmuebles, coeficientes, cuenta bancaria, concepto base), checklist, datos demo, tour ni ayuda contextual. El dashboard que recibe al admin es genérico y no accionable ("Bienvenido" + conteo de miembros y eventos de auditoría).
- Los empty states dicen qué falta, pero nadie orquesta el orden (¿primero inmuebles? ¿coeficientes? ¿presupuesto?). Para el perfil objetivo — administrador de PH no técnico — esto es la mayor barrera de adopción.
- **[POSITIVO]** La ayuda textual embebida es buena donde existe: explicación de por qué la fecha de vencimiento importa para mora, y distinción cuota estimada vs cálculo real en simulación — transparencia contable correcta.

---

## 7. Errores comunes de UX contable

| Severidad | Hallazgo |
|---|---|
| ALTA | **Trazabilidad de cifras débil fuera de presupuesto/liquidación**: estado de cuenta resuelve "Concepto / origen" por mapa pero sin link al cargo/liquidación originante. En presupuesto sí hay rastreador de ciclo de 4 pasos con cuadre visible. |
| ALTA | **Export/impresión insuficiente**: solo el comprobante público imprime. El admin no puede imprimir/exportar estados de cuenta de VARIOS inmuebles, ni cartera, ni inmuebles. Solo 2 exports XLSX en toda la app. El entregable mensual físico/legal del administrador no existe. |
| MEDIA | Formato monetario inconsistente entre pantallas (18 implementaciones, 2 formatos distintos) — bug perceptual en app contable. |
| POSITIVO | Transparencia de fórmulas: `tabular-nums` consistente, totales alineados bajo columna, distinción estimado vs calculado. |

---

## Inconsistencias UI detectadas (lista plana)

1. Dos sistemas de formato de moneda (18 copias, 2 formatos).
2. Breadcrumb oficial desactivado vs breadcrumb propio en ficha.
3. `<select>` nativo estilizado a mano en fundamentos vs componentes del sistema en el resto.
4. Tres sistemas de tabs (UTabs, tabs ARIA manuales, tabs legacy de ficha-inmueble).
5. Menús desplegables hechos a mano teniendo `UDropdownMenu`.
6. `text-gray-400` vs `text-muted` vs `text-gray-500` para el mismo rol semántico entre páginas vecinas.
7. Iconos-SVG-por-grupo coloreados múltiples acentos, contra la regla "un solo acento".
8. Empty state a veces con acción, a veces solo descripción.
9. Dashboard de inicio (`/dashboard`) genérico vs "Dashboard de Cartera" (`/cartera`) bueno: dos dashboards y el landing no es el bueno.

---

## Top 10 mejoras priorizadas (justificadas para el administrador de PH)

1. **Onboarding guiado post-creación (wizard/checklist)** — Al crear la copropiedad, guiar: datos básicos → inmuebles (import CSV) → coeficientes → cuenta de recaudo → primer periodo. Hoy el admin no técnico enfrenta 22 rutas vacías sin saber por dónde empezar; causa #1 de abandono en trials SaaS.
2. **Paginación/carga incremental en Inmuebles y Estado de cuenta** — Copropiedades de 300–800 unidades harán estas tablas inutilizables; hoy se cargan todos los cargos abiertos al entrar.
3. **App usable en móvil** — Sidebar colapsable a drawer con hamburguesa + scroll horizontal en tablas. El admin consulta saldos y morosos desde el celular en reunión de consejo; hoy literalmente no cabe.
4. **Exportar/impresión masiva de estados de cuenta** — Extender el generador existente a "todos los inmuebles con saldo" en PDF batch. Es el entregable mensual físico/legal.
5. **Feedback de éxito global (toasts)** — Introducir `useToast` para creaciones/actualizaciones; hoy crear exitosamente se siente igual que un click fallido.
6. **Skeletons en tarjetas KPI y tablas** — Reemplazar "Cargando…" por placeholders de altura fija; elimina layout shift y percepción de lentitud.
7. **Reorganizar el menú: separar "Contabilidad" de "Presupuesto"** — Grupo Financiero: Presupuesto / Liquidación / Contabilidad / Fundamentos. Renombrar "Plan de cuentas" (presupuesto) a "Estructura presupuestal".
8. **Unificar formatoMoneda en un util único** (`utils/formato.ts`) — corrección trivial con impacto directo en confianza contable.
9. **Reactivar el breadcrumb del header** — Ya está construido y probado; quitar `v-if="false"`.
10. **Resolver dark mode: toggle o eliminación** — Decidir y gobernar (switch en menú de usuario o remover las clases).

**Mención honrosa**: limpiar jerga interna del UI ("GAP-19", nombres de tablas SQL, "decisión de arquitectura sin resolver").

---

## Veredicto general

Frontend **técnicamente maduro e inusualmente bien documentado** (comentarios que explican el "porqué" de cada decisión de UX difícil, gobernanza automatizada del design system, flujo de liquidación de dos tiempos ejemplar con confirmaciones type-to-confirm). Las brechas están en la **experiencia de extremo a extremo**: sin onboarding real, sin paginación, sin móvil, sin feedback positivo global y con un landing que no refleja el valor del producto. Ninguna de las 10 mejoras requiere re-arquitectura; la mayoría extiende patrones que el código ya sabe hacer bien (Liquidación demuestra que el equipo domina el UX contable cuando se lo propone).
