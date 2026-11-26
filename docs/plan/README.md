# Plan y handoff — `nails`

Punto de entrada para retomar el trabajo desde cualquier máquina (oficina, laptop, otro agente IA).

**Última actualización:** 2026-11-25 · **Estado:** `main` verde (`npm run verify` = 0 errores, 0 warnings + `npm run test:e2e` verde) · **Fases 0, 1, 2, 3A, 3A+, 3B, Pulido UI/UX y Wave 2 completadas** · **Único pendiente para runtime 100% Supabase:** cablear las rutas SSR, admin y webhooks restantes desde `src/lib/repositories/db.ts` hacia `getRepository()`.

## Documentos

| Documento | Contenido |
|---|---|
| [implementation_plan.md](./implementation_plan.md) | Plan original de arquitectura e implementación (decisiones acordadas con el cliente, stack, módulos, anti-colisión, WhatsApp, multi-admin, SMS) |
| [architecture_review.md](./architecture_review.md) | Revisión de arquitectura #1: hallazgos críticos C1–C8, concurrencia A1–A7, frontend F1–F5, harness H1–H6 |
| [super_mejoras.md](./super_mejoras.md) | Revisión #2 (complementa a la #1): bugs de dominio D1–D7, seguridad S1–S8, rendimiento medido P1–P4, datos M1–M6, integraciones, UX, funciones U1–U8, nuevas reglas de guardrail y **roadmap unificado** |
| [bench-availability.md](./bench-availability.md) | Benchmark reproducible del motor de disponibilidad (129 ms → 18 ms) |
| [../feature-map.md](../feature-map.md) | Mapa determinista de rutas, selectores y flujos críticos para la verificación en navegador |
| [../screenshots/README.md](../screenshots/README.md) | Capturas de pruebas en navegador de Nails y referencias competitivas de Cal.com y AgendaPro |

## Qué está hecho

1. **Fase 0 · Blindaje:** Sesiones firmadas + RBAC multi-rol (`owner` / `admin` / `specialist`), protección CSRF/cabeceras CSP, validación estricta Zod, `Idempotency-Key`, optimización 7× del motor de disponibilidad y harness AST + `oxlint` + `knip` + `astryx doctor`.
2. **Fase 1 · Fundamentos de Datos y Seguridad:** Adaptador `SupabaseSalonRepository` (`src/lib/repositories/supabase-repo.ts` con tests), 7 migraciones SQL (`supabase/migrations/0001`–`0007` + `seed.sql` con `EXCLUDE USING gist`, RPC atómica y RLS), Supabase Auth, Storage de comprobantes/inspo, cookies `httpOnly` firmadas y SSR sin FOUC.
3. **Fase 2 · Identidad LAIKONA NAILS & Arquitectura Modular:** Identidad editorial *LAIKONA NAILS by Karla* (Puebla), turnos fijos (`Karla`, `Paty`, `Tere`), anticipo SPEI `$200 MXN`, `BookingWidget` modular con `bookingMachine`, y asistente `/admin/onboarding`.
4. **Fase 3A y 3A+ · Operación, Fidelidad y UX tipo Cal.com:** Cobro dividido (`paymentSplits`) y alerta de fuga de ingresos (`sin-cobrar`), Tarjeta de Sellos LAIKONA (`8 sellos -> 50%`), popover rápido, búsqueda rápida de hora, filtro inverso CRM, exportación ARCO + `/aviso-de-privacidad`, bio-link `/links`, SEO local (`NailSalon` JSON-LD + `/sitemap.xml` + `/robots.txt`), sincronización bidireccional en URL, Troubleshooter Visual de disponibilidad, días festivos oficiales MX, enlaces VIP privados (`isPrivate`), validador WCAG AA y generador QR SVG/PNG.
5. **Fase 3B · Integraciones Reales & Confiabilidad:** Google Calendar OAuth 2.0 bidireccional (tokens cifrados AES-256-GCM + webhooks), Mercado Pago (preferencias + verificación HMAC de webhooks), `.ics` estricto RFC 5545, lista de espera automática, cascada de notificaciones, pruebas de concurrencia `fc.scheduler`, suite E2E (`e2e/nails.e2e.mjs`) y CI en `.github/workflows/verify.yml`.
6. **Pulido UI/UX de Producción:** Sistema de micro-interacciones (`prefers-reduced-motion`), skeletons de carga, modo oscuro persistente y panel `/admin` minimalista con barra lateral retraíble (`Ctrl+B`), búsqueda rápida (`Ctrl+K`) y paridad claro/oscuro/móvil.
7. **Wave 2 · Plataforma, Portal Cliente, PWA, Analítica y Crecimiento:**
   - **Seguridad y Observabilidad:** Rate limiting por ventana deslizante (`429 RATE_LIMITED`), logger JSON estructurado con redacción automática de PII/secretos/PIN/OTP y **PIN de autorización de Dueña** (`scrypt` + `timingSafeEqual`) para cancelar citas, anular precios y exportar CSV.
   - **Portal OTP `/mis-citas` y PWA Offline:** Portal sin contraseñas con OTP de 6 dígitos (cookie `httpOnly` `nails_client_portal`, fail-closed en producción) y Service Worker `/sw.js` (`laikona-v1`) con caché offline para `/cita/*`, `/mis-citas` y `/links`.
   - **Analítica Ejecutiva (`/admin/reportes`):** Ocupación y retención por especialista, mapa de calor 7×12 (`09:00–20:00`), rentabilidad por servicio (`$/min`) y motivos de cancelación con aislamiento RBAC (`specialist` solo ve sus propios datos).
   - **Crecimiento y Retención:** Política automática de anticipo por inasistencias (`noShowDepositThreshold`), reservas recurrentes (2/3/4 semanas, 2–6 citas) + retoque 1 clic `+21 días`, paquetes de sesiones prepagados (`/api/admin/packages`), campañas de cumpleaños (7 días) y reactivación 45+ días (`/api/admin/campaigns`), generador de incrustación en 3 modos (`Inline`, `Botón flotante`, `Popup modal` -> `/reservar?embed=1`), inventario optimista y property tests de DST en `fast-check`.

> [!NOTE]
> **Único pendiente para operar 100% en runtime con Supabase:** `SupabaseSalonRepository` (`src/lib/repositories/supabase-repo.ts`), las migraciones SQL `0001`–`0007`, Google Calendar, Mercado Pago, Resend, WhatsApp Cloud API y Twilio SMS **ya están implementados**. Solo falta completar la migración de las rutas SSR, admin y webhooks que aún importan directamente helpers de `src/lib/repositories/db.ts` hacia el puerto `getRepository()` / `SalonRepository`.

## Roadmap (estado real)

| Fase | Alcance | Estado |
|---|---|---|
| **0 · Blindaje** | C2–C8, D1, D2, D6, S1–S4, P1, H1–H3 + guardrails AST/`oxlint` | **Completada** |
| **1 · Datos y Seguridad** | `SupabaseSalonRepository`, migraciones `0001`–`0007`, RPC atómica, Supabase Auth, Storage, `Clock`, cookies `httpOnly` | **Completada** *(pendiente solo cablear rutas restantes a `getRepository()`)* |
| **2 · Estructura y Marca** | Identidad LAIKONA NAILS, `BookingWidget` modular + `bookingMachine`, `/admin/onboarding` | **Completada** |
| **3A / 3A+ · Operación y UX** | Cobro dividido, sellos, CRM inverso, ARCO, SEO local, URL sync, Troubleshooter, festivos MX, VIP links, WCAG AA, QR | **Completada** |
| **3B · Integraciones y Confianza** | Google Calendar AES-GCM, Mercado Pago HMAC, ICS RFC 5545, lista de espera, cascada, `fc.scheduler`, E2E + CI | **Completada** |
| **UI/UX Polish** | Panel `/admin` minimalista (`Ctrl+B` / `Ctrl+K`), motion system, skeletons, modo oscuro persistente, paridad móvil | **Completada** |
| **Wave 2 · Crecimiento y Plataforma** | Rate limit, logger PII-safe, PIN de Dueña, política no-show, recurrencia, `/mis-citas` OTP, PWA `/sw.js`, `/admin/reportes`, paquetes, campañas, embed 3 modos, DST tests | **Completada** |
| **Cableado final Supabase runtime** ← *único pendiente* | Migrar rutas SSR, `/api/admin/*` y webhooks restantes de helpers locales en `db.ts` a `getRepository()` | **Pendiente** |

Detalle histórico completo en [super_mejoras.md §9](./super_mejoras.md#9-roadmap-unificado-ambos-documentos).

## Cómo retomar en otra máquina

```bash
git clone https://github.com/jairbonillacan-cmd/nails.git
cd nails
npm install
npx @astryxdesign/cli init

# Skills obligatorias (globales, para todos los agentes IA)
npx skills add https://github.com/cloudflare/security-audit-skill --skill security-audit --global
npx skills add https://github.com/GoogleChrome/modern-web-guidance --skill modern-web-guidance --global
npx skills ls -g

# Correr en modo demo (no requiere credenciales)
npm run dev            # http://localhost:3000

# Gatekeeper y E2E (deben pasar con 0 errores y 0 warnings antes de cualquier commit)
npm run verify
npm run test:e2e       # contra servidor local levantado (E2E_BASE_URL=http://127.0.0.1:3000)
```

- `.env.local` **no** está en el repo (está en `.gitignore`); copia `.env.example` si necesitas credenciales reales.
- `.nails-demo-db.json` se genera solo al arrancar; bórralo para volver a los datos limpios de fábrica (incluyendo paquetes y cohortes de Wave 2).
- Las vistas previas `themes/*/sheet*.html` (~13 MB) no se suben; se regeneran con `astryx experimental theme editor show nails --png`.

## Reglas de trabajo (resumen de AGENTS.md)

- Nada se da por terminado si `npm run verify` no pasa con 0 errores y 0 warnings; los cambios de UI además se verifican en el navegador siguiendo `docs/feature-map.md`.
- Cero comentarios en `src/**` (solo `// INVARIANT:` auditado), cero `useEffect`/`setTimeout` en UI, cero `<div>`/`<span>`/hex/px crudos, cero `any`.
- Cada bug se corrige en el sistema: tipos → regla de guardrail → property test.
- Primero tipos y contratos Zod, después UI; simplificar antes de agregar capas.
