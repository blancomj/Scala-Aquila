# Punto 8 — Comunicación Transaccional Multicanal

**Contexto:** análisis del punto crítico #8. Ya existen plantillas email/SMS (`packages/shared/src/email.ts`, `sms.ts` con tests). Lo que falta es la **arquitectura de comunicación**: un catálogo central de eventos, canales intercambiables (WhatsApp es el canal dominante en Colombia), preferencias del destinatario y trazabilidad completa. La comunicación no es un feature: es el sistema nervioso de todos los demás módulos (pagos, portal, asambleas, PQRS).

---

## A. WhatsApp Business API — el canal que falta

### A.1 Por qué
En Colombia, el administrador vive en WhatsApp. Recordatorios de pago, convocatorias y respuestas de PQRS por email tienen apertura marginal comparados con WhatsApp. Requisitos técnicos:

- **BSP** (Business Solution Provider): Meta directo, 360dialog, Twilio o Yalo. El BSP absorbe la complejidad de la Cloud API.
- **Plantillas HSM pre-aprobadas por Meta**: toda comunicación iniciada por el negocio requiere plantilla aprobada con placeholders (`{{1}}`). Las conversaciones abiertas solo son libres dentro de ventana 24h tras mensaje del usuario.
- **Opt-in explícito obligatorio** (política de Meta + Ley 1581/2012 de datos personales): el consentimiento se captura al vincular al propietario al portal (punto 3) o vía formulario del admin con registro auditable.
- Costo por conversación (verificar tarifa vigente del BSP; marketing vs utilidad tienen precios distintos — los recordatorios de pago califican como *utility*, más barato).

### A.2 Casos transaccionales priorizados

| Plantilla | Gatillo | Contenido |
|---|---|---|
| Recordatorio previo a vencimiento | N días antes de `fecha_vencimiento` | Cuota, saldo, botón/link de pago (checkout punto 2) |
| Confirmación de pago aprobado | Webhook pasarela APPROVED | Monto, imputación aplicada, comprobante |
| Alerta de mora (etapa cobranza) | Escalamiento de etapas existente | Saldo vencido + link acuerdo de pago |
| Convocatoria de asamblea | Punto 6 | Fecha, modalidad, orden del día, acuse |
| Actualización PQRS | Cambio de estado del ticket | Estado nuevo + SLA |

## B. Arquitectura: catálogo de eventos + adaptadores de canal

### B.1 Patrón idéntico al de pasarelas (adaptador)

```ts
interface CanalNotificacion {
  enviar(mensaje: MensajeNormalizado): Promise<ResultadoEnvio>
  validarDestino(destino: string): boolean
}
// whatsapp.ts | email.ts (Brevo ya integrado) | sms.ts (ya existe) | push.ts (futuro)
```

### B.2 Modelo de datos

```
eventos_notificables: id, codigo (pago_aprobado, recordatorio_vencimiento...),
  descripcion   -- catálogo global (patrón lista_tipos)

plantillas_canal: evento_id, tenant_id?, canal, cuerpo_con_placeholders,
  version, activa    -- versionado estilo concepto_versiones; override por tenant

reglas_envio: evento_id, canal_preferido[], anticipos (ej: -3d, -0d),
  horario_permitido_desde/hasta (quiet hours), reintentos_max

comunicaciones_log: id, tenant_id, evento_id, canal, destino,
  persona_id?, entidad_tipo, entidad_id, plantilla_version,
  estado (encolado|enviado|entregado|leido|fallido),
  proveedor_msg_id, intentos, error_detalle
  -- append-only; correlación total con la entidad de negocio
```

- **Idempotencia de envío**: hash `(evento, entidad_id, persona, ventana)` — un webhook duplicado de pago no genera dos confirmaciones.
- **Preferencias por persona**: `preferencias_comunicacion(persona_id, canal, tipo, opt_in)` — opt-out granular (p. ej. sí a pagos, no a promocionales) respetando que avisos legales (convocatoria) pueden ser ineludibles según reglamento.

## C. Motor de envío

1. **Disparadores**: (a) eventos de dominio (webhook pasarela, cambio de estado ticket), (b) jobs programados (recordatorios de vencimiento — extender el job diario de cartera ya existente), (c) manuales acotados (admin notifica a selección).
2. Cola con reintentos exponenciales y dead-letter queue visible para soporte.
3. Render de plantillas determinista (placeholders tipados desde el ledger/entidad — nunca strings concatenados sueltos); el mismo rigor decimal del kernel aplica a las cifras mostradas en mensajes.
4. Rate-limiting por proveedor y por tenant (evitar bloqueos de Meta por volumen).
5. Webhooks de entrega entrantes (delivered/read/bounced) → actualizan `comunicaciones_log`; bounces duros marcan el destino inválido y alertan al admin (email muerto = propietario que nunca se entera de su deuda = cartera evitable).

## D. Push notifications (cuando exista el portal como PWA)

- Web Push con service worker (sin app store): recordatorio de pago, respuesta de PQRS, convocatoria urgente.
- Misma arquitectura: adaptador `push.ts`, suscripciones por dispositivo vinculadas a `persona_id`.
- Regla UX heredada del análisis frontend: cada push debe corresponder a una acción posible en el portal (notificación sin destino es ruido → opt-out masivo).

## E. Métricas

- Entregabilidad por canal/proveedor (bounces, errores).
- Tasa de click en links de pago por canal → justifica ROI de WhatsApp ante cada tenant.
- Conversión recordatorio→pago dentro de 72h.
- Tiempo hasta acuse de convocatoria (punto 6).

## F. Riesgos y mitigaciones

| Riesgo | Mitigación |
|---|---|
| Bloqueo de número WhatsApp por spam | Opt-in estricto, plantillas utility, límites de frecuencia, warm-up del número |
| Datos personales en mensajes | Placeholders mínimos (nunca saldo completo de terceros), cifrado en tránsito, cumplimiento Ley 1581 documentado |
| Envío doble por reintento | Idempotencia por hash + estado en comunicaciones_log antes de llamar al proveedor |
| Dependencia de un BSP | Adaptador de canal; migrar proveedor sin tocar reglas de negocio |

## G. Orden de implementación

1. Esquema (eventos, plantillas versionadas, reglas, log append-only) + motor de colas/reintentos.
2. Migrar envíos actuales ad-hoc (invitaciones, estados de cuenta) al catálogo de eventos.
3. Adaptador WhatsApp con BSP + 3 plantillas iniciales (recordatorio, confirmación pago, mora) + flujo de opt-in.
4. Webhooks de entrega + dashboard de métricas de comunicación.
5. Push del portal (depende de punto 3 desplegado).
