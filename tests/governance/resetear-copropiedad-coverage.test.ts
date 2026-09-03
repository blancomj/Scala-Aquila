/**
 * D-39 — trinquete de gobernanza para fn_resetear_copropiedad(): toda tabla
 * de `public` con columna `tenant_id` tiene que estar clasificada, a mano,
 * en exactamente una de tres categorías. Sin este test, un módulo nuevo
 * (una tabla `tenant_id` que nadie clasificó) simplemente sobrevive al
 * reset en silencio — el mismo tipo de deriva que dejó a CUOTA_ADMIN
 * archivado en gc-001 sin que ningún test lo notara (paso0/INFORME_PASO_0.md).
 *
 * Mismo criterio que D-38 (tests/governance/design-system-coverage.test.ts):
 * las listas de abajo son `Record<string, string>`, no `Set` — el motivo de
 * cada clasificación es parte del contrato, no un comentario suelto. Este
 * test falla en ambas direcciones: una tabla del esquema real que no está en
 * ninguna lista (módulo nuevo sin clasificar), y una entrada de las listas
 * que ya no existe en el esquema (nombre viejo tras un rename/drop) — un
 * permiso muerto es tan silencioso como uno faltante.
 *
 * TABLAS_OPERATIVAS no se duplica a mano aquí: se lee del cuerpo real de
 * fn_resetear_copropiedad() vía pg_get_functiondef, la misma fuente que
 * ejecuta el reset — si alguien edita esa función sin tocar este test, el
 * test sigue viendo la lista vigente, no una copia congelada.
 */
import { describe, expect, it } from 'vitest'
import 'dotenv/config'
import { Client } from 'pg'

const dbUrl = process.env.SUPABASE_DB_URL
const d = dbUrl ? describe : describe.skip

if (!dbUrl) {
  console.warn(
    'SALTADO tests/governance/resetear-copropiedad-coverage: falta SUPABASE_DB_URL en .env',
  )
}

// Nunca tocadas por el reset — protección absoluta, ni configuración ni dato
// operativo: son registros que deben sobrevivir incluso al borrado total del
// tenant (D-39).
const TABLAS_PROTEGIDAS: Record<string, string> = {
  audit_log: 'trazabilidad — sobrevive incluso al borrado completo del tenant (ON DELETE SET NULL)',
  recibos_caja: 'comprobante fiscal — forbid_mutation() sin excepción, ni tenant borrado lo permite',
}

// Configuración ya hecha por el usuario + usuarios de la copropiedad — el
// reset las preserva explícitamente (D-39, "conservar la estructura ya
// configurada pero sin movimientos").
const TABLAS_PRESERVADAS: Record<string, string> = {
  conceptos: 'plantilla de creación (fn_instanciar_conceptos) — configuración editable',
  concepto_versiones: 'historial de la configuración de conceptos',
  contable_cuenta: 'plantilla de creación (fn_instanciar_plan_contable)',
  contable_cuenta_default: 'plantilla de creación (fn_instanciar_cuentas_default)',
  presupuesto_cuenta: 'plantilla de creación (fn_instanciar_presupuesto_cuenta)',
  memberships: 'usuarios de la copropiedad',
  invitations: 'invitaciones pendientes de la copropiedad',
  agrupaciones: 'configuración estructural de inmuebles',
  zonas_comunes: 'configuración estructural',
  consecutivos_documento: 'configuración de numeración de documentos',
  plantillas_email_versiones: 'configuración de comunicaciones',
  email_templates: 'configuración de comunicaciones',
  plantillas_sms: 'configuración de comunicaciones',
  plantillas_sms_versiones: 'configuración de comunicaciones',
  plantillas_compositor: 'configuración de comunicaciones',
  pasarela_config: 'configuración de pasarela de pago',
  pasarela_config_metodo: 'configuración de pasarela de pago',
  pasarela_credencial: 'configuración de pasarela de pago',
  lista_tipos: 'catálogo — fila de plataforma si tenant_id es null; las propias del tenant son ' +
    'extensiones de catálogo configuradas, mismo criterio que lista_tipos_ocultos',
  lista_tipos_ocultos: 'configuración de catálogos (qué se oculta por tenant)',
  politicas_financieras: 'política configurada (redondeo, residual)',
  politicas_clasificacion_cartera: 'política de cartera configurada',
  politica_clasificacion_tramos: 'política de cartera configurada',
  estrategias_cobranza: 'estrategia de cobranza configurada',
  cuentas_bancarias: 'configuración de cuentas de recaudo',
  fondos: 'configuración del fondo — saldo_actual se resetea a 0 aparte (fondo_movimientos sí se borra)',
  fuente_financiacion: 'catálogo de fuentes de financiación configurado',
  novedad_tipo_cuenta: 'configuración — mapeo tipo de novedad → cuenta',
}

interface FilaColumna {
  table_name: string
}

function extraerTablasDeFuncion(definicion: string): string[] {
  // El cuerpo declara: v_tablas text[] := array[ 'a', 'b', ... ];
  // Se toma el PRIMER array literal del cuerpo — fn_resetear_copropiedad
  // solo declara uno.
  const match = /v_tablas\s+text\[\]\s*:=\s*array\[([\s\S]*?)\]/.exec(definicion)
  if (!match) {
    throw new Error('No se encontró "v_tablas text[] := array[...]" en fn_resetear_copropiedad')
  }
  return [...(match[1] ?? '').matchAll(/'([a-z_]+)'/g)].map((m) => m[1] as string)
}

d('D-39: cobertura de fn_resetear_copropiedad sobre tablas tenant_id', () => {
  it('toda tabla con tenant_id está protegida, preservada, u operativa — nunca sin clasificar', async () => {
    const client = new Client({ connectionString: dbUrl })
    await client.connect()
    try {
      const { rows } = await client.query<FilaColumna>(`
        select c.relname as table_name
        from pg_attribute a
        join pg_class c on c.oid = a.attrelid
        join pg_namespace n on n.oid = c.relnamespace
        where n.nspname = 'public'
          and c.relkind = 'r'
          and a.attname = 'tenant_id'
          and a.attnum > 0
          and not a.attisdropped
        order by c.relname
      `)
      const tablasReales = new Set(rows.map((r) => r.table_name))
      expect(tablasReales.size).toBeGreaterThan(50)

      const { rows: filaFuncion } = await client.query<{ definicion: string }>(
        `select pg_get_functiondef('public.fn_resetear_copropiedad(uuid)'::regprocedure) as definicion`,
      )
      const tablasOperativas = extraerTablasDeFuncion(filaFuncion[0]?.definicion ?? '')
      expect(tablasOperativas.length).toBeGreaterThan(0)
      expect(new Set(tablasOperativas).size, 'fn_resetear_copropiedad tiene tablas duplicadas en v_tablas').toBe(
        tablasOperativas.length,
      )

      const protegidas = Object.keys(TABLAS_PROTEGIDAS)
      const preservadas = Object.keys(TABLAS_PRESERVADAS)

      // Ninguna tabla clasificada en más de una categoría.
      const solapadas = [
        ...protegidas.filter((t) => preservadas.includes(t) || tablasOperativas.includes(t)),
        ...preservadas.filter((t) => tablasOperativas.includes(t)),
      ]
      expect(solapadas, `clasificadas en más de una categoría: ${solapadas.join(', ')}`).toHaveLength(0)

      const clasificadas = new Set([...protegidas, ...preservadas, ...tablasOperativas])

      // Toda tabla real está clasificada — un módulo nuevo sin clasificar
      // rompe aquí, no en producción meses después.
      const sinClasificar = [...tablasReales].filter((t) => !clasificadas.has(t))
      expect(
        sinClasificar,
        `tabla(s) con tenant_id sin clasificar en TABLAS_PROTEGIDAS/TABLAS_PRESERVADAS/` +
          `fn_resetear_copropiedad: ${sinClasificar.join(', ')}`,
      ).toHaveLength(0)

      // Ninguna entrada apunta a una tabla que ya no existe — un permiso
      // muerto (D-38) es tan silencioso como uno faltante.
      const muertas = [...clasificadas].filter((t) => !tablasReales.has(t))
      expect(muertas, `clasificada(s) pero la tabla ya no existe: ${muertas.join(', ')}`).toHaveLength(0)
    } finally {
      await client.end()
    }
  }, 30_000)
})
