# Prompt de Migración a Producción — Laikona Nails

Copia y pega el siguiente bloque en una sesión de agente (recomendado iniciar con `/plan` o `/goal`) para ejecutar la migración completa del repositorio `/Users/jairbonilla/Desktop/nails` al stack de producción acordado.

---

```markdown
Migra y prepara el proyecto **Laikona Nails** (`/Users/jairbonilla/Desktop/nails`) a producción sobre la arquitectura acordada de costo mínimo y uso 100% comercial, conservando el Modo Demo Local intacto para desarrollo y pruebas.

### Stack objetivo de producción
1. **Hosting, Edge, DNS y Cron — Cloudflare Workers (`@opennextjs/cloudflare` + `wrangler`)**
   - Configurar `@opennextjs/cloudflare`, `open-next.config.ts` y `wrangler.jsonc` (`nodejs_compat`, dominio propio en Cloudflare DNS con SSL Full Strict).
   - Verificar compatibilidad total de todas las rutas API/SSR en Workers (eliminar dependencias incompatibles con el runtime de Workers y probar el presupuesto de CPU para validar si corre en Workers Free 10 ms o requiere Workers Paid $5 USD/mes).
   - Mantener `next.config.ts` (`images: { unoptimized: true }`, headers de seguridad y CSP actualizada para el dominio propio, R2/media y Google Maps).
   - Agregar **Cloudflare Cron Triggers** mediante worker wrapper sobre OpenNext:
     - Cada 15 min: ejecutar `POST /api/cron/reminders` autenticado con `CRON_SECRET` (despacho de recordatorios 24 h / 2 h / post-cita, limpieza de `slot_holds` expirados de 5 min y keep-alive natural de Supabase Free para evitar pausa por inactividad de 7 días).
     - Diario: ejecutar `POST /api/cron/retention` autenticado con `CRON_SECRET` para la política de retención a 12 meses.

2. **Base de datos, Auth y Realtime — Supabase Free (mantener `@supabase/supabase-js` y `@supabase/ssr`)**
   - Conservar `src/lib/repositories/supabase-repo.ts` y las migraciones `0001` a `0007` (NO migrar a Neon).
   - Crear la migración `0008_production_r2_whatsapp_retention.sql` (y actualizar `database.types.ts`, `schema.ts`, `demo-seed.ts` y paridad de seed) para:
     - Registrar metadatos de archivos subidos (`storage_path`, `folder`, `booking_id`, `created_at`, `retention_warned_30d_at`, `retention_warned_7d_at`, `purged_at`) para controlar la retención de 12 meses.
     - Registrar plantillas oficiales de WhatsApp (`template_name`, categoría `UTILITY`, idioma `es_MX`) y el conteo mensual de envíos de WhatsApp (cuota incluida: 500 mensajes/mes, con alerta preventiva en el panel `/admin` al 80% y 100%).
   - **Realtime en producción:** reemplazar la dependencia de EventEmitter en memoria de `src/app/api/realtime/route.ts` cuando `isSupabaseEnabled()` esté activo usando **Supabase Realtime** (cambios/broadcast en `bookings` y `slot_holds`), conservando el stream SSE local únicamente en Modo Demo.

3. **Almacenamiento de comprobantes e inspiración — Cloudflare R2 Free (10 GB gratis, $0 egress)**
   - Refactorizar `src/lib/storage/media.ts` y `src/app/api/media/[...path]/route.ts` para almacenar `proofs/` e `inspo/` en **Cloudflare R2** (usando binding nativo de R2 `SALON_MEDIA_BUCKET` en Workers y soporte S3-compatible ligero con `aws4fetch` para local/CI, evitando SDKs pesados de AWS), manteniendo el fallback local `.nails-demo-uploads/` en Modo Demo y pruebas.
   - Mantener estrictamente la validación por magic bytes (`PNG/JPEG/WEBP`, `<= 2.5 MB`) y protección contra path traversal.
   - **Seguridad de acceso a archivos:** el bucket R2 debe ser **100% privado**; exigir autorización en `/api/media/[...path]` (sesión admin válida o sesión/token de clienta dueña de la cita) o entregar URLs firmadas de corta duración (TTL 1 h).
   - **Política de retención a 12 meses con recordatorio automático:**
     - En `POST /api/cron/retention`: detectar archivos al cumplir **11 meses (335 días)** y **7 días antes del vencimiento (358 días)** y enviar **recordatorio automático por correo** a la dueña del estudio para respaldo contable antes de la depuración (sin duplicar avisos).
     - Al cumplir **12 meses (365 días)**: eliminar los objetos vencidos de R2, limpiar las referencias de archivo sin borrar el historial contable de las citas y registrar el evento en `audit_logs` de forma idempotente.

4. **Respaldos automáticos de base de datos — GitHub Actions -> Cloudflare R2**
   - Crear `.github/workflows/supabase-backup.yml` (programado diario/semanal + `workflow_dispatch`) que ejecute `pg_dump` de Supabase, comprima el respaldo y lo suba a un prefijo privado `backups/db/YYYY-MM-DD.sql.gz` en Cloudflare R2, aplicando rotación automática (retención de 30 días).

5. **WhatsApp Business oficial — Meta WhatsApp Cloud API + Coexistence**
   - Actualizar `dispatchWhatsAppNotification` en `src/lib/integrations/notifications.ts`: actualmente envía texto libre (`type: 'text'`), lo cual falla fuera de la ventana de 24 h de Meta. Implementar envío mediante **plantillas aprobadas `UTILITY` (`type: 'template'`, `es_MX`)** para confirmación de cita, recordatorio 24 h, recordatorio 2 h, reprogramación/cancelación y aviso de lista de espera, con fallback seguro a texto libre solo dentro de ventana activa y degradación limpia a correo + enlace `wa.me` mientras la cuenta está en verificación oficial.
   - Preparar el webhook `/api/webhooks/whatsapp` para **WhatsApp Coexistence** (sincronización móvil + plataforma en el mismo número del estudio): verificación estricta de firma HMAC-SHA256 (`X-Hub-Signature-256` con `WHATSAPP_APP_SECRET` usando Web Crypto API compatible con Workers), manejo idempotente de eventos `messages` / `statuses` / `smb_message_echoes` y actualización del contador mensual (límite incluido de 500/mes).

6. **Correos, Google Calendar y opcionales**
   - **Resend Free (3,000 correos/mes):** verificar envío desde dominio propio (`RESEND_FROM_EMAIL`), adjunto `.ics` RFC 5545 intacto y alinear el HTML de `renderBookingEmailHtml` a la identidad de Laikona Nails (sin colores ni textos genéricos).
   - **Google Calendar OAuth 2.0:** verificar compatibilidad completa en Workers (`src/lib/integrations/google-calendar.ts`) con `NEXT_PUBLIC_APP_URL` apuntando al dominio propio.
   - **Anticipos y opcionales:** mantener **SPEI $200 MXN (Opción A, $0 comisiones)** como modo por defecto; mantener **Twilio SMS** y **Mercado Pago / Stripe** como módulos opcionales desactivados por defecto.

7. **Endurecimiento de variables de entorno y seguridad**
   - Actualizar `src/lib/env.ts` y `.env.example` con las variables de Cloudflare R2, correo de avisos de retención, plantillas WhatsApp y validación estricta en producción (`assertProductionEnvValid`: exigir `ADMIN_SESSION_SECRET`, `CLIENT_SESSION_SECRET`, `CRON_SECRET`, integridad de credenciales R2/Supabase/Meta/Resend).
   - Aplicar una revisión de seguridad (usando la skill `security-audit`) sobre todas las fronteras nuevas: webhooks (Meta/Google), endpoints cron, autorización de `/api/media/[...path]`, secretos en Cloudflare y headers/CSP.
   - Documentar en un archivo nuevo `docs/deploy-cloudflare-supabase.md` la checklist paso a paso de alta de cuentas, registros DNS (Cloudflare + Resend SPF/DKIM/DMARC), Embedded Signup de WhatsApp Coexistence, alta de plantillas `UTILITY`, secrets de Wrangler y GitHub Actions.

### Reglas estrictas del repositorio (`AGENTS.md`)
- Respetar todos los guardrails mecánicos: cero comentarios en `src/**` (salvo `// INVARIANT:` indispensable), prohibido `useEffect`/`setTimeout` en `src/app/**` y `src/components/**`, prohibido `<div>`/`<span>` crudos o `#hex`/`px` inline en UI (usar Astryx y tokens), prohibido `any` / `as any` / `as unknown as` / `@ts-ignore`, y respetar estrictamente las fronteras de dominio puro.
- Usar las skills obligatorias del repo (`security-audit` y `modern-web-guidance`) cuando aplique.
- Agregar pruebas unitarias, de seguridad y property tests (`fast-check`) para la retención a 12 meses, autorización de media en R2, armado de plantillas WhatsApp `UTILITY` y validación de entorno.

### Criterio de aceptación
- `npm run verify` pasa con **0 errores y 0 warnings** (`typecheck`, `guardrails`, `deadcode`, `test`, `build`, `doctor`).
- El build de Cloudflare (`npx opennextjs-cloudflare build`) compila limpio y arranca en preview local sin errores de runtime.
- Verificación real en navegador de los flujos críticos de `docs/feature-map.md` (landing, `/reservar`, `/cita/[token]` con subida/lectura de comprobante y `/admin` incluyendo estado de integraciones).
```
