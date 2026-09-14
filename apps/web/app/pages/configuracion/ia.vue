<script setup lang="ts">
// Proveedor de IA — FASE DE ESTRUCTURA: se elige proveedor + modelo, se
// capturan credenciales y se activa. Ningún módulo consume esto todavía —
// es la infraestructura genérica para que, cuando una función lo necesite
// (p. ej. extracción asistida de extractos bancarios en PDF), ya exista de
// dónde leer el proveedor/modelo/clave activos de la copropiedad.
//
// Mismo patrón exacto que configuracion/pasarela.vue: las tarjetas y los
// campos de credencial se pintan desde el descriptor de capacidades, NO
// hardcodeados aquí — agregar un proveedor no debería obligar a tocar este
// .vue, solo su descriptor en @aquila/ai-providers.
import { DESCRIPTORES, LISTA_DESCRIPTORES } from '@aquila/ai-providers'
import type { Database } from '@aquila/shared'
import type { OpcionSelectorBuscable } from '~/components/ui/UiSelectorBuscable.vue'

definePageMeta({ layout: 'default', middleware: ['tenant', 'rbac'], permiso: 'settings:manage' })

type IaProveedor = Database['public']['Enums']['ia_proveedor_t']

const tenantStore = useTenantStore()
const proveedoresStore = useProveedoresIaStore()
const toast = useToast()

// `watch` con `immediate` en vez de `useAsyncData` a secas: en la carga en
// frío de la página, `tenantStore.activeTenant` puede seguir sin resolver
// en el instante exacto en que corre este setup (la resolución real ocurre
// en el middleware `tenant`, en otro store) — un useAsyncData que solo lee
// el id UNA vez se queda con `[]` para siempre si esa lectura llega antes.
// El watch reintenta solo en cuanto el id esté disponible, sin importar
// cuándo — mismo espíritu que feedback_useasyncdata_ref_pagina_no_hidrata.
watch(
  () => tenantStore.activeTenant?.id,
  (tenantId) => {
    if (tenantId) void proveedoresStore.cargar(tenantId)
  },
  { immediate: true },
)

const proveedores = LISTA_DESCRIPTORES

const seleccionado = ref<IaProveedor>(proveedores[0]?.proveedor ?? 'anthropic')
const descriptor = computed(() => DESCRIPTORES[seleccionado.value])
const config = computed(
  () => proveedoresStore.configuraciones.find((c) => c.proveedor === seleccionado.value) ?? null,
)

// OpenRouter es un gateway (cientos de modelos de decenas de proveedores) —
// una lista de 3 ejemplos hardcodeados se quedaba corta y confundía
// (reportado por el usuario, 2026-09-13). Para este proveedor puntual se
// trae el catálogo real en vivo (público, sin auth, CORS abierto) en vez de
// los "modelosSoportados" curados a mano que sí bastan para los otros 3.
const esOpenRouter = computed(() => seleccionado.value === 'openrouter')
const {
  modelos: modelosOpenRouter,
  cargando: cargandoModelosOpenRouter,
  error: errorModelosOpenRouter,
  cargar: cargarModelosOpenRouter,
} = useOpenRouterModelos()
const opcionesOpenRouter = computed<OpcionSelectorBuscable[]>(() =>
  modelosOpenRouter.value.map((m) => ({
    valor: m.id,
    etiqueta: m.nombre === m.id ? m.id : `${m.nombre} — ${m.id}`,
  })),
)
watch(esOpenRouter, (activo) => {
  if (activo) void cargarModelosOpenRouter()
}, { immediate: true })

const modelo = ref('')
// Solo lo que el usuario acaba de escribir. Una credencial ya guardada se
// muestra como puntos y NO viaja de vuelta al servidor si no se reemplaza.
const credencialesNuevas = ref<Record<string, string>>({})
const reemplazando = ref<Record<string, boolean>>({})

watch(
  [seleccionado, () => proveedoresStore.configuraciones],
  () => {
    modelo.value = config.value?.modelo ?? ''
    credencialesNuevas.value = {}
    reemplazando.value = {}
  },
  { immediate: true },
)

function credencialGuardada(nombre: string): boolean {
  return config.value?.credenciales.includes(nombre) === true
}

const estado = computed(() => {
  if (!config.value) return { texto: 'Sin configurar', color: 'neutral' as const }
  if (config.value.activa) return { texto: 'Activo', color: 'success' as const }
  if (config.value.verificada_at) return { texto: 'Verificado, inactivo', color: 'info' as const }
  return { texto: 'Configurado, sin verificar', color: 'warning' as const }
})

const activoDelTenant = computed(() => proveedoresStore.configuraciones.find((c) => c.activa) ?? null)

async function ejecutar(accion: () => Promise<void>, exito: string): Promise<void> {
  try {
    await accion()
    toast.add({ title: exito, color: 'success' })
  } catch (excepcion) {
    toast.add({ title: mensajeError(excepcion, 'No se pudo completar la operación.'), color: 'error' })
  }
}

async function guardar(): Promise<void> {
  const tenantId = tenantStore.activeTenant?.id
  if (!tenantId || !modelo.value.trim()) return
  await ejecutar(
    () =>
      proveedoresStore.guardarCredenciales({
        tenantId,
        proveedor: seleccionado.value,
        modelo: modelo.value.trim(),
        credenciales: credencialesNuevas.value,
      }),
    'Configuración guardada.',
  )
}

async function probar(): Promise<void> {
  const tenantId = tenantStore.activeTenant?.id
  if (!tenantId || !config.value) return
  await ejecutar(
    () => proveedoresStore.probarConexion(tenantId, config.value!.id),
    'Credenciales verificadas en el almacén seguro.',
  )
}

async function activar(): Promise<void> {
  const tenantId = tenantStore.activeTenant?.id
  if (!tenantId || !config.value) return
  await ejecutar(
    () => proveedoresStore.activar(tenantId, config.value!.id),
    `${descriptor.value.nombreComercial} es ahora el proveedor de IA activo.`,
  )
}
</script>

<template>
  <div class="space-y-6 max-w-3xl">
    <UiTituloDescripcion>
      <template #titulo>
        <h1 class="text-xl font-semibold">Proveedor de IA</h1>
      </template>
      <template #descripcion>
        Cada copropiedad trae y paga su propio proveedor de inteligencia artificial. Esta pantalla
        solo guarda la configuración — ningún módulo de Aquila la consume todavía; queda lista
        para cuando una función puntual (por ejemplo, lectura asistida de extractos bancarios en
        PDF) la necesite.
      </template>
    </UiTituloDescripcion>

    <UAlert
      color="warning"
      variant="soft"
      icon="i-lucide-info"
      title="Fase de estructura"
      description="«Probar conexión» hoy solo confirma que la clave quedó guardada y se puede leer del almacén seguro — todavía no habla con la API real del proveedor. Eso lo hará cada función que consuma esta configuración cuando la use."
    />

    <div>
      <p class="text-xs text-muted mb-2">Proveedor</p>
      <div class="grid gap-3 sm:grid-cols-3">
        <button
          v-for="p in proveedores"
          :key="p.proveedor"
          type="button"
          class="text-left rounded-lg border p-3 transition-colors"
          :class="
            seleccionado === p.proveedor
              ? 'border-primary bg-primary/5'
              : 'border-default hover:bg-elevated'
          "
          @click="seleccionado = p.proveedor"
        >
          <div class="flex items-center justify-between gap-2">
            <span class="font-medium text-sm">{{ p.nombreComercial }}</span>
            <UBadge
              v-if="activoDelTenant?.proveedor === p.proveedor"
              color="success"
              variant="subtle"
              size="sm"
            >
              Activo
            </UBadge>
          </div>
        </button>
      </div>
    </div>

    <UCard>
      <template #header>
        <div class="flex items-center justify-between gap-3">
          <div>
            <p class="font-medium">{{ descriptor.nombreComercial }}</p>
            <ULink :to="descriptor.capacidades.urlDocumentacion" target="_blank" class="text-xs text-muted">
              Documentación del proveedor
            </ULink>
          </div>
          <UBadge :color="estado.color" variant="subtle">{{ estado.texto }}</UBadge>
        </div>
      </template>

      <div class="space-y-5">
        <UFormField
          v-if="esOpenRouter"
          label="Modelo"
          name="modelo"
          help="Catálogo real de OpenRouter, en vivo — busca por nombre o proveedor (ej. «claude», «llama», «gemini»)."
        >
          <UiSelectorBuscable
            v-if="!cargandoModelosOpenRouter && !errorModelosOpenRouter"
            :model-value="modelo || null"
            :opciones="opcionesOpenRouter"
            placeholder="Busca entre los modelos de OpenRouter…"
            @update:model-value="(v) => (modelo = v ? String(v) : '')"
          />
          <p v-else-if="cargandoModelosOpenRouter" class="text-sm text-muted">
            Cargando catálogo de OpenRouter…
          </p>
          <template v-else>
            <UInput v-model="modelo" class="w-full" placeholder="p. ej. anthropic/claude-sonnet-4.5" />
            <p class="text-xs text-warning mt-1">
              No se pudo cargar el catálogo en vivo de OpenRouter ({{ errorModelosOpenRouter }}) —
              escribe el identificador del modelo a mano.
            </p>
          </template>
          <p v-if="opcionesOpenRouter.length > 0" class="text-xs text-muted mt-1">
            {{ opcionesOpenRouter.length }} modelos disponibles hoy en OpenRouter.
          </p>
        </UFormField>
        <UFormField
          v-else
          label="Modelo"
          name="modelo"
          help="Identificador exacto del modelo, tal como lo espera la API del proveedor."
        >
          <UInput
            v-model="modelo"
            class="w-full"
            :placeholder="`p. ej. ${descriptor.capacidades.modelosSoportados[0] ?? ''}`"
          />
          <div v-if="descriptor.capacidades.modelosSoportados.length > 0" class="flex flex-wrap gap-1.5 mt-2">
            <UBadge
              v-for="m in descriptor.capacidades.modelosSoportados"
              :key="m"
              color="neutral"
              variant="subtle"
              size="sm"
              class="cursor-pointer"
              @click="modelo = m"
            >
              {{ m }}
            </UBadge>
          </div>
          <p class="text-xs text-muted mt-1">
            Sugeridos, no es una lista cerrada — verifica el nombre vigente en la documentación del
            proveedor antes de activar.
          </p>
        </UFormField>

        <div>
          <p class="text-sm font-medium mb-1">Credenciales</p>
          <p class="text-xs text-muted mb-3">
            Se guardan cifradas y no se pueden volver a leer desde ninguna pantalla — ni siquiera
            por un administrador. Para cambiar una, se reemplaza.
          </p>
          <div class="space-y-3">
            <UFormField
              v-for="nombre in descriptor.capacidades.credencialesRequeridas"
              :key="nombre"
              :label="nombre"
              :name="nombre"
            >
              <div class="flex items-center gap-2">
                <UInput
                  v-if="!credencialGuardada(nombre) || reemplazando[nombre]"
                  v-model="credencialesNuevas[nombre]"
                  type="password"
                  class="flex-1"
                  placeholder="Pegar valor"
                />
                <template v-else>
                  <UInput model-value="••••••••••••" disabled class="flex-1" />
                  <UButton size="sm" variant="outline" color="neutral" @click="reemplazando[nombre] = true">
                    Reemplazar
                  </UButton>
                </template>
              </div>
            </UFormField>
          </div>
        </div>
      </div>

      <template #footer>
        <div class="flex flex-wrap items-center gap-2">
          <UButton :loading="proveedoresStore.guardando" @click="guardar">Guardar</UButton>
          <UButton
            variant="outline"
            color="neutral"
            :disabled="!config || proveedoresStore.guardando"
            @click="probar"
          >
            Probar conexión
          </UButton>
          <UButton
            variant="outline"
            color="primary"
            :disabled="!config || config.activa || proveedoresStore.guardando"
            @click="activar"
          >
            {{ config?.activa ? 'Ya está activo' : 'Activar este proveedor' }}
          </UButton>
          <span v-if="config?.verificada_at" class="text-xs text-muted ms-auto">
            Verificado el {{ new Date(config.verificada_at).toLocaleDateString('es-CO') }}
          </span>
        </div>
      </template>
    </UCard>
  </div>
</template>
