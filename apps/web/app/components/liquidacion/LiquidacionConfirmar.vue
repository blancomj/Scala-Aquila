<script setup lang="ts">
// Confirmación escrita para los dos actos irreversibles: aplicar y anular.
//
// La frase a escribir es el NOMBRE DEL PERIODO, no una palabra genérica tipo
// "CONFIRMAR": obliga a leer *cuál* periodo se está tocando. Con varios
// periodos abiertos a la vez, esa diferencia es la que evita aplicar el mes
// equivocado — y un "CONFIRMAR" se teclea sin mirar.
//
// El resto del flujo no tiene esta fricción a propósito: simular y solicitar
// no comprometen nada, y ponerles trabas solo enseñaría a ignorarlas.
const props = defineProps<{
  abierto: boolean
  titulo: string
  descripcion: string
  /** Lo que va a pasar, en el orden en que pasará. */
  pasos?: { titulo: string; detalle?: string }[]
  /** Texto exacto que hay que escribir — el nombre del periodo. */
  confirmacion: string
  etiquetaAccion: string
  peligro?: boolean
  /** Motivo obligatorio (anular lo exige; aplicar no). */
  pedirMotivo?: boolean
  cargando?: boolean
}>()

const emit = defineEmits<{ cerrar: []; confirmar: [motivo: string] }>()

const texto = ref('')
const motivo = ref('')

watch(
  () => props.abierto,
  (abierto) => {
    if (abierto) {
      texto.value = ''
      motivo.value = ''
    }
  },
)

const textoCoincide = computed(
  () => texto.value.trim().toUpperCase() === props.confirmacion.toUpperCase(),
)
const motivoValido = computed(() => !props.pedirMotivo || motivo.value.trim().length >= 5)
const puedeConfirmar = computed(() => textoCoincide.value && motivoValido.value && !props.cargando)
</script>

<template>
  <UModal :open="abierto" :title="titulo" @update:open="(v) => !v && emit('cerrar')">
    <template #body>
      <div class="space-y-4">
        <p class="text-sm text-muted">{{ descripcion }}</p>

        <ol v-if="pasos?.length" class="rounded-md border border-default divide-y divide-default">
          <li
            v-for="(paso, i) in pasos"
            :key="paso.titulo"
            class="flex items-start gap-3 px-3 py-2"
          >
            <span
              class="flex size-5 shrink-0 items-center justify-center rounded-full bg-elevated text-xs font-medium tabular-nums"
            >
              {{ i + 1 }}
            </span>
            <div class="min-w-0">
              <p class="text-sm">{{ paso.titulo }}</p>
              <p v-if="paso.detalle" class="text-xs text-muted mt-0.5">{{ paso.detalle }}</p>
            </div>
          </li>
        </ol>

        <UFormField v-if="pedirMotivo" label="Motivo" name="motivo" required>
          <UTextarea
            v-model="motivo"
            :rows="2"
            placeholder="Por qué se revierte — queda como único rastro de la decisión"
            class="w-full"
          />
        </UFormField>

        <UFormField :label="`Escribe «${confirmacion}» para confirmar`" name="confirmacion">
          <UInput
            v-model="texto"
            :placeholder="confirmacion"
            autocomplete="off"
            class="w-full font-mono"
          />
        </UFormField>
      </div>
    </template>

    <template #footer>
      <div class="flex justify-end gap-2 w-full">
        <UButton color="neutral" variant="outline" :disabled="cargando" @click="emit('cerrar')">
          Cancelar
        </UButton>
        <UButton
          :color="peligro ? 'error' : 'primary'"
          :disabled="!puedeConfirmar"
          :loading="cargando"
          @click="emit('confirmar', motivo)"
        >
          {{ etiquetaAccion }}
        </UButton>
      </div>
    </template>
  </UModal>
</template>
