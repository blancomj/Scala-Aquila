-- ═══════════════════════════════════════════════════════════════════════
--  GOB-4 · Acta — vocabulario y fundamento legal
--  Ver GOB_04_acta.md §3, §4.1.
--
--  acta_estado_t gobierna el FSM (borrador→en_verificacion→suscrita→
--  publicada, D-24: no es vocabulario descriptivo, gatilla inmutabilidad
--  desde 'suscrita' y el orden de las transiciones válidas).
--
--  Texto literal del art. 47 verificado cruzando revistapropiedadhorizontal.
--  com/articulo-47-ley-675-de-2001 y una búsqueda independiente
--  (actualicese.com, contodapropiedad.com, copropiedades.com.co) — WebFetch
--  directo contra secretariasenado.gov.co volvió a fallar por TLS, mismo
--  problema documentado en CO-1/MANT-0/GOB-2/GOB-3.
-- ═══════════════════════════════════════════════════════════════════════

create type public.acta_estado_t as enum ('borrador', 'en_verificacion', 'suscrita', 'publicada');

comment on type public.acta_estado_t is
  'D-24: FSM de gobierno_actas. borrador→en_verificacion (solo si se designa comisión '
  'verificadora)→suscrita (asigna numero, congela contenido_generado y hash_contenido, vuelve el '
  'acta inmutable — ACTA_SUSCRITA_INMUTABLE) →publicada (al registrar la primera entrega real, '
  'puesta_a_disposicion_at). borrador→suscrita directo es válido si no hubo comisión.';

insert into public.fundamento_normativo (tipo, norma, articulo, descripcion, fecha_vigencia, referencia)
values (
  'ley', 'Ley 675 de 2001', 'art. 47',
  'Actas: firmadas por presidente y secretario; contenido mínimo (ordinaria/extraordinaria, forma '
  'de la convocatoria, orden del día, nombre y calidad de los asistentes, unidad privada y '
  'coeficiente, votos emitidos en cada caso); comisión verificadora en el plazo del reglamento o, '
  'en su defecto, 20 días hábiles desde la reunión; el administrador pone el acta a disposición en '
  'un lapso no superior a 20 días hábiles desde la reunión; la copia suscrita es prueba suficiente '
  'mientras no se demuestre su falsedad; reclamación ante el alcalde ante la negativa de copia.',
  '2001-08-04',
  'ley675_2001_art47_gob4'
);
