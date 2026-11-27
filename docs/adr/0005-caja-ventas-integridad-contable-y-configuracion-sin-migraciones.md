# ADR-0005: Evolución de Caja/Ventas, integridad contable y configuración de `/cita/[token]` sin migraciones SQL

- **Estado:** Aceptado
- **Fecha:** 2026-11-27
- **Área:** Operación Financiera (`/admin/caja`), Contabilidad y Configuración Dinámica

## Contexto

Con el sistema ya operando en producción sobre Supabase PostgreSQL (`supabase/migrations/0001_initial_schema.sql` a `supabase/migrations/0011_whatsapp_templates_extra.sql`) y Cloudflare Workers, surgieron dos necesidades operativas frecuentes en salones de uñas reales que debían resolverse **sin introducir nuevas migraciones SQL ni interrumpir despliegues**:

1. **Caja y Ventas completas y editables sin romper la integridad contable:**
   - El equipo necesitaba editar y eliminar cupones/tarjetas de regalo, ajustar el porcentaje de comisión de una especialista directamente desde Caja y registrar el pago de liquidación en 1 clic, corregir o eliminar egresos/ingresos manuales mal capturados, editar paquetes de sesiones, registrar ventas rápidas de producto descontando inventario y realizar el corte de caja diario tipo POS — todo manteniendo RBAC estricto y fluidez en teléfonos de `390px`.
   - Al mismo tiempo, permitir editar o borrar manualmente asientos vinculados a pagos divididos de citas (`bookingId !== null`) rompería la conciliación entre citas cobradas, comisiones y cierres.
2. **Personalización desde `/admin/marca` de la página mágica `/cita/[token]` y sugerencias de retoque:**
   - La dueña necesitaba controlar desde el panel las instrucciones de anticipo (`depositInstructions`), las indicaciones al llegar (`bookingInstructionsText`), la visibilidad del código QR en `/cita/[token]` (`showBookingQr`) y el intervalo de días sugerido para agendar retoque (`touchUpDays`, p. ej. 21 o 28 días) tanto en `/cita/[token]` como en el cobro de `/admin/citas`.

## Decisión

1. **Inmutabilidad estricta de cobros ligados a citas vs. editabilidad total de movimientos manuales:**
   - Definir `CashEntryPatchSchema` (`.strict()`, prohíbe `bookingId` y exige al menos un campo editable) en `src/lib/contracts/operations.ts` e implementar `updateCashEntry(id, patch)` y `deleteCashEntry(id)` en `src/lib/repositories/port.ts`, `src/lib/repositories/db.ts` y `src/lib/repositories/supabase-repo.ts` (2 consultas puntuales sin `getSnapshot()` y guarda SQL `.is('booking_id', null)`).
   - **Invariante contable:** si `bookingId !== null`, el servidor rechaza cualquier edición o eliminación con HTTP `400` (`BOOKING_LINKED_ENTRY_IMMUTABLE`); si no existe devuelve `404` (`CASH_ENTRY_NOT_FOUND`); para `specialist` devuelve `403`.
   - Exponer en `src/app/api/admin/operations/route.ts` vía `PATCH /api/admin/operations` (`kind: 'cash'`), `POST` (`kind: 'cash_update' | 'cash_delete'`) y `DELETE /api/admin/operations?kind=cash&id=<id>`.
   - En UI (`src/components/admin/caja/CajaMovementsSection.tsx` y `ManualCashEditDialog.tsx`), los cobros vinculados muestran un candado (`Lock` + etiqueta `Cita`) no editable, mientras los manuales exponen **Editar** y **Eliminar** (`ConfirmActionDialog`) solo para `owner`/`admin`. `CashMovementForm.tsx` añade 5 accesos rápidos de egresos típicos de salón (`Geles / acrílico`, `Limas y desechables`, `Esterilización`, `Renta / servicios`, `Pago a profesional`).

2. **Gestión completa de cupones, paquetes, comisiones en vivo, venta retail atómica y corte POS:**
   - **Cupones y tarjetas de regalo:** `POST /api/admin/operations` (`kind: 'coupon'`, `CouponInputSchema` con `.superRefine` rechazando `percent > 100`, `409 COUPON_CODE_EXISTS`, `404 COUPON_NOT_FOUND`) y `DELETE /api/admin/operations?kind=coupon&id=<id>` (`deleteCoupon` elimina `coupon_redemptions` y el cupón en 3 consultas puntuales preservando `bookings.couponCode`/`discountCents` históricos). UI en `CouponEditorDialog.tsx` + `CouponsSubSection.tsx` (editar, interruptor Activar/Pausar, copiar código, barras de uso/saldo y borrado confirmado).
   - **Comisiones y liquidación en 1 clic:** `CommissionRateDialog.tsx` y `CajaCommissionsTab.tsx` / `CajaSummaryTab.tsx` permiten a `owner`/`admin` actualizar `commissionPercent` (`0..100`) mediante `POST /api/admin/team` (`kind: 'staff'`), recalculando al instante las comisiones sobre `service_income` en `cajaMetrics.ts` (conservando 10% retail sobre `product_sale`), más el botón **Registrar pago** que abre el formulario de egreso prellenado (`Pago de comisiones y propinas · <Nombre> (<período>)`). Para `specialist`, la vista se restringe a su propia fila en solo lectura.
   - **Paquetes de sesiones y venta retail ligada a inventario:** `PackagesSubSection.tsx` agrega edición de paquetes existentes (`POST /api/admin/packages` `kind: 'catalog'` con `id`, `404 PACKAGE_NOT_FOUND`). `CashMovementForm.tsx` conecta la venta rápida de productos directamente con `POST /api/admin/operations` (`kind: 'inventory'`, `reason: 'retail_sale'`, `paymentMethod`, `staffId` opcional), descontando stock y registrando el asiento `product_sale` de forma atómica sin doble conteo en `kind: 'cash'`.
   - **Filtros unificados y corte de caja POS:** `CajaSummaryTab.tsx` y `useCajaData.ts` unifican filtros de período (`Hoy` / `7 días` / `Este mes` / `Todo`), método de pago y búsqueda, con **Corte de caja de hoy** (efectivo esperado vs. contado, diferencia `Cuadra`/`Sobrante`/`Faltante` y copia 1 clic formateada para WhatsApp).

3. **Rendimiento por code-splitting y diseño móvil-primero (`390px`) en `/admin/caja`:**
   - `src/app/admin/caja/page.tsx` difiere la carga de las pestañas secundarias (`CajaDepositsTab`, `CajaCommissionsTab`, `CajaPromosTab`) y diálogos de edición (`CommissionRateDialog`, `ManualCashEditDialog`) mediante `next/dynamic(..., { ssr: false })` con `SkeletonBlock` de respaldo.
   - En `src/app/admin/admin.css`, `.ad-caja-desktop-table` / `.ad-caja-mobile-cards` y `.ad-caja-touch-btn` (`44px`) transforman todas las tablas de Caja en tarjetas apiladas legibles a `<= 47.5rem` con `0px` de desbordamiento horizontal.

4. **Configuración en vivo de `/cita/[token]` y retoques dentro de `settings.landingContent` (cero migraciones SQL):**
   - Extender el documento JSON existente `salon_settings.landing_content` con `showBookingQr?: boolean` (default `true`) y `touchUpDays?: number` (entero `7..60`, default `21`), manteniendo fusión no destructiva en `updateSalonSettings` (`db.ts` y `supabase-repo.ts`) para no perder claves previas, y aprovechando las columnas ya existentes `deposit_instructions` y `booking_instructions_text`.
   - Unificar validación y normalización en `src/lib/types.ts`, `src/lib/contracts/brand.ts` (`LandingContentSchema`, `BrandPatchSchema`), `src/lib/landing-config.ts` (`resolveLandingContent`), `src/lib/public-dto.ts` (`toPublicSettingsDTO`), `src/lib/booking/recurrence.ts` (`DEFAULT_TOUCH_UP_DAYS`, `MIN_TOUCH_UP_DAYS`, `MAX_TOUCH_UP_DAYS`, `normalizeTouchUpDays`, `computeSuggestedTouchUpDateKey`, `buildTouchUpBookingUrl`) y `src/lib/cita/cita-settings.ts`.
   - Exponer los 4 controles dentro de la pestaña existente **"Datos, cobro y sellos"** de `/admin/marca` (`src/components/admin/marca/DepositSettingsSection.tsx`, `BookingPageSettingsSection.tsx`, `brandFormUtils.ts`, `src/app/admin/marca/page.tsx`) sin crear pestañas redundantes.
   - Reflejar los valores en vivo en `/cita/[token]` (`CitaDepositSection.tsx` —incluyendo citas pendientes que ya subieron comprobante—, `CitaLocationCard.tsx`, `CitaActionsPanel.tsx`, `CitaModifyCard.tsx`, `citaApi.ts`) y en el flujo de cobro de `/admin/citas` (`CheckoutDrawerDialog.tsx`, `CheckoutReceiptView.tsx`, `src/app/admin/citas/page.tsx`).

## Alternativas consideradas

- **Permitir editar o eliminar cualquier asiento de caja (incluyendo `bookingId !== null`):** descartado porque desincronizaría `payment_splits` y el estado de pago de las citas, generando fugas o discrepancias en reportes e historial contable.
- **Crear una migración SQL `0012` para `show_booking_qr` y `touch_up_days`:** descartado porque `landing_content` ya existe como JSONB tipado y validado con Zod en `salon_settings`, permitiendo desplegar inmediatamente sin pasos manuales en Supabase SQL Editor.
- **Replicar funciones empresariales pesadas de POS (facturación electrónica CFDI, terminales bancarias físicas integradas, múltiples sucursales/cajas, nómina Excel):** descartado conscientemente como sobreingeniería para un salón boutique; se priorizaron las capacidades de alto impacto operativo sin deuda de infraestructura.
- **Crear una pestaña adicional en `/admin/marca` solo para `/cita/[token]`:** descartado para evitar fragmentación de navegación; las opciones pertenecen naturalmente a **"Datos, cobro y sellos"**.

## Consecuencias y trade-offs

- **Positivas:**
  - Operación financiera integral en `/admin/caja` (edición segura, pagos a especialistas en 1 clic, corte diario POS y venta ligada a inventario) sin riesgo de corromper cobros de citas ni requerir migraciones SQL.
  - Menor tamaño de bundle inicial en `/admin/caja` gracias al code-splitting por pestaña y experiencia táctil limpia en `390px`.
  - Cambios en `/admin/marca` (instrucciones de anticipo/llegada, QR visible/oculto, días de retoque) se propagan al instante a `/cita/[token]` y al checkout de `/admin/citas`.
- **Trade-offs y riesgos asumidos:**
  - Almacenar `showBookingQr` y `touchUpDays` dentro de `landingContent` JSONB impide restricciones `CHECK` a nivel columna SQL; la integridad se garantiza mediante validación estricta en `LandingContentSchema` (`src/lib/contracts/brand.ts`) y `normalizeTouchUpDays` (`src/lib/booking/recurrence.ts`).
  - Los pagos de comisiones registrados mediante **Registrar pago** se asientan como egresos manuales (`expense`) asociados a la especialista y período en su descripción, sin tabla separada de recibos de nómina; si el salón crece a nómina formal multi-sucursal, será natural introducir un libro de liquidaciones dedicado.

## Evidencia y archivos clave

- `src/lib/contracts/operations.ts`
- `src/lib/contracts/brand.ts`
- `src/lib/contracts/contracts.test.ts`
- `src/lib/repositories/port.ts`
- `src/lib/repositories/db.ts`
- `src/lib/repositories/supabase-repo.ts`
- `src/lib/repositories/db.test.ts`
- `src/lib/repositories/supabase-repo.test.ts`
- `src/app/api/admin/operations/route.ts`
- `src/app/api/admin/packages/route.ts`
- `src/app/api/admin/team/route.ts`
- `src/app/admin/caja/page.tsx`
- `src/components/admin/caja/cajaMetrics.ts`
- `src/components/admin/caja/cajaMetrics.test.ts`
- `src/components/admin/caja/cajaActions.ts`
- `src/components/admin/caja/useCajaData.ts`
- `src/components/admin/caja/CajaSummaryTab.tsx`
- `src/components/admin/caja/CajaMovementsSection.tsx`
- `src/components/admin/caja/CashMovementForm.tsx`
- `src/components/admin/caja/ManualCashEditDialog.tsx`
- `src/components/admin/caja/CajaCommissionsTab.tsx`
- `src/components/admin/caja/CommissionRateDialog.tsx`
- `src/components/admin/caja/CajaDepositsTab.tsx`
- `src/components/admin/caja/CajaPromosTab.tsx`
- `src/components/admin/caja/CouponsSubSection.tsx`
- `src/components/admin/caja/CouponEditorDialog.tsx`
- `src/components/admin/caja/PackagesSubSection.tsx`
- `src/app/admin/admin.css`
- `src/lib/booking/recurrence.ts`
- `src/lib/landing-config.ts`
- `src/lib/public-dto.ts`
- `src/lib/cita/cita-settings.ts`
- `src/lib/cita/cita-settings.test.ts`
- `src/components/cita/CitaDepositSection.tsx`
- `src/components/cita/CitaLocationCard.tsx`
- `src/components/cita/CitaActionsPanel.tsx`
- `src/components/cita/CitaModifyCard.tsx`
- `src/components/cita/citaApi.ts`
- `src/app/admin/marca/page.tsx`
- `src/components/admin/marca/DepositSettingsSection.tsx`
- `src/components/admin/marca/BookingPageSettingsSection.tsx`
- `src/components/admin/marca/brandFormUtils.ts`
- `src/app/admin/citas/page.tsx`
- `src/components/admin/citas/CheckoutDrawerDialog.tsx`
- `src/components/admin/citas/CheckoutReceiptView.tsx`
