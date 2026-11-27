# ADR-0007: Caja personalizable (`cajaConfig`), corte con fondo inicial y comisión retail configurable

- **Estado:** Aceptado
- **Fecha:** 2026-11-27
- **Área:** Operación Financiera (`/admin/caja`), Configuración Dinámica y UX de mostrador

## Contexto

La auditoría en navegador de `/admin/caja` (1280×800 y 390×844, claro y oscuro) encontró fricción real en el uso diario de mostrador:

1. En celular, `Registrar venta o gasto` y el `Corte de caja` quedaban unas 4 pantallas abajo, dentro de una columna lateral sobredimensionada que solo envolvía un botón.
2. `CashMovementForm` y `CashMovementDraftDialog` renderizaban sus botones dentro del `<form>` (sin pie fijo); el pago a profesional mostraba los selectores `Venta producto / Otro ingreso` y los chips de gastos, que no aplican a una liquidación.
3. La vista previa de `CommissionRateDialog` multiplicaba **todas** las ventas (incluidas las de producto) por el % de servicios: con $150 de servicio y $240 de producto al 40 % mostraba $156 en lugar de $84.
4. El 10 % de comisión retail estaba fijo en código (`db.ts` y `supabase-repo.ts`), el arqueo ignoraba el fondo inicial del cajón y no había forma de dejar registro de un sobrante o faltante.
5. No existían periodos `Mes pasado` ni rango personalizado para cierres quincenales, ni búsqueda o filtros en cupones.

La restricción de [ADR-0005](./0005-caja-ventas-integridad-contable-y-configuracion-sin-migraciones.md) sigue vigente: **cero migraciones SQL** e inmutabilidad de los asientos con `bookingId !== null`.

## Decisión

1. **`cajaConfig` dentro de `salon_settings.landing_content` (JSONB existente):**
   - Contrato `CajaConfigSchema` (`.strict()`) en `src/lib/contracts/brand.ts`: `openingFloatCents` (0–10 000 000), `expenseCategories` (2–40 caracteres, máx. 12, sin duplicados sin distinguir mayúsculas), `retailCommissionPercent` (entero 0–100), `defaultPeriod` (`today | 7d | month | all`) y `closeSummary` (`includeStaffBreakdown`, `includeTips`, `includePending`). Tipos en `src/lib/types.ts` (`CajaConfig`).
   - En `LandingContentSchema` se declara `cajaConfig: CajaConfigSchema.optional().catch(undefined)`: un valor corrupto se descarta en vez de invalidar todo el `landing_content`.
   - `src/lib/caja/caja-config.ts` define `DEFAULT_CAJA_CONFIG` (fondo 0, 5 categorías de salón, retail 10 %, periodo `all`, resumen completo), `resolveCajaConfig` y `normalizeExpenseCategories`.
   - Nuevo endpoint `PUT /api/admin/caja-config` (owner y admin; specialist `403`; payload inválido `400 INVALID_CAJA_CONFIG`) que reutiliza `updateSalonSettings({ landingContent: { cajaConfig } })`. La fusión no destructiva de `db.ts` ya cubre la clave; `supabase-repo.ts` la serializa explícitamente. Un `PATCH /api/admin/brand` posterior conserva `cajaConfig` porque `LandingContentPatchSchema` no la incluye.
   - `toPublicSettingsDTO` (`src/lib/public-dto.ts`) elimina `cajaConfig`; solo `toAdminSettingsDTO` la expone.
2. **Comisión retail en vivo:** `computeEntryCommissionCents` y `computeCommissionsByStaff` (`cajaMetrics.ts`) calculan `product_sale × retailCommissionPercent` al leer, igual que el % de servicios (decisión de la dueña: aplica a cualquier periodo, incluidas ventas pasadas). `CommissionStaffRow` separa `serviceSales/serviceCommission`, `retailSales/retailCommission`, `otherCommission` y `tips`; `previewStaffCommission` alimenta la vista previa corregida. El `commission_cents` que guardan los repos al vender se conserva como dato histórico, pero la UI no lo usa para `product_sale`.
3. **Periodos con rango:** `CajaPeriod` agrega `last_month` y `custom`; `getCajaPeriodRange` resuelve `{startKey, endKey}` (invierte un rango al revés y permite extremos abiertos) y todos los filtros (`filterCashEntries`, `filterSplitDetails`, `computeCommissionsByStaff`, `buildSplitSummaryByMethod`) comparan claves de fecha en la zona horaria del salón. El periodo inicial sale de `cajaConfig.defaultPeriod`; `Restablecer` vuelve a él.
4. **Corte de caja como modal desde el encabezado:** `CashCloseDialog` usa `computeCashDrawer` (`esperado = fondo inicial + cobros en efectivo + propinas en efectivo − gastos en efectivo`). Si hay diferencia, `buildCashAdjustmentDraft` registra un **movimiento manual** (faltante → `expense`, sobrante → `service_income`, `paymentMethod: 'cash'`, `bookingId: null`) con la nota del corte, por lo que queda editable o eliminable y en el CSV (decisión de la dueña). `formatCashCloseWhatsAppSummary` respeta `closeSummary` e incluye fondo, nota y desglose por profesional.
5. **Modales unificados en `FormDialog` + `submitFooter`:** `CashMovementDialog`, `CommissionPayoutDialog`, `ManualCashEditDialog` (ahora edita `tipCents`; `secondaryAction` del pie para `Eliminar`), `CommissionRateDialog`, `CajaSettingsDialog`, `CouponEditorDialog` (con `DateInput`, `generateCouponCode` y `describeCouponPreview`) y el modal de paquetes (`computePackageEconomics`). `FormDialog` acepta `secondaryAction` opcional en el pie.
6. **Resumen más simple:** se eliminó la columna `Movimiento rápido`/`Corte de caja` y la barra de filtros por método; las tarjetas de forma de pago son botones toggle (`aria-pressed`) y la tabla larga de comisiones se reemplazó por el bloque compacto `Por pagar a tu equipo`. En móvil (`≤ 47.5rem`) las acciones del encabezado se acomodan en dos filas (`.ad-caja-head`).

## Alternativas consideradas

- **Migración SQL `0012` con tabla `cash_closings` o columnas nuevas:** descartada para mantener el despliegue sin pasos manuales en Supabase; un registro de cierres diarios dedicado queda como evolución natural si se necesita historial formal de cortes.
- **Guardar la nota de ajuste solo en el texto de WhatsApp:** descartada por la dueña; el ajuste como movimiento manual deja huella contable consistente con el historial y el CSV.
- **Aplicar el % retail solo a ventas nuevas (persistido en `commission_cents`):** descartada; habría exigido leer la configuración en cada venta de inventario (más subrequests en Workers) y dos fuentes de verdad distintas entre servicios y productos.
- **Reutilizar `PATCH /api/admin/brand`:** descartada porque es exclusivo de `owner` y recepción (`admin`) también debe poder ajustar la operación de caja.
- **Eliminar paquetes sin asignaciones:** pospuesto; requiere nuevos métodos en ambos repos y un endpoint. Se mantiene la pausa y se agregó acceso directo a `Asignar` en `/admin/clientas?tab=paquetes`.

## Consecuencias y trade-offs

- **Positivas:** registrar un movimiento o hacer el corte toma un toque desde cualquier pestaña y en celular; las comisiones de producto se muestran correctamente y la dueña controla el %; el arqueo refleja el fondo real del cajón y las diferencias quedan documentadas; los cierres quincenales o de mes pasado no requieren exportar a Excel.
- **Trade-offs:** cambiar el % retail recalcula periodos ya pagados (igual que ya ocurría con el % de servicios); el fondo inicial es un valor por defecto editable en cada corte, no un historial por día; `cajaConfig` vive en JSONB sin `CHECK` en SQL y depende de `CajaConfigSchema` y del `.catch(undefined)` defensivo.

## Evidencia y archivos clave

- `src/lib/contracts/brand.ts`
- `src/lib/types.ts`
- `src/lib/caja/caja-config.ts`
- `src/lib/public-dto.ts`
- `src/lib/repositories/supabase-repo.ts`
- `src/lib/repositories/supabase-repo.test.ts`
- `src/app/api/admin/caja-config/route.ts`
- `src/app/api/admin/caja-config/route.test.ts`
- `src/app/admin/caja/page.tsx`
- `src/app/admin/admin.css`
- `src/components/ui/FormDialog.tsx`
- `src/components/admin/caja/cajaMetrics.ts`
- `src/components/admin/caja/cajaMetrics.test.ts`
- `src/components/admin/caja/cajaConfigMetrics.test.ts`
- `src/components/admin/caja/cajaActions.ts`
- `src/components/admin/caja/useCajaData.ts`
- `src/components/admin/caja/CajaSummaryTab.tsx`
- `src/components/admin/caja/CashMovementForm.tsx`
- `src/components/admin/caja/CashCloseDialog.tsx`
- `src/components/admin/caja/CajaSettingsDialog.tsx`
- `src/components/admin/caja/CommissionRateDialog.tsx`
- `src/components/admin/caja/ManualCashEditDialog.tsx`
- `src/components/admin/caja/CouponEditorDialog.tsx`
- `src/components/admin/caja/CouponsSubSection.tsx`
- `src/components/admin/caja/PackagesSubSection.tsx`
- `src/components/admin/caja/CajaDepositsTab.tsx`
- `src/components/admin/caja/CajaCommissionsTab.tsx`
