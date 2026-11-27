import type { BookingPaymentSummary } from '@/lib/payments/splits';
import type { AdminRole, BookingStatus } from '@/lib/types';

interface StudioSessionIdentity {
  role: AdminRole;
  fullName: string;
  staffMemberId: string | null;
}

interface StudioBookingAuthorizationTarget {
  id: string;
  bookingCode: string;
  staffId: string;
  clientPhoneE164: string;
}

export interface StudioBarContext {
  role: AdminRole;
  actorName: string;
  isFullyPaid: boolean;
  paidCents: number;
  remainingCents: number;
  totalPriceCents: number;
  collectHref: string;
  agendaHref: string;
  clientProfileHref: string | null;
}

export interface StudioBarBookingSnapshot {
  id: string;
  bookingCode: string;
  status: BookingStatus;
  attendanceStatus?: 'pending' | 'confirmed' | 'rescheduled';
  paymentProofUrl: string | null;
  proofDeliveryMethod?: 'web_upload' | 'web_link' | 'instagram_dm' | 'none';
}

interface StudioBarViewModel {
  roleLabel: string;
  canApproveDeposit: boolean;
  isPending: boolean;
  isConfirmed: boolean;
  isCompletedAndPaid: boolean;
  isArrived: boolean;
  showViewProof: boolean;
  showConfirmBooking: boolean;
  showMarkArrival: boolean;
  showCollectAndStamp: boolean;
  showOpenInAgenda: boolean;
  showCompletedPaidBadge: boolean;
  showClientProfileLink: boolean;
}

function formatStudioRoleLabel(role: AdminRole): string {
  if (role === 'owner') return 'Dueña';
  if (role === 'admin') return 'Recepción';
  return 'Manicurista';
}

export function resolveStudioBarContext(input: {
  session: StudioSessionIdentity | null;
  booking: StudioBookingAuthorizationTarget;
  paymentSummary: Pick<
    BookingPaymentSummary,
    'isFullyPaid' | 'paidCents' | 'remainingCents' | 'totalPriceCents'
  >;
}): StudioBarContext | null {
  const { session, booking, paymentSummary } = input;
  if (!session) return null;

  if (session.role === 'specialist') {
    if (!session.staffMemberId || session.staffMemberId !== booking.staffId) {
      return null;
    }
  }

  const canViewClients = session.role === 'owner' || session.role === 'admin';
  const cleanPhone = booking.clientPhoneE164.trim();

  return {
    role: session.role,
    actorName: session.fullName.trim() || formatStudioRoleLabel(session.role),
    isFullyPaid: paymentSummary.isFullyPaid,
    paidCents: paymentSummary.paidCents,
    remainingCents: paymentSummary.remainingCents,
    totalPriceCents: paymentSummary.totalPriceCents,
    collectHref: `/admin/citas?collect=${encodeURIComponent(booking.id)}`,
    agendaHref: `/admin/citas?q=${encodeURIComponent(booking.bookingCode)}`,
    clientProfileHref:
      canViewClients && cleanPhone
        ? `/admin/clientas?q=${encodeURIComponent(cleanPhone)}`
        : null,
  };
}

export function computeStudioBarViewModel(
  context: StudioBarContext,
  booking: StudioBarBookingSnapshot,
): StudioBarViewModel {
  const canApproveDeposit = context.role === 'owner' || context.role === 'admin';
  const isPending =
    booking.status === 'pending_confirmation' || booking.status === 'pending_payment';
  const isConfirmed = booking.status === 'confirmed';
  const isCompleted = booking.status === 'completed';
  const isCanceled = booking.status === 'canceled';
  const isNoShow = booking.status === 'no_show';
  const isCompletedAndPaid = isCompleted && context.isFullyPaid;
  const isArrived = booking.attendanceStatus === 'confirmed';
  const hasProof = Boolean(booking.paymentProofUrl?.trim());

  const showViewProof = isPending && canApproveDeposit && hasProof;
  const showConfirmBooking = isPending && canApproveDeposit;
  const showMarkArrival = isConfirmed && !isArrived;
  const showCollectAndStamp = !isCanceled && !isNoShow && !isCompletedAndPaid;
  const showCompletedPaidBadge = isCompletedAndPaid;
  const showClientProfileLink = isCompletedAndPaid && Boolean(context.clientProfileHref);

  return {
    roleLabel: formatStudioRoleLabel(context.role),
    canApproveDeposit,
    isPending,
    isConfirmed,
    isCompletedAndPaid,
    isArrived,
    showViewProof,
    showConfirmBooking,
    showMarkArrival,
    showCollectAndStamp,
    showOpenInAgenda: true,
    showCompletedPaidBadge,
    showClientProfileLink,
  };
}
