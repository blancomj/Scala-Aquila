# Punto 7 — Plataforma y Operación SaaS

**Contexto:** análisis del punto crítico #7. Hoy Aquila tiene un producto; le falta la **máquina de negocio** que lo hace escalable: cobrar por él, observarlo en producción, sobrevivir a desastres y escalar. Ninguno requiere re-arquitectura: extiende patrones existentes.

---

## A. Billing multi-tenant propio (cobrar el software)

### A.1 Modelo comercial y metering
- **Unidad de cobro: unidades habitacionales activas** (inmuebles con vínculo vigente) — métrica justa, auditable desde el propio esquema (`v_inmueble_historico`), y alineada con cómo los administradores dimensionan su operación.
- Planes (esbozo): Inicial (≤50 unidades, módulos core), Profesional (≤300, + portal propietario + pasarelas), Enterprise (ilimitado, + asambleas + API). Feature gating declarativo:

```
planes: id, nombre, max_unidades, precio_mensual
plan_modulos: plan_id, modulo, habilitado   -- catálogo global, patrón lista_tipos
suscripciones_tenant: tenant_id, plan_id, estado (trial|activa|en_mora|cancelada),
  trial_hasta, proximo_cobro, unidades_facturables_snapshot
```

- **Trial estructurado**: 30 días completos sin tarjeta; al día 25, banner + email con checklist de adopción (conexión directa con onboarding). El trial vencido NO borra datos: modo lectura (rol RLS de solo lectura global) hasta definir — recuperar cuentas dormidas es más valioso que castigar.
- **Snapshot de facturación**: el conteo de unidades se congela al inicio del ciclo (patrón sello) para que la factura no varíe por movimientos intradía.

### A.2 Cobranza del SaaS
- Reutilizar los adaptadores de pasarela del punto 2 (suscripción = cargo recurrente con tokenización de medio de pago cuando el proveedor lo permita; Wompi/PayU tienen cobros recurrentes).
- Dunning automático: reintento 3/5/8 días + notificaciones; suspensión solo tras ciclo completo fallido (nunca durante un cierre de liquidación — regla dura).
- **Impuestos del SaaS**: Aquila factura IVA (servicio digital/software) con factura electrónica DIAN propia — separar claramente esta capa de la facturación PH del punto 1 (dos regímenes distintos en la misma plataforma).

## B. Observabilidad productiva

Hallazgo previo aplicable: `cartera-job.ts` corre diario **silenciosamente** — si falla nadie sabe. Mínimo viable:

| Capa | Herramienta/patrón | Qué resuelve |
|---|---|---|
| Errores frontend/backend | Sentry (o GlitchTip self-hosted) | Stack traces reales vs el logger stdout actual |
| Métricas técnicas | Uptime + healthchecks de Edge Functions | Detectar caídas de proveedor |
| **Métricas de negocio** | Job interno → tabla `metricas_diarias_tenant` | Unidades activas, pagos recibidos vía pasarela, % auto-conciliado, liquidaciones aplicadas, tickets SLA |
| Alertas | Umbral sobre métricas → email/canal interno | Job cartera fallido, tasa de error de webhooks >X%, tenant sin actividad 15 días (churn temprano) |
| Correlación | correlationId ya existe en todas las Edge Functions | Extender su propagación al frontend |

El dashboard interno de métricas de negocio es además el tablero de gestión de Aquila mismo: cohortes de adopción, uso por módulo (qué módulos se usan de verdad antes de invertir más en ellos).

## C. Backups / DR / continuidad

- **Backups automáticos**: pg_dump diario cifrado a storage externo (fuera del proyecto Supabase principal) + retención 30 días mensuales/1 año. Supabase ofrece PITR según plan — evaluar costo vs dump propio.
- **Pruebas de restauración trimestrales automatizadas** (restaurar en proyecto efímero + correr suite de tests contra la copia): un backup no probado es una hipótesis.
- RTO/RPO definidos y documentados: objetivo inicial razonable RPO ≤24h (PITR reduce a minutos si el plan lo permite), RTO ≤4h.
- Complementa el blindaje pendiente de `db-push --prod` (hallazgo A1/operativo): snapshot obligatorio pre-migración ya cubierto aquí.
- Runbook documentado: quién hace qué ante caída, corrupción, fuga (el día del incidente no es momento de improvisar).

## D. Escalado técnico (cuando haga falta, no antes)

Prioridades reales detectadas en evaluación:
1. **Particionamiento futuro de tablas append-only**: `audit_log`, `cargos`, `pago_aplicaciones`, `comunicaciones_log` crecerán sin límite. Decidir partición por `(tenant_id, created_at)` ANTES del primer cliente grande; migrar después es doloroso. La purga de `rate_limit_hits` (brecha M5) entra aquí.
2. **Connection pooling**: PgBouncer/supavisor si el portal multiplica sesiones concurrentes.
3. **Índices compuestos por tenant** revisados con `EXPLAIN` sobre queries calientes (cartera dashboard, estado de cuenta).
4. Cold starts de Edge Functions en flujos sensibles (webhooks): mantener funciones ligeras; procesamiento pesado diferido.

## E. Soporte y operación interna

- **Impersonación auditada**: soporte necesita ver lo que ve el usuario. Diseño seguro: flag `soporte_acceso_hasta` por membresía otorgado POR EL TENIENTE (consentimiento explícito, expiración máxima 24h) + todo acceso impersonado marcado en audit_log con actor real ≠ actor efectivo. Jamás bypass de RLS directo.
- Status page pública (uptime, incidentes) — señal de profesionalismo que los administradores valoran.
- Entorno UAT/staging permanente (hoy los tests golpean la BD dev compartida — brecha M1): Supabase branching resuelve y además habilita BD efímeras por PR.

## F. Seguridad operativa continua (hereda hallazgos de la evaluación)

- Rotación de secretos documentada (service_role, claves pasarelas, Brevo).
- Escaneo de dependencias (dependabot/renovate) + `pnpm audit` en CI.
- Ampliar escaneo de secretos en CI (gitleaks: cubrir `xkeysib-`, `sbp_` — brecha M6).
- Revisión trimestral de políticas RLS nuevas contra el test de esquema (que debe FALLAR en CI si falta credenciales, nunca saltarse — brecha A1).

## G. Orden de implementación

1. Esquema planes/suscripciones + gating declarativo + trial con modo lectura.
2. Cobranza recurrente reusando adaptadores de pasarela + dunning.
3. Sentry + healthchecks + tabla de métricas de negocio + alertas de jobs.
4. Backups automáticos cifrados + primera prueba de restauración.
5. Staging con Supabase Branching (desbloquea también tests paralelos).
6. Impersonación consentida + status page.

## H. Métricas del negocio mismo (las que el fondo/inversor pide)

- MRR por plan, churn mensual, NRR (expansión por más unidades).
- Activación: % tenants con primer periodo liquidado <14 días.
- Adopción por módulo (de las métricas diarias) — decide dónde invertir después.
- Costo de soporte por tenant (impersonaciones/hora por cuenta activa).
