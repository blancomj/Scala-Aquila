# Punto 6 — Asambleas y Gobernanza

**Contexto:** análisis del punto crítico #6. Módulo natural post-liquidación que cierra el ciclo Ley 675 (el repo ya cita fundamentos normativos en `fundamentos`). Es también el destino natural de dos activos construidos: los escenarios del punto 5 (que se *presentan* en asamblea) y la firma digital del punto 1B (que sella el acta).

---

## A. Marco normativo que condiciona el diseño

| Norma | Implicación técnica |
|---|---|
| Art. 31 L675 — Convocatoria | Orden del día taxativo; quien convoca (admin, consejo, 20% copropietarios); antelación mínima |
| Art. 32 L675 — Quórums | Quórum deliberativo/decisorio distinto por tipo de PH; computado **por coeficientes**, no por cabezas |
| Art. 33 L675 — Mayorías | Mayoría simple (decisiones ordinarias), mayoría calificada (ej. modificaciones reglamento), **unanimidad** (modificación de bienes comunes / fachada) |
| Art. 34 L675 — Actas | Contenido mínimo; firmas presidente+secretario; derecho de impugnación |
| Ley 2213/2022 — Asambleas virtuales | Validez de reunión no presencial y voto electrónico; exige mecanismos de identificación del votante y garantía del secreto/nominalidad según reglamento |
| Reglamento del tenant | Puede exigir votos nominales en acta — debe ser configurable |

**Regla de oro:** la herramienta nunca decide qué mayoría aplica — cada ítem del orden del día declara su tipo de decisión y el sistema valida contra esa configuración, dejando rastro del fundamento (reusar `fundamentos_normativos`).

## B. Flujo end-to-end

```
1. CONVOCAR      admin crea asamblea (presencial | virtual | mixta),
                 orden del día con ítems tipificados,
                 anexos (escenarios del punto 5, presupuesto propuesto)
2. NOTIFICAR     plantillas email/SMS/WhatsApp existentes con acuse de recibo
                 (el acuse alimenta el cálculo de quórum esperado)
3. DELEGAR       registro de poderes: delegante→delegado con límites
                 (coeficiente máximo acumulable configurable; vencimiento)
4. ASAMBLEA      verificación de asistencia (presencial: check-in portería/
                 QR; virtual: login portal punto 3) → quórum en vivo
5. VOTAR         por ítem: opción única | múltiple; voto ponderado por
                 coeficiente; nominal o secreto según config del ítem
6. ACTA          generación automática desde la sesión + edición acotada +
                 firma digital (punto 1B) + hash append-only
7. EJECUTAR      ítems con efecto en el sistema (aprobar presupuesto,
                 cambio de coeficientes) disparan los flujos ya existentes
```

## C. Modelo de datos (esbozo)

```
asambleas: id, tenant_id, tipo (ordinaria|extraordinaria), modalidad,
  fecha_hora, estado (convocada|instalada|en_curso|cerrada|anulada),
  acta_hash, acta_documento_id

asamblea_items_orden_dia: asamblea_id, numero, titulo, descripcion,
  tipo_decision (mayoria_simple|mayoria_calificada|unanimidad|informativo),
  fundamento_normativo_id, estado (pendiente|en_discusion|votado|aprobado|rechazado)

asamblea_asistencias: asamblea_id, inmueble_id, persona_id,
  modalidad (presente|virtual|delegado), delegado_persona_id?, poder_id?,
  verificado_en, verificado_por

asamblea_poderes: delegante_inmueble_id, delegado_persona_id,
  fecha_otorgamiento, documento_id (escrito de poder adjunto), valido

asamblea_votos: item_id, inmueble_id, opcion, coeficiente_aplicado,
  momento, hash_cadena   -- append-only, inmutable tras cerrar el item
```

Invarianzas clave (guards estilo del repo):
- Un inmueble no vota dos veces en el mismo ítem (constraint único).
- Los votos son **append-only**: corregir un voto = anular + revotar dentro del ítem abierto, con registro.
- Cerrar un ítem sella el cómputo (`hash` del resultado); reabrir requiere permiso especial y queda marcado en el acta.
- El acta cerrada es inmutable salvo impugnación formal (flujo separado con motivo — patrón certificaciones jurídicas existente).

## D. Cálculo de quórum y votación (motor puro, testeable)

```
computarQuorum(asistencias[], coeficientes[]): { presente: Decimal, total: Decimal, pct }
validarResultado(votos[], tipoDecision): { aprobado, favor_pct, requerido }
```

- Ponderación **por coeficiente del set vigente** (reutiliza exactamente los `coeficiente_sets`; el snapshot de coeficientes al instalar la asamblea evita cambios a mitad de sesión — patrón sello).
- Casos borde codificados: inmueble con mora (¿puede votar? depende del reglamento → flag configurable por tenant con aviso), poderes encadenados prohibidos, delegado que acumula más del tope, inmueble dividido (pro-indiviso entre herederos → un solo voto consolidado por acuerdo registrado).
- Tests: quórum con coeficientes decimales exactos (kernel), mayorías calificadas en frontera (50%/50%), doble voto, poder vencido.

## E. Voto electrónico seguro (virtual)

1. Identidad = sesión autenticada del portal (punto 3) + verificación adicional en ítems sensibles (OTP por SMS/email — canal ya existe).
2. Secreto vs nominal: secreto = se guarda `{item, inmueble, opcion}` sin exponer autoría en UI pública, pero con trazabilidad interna auditada (audit_log) — equilibrio legal: el sistema sabe, el acta no publica.
3. Anti-manipulación: pantalla de confirmación con lectura clara antes de emitir; voto emitido = comprobante visible para el votante (número de comprobante + hash).
4. Accesibilidad AA obligatoria (adultos mayores): textos grandes, una acción por pantalla, sin dependencia de gestos.

## F. UX específica

- **Modo proyección**: dashboard a pantalla completa para mostrar en sala — quórum en vivo (% y gráfico), resultado de cada votación con animación sobria. El administrador hoy hace esto con PowerPoint y conteo manual.
- Timer por ítem opcional (discusión acotada).
- Generador de acta con plantilla editable por tenant; diff visual antes de sellar; export PDF + envío automático a propietarios post-asamblea (comunicaciones, punto 8).
- Convocatoria con checklist guiado (antelación mínima validada contra el reglamento cargado — aviso, no bloqueo, porque el reglamento varía).

## G. Conexiones con módulos previos

| Módulo | Conexión |
|---|---|
| Punto 5 (Escenarios) | Anexos de convocatoria; "convertir en borrador de presupuesto" se habilita solo si el ítem quedó APROBADO en acta sellada |
| Punto 1B (Firma digital) | Acta firmada por presidente/secretario; hash en audit_log |
| Coeficientes | Motor de quórum/votación ponderada |
| Portal (punto 3) | Login del votante virtual; acuse de convocatoria |
| Cartera | Flag "votante en mora" informativo según reglamento |

## H. Orden de implementación

1. Modelo + guards + motor puro de quórum/mayorías con tests.
2. Convocatoria + notificaciones con acuse.
3. Modo asamblea: asistencia, quórum en vivo, votación presencial asistida (el admin registra votos a mano — valor inmediato incluso sin voto virtual).
4. Acta automática + firma digital + sello.
5. Votación electrónica remota vía portal (requiere portal desplegado).
6. Poderes digitales con documento adjunto.
