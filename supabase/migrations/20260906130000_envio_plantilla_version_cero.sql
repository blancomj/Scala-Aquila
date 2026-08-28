-- ═══════════════════════════════════════════════════════════════════════
--  CAR §34.3 · plantilla_version admite 0 = «plantilla sin versionado»
--  Propietario: Docs/Motor de gestion de cartera/CAR_00_Guia_Oficial.md §34.3
--
--  Al conectar el worker de ejecución a acciones_cobranza_envios apareció
--  el problema: plantillas_sms y plantillas_email NO tienen versión. Se
--  editan en sitio, con una sola fila por (tenant_id, event_type). Ese es
--  exactamente PRQ-CAR-021 (versionado recuperable de plantillas), que
--  sigue sin construirse.
--
--  Escribir plantilla_version = 1 sería una mentira cómoda: da a entender
--  que existe una versión 1 recuperable cuando no existe ninguna. 0 dice
--  la verdad —«esta plantilla no tenía versión»— y el día que exista el
--  versionado, un 0 en la evidencia vieja se distingue a simple vista de
--  una versión real.
--
--  Lo que SÍ es prueba fiel mientras tanto es contenido_renderizado: el
--  texto exacto que salió, guardado en el envío. Aunque alguien edite la
--  plantilla mañana, el expediente conserva lo que el deudor recibió.
-- ═══════════════════════════════════════════════════════════════════════

alter table public.acciones_cobranza_envios
  drop constraint envio_plantilla_version_positiva;

alter table public.acciones_cobranza_envios
  add constraint envio_plantilla_version_valida check (plantilla_version >= 0);

comment on column public.acciones_cobranza_envios.plantilla_version is
  'Versión de la plantilla usada. 0 = la plantilla no tiene versionado (PRQ-CAR-021 '
  'pendiente): hoy plantillas_sms/plantillas_email se editan en sitio. No se escribe 1 '
  'para disimularlo. La prueba fiel del contenido es contenido_renderizado.';
