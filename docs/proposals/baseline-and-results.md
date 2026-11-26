# LAIKONA NAILS — Wave 1 360° Baseline Audit & Atomic Architecture Blueprint

> **Document Owner:** `w1-architect` (synthesized from `w1-browser-audit` real Chromium CDP telemetry and `w1-code-audit` static/security/media/CSS analysis)
> **Audit Date:** 2026-11-26
> **Baseline Commit:** `1e40a12` (`feat(reservar): move nail art and extra services into dedicated step`)
> **Production Build ID Audited:** `g80udqULzw6rKm73ElEbf` (`.next` on temporary `http://127.0.0.1:1718`, Service Worker bypassed, browser cache disabled)
> **Authenticated Admin Audit Reference:** Read-only on `http://localhost:3000` (`dev:lan`, demo owner `duena@nails.studio`) because production `:1718` intentionally fails closed without Supabase (`GET /admin` -> `307 /admin/login`, `POST /api/admin/session` -> `503`).

---

## 1. Executive Baseline Summary

### Verified Baseline State (Commit `1e40a12`)
- **Engineering Gatekeeper (`npm run verify`):** Green baseline prior to Wave 1 documentation (zero TypeScript errors, zero AST guardrail violations, zero `oxlint` warnings, zero `knip` dead-code findings, full Vitest suite passing, `next build` + `astryx doctor` passing — re-verified after authoring this document).
- **Runtime Reliability:** Across **42 live Chromium passes** (13 routes × desktop `1440×900` & mobile `390×844` × light & dark themes), the application recorded **0 console errors**, **0 uncaught page errors**, **0 HTTP `>= 400` asset failures**, **0 px horizontal overflow**, **0 broken images**, **1 `<h1>` per route**, and **0 WCAG AA dark-mode contrast failures** on `/admin*`.
- **Production Auth Security Verified:** On production `next start` without Supabase credentials, admin authentication fails closed (`GET /admin` -> `307 /admin/login`, `GET /api/admin/session` -> `{"session":null,"availableDemoUsers":[]}`, `POST /api/admin/session` -> `503`).

### Highest-Impact Opportunities Identified for Waves 2–6
1. **Security Hardening (4 HIGH, 3 MEDIUM, 1 LOW):** Immediate fixes required in `POST /api/bookings` (leaks `staff.commissionPercent`, `internalNotes`, `client.notes`), `POST /api/admin/team` & `POST /api/admin/operations` (missing Zod validation / mass assignment), `GET /api/admin/overview` & `PATCH /api/admin/brand` (leaks `ownerPinHash`, encrypted Google OAuth tokens, and specialist RBAC over-fetch), and `getRequestIp()` (`x-forwarded-for` checked before `cf-connecting-ip`).
2. **Monolith Decomposition & Atomic Architecture:** **50 production files** exceed 400 LOC (top UI monoliths: `admin/disponibilidad/page.tsx` at 1,610 LOC, `admin/citas/page.tsx` at 1,405 LOC, `admin/marca/page.tsx` at 1,387 LOC, `BookingWidget.tsx` at 1,197 LOC, `admin/servicios/page.tsx` at 1,170 LOC, `AdminShell.tsx` at 1,141 LOC). Introducing `src/components/ui/` (100% `@astryxdesign/core`) and pure-domain `src/lib/contracts/` unlocks safe Wave 2 decomposition.
3. **Payload, Media & CSS Optimization:**
   - **12.89 MB (81.5%) of `public/`** (`71 / 128` files, led by `public/gallery/instagram/*.jpg` at 12.38 MB) is completely orphaned.
   - Cold landing `/` transfers **1,149.8–1,191.1 KB** (including **643–648 KB** unoptimized images, with `foto-025.webp` alone at 321.3 KB) and `/reservar` transfers **1,130.0 KB** (**547.5 KB** gzipped JS + **412.8 KB** eager service thumbnails).
   - Every route downloads **64.5 KB gzipped CSS** (`globals.css` is 62.08 KB raw / 2,038 LOC, with 6 dead classes and admin skeletons leaking into public pages); `/admin/*` downloads **71.1 KB gzipped CSS** (`admin.css` adds 45.19 KB raw / 2,289 LOC, with 3 dead classes and 16 duplicated `:focus-visible` blocks).
4. **Accessibility & Mobile Ergonomics:** Mobile `/` hamburger button (`Abrir menú`) has a **HIGH** dark-on-dark contrast defect over the `#191112` hero; mobile `< 44×44px` touch targets appear across public and admin pages (including 20px-tall segmented buttons on `/admin/reportes`).
5. **SEO & Discoverability:** Missing `metadataBase` (causing relative canonicals and `http://localhost:3000` in `/sitemap.xml` and `/robots.txt`), **0% `og:image`/`twitter:image` coverage**, missing `noindex` on `/cita/[token]` and all `/admin/*`, and missing `FAQPage`, `Service`/`Offer`, `BreadcrumbList`, and `WebSite` JSON-LD schemas.

---

## 2. Real Browser Metrics Baseline (Chromium `Chrome/159.0.8154.6`)

### 2.1 Public Routes & `/admin/login` — Production Build (`:1718`, SW-Bypassed, Cache Disabled)

| Route | Viewport | Theme | HTTP | TTFB (ms) | FCP (ms) | LCP (ms / Element) | CLS | INP (ms) | Doc (KB) | CSS (KB) | JS (KB) | Img (KB) | Font (KB) | Total Transfer (KB) | Overflow (px) | Console / Page Errs |
|---|---|---|---:|---:|---:|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| `/` | 1440×900 | light | 200 | 26.3 | 168 | 184 (`IMG`) | **0.0423** | 32 | 25.6 | 64.5 | 328.6 | **643.3** | 78.1 | **1,149.8** | 0 | 0 / 0 |
| `/` | 390×844 | light | 200 | 15.0 | 116 | 116 (`IMG`) | 0.0000 | 16 | 25.6 | 64.5 | 346.6 | **647.8** | 98.1 | **1,191.1** | 0 | 0 / 0 |
| `/reservar` | 1440×900 | light | 200 | 16.2 | 96 | 96 (`IMG.rb-hero-cherries`) | 0.0029 | 24 | 21.0 | 64.5 | **547.5** | 412.8 | 78.1 | **1,130.0** | 0 | 0 / 0 |
| `/reservar` | 390×844 | light | 200 | 11.8 | 76 | 76 (`IMG.rb-hero-cherries`) | 0.0000 | 16 | 21.0 | 64.5 | **547.5** | 411.5 | 78.1 | **1,128.7** | 0 | 0 / 0 |
| `/reservar/rubber` | 1440×900 | light | 200 | 12.7 | 92 | 92 (`IMG.rb-hero-cherries`) | 0.0029 | 16 | 24.2 | 64.5 | **553.2** | 412.8 | 78.1 | **1,138.8** | 0 | 0 / 0 |
| `/reservar/rubber` | 390×844 | light | 200 | 12.9 | 80 | 80 (`IMG.rb-hero-cherries`) | 0.0000 | 16 | 24.2 | 64.5 | **553.2** | 411.5 | 78.1 | **1,137.5** | 0 | 0 / 0 |
| `/cita/demo-token-sofia-1042` | 1440×900 | light | 200 | 17.2 | 96 | 96 (`IMG.rb-hero-cherries`) | 0.0017 | 16 | 25.6 | 64.5 | 388.8 | 21.8 | 78.1 | 584.4 | 0 | 0 / 0 |
| `/cita/demo-token-sofia-1042` | 390×844 | light | 200 | 14.3 | 88 | 88 (`IMG.rb-hero-cherries`) | 0.0000 | 16 | 25.6 | 64.5 | 388.8 | 21.8 | 78.1 | 584.4 | 0 | 0 / 0 |
| `/mis-citas` | 1440×900 | light | 200 | 9.2 | 72 | 72 (`IMG.rb-hero-cherries`) | 0.0057 | 16 | 15.8 | 64.5 | 382.3 | 19.9 | 63.8 | 558.5 | 0 | 0 / 0 |
| `/mis-citas` | 390×844 | light | 200 | 8.6 | 68 | 68 (`IMG.rb-hero-cherries`) | 0.0000 | n/a | 15.8 | 64.5 | 382.3 | 19.9 | 63.8 | 558.5 | 0 | 0 / 0 |
| `/links` | 1440×900 | light | 200 | 12.8 | 80 | 80 (`IMG.rb-hero-cherries`) | 0.0000 | n/a | 21.0 | 64.5 | 324.3 | 240.4 | 63.8 | 726.5 | 0 | 0 / 0 |
| `/links` | 390×844 | light | 200 | 10.0 | 72 | 72 (`IMG.rb-hero-cherries`) | 0.0000 | 16 | 21.0 | 64.5 | 324.3 | 240.4 | 63.8 | 725.5 | 0 | 0 / 0 |
| `/aviso-de-privacidad` | 1440×900 | light | 200 | 9.7 | 80 | 80 (`IMG.rb-hero-cherries`) | **0.0366** | 16 | 23.1 | 64.5 | 324.3 | 19.9 | 99.5 | 541.4 | 0 | 0 / 0 |
| `/aviso-de-privacidad` | 390×844 | light | 200 | 9.0 | 76 | 76 (`IMG.rb-hero-cherries`) | 0.0000 | 16 | 23.1 | 64.5 | 324.3 | 14.5 | 99.5 | 528.4 | 0 | 0 / 0 |
| `/admin/login` | 1440×900 | light | 200 | 12.8 | 224 | 224 (`SPAN`) | 0.0000 | 16 | 16.2 | **71.1** | 455.1 | 7.4 | 63.8 | 616.4 | 0 | 0 / 0 |
| `/admin/login` | 390×844 | light | 200 | 10.0 | 220 | 220 (`SPAN`) | 0.0000 | n/a | 16.2 | 71.1 | 455.1 | 7.4 | 63.8 | 616.4 | 0 | 0 / 0 |
| `/admin/login` | 1440×900 | dark | 200 | 11.0 | 228 | 228 (`H1`) | 0.0282 | 16 | 16.2 | 71.1 | 455.1 | 12.7 | 63.8 | 621.8 | 0 | 0 / 0 |
| `/admin/login` | 390×844 | dark | 200 | 8.1 | 160 | 160 (`SPAN`) | 0.0000 | n/a | 16.2 | 71.1 | 455.1 | 12.7 | 63.8 | 621.8 | 0 | 0 / 0 |

**Key Production Payload & CWV Diagnostics:**
- **Global CSS Overhead:** Every public route downloads **64.5 KB gzipped** (`1bjmbaadd_w0e.css` = 47.0 KB gzipped / 297 KB uncompressed + `globals.css`); `/admin/login` adds `admin.css` -> **71.1 KB gzipped**.
- **Unoptimized Images (`images.unoptimized: true`):**
  - `/` cold-loads **643–648 KB** of images (`/landing/sets/foto-025.webp` = **321.3 KB**, `12-rojo-laca-dorado-4x5.webp` = 58.0 KB, `07-rubi-y-negro-4x5.webp` = 57.0 KB, `03-flor-coral-4x5.webp` = 50.5 KB, `hero-escritorio.webp` = 47.0 KB).
  - `/reservar` & `/reservar/rubber` eagerly load **412.8 KB** of service thumbnails (`foto-033.webp` = **126.7 KB**) and **547.5–553.2 KB** gzipped JS (all 5 booking wizard steps + calendar + deposit UI bundled statically).
  - `/links` downloads **240.4 KB** of service thumbnails.
- **LCP Target Anomaly:** Decorative watermark `IMG.rb-hero-cherries` is currently winning LCP on 6 public routes (`/reservar`, `/reservar/rubber`, `/cita/*`, `/mis-citas`, `/links`, `/aviso-de-privacidad`).
- **Webfont CLS Correlation:** **63.8–99.5 KB** of `.woff2` (`@fontsource/source-serif-4` + `@fontsource/dm-sans`) correlates with minor desktop CLS on `/` (`0.0423`), `/aviso-de-privacidad` (`0.0366`), and `/admin/login` dark (`0.0282`).

### 2.2 Authenticated `/admin/*` Routes — Read-Only Dev-Mode Baseline (`[dev:lan]` `:3000`, Light & Dark)

> *Note: Timings and transfer bytes in this table reflect Next.js `dev` mode unminified chunks (`[dev:lan]`, e.g., `/admin` desktop light = `2,206.8 KB` total: Doc 19.3 KB, CSS 74.1 KB, unminified dev JS 2,081.1 KB, Img 7.4 KB, Font 14.2 KB). Overflow, console/page errors, accessibility checks, dark-mode contrast parity, and SEO metadata reflect the real rendered DOM.*

| Route | Viewport | Theme | TTFB (ms) `[dev]` | FCP (ms) `[dev]` | LCP (ms) `[dev]` | CLS | INP (ms) | Overflow (px) | Console / Page Errs | `<h1>` | Heading Skips | Missing Alt / Names | Contrast Fails | Mobile `<44px` Targets | Focus Visible |
|---|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---|
| `/admin` | 1440×900 | light / dark | 58.6 / 60.3 | 340 / 368 | 692 / 596 | 0 / 0 | 32 / 32 | 0 / 0 | 0 / 0 | 1 (`Hola, Karla`) | 0 | 0 / 0 | 0 / 0 | — | 4/4 |
| `/admin` | 390×844 | light / dark | 51.6 / 43.0 | 356 / 344 | 604 / 560 | 0 / 0 | 16 / 16 | 0 / 0 | 0 / 0 | 1 | 0 | 0 / 0 | 0 / 0 | **21** | 4/4 |
| `/admin/citas` | 1440×900 | light / dark | 67.9 / 56.1 | 416 / 408 | 648 / 660 | 0 / 0 | 24 / 24 | 0 / 0 | 0 / 0 | 1 (`Agenda`) | 0 | 0 / 0 | 0 / 0 | — | 4/4 |
| `/admin/citas` | 390×844 | light / dark | 58.6 / 56.9 | 424 / 404 | 824 / 788 | 0 / 0 | 16 / 16 | 0 / 0 | 0 / 0 | 1 | 0 | 0 / 0 | 0 / 0 | **25** | 4/4 |
| `/admin/clientas` | 1440×900 | light / dark | 57.0 / 46.1 | 364 / 356 | 772 / 764 | 0 / 0 | 24 / 24 | 0 / 0 | 0 / 0 | 1 (`Clientas`) | 0 | 0 / 0 | 0 / 0 | — | 4/4 |
| `/admin/clientas` | 390×844 | light / dark | 47.6 / 43.8 | 340 / 360 | 776 / 780 | 0 / 0 | n/a | 0 / 0 | 0 / 0 | 1 | 0 | 0 / 0 | 0 / 0 | **21** | 4/4 |
| `/admin/caja` | 1440×900 | light / dark | 65.2 / 46.8 | 368 / 364 | 736 / 748 | 0 / 0 | 24 / 24 | 0 / 0 | 0 / 0 | 1 (`Caja`) | 0 | 0 / 0 | 0 / 0 | — | 4/4 |
| `/admin/caja` | 390×844 | light / dark | 47.0 / 42.8 | 388 / 356 | 772 / 736 | 0 / 0 | 16 / 16 | 0 / 0 | 0 / 0 | 1 | 0 | 0 / 0 | 0 / 0 | **15** | 4/4 |
| `/admin/marca` | 1440×900 | light / dark | 58.8 / 54.7 | 372 / 384 | 640 / 664 | 0 / 0 | 32 / 32 | 0 / 0 | 0 / 0 | 1 (`Mi página`) | 0 | 0 / 0 | 0 / 0 | — | 4/4 |
| `/admin/marca` | 390×844 | light / dark | 47.1 / 48.7 | 356 / 368 | 620 / 652 | 0.0002 | 16 / 16 | 0 / 0 | 0 / 0 | 1 | 0 | 0 / 0 | 0 / 0 | **38** | 4/4 |
| `/admin/reportes` | 1440×900 | light / dark | 59.4 / 48.1 | 364 / 368 | 756 / 736 | 0 / 0 | 24 / 24 | 0 / 0 | 0 / 0 | 1 (`Reportes`) | 0 | 0 / 0 | 0 / 0 | — | 4/4 |
| `/admin/reportes` | 390×844 | light / dark | 44.8 / 41.3 | 352 / 360 | 720 / 724 | 0.0004 | n/a / 16 | 0 / 0 | 0 / 0 | 1 | 0 | 0 / 0 | 0 / 0 | **5** | 4/4 |

### 2.3 Baseline Visual Evidence (19 Verified Chromium Screenshots)
All baseline screenshots were captured by `w1-browser-audit` under `C:\Users\jairb\.gemini\antigravity\brain\4b186c86-4597-46bf-9e92-e6ff10aca7b8\`:
- Public prod (`:1718`): `baseline-home-desktop-light.png`, `baseline-home-mobile-light.png`, `baseline-reservar-desktop-light.png`, `baseline-reservar-mobile-light.png`, `baseline-reservar-rubber-desktop-light.png`, `baseline-cita-mobile-light.png`, `baseline-links-mobile-light.png`
- Admin login prod (`:1718`): `baseline-admin-login-desktop-light.png`, `baseline-admin-login-desktop-dark.png`, `baseline-admin-login-mobile-dark.png`
- Admin authenticated (`[dev:lan]` `:3000`): `baseline-admin-desktop-light.png`, `baseline-admin-desktop-dark.png`, `baseline-admin-mobile-light.png`, `baseline-admin-mobile-dark.png`, `baseline-admin-citas-desktop-light.png`, `baseline-admin-citas-desktop-dark.png`, `baseline-admin-caja-desktop-dark.png`, `baseline-admin-marca-desktop-dark.png`, `baseline-admin-reportes-desktop-dark.png`

---

## 3. Accessibility & SEO Baseline Audit

### 3.1 Accessibility & Visual Findings (All 13 Routes)

| Severity | Route(s) | Exact Finding & Source | Target Wave |
|---|---|---|---|
| **HIGH** | `/` (mobile `390×844`) | Hamburger button `Abrir menú` renders dark icon on `#191112` dark hero when `data-floating="false"` (`src/components/landing/LandingNav.tsx:76-84`, `Button variant="secondary" isIconOnly className="lk-burger"`), making navigation trigger nearly invisible at initial paint. | Wave 5 (A11y/UX) |
| **MEDIUM** | `/` (mobile) | **22 interactive targets `< 44×44px`**: `Agendar` CTA (`88×32`), `Cerrar menú` (`32×32`), `Agendar cita` (`350×36`), `Ver creaciones` (`321×36`), `WhatsApp` (`106×36`), `@laikona.nailsss` (`149×36`), logo (`95×40`). | Wave 5 |
| **MEDIUM** | `/reservar`, `/reservar/rubber` (mobile) | **2–3 targets `< 44×44px`**: sticky bottom `Continuar` CTA (`152×36`), logo (`71×30`), `Ver más reseñas...` link (`350×20`). | Wave 5 |
| **MEDIUM** | `/cita/*`, `/links`, `/aviso-de-privacidad`, `/mis-citas`, `/admin/login` (mobile) | **2–5 targets `< 44×44px`**: header logo (`71×30`), footer links (`Inicio` `35×44`, `Links` `33×44`), `Enviar código de verificación` (`348×36`), `Entrar al salón` (`308×32`). | Wave 5 |
| **MEDIUM** | `/admin/*` (mobile) | **5–38 targets `< 44×44px` per route**: Astryx `sm`/`md` buttons (`28–32px`), tabs (`32px`), `ad-demo-chip` (`86×23`), and **`/admin/reportes` period segmented controls only `20px` tall** (`7 días` `54×20`, `30 días` `66×20`, `90 días` `65×20`, `Todo` `48×20`). | Wave 2 (`ui/`) + Wave 5 |
| **LOW** | `/links` (mobile `390×844`) | Button label `"Seguir en Instagram (@laikona.nai..."` clips with ellipsis. | Wave 5 |
| **LOW** | `/` (`LandingConnect.tsx:44,62,157,175`) | 4 non-decorative editorial portfolio nail photos use `alt=""` (replace with descriptive Spanish `alt`; keep decorative stroke/cherry watermarks as `alt=""`). | Wave 5 |
| **INFO** | `/` (`LandingParts.tsx:38`), `/mis-citas`, `/admin/login` | `.lk-reveal` starts `<h2>El menú</h2>` at `opacity: 0` before scroll; Astryx `TextInput` paints focus on outer wrapper (`:focus-within`) rather than inner `<input>`. | Wave 5 |

### 3.2 SEO, Metadata & Crawlability Baseline Audit

- **`GET /robots.txt` (`200 OK`):** Allows `/`, disallows `/admin/`, `/api/`, `/cita/`, declares `Sitemap: http://localhost:3000/sitemap.xml`. **Gaps:** hardcoded `http://localhost:3000` origin; omits `/admin` (without trailing slash) and `/mis-citas`.
- **`GET /sitemap.xml` (`200 OK`, 13 URLs):** Lists `/`, `/reservar`, `/links`, `/aviso-de-privacidad`, and 9 public `/reservar/[slug]` routes (correctly excludes `isPrivate` services). **Gap:** all 13 `<loc>` URLs resolve to `http://localhost:3000/...` because `metadataBase` / production `NEXT_PUBLIC_APP_URL` fallback is missing.
- **PWA / Favicons (`src/app/layout.tsx`, `src/app/manifest.ts`):** Only link SVG `/brand/laikona-avatar.svg`, leaving existing PNG/ICO assets (`laikona-app-192.png`, `laikona-app-512.png`, `laikona-apple-touch.png`, `laikona-favicon.ico`) unreferenced.

| Route | `<title>` (len) | Meta Desc (len) | Canonical | `robots` Meta / `X-Robots-Tag` | `og:image` / `twitter:image` | `twitter:card` | JSON-LD `@type` |
|---|---|---|---|---|---|---|---|
| `/` | `LAIKONA NAILS — by Karla · Manicure y nail art en Puebla` (56) | Yes (121) | **MISSING** | none / none | **MISSING / MISSING** | `summary` | `NailSalon,LocalBusiness` (4,156 B — hardcoded `Mon-Sat 10-18` & `Puebla`; missing `FAQPage`, `BreadcrumbList`, `WebSite`) |
| `/reservar` | **Generic root fallback** (56) | **Generic root** (121) | **MISSING** | none / none | **MISSING / MISSING** | `summary` | **NONE** (missing `BreadcrumbList`, `FAQPage`) |
| `/reservar/[slug]` (e.g. `rubber`) | `Reservar Rubber · LAIKONA NAILS` (31) | Yes (160) | Relative `/reservar/rubber` | `noindex` if `isPrivate` (OK) | **MISSING / MISSING** | `summary` | **NONE** (missing `Service`, `Offer`, `AggregateRating`, `BreadcrumbList`) |
| `/cita/[token]` | **Generic root fallback** (56) | **Generic root** (121) | none | **MISSING `noindex`** / none | MISSING | `summary` | none |
| `/mis-citas` | `Mis citas · LAIKONA NAILS` (25) | Yes (88) | none | `noindex, nofollow` (OK) | MISSING | `summary` | none |
| `/links` | `Links · LAIKONA NAILS` (21) | Yes (142) | Relative `/links` | none / none | **MISSING / MISSING** | `summary` | **NONE** (missing `BreadcrumbList`) |
| `/aviso-de-privacidad` | `Aviso de Privacidad · LAIKONA NAILS` (35) | Yes (151) | Relative `/aviso-de-privacidad` | none / none | **MISSING / MISSING** | `summary` | **NONE** (missing `BreadcrumbList`) |
| `/admin/login` & all 13 `/admin/*` | **Generic root fallback** (56) | **Generic root** (121) | none | **MISSING `noindex`** / none | MISSING | `summary` | none |

---

## 4. Monoliths `> 400` Lines Inventory & Wave 2 Decomposition Plan

**Codebase Summary:** `260` `.ts`/`.tsx` files in `src/` -> **60 files `> 400` LOC** (**50 production files** + **10 test files**).

### 4.1 All 50 Production Monoliths (`> 400` LOC, Sorted Descending)

| # | LOC | Path | Key Responsibilities / Embedded Dialogs, Sections & Hooks | Decomposition Plan (Target `<= 400` LOC / module) | Wave |
|---:|---:|---|---|---|---|
| 1 | 5,109 | `src/lib/repositories/db.ts` | Demo JSON DB store, write locking, hydration, bookings, holds, clients, packages, campaigns, media, loyalty, audit (79 exports) | Split by domain: `demo/core-lock.ts`, `demo/bookings.ts`, `demo/catalog.ts`, `demo/clients.ts`, `demo/finance.ts`, `demo/media.ts` + thin barrel `db.ts` | Wave 2D / Backend |
| 2 | 4,194 | `src/lib/repositories/supabase-repo.ts` | Full Supabase repository inside single `createSupabaseRepository` | Mirror domain split (`supabase/bookings.ts`, `catalog.ts`, `clients.ts`, `finance.ts`, `media.ts`) | Wave 2D / Backend |
| 3 | 1,728 | `src/lib/demo-seed.ts` | Static seed fixtures & default WhatsApp templates | Data-only fixture; optionally split `seed-catalog.ts` / `seed-bookings.ts` if touched | Low priority |
| 4 | 1,610 | `src/app/admin/disponibilidad/page.tsx` | 29 `useState`, 2 tabs: weekly fixed schedules, date overrides/vacations, MX holidays, recurring blocks, embeds `VisualTroubleshooter` | **Top Wave 2 UI:** extract `WeeklyScheduleEditor`, `DateOverridesSection`, `RecurringBlocksSection`, `useAvailabilityPage` -> page `<= 280` LOC | **Wave 2B** |
| 5 | 1,405 | `src/app/admin/citas/page.tsx` | 28 `useState`, 5 tab/view switches, embedded "Bloquear día" `Dialog`, `OwnerPinDialog`, waitlist, list+visual views, 3 dynamic dialogs | **Top Wave 2 UI:** extract `BlockDayDialog`, `WaitlistPanel`, `BookingsFiltersBar`, `useBookingsPageState` -> page `<= 320` LOC | **Wave 2B** |
| 6 | 1,387 | `src/app/admin/marca/page.tsx` | 10 `useState`: brand identity/logo/colors/contrast, wireframe picker, deposit/SPEI, loyalty stamp card, gallery, QR/Embed | **Top Wave 2 UI:** extract `BrandIdentitySection`, `BookingAppearanceSection`, `DepositSettingsSection`, `LoyaltySettingsSection`, `BrandGallerySection` -> page `<= 300` LOC | **Wave 2B** |
| 7 | 1,288 | `src/lib/availability/engine.ts` | Pure availability solver, slot generation, fixed times, conflict/policy checks, diagnostics (17 exports) | Split pure modules: `slot-generator.ts`, `diagnostics.ts`, `bookable-assertions.ts` | Wave 2D |
| 8 | 1,197 | `src/components/BookingWidget.tsx` | 35 `useState`, `useReducer`, 24 `useMemo`/`useCallback`, 6 custom hooks: wizard orchestrator, holds, coupons, realtime, submit | **Top Wave 2 UI:** extract `useBookingFlowActions` (hold/coupon/submit) + `BookingStickyFooter` + dynamic-import steps 2–5 -> widget `<= 360` LOC | **Wave 2C + Wave 4** |
| 9 | 1,170 | `src/app/admin/servicios/page.tsx` | 16 `useState`: service catalog CRUD, live client preview, addons CRUD, thumbnails | **Top Wave 2 UI:** extract `ServiceEditorPanel`, `ServiceLivePreview`, `AddonsManagerSection` -> page `<= 300` LOC | **Wave 2B** |
| 10 | 1,141 | `src/components/admin/AdminShell.tsx` | Desktop rail, mobile nav, quick-search trigger, realtime/sound bell, session/theme controls, sound test | **Top Wave 2 UI:** extract `AdminSidebar`, `AdminMobileNav`, `AdminFooterControls`, `adminNavConfig.ts` -> shell `<= 320` LOC | **Wave 2B** |
| 11 | 1,090 | `src/lib/integrations/notifications.ts` | HTML email templates (booking + retention), Resend, WhatsApp Cloud API, SMS, `wa.me` builders | Split `email-templates.ts`, `whatsapp-dispatch.ts`, `email-dispatch.ts` | Wave 2D |
| 12 | 1,083 | `src/app/admin/onboarding/page.tsx` | 25 `useState`, embedded sound `Dialog`: 4-step wizard (profile, services, hours, alerts) | **Top Wave 2 UI:** extract `OnboardingStepProfile`, `OnboardingStepServices`, `OnboardingStepHours`, `OnboardingStepAlerts` -> page `<= 260` LOC | **Wave 2C** |
| 13 | 1,077 | `src/app/admin/integraciones/page.tsx` | 12 `useState`, 3 tabs: Google Calendar OAuth/sync, WhatsApp templates & quota, Stripe/MP/SPEI, Pixel/GA4/Google Reviews | **Top Wave 2 UI:** extract `GoogleCalendarSection`, `WhatsAppSection`, `PaymentsAnalyticsSection` -> page `<= 250` LOC | **Wave 2B** |
| 14 | 1,020 | `src/components/admin/citas/NewBookingDialog.tsx` | 26 `useState`, 3-step booking creation dialog + recurrence + custom price `OwnerPinDialog` | Extract `NewBookingClientStep`, `NewBookingServiceStep`, `NewBookingSlotStep` -> dialog `<= 340` LOC | **Wave 2C** |
| 15 | 1,004 | `src/components/admin/citas/CheckoutDrawerDialog.tsx` | 15 `useState`, 2 drawer views: split payments, tips, retail add-on, loyalty/package redemption, receipt | Extract `PaymentSplitsEditor`, `CheckoutReceiptView`, `CheckoutLoyaltySection` -> dialog `<= 350` LOC | **Wave 2C** |
| 16 | 980 | `src/lib/repositories/database.types.ts` | Generated Supabase DB schema types | Keep generated (do not hand-split) | Exempt |
| 17 | 952 | `src/components/portal/ClientPortalView.tsx` | 12 `useState`, OTP request/verify flow, upcoming/past bookings, loyalty stamps, client packages | Extract `PortalOtpGate`, `PortalBookingsTab`, `PortalRewardsTab` -> view `<= 280` LOC | **Wave 2C** |
| 18 | 813 | `src/components/ManageBookingView.tsx` | 27 `useState`: self-service booking orchestrator, countdown/policy state, proof upload, reschedule/cancel state | Extract `useManageBookingActions` hook + `ManageBookingSummary` -> view `<= 360` LOC | **Wave 2C** |
| 19 | 777 | `src/lib/hooks/useBookingAvailability.ts` | Client availability cache store, invalidation, window fetcher, React hook | Split pure cache store `availabilityCacheStore.ts` from React hook | Wave 2D |
| 20 | 771 | `src/components/admin/citas/VisualScheduleGrid.tsx` | Time-column visual calendar grid, specialist columns, slot click handlers | Extract `scheduleGridGeometry.ts` + memoized `ScheduleBookingBlock` -> grid `<= 380` LOC | **Wave 2C** |
| 21 | 752 | `src/app/admin/caja/page.tsx` | Cash register shell, CSV export + `OwnerPinDialog`, 4 tabs (`Summary`, `Deposits`, `Commissions`, `Promos`) | Adopt `PageHeader`/`MetricGrid` + extract `useCajaCsvExport` -> page `<= 340` LOC | **Wave 2B** |
| 22 | 726 | `src/app/admin/equipo/page.tsx` | Staff CRUD, commission editor, service matrix, admin user RBAC management | Extract `StaffEditorSection` & `AdminAccessSection` -> page `<= 260` LOC | **Wave 2C** |
| 23 | 720 | `src/app/admin/clientas/page.tsx` | Client CRM shell, KPIs, search, 3 tabs (`Directory`, `Loyalty`, `Retention`), dialogs | Adopt `PageHeader`/`MetricGrid` + extract `ClientKpisHeader` -> page `<= 350` LOC | **Wave 2B** |
| 24 | 717 | `src/lib/analytics/reports.ts` | Executive KPIs, revenue/occupancy/profitability/heatmap aggregations | Split `revenueMetrics.ts` & `occupancyHeatmap.ts` | Wave 2D |
| 25 | 709 | `src/lib/storage/media.ts` | Magic-byte validation, HMAC media URL signing, R2 binding / R2 S3 / local demo drivers | Split `media-validation.ts`, `media-signing.ts`, `media-drivers.ts` | Wave 2D |
| 26 | 692 | `src/components/booking/ClientConfirmStep.tsx` | Client form, inspo photo upload, coupon input, consent checkboxes, hold expiry notice | Adopt `UploadDropzone` + extract `CouponRedeemBox` -> step `<= 380` LOC | **Wave 2C** |
| 27 | 685 | `src/lib/repositories/schema.ts` | Full Zod schema for `DemoDatabase` (82 defs) | Import shared enums/primitives from `src/lib/contracts/` -> `<= 400` LOC | **Wave 2A** |
| 28 | 673 | `src/lib/types.ts` | Domain interfaces & unions (55 exports) | Re-export inferred unions from `src/lib/contracts/enums.ts`; split secondary domain types if needed | Wave 2A |
| 29 | 663 | `src/components/cita/CitaActionsPanel.tsx` | Calendar add links, location/map, inspo preview, QR code, copyable link, WA fallback | Extract `CitaQrCard` + adopt `CopyableField` & `SurfaceCard` -> `<= 360` LOC | **Wave 2C** |
| 30 | 656 | `src/components/admin/caja/CajaSummaryTab.tsx` | 8 `useState`: cash ledger filters, manual income/expense form, movement list | Extract `CashMovementForm` + adopt `FilterPillBar`/`ActionRow` -> `<= 350` LOC | **Wave 2C** |
| 31 | 650 | `src/lib/hooks/useAdminCache.ts` | Admin stale-while-revalidate cache, prefetching, invalidation | Split pure `adminCacheStore.ts` from React hooks | Wave 2D |
| 32 | 593 | `src/app/admin/inventario/page.tsx` | 16 `useState`: stock list, low-stock filter, restock/usage/sale adjustments, new item form | Extract `InventoryItemForm` & `StockAdjustRow` -> page `<= 320` LOC | **Wave 2C** |
| 33 | 590 | `src/components/cita/CitaDepositSection.tsx` | 8 `useState`: SPEI details copy, proof photo upload & preview, delivery method toggle | Share `SpeiDetailsCard` (`CopyableField`) & `UploadDropzone` with `DepositCard` -> `<= 340` LOC | **Wave 2C** |
| 34 | 574 | `src/lib/qr.ts` | Pure Reed-Solomon QR matrix & SVG generator | Keep self-contained pure domain algorithm (exempt) | Exempt |
| 35 | 546 | `src/components/booking/ScheduleStep.tsx` | Month/week/column views, date picker, period filter, slot grid | Extract `ScheduleCalendarView` & memoized `SlotPickerGrid` -> `<= 320` LOC | **Wave 2C** |
| 36 | 544 | `src/lib/integrations/google-calendar.ts` | AES-256-GCM token crypto, OAuth exchange, FreeBusy, event sync, watch channels | Split `google-oauth-crypto.ts` vs `google-calendar-api.ts` | Wave 2D |
| 37 | 504 | `src/components/admin/AdminQuickSearchDialog.tsx` | Command-style search dialog (`Cmd+K`) across bookings, clients, routes | Extract `adminSearchIndex.ts` + adopt `StatusTag` -> `<= 340` LOC | **Wave 2C** |
| 38 | 489 | `src/components/admin/dashboard/DashboardAttentionCard.tsx` | Pending deposits, uncollected bookings, low stock, WA quota alerts + proof preview `Dialog` | Extract `DepositProofPreviewDialog` + adopt `ActionRow`/`SurfaceCard` -> `<= 340` LOC | **Wave 2C** |
| 39 | 470 | `src/components/admin/caja/CajaPromosTab.tsx` | 14 `useState`: coupons/gift cards CRUD + service packages CRUD | Split `CouponsSubSection` & `PackagesSubSection` -> `<= 250` LOC each | **Wave 2C** |
| 40 | 470 | `src/components/admin/clientas/ClientProfileDialog.tsx` | 8 `useState`, `Dialog`: client history, notes/birthday editor, ARCO JSON export, packages | Extract `ClientHistoryList` & `ClientPackagesList` -> `<= 320` LOC | **Wave 2C** |
| 41 | 467 | `src/components/admin/disponibilidad/VisualTroubleshooter.tsx` | 8 `useState`: slot-by-slot diagnosis UI & filter pills | Adopt `FilterPillBar`, `StatusTag`, `SurfaceCard` -> `<= 360` LOC | **Wave 2B** |
| 42 | 464 | `src/components/admin/clientas/ClientRetentionTab.tsx` | Birthday + inactive reactivation lists & WhatsApp campaign dispatch | Extract `CampaignCandidateRow` + adopt `ActionRow` -> `<= 340` LOC | **Wave 2C** |
| 43 | 461 | `src/components/admin/citas/BookingQuickPopover.tsx` | 3 `<Dialog>`s: booking detail sheet, proof zoom modal, reschedule/cancel triggers | Extract `BookingProofModal` + adopt `ConfirmActionDialog`/`StatusTag` -> `<= 330` LOC | **Wave 2B** |
| 44 | 461 | `src/components/cita/CitaDialogs.tsx` | 2 `<Dialog>`s: reschedule date/slot picker + cancel confirmation | Split `CitaRescheduleDialog` & `CitaCancelDialog` (via `ConfirmActionDialog`) -> `<= 240` LOC each | **Wave 2C** |
| 45 | 455 | `src/components/admin/dashboard/DashboardRightColumn.tsx` | Quick share link, QR `Dialog`, retention/loyalty glance | Adopt `CopyableField` & shared QR modal -> `<= 320` LOC | **Wave 2B** |
| 46 | 451 | `src/app/api/admin/availability/route.ts` | 4 handlers + 9 inline Zod schemas | Import schemas from `src/lib/contracts/availability.ts` -> `<= 330` LOC | **Wave 2A** |
| 47 | 445 | `src/components/booking/DepositCard.tsx` | SPEI bank/CLABE copy, proof upload/DM toggle, preview | Adopt `CopyableField` & `UploadDropzone` -> `<= 310` LOC | **Wave 2C** |
| 48 | 440 | `src/components/admin/dashboard/DashboardAgendaCard.tsx` | Today's agenda filter pills, booking rows, status quick actions | Adopt `FilterPillBar`, `ActionRow`, `StatusTag` -> `<= 330` LOC | **Wave 2B** |
| 49 | 409 | `src/app/api/admin/bookings/route.ts` | 3 handlers + 13 inline Zod schemas | Import schemas from `src/lib/contracts/bookings.ts` -> `<= 290` LOC | **Wave 2A** |
| 50 | 401 | `src/components/admin/config/EmbedGeneratorCard.tsx` | Embed snippet tabs, live preview `Dialog`, copyable code | Adopt `CopyableField` & `SurfaceCard` -> `<= 320` LOC | **Wave 2B** |

### 4.2 Test Files `> 400` LOC (10 Files — Reference Only, Preserve Full Coverage)
`src/app/api/security.test.ts` (3,576), `src/lib/repositories/db.test.ts` (2,040), `src/lib/repositories/supabase-repo.test.ts` (2,037), `src/lib/availability/engine.property.test.ts` (1,189), `src/lib/availability/engine.test.ts` (1,021), `src/lib/repositories/schema.test.ts` (578), `src/lib/analytics/reports.test.ts` (570), `src/lib/hooks/useAdminCache.test.ts` (481), `src/app/api/media/media-auth.test.ts` (478), `src/lib/hooks/useBookingAvailability.test.ts` (464).

---

## 5. CSS, Public Media & Bundle Optimization Baseline

### 5.1 Stylesheets Audit (`globals.css` & `admin.css`)
- **`src/app/globals.css`:** **63,568 bytes (62.08 KB) · 2,038 lines** · 458 leaf rules · 233 unique prefixed classes (`lk`: 87 / 551L, `rb`: 92 / 468L, `fx`: 18 / 284L, `sk`: 6 / 190L, `ad`: 4 / 154L, `ck`: 21 / 121L, `pt`: 5 / 121L, other: 149L).
- **`src/app/admin/admin.css`:** **46,278 bytes (45.19 KB) · 2,289 lines** · 314 leaf rules · 156 unique prefixed classes (`ad`: 154, `sk`: 2).
- *Theme CSS (Astryx generated, do not hand-edit):* `src/themes/nails/nails.css` (37,937 B / 810L) + `nails.fonts.css` (494 B / 10L).
- **9 Verified Zero-Reference Classes (Safe to Delete in Wave 3):**
  - `globals.css` (6): `.ck-proof-img`, `.lk-link-btn`, `.lk-nav-cta-desktop`, `.lk-tab`, `.lk-tablist`, `.rb-enter`
  - `admin.css` (3): `.ad-boundary`, `.ad-boundary-grid`, `.ad-kpis-5`
- **Duplicate Rule Blocks & Leaks:**
  - `globals.css`: 51 repeated selectors + **13 identical `>35`-char declaration blocks** (`.rb-layout` vs `.ck-layout`, `.fx-shimmer::after, .ad-skeleton::after` vs `.sk-bar::after`).
  - `admin.css`: 38 repeated selectors + **11 identical `>35`-char declaration blocks**, notably **16 separate `:focus-visible` rules** repeating `outline: 2px solid var(--color-accent); outline-offset: 2px;`.
  - **Cross-route leak:** Admin-only `.ad-skeleton` and `.sk-admin-grid` (plus `.ad-pkg-*`) sit in `globals.css` and are downloaded on `/` and `/reservar`.
- **Wave 3 Route-Scoped CSS Split Plan:**
  - Slim `src/app/globals.css` (~15–18 KB): tokens, base typography/motion (`.fx-*`), shared booking chrome base, and minimal skeleton base.
  - `src/app/landing.css`: `.lk-*` (imported only in `/`).
  - `src/app/booking.css`: `.rb-*` (imported only in `/reservar` and `/reservar/[slug]`).
  - `src/app/cita.css`: `.ck-*` (imported only in `/cita/[token]`, `/links`, `/aviso-de-privacidad`).
  - `src/app/portal.css`: `.pt-*` + package pips (imported only in `/mis-citas`).
  - Move `.ad-skeleton` and `.sk-admin-grid` into `src/app/admin/admin.css` and consolidate the 16 `:focus-visible` rules into one shared selector list.

### 5.2 Public Media Audit (`public/`)
- **Total Baseline:** **128 files · 15.82 MB (16,589,681 bytes)** (`.jpg`: 56 / 12.38 MB, `.webp`: 30 / 3.13 MB, `.png`: 6 / 0.23 MB, `.svg`: 34 / 0.08 MB, `.js`: 1 / 4.1 KB, `.ico`: 1 / 3.0 KB).
- **Orphaned Assets (`ZERO` references in `src/`, `public/`, `scripts/`, `e2e/`, `supabase/`, `next.config.ts`): 71 / 128 files = 12.89 MB (81.5%):**
  1. `public/gallery/instagram/*.jpg`: **56 files · 12.38 MB** (100% unreferenced raw IG exports, 1080×1180–1350×1688, already transcoded into `public/landing/sets/foto-*.webp`). -> **Delete in Wave 3.**
  2. `public/landing/sets/` unused WebPs: **3 files · 405.6 KB** (`foto-046.webp` 146.8 KB, `foto-050.webp` 128.9 KB, `foto-054.webp` 129.9 KB). -> **Delete in Wave 3.**
  3. `public/brand/` unreferenced: **10 files · 120.4 KB** — **WIRE** 4 PWA/favicon assets (`laikona-app-192.png` 4.8 KB, `laikona-app-512.png` 15.9 KB, `laikona-apple-touch.png` 4.4 KB, `laikona-favicon.ico` 3.0 KB) into `manifest.ts`/`layout.tsx`; **DELETE** the remaining 6 (`laikona-sets-instagram.webp`, `laikona-wordmark.svg`, `laikona-logo-instagram.svg`, `laikona-patron-cerezas.svg`, `laikona-favicon.svg`, `laikona-cerezas.svg`).
  4. Root `public/`: **2 files · 2.3 KB** (`icon.svg`, `laikona-logo.svg`). -> **Delete in Wave 3.**
- **Active Media Compression Targets (57 files · 2.93 MB):**
  - `public/landing/sets/foto-025.webp`: **321.0 KB** (`1036×1261`) + 13 other `foto-*.webp` at **113–163 KB** (`1320×1760`) -> resize `<= 800px` wide + re-encode WebP q78–82 (~50–65% reduction).
  - Artist avatar PNGs (`avatar-marfil.png` 70.4 KB, `avatar-cereza.png` 68.7 KB, `avatar-obsidiana.png` 68.5 KB, all `1080×1080` rendered at `68–220px`) -> convert to `440×440` WebP (~10–15 KB each, ~80% reduction).

### 5.3 Bundle, `next/dynamic` & Memoization Audit
- **Current `next/dynamic` Usages:** 11 components across 9 files (`VisualTroubleshooter`, `NewBookingDialog`, `CheckoutDrawerDialog`, `QuickSlotFinderDialog`, `QrShareCard`, `EmbedGeneratorCard`, `WaitlistDialog`, `AdminQuickSearchDialog`, `CitaDialogs`, `LandingCreationLightbox`, `LandingTeamDialog`, `LandingMobileMenuDialog`).
- **Wave 4 Lazy-Loading Targets (Currently Static Imports):**
  - **Admin closed dialogs / non-default views:** `BookingQuickPopover` (461L), `VisualScheduleGrid` (771L), `ClientProfileDialog` (470L), `NewClientDialog` (162L), `OwnerPinDialog` (120L), `AppearanceWireframePicker` (284L).
  - **Admin non-default tabs:** `ClientRetentionTab` (464L), `ClientLoyaltyTab` (395L), `CajaPromosTab` (470L), `CajaDepositsTab` (314L), `CajaCommissionsTab` (162L).
  - **Public non-initial steps / below-the-fold:** `ExtrasStep` (141L), `ScheduleStep` (546L), `StaffStep` (190L), `ClientConfirmStep` (692L) + `DepositCard` (445L) inside `BookingWidget.tsx` (step 1 only needs `ServiceStep`), `ServiceReviewsSection` on `/reservar/[slug]`, and below-fold landing sections (`LandingReviews`, `LandingConnect`, `LandingVisit`, `LandingFooter`).
- **`React.memo` Usage:** **0 usages** in `src/`. Top Wave 4 memoization candidates: `BookingCard`, `VisualScheduleGrid` rows/blocks, `BookingSummaryCard`, `ScheduleStep` slot buttons, `DashboardAgendaCard` rows.

---

## 6. Security Audit Baseline (Cloudflare `security-audit` & `AGENTS.md`)

### 6.1 Prioritized Findings Requiring Remediation

| ID | Severity | Location | Vulnerability / Boundary Gap | Required Remediation & System Hardening |
|---|---|---|---|---|
| **SEC-01** | **HIGH** | `src/app/api/bookings/route.ts:126-132` | `POST /api/bookings` returns raw hydrated `booking` from `createBookingWithExtras()`, leaking **`booking.staff.commissionPercent`**, **`booking.internalNotes`**, and returning clients' internal CRM **`booking.client.notes`** to unauthenticated callers. | Sanitize response with `toPublicStaffDTO`, `toPublicServiceDTO`, `internalNotes: ''`, `client.notes: ''`. Add regression test in `security.test.ts` + extend `check-guardrails.mjs` DTO check. |
| **SEC-02** | **HIGH** | `src/app/api/admin/team/route.ts:6-25`, `src/app/api/admin/operations/route.ts:95-149` | Zero Zod validation (mass assignment via raw `body.data` / `body.patch` spread into DB mutators); `team/route.ts` lacks JSON try/catch, omits `request` arg to `requireAdmin()`, and returns `403` when unauthenticated instead of `401`. | Parse with strict discriminated-union Zod schemas from `src/lib/contracts/team.ts` and `src/lib/contracts/operations.ts`, pass `request` to `requireAdmin()`, return `401` vs `403` accurately. |
| **SEC-03** | **HIGH** | `src/app/api/admin/overview/route.ts:312,343-356`, `src/app/api/admin/brand/route.ts:187` | Returns raw `settings` (exposing **`ownerPinHash`** scrypt hash) and raw `calendarConnections` (exposing **`accessTokenEncrypted` & `refreshTokenEncrypted`**) to all authenticated roles; leaks peer `staff.commissionPercent`, full `clients` PII, `adminUsers`, `workflows`, `notifications`, `coupons`, `waitlist`, `inventory` to `specialist` role. | Create `toAdminSettingsDTO` (omit `ownerPinHash`, expose `hasOwnerPin: boolean`) and `toAdminCalendarConnectionDTO` (omit encrypted tokens); scope `/api/admin/overview` payload strictly by RBAC role (`specialist` sees own staff/bookings/availability/cash/reports only). |
| **SEC-04** | **HIGH** *(CF Workers)* | `src/lib/security/rate-limit.ts:61-72`, `client-portal-otp.ts`, `admin-session.ts` | `getRequestIp()` checks spoofable `x-forwarded-for` **before** `cf-connecting-ip`, allowing attackers on Cloudflare Workers to bypass all public rate limits. Per-isolate `globalThis` Maps do not share state across Worker isolates/PoPs. | Prioritize `cf-connecting-ip` first (fallback to `x-real-ip` / last trusted `x-forwarded-for` only in local dev); document & wire distributed KV/Supabase-backed store option for production Workers. |
| **SEC-05** | **MEDIUM** | `src/app/api/bookings/manage/[token]/route.ts:38-49` | `toPublicManageBooking()` strips `internalNotes` but leaves **`booking.client.notes`** (staff CRM notes) exposed in `GET` and `PATCH` JSON responses (unlike `/cita/[token]/page.tsx:68-71`). | Scrub `client: { ...booking.client, notes: '' }` inside shared `toPublicManageBooking()` helper; assert in `security.test.ts`. |
| **SEC-06** | **MEDIUM** | `api/admin/session`, `api/admin/operations?export=csv`, `api/admin/bookings`, `api/bookings/manage/[token]`, `api/availability` | Missing rate limiting on admin login (`POST /api/admin/session`), Owner PIN verification (4–6 digit PIN), manage-token lookups, and CPU-heavy availability queries. | Apply `checkRateLimit()` buckets with `Retry-After` headers across auth, PIN, token, and availability endpoints. |
| **SEC-07** | **MEDIUM** | `src/lib/repositories/db.ts:124-126` (`persistBookingMediaField`) | Public `POST /api/bookings` and `PATCH /api/bookings/manage/[token]` accept arbitrary external `https://`/`http://` URLs, enabling attacker-controlled tracking pixels inside `/admin` (allowed by `img-src https:`). | Restrict public uploads to validated `data:image/*` persisted to private `/api/media/...` (reject external arbitrary URLs on public endpoints). |
| **SEC-08** | **LOW/INFO** | `next.config.ts` | CSP allows `script-src 'self' 'unsafe-inline'`, `style-src 'self' 'unsafe-inline'`, `img-src ... https:`, `connect-src 'self' https: wss:`. | Tighten allowed image/connect origins to configured R2/Supabase/analytics hosts in hardening pass while keeping `/reservar?embed=1` `frame-ancestors *` and non-embed `DENY`. |

### 6.2 Confirmed Clean Security Controls
- **Private R2 `/api/media/[...path]`:** Fail-closed `401`/`403`; traversal/symlink/realpath guards; PNG/JPEG/WEBP magic-byte verification on write & read (`<= 2.5 MB`); strict RBAC (`owner`/`admin` all, `specialist` own bookings, client `manageToken` constant-time or portal session phone match or HMAC-signed `?exp=&sig=`); sandboxed headers (`Content-Security-Policy: default-src 'none'; sandbox`, `X-Content-Type-Options: nosniff`, `Cache-Control: private, max-age=300, no-store`).
- **Webhooks:** WhatsApp (`HMAC-SHA256` `x-hub-signature-256` + fail-closed `WHATSAPP_VERIFY_TOKEN` + event idempotency), MercadoPago (`HMAC-SHA256` `x-signature` + server-side payment lookup + idempotent crediting), Google Calendar (`x-goog-channel-token` constant-time fail-closed).
- **Cron Routes (`/api/cron/reminders`, `/api/cron/retention`):** Fail-closed `503` without `CRON_SECRET`, Bearer token checked with `constantTimeEqual`.
- **Sessions & Cryptography:** Purpose-derived HMAC-SHA256 cookies (`httpOnly`, `sameSite: 'lax'`, `secure` in prod), fail-closed demo auth in prod, Google OAuth double-submit CSRF + signed state + AES-256-GCM encrypted tokens, `scrypt` (`N=16384`) Owner PIN hashing.
- **Public Visibility & Diagnostics:** `isPrivate` services hidden from `/`, `/reservar`, `/links`, `/sitemap.xml`, `/api/public/bootstrap`; `/api/availability` blocks `mode=diagnose` (`403`) and arbitrary `ignoreBookingId`.
- **Automated Enforcement:** 39 security tests in `src/app/api/security.test.ts` + AST guardrails in `scripts/check-guardrails.mjs`.

---

## 7. Atomic UI Library Blueprint (`src/components/ui/`)

### 7.1 Non-Negotiable Architecture Rules
1. **100% `@astryxdesign/core` v0.7.17 Composition:** Every component in `src/components/ui/` composes Astryx primitives (`VStack`, `HStack`, `Grid`, `Card`, `Heading`, `Text`, `Button`, `IconButton`, `Token`, `StatusDot`, `Badge`, `EmptyState`, `AlertDialog`, `FileInput`, `Skeleton`, `SegmentedControl`, `Divider`, `Tooltip`).
2. **Mechanical Guardrail Compliance (`scripts/check-guardrails.mjs`):**
   - **Zero** raw `<div>` or `<span>` elements.
   - **Zero** inline `#hex` colors or `px` units (use Astryx spacing steps, `var(--color-*)`, `var(--spacing-*)`, `var(--radius-*)`, or scoped CSS classes).
   - **Zero** `useEffect` or `setTimeout` inside `src/components/ui/` — all infrastructure timers/clipboard/listeners live exclusively in `src/lib/hooks/` (specifically add `src/lib/hooks/useCopyToClipboard.ts`).
   - **Zero** code comments (unless an audited `// INVARIANT:`), **zero** `any` / `as unknown as`, **zero** imports from `repositories/`, `integrations/`, or `auth/`.
3. **Astryx Semantics & Accessibility:**
   - **`Badge` = counts ONLY** (per `AGENTS.md`). Text status pills MUST compose `@astryxdesign/core/Token` and/or `@astryxdesign/core/StatusDot` + `Text`.
   - **Light & Dark Theme Parity:** Every surface, border, status tone, and hover state uses Astryx theme tokens (`data-theme="dark"` verified with `>= 4.5:1` contrast).
   - **Mobile Touch Ergonomics:** Interactive controls inside `src/components/ui/` default to `>= 44px` minimum hit height on coarse pointers (`@media (pointer: coarse)`), directly eliminating the Wave 1 mobile `<44px` findings.

### 7.2 Anti-Duplication Policy (Use Astryx Directly — Do NOT Wrap)
Do **not** create pass-through wrappers in `src/components/ui/` for components that `@astryxdesign/core` already provides cleanly:
- **`Banner`** (`@astryxdesign/core/Banner` — already 30 usages; supports `status`, `title`, `description`, `endContent`, `isDismissable`, `container="card"|"section"`).
- **`Dialog` / `Drawer` / `BottomSheet` / `Popover` / `Tooltip` / `Collapsible` / `Divider` / `Button` / `Badge` (counts only) / `TextInput` / `Selector` / `Switch` / `CheckboxInput` / `ProgressBar` / `Avatar` / `Table` / `List`**.

### 7.3 Companion Infrastructure Hook (`src/lib/hooks/useCopyToClipboard.ts`)
Encapsulates `navigator.clipboard.writeText(...)` + timed reset (via `useEphemeralMessage` or ref-backed `window.setTimeout` with cleanup), replacing **19 duplicated clipboard blocks across 13 files** while keeping `src/components/ui/` 100% free of `useEffect`/`setTimeout`.
```ts
export interface UseCopyToClipboardResult {
  copied: boolean;
  feedback: string | null;
  copy: (value: string, successMessage?: string, fallbackMessage?: string) => Promise<boolean>;
  reset: () => void;
}
```

### 7.4 `src/components/ui/` Atomic Component Catalog (10 Focused Modules)

| # | Module (`src/components/ui/`) | Astryx Primitives Composed | Exact Props Contract | Replaces / Migrates | Wave 2 Consumers |
|---:|---|---|---|---|---|
| 1 | `PageHeader.tsx` | `HStack`, `VStack`, `Heading` (`level={1}`), `Text` | `{ eyebrow?: string; title: string; subtitle?: string; meta?: ReactNode; actions?: ReactNode; className?: string }` | Promotes `AdminConfigPageHeader` (`AdminConfigPrimitives.tsx`) | All 12 `/admin/*` pages, `/aviso-de-privacidad`, `/links`, `/mis-citas` (**15+ files**) |
| 2 | `SurfaceCard.tsx` | `VStack` (`as="section"`), `HStack`, `Heading` (`level={2\|3}`), `Text`, optional `Card` | `{ id?: string; title?: string; subtitle?: string; icon?: ReactNode; count?: number; badge?: ReactNode; actions?: ReactNode; footer?: ReactNode; tone?: 'default'\|'subtle'\|'accent'\|'warning'; padded?: boolean; overflowVisible?: boolean; headingLevel?: 2\|3; className?: string; children: ReactNode }` | Promotes `AdminConfigSection` + standardizes `.ad-surface`/`.rb-panel`/`.ck-panel` | 30+ admin & public panels (`admin/marca`, `disponibilidad`, `citas`, `servicios`, `integraciones`, `caja`, `clientas`, `reportes`, `cita/*`) |
| 3 | `MetricTile.tsx` | `VStack` (`as="article"`), `Grid` / `<section className="ad-kpi-grid">`, `Text` (`hasTabularNumbers`) | `MetricTileProps: { label: string; value: string; sub?: string; tone?: 'default'\|'warning'\|'success'\|'accent'; interactive?: boolean }` + `MetricGridProps: { ariaLabel: string; items: readonly (MetricTileProps & { id: string })[]; cols?: 2\|3\|4; footerLink?: ReactNode }` | Unifies `AdminConfigKpiStrip` + `DashboardKpiRow` | `/admin`, `/admin/caja`, `/admin/citas`, `/admin/clientas`, `/admin/reportes`, 7 config pages (**12 files**) |
| 4 | `StatusTag.tsx` | `Token` (`color`, `label`, `size`, `icon`) + optional `StatusDot` | `{ label: string; tone?: 'neutral'\|'success'\|'warning'\|'danger'\|'info'\|'accent'; showDot?: boolean; icon?: ReactNode; size?: 'sm'\|'md'; hasTabularNumbers?: boolean }` + domain mappers `BookingStatusTag` / `WaitlistStatusTag` / `PackageStatusTag` | Replaces `AdminConfigChip` + 7 duplicated `BookingStatus` switch/maps (strictly respects `Badge` = counts only) | `BookingCard`, `BookingQuickPopover`, `VisualScheduleGrid`, `ClientProfileDialog`, `DashboardAgendaCard`, `AdminQuickSearchDialog`, `CitaHero`, `ClientPortalView`, `admin/citas`, `VisualTroubleshooter` (**23 files**) |
| 5 | `EmptyStateCard.tsx` | `EmptyState` (`@astryxdesign/core/EmptyState`) wrapped in optional `SurfaceCard` | `{ title: string; description?: string; icon?: ReactNode; actions?: ReactNode; headingLevel?: 2\|3\|4; isCompact?: boolean; framed?: boolean }` | Replaces `AdminConfigEmpty` (which duplicated `EmptyState`) & ad-hoc `.ad-empty` blocks | `admin/citas`, `admin/reportes`, `AdminQuickSearchDialog`, `Caja*Tab` (4), `Client*Tab` (3), `DashboardAgendaCard`, `VisualScheduleGrid` (**17 files**) |
| 6 | `CopyableField.tsx` | `HStack`, `VStack`, `Text`, `Button` / `IconButton` + `useCopyToClipboard` | `{ label?: string; value: string; displayValue?: string; copyValue?: string; copyLabel?: string; copiedLabel?: string; feedbackMessage?: string; monospace?: boolean; layout?: 'inline'\|'stacked'; endExtra?: ReactNode }` | Eliminates 19 raw `navigator.clipboard.writeText` flows + shared SPEI CLABE copy box | `DepositCard`, `CitaDepositSection`, `CitaActionsPanel`, `CitaHero`, `DashboardRightColumn`, `AdminShell`, `QrShareCard`, `EmbedGeneratorCard`, `admin/citas`, `equipo`, `integraciones`, `onboarding`, `servicios` (**13 files**) |
| 7 | `ActionRow.tsx` | `HStack`, `VStack`, `Text` | `{ leading?: ReactNode; title: ReactNode; subtitle?: ReactNode; meta?: ReactNode; status?: ReactNode; actions?: ReactNode; interactive?: boolean; onClick?: () => void; className?: string }` | Unifies `.ad-row` / `.ad-row-actions` / `.ad-task` dense data rows | `DashboardAttentionCard`, `DashboardAgendaCard`, `CajaDepositsTab`, `CajaSummaryTab`, `ClientDirectoryTab`, `ClientRetentionTab`, `admin/inventario`, `admin/servicios`, `admin/equipo` (**20+ files**) |
| 8 | `ConfirmActionDialog.tsx` | `AlertDialog` (`@astryxdesign/core/AlertDialog`) | `{ isOpen: boolean; onOpenChange: (open: boolean) => void; title: string; description: string; confirmLabel: string; cancelLabel?: string; variant?: 'destructive'\|'primary'; isLoading?: boolean; onConfirm: () => void \| Promise<void> }` | Brings Astryx `AlertDialog` (currently 0 usages) with Spanish defaults (`cancelLabel = 'Cancelar'`) and WAI-ARIA `role="alertdialog"` | `BookingQuickPopover`, `CitaDialogs` (simple confirm paths), `CajaDepositsTab`, `DashboardAttentionCard`, `admin/disponibilidad`, `admin/servicios`, `admin/equipo` |
| 9 | `UploadDropzone.tsx` | `FileInput` (`@astryxdesign/core/FileInput`), `VStack`, `HStack`, `Button`, `Text`, `Banner`, `ProgressBar` | `{ label: string; accept?: string; previewUrl: string \| null; previewAlt: string; fileName?: string \| null; fileSizeLabel?: string \| null; progress?: number \| null; error?: string \| null; isDisabled?: boolean; helperText?: string; onSelectFile: (file: File \| null) => void; onClear: () => void }` | Unifies image/receipt upload + preview + replace + remove + validation UI | `ClientConfirmStep` (inspo), `DepositCard` (SPEI proof), `CitaDepositSection` (SPEI proof) (**3 heavy flows**) |
| 10 | `FilterPillBar.tsx` & `SkeletonBlock.tsx` | `FilterPillBar`: `SegmentedControl` / `HStack` + `ToggleButton` (with `>=44px` coarse-pointer height). `SkeletonBlock`: `@astryxdesign/core/Skeleton` (`width`, `height`, `radius`, `index`) + `PageSkeleton` preset | `FilterPillBarProps<T extends string>: { ariaLabel: string; value: T; options: readonly { value: T; label: string; count?: number }[]; onChange: (value: T) => void; mode?: 'segmented'\|'pills' }` · `PageSkeletonProps: { kpiCount?: number; withSplit?: boolean; ariaLabel?: string }` | Replaces 21 ad-hoc `.ad-pill`/`.rb-pill` bars (fixes 20px `/admin/reportes` targets) & replaces 24 `.sk-bar`/`.ad-skeleton` `\u200B` workarounds with real Astryx `Skeleton` (currently 0 imports) | All 11 `loading.tsx` files, `AdminConfigSkeleton`, `admin/citas`, `reportes`, `disponibilidad`, `inventario`, `CajaSummaryTab`, `DashboardAgendaCard`, `ClientDirectoryTab`, `VisualTroubleshooter` (**30+ files**) |

**Migration Note for `AdminConfigPrimitives.tsx`:** Once `src/components/ui/` lands in Wave 2A, `src/components/admin/config/AdminConfigPrimitives.tsx` is either deleted immediately after updating its 10 consumers to import from `@/components/ui/*` (preferred — "Subtract Before You Add", keeps `knip` at 0 unused exports) or reduced to zero leftover code.

---

## 8. Shared Zod Contracts Blueprint (`src/lib/contracts/`)

### 8.1 Domain-Purity & Guardrail Enforcement
- **Strict Dependency Boundary:** Every file in `src/lib/contracts/**` may import **only** `zod` and other pure files inside `src/lib/contracts/**` or pure domain types. Zero imports from `react`, `react-dom`, `next`, `@supabase/*`, `src/lib/repositories/*`, `src/lib/integrations/*`, or `src/lib/auth/*`.
- **Mechanical Guardrail Addition (Wave 2A):** Update `isPureDomainFile(rel)` in `scripts/check-guardrails.mjs` to include `rel.startsWith('src/lib/contracts/')` (plus unit tests in `scripts/check-guardrails.test.mjs`) so purity is enforced on every `npm run verify`.
- **Shared Public/Admin Security Invariant:** Public booking request schemas (`PublicCreateBookingSchema`) NEVER accept privileged fields (`forceConfirmed`, `source`, `role`), preserving the existing `no-privileged-public-fields` AST rule.

### 8.2 Module Layout & Single Source of Truth (`src/lib/contracts/`)

| Module | Shared Schemas & Inferred Types | Eliminates Duplication / Fixes Security Gap In |
|---|---|---|
| `enums.ts` | `AdminRoleSchema`, `BookingStatusSchema`, `BookingSourceSchema`, `BookingLayoutViewSchema`, `ThemeModePreferenceSchema`, `CornerStyleSchema`, `PaymentModeSchema`, `PaymentMethodSchema`, `PaymentSplitMethodSchema`, `NotificationChannelSchema`, `CurrencySchema`, `ServiceModeSchema`, `SlotIntervalMinutesSchema`, `ProofDeliveryMethodSchema`, `RatingSchema`, `DayOfWeekSchema`, `RecurringFrequencySchema`, `PreferredWindowSchema`, `WaitlistStatusSchema`, `ClientPackageStatusSchema`, `CampaignKindSchema`, `RewardTypeSchema`, `AuditActionSchema` | Consolidates **18+ enums** currently copy-pasted 2–4× across `schema.ts`, `public-dto.ts`, `admin-session.ts`, and 10 API routes |
| `primitives.ts` | `DateKeySchema` (`YYYY-MM-DD`), `TimeHHMMSchema` (`00:00–23:59`), `NonEmptyIdSchema`, `PhoneInputSchema`, `OptionalEmailSchema`, `InstagramHandleSchema`, `CentsNonNegativeSchema`, `MediaDataUrlSchema` (strict `data:image/(png\|jpeg\|webp);base64,...` bounded `<= 4_000_000` chars for public flows — fixes **SEC-07**), `ClientContactFieldsSchema` | Unifies client contact validation across **12 files** and fixes arbitrary external URL acceptance |
| `bookings.ts` | `PublicCreateBookingSchema`, `AdminCreateBookingSchema`, `ManageBookingPatchSchema` (`cancel\|reschedule\|upload_proof`), `SubmitReviewSchema`, `CheckoutSplitSchema`, `AdminPatchBookingStatusSchema`, `SendReminderSchema`, `RequestRescheduleSchema`, `CreateSlotHoldSchema`, `CreateWaitlistSchema`, `ValidateCouponSchema` | Replaces inline schemas in `api/bookings`, `api/admin/bookings` (saves ~120L), `api/bookings/manage/[token]`, `api/slot-holds`, `api/waitlist`, `api/coupons/validate`, and powers client-side form validation |
| `availability.ts` | `AvailabilityRuleSchema`, `PutScheduleSchema`, `PostOverrideSchema`, `PostOverrideRangeSchema`, `PreloadHolidaysSchema`, `PostRecurringBlockSchema`, `ToggleRecurringBlockSchema`, `PublicAvailabilityQuerySchema` | Replaces 9 inline schemas in `api/admin/availability/route.ts` (saves ~120L) and validates `GET /api/availability` query params |
| `catalog.ts` | `ServiceInputSchema`, `AddonInputSchema`, `CatalogMutationSchema` (`discriminatedUnion('kind', ['service', 'addon'])`), `StarterServiceSchema`, `CreateServicePackageSchema`, `AssignClientPackageSchema`, `PatchClientPackageSchema` | Unifies `api/admin/services`, `api/admin/onboarding`, `api/admin/packages`, `public-dto.ts` |
| `clients.ts` | `CreateClientSchema`, `PatchClientSchema`, `ClientPortalOtpActionSchema`, `DispatchCampaignSchema` | Unifies `api/admin/clients`, `api/client-portal/otp`, `api/admin/campaigns` |
| `brand.ts` | `LandingContentSchema`, `LoyaltyProgramPatchSchema`, `BrandPatchSchema`, `GalleryItemInputSchema`, `OnboardingPostSchema`, `ReportPeriodSchema` | Unifies `api/admin/brand`, `api/admin/onboarding`, `api/admin/reports`, `public-dto.ts`, `schema.ts` |
| `operations.ts` | `AdminOperationsPostSchema` (`discriminatedUnion('kind', ['calendar', 'cash', 'inventory', 'coupon', 'waitlist', 'workflow'])`) | **Fixes SEC-02 (HIGH):** eliminates unvalidated mass assignment in `POST /api/admin/operations/route.ts` |
| `team.ts` | `UpsertAdminUserSchema`, `UpsertStaffMemberSchema`, `AdminTeamPostSchema` (`discriminatedUnion('kind', ['admin_user', 'staff'])`), `DemoLoginSchema`, `SupabaseLoginSchema` | **Fixes SEC-02 (HIGH):** eliminates unvalidated mass assignment in `POST /api/admin/team/route.ts` + unifies `api/admin/session` |
| `index.ts` | Clean barrel re-exporting all contract schemas and `z.infer<>` types (zero side effects, tree-shakeable) | Consumed by API routes, `src/lib/repositories/schema.ts`, `src/lib/public-dto.ts`, and Wave 2 UI forms |

---

## 9. Before vs After Tracking Structure (Waves 2–6)

> *Every subsequent Wave updates the corresponding column below with real measured values from `npm run verify` and Chromium CDP production runs on `:1718`.*

### 9.1 Core Web Vitals & Production Payload Scorecard (Cold Load, SW-Bypassed)

| Route & Viewport | Metric | Wave 1 Baseline (`1e40a12`) | Wave 3 (CSS/Media) | Wave 4 (Bundle/Perf) | Wave 6 Final | Delta vs Baseline |
|---|---|---:|---:|---:|---:|---:|
| `/` (1440×900) | Total Transfer / Img / CSS / JS (KB) | 1,149.8 / 643.3 / 64.5 / 328.6 | _TBD_ | _TBD_ | _TBD_ | _TBD_ |
| `/` (1440×900) | LCP (ms) / CLS / INP (ms) | 184 / 0.0423 / 32 | _TBD_ | _TBD_ | _TBD_ | _TBD_ |
| `/` (390×844) | Total Transfer / Img / CSS / JS (KB) | 1,191.1 / 647.8 / 64.5 / 346.6 | _TBD_ | _TBD_ | _TBD_ | _TBD_ |
| `/reservar` (1440×900) | Total Transfer / Img / CSS / JS (KB) | 1,130.0 / 412.8 / 64.5 / 547.5 | _TBD_ | _TBD_ | _TBD_ | _TBD_ |
| `/reservar/rubber` (1440×900) | Total Transfer / Img / CSS / JS (KB) | 1,138.8 / 412.8 / 64.5 / 553.2 | _TBD_ | _TBD_ | _TBD_ | _TBD_ |
| `/links` (390×844) | Total Transfer / Img / CSS (KB) | 725.5 / 240.4 / 64.5 | _TBD_ | _TBD_ | _TBD_ | _TBD_ |
| `/admin/login` (1440×900) | CSS / JS / Total (KB) | 71.1 / 455.1 / 616.4 | _TBD_ | _TBD_ | _TBD_ | _TBD_ |

### 9.2 Architecture, CSS, Media & Quality Scorecard

| Dimension | Metric | Wave 1 Baseline | Target (End of Wave 6) | Wave 2 | Wave 3 | Wave 4 | Wave 5 | Wave 6 Final |
|---|---|---:|---:|---:|---:|---:|---:|---:|
| **Monoliths** | UI/API prod files `> 400` LOC (excl. DB repos/seed/types/qr) | 38 files (50 total) | `0` target UI/API monoliths `> 400` LOC | _TBD_ | _TBD_ | _TBD_ | _TBD_ | _TBD_ |
| **Atomic UI** | Components in `src/components/ui/` | 0 (6 partial in `AdminConfigPrimitives`) | 10 Astryx-native modules + `useCopyToClipboard` | _TBD_ | _TBD_ | _TBD_ | _TBD_ | _TBD_ |
| **Contracts** | Unvalidated admin POST routes (`team`, `operations`) | 2 unvalidated | 0 unvalidated (`src/lib/contracts/` pure domain) | _TBD_ | _TBD_ | _TBD_ | _TBD_ | _TBD_ |
| **CSS** | `globals.css` / `admin.css` raw KB (dead selectors) | 62.1 / 45.2 KB (9 dead) | Route-scoped `globals.css <= 20 KB` (0 dead) | _TBD_ | _TBD_ | _TBD_ | _TBD_ | _TBD_ |
| **Media** | `public/` total MB (orphaned MB) | 15.82 MB (12.89 MB orphaned) | `<= 1.8 MB` (0 MB orphaned) | _TBD_ | _TBD_ | _TBD_ | _TBD_ | _TBD_ |
| **Bundle** | `next/dynamic` boundaries / `React.memo` usages | 11 / 0 | `>= 22` / `>= 5` hot components | _TBD_ | _TBD_ | _TBD_ | _TBD_ | _TBD_ |
| **A11y** | High contrast defects / Mobile `<44px` targets (`/` & `/admin/reportes`) | 1 HIGH / 22 & 5 (`20px` seg) | 0 HIGH / `0` primary CTA/control `<44px` | _TBD_ | _TBD_ | _TBD_ | _TBD_ | _TBD_ |
| **SEO** | Routes with `og:image` + `twitter:image` + `metadataBase` / Private routes with `noindex` | 0% / 1 of 3 groups (`/mis-citas` only) | 100% public routes / 100% private routes (`/admin*`, `/cita/*`, `/mis-citas`) | _TBD_ | _TBD_ | _TBD_ | _TBD_ | _TBD_ |
| **Security** | Open HIGH / MEDIUM findings (`SEC-01`..`SEC-07`) | 4 HIGH, 3 MEDIUM | **0 HIGH, 0 MEDIUM** (verified by tests + guardrails) | _TBD_ | _TBD_ | _TBD_ | _TBD_ | _TBD_ |
| **Gatekeeper** | `npm run verify` errors / warnings | 0 / 0 | 0 / 0 | _TBD_ | _TBD_ | _TBD_ | _TBD_ | _TBD_ |

### 9.3 Security Remediation Checklist (Tracked Across Waves 2–6)
- [ ] **SEC-01 (HIGH):** Sanitize `POST /api/bookings` response (`toPublicStaffDTO`, `toPublicServiceDTO`, strip `internalNotes` & `client.notes`) + test.
- [ ] **SEC-02 (HIGH):** Add strict Zod contracts (`operations.ts`, `team.ts`) to `POST /api/admin/operations` and `POST /api/admin/team` + fix `401` vs `403` + test.
- [ ] **SEC-03 (HIGH):** Strip `ownerPinHash` & encrypted OAuth tokens from `/api/admin/overview` & `/api/admin/brand`; enforce specialist RBAC scoping in `/api/admin/overview` + test.
- [ ] **SEC-04 (HIGH):** Fix `getRequestIp()` header precedence (`cf-connecting-ip` first) + document/wire distributed store path for Workers + test.
- [ ] **SEC-05 (MEDIUM):** Scrub `booking.client.notes` in `GET`/`PATCH /api/bookings/manage/[token]` + test.
- [ ] **SEC-06 (MEDIUM):** Add rate limiting to `/api/admin/session`, Owner PIN endpoints, `/api/bookings/manage/[token]`, and `/api/availability` + test.
- [ ] **SEC-07 (MEDIUM):** Reject arbitrary external `http(s)://` URLs in public `persistBookingMediaField` calls + test.
- [ ] **SEC-08 (LOW):** Tighten CSP `img-src` / `connect-src` origins in `next.config.ts`.
