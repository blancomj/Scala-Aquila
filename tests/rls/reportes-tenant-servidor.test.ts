/**
 * RPT-05 — el compilador filtra por copropiedad incluso cuando quien
 * ejecuta atraviesa la RLS (migración 20260941000000).
 *
 * POR QUÉ EXISTE ESTE ARCHIVO
 * RPT-01 apoyó toda la separación entre copropiedades en la RLS de las
 * vistas `vr_*` (security_invoker). Correcto mientras el ejecutor sea un
 * usuario con sesión; **falso en cuanto ejecuta el servidor**, porque la
 * entrega programada de RPT-05 corre con `service_role` y `service_role`
 * tiene BYPASSRLS. Sin el filtro que añade el compilador, el primer reporte
 * programado habría salido por correo con los datos de todas las
 * copropiedades del proyecto.
 *
 * Las demás pruebas del módulo corren como usuario, así que **ninguna podía
 * detectar esto**: la RLS las protege a todas. Esta usa el cliente de
 * servicio a propósito, que es el único ángulo desde el que se ve.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import {
  clienteAdmin,
  crearTenant,
  eliminarTenant,
  leerEntorno,
  type Cliente,
  type TenantPrueba,
} from './helpers.js'

const env = leerEntorno()
const d = env ? describe : describe.skip

if (!env) {
  console.warn('SALTADO tests/rls/reportes-tenant-servidor: faltan variables de Supabase en .env')
}

interface Resultado {
  filas: Record<string, unknown>[]
  total_filas: number
}

async function listaTipoId(admin: Cliente, tipo: string, codigo: string): Promise<number> {
  const { data, error } = await admin
    .from('lista_tipos')
    .select('id')
    .eq('tipo', tipo)
    .eq('codigo', codigo)
    .is('tenant_id', null)
    .single<{ id: number }>()
  if (error) throw new Error(`fixture lista_tipos ${tipo}.${codigo}: ${error.message}`)
  return data.id
}

async function crearInmueble(admin: Cliente, tenantId: string, prefijo: string): Promise<string> {
  const tipoInmuebleId = await listaTipoId(admin, 'TIPO_INMUEBLE', 'apartamento')
  const { data, error } = await admin
    .from('inmuebles')
    .insert({ tenant_id: tenantId, codigo: `${prefijo}-${String(Date.now())}`, tipo_id: tipoInmuebleId })
    .select('id')
    .single<{ id: string }>()
  if (error) throw new Error(`fixture inmueble: ${error.message}`)
  return data.id
}

const DEFINICION = {
  fuente: 'recaudos',
  campos: [{ campo: 'referencia' }, { campo: 'monto' }],
}

d('RPT-05 · aislamiento con service_role', () => {
  let admin: Cliente
  let tenantUno: TenantPrueba
  let tenantDos: TenantPrueba
  let referenciaUno: string
  let referenciaDos: string

  beforeAll(async () => {
    admin = clienteAdmin(env!)
    tenantUno = await crearTenant(admin, 'rpt5-uno')
    tenantDos = await crearTenant(admin, 'rpt5-dos')
    referenciaUno = `RPT5-UNO-${String(Date.now())}`
    referenciaDos = `RPT5-DOS-${String(Date.now())}`

    const formaPagoId = await listaTipoId(admin, 'FORMA_PAGO', 'efectivo')
    for (const [tenant, referencia, monto] of [
      [tenantUno, referenciaUno, 111000],
      [tenantDos, referenciaDos, 222000],
    ] as const) {
      const inmuebleId = await crearInmueble(admin, tenant.id, 'rpt5')
      const { error } = await admin.from('pagos').insert({
        tenant_id: tenant.id,
        inmueble_id: inmuebleId,
        fecha_pago: '2026-09-01',
        monto,
        forma_pago_id: formaPagoId,
        referencia,
      })
      if (error) throw new Error(`fixture pago: ${error.message}`)
    }
  }, 90_000)

  afterAll(async () => {
    if (!env) return
    await eliminarTenant(admin, tenantUno.id)
    await eliminarTenant(admin, tenantDos.id)
  }, 90_000)

  it('service_role SÍ ve las dos copropiedades en la vista: la RLS no lo frena', async () => {
    // Control positivo. Si esto dejara de ser cierto, el resto del archivo
    // pasaría por el motivo equivocado.
    const { data, error } = await admin
      .from('vr_recaudos')
      .select('tenant_id')
      .in('referencia', [referenciaUno, referenciaDos])

    expect(error).toBeNull()
    const tenants = new Set((data ?? []).map((f) => (f as { tenant_id: string }).tenant_id))
    expect(tenants.size).toBe(2)
  })

  it('pero el compilador solo devuelve la copropiedad que se le pide', async () => {
    const { data, error } = await admin.rpc('fn_reporte_ejecutar', {
      p_definicion: {
        ...DEFINICION,
        filtros: [
          { campo: 'referencia', operador: 'en', valor: [referenciaUno, referenciaDos] },
        ],
      } as never,
      p_tenant_id: tenantUno.id,
      p_limite: 100,
    })

    expect(error).toBeNull()
    const resultado = data as unknown as Resultado
    // La fila de la otra copropiedad NO sale, aunque el filtro la pedía y
    // aunque quien ejecuta puede verla en la vista.
    expect(resultado.total_filas).toBe(1)
    expect(resultado.filas[0]!.referencia).toBe(referenciaUno)
  })

  it('y la otra copropiedad devuelve la suya, no las dos', async () => {
    const { data, error } = await admin.rpc('fn_reporte_ejecutar', {
      p_definicion: {
        ...DEFINICION,
        filtros: [
          { campo: 'referencia', operador: 'en', valor: [referenciaUno, referenciaDos] },
        ],
      } as never,
      p_tenant_id: tenantDos.id,
      p_limite: 100,
    })

    expect(error).toBeNull()
    const resultado = data as unknown as Resultado
    expect(resultado.total_filas).toBe(1)
    expect(resultado.filas[0]!.referencia).toBe(referenciaDos)
  })

  it('sin tenant no se puede ejecutar: el argumento es obligatorio', async () => {
    // Sin p_tenant_id no existe ninguna sobrecarga que atender — la firma
    // vieja de dos argumentos se borró en la migración a propósito, para que
    // nadie pueda ejecutar sin decir de qué copropiedad.
    const { error } = await admin.rpc('fn_reporte_ejecutar', {
      p_definicion: DEFINICION as never,
      p_limite: 100,
    } as never)
    expect(error).not.toBeNull()
  })
})
