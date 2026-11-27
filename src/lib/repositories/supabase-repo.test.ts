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
const EXTRA_SERVICE_ID = '22222222-2222-4222-8222-222222222223';
const CLIENT_ID = '33333333-3333-4333-8333-333333333333';
const BOOKING_ID = '44444444-4444-4444-8444-444444444444';
const HOLD_ID = '55555555-5555-4555-8555-555555555555';
const SCHEDULE_ID = '66666666-6666-4666-8666-666666666666';
const PROGRAM_ID = '99999999-9999-4999-8999-999999999991';
const BLOCK_ID = '99999999-9999-4999-8999-999999999992';
const SPLIT_ID = '99999999-9999-4999-8999-999999999993';
const STAMP_ID = '99999999-9999-4999-8999-999999999994';
const CONSENT_ID = '99999999-9999-4999-8999-999999999995';
const AUDIT_ID = '99999999-9999-4999-8999-999999999996';
const COUPON_ID = '99999999-9999-4999-8999-999999999997';
const REDEMPTION_ID = '99999999-9999-4999-8999-999999999998';

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
  loyaltyStampInsertResult?: { status?: number; data: unknown };
  settingsOverrides?: Partial<Database['public']['Tables']['salon_settings']['Row']>;
  serviceOverrides?: Partial<Database['public']['Tables']['services']['Row']>;
  extraServicesRows?: Array<Database['public']['Tables']['services']['Row']>;
  clientOverrides?: Partial<Database['public']['Tables']['clients']['Row']>;
  rulesRows?: Array<Database['public']['Tables']['availability_rules']['Row']>;
  bookingsRows?: Array<Database['public']['Tables']['bookings']['Row']>;
  outboxRows?: Array<Database['public']['Tables']['outbox_events']['Row']>;
  paymentSplitsRows?: Array<Database['public']['Tables']['payment_splits']['Row']>;
  recurringBlocksRows?: Array<Database['public']['Tables']['recurring_blocks']['Row']>;
  loyaltyProgramsRows?: Array<Database['public']['Tables']['loyalty_programs']['Row']>;
  loyaltyStampsRows?: Array<Database['public']['Tables']['loyalty_stamps']['Row']>;
  couponRedemptionsRows?: Array<Database['public']['Tables']['coupon_redemptions']['Row']>;
  consentsRows?: Array<Database['public']['Tables']['consents']['Row']>;
  auditLogsRows?: Array<Database['public']['Tables']['audit_logs']['Row']>;
  dateOverridesRows?: Array<Database['public']['Tables']['date_overrides']['Row']>;
  publicBusyOverridesRows?: Array<Database['public']['Views']['public_busy_overrides']['Row']>;
  waitlistRows?: Array<Database['public']['Tables']['waitlist_entries']['Row']>;
  bookingPaymentsRows?: Array<Database['public']['Tables']['booking_payments']['Row']>;
  calendarConnectionsRows?: Array<Database['public']['Tables']['calendar_connections']['Row']>;
  mediaAssetsRows?: Array<Database['public']['Tables']['media_assets']['Row']>;
  whatsappTemplatesRows?: Array<Database['public']['Tables']['whatsapp_templates']['Row']>;
  whatsappUsageRows?: Array<Database['public']['Tables']['whatsapp_monthly_usage']['Row']>;
  webhookInsertStatus?: number;
} = {}) {
  const requests: RecordedRequest[] = [];
  const bookingsRows = options.bookingsRows ?? [];
  const outboxRows = options.outboxRows ?? [];
  const extraServicesRows = options.extraServicesRows ?? [];
  const paymentSplitsRows = options.paymentSplitsRows ?? [];
  const recurringBlocksRows = options.recurringBlocksRows ?? [];
  const loyaltyProgramsRows = options.loyaltyProgramsRows ?? [];
  const loyaltyStampsRows = options.loyaltyStampsRows ?? [];
  const couponRedemptionsRows = options.couponRedemptionsRows ?? [];
  const consentsRows = options.consentsRows ?? [];
  const auditLogsRows = options.auditLogsRows ?? [];
  const dateOverridesRows = options.dateOverridesRows ?? [];
  const publicBusyOverridesRows = options.publicBusyOverridesRows ?? [];
  const waitlistRows = options.waitlistRows ?? [];
  const bookingPaymentsRows = options.bookingPaymentsRows ?? [];
  const calendarConnectionsRows = options.calendarConnectionsRows ?? [];
  const mediaAssetsRows = options.mediaAssetsRows ?? [];
  const whatsappTemplatesRows = options.whatsappTemplatesRows ?? [];
  const whatsappUsageRows = options.whatsappUsageRows ?? [];
  const seenWebhookKeys = new Set<string>();

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
    ...options.settingsOverrides,
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
    ...options.serviceOverrides,
  };

  const allServicesRows = [serviceRow, ...extraServicesRows];

  const staffRow: Database['public']['Tables']['staff_members']['Row'] = {
    id: STAFF_ID,
    name: 'Valeria Mendoza',
    role_title: 'Nail Artist',
    bio: '',
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
    ...options.clientOverrides,
  };

  const scheduleRow: Database['public']['Tables']['availability_schedules']['Row'] = {
    id: SCHEDULE_ID,
    staff_id: STAFF_ID,
    name: 'Horario habitual',
    timezone: TZ,
    is_default: true,
    created_at: '2026-12-01T10:00:00.000Z',
  };

  const rulesRows: Array<Database['public']['Tables']['availability_rules']['Row']> =
    options.rulesRows ?? [
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
      if (rpcName === 'increment_whatsapp_usage') {
        const body = (rawBody ?? {}) as {
          p_month_key?: string;
          p_quota_limit?: number;
          p_increment?: number;
        };
        const monthKey = body.p_month_key ?? '2026-12';
        const quota = body.p_quota_limit ?? 500;
        const inc = body.p_increment ?? 1;
        const existing = whatsappUsageRows.find((u) => u.month_key === monthKey);
        const sentCount = (existing?.sent_count ?? 0) + inc;
        const nowIso = '2026-12-01T13:00:00.000Z';
        const nextRow: Database['public']['Tables']['whatsapp_monthly_usage']['Row'] = {
          month_key: monthKey,
          sent_count: sentCount,
          quota_limit: quota,
          warned_80_at:
            existing?.warned_80_at ?? (sentCount * 100 >= quota * 80 ? nowIso : null),
          warned_100_at:
            existing?.warned_100_at ?? (sentCount >= quota ? nowIso : null),
          updated_at: nowIso,
        };
        if (existing) {
          Object.assign(existing, nextRow);
        } else {
          whatsappUsageRows.push(nextRow);
        }
        return jsonResponse([nextRow], 200);
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
      if (method === 'PATCH' && rawBody && typeof rawBody === 'object') {
        const merged = { ...settingsRow, ...(rawBody as Record<string, unknown>) };
        return jsonResponse(wantsSingleObject ? merged : [merged]);
      }
      return jsonResponse(wantsSingleObject ? settingsRow : [settingsRow]);
    }
    if (table === 'services') {
      if (method === 'PATCH' && rawBody && typeof rawBody === 'object') {
        const merged = { ...serviceRow, ...(rawBody as Record<string, unknown>) };
        return jsonResponse(wantsSingleObject ? merged : [merged]);
      }
      if (method === 'POST' && rawBody && typeof rawBody === 'object') {
        const created = { ...serviceRow, ...(rawBody as Record<string, unknown>) };
        return jsonResponse(wantsSingleObject ? created : [created], 201);
      }
      const idFilter = url.searchParams.get('id');
      if (idFilter?.startsWith('eq.')) {
        const targetId = idFilter.slice(3);
        const matched = allServicesRows.filter((s) => s.id === targetId);
        return jsonResponse(wantsSingleObject ? matched[0] ?? null : matched);
      }
      if (idFilter?.startsWith('in.(') && idFilter.endsWith(')')) {
        const ids = new Set(idFilter.slice(4, -1).split(','));
        return jsonResponse(allServicesRows.filter((s) => ids.has(s.id)));
      }
      return jsonResponse(wantsSingleObject ? serviceRow : allServicesRows);
    }
    if (table === 'staff_members') {
      return jsonResponse(wantsSingleObject ? staffRow : [staffRow]);
    }
    if (table === 'staff_services') {
      return jsonResponse(
        allServicesRows.map((s) => ({
          staff_id: STAFF_ID,
          service_id: s.id,
          custom_duration_minutes: null,
        })),
      );
    }
    if (table === 'availability_schedules') {
      return jsonResponse(wantsSingleObject ? scheduleRow : [scheduleRow]);
    }
    if (table === 'availability_rules') {
      if (method === 'POST') {
        return jsonResponse(Array.isArray(rawBody) ? rawBody : [], 201);
      }
      return jsonResponse(rulesRows);
    }
    if (table === 'date_overrides') {
      if (method === 'POST' && rawBody && typeof rawBody === 'object') {
        const created = {
          id: 'ovr-0006',
          staff_id: STAFF_ID,
          override_date: '2026-12-01',
          is_unavailable: true,
          start_time: null,
          end_time: null,
          reason: '',
          public_note: null,
          redirect_staff_id: null,
          created_at: '2026-12-01T10:00:00.000Z',
          ...(rawBody as Record<string, unknown>),
        };
        return jsonResponse(wantsSingleObject ? created : [created], 201);
      }
      return jsonResponse(dateOverridesRows);
    }
    if (table === 'public_busy_overrides') {
      return jsonResponse(publicBusyOverridesRows);
    }
    if (table === 'waitlist_entries') {
      return jsonResponse(waitlistRows);
    }
    if (table === 'booking_payments') {
      return jsonResponse(bookingPaymentsRows);
    }
    if (table === 'calendar_connections') {
      if ((method === 'POST' || method === 'PATCH') && rawBody && typeof rawBody === 'object') {
        const base = calendarConnectionsRows[0] ?? {
          id: 'cal-1',
          staff_id: STAFF_ID,
          provider: 'google' as const,
          account_email: 'karla@laikonanails.mx',
          access_token_encrypted: null,
          refresh_token_encrypted: null,
          token_expires_at: null,
          destination_calendar_id: 'primary',
          conflict_calendar_ids: ['primary'],
          available_calendars: [],
          external_busy_blocks: [],
          watch_channel_id: null,
          watch_resource_id: null,
          watch_expiration: null,
          is_connected: true,
          last_synced_at: '2026-12-01T13:00:00.000Z',
          updated_at: '2026-12-01T13:00:00.000Z',
        };
        const merged = { ...base, ...(rawBody as Record<string, unknown>) };
        return jsonResponse(wantsSingleObject ? merged : [merged], method === 'POST' ? 201 : 200);
      }
      return jsonResponse(wantsSingleObject ? calendarConnectionsRows[0] ?? null : calendarConnectionsRows);
    }
    if (table === 'clients') {
      if (method === 'PATCH' && rawBody && typeof rawBody === 'object') {
        const merged = { ...clientRow, ...(rawBody as Record<string, unknown>) };
        return jsonResponse(wantsSingleObject ? merged : [merged]);
      }
      if (method === 'POST') {
        return jsonResponse(wantsSingleObject ? clientRow : [clientRow], 201);
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
    if (table === 'payment_splits') {
      if (method === 'POST' && Array.isArray(rawBody)) {
        const created = rawBody.map((item, index) => ({
          id: `${SPLIT_ID.slice(0, -1)}${index + 1}`,
          booking_id: BOOKING_ID,
          method: 'cash',
          amount_cents: 0,
          tip_cents: 0,
          tip_staff_id: null,
          reference: null,
          created_at: '2026-12-01T13:00:00.000Z',
          ...(item as Record<string, unknown>),
        }));
        return jsonResponse(created, 201);
      }
      return jsonResponse(paymentSplitsRows);
    }
    if (table === 'recurring_blocks') {
      if ((method === 'POST' || method === 'PATCH') && rawBody && typeof rawBody === 'object') {
        const created = {
          id: BLOCK_ID,
          staff_id: STAFF_ID,
          reason: '',
          frequency: 'weekly',
          weekdays: [],
          day_of_month: null,
          start_time: '12:30',
          end_time: '13:15',
          until_date: null,
          is_active: true,
          created_at: '2026-12-01T13:00:00.000Z',
          ...(rawBody as Record<string, unknown>),
        };
        return jsonResponse(wantsSingleObject ? created : [created], method === 'POST' ? 201 : 200);
      }
      return jsonResponse(recurringBlocksRows);
    }
    if (table === 'loyalty_programs') {
      if ((method === 'POST' || method === 'PATCH') && rawBody && typeof rawBody === 'object') {
        const created = {
          id: PROGRAM_ID,
          is_active: true,
          name: 'Tarjeta de Sellos LAIKONA',
          stamps_required: 8,
          reward_type: 'percent_discount',
          reward_service_id: null,
          discount_percent: 50,
          max_discount_cents: 25000,
          valid_days: 90,
          created_at: '2026-12-01T13:00:00.000Z',
          ...(rawBody as Record<string, unknown>),
        };
        return jsonResponse(wantsSingleObject ? created : [created], method === 'POST' ? 201 : 200);
      }
      return jsonResponse(loyaltyProgramsRows);
    }
    if (table === 'loyalty_stamps') {
      if (method === 'POST') {
        if (options.loyaltyStampInsertResult) {
          return jsonResponse(
            options.loyaltyStampInsertResult.data,
            options.loyaltyStampInsertResult.status ?? 201,
          );
        }
        const created = {
          id: STAMP_ID,
          client_id: CLIENT_ID,
          booking_id: BOOKING_ID,
          program_id: PROGRAM_ID,
          stamped_date: '2026-12-01',
          created_at: '2026-12-01T13:00:00.000Z',
          ...(rawBody as Record<string, unknown>),
        };
        return jsonResponse(wantsSingleObject ? created : [created], 201);
      }
      return jsonResponse(loyaltyStampsRows);
    }
    if (table === 'coupon_redemptions') {
      return jsonResponse(couponRedemptionsRows);
    }
    if (table === 'consents') {
      if (method === 'POST' && rawBody && typeof rawBody === 'object') {
        const created = {
          id: CONSENT_ID,
          client_id: CLIENT_ID,
          booking_id: null,
          policy_version: '2026-11',
          accepted_at: '2026-12-01T13:00:00.000Z',
          marketing_opt_in: false,
          ...(rawBody as Record<string, unknown>),
        };
        return jsonResponse(wantsSingleObject ? created : [created], 201);
      }
      return jsonResponse(consentsRows);
    }
    if (table === 'audit_logs') {
      if (method === 'POST' && rawBody && typeof rawBody === 'object') {
        const created = {
          id: AUDIT_ID,
          actor_id: 'adm-owner',
          actor_email: 'duena@nails.studio',
          actor_role: 'owner',
          action: 'booking_canceled',
          entity_type: 'booking',
          entity_id: BOOKING_ID,
          metadata: {},
          created_at: '2026-12-01T13:00:00.000Z',
          ...(rawBody as Record<string, unknown>),
        };
        return jsonResponse(wantsSingleObject ? created : [created], 201);
      }
      return jsonResponse(auditLogsRows);
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

    if (table === 'media_assets') {
      if (method === 'POST' && rawBody && typeof rawBody === 'object') {
        const body = rawBody as Record<string, unknown>;
        const created: Database['public']['Tables']['media_assets']['Row'] = {
          id: '99999999-9999-4999-8999-999999999999',
          storage_path: String(body.storage_path ?? 'proofs/test.png'),
          folder: (body.folder as 'proofs' | 'inspo' | 'gallery') ?? 'proofs',
          booking_id: (body.booking_id as string | null) ?? null,
          client_id: (body.client_id as string | null) ?? null,
          content_type: String(body.content_type ?? 'image/png'),
          size_bytes: Number(body.size_bytes ?? 0),
          created_at: String(body.created_at ?? '2026-12-01T13:00:00.000Z'),
          retention_warned_30d_at: null,
          retention_warned_7d_at: null,
          purged_at: null,
        };
        mediaAssetsRows.push(created);
        return jsonResponse(wantsSingleObject ? created : [created], 201);
      }
      if (method === 'PATCH' && rawBody && typeof rawBody === 'object') {
        const idFilter = url.searchParams.get('id')?.replace(/^eq\./, '');
        const target = mediaAssetsRows.find((r) => r.id === idFilter);
        if (!target) return jsonResponse(wantsSingleObject ? null : []);
        const merged = { ...target, ...(rawBody as Record<string, unknown>) };
        Object.assign(target, merged);
        return jsonResponse(wantsSingleObject ? merged : [merged]);
      }
      const spFilter = url.searchParams.get('storage_path')?.replace(/^eq\./, '');
      const idFilter = url.searchParams.get('id')?.replace(/^eq\./, '');
      const purgedFilter = url.searchParams.get('purged_at');
      let filtered = [...mediaAssetsRows];
      if (spFilter) filtered = filtered.filter((r) => r.storage_path === spFilter);
      if (idFilter) filtered = filtered.filter((r) => r.id === idFilter);
      if (purgedFilter === 'is.null') filtered = filtered.filter((r) => r.purged_at === null);
      return jsonResponse(wantsSingleObject ? filtered[0] ?? null : filtered);
    }
    if (table === 'whatsapp_templates') {
      return jsonResponse(whatsappTemplatesRows);
    }
    if (table === 'whatsapp_monthly_usage') {
      const monthFilter = url.searchParams.get('month_key')?.replace(/^eq\./, '');
      const filtered = monthFilter
        ? whatsappUsageRows.filter((u) => u.month_key === monthFilter)
        : whatsappUsageRows;
      return jsonResponse(wantsSingleObject ? filtered[0] ?? null : filtered);
    }
    if (table === 'webhook_events') {
      if (method === 'POST' && rawBody && typeof rawBody === 'object') {
        const body = rawBody as { provider?: string; event_id?: string };
        const key = `${body.provider ?? ''}:${body.event_id ?? ''}`;
        if (options.webhookInsertStatus === 409 || seenWebhookKeys.has(key)) {
          return jsonResponse(
            { code: '23505', message: 'duplicate key value violates unique constraint' },
            409,
          );
        }
        seenWebhookKeys.add(key);
        return jsonResponse(
          {
            provider: body.provider ?? '',
            event_id: body.event_id ?? '',
            received_at: '2026-12-01T13:00:00.000Z',
          },
          201,
        );
      }
      return jsonResponse([]);
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

  it('maps 0004 and 0005 columns and collections on read and applies fixed_start_times + recurring_blocks + extraServiceIds in queryAvailability', async () => {
    const startAt = zonedDateTimeToUtc('2026-12-01', '10:00', TZ).toISOString();
    const endAt = zonedDateTimeToUtc('2026-12-01', '11:30', TZ).toISOString();
    const extraServiceRow: Database['public']['Tables']['services']['Row'] = {
      id: EXTRA_SERVICE_ID,
      category_id: null,
      name: 'Retiro',
      slug: 'retiro',
      description: 'Retiro seguro',
      duration_minutes: 30,
      price_cents: 8000,
      is_starting_price: true,
      buffer_before_minutes: 0,
      buffer_after_minutes: 0,
      requires_confirmation: false,
      deposit_required: false,
      deposit_amount_cents: 0,
      allow_inspo_photo: false,
      is_active: true,
      is_featured: false,
      display_order: 1,
      image_url: null,
      created_at: '2026-12-01T10:00:00.000Z',
      updated_at: '2026-12-01T10:00:00.000Z',
    };

    const { client } = buildMockSupabase({
      settingsOverrides: {
        sister_studio_handle: '@lumiere.beautymx',
        deposit_beneficiary: 'Karla Patricia Carrillo Rodríguez',
        deposit_amount_cents: 20000,
        service_mode: 'studio',
        business_type: 'Salón de Manicure y Uñas',
        team_size_tier: '3 a 5',
        onboarding_completed: true,
        sound_alerts_enabled: false,
        lock_past_bookings: true,
        max_active_bookings_per_client: 3,
        privacy_policy_version: '2026-11',
      },
      serviceOverrides: {
        is_starting_price: true,
        buffer_after_minutes: 0,
      },
      extraServicesRows: [extraServiceRow],
      clientOverrides: {
        instagram_handle: '@sofia.ramirez.pue',
      },
      rulesRows: [
        {
          id: 'rule-tue-fixed',
          schedule_id: SCHEDULE_ID,
          day_of_week: 2,
          start_time: '10:00',
          end_time: '19:30',
          fixed_start_times: ['10:00', '13:30', '16:30'],
        },
      ],
      bookingsRows: [
        {
          id: BOOKING_ID,
          booking_code: 'NL-3A0001',
          manage_token: 'tok-3a',
          idempotency_key: null,
          service_id: SERVICE_ID,
          extra_service_ids: [EXTRA_SERVICE_ID],
          staff_id: STAFF_ID,
          client_id: CLIENT_ID,
          client_instagram: '@sofia.ramirez.pue',
          start_at: startAt,
          end_at: endAt,
          occupied_start_at: startAt,
          occupied_end_at: endAt,
          occupied_range: `[${startAt},${endAt})`,
          total_duration_minutes: 90,
          custom_duration_minutes: 90,
          subtotal_cents: 46000,
          discount_cents: 0,
          total_price_cents: 46000,
          custom_price_cents: 46000,
          deposit_amount_cents: 20000,
          coupon_code: null,
          status: 'confirmed',
          source: 'web',
          client_notes: 'Traigo referencia',
          internal_notes: 'Base milky #04',
          inspo_photo_url: null,
          payment_proof_url: null,
          proof_delivery_method: 'instagram_dm',
          google_event_id: null,
          cancellation_reason: null,
          rescheduled_from_id: null,
          created_at: '2026-12-01T10:00:00.000Z',
          updated_at: '2026-12-01T10:00:00.000Z',
        },
      ],
      paymentSplitsRows: [
        {
          id: SPLIT_ID,
          booking_id: BOOKING_ID,
          method: 'transfer',
          amount_cents: 46000,
          tip_cents: 5000,
          tip_staff_id: STAFF_ID,
          reference: 'SPEI-442',
          created_at: '2026-12-01T11:30:00.000Z',
        },
      ],
      recurringBlocksRows: [
        {
          id: BLOCK_ID,
          staff_id: STAFF_ID,
          reason: 'Comida',
          frequency: 'weekly',
          weekdays: [2],
          day_of_month: null,
          start_time: '13:00',
          end_time: '14:00',
          until_date: null,
          is_active: true,
          created_at: '2026-12-01T10:00:00.000Z',
        },
      ],
      loyaltyProgramsRows: [
        {
          id: PROGRAM_ID,
          is_active: true,
          name: 'Tarjeta de Sellos LAIKONA',
          stamps_required: 8,
          reward_type: 'percent_discount',
          reward_service_id: null,
          discount_percent: 50,
          max_discount_cents: 25000,
          valid_days: 90,
          created_at: '2026-12-01T10:00:00.000Z',
        },
      ],
      loyaltyStampsRows: [
        {
          id: STAMP_ID,
          client_id: CLIENT_ID,
          booking_id: BOOKING_ID,
          program_id: PROGRAM_ID,
          stamped_date: '2026-12-01',
          created_at: '2026-12-01T11:30:00.000Z',
        },
      ],
      couponRedemptionsRows: [
        {
          id: REDEMPTION_ID,
          coupon_id: COUPON_ID,
          booking_id: BOOKING_ID,
          client_id: CLIENT_ID,
          amount_cents: 4600,
          status: 'released',
          created_at: '2026-12-01T10:00:00.000Z',
          released_at: '2026-12-01T10:30:00.000Z',
        },
      ],
      consentsRows: [
        {
          id: CONSENT_ID,
          client_id: CLIENT_ID,
          booking_id: BOOKING_ID,
          policy_version: '2026-11',
          accepted_at: '2026-12-01T10:00:00.000Z',
          marketing_opt_in: true,
        },
      ],
      auditLogsRows: [
        {
          id: AUDIT_ID,
          actor_id: 'adm-owner',
          actor_email: 'duena@nails.studio',
          actor_role: 'owner',
          action: 'deposit_approved',
          entity_type: 'booking',
          entity_id: BOOKING_ID,
          metadata: { bookingCode: 'NL-3A0001', depositAmountCents: 20000 },
          created_at: '2026-12-01T10:05:00.000Z',
        },
      ],
    });

    const clock = createFixedClock('2026-12-01T13:00:00.000Z', 'read-0004-0005');
    const repo = createSupabaseRepository(clock, client);
    const snap = await repo.getSnapshot();

    expect(snap.settings.sisterStudioHandle).toBe('@lumiere.beautymx');
    expect(snap.settings.depositBeneficiary).toBe('Karla Patricia Carrillo Rodríguez');
    expect(snap.settings.depositAmountCents).toBe(20000);
    expect(snap.settings.serviceMode).toBe('studio');
    expect(snap.settings.businessType).toBe('Salón de Manicure y Uñas');
    expect(snap.settings.teamSizeTier).toBe('3 a 5');
    expect(snap.settings.onboardingCompleted).toBe(true);
    expect(snap.settings.soundAlertsEnabled).toBe(false);
    expect(snap.settings.lockPastBookings).toBe(true);
    expect(snap.settings.maxActiveBookingsPerClient).toBe(3);
    expect(snap.settings.privacyPolicyVersion).toBe('2026-11');

    expect(snap.services[0]?.isStartingPrice).toBe(true);
    expect(snap.schedules[0]?.rules[0]?.fixedStartTimes).toEqual([
      '10:00',
      '13:30',
      '16:30',
    ]);
    expect(snap.clients[0]?.instagramHandle).toBe('@sofia.ramirez.pue');
    expect(snap.bookings[0]?.extraServiceIds).toEqual([EXTRA_SERVICE_ID]);
    expect(snap.bookings[0]?.clientInstagram).toBe('@sofia.ramirez.pue');
    expect(snap.bookings[0]?.customDurationMinutes).toBe(90);
    expect(snap.bookings[0]?.customPriceCents).toBe(46000);
    expect(snap.bookings[0]?.internalNotes).toBe('Base milky #04');
    expect(snap.bookings[0]?.proofDeliveryMethod).toBe('instagram_dm');

    expect(snap.paymentSplits?.[0]).toMatchObject({
      id: SPLIT_ID,
      bookingId: BOOKING_ID,
      method: 'transfer',
      amountCents: 46000,
      tipCents: 5000,
      reference: 'SPEI-442',
    });
    expect(snap.recurringBlocks?.[0]).toMatchObject({
      id: BLOCK_ID,
      staffId: STAFF_ID,
      frequency: 'weekly',
      weekdays: [2],
      startTime: '13:00',
      endTime: '14:00',
    });
    expect(snap.loyaltyPrograms?.[0]).toMatchObject({
      id: PROGRAM_ID,
      name: 'Tarjeta de Sellos LAIKONA',
      stampsRequired: 8,
    });
    expect(snap.loyaltyStamps?.[0]).toMatchObject({
      id: STAMP_ID,
      clientId: CLIENT_ID,
      stampedDate: '2026-12-01',
    });
    expect(snap.couponRedemptions?.[0]).toMatchObject({
      id: REDEMPTION_ID,
      status: 'released',
      releasedAt: '2026-12-01T10:30:00.000Z',
    });
    expect(snap.consents?.[0]).toMatchObject({
      id: CONSENT_ID,
      policyVersion: '2026-11',
      marketingOptIn: true,
    });
    expect(snap.auditLogs?.[0]).toMatchObject({
      id: AUDIT_ID,
      action: 'deposit_approved',
      metadata: { bookingCode: 'NL-3A0001', depositAmountCents: 20000 },
    });

    const availability = await repo.queryAvailability({
      serviceId: SERVICE_ID,
      extraServiceIds: [EXTRA_SERVICE_ID],
      addonIds: [],
      staffId: STAFF_ID,
      startDate: '2026-12-01',
      days: 1,
    });
    expect(availability.extraServices).toHaveLength(1);
    expect(availability.totals.totalDurationMinutes).toBe(90);
    expect(availability.totals.subtotalCents).toBe(46000);
    expect(availability.days[0]?.slots.map((s) => s.localTime24)).toEqual([
      '10:00',
      '16:30',
    ]);
  });

  it('persists 0004 and 0005 columns across createBookingAtomic, updateSalonSettings, upsertService, saveStaffSchedule, and updateClientNotes', async () => {
    const startAt = zonedDateTimeToUtc('2026-12-01', '10:00', TZ).toISOString();
    const endAt = zonedDateTimeToUtc('2026-12-01', '11:30', TZ).toISOString();
    const extraServiceRow: Database['public']['Tables']['services']['Row'] = {
      id: EXTRA_SERVICE_ID,
      category_id: null,
      name: 'Retiro',
      slug: 'retiro',
      description: 'Retiro seguro',
      duration_minutes: 30,
      price_cents: 8000,
      is_starting_price: true,
      buffer_before_minutes: 0,
      buffer_after_minutes: 0,
      requires_confirmation: false,
      deposit_required: false,
      deposit_amount_cents: 0,
      allow_inspo_photo: false,
      is_active: true,
      is_featured: false,
      display_order: 1,
      image_url: null,
      created_at: '2026-12-01T10:00:00.000Z',
      updated_at: '2026-12-01T10:00:00.000Z',
    };
    const createdBookingRow: Database['public']['Tables']['bookings']['Row'] = {
      id: BOOKING_ID,
      booking_code: 'NL-WR0001',
      manage_token: 'tok-wr',
      idempotency_key: null,
      service_id: SERVICE_ID,
      extra_service_ids: [EXTRA_SERVICE_ID],
      staff_id: STAFF_ID,
      client_id: CLIENT_ID,
      client_instagram: '@sofia.nails',
      start_at: startAt,
      end_at: endAt,
      occupied_start_at: startAt,
      occupied_end_at: endAt,
      occupied_range: `[${startAt},${endAt})`,
      total_duration_minutes: 90,
      custom_duration_minutes: 90,
      subtotal_cents: 42000,
      discount_cents: 0,
      total_price_cents: 42000,
      custom_price_cents: 42000,
      deposit_amount_cents: 0,
      coupon_code: null,
      status: 'confirmed',
      source: 'web',
      client_notes: '',
      internal_notes: 'VIP clienta',
      inspo_photo_url: null,
      payment_proof_url: null,
      proof_delivery_method: 'instagram_dm',
      google_event_id: null,
      cancellation_reason: null,
      rescheduled_from_id: null,
      created_at: '2026-12-01T13:00:00.000Z',
      updated_at: '2026-12-01T13:00:00.000Z',
    };

    const { client, requests } = buildMockSupabase({
      settingsOverrides: { privacy_policy_version: '2026-11' },
      serviceOverrides: { buffer_after_minutes: 0 },
      extraServicesRows: [extraServiceRow],
      bookingsRows: [createdBookingRow],
      rpcHandlers: {
        create_booking_atomic: () => ({ status: 200, data: BOOKING_ID }),
      },
    });
    const clock = createFixedClock('2026-12-01T13:00:00.000Z', 'write-0004-0005');
    const repo = createSupabaseRepository(clock, client);

    await repo.createBookingAtomic({
      serviceId: SERVICE_ID,
      extraServiceIds: [EXTRA_SERVICE_ID],
      addonIds: [],
      staffId: STAFF_ID,
      startAt,
      clientName: 'Sofía Ramírez',
      clientPhone: '5511223344',
      clientInstagram: 'https://instagram.com/Sofia.Nails/',
      customDurationMinutes: 90,
      customPriceCents: 42000,
      internalNotes: 'VIP clienta',
      proofDeliveryMethod: 'instagram_dm',
      privacyConsentAccepted: true,
      marketingOptIn: true,
    });

    const clientPatch = requests.find(
      (r) => r.method === 'PATCH' && r.path === '/rest/v1/clients',
    );
    expect(clientPatch?.body).toMatchObject({ instagram_handle: '@sofia.nails' });

    const bookingPatch = requests.find(
      (r) => r.method === 'PATCH' && r.path === '/rest/v1/bookings',
    );
    expect(bookingPatch?.body).toEqual({
      extra_service_ids: [EXTRA_SERVICE_ID],
      client_instagram: '@sofia.nails',
      custom_duration_minutes: 90,
      custom_price_cents: 42000,
      internal_notes: 'VIP clienta',
      proof_delivery_method: 'instagram_dm',
    });

    const consentPost = requests.find(
      (r) => r.method === 'POST' && r.path === '/rest/v1/consents',
    );
    expect(consentPost?.body).toMatchObject({
      client_id: CLIENT_ID,
      booking_id: BOOKING_ID,
      policy_version: '2026-11',
      marketing_opt_in: true,
    });

    const updatedSettings = await repo.updateSalonSettings({
      sisterStudioHandle: '@lumiere.beautymx',
      depositBeneficiary: 'Karla Patricia Carrillo Rodríguez',
      depositAmountCents: 20000,
      serviceMode: 'studio',
      onboardingCompleted: true,
      soundAlertsEnabled: false,
      lockPastBookings: true,
      maxActiveBookingsPerClient: 4,
      privacyPolicyVersion: '2026-12',
    });
    expect(updatedSettings.lockPastBookings).toBe(true);
    expect(updatedSettings.maxActiveBookingsPerClient).toBe(4);
    expect(updatedSettings.privacyPolicyVersion).toBe('2026-12');

    const settingsPatch = requests.find(
      (r) => r.method === 'PATCH' && r.path === '/rest/v1/salon_settings',
    );
    expect(settingsPatch?.body).toMatchObject({
      sister_studio_handle: '@lumiere.beautymx',
      deposit_beneficiary: 'Karla Patricia Carrillo Rodríguez',
      deposit_amount_cents: 20000,
      service_mode: 'studio',
      onboarding_completed: true,
      sound_alerts_enabled: false,
      lock_past_bookings: true,
      max_active_bookings_per_client: 4,
      privacy_policy_version: '2026-12',
    });

    await repo.upsertService({
      id: SERVICE_ID,
      name: 'Rubber',
      durationMinutes: 120,
      priceCents: 35000,
      isStartingPrice: true,
    });
    const servicePatch = requests.find(
      (r) => r.method === 'PATCH' && r.path === '/rest/v1/services',
    );
    expect(servicePatch?.body).toMatchObject({ is_starting_price: true });

    await repo.saveStaffSchedule(STAFF_ID, [
      {
        id: 'r-1',
        dayOfWeek: 1,
        startTime: '10:00',
        endTime: '19:30',
        fixedStartTimes: ['10:00', '13:30', '16:30'],
      },
    ]);
    const rulesPost = requests.find(
      (r) => r.method === 'POST' && r.path === '/rest/v1/availability_rules',
    );
    expect(rulesPost?.body).toEqual([
      {
        schedule_id: SCHEDULE_ID,
        day_of_week: 1,
        start_time: '10:00',
        end_time: '19:30',
        fixed_start_times: ['10:00', '13:30', '16:30'],
      },
    ]);

    const updatedClient = await repo.updateClientNotes({
      clientId: CLIENT_ID,
      instagramHandle: '@laikona.vip',
    });
    expect(updatedClient.instagramHandle).toBe('@laikona.vip');
  });

  it('persists Phase 3A payment_splits, recurring_blocks, loyalty_programs, loyalty_stamps, consents, and audit_logs', async () => {
    const { client, requests } = buildMockSupabase();
    const clock = createFixedClock('2026-12-01T13:00:00.000Z', 'phase3a-writes');
    const repo = createSupabaseRepository(clock, client);

    if (
      !repo.recordPaymentSplits ||
      !repo.upsertRecurringBlock ||
      !repo.deleteRecurringBlock ||
      !repo.upsertLoyaltyProgram ||
      !repo.awardLoyaltyStamp ||
      !repo.recordConsent ||
      !repo.writeAuditLog
    ) {
      throw new Error('Expected Phase 3A persistence methods on Supabase repository');
    }

    const splits = await repo.recordPaymentSplits({
      bookingId: BOOKING_ID,
      splits: [
        { method: 'cash', amountCents: 20000, tipCents: 3000, tipStaffId: STAFF_ID },
        { method: 'card', amountCents: 18000, reference: 'TERM-99' },
      ],
    });
    expect(splits).toHaveLength(2);
    expect(splits[0]?.method).toBe('cash');
    expect(splits[1]?.reference).toBe('TERM-99');

    const block = await repo.upsertRecurringBlock({
      staffId: STAFF_ID,
      reason: 'Comida',
      frequency: 'weekly',
      weekdays: [1, 2, 3, 4, 5],
      dayOfMonth: null,
      startTime: '12:30',
      endTime: '13:15',
      untilDate: null,
      isActive: true,
    });
    expect(block.id).toBe(BLOCK_ID);
    await repo.deleteRecurringBlock(BLOCK_ID);
    expect(
      requests.some((r) => r.method === 'DELETE' && r.path === '/rest/v1/recurring_blocks'),
    ).toBe(true);

    const program = await repo.upsertLoyaltyProgram({
      isActive: true,
      name: 'Tarjeta de Sellos LAIKONA',
      stampsRequired: 8,
      rewardType: 'percent_discount',
      rewardServiceId: null,
      discountPercent: 50,
      maxDiscountCents: 25000,
      validDays: 90,
    });
    expect(program.stampsRequired).toBe(8);

    const stamp = await repo.awardLoyaltyStamp({
      clientId: CLIENT_ID,
      bookingId: BOOKING_ID,
      programId: PROGRAM_ID,
      stampedDate: '2026-12-01',
    });
    expect(stamp.id).toBe(STAMP_ID);

    const consent = await repo.recordConsent({
      clientId: CLIENT_ID,
      bookingId: BOOKING_ID,
      policyVersion: '2026-11',
      marketingOptIn: false,
    });
    expect(consent.policyVersion).toBe('2026-11');

    const audit = await repo.writeAuditLog({
      actorId: 'adm-owner',
      actorEmail: 'duena@nails.studio',
      actorRole: 'owner',
      action: 'past_booking_override',
      entityType: 'booking',
      entityId: BOOKING_ID,
      metadata: { reason: 'Corrección autorizada' },
    });
    expect(audit.action).toBe('past_booking_override');
    expect(audit.metadata).toEqual({ reason: 'Corrección autorizada' });

    const duplicateMock = buildMockSupabase({
      loyaltyStampInsertResult: {
        status: 409,
        data: {
          code: '23505',
          message: 'duplicate key value violates unique constraint',
        },
      },
    });
    const duplicateRepo = createSupabaseRepository(clock, duplicateMock.client);
    let stampErr: unknown = null;
    try {
      await duplicateRepo.awardLoyaltyStamp?.({
        clientId: CLIENT_ID,
        bookingId: BOOKING_ID,
        programId: PROGRAM_ID,
        stampedDate: '2026-12-01',
      });
    } catch (err) {
      stampErr = err;
    }
    expect(stampErr).toBeInstanceOf(PolicyError);
    if (stampErr instanceof PolicyError) {
      expect(stampErr.code).toBe('STAMP_ALREADY_AWARDED');
    }
  });

  it('maps and persists 0006 Phase 3A+ columns (optimize_continuous_slots, is_private, public_note, redirect_staff_id) and filters private services from getPublicBootstrap', async () => {
    const altStaffId = '11111111-1111-4111-8111-111111111112';
    const privateVipRow: Database['public']['Tables']['services']['Row'] = {
      id: EXTRA_SERVICE_ID,
      category_id: null,
      name: 'Set Novia VIP',
      slug: 'set-novia-vip',
      description: 'Solo por enlace directo',
      duration_minutes: 150,
      price_cents: 85000,
      is_starting_price: false,
      buffer_before_minutes: 0,
      buffer_after_minutes: 0,
      requires_confirmation: true,
      deposit_required: true,
      deposit_amount_cents: 20000,
      allow_inspo_photo: true,
      is_active: true,
      is_featured: false,
      is_private: true,
      display_order: 2,
      image_url: null,
      created_at: '2026-12-01T10:00:00.000Z',
      updated_at: '2026-12-01T10:00:00.000Z',
    };

    const { client, requests } = buildMockSupabase({
      settingsOverrides: {
        optimize_continuous_slots: true,
      },
      serviceOverrides: {
        is_private: false,
      },
      extraServicesRows: [privateVipRow],
      dateOverridesRows: [
        {
          id: 'ovr-holiday',
          staff_id: STAFF_ID,
          override_date: '2026-12-01',
          is_unavailable: true,
          start_time: null,
          end_time: null,
          reason: 'Cita médica privada',
          public_note: 'Karla fuera del estudio hoy — reserva con Paty',
          redirect_staff_id: altStaffId,
          created_at: '2026-12-01T10:00:00.000Z',
        },
      ],
      publicBusyOverridesRows: [
        {
          id: 'ovr-holiday',
          staff_id: STAFF_ID,
          override_date: '2026-12-01',
          is_unavailable: true,
          start_time: null,
          end_time: null,
          public_note: 'Karla fuera del estudio hoy — reserva con Paty',
          redirect_staff_id: altStaffId,
        },
      ],
    });

    const clock = createFixedClock('2026-12-01T13:00:00.000Z', 'phase3a-plus-0006');
    const repo = createSupabaseRepository(clock, client);

    const snap = await repo.getSnapshot();
    expect(snap.settings.optimizeContinuousSlots).toBe(true);
    expect(snap.services.find((s) => s.id === SERVICE_ID)?.isPrivate).toBe(false);
    expect(snap.services.find((s) => s.id === EXTRA_SERVICE_ID)?.isPrivate).toBe(true);
    expect(snap.dateOverrides[0]).toMatchObject({
      reason: 'Cita médica privada',
      publicNote: 'Karla fuera del estudio hoy — reserva con Paty',
      redirectStaffId: altStaffId,
    });

    const bootstrap = await repo.getPublicBootstrap();
    expect(bootstrap.settings.optimizeContinuousSlots).toBe(true);
    expect(bootstrap.services.map((s) => s.id)).toEqual([SERVICE_ID]);
    expect(bootstrap.services.some((s) => s.id === EXTRA_SERVICE_ID)).toBe(false);

    const availability = await repo.queryAvailability({
      serviceId: SERVICE_ID,
      addonIds: [],
      staffId: STAFF_ID,
      startDate: '2026-12-01',
      days: 1,
    });
    expect(availability.days[0]?.hasSlots).toBe(false);

    const updatedSettings = await repo.updateSalonSettings({
      optimizeContinuousSlots: true,
    });
    expect(updatedSettings.optimizeContinuousSlots).toBe(true);
    const settingsPatch = requests.find(
      (r) => r.method === 'PATCH' && r.path === '/rest/v1/salon_settings',
    );
    expect(settingsPatch?.body).toMatchObject({ optimize_continuous_slots: true });

    const savedService = await repo.upsertService({
      id: SERVICE_ID,
      name: 'Set VIP',
      durationMinutes: 120,
      priceCents: 65000,
      isPrivate: true,
    });
    expect(savedService.isPrivate).toBe(true);
    const servicePatch = requests.find(
      (r) => r.method === 'PATCH' && r.path === '/rest/v1/services',
    );
    expect(servicePatch?.body).toMatchObject({ is_private: true });

    const createdOverride = await repo.addDateOverride({
      staffId: STAFF_ID,
      overrideDate: '2026-12-25',
      isUnavailable: true,
      startTime: null,
      endTime: null,
      reason: 'Feriado interno',
      publicNote: 'Cerrado por Navidad',
      redirectStaffId: altStaffId,
    });
    expect(createdOverride.publicNote).toBe('Cerrado por Navidad');
    expect(createdOverride.redirectStaffId).toBe(altStaffId);
    const overridePost = requests.find(
      (r) => r.method === 'POST' && r.path === '/rest/v1/date_overrides',
    );
    expect(overridePost?.body).toMatchObject({
      public_note: 'Cerrado por Navidad',
      redirect_staff_id: altStaffId,
    });
  });

  it('maps and persists 0007 Phase 3B columns (confirmedVia, checkoutUrl, waitlist priority offers, bookingPayments, and encrypted calendar watch fields)', async () => {
    const startAt = zonedDateTimeToUtc('2026-12-01', '10:00', TZ).toISOString();
    const endAt = zonedDateTimeToUtc('2026-12-01', '11:00', TZ).toISOString();

    const { client, requests } = buildMockSupabase({
      bookingsRows: [
        {
          id: BOOKING_ID,
          booking_code: 'NL-3B0001',
          manage_token: 'tok-3b',
          idempotency_key: null,
          service_id: SERVICE_ID,
          staff_id: STAFF_ID,
          client_id: CLIENT_ID,
          start_at: startAt,
          end_at: endAt,
          occupied_start_at: startAt,
          occupied_end_at: endAt,
          occupied_range: `[${startAt},${endAt})`,
          total_duration_minutes: 60,
          subtotal_cents: 38000,
          discount_cents: 0,
          total_price_cents: 38000,
          deposit_amount_cents: 20000,
          coupon_code: null,
          status: 'confirmed',
          confirmed_via: 'payment',
          checkout_url: 'https://www.mercadopago.com.mx/checkout/v1/redirect?pref_id=mp-123',
          source: 'web',
          client_notes: '',
          internal_notes: '',
          inspo_photo_url: null,
          payment_proof_url: null,
          google_event_id: null,
          cancellation_reason: null,
          rescheduled_from_id: null,
          created_at: '2026-12-01T10:00:00.000Z',
          updated_at: '2026-12-01T10:00:00.000Z',
        },
      ],
      waitlistRows: [
        {
          id: 'wl-3b-1',
          service_id: SERVICE_ID,
          preferred_staff_id: STAFF_ID,
          desired_date: '2026-12-02',
          preferred_window: 'afternoon',
          client_name: 'Renata Silva',
          client_phone_e164: '+522226612009',
          client_email: null,
          notes: '',
          status: 'notified',
          notified_at: '2026-12-01T12:00:00.000Z',
          priority_offer_token: 'offer-tok-10m',
          priority_offer_expires_at: '2026-12-01T12:10:00.000Z',
          priority_offer_slot_start_at: '2026-12-02T22:30:00.000Z',
          created_at: '2026-12-01T10:00:00.000Z',
        },
      ],
      bookingPaymentsRows: [
        {
          id: 'bp-3b-1',
          booking_id: BOOKING_ID,
          provider: 'mercadopago',
          provider_payment_id: 'mp-pay-998877',
          amount_cents: 20000,
          currency: 'MXN',
          status: 'paid',
          proof_url: null,
          checkout_url: 'https://www.mercadopago.com.mx/checkout/v1/redirect?pref_id=mp-123',
          paid_at: '2026-12-01T10:05:00.000Z',
          created_at: '2026-12-01T10:00:00.000Z',
        },
      ],
      calendarConnectionsRows: [
        {
          id: 'cal-3b-1',
          staff_id: STAFF_ID,
          provider: 'google',
          account_email: 'karla@laikonanails.mx',
          access_token_encrypted: 'v1:enc-access',
          refresh_token_encrypted: 'v1:enc-refresh',
          token_expires_at: '2026-12-01T14:00:00.000Z',
          destination_calendar_id: 'primary',
          conflict_calendar_ids: ['primary'],
          available_calendars: [],
          external_busy_blocks: [],
          watch_channel_id: 'chan-1',
          watch_resource_id: 'res-1',
          watch_expiration: '2026-12-08T10:00:00.000Z',
          is_connected: true,
          last_synced_at: '2026-12-01T10:00:00.000Z',
          updated_at: '2026-12-01T10:00:00.000Z',
        },
      ],
    });

    const clock = createFixedClock('2026-12-01T13:00:00.000Z', 'phase3b-0007');
    const repo = createSupabaseRepository(clock, client);
    const snap = await repo.getSnapshot();

    expect(snap.bookings[0]).toMatchObject({
      confirmedVia: 'payment',
      checkoutUrl: 'https://www.mercadopago.com.mx/checkout/v1/redirect?pref_id=mp-123',
    });
    expect(snap.waitlist[0]).toMatchObject({
      priorityOfferToken: 'offer-tok-10m',
      priorityOfferExpiresAt: '2026-12-01T12:10:00.000Z',
      priorityOfferSlotStartAt: '2026-12-02T22:30:00.000Z',
    });
    expect(snap.bookingPayments?.[0]).toMatchObject({
      provider: 'mercadopago',
      providerPaymentId: 'mp-pay-998877',
      status: 'approved',
      checkoutUrl: 'https://www.mercadopago.com.mx/checkout/v1/redirect?pref_id=mp-123',
    });
    expect(snap.calendarConnections[0]).toMatchObject({
      accessTokenEncrypted: 'v1:enc-access',
      refreshTokenEncrypted: 'v1:enc-refresh',
      watchChannelId: 'chan-1',
      watchResourceId: 'res-1',
    });

    const updatedCal = await repo.updateCalendarConnection(STAFF_ID, {
      accessTokenEncrypted: 'v1:new-access',
      refreshTokenEncrypted: 'v1:new-refresh',
      tokenExpiresAt: '2026-12-01T15:00:00.000Z',
      watchChannelId: 'chan-2',
      watchResourceId: 'res-2',
      watchExpiration: '2026-12-09T10:00:00.000Z',
    });
    expect(updatedCal.accessTokenEncrypted).toBe('v1:new-access');
    expect(updatedCal.watchChannelId).toBe('chan-2');

    const calPatch = requests.find(
      (r) => r.method === 'PATCH' && r.path === '/rest/v1/calendar_connections',
    );
    expect(calPatch?.body).toMatchObject({
      access_token_encrypted: 'v1:new-access',
      refresh_token_encrypted: 'v1:new-refresh',
      watch_channel_id: 'chan-2',
      watch_resource_id: 'res-2',
    });
  });

  it('Wave 6 (0008): handles media assets retention/purge, WhatsApp templates & atomic usage RPC, webhook dedup, and keep-alive slot hold cleanup', async () => {
    const bookingRow: Database['public']['Tables']['bookings']['Row'] = {
      id: BOOKING_ID,
      booking_code: 'NL-W60001',
      manage_token: 'tok-w6-media',
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
      deposit_amount_cents: 20000,
      coupon_code: null,
      status: 'confirmed',
      source: 'web',
      client_notes: '',
      internal_notes: '',
      inspo_photo_url: null,
      payment_proof_url: '/api/media/proofs/recibo-w6.png',
      google_event_id: null,
      cancellation_reason: null,
      rescheduled_from_id: null,
      created_at: '2025-11-01T10:00:00.000Z',
      updated_at: '2025-11-01T10:00:00.000Z',
    };

    const { client, requests } = buildMockSupabase({
      bookingsRows: [bookingRow],
      settingsOverrides: {
        retention_notice_email: 'contabilidad@laikonanails.mx',
        whatsapp_monthly_quota: 500,
      },
      whatsappTemplatesRows: [
        {
          id: 'tpl-1',
          trigger_key: 'booking_confirmed',
          template_name: 'laikona_cita_confirmada',
          category: 'UTILITY',
          language_code: 'es_MX',
          is_active: true,
          updated_at: '2026-12-01T10:00:00.000Z',
        },
      ],
    });

    const clock = createFixedClock('2026-12-01T13:00:00.000Z', 'wave6-0008');
    const repo = createSupabaseRepository(clock, client);

    const registered = await repo.registerMediaAsset({
      storagePath: '/api/media/proofs/recibo-w6.png',
      folder: 'proofs',
      bookingId: BOOKING_ID,
      clientId: CLIENT_ID,
      contentType: 'image/png',
      sizeBytes: 12345,
      createdAt: '2025-11-01T10:00:00.000Z',
    });
    expect(registered.storagePath).toBe('proofs/recibo-w6.png');

    const owner = await repo.getMediaAccessOwner('proofs/recibo-w6.png');
    expect(owner).toEqual({
      storagePath: 'proofs/recibo-w6.png',
      folder: 'proofs',
      bookingId: BOOKING_ID,
      staffId: STAFF_ID,
      manageToken: 'tok-w6-media',
      clientPhoneE164: '+525511223344',
    });

    const retentionAssets = await repo.listMediaAssetsForRetention();
    expect(retentionAssets).toHaveLength(1);

    const warned = await repo.markMediaRetentionWarned(
      registered.id,
      '30d',
      '2026-11-01T09:00:00.000Z',
    );
    expect(warned?.retentionWarned30dAt).toBe('2026-11-01T09:00:00.000Z');
    const warnAuditCount = requests.filter(
      (r) =>
        r.method === 'POST' &&
        r.path === '/rest/v1/audit_logs' &&
        (r.body as Record<string, unknown>)?.action === 'media_retention_warned',
    ).length;
    expect(warnAuditCount).toBe(1);

    await repo.markMediaRetentionWarned(registered.id, '30d', '2026-11-02T09:00:00.000Z');
    const warnAuditCountAfterRepeat = requests.filter(
      (r) =>
        r.method === 'POST' &&
        r.path === '/rest/v1/audit_logs' &&
        (r.body as Record<string, unknown>)?.action === 'media_retention_warned',
    ).length;
    expect(warnAuditCountAfterRepeat).toBe(1);

    const purged = await repo.markMediaAssetPurged(
      registered.id,
      '2026-12-01T09:00:00.000Z',
    );
    expect(purged?.purgedAt).toBe('2026-12-01T09:00:00.000Z');
    expect(
      requests.some(
        (r) =>
          r.method === 'PATCH' &&
          r.path === '/rest/v1/bookings' &&
          (r.body as Record<string, unknown>)?.payment_proof_url === null,
      ),
    ).toBe(true);
    expect(
      requests.some((r) => r.method === 'DELETE' && r.path === '/rest/v1/bookings'),
    ).toBe(false);

    const templates = await repo.getWhatsAppTemplates();
    expect(templates).toHaveLength(1);
    expect(templates[0]?.templateName).toBe('laikona_cita_confirmada');

    const usageBefore = await repo.getWhatsAppMonthlyUsage('2026-12');
    expect(usageBefore).toMatchObject({
      monthKey: '2026-12',
      sentCount: 0,
      quotaLimit: 500,
      alertLevel: 'ok',
    });

    const usageAfter400 = await repo.incrementWhatsAppMonthlyUsage('2026-12', 400);
    expect(usageAfter400).toMatchObject({
      monthKey: '2026-12',
      sentCount: 400,
      quotaLimit: 500,
      percentUsed: 80,
      alertLevel: 'warning_80',
    });

    const usageAfter500 = await repo.incrementWhatsAppMonthlyUsage('2026-12', 100);
    expect(usageAfter500).toMatchObject({
      monthKey: '2026-12',
      sentCount: 500,
      quotaLimit: 500,
      percentUsed: 100,
      alertLevel: 'limit_100',
    });

    expect(await repo.claimWebhookEventIdempotent('whatsapp', 'evt-1')).toBe(true);
    expect(await repo.claimWebhookEventIdempotent('whatsapp', 'evt-1')).toBe(false);

    const cleanupOk = await repo.cleanupExpiredSlotHolds();
    expect(cleanupOk).toEqual({ cleanedCount: 1, dbAlive: true });

    const failingMock = buildMockSupabase({
      rpcHandlers: {
        purge_expired_slot_holds: () => ({
          status: 503,
          data: { message: 'database unavailable' },
        }),
      },
    });
    const failingRepo = createSupabaseRepository(clock, failingMock.client);
    expect(await failingRepo.cleanupExpiredSlotHolds()).toEqual({
      cleanedCount: 0,
      dbAlive: false,
    });
  });
});
