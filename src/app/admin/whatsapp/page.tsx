'use client';

import { useMemo, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import { VStack } from '@astryxdesign/core/VStack';
import { HStack } from '@astryxdesign/core/HStack';
import { Text } from '@astryxdesign/core/Text';
import { Button } from '@astryxdesign/core/Button';
import { Banner } from '@astryxdesign/core/Banner';
import { TabList, Tab } from '@astryxdesign/core/TabList';
import { ExternalLink, RefreshCw } from 'lucide-react';
import { useAdminData } from '@/components/admin/AdminProvider';
import { AdminAccessGuard } from '@/components/admin/AdminAccessGuard';
import { WhatsAppInboxTab } from '@/components/admin/whatsapp/WhatsAppInboxTab';
import type {
  WhatsAppSendMessageInput,
  WhatsAppStartNewChatInput,
} from '@/components/admin/whatsapp/whatsappUiHelpers';
import { PageHeader, PageSkeleton, SkeletonBlock } from '@/components/ui';
import { useWhatsAppAutoScroll } from '@/lib/hooks/useWhatsAppAutoScroll';
import { useWhatsAppWorkspace } from '@/lib/hooks/useWhatsAppWorkspace';
import { roleCanAccess } from '@/lib/rbac';

function WhatsAppTabFallback() {
  return (
    <VStack
      gap={4}
      role="status"
      aria-live="polite"
      aria-busy="true"
      aria-label="Cargando sección de WhatsApp"
    >
      <SkeletonBlock width="100%" height="5.5rem" radius={3} index={0} />
      <SkeletonBlock width="100%" height="14rem" radius={3} index={1} />
      <SkeletonBlock width="100%" height="12rem" radius={3} index={2} />
    </VStack>
  );
}

const WhatsAppRemindersTab = dynamic(
  () =>
    import('@/components/admin/whatsapp/WhatsAppRemindersTab').then(
      (mod) => mod.WhatsAppRemindersTab,
    ),
  { ssr: false, loading: WhatsAppTabFallback },
);

const WhatsAppConnectionTab = dynamic(
  () =>
    import('@/components/admin/whatsapp/WhatsAppConnectionTab').then(
      (mod) => mod.WhatsAppConnectionTab,
    ),
  { ssr: false, loading: WhatsAppTabFallback },
);

export default function AdminWhatsAppPage() {
  const { data, loading, refresh } = useAdminData();
  const canAccessWhatsApp = Boolean(
    data && roleCanAccess(data.session.user.role, 'whatsapp'),
  );
  const workspace = useWhatsAppWorkspace({
    enabled: canAccessWhatsApp,
    onRefreshOverview: refresh,
  });
  const [manualNewChatOpen, setManualNewChatOpen] = useState(false);
  const timelineRef = useRef<HTMLElement | null>(null);

  const threadMessages = workspace.threadDetail?.messages;
  const lastMessageId =
    threadMessages && threadMessages.length > 0
      ? (threadMessages[threadMessages.length - 1]?.id ?? '')
      : '';
  const scrollKey = threadMessages
    ? `${threadMessages.length}:${lastMessageId}`
    : null;

  useWhatsAppAutoScroll(timelineRef, scrollKey, {
    enabled:
      canAccessWhatsApp &&
      workspace.activeTab === 'mensajes' &&
      Boolean(workspace.selectedThreadId),
    threadKey: workspace.selectedThreadId,
  });

  const clientOptions = useMemo(
    () =>
      (data?.clients ?? []).map((client) => ({
        id: client.id,
        fullName: client.fullName,
        phoneE164: client.phoneE164,
      })),
    [data],
  );

  if (loading || !data) {
    return (
      <PageSkeleton
        kpiCount={4}
        withSplit
        ariaLabel="Cargando panel de WhatsApp"
      />
    );
  }

  const role = data.session.user.role;
  const settings = data.settings;
  const timezone = settings.timezone || 'America/Mexico_City';
  const summary = workspace.summary;
  const quota =
    (workspace.activeTab === 'conexion'
      ? (workspace.settingsData?.usage ??
        workspace.threadsData?.quota ??
        data.whatsappUsage)
      : (workspace.threadDetail?.quota ??
        workspace.threadsData?.quota ??
        workspace.settingsData?.usage ??
        data.whatsappUsage)) ?? {
      monthKey: data.serverTodayKey.slice(0, 7),
      sentCount: 0,
      quotaLimit: settings.whatsappMonthlyQuota ?? 500,
      percentUsed: 0,
      alertLevel: 'ok' as const,
      warned80At: null,
      warned100At: null,
    };

  const pendingRemindersCount =
    workspace.remindersData?.metrics.pendingCount ??
    summary.pendingRemindersCount;
  const failedItemsCount =
    summary.failedCount +
    (workspace.remindersData?.metrics.failedCount ??
      summary.failedRemindersCount);
  const isNewChatOpen = manualNewChatOpen || Boolean(workspace.newChatPrefill);
  const isRefreshing =
    workspace.isLoadingThreads ||
    workspace.isLoadingReminders ||
    workspace.isLoadingSettings;

  const handleTabChange = (nextValue: string) => {
    if (
      nextValue === 'mensajes' ||
      nextValue === 'recordatorios' ||
      nextValue === 'conexion'
    ) {
      workspace.setActiveTab(nextValue);
    }
  };

  const handleNewChatOpenChange = (open: boolean) => {
    setManualNewChatOpen(open);
    if (!open) {
      workspace.clearNewChatPrefill();
    }
  };

  const handleSendMessage = (input: WhatsAppSendMessageInput) =>
    workspace.sendMessage({
      ...input,
      bookingId: input.bookingId ?? workspace.contextBookingId ?? undefined,
    });

  const handleStartNewChat = async (input: WhatsAppStartNewChatInput) => {
    const result = await workspace.sendMessage({
      mode: 'template',
      phoneE164: input.phoneE164,
      contactName: input.contactName,
      bookingId:
        workspace.newChatPrefill?.bookingId ??
        workspace.contextBookingId ??
        undefined,
      triggerKey: input.triggerKey,
      templateName: input.templateName,
      parameters: input.parameters,
    });
    if (result.ok) {
      setManualNewChatOpen(false);
      workspace.clearNewChatPrefill();
    }
    return result;
  };

  const handleOpenChatFromTab = (phoneE164: string) => {
    workspace.openThreadByPhone(phoneE164);
  };

  return (
    <AdminAccessGuard
      role={role}
      section="whatsapp"
      sectionLabel="WhatsApp"
    >
      <VStack gap={4} className="ad-page fx-fade-up">
        <PageHeader
          title="WhatsApp"
          subtitle="Conversaciones con clientas, recordatorios automáticos y conexión con WhatsApp Business."
          actions={
            <Button
              type="button"
              label="Actualizar"
              variant="secondary"
              size="sm"
              icon={<RefreshCw size={14} aria-hidden="true" />}
              isLoading={isRefreshing}
              isDisabled={isRefreshing}
              onClick={workspace.refreshAll}
            />
          }
        />

        <HStack
          className="ad-cal-kpi-strip"
          gap={2}
          align="center"
          wrap="wrap"
          aria-label="Resumen de WhatsApp"
        >
          <button
            type="button"
            className="ad-cal-strip-btn"
            onClick={() => {
              workspace.setActiveTab('mensajes');
              workspace.setFilter(
                workspace.filter === 'unread' ? 'all' : 'unread',
              );
            }}
          >
            <Text
              className="lk-serif ad-cal-strip-num"
              color={summary.unreadCount > 0 ? 'accent' : 'primary'}
              hasTabularNumbers
            >
              {summary.unreadCount}
            </Text>
            <Text type="supporting" color="secondary">
              Sin leer
            </Text>
          </button>

          <Text color="secondary" aria-hidden="true">
            ·
          </Text>

          <button
            type="button"
            className="ad-cal-strip-btn"
            onClick={() => {
              workspace.setActiveTab('mensajes');
              workspace.setFilter(
                workspace.filter === 'window_open' ? 'all' : 'window_open',
              );
            }}
          >
            <Text className="lk-serif ad-cal-strip-num" hasTabularNumbers>
              {summary.windowOpenCount}
            </Text>
            <Text type="supporting" color="secondary">
              Ventanas 24 h
            </Text>
          </button>

          <Text color="secondary" aria-hidden="true">
            ·
          </Text>

          <button
            type="button"
            className="ad-cal-strip-btn"
            onClick={() => workspace.setActiveTab('recordatorios')}
          >
            <Text
              className="lk-serif ad-cal-strip-num"
              color={failedItemsCount > 0 ? 'accent' : 'primary'}
              hasTabularNumbers
            >
              {pendingRemindersCount} / {failedItemsCount}
            </Text>
            <Text type="supporting" color="secondary">
              Pendientes / fallidos
            </Text>
          </button>

          <Text color="secondary" aria-hidden="true">
            ·
          </Text>

          <button
            type="button"
            className="ad-cal-strip-btn"
            onClick={() => workspace.setActiveTab('conexion')}
          >
            <Text type="supporting" color="secondary">
              Cuota
            </Text>
            <Text
              className="lk-serif ad-cal-strip-num"
              color={quota.alertLevel !== 'ok' ? 'accent' : 'primary'}
              hasTabularNumbers
            >
              {quota.sentCount}/{quota.quotaLimit}
            </Text>
          </button>
        </HStack>

        {workspace.banner ? (
          <Banner
            status={workspace.banner.status}
            role={workspace.banner.status === 'error' ? 'alert' : 'status'}
            title={workspace.banner.title}
            description={workspace.banner.description}
            endContent={
              workspace.banner.fallbackWaMeUrl ? (
                <Button
                  label="Abrir en wa.me"
                  variant="secondary"
                  size="sm"
                  icon={<ExternalLink size={14} aria-hidden="true" />}
                  href={workspace.banner.fallbackWaMeUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                />
              ) : undefined
            }
            isDismissable
            onDismiss={workspace.dismissBanner}
          />
        ) : null}

        <TabList
          value={workspace.activeTab}
          onChange={handleTabChange}
          hasDivider
        >
          <Tab value="mensajes" label="Mensajes" />
          <Tab value="recordatorios" label="Recordatorios" />
          <Tab value="conexion" label="Conexión y plantillas" />
        </TabList>

        {workspace.activeTab === 'mensajes' ? (
          <WhatsAppInboxTab
            threads={workspace.threads}
            summary={summary}
            selectedThreadId={workspace.selectedThreadId}
            threadDetail={workspace.threadDetail}
            filter={workspace.filter}
            searchQuery={workspace.searchQuery}
            isLoadingThreads={workspace.isLoadingThreads}
            isLoadingDetail={workspace.isLoadingDetail}
            isSending={workspace.isSending}
            retryingMessageId={workspace.retryingMessageId}
            quotaPercent={quota.percentUsed}
            quotaReached={quota.alertLevel === 'limit_100'}
            studioName={settings.name}
            studioAddress={settings.address ?? undefined}
            timezone={timezone}
            currency={settings.currency}
            appUrl={data.integration.appUrl}
            serverNowIso={
              workspace.threadsData?.serverNowIso ??
              workspace.threadDetail?.serverNowIso ??
              data.serverNowIso
            }
            clients={clientOptions}
            newChatOpen={isNewChatOpen}
            initialNewChatPhone={workspace.newChatPrefill?.phoneE164 ?? null}
            initialNewChatName={workspace.newChatPrefill?.clientName ?? null}
            onNewChatOpenChange={handleNewChatOpenChange}
            timelineContainerRef={timelineRef}
            onFilterChange={workspace.setFilter}
            onSearchChange={workspace.setSearchQuery}
            onSelectThread={workspace.setSelectedThreadId}
            onSendMessage={handleSendMessage}
            onRetryMessage={workspace.retryMessage}
            onStartNewChat={handleStartNewChat}
            onRefresh={workspace.refreshThreads}
          />
        ) : workspace.activeTab === 'recordatorios' ? (
          <WhatsAppRemindersTab
            data={workspace.remindersData}
            isLoading={workspace.isLoadingReminders}
            isSubmitting={workspace.isSubmittingReminder}
            role={role}
            studioName={settings.name}
            initialFilter={workspace.initialReminderFilter}
            onRunAction={workspace.runReminderAction}
            onOpenChat={handleOpenChatFromTab}
            onRefresh={workspace.refreshReminders}
          />
        ) : (
          <WhatsAppConnectionTab
            data={workspace.settingsData}
            isLoading={workspace.isLoadingSettings}
            isSubmitting={workspace.isSubmittingSettings}
            isCheckingLive={workspace.isCheckingLive}
            isSimulating={workspace.isSimulating}
            simulationResult={workspace.simulationResult}
            role={role}
            onRefreshLive={() => void workspace.refreshLiveMeta()}
            onRunSettingsAction={workspace.runSettingsAction}
            onRunSimulation={workspace.runSimulation}
            onOpenChat={handleOpenChatFromTab}
          />
        )}
      </VStack>
    </AdminAccessGuard>
  );
}
