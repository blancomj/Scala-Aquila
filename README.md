# AQUILA

SaaS multi-tenant de administración de propiedad horizontal, con motor de liquidación
formulado mediante AEL (lenguaje de reglas de negocio).

---

## Documentación de gobierno

Léelos en este orden. La precedencia está en `PLAN_MAESTRO_IMPLEMENTACION.md` §0.1.

| Documento                                                        | Qué contiene                                                              |
| ---------------------------------------------------------------- | ------------------------------------------------------------------------- |
| [PLAN_MAESTRO_IMPLEMENTACION.md](PLAN_MAESTRO_IMPLEMENTACION.md) | **Contrato de ejecución.** Decisiones cerradas, esquema de dominio, fases |
| [PROMPT_MAESTRO_FASE1.md](PROMPT_MAESTRO_FASE1.md)               | Identidad: auth, tenants, RBAC, RLS                                       |
| [ANALISIS_DOCUMENTACION_AEL.md](ANALISIS_DOCUMENTACION_AEL.md)   | Auditoría del corpus canónico                                             |
| [DECISIONES.md](DECISIONES.md)                                   | Decisiones surgidas al implementar                                        |
| [paso0/INFORME_PASO_0.md](paso0/INFORME_PASO_0.md)               | Validación previa: reglas piloto y golden case                            |
| `Docs/01–24`                                                     | Corpus canónico. Referencia normativa, ~110k líneas                       |

> El corpus `Docs/` no cabe en la ventana de contexto de un agente. Trabaja con el plan
> maestro, que remite a las secciones concretas cuando hacen falta.

---

## Arquitectura en tres capas

```text
┌────────────────────────┐   ┌────────────────────────┐
│  A · financial-kernel  │   │  B · ael-language      │
│  Money · redondeo      │   │      ael-runtime       │
│  allocation · residual │   │  léxico · tipos · eval │
└───────────┬────────────┘   └───────────┬────────────┘
            │  independientes entre sí   │
            └─────────────┬──────────────┘
                          ▼
              ┌────────────────────────┐
              │  C · orquestación      │
              │  snapshot · grafo      │
              │  resultado · trace     │
              └────────────────────────┘
```

## Estructura

```text
packages/
  ael-core/          TypedValue · Decimal · Money · Quantity · Unit · diagnósticos
  financial-kernel/  RoundingPolicy · allocation · reconciliación      (F3)
  ael-language/      lexer · parser · AST · analyzer                   (F4)
  ael-runtime/       evaluador sobre DAG (NO es una VM — AD-21)        (F4)
apps/
  web/               Nuxt 3 SSR                                        (F1)
database/            migraciones · seeds · tests RLS                   (F1/F2)
paso0/               reglas piloto y golden case GC-001
Docs/                corpus canónico 01-24
```

## Requisitos

```text
Node   >= 22
pnpm   >= 11     (01 §6 — node_modules estricto hace cumplir 01 §7)
```

## Puesta en marcha

```bash
pnpm install
```

```bash
cp .env.example .env
```

```bash
pnpm verify
```

`verify` = `typecheck` + `lint` + `test`. Debe estar en verde antes de cualquier commit.

## Scripts

| Comando              | Qué hace                            |
| -------------------- | ----------------------------------- |
| `pnpm verify`        | typecheck + lint + test             |
| `pnpm test:watch`    | tests en modo watch                 |
| `pnpm test:coverage` | cobertura con umbrales de PLAN §9.1 |
| `pnpm build`         | compila todos los paquetes          |
| `pnpm format`        | aplica prettier                     |

---

## Reglas que no admiten excepción

Derivadas de `PLAN_MAESTRO_IMPLEMENTACION.md` §9.2:

```text
✗ float / number / parseFloat en cualquier ruta monetaria      (19 §19)
✗ epsilon en reconciliación                                    (19 §94)
✗ ajustar un resultado para que un test pase
✗ modificar un golden case para acomodar la implementación     (24 §20)
✗ aritmética monetaria fuera de financial-kernel               (PLAN §3)
✗ declarar DONE sin evidencia                                  (0AEL §28)
✗ inventar tablas, roles, permisos, fórmulas o políticas
```

Las dos primeras están además vigiladas por ESLint (`eslint.config.js`).

## Estado

```text
PASO 0   ✅ completado — GC-001 pendiente de firma funcional
F0       ✅ fundación — pnpm verify en verde
F1       ⬜ identidad
F2       ⬜ dominio PH
F3 ⟨A⟩   ⬜ kernel financiero      ┐ en paralelo
F4 ⟨B⟩   ⬜ AEL v0                 ┘
F5       ⬜ orquestación
F6       ⬜ superficie de aplicación
F7       ⬜ hardening
```
