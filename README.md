# Nails — Plataforma Web Brandeada & Agenda en Tiempo Real

Plataforma web editorial y sistema de citas diseñado para salones de uñas, construido **100% con `@astryxdesign/core`**, Next.js (App Router + React 19 + TypeScript) y listo para operar con Supabase, Google Calendar, Resend, Meta WhatsApp Cloud API y Twilio SMS.

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

```bash
npm run typecheck          # Verificación estricta de TypeScript
npm test                   # Motor de disponibilidad, concurrencia, 3-min hold y .ics
npm run build              # Build de producción Next.js
npx astryx doctor --built .next
```
