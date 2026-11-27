import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { NextRequest } from 'next/server';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { ADMIN_SESSION_COOKIE, createAdminSessionToken } from '@/lib/auth/admin-session';
import { isSafeExternalProofUrl } from '@/lib/contracts';
import { getDateKeyInTimezone } from '@/lib/format';
import {
  getSnapshot,
  processExpiredWaitlistOffers,
  processProactiveTouchUpInvites,
  queryAvailability,
} from '@/lib/repositories/db';
import { resetRateLimiterForTests } from '@/lib/security/rate-limit';
import { PATCH as patchAdminBookings } from '@/app/api/admin/bookings/route';
import { GET as getAdminReports } from '@/app/api/admin/reports/route';
import { POST as postAnalyticsEvent } from '@/app/api/analytics/events/route';
import { POST as postPublicBooking } from '@/app/api/bookings/route';
import {
  GET as getManageBooking,
  PATCH as patchManageBooking,
} from '@/app/api/bookings/manage/[token]/route';
import { GET as getManageBookingIcs } from '@/app/api/bookings/manage/[token]/ics/route';
import { GET as getPublicBootstrap } from '@/app/api/public/bootstrap/route';
import { POST as postWaitlist } from '@/app/api/waitlist/route';
import { POST as postGoogleCalendarWebhook } from '@/app/api/webhooks/google-calendar/route';
import { POST as postWhatsAppWebhook } from '@/app/api/webhooks/whatsapp/route';

const TEMP_DB_PATH = path.join(
  os.tmpdir(),
  `nails-phase3-test-${process.pid}-${crypto.randomUUID()}.json`,
);

let originalDbPathEnv: string | undefined;

function makeRequest(
  url: string,
  init?: {
    method?: string;
    headers?: Record<string, string>;
    body?: string;
  },
): NextRequest {
  return new NextRequest(url, {
    method: init?.method ?? 'GET',
    headers: init?.headers,
    body: init?.body,
  });
}

function getCookieForRole(role: 'owner' | 'specialist'): string {
  const user = getSnapshot().adminUsers.find((u) => u.role === role && u.isActive);
  if (!user) throw new Error(`Missing seed ${role}`);
  const token = createAdminSessionToken(user);
  if (!token) throw new Error(`Expected signed ${role} token`);
  return `${ADMIN_SESSION_COOKIE}=${token}`;
}

function resetIsolatedDb(): void {
  globalThis.nailsDbCache = undefined;
  globalThis.nailsDbCachePath = undefined;
  if (fs.existsSync(TEMP_DB_PATH)) {
    fs.unlinkSync(TEMP_DB_PATH);
  }
}

function getOpenSlot(serviceId = 'srv-rubber', staffId = 'staff-karla') {
  const db = getSnapshot();
  const startDate = getDateKeyInTimezone(
    new Date(Date.now() + 3 * 86_400_000),
    db.settings.timezone,
  );
  const avail = queryAvailability({
    serviceId,
    addonIds: [],
    staffId,
    startDate,
    days: 21,
  });
  const slot = avail.days.flatMap((d) => d.slots)[0];
  if (!slot) throw new Error('Expected at least one future available slot');
  return slot;
}

beforeAll(() => {
  originalDbPathEnv = process.env.NAILS_DEMO_DB_PATH;
  process.env.NAILS_DEMO_DB_PATH = TEMP_DB_PATH;
  resetIsolatedDb();
});

beforeEach(() => {
  resetRateLimiterForTests();
  resetIsolatedDb();
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  resetRateLimiterForTests();
  resetIsolatedDb();
});

afterAll(() => {
  vi.unstubAllEnvs();
  resetIsolatedDb();
  if (originalDbPathEnv === undefined) {
    delete process.env.NAILS_DEMO_DB_PATH;
  } else {
    process.env.NAILS_DEMO_DB_PATH = originalDbPathEnv;
  }
});

describe('Phase 3: Attendance confirmation, deposit proof links & rejection, waitlist rollover, touch-up & funnel', () => {
  it('validates external proof URLs strictly against unsafe schemes, untrusted domains, trackers, and private hosts', () => {
    expect(isSafeExternalProofUrl('https://www.banxico.org.mx/cep/recibo/9911')).toBe(true);
    expect(isSafeExternalProofUrl('https://www.mercadopago.com.mx/activities/abc123')).toBe(true);
    expect(isSafeExternalProofUrl('https://drive.google.com/file/d/abc123/view')).toBe(true);
    expect(isSafeExternalProofUrl('https://evil.example/receipt.png')).toBe(false);
    expect(isSafeExternalProofUrl('https://www.mercadopago.com.mx/pixel.png')).toBe(false);
    expect(isSafeExternalProofUrl('http://www.banxico.org.mx/cep/recibo/9911')).toBe(false);
    expect(isSafeExternalProofUrl('https://localhost/recibo')).toBe(false);
    expect(isSafeExternalProofUrl('https://127.0.0.1/recibo')).toBe(false);
    expect(isSafeExternalProofUrl('https://10.0.0.5/recibo')).toBe(false);
    expect(isSafeExternalProofUrl('https://192.168.1.2/recibo')).toBe(false);
    expect(isSafeExternalProofUrl('https://169.254.169.254/latest/meta-data')).toBe(false);
    expect(isSafeExternalProofUrl('javascript:alert(1)')).toBe(false);
  });

  it('supports 1-click attendance confirmation via manage API and WhatsApp interactive button reply', async () => {
    const confirmRes = await patchManageBooking(
      makeRequest('http://localhost:3000/api/bookings/manage/demo-token-sofia-1042', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ action: 'confirm_attendance' }),
      }),
      { params: Promise.resolve({ token: 'demo-token-sofia-1042' }) },
    );
    expect(confirmRes.status).toBe(200);
    const confirmJson = (await confirmRes.json()) as {
      booking: { attendanceStatus: string; attendanceConfirmedAt: string | null };
    };
    expect(confirmJson.booking.attendanceStatus).toBe('confirmed');
    expect(confirmJson.booking.attendanceConfirmedAt).toBeTruthy();

    vi.stubEnv('WHATSAPP_APP_SECRET', 'meta-wa-phase3-secret');
    const waPayload = JSON.stringify({
      entry: [
        {
          changes: [
            {
              value: {
                messages: [
                  {
                    id: 'wamid.phase3.btn.001',
                    from: '522223987441',
                    type: 'interactive',
                    interactive: {
                      type: 'button_reply',
                      button_reply: {
                        id: 'confirm_booking:bk-1002',
                        title: 'Confirmo',
                      },
                    },
                  },
                ],
              },
            },
          ],
        },
      ],
    });
    const sig = `sha256=${crypto
      .createHmac('sha256', 'meta-wa-phase3-secret')
      .update(waPayload, 'utf8')
      .digest('hex')}`;

    const waRes = await postWhatsAppWebhook(
      makeRequest('http://localhost:3000/api/webhooks/whatsapp', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-hub-signature-256': sig,
        },
        body: waPayload,
      }),
    );
    expect(waRes.status).toBe(200);
    const bk1002 = getSnapshot().bookings.find((b) => b.id === 'bk-1002');
    expect(bk1002?.attendanceStatus).toBe('confirmed');
    expect(bk1002?.attendanceConfirmedAt).toBeTruthy();

    const waReplay = await postWhatsAppWebhook(
      makeRequest('http://localhost:3000/api/webhooks/whatsapp', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-hub-signature-256': sig,
        },
        body: waPayload,
      }),
    );
    expect(waReplay.status).toBe(200);
  });

  it('accepts HTTPS proof links, rejects unsafe URLs, and supports 1-click admin deposit rejection with RBAC', async () => {
    vi.stubEnv('ADMIN_SESSION_SECRET', 'phase3-admin-secret');
    const slot = getOpenSlot('srv-rubber', 'staff-karla');

    const createdRes = await postPublicBooking(
      makeRequest('http://localhost:3000/api/bookings', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'Idempotency-Key': `p3-proof-${crypto.randomUUID()}`,
        },
        body: JSON.stringify({
          serviceId: 'srv-rubber',
          staffId: slot.staffId,
          startAt: slot.startAt,
          clientName: 'Lucía Morales',
          clientPhone: '+522227770011',
          privacyConsentAccepted: true,
        }),
      }),
    );
    expect(createdRes.status).toBe(201);
    const createdJson = (await createdRes.json()) as {
      booking: { id: string; manageToken: string };
    };
    const { id: bookingId, manageToken } = createdJson.booking;

    const unsafeRes = await patchManageBooking(
      makeRequest(`http://localhost:3000/api/bookings/manage/${manageToken}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          action: 'upload_proof',
          paymentProofUrl: 'https://127.0.0.1/internal',
        }),
      }),
      { params: Promise.resolve({ token: manageToken }) },
    );
    expect(unsafeRes.status).toBe(400);

    const safeLink = 'https://www.mercadopago.com.mx/activities/comprobante-9988';
    const uploadRes = await patchManageBooking(
      makeRequest(`http://localhost:3000/api/bookings/manage/${manageToken}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          action: 'upload_proof',
          paymentProofUrl: safeLink,
        }),
      }),
      { params: Promise.resolve({ token: manageToken }) },
    );
    expect(uploadRes.status).toBe(200);
    const uploadedBooking = (
      (await uploadRes.json()) as {
        booking: { paymentProofUrl: string | null; proofDeliveryMethod: string };
      }
    ).booking;
    expect(uploadedBooking.paymentProofUrl).toBe(safeLink);
    expect(uploadedBooking.proofDeliveryMethod).toBe('web_link');

    const specialistCookie = getCookieForRole('specialist');
    const idorRejectRes = await patchAdminBookings(
      makeRequest('http://localhost:3000/api/admin/bookings', {
        method: 'PATCH',
        headers: {
          'content-type': 'application/json',
          cookie: specialistCookie,
        },
        body: JSON.stringify({
          action: 'reject_deposit',
          bookingId,
          reason: 'No debería poder rechazar cita ajena',
        }),
      }),
    );
    expect(idorRejectRes.status).toBe(403);

    const ownerCookie = getCookieForRole('owner');
    const rejectRes = await patchAdminBookings(
      makeRequest('http://localhost:3000/api/admin/bookings', {
        method: 'PATCH',
        headers: {
          'content-type': 'application/json',
          cookie: ownerCookie,
        },
        body: JSON.stringify({
          action: 'reject_deposit',
          bookingId,
          reason: 'Imagen borrosa, no se lee el folio',
        }),
      }),
    );
    expect(rejectRes.status).toBe(200);
    const afterReject = getSnapshot();
    const rejectedBooking = afterReject.bookings.find((b) => b.id === bookingId);
    expect(rejectedBooking?.paymentProofUrl).toBeNull();
    expect(rejectedBooking?.proofDeliveryMethod).toBe('none');
    expect(rejectedBooking?.proofRejectedAt).toBeTruthy();
    expect(rejectedBooking?.proofRejectionReason).toBe('Imagen borrosa, no se lee el folio');
    expect(
      (afterReject.auditLogs ?? []).some(
        (log) => log.action === 'deposit_rejected' && log.entityId === bookingId,
      ),
    ).toBe(true);

    const manageAfterReject = await getManageBooking(
      makeRequest(`http://localhost:3000/api/bookings/manage/${manageToken}`),
      { params: Promise.resolve({ token: manageToken }) },
    );
    expect(manageAfterReject.status).toBe(200);
    const manageJson = (await manageAfterReject.json()) as {
      booking: { proofRejectionReason: string | null };
    };
    expect(manageJson.booking.proofRejectionReason).toBe('Imagen borrosa, no se lee el folio');
  });

  it('triggers a 30-min waitlist offer on cancellation, rolls over expired offers, and consumes offer tokens on booking', async () => {
    const slot = getOpenSlot('srv-rubber', 'staff-karla');
    const preferredDate = getDateKeyInTimezone(
      new Date(slot.startAt),
      getSnapshot().settings.timezone,
    );

    const createdRes = await postPublicBooking(
      makeRequest('http://localhost:3000/api/bookings', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'Idempotency-Key': `p3-wl-holder-${crypto.randomUUID()}`,
        },
        body: JSON.stringify({
          serviceId: 'srv-rubber',
          staffId: slot.staffId,
          startAt: slot.startAt,
          clientName: 'Clienta Original',
          clientPhone: '+522227770021',
          privacyConsentAccepted: true,
        }),
      }),
    );
    expect(createdRes.status).toBe(201);
    const holderToken = (
      (await createdRes.json()) as { booking: { manageToken: string } }
    ).booking.manageToken;

    for (const candidate of [
      { name: 'Espera Primera', phone: '+522227770022' },
      { name: 'Espera Segunda', phone: '+522227770023' },
    ]) {
      const wlRes = await postWaitlist(
        makeRequest('http://localhost:3000/api/waitlist', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            serviceId: 'srv-rubber',
            preferredStaffId: slot.staffId,
            desiredDate: preferredDate,
            preferredWindow: 'any',
            clientName: candidate.name,
            clientPhoneE164: candidate.phone,
          }),
        }),
      );
      expect(wlRes.status).toBe(201);
    }

    const cancelRes = await patchManageBooking(
      makeRequest(`http://localhost:3000/api/bookings/manage/${holderToken}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ action: 'cancel', reason: 'No podré asistir' }),
      }),
      { params: Promise.resolve({ token: holderToken }) },
    );
    expect(cancelRes.status).toBe(200);

    const dbAfterCancel = getSnapshot();
    const firstOffer = dbAfterCancel.waitlist.find((w) => w.clientName === 'Espera Primera');
    expect(firstOffer?.status).toBe('notified');
    expect(firstOffer?.priorityOfferToken).toBeTruthy();
    expect(firstOffer?.priorityOfferExpiresAt).toBeTruthy();

    const offerDurationMs =
      Date.parse(firstOffer!.priorityOfferExpiresAt!) - Date.parse(firstOffer!.notifiedAt!);
    expect(offerDurationMs).toBeGreaterThanOrEqual(29 * 60_000);
    expect(offerDurationMs).toBeLessThanOrEqual(31 * 60_000);

    const rollover = await processExpiredWaitlistOffers(
      Date.parse(firstOffer!.priorityOfferExpiresAt!) + 60_000,
    );
    expect(rollover.expiredCount).toBeGreaterThanOrEqual(1);
    expect(rollover.rolledOverCount).toBeGreaterThanOrEqual(1);

    const dbAfterRollover = getSnapshot();
    const firstExpired = dbAfterRollover.waitlist.find((w) => w.clientName === 'Espera Primera');
    const secondOffered = dbAfterRollover.waitlist.find((w) => w.clientName === 'Espera Segunda');
    expect(firstExpired?.status).toBe('expired');
    expect(secondOffered?.status).toBe('notified');
    expect(secondOffered?.priorityOfferToken).toBeTruthy();

    const claimRes = await postPublicBooking(
      makeRequest('http://localhost:3000/api/bookings', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'Idempotency-Key': `p3-wl-claim-${crypto.randomUUID()}`,
        },
        body: JSON.stringify({
          serviceId: 'srv-rubber',
          staffId: slot.staffId,
          startAt: slot.startAt,
          clientName: 'Espera Segunda',
          clientPhone: '+522227770023',
          privacyConsentAccepted: true,
          waitlistOfferToken: secondOffered!.priorityOfferToken,
        }),
      }),
    );
    expect(claimRes.status).toBe(201);
    const secondBooked = getSnapshot().waitlist.find((w) => w.clientName === 'Espera Segunda');
    expect(secondBooked?.status).toBe('booked');
  });

  it('sends proactive 18-day touch-up invites once and skips clients with newer bookings', async () => {
    const db = getSnapshot();
    const nowMs = Date.now();
    const nineteenDaysAgoIso = new Date(nowMs - 19 * 86_400_000).toISOString();
    const nineteenDaysAgoEndIso = new Date(nowMs - 19 * 86_400_000 + 7_200_000).toISOString();

    const eligibleClientId = 'cli-touchup-eligible';
    const recentClientId = 'cli-touchup-already-booked';
    db.clients.push(
      {
        id: eligibleClientId,
        fullName: 'Clienta Retoque',
        phoneE164: '+522227770031',
        email: 'retoque@ejemplo.mx',
        birthday: null,
        notes: '',
        noShowCount: 0,
        createdAt: nineteenDaysAgoIso,
        updatedAt: nineteenDaysAgoIso,
      },
      {
        id: recentClientId,
        fullName: 'Clienta Ya Agendó',
        phoneE164: '+522227770032',
        email: 'yaagendo@ejemplo.mx',
        birthday: null,
        notes: '',
        noShowCount: 0,
        createdAt: nineteenDaysAgoIso,
        updatedAt: nineteenDaysAgoIso,
      },
    );

    const baseBooking = db.bookings[0]!;
    db.bookings.push(
      {
        ...baseBooking,
        id: 'bk-touchup-eligible',
        bookingCode: 'NL-9101',
        manageToken: 'tok-touchup-eligible',
        clientId: eligibleClientId,
        status: 'completed',
        startAt: nineteenDaysAgoIso,
        endAt: nineteenDaysAgoEndIso,
        occupiedStartAt: nineteenDaysAgoIso,
        occupiedEndAt: nineteenDaysAgoEndIso,
        touchupInvitedAt: null,
      },
      {
        ...baseBooking,
        id: 'bk-touchup-skipped-old',
        bookingCode: 'NL-9102',
        manageToken: 'tok-touchup-skipped-old',
        clientId: recentClientId,
        status: 'completed',
        startAt: nineteenDaysAgoIso,
        endAt: nineteenDaysAgoEndIso,
        occupiedStartAt: nineteenDaysAgoIso,
        occupiedEndAt: nineteenDaysAgoEndIso,
        touchupInvitedAt: null,
      },
      {
        ...baseBooking,
        id: 'bk-touchup-skipped-new',
        bookingCode: 'NL-9103',
        manageToken: 'tok-touchup-skipped-new',
        clientId: recentClientId,
        status: 'confirmed',
        startAt: new Date(nowMs + 2 * 86_400_000).toISOString(),
        endAt: new Date(nowMs + 2 * 86_400_000 + 7_200_000).toISOString(),
        occupiedStartAt: new Date(nowMs + 2 * 86_400_000).toISOString(),
        occupiedEndAt: new Date(nowMs + 2 * 86_400_000 + 7_200_000).toISOString(),
        touchupInvitedAt: null,
      },
    );

    const firstPass = await processProactiveTouchUpInvites(nowMs);
    expect(firstPass.sentCount).toBeGreaterThanOrEqual(1);
    const updatedEligible = getSnapshot().bookings.find((b) => b.id === 'bk-touchup-eligible');
    const updatedSkipped = getSnapshot().bookings.find((b) => b.id === 'bk-touchup-skipped-old');
    expect(updatedEligible?.touchupInvitedAt).toBeTruthy();
    expect(updatedSkipped?.touchupInvitedAt ?? null).toBeNull();

    const secondPass = await processProactiveTouchUpInvites(nowMs + 60_000);
    expect(secondPass.sentCount).toBe(0);
  });

  it('records privacy-safe funnel events, scopes funnel reports by RBAC, deduplicates Google Calendar webhooks, and enforces public rate limits', async () => {
    vi.stubEnv('ADMIN_SESSION_SECRET', 'phase3-funnel-secret');
    const sessionId = `fnl-${crypto.randomUUID()}`;

    const badEvent = await postAnalyticsEvent(
      makeRequest('http://localhost:3000/api/analytics/events', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ sessionId: 'short', eventType: 'invalid_event' }),
      }),
    );
    expect(badEvent.status).toBe(400);

    for (const eventType of ['page_view', 'booking_started', 'slot_held', 'booking_confirmed']) {
      const evRes = await postAnalyticsEvent(
        makeRequest('http://localhost:3000/api/analytics/events', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            sessionId,
            eventType,
            serviceSlug: 'rubber',
          }),
        }),
      );
      expect(evRes.status).toBe(202);
    }

    const ownerReportRes = await getAdminReports(
      makeRequest('http://localhost:3000/api/admin/reports?period=7d', {
        headers: { cookie: getCookieForRole('owner') },
      }),
    );
    expect(ownerReportRes.status).toBe(200);
    const ownerReport = (await ownerReportRes.json()) as {
      funnel: { totalSessions: number; confirmedSessions: number; overallConversionPercent: number };
    };
    expect(ownerReport.funnel.totalSessions).toBeGreaterThanOrEqual(1);
    expect(ownerReport.funnel.confirmedSessions).toBeGreaterThanOrEqual(1);
    expect(ownerReport.funnel.overallConversionPercent).toBeGreaterThan(0);

    const specReportRes = await getAdminReports(
      makeRequest('http://localhost:3000/api/admin/reports?period=7d', {
        headers: { cookie: getCookieForRole('specialist') },
      }),
    );
    expect(specReportRes.status).toBe(200);
    const specReport = (await specReportRes.json()) as {
      funnel: { totalSessions: number };
    };
    expect(specReport.funnel.totalSessions).toBe(0);

    vi.stubEnv('GOOGLE_WEBHOOK_TOKEN', 'gcal-idempotent-secret');
    const gcalHeaders = {
      'x-goog-channel-id': 'chan-dedup-1',
      'x-goog-channel-token': 'gcal-idempotent-secret',
      'x-goog-message-number': '42',
      'x-goog-resource-state': 'exists',
    };
    const gcalFirst = await postGoogleCalendarWebhook(
      makeRequest('http://localhost:3000/api/webhooks/google-calendar', {
        method: 'POST',
        headers: gcalHeaders,
      }),
    );
    expect(gcalFirst.status).toBe(200);
    const gcalSecond = await postGoogleCalendarWebhook(
      makeRequest('http://localhost:3000/api/webhooks/google-calendar', {
        method: 'POST',
        headers: gcalHeaders,
      }),
    );
    expect(gcalSecond.status).toBe(200);
    expect(await gcalSecond.json()).toEqual({ ok: true, idempotent: true, matched: true });

    let icsStatus = 200;
    for (let i = 0; i < 61; i += 1) {
      const res = await getManageBookingIcs(
        makeRequest('http://localhost:3000/api/bookings/manage/demo-token-sofia-1042/ics', {
          headers: { 'x-forwarded-for': '203.0.113.55' },
        }),
        { params: Promise.resolve({ token: 'demo-token-sofia-1042' }) },
      );
      icsStatus = res.status;
    }
    expect(icsStatus).toBe(429);

    let bootstrapStatus = 200;
    for (let i = 0; i < 121; i += 1) {
      const res = await getPublicBootstrap(
        makeRequest('http://localhost:3000/api/public/bootstrap', {
          headers: { 'x-forwarded-for': '203.0.113.56' },
        }),
      );
      bootstrapStatus = res.status;
    }
    expect(bootstrapStatus).toBe(429);
  });
});
