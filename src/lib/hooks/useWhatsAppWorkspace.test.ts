import { describe, expect, it } from 'vitest';
import type { WhatsAppThreadSummaryDTO } from '@/lib/contracts';
import {
  findMatchingThreadByTarget,
  parseWhatsAppReminderFilterParam,
  parseWhatsAppTabParam,
  parseWhatsAppThreadFilterParam,
} from './useWhatsAppWorkspace';

function makeThread(
  overrides: Partial<WhatsAppThreadSummaryDTO>,
): WhatsAppThreadSummaryDTO {
  return {
    id: 'wth-1',
    phoneE164: '+522224123987',
    clientId: 'client-sofia',
    contactName: 'Sofía Ramírez',
    clientEmail: null,
    clientInstagram: null,
    lastMessageAt: '2026-11-27T12:00:00Z',
    lastMessagePreview: 'Hola',
    lastMessageDirection: 'inbound',
    lastInboundAt: '2026-11-27T12:00:00Z',
    unreadCount: 1,
    lastReadAt: null,
    hasFailedMessages: false,
    isArchived: false,
    assignedStaffId: null,
    serviceWindow: {
      isOpen: true,
      lastInboundAt: '2026-11-27T12:00:00Z',
      expiresAt: '2026-11-28T12:00:00Z',
      remainingMinutes: 1440,
    },
    nextBooking: null,
    lastDeliveryStatus: 'received',
    lastSenderKind: 'client',
    ...overrides,
  };
}

describe('useWhatsAppWorkspace pure helpers', () => {
  it('parses tab params with Spanish and English aliases', () => {
    expect(parseWhatsAppTabParam(null)).toBe('mensajes');
    expect(parseWhatsAppTabParam('mensajes')).toBe('mensajes');
    expect(parseWhatsAppTabParam('recordatorios')).toBe('recordatorios');
    expect(parseWhatsAppTabParam('reminders')).toBe('recordatorios');
    expect(parseWhatsAppTabParam('conexion')).toBe('conexion');
    expect(parseWhatsAppTabParam('plantillas')).toBe('conexion');
    expect(parseWhatsAppTabParam('unknown')).toBe('mensajes');
  });

  it('parses thread filter params including window alias', () => {
    expect(parseWhatsAppThreadFilterParam(null)).toBe('all');
    expect(parseWhatsAppThreadFilterParam('unread')).toBe('unread');
    expect(parseWhatsAppThreadFilterParam('window_open')).toBe('window_open');
    expect(parseWhatsAppThreadFilterParam('window')).toBe('window_open');
    expect(parseWhatsAppThreadFilterParam('failed')).toBe('failed');
    expect(parseWhatsAppThreadFilterParam('invalid')).toBe('all');
  });

  it('parses reminder filter params safely', () => {
    expect(parseWhatsAppReminderFilterParam('pending')).toBe('pending');
    expect(parseWhatsAppReminderFilterParam('sent')).toBe('sent');
    expect(parseWhatsAppReminderFilterParam('failed')).toBe('failed');
    expect(parseWhatsAppReminderFilterParam('canceled')).toBe('canceled');
    expect(parseWhatsAppReminderFilterParam('other')).toBeUndefined();
    expect(parseWhatsAppReminderFilterParam(null)).toBeUndefined();
  });

  it('matches threads by clientId or canonicalized Mexican phone number', () => {
    const threads = [
      makeThread({ id: 'wth-sofia', clientId: 'client-sofia', phoneE164: '+522224123987' }),
      makeThread({ id: 'wth-andrea', clientId: 'client-andrea', phoneE164: '+522225551122' }),
    ];

    expect(findMatchingThreadByTarget(threads, { clientId: 'client-andrea' })?.id).toBe(
      'wth-andrea',
    );
    expect(findMatchingThreadByTarget(threads, { phone: '5212224123987' })?.id).toBe(
      'wth-sofia',
    );
    expect(findMatchingThreadByTarget(threads, { phone: '222 412 3987' })?.id).toBe(
      'wth-sofia',
    );
    expect(findMatchingThreadByTarget(threads, { phone: '+529991112233' })).toBeNull();
  });
});
