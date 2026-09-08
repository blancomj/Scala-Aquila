<script setup lang="ts">
// GOB-5 §4.6: detalle de una decisión — votación/acta que la originan, ejecución calculada desde
// sus compromisos (nunca almacenada), efectos registrados (presupuesto/fondo) y el CRUD de
// compromisos con su bitácora de avances append-only.
import type { Database } from '@aquila/shared'

definePageMeta({ layout: 'default', middleware: ['tenant', 'rbac'], permiso: 'data:read' })

type MiembroConTercero = {
  id: string
  tercero: { primer_nombre: string; primer_apellido: string } | null
}
type TerceroOpcion = { id: string; primer_nombre: string; primer_apellido: string }
type PresupuestoCuentaOpcion = { id: string; codigo: string; nombre: string }
type FondoOpcion = { id: string; nombre: string; codigo: string }
type VotacionOpcion = { id: string; pregunta: string }
type CompromisoConDetalle = ReturnType<typeof useGobiernoDecisionesStore>['compromisos'][number]

const route = useRoute()
const decisionId = route.params.id as string
const tenantStore = useTenantStore()
const decisionesStore = useGobiernoDecisionesStore()
const documentosStore = useDocumentosStore()

const error = ref<string | null>(null)
const miembros = ref<MiembroConTercero[]>([])
const terceros = ref<TerceroOpcion[]>([])
const cuentasPresupuesto = ref<PresupuestoCuentaOpcion[]>([])
const fondos = ref<FondoOpcion[]>([])

async function cargar(): Promise<void> {
  const tenantId = tenantStore.activeTenant?.id
  if (!tenantId) return
  error.value = null
  try {
    await decisionesStore.cargarDecision(decisionId)
    const decision = decisionesStore.decision
    if (!decision) return
    const cliente = useSupabaseClient<Database>()
    const [{ data: miembrosFilas }, { data: tercerosFilas }] = await Promise.all([
      cliente.from('gobierno_miembros').select('id, tercero:tercero_id(primer_nombre, primer_apellido)').eq('organo_id', decision.organo_id),
      cliente.from('terceros').select('id, primer_nombre, primer_apellido').eq('tenant_id', tenantId).order('primer_nombre'),
    ])
    miembros.value = (miembrosFilas ?? []) as MiembroConTercero[]
    terceros.value = (tercerosFilas ?? []).map((t) => ({
      id: t.id, primer_nombre: t.primer_nombre ?? '', primer_apellido: t.primer_apellido ?? '',
    }))
  } catch (excepcion) {
    error.value = mensajeError(excepcion, 'No se pudo cargar la decisión.')
  }
}
onMounted(cargar)
onUnmounted(() => decisionesStore.limpiar())

const estadoColor: Record<string, 'success' | 'error' | 'warning' | 'neutral'> = {
  vigente: 'success', anulada: 'error', revocada: 'neutral', impugnada: 'warning',
}
const semaforoColor: Record<string, 'success' | 'warning' | 'error' | 'neutral'> = {
  en_plazo: 'success', proximo_vencer: 'warning', vencido: 'error', bloqueado: 'error',
}
const estadoCompromisoColor: Record<string, 'neutral' | 'primary' | 'error' | 'success'> = {
  pendiente: 'neutral', en_progreso: 'primary', bloqueado: 'error', cumplido: 'success', cancelado: 'neutral',
}

function nombreResponsable(c: CompromisoConDetalle): string {
  const miembro = c.responsable_miembro?.tercero
  if (miembro) return `${miembro.primer_nombre} ${miembro.primer_apellido} (miembro)`
  if (c.responsable_tercero) return `${c.responsable_tercero.primer_nombre} ${c.responsable_tercero.primer_apellido}`
  return 'La administración'
}

// ── Nuevo compromiso ─────────────────────────────────────────────────────
const drawerCompromisoAbierto = ref(false)
const formCompromiso = reactive({
  titulo: '', descripcion: '', responsableTipo: 'administracion' as 'administracion' | 'miembro' | 'tercero',
  responsableId: null as string | null, fechaLimite: '', montoEstimado: null as number | null,
  presupuestoCuentaId: null as string | null, fondoId: null as string | null,
})
async function abrirNuevoCompromiso(): Promise<void> {
  const tenantId = tenantStore.activeTenant?.id
  if (!tenantId) return
  formCompromiso.titulo = ''
  formCompromiso.descripcion = ''
  formCompromiso.responsableTipo = 'administracion'
  formCompromiso.responsableId = null
  formCompromiso.fechaLimite = ''
  formCompromiso.montoEstimado = null
  formCompromiso.presupuestoCuentaId = null
  formCompromiso.fondoId = null
  if (cuentasPresupuesto.value.length === 0) {
    const presupuestoStore = usePresupuestoStore()
    const cuentas = await presupuestoStore.cargarCuentas(tenantId)
    cuentasPresupuesto.value = cuentas.map((c) => ({ id: c.id, codigo: c.codigo, nombre: c.nombre }))
  }
  if (fondos.value.length === 0) {
    const fondosStore = useFondosStore()
    const filas = await fondosStore.cargarFondos(tenantId)
    fondos.value = filas.map((f) => ({ id: f.id, nombre: f.nombre, codigo: f.codigo }))
  }
  drawerCompromisoAbierto.value = true
}
async function guardarCompromiso(): Promise<void> {
  const tenantId = tenantStore.activeTenant?.id
  if (!tenantId || !decisionesStore.decision || !formCompromiso.titulo.trim()) return
  error.value = null
  try {
    const orden = decisionesStore.compromisos.length + 1
    await decisionesStore.crearCompromiso({
      tenant_id: tenantId, decision_id: decisionesStore.decision.id, orden, titulo: formCompromiso.titulo.trim(),
      descripcion: formCompromiso.descripcion.trim() || null,
      responsable_miembro_id: formCompromiso.responsableTipo === 'miembro' ? formCompromiso.responsableId : null,
      responsable_tercero_id: formCompromiso.responsableTipo === 'tercero' ? formCompromiso.responsableId : null,
      fecha_limite: formCompromiso.fechaLimite || null,
      monto_estimado: formCompromiso.montoEstimado,
      presupuesto_cuenta_id: formCompromiso.presupuestoCuentaId,
      fondo_id: formCompromiso.fondoId,
    })
    drawerCompromisoAbierto.value = false
    await decisionesStore.cargarEjecucion(decisionesStore.decision.id)
  } catch (excepcion) {
    error.value = mensajeError(excepcion, 'No se pudo crear el compromiso.')
  }
}

// ── Detalle de un compromiso: avances y transición de estado ────────────
const compromisoSeleccionadoId = ref<string | null>(null)
const compromisoSeleccionado = computed(() => decisionesStore.compromisos.find((c) => c.id === compromisoSeleccionadoId.value) ?? null)
async function seleccionarCompromiso(id: string): Promise<void> {
  compromisoSeleccionadoId.value = id
  error.value = null
  try {
    await decisionesStore.cargarAvances(id)
  } catch (excepcion) {
    error.value = mensajeError(excepcion, 'No se pudieron cargar los avances.')
  }
}

const formAvance = reactive({ descripcion: '', porcentaje: null as number | null, archivo: null as File | null })
async function registrarAvance(): Promise<void> {
  const tenantId = tenantStore.activeTenant?.id
  const decision = decisionesStore.decision
  const compromiso = compromisoSeleccionado.value
  if (!tenantId || !decision || !compromiso || !formAvance.descripcion.trim()) return
  error.value = null
  try {
    let documentoId: string | null = null
    if (formAvance.archivo) {
      const tipoEvidenciaId = await cargarListaTipos(tenantId, 'TIPO_DOCUMENTO')
        .then((filas) => filas.find((f) => f.codigo === 'evidencia_compromiso')?.id ?? null)
      if (!tipoEvidenciaId) throw new Error('No se encontró el tipo de documento de evidencia.')
      const documento = await documentosStore.subirDocumento({
        tenantId, inmuebleId: null, tipoDocumentoId: tipoEvidenciaId, archivo: formAvance.archivo,
      })
      if (!documento.id) throw new Error('El documento subido no devolvió un id.')
      documentoId = documento.id
    }
    await decisionesStore.registrarAvance({
      tenantId, compromisoId: compromiso.id, decisionId: decision.id,
      fecha: new Date().toISOString().slice(0, 10), descripcion: formAvance.descripcion.trim(),
      porcentaje: formAvance.porcentaje, documentoId,
    })
    formAvance.descripcion = ''
    formAvance.porcentaje = null
    formAvance.archivo = null
    await decisionesStore.cargarEjecucion(decision.id)
  } catch (excepcion) {
    error.value = mensajeError(excepcion, 'No se pudo registrar el avance.')
  }
}

async function cambiarEstadoCompromiso(estado: string, motivo?: string): Promise<void> {
  const decision = decisionesStore.decision
  const compromiso = compromisoSeleccionado.value
  if (!decision || !compromiso) return
  error.value = null
  try {
    const cambios: Record<string, unknown> = { estado }
    if (estado === 'bloqueado') cambios.bloqueado_motivo = motivo
    if (estado === 'cancelado') cambios.cancelado_motivo = motivo
    await decisionesStore.actualizarCompromiso(compromiso.id, decision.id, cambios)
    await decisionesStore.cargarEjecucion(decision.id)
  } catch (excepcion) {
    error.value = mensajeError(excepcion, 'No se pudo actualizar el compromiso.')
  }
}
const motivoTransicion = ref('')

// ── Revocar decisión ─────────────────────────────────────────────────────
const drawerRevocarAbierto = ref(false)
const votacionesDisponibles = ref<VotacionOpcion[]>([])
const votacionRevocatoriaId = ref<string | null>(null)
const tituloRevocatoria = ref('')
async function abrirRevocar(): Promise<void> {
  const tenantId = tenantStore.activeTenant?.id
  if (!tenantId) return
  const cliente = useSupabaseClient<Database>()
  const [{ data: aprobadas }, { data: yaUsadas }] = await Promise.all([
    cliente.from('gobierno_votaciones').select('id, pregunta').eq('tenant_id', tenantId).eq('estado', 'cerrada').eq('resultado', 'aprobada'),
    cliente.from('gobierno_decisiones').select('votacion_id').eq('tenant_id', tenantId),
  ])
  const usadas = new Set((yaUsadas ?? []).map((d) => d.votacion_id))
  votacionesDisponibles.value = (aprobadas ?? []).filter((v) => !usadas.has(v.id))
  votacionRevocatoriaId.value = null
  tituloRevocatoria.value = ''
  drawerRevocarAbierto.value = true
}
async function guardarRevocatoria(): Promise<void> {
  if (!decisionesStore.decision || !votacionRevocatoriaId.value || !tituloRevocatoria.value.trim()) return
  error.value = null
  try {
    const revocatoria = await decisionesStore.revocarDecision(
      decisionesStore.decision.id, votacionRevocatoriaId.value, tituloRevocatoria.value.trim(),
    )
    drawerRevocarAbierto.value = false
    await navigateTo(`/gobierno/decisiones/${revocatoria.id}`)
  } catch (excepcion) {
    error.value = mensajeError(excepcion, 'No se pudo revocar la decisión.')
  }
}
</script>

<template>
  <div class="space-y-6">
    <div v-if="decisionesStore.decision" class="space-y-6">
      <NuxtLink to="/gobierno/decisiones" class="text-xs text-muted hover:underline">← Volver a decisiones</NuxtLink>
      <div class="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 class="text-xl font-semibold">{{ decisionesStore.decision.numero }}/{{ decisionesStore.decision.anio }} · {{ decisionesStore.decision.titulo }}</h1>
          <p class="text-sm text-muted">
            {{ decisionesStore.decision.organo?.nombre }} · {{ decisionesStore.decision.materia?.nombre }}
          </p>
        </div>
        <div class="flex items-center gap-2">
          <UBadge :color="estadoColor[decisionesStore.decision.estado] ?? 'neutral'" variant="soft" size="lg">
            {{ decisionesStore.decision.estado }}
          </UBadge>
          <UButton v-if="decisionesStore.decision.estado === 'vigente'" variant="soft" color="error" size="sm" @click="abrirRevocar()">
            Revocar
          </UButton>
        </div>
      </div>

      <UAlert v-if="error" color="error" variant="soft" :title="error" />

      <p v-if="decisionesStore.decision.descripcion" class="text-sm">{{ decisionesStore.decision.descripcion }}</p>
      <p v-if="decisionesStore.decision.fundamento" class="text-xs text-muted">Fundamento: {{ decisionesStore.decision.fundamento }}</p>

      <!-- Origen: votación / acta -->
      <section class="rounded-lg border border-default p-4 flex flex-wrap items-center gap-4 text-sm">
        <span>Votación: {{ decisionesStore.decision.votacion?.pregunta }}</span>
        <NuxtLink v-if="decisionesStore.decision.acta_id" :to="`/gobierno/actas/${decisionesStore.decision.acta_id}`" class="text-primary hover:underline">
          Ver acta →
        </NuxtLink>
        <span v-else class="text-muted">El acta de esta reunión todavía no existe.</span>
        <NuxtLink v-if="decisionesStore.decision.revoca_decision_id" :to="`/gobierno/decisiones/${decisionesStore.decision.revoca_decision_id}`" class="text-primary hover:underline">
          Revoca otra decisión →
        </NuxtLink>
      </section>

      <!-- Ejecución (calculada) -->
      <section v-if="decisionesStore.ejecucion" class="rounded-lg border border-default p-4 space-y-2">
        <div class="flex items-center justify-between">
          <p class="font-medium">Ejecución</p>
          <div class="flex items-center gap-2">
            <UBadge :color="semaforoColor[decisionesStore.ejecucion.semaforo] ?? 'neutral'" variant="soft">
              {{ decisionesStore.ejecucion.semaforo }}
            </UBadge>
            <UBadge variant="soft">{{ decisionesStore.ejecucion.estado_ejecucion }}</UBadge>
          </div>
        </div>
        <div class="grid gap-3 sm:grid-cols-6 text-sm">
          <div><p class="text-xs text-muted uppercase">Total</p><p class="font-semibold">{{ decisionesStore.ejecucion.total_compromisos }}</p></div>
          <div><p class="text-xs text-muted uppercase">Cumplidos</p><p class="font-semibold">{{ decisionesStore.ejecucion.cumplidos }}</p></div>
          <div><p class="text-xs text-muted uppercase">En progreso</p><p class="font-semibold">{{ decisionesStore.ejecucion.en_progreso }}</p></div>
          <div><p class="text-xs text-muted uppercase">Bloqueados</p><p class="font-semibold">{{ decisionesStore.ejecucion.bloqueados }}</p></div>
          <div><p class="text-xs text-muted uppercase">Vencidos</p><p class="font-semibold">{{ decisionesStore.ejecucion.vencidos }}</p></div>
          <div><p class="text-xs text-muted uppercase">% avance</p><p class="font-semibold">{{ decisionesStore.ejecucion.porcentaje_avance }}%</p></div>
        </div>
      </section>

      <!-- Efectos registrados -->
      <section v-if="decisionesStore.efectos.length > 0" class="rounded-lg border border-default p-4 space-y-2">
        <p class="font-medium">Efectos</p>
        <ul class="text-sm space-y-1">
          <li v-for="ef in decisionesStore.efectos" :key="`${ef.entidad}-${ef.entidad_id}`">
            <span class="text-muted">{{ ef.entidad }}:</span> {{ ef.descripcion }}
          </li>
        </ul>
      </section>

      <!-- Impugnación (GOB-7 §4.4) -->
      <GobiernoImpugnacionSeccion
        v-if="tenantStore.activeTenant"
        :objeto-tipo="'decision'" :objeto-id="decisionId" :tenant-id="tenantStore.activeTenant.id"
        :impugnable="decisionesStore.decision.estado === 'vigente'"
      />

      <!-- Compromisos -->
      <section class="rounded-lg border border-default p-4 space-y-2">
        <div class="flex items-center justify-between">
          <p class="font-medium">Compromisos</p>
          <UButton size="xs" variant="ghost" icon="i-lucide-plus" @click="abrirNuevoCompromiso()">Nuevo compromiso</UButton>
        </div>
        <ul class="space-y-1 text-sm">
          <li
            v-for="c in decisionesStore.compromisos" :key="c.id"
            class="flex items-center justify-between gap-2 rounded p-1 cursor-pointer"
            :class="{ 'bg-elevated': compromisoSeleccionadoId === c.id }"
            @click="seleccionarCompromiso(c.id)"
          >
            <span>{{ c.orden }}. {{ c.titulo }} · {{ nombreResponsable(c) }}<span v-if="c.fecha_limite"> · vence {{ c.fecha_limite }}</span></span>
            <UBadge :color="estadoCompromisoColor[c.estado] ?? 'neutral'" variant="soft" size="xs">{{ c.estado }}</UBadge>
          </li>
        </ul>
        <p v-if="decisionesStore.compromisos.length === 0" class="text-sm text-muted">Sin compromisos todavía.</p>

        <div v-if="compromisoSeleccionado" class="pt-3 mt-2 border-t border-default space-y-3">
          <p class="font-medium">{{ compromisoSeleccionado.titulo }}</p>
          <p v-if="compromisoSeleccionado.descripcion" class="text-sm text-muted">{{ compromisoSeleccionado.descripcion }}</p>

          <div class="flex flex-wrap gap-2">
            <UButton size="xs" :disabled="compromisoSeleccionado.estado === 'en_progreso'" @click="cambiarEstadoCompromiso('en_progreso')">En progreso</UButton>
            <UButton size="xs" color="success" :disabled="compromisoSeleccionado.estado === 'cumplido'" @click="cambiarEstadoCompromiso('cumplido')">Cumplido</UButton>
            <UInput v-model="motivoTransicion" size="xs" placeholder="Motivo (bloqueo/cancelación)" />
            <UButton size="xs" color="warning" variant="soft" :disabled="!motivoTransicion.trim()" @click="cambiarEstadoCompromiso('bloqueado', motivoTransicion)">Bloquear</UButton>
            <UButton size="xs" color="error" variant="soft" :disabled="!motivoTransicion.trim()" @click="cambiarEstadoCompromiso('cancelado', motivoTransicion)">Cancelar</UButton>
          </div>

          <p class="text-xs text-muted">
            Cumplido exige al menos un avance con evidencia (documento adjunto) — art. 47/51,
            regla 1 del prompt original.
          </p>

          <div class="space-y-1">
            <p class="text-xs font-medium uppercase text-muted">Avances</p>
            <ul class="text-sm space-y-1">
              <li v-for="a in decisionesStore.avances" :key="a.id">
                {{ a.fecha }} · {{ a.descripcion }}<span v-if="a.porcentaje !== null"> · {{ a.porcentaje }}%</span>
                <span v-if="a.documento_id" class="text-success"> · con evidencia</span>
              </li>
            </ul>
            <p v-if="decisionesStore.avances.length === 0" class="text-xs text-muted">Sin avances todavía.</p>
          </div>

          <div class="grid gap-2 sm:grid-cols-3 items-end">
            <UFormField label="Descripción del avance" class="sm:col-span-2">
              <UInput v-model="formAvance.descripcion" class="w-full" />
            </UFormField>
            <UFormField label="% avance">
              <UInput v-model.number="formAvance.porcentaje" type="number" class="w-full" />
            </UFormField>
            <UFormField label="Evidencia (opcional)" class="sm:col-span-2">
              <input type="file" @change="(e) => (formAvance.archivo = (e.target as HTMLInputElement).files?.[0] ?? null)">
            </UFormField>
            <UButton :loading="decisionesStore.guardando" :disabled="!formAvance.descripcion.trim()" @click="registrarAvance()">
              Registrar avance
            </UButton>
          </div>
        </div>
      </section>
    </div>
    <p v-else-if="!decisionesStore.loading" class="text-sm text-muted">Decisión no encontrada.</p>

    <UiDrawer :abierto="drawerCompromisoAbierto" titulo="Nuevo compromiso" @cerrar="drawerCompromisoAbierto = false">
      <div class="space-y-3">
        <UFormField label="Título" name="titulo"><UInput v-model="formCompromiso.titulo" class="w-full" /></UFormField>
        <UFormField label="Descripción" name="descripcion"><UTextarea v-model="formCompromiso.descripcion" class="w-full" /></UFormField>
        <UFormField label="Responsable" name="responsableTipo">
          <USelect
            v-model="formCompromiso.responsableTipo"
            :items="[
              { label: 'La administración', value: 'administracion' },
              { label: 'Miembro de un órgano', value: 'miembro' },
              { label: 'Tercero (proveedor, profesional)', value: 'tercero' },
            ]"
          />
        </UFormField>
        <UFormField v-if="formCompromiso.responsableTipo === 'miembro'" label="Miembro" name="responsableId">
          <UiSelectorBuscable
            v-model="formCompromiso.responsableId"
            :opciones="miembros.map((m) => ({ valor: m.id, etiqueta: m.tercero ? `${m.tercero.primer_nombre} ${m.tercero.primer_apellido}` : m.id }))"
          />
        </UFormField>
        <UFormField v-if="formCompromiso.responsableTipo === 'tercero'" label="Tercero" name="responsableId">
          <UiSelectorBuscable
            v-model="formCompromiso.responsableId"
            :opciones="terceros.map((t) => ({ valor: t.id, etiqueta: `${t.primer_nombre} ${t.primer_apellido}` }))"
          />
        </UFormField>
        <UFormField label="Fecha límite" name="fechaLimite"><UInput v-model="formCompromiso.fechaLimite" type="date" class="w-full" /></UFormField>
        <UFormField label="Monto estimado (opcional)" name="montoEstimado">
          <UInput v-model.number="formCompromiso.montoEstimado" type="number" class="w-full" />
        </UFormField>
        <UFormField label="Cuenta presupuestal (opcional)" name="presupuestoCuentaId">
          <UiSelectorBuscable
            v-model="formCompromiso.presupuestoCuentaId"
            :opciones="cuentasPresupuesto.map((c) => ({ valor: c.id, etiqueta: `${c.codigo} · ${c.nombre}` }))"
          />
        </UFormField>
        <UFormField label="Fondo (opcional)" name="fondoId">
          <UiSelectorBuscable
            v-model="formCompromiso.fondoId"
            :opciones="fondos.map((f) => ({ valor: f.id, etiqueta: `${f.codigo} · ${f.nombre}` }))"
          />
        </UFormField>
      </div>
      <template #foot>
        <div class="flex justify-end gap-2 w-full">
          <UButton variant="ghost" @click="drawerCompromisoAbierto = false">Cancelar</UButton>
          <UButton :loading="decisionesStore.guardando" :disabled="!formCompromiso.titulo.trim()" @click="guardarCompromiso()">
            Crear compromiso
          </UButton>
        </div>
      </template>
    </UiDrawer>

    <UiDrawer :abierto="drawerRevocarAbierto" titulo="Revocar decisión" @cerrar="drawerRevocarAbierto = false">
      <div class="space-y-3">
        <p class="text-sm text-muted">
          Revocar exige una decisión nueva, adoptada por una votación cerrada y aprobada, que
          enlaza a esta como revocada.
        </p>
        <UFormField label="Votación revocatoria" name="votacionRevocatoriaId">
          <UiSelectorBuscable
            v-model="votacionRevocatoriaId"
            :opciones="votacionesDisponibles.map((v) => ({ valor: v.id, etiqueta: v.pregunta }))"
            placeholder="Votación cerrada y aprobada, sin decisión todavía"
          />
        </UFormField>
        <UFormField label="Título de la decisión revocatoria" name="tituloRevocatoria">
          <UInput v-model="tituloRevocatoria" class="w-full" />
        </UFormField>
      </div>
      <template #foot>
        <div class="flex justify-end gap-2 w-full">
          <UButton variant="ghost" @click="drawerRevocarAbierto = false">Cancelar</UButton>
          <UButton
            color="error" :loading="decisionesStore.guardando" :disabled="!votacionRevocatoriaId || !tituloRevocatoria.trim()"
            @click="guardarRevocatoria()"
          >
            Revocar
          </UButton>
        </div>
      </template>
    </UiDrawer>
  </div>
</template>
