/**
 * Checklist de configuración inicial — onboarding guiado post-creación
 * (Doc 3 auditoría externa, Top-10 #1). Nada de esto persiste un flag de
 * "onboarding completado": cada paso se deriva de si ya existe el dato
 * real correspondiente (conteo en vivo), así que el checklist nunca queda
 * desincronizado con lo que el tenant realmente tiene, y un tenant viejo
 * que ya tenía todo antes de que existiera este checklist lo ve completo
 * desde el primer render, sin necesitar backfill.
 */
import { defineStore } from 'pinia'
import type { Database } from '@aquila/shared'

export interface PasoOnboarding {
  readonly clave: string
  readonly etiqueta: string
  readonly descripcion: string
  readonly ruta: string
  readonly completado: boolean
}

export const useOnboardingStore = defineStore('onboarding', () => {
  const pasos = shallowRef<PasoOnboarding[]>([])
  const loading = ref(false)
  const cargado = ref(false)

  const completos = computed(() => pasos.value.filter((p) => p.completado).length)
  const todoCompleto = computed(() => cargado.value && pasos.value.every((p) => p.completado))

  async function cargarEstado(tenantId: string): Promise<void> {
    loading.value = true
    try {
      const cliente = useSupabaseClient<Database>()
      const [inmuebles, coeficientes, cuentas, conceptos, presupuestos] = await Promise.all([
        cliente
          .from('inmuebles')
          .select('id', { count: 'exact', head: true })
          .eq('tenant_id', tenantId),
        cliente
          .from('coeficiente_sets')
          .select('id', { count: 'exact', head: true })
          .eq('tenant_id', tenantId)
          .eq('estado', 'vigente'),
        cliente
          .from('cuentas_bancarias')
          .select('id', { count: 'exact', head: true })
          .eq('tenant_id', tenantId),
        cliente
          .from('conceptos')
          .select('id', { count: 'exact', head: true })
          .eq('tenant_id', tenantId)
          .eq('estado', 'activo'),
        cliente
          .from('presupuestos')
          .select('id', { count: 'exact', head: true })
          .eq('tenant_id', tenantId),
      ])
      for (const r of [inmuebles, coeficientes, cuentas, conceptos, presupuestos]) {
        if (r.error) throw r.error
      }

      pasos.value = [
        {
          clave: 'inmuebles',
          etiqueta: 'Registra los inmuebles',
          descripcion: 'Manual uno por uno, o en lote desde una plantilla Excel.',
          ruta: '/inmuebles',
          completado: (inmuebles.count ?? 0) > 0,
        },
        {
          clave: 'coeficientes',
          etiqueta: 'Define los coeficientes',
          descripcion: 'Un set vigente con el coeficiente de cada inmueble activo.',
          ruta: '/coeficientes',
          completado: (coeficientes.count ?? 0) > 0,
        },
        {
          clave: 'cuenta-recaudo',
          etiqueta: 'Registra la cuenta de recaudo',
          descripcion: 'La cuenta bancaria donde los propietarios consignan la administración.',
          ruta: '/configuracion',
          completado: (cuentas.count ?? 0) > 0,
        },
        {
          clave: 'concepto',
          etiqueta: 'Crea el primer concepto de cobro',
          descripcion: 'Por ejemplo, la cuota de administración mensual.',
          ruta: '/conceptos/nuevo',
          completado: (conceptos.count ?? 0) > 0,
        },
        {
          clave: 'presupuesto',
          etiqueta: 'Crea el presupuesto y sus periodos',
          descripcion: 'El año fiscal y los 12 periodos mensuales que se van a liquidar.',
          ruta: '/presupuesto',
          completado: (presupuestos.count ?? 0) > 0,
        },
      ]
      cargado.value = true
    } finally {
      loading.value = false
    }
  }

  return { pasos, loading, cargado, completos, todoCompleto, cargarEstado }
})
