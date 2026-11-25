# Feature Map & Verification Guide — LAIKONA NAILS

Mapa determinista de rutas, precondiciones, selectores accesibles y flujos críticos para verificar **LAIKONA NAILS BY KARLA** en navegador/CDP sin adivinanzas.

---

## Precondiciones Generales
- Servidor corriendo: `npm run dev` (puerto `1717` en desarrollo local) o `npm run build && npm run start` en `http://localhost:3000`.
- **Modo Demo Local** (sin variables de Supabase en `.env.local`):
  - Base persistente en `.nails-demo-db.json` (borrar el archivo regenera datos limpios de fábrica de **LAIKONA NAILS**).
  - **Identidad sembrada:** `LAIKONA NAILS` (`by Karla · Manicure y nail art en Puebla`), `@laikona.nailsss`, dirección `Calle 25 Sur 1904, Col. Volcanes, 72410 Puebla, Pue.`.
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
  - Landing propia sin `PublicShell` (`LandingView` + `src/components/landing/*`, estilos `lk-*` en `src/app/globals.css`, recursos en `public/landing/`). Siempre en modo claro (`color-scheme: light` en `.lk-root`).
  - Franja de avisos animada (anticipo, reagendar 12 h, solo con cita) con `aria-label` completo.
  - Nav `role="navigation"` (`Principal`) integrada en el hero: `data-floating="false"` arriba; al pasar 80 px de scroll cambia a `data-floating="true"` (cápsula esmerilada con logo negro). Enlaces `#servicios`, `#galeria`, `#equipo`, `#visitanos` y botón `Agendar` (`/reservar`). En móvil (< 760 px) los enlaces se ocultan y `Abrir menú` abre un `Dialog` a pantalla completa en cereza.
  - Hero `#inicio`: `h1` `El arte está en tus uñas`, CTAs `Agendar cita` (`/reservar`) y `Ver creaciones` (`#galeria`), calificación de Google si hay reseñas.
  - Menú `#servicios`: `TabList` (`Uñas & Esculturales`, `Gel & Retiro`, `Pies & PediSpa`, `Arte y acabados`). Cada servicio es un enlace a `/reservar/[slug]` con foto, precio (`Desde $...` cuando `isStartingPrice`) y duración. `Arte y acabados` lista los extras activos con icono y las formas de uña.
  - Creaciones `#galeria` (fondo cereza): mosaico de 11 fotos; `Ver más creaciones` (`aria-expanded`) muestra 22.
  - Reseñas: resumen `EXCELENTE · promedio · N reseñas` + `Carousel` de reseñas verificadas (`PublicReviewDTO`, solo primer nombre, citas `completed` con comentario).
  - Equipo `#equipo` (fondo cereza): un botón por especialista (`aria-haspopup="dialog"`) abre un `Dialog` con pestañas `Perfil`, `Servicios` (botón `Reservar` → `/reservar/[slug]?staff=<slug>`) y `Portafolio`, más `Reservar con <nombre>` (`/reservar?staff=<slug>`).
  - Conectemos: tarjeta central a `@laikona.nailsss` y cuatro fotos inclinadas.
  - Visítanos `#visitanos`: dirección, horario y contacto + `iframe` de Google Maps (`sandbox`, permitido por `frame-src https://www.google.com https://maps.google.com` en la CSP).
  - Footer cereza: logo, `Agendar cita`, WhatsApp, columnas Explora/Dirección/Horario/Síguenos y enlaces a `/aviso-de-privacidad` y `/links`.
  - **SEO Local:** `<script type="application/ld+json">` de tipo `NailSalon` / `LocalBusiness` con `OfferCatalog` y `aggregateRating` (sin `commissionPercent` y excluyendo servicios privados `isPrivate: true`), `GET /sitemap.xml` (200 con `/`, `/reservar`, `/links`, `/aviso-de-privacidad`, y únicamente `/reservar/[slug]` públicos) y `GET /robots.txt` (200 bloqueando `/admin/`, `/api/`, `/cita/`).
- **Flujo de verificación:**
  1. Cambiar pestaña de categoría en Servicios -> actualiza la cantidad de tarjetas visibles (servicios VIP `isPrivate: true` nunca aparecen aquí ni en `/links` ni en `/api/public/bootstrap`).
  2. Bajar más de 80 px -> la nav pasa a `data-floating="true"`; en 375 px de ancho, `Abrir menú` abre el panel y `Cerrar menú` lo cierra.
  3. Clic en la tarjeta `Rubber` -> navega a `/reservar/rubber`.
  4. Clic en `Karla` -> abre el diálogo; la pestaña `Servicios` lista sus servicios con `Reservar`.

---

## 2. Bio-Link de Instagram (`/links`) y Aviso de Privacidad (`/aviso-de-privacidad`)
- **Bio-Link (`/links`):**
  - Muestra logo LAIKONA NAILS, `@laikona.nailsss`, dirección desde `settings.address`, chips de turnos fijos y anticipo `$200 MXN`, botones apilados a `/reservar`, `/#servicios`, `/#galeria`, WhatsApp, Instagram, Google Maps y `/aviso-de-privacidad`, más lista directa de servicios públicos (excluyendo `isPrivate: true`, sin `commissionPercent`).
- **Aviso de Privacidad LFPDPPP (`/aviso-de-privacidad`):**
  - Detalla Responsable (`LAIKONA NAILS / Karla Patricia Carrillo Rodríguez`), datos recabados, finalidades primarias vs. secundarias opcionales, tarjeta destacada de **Derechos ARCO** (acceso/descarga JSON, rectificación, cancelación, oposición, plazo 20 días hábiles) y versión vigente (`privacyPolicyVersion`, ej. `2026-11`).

---

## 3. Flujo de Reserva en Tiempo Real (`/reservar` y `/reservar/[slug]`)
- **Precondiciones:** Al menos 1 servicio activo y 1 especialista con horario configurado.
- **Estado bidireccional en URL (`C2` — `useBookingUrlSync`):** `?servicio=<slug>`, `?extras=<s1,s2>`, `?addons=<a1,a2>`, `?staff=<bookingSlug>`, `?date=YYYY-MM-DD`, `?layout=month|week|column`, `?slot=<iso>`, `?inspo=<texto>`. Recargar la página o abrir un deep-link de Instagram/WhatsApp restaura exactamente el paso y selección.
- **Servicios VIP Privados (`C9`):** Un servicio con `isPrivate: true` se oculta de `/`, `/reservar`, `/links`, `/sitemap.xml` y `/api/public/bootstrap`, pero sigue siendo accesible y reservable vía enlace directo `/reservar/[slug]` (con `robots: noindex, nofollow`).
- **Contenedor por pasos (`BookingWidget` + `bookingMachine`):** `Servicio → Día y hora → Artista → Tus datos`. Sin menú flotante del landing: encabezado fijo propio (`Atrás`/`Inicio`, logo, contador de apartado `role="timer"` y `Ayuda` por WhatsApp) + `progress` `Progreso de la reserva`. Banda cereza `Reserva tu cita` con stepper (`aria-current="step"`, solo se puede regresar a pasos anteriores) en escritorio y `Paso X de 4` en móvil (< 760 px). Escritorio: panel blanco + resumen cereza fijo (`aside` `Tu cita`). Móvil: barra inferior fija con total, `Ver resumen` (`BottomSheet`) y botón principal.
- **Selectores y controles clave:**
  - Paso 1 `¿Qué te hacemos?`: pestañas por categoría (`role="tab"`), servicios como botones `aria-pressed` con foto, duración y precio; extras como filas `aria-pressed`; `¿Algo más en la misma visita?` (`Collapsible`) para multi-servicio (`extraServiceIds`).
  - **Reseñas verificadas en `/reservar/[slug]`:** `ServiceReviewsSection` muestra reseñas verificadas (`PublicReviewDTO`: solo primer nombre, calificación y comentario, cero PII completo) filtradas por servicio (o promedio del estudio si el servicio aún no tiene reseñas).
  - Paso 2 `¿Cuándo?` (horario antes que artista):
    - Consulta disponibilidad de **todo el equipo** (`staffId` vacío) salvo que llegue `?staff=<slug>` (enlace `Reservar con <nombre>`): entonces muestra `Estás viendo solo los horarios de <nombre>` + `Ver todo el equipo` y se salta el paso Artista.
    - Cada horario muestra cuántas artistas están libres (`AvailableSlot.availableStaffIds`, p. ej. `2 artistas`).
    - Escritorio: `SegmentedControl` `Vista de calendario` (`Mes` | `Semana`; `column` en URL se trata como `Semana`) y `Formato de hora` (`12h` | `24h`). Móvil: tira deslizable de días (`role="listbox"`) + `Ver mes` y horarios en 3 columnas.
    - **Ausencias OOO y día lleno (`C2`/`C7`):** muestra `publicNote` y botón hacia `redirectStaffId`; si un día no tiene huecos, `Ir al <día>` con el siguiente día con lugar o `Lista de espera` (`POST /api/waitlist`).
    - Elegir horario aparta el lugar (`POST /api/slot-holds`) con la artista asignada por defecto y avanza solo.
  - Paso 3 `¿Con quién?`: `Me da igual` (preseleccionado) + especialistas elegibles; las ocupadas a esa hora salen deshabilitadas (`Ocupada a esa hora`). Elegir otra artista vuelve a pedir el apartado sobre el mismo `startAt` con su `staffId`; si ya no está libre muestra `Esa artista ya no está libre` y conserva el apartado. Si solo hay una artista libre en ese horario, el paso se salta.
  - Paso 4 `Casi lista`:
    - Solo `Nombre y apellido` (2 palabras) y `WhatsApp` (`+52`, 10 dígitos) son obligatorios; los errores aparecen en cada campo al intentar enviar.
    - Anticipo SPEI (`Anticipo de $200`, CLABE como botón `Copiar CLABE ...`) con `¿Cómo nos mandas tu comprobante?` (`Lo subo ahora` / `Lo mando por DM a @laikona.nailsss`).
    - `Detalles para tu artista` (Instagram, correo, cumpleaños, notas, foto de inspiración) y `¿Tienes cupón o Gift Card?` plegados (`Collapsible`).
    - **Consentimiento LFPDPPP obligatorio:** `Acepto el Aviso de Privacidad` (+ enlace) y `marketingOptIn` opcional.
    - `Apartar mi cita` (`type="submit"`, `form` asociado; `POST /api/bookings` con `Idempotency-Key`).
- **Flujos críticos a verificar:**
  1. Enviar `POST /api/bookings` sin `privacyConsentAccepted: true` -> rechazado `400 PRIVACY_CONSENT_REQUIRED`.
  2. Exceder `maxActiveBookingsPerClient` con el mismo teléfono -> rechazado `409 MAX_ACTIVE_BOOKINGS` con `activeBookings[]` **exclusivamente de ese teléfono** (`bookingCode`, `serviceName`, `staffName`, `startAt`, `manageUrl`) para recuperación directa de reprogramación (`C6`).
  3. Combinar servicio + extra -> suma duración/precio y recalcula horarios disponibles en vivo.
  4. Seleccionar horario -> activa hold de **5 minutos** (`slotHoldMinutes`, contador en encabezado y `Te guardamos el horario` en el resumen) y lleva a `¿Con quién?`; elegir otra artista renueva el hold con su `staffId`.
  5. Aplicar cupón `BIENVENIDA10` -> aplica descuento 10% (y bloquea doble uso por la misma clienta).
  6. Confirmar reserva -> redirige a `/cita/[manageToken]` y desaparece el horario en otras sesiones vía `/api/realtime`.
  7. Colisión concurrente (`409 SLOT_TAKEN`): muestra `Banner` amarillo con 3 horarios sugeridos clicables sin perder los datos del formulario.

---

## 4. Página Mágica de Clienta (`/cita/[token]`)
- **Precondiciones:** Token válido en `bookings.manageToken` (ej. `/cita/demo-token-sofia-1042`, `/cita/demo-token-andrea-1044`, `/cita/demo-token-paula-1039` o una cita recién creada en `/reservar`).
- **Diseño y estructura (`ManageBookingView` + `src/components/cita/*` + estilos `ck-*` y `rb-*` en `src/app/globals.css`, sin `PublicShell`):**
  - Mismo encabezado (`BookingHeader`: `Inicio`, logo negro, `Ayuda` por WhatsApp; sin barra de progreso ni temporizador) y banda cereza (`CitaHero`: trazo porcelana, cerezas, ola SVG; sin stepper).
  - Título dinámico según estado (`Cita confirmada` cuando `confirmed`, `¡Tu cita está apartada!` cuando `pending_confirmation` / `pending_payment`, `¡Gracias por visitarnos!` cuando `completed`, `Cita cancelada` cuando `canceled`) + píldora de estado y código copiable (`NL-xxxx`).
  - **Diseño responsivo (`47.5rem`):** En escritorio (`1280px`), dos columnas (`.ck-layout`): detalle y acciones a la izquierda y tarjeta cereza fija (`BookingSummaryCard` `Tu cita`, `sticky`) a la derecha con servicio y extras, fecha y hora, artista, duración, total, descuento y anticipo. En móvil (`375px`), una sola columna sin scroll horizontal con la tarjeta `Tu cita` visible arriba.
- **Controles clave:**
  - **Anticipo y comprobante (`CitaDepositSection`):** Cuando la cita está en `pending_confirmation` o `pending_payment` y falta el comprobante, muestra anticipo (`$200`), SPEI con **CLABE copiable con un toque** (`.rb-clabe`), selector `Lo subo aquí` (`FileInput` PNG/JPG/WEBP ≤ 2.5 MB -> `PATCH /api/bookings/manage/[token]` con `action: 'upload_proof'`) o `Lo mando por DM a @laikona.nailsss` (abrir Instagram + copiar resumen con código), además de botón `Pagar anticipo con Mercado Pago` cuando exista `checkoutUrl`. Si el comprobante ya fue recibido, muestra `Comprobante recibido · En revisión` y opción desplegable para reemplazarlo.
  - **Calendario y WhatsApp (`CitaActionsPanel`):** `Google Calendar`, `Apple / iPhone (.ics)` (`/api/bookings/manage/[token]/ics`), `Outlook`, `Enviar por WhatsApp`.
  - **Ubicación y detalles:** Dirección tomada de `settings.address` (`Calle 25 Sur 1904, Col. Volcanes, 72410 Puebla, Pue.`), indicaciones de llegada, botón `Abrir en Google Maps`, `WhatsApp del salón`, datos de clienta, notas y foto de inspiración si existe. Sin menciones a estudio hermano ni `@lumiere.beautymx`.
  - **Código QR de la cita:** QR SVG escaneable del enlace personal `/cita/[token]` con `Copiar enlace` y `Descargar QR`.
  - **Cambios y auto-apertura (`C6`):** `Reagendar` (valida elegibilidad de especialista para todos los servicios + `recurringBlocks`, actualiza links de calendario/WhatsApp y notifica al salón) y `Cancelar cita` (libera cupón/saldo Gift Card y notifica al salón). Abrir `/cita/[token]?action=reschedule` en una cita activa abre automáticamente el diálogo de reprogramación.
  - **Tarjeta Digital de Sellos Web/PWA (`LoyaltyStampCard`):** Visible sin descargar app; muestra nombre del programa (`Tarjeta de Sellos LAIKONA`), progreso (`6 de 8 sellos` en `/cita/demo-token-sofia-1042`), casillas numeradas, beneficio y estado. Cero `commissionPercent` en el HTML.
  - **Encuesta post-cita (`CitaReviewCard`, cuando `status === 'completed'`, ej. `/cita/demo-token-paula-1039`):** botones `1 ★`..`5 ★` + comentario -> si calificación >= 4 muestra `Dejar reseña en Google`.
- **Verificación de política y responsive:**
  - Cancelar o reagendar dentro de las `minCancelHours` (12 h) devuelve `400 POLICY_WINDOW` sin modificar la cita.
  - Verificar en navegador a `375px` (sin scroll horizontal) y `1280px` (resumen cereza `sticky` a la derecha) tras crear una reserva real en `/reservar`.

---

## 5. Acceso Admin (`/admin/login`), Shell Minimalista Retraíble y RBAC Multi-Rol
- **Precondiciones:** En modo demo inicia autenticado como `owner` (o vía botones rápidos de `/admin/login`). El antiguo banner grande azul de Modo Demo se reemplazó por una etiqueta discreta **`Modo demo`** junto a la fecha del dashboard con `Tooltip` explicativo, y el selector de rol demo vive en el pie de la barra lateral (y del cajón móvil).
- **Shell del panel (`AdminShell`, estilos `ad-*` en `src/app/globals.css`, compatible con modo claro y oscuro):**
  - **Contenedor principal flotante (estilo minimalista tipo Cal.com con identidad LAIKONA):** la barra lateral se apoya directo sobre el lienzo exterior (`.ad-shell`) y el contenido de cada pantalla vive dentro de un contenedor blanco/superficie redondeado con borde fino (`.ad-sheet`).
  - **Barra lateral retraíble en escritorio (`>= 47.5rem`):** botón `Retraer barra lateral` / `Expandir barra lateral` y atajo **`Ctrl+B`** (estado persistido en `localStorage` vía `useSidebarCollapsed`). En modo retraído (`4.25rem`) muestra iconos centrados con `Tooltip` y punto indicador cuando hay badges.
  - **Navegación agrupada y RBAC:** `Hoy` (`Inicio`, `Citas y agenda` con badge de pendientes, `Clientas`, `Caja`), `Catálogo` (`Servicios y extras`, `Inventario` con badge de stock bajo), `Equipo` (`Equipo y turnos`, `Disponibilidad`, `Comisiones y cupones`), `Estudio` (`Página y marca`, `Integraciones`, `Configuración inicial` con progreso `N/6`). Item activo en fondo rosa suave y texto cereza (`data-on="true"`).
  - **Arriba:** logo LAIKONA (negro en modo claro, blanco en modo oscuro), botón de búsqueda rápida (`Ctrl K` -> `AdminQuickSearchDialog`), toggle para retraer barra y caja **`Tu link de citas`** con botón `Copiar`.
  - **Pie único (sin duplicados):** avatar con iniciales y punto en línea, nombre, rol, selector de rol demo, controles de `Sonido` (+ prueba de timbre), `Oscuro`/`Claro`, `Cerrar sesión` y enlace `Sitio`.
  - **Móvil (`< 47.5rem`):** la barra lateral se oculta; aparece cabecera compacta con botón `Menú` (abre cajón `MobileNav` con todos los grupos y controles), logo y búsqueda; y barra inferior fija (`.ad-bottom`, oculta en escritorio) con `Inicio`, `Agenda` (con punto de pendientes), botón central cereza `+` (`/admin/citas?new=1`), `Clientas` (o `Horarios` para `specialist`) y `Caja`.
- **Onboarding (`/admin/onboarding`):** Asistente inicial de 4 pasos (perfil del estudio + Instagram, banco/CLABE de anticipo, equipo/horarios fijos y confirmación final) vinculado a la tarjeta `"Configura tu estudio"` del dashboard.
- **Verificación RBAC:**
  - `owner`: acceso total incluyendo `Página y marca`, `Integraciones`, `Configuración inicial`, creación de usuarios en `/admin/equipo`, anulación auditada de `lockPastBookings` y lectura de `recentAuditLogs`.
  - `admin`: gestiona Citas, Cobros, Servicios, Disponibilidad, Clientas (incluyendo descarga ARCO y filtro inverso), Caja, Inventario y Manicuristas; no ve el grupo `Estudio`, ni modifica citas pasadas si `lockPastBookings` está activo (`403 PAST_BOOKING_LOCKED`).
  - `specialist`: solo ve `Inicio`, sus propias `Citas y agenda`, su propia `Disponibilidad` y su propia `Caja` / `Comisiones y cupones`; bloqueado en rutas ajenas (`403`).

---

## 6. Panel Admin — Módulos Críticos

| Ruta | Propósito | Acciones verificables clave |
| :--- | :--- | :--- |
| `/admin` | Dashboard operativo minimalista | Encabezado con fecha + etiqueta `Modo demo` con tooltip, saludo serif `Hola, <nombre>`, resumen dinámico, botón `Buscar clienta o cita` (`Ctrl K`) y `+ Nueva cita`. Tarjeta **`Necesita tu atención`** (anticipos SPEI con `Ver comprobante` en `Dialog` y `Confirmar cita` inline vía `PATCH /api/admin/bookings`, citas terminadas sin cobrar con `Cobrar $X` -> `/admin/citas?collect=...`, lista de espera con `Avisar` por WhatsApp, y alertas de inventario; muestra `Todo al día` cuando llega a 0). Fila de **6 KPIs** (`Citas hoy`, `Caja neta hoy`, `Por cobrar` en ámbar/verde, `Propinas`, `Calificación`, `Inasistencias`) en 6 cols escritorio / 3 tablet / 2 móvil. Layout 2 columnas: **`Agenda`** (tabs `Hoy`/`Mañana` con navegación por teclado, filtro por artista, línea cereza `Ahora`, filas con barra por artista, chips de estado y acciones `Cobrar`/`Validar`/`WhatsApp`) y columna derecha con tarjeta cereza **`Tu página de reservas`** (`EN VIVO`, cerezas blancas, link copiable, `Ver página`, `Bio-link /links`, `Código QR`, `Compartir`), **`Configura tu estudio`** (`N de 6` con `ProgressBar` y pasos desplegables, oculta al completarse), **`Corte de hoy`** (4 filas punteadas -> `/admin/caja`) y **`Cerca de su premio`** (barras segmentadas de sellos -> `/admin/clientas`). |
| `/admin/onboarding` | Asistente inicial del salón | Configura nombre, ubicación, `@instagram`, banco/CLABE `$200 MXN` y marca `onboardingCompleted: true`. |
| `/admin/citas` | Agenda visual, búsqueda rápida, reprogramación y cobro | Vista visual por especialista (muestra `recurringBlocks`), clic en bloque abre **Popover rápido** (`BookingQuickPopover`: `@instagram`, transiciones válidas, WhatsApp, recordatorio, **`Solicitar reprogramación`** 1 clic (`C6` -> `PATCH /api/admin/bookings` con `Abrir WhatsApp` + `Copiar enlace` hacia `?action=reschedule`), `$ Cobrar`, `Ver ficha` -> `/admin/clientas?q=<tel>`). Botón **`Búsqueda rápida de hora`** (`GET /api/availability?mode=quick_search`) abre nueva cita prellenada. **Drawer de Cobro Dividido** (`CheckoutDrawerDialog`, también vía `?collect=<bookingId>`): resta anticipo previo, permite múltiples métodos de pago + propina universal por especialista + extra rápido + canje de premio de sellos, otorga sello del día y ofrece botón 1 clic **`Agendar siguiente retoque (+21 días)`**. Maneja `403 PAST_BOOKING_LOCKED` y usa alineación `tabular-nums`. |
| `/admin/servicios` | Catálogo VIP + Preview en vivo | Pestañas `Servicios` y `Extras / Add-ons` con `CardFrame` limpio (`C4`); soporte de `isStartingPrice` (`Desde $...`) y switch **`Servicio privado / VIP (solo link directo)`** (`C9` -> `isPrivate: true`); editar actualiza `VISTA PREVIA EN VIVO`; `Copiar link` copia `/reservar/[slug]`. |
| `/admin/disponibilidad` | Turnos fijos, bloqueos, festivos MX y Troubleshooter Visual | Edición de **horarios fijos** (`10:00 · 13:30 · 16:30` / `14:00 · 16:00 · 18:00`) + switch opt-in `optimizeContinuousSlots` (`C1`, solo en modo continuo), pestaña **`Bloqueos recurrentes`** (semanales/mensuales con `untilDate`, pausar/reanudar, eliminar), pestaña **`Excepciones y vacaciones`** con rangos multi-día (`kind: 'override_range'`), nota pública (`publicNote`), redirección OOO (`redirectStaffId`) y botón idempotente **`Cargar días festivos oficiales MX`** (`C7` -> `kind: 'preload_mx_holidays'`), y **Troubleshooter Visual** (`C3` con chips de filtro + estado por hora vía `GET /api/admin/availability?mode=diagnose`). |
| `/admin/equipo` | Manicuristas + Admins RBAC | Agregar manicurista con % de comisión y servicios asignados; invitar/administrar usuarios del panel (`owner` únicamente). |
| `/admin/clientas` | CRM, Filtro inverso, Sellos y ARCO | Directorio A–Z con búsqueda (`?q=<phone>` prefiltra automáticamente desde `/admin/citas`) y `@instagram`. Pestaña **Retención** con **Filtro inverso *"Sin reserva en los últimos N días"*** (`21 días · Retoque`, `30 días`, `45 días · Reactivación`, `60 días` vía `GET /api/admin/clients?inactiveDays=N`) + botón 1 clic **`Enviar mensaje de regreso (WhatsApp)`**. Panel **`Clientas cerca de su premio`** (`6 / 8 sellos` + WhatsApp). Diálogo **Ficha**: muestra sellos de fidelidad (`currentStamps / stampsRequired`) y botón **`Descargar datos (ARCO)`** (`owner`/`admin` -> `arco-<id>.json`). |
| `/admin/caja` | Fuga de ingresos, Pagos divididos, Arqueo y Cupones | Alerta prominente **`Citas sin cobrar` (Fuga de ingresos)** (`uncollectedBookings`, soporta `?tab=sin-cobrar`) con total vs. pagado vs. saldo restante y botón 1 clic **`Ir a cobrar`** (`/admin/citas?collect=<bookingId>`). Desglose de **pagos divididos** (`paymentSplits`) y **propinas universales por especialista** en Ventas y Comisiones. Validación 1 clic de anticipos SPEI (`?tab=anticipos`), arqueo de efectivo, registro de egresos, `Exportar reporte CSV` (registra `csv_exported` en auditoría) y Cupones/Gift Cards. |
| `/admin/inventario` | Stock y alertas | Alertas de stock bajo, botones `+1 Entrada`, `-1 Consumo` y `Vender (Caja)` (descuenta inventario y suma a Caja automáticamente). |
| `/admin/marca` | Marca, WCAG AA, Wireframe Layouts, QR SVG, Fidelidad y Auditoría | Presets de tema Astryx + **Validador de contraste WCAG 2.1 AA en vivo** (`C5` vía `checkThemeAccentContrast`), **Tarjetas wireframe** de vista de calendario (`Mes` / `Semana` / `Columnas`), guardado inteligente con detección de cambios (`isBrandDirty`, `C4`), **Generador de QR SVG/PNG descargable** (`QrShareCard` para `/reservar` y `/links`), configuración de **Tarjeta de Sellos LAIKONA**, políticas operativas (`lockPastBookings`, `maxActiveBookingsPerClient`, `privacyPolicyVersion`, `optimizeContinuousSlots`) y tabla de **Registro de Auditoría** (`recentAuditLogs`, visible únicamente para `owner`). |
| `/admin/integraciones` | Calendar, WhatsApp, SMS, Analytics y Pagos | Toggle Google Calendar (destino + conflictos), simulador WhatsApp (`POST /api/admin/integrations/whatsapp-simulate`), switches de workflows (`Correo`, `WhatsApp`, `SMS Twilio`), `Meta Pixel ID` / `GA4` / `Google Review URL` y selector `paymentMode`. |

---

## Gatekeeper Único de Verificación
Antes de dar cualquier cambio por terminado debe pasar en verde con **0 errores y 0 warnings**:
```bash
npm run verify
```
Que ejecuta secuencialmente:
`typecheck` -> `guardrails` (self-test + AST + seed parity + `oxlint --deny-warnings`) -> `deadcode` (`knip`) -> `test` (unitarios + concurrencia + seguridad + `fast-check` property tests) -> `build` (`next build`) -> `doctor` (`astryx doctor --built .next`).
