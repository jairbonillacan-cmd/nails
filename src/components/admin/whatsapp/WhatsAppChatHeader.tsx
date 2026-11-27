'use client';

import { VStack } from '@astryxdesign/core/VStack';
import { HStack } from '@astryxdesign/core/HStack';
import { Heading } from '@astryxdesign/core/Heading';
import { Text } from '@astryxdesign/core/Text';
import { Button } from '@astryxdesign/core/Button';
import { Avatar } from '@astryxdesign/core/Avatar';
import { Token } from '@astryxdesign/core/Token';
import {
  ArrowLeft,
  CalendarClock,
  CalendarPlus,
  CreditCard,
  ExternalLink,
  UserRound,
} from 'lucide-react';
import { agendaHref, clientasHref } from '@/lib/admin-links';
import type {
  WhatsAppThreadBookingContextDTO,
  WhatsAppThreadDetailResponseDTO,
  WhatsAppThreadSummaryDTO,
} from '@/lib/contracts';
import {
  formatCurrency,
  formatDateShortInTimezone,
  formatPhoneDisplay,
  formatTimeInTimezone,
} from '@/lib/format';
import { BookingStatusTag, StatusTag } from '@/components/ui';
import {
  formatWhatsAppWindowBadge,
  getWhatsAppAttendanceBadge,
} from './whatsappUiHelpers';

interface WhatsAppChatHeaderProps {
  thread: WhatsAppThreadSummaryDTO;
  client: WhatsAppThreadDetailResponseDTO['client'];
  nextBooking: WhatsAppThreadBookingContextDTO | null;
  waMeUrl: string;
  nowMs: number;
  timezone: string;
  currency: 'MXN' | 'USD';
  showBackButton: boolean;
  onBack: () => void;
}

export function WhatsAppChatHeader({
  thread,
  client,
  nextBooking,
  waMeUrl,
  nowMs,
  timezone,
  currency,
  showBackButton,
  onBack,
}: WhatsAppChatHeaderProps) {
  const windowMeta = formatWhatsAppWindowBadge(thread.serviceWindow, nowMs);
  const instagramHandle = client?.instagramHandle ?? thread.clientInstagram ?? null;
  const attendanceBadge = nextBooking
    ? getWhatsAppAttendanceBadge(nextBooking.attendanceStatus)
    : null;
  const clientProfileHref = clientasHref({ q: thread.phoneE164 });

  return (
    <VStack as="header" gap={0} style={{ flex: '0 0 auto', minWidth: 0 }}>
      <VStack className="ad-wa-chat-head" gap={2}>
        <HStack justify="between" align="center" gap={2} wrap="wrap">
          <HStack gap={2} align="center" style={{ minWidth: 0, flex: '1 1 12rem' }}>
            {showBackButton ? (
              <Button
                type="button"
                label="Conversaciones"
                variant="ghost"
                size="sm"
                icon={<ArrowLeft size={15} aria-hidden="true" />}
                onClick={onBack}
              />
            ) : null}
            <Avatar name={thread.contactName} size={36} tooltip={false} />
            <VStack gap={0} style={{ minWidth: 0, flex: '1 1 0%' }}>
              <HStack gap={1.5} align="center" wrap="wrap">
                <Heading level={3} className="ad-h3">
                  {thread.contactName}
                </Heading>
                {(client?.noShowCount ?? 0) >= 2 ? (
                  <StatusTag
                    tone="warning"
                    label={`${client?.noShowCount ?? 0} inasistencias`}
                    hasTabularNumbers
                  />
                ) : null}
              </HStack>
              <HStack gap={1.5} align="center" wrap="wrap">
                <Text type="supporting" color="secondary" hasTabularNumbers>
                  {formatPhoneDisplay(thread.phoneE164)}
                </Text>
                {instagramHandle ? (
                  <Text type="supporting" color="secondary">
                    · {instagramHandle.startsWith('@') ? instagramHandle : `@${instagramHandle}`}
                  </Text>
                ) : null}
              </HStack>
            </VStack>
          </HStack>

          <HStack gap={1.5} align="center" wrap="wrap">
            <StatusTag
              label={windowMeta.label}
              tone={windowMeta.tone}
              showDot
              hasTabularNumbers
            />
            <Button
              label="Ver ficha"
              variant="secondary"
              size="sm"
              icon={<UserRound size={14} aria-hidden="true" />}
              href={clientProfileHref}
            />
            <Button
              label="wa.me"
              variant="ghost"
              size="sm"
              icon={<ExternalLink size={14} aria-hidden="true" />}
              href={waMeUrl}
              target="_blank"
              rel="noopener noreferrer"
            />
          </HStack>
        </HStack>
      </VStack>

      <HStack
        className="ad-wa-context-strip"
        justify="between"
        align="center"
        gap={2}
        wrap="wrap"
      >
        {nextBooking ? (
          <>
            <HStack gap={2} align="center" wrap="wrap" style={{ minWidth: 0, flex: '1 1 14rem' }}>
              <CalendarClock size={15} aria-hidden="true" />
              <Text size="sm" weight="semibold">
                {nextBooking.serviceName}
              </Text>
              <Text type="supporting" color="secondary" hasTabularNumbers>
                {formatDateShortInTimezone(nextBooking.startAt, timezone)} ·{' '}
                {formatTimeInTimezone(nextBooking.startAt, timezone)} · con {nextBooking.staffName}
              </Text>
              <Token size="sm" label={nextBooking.bookingCode} />
              <BookingStatusTag status={nextBooking.status} />
              {attendanceBadge ? (
                <StatusTag tone={attendanceBadge.tone} label={attendanceBadge.label} />
              ) : null}
              <Text type="supporting" color="secondary" hasTabularNumbers>
                {formatCurrency(nextBooking.totalPriceCents, currency)}
              </Text>
            </HStack>
            <HStack gap={1.5} align="center" wrap="wrap">
              {nextBooking.status !== 'canceled' ? (
                <Button
                  label="Cobrar"
                  variant="primary"
                  size="sm"
                  icon={<CreditCard size={14} aria-hidden="true" />}
                  href={agendaHref({ collect: nextBooking.bookingId })}
                />
              ) : null}
              <Button
                label="Abrir en Agenda"
                variant="secondary"
                size="sm"
                href={agendaHref({ q: nextBooking.bookingCode })}
              />
            </HStack>
          </>
        ) : (
          <>
            <Text type="supporting" color="secondary">
              Sin cita próxima registrada para esta clienta.
            </Text>
            <Button
              label="Agendar cita"
              variant="ghost"
              size="sm"
              icon={<CalendarPlus size={14} aria-hidden="true" />}
              href={agendaHref({ new: true })}
            />
          </>
        )}
      </HStack>
    </VStack>
  );
}
