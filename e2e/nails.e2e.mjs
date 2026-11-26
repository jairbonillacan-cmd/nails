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
      '  (modo producción fail-closed detectado: 401 en admin/ARCO y 503 en login demo verificados)',
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

  const ownerOverview = await fetchJson('/api/admin/overview', {
    headers: { Cookie: ownerCookie },
  });
  assert.equal(ownerOverview.status, 200);
  assert.ok(Array.isArray(ownerOverview.json?.uncollectedBookings));
  assert.ok(Array.isArray(ownerOverview.json?.nearRewardClients));
  assert.ok(Array.isArray(ownerOverview.json?.recentAuditLogs));
  assert.equal(
    JSON.stringify(ownerOverview.json).includes('ownerPinHash'),
    false,
    'Overview admin nunca debe exponer ownerPinHash',
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
  assert.ok(sw.text.includes('laikona-v1'), 'Service Worker debe declarar caché versionado laikona-v1');
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
      'Specialist jamás debe ver ocupación de otras manicuristas',
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
    ['6. PWA Service Worker (/sw.js) & compact embed mode (/reservar?embed=1)', testPwaServiceWorkerAndEmbedMode],
    ['7. Client portal /mis-citas OTP flow, isolation & logout', testClientPortalOtpFlow],
    ['8. Executive reports (/api/admin/reports) RBAC & specialist scoping', testAdminReportsRbac],
    ['9. Session packages & retention campaigns RBAC + seeded cohorts', testAdminPackagesAndCampaignsRbac],
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
