# Capturas de referencia y pruebas en navegador

Evidencia visual recopilada durante el análisis competitivo (**Cal.com** y **AgendaPro**) y las pruebas reales en navegador de **Nails**.

---

## 1. Nails — Pruebas en navegador (`nails-qa/`)

Verificación en vivo sobre build de producción (`http://localhost:3000`, 0 errores de consola, 0 errores HTTP ≥ 400):

| Vista | Captura |
|---|---|
| Landing (desktop) | ![Landing desktop](./nails-qa/01-landing-desktop.png) |
| Landing (móvil) | ![Landing móvil](./nails-qa/02-landing-mobile.png) |
| Reservar — Servicios, extras y especialista | ![Servicios y extras](./nails-qa/03-reservar-servicios-extras.png) |
| Reservar — Agenda en vivo (3 columnas) | ![Agenda 3 columnas](./nails-qa/04-reservar-agenda-3-columnas.png) |
| Reservar — Hold 3 min, cupón `BIENVENIDA10` y formulario | ![Formulario y cupón](./nails-qa/05-reservar-apartado-cupon-formulario.png) |
| Cita confirmada (`/cita/[token]`) | ![Cita confirmada](./nails-qa/06-cita-confirmada-link-magico.png) |
| Cita completada + reseña a Google Maps | ![Reseña Google](./nails-qa/07-cita-completada-resena-google.png) |
| Panel Admin — Dashboard | ![Admin dashboard](./nails-qa/08-admin-dashboard.png) |
| Panel Admin — Citas y Agenda | ![Admin citas](./nails-qa/09-admin-citas.png) |
| Panel Admin — Horarios partidos | ![Admin horarios](./nails-qa/10-admin-disponibilidad-horarios.png) |
| Panel Admin — Diagnóstico (Troubleshooter) | ![Troubleshooter](./nails-qa/11-admin-disponibilidad-troubleshooter.png) |
| Panel Admin — Marca e identidad | ![Marca identidad](./nails-qa/12-admin-marca-identidad.png) |
| Panel Admin — Vista previa tema Rose | ![Preview Rose](./nails-qa/13-admin-marca-preview-rose.png) |
| Panel Admin — Vista previa tema Matcha | ![Preview Matcha](./nails-qa/14-admin-marca-preview-matcha.png) |
| Panel Admin — Login multi-rol | ![Admin login](./nails-qa/15-admin-login.png) |

---

## 2. Cal.com — Referencia UX/UI (`calcom/`)

Referencias analizadas para el flujo de reserva en 3 columnas (Mes / Semana / Columnas), horarios partidos, workflows y confirmación:

- [01-landing.png](./calcom/01-landing.png) — Landing Cal.com v7
- [02-pricing.png](./calcom/02-pricing.png) — Planes y precios
- [03-login.png](./calcom/03-login.png) — Pantalla de login
- [04-dashboard-home.png](./calcom/04-dashboard-home.png) — Inicio del panel
- [05-links.png](./calcom/05-links.png) — Links de reserva
- [06-availability-list.png](./calcom/06-availability-list.png) — Lista de disponibilidades
- [07-availability-working-hours.png](./calcom/07-availability-working-hours.png) — Horarios laborales + Date overrides + Troubleshooter
- [08-workflows.png](./calcom/08-workflows.png) — Plantillas de workflows (Email / SMS / Recordatorios)
- [09-booking-month-view.png](./calcom/09-booking-month-view.png) — Reserva vista Mes
- [10-booking-week-view.jpg](./calcom/10-booking-week-view.jpg) — Reserva vista Semana
- [11-booking-column-view.jpg](./calcom/11-booking-column-view.jpg) — Reserva vista Columnas
- [12-booking-confirmation.png](./calcom/12-booking-confirmation.png) — Confirmación con botones de calendario y reprogramación

---

## 3. AgendaPro — Análisis competitivo (`agendapro/`)

Referencias analizadas para superar la oferta de AgendaPro en salones de uñas (caja, comisiones, inventario, CRM, encuestas, gift cards y sitio público):

- [01-funcionalidades-menu.png](./agendapro/01-funcionalidades-menu.png) — Mapa de funcionalidades (Capta / Gestiona / Crece)
- [02-planes-mx.png](./agendapro/02-planes-mx.png) — Precios en México (MXN/mes)
- [03-agentes-ia-faq.png](./agendapro/03-agentes-ia-faq.png) — Agentes IA de recordatorios y FAQ
- [04-panel-agenda-semana.png](./agendapro/04-panel-agenda-semana.png) — Panel de agenda semanal
- [05-panel-detalle-cita.png](./agendapro/05-panel-detalle-cita.png) — Detalle de cita (estados, WhatsApp, pago, ficha)
- [06-panel-base-clientes.png](./agendapro/06-panel-base-clientes.png) — Base de clientes y filtros
- [07-panel-leyenda-estados.png](./agendapro/07-panel-leyenda-estados.png) — Leyenda de orígenes y estados
- [08-sitio-publico-servicios.png](./agendapro/08-sitio-publico-servicios.png) — Sitio público: selección de servicios
- [09-sitio-publico-horarios.png](./agendapro/09-sitio-publico-horarios.png) — Sitio público: selección de fecha y horario (Mañana / Tarde)
- [10-sitio-publico-contacto.png](./agendapro/10-sitio-publico-contacto.png) — Sitio público: datos de contacto
- [11-movil-agenda.png](./agendapro/11-movil-agenda.png) — Vista móvil de la agenda
