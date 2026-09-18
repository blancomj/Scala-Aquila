<script setup lang="ts">
// EXT-05 (reubicación desde portal-externo/mis-vinculos.vue) — cambia de rol: antes era la
// landing tras el login, ahora es SOLO el selector para cuando el actor externo tiene más de un
// vínculo vigente (mismo patrón que /seleccionar-copropiedad para tenants) — con un vínculo
// único, actorExterno.cargarVinculos() ya lo fija solo y esta página redirige de inmediato sin
// preguntar nada. El destino final ("Mis asuntos") llega en U6; hasta entonces apunta a
// /mi-copropiedad, que 404 mientras esa página no exista — mismo estado intermedio esperado que
// ya tienen los enlaces de la barra inferior del layout (EXT-05 U4).
definePageMeta({ layout: 'mi-copropiedad', publico: true })

const actorExterno = useActorExternoStore()
const cargando = ref(true)
const error = ref<string | null>(null)

const ROL_ETIQUETA: Record<string, string> = {
  copropietario: 'Copropietario',
  arrendatario: 'Arrendatario',
  inquilino: 'Inquilino',
  locatario: 'Locatario',
  usufructuario: 'Usufructuario',
}

onMounted(async () => {
  try {
    await actorExterno.cargarVinculos()
    if (actorExterno.vinculos.length === 0) {
      error.value = 'No encontramos ningún rol vigente asociado a tu cuenta.'
      return
    }
    if (actorExterno.vinculoActivoId) {
      await navigateTo('/mi-copropiedad')
      return
    }
  } catch (err) {
    error.value = mensajeError(err, 'No se pudieron cargar tus vínculos.')
  } finally {
    cargando.value = false
  }
})

function elegir(vinculoId: string): void {
  actorExterno.seleccionarVinculo(vinculoId)
  navigateTo('/mi-copropiedad')
}
</script>

<template>
  <div class="p-4 max-w-md mx-auto">
    <h1 class="text-lg font-semibold mb-4">¿Con cuál vínculo quieres continuar?</h1>

    <p v-if="cargando" class="text-sm text-gray-500">Cargando…</p>
    <UAlert v-else-if="error" color="error" variant="soft" :title="error" />

    <div v-else class="space-y-2">
      <button
        v-for="v in actorExterno.vinculos"
        :key="v.vinculo_id"
        type="button"
        class="w-full flex items-center justify-between gap-2 rounded-md border border-default px-3 py-2.5 text-sm text-left hover:bg-neutral-50 dark:hover:bg-neutral-900"
        @click="elegir(v.vinculo_id)"
      >
        <span class="truncate font-medium">{{ v.tenant_nombre }}</span>
        <span class="text-xs text-primary-600 dark:text-primary-400 shrink-0">
          {{ ROL_ETIQUETA[v.rol_codigo] ?? v.rol_codigo }}
        </span>
      </button>
    </div>
  </div>
</template>
