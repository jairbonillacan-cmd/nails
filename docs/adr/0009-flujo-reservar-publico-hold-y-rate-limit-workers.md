# ADR-0009: Flujo público de reserva en 4 pasos, apartados discriminados, media R2 sin huérfanos y rate limiting en Workers

- **Estado:** Aceptado
- **Fecha:** 2026-11-27
- **Área:** Flujo de Reserva Público (`/reservar`), Integridad de Media R2 y Seguridad en Cloudflare Workers

## Contexto

La auditoría integral del flujo público de reserva (`/reservar`, `/reservar/[slug]`) detectó cuatro debilidades estructurales que afectaban conversión móvil, confiabilidad bajo redes 4G y estabilidad operativa en Cloudflare Workers:

1. **Fricción innecesaria y carrera contra el reloj en 5 pasos:** el paso 5 (`Anticipo`) duplicaba los datos SPEI, CLABE y carga de comprobante que ya existen completos en `/cita/[token]` (`CitaDepositSection`), inflaba el payload JSON de `POST /api/bookings` con imágenes base64 en conexiones móviles y presionaba a la clienta a transferir y subir captura dentro de un apartado de 5 minutos (`slotHoldMinutes`). Además, el flujo forzaba un clic adicional (`Continuar`) tras elegir horario, mostraba `Profesional` aun con una sola especialista libre, preseleccionaba silenciosamente el primer servicio en `/reservar`, apilaba avisos superiores y ocultaba los horarios debajo del pliegue en `375×812` por un calendario mensual con días pasados deshabilitados.
2. **Fallos silenciosos en el apartado de horario (`POST /api/slot-holds`) y fuente dual de `sessionToken`:** anteriormente `requestSlotHold` trataba cualquier código distinto a `409` (`429`, `400`, `500`, red o respuesta no-JSON) como éxito sin hold, dejando avanzar a la clienta sin lugar apartado. En paralelo, el cliente enviaba un `sessionToken` en el cuerpo JSON mientras el servidor emitía la cookie `HttpOnly` `nails_client_session`.
3. **Objetos huérfanos en Cloudflare R2 (`media_assets` con `bookingId: null`):** `POST /api/bookings` y `db.ts` subían fotos de inspiración y comprobantes **antes** de verificar idempotencia (`Idempotency-Key`), límite de citas activas (`409 MAX_ACTIVE_BOOKINGS`) y choques de horario (`409 SLOT_TAKEN`), dejando objetos y registros sin cita asociada tras reintentos o colisiones.
4. **Rate limiting en memoria por isolate en Cloudflare Workers (`C3`):** `src/lib/security/rate-limit.ts` almacena contadores deslizantes en `globalThis.nailsRateLimitStore` (`Map` en memoria). En Node local o un único proceso funciona de manera exacta, pero en Cloudflare Workers cada isolate y cada PoP edge mantiene memoria independiente y efímera; bajo tráfico distribuido o reciclado de isolates, el límite nominal (p. ej. `40 req/min` en `/api/bookings` o `20 req/min` en `/api/slot-holds`) es orientativo y no globalmente estricto.

## Decisión

### 1. Flujo público simplificado a 4 pasos y pago/comprobante centralizado en `/cita/[token]`

- **Máquina de estados de 4 pasos (`src/components/booking/bookingMachine.ts`):** `service → schedule → staff → details` (`Paso 4 de 4: Tus datos`, o 3 pasos cuando una sola especialista está libre para el horario elegido y `staff` se omite automáticamente mostrando `"Te atiende <Nombre>"` en el resumen).
- **Anticipo en `/cita/[token]`:** el paso final del wizard muestra un aviso compacto del monto de anticipo configurado (sin respaldos fijos `20000`) junto con cupones y el consentimiento LFPDPPP obligatorio, y envía `POST /api/bookings` con `proofDeliveryMethod: 'none'`. Una vez creada la cita, la redirección inmediata a `/cita/[token]` presenta CLABE copiable, carga de comprobante (R2) y DM de Instagram (`CitaDepositSection`) sin carrera contra el temporizador de apartado.
- **Navegación e historial (`A2`, `A3`, `B1`, `B2`, `B3`, `B6`, `B7`, `B8`, `C2`):**
  - Bare `/reservar` arranca sin servicio preseleccionado y no escribe `?servicio=` hasta la elección explícita de la clienta.
  - `ScheduleCalendarView` implementa vista semanal compacta (`Semana`) y mensual (`Mes`) respetando `defaultBookingLayout`, `enabledBookingLayouts` y `?layout=`, predeterminando la tira de 7 días en móvil (`<= 640px`) y ocultando el selector `12h/24h` en móvil para que el primer horario aparezca sobre la barra fija a `375×812` sin scroll.
  - Elegir horario aparta y avanza automáticamente; `?paso=` sincroniza con `history.pushState` en avances y `popstate` en `src/lib/hooks/useBookingUrlSync.ts` para que el botón Atrás del navegador regrese un paso dentro de `/reservar`.
  - Los enlaces con `?slot=` y `?offer=` (lista de espera prioritaria de `WAITLIST_OFFER_TTL_MINUTES`) consultan `GET /api/availability?offer=<token>`, auto-apartan el horario vía `POST /api/slot-holds` con `waitlistOfferToken` y aterrizan directamente después de `schedule` (o muestran el banner de conflicto con sugerencias si el hueco ya se ocupó).
  - Un único aviso superior con prioridad estricta `offer > draft > repeat`, enlace discreto `"¿Ya viniste? Llena tus datos con WhatsApp"` y property test `fast-check` (500 ejecuciones) garantizando que `step` nunca queda en un paso post-horario sin `selectedSlot`.

### 2. Unión discriminada de apartados y `sessionToken` canónico por cookie `HttpOnly`

- `requestSlotHold` (`src/components/booking/bookingApi.ts`) retorna la unión discriminada `held | conflict | rate_limited | policy | unavailable` con timeout de 15 s y lectura de `Retry-After`. Solo `held` (o ausencia de hold cuando `enableSlotHold === false`) permite avanzar; `rate_limited`, `policy` y `unavailable` permanecen en `schedule` con `BookingConflictBanner` visible (`collapsible={false}`) y botón `"Reintentar"`.
- La cookie `HttpOnly` `nails_client_session` (`src/lib/auth/client-session.ts`) es la **única fuente canónica** de `sessionToken` en `GET /api/availability`, `POST|DELETE /api/slot-holds` y `POST /api/bookings`. El cliente ya no genera ni envía `sessionToken` en el cuerpo JSON ni mantiene un hook local de sesión.

### 3. Cero objetos huérfanos en Cloudflare R2 en `POST /api/bookings`

- `src/app/api/bookings/route.ts` ya no llama a `persistBookingMediaField` antes de invocar `createBookingWithExtras`.
- Tanto `src/lib/repositories/db.ts` como `src/lib/repositories/supabase-repo.ts` ejecutan estrictamente el siguiente orden:
  1. Verificación de idempotencia (`Idempotency-Key`) -> si es reintento, retorna la cita existente con `0` subidas y `0` filas nuevas en `media_assets`.
  2. Validación en memoria de formato, firma mágica, tamaño (`<= 2.5 MB`) y listas blancas de URL (`validateMediaDataUrl` / contratos) -> falla con `400` sin escribir en R2 ni en DB.
  3. Verificación de disponibilidad, ofertas prioritarias de lista de espera, límite de citas activas y commit atómico (`withWriteLock` / RPC `create_booking_atomic`) -> cualquier `409` aborta con `0` subidas y `0` huérfanos.
  4. Solo tras obtener `bookingId` confirmado, se suben los data URLs pendientes a R2, se registran directamente ligados a `(bookingId, clientId)` y se limpian con `deleteStoredMedia` si falla una segunda subida.

### 4. Trade-off documentado y ruta de evolución para Rate Limiting en Cloudflare Workers (`C3`)

- **Estado vigente aceptado:** mantener `src/lib/security/rate-limit.ts` (`globalThis` sliding window en memoria keyed por `cf-connecting-ip`) como primera línea de defensa sin subrequests adicionales ni costo mensual mientras el estudio opera en **Cloudflare Workers Free**. Esta capa se complementa con controles autoritativos en base de datos que sí son globales e independientes del isolate:
  - Exclusión atómica en PostgreSQL (`bookings_no_overlap_per_staff`, `slot_holds`), límite de citas activas por teléfono (`maxActiveBookingsPerClient`), `Idempotency-Key` único, bloqueo por intentos OTP (`OTP_MAX_ATTEMPTS = 5`), verificación de firma HMAC en cookies y webhooks, y WAF/Bot Fight Mode en Cloudflare DNS.
- **Ruta de endurecimiento planificada cuando escale el tráfico o se detecte abuso distribuido:**
  1. **Opción preferida (cero subrequests a DB):** agregar Cloudflare **Rate Limiting API binding** (`unsafe.bindings` / `ratelimits` en `wrangler.jsonc`, p. ej. `PUBLIC_BOOKING_LIMITER` y `PUBLIC_HOLD_LIMITER`) envuelto detrás de `checkRateLimit` con fallback al mapa local en Node/test.
  2. **Alternativa de precisión global exacta:** un **Cloudflare Durable Object** ligero por bucket/IP (requiere plan Workers Paid) para cuotas exactas multi-PoP (p. ej. OTP WhatsApp y creación de citas).
  - La interfaz `checkRateLimit` en `src/lib/security/rate-limit.ts` aísla el almacenamiento para que el cambio a binding nativo o Durable Object no modifique los handlers HTTP.

## Alternativas consideradas

- **Mantener 5 pasos ampliando `slotHoldMinutes` a 15 minutos:** descartado porque bloquear horarios 15 minutos por carrito abandonado reduce la disponibilidad visible en horas pico de sábado y sigue duplicando el bloque SPEI ya existente en `/cita/[token]`.
- **Subir archivos a R2 antes del commit y depender solo del cron diario de retención para purgar huérfanos:** descartado porque un pico de reintentos o choques `409` acumularía objetos sin dueño hasta el siguiente cron y complicaría la auditoría LFPDPPP de datos personales de clientas.
- **Mover el rate limiting a una tabla de Supabase PostgreSQL:** descartado porque añadiría 1–2 subrequests PostgREST en cada `GET /api/availability` y `POST /api/slot-holds`, consumiendo presupuesto de Workers Free y convirtiendo ráfagas abusivas en carga sobre la base principal.

## Consecuencias y trade-offs

- **Positivas:**
  - Conversión móvil más rápida: 4 pasos (3 cuando una especialista está libre), primer horario visible sobre el pliegue a `375×812` y payload liviano en `POST /api/bookings`.
  - Cero avances silenciosos sin apartado, cero archivos huérfanos en R2 por `409`/reintentos, cero filtración de slots en oferta prioritaria de lista de espera y única fuente `HttpOnly` para `sessionToken`.
  - Compatibilidad retroactiva preservada para enlaces legados (`?paso=anticipo` y borradores `step: 'payment'` redirigidos limpiamente a `details`).
- **Trade-offs y riesgos asumidos:**
  - El comprobante SPEI se sube un paso después (en `/cita/[token]`): el estudio mitiga cualquier olvido mostrando el acceso inmediato tras apartar y enviando el enlace mágico por WhatsApp/correo.
  - El rate limiter en memoria (`src/lib/security/rate-limit.ts`) es best-effort por isolate en Workers Free hasta activar el binding nativo de Cloudflare Rate Limiting o Durable Objects.

## Evidencia y archivos clave

- `src/components/BookingWidget.tsx`
- `src/components/booking/bookingMachine.ts`
- `src/components/booking/bookingMachine.test.ts`
- `src/components/booking/bookingApi.ts`
- `src/components/booking/bookingApi.test.ts`
- `src/components/booking/bookingViewHelpers.ts`
- `src/components/booking/BookingConflictBanner.tsx`
- `src/components/booking/BookingSummaryCard.tsx`
- `src/components/booking/ClientConfirmStep.tsx`
- `src/components/booking/DepositCard.tsx`
- `src/components/booking/ScheduleCalendarView.tsx`
- `src/components/booking/scheduleCalendar.test.ts`
- `src/components/booking/ScheduleStep.tsx`
- `src/components/cita/CitaDepositSection.tsx`
- `src/lib/hooks/useBookingFlowActions.ts`
- `src/lib/hooks/useBookingSelectionState.ts`
- `src/lib/hooks/useBookingUrlSync.ts`
- `src/lib/hooks/useBookingUrlSync.test.ts`
- `src/lib/hooks/useBookingDraft.ts`
- `src/lib/auth/client-session.ts`
- `src/lib/security/rate-limit.ts`
- `src/app/api/availability/route.ts`
- `src/app/api/slot-holds/route.ts`
- `src/app/api/bookings/route.ts`
- `src/app/api/bookings/wave1-safety.test.ts`
- `src/lib/repositories/db.ts`
- `src/lib/repositories/supabase-repo.ts`
- `src/lib/repositories/supabase-repo.test.ts`
- `e2e/nails.e2e.mjs`
- `wrangler.jsonc`
