# Arquitectura SaaS Empresarial Fase I

## Plataforma Multi-Tenant basada en Supabase + Nuxt 3 para desarrollo de software web

para administracion de Propiedad horizontal FASE I (Autenticacion,Invitacion, login y Dashboard base)

**Autor:** Documento técnico de arquitectura  
**Tipo:** Arquitectura de Ingeniería de Software  
**Nivel:** Arquitectura de Sistema (Engineering Blueprint)  
**Versión:** 1.0

---

# Índice

1. [Introducción](#1-introducción)
2. [Stack Tecnológico](#2-stack-tecnológico)
3. [Arquitectura General del Sistema](#3-arquitectura-general-del-sistema)
4. [Modelo Multi-Tenant](#4-modelo-multi-tenant)
5. [Diseño de Base de Datos](#5-diseño-de-base-de-datos)
6. [Políticas Row Level Security (RLS)](#6-políticas-row-level-security-rls)
7. [Sistema de Roles y Permisos](#7-sistema-de-roles-y-permisos)
8. [Flujo de Autenticación y Autorización](#8-flujo-de-autenticación-y-autorización)
9. [Estructura del Frontend (Nuxt 3)](#9-estructura-del-frontend-nuxt-3)
10. [Stores de Pinia](#10-stores-de-pinia)
11. [Composables Reutilizables](#11-composables-reutilizables)
12. [Middleware de Seguridad](#12-middleware-de-seguridad)
13. [Tipos TypeScript](#13-tipos-typescript)
14. [Edge Functions](#14-edge-functions)
15. [Auditoría y Logging](#15-auditoría-y-logging)
16. [Estrategia de Caching](#16-estrategia-de-caching)
17. [Estrategia de Testing](#17-estrategia-de-testing)
18. [CI/CD Pipeline](#18-cicd-pipeline)
19. [Roadmap de Desarrollo](#19-roadmap-de-desarrollo)

---

# 1. Introducción

Este documento describe la **arquitectura completa de una plataforma SaaS multi-tenant** para administrar propiedad horizontal solo en
Fase 1 -> Autenicacion y Dashboard base

## Orientación del Sistema

| Objetivo                           | Descripción                                           |
| ---------------------------------- | ----------------------------------------------------- |
| Escalabilidad horizontal           | Soporte para miles de tenants y millones de registros |
| Seguridad a nivel de base de datos | RLS para aislamiento completo de datos                |
| Aislamiento de tenants             | Cada tenant accede únicamente a sus propios datos     |
| Backend serverless                 | Edge Functions para lógica de servidor                |
| Frontend desacoplado               | Nuxt 3 con renderizado híbrido (SSR/SSG)              |

---

# 2. Stack Tecnológico

## Frontend

| Tecnología      | Propósito                                     |
| --------------- | --------------------------------------------- |
| **Nuxt 3**      | Framework Vue con renderizado híbrido         |
| **Vue 3**       | Framework UI (Composition API)                |
| **TypeScript**  | Seguridad de tipos en todo el código          |
| **Nuxt UI**     | Biblioteca de componentes (Headless UI/Radix) |
| **TailwindCSS** | Utilidades de CSS                             |
| **Pinia**       | Gestión de estado global                      |

## Backend

| Tecnología         | Propósito                   |
| ------------------ | --------------------------- |
| **Supabase**       | Backend as a Service        |
| **PostgreSQL**     | Base de datos relacional    |
| **Edge Functions** | Funciones serverless (Deno) |
| **Auth**           | Sistema de autenticación    |
| **Storage**        | Almacenamiento de archivos  |

## Infraestructura

| Servicio           | Propósito                          |
| ------------------ | ---------------------------------- |
| **HOSTINGER**      | Hosting del frontend (CDN global)  |
| **Supabase Cloud** | Hosting del backend                |
| **BREVO**          | Proveedor de email transaccional   |
| **Upstash**        | Redis para caching y rate limiting |

---

# 3. Arquitectura General del Sistema

## Diagrama de Capas

```
┌─────────────────────────────────────────────────────────────────┐
│                        CLIENTE WEB (Nuxt 3)                      │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐            │
│  │   Pages     │  │ Components  │  │   Stores    │            │
│  │  (Routing)  │  │   (UI)      │  │  (State)    │            │
│  └──────┬──────┘  └─────────────┘  └──────┬──────┘            │
│         │                                   │                    │
│  ┌──────┴───────────────────────────────────┴──────┐            │
│  │              Composables / Middleware            │            │
│  └───────────────────────┬─────────────────────────┘            │
└──────────────────────────┼──────────────────────────────────────┘
                           │ useFetch / useSupabaseClient()
┌──────────────────────────┼──────────────────────────────────────┐
│                    SUPABASE AUTH                                │
│  ┌───────────────────────┴─────────────────────────┐            │
│  │              EDGE FUNCTIONS                     │          │
│  │  (createTenant, inviteUser, acceptInvite, etc.) │            │
│  └───────────────────────┬─────────────────────────┘            │
└──────────────────────────┼──────────────────────────────────────┘
                           │ RPC / SQL
┌──────────────────────────┼──────────────────────────────────────┐
│                    SUPABASE                                       │
│  ┌───────────────────────┴─────────────────────────┐            │
│  │              POSTGRESQL + RLS                    │            │
│  │  Tenant Isolation Layer                          │            │
│  └─────────────────────────────────────────────────┘            │
└──────────────────────────────────────────────────────────────────┘
```

---

# 4. Modelo Multi-Tenant

## Conceptos Clave

| Concepto       | Descripción                                |
| -------------- | ------------------------------------------ |
| **Tenant**     | Organización/empresa que usa la plataforma |
| **Usuario**    | Persona que tiene cuenta en la plataforma  |
| **Membership** | Relación usuario-tenant con rol específico |
| **Rol**        | Define permisos dentro de un tenant        |

## Relación entre Entidades

```
┌──────────┐       ┌─────────────┐       ┌──────────┐
│ usuario  │──────<│ membership  │>──────│  tenant  │
└──────────┘       └─────────────┘       └──────────┘
      │                   │                     │
      │                   │                     │
      │            ┌──────┴──────┐              │
      │            │     rol     │              │
      │            │  (enum)     │              │
      │            └─────────────┘              │
      │                                         │
      │     ┌──────────────┐                    │
      └────>│ invitaciones │<───────────────────┘
            └──────────────┘
```

---

# 7. Sistema de Roles y Permisos

## Definición de Roles

| Rol         | Descripción              | Permisos                                                |
| ----------- | ------------------------ | ------------------------------------------------------- |
| **admin**   | Administrador del tenant | Gestión completa: usuarios, settings, datos             |
| **agent**   | Agente/Operador          | CRUD en datos del tenant, ver métricas ADMIN DEL TENANT |
| **auditor** | Auditor                  | Solo lectura de datos y auditoría                       |
| **guest**   | Invitado                 | Acceso limitado a recursos específicos                  |

## Matriz de Permisos

| Recurso             | admin | agent | auditor | guest |
| ------------------- | ----- | ----- | ------- | ----- |
| Ver dashboard       | ✓     | ✓     | ✓       | ✗     |
| Gestionar usuarios  | ✓     | ✗     | ✗       | ✗     |
| Enviar invitaciones | ✓     | ✗     | ✗       | ✗     |
| CRUD datos          | ✓     | ✓     | ✗       | ✗     |
| Ver auditoría       | ✓     | ✗     | ✓       | ✗     |
| Ver métricas        | ✓     | ✓     | ✓       | ✗     |
| Configurar tenant   | ✓     | ✗     | ✗       | ✗     |

## Definición de Permisos en TypeScript

```typescript
// types/permissions.ts

export type Role = 'admin' | 'agent' | 'auditor' | 'guest'

export type Permission =
  | 'dashboard:view'
  | 'users:manage'
  | 'users:invite'
  | 'data:create'
  | 'data:read'
  | 'data:update'
  | 'data:delete'
  | 'audit:view'
  | 'metrics:view'
  | 'settings:manage'

export const ROLE_PERMISSIONS: Record<Role, Permission[]> = {
  admin: [
    'dashboard:view',
    'users:manage',
    'users:invite',
    'data:create',
    'data:read',
    'data:update',
    'data:delete',
    'audit:view',
    'metrics:view',
    'settings:manage',
  ],
  agent: ['dashboard:view', 'data:create', 'data:read', 'data:update', 'metrics:view'],
  auditor: ['dashboard:view', 'data:read', 'audit:view', 'metrics:view'],
  guest: [],
}

export function hasPermission(role: Role, permission: Permission): boolean {
  return ROLE_PERMISSIONS[role]?.includes(permission) ?? false
}

export function hasAnyPermission(role: Role, permissions: Permission[]): boolean {
  return permissions.some((p) => hasPermission(role, p))
}

export function hasAllPermissions(role: Role, permissions: Permission[]): boolean {
  return permissions.every((p) => hasPermission(role, p))
}
```

---

# 8. Flujo de Autenticación y Autorización

## Flujo de Registro

```
┌──────────┐     ┌──────────────┐     ┌───────────────┐
│ Usuario  │────>│ Nuxt Page    │────>│ Supabase Auth │
│          │     │ /register    │     │ signUp()      │
└──────────┘     └──────────────┘     └───────┬───────┘
                                               │
                    ┌──────────────────────────┼──────────────────────────┐
                    │                          ▼                          │
                    │  ┌─────────────────────────────────────────────┐   │
                    │  │         TRIGGER: on_auth_user_created       │   │
                    │  │  1. Crear profile con datos del usuario     │   │
                    │  │  2. Registrar en auditoría                  │   │
                    │  └─────────────────────────────────────────────┘   │
                    │                          │                          │
                    │     ┌─────────────────────┴─────────────────────┐   │
                    │     │                                           │   │
                    │     ▼                                           ▼   │
                    │  ┌──────────┐                            ┌──────────┐
                    │  │  ÉXITO   │                            │  ERROR   │
                    │  │ Redirect │                            │  Mostrar │
                    │  │ /create- │                            │ mensaje  │
                    │  │ tenant   │                            │          │
                    │  └──────────┘                            └──────────┘
                    └──────────────────────────────────────────────────────┘
```

## Flujo de Invitación

```
1. Agent inicia invitación (/api/invite)
      │
      ▼
2. Edge Function genera token único
      │
      ▼
3. Email enviado con enlace: /invite?token=xxx
      │
      ▼
4. Usuario hace clic en enlace
      │
      ▼
5. Página /invite valida token (¿existe? ¿no expirado? ¿ya aceptado?)
      │
      ├── Token válido ──> Mostrar formulario de registro/login
      │
      └── Token inválido ──> Mostrar error
      │
      ▼
6. Usuario se registra/inicia sesión
      │
      ▼
7. Edge Function acceptInvite:
      - Valida token nuevamente
      - Crea membership con rol asignado
      - Marca invitación como aceptada
      - Redirige a /dashboard
```

---

# 19. Roadmap de Desarrollo

## Fase 1: Fundamentos (Semanas 1-4)

| Módulo              | Descripción                               | Entregable |
| ------------------- | ----------------------------------------- | ---------- |
| Autenticación       | Registro, login, logout, password reset   | ✅         |
| Multi-Tenant        | Creación de tenants, switch entre tenants | ✅         |
| Gestión de Usuarios | Perfiles, membresías, invitaciones        | ✅         |
| RBAC                | Roles, permisos, middleware               | ✅         |
| Dashboard           | Vista general                             | ✅         |

## Fase 2: Colaboración (Semanas 5-8)

| Módulo         | Descripción                            | Entregable |
| -------------- | -------------------------------------- | ---------- |
| Invitaciones   | Flujo completo de invitación por email | ⏳         |
| Auditoría      | Log de acciones, historial de cambios  | ⏳         |
| Notificaciones | Emails transaccionales, alertas        | 📋         |
| Settings       | Configuración de cuenta y tenant       | 📋         |

# Anexo: Variables de Entorno

```bash
# .env.example

# Supabase
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key

# App
NUXT_PUBLIC_APP_URL=http://localhost:3000
NUXT_PUBLIC_APP_NAME="SaaS App"

# Email (Resend)
RESEND_API_KEY=re_your_key

# Redis (Upstash)
REDIS_URL=https://your-redis.upstash.io
REDIS_TOKEN=your-token

# Analytics (opcional)
POSTHOG_API_KEY=phc_your_key
```

---

# Conclusión

Esta arquitectura proporciona una base sólida para construir plataformas SaaS modernas con:

- ✅ **Seguridad robusta**: RLS a nivel de base de datos, RBAC, auditoría completa
- ✅ **Multi-Tenant escalable**: Aislamiento lógico con memberships
- ✅ **Código mantenible**: TypeScript estricta, Composition API, composables reutilizables
- ✅ **Testing coverage**: Unit tests, integración, E2E
- ✅ **CI/CD automatizado**: GitHub Actions con lint, test, build, deploy

El documento está diseñado para servir como referencia técnica completa para el desarrollo del proyecto SaaS.
