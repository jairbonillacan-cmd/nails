# ADR-0001: Repositorio dual, consultas puntuales y presupuesto de subrequests en Cloudflare Workers

- **Estado:** Aceptado
- **Fecha:** 2026-11-27
- **Área:** Persistencia, Infraestructura y Runtime Serverless

## Contexto

LAIKONA NAILS opera en dos modos de ejecución bien diferenciados:

1. **Desarrollo local, demos y pruebas automatizadas sin infraestructura externa:** debe arrancar de inmediato con `npm run dev` y ejecutar cientos de pruebas deterministas sin depender de credenciales de Supabase ni de red externa.
2. **Producción en Cloudflare Workers (`@opennextjs/cloudflare` + `worker.ts`) conectado a Supabase PostgreSQL:** el plan **Cloudflare Workers Free** impone un techo estricto de **50 subrequests externos por invocación** (y tiempo acotado de CPU/latencia).

En las primeras iteraciones, varias mutaciones y páginas del servidor llamaban a `getSnapshot()` en `src/lib/repositories/supabase-repo.ts`, cargando decenas de tablas en paralelo (más de 20 consultas PostgREST por llamada) y bloqueando la respuesta HTTP mientras esperaban efectos secundarios externos (Google Calendar OAuth, Resend, WhatsApp Cloud API). Bajo Workers, esa combinación agotaba el presupuesto de subrequests o colgaba las confirmaciones y mutaciones de citas cuando una integración externa respondía lento.

## Decisión

1. **Puerto de repositorio dual detrás de una única interfaz (`SalonRepository`):**
   - Definir el contrato único en `src/lib/repositories/port.ts` junto con las excepciones de dominio `SlotConflictError` y `PolicyError`.
   - Resolver dinámicamente la implementación mediante `getRepository()` (`src/lib/repositories/db.ts`) según `isSupabaseEnabled()` (`src/lib/repositories/supabase-client.ts`):
     - **Modo Demo local:** persistencia en `.nails-demo-db.json` sembrada desde `src/lib/demo-seed.ts`, validada con `src/lib/repositories/schema.ts` y serializada con `withWriteLock` para evitar escrituras concurrentes corruptas.
     - **Modo Producción:** implementación en `src/lib/repositories/supabase-repo.ts` sobre Supabase PostgreSQL (`supabase/migrations/0001_initial_schema.sql` a `supabase/migrations/0011_whatsapp_templates_extra.sql`) con `service_role` exclusivamente en servidor.

2. **Eliminación de `getSnapshot()` en rutas calientes y mutaciones a favor de consultas puntuales:**
   - Reemplazar las lecturas completas de base de datos en flujos críticos (`/cita/[token]`, creación/confirmación/cancelación/reagendado de citas, eliminación y edición de cupones, edición de movimientos manuales de caja, paquetes, staff, medios privados, reportes ejecutivos y agenda por rango de fechas) por consultas acotadas únicamente a las tablas necesarias:
     - **`GET /api/admin/reports` → `getExecutiveReportData(options)`:** reemplaza `getSnapshot()` (36 tablas) por `<= 10` consultas PostgREST en paralelo (`salon_settings`, `services`, `staff_members`, `availability_schedules`, `availability_rules`, `bookings`, `booking_reviews`, `payment_splits`, `cash_register_entries`, y `funnel_events` solo en alcance estudio; `<= 9` para `specialist`, `1` para especialista sin vincular), sin consultar `audit_logs`, `whatsapp_messages`, `inventory_items`, `waitlist_entries`, `gallery_items` ni `clients`.
     - **`GET /api/admin/bookings?from&to&staff` → `getAdminBookingsRange(filter)` y `getBookingsWithRelations(filter)`:** eliminan `getSnapshot()` en `supabase-repo.ts` mediante consultas puntuales con ventana UTC amortiguada (±1 día) más filtrado exacto por `dateKey` en zona horaria del salón (`<= 6` consultas en `getBookingsWithRelations`, `<= 7` en `getAdminBookingsRange`, y `<= 4` cuando no hay citas en el rango) junto con bloqueo estricto de `staff_id` para rol `specialist`.
   - Sostener un presupuesto explícito de subrequests verificado por pruebas en `src/lib/repositories/supabase-repo.test.ts`, `src/app/api/admin/reports/route.test.ts` y `src/app/api/admin/bookings/route.test.ts` para asegurar margen holgado bajo el límite de 50 subrequests de Cloudflare Workers Free.

3. **Despacho no bloqueante de efectos secundarios post-commit con `ctx.waitUntil`:**
   - Centralizar el envío de efectos secundarios (sincronización con Google Calendar, notificaciones inmediatas por correo/WhatsApp y eventos Realtime) a través de `dispatchOutboxEvent` (`src/lib/use-cases/outbox.ts`) y envolver su ejecución en `runPostCommitSideEffects` (`src/lib/repositories/supabase-repo.ts`).
   - En Cloudflare Workers, `tryRegisterWorkerWaitUntil` obtiene el contexto mediante `getCloudflareContext()` de `@opennextjs/cloudflare` y registra la promesa en `ctx.waitUntil(promise)`, aplicando un techo de espera acotado (`POST_COMMIT_SIDE_EFFECT_MAX_WAIT_MS = 2500` ms vía `Promise.race`) antes de devolver la respuesta HTTP al cliente. Fuera de Workers (Node local / pruebas), la promesa se espera directamente para mantener determinismo.
   - En `worker.ts`, el envoltorio del bundle `.open-next/worker.js` implementa `scheduled(controller, env, ctx)` con `ctx.waitUntil` para despachar internamente los crons `*/15 * * * *` (`POST /api/cron/reminders`) y `0 9 * * *` (`POST /api/cron/retention`) sin saltos de red externos, adjuntando `Authorization: Bearer ${env.CRON_SECRET}`.

## Alternativas consideradas

- **Usar únicamente Supabase (incluso en desarrollo y CI):** descartado porque frena el desarrollo local, introduce dependencia de red y secretos en CI, y encarece las pruebas de concurrencia/propiedades con `fast-check`.
- **Mantener `getSnapshot()` en el repositorio de Supabase con caché en memoria por isolate:** descartado porque en Workers los isolates son efímeros y sin estado compartido; un `cold start` o mutación concurrente volvería a disparar >20 subrequests y provocaría lecturas obsoletas entre isolates.
- **Esperar síncronamente todas las llamadas a Resend, WhatsApp y Google Calendar antes de responder HTTP:** descartado porque provocó bloqueos ("hangs") perceptibles en confirmaciones de citas y aumentó el riesgo de timeouts cuando un proveedor externo tarda en responder.
- **Introducir una cola dedicada externa (Cloudflare Queues / Redis) desde el día 1:** pospuesto porque añade costo operativo y configuración innecesaria para un salón boutique; la tabla `outbox_events` + `ctx.waitUntil` + cron cada 15 min ofrece resiliencia suficiente sin servicios adicionales.

## Consecuencias y trade-offs

- **Positivas:**
  - Las mutaciones críticas en producción responden rápido y dentro del límite de 50 subrequests de Workers Free, incluso cuando un proveedor externo (Resend/Google/Meta) presenta latencia.
  - Desarrollo local y 100% de la suite Vitest + E2E corren offline con paridad de semilla verificada (`scripts/check-seed-parity.mjs`).
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
- `src/app/api/admin/reports/route.ts`
- `src/app/api/admin/reports/route.test.ts`
- `src/app/api/admin/bookings/route.ts`
- `src/app/api/admin/bookings/route.test.ts`
- `src/lib/repositories/schema.ts`
- `src/lib/demo-seed.ts`
- `src/lib/use-cases/outbox.ts`
- `worker.ts`
- `wrangler.jsonc`
- `docs/deploy-cloudflare-supabase.md`
