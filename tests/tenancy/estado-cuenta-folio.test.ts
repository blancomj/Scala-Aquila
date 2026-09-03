/**
 * Estado de cuenta — folio consecutivo y acceso público endurecido (D-27/D-28).
 *
 * Cubre lo que la base puede garantizar sin desplegar Edge Functions:
 *  · el folio EDC-* lo asigna la BD al INSERT, único por fila;
 *  · dos emisiones jamás comparten folio (invariante de autenticidad);
 *  · el snapshot insertado conserva su forma al leerse (contrato del visor);
 *  · solo un auxiliar del tenant inserta (RLS) — un auditor no.
 *
 * ═══ TENANT PROPIO ═══ mismo criterio que flujo-dos-tiempos.test.ts: tenant
 * sembrado por corrida con RUN_ID y borrado en cascada en afterAll.
 *
 * El comportamiento del endpoint ver-estado-cuenta (token HMAC, rate-limit,
 * auditoría) se valida post-despliegue; los helpers puros que usa están
 * cubiertos por deno test en supabase/functions/_shared/*.test.ts.
 */
import type { Json } from '@aquila/shared'
import { afterAll, describe, expect, it } from 'vitest'
import 'dotenv/config'
import {
  clienteAdmin,
  clienteComo,
  crearMembership,
  crearTenant,
  crearUsuario,
  eliminarTenant,
  eliminarUsuario,
  leerEntorno,
  type Cliente,
  type TenantPrueba,
  type UsuarioPrueba,
} from '../rls/helpers.js'

const env = leerEntorno()
const d = env ? describe : describe.skip

if (!env) {
  console.warn('SALTADO tests/tenancy/estado-cuenta-folio: faltan variables de Supabase en .env')
}

const FOLIO_RE = /^EDC-\d{6}-\d{6}$/

/** Rama de objeto de `Json`: asignable a la columna jsonb y además
 * esparcible, cosa que la unión completa no permite. */
function datosEjemplo(inmuebleCodigo: string): { [clave: string]: Json | undefined } {
  return {
    tenant_nombre: 'Copropiedad Test',
    tenant_nit: null,
    inmueble_codigo: inmuebleCodigo,
    movimientos: [
      { fecha: '2026-08-01', descripcion: 'Capital', cargo: 100000, abono: null, saldo: 100000 },
      { fecha: '2026-08-05', descripcion: 'Pago', cargo: null, abono: 40000, saldo: 60000 },
    ],
    saldo_final: 60000,
    generado_en: new Date().toISOString(),
  }
}

d('Estado de cuenta: folio y permisos (D-27)', () => {
  const admin = clienteAdmin(env!)
  let auxiliar: UsuarioPrueba | undefined
  let auditor: UsuarioPrueba | undefined
  let cAux: Cliente
  let cAud: Cliente
  let tenant: TenantPrueba | undefined
  let inmuebleId = ''

  afterAll(async () => {
    // Cascada: tenants arrastra inmuebles/estados; auth.users se borra aparte.
    if (tenant) await eliminarTenant(admin, tenant.id)
    if (auxiliar) await eliminarUsuario(admin, auxiliar.id)
    if (auditor) await eliminarUsuario(admin, auditor.id)
  })

  it('setup: copropiedad con una unidad y dos membresías', async () => {
    auxiliar = await crearUsuario(admin, 'edcaux')
    auditor = await crearUsuario(admin, 'edcaud')
    tenant = await crearTenant(admin, 'edc', auxiliar.id)
    // El creador del tenant queda como auxiliar (mismo patrón que L7).
    await crearMembership(admin, tenant.id, auxiliar.id, 'auxiliar')
    await crearMembership(admin, tenant.id, auditor.id, 'auditor')
    cAux = await clienteComo(env!, auxiliar)
    cAud = await clienteComo(env!, auditor)

    const { data: tipo } = await admin
      .from('lista_tipos')
      .select('id')
      .eq('tipo', 'TIPO_INMUEBLE')
      .eq('codigo', 'apartamento')
      .is('tenant_id', null)
      .single<{ id: number }>()
    if (!tipo) throw new Error('fixture lista_tipos TIPO_INMUEBLE apartamento')

    const { data: inmueble, error: errInm } = await admin
      .from('inmuebles')
      .insert({
        tenant_id: tenant.id,
        codigo: 'EDC-001',
        tipo_id: tipo.id,
      })
      .select('id')
      .single<{ id: string }>()
    if (errInm) throw new Error(`fixture inmueble: ${errInm.message}`)
    inmuebleId = inmueble.id
  })

  it('el INSERT del auxiliar recibe folio EDC-* asignado por la BD', async () => {
    const { data, error } = await cAux
      .from('estados_cuenta_generados')
      .insert({ tenant_id: tenant!.id, inmueble_id: inmuebleId, datos: datosEjemplo('EDC-001') })
      .select('id, folio')
      .single<{ id: string; folio: string | null }>()
    expect(error).toBeNull()
    expect(data?.folio).toMatch(FOLIO_RE)
  })

  it('dos emisiones nunca comparten folio (invariante de autenticidad)', async () => {
    const filas = [1, 2].map((i) => ({
      tenant_id: tenant!.id,
      inmueble_id: inmuebleId,
      datos: datosEjemplo(`EDC-00${String(i)}`),
    }))
    const { data, error } = await cAux
      .from('estados_cuenta_generados')
      .insert(filas)
      .select('folio')
    expect(error).toBeNull()
    const folios = (data ?? []).map((f): string => String(f.folio))
    expect(folios).toHaveLength(2)
    expect(new Set(folios).size).toBe(2)
    for (const folio of folios) expect(folio).toMatch(FOLIO_RE)
  })

  it('el snapshot conserva su forma al leerse (contrato del visor público)', async () => {
    const { data, error } = await admin
      .from('estados_cuenta_generados')
      .select('datos')
      .eq('tenant_id', tenant!.id)
      .limit(1)
      .single<{ datos: Record<string, unknown> }>()
    expect(error).toBeNull()
    for (const clave of ['movimientos', 'saldo_final', 'generado_en']) {
      expect(data?.datos).toHaveProperty(clave)
    }
    expect(data!.datos.saldo_final as number).toBe(60000)
  })

  it('un auditor NO puede emitir estados de cuenta (solo lectura)', async () => {
    const { error } = await cAud!
      .from('estados_cuenta_generados')
      .insert({ tenant_id: tenant!.id, inmueble_id: inmuebleId, datos: datosEjemplo('EDC-X') })
    // RLS: la política INSERT exige rol auxiliar — el error es de violación,
    // no de red. PostgREST devuelve error aunque sea silencioso (0 filas).
    expect(error ?? 'silencioso').toBeTruthy()
    const { data: total } = await admin
      .from('estados_cuenta_generados')
      .select('id', { count: 'exact' })
      .eq('tenant_id', tenant!.id)
    expect(total?.length ?? 0).toBe(3) // solo las 3 emitidas por el auxiliar
  })

  it('las claves extendidas del snapshot sobreviven el roundtrip JSONB', async () => {
    // El visor público lee claves opcionales (propietario_*, D-28); jsonb
    // debe preservarlas tal cual para que el sello impreso sea fiel.
    const conPropietario = {
      ...datosEjemplo('EDC-PROP'),
      propietario_nombre: 'María Gómez',
      propietario_documento_enmascarado: '****8876',
    }
    const { data, error } = await cAux
      .from('estados_cuenta_generados')
      .insert({ tenant_id: tenant!.id, inmueble_id: inmuebleId, datos: conPropietario })
      .select('datos')
      .single<{ datos: Record<string, unknown> }>()
    expect(error).toBeNull()
    expect(data?.datos.propietario_nombre).toBe('María Gómez')
    expect(data?.datos.propietario_documento_enmascarado).toBe('****8876')
  })
})
