# ADR-0006: Rediseño del módulo Clientas (CRM), ficha técnica de uñas y consultas puntuales

- **Estado:** Aceptado
- **Fecha:** 2026-11-27
- **Área:** CRM de Clientas (`/admin/clientas`), Integridad de Datos y Rendimiento Serverless

## Contexto

El módulo `/admin/clientas` evolucionó de un directorio alfabético básico hacia el centro de retención y atención personalizada de LAIKONA NAILS, exponiendo cuatro cuellos de botella técnicos y operativos:

1. **Presupuesto de subrequests en Cloudflare Workers Free:** `GET /api/admin/clients` invocaba `getRepository().getSnapshot()`, leyendo decenas de tablas para consultas puntuales como clientas inactivas (`?inactiveDays=`) o descarga de expediente ARCO (`?exportClientId=`), arriesgando el límite de 50 subrequests de Workers Free (véase [ADR-0001](./0001-dual-repository-y-presupuesto-subrequests-workers.md)).
2. **Ciclo de vida incompleto del perfil de clienta:** no era posible corregir errores de captura en `fullName` o `phoneE164`, ni eliminar registros de prueba o duplicados vacíos sin arriesgar la integridad histórica de citas, paquetes o redenciones de cupones.
3. **Ausencia de ficha técnica estructurada de salón de uñas sin migración SQL:** las manicuristas necesitaban registrar rápidamente forma, largo, base favorita y alertas dermatológicas/técnicas (ej. `Cutícula sensible`, `Alergia a acetona`, `Uña delgada`) sin perder notas libres existentes ni exigir una migración SQL nueva.
4. **Fricción operativa en escritorio y móvil (`390px`):** faltaban KPIs de CRM (LTV, frecuentes/VIP, alertas), filtros/ordenamiento rápidos, prellenado en 1 clic al agendar desde la ficha, fotos de inspiración en historial, protección contra peticiones colgadas (`AbortSignal.timeout`) y carga diferida de pestañas secundarias.

## Decisión

1. **Eliminación total de `getSnapshot()` en `GET /api/admin/clients` mediante consultas puntuales:**
   - Reemplazar todas las rutas de lectura en `src/app/api/admin/clients/route.ts` por métodos acotados en `src/lib/repositories/port.ts`, `src/lib/repositories/db.ts` y `src/lib/repositories/supabase-repo.ts`:
     - `listClients()` / `listClientsAsync()` (<= 1 consulta),
     - `getNearRewardClients()` / `getNearRewardClientsAsync()` (<= 4 consultas),
     - `getInactiveClients(inactiveDays)` / `getInactiveClientsAsync(inactiveDays)` (<= 3 consultas; enriquece cada registro con `lastServiceId` y `lastServiceName` para la pestaña de retención),
     - `getClientArcoExport(clientId)` / `getClientArcoExportAsync(clientId)` (<= 8 consultas; excluye `internalNotes` y responde con `Cache-Control: private, no-store`).
   - Verificar explícitamente el presupuesto de subrequests y la ausencia de `getSnapshot()` en `src/app/api/admin/clients/route.test.ts` y `src/lib/repositories/supabase-repo.test.ts`.

2. **Edición completa de identidad (`fullName` / `phone`) y eliminación segura con guarda de historial:**
   - **Edición (`PATCH /api/admin/clients`):** extender `PatchClientSchema` (`src/lib/contracts/clients.ts`) con `fullName` opcional (recortado `2..120` caracteres) y `phone` opcional (normalizado a E.164). `updateClientNotes` valida unicidad de teléfono excluyendo a la propia clienta (`phonesMatchE164` en Demo; consulta puntual `.in('phone_e164', [...]).neq('id', clientId)` + manejo de código PostgreSQL `23505` en Supabase, <= 2 consultas), respondiendo `409 CLIENT_EXISTS` en colisión, `404 CLIENT_NOT_FOUND` si no existe y `401`/`403` por RBAC (`owner`/`admin` únicamente).
   - **Eliminación segura (`DELETE /api/admin/clients?id=<clientId>`):** validada con `DeleteClientQuerySchema`, restringida a `owner`/`admin` (`401`/`403`) e implementada con `deleteClientProfile(clientId)` (<= 4 consultas en Supabase).
   - **Invariante contable y de historial:** antes de borrar, se verifica si la clienta tiene citas (`bookings`), paquetes (`client_packages`) o redenciones de cupones (`coupon_redemptions`); si existe historial, rechaza con HTTP `409` (`CLIENT_HAS_HISTORY`). Para clientas vacías (pruebas o duplicados sin historial), el borrado respeta las FKs de PostgreSQL (`ON DELETE CASCADE` / `SET NULL` + captura de `23503`) y replica la limpieza equivalente en Demo, respondiendo `200 { ok: true, deletedId, fullName }`.

3. **Ficha técnica de uñas sin migración SQL serializada en `clients.notes`:**
   - Crear el módulo puro `src/components/admin/clientas/nailTechProfile.ts` (cubierto por pruebas unitarias y de round-trip `fast-check` en `nailTechProfile.test.ts`) con catálogos tipados:
     - `NAIL_SHAPES`: `Almendra`, `Coffin`, `Cuadrada`, `Stiletto` (selección única alternable),
     - `NAIL_LENGTHS`: `Corto`, `Medio`, `Largo` (selección única alternable),
     - `NAIL_BASES`: `Rubber`, `Acrílico`, `Gel` (selección única alternable),
     - `NAIL_ALERTS`: `Cutícula sensible`, `Alergia a acetona`, `Uña delgada` (selección múltiple con tono `warning`).
   - `serializeNailTechNotes(profile, freeNotes)` escribe una cabecera legible en la primera línea (`[Ficha técnica] Forma: ... · Largo: ... · Base: ... · Alertas: ...`) seguida de las notas libres; `parseNailTechNotes(rawNotes)` extrae sin pérdidas los chips y conserva intactas las notas heredadas en texto plano que no tienen cabecera. `formatNailTechBadges` proyecta etiquetas compactas para el directorio.

4. **Métricas CRM (LTV), directorio inteligente, retención con `touchUpDays` dinámico, handoff a Agenda, resiliencia y UX móvil:**
   - **Métricas puras (`src/components/admin/clientas/clientasMetrics.ts` + `clientasMetrics.test.ts`):** `computeSingleClientMetrics`, `computeClientMetricsMap`, `computeClientDirectoryKpis` (4 KPIs ejecutivos: `totalClients`, `vipClients`, `packageOrRewardClients`, `alertOrInactiveClients`), `filterAndSortClients` (búsqueda sin acentos, 6 filtros `all | vip | package | near_reward | birthday | alerts`, 4 ordenamientos `alpha | visits | spent | last_visit`) y `buildClientNewBookingUrl`.
   - **Ficha y alta (`ClientProfileDialog.tsx`, `NewClientDialog.tsx`, `clientasActions.ts`):**
     - `ClientProfileDialog` muestra tira de 5 métricas (LTV total gastado, visitas completadas, ticket promedio, profesional habitual y última visita), historial completo expandible (`Ver todas (N)`) con precio, enlace a Agenda (`/admin/citas?q=<bookingCode>`) y miniaturas seguras `/api/media/` de fotos de inspiración con vista ampliada, edición de `fullName`/`phone`/cumpleaños (`DateInput` de Astryx) y chips técnicos interactivos, `<LayoutFooter hasDivider>` fijo con **Agendar cita** / **Cerrar** / **Guardar ficha**, y bloque colapsable de exportación ARCO + eliminación confirmada (`ConfirmActionDialog`).
     - `NewClientDialog` utiliza `FormDialog` (bloqueo de doble envío + pie fijo) y `DateInput` para cumpleaños.
     - `clientasActions.ts` endurece todas las llamadas HTTP (`createClientProfileRequest`, `saveClientProfileRequest`, `deleteClientProfileRequest`, paquetes y campañas) con `AbortSignal.timeout(15_000)` y lectura segura de respuestas no-JSON para evitar modales colgados en red móvil.
   - **Handoff 1 clic a Agenda (`/admin/citas?new=1`):** `src/components/admin/citas/useCitasWorkspace.ts` y `NewBookingDialog.tsx` leen `clientName`, `clientPhone`, `staffId` y `clientInstagram` al abrir `?new=1`, enriquecen `@instagram` si coincide una clienta, respetan el bloqueo de profesional del rol `specialist` y limpian la URL de vuelta a `/admin/citas`.
   - **Retención, Lealtad, carga diferida y móvil (`390px`):**
     - `ClientDirectoryTab.tsx` integra KPIs, pills de filtro, selector de orden, etiquetas técnicas/VIP/paquete, LTV, última visita y botón 1 clic **Agendar**.
     - `ClientRetentionTab.tsx` añade **Ver ficha** en 1 clic, muestra el **Último servicio** (`lastServiceName`) y reemplaza el umbral fijo de `21` días por `normalizeTouchUpDays(settings.landingContent?.touchUpDays)` ([ADR-0005](./0005-caja-ventas-integridad-contable-y-configuracion-sin-migraciones.md)).
     - `ClientLoyaltyTab.tsx` añade buscador instantáneo de clientas dentro de la asignación de paquetes.
     - `src/app/admin/clientas/page.tsx` carga diferidamente `ClientRetentionTab`, `ClientLoyaltyTab`, `ClientProfileDialog` y `NewClientDialog` mediante `next/dynamic(..., { ssr: false })` con `SkeletonBlock`; `src/app/admin/admin.css` añade estilos responsivos (`.ad-client-kpi-grid`, `.ad-tech-chip`, `.ad-inspo-thumb`, `.ad-cl-filter-card`, `.ad-cl-touch-btn` de `44px`) con `0px` de desbordamiento horizontal a `390px` en modo claro y oscuro.

## Alternativas consideradas

- **Crear una migración SQL con columnas dedicadas (`nail_shape`, `nail_length`, `nail_base`, `nail_alerts[]`) en `public.clients`:** descartado para evitar cambios de esquema en producción mientras el formato estructurado en `clients.notes` es legible por humanos, compatible con exportaciones ARCO existentes y cubierto por pruebas de propiedad `fast-check`.
- **Permitir borrado en cascada (hard delete) o soft delete de clientas con citas:** descartado porque eliminar una clienta con citas destruiría integridad de `bookings`, `cash_register_entries` y reportes históricos; bloquear con `409 CLIENT_HAS_HISTORY` permite limpiar registros vacíos/duplicados sin tocar contabilidad.
- **Mantener `getSnapshot()` en `GET /api/admin/clients` para simplificar el cálculo de inactivas y ARCO:** descartado porque cada invocación consumía decenas de subrequests PostgREST, incompatible con el margen de seguridad de 50 subrequests de Cloudflare Workers Free.
- **Cargar estáticamente las 3 pestañas y 2 modales en `src/app/admin/clientas/page.tsx`:** descartado para mantener ágil la carga inicial del directorio en dispositivos móviles.

## Consecuencias y trade-offs

- **Positivas:**
  - `GET /api/admin/clients` opera holgadamente dentro del presupuesto de Cloudflare Workers Free (`<= 1..8` consultas según modo) y el ciclo crear → editar → eliminar clientas vacías es completo y seguro.
  - Las manicuristas y recepción disponen de ficha técnica estructurada, LTV, fotos de inspiración, retención alineada con `touchUpDays` y prellenado en 1 clic hacia `/admin/citas?new=1`, todo usable sin desbordamiento en `390px`.
  - `AbortSignal.timeout(15_000)` y `FormDialog` eliminan estados colgados en conexiones lentas.
- **Trade-offs y riesgos asumidos:**
  - Al residir la ficha técnica dentro de `clients.notes`, las búsquedas o analíticas SQL agregadas por tipo de base (`Rubber` vs. `Acrílico`) requerirían parseo en aplicación o promover campos a JSONB/columnas en una migración futura si se agregan reportes por técnica.
  - Si una clienta solicita cancelación/anonimización ARCO teniendo citas históricas, el bloqueo `409 CLIENT_HAS_HISTORY` preserva la integridad contable y requiere un flujo dedicado de anonimización de PII en vez de `DELETE` directo.

## Evidencia y archivos clave

- `src/lib/contracts/clients.ts`
- `src/lib/contracts/contracts.test.ts`
- `src/lib/repositories/port.ts`
- `src/lib/repositories/db.ts`
- `src/lib/repositories/supabase-repo.ts`
- `src/lib/repositories/db.test.ts`
- `src/lib/repositories/supabase-repo.test.ts`
- `src/app/api/admin/clients/route.ts`
- `src/app/api/admin/clients/route.test.ts`
- `src/components/admin/citas/useCitasWorkspace.ts`
- `src/components/admin/citas/NewBookingDialog.tsx`
- `src/components/admin/clientas/nailTechProfile.ts`
- `src/components/admin/clientas/nailTechProfile.test.ts`
- `src/components/admin/clientas/clientasMetrics.ts`
- `src/components/admin/clientas/clientasMetrics.test.ts`
- `src/components/admin/clientas/clientasActions.ts`
- `src/components/admin/clientas/ClientProfileDialog.tsx`
- `src/components/admin/clientas/NewClientDialog.tsx`
- `src/components/admin/clientas/ClientDirectoryTab.tsx`
- `src/components/admin/clientas/ClientRetentionTab.tsx`
- `src/components/admin/clientas/ClientLoyaltyTab.tsx`
- `src/app/admin/clientas/page.tsx`
- `src/app/admin/admin.css`
- `src/lib/booking/recurrence.ts`
