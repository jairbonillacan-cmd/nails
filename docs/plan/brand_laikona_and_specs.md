# LAIKONA NAILS BY KARLA — Brand Identity, Salon Requirements & AgendaPro UX Spec

> Single source of truth for the real salon implementation in Phase 2 (`@laikona.nailsss`, Puebla, México). Complements [architecture_review.md](./architecture_review.md) and [super_mejoras.md](./super_mejoras.md).

---

## 1. Identidad visual de Laikona Nails by Karla

**Uñas a tu manera.** La dirección parte del rojo cereza de los esmaltes y del sello con dos cerezas. El logotipo serif lleva la firma «Nails by Karla». La marca se presenta como un estudio de manicure y nail art en Puebla, México. En redes usa [@laikona.nailsss](https://www.instagram.com/laikona.nailsss/) y acredita a [@lumiere.beautymx](https://www.instagram.com/lumiere.beautymx/) cuando corresponda.

De Valentina se retoma el contraste editorial entre granate y marfil. De Clawcrafter se retoma la continuidad de la paleta y los encuadres de manicure entre piezas impresas, redes y web. [Valentina Nails Salon, Álvaro Quijano](https://www.behance.net/gallery/199899457/Visual-Identity-Valentina-Nails-Salon-%28manicure%29) · [Nail studio, Anto Cividin](https://www.behance.net/gallery/181037825/Nail-studio-Branding)

| Color | Hex | Aplicación |
|---|---|---|
| Cereza laca | `#8B1E2B` | Acento principal, botón de agenda y sello |
| Rosa leche | `#F7E9E7` | Portada y superficies suaves en modo claro |
| Alabastro | `#FAF7F5` | Fondo claro y logotipo en negativo |
| Porcelana | `#FFFFFF` | Superficies del sitio y texto del botón sobre Cereza laca |
| Rosa cereza | `#E57A89` | Acento en modo oscuro |
| Obsidiana | `#121011` | Fondo oscuro, con superficies elevadas en `#191617` |

La tinta del logotipo en modo claro es `#341722`. El contraste es 9.06:1 entre Cereza laca y Porcelana, 7.66:1 entre Cereza laca y Rosa leche y 6.56:1 entre Rosa cereza y el texto oscuro `#141414` del botón. En la web, Astryx aplica los tokens de `themes/nails` a la portada y a la agenda.

**Tipografía.** Source Serif 4 en titulares y DM Sans en texto, navegación y formularios. Ambas familias se sirven con Fontsource. El logotipo vectorial tiene las letras trazadas para mantener su forma al abrirlo sin las fuentes web.

**Aplicaciones.** Para el avatar de Instagram, usa el sello sobre Cereza laca con aire suficiente para el recorte circular. En portadas de agenda y publicaciones, combina un titular serif corto con un acercamiento a las uñas. Para mostrar trabajo del estudio, usa fotografías de sets realizados y luz lateral que deje ver el acabado. La imagen de campaña de la web es una pieza conceptual creada con ImageGen a partir de un manicure rojo cereza, un detalle de nail art y una composición con satén marfil y laca granate.

- [Lámina de identidad](../brand/laikona-identidad.png)
- [Logotipo vectorial](../../public/brand/laikona-wordmark.svg)
- [Sello vectorial](../../public/brand/laikona-avatar.svg) y [avatar PNG de 1080 × 1080](../brand/laikona-avatar.png)
- [Fotografía editorial WebP](../../public/brand/laikona-cherry-editorial.webp)

<details>
<summary>Prompt de la fotografía editorial en ImageGen</summary>

Photorealistic editorial beauty campaign photograph for the website of Puebla nail studio Laikona Nails by Karla. Squarish landscape crop, roughly 6:5. One anatomically natural feminine hand with warm medium-brown skin, naturally separated relaxed fingers, emerging from a slightly gathered butter-ivory satin cuff, resting diagonally on a wine-red lacquered tabletop. Magazine close-up, all visible nails glossy short-to-medium almond shape in rich black cherry red, one translucent rose accent nail with tiny painted double cherries, realistic cuticles and skin texture. A pair of actual dark red cherries near the lower edge, well away from fingers. Background fills frame in muted oxblood and bordeaux, tactile and almost monochrome, with hard directional window light and soft shadows, gentle 35mm grain, restrained beauty editorial. Keep manicure centered, crop-safe and sharply readable in a square crop. No jewelry, no face, no text, no logo, no border, no watermark.

</details>

---

## 2. Specialists & Fixed Shift Schedules (Karla's WhatsApp Requirements)

The availability engine (`src/lib/availability/engine.ts`) supports BOTH fixed start-time rules (`AvailabilityRule.fixedStartTimes?: string[]`) and legacy continuous windows (`startTime..endTime` + `slotIntervalMinutes`).

| Specialist | Booking Slug | Role | Working Days | Fixed Start Times (Local `America/Mexico_City`) | Window |
|---|---|---|---|---|---|
| **Karla** | `karla` | Owner / Master Nail Artist | Mon–Sat (`1..6`) | `10:00`, `13:30`, `16:30` | `10:00` – `19:30` |
| **Paty** | `paty` | Senior Nail Artist (Admin) | Mon–Sat (`1..6`) | `10:00`, `13:30`, `16:30` | `10:00` – `19:30` |
| **Tere** | `tere` | Nail Artist (Specialist) | Mon–Sat (`1..6`) | `14:00`, `16:00`, `18:00` | `14:00` – `20:30` |

- All 3 specialists are eligible for all 9 real catalog services.
- Demo admin login emails (`duena@nails.studio` → Karla `owner`, `recepcion@nails.studio` → Paty `admin`, `camila@nails.studio` → Tere `specialist`) remain preserved for QA and automated security tests.
- Every fixed-slot candidate still enforces date overrides, booking/hold/Google Calendar overlaps, minimum notice window, `maxBookingDaysAhead`, and multi-service combined duration.

---

## 3. Real Service Catalog (9 Services + Starting Price Support)

Services with `isStartingPrice: true` render as **`Desde $XXX MXN`** across the landing page, public booking widget, and summary panels. Clients can combine a primary service with additional services (`extraServiceIds?: string[]`) plus optional add-ons/extras; combined duration and subtotal are computed deterministically by the availability engine.

| # | Slug | Name | Category | Price (MXN) | Starting Price (`Desde`) | Duration | Deposit (MXN) |
|---|---|---|---|---:|:---:|---:|---:|
| 1 | `rubber` | Rubber | Uñas & Esculturales | `$350` (`35000`) | Yes | 120 min | `$200` (`20000`) |
| 2 | `unas-acrilicas` | Uñas acrílicas | Uñas & Esculturales | `$450` (`45000`) | Yes | 150 min | `$200` (`20000`) |
| 3 | `unas-softgel` | Uñas Softgel | Uñas & Esculturales | `$450` (`45000`) | Yes | 120 min | `$200` (`20000`) |
| 4 | `retoque` | Retoque | Uñas & Esculturales | `$340` (`34000`) | Yes | 120 min | `$200` (`20000`) |
| 5 | `gel-semipermanente-manos` | Gel Semipermanente manos | Gel & Retiro | `$150` (`15000`) | Yes | 60 min | `$200` (`20000`) |
| 6 | `retiro` | Retiro | Gel & Retiro | `$80` (`8000`) | Yes | 30 min | `$200` (`20000`) |
| 7 | `pedispa-gel` | PediSpa + Gel | Pies & PediSpa | `$500` (`50000`) | No | 90 min | `$200` (`20000`) |
| 8 | `pedispa-acripie` | PediSpa + Acripie | Pies & PediSpa | `$550` (`55000`) | No | 105 min | `$200` (`20000`) |
| 9 | `gel-pies-en-seco` | Gel Pies en seco | Pies & PediSpa | `$250` (`25000`) | No | 60 min | `$200` (`20000`) |

- Existing 5 optional add-ons/extras and coupons (`BIENVENIDA10`, `GIFT500`) remain active and synced between `src/lib/demo-seed.ts` and `supabase/seed.sql` (verified mechanically by `scripts/check-seed-parity.mjs`).

---

## 4. `$200 MXN` Deposit Flow, Client `@instagram` & Proposal Options A / B

### Transfer Details (`SalonSettings` & `PublicSettingsDTO`)
- **Required Deposit:** `$200 MXN` (`depositAmountCents: 20000`)
- **Institution:** `Mercado Pago`
- **Beneficiary:** `Karla Patricia Carrillo Rodríguez`
- **CLABE:** `7229 6901 3959 779869` (with 1-click copy in the public booking flow)
- **Client Identification:** Booking form captures client `@instagram` (`clientInstagram`, persisted on both `bookings.client_instagram` and `clients.instagram_handle`) so Karla can reconcile DM receipts immediately.
- **Dual Proof Delivery (`proofDeliveryMethod`):**
  1. `web_upload`: Client uploads transfer screenshot/receipt directly during booking (validated via magic bytes + stored via `src/lib/storage/media.ts`, never raw base64 in DB).
  2. `instagram_dm`: Client reserves with `pending_confirmation` status and opens a direct DM button to `@laikona.nailsss` to send her receipt along with booking code + `@instagram`.
  3. `none`: Manual/walk-in bookings or waived deposit cases.

### Deposit Verification Proposal (Options A & B)

| Option | Flow | Operational Effort | Recommended Phase |
|---|---|---|---|
| **Option A (Live Now — Manual SPEI + Dual Proof)** | Client copies Mercado Pago CLABE (`7229 6901 3959 779869`), sends `$200 MXN`, and either uploads receipt on the web or sends it via IG DM to `@laikona.nailsss`. Booking enters `pending_confirmation` and surfaces in Admin **Anticipos pendientes** (`GET /api/admin/overview` → `pendingDeposits`) for 1-click confirmation by Karla/Paty. Zero payment gateway fees. | Low (1-click approve in Admin) | **Phase 2 (Active default)** |
| **Option B (Automated — Mercado Pago Checkout / Payment Link + Webhook)** | Booking redirects to a Mercado Pago `$200 MXN` checkout link (SPEI / card / OXXO) with `external_reference = bookingCode`. Idempotent webhook verifies `MERCADOPAGO_WEBHOOK_SECRET`, transitions `pending_payment → confirmed` via `transitionBookingStatus`, and records cash deposit automatically. Standard Mercado Pago processing fee applies. | Zero manual verification | **Phase 3 (Integrations)** |

---

## 5. AgendaPro-Inspired Admin Onboarding & Operations UX Checklist

- **Route Protection (`src/proxy.ts` — F3):** Next.js 16 `proxy()` guards `/admin` and `/admin/:path*` (excluding `/admin/login`), redirecting unauthenticated requests to `/admin/login` before render.
- **Guided Onboarding Wizard (`GET`/`POST /api/admin/onboarding`, owner-only):**
  - Captures `businessType` (default `Salón de Manicure y Uñas`), `teamSizeTier` (`3 a 5`), `salonName`, `serviceMode` (`studio` | `home` | `online`), `address`, `soundAlertsEnabled`, optional starter service, and marks `onboardingCompleted`.
  - Dashboard surfaces a 6-step `onboardingChecklist` (`completedCount/6`) until setup is complete.
- **Schedule & Multi-Service Operations:**
  - Per-specialist fixed slot editor (`PUT /api/admin/availability` with `fixedStartTimes?: string[]`).
  - Manual/walk-in booking creation (`POST /api/admin/bookings`) supporting `extraServiceIds`, `clientInstagram`, `customDurationMinutes`, `customPriceCents`, `internalNotes`, and notification toggles.
  - **1-Click Manual Reminder (`PATCH /api/admin/bookings`, `action: 'send_reminder'`):** Enforces specialist RBAC, dispatches via `notifications.ts`, logs inside `withWriteLock`, and returns a prefilled `waMeUrl` for instant WhatsApp follow-up.
- **CRM, Pending Deposits & Retention:**
  - Manual client creation (`POST /api/admin/clients`) and `@instagram` profile editing (`PATCH /api/admin/clients`).
  - Admin overview includes `pendingDeposits` queue (with `proofDeliveryMethod` and `clientInstagram`) and `retention` metrics (`returningClientsCount`, `inactiveClients` 30+ days without visit).
- **Modular Frontend & Mobile Navigation (Phase 2 Wave 2):**
  - Split `BookingWidget` into focused modules (`booking/` subcomponents + state reducer) targeting `< 400` lines per file.
  - Responsive mobile admin navigation bar + quick action triggers for Karla & Paty on phone screens.
