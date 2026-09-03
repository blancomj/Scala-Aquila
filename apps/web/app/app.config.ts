// Nuxt UI v4 — alias los colores semánticos "primary"/"neutral" a las paletas
// "brand"/"northline" definidas en assets/css/tokens.css (DESIGN_SYSTEM.md en
// la raíz). success/warning/error quedan en los defaults de Nuxt UI — no hay
// necesidad de marca en esos.
//
// El nombre de la paleta NO puede coincidir con una de Tailwind (D-37): esto
// decía `neutral: 'neutral'`, que es circular —Nuxt UI redefine
// --color-neutral-* como alias de --ui-color-neutral-*—, así que archivaba el
// neutral original de Tailwind en --color-old-neutral-* y apuntaba ahí. Los
// componentes quedaban pintados con el gris puro de Tailwind y no con la
// escala del proyecto, sin ningún error visible. `primary: 'brand'` nunca
// falló porque "brand" no es una paleta de Tailwind.
//
// DESIGN_SYSTEM.md pide "rounded-sm (8px) para botones/campos, rounded-md
// (14px) para tarjetas/paneles/modales" — pero el tema interno de Nuxt UI
// trae `rounded-md` fijo en el slot `base` de button/input/textarea/select
// (verificado en .nuxt/ui/*.ts). Estos 4 son los únicos de esa familia que
// la app usa hoy (checkbox/radio-group ya traen rounded-sm/rounded-full de
// fábrica, no hacía falta tocarlos; select-menu/input-menu/input-number/etc.
// no están en uso, no se tocan). El override de un slot se fusiona con el
// tema base vía tailwind-merge — alcanza con dar la clase que compite
// (`rounded-sm`), no hay que repetir el resto de `base`.
export default defineAppConfig({
  ui: {
    colors: {
      primary: 'brand',
      neutral: 'northline',
    },
    button: { slots: { base: 'rounded-sm' } },
    input: { slots: { base: 'rounded-sm' } },
    textarea: { slots: { base: 'rounded-sm' } },
    select: { slots: { base: 'rounded-sm' } },
    // Textos explicativos de campo (help/description/hint) más pequeños que
    // la etiqueta — de fábrica heredan el mismo text-sm del root y se ven
    // igual de grandes que el label (23-08-2026).
    formField: {
      slots: {
        description: 'text-xs',
        hint: 'text-xs',
        help: 'mt-1.5 text-xs',
      },
    },
  },
})
