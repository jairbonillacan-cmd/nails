'use client';

import type React from 'react';
import { useMemo, useState } from 'react';
import { VStack } from '@astryxdesign/core/VStack';
import type {
  WhatsAppInboxSummaryDTO,
  WhatsAppThreadDetailResponseDTO,
  WhatsAppThreadSummaryDTO,
} from '@/lib/contracts';
import { useCurrentClockTick } from '@/lib/hooks/useCurrentClockTick';
import { useIsNarrowScreen } from '@/lib/hooks/useIsNarrowScreen';
import {
  NewWhatsAppChatDialog,
  type NewWhatsAppChatClientOption,
} from './NewWhatsAppChatDialog';
import { WhatsAppThreadList } from './WhatsAppThreadList';
import { WhatsAppChatPane } from './WhatsAppChatPane';
import type {
  WhatsAppInboxActionResult,
  WhatsAppSendMessageInput,
  WhatsAppStartNewChatInput,
  WhatsAppThreadFilter,
} from './whatsappUiHelpers';

export interface WhatsAppInboxTabProps {
  threads: readonly WhatsAppThreadSummaryDTO[];
  summary: WhatsAppInboxSummaryDTO | null;
  selectedThreadId: string | null;
  threadDetail: WhatsAppThreadDetailResponseDTO | null;
  filter: WhatsAppThreadFilter;
  searchQuery: string;
  isLoadingThreads: boolean;
  isLoadingDetail: boolean;
  isSending: boolean;
  retryingMessageId: string | null;
  quotaPercent: number;
  quotaReached: boolean;
  studioName: string;
  studioAddress?: string;
  timezone?: string;
  currency?: 'MXN' | 'USD';
  appUrl?: string;
  serverNowIso?: string;
  clients?: readonly NewWhatsAppChatClientOption[];
  newChatOpen?: boolean;
  initialNewChatPhone?: string | null;
  initialNewChatName?: string | null;
  onNewChatOpenChange?: (open: boolean) => void;
  timelineContainerRef?: React.RefObject<HTMLElement | null>;
  onFilterChange: (filter: WhatsAppThreadFilter) => void;
  onSearchChange: (query: string) => void;
  onSelectThread: (threadId: string | null) => void;
  onSendMessage: (input: WhatsAppSendMessageInput) => Promise<WhatsAppInboxActionResult>;
  onRetryMessage: (messageId: string) => Promise<WhatsAppInboxActionResult>;
  onStartNewChat: (input: WhatsAppStartNewChatInput) => Promise<WhatsAppInboxActionResult>;
  onRefresh: () => void;
}

export function WhatsAppInboxTab({
  threads,
  summary,
  selectedThreadId,
  threadDetail,
  filter,
  searchQuery,
  isLoadingThreads,
  isLoadingDetail,
  isSending,
  retryingMessageId,
  quotaPercent,
  quotaReached,
  studioName,
  studioAddress,
  timezone = 'America/Mexico_City',
  currency = 'MXN',
  appUrl,
  serverNowIso,
  clients,
  newChatOpen,
  initialNewChatPhone = null,
  initialNewChatName = null,
  onNewChatOpenChange,
  timelineContainerRef,
  onFilterChange,
  onSearchChange,
  onSelectThread,
  onSendMessage,
  onRetryMessage,
  onStartNewChat,
  onRefresh,
}: WhatsAppInboxTabProps) {
  const isNarrowScreen = useIsNarrowScreen();
  const [internalNewChatOpen, setInternalNewChatOpen] = useState(false);
  const [mobileView, setMobileView] = useState<'list' | 'chat'>(() =>
    selectedThreadId ? 'chat' : 'list',
  );
  const [trackedThreadId, setTrackedThreadId] = useState<string | null>(selectedThreadId);

  if (trackedThreadId !== selectedThreadId) {
    setTrackedThreadId(selectedThreadId);
    if (selectedThreadId) {
      setMobileView('chat');
    } else {
      setMobileView('list');
    }
  }

  const clockSeedIso = serverNowIso || threadDetail?.serverNowIso || '';
  const liveClockMs = useCurrentClockTick(clockSeedIso, 30_000);
  const effectiveNowMs = liveClockMs > 0 ? liveClockMs : Date.parse(clockSeedIso) || 0;

  const isDialogControlled = typeof newChatOpen === 'boolean';
  const dialogOpen = isDialogControlled ? newChatOpen : internalNewChatOpen;
  const setDialogOpen = (open: boolean) => {
    if (!isDialogControlled) {
      setInternalNewChatOpen(open);
    }
    onNewChatOpenChange?.(open);
  };

  const selectedThread = useMemo(() => {
    if (!selectedThreadId) return null;
    const fromList = threads.find((t) => t.id === selectedThreadId) ?? null;
    if (fromList) return fromList;
    if (threadDetail?.thread.id === selectedThreadId) return threadDetail.thread;
    return null;
  }, [threads, selectedThreadId, threadDetail]);

  const activeDataView: 'list' | 'chat' =
    mobileView === 'chat' && selectedThread ? 'chat' : 'list';

  const handleSelectThread = (threadId: string) => {
    setMobileView('chat');
    onSelectThread(threadId);
  };

  const handleBackToList = () => {
    setMobileView('list');
    if (isNarrowScreen) {
      onSelectThread(null);
    }
  };

  return (
    <>
      <VStack
        className="ad-wa-split"
        data-view={activeDataView}
        gap={0}
      >
        <WhatsAppThreadList
          threads={threads}
          summary={summary}
          selectedThreadId={selectedThreadId}
          filter={filter}
          searchQuery={searchQuery}
          isLoading={isLoadingThreads}
          nowMs={effectiveNowMs}
          timezone={timezone}
          onFilterChange={onFilterChange}
          onSearchChange={onSearchChange}
          onSelectThread={handleSelectThread}
          onOpenNewChat={() => setDialogOpen(true)}
          onRefresh={onRefresh}
        />

        <WhatsAppChatPane
          selectedThread={selectedThread}
          threadDetail={threadDetail}
          isLoadingDetail={isLoadingDetail}
          isSending={isSending}
          retryingMessageId={retryingMessageId}
          quotaPercent={quotaPercent}
          quotaReached={quotaReached}
          studioName={studioName}
          studioAddress={studioAddress}
          timezone={timezone}
          currency={currency}
          appUrl={appUrl}
          nowMs={effectiveNowMs}
          showBackButton={isNarrowScreen}
          timelineContainerRef={timelineContainerRef}
          onBack={handleBackToList}
          onOpenNewChat={() => setDialogOpen(true)}
          onSendMessage={onSendMessage}
          onRetryMessage={onRetryMessage}
        />
      </VStack>

      <NewWhatsAppChatDialog
        isOpen={dialogOpen}
        onOpenChange={setDialogOpen}
        initialPhone={initialNewChatPhone}
        initialName={initialNewChatName}
        studioName={studioName}
        studioAddress={studioAddress}
        timezone={timezone}
        appUrl={appUrl}
        templateCatalog={threadDetail?.templateCatalog}
        configuredTemplates={threadDetail?.templates}
        clients={clients}
        quotaReached={quotaReached}
        onStartNewChat={onStartNewChat}
      />
    </>
  );
}
