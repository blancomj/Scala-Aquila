-- ═══════════════════════════════════════════════════════════════════════
--  CAR §34.3 · las tablas de evidencia deben poder morir con su tenant
--
--  Defecto introducido el mismo día en 20260906100000: las dos tablas de
--  §34 se crearon con forbid_mutation(), que prohíbe DELETE a todo rol sin
--  excepción. Pero ambas tienen tenant_id ... on delete cascade, así que
--  borrar un tenant con evidencia de cobranza fallaba: la FK dispara el
--  DELETE, el trigger lo rechaza, y la transacción entera se cae.
--
--  Cómo apareció: los tests de integración dejaron de limpiar. Cada corrida
--  del circuito probatorio abandonaba su tenant de prueba, con su usuario y
--  sus datos, porque afterAll fallaba en silencio. Es exactamente el mismo
--  bug que 20260823250000 resolvió para las otras diez tablas append-only,
--  y esas dos nacieron después sin heredar el arreglo.
--
--  Fix: el guard compartido forbid_mutation_salvo_tenant_borrado(), que
--  deja pasar el DELETE ÚNICAMENTE cuando el tenant dueño ya no existe —
--  es decir, la cascada— y nunca un DELETE mientras el tenant vive. UPDATE
--  sigue prohibido siempre: la evidencia no se corrige, se complementa con
--  un acuse posterior.
--
--  Por qué CASCADE y no conservar la evidencia huérfana: no hay retención
--  documentada que sobreviva al tenant. §34.6 mide la retención contra la
--  prescripción de la obligación, y si la copropiedad desaparece del
--  sistema no queda obligación que probar aquí. La retención mientras el
--  tenant vive no la toca esta migración: forbid_mutation_salvo_tenant_
--  borrado() sigue rechazando cualquier purga (I-C25).
-- ═══════════════════════════════════════════════════════════════════════

drop trigger acciones_cobranza_envios_append_only on public.acciones_cobranza_envios;
create trigger acciones_cobranza_envios_append_only
  before update or delete on public.acciones_cobranza_envios
  for each row execute function public.forbid_mutation_salvo_tenant_borrado();

drop trigger acciones_cobranza_acuses_append_only on public.acciones_cobranza_acuses;
create trigger acciones_cobranza_acuses_append_only
  before update or delete on public.acciones_cobranza_acuses
  for each row execute function public.forbid_mutation_salvo_tenant_borrado();
