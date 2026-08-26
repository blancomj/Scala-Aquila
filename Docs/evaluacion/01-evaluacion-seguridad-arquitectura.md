# Evaluación de Seguridad y Arquitectura/Infraestructura

**Proyecto:** Aquila PH — SaaS multi-tenant de propiedad horizontal (Colombia)
**Alcance revisado:** 100 migraciones SQL en `supabase/migrations`, 34 Edge Functions en `supabase/functions`, apps/web (Nuxt), packages, tests, CI y scripts.

---

## Veredicto general

Proyecto con una **postura de seguridad inusualmente madura para su etapa**: RLS deny-by-default con `FORCE` en la misma migración que crea cada tabla, helpers de autorización `SECURITY DEFINER` con `search_path = ''` verificados por test, audit_log append-only, y una suite de ~30 tests RLS que golpean Postgres real. Se encontró **1 hallazgo alto de integridad** (tabla sin RLS que viola su propio invariante T-SEC-01), varios riesgos medios documentados-parcialmente-aceptados, y brechas operativas más que criptográficas.

---

## Hallazgos por severidad

### 🔴 CRÍTICO

*No se encontraron hallazgos críticos.* Sin secretos hardcodeados (grep de JWTs `eyJhbGciOi` sobre archivos versionados: limpio), sin `USING (true)` sobre datos de tenant, sin funciones `SECURITY DEFINER` sin `search_path` fijo.

### 🟠 ALTO

**A1. Tabla `contable_codigo_retirado` sin RLS ENABLE/FORCE — viola el invariante SEC-01 del propio proyecto**
- Evidencia: `supabase/migrations/20260830540000_contable_codigos_retirados_y_coherencia_eventos.sql:37-44` crea la tabla; ninguna otra migración le aplica `alter table ... enable row level security`. Es la **única de las 66 tablas** de `public` sin RLS (verificado exhaustivamente contra todas las migraciones).
- Impacto: en Supabase, `authenticated` tiene grants por defecto sobre tablas de `public`. Un usuario autenticado cualquiera puede hacer `SELECT/DELETE` sobre los códigos retirados, **desactivando en la práctica el guard** `guard_contable_codigo_no_retirado()` (línea 65-97) que impide recrear códigos retirados por doctrina CTCP. Es un problema de integridad financiera-contable, no de fuga.
- Agravante: `tests/rls/schema-forced-rls.test.ts:70-74` debería estar fallando por esto (`expect(sinRls).toHaveLength(0)`). Que pase significa que **el test se está saltando silenciosamente** (`describe.skip` cuando falta `SUPABASE_DB_URL`, línea 15) o no corre contra una BD actualizada. La red de seguridad existe pero no está sonando.

**A2. Endpoint público `ver-estado-cuenta`: datos financieros completos sin sesión, sin rate-limit, sin auditoría**
- Evidencia: `supabase/functions/ver-estado-cuenta/index.ts:17-19` ("Sin rate-limit por IP… riesgo aceptado"), líneas 44-55 usa `service_role` directamente y devuelve el ledger completo (`datos`) de cualquier `estados_cuenta_generados.id`.
- El modelo es capability-URL (UUID v4 no adivinable) — defendible — pero: (a) no hay ningún registro de acceso anónimo a datos financieros en `audit_log`; (b) el enlace es válido **90 días** (línea 24); (c) al ser la única función sin `withSupabase({auth:'user'})`, escapa también del patrón común de protección; (d) si el enlace aparece en logs de proxy, historial de navegador o se reenvía por WhatsApp (caso de uso esperado), quien lo tenga lee saldos y movimientos de un tercero. Está *documentado* como riesgo aceptado, pero no tiene mitigación técnica alguna.

### 🟡 MEDIO

**M1. Suite de integración golpea una base compartida y se salta silenciosamente sin credenciales**
- `tests/rls/schema-forced-rls.test.ts:15` (`const d = dbUrl ? describe : describe.skip`), mismo patrón en `tests/rbac/t-matrix.test.ts:47`. Los jobs `verify`/`coverage` de CI cargan secretos, pero cualquier ejecución local parcial produce verde engañoso. Además todos los tests RLS/tenancy crean y borran tenants/usuarios reales **en el mismo proyecto dev remoto** que usa la app — sin BD efímera por corrida; dos ejecuciones concurrentes pueden interferirse.

**M2. CSP con `'unsafe-inline'` en `script-src`**
- `apps/web/nuxt.config.ts:19`. Documentado como limitación conocida (Nuxt SSR sin nonces). Con sesión Supabase en cookies/localStorage del mismo origen, un XSS exitoso roba tokens; la CSP es la mitigación principal y está debilitada exactamente donde más importa. Recomendación: módulo `nuxt-security`.

**M3. Tokens de sesión en query string (flujo dev-login)**
- `scripts/dev-login.mjs:62` construye `${appUrl}/dev-login?access_token=...&refresh_token=...`; `apps/web/app/pages/dev-login.vue:12-14` devuelve 404 fuera de dev (bien), pero el token viaja por URL (queda en historia/logs de proxies locales). Riesgo contenido a desarrollo; mencionar porque el patrón tiende a copiarse.

**M4. Carrera en cálculo de versión de documentos**
- `supabase/functions/subir-documento/index.ts:244-257`: lee `v_documento_vigente.maybeSingle()` y luego inserta `version = vigente + 1` sin lock ni constraint único `(tenant_id, tipo_documento_id, ..., version)` visible. Dos uploads concurrentes del mismo alcance pueden producir versiones duplicadas.

**M5. `rate_limit_hits` sin purga**
- `supabase/migrations/20260814170000_rate_limiting.sql:18-30`: tabla de ventana deslizante sin job de limpieza (sí existe purga para `audit_log` en `20260814190000`). Crecimiento indefinido degrada el `count(*)` por bucket con el tiempo.

**M6. Escaneo de secretos casero en CI**
- `.github/workflows/ci.yml` job `secretos`: solo detecta el prefijo JWT `eyJhbGciOi` y valida que `.env.example` esté vacío. No cubre claves Brevo (`xkeysib-`), tokens de Supabase (`sbp_`), ni genéricos. Un secreto no-JWT pasaría desapercibido.

**M7. `grant all` sobre vista `v_cargo_saldo`**
- `supabase/migrations/20260830650000_descuento_pronto_pago.sql:138`: concede INSERT/UPDATE/DELETE sobre la vista a `authenticated`. Con `security_invoker = true` la RLS de `cargos` aplica, pero conceder DML completa sobre una vista derivada es superficie innecesaria; bastaba `grant select`.

### 🟢 BAJO

- **B1. Mensaje de error desalineado con el rol exigido** — `subir-documento/index.ts:203` exige rol `'auxiliar'` pero el error dice "Solo un agent puede subir documentos" (línea 212).
- **B2. Políticas `SELECT ... using (true)` en catálogos globales** — aceptable por diseño (`tipos`, `tasas_referencia`, `rol_funcional_modulo`, `presupuesto_cuenta_plantilla`, `contable_plan(_cuenta)`): son catálogos de plataforma de solo lectura. Documentarlo como lista explícita de excepciones revisables.
- **B3. Logging solo a stdout** — `apps/web/server/utils/logger.ts:19`. Correcto en formato y disciplina (nunca meta sensible), pero sin retención/transporte definido.
- **B4. HSTS sin `preload` y sin redirección HTTPS a nivel app** — `nuxt.config.ts:47`; delegado al hosting.
- **B5. `db-push.mjs` pasa la cadena de conexión como argumento** (`--db-url $dbUrl`, línea 91) → visible en listado de procesos durante la ejecución; local-only, riesgo menor.

---

## Fortalezas destacables

1. **Deny-by-default real**: las 65/66 tablas nacen con `enable + force row level security` en la misma migración (`20260813190100_core_tables.sql:26-27` y resto).
2. **Disciplina `SECURITY DEFINER`**: todos los definers declaran `set search_path = ''` con nombres cualificados, y hay un **test de esquema que lo verifica en `pg_proc`** (`schema-forced-rls.test.ts:80-106`).
3. **Separación de planos de autorización**: `is_platform_admin()` totalmente separado del rol de tenant; la única elusión de RLS (`platform_tenant_overview`) está deliberadamente acotada a metadatos y protegida por test dedicado.
4. **Guards de escalada en triggers**: `guard_privileged_columns`, `guard_self_modify`, `guard_last_agent` (≥1 agent activo), `guard_active_tenant`.
5. **Audit log verdaderamente append-only**: sin políticas de mutación **y** trigger `forbid_mutation` para todo rol.
6. **Invitaciones bien hechas**: token aleatorio de 32 bytes, solo `sha256(token)` en BD, transacción atómica con `for update`, backstop de unique violation.
7. **Superficie de escritura mínima**: pagos, liquidaciones y documentos sin política INSERT para `authenticated`; todo vía Edge Function con verificación de rol previa al uso de `service_role`.
8. **Contrato uniforme en Edge Functions**: las 34 funciones usan `withSupabase({auth:'user'})`, zod para payloads, rate-limit antes de efectos secundarios, correlationId en toda respuesta y headers `nosniff`/`no-store`.
9. **Frontend honesto sobre su papel**: `rbac.ts` se declara explícitamente "barrera de UX" y remite a RLS como barrera real; tokens jamás persistidos a mano.
10. **Tests de paridad TS↔SQL**: `t-matrix.test.ts` ejecuta operaciones reales como `agent`/`auditor` y contrasta con `hasPermission()` — detecta divergencia entre matriz de frontend y políticas SQL.
11. **CI con conciencia de secretos**: chequeo de JWTs versionados, `.env.example` vacío, `.env` no trackeado.

---

## Las 5 brechas más importantes a reforzar

1. **Cerrar A1 y volver confiable la red de seguridad**: `alter table public.contable_codigo_retirado enable row level security; force ...` (sin políticas = deny-by-default, solo la alcanza el guard definer). Además, eliminar el patrón `describe.skip` silencioso: si falta `SUPABASE_DB_URL` en CI, el pipeline debe fallar, no saltarse.
2. **Endurecer `ver-estado-cuenta`**: rate-limit por IP, registrar cada acceso en `audit_log`, reducir vigencia de 90 días, evaluar token HMAC con expiry en lugar de UUID puro.
3. **Aislar la base de pruebas**: usar Supabase Branching (o proyecto efímero por corrida de CI) para tests RLS/tenancy/e2e, en vez del proyecto dev compartido.
4. **CSP sin `unsafe-inline`**: adoptar `nuxt-security` o nonces manuales para el payload de hidratación de Nuxt. Complementar con gitleaks/trufflehog en CI para cubrir secretos no-JWT.
5. **Blindaje operativo de `db-push --prod`**: añadir `--dry-run` obligatorio antes de prod, snapshot/backup automático previo (`pg_dump`), y pasar la cadena por variable de entorno en vez de argv. Hoy la única barrera es una confirmación interactiva burlable con `echo si |`.

---

## Nota arquitectónica final

La decisión estructural más importante del proyecto es que **no existen server routes de Nitro**: todo dato fluye por (a) supabase-js desde el cliente con RLS como único enforcement, o (b) Edge Functions con rol verificado. Eso concentra la responsabilidad de seguridad en una sola capa (Postgres) — correcto y coherente con la inversión masiva en tests RLS — pero implica que la calidad de esas políticas es todo el perímetro.
