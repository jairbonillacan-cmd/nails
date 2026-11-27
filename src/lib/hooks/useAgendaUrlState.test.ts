import { describe, expect, it } from 'vitest';
import { parseAgendaParams } from '@/lib/admin-links';
import {
  buildAgendaNextHref,
  normalizeAgendaUrlState,
} from './useAgendaUrlState';

const TODAY = '2026-11-27';
const STAFF_IDS = new Set(['staff-karla', 'staff-paty', 'staff-tere']);

describe('useAgendaUrlState pure URL normalization & transitions', () => {
  it('defaults cleanly when URL has no query params and preserves explicit view/date/staff/status/q', () => {
    const base = normalizeAgendaUrlState(parseAgendaParams('/admin/citas'), {
      todayKey: TODAY,
      lockedStaffId: null,
      validStaffIds: STAFF_IDS,
    });
    expect(base.explicitView).toBeNull();
    expect(base.dateKey).toBe(TODAY);
    expect(base.staffFilter).toBe('all');
    expect(base.status).toBe('upcoming');
    expect(base.q).toBe('');
    expect(base.waitlistOpen).toBe(false);
    expect(base.hasOneShotParams).toBe(false);

    const step1 = buildAgendaNextHref(
      base,
      { view: 'week', dateKey: '2026-11-28', staffFilter: 'staff-karla', status: 'uncollected', q: 'Sofía' },
      { todayKey: TODAY, lockedStaffId: null },
    );
    expect(step1).toBe(
      '/admin/citas?view=week&date=2026-11-28&staff=staff-karla&status=uncollected&q=Sof%C3%ADa',
    );

    const reloaded = normalizeAgendaUrlState(parseAgendaParams(step1), {
      todayKey: TODAY,
      lockedStaffId: null,
      validStaffIds: STAFF_IDS,
    });
    expect(reloaded.explicitView).toBe('week');
    expect(reloaded.dateKey).toBe('2026-11-28');
    expect(reloaded.staffFilter).toBe('staff-karla');
    expect(reloaded.status).toBe('uncollected');
    expect(reloaded.q).toBe('Sofía');
  });

  it('normalizes legacy tab params (waitlist, unconfirmed, past) and clears only one-shot params while preserving active filters', () => {
    const legacyWaitlist = normalizeAgendaUrlState(
      parseAgendaParams('/admin/citas?tab=waitlist&staff=staff-paty'),
      { todayKey: TODAY, lockedStaffId: null, validStaffIds: STAFF_IDS },
    );
    expect(legacyWaitlist.waitlistOpen).toBe(true);
    expect(legacyWaitlist.status).toBe('upcoming');
    expect(legacyWaitlist.staffFilter).toBe('staff-paty');

    const legacyPending = normalizeAgendaUrlState(
      parseAgendaParams('/admin/citas?tab=unconfirmed'),
      { todayKey: TODAY, lockedStaffId: null, validStaffIds: STAFF_IDS },
    );
    expect(legacyPending.status).toBe('pending');

    const withOneShot = normalizeAgendaUrlState(
      parseAgendaParams(
        '/admin/citas?view=list&date=2026-11-29&staff=staff-karla&status=pending&new=1&clientName=Sof%C3%ADa',
      ),
      { todayKey: TODAY, lockedStaffId: null, validStaffIds: STAFF_IDS },
    );
    expect(withOneShot.hasOneShotParams).toBe(true);
    expect(withOneShot.oneShot.isNew).toBe(true);
    expect(withOneShot.oneShot.clientName).toBe('Sofía');

    const cleanedHref = buildAgendaNextHref(withOneShot, {}, {
      todayKey: TODAY,
      lockedStaffId: null,
    });
    expect(cleanedHref).toBe(
      '/admin/citas?view=list&date=2026-11-29&staff=staff-karla&status=pending',
    );
  });

  it('enforces specialist RBAC staff lock and omits default date/status from generated URLs', () => {
    const specialistState = normalizeAgendaUrlState(
      parseAgendaParams('/admin/citas?staff=staff-karla&view=day&status=upcoming&date=2026-11-27'),
      { todayKey: TODAY, lockedStaffId: 'staff-tere', validStaffIds: STAFF_IDS },
    );
    expect(specialistState.staffFilter).toBe('staff-tere');

    const href = buildAgendaNextHref(
      specialistState,
      { staffFilter: 'staff-karla', waitlistOpen: true },
      { todayKey: TODAY, lockedStaffId: 'staff-tere' },
    );
    expect(href).toBe('/admin/citas?view=day&panel=waitlist');
  });
});
