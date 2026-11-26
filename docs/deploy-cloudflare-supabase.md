# Guía de Despliegue a Producción — LAIKONA NAILS (Cloudflare Workers + R2 + Supabase + Resend + Meta WhatsApp Coexistence)

Runbook paso a paso para operar **LAIKONA NAILS BY KARLA** en producción o pre-producción (`https://laikona.devand.net`) con arquitectura serverless de costo mínimo, almacenamiento privado de comprobantes con retención automática de 12 meses, respaldos diarios de PostgreSQL en Cloudflare R2 y mensajería oficial vía Meta WhatsApp Coexistence.

---

## 0. Despliegue Rápido en Pre-Producción (`laikona.devand.net` con cuenta Gmail)

Usa esta lista corta para lanzar **`https://laikona.devand.net`** con servicios reales antes de comprar el dominio definitivo:

1. **Cloudflare (`devand.net`):**
   - `wrangler.jsonc` ya tiene configurada la ruta personalizada `laikona.devand.net` (`custom_domain: true`).
   - Autentícate y crea el bucket R2:
     ```bash
     npx wrangler login
     npx wrangler r2 bucket create laikona-nails-media
     npx wrangler r2 bucket create laikona-nails-media-preview
     ```
2. **Supabase Free (creado con tu Gmail):**
   - Ejecuta las migraciones `supabase/migrations/0001` a `0008` en el SQL Editor y luego `supabase/seed.sql`.
   - En **Authentication → Users** crea el usuario con tu Gmail y contraseña, y vincúlalo como `owner`:
     ```sql
     INSERT INTO public.admin_users (auth_user_id, email, full_name, role, is_active)
     VALUES ('<UUID-DE-AUTH-USERS>', '<tu-correo>@gmail.com', 'Karla', 'owner', true)
     ON CONFLICT (email) DO UPDATE
       SET auth_user_id = EXCLUDED.auth_user_id, role = 'owner', is_active = true;
     ```
   - En **Authentication → URL Configuration**, configura **Site URL**: `https://laikona.devand.net`.
3. **Resend Free (cuenta con el mismo Gmail):**
   - Verifica el subdominio **`laikona.devand.net`** en **Resend → Domains** (Resend no permite enviar desde `@gmail.com`, pero Cloudflare agrega los registros SPF/DKIM en ~1 minuto).
   - Define `RESEND_FROM_EMAIL="LAIKONA NAILS <citas@laikona.devand.net>"` y `RETENTION_NOTICE_EMAIL="<tu-correo>@gmail.com"`.
   - Sin Meta WhatsApp Cloud API, `/mis-citas` usa automáticamente **Resend** para enviar el código OTP de 6 dígitos al correo registrado de la clienta.
4. **Google Cloud Console (opcional, mismo Gmail):**
   - Habilita **Google Calendar API**, crea credenciales OAuth 2.0 Web con Redirect URI `https://laikona.devand.net/api/integrations/google/callback`.
5. **Variables/Secretos en Workers (`SITE_NOINDEX=true` mientras sea pruebas):**
   - Exporta en `.env.production.local` (ignorado por Git) las 3 variables públicas antes de compilar:
     `NEXT_PUBLIC_APP_URL=https://laikona.devand.net`, `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`.
   - Sube secretos con `npx wrangler secret put <NOMBRE>`: `NEXT_PUBLIC_APP_URL`, `SITE_NOINDEX` (`true`), `ADMIN_SESSION_SECRET`, `CLIENT_SESSION_SECRET`, `CRON_SECRET`, `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `RESEND_API_KEY`, `RESEND_FROM_EMAIL`, `RETENTION_NOTICE_EMAIL` (y opcionales `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_WEBHOOK_TOKEN`).
   - Compila y despliega: `npm run cf:deploy`.
6. **Cambio futuro al dominio definitivo (sin migrar DB ni R2):**
   - Cambia `routes` en `wrangler.jsonc`, actualiza `NEXT_PUBLIC_APP_URL`, elimina `SITE_NOINDEX`, verifica el nuevo dominio en Resend (`RESEND_FROM_EMAIL`) y agrega el nuevo Redirect URI en Google OAuth + Supabase Site URL.

---

## 1. Arquitectura y Desglose de Costos

| Componente | Servicio | Plan Inicial | Costo | Límites y Criterios de Escalado |
| :--- | :--- | :--- | :--- | :--- |
| **Aplicación Web + API + Crons** | Cloudflare Workers (`@opennextjs/cloudflare` + `worker.ts`) | Free o Workers Paid | `$0` o `$5 USD/mes` | **Free:** 100,000 req/día y **10 ms de tiempo de CPU** por petición. **Paid ($5 USD/mes):** 10 millones req/mes y hasta **30 s de CPU**. Next.js 16 + React 19 SSR con `images: { unoptimized: true }` minimiza CPU, pero si en Cloudflare Workers → *Observability* el p95/p99 de CPU en frío supera `8–10 ms` o aparecen errores `1102 Worker exceeded CPU time limit`, activar **Workers Paid ($5 USD/mes)** de inmediato. |
| **Comprobantes SPEI, Inspo y Backups DB** | Cloudflare R2 (`laikona-nails-media`) | Free Tier | `$0 USD/mes` | **10 GB** de almacenamiento, **$0 de egresos (bandwidth)**, 1 millón de operaciones Clase A y 10 millones Clase B al mes. Bucket **100% privado** con purga automática de media a los 12 meses y rotación de respaldos DB a 30 días. |
| **Base de Datos + Auth + Realtime** | Supabase (PostgreSQL 15/17) | Free Tier | `$0 USD/mes` | **500 MB** de base de datos, Auth para el equipo admin y Supabase Realtime WebSocket (`wss:`) en el canal `salon:public-slots`. El cron nativo de Workers cada 15 minutos (`*/15 * * * *`) ejecuta `cleanupExpiredSlotHolds()`, manteniendo el proyecto activo para evitar pausas por inactividad de 7 días. |
| **Respaldos Diarios PostgreSQL** | GitHub Actions (`.github/workflows/supabase-backup.yml`) → R2 | Free (GitHub Actions) | `$0 USD/mes` | `pg_dump` comprimido (`gzip -9`) todos los días a las `08:00 UTC` (`02:00 AM` Puebla) guardado en `s3://laikona-nails-media/backups/db/YYYY-MM-DD.sql.gz` con **rotación automática de 30 días**. |
| **Correo Transaccional (.ics + Retención)** | Resend | Free Tier | `$0 USD/mes` | **3,000 correos/mes** (100/día). Correos brandeados **LAIKONA NAILS** con invitación de calendario `.ics` (RFC 5545) y avisos de respaldo contable a los 335 y 358 días. |
| **WhatsApp Oficial (Coexistence)** | Meta WhatsApp Cloud API | Pago por uso (cuota interna 500/mes) | ~$0–$15 USD/mes según uso | Mensajes de respuesta dentro de la **ventana de servicio de 24 h** iniciada por la clienta: **$0**. Plantillas `UTILITY` (`es_MX`) fuera de ventana: tarifa oficial Meta México por mensaje entregado. Cuota de control interna en **`500 mensajes/mes`** con alertas automáticas al **80% (400)** y **100% (500)** (al llegar al 100% degrada limpiamente a correo Resend + enlace `wa.me`). |

> **Recomendación práctica para lanzamiento:** Arrancar con Supabase Free + R2 Free + Resend Free + Cloudflare Workers **Paid ($5 USD/mes)** si deseas margen total de CPU en cold starts de Next.js 16 SSR y cero riesgo de error `1102` en días pico (quincenas / viernes / sábados).

---

## 2. Dominio, Cloudflare DNS, SSL/TLS y Registros de Resend

### 2.1 DNS y SSL/TLS en Cloudflare
1. Agrega tu dominio (ejemplo: `laikonanails.com`) en el dashboard de Cloudflare y apunta los **Nameservers** desde tu registrador.
2. En **SSL/TLS → Overview**, selecciona estrictamente **Full (Strict)**.
3. En **SSL/TLS → Edge Certificates**:
   - Activa **Always Use HTTPS**.
   - Activa **Automatic HTTPS Rewrites**.
   - Mantén **Minimum TLS Version** en `TLS 1.2` o superior.
   - `next.config.ts` ya emite `Strict-Transport-Security: max-age=63072000; includeSubDomains; preload`, `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY` (salvo `/reservar?embed=1`) y `Content-Security-Policy` compatible con Supabase Realtime (`wss:`), Google Maps y `/api/media/*`.
4. Cuando estés listo para enlazar el dominio al Worker, descomenta el bloque `"routes"` en [`wrangler.jsonc`](../wrangler.jsonc):
   ```jsonc
   "routes": [
     { "pattern": "laikonanails.com", "custom_domain": true },
     { "pattern": "www.laikonanails.com", "custom_domain": true }
   ]
   ```
   Cloudflare crea automáticamente los registros DNS proxied y el certificado Edge para dominios personalizados en Workers.

### 2.2 Verificación de Dominio en Resend (SPF, DKIM y DMARC)
1. En **Resend → Domains → Add Domain**, registra tu dominio (ej. `laikonanails.com` o el subdominio dedicado `mail.laikonanails.com`).
2. Agrega en **Cloudflare DNS** (con estado **DNS only / nube gris**, nunca proxied) los registros exactos que entregue Resend:
   - **DKIM (`TXT`):** `resend._domainkey` → clave pública RSA provista por Resend.
   - **SPF / Return-Path (`MX` y `TXT`):** registros `send` (o subdominio indicado por Resend) con `v=spf1 include:amazonses.com ~all`.
   - **DMARC (`TXT`):** `_dmarc` → `v=DMARC1; p=quarantine; pct=100; rua=mailto:hola@laikonanails.com`.
3. Espera estado **Verified** en Resend y define `RESEND_FROM_EMAIL` con ese dominio verificado, por ejemplo:
   `LAIKONA NAILS <citas@laikonanails.com>`.

---

## 3. Configuración de Supabase (PostgreSQL, Migraciones `0001`–`0008`, Auth y Realtime)

### 3.1 Crear proyecto y aplicar migraciones
1. Crea un proyecto nuevo en **Supabase** (región recomendada para Puebla, México: **US East** o **US West**).
2. Aplica **en orden estricto** todas las migraciones de `supabase/migrations/` (vía `supabase db push` o pegando cada archivo en el **SQL Editor**):
   1. `0001_initial_schema.sql` — tablas base (`salon_settings`, `services`, `addons`, `staff_members`, `bookings`, `clients`, etc.) y RLS.
   2. `0002_salon_growth_features.sql` — cupones, reseñas, lista de espera, auditoría.
   3. `0003_phase1_hardening.sql` — endurecimiento de concurrencia, idempotencia y holds.
   4. `0004_laikona_salon_and_onboarding.sql` — identidad LAIKONA NAILS, anticipo SPEI y onboarding.
   5. `0005_phase3a_operations_loyalty_privacy.sql` — sellos de fidelidad, caja, inventario, consentimiento LFPDPPP.
   6. `0006_phase3a_plus_calcom_ux.sql` — recurrencia, bloqueos recurrentes, servicios VIP, embeds.
   7. `0007_phase3b_integrations_and_cascade.sql` — integraciones OAuth Google Calendar, políticas no-show, PIN dueña y paquetes de sesiones.
   8. `0008_production_r2_whatsapp_retention.sql` — tablas `media_assets`, `whatsapp_templates`, `whatsapp_monthly_usage`, RPC atómica `increment_whatsapp_usage`, `webhook_events` (deduplicación idempotente Coexistence), columnas `retention_notice_email` / `whatsapp_monthly_quota` en `salon_settings` y acciones `media_retention_warned` / `media_retention_purged` en `audit_logs`.
3. Ejecuta `supabase/seed.sql` una sola vez para sembrar el estudio **LAIKONA NAILS**, el catálogo base, los turnos fijos (`Karla`, `Paty`, `Tere`) y las 6 plantillas `UTILITY` `es_MX` en `public.whatsapp_templates`.

### 3.2 Usuarios Administradores (Supabase Auth + `public.admin_users`)
1. En **Supabase → Authentication → Users**, crea el usuario de Karla (`owner`) con correo real y contraseña robusta.
2. Inserta o actualiza su registro en `public.admin_users` con `role = 'owner'`, `auth_user_id = <uuid de auth.users>` y `email = <correo de Karla>` (y opcionalmente crea cuentas `admin` o `specialist` vinculadas a su `staff_member_id`).
3. En **Authentication → URL Configuration**, agrega `https://laikonanails.com` como **Site URL** y las rutas de redirección permitidas.

### 3.3 Supabase Realtime y Credenciales
1. Verifica en **Database → Replication** que Realtime esté habilitado; la aplicación se suscribe desde el navegador al canal **`salon:public-slots`** vía WebSocket seguro (`wss:`) cuando `NEXT_PUBLIC_SUPABASE_URL` y `NEXT_PUBLIC_SUPABASE_ANON_KEY` están configurados (sin mantener streams SSE en memoria en Cloudflare Workers).
2. Copia desde **Project Settings → API**:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `SUPABASE_SERVICE_ROLE_KEY` (solo secreto del servidor/Worker, **nunca** exponer al cliente)
3. Copia desde **Project Settings → Database → Connection String (Session Pooler IPv4, puerto `5432`)** la URI PostgreSQL completa (`postgresql://postgres.<ref>:<password>@aws-0-<region>.pooler.supabase.com:5432/postgres?sslmode=require`) para guardarla como `SUPABASE_DB_URL` en GitHub Actions (GitHub Actions corre en IPv4, por lo que el Session Pooler es la opción más confiable para `pg_dump`).

---

## 4. Cloudflare R2 — Bucket Privado y Política de Retención de 12 Meses

### 4.1 Crear buckets privados
Autentícate en Wrangler y crea los buckets configurados en [`wrangler.jsonc`](../wrangler.jsonc):

```bash
npx wrangler login
npx wrangler r2 bucket create laikona-nails-media
npx wrangler r2 bucket create laikona-nails-media-preview
```

**Reglas de seguridad obligatorias en R2:**
- Mantén **Public Development URL (`r2.dev`) DESACTIVADA** y **NO** agregues dominios públicos al bucket.
- Todo comprobante SPEI (`proofs/*`) y foto de inspiración (`inspo/*`) se sirve únicamente a través de `GET /api/media/[...path]`, que exige autorización:
  1. Sesión admin válida (`owner`/`admin` ven todo; `specialist` solo archivos de sus propias citas), o
  2. URL firmada HMAC-SHA256 de vida corta (1 hora: `?exp=...&sig=...`), o
  3. Token mágico de la cita propietaria (`?token=<manageToken>`), o
  4. Cookie autenticada del portal de clientas (`nails_client_portal`) cuyo teléfono coincida con la propietaria.

### 4.2 Crear R2 API Token (para Respaldos GitHub Actions y Fallback S3)
1. En **Cloudflare Dashboard → R2 → Manage R2 API Tokens → Create API Token**:
   - Permisos: **Object Read & Write**.
   - Especificar bucket: **únicamente `laikona-nails-media`**.
2. Guarda estos valores:
   - `R2_ACCOUNT_ID` (Account ID de Cloudflare)
   - `R2_ACCESS_KEY_ID`
   - `R2_SECRET_ACCESS_KEY`
   - `R2_BUCKET_NAME=laikona-nails-media`

### 4.3 Retención automática de 12 meses (Contabilidad)
El Worker dispara diariamente a las `09:00 UTC` (`03:00 AM` hora de Puebla) `POST /api/cron/retention`:
- **Día 335 (11 meses):** envía un correo agrupado a `RETENTION_NOTICE_EMAIL` (o al correo del salón) avisando que los archivos próximos cumplirán 12 meses para respaldo contable.
- **Día 358 (7 días antes):** envía recordatorio final de respaldo.
- **Día 365 (12 meses):** elimina los archivos binarios en R2 (`deleteStoredMedia`) y limpia las URLs de archivo sin borrar la cita ni el historial financiero/contable, dejando registro en `audit_logs` (`media_retention_warned` y `media_retention_purged`).

---

## 5. Meta WhatsApp Business Embedded Signup + WhatsApp Coexistence

### 5.1 Activar WhatsApp Coexistence (mismo número en celular + plataforma)
**WhatsApp Coexistence** permite que Karla conserve la app **WhatsApp Business** en su teléfono celular con su número habitual y, al mismo tiempo, la plataforma envíe recordatorios oficiales y reciba eventos desde WhatsApp Cloud API:

1. Crea una App de tipo **Business** en [Meta for Developers](https://developers.facebook.com/) y agrega el producto **WhatsApp**.
2. Vincula tu **Meta Business Portfolio** verificado y ejecuta el flujo de **WhatsApp Embedded Signup (Coexistence / Onboarding con número existente de WhatsApp Business App)**:
   - Selecciona la opción de conectar un número ya registrado en la app **WhatsApp Business**.
   - Escanea el **código QR** desde la app **WhatsApp Business** en el celular de Karla (*Dispositivos vinculados / Plataforma empresarial*) para sincronizar el número sin cerrar sesión en el teléfono.
3. Genera un **System User Token permanente** en Meta Business Settings con permisos `whatsapp_business_messaging` y `whatsapp_business_management`.
4. Anota:
   - `WHATSAPP_ACCESS_TOKEN` (System User Token)
   - `WHATSAPP_PHONE_NUMBER_ID`
   - `WHATSAPP_BUSINESS_ACCOUNT_ID`
   - `WHATSAPP_APP_SECRET` (App Settings → Basic → App Secret)
   - `WHATSAPP_VERIFY_TOKEN` (token aleatorio propio, ej. `openssl rand -hex 24`)
   - `WHATSAPP_COEXISTENCE_ENABLED=true`
   - `WHATSAPP_MONTHLY_QUOTA=500`

### 5.2 Configurar Webhook de Coexistence
1. En **Meta App → WhatsApp → Configuration → Webhook**:
   - **Callback URL:** `https://laikonanails.com/api/webhooks/whatsapp`
   - **Verify Token:** exactamente el mismo valor que `WHATSAPP_VERIFY_TOKEN`.
2. Suscribe el webhook a estos **3 campos obligatorios**:
   - `messages` (mensajes entrantes / WhatsApp Flows)
   - `statuses` (estados `sent`/`delivered`/`read`/`failed` para contabilizar la cuota mensual de forma idempotente)
   - `smb_message_echoes` (ecos de mensajes enviados manualmente desde la app móvil de Karla; la plataforma los registra en auditoría/deduplicación sin responder en bucle)
3. Todas las peticiones `POST` verifican `X-Hub-Signature-256` con HMAC-SHA256 en Web Crypto (`crypto.subtle`) y deduplican eventos en `public.webhook_events`. Sin `WHATSAPP_APP_SECRET`, el webhook falla cerrado (`401`/`503`).

### 5.3 Crear y aprobar las 6 plantillas `UTILITY` (`es_MX`)
En **Meta WhatsApp Manager → Message Templates**, crea estas **6 plantillas** en categoría **`UTILITY`** e idioma **`Spanish (MEX)` (`es_MX`)** (Meta rechaza saltos de línea `\n` o tabuladores `\t` dentro de parámetros; la app los sanitiza automáticamente):

| `trigger_key` | Nombre de plantilla (`template_name`) | Variables (`{{1}}`..`{{N}}`) | Texto sugerido (`UTILITY`, `es_MX`) |
| :--- | :--- | :--- | :--- |
| `booking_confirmed` | `laikona_cita_confirmada` | `{{1}}` Clienta, `{{2}}` Servicio, `{{3}}` Fecha y hora, `{{4}}` Manicurista, `{{5}}` Código, `{{6}}` Enlace mágico | `Hola {{1}}, tu cita de {{2}} en LAIKONA NAILS quedó confirmada para el {{3}} con {{4}}. Código: {{5}}. Consulta detalles o cambios aquí: {{6}}` |
| `reminder_24h` | `laikona_recordatorio_24h` | `{{1}}` Clienta, `{{2}}` Servicio, `{{3}}` Fecha y hora, `{{4}}` Manicurista, `{{5}}` Enlace mágico | `Hola {{1}}, te recordamos tu cita mañana en LAIKONA NAILS: {{2}} el {{3}} con {{4}}. Si necesitas reagendar (con al menos 12 h de anticipación): {{5}}` |
| `reminder_2h` | `laikona_recordatorio_2h` | `{{1}}` Clienta, `{{2}}` Servicio, `{{3}}` Hora, `{{4}}` Dirección, `{{5}}` Enlace mágico | `Hola {{1}}, ¡nos vemos pronto! Tu cita de {{2}} es hoy a las {{3}} en {{4}}. Detalles de tu reserva: {{5}}` |
| `booking_rescheduled` | `laikona_cita_reagendada` | `{{1}}` Clienta, `{{2}}` Servicio, `{{3}}` Nueva fecha y hora, `{{4}}` Manicurista, `{{5}}` Enlace mágico | `Hola {{1}}, tu cita de {{2}} en LAIKONA NAILS fue reagendada para el {{3}} con {{4}}. Tu enlace actualizado: {{5}}` |
| `booking_canceled` | `laikona_cita_cancelada` | `{{1}}` Clienta, `{{2}}` Servicio, `{{3}}` Fecha y hora, `{{4}}` Enlace nueva reserva | `Hola {{1}}, confirmamos la cancelación de tu cita de {{2}} del {{3}} en LAIKONA NAILS. Cuando gustes agendar de nuevo: {{4}}` |
| `waitlist_offer` | `laikona_lista_espera` | `{{1}}` Clienta, `{{2}}` Servicio, `{{3}}` Horario liberado, `{{4}}` Enlace de reserva | `Hola {{1}}, se liberó un espacio en LAIKONA NAILS para {{2}} el {{3}}. Apártalo antes de que se ocupe aquí: {{4}}` |

> Si Meta te pide renombrar alguna plantilla, actualiza `template_name` en `public.whatsapp_templates` o define su override opcional (`WHATSAPP_TEMPLATE_BOOKING_CONFIRMED`, `WHATSAPP_TEMPLATE_REMINDER_24H`, etc.).

---

## 6. Secretos en Cloudflare Workers y GitHub Actions

### 6.1 Generar secretos criptográficos locales
Ejecuta en tu terminal para generar llaves fuertes (mínimo 32 bytes aleatorios):

```bash
node -e "console.log('ADMIN_SESSION_SECRET=' + require('node:crypto').randomBytes(32).toString('hex'))"
node -e "console.log('CLIENT_SESSION_SECRET=' + require('node:crypto').randomBytes(32).toString('hex'))"
node -e "console.log('CRON_SECRET=' + require('node:crypto').randomBytes(32).toString('hex'))"
node -e "console.log('WHATSAPP_VERIFY_TOKEN=' + require('node:crypto').randomBytes(24).toString('hex'))"
```

### 6.2 Cargar secretos en Cloudflare Workers (`npx wrangler secret put`)
Ejecuta uno por uno (Wrangler solicitará pegar el valor sin guardarlo en el historial del repo):

```bash
# --- 1. Núcleo y seguridad (OBLIGATORIOS en producción) ---
npx wrangler secret put NEXT_PUBLIC_APP_URL
npx wrangler secret put ADMIN_SESSION_SECRET
npx wrangler secret put CLIENT_SESSION_SECRET
npx wrangler secret put CRON_SECRET

# --- 2. Supabase (OBLIGATORIOS en producción) ---
npx wrangler secret put NEXT_PUBLIC_SUPABASE_URL
npx wrangler secret put NEXT_PUBLIC_SUPABASE_ANON_KEY
npx wrangler secret put SUPABASE_SERVICE_ROLE_KEY

# --- 3. R2 y Retención Contable ---
npx wrangler secret put RETENTION_NOTICE_EMAIL
# Opcionales en Workers (el Worker usa el binding nativo SALON_MEDIA_BUCKET;
# útiles solo si ejecutas tareas S3 fuera del binding):
npx wrangler secret put R2_ACCOUNT_ID
npx wrangler secret put R2_ACCESS_KEY_ID
npx wrangler secret put R2_SECRET_ACCESS_KEY
npx wrangler secret put R2_BUCKET_NAME

# --- 4. Resend (Correo transaccional + .ics + avisos de retención) ---
npx wrangler secret put RESEND_API_KEY
npx wrangler secret put RESEND_FROM_EMAIL

# --- 5. Meta WhatsApp Cloud API + Coexistence ---
npx wrangler secret put WHATSAPP_ACCESS_TOKEN
npx wrangler secret put WHATSAPP_PHONE_NUMBER_ID
npx wrangler secret put WHATSAPP_BUSINESS_ACCOUNT_ID
npx wrangler secret put WHATSAPP_VERIFY_TOKEN
npx wrangler secret put WHATSAPP_APP_SECRET
npx wrangler secret put WHATSAPP_COEXISTENCE_ENABLED
npx wrangler secret put WHATSAPP_MONTHLY_QUOTA
# Opcional si activas WhatsApp Flows:
# npx wrangler secret put WHATSAPP_FLOW_ID

# --- 6. Integraciones opcionales (Google Calendar / Pagos / SMS) ---
# Google Calendar (Redirect URI: https://laikonanails.com/api/integrations/google/callback):
# npx wrangler secret put GOOGLE_CLIENT_ID
# npx wrangler secret put GOOGLE_CLIENT_SECRET
# npx wrangler secret put GOOGLE_WEBHOOK_TOKEN
# Mercado Pago:
# npx wrangler secret put MERCADOPAGO_ACCESS_TOKEN
# npx wrangler secret put MERCADOPAGO_WEBHOOK_SECRET
# Stripe:
# npx wrangler secret put STRIPE_SECRET_KEY
# npx wrangler secret put STRIPE_WEBHOOK_SECRET
# Twilio SMS:
# npx wrangler secret put TWILIO_ACCOUNT_SID
# npx wrangler secret put TWILIO_AUTH_TOKEN
# npx wrangler secret put TWILIO_FROM_NUMBER
```

> **Importante para el build cliente (`NEXT_PUBLIC_*`):** Next.js incrusta `NEXT_PUBLIC_APP_URL`, `NEXT_PUBLIC_SUPABASE_URL` y `NEXT_PUBLIC_SUPABASE_ANON_KEY` en el bundle del navegador al compilar. Antes de correr `npm run cf:build`, expórtalas en tu entorno (o colócalas en `.env.production.local`, ignorado por `.gitignore`) además de cargarlas como secretos/variables del Worker.

### 6.3 Secretos en GitHub Actions (Respaldo diario PostgreSQL → R2)
En tu repositorio de GitHub → **Settings → Secrets and variables → Actions → New repository secret**, crea estos **5 secretos**:

| Secreto | Valor |
| :--- | :--- |
| `SUPABASE_DB_URL` | URI PostgreSQL Session Pooler IPv4 de Supabase (`?sslmode=require`) |
| `R2_ACCOUNT_ID` | Account ID de Cloudflare |
| `R2_ACCESS_KEY_ID` | Access Key ID del token R2 acotado a `laikona-nails-media` |
| `R2_SECRET_ACCESS_KEY` | Secret Access Key del token R2 |
| `R2_BUCKET_NAME` | `laikona-nails-media` |

El workflow [`.github/workflows/supabase-backup.yml`](../.github/workflows/supabase-backup.yml) corre automáticamente todos los días a las `08:00 UTC` y borra backups con más de 30 días bajo `backups/db/`.

**Cómo restaurar un respaldo desde R2 en caso de emergencia:**
```bash
aws s3 cp "s3://laikona-nails-media/backups/db/YYYY-MM-DD.sql.gz" ./restore.sql.gz \
  --endpoint-url "https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com"
gunzip -c ./restore.sql.gz | psql "$SUPABASE_DB_URL"
rm -f ./restore.sql.gz
```

---

## 7. Cron Triggers Nativos en Cloudflare Workers (`worker.ts`)

El archivo [`worker.ts`](../worker.ts) envuelve el bundle generado en `.open-next/worker.js` para conservar `fetch(...)` y añadir `scheduled(controller, env, ctx)` con despacho interno sin salto de red externo:

| Expresión Cron (UTC) | Hora en Puebla (CST) | Endpoint interno | Función |
| :--- | :--- | :--- | :--- |
| `*/15 * * * *` | Cada 15 minutos | `POST /api/cron/reminders` | Envía recordatorios 24h / 2h / encuesta post-cita, limpia apartados (`slot_holds`) expirados y mantiene activa la BD de Supabase Free. |
| `0 9 * * *` | `03:00 AM` diario | `POST /api/cron/retention` | Envía avisos contables a los 335 y 358 días y purga archivos R2 con >= 365 días preservando el historial contable. |

Ambos triggers adjuntan `Authorization: Bearer ${env.CRON_SECRET}` y fallan cerrado si `CRON_SECRET` no está configurado.

---

## 8. Checklist de Verificación Pre-Lanzamiento y Despliegue

Ejecuta en orden antes de pasar tráfico real:

1. **Gatekeeper de calidad (0 errores, 0 warnings):**
   ```bash
   npm run verify
   ```
2. **Build de Cloudflare Workers (`@opennextjs/cloudflare`):**
   ```bash
   npm run cf:build
   ```
   Verifica que `.open-next/worker.js` y `.open-next/assets/` se generen limpiamente sin errores de compatibilidad de runtime.
3. **Preview local real en `workerd`:**
   ```bash
   npm run cf:preview
   ```
   En otra terminal, confirma respuestas dentro del runtime de Workers (`http://127.0.0.1:8787`):
   - `GET /` → `200` (renderiza `LAIKONA NAILS`, imágenes con `unoptimized: true` sin errores).
   - `GET /reservar` y `GET /api/public/bootstrap` → `200`.
   - `GET /api/media/proofs/test.png` (sin sesión ni token) → **`401`** (gate privado R2 activo).
   - `POST /api/cron/retention` y `POST /api/cron/reminders` (sin `Authorization`) → **`401`** o **`503`**.
   - Prueba local de Cron Trigger (opcional): `npx wrangler dev --test-scheduled` y luego `curl "http://127.0.0.1:8787/__scheduled?cron=0+9+*+*+*"`.
4. **Despliegue a producción:**
   ```bash
   npm run cf:deploy
   ```
5. **Verificación post-despliegue en dominio real (`https://laikonanails.com`):**
   - [ ] Confirmar candado TLS (Full Strict), `GET /` y `GET /reservar` en móvil y escritorio.
   - [ ] Crear una cita de prueba subiendo un comprobante SPEI PNG: confirmar que se visualiza en `/cita/<token>` (`200` con `?token=...`) y devuelve `401` al abrir `/api/media/proofs/...` en una pestaña incógnita sin token.
   - [ ] Verificar recepción del correo de confirmación vía Resend con archivo `.ics` adjunto y estética LAIKONA NAILS.
   - [ ] Probar `GET /api/webhooks/whatsapp` (challenge de Meta) y enviar un `POST` sin firma válida para confirmar rechazo `401`.
   - [ ] Confirmar en `/admin` y `/admin/integraciones` que aparece el medidor de WhatsApp (`N de 500 mensajes usados este mes`) y el estado conectado de Supabase, R2, Resend y WhatsApp.
   - [ ] Ejecutar manualmente el workflow **Supabase Daily Backup to Cloudflare R2** desde GitHub Actions (`Run workflow`) y verificar el archivo `backups/db/YYYY-MM-DD.sql.gz` dentro del bucket `laikona-nails-media`.
   - [ ] Revisar en **Cloudflare Dashboard → Workers & Pages → laikona-nails → Observability** que el tiempo de CPU esté holgadamente debajo del límite del plan y que los dos Cron Triggers (`*/15 * * * *` y `0 9 * * *`) reporten estado `Ok`.
