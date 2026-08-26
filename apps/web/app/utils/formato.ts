/**
 * Auditoría externa 2026-08-26 (Docs/evaluacion/03): formatoMoneda estaba
 * copiado 18 veces, una de ellas (inmuebles/index.vue) con un formato
 * distinto (`$ ${Math.round(valor).toLocaleString('es-CO')}`, sin símbolo
 * de moneda real ni agrupación idéntica) — riesgo de cifras inconsistentes
 * entre pantallas contables. Único punto de verdad de aquí en adelante.
 */
export function formatoMoneda(valor: string | number): string {
  return new Intl.NumberFormat('es-CO', {
    style: 'currency',
    currency: 'COP',
    maximumFractionDigits: 0,
  }).format(Number(valor))
}
