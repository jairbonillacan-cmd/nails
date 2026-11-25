import assert from 'node:assert/strict';
import crypto from 'node:crypto';

const BASE_URL = (process.env.E2E_BASE_URL || 'http://127.0.0.1:1717').replace(/\/$/, '');
const RUN_BROWSER = process.env.E2E_BROWSER === '1';

function extractCookieHeader(response) {
  const getSetCookie = response.headers.getSetCookie?.bind(response.headers);
  const rawList = getSetCookie ? getSetCookie() : [];
  if (rawList.length > 0) {
    return rawList
      .map((item) => item.split(';')[0]?.trim())
      .filter(Boolean)
      .join('; ');
  }
  const single = response.headers.get('set-cookie');
  if (!single) return '';
  return single.split(';')[0]?.trim() || '';
}

async function fetchText(path, init) {
  const res = await fetch(`${BASE_URL}${path}`, init);
  const text = await res.text();
  return { status: res.status, headers: res.headers, text };
}

async function fetchJson(path, init) {
  const res = await fetch(`${BASE_URL}${path}`, init);
  const text = await res.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = null;
  }
  return { status: res.status, headers: res.headers, json, text };
}

function getDateKeyOffsetDays(days) {
  const dt = new Date(Date.now() + days * 86_400_000);
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Mexico_City',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(dt);
}

function assertRfc5545Ics(icsText) {
  assert.ok(icsText.includes('BEGIN:VCALENDAR'), 'ICS debe contener BEGIN:VCALENDAR');
  assert.ok(icsText.includes('END:VCALENDAR'), 'ICS debe contener END:VCALENDAR');
  assert.ok(icsText.includes('\r\n'), 'ICS debe usar CRLF');
  const withoutCrlf = icsText.replace(/\r\n/g, '');
  assert.equal(
    withoutCrlf.includes('\n') || withoutCrlf.includes('\r'),
    false,
    'ICS no debe contener saltos LF/CR sueltos',
  );
  for (const line of icsText.split('\r\n')) {
    const byteLen = Buffer.byteLength(line, 'utf8');
    assert.ok(
      byteLen <= 75,
      `Línea ICS excede 75 octetos UTF-8 (${byteLen} bytes): ${line}`,
    );
  }
}

async function findFarFutureSlots(count = 2) {
  const startDate = getDateKeyOffsetDays(3);
  const res = await fetchJson(
    `/api/availability?mode=quick_search&serviceId=srv-rubber&startDate=${encodeURIComponent(startDate)}&days=21&limit=12`,
  );
  assert.equal(res.status, 200, `quick_search falló: ${res.status} ${res.text}`);
  const slots = Array.isArray(res.json?.slots) ? res.json.slots : [];
  const distinct = [];
  const seen = new Set();
  const minMs = Date.now() + 36 * 3_600_000;
  for (const slot of slots) {
    const startMs = new Date(slot.startAt).getTime();
    if (Number.isNaN(startMs) || startMs < minMs) continue;
    const key = `${slot.staffId}|${slot.startAt}`;
    if (seen.has(key)) continue;
    seen.add(key);
    distinct.push(slot);
    if (distinct.length >= count) break;
  }
  assert.ok(
    distinct.length >= count,
    `Se esperaban al menos ${count} horarios futuros disponibles, encontrados: ${distinct.length}`,
  );
  return distinct;
}

async function testPublicRoutesAndSeo() {
  const landing = await fetchText('/');
  assert.equal(landing.status, 200);
  assert.ok(landing.text.includes('LAIKONA NAILS'), 'Landing debe renderizar LAIKONA NAILS');
  assert.ok(landing.text.includes('NailSalon'), 'Landing debe incluir JSON-LD NailSalon');
  assert.equal(
    landing.text.includes('commissionPercent'),
    false,
    'Landing no debe exponer commissionPercent',
  );

  const links = await fetchText('/links');
  assert.equal(links.status, 200);
  assert.ok(links.text.includes('laikona.nailsss'));
  assert.ok(links.text.includes('/reservar'));
  assert.equal(links.text.includes('commissionPercent'), false);

  const privacy = await fetchText('/aviso-de-privacidad');
  assert.equal(privacy.status, 200);
  assert.ok(privacy.text.includes('LFPDPPP'));
  assert.ok(privacy.text.includes('ARCO'));

  const sitemap = await fetchText('/sitemap.xml');
  assert.equal(sitemap.status, 200);
  assert.ok(sitemap.text.includes('/reservar/rubber'));
  assert.ok(sitemap.text.includes('/links'));

  const robots = await fetchText('/robots.txt');
  assert.equal(robots.status, 200);
  assert.ok(robots.text.includes('/admin/'));

  const servicePage = await fetchText('/reservar/rubber');
  assert.equal(servicePage.status, 200);
  assert.equal(servicePage.text.includes('commissionPercent'), false);

  const managePage = await fetchText('/cita/demo-token-sofia-1042');
  assert.equal(managePage.status, 200);
  assert.ok(managePage.text.includes('Tarjeta de Sellos LAIKONA'));
  assert.equal(managePage.text.includes('commissionPercent'), false);

  const manageReschedule = await fetchText('/cita/demo-token-sofia-1042?action=reschedule');
  assert.equal(manageReschedule.status, 200);

  const bootstrap = await fetchJson('/api/public/bootstrap');
  assert.equal(bootstrap.status, 200);
  assert.equal(bootstrap.json?.settings?.name, 'LAIKONA NAILS');
  assert.equal(bootstrap.json?.settings?.depositAmountCents, 20000);
  assert.equal(bootstrap.json?.settings?.depositClabe, '7229 6901 3959 779869');
  assert.equal(
    JSON.stringify(bootstrap.json).includes('commissionPercent'),
    false,
    'Public bootstrap no debe filtrar commissionPercent',
  );
}

async function testHappyPathConsentSpeiAndIcs(slot) {
  const suffix = crypto.randomInt(1000, 9999);
  const phone = `+52222910${suffix}`;

  const rejected = await fetchJson('/api/bookings', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      serviceId: 'srv-rubber',
      addonIds: [],
      staffId: slot.staffId,
      startAt: slot.startAt,
      clientName: 'Clienta Sin Consentimiento',
      clientPhone: phone,
    }),
  });
  assert.equal(rejected.status, 400);
  assert.equal(rejected.json?.code, 'PRIVACY_CONSENT_REQUIRED');

  const created = await fetchJson('/api/bookings', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Idempotency-Key': `e2e-happy-${crypto.randomUUID()}`,
    },
    body: JSON.stringify({
      serviceId: 'srv-rubber',
      addonIds: [],
      staffId: slot.staffId,
      startAt: slot.startAt,
      clientName: 'Clienta E2E Feliz',
      clientPhone: phone,
      clientInstagram: '@clienta.e2e',
      proofDeliveryMethod: 'instagram_dm',
      privacyConsentAccepted: true,
      marketingOptIn: false,
    }),
  });
  assert.equal(created.status, 201, `Esperado 201, recibido ${created.status}: ${created.text}`);
  const booking = created.json?.booking;
  assert.ok(booking?.manageToken, 'Debe retornar manageToken');
  assert.equal(booking.depositAmountCents, 20000);

  try {
    const manageRes = await fetchJson(`/api/bookings/manage/${booking.manageToken}`);
    assert.equal(manageRes.status, 200);
    assert.equal(manageRes.json?.booking?.id, booking.id);
    assert.ok(manageRes.json?.loyaltySummary, 'Debe retornar loyaltySummary');

    const icsRes = await fetchText(`/api/bookings/manage/${booking.manageToken}/ics`);
    assert.equal(icsRes.status, 200);
    assert.ok((icsRes.headers.get('content-type') || '').includes('text/calendar'));
    assertRfc5545Ics(icsRes.text);
  } finally {
    const cancelRes = await fetchJson(`/api/bookings/manage/${booking.manageToken}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'cancel',
        reason: 'Limpieza automática prueba E2E',
      }),
    });
    assert.equal(
      cancelRes.status,
      200,
      `Limpieza de cita E2E falló: ${cancelRes.status} ${cancelRes.text}`,
    );
  }
}

async function testConcurrentDoubleBookingRace(slot) {
  const baseNum = crypto.randomInt(100, 999);
  const payloadA = {
    serviceId: 'srv-rubber',
    addonIds: [],
    staffId: slot.staffId,
    startAt: slot.startAt,
    clientName: 'Clienta Carrera A',
    clientPhone: `+5222292${baseNum}11`,
    proofDeliveryMethod: 'instagram_dm',
    privacyConsentAccepted: true,
  };
  const payloadB = {
    serviceId: 'srv-rubber',
    addonIds: [],
    staffId: slot.staffId,
    startAt: slot.startAt,
    clientName: 'Clienta Carrera B',
    clientPhone: `+5222292${baseNum}22`,
    proofDeliveryMethod: 'instagram_dm',
    privacyConsentAccepted: true,
  };

  const [resA, resB] = await Promise.all([
    fetchJson('/api/bookings', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Idempotency-Key': `e2e-race-a-${crypto.randomUUID()}`,
      },
      body: JSON.stringify(payloadA),
    }),
    fetchJson('/api/bookings', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Idempotency-Key': `e2e-race-b-${crypto.randomUUID()}`,
      },
      body: JSON.stringify(payloadB),
    }),
  ]);

  const responses = [resA, resB];
  const winners = responses.filter((r) => r.status === 201);
  const conflicts = responses.filter((r) => r.status === 409);

  assert.equal(
    winners.length,
    1,
    `Carrera concurrente debe tener exactamente 1 ganadora (201), recibidos: ${responses.map((r) => r.status).join(', ')}`,
  );
  assert.equal(
    conflicts.length,
    1,
    `Carrera concurrente debe tener exactamente 1 conflicto (409), recibidos: ${responses.map((r) => r.status).join(', ')}`,
  );

  const conflict = conflicts[0];
  assert.equal(conflict.json?.code, 'SLOT_TAKEN');
  assert.ok(
    Array.isArray(conflict.json?.suggestedSlots) && conflict.json.suggestedSlots.length > 0,
    'El conflicto 409 debe ofrecer horarios sugeridos de recuperación',
  );
  assert.equal(
    conflict.json.suggestedSlots.some(
      (s) => s.staffId === slot.staffId && s.startAt === slot.startAt,
    ),
    false,
    'Los horarios sugeridos no deben incluir el horario en conflicto',
  );

  const winnerToken = winners[0]?.json?.booking?.manageToken;
  assert.ok(winnerToken, 'La reserva ganadora debe incluir manageToken');

  const cleanup = await fetchJson(`/api/bookings/manage/${winnerToken}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      action: 'cancel',
      reason: 'Limpieza automática carrera concurrente E2E',
    }),
  });
  assert.equal(cleanup.status, 200);
}

async function testAdminRbacAndSpecialistIsolation() {
  const unauthOverview = await fetchJson('/api/admin/overview');
  assert.equal(unauthOverview.status, 401);

  const unauthArco = await fetchJson('/api/admin/clients?exportClientId=client-sofia');
  assert.equal(unauthArco.status, 401);

  const sessionProbe = await fetchJson('/api/admin/session');
  assert.equal(sessionProbe.status, 200);
  assert.equal(sessionProbe.json?.session, null);
  const availableDemoUsers = Array.isArray(sessionProbe.json?.availableDemoUsers)
    ? sessionProbe.json.availableDemoUsers
    : [];

  if (availableDemoUsers.length === 0) {
    const blockedSpecLogin = await fetchJson('/api/admin/session', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'camila@nails.studio' }),
    });
    assert.equal(
      blockedSpecLogin.status,
      503,
      `En producción sin Supabase, POST /api/admin/session (specialist) debe fallar cerrado con 503, recibido ${blockedSpecLogin.status}: ${blockedSpecLogin.text}`,
    );

    const blockedOwnerLogin = await fetchJson('/api/admin/session', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'duena@nails.studio' }),
    });
    assert.equal(
      blockedOwnerLogin.status,
      503,
      `En producción sin Supabase, POST /api/admin/session (owner) debe fallar cerrado con 503, recibido ${blockedOwnerLogin.status}: ${blockedOwnerLogin.text}`,
    );
    console.log(
      '  (modo producción fail-closed detectado: 401 en admin/ARCO y 503 en login demo verificados)',
    );
    return;
  }

  const specLogin = await fetchJson('/api/admin/session', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'camila@nails.studio' }),
  });
  assert.equal(specLogin.status, 200);
  const specCookie = extractCookieHeader(specLogin);
  assert.ok(specCookie, 'Sesión specialist debe emitir cookie');

  const specOverview = await fetchJson('/api/admin/overview', {
    headers: { Cookie: specCookie },
  });
  assert.equal(specOverview.status, 200);
  assert.equal(specOverview.json?.session?.user?.role, 'specialist');
  assert.deepEqual(specOverview.json?.recentAuditLogs, []);
  const specStaffId = specOverview.json?.session?.user?.staffMemberId;
  for (const bk of specOverview.json?.bookings ?? []) {
    assert.equal(
      bk.staffId,
      specStaffId,
      'Especialista no debe ver citas de otras manicuristas',
    );
  }

  const specArco = await fetchJson('/api/admin/clients?exportClientId=client-sofia', {
    headers: { Cookie: specCookie },
  });
  assert.equal(specArco.status, 403);

  const specBrand = await fetchJson('/api/admin/brand', {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      Cookie: specCookie,
    },
    body: JSON.stringify({ name: 'Intento No Autorizado' }),
  });
  assert.equal(specBrand.status, 403);

  const ownerLogin = await fetchJson('/api/admin/session', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'duena@nails.studio' }),
  });
  assert.equal(ownerLogin.status, 200);
  const ownerCookie = extractCookieHeader(ownerLogin);
  assert.ok(ownerCookie, 'Sesión owner debe emitir cookie');

  const ownerOverview = await fetchJson('/api/admin/overview', {
    headers: { Cookie: ownerCookie },
  });
  assert.equal(ownerOverview.status, 200);
  assert.ok(Array.isArray(ownerOverview.json?.uncollectedBookings));
  assert.ok(Array.isArray(ownerOverview.json?.nearRewardClients));
  assert.ok(Array.isArray(ownerOverview.json?.recentAuditLogs));

  const inactive = await fetchJson('/api/admin/clients?inactiveDays=21', {
    headers: { Cookie: ownerCookie },
  });
  assert.equal(inactive.status, 200);
  assert.equal(inactive.json?.inactiveDays, 21);

  const arco = await fetchJson('/api/admin/clients?exportClientId=client-sofia', {
    headers: { Cookie: ownerCookie },
  });
  assert.equal(arco.status, 200);
  assert.ok(arco.json?.client?.id === 'client-sofia');
  assert.equal(
    JSON.stringify(arco.json).includes('internalNotes'),
    false,
    'Exportación ARCO no debe exponer internalNotes privadas',
  );
}

async function testOptionalPlaywrightBrowser() {
  if (!RUN_BROWSER) return;
  let playwrightModule = null;
  try {
    const browserPkg = 'playwright';
    playwrightModule = await import(browserPkg);
  } catch {
    console.log('[e2e] Playwright no instalado; omitiendo checks de navegador.');
    return;
  }

  const browser = await playwrightModule.chromium.launch({ headless: true });
  try {
    const context = await browser.newContext();
    const page = await context.newPage();
    const pageErrors = [];
    page.on('pageerror', (err) => pageErrors.push(err.message));

    for (const route of [
      '/',
      '/links',
      '/aviso-de-privacidad',
      '/reservar/rubber',
      '/cita/demo-token-sofia-1042',
    ]) {
      const res = await page.goto(`${BASE_URL}${route}`, { waitUntil: 'networkidle' });
      assert.equal(res?.status(), 200, `Ruta ${route} devolvió ${res?.status()}`);
      const h1Count = await page.locator('h1').count();
      assert.ok(h1Count >= 1, `Ruta ${route} debe tener al menos un <h1>`);
    }

    assert.deepEqual(pageErrors, [], `Errores JS en navegador: ${pageErrors.join('; ')}`);
  } finally {
    await browser.close();
  }
}

async function main() {
  const startedAt = Date.now();
  const steps = [
    ['1. Public routes, SEO & zero-PII/commission boundaries', testPublicRoutesAndSeo],
    [
      '2. LFPDPPP consent gate, happy-path booking ($200 SPEI), manage view & RFC 5545 ICS',
      async () => {
        const [slot] = await findFarFutureSlots(1);
        await testHappyPathConsentSpeiAndIcs(slot);
      },
    ],
    [
      '3. Concurrent double-booking race (1x201 + 1x409 SLOT_TAKEN recovery)',
      async () => {
        const [slot] = await findFarFutureSlots(1);
        await testConcurrentDoubleBookingRace(slot);
      },
    ],
    ['4. Admin RBAC, specialist isolation & ARCO JSON export', testAdminRbacAndSpecialistIsolation],
    ['5. Optional Playwright browser verification', testOptionalPlaywrightBrowser],
  ];

  for (const [label, fn] of steps) {
    await fn();
    console.log(`✔ ${label}`);
  }

  console.log(`\n[e2e] OK — ${steps.length} suites passed against ${BASE_URL} in ${Date.now() - startedAt}ms.`);
}

main().catch((err) => {
  console.error('\n[e2e] FAILED:', err);
  process.exit(1);
});
