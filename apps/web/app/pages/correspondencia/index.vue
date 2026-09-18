<script setup lang="ts">
// EXT-12 §1.2/§7.7/§8.4 (Ola 2, M17) — mínimo indispensable de UI de staff para que
// correspondencia tenga un lado de escritura (§1.2: "no se construye un módulo administrativo
// nuevo"). Página propia y chica, sin navegación nueva forzada — el sidebar es configurable por
// tenant (SIDEBAR-CONFIG), así que no hace falta cablear un ítem fijo aquí.
import type { Database } from '@aquila/shared'

definePageMeta({ layout: 'default', middleware: ['tenant', 'rbac'], permiso: 'data:create' })

const tenantStore = useTenantStore()
const cliente = useSupabaseClient<Database>()

interface FilaCorrespondencia {
  id: string
  inmueble_id: string
  tipo_id: number | null
  destino: string
  remitente: string
  descripcion: string | null
  created_at: string
  entregada: boolean
  entregada_a: string | null
  entregada_at: string | null
}

const inmuebles = ref<{ id: string; codigo: string }[]>([])
const tipos = ref<{ id: number; nombre: string }[]>([])
const registros = shallowRef<FilaCorrespondencia[]>([])
const cargando = ref(true)
const error = ref<string | null>(null)

const nombreInmueble = computed(() => new Map(inmuebles.value.map((i) => [i.id, i.codigo])))
const nombreTipo = computed(() => new Map(tipos.value.map((t) => [t.id, t.nombre])))

async function cargarTodo(): Promise<void> {
  const tenantId = tenantStore.activeTenant?.id
  if (!tenantId) return
  cargando.value = true
  try {
    const [{ data: filasInmuebles }, { data: filasTipos }, { data: filasRegistros, error: errorRegistros }] = await Promise.all([
      cliente.from('inmuebles').select('id, codigo').eq('tenant_id', tenantId).order('codigo'),
      cliente.from('lista_tipos').select('id, nombre').eq('tipo', 'TIPO_CORRESPONDENCIA').eq('tenant_id', tenantId).order('orden'),
      cliente.from('correspondencia').select('*').eq('tenant_id', tenantId).order('created_at', { ascending: false }).limit(200),
    ])
    if (errorRegistros) throw errorRegistros
    inmuebles.value = filasInmuebles ?? []
    tipos.value = filasTipos ?? []
    registros.value = (filasRegistros ?? []) as FilaCorrespondencia[]
  } catch (err) {
    error.value = mensajeError(err, 'No se pudo cargar la correspondencia.')
  } finally {
    cargando.value = false
  }
}
onMounted(cargarTodo)

function formatoFechaHora(iso: string): string {
  return new Date(iso).toLocaleString('es-CO')
}

// ── registrar ──
const nuevoInmuebleId = ref<string | null>(null)
const nuevoTipoId = ref<number | null>(null)
const nuevoDestino = ref('')
const nuevoRemitente = ref('')
const nuevaDescripcion = ref('')
const registrando = ref(false)
const errorRegistrar = ref<string | null>(null)

async function registrar(): Promise<void> {
  if (!nuevoInmuebleId.value || !nuevoDestino.value.trim() || !nuevoRemitente.value.trim()) return
  registrando.value = true
  errorRegistrar.value = null
  try {
    const { data, error: errorFuncion } = await cliente.functions.invoke<FilaCorrespondencia>('correspondencia-registrar', {
      body: {
        accion: 'registrar',
        inmueble_id: nuevoInmuebleId.value,
        destino: nuevoDestino.value.trim(),
        remitente: nuevoRemitente.value.trim(),
        ...(nuevoTipoId.value !== null ? { tipo_id: nuevoTipoId.value } : {}),
        ...(nuevaDescripcion.value.trim() ? { descripcion: nuevaDescripcion.value.trim() } : {}),
      },
    })
    if (errorFuncion) throw await extraerErrorFuncion(errorFuncion)
    if (!data) throw new Error('No se pudo registrar la correspondencia.')
    registros.value = [data, ...registros.value]
    nuevoInmuebleId.value = null
    nuevoTipoId.value = null
    nuevoDestino.value = ''
    nuevoRemitente.value = ''
    nuevaDescripcion.value = ''
  } catch (err) {
    errorRegistrar.value = mensajeError(err, 'No se pudo registrar la correspondencia.')
  } finally {
    registrando.value = false
  }
}

// ── marcar entregada ──
const entregandoId = ref<string | null>(null)
const entregadaAPorId = ref<Record<string, string>>({})
const errorEntregar = ref<string | null>(null)

async function marcarEntregada(id: string): Promise<void> {
  const entregadaA = (entregadaAPorId.value[id] ?? '').trim()
  if (!entregadaA) return
  entregandoId.value = id
  errorEntregar.value = null
  try {
    const { data, error: errorFuncion } = await cliente.functions.invoke<FilaCorrespondencia>('correspondencia-registrar', {
      body: { accion: 'marcar_entregada', correspondencia_id: id, entregada_a: entregadaA },
    })
    if (errorFuncion) throw await extraerErrorFuncion(errorFuncion)
    if (!data) throw new Error('No se pudo marcar la entrega.')
    registros.value = registros.value.map((r) => (r.id === id ? data : r))
  } catch (err) {
    errorEntregar.value = mensajeError(err, 'No se pudo marcar la entrega.')
  } finally {
    entregandoId.value = null
  }
}
</script>

<template>
  <div class="mx-auto max-w-3xl space-y-6 p-4">
    <h1 class="text-lg font-semibold">Correspondencia</h1>

    <UAlert v-if="error" color="error" variant="soft" :title="error" />

    <template v-else>
      <div class="rounded-md border border-default p-4 space-y-3">
        <p class="font-medium text-sm">Registrar</p>
        <div class="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <UFormField label="Inmueble">
            <UiSelectorBuscable
              v-model="nuevoInmuebleId" class="w-full"
              :opciones="inmuebles.map((i) => ({ valor: i.id, etiqueta: i.codigo }))"
            />
          </UFormField>
          <UFormField v-if="tipos.length > 0" label="Tipo (opcional)">
            <USelect
              :model-value="nuevoTipoId ?? undefined" class="w-full"
              :items="tipos.map((t) => ({ value: t.id, label: t.nombre }))"
              @update:model-value="(v) => (nuevoTipoId = v as number)"
            />
          </UFormField>
          <UFormField label="Destino (a quién va dirigida)">
            <UInput v-model="nuevoDestino" class="w-full" placeholder="Nombre del residente" />
          </UFormField>
          <UFormField label="Remitente">
            <UInput v-model="nuevoRemitente" class="w-full" placeholder="Quién lo envía" />
          </UFormField>
          <UFormField label="Descripción (opcional)" class="sm:col-span-2">
            <UInput v-model="nuevaDescripcion" class="w-full" placeholder="Ej. caja mediana, sobre" />
          </UFormField>
        </div>
        <p v-if="errorRegistrar" class="text-xs text-red-600 dark:text-red-400">{{ errorRegistrar }}</p>
        <UButton
          :loading="registrando"
          :disabled="registrando || !nuevoInmuebleId || !nuevoDestino.trim() || !nuevoRemitente.trim()"
          @click="registrar()"
        >
          Registrar
        </UButton>
      </div>

      <div class="space-y-3">
        <p class="font-medium text-sm">Bandeja</p>
        <p v-if="errorEntregar" class="text-xs text-red-600 dark:text-red-400">{{ errorEntregar }}</p>
        <UiTabla
          :columnas="[
            { clave: 'inmueble', etiqueta: 'Inmueble' },
            { clave: 'destino', etiqueta: 'Destino' },
            { clave: 'remitente', etiqueta: 'Remitente' },
            { clave: 'recibido', etiqueta: 'Recibido' },
            { clave: 'estado', etiqueta: 'Estado' },
            { clave: 'acciones', etiqueta: '' },
          ]"
          :filas="registros"
          :clave-fila="(r) => r.id"
          vacio="Sin correspondencia registrada."
        >
          <template #celda-inmueble="{ fila }">{{ nombreInmueble.get(fila.inmueble_id) ?? '—' }}</template>
          <template #celda-destino="{ fila }">{{ fila.destino }}</template>
          <template #celda-remitente="{ fila }">
            {{ fila.remitente }}
            <span v-if="fila.tipo_id" class="block text-xs text-muted">{{ nombreTipo.get(fila.tipo_id) ?? '—' }}</span>
          </template>
          <template #celda-recibido="{ fila }">{{ formatoFechaHora(fila.created_at) }}</template>
          <template #celda-estado="{ fila }">
            <UBadge :color="fila.entregada ? 'neutral' : 'success'" variant="soft">
              {{ fila.entregada ? 'Entregada' : 'En portería' }}
            </UBadge>
          </template>
          <template #celda-acciones="{ fila }">
            <div v-if="!fila.entregada" class="flex items-center gap-1.5">
              <UInput
                v-model="entregadaAPorId[fila.id]" size="xs" class="w-32" placeholder="Recogida por…"
              />
              <UButton
                size="xs" variant="soft"
                :loading="entregandoId === fila.id" :disabled="entregandoId !== null || !entregadaAPorId[fila.id]?.trim()"
                @click="marcarEntregada(fila.id)"
              >
                Marcar
              </UButton>
            </div>
            <span v-else class="text-xs text-muted">{{ fila.entregada_a }}</span>
          </template>
        </UiTabla>
      </div>
    </template>
  </div>
</template>
