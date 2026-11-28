# Feature Map & Verification Guide — LAIKONA NAILS

Mapa determinista de rutas, precondiciones, selectores accesibles y flujos críticos para verificar **LAIKONA NAILS BY KARLA** en navegador/CDP sin adivinanzas.

---

## Precondiciones Generales
- Servidor corriendo:
  - Desarrollo local Demo: `npm run dev` (puerto `1717` o `3000`; `CLOUDFLARE_DEV=1 npm run dev` habilita bindings locales de Wrangler en `next dev`).
  - Producción Node local: `npm run build && npm run start` en `http://localhost:3000`.
  - **Preview local Cloudflare Workers (`workerd`):** `npm run cf:build && npm run cf:preview` (puerto `8787`, ejecutando `worker.ts` + `.open-next/worker.js` + binding local `SALON_MEDIA_BUCKET`). Ver runbook completo en [`docs/deploy-cloudflare-supabase.md`](./deploy-cloudflare-supabase.md).
- **Modo Demo Local** (sin variables de Supabase en `.env.local`):
  - Base persistente en `.nails-demo-db.json` (borrar el archivo regenera datos limpios de fábrica de **LAIKONA NAILS**, incluyendo los paquetes de sesiones, cumpleaños y cohortes de Wave 2).
  - **Identidad sembrada:** `LAIKONA NAILS` (`by Karla · Manicure y nail art en Puebla`), `@laikona.nailsss`, dirección `Calle 25 Sur 1904, Col. Volcanes, 72410 Puebla, Pue.`.
  - **Especialistas y turnos fijos:**
    - **Karla** (`karla`): `10:00 · 13:30 · 16:30` (L–S) + bloqueo recurrente semanal `12:30–13:15` (`Comida y esterilización de instrumental`).
    - **Paty** (`paty`): `10:00 · 13:30 · 16:30` (L–S).
    - **Tere** (`tere`): `14:00 · 16:00 · 18:00` (L–S).
  - **Catálogo sembrado:** 9 servicios en 3 categorías (`Uñas & Esculturales`, `Gel & Retiro`, `Pies & PediSpa`), 5 extras y anticipo SPEI de **\$200 MXN** a Mercado Pago (`CLABE 7229 6901 3959 779869` · Karla Patricia Carrillo Rodríguez) con entrega por comprobante web o Instagram DM.
  - **Programa de fidelidad y paquetes sembrados:**
    - **Tarjeta de Sellos LAIKONA** (8 sellos → 50% de descuento; Sofía Ramírez `+522224123987` tiene `6 / 8` sellos y cumpleaños próximo en `+3 días`).
    - **Catálogo de paquetes de sesiones:** `Paquete 4 sesiones Rubber` (`pkg-rubber-4`, `$1,200 MXN`, 180 días) y `Paquete 5 sesiones Gel Manos` (`pkg-gel-5`, `$650 MXN`, 180 días).
    - **Paquete activo de clienta:** Sofía Ramírez tiene `cpkg-sofia-1` (`Paquete 4 sesiones Rubber`, `1 / 4` usadas, `3` disponibles).
  - **Inasistencias y reactivación sembradas:** **Valeria Mendoza** (`client-valeria`, `+522227711223`) tiene `noShowCount: 2` (activa la política automática de anticipo con umbral default `2`) y última cita hace `-52 días` (aparece en la cola de reactivación `45+ días`).
  - **Alerta de fuga sembrada:** Cita completada sin cobrar (`bk-1005` · Andrea López · Uñas acrílicas) visible en `/admin` y `/admin/caja?tab=sin-cobrar`.
  - **Cupones activos de prueba:** `BIENVENIDA10` (10% off, mínimo \$300 MXN, uso único por clienta) y `GIFT500` (\$500 MXN saldo, devuelto si se cancela la cita).
  - **Links mágicos demo sembrados:**
    - Cita próxima confirmada + tarjeta `6 / 8` sellos: `/cita/demo-token-sofia-1042` (`NL-1042`)
    - Cita pendiente con comprobante SPEI: `/cita/demo-token-andrea-1044` (`NL-1044`)
    - Cita completada con encuesta/reseña: `/cita/demo-token-paula-1039` (`NL-1039`)
  - **Portal de clientas demo:** `/mis-citas` con WhatsApp `222 412 3987` (Sofía Ramírez, botón `Usar teléfono demo (Sofía)` y código OTP visible únicamente en entorno demo local).
  - **Usuarios admin demo:** `duena@nails.studio` (`owner`), `recepcion@nails.studio` (`admin`), `camila@nails.studio` (`specialist` → `Tere`).
  - **Centro de WhatsApp y recordatorios sembrados:** 8 flujos de automatización, 5 hilos realistas (`wth-sofia` con ventana 24 h abierta y 1 sin leer, `wth-mariana` con eco Coexistence desde celular, `wth-andrea` con ventana cerrada + mensaje fallido + recordatorio 24 h pendiente, `wth-paula` completada + retoque futuro a 18 días, `wth-valeria` cerrada solo plantillas), 11 mensajes y 7 notificaciones programadas (`ntf-1..7`).

---

## 1. Landing Brandeada (`/`) y SEO Local
- **Precondiciones:** Ninguna (acceso público).
- **Elementos clave y selectores:**
  - Landing propia sin `PublicShell` (`LandingView` + `src/components/landing/*`, estilos `lk-*` en `src/app/globals.css`, recursos en `public/landing/`). Siempre en modo claro (`color-scheme: light` en `.lk-root`).
  - Franja de avisos animada (anticipo, reagendar 12 h, solo con cita) con `aria-label` completo.
  - Nav `role="navigation"` (`Principal`) integrada en el hero: `data-floating="false"` arriba; al pasar 80 px de scroll cambia a `data-floating="true"` (cápsula esmerilada con logo negro). Enlaces `#servicios`, `#galeria`, `#equipo`, `#visitanos`, `Mis citas` (`/mis-citas`) y botón `Agendar` (`/reservar`). En móvil (< 760 px) los enlaces se ocultan y `Abrir menú` abre un `Dialog` a pantalla completa en cereza.
  - Hero `#inicio`: `h1` `El arte está en tus uñas`, CTAs `Agendar cita` (`/reservar`) y `Ver creaciones` (`#galeria`), calificación de Google si hay reseñas.
  - Menú `#servicios`: `TabList` (`Uñas & Esculturales`, `Gel & Retiro`, `Pies & PediSpa`, `Arte y acabados`). Cada servicio es un enlace a `/reservar/[slug]` con foto, precio (`Desde $...` cuando `isStartingPrice`) y duración. `Arte y acabados` lista los extras activos con icono y las formas de uña.
  - Creaciones `#galeria` (fondo cereza): mosaico de 11 fotos; `Ver más creaciones` (`aria-expanded`) muestra 22.
  - Reseñas: resumen `EXCELENTE · promedio · N reseñas` + `Carousel` de reseñas verificadas (`PublicReviewDTO`, solo primer nombre, citas `completed` con comentario).
  - Equipo `#equipo` (fondo cereza): un botón por especialista (`aria-haspopup="dialog"`) abre un `Dialog` con pestañas `Perfil`, `Servicios` (botón `Reservar` → `/reservar/[slug]?staff=<slug>`) y `Portafolio`, más `Reservar con <nombre>` (`/reservar?staff=<slug>`).
  - Conectemos: tarjeta central a `@laikona.nailsss` y cuatro fotos inclinadas.
  - Preguntas frecuentes `#preguntas` (`LandingFaq`): acordeón accesible (`CollapsibleGroup`) con 6 preguntas sincronizadas con `buildSalonFaqs(settings)` (anticipo SPEI, ventana de reagendado, retoque a 21 días, ubicación en Puebla, extras y Tarjeta de Sellos) + CTAs a `/reservar` y WhatsApp.
  - Visítanos `#visitanos`: dirección, horario y contacto + `iframe` de Google Maps (`sandbox`, permitido por `frame-src https://www.google.com https://maps.google.com` en la CSP).
  - Footer cereza: logo, `Agendar cita`, WhatsApp, columnas Explora/Dirección/Horario/Síguenos y enlaces a `/mis-citas`, `/aviso-de-privacidad` y `/links`.
  - **SEO Local, Social Cards e Indexación:**
    - `metadataBase` resuelto centralmente con `getSiteMetadataBase()` / `getSiteOrigin()` (`src/lib/seo/site-url.ts`, filtrando hosts loopback para que jamás aparezca `http://localhost:3000`).
    - Tarjetas sociales dinámicas `1200×630` PNG (`next/og`): `GET /opengraph-image` y `GET /twitter-image` en `/`, más `GET /reservar/[slug]/opengraph-image` y `GET /reservar/[slug]/twitter-image` con precio/duración por servicio público (si el servicio es `isPrivate: true` o no existe, sirve tarjeta genérica sin filtrar datos privados).
    - JSON-LD en `/` (`buildHomeStructuredData`): `@graph` con `["NailSalon", "BeautySalon"]` (`OfferCatalog` excluyendo `isPrivate: true`, `aggregateRating`, `OpeningHoursSpecification`, `GeoCoordinates` en Puebla), `WebSite`, y `FAQPage` (`/#preguntas`), sin `commissionPercent`.
    - JSON-LD en `/reservar` (`BreadcrumbList`) y `/reservar/[slug]` (`Service` + `Offer` + `BreadcrumbList`, omitido si `isPrivate: true`).
    - `GET /sitemap.xml` (200 sin `localhost`, con `/`, `/reservar`, `/links`, `/aviso-de-privacidad` y únicamente `/reservar/[slug]` públicos) y `GET /robots.txt` (200 sin `localhost`, bloqueando `/admin`, `/admin/`, `/api/`, `/cita/`, `/mis-citas`).
    - `robots: noindex, nofollow` explícito en `/admin/*` (vía `src/app/admin/layout.tsx`), `/cita/[token]`, `/mis-citas` y servicios privados `/reservar/[slug]`.
- **Flujo de verificación:**
  1. Cambiar pestaña de categoría en Servicios -> actualiza la cantidad de tarjetas visibles (servicios VIP `isPrivate: true` nunca aparecen aquí ni en `/links` ni en `/api/public/bootstrap`).
  2. Bajar más de 80 px -> la nav pasa a `data-floating="true"`; en 375 px de ancho, `Abrir menú` abre el panel y `Cerrar menú` lo cierra.
  3. Clic en la tarjeta `Rubber` -> navega a `/reservar/rubber`.
  4. Clic en `Karla` -> abre el diálogo; la pestaña `Servicios` lista sus servicios con `Reservar`.

---

## 2. Bio-Link de Instagram (`/links`) y Aviso de Privacidad (`/aviso-de-privacidad`)
- **Bio-Link (`/links`):**
  - Muestra logo LAIKONA NAILS, `@laikona.nailsss`, dirección desde `settings.address`, chips de turnos fijos y anticipo `$200 MXN`, botones apilados a `/reservar`, `/mis-citas` (`Mis citas`), `/#servicios`, `/#galeria`, WhatsApp, Instagram, Google Maps y `/aviso-de-privacidad`, más lista directa de servicios públicos (excluyendo `isPrivate: true`, sin `commissionPercent`).
- **Aviso de Privacidad LFPDPPP (`/aviso-de-privacidad`):**
  - Detalla Responsable comercial (`LAIKONA NAILS`, sin exponer datos personales de la dueña), datos recabados, finalidades primarias vs. secundarias opcionales, tarjeta destacada de **Derechos ARCO** (acceso/descarga JSON, rectificación, cancelación, oposición, plazo 20 días hábiles) y versión vigente (`privacyPolicyVersion`, ej. `2026-11`).

---

## 3. Flujo de Reserva en Tiempo Real (`/reservar`, `/reservar/[slug]` y `/reservar?embed=1`)
- **Precondiciones:** Al menos 1 servicio activo y 1 especialista con horario configurado.
- **Carga pública puntual sin `getSnapshot()` (`ADR-0001`):** `/reservar`, `/reservar/[slug]`, `/reservar/[slug]/opengraph-image`, `/links` y `/sitemap.xml` consumen únicamente catálogo público cacheado por request (`getCachedPublicBootstrap` + `getCachedPublicServiceBySlug` con `React.cache()` en `src/lib/public/bootstrap.ts`), reseñas puntuales (`getPublicReviewsForService`) y perfil puntual de clienta autenticada (`readSignedInClientProfile` → `getClientPortalRecordByPhone`, `0` consultas si no hay sesión).
- **Estado bidireccional en URL e historial real (`A2`, `A3`, `B7`, `C2` — `useBookingUrlSync`):**
  - Parámetros soportados: `?servicio=<slug>`, `?extras=<s1,s2>`, `?addons=<a1,a2>`, `?staff=<bookingSlug>`, `?date=YYYY-MM-DD`, `?layout=week|month` (`column` aceptado como `week`), `?slot=<iso>`, `?offer=<waitlistOfferToken>`, `?paso=horario|profesional|datos` (`servicio` omitido; `anticipo`/`payment` aceptados como alias retrocompatibles hacia `datos`), `?inspo=<texto>`, `?embed=1`.
  - **Sin preselección forzada en `/reservar` (`B7`):** abrir `/reservar` sin servicio inicia sin servicio marcado y sin escribir `?servicio=` en la URL; el resumen muestra `"Elige un servicio"` y `Continuar` permanece deshabilitado hasta elegir uno. `/reservar/[slug]` y `/reservar?servicio=<slug>` sí preseleccionan ese servicio.
  - **Botón Atrás dentro del flujo (`A3`):** los avances de paso emiten `history.pushState` con `?paso=` y `useBookingUrlSync` escucha `popstate` (recortando con `clampBookingStep` si falta horario), de modo que el botón Atrás del navegador/celular regresa al paso anterior sin sacar a la clienta al landing.
  - **Auto-apartado con `?slot=` y oferta prioritaria `?offer=` (`A2`):** abrir `/reservar/<slug>?date=...&slot=...&offer=...` (lista de espera con prioridad `WAITLIST_OFFER_TTL_MINUTES` = 30 min) consulta `GET /api/availability?offer=<token>`, auto-aparta el horario vía `POST /api/slot-holds` (pasando `waitlistOfferToken`) y aterriza directamente en `Profesional` o `Tus datos y apartar`. Si el horario ya se ocupó, muestra `BookingConflictBanner` desplegado con hasta 3 horarios sugeridos.
- **Persistencia de borrador en `sessionStorage` (`useBookingDraft`) y aviso único superior (`B8`):**
  - Guarda selecciones y datos del formulario en `laikona_booking_draft_v1` (TTL 24 h, texto sanitizado, sin almacenar data URIs de fotos y migrando borradores previos con `step: 'payment'` a `'details'`). Al volver con avance previo muestra el `Banner` **`Seguimos donde te quedaste`** con botón **`Empezar de nuevo`**, y limpia el borrador al confirmar la cita.
  - Un único aviso superior con prioridad estricta **`offer > draft > repeat`** (`resolveTopBookingNotice`) impide apilar múltiples avisos encima del paso.
- **Recuperación 4G y errores de apartado sin avance silencioso (`A1` — `bookingApi.ts`, `BookingConflictBanner`):**
  - Si falla la carga de horarios por señal inestable, `ScheduleStep` muestra un `Banner` (`role="alert"`) con botón **`Reintentar`** y estado `isRevalidating` sin perder el avance.
  - `requestSlotHold` retorna la unión discriminada `held | conflict | rate_limited | policy | unavailable` (timeout 15 s y lectura de `Retry-After`). Solo `held` (o ausencia de hold si `enableSlotHold` está apagado) avanza; ante `429`, `400`, `500` o falla de red permanece en `Fecha y hora` mostrando `BookingConflictBanner` desplegado (`collapsible={false}`) con botón **`Reintentar`**.
- **Modo Embebido Compacto (`/reservar?embed=1` y `/reservar/[slug]?embed=1`):**
  - Aplica `.rb-embed`, oculta el encabezado externo del sitio (`BookingHeader`) manteniendo marca, stepper, disponibilidad real y políticas de anticipo.
  - Cabeceras HTTP (`next.config.ts`): únicamente `/reservar` y `/reservar/:path*` **con `?embed=1`** envían `Content-Security-Policy: ... frame-ancestors *` sin `X-Frame-Options`; cualquier otra ruta (incluyendo `/reservar` sin `embed=1`, `/admin/*`, `/cita/*`, `/mis-citas` y `/api/*`) mantiene `X-Frame-Options: DENY` y `frame-ancestors 'none'`.
- **Servicios VIP Privados (`C9`) y Datos Estructurados:** Un servicio con `isPrivate: true` se oculta de `/`, `/reservar`, `/links`, `/sitemap.xml` y `/api/public/bootstrap`, pero sigue siendo accesible y reservable vía enlace directo `/reservar/[slug]` (con `robots: noindex, nofollow`, tarjeta OG genérica y sin JSON-LD de servicio). Los servicios públicos en `/reservar/[slug]` emiten JSON-LD `Service` + `Offer` + `BreadcrumbList` y tarjeta social dinámica `/reservar/[slug]/opengraph-image`.
- **Contenedor en 4 pasos (`BookingWidget` + `bookingMachine`, `B4`/`B5`, `ADR-0009`):** 4 pasos: **`Servicios → Fecha y hora → Profesional → Tus datos y apartar`** (o 3 pasos cuando una sola especialista está libre para el horario elegido y `Profesional` se omite automáticamente, `B1`). Sin menú flotante del landing: encabezado propio (`Atrás`/`Inicio`, logo, contador de apartado de 5 min `role="timer"` y `Ayuda` por WhatsApp). Banda cereza `Reserva tu cita` con stepper de 4 pasos (`aria-current="step"`, deshabilitando `Profesional` si fue omitido) en escritorio y barra de progreso compacta en móvil (`< 760 px`). Escritorio: panel blanco + resumen cereza fijo (`aside` `Tu cita` con `"Te atiende <Nombre>"` y botón 1 toque **`Cambiar horario`**). Móvil: barra inferior fija (`.rb-bottom`) con total, `Ver resumen` (`BottomSheet`) y botón principal, más franja superior rápida con `"Te atiende <Nombre>"` y **`Cambiar horario`**.
- **Selectores y controles clave:**
  - Paso 1 `Servicios`: pestañas por categoría (`role="tab"`), servicios como botones `aria-pressed` con foto, duración y precio. En bare `/reservar` arranca sin selección (`B7`); al elegir servicio aparece la sección opcional colapsable **`Extras y nail art`** (`ServiceExtrasSection`) con `Nail art y acabados` y `Servicios adicionales` (`aria-pressed`, multi-servicio `extraServiceIds`).
  - **Reseñas verificadas en `/reservar/[slug]`:** `ServiceReviewsSection` muestra reseñas verificadas (`PublicReviewDTO`: solo primer nombre, calificación y comentario, cero PII completo) filtradas por servicio (o promedio del estudio si el servicio aún no tiene reseñas).
  - Paso 2 `Fecha y hora` (horario antes que profesional, `B2`/`B3`/`C2`):
    - Consulta disponibilidad de **todo el equipo** (`staffId` vacío) salvo que llegue `?staff=<slug>` (enlace `Reservar con <nombre>`): entonces muestra `Estás viendo solo los horarios de <nombre>` + `Ver todo el equipo`.
    - Cada horario muestra cuántas profesionales están libres (`AvailableSlot.availableStaffIds`).
    - **Vista Semana (`Semana`) y Mes (`Mes`):** `ScheduleCalendarView` soporta la tira semanal compacta de 7 días y el calendario mensual completo respetando `defaultBookingLayout`, `enabledBookingLayouts` y `?layout=`, con botón **`Ver mes` / `Ver semana`** cuando ambas vistas están activas. En móvil (`<= 640 px`, `375×812`) arranca en la tira semanal y oculta el selector `12h/24h` para que el **primer horario libre aparezca por encima de la barra fija sin scroll**.
    - **Ausencias OOO y día lleno (`C2`/`C7`):** muestra `publicNote` y botón hacia `redirectStaffId`; si un día no tiene huecos, `Ir al <día>` con el siguiente día con lugar o `Lista de espera` (`POST /api/waitlist`).
    - **Elegir horario aparta y avanza automáticamente (`B2`):** clic en un horario ejecuta `POST /api/slot-holds` (usando únicamente la cookie `HttpOnly` `nails_client_session` como `sessionToken`, `C4`; protege contra doble clic mostrando `"Apartando…"`). Si hay `> 1` especialista libre avanza a `Profesional`; si solo `1` está libre (o hay `?staff=` fijo) asigna esa especialista automáticamente y salta directo a `Tus datos y apartar` (`B1`).
  - Paso 3 `Profesional` (solo cuando hay `> 1` especialista libre): muestra el temporizador **`Horario apartado · M:SS`** (`A6`), `Cualquier profesional` (preseleccionado) + especialistas elegibles; las ocupadas a esa hora salen deshabilitadas. Elegir otra profesional renueva el apartado sobre el mismo `startAt` con su `staffId`; si ya no está libre conserva el apartado original y permite elegir otra.
  - Paso 4 `Tus datos y apartar` (`B4`/`B5`/`B6`/`A7`/`A8`):
    - Enlace discreto arriba del nombre **`¿Ya viniste? Llena tus datos con WhatsApp`** (`B6`, abre `ClientSignInDialog` por WhatsApp OTP; si ya inició sesión muestra ficha compacta con `Editar mis datos` / `Salir`).
    - Solo `Nombre completo` (2 palabras) y `Tu WhatsApp` (`+52`, 10 dígitos) son obligatorios; los errores aparecen en cada campo con enfoque automático al intentar continuar.
    - Secciones opcionales colapsables `Agrega más (opcional)` (Instagram, correo y cumpleaños) y **`Diseño para {profesional}`** (`DesignDetailsSection`: foto de inspiración y descripción del diseño, desplegada automáticamente si viene `?inspo=` o borrador con notas).
    - **Consentimiento LFPDPPP obligatorio (`A7`):** `#rb-privacy-consent` (`Acepto el Aviso de Privacidad` + enlace y `marketingOptIn` opcional) ubicado arriba de `DepositCard`, con `scrollIntoView({ block: 'center' })` al enfocar error para quedar siempre visible encima de la barra fija tanto en `1280×800` como en `375×812`.
    - **Aviso compacto de anticipo (`DepositCard`) y cupones (`CouponRedeemBox`):** cuando aplica anticipo muestra el monto configurado (`depositAmountCents` sin respaldo fijo `20000`, `A8`) indicando que los datos SPEI/CLABE y el espacio para subir comprobante aparecen en `/cita/[token]` al apartar; incluye cupón o tarjeta de regalo (`Collapsible`) y aviso informativo si aplica política automática por inasistencias (`noShowDepositThreshold`).
    - **`Apartar mi cita`** (o `Confirmar cita` si no requiere anticipo ni confirmación; `type="submit"`, `form` asociado): envía `POST /api/bookings` con `proofDeliveryMethod: 'none'`, `Idempotency-Key` y cookie `HttpOnly` (validación previa sin huérfanos en R2 ante `409` o reintento idempotente, `A9`), protegido con rate limiting `429 RATE_LIMITED`, y redirige directo a `/cita/[manageToken]`.
- **Flujos críticos a verificar:**
  1. Abrir `/reservar` sin parámetros -> inicia sin servicio preseleccionado, sin `?servicio=` en URL y `Continuar` deshabilitado hasta elegir servicio (`B7`).
  2. En `375×812` en `/reservar/rubber` -> en `Fecha y hora`, el primer horario libre aparece encima de `.rb-bottom` sin scroll y `Ver mes` alterna al calendario mensual (`B3`/`C2`).
  3. Interceptar `POST /api/slot-holds` con `429` -> permanece en `Fecha y hora` con banner visible y botón `Reintentar` (`A1`).
  4. Seleccionar horario -> activa hold de **5 minutos** (`slotHoldMinutes`), avanza automáticamente (`B2`), salta `Profesional` cuando solo `1` especialista está libre mostrando `"Te atiende <Nombre>"` (`B1`), y `Atrás` del navegador regresa al paso previo dentro de `/reservar` (`A3`).
  5. Abrir enlace con `?date=...&slot=...&offer=...` -> auto-aparta el horario de lista de espera y aterriza después de `Fecha y hora` (`A2`); si el hueco ya no existe muestra sugerencias.
  6. Enviar `POST /api/bookings` sin `privacyConsentAccepted: true` -> rechazado `400 PRIVACY_CONSENT_REQUIRED`; exceder `maxActiveBookingsPerClient` -> `409 MAX_ACTIVE_BOOKINGS` con `activeBookings[]` del teléfono; colisión `409 SLOT_TAKEN` o reintento idempotente -> `0` archivos huérfanos en R2 (`A9`).
  7. Confirmar reserva en 4 pasos (o 3 con 1 especialista) -> redirige a `/cita/[manageToken]` donde se muestran CLABE SPEI y subida de comprobante (`CitaDepositSection`), y el horario desaparece en otras sesiones vía `/api/realtime`.

---

## 4. Página Mágica de Clienta (`/cita/[token]`)
- **Precondiciones:** Token válido en `bookings.manageToken` (ej. `/cita/demo-token-sofia-1042`, `/cita/demo-token-andrea-1044`, `/cita/demo-token-paula-1039` o una cita recién creada en `/reservar`).
- **Diseño y estructura (`ManageBookingView` + `src/components/cita/*` + estilos `ck-*` y `rb-*` en `src/app/globals.css`, sin `PublicShell`):**
  - Mismo encabezado (`BookingHeader`: `Inicio`, logo negro, `Ayuda` por WhatsApp; sin barra de progreso ni temporizador) y banda cereza (`CitaHero`: trazo porcelana, cerezas, ola SVG; sin stepper).
  - Título dinámico según estado (`Cita confirmada` cuando `confirmed`, `¡Tu cita está apartada!` cuando `pending_confirmation` / `pending_payment`, `¡Gracias por visitarnos!` cuando `completed`, `Cita cancelada` cuando `canceled`) + píldora de estado y código copiable (`NL-xxxx`).
  - Indicador inline `.pt-offline-pill` cuando el navegador pierde conexión (respaldado por `/sw.js`), aviso informativo cuando `noShowPolicyEnforced` aplica, y enlace directo a `/mis-citas`.
  - **Diseño responsivo (`47.5rem`):** En escritorio (`1280px`), dos columnas (`.ck-layout`): detalle y acciones a la izquierda y tarjeta cereza fija (`BookingSummaryCard` `Tu cita`, `sticky`) a la derecha con servicio y extras, fecha y hora, artista, duración, total, descuento y anticipo. En móvil (`375px`), una sola columna sin scroll horizontal con la tarjeta `Tu cita` visible arriba.
- **Controles clave:**
  - **Anticipo y comprobante (`CitaDepositSection`):** Cuando la cita está en `pending_confirmation` o `pending_payment` y falta el comprobante, muestra anticipo (`$200`), SPEI con **CLABE copiable con un toque** (`.rb-clabe`), selector `Lo subo aquí` (`FileInput` PNG/JPG/WEBP ≤ 2.5 MB -> `PATCH /api/bookings/manage/[token]` con `action: 'upload_proof'`) o `Lo mando por DM a @laikona.nailsss` (abrir Instagram + copiar resumen con código), además de botón `Pagar anticipo con Mercado Pago` cuando exista `checkoutUrl`. Si el comprobante ya fue recibido, muestra `Comprobante recibido · En revisión` y opción desplegable para reemplazarlo.
  - **Calendario, WhatsApp y Retoque (`CitaActionsPanel`):** `Google Calendar`, `Apple / iPhone (.ics)` (`/api/bookings/manage/[token]/ics`), `Outlook`, `Enviar por WhatsApp`, y botón 1 clic **`Agendar siguiente retoque (+21 días)`** prellenado con servicio, especialista y fecha sugerida (`buildTouchUpBookingUrl`).
  - **Ubicación y detalles:** Dirección tomada de `settings.address` (`Calle 25 Sur 1904, Col. Volcanes, 72410 Puebla, Pue.`), indicaciones de llegada, botón `Abrir en Google Maps`, `WhatsApp del salón`, datos de clienta, notas y foto de inspiración si existe.
  - **Código QR de la cita:** QR SVG escaneable del enlace personal `/cita/[token]` con `Copiar enlace` y `Descargar QR`.
  - **Cambios y auto-apertura (`C6`):** `Reagendar` (valida elegibilidad de especialista para todos los servicios + `recurringBlocks`, actualiza links de calendario/WhatsApp y notifica al salón) y `Cancelar cita` (libera cupón/saldo Gift Card y notifica al salón). Abrir `/cita/[token]?action=reschedule` en una cita activa abre automáticamente el diálogo de reprogramación.
  - **Tarjeta Digital de Sellos Web/PWA (`LoyaltyStampCard`):** Visible sin descargar app; muestra nombre del programa (`Tarjeta de Sellos LAIKONA`), progreso (`6 de 8 sellos` en `/cita/demo-token-sofia-1042`), casillas numeradas, beneficio y estado. Cero `commissionPercent` en el HTML.
  - **Encuesta post-cita (`CitaReviewCard`, cuando `status === 'completed'`, ej. `/cita/demo-token-paula-1039`):** botones `1 ★`..`5 ★` + comentario -> si calificación >= 4 muestra `Dejar reseña en Google`.
- **Verificación de política y responsive:**
  - Cancelar o reagendar dentro de las `minCancelHours` (12 h) devuelve `400 POLICY_WINDOW` sin modificar la cita.
  - Verificar en navegador a `375px` (sin scroll horizontal) y `1280px` (resumen cereza `sticky` a la derecha) tras crear una reserva real en `/reservar`.

---

## 5. Portal de Clientas con OTP (`/mis-citas`) y PWA Offline (`/sw.js`)
- **Precondiciones:** Acceso público en `/mis-citas`; para probar el flujo autenticado en modo demo local usar `222 412 3987` (Sofía Ramírez, botón `Usar teléfono demo (Sofía)`). En producción (`NODE_ENV=production`) la API **nunca** devuelve `demoCode` y falla cerrado (`503 PORTAL_UNCONFIGURED`) si falta `CLIENT_SESSION_SECRET`/`ADMIN_SESSION_SECRET`.
- **Elementos clave y selectores (`/mis-citas` — `ClientPortalView`, estilos `pt-*`):**
  - Encabezado `h1` `Mis citas`, tarjeta de acceso (`.pt-card`) con título `Accede con tu WhatsApp`, campo `Tu WhatsApp` (`+52`), botón `Enviar código de verificación` (`POST /api/client-portal/otp` con `{ action: 'request', phone }`, protegido con rate limiting).
  - Paso de código (`Ingresa tu código`): cuadrícula accesible de 6 dígitos (`.pt-otp-grid`, `role="group"`, `Dígito 1 de 6`..`Dígito 6 de 6`, soporte de pegado completo), banner `Código de prueba local: XXXXXX` + `Rellenar código demo` solo en modo demo local, botón `Verificar y entrar` (`POST /api/client-portal/otp` con `{ action: 'verify', phone, code }` -> emite cookie `httpOnly` `nails_client_portal`, TTL 7 días, máx. 5 intentos, TTL OTP 5 min).
  - Vista autenticada (`Hola, <nombre>`): acciones `Agendar nueva cita`, `Actualizar` y `Cerrar sesión` (`DELETE /api/client-portal/otp`), y `role="tablist"` con 3 pestañas:
    1. **`Próximas`:** filas `.pt-booking-row` con servicio, estado, código (`NL-1042`), fecha/hora/artista y botones `Ver mi cita` (`/cita/[token]`) y `Reagendar` (`/cita/[token]?action=reschedule`).
    2. **`Historial`:** visitas completadas/canceladas/inasistencias ordenadas de reciente a antigua.
    3. **`Sellos y paquetes`:** `LoyaltyStampCard` (`6 / 8` sellos para Sofía) y tarjetas `.ad-pkg-card` con progreso visual `.ad-pkg-pips` / `.ad-pkg-pip[data-used="true"|"false"]` (`Paquete 4 sesiones Rubber`, `1` usada / `3` disponibles).
- **Seguridad y aislamiento (`GET /api/client-portal/bookings`):**
  - Sin cookie válida devuelve `401` (`authenticated: false`).
  - Con cookie válida devuelve `ClientPortalSnapshotDTO` **estrictamente filtrado al teléfono autenticado** (nunca incluye citas de otras clientas ni campos `internalNotes`, `commissionPercent` u `ownerPinHash`).
- **PWA Offline (`/sw.js` + `PwaOfflineBootstrap` + `useServiceWorker`):**
  - `GET /sw.js` responde `200`, `Content-Type: application/javascript; charset=utf-8`, `Cache-Control: no-cache, no-store, must-revalidate` y `Service-Worker-Allowed: /`.
  - Caché versionado `laikona-v1` / `laikona-static-v1`: network-first con fallback offline para `/cita/*`, `/mis-citas`, `/links` y `/aviso-de-privacidad`; stale-while-revalidate para assets estáticos y manifest; **jamás** cachea `/admin*`, `/api/*` ni peticiones POST/PATCH.
  - Al desconectar red (`offline`), `PwaOfflineBootstrap` muestra el aviso accesible `"Sin conexión · Mostrando datos guardados"`.
- **Flujo de verificación:**
  1. `GET /api/client-portal/bookings` sin cookie -> `401`.
  2. Abrir `/mis-citas` -> `Usar teléfono demo (Sofía)` -> `Enviar código de verificación` -> `Rellenar código demo` -> `Verificar y entrar` -> confirmar pestañas `Próximas` (`NL-1042`), `Historial` y `Sellos y paquetes` (`6 / 8` sellos + `Paquete 4 sesiones Rubber`).
  3. Verificar `0px` de scroll horizontal en `390px` móvil y `0` errores de consola.
  4. Clic en `Cerrar sesión` -> vuelve al paso de WhatsApp y `GET /api/client-portal/bookings` vuelve a devolver `401`.

---

## 6. Acceso Admin (`/admin/login`), Shell Minimalista Retraíble y RBAC Multi-Rol
- **Precondiciones:** En modo demo inicia autenticado como `owner` (o vía botones rápidos de `/admin/login`). En producción sin Supabase, `POST /api/admin/session` falla cerrado con `503`. La etiqueta discreta **`Modo demo`** aparece junto a la fecha del dashboard con `Tooltip` explicativo, y el selector de rol demo vive en el pie de la barra lateral (y del cajón móvil).
- **Shell del panel (`AdminShell` + `src/components/admin/shell/*`, estilos `ad-*` en `src/app/admin/admin.css`, compatible con modo claro y oscuro, `robots: noindex, nofollow` vía `src/app/admin/layout.tsx`):**
  - **Contenedor principal flotante (estilo minimalista tipo Cal.com con identidad LAIKONA):** la barra lateral se apoya directo sobre el lienzo exterior (`.ad-shell`) y el contenido de cada pantalla vive dentro de un contenedor blanco/superficie redondeado con borde fino (`.ad-sheet`).
  - **Barra lateral retraíble en escritorio (`>= 47.5rem`):** botón `Retraer barra lateral` / `Expandir barra lateral` y atajo **`Ctrl+B`** (estado persistido en `localStorage` vía `useSidebarCollapsed`). En modo retraído (`4.25rem`) muestra iconos centrados con `Tooltip` y punto indicador cuando hay badges.
  - **Navegación por secciones colapsables persistidas (`adminNavConfig.ts` + `AdminNavGroups.tsx` + `useSidebarSections`):**
    - **`Operación`:** `Resumen` (`/admin`), `Agenda` (`/admin/citas`, con badge de pendientes), `WhatsApp` (`/admin/whatsapp`, con badge vivo de sin leer + fallos y atajo `G W`, visible para `Dueña` y `Recepción`), `Clientas` (`/admin/clientas`), `Caja` (`/admin/caja`), `Reportes` (`/admin/reportes`). Al colapsar la sección se agrega el total numérico de badges activos (`Agenda` + `WhatsApp`).
    - **`Salón`:** `Servicios` (`/admin/servicios`), `Horarios` (`/admin/disponibilidad`), `Equipo` (`/admin/equipo`), `Inventario` (`/admin/inventario`, con badge de stock bajo), `Fidelización` (`/admin/fidelizacion`, icono `Gift`, visible para `Dueña` y `Recepción`).
    - **`Profesionales`:** accesos directos por especialista (`/admin/citas?staff=<id>`) con conteo diario (`N hoy` / `Libre`) y resaltado activo sincronizado bidireccionalmente con `?staff=` en Agenda.
    - **`Más`** (colapsable; cualquier sección colapsada se expande automáticamente al navegar a una de sus rutas): `Mi página` (`/admin/marca`), `Ajustes` (`/admin/ajustes`, icono `SlidersHorizontal`, solo `Dueña`), `Conexiones` (`/admin/integraciones`), `Guía inicial` (`/admin/onboarding`, progreso `N/6`, solo `Dueña`).
    - Etiquetas de rol en lenguaje cotidiano: `Dueña` (`owner`), `Recepción` (`admin`) y `Profesional` (`specialist`). Item activo en fondo rosa suave y texto cereza (`data-on="true"`).
  - **Arriba:** logo LAIKONA (negro en modo claro, blanco en modo oscuro), botón de búsqueda rápida (`Ctrl K` -> `AdminQuickSearchDialog`, incluye accesos directos a `/admin/whatsapp`, `/admin/reportes`, `/admin/fidelizacion`, `/admin/ajustes` y `/mis-citas`), campana de alertas con accesos a mensajes WhatsApp sin leer (`/admin/whatsapp?filter=unread`), recordatorios fallidos (`/admin/whatsapp?tab=recordatorios&filter=failed`) y cuota mensual (`/admin/whatsapp?tab=conexion`), toggle para retraer barra y caja **`Tu link de citas`** con botón `Copiar`.
  - **Pie único (sin duplicados):** avatar con iniciales y punto en línea, nombre, rol, selector de rol demo, controles de `Sonido` (+ prueba de timbre), `Oscuro`/`Claro`, `Cerrar sesión` y enlace `Sitio`.
  - **Móvil (`< 47.5rem`):** la barra lateral se oculta; aparece cabecera compacta con botón `Menú` (abre cajón `AdminMobileNav` con todos los grupos y controles), logo y búsqueda; y barra inferior fija (`.ad-bottom`, oculta en escritorio) con `Inicio`, `Agenda` (con punto de pendientes), botón central cereza `+` (`/admin/citas?new=1`), `Clientas` (o `Horarios` para `specialist`) y `Caja`.
- **Arquitectura UI atómica, paridad de dominio y contratos puros:**
  - **Librería UI atómica (`src/components/ui/`):** componentes reutilizables sobre Astryx (`PageHeader`, `SurfaceCard`, `MetricGrid`, `StatusTag` / `BookingStatusTag` / `WaitlistStatusTag` / `PackageStatusTag`, `EmptyStateCard`, `CopyableField`, `ActionRow`, `ConfirmActionDialog`, `FormDialog`, `DepositProofReviewDialog`, `FilterPillBar`, `SkeletonBlock` / `PageSkeleton` y `UploadDropzone`) que estandarizan encabezados, estados vacíos, cargas y diálogos en todo el panel y flujo de reserva.
  - **Paridad de saldos, métricas y formularios compartidos:** `src/lib/booking/balance.ts` (`computeBookingBalance`, `isPendingDepositStatus`) unifica saldos, anticipos, citas sin cobrar (`isUncollected`) y pasadas sin cerrar (`isPastUnclosed`); `src/lib/metrics/` (`buildActionQueueItems`, periodos y KPIs) garantiza paridad numérica entre Resumen, Agenda, Caja y Reportes; `BlockTimeForm` (Agenda y Horarios), `DepositProofReviewDialog` (Resumen, Agenda y Caja) y `CommissionRateDialog` (Caja y Equipo) eliminan formularios duplicados.
  - **Enlaces internos tipados (`src/lib/admin-links.ts` + guardrail `no-raw-admin-links`):** todos los enlaces admin con query params usan constructores y parsers tipados (`agendaHref`, `cajaHref`, `clientasHref`, `whatsappHref`, `horariosHref`, `serviciosHref`, `equipoHref`, `inventarioHref`, `reportesHref`, `fidelizacionHref`, `ajustesHref`, `marcaHref`, `integracionesHref`, `onboardingHref`, `resumenHref`); el guardrail AST bloquea cadenas crudas `"/admin/<mod>?..."` fuera de `admin-links.ts`.
  - **Contratos Zod puros (`src/lib/contracts/`):** módulo de dominio puro (sin imports de React, Next, Supabase ni repositorios) organizado en `enums.ts`, `primitives.ts`, `bookings.ts`, `availability.ts`, `catalog.ts`, `clients.ts`, `brand.ts`, `operations.ts`, `team.ts` y `whatsapp.ts`, compartido por todas las API routes y los sanitizadores DTO (`src/lib/public-dto.ts`: `toPublicBookingDTO`, `toAdminSettingsDTO`, `toAdminCalendarConnectionDTO`).
- **Guía inicial (`/admin/onboarding`):** Asistente inicial de 4 pasos (perfil del estudio + Instagram, banco/CLABE de anticipo vinculado a `/admin/ajustes?tab=cobro&focus=clabe`, equipo/horarios fijos y confirmación final) con soporte `?step=` (`parseOnboardingParams`) y tarjeta `"Configura tu estudio"` en el dashboard.
- **Verificación RBAC (`src/lib/rbac.ts`, ver [ADR-0008](./adr/0008-reorganizacion-fidelizacion-ajustes-y-whatsapp.md)):**
  - `owner` (`Dueña`): acceso total incluyendo `WhatsApp` (inbox, envío, recordatorios, edición de flujos/textos, ejecución manual de cola, ajuste de cuota y sincronización de plantillas Meta), `Reportes` (`scope: 'studio'`), `Fidelización` (`loyalty`, edición completa de sellos/paquetes/cupones/campañas), `Ajustes` (`settings`, exclusivo `owner`: cobro/`paymentMode`/CLABE, políticas, PIN de Dueña y auditoría), `Mi página` (escaparate público, QR y Embed 3 modos), `Conexiones`, `Guía inicial`, creación de usuarios en `/admin/equipo`, anulación auditada de `lockPastBookings` y lectura de `recentAuditLogs`.
  - `admin` (`Recepción`): gestiona `Agenda`, `WhatsApp` (bandeja, envío de mensajes/plantillas, activar/pausar flujos, reintentar/enviar/cancelar recordatorios y simulador; sin editar plantillas Meta, cuota ni `run_due_now`), `Caja`, `Reportes` (`scope: 'studio'`), `Servicios`, `Horarios`, `Clientas` (ARCO, ficha técnica, campañas y paquetes), `Fidelización` (`loyalty`: gestiona paquetes, cupones y campañas; vista de solo lectura en configuración de sellos porque `PATCH /api/admin/brand` es exclusivo `owner`), `Inventario` y `Equipo` (manicuristas y `%` de comisión); no ve `Ajustes` (`settings`), `Mi página`, `Conexiones` ni `Guía inicial`, ni modifica citas pasadas si `lockPastBookings` está activo (`403 PAST_BOOKING_LOCKED`).
  - `specialist` (`Manicurista`): solo ve `Inicio`, su propia `Agenda`, sus propios `Horarios`, su propia `Caja` y `Reportes` estrictamente acotado a su `staffMemberId` (`scope: 'specialist'`); recibe bloqueo de `AdminAccessGuard` en `/admin/whatsapp`, `/admin/fidelizacion` (`loyalty`), `/admin/ajustes` (`settings`) y demás módulos administrativos, y `403` en todos los endpoints `/api/admin/whatsapp/*` (mantiene enlaces directos `wa.me` en sus citas); lectura de paquetes (`GET /api/admin/packages`) permitida, escritura de paquetes (`POST`/`PATCH`) y campañas (`GET /api/admin/campaigns`) bloqueadas con `403`.

---

## 7. Suite Ejecutiva de Reportes (`/admin/reportes` + `GET /api/admin/reports`)
- **Precondiciones:** Sesión admin activa (`owner`, `admin` o `specialist`). Sin sesión `GET /api/admin/reports` devuelve `401`; períodos soportados `today|7d|30d|90d|month|last_month|all` (cualquier otro valor devuelve `400`). El endpoint consulta tablas puntuales por rango sin `getSnapshot()` (ver [ADR-0001](./adr/0001-dual-repository-y-presupuesto-subrequests-workers.md)) garantizando paridad exacta de ingresos y propinas con `/admin` y `/admin/caja`.
- **Elementos clave y selectores:**
  - Encabezado `h1` **`Reportes y rendimiento`**, subtítulo dinámico (`Rendimiento ejecutivo del estudio` vs. `Tus métricas personales (<nombre>)` + chip `Vista individual` para `specialist`), soporte de URL `?period=&staff=` (`parseReportesParams`) y selector `SegmentedControl` `Período del reporte` (`7 días` | `30 días` | `90 días` | `Todo`).
  - **Franja de 6 KPIs (`tabular-nums`):** `Ingresos cobrados`, `Ticket promedio`, `Asistencia`, `Inasistencias`, `Cancelaciones`, `Calificación y propinas`, con accesos directos a `Caja` (`cajaHref`) y retención de `Clientas` (`clientasHref({ tab: 'retencion' })`).
  - **Ocupación y retención por especialista (`SpecialistOccupancyCard`):** tabla Astryx con minutos agendados vs. disponibles, `% ocupación`, completadas, inasistencias, ingresos, retención nuevas vs. recurrentes y enlaces filtrados por especialista a `Agenda` (`agendaHref({ staff })`) y `Equipo` (`equipoHref({ staffId })`).
  - **Mapa de calor de demanda semanal (`DemandHeatmapCard`):** cuadrícula 7×12 (Lun–Dom × `09:00–20:00`, `.ad-heatmap` envuelta en `.ad-table-scroll` para `0px` overflow a `390px`), celdas `.ad-heatmap-cell[data-level="0".."4"]` con `data-peak="true"`, `aria-label` descriptivo y `Tooltip`, más destacados de horario pico (`peakSlot`) y horario tranquilo (`quietSlot`) con contraste WCAG AA en modo claro y oscuro.
  - **Rentabilidad por servicio (`ServiceProfitabilityCard`):** ranking ordenado por `$/min` descendente con barras `.ad-bar-track` / `.ad-bar-fill`, filas `.ad-rank-row` y drill-down directo **`Editar servicio`** (`serviciosHref({ id })`) y **`Ver citas`** (`agendaHref({ q })`).
  - **Motivos de cancelación:** desglose agrupado con porcentaje de participación o estado vacío limpio.
- **Flujo de verificación:**
  1. Como `owner`, cambiar entre `7 días`, `30 días`, `90 días` y `Todo` -> KPIs, tabla de 3 artistas, mapa de calor y barras `$/min` se actualizan sin errores.
  2. Cambiar a modo oscuro y viewport `390px` -> contraste legible en todos los niveles `0..4` del heatmap y `0px` overflow horizontal.
  3. Cambiar a rol `specialist` -> aparece chip `Vista individual` y la tabla/métricas muestran únicamente a `Tere` (`scope: 'specialist'`).

---

## 8. Citas Recurrentes, Política Automática de Inasistencias y PIN de Autorización de Dueña
- **Citas recurrentes (`U1` — `/admin/citas` → `NewBookingDialog`):**
  - En `+ Nueva cita`, activar el switch **`Cita recurrente (retoque)`** despliega selector de frecuencia (`Cada 2 semanas` / `Cada 3 semanas` / `Cada 4 semanas`) y número de citas (`2` a `6`).
  - Al enviar `POST /api/admin/bookings` con `recurrence: { intervalWeeks, count }`, crea toda la serie (`seriesId`, `recurrenceIndex`/`recurrenceTotal`) y reporta con claridad las citas creadas más cualquier fecha omitida por conflicto (`skippedConflicts`).
- **Política automática de inasistencias (`U2`):**
  - Configurable por `owner` en **`/admin/ajustes?tab=politicas&focus=noshow`** (`NoShowPolicyCard`, `noShowDepositThreshold`, `1` a `5`, por defecto `2`; abrir `/admin/marca?focus=noshow` redirige automáticamente).
  - Cuando una clienta alcanza `noShowCount >= noShowDepositThreshold` (ej. Valeria Mendoza con `2` inasistencias), `createBookingAtomic` exige anticipo obligatorio / `pending_confirmation` (`noShowPolicyEnforced: true`), se muestra aviso claro en `/reservar` y `/cita/[token]`, y aparece badge de riesgo en `/admin/citas` y `/admin/clientas`.
- **PIN de autorización de Dueña (`N7` — `OwnerPinDialog`):**
  - Configurable por `owner` en **`/admin/ajustes?tab=seguridad&focus=pin`** (`OwnerPinCard`; abrir `/admin/marca?tab=seguridad` o `?focus=pin` redirige automáticamente): permite definir o actualizar un PIN de 4–6 dígitos (almacenado con `scrypt` + salt aleatorio, verificado con `timingSafeEqual`; `ownerPinHash` **nunca** se serializa en respuestas API, solo `hasOwnerPin: boolean`) o activar/desactivar `ownerPinEnabled`.
  - Cuando está activo, las acciones sensibles exigen autorización vía `OwnerPinDialog` (`.ad-pin-input`) o devuelven `403 OWNER_PIN_REQUIRED` / `OWNER_PIN_INVALID`:
    1. Cancelar una cita (`PATCH /api/admin/bookings` con `status: 'canceled'`, campo `ownerPin` o header `x-owner-pin`).
    2. Anular/ajustar precio manualmente en nueva cita (`POST /api/admin/bookings` con `customPriceCents`).
    3. Exportar reporte CSV en `/admin/caja` (`GET /api/admin/operations?export=csv` con header `x-owner-pin`).

---

## 9. Fidelización (`/admin/fidelizacion`), Paquetes de Sesiones, Campañas de Retención y Embed en 3 Modos
- **Hub unificado de Fidelización (`ADR-0008` — `/admin/fidelizacion`, RBAC `owner`/`admin`, `specialist` bloqueado):**
  - 4 pestañas sincronizadas vía `fidelizacionHref` / `parseFidelizacionParams` (`?tab=sellos|paquetes|cupones|campanas`):
    1. **`Sellos`:** configuración de la Tarjeta de Sellos (`LoyaltySettingsSection`, editable para `owner`, resumen de solo lectura para `admin`) + lista de clientas cerca de su premio con enlaces a `clientasHref` y `whatsappHref`.
    2. **`Paquetes` (`U5` — `/api/admin/packages`):** catálogo de paquetes de sesiones (`PackagesSubSection`: `Paquete 4 sesiones Rubber`, `Paquete 5 sesiones Gel Manos`) + asignación, canje y cancelación por clienta (`ClientLoyaltyTab`).
    3. **`Cupones y tarjetas`:** gestión de códigos promocionales y tarjetas de regalo (`CouponsSubSection`).
    4. **`Campañas` (`U6` — `/api/admin/campaigns`):** cumpleaños próximos (7 días, Sofía Ramírez en `+3 días`) y reactivación 45+ días sin cita (Valeria Mendoza en `-52 días`) con envío 1 clic por WhatsApp e historial (`recentDispatches`).
  - **Compatibilidad retroactiva y mostrador:** `/admin/caja?tab=promos|cupones|paquetes` y `/admin/clientas?tab=retencion|paquetes` siguen operativos con enlaces cruzados a `fidelizacionHref(...)`. `ClientProfileDialog` conserva sellos y paquetes activos por clienta.
  - **Canje atómico y recibo en cobro (`/admin/citas` → `CheckoutDrawerDialog`):** detecta paquetes activos de la clienta y ofrece **`Canjear 1 sesión`** (`redeemClientPackageId`); al cerrar muestra **`+1 sello · X/Y`**, **`Enviar recibo por WhatsApp`** (`buildCheckoutReceiptWhatsAppUrl`) y **`Agendar siguiente retoque (+21 días)`** dinámico.
- **Generador de Embed en 3 Modos (`C9` — `/admin/marca` → `EmbedGeneratorCard`):**
  - `SegmentedControl` `Modo de incrustación` con **`Inline (iframe)`**, **`Botón flotante`** y **`Popup modal`**.
  - Filtros opcionales por servicio público (`Todos los servicios` o servicio específico) y especialista (`Todo el equipo` o artista), texto personalizable de botón (en modos flotante/popup), vista previa interactiva en `Dialog` (sin `iframe` anidado, 0 errores CSP), caja `.ad-embed-code`, botón `Copiar código` y acceso `Abrir embed` (`/reservar?embed=1`).

---

## 10. Centro de WhatsApp y Recordatorios (`/admin/whatsapp` + `/api/admin/whatsapp/*`)
- **Precondiciones y RBAC:**
  - Accesible únicamente para `owner` (`Dueña`) y `admin` (`Recepción`) vía `AdminAccessGuard` (`section="whatsapp"`). El rol `specialist` (`Manicurista`) no ve el enlace en el menú, queda bloqueado en la ruta y recibe `403` en todos los endpoints `/api/admin/whatsapp/*` (mantiene enlaces directos `wa.me` en sus citas y dashboard).
  - En `/admin/whatsapp`, la franja superior `.ad-cal-kpi-strip` resume **`Sin leer`**, **`Ventanas 24 h`**, **`Pendientes / fallidos`** y **`Cuota X/500`** (cada métrica actúa como filtro/salto rápido), acompañada de botón `Actualizar`, `Banner` descartable (con CTA `Abrir en wa.me` en degradación/cuota) y `TabList` con 3 pestañas sincronizadas por URL (`?tab=mensajes|recordatorios|conexion`, `?filter=...`, `?phone=...`, `?clientId=...`, `?bookingId=...`).
- **Pestaña 1 — `Mensajes` (`WhatsAppInboxTab` + `GET /api/admin/whatsapp/threads`, `/threads/[threadId]`, `/read`, `/send`, `/messages/[messageId]/retry`):**
  - Vista master-detail responsiva (`.ad-wa-split`, alterna lista/chat en `< 47.5rem` con botón `← Conversaciones` y `0px` overflow a `390px`), auto-scroll controlado por `useWhatsAppAutoScroll` y refresco automático cada 15 s (pausado cuando la pestaña está oculta).
  - Lista de conversaciones con búsqueda debounced, filtros `Todos` / `Sin leer` / `Ventana 24 h` / `Con fallos`, botón `Nuevo` (`NewWhatsAppChatDialog` con selector opcional de clienta, normalización MX `+52` y envío obligatorio de plantilla Meta con vista previa), badges de no leídos y prefijos `Tú:` / `Bot:` / `Celular:`.
  - Cabecera del chat con contador en vivo de la ventana de atención de **24 h de Meta** (`StatusTag`), accesos `Ver ficha` (`clientasHref({ q })`) y `wa.me`, y barra de contexto `.ad-wa-context-strip` priorizando `?bookingId=` con `BookingStatusTag`, **`Cobrar`** (`agendaHref({ collect })`), **`Abrir en Agenda`** (`agendaHref({ q })`) y **`Ver ficha`**.
  - Historial agrupado por fecha con burbujas diferenciadas para mensajes entrantes (`inbound`), staff (`outbound`), automatizaciones (`bot` + chip de plantilla) y ecos **Coexistence** (`echo` con etiqueta `"Enviado desde celular"`), íconos de entrega (`queued`/`sent`/`delivered`/`read`/`failed`) y botón 1 clic **`Reintentar`** sobre mensajes fallidos.
  - Compositor con `SegmentedControl` **`Texto libre` | `Plantilla Meta`**: dentro de 24 h ofrece píldoras de respuesta rápida y envío con `Enter` (`Shift+Enter` salto de línea); fuera de 24 h bloquea texto libre (`422 WINDOW_CLOSED` + banner explicativo + salto 1 clic a plantilla y `wa.me`); en modo plantilla prellena parámetros desde la clienta/cita con vista previa `.ad-wa-template-preview` para las 9 plantillas `es_MX`; al 100% de cuota (`429 QUOTA_EXCEEDED`) muestra alerta y acceso directo a `wa.me`.
- **Pestaña 2 — `Recordatorios` (`WhatsAppRemindersTab` + `GET|POST /api/admin/whatsapp/reminders`):**
  - Franja de 4 KPIs (`Programados`, `Enviados`, `Con fallos`, `Ahorro en cascada`), aviso de cobertura de citas próximas sin recordatorio y estado de salud del Outbox.
  - Cuadrícula de los **8 flujos automáticos** (`WhatsAppAutomationCards`) con switch activar/pausar (`owner`/`admin`), canales WhatsApp/Correo, chip de plantilla Meta, vista previa en vivo, edición de texto y programación (`owner`) y diálogo **`Probar envío`**.
  - Cola e historial de `scheduled_notifications` (`WhatsAppReminderQueue`) con filtros `Programados` / `Enviados` / `Fallidos` / `Cancelados`, búsqueda, botón **`Ejecutar pendientes ahora`** (`owner`), contador de intentos/errores y acciones 1 clic **`Reintentar`**, **`Enviar ahora`**, **`Cancelar`** (`ConfirmActionDialog`) y **`Ver en chat`** (salta a `Mensajes` abriendo el hilo correspondiente).
- **Pestaña 3 — `Conexión y plantillas` (`WhatsAppConnectionTab` + `GET|POST /api/admin/whatsapp/settings`, `POST /api/admin/whatsapp/simulate`):**
  - Panel de estado para **Cloud API**, **Coexistence**, **Webhook de Meta** y **Resend + wa.me**, botón **`Verificar en vivo`** (`?live=1` mostrando nombre verificado, número y calificación de calidad), switch `Recibir citas por WhatsApp` (`owner`), medidor y tope mensual editable (`owner`) de la cuota `500/mes` con alertas al 80% y 100%, URL copiable del webhook, variables pendientes colapsables y envío de prueba rápida.
  - Tabla de las **9 plantillas oficiales Meta** (`WhatsAppTemplatesTable`) con estado de aprobación, switch activo (`owner`), **`Sincronizar con Meta`** (`owner`), **`Vista previa`** y **`Editar nombre`** (`owner`).
  - **Simulador interactivo** (`WhatsAppSimulatorCard`, habilitado en demo/dev o con `WHATSAPP_SIMULATOR_ENABLED=true`, bloqueado con `403 SIMULATOR_DISABLED` si se desactiva): 6 escenarios en 1 clic (`CONFIRMAR`, `REAGENDAR`, `CANCELAR`, `Agendar cita`, `Eco desde celular`, `Simular fallo de entrega`), texto libre personalizado y salto directo `Ver en Mensajes`.
- **Consolidación única y `/admin/integraciones` simplificado (`ADR-0008`):**
  - `/admin/whatsapp?tab=conexion` es la única pantalla para credenciales Cloud API, webhook URL, sincronización de plantillas Meta, envío de prueba y simulador demo; `/admin/integraciones` eliminó el simulador/webhook/registros duplicados de WhatsApp y muestra una tarjeta de estado compacta (`WhatsAppSection`) con enlaces a `whatsappHref()` y `whatsappHref({ tab: 'conexion' })`.
  - Accesos cruzados **`Abrir chat`** / **`Ver chat`** hacia `whatsappHref({ phone, bookingId })` desde `/admin`, `/admin/citas`, `/admin/clientas` y `/admin/fidelizacion`.

---

## 11. Panel Admin — Módulos Críticos (Resumen Operativo)

| Ruta | Propósito | Acciones verificables clave |
| :--- | :--- | :--- |
| `/admin` | Tablero de decisión (`Qué hacer ahora` + `Próximas 3`) | Encabezado con fecha + etiqueta `Modo demo`, saludo serif `Hola, <nombre>`, `Buscar clienta o cita` (`Ctrl K`) y `+ Nueva cita`. Tarjeta **`Qué hacer ahora`** (`buildActionQueueItems`: anticipos con `DepositProofReviewDialog` inline, citas sin cobrar -> `agendaHref({ collect })` / `agendaHref({ status: 'uncollected' })`, lista de espera -> `agendaHref({ panel: 'waitlist' })`, WhatsApp sin leer/fallidos -> `whatsappHref(...)`, stock bajo -> `inventarioHref({ filter: 'low_stock', itemId })`). Fila de 6 KPIs parificados (`src/lib/metrics/`), bloque conciso **`Próximas 3 citas`** con `Ver agenda completa ›`, tarjeta cereza `Tu página de reservas`, `Configura tu estudio`, `Corte de hoy` y `Cerca de su premio`. |
| `/admin/onboarding` | Guía inicial del salón | Soporta `?step=` (`parseOnboardingParams`); configura perfil/Instagram, banco/CLABE (enlazado a `/admin/ajustes?tab=cobro&focus=clabe`), equipo/horarios y servicios con enlaces tipados `admin-links.ts`. |
| `/admin/citas` | Agenda compacta, carga por rango, URL bidireccional, popover conectado y cobro | Barra única compacta (`[‹ Hoy ›] [Día|Semana|Lista] [Profesional ▾] [🔍]` + `Nueva cita` + menú `Más` con *Buscar hora libre*, *Bloquear horario o día* y *¿Por qué no sale una hora?* -> `horariosHref({ tab: 'diagnostico', staff, date })`). Carga citas por rango visible bajo demanda vía `GET /api/admin/bookings?from=YYYY-MM-DD&to=YYYY-MM-DD&staff=<id>` (`useAgendaRangeBookings`, caché invalidado en cada mutación, fusionado con overview para chips globales instantáneos) y calendario visual modular (`VisualScheduleGrid` + `ScheduleDayView` + `ScheduleWeekView` + `ScheduleEventCard`). Chips inline (`Próximas`, `Por confirmar`, `Por cobrar` filtrando en Agenda sin salir a Caja, `Pasadas`, `Canceladas`) operativos en Horario y Lista; estado URL bidireccional (`useAgendaUrlState`, `push`/`replace` + Back); móvil `390×844` sin parpadeo con primera cita visible sobre el pliegue. Estado **`Pasada sin cerrar`** (`computeBookingBalance`) con 1 toque `Cobrar`/`Terminada`/`No llegó`; **`BookingQuickPopover`** conectado (chips técnicos, sellos, paquetes activos, inasistencias, última visita, `En salón` vía `check_in`, acciones primarias por estado); **`Drawer` de lista de espera** (`?panel=waitlist`) + aviso **`Avisar a la lista de espera`** al cancelar/mover (`findFreedSlotWaitlistMatch`); motor unificado (`useNewBookingSlots`) entre `QuickSlotFinderDialog` y `NewBookingDialog`; `BlockTimeForm` compartido al pulsar hueco libre; **`CheckoutDrawerDialog`** con pagos divididos, canje de paquete, `+1 sello · X/Y`, **`Enviar recibo por WhatsApp`** (`buildCheckoutReceiptWhatsAppUrl`) y retoque dinámico. |
| `/admin/whatsapp` | Centro único de WhatsApp, recordatorios y Meta Cloud API | Franja KPI (`Sin leer`, `Ventanas 24 h`, `Pendientes / fallidos`, `Cuota X/500`) y 3 pestañas sincronizadas por URL (`?tab=mensajes|recordatorios|conexion`, `?filter=`, `?phone=`, `?bookingId=`): **`Mensajes`** (bandeja master-detail, ventana 24 h en vivo, strip de cita con `Cobrar`/`Abrir en Agenda`/`Ver ficha`, texto libre + 9 plantillas `es_MX`, ecos Coexistence, reintento 1 clic, `Nuevo` chat), **`Recordatorios`** (8 flujos automáticos, cola/historial, `Ejecutar pendientes ahora`, reintentar/enviar/cancelar) y **`Conexión y plantillas`** (hogar único de verificación Meta en vivo, webhook URL, cuota `500/mes`, 9 plantillas y simulador interactivo). RBAC: `owner`/`admin` (`specialist` bloqueado `403`). |
| `/admin/reportes` | Analítica ejecutiva, heatmap y drill-downs | Soporta `?period=&staff=` (`parseReportesParams`); selector `7d / 30d / 90d / Todo`, 6 KPIs + enlaces a `Caja` y `Clientas › Retención`, ocupación por especialista con links a `Agenda` y `Equipo`, **mapa de calor 7×12** (claro/oscuro + móvil), rentabilidad `$/min` con **`Editar servicio`** (`serviciosHref({ id })`) y **`Ver citas`** (`agendaHref({ q })`), y motivos de cancelación con aislamiento RBAC (`specialist`). |
| `/admin/servicios` | Catálogo VIP, `?id=` y conexiones | Soporta `?id=`, `?tab=` y `?q=` (`parseServiciosParams`; `?id=` abre el editor del servicio automáticamente); pestañas `Servicios` y `Extras / Diseños`, `isStartingPrice`, switch `Solo link privado`, `VISTA PREVIA EN VIVO`, `Copiar link` y enlaces filtrados **`Ver citas`** (`agendaHref({ q })`), **`Rentabilidad`** (`reportesHref`), **`Paquetes`** (`cajaHref`) e **`Insumos`** (`inventarioHref({ filter: 'cabin' })`). |
| `/admin/disponibilidad` | Turnos fijos, `BlockTimeForm` unificado y Troubleshooter | Soporta `?staff=&tab=&date=&serviceId=` (`parseHorariosParams`); edición semanal + `optimizeContinuousSlots`, bloqueos unificados (`BlockTimeForm`: cierre, parcial y recurrente), festivos MX, **Troubleshooter Visual** (`?tab=diagnostico`) y barra de accesos por profesional (**`Ver su agenda`**, **`Perfil y comisión`** y **`Ocupación en Reportes`**). |
| `/admin/equipo` | Profesionales, comisión unificada y accesos RBAC | Soporta `?staffId=` (`parseEquipoParams`, abre y resalta a la profesional); reutiliza **`CommissionRateDialog`** (`Editar %`) compartido con Caja; enlaces directos por fila y modal a **`Agenda`**, **`Horarios`** y **`Comisiones`**; gestión de usuarios admin (`owner`). |
| `/admin/clientas` | CRM, ficha técnica, retención, paquetes y ARCO | Tira de 4 KPIs, directorio A–Z (`?q=&clientId=&filter=`), ordenamiento, LTV + botones **`Agendar`** y **`Abrir chat`**. **`ClientProfileDialog`** con 5 métricas, ficha técnica (`Forma`, `Largo`, `Base`, `Alertas`), historial con miniaturas, sellos/paquetes, descarga ARCO y eliminación segura (`409 CLIENT_HAS_HISTORY`). Pestañas retrocompatibles `Retención` y `Paquetes` con enlace a `/admin/fidelizacion`. |
| `/admin/fidelizacion` | Hub de Sellos, Paquetes, Cupones y Campañas (`ADR-0008`) | 4 KPIs y 4 pestañas (`?tab=sellos|paquetes|cupones|campanas`, `parseFidelizacionParams`): **`Sellos`** (configuración editable para `owner`, solo lectura para `admin`, + clientas cerca de premio), **`Paquetes`** (catálogo + asignación/canje), **`Cupones y tarjetas`** y **`Campañas`** (cumpleaños 7 días + reactivación 45+ días). RBAC: `owner`/`admin` (`specialist` bloqueado). |
| `/admin/caja` | Fuga de ingresos, corte con fondo, comisiones y venta rápida | Soporta `?quickSaleProductId=` (abre `CashMovementDialog` prellenado con producto de inventario y limpia solo ese param), `?staff=` en `Comisiones` y `?tab=`. `Resumen` con `Citas sin cobrar`, periodos, filtro por método, movimientos con enlace a **`Cita`** (`agendaHref({ q })`) y **clienta** (`clientasHref({ q })`). Modales `FormDialog` (`Registrar movimiento`, `Pagar`, `Editar`, **`CommissionRateDialog`** compartido con Equipo, **`DepositProofReviewDialog`** compartido con Resumen/Agenda, `Corte de caja`, `Personalizar caja`). Pestaña retrocompatible `Promos` con acceso a `/admin/fidelizacion`. |
| `/admin/inventario` | Stock optimista, margen retail y venta vía Caja | Soporta `?filter=low_stock|cabin|retail&itemId=&q=` (`parseInventarioParams`, resalta `itemId`); muestra margen visible en productos de reventa (`Margen +$X (N%)`); **`Vender`** abre el modal de cobro en Caja vía `cajaHref({ tab: 'resumen', quickSaleProductId })` (sin venta 1-toque sin método de pago); enlaces a `Caja` y `Servicios`. |
| `/admin/ajustes` | Hub operativo de Cobro, Políticas y Seguridad (`ADR-0008`) | 3 pestañas (`?tab=cobro|politicas|seguridad&focus=clabe|noshow|pin`, `parseAjustesParams`): **`Cobro y anticipo`** (fuente única de `paymentMode`, anticipo SPEI, banco, beneficiario, CLABE e instrucciones), **`Políticas`** (cancelación, reagendado, apartado, `noShowDepositThreshold`, `lockPastBookings`, `showBookingQr`, `touchUpDays`) y **`Seguridad y auditoría`** (`OwnerPinCard` + `OwnerAuditHistoryCard`). RBAC: exclusivo **`owner`** (`admin` y `specialist` bloqueados). |
| `/admin/marca` | Escaparate público: Marca, WCAG AA, QR y Embed | Enfocado estrictamente en lo que ven tus clientas (`Portada e identidad`, `Galería y preguntas`, `Colores, estilo y web` con presets WCAG AA, vista previa fija, **QR SVG/PNG** y **`EmbedGeneratorCard`** 3 modos) + enlaces a `Ajustes` y `Fidelización`. Redirección automática retrocompatible si llegan parámetros operativos heredados (`?tab=cobro|politicas|seguridad|datos|sellos` o `?focus=clabe|pin|noshow|sellos`). |
| `/admin/integraciones` | Calendar, SMS, Analytics y tarjetas de estado | Toggle Google Calendar (OAuth AES-GCM + conflictos), correo Resend, SMS Twilio, `Meta Pixel ID` / `GA4` / `Google Review URL` y tarjetas de solo lectura con enlaces a **`/admin/ajustes?tab=cobro`** (sin editor duplicado de `paymentMode`) y **`/admin/whatsapp?tab=conexion`** (sin simulador ni webhook duplicados de WhatsApp). |

---

## 12. Producción: Media Privada R2 (`/api/media`), Retención 12 Meses (`/api/cron/retention`), Cuota WhatsApp y Cloudflare Workers Preview
- **Autorización estricta de media privada (`GET /api/media/[...path]`):**
  - El bucket R2 (`SALON_MEDIA_BUCKET` / `laikona-nails-media`) es **100% privado**.
  - `GET /api/media/proofs/...` o `/api/media/inspo/...` rechaza traversal (`400`) y peticiones anónimas (`401`).
  - Permite acceso únicamente con: (a) sesión admin válida (`owner`/`admin` todo; `specialist` solo archivos de sus citas, `403` en ajenas), (b) URL firmada HMAC-SHA256 de 1 h (`?exp=...&sig=...`), (c) `?token=<manageToken>` de la cita propietaria (usado automáticamente en `/cita/[token]`), o (d) cookie válida `nails_client_portal` cuyo `phoneE164` coincide con la propietaria (`403` si pertenece a otra clienta).
  - Responde con `Cache-Control: private, ...`, `X-Content-Type-Options: nosniff` y `Content-Disposition: inline`.
- **Retención automática de 12 meses y Cron Triggers (`worker.ts` + `wrangler.jsonc`):**
  - `POST /api/cron/retention` (disparado diariamente a las `09:00 UTC` / `03:00 AM` Puebla, protegido con `Authorization: Bearer <CRON_SECRET>`, `503` sin secreto / `401` inválido): envía aviso contable por correo Resend a los **335 días** (11 meses) y **358 días** (7 días antes), purga objetos R2 >= **365 días** limpiando URLs de archivo sin borrar el historial de citas ni cobros, y registra `media_retention_warned` / `media_retention_purged` en `audit_logs`.
  - `POST /api/cron/reminders` (disparado cada 15 min `*/15 * * * *`, mismo gate `CRON_SECRET`): despacha recordatorios 24h/2h/post-cita y ejecuta `cleanupExpiredSlotHolds()` (mantiene activo Supabase Free).
- **Cuota mensual de WhatsApp (`500/mes`) y Coexistence (`/api/webhooks/whatsapp`):**
  - Las alertas preventivas al **80% (400/500)** y límite **100% (500/500)** se muestran en `/admin` (`Pendientes de hoy`) y `/admin/integraciones`; al alcanzar el 100% degrada automáticamente a correo Resend + enlace `wa.me`.
  - El webhook valida `X-Hub-Signature-256` con Web Crypto HMAC-SHA256 y procesa idempotentemente `messages`, `statuses` y `smb_message_echoes` vía `public.webhook_events`.
- **Verificación local en Cloudflare Workers (`workerd`):**
  - Ejecutar `npm run cf:build` y `npm run cf:preview` (`http://127.0.0.1:8787`), verificando `200` en `/`, `/reservar` y `/api/public/bootstrap`, `401` en `GET /api/media/proofs/test.png` sin credenciales, y `401`/`503` en `POST /api/cron/retention` sin `Bearer`.
  - Las imágenes operan con `images: { unoptimized: true }` (cero Sharp en Workers) y la CSP de producción incluye `connect-src 'self' https: wss:` para Supabase Realtime.

---

## Gatekeeper Único de Verificación
Antes de dar cualquier cambio por terminado debe pasar en verde con **0 errores y 0 warnings**, seguido del build de Cloudflare Workers y la suite E2E:
```bash
npm run verify
npm run cf:build
E2E_BASE_URL=http://127.0.0.1:3000 npm run test:e2e
```
`npm run verify` ejecuta secuencialmente:
`typecheck` -> `guardrails` (self-test + AST + seed parity + `oxlint --deny-warnings`) -> `deadcode` (`knip`) -> `test` (unitarios + DST + concurrencia + seguridad + analítica + paquetes + `fast-check` property tests) -> `build` (`next build`) -> `doctor` (`astryx doctor --built .next`).
