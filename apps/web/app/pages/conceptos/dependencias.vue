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
        <p class="text-sm text-neutral-500">
          Qué conceptos dependen de cuáles, y qué reglas usan cada Contract/Function — AEL-004 Fase
          5.
        </p>
      </div>
      <NuxtLink to="/estado-cuenta/conceptos" class="text-sm text-primary hover:underline">
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
      <p v-if="conceptoStore.conceptos.length === 0" class="text-neutral-500 text-sm">
        No hay conceptos registrados.
      </p>
      <UiTabla
        v-else
        :columnas="[
          { clave: 'codigo', etiqueta: 'Código' },
          { clave: 'orden', etiqueta: 'Orden de cálculo' },
          { clave: 'dependeDe', etiqueta: 'Depende de' },
          { clave: 'usadoPor', etiqueta: 'Usado por' },
        ]"
        :filas="grafo.nodos"
        :clave-fila="(nodo) => nodo.concepto.codigo"
      >
        <template #celda-codigo="{ fila }"><span class="font-medium">{{ fila.concepto.codigo }}</span></template>
        <template #celda-orden="{ fila }">
          <span class="text-neutral-500">{{ ordenPorCodigo.get(fila.concepto.codigo) ?? '—' }}</span>
        </template>
        <template #celda-dependeDe="{ fila }">
          <span class="text-neutral-500">{{ fila.dependencias.length > 0 ? fila.dependencias.join(', ') : '—' }}</span>
        </template>
        <template #celda-usadoPor="{ fila }">
          <span class="text-neutral-500">
            {{
              (usadoPor.get(fila.concepto.codigo) ?? []).length > 0
                ? (usadoPor.get(fila.concepto.codigo) ?? []).join(', ')
                : '—'
            }}
          </span>
        </template>
      </UiTabla>
    </div>

    <div>
      <h2 class="text-lg font-semibold mb-2">Impacto por Contract/Function</h2>
      <p class="text-xs text-neutral-500 mb-2">
        Antes de archivar o cambiar un concepto, qué otras reglas usan cada
        PARAMETER/UNIT/CONCEPTO.campo o función — Doc 10 §79-80.
      </p>
      <p v-if="impacto.length === 0" class="text-neutral-500 text-sm">Sin dependencias detectadas.</p>
      <UiTabla
        v-else
        :columnas="[
          { clave: 'tipo', etiqueta: 'Tipo' },
          { clave: 'etiqueta', etiqueta: 'Contract / Function' },
          { clave: 'conceptos', etiqueta: 'Usado por' },
        ]"
        :filas="impacto"
        :clave-fila="(entrada) => entrada.etiqueta"
      >
        <template #celda-tipo="{ fila }">
          <span class="text-neutral-500">{{ fila.tipo === 'contrato' ? 'Contract' : 'Function' }}</span>
        </template>
        <template #celda-etiqueta="{ fila }"><span class="font-mono">{{ fila.etiqueta }}</span></template>
        <template #celda-conceptos="{ fila }"><span class="text-neutral-500">{{ fila.conceptos.join(', ') }}</span></template>
      </UiTabla>
    </div>
  </div>
</template>
