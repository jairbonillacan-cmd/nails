import { describe, expect, it } from 'vitest';
import type { WaitlistEntry } from '../types';
import { findFreedSlotWaitlistMatch } from './waitlist-match';

const TZ = 'America/Mexico_City';
const NOW_MS = Date.UTC(2026, 10, 27, 16, 0, 0);

function makeEntry(overrides: Partial<WaitlistEntry> = {}): WaitlistEntry {
  return {
    id: 'wl-1',
    serviceId: 'srv-softgel',
    preferredStaffId: 'staff-karla',
    desiredDate: '2026-11-28',
    preferredWindow: 'afternoon',
    clientName: 'Renata Silva',
    clientPhoneE164: '+522226612009',
    clientEmail: null,
    notes: '',
    status: 'waiting',
    notifiedAt: null,
    createdAt: '2026-11-27T12:00:00.000Z',
    ...overrides,
  };
}

describe('findFreedSlotWaitlistMatch', () => {
  it('prefers exact service + date + staff FIFO match via selectNextWaitlistCandidate', () => {
    const earlier = makeEntry({ id: 'wl-first', clientName: 'Valeria Cruz', createdAt: '2026-11-27T10:00:00.000Z' });
    const later = makeEntry({ id: 'wl-second', clientName: 'Renata Silva', createdAt: '2026-11-27T11:00:00.000Z' });
    const differentStaff = makeEntry({
      id: 'wl-paty',
      preferredStaffId: 'staff-paty',
      createdAt: '2026-11-27T09:00:00.000Z',
    });

    const match = findFreedSlotWaitlistMatch({
      waitlist: [later, differentStaff, earlier],
      booking: {
        serviceId: 'srv-softgel',
        staffId: 'staff-karla',
        startAt: '2026-11-28T22:30:00.000Z',
        service: { name: 'Softgel' },
        staff: { name: 'Karla' },
      },
      services: [{ id: 'srv-softgel', name: 'Softgel' }],
      salonName: 'LAIKONA NAILS',
      timezone: TZ,
      nowMs: NOW_MS,
    });

    expect(match).not.toBeNull();
    expect(match?.matchKind).toBe('exact');
    expect(match?.candidate.id).toBe('wl-first');
    expect(match?.waitingCount).toBe(3);
    expect(match?.dateKey).toBe('2026-11-28');
    expect(match?.slotTimeLabel).toMatch(/4:30\s*p\.?\s?m\./i);
    const decoded = new URL(match?.waMeUrl ?? '').searchParams.get('text') ?? '';
    expect(decoded).toContain('Hola Valeria');
    expect(decoded).toContain('Softgel con Karla');
    expect(decoded).not.toContain('p.m..');
  });

  it('falls back to same_day compatible staff match, then general waiting pool, and skips non-waiting or expired offers', () => {
    const expired = makeEntry({
      id: 'wl-exp',
      desiredDate: '2026-11-28',
      priorityOfferExpiresAt: '2026-11-27T15:00:00.000Z',
    });
    const notified = makeEntry({ id: 'wl-notified', status: 'notified' });
    const sameDayOtherService = makeEntry({
      id: 'wl-same-day',
      serviceId: 'srv-rubber',
      desiredDate: '2026-11-28',
      clientName: 'Camila Ortiz',
    });

    const sameDayMatch = findFreedSlotWaitlistMatch({
      waitlist: [expired, notified, sameDayOtherService],
      booking: {
        serviceId: 'srv-softgel',
        staffId: 'staff-karla',
        startAt: '2026-11-28T18:00:00.000Z',
        service: { name: 'Softgel' },
        staff: { name: 'Karla' },
      },
      services: [{ id: 'srv-rubber', name: 'Rubber' }],
      salonName: 'LAIKONA NAILS',
      timezone: TZ,
      nowMs: NOW_MS,
    });

    expect(sameDayMatch?.matchKind).toBe('same_day');
    expect(sameDayMatch?.candidate.id).toBe('wl-same-day');
    expect(sameDayMatch?.waitingCount).toBe(1);
    expect(sameDayMatch?.serviceName).toBe('Rubber');

    const generalMatch = findFreedSlotWaitlistMatch({
      waitlist: [sameDayOtherService],
      booking: {
        serviceId: 'srv-softgel',
        staffId: 'staff-karla',
        startAt: '2026-11-27T18:00:00.000Z',
        service: { name: 'Softgel' },
        staff: { name: 'Karla' },
      },
      services: [{ id: 'srv-rubber', name: 'Rubber' }],
      salonName: 'LAIKONA NAILS',
      timezone: TZ,
      nowMs: NOW_MS,
    });
    expect(generalMatch?.matchKind).toBe('general');
    expect(generalMatch?.candidate.id).toBe('wl-same-day');
  });

  it('returns null when there are no active waiting entries', () => {
    const match = findFreedSlotWaitlistMatch({
      waitlist: [makeEntry({ status: 'booked' }), makeEntry({ status: 'expired' })],
      booking: {
        serviceId: 'srv-softgel',
        staffId: 'staff-karla',
        startAt: '2026-11-28T18:00:00.000Z',
      },
      salonName: 'LAIKONA NAILS',
      timezone: TZ,
      nowMs: NOW_MS,
    });
    expect(match).toBeNull();
  });
});
