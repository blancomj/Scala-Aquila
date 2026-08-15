<script setup lang="ts">
// AEL-004 Fase 5 — grafo de dependencias entre conceptos + impacto por
// Contract/Function (Doc 10 §58/§79-80). Solo lectura: calcularGrafo()/
// calcularImpacto() (utils/ael-dependencias.ts) reutilizan construirGrafo()/
// ordenTopologico() reales de @aquila/liquidation-engine y extraerCapabilidades()
// de Fase 4 — esta página no calcula nada por su cuenta.
import { calcularGrafo, calcularImpacto } from '~/utils/ael-dependencias'

definePageMeta({ layout: 'default', middleware: ['tenant', 'rbac'], permiso: 'data:read' })

const tenantStore = useTenantStore()
const conceptoStore = useConceptoStore()

await useAsyncData('conceptos-dependencias', async () => {
  const tenantId = tenantStore.activeTenant?.id
  if (!tenantId) return []
  return conceptoStore.cargarConceptos(tenantId)
})

const grafo = computed(() => calcularGrafo(conceptoStore.conceptos))
const impacto = computed(() => calcularImpacto(conceptoStore.conceptos))

const usadoPor = computed(() => {
  const mapa = new Map<string, string[]>()
  for (const nodo of grafo.value.nodos) {
    for (const dependencia of nodo.dependencias) {
      const lista = mapa.get(dependencia) ?? []
      lista.push(nodo.concepto.codigo)
      mapa.set(dependencia, lista)
    }
  }
  return mapa
})

const ordenPorCodigo = computed(() => {
  const mapa = new Map<string, number>()
  grafo.value.orden?.forEach((c, i) => mapa.set(c.codigo, i + 1))
  return mapa
})
</script>

<template>
  <div class="space-y-8">
    <div class="flex items-center justify-between">
      <div>
        <h1 class="text-xl font-semibold mb-2">Dependencias e impacto</h1>
        <p class="text-sm text-gray-500">
          Qué conceptos dependen de cuáles, y qué reglas usan cada Contract/Function — AEL-004 Fase
          5.
        </p>
      </div>
      <NuxtLink to="/conceptos" class="text-sm text-primary hover:underline">
        ← Volver a conceptos
      </NuxtLink>
    </div>

    <UAlert
      v-if="grafo.desconocida"
      color="error"
      variant="soft"
      title="Dependencia desconocida"
      :description="`El concepto &quot;${grafo.desconocida.origen}&quot; referencia CONCEPTO.${grafo.desconocida.referenciado}, que no existe — no se pudo construir el grafo completo.`"
    />
    <UAlert
      v-if="grafo.ciclo"
      color="error"
      variant="soft"
      title="Ciclo de dependencias"
      :description="`${grafo.ciclo.join(' → ')} — no hay un orden de cálculo válido mientras exista este ciclo.`"
    />

    <div>
      <h2 class="text-lg font-semibold mb-2">Grafo de conceptos</h2>
      <p v-if="conceptoStore.conceptos.length === 0" class="text-gray-500 text-sm">
        No hay conceptos registrados.
      </p>
      <table v-else class="w-full text-sm">
        <thead>
          <tr class="text-left text-gray-500 border-b border-gray-200 dark:border-gray-800">
            <th class="py-1 font-medium">Código</th>
            <th class="py-1 font-medium">Orden de cálculo</th>
            <th class="py-1 font-medium">Depende de</th>
            <th class="py-1 font-medium">Usado por</th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="nodo in grafo.nodos"
            :key="nodo.concepto.codigo"
            class="border-b border-gray-100 dark:border-gray-900"
          >
            <td class="py-1.5 font-medium">{{ nodo.concepto.codigo }}</td>
            <td class="py-1.5 text-gray-500">
              {{ ordenPorCodigo.get(nodo.concepto.codigo) ?? '—' }}
            </td>
            <td class="py-1.5 text-gray-500">
              {{ nodo.dependencias.length > 0 ? nodo.dependencias.join(', ') : '—' }}
            </td>
            <td class="py-1.5 text-gray-500">
              {{
                (usadoPor.get(nodo.concepto.codigo) ?? []).length > 0
                  ? (usadoPor.get(nodo.concepto.codigo) ?? []).join(', ')
                  : '—'
              }}
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <div>
      <h2 class="text-lg font-semibold mb-2">Impacto por Contract/Function</h2>
      <p class="text-xs text-gray-500 mb-2">
        Antes de archivar o cambiar un concepto, qué otras reglas usan cada
        PARAMETER/UNIT/CONCEPTO.campo o función — Doc 10 §79-80.
      </p>
      <p v-if="impacto.length === 0" class="text-gray-500 text-sm">Sin dependencias detectadas.</p>
      <table v-else class="w-full text-sm">
        <thead>
          <tr class="text-left text-gray-500 border-b border-gray-200 dark:border-gray-800">
            <th class="py-1 font-medium">Tipo</th>
            <th class="py-1 font-medium">Contract / Function</th>
            <th class="py-1 font-medium">Usado por</th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="entrada in impacto"
            :key="entrada.etiqueta"
            class="border-b border-gray-100 dark:border-gray-900"
          >
            <td class="py-1.5 text-gray-500">
              {{ entrada.tipo === 'contrato' ? 'Contract' : 'Function' }}
            </td>
            <td class="py-1.5 font-mono">{{ entrada.etiqueta }}</td>
            <td class="py-1.5 text-gray-500">{{ entrada.conceptos.join(', ') }}</td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>
