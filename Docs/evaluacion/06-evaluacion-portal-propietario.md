# Punto 3 — Portal del Propietario / Copropiedad

**Contexto:** análisis del punto crítico #3 del plan de acción de Aquila PH. Es "el gran ausente": hoy todo el producto es back-office del administrador. El mercado se gana cuando el **propietario final** percibe valor directo. Argumento comercial #1: reduce las llamadas a la administración.

---

## A. Decisión arquitectónica: ¿misma app o app nueva?

**Recomendación: app separada (`apps/web-portal`) en el monorepo existente**, compartiendo `packages/*` y el proyecto Supabase.

| Criterio | Misma app | App separada |
|---|---|---|
| Diseño | Contaminaría el back-office compacto (back-office ≠ experiencia consumidor) | ✅ Design system propio, mobile-first |
| Seguridad | Un rol más dentro de un app de personal | ✅ Perímetro explícito; lo que no existe no se ataca |
| Despliegue | Un solo bundle creciente | ✅ Independiente; el portal es público-ligero, el admin no |
| Código compartido | Natural | ✅ El monorepo ya está diseñado para esto (packages/shared, kernel) |

El portal es **mobile-first obligatorio**: el propietario consulta su saldo desde el celular, no desde un escritorio. Esto invierte la restricción actual del back-office (sidebar fijo sin responsive) — no arrastrarla al portal.

## B. Modelo de identidad y acceso (el problema técnico más difícil)

### B.1 ¿Quién es "propietario"?
Hoy el sistema conoce el *responsable* de cada inmueble (aviso "unidades sin responsable" en prevuelo) y hay módulo de terceros. Falta la relación **persona↔inmueble con rol habitacional**:

```
personas_portal (o extender terceros): nombre, documento, email, teléfono
vinculo_inmueble_persona:
  persona_id, inmueble_id,
  tipo: propietario | poseedor | inquilino | residente_autorizado,
  vigencia_desde/vigencia_hasta          -- reusa patrón v_inmueble_historico
```

Distinción crítica: **propietario ve todo (saldo, certificados); inquilino ve solo lo que el propietario/administrador le delegue** (típicamente pagar cuota si el reglamento lo permite). El `tipo` gobierna permisos vía RLS.

### B.2 Alta e invitación (el cuello de botella operativo)
1. **Import masivo por administrador** (CSV: inmueble, nombre, email, tipo vínculo) — mismo patrón del importador de migración identificado en el plan general.
2. **Invitación tokenizada**: reusar el sistema de invitaciones existente (token aleatorio 32 bytes, sha256 en BD, transacción atómica) — ya está construido y testeado.
3. **Autoservicio acotado**: quien acredite dominio (documento + matrícula opcional) puede solicitar vinculación; el administrador aprueba. Sin esto, la carga del administrador mata la adopción.
4. **Multi-copropiedad**: una persona puede tener inmuebles en varias PH → su sesión resuelve los tenants donde tiene vínculos activos (reusar patrón memberships). UI con selector de copropiedad.

### B.3 RLS — nuevo rol `portal`
- Rol mínimo con políticas escopadas: `SELECT` sobre sus propios inmuebles vía `vinculo_inmueble_persona`, `SELECT` de sus cargos/pagos/estados_cuenta, `INSERT` limitado (PQRS, reservas).
- **Nada de escritura financiera** — el pago entra solo vía pasarela confirmada (punto 2). El portal jamás inserta en `pagos`.
- La matriz RBAC (`t-matrix.test.ts`) debe extenderse con este rol: paridad frontend↔SQL desde el día uno (fortaleza existente del repo).

## C. Módulos del portal (por orden de valor)

### Fase 1 — Saldo y pago (MVP, máximo valor)
1. **Dashboard del inmueble**: saldo actual, próximo vencimiento, estado mora, últimos pagos. Datos que YA existen en el ledger — cero modelo nuevo.
2. **Descarga del estado de cuenta PDF** — el generador ya existe (`estados_cuenta_generados` + link público). Solo falta el acceso autenticado propio.
3. **Botón "Pagar"** → checkout de pasarelas del punto 2 (Wompi/PayU/ePayco). Con descuento pronto pago calculado por `fn_aplicar_descuento_pronto_pago` visible ANTES de pagar ("pagando antes del día 5 ahorras $X").
4. Notificaciones: recordatorio previo a vencimiento y confirmación de pago (plantillas email/SMS ya existen; agregar WhatsApp después).

### Fase 2 — PQRS / Reportes de incidencias
- Ticket con categoría (definida por tenant: fontanería, ascensor, seguridad…), descripción, **fotos como adjuntos** (la Edge Function `subir-documento` ya maneja versionado y permisos — extender o clonar con alcance `pqrs`).
- Máquina de estados: `abierto → en_revision → asignado → resuelto → cerrado` con guards de transición (patrón existente en liquidaciones/novedades).
- **SLA paramétrico por categoría** con indicadores para el administrador (cuántos tickets abiertos, promedio de resolución) — insumo directo para el módulo futuro de mantenimiento.
- Calificación del servicio al cierre (feedback loop hacia proveedores de mantenimiento).
- Diferenciador: el ticket resuelto puede vincularse a la orden de mantenimiento futura con su costo real — trazabilidad "queja→orden→gasto" que ningún competidor muestra.

### Fase 3 — Reserva de zonas comunes
- Catálogo de zonas comunes por tenant (nombre, aforo, horarios, tarifa, depósito/garantía, reglas).
- Calendario de disponibilidad; solicitud → aprobación automática (si tarifa y reglas cumplen) o manual según config del tenant.
- **Conexión directa con el punto 1 (impuestos)**: si la reserva tiene cobro separado de la cuota ⇒ es explotación económica ⇒ genera cargo con `tratamiento_fiscal=explotacion_economica` ⇒ IVA 19% + factura electrónica. Si es préstamo gratuito o incluido en cuota ⇒ sin IVA ni factura. **La matriz DIAN del punto 1 se ejecuta automáticamente aquí** — este es el caso de uso concreto que justifica ese diseño.
- Cobro anticipado vía pasarela antes de confirmar la reserva (evita no-shows y evita cartera por reservas).
- Reglas de negocio codificadas: límite mensual por unidad, días mínimos de antelación, prohibición si hay mora (configurable por tenant).

### Fase 4 — Comunicación y gobernanza (puente al punto 6 asambleas)
- Tablón de anuncios del tenant (convocatorias, avisos).
- Directorio de convivencia y reglamento publicado.
- Encuestas simples de asamblea (pre-votación) → luego votación electrónica formal (Ley 2213/2022).

## D. Seguridad — superficie nueva que hay que blindar

| Riesgo | Mitigación |
|---|---|
| Enumeración de inmuebles/saldos | RLS escopado por vínculo activo; IDs UUID; sin endpoints de listado cruzado |
| El portal multiplica usuarios finales (100x vs admin) | Rate-limit agresivo en todas las Edge Functions del portal (reusar `check_rate_limit`); CAPTCHA en autoservicio de vinculación |
| Acceso de ex-inquilinos | Vigencias del vínculo (`vigencia_hasta`) evaluadas en la política RLS, no solo en UI; revocación inmediata |
| Fotos de PQRS con datos sensibles | Bucket privado con URLs firmadas de corta duración (nunca públicas) |
| Phishing "su saldo está vencido, pague aquí" | Links de pago siempre bajo dominio oficial + dominio verificado del remitente; educar en el primer email |
| Sesiones largas en dispositivo compartido | TTL corto de sesión portal + biometría local (PWA instalable) |

## E. UX específica del portal (lecciones del análisis UI/UX)

- **Mobile-first real**: bottom navigation (no sidebar), targets táctiles, tablas convertidas en tarjetas.
- El saldo es LA cifra: tipografía grande, semáforo verde/amarillo/rojo, y siempre la acción siguiente visible ("Pagar", "Ver cómo se calculó").
- **Transparencia contable heredada**: "Ver cómo se calculó" abre el desglose cargo por cargo (concepto, periodo, coeficiente aplicado) — el diferencial de confianza del kernel financiero hecho visible al propietario.
- Estados vacíos con acción (patrón que el back-office ya hace bien): "No tienes pagos registrados todavía — realiza tu primer pago".
- Onboarding del propietario en <60 segundos: aceptar invitación → ver saldo → (opcional) pagar. El éxito del portal se mide en esa primera sesión.
- Accesibilidad AA desde el inicio (público heterogéneo, adultos mayores incluidos: contraste alto, tamaños generosos).

## F. Orden de implementación sugerido

1. Modelo `personas_portal`/`vinculos` + rol RLS `portal` + extensión t-matrix.
2. App `apps/web-portal`: auth por invitación, selector multi-PH, dashboard saldo + estado de cuenta PDF.
3. Integración checkout (depende del punto 2) + notificaciones de pago.
4. PQRS con adjuntos y SLA.
5. Reservas de zonas comunes (con tratamiento fiscal automático).
6. Tablón/comunicación → base para asambleas virtuales.

## G. Métricas de éxito

- % de unidades con propietario vinculado al portal (adopción por copropiedad).
- % de pagos recibidos por canal electrónico vs presencial/bancario.
- Tickets PQRS resueltos dentro de SLA.
- Reducción medible de consultas telefónicas a la administración (encuesta baseline al iniciar).
