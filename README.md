# LAIKONA NAILS — Plataforma Web Brandeada & Agenda en Tiempo Real

Plataforma web editorial, portal de clientas y sistema de citas diseñado para salones de uñas (**LAIKONA NAILS by Karla**), construido **100% con `@astryxdesign/core` (Astryx de Meta)**, Next.js 16 (App Router + React 19 + TypeScript) y listo para operar con Supabase, Google Calendar, Mercado Pago, Resend, Meta WhatsApp Cloud API y Twilio SMS.

---

## Requisitos Obligatorios (Astryx de Meta + Agent Skills)

> [!IMPORTANT]
> Cualquier persona o agente de IA que trabaje en este repositorio **debe instalar obligatoriamente** **Astryx de Meta** junto con las skills de **Cloudflare Security Audit** y **Google Chrome Modern Web Guidance** antes de desarrollar o abrir PRs.

| Requisito obligatorio | Propósito | Fuente oficial |
| :--- | :--- | :--- |
| **Astryx de Meta** | Sistema de diseño, componentes atómicos, temas y validación `astryx doctor` | `@astryxdesign/core`, `@stylexjs/stylex`, `@astryxdesign/theme-neutral`, `@astryxdesign/cli` |
| **Cloudflare `security-audit`** | Guía y auditoría determinista de seguridad (APIs, autenticación, webhooks, aislamiento de datos) | [github.com/cloudflare/security-audit-skill](https://github.com/cloudflare/security-audit-skill) |
| **Google Chrome `modern-web-guidance`** | Mejores prácticas modernas de HTML/CSS, APIs nativas web, accesibilidad y Core Web Vitals | [developer.chrome.com/docs/modern-web-guidance](https://developer.chrome.com/docs/modern-web-guidance?hl=es-419) · [GitHub](https://github.com/GoogleChrome/modern-web-guidance) |

### Instalación obligatoria (para todos los agentes IA)

```bash
# 1. Dependencias del proyecto (incluye Astryx de Meta: @astryxdesign/core, @stylexjs/stylex, @astryxdesign/theme-neutral, @astryxdesign/cli)
npm install
npx @astryxdesign/cli init

# 2. Skill obligatoria de seguridad (Cloudflare) — instalación global para todos los agentes
npx skills add https://github.com/cloudflare/security-audit-skill --skill security-audit --global

# 3. Skill obligatoria de estándares web modernos (Google Chrome) — instalación global para todos los agentes
npx skills add https://github.com/GoogleChrome/modern-web-guidance --skill modern-web-guidance --global
# (Alternativa interactiva oficial: npx modern-web-guidance@latest install)

# 4. Verificar que las skills quedaron instaladas globalmente
npx skills ls -g
```

---

## Estado Actual del Proyecto

El sistema ya cuenta con todas las fases de arquitectura, operación, integraciones reales, pulido UI/UX y crecimiento implementadas y verificadas:

- **Fase 0 · Blindaje:** Sesiones firmadas + RBAC (`owner` / `admin` / `specialist`), validación estricta Zod, `Idempotency-Key`, motor de disponibilidad optimizado (7× más rápido) y guardrails mecánicos AST + `oxlint`.
- **Fase 1 · Datos, Storage y Seguridad:** Adaptador `SupabaseSalonRepository` (`src/lib/repositories/supabase-repo.ts`), migraciones SQL `0001`–`0007` (`EXCLUDE USING gist`, RPC atómica y RLS), Supabase Auth, Storage para comprobantes/inspo, sesiones de clienta `httpOnly` y SSR sin FOUC.
- **Fase 2 · Identidad LAIKONA NAILS & Arquitectura Modular:** Identidad editorial *LAIKONA NAILS by Karla*, turnos fijos por artista (`Karla`, `Paty`, `Tere`), anticipo SPEI de `$200 MXN`, `BookingWidget` modular con máquina de estados (`bookingMachine`) y asistente inicial `/admin/onboarding`.
- **Fase 3A y 3A+ · Operación, Fidelidad y UX tipo Cal.com:** Cobro dividido (`paymentSplits`) con detección de citas sin cobrar (`sin-cobrar`), **Tarjeta de Sellos LAIKONA** (`8 sellos -> 50%`), popover rápido, búsqueda rápida de hora, CRM con filtro inverso y exportación ARCO (`/aviso-de-privacidad`), bio-link `/links`, SEO local (`NailSalon` JSON-LD, `/sitemap.xml`, `/robots.txt`), sincronización bidireccional en URL, Troubleshooter Visual, festivos oficiales MX, enlaces VIP privados (`isPrivate`), validador WCAG AA y generador QR SVG/PNG.
- **Fase 3B · Integraciones Reales & Confiabilidad:** Google Calendar OAuth 2.0 bidireccional (tokens cifrados AES-256-GCM + webhooks), Mercado Pago (preferencias + verificación HMAC de webhooks), invitaciones `.ics` RFC 5545, lista de espera automática, cascada de notificaciones, pruebas de concurrencia con `fast-check` (`fc.scheduler`) y suite E2E + CI.
- **Pulido UI/UX de Producción:** Sistema de micro-interacciones (`prefers-reduced-motion`), skeletons de carga, modo oscuro persistente y panel `/admin` minimalista con barra lateral retraíble (`Ctrl+B`) y búsqueda rápida (`Ctrl+K`).
- **Wave 2 · Plataforma, Portal Cliente, PWA y Crecimiento:**
  - **Seguridad y Observabilidad:** Rate limiting por ventana deslizante (`429 RATE_LIMITED` + `Retry-After`), logger JSON estructurado con redacción automática de PII/secretos/PIN/OTP y **PIN de autorización de Dueña** (`scrypt` + `timingSafeEqual`) para cancelaciones, ajustes de precio y exportación CSV.
  - **Portal de Clientas y PWA Offline:** Portal `/mis-citas` con acceso OTP de 6 dígitos (cookie `httpOnly`, sin contraseñas, aislamiento estricto por teléfono) y Service Worker `/sw.js` (`laikona-v1`) con soporte offline para citas guardadas.
  - **Analítica Ejecutiva (`/admin/reportes`):** Ocupación y retención por especialista, mapa de calor de demanda 7×12 (`09:00–20:00`), rentabilidad por servicio (`$/min`) y motivos de cancelación con aislamiento RBAC.
  - **Crecimiento y Retención:** Política automática de anticipo por inasistencias (`noShowDepositThreshold`), reservas recurrentes (cada 2/3/4 semanas, 2–6 citas) + enlace de retoque `+21 días`, paquetes de sesiones prepagados (`/api/admin/packages`), campañas de cumpleaños próximos (7 días) y reactivación 45+ días (`/api/admin/campaigns`), generador de incrustación en 3 modos (`Inline`, `Botón flotante`, `Popup modal` -> `/reservar?embed=1`), inventario con feedback optimista y property tests de cambios de horario DST (`fast-check`).

> [!NOTE]
> **Único pendiente de cableado para runtime 100% Supabase:** el adaptador `SupabaseSalonRepository` (`src/lib/repositories/supabase-repo.ts`), las 7 migraciones SQL (`0001`–`0007`) y todas las integraciones reales (Google Calendar, Mercado Pago, Resend, WhatsApp Cloud API, Twilio SMS) **ya están implementadas y probadas**. Solo resta migrar las rutas SSR, admin y webhooks que aún consumen helpers locales de `src/lib/repositories/db.ts` hacia el puerto `getRepository()` para ejecutar todo el flujo contra Supabase en producción.

---

## Arranque Rápido (Modo Demo Local)

No necesitas configurar ninguna credencial para probar el sistema completo en local:

```bash
npm install
npm run dev
```

Abre `http://localhost:3000`:
- **`/`** — Landing brandeada del salón (catálogo, extras, galería *"Creaciones"*, equipo, reseñas verificadas, políticas y ubicación).
- **`/reservar`**, **`/reservar/[slug]`** y **`/reservar?embed=1`** — Flujo de reserva en tiempo real (horario antes que artista, vistas **Mes / Semana**, extras dinámicos, apartado temporal de **5 minutos**, foto *inspo*, cupones `BIENVENIDA10` / `GIFT500`, lista de espera, recuperación ante colisiones `409` y modo compacto embebible).
- **`/mis-citas`** — Portal de clientas con código OTP por WhatsApp (en demo local: prueba con `222 412 3987` de Sofía Ramírez) para ver citas próximas, historial, tarjeta de sellos y paquetes activos.
- **`/cita/demo-token-sofia-1042`** — Link mágico de clienta (sin cuenta): agregar a Google / Apple `.ics` / Outlook, enviar por WhatsApp, reagendar, cancelar, tarjeta `6 / 8` sellos y retoque `+21 días`.
- **`/cita/demo-token-paula-1039`** — Cita completada con encuesta de satisfacción y redirección a reseña en Google Maps.
- **`/links`** y **`/aviso-de-privacidad`** — Bio-link de Instagram y Aviso de Privacidad LFPDPPP (Derechos ARCO).
- **`/admin`** y **`/admin/reportes`** — Panel multi-usuario minimalista con roles demo (**Dueña**, **Admin / Recepción** y **Especialista**), agenda visual, cobro dividido, paquetes, campañas de retención, generador de embed, PIN de autorización y analítica ejecutiva.

---

## Plan, Roadmap y Handoff

Todo el plan, las revisiones de arquitectura y el roadmap viven en [`docs/plan/`](docs/plan/README.md). Empieza por [`docs/plan/README.md`](docs/plan/README.md) para retomar el trabajo y por [`docs/feature-map.md`](docs/feature-map.md) para la guía determinista de verificación en navegador.

---

## Pasar a Producción (`.env.local`)

1. Copia `.env.example` a `.env.local` y configura los secretos obligatorios de sesión/cifrado (`ADMIN_SESSION_SECRET`, `CLIENT_SESSION_SECRET`, `GOOGLE_TOKEN_ENCRYPTION_KEY`, `CRON_SECRET`). En producción (`NODE_ENV=production`) la autenticación falla cerrado (`fail-closed`) si faltan credenciales.
2. **Supabase:** crea un proyecto en [supabase.com](https://supabase.com), ejecuta en el SQL Editor las migraciones en orden (`supabase/migrations/0001_initial_schema.sql` hasta `0007_phase3b_integrations_and_cascade.sql` y `supabase/seed.sql`), y configura `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` y `SUPABASE_SERVICE_ROLE_KEY`. *(Recuerda completar el cableado final de las rutas restantes a `getRepository()` para operar 100% contra Supabase en runtime.)*
3. **Google Calendar (Bidireccional):** crea credenciales OAuth 2.0 Web en Google Cloud Console con callback `{NEXT_PUBLIC_APP_URL}/api/integrations/google/callback` y configura `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` y `GOOGLE_WEBHOOK_TOKEN`.
4. **Mercado Pago (Anticipos en línea):** configura `MERCADOPAGO_ACCESS_TOKEN` y `MERCADOPAGO_WEBHOOK_SECRET` apuntando el webhook a `{NEXT_PUBLIC_APP_URL}/api/webhooks/mercadopago`.
5. **Correos con `.ics` RFC 5545 (Resend):** configura `RESEND_API_KEY` y `RESEND_FROM_EMAIL`.
6. **WhatsApp (Notificaciones Utility + Booking por WhatsApp Flows):** configura el webhook `{NEXT_PUBLIC_APP_URL}/api/webhooks/whatsapp` en Meta Developers y pega `WHATSAPP_ACCESS_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID`, `WHATSAPP_VERIFY_TOKEN` y `WHATSAPP_APP_SECRET`.
7. **SMS (Opcional — Twilio):** configura `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN` y `TWILIO_FROM_NUMBER`, y activa el switch en `/admin/integraciones`.
8. **Recordatorios programados:** apunta Vercel Cron o Upstash QStash cada 15 min a `POST /api/cron/reminders` con header `Authorization: Bearer ${CRON_SECRET}`.
9. **Despliegue:** sube el repo a Vercel, agrega las variables de entorno y conecta tu dominio personalizado.

---

## Scripts de Verificación

Ningún cambio se considera terminado hasta que el gatekeeper completo pase con **0 errores y 0 warnings**, acompañado de la suite E2E:

```bash
npm run verify             # Gatekeeper completo: typecheck + guardrails + deadcode + test + build + doctor
npm run test:e2e           # Suite E2E: rutas públicas, SEO, PWA /sw.js, embed, OTP /mis-citas, concurrencia 409 y RBAC
npm run typecheck          # Verificación estricta de TypeScript
npm run guardrails         # Reglas AST (cero comentarios, cero useEffect/setTimeout en UI, Astryx) + seed parity + oxlint
npm run deadcode           # Detección de archivos/exports/dependencias sin uso (knip)
npm test                   # Motor de disponibilidad, DST, concurrencia, seguridad, analítica, paquetes y property tests (fast-check)
npm run doctor             # Validación Astryx (astryx doctor --built .next)
npm run build              # Build de producción Next.js
```
