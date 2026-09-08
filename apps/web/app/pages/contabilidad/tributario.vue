<script setup lang="ts">
// CO-8 · Obligaciones tributarias — nada se activa por defecto (spec §2 regla 2): una
// copropiedad no responsable de IVA ni agente de retención ve una sola pantalla explicando por
// qué (spec §4.5). Segregación tributaria (§4.1) y exógena (§4.4) solo tienen sentido si alguna
// obligación aplica, así que comparten el mismo gate.
import type { Database } from '@aquila/shared'

definePageMeta({ layout: 'default', middleware: ['tenant', 'rbac'], permiso: 'data:read' })

type OpcionTipo = { id: number; codigo: string; nombre: string }
type TerceroOpcion = { id: string; etiqueta: string }

const tenantStore = useTenantStore()
const copropiedadStore = useCopropiedadStore()
const tributarioStore = useTributarioStore()

const error = ref<string | null>(null)
const pestana = ref<'segregacion' | 'retencion' | 'iva' | 'exogena'>('segregacion')
const naturalezasTributarias = ref<OpcionTipo[]>([])
const terceros = ref<TerceroOpcion[]>([])

const tenant = computed(() => copropiedadStore.tenant)
const aplica = computed(() => !!tenant.value && (tenant.value.responsable_iva || tenant.value.agente_retencion))

async function cargar(): Promise<void> {
  const tenantId = tenantStore.activeTenant?.id
  if (!tenantId) return
  error.value = null
  try {
    await copropiedadStore.cargarTenant(tenantId)
    if (!aplica.value) return
    const cliente = useSupabaseClient<Database>()
    const [naturalezas, { data: tercerosFilas }] = await Promise.all([
      cargarListaTipos(tenantId, 'NATURALEZA_TRIBUTARIA_CUENTA'),
      cliente.from('terceros').select('id, primer_nombre, primer_apellido').eq('tenant_id', tenantId).order('primer_nombre'),
      tributarioStore.cargarCuentasClasificables(tenantId),
      tenant.value!.agente_retencion ? tributarioStore.cargarConceptosRetencion(tenantId) : Promise.resolve(),
    ])
    naturalezasTributarias.value = naturalezas.map((n) => ({ id: n.id, codigo: n.codigo, nombre: n.nombre }))
    terceros.value = (tercerosFilas ?? []).map((t) => ({ id: t.id, etiqueta: `${t.primer_nombre ?? ''} ${t.primer_apellido ?? ''}`.trim() }))
  } catch (excepcion) {
    error.value = mensajeError(excepcion, 'No se pudo cargar la información tributaria.')
  }
}
onMounted(cargar)

// ── segregación tributaria (§4.1) ────────────────────────────────────────
async function clasificar(cuentaId: string, naturalezaId: number | null): Promise<void> {
  error.value = null
  try {
    await tributarioStore.clasificarCuenta(cuentaId, naturalezaId)
  } catch (excepcion) {
    error.value = mensajeError(excepcion, 'No se pudo clasificar la cuenta.')
  }
}

const anioActual = new Date().getFullYear()
const ingresosDesde = ref(`${String(anioActual)}-01-01`)
const ingresosHasta = ref(`${String(anioActual)}-12-31`)
async function consultarIngresos(): Promise<void> {
  const tenantId = tenantStore.activeTenant?.id
  if (!tenantId) return
  if (ingresosDesde.value > ingresosHasta.value) {
    error.value = 'La fecha "Desde" no puede ser posterior a "Hasta".'
    return
  }
  error.value = null
  try {
    await tributarioStore.cargarIngresosPorNaturaleza(tenantId, ingresosDesde.value, ingresosHasta.value)
  } catch (excepcion) {
    error.value = mensajeError(excepcion, 'No se pudo calcular el resumen de ingresos.')
  }
}

// ── retención en la fuente (§4.2) ────────────────────────────────────────
const formConcepto = reactive({ codigo: '', nombre: '', tarifa: null as number | null, baseMinimaUvt: null as number | null, cuentaContableId: null as string | null })
const cuentasRetencion = computed(() => tributarioStore.cuentasClasificables.filter((c) => c.codigo.startsWith('23')))
async function guardarConcepto(): Promise<void> {
  const tenantId = tenantStore.activeTenant?.id
  if (!tenantId || !formConcepto.codigo.trim() || !formConcepto.tarifa || !formConcepto.cuentaContableId) return
  error.value = null
  try {
    await tributarioStore.crearConceptoRetencion({
      tenantId, codigo: formConcepto.codigo.trim(), nombre: formConcepto.nombre.trim() || formConcepto.codigo.trim(),
      tarifa: formConcepto.tarifa, baseMinimaUvt: formConcepto.baseMinimaUvt, cuentaContableId: formConcepto.cuentaContableId,
    })
    formConcepto.codigo = ''; formConcepto.nombre = ''; formConcepto.tarifa = null; formConcepto.baseMinimaUvt = null; formConcepto.cuentaContableId = null
  } catch (excepcion) {
    error.value = mensajeError(excepcion, 'No se pudo guardar el concepto de retención.')
  }
}

const certificadoTerceroId = ref<string | null>(null)
const certificadoDesde = ref(`${String(anioActual)}-01-01`)
const certificadoHasta = ref(`${String(anioActual)}-12-31`)
async function consultarCertificado(): Promise<void> {
  const tenantId = tenantStore.activeTenant?.id
  if (!tenantId || !certificadoTerceroId.value) return
  if (certificadoDesde.value > certificadoHasta.value) {
    error.value = 'La fecha "Desde" no puede ser posterior a "Hasta".'
    return
  }
  error.value = null
  try {
    await tributarioStore.cargarCertificado(tenantId, certificadoTerceroId.value, certificadoDesde.value, certificadoHasta.value)
  } catch (excepcion) {
    error.value = mensajeError(excepcion, 'No se pudo generar el certificado.')
  }
}

const resumenAnio = ref(anioActual)
const resumenMes = ref(new Date().getMonth() + 1)
async function consultarResumenRetenciones(): Promise<void> {
  const tenantId = tenantStore.activeTenant?.id
  if (!tenantId) return
  error.value = null
  try {
    await tributarioStore.cargarResumenRetenciones(tenantId, resumenAnio.value, resumenMes.value)
  } catch (excepcion) {
    error.value = mensajeError(excepcion, 'No se pudo calcular el resumen mensual.')
  }
}

// ── IVA (§4.3) ────────────────────────────────────────────────────────────
const ivaPeriodoNumero = ref(1)
async function consultarResumenIva(): Promise<void> {
  const tenantId = tenantStore.activeTenant?.id
  if (!tenantId) return
  error.value = null
  try {
    await tributarioStore.cargarResumenIva(tenantId, resumenAnio.value, ivaPeriodoNumero.value)
  } catch (excepcion) {
    error.value = mensajeError(excepcion, 'No se pudo calcular el resumen de IVA — configura la periodicidad en Configuración contable.')
  }
}

// ── exógena (§4.4) ────────────────────────────────────────────────────────
const exogenaAnio = ref(anioActual)
async function consultarExogena(): Promise<void> {
  const tenantId = tenantStore.activeTenant?.id
  if (!tenantId) return
  error.value = null
  try {
    await tributarioStore.cargarExogena(tenantId, exogenaAnio.value)
  } catch (excepcion) {
    error.value = mensajeError(excepcion, 'No se pudo generar la base de exógena.')
  }
}

async function exportarExogenaExcel(): Promise<void> {
  if (!tributarioStore.exogena) return
  const XLSX = await import('xlsx')
  const libro = XLSX.utils.book_new()
  for (const [hoja, filas] of Object.entries(tributarioStore.exogena)) {
    const datos = filas as Record<string, unknown>[]
    const contenido = datos.length > 0 ? XLSX.utils.json_to_sheet(datos) : XLSX.utils.aoa_to_sheet([['Sin datos']])
    XLSX.utils.book_append_sheet(libro, contenido, hoja.slice(0, 31))
  }
  XLSX.writeFile(libro, `exogena-${String(exogenaAnio.value)}.xlsx`)
}
</script>

<template>
  <div class="space-y-6">
    <UiTituloDescripcion clase-descripcion="text-sm text-muted mt-1 max-w-2xl">
      <template #titulo>
        <h1 class="text-xl font-semibold">Obligaciones tributarias</h1>
      </template>
      <template #descripcion>
        AQUILA genera la información base y los soportes — no presenta declaraciones ni las firma.
        Quien declara es la copropiedad, a través de su contador.
      </template>
    </UiTituloDescripcion>

    <UAlert v-if="error" color="error" variant="soft" :title="error" />

    <div v-if="!aplica" class="rounded-lg border border-default p-6 space-y-3">
      <p class="font-medium">Esta copropiedad no tiene ninguna obligación tributaria activada.</p>
      <p class="text-sm text-muted">
        Nada de este módulo se activa por defecto: depende de <strong>responsable_iva</strong> y
        <strong>agente_retencion</strong>, configurados en Configuración contable (CO-1). Mientras
        ninguno de los dos esté marcado, no hay nada que registrar aquí.
      </p>
      <UButton to="/contabilidad/configuracion" variant="soft">Ir a Configuración contable</UButton>
    </div>

    <template v-else>
      <div class="flex gap-2 border-b border-default">
        <button
          v-for="p in [
            { valor: 'segregacion', etiqueta: 'Segregación tributaria' },
            ...(tenant?.agente_retencion ? [{ valor: 'retencion', etiqueta: 'Retención en la fuente' }] : []),
            ...(tenant?.responsable_iva ? [{ valor: 'iva', etiqueta: 'IVA' }] : []),
            { valor: 'exogena', etiqueta: 'Exógena' },
          ]"
          :key="p.valor" type="button"
          class="px-3 py-2 text-sm border-b-2 -mb-px"
          :class="pestana === p.valor ? 'border-primary text-primary font-medium' : 'border-transparent text-muted hover:text-default'"
          @click="pestana = p.valor as typeof pestana"
        >
          {{ p.etiqueta }}
        </button>
      </div>

      <!-- ── Segregación tributaria ─────────────────────────────────── -->
      <section v-if="pestana === 'segregacion'" class="space-y-4">
        <p class="text-sm text-muted">
          ET art. 19-5: separar en la contabilidad los ingresos gravados de los no gravados.
          Aplica a cuentas de clase 1, 4 y 5. Sin marcar, una cuenta queda "sin clasificar" — no
          bloquea nada, solo queda fuera del resumen.
        </p>
        <div class="overflow-x-auto rounded-lg border border-default">
          <table class="w-full text-sm">
            <thead class="bg-muted/30">
              <tr><th class="p-2 text-left">Cuenta</th><th class="p-2 text-left">Nombre</th><th class="p-2 text-left">Naturaleza tributaria</th></tr>
            </thead>
            <tbody>
              <tr v-for="c in tributarioStore.cuentasClasificables" :key="c.id" class="border-t border-default">
                <td class="p-2 font-mono">{{ c.codigo }}</td>
                <td class="p-2">{{ c.nombre }}</td>
                <td class="p-2">
                  <USelect
                    :model-value="c.naturaleza_tributaria_id ?? undefined"
                    :items="naturalezasTributarias.map((n) => ({ label: n.nombre, value: n.id }))"
                    placeholder="Sin clasificar" size="sm" class="w-56"
                    @update:model-value="(v) => clasificar(c.id, (v as number) ?? null)"
                  />
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        <div class="rounded-lg border border-default p-4 space-y-3">
          <p class="font-medium text-sm">Resumen de ingresos por naturaleza tributaria</p>
          <div class="grid gap-2 sm:grid-cols-3 items-end">
            <UFormField label="Desde"><UInput v-model="ingresosDesde" type="date" class="w-full" /></UFormField>
            <UFormField label="Hasta"><UInput v-model="ingresosHasta" type="date" class="w-full" /></UFormField>
            <UButton :loading="tributarioStore.loading" @click="consultarIngresos()">Calcular</UButton>
          </div>
          <table v-if="tributarioStore.ingresosPorNaturaleza.length > 0" class="w-full text-sm">
            <tbody>
              <tr v-for="fila in tributarioStore.ingresosPorNaturaleza" :key="fila.naturaleza_tributaria" class="border-t border-default">
                <td class="p-2">{{ fila.naturaleza_tributaria }}</td>
                <td class="p-2 text-right font-medium">{{ fila.total }}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      <!-- ── Retención en la fuente ─────────────────────────────────── -->
      <section v-else-if="pestana === 'retencion'" class="space-y-4">
        <div class="rounded-lg border border-default p-4 space-y-3">
          <p class="font-medium text-sm">Catálogo de conceptos</p>
          <p class="text-xs text-muted">Cero conceptos precargados — tarifas y bases mínimas cambian por resolución cada año; los define la copropiedad con su contador.</p>
          <div class="overflow-x-auto rounded border border-default">
            <table class="w-full text-sm">
              <thead class="bg-muted/30"><tr><th class="p-2 text-left">Código</th><th class="p-2 text-left">Nombre</th><th class="p-2 text-right">Tarifa</th></tr></thead>
              <tbody>
                <tr v-for="c in tributarioStore.conceptosRetencion" :key="c.id" class="border-t border-default">
                  <td class="p-2">{{ c.codigo }}</td><td class="p-2">{{ c.nombre }}</td><td class="p-2 text-right">{{ c.tarifa }}%</td>
                </tr>
                <tr v-if="tributarioStore.conceptosRetencion.length === 0"><td colspan="3" class="p-3 text-center text-muted">Sin conceptos todavía.</td></tr>
              </tbody>
            </table>
          </div>
          <div class="grid gap-2 sm:grid-cols-4">
            <UFormField label="Código"><UInput v-model="formConcepto.codigo" class="w-full" /></UFormField>
            <UFormField label="Nombre"><UInput v-model="formConcepto.nombre" class="w-full" /></UFormField>
            <UFormField label="Tarifa (%)"><UInput v-model.number="formConcepto.tarifa" type="number" class="w-full" /></UFormField>
            <UFormField label="Cuenta de retención por pagar">
              <UiSelectorBuscable v-model="formConcepto.cuentaContableId" :opciones="cuentasRetencion.map((c) => ({ valor: c.id, etiqueta: `${c.codigo} — ${c.nombre}` }))" />
            </UFormField>
          </div>
          <UButton size="sm" :loading="tributarioStore.guardando" @click="guardarConcepto()">Agregar concepto</UButton>
        </div>

        <div class="rounded-lg border border-default p-4 space-y-3">
          <p class="font-medium text-sm">Certificado de retención</p>
          <div class="grid gap-2 sm:grid-cols-4 items-end">
            <UFormField label="Tercero" class="sm:col-span-2">
              <UiSelectorBuscable v-model="certificadoTerceroId" :opciones="terceros.map((t) => ({ valor: t.id, etiqueta: t.etiqueta }))" />
            </UFormField>
            <UFormField label="Desde"><UInput v-model="certificadoDesde" type="date" class="w-full" /></UFormField>
            <UFormField label="Hasta"><UInput v-model="certificadoHasta" type="date" class="w-full" /></UFormField>
          </div>
          <UButton size="sm" :disabled="!certificadoTerceroId" :loading="tributarioStore.loading" @click="consultarCertificado()">Generar certificado</UButton>
          <table v-if="tributarioStore.certificado.length > 0" class="w-full text-sm">
            <thead class="bg-muted/30"><tr><th class="p-2 text-left">Concepto</th><th class="p-2 text-right">Tarifa</th><th class="p-2 text-right">Base</th><th class="p-2 text-right">Valor</th></tr></thead>
            <tbody>
              <tr v-for="f in tributarioStore.certificado" :key="`${f.concepto_codigo}-${f.tarifa}`" class="border-t border-default">
                <td class="p-2">{{ f.concepto_nombre }}</td><td class="p-2 text-right">{{ f.tarifa }}%</td>
                <td class="p-2 text-right">{{ f.total_base }}</td><td class="p-2 text-right font-medium">{{ f.total_valor }}</td>
              </tr>
            </tbody>
          </table>
        </div>

        <div class="rounded-lg border border-default p-4 space-y-3">
          <p class="font-medium text-sm">Resumen mensual (base del formulario de declaración)</p>
          <div class="grid gap-2 sm:grid-cols-3 items-end">
            <UFormField label="Año"><UInput v-model.number="resumenAnio" type="number" class="w-full" /></UFormField>
            <UFormField label="Mes"><UInput v-model.number="resumenMes" type="number" min="1" max="12" class="w-full" /></UFormField>
            <UButton :loading="tributarioStore.loading" @click="consultarResumenRetenciones()">Calcular</UButton>
          </div>
          <table v-if="tributarioStore.resumenRetenciones.length > 0" class="w-full text-sm">
            <tbody>
              <tr v-for="f in tributarioStore.resumenRetenciones" :key="f.concepto_codigo" class="border-t border-default">
                <td class="p-2">{{ f.concepto_nombre }}</td>
                <td class="p-2 text-right">{{ f.total_base }}</td>
                <td class="p-2 text-right font-medium">{{ f.total_valor }}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      <!-- ── IVA ──────────────────────────────────────────────────────── -->
      <section v-else-if="pestana === 'iva'" class="space-y-4">
        <div class="rounded-lg border border-default p-4 space-y-3">
          <p class="font-medium text-sm">Resumen de IVA generado en ingresos gravados</p>
          <p class="text-xs text-muted">
            Registro informativo — no genera ningún asiento contable automático (decisión del
            Plan del corte): alimenta este resumen y la exógena, pero el asiento de IVA por pagar
            lo registra la copropiedad por el mecanismo contable ya existente.
          </p>
          <div class="grid gap-2 sm:grid-cols-3 items-end">
            <UFormField label="Año"><UInput v-model.number="resumenAnio" type="number" class="w-full" /></UFormField>
            <UFormField label="Periodo (bimestre/cuatrimestre)"><UInput v-model.number="ivaPeriodoNumero" type="number" min="1" class="w-full" /></UFormField>
            <UButton :loading="tributarioStore.loading" @click="consultarResumenIva()">Calcular</UButton>
          </div>
          <div v-if="tributarioStore.resumenIva" class="grid grid-cols-3 gap-3 text-sm">
            <div class="rounded border border-default p-3"><p class="text-xs text-muted">Meses</p><p class="font-medium">{{ tributarioStore.resumenIva.mes_desde }}–{{ tributarioStore.resumenIva.mes_hasta }}</p></div>
            <div class="rounded border border-default p-3"><p class="text-xs text-muted">Base total</p><p class="font-medium">{{ tributarioStore.resumenIva.total_base }}</p></div>
            <div class="rounded border border-default p-3"><p class="text-xs text-muted">IVA total</p><p class="font-medium">{{ tributarioStore.resumenIva.total_valor }}</p></div>
          </div>
        </div>
      </section>

      <!-- ── Exógena ──────────────────────────────────────────────────── -->
      <section v-else class="space-y-4">
        <p class="text-sm text-muted">
          Conjuntos de datos base para la resolución anual de exógena — no el formato XML de la
          resolución vigente (fuera de alcance, cambia cada año). El contador carga estos datos al
          formato correspondiente.
        </p>
        <div class="flex items-end gap-3">
          <UFormField label="Año"><UInput v-model.number="exogenaAnio" type="number" class="w-full" /></UFormField>
          <UButton :loading="tributarioStore.loading" @click="consultarExogena()">Generar</UButton>
          <UButton v-if="tributarioStore.exogena" variant="soft" icon="i-lucide-download" @click="exportarExogenaExcel()">Exportar Excel</UButton>
        </div>
        <div v-if="tributarioStore.exogena" class="space-y-4">
          <div v-for="(filas, nombre) in tributarioStore.exogena" :key="nombre" class="rounded-lg border border-default p-3">
            <p class="text-xs font-semibold uppercase tracking-wide text-muted mb-2">{{ nombre }}</p>
            <p v-if="(filas as unknown[]).length === 0" class="text-sm text-muted">Sin datos.</p>
            <pre v-else class="text-xs overflow-x-auto">{{ JSON.stringify(filas, null, 2) }}</pre>
          </div>
        </div>
      </section>
    </template>
  </div>
</template>
