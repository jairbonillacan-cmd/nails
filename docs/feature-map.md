# Feature Map & Verification Guide — LAIKONA NAILS

Mapa determinista de rutas, precondiciones, selectores accesibles y flujos críticos para verificar **LAIKONA NAILS BY KARLA** en navegador/CDP sin adivinanzas.

---

## Precondiciones Generales
- Servidor corriendo: `npm run dev` (puerto `1717` en desarrollo local) o `npm run build && npm run start` en `http://localhost:3000`.
- **Modo Demo Local** (sin variables de Supabase en `.env.local`):
  - Base persistente en `.nails-demo-db.json` (borrar el archivo regenera datos limpios de fábrica de **LAIKONA NAILS**).
  - **Identidad sembrada:** `LAIKONA NAILS` (`by Karla · Manicure y nail art en Puebla`), `@laikona.nailsss`, estudio aliado `@lumiere.beautymx`.
  - **Especialistas y turnos fijos:**
    - **Karla** (`karla`): `10:00 · 13:30 · 16:30` (L–S) + bloqueo recurrente semanal `12:30–13:15` (`Comida y esterilización de instrumental`).
    - **Paty** (`paty`): `10:00 · 13:30 · 16:30` (L–S).
    - **Tere** (`tere`): `14:00 · 16:00 · 18:00` (L–S).
  - **Catálogo sembrado:** 9 servicios en 3 categorías (`Uñas & Esculturales`, `Gel & Retiro`, `Pies & PediSpa`), 5 extras y anticipo SPEI de **\$200 MXN** a Mercado Pago (`CLABE 7229 6901 3959 779869` · Karla Patricia Carrillo Rodríguez) con entrega por comprobante web o Instagram DM.
  - **Programa de fidelidad activo:** **Tarjeta de Sellos LAIKONA** (8 sellos → 50% de descuento; Sofía Ramírez tiene `6 / 8` sellos).
  - **Alerta de fuga sembrada:** Cita completada sin cobrar (`bk-1005` · Andrea López · Uñas acrílicas) visible en `/admin` y `/admin/caja?tab=sin-cobrar`.
  - **Cupones activos de prueba:** `BIENVENIDA10` (10% off, mínimo \$300 MXN, uso único por clienta) y `GIFT500` (\$500 MXN saldo, devuelto si se cancela la cita).
  - **Links mágicos demo sembrados:**
    - Cita próxima confirmada + tarjeta `6 / 8` sellos: `/cita/demo-token-sofia-1042` (`NL-1042`)
    - Cita pendiente con comprobante SPEI: `/cita/demo-token-andrea-1044` (`NL-1044`)
    - Cita completada con encuesta/reseña: `/cita/demo-token-paula-1039` (`NL-1039`)
  - **Usuarios admin demo:** `duena@nails.studio` (`owner`), `recepcion@nails.studio` (`admin`), `camila@nails.studio` (`specialist`).

---

## 1. Landing Brandeada (`/`) y SEO Local
- **Precondiciones:** Ninguna (acceso público).
- **Elementos clave y selectores:**
  - TopNav: `role="navigation"` (`Navegación principal del salón`), botones `Panel` (`/admin`), `Agendar cita` (`/reservar`), toggle modo claro/oscuro (`aria-label*="modo"`).
  - Hero: `h1` con `settings.landingContent.heroTitle` (`De tu idea a tus uñas.`), badge de marca LAIKONA NAILS, CTA `Agendar mi cita ahora` (`/reservar`) y enlace a `@laikona.nailsss`.
  - Catálogo `#servicios`: `TabList` (`Todos los servicios`, `Uñas & Esculturales`, `Gel & Retiro`, `Pies & PediSpa`), 9 tarjetas de servicio (indicador `Desde $...` cuando `isStartingPrice`) con botón `Reservar` (`/reservar/[slug]`).
  - Galería `#galeria`: `TabList` por categoría + 4 diseños + botones `Quiero este diseño` (`/reservar/[slug]?inspo=...`).
  - **SEO Local:** `<script type="application/ld+json">` de tipo `NailSalon` / `LocalBusiness` con `OfferCatalog` y `aggregateRating` (sin `commissionPercent`), `GET /sitemap.xml` (200 con `/`, `/reservar`, `/links`, `/aviso-de-privacidad`, y todos los `/reservar/[slug]`) y `GET /robots.txt` (200 bloqueando `/admin/`, `/api/`, `/cita/`).
- **Flujo de verificación:**
  1. Cambiar pestaña de categoría en Servicios -> actualiza la cantidad de tarjetas visibles.
  2. Alternar modo claro/oscuro -> el tema Astryx actualiza superficies sin FOUC.
  3. Clic en `Reservar` de `Rubber` -> navega a `/reservar/rubber`.

---

## 2. Bio-Link de Instagram (`/links`) y Aviso de Privacidad (`/aviso-de-privacidad`)
- **Bio-Link (`/links`):**
  - Muestra logo LAIKONA NAILS, `@laikona.nailsss`, ubicación `Puebla · @lumiere.beautymx`, chips de turnos fijos y anticipo `$200 MXN`, botones apilados a `/reservar`, `/#servicios`, `/#galeria`, WhatsApp, Instagram, Google Maps y `/aviso-de-privacidad`, más lista directa de servicios (sin `commissionPercent`).
- **Aviso de Privacidad LFPDPPP (`/aviso-de-privacidad`):**
  - Detalla Responsable (`LAIKONA NAILS / Karla Patricia Carrillo Rodríguez`), datos recabados, finalidades primarias vs. secundarias opcionales, tarjeta destacada de **Derechos ARCO** (acceso/descarga JSON, rectificación, cancelación, oposición, plazo 20 días hábiles) y versión vigente (`privacyPolicyVersion`, ej. `2026-11`).

---

## 3. Flujo de Reserva en Tiempo Real (`/reservar` y `/reservar/[slug]`)
- **Precondiciones:** Al menos 1 servicio activo y 1 especialista con horario configurado.
- **Query params soportados:** `?servicio=<slug>`, `?staff=<bookingSlug>`, `?inspo=<texto>`.
- **Selectores y controles clave:**
  - Paso 1 (Servicios y Extras): `SelectableCard` por servicio principal + combinación **multi-servicio** (`extraServiceIds`), `CheckboxInput` por extra (ej. `Retiro de gel o acrílico previo (+20 min · +$120)`), selector de especialista (**Karla**, **Paty**, **Tere** o *Sin preferencia*).
  - **Reseñas verificadas en `/reservar/[slug]`:** `ServiceReviewsSection` muestra reseñas verificadas (`PublicReviewDTO`: solo primer nombre, calificación y comentario, cero PII completo) filtradas por servicio (o promedio del estudio si el servicio aún no tiene reseñas).
  - Paso 2 (Agenda en vivo):
    - `SegmentedControl` `Formato de hora` (`12h` | `24h`) y `Vista de calendario` (`Mes` | `Semana` | `Columnas`).
    - En **Karla/Paty** muestra bloques fijos (`10:00 · 13:30 · 16:30`) y en **Tere** (`14:00 · 16:00 · 18:00`), respetando `recurringBlocks`.
    - Botón `Lista de espera` -> abre `Dialog` (`Lista de espera`) -> `POST /api/waitlist`.
  - Paso 3 (Confirmación, Anticipo SPEI y Consentimiento LFPDPPP):
    - Barra de progreso `Tiempo restante de apartado` + contador mm:ss (`POST /api/slot-holds`).
    - Datos de anticipo SPEI (`$200 MXN`, Mercado Pago, CLABE `7229 6901 3959 779869`) con selector de comprobante (`Subir comprobante aquí` o `Lo enviaré por DM a @laikona.nailsss`).
    - Inputs: `Nombre completo` (requerido), `WhatsApp (México +52)` (requerido), `Instagram (@usuario)`, `Correo electrónico`, `Fecha de cumpleaños`, `Notas sobre tu diseño o alergias`, `FileInput` (`Foto de inspiración`), `Cupón o Gift Card` + `Aplicar`.
    - **Consentimiento LFPDPPP obligatorio:** `CheckboxInput` `He leído y acepto el Aviso de Privacidad` (con enlace a `/aviso-de-privacidad`) + `CheckboxInput` opcional `marketingOptIn` (`Quiero recibir recordatorios y promociones exclusivas de LAIKONA NAILS`).
    - Botón submit (`POST /api/bookings` con `Idempotency-Key`).
- **Flujos críticos a verificar:**
  1. Enviar `POST /api/bookings` sin `privacyConsentAccepted: true` -> rechazado `400 PRIVACY_CONSENT_REQUIRED`.
  2. Exceder `maxActiveBookingsPerClient` con el mismo teléfono -> rechazado `409 MAX_ACTIVE_BOOKINGS` con mensaje claro.
  3. Combinar servicio + extra -> suma duración/precio y recalcula horarios disponibles en vivo.
  4. Seleccionar horario -> activa hold de **3 minutos** (`Horario apartado para ti`).
  5. Aplicar cupón `BIENVENIDA10` -> aplica descuento 10% (y bloquea doble uso por la misma clienta).
  6. Confirmar reserva -> redirige a `/cita/[manageToken]` y desaparece el horario en otras sesiones vía `/api/realtime`.
  7. Colisión concurrente (`409 SLOT_TAKEN`): muestra `Banner` amarillo con 3 horarios sugeridos clicables sin perder los datos del formulario.

---

## 4. Página Mágica de Clienta (`/cita/[token]`)
- **Precondiciones:** Token válido en `bookings.manageToken` (ej. `/cita/demo-token-sofia-1042`).
- **Controles clave:**
  - Badge de estado (`Confirmada`, `Pendiente de confirmación`, `Completada`, `Cancelada`, `No asistió`) y código `NL-xxxx`.
  - **Tarjeta Digital de Sellos Web/PWA (`LoyaltyStampCard`):** Visible sin descargar app; muestra nombre del programa (`Tarjeta de Sellos LAIKONA`), progreso (`6 de 8 sellos` en `/cita/demo-token-sofia-1042`), casillas numeradas, beneficio y estado (`¡Te faltan solo 2 visitas para tu premio!` o `¡Premio listo para canjear en tu próxima cita!`). Cero `commissionPercent` en el HTML.
  - Botones de calendario: `Google Calendar`, `Apple / iPhone (.ics)` (`/api/bookings/manage/[token]/ics`), `Outlook`, `Enviar por WhatsApp`.
  - Acciones activas: `Reagendar` (valida elegibilidad de especialista para todos los servicios + `recurringBlocks`, notifica al salón) y `Cancelar cita` (libera cupón/saldo Gift Card y notifica al salón).
  - Encuesta post-cita (`status === 'completed'`, ej. `/cita/demo-token-paula-1039`): botones `1 ★`..`5 ★` + comentario -> si calificación >= 4 muestra `Dejar reseña en Google`.
- **Verificación de política:**
  - Cancelar o reagendar dentro de las `minCancelHours` (12h) devuelve `400 POLICY_WINDOW` sin modificar la cita.

---

## 5. Acceso Admin (`/admin/login`), Onboarding (`/admin/onboarding`) y RBAC Multi-Rol
- **Precondiciones:** En modo demo inicia autenticado como `owner` salvo que se cierre sesión; el banner superior permite alternar entre `owner`, `admin` y `specialist`.
- **Onboarding (`/admin/onboarding`):** Asistente inicial de 4 pasos (perfil del estudio + Instagram, banco/CLABE de anticipo, equipo/horarios fijos y confirmación final) vinculado al checklist del dashboard.
- **Verificación RBAC:**
  - `owner`: acceso total incluyendo `Marca, QR y Políticas`, `Integraciones y WhatsApp`, creación de usuarios en `/admin/equipo`, anulación auditada de `lockPastBookings` y lectura de `recentAuditLogs`.
  - `admin`: gestiona Citas, Cobros, Servicios, Disponibilidad, Clientas (incluyendo descarga ARCO y filtro inverso), Caja, Inventario y Manicuristas; no puede modificar citas pasadas si `lockPastBookings` está activo (`403 PAST_BOOKING_LOCKED`) ni ver `recentAuditLogs`.
  - `specialist`: solo ve Inicio, sus propias Citas, su propia Disponibilidad/Bloqueos recurrentes y sus propias Comisiones/Caja; bloqueado en rutas ajenas (`403`).

---

## 6. Panel Admin — Módulos Críticos

| Ruta | Propósito | Acciones verificables clave |
| :--- | :--- | :--- |
| `/admin` | Resumen operativo y alertas | KPIs (`Citas hoy`, `Caja neta`, `Satisfacción`, `Alertas`), alerta roja de **Citas sin cobrar (Fuga de ingresos)** (`uncollectedBookings` -> `/admin/caja?tab=sin-cobrar`), alerta de **Clientas cerca de su premio** (`nearRewardClients` -> `/admin/clientas`), anticipos SPEI pendientes y checklist hacia `/admin/onboarding`. |
| `/admin/onboarding` | Asistente inicial del salón | Configura nombre, ubicación, `@instagram`, banco/CLABE `$200 MXN` y marca `onboardingCompleted: true`. |
| `/admin/citas` | Agenda visual, búsqueda rápida y cobro | Vista visual por especialista (muestra `recurringBlocks`), clic en bloque abre **Popover rápido** (`BookingQuickPopover`: `@instagram`, transiciones válidas, WhatsApp, recordatorio, `$ Cobrar`, `Ver ficha` -> `/admin/clientas?q=<tel>`). Botón **`Búsqueda rápida de hora`** (`GET /api/availability?mode=quick_search`) abre nueva cita prellenada. **Drawer de Cobro Dividido** (`CheckoutDrawerDialog`, también vía `?collect=<bookingId>`): resta anticipo previo, permite múltiples métodos de pago + propina universal por especialista + extra rápido + canje de premio de sellos, otorga sello del día y ofrece botón 1 clic **`Agendar siguiente retoque (+21 días)`**. Maneja `403 PAST_BOOKING_LOCKED`. |
| `/admin/servicios` | Catálogo + Preview en vivo | Pestañas `Servicios` y `Extras / Add-ons`; soporte de `isStartingPrice` (`Desde $...`); editar actualiza `VISTA PREVIA EN VIVO`; `Copiar link` copia `/reservar/[slug]`. |
| `/admin/disponibilidad` | Turnos fijos, bloqueos recurrentes y diagnóstico | Edición de **horarios fijos** (`10:00 · 13:30 · 16:30` / `14:00 · 16:00 · 18:00`), pestaña **`Bloqueos recurrentes`** (crear bloqueos semanales/mensuales con `untilDate`, pausar/reanudar y eliminar vía `/api/admin/availability`), pestaña `Excepciones y vacaciones` y `Diagnóstico (Troubleshooter)` (`GET /api/admin/availability?mode=diagnose`). |
| `/admin/equipo` | Manicuristas + Admins RBAC | Agregar manicurista con % de comisión y servicios asignados; invitar/administrar usuarios del panel (`owner` únicamente). |
| `/admin/clientas` | CRM, Filtro inverso, Sellos y ARCO | Directorio A–Z con búsqueda (`?q=<phone>` prefiltra automáticamente desde `/admin/citas`) y `@instagram`. Pestaña **Retención** con **Filtro inverso *"Sin reserva en los últimos N días"*** (`21 días · Retoque`, `30 días`, `45 días · Reactivación`, `60 días` vía `GET /api/admin/clients?inactiveDays=N`) + botón 1 clic **`Enviar mensaje de regreso (WhatsApp)`**. Panel **`Clientas cerca de su premio`** (`6 / 8 sellos` + WhatsApp). Diálogo **Ficha**: muestra sellos de fidelidad (`currentStamps / stampsRequired`) y botón **`Descargar datos (ARCO)`** (`owner`/`admin` -> `arco-<id>.json`). |
| `/admin/caja` | Fuga de ingresos, Pagos divididos, Arqueo y Cupones | Alerta prominente **`Citas sin cobrar` (Fuga de ingresos)** (`uncollectedBookings`, soporta `?tab=sin-cobrar`) con total vs. pagado vs. saldo restante y botón 1 clic **`Ir a cobrar`** (`/admin/citas?collect=<bookingId>`). Desglose de **pagos divididos** (`paymentSplits`) y **propinas universales por especialista** en Ventas y Comisiones. Validación 1 clic de anticipos SPEI (`?tab=anticipos`), arqueo de efectivo, registro de egresos, `Exportar reporte CSV` (registra `csv_exported` en auditoría) y Cupones/Gift Cards. |
| `/admin/inventario` | Stock y alertas | Alertas de stock bajo, botones `+1 Entrada`, `-1 Consumo` y `Vender (Caja)` (descuenta inventario y suma a Caja automáticamente). |
| `/admin/marca` | Marca, QR SVG, Fidelidad, Políticas y Auditoría | Presets de tema Astryx en vivo, **Generador de QR SVG descargable** (`QrShareCard` usando `src/lib/qr.ts` para `/reservar` y `/links`), configuración de **Tarjeta de Sellos LAIKONA**, políticas operativas (`lockPastBookings`, `maxActiveBookingsPerClient`, `privacyPolicyVersion`) y tabla de **Registro de Auditoría** (`recentAuditLogs`, visible únicamente para `owner`). |
| `/admin/integraciones` | Calendar, WhatsApp, SMS, Analytics y Pagos | Toggle Google Calendar (destino + conflictos), simulador WhatsApp (`POST /api/webhooks/whatsapp`), switches de workflows (`Correo`, `WhatsApp`, `SMS Twilio`), `Meta Pixel ID` / `GA4` / `Google Review URL` y selector `paymentMode`. |

---

## Gatekeeper Único de Verificación
Antes de dar cualquier cambio por terminado debe pasar en verde con **0 errores y 0 warnings**:
```bash
npm run verify
```
Que ejecuta secuencialmente:
`typecheck` -> `guardrails` (self-test + AST + seed parity + `oxlint --deny-warnings`) -> `deadcode` (`knip`) -> `test` (unitarios + concurrencia + seguridad + `fast-check` property tests) -> `build` (`next build`) -> `doctor` (`astryx doctor --built .next`).
