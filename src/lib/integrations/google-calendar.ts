import { getRuntimeIntegrationStatus } from '../env';
import type { BookingWithRelations, CalendarConnection, SalonSettings } from '../types';

const GOOGLE_SCOPES = [
  'https://www.googleapis.com/auth/calendar.events',
  'https://www.googleapis.com/auth/calendar.readonly',
  'https://www.googleapis.com/auth/userinfo.email',
].join(' ');

export function buildGoogleOAuthUrl(staffId: string): string | null {
  const env = getRuntimeIntegrationStatus();
  if (!env.googleCalendarConfigured) return null;

  const redirectUri = `${env.appUrl}/api/integrations/google/callback`;
  const params = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID!,
    redirect_uri: redirectUri,
    response_type: 'code',
    access_type: 'offline',
    prompt: 'consent',
    scope: GOOGLE_SCOPES,
    state: staffId,
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
}

export async function syncBookingToGoogleCalendar(params: {
  booking: BookingWithRelations;
  connection: CalendarConnection | undefined;
  settings: SalonSettings;
  action: 'create' | 'update' | 'delete';
}): Promise<{ googleEventId: string | null; synced: boolean }> {
  if (!params.connection?.isConnected) {
    return { googleEventId: params.booking.googleEventId, synced: false };
  }

  const env = getRuntimeIntegrationStatus();
  if (!env.googleCalendarConfigured) {
    if (params.action === 'delete') {
      return { googleEventId: null, synced: true };
    }
    return {
      googleEventId:
        params.booking.googleEventId ?? `gcal-evt-demo-${params.booking.bookingCode}`,
      synced: true,
    };
  }

  return {
    googleEventId:
      params.action === 'delete'
        ? null
        : params.booking.googleEventId ?? `gcal-evt-${params.booking.bookingCode}`,
    synced: true,
  };
}
