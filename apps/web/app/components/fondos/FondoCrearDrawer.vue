<script setup lang="ts">
// Drawer "Nuevo fondo" — mismo criterio de contenedor que PresupuestoCrearDrawer.vue
// (<div class="ficha-inmueble"><UiDrawer>, contenido en Nuxt UI).
//
// Solo crea fondos de destinación específica: el de imprevistos nace solo con la
// copropiedad (fn_instanciar_fondo_imprevistos, Ley 675 art. 35) y fondos_naturaleza_
// imprevistos_unico impide un segundo — no tiene sentido ofrecer esa opción aquí.
const emit = defineEmits<{ cerrar: []; creado: [id: string] }>()

const tenantStore = useTenantStore()
const fondosStore = useFondosStore()

const tiposFondo = ref<{ valor: number; etiqueta: string }[]>([])
onMounted(async () => {
  const tenantId = tenantStore.activeTenant?.id
  if (!tenantId) return
  const tipos = await cargarListaTipos(tenantId, 'TIPO_FONDO')
  tiposFondo.value = tipos
    .filter((t) => t.codigo !== 'imprevistos')
    .map((t) => ({ valor: t.id, etiqueta: t.nombre }))
})

const codigo = ref('')
const nombre = ref('')
const tipoId = ref<number | null>(null)
const objetivo = ref('')
const destinacion = ref('')
const meta = ref<number | null>(null)
const fechaInicio = ref('')
const fechaFin = ref('')
const permanente = ref(false)
const guardando = ref(false)
const error = ref<string | null>(null)

async function guardar(): Promise<void> {
  error.value = null
  const tenantId = tenantStore.activeTenant?.id
  if (!tenantId || !codigo.value.trim() || !nombre.value.trim() || tipoId.value === null) {
    error.value = 'Completa código, nombre y tipo de fondo.'
    return
  }

  guardando.value = true
  try {
    const creado = await fondosStore.crearFondo({
      tenantId,
      codigo: codigo.value.trim(),
      nombre: nombre.value.trim(),
      naturaleza: 'destinacion_especifica',
      tipoId: tipoId.value,
      objetivo: objetivo.value.trim() || undefined,
      destinacion: destinacion.value.trim() || undefined,
      permanente: permanente.value,
      meta: meta.value ?? undefined,
      fechaInicio: fechaInicio.value || undefined,
      fechaFin: fechaFin.value || undefined,
    })
    emit('creado', creado.id)
  } catch (excepcion) {
    error.value = mensajeError(excepcion, 'No se pudo crear el fondo.')
  } finally {
    guardando.value = false
  }
}
</script>

<template>
  <div class="ficha-inmueble">
    <UiDrawer
      :abierto="true"
      titulo="Nuevo fondo"
      subtitulo="Fondo de destinación específica — nace en estado propuesto"
      @cerrar="emit('cerrar')"
    >
      <div class="grid grid-cols-2 gap-4 text-sm">
        <UFormField label="Código" name="codigo">
          <UInput v-model="codigo" class="w-full" placeholder="FON-OBRA-01" />
        </UFormField>
        <UFormField label="Tipo de fondo" name="tipo_id">
          <UiSelectorBuscable v-model="tipoId" :opciones="tiposFondo" />
        </UFormField>
        <UFormField label="Nombre" name="nombre" class="col-span-2">
          <UInput v-model="nombre" class="w-full" />
        </UFormField>
        <UFormField label="Objetivo" name="objetivo" class="col-span-2">
          <UTextarea v-model="objetivo" class="w-full" :rows="2" />
        </UFormField>
        <UFormField label="Destinación" name="destinacion" class="col-span-2">
          <UTextarea v-model="destinacion" class="w-full" :rows="2" />
        </UFormField>
        <UFormField label="Meta (opcional)" name="meta">
          <UInput v-model.number="meta" type="number" min="0" class="w-full" />
        </UFormField>
        <UFormField label="Permanente" name="permanente">
          <USwitch v-model="permanente" />
        </UFormField>
        <UFormField label="Fecha de inicio" name="fecha_inicio">
          <UInput v-model="fechaInicio" type="date" class="w-full" />
        </UFormField>
        <UFormField label="Fecha de fin (opcional)" name="fecha_fin">
          <UInput v-model="fechaFin" type="date" class="w-full" />
        </UFormField>
      </div>

      <UAlert v-if="error" color="error" variant="soft" :title="error" class="mt-4" />

      <template #foot>
        <UButton variant="ghost" @click="emit('cerrar')">Cancelar</UButton>
        <UButton :loading="guardando" @click="guardar">Crear fondo</UButton>
      </template>
    </UiDrawer>
  </div>
</template>
