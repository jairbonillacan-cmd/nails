import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  computeStudioBarViewModel,
  resolveStudioBarContext,
  type StudioBarBookingSnapshot,
} from './studio-bar';

const BASE_BOOKING_TARGET = {
  id: 'bk-1044',
  bookingCode: 'NL-1044',
  staffId: 'staff-tere',
  clientPhoneE164: '+522224123987',
};

const UNPAID_SUMMARY = {
  isFullyPaid: false,
  paidCents: 20000,
  remainingCents: 35000,
  totalPriceCents: 55000,
};

const PAID_SUMMARY = {
  isFullyPaid: true,
  paidCents: 55000,
  remainingCents: 0,
  totalPriceCents: 55000,
};

function makeBookingSnapshot(
  overrides: Partial<StudioBarBookingSnapshot> = {},
): StudioBarBookingSnapshot {
  return {
    id: 'bk-1044',
    bookingCode: 'NL-1044',
    status: 'confirmed',
    attendanceStatus: 'pending',
    paymentProofUrl: null,
    proofDeliveryMethod: 'none',
    ...overrides,
  };
}

describe('studio QR check-in bar RBAC and state actions', () => {
  it('returns null for anonymous visitors so no studio controls or metadata render', () => {
    const ctx = resolveStudioBarContext({
      session: null,
      booking: BASE_BOOKING_TARGET,
      paymentSummary: UNPAID_SUMMARY,
    });
    expect(ctx).toBeNull();
  });

  it('returns null for a specialist scanning another specialist booking or without staffMemberId', () => {
    const foreign = resolveStudioBarContext({
      session: {
        role: 'specialist',
        fullName: 'Karla',
        staffMemberId: 'staff-karla',
      },
      booking: BASE_BOOKING_TARGET,
      paymentSummary: UNPAID_SUMMARY,
    });
    expect(foreign).toBeNull();

    const unlinked = resolveStudioBarContext({
      session: {
        role: 'specialist',
        fullName: 'Especialista',
        staffMemberId: null,
      },
      booking: BASE_BOOKING_TARGET,
      paymentSummary: UNPAID_SUMMARY,
    });
    expect(unlinked).toBeNull();
  });

  it('authorizes a specialist on her own booking without deposit-approval or client-CRM links', () => {
    const ctx = resolveStudioBarContext({
      session: {
        role: 'specialist',
        fullName: 'Tere',
        staffMemberId: 'staff-tere',
      },
      booking: BASE_BOOKING_TARGET,
      paymentSummary: UNPAID_SUMMARY,
    });
    expect(ctx).not.toBeNull();
    expect(ctx?.role).toBe('specialist');
    expect(ctx?.clientProfileHref).toBeNull();
    expect(ctx?.collectHref).toBe('/admin/citas?collect=bk-1044');
    expect(ctx?.agendaHref).toBe('/admin/citas?q=NL-1044');

    const pendingView = computeStudioBarViewModel(
      ctx!,
      makeBookingSnapshot({
        status: 'pending_confirmation',
        paymentProofUrl: '/api/media/proofs/test.png',
        proofDeliveryMethod: 'web_upload',
      }),
    );
    expect(pendingView.canApproveDeposit).toBe(false);
    expect(pendingView.showViewProof).toBe(false);
    expect(pendingView.showConfirmBooking).toBe(false);
    expect(pendingView.showCollectAndStamp).toBe(true);
    expect(pendingView.showOpenInAgenda).toBe(true);

    const confirmedView = computeStudioBarViewModel(
      ctx!,
      makeBookingSnapshot({ status: 'confirmed', attendanceStatus: 'pending' }),
    );
    expect(confirmedView.showMarkArrival).toBe(true);
    expect(confirmedView.showCollectAndStamp).toBe(true);
  });

  it('grants owner and admin full state-aware actions across pending, confirmed, arrived, and completed+paid states', () => {
    for (const role of ['owner', 'admin'] as const) {
      const unpaidCtx = resolveStudioBarContext({
        session: {
          role,
          fullName: role === 'owner' ? 'Dueña' : 'Recepción',
          staffMemberId: null,
        },
        booking: BASE_BOOKING_TARGET,
        paymentSummary: UNPAID_SUMMARY,
      });
      expect(unpaidCtx).not.toBeNull();
      expect(unpaidCtx?.clientProfileHref).toBe('/admin/clientas?q=%2B522224123987');

      const pendingWithProof = computeStudioBarViewModel(
        unpaidCtx!,
        makeBookingSnapshot({
          status: 'pending_confirmation',
          paymentProofUrl: '/api/media/proofs/comprobante.png',
          proofDeliveryMethod: 'web_upload',
        }),
      );
      expect(pendingWithProof.showViewProof).toBe(true);
      expect(pendingWithProof.showConfirmBooking).toBe(true);
      expect(pendingWithProof.showMarkArrival).toBe(false);
      expect(pendingWithProof.showCollectAndStamp).toBe(true);

      const pendingWithoutProof = computeStudioBarViewModel(
        unpaidCtx!,
        makeBookingSnapshot({
          status: 'pending_payment',
          paymentProofUrl: null,
        }),
      );
      expect(pendingWithoutProof.showViewProof).toBe(false);
      expect(pendingWithoutProof.showConfirmBooking).toBe(true);

      const confirmedNotArrived = computeStudioBarViewModel(
        unpaidCtx!,
        makeBookingSnapshot({ status: 'confirmed', attendanceStatus: 'pending' }),
      );
      expect(confirmedNotArrived.showMarkArrival).toBe(true);
      expect(confirmedNotArrived.isArrived).toBe(false);
      expect(confirmedNotArrived.showCollectAndStamp).toBe(true);

      const confirmedArrived = computeStudioBarViewModel(
        unpaidCtx!,
        makeBookingSnapshot({ status: 'confirmed', attendanceStatus: 'confirmed' }),
      );
      expect(confirmedArrived.showMarkArrival).toBe(false);
      expect(confirmedArrived.isArrived).toBe(true);
      expect(confirmedArrived.showCollectAndStamp).toBe(true);

      const completedUnpaid = computeStudioBarViewModel(
        unpaidCtx!,
        makeBookingSnapshot({ status: 'completed', attendanceStatus: 'confirmed' }),
      );
      expect(completedUnpaid.showCollectAndStamp).toBe(true);
      expect(completedUnpaid.showCompletedPaidBadge).toBe(false);

      const canceledView = computeStudioBarViewModel(
        unpaidCtx!,
        makeBookingSnapshot({ status: 'canceled' }),
      );
      expect(canceledView.showCollectAndStamp).toBe(false);
      expect(canceledView.showConfirmBooking).toBe(false);
      expect(canceledView.showMarkArrival).toBe(false);

      const paidCtx = resolveStudioBarContext({
        session: {
          role,
          fullName: role === 'owner' ? 'Dueña' : 'Recepción',
          staffMemberId: null,
        },
        booking: BASE_BOOKING_TARGET,
        paymentSummary: PAID_SUMMARY,
      });
      const completedPaid = computeStudioBarViewModel(
        paidCtx!,
        makeBookingSnapshot({ status: 'completed', attendanceStatus: 'confirmed' }),
      );
      expect(completedPaid.showCollectAndStamp).toBe(false);
      expect(completedPaid.showCompletedPaidBadge).toBe(true);
      expect(completedPaid.showClientProfileLink).toBe(true);
    }
  });

  it('never serializes private fields in StudioBarContext and enforces anti-leak headers on /cita/:path*', () => {
    const ctx = resolveStudioBarContext({
      session: {
        role: 'owner',
        fullName: 'Karla',
        staffMemberId: 'staff-karla',
      },
      booking: BASE_BOOKING_TARGET,
      paymentSummary: UNPAID_SUMMARY,
    });
    const serialized = JSON.stringify(ctx);
    expect(serialized).not.toContain('commissionPercent');
    expect(serialized).not.toContain('ownerPinHash');
    expect(serialized).not.toContain('internalNotes');

    const nextConfigSource = fs.readFileSync(
      path.join(process.cwd(), 'next.config.ts'),
      'utf8',
    );
    expect(nextConfigSource).toContain("source: '/cita/:path*'");
    expect(nextConfigSource).toContain("key: 'Referrer-Policy', value: 'no-referrer'");
    expect(nextConfigSource).toContain("key: 'Cache-Control', value: 'private, no-store'");

    const citaPageSource = fs.readFileSync(
      path.join(process.cwd(), 'src/app/cita/[token]/page.tsx'),
      'utf8',
    );
    expect(citaPageSource).toContain('requireAdmin(');
    expect(citaPageSource).toContain('getBookingPaymentSummaryAsync(');
    expect(citaPageSource).not.toContain('getSnapshot(');
  });
});
