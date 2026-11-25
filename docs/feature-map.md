# Feature Map & Verification Guide — Nails

Mapa determinista de rutas, precondiciones, selectores accesibles y flujos críticos para verificar **Nails** en navegador/CDP sin adivinanzas.

---

## Precondiciones Generales
- Servidor corriendo: `npm run dev` o `npm run build && npm run start` en `http://localhost:3000`.
- **Modo Demo Local** (sin variables de Supabase en `.env.local`):
  - Base persistente en `.nails-demo-db.json` (borrar archivo reinicia datos limpios de fábrica).
  - Cupones activos de prueba: `BIENVENIDA10` (10% off, mínimo \$300 MXN) y `GIFT500` (\$500 MXN saldo).
  - Links mágicos demo sembrados:
    - Cita próxima confirmada: `/cita/demo-token-sofia-1042` (`NL-1042`)
    - Cita pendiente con comprobante SPEI: `/cita/demo-token-andrea-1044` (`NL-1044`)
    - Cita completada con encuesta/reseña: `/cita/demo-token-paula-1039` (`NL-1039`)
  - Usuarios admin demo: `duena@nails.studio` (`owner`), `recepcion@nails.studio` (`admin`), `camila@nails.studio` (`specialist`).

---

## 1. Landing Brandeada (`/`)
- **Precondiciones:** Ninguna (acceso público).
- **Elementos clave y selectores:**
  - TopNav: `role="navigation"` (`Navegación principal del salón`), botones `Panel` (`/admin`), `Agendar cita` (`/reservar`), toggle modo claro/oscuro (`aria-label*="modo"`).
  - Hero: `h1` con `settings.landingContent.heroTitle`, texto `Agenda abierta en tiempo real`, foto de manicure y CTA `Agendar mi cita ahora` (`/reservar`).
  - Catálogo `#servicios`: `TabList` (`Todos los servicios`, `Uña Natural & Gel`, `Extensiones & Esculturales`, `Pies & Spa`), cards de servicio con botón `Reservar` (`/reservar/[slug]`).
  - Galería `#galeria`: `TabList` por categoría + 4 ilustraciones SVG + botones `Quiero este diseño` (`/reservar/[slug]?inspo=...`).
- **Flujo de verificación:**
  1. Cambiar pestaña de categoría en Servicios -> cambia la cantidad de tarjetas visibles.
  2. Cambiar pestaña en Galería -> filtra tarjetas.
  3. Alternar modo claro/oscuro -> el tema Astryx actualiza superficies sin recargar.
  4. Clic en `Reservar` de un servicio -> navega a `/reservar/[slug]` con ese servicio preseleccionado.

---

## 2. Flujo de Reserva en Tiempo Real (`/reservar` y `/reservar/[slug]`)
- **Precondiciones:** Al menos 1 servicio activo y 1 manicurista con horario laboral configurado.
- **Query params soportados:** `?servicio=<slug>`, `?staff=<bookingSlug>`, `?inspo=<texto>`.
- **Selectores y controles clave:**
  - Paso 1 (Servicios y Extras): `SelectableCard` por servicio, `CheckboxInput` por extra (ej. `Retiro de gel o acrílico previo (+20 min · +$120)`), `SelectableCard` de especialista (visible solo si hay >1 manicurista activa).
  - Paso 2 (Agenda en vivo):
    - `SegmentedControl` `Formato de hora`: `12h` | `24h`.
    - `SegmentedControl` `Vista de calendario`: `Mes` | `Semana` | `Columnas`.
    - En `Mes`: resumen izquierdo (duración total + precio actualizado en vivo), `Calendar` Astryx al centro, botones de horario agrupados en `Mañana` / `Tarde` / `Noche` a la derecha.
    - Botón `Lista de espera` -> abre `Dialog` (`Lista de espera`) -> `POST /api/waitlist`.
  - Paso 3 (Confirmación y Hold 3 min):
    - Barra de progreso `Tiempo restante de apartado` + badge mm:ss (`POST /api/slot-holds`).
    - Inputs: `Nombre completo` (requerido), `WhatsApp (México +52)` (requerido), `Correo electrónico`, `Fecha de cumpleaños (YYYY-MM-DD)`, `Notas sobre tu diseño o alergias`, `FileInput` (`Foto de inspiración (inspo)`), `Cupón o Gift Card` + botón `Aplicar` (`POST /api/coupons/validate`).
    - Botón submit: `Confirmar mi cita ahora` o `Solicitar y apartar horario` (`POST /api/bookings` con `Idempotency-Key`).
- **Flujos críticos a verificar:**
  1. Marcar un extra (+20 min) -> aumenta duración y precio total en el resumen y recalcula el número de horarios disponibles.
  2. Cambiar vistas `Mes` -> `Semana` -> `Columnas` -> renderizan horarios reales sin desbordes.
  3. Seleccionar un horario -> aparece el contador de **3 minutos** (`Horario apartado para ti`).
  4. Aplicar cupón `BIENVENIDA10` -> aparece banner verde con descuento y baja el `Total estimado`.
  5. Confirmar reserva -> redirige a `/cita/[manageToken]` y el horario desaparece inmediatamente para otras sesiones vía `/api/realtime`.
  6. Colisión concurrente (`409 SLOT_TAKEN`): muestra `Banner` amarillo con 3 horarios sugeridos clicables sin borrar los datos escritos.

---

## 3. Página Mágica de Clienta (`/cita/[token]`)
- **Precondiciones:** Token válido en `bookings.manageToken` (ej. `/cita/demo-token-sofia-1042` o uno recién creado).
- **Controles clave:**
  - Badge de estado (`Confirmada`, `Pendiente de confirmación`, `Completada`, `Cancelada`, `No asistió`) y código `NL-xxxx`.
  - Botones de calendario: `Google Calendar`, `Apple / iPhone (.ics)` (`/api/bookings/manage/[token]/ics`), `Outlook`, `Enviar por WhatsApp`.
  - Acciones (cuando está activa): `Reagendar` (abre modal con horarios libres excluyendo la cita actual) y `Cancelar cita` (abre modal con motivo).
  - Encuesta post-cita (cuando `status === 'completed'`, ej. `/cita/demo-token-paula-1039`): botones `1 ★`..`5 ★` + comentario -> si calificación >= 4 muestra botón `Dejar reseña en Google`.
- **Verificación de política:**
  - Intentar cancelar o reagendar dentro de las `minCancelHours` (12h) devuelve `400 POLICY_WINDOW` sin modificar la cita.

---

## 4. Acceso Admin (`/admin/login`) y Layout Multi-Rol (`/admin/*`)
- **Precondiciones:** En modo demo inicia autenticado como `owner` salvo que se cierre sesión; el selector superior en el banner permite cambiar entre `owner`, `admin` y `specialist`.
- **Verificación RBAC:**
  - `owner`: ve todas las secciones incluyendo `Marca, Tema y Landing` e `Integraciones y WhatsApp` y puede agregar usuarios en `/admin/equipo`.
  - `admin`: gestiona Citas, Servicios, Disponibilidad, Clientas, Caja, Inventario y Manicuristas; no ve `Marca` ni `Integraciones` ni puede crear otros `admin_users`.
  - `specialist`: solo ve Inicio, sus propias Citas, su propia Disponibilidad y sus propias Comisiones/Caja.

---

## 5. Panel Admin — Módulos Críticos

| Ruta | Propósito | Acciones verificables clave |
| :--- | :--- | :--- |
| `/admin` | Resumen operativo | KPIs (`Citas hoy`, `Caja neta registrada`, `Satisfacción y reseñas`, `Alertas activas`), alertas de confirmación, próximas citas, lista de espera y stock bajo. |
| `/admin/citas` | Gestión de agenda y walk-ins | Tabs (`Próximas`, `Por confirmar`, `Pasadas`, `Canceladas`, `Lista de espera`), toggle `Lista`/`Por día`, botón `Nueva cita manual / Walk-in` (elige servicio primero -> horarios reales), botón `Bloquear día`, acciones 1 clic (`Confirmar`, `Completar y cobrar`, `No asistió`, `Cancelar`, `Hablar por WhatsApp`). |
| `/admin/servicios` | Catálogo + Preview en vivo | Pestañas `Servicios` y `Extras / Add-ons`; editar nombre/duración/precio actualiza la tarjeta `VISTA PREVIA EN VIVO`; `Copiar link` copia `/reservar/[slug]`; switch `Activo` persiste. |
| `/admin/disponibilidad` | Horarios partidos + Troubleshooter | Turnos partidos (`Agregar turno`), `Copiar a L–V`, `Guardar horario`, pestaña `Excepciones y vacaciones` y pestaña `Diagnóstico (Troubleshooter)` (`GET /api/availability?mode=diagnose`). |
| `/admin/equipo` | Manicuristas + Admins RBAC | Agregar manicurista con % de comisión; activar/desactivar especialista; invitar/agregar usuarios del panel con rol (`owner` únicamente). |
| `/admin/clientas` | CRM de clientas | Búsqueda por texto, switch `Cumpleañeras del mes`, botón `Ficha` (editar cumpleaños y notas técnicas privadas) y botón `WhatsApp`. |
| `/admin/caja` | Caja, Comisiones, CSV y Cupones | Arqueo con `Efectivo contado físicamente (MXN)`, registrar egresos/ventas, `Exportar reporte CSV` (`/api/admin/operations?export=csv`), tabla de comisiones por manicurista, crear cupones/Gift Cards. |
| `/admin/inventario` | Stock y alertas | Alertas de stock bajo, botones `+1 Entrada`, `-1 Consumo` y `Vender (Caja)` (descuenta inventario y suma a Caja automáticamente). |
| `/admin/marca` | Branding y Tema Astryx en vivo | Cambiar presets de color o esquinas actualiza el tema Astryx y la `VISTA PREVIA EN VIVO DEL SITIO PÚBLICO` al instante; `Guardar cambios` persiste en `PATCH /api/admin/brand`. |
| `/admin/integraciones` | Calendar, WhatsApp, SMS, Analytics y Pagos | Toggle Google Calendar (destino + conflictos), botón `Simular reserva entrante por WhatsApp` (`POST /api/webhooks/whatsapp` -> crea cita `NL-xxxx` y bloquea horario en vivo), switches de workflows (`Correo`, `WhatsApp`, `SMS Twilio`), guardar `Meta Pixel ID` / `GA4` / `Google Review URL`, selector de `paymentMode`. |

---

## Gatekeeper Único de Verificación
Antes de dar cualquier cambio por terminado debe pasar en verde con **0 errores y 0 warnings**:
```bash
npm run verify
```
Que ejecuta secuencialmente:
`typecheck` -> `guardrails` (AST + `oxlint --deny-warnings`) -> `deadcode` (`knip`) -> `test` (unitarios + concurrencia + `fast-check` property tests) -> `doctor` (`astryx doctor --built .next`) -> `build` (`next build`).
