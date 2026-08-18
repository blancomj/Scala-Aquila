/**
 * D-24 (DECISIONES.md) — test-guardia: todo `CREATE TYPE ... AS ENUM` nuevo
 * debe traer, en alguna migración, un `COMMENT ON TYPE public.<nombre> IS
 * '...'` que explique por qué es inevitable como enum nativo (gatilla
 * lógica/transición de estado/invariante) en vez de una familia de
 * `lista_tipos` (`20260814160000_tipos_lista_tipos.sql`).
 *
 * Los 47 enums ya existentes al 2026-08-17 (ENUMS_LEGADO) quedan exentos —
 * no se migran retroactivamente (decisión del usuario, ver D-24). Solo se
 * exige la justificación para enums creados de aquí en adelante.
 *
 * Puramente estático — sin red, sin Supabase, corre siempre.
 */
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const RAIZ = join(import.meta.dirname, '..', '..')
const DIR_MIGRACIONES = join(RAIZ, 'supabase', 'migrations')

/** Congelado al 2026-08-17 (D-24) — no agregar nombres aquí; un enum nuevo
 * se justifica con COMMENT ON TYPE, no ampliando esta lista. */
const ENUMS_LEGADO = new Set<string>([
  'alcance_accion_cobranza_t',
  'canal_cobranza_t',
  'cargo_categoria_t',
  'cargo_origen_t',
  'concepto_estado_t',
  'concepto_modo_calculo_t',
  'concepto_tipo_base_t',
  'cuenta_bancaria_tipo_t',
  'estado_accion_cobranza_t',
  'estado_acuerdo_t',
  'estado_caso_juridico_t',
  'estado_certificacion_t',
  'estado_costa_t',
  'estado_cuota_acuerdo_t',
  'estado_promesa_t',
  'etapa_cobranza_t',
  'fondo_base_calculo_t',
  'fondo_movimiento_tipo_t',
  'fondo_tipo_t',
  'fuente_financiacion_tipo_t',
  'fundamento_tipo_t',
  'inmueble_estado_t',
  'inmueble_tipo_t',
  'interes_day_count_t',
  'interes_descuento_orden_t',
  'invite_status_t',
  'liquidacion_estado_t',
  'member_status_t',
  'nivel_riesgo_t',
  'novedad_estado_t',
  'novedad_tipo_t',
  'origen_accion_cobranza_t',
  'periodo_estado_t',
  'politica_imputacion_estrategia_t',
  'presupuesto_estado_t',
  'presupuesto_rubro_categoria_t',
  'redondeo_modo_t',
  'residual_metodo_t',
  'resultado_accion_cobranza_t',
  'tenant_role_t',
  'tenant_status_t',
  'tercero_tipo_t',
  'tipo_accion_cobranza_t',
  'tipo_costa_t',
  'tipo_tasa_referencia_t',
  'user_status_t',
  'vigencia_estado_t',
  'zona_comun_tipo_t',
])

function contenidoDeMigraciones(): { archivo: string; contenido: string }[] {
  return readdirSync(DIR_MIGRACIONES)
    .filter((a) => a.endsWith('.sql'))
    .map((archivo) => ({
      archivo,
      contenido: readFileSync(join(DIR_MIGRACIONES, archivo), 'utf-8'),
    }))
}

function enumsDefinidos(
  migraciones: { archivo: string; contenido: string }[],
): Map<string, string> {
  const encontrados = new Map<string, string>()
  for (const { archivo, contenido } of migraciones) {
    for (const m of contenido.matchAll(/create type public\.([a-z_]+_t)\s+as\s+enum/gi)) {
      const nombre = m[1]
      if (nombre) encontrados.set(nombre, archivo)
    }
  }
  return encontrados
}

function enumsConComentario(migraciones: { archivo: string; contenido: string }[]): Set<string> {
  const conComentario = new Set<string>()
  for (const { contenido } of migraciones) {
    for (const m of contenido.matchAll(/comment on type public\.([a-z_]+_t)\s+is/gi)) {
      const nombre = m[1]
      if (nombre) conComentario.add(nombre)
    }
  }
  return conComentario
}

describe('D-24 — enum nuevo requiere COMMENT ON TYPE (o usar lista_tipos)', () => {
  it('todo enum fuera de ENUMS_LEGADO tiene su COMMENT ON TYPE justificándolo', () => {
    const migraciones = contenidoDeMigraciones()
    const definidos = enumsDefinidos(migraciones)
    const comentados = enumsConComentario(migraciones)

    const sinJustificar = [...definidos.entries()].filter(
      ([nombre]) => !ENUMS_LEGADO.has(nombre) && !comentados.has(nombre),
    )

    if (sinJustificar.length > 0) {
      const detalle = sinJustificar
        .map(([nombre, archivo]) => `${nombre} (${archivo})`)
        .join('\n  ')
      throw new Error(
        `Enum(s) nuevo(s) sin COMMENT ON TYPE que justifique por qué no es una familia de ` +
          `lista_tipos (D-24, DECISIONES.md):\n  ${detalle}\n\n` +
          `Agrega, en la misma migración: ` +
          `comment on type public.<nombre> is 'Por qué es enum nativo: ...';\n` +
          `— o, si el vocabulario es puramente descriptivo (no gatilla lógica/transición de ` +
          `estado/invariante), usa una familia de lista_tipos en vez de un enum nuevo.`,
      )
    }
    expect(sinJustificar).toEqual([])
  })
})
