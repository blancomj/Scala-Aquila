<script setup lang="ts">
// GOB-1 §4.5: tarjetas por órgano con miembros vigentes, panel de atribuciones (ley vs
// reglamento), alertas de obligatoriedad/vencimiento, historial de composiciones anteriores.
import type { Database } from '@aquila/shared'

definePageMeta({ layout: 'default', middleware: ['tenant', 'rbac'], permiso: 'data:read' })

type ListaTipoRow = Database['public']['Tables']['lista_tipos']['Row']

const tenantStore = useTenantStore()
const organosStore = useGobiernoOrganosStore()
const tercerosStore = useTercerosStore()

const tiposOrgano = ref<ListaTipoRow[]>([])
const tiposAtribucion = ref<ListaTipoRow[]>([])
const rolesConcejo = ref<ListaTipoRow[]>([])

async function cargar(): Promise<void> {
  const tenantId = tenantStore.activeTenant?.id
  if (!tenantId) return
  const [tOrgano, tAtrib, tRoles] = await Promise.all([
    cargarListaTipos(tenantId, 'ORGANO_GOBIERNO'),
    cargarListaTipos(tenantId, 'ATRIBUCION_ORGANO'),
    cargarListaTipos(tenantId, 'ROL_CONCEJO_COPROPIEDAD'),
  ])
  tiposOrgano.value = tOrgano
  tiposAtribucion.value = tAtrib
  rolesConcejo.value = tRoles
  await Promise.all([organosStore.cargarOrganos(tenantId), tercerosStore.cargarTerceros(tenantId)])
}
onMounted(cargar)

const organosVigentes = computed(() => organosStore.organos.filter((o) => !o.vigente_hasta))
const organosHistoricos = computed(() => organosStore.organos.filter((o) => o.vigente_hasta))

function miembrosDe(organoId: string, soloVigentes = true) {
  return organosStore.miembros.filter((m) => m.organo_id === organoId && (!soloVigentes || !m.hasta))
}
function atribucionesDe(organoId: string) {
  return organosStore.atribuciones.filter((a) => a.organo_id === organoId && !a.vigente_hasta)
}

const opcionesTercero = computed(() =>
  tercerosStore.terceros.map((t) => ({ valor: t.id, etiqueta: `${t.nombre_completo} · ${t.numero_documento}` })),
)

// ── Alertas (§4.5) ────────────────────────────────────────────────────────
interface Alerta { color: 'warning' | 'error'; texto: string }
const alertas = computed<Alerta[]>(() => {
  const lista: Alerta[] = []
  for (const o of organosStore.obligatoriedad) {
    if (!o.cumplida) lista.push({ color: 'warning', texto: o.motivo })
  }
  const hoy = new Date().toISOString().slice(0, 10)
  for (const organo of organosVigentes.value) {
    if (organo.tipo?.codigo === 'comite_convivencia') {
      const activos = miembrosDe(organo.id).filter((m) => !m.hasta || m.hasta >= hoy)
      if (activos.length === 0) {
        lista.push({ color: 'error', texto: 'El comité de convivencia no tiene miembros vigentes — período vencido.' })
      }
    }
    if (organo.tipo?.codigo === 'consejo_administracion') {
      const vigentesOrgano = miembrosDe(organo.id)
      const tienePresidente = vigentesOrgano.some((m) => m.rol?.codigo === 'presidente')
      const tieneSecretario = vigentesOrgano.some((m) => m.rol?.codigo === 'secretario')
      if (!tienePresidente || !tieneSecretario) {
        lista.push({
          color: 'warning',
          texto: `El consejo de administración no tiene ${!tienePresidente ? 'presidente' : 'secretario'} vigente.`,
        })
      }
    }
  }
  return lista
})

// ── Drawer: nuevo órgano ──────────────────────────────────────────────────
const drawerOrganoAbierto = ref(false)
const formOrgano = reactive({
  tipoId: null as number | null, nombre: '', vigenteDesde: new Date().toISOString().slice(0, 10),
  reglamentoReferencia: '',
})
const errorOrgano = ref<string | null>(null)
const opcionesTipoOrgano = computed(() => tiposOrgano.value.map((t) => ({ valor: t.id, etiqueta: t.nombre })))
const tipoOrganoSeleccionado = computed(() => tiposOrgano.value.find((t) => t.id === formOrgano.tipoId)?.codigo)

function abrirNuevoOrgano(): void {
  formOrgano.tipoId = null
  formOrgano.nombre = ''
  formOrgano.vigenteDesde = new Date().toISOString().slice(0, 10)
  formOrgano.reglamentoReferencia = ''
  errorOrgano.value = null
  drawerOrganoAbierto.value = true
}
async function guardarOrgano(): Promise<void> {
  const tenantId = tenantStore.activeTenant?.id
  if (!tenantId || !formOrgano.tipoId) return
  errorOrgano.value = null
  try {
    await organosStore.crearOrgano({
      tenant_id: tenantId, tipo_id: formOrgano.tipoId,
      nombre: formOrgano.nombre.trim() || null,
      vigente_desde: formOrgano.vigenteDesde,
      reglamento_referencia: formOrgano.reglamentoReferencia.trim() || null,
    })
    drawerOrganoAbierto.value = false
  } catch (excepcion) {
    errorOrgano.value = mensajeError(excepcion, 'No se pudo crear el órgano.')
  }
}
async function terminarOrgano(id: string): Promise<void> {
  const tenantId = tenantStore.activeTenant?.id
  if (!tenantId) return
  await organosStore.terminarOrgano(id, tenantId, new Date().toISOString().slice(0, 10))
}

// ── Drawer: agregar miembro ────────────────────────────────────────────────
const drawerMiembroAbierto = ref(false)
const organoActivoId = ref<string | null>(null)
const formMiembro = reactive({
  terceroId: null as string | null, rolId: null as number | null,
  desde: new Date().toISOString().slice(0, 10), hasta: '',
})
const errorMiembro = ref<string | null>(null)
const opcionesRol = computed(() => rolesConcejo.value.map((r) => ({ valor: r.id, etiqueta: r.nombre })))

function abrirNuevoMiembro(organoId: string): void {
  organoActivoId.value = organoId
  formMiembro.terceroId = null
  formMiembro.rolId = null
  formMiembro.desde = new Date().toISOString().slice(0, 10)
  formMiembro.hasta = ''
  errorMiembro.value = null
  drawerMiembroAbierto.value = true
}
async function guardarMiembro(): Promise<void> {
  const tenantId = tenantStore.activeTenant?.id
  if (!tenantId || !organoActivoId.value || !formMiembro.terceroId || !formMiembro.rolId) return
  errorMiembro.value = null
  try {
    await organosStore.agregarMiembro({
      tenant_id: tenantId, organo_id: organoActivoId.value,
      tercero_id: formMiembro.terceroId, rol_id: formMiembro.rolId,
      desde: formMiembro.desde, hasta: formMiembro.hasta || null,
    })
    drawerMiembroAbierto.value = false
  } catch (excepcion) {
    errorMiembro.value = mensajeError(excepcion, 'No se pudo agregar el miembro.')
  }
}
async function terminarMiembro(id: string): Promise<void> {
  const tenantId = tenantStore.activeTenant?.id
  if (!tenantId) return
  await organosStore.terminarMiembro(id, tenantId, new Date().toISOString().slice(0, 10))
}

// ── Drawer: agregar atribución ─────────────────────────────────────────────
const drawerAtribucionAbierto = ref(false)
const formAtribucion = reactive({
  atribucionId: null as number | null, origen: 'reglamento' as 'ley' | 'reglamento',
  reglamentoReferencia: '', vigenteDesde: new Date().toISOString().slice(0, 10),
})
const errorAtribucion = ref<string | null>(null)
const opcionesAtribucion = computed(() => tiposAtribucion.value.map((a) => ({ valor: a.id, etiqueta: a.nombre })))

function abrirNuevaAtribucion(organoId: string): void {
  organoActivoId.value = organoId
  formAtribucion.atribucionId = null
  formAtribucion.origen = 'reglamento'
  formAtribucion.reglamentoReferencia = ''
  formAtribucion.vigenteDesde = new Date().toISOString().slice(0, 10)
  errorAtribucion.value = null
  drawerAtribucionAbierto.value = true
}
async function guardarAtribucion(): Promise<void> {
  const tenantId = tenantStore.activeTenant?.id
  if (!tenantId || !organoActivoId.value || !formAtribucion.atribucionId) return
  errorAtribucion.value = null
  try {
    await organosStore.agregarAtribucion({
      tenant_id: tenantId, organo_id: organoActivoId.value,
      atribucion_id: formAtribucion.atribucionId, origen: formAtribucion.origen,
      reglamento_referencia: formAtribucion.origen === 'reglamento'
        ? (formAtribucion.reglamentoReferencia.trim() || null) : null,
      vigente_desde: formAtribucion.vigenteDesde,
    })
    drawerAtribucionAbierto.value = false
  } catch (excepcion) {
    errorAtribucion.value = mensajeError(excepcion, 'No se pudo agregar la atribución.')
  }
}
async function terminarAtribucion(id: string): Promise<void> {
  const tenantId = tenantStore.activeTenant?.id
  if (!tenantId) return
  await organosStore.terminarAtribucion(id, tenantId, new Date().toISOString().slice(0, 10))
}
</script>

<template>
  <div class="space-y-6">
    <div class="flex items-start justify-between gap-4 flex-wrap">
      <UiTituloDescripcion clase-descripcion="text-sm text-muted mt-1 max-w-2xl">
        <template #titulo>
          <h1 class="text-xl font-semibold">Órganos de gobierno</h1>
        </template>
        <template #descripcion>
          Asamblea, consejo de administración, comité de convivencia, comités ad hoc,
          administración y revisoría fiscal — con sus miembros y sus atribuciones. Ningún corte
          posterior codifica "lo aprueba el consejo": todos consultan la atribución vigente.
        </template>
      </UiTituloDescripcion>
      <div class="flex items-center gap-2">
        <UButton variant="ghost" icon="i-lucide-refresh-cw" :loading="organosStore.loading" @click="cargar()">
          Actualizar
        </UButton>
        <UButton icon="i-lucide-plus" @click="abrirNuevoOrgano()">Nuevo órgano</UButton>
      </div>
    </div>

    <div v-if="alertas.length > 0" class="space-y-2">
      <UAlert v-for="(a, i) in alertas" :key="i" :color="a.color" variant="soft" :title="a.texto" />
    </div>

    <div class="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
      <div v-for="organo in organosVigentes" :key="organo.id" class="rounded-lg border border-default p-4 space-y-3">
        <div class="flex items-start justify-between gap-2">
          <div>
            <p class="font-medium">{{ organo.nombre || organo.tipo?.nombre }}</p>
            <p class="text-xs text-muted">
              {{ organo.tipo?.nombre }} · vigente desde {{ organo.vigente_desde }}
            </p>
          </div>
          <UButton size="xs" variant="ghost" color="error" @click="terminarOrgano(organo.id)">Terminar</UButton>
        </div>

        <div>
          <p class="text-xs font-medium text-muted uppercase mb-1">Miembros vigentes</p>
          <ul class="space-y-1">
            <li
              v-for="m in miembrosDe(organo.id)" :key="m.id"
              class="flex items-center justify-between gap-2 text-sm"
            >
              <span>{{ m.rol?.nombre }} · {{ m.tercero?.nombre_completo }}</span>
              <UButton size="xs" variant="ghost" @click="terminarMiembro(m.id)">Terminar</UButton>
            </li>
            <li v-if="miembrosDe(organo.id).length === 0" class="text-sm text-muted">Sin miembros vigentes.</li>
          </ul>
          <UButton size="xs" variant="ghost" icon="i-lucide-plus" class="mt-1" @click="abrirNuevoMiembro(organo.id)">
            Agregar miembro
          </UButton>
        </div>

        <div>
          <p class="text-xs font-medium text-muted uppercase mb-1">Atribuciones vigentes</p>
          <ul class="space-y-1">
            <li
              v-for="a in atribucionesDe(organo.id)" :key="a.id"
              class="flex items-center justify-between gap-2 text-sm"
            >
              <span>
                {{ a.atribucion?.nombre }}
                <UBadge size="xs" :color="a.origen === 'ley' ? 'primary' : 'neutral'" variant="soft" class="ml-1">
                  {{ a.origen === 'ley' ? 'ley' : a.reglamento_referencia }}
                </UBadge>
              </span>
              <UButton size="xs" variant="ghost" @click="terminarAtribucion(a.id)">Terminar</UButton>
            </li>
            <li v-if="atribucionesDe(organo.id).length === 0" class="text-sm text-muted">Sin atribuciones vigentes.</li>
          </ul>
          <UButton size="xs" variant="ghost" icon="i-lucide-plus" class="mt-1" @click="abrirNuevaAtribucion(organo.id)">
            Agregar atribución
          </UButton>
        </div>
      </div>
      <p v-if="organosVigentes.length === 0 && !organosStore.loading" class="text-sm text-muted col-span-full">
        Todavía no hay órganos de gobierno registrados.
      </p>
    </div>

    <details v-if="organosHistoricos.length > 0" class="rounded-lg border border-default p-4">
      <summary class="cursor-pointer text-sm font-medium">Historial de composiciones anteriores</summary>
      <ul class="mt-3 space-y-1 text-sm text-muted">
        <li v-for="o in organosHistoricos" :key="o.id">
          {{ o.tipo?.nombre }}{{ o.nombre ? ` (${o.nombre})` : '' }} · {{ o.vigente_desde }} → {{ o.vigente_hasta }}
        </li>
      </ul>
    </details>

    <UiDrawer :abierto="drawerOrganoAbierto" titulo="Nuevo órgano" @cerrar="drawerOrganoAbierto = false">
      <div class="space-y-3">
        <UAlert v-if="errorOrgano" color="error" variant="soft" :title="errorOrgano" />
        <UFormField label="Tipo de órgano" name="tipo">
          <UiSelectorBuscable v-model="formOrgano.tipoId" :opciones="opcionesTipoOrgano" placeholder="Selecciona un tipo" />
        </UFormField>
        <UFormField v-if="tipoOrganoSeleccionado === 'comite'" label="Nombre (obligatorio para comités ad hoc)" name="nombre">
          <UInput v-model="formOrgano.nombre" class="w-full" placeholder="Ej. Comité de obras" />
        </UFormField>
        <UFormField label="Vigente desde" name="vigenteDesde">
          <UInput v-model="formOrgano.vigenteDesde" type="date" class="w-full" />
        </UFormField>
        <UFormField label="Referencia en el reglamento (opcional)" name="reglamentoReferencia">
          <UInput v-model="formOrgano.reglamentoReferencia" class="w-full" placeholder="Artículo del reglamento" />
        </UFormField>
      </div>
      <template #foot>
        <div class="flex justify-end gap-2 w-full">
          <UButton variant="ghost" @click="drawerOrganoAbierto = false">Cancelar</UButton>
          <UButton :loading="organosStore.guardando" :disabled="!formOrgano.tipoId" @click="guardarOrgano()">
            Crear órgano
          </UButton>
        </div>
      </template>
    </UiDrawer>

    <UiDrawer :abierto="drawerMiembroAbierto" titulo="Agregar miembro" @cerrar="drawerMiembroAbierto = false">
      <div class="space-y-3">
        <UAlert v-if="errorMiembro" color="error" variant="soft" :title="errorMiembro" />
        <UFormField label="Tercero" name="tercero">
          <UiSelectorBuscable v-model="formMiembro.terceroId" :opciones="opcionesTercero" placeholder="Selecciona un tercero" />
        </UFormField>
        <UFormField label="Rol" name="rol">
          <UiSelectorBuscable v-model="formMiembro.rolId" :opciones="opcionesRol" placeholder="Selecciona un rol" />
        </UFormField>
        <UFormField label="Desde" name="desde">
          <UInput v-model="formMiembro.desde" type="date" class="w-full" />
        </UFormField>
        <UFormField label="Hasta (obligatorio para el comité de convivencia — máx. 1 año)" name="hasta">
          <UInput v-model="formMiembro.hasta" type="date" class="w-full" />
        </UFormField>
      </div>
      <template #foot>
        <div class="flex justify-end gap-2 w-full">
          <UButton variant="ghost" @click="drawerMiembroAbierto = false">Cancelar</UButton>
          <UButton
            :loading="organosStore.guardando" :disabled="!formMiembro.terceroId || !formMiembro.rolId"
            @click="guardarMiembro()"
          >
            Agregar
          </UButton>
        </div>
      </template>
    </UiDrawer>

    <UiDrawer :abierto="drawerAtribucionAbierto" titulo="Agregar atribución" @cerrar="drawerAtribucionAbierto = false">
      <div class="space-y-3">
        <UAlert v-if="errorAtribucion" color="error" variant="soft" :title="errorAtribucion" />
        <UFormField label="Atribución" name="atribucion">
          <UiSelectorBuscable v-model="formAtribucion.atribucionId" :opciones="opcionesAtribucion" placeholder="Selecciona una atribución" />
        </UFormField>
        <UFormField label="Origen" name="origen">
          <USelect
            v-model="formAtribucion.origen"
            :items="[{ label: 'Reglamento', value: 'reglamento' }, { label: 'Ley', value: 'ley' }]"
          />
        </UFormField>
        <UFormField
          v-if="formAtribucion.origen === 'reglamento'"
          label="Referencia en el reglamento" name="reglamentoReferencia"
        >
          <UInput v-model="formAtribucion.reglamentoReferencia" class="w-full" placeholder="Artículo del reglamento" />
        </UFormField>
        <p v-else class="text-xs text-muted">
          Origen=ley debe enlazarse a un fundamento normativo registrado — hazlo desde
          Fundamentos si todavía no existe, luego usa esta atribución sabiendo su id.
        </p>
        <UFormField label="Vigente desde" name="vigenteDesde">
          <UInput v-model="formAtribucion.vigenteDesde" type="date" class="w-full" />
        </UFormField>
      </div>
      <template #foot>
        <div class="flex justify-end gap-2 w-full">
          <UButton variant="ghost" @click="drawerAtribucionAbierto = false">Cancelar</UButton>
          <UButton
            :loading="organosStore.guardando" :disabled="!formAtribucion.atribucionId"
            @click="guardarAtribucion()"
          >
            Agregar
          </UButton>
        </div>
      </template>
    </UiDrawer>
  </div>
</template>
