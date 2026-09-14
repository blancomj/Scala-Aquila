/**
 * Metadata pura de cada proveedor de IA — proveedor, nombre comercial,
 * capacidades. Es lo único que la pantalla de configuración (apps/web,
 * cliente del navegador) necesita. Sin dependencias de red ni de Node aquí
 * — a diferencia de packages/payment-gateways (que sí necesita un subpath
 * 'descriptores' separado porque wompi.ts importa node:crypto), este
 * paquete entero es seguro de importar desde un componente Vue: ningún
 * archivo habla con un proveedor todavía (ver tipos.ts).
 *
 * `modelosSoportados` es una lista SUGERIDA para el selector, no exhaustiva
 * ni verificada contra la documentación vigente de cada proveedor al
 * momento de escribir esto (2026-09-13) — los de Anthropic sí son los IDs
 * reales vigentes en este entorno; los de OpenAI/Google son los nombres de
 * familia más recientes conocidos y DEBEN confirmarse contra la
 * documentación oficial del proveedor antes de activarlos en producción,
 * mismo criterio de honestidad que parserBancolombia
 * (conciliacion-parsers.ts): declarar qué no está verificado, no fingir un
 * catálogo cerrado.
 */
import type { DescriptorProveedorIa, IaProveedor } from './tipos.js'

export const DESCRIPTORES: Record<IaProveedor, DescriptorProveedorIa> = {
  anthropic: {
    proveedor: 'anthropic',
    nombreComercial: 'Anthropic (Claude)',
    capacidades: {
      modelosSoportados: [
        'claude-opus-5',
        'claude-sonnet-5',
        'claude-fable-5-1',
        'claude-haiku-4-5-20251001',
      ],
      credencialesRequeridas: ['api_key'],
      urlDocumentacion: 'https://docs.claude.com/',
    },
  },
  openai: {
    proveedor: 'openai',
    nombreComercial: 'OpenAI',
    capacidades: {
      // Verificar contra la documentación vigente antes de activar (ver
      // cabecera del archivo) — no confirmado contra un entorno real.
      modelosSoportados: ['gpt-5', 'gpt-5-mini', 'o4-mini'],
      credencialesRequeridas: ['api_key'],
      urlDocumentacion: 'https://platform.openai.com/docs/',
    },
  },
  google: {
    proveedor: 'google',
    nombreComercial: 'Google (Gemini)',
    capacidades: {
      // Verificar contra la documentación vigente antes de activar (ver
      // cabecera del archivo) — no confirmado contra un entorno real.
      modelosSoportados: ['gemini-2.5-pro', 'gemini-2.5-flash'],
      credencialesRequeridas: ['api_key'],
      urlDocumentacion: 'https://ai.google.dev/gemini-api/docs',
    },
  },
  // No es "un proveedor más": es un gateway — un solo esquema de conexión
  // (Bearer token, payload compatible con OpenAI) que da acceso a
  // cientos de modelos de decenas de proveedores reales detrás. Activarlo
  // deja de limitar a la copropiedad a los 3 proveedores de arriba, elegidos
  // a mano por Aquila — ver 20260935040000.
  openrouter: {
    proveedor: 'openrouter',
    nombreComercial: 'OpenRouter',
    capacidades: {
      // Ejemplos ilustrativos, ni cerrados ni exhaustivos — OpenRouter
      // publica su catálogo completo y actualizado en
      // https://openrouter.ai/api/v1/models (público, sin autenticación).
      // Consumirlo en vivo para poblar esta lista queda para cuando exista
      // un módulo real que lo necesite (ver tipos.ts).
      modelosSoportados: [
        'anthropic/claude-sonnet-4.5',
        'openai/gpt-5',
        'google/gemini-2.5-pro',
      ],
      credencialesRequeridas: ['api_key'],
      urlDocumentacion: 'https://openrouter.ai/docs',
    },
  },
}

export const LISTA_DESCRIPTORES: readonly DescriptorProveedorIa[] = Object.values(DESCRIPTORES)
