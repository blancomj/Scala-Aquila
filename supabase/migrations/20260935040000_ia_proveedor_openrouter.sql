-- ═══════════════════════════════════════════════════════════════════════
--  Agrega 'openrouter' a ia_proveedor_t (20260935000000).
--
--  Motivo (decisión del usuario, 2026-09-13): OpenRouter no es "un proveedor
--  más" en el sentido de Anthropic/OpenAI/Google — es un gateway que expone
--  500+ modelos de 60+ proveedores detrás de UN solo esquema de conexión
--  (Bearer token + payload compatible con OpenAI). Agregarlo como valor del
--  enum es lo que deja de limitar a la copropiedad a los 3 proveedores que
--  Aquila eligió a mano: activar OpenRouter da acceso a cualquier modelo que
--  ese gateway soporte, sin que Aquila tenga que escribir/mantener un
--  descriptor por cada proveedor real detrás.
--
--  ALTER TYPE ... ADD VALUE en su propia migración (no se puede usar el
--  valor nuevo en la misma transacción que lo agrega) — mismo cuidado que
--  20260830100000 con RENAME VALUE, aunque ahí sí podía reutilizarse en la
--  misma migración porque RENAME (a diferencia de ADD) no tiene esa
--  restricción.
-- ═══════════════════════════════════════════════════════════════════════

alter type public.ia_proveedor_t add value 'openrouter';

comment on type public.ia_proveedor_t is
  'Proveedor de servicios de IA. Enum nativo y no lista_tipos (D-24) porque el valor selecciona '
  'en tiempo de ejecución qué credenciales exigir y contra qué API hablar (packages/ai-providers/'
  'src/descriptores.ts) — mismo criterio exacto que pasarela_proveedor_t. anthropic/openai/google '
  'son proveedores directos; openrouter es un gateway (un solo esquema de conexión, cientos de '
  'modelos de decenas de proveedores detrás) — ver 20260935040000. Un proveedor nuevo es un '
  'descriptor que alguien tiene que escribir, agregarlo al enum sin su descriptor es un error de '
  'compilación de TypeScript (Record exhaustivo), no un fallo en producción.';
