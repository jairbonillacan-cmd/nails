'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import type { z } from 'zod';
import type {
  WhatsAppInboxSummaryDTO,
  WhatsAppRemindersActionSchema,
  WhatsAppRemindersResponseDTO,
  WhatsAppSendMessageSchema,
  WhatsAppSendResponseDTO,
  WhatsAppSettingsActionSchema,
  WhatsAppSettingsResponseDTO,
  WhatsAppSimulateEventSchema,
  WhatsAppSimulateResponseDTO,
  WhatsAppThreadDetailResponseDTO,
  WhatsAppThreadFilterSchema,
  WhatsAppThreadsListResponseDTO,
  WhatsAppThreadSummaryDTO,
} from '@/lib/contracts';
import { whatsappHref, type WhatsAppFilterParam } from '@/lib/admin-links';
import type { AdminOverviewPayload } from '@/lib/admin/overview-types';
import { canonicalizeWhatsAppPhoneE164 } from '@/lib/notifications/whatsapp-inbox';
import {
  ADMIN_CACHE_KEYS,
  fetchAdminJson,
  invalidateAdminCache,
  mutateAdminCache,
  useAdminCachedQuery,
} from './useAdminCache';

export type WhatsAppTabId = 'mensajes' | 'recordatorios' | 'conexion';
type WhatsAppThreadFilter = z.infer<typeof WhatsAppThreadFilterSchema>;
type WhatsAppReminderFilter = 'pending' | 'sent' | 'failed' | 'canceled';
type WhatsAppSendMessageInput = z.input<typeof WhatsAppSendMessageSchema>;
type WhatsAppRemindersActionInput = z.input<typeof WhatsAppRemindersActionSchema>;
type WhatsAppSettingsActionInput = z.input<typeof WhatsAppSettingsActionSchema>;
type WhatsAppSimulateEventInput = z.input<typeof WhatsAppSimulateEventSchema>;

interface WhatsAppBannerState {
  status: 'success' | 'error' | 'warning';
  title: string;
  description?: string;
  fallbackWaMeUrl?: string;
}

interface WhatsAppNewChatPrefill {
  phoneE164: string;
  clientName?: string;
  bookingId?: string | null;
}

interface WhatsAppSendActionResult {
  ok: boolean;
  error?: string;
  code?: string;
  fallbackWaMeUrl?: string;
  threadId?: string;
}

interface UseWhatsAppWorkspaceOptions {
  enabled: boolean;
  onRefreshOverview?: () => Promise<void>;
  pollIntervalMs?: number;
}

export interface UseWhatsAppWorkspaceReturn {
  activeTab: WhatsAppTabId;
  setActiveTab: (tab: WhatsAppTabId) => void;
  filter: WhatsAppThreadFilter;
  setFilter: (filter: WhatsAppThreadFilter) => void;
  initialReminderFilter: WhatsAppReminderFilter | undefined;
  searchQuery: string;
  setSearchQuery: (query: string) => void;
  selectedThreadId: string | null;
  setSelectedThreadId: (threadId: string | null) => void;
  contextBookingId: string | null;
  newChatPrefill: WhatsAppNewChatPrefill | null;
  clearNewChatPrefill: () => void;
  threadsData: WhatsAppThreadsListResponseDTO | null;
  threads: WhatsAppThreadSummaryDTO[];
  summary: WhatsAppInboxSummaryDTO;
  threadDetail: WhatsAppThreadDetailResponseDTO | null;
  remindersData: WhatsAppRemindersResponseDTO | null;
  settingsData: WhatsAppSettingsResponseDTO | null;
  simulationResult: WhatsAppSimulateResponseDTO | null;
  isLoadingThreads: boolean;
  isLoadingDetail: boolean;
  isLoadingReminders: boolean;
  isLoadingSettings: boolean;
  isSending: boolean;
  retryingMessageId: string | null;
  isSubmittingReminder: boolean;
  isSubmittingSettings: boolean;
  isCheckingLive: boolean;
  isSimulating: boolean;
  banner: WhatsAppBannerState | null;
  dismissBanner: () => void;
  sendMessage: (input: WhatsAppSendMessageInput) => Promise<WhatsAppSendActionResult>;
  retryMessage: (messageId: string) => Promise<boolean>;
  runReminderAction: (action: WhatsAppRemindersActionInput) => Promise<boolean>;
  runSettingsAction: (action: WhatsAppSettingsActionInput) => Promise<boolean>;
  runSimulation: (input: WhatsAppSimulateEventInput) => Promise<boolean>;
  refreshLiveMeta: () => Promise<void>;
  refreshThreads: () => void;
  refreshReminders: () => void;
  refreshSettings: () => void;
  refreshAll: () => void;
  openThreadByPhone: (
    phone: string,
    options?: { clientName?: string | null; bookingId?: string | null },
  ) => void;
}

const EMPTY_SUMMARY: WhatsAppInboxSummaryDTO = {
  unreadCount: 0,
  failedCount: 0,
  failedRemindersCount: 0,
  pendingRemindersCount: 0,
  windowOpenCount: 0,
  totalThreads: 0,
};

const DEFAULT_POLL_MS = 15_000;
const SEARCH_DEBOUNCE_MS = 220;

export function parseWhatsAppTabParam(raw: string | null | undefined): WhatsAppTabId {
  const normalized = (raw ?? '').trim().toLowerCase();
  if (normalized === 'recordatorios' || normalized === 'reminders') return 'recordatorios';
  if (normalized === 'conexion' || normalized === 'settings' || normalized === 'plantillas') {
    return 'conexion';
  }
  return 'mensajes';
}

export function parseWhatsAppThreadFilterParam(
  raw: string | null | undefined,
): WhatsAppThreadFilter {
  const normalized = (raw ?? '').trim().toLowerCase();
  if (normalized === 'unread') return 'unread';
  if (normalized === 'window_open' || normalized === 'window') return 'window_open';
  if (normalized === 'failed') return 'failed';
  return 'all';
}

export function parseWhatsAppReminderFilterParam(
  raw: string | null | undefined,
): WhatsAppReminderFilter | undefined {
  const normalized = (raw ?? '').trim().toLowerCase();
  if (
    normalized === 'pending' ||
    normalized === 'sent' ||
    normalized === 'failed' ||
    normalized === 'canceled'
  ) {
    return normalized;
  }
  return undefined;
}

export function findMatchingThreadByTarget(
  threads: readonly WhatsAppThreadSummaryDTO[],
  target: { phone?: string | null; clientId?: string | null },
): WhatsAppThreadSummaryDTO | null {
  if (target.clientId) {
    const byClient = threads.find((thread) => thread.clientId === target.clientId);
    if (byClient) return byClient;
  }
  if (target.phone) {
    const canonical = canonicalizeWhatsAppPhoneE164(target.phone);
    if (canonical) {
      const byPhone = threads.find(
        (thread) => canonicalizeWhatsAppPhoneE164(thread.phoneE164) === canonical,
      );
      if (byPhone) return byPhone;
    }
  }
  return null;
}

function describeReminderActionSuccess(action: WhatsAppRemindersActionInput): string {
  switch (action.action) {
    case 'toggle_workflow':
      return action.isEnabled ? 'Aviso automático activado.' : 'Aviso automático pausado.';
    case 'update_workflow':
      return 'Mensaje y programación actualizados.';
    case 'retry_notification':
      return 'Recordatorio reprogramado en cola para envío inmediato.';
    case 'cancel_notification':
      return 'Recordatorio cancelado.';
    case 'trigger_now':
      return 'Recordatorio enviado ahora.';
    case 'run_due_now':
      return 'Cola de recordatorios ejecutada.';
    case 'send_test_reminder':
      return 'Recordatorio de prueba enviado.';
  }
}

function describeSettingsActionSuccess(action: WhatsAppSettingsActionInput): string {
  switch (action.action) {
    case 'update_settings':
      return 'Ajustes de WhatsApp guardados.';
    case 'update_template':
      return 'Plantilla oficial actualizada.';
    case 'sync_meta_templates':
      return 'Plantillas sincronizadas con Meta.';
    case 'send_test':
      return 'Mensaje de prueba enviado.';
  }
}

export function useWhatsAppWorkspace({
  enabled,
  onRefreshOverview,
  pollIntervalMs = DEFAULT_POLL_MS,
}: UseWhatsAppWorkspaceOptions): UseWhatsAppWorkspaceReturn {
  const router = useRouter();
  const searchParams = useSearchParams();

  const paramTab = searchParams.get('tab');
  const paramPhone = searchParams.get('phone')?.trim() ?? '';
  const paramClientId = searchParams.get('clientId')?.trim() ?? '';
  const paramBookingId = searchParams.get('bookingId')?.trim() ?? '';
  const paramFilter = searchParams.get('filter')?.trim() ?? '';

  const [activeTab, setActiveTabState] = useState<WhatsAppTabId>(() =>
    parseWhatsAppTabParam(paramTab),
  );
  const [filter, setFilterState] = useState<WhatsAppThreadFilter>(() =>
    parseWhatsAppTabParam(paramTab) === 'mensajes'
      ? parseWhatsAppThreadFilterParam(paramFilter)
      : 'all',
  );
  const [initialReminderFilter, setInitialReminderFilter] = useState<
    WhatsAppReminderFilter | undefined
  >(() =>
    parseWhatsAppTabParam(paramTab) === 'recordatorios'
      ? parseWhatsAppReminderFilterParam(paramFilter)
      : undefined,
  );
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [selectedThreadId, setSelectedThreadIdState] = useState<string | null>(null);
  const [contextBookingId, setContextBookingId] = useState<string | null>(
    paramBookingId || null,
  );
  const [newChatPrefill, setNewChatPrefill] = useState<WhatsAppNewChatPrefill | null>(null);
  const [pendingTarget, setPendingTarget] = useState<{
    phone: string;
    clientId: string;
    clientName?: string;
    bookingId: string | null;
  } | null>(() =>
    paramPhone || paramClientId
      ? {
          phone: paramPhone,
          clientId: paramClientId,
          bookingId: paramBookingId || null,
        }
      : null,
  );
  const [banner, setBanner] = useState<WhatsAppBannerState | null>(null);
  const [isSending, setIsSending] = useState(false);
  const [retryingMessageId, setRetryingMessageId] = useState<string | null>(null);
  const [isSubmittingReminder, setIsSubmittingReminder] = useState(false);
  const [isSubmittingSettings, setIsSubmittingSettings] = useState(false);
  const [isCheckingLive, setIsCheckingLive] = useState(false);
  const [isSimulating, setIsSimulating] = useState(false);
  const [simulationResult, setSimulationResult] = useState<WhatsAppSimulateResponseDTO | null>(
    null,
  );

  const urlSignature = `${paramTab ?? ''}|${paramPhone}|${paramClientId}|${paramBookingId}|${paramFilter}`;
  const [appliedUrlSignature, setAppliedUrlSignature] = useState<string>(urlSignature);
  const [expectedUrlSignature, setExpectedUrlSignature] = useState<string | null>(null);

  const lastMarkedReadKeyRef = useRef<string>('');
  const refreshOverviewRef = useRef(onRefreshOverview);

  if (urlSignature !== appliedUrlSignature) {
    setAppliedUrlSignature(urlSignature);
    if (urlSignature === expectedUrlSignature) {
      setExpectedUrlSignature(null);
    } else {
      setExpectedUrlSignature(null);
      const nextTab = paramPhone || paramClientId ? 'mensajes' : parseWhatsAppTabParam(paramTab);
      setActiveTabState(nextTab);
      if (paramPhone || paramClientId) {
        setFilterState('all');
        setSearchQuery('');
        setDebouncedSearch('');
        setPendingTarget({
          phone: paramPhone,
          clientId: paramClientId,
          bookingId: paramBookingId || null,
        });
      } else if (nextTab === 'mensajes') {
        setFilterState(parseWhatsAppThreadFilterParam(paramFilter));
      } else if (nextTab === 'recordatorios') {
        setInitialReminderFilter(parseWhatsAppReminderFilterParam(paramFilter));
      }
      if (paramBookingId) {
        setContextBookingId(paramBookingId);
      }
    }
  }

  useEffect(() => {
    refreshOverviewRef.current = onRefreshOverview;
  }, [onRefreshOverview]);

  useEffect(() => {
    const trimmed = searchQuery.trim();
    if (trimmed === debouncedSearch) return;
    const timer = window.setTimeout(() => {
      setDebouncedSearch(trimmed);
    }, SEARCH_DEBOUNCE_MS);
    return () => {
      window.clearTimeout(timer);
    };
  }, [debouncedSearch, searchQuery]);

  const threadsKey = enabled ? ADMIN_CACHE_KEYS.whatsappThreads(filter, debouncedSearch) : null;
  const threadsQuery = useAdminCachedQuery<WhatsAppThreadsListResponseDTO>(
    threadsKey,
    (signal) => fetchAdminJson<WhatsAppThreadsListResponseDTO>(threadsKey ?? '', signal),
    { enabled: Boolean(threadsKey), staleTimeMs: 10_000 },
  );

  const detailKey =
    enabled && selectedThreadId
      ? ADMIN_CACHE_KEYS.whatsappThreadDetail(selectedThreadId)
      : null;
  const detailQuery = useAdminCachedQuery<WhatsAppThreadDetailResponseDTO>(
    detailKey,
    (signal) => fetchAdminJson<WhatsAppThreadDetailResponseDTO>(detailKey ?? '', signal),
    { enabled: Boolean(detailKey), staleTimeMs: 5_000 },
  );

  const remindersKey =
    enabled && activeTab === 'recordatorios' ? ADMIN_CACHE_KEYS.whatsappReminders : null;
  const remindersQuery = useAdminCachedQuery<WhatsAppRemindersResponseDTO>(
    remindersKey,
    (signal) => fetchAdminJson<WhatsAppRemindersResponseDTO>(ADMIN_CACHE_KEYS.whatsappReminders, signal),
    { enabled: Boolean(remindersKey), staleTimeMs: 10_000 },
  );

  const settingsKey =
    enabled && activeTab === 'conexion' ? ADMIN_CACHE_KEYS.whatsappSettings : null;
  const settingsQuery = useAdminCachedQuery<WhatsAppSettingsResponseDTO>(
    settingsKey,
    (signal) => fetchAdminJson<WhatsAppSettingsResponseDTO>(ADMIN_CACHE_KEYS.whatsappSettings, signal),
    { enabled: Boolean(settingsKey), staleTimeMs: 15_000 },
  );

  const threads = useMemo(() => threadsQuery.data?.threads ?? [], [threadsQuery.data]);
  const summary = threadsQuery.data?.summary ?? EMPTY_SUMMARY;

  if (enabled && pendingTarget && threadsQuery.data) {
    const matched = findMatchingThreadByTarget(threadsQuery.data.threads, {
      phone: pendingTarget.phone,
      clientId: pendingTarget.clientId,
    });
    if (matched) {
      setSelectedThreadIdState(matched.id);
      setNewChatPrefill(null);
      setPendingTarget(null);
    } else if (filter !== 'all' || debouncedSearch !== '') {
      setFilterState('all');
      setSearchQuery('');
      setDebouncedSearch('');
    } else {
      const canonical = canonicalizeWhatsAppPhoneE164(pendingTarget.phone);
      if (canonical) {
        setNewChatPrefill({
          phoneE164: canonical,
          clientName: pendingTarget.clientName,
          bookingId: pendingTarget.bookingId,
        });
      }
      setPendingTarget(null);
    }
  }

  const markThreadReadOptimistic = useCallback(
    async (thread: WhatsAppThreadSummaryDTO) => {
      if (thread.unreadCount <= 0) return;
      const readKey = `${thread.id}:${thread.lastMessageAt ?? ''}:${thread.unreadCount}`;
      if (lastMarkedReadKeyRef.current === readKey) return;
      lastMarkedReadKeyRef.current = readKey;

      const delta = thread.unreadCount;
      if (threadsKey) {
        mutateAdminCache<WhatsAppThreadsListResponseDTO>(threadsKey, (prev) => {
          if (!prev) return prev;
          return {
            ...prev,
            summary: {
              ...prev.summary,
              unreadCount: Math.max(0, prev.summary.unreadCount - delta),
            },
            threads: prev.threads.map((item) =>
              item.id === thread.id ? { ...item, unreadCount: 0 } : item,
            ),
          };
        });
      }
      mutateAdminCache<AdminOverviewPayload>(ADMIN_CACHE_KEYS.overview, (prev) => {
        if (!prev?.whatsappInboxSummary) return prev;
        return {
          ...prev,
          whatsappInboxSummary: {
            ...prev.whatsappInboxSummary,
            unreadCount: Math.max(0, prev.whatsappInboxSummary.unreadCount - delta),
          },
        };
      });

      try {
        await fetch(
          `/api/admin/whatsapp/threads/${encodeURIComponent(thread.id)}/read`,
          { method: 'POST' },
        );
        void refreshOverviewRef.current?.();
      } catch {
        lastMarkedReadKeyRef.current = '';
      }
    },
    [threadsKey],
  );

  useEffect(() => {
    if (!enabled || activeTab !== 'mensajes' || !selectedThreadId) return;
    const selected = threads.find((item) => item.id === selectedThreadId);
    if (selected && selected.unreadCount > 0) {
      void markThreadReadOptimistic(selected);
    }
  }, [activeTab, enabled, markThreadReadOptimistic, selectedThreadId, threads]);

  const revalidateThreadsRef = useRef(threadsQuery.revalidate);
  const revalidateDetailRef = useRef(detailQuery.revalidate);
  const revalidateRemindersRef = useRef(remindersQuery.revalidate);

  useEffect(() => {
    revalidateThreadsRef.current = threadsQuery.revalidate;
    revalidateDetailRef.current = detailQuery.revalidate;
    revalidateRemindersRef.current = remindersQuery.revalidate;
  }, [detailQuery.revalidate, remindersQuery.revalidate, threadsQuery.revalidate]);

  useEffect(() => {
    if (!enabled || pollIntervalMs <= 0 || typeof window === 'undefined') return;

    const triggerRefresh = () => {
      if (document.visibilityState !== 'visible') return;
      void revalidateThreadsRef.current();
      if (activeTab === 'mensajes' && selectedThreadId) {
        void revalidateDetailRef.current();
      } else if (activeTab === 'recordatorios') {
        void revalidateRemindersRef.current();
      }
    };

    const intervalId = window.setInterval(triggerRefresh, pollIntervalMs);
    document.addEventListener('visibilitychange', triggerRefresh);
    return () => {
      window.clearInterval(intervalId);
      document.removeEventListener('visibilitychange', triggerRefresh);
    };
  }, [activeTab, enabled, pollIntervalMs, selectedThreadId]);

  const syncUrlParams = useCallback(
    (next: { tab?: WhatsAppTabId; filter?: string | null }) => {
      const targetTab = next.tab ?? activeTab;
      const targetFilter: WhatsAppFilterParam | undefined =
        next.filter === 'unread' ||
        next.filter === 'window_open' ||
        next.filter === 'failed'
          ? next.filter
          : undefined;
      const nextUrl = whatsappHref({
        tab: targetTab !== 'mensajes' ? targetTab : undefined,
        filter: targetFilter,
      });
      const nextSig = `${targetTab === 'mensajes' ? '' : targetTab}||||${
        targetFilter ?? ''
      }`;
      setExpectedUrlSignature(nextSig);
      router.replace(nextUrl, { scroll: false });
    },
    [activeTab, router],
  );

  const setActiveTab = useCallback(
    (nextTab: WhatsAppTabId) => {
      setActiveTabState(nextTab);
      syncUrlParams({ tab: nextTab, filter: nextTab === 'mensajes' ? filter : null });
    },
    [filter, syncUrlParams],
  );

  const setFilter = useCallback(
    (nextFilter: WhatsAppThreadFilter) => {
      setFilterState(nextFilter);
      if (activeTab === 'mensajes') {
        syncUrlParams({ tab: 'mensajes', filter: nextFilter });
      }
    },
    [activeTab, syncUrlParams],
  );

  const setSelectedThreadId = useCallback((threadId: string | null) => {
    setSelectedThreadIdState(threadId);
    if (!threadId) {
      setContextBookingId(null);
    }
  }, []);

  const clearNewChatPrefill = useCallback(() => {
    setNewChatPrefill(null);
  }, []);

  const dismissBanner = useCallback(() => {
    setBanner(null);
  }, []);

  const openThreadByPhone = useCallback(
    (phone: string, options?: { clientName?: string | null; bookingId?: string | null }) => {
      const canonical = canonicalizeWhatsAppPhoneE164(phone) || phone.trim();
      setActiveTabState('mensajes');
      setContextBookingId(options?.bookingId ?? null);

      const matched = findMatchingThreadByTarget(threads, { phone: canonical });
      if (matched) {
        setSelectedThreadIdState(matched.id);
        setNewChatPrefill(null);
        setPendingTarget(null);
        syncUrlParams({ tab: 'mensajes', filter });
        return;
      }

      setFilterState('all');
      setSearchQuery('');
      setDebouncedSearch('');
      setPendingTarget({
        phone: canonical,
        clientId: '',
        clientName: options?.clientName ?? undefined,
        bookingId: options?.bookingId ?? null,
      });
      syncUrlParams({ tab: 'mensajes', filter: 'all' });
    },
    [filter, syncUrlParams, threads],
  );

  const refreshThreads = useCallback(() => {
    void threadsQuery.revalidate();
    if (selectedThreadId) {
      void detailQuery.revalidate();
    }
  }, [detailQuery, selectedThreadId, threadsQuery]);

  const refreshReminders = useCallback(() => {
    void remindersQuery.revalidate();
  }, [remindersQuery]);

  const refreshSettings = useCallback(() => {
    void settingsQuery.revalidate();
  }, [settingsQuery]);

  const refreshAll = useCallback(() => {
    void threadsQuery.revalidate();
    if (selectedThreadId) void detailQuery.revalidate();
    if (activeTab === 'recordatorios') void remindersQuery.revalidate();
    if (activeTab === 'conexion') void settingsQuery.revalidate();
    void refreshOverviewRef.current?.();
  }, [activeTab, detailQuery, remindersQuery, selectedThreadId, settingsQuery, threadsQuery]);

  const refreshLiveMeta = useCallback(async () => {
    if (isCheckingLive) return;
    setIsCheckingLive(true);
    setBanner(null);
    try {
      const json = await fetchAdminJson<WhatsAppSettingsResponseDTO>(
        `${ADMIN_CACHE_KEYS.whatsappSettings}?live=1`,
      );
      settingsQuery.mutate(json);
      if (json.liveMeta?.ok) {
        setBanner({
          status: 'success',
          title: 'Conexión con WhatsApp Business verificada.',
        });
      } else if (json.liveMeta?.error) {
        setBanner({
          status: 'warning',
          title: 'No se pudo verificar el estado en vivo de Meta.',
          description: json.liveMeta.error,
        });
      }
    } catch (err: unknown) {
      setBanner({
        status: 'error',
        title:
          err instanceof Error
            ? err.message
            : 'No se pudo consultar la conexión con Meta.',
      });
    } finally {
      setIsCheckingLive(false);
    }
  }, [isCheckingLive, settingsQuery]);

  const sendMessage = useCallback(
    async (input: WhatsAppSendMessageInput): Promise<WhatsAppSendActionResult> => {
      if (isSending) {
        return { ok: false, error: 'Ya hay un envío en curso.' };
      }
      setIsSending(true);
      setBanner(null);
      try {
        const res = await fetch('/api/admin/whatsapp/send', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(input),
        });
        const json = (await res.json().catch(() => null)) as
          | (Partial<WhatsAppSendResponseDTO> & { error?: string; code?: string })
          | null;

        if (!res.ok || !json?.ok) {
          const errorText = json?.error || 'No se pudo enviar el mensaje por WhatsApp.';
          setBanner({
            status: res.status === 422 || res.status === 429 ? 'warning' : 'error',
            title: errorText,
            fallbackWaMeUrl: json?.fallbackWaMeUrl,
          });
          return {
            ok: false,
            error: errorText,
            code: json?.code,
            fallbackWaMeUrl: json?.fallbackWaMeUrl,
          };
        }

        const nextThreadId = json.thread?.id ?? selectedThreadId;
        if (nextThreadId) {
          setSelectedThreadIdState(nextThreadId);
        }
        setNewChatPrefill(null);

        if (json.message && nextThreadId) {
          const sentMsg = json.message;
          const updatedThread = json.thread;
          mutateAdminCache<WhatsAppThreadDetailResponseDTO>(
            ADMIN_CACHE_KEYS.whatsappThreadDetail(nextThreadId),
            (prev) => {
              if (!prev) return prev;
              const alreadyExists = prev.messages.some((m) => m.id === sentMsg.id);
              return {
                ...prev,
                thread: updatedThread ?? prev.thread,
                messages: alreadyExists ? prev.messages : [...prev.messages, sentMsg],
                quota: json.quota ?? prev.quota,
              };
            },
          );
        }

        invalidateAdminCache(ADMIN_CACHE_KEYS.whatsappThreadsBase);
        void threadsQuery.revalidate();
        if (nextThreadId) {
          void fetchAdminJson<WhatsAppThreadDetailResponseDTO>(
            ADMIN_CACHE_KEYS.whatsappThreadDetail(nextThreadId),
          )
            .then((fresh) => {
              mutateAdminCache(ADMIN_CACHE_KEYS.whatsappThreadDetail(nextThreadId), fresh);
            })
            .catch(() => undefined);
        }
        void refreshOverviewRef.current?.();

        if (json.deliveryMode === 'fallback_email_wame') {
          setBanner({
            status: 'warning',
            title: 'Mensaje registrado en modo respaldo.',
            description: 'Puedes abrir el chat directo en WhatsApp para entregarlo.',
            fallbackWaMeUrl: json.fallbackWaMeUrl,
          });
        }

        return {
          ok: true,
          threadId: nextThreadId ?? undefined,
          fallbackWaMeUrl: json.fallbackWaMeUrl,
        };
      } catch {
        const errorText = 'Sin conexión. No se pudo enviar el mensaje.';
        setBanner({ status: 'error', title: errorText });
        return { ok: false, error: errorText };
      } finally {
        setIsSending(false);
      }
    },
    [isSending, selectedThreadId, threadsQuery],
  );

  const retryMessage = useCallback(
    async (messageId: string): Promise<boolean> => {
      if (retryingMessageId) return false;
      setRetryingMessageId(messageId);
      setBanner(null);
      try {
        const res = await fetch(
          `/api/admin/whatsapp/messages/${encodeURIComponent(messageId)}/retry`,
          { method: 'POST' },
        );
        const json = (await res.json().catch(() => null)) as
          | (Partial<WhatsAppSendResponseDTO> & { error?: string; code?: string })
          | null;
        if (!res.ok || !json?.ok) {
          setBanner({
            status: res.status === 422 || res.status === 429 ? 'warning' : 'error',
            title: json?.error || 'No se pudo reintentar el envío.',
            fallbackWaMeUrl: json?.fallbackWaMeUrl,
          });
          return false;
        }
        setBanner({ status: 'success', title: 'Mensaje reenviado correctamente.' });
        invalidateAdminCache(ADMIN_CACHE_KEYS.whatsappThreadsBase);
        void threadsQuery.revalidate();
        if (selectedThreadId) void detailQuery.revalidate();
        void refreshOverviewRef.current?.();
        return true;
      } catch {
        setBanner({ status: 'error', title: 'Sin conexión al reintentar el mensaje.' });
        return false;
      } finally {
        setRetryingMessageId(null);
      }
    },
    [detailQuery, retryingMessageId, selectedThreadId, threadsQuery],
  );

  const runReminderAction = useCallback(
    async (action: WhatsAppRemindersActionInput): Promise<boolean> => {
      if (isSubmittingReminder) return false;
      setIsSubmittingReminder(true);
      setBanner(null);
      try {
        const res = await fetch('/api/admin/whatsapp/reminders', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(action),
        });
        const json = (await res.json().catch(() => null)) as {
          ok?: boolean;
          error?: string;
          message?: string;
          fallbackWaMeUrl?: string;
        } | null;
        if (!res.ok || json?.ok === false) {
          setBanner({
            status: 'error',
            title: json?.error || 'No se pudo completar la acción de recordatorios.',
            fallbackWaMeUrl: json?.fallbackWaMeUrl,
          });
          return false;
        }
        setBanner({
          status: 'success',
          title: json?.message || describeReminderActionSuccess(action),
          fallbackWaMeUrl: json?.fallbackWaMeUrl,
        });
        invalidateAdminCache(ADMIN_CACHE_KEYS.whatsappThreadsBase);
        void remindersQuery.revalidate();
        void threadsQuery.revalidate();
        void refreshOverviewRef.current?.();
        return true;
      } catch {
        setBanner({
          status: 'error',
          title: 'Sin conexión al actualizar los recordatorios.',
        });
        return false;
      } finally {
        setIsSubmittingReminder(false);
      }
    },
    [isSubmittingReminder, remindersQuery, threadsQuery],
  );

  const runSettingsAction = useCallback(
    async (action: WhatsAppSettingsActionInput): Promise<boolean> => {
      if (isSubmittingSettings) return false;
      setIsSubmittingSettings(true);
      setBanner(null);
      try {
        const res = await fetch('/api/admin/whatsapp/settings', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(action),
        });
        const json = (await res.json().catch(() => null)) as {
          ok?: boolean;
          error?: string;
          message?: string;
          fallbackWaMeUrl?: string;
        } | null;
        if (!res.ok || json?.ok === false) {
          setBanner({
            status: 'error',
            title: json?.error || 'No se pudo guardar la configuración de WhatsApp.',
            fallbackWaMeUrl: json?.fallbackWaMeUrl,
          });
          return false;
        }
        setBanner({
          status: 'success',
          title: json?.message || describeSettingsActionSuccess(action),
          fallbackWaMeUrl: json?.fallbackWaMeUrl,
        });
        void settingsQuery.revalidate();
        void refreshOverviewRef.current?.();
        if (action.action === 'sync_meta_templates') {
          void refreshLiveMeta();
        }
        return true;
      } catch {
        setBanner({
          status: 'error',
          title: 'Sin conexión al actualizar la configuración de WhatsApp.',
        });
        return false;
      } finally {
        setIsSubmittingSettings(false);
      }
    },
    [isSubmittingSettings, refreshLiveMeta, settingsQuery],
  );

  const runSimulation = useCallback(
    async (input: WhatsAppSimulateEventInput): Promise<boolean> => {
      if (isSimulating) return false;
      setIsSimulating(true);
      setBanner(null);
      try {
        const res = await fetch('/api/admin/whatsapp/simulate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(input),
        });
        const json = (await res.json().catch(() => null)) as
          | (WhatsAppSimulateResponseDTO & { error?: string })
          | null;
        if (!res.ok || !json?.ok) {
          setBanner({
            status: 'error',
            title: json?.error || 'No se pudo ejecutar la simulación.',
          });
          return false;
        }
        setSimulationResult(json);
        setBanner({
          status: 'success',
          title: json.sideEffectSummary || 'Evento de WhatsApp simulado correctamente.',
        });
        invalidateAdminCache(ADMIN_CACHE_KEYS.whatsappThreadsBase);
        void threadsQuery.revalidate();
        if (json.threadId) {
          void fetchAdminJson<WhatsAppThreadDetailResponseDTO>(
            ADMIN_CACHE_KEYS.whatsappThreadDetail(json.threadId),
          )
            .then((fresh) => {
              mutateAdminCache(ADMIN_CACHE_KEYS.whatsappThreadDetail(json.threadId!), fresh);
            })
            .catch(() => undefined);
        }
        void remindersQuery.revalidate();
        void refreshOverviewRef.current?.();
        return true;
      } catch {
        setBanner({ status: 'error', title: 'Sin conexión al ejecutar el simulador.' });
        return false;
      } finally {
        setIsSimulating(false);
      }
    },
    [isSimulating, remindersQuery, threadsQuery],
  );

  return {
    activeTab,
    setActiveTab,
    filter,
    setFilter,
    initialReminderFilter,
    searchQuery,
    setSearchQuery,
    selectedThreadId,
    setSelectedThreadId,
    contextBookingId,
    newChatPrefill,
    clearNewChatPrefill,
    threadsData: threadsQuery.data ?? null,
    threads,
    summary,
    threadDetail: detailQuery.data ?? null,
    remindersData: remindersQuery.data ?? null,
    settingsData: settingsQuery.data ?? null,
    simulationResult,
    isLoadingThreads: threadsQuery.isLoading,
    isLoadingDetail: detailQuery.isLoading,
    isLoadingReminders: remindersQuery.isLoading,
    isLoadingSettings: settingsQuery.isLoading,
    isSending,
    retryingMessageId,
    isSubmittingReminder,
    isSubmittingSettings,
    isCheckingLive,
    isSimulating,
    banner,
    dismissBanner,
    sendMessage,
    retryMessage,
    runReminderAction,
    runSettingsAction,
    runSimulation,
    refreshLiveMeta,
    refreshThreads,
    refreshReminders,
    refreshSettings,
    refreshAll,
    openThreadByPhone,
  };
}
