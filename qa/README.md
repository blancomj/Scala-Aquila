# Banco de pruebas QA

Todo lo que hace falta para ejecutar el **Plan de pruebas integral** (222 casos, f0–f22) contra
una instalación local y dejar constancia de cada resultado.

Artefacto: <https://claude.ai/artifact/ATVKWvTPNHhugm2Q1ay1Zs>
(el original, `3aPTLb4GaVTANbatnJQL5y`, quedó en otra cuenta del dominio y no se puede
actualizar desde acá; esta es una copia exacta bajo esta cuenta, ya con los resultados vigentes)

## Qué hay aquí

| Archivo | Qué es |
|---|---|
| `plan.json` | Los 222 casos extraídos del artefacto: acción, criterio de aprobación y rutas. **Es el contrato** — no se edita para acomodar un resultado. |
| `resultados.jsonl` | Append-only, una línea por ejecución. La última línea de cada ítem manda; las anteriores se conservan para ver cuándo un fallido pasó a aprobado. **Fuente de verdad.** |
| `decisiones.md` | Las dudas que el agente no puede resolver solo, y las respuestas del usuario. |
| `tenants.json` | El tablero recién sembrado: ids, usuarios y contraseñas. Lo regenera el seed; no se versiona. |
| `artefacto-resultados.json` | Derivado, listo para subir al artefacto. No se versiona. |

## Las tres copropiedades

Se siembran con `pnpm seed:qa-suite` y **no se borran al terminar**. Cada una existe por una razón
distinta; el plan necesita las tres a la vez.

| | Copropiedad | Inmuebles | Perfil |
|---|---|---|---|
| **T1** | QA Torres del Parque | 30 | Residencial madura. 3 torres, presupuesto 2026 vigente ($202.800.000), coeficientes vigentes (Σ=1), plan contable Grupo 3. Enero–agosto liquidados y recaudados; junio–agosto con recaudo desigual (70 % al día, 20 % abono parcial, 10 % sin pagar), así que hay **mora real de hasta tres meses**. **Septiembre queda ABIERTO sin liquidar** — es lo que ejecuta f6-06. |
| **T2** | QA Plaza Comercial | 18 | 12 locales + 6 oficinas. Uso mixto, responsable de IVA, agente de retención, marco contable Grupo 2. Es el **"otro tenant"** de toda la fase f17 de aislamiento; su único miembro es `qa.ajeno@aquila.test`, que no pertenece a T1. |
| **T3** | QA Conjunto Nuevo | 12 | 12 casas con propietario y nada más: sin coeficientes activos, sin presupuesto, sin plan contable instalado, sin periodos. El tablero en blanco de f21-03. |

Usuarios de prueba (todos con la misma contraseña, en `tenants.json`):

| Correo | Rol en T1 | Existe por |
|---|---|---|
| `qa.auxiliar@aquila.test` | auxiliar | f1-03 — el auxiliar sí puede escribir |
| `qa.auditor@aquila.test` | auditor | f1-02 — el auditor lee todo y no escribe nada |
| `qa.aprobador@aquila.test` | administrador | f6-04/f6-05 — maker-checker exige un segundo par de ojos |
| `qa.financiero@aquila.test` | auxiliar | f1-05/f1-06 — rol funcional acotado |
| `qa.ajeno@aquila.test` | *(solo T2)* | f17 — el intruso de las pruebas de aislamiento |

### La semilla pone el tablero, no juega la partida

Nada que un ítem del plan mande a crear está sembrado: no hay activos dados de alta si f11-01 es
"registrar un activo", no hay órganos de gobierno si f12-01 es "crear un órgano". Sembrarlos
invalidaría la prueba. Sí está sembrado todo lo que esos ítems necesitan como prerrequisito.

## Cómo se usa

```bash
pnpm seed:qa-suite          # siembra (o resiembra) las tres copropiedades
pnpm qa:estado              # avance por fase, hallazgos abiertos y bloqueados
pnpm qa:estado -- --siguiente   # el próximo caso sin ejecutar
pnpm qa:estado -- --fase=f2     # el detalle de una fase
```

Y desde Claude Code, el agente:

```
/qa-integral          seguí donde quedó
/qa-integral f6       esa fase
/qa-integral f6-f8    ese rango
/qa-integral estado   solo el informe
```

Registrar un resultado a mano:

```bash
node scripts/qa/registrar.mjs --item=f2-10 --estado=aprobado --como=api --tenant=t1 \
  --observado="qué se vio que confirma el criterio" --evidencia="scripts/qa/casos/f2-10.mjs"
```

Estados: `aprobado` · `fallido` (exige `--titulo` y `--detalle`) · `bloqueado` · `parcial` ·
`no_aplica` (los tres últimos exigen `--motivo`).

Publicar en el artefacto:

```bash
node scripts/qa/exportar-artefacto.mjs
# y subir qa/artefacto-resultados.json con ArtifactData (colección qa, documento resultados)
```

## Cuidados

- **Solo local.** Los scripts se niegan a correr si `SUPABASE_URL` no es `127.0.0.1`/`localhost`:
  el banco siembra actividad financiera append-only (SEC-14) que no se puede deshacer.
- **No corras `supabase db reset` / `stop` / `start`** para arreglar el banco. Borran tenants
  locales que el usuario construyó a mano. Un hook en `.claude/settings.json` lo intercepta.
- `pnpm seed:qa-suite` **reemplaza** el banco: retira las tres copropiedades anteriores (solo las
  de slug `qa-torres-*`, `qa-plaza-*`, `qa-nuevo-*`) y las vuelve a crear. Cualquier otra
  copropiedad local, incluida "QA Integral", queda intacta. Así el banco nunca pasa de tres.
- Algunos estados del sistema son **irreversibles por diseño**: un set de coeficientes que pasa a
  `historica` no vuelve a `vigente` (`IMMUTABLE_COEFFICIENT_SET`), y una liquidación aplicada no se
  deshace. Una prueba que los toque deja el tablero cambiado; si hace falta volver al punto de
  partida, se resiembra la copropiedad afectada (`pnpm seed:qa-suite -- --solo=t1`).
