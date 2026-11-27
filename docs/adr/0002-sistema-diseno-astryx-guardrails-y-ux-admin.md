# ADR-0002: Sistema de diseño Astryx, guardrails mecánicos AST y arquitectura UX del panel admin

- **Estado:** Aceptado
- **Fecha:** 2026-11-27
- **Área:** Sistema de Diseño, Calidad de Código y UX del Panel Administrativo

## Contexto

Con múltiples desarrolladores y agentes trabajando en paralelo sobre el sitio público brandeado (`/`, `/reservar`, `/cita/[token]`, `/mis-citas`) y el panel operativo (`/admin/*`), el código de interfaz tiende naturalmente a degradarse ("UI slop"): contenedores `<div>`/`<span>` arbitrarios, colores `#hex` y medidas `px` inline, efectos secundarios con `useEffect`/`setTimeout` dispersos en vistas, modales largos que se cortan en pantallas pequeñas y mezcla de estilos entre la marca editorial pública y el panel de trabajo diario.

Además, las reglas escritas únicamente en prosa en documentación se ignoran con facilidad bajo presión; los estándares de ingeniería del repositorio (`AGENTS.md`) establecen que toda invariante repetida debe convertirse en una verificación mecánica bloqueante.

## Decisión

1. **Astryx como base única de componentes y librería UI atómica propia:**
   - Utilizar `@astryxdesign/core` (v0.7.17) con temas generados en `src/astryx-themes.ts` (`nails` para el sitio público y `nails-admin` para el panel administrativo) y validación obligatoria del build con `astryx doctor --built .next` (`scripts/run-astryx-doctor.mjs`).
   - Estandarizar patrones recurrentes en `src/components/ui/` sobre primitivas Astryx (`FormDialog`, `ConfirmActionDialog`, `PageHeader`, `SurfaceCard`, `MetricTile`, `StatusTag`, `EmptyStateCard`, `CopyableField`, `ActionRow`, `FilterPillBar`, `SkeletonBlock`, `UploadDropzone`).

2. **Guardrails mecánicos AST + gatekeeper único `npm run verify`:**
   - Implementar un analizador basado en el AST de TypeScript en `scripts/check-guardrails.mjs` (cubierto por 29 pruebas propias en `scripts/check-guardrails.test.mjs`) que bloquea automáticamente:
     - **Cero comentarios en `src/**`** (única excepción auditada: `// INVARIANT:` y directivas triple-slash).
     - **Cero escapes de tipos:** prohíbe `any`, dobles casts (`as unknown as`), `@ts-ignore` y `@ts-expect-error`.
     - **Aislamiento de efectos de infraestructura:** prohíbe `useEffect` y `setTimeout` en `src/app/**` y `src/components/**`; únicamente viven en `src/lib/hooks/`.
     - **Fronteras Astryx:** prohíbe `<div>`/`<span>` crudos y literales `#hex`/`px` inline en código de producto TSX (excepciones acotadas a `src/app/layout.tsx`, `src/app/manifest.ts` y rutas Satori `opengraph-image.tsx` / `twitter-image.tsx`).
     - **Fronteras de dependencias y DTOs:** el dominio puro (`src/lib/availability/**`, `src/lib/booking/**`, `src/lib/contracts/**`, `src/lib/public-dto.ts`, `src/lib/cita/**`, etc.) no importa React, Next ni Supabase; las vistas públicas no pueden referenciar `commissionPercent` ni `defaultCommissionPercent`; ninguna ruta API admin (salvo `session/route.ts`) puede omitir `requireAdmin`.
     - **Higiene de estado y formularios:** prohíbe mutaciones in-place (`.sort`/`.reverse`/`.splice`) en UI, mutación directa de objetos devueltos por `getSnapshot()` y uso de `<Dialog purpose="form">` crudo en `/admin` fuera de `FormDialog`.
   - Encadenar `npm run verify`: `typecheck` (`tsc --noEmit`) → `guardrails` (`check-guardrails.test.mjs` + `check-guardrails.mjs` + `check-seed-parity.mjs` + `oxlint --deny-warnings src`) → `deadcode` (`knip`) → `test` (`vitest run`) → `build` (`next build`) → `doctor` (`astryx doctor --built .next`), exigiendo **0 errores y 0 warnings**.

3. **Identidad visual aislada para `/admin` (blanco, negro y acento cereza) + tipografía auto-hospedada:**
   - Mantener el sitio público con su estética editorial porcelana/cereza (`@fontsource/dm-sans` + `@fontsource/source-serif-4` y `.lk-root` en `src/app/globals.css`).
   - Aislar el panel `/admin` mediante selectores dedicados en `src/app/admin/admin.css` (`html:has(.ad-shell)`, `html:has(.ad-login-wrap)`, `[data-astryx-theme='nails-admin']`, `.ad-*`) con superficie blanca/gris neutra en claro (`#FFFFFF` / `#F6F6F7`), obsidiana en oscuro (`#09090B` / `#111113`), texto de alto contraste y acento cereza (`#8B1D33` / `#C8284B`), sin filtrar overrides al sitio público.
   - Cargar `Inter` (`--font-admin-sans`) y `Plus_Jakarta_Sans` (`--font-admin-display`) en `src/app/layout.tsx` vía `next/font/google`, que descarga y auto-hospeda las fuentes en tiempo de compilación (cero peticiones externas en runtime, plenamente compatible con `font-src 'self' data:` en la CSP).

4. **Modales desplazables obligatorios con `<Layout>` y `<LayoutContent>` (`FormDialog`):**
   - Encapsular los formularios modales del panel en `src/components/ui/FormDialog.tsx` (enforzado por la regla `admin-form-dialog` en `scripts/check-guardrails.mjs`).
   - Cada `FormDialog` monta `<Dialog purpose="form" maxHeight="min(90dvh, calc(100dvh - 2rem))">` con `<Layout header={<DialogHeader hasDivider ... />} content={<LayoutContent>...</LayoutContent>} footer={<LayoutFooter hasDivider>...</LayoutFooter>} />`, garantizando encabezado y botones fijos, desplazamiento interno fluido en laptops y móviles, prevención de doble envío (`createSubmitGate` en `src/lib/forms/form-submit.ts`) y bloqueo de cierre mientras guarda.

5. **Barra lateral con secciones desplegables persistidas vía `src/lib/hooks/`:**
   - Además del modo riel compacto de iconos (`src/lib/hooks/useSidebarCollapsed.ts`, clave `laikona.admin.sidebarCollapsed`, atajo `Ctrl+B`), agregar `src/lib/hooks/useSidebarSections.ts` basado en `useSyncExternalStore` (cero `useEffect` en componentes) con persistencia segura en `localStorage` bajo `laikona.admin.sidebarCollapsedSections`, respaldo ante JSON corrupto o almacenamiento bloqueado y sincronización entre pestañas (`storage`).
   - Convertir las 4 secciones de `src/components/admin/shell/adminNavConfig.ts` (`operacion`, `salon`, `profesionales`, `mas`) en disparadores accesibles (`<button aria-expanded aria-controls>` con `ChevronDown` rotatorio `.ad-nav-chev` y paneles `hidden={collapsed}`) en `AdminNavGroups.tsx`, `AdminSidebar.tsx` y el cajón móvil `AdminMobileNav.tsx`.
   - Mantener visibilidad operativa crítica: al colapsar una sección se muestran contadores agregados (`computeCollapsedSectionBadge` y `computeCollapsedStaffBadge`, ej. citas pendientes o stock bajo) en el encabezado; al navegar hacia una ruta dentro de una sección colapsada, `resolveActiveSidebarSection` la expande automáticamente; y en modo riel compacto (`isCompactRail === true`) se ignora el colapso por sección para que todos los iconos sigan accesibles.

## Alternativas consideradas

- **Usar Tailwind CSS o CSS Modules libres sin guardrails AST:** descartado porque facilita estilos ad-hoc, inconsistencias entre componentes, colores sin contraste en modo oscuro y regresiones silenciosas de accesibilidad o fronteras de seguridad.
- **Permitir `useEffect` directamente en vistas para leer `localStorage`:** descartado porque genera parpadeos de hidratación en SSR, rompe la separación UI/infraestructura y duplica lógica de suscripción; `useSyncExternalStore` encapsulado en `src/lib/hooks/` es determinista en SSR y fácilmente testeable (`useSidebarSections.test.ts`).
- **Cargar `Inter` y `Plus Jakarta Sans` con `<link>` externo a Google Fonts en runtime:** descartado porque obligaría a abrir `font-src` y `style-src` en la CSP, degradaría la privacidad y añadiría latencia externa; `next/font/google` los auto-hospeda en el bundle.
- **Aplicar la nueva paleta neutra blanco/negro directamente en `:root`:** descartado porque alteraría el diseño editorial de la landing y el flujo público de `/reservar` y `/cita/[token]`.

## Consecuencias y trade-offs

- **Positivas:**
  - Cualquier regresión de estilo, tipo, efecto prohibido, fuga de DTO o modal sin `FormDialog` falla en segundos antes de llegar a producción.
  - El panel `/admin` conserva densidad alta, lectura limpia en modo claro y oscuro, modales siempre usables en `390px` y `1280px`, y una barra lateral compacta que ahorra espacio vertical sin ocultar alertas pendientes.
  - Cero código muerto acumulado gracias a `knip` y `oxlint --deny-warnings` en cada verificación.
- **Trade-offs y riesgos asumidos:**
  - Curva de disciplina estricta: ningún cambio rápido puede dejar comentarios explicativos temporales, `<div>` crudos o `useEffect` en componentes; toda invariante de dominio debe reflejarse en nombres claros, tipos o reglas del guardrail.
  - El archivo `src/app/admin/admin.css` concentra los tokens aislados del panel; requiere mantener disciplina para que sus selectores permanezcan acotados a `.ad-*` / `[data-astryx-theme='nails-admin']`.

## Evidencia y archivos clave

- `AGENTS.md`
- `scripts/check-guardrails.mjs`
- `scripts/check-guardrails.test.mjs`
- `scripts/check-seed-parity.mjs`
- `scripts/run-astryx-doctor.mjs`
- `src/astryx-themes.ts`
- `src/app/layout.tsx`
- `src/app/admin/layout.tsx`
- `src/app/admin/admin.css`
- `src/app/globals.css`
- `src/lib/theme-presets.ts`
- `src/components/ui/FormDialog.tsx`
- `src/lib/forms/form-submit.ts`
- `src/lib/hooks/useSidebarCollapsed.ts`
- `src/lib/hooks/useSidebarSections.ts`
- `src/lib/hooks/useSidebarSections.test.ts`
- `src/components/admin/shell/adminNavConfig.ts`
- `src/components/admin/shell/AdminNavGroups.tsx`
- `src/components/admin/shell/AdminSidebar.tsx`
- `src/components/admin/shell/AdminMobileNav.tsx`
