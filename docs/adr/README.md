# Architecture Decision Records (ADRs) — LAIKONA NAILS

Registro histórico de las decisiones de arquitectura más relevantes de **LAIKONA NAILS BY KARLA**. Cada documento sigue un formato **MADR-lite** (Estado, Fecha, Área, Contexto, Decisión, Alternativas consideradas, Consecuencias y trade-offs, Evidencia y archivos clave) anclado a rutas, contratos y pruebas reales del repositorio.

## Índice maestro

| ID | Título | Estado | Área | Fecha |
| :--- | :--- | :--- | :--- | :--- |
| [ADR-0001](./0001-dual-repository-y-presupuesto-subrequests-workers.md) | Repositorio dual, consultas puntuales y presupuesto de subrequests en Cloudflare Workers | Aceptado | Persistencia y Runtime Serverless | 2026-11-27 |
| [ADR-0002](./0002-sistema-diseno-astryx-guardrails-y-ux-admin.md) | Sistema de diseño Astryx, guardrails mecánicos AST y arquitectura UX del panel admin | Aceptado | Sistema de Diseño, Calidad y UX Admin | 2026-11-27 |
| [ADR-0003](./0003-concurrencia-reservas-holds-y-lista-espera-fifo.md) | Concurrencia de reservas, apartados temporales, bloqueos de calendario y lista de espera FIFO | Aceptado | Motor de Disponibilidad y Concurrencia | 2026-11-27 |
| [ADR-0004](./0004-seguridad-rbac-otp-pin-media-r2-y-qr-recepcion.md) | Seguridad, RBAC multi-rol, endurecimiento OTP/PIN, media privada en R2 y barra QR de recepción | Aceptado | Seguridad, Privacidad (LFPDPPP) y RBAC | 2026-11-27 |
| [ADR-0005](./0005-caja-ventas-integridad-contable-y-configuracion-sin-migraciones.md) | Evolución de Caja/Ventas, integridad contable y configuración de `/cita/[token]` sin migraciones SQL | Aceptado | Caja/Ventas y Configuración Dinámica | 2026-11-27 |
| [ADR-0006](./0006-modulo-clientas-crm-ficha-tecnica-y-consultas-puntuales.md) | Rediseño del módulo Clientas (CRM), ficha técnica de uñas y consultas puntuales | Aceptado | CRM de Clientas y Rendimiento Serverless | 2026-11-27 |
| [ADR-0007](./0007-caja-personalizable-corte-con-fondo-y-comision-retail-configurable.md) | Caja personalizable (`cajaConfig`), corte con fondo inicial y comisión retail configurable | Aceptado | Caja/Ventas y Configuración Dinámica | 2026-11-27 |

## Cómo añadir un nuevo ADR

1. **Cuándo crear uno:** ante cambios con impacto duradero en fronteras de seguridad, persistencia/migraciones, contratos públicos o de API, presupuesto de runtime serverless, sistema de diseño o invariantes del negocio.
2. **Convención de nombre:** crea `docs/adr/NNNN-titulo-corto-en-kebab-case.md` incrementando el número secuencial (`0006`, `0007`, etc.).
3. **Secciones obligatorias (MADR-lite):**
   - Metadatos: `Estado` (`Propuesto` | `Aceptado` | `Reemplazado por ADR-NNNN` | `Obsoleto`), `Fecha` (`YYYY-MM-DD`) y `Área`.
   - `## Contexto`: problema, restricciones reales y por qué importa ahora.
   - `## Decisión`: diseño elegido con contratos, invariantes y límites concretos.
   - `## Alternativas consideradas`: opciones descartadas y el motivo real.
   - `## Consecuencias y trade-offs`: beneficios, costos operativos y riesgos asumidos.
   - `## Evidencia y archivos clave`: rutas exactas del repositorio que implementan o verifican la decisión (sin rutas inventadas).
4. **Inmutabilidad y actualización:** un ADR aceptado no se reescribe para cambiar historia; si una decisión cambia en el futuro, marca el anterior como `Reemplazado por ADR-NNNN` y actualiza la tabla del índice maestro arriba.
5. **Verificación previa:** asegúrate de que todos los archivos, endpoints y pruebas citados existan realmente en el repositorio y que `npm run verify` pase con 0 errores y 0 warnings.
