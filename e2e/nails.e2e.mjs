import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { pathToFileURL } from 'node:url';

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

async function fetchBinary(path, init) {
  const res = await fetch(`${BASE_URL}${path}`, init);
  const buffer = await res.arrayBuffer();
  return { status: res.status, headers: res.headers, byteLength: buffer.byteLength };
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

let cachedAdminAuth = null;

async function resolveAdminDemoAuth() {
  if (cachedAdminAuth) return cachedAdminAuth;

  const sessionProbe = await fetchJson('/api/admin/session');
  assert.equal(sessionProbe.status, 200);
  assert.equal(sessionProbe.json?.session, null);
  const availableDemoUsers = Array.isArray(sessionProbe.json?.availableDemoUsers)
    ? sessionProbe.json.availableDemoUsers
    : [];

  if (availableDemoUsers.length === 0) {
    cachedAdminAuth = {
      isDemoEnabled: false,
      specCookie: null,
      specStaffId: null,
      ownerCookie: null,
    };
    return cachedAdminAuth;
  }

  const specLogin = await fetchJson('/api/admin/session', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'camila@nails.studio' }),
  });
  assert.equal(specLogin.status, 200);
  const specCookie = extractCookieHeader(specLogin);
  assert.ok(specCookie, 'Sesión specialist debe emitir cookie');

  const ownerLogin = await fetchJson('/api/admin/session', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'duena@nails.studio' }),
  });
  assert.equal(ownerLogin.status, 200);
  const ownerCookie = extractCookieHeader(ownerLogin);
  assert.ok(ownerCookie, 'Sesión owner debe emitir cookie');

  cachedAdminAuth = {
    isDemoEnabled: true,
    specCookie,
    specStaffId: specLogin.json?.session?.user?.staffMemberId ?? null,
    ownerCookie,
  };
  return cachedAdminAuth;
}

async function testPublicRoutesAndSeo() {
  const landing = await fetchText('/');
  assert.equal(landing.status, 200);
  assert.ok(landing.text.includes('LAIKONA NAILS'), 'Landing debe renderizar LAIKONA NAILS');
  assert.ok(landing.text.includes('NailSalon'), 'Landing debe incluir JSON-LD NailSalon');
  assert.ok(landing.text.includes('BeautySalon'), 'Landing debe incluir JSON-LD BeautySalon');
  assert.ok(landing.text.includes('FAQPage'), 'Landing debe incluir JSON-LD FAQPage');
  assert.equal(
    landing.text.includes('commissionPercent'),
    false,
    'Landing no debe exponer commissionPercent',
  );

  const rootOg = await fetchBinary('/opengraph-image');
  assert.equal(
    rootOg.status,
    200,
    `GET /opengraph-image debe responder 200, recibido ${rootOg.status}`,
  );
  assert.ok(
    (rootOg.headers.get('content-type') || '').toLowerCase().includes('image/png'),
    `GET /opengraph-image debe devolver image/png, recibido: ${rootOg.headers.get('content-type')}`,
  );
  assert.ok(rootOg.byteLength > 0, 'GET /opengraph-image debe devolver contenido PNG');

  const serviceOg = await fetchBinary('/reservar/rubber/opengraph-image');
  assert.equal(
    serviceOg.status,
    200,
    `GET /reservar/rubber/opengraph-image debe responder 200, recibido ${serviceOg.status}`,
  );
  assert.ok(
    (serviceOg.headers.get('content-type') || '').toLowerCase().includes('image/png'),
    `GET /reservar/rubber/opengraph-image debe devolver image/png, recibido: ${serviceOg.headers.get('content-type')}`,
  );
  assert.ok(
    serviceOg.byteLength > 0,
    'GET /reservar/rubber/opengraph-image debe devolver contenido PNG',
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
  assert.equal(
    sitemap.text.includes('http://localhost:3000'),
    false,
    '/sitemap.xml nunca debe contener http://localhost:3000',
  );

  const robots = await fetchText('/robots.txt');
  assert.equal(robots.status, 200);
  assert.ok(robots.text.includes('/admin/'));
  assert.equal(
    robots.text.includes('http://localhost:3000'),
    false,
    '/robots.txt nunca debe contener http://localhost:3000',
  );

  const servicePage = await fetchText('/reservar/rubber');
  assert.equal(servicePage.status, 200);
  assert.ok(
    servicePage.text.includes('"@type":"Service"'),
    '/reservar/rubber debe incluir JSON-LD Service',
  );
  assert.ok(
    servicePage.text.includes('"@type":"BreadcrumbList"'),
    '/reservar/rubber debe incluir JSON-LD BreadcrumbList',
  );
  assert.equal(servicePage.text.includes('commissionPercent'), false);

  const managePage = await fetchText('/cita/demo-token-sofia-1042');
  assert.equal(managePage.status, 200);
  assert.ok(managePage.text.includes('Tarjeta de Sellos LAIKONA'));
  assert.ok(
    managePage.text.toLowerCase().includes('noindex'),
    '/cita/[token] debe incluir robots noindex',
  );
  assert.equal(managePage.text.includes('commissionPercent'), false);

  const misCitasSeo = await fetchText('/mis-citas');
  assert.equal(misCitasSeo.status, 200);
  assert.ok(
    misCitasSeo.text.toLowerCase().includes('noindex'),
    '/mis-citas debe incluir robots noindex',
  );

  const adminLoginSeo = await fetchText('/admin/login');
  assert.equal(adminLoginSeo.status, 200);
  assert.ok(
    adminLoginSeo.text.toLowerCase().includes('noindex'),
    '/admin/login debe incluir robots noindex',
  );

  const manageReschedule = await fetchText('/cita/demo-token-sofia-1042?action=reschedule');
  assert.equal(manageReschedule.status, 200);

  const seededManageApi = await fetchJson('/api/bookings/manage/demo-token-sofia-1042');
  assert.equal(seededManageApi.status, 200);
  assert.equal(
    seededManageApi.json?.booking?.client?.notes ?? '',
    '',
    'GET /api/bookings/manage/[token] (sembrada) debe devolver client.notes vacío (SEC-05)',
  );
  assert.equal(
    seededManageApi.json?.booking?.internalNotes ?? '',
    '',
    'GET /api/bookings/manage/[token] (sembrada) no debe exponer internalNotes privadas',
  );

  const bootstrap = await fetchJson('/api/public/bootstrap');
  assert.equal(bootstrap.status, 200);
  assert.equal(bootstrap.json?.settings?.name, 'LAIKONA NAILS');
  assert.equal(bootstrap.json?.settings?.depositAmountCents, 20000);
  assert.equal(bootstrap.json?.settings?.depositClabe, '7229 6901 3959 779869');
  const rawBootstrap = JSON.stringify(bootstrap.json);
  assert.equal(
    rawBootstrap.includes('commissionPercent'),
    false,
    'Public bootstrap no debe filtrar commissionPercent',
  );
  assert.equal(
    rawBootstrap.includes('ownerPinHash'),
    false,
    'Public bootstrap no debe filtrar ownerPinHash',
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
  const rawCreated = JSON.stringify(created.json);
  assert.equal(
    rawCreated.includes('commissionPercent'),
    false,
    'POST /api/bookings nunca debe exponer commissionPercent (SEC-01)',
  );
  assert.equal(
    rawCreated.includes('ownerPinHash'),
    false,
    'POST /api/bookings nunca debe exponer ownerPinHash (SEC-01)',
  );
  assert.equal(
    booking.internalNotes ?? '',
    '',
    'POST /api/bookings nunca debe exponer internalNotes privadas (SEC-01)',
  );
  assert.equal(
    booking.client?.notes ?? '',
    '',
    'POST /api/bookings nunca debe exponer client.notes privadas (SEC-01)',
  );

  try {
    const manageRes = await fetchJson(`/api/bookings/manage/${booking.manageToken}`);
    assert.equal(manageRes.status, 200);
    assert.equal(manageRes.json?.booking?.id, booking.id);
    assert.ok(manageRes.json?.loyaltySummary, 'Debe retornar loyaltySummary');
    const rawManage = JSON.stringify(manageRes.json);
    assert.equal(
      rawManage.includes('commissionPercent'),
      false,
      'GET /api/bookings/manage/[token] nunca debe exponer commissionPercent',
    );
    assert.equal(
      rawManage.includes('ownerPinHash'),
      false,
      'GET /api/bookings/manage/[token] nunca debe exponer ownerPinHash',
    );
    assert.equal(
      manageRes.json?.booking?.internalNotes ?? '',
      '',
      'GET /api/bookings/manage/[token] no debe exponer internalNotes privadas',
    );
    assert.equal(
      manageRes.json?.booking?.client?.notes ?? '',
      '',
      'GET /api/bookings/manage/[token] debe devolver client.notes vacío (SEC-05)',
    );

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

  const unauthTeam = await fetchJson('/api/admin/team', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      kind: 'staff',
      data: { name: 'Intento No Autorizado' },
    }),
  });
  assert.equal(
    unauthTeam.status,
    401,
    `POST /api/admin/team sin sesión debe responder 401 (SEC-02), recibido ${unauthTeam.status}`,
  );

  const adminAuth = await resolveAdminDemoAuth();

  if (!adminAuth.isDemoEnabled) {
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
      '  (modo producción fail-closed detectado: 401 en admin/ARCO/team y 503 en login demo verificados)',
    );
    return;
  }

  const { specCookie, ownerCookie } = adminAuth;

  const specOverview = await fetchJson('/api/admin/overview', {
    headers: { Cookie: specCookie },
  });
  assert.equal(specOverview.status, 200);
  assert.equal(specOverview.json?.session?.user?.role, 'specialist');
  assert.deepEqual(specOverview.json?.recentAuditLogs, []);
  const rawSpecOverview = JSON.stringify(specOverview.json);
  assert.equal(
    rawSpecOverview.includes('ownerPinHash'),
    false,
    'Overview specialist nunca debe exponer ownerPinHash (SEC-03)',
  );
  assert.equal(
    rawSpecOverview.includes('accessTokenEncrypted'),
    false,
    'Overview specialist nunca debe exponer accessTokenEncrypted (SEC-03)',
  );
  assert.equal(
    rawSpecOverview.includes('refreshTokenEncrypted'),
    false,
    'Overview specialist nunca debe exponer refreshTokenEncrypted (SEC-03)',
  );
  const specStaffId = specOverview.json?.session?.user?.staffMemberId;
  for (const bk of specOverview.json?.bookings ?? []) {
    assert.equal(
      bk.staffId,
      specStaffId,
      'Profesional no debe ver citas de otras profesionales',
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

  const ownerOverview = await fetchJson('/api/admin/overview', {
    headers: { Cookie: ownerCookie },
  });
  assert.equal(ownerOverview.status, 200);
  assert.ok(Array.isArray(ownerOverview.json?.uncollectedBookings));
  assert.ok(Array.isArray(ownerOverview.json?.nearRewardClients));
  assert.ok(Array.isArray(ownerOverview.json?.recentAuditLogs));
  const rawOwnerOverview = JSON.stringify(ownerOverview.json);
  assert.equal(
    rawOwnerOverview.includes('ownerPinHash'),
    false,
    'Overview admin nunca debe exponer ownerPinHash (SEC-03)',
  );
  assert.equal(
    rawOwnerOverview.includes('accessTokenEncrypted'),
    false,
    'Overview admin nunca debe exponer accessTokenEncrypted (SEC-03)',
  );
  assert.equal(
    rawOwnerOverview.includes('refreshTokenEncrypted'),
    false,
    'Overview admin nunca debe exponer refreshTokenEncrypted (SEC-03)',
  );

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

function toPueblaDateKey(iso) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Mexico_City',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date(iso));
}

async function fetchAvailabilityDays(serviceId = 'srv-rubber', days = 28, offsetDays = 3) {
  const startDate = getDateKeyOffsetDays(offsetDays);
  const res = await fetchJson(
    `/api/availability?serviceId=${encodeURIComponent(serviceId)}&startDate=${encodeURIComponent(startDate)}&days=${days}`,
  );
  assert.equal(res.status, 200, `availability range falló: ${res.status} ${res.text}`);
  return Array.isArray(res.json?.days) ? res.json.days : [];
}

async function findAvailabilityCandidate(predicate, options = {}) {
  const days = await fetchAvailabilityDays(
    options.serviceId ?? 'srv-rubber',
    options.days ?? 28,
    options.offsetDays ?? 3,
  );
  const minMs = Date.now() + 36 * 3_600_000;
  for (const day of days) {
    if (!Array.isArray(day?.slots)) continue;
    for (const slot of day.slots) {
      const startMs = new Date(slot.startAt).getTime();
      if (Number.isNaN(startMs) || startMs < minMs) continue;
      if (predicate(slot, day)) {
        return { date: day.date, slot };
      }
    }
  }
  return null;
}

async function loadPlaywrightModule() {
  const customPath = process.env.PLAYWRIGHT_MODULE_PATH?.trim();
  if (customPath) {
    return import(pathToFileURL(customPath).href);
  }
  const browserPkg = 'playwright';
  return import(browserPkg);
}

async function createDemoWaitlistOfferForSlot(slot, adminAuth) {
  const suffix = crypto.randomInt(1000, 9999);
  const dateKey = toPueblaDateKey(slot.startAt);
  const holderPhone = `+52222940${suffix}`;
  const waitlistPhone = `+52222941${suffix}`;

  const created = await fetchJson('/api/bookings', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Idempotency-Key': `e2e-wlo-orig-${crypto.randomUUID()}`,
    },
    body: JSON.stringify({
      serviceId: 'srv-rubber',
      addonIds: [],
      staffId: slot.staffId,
      startAt: slot.startAt,
      clientName: 'Clienta Titular Oferta E2E',
      clientPhone: holderPhone,
      privacyConsentAccepted: true,
    }),
  });
  assert.equal(created.status, 201, `Reserva titular oferta falló: ${created.status} ${created.text}`);
  const manageToken = created.json?.booking?.manageToken;
  assert.ok(manageToken, 'Reserva titular debe devolver manageToken');

  const wlRes = await fetchJson('/api/waitlist', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      serviceId: 'srv-rubber',
      preferredStaffId: slot.staffId,
      desiredDate: dateKey,
      preferredWindow: 'any',
      clientName: 'Clienta Oferta E2E',
      clientPhoneE164: waitlistPhone,
    }),
  });
  assert.equal(wlRes.status, 201, `Lista de espera oferta falló: ${wlRes.status} ${wlRes.text}`);

  const cancelRes = await fetchJson(`/api/bookings/manage/${manageToken}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'cancel', reason: 'Liberación para prueba oferta E2E' }),
  });
  assert.equal(cancelRes.status, 200, `Cancelación titular oferta falló: ${cancelRes.status} ${cancelRes.text}`);

  let offerEntry = null;
  if (adminAuth.isDemoEnabled && adminAuth.ownerCookie) {
    const overview = await fetchJson('/api/admin/overview', {
      headers: { Cookie: adminAuth.ownerCookie },
    });
    assert.equal(overview.status, 200);
    const entries = Array.isArray(overview.json?.waitlist) ? overview.json.waitlist : [];
    offerEntry =
      entries.find(
        (entry) =>
          entry.clientPhoneE164 === waitlistPhone &&
          entry.status === 'notified' &&
          typeof entry.priorityOfferToken === 'string' &&
          entry.priorityOfferToken.length >= 6,
      ) ?? null;
  }

  return {
    dateKey,
    waitlistPhone,
    offerEntry,
    offerToken: offerEntry?.priorityOfferToken ?? null,
    cleanupOffer: async () => {
      if (offerEntry?.id && adminAuth.isDemoEnabled && adminAuth.ownerCookie) {
        await fetchJson('/api/admin/operations', {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
            Cookie: adminAuth.ownerCookie,
          },
          body: JSON.stringify({
            kind: 'waitlist',
            id: offerEntry.id,
            status: 'expired',
          }),
        });
      }
    },
  };
}

async function releaseBrowserSlotHold(page) {
  await page
    .evaluate(async () => {
      await fetch('/api/slot-holds', { method: 'DELETE' });
    })
    .catch(() => {});
}

async function enterScheduleStep(page) {
  const scheduleHeading = page.getByRole('heading', { name: 'Fecha y hora' });
  if (await scheduleHeading.isVisible()) {
    return;
  }
  const continueBtn = page.getByRole('button', { name: 'Continuar' }).first();
  await continueBtn.waitFor({ state: 'visible', timeout: 10_000 });
  await continueBtn.click();
  await scheduleHeading.waitFor({ state: 'visible', timeout: 15_000 });
}

async function runWave2BrowserBookingAssertions(browser) {
  const adminAuth = await resolveAdminDemoAuth();

  {
    const candidate = await findAvailabilityCandidate(() => true);
    assert.ok(candidate, 'Se esperaba un horario futuro disponible para prueba A1 (429)');
    const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    const page = await context.newPage();
    const pageErrors = [];
    page.on('pageerror', (err) => pageErrors.push(err.message));

    let holdAttempts = 0;
    await page.route('**/api/slot-holds', async (route) => {
      if (route.request().method() === 'POST' && holdAttempts === 0) {
        holdAttempts += 1;
        await route.fulfill({
          status: 429,
          contentType: 'application/json',
          headers: { 'Retry-After': '15' },
          body: JSON.stringify({
            code: 'RATE_LIMITED',
            error: 'Demasiados intentos seguidos',
          }),
        });
        return;
      }
      if (route.request().method() === 'POST') {
        holdAttempts += 1;
      }
      await route.continue();
    });

    try {
      await page.goto(`${BASE_URL}/reservar/rubber?date=${encodeURIComponent(candidate.date)}`, {
        waitUntil: 'networkidle',
      });
      await enterScheduleStep(page);
      const firstSlotBtn = page.locator('button.rb-time:not([disabled])').first();
      await firstSlotBtn.waitFor({ state: 'visible', timeout: 15_000 });
      await firstSlotBtn.click();

      const retryBtn = page.getByRole('button', { name: 'Reintentar' });
      await retryBtn.waitFor({ state: 'visible', timeout: 10_000 });
      await page
        .locator('[role="alert"]', { hasText: 'Demasiados intentos seguidos' })
        .first()
        .waitFor({ state: 'visible', timeout: 10_000 });
      const pasoOn429 = new URL(page.url()).searchParams.get('paso');
      assert.notEqual(pasoOn429, 'profesional', 'A1: 429 no debe avanzar a Profesional');
      assert.notEqual(pasoOn429, 'datos', 'A1: 429 no debe avanzar a Tus datos');
      assert.ok(
        await page.getByRole('heading', { name: 'Fecha y hora' }).isVisible(),
        'A1: 429 debe mantenerse en el paso Fecha y hora',
      );

      await retryBtn.click();
      await page.waitForFunction(
        () => {
          const paso = new URL(window.location.href).searchParams.get('paso');
          return paso === 'profesional' || paso === 'datos';
        },
        null,
        { timeout: 15_000 },
      );
      assert.ok(holdAttempts >= 2, 'A1: Reintentar debe emitir un segundo POST /api/slot-holds');
      assert.deepEqual(pageErrors, [], `Errores JS en A1: ${pageErrors.join('; ')}`);
    } finally {
      await releaseBrowserSlotHold(page);
      await context.close();
    }
  }

  {
    let singleCandidate = await findAvailabilityCandidate(
      (slot) => Array.isArray(slot.availableStaffIds) && slot.availableStaffIds.length === 1,
    );
    let needsSingleStaffRouteShim = false;
    if (!singleCandidate) {
      singleCandidate = await findAvailabilityCandidate(() => true);
      needsSingleStaffRouteShim = true;
    }
    assert.ok(singleCandidate, 'Se esperaba un horario futuro disponible para prueba B1/B2/A3');

    const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    const page = await context.newPage();
    const pageErrors = [];
    page.on('pageerror', (err) => pageErrors.push(err.message));

    if (needsSingleStaffRouteShim) {
      const targetStartAt = singleCandidate.slot.startAt;
      await page.route('**/api/availability**', async (route) => {
        const res = await route.fetch();
        const json = await res.json();
        if (Array.isArray(json?.days)) {
          for (const day of json.days) {
            if (!Array.isArray(day.slots)) continue;
            for (const item of day.slots) {
              if (item.startAt === targetStartAt) {
                item.availableStaffIds = [item.staffId];
              }
            }
          }
        }
        await route.fulfill({ response: res, json });
      });
    }

    try {
      await page.goto(`${BASE_URL}/`, { waitUntil: 'networkidle' });
      await page.goto(
        `${BASE_URL}/reservar/rubber?date=${encodeURIComponent(singleCandidate.date)}`,
        { waitUntil: 'networkidle' },
      );
      await enterScheduleStep(page);
      const slotBtn = page
        .locator('button.rb-time:not([disabled])', {
          hasText: singleCandidate.slot.localTime12,
        })
        .first();
      await slotBtn.waitFor({ state: 'visible', timeout: 15_000 });
      await slotBtn.click();

      await page.waitForFunction(
        () => new URL(window.location.href).searchParams.get('paso') === 'datos',
        null,
        { timeout: 15_000 },
      );
      const summaryText = await page.locator('.rb-summary').first().innerText();
      assert.ok(
        summaryText.includes('Te atiende '),
        `B1: Resumen debe mostrar "Te atiende <Nombre>", recibido: ${summaryText}`,
      );

      await page.goBack();
      await page.waitForFunction(
        () => {
          const parsed = new URL(window.location.href);
          const paso = parsed.searchParams.get('paso');
          return (
            parsed.pathname.startsWith('/reservar') &&
            paso !== 'datos' &&
            paso !== 'profesional'
          );
        },
        null,
        { timeout: 10_000 },
      );
      assert.ok(
        new URL(page.url()).pathname.startsWith('/reservar'),
        `A3: goBack() debe permanecer dentro de /reservar, URL actual: ${page.url()}`,
      );
      await page.getByRole('heading', { name: 'Fecha y hora' }).waitFor({
        state: 'visible',
        timeout: 10_000,
      });
      assert.deepEqual(pageErrors, [], `Errores JS en B1/B2/A3: ${pageErrors.join('; ')}`);
    } finally {
      await releaseBrowserSlotHold(page);
      await context.close();
    }
  }

  {
    const multiCandidate = await findAvailabilityCandidate(
      (slot) => Array.isArray(slot.availableStaffIds) && slot.availableStaffIds.length > 1,
    );
    if (multiCandidate) {
      const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
      const page = await context.newPage();
      const pageErrors = [];
      page.on('pageerror', (err) => pageErrors.push(err.message));

      try {
        await page.goto(`${BASE_URL}/`, { waitUntil: 'networkidle' });
        await page.goto(
          `${BASE_URL}/reservar/rubber?date=${encodeURIComponent(multiCandidate.date)}`,
          { waitUntil: 'networkidle' },
        );
        await enterScheduleStep(page);
        const slotBtn = page
          .locator('button.rb-time:not([disabled])', {
            hasText: multiCandidate.slot.localTime12,
          })
          .first();
        await slotBtn.waitFor({ state: 'visible', timeout: 15_000 });
        await slotBtn.click();

        await page.waitForFunction(
          () => new URL(window.location.href).searchParams.get('paso') === 'profesional',
          null,
          { timeout: 15_000 },
        );

        await page.goBack();
        await page.waitForFunction(
          () => {
            const parsed = new URL(window.location.href);
            return (
              parsed.pathname.startsWith('/reservar') &&
              parsed.searchParams.get('paso') !== 'profesional'
            );
          },
          null,
          { timeout: 10_000 },
        );
        await page.getByRole('heading', { name: 'Fecha y hora' }).waitFor({
          state: 'visible',
          timeout: 10_000,
        });
        assert.deepEqual(
          pageErrors,
          [],
          `Errores JS en A3 multi-profesional: ${pageErrors.join('; ')}`,
        );
      } finally {
        await releaseBrowserSlotHold(page);
        await context.close();
      }
    }
  }

  {
    const candidate = await findAvailabilityCandidate(() => true, { offsetDays: 14 });
    assert.ok(candidate, 'Se esperaba un horario futuro disponible para prueba A2 (?slot=&offer=)');

    let offerHandle = null;
    if (adminAuth.isDemoEnabled && adminAuth.ownerCookie) {
      offerHandle = await createDemoWaitlistOfferForSlot(candidate.slot, adminAuth);
    }

    const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    const page = await context.newPage();
    const pageErrors = [];
    page.on('pageerror', (err) => pageErrors.push(err.message));
    const observedHoldBodies = [];
    page.on('request', (req) => {
      if (req.url().includes('/api/slot-holds') && req.method() === 'POST') {
        try {
          observedHoldBodies.push(JSON.parse(req.postData() || '{}'));
        } catch {
          observedHoldBodies.push({});
        }
      }
    });

    try {
      const qs = new URLSearchParams({
        date: candidate.date,
        slot: candidate.slot.startAt,
      });
      if (offerHandle?.offerToken) {
        qs.set('offer', offerHandle.offerToken);
      }
      await page.goto(`${BASE_URL}/reservar/rubber?${qs.toString()}`, {
        waitUntil: 'networkidle',
      });

      await page.waitForFunction(
        () => {
          const paso = new URL(window.location.href).searchParams.get('paso');
          return paso === 'profesional' || paso === 'datos';
        },
        null,
        { timeout: 15_000 },
      );

      assert.ok(
        observedHoldBodies.length >= 1,
        'A2: Debe emitir POST /api/slot-holds automáticamente al abrir ?slot=',
      );
      assert.equal(
        observedHoldBodies.some((body) => 'sessionToken' in body),
        false,
        'C4: POST /api/slot-holds no debe enviar sessionToken en el body',
      );
      if (offerHandle?.offerToken) {
        assert.ok(
          observedHoldBodies.some(
            (body) => body.waitlistOfferToken === offerHandle.offerToken,
          ),
          'A2: POST /api/slot-holds debe reenviar waitlistOfferToken desde ?offer=',
        );
      }

      const bodyText = await page.locator('main').innerText();
      assert.ok(
        bodyText.includes('Te guardamos el horario') || bodyText.includes('Horario apartado'),
        'A2: Enlace con ?slot= (y ?offer=) debe adquirir apartado automático al aterrizar',
      );
      assert.deepEqual(pageErrors, [], `Errores JS en A2: ${pageErrors.join('; ')}`);
    } finally {
      await releaseBrowserSlotHold(page);
      await context.close();
      if (offerHandle) {
        await offerHandle.cleanupOffer();
      }
    }
  }

  {
    const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    const page = await context.newPage();
    const pageErrors = [];
    page.on('pageerror', (err) => pageErrors.push(err.message));

    try {
      await page.goto(`${BASE_URL}/reservar`, { waitUntil: 'networkidle' });
      assert.equal(
        new URL(page.url()).searchParams.get('servicio'),
        null,
        `B7: /reservar sin parámetros no debe escribir ?servicio= automáticamente, URL: ${page.url()}`,
      );
      const summaryText = await page.locator('.rb-summary').first().innerText();
      assert.ok(
        summaryText.includes('Elige un servicio'),
        `B7: Resumen inicial debe mostrar "Elige un servicio", recibido: ${summaryText}`,
      );
      const continueBtn = page.getByRole('button', { name: 'Continuar' }).first();
      assert.equal(
        await continueBtn.isDisabled(),
        true,
        'B7: Continuar debe permanecer deshabilitado hasta elegir un servicio',
      );

      const rubberBtn = page
        .locator('button[aria-pressed="false"]', { hasText: /Rubber/i })
        .first();
      await rubberBtn.waitFor({ state: 'visible', timeout: 10_000 });
      await rubberBtn.click();

      await page.waitForFunction(
        () => new URL(window.location.href).searchParams.get('servicio') === 'rubber',
        null,
        { timeout: 10_000 },
      );
      assert.equal(
        await continueBtn.isDisabled(),
        false,
        'B7: Continuar debe habilitarse tras elegir servicio',
      );
      assert.deepEqual(pageErrors, [], `Errores JS en B7: ${pageErrors.join('; ')}`);
    } finally {
      await context.close();
    }
  }

  {
    const context = await browser.newContext({ viewport: { width: 375, height: 812 } });
    const page = await context.newPage();
    const pageErrors = [];
    page.on('pageerror', (err) => pageErrors.push(err.message));

    try {
      await page.goto(`${BASE_URL}/reservar/rubber`, { waitUntil: 'networkidle' });
      await enterScheduleStep(page);

      const firstSlot = page.locator('button.rb-time:not([disabled])').first();
      await firstSlot.waitFor({ state: 'visible', timeout: 15_000 });

      const metrics = await page.evaluate(() => {
        const slotEl = document.querySelector('button.rb-time:not([disabled])');
        const stickyEl = document.querySelector('.rb-bottom, .rb-bar');
        const slotRect = slotEl ? slotEl.getBoundingClientRect() : null;
        const stickyRect = stickyEl ? stickyEl.getBoundingClientRect() : null;
        return {
          scrollY: window.scrollY,
          slotTop: slotRect ? slotRect.top : null,
          slotBottom: slotRect ? slotRect.bottom : null,
          stickyTop: stickyRect ? stickyRect.top : null,
        };
      });
      assert.ok(
        metrics.slotTop !== null &&
          metrics.slotBottom !== null &&
          metrics.stickyTop !== null,
        `B3: No se encontraron el primer horario o la barra fija a 375x812: ${JSON.stringify(metrics)}`,
      );
      assert.equal(metrics.scrollY, 0, `B3: scrollY esperado 0, recibido ${metrics.scrollY}`);
      assert.ok(
        metrics.slotBottom <= metrics.stickyTop,
        `B3: Primer horario a 375x812 debe quedar arriba de BookingStickyBar sin scroll (slotBottom=${metrics.slotBottom}, stickyTop=${metrics.stickyTop})`,
      );

      const viewMonthBtn = page.getByRole('button', { name: /Ver mes/i }).first();
      await viewMonthBtn.waitFor({ state: 'visible', timeout: 10_000 });
      await viewMonthBtn.click();

      const viewWeekBtn = page.getByRole('button', { name: /Ver semana/i }).first();
      await viewWeekBtn.waitFor({ state: 'visible', timeout: 10_000 });
      await page.waitForFunction(
        () => new URL(window.location.href).searchParams.get('layout') === 'month',
        null,
        { timeout: 10_000 },
      );

      await viewWeekBtn.click();
      await viewMonthBtn.waitFor({ state: 'visible', timeout: 10_000 });
      assert.deepEqual(pageErrors, [], `Errores JS en B3/C2 móvil: ${pageErrors.join('; ')}`);
    } finally {
      await context.close();
    }
  }

  {
    const candidate = await findAvailabilityCandidate(() => true, { offsetDays: 16 });
    assert.ok(candidate, 'Se esperaba un horario futuro disponible para prueba B4 (4 pasos)');
    const suffix = crypto.randomInt(1000, 9999);

    const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    const page = await context.newPage();
    const pageErrors = [];
    page.on('pageerror', (err) => pageErrors.push(err.message));
    const bookingBodies = [];
    page.on('request', (req) => {
      if (req.url().endsWith('/api/bookings') && req.method() === 'POST') {
        try {
          bookingBodies.push(JSON.parse(req.postData() || '{}'));
        } catch {
          bookingBodies.push({});
        }
      }
    });

    let createdManageToken = null;
    try {
      await page.goto(
        `${BASE_URL}/reservar/rubber?date=${encodeURIComponent(candidate.date)}`,
        { waitUntil: 'networkidle' },
      );
      await enterScheduleStep(page);

      const slotBtn = page
        .locator('button.rb-time:not([disabled])', {
          hasText: candidate.slot.localTime12,
        })
        .first();
      await slotBtn.waitFor({ state: 'visible', timeout: 15_000 });
      await slotBtn.click();

      await page.waitForFunction(
        () => {
          const paso = new URL(window.location.href).searchParams.get('paso');
          return paso === 'profesional' || paso === 'datos';
        },
        null,
        { timeout: 15_000 },
      );

      if (new URL(page.url()).searchParams.get('paso') === 'profesional') {
        const nextBtn = page.getByRole('button', { name: 'Continuar' }).first();
        await nextBtn.waitFor({ state: 'visible', timeout: 10_000 });
        await nextBtn.click();
        await page.waitForFunction(
          () => new URL(window.location.href).searchParams.get('paso') === 'datos',
          null,
          { timeout: 10_000 },
        );
      }

      await page
        .getByText('¿Ya viniste? Llena tus datos con WhatsApp')
        .first()
        .waitFor({ state: 'visible', timeout: 10_000 });

      await page.locator('input[name="clientName"]').fill('Clienta Cuatro Pasos');
      await page.locator('input[name="clientPhone"]').fill(`222950${suffix}`);
      await page.locator('input[name="privacyConsentAccepted"]').check({ force: true });

      const submitBtn = page
        .getByRole('button', { name: /Apartar mi cita|Confirmar cita/i })
        .first();
      await submitBtn.waitFor({ state: 'visible', timeout: 10_000 });
      await submitBtn.click();

      await page.waitForFunction(
        () => window.location.pathname.startsWith('/cita/'),
        null,
        { timeout: 20_000 },
      );
      createdManageToken = new URL(page.url()).pathname.replace(/^\/cita\//, '').trim();
      assert.ok(createdManageToken.length > 4, 'B4: Debe redirigir a /cita/<token> válido');

      assert.ok(
        bookingBodies.length >= 1,
        'B4: Debe enviar POST /api/bookings desde Tus datos',
      );
      const sentBody = bookingBodies[bookingBodies.length - 1];
      assert.equal(
        sentBody.proofDeliveryMethod,
        'none',
        `B4: proofDeliveryMethod debe ser "none", recibido: ${sentBody.proofDeliveryMethod}`,
      );
      assert.equal(
        'sessionToken' in sentBody,
        false,
        'C4: POST /api/bookings no debe enviar sessionToken en el body',
      );

      await page.locator('main').waitFor({ state: 'visible', timeout: 10_000 });
      const citaText = await page.locator('main').innerText();
      assert.ok(
        citaText.includes('CLABE') || citaText.includes('Anticipo') || citaText.includes('cita'),
        'B4: /cita/<token> debe mostrar seguimiento e instrucciones de anticipo',
      );
      assert.deepEqual(pageErrors, [], `Errores JS en B4/B6: ${pageErrors.join('; ')}`);
    } finally {
      if (createdManageToken) {
        await fetchJson(`/api/bookings/manage/${encodeURIComponent(createdManageToken)}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: 'cancel',
            reason: 'Limpieza automática E2E 4 pasos B4',
          }),
        }).catch(() => {});
      } else {
        await releaseBrowserSlotHold(page);
      }
      await context.close();
    }
  }
}

async function testOptionalPlaywrightBrowser() {
  if (!RUN_BROWSER) return;
  let playwrightModule = null;
  try {
    playwrightModule = await loadPlaywrightModule();
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
      '/reservar?embed=1',
      '/mis-citas',
      '/cita/demo-token-sofia-1042',
    ]) {
      const res = await page.goto(`${BASE_URL}${route}`, { waitUntil: 'networkidle' });
      assert.equal(res?.status(), 200, `Ruta ${route} devolvió ${res?.status()}`);
      const h1Count = await page.locator('h1').count();
      assert.ok(h1Count >= 1, `Ruta ${route} debe tener al menos un <h1>`);
    }

    assert.deepEqual(pageErrors, [], `Errores JS en navegador: ${pageErrors.join('; ')}`);
    await context.close();

    await runWave2BrowserBookingAssertions(browser);
  } finally {
    await browser.close();
  }
}

async function testPwaServiceWorkerAndEmbedMode() {
  const sw = await fetchText('/sw.js');
  assert.equal(sw.status, 200, `GET /sw.js debe responder 200, recibido ${sw.status}`);
  const swType = (sw.headers.get('content-type') || '').toLowerCase();
  assert.ok(
    swType.includes('application/javascript'),
    `GET /sw.js debe servir application/javascript, recibido: ${swType}`,
  );
  const swCache = (sw.headers.get('cache-control') || '').toLowerCase();
  assert.ok(
    swCache.includes('no-cache'),
    `GET /sw.js debe incluir no-cache en Cache-Control, recibido: ${swCache}`,
  );
  assert.match(sw.text, /laikona-v\d+/, 'Service Worker debe declarar caché versionado laikona-vN');
  assert.ok(sw.text.includes('/admin'), 'Service Worker debe excluir rutas /admin del caché');

  const embedPage = await fetchText('/reservar?embed=1');
  assert.equal(embedPage.status, 200, `GET /reservar?embed=1 debe responder 200, recibido ${embedPage.status}`);
  assert.ok(embedPage.text.includes('rb-embed'), '/reservar?embed=1 debe activar el modo compacto rb-embed');
  const embedCsp = embedPage.headers.get('content-security-policy') || '';
  assert.ok(
    embedCsp.includes('frame-ancestors *'),
    `GET /reservar?embed=1 debe permitir frame-ancestors *, recibido: ${embedCsp}`,
  );
  assert.equal(
    embedPage.headers.get('x-frame-options'),
    null,
    'GET /reservar?embed=1 no debe enviar X-Frame-Options bloqueante',
  );
  assert.equal(embedPage.text.includes('commissionPercent'), false);
  assert.equal(embedPage.text.includes('ownerPinHash'), false);

  const regularBookingPage = await fetchText('/reservar');
  assert.equal(regularBookingPage.status, 200);
  assert.equal(
    regularBookingPage.headers.get('x-frame-options'),
    'DENY',
    'GET /reservar sin embed=1 debe mantener X-Frame-Options: DENY',
  );
  assert.ok(
    (regularBookingPage.headers.get('content-security-policy') || '').includes("frame-ancestors 'none'"),
    'GET /reservar sin embed=1 debe mantener frame-ancestors none',
  );

  const portalPage = await fetchText('/mis-citas');
  assert.equal(portalPage.status, 200, `GET /mis-citas debe responder 200, recibido ${portalPage.status}`);
  assert.ok(portalPage.text.includes('Mis citas'), '/mis-citas debe renderizar encabezado Mis citas');
  assert.equal(portalPage.text.includes('commissionPercent'), false);
  assert.equal(portalPage.text.includes('ownerPinHash'), false);
}

async function testClientPortalOtpFlow() {
  const unauthBookings = await fetchJson('/api/client-portal/bookings');
  assert.equal(
    unauthBookings.status,
    401,
    `GET /api/client-portal/bookings sin sesión debe responder 401, recibido ${unauthBookings.status}`,
  );
  assert.equal(unauthBookings.json?.authenticated, false);

  const otpRequest = await fetchJson('/api/client-portal/otp', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'request', phone: '2224123987' }),
  });

  if (otpRequest.status === 503) {
    assert.equal(
      otpRequest.json?.code,
      'PORTAL_UNCONFIGURED',
      `En producción sin secreto de firma, OTP request debe devolver PORTAL_UNCONFIGURED, recibido: ${otpRequest.text}`,
    );
    assert.equal(otpRequest.json?.demoCode, undefined, 'Nunca debe exponer demoCode en 503');
    const logoutRes = await fetchJson('/api/client-portal/otp', { method: 'DELETE' });
    assert.equal(logoutRes.status, 200);
    assert.equal(logoutRes.json?.authenticated, false);
    console.log(
      '  (modo producción fail-closed detectado: 401 en /api/client-portal/bookings y 503 PORTAL_UNCONFIGURED en OTP verificados)',
    );
    return;
  }

  assert.equal(
    otpRequest.status,
    200,
    `POST /api/client-portal/otp (request) falló: ${otpRequest.status} ${otpRequest.text}`,
  );
  assert.equal(otpRequest.json?.ok, true);
  assert.equal(otpRequest.json?.phoneE164, '+522224123987');

  const demoCode = otpRequest.json?.demoCode;
  if (typeof demoCode !== 'string') {
    assert.equal(demoCode, undefined, 'En producción no se debe filtrar demoCode');
    const invalidVerify = await fetchJson('/api/client-portal/otp', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'verify',
        phone: '2224123987',
        code: '000000',
      }),
    });
    assert.equal(invalidVerify.status, 401);
    const logoutRes = await fetchJson('/api/client-portal/otp', { method: 'DELETE' });
    assert.equal(logoutRes.status, 200);
    console.log(
      '  (entorno productivo con secreto detectado: OTP sin demoCode, 401 en código inválido y logout verificados)',
    );
    return;
  }

  assert.match(demoCode, /^\d{6}$/, `demoCode debe tener 6 dígitos, recibido: ${demoCode}`);

  const otpVerify = await fetchJson('/api/client-portal/otp', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      action: 'verify',
      phone: '2224123987',
      code: demoCode,
    }),
  });
  assert.equal(
    otpVerify.status,
    200,
    `POST /api/client-portal/otp (verify) falló: ${otpVerify.status} ${otpVerify.text}`,
  );
  assert.equal(otpVerify.json?.ok, true);
  assert.equal(otpVerify.json?.authenticated, true);
  const portalCookie = extractCookieHeader(otpVerify);
  assert.ok(
    portalCookie.includes('nails_client_portal='),
    `Verify OTP debe emitir cookie nails_client_portal, recibido: ${portalCookie}`,
  );

  const portalBookings = await fetchJson('/api/client-portal/bookings', {
    headers: { Cookie: portalCookie },
  });
  assert.equal(
    portalBookings.status,
    200,
    `GET /api/client-portal/bookings autenticado falló: ${portalBookings.status} ${portalBookings.text}`,
  );
  assert.equal(portalBookings.json?.authenticated, true);
  assert.equal(portalBookings.json?.phoneE164, '+522224123987');
  const bookings = Array.isArray(portalBookings.json?.bookings)
    ? portalBookings.json.bookings
    : [];
  assert.ok(bookings.length >= 1, 'Sofía debe ver al menos 1 cita propia en /mis-citas');
  assert.ok(
    bookings.some((b) => b.bookingCode === 'NL-1042'),
    'Sofía debe ver su cita sembrada NL-1042',
  );
  assert.equal(
    bookings.some((b) => b.bookingCode === 'NL-1044' || b.bookingCode === 'NL-1039'),
    false,
    'Portal de Sofía jamás debe exponer citas de otras clientas (Andrea/Paula)',
  );
  assert.ok(
    (portalBookings.json?.loyaltySummary?.currentStamps ?? 0) >= 6,
    'Portal debe devolver resumen de sellos de Sofía',
  );
  assert.ok(
    Array.isArray(portalBookings.json?.packages),
    'Portal debe incluir arreglo de paquetes de sesiones',
  );
  const rawPortal = JSON.stringify(portalBookings.json);
  assert.equal(
    rawPortal.includes('internalNotes'),
    false,
    'Portal de clienta nunca debe exponer internalNotes',
  );
  assert.equal(
    rawPortal.includes('commissionPercent'),
    false,
    'Portal de clienta nunca debe exponer commissionPercent',
  );
  assert.equal(
    rawPortal.includes('ownerPinHash'),
    false,
    'Portal de clienta nunca debe exponer ownerPinHash',
  );

  const logoutRes = await fetchJson('/api/client-portal/otp', {
    method: 'DELETE',
    headers: { Cookie: portalCookie },
  });
  assert.equal(logoutRes.status, 200);
  assert.equal(logoutRes.json?.authenticated, false);
  const clearedCookie = extractCookieHeader(logoutRes);
  const setCookieHeader = logoutRes.headers.get('set-cookie') || '';
  assert.ok(
    setCookieHeader.includes('Max-Age=0') || clearedCookie === 'nails_client_portal=',
    `Logout debe limpiar la cookie nails_client_portal, recibido: ${setCookieHeader}`,
  );

  const afterLogout = await fetchJson('/api/client-portal/bookings', {
    headers: clearedCookie ? { Cookie: clearedCookie } : undefined,
  });
  assert.equal(
    afterLogout.status,
    401,
    'Después de cerrar sesión, GET /api/client-portal/bookings debe responder 401',
  );
}

async function testAdminReportsRbac() {
  const unauthReports = await fetchJson('/api/admin/reports');
  assert.equal(
    unauthReports.status,
    401,
    `GET /api/admin/reports sin sesión debe responder 401, recibido ${unauthReports.status}`,
  );

  const adminAuth = await resolveAdminDemoAuth();
  if (!adminAuth.isDemoEnabled) {
    console.log(
      '  (modo producción fail-closed detectado: 401 en /api/admin/reports verificado)',
    );
    return;
  }

  const { specCookie, specStaffId, ownerCookie } = adminAuth;

  const invalidPeriod = await fetchJson('/api/admin/reports?period=invalid', {
    headers: { Cookie: ownerCookie },
  });
  assert.equal(invalidPeriod.status, 400);

  const specReports = await fetchJson('/api/admin/reports?period=all', {
    headers: { Cookie: specCookie },
  });
  assert.equal(
    specReports.status,
    200,
    `GET /api/admin/reports (specialist) falló: ${specReports.status} ${specReports.text}`,
  );
  assert.equal(specReports.json?.scope, 'specialist');
  assert.equal(specReports.json?.scopeStaffId, specStaffId);
  const specRows = Array.isArray(specReports.json?.specialistOccupancy)
    ? specReports.json.specialistOccupancy
    : [];
  assert.ok(specRows.length <= 1, 'Specialist solo debe ver su propia fila de ocupación');
  for (const row of specRows) {
    assert.equal(
      row.staffId,
      specStaffId,
      'Specialist jamás debe ver ocupación de otras profesionales',
    );
  }
  assert.equal(specReports.json?.heatmap?.days?.length, 7);
  assert.equal(specReports.json?.heatmap?.hours?.length, 12);
  assert.equal(JSON.stringify(specReports.json).includes('ownerPinHash'), false);

  const ownerReports = await fetchJson('/api/admin/reports?period=all', {
    headers: { Cookie: ownerCookie },
  });
  assert.equal(
    ownerReports.status,
    200,
    `GET /api/admin/reports (owner) falló: ${ownerReports.status} ${ownerReports.text}`,
  );
  assert.equal(ownerReports.json?.scope, 'studio');
  assert.equal(ownerReports.json?.scopeStaffId, null);
  assert.ok(
    Array.isArray(ownerReports.json?.specialistOccupancy) &&
      ownerReports.json.specialistOccupancy.length >= 2,
    'Owner debe ver ocupación completa del equipo del estudio',
  );
  assert.equal(ownerReports.json?.heatmap?.days?.length, 7);
  assert.equal(ownerReports.json?.heatmap?.hours?.length, 12);
  assert.ok(
    Array.isArray(ownerReports.json?.serviceProfitability) &&
      ownerReports.json.serviceProfitability.length >= 1,
    'Owner debe recibir ranking de rentabilidad $/min por servicio',
  );
  assert.equal(typeof ownerReports.json?.summary?.totalRevenueCollectedCents, 'number');
  assert.ok(Array.isArray(ownerReports.json?.cancellationReasons));
}

async function testAdminPackagesAndCampaignsRbac() {
  const unauthPackages = await fetchJson('/api/admin/packages');
  assert.equal(
    unauthPackages.status,
    401,
    `GET /api/admin/packages sin sesión debe responder 401, recibido ${unauthPackages.status}`,
  );

  const unauthCampaigns = await fetchJson('/api/admin/campaigns');
  assert.equal(
    unauthCampaigns.status,
    401,
    `GET /api/admin/campaigns sin sesión debe responder 401, recibido ${unauthCampaigns.status}`,
  );

  const adminAuth = await resolveAdminDemoAuth();
  if (!adminAuth.isDemoEnabled) {
    console.log(
      '  (modo producción fail-closed detectado: 401 en /api/admin/packages y /api/admin/campaigns verificados)',
    );
    return;
  }

  const { specCookie, ownerCookie } = adminAuth;

  const specPackagesRead = await fetchJson('/api/admin/packages', {
    headers: { Cookie: specCookie },
  });
  assert.equal(specPackagesRead.status, 200);

  const specPackagesWrite = await fetchJson('/api/admin/packages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Cookie: specCookie,
    },
    body: JSON.stringify({
      kind: 'catalog',
      name: 'Paquete No Autorizado',
      serviceId: 'srv-rubber',
      totalSessions: 4,
      priceCents: 100000,
      validDays: 90,
    }),
  });
  assert.equal(specPackagesWrite.status, 403);

  const specCampaigns = await fetchJson('/api/admin/campaigns', {
    headers: { Cookie: specCookie },
  });
  assert.equal(specCampaigns.status, 403);

  const ownerPackages = await fetchJson('/api/admin/packages', {
    headers: { Cookie: ownerCookie },
  });
  assert.equal(
    ownerPackages.status,
    200,
    `GET /api/admin/packages (owner) falló: ${ownerPackages.status} ${ownerPackages.text}`,
  );
  const servicePackages = Array.isArray(ownerPackages.json?.servicePackages)
    ? ownerPackages.json.servicePackages
    : [];
  const clientPackages = Array.isArray(ownerPackages.json?.clientPackages)
    ? ownerPackages.json.clientPackages
    : [];
  assert.ok(
    servicePackages.length >= 2,
    'Se esperaban al menos 2 paquetes sembrados en catálogo (borra .nails-demo-db.json si proviene de una versión previa)',
  );
  assert.ok(
    clientPackages.some((cp) => cp.id === 'cpkg-sofia-1' && cp.totalSessions === 4),
    'Se esperaba el paquete activo sembrado cpkg-sofia-1 para Sofía Ramírez',
  );

  const ownerCampaigns = await fetchJson(
    '/api/admin/campaigns?birthdayWindowDays=7&inactiveDays=45',
    {
      headers: { Cookie: ownerCookie },
    },
  );
  assert.equal(
    ownerCampaigns.status,
    200,
    `GET /api/admin/campaigns (owner) falló: ${ownerCampaigns.status} ${ownerCampaigns.text}`,
  );
  assert.equal(ownerCampaigns.json?.birthdayWindowDays, 7);
  assert.equal(ownerCampaigns.json?.inactiveDays, 45);
  assert.ok(
    Array.isArray(ownerCampaigns.json?.birthdays) &&
      ownerCampaigns.json.birthdays.some((b) => b.clientId === 'client-sofia'),
    'Cohorte de cumpleaños próximos (7d) debe incluir a Sofía Ramírez',
  );
  assert.ok(
    Array.isArray(ownerCampaigns.json?.reactivation) &&
      ownerCampaigns.json.reactivation.some((r) => r.clientId === 'client-valeria'),
    'Cohorte de reactivación (45+ días) debe incluir a Valeria Mendoza',
  );
  assert.ok(Array.isArray(ownerCampaigns.json?.recentDispatches));
}

async function testPhase3EndToEndFlows(slots) {
  const [slotA, slotB] = slots;
  const suffix = crypto.randomInt(1000, 9999);
  const phone = `+52222930${suffix}`;
  const waitlistPhone = `+52222931${suffix}`;
  const adminAuth = await resolveAdminDemoAuth();

  const funnelRes = await fetchJson('/api/analytics/events', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      sessionId: `e2e-fnl-${crypto.randomUUID()}`,
      eventType: 'page_view',
      serviceSlug: null,
      staffSlug: null,
    }),
  });
  assert.equal(funnelRes.status, 202, `POST /api/analytics/events falló: ${funnelRes.status}`);

  const created = await fetchJson('/api/bookings', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Idempotency-Key': `e2e-p3-${crypto.randomUUID()}`,
    },
    body: JSON.stringify({
      serviceId: 'srv-rubber',
      addonIds: [],
      staffId: slotA.staffId,
      startAt: slotA.startAt,
      clientName: 'Clienta Fase Tres',
      clientPhone: phone,
      privacyConsentAccepted: true,
    }),
  });
  assert.equal(created.status, 201, `Crear cita Fase 3 falló: ${created.status} ${created.text}`);
  const bookingId = created.json?.booking?.id;
  const manageToken = created.json?.booking?.manageToken;
  assert.ok(bookingId && manageToken, 'Cita Fase 3 debe devolver id y manageToken');

  try {
    const rescheduled = await fetchJson(`/api/bookings/manage/${manageToken}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'reschedule',
        newStaffId: slotB.staffId,
        newStartAt: slotB.startAt,
      }),
    });
    assert.equal(rescheduled.status, 200, `Reagendar falló: ${rescheduled.status} ${rescheduled.text}`);
    assert.equal(rescheduled.json?.booking?.attendanceStatus, 'rescheduled');

    const proofLink = 'https://www.mercadopago.com.mx/activities/e2e-recibo-01';
    const proofRes = await fetchJson(`/api/bookings/manage/${manageToken}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'upload_proof',
        paymentProofUrl: proofLink,
      }),
    });
    assert.equal(proofRes.status, 200, `Subir enlace comprobante falló: ${proofRes.status} ${proofRes.text}`);
    assert.equal(proofRes.json?.booking?.proofDeliveryMethod, 'web_link');
    assert.equal(proofRes.json?.booking?.paymentProofUrl, proofLink);

    if (adminAuth.isDemoEnabled && adminAuth.ownerCookie) {
      const rejectRes = await fetchJson('/api/admin/bookings', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Cookie: adminAuth.ownerCookie,
        },
        body: JSON.stringify({
          action: 'reject_deposit',
          bookingId,
          reason: 'Prueba E2E rechazo',
        }),
      });
      assert.equal(rejectRes.status, 200, `Rechazar anticipo falló: ${rejectRes.status} ${rejectRes.text}`);

      const afterReject = await fetchJson(`/api/bookings/manage/${manageToken}`);
      assert.equal(afterReject.status, 200);
      assert.equal(afterReject.json?.booking?.paymentProofUrl, null);
      assert.equal(afterReject.json?.booking?.proofRejectionReason, 'Prueba E2E rechazo');

      const reupload = await fetchJson(`/api/bookings/manage/${manageToken}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'upload_proof',
          paymentProofUrl: 'https://www.banxico.org.mx/cep/e2e-recibo-02',
        }),
      });
      assert.equal(reupload.status, 200);

      const approveRes = await fetchJson('/api/admin/bookings', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Cookie: adminAuth.ownerCookie,
        },
        body: JSON.stringify({
          bookingId,
          status: 'confirmed',
        }),
      });
      assert.equal(approveRes.status, 200, `Aprobar anticipo falló: ${approveRes.status}`);
    }

    const attendRes = await fetchJson(`/api/bookings/manage/${manageToken}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'confirm_attendance' }),
    });
    assert.equal(attendRes.status, 200, `Confirmar asistencia falló: ${attendRes.status}`);
    assert.equal(attendRes.json?.booking?.attendanceStatus, 'confirmed');

    const slotBDate = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'America/Mexico_City',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(new Date(slotB.startAt));
    const wlRes = await fetchJson('/api/waitlist', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        serviceId: 'srv-rubber',
        preferredStaffId: slotB.staffId,
        desiredDate: slotBDate,
        preferredWindow: 'any',
        clientName: 'Clienta Espera E2E',
        clientPhoneE164: waitlistPhone,
      }),
    });
    assert.equal(wlRes.status, 201, `Registro lista de espera falló: ${wlRes.status}`);
  } finally {
    const cancelRes = await fetchJson(`/api/bookings/manage/${manageToken}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'cancel',
        reason: 'Limpieza automática Fase 3 E2E',
      }),
    });
    assert.equal(
      cancelRes.status,
      200,
      `Cancelación Fase 3 falló: ${cancelRes.status} ${cancelRes.text}`,
    );
  }
}

async function testWave2WaitlistOfferAndHoldApi(slots) {
  const [holdSlot, offerSlot] = slots;
  const holdDateKey = toPueblaDateKey(holdSlot.startAt);

  const deepLinkRes = await fetchText(
    `/reservar/rubber?date=${encodeURIComponent(holdDateKey)}&slot=${encodeURIComponent(holdSlot.startAt)}&paso=horario`,
  );
  assert.equal(
    deepLinkRes.status,
    200,
    `SSR /reservar/rubber deep-link falló: ${deepLinkRes.status}`,
  );
  assert.equal(deepLinkRes.text.includes('commissionPercent'), false);
  assert.equal(deepLinkRes.text.includes('ownerPinHash'), false);

  const adminAuth = await resolveAdminDemoAuth();

  const directHold = await fetchJson('/api/slot-holds', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      serviceId: 'srv-rubber',
      addonIds: [],
      staffId: holdSlot.staffId,
      startAt: holdSlot.startAt,
    }),
  });
  const isProdFailClosedWithoutHoldSecret =
    !adminAuth.isDemoEnabled && directHold.status === 500;

  if (!isProdFailClosedWithoutHoldSecret) {
    assert.equal(
      directHold.status,
      200,
      `C4: POST /api/slot-holds sin sessionToken en body debe responder 200, recibido ${directHold.status}: ${directHold.text}`,
    );
    const holdSetCookie = directHold.headers.get('set-cookie') || '';
    assert.ok(
      holdSetCookie.includes('nails_client_session=') && holdSetCookie.includes('HttpOnly'),
      'C4: POST /api/slot-holds debe emitir cookie HttpOnly nails_client_session',
    );
    const holdCookie = extractCookieHeader(directHold);
    const releaseRes = await fetchJson('/api/slot-holds', {
      method: 'DELETE',
      headers: { Cookie: holdCookie },
    });
    assert.equal(releaseRes.status, 200);
  }

  const offerHandle = await createDemoWaitlistOfferForSlot(offerSlot, adminAuth);

  try {
    const baseQuery = `serviceId=srv-rubber&staffId=${encodeURIComponent(offerSlot.staffId)}&startDate=${encodeURIComponent(offerHandle.dateKey)}&days=1`;
    const publicAvail = await fetchJson(`/api/availability?${baseQuery}`);
    assert.equal(publicAvail.status, 200);
    const publicSlots = publicAvail.json?.days?.[0]?.slots ?? [];
    assert.equal(
      publicSlots.some((item) => item.startAt === offerSlot.startAt),
      false,
      'A2: Horario con oferta prioritaria activa no debe exponerse sin ?offer=',
    );

    if (isProdFailClosedWithoutHoldSecret) {
      console.log(
        '  (modo producción fail-closed sin CLIENT_SESSION_SECRET detectado: 500 en /api/slot-holds y ocultamiento A2 en /api/availability verificados)',
      );
      return;
    }

    const blockedHold = await fetchJson('/api/slot-holds', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        serviceId: 'srv-rubber',
        addonIds: [],
        staffId: offerSlot.staffId,
        startAt: offerSlot.startAt,
      }),
    });
    assert.equal(
      blockedHold.status,
      409,
      `A2: POST /api/slot-holds sin waitlistOfferToken debe responder 409, recibido ${blockedHold.status}`,
    );

    if (offerHandle.offerToken) {
      const offerAvail = await fetchJson(
        `/api/availability?${baseQuery}&offer=${encodeURIComponent(offerHandle.offerToken)}`,
      );
      assert.equal(offerAvail.status, 200);
      const offerSlots = offerAvail.json?.days?.[0]?.slots ?? [];
      assert.equal(
        offerSlots.some((item) => item.startAt === offerSlot.startAt),
        true,
        'A2: GET /api/availability?offer=<token> debe exponer el horario a la dueña de la oferta',
      );

      const offerHold = await fetchJson('/api/slot-holds', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          serviceId: 'srv-rubber',
          addonIds: [],
          staffId: offerSlot.staffId,
          startAt: offerSlot.startAt,
          waitlistOfferToken: offerHandle.offerToken,
        }),
      });
      assert.equal(
        offerHold.status,
        200,
        `A2: POST /api/slot-holds con waitlistOfferToken falló: ${offerHold.status} ${offerHold.text}`,
      );
      const offerCookie = extractCookieHeader(offerHold);
      const claimRes = await fetchJson('/api/bookings', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Cookie: offerCookie,
          'Idempotency-Key': `e2e-wlo-claim-${crypto.randomUUID()}`,
        },
        body: JSON.stringify({
          serviceId: 'srv-rubber',
          addonIds: [],
          staffId: offerSlot.staffId,
          startAt: offerSlot.startAt,
          clientName: 'Clienta Oferta E2E',
          clientPhone: offerHandle.waitlistPhone,
          holdId: offerHold.json?.holdId,
          waitlistOfferToken: offerHandle.offerToken,
          privacyConsentAccepted: true,
        }),
      });
      assert.equal(
        claimRes.status,
        201,
        `A2+C4: Reclamo de oferta solo con cookie HttpOnly falló: ${claimRes.status} ${claimRes.text}`,
      );
      const claimedToken = claimRes.json?.booking?.manageToken;
      if (claimedToken) {
        const cancelClaimed = await fetchJson(`/api/bookings/manage/${claimedToken}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: 'cancel',
            reason: 'Limpieza automática reclamo oferta E2E',
          }),
        });
        assert.equal(cancelClaimed.status, 200);
      }
    }
  } finally {
    await offerHandle.cleanupOffer();
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
    ['5. Optional Playwright browser verification (routes + Wave 2/3 A1/A2/A3/B1/B2/B3/B4/B6/B7/C2)', testOptionalPlaywrightBrowser],
    ['6. PWA Service Worker (/sw.js) & compact embed mode (/reservar?embed=1)', testPwaServiceWorkerAndEmbedMode],
    ['7. Client portal /mis-citas OTP flow, isolation & logout', testClientPortalOtpFlow],
    ['8. Executive reports (/api/admin/reports) RBAC & specialist scoping', testAdminReportsRbac],
    ['9. Session packages & retention campaigns RBAC + seeded cohorts', testAdminPackagesAndCampaignsRbac],
    [
      '10. Phase 3 lifecycle: reschedule, proof link, reject/approve deposit, attendance confirm, waitlist & funnel',
      async () => {
        const slots = await findFarFutureSlots(2);
        await testPhase3EndToEndFlows(slots);
      },
    ],
    [
      '11. Booking Wave 1/2 API & SSR contracts: cookie-only holds (C4), waitlist offer exclusivity (A2) & deep-link SSR',
      async () => {
        const holdCandidate = await findAvailabilityCandidate(() => true, {
          offsetDays: 8,
        });
        const offerCandidate = await findAvailabilityCandidate(
          (slot) => slot.startAt !== holdCandidate?.slot?.startAt,
          { offsetDays: 10 },
        );
        assert.ok(
          holdCandidate && offerCandidate,
          'Se esperaban 2 horarios futuros distintos para la suite Wave 1/2',
        );
        await testWave2WaitlistOfferAndHoldApi([
          holdCandidate.slot,
          offerCandidate.slot,
        ]);
      },
    ],
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
