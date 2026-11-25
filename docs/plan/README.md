# Plan y handoff — `nails`

Punto de entrada para retomar el trabajo desde cualquier máquina (oficina, laptop, otro agente IA).

**Última actualización:** 2026-11-25 · **Estado:** `main` verde (`npm run verify` = 0 errores, 0 warnings) · **Siguiente paso:** Fase 0 del roadmap.

## Documentos

| Documento | Contenido |
|---|---|
| [implementation_plan.md](./implementation_plan.md) | Plan original de arquitectura e implementación (decisiones acordadas con el cliente, stack, módulos, anti-colisión, WhatsApp, multi-admin, SMS) |
| [architecture_review.md](./architecture_review.md) | Revisión de arquitectura #1: hallazgos críticos C1–C8, concurrencia A1–A7, frontend F1–F5, harness H1–H6 |
| [super_mejoras.md](./super_mejoras.md) | Revisión #2 (complementa a la #1): bugs de dominio D1–D7, seguridad S1–S8, rendimiento medido P1–P4, datos M1–M6, integraciones, UX, funciones U1–U8, nuevas reglas de guardrail y **roadmap unificado** |
| [bench-availability.md](./bench-availability.md) | Benchmark reproducible del motor de disponibilidad (129 ms → 18 ms) |
| [../feature-map.md](../feature-map.md) | Mapa de rutas, selectores y flujos críticos para la verificación en navegador |
| [../screenshots/README.md](../screenshots/README.md) | Capturas de pruebas en navegador de Nails y referencias competitivas de Cal.com y AgendaPro |

## Qué está hecho

1. App completa en modo demo: landing, reserva en tiempo real (`/reservar`), link mágico de clienta (`/cita/[token]`), panel admin multi-rol (owner / admin / specialist) con citas, servicios, disponibilidad, equipo, clientas, caja, inventario, marca e integraciones.
2. Esquema Supabase (`supabase/migrations/0001`, `0002`, `seed.sql`) con `EXCLUDE USING gist` anti-doble-booking y RLS.
3. Integraciones con adaptador demo: Resend + `.ics`, WhatsApp Cloud API (notificaciones + Flows), Twilio SMS, cupones/gift cards, lista de espera, reseñas → Google Maps, Meta Pixel/GA4, PWA.
4. Harness "All Code Is Slop (Except Mine)": guardrails AST + `oxlint`, TypeScript estricto, `knip`, property tests con `fast-check`, `astryx doctor` y el gatekeeper `npm run verify`.
5. Skills obligatorias documentadas en el [README](../../README.md) y en [AGENTS.md](../../AGENTS.md).
6. Dos revisiones de arquitectura con roadmap (este directorio).

> [!WARNING]
> **Todavía no está listo para producción.** Supabase no está implementado en el código (todo usa `.nails-demo-db.json`), hay huecos de autenticación (C2–C8) y Google Calendar y los pagos son simulados. Ver [architecture_review.md](./architecture_review.md) §1 y [super_mejoras.md](./super_mejoras.md) §5.

## Roadmap (resumen)

| Fase | Alcance | Duración estimada |
|---|---|---|
| **0 · Blindaje** ← *siguiente* | C2–C8, D1, D2, D6, S1–S4, P1, H1–H3 + nuevas reglas de guardrail | 2–3 días |
| 1 · Datos reales | Adaptador Supabase, RPC atómica, Supabase Auth, Realtime sin PII, Storage, `Clock` | 4–6 días |
| 2 · Estructura | Partir `BookingWidget`, máquina de estados, Server Components/Actions, `proxy.ts`, DTOs públicos, caché | 3 días |
| 3 · Integraciones reales | Google Calendar, Mercado Pago, plantillas WhatsApp, ICS RFC 5545 | 4–5 días |
| 4 · Confianza | Playwright + axe, test de concurrencia, Stryker, CI | 2 días |
| 5 · Crecimiento | Citas recurrentes, política de no-show, lista de espera automática, portal OTP, SEO local, aviso de privacidad | continuo |

Detalle completo: [super_mejoras.md §9](./super_mejoras.md#9-roadmap-unificado-ambos-documentos).

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

# Gatekeeper (debe pasar con 0 errores y 0 warnings antes de cualquier commit)
npm run verify
```

- `.env.local` **no** está en el repo (está en `.gitignore`); copia `.env.example` si necesitas credenciales.
- `.nails-demo-db.json` se genera solo al arrancar; bórralo para volver a los datos de fábrica.
- Las vistas previas `themes/*/sheet*.html` (~13 MB) no se suben; se regeneran con `astryx experimental theme editor show nails --png`.

## Reglas de trabajo (resumen de AGENTS.md)

- Nada se da por terminado si `npm run verify` no pasa con 0 errores y 0 warnings; los cambios de UI además se verifican en el navegador siguiendo `docs/feature-map.md`.
- Cero comentarios en `src/**` (solo `// INVARIANT:` auditado), cero `useEffect`/`setTimeout` en UI, cero `<div>`/`<span>`/hex/px crudos, cero `any`.
- Cada bug se corrige en el sistema: tipos → regla de guardrail → property test.
- Primero tipos y contratos Zod, después UI; simplificar antes de agregar capas.
