<script setup lang="ts">
// GOB-8 §4.6: bandeja de la administración (ordenada por urgencia de SLA), configuración de SLA
// por tipo/categoría/prioridad, y panel de tokens de consulta por inmueble (generación + revocación).
// AD-26 (Opción 1): no hay bandeja personal del propietario/residente — solo la administración
// registra solicitudes aquí; el residente solo consulta por el enlace de token (§4.4).
import type { Database } from '@aquila/shared'

definePageMeta({ layout: 'default', middleware: ['tenant', 'rbac'], permiso: 'data:read' })

type InmuebleOpcion = { id: string; codigo: string }
type TerceroOpcion = { id: string; primer_nombre: string; primer_apellido: string }
type OpcionTipo = { id: number; codigo: string; nombre: string }

const tenantStore = useTenantStore()
const atencionStore = useGobiernoAtencionStore()

const error = ref<string | null>(null)
const pestana = ref<'bandeja' | 'sla' | 'tokens'>('bandeja')
const inmuebles = ref<InmuebleOpcion[]>([])
const terceros = ref<TerceroOpcion[]>([])
const tiposSolicitud = ref<OpcionTipo[]>([])
const categorias = ref<OpcionTipo[]>([])
const origenes = ref<OpcionTipo[]>([])
const prioridades = ref<OpcionTipo[]>([])

async function cargar(): Promise<void> {
  const tenantId = tenantStore.activeTenant?.id
  if (!tenantId) return
  error.value = null
  try {
    const cliente = useSupabaseClient<Database>()
    const [{ data: inmueblesFilas }, { data: tercerosFilas }, tipos, cats, orig, prio] = await Promise.all([
      cliente.from('inmuebles').select('id, codigo').eq('tenant_id', tenantId).order('codigo'),
      cliente.from('terceros').select('id, primer_nombre, primer_apellido').eq('tenant_id', tenantId).order('primer_nombre'),
      cargarListaTipos(tenantId, 'TIPO_SOLICITUD'),
      cargarListaTipos(tenantId, 'CATEGORIA_SOLICITUD'),
      cargarListaTipos(tenantId, 'ORIGEN_SOLICITUD'),
      cargarListaTipos(tenantId, 'PRIORIDAD_SOLICITUD'),
      atencionStore.cargarSolicitudes(tenantId),
      atencionStore.cargarConfiguracionesSla(tenantId),
      atencionStore.cargarTokens(tenantId),
    ])
    inmuebles.value = inmueblesFilas ?? []
    terceros.value = (tercerosFilas ?? []).map((t) => ({
      id: t.id, primer_nombre: t.primer_nombre ?? '', primer_apellido: t.primer_apellido ?? '',
    }))
    tiposSolicitud.value = tipos
    categorias.value = cats
    origenes.value = orig
    prioridades.value = prio
  } catch (excepcion) {
    error.value = mensajeError(excepcion, 'No se pudo cargar la información de atención.')
  }
}
onMounted(cargar)

const estadoColor: Record<string, 'neutral' | 'primary' | 'warning' | 'success' | 'error'> = {
  nueva: 'neutral', asignada: 'primary', en_atencion: 'primary', en_espera: 'warning',
  resuelta: 'success', cerrada: 'success', anulada: 'error',
}

/** Orden por urgencia de SLA (§4.6): sin SLA al final; vencida primero, luego la que vence antes. */
const solicitudesOrdenadas = computed(() => {
  const abiertas = atencionStore.solicitudes.filter((s) => !['cerrada', 'anulada'].includes(s.estado))
  return [...abiertas].sort((a, b) => {
    if (!a.sla_vence_at && !b.sla_vence_at) return 0
    if (!a.sla_vence_at) return 1
    if (!b.sla_vence_at) return -1
    return new Date(a.sla_vence_at).getTime() - new Date(b.sla_vence_at).getTime()
  })
})
function vencida(s: { sla_vence_at: string | null }): boolean {
  return !!s.sla_vence_at && new Date(s.sla_vence_at).getTime() < Date.now()
}

// ── nueva solicitud ──────────────────────────────────────────────────────
const drawerAbierto = ref(false)
const form = reactive({
  tipoId: null as number | null, categoriaId: null as number | null, origenId: null as number | null,
  prioridadId: null as number | null, solicitanteRef: null as string | null, inmuebleId: null as string | null,
  calidad: 'propietario' as 'propietario' | 'tenedor' | 'tercero', asunto: '', descripcion: '',
})
function abrirNueva(): void {
  form.tipoId = null; form.categoriaId = null; form.origenId = null; form.prioridadId = null
  form.solicitanteRef = null; form.inmuebleId = null; form.calidad = 'propietario'
  form.asunto = ''; form.descripcion = ''
  drawerAbierto.value = true
}
const formValido = computed(() => (
  form.tipoId && form.categoriaId && form.origenId && form.prioridadId
  && form.solicitanteRef && form.inmuebleId && form.asunto.trim()
))
async function guardar(): Promise<void> {
  const tenantId = tenantStore.activeTenant?.id
  if (!tenantId || !formValido.value) return
  error.value = null
  try {
    const nueva = await atencionStore.crearSolicitud({
      tipoId: form.tipoId!, categoriaId: form.categoriaId!, origenId: form.origenId!, prioridadId: form.prioridadId!,
      solicitanteRef: form.solicitanteRef!, inmuebleId: form.inmuebleId!, calidad: form.calidad,
      asunto: form.asunto.trim(), descripcion: form.descripcion.trim() || null,
    })
    drawerAbierto.value = false
    await navigateTo(`/atencion/${nueva.id}`)
  } catch (excepcion) {
    error.value = mensajeError(excepcion, 'No se pudo registrar la solicitud.')
  }
}

// ── configuración de SLA ─────────────────────────────────────────────────
const formSla = reactive({
  tipoId: null as number | null, categoriaId: null as number | null, prioridadId: null as number | null,
  horasPrimeraRespuesta: null as number | null, horasResolucion: null as number | null, horarioHabil: false,
})
const formSlaValido = computed(() => (
  formSla.tipoId && formSla.categoriaId && formSla.prioridadId
  && formSla.horasPrimeraRespuesta && formSla.horasResolucion
))
async function guardarSla(): Promise<void> {
  const tenantId = tenantStore.activeTenant?.id
  if (!tenantId || !formSlaValido.value) return
  error.value = null
  try {
    await atencionStore.crearConfiguracionSla({
      tenantId, tipoId: formSla.tipoId!, categoriaId: formSla.categoriaId!, prioridadId: formSla.prioridadId!,
      horasPrimeraRespuesta: formSla.horasPrimeraRespuesta!, horasResolucion: formSla.horasResolucion!,
      horarioHabil: formSla.horarioHabil,
    })
    formSla.tipoId = null; formSla.categoriaId = null; formSla.prioridadId = null
    formSla.horasPrimeraRespuesta = null; formSla.horasResolucion = null; formSla.horarioHabil = false
  } catch (excepcion) {
    error.value = mensajeError(excepcion, 'No se pudo guardar la configuración de SLA.')
  }
}
function nombreTipo(opciones: OpcionTipo[], id: number): string {
  return opciones.find((o) => o.id === id)?.nombre ?? '—'
}

// ── tokens de consulta por inmueble ──────────────────────────────────────
const inmuebleTokenId = ref<string | null>(null)
const vigenciaDiasToken = ref(30)
const enlaceGenerado = ref<{ url: string; expira_en: string } | null>(null)
async function generarToken(): Promise<void> {
  if (!inmuebleTokenId.value) return
  error.value = null
  enlaceGenerado.value = null
  try {
    const resultado = await atencionStore.generarTokenInmueble(inmuebleTokenId.value, vigenciaDiasToken.value)
    const base = `${window.location.origin}/consulta-inmueble`
    enlaceGenerado.value = { url: `${base}?id=${resultado.id}&t=${resultado.token}`, expira_en: resultado.expira_en }
  } catch (excepcion) {
    error.value = mensajeError(excepcion, 'No se pudo generar el enlace de consulta.')
  }
}
const motivoRevocacion = ref<Record<string, string>>({})
async function revocar(tokenId: string): Promise<void> {
  const tenantId = tenantStore.activeTenant?.id
  const motivo = motivoRevocacion.value[tokenId]?.trim()
  if (!tenantId || !motivo) return
  error.value = null
  try {
    await atencionStore.revocarToken(tokenId, motivo, tenantId)
    motivoRevocacion.value[tokenId] = ''
  } catch (excepcion) {
    error.value = mensajeError(excepcion, 'No se pudo revocar el token.')
  }
}
</script>

<template>
  <div class="space-y-6">
    <div class="flex items-start justify-between gap-4 flex-wrap">
      <UiTituloDescripcion clase-descripcion="text-sm text-muted mt-1 max-w-2xl">
        <template #titulo>
          <h1 class="text-xl font-semibold">Atención al propietario y residente</h1>
        </template>
        <template #descripcion>
          Peticiones, quejas y reclamos — buena práctica, no obligación legal. Toda solicitud la
          registra la administración; el propietario o residente solo consulta por un enlace con
          token, sin sesión (AD-26).
        </template>
      </UiTituloDescripcion>
      <UButton variant="ghost" icon="i-lucide-refresh-cw" :loading="atencionStore.loading" @click="cargar()">
        Actualizar
      </UButton>
    </div>

    <UAlert v-if="error" color="error" variant="soft" :title="error" />

    <div class="flex gap-2 border-b border-default">
      <button
        v-for="p in [
          { valor: 'bandeja', etiqueta: 'Bandeja' },
          { valor: 'sla', etiqueta: 'Configuración de SLA' },
          { valor: 'tokens', etiqueta: 'Tokens de consulta' },
        ]"
        :key="p.valor" type="button"
        class="px-3 py-2 text-sm border-b-2 -mb-px"
        :class="pestana === p.valor ? 'border-primary text-primary font-medium' : 'border-transparent text-muted hover:text-default'"
        @click="pestana = p.valor as typeof pestana"
      >
        {{ p.etiqueta }}
      </button>
    </div>

    <!-- ── Bandeja ──────────────────────────────────────────────────── -->
    <section v-if="pestana === 'bandeja'" class="space-y-3">
      <div class="flex justify-end">
        <UButton size="sm" icon="i-lucide-plus" @click="abrirNueva()">Registrar solicitud</UButton>
      </div>
      <div class="rounded-lg border border-default divide-y divide-default">
        <NuxtLink
          v-for="s in solicitudesOrdenadas" :key="s.id" :to="`/atencion/${s.id}`"
          class="flex items-center justify-between gap-4 p-3 hover:bg-elevated/50"
        >
          <div>
            <p class="font-medium">{{ s.numero }}/{{ s.anio }} · {{ s.asunto }}</p>
            <p class="text-xs text-muted">
              {{ s.inmueble?.codigo }} · {{ s.tipo?.nombre }} / {{ s.categoria?.nombre }} · {{ s.prioridad?.nombre }}
            </p>
          </div>
          <div class="flex items-center gap-2">
            <UBadge v-if="vencida(s)" color="error" variant="soft">SLA vencido</UBadge>
            <UBadge :color="estadoColor[s.estado] ?? 'neutral'" variant="soft">{{ s.estado }}</UBadge>
          </div>
        </NuxtLink>
        <p v-if="solicitudesOrdenadas.length === 0 && !atencionStore.loading" class="text-sm text-muted p-4">
          Todavía no hay solicitudes abiertas.
        </p>
      </div>
    </section>

    <!-- ── Configuración de SLA ─────────────────────────────────────── -->
    <section v-else-if="pestana === 'sla'" class="space-y-4">
      <p class="text-sm text-muted">
        Buena práctica, sin base legal — cero valores precargados: cada copropiedad define sus
        propios tiempos por tipo, categoría y prioridad de solicitud.
      </p>
      <div class="rounded-lg border border-default divide-y divide-default">
        <div v-for="c in atencionStore.configuracionesSla" :key="c.id" class="p-3 text-sm space-y-1">
          <p class="font-medium">
            {{ nombreTipo(tiposSolicitud, c.tipo_id) }} / {{ nombreTipo(categorias, c.categoria_id) }} ·
            {{ nombreTipo(prioridades, c.prioridad_id) }}
          </p>
          <p class="text-xs text-muted">
            1ª respuesta: {{ c.horas_primera_respuesta }}h · resolución: {{ c.horas_resolucion }}h ·
            {{ c.horario_habil ? 'solo horario hábil' : '24/7' }} · vigente desde {{ c.vigente_desde }}
          </p>
        </div>
        <p v-if="atencionStore.configuracionesSla.length === 0" class="text-sm text-muted p-4">
          Sin configuración de SLA todavía — ninguna solicitud rastreará vencimiento hasta definir una.
        </p>
      </div>
      <div class="rounded-lg border border-default p-4 space-y-3">
        <p class="font-medium text-sm">Nueva configuración</p>
        <div class="grid gap-2 sm:grid-cols-3">
          <UFormField label="Tipo">
            <USelect
              :model-value="formSla.tipoId ?? undefined" :items="tiposSolicitud.map((t) => ({ label: t.nombre, value: t.id }))"
              @update:model-value="(v) => (formSla.tipoId = v as number)"
            />
          </UFormField>
          <UFormField label="Categoría">
            <USelect
              :model-value="formSla.categoriaId ?? undefined" :items="categorias.map((c) => ({ label: c.nombre, value: c.id }))"
              @update:model-value="(v) => (formSla.categoriaId = v as number)"
            />
          </UFormField>
          <UFormField label="Prioridad">
            <USelect
              :model-value="formSla.prioridadId ?? undefined" :items="prioridades.map((p) => ({ label: p.nombre, value: p.id }))"
              @update:model-value="(v) => (formSla.prioridadId = v as number)"
            />
          </UFormField>
          <UFormField label="Horas 1ª respuesta"><UInput v-model.number="formSla.horasPrimeraRespuesta" type="number" class="w-full" /></UFormField>
          <UFormField label="Horas resolución"><UInput v-model.number="formSla.horasResolucion" type="number" class="w-full" /></UFormField>
          <UFormField label="Solo horario hábil"><UCheckbox v-model="formSla.horarioHabil" /></UFormField>
        </div>
        <UButton :loading="atencionStore.guardando" :disabled="!formSlaValido" @click="guardarSla()">Guardar</UButton>
      </div>
    </section>

    <!-- ── Tokens de consulta por inmueble ──────────────────────────── -->
    <section v-else class="space-y-4">
      <p class="text-sm text-muted">
        Enlace de consulta sin sesión, por inmueble y con caducidad — nunca permanente. Sirve
        estado de cuenta, paz y salvo, actas publicadas y el estado de las solicitudes de ese
        inmueble.
      </p>
      <div class="rounded-lg border border-default p-4 space-y-3">
        <div class="grid gap-2 sm:grid-cols-3 items-end">
          <UFormField label="Inmueble" class="sm:col-span-2">
            <UiSelectorBuscable v-model="inmuebleTokenId" :opciones="inmuebles.map((i) => ({ valor: i.id, etiqueta: i.codigo }))" />
          </UFormField>
          <UFormField label="Vigencia (días)"><UInput v-model.number="vigenciaDiasToken" type="number" class="w-full" /></UFormField>
        </div>
        <UButton :loading="atencionStore.guardando" :disabled="!inmuebleTokenId" @click="generarToken()">Generar enlace</UButton>
        <div v-if="enlaceGenerado" class="rounded border border-default p-3 text-sm space-y-1 bg-elevated/50">
          <p class="font-medium">Enlace generado (expira {{ enlaceGenerado.expira_en }}):</p>
          <p class="break-all font-mono text-xs">{{ enlaceGenerado.url }}</p>
        </div>
      </div>
      <div class="rounded-lg border border-default divide-y divide-default">
        <div v-for="t in atencionStore.tokens" :key="t.id" class="p-3 text-sm space-y-2">
          <div class="flex items-center justify-between gap-2">
            <p>{{ t.inmueble?.codigo }} · expira {{ t.expira_at.slice(0, 10) }}</p>
            <UBadge v-if="t.revocado_at" color="error" variant="soft">Revocado</UBadge>
            <UBadge v-else-if="new Date(t.expira_at).getTime() < Date.now()" color="neutral" variant="soft">Caducado</UBadge>
            <UBadge v-else color="success" variant="soft">Vigente</UBadge>
          </div>
          <p v-if="t.revocado_at" class="text-xs text-muted">Motivo: {{ t.motivo_revocacion }}</p>
          <div v-else class="flex gap-2">
            <UInput v-model="motivoRevocacion[t.id]" placeholder="Motivo de revocación" class="flex-1" size="sm" />
            <UButton
              size="sm" variant="soft" color="error" :loading="atencionStore.guardando"
              :disabled="!motivoRevocacion[t.id]?.trim()" @click="revocar(t.id)"
            >
              Revocar
            </UButton>
          </div>
        </div>
        <p v-if="atencionStore.tokens.length === 0" class="text-sm text-muted p-4">Sin enlaces generados todavía.</p>
      </div>
    </section>

    <UiDrawer :abierto="drawerAbierto" titulo="Registrar solicitud" @cerrar="drawerAbierto = false">
      <div class="space-y-3">
        <UFormField label="Tipo">
          <USelect
            :model-value="form.tipoId ?? undefined" :items="tiposSolicitud.map((t) => ({ label: t.nombre, value: t.id }))"
            @update:model-value="(v) => (form.tipoId = v as number)"
          />
        </UFormField>
        <UFormField label="Categoría">
          <USelect
            :model-value="form.categoriaId ?? undefined" :items="categorias.map((c) => ({ label: c.nombre, value: c.id }))"
            @update:model-value="(v) => (form.categoriaId = v as number)"
          />
        </UFormField>
        <UFormField label="Origen">
          <USelect
            :model-value="form.origenId ?? undefined" :items="origenes.map((o) => ({ label: o.nombre, value: o.id }))"
            @update:model-value="(v) => (form.origenId = v as number)"
          />
        </UFormField>
        <UFormField label="Prioridad">
          <USelect
            :model-value="form.prioridadId ?? undefined" :items="prioridades.map((p) => ({ label: p.nombre, value: p.id }))"
            @update:model-value="(v) => (form.prioridadId = v as number)"
          />
        </UFormField>
        <UFormField label="Inmueble">
          <UiSelectorBuscable v-model="form.inmuebleId" :opciones="inmuebles.map((i) => ({ valor: i.id, etiqueta: i.codigo }))" />
        </UFormField>
        <UFormField label="Solicitante">
          <UiSelectorBuscable v-model="form.solicitanteRef" :opciones="terceros.map((t) => ({ valor: t.id, etiqueta: `${t.primer_nombre} ${t.primer_apellido}` }))" />
        </UFormField>
        <UFormField label="Calidad">
          <USelect
            v-model="form.calidad"
            :items="[
              { label: 'Propietario', value: 'propietario' }, { label: 'Tenedor (arrendatario, etc.)', value: 'tenedor' },
              { label: 'Tercero', value: 'tercero' },
            ]"
          />
        </UFormField>
        <UFormField label="Asunto"><UInput v-model="form.asunto" class="w-full" /></UFormField>
        <UFormField label="Descripción (opcional)"><UTextarea v-model="form.descripcion" class="w-full" :rows="3" /></UFormField>
      </div>
      <template #foot>
        <div class="flex justify-end gap-2 w-full">
          <UButton variant="ghost" @click="drawerAbierto = false">Cancelar</UButton>
          <UButton :loading="atencionStore.guardando" :disabled="!formValido" @click="guardar()">Registrar</UButton>
        </div>
      </template>
    </UiDrawer>
  </div>
</template>
