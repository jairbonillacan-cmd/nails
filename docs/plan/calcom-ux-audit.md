# Auditoría UX/UI y Arquitectura Cal.com v7 → Blueprint para `nails`

> Documento portable de referencia generado a partir de la auditoría con REA (`cal.com`, `cal.com/discover`, `cal.com/scheduling/beauty/salons`, motor Booker en vivo y `app.cal.com` v7.0.5-h en modo solo lectura). Complementa a [agendapro-competitive-audit.md](./agendapro-competitive-audit.md), [super_mejoras.md](./super_mejoras.md) y [feature-map.md](../feature-map.md).

---

## 1. Qué Aporta Cal.com v7 que Complementa a AgendaPro

Mientras AgendaPro sobresale en **operación comercial de salón** (POS, propinas, caja, sellos, CRM), **Cal.com v7** marca el estándar mundial en **UX/UI minimalista, inteligencia de disponibilidad, accesibilidad y diseño de configuradores** — además de alinearse naturalmente con la estética limpia de `@astryxdesign/core`.

### Pilares UX/UI Extraídos del Sistema de Diseño (`807 tokens CSS` + `33 chunks autenticados`)
1. **Superficies de 4 niveles + `CardFrame`:** shell/bandejas en tono neutro suave (`#f6f7f9`) envolviendo contenedores blancos con filas separadas por divisores finos (`#eeeff2`), sin tarjetas redundantes por cada fila.
2. **Micro-sombras por estado y `tabular-nums`:** botones y switches con sombras dedicadas por estado (`rested/hover/active/focused`) y números tabulares en horarios, precios y temporizadores.
3. **Revelación progresiva estricta:** reglas avanzadas colapsadas a 1 línea (`Título + 1 línea de ayuda + Switch`) hasta que se activan; botón `Guardar` deshabilitado mientras no haya cambios (`shouldDirty`).
4. **Wireframe cards + Preview en vivo contextual:** selección visual de tema (`Sistema / Claro / Oscuro`) y layouts (`Mes / Semanal / Columna`) con validación automática de contraste WCAG (`dark_theme_contrast_error`), y preview derecho que se adapta a la pestaña activa del editor.
5. **Empty states accionables + recuperación de disponibilidad:** galería de plantillas visible debajo del empty state (`Flujos de trabajo`), diálogo automático `Sin disponibilidad → Ver el próximo mes`, y dock móvil inferior flotante tipo isla.
6. **Accesibilidad real:** `aria-label` localizado con zona horaria en cada día y horario, regiones `aria-live="polite" aria-atomic="true"`, y `inert` en modales.

### Mecánicas Técnicas Clave Recuperadas del Código
- **`BookerStoreProvider` (Zustand scoped) + `nuqs` URL sync:** estado limpio (`loading → selecting_date → selecting_time → booking`), persistencia en query params (`?layout=&date=&slot=`) y `monthsToPrefetch = 2` automático al cruzar cambio de mes (`DIC 1` inline).
- **Slot Hold dedicado (`viewer.slots.reserveSlot` con `skipBatch: true`):** `holdToken` emitido por el servidor y liberación automática (`removeSelectedSlotMark`) al volver atrás.
- **`dateOverrides` con `toPlainDate(..., "UTC")`:** evita desfases de 1 día en horarios nocturnos MX y auto-archiva excepciones pasadas.
- **Trazabilidad tRPC de fricción:** `cancellationAndRescheduleReasons`, `failedBookingsByField`, `bookingsByHourStats`, `csatOverTime`.

---

## 2. Propuestas Priorizadas para Evaluar e Integrar en `nails`

> Respetar siempre `AGENTS.md`: prioridad a `Fase 0`–`Fase 1` de [super_mejoras.md](./super_mejoras.md), 100% `@astryxdesign/core` (cero `<div>`/`<span>`/hex/px), cero `useEffect`/`setTimeout` en `src/app/**` y `src/components/**`, dominio puro y `npm run verify` en verde.

### P0 — Alto Retorno Inmediato en UX/UI y Ocupación
1. **C1 · Franjas Optimizadas (`Optimized Slots`):** modo en `src/lib/availability/engine.ts` que ofrece inicios pegados al fin real de citas ya agendadas (ej. 10:15 tras una cita de 75 min) para eliminar huecos muertos en manicuristas.
2. **C2 · Upgrade de Accesibilidad, URL State y Empty-State Recovery en `/reservar`:** `aria-label` por día/slot, `aria-live="polite"`, query params compartibles (`?servicio=&addons=&staff=&date=&layout=&slot=`), transición de cambio de mes inline, `tabular-nums` y diálogo automático `Sin disponibilidad → Ver próximo mes / Lista de espera`.
3. **C3 · Solucionador Visual de Disponibilidad (`/admin/disponibilidad`):** reemplazar la tabla plana actual por el calendario real en modo diagnóstico con días/slots bloqueados marcados y motivo exacto desde `assertSlotBookable` (resuelve `D7`).
4. **C4 · Estética `CardFrame` + Revelación Progresiva + Acciones Segmentadas en `/admin/*`:** filas agrupadas con divisores finos, grupo `[Vista previa | Copiar | ...]` en `/admin/servicios`, políticas colapsables y `Guardar` deshabilitado sin cambios.
5. **C5 · Zona Horaria Bloqueada Presencial + Validador WCAG en `/admin/marca`:** fijar `America/Mexico_City` con etiqueta *"Hora local del salón"* en `/reservar`, alerta automática de contraste WCAG al editar colores y wireframe cards para tema y layout predeterminado.

### P1 — Políticas Inteligentes y Menos Fricción Operativa
6. **C6 · Límite de Citas Activas con Reprogramación Automática + `Solicitar reprogramación`:** ofrecer reprogramar la cita activa si se alcanza el tope por clienta, y botón 1-clic en `/admin/citas` para enviar el enlace de reprogramación por WhatsApp.
7. **C7 · Festivos MX + Vacaciones con Nota Pública y Redirección a Otra Manicurista:** precarga de festivos oficiales de México, excepciones multi-fecha (`toPlainDate`, auto-archivado), aviso visible en `/reservar` y desvío opcional a otra especialista.
8. **C8 · Motivos de Cancelación/Reprogramación + Galería de Plantillas en `/admin/integraciones`:** motivos rápidos estructurados para reportes y plantillas listas (*Seguimiento de inasistencia 30 min después*, *Recordatorio "ven sin gel previo"*).

### P2 — Ecosistema y Crecimiento
9. **C9 · Embed de 3 Modos + QR + Enlaces Privados VIP:** modal `Insertar` (Inline / Botón flotante / Popup), QR imprimible y enlaces privados de un solo uso para servicios exclusivos ocultos.
10. **C10 · Telemetría de Abandono (`failedBookingsByField`) + Webhooks con `Prueba Ping`:** detectar qué campo del formulario frena reservas y habilitar webhooks salientes probables en vivo hacia n8n/Make.
