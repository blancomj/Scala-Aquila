<script setup lang="ts">
/**
 * GOB-7 §4.4: sección contextual de impugnación, embebida en el detalle de la decisión
 * (decisiones/[id].vue) y del expediente (convivencia/[id].vue) — la impugnación siempre se ve
 * en contexto de lo impugnado, nunca como pantalla aparte (además del listado transversal
 * impugnaciones.vue). AQUILA no resuelve: "resolver" aquí es registrar lo que el juez/órgano YA
 * decidió.
 */
import type { Database } from '@aquila/shared'

const props = defineProps<{
  objetoTipo: 'decision' | 'sancion'
  objetoId: string
  tenantId: string
  impugnable: boolean
}>()

interface TerceroOpcion { id: string; primer_nombre: string | null; primer_apellido: string | null }

const store = useGobiernoImpugnacionesStore()
const terceros = ref<TerceroOpcion[]>([])
const error = ref<string | null>(null)

const estadoColor: Record<string, 'success' | 'error' | 'warning' | 'neutral' | 'primary'> = {
  presentada: 'primary', en_tramite: 'warning', resuelta: 'success', desistida: 'neutral',
}
const resultadoColor: Record<string, 'success' | 'error' | 'warning' | 'neutral'> = {
  confirmada: 'success', revocada: 'error', modificada: 'warning', inadmitida: 'neutral',
}

async function cargar(): Promise<void> {
  if (props.objetoTipo === 'decision') await store.cargarImpugnacionesDeDecision(props.objetoId)
  else await store.cargarImpugnacionesDeExpediente(props.objetoId)

  const cliente = useSupabaseClient<Database>()
  const { data } = await cliente
    .from('terceros').select('id, primer_nombre, primer_apellido').eq('tenant_id', props.tenantId).order('primer_nombre')
  terceros.value = data ?? []
}
onMounted(cargar)
watch(() => props.objetoId, cargar)

function etiquetaTercero(id: string | null): string {
  const t = terceros.value.find((x) => x.id === id)
  return t ? `${t.primer_nombre} ${t.primer_apellido}` : '—'
}

// ── Presentar ──────────────────────────────────────────────────────────
const drawerPresentarAbierto = ref(false)
const formPresentar = reactive({
  impugnanteRef: null as string | null, calidad: '', fechaNotificacion: '', fechaPresentacion: '',
  causal: '', fundamento: '', suspendeEfectos: false, suspensionFundamento: '',
})
function abrirPresentar(): void {
  formPresentar.impugnanteRef = null
  formPresentar.calidad = ''
  formPresentar.fechaNotificacion = new Date().toISOString().slice(0, 10)
  formPresentar.fechaPresentacion = new Date().toISOString().slice(0, 10)
  formPresentar.causal = ''
  formPresentar.fundamento = ''
  formPresentar.suspendeEfectos = false
  formPresentar.suspensionFundamento = ''
  error.value = null
  drawerPresentarAbierto.value = true
}
async function guardarPresentar(): Promise<void> {
  if (!formPresentar.impugnanteRef) return
  error.value = null
  try {
    await store.presentarImpugnacion({
      objetoTipo: props.objetoTipo,
      decisionId: props.objetoTipo === 'decision' ? props.objetoId : null,
      expedienteId: props.objetoTipo === 'sancion' ? props.objetoId : null,
      impugnanteRef: formPresentar.impugnanteRef,
      calidad: formPresentar.calidad || null,
      fechaNotificacion: formPresentar.fechaNotificacion,
      fechaPresentacion: formPresentar.fechaPresentacion,
      causal: formPresentar.causal,
      fundamento: formPresentar.fundamento || null,
      suspendeEfectos: formPresentar.suspendeEfectos,
      suspensionFundamento: formPresentar.suspensionFundamento || null,
    })
    drawerPresentarAbierto.value = false
    await cargar()
  } catch (e) {
    error.value = e instanceof Error ? e.message : String(e)
  }
}

// ── Registrar actuación (en_tramite / desistida) ────────────────────────
const impugnacionActivaId = ref<string | null>(null)
const instanciaForm = ref('')
async function marcarEnTramite(impugnacionId: string): Promise<void> {
  error.value = null
  try {
    await store.registrarActuacion({
      impugnacionId, estado: 'en_tramite', fecha: new Date().toISOString().slice(0, 10),
      descripcion: instanciaForm.value ? `Turnada a: ${instanciaForm.value}` : 'En trámite',
      instancia: instanciaForm.value || null,
    })
    await cargar()
  } catch (e) {
    error.value = e instanceof Error ? e.message : String(e)
  }
}
async function desistir(impugnacionId: string): Promise<void> {
  error.value = null
  try {
    await store.registrarActuacion({
      impugnacionId, estado: 'desistida', fecha: new Date().toISOString().slice(0, 10),
      descripcion: 'Desistimiento del impugnante',
    })
    await cargar()
  } catch (e) {
    error.value = e instanceof Error ? e.message : String(e)
  }
}

// ── Resolver ─────────────────────────────────────────────────────────────
const drawerResolverAbierto = ref(false)
const formResolver = reactive({ resultado: 'confirmada' as 'confirmada' | 'revocada' | 'modificada' | 'inadmitida', descripcion: '', detalle: '' })
function abrirResolver(id: string): void {
  impugnacionActivaId.value = id
  formResolver.resultado = 'confirmada'
  formResolver.descripcion = ''
  formResolver.detalle = ''
  error.value = null
  drawerResolverAbierto.value = true
}
async function guardarResolver(): Promise<void> {
  if (!impugnacionActivaId.value || !formResolver.descripcion.trim()) return
  error.value = null
  try {
    await store.resolverImpugnacion({
      impugnacionId: impugnacionActivaId.value, resultado: formResolver.resultado,
      descripcion: formResolver.descripcion, detalle: formResolver.detalle || null,
    })
    drawerResolverAbierto.value = false
    await cargar()
  } catch (e) {
    error.value = e instanceof Error ? e.message : String(e)
  }
}
</script>

<template>
  <section class="rounded-lg border border-default p-4 space-y-3">
    <div class="flex items-center justify-between">
      <p class="font-medium">Impugnación</p>
      <UButton v-if="impugnable" size="xs" variant="ghost" icon="i-lucide-gavel" @click="abrirPresentar()">
        Presentar impugnación
      </UButton>
    </div>

    <UAlert v-if="error" color="error" variant="soft" :title="error" />

    <p v-if="store.impugnaciones.length === 0" class="text-sm text-muted">Sin impugnaciones registradas.</p>

    <ul class="space-y-3">
      <li v-for="imp in store.impugnaciones" :key="imp.id" class="rounded border border-default p-3 space-y-2 text-sm">
        <div class="flex items-center justify-between flex-wrap gap-2">
          <span class="font-medium">Impugnación {{ imp.numero }}/{{ imp.anio }} · {{ etiquetaTercero(imp.impugnante_ref) }}</span>
          <div class="flex items-center gap-2">
            <UBadge :color="estadoColor[imp.estado] ?? 'neutral'" variant="soft" size="xs">{{ imp.estado }}</UBadge>
            <UBadge v-if="imp.resultado" :color="resultadoColor[imp.resultado] ?? 'neutral'" variant="soft" size="xs">
              {{ imp.resultado }}
            </UBadge>
          </div>
        </div>
        <p class="text-muted">{{ imp.causal }}</p>
        <p class="text-xs">
          Plazo límite: <strong>{{ imp.plazo_limite }}</strong>
          <span v-if="!imp.presentada_en_plazo" class="text-warning"> · presentada fuera de plazo</span>
          <span v-if="!imp.plazo_fundamento_valido" class="text-warning">
            · plazo aún sin fundamento normativo verificado — no bloquea (spec §3)
          </span>
        </p>
        <p v-if="imp.suspende_efectos" class="text-xs text-warning">
          Suspende los efectos: {{ imp.suspension_fundamento }}
        </p>
        <p v-if="imp.instancia" class="text-xs text-muted">Instancia: {{ imp.instancia }}</p>

        <div v-if="imp.estado === 'presentada' || imp.estado === 'en_tramite'" class="flex flex-wrap items-center gap-2 pt-1">
          <UInput v-if="imp.estado === 'presentada'" v-model="instanciaForm" size="xs" placeholder="Instancia (juez, órgano...)" />
          <UButton v-if="imp.estado === 'presentada'" size="xs" variant="soft" @click="marcarEnTramite(imp.id)">En trámite</UButton>
          <UButton size="xs" variant="soft" color="neutral" @click="desistir(imp.id)">Desistir</UButton>
          <UButton size="xs" color="primary" @click="abrirResolver(imp.id)">Registrar resolución</UButton>
        </div>
      </li>
    </ul>

    <UiDrawer :abierto="drawerPresentarAbierto" titulo="Presentar impugnación" @cerrar="drawerPresentarAbierto = false">
      <div class="space-y-3">
        <p class="text-xs text-muted">
          AQUILA registra la impugnación y calcula su plazo — no la resuelve (spec §2).
        </p>
        <UFormField label="Impugnante" name="impugnanteRef">
          <UiSelectorBuscable
            v-model="formPresentar.impugnanteRef"
            :opciones="terceros.map((t) => ({ valor: t.id, etiqueta: `${t.primer_nombre} ${t.primer_apellido}` }))"
          />
        </UFormField>
        <UFormField label="Calidad (opcional)" name="calidad">
          <UInput v-model="formPresentar.calidad" placeholder="propietario, apoderado..." class="w-full" />
        </UFormField>
        <UFormField label="Fecha de notificación del objeto impugnado" name="fechaNotificacion">
          <UInput v-model="formPresentar.fechaNotificacion" type="date" class="w-full" />
        </UFormField>
        <UFormField label="Fecha de presentación" name="fechaPresentacion">
          <UInput v-model="formPresentar.fechaPresentacion" type="date" class="w-full" />
        </UFormField>
        <UFormField label="Causal" name="causal">
          <UTextarea v-model="formPresentar.causal" class="w-full" />
        </UFormField>
        <UFormField label="Fundamento (opcional)" name="fundamento">
          <UTextarea v-model="formPresentar.fundamento" class="w-full" />
        </UFormField>
        <UFormField label="¿Suspende los efectos del objeto impugnado?" name="suspendeEfectos">
          <USwitch v-model="formPresentar.suspendeEfectos" />
        </UFormField>
        <UFormField v-if="formPresentar.suspendeEfectos" label="Justificación de la suspensión" name="suspensionFundamento">
          <UTextarea v-model="formPresentar.suspensionFundamento" class="w-full" />
        </UFormField>
      </div>
      <template #foot>
        <div class="flex justify-end gap-2 w-full">
          <UButton variant="ghost" @click="drawerPresentarAbierto = false">Cancelar</UButton>
          <UButton
            :loading="store.guardando"
            :disabled="!formPresentar.impugnanteRef || !formPresentar.causal.trim() || (formPresentar.suspendeEfectos && !formPresentar.suspensionFundamento.trim())"
            @click="guardarPresentar()"
          >
            Presentar
          </UButton>
        </div>
      </template>
    </UiDrawer>

    <UiDrawer :abierto="drawerResolverAbierto" titulo="Registrar resolución" @cerrar="drawerResolverAbierto = false">
      <div class="space-y-3">
        <p class="text-xs text-muted">
          Registra lo que el juez u órgano competente YA decidió — AQUILA aplica el efecto
          mecánico sobre el objeto impugnado (spec §4.2), nunca decide por su cuenta.
        </p>
        <UFormField label="Resultado" name="resultado">
          <USelect
            v-model="formResolver.resultado"
            :items="[
              { label: 'Confirmada', value: 'confirmada' },
              { label: 'Revocada', value: 'revocada' },
              { label: 'Modificada', value: 'modificada' },
              { label: 'Inadmitida', value: 'inadmitida' },
            ]"
          />
        </UFormField>
        <UFormField label="Descripción de la resolución" name="descripcion">
          <UTextarea v-model="formResolver.descripcion" class="w-full" />
        </UFormField>
        <UFormField v-if="formResolver.resultado === 'modificada'" label="¿En qué se modificó?" name="detalle">
          <UTextarea v-model="formResolver.detalle" class="w-full" />
        </UFormField>
      </div>
      <template #foot>
        <div class="flex justify-end gap-2 w-full">
          <UButton variant="ghost" @click="drawerResolverAbierto = false">Cancelar</UButton>
          <UButton
            :loading="store.guardando"
            :disabled="!formResolver.descripcion.trim() || (formResolver.resultado === 'modificada' && !formResolver.detalle.trim())"
            @click="guardarResolver()"
          >
            Registrar resolución
          </UButton>
        </div>
      </template>
    </UiDrawer>
  </section>
</template>
