# ADR-0001: Repositorio dual, consultas puntuales y presupuesto de subrequests en Cloudflare Workers

- **Estado:** Aceptado
- **Fecha:** 2026-11-28
- **Área:** Persistencia, Infraestructura y Runtime Serverless

## Contexto

LAIKONA NAILS opera en dos modos de ejecución bien diferenciados:

1. **Desarrollo local, demos y pruebas automatizadas sin infraestructura externa:** debe arrancar de inmediato con `npm run dev` y ejecutar cientos de pruebas deterministas sin depender de credenciales de Supabase ni de red externa.
2. **Producción en Cloudflare Workers (`@opennextjs/cloudflare` + `worker.ts`) conectado a Supabase PostgreSQL:** el plan **Cloudflare Workers Free** impone un techo estricto de **50 subrequests externos por invocación** (y tiempo acotado de CPU/latencia).

En las primeras iteraciones, varias mutaciones, páginas del servidor y rutas `/api/admin/**` llamaban a `getSnapshot()` en `src/lib/repositories/supabase-repo.ts`, cargando 38 tablas en paralelo por invocación (e incluso 76–114 consultas cuando un endpoint encadenaba 2 o 3 llamadas) y bloqueando la respuesta HTTP mientras esperaban efectos secundarios externos (Google Calendar OAuth, Resend, WhatsApp Cloud API). Bajo Workers, esa combinación agotaba el presupuesto de 50 subrequests o colgaba las confirmaciones y mutaciones cuando una integración externa respondía lento.

## Decisión

1. **Puerto de repositorio dual detrás de una única interfaz (`SalonRepository`):**
   - Definir el contrato único en `src/lib/repositories/port.ts` junto con las excepciones de dominio `SlotConflictError` y `PolicyError`.
   - Resolver dinámicamente la implementación mediante `getRepository()` (`src/lib/repositories/db.ts`) según `isSupabaseEnabled()` (`src/lib/repositories/supabase-client.ts`):
     - **Modo Demo local:** persistencia en `.nails-demo-db.json` sembrada desde `src/lib/demo-seed.ts`, validada con `src/lib/repositories/schema.ts` y serializada con `withWriteLock` para evitar escrituras concurrentes corruptas.
     - **Modo Producción:** implementación en `src/lib/repositories/supabase-repo.ts` sobre Supabase PostgreSQL (`supabase/migrations/0001_initial_schema.sql` a `supabase/migrations/0011_whatsapp_templates_extra.sql`) con `service_role` exclusivamente en servidor.

2. **Eliminación total de `getSnapshot()` en `src/app/**` y `src/lib/admin/**` (0 llamadas en producción):**
   - Reemplazar el 100 % de las lecturas completas de base de datos en páginas SSR, APIs públicas, portal de clientas, crons, webhooks, OAuth Google y **todas** las 24 rutas `/api/admin/**` por consultas puntuales acotadas únicamente a las tablas necesarias:
     - **Páginas públicas `/`, `/reservar`, `/reservar/[slug]`, `/reservar/[slug]/opengraph-image`, `/links`, `/sitemap.xml` y `GET /api/public/bootstrap`:** `getCachedPublicBootstrap()` y `getCachedPublicServiceBySlug()` (`src/lib/public/bootstrap.ts`) con `React.cache()`, `<= 8` consultas PostgREST paralelas sobre catálogo público sin escanear `clients`, `bookings`, `audit_logs` ni `waitlist_entries`. La portada `/` suma `getPublicReviewsForService(null)` (`<= 11` consultas), `/reservar/[slug]` añade `getPublicServiceBySlug(slug)` (`<= 1`) y `getPublicReviewsForService(serviceId)` (`<= 3`), y `readSignedInClientProfile()` (`src/lib/auth/client-portal-profile.ts`) usa `getClientPortalRecordByPhone()` (`0` sin sesión, `<= 2` autenticada).
     - **Gestión de cita y disponibilidad pública (`/api/bookings/manage/[token]`, `/ics`, `/api/availability?mode=quick_search`):** `GET`/`PATCH /api/bookings/manage/[token]` y `/ics` usan `getSalonSettings()` + `getServicesByIdsAsync()` (`<= 18` en `PATCH`, `<= 11` en `GET`, `<= 7` en `/ics`); `quick_search` delega en `quickSearchAvailability()` sobre `loadPublicAvailabilityContext()` (`<= 13` consultas).
     - **Portal de clientas (`/mis-citas`, `POST /api/client-portal/otp`, `GET|PATCH /api/client-portal/profile`, `GET /api/client-portal/bookings`):** `getClientPortalRecordByPhone()` (`<= 2`), `upsertClientPortalProfileByPhone()` (`<= 3`) y `getClientPortalSnapshotByPhone()` (`1` si no registrada, `<= 8` con historial).
     - **Crons y Webhooks (`/api/cron/reminders`, `/api/cron/retention`, `/api/webhooks/mercadopago`, `/api/webhooks/whatsapp`, `/api/webhooks/google-calendar`, `/api/integrations/google/**`):** `getNotificationWorkflows()` (`1`), `processDueScheduledNotifications()` (`1` inactivo, `<= 10` activo), `fetchSupabaseOverdueWaitlistContext()` (`1`), `fetchSupabaseTouchUpContext()` (`<= 2`), `findApprovedBookingPayment()` (`1`), `getWhatsAppContactContextByPhones()` (`0` en estatus, `<= 2` en mensajes), `getCalendarConnectionByWatchChannelId()` (`1`) y `staffMemberExists()` (`1`). Un ciclo normal de `POST /api/cron/reminders` pasa de `~152+` a `~7–8` subrequests inactivo y `~20–28` activo.
     - **Resumen general y SSR `/admin/**` (`src/lib/admin/overview-loader.ts` + `GET /api/admin/overview` → `getAdminOverviewData()`):** elimina `getSnapshot()` (38) + lecturas duplicadas de WhatsApp (`+4`) mediante una única carga dirigida por rol: `<= 31` consultas para `owner`, `<= 30` para `admin` (omite `audit_logs`) y `<= 22` para `specialist` (`<= 7` sin profesional vinculada) con filtrado SQL por `staff_id`, eliminando 7 tablas no renderizadas (`slot_holds`, `funnel_events`, `booking_payments`, `media_assets`, `consents`, `coupon_redemptions`, `whatsapp_messages`) y garantizando que el PII de otras profesionales jamás entre a memoria del Worker.
     - **Reportes y Agenda Admin (`GET /api/admin/reports` → `getExecutiveReportData()`, `GET /api/admin/bookings?from&to&staff` → `getAdminBookingsRange()`):** `<= 10` consultas (`<= 9` especialista) para reportes y `<= 7` (`<= 4` rango vacío) para agenda por rango con bloqueo estricto de `staff_id`.
     - **Módulos operativos y mensajería Admin:**
       - `GET /api/admin/packages`: cortocircuito en Supabase (`0` subrequests vs `76–114` previos) + `listStaffClientIds()` (`1` consulta cuando existen paquetes).
       - `GET|POST /api/admin/campaigns`: `getCampaignAudienceData()` (`4` consultas en `GET` vs `76` previos) y `getClientById()` + `getSalonSettings()` (`2` consultas en `POST` vs `38` previos) + cortocircuito en `listCampaignDispatches()`.
       - `GET|POST /api/admin/whatsapp/reminders`: `getWhatsAppRemindersSnapshot()` (`7` consultas en `GET` vs `~51` previos, eliminando `getSnapshot()` y la doble invocación de `listScheduledNotifications()`); `run_due_now` usa `getNotificationWorkflows()` (`1` consulta previa); `trigger_now` y `send_test_reminder` usan `getSalonSettings()` + `getNotificationWorkflows()` + `getBookingById()` (`2–8` consultas).
       - `GET|POST /api/admin/availability`: `listRecurringBlocks()` (`1` consulta en `?mode=blocks`), `diagnoseAvailability()` (`<= 13` consultas en `?mode=diagnose`), `preloadMexicoHolidays` (`getSalonSettings()` + `listStaffOverrideDates()`, `2` + altas), `toggleRecurringBlock()` (`1` `UPDATE`).
       - `GET /api/admin/operations?export=csv`: `getSalonSettings()` + `listCashEntries()` (`2` consultas).
       - `GET /api/admin/onboarding`: `getSalonSettings()` + `listActiveServices(5)` (`2` consultas).
       - `GET|POST /api/admin/integrations/whatsapp`: `getSalonSettings()` (`1` consulta).
       - `POST /api/admin/whatsapp/send`: `getClientById()` (`1` consulta).
       - `POST /api/admin/whatsapp/simulate` y `/api/admin/integrations/whatsapp-simulate`: `listActiveServices()` (`<= 1` consulta).
       - `GET|POST /api/admin/session`: `listActiveAdminUsers()` (`0` en Supabase, `1` en demo).
   - Sostener el invariante mecánico de **0 llamadas a `getSnapshot(` en todo `src/app/**` y `src/lib/admin/**`** mediante escaneo recursivo en `src/app/route-states.test.ts` y presupuestos explícitos de subrequests en `src/lib/repositories/supabase-repo.test.ts`, `src/app/api/admin/reports/route.test.ts` y `src/app/api/admin/bookings/route.test.ts`.
   - Aplicar `ADMIN_PRIVATE_HEADERS` (`Cache-Control: private, no-store`, `Vary: Cookie` en `src/lib/http/admin-headers.ts` + regla `/api/admin/:path*` en `next.config.ts`) en el 100 % de las rutas `/api/admin/**`, protegido mecánicamente por el guardrail `admin-api-no-store` en `scripts/check-guardrails.mjs`, junto con `Cache-Control: no-store` en `GET /api/public/bootstrap`.

3. **Despacho no bloqueante de efectos secundarios post-commit con `ctx.waitUntil`:**
   - Centralizar el envío de efectos secundarios (sincronización con Google Calendar, notificaciones inmediatas por correo/WhatsApp y eventos Realtime) a través de `dispatchOutboxEvent` (`src/lib/use-cases/outbox.ts`) y envolver su ejecución en `runPostCommitSideEffects` (`src/lib/repositories/supabase-repo.ts`).
   - En Cloudflare Workers, `tryRegisterWorkerWaitUntil` obtiene el contexto mediante `getCloudflareContext()` de `@opennextjs/cloudflare` y registra la promesa en `ctx.waitUntil(promise)`, aplicando un techo de espera acotado (`POST_COMMIT_SIDE_EFFECT_MAX_WAIT_MS = 2500` ms vía `Promise.race`) antes de devolver la respuesta HTTP al cliente. Fuera de Workers (Node local / pruebas), la promesa se espera directamente para mantener determinismo.
   - En `worker.ts`, el envoltorio del bundle `.open-next/worker.js` implementa `scheduled(controller, env, ctx)` con `ctx.waitUntil` para despachar internamente los crons `*/15 * * * *` (`POST /api/cron/reminders`) y `0 9 * * *` (`POST /api/cron/retention`) sin saltos de red externos, adjuntando `Authorization: Bearer ${env.CRON_SECRET}`.

## Alternativas consideradas

- **Usar únicamente Supabase (incluso en desarrollo y CI):** descartado porque frena el desarrollo local, introduce dependencia de red y secretos en CI, y encarece las pruebas de concurrencia/propiedades con `fast-check`.
- **Mantener `getSnapshot()` en el repositorio de Supabase con caché en memoria por isolate:** descartado porque en Workers los isolates son efímeros y sin estado compartido; un `cold start` o mutación concurrente volvería a disparar 38 subrequests y provocaría lecturas obsoletas entre isolates.
- **Esperar síncronamente todas las llamadas a Resend, WhatsApp y Google Calendar antes de responder HTTP:** descartado porque provocó bloqueos ("hangs") perceptibles en confirmaciones de citas y aumentó el riesgo de timeouts cuando un proveedor externo tarda en responder.
- **Introducir una cola dedicada externa (Cloudflare Queues / Redis) desde el día 1:** pospuesto porque añade costo operativo y configuración innecesaria para un salón boutique; la tabla `outbox_events` + `ctx.waitUntil` + cron cada 15 min ofrece resiliencia suficiente sin servicios adicionales.

## Consecuencias y trade-offs

- **Positivas:**
  - Todas las rutas públicas, de portal, crons, webhooks y las 24 APIs administrativas operan holgadamente por debajo del límite de 50 subrequests de Cloudflare Workers Free (0 llamadas a `getSnapshot()` en `src/app/**` y `src/lib/admin/**`).
  - El rol `specialist` filtra sus datos directamente en SQL (`staff_id`) sin cargar PII de otras profesionales en memoria del Worker.
  - Desarrollo local y 100 % de la suite Vitest + E2E corren offline con paridad de semilla verificada (`scripts/check-seed-parity.mjs`).
  - Los cron jobs de recordatorios y retención corren de forma nativa en `worker.ts` y mantienen activo Supabase Free.
- **Trade-offs y riesgos asumidos:**
  - **Paridad dual obligatoria:** cada nueva operación del repositorio debe implementarse y probarse tanto en `db.ts` como en `supabase-repo.ts`. Se mitiga con contratos compartidos (`src/lib/repositories/port.ts`) y suites dedicadas (`db.test.ts` + `supabase-repo.test.ts`).
  - **Consistencia eventual de efectos secundarios:** si una notificación o sincronización con Google Calendar falla después del commit en DB, la cita ya quedó confirmada; el error se registra en `logError('booking_post_commit_side_effects_failed', ...)` y `outbox_events` / cron permite auditoría y recuperación.
  - **Límite de CPU en Workers Free (10 ms):** SSR de Next.js 16 puede acercarse al techo en picos; la guía `docs/deploy-cloudflare-supabase.md` documenta cuándo escalar a Workers Paid ($5 USD/mes).

## Evidencia y archivos clave

- `src/lib/repositories/port.ts`
- `src/lib/repositories/db.ts`
- `src/lib/repositories/supabase-client.ts`
- `src/lib/repositories/supabase-repo.ts`
- `src/lib/repositories/supabase-repo.test.ts`
- `src/lib/http/admin-headers.ts`
- `src/lib/admin/overview-loader.ts`
- `src/lib/public/bootstrap.ts`
- `src/lib/auth/client-portal-profile.ts`
- `next.config.ts`
- `scripts/check-guardrails.mjs`
- `scripts/check-guardrails.test.mjs`
- `src/app/page.tsx`
- `src/app/mis-citas/page.tsx`
- `src/app/reservar/page.tsx`
- `src/app/reservar/[slug]/page.tsx`
- `src/app/reservar/[slug]/opengraph-image.tsx`
- `src/app/links/page.tsx`
- `src/app/sitemap.ts`
- `src/app/api/public/bootstrap/route.ts`
- `src/app/api/availability/route.ts`
- `src/app/api/bookings/manage/[token]/route.ts`
- `src/app/api/bookings/manage/[token]/ics/route.ts`
- `src/app/api/client-portal/otp/route.ts`
- `src/app/api/client-portal/profile/route.ts`
- `src/app/api/client-portal/bookings/route.ts`
- `src/app/api/cron/reminders/route.ts`
- `src/app/api/cron/retention/route.ts`
- `src/app/api/webhooks/mercadopago/route.ts`
- `src/app/api/webhooks/whatsapp/route.ts`
- `src/app/api/webhooks/google-calendar/route.ts`
- `src/app/api/integrations/google/route.ts`
- `src/app/api/integrations/google/callback/route.ts`
- `src/app/api/admin/overview/route.ts`
- `src/app/api/admin/packages/route.ts`
- `src/app/api/admin/campaigns/route.ts`
- `src/app/api/admin/availability/route.ts`
- `src/app/api/admin/operations/route.ts`
- `src/app/api/admin/onboarding/route.ts`
- `src/app/api/admin/session/route.ts`
- `src/app/api/admin/integrations/whatsapp/route.ts`
- `src/app/api/admin/integrations/whatsapp-simulate/route.ts`
- `src/app/api/admin/whatsapp/reminders/route.ts`
- `src/app/api/admin/whatsapp/send/route.ts`
- `src/app/api/admin/whatsapp/simulate/route.ts`
- `src/app/api/admin/reports/route.ts`
- `src/app/api/admin/reports/route.test.ts`
- `src/app/api/admin/bookings/route.ts`
- `src/app/api/admin/bookings/route.test.ts`
- `src/lib/integrations/whatsapp-processor.ts`
- `src/lib/integrations/whatsapp-booking.ts`
- `src/app/route-states.test.ts`
- `src/app/api/security.test.ts`
- `src/lib/repositories/schema.ts`
- `src/lib/demo-seed.ts`
- `src/lib/use-cases/outbox.ts`
- `worker.ts`
- `wrangler.jsonc`
- `docs/deploy-cloudflare-supabase.md`
