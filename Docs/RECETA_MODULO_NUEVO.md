# Receta — enchufar un módulo nuevo a roles funcionales

Cómo hacer que un módulo nuevo (financiero, cartera_cobranza, movilidad...) sea restringible por
rol funcional. Antes de esta receta había que descubrir `puede_ver_modulo()` leyendo migraciones
viejas — esto lo deja mecánico. Contexto completo: `PROMPT_PERMISOS_CAPA2.md` (auditoría de la
capa 2 de permisos) y `supabase/migrations/20260830130000_roles_funcionales_enforcement.sql`.

## Los 4 pasos

1. **Agregar la fila a `public.modulo`** (catálogo, `20260949000000_modulo_catalogo.sql`) —
   `codigo`, `nombre`, `descripcion`, `orden`. Sin esta fila, `rol_funcional_modulo.modulo` no
   puede apuntarle (hay FK) y `v_modulo_cobertura` no lo lista.

2. **En la MISMA migración que crea las tablas del módulo**, agregar
   `and public.puede_ver_modulo(tenant_id, '<codigo>')` a sus políticas de `select`. Ejemplo
   (`20260830130000`):

   ```sql
   alter policy casos_juridicos_select_miembro on public.casos_juridicos
     using (public.is_member(tenant_id) and public.puede_ver_modulo(tenant_id, 'juridico'));
   ```

3. **Decidir con el producto qué rol(es) funcionales lo cubren** y sembrar
   `rol_funcional_modulo` en la misma migración o en una siguiente. Dos patrones ya usados:
   - **Módulo de especialidad** (financiero, jurídico, cartera_cobranza...): solo los roles a
     los que les compete — un contador no necesita ver jurídico.
   - **Módulo transversal** (anuncios, movilidad): sembrar TODOS los roles funcionales
     existentes, para que asignarle a alguien un rol cualquiera no le oculte algo que no es de
     especialidad (ver el razonamiento completo en `20260933140000_exs3_modulo_y_cron.sql`).

   Si el módulo se deja deliberadamente sin ningún rol que lo cubra (como `gobierno` hoy — no
   existe un rol funcional de esa especialidad), decirlo en un comentario explícito, igual que
   `20260933030000_exs2_puentes_deteccion.sql` — así se distingue de un olvido.

4. **Verificar en `/seguridad`** (builder de roles funcionales) que el módulo no aparezca en el
   aviso de "módulos sin cobertura", salvo que el paso 3 haya sido justamente dejarlo así.

El paso 2 es el único que exige migración, y ocurre una sola vez, cuando el módulo nace — cuando
ya se está escribiendo migraciones de todos modos. Los pasos 1 y 3 son datos (`insert`), no
lógica; si el módulo nuevo necesita un rol funcional que no existe todavía, ese rol también se
crea desde el builder (`/seguridad`, solo administradores) sin migración.

## Vocabulario vigente (2026-09-18)

`financiero`, `cartera_cobranza`, `estado_cuenta`, `juridico`, `mantenimiento`, `porteria`,
`movilidad`, `anuncios`, `marketplace`, `gobierno` — la fuente de verdad es `public.modulo`, esta
lista es solo un resumen y puede quedar desactualizada.
