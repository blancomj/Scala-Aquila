# Punto 1 — Facturación Electrónica, Firma Digital e Impuestos

**Contexto:** análisis del punto crítico #1 del plan de acción de Aquila PH. Normativa verificada contra fuentes vigentes (Comunicado DIAN 019/2025, Concepto DIAN 7653/2025, Concepto Unificado DIAN 106/2022 numeral 1.3.3.1, Resolución DIAN 227/2025, art. 420/462-2/476 E.T., Ley 527/1999, Ley 2213/2022).

---

## A. Facturación electrónica: matriz de casos SÍ/NO facturar

Regla central (Concepto DIAN 106/2022, num. 1.3.3.1): **las cuotas de administración NO son venta ni prestación de servicios — tienen naturaleza de tributo interno**. Matriz:

| Operación | ¿Factura electrónica? | ¿IVA? | Fundamento |
|---|---|---|---|
| Cuota ordinaria a copropietario | ❌ No (cuenta de cobro basta) | ❌ No | Concepto 106/2022 |
| Cuota extraordinaria a copropietario | ❌ No | ❌ No | Ídem |
| Intereses de mora | ❌ No | ❌ No (rendimiento financiero) | Ídem |
| Multas/sanciones del reglamento | ❌ No | ❌ No | Ídem |
| Uso de zonas comunes por propietarios **incluido en la cuota** o a préstamo | ❌ No | ❌ No | Comunicado DIAN 019/2025 |
| Parqueadero asignado como bien privado al propietario | ❌ No | ❌ No | Art. 22 L675; Concepto 7653/2025 |
| **Alquiler de salón/cancha/BBQ/parqueadero de visitantes a terceros** | ✅ **Sí** | ✅ **19%** | Art. 420/462-2 E.T.; Comunicado 019/2025 |
| **Cobro separado de la cuota por uso de zonas comunes (incluso a residentes)** | ⚠️ Sí si es alquiler formal a precio de mercado; zona gris si es "tarifa de mantenimiento" — decidible por tenant | ⚠️ 19% en caso gravado | Concepto 7653/2025 |
| **Arrendamiento de locales comerciales** dentro del conjunto | ✅ Sí | ✅ 19% (solo vivienda excluida) | Art. 476 E.T. |

### Implicaciones de diseño para Aquila

1. **El atributo fiscal vive en el concepto/cargo, no en un módulo aparte.** Cada concepto necesita campo `tratamiento_fiscal`: `no_gravado_interno` (cuotas/multas/intereses) vs `explotacion_economica` (facturable + IVA). Este atributo debe **versionarse junto al concepto** (`concepto_versiones`): cambiar tratamiento fiscal a mitad de año afecta liquidaciones ya simuladas y debe quedar sellado.
2. **El modelo existente mapea casi perfecto a facturación electrónica**: `cargos` → ítems de factura; **la anulación por contra-cargos espejo (`cargo_reversado_id`) es exactamente una Nota Crédito electrónica**; el estado de cuenta generado sirve como borrador de cuenta de cobro para cuotas.
3. **Arquitectura de emisión**: Edge Function que consuma un proveedor tecnológico DIAN (The Factory HKA, Acofi, Siigo…). NUNCA integrar directo con la DIAN: resolución previa de numeración, clave técnica, validación previa, CUFE, QR, transmisión el mismo día (Resolución 227/2025, vigente desde 2026), RADIAN como título valor. El proveedor absorbe los cambios del Anexo Técnico.
4. **Zona gris configurable por tenant** (cobro a residentes por salón): decisión del administrador con fundamento documental guardado (reusar `fundamentos_normativos`), no lógica dura.
5. Consecuencia colateral: actividad gravada ⇒ copropiedad **responsable de IVA sin umbral** (desde el primer peso) ⇒ RUT actualizado + declaración bimestral. El onboarding debe preguntarlo.

---

## B. Firma digital

Marco legal: **Ley 527 de 1999** distingue *firma electrónica* (datos genéricos, valor probatorio débil) de *firma digital* (certificado emitido por Prestador de Servicios de Certificación acreditado ante ONAC — Certicámara, FirmaColombia, AndesEC; presunción legal de integridad y autoría).

Casos en el dominio PH:

| Documento | Requisito legal | Tipo recomendado |
|---|---|---|
| Actas de asamblea + votación electrónica | Ley 2213/2022 (asambleas virtuales válidas; identificación y voto electrónico) | Firma digital presidente/secretario + trazabilidad de votos |
| Certificación de deuda para proceso judicial | Art. 54 L675 (proceso monitorio exige certificación del admin con soporte contable) | Firma digital del administrador |
| Acuerdos de pago con condonación | Acta exigida (art. 48 L675) — ya modelada | Firma deudor electrónica simple + admin digital |
| Aprobaciones maker-checker (conceptos, liquidaciones) | No exigido por ley; valor probatorio/diferencial | Firma digital sobre hash del documento |
| Contratos con proveedores (módulo mantenimiento futuro) | Práctica estándar | Digital ambas partes |

### Implicaciones técnicas

1. **Nunca custodiar claves privadas propias**: integrar con PSC vía API de firma remota (OTP/certificado en la nube del prestador).
2. **Patrón correcto para Aquila**: documento inmutable + hash existente (ya calculan SHA-256 en `concepto_versiones`, sello md5 en liquidación) → servicio de firma sella `{hash, tipo_documento, firmante_id, timestamp}` → guarda `cufe`/token del prestador en tabla nueva. El audit log append-only garantiza la cadena de custodia.
3. **Prioridad**: certificación de deuda firmada digitalmente — la más usada en litigios PH y ningún competidor la ofrece bien. Diferenciador concreto para abogados y jueces.

---

## C. Retención e impuestos

### Naturaleza fiscal de la copropiedad
- **No contribuyente de renta** respecto de cuotas ordinarias y extraordinarias (+ costos asociados no se declaran): art. 23 Ley 675 / parágrafo art. 23-1 E.T. según uso.
- **PERO tributa régimen ordinario** por explotación económica de bienes comunes (locales arrendados, publicidad, parqueaderos a terceros): ahí sí contribuyente + responsable IVA.
- **Revisor fiscal obligatorio** en uso comercial/mixto (art. 56 L675).

### Dimensiones que el sistema debe manejar

**1. Renta — separación de dos mundos contables**
- Ingresos no gravables (cuotas, intereses mora, multas) vs gravados (explotación económica).
- Declaración solo por lo gravado, contabilidad única NIIF PYME → plan de cuentas necesita atributo `naturaleza_renta: no_contribuyente | contribuyente` por cuenta para que el cierre genere automáticamente cifras declarables. Extender `contable_plan_cuenta`.
- **Pro-indiviso**: los copropietarios declaran su participación proporcional de ingresos gravados → generar **certificados pro-indiviso anuales por propietario** usando los coeficientes existentes. Obligación real (información exógena, art. 1.2.1.5.3.6 Dec. 1625/2016 — las PH reportan medios magnéticos).

**2. IVA — solo si hay actividad gravada**
- Responsabilidad desde el primer peso (sin umbral) → flag por tenant en configuración.
- Cálculo del 19% **en el momento del cargo** para conceptos `explotacion_economica` (derivarlo como línea adicional vía motor AEL).
- Declaración bimestral generada desde el ledger append-only (ventas gravadas, IVA generado).
- Excepciones codificadas: préstamo gratuito, costo incluido en cuota (casos ❌ de la matriz).

**3. Retenciones — la copropiedad es agente retenedor (aplica a TODAS las PH, independiente del IVA)**
- **Retefuente al pagar proveedores**: honorarios ~11%, arrendamientos 3.5%, servicios (art. 368 E.T.). Crítico para módulo mantenimiento/terceros futuro: toda orden de pago calcula retención antes del desembolso.
- **RetIVA (15%)** al pagar a responsables de IVA.
- **RetICA** municipal — tabla paramétrica por tenant/municipio.
- Al cobrar arriendos, arrendatarios empresariales le retienen → registrar como retención soportada/anticipo en el ledger (nuevo tipo de entrada — refuerza la necesidad de unificar los 4 mecanismos de "dinero a favor" identificados en la evaluación de negocio).
- No se practica retención sobre cuotas de administración entre comuneros.

**4. Obligaciones formales asistidas**
- Calendario tributario por tenant (bimestres IVA, exógena anual, libros).
- Export estructurado de información exógena para carga en herramienta oficial.

---

## Síntesis estratégica

Lo valioso no es "integrar facturación" sino que **el tratamiento fiscal sea un atributo de primera clase del modelo de datos** (`tratamiento_fiscal` en conceptos, flags de responsabilidad en tenant, naturaleza renta en cuentas). Eso hace que: la matriz de facturación sea automática, el IVA se derive solo, el cierre contable produzca cifras declarables y los certificados pro-indiviso salgan de los coeficientes existentes. Competidores tratarían esto como módulo pegado; Aquila puede hacerlo emergente del kernel financiero.
