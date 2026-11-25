import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import fc from 'fast-check';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { isActiveBookingStatus } from '../booking/state-machine';
import { getDateKeyInTimezone } from '../format';
import {
  SlotConflictError,
  createBookingAtomic,
  getSnapshot,
  queryAvailability,
} from './db';

const TEMP_DB_PATH = path.join(
  os.tmpdir(),
  `nails-concurrency-prop-${process.pid}-${crypto.randomUUID()}.json`,
);

let originalDbPathEnv: string | undefined;

async function resetIsolatedDb(): Promise<void> {
  if (globalThis.nailsWriteMutex) {
    await globalThis.nailsWriteMutex;
  }
  globalThis.nailsDbCache = undefined;
  globalThis.nailsDbCachePath = undefined;
  globalThis.nailsDbPersistedToDisk = undefined;
  if (fs.existsSync(TEMP_DB_PATH)) {
    fs.unlinkSync(TEMP_DB_PATH);
  }
}

function intervalsOverlap(aStartMs: number, aEndMs: number, bStartMs: number, bEndMs: number): boolean {
  return aStartMs < bEndMs && bStartMs < aEndMs;
}

beforeAll(async () => {
  originalDbPathEnv = process.env.NAILS_DEMO_DB_PATH;
  process.env.NAILS_DEMO_DB_PATH = TEMP_DB_PATH;
  await resetIsolatedDb();
});

afterAll(async () => {
  await resetIsolatedDb();
  if (originalDbPathEnv === undefined) {
    delete process.env.NAILS_DEMO_DB_PATH;
  } else {
    process.env.NAILS_DEMO_DB_PATH = originalDbPathEnv;
  }
});

describe('H6: fc.scheduler() concurrent createBookingAtomic property tests', () => {
  it('strictly 1 of N (2..6) concurrent bookings for the same (staffId, startAt) succeeds and N-1 fail with SlotConflictError (SLOT_TAKEN)', async () => {
    let runCounter = 0;

    await fc.assert(
      fc.asyncProperty(
        fc.scheduler(),
        fc.integer({ min: 2, max: 6 }),
        fc.constantFrom('staff-karla', 'staff-paty', 'staff-tere'),
        async (scheduler, contenderCount, staffId) => {
          runCounter += 1;
          await resetIsolatedDb();

          const initialDb = getSnapshot();
          const service = initialDb.services.find(
            (s) => s.id === 'srv-gel-semipermanente-manos',
          );
          if (!service) {
            throw new Error('Expected seed service srv-gel-semipermanente-manos');
          }

          const initialBookingCount = initialDb.bookings.length;
          const todayKey = getDateKeyInTimezone(new Date(), initialDb.settings.timezone);
          const availability = queryAvailability({
            serviceId: service.id,
            addonIds: [],
            staffId,
            startDate: todayKey,
            days: 14,
          });
          const openSlot = availability.days.flatMap((day) => day.slots)[0];
          if (!openSlot) {
            throw new Error(`Expected at least one open slot for ${staffId}`);
          }

          const scheduledCreate = scheduler.scheduleFunction(createBookingAtomic);
          const triggers = Array.from({ length: contenderCount }, (_, index) =>
            scheduler.schedule(Promise.resolve(index), `run-${runCounter}-contender-${index}`),
          );

          const racePromise = Promise.all(
            triggers.map(async (trigger, index) => {
              await trigger;
              try {
                const booking = await scheduledCreate({
                  serviceId: service.id,
                  addonIds: [],
                  staffId: openSlot.staffId,
                  startAt: openSlot.startAt,
                  clientName: `Clienta H6 ${runCounter}-${index}`,
                  clientPhone: `+525518${String(runCounter).padStart(2, '0')}${String(index).padStart(4, '0')}`,
                  source: index % 2 === 0 ? 'web' : 'whatsapp',
                  privacyConsentAccepted: true,
                  idempotencyKey: `h6-same-slot-${runCounter}-${index}`,
                });
                return { ok: true as const, booking };
              } catch (error) {
                return { ok: false as const, error };
              }
            }),
          );

          await scheduler.waitAll();
          const outcomes = await racePromise;

          const winners = outcomes.filter(
            (outcome): outcome is { ok: true; booking: Awaited<ReturnType<typeof createBookingAtomic>> } =>
              outcome.ok,
          );
          const losers = outcomes.filter(
            (outcome): outcome is { ok: false; error: unknown } => !outcome.ok,
          );

          expect(winners).toHaveLength(1);
          expect(losers).toHaveLength(contenderCount - 1);

          for (const loser of losers) {
            expect(loser.error).toBeInstanceOf(SlotConflictError);
            if (loser.error instanceof SlotConflictError) {
              expect(loser.error.code).toBe('SLOT_TAKEN');
              expect(Array.isArray(loser.error.suggestedSlots)).toBe(true);
            }
          }

          const finalDb = getSnapshot();
          expect(finalDb.bookings).toHaveLength(initialBookingCount + 1);

          const winnerBooking = winners[0]?.booking;
          expect(winnerBooking).toBeDefined();
          expect(finalDb.bookings.some((b) => b.id === winnerBooking?.id)).toBe(true);

          const activeForStaff = finalDb.bookings
            .filter((b) => b.staffId === openSlot.staffId && isActiveBookingStatus(b.status))
            .toSorted(
              (a, b) => new Date(a.startAt).getTime() - new Date(b.startAt).getTime(),
            );

          for (let i = 1; i < activeForStaff.length; i += 1) {
            const prev = activeForStaff[i - 1];
            const curr = activeForStaff[i];
            if (!prev || !curr) continue;
            expect(
              intervalsOverlap(
                new Date(prev.startAt).getTime(),
                new Date(prev.endAt).getTime(),
                new Date(curr.startAt).getTime(),
                new Date(curr.endAt).getTime(),
              ),
            ).toBe(false);
          }
        },
      ),
      { numRuns: 12 },
    );
  });

  it('never double-books any specialist when N (4..6) contenders race with staffId=null on the same startAt', async () => {
    let runCounter = 0;

    await fc.assert(
      fc.asyncProperty(
        fc.scheduler(),
        fc.integer({ min: 4, max: 6 }),
        async (scheduler, contenderCount) => {
          runCounter += 1;
          await resetIsolatedDb();

          const initialDb = getSnapshot();
          const service = initialDb.services.find(
            (s) => s.id === 'srv-gel-semipermanente-manos',
          );
          if (!service) {
            throw new Error('Expected seed service srv-gel-semipermanente-manos');
          }

          const todayKey = getDateKeyInTimezone(new Date(), initialDb.settings.timezone);
          const availability = queryAvailability({
            serviceId: service.id,
            addonIds: [],
            staffId: null,
            startDate: todayKey,
            days: 14,
          });
          const openSlot = availability.days.flatMap((day) => day.slots)[0];
          if (!openSlot) {
            throw new Error('Expected open any-staff slot');
          }

          const eligibleAtSlotCount = availability.days
            .flatMap((day) => day.slots)
            .filter((slot) => slot.startAt === openSlot.startAt).length;

          const scheduledCreate = scheduler.scheduleFunction(createBookingAtomic);
          const triggers = Array.from({ length: contenderCount }, (_, index) =>
            scheduler.schedule(Promise.resolve(index), `any-${runCounter}-contender-${index}`),
          );

          const racePromise = Promise.all(
            triggers.map(async (trigger, index) => {
              await trigger;
              try {
                const booking = await scheduledCreate({
                  serviceId: service.id,
                  addonIds: [],
                  staffId: null,
                  startAt: openSlot.startAt,
                  clientName: `Clienta Any ${runCounter}-${index}`,
                  clientPhone: `+525517${String(runCounter).padStart(2, '0')}${String(index).padStart(4, '0')}`,
                  source: 'web',
                  privacyConsentAccepted: true,
                  idempotencyKey: `h6-any-staff-${runCounter}-${index}`,
                });
                return { ok: true as const, booking };
              } catch (error) {
                return { ok: false as const, error };
              }
            }),
          );

          await scheduler.waitAll();
          const outcomes = await racePromise;

          const winners = outcomes.filter(
            (outcome): outcome is { ok: true; booking: Awaited<ReturnType<typeof createBookingAtomic>> } =>
              outcome.ok,
          );
          const losers = outcomes.filter(
            (outcome): outcome is { ok: false; error: unknown } => !outcome.ok,
          );

          const expectedWinners = Math.min(contenderCount, eligibleAtSlotCount);
          expect(winners).toHaveLength(expectedWinners);
          expect(losers).toHaveLength(contenderCount - expectedWinners);

          const assignedStaffIds = winners.map((w) => w.booking.staffId);
          expect(new Set(assignedStaffIds).size).toBe(winners.length);

          for (const loser of losers) {
            expect(loser.error).toBeInstanceOf(SlotConflictError);
            if (loser.error instanceof SlotConflictError) {
              expect(loser.error.code).toBe('SLOT_TAKEN');
            }
          }
        },
      ),
      { numRuns: 6 },
    );
  });
});
