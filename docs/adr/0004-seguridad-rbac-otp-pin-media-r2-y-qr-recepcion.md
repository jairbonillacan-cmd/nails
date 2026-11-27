# ADR-0004: Seguridad, RBAC multi-rol, endurecimiento OTP/PIN, media privada en R2 y barra QR de recepción

- **Estado:** Aceptado
- **Fecha:** 2026-11-27
- **Área:** Seguridad, Privacidad (LFPDPPP) y Control de Acceso

## Contexto

La plataforma maneja datos personales de clientas (teléfonos, correos, notas de alergias), comprobantes bancarios de anticipo, fotografías de inspiración, ingresos/comisiones del estudio y enlaces mágicos sin contraseña (`/cita/[token]`) que además se escanean mediante código QR en recepción. Los principales riesgos que requieren defensa en profundidad son:

1. **Escalación de privilegios entre personal del salón:** una manicurista (`specialist`) no debe ver comisiones, clientas ni finanzas ajenas ni modificar configuración de marca o caja.
2. **Abuso y replay en OTP de `/mis-citas`:** envío masivo de códigos por WhatsApp/SMS (costo financiero / spam), adivinanza offline de hashes OTP si no están ligados a secreto de servidor o reinicio del contador de intentos reutilizando cookies firmadas de desafío.
3. **Exposición de acciones administrativas críticas:** cancelaciones, precios manuales o exportación masiva CSV ejecutados desde una sesión de recepción compartida sin autorización de la dueña.
4. **Fuga de comprobantes SPEI / fotos privadas o filtración de tokens mágicos:** URLs públicas de R2 (`r2.dev`), encabezados `Referer` salientes hacia WhatsApp/Google Maps desde `/cita/[token]` o cachés compartidos de navegador.
5. **Privacidad de la propietaria y LFPDPPP:** el aviso de privacidad público no debe exponer el nombre legal personal de la dueña fuera del contexto necesario de pago, mientras cumple con derechos ARCO y minimización de datos.

## Decisión

1. **RBAC estricto de 3 roles (`owner`, `admin`, `specialist`) verificado en servidor:**
   - Matriz de permisos centralizada en `src/lib/rbac.ts` (`ROLE_PERMISSIONS` + `roleCanAccess`) y verificada en cada ruta bajo `src/app/api/admin/**` mediante `requireAdmin` (`src/lib/auth/admin-session.ts`), exigido mecánicamente por el guardrail `admin-auth-required` de `scripts/check-guardrails.mjs`.
   - `owner` (*Dueña*) tiene acceso completo (incluyendo marca, integraciones, onboarding, PIN de dueña, usuarios admin y auditoría).
   - `admin` (*Recepción*) opera agenda, caja, servicios, horarios, clientas, inventario y reportes del estudio, sin acceso a configuración de marca/conexiones ni modificación de citas pasadas bloqueadas.
   - `specialist` (*Manicurista*) accede exclusivamente a su propia agenda, sus propios horarios, sus propias comisiones en caja y reportes con `scope: 'specialist'`; las mutaciones de catálogo, caja, cupones, paquetes o citas ajenas responden `403`.
   - Los DTO públicos (`src/lib/public-dto.ts`) excluyen mecánicamente `commissionPercent`, `defaultCommissionPercent`, `ownerPinHash` e `internalNotes`.

2. **Endurecimiento del portal de clientas con OTP (`src/lib/auth/client-portal-otp.ts` y `src/app/api/client-portal/otp/route.ts`):**
   - **Digest con secreto de servidor:** `hashOtpCode` deriva la llave con `HMAC-SHA256` del secreto configurado (`CLIENT_PORTAL_SECRET` / `CLIENT_SESSION_SECRET` / `ADMIN_SESSION_SECRET`) sobre `salt:phoneE164:code`; en producción (`NODE_ENV=production`) falla cerrado (`503 PORTAL_UNCONFIGURED`) si falta el secreto y jamás devuelve `demoCode`.
   - **Resiliencia multi-isolate + anti-replay:** la cookie firmada `nails_client_otp_challenge` (`v: 2`) permite verificar desafíos entre isolates de Workers, mientras `nailsBurnedOtpChallengeSalts` quema la sal al consumirse o agotarse los 5 intentos (`OTP_MAX_ATTEMPTS = 5`, TTL 5 min), evitando reutilizar el desafío para reiniciar intentos.
   - **Límite por IP y por número telefónico:** `POST /api/client-portal/otp` aplica doble cuota en ventana de 10 min (`OTP_REQUEST_LIMIT = 15` por IP, `OTP_REQUEST_PER_PHONE_LIMIT = 4` por teléfono normalizado E.164 y `OTP_VERIFY_LIMIT = 25` por IP), usando `cf-connecting-ip` en `src/lib/security/rate-limit.ts`.
   - Sesión autenticada en cookie `HttpOnly` `nails_client_portal` (TTL 7 días) con aislamiento estricto al `phoneE164` verificado.

3. **PIN de autorización de Dueña con `scrypt` (`src/lib/security/auth-pin.ts`):**
   - PIN numérico de 4–6 dígitos almacenado exclusivamente como `scrypt$16384$8$1$<saltHex>$<derivedHex>` (`KEY_LEN = 64`, `SALT_BYTES = 16`) y verificado en tiempo constante con `crypto.timingSafeEqual`.
   - `ownerPinHash` jamás sale en payloads API (se proyecta únicamente `hasOwnerPin: boolean`). Cuando `ownerPinEnabled` está activo, cancelar citas, asignar `customPriceCents` o exportar CSV en caja exige PIN válido (`403 OWNER_PIN_REQUIRED` / `OWNER_PIN_INVALID`).

4. **Almacenamiento privado en Cloudflare R2 con retención automática de 12 meses:**
   - El bucket `laikona-nails-media` (`SALON_MEDIA_BUCKET` en `wrangler.jsonc`) se mantiene 100% privado (sin `r2.dev` ni dominio público).
   - `GET /api/media/[...path]` (`src/app/api/media/[...path]/route.ts`) bloquea path traversal (`400`), aplica rate limit (`180/min`) y sirve `proofs/*` e `inspo/*` solo bajo 4 mecanismos autorizados (sesión admin acotada por rol/especialista, URL firmada HMAC-SHA256 de 1 h, `?token=<manageToken>` comparado con `constantTimeEqual`, o cookie `nails_client_portal` del teléfono propietario), respondiendo con `Content-Security-Policy: default-src 'none'; sandbox`, `X-Content-Type-Options: nosniff` y `Cache-Control: private, max-age=300, no-store` (`gallery/*` público conserva caché inmutable).
   - `src/lib/storage/retention.ts` (`WARN_30D_AGE_DAYS = 335`, `WARN_7D_AGE_DAYS = 358`, `PURGE_AGE_DAYS = 365`) junto con el cron diario `0 9 * * *` (`POST /api/cron/retention`) avisa por correo para respaldo contable y purga los binarios a los 12 meses preservando el historial financiero y de auditoría.

5. **Privacidad pública (LFPDPPP), endurecimiento HTTP en `/cita/[token]` y barra inteligente de escaneo QR:**
   - `src/app/aviso-de-privacidad/page.tsx` identifica como responsable únicamente la identidad comercial (`settings.name` + `@instagram` + domicilio del estudio) sin exponer el nombre legal personal de la propietaria, detallando finalidades primarias/secundarias y ejercicio de derechos ARCO.
   - `next.config.ts` configura cabeceras globales estrictas (`HSTS`, `nosniff`, `Permissions-Policy`, `CSP`, `X-Frame-Options: DENY` salvo `/reservar?embed=1`) y agrega específicamente para `/cita/:path*` las cabeceras `Referrer-Policy: no-referrer` y `Cache-Control: private, no-store` (junto con `robots: { index: false, follow: false }` en `src/app/cita/[token]/page.tsx`) para impedir fugas del `manageToken` en encabezados `Referer` o caché del navegador.
   - **Barra inteligente de recepción en `/cita/[token]` (`src/lib/cita/studio-bar.ts` + `src/components/cita/CitaStudioBar.tsx`):** al escanear el código QR de la clienta desde un dispositivo del estudio con sesión admin activa, el servidor evalúa `requireAdmin()` y `resolveStudioBarContext` (ocultando por completo la barra para visitantes anónimos o especialistas de otras citas). Permite aprobar comprobantes/confirmar cita (`owner`/`admin`), marcar llegada (`PATCH /api/admin/bookings` con `action: 'check_in'`), abrir cobro directo (`/admin/citas?collect=<id>`) o abrir ficha de clienta (`/admin/clientas?q=<phone>`, solo `owner`/`admin`), manteniendo la verificación RBAC en cada endpoint de mutación.

## Alternativas consideradas

- **Hacer público el bucket R2 con UUIDs aleatorios ("security through obscurity"):** descartado porque los comprobantes bancarios SPEI contienen nombres, cuentas y montos sensibles que no deben quedar expuestos por URL filtrada ni indexable.
- **Usar un QR separado solo para admin distinto al enlace `/cita/[token]`:** descartado porque complica la experiencia de la clienta (dos códigos distintos); evaluar la sesión admin en el servidor sobre `/cita/[token]` mantiene un único QR universal con separación estricta de privilegios en el backend.
- **Almacenar OTP únicamente en memoria de Node/Workers sin cookie de desafío:** descartado porque Cloudflare Workers puede enrutar la petición de `request` y la de `verify` a isolates distintos; combinar cookie HMAC firmada + sal quemada + rate limit por teléfono resuelve ambos problemas.
- **Guardar el PIN de Dueña con SHA-256 simple:** descartado porque un PIN de 4–6 dígitos tiene un espacio de búsqueda de solo $10^6$ combinaciones; `scrypt` ($N=16384, r=8, p=1$) con sal aleatoria por registro eleva drásticamente el costo de fuerza bruta offline.

## Consecuencias y trade-offs

- **Positivas:**
  - Defensa en profundidad verificada por pruebas automatizadas (`security.test.ts`, `media-auth.test.ts`, `client-portal-otp.test.ts`, `auth-pin.test.ts`, `studio-bar.test.ts`, `check-in.test.ts`) y chequeos en vivo sobre `https://laikona.devand.net`.
  - Un único QR sirve tanto a la clienta (autogestión) como a recepción (check-in / cobro / aprobación de anticipo en 1 toque) sin filtrar privilegios a usuarios no autenticados.
  - Cumplimiento operativo de LFPDPPP (minimización, exportación ARCO, retención de 12 meses, sin exponer datos personales de la dueña).
- **Trade-offs y riesgos asumidos:**
  - Los límites de tasa (`src/lib/security/rate-limit.ts`) y las sales OTP quemadas residen en memoria del isolate de Workers; bajo tráfico distribuido en múltiples PoPs actúan como contención por isolate, complementados por el TTL corto de 5 min y la cuota mensual de WhatsApp persistida en Supabase (`whatsapp_monthly_usage`).
  - `Referrer-Policy: no-referrer` en `/cita/:path*` oculta la URL de origen a sitios externos enlazados desde esa página (comportamiento deseado por seguridad aunque no reporte referrer en Google Maps/WhatsApp).

## Evidencia y archivos clave

- `src/lib/rbac.ts`
- `src/lib/auth/admin-session.ts`
- `src/lib/auth/client-portal-otp.ts`
- `src/lib/auth/client-portal-otp.test.ts`
- `src/app/api/client-portal/otp/route.ts`
- `src/lib/security/auth-pin.ts`
- `src/lib/security/auth-pin.test.ts`
- `src/lib/security/rate-limit.ts`
- `src/lib/storage/media.ts`
- `src/lib/storage/retention.ts`
- `src/lib/storage/retention.test.ts`
- `src/app/api/media/[...path]/route.ts`
- `src/app/api/media/media-auth.test.ts`
- `src/app/api/cron/retention/route.ts`
- `src/app/aviso-de-privacidad/page.tsx`
- `next.config.ts`
- `src/app/cita/[token]/page.tsx`
- `src/lib/cita/studio-bar.ts`
- `src/lib/cita/studio-bar.test.ts`
- `src/components/cita/CitaStudioBar.tsx`
- `src/app/api/admin/bookings/route.ts`
- `src/app/api/admin/bookings/check-in.test.ts`
- `src/app/api/security.test.ts`
