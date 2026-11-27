# ADR-0003: Concurrencia de reservas, apartados temporales, bloqueos de calendario y lista de espera FIFO

- **Estado:** Aceptado
- **Fecha:** 2026-11-27
- **Área:** Motor de Disponibilidad, Concurrencia y Agenda

## Contexto

En un salón de uñas con alta demanda en fines de semana y quincenas, varias clientas compiten por el mismo horario de una especialista mientras el equipo también bloquea tiempos desde el panel (comidas, cursos, vacaciones o pausas semanales recurrentes). Existen cuatro fuentes clásicas de fallos en producción:

1. **Doble reserva concurrente ("double booking"):** dos peticiones `POST /api/bookings` simultáneas sobre el mismo bloque de una especialista.
2. **Reintentos de red móvil (4G):** una clienta toca dos veces "Apartar mi cita" o la app reintenta un `POST`, duplicando citas o descontando un cupón dos veces.
3. **Secuestro o liberación indebida de apartados temporales (`slot_holds`):** un tercero intenta liberar el hold de otra clienta pasando un `sessionToken` arbitrario.
4. **Inversión de orden FIFO en lista de espera:** cuando dos clientas se registran en el mismo milisegundo (o con precisión de microsegundos en PostgreSQL), un desempate inestable o un arreglo insertado con `unshift` (más reciente primero) puede notificar a la segunda clienta antes que a la primera.

## Decisión

1. **Prevención matemática de solapamientos en PostgreSQL + RPC transaccional atómica:**
   - La tabla `public.bookings` aplica una restricción de exclusión temporal GiST (`CONSTRAINT no_overlapping_active_bookings EXCLUDE USING gist (staff_id WITH =, occupied_range WITH &&) WHERE (status IN ('pending_payment', 'pending_confirmation', 'confirmed'))` en `supabase/migrations/0001_initial_schema.sql`), sincronizada automáticamente con `occupied_start_at`/`occupied_end_at` mediante el trigger `sync_booking_occupied_range` (`supabase/migrations/0003_phase1_hardening.sql`).
   - La creación de citas en producción pasa por la RPC transaccional `public.create_booking_atomic(...)` (`0003_phase1_hardening.sql`), que en una sola transacción:
     - verifica `idempotency_key` (devolviendo la cita existente si el reintento repite la llave `Idempotency-Key`),
     - purga holds expirados y valida propiedad del `slot_hold` con `FOR UPDATE`,
     - inserta `bookings` y `booking_addons`,
     - libera el hold consumido,
     - valida y redime cupones/gift cards con bloqueo `FOR UPDATE` en `public.coupons` y registro en `public.coupon_redemptions`,
     - encola el evento en `public.outbox_events`.
   - En colisión concurrente, `POST /api/bookings` (`src/app/api/bookings/route.ts`) devuelve HTTP `409` (`code: 'SLOT_TAKEN'`) acompañado de `suggestedSlots` calculados sin perder los datos del formulario.
   - En modo Demo local (`src/lib/repositories/db.ts`), `withWriteLock` serializa las mutaciones y replica las mismas comprobaciones de solapamiento, idempotencia y holds.

2. **Apartados temporales (`slot_holds`) de 5 minutos atados a cookie `httpOnly` firmada:**
   - `public.slot_holds` aplica `CONSTRAINT no_overlapping_slot_holds EXCLUDE USING gist (staff_id WITH =, held_range WITH &&)` (`0003_phase1_hardening.sql`) y sincroniza la tabla sin PII `public.public_busy_intervals` para refresco vía Supabase Realtime.
   - La identidad del apartado vive en la cookie firmada HMAC-SHA256 `nails_client_session` (`HttpOnly`, `SameSite=Lax`, `Secure` en producción, TTL 24 h) administrada por `src/lib/auth/client-session.ts`.
   - `POST /api/slot-holds` emite/reutiliza la cookie mediante `getOrCreateClientSession(request)` y `DELETE /api/slot-holds` (`src/app/api/slot-holds/route.ts`) libera únicamente los holds ligados al token leído de la cookie (`readClientSessionToken`), ignorando cualquier token enviado en query o body para impedir liberación cruzada por terceros.
   - Los holds expirados se limpian al vuelo y cada 15 minutos con `purge_expired_slot_holds()` / `cleanupExpiredSlotHolds()` desde el cron `*/15 * * * *`.

3. **Bloqueos de horario desde el calendario: separación explícita entre `DateOverride` y `RecurringBlock`:**
   - Al hacer clic en un espacio libre de la cuadrícula de `/admin/citas`, `CalendarSlotActionDialog` (`src/components/admin/citas/CalendarSlotActionDialog.tsx`) ofrece elegir entre **Reserva manual** o **Bloquear horario** (`BlockTimeDialog.tsx`), evitando abrir un bloqueo ambiguo.
   - `BlockTimeDialog` persiste bloqueos puntuales o rangos de días como `DateOverride` (`POST /api/admin/availability`) y bloqueos repetitivos (semanales por días de la semana o mensuales con fecha límite opcional) como `RecurringBlock` (`supabase/migrations/0006_phase3a_plus_calcom_ux.sql`), consumidos directamente por el motor puro `src/lib/availability/engine.ts` (verificado con pruebas basadas en propiedades `fast-check` incluyendo transiciones DST en `src/lib/availability/engine.property.test.ts`).

4. **Orden FIFO determinista en lista de espera (monotónico + precisión de microsegundos):**
   - En modo Demo (`addWaitlistEntry` en `src/lib/repositories/db.ts`), se conserva `db.waitlist.unshift(entry)` para el orden visual más-reciente-primero, pero dentro de `withWriteLock` se fuerza un `createdAt` estrictamente monotónico (`nowMs > maxExistingMs ? nowMs : maxExistingMs + 1`) cuando dos registros ocurren dentro del mismo milisegundo.
   - En la selección del siguiente candidato (`selectNextWaitlistCandidate` en `src/lib/notifications/cascade.ts`), `compareIsoTimestampsAsc` compara milisegundos, luego microsegundos fraccionarios (`extractFractionalMicroseconds`, compatible con `timestamptz` de PostgreSQL) y finalmente `id.localeCompare` como desempate determinista.

## Alternativas consideradas

- **Validar disponibilidad solo en código TypeScript ("check-then-insert"):** descartado porque dos Workers concurrentes pueden leer el mismo hueco libre y escribir dos citas solapadas. Solo una restricción GiST en PostgreSQL garantiza exclusión matemática.
- **Aceptar `sessionToken` del cuerpo/query en `DELETE /api/slot-holds`:** descartado por riesgo de abuso (cualquier cliente podría liberar los apartados activos de otra persona); restringirlo a la cookie `HttpOnly` firmada cierra ese vector.
- **Modelar todos los bloqueos repetitivos expandiendo cientos de filas `DateOverride`:** descartado porque infla la base de datos, complica cancelar/editar una regla semanal ("Comida 12:30–13:15") y dificulta el diagnóstico en el Troubleshooter de disponibilidad.
- **Reordenar `db.waitlist` a `push` para arreglar el empate de lista de espera:** descartado porque habría cambiado el orden visual esperado por las vistas que muestran la cola más reciente arriba y no habría cubierto los empates sub-milisegundo en PostgreSQL.

## Consecuencias y trade-offs

- **Positivas:**
  - Cero reservas dobles bajo concurrencia real en PostgreSQL y en Demo; reintentos de red son idempotentes vía `Idempotency-Key`.
  - Los bloqueos puntuales y recurrentes desde `/admin/citas` comparten el mismo modelo que `/admin/disponibilidad` y reflejan bloqueos inmediatamente en `/reservar`.
  - La prioridad FIFO de la lista de espera es determinista tanto en ráfagas `<1 ms` de CI/Demo como en timestamps con microsegundos de PostgreSQL.
- **Trade-offs y riesgos asumidos:**
  - `slot_holds` requiere que el navegador del cliente acepte cookies `SameSite=Lax` de primer partido (cuando está embebido en iframe de terceros en `/reservar?embed=1`, el backend admite respaldo controlado del token de sesión solo para crear la reserva, mientras la liberación sigue protegida por cookie).
  - Las restricciones GiST en `bookings` y `slot_holds` dependen de mantener `occupied_range` / `held_range` siempre sincronizados por triggers SQL; cualquier migración futura sobre rangos debe respetar `bookings_occupied_bounds_check`.

## Evidencia y archivos clave

- `supabase/migrations/0001_initial_schema.sql`
- `supabase/migrations/0003_phase1_hardening.sql`
- `supabase/migrations/0006_phase3a_plus_calcom_ux.sql`
- `src/lib/availability/engine.ts`
- `src/lib/availability/engine.property.test.ts`
- `src/lib/auth/client-session.ts`
- `src/app/api/slot-holds/route.ts`
- `src/app/api/bookings/route.ts`
- `src/app/api/admin/availability/route.ts`
- `src/lib/repositories/db.ts`
- `src/lib/repositories/concurrency.property.test.ts`
- `src/lib/notifications/cascade.ts`
- `src/lib/notifications/cascade.test.ts`
- `src/components/admin/citas/CalendarSlotActionDialog.tsx`
- `src/components/admin/citas/BlockTimeDialog.tsx`
- `src/components/admin/citas/BlockDayDialog.tsx`
- `src/app/api/phase3-flows.test.ts`
