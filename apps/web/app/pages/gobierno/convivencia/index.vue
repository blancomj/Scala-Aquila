<script setup lang="ts">
// GOB-6 §4.7: listado de expedientes de convivencia + panel de configuración del catálogo de
// infracciones de la copropiedad (con la referencia al reglamento obligatoria y visible) +
// configuración de qué conceptos cuentan como expensa necesaria mensual (base del tope de multa,
// §4.5 — sin esto, gobierno_imponer_sancion() falla explícito para cualquier multa).
import type { Database } from '@aquila/shared'

definePageMeta({ layout: 'default', middleware: ['tenant', 'rbac'], permiso: 'data:read' })

type InmuebleOpcion = { id: string; codigo: string }
type TerceroOpcion = { id: string; primer_nombre: string; primer_apellido: string }
type ConceptoOpcion = { id: string; codigo: string; nombre: string }

const tenantStore = useTenantStore()
const convivenciaStore = useGobiernoConvivenciaStore()

const error = ref<string | null>(null)
const pestana = ref<'expedientes' | 'infracciones' | 'expensa'>('expedientes')
const inmuebles = ref<InmuebleOpcion[]>([])
const terceros = ref<TerceroOpcion[]>([])
const conceptos = ref<ConceptoOpcion[]>([])

async function cargar(): Promise<void> {
  const tenantId = tenantStore.activeTenant?.id
  if (!tenantId) return
  error.value = null
  try {
    const cliente = useSupabaseClient<Database>()
    const [{ data: inmueblesFilas }, { data: tercerosFilas }, { data: conceptosFilas }] = await Promise.all([
      cliente.from('inmuebles').select('id, codigo').eq('tenant_id', tenantId).order('codigo'),
      cliente.from('terceros').select('id, primer_nombre, primer_apellido').eq('tenant_id', tenantId).order('primer_nombre'),
      cliente.from('conceptos').select('id, codigo, nombre').eq('tenant_id', tenantId).order('nombre'),
      convivenciaStore.cargarExpedientes(tenantId),
      convivenciaStore.cargarInfracciones(tenantId),
      convivenciaStore.cargarClasesSancion(),
      convivenciaStore.cargarConfigExpensa(tenantId),
    ])
    inmuebles.value = inmueblesFilas ?? []
    terceros.value = (tercerosFilas ?? []).map((t) => ({
      id: t.id, primer_nombre: t.primer_nombre ?? '', primer_apellido: t.primer_apellido ?? '',
    }))
    conceptos.value = conceptosFilas ?? []
  } catch (excepcion) {
    error.value = mensajeError(excepcion, 'No se pudo cargar la información de convivencia.')
  }
}
onMounted(cargar)

const etapaColor: Record<string, 'neutral' | 'primary' | 'warning' | 'success' | 'error'> = {
  reportado: 'neutral', conciliacion_comite: 'primary', requerimiento_escrito: 'primary',
  descargos: 'primary', decision_organo: 'warning', sancion_impuesta: 'success',
  archivado: 'neutral', impugnacion: 'warning', firme: 'success',
}

// ── nuevo expediente ─────────────────────────────────────────────────────
const drawerExpedienteAbierto = ref(false)
const formExpediente = reactive({
  infraccionId: null as string | null, inmuebleId: null as string | null, presuntoInfractorRef: null as string | null,
  calidad: 'propietario' as 'propietario' | 'tenedor' | 'tercero',
  descripcionHechos: '', fechaHechos: new Date().toISOString().slice(0, 10),
})
function abrirNuevoExpediente(): void {
  formExpediente.infraccionId = null
  formExpediente.inmuebleId = null
  formExpediente.presuntoInfractorRef = null
  formExpediente.calidad = 'propietario'
  formExpediente.descripcionHechos = ''
  formExpediente.fechaHechos = new Date().toISOString().slice(0, 10)
  drawerExpedienteAbierto.value = true
}
async function guardarExpediente(): Promise<void> {
  const tenantId = tenantStore.activeTenant?.id
  if (
    !tenantId || !formExpediente.infraccionId || !formExpediente.inmuebleId
    || !formExpediente.presuntoInfractorRef || !formExpediente.descripcionHechos.trim()
  ) return
  error.value = null
  try {
    const expediente = await convivenciaStore.reportarExpediente({
      infraccionId: formExpediente.infraccionId, inmuebleId: formExpediente.inmuebleId,
      presuntoInfractorRef: formExpediente.presuntoInfractorRef, calidad: formExpediente.calidad,
      descripcionHechos: formExpediente.descripcionHechos.trim(), fechaHechos: formExpediente.fechaHechos,
    })
    drawerExpedienteAbierto.value = false
    await navigateTo(`/gobierno/convivencia/${expediente.id}`)
  } catch (excepcion) {
    error.value = mensajeError(excepcion, 'No se pudo reportar el expediente.')
  }
}

// ── nueva infracción ──────────────────────────────────────────────────────
const drawerInfraccionAbierto = ref(false)
const formInfraccion = reactive({
  codigo: '', nombre: '', descripcion: '', reglamentoReferencia: '',
  clasesSancionPermitidas: [] as string[], esNoPecuniaria: true,
})
function abrirNuevaInfraccion(): void {
  formInfraccion.codigo = ''
  formInfraccion.nombre = ''
  formInfraccion.descripcion = ''
  formInfraccion.reglamentoReferencia = ''
  formInfraccion.clasesSancionPermitidas = []
  formInfraccion.esNoPecuniaria = true
  drawerInfraccionAbierto.value = true
}
async function guardarInfraccion(): Promise<void> {
  const tenantId = tenantStore.activeTenant?.id
  if (!tenantId || !formInfraccion.codigo.trim() || !formInfraccion.nombre.trim() || !formInfraccion.reglamentoReferencia.trim()) return
  error.value = null
  try {
    await convivenciaStore.crearInfraccion({
      tenantId, codigo: formInfraccion.codigo.trim(), nombre: formInfraccion.nombre.trim(),
      descripcion: formInfraccion.descripcion.trim() || null,
      reglamentoReferencia: formInfraccion.reglamentoReferencia.trim(),
      clasesSancionPermitidas: formInfraccion.clasesSancionPermitidas, esNoPecuniaria: formInfraccion.esNoPecuniaria,
    })
    drawerInfraccionAbierto.value = false
  } catch (excepcion) {
    error.value = mensajeError(excepcion, 'No se pudo crear la infracción — verifica que la referencia al reglamento no esté vacía.')
  }
}

// ── configuración de expensa necesaria (base del tope de multa) ────────
const nuevoConceptoExpensaId = ref<string | null>(null)
const conceptosDisponibles = computed(() => {
  const yaConfigurados = new Set(convivenciaStore.configExpensa.map((c) => c.concepto_id))
  return conceptos.value.filter((c) => !yaConfigurados.has(c.id))
})
async function agregarConceptoExpensa(): Promise<void> {
  const tenantId = tenantStore.activeTenant?.id
  if (!tenantId || !nuevoConceptoExpensaId.value) return
  error.value = null
  try {
    await convivenciaStore.configurarExpensaNecesaria(tenantId, nuevoConceptoExpensaId.value)
    nuevoConceptoExpensaId.value = null
  } catch (excepcion) {
    error.value = mensajeError(excepcion, 'No se pudo agregar el concepto.')
  }
}
async function quitarConceptoExpensa(conceptoId: string): Promise<void> {
  const tenantId = tenantStore.activeTenant?.id
  if (!tenantId) return
  error.value = null
  try {
    await convivenciaStore.quitarConfigExpensaNecesaria(tenantId, conceptoId)
  } catch (excepcion) {
    error.value = mensajeError(excepcion, 'No se pudo quitar el concepto.')
  }
}
</script>

<template>
  <div class="space-y-6">
    <div class="flex items-start justify-between gap-4 flex-wrap">
      <UiTituloDescripcion clase-descripcion="text-sm text-muted mt-1 max-w-2xl">
        <template #titulo>
          <h1 class="text-xl font-semibold">Convivencia y régimen sancionatorio</h1>
        </template>
        <template #descripcion>
          Expedientes de convivencia (Ley 675 art. 58-60): el debido proceso — requerimiento
          escrito y descargos — es obligatorio antes de cualquier sanción, y el catálogo de
          sanciones (art. 59) es taxativo, no ampliable.
        </template>
      </UiTituloDescripcion>
      <UButton variant="ghost" icon="i-lucide-refresh-cw" :loading="convivenciaStore.loading" @click="cargar()">
        Actualizar
      </UButton>
    </div>

    <UAlert v-if="error" color="error" variant="soft" :title="error" />

    <div class="flex gap-2 border-b border-default">
      <button
        v-for="p in [
          { valor: 'expedientes', etiqueta: 'Expedientes' },
          { valor: 'infracciones', etiqueta: 'Infracciones tipificadas' },
          { valor: 'expensa', etiqueta: 'Expensa necesaria (base del tope)' },
        ]"
        :key="p.valor" type="button"
        class="px-3 py-2 text-sm border-b-2 -mb-px"
        :class="pestana === p.valor ? 'border-primary text-primary font-medium' : 'border-transparent text-muted hover:text-default'"
        @click="pestana = p.valor as typeof pestana"
      >
        {{ p.etiqueta }}
      </button>
    </div>

    <!-- ── Expedientes ─────────────────────────────────────────────── -->
    <section v-if="pestana === 'expedientes'" class="space-y-3">
      <div class="flex justify-end">
        <UButton size="sm" icon="i-lucide-plus" @click="abrirNuevoExpediente()">Reportar expediente</UButton>
      </div>
      <div class="rounded-lg border border-default divide-y divide-default">
        <NuxtLink
          v-for="e in convivenciaStore.expedientes" :key="e.id" :to="`/gobierno/convivencia/${e.id}`"
          class="flex items-center justify-between gap-4 p-3 hover:bg-elevated/50"
        >
          <div>
            <p class="font-medium">{{ e.numero }}/{{ e.anio }} · {{ e.infraccion?.nombre }}</p>
            <p class="text-xs text-muted">
              {{ e.inmueble?.codigo }} · {{ e.presunto_infractor?.primer_nombre }} {{ e.presunto_infractor?.primer_apellido }}
              · {{ e.calidad }}
            </p>
          </div>
          <UBadge :color="etapaColor[e.etapa] ?? 'neutral'" variant="soft">{{ e.etapa }}</UBadge>
        </NuxtLink>
        <p v-if="convivenciaStore.expedientes.length === 0 && !convivenciaStore.loading" class="text-sm text-muted p-4">
          Todavía no hay expedientes de convivencia reportados.
        </p>
      </div>
    </section>

    <!-- ── Infracciones tipificadas ────────────────────────────────── -->
    <section v-else-if="pestana === 'infracciones'" class="space-y-3">
      <p class="text-sm text-muted">
        Ninguna infracción viene precargada (art. 59/60): cada copropiedad tipifica desde su
        propio reglamento. Sin referencia al reglamento no se puede crear.
      </p>
      <div class="flex justify-end">
        <UButton size="sm" icon="i-lucide-plus" @click="abrirNuevaInfraccion()">Nueva infracción</UButton>
      </div>
      <div class="rounded-lg border border-default divide-y divide-default">
        <div v-for="i in convivenciaStore.infracciones" :key="i.id" class="p-3 space-y-1">
          <p class="font-medium">{{ i.codigo }} · {{ i.nombre }}</p>
          <p class="text-xs text-muted">Reglamento: {{ i.reglamento_referencia }}</p>
          <div class="flex flex-wrap gap-1">
            <UBadge v-for="c in i.clases_sancion_permitidas" :key="c" variant="soft" size="xs">{{ c }}</UBadge>
          </div>
        </div>
        <p v-if="convivenciaStore.infracciones.length === 0" class="text-sm text-muted p-4">
          Todavía no hay infracciones tipificadas.
        </p>
      </div>
    </section>

    <!-- ── Expensa necesaria mensual (base del tope de multa) ──────── -->
    <section v-else class="space-y-3">
      <p class="text-sm text-muted">
        Qué conceptos cuentan como «expensas necesarias mensuales a cargo del infractor»
        (art. 59 num. 2, base del tope de la multa) — selección explícita, nunca inferida.
      </p>
      <ul class="text-sm space-y-1">
        <li v-for="c in convivenciaStore.configExpensa" :key="c.concepto_id" class="flex items-center justify-between gap-2 rounded border border-default p-2">
          <span>{{ c.concepto?.codigo }} · {{ c.concepto?.nombre }}</span>
          <UButton size="xs" variant="ghost" color="error" icon="i-lucide-x" @click="quitarConceptoExpensa(c.concepto_id)" />
        </li>
      </ul>
      <p v-if="convivenciaStore.configExpensa.length === 0" class="text-xs text-muted">
        Sin conceptos configurados — imponer una multa fallará hasta configurar al menos uno.
      </p>
      <div class="flex items-end gap-2">
        <UFormField label="Agregar concepto" class="flex-1">
          <UiSelectorBuscable v-model="nuevoConceptoExpensaId" :opciones="conceptosDisponibles.map((c) => ({ valor: c.id, etiqueta: `${c.codigo} · ${c.nombre}` }))" />
        </UFormField>
        <UButton :loading="convivenciaStore.guardando" :disabled="!nuevoConceptoExpensaId" @click="agregarConceptoExpensa()">
          Agregar
        </UButton>
      </div>
    </section>

    <UiDrawer :abierto="drawerExpedienteAbierto" titulo="Reportar expediente de convivencia" @cerrar="drawerExpedienteAbierto = false">
      <div class="space-y-3">
        <UFormField label="Infracción" name="infraccionId">
          <UiSelectorBuscable v-model="formExpediente.infraccionId" :opciones="convivenciaStore.infracciones.map((i) => ({ valor: i.id, etiqueta: `${i.codigo} · ${i.nombre}` }))" />
        </UFormField>
        <UFormField label="Inmueble" name="inmuebleId">
          <UiSelectorBuscable v-model="formExpediente.inmuebleId" :opciones="inmuebles.map((i) => ({ valor: i.id, etiqueta: i.codigo }))" />
        </UFormField>
        <UFormField label="Presunto infractor" name="presuntoInfractorRef">
          <UiSelectorBuscable v-model="formExpediente.presuntoInfractorRef" :opciones="terceros.map((t) => ({ valor: t.id, etiqueta: `${t.primer_nombre} ${t.primer_apellido}` }))" />
        </UFormField>
        <UFormField label="Calidad" name="calidad">
          <USelect
            v-model="formExpediente.calidad"
            class="w-64"
            :items="[
              { label: 'Propietario', value: 'propietario' }, { label: 'Tenedor (arrendatario, etc.)', value: 'tenedor' },
              { label: 'Tercero', value: 'tercero' },
            ]"
          />
        </UFormField>
        <UFormField label="Fecha de los hechos" name="fechaHechos">
          <UInput v-model="formExpediente.fechaHechos" type="date" class="w-full" />
        </UFormField>
        <UFormField label="Descripción de los hechos" name="descripcionHechos">
          <UTextarea v-model="formExpediente.descripcionHechos" class="w-full" :rows="3" />
        </UFormField>
      </div>
      <template #foot>
        <div class="flex justify-end gap-2 w-full">
          <UButton variant="ghost" @click="drawerExpedienteAbierto = false">Cancelar</UButton>
          <UButton
            :loading="convivenciaStore.guardando"
            :disabled="!formExpediente.infraccionId || !formExpediente.inmuebleId || !formExpediente.presuntoInfractorRef || !formExpediente.descripcionHechos.trim()"
            @click="guardarExpediente()"
          >
            Reportar
          </UButton>
        </div>
      </template>
    </UiDrawer>

    <UiDrawer :abierto="drawerInfraccionAbierto" titulo="Nueva infracción tipificada" @cerrar="drawerInfraccionAbierto = false">
      <div class="space-y-3">
        <UFormField label="Código" name="codigo"><UInput v-model="formInfraccion.codigo" class="w-full" /></UFormField>
        <UFormField label="Nombre" name="nombre"><UInput v-model="formInfraccion.nombre" class="w-full" /></UFormField>
        <UFormField label="Descripción (opcional)" name="descripcion"><UTextarea v-model="formInfraccion.descripcion" class="w-full" /></UFormField>
        <UFormField label="Referencia al reglamento" name="reglamentoReferencia" required help="Obligatoria — sin cita del reglamento la sanción sería ilegal">
          <UInput v-model="formInfraccion.reglamentoReferencia" class="w-full" placeholder="Art. 12 del reglamento de convivencia" />
        </UFormField>
        <UFormField label="Clases de sanción permitidas" name="clasesSancionPermitidas">
          <UCheckboxGroup
            v-model="formInfraccion.clasesSancionPermitidas"
            :items="convivenciaStore.clasesSancion.map((c) => ({ value: c.codigo, label: `${c.nombre} (${c.numeral_articulo})` }))"
          />
        </UFormField>
        <UFormField label="Es no pecuniaria" name="esNoPecuniaria" help="El art. 59 solo autoriza sancionar incumplimientos NO pecuniarios">
          <UCheckbox v-model="formInfraccion.esNoPecuniaria" />
        </UFormField>
      </div>
      <template #foot>
        <div class="flex justify-end gap-2 w-full">
          <UButton variant="ghost" @click="drawerInfraccionAbierto = false">Cancelar</UButton>
          <UButton
            :loading="convivenciaStore.guardando"
            :disabled="!formInfraccion.codigo.trim() || !formInfraccion.nombre.trim() || !formInfraccion.reglamentoReferencia.trim()"
            @click="guardarInfraccion()"
          >
            Crear infracción
          </UButton>
        </div>
      </template>
    </UiDrawer>
  </div>
</template>
