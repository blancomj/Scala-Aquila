# Análisis General y Plan de Acción — Aquila PH

**Contexto:** aplicación web SaaS multi-tenant para administración de propiedad horizontal (Colombia). Módulos desarrollados: presupuesto → conceptos → coeficientes → inmuebles → novedades → liquidación → cartera/estado de cuenta. Módulos futuros previstos: cartera avanzada, finanzas, mantenimiento, contabilidad.

**Stack:** monorepo pnpm — Nuxt (Vue 3, Tailwind) + Supabase (Postgres con RLS, Deno Edge Functions) + packages propios (financial-kernel con decimal exacto, liquidation-engine, DSL AEL). Sin server routes de Nitro: todo dato fluye por supabase-js con RLS como enforcement único, o Edge Functions con rol verificado.

---

## Veredicto general

Proyecto **arquitectónicamente maduro para su etapa**, con una base de dominio notable:

- Motor decimal exacto (decimal.js precision 34, nunca floats en el kernel).
- Liquidación en dos tiempos con snapshot inmutable, sello md5 de datos, hash de resultado, lock transaccional de periodo e índices parciales como invariantes.
- Ledger append-only del que derivan ejecución presupuestal, contabilidad y estados de cuenta.
- RLS `FORCE` deny-by-default en 65/66 tablas, audit log inmutable, guards anti-escalada, maker-checker.
- Normativa colombiana correctamente interpretada (Ley 675/2001 arts. 26, 30, 48, 51).

Las brechas **no están en el corazón financiero sino en los bordes**: casos borde temporales, experiencia de extremo a extremo y operación.

---

## Resumen de hallazgos críticos por dimensión

### Seguridad
| Severidad | Hallazgo | Referencia |
|---|---|---|
| 🔴 Alto | `contable_codigo_retirado` sin RLS (única tabla de 66); permite burlar el guard de códigos retirados. Agravado porque el test que lo detecta se salta silenciosamente sin credenciales. | migración 20260830540000; tests/rls/schema-forced-rls.test.ts:15 |
| 🔴 Alto | Endpoint público `ver-estado-cuenta` sin rate-limit, sin auditoría, vigencia 90 días. | supabase/functions/ver-estado-cuenta |
| 🟡 Medio | CSP con `'unsafe-inline'`; tests contra BD dev compartida; carrera en versionado de documentos; rate_limit_hits sin purga; escaneo de secretos incompleto en CI. | nuxt.config.ts:19; subir-documento/index.ts:244 |

### Lógica de negocio
| Severidad | Hallazgo | Referencia |
|---|---|---|
| 🔴 Alto | `fn_aprobar_novedad` no idempotente → cargo duplicado en doble invocación/carrera. | migración 20260827100000 |
| 🔴 Alto | Sumas monetarias en float JS en el snapshot builder (viola la regla decimal-only propia). | snapshot-supabase.ts:386 |
| 🔴 Alto | Sin prorrateo temporal: inmueble que entra/sale a mitad de periodo paga cuota completa (riesgo de cobro indebido). | snapshot-supabase.ts:222 |
| 🟡 Medio | Créditos/saldo a favor no compensan base de mora; tope legal opt-in; conceptos activos editables sin versionamiento efectivo en líneas. | cuenta-corriente.ts:401 |

### UI/UX
| Severidad | Hallazgo | Referencia |
|---|---|---|
| 🔴 Crítico | Onboarding inexistente: crear copropiedad pide 2 campos y deja al admin no técnico en 22 rutas vacías sin guía ni dashboard accionable. | onboarding/create-tenant.vue |
| 🔴 Alto | Sin paginación en toda la app (carga total de cargos/inmuebles al entrar); inutilizable a 300–800 unidades. | inmuebles/index.vue:48 |
| 🔴 Alto | No usable en móvil: sidebar fijo sin drawer, casi cero breakpoints. El caso de uso "consultar saldo desde el celular en asamblea" es imposible hoy. | layouts/default.vue:23 |
| 🔴 Alto | Sin feedback de éxito (cero toasts), validación inline ausente (clicks silenciosos), cero skeletons ("Cargando…" dentro de KPIs). | fundamentos/index.vue:26; cartera/index.vue:313 |
| 🟡 Medio | IA confusa (Contabilidad dentro de Presupuesto, doble "plan de cuentas"), breadcrumb desactivado (`v-if="false"`), jerga interna visible ("GAP-19", nombres de tablas SQL), formatoMoneda duplicado 18 veces con 2 formatos, export PDF batch de estados de cuenta inexistente, dark mode muerto. | varios |

---

## Preparación para módulos futuros

La arquitectura **facilita** la extensión (ledger único derivado, puentes PUC ya sembrados). Antes de crecer hay que resolver:
1. **Resolución de destinatarios de cobranza** — declaradamente inexistente; bloquea automatizar el ciclo.
2. **Prorrateo temporal** — requerido por mantenimiento/ocupación.
3. **Unificar los 4 mecanismos de "dinero a favor"** (CREDIT/REFUND/DISCOUNT, contra-cargos, saldo_a_favor).
4. **Versionamiento efectivo de conceptos** usados en liquidaciones (auditoría fiscal de largo plazo).

---

## Top 10 prioridades accionables (orden sugerido)

| # | Acción | Dimensión | Esfuerzo | Impacto |
|---|--------|-----------|----------|---------|
| 1 | RLS en `contable_codigo_retirado` + CI debe fallar si falta `SUPABASE_DB_URL` (eliminar `describe.skip` silencioso) | Seguridad | Bajo | Alto |
| 2 | Idempotencia de `fn_aprobar_novedad` (revalidar estado + lock dentro de la RPC) | Negocio | Bajo | Alto |
| 3 | Eliminar floats de dinero en `snapshot-supabase.ts` (sumar con Decimal) | Negocio | Bajo | Alto |
| 4 | Onboarding guiado post-creación: wizard/checklist (datos básicos → inmuebles import CSV → coeficientes → cuenta recaudo → primer periodo) + dashboard accionable | UX | Medio | Muy alto |
| 5 | Paginación/carga incremental en Inmuebles y Estado de cuenta | UX/Negocio | Medio | Alto |
| 6 | Sidebar móvil colapsable (drawer + hamburguesa) + scroll horizontal tablas | UX | Medio | Alto |
| 7 | Toast global + validación inline + skeletons en KPIs/tablas | UX | Medio | Alto |
| 8 | Export batch PDF de estados de cuenta (extender generador existente) | UX/Negocio | Medio | Alto |
| 9 | Prorrateo temporal por inmueble (automatizar entrada/salida a mitad de periodo) | Negocio | Alto | Alto |
| 10 | Reorganizar menú (separar Contabilidad de Presupuesto) + reactivar breadcrumb + util único `formatoMoneda` + limpiar jerga interna del UI | UX | Bajo | Medio |

---

## Conclusión estratégica

La inversión más rentable ahora mismo **no es nueva funcionalidad**: es (a) cerrar los bordes de dinero ya construidos (idempotencia, floats, prorrateo, tope legal obligatorio) y (b) hacer visible en la interfaz la calidad que el motor financiero ya tiene (onboarding, feedback, paginación, móvil, export). El flujo de Liquidación demuestra que el equipo domina tanto el rigor financiero como el UX contable cuando se lo propone; replicar ese estándar en el resto de la experiencia es la palanca de adopción más fuerte del producto.

Los informes detallados con evidencia archivo:línea están en:
- `01-evaluacion-seguridad-arquitectura.md`
- `02-evaluacion-logica-negocio.md`
- `03-evaluacion-ui-ux.md`
