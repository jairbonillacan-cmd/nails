# Cotización Comercial & Migración a Producción — Laikona Nails

Apartado dedicado a la propuesta comercial de **devand** (`devand.net`) para **Laikona Nails** (`@laikona.nailsss`) y al prompt técnico para migrar este repositorio al stack de producción.

---

## Documentos

| Archivo | Descripción |
| :--- | :--- |
| [`cotizacion-laikona-nails.pdf`](./cotizacion-laikona-nails.pdf) | Propuesta comercial final (3 páginas, formato carta) lista para enviar al cliente. |
| [`prompt-migracion-produccion.md`](./prompt-migracion-produccion.md) | Prompt maestro listo para ejecutar la migración del repo a Cloudflare Workers + Supabase Free + Cloudflare R2 + Meta WhatsApp Cloud API (Coexistence) + Resend + GitHub Actions. |

---

## Resumen comercial (Propuesta devand)

- **Cliente:** Laikona Nails (`@laikona.nailsss`) · **3 usuarios incluidos**
- **Inversión anual:** **\$6,000 MXN / año** netos (equivalente a **\$500 MXN mensuales**)
- **Calendario de pagos — Año 1:**
  - Anticipo al autorizar: **\$500 MXN**
  - Meses 1 y 2 (periodo inicial): **\$250 MXN / mes** (2 × \$250)
  - Saldo restante cada 2 meses: **5 pagos bimestrales de \$1,000 MXN** (meses 4, 6, 8, 10 y 12)
- **Renovación a partir del 2.º año:** **\$6,000 MXN / año** (pago anual o en dos pagos semestrales de \$3,000 MXN)
- **Alcance principal:** agenda web en tiempo real, recordatorios automáticos por correo (hasta 3,000/mes) y WhatsApp Business oficial sincronizado en móvil y plataforma (hasta 500/mes), Google Calendar, anticipos SPEI de \$200 MXN (\$0 comisiones bancarias), panel administrativo por roles, dominio propio, respaldos, resguardo de comprobantes y fotos por 12 meses con recordatorio automático previo a depuración, y sitio web 100% personalizado con la identidad del estudio.
- **Servicios opcionales (bajo solicitud):**
  - SMS adicionales: **\$4.50 / SMS** (50 por \$225 MXN)
  - Paquetes adicionales de WhatsApp: **\$220 MXN** por 200 mensajes
  - **Asistente IA:** costo extra **por consulta de alcance**
  - Cobro en línea con tarjeta u OXXO: activación opcional (sujeta a comisión del procesador)

---

## Stack de producción acordado

| Capa | Proveedor | Notas |
| :--- | :--- | :--- |
| **Hosting, Edge, DNS y Cron** | **Cloudflare Workers** (`@opennextjs/cloudflare`) + Cron Triggers | 100% uso comercial; validación de CPU (Free 10 ms o Paid \$5 USD/mes) |
| **Base de datos, Auth y Realtime** | **Supabase Free** | Mantiene `supabase-repo.ts` y migraciones `0001`–`0008`; keep-alive vía Cron Trigger |
| **Almacenamiento privado de media** | **Cloudflare R2 Free** (10 GB, \$0 egress) | `proofs/` e `inspo/` con política de retención a 12 meses + recordatorio automático |
| **Respaldos automáticos de BD** | **GitHub Actions (`pg_dump`) → Cloudflare R2** | Retención rotativa de 30 días en prefijo privado `backups/db/` |
| **WhatsApp oficial** | **Meta WhatsApp Cloud API + Coexistence** | Plantillas `UTILITY` (`es_MX`), webhook HMAC-SHA256 y cuota monitoreada de 500/mes |
| **Correo transaccional y calendario** | **Resend Free** (3,000/mes) + **Google Calendar OAuth 2.0** | Dominio propio con SPF/DKIM/DMARC y adjunto `.ics` RFC 5545 |
| **Anticipos y opcionales** | **SPEI \$200 MXN** (Opción A por defecto) | Twilio SMS y Mercado Pago / Stripe desactivados por defecto |
