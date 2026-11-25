import { createClient } from '@supabase/supabase-js';
import { describe, expect, it } from 'vitest';
import { createFixedClock } from '../clock';
import { zonedDateTimeToUtc } from '../availability/engine';
import { dispatchOutboxEvent } from '../use-cases/outbox';
import { createInitialDemoDatabase } from '../demo-seed';
import type { Database } from './database.types';
import { PolicyError, SlotConflictError } from './port';
import { createSupabaseRepository } from './supabase-repo';

interface RecordedRequest {
  method: string;
  path: string;
  search: string;
  body: unknown;
}

const TZ = 'America/Mexico_City';
const STAFF_ID = '11111111-1111-4111-8111-111111111111';
const SERVICE_ID = '22222222-2222-4222-8222-222222222222';
const CLIENT_ID = '33333333-3333-4333-8333-333333333333';
const BOOKING_ID = '44444444-4444-4444-8444-444444444444';
const HOLD_ID = '55555555-5555-4555-8555-555555555555';
const SCHEDULE_ID = '66666666-6666-4666-8666-666666666666';

function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function buildMockSupabase(options: {
  rpcHandlers?: Record<
    string,
    (body: unknown) => { status?: number; data: unknown }
  >;
  slotHoldInsertResult?: { status?: number; data: unknown };
  bookingsRows?: Array<Database['public']['Tables']['bookings']['Row']>;
  outboxRows?: Array<Database['public']['Tables']['outbox_events']['Row']>;
} = {}) {
  const requests: RecordedRequest[] = [];
  const bookingsRows = options.bookingsRows ?? [];
  const outboxRows = options.outboxRows ?? [];

  const settingsRow: Database['public']['Tables']['salon_settings']['Row'] = {
    id: 'default',
    name: 'Nails Studio',
    tagline: 'Estudio boutique',
    description: 'Agenda real',
    logo_url: null,
    cover_image_url: null,
    address: 'Roma Norte, CDMX',
    maps_url: 'https://maps.google.com/?q=CDMX',
    instagram_handle: '@nails',
    whatsapp_number: '+525512345678',
    contact_email: 'hola@nails.studio',
    timezone: TZ,
    brand_accent_light: '#9E5C64',
    brand_accent_dark: '#D89BA3',
    default_public_mode: 'light',
    default_admin_mode: 'system',
    corner_style: 'soft',
    default_booking_layout: 'month',
    enabled_booking_layouts: ['month', 'week', 'column'],
    lock_timezone: true,
    slot_interval_minutes: 30,
    enable_slot_hold: true,
    slot_hold_minutes: 3,
    min_booking_notice_minutes: 60,
    max_booking_days_ahead: 45,
    min_cancel_hours: 12,
    min_reschedule_hours: 12,
    cancellation_policy_text: 'Política',
    booking_instructions_text: 'Instrucciones',
    payment_mode: 'none',
    deposit_bank_name: '',
    deposit_account_holder: '',
    deposit_clabe: '',
    deposit_instructions: '',
    currency: 'MXN',
    landing_content: {
      heroEyebrow: 'Eyebrow',
      heroTitle: 'Title',
      heroSubtitle: 'Sub',
      aboutTitle: 'About',
      aboutBody: 'Body',
    },
    whatsapp_booking_enabled: true,
    sms_reminders_enabled: false,
    meta_pixel_id: null,
    ga4_measurement_id: null,
    google_review_url: null,
    default_commission_percent: 35,
    updated_at: '2026-12-01T10:00:00.000Z',
  };

  const serviceRow: Database['public']['Tables']['services']['Row'] = {
    id: SERVICE_ID,
    category_id: null,
    name: 'Manicura Rusa + Gelish',
    slug: 'manicura-rusa-gelish',
    description: 'Gel',
    duration_minutes: 60,
    price_cents: 38000,
    buffer_before_minutes: 0,
    buffer_after_minutes: 15,
    requires_confirmation: false,
    deposit_required: false,
    deposit_amount_cents: 0,
    allow_inspo_photo: true,
    is_active: true,
    is_featured: true,
    display_order: 0,
    image_url: null,
    created_at: '2026-12-01T10:00:00.000Z',
    updated_at: '2026-12-01T10:00:00.000Z',
  };

  const staffRow: Database['public']['Tables']['staff_members']['Row'] = {
    id: STAFF_ID,
    name: 'Valeria Mendoza',
    role_title: 'Master Nail Artist',
    bio: 'Bio',
    avatar_url: null,
    booking_slug: 'valeria',
    commission_percent: 40,
    is_active: true,
    display_order: 0,
    created_at: '2026-12-01T10:00:00.000Z',
    updated_at: '2026-12-01T10:00:00.000Z',
  };

  const clientRow: Database['public']['Tables']['clients']['Row'] = {
    id: CLIENT_ID,
    full_name: 'Sofía Ramírez',
    phone_e164: '+525511223344',
    email: 'sofia@example.com',
    birthday: null,
    notes: '',
    no_show_count: 0,
    created_at: '2026-12-01T10:00:00.000Z',
    updated_at: '2026-12-01T10:00:00.000Z',
  };

  const scheduleRow: Database['public']['Tables']['availability_schedules']['Row'] = {
    id: SCHEDULE_ID,
    staff_id: STAFF_ID,
    name: 'Horario habitual',
    timezone: TZ,
    is_default: true,
    created_at: '2026-12-01T10:00:00.000Z',
  };

  const rulesRows: Array<Database['public']['Tables']['availability_rules']['Row']> = [
    {
      id: 'rule-tue',
      schedule_id: SCHEDULE_ID,
      day_of_week: 2,
      start_time: '10:00',
      end_time: '18:00',
    },
    {
      id: 'rule-wed',
      schedule_id: SCHEDULE_ID,
      day_of_week: 3,
      start_time: '10:00',
      end_time: '18:00',
    },
  ];

  const mockFetch: typeof fetch = async (input, init) => {
    const urlStr =
      typeof input === 'string'
        ? input
        : input instanceof URL
          ? input.toString()
          : input.url;
    const url = new URL(urlStr);
    const method = (init?.method ?? 'GET').toUpperCase();
    const rawBody =
      typeof init?.body === 'string' && init.body.length > 0
        ? JSON.parse(init.body)
        : null;

    requests.push({
      method,
      path: url.pathname,
      search: url.search,
      body: rawBody,
    });

    if (url.pathname.startsWith('/rest/v1/rpc/')) {
      const rpcName = url.pathname.slice('/rest/v1/rpc/'.length);
      const handler = options.rpcHandlers?.[rpcName];
      if (handler) {
        const res = handler(rawBody);
        return jsonResponse(res.data, res.status ?? 200);
      }
      if (rpcName === 'purge_expired_slot_holds') {
        return jsonResponse(1, 200);
      }
      return jsonResponse(BOOKING_ID, 200);
    }

    const table = url.pathname.replace('/rest/v1/', '');
    const acceptHeader =
      init?.headers instanceof Headers
        ? init.headers.get('accept') ?? ''
        : Array.isArray(init?.headers)
          ? init.headers.find(([k]) => k.toLowerCase() === 'accept')?.[1] ?? ''
          : (init?.headers as Record<string, string> | undefined)?.Accept ??
            (init?.headers as Record<string, string> | undefined)?.accept ??
            '';
    const wantsSingleObject = acceptHeader.includes('application/vnd.pgrst.object+json');

    if (table === 'salon_settings') {
      return jsonResponse(wantsSingleObject ? settingsRow : [settingsRow]);
    }
    if (table === 'services') {
      return jsonResponse(wantsSingleObject ? serviceRow : [serviceRow]);
    }
    if (table === 'staff_members') {
      return jsonResponse(wantsSingleObject ? staffRow : [staffRow]);
    }
    if (table === 'staff_services') {
      return jsonResponse([
        { staff_id: STAFF_ID, service_id: SERVICE_ID, custom_duration_minutes: null },
      ]);
    }
    if (table === 'availability_schedules') {
      return jsonResponse([scheduleRow]);
    }
    if (table === 'availability_rules') {
      return jsonResponse(rulesRows);
    }
    if (table === 'clients') {
      if (method === 'PATCH' || method === 'POST') {
        return jsonResponse(wantsSingleObject ? clientRow : [clientRow]);
      }
      return jsonResponse(wantsSingleObject ? clientRow : [clientRow]);
    }
    if (table === 'slot_holds') {
      if (method === 'POST') {
        if (options.slotHoldInsertResult) {
          return jsonResponse(
            options.slotHoldInsertResult.data,
            options.slotHoldInsertResult.status ?? 201,
          );
        }
        const payload = rawBody as Record<string, string>;
        const created: Database['public']['Tables']['slot_holds']['Row'] = {
          id: HOLD_ID,
          staff_id: payload.staff_id ?? STAFF_ID,
          service_id: payload.service_id ?? SERVICE_ID,
          session_token: payload.session_token ?? 'sess-1',
          start_at: payload.start_at ?? '2026-12-01T16:00:00.000Z',
          end_at: payload.end_at ?? '2026-12-01T17:15:00.000Z',
          held_range:
            payload.held_range ?? '[2026-12-01T16:00:00.000Z,2026-12-01T17:15:00.000Z)',
          expires_at: payload.expires_at ?? '2026-12-01T13:03:00.000Z',
          created_at: '2026-12-01T13:00:00.000Z',
        };
        return jsonResponse(wantsSingleObject ? created : [created], 201);
      }
      return jsonResponse([]);
    }
    if (table === 'bookings') {
      if (url.search.includes('idempotency_key=')) {
        return jsonResponse(null);
      }
      return jsonResponse(wantsSingleObject ? bookingsRows[0] ?? null : bookingsRows);
    }
    if (table === 'outbox_events') {
      if (method === 'POST') {
        const created: Database['public']['Tables']['outbox_events']['Row'] = {
          id: '77777777-7777-4777-8777-777777777777',
          event_type: 'booking_created',
          payload: { bookingId: BOOKING_ID },
          status: 'pending',
          attempts: 0,
          available_at: '2026-12-01T13:00:00.000Z',
          processed_at: null,
          last_error: null,
          created_at: '2026-12-01T13:00:00.000Z',
        };
        return jsonResponse(wantsSingleObject ? created : [created], 201);
      }
      if (method === 'PATCH') {
        const first = outboxRows[0];
        if (!first) return jsonResponse(wantsSingleObject ? null : []);
        const patched = { ...first, status: 'processing' as const, attempts: first.attempts + 1 };
        return jsonResponse(wantsSingleObject ? patched : [patched]);
      }
      return jsonResponse(outboxRows);
    }

    return jsonResponse([]);
  };

  const client = createClient<Database>(
    'https://mock-nails.supabase.co',
    'service-role-test-key',
    {
      auth: { persistSession: false, autoRefreshToken: false },
      global: { fetch: mockFetch },
    },
  );

  return { client, requests };
}

describe('Supabase Repository Adapter & Outbox Dispatcher (C1 / A1 / A2 / A7 / M4)', () => {
  it('createBookingAtomic calls create_booking_atomic RPC with p_hold_id and p_session_token', async () => {
    const startAt = zonedDateTimeToUtc('2026-12-01', '10:00', TZ).toISOString();
    const endAt = zonedDateTimeToUtc('2026-12-01', '11:00', TZ).toISOString();
    const occEndAt = zonedDateTimeToUtc('2026-12-01', '11:15', TZ).toISOString();

    const createdBookingRow: Database['public']['Tables']['bookings']['Row'] = {
      id: BOOKING_ID,
      booking_code: 'NL-ABCDEF',
      manage_token: 'tok123',
      idempotency_key: 'idem-1',
      service_id: SERVICE_ID,
      staff_id: STAFF_ID,
      client_id: CLIENT_ID,
      start_at: startAt,
      end_at: endAt,
      occupied_start_at: startAt,
      occupied_end_at: occEndAt,
      occupied_range: `[${startAt},${occEndAt})`,
      total_duration_minutes: 60,
      subtotal_cents: 38000,
      discount_cents: 0,
      total_price_cents: 38000,
      deposit_amount_cents: 0,
      coupon_code: null,
      status: 'confirmed',
      source: 'web',
      client_notes: '',
      internal_notes: '',
      inspo_photo_url: null,
      payment_proof_url: null,
      google_event_id: null,
      cancellation_reason: null,
      rescheduled_from_id: null,
      created_at: '2026-12-01T13:00:00.000Z',
      updated_at: '2026-12-01T13:00:00.000Z',
    };

    const { client, requests } = buildMockSupabase({
      bookingsRows: [createdBookingRow],
      rpcHandlers: {
        create_booking_atomic: () => ({ status: 200, data: BOOKING_ID }),
      },
    });
    const clock = createFixedClock('2026-12-01T13:00:00.000Z', 'rpc-ok');
    const repo = createSupabaseRepository(clock, client);

    const booking = await repo.createBookingAtomic({
      serviceId: SERVICE_ID,
      addonIds: [],
      staffId: STAFF_ID,
      startAt,
      clientName: 'Sofía Ramírez',
      clientPhone: '5511223344',
      sessionToken: 'sess-verified-1',
      holdId: HOLD_ID,
      idempotencyKey: 'idem-1',
    });

    expect(booking.id).toBe(BOOKING_ID);
    expect(booking.staff.id).toBe(STAFF_ID);

    const rpcReq = requests.find((r) => r.path === '/rest/v1/rpc/create_booking_atomic');
    expect(rpcReq).toBeDefined();
    const rpcBody = rpcReq?.body as Record<string, unknown>;
    expect(rpcBody.p_hold_id).toBe(HOLD_ID);
    expect(rpcBody.p_session_token).toBe('sess-verified-1');
    expect(String(rpcBody.p_booking_code)).toMatch(
      /^NL-[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{6}$/,
    );
    expect(rpcBody.p_occupied_start_at).toBe(startAt);
    expect(rpcBody.p_occupied_end_at).toBe(occEndAt);

    expect(requests.some((r) => r.path === '/rest/v1/public_busy_overrides')).toBe(true);
    expect(requests.some((r) => r.path === '/rest/v1/public_busy_intervals')).toBe(true);
  });

  it('maps Postgres 23P01 exclusion violation and P0001 HOLD_OWNERSHIP_MISMATCH to SlotConflictError with suggestedSlots', async () => {
    const startAt = zonedDateTimeToUtc('2026-12-01', '10:00', TZ).toISOString();
    const clock = createFixedClock('2026-12-01T13:00:00.000Z', 'rpc-conflict');

    const mock23P01 = buildMockSupabase({
      rpcHandlers: {
        create_booking_atomic: () => ({
          status: 409,
          data: {
            code: '23P01',
            message:
              'conflicting key value violates exclusion constraint "no_overlapping_active_bookings"',
          },
        }),
      },
    });
    const repo23P01 = createSupabaseRepository(clock, mock23P01.client);

    let caught23P01: unknown = null;
    try {
      await repo23P01.createBookingAtomic({
        serviceId: SERVICE_ID,
        addonIds: [],
        staffId: STAFF_ID,
        startAt,
        clientName: 'Sofía Ramírez',
        clientPhone: '5511223344',
      });
    } catch (err) {
      caught23P01 = err;
    }
    expect(caught23P01).toBeInstanceOf(SlotConflictError);
    if (caught23P01 instanceof SlotConflictError) {
      expect(caught23P01.code).toBe('SLOT_TAKEN');
      expect(caught23P01.suggestedSlots.length).toBeGreaterThan(0);
      expect(
        caught23P01.suggestedSlots.some(
          (s) => s.staffId === STAFF_ID && s.startAt === startAt,
        ),
      ).toBe(false);
    }

    const mockP0001 = buildMockSupabase({
      rpcHandlers: {
        create_booking_atomic: () => ({
          status: 400,
          data: {
            code: 'P0001',
            message: 'HOLD_OWNERSHIP_MISMATCH',
          },
        }),
      },
    });
    const repoP0001 = createSupabaseRepository(clock, mockP0001.client);

    let caughtP0001: unknown = null;
    try {
      await repoP0001.createBookingAtomic({
        serviceId: SERVICE_ID,
        addonIds: [],
        staffId: STAFF_ID,
        startAt,
        clientName: 'Sofía Ramírez',
        clientPhone: '5511223344',
        holdId: HOLD_ID,
        sessionToken: 'wrong-session',
      });
    } catch (err) {
      caughtP0001 = err;
    }
    expect(caughtP0001).toBeInstanceOf(SlotConflictError);
    if (caughtP0001 instanceof SlotConflictError) {
      expect(caughtP0001.code).toBe('SLOT_TAKEN');
      expect(caughtP0001.suggestedSlots.length).toBeGreaterThan(0);
      expect(
        caughtP0001.suggestedSlots.some(
          (s) => s.staffId === STAFF_ID && s.startAt === startAt,
        ),
      ).toBe(false);
    }
  });

  it('createOrRefreshSlotHold purges expired holds before insert and maps 23P01 collision to SlotConflictError', async () => {
    const startAt = zonedDateTimeToUtc('2026-12-01', '10:00', TZ).toISOString();
    const clock = createFixedClock('2026-12-01T13:00:00.000Z', 'holds');

    const okMock = buildMockSupabase();
    const okRepo = createSupabaseRepository(clock, okMock.client);
    const hold = await okRepo.createOrRefreshSlotHold({
      serviceId: SERVICE_ID,
      addonIds: [],
      staffId: STAFF_ID,
      startAt,
      sessionToken: 'sess-hold-a',
    });

    expect(hold.holdId).toBe(HOLD_ID);
    expect(hold.id).toBe(HOLD_ID);

    const purgeIdx = okMock.requests.findIndex(
      (r) => r.path === '/rest/v1/rpc/purge_expired_slot_holds',
    );
    const insertIdx = okMock.requests.findIndex(
      (r) => r.method === 'POST' && r.path === '/rest/v1/slot_holds',
    );
    expect(purgeIdx).toBeGreaterThanOrEqual(0);
    expect(insertIdx).toBeGreaterThan(purgeIdx);

    const conflictMock = buildMockSupabase({
      slotHoldInsertResult: {
        status: 409,
        data: {
          code: '23P01',
          message:
            'conflicting key value violates exclusion constraint "no_overlapping_slot_holds"',
        },
      },
    });
    const conflictRepo = createSupabaseRepository(clock, conflictMock.client);

    let caughtHoldConflict: unknown = null;
    try {
      await conflictRepo.createOrRefreshSlotHold({
        serviceId: SERVICE_ID,
        addonIds: [],
        staffId: STAFF_ID,
        startAt,
        sessionToken: 'sess-hold-b',
      });
    } catch (err) {
      caughtHoldConflict = err;
    }
    expect(caughtHoldConflict).toBeInstanceOf(SlotConflictError);
    if (caughtHoldConflict instanceof SlotConflictError) {
      expect(caughtHoldConflict.suggestedSlots.length).toBeGreaterThan(0);
      expect(
        caughtHoldConflict.suggestedSlots.some(
          (s) => s.staffId === STAFF_ID && s.startAt === startAt,
        ),
      ).toBe(false);
    }
  });

  it('updateBookingStatus rejects invalid state transitions via state-machine and outbox methods dequeue/ack', async () => {
    const canceledRow: Database['public']['Tables']['bookings']['Row'] = {
      id: BOOKING_ID,
      booking_code: 'NL-CANC01',
      manage_token: 'tok-canc',
      idempotency_key: null,
      service_id: SERVICE_ID,
      staff_id: STAFF_ID,
      client_id: CLIENT_ID,
      start_at: '2026-12-01T16:00:00.000Z',
      end_at: '2026-12-01T17:00:00.000Z',
      occupied_start_at: '2026-12-01T16:00:00.000Z',
      occupied_end_at: '2026-12-01T17:15:00.000Z',
      occupied_range: '[2026-12-01T16:00:00.000Z,2026-12-01T17:15:00.000Z)',
      total_duration_minutes: 60,
      subtotal_cents: 38000,
      discount_cents: 0,
      total_price_cents: 38000,
      deposit_amount_cents: 0,
      coupon_code: null,
      status: 'canceled',
      source: 'web',
      client_notes: '',
      internal_notes: '',
      inspo_photo_url: null,
      payment_proof_url: null,
      google_event_id: null,
      cancellation_reason: 'Clienta canceló',
      rescheduled_from_id: null,
      created_at: '2026-12-01T10:00:00.000Z',
      updated_at: '2026-12-01T10:00:00.000Z',
    };

    const { client, requests } = buildMockSupabase({
      bookingsRows: [canceledRow],
      outboxRows: [
        {
          id: '88888888-8888-4888-8888-888888888888',
          event_type: 'booking_created',
          payload: { bookingId: BOOKING_ID },
          status: 'pending',
          attempts: 0,
          available_at: '2026-12-01T12:00:00.000Z',
          processed_at: null,
          last_error: null,
          created_at: '2026-12-01T12:00:00.000Z',
        },
      ],
    });
    const clock = createFixedClock('2026-12-01T13:00:00.000Z', 'sm-outbox');
    const repo = createSupabaseRepository(clock, client);

    await expect(
      repo.updateBookingStatus({ bookingId: BOOKING_ID, status: 'confirmed' }),
    ).rejects.toThrow(PolicyError);

    let rescheduleErr: unknown = null;
    try {
      await repo.manageClientBookingAction({
        token: 'tok-canc',
        action: 'reschedule',
        newStartAt: zonedDateTimeToUtc('2026-12-02', '11:00', TZ).toISOString(),
      });
    } catch (err) {
      rescheduleErr = err;
    }
    expect(rescheduleErr).toBeInstanceOf(PolicyError);
    if (rescheduleErr instanceof PolicyError) {
      expect(rescheduleErr.code).toBe('INVALID_TRANSITION');
    }

    expect(
      requests.some((r) => r.method === 'PATCH' && r.path === '/rest/v1/bookings'),
    ).toBe(false);

    const dequeued = await repo.dequeueOutboxEvents(10);
    expect(dequeued).toHaveLength(1);
    expect(dequeued[0]?.attempts).toBe(1);

    const claimPatch = requests.find(
      (r) => r.method === 'PATCH' && r.path === '/rest/v1/outbox_events',
    );
    expect(claimPatch?.search).toContain('status=in.');

    await repo.ackOutboxEvent('88888888-8888-4888-8888-888888888888');
    await repo.failOutboxEvent('88888888-8888-4888-8888-888888888888', 'Temporary timeout');
    expect(
      requests.filter((r) => r.method === 'PATCH' && r.path === '/rest/v1/outbox_events')
        .length,
    ).toBeGreaterThanOrEqual(3);
  });

  it('dispatchOutboxEvent isolates external errors without throwing', async () => {
    const db = createInitialDemoDatabase();
    const sampleBooking = db.bookings[0];
    const sampleService = db.services.find((s) => s.id === sampleBooking?.serviceId);
    const sampleStaff = db.staff.find((s) => s.id === sampleBooking?.staffId);
    const sampleClient = db.clients.find((c) => c.id === sampleBooking?.clientId);
    if (!sampleBooking || !sampleService || !sampleStaff || !sampleClient) {
      throw new Error('Expected seed booking relations');
    }

    const hydrated = {
      ...sampleBooking,
      service: sampleService,
      staff: sampleStaff,
      client: sampleClient,
      review: null,
    };

    const rtRes = await dispatchOutboxEvent({
      type: 'Realtime',
      eventType: 'slot_changed',
      payload: { staffId: sampleStaff.id, date: '2026-12-01' },
    });
    expect(rtRes).toEqual({ ok: true });

    const failRes = await dispatchOutboxEvent({
      type: 'SyncCalendar',
      booking: hydrated,
      connection: db.calendarConnections[0],
      settings: db.settings,
      action: 'create',
      onSynced: () => {
        throw new Error('Provider callback exploded');
      },
    });
    expect(failRes.ok).toBe(false);
    expect(failRes.error).toContain('Provider callback exploded');
  });
});
