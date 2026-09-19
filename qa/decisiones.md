# Decisiones del plan de pruebas

Cada vez que un caso del plan no se puede juzgar sin una decisión del usuario, la duda se anota
aquí y el ítem queda `bloqueado` en `qa/resultados.jsonl` con un motivo que empieza por
`PREGUNTA:`. Cuando el usuario responde, la decisión baja a **Resueltas** y el ítem se vuelve a
ejecutar y a registrar con el veredicto que corresponda.

Existe para no preguntar dos veces lo mismo y para que quede escrito **con qué criterio** se
aprobó cada caso ambiguo.

## Pendientes

(ninguna — las 6 dudas de esta sección bajaron a Resueltas el 2026-09-18; ver ese apartado para
lo que falta EJECUTAR, no solo decidir.)

## Resueltas (2026-09-18)

### Observación sin veredicto — cambio inesperado de sesión durante F22 (no bloqueó ningún ítem, pero podría ser un hallazgo real)

Durante f22-02, al navegar de `/inmuebles/nuevo` a `/dashboard` y de vuelta, el navegador de esta
sesión de QA terminó autenticado como `qa-browser-04124819@aquila.test` (una cuenta de
actor-externo/residente de una prueba anterior de este mismo maratón, con la vista "Mi
Copropiedad") en vez de `qa.aprobador@aquila.test` — sin que yo hubiera hecho logout ni login en
el medio. Se resolvió limpiando cookies/localStorage y volviendo a iniciar sesión como
`qa.aprobador`. No pude aislar la causa con certeza: pudo ser un efecto colateral de mis propias
pruebas (parcheé `window.fetch` momentos antes para simular fallas de red/Edge Function en f22-01
y f22-04, aunque lo restauré antes de este punto) o un problema real de aislamiento de sesión
cuando el mismo navegador acumula tokens de más de una cuenta a lo largo de una sesión larga
(cookie `vinculo-activo-sesion` apuntando a un vínculo de otra cuenta). **Qué necesito decidir**:
¿vale la pena que alguien reproduzca esto en una sesión limpia (login como A, luego como B en la
misma pestaña, sin intervención de scripts) para confirmar si es un bug real de sesión, o se
descarta como artefacto de mis propias pruebas? No se registró como fallido en ningún ítem del
plan porque no hay un caso que lo cubra directamente y no pude aislar la causa.

**Respuesta del usuario (2026-09-18):** sí, reproducir en limpio.

**Estado:** ejecutado 2026-09-18, en una sesión de navegador limpia (sin ningún parche de
`window.fetch` ni script de la suite corriendo en el navegador — la única automatización fue leer
el OTP en claro desde el backend con `fn_actor_externo_solicitar_otp` vía `service_role`, exactamente
como ya se hizo en f15-01/f15-03, porque el dominio `@qa.test` no tiene bandeja real; el navegador
en sí se usó tal como lo haría una persona). Pasos: sesión ya activa como `qa.aprobador@aquila.test`
(administrador, tenant "QA Ciclo Completo F21-03") → se navegó entre `/inmuebles/nuevo` y
`/dashboard` un par de veces → en la MISMA pestaña, se fue a `/mi-copropiedad/login` y se inició
sesión como `andrea.gomez@qa.test` (residente/propietaria real de T1, cuenta ya usada en f15) con
el flujo real de OTP por correo.

**Resultado: el login B reemplazó limpiamente al login A, sin rastros.** Verificado en tres
niveles:
1. La cookie de sesión de Supabase (`sb-127-auth-token`) quedó con el JWT de `andrea.gomez@qa.test`
   (`sub` = su propio `auth.users.id`), no con el de `qa.aprobador`.
2. La cookie `vinculo-activo-sesion` apuntaba a `2a1c0e04-8866-4fb9-87e7-d17d6ed35969` — se verificó
   contra `actor_externo_vinculo` que ese id **es uno de los dos vínculos reales de la propia
   Andrea** (T1-101, propietaria) — no un vínculo de otra cuenta ni un residuo de la sesión
   anterior de `qa.aprobador`.
3. Navegar después a `/dashboard` (ruta de administrador) no mostró ningún dato de
   `qa.aprobador`/F21-03 ni crasheó: redirigió limpiamente a la vista de portal (`/mi-copropiedad`,
   con los datos reales y propios de Andrea — saldo $697.914, su solicitud `#1/2026`, etc.).
   `localStorage` no tenía ningún residuo relevante.

**Conclusión:** no se reprodujo contaminación de sesión en este escenario simple (login → login,
en la misma pestaña, sin builds intermedias raras). El incidente original de f22-02 —terminar
autenticado como `qa-browser-04124819@aquila.test` sin haber hecho login explícito— sigue sin
explicación confirmada, pero esta prueba acota la causa: no es un defecto genérico y fácil de
disparar en "iniciar sesión A, luego B, en la misma pestaña" (el mecanismo real de reemplazo de
sesión —`setSession()`— funciona correctamente). Es más probable que haya sido, como ya se
sospechaba, un efecto colateral de los parches de `window.fetch` que esa misma sesión tenía
activos momentos antes (f22-01/f22-04) u otro artefacto propio de esa corrida larga con muchas
cuentas acumuladas — no un bug reproducible del producto. Se cierra sin hallazgo nuevo.

### f21-03 — ciclo completo por interfaz: bloqueado en la activación del presupuesto (requiere archivo real o flujo de gobierno completo)

**Qué dice el plan.** «Desde una copropiedad recién creada: instalar plan de cuentas → cargar
inmuebles/coeficientes/presupuesto → liquidar → recaudar → cerrar, usando EXCLUSIVAMENTE la
interfaz». Criterio: si hace falta tocar la base a mano en algún paso, ese paso es un hallazgo, no
un atajo válido.

**Qué se hizo.** Se creó un tenant nuevo real ("QA Ciclo Completo F21-03") por
`/onboarding/create-tenant` y se avanzó 100% por UI: inmueble + persona, coeficientes, cuenta de
recaudo, y un concepto de cobro nuevo llevado a estado **Activo** por el flujo real
Borrador → Enviar a revisión → Aprobar (la pestaña "Auditoría" del concepto, que en un intento
anterior de esta misma sesión no se había encontrado — quede registrado que SÍ existe y funciona).
El checklist de "Primeros pasos" llegó a 5/5. Se creó un presupuesto 2026 v1 y se cuadraron los
rubros ("Listo para activar").

**Dónde se atascó.** Activar el presupuesto (paso obligatorio para poder crear periodos de
liquidación) exige, dentro del propio modal: (a) adjuntar un archivo real de acta de asamblea
(`<input type=file>` nativo del sistema operativo — la herramienta de automatización de navegador
de esta sesión no tiene forma de operar un diálogo nativo de selección de archivos), o (b) elegir
una decisión de gobierno vigente, la cual solo se puede crear desde una votación cerrada y
aprobada en el detalle de una reunión de un órgano de gobierno (un submódulo completo:
órgano → reunión → votación → decisión). Ninguna de las dos rutas implica tocar la base de datos a
mano — son requisitos reales de negocio (Ley 675/2001 art. 47) — pero ambas exceden lo que esta
sesión puede ejercitar por interfaz para este caso puntual.

**Qué necesito decidir.** ¿Cómo cerrar f21-03?
1. Que alguien suba manualmente el acta vía UI en una sesión con acceso a diálogo de archivos
   nativo (completaría el ciclo real en minutos), o
2. Que se autorice construir el flujo de gobierno completo (órgano+reunión+votación+decisión)
   como parte de este caso, o
3. Que se acepte el resultado actual — bloqueado justo en la activación del presupuesto — como
   evidencia suficiente de que el ciclo end-to-end por UI SÍ es alcanzable salvo por esta
   limitación de la herramienta de prueba (no del producto).

Quedó registrado como `bloqueado` en `qa/resultados.jsonl`, no como `fallido`: no se encontró
ningún paso del ciclo que exigiera tocar la base de datos a mano; el bloqueo es de la herramienta
de automatización (sin diálogo nativo de archivos), no del producto.

**Respuesta del usuario (2026-09-18):** (2) — autorizar construir el flujo de gobierno completo
(órgano → reunión → votación → decisión) como parte de este caso. El submódulo ya existe en el
producto (no es una feature nueva); lo que falta es ejercitarlo por UI dentro de este tenant de
prueba: crear el órgano, programar la reunión, registrar la votación, cerrarla/aprobarla, y usar
la decisión de gobierno resultante para completar la activación del presupuesto que quedó
pendiente.

**Estado:** ejecutado 2026-09-18. Se corrió el flujo completo de gobierno en "QA Ciclo Completo
F21-03": creado el órgano Asamblea General, agregados Presidente y Secretario (miembros del
órgano — imprescindibles porque "Instalar reunión" solo ofrece candidatos con esos roles),
programada y convocada una reunión (Asamblea Ordinaria), un punto de agenda con "Requiere
decisión" marcado, e instalada. Al revisar el quórum se encontró un requisito legal real que el
tenant no podía cumplir todavía: **art. 45 exige pluralidad de propietarios** (más de una persona
distinta presente) además de coeficientes — con el único inmueble A-01 sembrado originalmente,
`hay_pluralidad` siempre daba `false` y `fn_gobierno_abrir_votacion` rechazaba con
`VOTACION_SIN_QUORUM` sin importar el coeficiente. Se agregó un segundo inmueble real (A-02, con
su propio propietario) por UI, y una nueva versión de coeficientes (v2, A-01=0.59/A-02=0.41,
Σ=1) activada para reemplazar la v1 (que solo cubría A-01) — ambos pasos son prerrequisitos de
datos, no el caso bajo prueba. Con los dos propietarios presentes (quórum deliberatorio: sí, 2
personas), se abrió una votación de "Decisión ordinaria" sobre la pregunta de activar el
presupuesto 2026 v1, ambos votaron a favor, se cerró la votación (aprobada) y se creó la
decisión de gobierno GOB-5 (1/2026, vigente). Se activó el presupuesto 2026 v1 usando esa
decisión como respaldo (Ley 675 art. 51) — pasó de borrador a **vigente**. Este era el bloqueo
original de f21-03 y quedó resuelto íntegramente por UI.

Siguiendo el ciclo (crear periodo de liquidación → liquidar → recaudar) se encontró un bloqueo
NUEVO y real, esta vez un hallazgo del producto, no una decisión pendiente: en
`/contabilidad/cierres` la única acción que crea periodos (`fn_contable_abrir_ejercicio`, la que
inserta las 12 filas de `periodos`) vive detrás del botón "Abrir ejercicio {año+1}", que el
frontend deshabilita mientras el año *actualmente seleccionado* no tenga sus 12 periodos en
`contable_estado=bloqueado` (`ejercicioBloqueado`, cierres.vue:62-64/240). Para un tenant sin
ningún periodo previo (como cualquier copropiedad recién creada), esa condición es imposible de
cumplir — no hay un año anterior que cerrar. La función SQL en sí no impone esa restricción (solo
genera los 12 periodos vía `generate_series` y un comprobante de apertura); es una restricción
exclusiva del frontend. No hay ninguna otra vía de escritura: la política RLS de `periodos`
exige rol `agent`, que ningún usuario humano tiene. Registrado como hallazgo real (f21-03,
`fallido`, severidad alta) — ver `qa/resultados.jsonl`. El ciclo se detuvo exactamente ahí, sin
tocar la base de datos a mano, tal como exige el criterio del caso.

### f8-09 — ¿el criterio exige que exista un cálculo de fecha de prescripción, o solo que el acto quede registrado?

**Qué dice el plan.** «Registrar un acto interruptivo de prescripción sobre ese caso → La
fecha de prescripción se recalcula hacia adelante desde la fecha de ese acto — no sigue
contando desde el origen de la mora.»

**Qué hace hoy el sistema.** `prescripcion_actos_interruptivos` (VER-CAR-05, bloque 13) es
deliberadamente solo una bitácora FACTUAL append-only — registra qué se dice que pasó, cuándo
y con qué evidencia, pero el propio comentario de la migración dice explícito: *"el sistema no
afirma que esto interrumpió la prescripción ni calcula ningún plazo"*. Es así a propósito
porque VER-CAR-05 (término, cómputo y actos que interrumpen la prescripción bajo el régimen
civil aplicable a expensas comunes) sigue ABIERTO sin concepto jurídico verificado — por la
regla del proyecto, mientras un VER-CAR-* esté abierto no se inventa un valor por defecto.
Se registró un acto real (T2-202, reconocimiento escrito, 2026-09-16) y quedó correctamente en
la bitácora, pero no hay ninguna fecha de prescripción calculada en ningún lado para comparar.

**La duda.** Misma familia que f2-25/f7-02: (a) el criterio real que importa es que el acto
quede registrado con su fecha (se aprueba, el cálculo es una pieza futura fuera de alcance
mientras VER-CAR-05 siga abierto); o (b) el plan exige que el cálculo exista ya — hallazgo/gap
real contra VER-CAR-05.

**Respuesta del usuario (2026-09-18):** (a) — se aprueba con el criterio de que basta con que el
acto quede registrado con su fecha; el cálculo de la fecha de prescripción es una pieza futura
fuera de alcance mientras VER-CAR-05 siga abierto.

**Estado:** resuelto y aprobado — ver nueva fila en `qa/resultados.jsonl` (f8-09, `aprobado`,
2026-09-18).

### f7-02 — ¿un comprobante manual descuadrado debe rechazarse al guardar el borrador, o basta con que nunca llegue a contabilizarse?

**Qué dice el plan.** «Crear un comprobante manual con débitos distintos de créditos →
Rechaza ANTES de guardar — nunca queda un comprobante descuadrado en el sistema.»

**Qué hace hoy el sistema.** `/contabilidad/comprobantes` permite guardar un borrador con
débito ≠ crédito sin ningún bloqueo — probado con una línea de $100.000 débito y otra de
$50.000 crédito (diferencia $50.000 en rojo, botón "Guardar borrador" habilitado igual):
se guardó ("Borrador creado.") y quedó persistido en `contable_comprobante` con
`estado=borrador`, `numero=null`. El propio formulario lo dice explícitamente debajo del
botón: *"El borrador se guarda aunque no cuadre. Para contabilizarlo (asignarle número),
ábrelo desde la lista una vez cuadrado."* El rechazo real (`COMPROBANTE_DESCUADRADO`) solo
ocurre en `fn_contabilizar_comprobante`, es decir, al intentar pasar de `borrador` a
`contabilizado` — nunca al guardar el borrador.

**La duda.** Es la misma familia de caso que f2-25 y f2-17: el código documenta a propósito
un comportamiento distinto al que el texto del plan asume. Necesito que el usuario decida:
(a) el criterio real que importa es "nunca queda CONTABILIZADO (numerado, en el libro)
descuadrado" — coincide con el diseño actual, se aprueba el caso; o (b) el plan quiere decir
literalmente que ni siquiera el borrador debería poder guardarse descuadrado — hay que
agregar una validación en el guardado del borrador (bug/gap a corregir).

**Respuesta del usuario (2026-09-18):** (a) — se aprueba el diseño actual: el criterio real que
importa es "nunca queda CONTABILIZADO descuadrado"; el borrador puede quedar descuadrado
temporalmente sin que eso sea un bug.

**Estado:** resuelto y aprobado — ver nueva fila en `qa/resultados.jsonl` (f7-02, `aprobado`,
2026-09-18). El comprobante de prueba se eliminó tras verificar, no quedó residuo en T1.

### f7-05 — ¿cerrar el periodo contable de septiembre en T1, sabiendo que exige cerrar antes los 8 meses previos?

**Qué dice el plan.** «Cerrar el periodo contable actual → el periodo pasa a "cerrado" y el
saldo final de cada cuenta transfiere como saldo inicial del periodo siguiente.»

**El bloqueo real.** `/contabilidad/cierres` valida septiembre y devuelve DOS bloqueantes:
1. `periodo_anterior_abierto` — agosto todavía está abierto; el cierre mensual exige orden
   estricto (no se puede cerrar septiembre sin haber cerrado agosto, julio, ... enero antes).
2. `conciliacion_cartera` — 9 inmuebles con diferencia entre el auxiliar de cartera y lo
   contabilizado (T1-402, T1-501, T1-502, T2-402, T2-501, T2-502, T3-402, T3-501, T3-502),
   más una advertencia de deterioro no reconocido para los mismos 9.

Como enero-agosto de T1 nunca se contabilizaron (recién corrí `fn_contabilizar_periodo` para
septiembre en f7-01), cerrar septiembre en serio implicaría contabilizar y cerrar los 8 meses
anteriores uno por uno — cada uno con su propia validación y probablemente su propio
bloqueante de conciliación — más reconocer el deterioro pendiente. Es un cambio en cascada,
grande y difícil de revertir sobre el tablero real de T1 (mismo perfil de riesgo que f4-05/06,
con un alcance mayor), del que dependen F8 (Cartera) y F9 (Finanzas).

**La duda.** (a) proceder igual en T1, asumiendo cerrar los 8 meses previos + reconocer el
deterioro como parte de este caso; o (b) montar el flujo en un tenant descartable aparte
(mismo criterio ya usado para f4-05/f4-06), con datos mínimos ya conciliados para poder cerrar
un periodo limpio sin la cadena de meses previos.

**Respuesta del usuario (2026-09-18):** (b) — montar el flujo en un tenant descartable aparte,
mismo criterio ya usado para f4-05/f4-06; no tocar T1.

**Estado:** resuelto. Pendiente de ejecución: crear un tenant descartable con datos mínimos ya
conciliados, contabilizar y cerrar sus periodos previos en orden hasta poder ejercitar un cierre
limpio sin la cadena de 8 meses de T1, y registrar f7-05 con el tenant que corresponda. T1 no se
toca — septiembre sigue `contable_estado=abierto` sin cambios.

### f14-01 — ¿"aprobar una novedad" debería generar una entrada en el histórico de comunicaciones?

**Qué dice el plan.** «Enviar un anuncio y aprobar una novedad (dos módulos distintos) y revisar
el histórico de comunicaciones → Aparecen AMBOS envíos en la misma lista unificada, cada uno con
su módulo de origen identificable.»

**Qué hace hoy el sistema.** `supabase/functions/aprobar-novedad/index.ts` no tiene ninguna
lógica de envío de correo/SMS ni llama a `registrarEnvioComunicacion` — aprobar una novedad no
genera ningún canal de comunicación saliente, por lo tanto nunca puede aparecer en
`/comunicaciones` (que solo lista comunicaciones REALMENTE despachadas por un canal, no eventos
de dominio o notificaciones in-app). Sí se confirmó que el histórico unifica correctamente varios
módulos que SÍ despachan: al enviar el anuncio de prueba (ver hallazgo de bug abajo) las 32 filas
quedaron con módulo=`anuncios`, y ya convivían en la misma lista con las 3 filas previas de
módulo=`Cobranza` (cartera) — la unificación multi-módulo en sí funciona.

**La duda.** (a) el plan usa "aprobar una novedad" como ejemplo genérico de "otro módulo
cualquiera que despache una comunicación" y en realidad basta con demostrar la unificación con
DOS módulos que sí envían (p.ej. anuncios + cobranza, ya demostrado) — se aprueba con esa
sustitución; o (b) el plan asume que aprobar una novedad específicamente debería notificar a
alguien (el solicitante) y hoy no lo hace — sería un hallazgo/gap real a registrar contra el
módulo de Novedades.

**Hallazgo aparte (no depende de la respuesta anterior):** al probar "enviar un anuncio" se
encontró un bug real y reproducible. `supabase/functions/enviar-anuncio/index.ts` línea 228 llama
`jsonResponse(200, { enviados, fallidos, sin_correo: sinCorreo, destinatarios: lista.length },
correlationId)`, pero la firma real de `jsonResponse` en `supabase/functions/_shared/http.ts`
línea 54 es `jsonResponse(data, status = 200, correlationId)` — los dos primeros argumentos están
invertidos. El resultado: el despacho real se completa con éxito (log del servidor:
`anuncio.despachado`, `destinatarios:32, enviados:32, fallidos:0, sinCorreo:0`, y las 32 filas
quedan bien registradas en `comunicaciones`), pero la función revienta al construir la respuesta
HTTP con `RangeError: The status provided (0) is not equal to 101 and outside the range
[200, 599]`, y el endpoint devuelve 500 al front — el usuario ve un error aunque el anuncio sí se
envió a los 32 destinatarios reales. Se registra f14-01 como **fallido** por este bug en sí mismo,
independientemente de cómo se resuelva la duda de la novedad.

**Respuesta del usuario (2026-09-18):** (a) — se aprueba la sustitución; la unificación
multi-módulo ya quedó demostrada con anuncios+cobranza, no hace falta que "aprobar novedad"
específicamente despache una comunicación.

**Estado:** la duda queda resuelta, pero el veredicto del ítem NO cambia — sigue `fallido` en
`qa/resultados.jsonl` (f14-01) por el bug real de `enviar-anuncio` en sí mismo, que es motivo
suficiente independiente de esta decisión.

### f8-10 — ¿una PROMESA de pago debería congelar el escalamiento de cobranza igual que un ACUERDO? (faltaba en este archivo — solo estaba registrada como bloqueada en `qa/resultados.jsonl`)

**Qué dice el plan.** «Mientras esté vigente [la promesa de pago], el caso no escala a un nivel
superior de cobranza aunque los días de mora sigan corriendo.»

**Qué hace hoy el sistema.** Se registró una promesa de pago real (T1-402, $1.034.691, fecha
prometida 2026-09-30, estado Pendiente) vía `/cartera/promesas-acuerdos`. Al re-correr
`cartera-recalcular` en modo simulación acotado a ese inmueble, `decisionEscalamiento` siguió
devolviendo `{tipo: bloqueado, requisitoFaltante: "Acciones administrativas sin agotar"}` — nunca
pasó a `{tipo: congelar}`. En el código (`evaluarEscalamiento`,
`packages/liquidation-engine/src/cartera-escalamiento.ts:124`; `tieneAcuerdoVigente`,
`cartera-job-supabase.ts:58-70`) el freeze de escalamiento solo se activa por un registro vigente
en `acuerdos_pago` (un ACUERDO formal, pestaña separada) — "promesa" no aparece en ningún punto de
`evaluarEscalamiento`. Una promesa solo se marca "incumplida" si vence sin cumplirse (eso es
f8-11), pero no tiene ningún efecto sobre el escalamiento mientras está vigente.

**La duda.** (a) el plan usó "promesa" en sentido genérico refiriéndose en realidad a "acuerdo de
pago" — hay que repetir la prueba con un acuerdo, no una promesa, y el caso se aprueba con esa
aclaración; o (b) es un hallazgo real: una promesa también debería frenar el escalamiento y hoy no
lo hace.

**Respuesta del usuario (2026-09-18):** (b) — gap real. Una promesa de pago vigente también debe
congelar el escalamiento de cobranza; que solo lo haga un acuerdo formal es un hallazgo a corregir
en el motor de cartera.

**Corrección (2026-09-18, misma sesión, antes de tocar código):** al ir a implementar el cambio se
encontró que `Docs/Motor de gestion de cartera/CAR_00_Guia_Oficial.md` §12.1 tiene una tabla
explícita "Promesa de pago vs Acuerdo de pago" con la fila **"Efecto en escalamiento: Ninguno; solo
pospone la siguiente acción"** para promesa, contra **"Congela la etapa"** para acuerdo — es una
distinción de negocio deliberada y documentada, no un vacío. El código actual (`tieneAcuerdoVigente`,
`cartera-job-supabase.ts:58-70`) ya implementa esa distinción correctamente. Se le mostró esto al
usuario, que revirtió su respuesta: **f8-10 queda aprobado**, la interpretación correcta era (a) —
el plan usó "promesa" en sentido genérico por "acuerdo". No se modificó ningún código.

**Estado:** resuelto y aprobado — ver nueva fila en `qa/resultados.jsonl` (f8-10, `aprobado`,
2026-09-18, corrige la fila `fallido` anterior del mismo día).

## Resueltas

### f8-05/f8-06 — ¿montar un túnel público local para probar el webhook de acuse de Brevo?

**El bloqueo.** El envío real de SMS/email ya funciona (confirmado: 1 SMS real aceptado por
Brevo, message id `5367046033556065`), pero para que una acción de cobranza llegue a estado
"acreditada" (requisito de f8-05 para escalar a Prejurídica) hace falta que Brevo entregue de
vuelta un webhook de acuse de entrega — y ese webhook necesita una URL pública alcanzable desde
internet, que el entorno local (`localhost`) no tiene. La alternativa era montar un túnel
público (ngrok o similar) y reconfigurar temporalmente el webhook en el panel de Brevo.

**Respuesta del usuario (2026-09-17):** no montar el túnel ahora — verificar f8-05/f8-06 más
adelante contra el proyecto remoto (donde la URL del webhook ya es pública de verdad), no en
local.

**Estado:** f8-05/f8-06 quedan `bloqueado` en `qa/resultados.jsonl` tal como están, documentados
como limitación de entorno local — se reintentan cuando corresponda validar contra remoto, no
como parte de esta corrida local del plan.

### f2-17 — ¿inactivar un inmueble CON saldo pendiente debería advertir?

**Qué dice el plan.** «Intentar inactivar un inmueble CON saldo pendiente → Verificar el
comportamiento real: si lo permite igual, el saldo debe seguir siendo exigible; si lo bloquea,
debe explicar por qué. Documentar cuál de las dos ocurre.»

**Qué hace hoy el sistema.** Permite inactivar sin ninguna advertencia ni confirmación adicional
— el mismo menú "Inactivar inmueble" que para un inmueble sin saldo, sin ningún diálogo
intermedio. Probado sobre T1-402 con $629.444 de saldo pendiente (5 cargos abiertos): se
inactivó sin fricción, y después `v_cargo_saldo` siguió mostrando los mismos 5 montos sin
cambios — el saldo sigue siendo exigible, nada se pierde ni se castiga.

**Respuesta del usuario (2026-09-16):** no se debe dejar inactivar un inmueble con saldo
pendiente — no basta con advertir, hay que **bloquear** la acción. Esto convierte el criterio del
plan (que aceptaba "lo permite igual" como rama válida) en un hallazgo real: el sistema hoy
permite lo que debería rechazar. Registrado como hallazgo — ver `qa/resultados.jsonl` (f2-17,
fallido). Falta implementar el bloqueo (probablemente un check o trigger sobre `inmuebles` que
exija `v_cargo_saldo` en 0 antes de permitir `estado=inactivo`) — no implementado todavía.

**Estado:** T1-402 quedó revertido a `estado=activo` después de la prueba, sin alterar el
tablero.

### f4-05/f4-06 — ¿activar un presupuesto 2027 para T1, sabiendo que cierra el 2026 vigente?

**Qué dice el plan.** Crear el presupuesto 2027, cargar rubros descuadrados e intentar
activarlo (debe rechazar), luego corregir y activar con acta de asamblea (debe pasar a vigente
y el 2026 debe pasar a cerrado automáticamente).

**El riesgo.** `presupuestos_vigente_unica` (índice único parcial) garantiza que activar 2027
retira automáticamente el 2026 vigente de T1 a `cerrado` — mismo patrón que coeficientes
(f2-26/27) y políticas financieras (f3-02), pero con un radio de impacto mucho mayor: el
perfil documentado de T1 (`qa/README.md`) dice explícitamente "presupuesto 2026 vigente
($202.800.000)" como rasgo central, y probablemente F5 (Contabilidad), F6 (Facturación),
F7-F9 (operación financiera) y F10 (Fondos) asumen ese presupuesto vigente en sus pruebas.

**Respuesta del usuario (2026-09-16):** (b) — montar el flujo en un tenant descartable aparte,
no tocar T1. El presupuesto 2026 de T1 sigue vigente sin cambios; el resto de las fases (F5-F10)
sigue asumiendo ese presupuesto tal como lo documenta `qa/README.md`.

**Estado:** resuelto. Pendiente de ejecución: crear un tenant descartable con plan de cuentas y
rubros mínimos, correr ahí el flujo completo (presupuesto 2027 con rubros descuadrados → debe
rechazar `BUDGET_NOT_RECONCILED`; corregir y activar con acta de asamblea → debe pasar a vigente),
y registrar f4-05/f4-06 con el tenant que corresponda (no t1/t2/t3).

### f4-10 — ¿qué mecanismo de "cerrar periodo" evalúa este caso?

**Qué dice el plan.** «Cerrar el periodo actual y abrir el siguiente → el periodo cerrado deja
de aceptar nuevos movimientos presupuestales; el siguiente queda abierto y disponible.»

**Lo que encontré.** Hay dos campos de cierre distintos en `periodos`:
1. `estado` (abierto/cerrado) — el que de verdad suena a "movimientos presupuestales". En T1,
   los meses 1-8 ya están `cerrado` (liquidados por el seed) y el mes 9 (septiembre, el
   corriente) está `abierto` — reservado explícitamente para f6-06. No encontré ninguna acción
   de UI que cambie este campo directamente; parece ser un efecto colateral de liquidar el
   periodo (la misma acción de f6-06), no un botón aparte de "cerrar periodo".
2. `contable_estado` — sí tiene una acción manual dedicada (`fn_contable_cerrar_periodo`,
   Contabilidad → Cierres, CO-6), pero es un cierre **contable** (valida asientos), no de
   "movimientos presupuestales", y probablemente pertenece a F7 con su propio criterio.

**Respuesta del usuario (2026-09-16):** `periodos.estado` — el caso evalúa el cierre de
movimientos presupuestales, no el cierre contable de F7. Como ejecutarlo ahora consumiría el
periodo de septiembre reservado para f6-06, correr f4-10 junto con o inmediatamente después de
f6-06 (mismo periodo, mismo efecto colateral de liquidar) en vez de pisarle el escenario.

**Estado:** resuelto, ya no es pregunta — solo queda secuenciado para ejecutarse en F6, junto con
o inmediatamente después de f6-06 (liquidar septiembre en T1). Mientras tanto sigue como
`bloqueado` en `qa/resultados.jsonl`, con el motivo aclarando que es una secuenciación, no una
duda pendiente.

### f1-01 — ¿hasta qué rol puede invitar un auxiliar?

**Qué encontró la prueba.** `invite_user()` (SQL) solo exige `has_role(tenant, ['auxiliar'])`
para invitar, sin restringir a qué rol puede invitar el llamador — un auxiliar puede otorgar el
rol `administrador` a un correo propio o de un cómplice, saltándose la restricción que la UI y la
Edge Function aparentan imponer (ambas fijan las opciones a `auxiliar|auditor` para cualquiera,
sin distinguir quién invita). Ver `qa/resultados.jsonl` (f1-01, fallido, severidad alta) para el
detalle completo y la evidencia.

**Respuesta del usuario (2026-09-16):** NO — un usuario solo puede invitar a alguien con un rol
**igual o inferior** al propio. Jerarquía de `TenantRole` (`apps/web/app/types/permissions.ts:17`,
de menor a mayor): `auditor` < `auxiliar` ≈ `administrador` (administrador ⊇ auxiliar en permisos,
más la capacidad extra de aprobar acciones de cobranza de alto impacto — ver comentario en esa
misma matriz). Aplicando "igual o inferior": un `auxiliar` puede invitar `auxiliar` o `auditor`,
nunca `administrador`; un `administrador` puede invitar cualquiera de los tres. Esto coincide con
lo que la UI ya aparenta (auxiliar limitado a auxiliar/auditor) — falta que la función SQL
`invite_user()` lo exija de verdad, porque hoy solo lo aparenta el frontend. No implementado
todavía.

### f2-25 — ¿activar un set de coeficientes descuadrado debe bloquearse?

**Qué dice el plan.** «Crear un set de coeficientes cuya suma dé 0.98 e intentar activarlo →
Rechaza explícitamente citando que la suma no da 1 — nunca deja "vigente" un set descuadrado.»

**Qué hace hoy el sistema.** Con el set vigente retirado primero, un set cuyos 30 coeficientes
suman `0.9799999980` pasa a `vigente` sin ningún error. Y no es un descuido:

- `apps/web/app/stores/coeficientes.ts:23-27` lo dice explícito — *«Σ coeficientes: el motor NO
  exige que sume 1.0 (16 §82 — probado en allocation.test.ts). El formulario de creación solo
  advierte si Σ no coincide con `coeficientes_suma_esperada` de la política vigente, nunca
  bloquea.»*
- `CoeficientesVersionDrawer.vue:305-308` muestra en pantalla *«Σ = X (esperada 1) — no coincide,
  pero no bloquea el guardado»*.

**Ojo con el falso positivo.** En la primera pasada el intento SÍ fue rechazado, pero por el
índice único `coeficiente_sets_vigente_unico` —ya existía un set vigente—, no por la suma. Quien
pruebe esto sin retirar antes el set vigente va a aprobar el caso por la razón equivocada.

**Respuesta del usuario (2026-09-16):** (a) — el criterio del plan está mal redactado. Doc 16 §82
y el código ya reflejan una decisión deliberada. Se corrige el criterio a «advierte que la suma no
coincide con la esperada (Σ = X, esperada 1), sin bloquear el guardado» y f2-25/f2-26/f2-27 se
evalúan contra ese criterio corregido, no contra el texto original del plan.
