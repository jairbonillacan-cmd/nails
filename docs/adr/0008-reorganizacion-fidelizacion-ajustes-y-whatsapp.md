# ADR-0008: Reorganización de Fidelización, Ajustes del salón y consolidación de WhatsApp

- **Estado:** Aceptado (Consolidación completa en fase 2)
- **Fecha:** 2026-11-28
- **Área:** Arquitectura de Información del Panel Admin, RBAC y Fronteras de Configuración

## Contexto

La auditoría integral de `/admin` evidenció tres fuentes estructurales de dispersión y duplicación que confundían a la dueña y a recepción en el uso diario:

1. **Fidelización partida en tres módulos distintos:** configurar la tarjeta de sellos vivía dentro de `Mi página` (`/admin/marca`), administrar paquetes de sesiones y cupones/tarjetas de regalo vivía dentro de `Caja` (`/admin/caja?tab=promos`), y las campañas de cumpleaños/reactivación más la asignación de paquetes vivían dentro de `Clientas` (`/admin/clientas?tab=retencion|paquetes`).
2. **`Mi página` (`/admin/marca`) mezclaba escaparate público con operación sensible:** en una sola página convivían la paleta visual, textos de landing, QR y embed junto con CLABE SPEI, monto de anticipo, modo de cobro, políticas de cancelación/inasistencia, bloqueo de citas pasadas, PIN de dueña y bitácora de auditoría. Además, `Conexiones` (`/admin/integraciones`) repetía el selector de `paymentMode`.
3. **Configuración de WhatsApp duplicada en dos pantallas:** `/admin/whatsapp?tab=conexion` concentraba la bandeja, plantillas Meta y cuota, pero `Conexiones › Ajustes técnicos` (`/admin/integraciones`) mantenía controles duplicados del simulador, webhook URL y registros de WhatsApp.
4. **Edición de comisiones duplicada entre `Caja` y `Equipo`:** `Caja` usaba `CommissionRateDialog` con vista previa del impacto por profesional, mientras `Equipo` obligaba a abrir el formulario completo del perfil.

Las restricciones de [ADR-0004](./0004-seguridad-rbac-otp-pin-media-r2-y-qr-recepcion.md) y [ADR-0005](./0005-caja-ventas-integridad-contable-y-configuracion-sin-migraciones.md) siguen vigentes: **cero migraciones SQL**, **cero URLs legadas rotas** y **RBAC estricto** por rol (`owner`, `admin`, `specialist`).

## Decisión

1. **Nuevo módulo `/admin/fidelizacion` (`owner` y `admin`; bloqueado para `specialist` vía `roleCanAccess(role, 'loyalty')`):**
   - Concentra en 4 pestañas tipadas (`?tab=sellos|paquetes|cupones|campanas`, via `fidelizacionHref` / `parseFidelizacionParams`) todo el ciclo de retención del salón:
     - `Sellos`: configuración de la tarjeta de sellos (`PATCH /api/admin/brand` / programa de lealtad) y resumen de clientas próximas a premio.
     - `Paquetes`: catálogo de paquetes de sesiones y asignación/canje de paquetes a clientas reutilizando `PackagesSubSection` y los flujos de `/api/admin/packages`.
     - `Cupones y tarjetas`: códigos promocionales y tarjetas de regalo reutilizando `CouponsSubSection` (`/api/admin/operations`).
     - `Campañas`: cumpleaños y reactivación de clientas inactivas reutilizando `ClientRetentionTab` (`/api/admin/campaigns`).
   - La ficha individual (`ClientProfileDialog`) sigue mostrando los sellos y paquetes activos de cada clienta para contexto inmediato en mostrador.
   - **Consolidación completa y compatibilidad retroactiva:** se eliminan las pestañas duplicadas `Promos` en `Caja` y `Retención`/`Fidelidad` en `Clientas`; cualquier URL legada (`/admin/caja?tab=promos|cupones|paquetes` y `/admin/clientas?tab=retencion|paquetes|fidelidad`) redirige de forma transparente vía `router.replace` a su pestaña canónica en `fidelizacionHref(...)`, sin romper marcadores ni pruebas E2E. Todos los accesos cruzados desde `Servicios`, `Reportes` y `Fidelización` apuntan al destino canónico sin ciclos ni rutas legadas.
   - **Coherencia de caché por dominio:** todas las mutaciones administrativas y eventos Realtime en `AdminProvider` invalidan las cachés derivadas mediante `invalidateAdminDomain` en `src/lib/hooks/useAdminCache.ts`, eliminando estados desfasados entre módulos.

2. **Nuevo módulo `/admin/ajustes` (exclusivo `owner` vía `roleCanAccess(role, 'settings')`):**
   - Concentra en 3 pestañas tipadas (`?tab=cobro|politicas|seguridad&focus=`, via `ajustesHref` / `parseAjustesParams`) toda la configuración operativa y de seguridad:
     - `Cobro y anticipo`: fuente única de `paymentMode`, anticipo SPEI, banco, beneficiario, CLABE e instrucciones de transferencia.
     - `Políticas`: ventanas de cancelación/reagendado, días de anticipación, duración de apartado temporal, umbral de inasistencias (`noShowDepositThreshold`), bloqueo de citas pasadas (`lockPastBookings`), instrucciones de reserva, `showBookingQr` y `touchUpDays`.
     - `Seguridad y auditoría`: PIN de dueña (`OwnerPinCard`) y bitácora de auditoría (`recentAuditLogs`).
   - **`Mi página` (`/admin/marca`) queda enfocada exclusivamente en escaparate público:** identidad visual, presets, contraste WCAG AA, textos/secciones de landing, QR de escaparate y código Embed.
   - **Compatibilidad retroactiva:** si alguien abre `/admin/marca` con parámetros operativos heredados (`?tab=cobro|politicas|seguridad|datos` o `?focus=clabe|pin|noshow|sellos`), redirige con `router.replace` al destino canónico en `ajustesHref(...)` o `fidelizacionHref({ tab: 'sellos' })`.

3. **WhatsApp consolidado en `/admin/whatsapp?tab=conexion` (`owner` y `admin`):**
   - `/admin/whatsapp?tab=conexion` es la única pantalla para credenciales Cloud API, URL del webhook, sincronización de plantillas Meta, envío de prueba y simulador en modo demo.
   - `/admin/integraciones` (`Conexiones`) elimina el editor duplicado de `paymentMode` y los controles/simulador heredados de WhatsApp; conserva únicamente integraciones no-WhatsApp (Google Calendar, correo Resend, SMS Twilio, Meta Pixel / GA4 / Google Review URL) junto con tarjetas de estado de solo lectura que enlazan a `ajustesHref({ tab: 'cobro' })` y `whatsappHref({ tab: 'conexion' })`.

4. **Navegación, RBAC y comisión unificada:**
   - `src/lib/rbac.ts` declara explícitamente `'loyalty'` (`owner`, `admin`) y `'settings'` (`owner`), protegiendo ambas rutas con `AdminAccessGuard`.
   - `src/components/admin/shell/adminNavConfig.ts` ubica `Fidelización` dentro del grupo colapsable `Salón` y `Ajustes` dentro de `Más`, manteniendo limpia la navegación primaria de `Operación`.
   - `src/lib/admin-links.ts` exporta `fidelizacionHref`/`parseFidelizacionParams` y `ajustesHref`/`parseAjustesParams` (cubiertos por el guardrail `no-raw-admin-links`).
   - `/admin/equipo` reutiliza `CommissionRateDialog` desde `@/components/admin/caja/CommissionRateDialog` para editar `%` de comisión sin deriva respecto a `Caja`.

## Alternativas consideradas

- **Mantener indefinidamente pestañas duplicadas en Caja y Clientas en paralelo con Fidelización:** descartada tras completar la transición porque duplicaba mantenimiento, generaba enlaces circulares (`Fidelización` ↔ `Caja`) y provocaba desincronización de caché de paquetes y campañas; las redirecciones cliente (`router.replace`) conservan compatibilidad total con enlaces previos sin mantener dos superficies idénticas.
- **Dejar `Cobro y anticipo` dentro de `Conexiones` y `Políticas` dentro de `Mi página`:** descartada porque mantiene la confusión entre apariencia pública, credenciales técnicas y reglas operativas del negocio, además de duplicar el control de `paymentMode`.
- **Crear nuevas tablas SQL o mover columnas de `salon_settings`:** descartada porque todos los campos ya existen en `salon_settings` y en las tablas de lealtad/paquetes/cupones; reorganizar en capa de aplicación conserva cero migraciones SQL y cero riesgo de datos.

## Consecuencias y trade-offs

- **Positivas:** cada dominio tiene un único hogar canónico (`Mi página` = escaparate público, `Ajustes` = cobro/políticas/seguridad, `Fidelización` = sellos/paquetes/cupones/campañas, `WhatsApp › Conexión` = configuración de WhatsApp, `Conexiones` = integraciones externas); el modelo RBAC impide que `admin` modifique `Ajustes` o que `specialist` acceda a `Fidelización`; desaparecen controles y pestañas duplicadas (`paymentMode`, WhatsApp, `Promos` en Caja, `Retención`/`Fidelidad` en Clientas y edición rápida de comisiones).
- **Trade-offs:** el menú lateral incorpora dos rutas dedicadas dentro de grupos colapsables (`Salón` y `Más`), y las URLs legadas pasan por una redirección cliente inmediata (`router.replace`) hacia `/admin/fidelizacion` o `/admin/ajustes`.

## Evidencia y archivos clave

- `src/lib/rbac.ts`
- `src/lib/admin-links.ts`
- `src/lib/admin-links.test.ts`
- `src/lib/hooks/useAdminCache.ts`
- `src/components/admin/AdminProvider.tsx`
- `src/components/admin/shell/adminNavConfig.ts`
- `src/components/admin/shell/AdminNavGroups.tsx`
- `src/components/admin/AdminQuickSearchDialog.tsx`
- `src/components/admin/adminSearchIndex.ts`
- `src/app/admin/fidelizacion/page.tsx`
- `src/app/admin/ajustes/page.tsx`
- `src/app/admin/marca/page.tsx`
- `src/app/admin/integraciones/page.tsx`
- `src/app/admin/whatsapp/page.tsx`
- `src/app/admin/caja/page.tsx`
- `src/app/admin/clientas/page.tsx`
- `src/app/admin/equipo/page.tsx`
- `src/components/admin/equipo/StaffEditorSection.tsx`
- `src/components/admin/caja/CommissionRateDialog.tsx`
- `src/components/admin/integraciones/PaymentsAnalyticsSection.tsx`
- `src/components/admin/integraciones/TechnicalSettingsSection.tsx`
- `src/app/api/admin/brand/route.ts`
- `src/app/api/admin/operations/route.ts`
- `src/app/api/admin/packages/route.ts`
- `src/app/api/admin/campaigns/route.ts`
- `src/app/api/admin/whatsapp/settings/route.ts`
- `src/app/api/admin/whatsapp/simulate/route.ts`
