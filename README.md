# Nails — Plataforma Web Brandeada & Agenda en Tiempo Real

Plataforma web editorial y sistema de citas diseñado para salones de uñas, construido **100% con `@astryxdesign/core` (Astryx de Meta)**, Next.js (App Router + React 19 + TypeScript) y listo para operar con Supabase, Google Calendar, Resend, Meta WhatsApp Cloud API y Twilio SMS.

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

## Arranque Rápido (Modo Demo Local)

No necesitas configurar ninguna credencial para probar el sistema completo:

```bash
npm install
npm run dev
```

Abre `http://localhost:3000`:
- **`/`** — Landing brandeada del salón (catálogo, extras, galería *"Quiero este diseño"*, equipo, políticas y ubicación).
- **`/reservar`** y **`/reservar/[slug]`** — Flujo de reserva en tiempo real estilo Cal.com (vistas **Mes / Semana / Columnas**, horarios agrupados en **Mañana / Tarde / Noche**, extras dinámicos, apartado temporal de **3 minutos**, foto *inspo*, cupones `BIENVENIDA10` / `GIFT500`, lista de espera y recuperación ante colisiones `409`).
- **`/cita/demo-token-sofia-1042`** — Link mágico de clienta (sin cuenta): agregar a Google / Apple `.ics` / Outlook, enviar por WhatsApp, reagendar y cancelar.
- **`/cita/demo-token-paula-1039`** — Cita completada con encuesta de satisfacción y redirección a reseña en Google Maps.
- **`/admin`** — Panel multi-usuario con selector rápido de roles demo (**Dueña**, **Admin / Recepción** y **Manicurista**).

---

## Pasar a Producción (`.env.local`)

1. Copia `.env.example` a `.env.local`.
2. **Supabase:** crea un proyecto gratis en [supabase.com](https://supabase.com), ejecuta en el SQL Editor:
   - `supabase/migrations/0001_initial_schema.sql`
   - `supabase/migrations/0002_salon_growth_features.sql`
   - `supabase/seed.sql`
   Pega `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` y `SUPABASE_SERVICE_ROLE_KEY`.
3. **Google Calendar (Bidireccional):** crea credenciales OAuth 2.0 Web en Google Cloud Console con callback `{NEXT_PUBLIC_APP_URL}/api/integrations/google/callback` y pega `GOOGLE_CLIENT_ID` y `GOOGLE_CLIENT_SECRET`.
4. **Correos con `.ics` (Resend):** pega `RESEND_API_KEY` y `RESEND_FROM_EMAIL`.
5. **WhatsApp (Notificaciones Utility + Booking por WhatsApp Flows):** configura el webhook `{NEXT_PUBLIC_APP_URL}/api/webhooks/whatsapp` en Meta Developers y pega `WHATSAPP_ACCESS_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID`, `WHATSAPP_VERIFY_TOKEN` y `WHATSAPP_APP_SECRET`.
6. **SMS (Opcional — Twilio):** pega `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN` y `TWILIO_FROM_NUMBER`, y activa el switch en `/admin/integraciones`.
7. **Recordatorios programados:** apunta Vercel Cron o Upstash QStash cada 15 min a `POST /api/cron/reminders` con header `Authorization: Bearer ${CRON_SECRET}`.
8. **Despliegue:** sube el repo a Vercel, agrega las variables de entorno y conecta tu dominio personalizado.

---

## Scripts de Verificación

Ningún cambio se considera terminado hasta que el gatekeeper completo pase con **0 errores y 0 warnings**:

```bash
npm run verify             # Gatekeeper completo: typecheck + guardrails + deadcode + test + doctor + build
npm run typecheck          # Verificación estricta de TypeScript
npm run guardrails         # Reglas AST (cero comentarios, cero useEffect/setTimeout en UI, Astryx) + oxlint
npm run deadcode           # Detección de archivos/exports/dependencias sin uso (knip)
npm test                   # Motor de disponibilidad, concurrencia, 3-min hold, .ics y property tests (fast-check)
npm run doctor             # Validación Astryx (astryx doctor --built .next)
npm run build              # Build de producción Next.js
```
