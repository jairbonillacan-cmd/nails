import { describe, expect, it } from 'vitest';
import { createInitialDemoDatabase } from '../demo-seed';
import type { Booking, ScheduledNotification, WaitlistEntry } from '../types';
import {
  CANCELLATION_REASON_OPTIONS,
  RESCHEDULE_REASON_OPTIONS,
  WAITLIST_OFFER_TTL_MINUTES,
  WORKFLOW_TEMPLATE_GALLERY,
  selectNextWaitlistCandidate,
  shouldSkipWhatsappCascade,
  summarizeCascadeMetrics,
} from './cascade';

function buildBooking(overrides: Partial<Booking>): Booking {
  const db = createInitialDemoDatabase();
  const base = db.bookings[0];
  if (!base) throw new Error('Expected seed booking');
  return {
    ...base,
    ...overrides,
  };
}

function buildNotification(overrides: Partial<ScheduledNotification>): ScheduledNotification {
  return {
    id: 'notif-1',
    bookingId: 'bk-1',
    workflowId: 'wf-email-48h',
    channel: 'email',
    recipient: 'clienta@example.com',
    scheduledFor: '2026-12-09T10:00:00.000Z',
    status: 'sent',
    subject: 'Recordatorio de cita',
    previewText: 'Recordatorio',
    providerMessageId: 'msg-1',
    errorMessage: null,
    sentAt: '2026-12-09T10:00:05.000Z',
    createdAt: '2026-12-08T10:00:00.000Z',
    ...overrides,
  };
}

function buildWaitlistEntry(overrides: Partial<WaitlistEntry>): WaitlistEntry {
  return {
    id: 'wl-1',
    serviceId: 'srv-gel-semipermanente-manos',
    preferredStaffId: null,
    desiredDate: '2026-12-10',
    preferredWindow: 'morning',
    clientName: 'Clienta Espera',
    clientPhoneE164: '+525511000001',
    clientEmail: 'espera@example.com',
    notes: '',
    status: 'waiting',
    notifiedAt: null,
    createdAt: '2026-12-01T10:00:00.000Z',
    priorityOfferToken: null,
    priorityOfferExpiresAt: null,
    priorityOfferSlotStartAt: null,
    ...overrides,
  };
}

describe('Cascade notifications, metrics & waitlist engine (N5/C8/U3)', () => {
  it('exposes structured Spanish cancel/reschedule reasons including Otro and 7 workflow gallery templates', () => {
    expect(WAITLIST_OFFER_TTL_MINUTES).toBe(30);
    expect(CANCELLATION_REASON_OPTIONS).toContain('Otro');
    expect(RESCHEDULE_REASON_OPTIONS).toContain('Otro');
    expect(CANCELLATION_REASON_OPTIONS.length).toBeGreaterThanOrEqual(4);
    expect(RESCHEDULE_REASON_OPTIONS.length).toBeGreaterThanOrEqual(4);

    expect(WORKFLOW_TEMPLATE_GALLERY).toHaveLength(7);
    const ids = WORKFLOW_TEMPLATE_GALLERY.map((item) => item.id);
    expect(new Set(ids).size).toBe(7);
    expect(ids).toEqual([
      'tpl-deposit-confirm',
      'tpl-email-48h',
      'tpl-wa-cascade-24h',
      'tpl-no-gel-prep',
      'tpl-noshow-30m',
      'tpl-recapture-cancel',
      'tpl-waitlist-10m',
    ]);
    for (const template of WORKFLOW_TEMPLATE_GALLERY) {
      expect(template.title.trim().length).toBeGreaterThan(0);
      expect(template.description.trim().length).toBeGreaterThan(0);
      expect(template.timingLabel.trim().length).toBeGreaterThan(0);
      expect(template.templateText.trim().length).toBeGreaterThan(0);
    }
  });

  it('shouldSkipWhatsappCascade skips confirmed/terminal bookings and escalates unconfirmed bookings', () => {
    expect(
      shouldSkipWhatsappCascade({ status: 'confirmed', confirmedVia: 'email' }, true),
    ).toBe(true);
    expect(
      shouldSkipWhatsappCascade({ status: 'confirmed', confirmedVia: 'manual' }, false),
    ).toBe(true);
    expect(
      shouldSkipWhatsappCascade({ status: 'confirmed', confirmedVia: 'payment' }, false),
    ).toBe(true);
    expect(
      shouldSkipWhatsappCascade({ status: 'confirmed', confirmedVia: 'whatsapp' }, true),
    ).toBe(true);
    expect(
      shouldSkipWhatsappCascade({ status: 'confirmed', confirmedVia: null }, true),
    ).toBe(true);
    expect(
      shouldSkipWhatsappCascade({ status: 'canceled', confirmedVia: null }, false),
    ).toBe(true);
    expect(
      shouldSkipWhatsappCascade({ status: 'completed', confirmedVia: null }, false),
    ).toBe(true);
    expect(
      shouldSkipWhatsappCascade({ status: 'no_show', confirmedVia: null }, false),
    ).toBe(true);

    expect(
      shouldSkipWhatsappCascade({ status: 'pending_confirmation', confirmedVia: null }, true),
    ).toBe(false);
    expect(
      shouldSkipWhatsappCascade({ status: 'pending_payment', confirmedVia: undefined }, true),
    ).toBe(false);
    expect(
      shouldSkipWhatsappCascade({ status: 'confirmed', confirmedVia: null }, false),
    ).toBe(false);
  });

  it('summarizeCascadeMetrics aggregates confirmed revenue, channel breakdown, and upcoming bookings without reminders', () => {
    const now = new Date('2026-12-08T12:00:00.000Z');
    const bookings: Booking[] = [
      buildBooking({
        id: 'bk-email',
        status: 'confirmed',
        confirmedVia: 'email',
        totalPriceCents: 45000,
        startAt: '2026-12-10T16:00:00.000Z',
      }),
      buildBooking({
        id: 'bk-wa',
        status: 'confirmed',
        confirmedVia: 'whatsapp',
        totalPriceCents: 60000,
        startAt: '2026-12-11T16:00:00.000Z',
      }),
      buildBooking({
        id: 'bk-pay',
        status: 'completed',
        confirmedVia: 'payment',
        totalPriceCents: 80000,
        startAt: '2026-12-07T16:00:00.000Z',
      }),
      buildBooking({
        id: 'bk-manual-default',
        status: 'confirmed',
        confirmedVia: null,
        totalPriceCents: 35000,
        startAt: '2026-12-09T18:00:00.000Z',
      }),
      buildBooking({
        id: 'bk-pending-no-rem',
        status: 'pending_payment',
        confirmedVia: null,
        totalPriceCents: 50000,
        startAt: '2026-12-09T14:00:00.000Z',
      }),
      buildBooking({
        id: 'bk-past-active',
        status: 'pending_confirmation',
        confirmedVia: null,
        totalPriceCents: 25000,
        startAt: '2026-12-07T10:00:00.000Z',
      }),
      buildBooking({
        id: 'bk-canceled',
        status: 'canceled',
        confirmedVia: 'email',
        totalPriceCents: 99000,
        startAt: '2026-12-12T16:00:00.000Z',
      }),
    ];

    const logs: ScheduledNotification[] = [
      buildNotification({ id: 'n1', bookingId: 'bk-email', status: 'sent' }),
      buildNotification({ id: 'n2', bookingId: 'bk-wa', status: 'pending' }),
      buildNotification({ id: 'n3', bookingId: 'bk-pending-no-rem', status: 'failed' }),
      buildNotification({ id: 'n4', bookingId: 'bk-manual-default', status: 'canceled' }),
    ];

    const summary = summarizeCascadeMetrics(bookings, logs, now);

    expect(summary.confirmedRevenueCents).toBe(45000 + 60000 + 80000 + 35000);
    expect(summary.emailConfirmedCount).toBe(1);
    expect(summary.whatsappConfirmedCount).toBe(1);
    expect(summary.paymentConfirmedCount).toBe(1);
    expect(summary.manualConfirmedCount).toBe(1);
    expect(summary.bookingsWithoutReminders.map((b) => b.id)).toEqual([
      'bk-pending-no-rem',
      'bk-manual-default',
    ]);
  });

  it('selectNextWaitlistCandidate picks earliest FIFO waiting match, honors staff preference, and skips expired offers', () => {
    const nowMs = new Date('2026-12-10T12:00:00.000Z').getTime();
    const waitlist: WaitlistEntry[] = [
      buildWaitlistEntry({
        id: 'wl-notified',
        status: 'notified',
        createdAt: '2026-12-01T08:00:00.000Z',
      }),
      buildWaitlistEntry({
        id: 'wl-expired-offer',
        status: 'waiting',
        createdAt: '2026-12-01T09:00:00.000Z',
        priorityOfferExpiresAt: '2026-12-10T11:59:59.000Z',
      }),
      buildWaitlistEntry({
        id: 'wl-wrong-staff',
        status: 'waiting',
        preferredStaffId: 'staff-paty',
        createdAt: '2026-12-01T09:30:00.000Z',
      }),
      buildWaitlistEntry({
        id: 'wl-wrong-service',
        status: 'waiting',
        serviceId: 'srv-pedicure-spa',
        createdAt: '2026-12-01T09:40:00.000Z',
      }),
      buildWaitlistEntry({
        id: 'wl-wrong-date',
        status: 'waiting',
        desiredDate: '2026-12-11',
        createdAt: '2026-12-01T09:45:00.000Z',
      }),
      buildWaitlistEntry({
        id: 'wl-later-match',
        status: 'waiting',
        preferredStaffId: 'staff-karla',
        createdAt: '2026-12-01T11:00:00.000Z',
      }),
      buildWaitlistEntry({
        id: 'wl-winner-any-staff',
        status: 'waiting',
        preferredStaffId: null,
        createdAt: '2026-12-01T10:15:00.000Z',
        priorityOfferExpiresAt: '2026-12-10T12:05:00.000Z',
      }),
    ];

    const selected = selectNextWaitlistCandidate(waitlist, {
      serviceId: 'srv-gel-semipermanente-manos',
      staffId: 'staff-karla',
      dateKey: '2026-12-10',
      nowMs,
    });
    expect(selected?.id).toBe('wl-winner-any-staff');

    const patySelected = selectNextWaitlistCandidate(waitlist, {
      serviceId: 'srv-gel-semipermanente-manos',
      staffId: 'staff-paty',
      dateKey: '2026-12-10',
      nowMs,
    });
    expect(patySelected?.id).toBe('wl-wrong-staff');

    const noneSelected = selectNextWaitlistCandidate(waitlist, {
      serviceId: 'srv-nonexistent',
      staffId: 'staff-karla',
      dateKey: '2026-12-10',
      nowMs,
    });
    expect(noneSelected).toBeNull();
  });
});
