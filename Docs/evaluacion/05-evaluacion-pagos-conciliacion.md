# Punto 2 — Pagos Electrónicos y Conciliación Bancaria

**Contexto:** análisis del punto crítico #2 del plan de acción de Aquila PH. Objetivo declarado: dejar implementadas las **3 pasarelas más importantes** para el mercado colombiano. Tarifas verificadas en comparativas 2026 (verificar siempre tarifa vigente al contratar).

---

## A. Decisión arquitectónica previa: ¿quién es el comercio?

**La copropiedad es el comercio, no Aquila.** Cada tenant debe tener su propia cuenta de pasarela (su propio `public_key`/`login`/merchant). Consecuencias:

1. **El dinero nunca pasa por Aquila** → se evita caer en regulación de Pagos/Compañías FinTech (Supervisión Financiera) y el dinero va directo a la cuenta de recaudo de la copropiedad. Esto es también argumento comercial ante consejos de administración.
2. **Credenciales por tenant**: tabla `pasarela_config` con claves cifradas en reposo (envelope encryption o vault; jamás texto plano en columna). La Edge Function resuelve credenciales del tenant en runtime.
3. **Onboarding guiado por pasarela**: cada proveedor exige RUT, cámara de comercio, verificación de identidad del representante legal → flujo de alta dentro del wizard de configuración del tenant.

## B. Las 3 pasarelas seleccionadas (mercado colombiano 2026)

| | **Wompi** (Bancolombia) | **PayU** | **ePayco** |
|---|---|---|---|
| Por qué está aquí | Mejor API del mercado local, Nequi nativo (18M+ usuarios), mejor tarifa PSE, respaldo Bancolombia, desembolso rápido si cuenta Bancolombia | Mayor cobertura de métodos (Efecty/Baloto/Su Red), marca establecida, antifraude maduro, cuotas hasta 36 meses | Cobertura completa de métodos locales, soporte local fuerte, muy usada en pymes/administradores |
| Tarjeta crédito/débito | ~2,99% + $600 + IVA | ~2,99–3,49% + $700–900 + IVA | ~2,79–3,50% + $700–900 + IVA |
| PSE | ~1,49% + $1.200 (la mejor) | ~1,89% + $1.200 | ~1,29–1,79% |
| Nequi | ~1,79% (nativo) | Sí | Sí (~2,5%) |
| Efectivo (Efecty/Baloto) | Limitado | ✅ | ✅ |
| Desembolso | 1–2 días (Bancolombia), 2–3 otros | 1–3 días | 1–2 días |
| Firma webhook | SHA-256 sobre propiedades concatenadas + checksum | SHA1 de firma convencional | MD5/SHA256 con `p_` params |
| Checkout | Redirect/embedded/widget | Redirect/embedded | Redirect/embedded/link |

**Métodos obligatorios para PH:** PSE es el rey del ticket medio-alto (cuota de administración) — las tres lo cubren. Nequi/Daviplata cubren propietarios jóvenes. Efectivo (vía PayU/ePayco) cubre el segmento que aún paga en corresponsales — relevante en PH estratos bajos.

**Honorable menciones:** Bold (mejor comisión tarjeta 2,8%, datafono digital para portería/asambleas) y MercadoPago (ecosistema). Diseñar el adaptador para que agregarlos sea trivial (punto D).

## C. Integración con el modelo existente (lo importante)

### C.1 Flujo end-to-end
```
Propietario recibe estado de cuenta (link público ya existe: ver-estado-cuenta)
  → botón "Pagar" → Edge Function crear-intencion-pago (valida monto ≤ saldo pendiente)
  → adaptador pasarela crea transacción/link de checkout (con referencia estructurada)
  → propietario paga en Wompi/PayU/ePayco
  → webhook confirma → VERIFICACIÓN DOBLE vía API de consulta (nunca confiar solo en webhook)
  → Edge Function registrar-pago-pasarela:
      INSERT pagos (append-only, service_role, idempotente por transaction_id)
      → fn de imputación waterfall ya existente (deuda_mas_antigua|periodo_actual)
  → notificación (plantillas email/SMS ya existen) + actualización estado de cuenta
```

### C.2 Decisiones críticas mapeadas al código existente

1. **Idempotencia por `transaction_id` de la pasarela**: constraint único `(tenant_id, pasarela, transaction_id)` en `pagos` o tabla puente `pagos_pasarela`. Los webhooks llegan duplicados SIEMPRE (garantía at-least-once). El registro debe ser un `fn_registrar_pago_pasarela(p_transaction_id ...)` que retorne éxito silencioso si ya existe — mismo patrón del fix recomendado para `fn_aprobar_novedad` (hallazgo S1).
2. **Los webhooks son públicos**: nueva Edge Function `webhook-pasarela/[proveedor]` sin JWT, pero con (a) validación criptográfica de firma específica del proveedor, (b) rate-limit por IP (reusar `check_rate_limit`), (c) respuesta rápida 2xx + procesamiento idempotente, (d) log en `audit_log` de cada evento recibido (corrige la brecha del endpoint `ver-estado-cuenta`: toda puerta anónima deja rastro).
3. **Verificación doble obligatoria**: tras webhook, consultar el estado de la transacción vía API del proveedor antes de registrar el pago. Previene falsificación de firma por colisión/bug.
4. **Montos**: COP enteros (el kernel usa Decimal precision 34; los montos de pasarela llegan como enteros COP — convertir con `money()` en la única frontera permitida). Validar que monto pagado == monto esperado; si difiere (pago parcial de efectivo), registrar y marcar para revisión.
5. **Referencia estructurada en cada transacción**: `{tenant_slug}-{inmueble}-{periodo}-{uuid_corto}` — es la llave que alimenta la conciliación bancaria (sección E).
6. **Estados intermedios**: PSE/efectivo tienen estados `pendiente/fallida/anulada`. El pago solo entra al ledger cuando la pasarela confirma `APPROVED/success`. Estados previos viven en tabla `intenciones_pago` (no contable), con expiración.
7. **Reembolsos/notas**: devolución desde la pasarela ⇒ contra-cargo espejo (`cargo_reversado_id`) + reversión de `pago_aplicaciones` — reusar la mecánica de anulación L6 existente. NUNCA borrar el pago original.
8. **Descuento pronto pago**: el checkout debe calcular el monto con `fn_aplicar_descuento_pronto_pago` si aplica (hoy sin tests — cerrar antes de conectar dinero real).

### C.3 UI/UX del pago
- Botón "Pagar" en el estado de cuenta público (el link de 90 días ya existe) y en el estado de cuenta interno.
- Selector de método (PSE/Banco → lista bancos; Nequi → número; tarjeta → formulario hosted field del proveedor — **jamás tocar datos de tarjeta**: PCI DSS queda en la pasarela).
- Pantalla de resultado con los 3 estados + "te avisaremos por correo/SMS cuando confirme" para pendientes (PSE tarda minutos; efectivo días).
- Para el administrador: panel de transacciones por periodo con filtro por estado y export XLSX.

## D. Capa de abstracción (adaptador)

```ts
interface PaymentGatewayAdapter {
  crearIntencion(params): Promise<{checkoutUrl | referenciaEfectivo, expiraEn}>
  consultarTransaccion(transactionId): Promise<EstadoTransaccion>
  validarFirmaWebhook(payload, firma): boolean
  parsearWebhook(payload): EventoTransaccion   // normaliza a modelo interno
}
```
Un adaptador por proveedor (`wompi.ts`, `payu.ts`, `epayco.ts`) + tabla `pasarelas` (catálogo global) + `pasarela_config_tenant` (credenciales cifradas, métodos habilitados, activa). Agregar Bold/MercadoPago después = implementar una clase, cero cambios de esquema.

Tests requeridos (patrón del repo: motor puro testable + integración real):
- Unit: normalización de webhooks de cada proveedor (fixtures reales), validación de firmas (caso válido/inválido/replay).
- Integración: doble webhook idéntico ⇒ un solo pago; webhook + consulta API divergente ⇒ gana la consulta API; pago parcial de efectivo; reintento de imputación.

## E. Conciliación bancaria automática (el diferenciador)

Las pasarelas no lo resuelven todo: la mayoría de copropiedades sigue recibiendo transferencias directas a su cuenta de recaudo. Motor de conciliación:

1. **Ingesta**: importación de extracto bancario (CSV/XLSX por banco — formato paramétrico por entidad) y/o APIs bancarias donde existan (Bancolombia tiene convenios/corresponsalía; Davivienda similar).
2. **Matching determinista primero**:
   - Referencia estructurada exacta (del punto C.2.5) → auto-match.
   - Monto exacto + fecha ventana ±N días contra intenciones de pago pendientes.
3. **Matching heurístico después**: nombre del titular ≈ propietario + monto ≈ suma de cargos vencidos → propuesta con score de confianza.
4. **Cola manual**: lo no emparejado → bandeja de conciliación con acciones: aplicar a inmueble (dispara imputación waterfall existente), crear saldo a favor, descartar con motivo. Todo auditado (audit_log append-only).
5. **Regla de oro**: la conciliación NUNCA edita el ledger; solo crea `pagos` legítimos. Un extracto importado dos veces no duplica pagos (hash del archivo + hash de línea como idempotencia).
6. Métrica de éxito del producto: **% de líneas de extracto auto-conciliadas sin intervención humana** (objetivo >90%). Ningún competidor PH colombiano publica esto — es el KPI que vende el módulo.

### Cuenta de recaudo virtual
Evaluar producto de cuenta virtual por banco (Bancolombia/Davivienda ofrecen sub-cuentas/códigos de recaudo por convenio) para dar a cada inmueble un código de referencia único por periodo — elimina el problema #1 del recaudo PH tradicional (transferencias sin referencia identificable).

---

## F. Orden de implementación sugerido

1. Esquema: `pasarelas`, `pasarela_config_tenant`, `intenciones_pago`, extensión de `pagos` (idempotencia por transacción) + `fn_registrar_pago_pasarela` idempotente.
2. Adaptador **Wompi** (mejor API, PSE+Nequi, tarifa PSE óptima para ticket PH) + webhook + verificación doble + botón en estado de cuenta. Tests de firma e idempotencia.
3. Adaptador **PayU** (efectivo Efecty/Baloto, cobertura total).
4. Adaptador **ePayco** (soporte local, alternativa pyme).
5. Bandeja admin de transacciones + export.
6. Motor de conciliación bancaria (import CSV → auto-match → cola manual).
7. Onboarding de credenciales por tenant (wizard + cifrado de claves).

## G. Riesgos y mitigaciones

| Riesgo | Mitigación |
|---|---|
| Webhook falso/forged | Firma validada + consulta API de doble verificación |
| Doble registro de pago | Constraint único + fn idempotente (patrón S1) |
| Claves de pasarela filtradas | Cifrado en reposo + nunca en logs (logger ya disciplina) + escaneo CI ampliado (brecha M6) |
| PSE queda pendiente y nunca confirma | Job diario que consulta transacciones pendientes >24h y expira intenciones |
| Disputa de imputación (propietario reclasa dónde aplicó su plata) | Guardar snapshot de la imputación ejecutada junto al pago (ya existe patrón snapshot/sello) + mostrar trazabilidad en estado de cuenta |
| Dependencia de un proveedor | Abstracción D + configuración por tenant |
