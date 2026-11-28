import { createClient } from '@supabase/supabase-js';
import { describe, expect, it } from 'vitest';
import { createFixedClock } from '../clock';
import { zonedDateTimeToUtc } from '../availability/engine';
import { dispatchOutboxEvent } from '../use-cases/outbox';
import { createInitialDemoDatabase } from '../demo-seed';
import type { Database } from './database.types';
import { PolicyError, SlotConflictError } from './port';
import {
  createSupabaseRepository,
  fetchSupabaseBookingById,
  fetchSupabaseBookingPaymentSplits,
  fetchSupabaseBookingStaffId,
  fetchSupabaseClientLoyaltySummary,
  fetchSupabaseOverdueWaitlistContext,
  fetchSupabaseServicesByIds,
  fetchSupabaseTouchUpContext,
} from './supabase-repo';

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
  serviceCategoriesRows?: Array<Database['public']['Tables']['service_categories']['Row']>;
  serviceOverrides?: Partial<Database['public']['Tables']['services']['Row']>;
  extraServicesRows?: Array<Database['public']['Tables']['services']['Row']>;
  extraStaffRows?: Array<Database['public']['Tables']['staff_members']['Row']>;
  clientOverrides?: Partial<Database['public']['Tables']['clients']['Row']>;
  extraClientsRows?: Array<Database['public']['Tables']['clients']['Row']>;
  rulesRows?: Array<Database['public']['Tables']['availability_rules']['Row']>;
  bookingsRows?: Array<Database['public']['Tables']['bookings']['Row']>;
  reviewsRows?: Array<Database['public']['Tables']['booking_reviews']['Row']>;
  funnelEventsRows?: Array<Database['public']['Tables']['funnel_events']['Row']>;
  outboxRows?: Array<Database['public']['Tables']['outbox_events']['Row']>;
  paymentSplitsRows?: Array<Database['public']['Tables']['payment_splits']['Row']>;
  recurringBlocksRows?: Array<Database['public']['Tables']['recurring_blocks']['Row']>;
  loyaltyProgramsRows?: Array<Database['public']['Tables']['loyalty_programs']['Row']>;
  loyaltyStampsRows?: Array<Database['public']['Tables']['loyalty_stamps']['Row']>;
  couponsRows?: Array<Database['public']['Tables']['coupons']['Row']>;
  couponRedemptionsRows?: Array<Database['public']['Tables']['coupon_redemptions']['Row']>;
  cashEntriesRows?: Array<Database['public']['Tables']['cash_register_entries']['Row']>;
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
  workflowsRows?: Array<Database['public']['Tables']['notification_workflows']['Row']>;
  scheduledNotificationsRows?: Array<
    Database['public']['Tables']['scheduled_notifications']['Row']
  >;
  webhookInsertStatus?: number;
} = {}) {
  const requests: RecordedRequest[] = [];
  const serviceCategoriesRows = [...(options.serviceCategoriesRows ?? [])];
  const bookingsRows = options.bookingsRows ?? [];
  const reviewsRows = options.reviewsRows ?? [];
  const funnelEventsRows = options.funnelEventsRows ?? [];
  const outboxRows = options.outboxRows ?? [];
  const extraServicesRows = options.extraServicesRows ?? [];
  const paymentSplitsRows = options.paymentSplitsRows ?? [];
  const recurringBlocksRows = options.recurringBlocksRows ?? [];
  const loyaltyProgramsRows = options.loyaltyProgramsRows ?? [];
  const loyaltyStampsRows = options.loyaltyStampsRows ?? [];
  const couponsRows = [...(options.couponsRows ?? [])];
  const couponRedemptionsRows = [...(options.couponRedemptionsRows ?? [])];
  const cashEntriesRows = [...(options.cashEntriesRows ?? [])];
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
  const workflowsRows = options.workflowsRows ?? [];
  const scheduledNotificationsRows = [...(options.scheduledNotificationsRows ?? [])];
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

  const allClientsRows: Array<Database['public']['Tables']['clients']['Row']> = [
    clientRow,
    ...(options.extraClientsRows ?? []),
  ];

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
    if (table === 'service_categories') {
      if (method === 'HEAD') {
        return new Response(null, {
          status: 200,
          headers: { 'Content-Range': `*/${serviceCategoriesRows.length}` },
        });
      }
      if (method === 'POST' && rawBody && typeof rawBody === 'object') {
        const body = rawBody as Record<string, unknown>;
        const created: Database['public']['Tables']['service_categories']['Row'] = {
          id: `cat-sb-${serviceCategoriesRows.length + 1}`,
          name: String(body.name ?? ''),
          slug: String(body.slug ?? 'categoria'),
          display_order: Number(body.display_order ?? 0),
        };
        serviceCategoriesRows.push(created);
        return jsonResponse(wantsSingleObject ? created : [created], 201);
      }
      if (method === 'PATCH' && rawBody && typeof rawBody === 'object') {
        const idFilter = url.searchParams.get('id')?.replace(/^eq\./, '');
        const target = serviceCategoriesRows.find((c) => c.id === idFilter);
        if (!target) {
          return jsonResponse(
            { code: 'PGRST116', message: 'The result contains 0 rows' },
            406,
          );
        }
        const merged = { ...target, ...(rawBody as Record<string, unknown>) };
        Object.assign(target, merged);
        return jsonResponse(wantsSingleObject ? merged : [merged]);
      }
      return jsonResponse(
        wantsSingleObject ? serviceCategoriesRows[0] ?? null : serviceCategoriesRows,
      );
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
      const slugFilter = url.searchParams.get('slug');
      const activeFilter = url.searchParams.get('is_active');
      if (idFilter?.startsWith('eq.')) {
        const targetId = idFilter.slice(3);
        const matched = allServicesRows.filter((s) => s.id === targetId);
        return jsonResponse(wantsSingleObject ? matched[0] ?? null : matched);
      }
      if (idFilter?.startsWith('in.(') && idFilter.endsWith(')')) {
        const ids = new Set(idFilter.slice(4, -1).split(','));
        return jsonResponse(allServicesRows.filter((s) => ids.has(s.id)));
      }
      if (slugFilter?.startsWith('eq.')) {
        const targetSlug = slugFilter.slice(3);
        let matched = allServicesRows.filter((s) => s.slug === targetSlug);
        if (activeFilter === 'eq.true') {
          matched = matched.filter((s) => s.is_active);
        }
        return jsonResponse(wantsSingleObject ? matched[0] ?? null : matched);
      }
      return jsonResponse(wantsSingleObject ? serviceRow : allServicesRows);
    }
    if (table === 'staff_members') {
      const allStaff = [staffRow, ...(options.extraStaffRows ?? [])];
      const idFilter = url.searchParams.get('id')?.replace(/^eq\./, '');
      const filtered = idFilter ? allStaff.filter((s) => s.id === idFilter) : allStaff;
      return jsonResponse(wantsSingleObject ? filtered[0] ?? null : filtered);
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
      let filtered = [...waitlistRows];
      const statusFilter = url.searchParams.get('status');
      if (statusFilter?.startsWith('eq.')) {
        const target = statusFilter.slice(3);
        filtered = filtered.filter((w) => w.status === target);
      }
      const expFilter = url.searchParams.get('priority_offer_expires_at');
      if (expFilter?.startsWith('gt.')) {
        const gtIso = expFilter.slice(3);
        filtered = filtered.filter(
          (w) =>
            typeof w.priority_offer_expires_at === 'string' &&
            w.priority_offer_expires_at > gtIso,
        );
      } else if (expFilter?.startsWith('lte.')) {
        const lteIso = expFilter.slice(4);
        filtered = filtered.filter(
          (w) =>
            typeof w.priority_offer_expires_at === 'string' &&
            w.priority_offer_expires_at <= lteIso,
        );
      }
      return jsonResponse(filtered);
    }
    if (table === 'booking_payments') {
      let filtered = [...bookingPaymentsRows];
      const providerFilter = url.searchParams.get('provider')?.replace(/^eq\./, '');
      const paymentIdFilter = url.searchParams
        .get('provider_payment_id')
        ?.replace(/^eq\./, '');
      const statusFilter = url.searchParams.get('status');
      if (providerFilter) filtered = filtered.filter((p) => p.provider === providerFilter);
      if (paymentIdFilter) {
        filtered = filtered.filter((p) => p.provider_payment_id === paymentIdFilter);
      }
      if (statusFilter?.startsWith('eq.')) {
        filtered = filtered.filter((p) => p.status === statusFilter.slice(3));
      } else if (statusFilter?.startsWith('in.(') && statusFilter.endsWith(')')) {
        const allowed = new Set(statusFilter.slice(4, -1).split(','));
        filtered = filtered.filter((p) => allowed.has(p.status));
      }
      return jsonResponse(wantsSingleObject ? filtered[0] ?? null : filtered);
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
      let filtered = [...calendarConnectionsRows];
      const watchFilter = url.searchParams.get('watch_channel_id')?.replace(/^eq\./, '');
      const connectedFilter = url.searchParams.get('is_connected');
      if (watchFilter) {
        filtered = filtered.filter((c) => c.watch_channel_id === watchFilter);
      }
      if (connectedFilter === 'eq.true') {
        filtered = filtered.filter((c) => c.is_connected);
      }
      return jsonResponse(wantsSingleObject ? filtered[0] ?? null : filtered);
    }
    if (table === 'clients') {
      const idParams = url.searchParams.getAll('id');
      const eqId = idParams.find((v) => v.startsWith('eq.'))?.slice(3);
      const neqId = idParams.find((v) => v.startsWith('neq.'))?.slice(4);
      const phoneInParam = url.searchParams.get('phone_e164');

      if (method === 'PATCH' && rawBody && typeof rawBody === 'object') {
        const target = eqId
          ? allClientsRows.find((c) => c.id === eqId)
          : allClientsRows[0];
        if (!target) {
          return jsonResponse(
            { code: 'PGRST116', message: 'The result contains 0 rows' },
            406,
          );
        }
        const merged = { ...target, ...(rawBody as Record<string, unknown>) };
        Object.assign(target, merged);
        return jsonResponse(wantsSingleObject ? merged : [merged]);
      }
      if (method === 'DELETE') {
        const idx = allClientsRows.findIndex((c) => c.id === eqId);
        if (idx === -1) {
          return jsonResponse(
            { code: 'PGRST116', message: 'The result contains 0 rows' },
            406,
          );
        }
        const [removed] = allClientsRows.splice(idx, 1);
        return jsonResponse(wantsSingleObject ? removed : [removed]);
      }
      if (method === 'POST') {
        return jsonResponse(wantsSingleObject ? clientRow : [clientRow], 201);
      }
      let filtered = [...allClientsRows];
      if (eqId) filtered = filtered.filter((c) => c.id === eqId);
      if (neqId) filtered = filtered.filter((c) => c.id !== neqId);
      const idInParam = idParams.find((v) => v.startsWith('in.(') && v.endsWith(')'));
      if (idInParam) {
        const allowedIds = new Set(idInParam.slice(4, -1).split(','));
        filtered = filtered.filter((c) => allowedIds.has(c.id));
      }
      if (phoneInParam?.startsWith('in.(') && phoneInParam.endsWith(')')) {
        const allowed = new Set(
          phoneInParam
            .slice(4, -1)
            .split(',')
            .map((v) => v.replace(/^"|"$/g, '')),
        );
        filtered = filtered.filter((c) => allowed.has(c.phone_e164));
      }
      if (wantsSingleObject && filtered.length === 0) {
        return jsonResponse(
          { code: 'PGRST116', message: 'The result contains 0 rows' },
          406,
        );
      }
      return jsonResponse(wantsSingleObject ? filtered[0] : filtered);
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
      const idParam = url.searchParams.get('id');
      const clientIdParam = url.searchParams.get('client_id');
      const staffIdFilter = url.searchParams.get('staff_id')?.replace(/^eq\./, '');
      const statusParam = url.searchParams.get('status');
      const startFilters = url.searchParams.getAll('start_at');
      const gteStart = startFilters.find((v) => v.startsWith('gte.'))?.slice(4);
      const lteStart = startFilters.find((v) => v.startsWith('lte.'))?.slice(4);
      let filtered = [...bookingsRows];
      if (idParam?.startsWith('eq.')) {
        const targetId = idParam.slice(3);
        filtered = filtered.filter((b) => b.id === targetId);
      } else if (idParam?.startsWith('in.(') && idParam.endsWith(')')) {
        const ids = new Set(idParam.slice(4, -1).split(','));
        filtered = filtered.filter((b) => ids.has(b.id));
      }
      if (clientIdParam?.startsWith('eq.')) {
        filtered = filtered.filter((b) => b.client_id === clientIdParam.slice(3));
      } else if (clientIdParam?.startsWith('in.(') && clientIdParam.endsWith(')')) {
        const ids = new Set(clientIdParam.slice(4, -1).split(','));
        filtered = filtered.filter((b) => ids.has(b.client_id));
      }
      if (staffIdFilter) filtered = filtered.filter((b) => b.staff_id === staffIdFilter);
      if (statusParam?.startsWith('eq.')) {
        const targetStatus = statusParam.slice(3);
        filtered = filtered.filter((b) => b.status === targetStatus);
      } else if (statusParam?.startsWith('neq.')) {
        const excludedStatus = statusParam.slice(4);
        filtered = filtered.filter((b) => b.status !== excludedStatus);
      } else if (statusParam?.startsWith('in.(') && statusParam.endsWith(')')) {
        const allowed = new Set(statusParam.slice(4, -1).split(','));
        filtered = filtered.filter((b) => allowed.has(b.status));
      }
      if (gteStart) filtered = filtered.filter((b) => b.start_at >= gteStart);
      if (lteStart) filtered = filtered.filter((b) => b.start_at <= lteStart);
      return jsonResponse(wantsSingleObject ? filtered[0] ?? null : filtered);
    }
    if (table === 'booking_reviews') {
      return jsonResponse(wantsSingleObject ? reviewsRows[0] ?? null : reviewsRows);
    }
    if (table === 'funnel_events') {
      return jsonResponse(funnelEventsRows);
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
      const bookingInFilter = url.searchParams.get('booking_id');
      if (bookingInFilter?.startsWith('in.(') && bookingInFilter.endsWith(')')) {
        const ids = new Set(bookingInFilter.slice(4, -1).split(','));
        return jsonResponse(paymentSplitsRows.filter((s) => ids.has(s.booking_id)));
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
    if (table === 'coupons') {
      const idFilter = url.searchParams.get('id')?.replace(/^eq\./, '');
      const codeFilter = url.searchParams.get('code')?.replace(/^eq\./, '');
      if (method === 'PATCH' && rawBody && typeof rawBody === 'object') {
        const target = couponsRows.find((c) => c.id === idFilter);
        if (!target) {
          return jsonResponse(wantsSingleObject ? null : []);
        }
        const merged = { ...target, ...(rawBody as Record<string, unknown>) };
        Object.assign(target, merged);
        return jsonResponse(wantsSingleObject ? merged : [merged]);
      }
      if (method === 'DELETE') {
        const remaining = couponsRows.filter((c) => c.id !== idFilter);
        couponsRows.length = 0;
        couponsRows.push(...remaining);
        return jsonResponse([]);
      }
      let filtered = [...couponsRows];
      if (idFilter) filtered = filtered.filter((c) => c.id === idFilter);
      if (codeFilter) filtered = filtered.filter((c) => c.code === codeFilter);
      return jsonResponse(wantsSingleObject ? filtered[0] ?? null : filtered);
    }
    if (table === 'cash_register_entries') {
      const idFilter = url.searchParams.get('id')?.replace(/^eq\./, '');
      const bookingNullFilter = url.searchParams.get('booking_id');
      if (method === 'PATCH' && rawBody && typeof rawBody === 'object') {
        const target = cashEntriesRows.find(
          (e) => e.id === idFilter && (bookingNullFilter !== 'is.null' || e.booking_id === null),
        );
        if (!target) {
          return jsonResponse(
            { code: 'PGRST116', message: 'The result contains 0 rows' },
            406,
          );
        }
        const merged = { ...target, ...(rawBody as Record<string, unknown>) };
        Object.assign(target, merged);
        return jsonResponse(wantsSingleObject ? merged : [merged]);
      }
      if (method === 'DELETE') {
        const remaining = cashEntriesRows.filter(
          (e) =>
            !(e.id === idFilter && (bookingNullFilter !== 'is.null' || e.booking_id === null)),
        );
        cashEntriesRows.length = 0;
        cashEntriesRows.push(...remaining);
        return jsonResponse([]);
      }
      let filtered = idFilter
        ? cashEntriesRows.filter((e) => e.id === idFilter)
        : [...cashEntriesRows];
      if (bookingNullFilter?.startsWith('in.(') && bookingNullFilter.endsWith(')')) {
        const ids = new Set(bookingNullFilter.slice(4, -1).split(','));
        filtered = filtered.filter((e) => e.booking_id !== null && ids.has(e.booking_id));
      }
      return jsonResponse(wantsSingleObject ? filtered[0] ?? null : filtered);
    }
    if (table === 'coupon_redemptions') {
      if (method === 'DELETE') {
        const couponIdFilter = url.searchParams.get('coupon_id')?.replace(/^eq\./, '');
        const remaining = couponIdFilter
          ? couponRedemptionsRows.filter((r) => r.coupon_id !== couponIdFilter)
          : [];
        couponRedemptionsRows.length = 0;
        couponRedemptionsRows.push(...remaining);
        return jsonResponse([]);
      }
      const clientIdFilter = url.searchParams.get('client_id')?.replace(/^eq\./, '');
      const filtered = clientIdFilter
        ? couponRedemptionsRows.filter((r) => r.client_id === clientIdFilter)
        : couponRedemptionsRows;
      return jsonResponse(filtered);
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
    if (table === 'notification_workflows') {
      let filtered = [...workflowsRows];
      const trigFilter = url.searchParams.get('trigger_event')?.replace(/^eq\./, '');
      const enabledFilter = url.searchParams.get('is_enabled');
      if (trigFilter) filtered = filtered.filter((w) => w.trigger_event === trigFilter);
      if (enabledFilter === 'eq.true') filtered = filtered.filter((w) => w.is_enabled);
      return jsonResponse(filtered);
    }
    if (table === 'scheduled_notifications') {
      if (method === 'PATCH' && rawBody && typeof rawBody === 'object') {
        const idFilter = url.searchParams.get('id')?.replace(/^eq\./, '');
        const target = scheduledNotificationsRows.find((n) => n.id === idFilter);
        if (target) Object.assign(target, rawBody as Record<string, unknown>);
        return jsonResponse(target ? (wantsSingleObject ? target : [target]) : []);
      }
      let filtered = [...scheduledNotificationsRows];
      const statusFilter = url.searchParams.get('status');
      if (statusFilter?.startsWith('eq.')) {
        const target = statusFilter.slice(3);
        filtered = filtered.filter((n) => n.status === target);
      } else if (statusFilter?.startsWith('in.(') && statusFilter.endsWith(')')) {
        const allowed = new Set(statusFilter.slice(4, -1).split(','));
        filtered = filtered.filter((n) => allowed.has(n.status));
      }
      const channelFilter = url.searchParams.get('channel')?.replace(/^eq\./, '');
      if (channelFilter) filtered = filtered.filter((n) => n.channel === channelFilter);
      return jsonResponse(filtered);
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
    expect(templates).toHaveLength(9);
    expect(
      templates.find((tpl) => tpl.triggerKey === 'booking_confirmed')?.templateName,
    ).toBe('laikona_cita_confirmada');

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

  it('creates and renames service menu categories via service_categories table', async () => {
    const existingCategoryId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1';
    const { client, requests } = buildMockSupabase({
      serviceCategoriesRows: [
        {
          id: existingCategoryId,
          name: 'Uñas & Esculturales',
          slug: 'unas-esculturales',
          display_order: 0,
        },
        {
          id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2',
          name: 'Gel & Retiro',
          slug: 'gel-retiro',
          display_order: 1,
        },
      ],
    });
    const clock = createFixedClock('2026-12-01T13:00:00.000Z', 'categories-test');
    const repo = createSupabaseRepository(clock, client);

    const createdAutoOrder = await repo.upsertServiceCategory({ name: '  Pestañas  ' });
    expect(createdAutoOrder.name).toBe('Pestañas');
    expect(createdAutoOrder.displayOrder).toBe(2);
    expect(createdAutoOrder.slug).toMatch(/^pestanas-[a-z0-9]{4}$/);

    const createdExplicitOrder = await repo.upsertServiceCategory({
      name: '💅✨',
      displayOrder: 4,
    });
    expect(createdExplicitOrder.name).toBe('💅✨');
    expect(createdExplicitOrder.displayOrder).toBe(4);
    expect(createdExplicitOrder.slug).toMatch(/^categoria-[a-z0-9]{4}$/);

    const renamed = await repo.upsertServiceCategory({
      id: existingCategoryId,
      name: '  Uñas Acrílicas  ',
    });
    expect(renamed).toEqual({
      id: existingCategoryId,
      name: 'Uñas Acrílicas',
      slug: 'unas-esculturales',
      displayOrder: 0,
    });

    const patchReq = requests.find(
      (r) => r.method === 'PATCH' && r.path === '/rest/v1/service_categories',
    );
    expect(patchReq?.body).toEqual({ name: 'Uñas Acrílicas' });

    await expect(
      repo.upsertServiceCategory({
        id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaa999',
        name: 'No Existe',
      }),
    ).rejects.toMatchObject({ code: 'CATEGORY_UPDATE_FAILED' });
  });

  it('keeps createBookingAtomic, getBookingByToken, and targeted helpers within Cloudflare Workers subrequest budgets without full-DB snapshot scans', async () => {
    const startAt = zonedDateTimeToUtc('2026-12-01', '10:00', TZ).toISOString();
    const endAt = zonedDateTimeToUtc('2026-12-01', '11:00', TZ).toISOString();
    const occEndAt = zonedDateTimeToUtc('2026-12-01', '11:15', TZ).toISOString();

    const createdBookingRow: Database['public']['Tables']['bookings']['Row'] = {
      id: BOOKING_ID,
      booking_code: 'NL-FAST01',
      manage_token: 'tok-fast-123',
      idempotency_key: 'idem-fast-1',
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
      loyaltyProgramsRows: [
        {
          id: PROGRAM_ID,
          is_active: true,
          name: 'Sellos LAIKONA',
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
          created_at: '2026-12-01T10:00:00.000Z',
        },
      ],
      rpcHandlers: {
        create_booking_atomic: () => ({ status: 200, data: BOOKING_ID }),
      },
    });
    const clock = createFixedClock('2026-12-01T13:00:00.000Z', 'budget-check');
    const repo = createSupabaseRepository(clock, client);

    const created = await repo.createBookingAtomic({
      serviceId: SERVICE_ID,
      addonIds: [],
      staffId: STAFF_ID,
      startAt,
      clientName: 'Sofía Ramírez',
      clientPhone: '5511223344',
      sessionToken: 'sess-budget-1',
      holdId: HOLD_ID,
      idempotencyKey: 'idem-fast-1',
      privacyConsentAccepted: true,
    });

    expect(created.id).toBe(BOOKING_ID);
    expect(created.manageToken).toBe('tok-fast-123');
    expect(requests.length).toBeLessThanOrEqual(25);
    const scannedPaths = new Set(requests.map((r) => r.path));
    expect(scannedPaths.has('/rest/v1/audit_logs')).toBe(false);
    expect(scannedPaths.has('/rest/v1/funnel_events')).toBe(false);
    expect(scannedPaths.has('/rest/v1/inventory_items')).toBe(false);
    expect(scannedPaths.has('/rest/v1/cash_register_entries')).toBe(false);
    expect(scannedPaths.has('/rest/v1/gallery_items')).toBe(false);

    const beforeTokenIdx = requests.length;
    const byToken = await repo.getBookingByToken('tok-fast-123');
    const tokenRequests = requests.slice(beforeTokenIdx);
    expect(byToken?.id).toBe(BOOKING_ID);
    expect(byToken?.service.id).toBe(SERVICE_ID);
    expect(byToken?.staff.id).toBe(STAFF_ID);
    expect(byToken?.client.id).toBe(CLIENT_ID);
    expect(tokenRequests.length).toBeLessThanOrEqual(8);
    expect(tokenRequests.some((r) => r.path === '/rest/v1/audit_logs')).toBe(false);

    const beforeMissingIdx = requests.length;
    const emptyMock = buildMockSupabase({ bookingsRows: [] });
    const emptyRepo = createSupabaseRepository(clock, emptyMock.client);
    expect(await emptyRepo.getBookingByToken('missing-token')).toBeNull();
    expect(emptyMock.requests).toHaveLength(1);
    expect(requests.length).toBe(beforeMissingIdx);

    const beforeHelpersIdx = requests.length;
    const fetchedServices = await fetchSupabaseServicesByIds([SERVICE_ID], client);
    const loyalty = await fetchSupabaseClientLoyaltySummary(CLIENT_ID, client);
    const helperRequests = requests.slice(beforeHelpersIdx);
    expect(fetchedServices.map((s) => s.id)).toEqual([SERVICE_ID]);
    expect(loyalty?.currentStamps).toBe(1);
    expect(helperRequests.length).toBeLessThanOrEqual(4);
  });

  it('keeps updateBookingStatus, manageClientBookingAction, and targeted payment/staff helpers under Cloudflare subrequest limits without snapshot scans', async () => {
    const futureStartAt = zonedDateTimeToUtc('2026-12-03', '11:00', TZ).toISOString();
    const futureEndAt = zonedDateTimeToUtc('2026-12-03', '12:00', TZ).toISOString();
    const futureOccEndAt = zonedDateTimeToUtc('2026-12-03', '12:15', TZ).toISOString();

    const pendingBookingRow: Database['public']['Tables']['bookings']['Row'] = {
      id: BOOKING_ID,
      booking_code: 'NL-CONF01',
      manage_token: 'tok-conf-123',
      idempotency_key: 'idem-conf-1',
      service_id: SERVICE_ID,
      staff_id: STAFF_ID,
      client_id: CLIENT_ID,
      start_at: futureStartAt,
      end_at: futureEndAt,
      occupied_start_at: futureStartAt,
      occupied_end_at: futureOccEndAt,
      occupied_range: `[${futureStartAt},${futureOccEndAt})`,
      total_duration_minutes: 60,
      subtotal_cents: 50000,
      discount_cents: 0,
      total_price_cents: 50000,
      deposit_amount_cents: 20000,
      coupon_code: null,
      status: 'pending_confirmation',
      source: 'web',
      client_notes: '',
      internal_notes: '',
      inspo_photo_url: null,
      payment_proof_url: '/api/media/proofs/comprobante.png',
      proof_delivery_method: 'web_upload',
      google_event_id: null,
      cancellation_reason: null,
      rescheduled_from_id: null,
      created_at: '2026-12-01T10:00:00.000Z',
      updated_at: '2026-12-01T10:00:00.000Z',
    };

    const { client, requests } = buildMockSupabase({
      bookingsRows: [pendingBookingRow],
      paymentSplitsRows: [],
    });
    const clock = createFixedClock('2026-12-01T13:00:00.000Z', 'confirm-budget');
    const repo = createSupabaseRepository(clock, client);

    const confirmed = await repo.updateBookingStatus({
      bookingId: BOOKING_ID,
      status: 'confirmed',
      recordedBy: 'Dueña',
      actor: {
        id: 'adm-owner',
        email: 'duena@nails.studio',
        role: 'owner',
        fullName: 'Dueña',
      },
    });

    expect(confirmed.status).toBe('confirmed');
    expect(confirmed.confirmedVia).toBe('manual');
    expect(requests.length).toBeLessThanOrEqual(16);

    const scannedPaths = new Set(requests.map((r) => r.path));
    expect(scannedPaths.has('/rest/v1/funnel_events')).toBe(false);
    expect(scannedPaths.has('/rest/v1/inventory_items')).toBe(false);
    expect(scannedPaths.has('/rest/v1/gallery_items')).toBe(false);
    expect(scannedPaths.has('/rest/v1/waitlist_entries')).toBe(false);
    expect(scannedPaths.has('/rest/v1/consents')).toBe(false);

    const bookingPatch = requests.find(
      (r) => r.method === 'PATCH' && r.path === '/rest/v1/bookings',
    );
    expect(bookingPatch?.body).toMatchObject({
      status: 'confirmed',
      confirmed_via: 'manual',
    });

    const splitPost = requests.find(
      (r) => r.method === 'POST' && r.path === '/rest/v1/payment_splits',
    );
    expect(splitPost?.body).toEqual([
      expect.objectContaining({
        booking_id: BOOKING_ID,
        method: 'transfer',
        amount_cents: 20000,
        reference: 'Anticipo SPEI aprobado',
      }),
    ]);

    const depositCashPost = requests.find(
      (r) => r.method === 'POST' && r.path === '/rest/v1/cash_register_entries',
    );
    expect(depositCashPost?.body).toEqual(
      expect.objectContaining({
        booking_id: BOOKING_ID,
        entry_type: 'deposit',
        amount_cents: 20000,
        commission_cents: 0,
        payment_method: 'transfer',
      }),
    );

    const auditPost = requests.find(
      (r) => r.method === 'POST' && r.path === '/rest/v1/audit_logs',
    );
    expect(auditPost?.body).toEqual([
      expect.objectContaining({
        action: 'deposit_approved',
        entity_id: BOOKING_ID,
      }),
    ]);

    const pastBookingRow: Database['public']['Tables']['bookings']['Row'] = {
      ...pendingBookingRow,
      start_at: '2026-11-20T16:00:00.000Z',
      end_at: '2026-11-20T17:00:00.000Z',
      occupied_start_at: '2026-11-20T16:00:00.000Z',
      occupied_end_at: '2026-11-20T17:15:00.000Z',
      occupied_range: '[2026-11-20T16:00:00.000Z,2026-11-20T17:15:00.000Z)',
    };
    const pastMock = buildMockSupabase({ bookingsRows: [pastBookingRow] });
    const pastRepo = createSupabaseRepository(clock, pastMock.client);

    await expect(
      pastRepo.updateBookingStatus({
        bookingId: BOOKING_ID,
        status: 'confirmed',
        actor: {
          id: 'adm-spec',
          email: 'spec@nails.studio',
          role: 'specialist',
        },
      }),
    ).rejects.toMatchObject({ code: 'PAST_BOOKING_LOCKED' });
    expect(pastMock.requests.length).toBeLessThanOrEqual(10);

    const beforeAttendanceIdx = requests.length;
    const attended = await repo.manageClientBookingAction({
      token: 'tok-conf-123',
      action: 'confirm_attendance',
      confirmedVia: 'whatsapp',
    });
    const attendanceRequests = requests.slice(beforeAttendanceIdx);
    expect(attended.attendanceStatus).toBe('confirmed');
    expect(attended.confirmedVia).toBe('whatsapp');
    expect(attendanceRequests.length).toBeLessThanOrEqual(10);
    expect(attendanceRequests.some((r) => r.path === '/rest/v1/gallery_items')).toBe(false);

    const splitsMock = buildMockSupabase({
      bookingsRows: [pendingBookingRow],
      paymentSplitsRows: [
        {
          id: SPLIT_ID,
          booking_id: BOOKING_ID,
          method: 'transfer',
          amount_cents: 20000,
          tip_cents: 0,
          tip_staff_id: null,
          reference: 'Anticipo SPEI aprobado',
          created_at: '2026-12-01T13:00:00.000Z',
        },
      ],
    });
    const splits = await fetchSupabaseBookingPaymentSplits(BOOKING_ID, splitsMock.client);
    expect(splits).toHaveLength(1);
    expect(splits[0]?.amountCents).toBe(20000);
    expect(splitsMock.requests).toHaveLength(1);

    const staffOwner = await fetchSupabaseBookingStaffId(BOOKING_ID, splitsMock.client);
    expect(staffOwner).toBe(STAFF_ID);
    expect(splitsMock.requests).toHaveLength(2);

    const fetchedBooking = await fetchSupabaseBookingById(BOOKING_ID, splitsMock.client);
    expect(fetchedBooking?.id).toBe(BOOKING_ID);
    expect(splitsMock.requests.length).toBeLessThanOrEqual(10);
  });

  it('deleteCoupon removes coupon_redemptions before deleting coupon with targeted queries and updateSalonSettings persists showBookingQr and touchUpDays', async () => {
    const couponRow: Database['public']['Tables']['coupons']['Row'] = {
      id: COUPON_ID,
      code: 'PROMO25',
      kind: 'coupon',
      discount_type: 'percent',
      discount_value: 25,
      remaining_balance_cents: null,
      max_uses: 10,
      used_count: 1,
      min_subtotal_cents: 0,
      expires_at: null,
      recipient_name: null,
      is_active: true,
      created_at: '2026-12-01T10:00:00.000Z',
    };
    const redemptionRow: Database['public']['Tables']['coupon_redemptions']['Row'] = {
      id: REDEMPTION_ID,
      coupon_id: COUPON_ID,
      booking_id: BOOKING_ID,
      client_id: CLIENT_ID,
      amount_cents: 5000,
      status: 'active',
      created_at: '2026-12-01T11:00:00.000Z',
      released_at: null,
    };

    const { client, requests } = buildMockSupabase({
      couponsRows: [couponRow],
      couponRedemptionsRows: [redemptionRow],
    });
    const clock = createFixedClock('2026-12-01T13:00:00.000Z', 'wave3-supabase');
    const repo = createSupabaseRepository(clock, client);

    const deleted = await repo.deleteCoupon(COUPON_ID);
    expect(deleted.id).toBe(COUPON_ID);
    expect(deleted.code).toBe('PROMO25');
    expect(requests).toHaveLength(3);
    expect(requests[0]?.method).toBe('GET');
    expect(requests[0]?.path).toBe('/rest/v1/coupons');
    expect(requests[1]?.method).toBe('DELETE');
    expect(requests[1]?.path).toBe('/rest/v1/coupon_redemptions');
    expect(requests[2]?.method).toBe('DELETE');
    expect(requests[2]?.path).toBe('/rest/v1/coupons');

    await expect(repo.deleteCoupon(COUPON_ID)).rejects.toMatchObject({
      code: 'COUPON_NOT_FOUND',
    });

    const beforeSettingsIdx = requests.length;
    const updatedSettings = await repo.updateSalonSettings({
      landingContent: {
        showBookingQr: false,
        touchUpDays: 28,
      },
    });
    expect(updatedSettings.landingContent.showBookingQr).toBe(false);
    expect(updatedSettings.landingContent.touchUpDays).toBe(28);
    expect(updatedSettings.landingContent.heroTitle).toBe('Title');
    const settingsPatch = requests
      .slice(beforeSettingsIdx)
      .find((r) => r.method === 'PATCH' && r.path === '/rest/v1/salon_settings');
    expect(settingsPatch?.body).toMatchObject({
      landing_content: expect.objectContaining({
        heroTitle: 'Title',
        showBookingQr: false,
        touchUpDays: 28,
      }),
    });
  });

  it('updateSalonSettings serializes cajaConfig inside landing_content and keeps it on later landing patches', async () => {
    const { client, requests } = buildMockSupabase({});
    const clock = createFixedClock('2026-12-01T13:00:00.000Z', 'caja-config-supabase');
    const repo = createSupabaseRepository(clock, client);
    const cajaConfig = {
      openingFloatCents: 50_000,
      expenseCategories: ['Acetona', 'Algodón'],
      retailCommissionPercent: 12,
      defaultPeriod: 'today' as const,
      closeSummary: { includeStaffBreakdown: true, includeTips: false, includePending: true },
    };

    const saved = await repo.updateSalonSettings({ landingContent: { cajaConfig } });
    expect(saved.landingContent.cajaConfig).toEqual(cajaConfig);
    const firstPatch = requests.find(
      (r) => r.method === 'PATCH' && r.path === '/rest/v1/salon_settings',
    );
    expect(firstPatch?.body).toMatchObject({
      landing_content: expect.objectContaining({ cajaConfig }),
    });

    const stored = buildMockSupabase({
      settingsOverrides: {
        landing_content: {
          heroEyebrow: '',
          heroTitle: 'Title',
          heroSubtitle: '',
          aboutTitle: '',
          aboutBody: '',
          cajaConfig,
        },
      },
    });
    const storedRepo = createSupabaseRepository(clock, stored.client);
    const next = await storedRepo.updateSalonSettings({ landingContent: { touchUpDays: 30 } });
    expect(next.landingContent.touchUpDays).toBe(30);
    expect(next.landingContent.cajaConfig).toEqual(cajaConfig);
    const secondPatch = stored.requests.find(
      (r) => r.method === 'PATCH' && r.path === '/rest/v1/salon_settings',
    );
    expect(secondPatch?.body).toMatchObject({
      landing_content: expect.objectContaining({ cajaConfig, touchUpDays: 30 }),
    });
  });

  it('Wave 4 Supabase: edits coupons with duplicate-code guard, edits/deletes manual cash entries in <=2 queries, and blocks booking-linked cash mutations', async () => {
    const secondCouponId = '99999999-9999-4999-8999-999999999990';
    const manualCashId = '88888888-8888-4888-8888-888888888881';
    const bookingCashId = '88888888-8888-4888-8888-888888888882';

    const { client, requests } = buildMockSupabase({
      couponsRows: [
        {
          id: COUPON_ID,
          code: 'VIP10',
          kind: 'coupon',
          discount_type: 'percent',
          discount_value: 10,
          remaining_balance_cents: null,
          max_uses: 20,
          used_count: 2,
          min_subtotal_cents: 30000,
          expires_at: null,
          recipient_name: null,
          is_active: true,
          created_at: '2026-12-01T10:00:00.000Z',
        },
        {
          id: secondCouponId,
          code: 'GIFT500',
          kind: 'gift_card',
          discount_type: 'fixed_cents',
          discount_value: 50000,
          remaining_balance_cents: 50000,
          max_uses: 1,
          used_count: 0,
          min_subtotal_cents: 0,
          expires_at: null,
          recipient_name: 'Ana',
          is_active: true,
          created_at: '2026-12-01T10:00:00.000Z',
        },
      ],
      cashEntriesRows: [
        {
          id: manualCashId,
          booking_id: null,
          staff_id: null,
          entry_type: 'expense',
          description: 'Limas y acetona',
          amount_cents: 15000,
          tip_cents: 0,
          commission_cents: 0,
          payment_method: 'cash',
          occurred_at: '2026-12-01T12:00:00.000Z',
          recorded_by: 'Dueña',
          created_at: '2026-12-01T12:00:00.000Z',
        },
        {
          id: bookingCashId,
          booking_id: BOOKING_ID,
          staff_id: STAFF_ID,
          entry_type: 'service_income',
          description: 'Rubber — Sofía',
          amount_cents: 38000,
          tip_cents: 5000,
          commission_cents: 15200,
          payment_method: 'card',
          occurred_at: '2026-12-01T12:30:00.000Z',
          recorded_by: 'Dueña',
          created_at: '2026-12-01T12:30:00.000Z',
        },
      ],
    });
    const clock = createFixedClock('2026-12-01T13:00:00.000Z', 'wave4-supabase');
    const repo = createSupabaseRepository(clock, client);

    const updatedCoupon = await repo.upsertCoupon({
      id: COUPON_ID,
      code: '  vip10  ',
      kind: 'coupon',
      discountType: 'percent',
      discountValue: 15,
      remainingBalanceCents: null,
      maxUses: 30,
      minSubtotalCents: 40000,
      expiresAt: null,
      recipientName: null,
      isActive: false,
    });
    expect(updatedCoupon.code).toBe('VIP10');
    expect(updatedCoupon.discountValue).toBe(15);
    expect(updatedCoupon.minSubtotalCents).toBe(40000);
    expect(updatedCoupon.isActive).toBe(false);
    expect(requests.length).toBeLessThanOrEqual(2);

    await expect(
      repo.upsertCoupon({
        id: COUPON_ID,
        code: 'gift500',
        kind: 'coupon',
        discountType: 'percent',
        discountValue: 15,
        remainingBalanceCents: null,
        maxUses: 30,
        minSubtotalCents: 40000,
        expiresAt: null,
        recipientName: null,
        isActive: true,
      }),
    ).rejects.toMatchObject({ code: 'COUPON_CODE_EXISTS' });

    const beforeCashEditIdx = requests.length;
    const editedManual = await repo.updateCashEntry(manualCashId, {
      description: 'Insumos de esterilización',
      amountCents: 22000,
      paymentMethod: 'transfer',
    });
    expect(editedManual.description).toBe('Insumos de esterilización');
    expect(editedManual.amountCents).toBe(22000);
    expect(editedManual.paymentMethod).toBe('transfer');
    expect(requests.slice(beforeCashEditIdx)).toHaveLength(2);

    await expect(
      repo.updateCashEntry(bookingCashId, { amountCents: 100 }),
    ).rejects.toMatchObject({ code: 'BOOKING_LINKED_ENTRY_IMMUTABLE' });

    await expect(repo.deleteCashEntry(bookingCashId)).rejects.toMatchObject({
      code: 'BOOKING_LINKED_ENTRY_IMMUTABLE',
    });

    const beforeCashDelIdx = requests.length;
    const deletedManual = await repo.deleteCashEntry(manualCashId);
    expect(deletedManual.id).toBe(manualCashId);
    expect(requests.slice(beforeCashDelIdx)).toHaveLength(2);

    await expect(repo.deleteCashEntry(manualCashId)).rejects.toMatchObject({
      code: 'CASH_ENTRY_NOT_FOUND',
    });
    expect(requests.some((r) => r.path === '/rest/v1/gallery_items')).toBe(false);
  });

  it('Wave 5: enforces targeted subrequest budgets for client edit/delete, inactive clients with lastServiceName, near-reward, and ARCO export', async () => {
    const emptyClientId = '33333333-3333-4333-8333-333333333399';
    const inactiveBooking: Database['public']['Tables']['bookings']['Row'] = {
      id: BOOKING_ID,
      booking_code: 'LKN-5001',
      manage_token: 'tok-wave5',
      idempotency_key: null,
      service_id: SERVICE_ID,
      extra_service_ids: [],
      staff_id: STAFF_ID,
      client_id: CLIENT_ID,
      client_instagram: '@sofia',
      start_at: '2026-10-15T16:00:00.000Z',
      end_at: '2026-10-15T17:00:00.000Z',
      occupied_start_at: '2026-10-15T16:00:00.000Z',
      occupied_end_at: '2026-10-15T17:15:00.000Z',
      occupied_range: '[2026-10-15T16:00:00.000Z,2026-10-15T17:15:00.000Z)',
      total_duration_minutes: 60,
      custom_duration_minutes: null,
      subtotal_cents: 38000,
      discount_cents: 0,
      total_price_cents: 38000,
      custom_price_cents: null,
      deposit_amount_cents: 10000,
      coupon_code: null,
      status: 'completed',
      source: 'web',
      client_notes: 'Almendra corta',
      internal_notes: 'SECRETO INTERNO NO EXPORTABLE',
      inspo_photo_url: null,
      payment_proof_url: null,
      google_event_id: null,
      cancellation_reason: null,
      rescheduled_from_id: null,
      created_at: '2026-10-10T10:00:00.000Z',
      updated_at: '2026-10-15T17:30:00.000Z',
    };

    const { client, requests } = buildMockSupabase({
      extraClientsRows: [
        {
          id: emptyClientId,
          full_name: 'Clienta Sin Historial',
          phone_e164: '+522229991111',
          email: null,
          birthday: null,
          notes: '',
          no_show_count: 0,
          created_at: '2026-11-20T10:00:00.000Z',
          updated_at: '2026-11-20T10:00:00.000Z',
        },
      ],
      bookingsRows: [inactiveBooking],
      consentsRows: [
        {
          id: CONSENT_ID,
          client_id: CLIENT_ID,
          booking_id: BOOKING_ID,
          policy_version: '2026-11',
          accepted_at: '2026-10-10T10:00:00.000Z',
          marketing_opt_in: true,
        },
      ],
      paymentSplitsRows: [
        {
          id: SPLIT_ID,
          booking_id: BOOKING_ID,
          method: 'card',
          amount_cents: 38000,
          tip_cents: 4000,
          tip_staff_id: STAFF_ID,
          reference: null,
          created_at: '2026-10-15T17:10:00.000Z',
        },
      ],
      loyaltyProgramsRows: [
        {
          id: PROGRAM_ID,
          is_active: true,
          name: 'Club LAIKONA',
          stamps_required: 2,
          reward_type: 'free_service',
          reward_service_id: SERVICE_ID,
          discount_percent: null,
          max_discount_cents: null,
          valid_days: 90,
          created_at: '2026-10-01T10:00:00.000Z',
        },
      ],
      loyaltyStampsRows: [
        {
          id: STAMP_ID,
          client_id: CLIENT_ID,
          booking_id: BOOKING_ID,
          program_id: PROGRAM_ID,
          stamped_date: '2026-10-15',
          created_at: '2026-10-15T17:10:00.000Z',
        },
      ],
    });
    const clock = createFixedClock('2026-12-01T13:00:00.000Z', 'wave5-supabase');
    const repo = createSupabaseRepository(clock, client);

    const beforeEdit = requests.length;
    const edited = await repo.updateClientNotes({
      clientId: emptyClientId,
      fullName: '  Clienta Editada  ',
      phone: '222 888 7766',
    });
    expect(edited.fullName).toBe('Clienta Editada');
    expect(edited.phoneE164).toBe('+522228887766');
    expect(requests.slice(beforeEdit)).toHaveLength(2);

    await expect(
      repo.updateClientNotes({
        clientId: emptyClientId,
        phone: '+5215511223344',
      }),
    ).rejects.toMatchObject({ code: 'CLIENT_EXISTS' });

    const beforeList = requests.length;
    const allClients = await repo.listClients();
    expect(allClients).toHaveLength(2);
    expect(requests.slice(beforeList)).toHaveLength(1);

    const beforeNear = requests.length;
    const nearReward = await repo.getNearRewardClients();
    expect(nearReward.some((c) => c.clientId === CLIENT_ID)).toBe(true);
    expect(requests.slice(beforeNear).length).toBeLessThanOrEqual(4);

    const beforeInactive = requests.length;
    const inactive = await repo.getInactiveClients(30);
    const sofiaInactive = inactive.find((c) => c.clientId === CLIENT_ID);
    expect(sofiaInactive?.totalVisits).toBe(1);
    expect(sofiaInactive?.lastServiceId).toBe(SERVICE_ID);
    expect(sofiaInactive?.lastServiceName).toBe('Manicura Rusa + Gelish');
    expect(requests.slice(beforeInactive)).toHaveLength(3);

    const beforeArco = requests.length;
    const arco = await repo.getClientArcoExport(CLIENT_ID);
    expect(arco).not.toBeNull();
    expect(arco?.client.id).toBe(CLIENT_ID);
    expect(arco?.bookings).toHaveLength(1);
    expect(arco?.consents).toHaveLength(1);
    expect(arco?.paymentSplits).toHaveLength(1);
    expect(arco?.loyaltySummary?.currentStamps).toBe(1);
    expect(JSON.stringify(arco)).not.toContain('SECRETO INTERNO');
    expect(requests.slice(beforeArco).length).toBeLessThanOrEqual(8);

    const beforeBlockedDel = requests.length;
    await expect(repo.deleteClientProfile(CLIENT_ID)).rejects.toMatchObject({
      code: 'CLIENT_HAS_HISTORY',
    });
    expect(requests.slice(beforeBlockedDel).length).toBeLessThanOrEqual(3);

    const beforeOkDel = requests.length;
    const removed = await repo.deleteClientProfile(emptyClientId);
    expect(removed.id).toBe(emptyClientId);
    expect(requests.slice(beforeOkDel)).toHaveLength(4);

    await expect(repo.deleteClientProfile(emptyClientId)).rejects.toMatchObject({
      code: 'CLIENT_NOT_FOUND',
    });

    const snapshotOnlyTables = [
      '/rest/v1/gallery_items',
      '/rest/v1/inventory_items',
      '/rest/v1/waitlist_entries',
      '/rest/v1/audit_logs',
      '/rest/v1/funnel_events',
    ];
    for (const tablePath of snapshotOnlyTables) {
      expect(requests.some((r) => r.path === tablePath)).toBe(false);
    }
  });

  it('Phase 0 (C1): records only remaining unpaid balance on completion after deposit and respects skipDepositEntries', async () => {
    const confirmedRow: Database['public']['Tables']['bookings']['Row'] = {
      id: BOOKING_ID,
      booking_code: 'NL-BAL01',
      manage_token: 'tok-bal-1',
      idempotency_key: 'idem-bal-1',
      service_id: SERVICE_ID,
      staff_id: STAFF_ID,
      client_id: CLIENT_ID,
      start_at: '2026-12-03T16:00:00.000Z',
      end_at: '2026-12-03T17:00:00.000Z',
      occupied_start_at: '2026-12-03T16:00:00.000Z',
      occupied_end_at: '2026-12-03T17:15:00.000Z',
      occupied_range: '[2026-12-03T16:00:00.000Z,2026-12-03T17:15:00.000Z)',
      total_duration_minutes: 60,
      subtotal_cents: 50000,
      discount_cents: 0,
      total_price_cents: 50000,
      deposit_amount_cents: 20000,
      coupon_code: null,
      status: 'confirmed',
      source: 'web',
      client_notes: '',
      internal_notes: '',
      inspo_photo_url: null,
      payment_proof_url: null,
      proof_delivery_method: 'web_upload',
      google_event_id: null,
      cancellation_reason: null,
      rescheduled_from_id: null,
      created_at: '2026-12-01T10:00:00.000Z',
      updated_at: '2026-12-01T10:00:00.000Z',
    };

    const existingDepositSplit: Database['public']['Tables']['payment_splits']['Row'] = {
      id: SPLIT_ID,
      booking_id: BOOKING_ID,
      method: 'transfer',
      amount_cents: 20000,
      tip_cents: 0,
      tip_staff_id: null,
      reference: 'Anticipo SPEI aprobado',
      created_at: '2026-12-01T11:00:00.000Z',
    };

    const existingDepositCash: Database['public']['Tables']['cash_register_entries']['Row'] = {
      id: '10000000-0000-4000-8000-000000000901',
      booking_id: BOOKING_ID,
      staff_id: STAFF_ID,
      entry_type: 'deposit',
      description: 'Anticipo SPEI NL-BAL01 — Sofía',
      amount_cents: 20000,
      tip_cents: 0,
      commission_cents: 0,
      payment_method: 'transfer',
      occurred_at: '2026-12-01T11:00:00.000Z',
      recorded_by: 'Dueña',
      created_at: '2026-12-01T11:00:00.000Z',
    };

    const completeMock = buildMockSupabase({
      bookingsRows: [confirmedRow],
      paymentSplitsRows: [existingDepositSplit],
      cashEntriesRows: [existingDepositCash],
    });
    const clock = createFixedClock('2026-12-01T13:00:00.000Z', 'bal-complete');
    const completeRepo = createSupabaseRepository(clock, completeMock.client);

    await completeRepo.updateBookingStatus({
      bookingId: BOOKING_ID,
      status: 'completed',
      paymentMethod: 'cash',
      tipCents: 3000,
      recordedBy: 'Dueña',
      skipLoyaltyStamp: true,
    });

    const cashInsert = completeMock.requests.find(
      (r) => r.method === 'POST' && r.path === '/rest/v1/cash_register_entries',
    );
    expect(cashInsert?.body).toEqual(
      expect.objectContaining({
        booking_id: BOOKING_ID,
        entry_type: 'service_income',
        amount_cents: 30000,
        tip_cents: 3000,
        payment_method: 'cash',
      }),
    );

    const splitInsert = completeMock.requests.find(
      (r) => r.method === 'POST' && r.path === '/rest/v1/payment_splits',
    );
    expect(splitInsert?.body).toEqual([
      expect.objectContaining({
        booking_id: BOOKING_ID,
        method: 'cash',
        amount_cents: 30000,
        tip_cents: 3000,
      }),
    ]);

    const pendingRow: Database['public']['Tables']['bookings']['Row'] = {
      ...confirmedRow,
      status: 'pending_confirmation',
    };
    const skipMock = buildMockSupabase({
      bookingsRows: [pendingRow],
      paymentSplitsRows: [],
      cashEntriesRows: [],
    });
    const skipRepo = createSupabaseRepository(clock, skipMock.client);
    await skipRepo.updateBookingStatus({
      bookingId: BOOKING_ID,
      status: 'confirmed',
      skipDepositEntries: true,
    });
    expect(
      skipMock.requests.some(
        (r) => r.method === 'POST' && r.path === '/rest/v1/payment_splits',
      ),
    ).toBe(false);
    expect(
      skipMock.requests.some(
        (r) => r.method === 'POST' && r.path === '/rest/v1/cash_register_entries',
      ),
    ).toBe(false);
  });

  it('Phase 5: getExecutiveReportData uses <= 10 Supabase requests (<= 9 for specialist), skips snapshot-only tables, and enforces specialist scope', async () => {
    const otherStaffId = '11111111-1111-4111-8111-111111111122';
    const otherBookingId = '44444444-4444-4444-8444-444444444455';
    const ownBooking: Database['public']['Tables']['bookings']['Row'] = {
      id: BOOKING_ID,
      booking_code: 'NL-REP01',
      manage_token: 'tok-rep-1',
      idempotency_key: null,
      service_id: SERVICE_ID,
      staff_id: STAFF_ID,
      client_id: CLIENT_ID,
      start_at: '2026-12-02T16:00:00.000Z',
      end_at: '2026-12-02T17:00:00.000Z',
      occupied_start_at: '2026-12-02T16:00:00.000Z',
      occupied_end_at: '2026-12-02T17:15:00.000Z',
      occupied_range: '[2026-12-02T16:00:00.000Z,2026-12-02T17:15:00.000Z)',
      total_duration_minutes: 60,
      subtotal_cents: 38000,
      discount_cents: 0,
      total_price_cents: 38000,
      deposit_amount_cents: 0,
      coupon_code: null,
      status: 'completed',
      source: 'web',
      client_notes: '',
      internal_notes: '',
      inspo_photo_url: null,
      payment_proof_url: null,
      google_event_id: null,
      cancellation_reason: null,
      rescheduled_from_id: null,
      created_at: '2026-12-01T10:00:00.000Z',
      updated_at: '2026-12-02T17:00:00.000Z',
    };
    const otherBooking: Database['public']['Tables']['bookings']['Row'] = {
      ...ownBooking,
      id: otherBookingId,
      booking_code: 'NL-REP02',
      manage_token: 'tok-rep-2',
      staff_id: otherStaffId,
    };

    const mock = buildMockSupabase({
      extraStaffRows: [
        {
          id: otherStaffId,
          name: 'Otra Especialista',
          role_title: 'Nail Artist',
          bio: '',
          avatar_url: null,
          booking_slug: 'otra',
          commission_percent: 35,
          is_active: true,
          display_order: 1,
          created_at: '2026-12-01T10:00:00.000Z',
          updated_at: '2026-12-01T10:00:00.000Z',
        },
      ],
      bookingsRows: [ownBooking, otherBooking],
      paymentSplitsRows: [
        {
          id: SPLIT_ID,
          booking_id: BOOKING_ID,
          method: 'card',
          amount_cents: 38000,
          tip_cents: 4000,
          tip_staff_id: STAFF_ID,
          reference: null,
          created_at: '2026-12-02T17:00:00.000Z',
        },
        {
          id: '99999999-9999-4999-8999-999999999911',
          booking_id: otherBookingId,
          method: 'cash',
          amount_cents: 38000,
          tip_cents: 0,
          tip_staff_id: otherStaffId,
          reference: null,
          created_at: '2026-12-02T17:00:00.000Z',
        },
      ],
      cashEntriesRows: [
        {
          id: '10000000-0000-4000-8000-000000000911',
          booking_id: BOOKING_ID,
          staff_id: STAFF_ID,
          entry_type: 'service_income',
          description: 'Cobro Valeria',
          amount_cents: 38000,
          tip_cents: 4000,
          commission_cents: 15200,
          payment_method: 'card',
          occurred_at: '2026-12-02T17:00:00.000Z',
          recorded_by: 'Dueña',
          created_at: '2026-12-02T17:00:00.000Z',
        },
        {
          id: '10000000-0000-4000-8000-000000000912',
          booking_id: otherBookingId,
          staff_id: otherStaffId,
          entry_type: 'service_income',
          description: 'Cobro Otra',
          amount_cents: 38000,
          tip_cents: 0,
          commission_cents: 13300,
          payment_method: 'cash',
          occurred_at: '2026-12-02T17:00:00.000Z',
          recorded_by: 'Dueña',
          created_at: '2026-12-02T17:00:00.000Z',
        },
      ],
      funnelEventsRows: [
        {
          id: 'fe-1',
          session_id: 'sess-1',
          event_type: 'page_view',
          service_slug: null,
          staff_slug: null,
          created_at: '2026-12-02T15:00:00.000Z',
        },
      ],
    });
    const repo = createSupabaseRepository(
      createFixedClock('2026-12-02T18:00:00.000Z', 'phase5-report'),
      mock.client,
    );

    const studioData = await repo.getExecutiveReportData({ scopeStaffId: null });
    expect(mock.requests.length).toBeLessThanOrEqual(10);
    expect(studioData.bookings).toHaveLength(2);
    expect(studioData.funnelEvents).toHaveLength(1);
    for (const forbiddenTable of [
      '/rest/v1/audit_logs',
      '/rest/v1/whatsapp_messages',
      '/rest/v1/whatsapp_threads',
      '/rest/v1/inventory_items',
      '/rest/v1/waitlist_entries',
      '/rest/v1/gallery_items',
      '/rest/v1/clients',
    ]) {
      expect(mock.requests.some((r) => r.path === forbiddenTable)).toBe(false);
    }

    const beforeSpec = mock.requests.length;
    const specData = await repo.getExecutiveReportData({ scopeStaffId: STAFF_ID });
    const specRequests = mock.requests.slice(beforeSpec);
    expect(specRequests.length).toBeLessThanOrEqual(9);
    expect(specRequests.some((r) => r.path === '/rest/v1/funnel_events')).toBe(false);
    expect(specData.bookings.map((b) => b.id)).toEqual([BOOKING_ID]);
    expect(specData.staff.map((s) => s.id)).toEqual([STAFF_ID]);
    expect(specData.paymentSplits.map((s) => s.bookingId)).toEqual([BOOKING_ID]);
    expect(specData.cashEntries.map((c) => c.bookingId)).toEqual([BOOKING_ID]);
    expect(specData.funnelEvents).toEqual([]);
  });

  it('Phase 5: getBookingsWithRelations & getAdminBookingsRange avoid getSnapshot(), stay <= 7 requests, honor timezone midnight boundaries, and enforce specialist lock', async () => {
    const otherStaffId = '11111111-1111-4111-8111-111111111133';
    const lateLocalBookingId = '44444444-4444-4444-8444-444444444466';
    const outsideBookingId = '44444444-4444-4444-8444-444444444477';
    const otherStaffBookingId = '44444444-4444-4444-8444-444444444488';

    const lateLocalBooking: Database['public']['Tables']['bookings']['Row'] = {
      id: lateLocalBookingId,
      booking_code: 'NL-MID01',
      manage_token: 'tok-mid-1',
      idempotency_key: null,
      service_id: SERVICE_ID,
      staff_id: STAFF_ID,
      client_id: CLIENT_ID,
      start_at: '2026-12-03T01:30:00.000Z',
      end_at: '2026-12-03T02:30:00.000Z',
      occupied_start_at: '2026-12-03T01:30:00.000Z',
      occupied_end_at: '2026-12-03T02:45:00.000Z',
      occupied_range: '[2026-12-03T01:30:00.000Z,2026-12-03T02:45:00.000Z)',
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
      created_at: '2026-12-01T10:00:00.000Z',
      updated_at: '2026-12-01T10:00:00.000Z',
    };
    const outsideBooking: Database['public']['Tables']['bookings']['Row'] = {
      ...lateLocalBooking,
      id: outsideBookingId,
      booking_code: 'NL-OUT01',
      manage_token: 'tok-out-1',
      start_at: '2026-12-10T16:00:00.000Z',
      end_at: '2026-12-10T17:00:00.000Z',
    };
    const otherStaffBooking: Database['public']['Tables']['bookings']['Row'] = {
      ...lateLocalBooking,
      id: otherStaffBookingId,
      booking_code: 'NL-OTH01',
      manage_token: 'tok-oth-1',
      staff_id: otherStaffId,
      start_at: '2026-12-02T17:00:00.000Z',
      end_at: '2026-12-02T18:00:00.000Z',
    };

    const mock = buildMockSupabase({
      extraStaffRows: [
        {
          id: otherStaffId,
          name: 'Tere',
          role_title: 'Nail Artist',
          bio: '',
          avatar_url: null,
          booking_slug: 'tere',
          commission_percent: 35,
          is_active: true,
          display_order: 1,
          created_at: '2026-12-01T10:00:00.000Z',
          updated_at: '2026-12-01T10:00:00.000Z',
        },
      ],
      bookingsRows: [lateLocalBooking, outsideBooking, otherStaffBooking],
      paymentSplitsRows: [
        {
          id: SPLIT_ID,
          booking_id: lateLocalBookingId,
          method: 'transfer',
          amount_cents: 20000,
          tip_cents: 0,
          tip_staff_id: null,
          reference: 'Anticipo SPEI',
          created_at: '2026-12-01T11:00:00.000Z',
        },
      ],
      cashEntriesRows: [
        {
          id: '10000000-0000-4000-8000-000000000921',
          booking_id: lateLocalBookingId,
          staff_id: STAFF_ID,
          entry_type: 'deposit',
          description: 'Anticipo SPEI',
          amount_cents: 20000,
          tip_cents: 0,
          commission_cents: 0,
          payment_method: 'transfer',
          occurred_at: '2026-12-01T11:00:00.000Z',
          recorded_by: 'Dueña',
          created_at: '2026-12-01T11:00:00.000Z',
        },
      ],
    });
    const repo = createSupabaseRepository(
      createFixedClock('2026-12-02T12:00:00.000Z', 'phase5-range'),
      mock.client,
    );

    const rangeRes = await repo.getAdminBookingsRange({
      from: '2026-12-02',
      to: '2026-12-02',
      role: 'owner',
    });
    expect(mock.requests.length).toBeLessThanOrEqual(7);
    expect(rangeRes.timezone).toBe(TZ);
    expect(rangeRes.bookings.map((b) => b.id)).toEqual([
      otherStaffBookingId,
      lateLocalBookingId,
    ]);
    expect(rangeRes.paymentSplits).toHaveLength(1);
    expect(rangeRes.cashEntries).toHaveLength(1);
    for (const forbiddenTable of [
      '/rest/v1/audit_logs',
      '/rest/v1/whatsapp_messages',
      '/rest/v1/inventory_items',
      '/rest/v1/waitlist_entries',
      '/rest/v1/gallery_items',
      '/rest/v1/funnel_events',
    ]) {
      expect(mock.requests.some((r) => r.path === forbiddenTable)).toBe(false);
    }

    const beforeSpec = mock.requests.length;
    const specBookings = await repo.getBookingsWithRelations({
      from: '2026-12-02',
      to: '2026-12-02',
      staffId: otherStaffId,
      role: 'specialist',
      staffMemberId: STAFF_ID,
    });
    expect(mock.requests.slice(beforeSpec).length).toBeLessThanOrEqual(6);
    expect(specBookings.map((b) => b.id)).toEqual([lateLocalBookingId]);
  });

  it('Wave 1: keeps public bootstrap, private slug lookup, reviews, and client profile targeted with zero full scans, enforces waitlist offer visibility, and prevents orphan media on RPC conflict', async () => {
    const privateVipRow: Database['public']['Tables']['services']['Row'] = {
      id: EXTRA_SERVICE_ID,
      category_id: null,
      name: 'Set Novia VIP',
      slug: 'set-novia-vip',
      description: 'Solo enlace privado',
      duration_minutes: 90,
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
    const completedBookingId = '44444444-4444-4444-8444-444444444491';
    const canceledBookingId = '44444444-4444-4444-8444-444444444492';
    const offerStartAt = zonedDateTimeToUtc('2026-12-02', '10:00', TZ).toISOString();

    const completedBooking: Database['public']['Tables']['bookings']['Row'] = {
      id: completedBookingId,
      booking_code: 'NL-REV01',
      manage_token: 'tok-rev-1',
      idempotency_key: null,
      service_id: SERVICE_ID,
      staff_id: STAFF_ID,
      client_id: CLIENT_ID,
      start_at: '2026-11-28T16:00:00.000Z',
      end_at: '2026-11-28T17:00:00.000Z',
      occupied_start_at: '2026-11-28T16:00:00.000Z',
      occupied_end_at: '2026-11-28T17:15:00.000Z',
      occupied_range: '[2026-11-28T16:00:00.000Z,2026-11-28T17:15:00.000Z)',
      total_duration_minutes: 60,
      subtotal_cents: 38000,
      discount_cents: 0,
      total_price_cents: 38000,
      deposit_amount_cents: 0,
      coupon_code: null,
      status: 'completed',
      source: 'web',
      client_notes: '',
      internal_notes: '',
      inspo_photo_url: null,
      payment_proof_url: null,
      google_event_id: null,
      cancellation_reason: null,
      rescheduled_from_id: null,
      created_at: '2026-11-28T10:00:00.000Z',
      updated_at: '2026-11-28T17:00:00.000Z',
    };
    const newerCanceledBooking: Database['public']['Tables']['bookings']['Row'] = {
      ...completedBooking,
      id: canceledBookingId,
      booking_code: 'NL-CAN01',
      manage_token: 'tok-can-1',
      start_at: '2026-12-03T16:00:00.000Z',
      end_at: '2026-12-03T17:00:00.000Z',
      status: 'canceled',
    };

    const mock = buildMockSupabase({
      extraServicesRows: [privateVipRow],
      bookingsRows: [completedBooking, newerCanceledBooking],
      reviewsRows: [
        {
          id: 'rev-w1-1',
          booking_id: completedBookingId,
          client_id: CLIENT_ID,
          staff_id: STAFF_ID,
          rating: 5,
          comment: 'Súper duración y detalle',
          clicked_google_review: false,
          created_at: '2026-11-29T12:00:00.000Z',
        },
        {
          id: 'rev-w1-2',
          booking_id: canceledBookingId,
          client_id: CLIENT_ID,
          staff_id: STAFF_ID,
          rating: 1,
          comment: 'No debe mostrarse porque es cancelada',
          clicked_google_review: false,
          created_at: '2026-11-30T12:00:00.000Z',
        },
      ],
      waitlistRows: [
        {
          id: 'wl-offer-active',
          service_id: SERVICE_ID,
          preferred_staff_id: STAFF_ID,
          desired_date: '2026-12-02',
          preferred_window: 'morning',
          client_name: 'Clienta Prioridad',
          client_phone_e164: '+522227770099',
          client_email: null,
          notes: '',
          status: 'notified',
          notified_at: '2026-12-01T12:55:00.000Z',
          priority_offer_token: 'wlo-valid-token-01',
          priority_offer_expires_at: '2026-12-01T13:25:00.000Z',
          priority_offer_slot_start_at: offerStartAt,
          priority_offer_staff_id: STAFF_ID,
          created_at: '2026-12-01T10:00:00.000Z',
        },
      ],
      rpcHandlers: {
        create_booking_atomic: () => ({
          status: 409,
          data: { code: '23P01', message: 'bookings_no_overlap_per_staff' },
        }),
      },
    });
    const repo = createSupabaseRepository(
      createFixedClock('2026-12-01T13:00:00.000Z', 'wave1-supabase'),
      mock.client,
    );

    const bootstrap = await repo.getPublicBootstrap();
    expect(mock.requests.length).toBeLessThanOrEqual(8);
    expect(bootstrap.staff).toHaveLength(1);
    expect('commissionPercent' in (bootstrap.staff[0] ?? {})).toBe(false);
    expect(bootstrap.services.some((s) => s.slug === 'set-novia-vip')).toBe(false);
    for (const forbidden of ['/rest/v1/clients', '/rest/v1/bookings', '/rest/v1/audit_logs']) {
      expect(mock.requests.some((r) => r.path === forbidden)).toBe(false);
    }

    const beforeSlug = mock.requests.length;
    const privateSvc = await repo.getPublicServiceBySlug('set-novia-vip');
    expect(privateSvc?.slug).toBe('set-novia-vip');
    expect(privateSvc?.isPrivate).toBe(true);
    expect(mock.requests.slice(beforeSlug).length).toBe(1);

    const beforeReviews = mock.requests.length;
    const reviewsData = await repo.getPublicReviewsForService(SERVICE_ID);
    expect(mock.requests.slice(beforeReviews).length).toBeLessThanOrEqual(3);
    expect(reviewsData.studioReviews).toHaveLength(1);
    expect(reviewsData.serviceReviews).toHaveLength(1);
    expect(reviewsData.serviceReviews[0]?.clientFirstName).toBe('Sofía');

    const beforeProfile = mock.requests.length;
    const portalRec = await repo.getClientPortalRecordByPhone('+525511223344');
    expect(mock.requests.slice(beforeProfile).length).toBeLessThanOrEqual(2);
    expect(portalRec.client?.id).toBe(CLIENT_ID);
    expect(portalRec.latestBooking?.serviceId).toBe(SERVICE_ID);
    expect(portalRec.latestBooking?.status).toBe('completed');

    const availWithoutOffer = await repo.queryAvailability({
      serviceId: SERVICE_ID,
      addonIds: [],
      staffId: STAFF_ID,
      startDate: '2026-12-02',
      days: 1,
    });
    expect(
      availWithoutOffer.days[0]?.slots.some((s) => s.startAt === offerStartAt),
    ).toBe(false);

    const availWithOffer = await repo.queryAvailability({
      serviceId: SERVICE_ID,
      addonIds: [],
      staffId: STAFF_ID,
      startDate: '2026-12-02',
      days: 1,
      waitlistOfferToken: 'wlo-valid-token-01',
    });
    expect(
      availWithOffer.days[0]?.slots.some((s) => s.startAt === offerStartAt),
    ).toBe(true);

    const onePixelPng =
      'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+X2d8AAAAASUVORK5CYII=';
    const beforeConflict = mock.requests.length;
    await expect(
      repo.createBookingAtomic({
        serviceId: SERVICE_ID,
        addonIds: [],
        staffId: STAFF_ID,
        startAt: offerStartAt,
        clientName: 'Clienta Choque',
        clientPhone: '+525511223344',
        inspoPhotoUrl: onePixelPng,
        paymentProofUrl: onePixelPng,
        waitlistOfferToken: 'wlo-valid-token-01',
        privacyConsentAccepted: true,
      }),
    ).rejects.toThrow(SlotConflictError);
    const conflictReqs = mock.requests.slice(beforeConflict);
    expect(conflictReqs.some((r) => r.path === '/rest/v1/media_assets')).toBe(false);
  });

  it('Wave 4: keeps quickSearchAvailability, client portal, cron, webhook, and Google OAuth queries targeted well below 50 Workers subrequests', async () => {
    const startAt = zonedDateTimeToUtc('2026-12-02', '10:00', TZ).toISOString();
    const endAt = zonedDateTimeToUtc('2026-12-02', '11:00', TZ).toISOString();

    const activeBooking: Database['public']['Tables']['bookings']['Row'] = {
      id: BOOKING_ID,
      booking_code: 'NL-W4001',
      manage_token: 'tok-wave4-001',
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
    };

    const mock = buildMockSupabase({
      bookingsRows: [activeBooking],
      bookingPaymentsRows: [
        {
          id: 'pay-w4-1',
          booking_id: BOOKING_ID,
          provider: 'mercadopago',
          amount_cents: 20000,
          currency: 'MXN',
          status: 'paid',
          proof_url: null,
          paid_at: '2026-12-01T12:00:00.000Z',
          provider_payment_id: 'mp-999111',
          checkout_url: null,
          created_at: '2026-12-01T12:00:00.000Z',
        },
      ],
      calendarConnectionsRows: [
        {
          id: 'cal-w4-1',
          staff_id: STAFF_ID,
          provider: 'google',
          account_email: 'karla@laikonanails.mx',
          access_token_encrypted: null,
          refresh_token_encrypted: null,
          token_expires_at: null,
          destination_calendar_id: 'primary',
          conflict_calendar_ids: ['primary'],
          available_calendars: [],
          external_busy_blocks: [],
          watch_channel_id: 'ch-w4-active',
          watch_resource_id: 'res-w4',
          watch_expiration: '2026-12-10T00:00:00.000Z',
          is_connected: true,
          last_synced_at: '2026-12-01T12:00:00.000Z',
          updated_at: '2026-12-01T12:00:00.000Z',
        },
      ],
      workflowsRows: [
        {
          id: 'wf-24h',
          name: 'Recordatorio 24h',
          trigger_event: 'before_booking',
          offset_minutes: 1440,
          channels: ['whatsapp'],
          subject_template: 'Tu cita mañana',
          message_template: 'Hola {clientName}',
          is_enabled: true,
          updated_at: '2026-12-01T12:00:00.000Z',
        },
      ],
    });
    const repo = createSupabaseRepository(
      createFixedClock('2026-12-01T13:00:00.000Z', 'wave4-supabase'),
      mock.client,
    );

    const beforeQuick = mock.requests.length;
    const quick = await repo.quickSearchAvailability({
      serviceId: SERVICE_ID,
      addonIds: [],
      startDate: '2026-12-02',
      days: 7,
      limit: 6,
    });
    const quickReqs = mock.requests.slice(beforeQuick);
    expect(quickReqs.length).toBeLessThanOrEqual(13);
    expect(quick.service.id).toBe(SERVICE_ID);
    expect(quickReqs.some((r) => r.path === '/rest/v1/clients')).toBe(false);
    expect(quickReqs.some((r) => r.path === '/rest/v1/audit_logs')).toBe(false);

    const beforePortalUnknown = mock.requests.length;
    const unknownSnap = await repo.getClientPortalSnapshotByPhone('+522220009999');
    expect(unknownSnap.clientId).toBeNull();
    expect(mock.requests.slice(beforePortalUnknown).length).toBe(1);

    const beforePortalKnown = mock.requests.length;
    const knownSnap = await repo.getClientPortalSnapshotByPhone('+5215511223344');
    expect(knownSnap.clientId).toBe(CLIENT_ID);
    expect(knownSnap.bookings).toHaveLength(1);
    expect(mock.requests.slice(beforePortalKnown).length).toBeLessThanOrEqual(8);

    const beforeUpsert = mock.requests.length;
    const upserted = await repo.upsertClientPortalProfileByPhone({
      phoneE164: '+525511223344',
      fullName: 'Sofía Actualizada',
      email: 'sofia.w4@ejemplo.mx',
      instagramHandle: 'sofia.w4',
      birthday: '1997-08-15',
    });
    expect(upserted.client?.fullName).toBe('Sofía Actualizada');
    expect(mock.requests.slice(beforeUpsert).length).toBeLessThanOrEqual(3);

    const beforeWf = mock.requests.length;
    expect(await repo.getNotificationWorkflows()).toHaveLength(1);
    expect(mock.requests.slice(beforeWf).length).toBe(1);

    const beforePay = mock.requests.length;
    expect(await repo.findApprovedBookingPayment('mercadopago', 'mp-999111')).toEqual({
      bookingId: BOOKING_ID,
    });
    expect(mock.requests.slice(beforePay).length).toBe(1);

    const beforeCal = mock.requests.length;
    const conn = await repo.getCalendarConnectionByWatchChannelId('ch-w4-active');
    expect(conn?.staffId).toBe(STAFF_ID);
    expect(mock.requests.slice(beforeCal).length).toBe(1);

    const beforeStaff = mock.requests.length;
    expect(await repo.staffMemberExists(STAFF_ID)).toBe(true);
    expect(mock.requests.slice(beforeStaff).length).toBe(1);

    const beforeWaEmpty = mock.requests.length;
    expect(await repo.getWhatsAppContactContextByPhones([])).toEqual({
      clients: [],
      bookings: [],
    });
    expect(mock.requests.slice(beforeWaEmpty).length).toBe(0);

    const beforeWaKnown = mock.requests.length;
    const waCtx = await repo.getWhatsAppContactContextByPhones(['+525511223344']);
    expect(waCtx.clients).toHaveLength(1);
    expect(waCtx.bookings).toHaveLength(1);
    expect(mock.requests.slice(beforeWaKnown).length).toBeLessThanOrEqual(2);

    const beforeIdleCron = mock.requests.length;
    const idleDue = await repo.processDueScheduledNotifications(async () => ({
      status: 'sent',
      providerMessageId: 'msg-1',
      errorMessage: null,
    }));
    expect(idleDue.processed).toBe(0);
    expect(mock.requests.slice(beforeIdleCron).length).toBe(1);

    const beforeOverdue = mock.requests.length;
    expect(
      await fetchSupabaseOverdueWaitlistContext('2026-12-01T13:00:00.000Z', mock.client),
    ).toBeNull();
    expect(mock.requests.slice(beforeOverdue).length).toBe(1);

    const beforeTouchUp = mock.requests.length;
    expect(
      await fetchSupabaseTouchUpContext(
        '2026-11-06T13:00:00.000Z',
        '2026-11-13T13:00:00.000Z',
        mock.client,
      ),
    ).toBeNull();
    expect(mock.requests.slice(beforeTouchUp).length).toBeLessThanOrEqual(2);
  });

  it('Wave 5 Admin: enforces strict Workers Free subrequest budgets across overview (owner/admin/specialist), campaigns, reminders, availability diagnose, and targeted admin lookups', async () => {
    const startAt = zonedDateTimeToUtc('2026-12-02', '10:00', TZ).toISOString();
    const endAt = zonedDateTimeToUtc('2026-12-02', '11:00', TZ).toISOString();
    const otherStaffId = '11111111-1111-4111-8111-111111111122';
    const otherClientId = '33333333-3333-4333-8333-333333333322';

    const ownBooking: Database['public']['Tables']['bookings']['Row'] = {
      id: BOOKING_ID,
      booking_code: 'NL-W5001',
      manage_token: 'tok-wave5-001',
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
    };

    const mock = buildMockSupabase({
      bookingsRows: [ownBooking],
      extraClientsRows: [
        {
          id: otherClientId,
          full_name: 'Clienta Otra Staff',
          phone_e164: '+522229998877',
          email: null,
          birthday: null,
          notes: '',
          no_show_count: 0,
          created_at: '2026-11-01T10:00:00.000Z',
          updated_at: '2026-11-01T10:00:00.000Z',
        },
      ],
      extraStaffRows: [
        {
          id: otherStaffId,
          name: 'Otra Especialista',
          role_title: 'Nail Artist',
          bio: '',
          avatar_url: null,
          booking_slug: 'otra',
          commission_percent: 35,
          is_active: true,
          display_order: 1,
          created_at: '2026-12-01T10:00:00.000Z',
          updated_at: '2026-12-01T10:00:00.000Z',
        },
      ],
      recurringBlocksRows: [
        {
          id: BLOCK_ID,
          staff_id: STAFF_ID,
          reason: 'Comida',
          frequency: 'weekly',
          weekdays: [2, 3],
          day_of_month: null,
          start_time: '14:00',
          end_time: '15:00',
          until_date: null,
          is_active: true,
          created_at: '2026-12-01T10:00:00.000Z',
        },
      ],
      dateOverridesRows: [
        {
          id: 'ovr-w5-1',
          staff_id: STAFF_ID,
          override_date: '2026-12-25',
          is_unavailable: true,
          start_time: null,
          end_time: null,
          reason: 'Navidad',
          created_at: '2026-12-01T10:00:00.000Z',
        },
      ],
      workflowsRows: [
        {
          id: 'wf-24h',
          name: 'Recordatorio 24h',
          trigger_event: 'before_booking',
          offset_minutes: 1440,
          channels: ['whatsapp'],
          subject_template: 'Tu cita mañana',
          message_template: 'Hola {clientName}',
          is_enabled: true,
          updated_at: '2026-12-01T10:00:00.000Z',
        },
      ],
      scheduledNotificationsRows: [
        {
          id: 'ntf-w5-1',
          booking_id: BOOKING_ID,
          client_id: CLIENT_ID,
          workflow_id: 'wf-24h',
          trigger_key: 'reminder_24h',
          channel: 'whatsapp',
          recipient: '+525511223344',
          scheduled_for: '2026-12-01T16:00:00.000Z',
          status: 'pending',
          delivery_status: 'queued',
          subject: 'Recordatorio 24h',
          preview_text: 'Hola Sofía',
          body_text: 'Hola Sofía',
          payload: {},
          provider_message_id: null,
          error_message: null,
          attempts: 0,
          max_attempts: 3,
          next_retry_at: null,
          last_attempt_at: null,
          sent_at: null,
          created_at: '2026-12-01T10:00:00.000Z',
        },
      ],
    });
    const nowMs = Date.parse('2026-12-01T13:00:00.000Z');
    const repo = createSupabaseRepository(
      createFixedClock('2026-12-01T13:00:00.000Z', 'wave5-admin-supabase'),
      mock.client,
    );

    const beforeOwner = mock.requests.length;
    const ownerOverview = await repo.getAdminOverviewData({
      role: 'owner',
      staffMemberId: null,
      nowMs,
    });
    const ownerReqs = mock.requests.slice(beforeOwner);
    expect(ownerReqs.length).toBeLessThanOrEqual(31);
    expect(ownerOverview.bookings).toHaveLength(1);
    expect(ownerOverview.whatsappInboxSummary?.pendingRemindersCount).toBe(1);
    for (const unused of [
      '/rest/v1/slot_holds',
      '/rest/v1/funnel_events',
      '/rest/v1/booking_payments',
      '/rest/v1/media_assets',
      '/rest/v1/consents',
      '/rest/v1/coupon_redemptions',
      '/rest/v1/whatsapp_messages',
    ]) {
      expect(ownerReqs.some((r) => r.path === unused)).toBe(false);
    }

    const beforeAdmin = mock.requests.length;
    await repo.getAdminOverviewData({
      role: 'admin',
      staffMemberId: null,
      nowMs,
    });
    const adminReqs = mock.requests.slice(beforeAdmin);
    expect(adminReqs.length).toBeLessThanOrEqual(30);
    expect(adminReqs.some((r) => r.path === '/rest/v1/audit_logs')).toBe(false);

    const beforeSpecialist = mock.requests.length;
    const specialistOverview = await repo.getAdminOverviewData({
      role: 'specialist',
      staffMemberId: STAFF_ID,
      nowMs,
    });
    const specialistReqs = mock.requests.slice(beforeSpecialist);
    expect(specialistReqs.length).toBeLessThanOrEqual(22);
    expect(specialistOverview.clients.map((c) => c.id)).toEqual([CLIENT_ID]);
    expect(specialistOverview.staff.map((s) => s.id)).toEqual([STAFF_ID]);
    expect(specialistOverview.whatsappInboxSummary).toBeUndefined();
    for (const forbidden of [
      '/rest/v1/audit_logs',
      '/rest/v1/inventory_items',
      '/rest/v1/inventory_movements',
      '/rest/v1/waitlist_entries',
      '/rest/v1/coupons',
      '/rest/v1/notification_workflows',
      '/rest/v1/admin_users',
      '/rest/v1/whatsapp_templates',
      '/rest/v1/whatsapp_threads',
      '/rest/v1/whatsapp_messages',
    ]) {
      expect(specialistReqs.some((r) => r.path === forbidden)).toBe(false);
    }

    const beforeUnlinked = mock.requests.length;
    const unlinkedOverview = await repo.getAdminOverviewData({
      role: 'specialist',
      staffMemberId: null,
      nowMs,
    });
    expect(mock.requests.slice(beforeUnlinked).length).toBeLessThanOrEqual(7);
    expect(unlinkedOverview.bookings).toEqual([]);

    const beforeCampaigns = mock.requests.length;
    const audience = await repo.getCampaignAudienceData();
    expect(mock.requests.slice(beforeCampaigns).length).toBe(4);
    expect(audience.clients.length).toBeGreaterThanOrEqual(1);
    expect(audience.services.length).toBeGreaterThanOrEqual(1);

    const beforeReminders = mock.requests.length;
    const remindersSnap = await repo.getWhatsAppRemindersSnapshot({
      role: 'owner',
      staffMemberId: null,
      nowMs,
    });
    expect(mock.requests.slice(beforeReminders).length).toBe(7);
    expect(remindersSnap.queue).toHaveLength(1);
    expect(remindersSnap.metrics.pendingCount).toBe(1);
    expect(remindersSnap.metrics.bookingsWithoutRemindersCount).toBe(0);

    const beforeClient = mock.requests.length;
    const foundClient = await repo.getClientById(CLIENT_ID);
    expect(foundClient?.id).toBe(CLIENT_ID);
    expect(mock.requests.slice(beforeClient).length).toBe(1);

    const beforeAdmins = mock.requests.length;
    await repo.listActiveAdminUsers();
    expect(mock.requests.slice(beforeAdmins).length).toBe(1);

    const beforeServices = mock.requests.length;
    const activeServices = await repo.listActiveServices(5);
    expect(activeServices.length).toBeGreaterThanOrEqual(1);
    expect(mock.requests.slice(beforeServices).length).toBe(1);

    const beforeCash = mock.requests.length;
    await repo.listCashEntries();
    expect(mock.requests.slice(beforeCash).length).toBe(1);

    const beforeBlocks = mock.requests.length;
    const blocks = await repo.listRecurringBlocks(STAFF_ID);
    expect(blocks).toHaveLength(1);
    expect(mock.requests.slice(beforeBlocks).length).toBe(1);

    const beforeToggle = mock.requests.length;
    const toggled = await repo.toggleRecurringBlock(BLOCK_ID, false);
    expect(toggled.isActive).toBe(false);
    expect(mock.requests.slice(beforeToggle).length).toBe(1);

    const beforeOverrideDates = mock.requests.length;
    const overrideDates = await repo.listStaffOverrideDates(STAFF_ID);
    expect(overrideDates).toEqual(['2026-12-25']);
    expect(mock.requests.slice(beforeOverrideDates).length).toBe(1);

    const beforeStaffClients = mock.requests.length;
    const staffClientIds = await repo.listStaffClientIds(STAFF_ID);
    expect(staffClientIds).toEqual([CLIENT_ID]);
    expect(mock.requests.slice(beforeStaffClients).length).toBe(1);

    const beforeDiagnose = mock.requests.length;
    const diagnosed = await repo.diagnoseAvailability({
      date: '2026-12-02',
      serviceId: SERVICE_ID,
      staffId: STAFF_ID,
      role: 'owner',
      staffMemberId: null,
    });
    const diagnoseReqs = mock.requests.slice(beforeDiagnose);
    expect(diagnoseReqs.length).toBeLessThanOrEqual(13);
    expect(diagnosed.date).toBe('2026-12-02');
    expect(diagnosed.diagnosis.length).toBeGreaterThan(0);
    expect(diagnoseReqs.some((r) => r.path === '/rest/v1/clients')).toBe(false);
    expect(diagnoseReqs.some((r) => r.path === '/rest/v1/audit_logs')).toBe(false);
  });
});
