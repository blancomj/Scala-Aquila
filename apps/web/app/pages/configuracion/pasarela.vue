<script setup lang="ts">
// Pasarela de pago — FASE DE ESTRUCTURA: se elige proveedor, se capturan
// credenciales y se activa. NO hay cobro real todavía (el botón "Pagar" del
// estado de cuenta sigue apagado, D-28).
//
// Las tarjetas y los campos de credencial se pintan desde el descriptor de
// capacidades del adaptador, NO hardcodeados aquí: agregar un proveedor no
// debería obligar a tocar este .vue.
// Solo el DESCRIPTOR (metadata: proveedor/nombre/capacidades), y del subpath
// '/descriptores' — nunca del índice del paquete ni de ADAPTADORES/
// LISTA_ADAPTADORES. El índice reexporta registro.ts, que importa wompi.ts,
// que importa node:crypto: en dev, Vite sirve ESM nativo y evalúa TODO el
// grafo de un módulo con reexports con "export … from", así que incluso
// pedir solo DESCRIPTORES desde el índice arrastra node:crypto al navegador
// igual. Por eso el subpath dedicado — nunca toca registro.ts. Esta pantalla
// nunca llama crearIntencion/validarFirmaWebhook — esas solo corren
// server-side, en las Edge Functions (2026-08-28).
import { DESCRIPTORES, LISTA_DESCRIPTORES } from '@aquila/payment-gateways/descriptores'
import type { Database } from '@aquila/shared'

definePageMeta({ layout: 'default', middleware: ['tenant', 'rbac'], permiso: 'settings:manage' })

type PasarelaProveedor = Database['public']['Enums']['pasarela_proveedor_t']
type PasarelaModo = Database['public']['Enums']['pasarela_modo_t']

const tenantStore = useTenantStore()
const pasarelasStore = usePasarelasStore()
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
    if (tenantId) void pasarelasStore.cargar(tenantId)
  },
  { immediate: true },
)

const proveedores = LISTA_DESCRIPTORES

const seleccionado = ref<PasarelaProveedor>(proveedores[0]?.proveedor ?? 'wompi')
const adaptador = computed(() => DESCRIPTORES[seleccionado.value])
const config = computed(
  () => pasarelasStore.configuraciones.find((c) => c.proveedor === seleccionado.value) ?? null,
)

// Etiquetas de los métodos: vienen del catálogo FORMA_PAGO, que es el mismo
// vocabulario que usa pagos.forma_pago_id — no un diccionario paralelo.
const ETIQUETA_METODO: Record<string, string> = {
  pse: 'PSE',
  tarjeta_credito: 'Tarjeta de crédito',
  tarjeta_debito: 'Tarjeta débito',
  nequi: 'Nequi',
  corresponsal_bancario: 'Efectivo (Efecty/Baloto)',
  transferencia_bancaria: 'Transferencia bancaria',
}
function etiquetaMetodo(codigo: string): string {
  return ETIQUETA_METODO[codigo] ?? codigo
}

const identificadorPublico = ref('')
const metodosElegidos = ref<string[]>([])
// Solo lo que el usuario acaba de escribir. Una credencial ya guardada se
// muestra como puntos y NO viaja de vuelta al servidor si no se reemplaza.
const credencialesNuevas = ref<Record<string, string>>({})
const reemplazando = ref<Record<string, boolean>>({})

watch(
  [seleccionado, () => pasarelasStore.configuraciones],
  () => {
    identificadorPublico.value = config.value?.identificador_publico ?? ''
    metodosElegidos.value = [...(config.value?.metodos ?? [])]
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
  if (config.value.activa) return { texto: 'Activa', color: 'success' as const }
  if (config.value.verificada_at) return { texto: 'Verificada, inactiva', color: 'info' as const }
  return { texto: 'Configurada, sin verificar', color: 'warning' as const }
})

const activaDelTenant = computed(() => pasarelasStore.configuraciones.find((c) => c.activa) ?? null)

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
  if (!tenantId) return
  await ejecutar(
    () =>
      pasarelasStore.guardarCredenciales({
        tenantId,
        proveedor: seleccionado.value,
        identificadorPublico: identificadorPublico.value.trim() || null,
        metodos: metodosElegidos.value,
        credenciales: credencialesNuevas.value,
      }),
    'Configuración guardada.',
  )
}

async function probar(): Promise<void> {
  const tenantId = tenantStore.activeTenant?.id
  if (!tenantId || !config.value) return
  await ejecutar(
    () => pasarelasStore.probarConexion(tenantId, config.value!.id),
    'Credenciales verificadas en el almacén seguro.',
  )
}

async function activar(): Promise<void> {
  const tenantId = tenantStore.activeTenant?.id
  if (!tenantId || !config.value) return
  await ejecutar(
    () => pasarelasStore.activar(tenantId, config.value!.id),
    `${adaptador.value.nombreComercial} es ahora la pasarela activa.`,
  )
}

async function cambiarModo(modo: PasarelaModo): Promise<void> {
  const tenantId = tenantStore.activeTenant?.id
  if (!tenantId || !config.value) return
  await ejecutar(
    () => pasarelasStore.cambiarModo(tenantId, config.value!.id, modo),
    modo === 'produccion' ? 'Modo producción. Vuelve a verificar antes de activar.' : 'Modo sandbox.',
  )
}

const opcionesModo = [
  { label: 'Sandbox (pruebas)', value: 'sandbox' },
  { label: 'Producción (dinero real)', value: 'produccion' },
]
</script>

<template>
  <div class="space-y-6 max-w-3xl">
    <UiTituloDescripcion>
      <template #titulo>
        <h1 class="text-xl font-semibold">Pasarela de pago</h1>
      </template>
      <template #descripcion>
        La copropiedad es el comercio: las credenciales son las de tu cuenta con el proveedor y el
        dinero llega directo a tu cuenta de recaudo. Aquila nunca custodia el dinero.
      </template>
    </UiTituloDescripcion>

    <UAlert
      color="info"
      variant="soft"
      icon="i-lucide-info"
      title="El botón de pago se enciende solo con Wompi activo"
      description="El cobro en línea real hoy solo está integrado con Wompi (Fase 2). Activar esta pasarela enciende el botón «Pagar ahora» del estado de cuenta público de inmediato — verifica las credenciales antes de activarla en modo producción. PayU, ePayco y Bold siguen en configuración anticipada: se pueden guardar credenciales, pero el cobro real todavía no está implementado para ellos."
    />

    <div>
      <p class="text-xs text-muted mb-2">Proveedor</p>
      <div class="grid gap-3 sm:grid-cols-2">
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
          <div class="flex items-center justify-between gap-2 mb-1.5">
            <span class="font-medium text-sm">{{ p.nombreComercial }}</span>
            <UBadge
              v-if="activaDelTenant?.proveedor === p.proveedor"
              color="success"
              variant="subtle"
              size="sm"
            >
              Activa
            </UBadge>
          </div>
          <div class="flex flex-wrap gap-1">
            <UBadge
              v-for="metodo in p.capacidades.metodosSoportados"
              :key="metodo"
              color="neutral"
              variant="subtle"
              size="sm"
            >
              {{ etiquetaMetodo(metodo) }}
            </UBadge>
          </div>
        </button>
      </div>
    </div>

    <UCard>
      <template #header>
        <div class="flex items-center justify-between gap-3">
          <div>
            <p class="font-medium">{{ adaptador.nombreComercial }}</p>
            <ULink
              :to="adaptador.capacidades.urlDocumentacion"
              target="_blank"
              class="text-xs text-muted"
            >
              Documentación y tarifas del proveedor
            </ULink>
          </div>
          <UBadge :color="estado.color" variant="subtle">{{ estado.texto }}</UBadge>
        </div>
      </template>

      <div class="space-y-5">
        <UAlert
          v-if="adaptador.proveedor === 'bold'"
          color="warning"
          variant="soft"
          icon="i-lucide-credit-card"
          title="El datáfono físico de Bold no entra aquí"
          description="Esta configuración cubre únicamente el cobro en línea. Un cobro hecho con el datáfono es un pago presencial que aparece en el reporte de liquidación de Bold y se registra por conciliación — si se asume que esta pantalla también lo cubre, el mismo pago termina registrado dos veces."
        />

        <UFormField
          label="Identificador público"
          name="identificador_publico"
          help="Clave pública / merchant id / login. No es secreto: viaja al navegador en el checkout."
        >
          <UInput v-model="identificadorPublico" class="w-full" placeholder="pub_test_..." />
        </UFormField>

        <div>
          <p class="text-sm font-medium mb-1">Credenciales</p>
          <p class="text-xs text-muted mb-3">
            Se guardan cifradas y no se pueden volver a leer desde ninguna pantalla — ni siquiera
            por un administrador. Para cambiar una, se reemplaza.
          </p>
          <div class="space-y-3">
            <UFormField
              v-for="nombre in adaptador.capacidades.credencialesRequeridas"
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
                  <UButton
                    size="sm"
                    variant="outline"
                    color="neutral"
                    @click="reemplazando[nombre] = true"
                  >
                    Reemplazar
                  </UButton>
                </template>
              </div>
            </UFormField>
          </div>
        </div>

        <div>
          <p class="text-sm font-medium mb-1">Métodos habilitados</p>
          <p class="text-xs text-muted mb-2">
            Cuáles de los métodos que soporta {{ adaptador.nombreComercial }} ofrece esta
            copropiedad.
          </p>
          <div class="flex flex-wrap gap-3">
            <UCheckbox
              v-for="metodo in adaptador.capacidades.metodosSoportados"
              :key="metodo"
              :model-value="metodosElegidos.includes(metodo)"
              :label="etiquetaMetodo(metodo)"
              @update:model-value="
                (v) =>
                  (metodosElegidos = v
                    ? [...metodosElegidos, metodo]
                    : metodosElegidos.filter((m) => m !== metodo))
              "
            />
          </div>
        </div>

        <UFormField label="Entorno" name="modo">
          <USelect
            :model-value="config?.modo ?? 'sandbox'"
            :items="opcionesModo"
            value-key="value"
            class="w-full sm:w-72"
            :disabled="!config || pasarelasStore.guardando"
            @update:model-value="(v) => cambiarModo(v as PasarelaModo)"
          />
        </UFormField>

        <UAlert
          v-if="config?.modo === 'produccion'"
          color="warning"
          variant="soft"
          icon="i-lucide-triangle-alert"
          title="Modo producción"
          description="Las transacciones que se hagan con esta configuración mueven dinero real de los propietarios. Verifica las credenciales antes de activarla."
        />
      </div>

      <template #footer>
        <div class="flex flex-wrap items-center gap-2">
          <UButton :loading="pasarelasStore.guardando" @click="guardar">Guardar</UButton>
          <UButton
            variant="outline"
            color="neutral"
            :disabled="!config || pasarelasStore.guardando"
            @click="probar"
          >
            Probar conexión
          </UButton>
          <UButton
            variant="outline"
            color="primary"
            :disabled="!config || config.activa || pasarelasStore.guardando"
            @click="activar"
          >
            {{ config?.activa ? 'Ya está activa' : 'Activar esta pasarela' }}
          </UButton>
          <span v-if="config?.verificada_at" class="text-xs text-muted ms-auto">
            Verificada el {{ new Date(config.verificada_at).toLocaleDateString('es-CO') }}
          </span>
        </div>
      </template>
    </UCard>
  </div>
</template>
