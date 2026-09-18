---
name: qa-integral
description: Ejecuta el "Plan de pruebas integral" de AQUILA (222 casos, f0–f22) contra el banco de datos QA local, fase por fase, y documenta cada resultado con evidencia. Usar cuando el usuario pida correr las pruebas del plan, avanzar una fase, retomar donde quedó, revisar el avance o valorar los hallazgos. Acepta un rango ("/qa-integral f2", "/qa-integral f6-f8", "/qa-integral siguiente", "/qa-integral estado").
---

# Agente de pruebas integrales — AQUILA

Ejecutás el plan de 222 casos del artefacto **Plan de Pruebas AQUILA** contra las tres
copropiedades del banco QA local, y dejás constancia de cada caso con evidencia.

Respondé siempre **en español**.

## Lo primero, sin excepción

1. `node scripts/qa/estado.mjs` — dónde quedó la cosa.
2. Leé `qa/tenants.json` — los ids de las tres copropiedades, los usuarios y sus contraseñas.
   Si el archivo no existe, o los tenants ya no están en base, sembrá: `pnpm seed:qa-suite`.
3. Verificá que `.env` apunte a **local** (`SUPABASE_URL=http://127.0.0.1:54321`). Si apunta a
   remoto, **parás y avisás**: este banco no corre contra producción.

## El tablero

`qa/tenants.json` es la fuente. Tres copropiedades, y cada una existe por una razón:

| | Copropiedad | Inmuebles | Para qué |
|---|---|---|---|
| **T1** | QA Torres del Parque | 30 | Residencial madura. Enero–agosto liquidados y recaudados; junio-agosto con recaudo desigual, así que hay **mora real de hasta tres meses**. **Septiembre (el periodo corriente) está ABIERTO sin liquidar** — es lo que ejecuta f6-06. Aquí van casi todas las fases. |
| **T2** | QA Plaza Comercial | 18 | Mixto comercial, responsable de IVA, agente de retención, marco contable Grupo 2. Es el **"otro tenant"** de toda la fase f17: tiene datos reales que desde T1 no se deben poder ver. Su único miembro es `qa.ajeno@aquila.test`. |
| **T3** | QA Conjunto Nuevo | 12 | Tablero en blanco: sin coeficientes activos, sin presupuesto, sin plan contable, sin periodos. Es el punto de partida de f21-03 y el contraste de los casos de "estado inicial". |

Usuarios de prueba (contraseña en `qa/tenants.json`, campo `passwordQa`):
`qa.auxiliar@` escribe, `qa.auditor@` solo lee, `qa.aprobador@` es el segundo par de ojos del
maker-checker, `qa.financiero@` sirve para acotar roles funcionales, `qa.ajeno@` es el intruso
de las pruebas de aislamiento.

### Reglas del tablero — no lo rompas

- **Las tres copropiedades no se borran.** Al terminar siguen ahí, con sus datos. Si una prueba
  necesita destruir algo, hacelo sobre un registro creado por la propia prueba.
- **No corras `supabase db reset` / `stop` / `start`.** Ni siquiera si parece la salida fácil:
  borra tenants locales que el usuario construyó a mano. Hay un hook que te va a frenar; no lo
  esquives.
- `pnpm seed:qa-suite` **reemplaza** el banco entero (retira las tres y las vuelve a crear).
  Solo corrélo si el usuario lo pide o si el tablero está roto de verdad — y avisá antes.
- La semilla pone el tablero, **no juega la partida**: si un ítem dice "registrar un activo" o
  "crear un órgano", eso lo creás vos al ejecutarlo, no está sembrado.

## Cómo se ejecuta un caso

Cada ítem de `qa/plan.json` trae `accion` (qué hacer) y `criterioAprobacion` (**qué declara el
caso aprobado**). Aprobás contra el criterio, nunca contra "la pantalla abrió".

### Elegir la superficie

Decidilo por lo que el criterio exige observar, no por comodidad:

- **Base de datos / API** (`--como=api`) para exactitud aritmética, reconciliación, partida
  doble, consecutivos, RLS y aislamiento, constraints, transiciones de estado, códigos de error
  literales (`BUDGET_NOT_RECONCILED`, `LAST_AGENT`, `INV_EMAIL_MISMATCH`, …).
  Herramientas: `scripts/qa/lib.mjs` (`clienteComo` da una sesión real que respeta RLS;
  `invocarFuncion` llama Edge Functions como lo hace la UI; `clienteAdmin` es service_role —
  usalo solo para **leer** y comprobar, nunca para producir el resultado que estás probando,
  porque service_role se salta la RLS y te haría aprobar un caso que en realidad falla).
- **Navegador** (`--como=ui`) cuando el criterio habla de lo que se ve: menú lateral, rutas
  protegidas, scroll horizontal a ~400px, modo oscuro, mensajes al usuario, deshabilitado vs
  rechazado, orden y foco. Levantá el servidor con `preview_start {name:"aquila-web"}` y entrá
  con `pnpm dev:login <correo>`. Preferí `read_page` / `get_page_text` a las capturas; sacá
  captura solo como evidencia de algo visual.
- Varios criterios piden **las dos**: "deshabilitado o lo rechaza el backend" (f1-02) se
  comprueba mirando la UI *y* intentando la escritura por API. Hacé las dos y decilo.

### Juzgar

- Si el criterio se cumple entero → `aprobado`.
- Si no se cumple → `fallido`, con título y detalle accionables (pasos, esperado, real).
- Si no pudiste ejecutarlo (falta un prerrequisito, o depende de una decisión del usuario) →
  `bloqueado` con motivo. **No lo apruebes "porque probablemente funciona".**
- Si verificaste una parte → `parcial` con motivo diciendo qué falta.
- `no_aplica` solo con un motivo real, no para sacarte un caso de encima.

Un ítem se aprueba con evidencia o no se aprueba. Declarar algo hecho sin evidencia está
prohibido por `PLAN_MAESTRO_IMPLEMENTACION.md` §9.2, y ajustar un dato para que un caso pase,
también.

### Registrar

Siempre, en la misma vuelta en que ejecutás:

```bash
node scripts/qa/registrar.mjs --item=f2-10 --estado=aprobado --como=api --tenant=t1 \
  --observado="El segundo insert con el mismo código falló con 23505 inmuebles_codigo_unico" \
  --evidencia="scripts/qa/casos/f2-10.mjs"
```

Un caso fallido exige `--titulo` y `--detalle`; bloqueado/parcial/no_aplica exigen `--motivo`;
aprobado exige `--observado`. El archivo `qa/resultados.jsonl` es append-only: volver a correr
un caso agrega una línea nueva y la última manda, de modo que se ve cuándo un fallido pasó a
aprobado.

Si escribís un script de comprobación reutilizable, guardalo en `scripts/qa/casos/<item>.mjs` y
citalo en `--evidencia`. Vale la pena para todo lo aritmético y para las fases f17/f18, que se
van a repetir.

## Cuándo preguntarle al usuario

Usá `AskUserQuestion` —en el momento, no al final— cuando:

- El plan mismo pide una decisión. Hay ítems que dicen literalmente *"Verificar el comportamiento
  real: si … documentar cuál de las dos ocurre"* (f2-17, f6-10). Ejecutalos, observá qué pasa, y
  preguntá si ese comportamiento es el deseado antes de aprobarlo o abrirlo como hallazgo.
- Encontrás algo que puede ser un bug o puede ser una decisión de diseño, y la respuesta cambia
  si registrás `aprobado` o `fallido`.
- Un caso exige tocar algo con riesgo real (borrar, desplegar, correr contra remoto).
- Dos lecturas del criterio llevan a resultados distintos.

**No preguntes** lo que podés averiguar leyendo el código, las migraciones o `DECISIONES.md`:
buscá primero. Y no preguntes de a una: si vas a frenar, juntá las dudas de la fase.

Anotá cada respuesta en `qa/decisiones.md` (código del ítem, la pregunta, la respuesta, la
fecha) para no volver a preguntar lo mismo y para que el criterio quede documentado.

## Ritmo de trabajo

Trabajás **por fase**. Una invocación = una fase completa (o el rango que te pidan).

1. `node scripts/qa/estado.mjs --fase=fN` — qué falta de esa fase.
2. Ejecutá los ítems en orden. El orden del plan no es casual: sigue la secuencia real en que
   una copropiedad opera, y hay casos que dependen de lo que dejó el anterior.
3. Registrá cada uno al terminarlo, no al final de la fase (si te interrumpen, no se pierde).
4. Al cerrar la fase: resumen corto al usuario — aprobados, fallidos con su severidad,
   bloqueados y las preguntas que quedaron abiertas.
5. Ofrecé seguir con la fase siguiente.

Con `/loop` encadenado, avanzá una fase por vuelta y parás cuando: no queden ítems, o haya una
pregunta bloqueante sin responder, o aparezca un hallazgo crítico que invalide las fases que
siguen.

### Argumentos

- `/qa-integral` → seguí donde quedaste (la fase del próximo ítem sin ejecutar).
- `/qa-integral f6` → esa fase.
- `/qa-integral f6-f8` → ese rango.
- `/qa-integral f2-14` → ese ítem suelto.
- `/qa-integral estado` → solo el informe, sin ejecutar nada.
- `/qa-integral sembrar` → resembrar el banco (pedí confirmación primero).

## Publicar en el artefacto

El artefacto **Plan de Pruebas AQUILA**
(`https://claude.ai/artifact/3aPTLb4GaVTANbatnJQL5y`) muestra el avance en vivo y lo alimenta el
mismo `qa/resultados.jsonl`. Al cerrar una fase, sincronizá:

```bash
node scripts/qa/exportar-artefacto.mjs
```

y subí lo que imprime con la herramienta `ArtifactData` (colección `resultados`, y `hallazgos`
para los fallidos). Si `ArtifactData` no está disponible en la sesión, decilo — el repo sigue
siendo la fuente de verdad y no se pierde nada.

## Lo que no se hace

- No toques `qa/plan.json` para acomodar un resultado. El plan es el contrato; si un caso está
  mal redactado, registralo como `bloqueado` con el motivo y preguntá.
- No modifiques código de producción para que una prueba pase. Reportá el hallazgo. Corregir es
  otro trabajo, y lo pide el usuario aparte.
- No inventes números. Si un total no cuadra, el hallazgo es que no cuadra.
- No marques una fase completa si dejaste ítems sin ejecutar: decí cuáles y por qué.
