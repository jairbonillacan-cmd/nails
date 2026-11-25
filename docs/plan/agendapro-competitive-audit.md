# Auditoría Competitiva AgendaPro MX → Blueprint de Mejoras para `nails`

> Documento de referencia de producto y arquitectura generado a partir de la auditoría técnica (REA + inspección en vivo de solo lectura sobre `agendapro.com/mx`, `app.agendapro.com` y `*.site.agendapro.com/mx`). Complementa a [super_mejoras.md](./super_mejoras.md) y [feature-map.md](../feature-map.md).

---

## 1. Resumen Ejecutivo: Qué Aprender de AgendaPro y Dónde `nails` lo Supera

### Arquitectura de Referencia Observada
- **Marketing (`agendapro.com/mx`):** Next.js 16.4.6 App Router + Turbopack + Cloudflare. En los bundles se identificó un rediseño 2026 (`empleados-ia/belleza`, agente **Alma IA**) enfocado en ventas/reservas 24/7 por WhatsApp/IG con reconocimiento de audios y fotos, cobro de anticipo en chat y handoff humano automático.
- **App Interna (`app.agendapro.com`):** Single-SPA + SystemJS (40 microfrontends, 37 rutas activas en navbar), BFF dedicado (`/agenda-core-bff/v2/*` con `POST /bookings/preview` y `GET /bookings/:id/payment-options`), POS lateral (`cart.agendapro.com`) y WebSockets (`socket.agendapro.com`).
- **Reservas Online (`*.site.agendapro.com`):** Next.js Pages Router (`/v1/minisite/*`, `/sooner-available-hours`, embebido `/iframe/*`, confirmación/cancelación grupal y firma remota `/sign_consents/my_consent`).

### Ventajas Competitivas que `nails` Ya Tiene o Puede Mantener Gratis
1. **Sin paywall de marca propia ni analítica:** AgendaPro cobra **\$1,500 MXN/mes** (Premium) por colores/URL/giftcards/encuestas/fichas y **\$4,500 MXN/mes** (Pro) por Meta Pixel, GA4 y API pública, además de mostrar marca de agua `Desarrollado por AgendaPro` en el sitio de reservas.
2. **Propinas universales sin hardware propietario:** AgendaPro restringe el módulo de `Propinas` únicamente a su terminal POS física (\$250/mes + 2.29%). `nails` puede registrar propinas por manicurista en **efectivo, transferencia, tarjeta y pago online**.
3. **Tarjeta de sellos sin instalar app externa:** AgendaPro exige a la clienta descargar su app para ver sus sellos; `nails` puede mostrarla directo en la web/PWA brandeada.
4. **Dos vacíos que AgendaPro admite en su comparativa:** sin **código QR compartible** de agenda y sin **reseñas visibles por servicio** — ambos fáciles de potenciar en `nails`.
5. **UX especializada en salones de uñas:** galería *"Quiero este diseño"*, foto inspo en el flujo, hold real de 3 min con recuperación `409` y 3 vistas Cal.com (`Mes`/`Semana`/`Columnas`).

---

## 2. Roadmap de Adopción Priorizado (Alineado con `super_mejoras.md`)

> **Orden recomendado:** Ejecutar primero **Fase 0 y Fase 1** de [super_mejoras.md](./super_mejoras.md) (`D1`–`D7`, `S1`–`S7`, `P1` 7× y migración real a Supabase), e integrar las mejoras `N1`–`N12` respetando todas las reglas de `AGENTS.md` (100% `@astryxdesign/core`, cero `<div>`/`<span>`/hex/px, cero `useEffect`/`setTimeout` en `src/app/**` y `src/components/**`, cero comentarios en `src/**`, dominio puro y `npm run verify` en verde).

### P0 — Operación Diaria y Retención Inmediata
1. **N1 · Grilla Multi-Especialista + Popover de 1 Clic + Buscador Rápido de Hora (`/admin/citas`):**
   - Vista de columnas por manicurista con línea de hora actual, bloques achurados no laborables y granularidad de slot (`15/30/60 min`).
   - Popover rápido de cita con puntos de estado gobernados por `src/lib/booking/state-machine.ts` (`D2`), botón `Hablar por WhatsApp`, `$ Cobrar` y `Ficha`.
   - Modal **`Búsqueda rápida de hora`**: encadena 1+ servicios, filtro de especialista o *Sin preferencia*, y muestra cinta de días + slots `Mañana`/`Tarde` usando `getAvailableSlotsForDate` (`P1`).
2. **N2 · Carrito Multi-Servicio + Recurrencia + Candado de Preferencia (`/reservar` y `/admin/citas`):**
   - Permitir combinar varios servicios en una sola reserva (`booking_items[]`), separar `clientNotes` de `internalNotes`, marcar `hasStaffPreference` (con asignación equilibrada `D3` cuando es *Sin preferencia*) y soportar **citas recurrentes** (relleno cada 2–3 semanas, `U1`) y **bloqueos recurrentes** de personal.
3. **N3 · POS Lateral + Propinas Universales + Pago Dividido/Abono + Alerta de Fuga de Ingresos (`/admin/caja`):**
   - Drawer lateral sobre `/admin/citas` sin cambiar de pantalla: venta de servicios/productos/giftcards, **vender carrito como gift card**, descuentos por ítem o globales, **pago dividido** (`payment_splits[]`), **abonos parciales** y **propinas por manicurista** en cualquier método de pago.
   - Comisiones diferenciadas por servicio, producto y paquete.
   - Tarjeta **"`Agendado y sin cobrar`"** (patrón waterfall de AgendaPro `/sales/summary`) con acceso directo a cobrar para eliminar fugas de caja.
4. **N4 · Tarjeta Digital de Sellos Web/PWA + Paquetes de Sesiones (`U5`):**
   - Programa configurable (3–10 sellos, máx. 1 sello/día/clienta, premio = servicio gratis o % con tope, vigencia opcional) visible directo en `/cita/[token]` o portal de clienta sin instalar app.
   - Panel **`Clientas cerca de su premio`** en `/admin/clientas` + paquetes `Estándar` y `Elección Libre` (bolsa de N sesiones con vencimiento).

### P1 — Retención Automatizada, Control Financiero y Cumplimiento MX
5. **N5 · Recordatorios en Cascada (`Email → WhatsApp`) + KPI de Ingresos Confirmados (`U2`, `U3`):**
   - Enviar Email a 48 h y disparar WhatsApp (24 h / 3 h) **solo si la clienta no ha confirmado todavía**, mostrando en `/admin/integraciones` el KPI **`\$ Ingresos confirmados`** y la lista **`Citas sin recordatorio`** para rescate manual.
   - Al cancelar, ofrecer automáticamente el hueco a la lista de espera con prioridad de 10 min (`U3`) y plantilla `Recapturar reserva cancelada`.
6. **N6 · CRM con Filtro Inverso + Ficha 360° + Consentimientos LFPDPPP (`S8`, `U6`):**
   - En `/admin/clientas`: filtro **`No tiene reserva en los últimos N días`** (21 días retoque / 45 días reactivación) + audiencias guardadas.
   - Ficha con pestañas (`Actividad`, `Pagos y deudas`, `Ficha técnica de uñas/alergias`, `Consentimientos` con firma web y **firma presencial en tablet**, `Fotos antes/después`, `Sellos/Paquetes`) y exportación individual **`Descargar datos`** (derechos ARCO).
7. **N7 · Seguridad Operativa: PIN de Autorización + Bloqueo de Citas Pasadas + Audit Log:**
   - Exigir PIN de dueña/gerente (`authorization_pins` con hash en servidor) para cancelar citas, editar precios/descuentos en caja y **exportar CSV de clientas**.
   - Políticas configurables: `lockPastBookings`, `maxActiveBookingsPerClient` y anticipo obligatorio tras N `no_show` (`U2`) + historial inmutable `audit_logs`.
8. **N8 · Reportes de Ocupación, Heatmap Horario y Retención por Manicurista (`U8`):**
   - Ocupación %, heatmap de demanda por día/hora, tasa de no-show, ticket promedio, rentabilidad por minuto, tabla **Nuevas vs Recurrentes por manicurista** y atribución UTM/Meta Ads → ingresos cobrados.
9. **N9 · LinkPro (Bio-Link) + QR Imprimible + Embed `<iframe>` + Reseñas por Servicio (`U7`):**
   - Ruta pública `/links` para bio de Instagram/TikTok, generador de QR descargable en `/admin/marca`, snippet `<iframe>` y reseñas verificadas por servicio en `/reservar/[slug]`.

### P2 — Escala y Diferenciación 2026
10. **N10 · Precios Inteligentes (`Smart Pricing`):** descuentos automáticos en franjas de baja ocupación detectadas por el heatmap (ej. martes 10:00–13:00 `-15%`) calculados en el motor puro.
11. **N11 · Recursos Físicos Opcionales:** modelado de sillones de pedicure/mesas para evitar sobreventa física cuando hay más manicuristas que estaciones.
12. **N12 · Asistente IA Multimodal WhatsApp/IG + Handoff Humano:** evolución de `src/lib/integrations/whatsapp-booking.ts` con lectura de fotos/audios, memoria del último servicio, upsell de extras, link de anticipo Mercado Pago y pausa automática si responde el equipo.

---

## 3. Entidades Sugeridas para Próximas Migraciones SQL

- `booking_items` y `booking_series` (multi-servicio + recurrencia).
- `payment_splits` (pagos mixtos, abonos y propinas universales por `staff_id`).
- `loyalty_programs`, `loyalty_stamps` (con `UNIQUE(client_id, program_id, stamped_date)`), `service_packages`, `client_packages`.
- `consents`, `authorization_pins`, `audit_logs`.
- `dynamic_pricing_rules` y `resources` (fase P2).
