import { afterEach, describe, expect, it, vi } from 'vitest';
import { createInitialDemoDatabase } from '../demo-seed';
import {
  decryptOAuthToken,
  encryptOAuthToken,
  exchangeGoogleOAuthCode,
  fetchGoogleFreeBusy,
  registerGoogleCalendarWatch,
  syncBookingToGoogleCalendar,
} from './google-calendar';

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

describe('Google Calendar AES-256-GCM Token Crypto & Bidirectional Sync', () => {
  it('encrypts and decrypts OAuth tokens with random IVs, rejects tampering, and fails closed in production without key', () => {
    vi.stubEnv('GOOGLE_TOKEN_ENCRYPTION_KEY', 'test-gcal-enc-key-32-chars-min');

    const secretToken = 'ya29.a0AfH6SM_test_access_token_xyz';
    const enc1 = encryptOAuthToken(secretToken);
    const enc2 = encryptOAuthToken(secretToken);

    expect(enc1).not.toBe(secretToken);
    expect(enc1).not.toBe(enc2);
    expect(enc1.startsWith('v1.')).toBe(true);
    expect(decryptOAuthToken(enc1)).toBe(secretToken);
    expect(decryptOAuthToken(enc2)).toBe(secretToken);

    const parts = enc1.split('.');
    const tampered = `${parts[0]}.${parts[1]}.${parts[2]}.${(parts[3] ?? '').slice(0, -2)}AA`;
    expect(() => decryptOAuthToken(tampered)).toThrow();
    expect(() => decryptOAuthToken('invalid-format')).toThrow();

    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('GOOGLE_TOKEN_ENCRYPTION_KEY', '');
    vi.stubEnv('ADMIN_SESSION_SECRET', '');
    expect(() => encryptOAuthToken(secretToken)).toThrow();
  });

  it('exchanges OAuth code, auto-refreshes expired token on event insert, fetches FreeBusy, and registers Watch channel', async () => {
    vi.stubEnv('GOOGLE_TOKEN_ENCRYPTION_KEY', 'test-gcal-sync-key');
    vi.stubEnv('GOOGLE_CLIENT_ID', 'gcal-client-id');
    vi.stubEnv('GOOGLE_CLIENT_SECRET', 'gcal-client-secret');

    const calls: Array<{ url: string; method: string }> = [];
    const mockFetch: typeof fetch = async (input, init) => {
      const url = typeof input === 'string' ? input : input.toString();
      const method = init?.method ?? 'GET';
      calls.push({ url, method });

      if (url === 'https://oauth2.googleapis.com/token') {
        return new Response(
          JSON.stringify({
            access_token: 'fresh-access-token',
            refresh_token: 'fresh-refresh-token',
            expires_in: 3600,
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        );
      }
      if (url === 'https://www.googleapis.com/oauth2/v2/userinfo') {
        return new Response(JSON.stringify({ email: 'karla@laikona.mx' }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      if (url.includes('/events/watch')) {
        return new Response(
          JSON.stringify({
            id: 'chan-101',
            resourceId: 'res-202',
            expiration: String(Date.now() + 86_400_000),
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        );
      }
      if (url.includes('/events')) {
        return new Response(JSON.stringify({ id: 'gcal-live-evt-777' }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      if (url.includes('/freeBusy')) {
        return new Response(
          JSON.stringify({
            calendars: {
              primary: {
                busy: [
                  {
                    start: '2026-12-01T16:00:00.000Z',
                    end: '2026-12-01T17:00:00.000Z',
                  },
                ],
              },
            },
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        );
      }
      return new Response('not found', { status: 404 });
    };

    const exchanged = await exchangeGoogleOAuthCode({
      code: 'oauth-auth-code',
      fetchImpl: mockFetch,
    });
    expect(exchanged.accessToken).toBe('fresh-access-token');
    expect(exchanged.refreshToken).toBe('fresh-refresh-token');
    expect(exchanged.accountEmail).toBe('karla@laikona.mx');

    const db = createInitialDemoDatabase();
    const rawBooking = db.bookings[0];
    const service = db.services.find((s) => s.id === rawBooking?.serviceId);
    const staff = db.staff.find((s) => s.id === rawBooking?.staffId);
    const client = db.clients.find((c) => c.id === rawBooking?.clientId);
    if (!rawBooking || !service || !staff || !client) {
      throw new Error('Missing seed booking relations');
    }

    const connection = {
      id: 'gcal-test',
      staffId: staff.id,
      provider: 'google' as const,
      accountEmail: 'karla@laikona.mx',
      destinationCalendarId: 'primary',
      conflictCalendarIds: ['primary'],
      availableCalendars: [{ id: 'primary', summary: 'Principal', primary: true }],
      isConnected: true,
      lastSyncedAt: null,
      accessTokenEncrypted: encryptOAuthToken('expired-token'),
      refreshTokenEncrypted: encryptOAuthToken('saved-refresh-token'),
      tokenExpiresAt: new Date(Date.now() - 120_000).toISOString(),
    };

    const synced = await syncBookingToGoogleCalendar({
      booking: { ...rawBooking, googleEventId: null, service, staff, client },
      connection,
      settings: db.settings,
      action: 'create',
      fetchImpl: mockFetch,
    });
    expect(synced.synced).toBe(true);
    expect(synced.googleEventId).toBe('gcal-live-evt-777');
    expect(synced.refreshedAccessTokenEncrypted).toBeTruthy();

    const freeBusy = await fetchGoogleFreeBusy({
      connection: {
        ...connection,
        accessTokenEncrypted: synced.refreshedAccessTokenEncrypted,
        tokenExpiresAt: synced.refreshedTokenExpiresAt,
      },
      fetchImpl: mockFetch,
    });
    expect(freeBusy.synced).toBe(true);
    expect(freeBusy.busyBlocks).toHaveLength(1);
    expect(freeBusy.busyBlocks[0]?.startAt).toBe('2026-12-01T16:00:00.000Z');

    const watch = await registerGoogleCalendarWatch({
      connection: {
        ...connection,
        accessTokenEncrypted: synced.refreshedAccessTokenEncrypted,
        tokenExpiresAt: synced.refreshedTokenExpiresAt,
      },
      webhookUrl: 'https://laikona.mx/api/webhooks/google-calendar',
      webhookToken: 'watch-secret-token',
      channelId: 'chan-101',
      fetchImpl: mockFetch,
    });
    expect(watch?.watchChannelId).toBe('chan-101');
    expect(watch?.watchResourceId).toBe('res-202');
    expect(calls.some((c) => c.url.includes('/freeBusy'))).toBe(true);
  });
});
