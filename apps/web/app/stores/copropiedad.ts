/**
 * Ficha de la copropiedad — edición del tenant mismo (Datos básicos +
 * Configuración) y sus cuentas bancarias. PROMPT_FICHA_COPROPIEDAD.md §6.3.
 *
 * Deliberadamente separado de tenant.ts: ese store resuelve
 * membresía/tenant activo para el flujo de auth, no es dueño de la edición
 * de la ficha — mismo criterio de separación que inmuebles.ts vs.
 * cuentaCorriente.ts (comparten la palabra "inmueble", no la
 * responsabilidad).
 *
 * `nit_digito_verificacion` es columna generada (fn_calcular_dv_nit) —
 * nunca se envía en el update, se relee después de guardar.
 * `marcarCuentaRecaudo` pasa por el RPC `fn_marcar_cuenta_recaudo` (swap
 * atómico), nunca un UPDATE directo sobre `es_recaudo` — mismo criterio
 * que `fn_marcar_pagador`.
 *
 * Personas vinculadas de la copropiedad NO vive aquí — usa
 * useTercerosStore().cargarPersonasTenant/asociarTerceroTenant/
 * finalizarRelacionTenant (PROMPT_FICHA_COPROPIEDAD.md §6.3).
 *
 * `subirLogo` sube directo al bucket público `logo-copropiedad` por RLS de
 * storage.objects (agent) — sin Edge Function, a diferencia de
 * subir-documento: el logo no tiene versionado ni tabla de metadata que
 * coordinar, y el bucket es público a propósito (no es información
 * sensible, evita signed URLs para algo que se pinta en cada carga de
 * página).
 */
import { defineStore } from 'pinia'
import type { Database } from '@aquila/shared'

type TenantRow = Database['public']['Tables']['tenants']['Row']
type CuentaBancariaRow = Database['public']['Tables']['cuentas_bancarias']['Row']
type ListaTipoRow = Database['public']['Tables']['lista_tipos']['Row']
type CuentaBancariaTipo = Database['public']['Enums']['cuenta_bancaria_tipo_t']

export interface ActualizarTenantParams {
  name?: string
  nit?: string
  direccion?: string | null
  ciudad?: string | null
  telefono_1?: string | null
  telefono_2?: string | null
  email?: string | null
  contacto_nombre?: string | null
  contacto_telefono?: string | null
  contacto_email?: string | null
  tipo_division_id?: number
  moneda?: string
  zona_horaria?: string
  dia_facturacion?: number | null
  canal_notificacion?: string | null
  // CO-1: marco contable y tributario. marco_clasificado_por/at los estampa
  // guard_marco_contable_tenant automáticamente — nunca se envían desde aquí.
  marco_grupo?: Database['public']['Enums']['marco_contable_grupo_t'] | null
  uso_economico?: Database['public']['Enums']['copropiedad_uso_t'] | null
  explota_bienes_comunes?: boolean
  responsable_iva?: boolean
  agente_retencion?: boolean
  // CO-8 §4.3: periodicidad de declaración de IVA — solo tiene sentido con responsable_iva=true.
  iva_periodicidad_id?: number | null
  marco_fundamento?: string | null
  // CO-9 §4.2: solo aplica al caso residencial — comercial/mixto ya lo exige Ley 675 art. 56.
  tiene_revisor_fiscal?: boolean | null
  // Gap ReteIVA/ReteICA (2026-09-14): agentes de retención distintos de agente_retencion
  // (renta) — cada uno habilita su propia pestaña en /contabilidad/tributario.
  agente_reteiva?: boolean
  agente_reteica?: boolean
  // Gap ICA (2026-09-14): la propia copropiedad como contribuyente de Industria y Comercio
  // (distinto de agente_reteica, que es retenerlo a terceros).
  ica_aplica?: boolean
  ica_municipio?: string | null
  ica_tarifa_por_mil?: number | null
  ica_periodicidad_id?: number | null
}

export const useCopropiedadStore = defineStore('copropiedad', () => {
  const tenant = shallowRef<TenantRow | null>(null)
  const cuentasBancarias = shallowRef<CuentaBancariaRow[]>([])
  const tiposDivision = shallowRef<ListaTipoRow[]>([])
  const entidadesFinancieras = shallowRef<ListaTipoRow[]>([])
  const loading = ref(false)

  async function cargarTenant(tenantId: string): Promise<TenantRow> {
    loading.value = true
    try {
      const cliente = useSupabaseClient<Database>()
      const { data, error: errorTenant } = await cliente
        .from('tenants')
        .select('*')
        .eq('id', tenantId)
        .single()
      if (errorTenant) throw errorTenant
      tenant.value = data
      return data
    } finally {
      loading.value = false
    }
  }

  /** No envía nit_digito_verificacion — es columna generada, Postgres la calcula sola. */
  async function actualizarTenant(
    tenantId: string,
    cambios: ActualizarTenantParams,
  ): Promise<TenantRow> {
    const cliente = useSupabaseClient<Database>()
    const { data, error: errorUpdate } = await cliente
      .from('tenants')
      .update(cambios)
      .eq('id', tenantId)
      .select('*')
      .single()
    if (errorUpdate) throw errorUpdate
    tenant.value = data
    return data
  }

  /** Sube directo por RLS de storage.objects (agent) — sin Edge Function, el
   * logo no tiene versionado ni metadata que coordinar (a diferencia de
   * subir-documento). Ruta fija `{tenantId}/logo` (sin extensión, upsert) para
   * que un re-upload sobreescriba siempre el mismo objeto — nunca deja logos
   * viejos huérfanos en el bucket. */
  async function subirLogo(tenantId: string, archivo: File): Promise<TenantRow> {
    const cliente = useSupabaseClient<Database>()
    const path = `${tenantId}/logo`
    const { error: errorUpload } = await cliente.storage
      .from('logo-copropiedad')
      .upload(path, archivo, { upsert: true, contentType: archivo.type })
    if (errorUpload) throw errorUpload

    const { data, error: errorUpdate } = await cliente
      .from('tenants')
      .update({ logo_path: path })
      .eq('id', tenantId)
      .select('*')
      .single()
    if (errorUpdate) throw errorUpdate
    tenant.value = data
    return data
  }

  async function cargarTiposDivision(tenantId: string): Promise<ListaTipoRow[]> {
    const cliente = useSupabaseClient<Database>()
    const { data, error: errorTipos } = await cliente
      .from('lista_tipos')
      .select('*')
      .eq('tipo', 'TIPO_DIVISION_PH')
      .or(`tenant_id.is.null,tenant_id.eq.${tenantId}`)
      .order('orden')
    if (errorTipos) throw errorTipos
    tiposDivision.value = data ?? []
    return tiposDivision.value
  }

  async function cargarEntidadesFinancieras(tenantId: string): Promise<ListaTipoRow[]> {
    const cliente = useSupabaseClient<Database>()
    const { data, error: errorTipos } = await cliente
      .from('lista_tipos')
      .select('*')
      .eq('tipo', 'ENTIDAD_FINANCIERA')
      .or(`tenant_id.is.null,tenant_id.eq.${tenantId}`)
      .order('orden')
    if (errorTipos) throw errorTipos
    entidadesFinancieras.value = data ?? []
    return entidadesFinancieras.value
  }

  async function cargarCuentasBancarias(tenantId: string): Promise<CuentaBancariaRow[]> {
    loading.value = true
    try {
      const cliente = useSupabaseClient<Database>()
      const { data, error: errorCuentas } = await cliente
        .from('cuentas_bancarias')
        .select('*')
        .eq('tenant_id', tenantId)
        .eq('activa', true)
        .order('created_at')
      if (errorCuentas) throw errorCuentas
      cuentasBancarias.value = data ?? []
      return cuentasBancarias.value
    } finally {
      loading.value = false
    }
  }

  async function crearCuentaBancaria(params: {
    tenantId: string
    entidadFinancieraId: number
    tipoCuenta: CuentaBancariaTipo
    numeroCuenta: string
    titular?: string
  }): Promise<CuentaBancariaRow> {
    const cliente = useSupabaseClient<Database>()
    const { data, error: errorInsert } = await cliente
      .from('cuentas_bancarias')
      .insert({
        tenant_id: params.tenantId,
        entidad_financiera_id: params.entidadFinancieraId,
        tipo_cuenta: params.tipoCuenta,
        numero_cuenta: params.numeroCuenta,
        titular: params.titular ?? null,
      })
      .select('*')
      .single()
    if (errorInsert) throw errorInsert

    await cargarCuentasBancarias(params.tenantId)
    return data
  }

  /** Único punto autorizado para cambiar la cuenta de recaudo — nunca un update
   * directo de es_recaudo (mismo criterio que marcarPagador). */
  async function marcarCuentaRecaudo(cuentaId: string, tenantId: string): Promise<void> {
    const cliente = useSupabaseClient<Database>()
    const { error: errorRpc } = await cliente.rpc('fn_marcar_cuenta_recaudo', {
      p_cuenta_id: cuentaId,
      p_tenant_id: tenantId,
    })
    if (errorRpc) throw errorRpc

    await cargarCuentasBancarias(tenantId)
  }

  function limpiar(): void {
    tenant.value = null
    cuentasBancarias.value = []
    tiposDivision.value = []
    entidadesFinancieras.value = []
  }

  return {
    tenant,
    cuentasBancarias,
    tiposDivision,
    entidadesFinancieras,
    loading,
    cargarTenant,
    actualizarTenant,
    subirLogo,
    cargarTiposDivision,
    cargarEntidadesFinancieras,
    cargarCuentasBancarias,
    crearCuentaBancaria,
    marcarCuentaRecaudo,
    limpiar,
  }
})
