<script setup lang="ts">
// CO-9 · Rendición de cuentas (§4.7): flujo guiado por pasos — cerrar ejercicio → certificar →
// dictaminar (solo si aplica) → presentar → registrar aprobación. Los pasos no aplicables (sin
// revisor fiscal obligatorio) no se muestran, no se muestran deshabilitados.
import type { Database } from '@aquila/shared'

definePageMeta({ layout: 'default', middleware: ['tenant', 'rbac'], permiso: 'data:read' })

type TipoOpinion = 'limpia' | 'con_salvedades' | 'adversa' | 'abstencion'
const OPCIONES_OPINION: { label: string; value: TipoOpinion }[] = [
  { label: 'Limpia (sin salvedades)', value: 'limpia' },
  { label: 'Con salvedades', value: 'con_salvedades' },
  { label: 'Adversa', value: 'adversa' },
  { label: 'Abstención de opinión', value: 'abstencion' },
]
const OPCIONES_ESTADO = [
  { label: 'Situación financiera', value: 'estado_situacion_financiera' },
  { label: 'Resultados', value: 'estado_resultados' },
  { label: 'Cambios en el patrimonio', value: 'estado_cambios_patrimonio' },
  { label: 'Flujos de efectivo', value: 'estado_flujos_efectivo' },
]

const tenantStore = useTenantStore()
const copropiedadStore = useCopropiedadStore()
const cierresStore = useCierresStore()
const rendicionStore = useContableRendicionStore()
const documentosStore = useDocumentosStore()
const tercerosStore = useTercerosStore()

const error = ref<string | null>(null)
const aviso = ref<string | null>(null)
const ejercicio = ref(new Date().getFullYear())
const terceros = ref<{ valor: string; etiqueta: string }[]>([])
const tiposDocumento = ref<{ id: number; codigo: string; nombre: string }[]>([])

const usoEconomico = computed(() => copropiedadStore.tenant?.uso_economico ?? null)
const tieneRevisorFiscal = computed(() => copropiedadStore.tenant?.tiene_revisor_fiscal ?? false)
const revisorFiscalObligatorio = computed(
  () => usoEconomico.value === 'comercial' || usoEconomico.value === 'mixto' || tieneRevisorFiscal.value,
)

async function cargar(): Promise<void> {
  const tenantId = tenantStore.activeTenant?.id
  if (!tenantId) return
  error.value = null
  try {
    await Promise.all([
      copropiedadStore.cargarTenant(tenantId),
      cierresStore.cargarPeriodos(tenantId, ejercicio.value),
      rendicionStore.cargar(tenantId, ejercicio.value),
      rendicionStore.cargarDocumentosProximosVencer(tenantId),
    ])
    const [listaTerceros, tipos] = await Promise.all([
      tercerosStore.cargarTerceros(tenantId),
      cargarListaTipos(tenantId, 'TIPO_DOCUMENTO'),
    ])
    terceros.value = listaTerceros.map((t) => ({ valor: t.id, etiqueta: t.nombre_completo ?? '(sin nombre)' }))
    tiposDocumento.value = tipos.map((t) => ({ id: t.id, codigo: t.codigo, nombre: t.nombre }))
  } catch (e) {
    error.value = mensajeError(e, 'No se pudo cargar la rendición de cuentas.')
  }
}
watch(ejercicio, () => { void cargar() })
onMounted(() => { void cargar() })

const ejercicioCerrado = computed(() => {
  const periodos = cierresStore.periodos
  return periodos.length === 12 && periodos.every((p) => p.contable_estado === 'bloqueado')
})

const certificacionVigente = computed(() => rendicionStore.certificaciones.find((c) => !c.invalidada) ?? null)
const dictamenDeLaVigente = computed(() => null as Database['public']['Tables']['contable_dictamen']['Row'] | null)

// ── Certificar ──────────────────────────────────────────────────────────
const drawerCertificarAbierto = ref(false)
const formCertificar = reactive({
  fechaCorte: `${String(ejercicio.value)}-12-31`,
  estadosIncluidos: ['estado_situacion_financiera'] as string[],
  administradorDocumento: '',
  textoCertificacion: 'Certifico que he verificado previamente las afirmaciones contenidas en los '
    + 'estados financieros y que las mismas se han tomado fielmente de los libros (Ley 222 de 1995 art. 37).',
  contadorTerceroId: null as string | null,
  contadorTarjetaProfesional: '',
})
watch(ejercicio, (v) => { formCertificar.fechaCorte = `${String(v)}-12-31` })

async function certificar(): Promise<void> {
  const tenantId = tenantStore.activeTenant?.id
  if (!tenantId) return
  error.value = null
  try {
    await rendicionStore.certificar({
      tenantId, ejercicio: ejercicio.value, fechaCorte: formCertificar.fechaCorte,
      estadosIncluidos: formCertificar.estadosIncluidos, administradorDocumento: formCertificar.administradorDocumento,
      textoCertificacion: formCertificar.textoCertificacion, contadorTerceroId: formCertificar.contadorTerceroId,
      contadorTarjetaProfesional: formCertificar.contadorTarjetaProfesional || null,
    })
    drawerCertificarAbierto.value = false
    aviso.value = 'Certificación emitida.'
  } catch (e) {
    error.value = mensajeError(e, 'No se pudo certificar los estados financieros.')
  }
}

async function invalidar(motivo: string): Promise<void> {
  const tenantId = tenantStore.activeTenant?.id
  if (!tenantId || !certificacionVigente.value) return
  error.value = null
  try {
    await rendicionStore.invalidarCertificacion(tenantId, ejercicio.value, motivo)
  } catch (e) {
    error.value = mensajeError(e, 'No se pudo invalidar la certificación.')
  }
}

// ── Dictamen ────────────────────────────────────────────────────────────
const drawerDictamenAbierto = ref(false)
const formDictamen = reactive({
  revisorFiscalTerceroId: null as string | null,
  tipoOpinion: 'limpia' as TipoOpinion,
  texto: '',
  fecha: new Date().toISOString().slice(0, 10),
})

async function registrarDictamen(): Promise<void> {
  const tenantId = tenantStore.activeTenant?.id
  if (!tenantId || !certificacionVigente.value || !formDictamen.revisorFiscalTerceroId) return
  error.value = null
  try {
    await rendicionStore.registrarDictamen({
      tenantId, ejercicio: ejercicio.value, certificacionId: certificacionVigente.value.id,
      revisorFiscalTerceroId: formDictamen.revisorFiscalTerceroId, tipoOpinionCodigo: formDictamen.tipoOpinion,
      texto: formDictamen.texto, fecha: formDictamen.fecha,
    })
    drawerDictamenAbierto.value = false
    aviso.value = 'Dictamen registrado.'
  } catch (e) {
    error.value = mensajeError(e, 'No se pudo registrar el dictamen.')
  }
}

// ── Rendición ───────────────────────────────────────────────────────────
const drawerRendicionAbierto = ref(false)
const formRendicion = reactive({
  periodoDesde: `${String(ejercicio.value)}-01-01`,
  periodoHasta: `${String(ejercicio.value)}-12-31`,
  dictamenId: null as string | null,
})
const drawerPresentarId = ref<string | null>(null)
const formPresentar = reactive({ actaReferenciaTexto: '', decisionId: '' })

async function crearRendicion(): Promise<void> {
  const tenantId = tenantStore.activeTenant?.id
  if (!tenantId || !certificacionVigente.value) return
  error.value = null
  try {
    await rendicionStore.crearRendicion({
      tenantId, ejercicio: ejercicio.value, periodoDesde: formRendicion.periodoDesde,
      periodoHasta: formRendicion.periodoHasta, certificacionId: certificacionVigente.value.id,
      dictamenId: formRendicion.dictamenId,
    })
    drawerRendicionAbierto.value = false
    aviso.value = 'Rendición creada en borrador.'
  } catch (e) {
    error.value = mensajeError(e, 'No se pudo crear la rendición.')
  }
}

async function presentar(id: string): Promise<void> {
  const tenantId = tenantStore.activeTenant?.id
  if (!tenantId) return
  error.value = null
  try {
    await rendicionStore.presentarRendicion({
      tenantId, ejercicio: ejercicio.value, id,
      decisionId: formPresentar.decisionId.trim() || null,
      actaReferenciaTexto: formPresentar.decisionId.trim() ? null : formPresentar.actaReferenciaTexto.trim() || null,
    })
    drawerPresentarId.value = null
    aviso.value = 'Rendición presentada.'
  } catch (e) {
    error.value = mensajeError(e, 'No se pudo presentar la rendición.')
  }
}

async function aprobar(id: string): Promise<void> {
  const tenantId = tenantStore.activeTenant?.id
  if (!tenantId) return
  error.value = null
  try {
    await rendicionStore.aprobarRendicion(tenantId, ejercicio.value, id)
    aviso.value = 'Rendición aprobada — el ejercicio queda bloqueado.'
  } catch (e) {
    error.value = mensajeError(e, 'No se pudo aprobar la rendición.')
  }
}

const motivoRechazo = ref('')
const drawerRechazarId = ref<string | null>(null)
async function rechazar(id: string): Promise<void> {
  const tenantId = tenantStore.activeTenant?.id
  if (!tenantId) return
  error.value = null
  try {
    await rendicionStore.rechazarRendicion(tenantId, ejercicio.value, id, motivoRechazo.value)
    drawerRechazarId.value = null
    motivoRechazo.value = ''
  } catch (e) {
    error.value = mensajeError(e, 'No se pudo rechazar la rendición.')
  }
}

// ── Documento (PDF del paquete, subido y firmado) + enlace de consulta ───
const archivoRendicion = ref<Record<string, File | null>>({})
async function subirDocumentoRendicion(id: string): Promise<void> {
  const tenantId = tenantStore.activeTenant?.id
  const archivo = archivoRendicion.value[id]
  if (!tenantId || !archivo) return
  error.value = null
  try {
    const tipoId = tiposDocumento.value.find((t) => t.codigo === 'rendicion_cuentas')?.id
    if (!tipoId) throw new Error('Falta el tipo de documento rendicion_cuentas.')
    const documento = await documentosStore.subirDocumento({ tenantId, inmuebleId: null, tipoDocumentoId: tipoId, archivo })
    if (!documento.id) throw new Error('El documento subido no devolvió un id.')
    await rendicionStore.vincularDocumentoRendicion(tenantId, ejercicio.value, id, documento.id)
    archivoRendicion.value[id] = null
  } catch (e) {
    error.value = mensajeError(e, 'No se pudo subir el documento de la rendición.')
  }
}

const enlaceGenerado = ref<{ token: string; expira_en: string } | null>(null)
async function generarEnlace(documentoId: string | null): Promise<void> {
  if (!documentoId) return
  error.value = null
  try {
    enlaceGenerado.value = await rendicionStore.generarEnlaceConsulta(documentoId)
  } catch (e) {
    error.value = mensajeError(e, 'No se pudo generar el enlace de consulta.')
  }
}

// ── Conservación documental ───────────────────────────────────────────
const nuevaPolitica = reactive({ tipoDocumentoId: null as number | null, plazoAnios: 5 })
async function definirPolitica(): Promise<void> {
  const tenantId = tenantStore.activeTenant?.id
  if (!tenantId || !nuevaPolitica.tipoDocumentoId) return
  error.value = null
  try {
    await rendicionStore.definirPoliticaConservacion(tenantId, nuevaPolitica.tipoDocumentoId, nuevaPolitica.plazoAnios)
    aviso.value = 'Plazo de conservación guardado.'
  } catch (e) {
    error.value = mensajeError(e, 'No se pudo guardar el plazo de conservación.')
  }
}
async function protegerConHold(documentoId: string, grupoId: string, motivo: string): Promise<void> {
  const tenantId = tenantStore.activeTenant?.id
  if (!tenantId) return
  error.value = null
  try {
    await rendicionStore.activarLegalHold(tenantId, grupoId, motivo)
  } catch (e) {
    error.value = mensajeError(e, 'No se pudo activar la retención legal.')
  }
}
void protegerConHold // referenciada desde el template
</script>

<template>
  <div class="max-w-4xl space-y-6">
    <UiTituloDescripcion>
      <template #titulo>
        <h1 class="text-xl font-semibold">Rendición de cuentas</h1>
      </template>
      <template #descripcion>
        Certificación de estados financieros (Ley 222 art. 37), dictamen del revisor fiscal cuando
        aplica y presentación a la asamblea (Ley 675 art. 51) — el paquete que se anexa al acta.
      </template>
    </UiTituloDescripcion>

    <UAlert v-if="error" color="error" variant="soft" :title="error" @close="error = null" />
    <UAlert v-if="aviso" color="success" variant="soft" :title="aviso" @close="aviso = null" />

    <UFormField label="Ejercicio">
      <UInput v-model.number="ejercicio" type="number" class="w-32" />
    </UFormField>

    <!-- Paso 1: ejercicio cerrado -->
    <div class="rounded-md border border-default p-4 flex items-center justify-between">
      <div>
        <p class="font-medium">1. Cerrar el ejercicio</p>
        <p class="text-sm text-muted">Los 12 periodos deben quedar bloqueados (CO-6) antes de certificar.</p>
      </div>
      <UBadge v-if="ejercicioCerrado" color="success" variant="subtle">Cerrado</UBadge>
      <UButton v-else to="/contabilidad/cierres" variant="soft">Ir a cierres</UButton>
    </div>

    <!-- Paso 2: certificar -->
    <div v-if="ejercicioCerrado" class="rounded-md border border-default p-4 space-y-3">
      <div class="flex items-center justify-between">
        <p class="font-medium">2. Certificar estados financieros</p>
        <UButton v-if="!certificacionVigente" @click="drawerCertificarAbierto = true">Certificar</UButton>
      </div>
      <div v-if="certificacionVigente" class="text-sm space-y-1">
        <p>Certificado por {{ certificacionVigente.administrador_nombre }} el {{ certificacionVigente.certificado_at.slice(0, 10) }}</p>
        <p v-if="certificacionVigente.contador_nombre" class="text-muted">Contador: {{ certificacionVigente.contador_nombre }}</p>
        <p class="font-mono text-xs text-muted break-all">Hash: {{ certificacionVigente.hash_contenido }}</p>
        <UButton size="xs" color="error" variant="soft" @click="invalidar('Invalidada manualmente desde la ficha de rendición')">
          Invalidar certificación
        </UButton>
      </div>
      <ul v-if="rendicionStore.certificaciones.some((c) => c.invalidada)" class="text-xs text-muted space-y-1">
        <li v-for="c in rendicionStore.certificaciones.filter((c) => c.invalidada)" :key="c.id">
          Invalidada el {{ c.invalidada_at?.slice(0, 10) }} — {{ c.invalidada_motivo }}
        </li>
      </ul>
    </div>

    <!-- Paso 3: dictamen (solo si aplica) -->
    <div v-if="certificacionVigente && revisorFiscalObligatorio" class="rounded-md border border-default p-4 space-y-3">
      <div class="flex items-center justify-between">
        <p class="font-medium">3. Dictamen del revisor fiscal</p>
        <UButton variant="soft" @click="drawerDictamenAbierto = true">Registrar dictamen</UButton>
      </div>
      <p class="text-sm text-muted">
        Obligatorio para este tenant ({{ usoEconomico === 'residencial' ? 'marcado manualmente' : `uso ${usoEconomico}` }}, Ley 675 art. 56).
      </p>
      <p v-if="dictamenDeLaVigente" class="text-sm">Ya registrado.</p>
    </div>

    <!-- Paso 4: rendición -->
    <div v-if="certificacionVigente" class="rounded-md border border-default p-4 space-y-3">
      <div class="flex items-center justify-between">
        <p class="font-medium">4. Presentar y aprobar</p>
        <UButton variant="soft" @click="drawerRendicionAbierto = true">Nueva rendición</UButton>
      </div>
      <p v-if="rendicionStore.rendiciones.length === 0" class="text-sm text-muted">Sin rendiciones para este ejercicio.</p>
      <div v-for="fila in rendicionStore.rendiciones" :key="fila.id" class="rounded border border-default p-3 space-y-2">
        <div class="flex items-center justify-between">
          <UBadge
            :color="fila.estado === 'aprobada' ? 'success' : fila.estado === 'rechazada' ? 'error' : 'neutral'"
            variant="subtle"
          >
            {{ fila.estado }}
          </UBadge>
          <span class="text-xs text-muted">Creada {{ fila.created_at.slice(0, 10) }}</span>
        </div>
        <div class="flex flex-wrap gap-2">
          <UButton v-if="fila.estado === 'borrador'" size="xs" @click="drawerPresentarId = fila.id">Presentar</UButton>
          <UButton v-if="fila.estado === 'presentada'" size="xs" color="success" @click="aprobar(fila.id)">Aprobar</UButton>
          <UButton v-if="fila.estado === 'presentada'" size="xs" color="error" variant="soft" @click="drawerRechazarId = fila.id">Rechazar</UButton>
          <label v-if="!fila.documento_id" class="text-xs flex items-center gap-1">
            <input type="file" class="text-xs" @change="(e) => (archivoRendicion[fila.id] = (e.target as HTMLInputElement).files?.[0] ?? null)">
          </label>
          <UButton v-if="archivoRendicion[fila.id]" size="xs" variant="soft" @click="subirDocumentoRendicion(fila.id)">Subir PDF</UButton>
          <UButton v-if="fila.documento_id" size="xs" variant="ghost" @click="generarEnlace(fila.documento_id)">Enlace de consulta</UButton>
        </div>
      </div>
      <p v-if="enlaceGenerado" class="text-xs text-muted break-all">
        Enlace válido hasta {{ enlaceGenerado.expira_en }} — token: {{ enlaceGenerado.token }}
      </p>
    </div>

    <!-- Conservación documental -->
    <div class="rounded-md border border-default p-4 space-y-3">
      <p class="font-medium">Conservación documental</p>
      <p class="text-sm text-muted">
        Plazo sugerido por el Estatuto Tributario art. 632: 5 años desde el 1 de enero del año
        siguiente a la elaboración del documento. Nunca se purga automáticamente.
      </p>
      <div class="flex gap-2 items-end">
        <UFormField label="Tipo de documento" class="flex-1">
          <USelect
            :model-value="nuevaPolitica.tipoDocumentoId ?? undefined"
            :items="tiposDocumento.map((t) => ({ label: t.nombre, value: t.id }))"
            class="w-full"
            @update:model-value="(v) => (nuevaPolitica.tipoDocumentoId = (v as number) ?? null)"
          />
        </UFormField>
        <UFormField label="Plazo (años)">
          <UInput v-model.number="nuevaPolitica.plazoAnios" type="number" class="w-24" />
        </UFormField>
        <UButton @click="definirPolitica">Guardar</UButton>
      </div>
      <ul v-if="rendicionStore.documentosProximosVencer.length" class="text-sm space-y-1">
        <li v-for="d in rendicionStore.documentosProximosVencer" :key="d.documento_id" class="flex items-center justify-between">
          <span>{{ d.tipo_documento }} — vence {{ d.fecha_limite }} ({{ d.dias_restantes }} días)</span>
          <UBadge v-if="d.bajo_legal_hold" color="warning" variant="subtle">Bajo retención legal</UBadge>
        </li>
      </ul>
    </div>

    <!-- Drawer certificar -->
    <UiDrawer :abierto="drawerCertificarAbierto" titulo="Certificar estados financieros" @cerrar="drawerCertificarAbierto = false">
      <div class="space-y-4">
        <UFormField label="Fecha de corte">
          <UInput v-model="formCertificar.fechaCorte" type="date" class="w-full" />
        </UFormField>
        <UFormField label="Estados incluidos">
          <div class="space-y-1">
            <UCheckbox
              v-for="op in OPCIONES_ESTADO" :key="op.value" :model-value="formCertificar.estadosIncluidos.includes(op.value)"
              :label="op.label"
              @update:model-value="(v) => {
                formCertificar.estadosIncluidos = v
                  ? [...formCertificar.estadosIncluidos, op.value]
                  : formCertificar.estadosIncluidos.filter((c) => c !== op.value)
              }"
            />
          </div>
        </UFormField>
        <UFormField label="Documento de identidad del administrador">
          <UInput v-model="formCertificar.administradorDocumento" class="w-full" />
        </UFormField>
        <UFormField label="Contador (opcional)">
          <UiSelectorBuscable v-model="formCertificar.contadorTerceroId" :opciones="terceros" placeholder="Sin contador" />
        </UFormField>
        <UFormField v-if="formCertificar.contadorTerceroId" label="Tarjeta profesional del contador">
          <UInput v-model="formCertificar.contadorTarjetaProfesional" class="w-full" />
        </UFormField>
        <UFormField label="Texto de certificación">
          <UTextarea v-model="formCertificar.textoCertificacion" :rows="4" class="w-full" />
        </UFormField>
        <UButton :loading="rendicionStore.guardando" @click="certificar">Certificar</UButton>
      </div>
    </UiDrawer>

    <!-- Drawer dictamen -->
    <UiDrawer :abierto="drawerDictamenAbierto" titulo="Registrar dictamen del revisor fiscal" @cerrar="drawerDictamenAbierto = false">
      <div class="space-y-4">
        <UFormField label="Revisor fiscal">
          <UiSelectorBuscable v-model="formDictamen.revisorFiscalTerceroId" :opciones="terceros" />
        </UFormField>
        <UFormField label="Tipo de opinión">
          <USelect v-model="formDictamen.tipoOpinion" :items="OPCIONES_OPINION" class="w-full" />
        </UFormField>
        <UFormField label="Fecha">
          <UInput v-model="formDictamen.fecha" type="date" class="w-full" />
        </UFormField>
        <UFormField label="Texto del dictamen">
          <UTextarea v-model="formDictamen.texto" :rows="4" class="w-full" />
        </UFormField>
        <UButton :loading="rendicionStore.guardando" @click="registrarDictamen">Registrar</UButton>
      </div>
    </UiDrawer>

    <!-- Drawer rendición -->
    <UiDrawer :abierto="drawerRendicionAbierto" titulo="Nueva rendición de cuentas" @cerrar="drawerRendicionAbierto = false">
      <div class="space-y-4">
        <UFormField label="Periodo desde">
          <UInput v-model="formRendicion.periodoDesde" type="date" class="w-full" />
        </UFormField>
        <UFormField label="Periodo hasta">
          <UInput v-model="formRendicion.periodoHasta" type="date" class="w-full" />
        </UFormField>
        <UButton :loading="rendicionStore.guardando" @click="crearRendicion">Crear borrador</UButton>
      </div>
    </UiDrawer>

    <!-- Drawer presentar -->
    <UiDrawer :abierto="drawerPresentarId !== null" titulo="Presentar rendición" @cerrar="drawerPresentarId = null">
      <div class="space-y-4">
        <UFormField
          label="Decisión de gobierno (UUID)"
          description="Si la asamblea ya está registrada en el módulo de gobierno, referencia su decisión."
        >
          <UInput v-model="formPresentar.decisionId" class="w-full" />
        </UFormField>
        <UFormField v-if="!formPresentar.decisionId.trim()" label="Referencia del acta (texto libre)">
          <UInput v-model="formPresentar.actaReferenciaTexto" class="w-full" />
        </UFormField>
        <UButton :loading="rendicionStore.guardando" @click="drawerPresentarId && presentar(drawerPresentarId)">Presentar</UButton>
      </div>
    </UiDrawer>

    <!-- Drawer rechazar -->
    <UiDrawer :abierto="drawerRechazarId !== null" titulo="Rechazar rendición" @cerrar="drawerRechazarId = null">
      <div class="space-y-4">
        <UFormField label="Motivo">
          <UTextarea v-model="motivoRechazo" :rows="3" class="w-full" />
        </UFormField>
        <UButton color="error" :loading="rendicionStore.guardando" @click="drawerRechazarId && rechazar(drawerRechazarId)">
          Rechazar
        </UButton>
      </div>
    </UiDrawer>
  </div>
</template>
