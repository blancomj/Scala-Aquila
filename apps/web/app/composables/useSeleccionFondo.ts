/**
 * Fondo activo compartido entre las pestañas de /fondos (Movimientos, Compromisos,
 * Solicitudes) — mismo mecanismo SSR-safe que useSeleccionPresupuesto.ts (useState en vez de
 * ref + valor por defecto fijado en setup, no como efecto durante el render), por la misma
 * razón: evitar el hydration mismatch documentado ahí.
 *
 * Llamar DESPUÉS del `await useAsyncData(...)` que puebla fondosStore.fondos.
 */
export function useSeleccionFondo(): Ref<string | null> {
  const fondosStore = useFondosStore()
  const seleccionado = useState<string | null>('fondo-seleccionado-id', () => null)

  const primero = fondosStore.fondos[0]
  if (!seleccionado.value && primero) seleccionado.value = primero.id

  return seleccionado
}
