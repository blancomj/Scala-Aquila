<script setup lang="ts">
// MANT-5 §4.1/§4.4/§4.6: ficha de proveedor/contratista. El semáforo de habilitación es lo
// primero que debe verse, antes que la calificación (§4.6). La evaluación siempre muestra el
// desglose por criterio, nunca solo el puntaje (§4.4) — buena práctica, sin norma detrás.
definePageMeta({ layout: 'default', middleware: ['tenant', 'rbac'], permiso: 'data:read' })

const route = useRoute()
const terceroId = route.params.id as string

const tenantStore = useTenantStore()
const proveedoresStore = useMantenimientoProveedoresStore()
const tercerosStore = useTercerosStore()
const documentosStore = useDocumentosStore()

const tiposHabilitacion = ref<Awaited<ReturnType<typeof cargarListaTipos>>>([])
const categoriasActivo = ref<Awaited<ReturnType<typeof cargarListaTipos>>>([])
const estadosComerciales = ref<Awaited<ReturnType<typeof cargarListaTipos>>>([])

async function cargar(): Promise<void> {
  const tenantId = tenantStore.activeTenant?.id
  if (!tenantId) return
  await Promise.all([
    proveedoresStore.cargarFicha(tenantId, terceroId),
    tercerosStore.cargarTerceros(tenantId),
    tiposHabilitacion.value.length === 0
      ? cargarListaTipos(tenantId, 'TIPO_HABILITACION').then((d) => { tiposHabilitacion.value = d })
      : Promise.resolve(),
    categoriasActivo.value.length === 0
      ? cargarListaTipos(tenantId, 'CATEGORIA_ACTIVO').then((d) => { categoriasActivo.value = d })
      : Promise.resolve(),
    estadosComerciales.value.length === 0
      ? cargarListaTipos(tenantId, 'ESTADO_COMERCIAL_PROVEEDOR').then((d) => { estadosComerciales.value = d })
      : Promise.resolve(),
  ])
}
onMounted(cargar)
onBeforeUnmount(() => proveedoresStore.limpiarFicha())

const tercero = computed(() => tercerosStore.terceros.find((t) => t.id === terceroId))

const ESTADO_COLOR: Record<string, 'success' | 'warning' | 'error'> = {
  vigente: 'success', proximo_a_vencer: 'warning', vencida: 'error',
}

const errorAccion = ref<string | null>(null)

// ── Agregar habilitación ──
const archivoHabilitacion = ref<File | null>(null)
const formHabilitacion = reactive({
  tipoId: undefined as number | undefined, numeroReferencia: '', entidadEmisora: '',
  vigenteDesde: new Date().toISOString().slice(0, 10), vigenteHasta: '',
})
function elegirArchivo(evento: Event): void {
  archivoHabilitacion.value = (evento.target as HTMLInputElement).files?.[0] ?? null
}
async function agregarHabilitacion(): Promise<void> {
  const tenantId = tenantStore.activeTenant?.id
  if (!tenantId || !formHabilitacion.tipoId || !archivoHabilitacion.value) return
  errorAccion.value = null
  try {
    const tipoDoc = await cargarListaTipos(tenantId, 'TIPO_DOCUMENTO')
    const tipoDocHabilitacion = tipoDoc.find((t) => t.codigo === 'habilitacion_proveedor')
    if (!tipoDocHabilitacion) throw new Error('No se encontró el tipo de documento "habilitacion_proveedor".')
    const documento = await documentosStore.subirDocumento({
      tenantId, inmuebleId: null, tipoDocumentoId: tipoDocHabilitacion.id, archivo: archivoHabilitacion.value,
    })
    if (!documento.id) throw new Error('El documento subido no devolvió id.')
    await proveedoresStore.agregarHabilitacion({
      tenant_id: tenantId, tercero_id: terceroId, tipo_id: formHabilitacion.tipoId,
      numero_referencia: formHabilitacion.numeroReferencia.trim() || null,
      entidad_emisora: formHabilitacion.entidadEmisora.trim() || null,
      vigente_desde: formHabilitacion.vigenteDesde || null,
      vigente_hasta: formHabilitacion.vigenteHasta || null,
      documento_id: documento.id,
    })
    formHabilitacion.tipoId = undefined
    formHabilitacion.numeroReferencia = ''
    formHabilitacion.entidadEmisora = ''
    formHabilitacion.vigenteHasta = ''
    archivoHabilitacion.value = null
  } catch (excepcion) {
    errorAccion.value = mensajeError(excepcion, 'No se pudo agregar la habilitación.')
  }
}

// ── Perfil ──
const formPerfil = reactive({ categoriasServicio: [] as number[], especialidades: '', estadoComercialId: undefined as number | undefined })
watch(() => proveedoresStore.perfil, (p) => {
  formPerfil.categoriasServicio = p?.categorias_servicio ?? []
  formPerfil.especialidades = (p?.especialidades ?? []).join(', ')
  formPerfil.estadoComercialId = p?.estado_comercial_id ?? undefined
}, { immediate: true })

async function guardarPerfil(): Promise<void> {
  const tenantId = tenantStore.activeTenant?.id
  if (!tenantId) return
  errorAccion.value = null
  try {
    await proveedoresStore.guardarPerfil({
      tenant_id: tenantId, tercero_id: terceroId,
      categorias_servicio: formPerfil.categoriasServicio,
      especialidades: formPerfil.especialidades.split(',').map((s) => s.trim()).filter(Boolean),
      estado_comercial_id: formPerfil.estadoComercialId ?? null,
    })
  } catch (excepcion) {
    errorAccion.value = mensajeError(excepcion, 'No se pudo guardar el perfil.')
  }
}

// ── Evaluación ──
interface FilaCriterio { nombre: string; peso: number | null; puntaje: number | null }
const filasCriterio = ref<FilaCriterio[]>([{ nombre: '', peso: null, puntaje: null }])
const formEvaluacion = reactive({ periodo: '', puntaje: null as number | null, observaciones: '' })
function agregarFilaCriterio(): void { filasCriterio.value.push({ nombre: '', peso: null, puntaje: null }) }
function quitarFilaCriterio(i: number): void { filasCriterio.value.splice(i, 1) }

async function guardarEvaluacion(): Promise<void> {
  const tenantId = tenantStore.activeTenant?.id
  if (!tenantId || !formEvaluacion.periodo.trim() || formEvaluacion.puntaje === null) return
  errorAccion.value = null
  const criterios: Record<string, { peso: number | null; puntaje: number | null }> = {}
  for (const fila of filasCriterio.value) {
    if (fila.nombre.trim()) criterios[fila.nombre.trim()] = { peso: fila.peso, puntaje: fila.puntaje }
  }
  try {
    await proveedoresStore.agregarEvaluacion({
      tenant_id: tenantId, tercero_id: terceroId, periodo: formEvaluacion.periodo.trim(),
      criterios, puntaje: formEvaluacion.puntaje, observaciones: formEvaluacion.observaciones.trim() || null,
    })
    formEvaluacion.periodo = ''
    formEvaluacion.puntaje = null
    formEvaluacion.observaciones = ''
    filasCriterio.value = [{ nombre: '', peso: null, puntaje: null }]
  } catch (excepcion) {
    errorAccion.value = mensajeError(excepcion, 'No se pudo registrar la evaluación.')
  }
}

function desglose(criterios: unknown): Array<{ nombre: string; peso: unknown; puntaje: unknown }> {
  if (!criterios || typeof criterios !== 'object') return []
  return Object.entries(criterios as Record<string, { peso?: unknown; puntaje?: unknown }>).map(([nombre, v]) => ({
    nombre, peso: v?.peso, puntaje: v?.puntaje,
  }))
}
</script>

<template>
  <div v-if="tercero" class="space-y-6">
    <div>
      <UButton variant="link" icon="i-lucide-arrow-left" to="/mantenimiento/proveedores" class="px-0 mb-1">
        Proveedores y contratistas
      </UButton>
      <h1 class="text-xl font-semibold">{{ tercero.nombre_completo }}</h1>
      <p class="text-sm text-muted">{{ tercero.numero_documento }}</p>
    </div>

    <UAlert v-if="errorAccion" color="error" variant="soft" :title="errorAccion" />

    <div class="grid grid-cols-1 lg:grid-cols-3 gap-6">
      <div class="lg:col-span-2 space-y-6">
        <!-- Semáforo — lo primero que debe verse (§4.6) -->
        <section class="rounded-lg border border-default p-4 space-y-3">
          <h2 class="font-medium">Habilitación</h2>
          <div class="divide-y divide-default">
            <div v-for="h in proveedoresStore.semaforo" :key="h.habilitacion_id" class="flex items-center justify-between gap-3 py-2">
              <div>
                <p class="text-sm font-medium">{{ h.tipo_nombre }}</p>
                <p class="text-xs text-muted">
                  {{ h.vigente_desde ?? '—' }} → {{ h.vigente_hasta ?? 'sin vencimiento' }}
                </p>
              </div>
              <UBadge :color="ESTADO_COLOR[h.estado ?? ''] ?? 'neutral'" variant="soft" class="capitalize">
                {{ (h.estado ?? '').replace(/_/g, ' ') }}
              </UBadge>
            </div>
            <p v-if="proveedoresStore.semaforo.length === 0" class="py-4 text-sm text-muted text-center">
              Sin habilitaciones registradas.
            </p>
          </div>
          <div class="grid grid-cols-2 gap-2 pt-2 border-t border-default">
            <USelect v-model="formHabilitacion.tipoId" :items="tiposHabilitacion.map((t) => ({ label: t.nombre, value: t.id }))" placeholder="Tipo de habilitación" />
            <UInput v-model="formHabilitacion.numeroReferencia" placeholder="Número de referencia" />
            <UInput v-model="formHabilitacion.entidadEmisora" placeholder="Entidad emisora" />
            <div class="flex gap-2">
              <UInput v-model="formHabilitacion.vigenteDesde" type="date" class="flex-1" />
              <UInput v-model="formHabilitacion.vigenteHasta" type="date" class="flex-1" />
            </div>
            <input type="file" accept=".pdf,.jpg,.jpeg,.png" class="text-sm col-span-2" @change="elegirArchivo">
            <UButton
              class="col-span-2" :loading="proveedoresStore.guardando"
              :disabled="!formHabilitacion.tipoId || !archivoHabilitacion"
              @click="agregarHabilitacion()"
            >
              Agregar habilitación
            </UButton>
          </div>
        </section>

        <!-- Evaluación — buena práctica, siempre con desglose (§4.4) -->
        <section class="rounded-lg border border-default p-4 space-y-3">
          <h2 class="font-medium">Evaluación <span class="text-xs text-muted font-normal">(buena práctica, sin norma detrás)</span></h2>
          <div class="divide-y divide-default">
            <div v-for="e in proveedoresStore.evaluaciones" :key="e.id" class="py-2 space-y-1">
              <div class="flex items-center justify-between">
                <p class="text-sm font-medium">{{ e.periodo }}</p>
                <UBadge variant="soft">{{ e.puntaje }}</UBadge>
              </div>
              <div class="flex flex-wrap gap-2 text-xs text-muted">
                <span v-for="c in desglose(e.criterios)" :key="c.nombre">{{ c.nombre }}: {{ c.puntaje }} (peso {{ c.peso }})</span>
              </div>
              <p v-if="e.observaciones" class="text-xs text-muted">{{ e.observaciones }}</p>
            </div>
            <p v-if="proveedoresStore.evaluaciones.length === 0" class="py-4 text-sm text-muted text-center">
              Sin evaluaciones registradas.
            </p>
          </div>
          <div class="space-y-2 pt-2 border-t border-default">
            <div class="grid grid-cols-2 gap-2">
              <UInput v-model="formEvaluacion.periodo" placeholder="Periodo (ej. 2026-T1)" />
              <UInput v-model.number="formEvaluacion.puntaje" type="number" step="0.1" placeholder="Puntaje general" />
            </div>
            <div v-for="(fila, i) in filasCriterio" :key="i" class="flex gap-2">
              <UInput v-model="fila.nombre" placeholder="Criterio" class="flex-1" />
              <UInput v-model.number="fila.peso" type="number" placeholder="Peso" class="w-24" />
              <UInput v-model.number="fila.puntaje" type="number" placeholder="Puntaje" class="w-24" />
              <UButton variant="ghost" color="error" icon="i-lucide-x" size="sm" @click="quitarFilaCriterio(i)" />
            </div>
            <UButton variant="ghost" size="sm" icon="i-lucide-plus" @click="agregarFilaCriterio()">Agregar criterio</UButton>
            <UTextarea v-model="formEvaluacion.observaciones" placeholder="Observaciones" class="w-full" />
            <UButton
              :loading="proveedoresStore.guardando" :disabled="!formEvaluacion.periodo.trim() || formEvaluacion.puntaje === null"
              @click="guardarEvaluacion()"
            >
              Registrar evaluación
            </UButton>
          </div>
        </section>
      </div>

      <div class="space-y-3">
        <section class="rounded-lg border border-default p-4 space-y-3">
          <h2 class="font-medium">Perfil de servicios</h2>
          <UFormField label="Categorías de servicio" name="categorias">
            <div class="space-y-1">
              <label v-for="c in categoriasActivo" :key="c.id" class="flex items-center gap-2 text-sm">
                <UCheckbox
                  :model-value="formPerfil.categoriasServicio.includes(c.id)"
                  @update:model-value="(v) => {
                    formPerfil.categoriasServicio = v
                      ? [...formPerfil.categoriasServicio, c.id]
                      : formPerfil.categoriasServicio.filter((id) => id !== c.id)
                  }"
                />
                {{ c.nombre }}
              </label>
            </div>
          </UFormField>
          <UFormField label="Especialidades (separadas por coma)" name="especialidades">
            <UInput v-model="formPerfil.especialidades" class="w-full" />
          </UFormField>
          <UFormField label="Estado comercial" name="estadoComercial">
            <USelect v-model="formPerfil.estadoComercialId" :items="estadosComerciales.map((e) => ({ label: e.nombre, value: e.id }))" />
          </UFormField>
          <UButton block :loading="proveedoresStore.guardando" @click="guardarPerfil()">Guardar perfil</UButton>
        </section>
      </div>
    </div>
  </div>
  <p v-else class="text-sm text-muted p-6 text-center">Cargando…</p>
</template>
