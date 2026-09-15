<script setup lang="ts">
// CO-1 · Configuración contable — clasifica el marco de información financiera (Grupo 2/3, DUR
// 2420 de 2015) y el uso económico de la copropiedad. Ninguna copropiedad se clasifica
// automáticamente (CO-1 §5): esta pantalla es la única forma de hacerlo, y arranca siempre en
// estado "sin clasificar" para un tenant nuevo.
//
// La escritura pasa por copropiedadStore.actualizarTenant (mismo UPDATE directo sobre `tenants`
// que usa /configuracion para nit/contacto/logo) — RLS (tenants_update_agent) ya restringe a
// auxiliar/administrador, y guard_marco_contable_tenant estampa marco_clasificado_por/at y valida
// MARCO_GRUPO_INMUTABLE_CON_CIERRE / MARCO_USO_INCOHERENTE del lado de la base.
import type { Database } from '@aquila/shared'

type MarcoGrupo = Database['public']['Enums']['marco_contable_grupo_t']
type UsoEconomico = Database['public']['Enums']['copropiedad_uso_t']

definePageMeta({ layout: 'default', middleware: ['tenant', 'rbac'], permiso: 'settings:manage' })

const tenantStore = useTenantStore()
const copropiedadStore = useCopropiedadStore()
const contabilidadStore = useContabilidadStore()

const error = ref<string | null>(null)
const aviso = ref<string | null>(null)
const guardando = ref(false)

const OPCIONES_GRUPO: { label: string; value: MarcoGrupo }[] = [
  { label: 'Grupo 3 (NIF para microempresas)', value: 'grupo_3' },
  { label: 'Grupo 2 (NIF Pymes)', value: 'grupo_2' },
]
const OPCIONES_USO: { label: string; value: UsoEconomico }[] = [
  { label: 'Residencial', value: 'residencial' },
  { label: 'Comercial', value: 'comercial' },
  { label: 'Mixto', value: 'mixto' },
]

// Borrador editable separado del valor cargado: solo se escribe al guardar, nunca en cada
// keystroke — mismo criterio que el resto de la ficha de copropiedad.
const form = reactive({
  marcoGrupo: null as MarcoGrupo | null,
  usoEconomico: null as UsoEconomico | null,
  explotaBienesComunes: false,
  responsableIva: false,
  agenteRetencion: false,
  agenteReteiva: false,
  agenteReteica: false,
  ivaPeriodicidadId: null as number | null,
  marcoFundamento: '',
  tieneRevisorFiscal: false,
  icaAplica: false,
  icaMunicipio: '',
  icaTarifaPorMil: null as number | null,
  icaPeriodicidadId: null as number | null,
})

const opcionesPeriodicidadIva = ref<{ label: string; value: number }[]>([])
const opcionesPeriodicidadIca = ref<{ label: string; value: number }[]>([])

function sincronizarFormConTenant(): void {
  const t = copropiedadStore.tenant
  if (!t) return
  form.marcoGrupo = t.marco_grupo
  form.usoEconomico = t.uso_economico
  form.explotaBienesComunes = t.explota_bienes_comunes
  form.responsableIva = t.responsable_iva
  form.agenteRetencion = t.agente_retencion
  form.agenteReteiva = t.agente_reteiva
  form.agenteReteica = t.agente_reteica
  form.ivaPeriodicidadId = t.iva_periodicidad_id
  form.marcoFundamento = t.marco_fundamento ?? ''
  form.tieneRevisorFiscal = t.tiene_revisor_fiscal ?? false
  form.icaAplica = t.ica_aplica
  form.icaMunicipio = t.ica_municipio ?? ''
  form.icaTarifaPorMil = t.ica_tarifa_por_mil
  form.icaPeriodicidadId = t.ica_periodicidad_id
}

// onMounted, no useAsyncData: mutar refs de página (opcionesPeriodicidadIva/Ica, form) dentro del
// handler de useAsyncData se pierde en el cliente en un hard-reload — Nuxt reusa el payload de SSR
// y no vuelve a ejecutar el handler, así que esos efectos secundarios nunca corren en el cliente.
const cargando = ref(false)

async function cargar(): Promise<void> {
  const tenantId = tenantStore.activeTenant?.id
  if (!tenantId) return
  cargando.value = true
  try {
    const [, , periodicidadesIva, periodicidadesIca] = await Promise.all([
      copropiedadStore.cargarTenant(tenantId),
      contabilidadStore.cargarMarcoContable(tenantId),
      cargarListaTipos(tenantId, 'PERIODICIDAD_IVA'),
      cargarListaTipos(tenantId, 'PERIODICIDAD_ICA'),
    ])
    opcionesPeriodicidadIva.value = periodicidadesIva.map((p) => ({ label: p.nombre, value: p.id }))
    opcionesPeriodicidadIca.value = periodicidadesIca.map((p) => ({ label: p.nombre, value: p.id }))
    sincronizarFormConTenant()
  } finally {
    cargando.value = false
  }
}

onMounted(cargar)

const clasificado = computed(() => contabilidadStore.marcoContable?.clasificado ?? false)
const estadosRequeridos = computed(() => contabilidadStore.marcoContable?.estados_requeridos ?? [])

const ETIQUETA_ESTADO: Record<string, string> = {
  estado_situacion_financiera: 'Estado de situación financiera',
  estado_resultados: 'Estado de resultados',
  notas: 'Notas',
  estado_cambios_patrimonio: 'Estado de cambios en el patrimonio',
  estado_flujos_efectivo: 'Estado de flujos de efectivo',
}

// Aviso local (MARCO_USO_INCOHERENTE) — la base es quien realmente lo bloquea; esto solo evita
// un viaje redondo para el caso más común.
const requiereFundamentoPorUso = computed(
  () => form.usoEconomico === 'residencial' && form.explotaBienesComunes,
)

async function guardar(): Promise<void> {
  const tenantId = tenantStore.activeTenant?.id
  if (!tenantId) return
  guardando.value = true
  error.value = null
  aviso.value = null
  try {
    await copropiedadStore.actualizarTenant(tenantId, {
      marco_grupo: form.marcoGrupo,
      uso_economico: form.usoEconomico,
      explota_bienes_comunes: form.explotaBienesComunes,
      responsable_iva: form.responsableIva,
      agente_retencion: form.agenteRetencion,
      agente_reteiva: form.agenteReteiva,
      agente_reteica: form.agenteReteica,
      iva_periodicidad_id: form.responsableIva ? form.ivaPeriodicidadId : null,
      marco_fundamento: form.marcoFundamento.trim() || null,
      tiene_revisor_fiscal: form.usoEconomico === 'residencial' ? form.tieneRevisorFiscal : null,
      ica_aplica: form.icaAplica,
      ica_municipio: form.icaAplica ? form.icaMunicipio.trim() || null : null,
      ica_tarifa_por_mil: form.icaAplica ? form.icaTarifaPorMil : null,
      ica_periodicidad_id: form.icaAplica ? form.icaPeriodicidadId : null,
    })
    await contabilidadStore.cargarMarcoContable(tenantId)
    aviso.value = 'Clasificación guardada.'
  } catch (excepcion) {
    error.value = mensajeError(excepcion, 'No se pudo guardar la clasificación.')
  } finally {
    guardando.value = false
  }
}
</script>

<template>
  <div class="max-w-2xl space-y-6">
    <UiTituloDescripcion>
      <template #titulo>
        <h1 class="text-xl font-semibold">Configuración contable</h1>
      </template>
      <template #descripcion>
        El marco de información financiera y el uso económico determinan qué estados financieros
        emite el sistema (DUR 2420 de 2015) y qué obligaciones fiscales aplican. Ninguna
        copropiedad queda clasificada automáticamente: esta pantalla es la única forma de hacerlo.
      </template>
    </UiTituloDescripcion>

    <ContabilidadBannerSinClasificar :clasificado="clasificado" :mostrar-enlace="false" />

    <UAlert v-if="error" color="error" variant="soft" :title="error" />
    <UAlert v-if="aviso" color="success" variant="soft" :title="aviso" />

    <form class="space-y-5 rounded-md border border-default p-6" @submit.prevent="guardar">
      <div class="grid gap-4 sm:grid-cols-2">
        <UFormField label="Marco de información financiera">
          <USelect
            :model-value="form.marcoGrupo ?? undefined"
            :items="OPCIONES_GRUPO"
            placeholder="Sin clasificar"
            class="w-full"
            @update:model-value="(v) => (form.marcoGrupo = v ?? null)"
          />
        </UFormField>
        <UFormField label="Uso económico">
          <USelect
            :model-value="form.usoEconomico ?? undefined" :items="OPCIONES_USO" placeholder="Sin clasificar"
            class="w-full"
            @update:model-value="(v) => (form.usoEconomico = v ?? null)"
          />
        </UFormField>
      </div>

      <div class="space-y-2">
        <UCheckbox
          v-model="form.explotaBienesComunes"
          label="Explota económicamente bienes comunes (parqueaderos, salones, publicidad)"
        />
        <UCheckbox v-model="form.responsableIva" label="Responsable de IVA" />
        <UCheckbox v-model="form.agenteRetencion" label="Agente de retención en la fuente" />
        <UCheckbox v-model="form.agenteReteiva" label="Agente de retención de IVA (ReteIVA)" />
        <UCheckbox v-model="form.agenteReteica" label="Agente de retención de ICA (ReteICA)" />
        <UCheckbox v-model="form.icaAplica" label="Contribuyente de Industria y Comercio (ICA)" />
      </div>

      <UFormField
        v-if="form.usoEconomico === 'residencial'"
        label="Revisor fiscal"
        description="Ley 675 art. 56 solo lo exige en uso comercial o mixto — para uso residencial es
          decisión propia de la copropiedad, nunca inferida (CO-9 §4.2)."
      >
        <UCheckbox v-model="form.tieneRevisorFiscal" label="Esta copropiedad tiene revisor fiscal" />
      </UFormField>
      <p v-else-if="form.usoEconomico === 'comercial' || form.usoEconomico === 'mixto'" class="text-sm text-muted">
        Revisor fiscal obligatorio por uso {{ form.usoEconomico }} (Ley 675 art. 56) — la rendición
        de cuentas exigirá su dictamen antes de presentarse.
      </p>

      <UFormField
        v-if="form.responsableIva"
        label="Periodicidad de declaración de IVA"
        description="La fija la DIAN según el tamaño del responsable — parametrizable, no un valor por defecto (CO-8 §4.3)."
      >
        <USelect
          :model-value="form.ivaPeriodicidadId ?? undefined" :items="opcionesPeriodicidadIva"
          placeholder="Sin configurar" class="w-full"
          @update:model-value="(v) => (form.ivaPeriodicidadId = (v as number) ?? null)"
        />
      </UFormField>

      <div v-if="form.icaAplica" class="grid gap-4 sm:grid-cols-2 rounded-md border border-default p-4">
        <UFormField label="Municipio" description="Solo informativo — no hay catálogo de municipios en el sistema.">
          <UInput v-model="form.icaMunicipio" class="w-full" />
        </UFormField>
        <UFormField
          label="Tarifa por mil"
          description="La fija el municipio (Ley 14 de 1983 art. 33, rango 2-30 por mil) — parametrizable, nunca fija."
        >
          <UInputNumber v-model="form.icaTarifaPorMil" :min="0" :step="0.1" class="w-full" />
        </UFormField>
        <UFormField label="Periodicidad de declaración de ICA" class="sm:col-span-2">
          <USelect
            :model-value="form.icaPeriodicidadId ?? undefined" :items="opcionesPeriodicidadIca"
            placeholder="Sin configurar" class="w-full"
            @update:model-value="(v) => (form.icaPeriodicidadId = (v as number) ?? null)"
          />
        </UFormField>
      </div>

      <UFormField
        label="Fundamento de la clasificación"
        :description="
          requiereFundamentoPorUso
            ? 'Obligatorio: uso residencial con explotación de bienes comunes exige justificarlo.'
            : 'Nota del contador que soporta la clasificación.'
        "
      >
        <UTextarea v-model="form.marcoFundamento" :rows="3" class="w-full" />
      </UFormField>

      <div v-if="clasificado" class="rounded-md border border-default bg-elevated/50 p-4">
        <p class="text-xs font-medium text-muted uppercase tracking-wide mb-2">
          Estados financieros requeridos
        </p>
        <ul class="text-sm space-y-1">
          <li v-for="e in estadosRequeridos" :key="e">
            {{ ETIQUETA_ESTADO[e] ?? e }}
          </li>
        </ul>
      </div>

      <UButton type="submit" :loading="guardando">Guardar clasificación</UButton>
    </form>
  </div>
</template>
