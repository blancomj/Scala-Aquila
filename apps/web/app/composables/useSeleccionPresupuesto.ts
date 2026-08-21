/**
 * Presupuesto activo de las páginas que lo eligen con PresupuestoSelector
 * (/presupuesto, /presupuesto/periodos, /presupuesto/control).
 *
 * Existe para que la preselección sea SSR-segura. PresupuestoSelector
 * preselecciona el presupuesto más reciente desde un `watch` con
 * `immediate`, o sea mutando durante el render: en SSR el render es
 * secuencial, así que solo lo ven los componentes que van DESPUÉS del
 * selector en el documento, mientras que en el cliente la función de render
 * de la página evalúa todos los props de una sola pasada y nadie lo ve.
 * Servidor y cliente producían marcado distinto → hydration mismatch, y
 * tras un mismatch Vue sigue parcheando contra un DOM que ya no
 * corresponde a su árbol virtual: la pantalla queda descuadrada (se vio
 * como la cáscara de una pestaña con el contenido de otra dentro).
 *
 * Dos piezas resuelven eso:
 *  - `useState` en vez de `ref`: el id elegido en SSR viaja en el payload,
 *    así que al hidratar ya está puesto.
 *  - el valor por defecto se fija en setup, ANTES de renderizar nada, en
 *    vez de como efecto durante el render — así no depende del orden.
 *
 * Llamar DESPUÉS del `await useAsyncData(...)` que puebla el store; si no,
 * la lista todavía está vacía y no hay nada que preseleccionar.
 */
export function useSeleccionPresupuesto(): Ref<string | null> {
  const presupuestoStore = usePresupuestoStore()
  const seleccionado = useState<string | null>('presupuesto-seleccionado-id', () => null)

  const primero = presupuestoStore.presupuestos[0]
  if (!seleccionado.value && primero) seleccionado.value = primero.id

  return seleccionado
}
