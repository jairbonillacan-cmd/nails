# LAIKONA NAILS — Reporte Ejecutivo de Resultados (Olas 1–6) y Hoja de Ruta Estratégica de Alto ROI

> **Estudio:** **LAIKONA NAILS by Karla** (`Calle 25 Sur 1904, Col. Volcanes, 72410 Puebla, Pue.` · `@laikona.nailsss`)
> **Fecha de cierre:** 2026-11-26
> **Línea base auditada (Wave 1):** `1e40a12` · **Código verificado (Wave 6 Final):** `6fd26bd` (`BUILD_ID: Hs8GmdyI0OotKiyhHWgNG`)
> **Arquitectura productiva:** Next.js 16 (App Router) + Astryx Design System v0.7.17 + Cloudflare Workers (`@opennextjs/cloudflare`) + R2 privado + Supabase + WhatsApp Cloud API (`UTILITY` / Coexistence)
> **Evidencia técnica completa:** [`docs/proposals/baseline-and-results.md`](./baseline-and-results.md)

---

## Sección 1 · Resumen Ejecutivo y Tabla Antes vs. Después

Tras 6 olas iterativas auditadas con telemetría real de Chromium (`Chrome/159.0.8154.6`, build de producción en `:1718`, Service Worker omitido y caché deshabilitada), pruebas end-to-end duales y el gatekeeper mecánico `npm run verify`, la plataforma de **LAIKONA NAILS** quedó lista para operar en producción en Cloudflare Workers con mejoras medibles en rendimiento 4G, seguridad, SEO local en Puebla, accesibilidad móvil y mantenibilidad del código:

- **Hasta `-30.0%` menos peso de carga inicial y `-93.02%` menos activos en `public/`:** `/reservar` bajó de `1,130.0 KB` a **`790.8 KB`** (`-59.0%` en imágenes y `-21.6%` en JS wire / `-23.1%` en JS SSR gz), `/` redujo su CLS en **`-98.1%`** (`0.0423 → 0.0008`) y `public/` pasó de `15.82 MB` (`128` archivos) a **`1.10 MB`** (`61` archivos, `0 MB` huérfanos).
- **Seguridad `8/8` cerrada y bloqueada mecánicamente:** Los `4 HIGH`, `3 MEDIUM` y `1 LOW` (`SEC-01`..`SEC-08`) fueron remediados con contratos Zod estrictos, saneamiento DTO en respuestas públicas y admin, precedencia `cf-connecting-ip`, rate limiting ampliado, bloqueo de URLs externas en cargas públicas y CSP estricta sin romper `/reservar?embed=1` ni Google Maps.
- **Cero monolitos UI/API (`38 → 0`) y sistema atómico sobre Astryx:** Se crearon `11` componentes atómicos en `src/components/ui/`, `10` módulos de contratos Zod puros en `src/lib/contracts/` y el hook `useCopyToClipboard`, descomponiendo los monolitos de agenda, disponibilidad, marca, servicios, caja y reserva bajo `<= 400` LOC.
- **SEO local Puebla 100% cubierto y accesibilidad móvil sin defectos:** Tarjetas sociales dinámicas `1200×630` PNG por servicio, `metadataBase` HTTPS (cero `localhost`), JSON-LD `@graph` (`NailSalon`/`BeautySalon`, `WebSite`, `FAQPage`, `Service`/`Offer`/`BreadcrumbList`), `noindex` en las `3` áreas privadas, contraste **`18.79:1`** en el menú móvil sobre el hero oscuro y **`0` botones/enlaces `< 44×44px`** en rutas públicas y las `12` rutas admin.

### 1.1 Scorecard Verificado: Wave 1 Baseline (`1e40a12`) vs. Wave 6 Final (`6fd26bd`)

| Dimensión | Métrica verificada | Wave 1 Baseline (`1e40a12`) | Wave 6 Final (`6fd26bd`) | Delta / Estado |
|---|---|---:|---:|---|
| **CWV `/` Desktop (`1440×900`)** | LCP / CLS / INP | `184 ms` (`IMG`) / `0.0423` / `32 ms` | **`172 ms` (`IMG`) / `0.0008` / `16 ms`** | **LCP `-6.5%` · CLS `-98.1%` · INP `-50.0%`** |
| **Payload `/` Desktop (`1440×900`)** | Total / Img / CSS SSR gz / JS SSR gz | `1,149.8` / `643.3` / `64.5` / `328.6 KB` | **`907.3` / `309.1` / `61.9` / `369.0 KB`** | **Total `-21.1%` · Img `-52.0%` · CSS `-4.0%`** |
| **Payload `/` Móvil (`390×844`)** | Total / Img / CLS / LCP | `1,191.1` / `647.8 KB` / `0.0000` / `116 ms` | **`898.3` / `308.2 KB` / `0.0000` / `140 ms`** | **Total `-24.6%` · Img `-52.4%` · `0 px` overflow** |
| **Payload `/reservar` (`1440×900`)** | Total / Img / JS wire (SSR gz) / CSS SSR gz | `1,130.0` / `412.8` / `547.5` / `64.5 KB` | **`790.8` / `169.4` / `429.2` (`420.9`) / `60.5 KB`** | **Total `-30.0%` · Img `-59.0%` · JS `-21.6%` (`-23.1%` SSR)** |
| **LCP `/reservar` y `/cita/*`** | Elemento LCP y marcas de agua | `IMG.rb-hero-cherries` (6 rutas) | **`SECTION` hero (`164–204 ms`)**; `::before` mask CSS | **Anomalía LCP y `<img>` lazy ocultos eliminados (`0` rotas)** |
| **Payload `/reservar/rubber`** | Total / Img / JS wire (SSR gz) | `1,138.8` / `412.8` / `553.2 KB` | **`802.1` / `169.4` / `436.9` (`428.6`) KB`** | **Total `-29.6%` · Img `-59.0%` · JS `-21.0%` (`-22.5%` SSR)** |
| **Payload `/links` (`390×844`)** | Total / Img / CSS SSR gz | `725.5` / `240.4` / `64.5 KB` | **`716.6` / `181.9` / `58.8 KB`** | **Img `-24.3%` · CSS `-8.8%` · botón IG sin recorte** |
| **Payload `/admin/login` (`1440×900`)** | CSS SSR gz / Total | `71.1` / `616.4 KB` | **`64.4` / `670.1 KB`** | **CSS SSR gz `-9.4%`** |
| **CSS Crudo y Scoping** | `globals.css` / `admin.css` (clases muertas) | `62.08` / `45.19 KB` (`9` muertas) | **`20.69` / `42.62 KB` (`0` muertas; `26` podadas)** + `4` hojas por ruta (`landing` `22.04`, `booking` `13.61`, `cita` `2.87`, `portal` `3.10 KB`) | **`globals.css` `-66.7%` · `admin.css` `-5.7%` · 0 fugas admin en público** |
| **Activos en `public/`** | Tamaño total / archivos (huérfanos) | `15.82 MB` / `128` (`12.89 MB` huérfanos) | **`1.10 MB` / `61` (`0 MB` huérfanos)** | **`-93.02%` peso · `-67` archivos huérfanos · avatares WebP `-90%+`** |
| **Code-Splitting y Memo** | `next/dynamic` / `React.memo` | `11` / `0` | **`32` (`16` archivos) / `5` (`5` archivos)** | **`+21` fronteras lazy + `@supabase/supabase-js` diferido (`-63.4 KB` gz)** |
| **Monolitos `> 400` LOC** | Archivos prod UI/API (total `src/`) | `38` UI/API (`50` total) | **`0` UI/API** (`17` total: `15` `src/lib/` + `2` rutas Satori `584` L) | **100% de páginas, componentes y API routes `<= 400` LOC** |
| **Pruebas y Gatekeeper** | Vitest / Guardrails / E2E / Doctor / Lint | `291` Vitest · `21` guardrails · `0/0` verify | **`338/338` Vitest (`52` arch.) · `24/24` guardrails (`390` arch.) · `9/9` E2E prod (`657 ms`) & `9/9` demo (`1,942 ms`) · `25/25` Astryx Doctor · `0` oxlint/knip/tsc** | **`+47` tests unitarios · `+3` pruebas de guardrails · `0` errores / `0` warnings** |
| **Seguridad (`SEC-01`..`SEC-08`)** | Hallazgos abiertos HIGH / MED / LOW | `4` HIGH · `3` MEDIUM · `1` LOW | **`0` HIGH · `0` MEDIUM · `0` LOW (`8/8` cerrados)** | **Blindado con AST `no-sensitive-admin-secrets-in-api` + Vitest + E2E** |
| **SEO Local Puebla** | OG/Twitter PNGs · `metadataBase` · JSON-LD · `noindex` | `0%` OG · `localhost` en sitemap · `1/3` privados `noindex` | **`100%` rutas públicas con `1200×630` PNG, canonical HTTPS, `@graph` (`NailSalon`/`BeautySalon` + `WebSite` + `FAQPage` + `Service`/`Offer`/`BreadcrumbList`), PWA PNG/ICO · `3/3` privados `noindex`** | **Bloqueado mecánicamente con `no-localhost-in-seo` + E2E** |
| **Accesibilidad y UX Móvil** | Contraste burger `/` · targets `<44px` · WCAG AA | `1` HIGH (oscuro/oscuro) · `22` en `/` y `5–38` en admin (`20px` reportes) | **`18.79:1` compuesto (`18.58:1` directo) en `44×44px` · `0` botones/enlaces `<44px` · `0` fallos WCAG AA (claro y oscuro)** | **`0` errores consola/hidratación/CSP/`>=400` · copy 100% sin jerga** |
| **Cloudflare Workers (`cf:build`)** | Bundle Workers + R2 + dry-run | No auditado en Wave 1 | **EXIT `0` · `25,599.79 KiB` raw / `5,960.32 KiB` gz (`5.82 MiB` gz)** · `327` assets · `SALON_MEDIA_BUCKET` | **Holgado bajo el límite de `10 MiB` gz de Workers** |
| **Entorno `dev:lan` (`:3000`)** | Salud de `.next-preview` | Activo en `:3000` | **`GET /` `200`, `GET /reservar` `200`, chunk CSS activo `200` (`442,588 B`)** | **100% intacto durante y después de todas las olas** |

> *Nota técnica sobre transferencia CSS/JS:* En las pruebas locales HTTP/1.1 (`:1718`), CDP incluye ~`1.1 KB` de cabeceras HTTP/CSP por archivo y hojas prefetcheadas de `<Link>` visibles en viewport. Los valores SSR gz representan exactamente los bytes comprimidos entregados para el render inicial de cada ruta; sobre HTTP/2 HPACK en Cloudflare Edge las cabeceras comprimen a bytes despreciables.

### 1.2 Trazabilidad de Commits Locales (6 Olas Completas)

| Ola | Commit | Resumen verificado |
|---|---|---|
| **Baseline** | `1e40a12` | `feat(reservar): move nail art and extra services into dedicated step` (estado previo auditado). |
| **Wave 1** | `37abc07` | `docs(audit): record Wave 1 360 baseline and atomic architecture` — 42 pasadas Chromium, inventario de 50 monolitos, auditoría `SEC-01`..`SEC-08`, plano `ui/` y `contracts/`. |
| **Wave 2** | `f1a29c6` | `refactor(architecture): Wave 2 atomic UI library, pure Zod contracts, security hardening, and monolith decomposition` — 11 módulos UI Astryx, 10 módulos Zod puros, `SEC-01`..`SEC-07` cerrados, `38 → 0` monolitos UI/API. |
| **Wave 3** | `85a62e0` | `feat(seo): Wave 3 dynamic OG/Twitter cards, Puebla local JSON-LD, FAQ, canonicals, and private noindex` — tarjetas Satori `1200×630`, `metadataBase` HTTPS, `@graph` + `#preguntas`, `noindex` 3/3. |
| **Wave 4** | `403a257` | `perf(web): Wave 4 route-scoped CSS, 93% media reduction, code-splitting, 4G draft resilience, and Edge CSP` — CSS por ruta (`-66.7%` globals), `public/` `15.82 → 1.10 MB`, `32` `next/dynamic`, borrador 4G `sessionStorage`, `SEC-08` cerrado, `cf:build` `5.82 MiB` gz. |
| **Wave 5** | `6fd26bd` | `polish(ux-a11y): Wave 5 public & non-technical admin UX, WCAG AA contrast, >=44px mobile targets, guardrails, and E2E` — contraste `18.79:1`, `0` targets `<44px`, copy admin sin jerga, guardrails SEO/secretos, `9/9` E2E dual. |
| **Wave 6** | *Commit actual (`HEAD`)* | `docs(report): Wave 6 final Before/After verification scorecard and strategic ROI roadmap` — verificación final integral, cierre de scorecard Antes/Después y hoja de ruta de ROI. |

### 1.3 Evidencia Visual Comparativa (Antes Wave 1 vs. Después Wave 6)

| Vista y tema | Captura Antes (Wave 1 · `1e40a12`) | Captura Después (Wave 6 · `6fd26bd`) | Mejora visual y técnica verificada |
|---|---|---|---|
| `/` Escritorio (`1440×900`, claro) | `C:\Users\jairb\.gemini\antigravity\brain\4b186c86-4597-46bf-9e92-e6ff10aca7b8\baseline-home-desktop-light.png` | `C:\Users\jairb\.gemini\antigravity\brain\2cfe65f2-50f9-4b95-ba9d-802fa79febeb\final-home-desktop-light.png` | CLS `-98.1%`, imágenes `-52.0%`, sección `#preguntas` accesible y `alt` editoriales completos. |
| `/` Móvil (`390×844`, claro) | `C:\Users\jairb\.gemini\antigravity\brain\4b186c86-4597-46bf-9e92-e6ff10aca7b8\baseline-home-mobile-light.png` | `C:\Users\jairb\.gemini\antigravity\brain\2cfe65f2-50f9-4b95-ba9d-802fa79febeb\final-home-mobile-light.png` | Botón `Abrir menú` visible sobre hero oscuro (`44×44px`, `18.79:1`), `0` targets `<44px`, peso `-24.6%`. |
| `/reservar` Escritorio (`1440×900`, claro) | `C:\Users\jairb\.gemini\antigravity\brain\4b186c86-4597-46bf-9e92-e6ff10aca7b8\baseline-reservar-desktop-light.png` | `C:\Users\jairb\.gemini\antigravity\brain\2cfe65f2-50f9-4b95-ba9d-802fa79febeb\final-reservar-desktop-light.png` | Carga total `-30.0%`, JS `-21.6%`, marcas de agua migradas a CSS `::before`, borrador 4G persistente. |
| `/reservar` Móvil (`390×844`, claro) | `C:\Users\jairb\.gemini\antigravity\brain\4b186c86-4597-46bf-9e92-e6ff10aca7b8\baseline-reservar-mobile-light.png` | `C:\Users\jairb\.gemini\antigravity\brain\2cfe65f2-50f9-4b95-ba9d-802fa79febeb\final-reservar-mobile-light.png` | CTA inferior `Continuar` elevado de `36px` a `44px`, recuperación 4G en 1 clic, `0px` overflow. |
| `/admin` Escritorio (`1440×900`, claro) | `C:\Users\jairb\.gemini\antigravity\brain\4b186c86-4597-46bf-9e92-e6ff10aca7b8\baseline-admin-desktop-light.png` | `C:\Users\jairb\.gemini\antigravity\brain\2cfe65f2-50f9-4b95-ba9d-802fa79febeb\final-admin-desktop-light.png` | Navegación cotidiana (`Tu día` / `Tu salón` / `Más herramientas`), composición 100% `src/components/ui/`. |
| `/admin` Escritorio (`1440×900`, oscuro) | `C:\Users\jairb\.gemini\antigravity\brain\4b186c86-4597-46bf-9e92-e6ff10aca7b8\baseline-admin-desktop-dark.png` | `C:\Users\jairb\.gemini\antigravity\brain\2cfe65f2-50f9-4b95-ba9d-802fa79febeb\final-admin-desktop-dark.png` | Contraste WCAG AA verificado en modo oscuro (`rgb(18, 16, 17)`, bordes `--ad-border-control >= 3:1`). |
| `/admin` Móvil (`390×844`, oscuro) | `C:\Users\jairb\.gemini\antigravity\brain\4b186c86-4597-46bf-9e92-e6ff10aca7b8\baseline-admin-mobile-dark.png` | `C:\Users\jairb\.gemini\antigravity\brain\2cfe65f2-50f9-4b95-ba9d-802fa79febeb\final-admin-mobile-dark.png` | Eliminados los `21` targets `<44px` de Wave 1 (`0` restantes), barra inferior con `safe-area`, `0px` overflow. |

---

## Sección 2 · Catálogo de Componentes Atómicos (`src/components/ui/`) y Contratos (`src/lib/contracts/`) + Guía Breve de Uso

### 2.1 Catálogo de Componentes Atómicos Astryx (`src/components/ui/` · 11 Módulos + `useCopyToClipboard`)

Todos los módulos viven en `src/components/ui/`, componen únicamente primitivas de `@astryxdesign/core` v0.7.17 (cero `<div>`/`<span>` crudos, cero `#hex`/`px` inline, cero `useEffect`/`setTimeout`) y garantizan altura mínima táctil de `2.75rem` (`44px`) en controles interactivos y paridad total en modo claro y oscuro.

| # | Módulo (`src/components/ui/`) | Exportaciones | Primitivas `@astryxdesign/core` | Props principales | Uso actual |
|---:|---|---|---|---|---:|
| 1 | `PageHeader.tsx` | `PageHeader` | `HStack`, `VStack`, `Heading` (`level={1}`), `Text` | `eyebrow?`, `title`, `subtitle?`, `meta?`, `actions?`, `className?` | `12` archivos |
| 2 | `SurfaceCard.tsx` | `SurfaceCard` | `VStack` (`as="section"`), `HStack`, `Heading` (`2\|3`), `Text`, `Badge` | `id?`, `title?`, `subtitle?`, `icon?`, `count?`, `badge?`, `actions?`, `footer?`, `tone?: 'default'\|'subtle'\|'accent'\|'warning'`, `padded?`, `overflowVisible?`, `headingLevel?`, `children` | `73` archivos |
| 3 | `MetricTile.tsx` | `MetricGrid`, `MetricTileItem` | `VStack` (`as="article"`), `HStack`, `Grid`, `Text` (`hasTabularNumbers`) | `ariaLabel`, `items` (`id`, `label`, `value`, `sub?`, `tone?: 'default'\|'warning'\|'success'\|'accent'`, `interactive?`), `cols?: 2\|3\|4`, `footerLink?` | `11` archivos |
| 4 | `StatusTag.tsx` | `StatusTag`, `BookingStatusTag`, `WaitlistStatusTag`, `PackageStatusTag`, `StatusTagTone` | `Token`, `StatusDot` | `StatusTag`: `label`, `tone?`, `showDot?`, `icon?`, `size?: 'sm'\|'md'`, `hasTabularNumbers?`. Mappers de dominio: `status`, `hasPaymentProof?`, `isExpired?` | `66` archivos (`+14` mappers) |
| 5 | `EmptyStateCard.tsx` | `EmptyStateCard` | `EmptyState` + `SurfaceCard` (`tone="subtle"`) | `title`, `description?`, `icon?`, `actions?`, `headingLevel?: 2\|3\|4`, `isCompact?`, `framed?` | `31` archivos |
| 6 | `CopyableField.tsx` | `CopyableField` | `HStack`, `VStack`, `Text`, `Button`, `IconButton` + `useCopyToClipboard` | `label?`, `value`, `displayValue?`, `copyValue?`, `copyLabel?`, `copiedLabel?`, `feedbackMessage?`, `monospace?`, `layout?: 'inline'\|'stacked'`, `iconOnly?`, `endExtra?` | `15` archivos |
| 7 | `ActionRow.tsx` | `ActionRow` | `HStack`, `VStack`, `Text` | `leading?`, `title`, `subtitle?`, `meta?`, `status?`, `actions?`, `interactive?`, `isSelected?`, `isMuted?`, `onClick?` | `19` archivos |
| 8 | `ConfirmActionDialog.tsx` | `ConfirmActionDialog` | `AlertDialog` (WAI-ARIA `alertdialog`, default `cancelLabel="Cancelar"`) | `isOpen`, `onOpenChange`, `title`, `description`, `confirmLabel`, `cancelLabel?`, `variant?: 'destructive'\|'primary'`, `isLoading?`, `onConfirm` | `8` archivos |
| 9 | `FilterPillBar.tsx` | `FilterPillBar`, `FilterPillOption<T>` | `SegmentedControl` / `SegmentedControlItem` o `HStack` + `ToggleButton` + `Badge` | `ariaLabel`, `value`, `options` (`value`, `label`, `count?`, `icon?`, `isDisabled?`), `onChange`, `mode?: 'segmented'\|'pills'`, `size?`, `layout?`, `isDisabled?` | `20` archivos |
| 10 | `SkeletonBlock.tsx` | `SkeletonBlock`, `PageSkeleton` | `Skeleton`, `VStack`, `Grid` | `SkeletonBlock`: `width?`, `height?`, `radius?`, `index?`. `PageSkeleton`: `kpiCount?`, `withSplit?`, `ariaLabel?` (`role="status"`, `aria-live="polite"`) | `29` archivos (`13` + `16`) |
| 11 | `UploadDropzone.tsx` *(subpath directo)* | `UploadDropzone` | `FileInput`, `VStack`, `HStack`, `Button`, `Text`, `Banner`, `ProgressBar` + `StatusTag` | `label`, `accept?`, `previewUrl`, `previewAlt`, `fileName?`, `fileSizeLabel?`, `progress?`, `error?`, `isDisabled?`, `isOptional?`, `helperText?`, `onSelectFile`, `onClear` | `3` archivos |
| **Hook** | `src/lib/hooks/useCopyToClipboard.ts` | `useCopyToClipboard`, `writeTextToClipboard`, `createCopyToClipboardController` | Hook de infraestructura (`useEffect` + timer limpio y testeable) | `durationMs = 2400` → `{ copied, feedback, copy(value, successMsg?, fallbackMsg?), reset }` | `9` archivos |

> *Nota sobre `src/components/ui/index.ts`:* Re-exporta los primeros `10` módulos para conveniencia dentro de `/admin`; **`UploadDropzone.tsx` queda intencionalmente fuera del barril** para no arrastrar `FileInput` + `ProgressBar` en páginas sin subida de archivos.

### 2.2 Catálogo de Contratos Zod Puros (`src/lib/contracts/` · 10 Módulos TS + `contracts.test.ts`)

`src/lib/contracts/` es una capa de **dominio puro** blindada por `scripts/check-guardrails.mjs` (solo puede importar `zod` y otros archivos puros; cero React, Next, Supabase o repositorios) y consumida actualmente en **`21` archivos** (API routes, DTOs y esquema de base).

| # | Módulo (`src/lib/contracts/`) | Schemas y helpers clave | Responsabilidad y frontera de seguridad |
|---:|---|---|---|
| 1 | `enums.ts` | `AdminRoleSchema`, `BookingStatusSchema`, `BookingSourceSchema`, `PaymentModeSchema`, `PaymentSplitMethodSchema`, `NotificationChannelSchema`, `ProofDeliveryMethodSchema`, `RatingSchema`, `WaitlistStatusSchema`, `ClientPackageStatusSchema`, `CampaignKindSchema`, `AuditActionSchema` (`29` enums) | Única fuente de verdad para uniones de dominio (elimina copias divergentes entre rutas API y esquema DB). |
| 2 | `primitives.ts` | `DateKeySchema`, `TimeHHMMSchema`, `NonEmptyIdSchema`, `PhoneInputSchema`, `OptionalEmailSchema`, `InstagramHandleSchema`, `CentsNonNegativeSchema`, `ClientContactFieldsSchema`, `isSafeInternalBookingMediaPath`, `createPublicMediaUrlSchema` | Unifica formato de fechas/horas/teléfonos MX y **cierra `SEC-07`**: rechaza URLs `http(s)://` arbitrarias en flujos públicos (solo `data:image/(png\|jpeg\|webp)` `<= 4 MB` o rutas internas seguras `/api/media/{inspo,proofs}/...`). |
| 3 | `bookings.ts` | `PublicCreateBookingSchema`, `AdminCreateBookingSchema`, `ManageBookingPatchSchema`, `SubmitReviewSchema`, `SendReminderSchema`, `RequestRescheduleSchema`, `CheckoutSplitSchema`, `AdminPatchBookingStatusSchema`, `CreateSlotHoldSchema`, `CreateWaitlistSchema`, `ValidateCouponSchema` | Separa estrictamente la creación pública (sin `forceConfirmed`, `source` ni `role`, verificado por AST `no-privileged-public-fields`) de la creación/cobro administrativo. |
| 4 | `availability.ts` | `PutScheduleSchema`, `PostOverrideSchema`, `PostOverrideRangeSchema`, `PreloadHolidaysSchema`, `PostRecurringBlockSchema`, `ToggleRecurringBlockSchema`, `PublicAvailabilityQuerySchema` | Valida ventanas horarias (`startTime < endTime`), turnos fijos contenidos dentro del turno, festivos MX y consultas públicas de disponibilidad. |
| 5 | `catalog.ts` | `CatalogMutationSchema` (`discriminatedUnion` `'service' \| 'addon'`), `StarterServiceSchema`, `CreateServicePackageSchema`, `AssignClientPackageSchema`, `PatchClientPackageSchema` | Valida servicios, extras, paquetes prepagados y canjes en `/api/admin/services`, `/api/admin/onboarding` y `/api/admin/packages`. |
| 6 | `clients.ts` | `CreateClientSchema`, `PatchClientSchema`, `ClientPortalOtpActionSchema` (`request \| verify` OTP 6 dígitos), `DispatchCampaignSchema` | Valida CRM, portal OTP de `/mis-citas` y envío de campañas de cumpleaños/reactivación. |
| 7 | `brand.ts` | `LandingContentSchema`, `BrandPatchSchema` (parcial completo de marca, SPEI, lealtad, PIN de Dueña, Pixel/GA4), `GalleryItemInputSchema`, `OnboardingPostSchema`, `ReportPeriodSchema` | Protege `/api/admin/brand`, `/api/admin/onboarding` y el parámetro `period` de `/api/admin/reports`. |
| 8 | `operations.ts` | `AdminOperationsPostSchema` (`discriminatedUnion` estricta sobre `'calendar' \| 'cash' \| 'inventory' \| 'coupon' \| 'waitlist' \| 'workflow'` con `.strict()`) | **Cierra `SEC-02`**: bloquea *mass assignment* en `POST /api/admin/operations`. |
| 9 | `team.ts` | `AdminTeamPostSchema` (`discriminatedUnion` estricta `'admin_user' \| 'staff'` con `.strict()`), `DemoLoginSchema`, `SupabaseLoginSchema` | **Cierra `SEC-02`**: valida altas/ediciones de equipo y sesiones admin con rechazo `401` vs `403`. |
| 10 | `index.ts` *(+ `contracts.test.ts`)* | Barril libre de efectos secundarios re-exportando todos los contratos | Punto único de consumo tipado; `contracts.test.ts` valida regresiones de `SEC-02`, `SEC-07` y límites de rango. |

### 2.3 Guía Práctica de Desarrollo (5 Reglas de Oro + Snippets)

1. **Prefiere importaciones directas por subpath en rutas públicas:** importa `@/components/ui/SurfaceCard` o `@/components/ui/CopyableField` (y siempre `@/components/ui/UploadDropzone`) para evitar arrastrar componentes de admin al bundle de `/`, `/reservar` o `/cita/[token]`.
2. **`Badge` es únicamente para conteos numéricos; usa `StatusTag` para estados:** nunca coloques texto de estado dentro de `@astryxdesign/core/Badge`. Usa `BookingStatusTag`, `WaitlistStatusTag`, `PackageStatusTag` o `StatusTag` (`Token` + `StatusDot`).
3. **Cero `useEffect` y `setTimeout` en `src/app/**` y `src/components/**`:** cualquier efecto de red, temporizador, portapapeles (`useCopyToClipboard`), `sessionStorage` (`useBookingDraft`) o suscripción Realtime vive en `src/lib/hooks/`.
4. **Tokens Astryx, cero `<div>`/`<span>` crudos y mínimo `44×44px` en móvil:** compone layouts con `VStack`, `HStack` y `Grid`; usa `var(--color-*)`, `var(--spacing-*)`, `var(--radius-*)` y unidades `rem` para mantener contraste WCAG AA en modo claro y oscuro (`data-theme="dark"`).
5. **Contratos Zod primero y `npm run verify` obligatorio:** define el esquema en `src/lib/contracts/` antes de tocar rutas o formularios, sanitiza respuestas con DTOs de `src/lib/public-dto.ts` y valida siempre con `npm run verify` (`0` errores, `0` warnings).

#### Snippet 1 · Pantalla Admin Compuesta con UI Atómica
```tsx
import { PageHeader } from '@/components/ui/PageHeader';
import { MetricGrid, type MetricTileItem } from '@/components/ui/MetricTile';
import { FilterPillBar } from '@/components/ui/FilterPillBar';
import { SurfaceCard } from '@/components/ui/SurfaceCard';
import { ActionRow } from '@/components/ui/ActionRow';
import { BookingStatusTag } from '@/components/ui/StatusTag';
import { Button } from '@astryxdesign/core/Button';

const kpis: readonly MetricTileItem[] = [
  { id: 'hoy', label: 'Citas de hoy', value: '8', tone: 'accent' },
  { id: 'anticipos', label: 'Anticipos por revisar', value: '2', tone: 'warning' },
];

export function AgendaResumen({ period, onPeriodChange }: { period: '7d' | '30d'; onPeriodChange: (v: '7d' | '30d') => void }) {
  return (
    <>
      <PageHeader eyebrow="Jueves" title="Agenda" actions={<Button variant="primary" label="Nueva cita" />} />
      <MetricGrid ariaLabel="Resumen operativo" items={kpis} cols={2} />
      <FilterPillBar ariaLabel="Período" mode="segmented" value={period} onChange={onPeriodChange} options={[{ value: '7d', label: '7 días' }, { value: '30d', label: '30 días' }]} />
      <SurfaceCard title="Próximas citas" count={1}>
        <ActionRow title="Sofía Ramírez · Rubber" subtitle="10:00 a.m. · Karla" status={<BookingStatusTag status="confirmed" />} />
      </SurfaceCard>
    </>
  );
}
```

#### Snippet 2 · Flujo Público SPEI con Subpath Directo (Óptimo Tree-Shaking)
```tsx
import { CopyableField } from '@/components/ui/CopyableField';
import { UploadDropzone } from '@/components/ui/UploadDropzone';

export function AnticipoSpei({ previewUrl, onSelectFile, onClear }: { previewUrl: string | null; onSelectFile: (f: File | null) => void; onClear: () => void }) {
  return (
    <>
      <CopyableField label="CLABE Mercado Pago" value="722969013959779869" displayValue="7229 6901 3959 779869" monospace copyLabel="Copiar CLABE" />
      <UploadDropzone label="Comprobante de anticipo" previewUrl={previewUrl} previewAlt="Vista previa del comprobante SPEI" onSelectFile={onSelectFile} onClear={onClear} />
    </>
  );
}
```

#### Snippet 3 · Ruta API Blindada con Contrato Zod Puro y DTO
```ts
import { NextResponse } from 'next/server';
import { AdminTeamPostSchema } from '@/lib/contracts/team';
import { requireAdmin } from '@/lib/auth/admin-session';

export async function POST(request: Request) {
  const auth = await requireAdmin(request, ['owner']);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const parsed = AdminTeamPostSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Datos inválidos' }, { status: 400 });
  return NextResponse.json({ ok: true, kind: parsed.data.kind });
}
```

---

## Sección 3 · Propuestas Estratégicas Priorizadas por ROI (LAIKONA NAILS · Puebla)

**Base operativa real sobre la que construimos:** LAIKONA NAILS opera en **Col. Volcanes, Puebla** con `3` artistas (Karla, Paty y Tere), ~`9` bloques fijos diarios (~`210–230` citas/mes a plena ocupación), servicios estrella en `\$340–\$450 MXN` (`Retoque`, `Rubber`, `Uñas Softgel`, `Uñas acrílicas`), `PediSpa` en `\$500–\$550 MXN`, extras de `\$95–\$220 MXN` y anticipo SPEI de `\$200 MXN`. La plataforma **ya resuelve** reserva en 5 pasos con apartado de 5 min, `/reservar/[slug]?inspo=`, lista de espera, paquetes de sesiones, Tarjeta de Sellos, campañas manuales de cumpleaños/reactivación y plantillas WhatsApp `UTILITY` (`500/mes`). Las propuestas siguientes representan el **siguiente salto de rentabilidad** sobre esa infraestructura lista.

### 3.1 Matriz Priorizada por Horizonte, Impacto y KPI Esperado

| Horizonte | # | Iniciativa | Pilar | Impacto | Esfuerzo | KPI esperado (LAIKONA NAILS) |
|---|---|---|---|---|---|---|
| **Quick Wins (1 semana)** | **QW-1** | **Tracking UTM + `?inspo=` persistido desde Instagram Reels/Stories y `/links`** | Conversión | Alto | Bajo (`1–2` d) | `100%` de citas atribuidas por Reel/historia; identificar los `3` diseños con mayor conversión. |
| **Quick Wins (1 semana)** | **QW-2** | **Miniaturas WebP reales en Paso 2 (`Extras`) para upsell visual de Nail Art** | Conversión | Alto | Bajo (`2` d) | `+15%` a `+25%` en tasa de selección de extras (`+\$35` a `+\$65 MXN` en ticket promedio). |
| **Quick Wins (1 semana)** | **QW-3** | **Disparo automático post-cita (2–4 h) a reseña en Google Business Profile (`>= 4★`)** | SEO Local | Alto | Bajo (`2` d) | `2×–3×` reseñas verificadas/mes en Google Maps Puebla (impulso directo al Local Pack). |
| **Quick Wins (1 semana)** | **QW-4** | **Recordatorios WhatsApp `UTILITY` con botones rápidos (`Sí, confirmo` / `Reagendar`)** | Retención | Alto | Bajo-Medio (`3` d) | `-30%` a `-45%` en inasistencias y `-60%` en mensajes manuales de confirmación. |
| **Mediano Plazo (1–3 meses)** | **MP-1** | **Lista de espera inteligente con auto-oferta WhatsApp (ventana exclusiva 30 min)** | Conversión | Muy Alto | Medio (`1–2` sem) | Recuperar `35%–50%` de huecos cancelados (`+\$3,500` a `+\$6,500 MXN/mes` rescatados). |
| **Mediano Plazo (1–3 meses)** | **MP-2** | **Anticipo en 1 clic con Mercado Pago Checkout Pro / Apple Pay / Google Pay** | Conversión | Muy Alto | Medio (`1–2` sem) | `+12%` a `+20%` conversión en Paso 5; `0` min diarios validando capturas SPEI en citas online. |
| **Mediano Plazo (1–3 meses)** | **MP-3** | **Automatización de retoque +21 días y reactivación 45+ días vía `/api/cron/reminders`** | Retención | Alto | Medio (`1` sem) | `+10%` a `+18%` retención de clientas recurrentes en ciclo de `21–28` días. |
| **Mediano Plazo (1–3 meses)** | **MP-4** | **Vista móvil `"Entre clientas"` (cobro + foto final a galería en 15 seg)** | Operación | Alto | Medio (`2` sem) | `100%` citas cobradas al instante (`0` fugas) y `15+` fotos reales nuevas/mes en galería SEO. |
| **Mediano Plazo (1–3 meses)** | **MP-5** | **Landings hiperlocales Puebla por técnica/zona + galería `ImageObject` y guías** | SEO Local | Alto | Medio (`2` sem) | `+40%` a `+80%` tráfico orgánico local en búsquedas *"uñas rubber/softgel Puebla"*. |
| **Mediano Plazo (1–3 meses)** | **MP-6** | **Descuento automático de insumos por servicio + metas/propinas por manicurista** | Operación | Medio-Alto | Medio (`2–3` sem) | Visibilidad de margen neto real por servicio y reducción de quiebres de stock en gel/acrílico. |
| **Mediano Plazo (1–3 meses)** | **MP-7** | **Compra en autoservicio de paquetes y membresía `"Club Retoque LAIKONA"`** | Conversión | Alto | Medio (`2–3` sem) | `15%–25%` de clientas recurrentes con ingresos prepagados al inicio del mes. |
| **Visión SaaS (3–12 meses)** | **SA-1** | **Descomposición de monolitos backend (`db.ts`, `supabase-repo.ts`, `engine.ts`, `notifications.ts`)** | Arquitectura | Alto | Medio-Alto (`3` sem) | Reducción de riesgo de regresiones y onboarding técnico `2×` más rápido. |
| **Visión SaaS (3–12 meses)** | **SA-2** | **Rate limiting distribuido en Cloudflare Durable Objects / Rate Limiting API** | Arquitectura | Alto | Bajo-Medio (`1` sem) | Protección consistente multi-PoP en OTP, PIN de Dueña y creación de citas. |
| **Visión SaaS (3–12 meses)** | **SA-3** | **Observabilidad Edge RUM de CWV, embudo de pasos y errores (`Workers Analytics Engine`)** | Arquitectura | Medio-Alto | Medio (`1–2` sem) | Alerta temprana si `LCP p75 > 2.5 s`, caída en Paso 3→5 o fallos en webhooks de pago. |
| **Visión SaaS (3–12 meses)** | **SA-4** | **Plataforma Multi-Tenant SaaS para estudios de belleza en LATAM** | SaaS | Transformacional | Alto (`3–6` meses) | Nuevo flujo B2B recurrente (`\$499–\$1,199 MXN/mes` por estudio; `50+` estudios año 1). |

---

### 3.2 Desarrollo Profundo de los 4 Pilares Estratégicos

#### Pilar 1 · Conversión e Ingresos

1. **Atribución Instagram Reels/Stories → `/reservar/[slug]?inspo=...&utm_*` (`QW-1`):**
   - **Brecha actual:** El enlace `/reservar/[slug]?inspo=<diseño>` ya prellena servicio y referencia, pero no guarda el origen (`utm_source`, `utm_medium`, `utm_campaign`, `utm_content`) en el registro de `bookings`.
   - **Acción:** Extender `PublicCreateBookingSchema` y `Booking` con un objeto opcional `attribution` sanitizado (máx. `60` caracteres por campo) y mostrar en `/admin/reportes` el ranking de ingresos por origen (`IG Reel`, `IG Bio /links`, `Google Maps`, `Retoque +21d`, `Directo`).
   - **Retorno:** Karla sabrá con exactitud qué formato de Reel convierte citas pagadas de `\$450+ MXN` (Softgel/Acrílico) frente a consultas que solo generan likes.

2. **Upsells visuales de nail art con foto en Paso 2 (`Extras`) (`QW-2`):**
   - **Brecha actual:** Hoy `ExtrasStep` muestra filas de texto para `Nail Art Nivel 1` (`\$110`), `Nivel 2` (`\$220`), `Efecto Glazed / Chrome / Cat Eye` (`\$95`) y `Largo Extra` (`\$130`). En diseño de uñas, la decisión de subir de nivel es 100% visual.
   - **Acción:** Añadir una miniatura real WebP (`<= 15 KB`, `1:1`) por cada extra y una recomendación contextual (por ejemplo, sugerir `Retiro previo` + `Efecto Chrome` cuando eligen `Rubber` o `Softgel`).
   - **Retorno:** Elevar en solo `20%` la adopción de extras sobre `200` citas/mes suma `+\$4,000` a `+\$6,500 MXN/mes` adicionales sin incrementar horas de renta ni costo de adquisición.

3. **Lista de espera inteligente con auto-oferta WhatsApp al cancelar (`MP-1`):**
   - **Brecha actual:** `waitlist` registra interesadas y `/admin` ofrece el botón manual `Avisar`, pero si una clienta cancela a las `10:30 p.m.` para el día siguiente a las `10:00 a.m.`, el hueco suele quedar vacío.
   - **Acción:** Al procesarse una cancelación en `PATCH /api/bookings/manage/[token]` o `/api/admin/bookings`, consultar `waitlist` con servicio compatible y franja preferida, despachar automáticamente la plantilla `laikona_lista_espera` con enlace de reserva reservado por `30` minutos y escalar al siguiente contacto en cola si expira.
   - **Retorno:** Cada turno rescatado vale `\$350–\$550 MXN` en horario ya pagado; rescatar `10–14` huecos/mes paga de sobra el costo anual de infraestructura.

4. **Membresía y paquetes de retoque recurrente en autoservicio (`MP-7`):**
   - **Brecha actual:** Los paquetes de sesiones (`Paquete 4 sesiones Rubber \$1,200`) ya existen y se canjean en `CheckoutDrawerDialog`, pero solo los asigna el equipo desde `/admin`.
   - **Acción:** Habilitar la compra directa en `/mis-citas` y como oferta post-reserva en `/cita/[token]`, y lanzar la suscripción mensual **`Club Retoque LAIKONA`** (ej. `\$599 MXN/mes`: 1 retoque completo + retiro incluido + 10% en Nail Art + prioridad en sábados).
   - **Retorno:** Estabiliza la ocupación en martes/miércoles y anticipa caja al inicio del mes.

5. **Cobro de anticipo en 1 clic (Mercado Pago Checkout Pro / Apple Pay / Google Pay) (`MP-2`):**
   - **Brecha actual:** Aunque el webhook de Mercado Pago ya está implementado, el modo por defecto (`manual_transfer`) exige copiar CLABE, cambiar a app bancaria y subir captura SPEI, generando abandono en móvil y trabajo manual de revisión para Karla/Paty.
   - **Acción:** Activar modo híbrido donde el Paso 5 ofrezca **"Pagar anticipo de \$200 al instante"** (Mercado Pago Checkout Pro con tarjeta guardada / Apple Pay / Google Pay → confirmación automática por webhook) y mantenga **"Transferencia SPEI sin comisión"** como opción secundaria colapsable.
   - **Retorno:** Reduce la fricción del momento más crítico del embudo (Paso 5) y elimina el cuello de botella de aprobar comprobantes manualmente.

---

#### Pilar 2 · Retención y Operación del Salón

1. **Recordatorios WhatsApp `UTILITY` con confirmación en 1 toque (`QW-4`):**
   - **Acción:** Configurar botones Quick Reply (`Sí, confirmo` / `Necesito reagendar`) en las plantillas `laikona_recordatorio_24h` y `laikona_recordatorio_2h`, procesando la respuesta entrante en el webhook `/api/webhooks/whatsapp` (ya firmado con `HMAC-SHA256` e idempotente): `Sí, confirmo` marca badge verde de reconfirmada en `/admin/citas`; `Necesito reagendar` responde con el enlace directo `/cita/[token]?action=reschedule`.
   - **Retorno:** Cae la tasa de inasistencias sin consumir mensajes de categoría `MARKETING` (manteniendo la cuota de `500/mes` bajo tarifa `UTILITY`).

2. **Automatización de retoque +21 días y reactivación segmentada (`MP-3`):**
   - **Acción:** Añadir al cron `/api/cron/reminders` dos reglas opt-in (`marketingOptIn === true` conforme a LFPDPPP): (a) a los `18–21` días de una cita completada de `Rubber`, `Uñas Softgel` o `Uñas acrílicas` sin próxima cita futura, enviar enlace prellenado `buildTouchUpBookingUrl` (`Retoque` + misma artista); (b) a los `45` días sin visita, enviar mensaje personalizado con cupón personal de vigencia `7` días.
   - **Retorno:** Convierte el mantenimiento cada 3 semanas en un hábito automático en lugar de depender de que la clienta recuerde escribir por Instagram.

3. **Vista rápida `"Entre clientas"` en celular (cobro + foto a galería en 15 seg) (`MP-4`):**
   - **Acción:** Desde el popover rápido de la cita en curso en `/admin/citas` (móvil), agregar un flujo compacto de 2 pasos: (1) confirmar cobro (`Efectivo` / `Transferencia` / `Tarjeta` + propina + sello/paquete automático) y (2) botón opcional `"Subir foto del set"` que abre la cámara trasera, comprime a WebP en cliente (`<= 120 KB`), registra la foto en la ficha de la clienta y, con un switch de consentimiento, la publica en la galería de `/` enlazada a `/reservar/[slug]?inspo=...`.
   - **Retorno:** Elimina las "citas terminadas sin cobrar" y alimenta la galería comercial con contenido fresco cada semana sin abrir un panel de escritorio.

4. **Descuento automático de inventario por servicio al cobrar (`MP-6`):**
   - **Acción:** Asociar una receta ligera de consumo opcional por servicio (ej. `Uñas Softgel` → `-1` set de tips + `-1` porción base; `PediSpa` → `-1` kit desechable) ejecutada atómicamente dentro de `checkout_split` en `/api/admin/bookings`, alimentando las alertas de stock bajo ya presentes en `/admin/inventario` y `/admin`.
   - **Retorno:** Permite calcular utilidad neta real por servicio (`precio − costo de insumos − comisión de artista`) en `/admin/reportes`.

5. **Control de metas, comisiones transparentes y propinas por manicurista (`MP-6`):**
   - **Acción:** Incorporar en la vista `Manicurista` (`specialist`) de `/admin/reportes` y `/admin/caja` una barra de progreso hacia su meta semanal de ocupación/ventas, desglose diario de propinas (`tipStaffId`) y botón de corte quincenal descargable para `Dueña` (protegido por `OwnerPinDialog`).
   - **Retorno:** Alinea incentivos del equipo (Karla, Paty, Tere) hacia puntualidad, retención y recomendación de extras.

---

#### Pilar 3 · SEO y Crecimiento Local en Puebla

1. **Landings hiperlocales por técnica y zona de Puebla (`MP-5`):**
   - **Oportunidad:** La ubicación en **Calle 25 Sur 1904, Col. Volcanes** está en un corredor de altísima densidad y poder adquisitivo junto a **Av. Juárez, Col. La Paz, Huexotitla, Santiago (UPAEP) y a 10 min de Angelópolis**.
   - **Acción:** Crear `4` páginas dedicadas con rutas limpias (`/servicios/rubber-puebla`, `/servicios/unas-softgel-puebla`, `/servicios/unas-acrilicas-puebla`, `/servicios/pedispa-volcanes-puebla`) con contenido editorial original (~400 palabras), precios y duración reales del catálogo, bloque `"Cómo llegar desde La Paz, Juárez y Angelópolis"`, reseñas filtradas, `FAQPage` + `Service` JSON-LD y CTA directo a `/reservar/[slug]`.
   - **Retorno:** Captura búsquedas locales de alta intención transaccional sin pagar anuncios por clic (Google Ads).

2. **Flujo automático post-cita hacia reseñas en Google Business Profile (`>= 4★`) (`QW-3`):**
   - **Acción:** Aprovechar `settings.googleReviewUrl` y `CitaReviewCard`: enviar automáticamente `3` horas después de marcar una cita como `completed` un mensaje breve por WhatsApp/correo invitando a calificar en 1 toque; las calificaciones `4–5★` presentan el botón directo a Google Maps, mientras que `1–3★` notifican de inmediato a Karla en `/admin` para recuperación privada antes de perder a la clienta.
   - **Retorno:** Superar las `100+` reseñas recientes con `4.9★` posiciona a LAIKONA NAILS en el Top 3 del mapa local de Puebla para *"uñas volcanes / uñas puebla / nail art puebla"*.

3. **Galería indexable con `ImageObject` + guías editoriales de cuidado (`MP-5`):**
   - **Acción:** Enriquecer la galería de sets con schema `ImageObject` (`caption`, `contentUrl`, `creator`, técnica y duración estimada) y publicar `3` guías cortas evergreen en `/guias/`: *"Rubber vs. Softgel vs. Acrílico: cuál conviene a tu uña natural"*, *"Cómo cuidar tus uñas para que duren 21+ días sin levantamiento"* y *"Preparación antes de tu cita en Col. Volcanes"*.
   - **Retorno:** Posiciona búsquedas informacionales que convierten directamente a `/reservar/[slug]` y educa a la clienta para reducir quejas por mal cuidado.

4. **Enlaces UTM medibles en `/links` y QR físico en mesa/recepción (`QW-1`):**
   - **Acción:** Inyectar automáticamente `?utm_source=ig_bio&utm_medium=links` en los botones de `/links` y añadir un selector de etiqueta UTM en `QrShareCard` (`/admin/marca`) para imprimir un QR físico en cada mesa (`utm_source=mesa_qr` → retoque +21 días o Google Reviews) y otro en el espejo/fachada (`utm_source=estudio_qr`).
   - **Retorno:** Convierte el tráfico presencial de Col. Volcanes y la bio de `@laikona.nailsss` en datos trazables sin costo adicional.

---

#### Pilar 4 · Arquitectura y Rendimiento Futuro

1. **Descomposición progresiva de monolitos backend (`src/lib/`) (`SA-1`):**
   - **Estado actual:** Wave 2 dejó en **`0`** los monolitos UI/API, dejando intactos por seguridad operativa los `4` archivos backend más extensos: `src/lib/repositories/db.ts` (`5,109` LOC), `src/lib/repositories/supabase-repo.ts` (`4,194` LOC), `src/lib/availability/engine.ts` (`1,288` LOC) y `src/lib/integrations/notifications.ts` (`1,090` LOC).
   - **Acción:** Particionar cada uno por subdominio (`repositories/demo/{core,bookings,catalog,clients,finance,media}.ts`, espejo en `repositories/supabase/*`, `availability/{slot-generator,diagnostics,assertions}.ts`, `integrations/{email-templates,whatsapp-dispatch,email-dispatch}.ts`) manteniendo intacta la interfaz pública y los `338` tests existentes (incluidos los property tests `fast-check` y pruebas de concurrencia).

2. **Rate limiting distribuido en Cloudflare Durable Objects / Rate Limiting API (`SA-2`):**
   - **Estado actual:** `SEC-04` ya prioriza `cf-connecting-ip`, pero el mapa en memoria por isolate de Worker no comparte estado entre distintos PoPs globales.
   - **Acción:** Conectar el adaptador de `src/lib/security/rate-limit.ts` a un binding de Cloudflare Rate Limiting API (nativo en `wrangler.jsonc`, latencia sub-milisegundo y cero costo extra en tráfico de salón) o Durable Object ligero por IP/teléfono para blindar `/api/client-portal/otp`, `/api/admin/session`, PIN de Dueña y `/api/bookings`.

3. **Observabilidad real de CWV, conversión y webhooks en Edge (`SA-3`):**
   - **Acción:** Habilitar **Cloudflare Workers Analytics Engine** (sin scripts pesados que degraden LCP/INP) para registrar eventos livianos: `web_vitals` (`LCP`, `CLS`, `INP` reales en redes 4G de Puebla), avance por paso del embudo de `/reservar` (`paso_1` → `paso_5` → `201` / `409 SLOT_TAKEN`), y salud de crons/webhooks (`reminders`, `retention`, Mercado Pago, WhatsApp), con alerta por correo/Telegram si falla un cron o sube la latencia `p95`.

4. **Hoja de ruta Multi-Tenant SaaS para estudios de belleza en LATAM (`SA-4`):**
   - **Ventaja competitiva ya construida:** Contratos Zod puros, repositorios desacoplados, temas Astryx parametrizables, modo embed en 3 formatos, WhatsApp `UTILITY` con control de cuota, R2 privado con retención automática de 12 meses y despliegue Edge en `5.82 MiB` gz.
   - **Fases para comercializar el producto (3–12 meses):**
     1. *Meses 3–5 (Aislamiento Multi-Tenant):* añadir `tenant_id` a tablas Supabase con **Row-Level Security (RLS)** estricto, prefijo `tenants/<id>/...` en R2 y resolución por subdominio (`<estudio>.laikona.app`) o dominio propio vía **Cloudflare for SaaS**.
     2. *Meses 5–8 (Onboarding Self-Service y Billing):* activar registro autónomo de estudios apoyado en `/admin/onboarding`, planes por sillas/artistas (`Solo \$499 MXN`, `Estudio 2–5 artistas \$899 MXN`, `Multi-sucursal \$1,499 MXN`) cobrados con Stripe/Mercado Pago Suscripciones.
     3. *Meses 8–12 (Ecosistema LATAM):* plantillas WhatsApp `UTILITY` pre-aprobadas por vertical (uñas, pestañas, cejas, peluquería), facturación/recibos locales y marketplace de diseño de marca sin código sobre Astryx.

---

### Secuencia Sugerida de Ejecución Inmediata (Primeros 30 Días en Producción)

1. **Semana 1 (Lanzamiento en Cloudflare Workers + Quick Wins):** desplegar el build verificado (`5.82 MiB` gz) con dominio definitivo (`NEXT_PUBLIC_APP_URL`), activar `QW-1` (UTM + `?inspo=`) y `QW-2` (fotos reales en Paso 2 `Extras`) para elevar ticket desde el día 1.
2. **Semana 2 (Reseñas y Cero Inasistencias):** activar `QW-3` (flujo post-cita a Google Business Profile) y `QW-4` (botones rápidos en recordatorios WhatsApp `UTILITY`).
3. **Semanas 3–4 (Ingresos Automáticos):** habilitar `MP-2` (anticipo 1 clic Mercado Pago junto a SPEI) y `MP-1` (auto-oferta inteligente en lista de espera), midiendo semana a semana la ocupación y el ticket promedio en `/admin/reportes`.
