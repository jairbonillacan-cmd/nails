# Benchmark del motor de disponibilidad (P1)

Mide `getAvailabilityForRange` sobre la base demo real (`.nails-demo-db.json`, 2 especialistas activas).

## Resultado (Node 24.22, 2026-11-25)

| Escenario | Actual | Con `Intl.DateTimeFormat` cacheado |
|---|---|---|
| 35 días | 128.7 ms | 18.5 ms |
| 45 días | 162.0 ms | 17.4 ms |

**Causa:** `zonedDateTimeToUtc` → `getTimezoneOffsetMs` crea un `Intl.DateTimeFormat` nuevo en cada llamada, y se llama 2 veces por slot candidato.

**Arreglo propuesto:** cachear el formatter por zona horaria (`Map<string, Intl.DateTimeFormat>`) en `src/lib/availability/engine.ts`.

## Cómo reproducirlo

Requiere que exista `.nails-demo-db.json` (se crea al abrir la app en modo demo). Guarda el script fuera de `src/` (por ejemplo, `/tmp/bench.mts`) y córrelo con `node --experimental-strip-types --no-warnings /tmp/bench.mts` desde la raíz del repo.

```ts
import fs from 'node:fs';
import { getAvailabilityForRange } from './src/lib/availability/engine.ts';

const db = JSON.parse(fs.readFileSync('./.nails-demo-db.json', 'utf8'));
const ctx = {
  settings: db.settings,
  service: db.services[0],
  addons: [],
  staffMembers: db.staff.filter((s: { isActive: boolean }) => s.isActive),
  schedules: db.schedules,
  dateOverrides: db.dateOverrides,
  bookings: db.bookings,
  slotHolds: db.slotHolds,
  calendarConnections: db.calendarConnections,
};
const today = new Date().toISOString().slice(0, 10);

for (const days of [35, 45]) {
  const t = performance.now();
  let n = 0;
  for (let i = 0; i < 5; i++) {
    n = getAvailabilityForRange(ctx, today, days, null).reduce((a, d) => a + d.slotCount, 0);
  }
  console.log(`days=${days} slots=${n} avg=${((performance.now() - t) / 5).toFixed(1)}ms`);
}
```

> El `import` usa ruta relativa a la raíz del repo; si guardas el script en `/tmp`, cambia la ruta a la absoluta de tu clon.
