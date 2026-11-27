'use client';

import type React from 'react';
import { VStack } from '@astryxdesign/core/VStack';
import { Button } from '@astryxdesign/core/Button';
import { MessageCircle, SquarePen } from 'lucide-react';
import type {
  WhatsAppThreadDetailResponseDTO,
  WhatsAppThreadSummaryDTO,
} from '@/lib/contracts';
import { EmptyStateCard } from '@/components/ui';
import {
  buildWaMeDirectUrl,
  formatWhatsAppWindowBadge,
  type WhatsAppInboxActionResult,
  type WhatsAppSendMessageInput,
} from './whatsappUiHelpers';
import { WhatsAppChatHeader } from './WhatsAppChatHeader';
import { WhatsAppMessageTimeline } from './WhatsAppMessageTimeline';
import { WhatsAppComposer } from './WhatsAppComposer';

interface WhatsAppChatPaneProps {
  selectedThread: WhatsAppThreadSummaryDTO | null;
  threadDetail: WhatsAppThreadDetailResponseDTO | null;
  isLoadingDetail: boolean;
  isSending: boolean;
  retryingMessageId: string | null;
  quotaPercent: number;
  quotaReached: boolean;
  studioName: string;
  studioAddress?: string;
  timezone: string;
  currency: 'MXN' | 'USD';
  appUrl?: string;
  nowMs: number;
  showBackButton: boolean;
  timelineContainerRef?: React.RefObject<HTMLElement | null>;
  onBack: () => void;
  onOpenNewChat: () => void;
  onSendMessage: (input: WhatsAppSendMessageInput) => Promise<WhatsAppInboxActionResult>;
  onRetryMessage: (messageId: string) => Promise<WhatsAppInboxActionResult>;
}

export function WhatsAppChatPane({
  selectedThread,
  threadDetail,
  isLoadingDetail,
  isSending,
  retryingMessageId,
  quotaPercent,
  quotaReached,
  studioName,
  studioAddress,
  timezone,
  currency,
  appUrl,
  nowMs,
  showBackButton,
  timelineContainerRef,
  onBack,
  onOpenNewChat,
  onSendMessage,
  onRetryMessage,
}: WhatsAppChatPaneProps) {
  const activeThread =
    threadDetail && selectedThread && threadDetail.thread.id === selectedThread.id
      ? threadDetail.thread
      : selectedThread ?? threadDetail?.thread ?? null;

  if (!activeThread) {
    return (
      <VStack
        as="section"
        className="ad-wa-chat ad-card-empty-center"
        aria-label="Sin conversación seleccionada"
        padding={5}
      >
        <EmptyStateCard
          framed={false}
          icon={<MessageCircle size={24} aria-hidden="true" />}
          title="Selecciona una conversación"
          description="Elige una clienta de la lista para ver sus mensajes, estado de ventana de 24 horas y próxima cita."
          actions={
            <Button
              type="button"
              label="Iniciar nueva conversación"
              variant="primary"
              size="sm"
              icon={<SquarePen size={14} aria-hidden="true" />}
              onClick={onOpenNewChat}
            />
          }
        />
      </VStack>
    );
  }

  const detailMatches = threadDetail?.thread.id === activeThread.id;
  const messages = detailMatches ? threadDetail.messages : [];
  const client = detailMatches ? threadDetail.client : null;
  const nextBooking =
    activeThread.nextBooking ??
    (detailMatches ? (threadDetail.bookings[0] ?? null) : null);
  const waMeUrl =
    (detailMatches ? threadDetail.waMeUrl : null) ||
    buildWaMeDirectUrl(activeThread.phoneE164);
  const liveWindow = formatWhatsAppWindowBadge(activeThread.serviceWindow, nowMs);

  return (
    <VStack
      as="section"
      className="ad-wa-chat"
      gap={0}
      aria-label={`Conversación con ${activeThread.contactName}`}
    >
      <WhatsAppChatHeader
        thread={activeThread}
        client={client}
        nextBooking={nextBooking}
        waMeUrl={waMeUrl}
        nowMs={nowMs}
        timezone={timezone}
        currency={currency}
        showBackButton={showBackButton}
        onBack={onBack}
      />

      <WhatsAppMessageTimeline
        messages={messages}
        isLoading={isLoadingDetail && !detailMatches}
        retryingMessageId={retryingMessageId}
        nowMs={nowMs}
        timezone={timezone}
        containerRef={timelineContainerRef}
        onRetryMessage={onRetryMessage}
      />

      <WhatsAppComposer
        key={activeThread.id}
        thread={activeThread}
        nextBooking={nextBooking}
        quickReplies={detailMatches ? threadDetail.quickReplies : []}
        templates={detailMatches ? threadDetail.templates : []}
        templateCatalog={detailMatches ? threadDetail.templateCatalog : []}
        waMeUrl={waMeUrl}
        isWindowOpen={liveWindow.isOpen}
        isSending={isSending}
        quotaPercent={quotaPercent}
        quotaReached={quotaReached}
        studioName={studioName}
        studioAddress={studioAddress}
        timezone={timezone}
        appUrl={appUrl}
        onSendMessage={onSendMessage}
      />
    </VStack>
  );
}
